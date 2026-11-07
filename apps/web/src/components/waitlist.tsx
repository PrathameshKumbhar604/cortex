"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { Hourglass, Loader2, LogOut, RotateCw } from "lucide-react";
import { refreshAccess } from "@/lib/access";
import { WAITLIST_MESSAGE } from "@/lib/approval";
import { Wordmark } from "./shell";

/** What a new account sees while sign-up approval is manual and the admin hasn't approved it yet. */
export function Waitlist({ message = WAITLIST_MESSAGE }: { message?: string }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [checking, setChecking] = useState(false);
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4">
      <div className="rise w-full max-w-[420px]">
        <Wordmark />
        <Hourglass className="mt-10 size-6 text-accent" strokeWidth={1.75} aria-hidden />
        <h1 className="mt-3 text-[28px] font-[400] leading-[1.15] tracking-[-0.015em] text-ink">You&rsquo;re on the waitlist</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{message}</p>
        {email && <p className="mt-4 text-[13.5px] text-ink-2">Signed in as {email}. This page lets you in by itself once you&rsquo;re approved.</p>}
        <div className="mt-8 flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              setChecking(true);
              await refreshAccess();
              setChecking(false);
            }}
            className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-[14px] font-[550] text-on-ink hover:bg-ink-2"
          >
            {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCw className="size-4" aria-hidden />} Check again
          </button>
          <button
            type="button"
            onClick={() => void signOut().finally(() => window.location.replace("/sign-in"))}
            className="inline-flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[14px] text-muted hover:bg-hover hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
