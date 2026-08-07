#!/usr/bin/env node
// MI-E-C5-R7-C4-R2 static guard — ANALYSIS SINGLE-PAGE CONSOLIDATION + RESTAURANT CONTEXT.
//
// What this round repaired, and what this guard therefore has to make unrepresentable:
//
//   /analysis rendered TWO mutually exclusive UI worlds off one TIMING predicate. While a live
//   analysis was running, `!hasAiFinalizationFlow` was true, so the legacy catalog-recognition world
//   rendered on a `supabase-live` screen: catalogCandidateAdapter flattened every branch of every
//   restaurant, candidateResolver ranked them by restaurant NAME text alone, and the top candidate's
//   branchName was displayed. That is where 南京復興店, the fixed menu name, the fixed price and the
//   fixed nutrition came from — a path that never consults the durable branchId at all. On
//   completion the entire legacy tree unmounted and the primary-result tree mounted, which is what
//   made one route feel like a second page and what made the restaurant context disappear exactly
//   when the user needed it, because MealPhotoAnalysisResultCard never received it.
//
// POST-FREEZE LIFECYCLE-AWARE by construction. Every assertion is either (1) repository CONTENT, or
// (2) a SUBSET assertion over uncommitted state, which is vacuously true on a clean tree. Nothing
// requires a path to be modified, staged or untracked, so the freeze commit cannot turn a passing
// guard into a failing one.
//
// Fully local: no network, no Supabase client, no credential, no RPC, no deploy.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const digestOf = (source) => createHash("sha256").update(source).digest("hex");
// RAW, never trimmed: a `--porcelain=v1` entry for a modified-but-unstaged file begins with a SPACE
// (" M path"), so trimming the first record silently eats a character of its path.
const gitRaw = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).stdout ?? "";
const git = (args) => gitRaw(args).trim();
const trackedTreeDigest = (relative) => {
  const files = git(["ls-files", "-z", "--", relative]).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    // Attribute-aware blob identity, so this authority is independent of checkout CRLF/LF settings
    // while still hashing the actual worktree content.
    hash.update(file);
    hash.update("\0");
    hash.update(git(["hash-object", "--path", file, file]));
  }
  return hash.digest("hex");
};

// Executable source only. Every negative assertion runs on comment-stripped code, so prose that
// necessarily names a forbidden token (南京復興店, branches[0], district…) can never fail a check
// about code.
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

