import { StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Icon } from "../../theme/icons";
import { fonts, radius, snowPalette as colors } from "../../theme/tokens";

// Shown after a post-meal rating is submitted (and as a recap for records that
// already have an actualCalories correction). Today's Nutrition / Food Diary
// already use actualCalories once it is saved — this just surfaces the number.
export function ActualCalorieShare({
  estimatedCalories,
  actualCalories,
  completionPercentage
}: {
  estimatedCalories: number;
  actualCalories: number;
  completionPercentage?: number;
}) {
  const t = zhTW.mobile.calorieSharing;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="check" size={16} color={colors.green} />
        <Text style={styles.title}>{t.actualCalorieResultTitle}</Text>
      </View>
      <Text style={styles.body}>{t.actualCalorieResultBody}</Text>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t.actualCalorieEstimatedLabel}</Text>
          <Text style={styles.statValue}>{Math.round(estimatedCalories)} kcal</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>{t.actualCalorieActualLabel}</Text>
          <Text style={[styles.statValue, styles.statValueAccent]}>{Math.round(actualCalories)} kcal</Text>
        </View>
        {completionPercentage != null ? (
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>完成度</Text>
            <Text style={styles.statValue}>{completionPercentage}%</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.note}>{t.actualCalorieSavedNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
    padding: 14,
    gap: 8
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  title: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  body: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.body
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
    backgroundColor: colors.card,
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
  statValueAccent: {
    color: colors.primaryDeep
  },
  note: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body
  }
});
