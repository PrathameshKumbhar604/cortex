"use client";

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

const LABS = "cortex.experimental";

/** Experimental features (the Commitments radar) are shown unless the user switched them off. */
export function readLabs(): boolean {
  try {
    return localStorage.getItem(LABS) !== "off";
  } catch {
    return true;
  }
}

export function writeLabs(on: boolean) {
  try {
    if (on) localStorage.removeItem(LABS);
    else localStorage.setItem(LABS, "off");
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  window.dispatchEvent(new Event(EVENT));
}
