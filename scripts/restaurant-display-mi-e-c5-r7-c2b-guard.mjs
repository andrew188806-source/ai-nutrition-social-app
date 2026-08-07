#!/usr/bin/env node
// MI-E-C5-R7-C2b static guard — ANALYSIS RESTAURANT IDENTITY DISPLAY WIRING.
//
// R7-C1 made a durable restaurantId/branchId reach the analysis session; R7-C2a made the frozen
// presentation resolver name the exact branch from the canonical nested catalog model. Neither
// round gave the resolver a production caller, so both display sites on /analysis still rendered a
// hardcoded 未知. This round wires the two together and nothing else.
//
// POST-FREEZE LIFECYCLE-AWARE by construction. Every assertion below is either
//   (1) repository CONTENT (source invariants, or digests of content this round must not change), or
//   (2) a SUBSET assertion over uncommitted state, which is vacuously true on a clean tree.
// Nothing here requires a path to be modified, staged or untracked, so the eventual freeze commit
// cannot turn a passing guard into a failing one — the R7-B2-R3 lesson.
//
// Fully local: no network, no Supabase client, no credential, no RPC.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
// RAW, never trimmed: a `--porcelain=v1` entry for a modified-but-unstaged file begins with a
// SPACE (" M path"), so trimming the first record silently eats a character of its path.
const gitRaw = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout ?? "";
const git = (args) => gitRaw(args).trim();

// Executable source only. Every negative assertion in this file runs on comment-stripped code, so
// prose that necessarily names a forbidden token can never fail a check about code.
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("{/*")
      );
    })
    .join("\n");

const SCREEN = "apps/mobile/app/analysis.tsx";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const MAPPER = "apps/mobile/features/restaurants/catalog/mapper.ts";
const CATALOG_TYPES = "apps/mobile/features/restaurants/catalog/types.ts";
const TODAY_INTAKE_MODEL = "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts";
const TODAY_INTAKE_SCREEN = "apps/mobile/app/today-intake.tsx";
const SELECTOR = "apps/mobile/app/restaurants.tsx";
const CAPTURE = "apps/mobile/app/meal-photo.tsx";
const HANDOFF = "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts";
const SESSION = "apps/mobile/features/analysis/analysisSessionStore.ts";
const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const FINALIZATION_HOOK = "apps/mobile/features/analysis/useMealPhotoFinalization.ts";
const R3_GUARD = "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs";
const R5_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs";
const R7B_GUARD = "scripts/restaurant-durable-contract-mi-e-c5-r7-b-guard.mjs";
const R7C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const C2A_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const C2A_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs";
const R7A_GUARD = "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs";
const R7A_SMOKE = "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs";
const GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs";
const SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2b-smoke.mjs";

