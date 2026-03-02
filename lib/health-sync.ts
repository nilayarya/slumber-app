import { Platform } from "react-native";
import { createSession, getSessions, getSessionByDate } from "./sleep-store";

const isIOS = Platform.OS === "ios";
const MIN_SLEEP_HOURS = 4;

let _hkModule: any = null;
let _loadAttempted = false;
let _lastError: string | null = null;
let _authorized = false;

function getHK(): any {
  if (!isIOS) return null;
  if (_hkModule) return _hkModule;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  try {
    const mod = require("@kingstinct/react-native-healthkit");
    _hkModule = mod.default || mod;
    console.log("[Slumber] HealthKit module loaded");
    return _hkModule;
  } catch (e: any) {
    console.warn("[Slumber] Failed to load HealthKit module:", e?.message || e);
    _lastError = `Module load failed: ${e?.message || e}`;
    return null;
  }
}

export type SyncResult = {
  imported: number;
  skipped: number;
  error?: string;
};

const READ_TYPES = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierEnvironmentalAudioExposure",
  "HKQuantityTypeIdentifierHeadphoneAudioExposure",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
];

async function requestPermissions(): Promise<{ success: boolean; error?: string }> {
  const HK = getHK();
  if (!HK) return { success: false, error: _lastError || "HealthKit not available" };
  if (_authorized) return { success: true };

  try {
    const available = typeof HK.isHealthDataAvailable === "function"
      ? HK.isHealthDataAvailable() : true;
    if (!available) return { success: false, error: "HealthKit not available on this device" };
  } catch {}

  try {
    console.log("[Slumber] Requesting HealthKit permissions for multi-signal analysis...");
    await HK.requestAuthorization({ toRead: READ_TYPES, toWrite: [] });
    _authorized = true;
    console.log("[Slumber] HealthKit permissions granted");
    return { success: true };
  } catch (e: any) {
    console.warn("[Slumber] HealthKit auth failed:", e?.message || e);
    return { success: false, error: `Permission denied: ${e?.message || e}` };
  }
}

type TimedSample = { startDate: Date; endDate: Date; quantity?: number };

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sessionDateFromSleep(onset: Date): string {
  if (onset.getHours() < 12) {
    const prev = new Date(onset);
    prev.setDate(prev.getDate() - 1);
    return localDateStr(prev);
  }
  return localDateStr(onset);
}

type CandidateGap = {
  start: Date;
  end: Date;
  durationMinutes: number;
};

const MICRO_STEP_THRESHOLD = 15;
const MERGE_BRIDGE_MAX_MIN = 30;

function findStepGaps(steps: TimedSample[]): CandidateGap[] {
  if (steps.length < 2) return [];
  const sorted = [...steps].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const rawGaps: (CandidateGap & { bridgeSteps?: number })[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = new Date(sorted[i].endDate);
    const gapEnd = new Date(sorted[i + 1].startDate);
    const gapMin = (gapEnd.getTime() - gapStart.getTime()) / 60_000;
    if (gapMin >= 20) {
      rawGaps.push({ start: gapStart, end: gapEnd, durationMinutes: Math.round(gapMin) });
    }
  }

  const now = new Date();
  if (sorted.length > 0) {
    const lastEnd = new Date(sorted[sorted.length - 1].endDate);
    const sinceMin = (now.getTime() - lastEnd.getTime()) / 60_000;
    if (sinceMin >= 20) {
      rawGaps.push({ start: lastEnd, end: now, durationMinutes: Math.round(sinceMin) });
    }
  }

  const merged: CandidateGap[] = [];
  let current: CandidateGap | null = null;

  for (const gap of rawGaps) {
    if (!current) {
      current = { ...gap };
      continue;
    }

    const bridgeStart = current.end;
    const bridgeEnd = gap.start;
    const bridgeMin = (bridgeEnd.getTime() - bridgeStart.getTime()) / 60_000;

    const bridgeSamples = sorted.filter(s => {
      const ss = new Date(s.startDate).getTime();
      return ss >= bridgeStart.getTime() && ss < bridgeEnd.getTime();
    });
    const bridgeStepCount = bridgeSamples.reduce((sum, s) => sum + (s.quantity ?? 0), 0);

    if (bridgeMin <= MERGE_BRIDGE_MAX_MIN && bridgeStepCount <= MICRO_STEP_THRESHOLD) {
      console.log(`[Slumber] Merging gaps across ${Math.round(bridgeMin)}min bridge with ${bridgeStepCount} steps (phone movement / bathroom)`);
      current = {
        start: current.start,
        end: gap.end,
        durationMinutes: Math.round((gap.end.getTime() - current.start.getTime()) / 60_000),
      };
    } else {
      if (current.durationMinutes >= MIN_SLEEP_HOURS * 60) {
        merged.push(current);
      }
      current = { ...gap };
    }
  }
  if (current && current.durationMinutes >= MIN_SLEEP_HOURS * 60) {
    merged.push(current);
  }

  return merged;
}

