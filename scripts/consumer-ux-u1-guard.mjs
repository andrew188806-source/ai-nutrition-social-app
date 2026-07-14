import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const issues = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function pass(name, extra = {}) {
  checks.push({ name, pass: true, ...extra });
}

function fail(name, message, extra = {}) {
  checks.push({ name, pass: false, message, ...extra });
  issues.push({ name, message, ...extra });
}

const requiredFiles = [
  "apps/mobile/features/next-meal-prototype/types.ts",
  "apps/mobile/features/next-meal-prototype/nextMealCandidateCountPolicy.ts",
  "apps/mobile/features/next-meal-prototype/mockNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/nextMealPrototypePresenter.ts",
  "apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts",
  "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx",
  "apps/mobile/features/next-meal-prototype/index.ts",
  "scripts/consumer-ux-u1-smoke.mjs",
  "docs/consumer-ux/track-u1-next-meal-flow-prototype.md"
];

for (const rel of requiredFiles) {
  if (fs.existsSync(path.join(root, rel))) pass(`required U1 file exists: ${rel}`);
  else fail(`required U1 file exists: ${rel}`, "Missing Consumer UX Track U1 file.");
}

const u1Root = path.join(root, "apps", "mobile", "features", "next-meal-prototype");
const u1Files = fs.existsSync(u1Root)
  ? fs.readdirSync(u1Root).filter((name) => /\.(ts|tsx)$/.test(name)).map((name) => ({ rel: `apps/mobile/features/next-meal-prototype/${name}`, text: read(`apps/mobile/features/next-meal-prototype/${name}`) }))
  : [];
