import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../components/DemoUi";
import type { MealBuddySourceCard } from "./types";
import type { MealBuddyRealCandidatesController } from "./useMealBuddyRealCandidates";

// SR-2G-E2 real source-card selection.
//
// This is the ONLY way real mode acquires a source identity. It lists the actor's own real active
// Meal Buddy cards exactly as the canonical SR-2G-B endpoint returned them, and selecting one sends
// that card's opaque `sourceCardRef` — never a field, never a position, never a fallback.
//
// It keeps the screen's existing "pick one of my cards and use it" interaction rather than adding a
// second parallel selector. A single card is still selected explicitly, so the interaction does not
// change shape with the number of cards and no new product rule is introduced.

const MEAL_PERIOD_LABELS: Readonly<Record<MealBuddySourceCard["mealPeriod"], string>> = Object.freeze({
  breakfast: "早餐", lunch: "午餐", dinner: "晚餐", late_night: "宵夜"
});
const INTENTION_LABELS: Readonly<Record<MealBuddySourceCard["intentionType"], string>> = Object.freeze({
  chat_first: "先聊聊", eat_together: "直接約飯"
});

export function MealBuddyRealSourceCardPicker({
  controller
}: {
  controller: MealBuddyRealCandidatesController;
}) {
  const { sourceCards, selectedSourceCardRef } = controller;

  if (sourceCards.phase === "idle") return null;

  if (sourceCards.phase === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>正在讀取你的飯友卡…</Text>
      </View>
    );
  }

  if (sourceCards.phase === "failed") {
    const isAuth = sourceCards.code === "authentication_required";
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>{isAuth ? "請重新登入" : "暫時無法讀取飯友卡"}</Text>
        {/* Deliberately generic: no raw server body, status code or stack reaches a user. */}
        <Text style={styles.muted}>
          {isAuth ? "登入狀態已過期，請重新登入後再試一次。" : "連線或服務暫時有問題，請稍後再試一次。"}
        </Text>
        <Pressable style={styles.retry} accessibilityRole="button" onPress={() => { void controller.loadSourceCards(); }}>
          <Text style={styles.retryText}>重新載入</Text>
        </Pressable>
      </View>
    );
  }

  // Zero real active cards is the canonical NO_SOURCE_CARD state: there is nothing to search from,
  // and no card is fabricated to fill the gap.
  if (sourceCards.cards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>還沒有有效的飯友卡</Text>
        <Text style={styles.muted}>建立一張飯友卡之後，就能用它尋找適合的飯友。</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <Text style={styles.heading}>選一張飯友卡來找飯友</Text>
      {sourceCards.cards.map((card) => {
        const selected = card.sourceCardRef === selectedSourceCardRef;
        return (
          <Pressable
            // The opaque reference is the identity, and it is also the list key: nothing about the
            // card's contents is used to tell one card from another.
            key={card.sourceCardRef}
            accessibilityRole="button"
            style={[styles.card, selected ? styles.cardSelected : null]}
            onPress={() => { void controller.selectSourceCard(card.sourceCardRef); }}
          >
            <Text style={styles.cardTitle} numberOfLines={1}>
              {card.diningDate} · {MEAL_PERIOD_LABELS[card.mealPeriod]}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {card.cardType === "restaurant" ? "指定餐廳" : "不指定餐廳"} · {INTENTION_LABELS[card.intentionType]}
            </Text>
            {selected ? <Text style={styles.selectedTag}>使用中</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, marginBottom: 12 },
  heading: { fontSize: 13, fontWeight: "700", color: colors.ink },
  card: {
    padding: 12, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.card, gap: 2
  },
  cardSelected: { borderColor: colors.teal, backgroundColor: colors.mint },
  cardTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.muted },
  selectedTag: { fontSize: 11, color: colors.teal, fontWeight: "700" },
  centered: { alignItems: "center", gap: 8, paddingVertical: 20 },
  stateTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted, textAlign: "center" },
  retry: {
    marginTop: 8, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 999, backgroundColor: colors.teal
  },
  retryText: { color: "#FFFFFF", fontWeight: "700" }
});
