"use client";

import { HandleSSOCallback } from "@clerk/nextjs";
import { Interstitial } from "@/components/interstitial";
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
    <>
      <Interstitial label="Signing you in" note="Getting your workspace ready." />
      <HandleSSOCallback navigateToApp={({ decorateUrl }) => go(decorateUrl(next()))} navigateToSignIn={() => go("/sign-in")} navigateToSignUp={() => go("/sign-in")} />
    </>
  );
}
