// Where the Cortex backend (the existing Next.js app) runs. In development: the laptop's LAN address, e.g. http://192.168.1.20:3000.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000").replace(/\/+$/, "");
export const CLERK_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
/** Google / GitHub sign-in stays hidden until the Clerk dashboard allows the app's redirect (at deployment). */
export const OAUTH_ENABLED = process.env.EXPO_PUBLIC_OAUTH_ENABLED === "1";
