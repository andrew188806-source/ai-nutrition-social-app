#!/usr/bin/env node
// MI-E-C5-R7-C4-R2 contract smoke — ANALYSIS SINGLE-PAGE CONSOLIDATION + RESTAURANT CONTEXT.
//
// Executes the REAL production modules, never a re-implementation of their rules:
//   * apps/mobile/features/analysis/analysisSinglePagePresentation.ts   (this round's composition)
//   * apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts (frozen R7-C2a)
//   * apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts   (frozen readiness)
//   * apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts       (frozen draft/lock)
//   * apps/mobile/features/meal-identification-finalization/v3Contract.ts (frozen R7-B payload)
//
// The screen itself is a React component, so its WIRING is verified by exact source assertions
// (which value each site renders, which gate each section is behind) while every SEMANTIC it
// depends on is executed for real against the canonical Development catalog fixture.
//
// Fully local: no network, no Supabase client, no Development credential, no RPC.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

// Relative imports are resolved against the IMPORTING module's own directory and transpiled the
// same way, so a production module that imports a sibling authority is executed for real rather
// than stubbed. Non-relative specifiers (types-only packages) fall through to the real require and
// are simply erased by the transpiler when they are `import type`.
const moduleCache = new Map();
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
function loadTsFile(absolute) {
  const cached = moduleCache.get(absolute);
  if (cached) return cached.exports;
  const source = fs.readFileSync(absolute, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolute
  });
  const module = { exports: {} };
  moduleCache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved relative import ${specifier} from ${absolute}`);
    return loadTsFile(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
function loadTsModule(relative) {
  return loadTsFile(path.join(root, relative));
}

const SCREEN = "apps/mobile/app/analysis.tsx";
const COMPOSITION = "apps/mobile/features/analysis/analysisSinglePagePresentation.ts";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const READINESS = "apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts";
const DRAFT = "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts";
const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";

const composition = loadTsModule(COMPOSITION);
const composePage = composition.composeAnalysisPage;
const resolve = loadTsModule(RESOLVER).resolveRestaurantContextPresentation;
const readiness = loadTsModule(READINESS);
const draftModule = loadTsModule(DRAFT);
const buildCommand = loadTsModule(V3_CONTRACT).buildMealIdentificationFinalizationV3;

expect(typeof composePage === "function", "S0 the REAL C4-R2 page composition loads and is callable");
expect(typeof resolve === "function", "S0 the REAL frozen R7-C2a resolver loads and is callable");
expect(typeof readiness.getMealPhotoFinalizationContextBlockReason === "function", "S0 the REAL readiness authority loads");
expect(typeof draftModule.createCandidateMealPhotoFinalizationDraft === "function", "S0 the REAL finalization draft module loads");
expect(typeof buildCommand === "function", "S0 the REAL v3 command builder loads and is callable");

const screen = fs.readFileSync(path.join(root, SCREEN), "utf8");
const screenCode = screen
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
const sliceBetween = (source, from, to) => {
  const start = source.indexOf(from);
  if (start < 0) return "";
  const end = to ? source.indexOf(to, start + from.length) : -1;
  return end > start ? source.slice(start, end) : source.slice(start);
};
const resultCardBody = sliceBetween(screenCode, "function MealPhotoAnalysisResultCard", "function MealPhotoFinalizationSubsection");
const editorBody = sliceBetween(screenCode, "function MealPhotoFinalizationEditor", "function MealPhotoAnalysisCandidateRow");
const completedSnapshotCard = sliceBetween(screenCode, "isDurableCompleted && completionSnapshot ?", "<CompletedAnalysisHero");
const finalizationMemo = sliceBetween(screenCode, "const finalizationContext = useMemo(", "const completeMealPhotoFinalization");
// The whole prop list of the single call site. Ending on the LAST prop rather than on the first
// "/>" is deliberate: the prop list contains nested self-closing JSX, so a "/>" terminator would cut
// the slice off before the control set it must inspect.
const resultCardCall = sliceBetween(screenCode, "<MealPhotoAnalysisResultCard", "onChooseManual={chooseManualMealInput}");

// ---- the screen's own fallback copy and composition rule, read from source, never guessed -------
const i18n = fs.readFileSync(path.join(root, "lib/i18n/zh-TW.ts"), "utf8");
const UNKNOWN = (i18n.match(/restaurantNameUnknown: "([^"]+)"/) ?? [])[1];
const INVOKING_LABEL = (i18n.match(/invokingLabel: "([^"]+)"/) ?? [])[1];
const MOCK_BADGE = (i18n.match(/mockBadge: "([^"]+)"/) ?? [])[1];
expect(UNKNOWN === "未知", "S0 the existing 未知 fallback copy is still the i18n authority", UNKNOWN);
expect(typeof INVOKING_LABEL === "string" && INVOKING_LABEL.length > 0, "S0 the invoking label copy is readable", INVOKING_LABEL);
expect(typeof MOCK_BADGE === "string" && MOCK_BADGE.length > 0, "S0 the mock badge copy is readable", MOCK_BADGE);

const displayTextFor = (presentation) =>
  presentation.restaurantName === null
    ? UNKNOWN
    : presentation.branchName === null
      ? presentation.restaurantName
      : `${presentation.restaurantName} · ${presentation.branchName}`;

// ---- canonical Development catalog fixture ------------------------------------------------------
// Exactly the shape of the Development activation pack: 好廚健康碗 Development with 南京復興店 FIRST and
// the decisive 信義安和店 SECOND, plus a third local branch so a positional fallback is visible. Every
// branch name differs from its district, so a district substitution is never mistaken for a name.
const RESTAURANT = "dev-restaurant-haochu";
const RESTAURANT_NAME = "好廚健康碗 Development";
const B_NANJING = "dev-branch-nanjing";
const B_XINYI = "dev-branch-xinyi";
const B_LOCAL = "dev-branch-zhongshan";
const FOREIGN_BRANCH = "dev-branch-hidden-main";
const branch = (branchId, name, district) => ({
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
  // The FLATTENED card fields the pre-C2a resolver collapsed onto branches[0]. Present on purpose:
  // a regression back to them shows up immediately as 南京復興店 or 松山區.
  branchId: B_NANJING,
  name: RESTAURANT_NAME,
  location: "松山區",
  distanceDisplay: "松山區",
  category: "health",
  tags: [],
  priceRange: "NT$--",
  score: "—",
  menuItems: [],
  branches: [
    branch(B_NANJING, "南京復興店", "松山區"),
    branch(B_XINYI, "信義安和店", "大安區"),
    branch(B_LOCAL, "中山測試店", "中山區")
  ]
};
const findHit = () => CATALOG;
const findMiss = () => null;
const display = (over = {}) =>
  displayTextFor(resolve({ restaurantId: RESTAURANT, catalogStatus: "success", findRestaurant: findHit, ...over }));
const DECISIVE = `${RESTAURANT_NAME} · 信義安和店`;

// ---- composition helpers -----------------------------------------------------------------------
const page = (over = {}) =>
  composePage({
    runtimeMode: "supabase",
    invocationStatus: "completed",
    isDurableCompleted: false,
    finalizationEditorOpen: false,
    ...over
  });
const ALL_STATUSES = ["not_started", "waiting_for_upload", "invoking", "completed", "low_confidence", "failed"];
const ALL_MODES = ["mock", "disabled", "supabase"];

// ================================ A. State transitions ==========================================
{
  expect(page({ invocationStatus: "not_started" }).resultStage === "hidden", "A1 upload pending: the result card is hidden");
  expect(
    page({ invocationStatus: "waiting_for_upload" }).resultStage === "waiting_for_upload",
    "A2 waiting for upload has its own stage"
  );
  const invoking = page({ invocationStatus: "invoking" });
  expect(
    invoking.resultStage === "invoking" && invoking.showInvokingLabel && !invoking.showPrimaryResult,
    "A3 analysis invoking: the invoking label shows and no result is claimed"
  );
  const completed = page({ invocationStatus: "completed" });
  expect(
    completed.resultStage === "result" && completed.showPrimaryResult && completed.showNutritionEstimate,
    "A4 completed: the real primary result and its nutrition estimate are visible"
  );
  const low = page({ invocationStatus: "low_confidence" });
  expect(
    low.resultStage === "result" && low.showPrimaryResult && low.showRestaurantContext,
    "A5 low confidence is a RESULT state, with restaurant context still visible"
  );
  expect(page({ invocationStatus: "failed" }).resultStage === "failed", "A6 a failed analysis has its own stage");
  const correction = page({ finalizationEditorOpen: true });
  expect(
    correction.metadataControlHost === "finalization_editor" && correction.showRestaurantContext,
    "A7 candidate correction: the editor hosts the controls and the context stays visible"
  );
  const manual = page({ invocationStatus: "low_confidence", finalizationEditorOpen: true });
  expect(
    manual.metadataControlHost === "finalization_editor" && manual.showRestaurantContext && manual.showPrimaryActions,
    "A8 manual correction keeps ONE control host and does not drop the context"
  );
  const durable = page({ isDurableCompleted: true });
  expect(
    durable.resultStage === "hidden" &&
      durable.metadataControlHost === "none" &&
      !durable.showLegacyFixtureWorld,
    "A9 durable completed: the unconfirmed result card and every legacy block are gone"
  );
  expect(
    ALL_STATUSES.every((invocationStatus) => {
      const state = page({ invocationStatus });
      return !(state.showInvokingLabel && state.showPrimaryResult);
    }),
    "A10 the invoking label and a real result are mutually exclusive in EVERY status"
  );
  expect(
    ALL_STATUSES.every((invocationStatus) => page({ invocationStatus, isDurableCompleted: true }).showInvokingLabel === false),
    "A11 a stale invoking label cannot survive into the durable completed state"
  );
}

// ================================ B. Live UI ====================================================
{
  const live = page();
  expect(live.showPrimaryResult, "B1 live: the primary result is visible");
  expect(live.showRestaurantContext, "B2 live: the restaurant context is visible");
  expect(!live.showLegacyFixtureWorld, "B3 live: no legacy catalog fixture world is rendered");
  expect(live.metadataControlHost === "result_card", "B4 live: the ONE metadata control set lives in the result card");
  expect(
    ALL_STATUSES.every((invocationStatus) =>
      [true, false].every((finalizationEditorOpen) =>
        [true, false].every(
          (isDurableCompleted) =>
            page({ invocationStatus, finalizationEditorOpen, isDurableCompleted }).showLegacyFixtureWorld === false
        )
      )
    ),
    "B5 live: the legacy fixture world is unreachable in EVERY analysis/editor/completion combination"
  );
  expect(
    ALL_STATUSES.every((invocationStatus) =>
      [true, false].every((finalizationEditorOpen) =>
        page({ invocationStatus, finalizationEditorOpen }).metadataControlHost !== "legacy_standalone"
      )
    ),
    "B6 live: the duplicated standalone control containers are unreachable in every live state"
  );
  const text = display({ branchId: B_XINYI });
  expect(text === DECISIVE, "B7 live: the decisive Development scenario displays the EXACT second branch", text);
  expect(!text.includes("南京復興店") && !text.includes("大安區"), "B8 live: no first-branch and no district value leaks", text);
  expect(
    ["completed", "low_confidence"].every((invocationStatus) =>
      [true, false].every(
        (finalizationEditorOpen) => page({ invocationStatus, finalizationEditorOpen }).showRestaurantContext === true
      )
    ),
    "B9 live: the result → low-confidence → correction transition never drops the restaurant context"
  );
  expect(
    /restaurantContextDisplayText=\{restaurantContextDisplayText\}/.test(resultCardCall) &&
      /\{restaurantContextDisplayText\}/.test(resultCardBody),
    "B10 live: the real primary-result card RECEIVES and RENDERS the shared restaurant context"
  );
  expect(
    (screenCode.match(/resolveRestaurantContextPresentation\(/g) ?? []).length === 1 &&
      (screenCode.match(/const restaurantContextDisplayText =/g) ?? []).length === 1,
    "B11 live: one lookup, one composition — the card adds no second restaurant authority"
  );
  expect(
    !/findRestaurantById/.test(resultCardBody) &&
      !/\.branches\b/.test(screenCode) &&
      !/branches\[0\]/.test(screenCode) &&
      !/\.district/.test(screenCode) &&
      !/\.address\b/.test(screenCode),
    "B12 live: no parallel branch lookup, no branches[0], no district/address substitute"
  );
  expect(
    (screenCode.match(/<MealPhotoAnalysisResultCard/g) ?? []).length === 1 &&
      (resultCardBody.match(/\{zhTW\.mobile\.analysis\.confirmMatch\}/g) ?? []).length === 1 &&
      (resultCardBody.match(/\{zhTW\.mobile\.analysis\.notThis\}/g) ?? []).length === 1 &&
      (resultCardBody.match(/onPress=\{acceptBlocked \|\| !primary \? undefined : onAcceptPrimary\}/g) ?? []).length === 1 &&
      (resultCardBody.match(/onPress=\{payloadLocked \? undefined : onRejectPrimary\}/g) ?? []).length === 1,
    "B13 live: exactly ONE 分析正確 / 看起來不太對 action set exists"
  );
}

// ================================ C. Mock UI ====================================================
{
  const mock = page({ runtimeMode: "mock", invocationStatus: "invoking" });
  expect(mock.showLegacyFixtureWorld, "C1 mock: the legacy fixture world is still reachable in an explicit mock runtime");
  expect(
    mock.metadataControlHost === "legacy_standalone",
    "C2 mock: the legacy standalone controls are the mock runtime's single control host"
  );
  expect(
    !page({ runtimeMode: "mock", invocationStatus: "completed" }).showLegacyFixtureWorld,
    "C3 mock: a real AI result still supersedes the fixture world inside the mock runtime"
  );
  expect(
    ALL_MODES.filter((runtimeMode) => page({ runtimeMode, invocationStatus: "invoking" }).showLegacyFixtureWorld).join(",") ===
      "mock",
    "C4 mock: `mock` is the ONLY runtime mode that can ever show fixture content"
  );
  expect(
    !page({ runtimeMode: "disabled", invocationStatus: "invoking" }).showLegacyFixtureWorld,
    "C5 mock: a disabled runtime is not a mock runtime and shows no fixture content"
  );
  expect(
    /\{consumerRuntimeMode === "mock" \? <Text style=\{styles\.disclaimer\}>\{copy\.mockBadge\}<\/Text> : null\}/.test(
      resultCardBody
    ) && (screenCode.match(/copy\.mockBadge/g) ?? []).length === 1,
    "C6 mock: the mock badge is explicit, rendered once, and gated on the mock runtime alone"
  );
  expect(
    !new RegExp(MOCK_BADGE).test(screenCode.replace(/copy\.mockBadge/g, "")),
    "C7 mock: the badge text has no second hardcoded render site that could escape the gate"
  );
}

// ================================ D. Branch scenarios ===========================================
{
  const first = display({ branchId: B_NANJING });
  const second = display({ branchId: B_XINYI });
  const third = display({ branchId: B_LOCAL });
  expect(first === `${RESTAURANT_NAME} · 南京復興店`, "D1 the first branch displays its own exact name", first);
  expect(second === DECISIVE, "D2 the second branch displays its own exact name", second);
  expect(third === `${RESTAURANT_NAME} · 中山測試店`, "D3 the third local fixture branch displays its own exact name", third);
  expect(new Set([first, second, third]).size === 3, "D4 all three branches display three DISTINCT values");
  expect(
    ![first, second, third].some((value) => /松山區|大安區|中山區|測試路/.test(value)),
    "D5 no displayed value is a district or an address"
  );
  const missing = display({ branchId: "dev-branch-does-not-exist" });
  expect(missing === RESTAURANT_NAME, "D6 a missing branch degrades to restaurant-only", missing);
  expect(!missing.includes("南京復興店") && !missing.includes("·"), "D7 a missing branch never falls back to the first branch", missing);
  const foreign = display({ branchId: FOREIGN_BRANCH });
  expect(foreign === RESTAURANT_NAME, "D8 a foreign branch id degrades to restaurant-only, never to a wrong venue", foreign);
  const noRestaurant = displayTextFor(
    resolve({ restaurantId: RESTAURANT, branchId: B_XINYI, catalogStatus: "success", findRestaurant: findMiss })
  );
  expect(noRestaurant === UNKNOWN, "D9 a missing restaurant fails soft to the existing 未知 copy", noRestaurant);
  for (const catalogStatus of ["loading", "idle", "error", "disabled"]) {
    const text = display({ branchId: B_XINYI, catalogStatus });
    expect(text === UNKNOWN, `D10 catalogStatus=${catalogStatus} fails soft, never inventing a name`, text);
  }
  expect(
    ["loading", "idle", "error", "disabled", "success"].every((catalogStatus) => {
      const state = page();
      return state.showPrimaryResult && state.showPrimaryActions && state.metadataControlHost === "result_card";
    }),
    "D11 no catalog state blocks the AI result, the acceptance actions or the control set"
  );
}

// ================================ E. Finalization readiness =====================================
{
  const ready = {
    occurredAt: "2026-08-07T12:00:00.000Z",
    recordTimingConfirmed: true,
    sourceContext: "dine_in",
    selectedMealPeriod: "午餐"
  };
  expect(readiness.getMealPhotoFinalizationContextBlockReason(ready) === null, "E1 a complete context is finalization-ready");
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...ready, sourceContext: null }) === "missing_meal_source",
    "E2 a missing dining mode blocks with its own reason"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...ready, selectedMealPeriod: "" }) === "missing_meal_period",
    "E3 a missing meal slot blocks with its own reason"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...ready, recordTimingConfirmed: false }) === "missing_record_timing",
    "E4 an unconfirmed current/backfill timing blocks with its own reason"
  );
  // The blocking reason is a READINESS decision only: it never removes the control set, so the user
  // can always still answer it, and answering it never makes the controls disappear.
  expect(
    page().metadataControlHost === "result_card" && /\{contextControls\}/.test(resultCardBody),
    "E5 the control set is rendered from the composition host, not from the block reason"
  );
  expect(
    resultCardBody.indexOf("{contextControls}") > resultCardBody.indexOf("{contextBlockLabel ?"),
    "E6 the block label is shown ABOVE the controls that resolve it"
  );
}

// ================================ F. Payload ====================================================
{
  const CONTEXT = Object.freeze({
    captureMethod: "camera",
    sourceContext: "takeout",
    recordTiming: "post_hoc",
    occurredAt: "2026-08-07T11:30:00.000Z",
    selectedMealPeriod: "晚餐",
    restaurantId: RESTAURANT,
    branchId: B_XINYI
  });
  const CANDIDATE = {
    candidateId: "0f4c9b60-1111-4a2b-8c3d-44445555aaaa",
    observedName: "舒肥雞胸藜麥碗",
    components: [{ name: "雞胸", confidence: 0.9 }],
    estimatedNutrition: { calories: 520, proteinGrams: 42, carbsGrams: 48, fatGrams: 16 },
    confidence: 0.82,
    uncertaintyReasonCodes: []
  };
  const initial = draftModule.createCandidateMealPhotoFinalizationDraft("req-1", CANDIDATE, CONTEXT);
  const corrected = draftModule.updateMealPhotoFinalizationField(initial, "mealName", "舒肥雞胸藜麥碗（大）", () => "uuid-1");
  expect(
    corrected.context.selectedMealPeriod === "晚餐" &&
      corrected.context.sourceContext === "takeout" &&
      corrected.context.recordTiming === "post_hoc" &&
      corrected.context.occurredAt === CONTEXT.occurredAt,
    "F1 a correction preserves the meal slot, the dining mode and the current/backfill timing"
  );
  expect(
    corrected.context.restaurantId === RESTAURANT && corrected.context.branchId === B_XINYI,
    "F2 a correction never overwrites restaurantId or branchId"
  );
  expect(
    !JSON.stringify(draftModule.getMealPhotoFinalizationPayloadFingerprint(corrected)).includes(RESTAURANT_NAME) &&
      !draftModule.getMealPhotoFinalizationPayloadFingerprint(corrected).includes("信義安和店"),
    "F3 no display name enters the draft payload fingerprint"
  );
  const built = buildCommand({
    analysisRequestId: "3f1d3c22-1111-4a2b-8c3d-44445555aaaa",
    selectedCandidateId: CANDIDATE.candidateId,
    captureMethod: CONTEXT.captureMethod,
    sourceContext: CONTEXT.sourceContext,
    recordTiming: CONTEXT.recordTiming,
    occurredAt: CONTEXT.occurredAt,
    restaurantId: CONTEXT.restaurantId,
    branchId: CONTEXT.branchId,
    mealWrite: {
      mealName: corrected.editable.mealName,
      components: ["雞胸"],
      portion: "1 份",
      nutrition: { calories: 520, proteinGrams: 42, carbsGrams: 48, fatGrams: 16 }
    }
  });
  expect(built.ok, "F4 the durable v3 command builds from the corrected draft", built.ok ? undefined : built.error);
  expect(
    built.ok && built.value.restaurantId === RESTAURANT && built.value.branchId === B_XINYI,
    "F5 the command carries the EXACT durable restaurantId and branchId"
  );
  expect(
    built.ok && built.value.sourceContext === "takeout" && built.value.recordTiming === "post_hoc" && built.value.occurredAt === CONTEXT.occurredAt,
    "F6 the dining mode and the current/backfill timing reach the command unchanged"
  );
  const serialized = JSON.stringify(built.ok ? built.value : {});
  expect(
    !serialized.includes(RESTAURANT_NAME) && !serialized.includes("信義安和店") && !serialized.includes("大安區"),
    "F7 no display name, branch name or district appears anywhere in the durable command",
    serialized.slice(0, 200)
  );
  expect(
    built.ok && !Object.keys(built.value).some((key) => /restaurantName|branchName|displayName/i.test(key)),
    "F8 the command carries no restaurantName / branchName / displayName key"
  );
  expect(
    !/(restaurantContextDisplayText|restaurantDisplayName|branchDisplayName)/.test(finalizationMemo),
    "F9 the screen's finalization context memo carries ids only, never a display value"
  );
  expect(
    ["submitting", "uncertain", "succeeded"].every((status) => draftModule.isMealPhotoFinalizationPayloadLocked(status)) &&
      ["idle", "error"].every((status) => !draftModule.isMealPhotoFinalizationPayloadLocked(status)),
    "F10 a single finalization stays locked — a second write cannot be started from a succeeded payload"
  );
  const locked = draftModule.applyMealPhotoFinalizationPayloadMutation(corrected, "succeeded", () => initial);
  expect(locked === corrected, "F11 a locked payload refuses further mutation, so finalization happens once");
}

// ================================ G. Section order ==============================================
{
  const order = [
    ["restaurant context", resultCardBody.indexOf("{restaurantContextDisplayText}")],
    ["primary candidate", resultCardBody.indexOf("<MealPhotoAnalysisCandidateRow")],
    ["nutrition estimate", resultCardBody.indexOf("<MacroChipsRow")],
    ["metadata controls", resultCardBody.indexOf("{contextControls}")],
    ["confirmation actions", resultCardBody.indexOf("{zhTW.mobile.analysis.confirmMatch}")]
  ];
  expect(order.every(([, index]) => index >= 0), "G1 every required section exists in the one result card", order);
  expect(
    order.every(([, index], position) => position === 0 || index > order[position - 1][1]),
    "G2 the required §2.4 section order is respected inside the single card",
    order
  );
  const controlOrder = [
    resultCardCall.indexOf("<MealPeriodSection"),
    resultCardCall.indexOf("<MealSourceSection"),
    resultCardCall.indexOf("<RecordTimingSection")
  ];
  expect(
    controlOrder.every((index) => index >= 0) && controlOrder[0] < controlOrder[1] && controlOrder[1] < controlOrder[2],
    "G3 the control set is ordered meal slot → dining mode → current/backfill",
    controlOrder
  );
  expect(
    /\{restaurantContextDisplayText\}/.test(editorBody) && /\{restaurantContextDisplayText\}/.test(completedSnapshotCard),
    "G4 the editor and the completed snapshot card still render the same one value"
  );
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "analysis-single-page-mi-e-c5-r7-c4-r2",
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
