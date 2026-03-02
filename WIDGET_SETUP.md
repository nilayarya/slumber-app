# Slumber Widget Setup

## Quick Start

From your project root on your Mac, run:

```bash
bash scripts/setup-widget.sh
```

This automatically:
- Runs `npx expo prebuild` if needed
- Copies the native sync module into the iOS project
- Creates the bridging header
- Copies the widget Swift code and entitlements
- Sets up App Groups entitlements for both targets

## After the script, do these 3 things in Xcode

### 1. Open the project
```bash
open ios/Slumber.xcworkspace
```

### 2. Add the widget target
- **File → New → Target...** → search for **Widget Extension** → **Next**
- Name it **SlumberWidget**
- **Uncheck** "Include Live Activity"
- **Uncheck** "Include Configuration App Intent"
- Click **Finish** → **Activate** the scheme
- In the sidebar, expand the new **SlumberWidget** folder and **delete** the auto-generated Swift file(s) that Xcode created (right-click → Delete → Move to Trash). The script already placed the correct `SlumberWidget.swift` file in `ios/SlumberWidget/`.

### 3. Add App Groups to both targets
- Click the **Slumber** project (blue icon at top of sidebar)
- Select the **Slumber** target → **Signing & Capabilities** → click **+ Capability** → **App Groups** → add `group.com.slumber.sleeptracker`
- Select the **SlumberWidgetExtension** target → **Signing & Capabilities** → click **+ Capability** → **App Groups** → add `group.com.slumber.sleeptracker`

### 4. Build and run
Press **⌘R** in Xcode, or run:
```bash
npx expo run:ios --device
```

### 5. Add the widget to your home screen
- Long-press on your iPhone home screen → tap **+** → search **Slumber** → add the **Wake-Up Times** widget (Medium size)
