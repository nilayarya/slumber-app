import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Rect, Line, Circle, Defs, LinearGradient as SvgGradient, Stop, Text as SvgText, Polyline, G } from "react-native-svg";
import Colors from "@/constants/colors";
import { useSleep } from "@/lib/sleep-context";
import {
  getWeekRange,
  getMonthRange,
  localDateString,
} from "@/lib/sleep-utils";
import type { SleepSession } from "@/lib/sleep-store";

const C = Colors.dark;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
type Period = "week" | "month";

function PeriodToggle({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <View style={styles.toggle}>
      {(["week", "month"] as Period[]).map(p => (
        <Pressable key={p} style={styles.toggleBtn} onPress={() => onChange(p)}>
          {value === p && (
            <LinearGradient
              colors={[C.accent, C.accentViolet]}
              style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          )}
          <Text style={[styles.toggleText, value === p && styles.toggleTextActive]}>
            {p === "week" ? "Week" : "Month"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function BarChart({ sessions, period }: { sessions: SleepSession[]; period: Period }) {
  const cw = SCREEN_WIDTH - 88;
  const barPadH = 4;
  const innerW = cw - barPadH * 2;
  const ch = 130;
  const count = period === "week" ? 7 : 30;
  const gap = period === "week" ? 6 : 3;
  const barW = (innerW - gap * (count - 1)) / count;
  const maxM = 600;
  const targetM = 480;

  const now = new Date();
  const range = period === "week" ? getWeekRange(now) : getMonthRange(now);
  const start = new Date(range.start + "T12:00:00");

  const days = Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ds = localDateString(d);
    const session = sessions.find(s => s.date === ds);
    return { ds, session, isToday: ds === localDateString(new Date()) };
  });

  const targetY = ch - (targetM / maxM) * ch;

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>Sleep Duration</Text>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.accent }]} />
          <Text style={styles.legendText}>Duration</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.goodGreen }]} />
          <Text style={styles.legendText}>8h goal</Text>
        </View>
      </View>
      <Svg width={cw} height={ch + 22}>
        <Defs>
          <SvgGradient id="barG" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.accent} stopOpacity="1" />
            <Stop offset="1" stopColor={C.accentViolet} stopOpacity="0.6" />
          </SvgGradient>
        </Defs>
        <Line x1={barPadH} y1={targetY} x2={cw - barPadH} y2={targetY} stroke={C.goodGreen} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
        {days.map(({ ds, session, isToday }, i) => {
          const dur = session?.durationMinutes ?? 0;
          const bh = dur > 0 ? Math.min((dur / maxM) * ch, ch) : 3;
          const x = barPadH + i * (barW + gap);
          const y = dur > 0 ? ch - bh : ch - 3;
          return (
            <React.Fragment key={ds}>
              <Rect
                x={x} y={y}
                width={barW} height={bh}
                rx={barW / 3}
                fill={dur > 0 ? "url(#barG)" : C.divider}
                opacity={isToday ? 1 : dur > 0 ? 0.85 : 0.4}
              />
              {period === "week" && (
                <SvgText x={x + barW / 2} y={ch + 17} fontSize={10} fill={isToday ? C.accent : C.textMuted} textAnchor="middle">
                  {new Date(ds + "T12:00:00").toLocaleDateString([], { weekday: "narrow" })}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function WakeUpChart({ sessions }: { sessions: SleepSession[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);
  const cw = SCREEN_WIDTH - 88;
  const leftPad = 28;
  const rightPad = 14;
  const topPad = 10;
  const bottomPad = 24;
  const plotW = cw - leftPad - rightPad;
  const plotH = 120;
  const totalH = plotH + topPad + bottomPad;

  const now = new Date();
  const range = getWeekRange(now);
  const start = new Date(range.start + "T12:00:00");

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ds = localDateString(d);
    const session = sessions.find(s => s.date === ds);
    let wakeHr: number | null = null;
    if (session?.wakeTime) {
      const w = new Date(session.wakeTime);
      wakeHr = w.getHours() + w.getMinutes() / 60;
    }
    return { ds, dayLabel: SHORT_DAYS[d.getDay()], wakeHr, session };
  });

  const wakeHours = weekDays.map(d => d.wakeHr).filter((h): h is number => h != null);
  const dataMin = wakeHours.length > 0 ? Math.min(...wakeHours) : 7;
  const dataMax = wakeHours.length > 0 ? Math.max(...wakeHours) : 9;
  const WAKE_MIN_HOUR = Math.floor(Math.max(0, dataMin - 1));
  const WAKE_MAX_HOUR = Math.ceil(Math.min(24, dataMax + 1));
  const WAKE_HOUR_RANGE = Math.max(WAKE_MAX_HOUR - WAKE_MIN_HOUR, 2);

  const validPts = weekDays
    .map((d, i) => {
      if (d.wakeHr == null) return null;
      const x = leftPad + (i / 6) * plotW;
      const yFrac = (d.wakeHr - WAKE_MIN_HOUR) / WAKE_HOUR_RANGE;
      const y = topPad + yFrac * plotH;
      const wt = new Date(d.session!.wakeTime!);
      const hrs = wt.getHours();
      const mins = wt.getMinutes();
      const ampm = hrs >= 12 ? "PM" : "AM";
      const h12 = hrs % 12 || 12;
      const label = `${h12}:${mins.toString().padStart(2, "0")} ${ampm}`;
      return { x, y, label, idx: i };
    })
    .filter(Boolean) as { x: number; y: number; label: string; idx: number }[];

  const polylinePoints = validPts.map(p => `${p.x},${p.y}`).join(" ");

  const hourLines = [];
  for (let h = WAKE_MIN_HOUR; h <= WAKE_MAX_HOUR; h++) {
    const yFrac = (h - WAKE_MIN_HOUR) / WAKE_HOUR_RANGE;
    const y = topPad + yFrac * plotH;
    hourLines.push({ h, y, isHalf: false });
  }

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>Wake-Up Times</Text>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: C.wakeAmber }]} />
          <Text style={styles.legendText}>Wake time</Text>
        </View>
      </View>
      {validPts.length < 1 ? (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 6 }}>
          <Ionicons name="time-outline" size={28} color={C.textMuted} />
          <Text style={{ fontFamily: "DM_Sans_500Medium", fontSize: 14, color: C.textSecondary }}>No wake times this week</Text>
          <Text style={{ fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textMuted, textAlign: "center" }}>Your wake-up pattern will appear here as sleep is logged</Text>
        </View>
      ) : (<View>
        <Svg width={cw} height={totalH}>
          {hourLines.map((line, i) => (
            <React.Fragment key={`hl-${i}`}>
              <Line
                x1={leftPad}
                y1={line.y}
                x2={cw - rightPad}
                y2={line.y}
                stroke={C.textMuted}
                strokeWidth={0.7}
                opacity={0.15}
              />
              <SvgText
                x={leftPad - 6}
                y={line.y + 4}
                fontSize={10}
                fill={C.textMuted}
                textAnchor="end"
                opacity={0.7}
              >
                {line.h <= 12
                  ? `${line.h === 0 ? 12 : line.h}${line.h < 12 ? "a" : "p"}`
                  : `${line.h - 12}p`}
              </SvgText>
            </React.Fragment>
          ))}

          {weekDays.map((d, i) => {
            const x = leftPad + (i / 6) * plotW;
            return (
              <SvgText
                key={`dl-${i}`}
                x={x}
                y={totalH - 4}
                fontSize={11}
                fill={C.textSecondary}
                textAnchor="middle"
                fontWeight="500"
              >
                {d.dayLabel}
              </SvgText>
            );
          })}

          {validPts.length >= 2 && (
            <Polyline
              points={polylinePoints}
              fill="none"
              stroke={C.wakeAmber}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.9}
            />
          )}

          {validPts.map((pt, i) => (
            <Circle
              key={`pt-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={6}
              fill={C.wakeAmber}
              stroke={C.card}
              strokeWidth={2.5}
            />
          ))}
        </Svg>

        {validPts.map((pt, i) => (
          <Pressable
            key={`ph-${i}`}
            onPress={() => {
              setTooltip(
                tooltip && tooltip.x === pt.x ? null : { x: pt.x, y: pt.y, label: pt.label }
              );
            }}
            style={{
              position: "absolute",
              left: pt.x - 16,
              top: pt.y - 16,
              width: 32,
              height: 32,
              borderRadius: 16,
            }}
            hitSlop={6}
          />
        ))}

        {tooltip && (
          <View
            style={[
              styles.wakeTooltip,
              {
                left: Math.min(Math.max(tooltip.x - 36, 4), cw - 76),
                top: tooltip.y - 38,
              },
            ]}
          >
            <Text style={styles.wakeTooltipText}>{tooltip.label}</Text>
            <View style={styles.wakeTooltipArrow} />
          </View>
        )}
      </View>)}
    </View>
  );
}

export default function GraphsScreen() {
  const [period, setPeriod] = useState<Period>("week");
  const { sessions } = useSleep();

  const now = new Date();
  const range = period === "week" ? getWeekRange(now) : getMonthRange(now);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Insights</Text>
          <PeriodToggle value={period} onChange={setPeriod} />
        </View>

        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bar-chart-outline" size={40} color={C.textMuted} />
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptySub}>Log a few nights of sleep to see your patterns here</Text>
          </View>
        ) : (
          <>
            <WakeUpChart sessions={sessions} />
            <BarChart sessions={sessions} period={period} />
          </>
        )}

        <View style={{ height: Platform.OS === "web" ? 34 : 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, gap: 16 },
  headerTitle: { fontFamily: "DM_Sans_700Bold", fontSize: 28, color: C.text },
  toggle: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 4,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    minWidth: 80,
    alignItems: "center",
  },
  toggleText: { fontFamily: "DM_Sans_500Medium", fontSize: 14, color: C.textSecondary },
  toggleTextActive: { color: "#fff", fontFamily: "DM_Sans_600SemiBold" },
  chartCard: {
    marginHorizontal: 24,
    marginTop: 14,
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chartTitle: { fontFamily: "DM_Sans_600SemiBold", fontSize: 16, color: C.text, marginBottom: 10 },
  legend: { flexDirection: "row", gap: 16, marginBottom: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textSecondary },
  wakeTooltip: {
    position: "absolute",
    backgroundColor: C.text,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: "center",
    zIndex: 10,
  },
  wakeTooltipText: {
    fontFamily: "DM_Sans_600SemiBold",
    fontSize: 13,
    color: C.background,
  },
  wakeTooltipArrow: {
    position: "absolute",
    bottom: -5,
    width: 10,
    height: 10,
    backgroundColor: C.text,
    transform: [{ rotate: "45deg" }],
    alignSelf: "center",
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontFamily: "DM_Sans_600SemiBold", fontSize: 20, color: C.textSecondary },
  emptySub: { fontFamily: "DM_Sans_400Regular", fontSize: 14, color: C.textMuted, textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
});
