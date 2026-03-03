import type { SleepSession } from "./sleep-store";
export type { SleepSession };

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString([], { weekday: "short" });
}

export function qualityLabel(score: number | null | undefined): string {
  if (!score) return "Unknown";
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

export function qualityColor(score: number | null | undefined): string {
  if (!score) return "#4A5578";
  if (score >= 85) return "#10B981";
  if (score >= 70) return "#6366F1";
  if (score >= 50) return "#F59E0B";
  return "#EF4444";
}

export function getWeekRange(date = new Date()): { start: string; end: string } {
  const end = new Date(date);
  const start = new Date(date);
  start.setDate(end.getDate() - 6);
  return {
    start: localDateString(start),
    end: localDateString(end),
  };
}

export function getMonthRange(date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: localDateString(start),
    end: localDateString(end),
  };
}

export function todayString(): string {
  return localDateString(new Date());
}

export function avgDuration(sessions: SleepSession[]): number {
  const valid = sessions.filter(s => s.durationMinutes != null);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((s, v) => s + (v.durationMinutes ?? 0), 0) / valid.length);
}

export function consistencyScore(sessions: SleepSession[]): number {
  const valid = sessions.filter(s => s.sleepOnset);
  if (valid.length < 2) return 100;
  const mins = valid.map(s => {
    const d = new Date(s.sleepOnset!);
    return d.getHours() * 60 + d.getMinutes();
  });
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
  const std = Math.sqrt(mins.reduce((s, m) => s + Math.pow(m - avg, 2), 0) / mins.length);
  return Math.max(0, Math.min(100, Math.round(100 - std / 3)));
}

export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
