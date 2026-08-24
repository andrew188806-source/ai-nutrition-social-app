import { Platform } from "react-native";
import type {
  MealBuddyPushDevicePort,
  MealBuddyPushPermissionStatus,
  MealBuddyPushPlatform
} from "./types";

// SR-2K-B device port over expo-notifications.
//
// The module is resolved lazily and every call is guarded, because push is optional infrastructure:
// on web, in Expo Go where remote push is unavailable, or in a build without the native module, the
// port simply reports "unsupported" and Social keeps working untouched. Nothing here throws into
// the app, and nothing here stores a token — the token goes straight to the sealed server table.
type ExpoNotificationsLike = {
  getPermissionsAsync(): Promise<{ status: string; canAskAgain?: boolean }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(options?: { projectId?: string }): Promise<{ data: string }>;
};

function loadNotifications(): ExpoNotificationsLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("expo-notifications") as ExpoNotificationsLike;
    return typeof module?.getPermissionsAsync === "function" ? module : null;
  } catch {
    return null;
  }
}

function loadProjectId(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constants = require("expo-constants") as {
      default?: { easConfig?: { projectId?: string }; expoConfig?: { extra?: { eas?: { projectId?: string } } } };
    };
    const value = constants.default;
    return value?.easConfig?.projectId ?? value?.expoConfig?.extra?.eas?.projectId;
  } catch {
    return undefined;
  }
}

function normalizeStatus(status: string): MealBuddyPushPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

function nativePlatform(): MealBuddyPushPlatform | null {
  return Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : null;
}

export function createExpoMealBuddyPushDevicePort(): MealBuddyPushDevicePort {
  const notifications = loadNotifications();
  const platform = notifications ? nativePlatform() : null;
  return Object.freeze({
    platform,
    async getPermission(): Promise<MealBuddyPushPermissionStatus> {
      if (!notifications || platform === null) return "denied";
      try { return normalizeStatus((await notifications.getPermissionsAsync()).status); }
      catch { return "denied"; }
    },
    async requestPermission(): Promise<MealBuddyPushPermissionStatus> {
      if (!notifications || platform === null) return "denied";
      try { return normalizeStatus((await notifications.requestPermissionsAsync()).status); }
      catch { return "denied"; }
    },
    async getPushToken(): Promise<string | null> {
      if (!notifications || platform === null) return null;
      try {
        // A remote push token needs an EAS project. Without one the platform cannot mint a token,
        // which the controller reports as unsupported rather than as a failure to retry.
        const projectId = loadProjectId();
        const token = await notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        const value = token?.data;
        return typeof value === "string" && value.length >= 8 ? value : null;
      } catch {
        return null;
      }
    }
  });
}
