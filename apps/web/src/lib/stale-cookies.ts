// Clerk cookies left in a browser by another Clerk instance (an earlier production domain, a development key, or
// another app on the same parent domain) can stop sign-in working until the person clears cookies. Clerk names its
// cookies `<name>_<suffix>`, the suffix taken from the publishable key, and falls back to the unsuffixed name when its
// own is missing, which is how a stranger's cookie gets read.

const SUFFIXED = /^(__session|__client_uat|__refresh)_(.+)$/;

/** Cookie names that belong to some other Clerk instance than the one with `suffix`. */
export function staleClerkCookies(names: string[], suffix: string): string[] {
  const has = new Set(names);
  return names.filter((n) => {
    if (n.startsWith("__clerk_db_jwt")) return true; // development-only; never valid against a production key
    const m = SUFFIXED.exec(n);
    if (m) return m[2] !== suffix;
    // Clerk writes the unsuffixed copy alongside its own suffixed one; alone, it is someone else's.
    if (n === "__session" || n === "__client_uat") return !has.has(`${n}_${suffix}`);
    return false;
  });
}

/** Clerk's suffix for a publishable key: the first 8 characters of its SHA-1 in URL-safe base64 (as @clerk/shared does). */
export async function cookieSuffix(publishableKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(publishableKey));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").slice(0, 8);
}

/** The domain one level up ("cortex.runs-on.dev" → "runs-on.dev"), where another instance may have set its cookies. */
export function parentDomain(host: string): string | null {
  if (/^[\d.]+$/.test(host)) return null;
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : null;
}
