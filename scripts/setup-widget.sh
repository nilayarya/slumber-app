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

ENTITLEMENT_MAIN="ios/Slumber/Slumber.entitlements"
cat > "$ENTITLEMENT_MAIN" << 'ENT'
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
echo ""
echo "=== Now do these 3 things in Xcode ==="
echo ""
echo "1. Open Xcode:"
echo "   open ios/Slumber.xcworkspace"
echo ""
echo "2. Add the widget target:"
echo "   • File → New → Target → search 'Widget Extension' → Next"
echo "   • Name it: SlumberWidget"
echo "   • Uncheck 'Include Live Activity'"  
echo "   • Uncheck 'Include Configuration App Intent'"
echo "   • Click Finish → Activate scheme"
echo "   • DELETE the auto-generated Swift files in the SlumberWidget folder"
echo "     (Xcode creates its own — we already have ours)"
echo ""
echo "3. Add App Groups to BOTH targets:"
echo "   • Click Slumber project (blue icon, top of sidebar)"
echo "   • Select 'Slumber' target → Signing & Capabilities → + Capability → App Groups"
echo "     → add: group.com.slumber.sleeptracker"
echo "   • Select 'SlumberWidgetExtension' target → same thing → same group ID"
echo ""
echo "4. Build: ⌘R (or: npx expo run:ios --device)"
echo ""