// The EXACT eight paths this round may introduce or change. Named individually — never a prefix,
// never a wildcard — so a NINTH path fails here rather than being silently absorbed.
//
// MI-E-C5-R7-C2b-R1 raised this from seven to eight. Four C2a checks (3/20/21/27) were written as
// that round's own non-goal fences and, as written, made C2a's declared successor impossible:
// check 3 required the resolver to have zero production callers forever. The C2a GUARD is therefore
// the authorised eighth path; the C2a SMOKE remains strictly zero-diff.
const CANDIDATE_MANIFEST = Object.freeze([
  SCREEN, R3_GUARD, R5_GUARD, R7B_GUARD, R7C1_GUARD, C2A_GUARD, GUARD, SMOKE
]);
const R2_UI_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs";
const C3_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs";
const C3_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c3-smoke.mjs";
const C3_SUCCESSOR_MANIFEST = Object.freeze([
  TODAY_INTAKE_SCREEN, TODAY_INTAKE_MODEL, C2A_GUARD, GUARD,
  R7C1_GUARD, R2_UI_GUARD, C3_GUARD, C3_SMOKE
]);
// MI-E-C5-R7-C4-R1 successor manifest — live Supabase consumer client composition repair plus the
// Development Mobile launcher. Enumerated, never a prefix. It touches no Analysis screen, resolver,
// Today Intake or finalization surface, so every C2b display fence stays in force.
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
  C3_GUARD, C2A_GUARD, GUARD, R7C1_GUARD
]);
// MI-E-C5-R7-C4-R2 refreshes three of these companion pins — the R7-A guard (its check 40 pins the
// four legacy render gates verbatim and had to learn the new mock-only spelling), the C2a guard and
// the C3 guard (both carry lifecycle digest tables that now admit the consolidated Analysis screen).
// Each moves to ONE exact reviewed value; the two SMOKES stay absolutely frozen.
const C3_COMPANION_DIGESTS = Object.freeze({
  [R7A_GUARD]: "7f3db76e58f49f26c3f4417fbf1343466083f5dc8aad78dd949470d57a2640d8",
  [R7A_SMOKE]: "2bb570c4862970dacc6ac6d24b1b829524f07f26ba6377d4dfd7d5ef9d2f00fd",
  [C2A_GUARD]: "852a1572d6819d64dd048a038aebb2d20b4253bcd115c5c6838b9ce74c69a7ff",
  [C3_GUARD]: "1ba0061bae3ac356f90068906464df6261fa81558d23910876f09be9baaef5f0",
  [C3_SMOKE]: "afbe9c8db2609bb3228adac1f0f0f1ddf75a821832ab14af71a4c2fd090c8767"
});
// MI-E-C5-R7-C4-R2 successor manifest — the exact eleven paths of the round that consolidates
// /analysis into one page and gives the real primary-result card its restaurant context. Enumerated,
// never a prefix. Exactly two are production source; the resolver, the mapper, Today Intake and every
// finalization surface stay outside it, so every C2b display fence below remains in force.
const C4_R2_SUCCESSOR_MANIFEST = Object.freeze([
  SCREEN,
  "apps/mobile/features/analysis/analysisSinglePagePresentation.ts",
  R7A_GUARD,
  R5_GUARD,
  R7C1_GUARD,
  C2A_GUARD,
  GUARD,
  C3_GUARD,
  "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs",
  "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-guard.mjs",
  "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-smoke.mjs"
]);
// MI-E-C5-R7-C4-R3 successor manifest — the exact eleven paths of the capture-seam repair round.
// Enumerated, never a prefix. Its only production entry is the capture screen; the Analysis screen,
// the resolver, Today Intake and every finalization surface stay outside it.
const C4_R3_SUCCESSOR_MANIFEST = Object.freeze([
  CAPTURE,
  "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs",
  R5_GUARD,
  R7C1_GUARD,
  C2A_GUARD,
  GUARD,
  C3_GUARD,
  "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs",
  "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-guard.mjs",
  "scripts/restaurant-capture-seam-mi-e-c5-r7-c4-r3-guard.mjs",
  "scripts/restaurant-capture-seam-mi-e-c5-r7-c4-r3-smoke.mjs"
]);

const screen = read(SCREEN);
const screenCode = stripComments(screen);
const resolverCode = stripComments(read(RESOLVER));
const r3Guard = read(R3_GUARD);
const r5Guard = read(R5_GUARD);
const r7bGuard = read(R7B_GUARD);
const r7c1Guard = read(R7C1_GUARD);

const sliceBetween = (source, from, to) => {
  const start = source.indexOf(from);
  if (start < 0) return "";
  const end = to ? source.indexOf(to, start + from.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start);
};
const editorBody = sliceBetween(screenCode, "function MealPhotoFinalizationEditor", "function MealPhotoAnalysisCandidateRow");
const completedSnapshotCard = sliceBetween(screenCode, "isDurableCompleted && completionSnapshot ?", "<CompletedAnalysisHero");
const finalizationMemo = sliceBetween(screenCode, "const finalizationContext = useMemo(", "const completeMealPhotoFinalization");

