import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  FlatList,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useSleep } from "@/lib/sleep-context";
import { localDateString } from "@/lib/sleep-utils";

const C = Colors.dark;

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ["AM", "PM"] as const;

const REPEAT_COUNT = 20;

function padTwo(n: number): string {
  return n.toString().padStart(2, "0");
}

function WheelColumn({
  data,
  selectedIndex,
  onSelect,
  formatItem,
  width,
}: {
  data: readonly (string | number)[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  formatItem: (item: string | number) => string;
  width: number;
}) {
  const flatListRef = useRef<FlatList>(null);
  const isScrolling = useRef(false);
  const repeatedData = Array.from({ length: REPEAT_COUNT }, (_, rep) =>
    data.map((item, idx) => ({ key: `${rep}-${idx}`, value: item, realIndex: idx }))
  ).flat();

  const midRepeat = Math.floor(REPEAT_COUNT / 2);
  const initialOffset = (midRepeat * data.length + selectedIndex) * ITEM_HEIGHT;

  useEffect(() => {
    if (!isScrolling.current && flatListRef.current) {
      const targetOffset = (midRepeat * data.length + selectedIndex) * ITEM_HEIGHT;
      flatListRef.current.scrollToOffset({ offset: targetOffset, animated: false });
    }
  }, [selectedIndex]);

  const handleMomentumEnd = useCallback((e: any) => {
    isScrolling.current = false;
    const y = e.nativeEvent.contentOffset.y;
    const rawIndex = Math.round(y / ITEM_HEIGHT);
    const realIndex = ((rawIndex % data.length) + data.length) % data.length;
    onSelect(realIndex);

    if (rawIndex < data.length * 2 || rawIndex > data.length * (REPEAT_COUNT - 2)) {
      const resetOffset = (midRepeat * data.length + realIndex) * ITEM_HEIGHT;
      flatListRef.current?.scrollToOffset({ offset: resetOffset, animated: false });
    }

    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }, [data.length, onSelect]);

  const handleScrollBegin = useCallback(() => {
    isScrolling.current = true;
  }, []);

  const renderItem = useCallback(({ item }: { item: { key: string; value: string | number; realIndex: number } }) => {
    return (
      <View style={[wheelStyles.item, { height: ITEM_HEIGHT, width }]}>
        <Text style={wheelStyles.itemText}>
          {formatItem(item.value)}
        </Text>
      </View>
    );
  }, [formatItem, width]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={[wheelStyles.column, { width, height: PICKER_HEIGHT }]}>
      <View style={wheelStyles.selectionIndicator} pointerEvents="none" />
      <FlatList
        ref={flatListRef}
        data={repeatedData}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemLayout={getItemLayout}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        initialScrollIndex={midRepeat * data.length + selectedIndex}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollBeginDrag={handleScrollBegin}
        scrollEnabled={true}
      />
    </View>
  );
}

function PeriodColumn({
  selected,
  onSelect,
}: {
  selected: "AM" | "PM";
  onSelect: (p: "AM" | "PM") => void;
}) {
  return (
    <View style={[wheelStyles.column, { width: 56, height: PICKER_HEIGHT, justifyContent: "center" }]}>
      {PERIODS.map(p => (
        <Pressable
          key={p}
          onPress={() => {
            onSelect(p);
            if (Platform.OS !== "web") Haptics.selectionAsync();
          }}
          style={[
            wheelStyles.periodBtn,
            selected === p && wheelStyles.periodBtnActive,
          ]}
        >
          <Text style={[
            wheelStyles.periodText,
            selected === p && wheelStyles.periodTextActive,
          ]}>
            {p}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function TimePicker({
  hour,
  minute,
  period,
  onChangeHour,
  onChangeMinute,
  onChangePeriod,
}: {
  hour: number;
  minute: number;
  period: "AM" | "PM";
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
  onChangePeriod: (p: "AM" | "PM") => void;
}) {
  const screenWidth = Dimensions.get("window").width;
  const pickerWidth = Math.min(screenWidth - 80, 300);
  const colWidth = Math.floor((pickerWidth - 56 - 24) / 2);

  return (
    <View style={wheelStyles.pickerContainer}>
      <View style={[wheelStyles.pickerRow, { width: pickerWidth }]}>
        <WheelColumn
          data={HOURS_12}
          selectedIndex={hour - 1}
          onSelect={(i) => onChangeHour(i + 1)}
          formatItem={(v) => v.toString()}
          width={colWidth}
        />
        <Text style={wheelStyles.separator}>:</Text>
        <WheelColumn
          data={MINUTES}
          selectedIndex={minute}
          onSelect={onChangeMinute}
          formatItem={(v) => padTwo(v as number)}
          width={colWidth}
        />
        <PeriodColumn selected={period} onSelect={onChangePeriod} />
      </View>
    </View>
  );
}

function to12h(hour24: number): { hour: number; period: "AM" | "PM" } {
  if (hour24 === 0) return { hour: 12, period: "AM" };
  if (hour24 === 12) return { hour: 12, period: "PM" };
  if (hour24 > 12) return { hour: hour24 - 12, period: "PM" };
  return { hour: hour24, period: "AM" };
}

function to24h(hour12: number, period: "AM" | "PM"): number {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

function buildISO(dateStr: string, hour12: number, minute: number, period: "AM" | "PM", afterISO?: string): string {
  const h24 = to24h(hour12, period);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const result = new Date(y, mo - 1, d, h24, minute, 0);

  if (afterISO && result.getTime() <= new Date(afterISO).getTime()) {
    result.setDate(result.getDate() + 1);
  }
  return result.toISOString();
}

export default function LogEntryScreen() {
  const insets = useSafeAreaInsets();
  const { addSession, editSession, removeSession, sessions } = useSleep();
  const params = useLocalSearchParams<{ date?: string }>();

  const today = localDateString();

  const passedDate = params.date;
  const [selectedDate, setSelectedDate] = useState(passedDate || today);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [bedHour, setBedHour] = useState(10);
  const [bedMinute, setBedMinute] = useState(30);
  const [bedPeriod, setBedPeriod] = useState<"AM" | "PM">("PM");
  const [wakeHour, setWakeHour] = useState(7);
  const [wakeMinute, setWakeMinute] = useState(0);
  const [wakePeriod, setWakePeriod] = useState<"AM" | "PM">("AM");
  const [saving, setSaving] = useState(false);

  const targetDate = selectedDate;
  const existingSession = sessions.find(s => s.date === targetDate) ?? null;
  const isDirectEdit = !!passedDate;

  useEffect(() => {
    if (existingSession) {
      const onset = new Date(existingSession.sleepOnset);
      const wake = new Date(existingSession.wakeTime);
      const bed12 = to12h(onset.getHours());
      setBedHour(bed12.hour);
      setBedMinute(onset.getMinutes());
      setBedPeriod(bed12.period);
      const wake12 = to12h(wake.getHours());
      setWakeHour(wake12.hour);
      setWakeMinute(wake.getMinutes());
      setWakePeriod(wake12.period);
    } else {
      setBedHour(10);
      setBedMinute(30);
      setBedPeriod("PM");
      setWakeHour(7);
      setWakeMinute(0);
      setWakePeriod("AM");
    }
  }, [targetDate, existingSession?.id]);

  const bedH24 = to24h(bedHour, bedPeriod);
  const wakeH24 = to24h(wakeHour, wakePeriod);
  const bedDate = new Date(2000, 0, 1, bedH24, bedMinute);
  const wakeDate = new Date(2000, 0, wakeH24 <= bedH24 ? 2 : 1, wakeH24, wakeMinute);
  const durationMin = Math.round((wakeDate.getTime() - bedDate.getTime()) / 60_000);
  const durationStr = durationMin > 0
    ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
    : "--";

  const handleSave = useCallback(async () => {
    if (durationMin <= 0 || durationMin > 24 * 60) {
      Alert.alert("Invalid Times", "Wake time must be after bedtime. Please adjust the times.");
      return;
    }

    const dayBefore = (() => {
      const d = new Date(targetDate + "T12:00:00");
      d.setDate(d.getDate() - 1);
      return localDateString(d);
    })();
    const sleepISO = buildISO(dayBefore, bedHour, bedMinute, bedPeriod);
    const wakeISO = buildISO(targetDate, wakeHour, wakeMinute, wakePeriod, sleepISO);

    setSaving(true);
    try {
      if (existingSession) {
        await editSession(existingSession.id, {
          sleepOnset: sleepISO,
          wakeTime: wakeISO,
          source: "manual",
        });
      } else {
        await addSession({
          date: targetDate,
          sleepOnset: sleepISO,
          wakeTime: wakeISO,
          source: "manual",
        });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      Alert.alert("Error", "Could not save your sleep entry. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [bedHour, bedMinute, bedPeriod, wakeHour, wakeMinute, wakePeriod, targetDate, existingSession, durationMin]);

  const handleDelete = useCallback(() => {
    if (!existingSession) return;
    Alert.alert(
      "Delete Entry",
      "Deleting will permanently erase this sleep log. Are you sure you want to delete?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await removeSession(existingSession.id);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          },
        },
      ]
    );
  }, [existingSession, removeSession]);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{existingSession ? "Edit Entry" : "Log Sleep"}</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn}>
          <Ionicons name="close-circle" size={28} color={C.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 34) + 100 }}
      >
        {!isDirectEdit && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Wake-up date</Text>
            <Pressable
              style={styles.datePickerBtn}
              onPress={() => setShowDatePicker(!showDatePicker)}
            >
              <Ionicons name="calendar-outline" size={18} color={C.accent} />
              <Text style={styles.datePickerText}>
                {(() => {
                  const d = new Date(targetDate + "T12:00:00");
                  if (targetDate === today) return "Today";
                  const yd = new Date(); yd.setDate(yd.getDate() - 1);
                  if (targetDate === localDateString(yd)) return "Yesterday";
                  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
                })()}
              </Text>
              <Ionicons name={showDatePicker ? "chevron-up" : "chevron-down"} size={16} color={C.textMuted} />
            </Pressable>
            {showDatePicker && (
              <View style={styles.dateGrid}>
                {(() => {
                  const days: { label: string; date: string; isSelected: boolean; isToday: boolean }[] = [];
                  for (let i = 0; i < 30; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const ds = localDateString(d);
                    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString([], { month: "short", day: "numeric" });
                    days.push({ label, date: ds, isSelected: ds === targetDate, isToday: i === 0 });
                  }
                  return days.map(day => (
                    <Pressable
                      key={day.date}
                      style={[styles.dateChip, day.isSelected && styles.dateChipActive]}
                      onPress={() => {
                        setSelectedDate(day.date);
                        setShowDatePicker(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      {day.isSelected && (
                        <LinearGradient
                          colors={[C.accent, C.accentViolet]}
                          style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                        />
                      )}
                      <Text style={[styles.dateChipText, day.isSelected && styles.dateChipTextActive]}>
                        {day.label}
                      </Text>
                    </Pressable>
                  ));
                })()}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.timeHeader}>
            <Ionicons name="moon" size={16} color={C.sleepBlue} />
            <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>Fell asleep</Text>
          </View>
          <View style={styles.pickerCard}>
            <TimePicker
              hour={bedHour}
              minute={bedMinute}
              period={bedPeriod}
              onChangeHour={setBedHour}
              onChangeMinute={setBedMinute}
              onChangePeriod={setBedPeriod}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.timeHeader}>
            <Ionicons name="sunny" size={16} color={C.wakeAmber} />
            <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>Woke up</Text>
          </View>
          <View style={styles.pickerCard}>
            <TimePicker
              hour={wakeHour}
              minute={wakeMinute}
              period={wakePeriod}
              onChangeHour={setWakeHour}
              onChangeMinute={setWakeMinute}
              onChangePeriod={setWakePeriod}
            />
          </View>
        </View>

        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={18} color={C.accent} />
          <Text style={styles.durationLabel}>Duration</Text>
          <Text style={[styles.durationValue, durationMin <= 0 && { color: C.danger }]}>
            {durationStr}
          </Text>
        </View>

      </ScrollView>

      <View style={[styles.saveBar, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 10) + 10 }]}>
        <View style={styles.saveBarRow}>
          {existingSession && (
            <Pressable
              style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={handleDelete}
            >
              <Ionicons name="trash-outline" size={20} color={C.danger} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.85 : 1, flex: 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <LinearGradient
              colors={[C.accent, C.accentViolet]}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>
                  {existingSession ? "Update Entry" : "Save Entry"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const wheelStyles = StyleSheet.create({
  pickerContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  column: {
    overflow: "hidden",
    position: "relative",
  },
  selectionIndicator: {
    position: "absolute",
    top: ITEM_HEIGHT * 2,
    left: 4,
    right: 4,
    height: ITEM_HEIGHT,
    backgroundColor: "rgba(99,102,241,0.12)",
    borderRadius: 10,
    zIndex: 1,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    fontFamily: "DM_Sans_600SemiBold",
    fontSize: 20,
    color: C.text,
  },
  separator: {
    fontFamily: "DM_Sans_700Bold",
    fontSize: 24,
    color: C.textSecondary,
    marginHorizontal: 2,
    marginTop: -2,
  },
  periodBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  periodBtnActive: {
    backgroundColor: "rgba(99,102,241,0.15)",
  },
  periodText: {
    fontFamily: "DM_Sans_500Medium",
    fontSize: 16,
    color: C.textMuted,
  },
  periodTextActive: {
    color: C.accent,
    fontFamily: "DM_Sans_700Bold",
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  title: { fontFamily: "DM_Sans_700Bold", fontSize: 24, color: C.text },
  closeBtn: {
    width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
  },
  section: { paddingHorizontal: 24, marginBottom: 20 },
  sectionLabel: { fontFamily: "DM_Sans_600SemiBold", fontSize: 15, color: C.text, marginBottom: 10 },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  pickerCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 24,
    marginBottom: 20,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  durationLabel: {
    fontFamily: "DM_Sans_500Medium",
    fontSize: 15,
    color: C.textSecondary,
    flex: 1,
  },
  durationValue: {
    fontFamily: "DM_Sans_700Bold",
    fontSize: 22,
    color: C.accent,
    letterSpacing: -0.5,
  },
  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  datePickerText: {
    fontFamily: "DM_Sans_600SemiBold",
    fontSize: 15,
    color: C.text,
    flex: 1,
  },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  dateChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
    position: "relative",
  },
  dateChipActive: {
    borderColor: C.accent,
  },
  dateChipText: {
    fontFamily: "DM_Sans_500Medium",
    fontSize: 13,
    color: C.textSecondary,
  },
  dateChipTextActive: {
    color: "#fff",
    fontFamily: "DM_Sans_600SemiBold",
  },
  saveBar: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.divider,
  },
  saveBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deleteBtn: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    overflow: "hidden",
    position: "relative",
  },
  saveBtnText: { fontFamily: "DM_Sans_600SemiBold", fontSize: 16, color: "#fff" },
});
