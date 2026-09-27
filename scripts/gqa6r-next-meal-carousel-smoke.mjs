#!/usr/bin/env node
// GQA-6R C-4 smoke: completed analysis -> "下一餐" -> canonical candidates -> selectable cards -> context
// handoff to /recommendation. Executes the REAL modules (transpile-only) with stub providers; the live
// composition check stubs only the native Supabase SDK. Local only: no network, no project.
import fs from "node:fs";
import path from "node:path";
import { createTsLoader, withProcessEnv } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }); };
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

let createClientCalls = 0;
const { load } = createTsLoader({ stubs: {
  react: { useEffect() {}, useState: (v) => [v, () => undefined], useCallback: (f) => f, useMemo: (f) => f() },
  "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } },
  "react-native": { AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" }, Platform: { OS: "web" } },
  "@supabase/supabase-js": { createClient: () => { createClientCalls += 1; return { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({}), functions: {} }; } },
  "react-native-url-polyfill/auto": {}
} });

const carousel = load("apps/mobile/features/next-meal-prototype/liveNextMealCarousel.ts");
const candidate = (over) => ({
  prototypeId: over.prototypeId, menuItemId: over.menuItemId, restaurantId: over.restaurantId, branchId: over.branchId ?? null,
  source: "canonical_mock", isSampleData: false, ordinal: 1, isBestRecommendation: false, mealName: over.mealName ?? "dish",
  restaurantName: over.restaurantName ?? "R", areaLabel: over.areaLabel, nutrition: { calories: "calories" in over ? over.calories : 520, protein: 40, carbohydrates: 40, fat: 10 },
  tags: [], reasonSummary: "r", reasonCode: "nutrition_gap", reasonDetails: []
});
const success = (candidates) => ({ status: "success", recommendation: { source: "canonical_mock", isSampleData: false, headline: "這是你的下一餐", entitlement: "free", visibleCandidateCount: candidates.length, candidates } });
const provider = (result) => ({ calls: 0, async getRecommendation(req) { this.calls += 1; this.last = req; if (result instanceof Error) throw result; return result; } });

// ---- carousel: non-empty live result -> selectable canonical cards
{
  const p = provider(success([
    candidate({ prototypeId: "p1", menuItemId: "dev-item-chicken", restaurantId: "dev-restaurant-haochu", branchId: "dev-branch-nanjing", mealName: "舒肥雞胸藜麥碗", calories: 520 }),
    candidate({ prototypeId: "p2", menuItemId: undefined, restaurantId: "dev-restaurant-haochu", mealName: "no identity" }),
    candidate({ prototypeId: "p3", menuItemId: "dev-item-tofu", restaurantId: "dev-restaurant-haochu", mealName: "豆腐彩蔬能量碗", calories: undefined })
  ]));
  const state = await carousel.loadLiveNextMealCarousel(p, "free");
  check("C4-1 a non-empty canonical result renders cards", state.status === "success" && state.cards.length === 2, state);
  check("C4-2 only candidates with a canonical restaurant + menu item identity become (selectable) cards",
    state.status === "success" && state.cards.every((c) => c.menuItemId && c.restaurantId) && !state.cards.some((c) => c.dishName === "no identity"));
  check("C4-3 cards carry the exact canonical identity and branch context", state.cards?.[0]?.menuItemId === "dev-item-chicken" && state.cards?.[0]?.restaurantId === "dev-restaurant-haochu" && state.cards?.[0]?.branchId === "dev-branch-nanjing");
  check("C4-4 no fabricated match score on a live card; missing calories stay missing", state.cards?.every((c) => c.matchPercent === null) && state.cards?.[1]?.calories === null && state.cards?.[0]?.calories === 520);
  check("C4-5 the carousel asks the canonical provider exactly once with the entitlement", p.calls === 1 && p.last?.entitlement === "free");
}
// ---- truthful non-success states
{
  const empty = await carousel.loadLiveNextMealCarousel(provider({ status: "empty", message: "目前沒有符合條件的下一餐候選選項。" }), "free");
  check("C4-6 a legitimate zero-candidate result is a truthful empty state", empty.status === "empty" && /沒有符合條件/.test(empty.message));
  const noIdentity = await carousel.loadLiveNextMealCarousel(provider(success([candidate({ prototypeId: "x", menuItemId: undefined, restaurantId: undefined })])), "free");
  check("C4-7 a result with no selectable canonical candidate is empty, never a dead card", noIdentity.status === "empty");
  const error = await carousel.loadLiveNextMealCarousel(provider({ status: "error", message: "下一餐候選資料讀取失敗，請稍後再試。", retryable: true }), "free");
  check("C4-8 a backend failure is a retryable error state", error.status === "error" && error.retryable === true);
  const thrown = await carousel.loadLiveNextMealCarousel(provider(new Error("boom")), "free");
  check("C4-9 a thrown provider failure is a retryable error state (never an unhandled rejection)", thrown.status === "error" && thrown.retryable === true);
  const disabled = await carousel.loadLiveNextMealCarousel(provider({ status: "disabled", message: "下一餐推薦目前未啟用。" }), "free");
  check("C4-10 a disabled source is reported as disabled, not as an empty list", disabled.status === "disabled");
}
// ---- destination: context handoff selects (never reorders) the chosen candidate
{
  const content = load("apps/mobile/features/next-meal-prototype/nextMealPrototypePresenter.ts");
  const result = success([candidate({ prototypeId: "p1", menuItemId: "m1", restaurantId: "r" }), candidate({ prototypeId: "p2", menuItemId: "m2", restaurantId: "r" })]);
  check("C4-11 the handed-off menu item is preselected on /recommendation", content.preferredCandidateId(result, "m2") === "p2");
  check("C4-12 an unknown or absent preference preselects nothing", content.preferredCandidateId(result, "zz") === null && content.preferredCandidateId(result, undefined) === null);
  check("C4-13 a non-success result never preselects", content.preferredCandidateId({ status: "empty", message: "x" }, "m1") === null);
  const presenter = load("apps/mobile/features/next-meal-prototype/nextMealPrototypePresenter.ts");
  const view = presenter.presentU1NextMealResult(result, content.preferredCandidateId(result, "m2"));
  check("C4-14 selection keeps the canonical order", view.selectedCandidateId === "p2" && view.recommendation.candidates.map((c) => c.prototypeId).join() === "p1,p2");
}
// ---- live source selection: Stable config builds the canonical Supabase dependencies; missing config fails closed
const P = "EXPO_PUBLIC_TASTKIND_CONSUMER_";
const STABLE = {
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", [`${P}SUPABASE_URL`]: "https://abcdefghijklmnopqrst.supabase.co", [`${P}SUPABASE_PUBLISHABLE_KEY`]: "sb_publishable_test_only",
  [`${P}AUTH_SOURCE`]: "supabase-live", [`${P}SUPABASE_AUTH_ENABLED`]: "true", [`${P}PROFILE_SOURCE`]: "supabase-live", [`${P}SUPABASE_WRITES_ENABLED`]: "true",
  [`${P}MEAL_RECORDS_SOURCE`]: "supabase-live", [`${P}DAILY_NUTRITION_SOURCE`]: "supabase-live", [`${P}DAILY_NUTRITION_LIVE_READ_OPT_IN`]: "true",
  [`${P}PLANNED_MEALS_SOURCE`]: "supabase", [`${P}PLANNED_MEALS_LIVE_READ_OPT_IN`]: "true", [`${P}PLANNED_MEALS_WRITE_SOURCE`]: "supabase",
  [`${P}NEXT_MEAL_RECOMMENDATION_SOURCE`]: "supabase", [`${P}RESTAURANT_CATALOG_SOURCE`]: "supabase"
};
const composition = () => load("apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeComposition.ts").createCanonicalNextMealPrototypeRuntimeDependencies();
await withProcessEnv(STABLE, async () => {
  const deps = composition();
  check("C4-15 Stable config composes the LIVE canonical next-meal dependencies (auth, meal, menu clients)",
    Boolean(deps.authPort && deps.mealClient && deps.restaurantMenuClient && deps.nutritionGoalsReader) && createClientCalls > 0);
});
await withProcessEnv({ ...STABLE, [`${P}NEXT_MEAL_RECOMMENDATION_SOURCE`]: undefined }, async () => {
  const deps = composition();
  const providerMod = load("apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts");
  const result = await providerMod.createCanonicalNextMealPrototypeProvider(deps).getRecommendation({ entitlement: "free" });
  check("C4-16 missing next-meal config fails closed with a truthful error, never mock candidates", Object.keys(deps).length === 0 && result.status === "error" && !result.recommendation);
});

// ---- analysis screen wiring (static): live identity never ranks the mock platform; cards navigate with canonical ids
const analysis = read("apps/mobile/app/analysis.tsx");
check("C4-17 the live carousel reads the canonical provider hook, and the local mock ranking is off for a live identity",
  /useLiveNextMealCarousel\(\{\s*enabled: liveNextMealComposition && \(completionSnapshot !== null \|\| isAnalysisConfirmed\)/.test(analysis)
  && /liveNextMealComposition \? \[\] : buildNextMealRecommendationCards\(/.test(analysis));
check("C4-18 a card press navigates to /recommendation carrying the canonical menu item id",
  /router\.push\(\{ pathname: "\/recommendation", params: \{ preferredMenuItemId: meal\.menuItemId \} \}\)/.test(analysis)
  && /onPress=\{\(\) => onSelectMeal\(item\)\}/.test(analysis));
check("C4-19 the carousel renders explicit loading / empty / error (+ retry) states instead of an empty strip",
  /正在讀取下一餐候選…/.test(analysis) && /liveStatus\.status === "error" && liveStatus\.retryable && onRetry/.test(analysis));
check("C4-20 the saved-meal 下一餐 action opens the canonical /recommendation for a live identity",
  /<LiveSavedMealActions[\s\S]{0,400}onNextMeal=\{\(\) => router\.push\("\/recommendation"\)\}/.test(analysis));
const recommendation = read("apps/mobile/app/recommendation.tsx");
check("C4-21 /recommendation hands the preferred id to the canonical content and uses the canonical provider",
  /preferredMenuItemId=\{typeof params\.preferredMenuItemId === "string" \? params\.preferredMenuItemId : undefined\}/.test(recommendation)
  && /provider=\{canonicalProvider\}/.test(recommendation));
const contentSource = read("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");
check("C4-22 the destination applies the preference as a selection after load", /presentU1NextMealResult\(result, preferredCandidateId\(result, preferredMenuItemId\)\)/.test(contentSource));

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-next-meal-carousel-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
