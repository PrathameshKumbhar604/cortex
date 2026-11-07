import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { Txt } from "./primitives";
import { TopBar } from "./TopBar";

/** A drawer page: top bar, a Fraunces page title, pull to refresh, then ruled content. */
export function Screen({ title, kicker, right, onRefresh, refreshing = false, children, footer }: {
  title: string;
  kicker?: ReactNode;
  right?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <TopBar right={right} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[c.accent]} tintColor={c.accent} progressBackgroundColor={c.surface} /> : undefined}
      >
        <Txt variant="pageTitle" accessibilityRole="header">
          {title}
        </Txt>
        {kicker && <View style={{ marginTop: 8 }}>{kicker}</View>}
        <View style={{ marginTop: 24 }}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}
