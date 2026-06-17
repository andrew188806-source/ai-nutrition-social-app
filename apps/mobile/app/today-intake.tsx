import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { NutritionDetailReport } from "../components/NutritionDetailReport";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { getTodayMealRecords } from "../features/analysis/analysisMealRecordStore";
import { calculateTodayNutritionSummary, getEffectiveCalories } from "../features/analysis/nutritionSummary";
import { getAutoSettledPlannedDinnerRecord, getConfirmedDinnerRecord, getPlannedDinner } from "../features/planned-meal";

export default function TodayIntakeScreen() {
  const router = useRouter();
  const intake = zhTW.mobile.analysis.savedIntake;
  const daily = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake;
  const mealRecords = getTodayMealRecords();
  const lunchRecord = mealRecords.find((meal) => meal.mealPeriod === zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1]) ?? mealRecords[0];
  const summary = calculateTodayNutritionSummary(mealRecords);
  const plannedDinner = getPlannedDinner();
  const confirmedDinner = getConfirmedDinnerRecord();
  const autoSettledDinner = getAutoSettledPlannedDinnerRecord();
  const dinnerPlanForDisplay = confirmedDinner ?? plannedDinner ?? autoSettledDinner;

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
                <Text style={styles.mealCalories}>{getEffectiveCalories(meal)} kcal</Text>
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
              <Text style={styles.mealCalories}>{getEffectiveCalories(lunchRecord)} kcal</Text>
            </View>
            <Text style={styles.mealTitle}>{lunchRecord.mealName}</Text>
            <Text style={styles.mealNote}>{lunchRecord.restaurantName}｜{lunchRecord.ingredients}</Text>
            <TagRow tags={[lunchRecord.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
          </View>
        ) : null}
      </Card>

      <Card tone="amber">
        <SectionTitle title={daily.plannedMealTitle} />
        <View style={styles.plannedCard}>
          <Text style={styles.mealTitle}>{dinnerPlanForDisplay?.plannedMealName ?? daily.plannedMeal.title}</Text>
          <Text style={styles.mealCalories}>{dinnerPlanForDisplay?.calories ?? daily.plannedMeal.calories}</Text>
          <Text style={styles.mealNote}>
            {dinnerPlanForDisplay
              ? `${dinnerPlanForDisplay.restaurantName || zhTW.mobile.plannedDinnerHelper.defaultRestaurantName}｜${dinnerPlanForDisplay.notes || "營養估算，尚未算作已吃"}`
              : daily.plannedMeal.note}
          </Text>
          <Text style={styles.balanceHint}>{getPlannedDinnerHint(Boolean(confirmedDinner), Boolean(autoSettledDinner), Boolean(plannedDinner))}</Text>
          <TagRow tags={dinnerPlanForDisplay ? [getPlannedDinnerStatus(Boolean(confirmedDinner), Boolean(autoSettledDinner)), dinnerPlanForDisplay.mealType, "營養估算"] : daily.plannedMeal.tags} />
        </View>
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

function getPlannedDinnerStatus(isConfirmed: boolean, isAutoSettled: boolean) {
  if (isConfirmed) {
    return "已吃";
  }
  if (isAutoSettled) {
    return "預計晚餐自動結算";
  }
  return "今晚預定";
}

function getPlannedDinnerHint(isConfirmed: boolean, isAutoSettled: boolean, hasPlannedDinner: boolean) {
  if (isConfirmed) {
    return "晚餐已由 AI 分析確認，預計晚餐已轉為正式紀錄。";
  }
  if (isAutoSettled) {
    return "若隔日仍未分析晚餐，系統會以「預計晚餐自動結算」保留到美食日記。";
  }
  if (hasPlannedDinner) {
    return "今晚預定會作為估算值，幫助下一餐推薦更聰明。";
  }
  return zhTW.mobile.plannedDinner.lunchAdvice[1];
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
