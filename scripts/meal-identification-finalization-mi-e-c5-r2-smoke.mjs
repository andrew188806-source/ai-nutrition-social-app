#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const tempBase = fs.existsSync("/tmp") ? "/tmp" : os.tmpdir();
const tempRoot = fs.mkdtempSync(path.join(tempBase, "meal-identification-finalization-mi-e-c5-r2-smoke-"));
const checks = [];
const expect = (condition, name) => {
  if (!condition) throw new Error(`R2 smoke assertion failed: ${name}`);
  checks.push({ name, pass: true });
};

function transpile(relativePath) {
  const sourcePath = path.join(root, relativePath);
  const outputPath = path.join(tempRoot, relativePath.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: sourcePath
  });
  fs.writeFileSync(outputPath, result.outputText);
}

const candidateA = {
  candidateId: "11111111-1111-4111-8111-111111111111",
  observedName: "雞肉蔬菜飯",
  components: [{ name: "雞肉", estimatedPortion: "一掌心" }],
  estimatedNutrition: { calories: 520, proteinGrams: 38, carbsGrams: 55, fatGrams: 15 },
  confidence: 0.88,
  uncertaintyReasonCodes: []
};
const candidateB = {
  ...candidateA,
  candidateId: "22222222-2222-4222-8222-222222222222",
  observedName: "牛肉番茄飯",
  components: [{ name: "牛肉", estimatedPortion: "一掌心" }],
  estimatedNutrition: { calories: 640, proteinGrams: 34, carbsGrams: 66, fatGrams: 21 }
};
const analysisRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const readyUnknownContext = {
  captureMethod: "camera",
  sourceContext: "unknown",
  recordTiming: "current",
  occurredAt: "2026-07-31T04:00:00.000Z",
  selectedMealPeriod: "午餐"
};
let uuidCounter = 0;
const uuidFactory = () => {
  uuidCounter += 1;
  return `bbbbbbbb-bbbb-4bbb-8bbb-${String(uuidCounter).padStart(12, "0")}`;
};

