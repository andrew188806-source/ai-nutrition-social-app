#!/usr/bin/env node
// MI-E-C5-R7-C2a static guard — multi-branch restaurant context resolver correctness.
//
// POST-FREEZE LIFECYCLE-AWARE BY CONSTRUCTION. Following MI-E-C5-R7-B2-R3, this guard never asserts
// that a path is modified, untracked, staged, or absent from HEAD, and never special-cases a HEAD.
// Every assertion is repository CONTENT, a PROTECTED-SURFACE digest, or an explicitly optional
// candidate-state diagnostic that is vacuous on a clean tree — so it holds identically before and
// after the freeze commit.
//
// Scope: this round corrects the RESOLVER only. It deliberately adds no production caller and shows
// no name on any screen; wiring the Analysis display is R7-C2b.
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

const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const R7A_GUARD = "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs";
const R7A_SMOKE = "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs";
const R7C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs";
const CANDIDATE_MANIFEST = Object.freeze([RESOLVER, R7A_GUARD, R7A_SMOKE, R7C1_GUARD, GUARD, SMOKE]);

// =============================================================================================
// MI-E-C5-R7-C2b-R1 SUCCESSOR AUTHORITY
//
// Four of this guard's checks (3, 20, 21, 27) were written as C2a-round non-goal / candidate-
// lifecycle fences. They were correct for C2a, which deliberately corrected the resolver WITHOUT
// giving it a caller — but as written they also made C2a's own declared successor impossible:
// check 3 required the resolver to have zero production callers forever, and check 20 required the
// R7-C1 guard to keep the pre-C2b analysis.tsx digest forever.
//
// The amendment below makes those four checks LIFECYCLE-AWARE rather than round-locked. Each now
// accepts exactly two states — the frozen C2a state, and the exact C2b successor state — and
// nothing else. No wildcard, no prefix exception, no hard-true, no specific-HEAD bypass. Every
// resolver-correctness assertion (checks 4-16) and every other fence is untouched.
// =============================================================================================
const ANALYSIS_SCREEN = "apps/mobile/app/analysis.tsx";
const R7B_GUARD = "scripts/restaurant-durable-contract-mi-e-c5-r7-b-guard.mjs";
const R3_GUARD = "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs";
const R5_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs";
const C2B_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs";
const C2B_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2b-smoke.mjs";

// The EXACT eight paths of the C2b-R1 successor candidate. Named individually — never a prefix,
// never a wildcard — so a ninth path fails. Exactly one is a production file.
const C2B_R1_MANIFEST = Object.freeze([
  ANALYSIS_SCREEN, R3_GUARD, R5_GUARD, R7B_GUARD, R7C1_GUARD, GUARD, C2B_GUARD, C2B_SMOKE
]);
const TODAY_INTAKE_SCREEN = "apps/mobile/app/today-intake.tsx";
const TODAY_INTAKE_MODEL = "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts";
const R2_UI_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs";
const C3_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs";
const C3_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c3-smoke.mjs";
const C3_SUCCESSOR_MANIFEST = Object.freeze([
  TODAY_INTAKE_SCREEN, TODAY_INTAKE_MODEL, GUARD, C2B_GUARD,
  R7C1_GUARD, R2_UI_GUARD, C3_GUARD, C3_SMOKE
]);
// MI-E-C5-R7-C4-R1 successor manifest — repairs live Supabase consumer client composition and the
// Development Mobile launcher. Enumerated, never a prefix. It contains no resolver, mapper, catalog
// type or Analysis surface, so every C2a correctness fence below stays fully in force.
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
  C3_GUARD, GUARD, C2B_GUARD, R7C1_GUARD
]);

