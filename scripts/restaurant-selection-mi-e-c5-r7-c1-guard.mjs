#!/usr/bin/env node
// MI-E-C5-R7-C1 static guard — Restaurant Catalog selection -> /meal-photo -> analysis session.
//
// POST-FREEZE LIFECYCLE-AWARE BY CONSTRUCTION.
//
// MI-E-C5-R7-B2-R3 had to repair a sibling guard that asserted "the new migration is untracked",
// which became permanently unsatisfiable the moment its candidate was committed. This guard never
// makes that class of claim: it does not require any path to be modified, untracked, staged, or
// absent from HEAD, and it does not special-case a particular HEAD. Every assertion is either
//   (1) repository CONTENT (source invariants + digests of content this round freezes), or
//   (2) a PROTECTED-SURFACE digest, or
//   (3) an explicitly optional candidate-state DIAGNOSTIC that reports but never fails on a
//       clean worktree.
// All three hold identically before and after the freeze commit.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).stdout ?? "";

const CATALOG_SCREEN = "apps/mobile/app/restaurants.tsx";
const CAPTURE_SCREEN = "apps/mobile/app/meal-photo.tsx";
const HANDOFF = "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts";
const GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const SMOKE = "scripts/restaurant-selection-mi-e-c5-r7-c1-smoke.mjs";
// MI-E-C5-R7-C1-R1: the R2 successor UI guard is the SIXTH and final candidate path. Its
// ALLOWED_APP_SCREENS set predates this round and forbade every apps/mobile/app/* screen except
// analysis.tsx and meal-photo.tsx, so the legitimate restaurants.tsx entry surface was rejected.
// The amendment is one exact path added to that set — never a wildcard.
const R2_UI_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs";
// The exact six paths this round is allowed to introduce or change.
const CANDIDATE_MANIFEST = Object.freeze([CATALOG_SCREEN, CAPTURE_SCREEN, HANDOFF, GUARD, SMOKE, R2_UI_GUARD]);
// MI-E-C5-R7-C2a successor manifest — the EXACT six paths of the follow-on round that corrects the
// presentation resolver's multi-branch lookup. Named individually, never a prefix or wildcard, so a
// seventh path still fails. R7-C1's own selector/handoff/reset authority is untouched by it.
const R7_C2A_SUCCESSOR_MANIFEST = Object.freeze([
  "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts",
  "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs",
  "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs",
  GUARD,
  "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs"
]);
// MI-E-C5-R7-C2b successor manifest — the EXACT eight paths of the round that finally gives the
// resolver a production caller by wiring it into the two analysis display sites. Named
// individually, never a prefix or wildcard, so a NINTH path still fails. Exactly ONE of them is a
// production file; the other seven are guard/smoke suites.
//
// MI-E-C5-R7-C2b-R1 raised this from seven to eight. The C2a guard is the eighth: four of its
// checks (3/20/21/27) were C2a-round non-goal fences that, as written, made C2a's own declared
// successor unreachable — check 3 required the resolver to have zero production callers forever.
// Amending it there is the only way C2b can exist, so that path is authorised explicitly and its
// amended bytes are pinned below.
const R7_C2B_SUCCESSOR_MANIFEST = Object.freeze([
  "apps/mobile/app/analysis.tsx",
  "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-guard.mjs",
  GUARD,
  "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c2b-smoke.mjs"
]);
const R7_C3_SUCCESSOR_MANIFEST = Object.freeze([
  "apps/mobile/app/today-intake.tsx",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts",
  "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs",
  GUARD,
  R2_UI_GUARD,
  "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs",
  "scripts/restaurant-display-mi-e-c5-r7-c3-smoke.mjs"
]);
const C3_SUCCESSOR_DIGESTS = Object.freeze({
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts": "aa17c6d13dab8d3975859ee385c068b22ba3d39da562f9a70e31ab4352352c29",
  "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs": "d2028da074866af829f8747ab757087e326e427a195fa13e111e3f84d21dc350",
  "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs": "7bb9256ccdaec2a74585d9ffcfa900d12fecb10a6757658625b2cd686ccf408a",
  "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs": "10170b2c3b544fb2288633652582208d53a3addbc789ed2fad1e3c87a8431123",
  "scripts/restaurant-display-mi-e-c5-r7-c3-smoke.mjs": "afbe9c8db2609bb3228adac1f0f0f1ddf75a821832ab14af71a4c2fd090c8767"
});
// MI-E-C5-R7-C4-R1 successor manifest — repairs live Supabase consumer client composition (the
// Catalog/Favorites/Ratings compositions passed raw Phase 1D flags into the client factory) and the
// Development Mobile launcher env gap. Enumerated, never a prefix. It touches no selector, capture,
// handoff or reset surface, so R7-C1's own authority is untouched by it.
const R7_C4_R1_SUCCESSOR_MANIFEST = Object.freeze([
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
  GUARD
]);
const AUTHORIZED_WORKTREE_PATHS = Object.freeze([
  ...new Set([
    ...CANDIDATE_MANIFEST,
    ...R7_C2A_SUCCESSOR_MANIFEST,
    ...R7_C2B_SUCCESSOR_MANIFEST,
    ...R7_C4_R1_SUCCESSOR_MANIFEST,
    ...R7_C3_SUCCESSOR_MANIFEST
  ])
]);

