import {
  defineSocialRuntimeExecutorStatement,
  type SocialRuntimeExecutorTransport
} from "../social-runtime-transport/executorTransactionTransport.ts";
import type {
  InternalPushClaimRow,
  InternalPushDeviceRow,
  InternalPushProfileRow,
  MealBuddyPushPlatform
} from "./types.ts";

const REGISTER = defineSocialRuntimeExecutorStatement<InternalPushDeviceRow>`
  select device_id::text, rotated
  from social_internal.register_meal_buddy_push_device($1::uuid, $2::text, $3::text, $4::text)
`;
const DISABLE = defineSocialRuntimeExecutorStatement<Readonly<{ device_id: string }>>`
  select device_id::text from social_internal.disable_meal_buddy_push_device($1::uuid, $2::text)
`;
const CLAIM = defineSocialRuntimeExecutorStatement<InternalPushClaimRow>`
  select notification_id::text, event_kind, recipient_user_id::text, actor_user_id::text, push_token, platform
  from social_internal.claim_meal_buddy_notifications($1::integer)
`;
const COMPLETE = defineSocialRuntimeExecutorStatement<Readonly<Record<string, never>>>`
  select social_internal.complete_meal_buddy_notification($1::uuid, $2::boolean, $3::text)
`;
const RETIRE = defineSocialRuntimeExecutorStatement<Readonly<{ retired: number }>>`
  select retired from social_internal.retire_meal_buddy_push_token($1::text)
`;
// The SAME frozen SR-2C projection every other Social surface uses, so notification copy can never
// name somebody differently from the relationship list or the chat header.
const PROFILE = defineSocialRuntimeExecutorStatement<InternalPushProfileRow>`
  select exposure_ordinal, display_name, mascot_avatar_key
  from social_internal.project_exposed_social_profiles($1::uuid, $2::uuid[])
`;

export interface MealBuddyPushRepository {
  register(userId: string, installId: string, platform: MealBuddyPushPlatform, pushToken: string): Promise<boolean>;
  disable(userId: string, installId: string): Promise<boolean>;
  claim(limit: number): Promise<readonly InternalPushClaimRow[]>;
  complete(notificationId: string, delivered: boolean, error: string | null): Promise<void>;
  retireToken(pushToken: string): Promise<number>;
  actorDisplayName(recipientUserId: string, actorUserId: string): Promise<string | null>;
}

export class ExecutorMealBuddyPushRepository implements MealBuddyPushRepository {
  constructor(private readonly transport: SocialRuntimeExecutorTransport) {}

  async register(userId: string, installId: string, platform: MealBuddyPushPlatform, pushToken: string) {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(REGISTER, [userId, installId, platform, pushToken]);
      return rows.length === 1 && typeof rows[0]?.device_id === "string" && rows[0].device_id.length > 0;
    });
  }

  async disable(userId: string, installId: string) {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(DISABLE, [userId, installId]);
      return rows.length === 1;
    });
  }

  async claim(limit: number) {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(CLAIM, [limit]);
      return Object.freeze(rows.map(parseClaim));
    });
  }

  async complete(notificationId: string, delivered: boolean, error: string | null) {
    await this.transport.withTransaction(async (transaction) => {
      await transaction.query(COMPLETE, [notificationId, delivered, error]);
    });
  }

  async retireToken(pushToken: string) {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(RETIRE, [pushToken]);
      return rows.length === 1 && Number.isInteger(rows[0]?.retired) ? rows[0].retired : 0;
    });
  }

  async actorDisplayName(recipientUserId: string, actorUserId: string) {
    return await this.transport.withTransaction(async (transaction) => {
      const rows = await transaction.query(PROFILE, [recipientUserId, [actorUserId]]);
      if (rows.length !== 1 || rows[0].exposure_ordinal !== 0) return null;
      const name = rows[0].display_name;
      return typeof name === "string" && name.length > 0 ? name : null;
    });
  }
}

function parseClaim(row: InternalPushClaimRow): InternalPushClaimRow {
  const kinds = ["meal_buddy_invite_received", "meal_buddy_invite_accepted", "meal_buddy_message_received"];
  if (!row || typeof row.notification_id !== "string" || !row.notification_id
    || !kinds.includes(row.event_kind)
    || typeof row.recipient_user_id !== "string" || !row.recipient_user_id
    || typeof row.actor_user_id !== "string" || !row.actor_user_id
    || typeof row.push_token !== "string" || !row.push_token
    || (row.platform !== "ios" && row.platform !== "android")) {
    throw new Error("meal_buddy_push_claim_invalid");
  }
  return Object.freeze({ ...row });
}
