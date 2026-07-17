import { useEffect, useReducer, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { MealCompletionPercentage, PortionFeeling, UnfinishedReasonKey } from "../analysis/types";
import {
  createConsumerRatingFormHydrationState,
  getConsumerRatingUiMessageKey,
  reduceConsumerRatingFormHydration,
  type ConsumerRatingInitialHydration,
  type ConsumerRatingUiState
} from "../consumer-ratings/consumerRatingUiModel";
import { Icon } from "../../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as colors } from "../../theme/tokens";
import { ActualCalorieShare } from "./ActualCalorieShare";
import { calculateActualCalories } from "./calorieSharingUtils";

export type MealCompletionResult = {
  rating: number;
  portionFeeling: PortionFeeling;
  wouldEatAgain: boolean;
  completionPercentage: MealCompletionPercentage;
  unfinishedReason?: UnfinishedReasonKey;
  actualCalories: number;
};

const completionPercentages: MealCompletionPercentage[] = [100, 75, 50, 25, 10];

// Post-meal rating + actual intake correction. This is the ONLY place that asks
// about unfinished food / meal completion — never shown right after AI analysis.
export function MealCompletionForm({
  visible,
  onClose,
  onSubmit,
  estimatedCalories,
  mealName,
  formIdentity,
  initialValues,
  canonicalInitialValues,
  canonicalRatingState
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (result: MealCompletionResult) => void | Promise<void>;
  estimatedCalories: number;
  mealName?: string;
  formIdentity: string;
  initialValues?: Partial<MealCompletionResult>;
  canonicalInitialValues?: ConsumerRatingInitialHydration | null;
  canonicalRatingState?: ConsumerRatingUiState;
}) {
  const t = zhTW.mobile.calorieSharing;
  const [step, setStep] = useState<"form" | "result">("form");
  const [ratingFields, dispatchRatingFields] = useReducer(
    reduceConsumerRatingFormHydration,
    createConsumerRatingFormHydrationState(formIdentity, initialValues)
  );
  const [completionPercentage, setCompletionPercentage] = useState<MealCompletionPercentage>(initialValues?.completionPercentage ?? 100);
  const [unfinishedReason, setUnfinishedReason] = useState<UnfinishedReasonKey | undefined>(initialValues?.unfinishedReason);
  const [submittedResult, setSubmittedResult] = useState<MealCompletionResult | null>(null);
  const submitInFlight = useRef(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setStep("form");
    dispatchRatingFields({ type: "reset", identity: formIdentity, values: initialValues });
    setCompletionPercentage(initialValues?.completionPercentage ?? 100);
    setUnfinishedReason(initialValues?.unfinishedReason);
    setSubmittedResult(null);
    submitInFlight.current = false;
  }, [formIdentity, visible]);

  useEffect(() => {
    if (!visible || step !== "form" || !canonicalInitialValues) return;
    dispatchRatingFields({
      type: "hydrate",
      identity: canonicalInitialValues.identity,
      values: canonicalInitialValues.values
    });
  }, [
    canonicalInitialValues?.identity,
    canonicalInitialValues?.values.portionFeeling,
    canonicalInitialValues?.values.rating,
    canonicalInitialValues?.values.wouldEatAgain,
    step,
    visible
  ]);

  const portionFeelingOptions: { key: PortionFeeling; label: string }[] = [
    { key: "tooMuch", label: t.portionFeelingOptions.tooMuch },
    { key: "justRight", label: t.portionFeelingOptions.justRight },
    { key: "tooLittle", label: t.portionFeelingOptions.tooLittle }
  ];

  const unfinishedReasonOptions: { key: UnfinishedReasonKey; label: string }[] = [
    { key: "portionTooLarge", label: t.unfinishedReasonOptions.portionTooLarge },
    { key: "notToMyTaste", label: t.unfinishedReasonOptions.notToMyTaste },
    { key: "tooOilySaltySweet", label: t.unfinishedReasonOptions.tooOilySaltySweet },
    { key: "dislikedIngredients", label: t.unfinishedReasonOptions.dislikedIngredients },
    { key: "allergyOrDiscomfort", label: t.unfinishedReasonOptions.allergyOrDiscomfort },
    { key: "shortOnTime", label: t.unfinishedReasonOptions.shortOnTime },
    { key: "savedForLater", label: t.unfinishedReasonOptions.savedForLater },
    { key: "sharedWithFriends", label: t.unfinishedReasonOptions.sharedWithFriends },
    { key: "other", label: t.unfinishedReasonOptions.other }
  ];

  const handleSelectCompletion = (value: MealCompletionPercentage) => {
    setCompletionPercentage(value);
    if (value === 100) {
      setUnfinishedReason(undefined);
    } else if (!unfinishedReason) {
      setUnfinishedReason("portionTooLarge");
    }
  };

  const handleSubmit = async () => {
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    const actualCalories = calculateActualCalories(estimatedCalories, completionPercentage);
    const result: MealCompletionResult = {
      rating: ratingFields.values.rating,
      portionFeeling: ratingFields.values.portionFeeling,
      wouldEatAgain: ratingFields.values.wouldEatAgain,
      completionPercentage,
      unfinishedReason: completionPercentage < 100 ? unfinishedReason : undefined,
      actualCalories
    };
    setSubmittedResult(result);
    setStep("result");
    try {
      await onSubmit(result);
    } finally {
      submitInFlight.current = false;
    }
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {step === "result" && submittedResult ? (
            <>
              <Text style={styles.title}>{t.completionFormTitle}</Text>
              <ActualCalorieShare
                estimatedCalories={estimatedCalories}
                actualCalories={submittedResult.actualCalories}
                completionPercentage={submittedResult.completionPercentage}
              />
              {canonicalRatingState?.localCompletionSaved ? (
                <Text style={styles.syncNotice}>{zhTW.mobile.consumerRatings.localCompletionSaved}</Text>
              ) : null}
              {canonicalRatingState ? (
                <Text style={styles.syncNotice}>{zhTW.mobile.consumerRatings[getConsumerRatingUiMessageKey(canonicalRatingState)]}</Text>
              ) : null}
              <Pressable style={styles.primaryButton} onPress={onClose}>
                <Text style={styles.primaryButtonText}>{t.completionSubmitCta}</Text>
              </Pressable>
            </>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>{t.completionFormTitle}</Text>
              <Text style={styles.subtitle}>{mealName ? `${mealName}｜${t.completionFormSubtitle}` : t.completionFormSubtitle}</Text>

              <Text style={styles.sectionTitle}>{t.ratingSectionTitle}</Text>
              <Text style={styles.label}>{t.ratingLabel}</Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Pressable key={value} onPress={() => dispatchRatingFields({ type: "edit_rating", value })} hitSlop={6}>
                    <Icon name="star" size={26} color={value <= ratingFields.values.rating ? colors.amber : colors.line} />
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>{t.portionFeelingLabel}</Text>
              <View style={styles.optionsRow}>
                {portionFeelingOptions.map((option) => (
                  <Pressable
                    key={option.key}
                    style={[styles.optionChip, ratingFields.values.portionFeeling === option.key && styles.optionChipActive]}
                    onPress={() => dispatchRatingFields({ type: "edit_portion", value: option.key })}
                  >
                    <Text style={[styles.optionChipText, ratingFields.values.portionFeeling === option.key && styles.optionChipTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>{t.wouldEatAgainLabel}</Text>
              <View style={styles.optionsRow}>
                <Pressable style={[styles.optionChip, ratingFields.values.wouldEatAgain && styles.optionChipActive]} onPress={() => dispatchRatingFields({ type: "edit_would_eat_again", value: true })}>
                  <Text style={[styles.optionChipText, ratingFields.values.wouldEatAgain && styles.optionChipTextActive]}>{t.wouldEatAgainOptions.yes}</Text>
                </Pressable>
                <Pressable style={[styles.optionChip, !ratingFields.values.wouldEatAgain && styles.optionChipActive]} onPress={() => dispatchRatingFields({ type: "edit_would_eat_again", value: false })}>
                  <Text style={[styles.optionChipText, !ratingFields.values.wouldEatAgain && styles.optionChipTextActive]}>{t.wouldEatAgainOptions.no}</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>{t.completionSectionTitle}</Text>
              <Text style={styles.subtitle}>{t.completionSectionSubtitle}</Text>
              <View style={styles.optionsRow}>
                {completionPercentages.map((value) => {
                  const option = t.completionOptions.find((item) => item.value === value);
                  return (
                    <Pressable
                      key={value}
                      style={[styles.optionChip, completionPercentage === value && styles.optionChipActive]}
                      onPress={() => handleSelectCompletion(value)}
                    >
                      <Text style={[styles.optionChipText, completionPercentage === value && styles.optionChipTextActive]}>{option?.label ?? `${value}%`}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {completionPercentage < 100 ? (
                <>
                  <Text style={styles.sectionTitle}>{t.unfinishedReasonTitle}</Text>
                  <Text style={styles.subtitle}>{t.unfinishedReasonSubtitle}</Text>
                  <View style={styles.optionsRow}>
                    {unfinishedReasonOptions.map((option) => (
                      <Pressable
                        key={option.key}
                        style={[styles.optionChip, unfinishedReason === option.key && styles.optionChipActive]}
                        onPress={() => setUnfinishedReason(option.key)}
                      >
                        <Text style={[styles.optionChipText, unfinishedReason === option.key && styles.optionChipTextActive]}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={onClose}>
                  <Text style={styles.secondaryButtonText}>{t.guiltShareCloseCta}</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={handleSubmit}>
                  <Text style={styles.primaryButtonText}>{t.completionSubmitCta}</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: hexA(colors.ink, 0.42),
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: 20,
    ...shadows.card
  },
  scroll: {
    maxHeight: "100%"
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 6
  },
  title: {
    color: colors.ink,
    fontSize: 19,
    fontFamily: fonts.black,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 14.5,
    fontFamily: fonts.bold,
    fontWeight: "800",
    marginTop: 6
  },
  label: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  starsRow: {
    flexDirection: "row",
    gap: 8
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    paddingHorizontal: 14,
    paddingVertical: 9
  },
  optionChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: hexA(colors.primary, 0.3)
  },
  optionChipText: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  optionChipTextActive: {
    color: colors.primaryDeep
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingVertical: 13
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  primaryButton: {
    flex: 1.3,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    marginTop: 4
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  syncNotice: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.medium,
    fontWeight: "700"
  }
});
