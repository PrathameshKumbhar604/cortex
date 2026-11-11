import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ArrowUp, X } from "@/ui/icons";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { raise } from "@/theme/tokens";
import { font } from "@/theme/type";
import { Press, Txt } from "@/ui/primitives";
import { MAX } from "./TurnView";

/**
 * Cortex's question back about an action, as a pick-one card above the ask bar (the web's Choices): each likely answer
 * is one tap, and the last row takes your own. Dismissed, the ask bar below still works as usual.
 */
export function Choices({ question, options, onPick }: { question: string; options: string[]; onPick: (answer: string) => void }) {
  const { c, scheme } = useTheme();
  const [other, setOther] = useState("");
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const mine = other.trim();
  const pick = (a: string) => (haptic.tap(), onPick(a));
  const num = (n: number) => (
    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
      <Txt variant="readout" tone="muted" style={{ fontSize: 11 }}>
        {n}
      </Txt>
    </View>
  );

  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[{ marginBottom: 10, borderRadius: 14, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, padding: 6 }, raise(scheme)]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingLeft: 10, paddingTop: 4 }}>
        <Txt variant="small" accessibilityRole="header" numberOfLines={4} style={{ flex: 1, fontFamily: font.sansSemi, paddingTop: 6 }}>
          {question}
        </Txt>
        <Press accessibilityLabel="Dismiss choices" onPress={() => setOpen(false)} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
          <X size={16} color={c.muted} />
        </Press>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 232 }}>
        {options.map((o, i) => (
          <Press key={o} onPress={() => pick(o)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 }}>
            {num(i + 1)}
            <Txt variant="small" tone="ink2" style={{ flex: 1 }}>
              {o}
            </Txt>
          </Press>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, paddingLeft: 10, paddingRight: 4 }}>
        {num(options.length + 1)}
        <TextInput
          value={other}
          onChangeText={setOther}
          maxLength={MAX}
          placeholder={options.length ? "Something else…" : "Type your answer…"}
          placeholderTextColor={c.muted}
          accessibilityLabel="Type your own answer"
          cursorColor={c.accent}
          selectionColor={c.accent}
          returnKeyType="send"
          onSubmitEditing={() => mine && pick(mine)}
          style={{ flex: 1, minHeight: 44, padding: 0, fontFamily: font.sans, fontSize: 14.5, color: c.ink }}
        />
        {!!mine && (
          <Press accessibilityLabel="Send answer" onPress={() => pick(mine)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.ink, alignItems: "center", justifyContent: "center" }}>
            <ArrowUp size={16} color={c.onInk} />
          </Press>
        )}
      </View>
    </Animated.View>
  );
}
