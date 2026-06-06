import { type ReactNode, useState } from "react";
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, DemoModeToggle, MetricCard, PremiumBadge, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { CorrectionSuccessActions, EstimatePreview, ExternalCorrectionPanel, SelfCookedCorrectionPanel, useAnalysisCorrectionState } from "../features/analysis";
import { saveCorrectedMealRecord } from "../features/analysis/analysisMealRecordStore";
import { getAiRecommendationMealBuddyCard, resetMealBuddyVisibleQuotaForDemo, setPendingMatchRequest, upsertMealBuddyCardWithQuota } from "../features/meal-buddy-card";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { confirmPlannedDinnerFromAnalysis, getPlannedDinner } from "../features/planned-meal";

export default function AnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealSlot?: string }>();
  const analysis = useAnalysisCorrectionState();
  const [demoMode, setDemoMode] = useDemoUserPlan();
  const [mealSaved, setMealSaved] = useState(false);
  const defaultMealPeriod = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1];
  const initialMealPeriod = typeof params.mealSlot === "string" ? params.mealSlot : defaultMealPeriod;
  const [selectedMealPeriod, setSelectedMealPeriod] = useState(initialMealPeriod);
  const [autoSavedConfirmedMeal, setAutoSavedConfirmedMeal] = useState(false);
  const [showMealBuddyConfirm, setShowMealBuddyConfirm] = useState(false);
  const [showMealBuddySuccess, setShowMealBuddySuccess] = useState(false);
  const isAnalysisConfirmed = analysis.matchState === "confirmed";

  useEffect(() => {
    if (typeof params.mealSlot === "string") {
      setSelectedMealPeriod(params.mealSlot);
    }
  }, [params.mealSlot]);

  useEffect(() => {
    if (!isAnalysisConfirmed || autoSavedConfirmedMeal) {
      return;
    }
    persistMealRecordToTodayIntake();
    setAutoSavedConfirmedMeal(true);
  }, [isAnalysisConfirmed, autoSavedConfirmedMeal]);

  function persistMealRecordToTodayIntake() {
    const savedPlan = {
      mealTime: selectedMealPeriod,
      plannedMealName: analysis.mealName,
      mealType: selectedMealPeriod,
      restaurantName: analysis.restaurantName,
      calories: `${analysis.nutritionSummary.calories} kcal`,
      protein: `${analysis.nutritionSummary.protein}g`,
      carbs: `${analysis.nutritionSummary.carbohydrates}g`,
      fat: `${analysis.nutritionSummary.fat}g`,
      notes: "晚餐已由 AI 分析確認，取代原本的預計晚餐。",
      isSocialMeal: false
    };
    saveCorrectedMealRecord({
      restaurantName: analysis.restaurantName,
      mealName: analysis.mealName,
      calories: analysis.nutritionSummary.calories,
      protein: analysis.nutritionSummary.protein,
      carbohydrates: analysis.nutritionSummary.carbohydrates,
      fat: analysis.nutritionSummary.fat,
      ingredients: analysis.nutritionSummary.ingredientSummary,
      portion: analysis.nutritionSummary.portion,
      mealPeriod: selectedMealPeriod,
      date: "2026/06/01"
    });
    if (selectedMealPeriod.includes("晚餐")) {
      confirmPlannedDinnerFromAnalysis(savedPlan);
    }
  }

  function saveMealRecordToMockDatabase() {
    persistMealRecordToTodayIntake();
    setMealSaved(true);
    router.push("/today-intake");
  }

  function renderSuccessActions() {
    return <CorrectionSuccessActions hasRestaurantContext={analysis.hasRestaurantContext} onOpenMealLog={saveMealRecordToMockDatabase} onOpenSocial={() => router.push("/meal-buddies")} />;
  }

  function confirmCreateMealBuddyCard() {
    setShowMealBuddyConfirm(true);
  }

  function createMealBuddyCardFromCurrentRecommendation() {
    const card = getAiRecommendationMealBuddyCard();
    resetMealBuddyVisibleQuotaForDemo(demoMode);
    upsertMealBuddyCardWithQuota(card, demoMode);
    setPendingMatchRequest(card, demoMode === "premium" ? 5 : 3, false, demoMode);
    setShowMealBuddyConfirm(false);
    setShowMealBuddySuccess(true);
    setTimeout(() => {
      router.push("/meal-buddies");
    }, 650);
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.analysisTitle}
      subtitle={zhTW.mobile.analysisSubtitle}
      primaryAction={{ href: "/meal-buddies", label: zhTW.mobile.refinedLogic.analysisFlow.goMealPartners }}
      secondaryAction={{ href: "/", label: zhTW.common.backHome }}
    >
      <DemoModeToggle mode={demoMode} onChange={setDemoMode} />
      <MealBuddyCreateConfirmModal
        onCancel={() => setShowMealBuddyConfirm(false)}
        onConfirm={createMealBuddyCardFromCurrentRecommendation}
        visible={showMealBuddyConfirm}
      />
      <MealBuddySuccessToast visible={showMealBuddySuccess} />
      {mealSaved ? (
        <TodayIntakeSummary onFindBuddy={() => router.push("/meal-buddies")} onNextMeal={() => router.push("/recommendation")} onOpenMealLog={() => router.push("/meal-log")} />
      ) : (
        <>
          <Card tone="premium">
            <PremiumBadge label={zhTW.mobile.correctedFlow.nutritionCoreTitle} />
            <SectionTitle title={zhTW.mobile.correctedFlow.mealResultTitle} subtitle={zhTW.mobile.correctedFlow.mealResultBody} />
          </Card>

          <Card>
            <SectionTitle title={zhTW.mobile.analysis.modeTitle} />
            <Text style={styles.formLabel}>這是第幾餐？</Text>
            <View style={styles.modeRow}>
              {zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions.map((period) => (
                <Pressable key={period} style={[styles.mealPeriodButton, selectedMealPeriod === period && styles.activeMode]} onPress={() => setSelectedMealPeriod(period)}>
                  <Text style={[styles.modeText, selectedMealPeriod === period && styles.activeModeText]}>{period}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modeRow}>
              <Pressable style={[styles.modeButton, !analysis.isSelfCooked && styles.activeMode]} onPress={() => analysis.setMode("restaurant")}>
                <Text style={[styles.modeText, !analysis.isSelfCooked && styles.activeModeText]}>{zhTW.mobile.analysis.restaurantMode}</Text>
              </Pressable>
              <Pressable style={[styles.modeButton, analysis.isSelfCooked && styles.activeMode]} onPress={() => analysis.setMode("selfCooked")}>
                <Text style={[styles.modeText, analysis.isSelfCooked && styles.activeModeText]}>{zhTW.mobile.analysis.selfCookedMode}</Text>
              </Pressable>
            </View>
          </Card>

          {analysis.isSelfCooked ? (
            <SelfCookedIntro />
          ) : isAnalysisConfirmed ? (
            <CompletedAnalysisHero onFindBuddy={confirmCreateMealBuddyCard} onOpenMealLog={saveMealRecordToMockDatabase} onOpenNutritionRecord={() => router.push("/meal-log")} />
          ) : (
            <ExternalDiningAnalysis analysis={analysis} renderSuccessActions={renderSuccessActions} />
          )}

          {!analysis.isSelfCooked && analysis.matchState === "editing" ? <CandidateCorrectionList analysis={analysis} renderSuccessActions={renderSuccessActions} /> : null}

          {!isAnalysisConfirmed ? (
            <>
              <SectionTitle title={zhTW.mobile.analysis.summary} />
              <View style={styles.metricGrid}>
                <MetricCard label={zhTW.mobile.analysis.calories} value={`${analysis.nutritionSummary.calories}`} note="kcal" />
                <MetricCard label={zhTW.mobile.analysis.protein} value={`${analysis.nutritionSummary.protein}g`} note={zhTW.mobile.analysis.nutritionCards[1].note} />
                <MetricCard label={zhTW.mobile.analysis.carbs} value={`${analysis.nutritionSummary.carbohydrates}g`} note={zhTW.mobile.analysis.nutritionCards[2].note} />
                <MetricCard label={zhTW.mobile.analysis.fat} value={`${analysis.nutritionSummary.fat}g`} note={zhTW.mobile.analysis.nutritionCards[3].note} />
                <MetricCard label={zhTW.mobile.finalUx.mealRecordFields[3]} value={analysis.nutritionSummary.portion} note={analysis.nutritionSummary.ingredientSummary} />
                <MetricCard label={zhTW.mobile.analysis.balanceScore} value={`${analysis.nutritionSummary.balanceScore}`} note={zhTW.mobile.analysis.nutritionCards[5].note} />
              </View>
            </>
          ) : null}

          {analysis.isSelfCooked ? (
            <Card>
              <SectionTitle title={zhTW.mobile.finalUx.ingredientCorrectionTitle} subtitle={zhTW.mobile.finalUx.ingredientCorrectionBody} />
              <SelfCookedCorrectionPanel
                addSection={analysis.addSection}
                confirmAddedSection={analysis.confirmAddedSection}
                confirmCorrectionRow={analysis.confirmCorrectionRow}
                correctedRows={analysis.correctedRows}
                correctionCompleted={analysis.correctionCompleted}
                correctionSections={analysis.correctionSections}
                completeCorrection={analysis.completeCorrection}
                expandedCorrection={analysis.expandedCorrection}
                nutritionRefreshed={analysis.nutritionRefreshed}
                nutritionSummary={analysis.nutritionSummary}
                renderSuccessActions={renderSuccessActions}
                toggleAddSection={analysis.toggleAddSection}
                toggleCorrectionRow={analysis.toggleCorrectionRow}
              />
            </Card>
          ) : null}

          {!isAnalysisConfirmed ? (
          <Card tone="amber">
            <SectionTitle title={zhTW.mobile.nextMealTitle} subtitle={zhTW.mobile.analysis.recommendation} />
            <Text style={styles.stateText}>{zhTW.mobile.refinedLogic.analysisFlow.bridgeBody}</Text>
          </Card>
          ) : null}

          {!isAnalysisConfirmed ? (
          <Card>
            <SectionTitle title={zhTW.mobile.analysis.mealTagsTitle} />
            <TagRow tags={analysis.isSelfCooked ? zhTW.mobile.analysis.selfCookedTags : zhTW.mobile.analysis.mealTags} />
          </Card>
          ) : null}

          {!isAnalysisConfirmed ? (
          <Card>
            <SectionTitle title={zhTW.mobile.analysis.goalTagsTitle} />
            <TagRow tags={zhTW.mobile.analysis.goalTags} />
          </Card>
          ) : null}
        </>
      )}
    </PlaceholderScreen>
  );
}

