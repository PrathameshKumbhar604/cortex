import "@/polyfills";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { setSignedOutHandler, setTokenGetter } from "@/api/client";
import { CLERK_KEY } from "@/config";
import { prefs } from "@/storage";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { OnboardingProvider, useOnboarding } from "@/auth/OnboardingProvider";
import { Toasts } from "@/ui/toast";

void SplashScreen.preventAutoHideAsync();

const FONTS = {
  "Fraunces-300": require("../../assets/fonts/Fraunces-300.ttf"),
  "Fraunces-400": require("../../assets/fonts/Fraunces-400.ttf"),
  "Fraunces-500": require("../../assets/fonts/Fraunces-500.ttf"),
  "Geist-200": require("../../assets/fonts/Geist-200.ttf"),
  "Geist-330": require("../../assets/fonts/Geist-330.ttf"),
  "Geist-400": require("../../assets/fonts/Geist-400.ttf"),
  "Geist-460": require("../../assets/fonts/Geist-460.ttf"),
  "Geist-500": require("../../assets/fonts/Geist-500.ttf"),
  "Geist-550": require("../../assets/fonts/Geist-550.ttf"),
  "Geist-600": require("../../assets/fonts/Geist-600.ttf"),
  "GeistMono-400": require("../../assets/fonts/GeistMono-400.ttf"),
  "GeistMono-500": require("../../assets/fonts/GeistMono-500.ttf"),
};

export default function Root() {
  const [fontsReady] = useFonts(FONTS);
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    void prefs.load().then(() => setPrefsReady(true));
  }, []);
  if (!fontsReady || !prefsReady) return null; // the splash stays up until fonts and settings are in

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider>
          <ClerkProvider publishableKey={CLERK_KEY} tokenCache={tokenCache}>
            <OnboardingProvider>
              <Routes />
              <Toasts />
            </OnboardingProvider>
          </ClerkProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function Routes() {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { c, scheme } = useTheme();
  const onboarding = useOnboarding();

  useEffect(() => {
    setTokenGetter((opts) => getToken(opts));
    setSignedOutHandler(() => void signOut());
  }, [getToken, signOut]);

  const ready = isLoaded && (!isSignedIn || onboarding.state !== "loading");
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.shell }, animation: "fade_from_bottom" }}>
        <Stack.Screen name="sso-callback" options={{ animation: "none" }} />
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={!!isSignedIn && onboarding.state === "waitlist"}>
          <Stack.Screen name="waitlist" />
        </Stack.Protected>
        <Stack.Protected guard={!!isSignedIn && onboarding.state === "welcome"}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={!!isSignedIn && onboarding.state === "tour"}>
          <Stack.Screen name="tour" />
        </Stack.Protected>
        <Stack.Protected guard={!!isSignedIn && onboarding.state === "done"}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="voice" options={{ animation: "slide_from_bottom", presentation: "fullScreenModal" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
