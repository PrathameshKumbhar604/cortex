import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/expo";
import { prefs } from "@/storage";
import { fetchUserKind } from "./onboarding";

// What the signed-in person sees first on this phone: a short welcome back (they've used Cortex on the web), the full
// tour (new to Cortex), or the app. Decided once per account per device.
export type OnboardingState = "loading" | "welcome" | "tour" | "done";
const Ctx = createContext<{ state: OnboardingState; finish: () => void; replay: () => void } | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const [state, setState] = useState<OnboardingState>("loading");

  useEffect(() => {
    if (!isSignedIn || !userId) return setState("loading");
    if (prefs.getBool(`cortex.onboarded:${userId}`, false)) return setState("done");
    let live = true;
    fetchUserKind()
      .then((kind) => live && setState(kind === "returning" ? "welcome" : "tour"))
      .catch(() => live && setState("tour"));
    return () => {
      live = false;
    };
  }, [isSignedIn, userId]);

  const finish = useCallback(() => {
    if (userId) prefs.setBool(`cortex.onboarded:${userId}`, true);
    setState("done");
  }, [userId]);

  const replay = useCallback(() => setState("tour"), []);
  const value = useMemo(() => ({ state, finish, replay }), [state, finish, replay]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding outside OnboardingProvider");
  return v;
}
