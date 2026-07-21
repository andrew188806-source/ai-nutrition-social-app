import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import {
  NextMealPrototypeContent,
  buildU1NextMealBuddyPrefill,
  createCanonicalNextMealPrototypeProvider,
  stageU1NextMealBuddyPrefill,
  type U1NextMealPrototypeScenario,
  type U1NextMealCandidateViewModel
} from "../features/next-meal-prototype";
import { createCanonicalNextMealPrototypeRuntimeDependencies } from "../features/next-meal-prototype/canonicalNextMealPrototypeComposition";
import { useDemoUserPlan } from "../features/demo-user-plan";
import {
  DailyNutritionPlanner,
  NextMealRecommendationWithPlan,
  PlannedDinnerInput,
  PlannedMealCard,
  getDefaultPlannedDinner,
  type PlannedMeal
} from "../features/planned-meal";
import { useConsumerRuntime, type ConsumerPlannedMealDraft } from "../features/consumer-runtime";

// Canonical provider: wires Phase 2Q service behind the U1 presentation layer.
// Fails closed on config error; never falls back to U1 mock on service failure.
const canonicalProvider = createCanonicalNextMealPrototypeProvider(
  createCanonicalNextMealPrototypeRuntimeDependencies()
);

export default function RecommendationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prototypeId?: string; previewState?: string }>();
  const [demoMode] = useDemoUserPlan();
  const runtime = useConsumerRuntime();
  const actorTimezone = runtime.state.profileState.status === "available" ? runtime.state.profileState.profile.timezone : runtime.mode === "mock" ? "Asia/Taipei" : "";
  const [planExpanded, setPlanExpanded] = useState(false);
  const [plannedDinner, setPlannedDinner] = useState<PlannedMeal | null>(null);
  const [draftPlan, setDraftPlan] = useState<PlannedMeal>(() => withDefaultDate(getDefaultPlannedDinner(), actorTimezone));
  const [rerunCount, setRerunCount] = useState(0);
  const scenario = parsePrototypeScenario(params.previewState);

  async function savePlan() {
    const result = await runtime.createPlannedMeal(toCanonicalDraft(draftPlan));
    if (result.status === "succeeded") {
      setPlannedDinner({ ...draftPlan, canonicalPlannedMealId: result.plannedMealId ?? undefined, canonicalStatus: "planned" });
      setPlanExpanded(false);
    }
  }

  function clearPlan() {
    setPlannedDinner(null);
    setDraftPlan(withDefaultDate(getDefaultPlannedDinner(), actorTimezone));
    setPlanExpanded(false);
  }

  function openMealBuddyPrefill(candidate: U1NextMealCandidateViewModel) {
    const token = stageU1NextMealBuddyPrefill(buildU1NextMealBuddyPrefill(candidate));
    if (!token) return;
    router.push({
      pathname: "/meal-buddies",
      params: {
        section: "cards",
        u1PrefillToken: token
      }
    });
  }

  return (
    <PlaceholderScreen title={zhTW.mobile.nextMealTitle} subtitle={zhTW.mobile.nextMealSubtitle}>
      <NextMealPrototypeContent
        entitlement={demoMode}
        onReturnHome={() => router.replace("/")}
        onUseForMealBuddy={openMealBuddyPrefill}
        preferredPrototypeId={typeof params.prototypeId === "string" ? params.prototypeId : undefined}
        provider={canonicalProvider}
        scenario={scenario}
      />

      <Card tone="sky">
        <SectionTitle title={zhTW.mobile.nextMealPrototype.plannedDinnerSectionTitle} subtitle={zhTW.mobile.nextMealPrototype.plannedDinnerSectionBody} />
      </Card>

      <PlannedDinnerInput
        expanded={planExpanded}
        onChange={setDraftPlan}
        onClear={clearPlan}
        onExpand={() => setPlanExpanded(true)}
        onSave={() => { void savePlan(); }}
        onRetry={() => { void runtime.retryPendingPlannedMeal(); }}
        operationMessage={plannedOperationMessage(runtime.plannedMealState.errorCode)}
        operationStatus={runtime.plannedMealState.status === "restoring" ? "idle" : runtime.plannedMealState.status}
        plan={draftPlan}
        saved={Boolean(plannedDinner) && runtime.plannedMealState.status === "succeeded"}
      />

      {plannedDinner ? <PlannedMealCard plan={plannedDinner} /> : null}

      <DailyNutritionPlanner plan={plannedDinner} />

      <NextMealRecommendationWithPlan plan={plannedDinner} onRerun={() => setRerunCount((count) => count + 1)} />

      {rerunCount > 0 ? (
        <Card tone="mint">
          <SectionTitle title={zhTW.mobile.plannedDinner.rerunLunchCta} subtitle={zhTW.mobile.plannedDinner.lunchAdvice[1]} />
        </Card>
      ) : null}
    </PlaceholderScreen>
  );
}

function withDefaultDate(plan: PlannedMeal, timezone: string): PlannedMeal {
  return { ...plan, plannedDate: dateKeyInTimezone(new Date(), timezone) };
}

function dateKeyInTimezone(value: Date, timezone: string) {
  if (!timezone) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const values = new Map(parts.map((part) => [part.type, part.value])); return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  } catch { return ""; }
}

function toCanonicalDraft(plan: PlannedMeal): ConsumerPlannedMealDraft {
  return {
    plannedFor: plan.plannedDate ?? "",
    plannedLocalTime: /^\d{2}:\d{2}$/.test(plan.mealTime) ? plan.mealTime : null,
    mealType: "dinner",
    mealCategory: plan.mealType.trim() || null,
    title: plan.plannedMealName.trim(),
    restaurantNameSnapshot: plan.restaurantName.trim() || null,
    note: plan.notes.trim() || null,
    restaurantId: null,
    branchId: null,
    menuItemId: null,
    nutritionSnapshot: {
      calories: parseNutrition(plan.calories),
      protein: parseNutrition(plan.protein),
      carbohydrates: parseNutrition(plan.carbs),
      fat: parseNutrition(plan.fat)
    }
  };
}

function parseNutrition(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function plannedOperationMessage(code: string | null) {
  if (code === "result_uncertain") return zhTW.mobile.plannedDinner.uncertainMessage;
  if (code === "conflict") return zhTW.mobile.plannedDinner.conflictMessage;
  if (code) return zhTW.mobile.plannedDinner.errorMessage;
  return null;
}

function parsePrototypeScenario(value: string | undefined): U1NextMealPrototypeScenario | undefined {
  if (value === "success" || value === "empty" || value === "error") return value;
  return undefined;
}
