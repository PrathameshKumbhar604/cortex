// The web app's live colour tokens (apps/web/src/app/globals.css), light and dark. tokens.test.ts fails if they drift apart.

export interface Palette {
  shell: string;
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  hair: string;
  line: string;
  lineStrong: string;
  hover: string;
  pressed: string;
  onInk: string;
  accent: string;
  accentSoft: string;
  accentWash: string;
  accentInk: string;
  risk: string;
  riskSoft: string;
  warn: string;
  warnSoft: string;
  warnInk: string;
  ok: string;
  navActive: string;
  src: Record<"gmail" | "calendar" | "drive" | "notion" | "slack" | "github" | "web" | "memory" | "files", string>;
}

export const tokens: { light: Palette; dark: Palette } = {
  light: {
    shell: "#f4f3f0",
    surface: "#ffffff",
    ink: "#1a1916",
    ink2: "#3b3a36",
    muted: "#625f58",
    hair: "#6f6b63",
    line: "#e8e6e1",
    lineStrong: "#cdc9c1",
    hover: "#ebe9e4",
    pressed: "#e3e1db",
    onInk: "#ffffff",
    accent: "#5443d6",
    accentSoft: "#eeebfd",
    accentWash: "#f7f6fe",
    accentInk: "#4434c0",
    risk: "#d93a3f",
    riskSoft: "#fdf2f2",
    warn: "#b35a00",
    warnSoft: "#fff6ea",
    warnInk: "#7a3d00",
    ok: "#0b7a57",
    navActive: "#ffffff",
    src: {
      gmail: "#e5484d",
      calendar: "#12a594",
      drive: "#e5a000",
      notion: "#646b78",
      slack: "#8e4ec6",
      github: "#1b1a17",
      web: "#3e63dd",
      memory: "#5443d6",
      files: "#c2410c",
    },
  },
  dark: {
    shell: "#0b0c10",
    surface: "#111318",
    ink: "#e8eaf0",
    ink2: "#c5c9d3",
    muted: "#9097a6",
    hair: "#848b9c",
    line: "#1d2028",
    lineStrong: "#2c303b",
    hover: "#1a1d24",
    pressed: "#22252e",
    onInk: "#0b0c10",
    accent: "#8794ff",
    accentSoft: "#1c2142",
    accentWash: "#151933",
    accentInk: "#b3bbff",
    risk: "#ff6b70",
    riskSoft: "#2a1519",
    warn: "#f5a04f",
    warnSoft: "#291e12",
    warnInk: "#ffcf9c",
    ok: "#3dd68c",
    navActive: "#1d2029",
    src: {
      gmail: "#ff6369",
      calendar: "#2ebdab",
      drive: "#f5b52e",
      notion: "#9aa1b0",
      slack: "#b07ee6",
      github: "#e8eaf0",
      web: "#6e8df5",
      memory: "#8794ff",
      files: "#fb8b4c",
    },
  },
};

/** The source's mark colour, or the muted grey for an unknown source. */
export function srcColor(p: Palette, source: string): string {
  // Google Tasks lives inside Google Calendar and shares its mark, as on the web.
  return (p.src as Record<string, string>)[source === "tasks" ? "calendar" : source] ?? p.hair;
}

/** Code panels are dark in both themes, like the web terminal panel. */
export const terminal = { bg: "#0f1115", text: "#d5d8df", line: "#23262d" };

/** The web's motion curves (globals.css), as bezier points for Reanimated's Easing.bezier. */
export const ease = {
  out: [0.23, 1, 0.32, 1] as const,
  inOut: [0.77, 0, 0.175, 1] as const,
  spring: [0.34, 1.4, 0.64, 1] as const,
  claim: [0.16, 1, 0.3, 1] as const,
};

/** Light mode lifts layers with a soft shadow; dark mode by tone alone (like --raise). */
export const raise = (scheme: "light" | "dark") =>
  scheme === "light"
    ? { shadowColor: "#1a1916", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 }
    : {};
