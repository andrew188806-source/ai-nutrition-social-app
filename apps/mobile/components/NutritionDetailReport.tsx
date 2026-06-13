import { StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { getHydrationTip, getNutritionDetailItems, type TodayNutritionSummary } from "../features/analysis/nutritionSummary";
import { Card, SectionHeader } from "../theme/components";
import { fonts, hexA, radius, snowPalette as colors } from "../theme/tokens";

export function NutritionDetailReport({ summary }: { summary: TodayNutritionSummary }) {
  const t = zhTW.mobile.todayNutritionSummary.detail;
  const items = getNutritionDetailItems(summary);
  const suggestions = [...summary.reminders.map((reminder) => reminder.label), getHydrationTip()];

  return (
    <Card>
      <SectionHeader title={t.reportTitle} subtitle={t.reportSubtitle} />
      {summary.dataQuality === "estimated" ? <Text style={styles.estimatedNote}>{zhTW.mobile.todayNutritionSummary.estimatedNote}</Text> : null}
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.key} style={[styles.itemCard, item.status !== "good" && styles.itemCardWatch]}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <Text style={styles.itemValue}>{item.value}</Text>
            <Text style={styles.itemNote}>{item.note}</Text>
          </View>
        ))}
      </View>
      <View style={styles.suggestionList}>
        <Text style={styles.suggestionTitle}>{t.suggestionsTitle}</Text>
        {suggestions.map((suggestion) => (
          <Text key={suggestion} style={styles.suggestionItem}>
            • {suggestion}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  estimatedNote: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.body,
    marginTop: 8
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  itemCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 12,
    gap: 4
  },
  itemCardWatch: {
    borderColor: hexA(colors.amber, 0.35),
    backgroundColor: colors.bg2
  },
  itemLabel: {
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  itemValue: {
    color: colors.ink,
    fontSize: 16,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  itemNote: {
    color: colors.sub,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.body
  },
  suggestionList: {
    marginTop: 16,
    gap: 6
  },
  suggestionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800",
    marginBottom: 2
  },
  suggestionItem: {
    color: colors.sub,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: fonts.body
  }
});
