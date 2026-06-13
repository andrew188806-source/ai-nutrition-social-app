import { StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import type { TodayNutritionSummary } from "../features/analysis/nutritionSummary";
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

  return (
    <Card>
      <SectionHeader title={t.cardTitle} subtitle={t.cardSubtitle} action={onShare ? <IconButton icon="share" onPress={onShare} /> : undefined} />
      <View style={styles.summaryRow}>
        <Ring value={summary.totals.calories} max={summary.targets.calories} size={108} strokeWidth={10}>
          <Text style={styles.ringValue}>{summary.totals.calories}</Text>
          <Text style={styles.ringUnit}>/ {summary.targets.calories} 大卡</Text>
        </Ring>
        <View style={styles.macroStack}>
          <MacroBar label={t.proteinLabel} value={summary.totals.protein} max={summary.targets.protein} color={colors.primary} />
          <MacroBar label={t.carbsLabel} value={summary.totals.carbs} max={summary.targets.carbs} color={colors.accent} />
          <MacroBar label={t.fatLabel} value={summary.totals.fat} max={summary.targets.fat} color={colors.amber} />
        </View>
      </View>
      <Text style={styles.remainingText}>
        {t.remainingPrefix} <Text style={styles.remainingValue}>{summary.remainingCalories}</Text> {t.remainingUnit}
      </Text>
      <View style={styles.vegetableRow}>
        <Icon name="leaf" size={14} color={summary.hasVegetable ? colors.green : colors.amber} />
        <Text style={styles.vegetableText}>{summary.hasVegetable ? t.vegetableGood : t.vegetableLow}</Text>
      </View>
      {summary.dataQuality === "estimated" ? <Text style={styles.estimatedNote}>{t.estimatedNote}</Text> : null}
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
