import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Logo } from "@/ask/Logo";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { X } from "@/ui/icons";
import { Press, Txt } from "@/ui/primitives";

const POLL_MS = 2000;

/**
 * Connects GitHub, Slack or Notion inside Cortex: Composio's sign-in page in an in-app dialog that closes itself once
 * the app shows up connected (Composio Connect has no return link, so the status is polled while it's open).
 * Google refuses sign-in in embedded web views, so a "Continue with Google" step inside is handed to the secure sheet.
 */
export function ConnectDialog({
  target,
  isConnected,
  onDone,
}: {
  target: { id: string; name: string; url: string } | null;
  isConnected: () => Promise<boolean>;
  onDone: (connected: boolean) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!target) return;
    setLoading(true);
    let live = true;
    const timer = setInterval(async () => {
      if (live && (await isConnected().catch(() => false)) && live) {
        live = false;
        onDone(true);
      }
    }, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [target, isConnected, onDone]);

  return (
    <Modal visible={!!target} animationType="slide" statusBarTranslucent onRequestClose={() => onDone(false)}>
      <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 56, borderBottomWidth: 1, borderBottomColor: c.line }}>
          {target && <Logo source={target.id} size={20} />}
          <Txt variant="item" style={{ flex: 1, fontFamily: font.sans550 }} numberOfLines={1} accessibilityRole="header">
            Connect {target?.name}
          </Txt>
          <Press accessibilityLabel="Close" onPress={() => onDone(false)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <X size={20} color={c.muted} />
          </Press>
        </View>
        {target && (
          <WebView
            source={{ uri: target.url }}
            style={{ flex: 1, backgroundColor: c.surface }}
            onLoadEnd={() => setLoading(false)}
            incognito // GitHub, Slack and Notion sign-ins are not kept: the next account on this phone starts signed out
            setSupportMultipleWindows={false} // links that open a new window stay in this dialog
            onShouldStartLoadWithRequest={(req) => {
              if (/^https:\/\/accounts\.google\.com\//.test(req.url)) {
                void WebBrowser.openBrowserAsync(req.url, { showTitle: true, createTask: false });
                return false;
              }
              return /^https:/.test(req.url);
            }}
          />
        )}
        {loading && (
          <View pointerEvents="none" style={{ position: "absolute", top: insets.top + 56, left: 0, right: 0, paddingTop: 48, alignItems: "center" }}>
            <ActivityIndicator color={c.accent} />
          </View>
        )}
        <Txt variant="note" tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
          You sign in with {target?.name ?? "the app"} directly. Cortex never sees your password, and this closes by itself once you're connected.
        </Txt>
      </View>
    </Modal>
  );
}
