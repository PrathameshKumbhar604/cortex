import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import { prefs } from "@/storage";
import { tokens, type Palette } from "./tokens";

export type ThemePref = "system" | "light" | "dark";
interface Theme {
  c: Palette;
  scheme: "light" | "dark";
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => (prefs.getString("cortex.theme") as ThemePref) ?? "system");
  const system = useColorScheme();
  const scheme = pref === "system" ? (system === "dark" ? "dark" : "light") : pref;
  const c = tokens[scheme];

  useEffect(() => {
    // Native pieces (keyboard, dialogs, the window behind the app) follow the chosen theme too.
    Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
    void SystemUI.setBackgroundColorAsync(c.shell);
  }, [pref, c.shell]);

  const value = useMemo<Theme>(
    () => ({
      c,
      scheme,
      pref,
      setPref: (p) => {
        setPrefState(p);
        if (p === "system") prefs.delete("cortex.theme");
        else prefs.set("cortex.theme", p);
      },
    }),
    [c, scheme, pref],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(Ctx);
  if (!t) throw new Error("useTheme outside ThemeProvider");
  return t;
}
