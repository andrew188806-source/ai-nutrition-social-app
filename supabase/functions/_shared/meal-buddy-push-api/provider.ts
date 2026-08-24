import type {
  MealBuddyPushEnvelope,
  MealBuddyPushProvider,
  MealBuddyPushProviderTicket
} from "./types.ts";

export const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send" as const;
const MAX_BATCH = 100;

// The Expo push service. It is the ONLY outbound edge of this feature, it is reached from the
// dispatcher alone, and its verdicts are translated into a closed vocabulary here so that no
// provider internal — status text, ticket id, receipt detail — can reach Mobile or a Social API.
export function createExpoPushProvider(accessToken: string | null): MealBuddyPushProvider {
  return {
    async send(envelopes: readonly MealBuddyPushEnvelope[]): Promise<readonly MealBuddyPushProviderTicket[]> {
      if (envelopes.length === 0) return Object.freeze([]);
      if (envelopes.length > MAX_BATCH) throw new Error("meal_buddy_push_batch_too_large");
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json"
      };
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;

      let response: Response;
      try {
        response = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify(envelopes)
        });
      } catch {
        // The provider was unreachable. Every envelope stays retryable; nothing is lost and no
        // Social state is touched.
        return freezeAll(envelopes.map(() => retryable("push_provider_unreachable")));
      }
      if (!response.ok) {
        // 429 and 5xx are transient; a 4xx means this batch will never be accepted as-is.
        const transient = response.status === 429 || response.status >= 500;
        return freezeAll(envelopes.map(() => transient
          ? retryable(`push_provider_status_${response.status}`)
          : permanent(`push_provider_status_${response.status}`)));
      }
      let payload: unknown;
      try { payload = await response.json(); } catch {
        return freezeAll(envelopes.map(() => retryable("push_provider_unparseable")));
      }
      const tickets = (payload as { data?: unknown })?.data;
      if (!Array.isArray(tickets) || tickets.length !== envelopes.length) {
        return freezeAll(envelopes.map(() => retryable("push_provider_ticket_mismatch")));
      }
      return freezeAll(tickets.map(readTicket));
    }
  };
}

function readTicket(ticket: unknown): MealBuddyPushProviderTicket {
  const record = (ticket ?? {}) as Record<string, unknown>;
  if (record.status === "ok") return Object.freeze({ ok: true as const });
  const detail = (record.details ?? {}) as Record<string, unknown>;
  const error = typeof detail.error === "string" ? detail.error : "";
  // A device the provider no longer recognises must be retired, not retried forever.
  if (error === "DeviceNotRegistered") {
    return Object.freeze({ ok: false as const, retryable: false, unregistered: true, message: error });
  }
  const transient = error === "MessageRateExceeded" || error === "";
  return Object.freeze({
    ok: false as const,
    retryable: transient,
    unregistered: false,
    message: error || "push_provider_rejected"
  });
}

function retryable(message: string): MealBuddyPushProviderTicket {
  return Object.freeze({ ok: false as const, retryable: true, unregistered: false, message });
}
function permanent(message: string): MealBuddyPushProviderTicket {
  return Object.freeze({ ok: false as const, retryable: false, unregistered: false, message });
}
function freezeAll(tickets: readonly MealBuddyPushProviderTicket[]) {
  return Object.freeze([...tickets]);
}
