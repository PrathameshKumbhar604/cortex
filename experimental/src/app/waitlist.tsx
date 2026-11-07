import { useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOnboarding } from "@/auth/OnboardingProvider";
import { onForeground } from "@/connections/connect";
import { useTheme } from "@/theme/ThemeProvider";
import { Hourglass, LogOut, RotateCw } from "@/ui/icons";
import { Button, Txt, Wordmark } from "@/ui/primitives";

/** A new account while sign-up approval is manual: wait here; approval lets you in by itself. */
export default function Waitlist() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { message, recheck } = useOnboarding();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    await recheck();
    setChecking(false);
  };
  // Checks again whenever the app comes back, and every 30 seconds while it's open.
  useEffect(() => {
    const off = onForeground(() => void recheck());
    const t = setInterval(() => void recheck(), 30_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [recheck]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={checking} onRefresh={() => void check()} colors={[c.accent]} />}
    >
      <Wordmark size={24} />
      <View style={{ marginTop: 40 }}>
        <Hourglass size={24} color={c.accent} strokeWidth={1.75} />
      </View>
      <Txt variant="headline" accessibilityRole="header" style={{ marginTop: 12 }}>
        You're on the waitlist
      </Txt>
      <Txt variant="body" tone="muted" style={{ marginTop: 8 }}>
        {message ?? "You're on the waitlist. The admin will approve your account soon."}
      </Txt>
      {user?.primaryEmailAddress && (
        <Txt variant="small" tone="ink2" style={{ marginTop: 16 }}>
          Signed in as {user.primaryEmailAddress.emailAddress}. This screen lets you in by itself once you're approved.
        </Txt>
      )}
      <View style={{ marginTop: 32, flexDirection: "row", gap: 8 }}>
        <Button label="Check again" icon={<RotateCw size={16} color={c.onInk} />} busy={checking} onPress={() => void check()} />
        <Button kind="ghost" label="Sign out" icon={<LogOut size={16} color={c.muted} />} onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );
}