// Textual PROXIMITY is not a dependency — a prop list can put two unrelated names three lines
// apart. These helpers extract the actual gating EXPRESSIONS, so "the display never gates
// finalization" is asserted against what the code computes rather than how it is laid out.
const balancedFrom = (source, index, open, close) => {
  let depth = 0;
  for (let i = index; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return source.slice(index, i + 1);
    }
  }
  return source.slice(index);
};
const declarationExpression = (source, name) => {
  const start = source.indexOf(`const ${name} =`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "}" || ch === "]") depth -= 1;
    else if (ch === ";" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
};
const allCallArguments = (source, callee) => {
  const found = [];
  let from = 0;
  for (;;) {
    const index = source.indexOf(`${callee}(`, from);
    if (index < 0) return found;
    const open = source.indexOf("(", index);
    found.push(balancedFrom(source, open, "(", ")"));
    from = open + 1;
  }
};
const RESTAURANT_SYMBOLS =
  /restaurantContextPresentation|restaurantContextDisplayText|restaurantDisplayName|branchDisplayName|restaurantCatalog|catalogStatus/;
const gatingExpressions = [
  declarationExpression(screenCode, "submitDisabled"),
  declarationExpression(screenCode, "canFinalize"),
  declarationExpression(screenCode, "finalizationContextBlockReason"),
  declarationExpression(screenCode, "submitUnavailableReason"),
  ...allCallArguments(screenCode, "getMealPhotoFinalizationContextBlockReason")
];

// =============================================================================================
// 1. Production surface confinement (1-7)
// =============================================================================================
// Content digests, NOT worktree state: identical before and after the freeze commit.
const FROZEN = Object.freeze({
  [RESOLVER]: "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  [MAPPER]: "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  [CATALOG_TYPES]: "b67d98a9c2de1a929bd494dd176f8b69d3cbd0288a4df1947f406da094ebe98c",
  [SELECTOR]: "30f53812245508f4d7664c5e15e9b530349565dd8a81dc169371c8108ddf0cce",
  [CAPTURE]: "dccf608fa3dcec88e20a9245cc5b1a9d95b658c043c6a1a93acc8cd444f8395a",
  [HANDOFF]: "7189d67ede2528337dd40f154e080f2fa1fcf3a38582c8d330e03b0bb302e05e",
  [SESSION]: "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  [V3_CONTRACT]: "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  [FINALIZATION_HOOK]: "7d4178645730060d81fe7845ecefd682bc51ad9c76e9fcdf3ded780b269678ae",
  // The C2a SMOKE is permanently frozen — C2b-R1 does not touch it. The C2a GUARD is NOT in this
  // table: it is the authorised eighth candidate path, pinned instead by check 26 below to its exact
  // amended bytes, so an arbitrary edit to it still fails.
  [C2A_SMOKE]: "6596c470fcb856346dfe926269e7a1ee47d1541508f902ead4f850143191ac86",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs":
    "26d1937ed53c5eb49b6c4b34867a0456400de214fdc8fec8831f900f520d324c"
});
// MI-E-C5-R7-C4-R3 successor lifecycle. Exactly ONE frozen surface gains a second, EXACT value: the
// capture screen. That round appends the decoded restaurant context as beginAnalysisCapture's
// seventh argument — the function full-resets the session and re-applies the context from its own
// parameter alone, so omitting it destroyed the venue selection at capture time and made C2b's own
// display render 未知 for every venue-entered meal. The resolver, the mapper, the selector, the pure
// handoff, the session store and the finalization contract are all untouched.
const C4_R3_SUCCESSOR_DIGESTS = Object.freeze({
  [CAPTURE]: "500127929252b376bdb578ed28aa8279436eb310229b97945efaed3d186dbf7d"
});
const frozenAllowed = (file) =>
  Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, file) ? [FROZEN[file], C4_R3_SUCCESSOR_DIGESTS[file]] : [FROZEN[file]];
const digestDrift = (file) => !exists(file) || !frozenAllowed(file).includes(sha(file));
const TODAY_INTAKE_LIFECYCLE_DIGESTS = Object.freeze({
  [TODAY_INTAKE_SCREEN]: Object.freeze([
    "8697e1aa9a471e50f8da664e938e90771cb93b6ff62696b2fa5412080e17e68e",
    "d50a4cafb3613c4332ee8f6a356d6515e32082080750fdbf93a6f2aa4e323548"
  ]),
  [TODAY_INTAKE_MODEL]: Object.freeze([
    "d4403fc5e2580758c77ffd7e29052dd72383af4f3ddd3b072a9abe2cd35fa1f2",
    "aa17c6d13dab8d3975859ee385c068b22ba3d39da562f9a70e31ab4352352c29"
  ])
});

// The union of everything uncommitted AND everything that differs from HEAD. Empty on a clean
// post-freeze tree, exactly this round's candidate before it.
const worktree = gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll("\\", "/"));
const versusHead = git(["diff", "--name-only", "HEAD"]).split("\n").map((entry) => entry.trim()).filter(Boolean);
const touched = [...new Set([...worktree, ...versusHead])];
const PRODUCTION_PREFIXES = ["apps/", "packages/", "supabase/", "lib/"];
const productionTouched = touched.filter((entry) => PRODUCTION_PREFIXES.some((prefix) => entry.startsWith(prefix)));

