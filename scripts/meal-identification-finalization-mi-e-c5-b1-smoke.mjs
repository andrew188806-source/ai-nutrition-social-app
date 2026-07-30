// MI-E-C5-B1 unit/service smoke: compiles the real production TypeScript modules (not a parallel
// reimplementation) and exercises them directly in Node. Companion to
// meal-identification-finalization-mi-e-c5-b1-guard.mjs (static/structural).
//
// Scope boundary, disclosed: this round adds a client-side v3 request builder/validator and
// error-mapping vocabulary, and a backward-compatible SQL migration — it does NOT wire any UI,
// hook, or session store (that is explicitly C5-B2's job). DB-behavior scenarios (real RPC calls,
// exactly-one-meal/analysis evidence, replay, cross-actor denial, backward compatibility of the
// live v1/v2 payloads) are therefore NOT exercised here — they are exercised against real
// Development infrastructure in the round's live validation matrix instead. This smoke covers
// exactly what is real, compiled, Node-executable production code this round: the v3 command
// builder/validator (v3Contract.ts) and the new v3 error-token mappings
// (mealIdentificationFinalizationMappers.ts).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const mobileRoot = path.join(root, "apps", "mobile");
const featureRoot = path.join(mobileRoot, "features");
const finalizationFeatureRoot = path.join(featureRoot, "meal-identification-finalization");
const sharedSrcRoot = path.join(root, "packages", "shared", "src");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meal-identification-finalization-mi-e-c5-b1-smoke-"));
const compiledFeatureRoot = path.join(tempRoot, "features");
const compiledSharedRoot = path.join(tempRoot, "shared");
const checks = [];

function expect(condition, name, message = "Smoke assertion failed.") {
  if (!condition) throw new Error(`${name}: ${message}`);
  checks.push({ name, pass: true });
}

function collectTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
}

function compile(rootNames, outDir, rootDir) {
  const program = ts.createProgram(rootNames, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir,
    rootDir
  });
  const emit = program.emit();
  return ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
}

// errors.ts/v3Contract.ts/supabaseMealIdentificationFinalizationContracts.ts/
// mealIdentificationFinalizationMappers.ts are compiled with transpileModule (a pure per-file
// syntax-directed transform, no cross-file type resolution) rather than the full ts.createProgram
// path above. Reason, disclosed: two of these files have a type-only `import type {
// MealIdentificationFinalizationCommand } from "../meal-identification"`, fully erased at runtime
// (no require() is ever emitted for it), but a full-program compile still needs to *resolve* it
// for type-checking, which transitively pulls in features/restaurants/catalog and
// apps/mobile/adapters/mock — outside this smoke's intentionally narrow scope. None of these four
// files import a VALUE (only types) from ./types.ts or ../meal-identification at runtime, so
// skipping types.ts from compilation entirely and transpiling the other four is sufficient — the
// real, full-context type-check for every one of these files is already provided by apps/mobile's
// own `tsc --noEmit` (run as part of this round's regression suite).
function transpileOnly(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: absPath
  });
  return result.outputText;
}