const u1Source = u1Files.map(({ text }) => text).join("\n");
const forbiddenU1Patterns = [
  [/@supabase\/|\bsupabase\b/i, "Supabase"],
  [/consumer[A-Za-z]*Write(Service|Repository)|consumer-meals/i, "Consumer Runtime write service or repository"],
  [/\.rpc\s*\(|writeRpc|invokeRpc/i, "write RPC"],
  [/plannedMealStore|savePlannedDinner|confirmPlannedDinner/i, "planned-meal write API"],
  [/mealBuddyCardStore|createMealBuddyCard|upsertMealBuddyCard|setPendingMatchRequest|resetMealBuddyVisibleQuota/i, "Meal Buddy card or pending-match mutation API"]
];
for (const [pattern, label] of forbiddenU1Patterns) {
  const matches = u1Files.filter(({ text }) => pattern.test(text)).map(({ rel }) => rel);
  if (matches.length) fail(`U1 source does not import or invoke ${label}`, `Forbidden ${label} reference found.`, { matches });
  else pass(`U1 source does not import or invoke ${label}`);
}

const home = read("apps/mobile/app/index.tsx");
if (/PrimaryButton[^\n]*label=\{homeFocus\.startPhotoAnalysis\}[^\n]*pathname: "\/meal-photo"[^\n]*autoOpen: "true"/.test(home)) pass("Home primary CTA preserves direct photo capture/upload route");
else fail("Home primary CTA preserves direct photo capture/upload route", "拍照分析 must be the PrimaryButton linked to /meal-photo?autoOpen=true.");
const secondaryCalls = home.match(/<HomeSecondaryAction[^>]+>/g) ?? [];
if (secondaryCalls.length === 2 && secondaryCalls.some((call) => /homeFocus\.findNextMeal/.test(call)) && secondaryCalls.some((call) => /homeFocus\.findMealPartners/.test(call))) pass("Home has separate direct-next-meal and Meal Buddy secondary actions using one visual component", { count: secondaryCalls.length });
else fail("Home has separate direct-next-meal and Meal Buddy secondary actions using one visual component", "Both secondary actions must use the same HomeSecondaryAction component.", { secondaryCalls });
if (/secondaryActionCard:[\s\S]*minHeight:\s*176/.test(home) && /secondaryActionTitle:[\s\S]*fontSize:\s*15/.test(home)) pass("Home secondary actions are discoverable cards rather than tiny text links");
else fail("Home secondary actions are discoverable cards rather than tiny text links", "Secondary actions need card sizing and readable typography.");
const routeCounts = {
  photo: (home.match(/pathname: "\/meal-photo"/g) ?? []).length,
  recommendation: (home.match(/router\.push\("\/recommendation"\)/g) ?? []).length,
  buddies: (home.match(/pathname: "\/meal-buddies"/g) ?? []).length
};
if (routeCounts.photo === 1 && routeCounts.recommendation === 1 && routeCounts.buddies === 1) pass("Home preserves three independent routes with no duplicate recommendation entry", routeCounts);
else fail("Home preserves three independent routes with no duplicate recommendation entry", "Expected one independent Home entry for each route.", routeCounts);
if (/photoAnalysisBody/.test(home) && /findNextMealBody/.test(home) && !/disabled=.*findNextMeal|findNextMeal.*disabled=/.test(home)) pass("Home gently supports analysis while keeping direct next-meal accessible");
else fail("Home gently supports analysis while keeping direct next-meal accessible", "Direct next-meal must remain visible and enabled with bypass copy.");

const analysis = read("apps/mobile/app/analysis.tsx");
const forbiddenAnalysisMutations = ["createMealBuddyCard", "upsertMealBuddyCardWithQuota", "setPendingMatchRequest", "resetMealBuddyVisibleQuotaForDemo"];
const analysisMatches = forbiddenAnalysisMutations.filter((name) => analysis.includes(name));
if (analysisMatches.length) fail("Analysis recommendation selection creates zero cards, quota use, or pending matches", "Automatic Meal Buddy mutation remains in analysis.tsx.", { matches: analysisMatches });
else pass("Analysis recommendation selection creates zero cards, quota use, or pending matches");
if (/getNextMealCandidateCount\(demoMode\)/.test(analysis) && !/demoMode === "premium" \? 10 : 3/.test(analysis)) pass("AI Analysis uses the shared next-meal candidate-count policy");
else fail("AI Analysis uses the shared next-meal candidate-count policy", "Analysis must call the shared helper and contain no inline 10/3 policy.");
if (/router\.push\(\{ pathname: "\/recommendation", params: \{ prototypeId: meal\.menuItemId \} \}\)/.test(analysis)) pass("Analysis selection navigates to the existing recommendation route");
else fail("Analysis selection navigates to the existing recommendation route", "Analysis candidates must navigate to /recommendation with a presentation ID.");
if (!/已建立飯友卡|MealBuddySuccessToast/.test(analysis) && !/setTimeout\([\s\S]{0,200}router\.push\("\/meal-buddies"/.test(analysis) && !/點擊後會建立飯友卡|點擊餐點即可建立飯友卡/.test(analysis)) pass("Analysis has no false card toast, delayed social redirect, or automatic-card copy");
else fail("Analysis has no false card toast, delayed social redirect, or automatic-card copy", "Remove all automatic social-flow remnants from Analysis selection.");

if (!fs.existsSync(path.join(root, "apps", "mobile", "app", "recommendation-result.tsx"))) pass("No standalone recommendation-result route was added");
else fail("No standalone recommendation-result route was added", "U1 must preserve the existing /recommendation route.");

const policy = read("apps/mobile/features/next-meal-prototype/nextMealCandidateCountPolicy.ts");
const provider = read("apps/mobile/features/next-meal-prototype/mockNextMealPrototypeProvider.ts");
if (/free:\s*3/.test(policy) && /premium:\s*10/.test(policy) && /value === "premium" \? "premium" : "free"/.test(policy)) pass("Shared policy preserves Free 3, Premium 10, and unknown-to-Free fallback");
else fail("Shared policy preserves Free 3, Premium 10, and unknown-to-Free fallback", "The extracted existing policy must define the only 3/10 counts and fail closed to Free.");
if (/getNextMealCandidateCount\(entitlement\)/.test(provider) && /getNextMealCandidateCount\("premium"\)/.test(provider) && !/\.slice\(0,\s*(3|10)\)/.test(provider)) pass("U1 provider reuses shared policy without an independent numeric candidate limit");
else fail("U1 provider reuses shared policy without an independent numeric candidate limit", "Provider must use the shared helper for both active and maximum counts.");
if (/uniqueCandidates/.test(provider) && /isBestRecommendation:\s*index === 0/.test(provider) && /slice\(0, visibleLimit\)/.test(provider)) pass("Best candidate is first and alternatives are clipped to active entitlement");
else fail("Best candidate is first and alternatives are clipped to active entitlement", "Ordered candidates must mark index zero best and hide entries beyond the limit.");

const recommendation = read("apps/mobile/app/recommendation.tsx");
if (/NextMealPrototypeContent/.test(recommendation) && /entitlement=\{demoMode\}/.test(recommendation) && /PlannedDinnerInput/.test(recommendation) && /plannedDinnerSectionTitle/.test(recommendation)) pass("Recommendation route contains U1 and a separated intact planned-dinner demo");
else fail("Recommendation route contains U1 and a separated intact planned-dinner demo", "U1 must receive current plan and preserve planned dinner below a separate heading.");
if (!/createMealBuddyCard|upsertMealBuddyCardWithQuota|setPendingMatchRequest/.test(recommendation)) pass("Recommendation route stages selected-candidate prefill without card or social mutation");
else fail("Recommendation route stages selected-candidate prefill without card or social mutation", "Recommendation route must not create cards or pending matches.");

const content = read("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");
if ((content.match(/disabled=\{!selectedCandidate\}/g) ?? []).length === 2 && /selectionRequired/.test(content)) pass("Both downstream CTAs require an explicitly selected candidate");
else fail("Both downstream CTAs require an explicitly selected candidate", "Confirmation and Meal Buddy CTA must both be disabled until selection.");
if (/function selectCandidate/.test(content) && /setModel\(presentU1NextMealResult/.test(content) && !/savePlannedDinner|saveCorrectedMealRecord|storage\./.test(content)) pass("Selecting or changing candidates is presentation-only");
else fail("Selecting or changing candidates is presentation-only", "Selection must only update component ViewModel state.");
if (/function confirmSelectedCandidate/.test(content) && /model\.selectedCandidateId, model\.selectedCandidateId/.test(content) && /confirmedBody/.test(content)) pass("這是我的下一餐 confirms only the selected candidate locally");
else fail("這是我的下一餐 confirms only the selected candidate locally", "Confirmation must target selected identity and remain local.");
if (/if \(selectedCandidate\) onUseForMealBuddy\(selectedCandidate\)/.test(content)) pass("Only the selected candidate reaches Meal Buddy prefill");
else fail("Only the selected candidate reaches Meal Buddy prefill", "Meal Buddy handoff must receive selectedCandidate only.");
if (/status === "loading"/.test(content) && /status === "disabled"/.test(content) && /status === "empty"/.test(content) && /status === "error"/.test(content) && /status !== "success"/.test(content)) pass("U1 UI implements loading, disabled, empty, error, and success states");
else fail("U1 UI implements loading, disabled, empty, error, and success states", "All deterministic presentation states must be rendered.");
if (/source: "u1_mock"/.test(read("apps/mobile/features/next-meal-prototype/types.ts")) && /isSampleData: true/.test(read("apps/mobile/features/next-meal-prototype/types.ts")) && /sampleBadge/.test(content)) pass("All candidates and UI remain marked prototype/sample data");
else fail("All candidates and UI remain marked prototype/sample data", "Candidate contract and UI must expose sample-data markers.");

const prefill = read("apps/mobile/features/next-meal-prototype/nextMealBuddyPrefill.ts");
if (/pendingPrefill = null/.test(prefill) && /consumeU1NextMealBuddyPrefill/.test(prefill) && /clearU1NextMealBuddyPrefill/.test(prefill) && /buildU1NextMealBuddyPrefill\(recommendation: U1NextMealCandidateViewModel\)/.test(prefill)) pass("U1 prefill is transient and built from one selected candidate");
else fail("U1 prefill is transient and built from one selected candidate", "Prefill must accept one candidate and support consume/clear lifecycle.");

const buddies = read("apps/mobile/app/meal-buddies.tsx");
if (/if \(!params\.u1PrefillToken\) \{\s*clearU1NextMealBuddyPrefill\(\);\s*setU1Prefill\(null\);\s*return;\s*\}/.test(buddies) && /return "discover";/.test(buddies)) pass("Missing token preserves existing direct Meal Buddy navigation");
else fail("Missing token preserves existing direct Meal Buddy navigation", "Direct /meal-buddies navigation must retain existing section behavior.");
if (/clearU1NextMealBuddyPrefill\(\);[\s\S]*setFormTarget\(null\)/.test(buddies) && /clearU1NextMealBuddyPrefill\(\);\s*if \(formTarget\?\.mode/.test(buddies)) pass("Meal Buddy prefill clears on explicit cancel and save");
else fail("Meal Buddy prefill clears on explicit cancel and save", "Prefill must clear on both cancel and save.");

const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
if (migrations.length === 21 && migrations.at(-1) === "20260713090100_consumer_schema_phase_1_3_atomic_planned_meal_write_functions.sql") pass("Migration inventory remains at frozen Phase 2P baseline", { count: migrations.length, latest: migrations.at(-1) });
else fail("Migration inventory remains at frozen Phase 2P baseline", "U1 must not add or modify migration scope.", { count: migrations.length, latest: migrations.at(-1) });
const supabaseDiff = execFileSync("git", ["diff", "--name-only", "--", "supabase"], { cwd: root, encoding: "utf8" }).trim();
if (!supabaseDiff) pass("No migration or schema file changed");
else fail("No migration or schema file changed", "Supabase files changed during U1.", { files: supabaseDiff.split(/\r?\n/) });

if (!/Phase 2Q|phase2q/i.test(u1Source)) pass("U1 source does not start or reference Phase 2Q implementation");
else fail("U1 source does not start or reference Phase 2Q implementation", "Phase 2Q implementation detail leaked into U1 source.");

const result = { status: issues.length ? "failed" : "passed", track: "Consumer UX Track U1", checks, issues, phase2QStarted: false, databaseWriteUsed: false, productionTouched: false };
console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);
