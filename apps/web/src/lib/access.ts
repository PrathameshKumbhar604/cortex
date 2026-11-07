"use client";

import { useEffect, useSyncExternalStore } from "react";

// Whether this account may use Cortex or is on the waitlist (/api/me), shared by the shell and the account menu.
export interface Access {
  status: "approved" | "pending";
  message?: string;
  /** Admins only: accounts waiting for approval. */
  waiting?: number;
}

let access: Access | null = null;
const subs = new Set<() => void>();

export async function refreshAccess() {
  try {
    const res = await fetch("/api/me");
    if (res.ok) access = (await res.json()) as Access;
  } catch {
    // offline: keep what we had
  }
  subs.forEach((f) => f());
}

export function useAccess(enabled: boolean) {
  const v = useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => access,
    () => null,
  );
  useEffect(() => {
    if (!enabled) return;
    void refreshAccess();
    // Waiting on the waitlist: check back now and then, and whenever the tab comes back, so approval lets them in.
    const t = setInterval(() => access?.status === "pending" && void refreshAccess(), 30_000);
    const onFocus = () => void refreshAccess();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);
  return v;
}
