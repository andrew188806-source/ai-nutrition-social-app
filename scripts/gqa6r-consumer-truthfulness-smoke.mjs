#!/usr/bin/env node
// GQA-6R C-2 smoke: a live Consumer identity never sees a fabricated personal claim, fixed demo kcal, a fake
// score or a fixture planned meal. Source assertions over the exact screens plus the real canonical provider
// for the "recommendation unavailable" state. Local only: no network, no project.
import fs from "node:fs";
import path from "node:path";
import { createTsLoader, withProcessEnv } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }); };
const code = (f) => fs.readFileSync(path.join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ---- C-2A Home: live mode with no supporting personalization data makes no personal claim
const home = code("apps/mobile/app/index.tsx");
const neutral = (home.match(/const HOME_NEUTRAL_STATUS = "([^"]+)"/) ?? [])[1] ?? "";
check("C2-1 Home no longer renders the static personal assessment (homeMoodBody)", !/homeMoodBody/.test(home) && /\{HOME_NEUTRAL_STATUS\}/.test(home));
check("C2-2 the Home hero line is neutral: no weekly verdict, no personal recommendation", neutral.length > 0 && !/你本週|不錯|適合|今天適合|高蛋白|平衡/.test(neutral), neutral);

// ---- C-2B Recommendation: fixed demo nutrition never beside real state
const rec = code("apps/mobile/app/recommendation.tsx");
check("C2-3 the fixed-kcal daily planner renders only outside a live composition",
  /\{liveComposition \? null : <DailyNutritionPlanner plan=\{plannedDinner\} \/>\}/.test(rec) && (rec.match(/<DailyNutritionPlanner/g) ?? []).length === 1);
check("C2-4 the canned lunch-advice block and its rerun card render only outside a live composition",
  /\{liveComposition \? null : <NextMealRecommendationWithPlan /.test(rec) && /\{!liveComposition && rerunCount > 0 \?/.test(rec));
check("C2-5 the live gate is the single literal public configuration", /const liveComposition = isLiveConsumerComposition\(readConsumerPublicRuntimeEnv\(\)\);/.test(rec));
check("C2-6 the fixed 620 kcal value exists only inside the demo-only component", !/620/.test(rec) && /value="620 kcal"/.test(code("apps/mobile/features/planned-meal/PlannedMealComponents.tsx")));

// ---- C-2C Today Intake: planned meal present -> canonical meal; absent -> truthful empty only
const today = code("apps/mobile/app/today-intake.tsx");
const emptyBranch = today.slice(today.indexOf(")) : ("), today.indexOf(")}", today.indexOf(")) : (")) + 2);
check("C2-7 canonical planned meals render from the canonical list", /\{plannedMeals\.length \? plannedMeals\.map\(\(plan\) =>/.test(today));
check("C2-8 no planned meal -> truthful empty state, never the fixture dinner title",
  /目前沒有預定餐/.test(emptyBranch) && !/daily\.plannedMeal/.test(emptyBranch) && !/canonical 預定餐/.test(emptyBranch), emptyBranch.slice(0, 300));
check("C2-9 Today Intake carries no fake numeric score", !/\b82\b/.test(today));

// ---- saved-meal summary in the analysis flow: live identity gets only the truth
const analysis = code("apps/mobile/app/analysis.tsx");
const live = analysis.slice(analysis.indexOf("function LiveSavedMealActions"), analysis.indexOf("function TodayIntakeSummary"));
check("C2-10 the live saved-meal card has no score, canned insight/advice or fixed stat values",
  live.length > 0 && !/\b82\b|insight|dinnerAdvice|balanceNote|Value\b|caloriesValue|plannedMeal|getTodayMealRecords|getPlannedDinner/.test(live));
check("C2-11 the legacy demo summary (fixed 82 / fixture dinner) is reachable only outside a live composition",
  /liveNextMealComposition \? \(\s*<LiveSavedMealActions/.test(analysis) && (analysis.match(/<TodayIntakeSummary /g) ?? []).length === 1);

// ---- recommendation unavailable: the real canonical provider fails closed with a truthful message
const { load } = createTsLoader({ stubs: {
  // Hermetic: hooks are only called at render time, so the smoke also runs in a node_modules-free clone.
  react: { createContext: () => ({}), useEffect: () => undefined, useState: (v) => [v, () => undefined], useMemo: (f) => f(), useCallback: (f) => f, useRef: (v) => ({ current: v }) },
  "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } },
  "react-native": { AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" }, Platform: { OS: "web" } },
  "@supabase/supabase-js": { createClient: () => ({ auth: {}, from: () => ({}) }) },
  "react-native-url-polyfill/auto": {}
} });
await withProcessEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true" }, async () => {
  const providerMod = load("apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts");
  const result = await providerMod.createCanonicalNextMealPrototypeProvider({}).getRecommendation({ entitlement: "free" });
  check("C2-12 recommendation unavailable -> truthful disabled/error state, no candidates, no demo kcal",
    (result.status === "disabled" || result.status === "error") && !("recommendation" in result) && !/620|kcal/.test(result.message), result);
  const carousel = load("apps/mobile/features/next-meal-prototype/liveNextMealCarousel.ts");
  const state = await carousel.loadLiveNextMealCarousel(providerMod.createCanonicalNextMealPrototypeProvider({}), "free");
  check("C2-13 the analysis carousel shows that same truthful state (not an empty strip or fixture cards)", state.status === result.status && !("cards" in state), state);
});

// ---- zero recorded meals: no vegetable verdict and no "estimated macros" note without evidence
const summaryCard = code("apps/mobile/components/TodayNutritionSummaryCard.tsx");
check("C2-14 with zero meals the summary card makes no vegetable claim (neither gap nor good)",
  /summary\.mealCount === 0 \? "今天還沒有飲食紀錄。" : summary\.hasVegetable \? t\.vegetableGood : t\.vegetableLow/.test(summaryCard));
check("C2-15 the partial-data note renders only when at least one meal was recorded",
  /summary\.mealCount > 0 && summary\.dataQuality === "estimated" \? <Text style=\{styles\.estimatedNote\}>/.test(summaryCard)
  && (summaryCard.match(/t\.estimatedNote/g) ?? []).length === 1);
const intakeModel = code("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts");
check("C2-16 zero-meal reminders stay empty (protein / vegetable reminders need a recorded meal)",
  /input\.mealCount > 0 && input\.proteinProgress < 0\.55/.test(intakeModel) && /input\.mealCount > 0 && !input\.hasVegetable/.test(intakeModel));

const detailReport = code("apps/mobile/components/NutritionDetailReport.tsx");
check("C2-16b the full nutrition report shows the partial-data note only when at least one meal was recorded",
  /summary\.mealCount > 0 && summary\.dataQuality === "estimated" \? <Text/.test(detailReport));
{
  // Hermetic: the store chain only needs these at call time, so the smoke also runs in a node_modules-free clone.
  const { load: loadDetail } = createTsLoader({ stubs: {
    react: { createContext: () => ({}), useEffect: () => undefined, useState: (v) => [v, () => undefined], useSyncExternalStore: () => undefined },
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" }, Platform: { OS: "web" } },
    "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }
  } });
  const summaryModule = loadDetail("apps/mobile/features/analysis/nutritionSummary.ts");
  const zero = { totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, targets: { calories: 1800, protein: 105, carbs: 180, fat: 55 }, hasVegetable: false, mealCount: 0, proteinProgress: 0, fatProgress: 0 };
  const items = Object.fromEntries(summaryModule.getNutritionDetailItems(zero).map((i) => [i.key, i.value]));
  const verdictKeys = ["fiber", "vegetables", "proteinFoods", "sodium", "addedSugar", "saturatedFat"];
  check("C2-16c zero meals -> every adequacy/normal verdict in the detail report reads 今日尚未記錄 (no 攝取不足 / 目前正常)",
    verdictKeys.every((k) => items[k] === "今日尚未記錄") && !Object.values(items).some((v) => v === "攝取不足" || v === "目前正常"), items);
  const one = Object.fromEntries(summaryModule.getNutritionDetailItems({ ...zero, mealCount: 1, totals: { ...zero.totals, calories: 500, protein: 20, carbs: 60 }, proteinProgress: 0.2 }).map((i) => [i.key, i.value]));
  check("C2-16d with a recorded meal the report keeps its existing evidence-based verdicts", one.proteinFoods === "攝取不足" && one.sodium === "目前正常", one);
}

// ---- restaurant list: no static social proof or sponsored placement for a live identity
const restaurants = code("apps/mobile/app/restaurants.tsx");
check("C2-17 /restaurants derives its live gate from the single literal public configuration",
  /const LIVE_COMPOSITION = isLiveConsumerComposition\(readConsumerPublicRuntimeEnv\(\)\);/.test(restaurants));
check("C2-18 the fabricated social-hint reason is added only outside a live composition",
  /if \(!LIVE_COMPOSITION\) reasons\.push\(getSocialHint\(restaurant\)\);/.test(restaurants)
  && (restaurants.match(/reasons\.push\(getSocialHint/g) ?? []).length === 1);
check("C2-19 the sponsored and static 'similar eaters' cards render only outside a live composition",
  /\{LIVE_COMPOSITION \? null : \(/.test(restaurants));

// ---- live next-meal candidates are real restaurant data: never labelled as samples / demo
const nextMeal = code("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");
const liveCopyBlock = nextMeal.slice(nextMeal.indexOf("export const LIVE_NEXT_MEAL_COPY"), nextMeal.indexOf("} as const;", nextMeal.indexOf("export const LIVE_NEXT_MEAL_COPY")));
check("C2-20 the live next-meal copy contains no sample/demo/mock wording",
  liveCopyBlock.length > 0 && !/範例|示範|Demo|mock|僅供畫面流程確認/i.test(liveCopyBlock));
check("C2-21 badge, source note, candidate count and best label switch on the recommendation's own provenance (isSampleData)",
  /const liveData = !model\.recommendation\.isSampleData;/.test(nextMeal)
  && /\{liveData \? LIVE_NEXT_MEAL_COPY\.badge : /.test(nextMeal) && /\{liveData \? LIVE_NEXT_MEAL_COPY\.sourceNote : baseCopy\.presentationOnly\}/.test(nextMeal)
  && /liveData \? LIVE_NEXT_MEAL_COPY\.bestBadge : baseCopy\.bestBadge/.test(nextMeal) && /const candidateCountLabel = liveData\s*\? LIVE_NEXT_MEAL_COPY\.candidateCount/.test(nextMeal));
check("C2-22 loading / disabled / empty / error states use the live copy in a live composition (no local-mock description)",
  /const LIVE_COMPOSITION = isLiveConsumerComposition\(readConsumerPublicRuntimeEnv\(\)\);/.test(nextMeal)
  && /const copy: Record<keyof typeof baseCopy, string> = LIVE_COMPOSITION \? \{ \.\.\.baseCopy, \.\.\.LIVE_NEXT_MEAL_COPY \} : baseCopy;/.test(nextMeal));
const recBlock = rec.slice(rec.indexOf("const LIVE_RECOMMENDATION_COPY"), rec.indexOf("} as const;", rec.indexOf("const LIVE_RECOMMENDATION_COPY")));
check("C2-23 /recommendation's live subtitle and planned-dinner label make no sample/demo claim (the planner saves real planned meals)",
  recBlock.length > 0 && !/範例|示範|Demo|展示/.test(recBlock)
  && /subtitle=\{liveComposition \? LIVE_RECOMMENDATION_COPY\.subtitle : zhTW\.mobile\.nextMealSubtitle\}/.test(rec)
  && /\{liveComposition\s*\? <SectionTitle title=\{LIVE_RECOMMENDATION_COPY\.plannedDinnerTitle\}/.test(rec));

// ---- photo entry: a live composition analyses the real photo; no "fixed fake result" copy, no static mood chips
const photo = code("apps/mobile/app/meal-photo.tsx");
check("C2-24 /meal-photo's live source sheet never claims the demo returns one fixed fake result",
  /const LIVE_COMPOSITION = isLiveConsumerComposition\(readConsumerPublicRuntimeEnv\(\)\);/.test(photo)
  && /subtitle=\{LIVE_COMPOSITION \? LIVE_SOURCE_SHEET_BODY : zhTW\.mobile\.refinedLogic\.aiEntry\.sheetBody\}/.test(photo)
  && !/假資料|Demo|範例/.test((photo.match(/const LIVE_SOURCE_SHEET_BODY = "([^"]*)"/) ?? [, "Demo"])[1]));
check("C2-25 the static mood chips (e.g. 附近有人想約飯) render only outside a live composition",
  /\{LIVE_COMPOSITION \? null : \(\s*<View style=\{styles\.tagSpace\}>\s*<TagRow tags=\{zhTW\.mobile\.refinedLogic\.lifestyleWorld\.nutritionMoodTags\} \/>/.test(photo)
  && (photo.match(/nutritionMoodTags/g) ?? []).length === 1);

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 300)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-consumer-truthfulness-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
