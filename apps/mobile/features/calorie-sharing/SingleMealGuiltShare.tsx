import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Icon } from "../../theme/icons";
import { fonts, radius, snowPalette as colors } from "../../theme/tokens";
import { GuiltSharingButton } from "./GuiltSharingButton";
import { GuiltSharingModal, type GuiltSharingResult } from "./GuiltSharingModal";

// Single-meal 罪惡分擔 entry: shows the GuiltSharingButton (or, once shared, a
// summary of the split) and owns the modal. Never asks meal-completion questions —
// that only happens in the post-meal rating flow (MealCompletionForm).
export function SingleMealGuiltShare({
  estimatedCalories,
  mealName,
  calorieSharingPeopleCount,
  sharedCaloriesPerPerson,
  onShare
}: {
  estimatedCalories: number;
  mealName?: string;
  calorieSharingPeopleCount?: number;
  sharedCaloriesPerPerson?: number;
  onShare?: (result: GuiltSharingResult) => void;
}) {
  const t = zhTW.mobile.calorieSharing;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [result, setResult] = useState<GuiltSharingResult | null>(
    calorieSharingPeopleCount && sharedCaloriesPerPerson ? { peopleCount: calorieSharingPeopleCount, sharedCaloriesPerPerson } : null
  );

  const handleConfirm = (next: GuiltSharingResult) => {
    setResult(next);
    setIsModalOpen(false);
    onShare?.(next);
  };

  return (
    <View style={styles.wrap}>
      {result ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Icon name="heart" size={16} color={colors.primaryDeep} />
            <Text style={styles.resultTitle}>{t.guiltShareResultTitle}</Text>
          </View>
          <Text style={styles.resultStats}>
            {result.peopleCount} 人分攤 · {t.perPersonCaloriesLabel} {result.sharedCaloriesPerPerson} kcal
          </Text>
          <Text style={styles.resultNote}>{t.guiltShareSavedNote}</Text>
          <GuiltSharingButton label={t.guiltShareButton} onPress={() => setIsModalOpen(true)} />
        </View>
      ) : (
        <GuiltSharingButton onPress={() => setIsModalOpen(true)} />
      )}

      <GuiltSharingModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleConfirm}
        estimatedCalories={estimatedCalories}
        mealName={mealName}
        initialPeopleCount={result?.peopleCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10
  },
  resultCard: {
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.primarySoft,
    padding: 14,
    gap: 8
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  resultTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  resultStats: {
    color: colors.primaryDeep,
    fontSize: 13,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  resultNote: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body
  }
});