function MealBuddyCreateConfirmModal({ onCancel, onConfirm, visible }: { onCancel: () => void; onConfirm: () => void; visible: boolean }) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.confirmModalCard}>
          <SectionTitle title="要用這餐建立飯友卡並尋找飯友嗎？" subtitle="系統會使用下一餐推薦、餐點類型與你的社群卡用餐時間，幫你找適合的飯友。" />
          <View style={styles.modalButtonRow}>
            <Pressable style={styles.modalSecondaryButton} onPress={onCancel}>
              <Text style={styles.modalSecondaryButtonText}>取消</Text>
            </Pressable>
            <Pressable style={styles.modalPrimaryButton} onPress={onConfirm}>
              <Text style={styles.modalPrimaryButtonText}>建立飯友卡</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MealBuddySuccessToast({ visible }: { visible: boolean }) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.toast}>
      <Text style={styles.toastText}>已建立飯友卡，正在為你推薦飯友</Text>
    </View>
  );
}

function SelfCookedIntro() {
  return (
    <Card tone="amber">
      <SectionTitle title={zhTW.mobile.analysis.selfCookedTitle} subtitle={zhTW.mobile.analysis.selfCookedBody} />
      <Text style={styles.disclaimer}>{zhTW.mobile.analysis.nutritionDisclaimer}</Text>
      <EstimatePreview title={zhTW.mobile.analysis.estimatedIngredientsTitle} items={zhTW.mobile.analysis.estimatedIngredients} />
      <EstimatePreview title={zhTW.mobile.analysis.estimatedPortionsTitle} items={zhTW.mobile.analysis.estimatedPortions} />
      <EstimatePreview title={zhTW.mobile.analysis.estimatedCookingTitle} items={zhTW.mobile.analysis.estimatedCooking} />
      <Text style={styles.confidence}>{zhTW.mobile.analysis.confidenceLevels[1]}</Text>
      <Text style={styles.stateText}>{zhTW.mobile.analysis.selfCookedSaved}</Text>
      <TagRow tags={zhTW.mobile.analysis.selfCookedTags} />
    </Card>
  );
}

