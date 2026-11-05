import { disposableEmailBlocklist } from "disposable-email-domains-js";

const BLOCKED = new Set(disposableEmailBlocklist()); // ~170KB list: import this on the server only

/** True for throwaway inboxes (mailinator.com, any.sub.mailinator.com, …). */
export function isDisposableEmail(email: string): boolean {
  const parts = email.trim().toLowerCase().split("@").pop()!.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (BLOCKED.has(parts.slice(i).join("."))) return true;
  return false;
}
