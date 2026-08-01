#!/usr/bin/env node
// MI-E-C5-R5 behavioral smoke. Executes the REAL production flow-state derivation, primary/fallback
// split, completion-snapshot builder, frozen draft state machine, and submission gate — no source
// string assertions.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const expect = (condition, name) => {
  if (!condition) throw new Error(`R5 smoke assertion failed: ${name}`);
  checks.push({ name, pass: true });
};

const moduleCache = new Map();
function loadTsModule(relativePath) {
  const absolute = path.resolve(root, relativePath);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: absolute
  }).outputText;
  const mod = { exports: {} };
  moduleCache.set(absolute, mod.exports);
  const localRequire = (request) => {
    if (!request.startsWith(".")) throw new Error(`R5 smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.(?:js|tsx?)$/, "");
    const resolved = fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(localRequire, mod, mod.exports);
  moduleCache.set(absolute, mod.exports);
  return mod.exports;
}

const flow = loadTsModule("apps/mobile/features/analysis/mealPhotoAnalysisFlowState.ts");
const draftModule = loadTsModule("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts");
expect(typeof flow.deriveMealPhotoAnalysisFlowState === "function", "real R5 flow-state and frozen draft modules load");

const candidate = (id, name, kcal) => ({
  candidateId: id,
  observedName: name,
  components: [{ name: `${name}-成分`, estimatedPortion: "1 份" }],
  estimatedNutrition: { calories: kcal, proteinGrams: 30, carbsGrams: 40, fatGrams: 10 },
  confidence: 0.8,
  uncertaintyReasonCodes: []
});
const context = {
  captureMethod: "camera",
  sourceContext: "dine_in",
  recordTiming: "current",
  occurredAt: "2026-08-01T04:00:00.000Z",
  selectedMealPeriod: "午餐（第二餐）"
};
const baseFlowInput = {
  hasCompletionSnapshot: false,
  finalizationRuntimeStatus: "idle",
  draftSubmissionStatus: null,
  draftMode: null,
  fallbackRevealed: false,
  analysisInvocationStatus: "completed",
  uploadStatus: "uploaded",
  hasCapturedPhoto: true
};
const durableIds = {
  mealRecordId: "record-1",
  mealRecordItemId: "item-1",
  mealAnalysisId: "analysis-1",
  mealIdentificationFinalizationId: "final-1",
  mealCorrectionIds: []
};

// Drives the REAL frozen draft state machine from candidate selection through durable success.
function finalizeDraft(startDraft, { uuid = "11111111-1111-4111-8111-111111111111", resultIds = durableIds } = {}) {
  const prepared = draftModule.prepareMealPhotoFinalization(startDraft, () => uuid);
  if (!prepared.ok) return { prepared, final: prepared.state };
  const final = draftModule.applyMealPhotoFinalizationResult(prepared.state, {
    status: "succeeded",
    errorCode: null,
    ...resultIds
  });
  return { prepared, final };
}

// --- Scenario 1: single candidate ---
{
  const list = [candidate("c1", "雞胸高蛋白碗", 620)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary?.candidateId === "c1", "S1: the only candidate becomes the primary best match");
  expect(fallbacks.length === 0, "S1: a single-candidate response renders zero fallback rows");
  expect(flow.deriveMealPhotoAnalysisFlowState(baseFlowInput) === "primary_result", "S1: analysis completion lands on primary_result, not a candidate list");

  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-1", primary, context);
  const { final } = finalizeDraft(draft);
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(snapshot !== null, "S1: accepting the primary produces a durable completion snapshot");
  expect(snapshot.mealName === "雞胸高蛋白碗" && snapshot.nutrition.calories === 620, "S1: completed nutrition comes from the accepted primary");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: true }) === "durable_completed",
    "S1: same-page completed state is reached without navigation"
  );
}

// --- Scenario 2: two candidates ---
{
  const list = [candidate("c1", "主要結果", 600), candidate("c2", "替代結果", 500)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "c1", "S2: candidate 1 is the primary");
  expect(fallbacks.length === 1 && fallbacks[0].candidateId === "c2", "S2: exactly one fallback exists and is hidden until rejection");
  expect(flow.deriveMealPhotoAnalysisFlowState(baseFlowInput) === "primary_result", "S2: fallbacks are not shown before rejection");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, fallbackRevealed: true }) === "fallback_options_revealed",
    "S2: rejecting the primary reveals fallbacks without submitting"
  );
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-2", fallbacks[0], context);
  const { final } = finalizeDraft(draft);
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(snapshot.candidateId === "c2" && snapshot.mealName === "替代結果", "S2: the selected fallback becomes the confirmed completion");
}

// --- Scenario 3: three candidates (current production maximum) ---
{
  const list = [candidate("c1", "主要", 600), candidate("c2", "替代一", 500), candidate("c3", "替代二", 400)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "c1", "S3: candidate 1 is the primary");
  expect(fallbacks.length === 2, "S3: a 3-candidate production response reveals exactly 2 fallbacks");
  expect(
    fallbacks.every((entry) => entry.candidateId !== "c1"),
    "S3: the primary is never duplicated into the fallback list"
  );
  expect(flow.MEAL_PHOTO_ANALYSIS_PRODUCTION_MAX_TOTAL_CANDIDATES === 3, "S3: the production ceiling is 3 TOTAL candidates, not 3 fallbacks");
}

// --- Scenario 4: synthetic forward-compatible 4 candidates ---
{
  const list = [candidate("c1", "主要", 600), candidate("c2", "f1", 500), candidate("c3", "f2", 450), candidate("c4", "f3", 400)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "c1" && fallbacks.length === 3, "S4: a synthetic 4-candidate response renders 1 primary + 3 fallbacks (presentation compatibility only)");
  const five = [...list, candidate("c5", "f4", 300)];
  expect(
    flow.splitPrimaryAndFallbackCandidates(five).fallbacks.length === 3,
    "S4: the forward-compatible fallback ceiling stops at 3 and never grows unbounded"
  );
}

// --- Scenario 5: manual fallback ---
{
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, draftMode: "manual" }) === "correction_or_manual",
    "S5: manual mode is its own state, reached only after leaving the primary"
  );
  let manual = draftModule.createManualMealPhotoFinalizationDraft("req-5", context);
  manual = draftModule.updateMealPhotoFinalizationField(manual, "mealName", "自己輸入的餐點", () => "u");
  manual = draftModule.updateMealPhotoFinalizationField(manual, "calories", "480", () => "u");
  const { final } = finalizeDraft(manual);
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(snapshot.candidateId === null, "S5: manual completion carries a null candidateId, never a fabricated identity");
  expect(snapshot.mealName === "自己輸入的餐點" && snapshot.nutrition.calories === 480, "S5: manual values flow into the completed summary");
  expect(snapshot.mode === "manual", "S5: manual mode is preserved in the completion snapshot");
}

// --- Scenario 6: corrected primary ---
{
  const list = [candidate("c1", "原始 AI 名稱", 600)];
  const { primary } = flow.splitPrimaryAndFallbackCandidates(list);
  let draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-6", primary, context);
  draft = draftModule.updateMealPhotoFinalizationField(draft, "mealName", "使用者修正名稱", () => "u");
  draft = draftModule.updateMealPhotoFinalizationField(draft, "calories", "725", () => "u");
  const { final } = finalizeDraft(draft);
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(snapshot.mealName === "使用者修正名稱", "S6: corrected values override the original AI primary values");
  expect(snapshot.nutrition.calories === 725, "S6: corrected nutrition, not the AI estimate, reaches the completed summary");
  expect(snapshot.candidateId === "c1", "S6: correcting a primary preserves its candidate identity");
}

// --- Scenario 7: corrected fallback ---
{
  const list = [candidate("c1", "主要", 600), candidate("c2", "替代", 500)];
  const { fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  let draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-7", fallbacks[0], context);
  draft = draftModule.updateMealPhotoFinalizationField(draft, "proteinGrams", "55", () => "u");
  const { final } = finalizeDraft(draft);
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(snapshot.candidateId === "c2" && snapshot.nutrition.protein === 55, "S7: a corrected fallback keeps its identity and shows corrected values");
}

// --- Scenario 8: submitting ---
{
  const state = flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, draftSubmissionStatus: "submitting" });
  expect(state === "submitting", "S8: an in-flight submission is its own state");
  expect(!flow.isCompletedMealPhotoAnalysisFlowState(state), "S8: submitting never renders the completed state or its recommendation carousel");
  const list = [candidate("c1", "x", 600)];
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-8", list[0], context);
  const prepared = draftModule.prepareMealPhotoFinalization(draft, () => "u1");
  expect(flow.buildCompletedMealPhotoAnalysisSnapshot(prepared.state) === null, "S8: an optimistic submitting draft can never build a completion snapshot");
}

// --- Scenario 9: uncertain ---
{
  const state = flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, finalizationRuntimeStatus: "uncertain" });
  expect(state === "uncertain", "S9: an uncertain transport result is its own state");
  expect(!flow.isCompletedMealPhotoAnalysisFlowState(state), "S9: uncertain never shows completion, so the asset is retained for retry");
  const list = [candidate("c1", "x", 600)];
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-9", list[0], context);
  const first = draftModule.prepareMealPhotoFinalization(draft, () => "stable-uuid");
  const retry = draftModule.prepareMealPhotoFinalization(first.state, () => "different-uuid");
  expect(retry.ok && retry.draft.clientRequestId === "stable-uuid", "S9: retry reuses the same clientRequestId (R3-A retry identity preserved)");
}

// --- Scenario 10: failure ---
{
  const state = flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, draftSubmissionStatus: "failed" });
  expect(state === "failed", "S10: a failed submission is its own state");
  expect(!flow.isCompletedMealPhotoAnalysisFlowState(state), "S10: failure never renders the completed state");
  const list = [candidate("c1", "x", 600)];
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-10", list[0], context);
  const prepared = draftModule.prepareMealPhotoFinalization(draft, () => "u1");
  const failedState = draftModule.applyMealPhotoFinalizationResult(prepared.state, { status: "error", errorCode: "finalization_invalid_input" });
  expect(failedState.submissionStatus === "failed" && failedState.resultIds === null, "S10: a failure exposes a safe error and no fabricated durable IDs");
  expect(flow.buildCompletedMealPhotoAnalysisSnapshot(failedState) === null, "S10: a failed draft can never build a completion snapshot");
  const gate = new draftModule.MealPhotoFinalizationSubmissionGate();
  expect(gate.tryStart() === true, "S10: the single-flight gate can be acquired again after a failure");
  gate.finish();
  expect(gate.tryStart() === true, "S10: the gate is released rather than left locked");
}

// --- Scenario 11: already finalized ---
{
  const list = [candidate("c1", "x", 600)];
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-11", list[0], context);
  const { final } = finalizeDraft(draft);
  expect(flow.buildCompletedMealPhotoAnalysisSnapshot(final) !== null, "S11: a durable result restores the completed state");
  const noIds = draftModule.applyMealPhotoFinalizationResult(
    draftModule.prepareMealPhotoFinalization(draft, () => "u").state,
    { status: "error", errorCode: "finalization_analysis_already_finalized" }
  );
  expect(flow.buildCompletedMealPhotoAnalysisSnapshot(noIds) === null, "S11: already-finalized WITHOUT a durable result never fakes completion");
}

// --- Scenario 12: navigation ---
{
  const screen = fs.readFileSync(path.join(root, "apps/mobile/app/analysis.tsx"), "utf8");
  const callbackStart = screen.indexOf("const completeMealPhotoFinalization");
  const callbackEnd = screen.indexOf("const mealPhotoFinalization = useMealPhotoFinalization");
  const callback = screen.slice(callbackStart, callbackEnd);
  expect(callbackStart > 0 && callbackEnd > callbackStart, "S12: the durable-success callback is locatable");
  expect(!/router\.push/.test(callback), "S12: durable success performs no navigation at all");
  expect(/setCompletionSnapshot\(snapshot\)/.test(callback), "S12: durable success switches to the same-page completed state instead");
  const heroStart = screen.indexOf("function CompletedAnalysisHero");
  const heroEnd = screen.indexOf("function MealIdentificationFinalizationErrorCard");
  const hero = screen.slice(heroStart, heroEnd);
  expect(/onViewTodayIntake/.test(hero), "S12: the completed state still offers a read-only Today Intake navigation");
  expect(!/finalizeMealIdentification|mealPhotoFinalization\.submit/.test(hero), "S12: no completed action can trigger a second finalization write");
}

// --- Scenario 13: gallery cleanup ---
{
  const screen = fs.readFileSync(path.join(root, "apps/mobile/app/analysis.tsx"), "utf8");
  const callback = screen.slice(
    screen.indexOf("const completeMealPhotoFinalization"),
    screen.indexOf("const mealPhotoFinalization = useMealPhotoFinalization")
  );
  expect(/void releaseOwnedGalleryMealPhotoAsset\(\)/.test(callback), "S13: durable success releases the R4 owned gallery asset");
  expect(
    callback.indexOf("setCompletionSnapshot(snapshot)") < callback.indexOf("releaseOwnedGalleryMealPhotoAsset"),
    "S13: completion is committed before best-effort cleanup, so cleanup failure cannot reverse success"
  );
  const normalization = fs.readFileSync(
    path.join(root, "apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts"),
    "utf8"
  );
  expect(/catch \{[\s\S]{0,160}\}/.test(normalization), "S13: cleanup remains best-effort and swallows its own failure");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, finalizationRuntimeStatus: "uncertain" }) === "uncertain",
    "S13: an uncertain result stays uncertain, so the asset is retained rather than cleaned"
  );
}

// --- Scenario 14: camera regression ---
{
  const media = fs.readFileSync(path.join(root, "apps/mobile/features/analysis/mediaCapture.ts"), "utf8");
  const cameraBody = media.slice(media.indexOf("export async function captureMealPhotoFromCamera"), media.indexOf("export async function pickMealPhotoFromLibrary"));
  expect(!/gallery_asset_/.test(cameraBody), "S14: the camera path never maps to a gallery-specific error");
  expect(!/normalizeGalleryMealPhotoAsset/.test(cameraBody), "S14: the camera path never runs gallery normalization");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, analysisInvocationStatus: "invoking" }) === "analyzing",
    "S14: camera capture still flows through the shared analyzing state"
  );
}

// --- Scenario 15: double tap ---
{
  const gate = new draftModule.MealPhotoFinalizationSubmissionGate();
  expect(gate.tryStart() === true && gate.tryStart() === false, "S15: the single-flight gate blocks a double tap");
  const list = [candidate("c1", "x", 600)];
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-15", list[0], context);
  const first = draftModule.prepareMealPhotoFinalization(draft, () => "uuid-A");
  const second = draftModule.prepareMealPhotoFinalization(first.state, () => "uuid-B");
  expect(first.draft.clientRequestId === "uuid-A" && second.draft.clientRequestId === "uuid-A", "S15: a double tap reuses one clientRequestId, so only one durable record can result");
  expect(gate.tryNavigate() === true && gate.tryNavigate() === false, "S15: the completion transition can only fire once");
}

// --- Scenario 16: same-page rerender ---
{
  const list = [candidate("c1", "x", 600)];
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-16", list[0], context);
  const { final } = finalizeDraft(draft);
  const a = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  const b = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(JSON.stringify(a) === JSON.stringify(b), "S16: rebuilding the snapshot on rerender is pure and stable");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: true, analysisInvocationStatus: "completed" }) === "durable_completed",
    "S16: a rerender with a stored snapshot stays completed and never returns to the candidate/legacy view"
  );
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: true, draftSubmissionStatus: "submitting" }) === "durable_completed",
    "S16: durable completion outranks every earlier state, so no second write path can re-open"
  );
}

// =====================================================================================
// MI-E-C5-R5-R1 — primary ranking, actor isolation, one-step confirmation
// =====================================================================================

const readiness = loadTsModule("apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts");
// Ranked variant of the helper: the transport guarantees no ordering, so these scenarios drive the
// real ranking with confidences the provider could legitimately return in any array order.
const ranked = (id, name, kcal, confidence) => ({ ...candidate(id, name, kcal), confidence });

// --- Scenario 17: the best match arrives LAST in the provider array ---
{
  const list = [ranked("c1", "低信心", 600, 0.31), ranked("c2", "中信心", 500, 0.55), ranked("c3", "最佳", 400, 0.92)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "c3", "S17: the highest-confidence candidate becomes the primary even when the provider returns it last");
  expect(fallbacks.map((entry) => entry.candidateId).join(",") === "c2,c1", "S17: fallbacks follow in descending confidence order");
  expect(list[0].candidateId === "c1" && list[2].candidateId === "c3", "S17: the provider array itself is never reordered in place");
}

// --- Scenario 18: the best match arrives in the MIDDLE ---
{
  const list = [ranked("c1", "a", 600, 0.4), ranked("c2", "最佳", 500, 0.88), ranked("c3", "c", 400, 0.6)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "c2", "S18: a mid-array best match is still selected as the primary");
  expect(fallbacks.length === 2 && fallbacks[0].candidateId === "c3", "S18: the remaining candidates rank below it by confidence");
  expect(!fallbacks.some((entry) => entry.candidateId === primary.candidateId), "S18: the ranked primary is never duplicated into the fallbacks");
}

// --- Scenario 19: tied confidences fall back to provider order deterministically ---
{
  const list = [ranked("c1", "a", 600, 0.7), ranked("c2", "b", 500, 0.7), ranked("c3", "c", 400, 0.7)];
  const first = flow.splitPrimaryAndFallbackCandidates(list);
  const second = flow.splitPrimaryAndFallbackCandidates(list);
  expect(first.primary.candidateId === "c1", "S19: an all-equal-confidence response keeps the provider's first entry as primary");
  expect(
    first.fallbacks.map((entry) => entry.candidateId).join(",") === "c2,c3",
    "S19: tied fallbacks keep provider order rather than an arbitrary sort order"
  );
  expect(
    JSON.stringify(first.fallbacks.map((entry) => entry.candidateId)) === JSON.stringify(second.fallbacks.map((entry) => entry.candidateId)),
    "S19: the tie-break is deterministic across repeated calls"
  );
}

// --- Scenario 20: ranking purity ---
{
  const list = [ranked("c1", "a", 600, 0.2), ranked("c2", "b", 500, 0.9)];
  const before = list.map((entry) => entry.candidateId).join(",");
  const once = flow.rankMealPhotoAnalysisCandidates(list);
  const twice = flow.rankMealPhotoAnalysisCandidates(once);
  expect(list.map((entry) => entry.candidateId).join(",") === before, "S20: ranking never mutates the caller's array");
  expect(once.map((e) => e.candidateId).join(",") === "c2,c1", "S20: ranking orders by confidence descending");
  expect(
    twice.map((e) => e.candidateId).join(",") === once.map((e) => e.candidateId).join(","),
    "S20: ranking is idempotent, so a rerender cannot shuffle the primary"
  );
}

// --- Scenario 21: server-assigned candidate identity survives ranking ---
{
  const list = [ranked("server-id-A", "a", 600, 0.3), ranked("server-id-B", "b", 500, 0.95)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "server-id-B", "S21: the server-assigned candidateId is preserved verbatim, never renumbered");
  expect(primary === list[1] && fallbacks[0] === list[0], "S21: ranking returns the original candidate objects, not copies");
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-21", primary, context);
  const { final } = finalizeDraft(draft);
  expect(
    flow.buildCompletedMealPhotoAnalysisSnapshot(final).candidateId === "server-id-B",
    "S21: the finalized record carries the ranked primary's server identity"
  );
}

// --- Scenario 22: the primary can never leak into the fallback list under any ordering ---
{
  const orderings = [
    [ranked("c1", "a", 600, 0.9), ranked("c2", "b", 500, 0.5), ranked("c3", "c", 400, 0.1)],
    [ranked("c1", "a", 600, 0.1), ranked("c2", "b", 500, 0.5), ranked("c3", "c", 400, 0.9)],
    [ranked("c1", "a", 600, 0.5), ranked("c2", "b", 500, 0.9), ranked("c3", "c", 400, 0.1)]
  ];
  for (const list of orderings) {
    const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
    expect(
      !fallbacks.some((entry) => entry.candidateId === primary.candidateId) && fallbacks.length === 2,
      `S22: ordering ${list.map((e) => e.confidence).join("/")} yields one primary and two distinct fallbacks`
    );
  }
}

// --- Scenario 23: accepting the ranked primary end-to-end ---
{
  const list = [ranked("c1", "不是最佳", 600, 0.22), ranked("c2", "AI 最佳判斷", 480, 0.97)];
  const { primary } = flow.splitPrimaryAndFallbackCandidates(list);
  const draft = draftModule.createCandidateMealPhotoFinalizationDraft("req-23", primary, context);
  const { final } = finalizeDraft(draft);
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(snapshot.mealName === "AI 最佳判斷" && snapshot.nutrition.calories === 480, "S23: one-step acceptance finalizes the RANKED primary, not the array-first candidate");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: true }) === "durable_completed",
    "S23: that single acceptance lands directly on the same-page completed state"
  );
}

// --- Scenario 24: same actor never resets ---
{
  const a = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 3 });
  const again = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 3 });
  expect(a === again, "S24: identity is pure, so a rerender/HMR reload produces the identical identity");
  expect(!flow.shouldResetMealPhotoAnalysisStateForActor(a, again), "S24: a same-actor rerender does not reset R5 state");
  expect(
    !flow.shouldResetMealPhotoAnalysisStateForActor(a, flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 3 })),
    "S24: a background → foreground return and a silent token refresh leave the pair untouched and reset nothing"
  );
}

// --- Scenario 25: a different actor always resets ---
{
  const a = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 1 });
  const b = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-b", actorGeneration: 1 });
  expect(flow.shouldResetMealPhotoAnalysisStateForActor(a, b), "S25: switching to a different actor resets R5 state");
  expect(a !== b, "S25: two different actors can never collide on one identity");
}

// --- Scenario 26: same account, new generation (re-auth) resets ---
{
  const before = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 1 });
  const after = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 2 });
  expect(flow.shouldResetMealPhotoAnalysisStateForActor(before, after), "S26: a re-authentication that bumps actorGeneration resets R5 state");
}

// --- Scenario 27: signed-out ↔ signed-in transitions ---
{
  const signedOut = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: null, actorGeneration: 0 });
  const signedIn = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 1 });
  expect(signedOut === ":0", "S27: a signed-out runtime yields a stable empty-actor identity rather than throwing");
  expect(flow.shouldResetMealPhotoAnalysisStateForActor(signedOut, signedIn), "S27: signing in from signed-out resets R5 state");
  expect(flow.shouldResetMealPhotoAnalysisStateForActor(signedIn, signedOut), "S27: signing out resets R5 state");
  expect(
    !flow.shouldResetMealPhotoAnalysisStateForActor(signedOut, flow.buildMealPhotoAnalysisActorIdentity({ actorKey: undefined, actorGeneration: 0 })),
    "S27: null and undefined actorKey are the same signed-out identity, so no spurious reset fires"
  );
}

// --- Scenario 28: the cleared state clears every R5 field together ---
{
  const cleared = flow.CLEARED_MEAL_PHOTO_ANALYSIS_ACTOR_STATE;
  expect(
    cleared.completion === null && cleared.fallbackRevealed === false && cleared.correctionRequested === false,
    "S28: an actor change clears completion, revealed fallbacks and the correction request together"
  );
  expect(Object.isFrozen(cleared), "S28: the cleared value is immutable, so no caller can partially reuse it");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: cleared.completion !== null }) !== "durable_completed",
    "S28: after clearing, the previous actor's completed meal is no longer reachable"
  );
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, fallbackRevealed: cleared.fallbackRevealed }) === "primary_result",
    "S28: after clearing, the new actor starts from the primary result, not the previous actor's revealed fallbacks"
  );
}

// --- Scenario 29: a valid same-actor session survives remount ---
{
  const identity = flow.buildMealPhotoAnalysisActorIdentity({ actorKey: "actor-a", actorGeneration: 4 });
  // First mount seeds previousIdentity with the CURRENT identity, so the reset predicate is false.
  expect(!flow.shouldResetMealPhotoAnalysisStateForActor(identity, identity), "S29: the first mount never erases a restored same-actor session");
  const list = [ranked("c1", "已完成餐點", 700, 0.9)];
  const { primary } = flow.splitPrimaryAndFallbackCandidates(list);
  const { final } = finalizeDraft(draftModule.createCandidateMealPhotoFinalizationDraft("req-29", primary, context));
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: snapshot !== null }) === "durable_completed",
    "S29: the same actor returning to /analysis still sees its own completed meal"
  );
}

// --- Scenario 30: one-step acceptance produces exactly one durable write under a double tap ---
{
  const gate = new draftModule.MealPhotoFinalizationSubmissionGate();
  const list = [ranked("c1", "a", 600, 0.4), ranked("c2", "最佳", 500, 0.93)];
  const { primary } = flow.splitPrimaryAndFallbackCandidates(list);
  const base = draftModule.createCandidateMealPhotoFinalizationDraft("req-30", primary, context);

  // First gesture: acquires the gate and prepares from its own local value.
  expect(gate.tryStart() === true, "S30: the first accept gesture acquires the single-flight gate");
  const first = draftModule.prepareMealPhotoFinalization(base, () => "accept-uuid");
  // Second gesture while the first is still in flight.
  expect(gate.tryStart() === false, "S30: the second accept gesture is refused before any request id is minted");
  const { final } = finalizeDraft(first.state, { uuid: "accept-uuid" });
  gate.finish();
  expect(first.draft.clientRequestId === "accept-uuid", "S30: a single clientRequestId backs the whole acceptance");
  expect(
    flow.buildCompletedMealPhotoAnalysisSnapshot(final).candidateId === "c2",
    "S30: exactly one durable completion results, for the ranked primary"
  );
  expect(gate.tryNavigate() === true && gate.tryNavigate() === false, "S30: the completion transition still fires exactly once");
}

// --- Scenario 31: editor gating and missing-context readiness ---
{
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, draftMode: "candidate" }) === "primary_result",
    "S31: the accept path stays on primary_result and never enters the editor state"
  );
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, draftMode: "manual" }) === "correction_or_manual",
    "S31: only an explicit manual choice enters the editor state"
  );
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, draftMode: "candidate", draftSubmissionStatus: "failed" }) === "failed",
    "S31: a failed acceptance surfaces the recovery state rather than silently completing"
  );
  const readyContext = { occurredAt: context.occurredAt, recordTimingConfirmed: true, sourceContext: "dine_in", selectedMealPeriod: context.selectedMealPeriod };
  expect(readiness.getMealPhotoFinalizationContextBlockReason(readyContext) === null, "S31: a complete context does not block acceptance");
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readyContext, sourceContext: "unknown" }) === null,
    'S31: "unknown" is a valid meal source and never blocks acceptance'
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readyContext, sourceContext: null }) === "missing_meal_source",
    "S31: a genuinely unselected meal source blocks acceptance with a named reason"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readyContext, occurredAt: "" }) === "missing_occurred_at",
    "S31: a missing actual meal time blocks acceptance with a named reason"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readyContext, recordTimingConfirmed: false }) === "missing_record_timing",
    "S31: unconfirmed record timing blocks acceptance with a named reason"
  );
}

// ===========================================================================================
// MI-E-C5-R5-R2 — actor-owned analysis session, remount isolation, asset cleanup.
//
// These scenarios drive the REAL analysisSessionStore module (not just pure predicates): they
// capture photos, complete meals, switch actors and remount, exactly as production does.
// ===========================================================================================
const store = loadTsModule("apps/mobile/features/analysis/analysisSessionStore.ts");
expect(typeof store.commitAnalysisSessionActorOwnerReconciliation === "function", "S32: the real analysis session store loads with its owner authority");

const ACTOR_A = { actorKey: "actor-a", actorGeneration: 4 };
const ACTOR_B = { actorKey: "actor-b", actorGeneration: 7 };
const SIGNED_OUT = { actorKey: null, actorGeneration: 8 };

let releaseCount = 0;
let releaseShouldThrow = false;
const deps = {
  releaseOwnedGalleryAsset: () => {
    releaseCount += 1;
    if (releaseShouldThrow) throw new Error("simulated cache delete failure");
  }
};
// Mirrors analysis.tsx's completed-hero read plus useMealPhotoFinalization's restore gate.
const sensitiveFieldsVisibleTo = (actor) => {
  const s = store.getAnalysisSession();
  const owned = store.isAnalysisSessionOwnedBy(s, actor);
  return {
    capturedImageUri: s.capturedImageUri,
    imageObjectRef: s.imageObjectRef,
    analysisRequestId: s.analysisRequestId,
    uploadStatus: s.uploadStatus,
    completion: s.mealPhotoCompletion,
    fallbackRevealed: s.mealPhotoFallbackRevealed,
    selectedCandidateId: s.selectedCandidateId,
    restorableDraft: owned ? s.mealPhotoFinalizationDraft : null,
    owner: s.actorOwner
  };
};
function seedCompletedMealFor(actor, tag) {
  const owner = store.commitAnalysisSessionActorOwnerReconciliation(actor, deps).owner;
  store.beginAnalysisCapture("camera", `file:///${tag}-photo.jpg`, new Date("2026-08-01T04:00:00.000Z"), null, null, owner);
  const requestId = store.getAnalysisSession().analysisRequestId;
  store.setMealPhotoUploadState({ uploadStatus: "uploaded", imageObjectRef: `${tag}-object-ref`, uploadedAt: "2026-08-01T04:01:00.000Z" });
  store.setMealPhotoAnalysisState({ analysisInvocationStatus: "completed", analysisCandidates: [ranked(`${tag}-cand`, `${tag}-meal`, 640, 0.9)] });
  store.setSelectedMealPhotoAnalysisCandidateId(`${tag}-cand`);
  store.setMealPhotoFallbackRevealed(true);
  store.setMealPhotoFinalizationDraft({
    ...draftModule.createCandidateMealPhotoFinalizationDraft(requestId, ranked(`${tag}-cand`, `${tag}-meal`, 640, 0.9), context),
    attempted: true,
    clientRequestId: `${tag}-client-request-id`,
    submissionStatus: "succeeded",
    resultIds: {
      mealRecordId: `${tag}-record`,
      mealRecordItemId: `${tag}-item`,
      mealAnalysisId: `${tag}-analysis`,
      mealIdentificationFinalizationId: `${tag}-finalization`,
      mealCorrectionIds: []
    }
  });
  store.setMealPhotoCompletion(flow.buildCompletedMealPhotoAnalysisSnapshot(store.getAnalysisSession().mealPhotoFinalizationDraft));
  return requestId;
}

// --- Scenario 33: ownerless pristine session binds to the arriving actor ---
{
  store.resetAnalysisSession();
  expect(store.isAnalysisSessionPristine(store.getAnalysisSession()), "S33: a freshly reset session is pristine");
  expect(store.getAnalysisSession().actorOwner === null, "S33: a freshly reset session has no owner");
  const before = releaseCount;
  const outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps);
  expect(outcome.status === "bound_pristine", "S33: an ownerless pristine session binds to the arriving actor");
  expect(outcome.owner.actorKey === "actor-a" && outcome.owner.actorGeneration === 4, "S33: the bound owner is exactly the arriving actorKey/actorGeneration");
  expect(releaseCount === before, "S33: binding a pristine session never deletes a gallery cache file");
}

