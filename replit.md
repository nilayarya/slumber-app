# Slumber - Sleep Tracker App

## Overview
A beautiful sleep tracking mobile app built with Expo (React Native). Tracks sleep schedules locally on the device — no account or internet connection needed. Data persists as long as the app is installed. On iPhone, automatically detects sleep by analyzing step count gaps from Apple HealthKit — completely passive, no user action required.

## Architecture
- **Frontend**: Expo Router (React Native) — runs on port 8081
- **Backend**: Express + TypeScript — runs on port 5000 (not used by the app, serves a static landing page)
- **Storage**: AsyncStorage (local device storage, `slumber:sessions:v1` key)
- **Auth**: None — app opens directly to home screen
- **Sleep Detection**: HealthKit step count analysis (passive, no Apple Watch needed)

## Key Features
- Fully local — all data stored on device via AsyncStorage
- Passive sleep detection: analyzes gaps in step count data from HealthKit
  - iPhone's motion coprocessor tracks steps 24/7 automatically
  - Finds periods of 4+ hours with zero steps during plausible sleep windows
  - No Apple Watch, Sleep Focus, or manual setup needed
- Manual sleep logging: enter bedtime and wake time
- Auto-syncs on app open and whenever app is foregrounded
- Weekly & monthly animated SVG charts on Insights tab
- Sleep quality scoring (0–100, based on duration and consistency)
- Dark navy theme with indigo/violet accents

## Project Structure
```
app/
  _layout.tsx          # Root layout with SleepProvider, fonts, dark theme
  (tabs)/
    _layout.tsx        # 3-tab layout: Tonight, Insights, Profile
    index.tsx          # Home screen — today's sleep + sync button + info card
    graphs.tsx         # Charts screen — bar charts, timeline, quality distribution
    profile.tsx        # Profile + stats + data management
  log-entry.tsx        # Sleep log entry sheet (formSheet presentation)
lib/
  sleep-store.ts       # AsyncStorage CRUD + quality scoring
  sleep-context.tsx    # React context wrapping store + auto-sync on foreground
  sleep-utils.ts       # Formatting helpers, date ranges, stats calculations
  health-sync.ts       # HealthKit step count reading + gap analysis + session creation
  lock-tracker.ts      # (Legacy) AppState-based tracking, kept as supplementary
constants/
  colors.ts            # Dark navy theme colors
```

## Data Model (AsyncStorage)
```typescript
type SleepSession = {
  id: string;               // UUID via expo-crypto
  date: string;             // YYYY-MM-DD (which night)
  sleepOnset: string;       // ISO datetime — when sleep started
  wakeTime: string;         // ISO datetime — when sleep ended
  durationMinutes: number;
  qualityScore: number;     // 0–100
  notes: string | null;
  source: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
}
```

## Sleep Detection Algorithm (lib/health-sync.ts)
Multi-signal confidence scoring using 4 HealthKit data types:
1. Queries step count, environmental audio exposure, headphone audio exposure, and walking distance
2. Finds gaps in step data (4+ hours with zero steps)
3. Scores each gap using a confidence system:
   - **Time window**: +30 nighttime (7PM-4AM onset, 4AM-2PM wake), +15 plausible duration
   - **Duration**: +15 for 5-12h, +8 for 4-14h
   - **No steps**: +10 baseline
   - **Environmental audio**: +25 if very quiet (<40dB), -35 if sustained loud audio (>50dB for 40%+ of gap)
   - **Headphone audio**: -40 if >20% of gap has headphone use (bed-rotting detection!)
   - **Walking distance**: -15 if >100m walked during gap
   - Missing audio data = neutral (0 points, no false inflation)
4. Threshold: confidence ≥ 50 = logged as sleep
5. Skips dates with manual entries; updates stale auto sessions
6. Syncs on foreground + manual header button

## Quality Scoring
- Up to 70 points for duration (target 9h = max points, proportional below)
- 30 bonus points if duration is 6-10 hours (healthy range), 15 points otherwise
- Score capped at 100

## Fonts
DM Sans loaded via @expo-google-fonts/dm-sans:
- `DMSans_400Regular` → registered as `"DM_Sans_400Regular"` for stylesheet use
- `DMSans_500Medium` → registered as `"DM_Sans_500Medium"`
- `DMSans_600SemiBold` → registered as `"DM_Sans_600SemiBold"`
- `DMSans_700Bold` → registered as `"DM_Sans_700Bold"`

## Theme Colors (dark-only)
- Background: #080C18
- Surface: #0F1628
- Card: #151E35
- Accent: #6366F1 (indigo)
- Sleep Blue: #3B82F6
- Wake Amber: #F59E0B
- Good Green: #10B981
- Danger: #EF4444

## iOS Widget
- Widget extension in `targets/widget/SlumberWidget.swift` (SwiftUI, WidgetKit)
- Shows weekly wake-up times chart (medium size, full width)
- Reads data from shared App Group (`group.com.slumber.sleeptracker`)
- Native sync module in `modules/widget-sync/ios/` bridges data from React Native to App Group UserDefaults
- Widget target is added manually in Xcode (not via config plugin — too fragile)
- Setup guide in `WIDGET_SETUP.md`
- Widget refreshes every 30 minutes via WidgetKit timeline

## Native Build
- Uses `@kingstinct/react-native-healthkit` + `react-native-nitro-modules` for HealthKit (New Architecture compatible)
- Config plugin in app.json handles entitlements and Info.plist automatically
- EAS project linked: ID `4adcbc0a-b4d8-49e4-931d-6e345cfcdf3f`, owner `nilayr`
- Build: `rm -rf ios && npx expo prebuild --platform ios && npx expo run:ios`
