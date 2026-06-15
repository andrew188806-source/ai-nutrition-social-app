import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { TableId, UserId } from "../meal-buddy-card/types";
import { Icon } from "../../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as colors } from "../../theme/tokens";
import { saveGroupCalorieShare } from "./calorieSharingMock";
import type { GroupCalorieShare } from "./calorieSharingTypes";
import { calculateAverageCaloriesPerPerson, generatePhotoId, generateSharedCardId } from "./calorieSharingUtils";

const peoplePresets = [2, 4, 6, 8] as const;
const caloriesPerPhoto = 480;

// MVP group table flow: only the table host can open this. Uploading photos +
// merging into one estimate does NOT touch any member's Today's Nutrition —
// it only produces a GroupCalorieShare card (see GroupCalorieSharingCard).
export function GroupTableCalorieUpload({
  visible,
  onClose,
  groupTableId,
  hostUserId,
  defaultPeopleCount = 4,
  onGenerated
}: {
  visible: boolean;
  onClose: () => void;
  groupTableId: TableId;
  hostUserId: UserId;
  defaultPeopleCount?: number;
  onGenerated: (share: GroupCalorieShare) => void;
}) {
  const t = zhTW.mobile.calorieSharing;
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [estimatedTotalCalories, setEstimatedTotalCalories] = useState<number | null>(null);
  const [selectedPeople, setSelectedPeople] = useState<number | "custom">(
    (peoplePresets as readonly number[]).includes(defaultPeopleCount) ? defaultPeopleCount : "custom"
  );
  const [customPeopleInput, setCustomPeopleInput] = useState(String(defaultPeopleCount));

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPhotoIds([]);
    setIsAnalyzing(false);
    setEstimatedTotalCalories(null);
    setSelectedPeople((peoplePresets as readonly number[]).includes(defaultPeopleCount) ? defaultPeopleCount : "custom");
    setCustomPeopleInput(String(defaultPeopleCount));
  }, [visible, defaultPeopleCount]);

  const peopleCount = (() => {
    if (selectedPeople === "custom") {
      const parsed = Number.parseInt(customPeopleInput, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }
    return selectedPeople;
  })();

  const addPhoto = () => {
    if (photoIds.length >= 5) {
      return;
    }
    const nextPhotoIds = [...photoIds, generatePhotoId("pre")];
    setPhotoIds(nextPhotoIds);
    setEstimatedTotalCalories(null);
    setIsAnalyzing(true);
    setTimeout(() => {
      setEstimatedTotalCalories(nextPhotoIds.length * caloriesPerPhoto);
      setIsAnalyzing(false);
    }, 700);
  };

  const handleGenerate = () => {
    if (estimatedTotalCalories == null) {
      return;
    }
    const share: GroupCalorieShare = {
      groupTableId,
      hostUserId,
      photoIds,
      estimatedTotalCalories,
      peopleCount,
      averageCaloriesPerPerson: calculateAverageCaloriesPerPerson(estimatedTotalCalories, peopleCount),
      createdAt: new Date().toISOString(),
      sharedCardId: generateSharedCardId()
    };
    saveGroupCalorieShare(share);
    onGenerated(share);
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{t.groupUploadTitle}</Text>
            <Text style={styles.subtitle}>{t.groupUploadSubtitle}</Text>

            <Text style={styles.label}>
              {t.groupUploadPhotoCountLabel}（{photoIds.length}/5）
            </Text>
            <View style={styles.photoRow}>
              {photoIds.map((photoId) => (
                <View key={photoId} style={styles.photoThumb}>
                  <Icon name="camera" size={18} color={colors.primaryDeep} />
                </View>
              ))}
              {photoIds.length < 5 ? (
                <Pressable style={styles.addPhotoButton} onPress={addPhoto}>
                  <Icon name="plus" size={18} color={colors.primaryDeep} />
                  <Text style={styles.addPhotoText}>{t.groupUploadAddPhotoCta}</Text>
                </Pressable>
              ) : null}
            </View>

            {isAnalyzing ? <Text style={styles.analyzingText}>{t.groupUploadAnalyzingLabel}</Text> : null}

            {estimatedTotalCalories != null ? (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t.groupCardTotalLabel}</Text>
                <Text style={styles.statValue}>{estimatedTotalCalories} kcal</Text>
              </View>
            ) : null}

            <Text style={styles.label}>{t.groupPeopleCountLabel}</Text>
            <Text style={styles.subtitle}>{t.groupPeopleCountSubtitle}</Text>
            <View style={styles.optionsRow}>
              {peoplePresets.map((value) => (
                <Pressable key={value} style={[styles.optionChip, selectedPeople === value && styles.optionChipActive]} onPress={() => setSelectedPeople(value)}>
                  <Text style={[styles.optionChipText, selectedPeople === value && styles.optionChipTextActive]}>{value} 人</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.optionChip, selectedPeople === "custom" && styles.optionChipActive]} onPress={() => setSelectedPeople("custom")}>
                <Text style={[styles.optionChipText, selectedPeople === "custom" && styles.optionChipTextActive]}>{t.customPeopleOption}</Text>
              </Pressable>
            </View>
            {selectedPeople === "custom" ? (
              <TextInput
                style={styles.customInput}
                keyboardType="number-pad"
                placeholder={t.customPeopleInputPlaceholder}
                placeholderTextColor={colors.faint}
                value={customPeopleInput}
                onChangeText={setCustomPeopleInput}
              />
            ) : null}

            {estimatedTotalCalories != null ? (
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>{t.groupCardAverageLabel}</Text>
                <Text style={styles.statValue}>{calculateAverageCaloriesPerPerson(estimatedTotalCalories, peopleCount)} kcal</Text>
              </View>
            ) : null}

            <View style={styles.buttonRow}>
              <Pressable style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>{t.guiltShareCloseCta}</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, estimatedTotalCalories == null && styles.primaryButtonDisabled]}
                disabled={estimatedTotalCalories == null}
                onPress={handleGenerate}
              >
                <Text style={styles.primaryButtonText}>{t.groupGenerateCardCta}</Text>
              </Pressable>
            </View>
          </ScrollView>
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
    fontFamily: fonts.body,
    marginBottom: 4
  },
  label: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700",
    marginTop: 6
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6
  },
  photoThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: hexA(colors.primary, 0.2)
  },
  addPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.faint,
    backgroundColor: colors.bg2,
    paddingHorizontal: 12,
    height: 52
  },
  addPhotoText: {
    color: colors.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  analyzingText: {
    color: colors.ai,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700",
    marginTop: 6
  },
  statBox: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    padding: 12,
    gap: 4,
    marginTop: 6
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
    gap: 8,
    marginTop: 6
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
  customInput: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.numeralMedium,
    marginTop: 8
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
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
  primaryButtonDisabled: {
    backgroundColor: colors.track
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  }
});
