"use client";

import { useState } from "react";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { cn } from "@/lib/ui";
import { SignInPromo } from "./sign-in-promo";
import { Wordmark } from "./shell";

type Mode = "sign-in" | "create";
type Step = "form" | "verify-signup" | "verify-device" | "reset";
type ClerkErr = { code?: string; status?: number; errors?: { code?: string }[] } | null | undefined;
export const NEXT_KEY = "cortex.next"; // where to land after Google/GitHub, read by /sso-callback

/** Plain words for what went wrong, with what to do next. Codes come from Clerk. */
function explain(err: ClerkErr, mode: Mode): string {
  const code = err?.errors?.[0]?.code ?? err?.code ?? "";
  if (/form_password_incorrect/.test(code)) return "That email and password don't match. Check them, or reset your password.";
  if (/form_identifier_not_found|invitation_account_not_exists/.test(code)) return "There's no account with this email yet. Create one instead.";
  if (/form_identifier_exists|already_exists/.test(code)) return "There's already an account with this email. Sign in instead.";
  if (/pwned/.test(code)) return "That password has shown up in a data breach elsewhere. Choose a different one.";
  if (/password/.test(code)) return "Use at least 8 characters for your password.";
  if (/form_code_incorrect|verification_failed/.test(code)) return "That code isn't right. Check the email and try again.";
  if (/expired/.test(code)) return "That code has expired. Ask for a new one.";
  if (/form_param_format_invalid|email_address/.test(code)) return "That doesn't look like an email address. Check for typos.";
  if (/user_locked/.test(code)) return "This account is locked for a little while after too many tries. Try again later.";
  if (/banned|user_disabled/.test(code)) return "This account has been turned off. Ask your Cortex admin to turn it back on.";
  if (/strategy|oauth/.test(code)) return "That way of signing in isn't turned on for this Cortex. Use your email instead.";
  if (err?.status === 429 || /too_many|rate/.test(code)) return "Too many tries in a row. Wait a minute, then try again.";
  return mode === "create" ? "We couldn't create your account just now. Try again in a moment." : "We couldn't sign you in just now. Try again in a moment.";
}

const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * Our own sign-in page on top of Clerk (no Clerk widgets, so no Clerk branding): email + password with an emailed code
 * to confirm new accounts and new devices, password reset by code, and Google/GitHub through Clerk.
 */
