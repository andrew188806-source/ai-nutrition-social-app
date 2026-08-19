import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../components/DemoUi";
import { MealBuddyCandidateCard } from "./MealBuddyCandidateCard";
import type { MealBuddyRealCandidatesController } from "./useMealBuddyRealCandidates";

// SR-2G-E2 real Meal Buddy candidate section.
//
// The five states are rendered as five visibly different things. In particular a legal empty result
// and a server failure never share a treatment: one says "nobody matched this card yet", the other
// says "we could not load this", and only the second offers a retry.
//
// SERVER ORDER IS AUTHORITATIVE. The array is mapped in place — no sort, no filter, no grouping, no
// local draw and no client-side cap. Free sees at most three and Premium at most ten because the
// SERVER already decided that; this component restates no exposure rule of its own.
export function MealBuddyRealCandidateSection({
  controller, onOpenCandidate
}: {
  controller: MealBuddyRealCandidatesController;
  onOpenCandidate?: (candidateRef: string) => void;
}) {
  const { state, labels } = controller;

  if (state.phase === "idle") return null;

  if (state.phase === "loading") {
    // Nothing from a previous response is left visible underneath.
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>正在尋找適合的飯友…</Text>
      </View>
    );
  }

  if (state.phase === "noSource") {
    // A real, ordinary product state: the actor simply has no active card to search from. It is not
    // an error and offers the product's own next step rather than a retry.
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>還沒有有效的飯友卡</Text>
        <Text style={styles.muted}>建立一張飯友卡之後，就能看到適合的飯友。</Text>
      </View>
    );
  }

  if (state.phase === "failed") {
    const isAuth = state.code === "authentication_required";
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>{isAuth ? "請重新登入" : "暫時無法載入飯友"}</Text>
        {/* Deliberately generic. No raw server body, status code, SQL fragment or stack reaches a user. */}
        <Text style={styles.muted}>
          {isAuth ? "登入狀態已過期，請重新登入後再試一次。" : "連線或服務暫時有問題，請稍後再試一次。"}
        </Text>
        <Pressable style={styles.retry} accessibilityRole="button" onPress={() => { void controller.retry(); }}>
          <Text style={styles.retryText}>重新載入</Text>
        </Pressable>
      </View>
    );
  }

  if (state.candidates.length === 0) {
    // HTTP 200 with an empty array. A real answer, never backfilled with demo rows.
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>目前沒有符合的飯友</Text>
        <Text style={styles.muted}>換個日期或用餐時段，可能會有新的飯友出現。</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {state.candidates.map((candidate) => (
        <MealBuddyCandidateCard
          // The opaque person reference is used as a list key for THIS response only. It is never
          // decoded, persisted or compared across requests.
          key={candidate.candidateRef}
          candidate={candidate}
          labels={labels}
          onPress={onOpenCandidate}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 12 },
  centered: { alignItems: "center", gap: 8, paddingVertical: 24 },
  stateTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, textAlign: "center" },
  retry: {
    marginTop: 8, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, backgroundColor: colors.teal
  },
  retryText: { color: "#FFFFFF", fontWeight: "700" }
});
