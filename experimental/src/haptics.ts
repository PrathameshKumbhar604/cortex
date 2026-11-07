import * as Haptics from "expo-haptics";
import { prefs } from "@/storage";

// Light, meaningful feedback only: sending, deciding, an answer landing, something failing. Off from Settings.
const on = () => prefs.getBool("cortex.haptics", true);

export const haptic = {
  tap: () => on() && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  select: () => on() && void Haptics.selectionAsync().catch(() => {}),
  success: () => on() && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => on() && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
