import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Check, ChevronDown } from "lucide-react-native";
import { sourceName, type StepId } from "@cortex/shared";
import type { Turn } from "@/agent/reduce";
import { seconds } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Dot, Press, Txt } from "@/ui/primitives";

const LABEL: Record<StepId, string> = {
  understand: "Checking sources",
  recall: "Recalling memory",
  plan: "Planning",
  search: "Searching",
  synthesize: "Writing",
  verify: "Verifying",
  remember: "Remembering",
};

/** One quiet line of mono readouts that narrates the agent; tap to expand into the full trace. */
export function Readout({ turn }: { turn: Turn }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const active = (Object.keys(turn.steps) as StepId[]).find((s) => turn.steps[s].status === "active");
  const searched = turn.tools.length;
  const found = turn.tools.reduce((n, t) => n + (t.count ?? 0), 0);
  const verified = turn.groundedness != null;
  const supported = turn.claims.filter((x) => x.status === "supported").length;

  const parts: { key: string; text: string; tone?: "ink" | "ink2" | "accentInk" }[] = [{ key: "m", text: turn.mode === "fast" ? "Fast" : "Deep", tone: turn.mode === "fast" ? "ink" : undefined }];
  if (turn.route?.route === "general") parts.push({ key: "r", text: "General knowledge · not from your sources", tone: "ink2" });
  else if (turn.route?.route === "web") parts.push({ key: "r", text: "Web" });
  else if (turn.route?.sources.length) parts.push({ key: "r", text: turn.route.sources.map(sourceName).join(" · ") });
  if (turn.plan && turn.mode === "deep") parts.push({ key: "p", text: `Plan ${turn.plan.subQuestions.length}` });
  if (searched) parts.push({ key: "s", text: `Searched ${searched}${turn.steps.search.ms ? ` · ${seconds(turn.steps.search.ms)}` : ""}` });
  if (found) parts.push({ key: "f", text: `${found} found` });
  if (turn.usage) parts.push({ key: "t", text: seconds(turn.usage.ms) });

  return (
    <View style={{ marginBottom: 22 }}>
      <Press accessibilityLabel={open ? "Hide trace" : "Show trace"} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 4, minHeight: 28 }}>
        {parts.map((p) => (
          <Txt key={p.key} variant="readout" tone={p.tone ?? "muted"}>
            {p.text}
          </Txt>
        ))}
        {verified && turn.claims.length > 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Check size={12} color={c.accentInk} strokeWidth={2} />
            <Txt variant="readout" tone="accentInk">
              Verified {supported}/{turn.claims.length}
            </Txt>
          </Animated.View>
        )}
        {!turn.done && active && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pulse />
            <Txt variant="readout" tone="accentInk" numberOfLines={1}>
              {LABEL[active]}
              {turn.steps[active].detail ? ` · ${turn.steps[active].detail}` : "…"}
            </Txt>
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Txt variant="readout" tone="hair">
            Trace
          </Txt>
          <ChevronDown size={12} color={c.hair} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
        </View>
      </Press>
      {open && <Trace turn={turn} />}
    </View>
  );
}

function Pulse() {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.3, { duration: 700 }), -1, true);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }, style]} />;
}

function Trace({ turn }: { turn: Turn }) {
  const { c } = useTheme();
  const steps = Object.entries(turn.steps) as [StepId, Turn["steps"][StepId]][];
  return (
    <Animated.View entering={FadeIn.duration(280)} style={{ marginTop: 12, borderLeftWidth: 1, borderLeftColor: c.line, paddingLeft: 14, gap: 16 }}>
      <View style={{ gap: 6 }}>
        {steps.map(([id, s]) => (
          <View key={id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Txt variant="readout" tone={s.status === "active" ? "accentInk" : s.status === "done" ? "ink2" : "hair"} style={s.status === "skipped" ? { textDecorationLine: "line-through" } : undefined}>
              {LABEL[id]}
            </Txt>
            <Txt variant="readout" tone="hair">
              {s.status === "done" ? seconds(s.ms) : s.status === "skipped" ? "skipped" : ""}
            </Txt>
          </View>
        ))}
      </View>
      {turn.plan && turn.plan.subQuestions.length > 0 && (
        <View style={{ gap: 4 }}>
          <Txt variant="readout" tone="muted">
            Plan
          </Txt>
          {turn.plan.subQuestions.map((q, i) => (
            <Txt key={q.id} variant="small" tone="ink2">
              <Txt variant="readout" tone="hair">{`${i + 1}  `}</Txt>
              {q.question}
              <Txt variant="small" tone="hair">{` · ${q.sources.map(sourceName).join(", ")}`}</Txt>
            </Txt>
          ))}
          {turn.plan.window?.label && (
            <Txt variant="readout" tone="hair">
              Window · {turn.plan.window.label}
            </Txt>
          )}
        </View>
      )}
      {turn.tools.length > 0 && (
        <View style={{ gap: 6 }}>
          <Txt variant="readout" tone="muted">
            Tool calls
          </Txt>
          {turn.tools.map((t) => (
            <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Dot source={t.source} />
              <Txt variant="small" tone="ink2" numberOfLines={1} style={{ width: 84 }}>
                {sourceName(t.source)}
              </Txt>
              <Txt variant="code" tone="muted" numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
                "{t.query || "recent"}"
              </Txt>
              <Txt variant="readout" tone="hair">
                {t.count == null ? "…" : `${t.count} · ${t.cached ? "cached" : seconds(t.ms)}`}
              </Txt>
            </View>
          ))}
        </View>
      )}
      {turn.memoryUsed.length > 0 && (
        <View style={{ gap: 4 }}>
          <Txt variant="readout" tone="muted">
            Memory used
          </Txt>
          {turn.memoryUsed.map((m) => (
            <Txt key={m.id} variant="small" tone="ink2">
              {m.content}
              <Txt variant="small" tone="hair">{` · ${m.kind}`}</Txt>
            </Txt>
          ))}
        </View>
      )}
      {turn.usage && (
        <Txt variant="readout" tone="hair">
          {turn.usage.llmCalls} model call{turn.usage.llmCalls === 1 ? "" : "s"}
          {turn.usage.cachedCalls ? ` · ${turn.usage.cachedCalls} cached` : ""} · {turn.usage.toolCalls} searches
          {turn.usage.models.length ? ` · ${turn.usage.models.join(", ")}` : ""}
        </Txt>
      )}
    </Animated.View>
  );
}
