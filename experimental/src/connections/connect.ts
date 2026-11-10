import { AppState } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/api/client";

/** Google refuses sign-in inside an in-app web view ("disallowed_useragent"): these use the secure browser sheet. */
export const NEEDS_BROWSER_SHEET = new Set(["gmail", "calendar", "tasks", "drive"]);

/** Composio's sign-in link for one app, from the existing /api/connections/[id]. */
export async function connectLink(id: string, deps = { api }) {
  return (await deps.api<{ redirectUrl: string }>(`/api/connections/${id}`, { method: "POST", timeoutMs: 20_000 })).redirectUrl;
}

/**
 * Connects an app: asks the existing /api/connections/[id] for Composio's sign-in link and opens it in a browser sheet
 * over Cortex (a Custom Tab, never an embedded web view: Google refuses sign-in there). Composio's Connect key has no
 * return address, so the person closes the sheet on Composio's "connected" page. Composio can take a few seconds to
 * mark the account active, so after the sheet closes the status is checked a few times before giving up.
 * Resolves to whether the app is connected.
 */
export async function connectApp(
  id: string,
  refresh: () => Promise<boolean>,
  deps = { api, openBrowser: WebBrowser.openBrowserAsync, wait: (ms: number) => new Promise((r) => setTimeout(r, ms)) },
) {
  const redirectUrl = await connectLink(id, deps);
  await deps.openBrowser(redirectUrl, { showTitle: true, enableBarCollapsing: true, createTask: false });
  for (let i = 0; i < 5; i++) {
    if (await refresh()) return true;
    await deps.wait(1500);
  }
  return refresh();
}

/** Refreshes whenever the app comes back to the foreground (a sign-in finished in another tab, say). */
export function onForeground(fn: () => void) {
  const sub = AppState.addEventListener("change", (s) => s === "active" && fn());
  return () => sub.remove();
}
