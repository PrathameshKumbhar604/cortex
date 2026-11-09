import type { ExpoConfig } from "expo/config";

// APP_ENV comes from the EAS build profile (eas.json). Only development builds may talk plain HTTP to the laptop on the LAN.
const dev = (process.env.APP_ENV ?? "development") === "development";

const config: ExpoConfig = {
  name: "Cortex",
  slug: "cortex",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "cortex",
  userInterfaceStyle: "automatic",
  backgroundColor: "#f4f3f0",
  android: {
    package: "app.cortex.android",
    adaptiveIcon: {
      backgroundColor: "#5b47e0",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    permissions: ["android.permission.RECORD_AUDIO"],
    blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "@clerk/expo",
    ["expo-audio", { microphonePermission: "Cortex uses the microphone for dictation and voice mode." }],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 88,
        backgroundColor: "#f4f3f0",
        dark: { image: "./assets/images/splash-icon.png", backgroundColor: "#0b0c10" },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          targetSdkVersion: 36,
          usesCleartextTraffic: dev,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  owner: "pratham503",
  extra: { eas: { projectId: "a876ef80-be71-4ef8-8d03-e223bb276c05" } }, // the EAS project that builds this app
};

export default config;
