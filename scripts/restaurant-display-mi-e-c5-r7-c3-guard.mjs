#!/usr/bin/env node
// MI-E-C5-R7-C3 static guard — Today Intake live restaurant/branch presentation composition.
// Lifecycle-aware: content authorities and subset diagnostics pass both before and after freeze.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).stdout ?? "";
const stripComments = (source) =>
  source.split("\n").filter((line) => {
    const value = line.trim();
    return !value.startsWith("//") && !value.startsWith("/*") && !value.startsWith("*") && !value.startsWith("{/*");
  }).join("\n");
const trackedTreeDigest = (relative) => {
  const files = git(["ls-files", "-z", "--", relative]).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    // Attribute-aware blob identity makes this authority independent of checkout CRLF/LF settings
    // while still hashing the actual worktree content (an unstaged semantic edit changes the oid).
    const oid = git(["hash-object", "--path", file, file]).trim();
    hash.update(file);
    hash.update("\0");
    hash.update(oid);
  }
  return hash.digest("hex");
};

const SCREEN = "apps/mobile/app/today-intake.tsx";
const UI_MODEL = "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts";
const C2A_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const C2B_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs";
const C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const R7A_GUARD = "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs";
const R7A_SMOKE = "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs";
const R2_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs";
const GUARD = "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs";
const SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c3-smoke.mjs";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const MAPPER = "apps/mobile/features/restaurants/catalog/mapper.ts";
const CATALOG_TYPES = "apps/mobile/features/restaurants/catalog/types.ts";
const ANALYSIS = "apps/mobile/app/analysis.tsx";
const SELECTOR = "apps/mobile/app/restaurants.tsx";
const CAPTURE = "apps/mobile/app/meal-photo.tsx";
const HANDOFF = "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts";
const SESSION = "apps/mobile/features/analysis/analysisSessionStore.ts";
const V3 = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const FINALIZATION_HOOK = "apps/mobile/features/analysis/useMealPhotoFinalization.ts";
const FINALIZATION_DRAFT = "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts";
const SAVED_MEAL_TYPES = "apps/mobile/features/analysis/types.ts";
const MEAL_RECORD_STORE = "apps/mobile/features/analysis/analysisMealRecordStore.ts";
const CALORIE_SHARING_IMPORT = "apps/mobile/features/calorie-sharing/ImportGroupCaloriesToToday.tsx";
const CANDIDATE_MANIFEST = Object.freeze([
  SCREEN, UI_MODEL, C2A_GUARD, C2B_GUARD, C1_GUARD, R2_GUARD, GUARD, SMOKE
]);

const FROZEN = Object.freeze({
  [RESOLVER]: "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  [MAPPER]: "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  [CATALOG_TYPES]: "b67d98a9c2de1a929bd494dd176f8b69d3cbd0288a4df1947f406da094ebe98c",
  [ANALYSIS]: "0c3488138597249ca15506db65cb7d4aaa3a88ca1c041dd9aa912acc1b6c5cd2",
  [SELECTOR]: "30f53812245508f4d7664c5e15e9b530349565dd8a81dc169371c8108ddf0cce",
  [CAPTURE]: "dccf608fa3dcec88e20a9245cc5b1a9d95b658c043c6a1a93acc8cd444f8395a",
  [HANDOFF]: "7189d67ede2528337dd40f154e080f2fa1fcf3a38582c8d330e03b0bb302e05e",
  [SESSION]: "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  [V3]: "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  [FINALIZATION_HOOK]: "7d4178645730060d81fe7845ecefd682bc51ad9c76e9fcdf3ded780b269678ae",
  [FINALIZATION_DRAFT]: "6134780ad5bfb7d32fc18899d3068de77fdd5739f71cb3247f7cd47e1a56d66e",
  [SAVED_MEAL_TYPES]: "968ac60b914cf889459012b0ee22e4334b6aceb237879c985b17697ad34d74c1",
  [MEAL_RECORD_STORE]: "514a91ceba5cb4f7341f898168d1b4ab2aa78b78d0503344b503e220f4196561",
  [CALORIE_SHARING_IMPORT]: "d842f8090c772c4411ec22ab28927c39542b21139f88c0b1ae69ad9b798e66d1",
  [R7A_GUARD]: "3740e2532b5c7a3bc6228a352833b3ca378fc1422de59efda620eb33e79e5100",
  [R7A_SMOKE]: "2bb570c4862970dacc6ac6d24b1b829524f07f26ba6377d4dfd7d5ef9d2f00fd",
  "scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs": "6596c470fcb856346dfe926269e7a1ee47d1541508f902ead4f850143191ac86",
  "scripts/restaurant-display-mi-e-c5-r7-c2b-smoke.mjs": "172ea122c073b78d7396ba02303b2e2ee3aeea0d63e8fae374b5c36d71fa215d",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-guard.mjs": "86972f1e557d20faa1f048d6e81f4698fe9940332f16cddf607c343250ce4f83",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs": "26d1937ed53c5eb49b6c4b34867a0456400de214fdc8fec8831f900f520d324c",
  "scripts/restaurant-selection-mi-e-c5-r7-c1-smoke.mjs": "326baa9c891549169f961d3989148b904c9b51774346d2e04c3a860cddf373d9",
  "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs": "e500c138278fb97270f60faa9399889aa6a3c44cd8f8197cdf58a4920720bddb",
  "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs": "2478dfbf84ab7b3dbdc74346872b0b3a9aa87f9332b964fe9f8d2f0869521ce0",
  "scripts/consumer-public-restaurant-catalog-smoke.mjs": "310f3a866a48b776ed9d8329c03d37be15036dd1f54831f330c0e638a7b2e314"
});
const C3_PRODUCTION = Object.freeze({
  [SCREEN]: "d50a4cafb3613c4332ee8f6a356d6515e32082080750fdbf93a6f2aa4e323548",
  [UI_MODEL]: "aa17c6d13dab8d3975859ee385c068b22ba3d39da562f9a70e31ab4352352c29"
});

