import { StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { isNutrientKnown, isRecordedNutrition, isRecordedWithoutEvidence, todayNutritionTruthCopy, type RecordedNutrientKey, type TodayNutritionSummary } from "../features/analysis/nutritionSummary";
import { Card, CompactRow, IconButton, MacroBar, Ring, SectionHeader } from "../theme/components";
import { Icon } from "../theme/icons";
import { fonts, radius, snowPalette as colors } from "../theme/tokens";

export function TodayNutritionSummaryCard({
  summary,
  onShare,
  onViewDetail
}: {
  summary: TodayNutritionSummary;
  onShare?: () => void;
  onViewDetail?: () => void;
}) {
  const t = zhTW.mobile.todayNutritionSummary;
  const copy = todayNutritionTruthCopy;
  const recorded = isRecordedNutrition(summary) ? summary.recorded : null;
  const caloriesKnown = isNutrientKnown(summary, "calories");
  // TI-DEF-1: with recorded data, a nutrient no item carries is shown as not provided (never 0) and a partly carried one as a subtotal.
  const coverageOf = (key: RecordedNutrientKey) => recorded?.coverage[key].status ?? "complete";
  const hasAmount = (key: RecordedNutrientKey) => summary.mealCount === 0 || (coverageOf(key) !== "missing" && coverageOf(key) !== "none");
  const macroLabel = (key: RecordedNutrientKey, label: string) => coverageOf(key) === "partial" ? `${label}${copy.subtotalSuffix}` : label;
  const macro = (key: RecordedNutrientKey, label: string, value: number, max: number, color: string) => hasAmount(key)
    ? <MacroBar label={macroLabel(key, label)} value={value} max={max} color={color} />
    : <View style={styles.macroUnknown}><Text style={styles.macroUnknownLabel}>{label}</Text><Text style={styles.macroUnknownValue}>{copy.notProvidedShort}</Text></View>;
  const vegetableUnknown = summary.mealCount > 0 && summary.vegetableAssessment === "unknown";
  // TI-DEF-2 (R1): the share action sends the four headline totals as plain numbers, so it is offered only when each of them is a real
  // value: complete coverage, a day with no meal, and never a recorded summary whose evidence is missing (completeness unknown).
  const shareable = summary.mealCount === 0 || (!isRecordedWithoutEvidence(summary) && (["calories", "protein", "carbs", "fat"] as const).every((key) => coverageOf(key) === "complete"));
  const incomplete = recorded !== null && summary.mealCount > 0 && Object.values(recorded.coverage).some((c) => c.status !== "complete");

  return (
    <Card>
      <SectionHeader title={t.cardTitle} subtitle={t.cardSubtitle} action={onShare && shareable ? <IconButton icon="share" onPress={onShare} /> : undefined} />
      <View style={styles.summaryRow}>
        <Ring value={hasAmount("calories") ? summary.totals.calories : 0} max={summary.targets.calories} size={108} strokeWidth={10}>
          <Text style={styles.ringValue}>{hasAmount("calories") ? summary.totals.calories : copy.notProvidedShort}</Text>
          <Text style={styles.ringUnit}>/ {summary.targets.calories} 大卡</Text>
        </Ring>
        <View style={styles.macroStack}>
          {macro("protein", t.proteinLabel, summary.totals.protein, summary.targets.protein, colors.primary)}
          {macro("carbs", t.carbsLabel, summary.totals.carbs, summary.targets.carbs, colors.accent)}
          {macro("fat", t.fatLabel, summary.totals.fat, summary.targets.fat, colors.amber)}
        </View>
      </View>
      {caloriesKnown || summary.mealCount === 0 ? (
        <Text style={styles.remainingText}>
          {t.remainingPrefix} <Text style={styles.remainingValue}>{summary.remainingCalories}</Text> {t.remainingUnit}
        </Text>
      ) : <Text style={styles.remainingText}>{copy.remainingUnknown}</Text>}
      {vegetableUnknown ? (
        <View style={styles.vegetableRow}>
          <Icon name="leaf" size={14} color={colors.sub} />
          <Text style={styles.vegetableText}>{copy.vegetableUnknown}</Text>
        </View>
      ) : (
        <View style={styles.vegetableRow}>
          <Icon name="leaf" size={14} color={summary.mealCount === 0 || summary.hasVegetable ? colors.green : colors.amber} />
          {/* GQA-6R C-2: with no recorded meal there is no evidence of a vegetable gap or of estimated macros. */}
          <Text style={styles.vegetableText}>{summary.mealCount === 0 ? "今天還沒有飲食紀錄。" : summary.hasVegetable ? t.vegetableGood : t.vegetableLow}</Text>
        </View>
      )}
      {summary.mealCount > 0 && summary.dataQuality === "estimated" ? <Text style={styles.estimatedNote}>{t.estimatedNote}</Text> : null}
      {incomplete ? <Text style={styles.estimatedNote}>{copy.partialNote}</Text> : null}
      {recorded?.readWarning && summary.mealCount > 0 ? <Text style={styles.estimatedNote}>{copy.readWarningNote}</Text> : null}
      {summary.reminders.length > 0 ? (
        <View style={styles.reminderList}>
          {summary.reminders.map((reminder) => (
            <View key={reminder.key} style={styles.reminderChip}>
              <Icon name="spark" size={12} color={colors.ai} />
              <Text style={styles.reminderText}>{reminder.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {onViewDetail ? (
        <View style={styles.detailLink}>
          <CompactRow icon="chart" iconTone="primary" title={t.viewDetailCta} onPress={onViewDetail} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 14
  },
  macroStack: {
    flex: 1,
    gap: 10
  },
  macroUnknown: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  macroUnknownLabel: {
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  macroUnknownValue: {
    color: colors.sub,
    fontSize: 12,
    fontFamily: fonts.body
  },
  ringValue: {
    color: colors.ink,
    fontSize: 22,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  ringUnit: {
    color: colors.sub,
    fontSize: 11,
    fontFamily: fonts.body,
    marginTop: -2
  },
  remainingText: {
    textAlign: "center",
    color: colors.sub,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.body,
    marginTop: 16
  },
  remainingValue: {
    color: colors.primaryDeep,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  vegetableRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8
  },
  vegetableText: {
    color: colors.sub,
    fontSize: 12.5,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  estimatedNote: {
    textAlign: "center",
    color: colors.sub,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginTop: 6
  },
  reminderList: {
    gap: 8,
    marginTop: 14
  },
  reminderChip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.aiSoft,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  reminderText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  detailLink: {
    marginTop: 14
  }
});
