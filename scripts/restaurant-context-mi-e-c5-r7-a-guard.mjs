#!/usr/bin/env node
// MI-E-C5-R7-A guard — canonical restaurant context FOUNDATION and safety cleanup.
//
// Scope reminder: R7-A deliberately ships no user-facing selector, no route handoff, no finalization
// command / fingerprint / RPC / database write. These checks pin the foundation and, just as
// importantly, pin the ABSENCE of the deferred pieces so a later round cannot claim them silently.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });

const sessionStore = read("apps/mobile/features/analysis/analysisSessionStore.ts");
const presentation = read("apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts");
// MI-E-C5-R7-C2a: executable source only. The module's comments legitimately name the OLD flattened
// model and the mapper's `branches[0]` collapse while explaining why they are no longer used, and
// prose must never satisfy or break a check about the code.
const presentationCode = presentation
  .split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
  .join("\n");
const todayIntake = read("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts");
const catalogFlags = read("apps/mobile/features/restaurants/catalog/featureFlags.ts");
const screen = read("apps/mobile/app/analysis.tsx");
const finalizationDraft = read("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts");
const finalizationHook = read("apps/mobile/features/analysis/useMealPhotoFinalization.ts");
const mobilePackage = JSON.parse(read("apps/mobile/package.json"));
const MI_E_C5_R7_A_EXPECTED_MOBILE_DEPENDENCY_COUNT = 30;

// ---------- session model ----------
check(
  "1. session state declares the canonical restaurant fields — IDs ONLY",
  /restaurantId: string \| null;/.test(sessionStore) &&
    /branchId: string \| null;/.test(sessionStore) &&
    !/^\s*restaurantDisplayName: string \| null;/m.test(sessionStore)
);
check(
  "2. createDefaultSession seeds every restaurant field null/empty",
  /restaurantId: null,\s*\r?\n?\s*branchId: null,/.test(sessionStore) &&
    /restaurantName: "",/.test(sessionStore)
);
check(
  "3. the demo restaurant fixture is no longer a runtime default",
  !/restaurantName: zhTW\.mobile\.analysis\.candidates\[0\]\.restaurant/.test(sessionStore) &&
    !/好初健康碗/.test(sessionStore)
);
check(
  "4. no production source uses a hardcoded restaurant name as a runtime default",
  !/好初健康碗/.test(screen) &&
    !/好初健康碗/.test(presentation) &&
    !/好初健康碗/.test(todayIntake)
);
check(
  "5. a pristine session requires all restaurant context to be absent (actor-safety)",
  /state\.restaurantId === null &&\s*\r?\n?\s*state\.branchId === null;/.test(sessionStore)
);

