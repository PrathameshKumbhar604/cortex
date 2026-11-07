import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

// Cortex's mark is an open "C" folding in on itself. Voice mode draws it as three concentric open arcs and a centre
// point in the voice's colour (the web's fold.tsx), moved as one object: one smoothed level, each arc a little later
// and weaker than the one inside it, one shared rotation while thinking so the gaps stay lined up.
export type FoldState = "starting" | "listening" | "hearing" | "thinking" | "speaking" | "paused";

const RINGS = [
  { r: 26, gap: 96, width: 3.6, opacity: 1, gain: 1 },
  { r: 38, gap: 82, width: 3, opacity: 0.62, gain: 0.72 },
  { r: 50, gap: 70, width: 2.4, opacity: 0.34, gain: 0.5 },
] as const;
const POSE: Record<FoldState, number> = { starting: 0.93, listening: 1, hearing: 1, thinking: 0.95, speaking: 1, paused: 0.97 };
const SIZE = 132;
const C = SIZE / 2;

/** An open arc around the centre with its gap facing right, like the C of the mark. */
function arc(r: number, gap: number) {
  const a0 = ((gap / 2) * Math.PI) / 180;
  const a1 = ((360 - gap / 2) * Math.PI) / 180;
  const p = (a: number) => `${C + r * Math.cos(a)} ${C + r * Math.sin(a)}`;
  return `M ${p(a0)} A ${r} ${r} 0 1 1 ${p(a1)}`;
}

export function Fold({ state, levels, color }: { state: FoldState; levels: () => { mic: number; out: number }; color: string }) {
  const reduced = useReducedMotion();
  const level = useSharedValue(0);
  const pose = useSharedValue(POSE.starting);
  const rot = useSharedValue(0);
  const dim = useSharedValue(0.5);

  useEffect(() => {
    pose.value = withSpring(POSE[state], { damping: 14, stiffness: 140 });
    dim.value = withTiming(state === "starting" || state === "paused" ? 0.5 : 1, { duration: 300 });
    if (state === "thinking" && !reduced) rot.value = withRepeat(withTiming(rot.value + 360, { duration: 12_800, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(rot);
      rot.value = withSpring(Math.round(rot.value / 360) * 360, { damping: 16 });
    }
  }, [state, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // The level envelope: rises fast, falls gently (attack ~50ms, release ~250ms), read ~30 times a second.
  useEffect(() => {
    if (reduced) return;
    let env = 0;
    const t = setInterval(() => {
      const { mic, out } = levels();
      const v = state === "speaking" ? out : state === "hearing" || state === "listening" ? mic : 0;
      env += (v - env) * (v > env ? 0.6 : 0.12);
      level.value = withTiming(env, { duration: 33 });
    }, 33);
    return () => clearInterval(t);
  }, [state, reduced, levels]); // eslint-disable-line react-hooks/exhaustive-deps

  const ring0 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }, { scale: pose.value + level.value * 0.05 * RINGS[0].gain }], opacity: dim.value }));
  const ring1 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }, { scale: pose.value + level.value * 0.05 * RINGS[1].gain }], opacity: dim.value }));
  const ring2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }, { scale: pose.value + level.value * 0.05 * RINGS[2].gain }], opacity: dim.value }));
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: 1 + level.value * 0.35 }], opacity: dim.value }));
  const styles = [ring0, ring1, ring2];

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: SIZE, height: SIZE }}>
      {RINGS.map((r, i) => (
        <Animated.View key={r.r} style={[{ position: "absolute", width: SIZE, height: SIZE }, styles[i]]}>
          <Svg width={SIZE} height={SIZE}>
            <Path d={arc(r.r, r.gap)} stroke={color} strokeOpacity={r.opacity} strokeWidth={r.width} strokeLinecap="round" fill="none" />
          </Svg>
        </Animated.View>
      ))}
      <Animated.View style={[{ position: "absolute", width: SIZE, height: SIZE }, dot]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={C} cy={C} r={4.2} fill={color} />
        </Svg>
      </Animated.View>
    </View>
  );
}
