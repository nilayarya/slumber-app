import { Platform } from "react-native";

let _mod: any = null;

function getModule() {
  if (_mod) return _mod;
  if (Platform.OS !== "ios") return null;
  try {
    _mod = require("expo-modules-core").requireNativeModule("WidgetSyncModule");
    return _mod;
  } catch {
    try {
      const { NativeModules } = require("react-native");
      if (NativeModules.WidgetSyncModule) {
        _mod = NativeModules.WidgetSyncModule;
        return _mod;
      }
    } catch {}
  }
  return null;
}

export function syncData(key: string, value: string, suiteName: string): void {
  const mod = getModule();
  if (mod) {
    mod.syncData(key, value, suiteName);
  } else {
    console.log("[Slumber] Widget sync: native module not available");
  }
}
