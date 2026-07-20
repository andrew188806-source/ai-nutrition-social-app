import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { CorrectionSuccessActions, EstimatePreview, ExternalCorrectionPanel, SelfCookedCorrectionPanel, getAnalysisSession, useAnalysisCorrectionState } from "../features/analysis";
import { getTodayMealRecords, saveCorrectedMealRecord, updateMealRecordByMealId } from "../features/analysis/analysisMealRecordStore";
import { getEffectiveCalories } from "../features/analysis/nutritionSummary";
import { generateMealId, generatePhotoId, SingleMealGuiltShare } from "../features/calorie-sharing";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { getNextMealCandidateCount } from "../features/next-meal-prototype";
import { getPlannedDinner } from "../features/planned-meal";
import { useConsumerRuntime } from "../features/consumer-runtime";
import { mobileMenuItemService } from "../services/mobile-menu-item-service";
import { Card as SnowCard, Chip, PrimaryButton, SecondaryButton, SectionHeader as SnowSectionHeader, StatCard } from "../theme/components";
import { Icon } from "../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as snow } from "../theme/tokens";

type NextMealRecommendationCard = {
  menuItemId: string;
  restaurantId: string;
  dishName: string;
  calories: number;
  restaurantName: string;
  distance: string;
  emoji: string;
  reason: string;
  matchPercent: number;
};

let hasPlayedRecommendationCardCue = false;

// Short, demo-friendly explanation derived from existing fields only (protein content
// and how close this dish's calories are to the user's current nutrition state) — not a
// new recommendation algorithm, just picking one of a few canned sentences.
function buildRecommendationReason(calories: number, protein: number, referenceCalories: number): string {
  if (protein >= 25) {
    return "今天蛋白質不足，這餐能補充高蛋白。";
  }
  if (Math.abs(calories - referenceCalories) <= 80) {
    return "熱量接近下一餐建議範圍。";
  }
  return "比較符合目前的營養缺口。";
}

// Cosmetic "match" percentage derived from the same calorie-proximity value already
// used to rank the list — not a separate scoring algorithm.
function buildMatchPercent(calories: number, referenceCalories: number): number {
  const delta = Math.abs(calories - referenceCalories);
  return Math.max(70, Math.min(99, 100 - Math.round(delta / 8)));
}

// Ranks every canonical menu item by how close its calories are to the user's
// current nutrition state (the just-analyzed meal, or the post-guilt-sharing
// adjusted calories) instead of forcing one dish per restaurant. This means the
// list naturally changes whenever that reference calorie value changes.
function buildNextMealRecommendationCards(limit: number, referenceCalories: number): NextMealRecommendationCard[] {
  return mobileMenuItemService.getRecommendedMenuItemsForNextMeal(limit, referenceCalories);
}

