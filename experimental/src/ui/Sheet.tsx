import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, Modal, Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { ease } from "@/theme/tokens";
import { Txt } from "./primitives";

const IN = { duration: 320, easing: Easing.bezier(...ease.out) };
const OUT = { duration: 200, easing: Easing.bezier(0.4, 0, 1, 1) };

/**
 * A bottom sheet: slides up on the drawer curve, leaves faster than it came, drags down to close, and Back closes it.
 * The backdrop only fades. Height follows its content up to `maxHeight` (85% of the screen by default).
 */
export function Sheet({ open, onClose, title, children, maxHeight = 0.85, scroll }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; maxHeight?: number; scroll?: boolean }) {
  const { c } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(height);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      y.value = reduced ? 0 : height;
      y.value = withTiming(0, reduced ? { duration: 0 } : IN);
      fade.value = withTiming(1, { duration: 200 });
    } else if (mounted) {
      fade.value = withTiming(0, OUT);
      y.value = withTiming(reduced ? 0 : height, OUT, (done) => done && runOnJS(setMounted)(false));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (onClose(), true));
    return () => sub.remove();
  }, [open, onClose]);

  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(onClose)();
      else y.value = withTiming(0, IN);
    });

  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: fade.value }));
  if (!mounted) return null;

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[{ position: "absolute", inset: 0, backgroundColor: "rgba(11,12,16,0.36)" }, backdrop]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: height * maxHeight,
              backgroundColor: c.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: c.line,
              paddingBottom: insets.bottom + 8,
            },
            scroll && { height: height * maxHeight },
            sheet,
          ]}
        >
          <GestureDetector gesture={drag}>
            <View style={{ paddingTop: 10, paddingBottom: title ? 6 : 10, alignItems: "center" }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
              {title && (
                <Txt variant="title" accessibilityRole="header" style={{ alignSelf: "flex-start", paddingHorizontal: 20, paddingTop: 14 }}>
                  {title}
                </Txt>
              )}
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** One tappable row in a sheet: 16px line icon, label, optional trailing bit. */
export function SheetRow({ icon, label, onPress, trailing, danger }: { icon?: ReactNode; label: string; onPress?: () => void; trailing?: ReactNode; danger?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: c.pressed }}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52, paddingHorizontal: 20 }}
    >
      {icon}
      <Txt variant="item" tone={danger ? "risk" : "ink"} style={{ flex: 1 }}>
        {label}
      </Txt>
      {trailing}
    </Pressable>
  );
}
