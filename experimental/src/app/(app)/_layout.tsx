import { useEffect } from "react";
import { AppState, useWindowDimensions } from "react-native";
import { Drawer } from "expo-router/drawer";
import { useAuth } from "@clerk/expo";
import { DrawerContent } from "@/nav/DrawerContent";
import { chats } from "@/state";
import { refreshWorkspace } from "@/state/workspace";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Chat is home; everything else is in the drawer. On Android 16 a swipe from the very edge is system Back, so the
 * drawer also opens on a swipe across most of the screen (like the ChatGPT and Claude apps).
 */
export default function AppLayout() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { userId } = useAuth();

  // This account's chats: the phone's copy at once, then the server's, and again whenever the app comes back.
  useEffect(() => {
    if (!userId) return;
    void chats.open(userId).then(() => chats.sync());
    void refreshWorkspace();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void chats.sync();
    });
    return () => sub.remove();
  }, [userId]);

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "slide",
        swipeEdgeWidth: width * 0.6,
        swipeMinDistance: 24,
        drawerStyle: { width: Math.min(width * 0.84, 360), backgroundColor: c.shell },
        overlayColor: "rgba(11,12,16,0.28)",
        sceneStyle: { backgroundColor: c.surface },
      }}
    >
      <Drawer.Screen name="index" />
      <Drawer.Screen name="brief" />
      <Drawer.Screen name="files" />
      <Drawer.Screen name="memory" />
      <Drawer.Screen name="connections" />
    </Drawer>
  );
}
