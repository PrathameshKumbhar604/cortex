import type { TextStyle } from "react-native";

// Font files are static cuts of the web's variable fonts (scripts/make-fonts.py): Fraunces at SOFT 100 like the web's
// headings, and Geist at the exact weights the web uses, including the claim weights 200 / 330 / 460.
export const font = {
  serifLight: "Fraunces-300",
  serif: "Fraunces-400",
  serifMark: "Fraunces-500",
  sans200: "Geist-200",
  sans330: "Geist-330",
  sans: "Geist-400",
  sans460: "Geist-460",
  sansMedium: "Geist-500",
  sans550: "Geist-550",
  sansSemi: "Geist-600",
  mono: "GeistMono-400",
  monoMedium: "GeistMono-500",
} as const;

/** The web's type ramp at its phone sizes. All text stays at 11px or more. */
export const type = {
  display: { fontFamily: font.serifLight, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  headline: { fontFamily: font.serif, fontSize: 26, lineHeight: 31, letterSpacing: -0.4 },
  pageTitle: { fontFamily: font.serif, fontSize: 32, lineHeight: 37, letterSpacing: -0.5 },
  wordmark: { fontFamily: font.serifMark, fontSize: 20, lineHeight: 24, letterSpacing: -0.2 },
  answer: { fontFamily: font.sans460, fontSize: 17, lineHeight: 28.9 },
  title: { fontFamily: font.sansSemi, fontSize: 15, lineHeight: 21, letterSpacing: -0.15 },
  item: { fontFamily: font.sansMedium, fontSize: 15.5, lineHeight: 21.3 },
  body: { fontFamily: font.sans, fontSize: 15, lineHeight: 24.4 },
  small: { fontFamily: font.sans, fontSize: 13.5, lineHeight: 19.6 },
  note: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 17.5 },
  readout: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.12, textTransform: "uppercase", fontVariant: ["tabular-nums"] },
  cite: { fontFamily: font.monoMedium, fontSize: 11.5, lineHeight: 13 },
  code: { fontFamily: font.mono, fontSize: 13, lineHeight: 21.5 },
} satisfies Record<string, TextStyle>;

/** Claim weight is verification state (the web's Weight-Is-Truth rule). */
export const claimFont = { pending: font.sans200, partial: font.sans330, supported: font.sans460 } as const;
