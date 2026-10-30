import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, SectionHeader } from "../../theme/components";
import { fonts, snowPalette as colors } from "../../theme/tokens";
import { monthlyReviewCopy as copy } from "./copy";
import type { MonthlyNutritionReviewResult, MonthlyReviewRuntime } from "./types";
import { toMonthlyReviewView } from "./viewModel";

type Props = { runtime: Exclude<MonthlyReviewRuntime, { mode: "disabled" }>; reloadKey: string };

/** Live (or misconfigured) monthly review. It never renders demo values; a failure is shown as unavailable. */
export function MonthlyNutritionReviewCard({ runtime, reloadKey }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; result: MonthlyNutritionReviewResult | null }>({ key: "", result: null });
  const key = `${reloadKey}:${attempt}`;
  useEffect(() => {
    if (runtime.mode !== "live") return;
    let cancelled = false;
    setState({ key, result: null });
    runtime.service.getCurrentUserMonthlyReview()
      .then((result) => { if (!cancelled) setState({ key, result }); })
      .catch(() => { if (!cancelled) setState({ key, result: { status: "unavailable", reason: "transport" } }); });
    return () => { cancelled = true; };
  }, [runtime, key]);
  const result: MonthlyNutritionReviewResult | null = runtime.mode === "misconfigured"
    ? { status: "unavailable", reason: "configuration" }
    : state.key === key ? state.result : null;
  const view = toMonthlyReviewView(result);
  return (
    <Card tone="blush">
      <SectionHeader title={copy.title} subtitle={copy.subtitle} />
      {view.kind === "message" ? (
        <View style={styles.stack}>
          <Text style={styles.line}>{view.message}</Text>
          {view.retry && runtime.mode === "live" ? (
            <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}><Text style={styles.action}>{copy.retry}</Text></Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.stack}>
          {view.months.map((month) => (
            <View key={month.monthKey} style={styles.month}>
              <Text style={styles.monthTitle}>{month.monthKey}{month.badge ? ` · ${month.badge}` : ""}</Text>
              {month.lines.map((line) => <Text key={line} style={styles.line}>{line}</Text>)}
              {month.disclosures.map((line) => <Text key={line} style={styles.disclosure}>{line}</Text>)}
            </View>
          ))}
          {view.notes.map((note) => <Text key={note} style={styles.note}>{note}</Text>)}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10, marginTop: 12 },
  month: { gap: 3 },
  monthTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14, fontWeight: "800" },
  line: { color: colors.sub, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
  disclosure: { color: colors.primaryDeep, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  note: { color: colors.sub, fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16 },
  action: { color: colors.primaryDeep, fontFamily: fonts.bold, fontSize: 13, fontWeight: "800" }
});