const catalog = read(CATALOG_SCREEN);
const capture = read(CAPTURE_SCREEN);
const handoff = read(HANDOFF);

// Executable source only, so explanatory prose can neither satisfy nor break a code assertion.
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
const catalogCode = stripComments(catalog);
const captureCode = stripComments(capture);
const handoffCode = stripComments(handoff);

// =============================================================================================
// 1. Pure handoff module contract (1-10)
// =============================================================================================
check("1. the pure handoff module exists at the approved path", exists(HANDOFF));
check(
  "2. it exports both directions of the contract",
  /export function decodeAnalysisRestaurantHandoff\(/.test(handoff) &&
    /export function encodeAnalysisRestaurantHandoffParams\(/.test(handoff)
);
check(
  "3. it is PURE — no React, Expo Router, Supabase, repository, navigation or storage import",
  !/\bfrom "react"|\bfrom "react-native"|\bfrom "expo-router"|@supabase|createClient|AsyncStorage|SecureStore/.test(handoffCode) &&
    !/\bimport\b/.test(handoffCode)
);
check(
  "4. it performs no network, RPC or persistence call",
  !/fetch\(|\.rpc\s*\(|\.from\s*\(|localStorage|sessionStorage/.test(handoffCode)
);
check(
  "5. the decoded context type is restaurantId + nullable branchId only",
  /export type AnalysisRestaurantHandoff = Readonly<\{\s*\r?\n\s*restaurantId: string;\s*\r?\n\s*branchId: string \| null;\s*\r?\n\}>;/.test(handoff)
);
check(
  "6. the approved route key set is EXACTLY restaurantId and branchId",
  /ANALYSIS_RESTAURANT_HANDOFF_PARAM_KEYS = Object\.freeze\(\["restaurantId", "branchId"\] as const\)/.test(handoff)
);
check(
  "7. a multi-element or empty route array is refused, never indexed into",
  /if \(value\.length !== 1\) return null;/.test(handoffCode) && !/value\[0\]/.test(handoffCode)
);
check(
  "8. no restaurant means no context at all, so a branch-only route cannot produce one",
  /if \(!restaurantId\) return null;/.test(handoffCode)
);
check(
  "9. a stale selected branch downgrades to restaurant-only instead of being handed on",
  /if \(!branchIds\.includes\(selectedBranchId\)\) return Object\.freeze\(\{ restaurantId \}\);/.test(handoffCode)
);
check(
  "10. no UUID shape is invented for an opaque durable id",
  !/\[0-9a-f\]\{8\}|uuid|UUID_SHAPE/i.test(handoffCode)
);

// =============================================================================================
// 2. Catalog-side handoff (11-17)
// =============================================================================================
check(
  "11. the catalog screen builds route params through the pure encoder, not by hand",
  /encodeAnalysisRestaurantHandoffParams\(\{/.test(catalogCode) &&
    /from "\.\.\/features\/meal-identification\/analysisRestaurantHandoff"/.test(catalog)
);
check(
  "12. it navigates to /meal-photo with those params",
  /router\.push\(\{ pathname: "\/meal-photo", params \}\)/.test(catalogCode)
);
check(
  "13. the encoder receives the user's OWN branch pick and this restaurant's real branch list",
  /restaurantId: restaurant\?\.restaurantId,\s*\r?\n\s*selectedBranchId,\s*\r?\n\s*branchIds: restaurant\?\.branches\.map\(\(branch\) => branch\.branchId\) \?\? \[\]/.test(catalogCode)
);
check(
  // `selectedBranch` falls back to branches[0] for dish rendering; that display convenience must
  // never be the value handed to the durable route.
  "14. the first-branch display fallback is NOT used as the handoff identity",
  !/selectedBranchId: selectedBranch/.test(catalogCode) &&
    !/branches\[0\]\?\.branchId\s*,?\s*\r?\n?\s*branchIds/.test(catalogCode)
);
// Scoped to the /meal-photo navigation ONLY. restaurants.tsx legitimately pushes OTHER routes
// (e.g. /meal-buddies) with display fields such as restaurantName; those are pre-existing and out
// of R7-C1's scope, so a file-wide scan would assert the wrong thing.
const mealPhotoNavigations = (catalogCode.match(/router\.push\([^;]*?"\/meal-photo"[^;]*?\);/g) ?? []);
check(
  "15. the /meal-photo route carries the encoder result BY REFERENCE, so no extra field can ride along",
  mealPhotoNavigations.length === 1 &&
    /router\.push\(\{ pathname: "\/meal-photo", params \}\)/.test(mealPhotoNavigations[0]) &&
    !/\b(restaurantName|branchName|district|address|menu|menuItems|category|tags|score|location)\b/.test(mealPhotoNavigations[0]),
  mealPhotoNavigations
);
check(
  "16. no restaurant or catalog object is serialized onto the /meal-photo route",
  mealPhotoNavigations.length === 1 &&
    !/JSON\.stringify/.test(mealPhotoNavigations[0]) &&
    !/\brestaurant\b\s*[,}]/.test(mealPhotoNavigations[0])
);
check(
  "17. the catalog screen does not write the analysis session itself",
  !/setAnalysisRestaurantContext|resetAnalysisSessionForActor/.test(catalogCode)
);

// =============================================================================================
// 3. Capture-side session lifecycle (18-27) — the decisive ordering authority
// =============================================================================================
check(
  "18. the capture screen decodes the route through the same pure module",
  /decodeAnalysisRestaurantHandoff\(\{ restaurantId: restaurantIdParam, branchId: branchIdParam \}\)/.test(captureCode) &&
    /from "\.\.\/features\/meal-identification\/analysisRestaurantHandoff"/.test(capture)
);
check(
  "19. it reads restaurantId/branchId as Expo Router params that may repeat",
  /restaurantId\?: string \| string\[\];\s*\r?\n\s*branchId\?: string \| string\[\];/.test(capture)
);
check(
  "20. a SINGLE apply-only seam is shared by every new-capture lifecycle",
  /const applyRouteRestaurantContextForNewCapture = useCallback\(\(\) => \{/.test(captureCode)
);
const seam = (() => {
  const at = captureCode.indexOf("const applyRouteRestaurantContextForNewCapture = useCallback(() => {");
  if (at < 0) return "";
  const end = captureCode.indexOf("}, [routeRestaurantHandoff]);", at);
  return end > at ? captureCode.slice(at, end) : captureCode.slice(at);
})();
// The seam is deliberately apply-only: the frozen R5 (check 69) and R4 owned-cache guards assert
// the literal reset call inside startAiAnalysis, so every reset site stays verbatim and is simply
// followed by the apply. Ordering is therefore enforced per call site, not inside a wrapper.
const resetThenApply =
  captureCode.match(
    /resetAnalysisSessionForActor\([\s\S]{0,200}?\);\s*(?:\/\/[^\n]*\n\s*)*applyRouteRestaurantContextForNewCapture\(\);/g
  ) ?? [];
check(
  "21. EVERY reset call site is immediately followed by the apply seam (reset -> apply ordering)",
  resetThenApply.length === (captureCode.match(/resetAnalysisSessionForActor\(/g) ?? []).length,
  {
    resetSites: (captureCode.match(/resetAnalysisSessionForActor\(/g) ?? []).length,
    pairedResetThenApply: resetThenApply.length
  }
);
check(
  "21a. the seam never resets by itself, so it can only ever run AFTER a caller's reset",
  seam.length > 0 && !/resetAnalysisSessionForActor\(/.test(seam)
);
check(
  "22. with no usable route selection the setter is not called at all (generic flow intact)",
  /if \(!routeRestaurantHandoff\) return;/.test(seam)
);
check(
  "23. the applied context is exactly the decoded pair — no third field, no name",
  /setAnalysisRestaurantContext\(\{\s*\r?\n?\s*restaurantId: routeRestaurantHandoff\.restaurantId,\s*\r?\n?\s*branchId: routeRestaurantHandoff\.branchId\s*\r?\n?\s*\}\);/.test(seam)
);
check(
  // BOTH new-capture lifecycles (gesture + autoOpen) must apply, so neither can silently drift into
  // resetting without reapplying the route selection.
  "24. there are exactly two reset lifecycles and exactly two apply call sites",
  (captureCode.match(/resetAnalysisSessionForActor\(/g) ?? []).length === 2 &&
    (captureCode.match(/applyRouteRestaurantContextForNewCapture\(\);/g) ?? []).length === 2,
  {
    resetSites: (captureCode.match(/resetAnalysisSessionForActor\(/g) ?? []).length,
    applySites: (captureCode.match(/applyRouteRestaurantContextForNewCapture\(\);/g) ?? []).length
  }
);
check(
  "25. the gesture entry resets with the frozen R5/R4 spelling and then applies",
  /function startAiAnalysis\(\)[\s\S]{0,600}?resetAnalysisSessionForActor\(captureActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES\);\s*\r?\n\s*applyRouteRestaurantContextForNewCapture\(\);/.test(captureCode)
);
check(
  "26. the autoOpen entry applies too and is dependency-gated against rerender repetition",
  /autoOpen === "true" && captureSessionReconciled[\s\S]{0,600}?applyRouteRestaurantContextForNewCapture\(\);/.test(captureCode) &&
    /\}, \[applyRouteRestaurantContextForNewCapture, autoOpen, captureSessionReconciled, runtime\.state\.actorGeneration, runtime\.state\.actorKey\]\);/.test(captureCode)
);
check(
  "27. the capture screen writes no persistent storage and calls no RPC for this handoff",
  !/AsyncStorage|SecureStore|localStorage|\.rpc\s*\(/.test(captureCode)
);

// =============================================================================================
// 4. Protected surfaces — pinned to the content this round must not touch (28-31)
// =============================================================================================
// Content digests, NOT worktree state: these hold identically before and after the freeze commit.
// MI-E-C5-R7-C2b: exactly TWO pins are refreshed — the analysis screen, which C2b wires to the
// resolver, and the R7-B guard, whose check 47 C2b is explicitly authorised to amend. R7-C3-R2
// restores the two R7-A validation suites to exact HEAD frozen bytes; every production authority
// remains frozen.
const PROTECTED = Object.freeze({
  "apps/mobile/app/analysis.tsx": "0c3488138597249ca15506db65cb7d4aaa3a88ca1c041dd9aa912acc1b6c5cd2",
  "apps/mobile/app/index.tsx": "90605d9b7ab7a396bb69b7a146b23759fa968cd56aeb2ba283dfeb9c0fa41ab1",
  "apps/mobile/features/analysis/analysisSessionStore.ts": "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts": "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  "apps/mobile/features/restaurants/catalog/mapper.ts": "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  "apps/mobile/features/meal-identification-finalization/v3Contract.ts": "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  "apps/mobile/features/analysis/useMealPhotoFinalization.ts": "7d4178645730060d81fe7845ecefd682bc51ad9c76e9fcdf3ded780b269678ae",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-guard.mjs": "86972f1e557d20faa1f048d6e81f4698fe9940332f16cddf607c343250ce4f83",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs": "26d1937ed53c5eb49b6c4b34867a0456400de214fdc8fec8831f900f520d324c",
  "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs": "3740e2532b5c7a3bc6228a352833b3ca378fc1422de59efda620eb33e79e5100",
  "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs": "2bb570c4862970dacc6ac6d24b1b829524f07f26ba6377d4dfd7d5ef9d2f00fd",
  // The 2Z-B3-D historical guard is a PRE-EXISTING failing phase artifact. R7-C1 neither repairs
  // nor retires it; it only proves the file was not touched.
  "scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-guard.mjs":
    "6f598258b04e4a7f557053bba31ebfa1b1a3a0417648e10c4b750c875824b6db"
});
const protectedDrift = Object.entries(PROTECTED).filter(([file, want]) => !exists(file) || sha(file) !== want);
check("28. every protected surface is byte-identical to its frozen content", protectedDrift.length === 0, protectedDrift.map(([f]) => f));
const C3_TODAY_INTAKE_DIGESTS = Object.freeze({
  "apps/mobile/app/today-intake.tsx": Object.freeze([
    "8697e1aa9a471e50f8da664e938e90771cb93b6ff62696b2fa5412080e17e68e",
    "d50a4cafb3613c4332ee8f6a356d6515e32082080750fdbf93a6f2aa4e323548"
  ]),
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts": Object.freeze([
    "d4403fc5e2580758c77ffd7e29052dd72383af4f3ddd3b072a9abe2cd35fa1f2",
    "aa17c6d13dab8d3975859ee385c068b22ba3d39da562f9a70e31ab4352352c29"
  ])
});
check(
  "28b. Today Intake surfaces hold either their frozen C2b or exact C3 successor bytes",
  Object.entries(C3_TODAY_INTAKE_DIGESTS).every(([file, allowed]) => allowed.includes(sha(file)))
);
// Frozen production values plus exact HEAD R7-A bytes. No arbitrary re-pin is accepted: each path
// has one literal content authority in this lifecycle state.
const C2A_AND_R7A_SUCCESSOR_DIGESTS = Object.freeze({
  "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts":
    "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  "apps/mobile/features/restaurants/catalog/mapper.ts":
    "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs":
    "3740e2532b5c7a3bc6228a352833b3ca378fc1422de59efda620eb33e79e5100",
  "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs":
    "2bb570c4862970dacc6ac6d24b1b829524f07f26ba6377d4dfd7d5ef9d2f00fd",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs":
    "26d1937ed53c5eb49b6c4b34867a0456400de214fdc8fec8831f900f520d324c"
});
check(
  "28a. frozen resolver/mapper/R7-B and exact HEAD R7-A pins are immutable",
  Object.entries(C2A_AND_R7A_SUCCESSOR_DIGESTS).every(([file, digest]) => PROTECTED[file] === digest && sha(file) === digest)
);
check(
  "29. no protected surface is inside the R7-C1 candidate manifest",
  Object.keys(PROTECTED).every((file) => !CANDIDATE_MANIFEST.includes(file))
);
check(
  "30. the 2Z-B3-D historical guard is explicitly untouched by this round",
  sha("scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-guard.mjs") ===
    PROTECTED["scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-guard.mjs"]
);
check(
  "31. R7-C1 introduces no migration, Edge Function or packages change",
  CANDIDATE_MANIFEST.every(
    (file) => !file.startsWith("supabase/migrations/") && !file.startsWith("supabase/functions/") && !file.startsWith("packages/")
  )
);

// =============================================================================================
// 5. Non-goal fences (32-36) — R7-C2/C3 work must not leak into this round
// =============================================================================================
check(
  "32. no real restaurant/branch NAME display is introduced by this round",
  !/resolveRestaurantContextPresentation/.test(captureCode) && !/resolveRestaurantContextPresentation/.test(handoffCode)
);
check("33. analysis.tsx is not imported or edited by the capture handoff", !/app\/analysis/.test(captureCode));
check(
  // Composition, not navigation: meal-photo.tsx has a pre-existing "/today-intake" Pressable that
  // R7-C1 neither adds nor touches. What must stay absent is any Today Intake MODEL composition.
  "34. no Today Intake composition is introduced (navigation links are untouched pre-existing UI)",
  !/todayIntakeUiModel|useTodayIntakeUiModel|getUiMealCalories/.test(captureCode + handoffCode + catalogCode)
);
check(
  "35. the candidate manifest is exactly the six approved paths",
  CANDIDATE_MANIFEST.length === 6 && new Set(CANDIDATE_MANIFEST).size === 6 && CANDIDATE_MANIFEST.every(exists)
);
check(
  "36. no secret, credential or Development project ref is present in the candidate",
  ![catalog, capture, handoff].some((source) =>
    /sbp_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}|service_role|msbgnnoorsoefuiwluye|SUPABASE_ACCESS_TOKEN/.test(source)
  )
);

// =============================================================================================
// 5b. R2 successor app-screen scope amendment (36a-36h) — MI-E-C5-R7-C1-R1
//
// The amendment must be an EXACT third entry. Everything asserted here is read from the R2 guard's
// real source, so a wildcard, a dropped entry, an extra screen, or a weakened backend/upload/
// finalization fence all fail. This does NOT duplicate the R2 guard's own checks — it fences the
// shape of the amendment R7-C1 depends on.
// =============================================================================================
const r2Guard = read(R2_UI_GUARD);
const r2AllowedScreens = (() => {
  const at = r2Guard.indexOf("const ALLOWED_APP_SCREENS = new Set([");
  if (at < 0) return null;
  const close = r2Guard.indexOf("]);", at);
  if (close < 0) return null;
  const body = r2Guard.slice(at, close);
  return (body.match(/"apps\/mobile\/app\/[a-zA-Z0-9._-]+"/g) ?? []).map((entry) => entry.slice(1, -1));
})();
check("36a. the R2 allowlist is still an explicit Set literal that can be read", Array.isArray(r2AllowedScreens), r2AllowedScreens);
check(
  "36b. it contains the EXACT restaurants.tsx entry R7-C1 depends on",
  (r2AllowedScreens ?? []).includes("apps/mobile/app/restaurants.tsx")
);
check(
  "36c. the two pre-existing entries are preserved, not replaced",
  (r2AllowedScreens ?? []).includes("apps/mobile/app/analysis.tsx") &&
    (r2AllowedScreens ?? []).includes("apps/mobile/app/meal-photo.tsx")
);
check(
  "36d. the allowlist is EXACTLY the four named successor screens — no fifth, unrelated screen",
  (r2AllowedScreens ?? []).length === 4 &&
    new Set(r2AllowedScreens).size === 4 &&
    (r2AllowedScreens ?? []).includes("apps/mobile/app/today-intake.tsx"),
  r2AllowedScreens
);
const r2AllowlistBody = (() => {
  const at = r2Guard.indexOf("const ALLOWED_APP_SCREENS = new Set([");
  const close = at < 0 ? -1 : r2Guard.indexOf("]);", at);
  return at < 0 || close < 0 ? null : r2Guard.slice(at, close);
})();
// Executable entries only. Explanatory prose that legitimately writes "apps/mobile/app/*" while
// describing what stays FORBIDDEN must never break a check about the code.
const r2AllowlistEntries =
  r2AllowlistBody === null
    ? null
    : r2AllowlistBody
        .split("\n")
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("//"));
check(
  // Scoped to the Set LITERAL's executable entries. The predicate's own
  // `entry.startsWith("apps/mobile/app/")` is the fail-closed gate and must stay, so a file-wide
  // `startsWith` scan would assert the opposite of what is intended.
  "36e. the allowlist literal holds only exact quoted paths — no wildcard, regex, spread or prefix",
  Array.isArray(r2AllowlistEntries) &&
    r2AllowlistEntries.length === 4 &&
    r2AllowlistEntries.every((line) => /^"apps\/mobile\/app\/[a-zA-Z0-9._-]+",?$/.test(line)) &&
    !r2AllowlistEntries.some((line) => /RegExp|\.test\(|`|\.\.\.|startsWith|\*/.test(line)) &&
    // ...and no prefix-based ALLOWANCE exists anywhere in the predicate.
    !/entry\.startsWith\("apps\/mobile\/app\/"\)\)\s*return false/.test(r2Guard),
  r2AllowlistEntries
);
check(
  "36f. the forbidden app-screen predicate itself still exists and still fails closed",
  /if \(entry\.startsWith\("apps\/mobile\/app\/"\) && !ALLOWED_APP_SCREENS\.has\(entry\)\) return true;/.test(r2Guard)
);
check(
  "36g. the backend / upload / finalization / supabase prefix fences are unweakened",
  /const FORBIDDEN_SUCCESSOR_PREFIXES = Object\.freeze\(\[\s*\r?\n\s*"supabase",\s*\r?\n\s*"apps\/mobile\/features\/meal-photo-upload",\s*\r?\n\s*"apps\/mobile\/features\/meal-identification-finalization",\s*\r?\n\s*"packages\/shared\/src\/domain\/meal-identification-finalization"\s*\r?\n\s*\]\);/.test(r2Guard) &&
    /FORBIDDEN_SUCCESSOR_PREFIXES\.some\(\(prefix\) => entry\.startsWith\(prefix\)\)\) return true;/.test(r2Guard)
);
check(
  // Structural non-erosion: the amendment must not have deleted any of the R2 guard's own checks.
  "36h. the R2 guard keeps its full check population (amendment added no bypass and removed none)",
  (r2Guard.match(/^check\(/gm) ?? []).length >= 40 && /ALLOWED_SUCCESSOR_CONTRACT_PATHS/.test(r2Guard)
);

// =============================================================================================
// 6. Candidate-state DIAGNOSTICS (37-38)
// =============================================================================================
// Deliberately lifecycle-AWARE, never lifecycle-DEPENDENT: a clean worktree (post-freeze) and a
// worktree holding exactly this candidate (pre-freeze) both satisfy these. Neither requires any
// path to be modified or untracked, so the freeze commit cannot invalidate them.
const worktree = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll("\\", "/"));
const outsideManifest = worktree.filter((file) => !AUTHORIZED_WORKTREE_PATHS.includes(file));
check(
  // Accepts this round's own six paths and the exact R7-C2a successor six; anything else fails.
  // Still vacuous on a clean tree, so the freeze commit cannot invalidate it.
  "37. any uncommitted change is confined to an approved manifest (vacuous on a clean tree)",
  outsideManifest.length === 0,
  { worktreeEntries: worktree.length, outsideManifest }
);
check(
  "37a. the R7-C2a successor manifest is exactly six named paths, never a prefix or wildcard",
  R7_C2A_SUCCESSOR_MANIFEST.length === 6 &&
    new Set(R7_C2A_SUCCESSOR_MANIFEST).size === 6 &&
    R7_C2A_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(ts|mjs)$/i.test(entry)) &&
    // The R7-C1 production surfaces are NOT re-opened by the successor manifest.
    ![CATALOG_SCREEN, CAPTURE_SCREEN, HANDOFF, SMOKE].some((entry) => R7_C2A_SUCCESSOR_MANIFEST.includes(entry))
);
check(
  "37b. the R7-C2b successor manifest is exactly eight named paths, with exactly one production file",
  R7_C2B_SUCCESSOR_MANIFEST.length === 8 &&
    new Set(R7_C2B_SUCCESSOR_MANIFEST).size === 8 &&
    R7_C2B_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    R7_C2B_SUCCESSOR_MANIFEST.filter((entry) => entry.startsWith("apps/")).length === 1 &&
    // C2b touches the analysis screen only: R7-C1's own selector, capture and handoff surfaces and
    // the C2a resolver are NOT re-opened by it.
    ![CATALOG_SCREEN, CAPTURE_SCREEN, HANDOFF, SMOKE].some((entry) => R7_C2B_SUCCESSOR_MANIFEST.includes(entry)) &&
    !R7_C2B_SUCCESSOR_MANIFEST.includes("apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts") &&
    // No successor manifest may reach a migration, Edge Function or shared package.
    R7_C2B_SUCCESSOR_MANIFEST.every(
      (entry) =>
        !entry.startsWith("supabase/migrations/") && !entry.startsWith("supabase/functions/") && !entry.startsWith("packages/")
    ) &&
    // The C2a SMOKE is never part of the successor candidate — only the C2a guard is.
    !R7_C2B_SUCCESSOR_MANIFEST.includes("scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs")
);
check(
  "37e. the R7-C3 successor manifest is exactly eight named paths with only Today Intake production",
  R7_C3_SUCCESSOR_MANIFEST.length === 8 &&
    new Set(R7_C3_SUCCESSOR_MANIFEST).size === 8 &&
    R7_C3_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    R7_C3_SUCCESSOR_MANIFEST.filter((entry) => entry.startsWith("apps/")).length === 2 &&
    R7_C3_SUCCESSOR_MANIFEST.includes("apps/mobile/app/today-intake.tsx") &&
    R7_C3_SUCCESSOR_MANIFEST.includes("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts") &&
    !R7_C3_SUCCESSOR_MANIFEST.includes("scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs") &&
    !R7_C3_SUCCESSOR_MANIFEST.includes("scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs") &&
    ![CATALOG_SCREEN, CAPTURE_SCREEN, HANDOFF, SMOKE].some((entry) => R7_C3_SUCCESSOR_MANIFEST.includes(entry)) &&
    !R7_C3_SUCCESSOR_MANIFEST.some(
      (entry) => /\*/.test(entry) || entry.startsWith("supabase/") || entry.startsWith("packages/")
    ) &&
    Object.entries(C3_SUCCESSOR_DIGESTS).every(([file, expected]) => sha(file) === expected)
);
check(
  "37c. the authorised C2a guard amendment is pinned to its exact bytes, and the C2a smoke is untouched",
  sha("scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs") ===
    "d2028da074866af829f8747ab757087e326e427a195fa13e111e3f84d21dc350" &&
    sha("scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs") ===
      "6596c470fcb856346dfe926269e7a1ee47d1541508f902ead4f850143191ac86"
);
check(
  // Without this, the C2b guard is the one suite nothing else pins: silently dropping its own
  // C2a-amendment pin would leave the whole successor chain unenforced and pass every other suite.
  "37d. the C2b guard and smoke are pinned to their exact successor bytes",
  sha("scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs") ===
    "7bb9256ccdaec2a74585d9ffcfa900d12fecb10a6757658625b2cd686ccf408a" &&
    sha("scripts/restaurant-display-mi-e-c5-r7-c2b-smoke.mjs") ===
      "172ea122c073b78d7396ba02303b2e2ee3aeea0d63e8fae374b5c36d71fa215d"
);
check("38. nothing is staged for commit by the guard's own run", git(["diff", "--cached", "--name-only"]).trim() === "");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "restaurant-selection-mi-e-c5-r7-c1",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks
}, null, 2));
if (failed.length) process.exit(1);
