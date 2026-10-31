import "server-only";
import { db } from "./db";
import { shareStore } from "@/lib/share";

export const shares = shareStore(db);

/** Where links point: NEXT_PUBLIC_APP_URL when set (behind a proxy or CDN), else the host the request came in on. */
export function appOrigin(h: Headers) {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