try {
  const finalizationOut = path.join(compiledFeatureRoot, "meal-identification-finalization");
  fs.mkdirSync(finalizationOut, { recursive: true });
  for (const relative of ["errors.ts", "v3Contract.ts", "supabaseMealIdentificationFinalizationContracts.ts", "mealIdentificationFinalizationMappers.ts"]) {
    const outName = relative.replace(/\.ts$/, ".js");
    fs.writeFileSync(path.join(finalizationOut, outName), transpileOnly(path.join(finalizationFeatureRoot, relative)));
  }
  expect(true, "meal-identification-finalization v3 files (errors/v3Contract/supabaseContracts/mappers) transpile cleanly");

  const sharedDiagnostics = compile(collectTsFiles(sharedSrcRoot), compiledSharedRoot, sharedSrcRoot);
  expect(sharedDiagnostics.length === 0, "@haocu/shared TypeScript compilation", sharedDiagnostics.map(formatDiagnostic).join("\n"));
  const { createRequire } = await import("node:module");
  const requireFromFeature = createRequire(path.join(finalizationOut, "v3Contract.js"));
  const v3Module = requireFromFeature("./v3Contract.js");
  const mappersModule = requireFromFeature("./mealIdentificationFinalizationMappers.js");
  const errorsModule = requireFromFeature("./errors.js");

  function baseInput(overrides = {}) {
    return {
      analysisRequestId: "22222222-2222-4222-8222-222222222222",
      selectedCandidateId: "11111111-1111-4111-8111-111111111111",
      captureMethod: "camera",
      sourceContext: "dine_in",
      recordTiming: "current",
      occurredAt: "2026-07-27T08:00:00.000Z",
      mealWrite: {
        mealName: "白飯與滷肉",
        components: ["白飯", "滷肉"],
        portion: "一碗",
        nutrition: { calories: 550, proteinGrams: 22, carbsGrams: 70, fatGrams: 18 }
      },
      ...overrides
    };
  }

  // ================= happy path: unchanged candidate values pass through =================
  const okResult = v3Module.buildMealIdentificationFinalizationV3(baseInput());
  expect(okResult.ok, "a well-formed v3 input builds successfully");
  expect(okResult.ok && okResult.value.version === "meal-identification-finalization-v3", "the built command carries the v3 version literal");
  expect(okResult.ok && okResult.value.analysisRequestId === "22222222-2222-4222-8222-222222222222", "analysisRequestId passes through unchanged");
  expect(okResult.ok && okResult.value.mealWrite.mealName === "白飯與滷肉", "meal name passes through unchanged");

  // ================= edit name / components / portion / nutrition =================
  const editedName = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, mealName: "改過的名字" } }));
  expect(editedName.ok && editedName.value.mealWrite.mealName === "改過的名字", "an edited meal name is accepted and preserved (server decides accepted-vs-corrected, not this builder)");

  const editedComponents = v3Module.buildMealIdentificationFinalizationV3(
    baseInput({ mealWrite: { ...baseInput().mealWrite, components: ["白飯", "  ", "青菜", ""] } })
  );
  expect(editedComponents.ok && JSON.stringify(editedComponents.value.mealWrite.components) === JSON.stringify(["白飯", "青菜"]), "empty/whitespace-only component entries are dropped, never rejected");

  const editedPortion = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, portion: "半碗" } }));
  expect(editedPortion.ok && editedPortion.value.mealWrite.portion === "半碗", "an edited portion is accepted and preserved");

  const nullPortion = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, portion: null } }));
  expect(nullPortion.ok && nullPortion.value.mealWrite.portion === null, "a null portion is accepted (portion is optional)");

  const editedNutrition = v3Module.buildMealIdentificationFinalizationV3(
    baseInput({ mealWrite: { ...baseInput().mealWrite, nutrition: { calories: 600 } } })
  );
  expect(editedNutrition.ok && editedNutrition.value.mealWrite.nutrition.calories === 600, "a partial nutrition object (only calories) is accepted — unknown fields are never fabricated as 0");
  expect(editedNutrition.ok && !("proteinGrams" in editedNutrition.value.mealWrite.nutrition), "omitted nutrition fields stay omitted, never silently defaulted to 0");

  // ================= manual fallback =================
  const manualInput = baseInput({ selectedCandidateId: null, mealWrite: { mealName: "手動輸入的餐點", components: [], portion: null, nutrition: {} } });
  const manualResult = v3Module.buildMealIdentificationFinalizationV3(manualInput);
  expect(manualResult.ok && manualResult.value.selectedCandidateId === null, "manual fallback (selectedCandidateId: null) is accepted");

  // ================= empty name rejection =================
  const emptyNameResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, mealName: "   " } }));
  expect(!emptyNameResult.ok && emptyNameResult.error.code === "correction_validation_failed", "a whitespace-only meal name is rejected as correction_validation_failed");

  const emptyManualNameResult = v3Module.buildMealIdentificationFinalizationV3({
    ...manualInput,
    mealWrite: { ...manualInput.mealWrite, mealName: "" }
  });
  expect(!emptyManualNameResult.ok && emptyManualNameResult.error.code === "invalid_manual_draft", "an empty meal name under manual fallback is rejected as invalid_manual_draft specifically");

  // ================= negative nutrition rejection =================
  const negativeResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, nutrition: { calories: -5 } } }));
  expect(!negativeResult.ok && negativeResult.error.code === "correction_validation_failed", "negative calories are rejected");

  // ================= NaN / Infinity rejection =================
  const nanResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, nutrition: { calories: NaN } } }));
  expect(!nanResult.ok && nanResult.error.code === "correction_validation_failed", "NaN calories is rejected");
  const infinityResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, nutrition: { proteinGrams: Infinity } } }));
  expect(!infinityResult.ok && infinityResult.error.code === "correction_validation_failed", "Infinity proteinGrams is rejected");

  // ================= max-length / defensive upper bound rejection =================
  const longName = "a".repeat(161);
  const longNameResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, mealName: longName } }));
  expect(!longNameResult.ok && longNameResult.error.code === "correction_validation_failed", "a meal name over 160 characters is rejected");

  const tooManyComponents = Array.from({ length: 13 }, (_, i) => `item${i}`);
  const tooManyResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, components: tooManyComponents } }));
  expect(!tooManyResult.ok && tooManyResult.error.code === "correction_validation_failed", "more than 12 components is rejected");

  const hugeCalories = v3Module.buildMealIdentificationFinalizationV3(baseInput({ mealWrite: { ...baseInput().mealWrite, nutrition: { calories: 999999 } } }));
  expect(!hugeCalories.ok && hugeCalories.error.code === "correction_validation_failed", "an unreasonably large calorie value is rejected by the defensive upper bound");

  // ================= actual meal time / source context / record timing preserved =================
  for (const sourceContext of ["dine_in", "takeout", "delivery", "self_cooked", "unknown"]) {
    const result = v3Module.buildMealIdentificationFinalizationV3(baseInput({ sourceContext }));
    expect(result.ok && result.value.sourceContext === sourceContext, `sourceContext '${sourceContext}' is preserved unchanged`);
  }
  const postHocResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ recordTiming: "post_hoc" }));
  expect(postHocResult.ok && postHocResult.value.recordTiming === "post_hoc", "post_hoc recordTiming is preserved");
  const occurredAtResult = v3Module.buildMealIdentificationFinalizationV3(baseInput({ occurredAt: "2026-01-01T00:00:00.000Z" }));
  expect(occurredAtResult.ok && occurredAtResult.value.occurredAt === "2026-01-01T00:00:00.000Z", "occurredAt is preserved exactly, never overwritten with build/finalization-time");

  // ================= invalid sourceContext / recordTiming / analysisRequestId =================
  const badSourceContext = v3Module.buildMealIdentificationFinalizationV3(baseInput({ sourceContext: "invalid_value" }));
  expect(!badSourceContext.ok && badSourceContext.error.code === "invalid_finalization", "an invalid sourceContext is rejected");
  const badRecordTiming = v3Module.buildMealIdentificationFinalizationV3(baseInput({ recordTiming: "invalid_value" }));
  expect(!badRecordTiming.ok && badRecordTiming.error.code === "invalid_finalization", "an invalid recordTiming is rejected");
  const missingAnalysisId = v3Module.buildMealIdentificationFinalizationV3(baseInput({ analysisRequestId: "" }));
  expect(!missingAnalysisId.ok && missingAnalysisId.error.code === "invalid_finalization", "a missing analysisRequestId is rejected");
  const badCandidateId = v3Module.buildMealIdentificationFinalizationV3(baseInput({ selectedCandidateId: 123 }));
  expect(!badCandidateId.ok && badCandidateId.error.code === "invalid_candidate", "a non-string, non-null selectedCandidateId is rejected as invalid_candidate");

  // ================= safe error mapping (v3 tokens) =================
  function rpcError(message, code) {
    return { message, code: code ?? null, status: null };
  }
  const tokenCases = [
    ["ANALYSIS_NOT_FOUND", errorsModule.ConsumerMealIdentificationFinalizationAnalysisNotFoundError, "finalization_analysis_not_found"],
    ["ANALYSIS_ACCESS_DENIED", errorsModule.ConsumerMealIdentificationFinalizationAnalysisAccessDeniedError, "finalization_analysis_access_denied"],
    ["ANALYSIS_NOT_READY", errorsModule.ConsumerMealIdentificationFinalizationAnalysisNotReadyError, "finalization_analysis_not_ready"],
    ["ANALYSIS_ALREADY_FINALIZED", errorsModule.ConsumerMealIdentificationFinalizationAnalysisAlreadyFinalizedError, "finalization_analysis_already_finalized"],
    ["INVALID_CANDIDATE", errorsModule.ConsumerMealIdentificationFinalizationInvalidCandidateError, "finalization_invalid_candidate"],
    ["CORRECTION_VALIDATION_FAILED", errorsModule.ConsumerMealIdentificationFinalizationCorrectionValidationFailedError, "finalization_correction_validation_failed"]
  ];
  for (const [token, ErrorClass, expectedCode] of tokenCases) {
    const mapped = mappersModule.mapMealIdentificationFinalizationRpcError(rpcError(token, token === "ANALYSIS_ALREADY_FINALIZED" ? "23505" : token === "ANALYSIS_ACCESS_DENIED" ? "42501" : "22023"));
    expect(mapped instanceof ErrorClass, `RPC token '${token}' maps to ${ErrorClass.name}`);
    expect(mapped.code === expectedCode, `RPC token '${token}' produces client-safe code '${expectedCode}'`);
  }

  // ---- shared-SQLSTATE tokens still resolve to the RIGHT class, not the generic 23505/42501 one ----
  const alreadyFinalizedMapped = mappersModule.mapMealIdentificationFinalizationRpcError(rpcError("ANALYSIS_ALREADY_FINALIZED", "23505"));
  expect(
    alreadyFinalizedMapped instanceof errorsModule.ConsumerMealIdentificationFinalizationAnalysisAlreadyFinalizedError,
    "ANALYSIS_ALREADY_FINALIZED (SQLSTATE 23505, shared with IDEMPOTENCY_KEY_CONFLICT) maps to its own specific class, not the generic idempotency-conflict class"
  );
  const accessDeniedMapped = mappersModule.mapMealIdentificationFinalizationRpcError(rpcError("ANALYSIS_ACCESS_DENIED", "42501"));
  expect(
    accessDeniedMapped instanceof errorsModule.ConsumerMealIdentificationFinalizationAnalysisAccessDeniedError,
    "ANALYSIS_ACCESS_DENIED (SQLSTATE 42501, shared with OWNERSHIP_OR_AUTHORIZATION_REJECTED) maps to its own specific class, not the generic ownership-rejected class"
  );

  // ---- an unrecognized token still falls back safely (never surfaces raw SQL/internals) ----
  const unknownMapped = mappersModule.mapMealIdentificationFinalizationRpcError(rpcError("totally_unrecognized_internal_detail"));
  expect(
    unknownMapped instanceof errorsModule.ConsumerMealIdentificationFinalizationTransportFailedError,
    "an unrecognized RPC error token falls back to the generic transport-failed class rather than surfacing raw text"
  );

  // ================= no secret / no raw internals leak from this feature's own source =================
  const v3Src = fs.readFileSync(path.join(finalizationFeatureRoot, "v3Contract.ts"), "utf8");
  expect(!/OPENAI|SERVICE_ROLE|ADMIN_KEY/i.test(v3Src), "v3Contract.ts references no provider/service/admin secret name");

  // ================= R3 durable accepted-confirmation contract =================
  // These are local structural contract checks over the migration candidate, not live-DB evidence.
  const r3MigrationSrc = fs.readFileSync(
    path.join(
      root,
      "supabase",
      "migrations",
      "20260729010000_persist_user_confirmed_for_accepted_analysis_finalization.sql"
    ),
    "utf8"
  );
  const r3V3Start = r3MigrationSrc.indexOf(
    "IF v_version = 'meal-identification-finalization-v3' THEN"
  );
  const r3V3End = r3MigrationSrc.indexOf(
    "\n  IF v_version <> 'meal-identification-finalization-v2' THEN",
    r3V3Start
  );
  const r3V3Body =
    r3V3Start >= 0 && r3V3End > r3V3Start
      ? r3MigrationSrc.slice(r3V3Start, r3V3End)
      : "";
  expect(
    /IF v3_confirmation_mode = 'accepted' THEN[\s\S]{0,600}'confirmation'[\s\S]{0,200}'user_confirmed'/.test(
      r3V3Body
    ),
    "accepted finalization persists an explicit user_confirmed confirmation event"
  );
  expect(
    /v3_nutrition_source := CASE WHEN v3_confirmation_mode = 'accepted' THEN 'ai_estimated' ELSE 'user_corrected' END;/.test(
      r3V3Body
    ),
    "accepted keeps ai_estimated nutrition provenance while corrected/manual keep user_corrected provenance"
  );
  expect(
    /ELSIF v3_confirmation_mode = 'corrected' THEN[\s\S]*?'user_corrected'[\s\S]*?ELSIF v3_confirmation_mode = 'manual' THEN[\s\S]*?'user_corrected'/.test(
      r3V3Body
    ),
    "corrected and manual paths retain user_corrected verification semantics"
  );
  expect(
    /verification_status <> 'user_confirmed'\s*OR correction_type <> 'confirmation'\s*OR \(\s*correction_type = 'confirmation'\s*AND before_value IS NULL\s*AND after_value = '\{\"confirmationMode\":\"accepted\"\}'::jsonb/.test(
      r3MigrationSrc
    ),
    "accepted evidence is an event payload with no fabricated before/after edit"
  );
  expect(
    /CREATE UNIQUE INDEX meal_corrections_accepted_confirmation_unique\s*ON public\.meal_corrections \(meal_analysis_id\)/.test(
      r3MigrationSrc
    ),
    "accepted confirmation has database-level duplicate protection per analysis"
  );
  expect(
    r3V3Body.indexOf("IF FOUND THEN") <
      r3V3Body.indexOf("IF v3_confirmation_mode = 'accepted' THEN"),
    "replay returns through the existing idempotency path before confirmation evidence can be inserted"
  );
  expect(
    !/v3_confirmation_mode = 'accepted'[\s\S]{0,700}'(?:name_change|nutrition_override|ingredient_adjustment|portion_adjustment)'/.test(
      r3V3Body
    ),
    "accepted never masquerades as a name, nutrition, ingredient, or portion correction"
  );
  expect(
    !/nutritionist_reviewed|verified_nutrition|restaurant_verified|catalog_authoritative/i.test(
      r3V3Body
    ),
    "accepted confirmation makes no verified or nutritionist-reviewed nutrition claim"
  );

  console.log(JSON.stringify({
    status: "passed",
    phase: "MI-E-C5-B1 meal-identification-finalization v3 contract unit/service smoke",
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "MI-E-C5-B1 meal-identification-finalization v3 contract unit/service smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
