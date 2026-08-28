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
import { ConsumerLocationPermissionCard } from "../features/consumer-location/ConsumerLocationPermissionCard";
import { useConsumerLocation } from "../features/consumer-location";
import { getConsumerMealRuntimeFlags } from "../features/consumer-meals/featureFlags";

// Canonical provider: wires Phase 2Q service behind the U1 presentation layer.
// Fails closed on config error; never falls back to U1 mock on service failure.
const canonicalProvider = createCanonicalNextMealPrototypeProvider(
  createCanonicalNextMealPrototypeRuntimeDependencies()
);

export default function RecommendationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ preferredMenuItemId?: string; previewState?: string }>();
  const [demoMode] = useDemoUserPlan();
  const runtime = useConsumerRuntime();
  const geoRuntimeEnabled = getConsumerMealRuntimeFlags().nextMealRecommendationSource === "supabase";
  const location = useConsumerLocation(
    geoRuntimeEnabled ? runtime.state.actorKey : null,
    runtime.state.actorGeneration
  );
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

  async function addRecommendationToTodayIntake(candidate: U1NextMealCandidateViewModel) {
    if (!candidate.restaurantId || !candidate.menuItemId) return "failed" as const;
    const result = await runtime.createMealRecord({
      selectedMealPeriod: currentMealPeriod(actorTimezone),
      mealName: candidate.mealName,
      originalDetectedName: candidate.mealName,
      portion: "1 份",
      nutrition: { ...candidate.nutrition },
      isSelfCooked: false,
      wasUserCorrected: false,
      trustedCanonicalIdentity: {
        restaurantId: candidate.restaurantId,
        branchId: candidate.branchId ?? null,
        menuItemId: candidate.menuItemId
      },
      trustedNutritionSource: candidate.nutritionSource ?? "ai_estimated",
      trustedMealSource: "restaurant"
    });
    if (result.status === "succeeded") return "succeeded" as const;
    if (result.status === "uncertain") return "uncertain" as const;
    return "failed" as const;
  }

  return (
    <PlaceholderScreen title={zhTW.mobile.nextMealTitle} subtitle={zhTW.mobile.nextMealSubtitle}>
      {geoRuntimeEnabled ? <ConsumerLocationPermissionCard controller={location} /> : null}
      <NextMealPrototypeContent
        entitlement={demoMode}
        onAddToTodayIntake={addRecommendationToTodayIntake}
        onReturnHome={() => router.replace("/")}
        onUseForMealBuddy={openMealBuddyPrefill}
        preferredMenuItemId={typeof params.preferredMenuItemId === "string" ? params.preferredMenuItemId : undefined}
        provider={canonicalProvider}
        scenario={scenario}
        currentLocation={location.state.phase === "available" ? location.state.position : undefined}
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

function currentMealPeriod(timezone: string): "breakfast" | "lunch" | "dinner" | "snack" {
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Asia/Taipei", hour: "2-digit", hourCycle: "h23"
    }).format(new Date()));
    if (hour < 10) return "breakfast";
    if (hour < 15) return "lunch";
    if (hour < 21) return "dinner";
    return "snack";
  } catch {
    return "lunch";
  }
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
