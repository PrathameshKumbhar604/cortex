import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { ArrowUp, FileText, Mic, Plus, Square, X } from "@/ui/icons";
import type { RunMode } from "@cortex/shared";
import { formatSize } from "@/files/upload";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { raise } from "@/theme/tokens";
import { font } from "@/theme/type";
import { Press, Txt } from "@/ui/primitives";
import { MAX } from "./TurnView";
import { useDictation } from "./useDictation";

export interface PendingFile {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "ready" | "error";
  progress?: number;
  id?: string;
}

/**
 * The ask bar, pinned above the keyboard: + for files, voice and Fast/Deep; the field grows to six lines; the round
 * indigo button sends, becomes the mic when empty, and an ink stop square while an answer runs.
 */
export function Composer({ value, onChange, onSubmit, onStop, busy, mode, onPlus, placeholder, files, onRemove }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  mode: RunMode;
  onPlus: () => void;
  placeholder: string;
  files: PendingFile[];
  onRemove: (key: string) => void;
}) {
  const { c, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  const dictation = useDictation((text) => onChange(value.trim() ? `${value.trim()} ${text}` : text));
  const uploading = files.some((f) => f.status === "uploading");
  const empty = !value.trim();
  const canSend = !empty && !uploading && value.length <= MAX;

  return (
    <View style={[{ borderRadius: 22, borderWidth: 1, borderColor: focused ? c.accent : c.lineStrong, backgroundColor: c.surface, paddingTop: files.length ? 10 : 4, paddingBottom: 6, paddingHorizontal: 6 }, raise(scheme)]}>
      {files.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 6, paddingBottom: 4 }}>
          {files.map((f) => (
            <Animated.View key={f.key} entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: f.status === "error" ? c.risk : c.line, backgroundColor: c.shell, paddingLeft: 8, paddingRight: 2, height: 36 }}>
              {f.status === "uploading" ? <ActivityIndicator size="small" color={c.accent} /> : <FileText size={14} color={c.muted} />}
              <View style={{ maxWidth: 150 }}>
                <Txt variant="note" tone="ink2" numberOfLines={1}>
                  {f.name}
                </Txt>
                <Txt variant="readout" tone="hair" style={{ fontSize: 11 }}>
                  {f.status === "uploading" ? `${Math.round((f.progress ?? 0) * 100)}%` : f.status === "error" ? "Failed" : formatSize(f.size)}
                </Txt>
              </View>
              <Press accessibilityLabel={`Remove ${f.name}`} onPress={() => onRemove(f.key)} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                <X size={14} color={c.muted} />
              </Press>
            </Animated.View>
          ))}
        </ScrollView>
      )}
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={dictation.state === "recording" ? "Listening… tap the mic to stop" : dictation.state === "transcribing" ? "Writing down what you said…" : placeholder}
        placeholderTextColor={dictation.state === "idle" ? c.hair : c.accentInk}
        multiline
        maxLength={MAX + 200}
        cursorColor={c.accent}
        selectionColor={c.accent}
        accessibilityLabel="Ask Cortex"
        maxFontSizeMultiplier={1.5}
        style={{ fontFamily: font.sans, fontSize: 16.5, lineHeight: 23, color: c.ink, maxHeight: 23 * 6 + 16, minHeight: 44, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Press accessibilityLabel="Attach files, voice mode and more" onPress={() => (haptic.tap(), onPlus())} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
          <Plus size={19} color={c.ink2} strokeWidth={1.75} />
        </Press>
        <Press accessibilityLabel={`Mode: ${mode === "fast" ? "Fast" : "Deep"}. Change it with plus.`} onPress={onPlus} style={{ paddingHorizontal: 10, minHeight: 36, justifyContent: "center" }}>
          <Txt variant="readout" tone={mode === "deep" ? "accentInk" : "muted"}>
            {mode === "fast" ? "Fast" : "Deep"}
          </Txt>
        </Press>
        <View style={{ flex: 1 }} />
        {value.length > MAX * 0.9 && (
          <Txt variant="readout" tone={value.length > MAX ? "risk" : "muted"} style={{ marginRight: 6 }}>
            {value.length}/{MAX}
          </Txt>
        )}
        {busy ? (
          <RoundButton label="Stop" bg={c.ink} onPress={() => (haptic.tap(), onStop())}>
            <Square size={13} color={c.onInk} fill={c.onInk} />
          </RoundButton>
        ) : empty ? (
          <MicButton state={dictation.state} onPress={dictation.toggle} />
        ) : (
          <RoundButton label="Send" bg={canSend ? c.accent : c.lineStrong} disabled={!canSend} onPress={() => (haptic.tap(), onSubmit())}>
            <ArrowUp size={19} color={canSend ? "#ffffff" : c.muted} strokeWidth={2.25} />
          </RoundButton>
        )}
      </View>
    </View>
  );
}

function RoundButton({ label, bg, disabled, onPress, children }: { label: string; bg: string; disabled?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Press accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      {children}
    </Press>
  );
}

function MicButton({ state, onPress }: { state: "idle" | "recording" | "transcribing"; onPress: () => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const ring = useSharedValue(1);
  useEffect(() => {
    ring.value = state === "recording" && !reduced ? withRepeat(withTiming(1.25, { duration: 700 }), -1, true) : 1;
  }, [state, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: ring.value }], opacity: state === "recording" ? 0.25 : 0 }));
  return (
    <View>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0, borderRadius: 20, backgroundColor: c.accent }, halo]} />
      <RoundButton label={state === "recording" ? "Stop dictation" : "Dictate"} bg={state === "recording" ? c.accent : c.shell} disabled={state === "transcribing"} onPress={onPress}>
        {state === "transcribing" ? <ActivityIndicator size="small" color={c.accent} /> : <Mic size={18} color={state === "recording" ? "#ffffff" : c.ink2} strokeWidth={1.75} />}
      </RoundButton>
    </View>
  );
}
