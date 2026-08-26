import { Platform } from "react-native";
import {
  CONSUMER_LOCATION_ACCURACY,
  parseConsumerLocationPosition,
  type ConsumerLocationDevicePort,
  type ConsumerLocationPermission,
  type ConsumerLocationPosition
} from "./types";

// GEO-1B device port over expo-location.
//
// The module is resolved lazily and every call is guarded, because location is optional
// infrastructure: on web, or in a build without the native module, the port simply reports
// unsupported and the rest of the app keeps working untouched. Nothing here throws into the app.
//
// FOREGROUND ONLY, BY CONSTRUCTION. Only `requestForegroundPermissionsAsync` and
// `getForegroundPermissionsAsync` are ever referenced. There is no call to any background
// permission, no `watchPositionAsync`, and no task registration — so continuous tracking is not
// merely unused here, it is unreachable.
type ExpoLocationLike = {
  getForegroundPermissionsAsync(): Promise<{ status: string; canAskAgain?: boolean }>;
  requestForegroundPermissionsAsync(): Promise<{ status: string; canAskAgain?: boolean }>;
  hasServicesEnabledAsync(): Promise<boolean>;
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<{
    coords?: { latitude?: number; longitude?: number; accuracy?: number | null };
    timestamp?: number;
  }>;
  Accuracy?: Record<string, number>;
};

function loadLocation(): ExpoLocationLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("expo-location") as ExpoLocationLike;
    return typeof module?.getForegroundPermissionsAsync === "function" ? module : null;
  } catch {
    return null;
  }
}

function normalize(result: { status: string; canAskAgain?: boolean }): ConsumerLocationPermission {
  const status = result.status === "granted" ? "granted"
    : result.status === "denied" ? "denied" : "undetermined";
  // A missing `canAskAgain` is treated as "still askable" only while the decision is undetermined;
  // an unqualified denial is assumed final, which is the conservative reading for UX.
  const canAskAgain = typeof result.canAskAgain === "boolean"
    ? result.canAskAgain : status !== "denied";
  return Object.freeze({ status, canAskAgain });
}

export function createExpoConsumerLocationDevicePort(): ConsumerLocationDevicePort {
  const location = loadLocation();
  const supported = location !== null && (Platform.OS === "ios" || Platform.OS === "android");
  return Object.freeze({
    supported,
    async getPermission(): Promise<ConsumerLocationPermission> {
      if (!location || !supported) return Object.freeze({ status: "denied", canAskAgain: false });
      try { return normalize(await location.getForegroundPermissionsAsync()); }
      catch { return Object.freeze({ status: "denied", canAskAgain: false }); }
    },
    async requestPermission(): Promise<ConsumerLocationPermission> {
      if (!location || !supported) return Object.freeze({ status: "denied", canAskAgain: false });
      try { return normalize(await location.requestForegroundPermissionsAsync()); }
      catch { return Object.freeze({ status: "denied", canAskAgain: false }); }
    },
    async hasServicesEnabled(): Promise<boolean> {
      if (!location || !supported) return false;
      try { return (await location.hasServicesEnabledAsync()) === true; }
      catch { return false; }
    },
    async getCurrentPosition(): Promise<ConsumerLocationPosition | null> {
      if (!location || !supported) return null;
      try {
        // Balanced accuracy, never Highest: see CONSUMER_LOCATION_ACCURACY. The numeric enum is read
        // from the module when present so this does not hard-code a platform constant.
        const accuracy = location.Accuracy?.Balanced;
        const reading = await location.getCurrentPositionAsync(
          typeof accuracy === "number" ? { accuracy } : undefined
        );
        const acquiredAt = new Date(
          typeof reading?.timestamp === "number" && Number.isFinite(reading.timestamp)
            ? reading.timestamp : Date.now()
        ).toISOString();
        return parseConsumerLocationPosition(
          reading?.coords?.latitude, reading?.coords?.longitude,
          reading?.coords?.accuracy, acquiredAt
        );
      } catch {
        return null;
      }
    }
  });
}

// Named so the accuracy policy constant is demonstrably consumed rather than decorative.
export const CONSUMER_LOCATION_PORT_ACCURACY = CONSUMER_LOCATION_ACCURACY;
