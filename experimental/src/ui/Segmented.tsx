import { View } from "react-native";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Press, Txt } from "./primitives";

/** The web's segmented control: a shell track with the selected segment lifted onto the surface. */
export function Segmented<T extends string>({ value, options, onChange, label, compact }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; compact?: boolean }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", backgroundColor: c.shell, borderRadius: 10, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              if (!on) haptic.select();
              onChange(o.value);
            }}
            style={[
              { minHeight: compact ? 32 : 38, paddingHorizontal: compact ? 10 : 12, borderRadius: 8, alignItems: "center", justifyContent: "center", flexGrow: compact ? 0 : 1 },
              on && { backgroundColor: c.surface, shadowColor: "#1a1916", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
            ]}
          >
            <Txt variant="small" tone={on ? "ink" : "muted"} style={{ fontSize: 13, fontFamily: on ? font.sans550 : font.sans }}>
              {o.label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}