// The two digests C2b is authorised to move, pinned to the ACTUAL successor candidate bytes. An
// arbitrary edit to either file fails: only these exact contents are accepted as the successor
// state, and only the frozen values are accepted as the pre-C2b state.
const C2A_FROZEN_DIGESTS = Object.freeze({
  [ANALYSIS_SCREEN]: "426bced651c2b3ea8d6f3d69d4ab3c6e2f532e8c9e767b338c8ae9d53ef300c8",
  [R7B_GUARD]: "2b2eb7f32a0a31242254dd0d8b1ba01b9d1ee9aceaf98335d281b90e2c859c7b"
});
const C2B_SUCCESSOR_DIGESTS = Object.freeze({
  [ANALYSIS_SCREEN]: "0c3488138597249ca15506db65cb7d4aaa3a88ca1c041dd9aa912acc1b6c5cd2",
  [R7B_GUARD]: "86972f1e557d20faa1f048d6e81f4698fe9940332f16cddf607c343250ce4f83"
});
const C3_FROZEN_DIGESTS = Object.freeze({
  [TODAY_INTAKE_SCREEN]: "8697e1aa9a471e50f8da664e938e90771cb93b6ff62696b2fa5412080e17e68e",
  [TODAY_INTAKE_MODEL]: "d4403fc5e2580758c77ffd7e29052dd72383af4f3ddd3b072a9abe2cd35fa1f2"
});
const C3_SUCCESSOR_DIGESTS = Object.freeze({
  [TODAY_INTAKE_SCREEN]: "d50a4cafb3613c4332ee8f6a356d6515e32082080750fdbf93a6f2aa4e323548",
  [TODAY_INTAKE_MODEL]: "aa17c6d13dab8d3975859ee385c068b22ba3d39da562f9a70e31ab4352352c29"
});
const R7A_FROZEN_DIGESTS = Object.freeze({
  [R7A_GUARD]: "3740e2532b5c7a3bc6228a352833b3ca378fc1422de59efda620eb33e79e5100",
  [R7A_SMOKE]: "2bb570c4862970dacc6ac6d24b1b829524f07f26ba6377d4dfd7d5ef9d2f00fd"
});
const C3_COMPANION_DIGESTS = Object.freeze({
  [C3_GUARD]: "1ba0061bae3ac356f90068906464df6261fa81558d23910876f09be9baaef5f0",
  [C3_SMOKE]: "afbe9c8db2609bb3228adac1f0f0f1ddf75a821832ab14af71a4c2fd090c8767"
});
// MI-E-C5-R7-C4-R2 successor state. That round consolidates /analysis into ONE page: the legacy
// catalog-recognition world (catalogCandidateAdapter → candidateResolver → topCandidate.branchName,
// which is what put 南京復興店 and the fixed menu/price/nutrition on a live screen) becomes reachable
// only from an explicitly mock runtime, and the REAL primary-result card finally receives this
// round's own resolver output. That requires exactly two of C2a's pinned files to move: the Analysis
// screen, and the R7-A guard whose check 40 pins the four legacy render gates verbatim.
//
// Enumerated individually, each to ONE exact successor value. Every C2a resolver-correctness fence
// (checks 4-16) and every permanently protected surface below is untouched.
const C4_R2_SUCCESSOR_DIGESTS = Object.freeze({
  [ANALYSIS_SCREEN]: "ffb37b1ab876280dd8e777ae00a37b4bfda582100abc89a113c5fefac8706c49",
  [R7A_GUARD]: "7f3db76e58f49f26c3f4417fbf1343466083f5dc8aad78dd949470d57a2640d8"
});
const C4_R2_COMPOSITION = "apps/mobile/features/analysis/analysisSinglePagePresentation.ts";
const C4_R2_GUARD = "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-guard.mjs";
const C4_R2_SMOKE = "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-smoke.mjs";
const C4_R1_GUARD = "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs";
const R5_UI_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs";
const C4_R2_SUCCESSOR_MANIFEST = Object.freeze([
  ANALYSIS_SCREEN, C4_R2_COMPOSITION,
  R7A_GUARD, R5_UI_GUARD, R7C1_GUARD, GUARD, C2B_GUARD, C3_GUARD, C4_R1_GUARD,
  C4_R2_GUARD, C4_R2_SMOKE
]);
const r7aGuardAllowedDigests = Object.freeze([
  R7A_FROZEN_DIGESTS[R7A_GUARD],
  C4_R2_SUCCESSOR_DIGESTS[R7A_GUARD]
]);
// True only in the exact successor state; used to select which lifecycle branch is authoritative.
const inC2bSuccessorState =
  exists(ANALYSIS_SCREEN) && sha(ANALYSIS_SCREEN) === C2B_SUCCESSOR_DIGESTS[ANALYSIS_SCREEN];
const inC4R2SuccessorState =
  exists(ANALYSIS_SCREEN) && sha(ANALYSIS_SCREEN) === C4_R2_SUCCESSOR_DIGESTS[ANALYSIS_SCREEN];

const resolver = read(RESOLVER);
// Executable source only: the module's comments legitimately name the old flattened model, the
// mapper's branches[0] collapse and the district field while explaining why none of them is used.
const resolverCode = resolver
  .split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
  .join("\n");

// =============================================================================================
// 1. Production surface scope (1-4)
// =============================================================================================
check("1. the only production path in this candidate is the resolver", CANDIDATE_MANIFEST.filter((p) => !p.startsWith("scripts/")).join(",") === RESOLVER);
check("2. the resolver exists at the canonical catalog path", exists(RESOLVER));
const productionCallers = git(["grep", "-l", "resolveRestaurantContextPresentation", "--", "apps/", "packages/"])
  .split("\n")
  .map((line) => line.trim().replaceAll("\\", "/"))
  .filter(Boolean)
  .sort();
