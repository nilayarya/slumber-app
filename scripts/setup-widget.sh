#!/bin/bash
set -e

echo ""
echo "=== Slumber Widget Setup ==="
echo ""

if [ ! -d "ios/Slumber.xcworkspace" ]; then
  echo "❌ No ios/ folder found. Running prebuild first..."
  rm -rf ios
  npx expo prebuild --platform ios
fi

echo "📁 Copying native sync module into iOS project..."
cp modules/widget-sync/ios/WidgetSyncModule.swift ios/Slumber/
cp modules/widget-sync/ios/WidgetSyncModule.m ios/Slumber/

HEADER="ios/Slumber/Slumber-Bridging-Header.h"
if [ ! -f "$HEADER" ]; then
  echo "📝 Creating bridging header..."
  echo '#import <React/RCTBridgeModule.h>' > "$HEADER"
else
  if ! grep -q "RCTBridgeModule" "$HEADER"; then
    echo '#import <React/RCTBridgeModule.h>' >> "$HEADER"
  fi
fi

echo "📁 Creating widget extension folder..."
mkdir -p "ios/SlumberWidget"
cp targets/widget/SlumberWidget.swift ios/SlumberWidget/

cat > ios/SlumberWidget/Info.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>Slumber</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>
PLIST

ENTITLEMENT_WIDGET="ios/SlumberWidget/SlumberWidget.entitlements"
cat > "$ENTITLEMENT_WIDGET" << 'ENT'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.slumber.sleeptracker</string>
    </array>
</dict>
</plist>
ENT

echo ""
echo "✅ All files are in place!"
echo "   Main app entitlements are handled automatically by the Expo config plugin."
echo ""
echo "=== Now do these steps in Xcode ==="
echo ""
echo "1. Open Xcode:"
echo "   open ios/Slumber.xcworkspace"
echo ""
echo "2. Verify main app App Groups (should already be set by prebuild):"
echo "   • Click the Slumber project (blue icon at top of sidebar)"
echo "   • Select 'Slumber' target → Signing & Capabilities"
echo "   • You should see 'App Groups' with group.com.slumber.sleeptracker"
echo "   • If NOT present: click + Capability → App Groups → add group.com.slumber.sleeptracker"
echo ""
echo "3. Add the widget target:"
echo "   • File → New → Target → search 'Widget Extension' → Next"
echo "   • Name it: SlumberWidget"
echo "   • Uncheck 'Include Live Activity'"
echo "   • Uncheck 'Include Configuration App Intent'"
echo "   • Click Finish → Activate scheme"
echo "   • DELETE the auto-generated Swift files Xcode creates in SlumberWidget/"
echo "     (we already have our own SlumberWidget.swift)"
echo ""
echo "4. Add App Groups to the widget target (CRITICAL for data sharing):"
echo "   • Select 'SlumberWidgetExtension' target → Signing & Capabilities"
echo "   • Click + Capability → App Groups"
echo "   • Add: group.com.slumber.sleeptracker"
echo "   • Make sure the group ID matches EXACTLY"
echo ""
echo "5. Set the widget entitlements file:"
echo "   • Select 'SlumberWidgetExtension' target → Build Settings"
echo "   • Search for 'Code Signing Entitlements'"
echo "   • Set it to: SlumberWidget/SlumberWidget.entitlements"
echo ""
echo "6. Build: ⌘R (or: npx expo run:ios --device)"
echo ""
echo "=== Troubleshooting ==="
echo ""
echo "If you see 'CFPrefsPlistSource' errors:"
echo "  → App Groups capability is not set on one or both targets"
echo "  → Go to Signing & Capabilities for BOTH Slumber and SlumberWidgetExtension"
echo "  → Verify group.com.slumber.sleeptracker appears under App Groups for BOTH"
echo ""