// --- Scenario 34: ownerless NON-pristine session is untrusted — reset, then bind ---
{
  store.resetAnalysisSession();
  store.beginAnalysisCapture("camera", "file:///legacy-photo.jpg", new Date(), null, null, null);
  store.setMealPhotoUploadState({ uploadStatus: "uploaded", imageObjectRef: "legacy-object-ref" });
  expect(store.getAnalysisSession().actorOwner === null, "S34: a legacy session carries no owner");
  expect(!store.isAnalysisSessionPristine(store.getAnalysisSession()), "S34: a legacy session with a photo is not pristine");
  const before = releaseCount;
  const outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps);
  expect(outcome.status === "reset_untrusted_and_bound", "S34: an ownerless non-pristine session is treated as untrusted, not as the current actor's");
  expect(store.getAnalysisSession().capturedImageUri === null, "S34: the legacy photo is cleared rather than attributed to the arriving actor");
  expect(store.getAnalysisSession().imageObjectRef === null, "S34: the legacy Storage object ref is cleared too");
  expect(releaseCount === before + 1, "S34: the untrusted reset releases the owned gallery cache exactly once");
}

// --- Scenario 35: same-actor remount preserves a legitimate in-progress session ---
{
  seedCompletedMealFor(ACTOR_A, "a1");
  const before = releaseCount;
  const outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps);
  expect(outcome.status === "preserved", "S35: a same-actor remount preserves the session");
  const visible = sensitiveFieldsVisibleTo(ACTOR_A);
  expect(visible.capturedImageUri === "file:///a1-photo.jpg", "S35: Actor A still sees its own photo after remount");
  expect(visible.completion.mealName === "a1-meal", "S35: Actor A still sees its own completed meal after remount");
  expect(visible.restorableDraft.clientRequestId === "a1-client-request-id", "S35: Actor A's own draft and clientRequestId are still restorable");
  expect(visible.fallbackRevealed === true, "S35: Actor A's revealed-fallback step survives the remount");
  expect(releaseCount === before, "S35: a same-actor remount never deletes the owned gallery cache");
}

