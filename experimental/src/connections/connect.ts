import { AppState } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/api/client";

/**
 * Connects an app: asks the existing /api/connections/[id] for Composio's sign-in link and opens it in a browser sheet
 * over Cortex (a Custom Tab, never an embedded web view: Google refuses sign-in there). Composio's Connect key has no
 * return address, so the person closes the sheet on Composio's "connected" page; `refresh` runs when it closes.
 */
export async function connectApp(id: string, refresh: () => Promise<unknown>, deps = { api, openBrowser: WebBrowser.openBrowserAsync }) {
  const { redirectUrl } = await deps.api<{ redirectUrl: string }>(`/api/connections/${id}`, { method: "POST", timeoutMs: 20_000 });
  await deps.openBrowser(redirectUrl, { showTitle: true, enableBarCollapsing: true, createTask: false });
  await refresh();
}

/** Refreshes whenever the app comes back to the foreground (a sign-in finished in another tab, say). */
export function onForeground(fn: () => void) {
  const sub = AppState.addEventListener("change", (s) => s === "active" && fn());
  return () => sub.remove();
}
