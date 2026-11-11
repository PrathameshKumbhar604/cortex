import { outsideLink } from "@/lib/links";

/** Expo Router asks this for every link that arrives from outside the app. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  return outsideLink(path, initial);
}
