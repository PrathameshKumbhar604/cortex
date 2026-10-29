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
