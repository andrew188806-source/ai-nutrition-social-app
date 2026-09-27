#!/usr/bin/env node
// GQA-6R C-5 smoke: selected next-meal candidate -> Meal Buddy recommendation context -> the user's own
// card through the canonical Edge path -> real discovery; no demo invitations/friends/chats for a live
// identity. Executes REAL modules (transpile-only, native modules stubbed). Local only: no network.
import fs from "node:fs";
import path from "node:path";
import { createTsLoader, withProcessEnv } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const code = (f) => fs.readFileSync(path.join(root, f), "utf8");

const memory = new Map();
const { load } = createTsLoader({ stubs: {
  "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } },
  "react-native": { AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" }, Platform: { OS: "web" } },
  "@supabase/supabase-js": { createClient: () => ({ auth: {}, from: () => ({}) }) },
  "react-native-url-polyfill/auto": {}
} });

// ---- 1. recommendation selection carries the exact canonical identity into the Meal Buddy prefill
const prefill = load("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts");
const candidate = { prototypeId: "p1", branchMenuItemId: "gqa6r-demo-bmi-01-1", menuItemId: "gqa6r-demo-item-01-1", restaurantId: "gqa6r-demo-restaurant-01", branchId: "gqa6r-demo-branch-01",
  source: "canonical_mock", isSampleData: false, ordinal: 1, isBestRecommendation: true, mealName: "[DEMO] 香煎雞胸能量碗", restaurantName: "[DEMO] 好廚測試餐館 01", areaLabel: "大安區",
  nutrition: { calories: 520, protein: 42, carbohydrates: 48, fat: 14 }, tags: [], reasonSummary: "r", reasonCode: "nutrition_gap", reasonDetails: [] };
const built = prefill.buildU1NextMealBuddyPrefill(candidate);
check("C5F-1 the selected candidate's canonical identity (branch item, item, restaurant, branch) enters the prefill",
  JSON.stringify(built.selectedRecommendation) === JSON.stringify({ source: "canonical_next_meal", branchMenuItemId: candidate.branchMenuItemId, menuItemId: candidate.menuItemId, restaurantId: candidate.restaurantId, branchId: candidate.branchId }), built.selectedRecommendation);
const partial = prefill.buildU1NextMealBuddyPrefill({ ...candidate, branchId: undefined });
check("C5F-2 a candidate without a complete canonical identity never claims a selected recommendation", !partial.selectedRecommendation);
check("C5F-3 no internal category is chosen for the user: the prefill carries no food-context key (derived server-side from the menu item)",
  !/foodContextTagKey|food_context/.test(JSON.stringify(built)));

// ---- 2. the card-create boundary accepts exactly that identity and rejects a mismatched restaurant
const validate = load("supabase/functions/_shared/meal-buddy-card-api/validate.ts");
const base = { cardType: "restaurant", intentionType: "chat_first", restaurantId: candidate.restaurantId, area: null, diningDate: "2026-09-28", mealPeriod: "dinner", preferredTime: null,
  selectedRecommendation: built.selectedRecommendation };
const instant = new Date("2026-09-28T02:00:00Z");
const okReq = validate.validateMealBuddyCardCreateRequest(base, instant);
const badReq = validate.validateMealBuddyCardCreateRequest({ ...base, restaurantId: "gqa6r-demo-restaurant-02" }, instant);
const generalWithRec = validate.validateMealBuddyCardCreateRequest({ ...base, cardType: "general" }, instant);
check("C5F-4 the Edge create contract accepts the recommendation identity for a restaurant card", okReq.ok === true, okReq);
check("C5F-5 a recommendation identity with a different restaurant, or on a general card, is rejected", badReq.ok === false && generalWithRec.ok === false);

// ---- 3. real-mode wiring (source assertions over the exact screens)
const rec = code("apps/mobile/app/recommendation.tsx");
check("C5F-6 /recommendation hands the SELECTED candidate to Meal Buddy through the staged prefill token",
  /stageU1NextMealBuddyPrefill\(buildU1NextMealBuddyPrefill\(candidate\)\)/.test(rec) && /pathname: "\/meal-buddies"[\s\S]{0,120}u1PrefillToken: token/.test(rec));
const buddies = code("apps/mobile/app/meal-buddies.tsx");
check("C5F-7 a live identity's recommendation card is created through the canonical Edge path (createRecommendationMealBuddyCard)",
  /if \(isRealCandidateMode && formTarget\?\.mode === "create" && formTarget\.prefill\?\.selectedRecommendation\) \{[\s\S]{0,400}await createRecommendationMealBuddyCard\(request\)/.test(buddies));
check("C5F-8 after creation the real source cards reload, and discovery reads the real candidate source only",
  /await realCandidates\.loadSourceCards\(\);/.test(buddies) && /<MealBuddyRealSourceCardPicker controller=\{realCandidates\} \/>/.test(buddies) && /<MealBuddyRealCandidateSection/.test(buddies));
check("C5F-9 mock recommendation groups and the client-side draw never render/run for a live identity",
  /\{!isRealCandidateMode && recommendationGroups\.length > 0 \?/.test(buddies) && /if \(isRealCandidateMode\) return;\s*const ranked = rankMealBuddyRecommendations/.test(buddies));
check("C5F-10 the friends area is the canonical relationship inbox for a live identity (invite/accept/chat via Edge)",
  /isRealCandidateMode \? \(\s*<MealBuddyRelationshipInbox/.test(buddies));
check("C5F-10b a canonical selection is announced as the user's chosen next meal, never as a sample (範例)",
  /subtitle=\{prefill\?\.selectedRecommendation\s*(\/\/[^\n]*\s*)?\? "已帶入你選擇的下一餐；/.test(buddies));
const invite = code("apps/mobile/features/meal-buddy-relationships/repository.ts");
check("C5F-11 invitations go through the canonical meal-buddy-relationship Edge Function", /functions\.invoke<MealBuddyRelationshipApiResponse>\(/.test(invite));

// ---- 4. no demo invitations / matched buddies / chats for a live identity (behaviour of the real store)
const scope = load("apps/mobile/features/consumer-auth/clientStateScope.ts");
const P = "EXPO_PUBLIC_TASTKIND_CONSUMER_";
const storeCounts = async (env) => withProcessEnv(env, async () => {
  const store = load("apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts");
  if (typeof scope.setConsumerClientStateScope === "function") scope.setConsumerClientStateScope(`gqa6r-actor-${Math.random().toString(36).slice(2)}`, 1);
  return { invites: store.getMealBuddyInvites().length, chats: store.getMealBuddyChats().length };
});
const hasScopeSetter = typeof scope.setConsumerClientStateScope === "function";
check("C5F-12 the client-state scope can be set for the store test", hasScopeSetter, Object.keys(scope));
if (hasScopeSetter) {
  const live = await storeCounts({ [`${P}AUTH_SOURCE`]: "supabase-live", [`${P}SUPABASE_AUTH_ENABLED`]: "true" });
  check("C5F-13 a live identity sees NO default demo invitations or chat previews", live.invites === 0 && live.chats === 0, live);
}
const storeSource = code("apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts");
check("C5F-14 non-live demo compositions keep the historical demo defaults; live compositions drop persisted defaults",
  /return localSocialDemoAllowed\(\) \? buildDemoDefaultChats\(\) : \[\];/.test(storeSource) && /return localSocialDemoAllowed\(\) \? buildDemoDefaultInvites\(\) : \[\];/.test(storeSource)
  && /if \(!localSocialDemoAllowed\(\)\) \{\s*const demoIds = new Set\(buildDemoDefaultInvites\(\)/.test(storeSource));

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 300)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-meal-buddy-flow-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