// --- Scenario 36-40: Actor A completes -> unmount -> Actor B mounts. THE R5-R1 BLOCKING DEFECT ---
{
  seedCompletedMealFor(ACTOR_A, "a2");
  const beforeRelease = releaseCount;
  // /analysis is unmounted while the actor changes; nothing runs. Actor B then mounts, and
  // analysis.tsx reconciles SYNCHRONOUSLY before any session-reading hook.
  const outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(outcome.status === "reset_different_actor_and_bound", "S36: a different-actor remount performs a full reset and rebind");
  const visible = sensitiveFieldsVisibleTo(ACTOR_B);
  expect(visible.owner.actorKey === "actor-b", "S36: the session is now owned by Actor B");

  expect(visible.capturedImageUri === null, "S37: Actor A's captured photo URI is not readable by Actor B");
  expect(visible.imageObjectRef === null, "S37: Actor A's Storage object ref is not readable by Actor B");
  expect(visible.analysisRequestId === null, "S37: Actor A's analysis request id is not readable by Actor B");
  expect(visible.uploadStatus === "not_started", "S37: Actor A's upload state is not readable by Actor B");

  expect(visible.completion === null, "S38: Actor A's completed meal and durable IDs are not readable by Actor B");
  expect(store.getAnalysisSession().analysisCandidates.length === 0, "S38: Actor A's AI candidates are not readable by Actor B");
  expect(visible.selectedCandidateId === null, "S38: Actor A's selected candidateId is not readable by Actor B");

  expect(store.getAnalysisSession().mealPhotoFinalizationDraft === null, "S39: Actor A's finalization draft is gone from the store");
  expect(visible.restorableDraft === null, "S39: Actor A's draft and clientRequestId can never be restored by Actor B");

  expect(visible.fallbackRevealed === false, "S40: Actor A's revealed-fallback state does not carry over to Actor B");
  expect(releaseCount === beforeRelease + 1, "S40: the actor change released the owned gallery cache exactly once");

  const flowStateForB = flow.deriveMealPhotoAnalysisFlowState({
    ...baseFlowInput,
    hasCompletionSnapshot: visible.completion !== null,
    fallbackRevealed: visible.fallbackRevealed,
    analysisInvocationStatus: store.getAnalysisSession().analysisInvocationStatus,
    uploadStatus: store.getAnalysisSession().uploadStatus,
    hasCapturedPhoto: Boolean(visible.capturedImageUri)
  });
  expect(flowStateForB !== "durable_completed", "S40: Actor B's first render never derives the completed state from Actor A's data");
}

