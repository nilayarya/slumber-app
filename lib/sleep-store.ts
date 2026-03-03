import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Platform, NativeModules } from "react-native";

const STORAGE_KEY = "slumber:sessions:v1";
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

function localDateFromISO(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeDateFromOnset(sleepOnset: string): string {
  const onset = new Date(sleepOnset);
  if (isNaN(onset.getTime())) return "";
  if (onset.getHours() < 12) {
    const prev = new Date(onset);
    prev.setDate(prev.getDate() - 1);
    return localDateFromISO(prev.toISOString());
  }
  return localDateFromISO(onset.toISOString());
}

async function loadRaw(): Promise<SleepSession[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SleepSession[];
  } catch {
    return [];
  }
}

async function loadAll(): Promise<SleepSession[]> {
  const sessions = await loadRaw();
  if (sessions.length === 0) return [];

  let needsSave = false;
  const corrected = sessions.map(s => {
    const correctDate = computeDateFromOnset(s.sleepOnset);
    if (correctDate && correctDate !== s.date) {
      needsSave = true;
      return { ...s, date: correctDate };
    }
    return s;
  });

  const byDate = new Map<string, SleepSession>();
  for (const s of corrected) {
    const existing = byDate.get(s.date);
    if (!existing) {
      byDate.set(s.date, s);
    } else if (s.source === "manual" && existing.source === "auto") {
      byDate.set(s.date, s);
    } else if (s.source === existing.source && s.updatedAt > existing.updatedAt) {
      byDate.set(s.date, s);
    }
  }

  const deduped = Array.from(byDate.values());
  if (needsSave || deduped.length !== sessions.length) {
    console.log(`[Slumber] Fixed ${needsSave ? "dates" : ""}${needsSave && deduped.length !== sessions.length ? " and " : ""}${deduped.length !== sessions.length ? "duplicates" : ""} (${sessions.length} → ${deduped.length} sessions)`);
    await saveAll(deduped);
  }

  return deduped;
}

async function syncToWidget(json: string): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const { WidgetSyncModule } = NativeModules;
    if (WidgetSyncModule) {
      WidgetSyncModule.syncData(STORAGE_KEY, json, APP_GROUP);
    }
  } catch {}
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
  const date = computeDateFromOnset(input.sleepOnset) || input.date || localDateFromISO(onset.toISOString());
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

  const newDate = computeDateFromOnset(sleepOnset) || existing.date;

  const updated: SleepSession = {
    ...existing,
    date: newDate,
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
