import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card } from "../../components/DemoUi";
import { snowPalette as colors } from "../../theme/tokens";
import { useConsumerRuntime } from "./ConsumerRuntimeProvider";
import { presentMealSaveOperation, type MealSaveAction, type MealSaveOperationKind, type MealSaveOperationSummary } from "./mealSaveRecovery";

// TastKind meal-save recovery notice. Shows the unresolved meal saves of the CURRENT account (both
// write paths) with only the actions that can actually run:
//   重新確認 / 再試一次 — manual retry of the same operation (same key, same payload)
//   暫不處理            — set it aside; nothing is cancelled and the operation is kept
//   取消這筆            — only for drafts that never had an unknown result
//   重新登入 / 前往完成設定 — the existing login / onboarding flows
// The component never sends anything by itself: every action starts from a user press.
const mealTypeLabels: Record<string, string> = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐", snack: "點心" };

export function PendingMealSaveNotice({
  kinds,
  skip
}: {
  kinds?: readonly MealSaveOperationKind[];
  skip?: (operation: MealSaveOperationSummary) => boolean;
}) {
  const runtime = useConsumerRuntime();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const copy = zhTW.mobile.pendingMealSave;
  // Capacity: a new save of this kind was refused because every slot is occupied (nothing is evicted). The
  // notice then lists ALL operations of that kind, expanded, with only the actions that can free a slot.
  const capacityKinds = (["meal_write", "finalization"] as const).filter((kind) =>
    (!kinds || kinds.includes(kind)) &&
    (kind === "meal_write" ? runtime.mealWriteState?.errorCode : runtime.mealIdentificationFinalizationState?.errorCode) === "capacity_exhausted");
  const capacity = capacityKinds.length > 0;
  const operations = runtime.mealSaveOperations.filter((operation) =>
    (!kinds || kinds.includes(operation.kind)) &&
    ((capacityKinds as readonly MealSaveOperationKind[]).includes(operation.kind) || !(skip?.(operation) ?? false)));
  const attention = operations.filter((operation) => capacity || !operation.deferred);
  const deferred = capacity ? [] : operations.filter((operation) => operation.deferred);
  if (!operations.length && !capacity) return null;

  async function act(operation: MealSaveOperationSummary, action: MealSaveAction) {
    if (action === "login") {
      await runtime.signOut();
      router.replace("/login" as never);
      return;
    }
    if (action === "consent") {
      router.push("/onboarding" as never);
      return;
    }
    setBusy(operation.opId);
    try {
      if (action === "retry") await runtime.retryMealSaveOperation(operation.kind, operation.opId);
      else if (action === "defer") await runtime.deferMealSaveOperation(operation.kind, operation.opId);
      else if (action === "cancel") await runtime.cancelMealSaveOperation(operation.kind, operation.opId);
    } finally {
      setBusy(null);
    }
  }

  function renderOperation(operation: MealSaveOperationSummary) {
    const shown = presentMealSaveOperation(operation, copy);
    // Setting an operation aside frees no slot, so it is not offered as a capacity exit.
    const presented = capacity ? { ...shown, actions: shown.actions.filter((action) => action.id !== "defer") } : shown;
    const label = [operation.label, operation.mealType ? mealTypeLabels[operation.mealType] ?? operation.mealType : null].filter(Boolean).join("｜");
    return (
      <View key={operation.opId} style={styles.item} accessibilityRole="alert">
        <Text style={styles.title}>{presented.title}</Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {presented.body ? <Text style={styles.body}>{presented.body}</Text> : null}
        {presented.notes.map((note) => (
          <Text key={note} style={styles.note}>{note}</Text>
        ))}
        <Text style={styles.reference}>{presented.referenceLine}</Text>
        {presented.actions.length ? (
          <View style={styles.row}>
            {presented.actions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                disabled={busy === operation.opId}
                style={[action.id === "retry" ? styles.primary : styles.secondary, busy === operation.opId && styles.disabled]}
                onPress={() => {
                  void act(operation, action.id);
                }}
              >
                <Text style={action.id === "retry" ? styles.primaryText : styles.secondaryText}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Card tone="amber">
      {capacity ? (
        <View style={styles.item} accessibilityRole="alert">
          <Text style={styles.title}>{copy.capacity.title}</Text>
          <Text style={styles.body}>{copy.capacity.body}</Text>
        </View>
      ) : null}
      {attention.map(renderOperation)}
      {deferred.length ? (
        <View style={styles.item}>
          <Text style={styles.title}>{copy.summaryTitle.replace("{count}", String(deferred.length))}</Text>
          <Text style={styles.body}>{copy.summaryBody}</Text>
          {!expanded ? (
            <View style={styles.row}>
              <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setExpanded(true)}>
                <Text style={styles.secondaryText}>{copy.actions.view}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      {expanded ? deferred.map(renderOperation) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: 6, paddingVertical: 6 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  label: { color: colors.sub, fontSize: 12, fontWeight: "700" },
  body: { color: colors.sub, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  note: { color: colors.sub, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  reference: { color: colors.sub, fontSize: 11, fontWeight: "600" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  primary: { alignItems: "center", borderRadius: 999, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 9 },
  primaryText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  secondary: { alignItems: "center", borderColor: colors.line, borderRadius: 999, borderWidth: 1, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 9 },
  secondaryText: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 }
});