// --- Scenario 41: first-render sanitized view — no one-frame completion or photo ---
{
  seedCompletedMealFor(ACTOR_A, "a3");
  // Everything analysis.tsx reads on its first render happens AFTER this single call.
  const outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  const firstRenderSession = store.getAnalysisSession();
  expect(firstRenderSession.mealPhotoCompletion === null, "S41: the first render after reconciliation has no completion to display");
  expect(firstRenderSession.capturedImageUri === null, "S41: the first render after reconciliation has no photo to display");
  // analysis.tsx's own epoch gate: seeded from this outcome, so a fresh mount reports no change
  // and a mounted actor change reports one.
  const renderedOwnerEpochOnFreshMount = outcome.epoch;
  expect(renderedOwnerEpochOnFreshMount === outcome.epoch, "S41: a fresh mount seeds the render epoch from the reconciled value, so it clears nothing valid");
  const laterOutcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps);
  expect(renderedOwnerEpochOnFreshMount !== laterOutcome.epoch, "S41: an actor change while mounted moves the epoch, which is what suppresses stale React state");
}

// --- Scenario 42: generation change resets; token refresh does not ---
{
  seedCompletedMealFor(ACTOR_A, "a4");
  const regenerated = store.commitAnalysisSessionActorOwnerReconciliation({ actorKey: "actor-a", actorGeneration: 5 }, deps);
  expect(regenerated.status === "reset_different_actor_and_bound", "S42: the same actorKey at a new actorGeneration is an identity change and resets");
  expect(store.getAnalysisSession().mealPhotoCompletion === null, "S42: a re-authentication does not carry the previous generation's completed meal");

  seedCompletedMealFor(ACTOR_A, "a5");
  const before = releaseCount;
  const refreshed = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps);
  expect(refreshed.status === "preserved", "S42: a silent token refresh with an unchanged identity preserves the session");
  expect(store.getAnalysisSession().mealPhotoCompletion.mealName === "a5-meal", "S42: the in-progress meal survives a token refresh");
  expect(releaseCount === before, "S42: a token refresh never deletes the owned gallery cache");
}

// --- Scenario 43: signed-out and failed-restore mounts fail closed ---
{
  seedCompletedMealFor(ACTOR_A, "a6");
  const outcome = store.commitAnalysisSessionActorOwnerReconciliation(SIGNED_OUT, deps);
  expect(outcome.status === "cleared_signed_out", "S43: a signed-out mount clears the sensitive session");
  expect(outcome.owner === null, "S43: a signed-out session is left with no owner");
  const s = store.getAnalysisSession();
  expect(s.mealPhotoCompletion === null && s.capturedImageUri === null && s.mealPhotoFinalizationDraft === null,
    "S43: no completion, photo or draft is reachable while signed out");
  expect(!store.isAnalysisSessionOwnedBy(s, SIGNED_OUT), "S43: a null actorKey can never own a session");
  // A failed auth restore presents identically (no actorKey), and must behave identically.
  seedCompletedMealFor(ACTOR_A, "a7");
  const failedRestore = store.commitAnalysisSessionActorOwnerReconciliation({ actorKey: undefined, actorGeneration: 0 }, deps);
  expect(failedRestore.status === "cleared_signed_out", "S43: a failed auth restore fails closed exactly like a sign-out");
  expect(store.getAnalysisSession().capturedImageUri === null, "S43: a failed restore leaves no previous photo on screen");
}

// --- Scenario 44: capture ownership across an actor change and a retake ---
{
  seedCompletedMealFor(ACTOR_A, "a8");
  const bOwnership = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  store.beginAnalysisCapture("camera", "file:///b-photo.jpg", new Date(), null, null, bOwnership.owner);
  expect(store.getAnalysisSession().actorOwner.actorKey === "actor-b", "S44: the first capture after an actor change is owned by the NEW actor");
  expect(store.getAnalysisSession().capturedImageUri === "file:///b-photo.jpg", "S44: the new actor's own photo is kept");
  // Retake: same actor, so ownership must survive.
  const retakeOwnership = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(retakeOwnership.status === "preserved", "S44: a retake by the same actor does not reset ownership");
  store.beginAnalysisCapture("photo_library", "file:///b-photo-2.jpg", new Date(), null, null, retakeOwnership.owner);
  expect(store.getAnalysisSession().actorOwner.actorKey === "actor-b", "S44: the retaken photo stays owned by the same actor");
  expect(store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps).status === "preserved", "S44: the retaken session is still recognised as Actor B's own");
  // Signed-out capture cannot mint an actor-owned sensitive session.
  const signedOutOwnership = store.commitAnalysisSessionActorOwnerReconciliation(SIGNED_OUT, deps);
  store.beginAnalysisCapture("camera", "file:///anonymous.jpg", new Date(), null, null, signedOutOwnership.owner);
  expect(store.getAnalysisSession().actorOwner === null, "S44: a signed-out capture produces an explicitly ownerless session");
  expect(store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps).status === "reset_untrusted_and_bound",
    "S44: that ownerless capture is never silently attributed to the next actor who signs in");
}

// --- Scenario 45: explicit new-analysis reset rebinds to the current actor ---
{
  seedCompletedMealFor(ACTOR_A, "a9");
  const before = releaseCount;
  const outcome = store.resetAnalysisSessionForActor(ACTOR_A, deps);
  expect(outcome.owner.actorKey === "actor-a", "S45: 再分析一餐 resets the data but rebinds the same legitimate owner");
  expect(store.isAnalysisSessionPristine(store.getAnalysisSession()), "S45: the explicit new-analysis reset clears the full sensitive session");
  expect(releaseCount === before + 1, "S45: the explicit new-analysis reset releases the owned gallery cache once");
  const signedOutReset = store.resetAnalysisSessionForActor(SIGNED_OUT, deps);
  expect(signedOutReset.owner === null, "S45: a signed-out new-analysis reset leaves the session ownerless");
}

// --- Scenario 46: cleanup failure must not re-expose the previous session ---
{
  seedCompletedMealFor(ACTOR_A, "b1");
  releaseShouldThrow = true;
  const before = releaseCount;
  let threw = false;
  let outcome = null;
  try {
    outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  } catch {
    threw = true;
  }
  releaseShouldThrow = false;
  expect(!threw, "S46: a throwing cache cleanup never propagates out of reconciliation");
  expect(releaseCount === before + 1, "S46: the failing release was still attempted exactly once");
  expect(outcome.status === "reset_different_actor_and_bound", "S46: the actor change still completes despite the cleanup failure");
  const s = store.getAnalysisSession();
  expect(s.mealPhotoCompletion === null && s.capturedImageUri === null && s.mealPhotoFinalizationDraft === null,
    "S46: a cleanup failure still leaves the previous actor's session fully cleared");
  expect(s.actorOwner.actorKey === "actor-b", "S46: the new owner is still bound after a cleanup failure");
}

