import { useEffect, useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Animated, { FadeOut, LinearTransition } from "react-native-reanimated";
import type { ActionProposal } from "@cortex/shared";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Check, ChevronLeft, ChevronRight } from "@/ui/icons";
import { Press, Txt } from "@/ui/primitives";
import { ActionCard } from "./ActionCard";

const SETTLED = new Set(["executed", "rejected"]);
const LINGER_MS = 1200; // long enough to see the Done / Declined stamp
const GAP = 12;

type Decide = (id: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<unknown>;

/**
 * The approval cards for one answer, as on the web: several at once in a swipeable carousel; a card leaves once it is
 * done or declined (after its stamp shows), a failed one stays; a quiet line counts what was decided.
 */
export function ActionDeck({ actions, onDecide }: { actions: ActionProposal[]; onDecide: Decide }) {
  const { c } = useTheme();
  const [gone, setGone] = useState(() => new Set(actions.filter((a) => SETTLED.has(a.status)).map((a) => a.id)));
  useEffect(() => {
    const fresh = actions.filter((a) => SETTLED.has(a.status) && !gone.has(a.id));
    if (!fresh.length) return;
    const t = setTimeout(() => setGone((g) => new Set([...g, ...fresh.map((a) => a.id)])), LINGER_MS);
    return () => clearTimeout(t);
  }, [actions, gone]);

  const shown = actions.filter((a) => !gone.has(a.id));
  const done = actions.filter((a) => a.status === "executed").length;
  const declined = actions.filter((a) => a.status === "rejected").length;
  const tally = [done && `${done} done`, declined && `${declined} declined`].filter(Boolean).join(" · ");

  return (
    <View>
      {shown.length > 1 ? (
        <Carousel actions={shown} onDecide={onDecide} />
      ) : (
        shown.map((a) => (
          <Animated.View key={a.id} exiting={FadeOut.duration(180)}>
            <ActionCard proposal={a} onDecide={(d, e) => onDecide(a.id, d, e)} />
          </Animated.View>
        ))
      )}
      {!!tally && actions.length > shown.length && (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
          <Check size={14} color={c.ok} />
          <Txt variant="readout" tone="muted">
            {tally}
          </Txt>
        </View>
      )}
    </View>
  );
}

function Carousel({ actions, onDecide }: { actions: ActionProposal[]; onDecide: Decide }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [at, setAt] = useState(0);
  const count = actions.length;
  const index = Math.min(at, count - 1);
  const cardWidth = Math.round((width - 40) * 0.88); // the next card peeks in, so it's clear there is more
  const step = cardWidth + GAP;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / step);
    if (i !== at) {
      haptic.select();
      setAt(i);
    }
  };
  const go = (i: number) => scroll.current?.scrollTo({ x: Math.max(0, Math.min(count - 1, i)) * step, animated: true });

  return (
    <View accessibilityLabel="Actions waiting for your approval" style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Txt variant="readout" tone="muted" accessibilityLiveRegion="polite">
          Needs your approval · {index + 1} of {count}
        </Txt>
        <View style={{ flexDirection: "row" }}>
          <Press accessibilityLabel="Previous action" disabled={index === 0} onPress={() => go(index - 1)} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: index === 0 ? 0.3 : 1 }}>
            <ChevronLeft size={18} color={c.muted} />
          </Press>
          <Press accessibilityLabel="Next action" disabled={index >= count - 1} onPress={() => go(index + 1)} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: index >= count - 1 ? 0.3 : 1 }}>
            <ChevronRight size={18} color={c.muted} />
          </Press>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap: GAP, paddingRight: 40 }}
        style={{ marginHorizontal: -20 }}
      >
        <View style={{ width: 20 - GAP }} />
        {actions.map((a, i) => (
          <Animated.View key={a.id} layout={LinearTransition.duration(220)} exiting={FadeOut.duration(180)} accessibilityLabel={`${i + 1} of ${count}: ${a.title}`} style={{ width: cardWidth, marginTop: -18 }}>
            <ActionCard proposal={a} onDecide={(d, e) => onDecide(a.id, d, e)} />
          </Animated.View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 }}>
        {actions.map((a, i) => (
          <View key={a.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? c.accent : c.lineStrong }} />
        ))}
      </View>
    </View>
  );
}
