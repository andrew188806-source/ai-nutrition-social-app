import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Cross-platform key/value storage adapter.
// Web: backed directly by localStorage (synchronous, always up to date).
// Native: backed by an in-memory cache that is hydrated from AsyncStorage on
// startup and written through to AsyncStorage on every change, so existing
// call sites can keep using a synchronous getItem/setItem/removeItem API.
const memoryCache = new Map<string, string>();
let nativeHydration: Promise<void> | null = null;

function getWebStorage(): Storage | undefined {
  return (
    (globalThis as typeof globalThis & { window?: { localStorage?: Storage }; localStorage?: Storage }).window?.localStorage ??
    (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage
  );
}

function ensureNativeHydration(): Promise<void> {
  if (!nativeHydration) {
    nativeHydration = AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiGet(keys))
      .then((pairs) => {
        for (const [key, value] of pairs) {
          if (value != null) {
            memoryCache.set(key, value);
          }
        }
      })
      .catch(() => undefined);
  }
  return nativeHydration;
}

if (Platform.OS !== "web") {
  void ensureNativeHydration();
}

export const storage = {
  getItem(key: string): string | null {
    if (Platform.OS === "web") {
      return getWebStorage()?.getItem(key) ?? null;
    }
    return memoryCache.has(key) ? (memoryCache.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    if (Platform.OS === "web") {
      getWebStorage()?.setItem(key, value);
      return;
    }
    memoryCache.set(key, value);
    void AsyncStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (Platform.OS === "web") {
      getWebStorage()?.removeItem(key);
      return;
    }
    memoryCache.delete(key);
    void AsyncStorage.removeItem(key);
  },
  clear(): void {
    if (Platform.OS === "web") {
      getWebStorage()?.clear();
      return;
    }
    memoryCache.clear();
    void AsyncStorage.clear();
  }
};

// Resolves once the native in-memory cache has been hydrated from
// AsyncStorage. No-op (already resolved) on web.
export function getStorageReadyPromise(): Promise<void> {
  return Platform.OS === "web" ? Promise.resolve() : ensureNativeHydration();
}
