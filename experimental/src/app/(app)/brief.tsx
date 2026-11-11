import { useEffect, useState } from "react";
import { View } from "react-native";
import { openLink } from "@/lib/links";
import { router } from "expo-router";
import { ArrowUpRight, RotateCw } from "@/ui/icons";
import { explainFailure, sourceName } from "@cortex/shared";
import { loadBrief, markSeen, readPick, useBrief, type BriefCard } from "@/brief/seen";
import { haptic } from "@/haptics";
import { relativeDays, shortDate } from "@/lib/format";
import { useWorkspace } from "@/state/workspace";
import { prefs } from "@/storage";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Dot, Notice, Press, Rule, Txt } from "@/ui/primitives";
import { Problem } from "@/ui/Problem";
import { Screen } from "@/ui/Screen";

const SECTIONS: { kind: BriefCard["kind"]; label: string; note: string }[] = [
  { kind: "risk", label: "At risk", note: "Needs attention" },
  { kind: "conflict", label: "Conflicts", note: "Sources disagree" },
  { kind: "upcoming", label: "Upcoming", note: "Next three weeks, by date" },
  { kind: "changed", label: "Changed", note: "Last seven days" },
];

/** The brief: what's at risk, in conflict, coming up and changed across your apps, each item with its sources. */
export default function BriefScreen() {
  const { c } = useTheme();
  const { state } = useBrief();
  const info = useWorkspace();
  const [refreshing, setRefreshing] = useState(false);
  const [pick, setPick] = useState(readPick);
  const brief = state?.brief;
  const generating = !!state?.generating;
  const available = (info?.connectors ?? []).filter((x) => x.connected && x.id !== "web" && x.kind !== "upload");

  useEffect(() => {
    if (brief?.cards.length) markSeen(brief.cards);
  }, [brief]);
  // The brief builds on the server; check back while it does (the screen never waits on it).
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => void loadBrief(), 4000);
    return () => clearInterval(t);
  }, [generating]);

  const refresh = async () => {
    setRefreshing(true);
    await loadBrief(true);
    setRefreshing(false);
  };
  const toggle = (id: string) => {
    haptic.select();
    const all = available.map((a) => a.id);
    const current = pick ?? all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const save = next.length && next.length < all.length ? next : null;
    if (save) prefs.set("cortex.brief.pick", JSON.stringify(save));
    else prefs.delete("cortex.brief.pick");
    setPick(save);
    void loadBrief(true);
  };

  return (
    <Screen
      title={brief?.headline ?? (generating ? "Putting your brief together…" : "Your brief")}
      onRefresh={() => void refresh()}
      refreshing={refreshing}
      right={
        <Press accessibilityLabel="Refresh the brief" onPress={() => void refresh()} disabled={generating} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 44 }}>
          <RotateCw size={14} color={c.muted} />
          <Txt variant="small" tone="muted" style={{ fontSize: 13 }}>
            {generating ? "Updating" : "Refresh"}
          </Txt>
        </Press>
      }
      kicker={
        available.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Txt variant="readout" tone="muted">
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · Covers
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {available.map((a) => {
                const on = !pick || pick.includes(a.id);
                return (
                  <Press key={a.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(a.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 16, borderWidth: 1, borderColor: on ? c.lineStrong : c.line, paddingHorizontal: 10, minHeight: 32, opacity: on ? 1 : 0.5 }}>
                    <Dot source={a.id} />
                    <Txt variant="small" tone="ink2" style={{ fontSize: 13 }}>
                      {a.name}
                    </Txt>
                  </Press>
                );
              })}
            </View>
          </View>
        ) : undefined
      }
    >
      {state?.error && !generating && <Notice text={state.error} />}
      {brief?.failures.map((f) => <Problem key={f.source} problem={explainFailure(f)} />)}
      {!brief && !generating && !state?.error && (
        <Txt variant="body" tone="muted">
          Cortex reads your connected apps and lists what changed, what's at risk and what's coming up, each item with its sources. It refreshes every few hours, so it's ready when you open it.
        </Txt>
      )}
      {brief &&
        SECTIONS.map(({ kind, label, note }) => {
          const cards = brief.cards.filter((x) => x.kind === kind);
          if (kind === "upcoming") cards.sort((a, b) => (a.when ?? "9").localeCompare(b.when ?? "9"));
          if (!cards.length) return null;
          return (
            <View key={kind} style={{ marginBottom: 36 }}>
              <Rule strong />
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingVertical: 10 }}>
                <Txt variant="title" tone={kind === "risk" || kind === "conflict" ? "risk" : "ink"} accessibilityRole="header">
                  {label}
                </Txt>
                <Txt variant="note" tone="muted">
                  {note}
                </Txt>
              </View>
              {cards.map((card, i) => (
                <View key={card.title}>
                  {i > 0 && <Rule />}
                  <Card card={card} />
                </View>
              ))}
            </View>
          );
        })}
      {brief && (
        <Txt variant="readout" tone="hair">
          Built {shortDate(brief.generatedAt)} · {brief.sources} sources · refreshes every 3 hours
        </Txt>
      )}
    </Screen>
  );
}

function Card({ card }: { card: BriefCard }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const sources = [...new Set(card.evidence.map((e) => e.source))];
  const same = (a: string, b: string) => {
    const n = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return !a.trim() || n(a).startsWith(n(b)) || n(b).startsWith(n(a));
  };
  return (
    <View style={{ paddingVertical: 14, flexDirection: "row", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="item">{card.title}</Txt>
        {!same(card.detail, card.title) && (
          <Txt variant="small" tone="ink2" style={{ marginTop: 4, fontSize: 14, lineHeight: 21 }}>
            {card.detail}
          </Txt>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4, marginTop: 8 }}>
          {card.when && (
            <Txt variant="readout" tone="muted">
              {shortDate(card.when)} · {relativeDays(card.when)}
            </Txt>
          )}
          {card.evidence.length > 0 && (
            <Press onPress={() => setOpen((o) => !o)} accessibilityState={{ expanded: open }} style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32 }}>
              {sources.map((s) => (
                <Dot key={s} source={s} />
              ))}
              <Txt variant="readout" tone="muted">
                {card.evidence.length} source{card.evidence.length > 1 ? "s" : ""}
              </Txt>
            </Press>
          )}
        </View>
        {open && (
          <View style={{ marginTop: 8, gap: 8, borderLeftWidth: 1, borderLeftColor: c.line, paddingLeft: 12 }}>
            {card.evidence.map((e) => (
              <Txt key={e.id} variant="small" tone="ink2" onPress={e.url ? () => openLink(e.url) : undefined}>
                <Txt variant="readout" tone="muted">{`${sourceName(e.source)}  `}</Txt>
                {e.quote}
                {e.url ? "  ↗" : ""}
              </Txt>
            ))}
          </View>
        )}
      </View>
      <Press accessibilityLabel={`Ask about ${card.title}`} onPress={() => router.navigate({ pathname: "/", params: { t: "new", q: `Tell me more: ${card.title}` } })} style={{ alignSelf: "flex-start", paddingHorizontal: 10, minHeight: 36, justifyContent: "center", borderRadius: 8, backgroundColor: c.accentWash }}>
        <Txt variant="small" tone="accentInk" style={{ fontFamily: font.sans550, fontSize: 13 }}>
          Ask
        </Txt>
      </Press>
    </View>
  );
}
