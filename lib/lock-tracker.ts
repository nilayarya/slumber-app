import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCK_KEY = "slumber:last_lock_time";
const MIN_SLEEP_HOURS = 4;
const MAX_STALE_HOURS = 24;

export type SleepDetection = {
  lockTime: string;
  unlockTime: string;
  durationMinutes: number;
};

async function getLastLockTime(): Promise<string | null> {
  return AsyncStorage.getItem(LOCK_KEY);
}

async function setLastLockTime(iso: string): Promise<void> {
  await AsyncStorage.setItem(LOCK_KEY, iso);
}

async function clearLastLockTime(): Promise<void> {
  await AsyncStorage.removeItem(LOCK_KEY);
}

function isPlausibleSleepWindow(lockTime: Date, unlockTime: Date): boolean {
  const lockHour = lockTime.getHours();
  const unlockHour = unlockTime.getHours();
  const durationHrs = (unlockTime.getTime() - lockTime.getTime()) / 3_600_000;

  if (durationHrs > MAX_STALE_HOURS) return false;

  const lockInEvening = lockHour >= 19 || lockHour <= 4;
  const unlockInMorning = unlockHour >= 4 && unlockHour <= 14;

  if (lockInEvening && unlockInMorning) return true;

  if (durationHrs >= 5 && durationHrs <= 14) return true;

  return false;
}

export async function checkForSleep(): Promise<SleepDetection | null> {
  const lockTimeStr = await getLastLockTime();
  if (!lockTimeStr) return null;

  const lockTime = new Date(lockTimeStr);
  const now = new Date();
  const diffMs = now.getTime() - lockTime.getTime();
  const diffMinutes = diffMs / 60_000;
  const diffHours = diffMinutes / 60;

  if (diffHours > MAX_STALE_HOURS) {
    console.log("[Slumber] Lock timestamp too old (>24h), discarding");
    await clearLastLockTime();
    return null;
  }

  if (diffMinutes >= MIN_SLEEP_HOURS * 60 && isPlausibleSleepWindow(lockTime, now)) {
    await clearLastLockTime();
    return {
      lockTime: lockTimeStr,
      unlockTime: now.toISOString(),
      durationMinutes: Math.round(diffMinutes),
    };
  }

  if (diffMinutes < MIN_SLEEP_HOURS * 60) {
    return null;
  }

  await clearLastLockTime();
  return null;
}

export function startLockTracking(onSleepDetected: (detection: SleepDetection) => void): () => void {
  let lastState: AppStateStatus = AppState.currentState;

  const handleChange = async (nextState: AppStateStatus) => {
    if (lastState === "active" && nextState === "background") {
      await setLastLockTime(new Date().toISOString());
      console.log("[Slumber] App backgrounded — timestamp saved");
    }

    if (lastState === "background" && nextState === "active") {
      console.log("[Slumber] App foregrounded — checking for sleep...");
      const detection = await checkForSleep();
      if (detection) {
        console.log(`[Slumber] Sleep detected: ${detection.durationMinutes} minutes`);
        onSleepDetected(detection);
      } else {
        console.log("[Slumber] No sleep detected");
      }
    }

    lastState = nextState;
  };

  const subscription = AppState.addEventListener("change", handleChange);

  return () => {
    subscription.remove();
  };
}
