import AsyncStorage from "@react-native-async-storage/async-storage";

// Small device-only settings (theme, sound, voice…): loaded once before the splash hides, then read synchronously,
// and written through to AsyncStorage. Chats use their own store (src/chats/store.ts).
const PREFIX = "cortex.pref:";
const mem = new Map<string, string>();
let loaded = false;

export const prefs = {
  async load(): Promise<void> {
    if (loaded) return;
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
      for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) mem.set(k.slice(PREFIX.length), v);
    } catch {
      // storage unreadable: start from defaults
    }
    loaded = true;
  },
  getString(key: string): string | undefined {
    return mem.get(key);
  },
  set(key: string, value: string): void {
    mem.set(key, value);
    void AsyncStorage.setItem(PREFIX + key, value).catch(() => {});
  },
  delete(key: string): void {
    mem.delete(key);
    void AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  },
  getBool(key: string, fallback: boolean): boolean {
    const v = mem.get(key);
    return v == null ? fallback : v === "1";
  },
  setBool(key: string, on: boolean): void {
    prefs.set(key, on ? "1" : "0");
  },
};
