import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { saveCorrectedMealRecord } from "../analysis/analysisMealRecordStore";
import type { MealCompletionPercentage } from "../analysis/types";
import type { UserId } from "../meal-buddy-card/types";
import { fonts, hexA, radius, shadows, snowPalette as colors } from "../../theme/tokens";
import { ActualCalorieShare } from "./ActualCalorieShare";
import { saveGroupCalorieImport } from "./calorieSharingMock";
import type { GroupCalorieShare } from "./calorieSharingTypes";
import { calculateActualCalories, generateMealId } from "./calorieSharingUtils";

const completionPercentages: MealCompletionPercentage[] = [100, 75, 50, 25, 10];
const importDate = "2026/06/01";
const dinnerSlot = zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[2];

// Member-side opt-in for the group calorie sharing card (spec section 5).
// Tapping 加入我的今日攝取 here is the ONLY way this card affects this member's
// Today's Nutrition / Food Diary — the host generating the card never writes
// into other members' records.
export function ImportGroupCaloriesToToday({
  visible,
  onClose,
  share,
  currentUserId,
  restaurantName,
  onImported
}: {
  visible: boolean;
  onClose: () => void;
  share: GroupCalorieShare;
  currentUserId: UserId;
  restaurantName?: string;
  onImported?: () => void;
}) {
  const t = zhTW.mobile.calorieSharing;
  const [step, setStep] = useState<"form" | "result">("form");
  const [completionPercentage, setCompletionPercentage] = useState<MealCompletionPercentage>(100);
  const [actualCalories, setActualCalories] = useState(share.averageCaloriesPerPerson);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setStep("form");
    setCompletionPercentage(100);
  }, [visible]);

  const handleConfirm = () => {
    const computedActualCalories = calculateActualCalories(share.averageCaloriesPerPerson, completionPercentage);
    saveGroupCalorieImport({
      groupTableId: share.groupTableId,
      userId: currentUserId,
      importedCalories: share.averageCaloriesPerPerson,
      completionPercentage,
      actualCalories: computedActualCalories,
      importedAt: new Date().toISOString()
    });
    saveCorrectedMealRecord({
      mealId: generateMealId(),
      restaurantName: restaurantName ?? "同桌分攤",
      mealName: t.groupCardTitle,
      calories: computedActualCalories,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      ingredients: t.groupCardAverageLabel,
      portion: "依同桌平均分攤估算",
      mealPeriod: dinnerSlot,
      date: importDate,
      source: "ai_estimated",
      estimatedCalories: share.averageCaloriesPerPerson,
      actualCalories: computedActualCalories,
      completionPercentage
    });
    setActualCalories(computedActualCalories);
    setStep("result");
    onImported?.();
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {step === "result" ? (
            <>
              <Text style={styles.title}>{t.importModalTitle}</Text>
              <ActualCalorieShare estimatedCalories={share.averageCaloriesPerPerson} actualCalories={actualCalories} completionPercentage={completionPercentage} />
              <Text style={styles.note}>{t.importSavedNote}</Text>
              <Pressable style={styles.primaryButton} onPress={onClose}>
                <Text style={styles.primaryButtonText}>{t.importConfirmCta}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t.importModalTitle}</Text>
              <Text style={styles.subtitle}>{t.importModalSubtitle}</Text>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t.importPrefillLabel}</Text>
                <Text style={styles.statValue}>{share.averageCaloriesPerPerson} kcal</Text>
              </View>

              <Text style={styles.label}>{t.importCompletionLabel}</Text>
              <View style={styles.optionsRow}>
                {completionPercentages.map((value) => {
                  const option = t.completionOptions.find((item) => item.value === value);
                  return (
                    <Pressable
                      key={value}
                      style={[styles.optionChip, completionPercentage === value && styles.optionChipActive]}
                      onPress={() => setCompletionPercentage(value)}
                    >
                      <Text style={[styles.optionChipText, completionPercentage === value && styles.optionChipTextActive]}>{option?.label ?? `${value}%`}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t.importResultLabel}</Text>
                <Text style={styles.statValue}>{calculateActualCalories(share.averageCaloriesPerPerson, completionPercentage)} kcal</Text>
              </View>

              <View style={styles.buttonRow}>
                <Pressable style={styles.secondaryButton} onPress={onClose}>
                  <Text style={styles.secondaryButtonText}>{t.importCancelCta}</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={handleConfirm}>
                  <Text style={styles.primaryButtonText}>{t.importConfirmCta}</Text>
                </Pressable>
              </View>
            </>
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
    maxWidth: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: 20,
    gap: 10,
    ...shadows.card
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
  label: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700",
    marginTop: 4
  },
  statBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    padding: 12,
    gap: 4,
    alignItems: "center"
  },
  statLabel: {
    color: colors.sub,
    fontSize: 11.5,
    fontFamily: fonts.body
  },
  statValue: {
    color: colors.ink,
    fontSize: 18,
    fontFamily: fonts.numeral,
    fontWeight: "800"
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
  note: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
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
    paddingVertical: 13
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  }
});