export function SignIn({ next }: { next: string }) {
  const { isLoaded } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const go = (url: string) => window.location.assign(url); // a full load, so the server sees the new session at once
  const finish = async (resource: typeof signIn | typeof signUp) => {
    const { error } = await resource.finalize({ navigate: ({ decorateUrl }) => go(decorateUrl(next)) });
    if (error) setProblem(explain(error as ClerkErr, mode));
  };
  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setProblem(null);
    try {
      await fn();
    } catch {
      setProblem("We can't reach Cortex right now. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };
  const fail = (err: unknown, m: Mode) => setProblem(explain(err as ClerkErr, m));

  const signInWithPassword = () =>
    run("email", async () => {
      const { error } = await signIn.password({ emailAddress: email.trim(), password });
      if (error) return fail(error, "sign-in");
      if (signIn.status === "complete") return finish(signIn);
      // A device Clerk hasn't seen before: it emails a code to confirm it's really you.
      if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        const sent = await signIn.mfa.sendEmailCode();
        if (sent.error) return fail(sent.error, "sign-in");
        setCode("");
        return setStep("verify-device");
      }
      fail(null, "sign-in");
    });

  const createAccount = () =>
    run("email", async () => {
      const { error } = await signUp.password({ emailAddress: email.trim(), password });
      if (error) return fail(error, "create");
      if (signUp.status === "complete") return finish(signUp);
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return fail(sent.error, "create");
      setCode("");
      setStep("verify-signup");
    });

  const verify = () =>
    run("code", async () => {
      if (step === "verify-signup") {
        const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
        if (error) return fail(error, "create");
        if (signUp.status === "complete") return finish(signUp);
      } else if (step === "verify-device") {
        const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
        if (error) return fail(error, "sign-in");
        if (signIn.status === "complete") return finish(signIn);
      } else {
        const checked = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
        if (checked.error) return fail(checked.error, "sign-in");
        const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password });
        if (error) return fail(error, "sign-in");
        if (signIn.status === "complete") return finish(signIn);
      }
      fail(null, mode);
    });

  const forgot = () => {
    if (!EMAIL.test(email.trim())) return setProblem("Type your email address first, then press Forgot password.");
    void run("reset", async () => {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return fail(created.error, "sign-in");
      const { error } = await signIn.resetPasswordEmailCode.sendCode();
      if (error) return fail(error, "sign-in");
      setCode("");
      setPassword("");
      setStep("reset");
    });
  };

  const resend = () =>
    run("resend", async () => {
      const r = step === "verify-signup" ? await signUp.verifications.sendEmailCode() : step === "verify-device" ? await signIn.mfa.sendEmailCode() : await signIn.resetPasswordEmailCode.sendCode();
      if (r.error) fail(r.error, mode);
    });

  const sso = (provider: "google" | "github") =>
    run(provider, async () => {
      try {
        sessionStorage.setItem(NEXT_KEY, next);
      } catch {}
      const { error } = await signIn.sso({ strategy: `oauth_${provider}`, redirectUrl: next, redirectCallbackUrl: "/sso-callback" });
      if (error) fail(error, "sign-in");
    });

  const back = () => {
    setStep("form");
    setProblem(null);
    void signIn.reset();
  };

  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <SignInPromo />

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="rise w-full max-w-[380px]">
          <div className="lg:hidden">
            <Wordmark />
            <p className="mt-2 text-[13.5px] text-muted">Answers from your work, with every claim cited and checked.</p>
          </div>

          {step !== "form" ? (
            <form
              className="mt-8 flex flex-col gap-3 lg:mt-0"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void verify();
              }}
            >
              <MailCheck className="size-6 text-accent" aria-hidden />
              <h1 className="text-[24px] font-[400] tracking-[-0.02em] text-ink">
                {step === "verify-signup" ? "Confirm your email" : step === "verify-device" ? "Confirm it's you" : "Choose a new password"}
              </h1>
              <p className="text-[14.5px] leading-relaxed text-muted">
                We emailed a 6-digit code to <span className="font-[550] text-ink-2">{email.trim()}</span>
                {step === "verify-device" ? " because this is a new device for your account." : "."}
              </p>
              <Field id="code" label="Code">
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className={cn(INPUT, "font-mono tracking-[0.3em]")}
                  placeholder="000000"
                />
              </Field>
              {step === "reset" && (
                <Field id="password" label="New password" aside={<span className="text-[12.5px] text-hair">8 characters or more</span>}>
                  <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
                </Field>
              )}
              {problem && <Problem text={problem} />}
              <button type="submit" disabled={!!busy || code.length < 6} className={PRIMARY}>
                {busy === "code" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                {step === "reset" ? "Save and sign in" : "Continue"}
              </button>
              <div className="mt-1 flex justify-between text-[13px] text-muted">
                <button type="button" onClick={back} className="hover:text-ink">
                  Back
                </button>
                <button type="button" onClick={() => void resend()} className="hover:text-ink">
                  {busy === "resend" ? "Sending…" : "Send a new code"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="mt-8 text-[26px] font-[400] tracking-[-0.025em] text-ink lg:mt-0">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
              <p className="mt-1.5 text-[14.5px] text-muted">{mode === "sign-in" ? "Sign in to pick up where you left off." : "Free. Takes ten seconds."}</p>

              <div className="mt-7 flex flex-col gap-2.5">
                <OAuthButton provider="google" busy={busy === "google"} disabled={!isLoaded || !!busy} onClick={() => void sso("google")} />
                <OAuthButton provider="github" busy={busy === "github"} disabled={!isLoaded || !!busy} onClick={() => void sso("github")} />
                <div className="my-2 flex items-center gap-3 text-[12px] text-hair">
                  <span className="h-px flex-1 bg-line" /> or continue with email <span className="h-px flex-1 bg-line" />
                </div>
              </div>

              <div role="tablist" aria-label="Sign in or create an account" className="flex rounded-[10px] bg-shell p-1">
                {(["sign-in", "create"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setProblem(null);
                    }}
                    className={cn(
                      "flex-1 rounded-[7px] py-1.5 text-[13px] transition-colors",
                      mode === m ? "bg-surface font-[550] text-ink shadow-[0_1px_2px_rgb(14_17_22/0.08)]" : "text-muted hover:text-ink",
                    )}
                  >
                    {m === "sign-in" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <form
                className="mt-4 flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busy) void (mode === "sign-in" ? signInWithPassword() : createAccount());
                }}
              >
                <Field id="email" label="Email">
                  <input id="email" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={INPUT} />
                </Field>
                <Field
                  id="password"
                  label="Password"
                  aside={
                    mode === "sign-in" ? (
                      <button type="button" onClick={forgot} className="text-[12.5px] text-muted hover:text-ink">
                        {busy === "reset" ? "Sending a code…" : "Forgot password?"}
                      </button>
                    ) : (
                      <span className="text-[12.5px] text-hair">8 characters or more</span>
                    )
                  }
                >
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={INPUT}
                  />
                </Field>

                {problem && <Problem text={problem} onSwitch={/(Sign in|Create one) instead/.test(problem) ? () => setMode(mode === "create" ? "sign-in" : "create") : undefined} switchLabel={mode === "create" ? "Sign in" : "Create account"} />}

                {/* Clerk's bot check renders here when it needs to (sign-up only). */}
                {mode === "create" && <div id="clerk-captcha" />}

                <button type="submit" disabled={!isLoaded || !!busy} className={cn(PRIMARY, "mt-1")}>
                  {busy === "email" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                  {mode === "sign-in" ? "Sign in" : "Create account"}
                </button>
              </form>

              <p className="mt-8 text-[12px] leading-relaxed text-hair">
                By continuing you agree that Cortex reads your connected apps only to answer you, and acts only when you approve.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

const PRIMARY = "inline-flex items-center justify-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-[14px] font-[550] text-on-ink hover:bg-ink-2 disabled:opacity-60";

const INPUT =
  "w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-hair focus:border-accent/60 focus-visible:outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent)]";

function Problem({ text, onSwitch, switchLabel }: { text: string; onSwitch?: () => void; switchLabel?: string }) {
  return (
    <p role="alert" className="enter rounded-md bg-warn-soft px-3 py-2 text-[13px] leading-snug text-warn-ink">
      {text}
      {onSwitch && (
        <button type="button" onClick={onSwitch} className="ml-1 font-[600] underline underline-offset-2">
          {switchLabel}
        </button>
      )}
    </p>
  );
}

/** The label names only its input; anything beside it (Forgot password?) sits outside, so it can't steal the label. */
function Field({ id, label, aside, children }: { id: string; label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-[550] text-ink-2">
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

function OAuthButton({ provider, busy, disabled, onClick }: { provider: "google" | "github"; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-line-strong px-4 py-2.5 text-[14px] font-[550] text-ink hover:bg-hover disabled:opacity-70"
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : provider === "google" ? <GoogleMark /> : <GitHubMark />}
      Continue with {provider === "google" ? "Google" : "GitHub"}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}
