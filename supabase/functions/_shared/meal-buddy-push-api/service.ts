import type { MealBuddyPushRepository } from "./repository.ts";
import {
  MEAL_BUDDY_PUSH_POLICY_VERSION,
  type InternalPushClaimRow,
  type MealBuddyPushDeviceRequest,
  type MealBuddyPushDeviceResponse,
  type MealBuddyPushDispatchResponse,
  type MealBuddyPushEnvelope,
  type MealBuddyPushEventKind,
  type MealBuddyPushProvider
} from "./types.ts";

// Privacy-safe zh-TW copy. A notification names WHO acted and WHAT kind of thing happened, and
// nothing else — never a message body, never meal, health or nutrition data, never an identifier.
// The lock screen therefore reveals no Social content even on an unlocked-preview device.
const TITLE = "飯友" as const;
const BODY: Readonly<Record<MealBuddyPushEventKind, (name: string) => string>> = Object.freeze({
  meal_buddy_invite_received: (name) => `${name} 邀請你成為飯友`,
  meal_buddy_invite_accepted: (name) => `${name} 已接受你的飯友邀請`,
  meal_buddy_message_received: (name) => `${name} 傳了一則訊息給你`
});

export class MealBuddyPushDeviceService {
  constructor(private readonly repository: MealBuddyPushRepository) {}

  async execute(actorUserId: string, request: MealBuddyPushDeviceRequest): Promise<MealBuddyPushDeviceResponse> {
    // The actor is the verified JWT subject and is never taken from the body, so a caller can only
    // ever register, rotate or disable their OWN installation.
    if (request.operation === "register") {
      const registered = await this.repository.register(
        actorUserId, request.installId, request.platform, request.pushToken);
      return Object.freeze({ policyVersion: MEAL_BUDDY_PUSH_POLICY_VERSION, registered });
    }
    // Disabling an installation that was never registered is not an error, and the answer is the
    // same either way so it cannot be used to probe whether a given install exists.
    await this.repository.disable(actorUserId, request.installId);
    return Object.freeze({ policyVersion: MEAL_BUDDY_PUSH_POLICY_VERSION, registered: false });
  }
}

export class MealBuddyPushDispatchService {
  constructor(
    private readonly repository: MealBuddyPushRepository,
    private readonly provider: MealBuddyPushProvider
  ) {}

  async dispatch(limit: number): Promise<MealBuddyPushDispatchResponse> {
    const claims = await this.repository.claim(limit);
    if (claims.length === 0) {
      return Object.freeze({
        policyVersion: MEAL_BUDDY_PUSH_POLICY_VERSION, claimed: 0, delivered: 0, failed: 0, retiredTokens: 0
      });
    }

    const envelopes: MealBuddyPushEnvelope[] = [];
    const sendable: InternalPushClaimRow[] = [];
    const names = new Map<string, string | null>();
    for (const claim of claims) {
      const key = `${claim.recipient_user_id}:${claim.actor_user_id}`;
      if (!names.has(key)) {
        names.set(key, await this.repository.actorDisplayName(claim.recipient_user_id, claim.actor_user_id));
      }
      const name = names.get(key) ?? null;
      // If the recipient may no longer see who acted — blocked, opted out, deleted — the event is
      // dropped rather than sent anonymously or with a stale name.
      if (!name) { await this.repository.complete(claim.notification_id, true, null); continue; }
      sendable.push(claim);
      envelopes.push(Object.freeze({
        to: claim.push_token,
        title: TITLE,
        body: BODY[claim.event_kind](name),
        data: Object.freeze({ kind: claim.event_kind, route: "meal-buddies" as const, section: "friends" as const })
      }));
    }
    if (envelopes.length === 0) {
      return Object.freeze({
        policyVersion: MEAL_BUDDY_PUSH_POLICY_VERSION,
        claimed: claims.length, delivered: 0, failed: 0, retiredTokens: 0
      });
    }

    const tickets = await this.provider.send(envelopes);
    // One event may fan out to several devices. It counts as delivered when ANY device accepted it,
    // so a single dead handset can never suppress a healthy one.
    const outcomes = new Map<string, { delivered: boolean; error: string | null }>();
    let retiredTokens = 0;
    for (let index = 0; index < sendable.length; index += 1) {
      const claim = sendable[index];
      const ticket = tickets[index] ?? { ok: false, retryable: true, unregistered: false, message: "push_missing_ticket" };
      const current = outcomes.get(claim.notification_id) ?? { delivered: false, error: null };
      if (ticket.ok) {
        current.delivered = true;
      } else {
        current.error = ticket.message;
        if (ticket.unregistered) retiredTokens += await this.repository.retireToken(claim.push_token);
      }
      outcomes.set(claim.notification_id, current);
    }

    let delivered = 0;
    let failed = 0;
    for (const [notificationId, outcome] of outcomes) {
      await this.repository.complete(notificationId, outcome.delivered, outcome.delivered ? null : outcome.error);
      if (outcome.delivered) delivered += 1; else failed += 1;
    }
    return Object.freeze({
      policyVersion: MEAL_BUDDY_PUSH_POLICY_VERSION,
      claimed: claims.length, delivered, failed, retiredTokens
    });
  }
}