// ---- real-module execution ---------------------------------------------------------------------
// Mutation proofs must show a BEHAVIOURAL kill, not only a text difference, so mutated production
// sources are transpiled and executed in memory. Nothing on disk is ever written.
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
// `source` is the (possibly mutated) text of the module under test; every module it imports is
// loaded from DISK, so a mutation is confined to exactly the one authority being probed.
const evaluateTsSource = (source, relative) => {
  const absolute = path.join(root, relative);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolute
  });
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved relative import ${specifier} from ${relative}`);
    return evaluateTsSource(fs.readFileSync(resolved, "utf8"), path.relative(root, resolved).replaceAll("\\", "/"));
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
};
const evaluateTs = (source, relative) => evaluateTsSource(source, relative);

// =============================================================================================
// Paths
// =============================================================================================
const SCREEN = "apps/mobile/app/analysis.tsx";
const COMPOSITION = "apps/mobile/features/analysis/analysisSinglePagePresentation.ts";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const MAPPER = "apps/mobile/features/restaurants/catalog/mapper.ts";
const CATALOG_TYPES = "apps/mobile/features/restaurants/catalog/types.ts";
const CATALOG_ADAPTER = "apps/mobile/features/meal-identification/catalogCandidateAdapter.ts";
const CANDIDATE_RESOLVER = "apps/mobile/features/meal-identification/candidateResolver.ts";
const SESSION = "apps/mobile/features/analysis/analysisSessionStore.ts";
const DRAFT = "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts";
const READINESS = "apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts";
const FINALIZATION_HOOK = "apps/mobile/features/analysis/useMealPhotoFinalization.ts";
const ANALYSIS_HOOK = "apps/mobile/features/analysis/useMealPhotoAnalysis.ts";
const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const SELECTOR = "apps/mobile/app/restaurants.tsx";
const CAPTURE = "apps/mobile/app/meal-photo.tsx";
const HANDOFF = "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts";
const TODAY_INTAKE_SCREEN = "apps/mobile/app/today-intake.tsx";
const TODAY_INTAKE_MODEL = "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts";
const I18N = "lib/i18n/zh-TW.ts";

const R7A_GUARD = "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs";
const R7A_SMOKE = "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs";
const R5_UI_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs";
const C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const C2A_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const C2A_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs";
const C2B_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs";
const C2B_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2b-smoke.mjs";
const C3_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs";
const C3_SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c3-smoke.mjs";
const C4_R1_GUARD = "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs";
const GUARD = "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-guard.mjs";
const SMOKE = "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-smoke.mjs";

// The EXACT eleven paths this round may introduce or change. Named individually — never a prefix,
// never a wildcard — so a TWELFTH path fails here rather than being silently absorbed. Exactly two
// are production source: the screen this round consolidates, and the pure composition authority it
// consolidates through. Every other entry is a predecessor guard whose own frozen assertion this
// round is explicitly authorised to amend, or this round's own suite.
const CANDIDATE_MANIFEST = Object.freeze([
  SCREEN, COMPOSITION,
  R7A_GUARD, R5_UI_GUARD, C1_GUARD, C2A_GUARD, C2B_GUARD, C3_GUARD, C4_R1_GUARD,
  GUARD, SMOKE
]);
const EXPECTED_MANIFEST_LENGTH = 11;
const exactManifestAuthority = (manifest) =>
  manifest.length === EXPECTED_MANIFEST_LENGTH &&
  new Set(manifest).size === EXPECTED_MANIFEST_LENGTH &&
  manifest.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
  manifest.filter((entry) => entry.startsWith("apps/")).length === 2 &&
  manifest.every((entry) => !/\*/.test(entry) && !entry.startsWith("supabase/") && !entry.startsWith("packages/"));

// PERMANENTLY protected content. The explicit non-goals of this round are at the top: the legacy
// catalogCandidateAdapter and candidateResolver keep their exact bytes, because their LOGIC was
// never the defect — a live runtime rendering them was.
const PROTECTED = Object.freeze({
  [CATALOG_ADAPTER]: "136c61858148c656cc49717549a1b9b7ec7efbe0e016654e5d029e49eb35044a",
  [CANDIDATE_RESOLVER]: "a4c9450957c7fc59d5975866ca281cbfe2ba4726feab6ba3a4a1fa0351164639",
  [RESOLVER]: "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  [MAPPER]: "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  [CATALOG_TYPES]: "b67d98a9c2de1a929bd494dd176f8b69d3cbd0288a4df1947f406da094ebe98c",
  [SESSION]: "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  [DRAFT]: "6134780ad5bfb7d32fc18899d3068de77fdd5739f71cb3247f7cd47e1a56d66e",
  [READINESS]: "cf1883daad80046c8a8e52a2af1eecd8ee000e1fc5cded4dc9f0d54c73af0a21",
  [FINALIZATION_HOOK]: "7d4178645730060d81fe7845ecefd682bc51ad9c76e9fcdf3ded780b269678ae",
  [ANALYSIS_HOOK]: "765e5ff80f4bcfd6a00aceb0304bd7688852c82fc0b0e57ec9afe372259fc5c2",
  [V3_CONTRACT]: "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  [SELECTOR]: "30f53812245508f4d7664c5e15e9b530349565dd8a81dc169371c8108ddf0cce",
  [CAPTURE]: "dccf608fa3dcec88e20a9245cc5b1a9d95b658c043c6a1a93acc8cd444f8395a",
  [HANDOFF]: "7189d67ede2528337dd40f154e080f2fa1fcf3a38582c8d330e03b0bb302e05e",
  [TODAY_INTAKE_SCREEN]: "d50a4cafb3613c4332ee8f6a356d6515e32082080750fdbf93a6f2aa4e323548",
  [TODAY_INTAKE_MODEL]: "aa17c6d13dab8d3975859ee385c068b22ba3d39da562f9a70e31ab4352352c29",
  [I18N]: "67fbde46de1f54b79b8bd86430fae9199a1e0a537c78de202a968033a7886739",
  [R7A_SMOKE]: "2bb570c4862970dacc6ac6d24b1b829524f07f26ba6377d4dfd7d5ef9d2f00fd",
  [C2A_SMOKE]: "6596c470fcb856346dfe926269e7a1ee47d1541508f902ead4f850143191ac86",
  [C2B_SMOKE]: "172ea122c073b78d7396ba02303b2e2ee3aeea0d63e8fae374b5c36d71fa215d",
  [C3_SMOKE]: "afbe9c8db2609bb3228adac1f0f0f1ddf75a821832ab14af71a4c2fd090c8767"
});

const screen = read(SCREEN);
const screenCode = stripComments(screen);
const composition = read(COMPOSITION);
const compositionCode = stripComments(composition);
const resolverSource = read(RESOLVER);

const sliceBetween = (source, from, to) => {
  const start = source.indexOf(from);
  if (start < 0) return "";
  const end = to ? source.indexOf(to, start + from.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start);
};
const resultCardBody = sliceBetween(screenCode, "function MealPhotoAnalysisResultCard", "function MealPhotoFinalizationSubsection");
const resultCardCall = sliceBetween(screenCode, "<MealPhotoAnalysisResultCard", "onChooseManual={chooseManualMealInput}");
const editorBody = sliceBetween(screenCode, "function MealPhotoFinalizationEditor", "function MealPhotoAnalysisCandidateRow");
const completedSnapshotCard = sliceBetween(screenCode, "isDurableCompleted && completionSnapshot ?", "<CompletedAnalysisHero");
const finalizationMemo = sliceBetween(screenCode, "const finalizationContext = useMemo(", "const completeMealPhotoFinalization");
const externalDiningBody = sliceBetween(screenCode, "function ExternalDiningAnalysis", "function CandidateCorrectionList");
const correctionListBody = sliceBetween(screenCode, "function CandidateCorrectionList", "function CandidateResolutionState");

// Textual PROXIMITY is not a dependency. These helpers extract the actual gating EXPRESSIONS, so
// "the restaurant display never gates finalization" is asserted against what the code computes.
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
const gatingExpressionsOf = (source) => [
  declarationExpression(source, "acceptBlocked"),
  declarationExpression(source, "submitDisabled"),
  declarationExpression(source, "canFinalize"),
  declarationExpression(source, "finalizationContextBlockReason"),
  declarationExpression(source, "submitUnavailableReason"),
  ...allCallArguments(source, "getMealPhotoFinalizationContextBlockReason")
];

// ---- canonical Development fixture, shared by the executed authorities -------------------------
const RESTAURANT = "dev-restaurant-haochu";
const RESTAURANT_NAME = "好廚健康碗 Development";
const B_NANJING = "dev-branch-nanjing";
const B_XINYI = "dev-branch-xinyi";
const catalogBranch = (branchId, name, district) => ({
  branchId,
  restaurantId: RESTAURANT,
  name,
  district,
  address: `${district}測試路 1 號`,
  menus: []
});
const CATALOG = {
  id: RESTAURANT,
  restaurantId: RESTAURANT,
  branchId: B_NANJING,
  name: RESTAURANT_NAME,
  location: "松山區",
  branches: [catalogBranch(B_NANJING, "南京復興店", "松山區"), catalogBranch(B_XINYI, "信義安和店", "大安區")]
};
const runResolver = (source) => {
  const resolve = evaluateTs(source, RESOLVER).resolveRestaurantContextPresentation;
  return resolve({
    restaurantId: RESTAURANT,
    branchId: B_XINYI,
    catalogStatus: "success",
    findRestaurant: () => CATALOG
  });
};
const runComposition = (source) => evaluateTs(source, COMPOSITION).composeAnalysisPage;
const livePage = (compose, over = {}) =>
  compose({
    runtimeMode: "supabase",
    invocationStatus: "completed",
    isDurableCompleted: false,
    finalizationEditorOpen: false,
    ...over
  });

// =============================================================================================
// 1. Restaurant context reaches the REAL primary result (1-5)
// =============================================================================================
check(
  "1. the live primary-result card receives the shared restaurant context as a prop",
  /restaurantContextDisplayText: string;/.test(resultCardBody) &&
    /restaurantContextDisplayText=\{restaurantContextDisplayText\}/.test(resultCardCall) &&
    /\{restaurantContextDisplayText\}/.test(resultCardBody)
);
check(
  "2. the value comes from the ONE frozen R7-C2a resolver call this screen already performs",
  (screenCode.match(/resolveRestaurantContextPresentation\(/g) ?? []).length === 1 &&
    (screenCode.match(/const restaurantContextDisplayText =/g) ?? []).length === 1 &&
    /from "\.\.\/features\/restaurants\/catalog\/restaurantContextPresentation";/.test(screenCode) &&
    sha(RESOLVER) === PROTECTED[RESOLVER] &&
    // The resolver's own decision logic is never re-implemented in the screen or the card.
    !/isDisplayableRestaurantName\s*\(/.test(screenCode)
);
check(
  "3. the card performs no parallel branch lookup and mounts no second catalog subscription",
  !/findRestaurantById/.test(resultCardBody) &&
    !/useRestaurantCatalog/.test(resultCardBody) &&
    (screenCode.match(/useRestaurantCatalog\(\)/g) ?? []).length === 1 &&
    !/createMobileRestaurantCatalogComposition|RestaurantCatalogService/.test(screenCode)
);
check(
  "4. no positional branch fallback exists anywhere in the screen or the composition",
  !/branches\[0\]/.test(screenCode) &&
    !/\.branches\b/.test(screenCode) &&
    !/branches\[0\]|\.branches\b/.test(compositionCode)
);
check(
  "5. no district, address or flattened location may stand in for a branch name",
  !/\.district/.test(screenCode) &&
    !/\.address\b/.test(screenCode) &&
    !/match\.location/.test(screenCode) &&
    !/\.district|\.address\b|\.location\b/.test(compositionCode)
);

// =============================================================================================
// 2. Legacy fixture retirement and mock isolation (6-7)
// =============================================================================================
const LEGACY_GATES = [
  /\{showLegacyAnalysisBlocks && analysis\.isSelfCooked \? \(\s*\r?\n?\s*<SelfCookedIntro/,
  /\) : showLegacyAnalysisBlocks && isAnalysisConfirmed \? \(\s*\r?\n?\s*<CompletedAnalysisHero/,
  /\) : showLegacyAnalysisBlocks \? \(\s*\r?\n?\s*<ExternalDiningAnalysis/,
  /\{showLegacyAnalysisBlocks && !analysis\.isSelfCooked && analysis\.matchState === "editing" \? \(\s*\r?\n?\s*<CandidateCorrectionList/
];
const legacyGateAuthority = (source) => LEGACY_GATES.every((pattern) => pattern.test(source));
const mockOnlyAuthority = (source) =>
  /const mock = isMockAnalysisRuntime\(input\.runtimeMode\);/.test(source) &&
  /showLegacyFixtureWorld:\s*\r?\n?\s*mock && !hasAiFinalizationFlowForStatus\(input\.invocationStatus\) && !input\.isDurableCompleted/.test(
    source
  );
check(
  "6. every legacy fixture block is unreachable in supabase-live: the gate is RUNTIME MODE, not timing",
  legacyGateAuthority(screenCode) &&
    /const showLegacyAnalysisBlocks = analysisPage\.showLegacyFixtureWorld;/.test(screenCode) &&
    mockOnlyAuthority(compositionCode) &&
    /runtimeMode: consumerRuntime\.mode,/.test(screenCode) &&
    // The frozen legacy fixture components still exist for mock, but each has exactly ONE element
    // site, and every one of those sites is behind the mock-only gate asserted above.
    (screenCode.match(/<ExternalDiningAnalysis/g) ?? []).length === 1 &&
    (screenCode.match(/<CandidateCorrectionList/g) ?? []).length === 1 &&
    (screenCode.match(/<SelfCookedIntro/g) ?? []).length === 1 &&
    // `!hasAiFinalizationFlow` alone may no longer gate any legacy fixture render.
    !/!hasAiFinalizationFlow \? \(\s*\r?\n?\s*<ExternalDiningAnalysis/.test(screenCode) &&
    !/!hasAiFinalizationFlow && analysis\.isSelfCooked/.test(screenCode) &&
    !/!hasAiFinalizationFlow && !analysis\.isSelfCooked/.test(screenCode)
);
const LEGACY_FIXTURE_SYMBOLS = [
  "analysis.restaurantName",
  "analysis.nutritionSummary",
  "topCandidate",
  "candidateResolution",
  "resolveCatalogMealCandidates",
  "adaptRestaurantCatalogCandidates",
  "nutritionProvenanceLabel"
];
const liveCardIsFixtureFreeAuthority = (source) =>
  LEGACY_FIXTURE_SYMBOLS.every((symbol) => !source.includes(symbol));
check(
  "7. mock fixtures stay isolated: no fixed restaurant, menu, price or nutrition symbol reaches the live card",
  liveCardIsFixtureFreeAuthority(resultCardBody) &&
    // The fixed menu / price / provenance rendering still lives ONLY inside the two mock-only
    // legacy components, which is what makes it unreachable rather than merely hidden.
    /topCandidate\?\.restaurantName/.test(externalDiningBody) &&
    /topCandidate\.menuName/.test(externalDiningBody) &&
    /candidate\.menuName/.test(correctionListBody) &&
    // The live card's nutrition is the AI estimate for THIS photo, never a catalog/demo summary.
    /primary\.estimatedNutrition\.calories/.test(resultCardBody) &&
    !/analysis\.nutritionSummary/.test(resultCardBody) &&
    // The mock badge is explicit, rendered once, and gated on the mock runtime alone.
    /\{consumerRuntimeMode === "mock" \? <Text style=\{styles\.disclaimer\}>\{copy\.mockBadge\}<\/Text> : null\}/.test(
      resultCardBody
    ) &&
    (screenCode.match(/copy\.mockBadge/g) ?? []).length === 1
);

// =============================================================================================
// 3. Exactly one of everything in the live flow (8-11)
// =============================================================================================
const singleHostAuthority = (source) =>
  /export type AnalysisMetadataControlHost =\s*\r?\n\s*\| "none"\s*\r?\n\s*\| "result_card"\s*\r?\n\s*\| "finalization_editor"\s*\r?\n\s*\| "legacy_standalone";/.test(
    source
  ) && /const metadataControlHost: AnalysisMetadataControlHost = input\.isDurableCompleted/.test(source);
const controlSiteAuthority = (source, element) => (source.match(new RegExp(`<${element}`, "g")) ?? []).length === 3;
check(
  "8. exactly one meal-slot control set can render: three enumerated hosts, one chosen by a single enum",
  singleHostAuthority(compositionCode) &&
    controlSiteAuthority(screenCode, "MealPeriodSection") &&
    (screenCode.match(/function MealPeriodSection/g) ?? []).length === 1 &&
    /analysisPage\.metadataControlHost !== "result_card" \? null : \(/.test(screenCode) &&
    /analysisPage\.metadataControlHost !== "legacy_standalone" \? null : \(/.test(screenCode)
);
check(
  "9. exactly one dining-mode control set can render",
  singleHostAuthority(compositionCode) &&
    controlSiteAuthority(screenCode, "MealSourceSection") &&
    (screenCode.match(/function MealSourceSection/g) ?? []).length === 1
);
check(
  "10. exactly one current/backfill timing control set can render",
  singleHostAuthority(compositionCode) &&
    controlSiteAuthority(screenCode, "RecordTimingSection") &&
    (screenCode.match(/function RecordTimingSection/g) ?? []).length === 1
);
const singleActionSetAuthority = (source) =>
  (source.match(/\{zhTW\.mobile\.analysis\.confirmMatch\}/g) ?? []).length === 1 &&
  (source.match(/\{zhTW\.mobile\.analysis\.notThis\}/g) ?? []).length === 1 &&
  (source.match(/onPress=\{acceptBlocked \|\| !primary \? undefined : onAcceptPrimary\}/g) ?? []).length === 1;
check(
  "11. exactly one primary-result action set (分析正確 / 看起來不太對) exists",
  singleActionSetAuthority(resultCardBody) &&
    (screenCode.match(/<MealPhotoAnalysisResultCard/g) ?? []).length === 1 &&
    (screenCode.match(/function MealPhotoAnalysisResultCard/g) ?? []).length === 1
);

// =============================================================================================
// 4. Executed behaviour: stage exclusivity and context persistence (12-13)
// =============================================================================================
const composeAnalysisPage = runComposition(composition);
const STATUSES = ["not_started", "waiting_for_upload", "invoking", "completed", "low_confidence", "failed"];
const noStaleInvokingAuthority = (compose) =>
  STATUSES.every((invocationStatus) => {
    const state = livePage(compose, { invocationStatus });
    return !(state.showInvokingLabel && state.showPrimaryResult);
  }) &&
  livePage(compose, { invocationStatus: "completed" }).showInvokingLabel === false &&
  livePage(compose, { invocationStatus: "low_confidence" }).showInvokingLabel === false;
check(
  "12. a stale invoking label cannot remain once a result exists — one stage variable, not two booleans",
  noStaleInvokingAuthority(composeAnalysisPage) &&
    /showInvokingLabel: resultStage === "invoking",/.test(compositionCode) &&
    // The card renders the composed stage, never a status it re-interprets.
    /stage=\{analysisPage\.resultStage\}/.test(screenCode) &&
    /if \(stage === "invoking"\) \{/.test(resultCardBody) &&
    !/invocationStatus === "invoking"/.test(resultCardBody)
);
const contextPersistsAuthority = (compose) =>
  ["completed", "low_confidence"].every((invocationStatus) =>
    [true, false].every(
      (finalizationEditorOpen) => compose({
        runtimeMode: "supabase",
        invocationStatus,
        isDurableCompleted: false,
        finalizationEditorOpen
      }).showRestaurantContext === true
    )
  );
check(
  "13. the restaurant context survives low confidence, candidate correction and manual correction",
  contextPersistsAuthority(composeAnalysisPage) &&
    // The editor and the completed snapshot card still render the same single composed value.
    /\{restaurantContextDisplayText\}/.test(editorBody) &&
    /\{restaurantContextDisplayText\}/.test(completedSnapshotCard)
);

// =============================================================================================
// 5. Durable identity and payload purity (14-16)
// =============================================================================================
const idsOnlyMemoAuthority = (source) =>
  /restaurantId: analysis\.restaurantId,/.test(source) &&
  /branchId: analysis\.branchId/.test(source) &&
  !RESTAURANT_SYMBOLS.test(source);
check(
  "14. restaurantId / branchId reach finalization unchanged, from the durable session only",
  idsOnlyMemoAuthority(finalizationMemo) &&
    !/analysis\.restaurantName/.test(finalizationMemo) &&
    sha(SESSION) === PROTECTED[SESSION]
);
const noDisplayNameInPayloadAuthority = (contractSource) => {
  const build = evaluateTs(contractSource, V3_CONTRACT).buildMealIdentificationFinalizationV3;
  const result = build({
    analysisRequestId: "3f1d3c22-1111-4a2b-8c3d-44445555aaaa",
    selectedCandidateId: "0f4c9b60-1111-4a2b-8c3d-44445555aaaa",
    captureMethod: "camera",
    sourceContext: "dine_in",
    recordTiming: "current",
    occurredAt: "2026-08-07T12:00:00.000Z",
    restaurantId: RESTAURANT,
    branchId: B_XINYI,
    mealWrite: {
      mealName: "舒肥雞胸藜麥碗",
      components: ["雞胸"],
      portion: "1 份",
      nutrition: { calories: 520, proteinGrams: 42, carbsGrams: 48, fatGrams: 16 }
    }
  });
  if (!result.ok) return false;
  return (
    !Object.keys(result.value).some((key) => /restaurantName|branchName|displayName/i.test(key)) &&
    result.value.restaurantId === RESTAURANT &&
    result.value.branchId === B_XINYI
  );
};
check(
  "15. no display name can enter the durable write payload",
  noDisplayNameInPayloadAuthority(read(V3_CONTRACT)) &&
    !/restaurantName|branchName|displayName/.test(read(V3_CONTRACT)) &&
    !/restaurantName|branchName|displayName/.test(read(DRAFT)) &&
    !/restaurantName|branchName|displayName/.test(read(FINALIZATION_HOOK))
);
const displayNeverGatesAuthority = (source) => {
  const expressions = gatingExpressionsOf(source);
  return expressions.length >= 6 && expressions.every((expression) => !RESTAURANT_SYMBOLS.test(expression));
};
check(
  "15a. a loading, erroring or unresolved catalog never blocks the AI result or finalization",
  displayNeverGatesAuthority(screenCode),
  { gatingExpressionsInspected: gatingExpressionsOf(screenCode).length }
);
const treeDigests = Object.freeze({
  "supabase/migrations": "f9b1f2832a39ecc48766ae004d03a6009c83867b44a1af4027138c7578f04e9e",
  "supabase/functions": "37f368cf3bc4e1b6d6a70b7b13b4bfde3f8285f61f62de5db63889549ff556de",
  packages: "24629aa06382a393771d657f8e9c53b1fcebe54ba977b384dde747d742e4934f"
});
check(
  "16. no database, migration, RPC or Edge Function change is introduced by this round",
  Object.entries(treeDigests).every(([tree, expected]) => trackedTreeDigest(tree) === expected) &&
    CANDIDATE_MANIFEST.every((entry) => !entry.startsWith("supabase/") && !entry.startsWith("packages/")) &&
    !/\.rpc\s*\(|functions\.invoke\s*\(/.test(compositionCode)
);

// =============================================================================================
// 6. Manifest, protected surfaces and lifecycle (17-18)
// =============================================================================================
const protectedDrift = Object.entries(PROTECTED).filter(([file, want]) => !exists(file) || sha(file) !== want);
check(
  "17. the successor manifest is exactly eleven named paths and no protected surface hides inside it",
  exactManifestAuthority(CANDIDATE_MANIFEST) &&
    CANDIDATE_MANIFEST.every(exists) &&
    CANDIDATE_MANIFEST.every((entry) => !Object.hasOwn(PROTECTED, entry)) &&
    protectedDrift.length === 0,
  protectedDrift.map(([file]) => file)
);
const worktree = gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll("\\", "/"));
const versusHead = git(["diff", "--name-only", "HEAD"]).split("\n").map((entry) => entry.trim()).filter(Boolean);
const touched = [...new Set([...worktree, ...versusHead])];
const outsideManifest = touched.filter((entry) => !CANDIDATE_MANIFEST.includes(entry));
check(
  "18. committed-state lifecycle: uncommitted changes are a subset of the manifest, and a clean tree passes",
  outsideManifest.length === 0,
  { touchedEntries: touched.length, outsideManifest }
);
check(
  "18a. every predecessor guard in the manifest carries an explicit C4-R2 successor amendment",
  // Each amended guard must NAME this round, so an unexplained edit to a frozen suite still fails.
  [R7A_GUARD, R5_UI_GUARD, C1_GUARD, C2A_GUARD, C2B_GUARD, C3_GUARD, C4_R1_GUARD].every((file) =>
    /MI-E-C5-R7-C4-R2/.test(read(file))
  )
);
check(
  "18b. the companion smoke executes the REAL production modules and performs no remote operation",
  (() => {
    const smoke = read(SMOKE);
    const smokeCode = stripComments(smoke);
    return (
      smoke.includes(COMPOSITION) &&
      smoke.includes(RESOLVER) &&
      smoke.includes(V3_CONTRACT) &&
      smoke.includes(DRAFT) &&
      smoke.includes(READINESS) &&
      /loadTsModule\(COMPOSITION\)/.test(smokeCode) &&
      !/https?:\/\/|createClient\s*\(|functions\.invoke\s*\(|\.rpc\s*\(|\bfetch\s*\(/.test(smokeCode)
    );
  })()
);

// =============================================================================================
// 7. Guard hygiene (19-23)
// =============================================================================================
const guardSource = read(GUARD);
const guardCode = stripComments(guardSource);
check(
  "19. this guard uses no wildcard, prefix rule or blanket allowance for a candidate path",
  !/CANDIDATE_MANIFEST\.some\(\(entry\) => entry\.startsWith\(/.test(guardCode) &&
    !/\.\*|\bglob\b/.test(guardCode.split("\n").filter((line) => line.includes("CANDIDATE_MANIFEST")).join("\n")) &&
    exactManifestAuthority(CANDIDATE_MANIFEST)
);
check(
  "20. this guard contains no unconditional pass, skip flag or environment escape hatch",
  !/process\.env\.[A-Z_]*(SKIP|BYPASS|FORCE|DISABLE)/.test(guardCode) &&
    !/\|\|\s*true\b/.test(guardCode) &&
    !/check\([^,]+,\s*true\s*\)/.test(guardCode) &&
    !/process\.exit\(0\)/.test(guardCode) &&
    /if \(failed\.length\) process\.exit\(1\);/.test(guardSource)
);
// Fragment-assembled so this check never matches its own pattern definitions.
const COMMIT_ALLOWANCE_PATTERNS = [
  /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/,
  new RegExp(["rev", "-parse"].join("")),
  new RegExp(["\\bHEAD", "~|\\bHEAD\\^"].join(""))
];
check(
  "21. this guard grants no allowance to a specific commit — no 40-hex SHA and no commit-resolution call",
  !COMMIT_ALLOWANCE_PATTERNS.some((pattern) => pattern.test(guardCode))
);
const SECRET_PATTERNS = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\."].join("")),
  new RegExp(["service", "_role"].join("") + "[\"'\\s:=]+[A-Za-z0-9_-]{12,}"),
  new RegExp(["sb", "p_"].join("") + "[A-Za-z0-9]{16,}"),
  new RegExp(["Authoriz", "ation:\\s*Bearer\\s+[A-Za-z0-9_.-]{12,}"].join("")),
  new RegExp(["msbgnnoo", "roesoefuiwluye"].join(""))
];
check(
  "22. no candidate path contains an actual secret, token, key or Development project ref",
  CANDIDATE_MANIFEST.every((entry) => {
    const text = read(entry);
    return !SECRET_PATTERNS.some((pattern) => pattern.test(text));
  })
);
check(
  "23. no candidate path contains remote-operation implementation",
  CANDIDATE_MANIFEST.every((entry) => {
    const code = stripComments(read(entry));
    return (
      !/https?:\/\//.test(code) &&
      !/createClient\s*\(/.test(code) &&
      !/functions\.invoke\s*\(/.test(code) &&
      !/\.rpc\s*\(/.test(code) &&
      !/\bfetch\s*\(/.test(code) &&
      !/supabase\s+(?:db|functions|migration)\s+push/.test(code) &&
      !/eas\s+(?:build|submit)|expo\s+publish/.test(code)
    );
  })
);
check(
  "23a. this guard is lifecycle-AWARE: it never requires a path to be modified, staged or untracked",
  !/worktree\.includes\(/.test(guardCode) &&
    !/versusHead\.includes\(/.test(guardCode) &&
    !/touched\.includes\(/.test(guardCode) &&
    !/touched\.length\s*(?:>|===)\s*0/.test(guardCode) &&
    !/\.length === CANDIDATE_MANIFEST\.length/.test(guardCode) &&
    /outsideManifest\.length === 0/.test(guardCode)
);
check("23b. this guard's own run stages nothing", git(["diff", "--cached", "--name-only"]) === "");

// =============================================================================================
// 8. Mandatory mutation proof
// =============================================================================================
// Each mutation must actually change its fixture AND make the targeted authority predicate false.
// A no-op transform, a harness crash or an unrelated compile-only failure is never counted as a kill.
const mutations = [];
const mutation = (name, original, mutate, authority) => {
  const changed = mutate(original);
  const applied = JSON.stringify(changed) !== JSON.stringify(original);
  let killed = false;
  if (applied) {
    try {
      killed = !authority(changed);
    } catch {
      // A mutation that makes the production module unloadable is NOT a behavioural kill.
      killed = false;
    }
  }
  mutations.push({ name, applied, killed });
  check(`mutation ${name} is killed by its targeted authority`, applied && killed, { applied, killed });
};

const cardContextAuthority = (source) =>
  /restaurantContextDisplayText=\{restaurantContextDisplayText\}/.test(
    sliceBetween(stripComments(source), "<MealPhotoAnalysisResultCard", "onChooseManual={chooseManualMealInput}")
  ) &&
  /\{restaurantContextDisplayText\}/.test(
    sliceBetween(stripComments(source), "function MealPhotoAnalysisResultCard", "function MealPhotoFinalizationSubsection")
  );
const exactSecondBranchAuthority = (source) => {
  const presentation = runResolver(source);
  return presentation.kind === "resolved" && presentation.branchName === "信義安和店";
};
const liveCardFixtureFreeSourceAuthority = (source) =>
  liveCardIsFixtureFreeAuthority(
    sliceBetween(stripComments(source), "function MealPhotoAnalysisResultCard", "function MealPhotoFinalizationSubsection")
  );
const controlSiteSourceAuthority = (element) => (source) => controlSiteAuthority(stripComments(source), element);

mutation("01 result card drops the restaurant context", screen,
  (s) => s.replace("restaurantContextDisplayText={restaurantContextDisplayText}\n              primary={primaryCandidate}", "primary={primaryCandidate}"),
  cardContextAuthority);
mutation("02 the second branch is replaced by the first", resolverSource,
  (s) => s.replace("match.branches.find((candidate) => candidate.branchId === input.branchId)", "match.branches.find(() => true)"),
  exactSecondBranchAuthority);
mutation("03 the branch name is replaced by the district", resolverSource,
  (s) => s.replace("? branch.name : null;", "? branch.district : null;"),
  exactSecondBranchAuthority);
mutation("04 the branch name is replaced by the address", resolverSource,
  (s) => s.replace("? branch.name : null;", "? branch.address : null;"),
  exactSecondBranchAuthority);
mutation("05 legacy ExternalDiningAnalysis becomes visible live", screenCode,
  (s) => s.replace(") : showLegacyAnalysisBlocks ? (\n            <ExternalDiningAnalysis", ") : !hasAiFinalizationFlow ? (\n            <ExternalDiningAnalysis"),
  legacyGateAuthority);
mutation("06 legacy CandidateCorrectionList becomes visible live", screenCode,
  (s) => s.replace("{showLegacyAnalysisBlocks && !analysis.isSelfCooked && analysis.matchState === \"editing\" ? (", "{!hasAiFinalizationFlow && !analysis.isSelfCooked && analysis.matchState === \"editing\" ? ("),
  legacyGateAuthority);
mutation("07 the fixed legacy restaurant name is rendered in the live card", screen,
  (s) => s.replace("{restaurantContextDisplayText}\n        </Text>", "{analysis.restaurantName}\n        </Text>"),
  liveCardFixtureFreeSourceAuthority);
mutation("08 the fixed legacy menu name is rendered in the live card", screen,
  (s) => s.replace("      {/* §2.4 step 4 — the real primary candidate. */}", "      <Text>{topCandidate.menuName}</Text>"),
  liveCardFixtureFreeSourceAuthority);
mutation("09 the fixed legacy price is rendered in the live card", screen,
  (s) => s.replace("      {/* §2.4 step 4 — the real primary candidate. */}", "      <Text>NT${topCandidate.price}</Text>"),
  liveCardFixtureFreeSourceAuthority);
mutation("10 the fixed legacy nutrition summary is rendered in the live card", screen,
  (s) => s.replace("            calories: primary.estimatedNutrition.calories,", "            calories: analysis.nutritionSummary.calories,"),
  liveCardFixtureFreeSourceAuthority);
mutation("11 a stale invoking label survives a completed result", composition,
  (s) => s.replace('showInvokingLabel: resultStage === "invoking",', 'showInvokingLabel: input.invocationStatus !== "not_started",'),
  (s) => noStaleInvokingAuthority(runComposition(s)));
mutation("12 a duplicate meal-slot control set is added", screen,
  (s) => s.replace("          {ownedCapturedImageUri ? (\n            <MealPhotoAnalysisResultCard", "          <MealPeriodSection selectedMealPeriod={selectedMealPeriod} payloadLocked={false} onSelect={setSelectedMealPeriod} />\n          {ownedCapturedImageUri ? (\n            <MealPhotoAnalysisResultCard"),
  controlSiteSourceAuthority("MealPeriodSection"));
mutation("13 a duplicate dining-mode control set is added", screen,
  (s) => s.replace("          {ownedCapturedImageUri ? (\n            <MealPhotoAnalysisResultCard", "          <MealSourceSection analysis={analysis} payloadLocked={false} frozenContext={null} />\n          {ownedCapturedImageUri ? (\n            <MealPhotoAnalysisResultCard"),
  controlSiteSourceAuthority("MealSourceSection"));
mutation("14 a duplicate current/backfill control set is added", screen,
  (s) => s.replace("          {ownedCapturedImageUri ? (\n            <MealPhotoAnalysisResultCard", "          <RecordTimingSection analysis={analysis} timezone={profileTimezone} payloadLocked={false} frozenContext={null} />\n          {ownedCapturedImageUri ? (\n            <MealPhotoAnalysisResultCard"),
  controlSiteSourceAuthority("RecordTimingSection"));
mutation("15 a duplicate primary action set is added", resultCardBody,
  (s) => s.replace("                label={zhTW.mobile.analysis.confirmMatch}", "                label={zhTW.mobile.analysis.confirmMatch}\n                accessibilityHint={zhTW.mobile.analysis.confirmMatch}"),
  singleActionSetAuthority);
mutation("16 candidate correction drops the restaurant context", composition,
  (s) => s.replace("    showRestaurantContext: hasResult,", "    showRestaurantContext: hasResult && !input.finalizationEditorOpen,"),
  (s) => contextPersistsAuthority(runComposition(s)));
mutation("17 low confidence drops the restaurant context", composition,
  (s) => s.replace('  "completed",\n  "low_confidence"\n] as const);', '  "completed"\n] as const);'),
  (s) => contextPersistsAuthority(runComposition(s)));
mutation("18 restaurantId is overwritten by a display name", finalizationMemo,
  (s) => s.replace("restaurantId: analysis.restaurantId,", "restaurantId: restaurantDisplayName,"),
  idsOnlyMemoAuthority);
mutation("19 branchId is overwritten by a display name", finalizationMemo,
  (s) => s.replace("branchId: analysis.branchId", "branchId: branchDisplayName"),
  idsOnlyMemoAuthority);
mutation("20 a display name enters the durable command payload", read(V3_CONTRACT),
  (s) => s.replace("      restaurantId: restaurant.value.restaurantId,", "      restaurantId: restaurant.value.restaurantId,\n      branchName: \"信義安和店\","),
  noDisplayNameInPayloadAuthority);
mutation("21 a catalog error blocks the primary result", screenCode,
  (s) => s.replace("  const acceptBlocked = payloadLocked || contextBlockReason !== null;", "  const acceptBlocked = payloadLocked || contextBlockReason !== null || restaurantContextDisplayText === null;"),
  displayNeverGatesAuthority);
mutation("22 the mock badge becomes visible in supabase-live", resultCardBody,
  (s) => s.replace('{consumerRuntimeMode === "mock" ? <Text style={styles.disclaimer}>{copy.mockBadge}</Text> : null}', "<Text style={styles.disclaimer}>{copy.mockBadge}</Text>"),
  (s) =>
    /\{consumerRuntimeMode === "mock" \? <Text style=\{styles\.disclaimer\}>\{copy\.mockBadge\}<\/Text> : null\}/.test(s) &&
    (s.match(/copy\.mockBadge/g) ?? []).length === 1);
mutation("23 the current/backfill state resets on a field correction", read(DRAFT),
  (s) => s.replace("  const editable = Object.freeze({ ...state.editable, [field]: value });", "  const editable = Object.freeze({ ...state.editable, [field]: value });\n  state = Object.freeze({ ...state, context: Object.freeze({ ...state.context, recordTiming: \"current\", occurredAt: \"\" }) });"),
  (source) => {
    const module = evaluateTs(source, DRAFT);
    const context = {
      captureMethod: "camera",
      sourceContext: "takeout",
      recordTiming: "post_hoc",
      occurredAt: "2026-08-07T11:30:00.000Z",
      selectedMealPeriod: "晚餐",
      restaurantId: RESTAURANT,
      branchId: B_XINYI
    };
    const draft = module.createCandidateMealPhotoFinalizationDraft(
      "req-1",
      {
        candidateId: "0f4c9b60-1111-4a2b-8c3d-44445555aaaa",
        observedName: "舒肥雞胸藜麥碗",
        components: [],
        estimatedNutrition: { calories: 520, proteinGrams: 42, carbsGrams: 48, fatGrams: 16 },
        confidence: 0.8,
        uncertaintyReasonCodes: []
      },
      context
    );
    const next = module.updateMealPhotoFinalizationField(draft, "mealName", "改過的名稱", () => "uuid-1");
    return (
      next.context.recordTiming === "post_hoc" &&
      next.context.occurredAt === context.occurredAt &&
      next.context.selectedMealPeriod === "晚餐" &&
      next.context.sourceContext === "takeout"
    );
  });
mutation("24 a twelfth successor path is accepted", CANDIDATE_MANIFEST,
  (value) => [...value, "apps/mobile/app/unrelated-extra-screen.tsx"],
  exactManifestAuthority);

check(
  "mutation summary: all 24 mutations applied and were killed by their own authority",
  mutations.length === 24 && mutations.every((entry) => entry.applied && entry.killed),
  mutations.filter((entry) => !entry.applied || !entry.killed)
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "analysis-single-page-mi-e-c5-r7-c4-r2",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  mutations,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