function CompletedAnalysisHero({ onFindBuddy, onOpenMealLog, onOpenNutritionRecord }: { onFindBuddy: () => void; onOpenMealLog: () => void; onOpenNutritionRecord: () => void }) {
  const daily = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake;

  return (
    <Card tone="mint">
      <View style={styles.completedHeroVisual}>
        <View style={styles.completedCheck}>
          <Text style={styles.completedCheckText}>OK</Text>
        </View>
        <View style={styles.completedSparkRow}>
          <View style={[styles.foodDot, styles.foodDotGreen]} />
          <View style={[styles.foodDot, styles.foodDotAmber]} />
          <View style={[styles.foodDot, styles.foodDotCoral]} />
        </View>
      </View>
      <SectionTitle title={zhTW.mobile.refinedLogic.analysisFlow.bridgeTitle} subtitle={zhTW.mobile.refinedLogic.analysisFlow.bridgeBody} />
      <View style={styles.nextMealPanel}>
        <Text style={styles.nextMealEyebrow}>{daily.nextMealSocialTitle}</Text>
        <Text style={styles.nextMealTitle}>{daily.nextMealRecommendation}</Text>
        <Text style={styles.nextMealBody}>{daily.nextMealReason}</Text>
        <TagRow tags={daily.plannedMeal.tags} />
      </View>
      <View style={styles.buttonRow}>
        <Pressable style={styles.confirmButton} onPress={onFindBuddy}>
          <Text style={styles.confirmButtonText}>{zhTW.mobile.refinedLogic.mealBuddyCard.findPeopleCta}</Text>
        </Pressable>
        <Pressable style={styles.editButton} onPress={onOpenMealLog}>
          <Text style={styles.editButtonText}>{zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord}</Text>
        </Pressable>
        <Pressable style={styles.editButton} onPress={onOpenNutritionRecord}>
          <Text style={styles.editButtonText}>{zhTW.mobile.refinedLogic.analysisFlow.viewNutritionRecord}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function TodayIntakeSummary({ onFindBuddy, onNextMeal, onOpenMealLog }: { onFindBuddy: () => void; onNextMeal: () => void; onOpenMealLog: () => void }) {
  const intake = zhTW.mobile.analysis.savedIntake;
  const daily = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake;
  const currentPlannedDinner = getPlannedDinner();
  const plannedDinnerTitle = currentPlannedDinner?.plannedMealName ?? daily.plannedMeal.title;
  const plannedDinnerCalories = currentPlannedDinner?.calories ?? daily.plannedMeal.calories;
  const plannedDinnerNote = currentPlannedDinner ? `${currentPlannedDinner.restaurantName}｜預計，尚未算作已吃` : daily.plannedMeal.note;
  const plannedDinnerTags = currentPlannedDinner ? [currentPlannedDinner.mealType, "預計", "營養估算"] : daily.plannedMeal.tags;
  const summaryItems = [
    { label: intake.caloriesTitle, value: intake.caloriesValue },
    { label: intake.proteinTitle, value: intake.proteinValue },
    { label: intake.carbsTitle, value: intake.carbsValue },
    { label: intake.fatTitle, value: intake.fatValue },
    { label: intake.balanceTitle, value: intake.balanceValue },
    { label: intake.remainingTitle, value: intake.remainingValue }
  ];

  return (
    <>
      <Card tone="premium">
        <Text style={styles.savedBadge}>{intake.savedMessage}</Text>
        <SectionTitle title={intake.title} subtitle={intake.body} />
        <View style={styles.intakeHero}>
          <View style={styles.intakeScore}>
            <Text style={styles.intakeScoreText}>82</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.intakeInsight}>{intake.insight}</Text>
            <Text style={styles.intakeAdvice}>{intake.dinnerAdvice}</Text>
            <Text style={styles.intakeAdvice}>{intake.balanceNote}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.intakeGrid}>
        {summaryItems.map((item) => (
          <View key={item.label} style={styles.intakeItem}>
            <Text style={styles.intakeLabel}>{item.label}</Text>
            <Text style={styles.intakeValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <Card>
        <SectionTitle title={daily.mealRecordsTitle} />
        <View style={styles.mealRecordList}>
          {daily.mealRecords.map((meal) => (
            <View key={`${meal.time}-${meal.title}`} style={styles.mealRecordCard}>
              <View style={styles.mealRecordHeader}>
                <Text style={styles.mealTimePill}>{meal.time}</Text>
                <Text style={styles.mealRecordCalories}>{meal.calories}</Text>
              </View>
              <Text style={styles.mealRecordTitle}>{meal.title}</Text>
              <Text style={styles.mealRecordNote}>{meal.note}</Text>
              <TagRow tags={meal.tags} />
            </View>
          ))}
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.plannedDinner.lunchRecommendationLabel} subtitle={zhTW.mobile.plannedDinner.lunchAdvice[0]} />
        <View style={styles.currentMealCard}>
          <View style={styles.mealRecordHeader}>
            <Text style={styles.mealTimePill}>{daily.mealRecords[1].time}</Text>
            <Text style={styles.mealRecordCalories}>{daily.mealRecords[1].calories}</Text>
          </View>
          <Text style={styles.mealRecordTitle}>{daily.mealRecords[1].title}</Text>
          <Text style={styles.mealRecordNote}>{daily.mealRecords[1].note}</Text>
          <TagRow tags={daily.mealRecords[1].tags} />
        </View>
      </Card>

      <Card tone="amber">
        <SectionTitle title={daily.plannedMealTitle} />
        <View style={styles.plannedMealCard}>
          <Text style={styles.mealRecordTitle}>{plannedDinnerTitle}</Text>
          <Text style={styles.mealRecordCalories}>{plannedDinnerCalories}</Text>
          <Text style={styles.mealRecordNote}>{plannedDinnerNote}</Text>
          <Text style={styles.balanceHint}>{zhTW.mobile.plannedDinner.lunchAdvice[1]}</Text>
          <TagRow tags={plannedDinnerTags} />
        </View>
      </Card>

      <Card tone="mint">
        <SectionTitle title={intake.nextActionsTitle} />
        <View style={styles.buttonRow}>
          <Pressable style={styles.confirmButton} onPress={onFindBuddy}>
            <Text style={styles.confirmButtonText}>{intake.findBuddy}</Text>
          </Pressable>
          <Pressable style={styles.editButton} onPress={onOpenMealLog}>
            <Text style={styles.editButtonText}>{intake.viewLog}</Text>
          </Pressable>
          <Pressable style={styles.editButton} onPress={onNextMeal}>
            <Text style={styles.editButtonText}>{intake.nextMeal}</Text>
          </Pressable>
        </View>
      </Card>
    </>
  );
}

function ExternalDiningAnalysis({ analysis, renderSuccessActions }: { analysis: ReturnType<typeof useAnalysisCorrectionState>; renderSuccessActions: () => ReactNode }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Card tone="mint">
      <SectionTitle title={zhTW.mobile.analysis.precisionTitle} subtitle={zhTW.mobile.analysis.precisionBody} />
      <Text style={styles.location}>{zhTW.mobile.analysis.locationLabel}</Text>
      <View style={styles.restaurantSummary}>
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.restaurantNameLabel}</Text>
        <Text style={styles.summaryValue}>{zhTW.mobile.analysis.candidates[0].restaurant}</Text>
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.mealNameLabel}</Text>
        <Text style={styles.summaryValue}>{zhTW.mobile.analysis.candidates[0].meal}</Text>
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.nutritionSummaryLabel}</Text>
        <Text style={styles.summaryValue}>
          {analysis.nutritionSummary.calories} kcal / {analysis.nutritionSummary.protein}g / {analysis.nutritionSummary.carbohydrates}g / {analysis.nutritionSummary.fat}g
        </Text>
      </View>
      <Text style={styles.topMatch}>{zhTW.mobile.analysis.topMatchTitle}</Text>
      <Text style={styles.confidence}>{zhTW.mobile.analysis.confidenceLabel}</Text>
      <Pressable style={styles.detailToggle} onPress={() => setShowDetails((current) => !current)}>
        <Text style={styles.detailToggleText}>{showDetails ? zhTW.mobile.refinedLogic.aiEntry.detailToggleClose : zhTW.mobile.refinedLogic.aiEntry.detailToggleOpen}</Text>
      </Pressable>
      {showDetails ? (
        <>
          <Text style={styles.costHint}>{zhTW.mobile.finalUx.aiCostControlHint}</Text>
          <View style={styles.sourceList}>
            {zhTW.mobile.finalUx.databaseMatchSources.map((source) => (
              <Text key={source} style={styles.sourcePill}>
                {source}
              </Text>
            ))}
          </View>
          <View style={styles.reasonList}>
            {zhTW.mobile.analysis.matchReasons.map((reason) => (
              <Text key={reason} style={styles.reasonItem}>
                {reason}
              </Text>
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.buttonRow}>
        <Pressable style={styles.confirmButton} onPress={() => analysis.setMatchState("confirmed")}>
          <Text style={styles.confirmButtonText}>{zhTW.mobile.analysis.confirmMatch}</Text>
        </Pressable>
        <Pressable style={styles.editButton} onPress={() => analysis.setMatchState("editing")}>
          <Text style={styles.editButtonText}>{zhTW.mobile.analysis.notThis}</Text>
        </Pressable>
      </View>
      {analysis.matchState === "confirmed" ? <Text style={styles.stateText}>{zhTW.mobile.analysis.confirmedMatch}</Text> : null}
      {analysis.matchState === "editing" ? (
        <>
          <Text style={styles.stateText}>{zhTW.mobile.analysis.correctionSaved}</Text>
          <Text style={styles.stateText}>{zhTW.mobile.analysis.futureLearning}</Text>
        </>
      ) : null}
    </Card>
  );
}

function CandidateCorrectionList({ analysis, renderSuccessActions }: { analysis: ReturnType<typeof useAnalysisCorrectionState>; renderSuccessActions: () => ReactNode }) {
  return (
    <Card>
      <SectionTitle title={zhTW.mobile.finalUx.notThisMenuTitle} subtitle={zhTW.mobile.finalUx.notThisMenuBody} />
      <View style={styles.candidateList}>
        {zhTW.mobile.analysis.candidates.map((candidate) => (
          <Pressable key={`${candidate.restaurant}-${candidate.meal}`} style={styles.candidate} onPress={() => analysis.setMatchState("confirmed")}>
            <Text style={styles.candidateTitle}>{candidate.restaurant}</Text>
            <Text style={styles.candidateBody}>
              {candidate.meal} | {candidate.confidence}
            </Text>
            <TagRow tags={candidate.tags} />
            <Text style={styles.optionCta}>{zhTW.mobile.finalUx.candidateOptionCta}</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.candidate, styles.supplementalCandidate]} onPress={analysis.openSupplementalData}>
          <Text style={styles.candidateTitle}>{zhTW.mobile.finalUx.supplementalDataTitle}</Text>
          <Text style={styles.candidateBody}>{zhTW.mobile.finalUx.supplementalDataBody}</Text>
          <Text style={styles.optionCta}>{zhTW.mobile.finalUx.supplementalDataCta}</Text>
        </Pressable>
      </View>
      {analysis.externalBreakdownTriggered ? <Text style={styles.stateText}>{analysis.showExternalBreakdown ? zhTW.mobile.finalUx.externalAiBreakdownReady : zhTW.mobile.finalUx.externalAiBreakdownLoading}</Text> : null}
      {analysis.showExternalBreakdown ? (
        <ExternalCorrectionPanel
          addSection={analysis.addSection}
          confirmAddedSection={analysis.confirmAddedSection}
          confirmCorrectionRow={analysis.confirmCorrectionRow}
          correctedRows={analysis.correctedRows}
          correctionSections={analysis.correctionSections}
          completeCorrection={analysis.completeCorrection}
          expandedCorrection={analysis.expandedCorrection}
          mealName={analysis.mealName}
          nutritionRefreshed={analysis.nutritionRefreshed}
          nutritionSummary={analysis.nutritionSummary}
          restaurantName={analysis.restaurantName}
          setMealName={analysis.setMealName}
          setRestaurantName={analysis.setRestaurantName}
          toggleAddSection={analysis.toggleAddSection}
          toggleCorrectionRow={analysis.toggleCorrectionRow}
        />
      ) : null}
      {analysis.correctionCompleted ? renderSuccessActions() : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  activeMode: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  activeModeText: {
    color: colors.ink
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  balanceHint: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19
  },
  candidate: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    padding: 12
  },
  candidateBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  candidateList: {
    gap: 12,
    marginVertical: 14
  },
  candidateTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  optionCta: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  confidence: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 8
  },
  completedCheck: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 54,
    borderWidth: 7,
    backgroundColor: colors.teal,
    height: 108,
    shadowColor: "#2d6b52",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    width: 108
  },
  completedCheckText: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900"
  },
  completedHeroVisual: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255,255,255,0.7)",
    borderRadius: 32,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.38)",
    marginBottom: 16,
    minHeight: 168
  },
  completedSparkRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 14
  },
  completionPill: {
    alignSelf: "center",
    borderColor: "rgba(255,255,255,0.36)",
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  completionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    textAlign: "center"
  },
  confirmButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  costHint: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  contextPill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  contextRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
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
  disclaimer: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginVertical: 12
  },
  detailToggle: {
    alignSelf: "flex-start",
    borderColor: "#f0dcc2",
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  detailToggleText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.64
  },
  editButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  editButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  imageIcon: {
    color: "#ffffff",
    fontSize: 38,
    fontWeight: "900"
  },
  imageLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  imagePreview: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderColor: "#2d2823",
    borderRadius: 34,
    borderWidth: 1,
    backgroundColor: colors.ink,
    gap: 8,
    minHeight: 218,
    shadowColor: "#2d2823",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 }
  },
  intakeAdvice: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  intakeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  intakeHero: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.34)",
    marginTop: 16,
    padding: 14
  },
  intakeInsight: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24
  },
  intakeItem: {
    borderColor: "#f0dcc2",
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#fffdf9",
    flexGrow: 1,
    flexBasis: 145,
    padding: 16
  },
  intakeLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  intakeScore: {
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
  intakeScoreText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900"
  },
  intakeValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 6
  },
  mealRecordCard: {
    gap: 8,
    borderColor: "#f0dcc2",
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    padding: 14
  },
  mealRecordCalories: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900"
  },
  mealRecordHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  mealRecordList: {
    gap: 10,
    marginTop: 12
  },
  mealRecordNote: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  mealRecordTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  mealTimePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  mealPlate: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(255,255,255,0.78)",
    borderRadius: 58,
    borderWidth: 8,
    backgroundColor: colors.coral,
    height: 116,
    width: 116
  },
  foodDots: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  foodDot: {
    borderRadius: 999,
    height: 12,
    width: 12
  },
  foodDotCoral: {
    backgroundColor: colors.coral
  },
  foodDotGreen: {
    backgroundColor: colors.teal
  },
  foodDotAmber: {
    backgroundColor: colors.amber
  },
  flex: {
    flex: 1,
    gap: 6
  },
  location: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  modeButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  mealPeriodButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  formLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
    marginTop: 12
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  modeText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900"
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(45,40,35,0.42)",
    bottom: 0,
    flex: 1,
    justifyContent: "center",
    left: 0,
    padding: 20,
    position: "absolute",
    right: 0,
    top: 0
  },
  confirmModalCard: {
    gap: 16,
    borderColor: "#f0c987",
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "#fff8ee",
    maxWidth: 440,
    padding: 20,
    shadowColor: "#3f2d12",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    width: "100%"
  },
  modalButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  modalPrimaryButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  modalPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  modalSecondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 13
  },
  modalSecondaryButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900"
  },
  nextMealBody: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  nextMealEyebrow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  nextMealPanel: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.44)",
    marginTop: 14,
    padding: 14
  },
  nextMealTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  reasonItem: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  reasonList: {
    gap: 8,
    marginTop: 12
  },
  restaurantSummary: {
    gap: 6,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 14,
    padding: 12
  },
  plannedDinnerCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.66)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.42)",
    marginTop: 12,
    padding: 14
  },
  plannedDinnerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  plannedMealCard: {
    gap: 8,
    borderColor: "rgba(255,255,255,0.66)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.42)",
    marginTop: 12,
    padding: 14
  },
  plannedHint: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginVertical: 12
  },
  scanning: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 14
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
  sourceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  dinnerModalContent: {
    gap: 14,
    paddingBottom: 8
  },
  radioRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  conditionChip: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  conditionChipActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  conditionChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  conditionChipTextActive: {
    color: colors.ink
  },
  aiPlanBox: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    padding: 14
  },
  conditionGroup: {
    gap: 8
  },
  sourcePill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  supplementalCandidate: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  stateText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  todayIntakeButton: {
    alignItems: "center",
    borderColor: colors.teal,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  todayIntakeButtonText: {
    color: colors.teal,
    fontSize: 14,
    fontWeight: "900"
  },
  toast: {
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: colors.ink,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: "#3f2d12",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  toastText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  topMatch: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 14
  }
});