export default function AnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mealSlot?: string }>();
  const analysis = useAnalysisCorrectionState();
  const consumerRuntime = useConsumerRuntime();
  const [demoMode] = useDemoUserPlan();
  const session = getAnalysisSession();
  const [mealSaved, setMealSaved] = useState(session.mealSaved);
  const defaultMealPeriod = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1];
  const initialMealPeriod = typeof params.mealSlot === "string" ? params.mealSlot : session.selectedMealPeriod || defaultMealPeriod;
  const [selectedMealPeriod, setSelectedMealPeriod] = useState(initialMealPeriod);
  const isAnalysisConfirmed = analysis.matchState === "confirmed";
  // Stable id for this meal record so 罪惡分擔 results can be attached to it later via updateMealRecordByMealId.
  // Reused across remounts within the same AI Analysis session (see analysisSessionStore).
  const [mealId] = useState(() => session.mealId || generateMealId());
  const [preMealPhotoIds] = useState(() => (session.preMealPhotoIds.length ? session.preMealPhotoIds : [generatePhotoId("pre")]));
  const [guiltSharingResult, setGuiltSharingResult] = useState<{ peopleCount: number; sharedCaloriesPerPerson: number } | null>(session.guiltSharingResult);
  // Recalculated whenever guiltSharingResult changes, so completing Guilt Sharing
  // immediately replaces the recommendation list with one based on the updated calories.
  const referenceCalories = guiltSharingResult?.sharedCaloriesPerPerson ?? analysis.nutritionSummary.calories;
  const nextMealRecommendations = useMemo(
    () => buildNextMealRecommendationCards(getNextMealCandidateCount(demoMode), referenceCalories),
    [demoMode, referenceCalories]
  );

  useEffect(() => {
    if (typeof params.mealSlot === "string") {
      setSelectedMealPeriod(params.mealSlot);
    }
  }, [params.mealSlot]);

  // Keep the session store in sync so visiting another screen and coming back
  // restores this exact state instead of starting a new AI Analysis session.
  useEffect(() => {
    session.mealSaved = mealSaved;
    session.selectedMealPeriod = selectedMealPeriod;
    session.mealId = mealId;
    session.preMealPhotoIds = preMealPhotoIds;
    session.guiltSharingResult = guiltSharingResult;
  });

  function persistCanonicalMealToExplicitDemoStore(mealRecordId: string, mealDate: string) {
    saveCorrectedMealRecord({
      mealId: mealRecordId,
      restaurantName: analysis.restaurantName,
      mealName: analysis.mealName,
      calories: analysis.nutritionSummary.calories,
      protein: analysis.nutritionSummary.protein,
      carbohydrates: analysis.nutritionSummary.carbohydrates,
      fat: analysis.nutritionSummary.fat,
      ingredients: "",
      portion: analysis.nutritionSummary.portion,
      mealPeriod: selectedMealPeriod,
      date: mealDate.replaceAll("-", "/"),
      estimatedCalories: analysis.nutritionSummary.calories,
      source: analysis.isSelfCooked ? "self_made" : "ai_estimated"
    });
  }

  function handleGuiltSharingConfirm(result: { peopleCount: number; sharedCaloriesPerPerson: number }) {
    // 罪惡分擔 only attaches the split result to this meal record — it never asks
    // meal-completion questions (those live in the post-meal rating flow only).
    setGuiltSharingResult(result);
    updateMealRecordByMealId(mealId, {
      calorieSharingPeopleCount: result.peopleCount,
      sharedCaloriesPerPerson: result.sharedCaloriesPerPerson
    });
  }

  async function saveMealRecordFromExplicitGesture() {
    const originalDetectedName = zhTW.mobile.analysis.candidates[0].meal;
    const result = await consumerRuntime.createMealRecord({
      selectedMealPeriod,
      mealName: analysis.mealName,
      originalDetectedName,
      portion: analysis.nutritionSummary.portion,
      nutrition: {
        calories: analysis.nutritionSummary.calories,
        protein: analysis.nutritionSummary.protein,
        carbohydrates: analysis.nutritionSummary.carbohydrates,
        fat: analysis.nutritionSummary.fat
      },
      isSelfCooked: analysis.isSelfCooked,
      wasUserCorrected: analysis.nutritionRefreshed || analysis.correctionCompleted || Object.keys(analysis.correctedRows).length > 0 || analysis.mealName !== originalDetectedName,
      trustedCanonicalIdentity: null
    });
    completeSuccessfulMealWrite(result);
  }

  async function retryPendingMealRecord() {
    completeSuccessfulMealWrite(await consumerRuntime.retryPendingMealRecord());
  }

  function completeSuccessfulMealWrite(result: typeof consumerRuntime.mealWriteState) {
    if (result.status !== "succeeded" || !result.mealRecordId || !result.mealDate) return;
    if (consumerRuntime.mode === "mock") persistCanonicalMealToExplicitDemoStore(result.mealRecordId, result.mealDate);
    setMealSaved(true);
    router.push("/today-intake");
  }

  function renderSuccessActions() {
    return <CorrectionSuccessActions hasRestaurantContext={analysis.hasRestaurantContext} onOpenMealLog={saveMealRecordFromExplicitGesture} onOpenSocial={() => router.push("/meal-buddies")} />;
  }

  function openNextMealRecommendation(meal: NextMealRecommendationCard) {
    router.push({ pathname: "/recommendation", params: { prototypeId: meal.menuItemId } });
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.analysisTitle}
      subtitle={zhTW.mobile.analysisSubtitle}
    >
      {mealSaved ? (
        <TodayIntakeSummary onFindBuddy={() => router.push("/meal-buddies")} onNextMeal={() => router.push("/recommendation")} onOpenMealLog={() => router.push("/meal-log")} />
      ) : (
        <>
          <SnowCard tone="primary">
            <SnowSectionHeader title={zhTW.mobile.correctedFlow.mealResultTitle} subtitle={zhTW.mobile.correctedFlow.mealResultBody} />
            <View style={[styles.photoArea, isAnalysisConfirmed && styles.photoAreaConfirmed]}>
              {isAnalysisConfirmed ? (
                <>
                  <LinearGradient colors={[snow.heroFrom, snow.heroTo]} style={styles.photoGradient} />
                  <View style={styles.photoConfidenceBadge}>
                    <Icon name="spark" size={12} color={snow.primaryDeep} />
                    <Text style={styles.photoBadgeText}>{zhTW.mobile.analysis.confidenceLevels[1]}</Text>
                  </View>
                  <View style={styles.photoIconLarge}>
                    <Icon name="plate" size={26} color={snow.primaryDeep} />
                  </View>
                  <Text style={styles.photoAreaText}>{zhTW.mobile.refinedLogic.aiEntry.heroBody}</Text>
                  <View style={styles.photoCaptionBadge}>
                    <Text style={styles.photoBadgeText}>{zhTW.mobile.analysis.imageLabel}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.photoBadge}>
                    <Icon name="spark" size={12} color={snow.primaryDeep} />
                    <Text style={styles.photoBadgeText}>{zhTW.mobile.nav.analysis}</Text>
                  </View>
                  <View style={styles.photoIcon}>
                    <Icon name="camera" size={22} color={snow.primaryDeep} />
                  </View>
                  <Text style={styles.photoAreaText}>{zhTW.mobile.refinedLogic.aiEntry.heroBody}</Text>
                </>
              )}
              <SecondaryButton icon="camera" label={zhTW.mobile.refinedLogic.homeFocus.photoAnalysis} onPress={() => router.push("/meal-photo")} />
            </View>
          </SnowCard>

          <SnowCard>
            <SnowSectionHeader title={zhTW.mobile.analysis.modeTitle} subtitle="這是第幾餐？" />
            <View style={styles.chipRow}>
              {zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions.map((period) => (
                <Chip key={period} label={period} active={selectedMealPeriod === period} onPress={() => setSelectedMealPeriod(period)} />
              ))}
            </View>
            <View style={styles.mealSourceRow}>
              <Pressable style={[styles.mealSourceCard, !analysis.isSelfCooked && styles.mealSourceCardActive]} onPress={() => analysis.setMode("restaurant")}>
                {!analysis.isSelfCooked ? (
                  <View style={styles.mealSourceCheck}>
                    <Icon name="check" size={12} color="#FFFFFF" />
                  </View>
                ) : null}
                <Text style={[styles.mealSourceTitle, !analysis.isSelfCooked && styles.mealSourceTitleActive]}>{zhTW.mobile.analysis.restaurantMode}</Text>
                <Text style={styles.mealSourceSubtitle}>{zhTW.mobile.analysis.restaurantModeSubtitle}</Text>
              </Pressable>
              <Pressable style={[styles.mealSourceCard, analysis.isSelfCooked && styles.mealSourceCardActive]} onPress={() => analysis.setMode("selfCooked")}>
                {analysis.isSelfCooked ? (
                  <View style={styles.mealSourceCheck}>
                    <Icon name="check" size={12} color="#FFFFFF" />
                  </View>
                ) : null}
                <Text style={[styles.mealSourceTitle, analysis.isSelfCooked && styles.mealSourceTitleActive]}>{zhTW.mobile.analysis.selfCookedMode}</Text>
                <Text style={styles.mealSourceSubtitle}>{zhTW.mobile.analysis.selfCookedModeSubtitle}</Text>
              </Pressable>
            </View>
          </SnowCard>

          {analysis.isSelfCooked ? (
            <SelfCookedIntro nutritionSummary={analysis.nutritionSummary} />
          ) : isAnalysisConfirmed ? (
            <CompletedAnalysisHero
              nutritionSummary={analysis.nutritionSummary}
              mealName={analysis.mealName}
              guiltSharingResult={guiltSharingResult}
              onOpenMealLog={saveMealRecordFromExplicitGesture}
              onOpenNutritionRecord={() => router.push("/meal-log")}
              onGuiltShare={handleGuiltSharingConfirm}
              nextMealRecommendations={nextMealRecommendations}
              isPremium={demoMode === "premium"}
              onSelectMeal={openNextMealRecommendation}
              onViewRestaurant={(restaurantId) => router.push({ pathname: "/restaurants", params: { restaurantId } })}
            />
          ) : (
            <ExternalDiningAnalysis analysis={analysis} />
          )}

          {!analysis.isSelfCooked && analysis.matchState === "editing" ? <CandidateCorrectionList analysis={analysis} renderSuccessActions={renderSuccessActions} /> : null}

          {consumerRuntime.mealWriteState.status === "submitting" ? (
            <Card><SectionTitle title={zhTW.mobile.consumerMealWrite.submitting} /></Card>
          ) : null}
          {consumerRuntime.mealWriteState.status === "uncertain" ? (
            <Card>
              <SectionTitle title={zhTW.mobile.consumerMealWrite.uncertainTitle} subtitle={zhTW.mobile.consumerMealWrite.uncertainBody} />
              <View style={styles.ctaColumn}>
                <PrimaryButton icon="check" label={zhTW.mobile.consumerMealWrite.retrySameRequest} onPress={retryPendingMealRecord} />
                <SecondaryButton icon="chart" label={zhTW.mobile.consumerMealWrite.checkTodayIntake} onPress={() => router.push("/today-intake")} />
              </View>
            </Card>
          ) : consumerRuntime.mealWriteState.status === "error" ? (
            <Card><SectionTitle title={zhTW.mobile.consumerMealWrite.errorTitle} subtitle={zhTW.mobile.consumerMealWrite.errorBody} /></Card>
          ) : null}

          {!isAnalysisConfirmed ? (
            <SnowCard>
              <SnowSectionHeader title={zhTW.mobile.analysis.summary} />
              <View style={styles.statGrid}>
                <StatCard icon="flame" label={zhTW.mobile.analysis.calories} value={`${analysis.nutritionSummary.calories} kcal`} tone="primary" />
                <StatCard icon="leaf" label={zhTW.mobile.analysis.protein} value={`${analysis.nutritionSummary.protein}g`} />
                <StatCard icon="target" label={zhTW.mobile.analysis.carbs} value={`${analysis.nutritionSummary.carbohydrates}g`} tone="ai" />
                <StatCard icon="star" label={zhTW.mobile.analysis.fat} value={`${analysis.nutritionSummary.fat}g`} />
                <StatCard icon="bookmark" label={zhTW.mobile.finalUx.mealRecordFields[3]} value={analysis.nutritionSummary.portion} />
                <StatCard icon="check" label={zhTW.mobile.analysis.balanceScore} value={`${analysis.nutritionSummary.balanceScore}`} tone="primary" />
              </View>
              <View style={styles.ingredientSection}>
                <Text style={styles.ingredientLabel}>{zhTW.mobile.finalUx.ingredientCorrectionTitle}</Text>
                <View style={styles.ingredientList}>
                  {analysis.nutritionSummary.ingredientSummary
                    .split(/[、,，]/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .map((item, index) => (
                      <View key={item} style={styles.ingredientRow}>
                        <View style={[styles.ingredientDot, [styles.ingredientDotPrimary, styles.ingredientDotAccent, styles.ingredientDotAmber, styles.ingredientDotGreen][index % 4]]} />
                        <Text style={styles.ingredientName}>{item}</Text>
                      </View>
                    ))}
                </View>
              </View>
            </SnowCard>
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
            <SnowCard tone="ai">
              <SnowSectionHeader title={zhTW.mobile.nextMealTitle} subtitle={zhTW.mobile.analysis.recommendation} />
              <Text style={styles.stateText}>{zhTW.mobile.refinedLogic.analysisFlow.bridgeBody}</Text>
            </SnowCard>
          ) : null}

          {!isAnalysisConfirmed ? (
            <SnowCard>
              <SnowSectionHeader title={zhTW.mobile.analysis.mealTagsTitle} />
              <View style={styles.chipRow}>
                {(analysis.isSelfCooked ? zhTW.mobile.analysis.selfCookedTags : zhTW.mobile.analysis.mealTags).map((tag) => (
                  <Chip key={tag} label={tag} />
                ))}
              </View>
            </SnowCard>
          ) : null}

          {!isAnalysisConfirmed ? (
            <SnowCard>
              <SnowSectionHeader title={zhTW.mobile.analysis.goalTagsTitle} />
              <View style={styles.chipRow}>
                {zhTW.mobile.analysis.goalTags.map((tag) => (
                  <Chip key={tag} label={tag} tone="ai" />
                ))}
              </View>
            </SnowCard>
          ) : null}
        </>
      )}
    </PlaceholderScreen>
  );
}

