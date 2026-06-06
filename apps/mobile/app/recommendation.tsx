import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, DemoModeToggle, IconBubble, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { useDemoUserPlan } from "../features/demo-user-plan";
import {
  DailyNutritionPlanner,
  NextMealRecommendationWithPlan,
  PlannedDinnerInput,
  PlannedMealCard,
  clearPlannedDinner,
  getDefaultPlannedDinner,
  getPlannedDinner,
  savePlannedDinner,
  type PlannedMeal
} from "../features/planned-meal";
import {
  getAiRecommendationMealBuddyCard,
  setPendingMatchRequest,
  upsertMealBuddyCardWithQuota
} from "../features/meal-buddy-card";

export default function RecommendationScreen() {
  const router = useRouter();
  const [planExpanded, setPlanExpanded] = useState(false);
  const [plannedDinner, setPlannedDinner] = useState<PlannedMeal | null>(() => getPlannedDinner());
  const [draftPlan, setDraftPlan] = useState<PlannedMeal>(() => getPlannedDinner() ?? getDefaultPlannedDinner());
  const [demoMode, setDemoMode] = useDemoUserPlan();
  const [rerunCount, setRerunCount] = useState(0);

  function savePlan() {
    savePlannedDinner(draftPlan);
    setPlannedDinner(draftPlan);
    setPlanExpanded(false);
  }

  function clearPlan() {
    clearPlannedDinner();
    setPlannedDinner(null);
    setDraftPlan(getDefaultPlannedDinner());
    setPlanExpanded(false);
  }

  function createAiMealBuddyCard() {
    const card = getAiRecommendationMealBuddyCard();
    upsertMealBuddyCardWithQuota(card, demoMode);
    setPendingMatchRequest(card, demoMode === "premium" ? 5 : 3, false, demoMode);
    router.push("/meal-buddies");
  }

  function confirmAiMealBuddyCard() {
    Alert.alert(zhTW.mobile.refinedLogic.mealBuddyCard.aiCreateQuestion, zhTW.mobile.refinedLogic.mealBuddyCard.withAiPrompt, [
      { text: zhTW.common.close, style: "cancel" },
      { text: zhTW.mobile.refinedLogic.mealBuddyCard.confirmCreate, onPress: createAiMealBuddyCard }
    ]);
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.nextMealTitle}
      subtitle={zhTW.mobile.nextMealSubtitle}
      primaryAction={{ href: "/social", label: zhTW.mobile.correctedFlow.triggerMealBuddy }}
    >
      <DemoModeToggle mode={demoMode} onChange={setDemoMode} />
      <Card tone="amber">
        <View style={styles.heroCard}>
          <IconBubble icon="GO" />
          <View style={styles.flex}>
            <Text style={styles.heroLabel}>{zhTW.mobile.recommendation.title}</Text>
            <Text style={styles.heroTitle}>{zhTW.mobile.recommendation.hero}</Text>
            <Text style={styles.body}>{zhTW.mobile.recommendation.reason}</Text>
          </View>
        </View>
      </Card>

      {zhTW.mobile.recommendation.cards.map((card) => (
        <Card key={card.title}>
          <SectionTitle title={card.title} subtitle={card.body} />
        </Card>
      ))}

      <PlannedDinnerInput expanded={planExpanded} onChange={setDraftPlan} onClear={clearPlan} onExpand={() => setPlanExpanded(true)} onSave={savePlan} plan={draftPlan} saved={Boolean(plannedDinner)} />

      {plannedDinner ? <PlannedMealCard plan={plannedDinner} /> : null}

      <DailyNutritionPlanner plan={plannedDinner} />

      <NextMealRecommendationWithPlan plan={plannedDinner} onRerun={() => setRerunCount((count) => count + 1)} />

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.refinedLogic.mealBuddyCard.preciseRecommendationTitle} subtitle={zhTW.mobile.refinedLogic.mealBuddyCard.withAiPrompt} />
        <Pressable style={styles.groupButton} onPress={confirmAiMealBuddyCard}>
          <Text style={styles.groupButtonText}>{zhTW.mobile.refinedLogic.mealBuddyCard.useThisMealCta}</Text>
        </Pressable>
      </Card>

      {rerunCount > 0 ? (
        <Card tone="mint">
          <SectionTitle title={zhTW.mobile.plannedDinner.rerunLunchCta} subtitle={zhTW.mobile.plannedDinner.lunchAdvice[1]} />
        </Card>
      ) : null}

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.restaurantTitle} subtitle={zhTW.mobile.recommendation.restaurantPreview} />
        <View style={styles.tagsWrap}>
          <TagRow tags={zhTW.mobile.recommendation.tags} />
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.mealLog.foodMemoryTitle} subtitle={zhTW.mobile.recommendation.foodMemoryReason} />
        <Pressable style={styles.groupButton} onPress={() => router.push("/meal-buddies")}>
          <Text style={styles.groupButtonText}>{zhTW.mobile.communityCard.nearbyButton}</Text>
        </Pressable>
      </Card>

      <Card tone="premium">
        <PremiumBadge label={zhTW.mobile.premiumUi.premiumTables} />
        <SectionTitle title={zhTW.mobile.recommendation.groupTableCtaTitle} subtitle={zhTW.mobile.recommendation.groupTableCtaBody} />
        <Pressable style={styles.groupButton} onPress={() => router.push("/meal-buddies?section=tables")}>
          <Text style={styles.groupButtonText}>{zhTW.mobile.recommendation.groupTableCta}</Text>
        </Pressable>
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14
  },
  flex: {
    flex: 1,
    gap: 8
  },
  heroLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  body: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  tagsWrap: {
    marginTop: 14
  },
  groupButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  groupButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  }
});