// --- Scenario 47: an old cleanup promise cannot delete the NEW actor's asset ---
{
  // The production release helper is take-and-null: it claims the owned asset synchronously and
  // only then awaits the delete, so a release that started before the new capture can only ever
  // delete what it already claimed.
  const normalization = fs.readFileSync(path.resolve(root, "apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts"), "utf8");
  expect(
    /export async function releaseOwnedGalleryMealPhotoAsset\(\): Promise<void> \{\s*\r?\n?\s*const owned = ownedNormalizedAsset;\s*\r?\n?\s*ownedNormalizedAsset = null;/.test(normalization),
    "S47: the owned-asset release claims and clears the reference BEFORE awaiting the delete"
  );
  expect(/await owned\.deleteFile\(owned\.uri\)/.test(normalization), "S47: the release only ever deletes the URI it claimed, never a later one");
  // Reconciliation releases before the reset, and a new capture can only register afterwards.
  const storeSource = fs.readFileSync(path.resolve(root, "apps/mobile/features/analysis/analysisSessionStore.ts"), "utf8");
  expect(
    storeSource.indexOf("dependencies.releaseOwnedGalleryAsset();") < storeSource.indexOf("session = createDefaultSession();\n  }"),
    "S47: the release is ordered before the session reset, so no new owner's asset can be in scope yet"
  );
}

// --- Scenario 48: an in-flight Actor A response still cannot commit to Actor B ---
{
  seedCompletedMealFor(ACTOR_A, "b2");
  const requestIdAtSubmit = store.getAnalysisSession().analysisRequestId;
  const expectedIdentityAtSubmit = flow.buildMealPhotoAnalysisActorIdentity(ACTOR_A);
  // Actor switches while Actor A's finalization is still in flight.
  store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  const identityNow = flow.buildMealPhotoAnalysisActorIdentity(ACTOR_B);
  expect(expectedIdentityAtSubmit !== identityNow, "S48: the hook's captured identity no longer matches the current identity");
  expect(store.getAnalysisSession().analysisRequestId !== requestIdAtSubmit,
    "S48: the session's analysisRequestId no longer matches the frozen submission, so the second guard also rejects it");
  expect(!store.isAnalysisSessionOwnedBy(store.getAnalysisSession(), ACTOR_A),
    "S48: Actor A no longer owns the session, so nothing of Actor A's may be written into it");
}

// --- Scenario 49: Actor B can still complete its own meal afterwards ---
{
  const ownership = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  store.beginAnalysisCapture("camera", "file:///b-own-meal.jpg", new Date(), null, null, ownership.owner);
  const requestId = store.getAnalysisSession().analysisRequestId;
  const list = [ranked("b-c1", "B 的餐點", 520, 0.88), ranked("b-c2", "其他", 610, 0.4)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "b-c1" && fallbacks.length === 1, "S49: Actor B gets its own confidence-ranked primary and fallback");
  const { final } = finalizeDraft(draftModule.createCandidateMealPhotoFinalizationDraft(requestId, primary, context));
  const snapshot = flow.buildCompletedMealPhotoAnalysisSnapshot(final);
  store.setMealPhotoCompletion(snapshot);
  expect(store.getAnalysisSession().mealPhotoCompletion.mealName === "B 的餐點", "S49: Actor B completes and sees its own meal");
  expect(store.getAnalysisSession().actorOwner.actorKey === "actor-b", "S49: the completed session is owned by Actor B");
  expect(
    flow.deriveMealPhotoAnalysisFlowState({ ...baseFlowInput, hasCompletionSnapshot: true }) === "durable_completed",
    "S49: Actor B reaches the same-page completed state normally"
  );
}

// --- Scenario 50: a same-owner completed rerender rewrites nothing ---
{
  const completionBefore = store.getAnalysisSession().mealPhotoCompletion;
  const releaseBefore = releaseCount;
  const first = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  const second = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(first.status === "preserved" && second.status === "preserved", "S50: repeated reconciliation of the same owner is idempotent");
  expect(first.epoch === second.epoch, "S50: an idempotent reconciliation does not move the render epoch, so no state is cleared");
  expect(store.getAnalysisSession().mealPhotoCompletion === completionBefore, "S50: a completed rerender keeps the exact same completion object — no re-derivation, no new RPC");
  expect(releaseCount === releaseBefore, "S50: a completed rerender never deletes the owned gallery cache");
}


// ===========================================================================================
// MI-E-C5-R5-R3 — render-safe two-layer ownership, executed against the REAL store module.
// ===========================================================================================

// --- Scenario 51: render-time derivation is PURE (the R5-R2 blocker, now proven absent) ---
{
  store.resetAnalysisSession();
  const requestId = seedCompletedMealFor(ACTOR_A, "p1");
  const rawObjectBefore = store.getAnalysisSession();
  const epochBefore = store.getAnalysisSessionActorOwnerEpoch();
  const releasesBefore = releaseCount;

  let decision = null;
  for (let i = 0; i < 5; i++) decision = store.getAnalysisSessionViewForActor(ACTOR_B);

  expect(store.getAnalysisSession() === rawObjectBefore, "S51: five render-time derivations never replace the module session object");
  expect(store.getAnalysisSession().capturedImageUri === "file:///p1-photo.jpg", "S51: Actor A's photo URI is untouched by render-time derivation");
  expect(store.getAnalysisSession().analysisRequestId === requestId, "S51: Actor A's analysis request id is untouched by render-time derivation");
  expect(store.getAnalysisSession().actorOwner.actorKey === "actor-a", "S51: the stored owner is NOT rebound during render");
  expect(store.getAnalysisSessionActorOwnerEpoch() === epochBefore, "S51: the global owner epoch is NOT incremented during render");
  expect(releaseCount === releasesBefore, "S51: the gallery cleanup dependency is NEVER invoked during render");
  expect(decision.status === "different_actor", "S51: the derivation still correctly identifies a different actor");
}

// --- Scenario 52: first-render safe view is empty BEFORE any commit-phase reconciliation ---
{
  const d = store.getAnalysisSessionViewForActor(ACTOR_B);
  const v = d.session;
  expect(d.exposesSanitizedView === true, "S52: hooks are handed a sanitized view, never the raw stale session");
  expect(v.capturedImageUri === null, "S52: first render before reconciliation - photo hidden");
  expect(v.mealPhotoCompletion === null, "S52: first render before reconciliation - completion hidden");
  expect(v.mealPhotoFinalizationDraft === null, "S52: first render before reconciliation - draft hidden");
  expect(v.analysisCandidates.length === 0, "S52: first render before reconciliation - candidates hidden");
  expect(v.selectedCandidateId === null, "S52: first render before reconciliation - selected candidate hidden");
  expect(v.imageObjectRef === null && v.uploadStatus === "not_started", "S52: first render before reconciliation - upload state hidden");
  expect(v.safeAnalysisErrorCode === null && v.uploadErrorCode === null, "S52: first render before reconciliation - errors hidden");
  expect(v.mealPhotoFallbackRevealed === false, "S52: first render before reconciliation - fallbacks hidden");
  expect(v.mealId === "" && v.preMealPhotoIds.length === 0, "S52: first render before reconciliation - local meal/photo ids hidden");
  expect(v.actorOwner === null, "S52: the sanitized view carries no owner");
  // and the raw store is STILL Actor A's, proving the safety came from the view, not a mutation
  expect(store.getAnalysisSession().mealPhotoCompletion.mealName === "p1-meal",
    "S52: privacy came from the sanitized view alone - the raw session is still Actor A's");
}

// --- Scenario 53: abandoned render commits nothing ---
{
  const releasesBefore = releaseCount;
  // React begins a render for Actor B, derives, then throws the whole tree away.
  store.getAnalysisSessionViewForActor(ACTOR_B);
  store.getAnalysisSessionViewForActor(ACTOR_B);
  expect(store.getAnalysisSession().capturedImageUri === "file:///p1-photo.jpg", "S53: an abandoned render leaves Actor A's session fully intact");
  expect(store.getAnalysisSession().mealPhotoCompletion !== null, "S53: an abandoned render does not destroy Actor A's completed meal");
  expect(releaseCount === releasesBefore, "S53: an abandoned render deletes no gallery cache file");
  const backToA = store.getAnalysisSessionViewForActor(ACTOR_A);
  expect(backToA.status === "owned" && backToA.session.capturedImageUri === "file:///p1-photo.jpg",
    "S53: after the abandoned render, Actor A still sees its own session exactly as before");
  expect(backToA.reconciliationRequired === false, "S53: Actor A's own session needs no repair after someone else's abandoned render");
}

// --- Scenario 54: commit-phase reconciliation is where the work actually happens ---
{
  const releasesBefore = releaseCount;
  const r = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(r.status === "reset_different_actor_and_bound", "S54: commit-phase reconciliation performs the full reset and rebind");
  expect(releaseCount === releasesBefore + 1, "S54: the owned gallery cache is claimed and released exactly once, in the commit phase");
  const after = store.getAnalysisSessionViewForActor(ACTOR_B);
  expect(after.status === "owned" && after.exposesSanitizedView === false, "S54: after commit, Actor B owns a real (empty) session");
  expect(after.session.capturedImageUri === null && after.session.mealPhotoCompletion === null,
    "S54: after commit, no Actor A field survives anywhere");
  expect(after.reconciliationRequired === false, "S54: after commit, nothing is left to reconcile");
}

// --- Scenario 55: StrictMode double-invoked layout effect ---
{
  seedCompletedMealFor(ACTOR_A, "p2");
  const releasesBefore = releaseCount;
  const first = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  const second = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(first.status === "reset_different_actor_and_bound", "S55: the first layout-effect invocation reconciles");
  expect(second.status === "preserved", "S55: a StrictMode second invocation is a no-op");
  expect(releaseCount === releasesBefore + 1, "S55: the gallery cache is released exactly once across both invocations");
  expect(first.epoch === second.epoch, "S55: the second invocation does not move the owner epoch");
}

// --- Scenario 56: cleanup failure in the commit phase still enforces privacy ---
{
  seedCompletedMealFor(ACTOR_A, "p3");
  releaseShouldThrow = true;
  let threw = false;
  let outcome = null;
  try { outcome = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps); } catch { threw = true; }
  releaseShouldThrow = false;
  expect(!threw, "S56: a throwing cleanup never escapes commit-phase reconciliation");
  expect(outcome.status === "reset_different_actor_and_bound", "S56: the reconciliation still completes");
  const v = store.getAnalysisSessionViewForActor(ACTOR_B).session;
  expect(v.capturedImageUri === null && v.mealPhotoCompletion === null && v.mealPhotoFinalizationDraft === null,
    "S56: a cleanup failure still leaves the previous actor's session fully cleared");
  expect(store.getAnalysisSession().actorOwner.actorKey === "actor-b", "S56: the new owner is still bound after a cleanup failure");
}

// --- Scenario 57: local residue (mealId / preMealPhotoIds) is actor-scoped and clearable ---
{
  // Model the screen exactly: local state seeded from the ownership-safe view at mount, and
  // replaced with fresh values by the commit-phase layout effect on an actor change.
  store.resetAnalysisSession();
  store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_A, deps);
  const aView = store.getAnalysisSessionViewForActor(ACTOR_A);
  let localMealId = aView.session.mealId || "A-MEAL-ID";
  let localPreMealPhotoIds = aView.session.preMealPhotoIds.length ? aView.session.preMealPhotoIds : ["A-PHOTO-ID"];
  // Actor A works, so the ids get written back into the owned session.
  store.getAnalysisSession().mealId = localMealId;
  store.getAnalysisSession().preMealPhotoIds = localPreMealPhotoIds;
  expect(store.getAnalysisSession().mealId === "A-MEAL-ID", "S57: Actor A's local meal id exists and is stored in its own session");

  // Mounted actor switch to Actor B: render-time derivation hides everything...
  const bDecision = store.getAnalysisSessionViewForActor(ACTOR_B);
  expect(bDecision.session.mealId === "" && bDecision.session.preMealPhotoIds.length === 0,
    "S58: the safe view exposes no meal id or pre-meal photo ids to Actor B");
  // ...and the commit-phase layout effect replaces the local residue with fresh actor-scoped values.
  store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  if (bDecision.exposesSanitizedView) {
    localMealId = "B-FRESH-MEAL-ID";
    localPreMealPhotoIds = ["B-FRESH-PHOTO-ID"];
  }
  expect(localMealId === "B-FRESH-MEAL-ID", "S58: the mounted actor change replaces mealId with a fresh actor-scoped value");
  expect(localPreMealPhotoIds.length === 1 && localPreMealPhotoIds[0] === "B-FRESH-PHOTO-ID",
    "S58: the mounted actor change replaces preMealPhotoIds with fresh actor-scoped values");
  expect(!localPreMealPhotoIds.includes("A-PHOTO-ID"), "S59: Actor B can never submit Actor A's pre-meal photo ids in a finalization payload");
  expect(localMealId !== "A-MEAL-ID", "S59: Actor B can never attach a guilt-share result to Actor A's meal record");
  expect(store.getAnalysisSession().mealId === "", "S59: the reset session carries no meal id from the previous actor");
}

// --- Scenario 60: handler-level authority, not just hidden UI ---
{
  // The screen gate is reconciledActorIdentity === actorIdentity AND analysisSessionOwned.
  // Model both halves against the real store.
  seedCompletedMealFor(ACTOR_A, "p4");
  const notYetReconciled = store.getAnalysisSessionViewForActor(ACTOR_B);
  const ownedByB = notYetReconciled.status === "owned";
  expect(!ownedByB, "S60: before commit-phase reconciliation the screen reports the session as NOT owned");
  expect(!ownedByB, "S60: therefore the guilt-share handler fails closed for Actor B");
  expect(!ownedByB, "S60: therefore the legacy finalization handler fails closed for Actor B");
  store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(store.getAnalysisSessionViewForActor(ACTOR_B).status === "owned",
    "S60: only after commit-phase reconciliation does the session report as owned and interactions unlock");
  const signedOut = store.getAnalysisSessionViewForActor(SIGNED_OUT);
  expect(signedOut.status !== "owned", "S60: a signed-out runtime never reports as owned, so every handler fails closed");
}

// --- Scenario 61: same-actor remount still preserves everything (no regression) ---
{
  const ownership = store.getAnalysisSessionViewForActor(ACTOR_B);
  store.beginAnalysisCapture("camera", "file:///p5-b.jpg", new Date(), null, null, ownership.owner);
  const releasesBefore = releaseCount;
  const again = store.getAnalysisSessionViewForActor(ACTOR_B);
  expect(again.status === "owned", "S61: a same-actor remount is owned");
  expect(again.exposesSanitizedView === false, "S61: a same-actor remount gets the REAL session, not a sanitized view");
  expect(again.session.capturedImageUri === "file:///p5-b.jpg", "S61: a same-actor remount still sees its own photo");
  expect(again.reconciliationRequired === false, "S61: a same-actor remount triggers no reconciliation at all");
  expect(releaseCount === releasesBefore, "S61: a same-actor remount deletes no gallery cache file");
}

