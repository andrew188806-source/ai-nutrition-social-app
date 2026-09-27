#!/usr/bin/env node
// GQA-6R C-1 smoke: Consumer public runtime configuration is literal (build-inlinable), complete, and
// fail-closed — a live Consumer identity can never be served the mock restaurant platform because a
// flag is missing. Executes the REAL modules (transpile-only); only native modules are stubbed.
// Local only: no network, no Supabase project, no credential.
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createTsLoader, withProcessEnv } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }); };

// ---------------------------------------------------------------- static: one literal authority
const CONFIG = "apps/mobile/features/consumer-runtime-config/consumerPublicRuntimeEnv.ts";
const configSource = fs.readFileSync(path.join(root, CONFIG), "utf8");
const listed = [...configSource.slice(configSource.indexOf("CONSUMER_PUBLIC_RUNTIME_ENV_NAMES"), configSource.indexOf("] as const"))
  .matchAll(/"(EXPO_PUBLIC_[A-Z0-9_]+)"/g)].map((m) => m[1]);
const readerBody = configSource.slice(configSource.indexOf("export function readConsumerPublicRuntimeEnv"), configSource.indexOf("export function isLiveConsumerComposition"));
const literal = [...readerBody.matchAll(/(EXPO_PUBLIC_[A-Z0-9_]+): process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+),/g)];
check("C1-S1 every listed public name is read as a literal process.env.<NAME> member of the same name",
  listed.length === 34 && literal.length === listed.length && literal.every((m) => m[1] === m[2] && listed.includes(m[1])),
  { listed: listed.length, literal: literal.length });
check("C1-S2 the reader has no indirect env access (no spread, no globalThis, no dynamic index)",
  !/\.\.\.process\.env|globalThis|process\.env\[|process\?\.env/.test(readerBody));

const tracked = cp.execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "apps/mobile"], { cwd: root, encoding: "utf8" })
  .split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && fs.existsSync(path.join(root, f)));
