import { useLocalSearchParams, useRouter } from "expo-router";
import { useConsumerRuntime } from "../../features/consumer-runtime";
import { MealBuddyChatScreen } from "../../features/meal-buddy-chat/MealBuddyChatScreen";
import { useMealBuddyChat } from "../../features/meal-buddy-chat/useMealBuddyChat";
import { MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX } from "../../features/meal-buddy-chat/types";
import { MEAL_BUDDY_REF_PREFIXES, readMealBuddyRouteRef } from "../../features/meal-buddy-relationships/refBoundary";

// Entering this route is the explicit user intent that lazily opens the canonical conversation.
// Route presence is never treated as authorization: the server re-checks the current relationship,
// participation and block authority on every open/list/send.
export default function MealBuddyChatRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ relationshipRef?: string }>();
  // SR-2K-A: the frozen SR-2J-B prefix remains the source of truth for this route’s identity
  // family, and the shared boundary additionally bounds the length and rejects every other family.
  // Should the two frozen prefixes ever diverge, the route fails closed instead of guessing.
  const relationshipRef = MEAL_BUDDY_REF_PREFIXES.relationship === MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX
    ? readMealBuddyRouteRef(params.relationshipRef, "relationship")
    : null;
  const runtime = useConsumerRuntime();
  const controller = useMealBuddyChat(
    runtime.mode === "supabase" ? runtime.state.actorKey : null,
    runtime.state.actorGeneration,
    relationshipRef
  );

  // SR-2K-A: this screen must never become a trap. When there is nothing to pop — a cold load
  // straight into this route — the user is returned to the canonical Meal Buddy relationship area,
  // which rebuilds itself from the server relationship list and needs no thread identity to do so.
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: "/meal-buddies", params: { section: "friends" } });
  };

  return <MealBuddyChatScreen controller={controller} onBack={goBack} />;
}
