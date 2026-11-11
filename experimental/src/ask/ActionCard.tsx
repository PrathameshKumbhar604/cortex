import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import Animated, { FadeIn, LinearTransition, ZoomIn } from "react-native-reanimated";
import { ArrowUpRight, Check, CircleSlash, PenLine, TriangleAlert } from "@/ui/icons";
import { openLink } from "@/lib/links";
import { sourceName, type ActionProposal } from "@cortex/shared";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Button, Dot, Txt } from "@/ui/primitives";

const STAMP = {
  executed: { label: "Done", icon: Check, tone: "ok" },
  rejected: { label: "Declined", icon: CircleSlash, tone: "muted" },
  failed: { label: "Failed", icon: TriangleAlert, tone: "risk" },
} as const;

/** Nothing happens until you approve. Decisions stamp on and stay: a declined or failed action is never removed. */
export function ActionCard({ proposal, onDecide }: { proposal: ActionProposal; onDecide: (d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<unknown> }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(proposal.args).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string])),
  );
  const pending = proposal.status === "pending" || proposal.status === "approved";
  const stamp = STAMP[proposal.status as keyof typeof STAMP];
  const verb = proposal.risk === "high" ? "Approve & send" : "Approve";

  // Feedback only when the status changes while you watch, not when an old chat is reopened.
  const seen = useRef(proposal.status);
  useEffect(() => {
    if (seen.current === proposal.status) return;
    seen.current = proposal.status;
    if (proposal.status === "executed") haptic.success();
    else if (proposal.status === "failed") haptic.error();
  }, [proposal.status]);

  const decide = async (d: "approve" | "reject") => {
    haptic.tap();
    setBusy(d);
    try {
      await onDecide(d, d === "approve" && editing ? draft : undefined);
    } finally {
      setBusy(null);
      setEditing(false);
    }
  };

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      entering={FadeIn.duration(220)}
      style={{ marginTop: 18, borderRadius: 12, borderWidth: 1, padding: 16, borderColor: pending ? c.lineStrong : c.line, backgroundColor: pending ? c.surface : c.shell }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="small" style={{ fontFamily: font.sans550, fontSize: 14.5 }}>
            {proposal.title}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <Dot source={proposal.connectorId} />
            <Txt variant="note" tone="muted">
              {sourceName(proposal.connectorId)}
              {pending ? ` · ${proposal.risk === "high" ? "Acts on your behalf · Needs your approval" : "Needs your approval"}` : ""}
            </Txt>
          </View>
        </View>
        {stamp && (
          <Animated.View key={proposal.status} entering={ZoomIn.springify().damping(12)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <stamp.icon size={14} color={c[stamp.tone]} />
            <Txt variant="readout" tone={stamp.tone}>
              {stamp.label}
            </Txt>
          </Animated.View>
        )}
      </View>

      {editing ? (
        <View style={{ marginTop: 12, gap: 10 }}>
          {Object.entries(draft).map(([k, v]) => (
            <View key={k} style={{ gap: 4 }}>
              <Txt variant="readout" tone="muted">
                {k}
              </Txt>
              <TextInput
                value={v}
                multiline={k === "body" || k === "text" || k === "content"}
                onChangeText={(t) => setDraft((d) => ({ ...d, [k]: t }))}
                cursorColor={c.accent}
                selectionColor={c.accent}
                accessibilityLabel={k}
                style={{ minHeight: k === "body" || k === "text" || k === "content" ? 110 : 44, textAlignVertical: "top", borderRadius: 8, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 10, fontFamily: font.sans, fontSize: 15, color: c.ink }}
              />
            </View>
          ))}
        </View>
      ) : (
        <View style={{ marginTop: 12, borderRadius: 8, backgroundColor: c.shell, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Txt variant="small" tone="ink2" selectable style={{ fontSize: 14, lineHeight: 21 }}>
            {proposal.summary}
          </Txt>
        </View>
      )}

      {!!proposal.result && (
        <Txt variant="small" tone={proposal.status === "failed" ? "risk" : "muted"} style={{ marginTop: 8 }}>
          {proposal.result}
        </Txt>
      )}

      {proposal.status === "executed" && !!proposal.url && (
        <Button kind="secondary" label={`View in ${sourceName(proposal.connectorId)}`} icon={<ArrowUpRight size={14} color={c.ink} />} onPress={() => openLink(proposal.url)} style={{ alignSelf: "flex-start", marginTop: 10 }} />
      )}

      {pending && (
        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Button kind="ghost" label={editing ? "Done editing" : "Edit"} icon={<PenLine size={14} color={c.muted} />} onPress={() => setEditing((e) => !e)} disabled={!!busy || Object.keys(draft).length === 0} style={{ marginRight: "auto" }} />
          <Button kind="secondary" label="Decline" onPress={() => void decide("reject")} disabled={!!busy} busy={busy === "reject"} />
          <Button label={verb} onPress={() => void decide("approve")} disabled={!!busy} busy={busy === "approve"} />
        </View>
      )}
    </Animated.View>
  );
}
