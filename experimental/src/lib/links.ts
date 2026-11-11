import { Linking } from "react-native";

/**
 * Opens a link from an answer or a source. Those come from model output and from the user's mail, pages and the web,
 * so only web and mail links open: never tel:, intent:, file: or another app's deep link.
 */
export function openLink(url: string | undefined) {
  if (url && /^(https?:\/\/|mailto:)/i.test(url)) void Linking.openURL(url).catch(() => {});
}