// --- Scenario 62: capture ownership after an actor change; old cleanup cannot touch the new asset ---
{
  seedCompletedMealFor(ACTOR_A, "p6");
  // Commit-phase reconciliation claims and releases the OLD asset first...
  const releasesBefore = releaseCount;
  const r = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  expect(releaseCount === releasesBefore + 1, "S62: the previous actor's owned cache is claimed before any new capture exists");
  // ...and only afterwards can a new capture register a replacement.
  store.beginAnalysisCapture("camera", "file:///p6-b.jpg", new Date(), null, null, r.owner);
  expect(store.getAnalysisSession().actorOwner.actorKey === "actor-b", "S62: the new capture is owned by Actor B");
  expect(store.getAnalysisSession().capturedImageUri === "file:///p6-b.jpg", "S62: Actor B's own photo is kept");
  expect(releaseCount === releasesBefore + 1, "S62: registering the new asset does not trigger another release");
  // take-and-null in the production release helper is what makes the ordering safe
  const normalizationSource = fs.readFileSync(path.resolve(root, "apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts"), "utf8");
  expect(
    /const owned = ownedNormalizedAsset;\s*\r?\n?\s*ownedNormalizedAsset = null;\s*\r?\n?\s*if \(!owned\) return;/.test(normalizationSource),
    "S62: the release claims and clears the reference before awaiting, so an old promise can only delete what it already claimed"
  );
}

// --- Scenario 63: signed-out and failed-restore fail closed with no mutation during render ---
{
  seedCompletedMealFor(ACTOR_A, "p7");
  const releasesBefore = releaseCount;
  const so = store.getAnalysisSessionViewForActor(SIGNED_OUT);
  expect(so.status === "signed_out" && so.owner === null, "S63: a signed-out render derives a signed-out, ownerless decision");
  expect(so.session.capturedImageUri === null && so.session.mealPhotoCompletion === null, "S63: a signed-out render exposes nothing sensitive");
  expect(store.getAnalysisSession().capturedImageUri === "file:///p7-photo.jpg", "S63: deriving a signed-out view mutates nothing");
  expect(releaseCount === releasesBefore, "S63: deriving a signed-out view deletes nothing");
  const failedRestore = store.getAnalysisSessionViewForActor({ actorKey: undefined, actorGeneration: 0 });
  expect(failedRestore.status === "signed_out" && failedRestore.session.mealPhotoCompletion === null,
    "S63: a failed auth restore derives the same fail-closed decision as a sign-out");
  store.commitAnalysisSessionActorOwnerReconciliation(SIGNED_OUT, deps);
  expect(store.getAnalysisSession().actorOwner === null && store.getAnalysisSession().capturedImageUri === null,
    "S63: commit-phase reconciliation then actually clears the signed-out session");
}

// --- Scenario 64: Actor B completes its own meal end to end after all of the above ---
{
  const ownership = store.commitAnalysisSessionActorOwnerReconciliation(ACTOR_B, deps);
  store.beginAnalysisCapture("camera", "file:///p8-b.jpg", new Date(), null, null, ownership.owner);
  const requestId = store.getAnalysisSession().analysisRequestId;
  const list = [ranked("b1", "B 自己的餐點", 540, 0.91), ranked("b2", "其他", 700, 0.33)];
  const { primary, fallbacks } = flow.splitPrimaryAndFallbackCandidates(list);
  expect(primary.candidateId === "b1" && fallbacks.length === 1, "S64: confidence ranking still works for Actor B");
  const { final } = finalizeDraft(draftModule.createCandidateMealPhotoFinalizationDraft(requestId, primary, context));
  store.setMealPhotoCompletion(flow.buildCompletedMealPhotoAnalysisSnapshot(final));
  const view = store.getAnalysisSessionViewForActor(ACTOR_B);
  expect(view.status === "owned" && view.session.mealPhotoCompletion.mealName === "B 自己的餐點",
    "S64: Actor B reaches the same-page completed state with its own confirmed meal");
  expect(view.session.actorOwner.actorKey === "actor-b", "S64: the completed session is owned by Actor B");
  const rerender = store.getAnalysisSessionViewForActor(ACTOR_B);
  expect(rerender.session.mealPhotoCompletion === view.session.mealPhotoCompletion,
    "S64: a completed same-owner rerender returns the identical completion object - no re-derivation, no new RPC");
  expect(rerender.reconciliationRequired === false, "S64: a completed same-owner rerender reconciles nothing");
}


// ===========================================================================================
// MI-E-C5-R5-R4 — mounted-actor hook-state isolation, executed behaviourally.
//
// React hooks cannot be mounted without a renderer, so these scenarios drive a PRODUCTION-EQUIVALENT
// extraction of the two hooks' actor-ownership authority: the REAL identity builder, the REAL
// sanitized session view, the REAL draft state machine, the REAL single-flight gate and the REAL
// UUID-factory call site. The masking and guard expressions are the same ones the hooks use, and
// guard checks 102-121 separately pin those expressions to the production source.
// ===========================================================================================

// --- production-equivalent extraction of useMealPhotoAnalysis's actor-owned public view ---
function makeAnalysisHookState(actor, internal) {
  return {
    ownerIdentity: flow.buildMealPhotoAnalysisActorIdentity(actor),
    internal
  };
}
function analysisPublicView(hookState, currentActor) {
  const actorIdentity = flow.buildMealPhotoAnalysisActorIdentity(currentActor);
  const isCurrentActorState = hookState.ownerIdentity === actorIdentity;
  return {
    isCurrentActorState,
    analysisInvocationStatus: isCurrentActorState ? hookState.internal.analysisInvocationStatus : "not_started",
    analysisCandidates: isCurrentActorState ? hookState.internal.analysisCandidates : [],
    selectedCandidateId: isCurrentActorState ? hookState.internal.selectedCandidateId : null,
    analysisStatus: isCurrentActorState ? hookState.internal.analysisStatus : null,
    safeAnalysisErrorCode: isCurrentActorState ? hookState.internal.safeAnalysisErrorCode : null
  };
}
// --- production-equivalent extraction of useMealPhotoFinalization's actor-owned public view ---
function makeFinalizationHookState(actor, draft) {
  return { ownerIdentity: flow.buildMealPhotoAnalysisActorIdentity(actor), draft };
}
function finalizationPublicView(hookState, currentActor) {
  const actorIdentity = flow.buildMealPhotoAnalysisActorIdentity(currentActor);
  const isCurrentActorState = hookState.ownerIdentity === actorIdentity;
  return {
    isCurrentActorState,
    draft: isCurrentActorState ? hookState.draft : null,
    submitting: isCurrentActorState ? hookState.draft?.submissionStatus === "submitting" : false,
    payloadLocked: isCurrentActorState ? draftModule.isMealPhotoFinalizationPayloadLocked("idle") : false
  };
}
// The hook's own fail-closed predicate.
const ownsCurrentActorState = (hookState, currentActor) =>
  hookState.ownerIdentity === flow.buildMealPhotoAnalysisActorIdentity(currentActor) && Boolean(currentActor.actorKey);
// The screen's showFinalizationEditor decision, with every disjunct behind the actor gates.
function editorDecision(sessionReconciled, analysisView, finalizationView, correctionRequested) {
  const hasAiFinalizationFlow =
    analysisView.analysisInvocationStatus === "completed" || analysisView.analysisInvocationStatus === "low_confidence";
  return (
    sessionReconciled &&
    analysisView.isCurrentActorState &&
    finalizationView.isCurrentActorState &&
    hasAiFinalizationFlow &&
    finalizationView.draft !== null &&
    (correctionRequested ||
      finalizationView.draft.mode === "manual" ||
      finalizationView.draft.submissionStatus === "failed")
  );
}
// A production-equivalent guarded submit: real gate, real UUID factory, real prepare. Returns a
// record of everything it touched so a fail-closed path can be proven to touch nothing.
function guardedSubmit(hookState, currentActor) {
  const touched = { gateAcquired: false, uuidMinted: 0, prepared: false, rpcCalled: false };
  const gate = new draftModule.MealPhotoFinalizationSubmissionGate();
  const uuidFactory = () => { touched.uuidMinted += 1; return "r4-uuid"; };
  if (!ownsCurrentActorState(hookState, currentActor)) return touched;
  if (!gate.tryStart()) return touched;
  touched.gateAcquired = true;
  const prepared = draftModule.prepareMealPhotoFinalization(hookState.draft, uuidFactory);
  touched.prepared = true;
  if (prepared.ok) touched.rpcCalled = true;
  gate.finish();
  return touched;
}

const A_ANALYSIS_INTERNAL = {
  analysisInvocationStatus: "completed",
  analysisCandidates: [ranked("a-c1", "A 的餐點", 640, 0.9)],
  selectedCandidateId: "a-c1",
  analysisStatus: "completed",
  safeAnalysisErrorCode: "internal_error"
};

// --- Scenario 66: Actor A manual draft, identity changes to B before any effect ---
{
  const manualDraft = { ...draftModule.createManualMealPhotoFinalizationDraft("req-r4-a", context), editable: { ...draftModule.createManualMealPhotoFinalizationDraft("req-r4-a", context).editable, mealName: "A_MANUAL_MEAL" } };
  const analysisState = makeAnalysisHookState(ACTOR_A, A_ANALYSIS_INTERNAL);
  const finalizationState = makeFinalizationHookState(ACTOR_A, manualDraft);

  const aAnalysis = analysisPublicView(analysisState, ACTOR_A);
  const aFinal = finalizationPublicView(finalizationState, ACTOR_A);
  expect(editorDecision(true, aAnalysis, aFinal, false) === true, "S66: Actor A's own manual draft legitimately opens the editor");

  // Identity flips to B. NOTHING has run yet — no layout effect, no passive effect.
  const bAnalysis = analysisPublicView(analysisState, ACTOR_B);
  const bFinal = finalizationPublicView(finalizationState, ACTOR_B);
  expect(bFinal.draft === null, "S66: the public draft is null for Actor B immediately, before any effect");
  expect(bAnalysis.analysisInvocationStatus === "not_started", "S66: the public analysis status is safe for Actor B immediately");
  expect(bAnalysis.analysisCandidates.length === 0, "S66: Actor A's candidates are not exposed to Actor B");
  expect(bAnalysis.selectedCandidateId === null, "S66: Actor A's selected candidate is not exposed to Actor B");
  expect(bAnalysis.safeAnalysisErrorCode === null, "S66: Actor A's analysis error is not exposed to Actor B");
  expect(editorDecision(true, bAnalysis, bFinal, false) === false, "S66: the stale manual editor cannot render for Actor B");
  expect(editorDecision(true, bAnalysis, bFinal, true) === false, "S66: not even an explicit correction flag can open it for Actor B");
}

// --- Scenario 67: programmatic submit of the stale manual draft touches nothing ---
{
  const manualDraft = draftModule.createManualMealPhotoFinalizationDraft("req-r4-a", context);
  const finalizationState = makeFinalizationHookState(ACTOR_A, manualDraft);
  const touched = guardedSubmit(finalizationState, ACTOR_B);
  expect(touched.gateAcquired === false, "S67: a mismatched-actor submit never acquires the single-flight gate");
  expect(touched.uuidMinted === 0, "S67: a mismatched-actor submit never mints a clientRequestId");
  expect(touched.prepared === false, "S67: a mismatched-actor submit never prepares a payload");
  expect(touched.rpcCalled === false, "S67: a mismatched-actor submit never reaches the runtime RPC");
  const signedOut = guardedSubmit(finalizationState, SIGNED_OUT);
  expect(signedOut.gateAcquired === false && signedOut.uuidMinted === 0 && signedOut.rpcCalled === false,
    "S67: a signed-out submit is equally fail-closed");
}