function MacroChipsRow({ nutritionSummary }: { nutritionSummary: ReturnType<typeof useAnalysisCorrectionState>["nutritionSummary"] }) {
  const items: { label: string; value: string; unit: string; chipStyle: object; valueStyle: object }[] = [
    { label: zhTW.mobile.analysis.calories, value: `${nutritionSummary.calories}`, unit: "kcal", chipStyle: styles.macroChipPrimary, valueStyle: styles.macroValuePrimary },
    { label: zhTW.mobile.analysis.protein, value: `${nutritionSummary.protein}`, unit: "g", chipStyle: styles.macroChipPrimary, valueStyle: styles.macroValuePrimary },
    { label: zhTW.mobile.analysis.carbs, value: `${nutritionSummary.carbohydrates}`, unit: "g", chipStyle: styles.macroChipAccent, valueStyle: styles.macroValueAccent },
    { label: zhTW.mobile.analysis.fat, value: `${nutritionSummary.fat}`, unit: "g", chipStyle: styles.macroChipAmber, valueStyle: styles.macroValueAmber }
  ];

  return (
    <View style={styles.macroRow}>
      {items.map((item) => (
        <View key={item.label} style={[styles.macroChip, item.chipStyle]}>
          <Text style={[styles.macroChipValue, item.valueStyle]}>
            {item.value}
            <Text style={styles.macroChipUnit}> {item.unit}</Text>
          </Text>
          <Text style={styles.macroChipLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function SelfCookedIntro({ nutritionSummary }: { nutritionSummary: ReturnType<typeof useAnalysisCorrectionState>["nutritionSummary"] }) {
  return (
    <SnowCard tone="primary">
      <SnowSectionHeader title={zhTW.mobile.analysis.selfCookedTitle} subtitle={zhTW.mobile.analysis.selfCookedBody} />
      <MacroChipsRow nutritionSummary={nutritionSummary} />
      <Text style={styles.disclaimer}>{zhTW.mobile.analysis.nutritionDisclaimer}</Text>
      <EstimatePreview title={zhTW.mobile.analysis.estimatedIngredientsTitle} items={zhTW.mobile.analysis.estimatedIngredients} />
      <EstimatePreview title={zhTW.mobile.analysis.estimatedPortionsTitle} items={zhTW.mobile.analysis.estimatedPortions} />
      <EstimatePreview title={zhTW.mobile.analysis.estimatedCookingTitle} items={zhTW.mobile.analysis.estimatedCooking} />
      <Text style={styles.confidence}>{zhTW.mobile.analysis.confidenceLevels[1]}</Text>
      <Text style={styles.stateText}>{zhTW.mobile.analysis.selfCookedSaved}</Text>
      <View style={styles.chipRow}>
        {zhTW.mobile.analysis.selfCookedTags.map((tag) => (
          <Chip key={tag} label={tag} tone="primary" />
        ))}
      </View>
    </SnowCard>
  );
}

function CompletedAnalysisHero({
  nutritionSummary,
  mealName,
  guiltSharingResult,
  onOpenMealLog,
  onOpenNutritionRecord,
  onGuiltShare,
  nextMealRecommendations,
  isPremium,
  onSelectMeal,
  onViewRestaurant
}: {
  nutritionSummary: ReturnType<typeof useAnalysisCorrectionState>["nutritionSummary"];
  mealName: string;
  guiltSharingResult: { peopleCount: number; sharedCaloriesPerPerson: number } | null;
  onOpenMealLog: () => void;
  onOpenNutritionRecord: () => void;
  onGuiltShare: (result: { peopleCount: number; sharedCaloriesPerPerson: number }) => void;
  nextMealRecommendations: NextMealRecommendationCard[];
  isPremium: boolean;
  onSelectMeal: (item: NextMealRecommendationCard) => void;
  onViewRestaurant: (restaurantId: string) => void;
}) {
  return (
    <SnowCard tone="primary">
      <View style={styles.completedHeroVisual}>
        <View style={styles.completedCheck}>
          <Icon name="check" size={36} color="#FFFFFF" />
        </View>
      </View>
      <SnowSectionHeader title={zhTW.mobile.refinedLogic.analysisFlow.bridgeTitle} subtitle={zhTW.mobile.refinedLogic.analysisFlow.bridgeBody} />
      <MacroChipsRow nutritionSummary={nutritionSummary} />
      <NextMealRecommendationCarousel recommendations={nextMealRecommendations} isPremium={isPremium} onSelectMeal={onSelectMeal} onViewRestaurant={onViewRestaurant} />
      <SingleMealGuiltShare
        estimatedCalories={nutritionSummary.calories}
        mealName={mealName}
        calorieSharingPeopleCount={guiltSharingResult?.peopleCount}
        sharedCaloriesPerPerson={guiltSharingResult?.sharedCaloriesPerPerson}
        onShare={onGuiltShare}
      />
      <View style={styles.ctaColumn}>
        <View style={styles.ctaRow2}>
          <View style={styles.ctaItem}>
            <SecondaryButton icon="check" label={zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord} onPress={onOpenMealLog} />
          </View>
          <View style={styles.ctaItem}>
            <SecondaryButton icon="chart" label={zhTW.mobile.refinedLogic.analysisFlow.viewNutritionRecord} onPress={onOpenNutritionRecord} />
          </View>
        </View>
      </View>
    </SnowCard>
  );
}

function NextMealRecommendationCarousel({
  recommendations,
  isPremium,
  onSelectMeal,
  onViewRestaurant
}: {
  recommendations: NextMealRecommendationCard[];
  isPremium: boolean;
  onSelectMeal: (item: NextMealRecommendationCard) => void;
  onViewRestaurant: (restaurantId: string) => void;
}) {
  const [expandedReasonId, setExpandedReasonId] = useState("");
  const copy = zhTW.mobile.refinedLogic.analysisFlow;
  const cueScale = useMemo(() => new Animated.Value(hasPlayedRecommendationCardCue ? 1 : 0.985), []);

  useEffect(() => {
    if (hasPlayedRecommendationCardCue || recommendations.length === 0) {
      return;
    }

    hasPlayedRecommendationCardCue = true;
    Animated.sequence([
      Animated.timing(cueScale, { toValue: 1.012, duration: 180, useNativeDriver: true }),
      Animated.timing(cueScale, { toValue: 1, duration: 180, useNativeDriver: true })
    ]).start();
  }, [cueScale, recommendations.length]);

  return (
    <View style={styles.nextMealPanel}>
      <Text style={styles.nextMealEyebrow}>{zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.nextMealSocialTitle}</Text>
      <Text style={styles.nextMealTitle}>{copy.nextMealCarouselTitle}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recoTrack}>
        {recommendations.map((item) => {
          const reasonExpanded = expandedReasonId === item.menuItemId;
          return (
            <Animated.View key={item.menuItemId} style={[styles.recoCard, { transform: [{ scale: cueScale }] }]}>
              <Pressable
                accessibilityHint="查看這筆下一餐推薦結果"
                accessibilityRole="button"
                style={({ pressed }) => [styles.recoCardTapArea, pressed && styles.recoCardTapAreaPressed]}
                onPress={() => onSelectMeal(item)}
              >
                <View style={styles.recoPhoto}>
                  <Text style={styles.recoEmoji}>{item.emoji}</Text>
                </View>
                <Chip label={copy.aiRecommendedBadge} tone="primary" />
                <Text style={styles.recoMatchLabel}>{item.matchPercent}% {copy.matchLabelSuffix}</Text>
                <Text style={styles.recoName}>{item.dishName}</Text>
                <Text style={styles.recoCalories}>{item.calories} kcal</Text>
                <Text style={styles.recoRestaurant}>{item.restaurantName}</Text>
                <Text style={styles.recoDistance}>{item.distance}</Text>
              </Pressable>
              <Pressable
                style={styles.recoReasonToggle}
                onPress={() => setExpandedReasonId((current) => (current === item.menuItemId ? "" : item.menuItemId))}
              >
                <Text style={styles.recoReasonToggleText}>{copy.aiReasonToggleLabel}</Text>
              </Pressable>
              {reasonExpanded ? <Text style={styles.recoReasonText}>{item.reason}</Text> : null}
              <SecondaryButton icon="plate" label={copy.viewRestaurantCta} onPress={() => onViewRestaurant(item.restaurantId)} />
              <Text style={styles.recoTapHint}>點擊餐點查看「這是你的下一餐」</Text>
            </Animated.View>
          );
        })}
      </ScrollView>
      {!isPremium ? <Text style={styles.recoPremiumHint}>{copy.premiumMoreHint}</Text> : null}
    </View>
  );
}

function TodayIntakeSummary({ onFindBuddy, onNextMeal, onOpenMealLog }: { onFindBuddy: () => void; onNextMeal: () => void; onOpenMealLog: () => void }) {
  const intake = zhTW.mobile.analysis.savedIntake;
  const daily = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake;
  const mealRecords = getTodayMealRecords();
  const lunchRecord = mealRecords.find((meal) => meal.mealPeriod === zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1]) ?? mealRecords[0];
  const currentPlannedDinner = getPlannedDinner();
  const plannedDinnerTitle = currentPlannedDinner?.plannedMealName ?? daily.plannedMeal.title;
  const plannedDinnerCalories = currentPlannedDinner?.calories ?? daily.plannedMeal.calories;
  const plannedDinnerNote = currentPlannedDinner ? `${currentPlannedDinner.restaurantName}｜預計，尚未算作已吃` : daily.plannedMeal.note;
  const plannedDinnerTags = currentPlannedDinner ? [currentPlannedDinner.mealType, "預計", "營養估算"] : daily.plannedMeal.tags;

  return (
    <>
      <SnowCard tone="primary">
        <View style={styles.chipRow}>
          <Chip label={intake.savedMessage} />
        </View>
        <SnowSectionHeader title={intake.title} subtitle={intake.body} />
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
        <View style={styles.statGrid}>
          <StatCard icon="flame" label={intake.caloriesTitle} value={intake.caloriesValue} tone="primary" />
          <StatCard icon="leaf" label={intake.proteinTitle} value={intake.proteinValue} />
          <StatCard icon="target" label={intake.carbsTitle} value={intake.carbsValue} tone="ai" />
          <StatCard icon="star" label={intake.fatTitle} value={intake.fatValue} />
          <StatCard icon="check" label={intake.balanceTitle} value={intake.balanceValue} tone="primary" />
          <StatCard icon="bookmark" label={intake.remainingTitle} value={intake.remainingValue} />
        </View>
      </SnowCard>

      <SnowCard>
        <SnowSectionHeader title={daily.mealRecordsTitle} />
        <View style={styles.mealRecordList}>
          {mealRecords.map((meal) => (
            <View key={meal.mealId ?? `${meal.date}-${meal.mealPeriod}-${meal.mealName}`} style={styles.mealRecordCard}>
              <View style={styles.mealRecordHeader}>
                <Text style={styles.mealTimePill}>{meal.mealPeriod}</Text>
                <Text style={styles.mealRecordCalories}>{getEffectiveCalories(meal)} kcal</Text>
              </View>
              <Text style={styles.mealRecordTitle}>{meal.mealName}</Text>
              <Text style={styles.mealRecordNote}>{meal.restaurantName}｜{meal.ingredients}｜{meal.portion}</Text>
              <TagRow tags={[meal.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
            </View>
          ))}
        </View>
      </SnowCard>

      <SnowCard tone="ai">
        <SnowSectionHeader title={zhTW.mobile.plannedDinner.lunchRecommendationLabel} subtitle={zhTW.mobile.plannedDinner.lunchAdvice[0]} />
        {lunchRecord ? (
          <View style={styles.currentMealCard}>
            <View style={styles.mealRecordHeader}>
              <Text style={styles.mealTimePill}>{lunchRecord.mealPeriod}</Text>
              <Text style={styles.mealRecordCalories}>{getEffectiveCalories(lunchRecord)} kcal</Text>
            </View>
            <Text style={styles.mealRecordTitle}>{lunchRecord.mealName}</Text>
            <Text style={styles.mealRecordNote}>{lunchRecord.restaurantName}｜{lunchRecord.ingredients}</Text>
            <TagRow tags={[lunchRecord.source ?? "manual", zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord]} />
          </View>
        ) : null}
      </SnowCard>

      <SnowCard tone="primary">
        <SnowSectionHeader title={daily.plannedMealTitle} />
        <View style={styles.plannedMealCard}>
          <Text style={styles.mealRecordTitle}>{plannedDinnerTitle}</Text>
          <Text style={styles.mealRecordCalories}>{plannedDinnerCalories}</Text>
          <Text style={styles.mealRecordNote}>{plannedDinnerNote}</Text>
          <Text style={styles.balanceHint}>{zhTW.mobile.plannedDinner.lunchAdvice[1]}</Text>
          <TagRow tags={plannedDinnerTags} />
        </View>
      </SnowCard>

      <SnowCard tone="primary">
        <SnowSectionHeader title={intake.nextActionsTitle} />
        <View style={styles.ctaColumn}>
          <PrimaryButton icon="buddies" label={intake.findBuddy} onPress={onFindBuddy} />
          <View style={styles.ctaRow2}>
            <View style={styles.ctaItem}>
              <SecondaryButton icon="chart" label={intake.viewLog} onPress={onOpenMealLog} />
            </View>
            <View style={styles.ctaItem}>
              <SecondaryButton icon="clock" label={intake.nextMeal} onPress={onNextMeal} />
            </View>
          </View>
        </View>
      </SnowCard>
    </>
  );
}

function ExternalDiningAnalysis({ analysis }: { analysis: ReturnType<typeof useAnalysisCorrectionState> }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <SnowCard tone="ai">
      <SnowSectionHeader title={zhTW.mobile.analysis.precisionTitle} subtitle={zhTW.mobile.analysis.precisionBody} />
      <View style={styles.chipRow}>
        <Chip label={zhTW.mobile.analysis.locationLabel} />
        <Chip label={zhTW.mobile.analysis.topMatchTitle} />
        <Chip label={zhTW.mobile.analysis.confidenceLabel} />
      </View>
      <View style={styles.restaurantSummary}>
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.restaurantNameLabel}</Text>
        <Text style={styles.summaryValue}>{zhTW.mobile.analysis.candidates[0].restaurant}</Text>
        <Text style={styles.summaryLabel}>{zhTW.mobile.finalUx.mealNameLabel}</Text>
        <Text style={styles.summaryValue}>{zhTW.mobile.analysis.candidates[0].meal}</Text>
      </View>
      <MacroChipsRow nutritionSummary={analysis.nutritionSummary} />
      <SecondaryButton
        icon="chevron"
        label={showDetails ? zhTW.mobile.refinedLogic.aiEntry.detailToggleClose : zhTW.mobile.refinedLogic.aiEntry.detailToggleOpen}
        onPress={() => setShowDetails((current) => !current)}
      />
      {showDetails ? (
        <>
          <Text style={styles.costHint}>{zhTW.mobile.finalUx.aiCostControlHint}</Text>
          <View style={styles.chipRow}>
            {zhTW.mobile.finalUx.databaseMatchSources.map((source) => (
              <Chip key={source} label={source} />
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
      <View style={styles.ctaRow2}>
        <View style={styles.ctaItem}>
          <PrimaryButton icon="check" label={zhTW.mobile.analysis.confirmMatch} onPress={() => analysis.setMatchState("confirmed")} />
        </View>
        <View style={styles.ctaItem}>
          <SecondaryButton icon="edit" label={zhTW.mobile.analysis.notThis} onPress={() => analysis.setMatchState("editing")} />
        </View>
      </View>
      {analysis.matchState === "confirmed" ? <Text style={styles.stateText}>{zhTW.mobile.analysis.confirmedMatch}</Text> : null}
      {analysis.matchState === "editing" ? (
        <>
          <Text style={styles.stateText}>{zhTW.mobile.analysis.correctionSaved}</Text>
          <Text style={styles.stateText}>{zhTW.mobile.analysis.futureLearning}</Text>
        </>
      ) : null}
    </SnowCard>
  );
}

function CandidateCorrectionList({ analysis, renderSuccessActions }: { analysis: ReturnType<typeof useAnalysisCorrectionState>; renderSuccessActions: () => ReactNode }) {
  return (
    <SnowCard>
      <SnowSectionHeader title={zhTW.mobile.finalUx.notThisMenuTitle} subtitle={zhTW.mobile.finalUx.notThisMenuBody} />
      <View style={styles.candidateList}>
        {zhTW.mobile.analysis.candidates.map((candidate) => (
          <Pressable key={`${candidate.restaurant}-${candidate.meal}`} style={styles.candidate} onPress={() => analysis.setMatchState("confirmed")}>
            <View style={styles.candidateHeader}>
              <View style={styles.flex}>
                <Text style={styles.candidateTitle}>{candidate.restaurant}</Text>
                <Text style={styles.candidateBody}>{candidate.meal}</Text>
              </View>
              <View style={styles.candidateConfidence}>
                <Icon name="check" size={14} color={snow.primaryDeep} />
                <Text style={styles.candidateConfidenceText}>{candidate.confidence}</Text>
              </View>
            </View>
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
    </SnowCard>
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
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    padding: 14,
    ...shadows.soft
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
  candidateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  candidateConfidence: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  candidateConfidenceText: {
    color: snow.primaryDeep,
    fontSize: 11.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  optionCta: {
    alignSelf: "flex-start",
    borderColor: hexA(snow.primary, 0.2),
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: snow.primarySoft,
    color: snow.primaryDeep,
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
    backgroundColor: "#8AAE97",
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
    backgroundColor: colors.card,
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
    borderColor: colors.line,
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
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: colors.card,
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
    backgroundColor: snow.primary,
    height: 82,
    shadowColor: snow.primaryDeep,
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
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    padding: 14,
    ...shadows.soft
  },
  mealRecordCalories: {
    color: snow.primaryDeep,
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
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    color: snow.primaryDeep,
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
    backgroundColor: "#8AAE97"
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
  recoTrack: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    paddingRight: 6,
    paddingVertical: 4
  },
  recoCard: {
    width: 188,
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: "#ffffff",
    padding: 12,
    ...shadows.soft
  },
  recoCardTapArea: {
    gap: 6
  },
  recoCardTapAreaPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }]
  },
  recoPhoto: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft
  },
  recoEmoji: {
    fontSize: 24
  },
  recoName: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recoCalories: {
    color: snow.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  recoRestaurant: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  recoDistance: {
    color: snow.sub,
    fontSize: 11,
    fontFamily: fonts.body
  },
  recoMatchLabel: {
    color: snow.primaryDeep,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  recoReasonToggle: {
    alignSelf: "flex-start"
  },
  recoReasonToggleText: {
    color: snow.sub,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  recoReasonText: {
    color: snow.sub,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.body
  },
  recoTapHint: {
    color: snow.sub,
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: fonts.body,
    fontWeight: "600",
    textAlign: "center",
    opacity: 0.72
  },
  recoPremiumHint: {
    color: snow.sub,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    fontWeight: "700",
    marginTop: 10
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
    backgroundColor: colors.card,
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
    borderColor: hexA(snow.ai, 0.18),
    backgroundColor: snow.aiSoft
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
  macroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  macroChip: {
    flexGrow: 1,
    flexBasis: "22%",
    alignItems: "center",
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 2
  },
  macroChipPrimary: {
    backgroundColor: hexA(snow.primary, 0.12)
  },
  macroChipAccent: {
    backgroundColor: hexA(snow.accent, 0.12)
  },
  macroChipAmber: {
    backgroundColor: hexA(snow.amber, 0.14)
  },
  macroChipValue: {
    color: snow.ink,
    fontSize: 16,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  macroValuePrimary: {
    color: snow.primaryDeep
  },
  macroValueAccent: {
    color: snow.accent
  },
  macroValueAmber: {
    color: snow.amber
  },
  macroChipUnit: {
    color: snow.sub,
    fontSize: 10,
    fontFamily: fonts.body
  },
  macroChipLabel: {
    color: snow.sub,
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "700"
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
  },
  photoArea: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: hexA(snow.primary, 0.24),
    borderStyle: "dashed",
    backgroundColor: snow.card,
    minHeight: 160,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: "relative",
    overflow: "hidden"
  },
  photoAreaConfirmed: {
    borderStyle: "solid",
    borderColor: hexA(snow.primary, 0.12)
  },
  photoGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  photoBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: snow.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  photoConfidenceBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  photoCaptionBadge: {
    position: "absolute",
    bottom: 12,
    left: 12,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  photoBadgeText: {
    color: snow.primaryDeep,
    fontSize: 11,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  photoIconLarge: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)"
  },
  photoIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: snow.primarySoft
  },
  photoAreaText: {
    color: snow.sub,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  mealSourceRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14
  },
  // Matches recoCard's visual language (radius.lg + shadows.soft + white background)
  // so the meal-source picker reads as the same card style as the recommendation cards.
  mealSourceCard: {
    flex: 1,
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: snow.line,
    backgroundColor: "#ffffff",
    padding: 16,
    minHeight: 108,
    position: "relative",
    ...shadows.soft
  },
  mealSourceCardActive: {
    borderColor: snow.primary,
    backgroundColor: snow.primarySoft
  },
  mealSourceCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: snow.primary
  },
  mealSourceTitle: {
    color: snow.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  mealSourceTitleActive: {
    color: snow.primaryDeep
  },
  mealSourceSubtitle: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 17
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  ingredientSection: {
    marginTop: 16
  },
  ingredientLabel: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800",
    marginBottom: 8
  },
  ingredientList: {
    gap: 8
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: snow.line,
    backgroundColor: snow.card,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  ingredientDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  ingredientDotPrimary: {
    backgroundColor: snow.primary
  },
  ingredientDotAccent: {
    backgroundColor: snow.accent
  },
  ingredientDotAmber: {
    backgroundColor: snow.amber
  },
  ingredientDotGreen: {
    backgroundColor: snow.green
  },
  ingredientName: {
    color: snow.ink,
    fontSize: 13.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  ctaColumn: {
    gap: 10,
    marginTop: 16
  },
  ctaRow2: {
    flexDirection: "row",
    gap: 10
  },
  ctaItem: {
    flex: 1
  }
});
