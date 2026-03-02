import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useSleep } from "@/lib/sleep-context";
import {
  formatDuration,
  formatTime,
  formatDate,
  qualityColor,
  qualityLabel,
  localDateString,
} from "@/lib/sleep-utils";
import type { SleepSession } from "@/lib/sleep-store";
import { generateDebugReport, type DebugReport } from "@/lib/health-sync";

const C = Colors.dark;

// --- DEBUG PANEL (remove this entire block when no longer needed) ---
function DebugPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [report, setReport] = useState<DebugReport | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible && !report) {
      setLoading(true);
      generateDebugReport(7).then(r => {
        setReport(r);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [visible, report]);

  const refresh = useCallback(() => {
    setReport(null);
    setLoading(true);
    generateDebugReport(7).then(r => {
      setReport(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[debugStyles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
        <View style={debugStyles.header}>
          <Text style={debugStyles.title}>Debug Report</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={refresh} style={debugStyles.headerBtn}>
              <Ionicons name="refresh" size={18} color={C.accent} />
            </Pressable>
            <Pressable onPress={onClose} style={debugStyles.headerBtn}>
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </Pressable>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {loading && <Text style={debugStyles.mono}>Loading HealthKit data...</Text>}
          {report && (
            <>
              <Text style={debugStyles.sectionHead}>OVERVIEW</Text>
              <Text style={debugStyles.mono}>Generated: {report.timestamp}</Text>
              <Text style={debugStyles.mono}>HealthKit: {report.healthKitAvailable ? "YES" : "NO"}</Text>
              <Text style={debugStyles.mono}>Permission: {report.permissionStatus}</Text>
              <Text style={debugStyles.mono}>Days queried: {report.daysBack}</Text>

              <Text style={debugStyles.sectionHead}>SAMPLE COUNTS</Text>
              <Text style={debugStyles.mono}>Steps: {report.sampleCounts.steps}</Text>
              <Text style={debugStyles.mono}>Env Audio: {report.sampleCounts.envAudio}</Text>
              <Text style={debugStyles.mono}>Headphone Audio: {report.sampleCounts.headphoneAudio}</Text>
              <Text style={debugStyles.mono}>Walking Distance: {report.sampleCounts.walkingDistance}</Text>

              <Text style={debugStyles.sectionHead}>LAST 20 STEP SAMPLES</Text>
              {report.stepSamplePreview.length === 0 && (
                <Text style={debugStyles.mono}>No step samples found</Text>
              )}
              {report.stepSamplePreview.map((s, i) => (
                <Text key={i} style={debugStyles.mono}>
                  {s.start} → {s.end} ({s.qty} steps)
                </Text>
              ))}

              <Text style={debugStyles.sectionHead}>RAW GAPS (≥4h after merge)</Text>
              {report.rawGaps.length === 0 && (
                <Text style={debugStyles.mono}>No qualifying gaps found</Text>
              )}
              {report.rawGaps.map((g, i) => (
                <Text key={i} style={debugStyles.mono}>
                  {g.start} → {g.end}{"\n"}  Duration: {Math.floor(g.durationMin / 60)}h {g.durationMin % 60}m
                </Text>
              ))}

              <Text style={debugStyles.sectionHead}>SCORED GAPS (threshold ≥50)</Text>
              {report.scoredGaps.length === 0 && (
                <Text style={debugStyles.mono}>No gaps to score</Text>
              )}
              {report.scoredGaps.map((g, i) => (
                <View key={i} style={[debugStyles.gapCard, { borderLeftColor: g.passed ? "#10B981" : "#EF4444" }]}>
                  <Text style={[debugStyles.mono, { fontFamily: "DM_Sans_600SemiBold" }]}>
                    Confidence: {g.confidence} {g.passed ? "✅ PASS" : "❌ FAIL"}
                  </Text>
                  <Text style={debugStyles.mono}>
                    {g.start} → {g.end}
                  </Text>
                  <Text style={debugStyles.mono}>
                    Duration: {Math.floor(g.durationMin / 60)}h {g.durationMin % 60}m
                  </Text>
                  {g.reasons.map((r, j) => (
                    <Text key={j} style={[debugStyles.mono, { color: C.textMuted, marginLeft: 8 }]}>
                      • {r}
                    </Text>
                  ))}
                </View>
              ))}

              <Text style={debugStyles.sectionHead}>EXISTING SESSIONS</Text>
              {report.existingSessions.length === 0 && (
                <Text style={debugStyles.mono}>No sessions stored</Text>
              )}
              {report.existingSessions.map((s, i) => (
                <Text key={i} style={debugStyles.mono}>
                  {s.date} — {s.source} — {Math.floor(s.duration / 60)}h {s.duration % 60}m
                </Text>
              ))}

              <Text style={debugStyles.sectionHead}>OUTCOME</Text>
              <Text style={[debugStyles.mono, { fontFamily: "DM_Sans_600SemiBold", color: C.accent }]}>
                {report.outcome}
              </Text>
              {report.error && (
                <Text style={[debugStyles.mono, { color: C.danger }]}>Error: {report.error}</Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const debugStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0E1A" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)",
  },
  title: { fontFamily: "DM_Sans_700Bold", fontSize: 18, color: C.text },
  headerBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  sectionHead: {
    fontFamily: "DM_Sans_700Bold", fontSize: 11, color: C.accent,
    letterSpacing: 1.2, marginTop: 20, marginBottom: 6,
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11, color: C.textSecondary, lineHeight: 17, marginBottom: 2,
  },
  gapCard: {
    borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 8,
    marginBottom: 10, backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 6,
  },
});
// --- END DEBUG PANEL ---

function QualityRing({ score }: { score: number | null }) {
  const color = qualityColor(score);
  return (
    <View style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontFamily: "DM_Sans_700Bold", fontSize: 26, color: score ? color : C.textMuted }}>
          {score ?? "--"}
        </Text>
        <Text style={{ fontFamily: "DM_Sans_400Regular", fontSize: 10, color: C.textSecondary }}>
          {score ? qualityLabel(score) : "No data"}
        </Text>
      </View>
    </View>
  );
}

function StatRow({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={styles.statRow}>
      <Ionicons name={icon as any} size={15} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.statRowLabel}>{label}</Text>
        <Text style={[styles.statRowValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function SessionCard({
  session,
  onEdit,
  onDelete,
}: {
  session: SleepSession;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color = qualityColor(session.qualityScore);
  const isAuto = session.source === "auto";

  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.sessionCard}>
      <Pressable onPress={onEdit} style={{ flexDirection: "row", flex: 1 }}>
        <View style={[styles.qualityBar, { backgroundColor: color }]} />
        <View style={styles.sessionContent}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
              {isAuto && (
                <View style={styles.autoBadge}>
                  <Ionicons name="analytics-outline" size={9} color={C.accent} />
                  <Text style={styles.autoBadgeText}>Auto</Text>
                </View>
              )}
            </View>
            <Text style={styles.sessionTimes}>
              {formatTime(session.sleepOnset)} → {formatTime(session.wakeTime)}
            </Text>
          </View>
          <View style={styles.sessionRight}>
            <Text style={[styles.sessionDuration, { color }]}>{formatDuration(session.durationMinutes)}</Text>
            <Text style={styles.sessionQuality}>{qualityLabel(session.qualityScore)}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={onDelete}
        style={styles.cardDeleteBtn}
        hitSlop={4}
      >
        <Ionicons name="trash-outline" size={18} color={C.danger} />
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const { sessions, isLoading, lastSyncResult, refresh, syncNow, clearSyncResult, removeSession } = useSleep();
  const [syncing, setSyncing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  // --- DEBUG STATE (remove when no longer needed) ---
  const [debugVisible, setDebugVisible] = useState(false);
  const debugInsets = useSafeAreaInsets();

  const today = localDateString();
  const todaySession = sessions.find(s => s.date === today);
  const recent = sessions.slice(0, 10);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    if (lastSyncResult && lastSyncResult.imported > 0) {
      setShowBanner(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const timer = setTimeout(() => {
        setShowBanner(false);
        clearSyncResult();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [lastSyncResult, clearSyncResult]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await syncNow();
    setSyncing(false);
    if (result.error) {
      Alert.alert("Sync Issue", result.error);
    } else if (result.imported === 0 && result.skipped === 0) {
      Alert.alert("No New Data", "No new sleep periods detected. Step data needs time to accumulate — check back tomorrow morning.");
    }
  }, [syncNow]);

  const handleLog = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/log-entry");
  }, []);

  const handleSessionEdit = useCallback(async (session: SleepSession) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/log-entry", params: { date: session.date } });
  }, []);

  const handleSessionDelete = useCallback((session: SleepSession) => {
    Alert.alert(
      "Delete Entry",
      "Deleting will permanently erase this sleep log. Are you sure you want to delete?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeSession(session.id);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }, [removeSession]);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={C.accent} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.appTitle}>Slumber</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {Platform.OS === "ios" && (
              <Pressable
                style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
                onPress={handleSync}
                disabled={syncing}
                testID="sync-btn"
              >
                <Ionicons
                  name={syncing ? "sync" : "analytics"}
                  size={16}
                  color={C.accent}
                />
                <Text style={styles.syncBtnText}>
                  {syncing ? "Syncing…" : "Sync"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {showBanner && lastSyncResult && lastSyncResult.imported > 0 && (
          <Animated.View entering={FadeIn} style={styles.detectionBanner}>
            <Ionicons name="checkmark-circle-outline" size={15} color={C.goodGreen} />
            <Text style={styles.detectionBannerText}>
              {lastSyncResult.imported} night{lastSyncResult.imported !== 1 ? "s" : ""} detected and logged automatically
            </Text>
          </Animated.View>
        )}

        {!todaySession && (
          <Animated.View entering={FadeIn} style={styles.heroCard}>
            <LinearGradient
              colors={["#0F1628", "#131929"]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <View style={styles.heroBorder} />
            <View style={styles.heroEmpty}>
              <Ionicons name="moon-outline" size={44} color={C.accent} />
              <Text style={styles.heroEmptyTitle}>
                {Platform.OS === "ios" ? "Detecting your sleep" : "Log tonight's sleep"}
              </Text>
              <Text style={styles.heroEmptySub}>
                {Platform.OS === "ios"
                  ? "Slumber analyzes multiple health signals — steps, ambient sound, and headphone use — to accurately detect your sleep. No action needed."
                  : "Record your bedtime and wake-up to start tracking your patterns."}
              </Text>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown} style={styles.infoCard}>
          <View style={styles.infoCardIcon}>
            <Ionicons name="analytics-outline" size={20} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoCardTitle}>Multi-signal sleep detection</Text>
            <Text style={styles.infoCardSub}>
              Slumber combines step count, ambient sound levels, and headphone usage from Apple Health to accurately detect sleep. Watching videos in bed? The audio signals tell us you're awake. Quiet room with no movement? That's sleep.
            </Text>
          </View>
        </Animated.View>

        {Platform.OS === "ios" && (
          <Pressable
            onPress={() => {
              Alert.alert(
                "Add Widget",
                "1. Go to your iPhone home screen\n2. Long-press on an empty area\n3. Tap the + button in the top-left corner\n4. Search for \"Slumber\"\n5. Select the Wake-Up Times widget\n6. Tap \"Add Widget\"",
                [{ text: "Got it" }]
              );
            }}
            style={styles.widgetCard}
          >
            <View style={styles.widgetCardIcon}>
              <Ionicons name="grid-outline" size={18} color={C.wakeAmber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.widgetCardTitle}>Add home screen widget</Text>
              <Text style={styles.widgetCardSub}>See your weekly wake-up times at a glance</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </Pressable>
        )}

        <View style={styles.recentSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Nights</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => router.push("/(tabs)/graphs")}>
                <Text style={styles.seeAll}>Insights →</Text>
              </Pressable>
              <Pressable
                style={styles.addBtn}
                onPress={handleLog}
                testID="log-sleep-btn"
              >
                <Ionicons name="add" size={20} color={C.accent} />
              </Pressable>
            </View>
          </View>
          {recent.length > 0 ? (
            recent.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onEdit={() => handleSessionEdit(s)}
                onDelete={() => handleSessionDelete(s)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="bed-outline" size={36} color={C.textMuted} />
              <Text style={styles.emptyTitle}>No sleep logged yet</Text>
              <Text style={styles.emptySub}>
                {Platform.OS === "ios"
                  ? "Your sleep will be detected automatically from health signals, or tap + to log manually"
                  : "Tap + above to record your first night"}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
      {/* --- DEBUG BUTTON (remove when no longer needed) --- */}
      <Pressable
        onPress={() => setDebugVisible(true)}
        style={[debugBtnStyle.btn, { bottom: debugInsets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }]}
        hitSlop={8}
      >
        <Ionicons name="bug-outline" size={14} color="rgba(255,255,255,0.35)" />
      </Pressable>
      <DebugPanel visible={debugVisible} onClose={() => setDebugVisible(false)} />
    </View>
  );
}

const debugBtnStyle = StyleSheet.create({
  btn: {
    position: "absolute", left: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center", justifyContent: "center",
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greeting: { fontFamily: "DM_Sans_400Regular", fontSize: 14, color: C.textSecondary },
  appTitle: { fontFamily: "DM_Sans_700Bold", fontSize: 30, color: C.text, letterSpacing: -0.5 },
  syncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(99,102,241,0.1)",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.2)",
  },
  syncBtnText: { fontFamily: "DM_Sans_500Medium", fontSize: 13, color: C.accent },
  detectionBanner: {
    marginHorizontal: 24,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16,185,129,0.12)",
  },
  detectionBannerText: { fontFamily: "DM_Sans_500Medium", fontSize: 13, flex: 1, color: C.goodGreen },
  heroCard: {
    marginHorizontal: 24, marginTop: 12, borderRadius: 28,
    overflow: "hidden", minHeight: 180, position: "relative",
  },
  heroBorder: {
    ...StyleSheet.absoluteFillObject, borderRadius: 28,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  heroContent: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 24,
  },
  heroLabel: { fontFamily: "DM_Sans_500Medium", fontSize: 13, color: C.textSecondary, marginBottom: 4 },
  heroDuration: { fontFamily: "DM_Sans_700Bold", fontSize: 48, color: C.text, letterSpacing: -2 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statRowLabel: { fontFamily: "DM_Sans_400Regular", fontSize: 11, color: C.textSecondary },
  statRowValue: { fontFamily: "DM_Sans_600SemiBold", fontSize: 15, marginTop: 1 },
  autoTag: {
    position: "absolute", bottom: 16, left: 24,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(99,102,241,0.12)", borderRadius: 12,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  autoTagText: { fontFamily: "DM_Sans_400Regular", fontSize: 11, color: C.accent },
  heroEmpty: {
    alignItems: "center", justifyContent: "center",
    padding: 32, minHeight: 180, gap: 10,
  },
  heroEmptyTitle: { fontFamily: "DM_Sans_600SemiBold", fontSize: 18, color: C.text },
  heroEmptySub: {
    fontFamily: "DM_Sans_400Regular", fontSize: 14, color: C.textSecondary,
    textAlign: "center", lineHeight: 20, maxWidth: 280,
  },
  infoCard: {
    marginHorizontal: 24, marginTop: 16, flexDirection: "row",
    alignItems: "flex-start", gap: 14,
    backgroundColor: "rgba(99,102,241,0.07)", borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: "rgba(99,102,241,0.15)",
  },
  infoCardIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(99,102,241,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  infoCardTitle: { fontFamily: "DM_Sans_600SemiBold", fontSize: 15, color: C.text, marginBottom: 4 },
  infoCardSub: { fontFamily: "DM_Sans_400Regular", fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  widgetCard: {
    marginHorizontal: 24, marginTop: 12, flexDirection: "row",
    alignItems: "center", gap: 14,
    backgroundColor: "rgba(245,158,11,0.07)", borderRadius: 20,
    padding: 18, borderWidth: 1, borderColor: "rgba(245,158,11,0.15)",
  },
  widgetCardIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(245,158,11,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  widgetCardTitle: { fontFamily: "DM_Sans_600SemiBold", fontSize: 15, color: C.text },
  widgetCardSub: { fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textSecondary, marginTop: 2 },
  recentSection: { marginTop: 24, paddingHorizontal: 24 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 14,
  },
  sectionTitle: { fontFamily: "DM_Sans_700Bold", fontSize: 20, color: C.text },
  seeAll: { fontFamily: "DM_Sans_500Medium", fontSize: 14, color: C.accent },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(99,102,241,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(99,102,241,0.25)",
  },
  sessionCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.card, borderRadius: 18, marginBottom: 10,
    borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden",
  },
  cardDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  qualityBar: { width: 4 },
  sessionContent: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", padding: 14,
  },
  sessionDate: { fontFamily: "DM_Sans_600SemiBold", fontSize: 14, color: C.text },
  sessionTimes: { fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textSecondary, marginTop: 2 },
  sessionRight: { alignItems: "flex-end" },
  sessionDuration: { fontFamily: "DM_Sans_700Bold", fontSize: 20, letterSpacing: -0.5 },
  sessionQuality: { fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textSecondary, marginTop: 2 },
  autoBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(99,102,241,0.12)", borderRadius: 8,
    paddingVertical: 2, paddingHorizontal: 6,
  },
  autoBadgeText: { fontFamily: "DM_Sans_500Medium", fontSize: 10, color: C.accent },
  emptyState: { alignItems: "center", paddingTop: 32, gap: 8 },
  emptyTitle: { fontFamily: "DM_Sans_600SemiBold", fontSize: 18, color: C.textSecondary },
  emptySub: { fontFamily: "DM_Sans_400Regular", fontSize: 14, color: C.textMuted, textAlign: "center", paddingHorizontal: 40 },
});
