import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SleepProvider } from "@/lib/sleep-context";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import { StatusBar } from "expo-status-bar";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.dark.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="log-entry"
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
          contentStyle: { backgroundColor: Colors.dark.surface },
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DM_Sans_400Regular: DMSans_400Regular,
    DM_Sans_500Medium: DMSans_500Medium,
    DM_Sans_600SemiBold: DMSans_600SemiBold,
    DM_Sans_700Bold: DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <SleepProvider>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.dark.background }}>
          <KeyboardProvider>
            <StatusBar style="light" />
            <RootLayoutNav />
          </KeyboardProvider>
        </GestureHandlerRootView>
      </SleepProvider>
    </ErrorBoundary>
  );
}
