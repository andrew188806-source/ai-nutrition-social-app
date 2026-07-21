import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { NutritionDetailReport } from "../components/NutritionDetailReport";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { getUiMealCalories, useTodayIntakeUiModel } from "../features/consumer-meals";
import { useConsumerRuntime } from "../features/consumer-runtime";

export default function TodayIntakeScreen() {
  const router = useRouter();
  const intake = zhTW.mobile.analysis.savedIntake;
  const daily = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake;
  const runtime = useConsumerRuntime();
  const intakeState = useTodayIntakeUiModel({
    overviewService: runtime.overviewService,
    plannedMealsLoader: runtime.getPlannedMeals,
    revision: runtime.mealDataRevision,
    actorKey: runtime.state.actorKey,
    actorGeneration: runtime.state.actorGeneration,
    enabled: runtime.state.authState.status === "signedIn"
  });
  const model = intakeState.model;

  if (!model) {
    return (
      <PlaceholderScreen title={intake.title} subtitle={intakeState.status === "error" ? intakeState.error : intake.body}>
        <Card>
          <SectionTitle title={daily.mealRecordsTitle} subtitle={zhTW.mobile.todayNutritionSummary.cardSubtitle} />
        </Card>
      </PlaceholderScreen>
    );
  }

  const { mealRecords, lunchRecord, summary, plannedMeals } = model;

  return (
    <PlaceholderScreen
      title={intake.title}
      subtitle={intake.body}
    >
      <Card tone="premium">
        <Text style={styles.savedBadge}>{intake.savedMessage}</Text>
        <View style={styles.hero}>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreText}>82</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>{intake.insight}</Text>
            <Text style={styles.heroBody}>{intake.dinnerAdvice}</Text>
            <Text style={styles.heroBody}>{intake.balanceNote}</Text>
          </View>
        </View>
      </Card>

      <NutritionDetailReport summary={summary} />

      <Card>
        <SectionTitle title={daily.mealRecordsTitle} />
        <View style={styles.mealList}>
          {mealRecords.map((meal) => (
            <View key={meal.mealId ?? `${meal.date}-${meal.mealPeriod}-${meal.mealName}`} style={styles.mealCard}>
              <View style={styles.mealHeader}>
                <Text style={styles.mealTime}>{meal.mealPeriod}</Text>
                <Text style={styles.mealCalories}>{getUiMealCalories(meal)} kcal</Text>
              </View>
              <Text style={styles.mealTitle}>{meal.mealName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField}</Text>
              <Text style={styles.mealNote}>
                {meal.restaurantName || zhTW.mobile.refinedLogic.mealBuddyCard.emptyField}｜{meal.ingredients}｜{meal.portion}
              </Text>
              <TagRow tags={[meal.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
            </View>
          ))}
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.plannedDinner.lunchRecommendationLabel} subtitle={zhTW.mobile.plannedDinner.lunchAdvice[0]} />
        {lunchRecord ? (
          <View style={styles.currentMealCard}>
            <View style={styles.mealHeader}>
              <Text style={styles.mealTime}>{lunchRecord.mealPeriod}</Text>
              <Text style={styles.mealCalories}>{getUiMealCalories(lunchRecord)} kcal</Text>
            </View>
            <Text style={styles.mealTitle}>{lunchRecord.mealName}</Text>
            <Text style={styles.mealNote}>{lunchRecord.restaurantName}｜{lunchRecord.ingredients}</Text>
            <TagRow tags={[lunchRecord.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
          </View>
        ) : null}
      </Card>

      <Card tone="amber">
        <SectionTitle title={daily.plannedMealTitle} />
        {plannedMeals.length ? plannedMeals.map((plan) => (
          <View key={plan.canonicalPlannedMealId ?? `${plan.plannedDate}-${plan.plannedMealName}`} style={styles.plannedCard}>
            <Text style={styles.mealTitle}>{plan.plannedMealName}</Text>
            <Text style={styles.mealCalories}>{plan.calories}</Text>
            <Text style={styles.mealNote}>{plan.restaurantName || "餐廳未提供"}｜{plan.notes || "營養估算，轉換前不計入已吃"}</Text>
            <Text style={styles.balanceHint}>{plannedStatusHint(plan.canonicalStatus)}</Text>
            <TagRow tags={[plannedStatusLabel(plan.canonicalStatus), plan.mealType, "營養估算"]} />
            {plan.canonicalStatus === "planned" && plan.canonicalPlannedMealId && plan.canonicalUpdatedAt ? (
              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={() => { void runtime.cancelPlannedMeal({ plannedMealId: plan.canonicalPlannedMealId!, expectedUpdatedAt: plan.canonicalUpdatedAt! }); }}>
                  <Text style={styles.secondaryButtonText}>取消預定餐</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => { void runtime.convertPlannedMeal({ plannedMealId: plan.canonicalPlannedMealId!, expectedUpdatedAt: plan.canonicalUpdatedAt! }); }}>
                  <Text style={styles.primaryButtonText}>確認已吃並轉為飲食紀錄</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )) : (
          <View style={styles.plannedCard}><Text style={styles.mealTitle}>{daily.plannedMeal.title}</Text><Text style={styles.mealNote}>目前沒有 canonical 預定餐。</Text></View>
        )}
        {runtime.plannedMealState.status === "uncertain" ? (
          <View style={styles.plannedCard}>
            <Text style={styles.balanceHint}>{zhTW.mobile.plannedDinner.uncertainMessage}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => { void runtime.retryPendingPlannedMeal(); }}><Text style={styles.secondaryButtonText}>{zhTW.mobile.plannedDinner.retryCta}</Text></Pressable>
          </View>
        ) : null}
        {runtime.plannedMealMutationState.status === "error" ? <Text style={styles.balanceHint}>{runtime.plannedMealMutationState.errorCode === "conflict" ? zhTW.mobile.plannedDinner.conflictMessage : zhTW.mobile.plannedDinner.errorMessage}</Text> : null}
      </Card>

      <Card tone="mint">
        <SectionTitle title={intake.nextActionsTitle} />
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/meal-buddies")}>
            <Text style={styles.primaryButtonText}>{intake.findBuddy}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push("/recommendation")}>
            <Text style={styles.secondaryButtonText}>{intake.nextMeal}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.push("/meal-log")}>
            <Text style={styles.secondaryButtonText}>{intake.viewLog}</Text>
          </Pressable>
        </View>
      </Card>
    </PlaceholderScreen>
  );
}

