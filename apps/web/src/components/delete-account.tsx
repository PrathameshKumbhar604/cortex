"use client";

import { useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { Loader2, Trash2 } from "lucide-react";

/** Delete account: sign in first; then type DELETE to confirm, so a stray tap can't do it. */
export function DeleteAccount() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!isLoaded) return <Loader2 className="size-5 animate-spin text-hair" aria-label="Loading" />;
  if (!user)
    return (
      <Link href="/sign-in?next=/delete-account" className="inline-flex rounded-[10px] bg-ink px-4 py-2.5 text-[14px] font-[550] text-on-ink hover:bg-ink-2">
        Sign in to delete your account
      </Link>
    );

  const remove = async () => {
    setBusy(true);
    setProblem(null);
    const res = await fetch("/api/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: true }) }).catch(() => null);
    if (res?.status === 204) {
      await signOut().catch(() => {});
      window.location.replace("/sign-in");
      return;
    }
    setBusy(false);
    setProblem(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "We couldn't reach Cortex. Check your connection and try again.");
  };

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-line-strong p-4">
      <p className="text-[14px] text-ink">
        Signed in as <b className="font-[550]">{user.primaryEmailAddress?.emailAddress}</b>
      </p>
      <label htmlFor="confirm-delete" className="text-[13.5px] text-muted">
        Type <span className="font-mono text-ink">DELETE</span> to confirm
      </label>
      <input
        id="confirm-delete"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className="rounded-[10px] border border-line-strong bg-surface px-3 py-2 font-mono text-[15px] text-ink focus:border-accent/60"
      />
      {problem && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
          {problem}
        </p>
      )}
      <button
        type="button"
        onClick={() => void remove()}
        disabled={typed.trim() !== "DELETE" || busy}
        className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-risk px-4 py-2.5 text-[14px] font-[550] text-white disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
        Delete my account and data
      </button>
    </div>
  );
}