check(
  // MI-E-C5-R7-C4-R1 adds the live-client composition surfaces. They are enumerated individually and
  // are all COMPOSITION wiring — no Analysis screen, no resolver, no Today Intake model.
  "1. production changes are confined to frozen C2b, the C3 Today Intake surface, or the exact C4-R1 composition surface",
  productionTouched.every(
    (entry) =>
      entry === SCREEN ||
      entry === TODAY_INTAKE_SCREEN ||
      entry === TODAY_INTAKE_MODEL ||
      C4_R1_SUCCESSOR_MANIFEST.includes(entry) ||
      // MI-E-C5-R7-C4-R2: the pure page-composition authority, named individually.
      C4_R2_SUCCESSOR_MANIFEST.includes(entry) ||
      // MI-E-C5-R7-C4-R3: the capture screen holding the seam, named individually.
      C4_R3_SUCCESSOR_MANIFEST.includes(entry)
  ),
  { productionTouched }
);
check("2. the R7-C2a presentation resolver is byte-identical to its frozen content", !digestDrift(RESOLVER));
check("3. the catalog mapper is byte-identical to its frozen content", !digestDrift(MAPPER));
check(
  "4. Today Intake holds either its frozen C2b bytes or exact C3 successor bytes",
  Object.entries(TODAY_INTAKE_LIFECYCLE_DIGESTS).every(([file, allowed]) => allowed.includes(sha(file)))
);
check(
  "5. the R7-C1 selector, capture handoff and pure handoff module are byte-identical to their frozen content",
  !digestDrift(SELECTOR) && !digestDrift(CAPTURE) && !digestDrift(HANDOFF) &&
    // The selector and the pure handoff have exactly ONE permitted value each; only the capture
    // screen carries the enumerated C4-R3 successor state.
    sha(SELECTOR) === FROZEN[SELECTOR] &&
    sha(HANDOFF) === FROZEN[HANDOFF]
);
check(
  "5a. the C4-R3 allowance is exactly one enumerated, genuinely distinct capture-screen digest",
  Object.keys(C4_R3_SUCCESSOR_DIGESTS).length === 1 &&
    Object.keys(C4_R3_SUCCESSOR_DIGESTS)[0] === CAPTURE &&
    FROZEN[CAPTURE] !== C4_R3_SUCCESSOR_DIGESTS[CAPTURE] &&
    [RESOLVER, MAPPER, SELECTOR, HANDOFF, SESSION, V3_CONTRACT, FINALIZATION_HOOK].every(
      (file) => !Object.hasOwn(C4_R3_SUCCESSOR_DIGESTS, file)
    )
);
check("6. the analysis session store is byte-identical to its frozen content", !digestDrift(SESSION));
check(
  "7. the finalization contract and its hook are byte-identical to their frozen content",
  !digestDrift(V3_CONTRACT) && !digestDrift(FINALIZATION_HOOK)
);

