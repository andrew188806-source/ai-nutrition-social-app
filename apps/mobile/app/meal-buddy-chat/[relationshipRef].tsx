import { useLocalSearchParams, useRouter } from "expo-router";
import { useConsumerRuntime } from "../../features/consumer-runtime";
import { MealBuddyChatScreen } from "../../features/meal-buddy-chat/MealBuddyChatScreen";
import { useMealBuddyChat } from "../../features/meal-buddy-chat/useMealBuddyChat";
import { MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX } from "../../features/meal-buddy-chat/types";

// Entering this route is the explicit user intent that lazily opens the canonical conversation.
// Route presence is never treated as authorization: the server re-checks the current relationship,
// participation and block authority on every open/list/send.
export default function MealBuddyChatRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ relationshipRef?: string }>();
  const raw = Array.isArray(params.relationshipRef) ? params.relationshipRef[0] : params.relationshipRef;
  const relationshipRef = typeof raw === "string" && raw.startsWith(MEAL_BUDDY_CHAT_RELATIONSHIP_REF_PREFIX)
    ? raw
    : null;
  const runtime = useConsumerRuntime();
  const controller = useMealBuddyChat(
    runtime.mode === "supabase" ? runtime.state.actorKey : null,
    runtime.state.actorGeneration,
    relationshipRef
  );

  return <MealBuddyChatScreen controller={controller} onBack={() => router.back()} />;
}
