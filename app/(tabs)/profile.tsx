import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useSleep } from "@/lib/sleep-context";
import {
  formatDuration,
  avgDuration,
  consistencyScore,
  qualityColor,
  qualityLabel,
} from "@/lib/sleep-utils";

const C = Colors.dark;

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export default function ProfileScreen() {
  const { sessions, refresh } = useSleep();

  const valid = sessions.filter(s => s.durationMinutes != null);
  const avg = avgDuration(sessions);
  const consistency = consistencyScore(sessions);
  const avgQuality = valid.length > 0
    ? Math.round(valid.reduce((s, v) => s + (v.qualityScore ?? 0), 0) / valid.length)
    : null;
  const longestSleep = valid.reduce((b, s) => (!b || (s.durationMinutes ?? 0) > (b.durationMinutes ?? 0)) ? s : b, null as typeof sessions[0] | null);
  const streak = (() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      if (sessions.find(s => s.date === ds)) count++;
      else break;
    }
    return count;
  })();

  const handleClearData = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      "Clear All Data",
      "This will permanently delete all your sleep history from this device. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem("slumber:sessions:v1");
            await refresh();
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Your Stats</Text>
        </View>

        {/* Hero badge */}
        <Animated.View entering={FadeInDown.springify()} style={styles.heroCard}>
          <LinearGradient
            colors={["#131929", "#180F38"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={styles.heroBorder} />
          <View style={styles.heroContent}>
            <View style={styles.moonBadge}>
              <Ionicons name="moon" size={32} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Slumber</Text>
              <Text style={styles.heroSub}>
                {sessions.length === 0
                  ? "Start logging your sleep tonight"
                  : `${sessions.length} night${sessions.length !== 1 ? "s" : ""} tracked on this device`}
              </Text>
              {streak > 1 && (
                <View style={styles.streakBadge}>
                  <Ionicons name="flame" size={13} color={C.wakeAmber} />
                  <Text style={styles.streakText}>{streak}-day streak</Text>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Stats grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sleep Overview</Text>
          <View style={styles.grid}>
            <StatCard
              label="Avg Duration"
              value={formatDuration(avg || undefined)}
              sub="per night"
              color={avg >= 420 ? C.goodGreen : avg >= 300 ? C.wakeAmber : avg > 0 ? C.danger : undefined}
            />
            <StatCard
              label="Consistency"
              value={sessions.length >= 2 ? `${consistency}%` : "--"}
              sub="schedule score"
              color={sessions.length >= 2 ? qualityColor(consistency) : undefined}
            />
            <StatCard
              label="Nights Logged"
              value={String(sessions.length)}
              sub="total entries"
            />
            <StatCard
              label="Avg Quality"
              value={avgQuality != null ? String(avgQuality) : "--"}
              sub={avgQuality != null ? qualityLabel(avgQuality) : "log more nights"}
              color={qualityColor(avgQuality)}
            />
          </View>
        </View>

        {/* Best sleep */}
        {longestSleep && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Best Sleep</Text>
            <View style={styles.bestCard}>
              <Ionicons name="trophy" size={20} color={C.wakeAmber} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bestDuration}>{formatDuration(longestSleep.durationMinutes)}</Text>
                <Text style={styles.bestDate}>
                  {new Date(longestSleep.date + "T12:00:00").toLocaleDateString([], {
                    weekday: "long", month: "long", day: "numeric"
                  })}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Data management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <View style={styles.infoCard}>
            <Ionicons name="phone-portrait-outline" size={18} color={C.textSecondary} />
            <Text style={styles.infoText}>
              All sleep data is stored locally on this device. It stays here as long as the app is installed.
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.dangerBtn, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleClearData}
            disabled={sessions.length === 0}
          >
            <Ionicons name="trash-outline" size={18} color={C.danger} />
            <Text style={styles.dangerBtnText}>Clear All Sleep Data</Text>
          </Pressable>
        </View>

        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Slumber v1.0 • Private by design</Text>
        </View>

        <View style={{ height: Platform.OS === "web" ? 34 : 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "DM_Sans_700Bold", fontSize: 28, color: C.text },
  heroCard: {
    marginHorizontal: 24,
    marginTop: 12,
    borderRadius: 28,
    overflow: "hidden",
    position: "relative",
  },
  heroBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  moonBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(99,102,241,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.3)",
  },
  heroTitle: { fontFamily: "DM_Sans_700Bold", fontSize: 22, color: C.text },
  heroSub: { fontFamily: "DM_Sans_400Regular", fontSize: 13, color: C.textSecondary, marginTop: 4, lineHeight: 18 },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  streakText: { fontFamily: "DM_Sans_600SemiBold", fontSize: 12, color: C.wakeAmber },
  section: { marginTop: 28, paddingHorizontal: 24 },
  sectionTitle: { fontFamily: "DM_Sans_700Bold", fontSize: 20, color: C.text, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  statValue: { fontFamily: "DM_Sans_700Bold", fontSize: 28, color: C.text, letterSpacing: -0.5 },
  statLabel: { fontFamily: "DM_Sans_500Medium", fontSize: 13, color: C.text, marginTop: 4 },
  statSub: { fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textSecondary, marginTop: 2 },
  bestCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  bestDuration: { fontFamily: "DM_Sans_700Bold", fontSize: 24, color: C.wakeAmber, letterSpacing: -0.5 },
  bestDate: { fontFamily: "DM_Sans_400Regular", fontSize: 13, color: C.textSecondary, marginTop: 2 },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    marginBottom: 12,
  },
  infoText: { fontFamily: "DM_Sans_400Regular", fontSize: 13, color: C.textSecondary, flex: 1, lineHeight: 20 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  dangerBtnText: { fontFamily: "DM_Sans_500Medium", fontSize: 15, color: C.danger },
  appInfo: { alignItems: "center", marginTop: 32 },
  appInfoText: { fontFamily: "DM_Sans_400Regular", fontSize: 12, color: C.textMuted },
});
