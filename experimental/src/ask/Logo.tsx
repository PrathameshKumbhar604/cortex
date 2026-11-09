import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import type { Evidence } from "@cortex/shared";
import { faviconUrl, hostOf } from "@/lib/snippet";
import { Dot } from "@/ui/primitives";

// The same logos the web shows: each app's own mark, a web source's favicon, and the source dot when neither loads.
const gstatic = (app: string) => `https://ssl.gstatic.com/images/branding/product/2x/${app}_2020q4_48dp.png`;
const APP_LOGO: Record<string, string> = {
  gmail: gstatic("gmail"),
  calendar: gstatic("calendar"),
  tasks: "https://ssl.gstatic.com/images/branding/product/2x/tasks_48dp.png", // Tasks has no 2020q4 asset
  drive: gstatic("drive"),
  notion: faviconUrl("notion.so"),
  slack: faviconUrl("slack.com"),
  github: faviconUrl("github.com"),
};

export const siteOf = (ev: Evidence & { host?: string }) => (ev.source === "web" ? (hostOf(ev.url) ?? ev.host) : undefined);

export function Logo({ source, src = APP_LOGO[source], size = 18 }: { source: string; src?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Dot source={source} size={8} />
      </View>
    );
  return (
    <Image
      source={src}
      onError={() => setBroken(true)}
      cachePolicy="disk"
      accessibilityIgnoresInvertColors
      style={{ width: size, height: size, borderRadius: 5, backgroundColor: "#ffffff" }}
      contentFit="contain"
    />
  );
}

export function Favicon({ ev, size }: { ev: Evidence & { host?: string }; size?: number }) {
  const host = siteOf(ev);
  return <Logo source={ev.source} src={host ? faviconUrl(host) : APP_LOGO[ev.source]} size={size} />;
}
