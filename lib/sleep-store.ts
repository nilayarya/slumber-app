import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform, NativeModules } from "react-native";

const STORAGE_KEY = "slumber:sessions:v1";
const MIGRATION_KEY = "slumber:migrated:date-fix-v1";
const APP_GROUP = "group.com.slumber.sleeptracker";

export type SleepSession = {
  id: string;
  date: string;
  sleepOnset: string;
  wakeTime: string;
  durationMinutes: number;
  qualityScore: number;
  notes: string | null;
  source: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
};

function computeQuality(durationMinutes: number): number {
  const durationPts = Math.min(70, Math.round((Math.min(durationMinutes, 540) / 540) * 70));
  const consistencyPts = durationMinutes >= 360 && durationMinutes <= 600 ? 30 : 15;
  return Math.min(100, durationPts + consistencyPts);
}

async function loadAll(): Promise<SleepSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SleepSession[];
  } catch {
    return [];
  }
}

async function syncToWidget(json: string): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const { WidgetSyncModule } = NativeModules;
    if (WidgetSyncModule) {
      WidgetSyncModule.syncData(STORAGE_KEY, json, APP_GROUP);
    }
  } catch {
    // Widget sync is best-effort
  }
}

async function saveAll(sessions: SleepSession[]): Promise<void> {
  const json = JSON.stringify(sessions);
  await AsyncStorage.setItem(STORAGE_KEY, json);
  syncToWidget(json);
}

export async function initialWidgetSync(): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) {
    syncToWidget(raw);
  }
}

function correctDateFromOnset(sleepOnset: string): string {
  const onset = new Date(sleepOnset);
  if (isNaN(onset.getTime())) return "";
  const h = onset.getHours();
  if (h < 12) {
    const prev = new Date(onset);
    prev.setDate(prev.getDate() - 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
  }
  return `${onset.getFullYear()}-${String(onset.getMonth() + 1).padStart(2, "0")}-${String(onset.getDate()).padStart(2, "0")}`;
}

export async function migrateSessionDates(): Promise<void> {
  const already = await AsyncStorage.getItem(MIGRATION_KEY);
  if (already) return;

  const all = await loadAll();
  if (all.length === 0) {
    await AsyncStorage.setItem(MIGRATION_KEY, "1");
    return;
  }

  let changed = false;
  const seen = new Set<string>();
  const fixed: SleepSession[] = [];

  for (const s of all) {
    const correctDate = correctDateFromOnset(s.sleepOnset);
    if (!correctDate) {
      fixed.push(s);
      seen.add(s.date);
      continue;
    }

    if (correctDate !== s.date) {
      changed = true;
      console.log(`[Slumber] Migration: session ${s.id} date ${s.date} → ${correctDate}`);
    }

    if (seen.has(correctDate)) {
      const existing = fixed.find(f => f.date === correctDate);
      if (existing && s.source === "manual" && existing.source === "auto") {
        const idx = fixed.indexOf(existing);
        fixed[idx] = { ...s, date: correctDate };
      } else if (existing && s.updatedAt > existing.updatedAt) {
        const idx = fixed.indexOf(existing);
        fixed[idx] = { ...s, date: correctDate };
      }
    } else {
      seen.add(correctDate);
      fixed.push({ ...s, date: correctDate });
    }
  }

  if (changed) {
    console.log(`[Slumber] Migration: fixed ${all.length - fixed.length} duplicate(s), updated dates`);
    await saveAll(fixed);
  }

  await AsyncStorage.setItem(MIGRATION_KEY, "1");
}

export async function getSessions(limit = 90): Promise<SleepSession[]> {
  const all = await loadAll();
  return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export async function getSessionsByRange(from: string, to: string): Promise<SleepSession[]> {
  const all = await loadAll();
  return all.filter(s => s.date >= from && s.date <= to).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getSessionByDate(date: string): Promise<SleepSession | null> {
  const all = await loadAll();
  return all.find(s => s.date === date) ?? null;
}

function sessionDateFromLock(lockTime: Date): string {
  const y = lockTime.getFullYear();
  const m = String(lockTime.getMonth() + 1).padStart(2, "0");
  const d = String(lockTime.getDate()).padStart(2, "0");
  if (lockTime.getHours() < 12) {
    const prev = new Date(lockTime);
    prev.setDate(prev.getDate() - 1);
    const py = prev.getFullYear();
    const pm = String(prev.getMonth() + 1).padStart(2, "0");
    const pd = String(prev.getDate()).padStart(2, "0");
    return `${py}-${pm}-${pd}`;
  }
  return `${y}-${m}-${d}`;
}

export type CreateSessionInput = {
  date?: string;
  sleepOnset: string;
  wakeTime: string;
  notes?: string | null;
  source?: "auto" | "manual";
};

export async function createSession(input: CreateSessionInput): Promise<SleepSession> {
  const all = await loadAll();

  const onset = new Date(input.sleepOnset);
  const wake = new Date(input.wakeTime);
  const date = input.date ?? sessionDateFromLock(onset);
  const durationMinutes = Math.round((wake.getTime() - onset.getTime()) / 60_000);
  const qualityScore = computeQuality(Math.max(0, durationMinutes));

  const filtered = all.filter(s => s.date !== date);

  const now = new Date().toISOString();
  const session: SleepSession = {
    id: Crypto.randomUUID(),
    date,
    sleepOnset: input.sleepOnset,
    wakeTime: input.wakeTime,
    durationMinutes,
    qualityScore,
    notes: input.notes ?? null,
    source: input.source ?? "manual",
    createdAt: now,
    updatedAt: now,
  };

  await saveAll([...filtered, session]);
  return session;
}

export async function updateSession(id: string, input: Partial<CreateSessionInput>): Promise<SleepSession | null> {
  const all = await loadAll();
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return null;

  const existing = all[idx];
  const sleepOnset = input.sleepOnset ?? existing.sleepOnset;
  const wakeTime = input.wakeTime ?? existing.wakeTime;
  const durationMinutes = Math.round(
    (new Date(wakeTime).getTime() - new Date(sleepOnset).getTime()) / 60_000
  );

  const updated: SleepSession = {
    ...existing,
    ...(input.date && { date: input.date }),
    sleepOnset,
    wakeTime,
    durationMinutes,
    qualityScore: computeQuality(Math.max(0, durationMinutes)),
    notes: "notes" in input ? input.notes ?? null : existing.notes,
    source: input.source ?? existing.source,
    updatedAt: new Date().toISOString(),
  };

  all[idx] = updated;
  await saveAll(all);
  return updated;
}

export async function deleteSession(id: string): Promise<boolean> {
  const all = await loadAll();
  const filtered = all.filter(s => s.id !== id);
  if (filtered.length === all.length) return false;
  await saveAll(filtered);
  return true;
}
