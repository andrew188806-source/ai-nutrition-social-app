import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import type { UserId } from "../meal-buddy-card/types";
import { Icon } from "../../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as colors } from "../../theme/tokens";
import { hasImportedGroupCalorieShare } from "./calorieSharingMock";
import type { GroupCalorieShare } from "./calorieSharingTypes";
import { ImportGroupCaloriesToToday } from "./ImportGroupCaloriesToToday";

// Posted into the group table chat / group table detail screen by the host.
// Every member sees the same card, but it never auto-writes into anyone's
// Today's Nutrition — each member must tap 加入我的今日攝取 themselves.
export function GroupCalorieSharingCard({
  share,
  currentUserId,
  restaurantName
}: {
  share: GroupCalorieShare;
  currentUserId: UserId;
  restaurantName?: string;
}) {
  const t = zhTW.mobile.calorieSharing;
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [hasImported, setHasImported] = useState(() => hasImportedGroupCalorieShare(share.groupTableId, currentUserId));

  const copyOptions = t.groupCardCopyOptions;
  const playfulCopy = copyOptions[(share.peopleCount - 1) % copyOptions.length];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="table4" size={18} color={colors.primaryDeep} />
        <Text style={styles.title}>{t.groupCardTitle}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t.groupCardTotalLabel}</Text>
          <Text style={styles.statValue}>{share.estimatedTotalCalories} kcal</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t.groupCardPeopleLabel}</Text>
          <Text style={styles.statValue}>{share.peopleCount} 人</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t.groupCardAverageLabel}</Text>
          <Text style={styles.statValue}>{share.averageCaloriesPerPerson} kcal</Text>
        </View>
      </View>

      <View style={styles.copyCard}>
        <Text style={styles.copyText}>{playfulCopy}</Text>
      </View>

      <Text style={styles.postedNote}>{t.groupCardPostedNote}</Text>

      {hasImported ? (
        <Text style={styles.alreadyDoneNote}>{t.importAlreadyDoneNote}</Text>
      ) : (
        <Pressable style={styles.importButton} onPress={() => setIsImportModalOpen(true)}>
          <Icon name="plate" size={16} color="#FFFFFF" />
          <Text style={styles.importButtonText}>{t.importToTodayCta}</Text>
        </Pressable>
      )}

      <ImportGroupCaloriesToToday
        visible={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        share={share}
        currentUserId={currentUserId}
        restaurantName={restaurantName}
        onImported={() => setHasImported(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 16,
    gap: 10,
    ...shadows.soft
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontFamily: fonts.bold,
    fontWeight: "800"
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
  postedNote: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingVertical: 13
  },
  importButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  alreadyDoneNote: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body,
    fontWeight: "700" as const,
    backgroundColor: colors.bg2,
    borderRadius: radius.sm,
    paddingVertical: 10,
    textAlign: "center",
    borderWidth: 1,
    borderColor: hexA(colors.primary, 0.12)
  }
});
