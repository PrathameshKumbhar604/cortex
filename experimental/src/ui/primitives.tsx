import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { ease, srcColor, type Palette } from "@/theme/tokens";
import { font, type as ramp } from "@/theme/type";

type Variant = keyof typeof ramp;
type Tone = keyof Omit<Palette, "src">;

/** Text on the brand ramp. `tone` picks a palette colour (ink by default). */
export function Txt({ variant = "body", tone = "ink", style, ...rest }: TextProps & { variant?: Variant; tone?: Tone }) {
  const { c } = useTheme();
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[ramp[variant] as TextStyle, { color: c[tone] }, style]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS = { duration: 160, easing: Easing.bezier(...ease.out) };

/** Every control answers the press: scale to 0.97 over 160ms (the web's button rule). */
export function Press({ style, onPressIn, onPressOut, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={6}
      {...rest}
      onPressIn={(e) => {
        if (!reduced && !rest.disabled) scale.value = withTiming(0.97, PRESS);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, PRESS);
        onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

/** Restrained and inky; the accent is kept for the Ask action. */
export function Button({ kind = "primary", label, icon, busy, disabled, onPress, style, accessibilityLabel }: {
  kind?: ButtonKind;
  label: string;
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const box: Record<ButtonKind, ViewStyle> = {
    primary: { backgroundColor: c.ink },
    secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineStrong },
    ghost: { backgroundColor: "transparent" },
    danger: { backgroundColor: c.risk },
  };
  const text: Record<ButtonKind, string> = { primary: c.onInk, secondary: c.ink, ghost: c.muted, danger: "#ffffff" };
  const off = disabled || busy;
  return (
    <Press
      onPress={onPress}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={[
        { minHeight: 44, paddingHorizontal: kind === "ghost" ? 10 : 16, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
        box[kind],
        off && { opacity: 0.55 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={text[kind]} /> : icon}
      <Text style={{ fontFamily: font.sansMedium, fontSize: 14.5, color: text[kind] }}>{label}</Text>
    </Press>
  );
}

/** A labelled text field: Strong Rule border, indigo border while focused, indigo caret. */
export function Field({ label, hint, mono, style, onFocus, onBlur, ...rest }: TextInputProps & { label: string; hint?: ReactNode; mono?: boolean }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Txt variant="small" tone="ink2" style={{ fontFamily: font.sansMedium }}>
          {label}
        </Txt>
        {hint}
      </View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.hair}
        selectionColor={c.accent}
        cursorColor={c.accent}
        maxFontSizeMultiplier={1.6}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: 48,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: focused ? c.accent : c.lineStrong,
            backgroundColor: c.surface,
            paddingHorizontal: 14,
            fontFamily: mono ? font.mono : font.sans,
            fontSize: mono ? 20 : 16,
            letterSpacing: mono ? 6 : 0,
            color: c.ink,
          },
          style,
        ]}
      />
    </View>
  );
}

/** Structure is drawn with 1px rules; `strong` is the ink rule that opens a section. */
export function Rule({ strong, style }: { strong?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: 1, backgroundColor: strong ? c.ink : c.line }, style]} />;
}

/** A source's colour, only ever at mark scale. */
export function Dot({ source, size = 6 }: { source: string; size?: number }) {
  const { c } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: srcColor(c, source) }} />;
}

/** The Cortex wordmark: Fraunces with the indigo dot. */
export function Wordmark({ size = 20 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole="header" accessibilityLabel="Cortex" style={{ fontFamily: font.serifMark, fontSize: size, color: c.ink, letterSpacing: -0.2 }}>
      Cortex<Text style={{ color: c.accent }}>.</Text>
    </Text>
  );
}

/** A plain warning line on the amber wash (never a box). */
export function Notice({ text, tone = "warn", action }: { text: string; tone?: "warn" | "info" | "risk"; action?: ReactNode }) {
  const { c } = useTheme();
  const bg = tone === "warn" ? c.warnSoft : tone === "risk" ? c.riskSoft : c.accentWash;
  const fg = tone === "warn" ? c.warnInk : tone === "risk" ? c.risk : c.accentInk;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}>
      <Text style={{ fontFamily: font.sans, fontSize: 13.5, lineHeight: 19, color: fg }}>{text}</Text>
      {action}
    </View>
  );
}
