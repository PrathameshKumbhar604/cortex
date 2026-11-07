import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/expo";
import { api } from "@/api/client";
import { prefs } from "@/storage";
import { fetchUserKind } from "./onboarding";

// What the signed-in person sees first on this phone: a short welcome back (they've used Cortex on the web), the full
// tour (new to Cortex), or the app. Decided once per account per device.
export type OnboardingState = "loading" | "waitlist" | "welcome" | "tour" | "done";
const Ctx = createContext<{ state: OnboardingState; message?: string; finish: () => void; replay: () => void; recheck: () => Promise<void> } | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const [state, setState] = useState<OnboardingState>("loading");
  const [message, setMessage] = useState<string>();

  // First: may this account use Cortex, or is it on the waitlist? Then: welcome back, the tour, or straight in.
  const decide = useCallback(async () => {
    if (!userId) return;
    const me = await api<{ status: "approved" | "pending"; message?: string }>("/api/me").catch(() => ({ status: "approved" as const, message: undefined }));
    if (me.status === "pending") {
      setMessage(me.message);
      return setState("waitlist");
    }
    if (prefs.getBool(`cortex.onboarded:${userId}`, false)) return setState("done");
    const kind = await fetchUserKind().catch(() => "new" as const);
    setState(kind === "returning" ? "welcome" : "tour");
  }, [userId]);

  useEffect(() => {
    if (!isSignedIn || !userId) return setState("loading");
    void decide();
  }, [isSignedIn, userId, decide]);

  const finish = useCallback(() => {
    if (userId) prefs.setBool(`cortex.onboarded:${userId}`, true);
    setState("done");
  }, [userId]);

  const replay = useCallback(() => setState("tour"), []);
  const value = useMemo(() => ({ state, message, finish, replay, recheck: decide }), [state, message, finish, replay, decide]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOnboarding outside OnboardingProvider");
  return v;
}
