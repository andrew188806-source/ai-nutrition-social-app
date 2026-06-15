import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { fonts, hexA, radius, shadows, snowPalette as colors } from "../../theme/tokens";
import { calculateSharedCaloriesPerPerson } from "./calorieSharingUtils";

const presetPeopleCounts = [1, 2, 3, 4] as const;

export type GuiltSharingResult = {
  peopleCount: number;
  sharedCaloriesPerPerson: number;
};

export function GuiltSharingModal({
  visible,
  onClose,
  onConfirm,
  estimatedCalories,
  mealName,
  initialPeopleCount
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (result: GuiltSharingResult) => void;
  estimatedCalories: number;
  mealName?: string;
  initialPeopleCount?: number;
}) {
  const t = zhTW.mobile.calorieSharing;
  const initialPreset = presetPeopleCounts.includes((initialPeopleCount ?? 1) as 1 | 2 | 3 | 4) ? (initialPeopleCount as 1 | 2 | 3 | 4 | undefined) : undefined;

  const [selectedPeople, setSelectedPeople] = useState<1 | 2 | 3 | 4 | "custom">(initialPreset ?? 1);
  const [customInput, setCustomInput] = useState(initialPreset ? "" : String(initialPeopleCount ?? ""));

  useEffect(() => {
    if (!visible) {
      return;
    }
    const preset = presetPeopleCounts.includes((initialPeopleCount ?? 1) as 1 | 2 | 3 | 4) ? (initialPeopleCount as 1 | 2 | 3 | 4 | undefined) : undefined;
    setSelectedPeople(preset ?? (initialPeopleCount ? "custom" : 1));
    setCustomInput(preset ? "" : initialPeopleCount ? String(initialPeopleCount) : "");
  }, [visible, initialPeopleCount]);

  const peopleCount = useMemo(() => {
    if (selectedPeople === "custom") {
      const parsed = Number.parseInt(customInput, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }
    return selectedPeople;
  }, [selectedPeople, customInput]);

  const sharedCaloriesPerPerson = calculateSharedCaloriesPerPerson(estimatedCalories, peopleCount);
  const copyOptions = t.guiltShareCopyOptions;
  const playfulCopy = copyOptions[(peopleCount - 1) % copyOptions.length];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t.guiltShareModalTitle}</Text>
          <Text style={styles.subtitle}>{mealName ? `${mealName}｜${t.guiltShareModalSubtitle}` : t.guiltShareModalSubtitle}</Text>

          <Text style={styles.label}>{t.peopleCountLabel}</Text>
          <View style={styles.optionsRow}>
            {t.peopleCountOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.optionChip, selectedPeople === option.value && styles.optionChipActive]}
                onPress={() => setSelectedPeople(option.value as 1 | 2 | 3 | 4)}
              >
                <Text style={[styles.optionChipText, selectedPeople === option.value && styles.optionChipTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.optionChip, selectedPeople === "custom" && styles.optionChipActive]} onPress={() => setSelectedPeople("custom")}>
              <Text style={[styles.optionChipText, selectedPeople === "custom" && styles.optionChipTextActive]}>{t.customPeopleOption}</Text>
            </Pressable>
          </View>

          {selectedPeople === "custom" ? (
            <View style={styles.customInputWrap}>
              <Text style={styles.label}>{t.customPeopleInputLabel}</Text>
              <TextInput
                style={styles.customInput}
                keyboardType="number-pad"
                placeholder={t.customPeopleInputPlaceholder}
                placeholderTextColor={colors.faint}
                value={customInput}
                onChangeText={setCustomInput}
              />
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t.totalCaloriesLabel}</Text>
              <Text style={styles.statValue}>{Math.round(estimatedCalories)} kcal</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t.peopleCountLabel}</Text>
              <Text style={styles.statValue}>{peopleCount} 人</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t.perPersonCaloriesLabel}</Text>
              <Text style={styles.statValue}>{sharedCaloriesPerPerson} kcal</Text>
            </View>
          </View>

          <View style={styles.copyCard}>
            <Text style={styles.copyText}>{playfulCopy}</Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>{t.guiltShareCloseCta}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => onConfirm({ peopleCount, sharedCaloriesPerPerson })}>
              <Text style={styles.primaryButtonText}>{t.guiltShareConfirmCta}</Text>
            </Pressable>
          </View>
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
    gap: 12,
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
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.body
  },
  label: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
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
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  optionChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: hexA(colors.primary, 0.3)
  },
  optionChipText: {
    color: colors.sub,
    fontSize: 13,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  optionChipTextActive: {
    color: colors.primaryDeep
  },
  customInputWrap: {
    gap: 6
  },
  customInput: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.numeralMedium
  },
  statsRow: {
    flexDirection: "row",
    gap: 8
  },
  statBox: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    padding: 10,
    gap: 4,
    alignItems: "center"
  },
  statLabel: {
    color: colors.sub,
    fontSize: 11,
    fontFamily: fonts.body,
    textAlign: "center"
  },
  statValue: {
    color: colors.ink,
    fontSize: 15,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  copyCard: {
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    padding: 12
  },
  copyText: {
    color: colors.primaryDeep,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.medium,
    fontWeight: "700",
    textAlign: "center"
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