// Exactly two legal states, both stated as EXACT sorted path lists.
const CALLER_STATE_FROZEN = [RESOLVER].sort();
const CALLER_STATE_C2B = [RESOLVER, ANALYSIS_SCREEN].sort();
const CALLER_STATE_C3 = [RESOLVER, ANALYSIS_SCREEN, TODAY_INTAKE_SCREEN].sort();
const callerList = JSON.stringify(productionCallers);
check(
  "3. resolver callers are exactly the frozen C2a, C2b, or named C3 lifecycle state",
  callerList === JSON.stringify(CALLER_STATE_FROZEN) ||
    callerList === JSON.stringify(CALLER_STATE_C2B) ||
    callerList === JSON.stringify(CALLER_STATE_C3),
  productionCallers
);
check(
  "3a. C3 adds only Today Intake as the final named production caller; every other surface is rejected",
  // Enumerated individually rather than by prefix, so a fourth caller cannot inherit an allowance.
  !productionCallers.includes(TODAY_INTAKE_MODEL) &&
    !productionCallers.includes("apps/mobile/app/restaurants.tsx") &&
    !productionCallers.includes("apps/mobile/app/meal-photo.tsx") &&
    !productionCallers.includes("apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts") &&
    !productionCallers.some((entry) => entry.startsWith("packages/")) &&
    !productionCallers.some((entry) => entry.startsWith("apps/admin-web/") || entry.startsWith("apps/restaurant-web/")) &&
    productionCallers.includes(RESOLVER) &&
    productionCallers.filter((entry) => entry !== RESOLVER).length <= 2 &&
    productionCallers.every(
      (entry) => entry === RESOLVER || entry === ANALYSIS_SCREEN || entry === TODAY_INTAKE_SCREEN
    )
);
check(
  "4. the resolver stays pure — no React, network, repository or storage of its own",
  !/useState|useEffect|createClient|fetch\(|new Supabase|AsyncStorage|SecureStore/.test(resolverCode)
);

// =============================================================================================
// 2. Canonical nested lookup (5-11) — the actual defect correction
// =============================================================================================
check(
  "5. the lookup result type is the CANONICAL nested catalog restaurant model",
  /import type \{ CatalogRestaurantViewModel \} from "\.\/types";/.test(resolver) &&
    /findRestaurant: \(restaurantId: string\) => CatalogRestaurantViewModel \| null;/.test(resolverCode)
);
check(
  "6. the flattened card model is no longer referenced in executable source",
  !/RestaurantCardViewModel/.test(resolverCode)
);
check(
  "7. the branch is resolved from the nested branches collection",
  /match\.branches\.find\(/.test(resolverCode)
);
check(
  "8. branch matching is by EXACT durable branchId",
  /match\.branches\.find\(\(candidate\) => candidate\.branchId === input\.branchId\)/.test(resolverCode)
);
check(
  "9. the displayed branch value is the branch's own name",
  /const branchName = branch && isDisplayableRestaurantName\(branch\.name\) \? branch\.name : null;/.test(resolverCode)
);
check(
  "10. no district / address / flattened location is used as a branch name",
  !/match\.location/.test(resolverCode) && !/\.district/.test(resolverCode) && !/\.address/.test(resolverCode)
);
check(
  "11. there is no positional branch fallback anywhere",
  !/branches\[0\]/.test(resolverCode) && !/branches\.at\(0\)/.test(resolverCode) && !/branches\[\d+\]/.test(resolverCode)
);

// =============================================================================================
// 3. Preserved state contract (12-16)
// =============================================================================================
check(
  "12. restaurant-only remains legal: no branchId means no branch name",
  /const branch = input\.branchId\s*\r?\n?\s*\? match\.branches\.find/.test(resolverCode) && /: null;/.test(resolverCode)
);
check(
  "13. an unknown branch is fail-soft — the restaurant still resolves",
  /kind: "resolved",\s*\r?\n?\s*restaurantName: match\.name,\s*\r?\n?\s*branchName/.test(resolverCode)
);
check(
  "14. loading / idle still report loading, and every non-success status is unresolved",
  /if \(input\.catalogStatus === "loading" \|\| input\.catalogStatus === "idle"\) return LOADING;/.test(resolverCode) &&
    /if \(input\.catalogStatus !== "success"\) return UNRESOLVED;/.test(resolverCode)
);
check(
  "15. a catalog miss and a UUID-shaped name still fail closed",
  /if \(!match \|\| !isDisplayableRestaurantName\(match\.name\)\) return UNRESOLVED;/.test(resolverCode)
);
check(
  "16. the presentation output shape and its immutability are unchanged",
  /kind: RestaurantContextPresentationKind;\s*\r?\n\s*restaurantName: string \| null;\s*\r?\n\s*branchName: string \| null;/.test(resolver) &&
    /return Object\.freeze\(\{/.test(resolverCode)
);

// =============================================================================================
// 4. Companion authority updates (17-20)
// =============================================================================================
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
const r7aGuard = read(R7A_GUARD);
const r7aSmoke = read(R7A_SMOKE);
const r7aSmokeCode = stripComments(r7aSmoke);
const r7c1Guard = read(R7C1_GUARD);
check(
  // The R7-A guard stores its expectation as an ESCAPED regex literal, so this matches the literal
  // exactly as it appears in that file rather than the unescaped runtime form.
  "17. the R7-A guard now pins the nested-branch authority instead of the flattened comparison",
  r7aGuard.includes("match\\.branches\\.find\\(\\(candidate\\) => candidate\\.branchId === input\\.branchId\\)") &&
    /CatalogRestaurantViewModel/.test(r7aGuard) &&
    !r7aGuard.includes("input\\.branchId && match\\.branchId === input\\.branchId")
);
check(
  // Scoped to EXECUTABLE smoke source: the fixture's comment legitimately quotes the old
  // district-as-branch-name assertion while explaining why it was wrong.
  "18. the R7-A smoke no longer asserts a district as the branch name",
  !/branchName === "中山區"/.test(r7aSmokeCode) && /branchName === "中山店"/.test(r7aSmokeCode) &&
    /branchName === "大安店"/.test(r7aSmokeCode)
);
check(
  "19. the R7-A smoke fixture supplies canonical nested branches with name !== district",
  /branches: \[/.test(r7aSmoke) && /name: "中山店", district: "中山區"/.test(r7aSmoke) &&
    /name: "大安店", district: "大安區"/.test(r7aSmoke)
);
check(
  // Plain substring comparison: a constructed RegExp needs path escaping that is easy to get wrong,
  // and these are exact literals in the R7-C1 guard's pin table.
  //
  // MI-E-C5-R7-C2b-R1: the C2a authority this check exists to protect is the RESOLVER and R7-A
  // trio, and that part is unchanged. What is relaxed is only the analysis.tsx pin, which C2b is
  // explicitly authorised to refresh — and even then only to the exact successor bytes, never to an
  // arbitrary value.
  // MI-E-C5-R7-C4-R2: the resolver and R7-A SMOKE pins stay absolute. Only the R7-A GUARD pin gains
  // a second, exact value, because C4-R2 is authorised to amend that guard's check 40 legacy-gate
  // spelling — and even then only to the reviewed successor bytes, never to an arbitrary value.
  "20. the R7-C1 guard carries the frozen resolver and exact frozen R7-A authority",
  r7c1Guard.includes(`"${RESOLVER}": "${sha(RESOLVER)}"`) &&
    r7c1Guard.includes(`"${R7A_GUARD}": "${sha(R7A_GUARD)}"`) &&
    r7c1Guard.includes(`"${R7A_SMOKE}": "${sha(R7A_SMOKE)}"`) &&
    sha(RESOLVER) === "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789" &&
    sha(R7A_SMOKE) === R7A_FROZEN_DIGESTS[R7A_SMOKE] &&
    r7aGuardAllowedDigests.includes(sha(R7A_GUARD))
);
check(
  "20a. the R7-C1 analysis.tsx pin is EITHER the frozen C2a digest or the exact C2b successor digest",
  r7c1Guard.includes(`"${ANALYSIS_SCREEN}": "${C2A_FROZEN_DIGESTS[ANALYSIS_SCREEN]}"`) ||
    (r7c1Guard.includes(`"${ANALYSIS_SCREEN}": "${C2B_SUCCESSOR_DIGESTS[ANALYSIS_SCREEN]}"`) &&
      // A refreshed pin must describe the file that is actually on disk — not a stale or invented one.
      sha(ANALYSIS_SCREEN) === C2B_SUCCESSOR_DIGESTS[ANALYSIS_SCREEN]) ||
    // MI-E-C5-R7-C4-R2 third lifecycle state, held to the same rule: the refreshed pin must be the
    // exact reviewed successor value AND must describe the file actually on disk.
    (r7c1Guard.includes(`"${ANALYSIS_SCREEN}": "${C4_R2_SUCCESSOR_DIGESTS[ANALYSIS_SCREEN]}"`) &&
      sha(ANALYSIS_SCREEN) === C4_R2_SUCCESSOR_DIGESTS[ANALYSIS_SCREEN])
);
// The manifest DECLARATION itself, not a proximity window: a fixed character budget after the
// symbol name runs straight past the array literal into unrelated code, where an ordinary
// `startsWith` (or a protective negative prefix fence) would trip a check about how the manifest is
// built. Extract the Object.freeze array and inspect only that.
const r7c1SuccessorDeclaration = (() => {
  const marker = "const R7_C2B_SUCCESSOR_MANIFEST = Object.freeze([";
  const start = r7c1Guard.indexOf(marker);
  if (start < 0) return null;
  const end = r7c1Guard.indexOf("]);", start);
  return end < 0 ? null : r7c1Guard.slice(start, end + 3);
})();
check(
  "20b. in the successor state the R7-C1 guard declares the exact C2b successor manifest",
  !inC2bSuccessorState ||
    (r7c1SuccessorDeclaration !== null &&
      // Every one of the eight paths is named literally in the declaration…
      C2B_R1_MANIFEST.every(
        (entry) => r7c1SuccessorDeclaration.includes(`"${entry}"`) || r7c1Guard.includes(`"${entry}"`)
      ) &&
      // …and the declaration is an enumerated list, never a prefix or glob rule.
      !/startsWith\(|\*|RegExp|match\(/.test(r7c1SuccessorDeclaration) &&
      // The R7-C1 guard must also assert the eight-path count itself.
      /R7_C2B_SUCCESSOR_MANIFEST\.length === 8/.test(r7c1Guard))
);
const r7c1C4R2Declaration = (() => {
  const marker = "const R7_C4_R2_SUCCESSOR_MANIFEST = Object.freeze([";
  const start = r7c1Guard.indexOf(marker);
  if (start < 0) return null;
  const end = r7c1Guard.indexOf("]);", start);
  return end < 0 ? null : r7c1Guard.slice(start, end + 3);
})();
check(
  "20c. in the C4-R2 successor state the R7-C1 guard declares the exact eleven-path C4-R2 manifest",
  !inC4R2SuccessorState ||
    (r7c1C4R2Declaration !== null &&
      // Every one of the eleven paths is named literally…
      C4_R2_SUCCESSOR_MANIFEST.every((entry) => r7c1C4R2Declaration.includes(`"${entry}"`) || r7c1Guard.includes(`"${entry}"`)) &&
      // …and the declaration is an enumerated list, never a prefix or glob rule.
      !/startsWith\(|\*|RegExp|match\(/.test(r7c1C4R2Declaration) &&
      // The R7-C1 guard must also assert the eleven-path count itself.
      /R7_C4_R2_SUCCESSOR_MANIFEST\.length === 11/.test(r7c1Guard))
);

// =============================================================================================
// 5. Protected zero-diff surfaces (21-25)
// =============================================================================================
// PERMANENTLY protected — byte-identical in BOTH the frozen and the successor state. C2b is not
// authorised to touch any of these, so no lifecycle branch exists for them. The resolver, the
// catalog types and the C2a smoke are added here by C2b-R1: after the C2a freeze they are immutable,
// so pinning them is a strengthening, not a relaxation.
const PROTECTED = Object.freeze({
  [RESOLVER]: "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  "apps/mobile/features/restaurants/catalog/mapper.ts": "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  "apps/mobile/features/restaurants/catalog/types.ts": "b67d98a9c2de1a929bd494dd176f8b69d3cbd0288a4df1947f406da094ebe98c",
  "apps/mobile/app/restaurants.tsx": "30f53812245508f4d7664c5e15e9b530349565dd8a81dc169371c8108ddf0cce",
  "apps/mobile/app/meal-photo.tsx": "dccf608fa3dcec88e20a9245cc5b1a9d95b658c043c6a1a93acc8cd444f8395a",
  "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts":
    "7189d67ede2528337dd40f154e080f2fa1fcf3a38582c8d330e03b0bb302e05e",
  "apps/mobile/features/analysis/analysisSessionStore.ts": "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  "apps/mobile/features/meal-identification-finalization/v3Contract.ts": "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  "apps/mobile/features/analysis/useMealPhotoFinalization.ts": "7d4178645730060d81fe7845ecefd682bc51ad9c76e9fcdf3ded780b269678ae",
  [SMOKE]: "6596c470fcb856346dfe926269e7a1ee47d1541508f902ead4f850143191ac86",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs": "26d1937ed53c5eb49b6c4b34867a0456400de214fdc8fec8831f900f520d324c"
});
// MI-E-C5-R7-C4-R3 successor lifecycle. Exactly ONE of these permanently protected surfaces gains a
// second, EXACT value: the capture screen. That round appends the decoded restaurant context as
// beginAnalysisCapture's seventh argument — the function full-resets the session and re-applies the
// context from its own parameter alone, so omitting it destroyed the venue selection at capture time
// and made /analysis render 未知. It touches no resolver, mapper, catalog type or catalog surface,
// so every C2a correctness fence stays fully in force.
const C4_R3_SUCCESSOR_DIGESTS = Object.freeze({
  "apps/mobile/app/meal-photo.tsx": "500127929252b376bdb578ed28aa8279436eb310229b97945efaed3d186dbf7d"
});
const protectedAllowed = (file) =>
  Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, file) ? [PROTECTED[file], C4_R3_SUCCESSOR_DIGESTS[file]] : [PROTECTED[file]];
const drift = Object.keys(PROTECTED).filter((file) => !exists(file) || !protectedAllowed(file).includes(sha(file)));
check("21. every permanently protected surface is byte-identical to its frozen content", drift.length === 0, drift);
check(
  "21f. the C4-R3 allowance is exactly one enumerated, genuinely distinct capture-screen digest",
  Object.keys(C4_R3_SUCCESSOR_DIGESTS).length === 1 &&
    Object.keys(C4_R3_SUCCESSOR_DIGESTS)[0] === "apps/mobile/app/meal-photo.tsx" &&
    Object.keys(C4_R3_SUCCESSOR_DIGESTS).every((file) => Object.hasOwn(PROTECTED, file)) &&
    Object.keys(C4_R3_SUCCESSOR_DIGESTS).every((file) => PROTECTED[file] !== C4_R3_SUCCESSOR_DIGESTS[file]) &&
    // The resolver, the mapper, the catalog types, the selector and the pure handoff are NOT reopened.
    !Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, RESOLVER) &&
    !Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, "apps/mobile/features/restaurants/catalog/mapper.ts") &&
    !Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, "apps/mobile/features/restaurants/catalog/types.ts") &&
    !Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, "apps/mobile/app/restaurants.tsx") &&
    !Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts")
);
const c3ContentDrift = Object.keys(C3_FROZEN_DIGESTS).filter((file) => {
  if (!exists(file)) return true;
  const actual = sha(file);
  return actual !== C3_FROZEN_DIGESTS[file] && actual !== C3_SUCCESSOR_DIGESTS[file];
});
check(
  "21c. Today Intake production surfaces are either frozen C2b bytes or exact C3 successor bytes",
  c3ContentDrift.length === 0,
  c3ContentDrift
);
const r7aContentDrift = Object.keys(R7A_FROZEN_DIGESTS).filter((file) => {
  if (!exists(file)) return true;
  // MI-E-C5-R7-C4-R2: the SMOKE remains absolutely frozen. The GUARD holds either its frozen bytes
  // or the exact C4-R2 successor bytes — a two-state enumeration, never a free pass.
  const allowed = file === R7A_GUARD ? r7aGuardAllowedDigests : [R7A_FROZEN_DIGESTS[file]];
  return !allowed.includes(sha(file));
});
check(
  "21d. R7-A suites hold exact HEAD frozen bytes",
  r7aContentDrift.length === 0,
  r7aContentDrift
);
check(
  "21e. the R7-A guard allowance is exactly two enumerated, genuinely distinct digests",
  r7aGuardAllowedDigests.length === 2 &&
    new Set(r7aGuardAllowedDigests).size === 2 &&
    r7aGuardAllowedDigests[0] === R7A_FROZEN_DIGESTS[R7A_GUARD] &&
    // The R7-A SMOKE never gains a lifecycle branch.
    !Object.hasOwn(C4_R2_SUCCESSOR_DIGESTS, R7A_SMOKE) &&
    // Nor does the resolver, the mapper, the catalog types or any permanently protected surface.
    Object.keys(C4_R2_SUCCESSOR_DIGESTS).every((file) => !Object.hasOwn(PROTECTED, file)) &&
    Object.keys(C4_R2_SUCCESSOR_DIGESTS).length === 2 &&
    Object.keys(C4_R2_SUCCESSOR_DIGESTS).every((file) => file === ANALYSIS_SCREEN || file === R7A_GUARD)
);
// The two former members of this table that C2b IS authorised to move. Each may hold exactly one of
// two values — the C2a freeze bytes, or the C2b successor bytes — and nothing else. This is an
// enumerated two-state exception, not a prefix exception and not a free pass.
// MI-E-C5-R7-C4-R2 adds a THIRD enumerated state for the analysis screen only. The R7-B guard keeps
// exactly its two states, so the exception never widens beyond the file the successor round touches.
const exceptionDrift = Object.keys(C2A_FROZEN_DIGESTS).filter((file) => {
  if (!exists(file)) return true;
  const allowed = [C2A_FROZEN_DIGESTS[file], C2B_SUCCESSOR_DIGESTS[file]];
  if (Object.hasOwn(C4_R2_SUCCESSOR_DIGESTS, file)) allowed.push(C4_R2_SUCCESSOR_DIGESTS[file]);
  return !allowed.includes(sha(file));
});
check(
  "21a. the two C2b-authorised surfaces hold either their frozen or their exact successor content",
  exceptionDrift.length === 0,
  exceptionDrift
);
check(
  "21b. the successor exception is exactly two enumerated paths, never a prefix or a wildcard",
  Object.keys(C2A_FROZEN_DIGESTS).length === 2 &&
    Object.keys(C2B_SUCCESSOR_DIGESTS).length === 2 &&
    Object.keys(C2A_FROZEN_DIGESTS).every((file) => Object.hasOwn(C2B_SUCCESSOR_DIGESTS, file)) &&
    Object.keys(C2A_FROZEN_DIGESTS).every((file) => file === ANALYSIS_SCREEN || file === R7B_GUARD) &&
    // The two states must be genuinely different, so "either value" can never collapse to "any value".
    Object.keys(C2A_FROZEN_DIGESTS).every((file) => C2A_FROZEN_DIGESTS[file] !== C2B_SUCCESSOR_DIGESTS[file]) &&
    // Nothing permanently protected may also appear in the exception table.
    Object.keys(C2A_FROZEN_DIGESTS).every((file) => !Object.hasOwn(PROTECTED, file))
);
check(
  "22. the catalog mapper is NOT modified to accommodate the resolver",
  !CANDIDATE_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    /restaurant\.branchId = restaurant\.branches\[0\]\?\.branchId;/.test(read("apps/mobile/features/restaurants/catalog/mapper.ts"))
);
check(
  "23. no analysis screen, Today Intake, selector or handoff path is in this candidate",
  !CANDIDATE_MANIFEST.some((p) =>
    /app\/analysis\.tsx|app\/today-intake\.tsx|todayIntakeUiModel|app\/restaurants\.tsx|app\/meal-photo\.tsx|analysisRestaurantHandoff/.test(p)
  )
);
check(
  "24. this candidate introduces no migration, Edge Function or packages change",
  CANDIDATE_MANIFEST.every((p) => !p.startsWith("supabase/") && !p.startsWith("packages/"))
);
check(
  "25. the candidate manifest is exactly the six approved paths",
  CANDIDATE_MANIFEST.length === 6 && new Set(CANDIDATE_MANIFEST).size === 6 && CANDIDATE_MANIFEST.every(exists)
);

// =============================================================================================
// 6. Hygiene and candidate-state diagnostics (26-28)
// =============================================================================================
check(
  // The resolver and smoke are scanned in full. This guard cannot scan ITSELF for these tokens —
  // the line below necessarily contains them as the forbidding pattern — so it is asserted instead
  // to contain no executable remote call of its own.
  "26. no remote-operation code and no secret pattern in this candidate",
  ![resolver, read(SMOKE)].some((source) =>
    /sbp_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}|service_role|SUPABASE_ACCESS_TOKEN|\.rpc\s*\(|supabase\.co/.test(source)
  ) &&
    !/fetch\(|createClient|\.rpc\(/.test(stripComments(read(GUARD)).replace(/\/[^\n]*\/\.test\(/g, ""))
);
const worktree = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
// Lifecycle-AWARE, never lifecycle-DEPENDENT. Three states are accepted, each an EXACT named list:
//   (1) a clean frozen repository — the empty worktree is a subset of both lists,
//   (2) the exact C2a six-path candidate shape,
//   (3) the exact C2b-R1 or C3 eight-path candidate shape.
// Nothing must be modified or untracked for the guard to pass, and no other shape is accepted.
const outsideC2a = worktree.filter((file) => !CANDIDATE_MANIFEST.includes(file));
const outsideC2bR1 = worktree.filter((file) => !C2B_R1_MANIFEST.includes(file));
const outsideC3 = worktree.filter((file) => !C3_SUCCESSOR_MANIFEST.includes(file));
const outsideC4R1 = worktree.filter((file) => !C4_R1_SUCCESSOR_MANIFEST.includes(file));
const outsideC4R2 = worktree.filter((file) => !C4_R2_SUCCESSOR_MANIFEST.includes(file));
// MI-E-C5-R7-C4-R3 successor manifest — the exact eleven paths of the capture-seam repair round.
const C4_R3_SUCCESSOR_MANIFEST = Object.freeze([
  "apps/mobile/app/meal-photo.tsx",
  "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs",
  R5_UI_GUARD,
  R7C1_GUARD,
  GUARD,
  C2B_GUARD,
  C3_GUARD,
  C4_R1_GUARD,
  C4_R2_GUARD,
  "scripts/restaurant-capture-seam-mi-e-c5-r7-c4-r3-guard.mjs",
  "scripts/restaurant-capture-seam-mi-e-c5-r7-c4-r3-smoke.mjs"
]);
const outsideC4R3 = worktree.filter((file) => !C4_R3_SUCCESSOR_MANIFEST.includes(file));
check(
  "27. any uncommitted change is confined to the C2a, C2b-R1, C3 or exact C4-R1 manifest (vacuous when clean)",
  outsideC2a.length === 0 ||
    outsideC2bR1.length === 0 ||
    outsideC3.length === 0 ||
    outsideC4R1.length === 0 ||
    outsideC4R2.length === 0 ||
    outsideC4R3.length === 0,
  { worktreeEntries: worktree.length, outsideC2a, outsideC2bR1, outsideC3, outsideC4R1, outsideC4R2, outsideC4R3 }
);
check(
  "27e. the C4-R3 successor manifest is exactly eleven named paths and reaches no C2a-protected surface",
  C4_R3_SUCCESSOR_MANIFEST.length === 11 &&
    new Set(C4_R3_SUCCESSOR_MANIFEST).size === 11 &&
    C4_R3_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C4_R3_SUCCESSOR_MANIFEST.filter((entry) => !entry.startsWith("scripts/")).length === 1 &&
    C4_R3_SUCCESSOR_MANIFEST.includes("apps/mobile/app/meal-photo.tsx") &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(RESOLVER) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(ANALYSIS_SCREEN) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_SCREEN) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(SMOKE) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(R7A_SMOKE) &&
    C4_R3_SUCCESSOR_MANIFEST.every(
      (entry) => !entry.startsWith("supabase/") && !entry.startsWith("packages/") && !/\*/.test(entry)
    )
);
check(
  "27d. the C4-R2 successor manifest is exactly eleven named paths and reaches no C2a-protected surface",
  C4_R2_SUCCESSOR_MANIFEST.length === 11 &&
    new Set(C4_R2_SUCCESSOR_MANIFEST).size === 11 &&
    C4_R2_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    // Exactly two production files: the Analysis screen and this round's own pure composition module.
    C4_R2_SUCCESSOR_MANIFEST.filter((entry) => !entry.startsWith("scripts/")).length === 2 &&
    C4_R2_SUCCESSOR_MANIFEST.includes(ANALYSIS_SCREEN) &&
    C4_R2_SUCCESSOR_MANIFEST.includes(C4_R2_COMPOSITION) &&
    // The resolver, the mapper, the catalog types, Today Intake, the R7-A smoke and the C2a smoke are
    // all outside it, so no C2a correctness authority can be reopened through the successor round.
    !C4_R2_SUCCESSOR_MANIFEST.includes(RESOLVER) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    !C4_R2_SUCCESSOR_MANIFEST.includes("apps/mobile/features/restaurants/catalog/types.ts") &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_SCREEN) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(R7A_SMOKE) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(SMOKE) &&
    C4_R2_SUCCESSOR_MANIFEST.every(
      (entry) => !entry.startsWith("supabase/") && !entry.startsWith("packages/") && !/\*/.test(entry)
    )
);
check(
  "27c. the C4-R1 successor manifest is exactly thirteen named paths and reaches no C2a-protected surface",
  C4_R1_SUCCESSOR_MANIFEST.length === 13 &&
    new Set(C4_R1_SUCCESSOR_MANIFEST).size === 13 &&
    !C4_R1_SUCCESSOR_MANIFEST.includes(RESOLVER) &&
    !C4_R1_SUCCESSOR_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    !C4_R1_SUCCESSOR_MANIFEST.includes(ANALYSIS_SCREEN) &&
    !C4_R1_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    C4_R1_SUCCESSOR_MANIFEST.every((entry) => !entry.startsWith("supabase/") && !entry.startsWith("packages/"))
);
check(
  "27a. the C2b-R1 manifest is exactly eight named paths with exactly one production file",
  C2B_R1_MANIFEST.length === 8 &&
    new Set(C2B_R1_MANIFEST).size === 8 &&
    C2B_R1_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C2B_R1_MANIFEST.filter((entry) => !entry.startsWith("scripts/")).length === 1 &&
    C2B_R1_MANIFEST.includes(ANALYSIS_SCREEN) &&
    // This guard is the authorised eighth path; the C2a smoke is NOT in the successor candidate.
    C2B_R1_MANIFEST.includes(GUARD) &&
    !C2B_R1_MANIFEST.includes(SMOKE)
);
check(
  "27b. no successor manifest may reach the resolver, the mapper, Today Intake, packages, functions or migrations",
  !C2B_R1_MANIFEST.includes(RESOLVER) &&
    !C2B_R1_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    !C2B_R1_MANIFEST.includes("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts") &&
    !C2B_R1_MANIFEST.includes("apps/mobile/app/today-intake.tsx") &&
    C2B_R1_MANIFEST.every(
      (entry) => !entry.startsWith("packages/") && !entry.startsWith("supabase/")
    ) &&
    // Every accepted script is named; no arbitrary scripts/ path is admitted by prefix.
    C2B_R1_MANIFEST.every((entry) => entry !== "scripts/" && !/\*/.test(entry))
);
check(
  "27c. the C3 successor manifest is exactly eight named paths and reopens only Today Intake production",
  C3_SUCCESSOR_MANIFEST.length === 8 &&
    new Set(C3_SUCCESSOR_MANIFEST).size === 8 &&
    C3_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C3_SUCCESSOR_MANIFEST.filter((entry) => entry.startsWith("apps/")).length === 2 &&
    C3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_SCREEN) &&
    C3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    !C3_SUCCESSOR_MANIFEST.includes(R7A_GUARD) &&
    !C3_SUCCESSOR_MANIFEST.includes(R7A_SMOKE) &&
    !C3_SUCCESSOR_MANIFEST.includes(RESOLVER) &&
    !C3_SUCCESSOR_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    C3_SUCCESSOR_MANIFEST.every((entry) => !entry.startsWith("packages/") && !entry.startsWith("supabase/")) &&
    !C3_SUCCESSOR_MANIFEST.some((entry) => /\*/.test(entry)) &&
    Object.entries(C3_COMPANION_DIGESTS).every(([file, expected]) => sha(file) === expected)
);
check("28. nothing is staged by the guard's own run", git(["diff", "--cached", "--name-only"]).trim() === "");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "restaurant-display-mi-e-c5-r7-c2a",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks
}, null, 2));
if (failed.length) process.exit(1);
