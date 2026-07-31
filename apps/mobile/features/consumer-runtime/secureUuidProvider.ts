// Single canonical secure UUID v4 authority shared by every consumer-runtime module that needs a
// clientRequestId/idempotency key (consumerMealIdentificationFinalizationRuntime,
// consumerMealWriteRuntime, consumerPlannedMealRuntime). Previously each of the three duplicated
// its own copy of this logic, and all three only checked globalThis.crypto — which Hermes/Expo Go
// on a physical iOS/Android device never populates, so every copy threw "Secure UUID generation
// unavailable." on first submit (MI-E-C5-R3 physical-device finding).
//
// Layering, in order:
//   1. globalThis.crypto.randomUUID / getRandomValues — the standard Web Crypto API. Node (used by
//      every headless smoke/guard script in this repo) and browsers/react-native-web already
//      provide this natively, so branches 2-3 are never reached in those environments.
//   2. expo-crypto's randomUUID / getRandomValues — same call shape as Web Crypto, officially
//      Expo-supported on iOS/Android/web. Loaded via a deferred `require` (not a top-level
//      `import`) because a static import throws immediately when this module is required outside
//      an actual Expo/RN runtime (confirmed: `require("expo-crypto")` throws
//      "Cannot find package 'expo-modules-core'" under plain Node) — deferring it means Node-based
//      scripts never touch this branch at all, since they always resolve at layer 1.
// No Math.random, no Date.now, no deterministic/pseudo UUID at any layer — if both real providers
// are absent, this throws rather than returning a weak or fake identifier.
export function generateSecureUuidV4(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === "function") {
    return uuidFromBytes(webCrypto.getRandomValues(new Uint8Array(16)));
  }

  const expoCrypto = loadExpoCrypto();
  if (typeof expoCrypto?.randomUUID === "function") return expoCrypto.randomUUID();
  if (typeof expoCrypto?.getRandomValues === "function") {
    return uuidFromBytes(expoCrypto.getRandomValues(new Uint8Array(16)));
  }

  throw new Error("Secure UUID generation unavailable.");
}

function loadExpoCrypto(): typeof import("expo-crypto") | null {
  try {
    return require("expo-crypto") as typeof import("expo-crypto");
  } catch {
    return null;
  }
}

function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
