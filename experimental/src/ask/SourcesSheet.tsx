import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";
import { sourceName, type Evidence } from "@cortex/shared";
import { shortDate } from "@/lib/format";
import { cleanSnippet, plainText } from "@/lib/snippet";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Press, Rule, Txt } from "@/ui/primitives";
import { Sheet } from "@/ui/Sheet";
import { Favicon, siteOf } from "./Logo";

/** The quiet "[logos] 4 sources" pill under an answer. */
export function SourcesPill({ evidence, cited, onOpen }: { evidence: Evidence[]; cited: Set<string>; onOpen: () => void }) {
  const { c } = useTheme();
  const items = evidence.filter(Boolean);
  const main = items.some((e) => cited.has(e.id)) ? items.filter((e) => cited.has(e.id)) : items;
  const faces = main.filter((e, i) => main.findIndex((x) => (siteOf(x) ?? x.source) === (siteOf(e) ?? e.source)) === i).slice(0, 3);
  if (!main.length) return null;
  return (
    <Press accessibilityLabel={`${main.length} sources`} onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingLeft: 6, paddingRight: 12 }}>
      <View style={{ flexDirection: "row" }}>
        {faces.map((e, i) => (
          <View key={e.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 11, borderWidth: 2, borderColor: c.surface }}>
            <Favicon ev={e} size={18} />
          </View>
        ))}
      </View>
      <Txt variant="small" tone="ink2" style={{ fontSize: 13 }}>
        {main.length} source{main.length > 1 ? "s" : ""}
      </Txt>
    </Press>
  );
}

/**
 * The evidence behind an answer: cited sources first, numbered like the markers in the text; what was searched but
 * not cited stays folded away. `at` opens it scrolled to one source, which flashes indigo once.
 */
export function SourcesSheet({ evidence, cited, query, at, onClose }: { evidence: Evidence[]; cited: Set<string>; query: string; at: string | null; onClose: () => void }) {
  const { c } = useTheme();
  const items = useMemo(() => evidence.filter(Boolean), [evidence]);
  const main = items.some((e) => cited.has(e.id)) ? items.filter((e) => cited.has(e.id)) : items;
  const rest = items.some((e) => cited.has(e.id)) ? items.filter((e) => !cited.has(e.id)) : [];
  const [more, setMore] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef(new Map<string, number>());

  useEffect(() => {
    if (!at) return;
    if (rest.some((e) => e.id === at)) setMore(true);
    const t = setTimeout(() => {
      const y = offsets.current.get(at);
      if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }, 360);
    return () => clearTimeout(t);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = (e: Evidence) => (
    <SourceCard key={e.id} ev={e} n={cited.has(e.id) ? evidence.indexOf(e) + 1 : undefined} query={query} flash={at === e.id} onLayout={(y) => offsets.current.set(e.id, y)} />
  );

  return (
    <Sheet open={at !== null} onClose={onClose} title={`Sources · ${main.length}`} scroll>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 16 }}>
        {main.map(card)}
        {rest.length > 0 && (
          <>
            <Rule style={{ marginVertical: 8, marginHorizontal: 12 }} />
            <Press onPress={() => setMore((m) => !m)} accessibilityState={{ expanded: more }} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12 }}>
              <ChevronRight size={14} color={c.muted} style={{ transform: [{ rotate: more ? "90deg" : "0deg" }] }} />
              <Txt variant="small" tone="muted">
                Also searched, not cited · {rest.length}
              </Txt>
            </Press>
            {more && rest.map(card)}
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

function SourceCard({ ev, n, query, flash, onLayout }: { ev: Evidence; n?: number; query: string; flash: boolean; onLayout: (y: number) => void }) {
  const { c } = useTheme();
  const site = siteOf(ev);
  const snippet = cleanSnippet(ev.quote, query, 220);
  const lift = useSharedValue(0);
  useEffect(() => {
    if (flash) {
      lift.value = 1;
      lift.value = withTiming(0, { duration: 1400 });
    }
  }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps
  const bg = useAnimatedStyle(() => ({ backgroundColor: lift.value > 0.01 ? `rgba(84,67,214,${0.14 * lift.value})` : "transparent" }));

  return (
    <Animated.View onLayout={(e) => onLayout(e.nativeEvent.layout.y)} style={[{ borderRadius: 12 }, bg]}>
      <Pressable
        disabled={!ev.url}
        onPress={() => ev.url && void Linking.openURL(ev.url)}
        accessibilityRole={ev.url ? "link" : undefined}
        android_ripple={{ color: c.pressed }}
        style={{ paddingHorizontal: 12, paddingVertical: 12, gap: 4 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {n != null && (
            <View style={{ minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: c.accentWash, borderWidth: 1, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
              <Txt variant="cite" tone="ink2" style={{ fontSize: 11 }}>
                {n}
              </Txt>
            </View>
          )}
          <Favicon ev={ev} size={16} />
          <Txt variant="note" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {site ?? sourceName(ev.source)}
          </Txt>
          {!site && ev.timestamp && (
            <Txt variant="note" tone="hair">
              · {shortDate(ev.timestamp)}
            </Txt>
          )}
        </View>
        <Txt variant="small" numberOfLines={2} style={{ fontFamily: font.sans550, fontSize: 14.5 }}>
          {plainText(ev.title) || site || sourceName(ev.source)}
        </Txt>
        {!!snippet && (
          <Txt variant="small" tone="ink2" numberOfLines={3}>
            {snippet}
          </Txt>
        )}
      </Pressable>
    </Animated.View>
  );
}