// Indirect = optional-chained env, spread, bracket indexing, or a bare process.env not followed by a member.
const indirect = tracked.filter((f) => /process\?\.env|\.\.\.process\.env|process\.env\[|process\.env(?![.\w])/
  .test(fs.readFileSync(path.join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1").replace(/declare const process[^\n]*/g, "")));
check("C1-S3 no Consumer source reads process.env indirectly", indirect.length === 0, indirect);
const referenced = new Set(tracked.flatMap((f) => [...fs.readFileSync(path.join(root, f), "utf8").matchAll(/\bEXPO_PUBLIC_[A-Z0-9_]+/g)].map((m) => m[0])));
const unlisted = [...referenced].filter((name) => !listed.includes(name));
check("C1-S4 every EXPO_PUBLIC name referenced by Consumer source is in the single authority", unlisted.length === 0, unlisted);

// ---------------------------------------------------------------- behaviour
const { load } = createTsLoader({ stubs: {
  "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } },
  "react-native": { AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" }, Platform: { OS: "web" } },
  "@supabase/supabase-js": { createClient: () => ({ auth: {}, from: () => ({}) }) },
  "react-native-url-polyfill/auto": {}
} });
const F = (p) => load(`apps/mobile/features/${p}/featureFlags.ts`);
const P = "EXPO_PUBLIC_TASTKIND_CONSUMER_";
const PUBLIC_IDENTITY = { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", [`${P}SUPABASE_URL`]: "https://abcdefghijklmnopqrst.supabase.co", [`${P}SUPABASE_PUBLISHABLE_KEY`]: "sb_publishable_test_only" };
const LIVE_IDENTITY = { ...PUBLIC_IDENTITY, [`${P}AUTH_SOURCE`]: "supabase-live", [`${P}SUPABASE_AUTH_ENABLED`]: "true", [`${P}PROFILE_SOURCE`]: "supabase-live" };
// The seven values the first-pass Stable bundle actually carried (the rest were undefined).
const FIRST_PASS_DEPLOYED = { ...LIVE_IDENTITY, [`${P}SUPABASE_WRITES_ENABLED`]: "true", [`${P}MEAL_PHOTO_UPLOAD_SOURCE`]: "supabase-live", [`${P}MEAL_PHOTO_ANALYSIS_SOURCE`]: "supabase-live" };
export const STABLE = Object.freeze({
  ...FIRST_PASS_DEPLOYED,
  [`${P}MEAL_IDENTIFICATION_FINALIZATION_SOURCE`]: "supabase",
  [`${P}MEAL_RECORDS_SOURCE`]: "supabase-live",
  [`${P}DAILY_NUTRITION_SOURCE`]: "supabase-live", [`${P}DAILY_NUTRITION_LIVE_READ_OPT_IN`]: "true",
  [`${P}PLANNED_MEALS_SOURCE`]: "supabase", [`${P}PLANNED_MEALS_LIVE_READ_OPT_IN`]: "true", [`${P}PLANNED_MEALS_WRITE_SOURCE`]: "supabase",
  [`${P}NEXT_MEAL_RECOMMENDATION_SOURCE`]: "supabase", [`${P}RESTAURANT_CATALOG_SOURCE`]: "supabase",
  [`${P}FAVORITES_READ_SOURCE`]: "supabase", [`${P}FAVORITES_WRITE_SOURCE`]: "supabase",
  [`${P}RATINGS_READ_SOURCE`]: "supabase", [`${P}RATINGS_WRITE_SOURCE`]: "supabase",
  [`${P}RECOMMENDATION_FEEDBACK_SOURCE`]: "supabase",
  [`${P}MEAL_BUDDY_CANDIDATE_SOURCE`]: "supabase-live", [`${P}SOCIAL_CANDIDATE_SOURCE`]: "supabase-live"
});

function resolveAll() {
  const a = F("consumer-auth").getConsumerRuntimeFlags();
  const upload = F("meal-photo-upload").getMealPhotoUploadRuntimeFlags(a.authSource, a.supabaseAuthEnabled, a.supabaseWritesEnabled);
  return {
    auth: load("apps/mobile/features/consumer-auth/liveClientCompositionFlags.ts").deriveLiveSupabaseClientFlags(a),
    meals: F("consumer-meals").getConsumerMealRuntimeFlags(),
    catalog: F("restaurants/catalog").getRestaurantCatalogRuntimeFlags(),
    favorites: F("consumer-favorites").getConsumerFavoriteRuntimeFlags(),
    ratings: F("consumer-ratings").getConsumerRatingRuntimeFlags(),
    feedback: F("consumer-recommendation-feedback").getConsumerRecommendationFeedbackRuntimeFlags(),
    finalization: F("meal-identification-finalization").getConsumerMealIdentificationFinalizationRuntimeFlags(),
    upload,
    analysis: F("meal-photo-analysis").getMealPhotoAnalysisRuntimeFlags(a.authSource, a.supabaseAuthEnabled, a.supabaseWritesEnabled, upload.uploadSource),
    buddy: F("meal-buddy-candidates").getMealBuddyCandidateRuntimeFlags(a.authSource, a.supabaseAuthEnabled),
    social: F("social-candidates").getSocialCandidateRuntimeFlags(a.authSource, a.supabaseAuthEnabled)
  };
}
const snapshotSize = () => {
  const s = load("apps/mobile/adapters/mock/mobile-restaurant-mock-adapter.ts").mobileRestaurantMockAdapter.getSnapshot();
  return Object.values(s).reduce((n, list) => n + list.length, 0);
};
const catalogRuntime = () => {
  const flags = F("restaurants/catalog").getRestaurantCatalogRuntimeFlags();
  return load("apps/mobile/features/restaurants/catalog/factories.ts").createRestaurantCatalogRuntime(flags);
};

await withProcessEnv(STABLE, async () => {
  const r = resolveAll();
  const issues = Object.entries(r).flatMap(([k, v]) => (v.issues ?? []).map((i) => `${k}: ${i}`));
  check("C1-B1 the Stable configuration resolves every Consumer module with zero issues", issues.length === 0, issues);
  check("C1-B2 Stable sources are live: catalogue supabase, meal records + daily nutrition live, next meal supabase",
    r.catalog.source === "supabase" && r.meals.mealRecordsSource === "supabase-live" && r.meals.dailyNutritionSource === "supabase-live"
    && r.meals.nextMealRecommendationSource === "supabase" && r.meals.plannedMealsSource === "supabase" && r.finalization.source === "supabase");
  check("C1-B3 Stable Social sources are live (Meal Buddy candidates, Social candidates)", r.buddy.candidateSource === "supabase-live" && r.social.candidateSource === "supabase-live");
  check("C1-B4 Stable live identity receives NO mock restaurant platform (empty snapshot)", snapshotSize() === 0);
  check("C1-B5 Stable catalogue repository is the Supabase repository path, never mock", catalogRuntime().repository.source !== "mock");
});

await withProcessEnv(FIRST_PASS_DEPLOYED, async () => {
  const r = resolveAll();
  check("C1-B6 first-pass deployed values: missing catalogue source resolves to disabled, not mock", r.catalog.source === "disabled");
  check("C1-B7 first-pass deployed values: missing meal records / daily nutrition resolve to supabase-disabled, not mock",
    r.meals.mealRecordsSource === "supabase-disabled" && r.meals.dailyNutritionSource === "supabase-disabled");
  check("C1-B8 first-pass deployed values: missing ratings read resolves to disabled, not mock", r.ratings.readSource === "disabled");
  check("C1-B9 first-pass deployed values: the mock restaurant platform is unreachable (empty snapshot)", snapshotSize() === 0);
  const listing = await catalogRuntime().repository.listCatalog();
  check("C1-B10 first-pass deployed values: the catalogue answers a truthful non-mock state", listing.source !== "mock" && !(listing.restaurants ?? []).length, listing);
  const items = load("apps/mobile/services/mobile-menu-item-service.ts").mobileMenuItemService.getRecommendedMenuItemsForNextMeal(5, 500);
  check("C1-B11 first-pass deployed values: the legacy next-meal ranking yields no fixture dish", items.length === 0, items.length);
});

await withProcessEnv({ ...PUBLIC_IDENTITY, [`${P}AUTH_SOURCE`]: "supabase-live", [`${P}SUPABASE_AUTH_ENABLED`]: "true" }, async () => {
  check("C1-B12 live identity without a profile source never reads a mock profile", F("consumer-auth").getConsumerRuntimeFlags().profileSource === "supabase-disabled");
});
await withProcessEnv({ ...STABLE, [`${P}RESTAURANT_CATALOG_SOURCE`]: "mock" }, async () => {
  check("C1-B13 an EXPLICIT catalogue mock value is the only way a live identity sees the mock platform", F("restaurants/catalog").getRestaurantCatalogRuntimeFlags().source === "mock" && snapshotSize() > 0);
});
await withProcessEnv({ ...STABLE, [`${P}RESTAURANT_CATALOG_SOURCE`]: "bogus" }, async () => {
  const flags = F("restaurants/catalog").getRestaurantCatalogRuntimeFlags();
  check("C1-B14 an invalid catalogue value is disabled with an issue, never mock", flags.source === "disabled" && flags.issues.length === 1 && snapshotSize() === 0);
});
await withProcessEnv({}, async () => {
  const r = resolveAll();
  check("C1-B15 no live identity (local demo / harness): historical defaults unchanged",
    r.auth.authSource === "mock" && r.catalog.source === "mock" && r.meals.mealRecordsSource === "mock" && snapshotSize() > 0);
});

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-consumer-runtime-config-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
