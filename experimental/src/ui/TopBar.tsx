import type { ReactNode } from "react";
import { View } from "react-native";
import { useNavigation } from "expo-router";
import { Menu } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Press, Txt } from "./primitives";

/** The phone's top bar: ☰ opens the drawer, a centre slot, and a right slot. Sits under the status bar (edge-to-edge). */
export function TopBar({ center, title, right }: { center?: ReactNode; title?: string; right?: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: c.surface }}>
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 }}>
        <IconButton
          label="Open menu"
          onPress={() => {
            haptic.tap();
            nav.dispatch({ type: "OPEN_DRAWER" });
          }}
        >
          <Menu size={22} color={c.ink2} strokeWidth={1.75} />
        </IconButton>
        <View style={{ flex: 1, alignItems: "center" }}>
          {center ??
            (title ? (
              <Txt variant="title" numberOfLines={1}>
                {title}
              </Txt>
            ) : null)}
        </View>
        <View style={{ minWidth: 44, flexDirection: "row", justifyContent: "flex-end" }}>{right}</View>
      </View>
    </View>
  );
}

/** A 44px round touch target for a single icon. */
export function IconButton({ label, onPress, children, disabled }: { label: string; onPress: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Press accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      {children}
    </Press>
  );
}
