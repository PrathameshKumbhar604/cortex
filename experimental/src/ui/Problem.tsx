import { useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { CloudOff, Info, RotateCw } from "lucide-react-native";
import type { Explained } from "@cortex/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Press, Txt } from "./primitives";

/**
 * An explained problem, the same way everywhere (like the web): a calm title, one sentence, one action, and the
 * technical reason folded away under "Details". `note` for a part that's missing, `card` when nothing came back.
 */
export function Problem({ problem, onRetry, variant = "note" }: { problem: Explained; onRetry?: () => void; variant?: "note" | "card" }) {
  const { c } = useTheme();
  const [details, setDetails] = useState(false);
  const Icon = variant === "card" ? CloudOff : Info;
  const action = problem.action;
  return (
    <View
      accessibilityRole={variant === "card" ? "alert" : undefined}
      style={[{ flexDirection: "row", gap: 10, alignItems: "flex-start" }, variant === "card" ? { borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.surface, padding: 14 } : { paddingVertical: 4 }]}
    >
      <Icon size={variant === "card" ? 16 : 14} color={c.muted} strokeWidth={1.75} style={{ marginTop: 3 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant={variant === "card" ? "body" : "small"} tone={variant === "card" ? "ink" : "ink2"} style={variant === "card" ? { fontFamily: font.sans550 } : undefined}>
          {problem.title}
          {variant === "note" && <Txt variant="small" tone="muted">{` · ${problem.body}`}</Txt>}
        </Txt>
        {variant === "card" && (
          <Txt variant="small" tone="muted" style={{ marginTop: 2 }}>
            {problem.body}
          </Txt>
        )}
        {(action || problem.detail) && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 6, alignItems: "center" }}>
            {action?.kind === "retry" && onRetry && (
              <Press onPress={onRetry} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36 }}>
                <RotateCw size={14} color={c.accentInk} />
                <Txt variant="small" tone="accentInk" style={{ fontFamily: font.sans550 }}>
                  Try again
                </Txt>
              </Press>
            )}
            {action?.kind === "link" && (
              <Press onPress={() => router.navigate(action.href as Href)} style={{ minHeight: 36, justifyContent: "center" }}>
                <Txt variant="small" tone="accentInk" style={{ fontFamily: font.sans550 }}>
                  {action.label}
                </Txt>
              </Press>
            )}
            {problem.detail && (
              <Press onPress={() => setDetails((d) => !d)} style={{ minHeight: 36, justifyContent: "center" }}>
                <Txt variant="note" tone="muted">
                  {details ? "Hide details" : "Details"}
                </Txt>
              </Press>
            )}
          </View>
        )}
        {details && problem.detail && (
          <Txt selectable variant="code" tone="ink2" style={{ fontSize: 11.5, lineHeight: 17, backgroundColor: c.hover, borderRadius: 6, padding: 8, marginTop: 4 }}>
            {problem.detail}
          </Txt>
        )}
      </View>
    </View>
  );
}
