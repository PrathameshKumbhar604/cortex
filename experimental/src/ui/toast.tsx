import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Press } from "./primitives";

// A snackbar above the composer: one message at a time, with an optional action such as Undo.
interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  ms: number;
}
let push: (t: Toast) => void = () => {};
let seq = 0;

export function toast(text: string, action?: Toast["action"], ms = action ? 5000 : 3000) {
  push({ id: ++seq, text, action, ms });
}

export function Toasts() {
  const [t, setT] = useState<Toast | null>(null);
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    push = setT;
  }, []);
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => setT((cur) => (cur?.id === t.id ? null : cur)), t.ms);
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <Animated.View
      key={t.id}
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      accessibilityLiveRegion="polite"
      style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 96 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.ink, borderRadius: 12, paddingLeft: 16, paddingRight: 6, minHeight: 48 }}>
        <Text style={{ flex: 1, fontFamily: font.sans, fontSize: 14, color: c.onInk, paddingVertical: 12 }}>{t.text}</Text>
        {t.action && (
          <Press
            onPress={() => {
              t.action!.run();
              setT(null);
            }}
            style={{ paddingHorizontal: 12, minHeight: 40, justifyContent: "center" }}
          >
            <Text style={{ fontFamily: font.sansSemi, fontSize: 14, color: scheme === "dark" ? "#4434c0" : "#b3bbff" }}>{t.action.label}</Text>
          </Press>
        )}
      </View>
    </Animated.View>
  );
}