// ---------- canonical invariants ----------
check(
  "6. self_cooked can never carry a restaurant context",
  /if \(input\.sourceContext === "self_cooked"\) return EMPTY_ANALYSIS_RESTAURANT_CONTEXT;/.test(sessionStore)
);
check(
  "7. branchId can never exist without restaurantId, and a bare display name is dropped",
  /const restaurantId = blankToNull\(input\.restaurantId\);\s*\r?\n?\s*if \(!restaurantId\) return EMPTY_ANALYSIS_RESTAURANT_CONTEXT;/.test(sessionStore)
);
check(
  "8. every mutating entry point routes through the single normalizer",
  /export function setAnalysisRestaurantContext\([\s\S]{0,600}?const next = normalizeAnalysisRestaurantContext\(\{ \.\.\.input, sourceContext \}\);/.test(sessionStore) &&
    /export function reconcileAnalysisRestaurantContextForSourceContext\(/.test(sessionStore)
);
check(
  "9. takeout/delivery/dine_in are NOT special-cased away — only self_cooked clears",
  !/sourceContext === "takeout"/.test(sessionStore) && !/sourceContext === "delivery"/.test(sessionStore)
);
check(
  "10. the normalizer is pure (no session mutation, no IO, no UUID mint)",
  !/export function normalizeAnalysisRestaurantContext\([\s\S]{0,900}?(session\.[a-zA-Z]+ =|await |generateSecureUuidV4|fetch\()/.test(sessionStore)
);

// ---------- capture lifecycle ----------
check(
  "11. a new capture applies restaurant context atomically inside the same reset",
  /restaurantContext: Readonly<\{/.test(sessionStore) &&
    /session = createDefaultSession\(\);[\s\S]{0,1400}?const restaurant = normalizeAnalysisRestaurantContext\(\{\s*\r?\n?\s*\.\.\.restaurantContext,/.test(sessionStore)
);
check(
  "12. the generic camera/gallery entry defaults to NO restaurant context",
  /\}> = EMPTY_ANALYSIS_RESTAURANT_CONTEXT/.test(sessionStore) &&
    /export const EMPTY_ANALYSIS_RESTAURANT_CONTEXT: AnalysisRestaurantContext = Object\.freeze\(\{\s*\r?\n?\s*restaurantId: null,\s*\r?\n?\s*branchId: null\s*\r?\n?\}\);/.test(sessionStore)
);

// ---------- presentation resolver ----------
check(
  "13. the resolver is a pure helper with no repository, no React and no network of its own",
  !/useState|useEffect|createClient|fetch\(|new Supabase/.test(presentation) &&
    /export function resolveRestaurantContextPresentation\(/.test(presentation)
);
check(
  "14. a raw UUID can never be rendered as a restaurant name",
  /const UUID_SHAPE = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i;/.test(presentation) &&
    /export function isDisplayableRestaurantName\(/.test(presentation) &&
    /return !UUID_SHAPE\.test\(trimmed\);/.test(presentation)
);
check(
  "15. the catalog is the ONLY name authority — nothing else can produce a resolved name",
  /const match = input\.findRestaurant\(restaurantId\);/.test(presentation) &&
    /kind: "resolved",\s*\r?\n?\s*restaurantName: match\.name,/.test(presentation)
);
check(
  "16. no restaurant context resolves to an explicit 'none', never to a fabricated name",
  /if \(!restaurantId\) return NONE;/.test(presentation)
);
check(
  // MI-E-C5-R7-C2a: the reused model is now the CANONICAL nested CatalogRestaurantViewModel — the
  // same one useRestaurantCatalog.findRestaurantById already returns — instead of the flattened
  // RestaurantCardViewModel. The invariant is unchanged: exactly one catalog source, never a second.
  "17. the resolver reuses the existing catalog view model rather than a second source",
  /import type \{ CatalogRestaurantViewModel \} from "\.\/types";/.test(presentation) &&
    !/RestaurantCardViewModel/.test(presentationCode) &&
    !/mockRepository|MockRestaurantCatalogRepository/.test(presentation)
);

// ---------- Today Intake ----------
check(
  "18. Today Intake no longer assigns restaurantId to restaurantName",
  !/restaurantName: firstItem\?\.restaurantId/.test(todayIntake)
);
check(
  "19. Today Intake still keeps the canonical id in its own field",
  /restaurantId: firstItem\?\.restaurantId \?\? undefined/.test(todayIntake)
);
check(
  "20. Today Intake fabricates no name while the catalog composition is still deferred",
  /restaurantName: "",/.test(todayIntake) && !/好初健康碗|Development/.test(todayIntake)
);

// ---------- deferred scope must stay deferred ----------
check(
  // MI-E-C5-R7-B1 successor-compatible locator. R7-A's real invariant was never "no restaurant
  // anything in the payload" — it was that no restaurant NAME or display snapshot may become
  // durable payload. R7-B1 deliberately makes the canonical IDS durable, so the check now allows
  // exactly the ID-only spelling and still fails on any name/snapshot field. A payload layer that
  // re-acquired a display name would fail here just as it did before.
  "21. the finalization draft carries restaurant IDS ONLY — never a name or display snapshot",
  !/restaurantName|restaurantDisplayName|branchName|displayName/.test(finalizationDraft) &&
    (!/restaurantId|branchId/.test(finalizationDraft) ||
      (/restaurantId: string \| null;/.test(finalizationDraft) &&
        /branchId: string \| null;/.test(finalizationDraft)))
);
check(
  "22. the finalization hook payload path carries restaurant IDS ONLY — never a name or snapshot",
  !/restaurantName|restaurantDisplayName|branchName|displayName/.test(finalizationHook) &&
    (!/restaurantId|branchId/.test(finalizationHook) ||
      (/input\.context\.restaurantId/.test(finalizationHook) &&
        /input\.context\.branchId/.test(finalizationHook)))
);
check(
  "23. R7-A adds no user-facing restaurant selector CTA",
  !/選擇餐廳/.test(screen)
);
check(
  "24. R7-A adds no migration and no backend/shared diff",
  git(["diff", "--name-only", "--", "supabase", "packages"]).stdout.trim() === ""
);

// ---------- catalog source ----------
check(
  "25. supabase remains an exact legal catalog source and mock is not forced",
  /const sources = new Set<RestaurantCatalogSource>\(\["disabled", "mock", "supabase"\]\);/.test(catalogFlags)
);

// ---------- hygiene ----------
check(
  "26. no new dependency and no physical-device PASS claim",
  Object.keys(mobilePackage.dependencies ?? {}).length === MI_E_C5_R7_A_EXPECTED_MOBILE_DEPENDENCY_COUNT &&
    !/physical[^\n]{0,40}PASS/i.test(sessionStore) &&
    !/physical[^\n]{0,40}PASS/i.test(presentation)
);
check(
  "27. .env.local is never tracked by git",
  git(["ls-files", "--error-unmatch", ".env.local"]).status !== 0
);

// ---------------------------------------------------------------------------
// MI-E-C5-R7-A-R1 — the untrusted snapshot bridge is GONE, and the legacy free-text
// restaurantName field is sealed inside the non-C5 flow. These pin both.
// ---------------------------------------------------------------------------
const finalizationAdapter = read("apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts");
const v3Contract = read("apps/mobile/features/meal-identification-finalization/v3Contract.ts");

check(
  "28. R1 the canonical session context is IDs only — no display-name field survives",
  !/^\s*restaurantDisplayName:/m.test(sessionStore) &&
    /export type AnalysisRestaurantContext = Readonly<\{\s*\r?\n?\s*restaurantId: string \| null;\s*\r?\n?\s*branchId: string \| null;\s*\r?\n?\}>;/.test(sessionStore)
);
check(
  "29. R1 the normalizer accepts no display name / snapshot input",
  /export function normalizeAnalysisRestaurantContext\(\s*\r?\n?\s*input: Readonly<\{\s*\r?\n?\s*restaurantId\?: string \| null;\s*\r?\n?\s*branchId\?: string \| null;\s*\r?\n?\s*sourceContext: MealSourceContext;\s*\r?\n?\s*\}>\s*\r?\n?\s*\): AnalysisRestaurantContext \{/.test(sessionStore)
);
check(
  "30. R1 the capture handoff accepts no display name / snapshot input",
  /restaurantContext: Readonly<\{\s*\r?\n?\s*restaurantId\?: string \| null;\s*\r?\n?\s*branchId\?: string \| null;\s*\r?\n?\s*\}> = EMPTY_ANALYSIS_RESTAURANT_CONTEXT/.test(sessionStore)
);
check(
  "31. R1 the session mutator accepts no display name / snapshot input",
  /export function setAnalysisRestaurantContext\(\s*\r?\n?\s*input: Readonly<\{\s*\r?\n?\s*restaurantId\?: string \| null;\s*\r?\n?\s*branchId\?: string \| null;\s*\r?\n?\s*\}>,/.test(sessionStore)
);
check(
  "32. R1 the resolver has NO caller-supplied name parameter at all",
  (() => {
    // Scope the negative assertions to the ACTUAL parameter list, so explanatory prose about the
    // removed snapshot cannot satisfy or break this check.
    const start = presentation.indexOf("export function resolveRestaurantContextPresentation(");
    if (start < 0) return false;
    const open = presentation.indexOf("input: Readonly<{", start);
    const close = presentation.indexOf("}>", open);
    if (open < 0 || close < 0) return false;
    const params = presentation.slice(open, close);
    return (
      /restaurantId: string \| null;/.test(params) &&
      /branchId\?: string \| null;/.test(params) &&
      /catalogStatus: RestaurantCatalogLookupStatus;/.test(params) &&
      // MI-E-C5-R7-C2a: canonical nested lookup result; the parameter list is otherwise unchanged.
      /findRestaurant: \(restaurantId: string\) => CatalogRestaurantViewModel \| null;/.test(params) &&
      // No parameter through which a caller could inject a name.
      !/[Dd]isplayName/.test(params) &&
      !/snapshot/i.test(params) &&
      !/name\s*\??\s*:\s*string/i.test(params)
    );
  })()
);
check(
  "33. R1 a non-authoritative catalog can NEVER return resolved",
  /if \(input\.catalogStatus === "loading" \|\| input\.catalogStatus === "idle"\) return LOADING;/.test(presentation) &&
    /if \(input\.catalogStatus !== "success"\) return UNRESOLVED;/.test(presentation)
);
check(
  "34. R1 a catalog miss returns unresolved with no fallback name",
  /if \(!match \|\| !isDisplayableRestaurantName\(match\.name\)\) return UNRESOLVED;/.test(presentation) &&
    /const UNRESOLVED: RestaurantContextPresentation = Object\.freeze\(\{\s*\r?\n?\s*kind: "unresolved",\s*\r?\n?\s*restaurantName: null,/.test(presentation)
);
check(
  "35. R1 the only non-null restaurantName the resolver can ever emit is the catalog record's",
  (() => {
    // Every `restaurantName:` occurrence must be the type declaration, an explicit null, or the
    // single catalog-sourced assignment. Any other producer would be a new name authority.
    const occurrences = presentation.match(/restaurantName:[^\n]*/g) ?? [];
    const declaration = occurrences.filter((line) => /restaurantName: string \| null;/.test(line)).length;
    const nulls = occurrences.filter((line) => /restaurantName: null,?/.test(line)).length;
    const fromCatalog = occurrences.filter((line) => /restaurantName: match\.name,/.test(line)).length;
    return declaration === 1 && fromCatalog === 1 && declaration + nulls + fromCatalog === occurrences.length;
  })()
);
check(
  // MI-E-C5-R7-C2a: the ownership invariant is unchanged — a branch name may only come from a branch
  // that genuinely belongs to this restaurant — but it is now enforced against the CANONICAL nested
  // branches by exact durable id, and the displayed value is the branch's own `name`. The previous
  // spelling compared the flattened card's single `branchId` and rendered `location` (a DISTRICT),
  // so only the mapper's first branch could ever match and even that showed the wrong field.
  "36. R1 a branch name is only used when the branch genuinely belongs to that restaurant",
  /match\.branches\.find\(\(candidate\) => candidate\.branchId === input\.branchId\)/.test(presentation) &&
    /const branchName = branch && isDisplayableRestaurantName\(branch\.name\) \? branch\.name : null;/.test(presentation) &&
    // No district/address/flattened-location substitute and no positional fallback. Scoped to
    // EXECUTABLE source: the module's comments name those very fields while explaining why they are
    // no longer used, and prose must not be able to fail a check about the code.
    !/branchName[\s\S]{0,200}?(match\.location|\.district|\.address|branches\[0\])/.test(presentationCode) &&
    !/branches\[0\]/.test(presentationCode) &&
    !/match\.location/.test(presentationCode)
);
check(
  "37. R1 legacy restaurantName carries an explicit deprecation boundary",
  /@deprecated Legacy non-AI-finalization analysis flow only\./.test(sessionStore) &&
    /not written by any restaurant-context mutator/.test(sessionStore)
);
check(
  "38. R1 legacy restaurantName is never written by a restaurant-context mutator, and the resolver touches no session state",
  // Nothing from the canonical normalizer onwards may assign the legacy free-text field.
  !/session\.restaurantName\s*=/.test(
    sessionStore.slice(sessionStore.indexOf("export function normalizeAnalysisRestaurantContext"))
  ) &&
    // The resolver is pure presentation: it never reads or writes the session store at all.
    !/session\./.test(presentation) &&
    !/analysisSessionStore/.test(presentation)
);
check(
  "39. R1 legacy restaurantName never enters the C5 v3 finalization draft, command or fingerprint",
  !/restaurantName/.test(finalizationDraft) && !/restaurantName/.test(v3Contract)
);
check(
  "40. R1 every remaining legacy restaurantName render sits behind !hasAiFinalizationFlow",
  // The four analysis.tsx components that consume analysis.restaurantName (directly, or via the
  // candidateResolution memo built from it) render only in the legacy non-AI UI generation. Each
  // render gate is asserted verbatim, so deleting or loosening any one of them fails this check.
  /\{!hasAiFinalizationFlow && analysis\.isSelfCooked \? \(\s*\r?\n?\s*<SelfCookedIntro/.test(screen) &&
    /\) : !hasAiFinalizationFlow && isAnalysisConfirmed \? \(\s*\r?\n?\s*<CompletedAnalysisHero/.test(screen) &&
    /\) : !hasAiFinalizationFlow \? \(\s*\r?\n?\s*<ExternalDiningAnalysis/.test(screen) &&
    /\{!hasAiFinalizationFlow && !analysis\.isSelfCooked && analysis\.matchState === "editing" \? \(\s*\r?\n?\s*<CandidateCorrectionList/.test(screen) &&
    // The legacy adapter still declares the field, confirming this check is guarding a live surface.
    /restaurantName: string;/.test(finalizationAdapter)
);


// ==========================================================================================
// MI-E-C5-R7-B1-R1 §九: v3Contract.ts is NOT blanket-trusted just because R7-B1 is allowed to
// extend it. This projection compares the candidate against HEAD region by region: every part of
// the contract that this guard's era froze must be byte-identical, and only the authorized
// restaurant extension may be new. An unauthorized change to the version string, to any original
// command field, to mealWrite/nutrition shape, to the limits, or to the scalar validation lines
// fails here — path exclusion alone would have let all of those through.
// ==========================================================================================
const V3_CONTRACT_RELATIVE = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
function v3ContractOnlyGainedAuthorizedRestaurantExtension() {
  const headResult = spawnSync("git", ["show", `HEAD:${V3_CONTRACT_RELATIVE}`], { cwd: root, encoding: "utf8" });
  if (headResult.status !== 0) return false;
  const headText = headResult.stdout ?? "";
  const diskText = fs.readFileSync(path.join(root, V3_CONTRACT_RELATIVE), "utf8");
  if (!headText) return false;

  const slice = (text, from, to) => {
    const start = text.indexOf(from);
    if (start < 0) return null;
    if (to === null) return text.slice(start);
    const end = text.indexOf(to, start + from.length);
    return end < 0 ? null : text.slice(start, end);
  };
  // The scalar-field validation block ends at whichever declaration follows it — HEAD goes
  // straight to mealWrite, the candidate inserts the restaurant validator first.
  const scalarValidation = (text) => {
    const start = text.indexOf("if (!input.analysisRequestId");
    if (start < 0) return null;
    const ends = ["const mealWrite = validateMealWrite", "const restaurant = validateRestaurantContext"]
      .map((marker) => text.indexOf(marker, start))
      .filter((index) => index > 0);
    return ends.length ? text.slice(start, Math.min(...ends)) : null;
  };

  const FROZEN_REGIONS = [
    // version constant + nutrition + mealWrite input shape
    ["export const MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION", "export type MealIdentificationFinalizationV3Input"],
    // error codes, result type, every limit and the source-context/nutrition vocabularies
    ["export type MealIdentificationFinalizationV3ErrorCode", "export function buildMealIdentificationFinalizationV3"],
    // the whole mealWrite/nutrition validator
    ["function validateMealWrite(", "function success<T>"],
    // result helpers
    ["function success<T>", null]
  ];
  for (const [from, to] of FROZEN_REGIONS) {
    const headRegion = slice(headText, from, to);
    const diskRegion = slice(diskText, from, to);
    if (headRegion === null || diskRegion === null || headRegion !== diskRegion) return false;
  }
  const headScalar = scalarValidation(headText);
  if (headScalar === null || headScalar !== scalarValidation(diskText)) return false;

  // No restaurant NAME or display snapshot may ever exist in the durable command layer.
  if (/restaurantName|restaurantDisplayName|branchName|displayName/.test(diskText)) return false;

  // The only new top-level declarations may be the authorized restaurant extension.
  const declarations = (text) => text.match(/^(?:export )?(?:function|type|const) \w+/gm) ?? [];
  const headDeclarations = new Set(declarations(headText));
  const AUTHORIZED_ADDITIONS = new Set([
    "export type MealIdentificationFinalizationV3RestaurantContext",
    "function validateRestaurantContext",
    "function blankToNull"
  ]);
  const added = declarations(diskText).filter((entry) => !headDeclarations.has(entry));
  if (!added.every((entry) => AUTHORIZED_ADDITIONS.has(entry))) return false;

  // And every original declaration must still exist.
  const diskDeclarations = new Set(declarations(diskText));
  return [...headDeclarations].every((entry) => diskDeclarations.has(entry));
}

check(
  "v3Contract.ts gained ONLY the authorized R7-B1 restaurant extension (frozen regions byte-identical to HEAD)",
  v3ContractOnlyGainedAuthorizedRestaurantExtension()
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  phase: "MI-E-C5-R7-A Canonical Restaurant Context Foundation and Safety Cleanup Guard",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  physicalDeviceUsed: false
}, null, 2));
if (failed.length) process.exitCode = 1;