function samplesInRange(samples: TimedSample[], start: Date, end: Date): TimedSample[] {
  const s = start.getTime();
  const e = end.getTime();
  return samples.filter(sample => {
    const ss = new Date(sample.startDate).getTime();
    const se = new Date(sample.endDate).getTime();
    return ss < e && se > s;
  });
}

type SleepConfidence = {
  gap: CandidateGap;
  confidence: number;
  reasons: string[];
};

function isNighttimeGap(gap: CandidateGap): boolean {
  const startHour = gap.start.getHours();
  const endHour = gap.end.getHours();
  const startsEvening = startHour >= 19 || startHour <= 4;
  const endsMorning = endHour >= 4 && endHour <= 14;
  return startsEvening && endsMorning;
}

function detectSnoringPattern(envSamples: TimedSample[]): boolean {
  if (envSamples.length < 3) return false;
  const dbValues = envSamples.map(s => s.quantity ?? 0);
  const inSnoringRange = dbValues.filter(db => db >= 35 && db <= 65);
  if (inSnoringRange.length / dbValues.length < 0.5) return false;
  let fluctuations = 0;
  for (let i = 1; i < dbValues.length; i++) {
    const diff = Math.abs(dbValues[i] - dbValues[i - 1]);
    if (diff >= 3 && diff <= 20) fluctuations++;
  }
  const fluctuationRate = fluctuations / (dbValues.length - 1);
  return fluctuationRate >= 0.3;
}

function analyzeHeadphoneFadeout(
  headphoneSamples: TimedSample[],
  gapStart: Date,
  gapEnd: Date
): { fellAsleepListening: boolean; activeMinutes: number; totalMinutes: number } {
  const totalMinutes = (gapEnd.getTime() - gapStart.getTime()) / 60_000;
  if (headphoneSamples.length === 0) return { fellAsleepListening: false, activeMinutes: 0, totalMinutes };

  const sorted = [...headphoneSamples].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  const activeMinutes = sorted.reduce((sum, s) => {
    return sum + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000;
  }, 0);

  const lastSample = sorted[sorted.length - 1];
  const lastSampleEnd = new Date(lastSample.endDate).getTime();
  const gapEndMs = gapEnd.getTime();
  const silentTailMin = (gapEndMs - lastSampleEnd) / 60_000;

  const firstSample = sorted[0];
  const firstSampleStart = new Date(firstSample.startDate).getTime();
  const gapStartMs = gapStart.getTime();
  const offsetFromGapStart = (firstSampleStart - gapStartMs) / 60_000;

  const startsEarlyInGap = offsetFromGapStart < 60;
  const stopsBeforeEnd = silentTailMin > totalMinutes * 0.3;

  const fellAsleepListening = startsEarlyInGap && stopsBeforeEnd && activeMinutes < totalMinutes * 0.6;

  return { fellAsleepListening, activeMinutes, totalMinutes };
}

