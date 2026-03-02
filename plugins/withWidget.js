const { withXcodeProject, withEntitlementsPlist, withInfoPlist, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const WIDGET_NAME = "SlumberWidget";
const APP_GROUP = "group.com.slumber.sleeptracker";
const BUNDLE_ID_SUFFIX = ".widget";

function withWidget(config) {
  config = withWidgetEntitlements(config);
  config = withWidgetTarget(config);
  return config;
}

function withWidgetEntitlements(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [APP_GROUP];
    return mod;
  });
}

function withWidgetTarget(config) {
  return withXcodeProject(config, async (mod) => {
    const xcodeProject = mod.modRequest.projectRoot;
    const bundleId = config.ios?.bundleIdentifier ?? "com.slumber.sleeptracker";
    const widgetBundleId = bundleId + BUNDLE_ID_SUFFIX;

    const widgetDir = path.join(xcodeProject, "ios", WIDGET_NAME);
    if (!fs.existsSync(widgetDir)) {
      fs.mkdirSync(widgetDir, { recursive: true });
    }

    const swiftSrc = path.join(xcodeProject, "targets", "widget", "SlumberWidget.swift");
    const swiftDst = path.join(widgetDir, "SlumberWidget.swift");
    if (fs.existsSync(swiftSrc)) {
      fs.copyFileSync(swiftSrc, swiftDst);
    }

    const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>`;
    fs.writeFileSync(path.join(widgetDir, `${WIDGET_NAME}.entitlements`), entitlements);

    const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
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
</plist>`;
    fs.writeFileSync(path.join(widgetDir, "Info.plist"), infoPlist);

    const proj = mod.modResults;

    const targetUuid = proj.generateUuid();
    const widgetGroup = proj.addPbxGroup(
      ["SlumberWidget.swift", `${WIDGET_NAME}.entitlements`, "Info.plist"],
      WIDGET_NAME,
      WIDGET_NAME
    );

    const mainGroupId = proj.getFirstProject().firstProject.mainGroup;
    proj.addToPbxGroup(widgetGroup.uuid, mainGroupId);

    const target = proj.addTarget(
      WIDGET_NAME,
      "app_extension",
      WIDGET_NAME,
      widgetBundleId
    );

    if (target && target.uuid) {
      const buildConfigs = proj.pbxXCBuildConfigurationSection();
      for (const key in buildConfigs) {
        if (typeof buildConfigs[key] === "object" && buildConfigs[key].buildSettings) {
          const bs = buildConfigs[key].buildSettings;
          if (bs.PRODUCT_NAME === `"${WIDGET_NAME}"` || bs.PRODUCT_BUNDLE_IDENTIFIER === `"${widgetBundleId}"`) {
            bs.SWIFT_VERSION = "5.0";
            bs.TARGETED_DEVICE_FAMILY = '"1"';
            bs.IPHONEOS_DEPLOYMENT_TARGET = "17.0";
            bs.CODE_SIGN_ENTITLEMENTS = `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`;
            bs.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
            bs.INFOPLIST_FILE = `${WIDGET_NAME}/Info.plist`;
            bs.GENERATE_INFOPLIST_FILE = "YES";
            bs.MARKETING_VERSION = "1.0";
            bs.CURRENT_PROJECT_VERSION = "1";
            bs.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = "AccentColor";
            bs.ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME = "WidgetBackground";
            bs.LD_RUNPATH_SEARCH_PATHS = '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"';
          }
        }
      }

      for (const key in buildConfigs) {
        if (typeof buildConfigs[key] === "object" && buildConfigs[key].buildSettings) {
          const bs = buildConfigs[key].buildSettings;
          const name = buildConfigs[key].name;
          if (bs.PRODUCT_BUNDLE_IDENTIFIER === `"${bundleId}"`) {
            if (!bs.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES) {
              bs.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "YES";
            }
          }
        }
      }
    }

    return mod;
  });
}

module.exports = withWidget;
