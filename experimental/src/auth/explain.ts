// Plain words for Clerk errors, the same copy as the web sign-in (apps/web/src/components/sign-in.tsx).
export type Mode = "sign-in" | "create";
type ClerkErr = { code?: string; status?: number; errors?: { code?: string; longMessage?: string; long_message?: string }[] } | null | undefined;

export function explainClerk(err: unknown, mode: Mode): string {
  const e = err as ClerkErr;
  const code = e?.errors?.[0]?.code ?? e?.code ?? "";
  if (/form_password_incorrect/.test(code)) return "That email and password don't match. Check them, or reset your password.";
  if (/form_identifier_not_found|invitation_account_not_exists/.test(code)) return "There's no account with this email yet. Create one instead.";
  if (/form_identifier_exists|already_exists/.test(code)) return "There's already an account with this email. Sign in instead.";
  if (/pwned/.test(code)) return "That password has shown up in a data breach elsewhere. Choose a different one.";
  // Clerk's own words: they name the rule actually set in the dashboard (length, characters), which can change.
  if (/password/.test(code)) return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.long_message ?? "That password doesn't meet the requirements. Try a longer one.";
  if (/form_code_incorrect|verification_failed/.test(code)) return "That code isn't right. Check the email and try again.";
  if (/expired/.test(code)) return "That code has expired. Ask for a new one.";
  if (/form_param_format_invalid|email_address/.test(code)) return "That doesn't look like an email address. Check for typos.";
  if (/user_locked/.test(code)) return "This account is locked for a little while after too many tries. Try again later.";
  if (/banned|user_disabled/.test(code)) return "This account has been turned off. Ask your Cortex admin to turn it back on.";
  if (/strategy|oauth/.test(code)) return "That way of signing in isn't turned on for this Cortex. Use your email instead.";
  if (e?.status === 429 || /too_many|rate/.test(code)) return "Too many tries in a row. Wait a minute, then try again.";
  return mode === "create" ? "We couldn't create your account just now. Try again in a moment." : "We couldn't sign you in just now. Try again in a moment.";
}