function scoreSleepConfidence(
  gap: CandidateGap,
  envAudio: TimedSample[],
  headphoneAudio: TimedSample[],
  walkingDistance: TimedSample[]
): SleepConfidence {
  let confidence = 0;
  const reasons: string[] = [];
  const durationHrs = gap.durationMinutes / 60;
  const nighttime = isNighttimeGap(gap);

  if (nighttime) {
    confidence += 30;
    reasons.push("nighttime window");
  } else if (durationHrs >= 5 && durationHrs <= 14) {
    confidence += 15;
    reasons.push("plausible duration");
  } else {
    confidence -= 10;
    reasons.push("unusual timing");
  }

  if (durationHrs >= 5 && durationHrs <= 12) {
    confidence += 15;
    reasons.push(`good duration (${durationHrs.toFixed(1)}h)`);
  } else if (durationHrs >= 4 && durationHrs <= 14) {
    confidence += 8;
    reasons.push(`acceptable duration (${durationHrs.toFixed(1)}h)`);
  } else {
    confidence -= 5;
    reasons.push(`unusual duration (${durationHrs.toFixed(1)}h)`);
  }

  confidence += 10;
  reasons.push("no steps");

  const envInGap = samplesInRange(envAudio, gap.start, gap.end);
  if (envInGap.length > 0) {
    const avgDb = envInGap.reduce((sum, s) => sum + (s.quantity ?? 0), 0) / envInGap.length;
    const highDbSamples = envInGap.filter(s => (s.quantity ?? 0) > 50).length;
    const highDbRatio = highDbSamples / envInGap.length;

    const sustainedMinutes = envInGap.reduce((sum, s) => {
      if ((s.quantity ?? 0) > 50) {
        return sum + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000;
      }
      return sum;
    }, 0);
    const sustainedRatio = sustainedMinutes / gap.durationMinutes;

    const isSnoringLikely = nighttime && detectSnoringPattern(envInGap);

    if (avgDb < 40) {
      confidence += 25;
      reasons.push(`very quiet (avg ${avgDb.toFixed(0)}dB)`);
    } else if (isSnoringLikely) {
      confidence += 20;
      reasons.push(`snoring pattern detected (avg ${avgDb.toFixed(0)}dB, fluctuating 35-65dB)`);
    } else if (avgDb < 50 && highDbRatio < 0.2) {
      confidence += 15;
      reasons.push(`quiet environment (avg ${avgDb.toFixed(0)}dB)`);
    } else if (nighttime && avgDb >= 40 && avgDb <= 65 && sustainedRatio < 0.6) {
      confidence += 5;
      reasons.push(`moderate nighttime audio — possible snoring (avg ${avgDb.toFixed(0)}dB)`);
    } else if (sustainedRatio > 0.4) {
      confidence -= 25;
      reasons.push(`sustained audio activity (avg ${avgDb.toFixed(0)}dB, ${Math.round(sustainedRatio * 100)}% active)`);
    } else if (avgDb >= 50 || highDbRatio >= 0.3) {
      confidence -= 15;
      reasons.push(`noisy environment (avg ${avgDb.toFixed(0)}dB, ${Math.round(highDbRatio * 100)}% loud)`);
    }
  } else {
    confidence += 0;
    reasons.push("no ambient audio data (neutral)");
  }

  const headphonesInGap = samplesInRange(headphoneAudio, gap.start, gap.end);
  const hpAnalysis = analyzeHeadphoneFadeout(headphonesInGap, gap.start, gap.end);

  if (headphonesInGap.length > 0) {
    const headphoneRatio = hpAnalysis.activeMinutes / gap.durationMinutes;

    if (hpAnalysis.fellAsleepListening && nighttime) {
      confidence += 10;
      reasons.push(`fell asleep to audio (${Math.round(hpAnalysis.activeMinutes)}min then silence — podcast/music fadeout)`);
    } else if (headphoneRatio > 0.7) {
      confidence -= 30;
      reasons.push(`headphones active most of gap (${Math.round(hpAnalysis.activeMinutes)}min / ${Math.round(hpAnalysis.totalMinutes)}min — likely awake)`);
    } else if (headphoneRatio > 0.4 && !nighttime) {
      confidence -= 25;
      reasons.push(`extended headphone use during day (${Math.round(hpAnalysis.activeMinutes)}min)`);
    } else if (headphoneRatio > 0.2) {
      confidence -= 10;
      reasons.push(`some headphone use (${Math.round(hpAnalysis.activeMinutes)}min)`);
    } else {
      confidence += 0;
      reasons.push("brief headphone use (neutral)");
    }
  } else {
    confidence += 0;
    reasons.push("no headphone audio (neutral)");
  }

  const walkInGap = samplesInRange(walkingDistance, gap.start, gap.end);
  if (walkInGap.length > 0) {
    const totalMeters = walkInGap.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
    if (totalMeters > 200) {
      confidence -= 15;
      reasons.push(`significant walking detected (${Math.round(totalMeters)}m)`);
    } else if (totalMeters > 50) {
      confidence -= 5;
      reasons.push(`minor walking (${Math.round(totalMeters)}m — bathroom trip)`);
    } else {
      confidence += 0;
      reasons.push(`negligible movement (${Math.round(totalMeters)}m)`);
    }
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return { gap, confidence, reasons };
}

const CONFIDENCE_THRESHOLD = 50;

export async function syncSleepFromSteps(daysBack = 7): Promise<SyncResult> {
  const permResult = await requestPermissions();
  if (!permResult.success) {
    return { imported: 0, skipped: 0, error: permResult.error };
  }

  const HK = getHK()!;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const endDate = new Date();

  let steps: TimedSample[] = [];
  let envAudio: TimedSample[] = [];
  let headphoneAudio: TimedSample[] = [];
  let walkingDistance: TimedSample[] = [];

  async function safeQuery(identifier: string, unit: string): Promise<TimedSample[]> {
    try {
      const shortName = identifier.replace("HKQuantityTypeIdentifier", "");
      try {
        const status = HK.authorizationStatusFor(identifier);
        console.log(`[Slumber] Auth status for ${shortName}: ${status}`);
      } catch {}

      const opts: any = { limit: -1, unit };
      if (startDate || endDate) {
        opts.filter = { date: {} as any };
        if (startDate) opts.filter.date.startDate = startDate;
        if (endDate) opts.filter.date.endDate = endDate;
      }

      console.log(`[Slumber] Querying ${shortName} with unit=${unit}, limit=-1...`);
      const result = await HK.queryQuantitySamples(identifier, opts);
      const arr = result ?? [];
      console.log(`[Slumber] ${shortName}: got ${arr.length} samples`);
      if (arr.length > 0) {
        const first = arr[0];
        console.log(`[Slumber] ${shortName} sample[0]: start=${first.startDate}, end=${first.endDate}, qty=${first.quantity}`);
      }
      return arr;
    } catch (e: any) {
      const shortName = identifier.replace("HKQuantityTypeIdentifier", "");
      console.warn(`[Slumber] Query failed for ${shortName}:`, e?.message || e);
      return [];
    }
  }

  try {
    console.log(`[Slumber] Querying multi-signal data for ${daysBack} days (${startDate.toISOString()} → ${endDate.toISOString()})...`);

    steps = await safeQuery("HKQuantityTypeIdentifierStepCount", "count");

    if (steps.length === 0) {
      console.log("[Slumber] No steps with date filter — trying without filter...");
      try {
        const allSteps = await HK.queryQuantitySamples("HKQuantityTypeIdentifierStepCount", {
          limit: 5,
          unit: "count",
          ascending: false,
        });
        console.log(`[Slumber] Without filter: got ${allSteps?.length ?? 0} steps`);
        if (allSteps && allSteps.length > 0) {
          console.log(`[Slumber] Most recent step: start=${allSteps[0].startDate}, end=${allSteps[0].endDate}, qty=${allSteps[0].quantity}`);
        }
      } catch (e: any) {
        console.warn("[Slumber] Fallback query also failed:", e?.message || e);
      }
    }

    const [env, hp, wd] = await Promise.all([
      safeQuery("HKQuantityTypeIdentifierEnvironmentalAudioExposure", "dBASPL"),
      safeQuery("HKQuantityTypeIdentifierHeadphoneAudioExposure", "dBASPL"),
      safeQuery("HKQuantityTypeIdentifierDistanceWalkingRunning", "m"),
    ]);
    envAudio = env;
    headphoneAudio = hp;
    walkingDistance = wd;

    console.log(`[Slumber] Final: ${steps.length} step samples, ${envAudio.length} env audio, ${headphoneAudio.length} headphone, ${walkingDistance.length} walking`);
  } catch (e: any) {
    console.warn("[Slumber] Query failed:", e?.message || e);
    return { imported: 0, skipped: 0, error: `Failed to read health data: ${e?.message || e}` };
  }

  if (steps.length < 2) {
    return {
      imported: 0, skipped: 0,
      error: steps.length === 0
        ? "No step data found. Please check:\n\n1. Open Settings → Privacy & Security → Health → Slumber and make sure Step Count is enabled\n\n2. Make sure you've been carrying your iPhone today so it can record steps\n\n3. If running on a simulator, HealthKit has no real data — use a physical iPhone"
        : undefined,
    };
  }

  const gaps = findStepGaps(steps);
  console.log(`[Slumber] Found ${gaps.length} step gaps of 4+ hours`);

  const scored = gaps.map(gap => scoreSleepConfidence(gap, envAudio, headphoneAudio, walkingDistance));

  scored.forEach(s => {
    console.log(`[Slumber] Gap ${s.gap.start.toLocaleTimeString()} → ${s.gap.end.toLocaleTimeString()} (${s.gap.durationMinutes}min): confidence=${s.confidence} [${s.reasons.join(", ")}]`);
  });

  const sleepPeriods = scored.filter(s => s.confidence >= CONFIDENCE_THRESHOLD);
  console.log(`[Slumber] ${sleepPeriods.length} gaps passed confidence threshold (${CONFIDENCE_THRESHOLD})`);

  let imported = 0;
  let skipped = 0;

  for (const period of sleepPeriods) {
    const date = sessionDateFromSleep(period.gap.start);
    const existing = await getSessionByDate(date);

    if (existing && existing.source === "manual") {
      skipped++;
      continue;
    }

    if (existing && existing.source === "auto") {
      if (Math.abs(existing.durationMinutes - period.gap.durationMinutes) < 30) {
        skipped++;
        continue;
      }
    }

    await createSession({
      date,
      sleepOnset: period.gap.start.toISOString(),
      wakeTime: period.gap.end.toISOString(),
      notes: `Auto-detected (confidence: ${period.confidence}%)`,
      source: "auto",
    });
    imported++;
  }

  console.log(`[Slumber] Sync complete: imported=${imported}, skipped=${skipped}`);
  return { imported, skipped };
}

export function isHealthKitAvailable(): boolean {
  return isIOS;
}

export function getHealthKitLoadError(): string | null {
  if (!isIOS) return "Only available on iPhone";
  getHK();
  return _lastError;
}

export type DebugReport = {
  timestamp: string;
  daysBack: number;
  healthKitAvailable: boolean;
  permissionStatus: string;
  sampleCounts: {
    steps: number;
    envAudio: number;
    headphoneAudio: number;
    walkingDistance: number;
  };
  stepSamplePreview: { start: string; end: string; qty: number }[];
  rawGaps: { start: string; end: string; durationMin: number }[];
  scoredGaps: {
    start: string;
    end: string;
    durationMin: number;
    confidence: number;
    passed: boolean;
    reasons: string[];
  }[];
  existingSessions: { date: string; source: string; duration: number }[];
  outcome: string;
  error?: string;
};

export async function generateDebugReport(daysBack = 7): Promise<DebugReport> {
  const report: DebugReport = {
    timestamp: new Date().toISOString(),
    daysBack,
    healthKitAvailable: isIOS,
    permissionStatus: "unknown",
    sampleCounts: { steps: 0, envAudio: 0, headphoneAudio: 0, walkingDistance: 0 },
    stepSamplePreview: [],
    rawGaps: [],
    scoredGaps: [],
    existingSessions: [],
    outcome: "",
  };

  if (!isIOS) {
    report.permissionStatus = "not_ios";
    report.outcome = "HealthKit not available (not iOS)";
    return report;
  }

  const permResult = await requestPermissions();
  report.permissionStatus = permResult.success ? "granted" : `denied: ${permResult.error}`;
  if (!permResult.success) {
    report.outcome = `Permission denied: ${permResult.error}`;
    report.error = permResult.error;
    return report;
  }

  const HK = getHK()!;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  const endDate = new Date();

  async function safeQueryDebug(identifier: string, unit: string): Promise<TimedSample[]> {
    try {
      const opts: any = { limit: -1, unit, filter: { date: { startDate, endDate } } };
      const result = await HK.queryQuantitySamples(identifier, opts);
      return result ?? [];
    } catch {
      return [];
    }
  }

  const steps = await safeQueryDebug("HKQuantityTypeIdentifierStepCount", "count");
  const envAudio = await safeQueryDebug("HKQuantityTypeIdentifierEnvironmentalAudioExposure", "dBASPL");
  const headphoneAudio = await safeQueryDebug("HKQuantityTypeIdentifierHeadphoneAudioExposure", "dBASPL");
  const walkingDistance = await safeQueryDebug("HKQuantityTypeIdentifierDistanceWalkingRunning", "m");

  report.sampleCounts = {
    steps: steps.length,
    envAudio: envAudio.length,
    headphoneAudio: headphoneAudio.length,
    walkingDistance: walkingDistance.length,
  };

  const sortedSteps = [...steps].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );
  report.stepSamplePreview = sortedSteps.slice(-20).map(s => ({
    start: new Date(s.startDate).toLocaleString(),
    end: new Date(s.endDate).toLocaleString(),
    qty: Math.round(s.quantity ?? 0),
  }));

  if (steps.length < 2) {
    report.outcome = `Not enough step data (${steps.length} samples). Need at least 2.`;
    return report;
  }

  const gaps = findStepGaps(steps);
  report.rawGaps = gaps.map(g => ({
    start: g.start.toLocaleString(),
    end: g.end.toLocaleString(),
    durationMin: g.durationMinutes,
  }));

  const scored = gaps.map(gap => scoreSleepConfidence(gap, envAudio, headphoneAudio, walkingDistance));

  const { getSessions } = require("./sleep-store");
  const existingSessions = await getSessions(90);
  report.existingSessions = existingSessions.map((s: any) => ({
    date: s.date,
    source: s.source,
    duration: s.durationMinutes,
  }));

  const existingDates = new Set(existingSessions.map((s: any) => s.date));

  report.scoredGaps = scored.map(s => {
    const date = sessionDateFromSleep(s.gap.start);
    const alreadyLogged = existingDates.has(date);
    return {
      start: s.gap.start.toLocaleString(),
      end: s.gap.end.toLocaleString(),
      durationMin: s.gap.durationMinutes,
      confidence: s.confidence,
      passed: s.confidence >= CONFIDENCE_THRESHOLD,
      reasons: [
        ...s.reasons,
        alreadyLogged ? `⚠️ date ${date} already has a session` : `✓ date ${date} is open`,
      ],
    };
  });

  const passed = scored.filter(s => s.confidence >= CONFIDENCE_THRESHOLD).length;
  report.outcome = `${gaps.length} gaps found → ${scored.length} scored → ${passed} passed threshold (≥${CONFIDENCE_THRESHOLD})`;

  return report;
}
