"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { NEXT_KEY } from "@/components/sign-in";

/** Where Google and GitHub send people back: Clerk finishes the sign-in here (no Clerk UI), then we go on. */
export default function SSOCallbackPage() {
  const go = (url: string) => window.location.assign(url);
  const next = () => {
    try {
      const n = sessionStorage.getItem(NEXT_KEY);
      return n?.startsWith("/") && !n.startsWith("//") ? n : "/";
    } catch {
      return "/";
    }
  };
  return (
    <div className="grid min-h-dvh place-items-center bg-shell">
      <p className="flex items-center gap-2 text-[14px] text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Signing you in…
      </p>
      <HandleSSOCallback navigateToApp={({ decorateUrl }) => go(decorateUrl(next()))} navigateToSignIn={() => go("/sign-in")} navigateToSignUp={() => go("/sign-in")} />
    </div>
  );
}
