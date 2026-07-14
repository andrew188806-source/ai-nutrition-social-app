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
  clearPlannedDinner,
  getDefaultPlannedDinner,
  getPlannedDinner,
  savePlannedDinner,
  type PlannedMeal
} from "../features/planned-meal";

// Canonical provider: wires Phase 2Q service behind the U1 presentation layer.
// Fails closed on config error; never falls back to U1 mock on service failure.
const canonicalProvider = createCanonicalNextMealPrototypeProvider(
  createCanonicalNextMealPrototypeRuntimeDependencies()
);

export default function RecommendationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prototypeId?: string; previewState?: string }>();
  const [demoMode] = useDemoUserPlan();
  const [planExpanded, setPlanExpanded] = useState(false);
  const [plannedDinner, setPlannedDinner] = useState<PlannedMeal | null>(() => getPlannedDinner());
  const [draftPlan, setDraftPlan] = useState<PlannedMeal>(() => getPlannedDinner() ?? getDefaultPlannedDinner());
  const [rerunCount, setRerunCount] = useState(0);
  const scenario = parsePrototypeScenario(params.previewState);

  function savePlan() {
    savePlannedDinner(draftPlan);
    setPlannedDinner(draftPlan);
    setPlanExpanded(false);
  }

  function clearPlan() {
    clearPlannedDinner();
    setPlannedDinner(null);
    setDraftPlan(getDefaultPlannedDinner());
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

      <PlannedDinnerInput expanded={planExpanded} onChange={setDraftPlan} onClear={clearPlan} onExpand={() => setPlanExpanded(true)} onSave={savePlan} plan={draftPlan} saved={Boolean(plannedDinner)} />

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

function parsePrototypeScenario(value: string | undefined): U1NextMealPrototypeScenario | undefined {
  if (value === "success" || value === "empty" || value === "error") return value;
  return undefined;
}