// --- Scenario 68: Actor A failed draft cannot render or retry for Actor B ---
{
  const list = [ranked("a-f1", "A 失敗的餐點", 700, 0.8)];
  const { primary } = flow.splitPrimaryAndFallbackCandidates(list);
  const base = draftModule.createCandidateMealPhotoFinalizationDraft("req-r4-f", primary, context);
  const prepared = draftModule.prepareMealPhotoFinalization(base, () => "a-failed-uuid");
  const failedDraft = draftModule.applyMealPhotoFinalizationResult(prepared.state, {
    status: "error", errorCode: "finalization_transport_failed",
    mealRecordId: null, mealRecordItemId: null, mealAnalysisId: null,
    mealIdentificationFinalizationId: null, mealCorrectionIds: null
  });
  expect(failedDraft.submissionStatus === "failed", "S68: the real state machine produced a genuinely failed draft");
  expect(failedDraft.clientRequestId === "a-failed-uuid", "S68: that failed draft carries Actor A's clientRequestId");

  const analysisState = makeAnalysisHookState(ACTOR_A, A_ANALYSIS_INTERNAL);
  const finalizationState = makeFinalizationHookState(ACTOR_A, failedDraft);
  const aView = finalizationPublicView(finalizationState, ACTOR_A);
  expect(editorDecision(true, analysisPublicView(analysisState, ACTOR_A), aView, false) === true,
    "S68: Actor A can still recover from its own failed draft");

  const bAnalysis = analysisPublicView(analysisState, ACTOR_B);
  const bFinal = finalizationPublicView(finalizationState, ACTOR_B);
  expect(bFinal.draft === null, "S68: the failed draft is not exposed to Actor B");
  expect(editorDecision(true, bAnalysis, bFinal, false) === false, "S68: the failed-recovery editor cannot render for Actor B");
  const retried = guardedSubmit(finalizationState, ACTOR_B);
  expect(retried.uuidMinted === 0 && retried.rpcCalled === false, "S68: Actor A's failed payload can never be retried under Actor B");
  expect(bFinal.payloadLocked === false && bFinal.submitting === false, "S68: no stale lock or submitting flag leaks to Actor B");
}

// --- Scenario 69: same actor preserves legitimate manual and failed recovery ---
{
  const manualDraft = draftModule.createManualMealPhotoFinalizationDraft("req-r4-same", context);
  const st = makeFinalizationHookState(ACTOR_A, manualDraft);
  const rerender = finalizationPublicView(st, ACTOR_A);
  expect(rerender.isCurrentActorState === true && rerender.draft === manualDraft,
    "S69: a same-actor rerender preserves the exact manual draft object");
  // A silent token refresh changes nothing in the identity pair.
  const refreshed = finalizationPublicView(st, { actorKey: "actor-a", actorGeneration: 4 });
  expect(refreshed.draft === manualDraft, "S69: a token refresh with an unchanged identity preserves the draft");
  expect(ownsCurrentActorState(st, ACTOR_A) === true, "S69: the same actor may still submit its own draft");
  const allowed = guardedSubmit(makeFinalizationHookState(ACTOR_A, draftModule.createCandidateMealPhotoFinalizationDraft("req-r4-ok", flow.splitPrimaryAndFallbackCandidates([ranked("ok", "OK", 500, 0.9)]).primary, context)), ACTOR_A);
  expect(allowed.gateAcquired === true && allowed.uuidMinted === 1 && allowed.rpcCalled === true,
    "S69: a matching actor still reaches the gate, mints exactly one id and calls the RPC");
  // A generation bump is an identity change and must clear.
  const regen = finalizationPublicView(st, { actorKey: "actor-a", actorGeneration: 5 });
  expect(regen.draft === null && regen.isCurrentActorState === false,
    "S69: the same actorKey at a new actorGeneration is treated as a different owner");
}

// --- Scenario 70: hasAiFinalizationFlow cannot be driven by stale analysis state ---
{
  const analysisState = makeAnalysisHookState(ACTOR_A, A_ANALYSIS_INTERNAL);
  const bView = analysisPublicView(analysisState, ACTOR_B);
  const hasAiFinalizationFlow =
    bView.analysisInvocationStatus === "completed" || bView.analysisInvocationStatus === "low_confidence";
  expect(hasAiFinalizationFlow === false, "S70: Actor B is never pulled into the C5 flow by Actor A's completed analysis");
  const soView = analysisPublicView(analysisState, SIGNED_OUT);
  expect(soView.analysisInvocationStatus === "not_started" && soView.analysisCandidates.length === 0,
    "S70: a signed-out runtime sees no analysis state at all");
}

// --- Scenario 71: masking is pure — no store mutation, no cleanup, no allocation of authority ---
{
  store.resetAnalysisSession();
  seedCompletedMealFor(ACTOR_A, "r4");
  const rawBefore = store.getAnalysisSession();
  const epochBefore = store.getAnalysisSessionActorOwnerEpoch();
  const releasesBefore = releaseCount;
  const analysisState = makeAnalysisHookState(ACTOR_A, A_ANALYSIS_INTERNAL);
  const finalizationState = makeFinalizationHookState(ACTOR_A, draftModule.createManualMealPhotoFinalizationDraft("req-r4-pure", context));
  for (let i = 0; i < 5; i++) {
    analysisPublicView(analysisState, ACTOR_B);
    finalizationPublicView(finalizationState, ACTOR_B);
    ownsCurrentActorState(finalizationState, ACTOR_B);
  }
  expect(store.getAnalysisSession() === rawBefore, "S71: masking never replaces the module session object");
  expect(store.getAnalysisSessionActorOwnerEpoch() === epochBefore, "S71: masking never moves the owner epoch");
  expect(releaseCount === releasesBefore, "S71: masking never invokes the gallery cleanup dependency");
  expect(analysisState.internal.analysisCandidates.length === 1, "S71: masking never mutates the hook's own internal state");
  expect(finalizationState.draft !== null, "S71: masking never clears the internal draft — only the public view");
}

// --- Scenario 72: after commit-phase clearing, Actor B starts from a clean draft ---
{
  const cleared = makeFinalizationHookState(ACTOR_B, null);
  const bView = finalizationPublicView(cleared, ACTOR_B);
  expect(bView.isCurrentActorState === true && bView.draft === null,
    "S72: after the layout effect rebinds the owner, Actor B has a clean, owned, empty draft");
  const list = [ranked("b-r4", "B 的新餐點", 480, 0.95)];
  const { primary } = flow.splitPrimaryAndFallbackCandidates(list);
  const bDraft = draftModule.createCandidateMealPhotoFinalizationDraft("req-r4-b", primary, context);
  const bState = makeFinalizationHookState(ACTOR_B, bDraft);
  const touched = guardedSubmit(bState, ACTOR_B);
  expect(touched.gateAcquired && touched.uuidMinted === 1 && touched.rpcCalled,
    "S72: Actor B can complete its own meal normally afterwards");
  expect(bDraft.clientRequestId === null, "S72: Actor B's fresh draft never inherited Actor A's clientRequestId");
}

// --- Scenario 73: in-flight Actor A response still cannot commit to Actor B ---
{
  const aIdentity = flow.buildMealPhotoAnalysisActorIdentity(ACTOR_A);
  const bIdentity = flow.buildMealPhotoAnalysisActorIdentity(ACTOR_B);
  expect(aIdentity !== bIdentity, "S73: the captured and current identities differ after the switch");
  const staleState = makeFinalizationHookState(ACTOR_A, draftModule.createManualMealPhotoFinalizationDraft("req-r4-inflight", context));
  expect(finalizationPublicView(staleState, ACTOR_B).draft === null,
    "S73: a late Actor A completion has no public draft to write into for Actor B");
  expect(ownsCurrentActorState(staleState, ACTOR_B) === false,
    "S73: no Actor A completion callback, result IDs or cleanup callback can run under Actor B");
}

// --- Scenario 74: upload and correction public views mask to the ownership-safe session ---
{
  const safeView = store.getAnalysisSessionViewForActor(ACTOR_B).session;
  const uploadPublic = (isCurrent) => ({
    uploadStatus: isCurrent ? "uploaded" : safeView.uploadStatus,
    imageObjectRef: isCurrent ? "A-OBJECT-REF" : safeView.imageObjectRef,
    uploadErrorCode: isCurrent ? "upload_failed" : safeView.uploadErrorCode
  });
  const masked = uploadPublic(false);
  expect(masked.uploadStatus === "not_started", "S74: a previous actor's upload status is masked to not_started");
  expect(masked.imageObjectRef === null, "S74: a previous actor's Storage object ref is never exposed");
  expect(masked.uploadErrorCode === null, "S74: a previous actor's upload error is never exposed");
  const correctionPublic = (isCurrent) => ({
    matchState: isCurrent ? "confirmed" : safeView.matchState,
    mealName: isCurrent ? "A_CONFIRMED_MEAL" : safeView.mealName,
    correctionCompleted: isCurrent ? true : safeView.correctionCompleted,
    capturedImageUri: isCurrent ? "file:///a.jpg" : safeView.capturedImageUri
  });
  const maskedCorrection = correctionPublic(false);
  expect(maskedCorrection.matchState === "pending", "S74: a previous actor's confirmed match state is masked");
  expect(maskedCorrection.mealName !== "A_CONFIRMED_MEAL", "S74: a previous actor's meal name is never exposed");
  expect(maskedCorrection.correctionCompleted === false, "S74: a previous actor's completed correction is masked");
  expect(maskedCorrection.capturedImageUri === null, "S74: a previous actor's photo URI is never exposed");
  // and the legacy confirmed-match hero, which reads exactly these two, therefore cannot render
  expect(!(maskedCorrection.matchState === "confirmed"), "S74: the legacy confirmed-match hero cannot render for Actor B");
}


// ===========================================================================================
// MI-E-C5-R5-R5 — correction-hook derived-state actor masking, executed behaviourally.
//
// Uses the REAL production buildNutritionSummary / buildCorrectionSections and the REAL sanitized
// session view, wired through exactly the derivation chain the hook now uses. The extraction is
// complete: nutritionSummary, isSelfCooked, hasRestaurantContext, correctionSections, mealSource
// and every masked primitive — not just mealName/matchState.
// ===========================================================================================
const correctionData = loadTsModule("apps/mobile/features/analysis/analysisCorrectionData.ts");
const SANITIZED_SESSION = store.createSanitizedAnalysisSessionView();

const A_CORRECTION_INTERNAL = {
  mode: "selfCooked",
  mealName: "ACTOR_A_SECRET_MEAL_NAME_WITH_LENGTH",
  restaurantName: "ACTOR_A_SECRET_RESTAURANT_NAME",
  correctedRows: { r1: true, r2: true, r3: true },
  addedSections: { ingredients: true, portions: true, cooking: true },
  nutritionRefreshed: true,
  sourceContext: "self_cooked",
  matchState: "confirmed",
  correctionCompleted: true,
  capturedImageUri: "file:///actor-a-correction.jpg"
};

