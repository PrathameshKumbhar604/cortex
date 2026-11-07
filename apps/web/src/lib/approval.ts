// Sign-up approval: with "manual" on, a new account waits on the waitlist until an admin approves it. Accounts that
// existed before (or were made while "auto" was on) are approved; admins and the owner never wait.

export type SignupApproval = "auto" | "manual";

export const isSignupApproval = (x: unknown): x is SignupApproval => x === "auto" || x === "manual";

/** Whether this account is on the waitlist right now. */
export function needsApproval(
  user: { role: string; email: string; verified: boolean; approved: boolean },
  mode: SignupApproval,
  isOwner: (email: string, verified: boolean) => boolean,
): boolean {
  if (mode === "auto" || user.approved || user.role === "admin") return false;
  return !isOwner(user.email, user.verified);
}

/** What a brand-new account starts as. */
export const approvedOnSignUp = (mode: SignupApproval) => mode === "auto";

export const WAITLIST_MESSAGE = "You're on the waitlist. The admin will approve your account soon.";
