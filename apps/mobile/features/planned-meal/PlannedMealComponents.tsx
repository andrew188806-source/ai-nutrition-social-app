import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, MetricCard, SectionTitle, TagRow, colors } from "../../components/DemoUi";
import type { PlannedMeal } from "./types";

export function PlannedDinnerInput({
  expanded,
  onChange,
  onClear,
  onExpand,
  onSave,
  plan,
  saved,
  operationStatus = "idle",
  operationMessage,
  onRetry
}: {
  expanded: boolean;
  onChange: (plan: PlannedMeal) => void;
  onClear: () => void;
  onExpand: () => void;
  onSave: () => void;
  plan: PlannedMeal;
  saved: boolean;
  operationStatus?: "idle" | "submitting" | "uncertain" | "succeeded" | "error";
  operationMessage?: string | null;
  onRetry?: () => void;
}) {
  return (
    <Card tone="amber">
      <SectionTitle title={zhTW.mobile.plannedDinner.title} subtitle={zhTW.mobile.plannedDinner.subtitle} />
      <Text style={styles.hint}>{zhTW.mobile.plannedDinner.uncertainHint}</Text>
      <Text style={styles.hint}>{zhTW.mobile.plannedDinner.dataBoundaryHint}</Text>
      {!expanded ? (
        <Pressable style={styles.primaryButton} onPress={onExpand}>
          <Text style={styles.primaryButtonText}>{saved ? zhTW.mobile.plannedDinner.editCta : zhTW.mobile.plannedDinner.entryCta}</Text>
        </Pressable>
      ) : (
        <View style={styles.form}>
          <SectionTitle title={zhTW.mobile.plannedDinner.simpleMode} />
          <View style={styles.optionRow}>
            {zhTW.mobile.plannedDinner.dinnerTypeOptions.map((option) => (
              <Pressable key={option} style={[styles.option, plan.mealType === option && styles.optionActive]} onPress={() => onChange({ ...plan, mealType: option, plannedMealName: option })}>
                <Text style={[styles.optionText, plan.mealType === option && styles.optionTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <SectionTitle title={zhTW.mobile.plannedDinner.detailedMode} />
          <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.plannedDate} value={plan.plannedDate ?? ""} onChangeText={(plannedDate) => onChange({ ...plan, plannedDate })} />
          <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.mealName} value={plan.plannedMealName} onChangeText={(plannedMealName) => onChange({ ...plan, plannedMealName })} />
          <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.restaurantName} value={plan.restaurantName} onChangeText={(restaurantName) => onChange({ ...plan, restaurantName })} />
          <View style={styles.grid}>
            <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.calories} value={plan.calories} onChangeText={(calories) => onChange({ ...plan, calories })} compact />
            <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.protein} value={plan.protein} onChangeText={(protein) => onChange({ ...plan, protein })} compact />
            <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.carbs} value={plan.carbs} onChangeText={(carbs) => onChange({ ...plan, carbs })} compact />
            <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.fat} value={plan.fat} onChangeText={(fat) => onChange({ ...plan, fat })} compact />
          </View>
          <PlannedMealField label={zhTW.mobile.plannedDinner.fieldLabels.notes} value={plan.notes} onChangeText={(notes) => onChange({ ...plan, notes })} />
          <Pressable disabled={operationStatus === "submitting"} style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>{zhTW.mobile.plannedDinner.saveCta}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onClear}>
            <Text style={styles.secondaryButtonText}>{zhTW.mobile.plannedDinner.clearCta}</Text>
          </Pressable>
        </View>
      )}
      {saved ? <Text style={styles.savedText}>{zhTW.mobile.plannedDinner.savedMessage}</Text> : null}
      {operationMessage ? <Text style={operationStatus === "error" ? styles.errorText : styles.hint}>{operationMessage}</Text> : null}
      {operationStatus === "uncertain" && onRetry ? (
        <Pressable style={styles.secondaryButton} onPress={onRetry}>
          <Text style={styles.secondaryButtonText}>{zhTW.mobile.plannedDinner.retryCta}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function PlannedMealCard({ plan }: { plan: PlannedMeal }) {
  return (
    <Card tone="mint">
      <SectionTitle title={plan.isSocialMeal ? zhTW.mobile.plannedDinner.socialDinnerLabel : zhTW.mobile.plannedDinner.plannedDinnerLabel} subtitle={plan.notes} />
      <Text style={styles.planTitle}>{plan.plannedMealName}</Text>
      <Text style={styles.meta}>{plan.restaurantName}</Text>
      <View style={styles.metricGrid}>
        <MetricCard label={zhTW.mobile.plannedDinner.fieldLabels.calories} value={plan.calories} note={plan.mealType} />
        <MetricCard label={zhTW.mobile.plannedDinner.fieldLabels.protein} value={plan.protein} note={zhTW.mobile.plannedDinner.fieldLabels.protein} />
        <MetricCard label={zhTW.mobile.plannedDinner.fieldLabels.carbs} value={plan.carbs} note={zhTW.mobile.plannedDinner.fieldLabels.carbs} />
        <MetricCard label={zhTW.mobile.plannedDinner.fieldLabels.fat} value={plan.fat} note={zhTW.mobile.plannedDinner.fieldLabels.fat} />
      </View>
      {plan.isSocialMeal ? <Text style={styles.savedText}>{zhTW.mobile.plannedDinner.connectedSocialBody}</Text> : null}
    </Card>
  );
}

export function DailyNutritionPlanner({ plan }: { plan: PlannedMeal | null }) {
  return (
    <Card>
      <SectionTitle title={zhTW.mobile.plannedDinner.dailyPlannerTitle} />
      <View style={styles.plannerGrid}>
        <MetricCard label={zhTW.mobile.plannedDinner.eatenLabel} value="620 kcal" note={zhTW.mobile.nutritionMemory.nutritionAnalysis} />
        <MetricCard label={zhTW.mobile.plannedDinner.dinnerPlanLabel} value={plan?.calories ?? "-"} note={plan?.plannedMealName ?? zhTW.mobile.plannedDinner.addCta} />
        <MetricCard label={zhTW.mobile.plannedDinner.remainingLabel} value={plan ? zhTW.mobile.plannedDinner.remainingValue : zhTW.mobile.plannedDinner.noPlanValue} note={zhTW.mobile.plannedDinner.lunchRecommendationLabel} />
      </View>
    </Card>
  );
}

export function NextMealRecommendationWithPlan({ plan, onRerun }: { plan: PlannedMeal | null; onRerun: () => void }) {
  return (
    <Card tone="sky">
      <SectionTitle title={zhTW.mobile.plannedDinner.recommendationTitle} subtitle={plan ? zhTW.mobile.plannedDinner.lunchAdvice[0] : zhTW.mobile.plannedDinner.uncertainHint} />
      {plan ? (
        <>
          <View style={styles.adviceList}>
            {zhTW.mobile.plannedDinner.lunchAdvice.map((advice) => (
              <Text key={advice} style={styles.adviceItem}>{advice}</Text>
            ))}
          </View>
          <TagRow tags={zhTW.mobile.plannedDinner.lunchOptions} />
          <Pressable style={styles.primaryButton} onPress={onRerun}>
            <Text style={styles.primaryButtonText}>{zhTW.mobile.plannedDinner.rerunLunchCta}</Text>
          </Pressable>
        </>
      ) : null}
    </Card>
  );
}

function PlannedMealField({ compact = false, label, onChangeText, value }: { compact?: boolean; label: string; onChangeText: (value: string) => void; value: string }) {
  return (
    <View style={[styles.inputGroup, compact && styles.compactInputGroup]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 10
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  form: {
    gap: 12,
    marginTop: 14
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  option: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  optionActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  optionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  optionTextActive: {
    color: colors.ink
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  inputGroup: {
    gap: 6
  },
  compactInputGroup: {
    flexGrow: 1,
    flexBasis: 130
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  input: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  savedText: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  errorText: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  planTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  plannerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  adviceList: {
    gap: 8,
    marginVertical: 14
  },
  adviceItem: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  }
});