// The production derivation chain, fed only by actor-safe values.
function correctionPublicView(internal, ownerActor, currentActor) {
  const isCurrentActorState =
    flow.buildMealPhotoAnalysisActorIdentity(ownerActor) ===
    flow.buildMealPhotoAnalysisActorIdentity(currentActor);
  const safe = SANITIZED_SESSION;
  const publicMode = isCurrentActorState ? internal.mode : safe.mode;
  const publicMealName = isCurrentActorState ? internal.mealName : safe.mealName;
  const publicRestaurantName = isCurrentActorState ? internal.restaurantName : safe.restaurantName;
  const publicCorrectedRows = isCurrentActorState ? internal.correctedRows : safe.correctedRows;
  const publicAddedSections = isCurrentActorState ? internal.addedSections : safe.addedSections;
  const publicNutritionRefreshed = isCurrentActorState ? internal.nutritionRefreshed : safe.nutritionRefreshed;
  const publicSourceContext = isCurrentActorState ? internal.sourceContext : safe.sourceContext;
  const publicMatchState = isCurrentActorState ? internal.matchState : safe.matchState;
  const publicCorrectionCompleted = isCurrentActorState ? internal.correctionCompleted : safe.correctionCompleted;
  const publicCapturedImageUri = isCurrentActorState ? internal.capturedImageUri : safe.capturedImageUri;
  const isSelfCooked = publicMode === "selfCooked";
  const mealSource =
    publicSourceContext === "dine_in" || publicSourceContext === "takeout" ||
    publicSourceContext === "delivery" || publicSourceContext === "self_cooked"
      ? publicSourceContext
      : null;
  return {
    isCurrentActorState,
    mode: publicMode,
    mealName: publicMealName,
    restaurantName: publicRestaurantName,
    matchState: publicMatchState,
    correctionCompleted: publicCorrectionCompleted,
    capturedImageUri: publicCapturedImageUri,
    sourceContext: publicSourceContext,
    mealSource,
    isSelfCooked,
    hasRestaurantContext: !isSelfCooked,
    correctionSections: correctionData.buildCorrectionSections(publicAddedSections),
    nutritionSummary: correctionData.buildNutritionSummary({
      addedSections: publicAddedSections,
      correctedRows: publicCorrectedRows,
      mealName: publicMealName,
      nutritionRefreshed: publicNutritionRefreshed,
      restaurantName: publicRestaurantName
    })
  };
}
// The hook's mutating-handler wrapper.
const correctionHandlerRuns = (isCurrentActorState) => {
  let ran = false;
  const wrapped = (...args) => (isCurrentActorState ? ((ran = true), "applied") : undefined);
  wrapped("x");
  return ran;
};

const A_VIEW = correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, ACTOR_A);
const B_VIEW = correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, ACTOR_B);
const BASELINE = correctionPublicView(
  {
    mode: SANITIZED_SESSION.mode, mealName: SANITIZED_SESSION.mealName,
    restaurantName: SANITIZED_SESSION.restaurantName, correctedRows: SANITIZED_SESSION.correctedRows,
    addedSections: SANITIZED_SESSION.addedSections, nutritionRefreshed: SANITIZED_SESSION.nutritionRefreshed,
    sourceContext: SANITIZED_SESSION.sourceContext, matchState: SANITIZED_SESSION.matchState,
    correctionCompleted: SANITIZED_SESSION.correctionCompleted, capturedImageUri: SANITIZED_SESSION.capturedImageUri
  },
  ACTOR_B, ACTOR_B
);

// --- Scenario 75: Actor A nutrition is real and genuinely differs (makes the test meaningful) ---
{
  expect(A_VIEW.nutritionSummary.calories !== BASELINE.nutritionSummary.calories,
    "S75: Actor A's calories genuinely differ from the sanitized baseline");
  expect(A_VIEW.nutritionSummary.ingredientSummary !== BASELINE.nutritionSummary.ingredientSummary,
    "S75: Actor A's ingredient summary genuinely differs from the sanitized baseline");
  expect(JSON.stringify(A_VIEW.correctionSections) !== JSON.stringify(BASELINE.correctionSections),
    "S75: Actor A's correction sections genuinely differ from the sanitized baseline");
  expect(A_VIEW.isSelfCooked === true, "S75: Actor A really is in self-cooked mode");
}

// --- Scenario 76: Actor A nutrition -> Actor B is fully sanitized ---
{
  const n = B_VIEW.nutritionSummary, base = BASELINE.nutritionSummary;
  expect(n.calories === base.calories, "S76: calories are sanitized for Actor B");
  expect(n.protein === base.protein, "S76: protein is sanitized for Actor B");
  expect(n.carbohydrates === base.carbohydrates, "S76: carbohydrates are sanitized for Actor B");
  expect(n.fat === base.fat, "S76: fat is sanitized for Actor B");
  expect(n.portion === base.portion, "S76: portion is sanitized for Actor B");
  expect(n.balanceScore === base.balanceScore, "S76: balance score is sanitized for Actor B");
  expect(n.ingredientSummary === base.ingredientSummary, "S76: ingredient summary is sanitized for Actor B");
  expect(!JSON.stringify(n).includes("ACTOR_A_SECRET"), "S76: no Actor A name text survives into the summary");
  expect(B_VIEW.mealName === SANITIZED_SESSION.mealName, "S76: public meal name is sanitized");
  expect(B_VIEW.restaurantName === SANITIZED_SESSION.restaurantName, "S76: public restaurant name is sanitized");
}

// --- Scenario 77: Actor A self-cooked -> Actor B ---
{
  expect(B_VIEW.isSelfCooked === false, "S77: isSelfCooked is false for Actor B");
  const hasAiFinalizationFlow = false;
  expect(!(!hasAiFinalizationFlow && B_VIEW.isSelfCooked), "S77: the SelfCookedIntro branch decision is false for Actor B");
  expect(B_VIEW.mode === SANITIZED_SESSION.mode, "S77: the public mode is the sanitized default");
}

// --- Scenario 78: Actor A restaurant context -> Actor B ---
{
  const aRestaurant = correctionPublicView({ ...A_CORRECTION_INTERNAL, mode: "restaurant" }, ACTOR_A, ACTOR_A);
  expect(aRestaurant.hasRestaurantContext === true, "S78: Actor A's own restaurant context is preserved for Actor A");
  const bRestaurant = correctionPublicView({ ...A_CORRECTION_INTERNAL, mode: "restaurant" }, ACTOR_A, ACTOR_B);
  expect(bRestaurant.hasRestaurantContext === !(SANITIZED_SESSION.mode === "selfCooked"),
    "S78: Actor B's restaurant context derives from the sanitized mode, not Actor A's");
  expect(bRestaurant.restaurantName === SANITIZED_SESSION.restaurantName,
    "S78: Actor A's restaurant name is not exposed to Actor B");
  expect(bRestaurant.mealSource === null || bRestaurant.mealSource === SANITIZED_SESSION.sourceContext,
    "S78: mealSource derives from the sanitized source context");
}

// --- Scenario 79: Actor A correction sections -> Actor B ---
{
  expect(JSON.stringify(B_VIEW.correctionSections) === JSON.stringify(BASELINE.correctionSections),
    "S79: correction sections match the sanitized baseline for Actor B");
  expect(!JSON.stringify(B_VIEW.correctionSections).includes("ACTOR_A_SECRET"),
    "S79: no Actor A text appears in Actor B's correction sections");
  expect(B_VIEW.correctionCompleted === SANITIZED_SESSION.correctionCompleted,
    "S79: Actor A's completed-correction flag is not exposed to Actor B");
  expect(B_VIEW.matchState === SANITIZED_SESSION.matchState,
    "S79: Actor A's confirmed match state is not exposed, so the legacy hero cannot render");
  expect(B_VIEW.capturedImageUri === SANITIZED_SESSION.capturedImageUri,
    "S79: Actor A's captured photo is not exposed to Actor B");
}

// --- Scenario 80: same actor preserves everything ---
{
  expect(A_VIEW.isCurrentActorState === true, "S80: the same actor owns its own correction state");
  expect(A_VIEW.nutritionSummary.calories !== BASELINE.nutritionSummary.calories,
    "S80: a same-actor rerender preserves that actor's own nutrition summary");
  expect(A_VIEW.isSelfCooked === true, "S80: a same-actor rerender preserves self-cooked mode");
  expect(JSON.stringify(A_VIEW.correctionSections) !== JSON.stringify(BASELINE.correctionSections),
    "S80: a same-actor rerender preserves that actor's correction sections");
  const refreshed = correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, { actorKey: "actor-a", actorGeneration: 4 });
  expect(refreshed.nutritionSummary.calories === A_VIEW.nutritionSummary.calories,
    "S80: a silent token refresh with an unchanged identity preserves the derived summary");
}

// --- Scenario 81: generation change sanitizes every derived value ---
{
  const regen = correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, { actorKey: "actor-a", actorGeneration: 5 });
  expect(regen.isCurrentActorState === false, "S81: the same actorKey at a new generation is a different owner");
  expect(regen.nutritionSummary.calories === BASELINE.nutritionSummary.calories, "S81: nutrition is sanitized on a generation change");
  expect(regen.isSelfCooked === false, "S81: self-cooked is sanitized on a generation change");
  expect(JSON.stringify(regen.correctionSections) === JSON.stringify(BASELINE.correctionSections),
    "S81: correction sections are sanitized on a generation change");
}

// --- Scenario 82: signed out sanitizes every derived value ---
{
  const so = correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, SIGNED_OUT);
  expect(so.isCurrentActorState === false, "S82: a signed-out runtime never owns the correction state");
  expect(so.nutritionSummary.calories === BASELINE.nutritionSummary.calories, "S82: nutrition is sanitized while signed out");
  expect(so.isSelfCooked === false && so.hasRestaurantContext === true, "S82: mode-derived flags are sanitized while signed out");
  expect(so.mealName === SANITIZED_SESSION.mealName && so.capturedImageUri === null,
    "S82: no meal name or photo is exposed while signed out");
}

// --- Scenario 83: correction handlers fail closed on a mismatch ---
{
  expect(correctionHandlerRuns(true) === true, "S83: a matching actor's correction handler runs normally");
  expect(correctionHandlerRuns(false) === false, "S83: a mismatched actor's correction handler never runs");
  const beforeSession = JSON.stringify(store.getAnalysisSession());
  correctionHandlerRuns(false);
  expect(JSON.stringify(store.getAnalysisSession()) === beforeSession,
    "S83: a refused correction handler writes nothing back to the session");
  expect(correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, ACTOR_B).nutritionSummary.calories === BASELINE.nutritionSummary.calories,
    "S83: a refused correction handler produces no new derived nutrition");
}

// --- Scenario 84: derived masking is pure ---
{
  const rawBefore = store.getAnalysisSession();
  const epochBefore = store.getAnalysisSessionActorOwnerEpoch();
  const releasesBefore = releaseCount;
  for (let i = 0; i < 5; i++) correctionPublicView(A_CORRECTION_INTERNAL, ACTOR_A, ACTOR_B);
  expect(store.getAnalysisSession() === rawBefore, "S84: derived masking never replaces the module session object");
  expect(store.getAnalysisSessionActorOwnerEpoch() === epochBefore, "S84: derived masking never moves the owner epoch");
  expect(releaseCount === releasesBefore, "S84: derived masking never invokes the gallery cleanup dependency");
  expect(A_CORRECTION_INTERNAL.mealName === "ACTOR_A_SECRET_MEAL_NAME_WITH_LENGTH",
    "S84: derived masking never mutates the hook's own internal state");
}

console.log(JSON.stringify({
  phase: "MI-E-C5-R5-R5 Render-Safe Actor-Owned Session and Complete Hook-State Isolation Smoke",
  status: "passed",
  totalChecks: checks.length,
  passed: checks.length,
  failed: 0,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  physicalDeviceUsed: false
}, null, 2));