try {
  [
    "apps/mobile/features/analysis/mealPhotoFinalizationReadiness.ts",
    "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts",
    "apps/mobile/features/meal-identification-finalization/v3Contract.ts"
  ].forEach(transpile);
  const requireFromFeature = createRequire(
    path.join(tempRoot, "apps/mobile/features/analysis/mealPhotoFinalizationReadiness.js")
  );
  const readiness = requireFromFeature("./mealPhotoFinalizationReadiness.js");
  const draft = requireFromFeature("./mealPhotoFinalizationDraft.js");
  const v3 = requireFromFeature("../meal-identification-finalization/v3Contract.js");
  expect(true, "real R2 readiness and frozen draft modules transpile and load");

  for (const count of [2, 3]) {
    const candidates = Array.from({ length: count }, (_, index) => ({ id: `candidate-${index + 1}` }));
    const visible = readiness.getCompactMealPhotoFinalizationCandidates(candidates);
    expect(
      visible.length === count && visible.every((entry, index) => entry === candidates[index]),
      `compact list preserves the production-reachable ${count} candidate rows and their order`
    );
  }
  const fiveCandidates = Array.from({ length: 5 }, (_, index) => ({ id: `candidate-${index + 1}` }));
  expect(
    readiness.getCompactMealPhotoFinalizationCandidates(fiveCandidates).length === 5,
    "compact renderer is forward-compatible with a synthetic five-candidate presentation"
  );
  const sixCandidates = Array.from({ length: 6 }, (_, index) => ({ id: `candidate-${index + 1}` }));
  expect(
    readiness.getCompactMealPhotoFinalizationCandidates(sixCandidates).length === 5,
    "defensive compact ceiling intentionally hides synthetic rows after the fifth"
  );

  const readinessInput = {
    occurredAt: readyUnknownContext.occurredAt,
    recordTimingConfirmed: true,
    sourceContext: "unknown",
    selectedMealPeriod: readyUnknownContext.selectedMealPeriod
  };
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason(readinessInput) === null,
    "unknown is a legal ready source according to frozen repository authority"
  );
  for (const sourceContext of ["dine_in", "takeout", "delivery", "self_cooked", "unknown"]) {
    expect(
      readiness.getMealPhotoFinalizationContextBlockReason({ ...readinessInput, sourceContext }) === null,
      `${sourceContext} is a legal finalization source`
    );
  }
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readinessInput, sourceContext: null }) === "missing_meal_source",
    "an actually absent source reports the specific missing-meal-source reason"
  );
  const missingSourceCommand = v3.buildMealIdentificationFinalizationV3({
    analysisRequestId,
    selectedCandidateId: candidateA.candidateId,
    captureMethod: "camera",
    sourceContext: null,
    recordTiming: "current",
    occurredAt: readyUnknownContext.occurredAt,
    mealWrite: {
      mealName: candidateA.observedName,
      components: ["雞肉"],
      portion: null,
      nutrition: candidateA.estimatedNutrition
    }
  });
  expect(
    missingSourceCommand.ok === false,
    "programmatic v3 construction rejects an actually absent meal source"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readinessInput, occurredAt: "" }) === "missing_occurred_at",
    "missing actual meal time blocks readiness"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readinessInput, recordTimingConfirmed: false }) === "missing_record_timing",
    "unconfirmed record timing blocks readiness"
  );
  expect(
    readiness.getMealPhotoFinalizationContextBlockReason({ ...readinessInput, selectedMealPeriod: "" }) === "missing_meal_period",
    "missing meal period blocks readiness"
  );

  let selectedA = draft.createCandidateMealPhotoFinalizationDraft(
    analysisRequestId,
    candidateA,
    readyUnknownContext
  );
  selectedA = draft.updateMealPhotoFinalizationField(selectedA, "mealName", "A 的未提交修改", uuidFactory);
  const selectedB = draft.createCandidateMealPhotoFinalizationDraft(
    analysisRequestId,
    candidateB,
    readyUnknownContext
  );
  expect(
    selectedB.editable.mealName === candidateB.observedName &&
      selectedB.editable.mealName !== selectedA.editable.mealName,
    "selecting B replaces the one shared draft with fresh B values"
  );
  expect(
    selectedB.selectedCandidateId === candidateB.candidateId &&
      selectedB.originalCandidate?.candidateId === candidateB.candidateId,
    "candidate switching preserves only B identity and original snapshot"
  );

  const manual = draft.createManualMealPhotoFinalizationDraft(
    analysisRequestId,
    readyUnknownContext
  );
  expect(
    manual.mode === "manual" &&
      manual.selectedCandidateId === null &&
      manual.originalCandidate === null,
    "manual fallback reuses the shared draft shape with null candidate and no fake snapshot"
  );

  const preparedUnknown = draft.prepareMealPhotoFinalization(selectedB, uuidFactory);
  expect(
    preparedUnknown.ok && preparedUnknown.command.sourceContext === "unknown",
    "programmatic finalization accepts and preserves legal unknown source"
  );
  expect(
    preparedUnknown.ok && preparedUnknown.command.selectedCandidateId === candidateB.candidateId,
    "accepted candidate mapping remains unchanged"
  );

  const correctedB = draft.updateMealPhotoFinalizationField(selectedB, "calories", "700", uuidFactory);
  const preparedCorrected = draft.prepareMealPhotoFinalization(correctedB, uuidFactory);
  expect(
    preparedCorrected.ok &&
      preparedCorrected.command.selectedCandidateId === candidateB.candidateId &&
      preparedCorrected.command.mealWrite.nutrition.calories === 700,
    "corrected mapping retains candidate identity and edited value"
  );

  let validManual = draft.updateMealPhotoFinalizationField(manual, "mealName", "手動蔬菜湯", uuidFactory);
  const preparedManual = draft.prepareMealPhotoFinalization(validManual, uuidFactory);
  expect(
    preparedManual.ok && preparedManual.command.selectedCandidateId === null,
    "manual mapping remains null without a fabricated candidate"
  );

  const gate = new draft.MealPhotoFinalizationSubmissionGate();
  expect(gate.tryStart() === true && gate.tryStart() === false, "single-flight gate blocks a double submit");
  gate.finish();
  expect(gate.tryNavigate() === true && gate.tryNavigate() === false, "navigation gate allows success navigation once");

  const b2 = spawnSync(
    process.execPath,
    [path.join(root, "scripts/meal-identification-finalization-mi-e-c5-b2-smoke.mjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, TMPDIR: "/tmp", TEMP: "/tmp", TMP: "/tmp" }
    }
  );
  expect(b2.status === 0, "frozen B2 uncertain lock, exact retry, and durable finalization smoke remains green");

  console.log(JSON.stringify({
    phase: "MI-E-C5-R2 Mobile Finalization Readiness Smoke",
    status: "passed",
    totalChecks: checks.length,
    passed: checks.length,
    failed: 0,
    checks,
    networkUsed: false,
    databaseUsed: false,
    remoteOperations: false
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    phase: "MI-E-C5-R2 Mobile Finalization Readiness Smoke",
    status: "failed",
    reason: error instanceof Error ? error.message : String(error),
    passed: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    remoteOperations: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
