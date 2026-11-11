import { Linking } from "react-native";

/**
 * Opens a link from an answer or a source. Those come from model output and from the user's mail, pages and the web,
 * so only web and mail links open: never tel:, intent:, file: or another app's deep link.
 */
/**
 * Where a link that opened the app from outside (a web page, another app) may take it. Only the sign-in return picks a
 * screen; anything else just opens Cortex, so a crafted cortex:// link can't ask a question or start the microphone.
 */
export function outsideLink(path: string, initial: boolean): string | null {
  if (/^(cortex:\/\/|\/)?\/?sso-callback([?#]|$)/.test(path)) return path;
  return initial ? "/" : null; // already open: stay where the person is
}

export function openLink(url: string | undefined) {
  if (url && /^(https?:\/\/|mailto:)/i.test(url)) void Linking.openURL(url).catch(() => {});
}