function plannedStatusLabel(status: "planned" | "converted" | "cancelled" | "expired" | undefined) {
  if (status === "converted") return "已轉為飲食紀錄";
  if (status === "cancelled") return "已取消";
  if (status === "expired") return "已過期";
  return "預定中";
}

function plannedStatusHint(status: "planned" | "converted" | "cancelled" | "expired" | undefined) {
  if (status === "converted") return "這筆預定餐已由明確操作轉換；營養只由 canonical 飲食紀錄計入。";
  if (status === "cancelled") return "這筆預定餐已取消，不會計入已吃。";
  if (status === "expired") return "這筆預定餐已過期，不提供取消或轉換操作。";
  return "預定營養僅供參考，轉換前不計入已吃。";
}

const styles = StyleSheet.create({
  balanceHint: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  currentMealCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.48)",
    marginTop: 12,
    padding: 14
  },
  flex: {
    flex: 1,
    gap: 6
  },
  hero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.36)",
    marginTop: 14,
    padding: 14
  },
  heroBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25
  },
  mealCalories: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900"
  },
  mealCard: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 14
  },
  mealHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  mealList: {
    gap: 10,
    marginTop: 12
  },
  mealNote: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  mealTime: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  mealTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  plannedCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.66)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.42)",
    marginTop: 12,
    padding: 14
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  savedBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  scoreRing: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 42,
    borderWidth: 5,
    backgroundColor: colors.teal,
    height: 82,
    shadowColor: "#2d6b52",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    width: 82
  },
  scoreText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
});