// =============================================================================================
// 2. Wiring shape (8-12)
// =============================================================================================
check(
  "8. the screen resolves the display through the catalog hook it already mounted",
  /const restaurantCatalog = useRestaurantCatalog\(\);/.test(screenCode) &&
    /findRestaurant: restaurantCatalog\.findRestaurantById/.test(screenCode)
);
check(
  "9. the catalog hook is mounted exactly once — the display introduces no second subscription",
  (screenCode.match(/useRestaurantCatalog\(\)/g) ?? []).length === 1 &&
    (screenCode.match(/createMobileRestaurantCatalogComposition/g) ?? []).length === 0
);
check(
  "10. the screen imports the frozen production resolver rather than re-implementing it",
  /from "\.\.\/features\/restaurants\/catalog\/restaurantContextPresentation";/.test(screenCode) &&
    /resolveRestaurantContextPresentation/.test(screenCode) &&
    // No parallel copy of the resolver's own decision logic in the screen.
    !/isDisplayableRestaurantName\s*\(/.test(screenCode) &&
    !/UUID_SHAPE/.test(screenCode)
);
check(
  "11. the resolver input is the session's durable restaurant identity, not a name or a route param",
  /resolveRestaurantContextPresentation\(\{[\s\S]{0,400}?restaurantId: analysis\.restaurantId,[\s\S]{0,200}?branchId: analysis\.branchId,/.test(
    screenCode
  ) &&
    // The legacy demo name is never fed to the resolver.
    !/resolveRestaurantContextPresentation\(\{[\s\S]{0,400}?analysis\.restaurantName/.test(screenCode)
);
check(
  "12. both display sites read ONE shared presentation — a single lookup, fallback and composition",
  (screenCode.match(/resolveRestaurantContextPresentation\(/g) ?? []).length === 1 &&
    (screenCode.match(/const restaurantContextDisplayText =/g) ?? []).length === 1 &&
    editorBody.length > 0 &&
    completedSnapshotCard.length > 0 &&
    /\{restaurantContextDisplayText\}/.test(editorBody) &&
    /\{restaurantContextDisplayText\}/.test(completedSnapshotCard)
);

// =============================================================================================
// 3. Display behaviour (13-20)
// =============================================================================================
check(
  "13. a resolved restaurant name can reach the screen",
  /const restaurantDisplayName = restaurantContextPresentation\.restaurantName;/.test(screenCode)
);
check(
  "14. a resolved branch name can reach the screen and is composed with the restaurant name",
  /const branchDisplayName = restaurantContextPresentation\.branchName;/.test(screenCode) &&
    /\$\{restaurantDisplayName\} · \$\{branchDisplayName\}/.test(screenCode)
);
check(
  "15. an absent or unnameable context still renders the existing 未知 fallback, with no stray separator",
  /restaurantDisplayName === null\s*\r?\n?\s*\? zhTW\.mobile\.mealPhotoFinalization\.restaurantNameUnknown/.test(screenCode) &&
    // restaurant-only renders the restaurant ALONE — the separator lives only in the both-present arm.
    /branchDisplayName === null\s*\r?\n?\s*\? restaurantDisplayName/.test(screenCode) &&
    // Neither display site can emit a raw undefined/null or an empty bracket pair.
    !/\{(?:undefined|null)\}/.test(editorBody) &&
    !/\{(?:undefined|null)\}/.test(completedSnapshotCard) &&
    !/[（(【[]\s*\{restaurantContextDisplayText\}/.test(screenCode)
);
check(
  "16. loading and unavailable catalog states are mapped to fail-soft resolver states, never invented names",
  /case "loading":\s*\r?\n\s*return "loading";/.test(screenCode) &&
    /case "unavailable":\s*\r?\n\s*return "disabled";/.test(screenCode) &&
    /case "error":\s*\r?\n\s*return "error";/.test(screenCode) &&
    // The frozen resolver returns null names for every non-success status — proven at runtime by
    // the companion smoke; asserted structurally here so a resolver regression is visible.
    /if \(input\.catalogStatus === "loading" \|\| input\.catalogStatus === "idle"\) return LOADING;/.test(resolverCode) &&
    /if \(input\.catalogStatus !== "success"\) return UNRESOLVED;/.test(resolverCode)
);
check(
  "17. the display never gates finalization: every submit/readiness expression is restaurant-free",
  // Real expressions, not adjacency: each gating declaration and every block-reason call argument
  // is extracted and inspected for any restaurant display symbol.
  gatingExpressions.length >= 5 &&
    gatingExpressions.every((expression) => !RESTAURANT_SYMBOLS.test(expression)),
  { gatingExpressionsInspected: gatingExpressions.length }
);
check(
  "18. no display name enters the finalization payload, the draft or the durable command",
  !/(restaurantContextDisplayText|restaurantDisplayName|branchDisplayName)/.test(finalizationMemo) &&
    !/restaurantName|branchName|displayName/.test(read(V3_CONTRACT)) &&
    !/restaurantName|branchName|displayName/.test(read("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts")) &&
    !/restaurantName|branchName|displayName/.test(read(FINALIZATION_HOOK))
);
check(
  "19. the screen never indexes into branches — no first-branch fallback is reintroduced",
  !/branches\[0\]/.test(screenCode) && !/\.branches\b/.test(screenCode)
);
check(
  "20. the screen never substitutes a district, location or address for a branch name",
  !/\.district/.test(screenCode) && !/match\.location/.test(screenCode) && !/\.address\b/.test(screenCode)
);

// =============================================================================================
// 4. Successor guard amendments (21-26)
// =============================================================================================
// An assertion can be neutered without deleting it: inserting `true ||` in front of a condition,
// or trailing `|| true`, makes the check pass unconditionally while every name-based assertion about
// it still succeeds. None of these guards legitimately contains such a construct, so its presence is
// itself the defect.
const UNCONDITIONAL_PASS = /\btrue\s*\|\||\|\|\s*true\b|,\s*true\s*\)/;
check(
  "21. the R3 guard is amended to a conditional fallback authority, not deleted or hard-passed",
  /restaurant display still has no authority of its own/.test(r3Guard) &&
    /the display value is resolved by the frozen production resolver/.test(r3Guard) &&
    // The absolute pre-C2b assertion is gone…
    !/\/\\\{copy\\\.restaurantNameUnknown\\\}\/\.test\(body\)/.test(r3Guard) &&
    // …and no check anywhere in the file was short-circuited to an unconditional pass.
    !UNCONDITIONAL_PASS.test(r3Guard) &&
    (r3Guard.match(/^check\(/gm) ?? []).length >= 23
);
check(
  "22. the R5 UI guard keeps check 11 and adds explicit successor clauses, removing none",
  // FULL titles, not "11a." prefixes: renaming a check to "11a. removed" would satisfy a prefix
  // test while deleting the assertion it names.
  r5Guard.includes('"11. the restaurant row still has no authority of its own, and 未知 remains the unnameable-context fallback"') &&
    r5Guard.includes('"11a. the editor and the completed snapshot card render ONE shared presentation, not two lookups"') &&
    r5Guard.includes('"11b. a resolved restaurant / branch may replace the fallback (the display is conditional, not fixed)"') &&
    r5Guard.includes('"11c. the display wiring adds no second 「加入今日飲食」 action and no second finalization write"') &&
    r5Guard.includes('"11d. the display wiring does not touch primary/alternative candidate flow, photo placement or post-success navigation"') &&
    (r5Guard.match(/^check\(/gm) ?? []).length >= 168 &&
    !UNCONDITIONAL_PASS.test(r5Guard)
);
check(
  "22a. no successor guard amended this round was neutered by an unconditional-pass short circuit",
  !UNCONDITIONAL_PASS.test(r7bGuard) && !UNCONDITIONAL_PASS.test(r7c1Guard) && !UNCONDITIONAL_PASS.test(read(C2A_GUARD))
);
check(
  "23. the R7-B check 47 amendment is exact: the resolver ban is lifted, every other fence is kept",
  /"47\. the screen may display resolver-provided names, but introduces no restaurant selector"/.test(r7bGuard) &&
    /"47a\. the screen never writes the durable restaurant identity/.test(r7bGuard) &&
    /"47b\. the screen performs no lookup of its own/.test(r7bGuard) &&
    /"47c\. no display name may enter the durable command payload/.test(r7bGuard) &&
    // Not hard-true, and not a wildcard that would accept any screen content.
    !/check\(\s*"47[^"]*",\s*true\s*\)/.test(r7bGuard) &&
    // The selector ban and the fallback requirement survive verbatim.
    /!\/選擇餐廳\/\.test\(screenCode\)/.test(r7bGuard) &&
    /\/restaurantNameUnknown\/\.test\(screenCode\)/.test(r7bGuard)
);
check(
  "24. the R7-B migration lifecycle authority (checks 43-46) and the B smoke are untouched",
  /"43\. /.test(r7bGuard) &&
    /"44\. /.test(r7bGuard) &&
    /"45\. /.test(r7bGuard) &&
    /"46\. no Edge Function and no packages\/shared file is touched"/.test(r7bGuard) &&
    !digestDrift("scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs")
);
check(
  "25. the R7-C1 guard carries the frozen resolver and exact frozen R7-A authority",
  // The screen's pin tracks this round's content…
  r7c1Guard.includes(`"${SCREEN}": "${sha(SCREEN)}"`) &&
    // …and the resolver stays frozen while the two R7-A pins move only to their reviewed successor bytes.
    r7c1Guard.includes(FROZEN[RESOLVER]) &&
    r7c1Guard.includes(C3_COMPANION_DIGESTS[R7A_GUARD]) &&
    r7c1Guard.includes(C3_COMPANION_DIGESTS[R7A_SMOKE])
);
const c2aGuard = read(C2A_GUARD);
check(
  "26. the C2a smoke and both R7-A suites are exact frozen bytes",
  !digestDrift(C2A_SMOKE) &&
    sha(R7A_GUARD) === C3_COMPANION_DIGESTS[R7A_GUARD] &&
    sha(R7A_SMOKE) === C3_COMPANION_DIGESTS[R7A_SMOKE]
);
check(
  "26a. the C2a guard carries EXACTLY the authorised successor amendment, pinned to its bytes",
  sha(C2A_GUARD) === C3_COMPANION_DIGESTS[C2A_GUARD]
);
check(
  "26b. the amended C2a guard admits analysis.tsx as the ONLY new production caller",
  // Three enumerated lifecycle states, never a prefix rule and never an unconditional pass.
  /const CALLER_STATE_FROZEN = \[RESOLVER\]/.test(c2aGuard) &&
    /const CALLER_STATE_C2B = \[RESOLVER, ANALYSIS_SCREEN\]/.test(c2aGuard) &&
    /const CALLER_STATE_C3 = \[RESOLVER, ANALYSIS_SCREEN, TODAY_INTAKE_SCREEN\]/.test(c2aGuard) &&
    /3a\. C3 adds only Today Intake as the final named production caller/.test(c2aGuard) &&
    !/check\(\s*"3[^"]*",\s*true\s*\)/.test(c2aGuard)
);
check(
  "26c. the amended C2a guard keeps every resolver-correctness fence intact",
  // The district / flattened-location / positional-fallback fences and the nested-lookup assertions
  // are the substance of C2a and must survive the amendment untouched.
  /"8\. branch matching is by EXACT durable branchId"/.test(c2aGuard) &&
    /"9\. the displayed branch value is the branch's own name"/.test(c2aGuard) &&
    /"10\. no district \/ address \/ flattened location is used as a branch name"/.test(c2aGuard) &&
    /"11\. there is no positional branch fallback anywhere"/.test(c2aGuard) &&
    c2aGuard.includes("!/match\\.location/.test(resolverCode)") &&
    c2aGuard.includes("!/branches\\[0\\]/.test(resolverCode)") &&
    // The resolver itself is now permanently pinned inside the C2a guard too.
    c2aGuard.includes(FROZEN[RESOLVER])
);
check(
  "26d. the amended C2a guard keeps C2b exact-eight and the exact C3 eight-path manifest",
  /const C2B_R1_MANIFEST = Object\.freeze\(\[/.test(c2aGuard) &&
    /C2B_R1_MANIFEST\.length === 8/.test(c2aGuard) &&
    /C3_SUCCESSOR_MANIFEST\.length === 8/.test(c2aGuard) &&
    // Lifecycle-aware, not lifecycle-dependent: no requirement that anything be modified/untracked.
    !/worktree\.includes\(/.test(c2aGuard) &&
    !/\.length === C2B_R1_MANIFEST\.length/.test(c2aGuard) &&
    // No blanket escape hatch was introduced by the amendment.
    !/process\.env\.[A-Z_]*(SKIP|BYPASS|FORCE|DISABLE)/.test(c2aGuard) &&
    !/(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/.test(c2aGuard)
);

// =============================================================================================
// 5. Manifest, lifecycle and safety (27-32)
// =============================================================================================
check(
  "27. the candidate manifest is exactly eight named paths, never a prefix or a wildcard",
  CANDIDATE_MANIFEST.length === 8 &&
    new Set(CANDIDATE_MANIFEST).size === 8 &&
    // The C2a smoke is never a candidate; only the C2a guard is.
    !CANDIDATE_MANIFEST.includes(C2A_SMOKE) &&
    CANDIDATE_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry) && exists(entry)) &&
    // No protected surface may hide inside the manifest.
    CANDIDATE_MANIFEST.every((entry) => !Object.keys(FROZEN).includes(entry)) &&
    // Exactly one production path.
    CANDIDATE_MANIFEST.filter((entry) => PRODUCTION_PREFIXES.some((prefix) => entry.startsWith(prefix))).length === 1
);
const outsideManifest = touched.filter((entry) => !CANDIDATE_MANIFEST.includes(entry));
const outsideC3Manifest = touched.filter((entry) => !C3_SUCCESSOR_MANIFEST.includes(entry));
const outsideC4R1Manifest = touched.filter((entry) => !C4_R1_SUCCESSOR_MANIFEST.includes(entry));
const outsideC4R2Manifest = touched.filter((entry) => !C4_R2_SUCCESSOR_MANIFEST.includes(entry));
const outsideC4R3Manifest = touched.filter((entry) => !C4_R3_SUCCESSOR_MANIFEST.includes(entry));
check(
  "28. uncommitted changes are confined to the C2b, C3 or exact C4-R1 manifest, and clean committed state passes",
  outsideManifest.length === 0 ||
    outsideC3Manifest.length === 0 ||
    outsideC4R1Manifest.length === 0 ||
    outsideC4R2Manifest.length === 0 ||
    outsideC4R3Manifest.length === 0,
  { touched: touched.length, outsideManifest, outsideC3Manifest, outsideC4R2Manifest, outsideC4R3Manifest }
);
check(
  "28e. the C4-R3 successor is exactly eleven named paths, one production file, no protected surface",
  C4_R3_SUCCESSOR_MANIFEST.length === 11 &&
    new Set(C4_R3_SUCCESSOR_MANIFEST).size === 11 &&
    C4_R3_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C4_R3_SUCCESSOR_MANIFEST.filter((entry) => PRODUCTION_PREFIXES.some((prefix) => entry.startsWith(prefix))).length === 1 &&
    C4_R3_SUCCESSOR_MANIFEST.includes(CAPTURE) &&
    // Only the capture screen may be a frozen surface inside it; everything else stays untouchable.
    C4_R3_SUCCESSOR_MANIFEST.filter((entry) => Object.keys(FROZEN).includes(entry)).join(",") === CAPTURE &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(SCREEN) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_SCREEN) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    !C4_R3_SUCCESSOR_MANIFEST.includes(SMOKE) &&
    !C4_R3_SUCCESSOR_MANIFEST.some(
      (entry) => /\*/.test(entry) || entry.startsWith("supabase/") || entry.startsWith("packages/")
    )
);
check(
  "28d. the C4-R2 successor is exactly eleven named paths, two production files, no protected surface",
  C4_R2_SUCCESSOR_MANIFEST.length === 11 &&
    new Set(C4_R2_SUCCESSOR_MANIFEST).size === 11 &&
    C4_R2_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C4_R2_SUCCESSOR_MANIFEST.filter((entry) => PRODUCTION_PREFIXES.some((prefix) => entry.startsWith(prefix))).length === 2 &&
    C4_R2_SUCCESSOR_MANIFEST.includes(SCREEN) &&
    C4_R2_SUCCESSOR_MANIFEST.includes("apps/mobile/features/analysis/analysisSinglePagePresentation.ts") &&
    // No permanently frozen surface, no Today Intake production path and no smoke may hide inside it.
    C4_R2_SUCCESSOR_MANIFEST.every((entry) => !Object.keys(FROZEN).includes(entry)) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(RESOLVER) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(MAPPER) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_SCREEN) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(C3_SMOKE) &&
    !C4_R2_SUCCESSOR_MANIFEST.includes(SMOKE) &&
    !C4_R2_SUCCESSOR_MANIFEST.some(
      (entry) => /\*/.test(entry) || entry.startsWith("supabase/") || entry.startsWith("packages/")
    )
);
check(
  "28b. the C3 successor is exactly eight named paths, two Today Intake production paths and reviewed companion bytes",
  C3_SUCCESSOR_MANIFEST.length === 8 &&
    new Set(C3_SUCCESSOR_MANIFEST).size === 8 &&
    C3_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C3_SUCCESSOR_MANIFEST.filter((entry) => PRODUCTION_PREFIXES.some((prefix) => entry.startsWith(prefix))).length === 2 &&
    C3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_SCREEN) &&
    C3_SUCCESSOR_MANIFEST.includes(TODAY_INTAKE_MODEL) &&
    !C3_SUCCESSOR_MANIFEST.includes(R7A_GUARD) &&
    !C3_SUCCESSOR_MANIFEST.includes(R7A_SMOKE) &&
    !C3_SUCCESSOR_MANIFEST.includes(RESOLVER) &&
    !C3_SUCCESSOR_MANIFEST.includes(MAPPER) &&
    !C3_SUCCESSOR_MANIFEST.some((entry) => /\*/.test(entry) || entry.startsWith("supabase/") || entry.startsWith("packages/")) &&
    Object.entries(C3_COMPANION_DIGESTS).every(([file, expected]) => sha(file) === expected)
);
const resolverCallers = gitRaw(["grep", "-l", "resolveRestaurantContextPresentation", "--", "apps/", "packages/"])
  .split("\n")
  .map((entry) => entry.trim().replaceAll("\\", "/"))
  .filter(Boolean)
  .sort();
check(
  "28c. C3 has exactly two named production screen callers in addition to the resolver",
  JSON.stringify(resolverCallers) === JSON.stringify([RESOLVER, SCREEN, TODAY_INTAKE_SCREEN].sort()),
  resolverCallers
);
const guardSource = read(GUARD);
const guardCode = stripComments(guardSource);
check(
  "28a. this guard is lifecycle-AWARE: it never requires a path to be modified, staged or untracked",
  !/worktree\.includes\(/.test(guardCode) &&
    !/versusHead\.includes\(/.test(guardCode) &&
    !/touched\.includes\(/.test(guardCode) &&
    !/\.length === CANDIDATE_MANIFEST\.length/.test(guardCode) &&
    !/touched\.length (?:>|===) 0/.test(guardCode) &&
    // Both lifecycle checks are subset assertions, so an empty tree satisfies them.
    /productionTouched\.every\(/.test(guardCode) &&
    /outsideManifest\.length === 0/.test(guardCode)
);
check(
  "29. no candidate path contains remote-operation code",
  CANDIDATE_MANIFEST.every((entry) => {
    const code = stripComments(read(entry));
    return (
      !/https?:\/\//.test(code) &&
      !/createClient\s*\(/.test(code) &&
      !/functions\.invoke\s*\(/.test(code) &&
      !/\.rpc\s*\(/.test(code) &&
      !/\bfetch\s*\(/.test(code) &&
      !/supabase\s+(?:db|functions|migration)\s+push/.test(code)
    );
  })
);
// Fragment-assembled so the literal patterns never appear in this file's own source and the scan
// cannot trip over its own definition.
const SECRET_PATTERNS = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\."].join("")),
  new RegExp(["service", "_role"].join("") + "[\"'\\s:=]+[A-Za-z0-9_-]{12,}"),
  new RegExp(["sb", "p_"].join("") + "[A-Za-z0-9]{16,}"),
  new RegExp(["Authoriz", "ation:\\s*Bearer\\s+[A-Za-z0-9_.-]{12,}"].join(""))
];
check(
  "30. no candidate path contains an actual secret, token, key or authorization header value",
  CANDIDATE_MANIFEST.every((entry) => {
    const text = read(entry);
    return !SECRET_PATTERNS.some((pattern) => pattern.test(text));
  })
);
check(
  "31. this guard contains no temporary bypass, skip flag or environment escape hatch",
  !/process\.env\.[A-Z_]*(SKIP|BYPASS|FORCE|DISABLE)/.test(guardCode) &&
    !/\|\|\s*true\b/.test(guardCode) &&
    !/check\([^,]+,\s*true\s*\)/.test(guardCode) &&
    !/process\.exit\(0\)/.test(guardCode) &&
    // The failure path is real.
    /if \(failed\.length\) process\.exit\(1\);/.test(guardSource)
);
// Fragment-assembled for the same reason as the secret patterns: a check that forbids a token must
// not contain that token literally, or it fails on its own source.
const COMMIT_ALLOWANCE_PATTERNS = [
  /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/,
  new RegExp(["rev", "-parse"].join("")),
  new RegExp(["\\bHEAD", "~|\\bHEAD\\^"].join(""))
];
check(
  "32. this guard grants no allowance to a specific commit — no 40-hex SHA and no commit-resolution call",
  !COMMIT_ALLOWANCE_PATTERNS.some((pattern) => pattern.test(guardCode))
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "restaurant-display-mi-e-c5-r7-c2b",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
