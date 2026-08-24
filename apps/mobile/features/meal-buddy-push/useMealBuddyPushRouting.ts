import { useEffect } from "react";
import { resolveMealBuddyPushRoute } from "./types";

type NotificationResponseLike = {
  notification?: { request?: { content?: { data?: unknown } } };
};
type NotificationsModuleLike = {
  getLastNotificationResponseAsync(): Promise<NotificationResponseLike | null>;
  addNotificationResponseReceivedListener(
    listener: (response: NotificationResponseLike) => void
  ): { remove(): void };
};

function loadNotifications(): NotificationsModuleLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("expo-notifications") as NotificationsModuleLike;
    return typeof module?.addNotificationResponseReceivedListener === "function" ? module : null;
  } catch {
    return null;
  }
}

// SR-2K-B notification tap routing.
//
// A TAP IS NAVIGATION INTENT, NEVER AUTHORIZATION. The payload contains no identifier of any kind,
// so the only thing it can express is which surface to open. The destination then re-authenticates
// and re-reads canonical state, which is why an old notification that arrives after a block, an
// unfriend or a sign-out simply lands on an area that shows the current truth — it cannot reopen a
// conversation the server would now refuse.
export function useMealBuddyPushRouting(onOpenRelationshipArea: () => void) {
  useEffect(() => {
    const notifications = loadNotifications();
    if (!notifications) return;
    let cancelled = false;

    const handle = (response: NotificationResponseLike | null) => {
      if (cancelled || !response) return;
      const route = resolveMealBuddyPushRoute(response.notification?.request?.content?.data);
      // An unrecognised or forged payload routes nowhere at all.
      if (!route) return;
      onOpenRelationshipArea();
    };

    // A cold start caused by a tap is handled once, then live taps are handled while mounted.
    void notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    const subscription = notifications.addNotificationResponseReceivedListener(handle);
    return () => {
      cancelled = true;
      try { subscription.remove(); } catch { /* already removed by the platform */ }
    };
  }, [onOpenRelationshipArea]);
}
