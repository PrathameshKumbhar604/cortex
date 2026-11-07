import { useState } from "react";
import { Share as NativeShare, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, ChevronLeft, ChevronRight, Copy, RotateCw, Share2 } from "@/ui/icons";
import type { Turn } from "@/agent/reduce";
import { versionInfo } from "@/agent/versions";
import { api } from "@/api/client";
import { haptic } from "@/haptics";
import { snapshot, toMarkdown } from "@/lib/share";
import { chats } from "@/state";
import { useTheme } from "@/theme/ThemeProvider";
import { Press, Txt } from "@/ui/primitives";
import { toast } from "@/ui/toast";

/** "‹ 2/3 ›": steps between the attempts at a regenerated turn. */
export function VersionSwitch({ turn, onVersion }: { turn: Turn; onVersion: (v: number) => void }) {
  const { c } = useTheme();
  const { count, index } = versionInfo(turn);
  if (count < 2) return null;
  return (
    <View accessibilityRole="adjustable" accessibilityLabel={`Version ${index + 1} of ${count}`} style={{ flexDirection: "row", alignItems: "center" }}>
      <Press accessibilityLabel="Previous version" disabled={index === 0} onPress={() => (haptic.select(), onVersion(index - 1))} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: index === 0 ? 0.3 : 1 }}>
        <ChevronLeft size={16} color={c.muted} />
      </Press>
      <Txt variant="readout" tone="muted">
        {index + 1}/{count}
      </Txt>
      <Press accessibilityLabel="Next version" disabled={index === count - 1} onPress={() => (haptic.select(), onVersion(index + 1))} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", opacity: index === count - 1 ? 0.3 : 1 }}>
        <ChevronRight size={16} color={c.muted} />
      </Press>
    </View>
  );
}

/** Quiet actions under a finished answer: versions, Copy, Share (a read-only link, through Android's share sheet), Retry. */
export function AnswerActions({ turn, chatId, onRetry, onVersion }: { turn: Turn; chatId?: string; onRetry?: () => void; onVersion?: (v: number) => void }) {
  const { c } = useTheme();
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const copy = async () => {
    const snap = snapshot(turn);
    await Clipboard.setStringAsync(toMarkdown(snap.answer, snap.sources));
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    if (!chatId) return;
    setSharing(true);
    try {
      await chats.saveNow(chatId); // the link is made from the server's copy of this chat
      const { url } = await api<{ url: string }>("/api/share", { method: "POST", json: { chatId, turnId: turn.id } });
      await NativeShare.share({ message: url, title: turn.question });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't make a link right now.");
    } finally {
      setSharing(false);
    }
  };

  const quiet = (label: string, icon: React.ReactNode, onPress?: () => void, disabled?: boolean) => (
    <Press accessibilityLabel={label} onPress={onPress} disabled={disabled} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 10, borderRadius: 8, opacity: disabled ? 0.4 : 1 }}>
      {icon}
      <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
        {label}
      </Txt>
    </Press>
  );

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginLeft: -8 }}>
      {onVersion && <VersionSwitch turn={turn} onVersion={onVersion} />}
      {quiet(copied ? "Copied" : "Copy", copied ? <Check size={14} color={c.accent} /> : <Copy size={14} color={c.muted} />, () => void copy())}
      {chatId && quiet(sharing ? "Sharing…" : "Share", <Share2 size={14} color={c.muted} />, () => void share(), sharing)}
      {quiet("Retry", <RotateCw size={14} color={c.muted} />, onRetry, !onRetry)}
    </View>
  );
}