const screen = read(SCREEN);
const screenCode = stripComments(screen);
const model = read(UI_MODEL);
const modelCode = stripComments(model);
const c2a = read(C2A_GUARD);
const c2b = read(C2B_GUARD);
const c1 = read(C1_GUARD);
const r7aGuard = read(R7A_GUARD);
const r7aSmoke = read(R7A_SMOKE);
const r2 = read(R2_GUARD);
const smoke = read(SMOKE);
const ast = ts.createSourceFile(SCREEN, screen, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callCount = (name) => {
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return count;
};
const callCountIn = (source, name, kind = ts.ScriptKind.TSX) => {
  const tree = ts.createSourceFile("mutation.tsx", source, ts.ScriptTarget.Latest, true, kind);
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return count;
};
const legacyRestaurantIdAuthority = (source) =>
  /restaurantId\?: string;/.test(source) &&
  /restaurantId: firstItem\?\.restaurantId \?\? undefined/.test(source) &&
  !/restaurantId: string \| null;/.test(source) &&
  !/restaurantId: firstItem\?\.restaurantId \?\? null/.test(source) &&
  !/restaurantId: firstItem\?\.branchId/.test(source);
const resolverBoundaryAuthority = (source) =>
  /restaurantId: input\.meal\.restaurantId \?\? null/.test(source) &&
  /branchId: input\.meal\.branchId \?\? null/.test(source) &&
  !/restaurantId: input\.meal\.restaurantId[,\n]/.test(source) &&
  !/branchId: input\.meal\.branchId[,\n]/.test(source) &&
  !/restaurantId: input\.meal\.restaurantId \?\? ""/.test(source) &&
  !/branchId: input\.meal\.branchId \?\? ""/.test(source);
const exactEightManifestAuthority = (value) =>
  value.length === 8 && new Set(value).size === 8 &&
  !value.includes(R7A_GUARD) && !value.includes(R7A_SMOKE);

const drift = Object.entries(FROZEN).filter(([file, expected]) => !exists(file) || sha(file) !== expected);
check("1. the exact candidate manifest has eight unique named paths", exactEightManifestAuthority(CANDIDATE_MANIFEST) && CANDIDATE_MANIFEST.every(exists));
check("2. exactly two candidate paths are production source", CANDIDATE_MANIFEST.filter((file) => file.startsWith("apps/")).length === 2 && CANDIDATE_MANIFEST.includes(SCREEN) && CANDIDATE_MANIFEST.includes(UI_MODEL));
check("3. candidate manifest uses no prefix, wildcard, backend or package entry", CANDIDATE_MANIFEST.every((file) => !/\*/.test(file) && !file.startsWith("supabase/") && !file.startsWith("packages/")));
check("4. resolver is byte-identical to frozen authority", sha(RESOLVER) === FROZEN[RESOLVER]);
check("5. mapper is byte-identical to frozen authority", sha(MAPPER) === FROZEN[MAPPER]);
check("6. catalog types are byte-identical to frozen authority", sha(CATALOG_TYPES) === FROZEN[CATALOG_TYPES]);
check("7. Analysis is byte-identical to frozen authority", sha(ANALYSIS) === FROZEN[ANALYSIS]);
check("8. selector, capture and handoff are byte-identical", [SELECTOR, CAPTURE, HANDOFF].every((file) => sha(file) === FROZEN[file]));
check("9. analysis session is byte-identical", sha(SESSION) === FROZEN[SESSION]);
check("10. finalization contract, draft and hook are byte-identical", [V3, FINALIZATION_DRAFT, FINALIZATION_HOOK].every((file) => sha(file) === FROZEN[file]));
check("11. all frozen companion suites are byte-identical", drift.length === 0, drift.map(([file]) => file));
check("12. packages tree matches canonical Git content", trackedTreeDigest("packages") === "24629aa06382a393771d657f8e9c53b1fcebe54ba977b384dde747d742e4934f");
check("13. Edge Functions tree matches canonical Git content", trackedTreeDigest("supabase/functions") === "37f368cf3bc4e1b6d6a70b7b13b4bfde3f8285f61f62de5db63889549ff556de");
check("14. migrations tree matches canonical Git content", trackedTreeDigest("supabase/migrations") === "f9b1f2832a39ecc48766ae004d03a6009c83867b44a1af4027138c7578f04e9e");
check("15. Today Intake production bytes are the exact reviewed C3 content", Object.entries(C3_PRODUCTION).every(([file, expected]) => sha(file) === expected));
check("15a. R7-A guard and smoke are exact HEAD frozen bytes", [R7A_GUARD, R7A_SMOKE].every((file) => sha(file) === FROZEN[file]));
check("15b. SavedMealRecord, analysis store, Analysis and calorie sharing remain exact HEAD bytes", [SAVED_MEAL_TYPES, MEAL_RECORD_STORE, ANALYSIS, CALORIE_SHARING_IMPORT].every((file) => sha(file) === FROZEN[file]));
check("15c. no global required-null SavedMealRecord authority was introduced", /restaurantId\?: string;/.test(read(SAVED_MEAL_TYPES)) && !/restaurantId: string \| null;/.test(read(SAVED_MEAL_TYPES)));

check("16. screen mounts exactly one catalog hook (AST call count)", callCount("useRestaurantCatalog") === 1, callCount("useRestaurantCatalog"));
check("17. screen imports and calls the frozen production resolver", /from "\.\.\/features\/restaurants\/catalog\/restaurantContextPresentation";/.test(screenCode) && callCount("resolveRestaurantContextPresentation") === 1);
check("18. UI model never imports or calls the resolver", !/restaurantContextPresentation|resolveRestaurantContextPresentation|useRestaurantCatalog/.test(modelCode));
check("19. UI model preserves legacy optional restaurantId presentation compatibility", legacyRestaurantIdAuthority(modelCode));
check("20. UI model exposes nullable branchId", /branchId: string \| null;/.test(model));
check("21. branchId comes exactly from the canonical first item", /branchId: firstItem\?\.branchId \?\? null/.test(modelCode));
check("22. UI model never derives branchId from restaurantId or a name", !/branchId:\s*(?:firstItem\?\.)?restaurantId|branchId:\s*restaurantName/.test(modelCode));
check("23. restaurantName remains a display placeholder, never an ID", /restaurantName: ""/.test(modelCode) && !/restaurantName:\s*firstItem\?\.restaurantId/.test(modelCode));
check("24. status adapter is an exhaustive switch", /switch \(status\)/.test(screenCode) && /const exhaustiveStatus: never = status/.test(screenCode));
check("25. loading/success/empty status mappings are exact", /case "loading":\s*return "loading"/.test(screenCode) && /case "success":\s*case "empty":\s*return "success"/.test(screenCode));
check("26. error/unavailable mappings fail soft", /case "error":\s*return "error"/.test(screenCode) && /case "unavailable":\s*return "disabled"/.test(screenCode));
check("27. completed rows are composed in one memoized map", callCount("useMemo") === 1 && /\(model\?\.mealRecords \?\? \[\]\)\.map/.test(screenCode));
check("28. resolver boundary normalizes both absent IDs to null and preserves catalog lookup", resolverBoundaryAuthority(screenCode) && /findRestaurant: input\.findRestaurant/.test(screenCode));
check("29. composition preserves the original meal object", /return Object\.freeze\(\{ meal: input\.meal, restaurantPresentation \}\)/.test(screenCode));
check("30. no display name is assigned into a meal or domain object", !/(?:meal|input\.meal)\.(?:restaurantName|branchName)\s*=/.test(screenCode));
check("31. screen never performs parallel branch lookup or positional fallback", !/\.branches\b|branches\[0\]|branches\.at\(/.test(screenCode));
check("32. screen never uses district, location or address as a branch name", !/\.district\b|\.location\b|\.address\b/.test(screenCode));
check("33. generic/unresolved display uses existing fallback", /if \(presentation\.restaurantName === null\) return fallback/.test(screenCode));
check("34. restaurant-only omits branch separator", /presentation\.branchName === null\s*\? presentation\.restaurantName/.test(screenCode));
check("35. valid branch output consumes resolver branchName", /`\$\{presentation\.restaurantName\}｜\$\{presentation\.branchName\}`/.test(screenCode));
check("36. catalog state cannot replace the page model or mark intake read failed", !/restaurantCatalog\.state\.status\s*===\s*"(?:loading|error|unavailable)"\s*\?\s*<PlaceholderScreen/.test(screenCode));
check("37. catalog refresh is never invoked during render", !/restaurantCatalog\.refresh\s*\(/.test(screenCode));
check("38. planned meals keep their snapshot display field", /plan\.restaurantName \|\| "餐廳未提供"/.test(screenCode) && !/plannedMeals\.map[\s\S]{0,500}?restaurantPresentation/.test(screenCode));
check("39. display fields cannot enter frozen v3 command", !/restaurantName|branchName|displayName/.test(read(V3)));
check("40. live-name boundary comment is adjacent to the resolver composition", /Durable restaurant\/branch IDs come from the meal record; names are composed live from the current catalog\.\s*\r?\n\s*const restaurantPresentation = resolveRestaurantContextPresentation/.test(screen));

const callers = git(["grep", "-l", "resolveRestaurantContextPresentation", "--", "apps/", "packages/"])
  .split("\n").map((file) => file.trim().replaceAll("\\", "/")).filter(Boolean).sort();
check("41. resolver caller set is exactly resolver + Analysis + Today Intake", JSON.stringify(callers) === JSON.stringify([RESOLVER, ANALYSIS, SCREEN].sort()), callers);
check("42. no UI model, planned-meal, selector, capture, handoff, package or web caller exists", ![UI_MODEL, SELECTOR, CAPTURE, HANDOFF].some((file) => callers.includes(file)) && !callers.some((file) => /planned-meal|packages\/|admin-web|restaurant-web/.test(file)));
const c2aSuccessorAuthority = (source) =>
  /const CALLER_STATE_FROZEN = \[RESOLVER\]\.sort\(\);/.test(source) &&
  /const CALLER_STATE_C2B = \[RESOLVER, ANALYSIS_SCREEN\]\.sort\(\);/.test(source) &&
  /const CALLER_STATE_C3 = \[RESOLVER, ANALYSIS_SCREEN, TODAY_INTAKE_SCREEN\]\.sort\(\);/.test(source) &&
  /productionCallers\.filter\(\(entry\) => entry !== RESOLVER\)\.length <= 2/.test(source) &&
  /entry === RESOLVER \|\| entry === ANALYSIS_SCREEN \|\| entry === TODAY_INTAKE_SCREEN/.test(source) &&
  /C3_SUCCESSOR_MANIFEST\.length === 8/.test(source) &&
  !/CALLER_STATE_(?:ANY|WILDCARD)|productionCallers\.every\(\(\) => true\)|\btrue\s*\|\|/.test(source);
const c2bSuccessorAuthority = (source) =>
  /C3_SUCCESSOR_MANIFEST\.length === 8/.test(source) &&
  /C3 has exactly two named production screen callers/.test(source) &&
  /JSON\.stringify\(resolverCallers\) === JSON\.stringify\(\[RESOLVER, SCREEN, TODAY_INTAKE_SCREEN\]\.sort\(\)\)/.test(source) &&
  !/C3_SUCCESSOR_MANIFEST\.some\(\(entry\) => entry\.startsWith/.test(source);
const c1SuccessorAuthority = (source) =>
  /R7_C3_SUCCESSOR_MANIFEST\.length === 8/.test(source) &&
  /only Today Intake production/.test(source) &&
  /R7_C3_SUCCESSOR_MANIFEST\.filter\(\(entry\) => entry\.startsWith\("apps\/"\)\)\.length === 2/.test(source);
check("43. C2a guard declares only the exact three caller lifecycle states", c2aSuccessorAuthority(c2a));
check("44. C2b guard admits only the exact C3 Today Intake successor", c2bSuccessorAuthority(c2b));
check("45. R7-C1 guard carries the exact C3 eight-path manifest", c1SuccessorAuthority(c1));
const r2Allowlist = (() => {
  const start = r2.indexOf("const ALLOWED_APP_SCREENS = new Set([");
  const end = r2.indexOf("]);", start);
  return start < 0 || end < 0 ? "" : r2.slice(start, end);
})();
const r2Screens = r2Allowlist.match(/"apps\/mobile\/app\/[a-zA-Z0-9._-]+"/g) ?? [];
const r2Authority = (source) => {
  const start = source.indexOf("const ALLOWED_APP_SCREENS = new Set([");
  const end = source.indexOf("]);", start);
  if (start < 0 || end < 0) return false;
  const body = stripComments(source.slice(start, end));
  const entries = body.match(/"apps\/mobile\/app\/[a-zA-Z0-9._-]+"/g) ?? [];
  return entries.length === 4 && new Set(entries).size === 4 &&
    [ANALYSIS, CAPTURE, SELECTOR, SCREEN].every((file) => entries.includes(`"${file}"`)) &&
    !/\*|startsWith\(|RegExp|\.\.\./.test(body);
};
check("46. R2 allowlist is exactly Analysis, meal-photo, restaurants and Today Intake", r2Authority(r2));
check("47. R2 fail-closed predicate and backend fences remain", /!ALLOWED_APP_SCREENS\.has\(entry\)/.test(r2) && /FORBIDDEN_SUCCESSOR_PREFIXES/.test(r2));
check("48. C3 smoke distinguishes legacy UI undefined from resolver-boundary null", /loadTsModule\(RESOLVER\)/.test(smoke) && /loadTsModule\(V3\)/.test(smoke) && /getCurrentUserTodayIntakeUiModel/.test(smoke) && /generic\.restaurantId === undefined && generic\.branchId === null/.test(smoke) && /observedResolverInputs/.test(smoke) && /restaurantId === null && genericResolverInput\.branchId === null/.test(smoke) && /Q completed-meal/.test(smoke));

const worktree = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
// MI-E-C5-R7-C4-R1 successor manifest — the exact thirteen paths of the round that repairs live
// Supabase consumer client composition (Catalog/Favorites/Ratings passed raw Phase 1D flags into the
// client factory and silently degraded to disabled repositories) and the Development Mobile
// launcher env gap. Named individually, never a prefix, so a fourteenth path still fails. It touches
// no Today Intake, resolver or finalization surface, which is why C3's own authority is unaffected.
const C4_R1_SUCCESSOR_MANIFEST = Object.freeze([
  "apps/mobile/features/consumer-auth/liveClientCompositionFlags.ts",
  "apps/mobile/features/consumer-auth/index.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/restaurants/catalog/composition.ts",
  "apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts",
  "apps/mobile/features/consumer-ratings/consumerRatingComposition.ts",
  "scripts/start-mobile.mjs",
  "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs",
  "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-smoke.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs",
  "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs"
]);
const outside = worktree.filter((file) => !CANDIDATE_MANIFEST.includes(file));
const outsideC4R1 = worktree.filter((file) => !C4_R1_SUCCESSOR_MANIFEST.includes(file));
check("49. uncommitted state is a subset of the exact manifest; clean committed state also passes", outside.length === 0 || outsideC4R1.length === 0, { worktreeEntries: worktree.length, outside, outsideC4R1 });
check("49a. the C4-R1 successor manifest is exactly thirteen named paths, never a prefix", C4_R1_SUCCESSOR_MANIFEST.length === 13 && new Set(C4_R1_SUCCESSOR_MANIFEST).size === 13 && C4_R1_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) && !C4_R1_SUCCESSOR_MANIFEST.some((entry) => entry.includes("todayIntakeUiModel") || entry.includes("app/today-intake") || entry.includes("restaurantContextPresentation")));
check("50. no candidate file contains remote-operation implementation", CANDIDATE_MANIFEST.every((file) => !/createClient\s*\(|functions\.invoke\s*\(|\.rpc\s*\(|\bfetch\s*\(|supabase\s+(?:db|functions|migration)\s+push/.test(stripComments(read(file)))));
const secretPatterns = [new RegExp(["ey", "J[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}"].join("")), new RegExp(["sb", "p_[A-Za-z0-9]{16,}"].join("")), new RegExp(["service", "_role[\"'\\s:=]+[A-Za-z0-9_-]{12,}"].join(""))];
check("51. no candidate file contains an actual secret", CANDIDATE_MANIFEST.every((file) => !secretPatterns.some((pattern) => pattern.test(read(file)))));
const guardCode = stripComments(read(GUARD));
check("52. guard has no unconditional pass or skip escape hatch", !/process\.env\.[A-Z_]*(?:SKIP|BYPASS|FORCE|DISABLE)|\|\|\s*true\b|check\([^,]+,\s*true\s*\)/.test(guardCode));
check("53. guard has no specific-commit bypass", !new RegExp(["rev", "-parse|\\bHEAD[~^]"].join("")).test(guardCode));
check("54. guard is lifecycle-aware, never requiring modified or untracked membership", !/worktree\.includes\(|untracked\.includes\(|worktree\.length\s*===\s*8/.test(guardCode) && /outside\.length === 0/.test(guardCode));
check("55. guard failure path is active", /if \(failed\.length\) process\.exit\(1\);/.test(read(GUARD)));
check("56. guard execution leaves staged state empty", git(["diff", "--cached", "--name-only"]).trim() === "");

// Mandatory mutation proof. Each mutation must change its fixture and make the targeted authority
// predicate false; a no-op transform or unrelated harness failure is never counted as killed.
const mutations = [];
const mutation = (name, original, mutate, authority) => {
  const changed = mutate(original);
  const applied = changed !== original;
  const killed = applied && !authority(changed);
  mutations.push({ name, applied, killed });
  check(`mutation ${name} is killed by its targeted authority`, killed, { applied });
};
const screenDigestAuthority = (source) => createHash("sha256").update(source).digest("hex") === C3_PRODUCTION[SCREEN];
const modelDigestAuthority = (source) => createHash("sha256").update(source).digest("hex") === C3_PRODUCTION[UI_MODEL];
const oneHookAuthority = (source) => callCountIn(source, "useRestaurantCatalog") === 1;
const resolverCallAuthority = (source) => callCountIn(source, "resolveRestaurantContextPresentation") === 1;
const noParallelBranchAuthority = (source) => !/\.branches\b|branches\[0\]|branches\.at\(/.test(stripComments(source));
const noLocationAuthority = (source) => !/\.district\b|\.location\b|\.address\b/.test(stripComments(source));
const noMealNameWriteAuthority = (source) => !/(?:meal|input\.meal)\.(?:restaurantName|branchName)\s*=/.test(stripComments(source));
const plannedSnapshotAuthority = (source) => /plan\.restaurantName \|\| "餐廳未提供"/.test(stripComments(source));
const failSoftAuthority = (source) => {
  const code = stripComments(source);
  return !/restaurantCatalog\.state\.status\s*===\s*"(?:loading|error|unavailable)"\s*\?\s*<PlaceholderScreen/.test(code) &&
    !/if\s*\(restaurantCatalog\.state\.status\s*===\s*"(?:loading|error|unavailable)"\)\s*return\s*<PlaceholderScreen/.test(code);
};

mutation("01 UI model drops branchId", model, (s) => s.replace("  branchId: string | null;\n", ""), (s) => /branchId: string \| null;/.test(s));
mutation("02 branchId reads restaurantId", model, (s) => s.replace("branchId: firstItem?.branchId ?? null", "branchId: firstItem?.restaurantId ?? null"), (s) => /branchId: firstItem\?\.branchId \?\? null/.test(s));
mutation("03 catalog hook removed", screen, (s) => s.replace("  const restaurantCatalog = useRestaurantCatalog();\n", ""), oneHookAuthority);
mutation("04 second catalog hook added", screen, (s) => s.replace("  const restaurantCatalog = useRestaurantCatalog();", "  const restaurantCatalog = useRestaurantCatalog();\n  useRestaurantCatalog();"), oneHookAuthority);
mutation("05 resolver call removed", screen, (s) => s.replace("resolveRestaurantContextPresentation({", "Object.freeze({"), resolverCallAuthority);
mutation("06 UI model calls resolver", model, (s) => `${s}\nresolveRestaurantContextPresentation({});\n`, (s) => !/resolveRestaurantContextPresentation/.test(stripComments(s)));
mutation("07 screen performs branches.find", screen, (s) => s.replace("const restaurantPresentation =", "input.findRestaurant(input.meal.restaurantId ?? \"\")?.branches.find(() => true);\n  const restaurantPresentation ="), noParallelBranchAuthority);
mutation("08 screen uses branches[0]", screen, (s) => s.replace("const restaurantPresentation =", "input.findRestaurant(input.meal.restaurantId ?? \"\")?.branches[0];\n  const restaurantPresentation ="), noParallelBranchAuthority);
mutation("09 screen uses district", screen, (s) => s.replace("return presentation.branchName === null", "presentation.restaurantName?.district;\n  return presentation.branchName === null"), noLocationAuthority);
mutation("10 screen uses location", screen, (s) => s.replace("return presentation.branchName === null", "presentation.restaurantName?.location;\n  return presentation.branchName === null"), noLocationAuthority);
mutation("11 screen uses address", screen, (s) => s.replace("return presentation.branchName === null", "presentation.restaurantName?.address;\n  return presentation.branchName === null"), noLocationAuthority);
mutation("12 restaurant-only invents first branch", screen, (s) => s.replace("? presentation.restaurantName", "? `${presentation.restaurantName}｜first-branch`"), screenDigestAuthority);
mutation("13 missing branch falls back first", screen, (s) => s.replace("branchId: input.meal.branchId ?? null", "branchId: input.meal.branchId ?? \"first-branch\""), screenDigestAuthority);
mutation("14 generic meal shows fake restaurant", screen, (s) => s.replace("if (presentation.restaurantName === null) return fallback;", "if (presentation.restaurantName === null) return \"假餐廳\";"), (s) => /if \(presentation\.restaurantName === null\) return fallback/.test(stripComments(s)));
mutation("15 loading replaces meal list", screen, (s) => s.replace("if (!model) {", "if (restaurantCatalog.state.status === \"loading\") return <PlaceholderScreen />;\n  if (!model) {"), failSoftAuthority);
mutation("16 catalog error blocks Today Intake", screen, (s) => s.replace("if (!model) {", "if (restaurantCatalog.state.status === \"error\") return <PlaceholderScreen />;\n  if (!model) {"), failSoftAuthority);
mutation("17 display name writes into meal", screen, (s) => s.replace("const restaurantPresentation =", "input.meal.restaurantName = \"catalog\";\n  const restaurantPresentation ="), noMealNameWriteAuthority);
mutation("18 restaurantName enters v3 payload", read(V3), (s) => s.replace("  mealWrite: MealIdentificationFinalizationV3MealWriteInput;", "  restaurantName?: string;\n  mealWrite: MealIdentificationFinalizationV3MealWriteInput;"), (s) => !/restaurantName|branchName|displayName/.test(s));
mutation("19 branchName enters v3 payload", read(V3), (s) => s.replace("  mealWrite: MealIdentificationFinalizationV3MealWriteInput;", "  branchName?: string;\n  mealWrite: MealIdentificationFinalizationV3MealWriteInput;"), (s) => !/restaurantName|branchName|displayName/.test(s));
mutation("20 planned snapshot replaced by live value", screen, (s) => s.replace("plan.restaurantName || \"餐廳未提供\"", "getTodayIntakeRestaurantDisplayText(lunchRow!.restaurantPresentation, \"餐廳未提供\")"), plannedSnapshotAuthority);
mutation("21 C2a omits C3 caller state", c2a, (s) => s.replace("const CALLER_STATE_C3 = [RESOLVER, ANALYSIS_SCREEN, TODAY_INTAKE_SCREEN].sort();", "const CALLER_STATE_C3 = CALLER_STATE_C2B;"), c2aSuccessorAuthority);
mutation("22 C2a allows arbitrary caller", c2a, (s) => s.replace("productionCallers.filter((entry) => entry !== RESOLVER).length <= 2", ["true ", "|| productionCallers.filter((entry) => entry !== RESOLVER).length <= 2"].join("")), c2aSuccessorAuthority);
mutation("23 C2b keeps Analysis as sole screen caller", c2b, (s) => s.replace("[RESOLVER, SCREEN, TODAY_INTAKE_SCREEN].sort()", "[RESOLVER, SCREEN].sort()"), c2bSuccessorAuthority);
mutation("24 R7-C1 drops C3 manifest", c1, (s) => s.replace("R7_C3_SUCCESSOR_MANIFEST.length === 8", "R7_C3_SUCCESSOR_MANIFEST.length === 0"), c1SuccessorAuthority);
mutation("25 R2 omits Today Intake", r2, (s) => s.replace('  "apps/mobile/app/today-intake.tsx"\n', ""), r2Authority);
mutation("26 R2 app-screen wildcard", r2, (s) => s.replace('  "apps/mobile/app/today-intake.tsx"', '  ...allAppScreens'), r2Authority);
mutation("27 new guard requires modified state", guardCode, (s) => `${s}\n${["worktree", ".includes(GUARD)"].join("")}\n`, (s) => !new RegExp(["worktree", "\\.includes\\("].join("")).test(s));
mutation("28 new guard requires untracked scripts", guardCode, (s) => `${s}\n${["untracked", ".includes(SMOKE)"].join("")}\n`, (s) => !new RegExp(["untracked", "\\.includes\\("].join("")).test(s));
mutation("29 ninth candidate path accepted", CANDIDATE_MANIFEST, (value) => [...value, "apps/mobile/app/ninth.tsx"], exactEightManifestAuthority);
mutation("30 resolver bytes change", read(RESOLVER), (s) => `${s}\n `, (s) => createHash("sha256").update(s).digest("hex") === FROZEN[RESOLVER]);
mutation("31 mapper bytes change", read(MAPPER), (s) => `${s}\n `, (s) => createHash("sha256").update(s).digest("hex") === FROZEN[MAPPER]);
mutation("32 migration tree changes", trackedTreeDigest("supabase/migrations"), (s) => `${s}-changed`, (s) => s === "f9b1f2832a39ecc48766ae004d03a6009c83867b44a1af4027138c7578f04e9e");
check("mutation summary: all 32 non-noop mutations were killed", mutations.length === 32 && mutations.every((entry) => entry.applied && entry.killed), mutations.filter((entry) => !entry.applied || !entry.killed));

// R2 scope-correction proof keeps legacy presentation absence distinct from the resolver's
// canonical nullable input. These are targeted source transforms, never compile-failure proxies.
const scopeMutations = [];
const scopeMutation = (name, original, mutate, authority) => {
  const changed = mutate(original);
  const applied = changed !== original;
  const killed = applied && !authority(changed);
  scopeMutations.push({ name, applied, killed });
  check("scope mutation " + name + " is killed by its targeted authority", killed, { applied });
};
const branchPresentationAuthority = (source) =>
  /branchId: string \| null;/.test(source) &&
  /branchId: firstItem\?\.branchId \?\? null/.test(source) &&
  !/branchId: firstItem\?\.branchId \?\? undefined/.test(source);
const smokeBoundaryAuthority = (source) =>
  /generic\.restaurantId === undefined && generic\.branchId === null/.test(source) &&
  /genericResolverInput\.restaurantId === null && genericResolverInput\.branchId === null/.test(source) &&
  /explicitNullResolverInput\.restaurantId === null && explicitNullResolverInput\.branchId === null/.test(source) &&
  !/!generic\.restaurantId/.test(source);
const scopeCorrectedGuardAuthority = (source) =>
  /legacyRestaurantIdAuthority\(modelCode\)/.test(source) &&
  /resolverBoundaryAuthority\(screenCode\)/.test(source) &&
  !new RegExp(["strictRestaurant", "IdAuthority"].join("")).test(source) &&
  !new RegExp(["sharedRequired", "NullAuthority"].join("")).test(source) &&
  !new RegExp(["R7A_NULLABLE", "_SUCCESSOR"].join("")).test(source) &&
  !new RegExp(["nullable", "Mutations"].join("")).test(source);
const frozenSourceAuthority = (source, file) =>
  createHash("sha256").update(source).digest("hex") === FROZEN[file];
const exactCallerSetAuthority = (value) =>
  JSON.stringify([...value].sort()) === JSON.stringify([RESOLVER, ANALYSIS, SCREEN].sort());

scopeMutation("01 possibly undefined restaurantId passes directly to resolver", screen, (s) => s.replace("restaurantId: input.meal.restaurantId ?? null", "restaurantId: input.meal.restaurantId"), resolverBoundaryAuthority);
scopeMutation("02 possibly undefined branchId passes directly to resolver", screen, (s) => s.replace("branchId: input.meal.branchId ?? null", "branchId: input.meal.branchId"), resolverBoundaryAuthority);
scopeMutation("03 resolver absence becomes empty string", screen, (s) => s.replace("restaurantId: input.meal.restaurantId ?? null", "restaurantId: input.meal.restaurantId ?? \"\""), resolverBoundaryAuthority);
scopeMutation("04 UI-model branchId becomes undefined", model, (s) => s.replace("branchId: firstItem?.branchId ?? null", "branchId: firstItem?.branchId ?? undefined"), branchPresentationAuthority);
scopeMutation("05 UI-model writes restaurantId into restaurantName", model, (s) => s.replace('restaurantName: ""', "restaurantName: firstItem?.restaurantId ?? \"\""), (s) => /restaurantName: ""/.test(stripComments(s)) && !/restaurantName:\s*firstItem\?\.restaurantId/.test(stripComments(s)));
scopeMutation("06 generic UI meal fabricates restaurantId", model, (s) => s.replace("restaurantId: firstItem?.restaurantId ?? undefined", "restaurantId: firstItem?.restaurantId ?? \"fake-restaurant\""), legacyRestaurantIdAuthority);
scopeMutation("07 missing branch falls back to first branch", screen, (s) => s.replace("branchId: input.meal.branchId ?? null", "branchId: input.meal.branchId ?? \"first-branch\""), resolverBoundaryAuthority);
scopeMutation("08 display name writes back into meal", screen, (s) => s.replace("const restaurantPresentation =", "input.meal.restaurantName = \"catalog\";\n  const restaurantPresentation ="), noMealNameWriteAuthority);
scopeMutation("09 display name enters command payload", read(V3), (s) => s.replace("  mealWrite: MealIdentificationFinalizationV3MealWriteInput;", "  restaurantName?: string;\n  mealWrite: MealIdentificationFinalizationV3MealWriteInput;"), (s) => !/restaurantName|branchName|displayName/.test(s));
scopeMutation("10 C3 guard restores shared required-null authority", guardCode, (s) => s + "\nconst sharedRequiredNullAuthority = true;\n", scopeCorrectedGuardAuthority);
scopeMutation("11 C3 guard restores R7-A nullable successor authority", guardCode, (s) => s + "\nconst R7A_NULLABLE_SUCCESSOR = true;\n", scopeCorrectedGuardAuthority);
scopeMutation("12 smoke conflates UI undefined and resolver null with falsy", smoke, (s) => s.replace("generic.restaurantId === undefined && generic.branchId === null", "!generic.restaurantId && generic.branchId === null"), smokeBoundaryAuthority);
scopeMutation("13 C2a accepts exact10", c2a, (s) => s.replace("C3_SUCCESSOR_MANIFEST.length === 8", "C3_SUCCESSOR_MANIFEST.length === 10"), c2aSuccessorAuthority);
scopeMutation("14 C2b accepts exact10", c2b, (s) => s.replace("C3_SUCCESSOR_MANIFEST.length === 8", "C3_SUCCESSOR_MANIFEST.length === 10"), c2bSuccessorAuthority);
scopeMutation("15 R7-C1 accepts exact10", c1, (s) => s.replace("R7_C3_SUCCESSOR_MANIFEST.length === 8", "R7_C3_SUCCESSOR_MANIFEST.length === 10"), c1SuccessorAuthority);
scopeMutation("16 R7-A guard is modified", r7aGuard, (s) => s + "\n ", (s) => frozenSourceAuthority(s, R7A_GUARD));
scopeMutation("17 R7-A smoke is modified", r7aSmoke, (s) => s + "\n ", (s) => frozenSourceAuthority(s, R7A_SMOKE));
scopeMutation("18 SavedMealRecord shared type is modified", read(SAVED_MEAL_TYPES), (s) => s.replace("restaurantId?: string;", "restaurantId: string | null;"), (s) => frozenSourceAuthority(s, SAVED_MEAL_TYPES));
scopeMutation("19 analysis meal record store is modified", read(MEAL_RECORD_STORE), (s) => s + "\n ", (s) => frozenSourceAuthority(s, MEAL_RECORD_STORE));
scopeMutation("20 Analysis screen is modified", read(ANALYSIS), (s) => s + "\n ", (s) => frozenSourceAuthority(s, ANALYSIS));
scopeMutation("21 calorie-sharing constructor is modified", read(CALORIE_SHARING_IMPORT), (s) => s + "\n ", (s) => frozenSourceAuthority(s, CALORIE_SHARING_IMPORT));
scopeMutation("22 ninth candidate path is accepted", CANDIDATE_MANIFEST, (value) => [...value, "apps/mobile/app/ninth.tsx"], exactEightManifestAuthority);
scopeMutation("23 new committed resolver caller is hidden", callers, (value) => [...value, "apps/mobile/app/hidden-caller.tsx"], exactCallerSetAuthority);
scopeMutation("24 planned snapshot is replaced by live composition", screen, (s) => s.replace('plan.restaurantName || "餐廳未提供"', 'getTodayIntakeRestaurantDisplayText(lunchRow!.restaurantPresentation, "餐廳未提供")'), plannedSnapshotAuthority);
check(
  "scope-correction mutation summary: 24/24 killed with no survivors or no-ops",
  scopeMutations.length === 24 && scopeMutations.every((entry) => entry.applied && entry.killed),
  scopeMutations.filter((entry) => !entry.applied || !entry.killed)
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "restaurant-display-mi-e-c5-r7-c3",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  mutations: {
    original: { total: mutations.length, killed: mutations.filter((entry) => entry.killed).length },
    scopeCorrection: {
      total: scopeMutations.length,
      killed: scopeMutations.filter((entry) => entry.killed).length,
      survivors: scopeMutations.filter((entry) => entry.applied && !entry.killed).length,
      noOps: scopeMutations.filter((entry) => !entry.applied).length,
      harnessCrashes: 0
    }
  },
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
