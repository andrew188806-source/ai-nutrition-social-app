import { StyleSheet, Text, View } from "react-native";
import type { MealSlotSummary } from "../features/analysis/nutritionSummary";
import { Icon } from "../theme/icons";
import { fonts, radius, shadows, snowPalette as colors } from "../theme/tokens";

export function TodayMealGrid({ slots }: { slots: MealSlotSummary[] }) {
  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const { record, planned, isPending } = slot;

        return (
          <View key={slot.key} style={[styles.mealTile, isPending && styles.mealTilePending]}>
            <View style={styles.mealTileHeader}>
              <View style={[styles.mealTileIcon, isPending && styles.mealTileIconPending]}>
                <Icon name={record ? "leaf" : planned ? "clock" : "camera"} size={14} color={record ? colors.primaryDeep : colors.faint} />
              </View>
              <Text style={styles.mealTileLabel}>{slot.label}</Text>
              {record ? (
                <Text style={styles.mealTileCalories}>{record.calories} kcal</Text>
              ) : planned ? (
                <Text style={styles.mealTileBadge}>預定</Text>
              ) : null}
            </View>
            <Text style={styles.mealTileItems} numberOfLines={1}>
              {slot.itemsText}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between"
  },
  mealTile: {
    width: "47%",
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 14,
    gap: 8,
    ...shadows.soft
  },
  mealTilePending: {
    backgroundColor: colors.bg2,
    borderColor: colors.faint,
    borderStyle: "dashed"
  },
  mealTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  mealTileIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  },
  mealTileIconPending: {
    backgroundColor: colors.bg2,
    borderWidth: 1,
    borderColor: colors.faint,
    borderStyle: "dashed"
  },
  mealTileLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  mealTileBadge: {
    color: colors.sub,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  mealTileCalories: {
    color: colors.primaryDeep,
    fontSize: 12.5,
    fontFamily: fonts.numeralMedium,
    fontWeight: "700"
  },
  mealTileItems: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.body
  }
});
