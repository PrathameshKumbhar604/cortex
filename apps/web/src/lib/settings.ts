"use client";

import { isGender, isLang, type VoiceGender, type VoiceLang } from "./voice";

// shortcut: kept in this browser only; move to the user's account with auth (#7).
const OTHER_CHATS = "cortex.useOtherChats";
const EVENT = "cortex:settings";

/** Opt-in: may Cortex look at the user's other chats? Off unless they turned it on. */
export function readUseOtherChats(): boolean {
  try {
    return localStorage.getItem(OTHER_CHATS) === "1";
  } catch {
    return false;
  }
}

export function writeUseOtherChats(on: boolean) {
  try {
    if (on) localStorage.setItem(OTHER_CHATS, "1");
    else localStorage.removeItem(OTHER_CHATS);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage blocked: the setting stays off
  }
}

/** For useSyncExternalStore: other tabs and this one. */
export function onSettings(fn: () => void) {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

export type Theme = "system" | "light" | "dark";
const THEME = "cortex.theme";

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** "system" follows the OS; light or dark is an explicit choice (also applied before paint, see layout.tsx). */
export function writeTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(THEME);
    else localStorage.setItem(THEME, t);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  window.dispatchEvent(new Event(EVENT));
}

const SOUND = "cortex.sound";

/** Interface sounds are on (and quiet) unless the user switched them off. */
export function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND) !== "off";
  } catch {
    return false;
  }
}

export function writeSound(on: boolean) {
  try {
    if (on) localStorage.removeItem(SOUND);
    else localStorage.setItem(SOUND, "off");
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(EVENT));
}

const VOICE = "cortex.voice";

/** Voice mode's default language and voice ("hi:female"); English with a female voice until the user picks. */
export function readVoice(): { lang: VoiceLang; gender: VoiceGender } {
  try {
    const [lang, gender] = (localStorage.getItem(VOICE) ?? "").split(":");
    return { lang: isLang(lang) ? lang : "en", gender: isGender(gender) ? gender : "female" };
  } catch {
    return { lang: "en", gender: "female" };
  }
}

/** The same object while the setting is unchanged, for useSyncExternalStore. */
let voiceSnap: { key: string; value: ReturnType<typeof readVoice> } | null = null;
export function readVoiceSnapshot() {
  const value = readVoice();
  const key = `${value.lang}:${value.gender}`;
  if (voiceSnap?.key !== key) voiceSnap = { key, value };
  return voiceSnap.value;
}

export function writeVoice(lang: VoiceLang, gender: VoiceGender) {
  try {
    localStorage.setItem(VOICE, `${lang}:${gender}`);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(EVENT));
}
