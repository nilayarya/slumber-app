import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
import {
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  initialWidgetSync,
  migrateSessionDates,
  type SleepSession,
  type CreateSessionInput,
} from "./sleep-store";
import { syncSleepFromSteps, isHealthKitAvailable, type SyncResult } from "./health-sync";

interface SleepContextValue {
  sessions: SleepSession[];
  isLoading: boolean;
  lastSyncResult: SyncResult | null;
  refresh: () => Promise<void>;
  syncNow: () => Promise<SyncResult>;
  addSession: (input: CreateSessionInput) => Promise<SleepSession>;
  editSession: (id: string, input: Partial<CreateSessionInput>) => Promise<SleepSession | null>;
  removeSession: (id: string) => Promise<void>;
  clearSyncResult: () => void;
}

const SleepContext = createContext<SleepContextValue | null>(null);

export function SleepProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SleepSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const hasInitialSynced = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSessions();
      setSessions(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    migrateSessionDates().then(() => {
      load();
      if (Platform.OS === "ios") {
        initialWidgetSync();
      }
    });
  }, [load]);

  const syncNow = useCallback(async (): Promise<SyncResult> => {
    if (!isHealthKitAvailable()) {
      return { imported: 0, skipped: 0, error: "Only available on iPhone" };
    }
    console.log("[Slumber] Running step-based sleep sync...");
    const result = await syncSleepFromSteps(7);
    setLastSyncResult(result);
    if (result.imported > 0) {
      await load();
    }
    return result;
  }, [load]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (hasInitialSynced.current) return;
    if (isLoading) return;

    hasInitialSynced.current = true;
    syncNow();
  }, [isLoading, syncNow]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        console.log("[Slumber] App foregrounded — syncing step data...");
        syncNow();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, [syncNow]);

  const addSession = useCallback(async (input: CreateSessionInput) => {
    const session = await createSession(input);
    await load();
    return session;
  }, [load]);

  const editSession = useCallback(async (id: string, input: Partial<CreateSessionInput>) => {
    const session = await updateSession(id, input);
    await load();
    return session;
  }, [load]);

  const removeSession = useCallback(async (id: string) => {
    await deleteSession(id);
    await load();
    if (isHealthKitAvailable()) {
      syncNow();
    }
  }, [load, syncNow]);

  const clearSyncResult = useCallback(() => {
    setLastSyncResult(null);
  }, []);

  const value = useMemo(() => ({
    sessions,
    isLoading,
    lastSyncResult,
    refresh: load,
    syncNow,
    addSession,
    editSession,
    removeSession,
    clearSyncResult,
  }), [sessions, isLoading, lastSyncResult, load, syncNow, addSession, editSession, removeSession, clearSyncResult]);

  return <SleepContext.Provider value={value}>{children}</SleepContext.Provider>;
}

export function useSleep() {
  const ctx = useContext(SleepContext);
  if (!ctx) throw new Error("useSleep must be used within SleepProvider");
  return ctx;
}
