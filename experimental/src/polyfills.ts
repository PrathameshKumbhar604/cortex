import * as Crypto from "expo-crypto";

// The shared code (copied from the web) calls crypto.randomUUID(); Hermes may not provide it.
const g = globalThis as { crypto?: { randomUUID?: () => string } };
g.crypto ??= {};
g.crypto.randomUUID ??= () => Crypto.randomUUID();
