import type { MealBuddyChatRealtimePort, MealBuddyChatRealtimeSubscription } from "./types";

// SR-2K-B realtime transport.
//
// A PRIVATE Supabase Broadcast channel, never `postgres_changes`: the message tables are sealed from
// every client role by the frozen SR-2J-A authority, and subscribing here is authorized by RLS that
// re-evaluates the CURRENT accepted relationship plus block and participation. Holding a topic
// therefore grants nothing once the pair ends, is blocked, or the actor signs out.
//
// The frame carries no payload the app trusts. It only wakes the controller, which then re-reads
// canonical history through the frozen chat API.
export type SupabaseRealtimeChannelLike = {
  on(type: "broadcast", filter: Readonly<{ event: string }>, callback: () => void): SupabaseRealtimeChannelLike;
  subscribe(): SupabaseRealtimeChannelLike;
  unsubscribe(): Promise<unknown> | unknown;
};
export type SupabaseRealtimeClientLike = {
  channel(topic: string, options?: Readonly<{ config?: Readonly<{ private?: boolean }> }>): SupabaseRealtimeChannelLike;
  removeChannel?(channel: SupabaseRealtimeChannelLike): Promise<unknown> | unknown;
};

export const MEAL_BUDDY_CHAT_REALTIME_EVENT = "meal_buddy_chat_activity" as const;

export function createSupabaseMealBuddyChatRealtimePort(
  client: SupabaseRealtimeClientLike
): MealBuddyChatRealtimePort {
  return Object.freeze({
    subscribe(topic: string, onActivity: () => void): MealBuddyChatRealtimeSubscription {
      const channel = client
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: MEAL_BUDDY_CHAT_REALTIME_EVENT }, () => { onActivity(); })
        .subscribe();
      let released = false;
      return Object.freeze({
        unsubscribe() {
          if (released) return;
          released = true;
          try {
            // Removing the channel is what actually stops delivery for this actor. It is called on
            // every teardown path — screen leave, actor change, sign-out and fail-closed — so a
            // subscription can never outlive the session that authorized it.
            if (client.removeChannel) void client.removeChannel(channel);
            else void channel.unsubscribe();
          } catch {
            // A transport already torn down by the platform is not an error worth surfacing.
          }
        }
      });
    }
  });
}
