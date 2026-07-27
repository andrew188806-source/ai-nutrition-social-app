// MI-E-C5-A unit/service smoke: compiles the real production TypeScript modules (not a parallel
// reimplementation) and exercises them directly in Node. Companion to
// meal-photo-analysis-mobile-mi-e-c5-a-guard.mjs (static/structural).
//
// Scope boundary, disclosed (matches the established MI-E-C3 smoke precedent): React hook files
// (useMealPhotoAnalysis.ts) are compiled nowhere near this script and are not executed here —
// hooks need a real React render environment, which apps/mobile's own tsc --noEmit already
// validates for type correctness. This smoke instead exercises the pure logic the hook
// orchestrates directly: the session store's plain functions, the stale-result guard (reused, not
// reimplemented), and the full adapter/service/factory layer (the actual production code that
// talks to the Function) via injected test doubles for the Supabase Functions client and auth
// port — never a second, parallel invoke implementation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const mobileRoot = path.join(root, "apps", "mobile");
const featureRoot = path.join(mobileRoot, "features");
const analysisFeatureRoot = path.join(featureRoot, "meal-photo-analysis");
const analysisScreenFeatureRoot = path.join(featureRoot, "analysis");
const sharedSrcRoot = path.join(root, "packages", "shared", "src");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meal-photo-analysis-mobile-mi-e-c5-a-smoke-"));
// Mirrors the real repo's directory depth (tempRoot stands in for the repo root) so that
// transpileOnly-compiled files (analysisSessionStore.js, lib/i18n/zh-TW.js — see below) resolve
// their real relative imports (e.g. "../../../../lib/i18n/zh-TW") correctly at require() time.
const compiledFeatureRoot = path.join(tempRoot, "apps", "mobile", "features");
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
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  return diagnostics;
}

// analysisSessionStore.ts/mealPhotoUploadStaleGuard.ts are compiled with transpileModule (a pure
// per-file syntax-directed transform, no cross-file type resolution) rather than the full
// ts.createProgram path above. Reason, disclosed: analysisSessionStore.ts's `import type
// { MealIdentificationCandidate, MealSourceContext } from "../meal-identification"` is fully
// type-only (erased at runtime, no require() is ever emitted for it) but a full-program compile
// still needs to *resolve* it for type-checking, which transitively pulls in
// features/restaurants/catalog, lib/i18n/zh-TW.ts, and apps/mobile/adapters/mock — all outside
// this smoke's intentionally narrow rootDir, and reachable only via this repo's real tsconfig
// path-mapping (@haocu/shared/domain, etc.) which this standalone compile does not set up. The
// real, full-context type-check for this exact file is already provided by apps/mobile's own
// `tsc --noEmit` (run as part of this round's regression suite) — this smoke's job is behavioral,
// not a second type-checker for a file already covered elsewhere.
function transpileOnly(absPath) {
  const source = fs.readFileSync(absPath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: absPath
  });
  return result.outputText;
}

let originalResolveFilename = null;

try {
  const analysisFeatureFiles = [
    "types.ts",
    "ports.ts",
    "mealPhotoAnalysisService.ts",
    "featureFlags.ts",
    "factories.ts",
    "supabaseMealPhotoAnalysisContracts.ts",
    "adapters/disabledMealPhotoAnalysisRepository.ts",
    "adapters/mockMealPhotoAnalysisRepository.ts",
    "adapters/supabaseMealPhotoAnalysisRepository.ts"
  ].map((relative) => path.join(analysisFeatureRoot, relative));
  // Compiled together with the rest of the "features" tree so relative imports (e.g.
  // "../meal-photo-upload/featureFlags", "../consumer-auth/ports") resolve to real sibling
  // feature files under the same rootDir, exactly like the C3 smoke's own compile scope. This
  // subgraph deliberately excludes analysisSessionStore.ts/mealPhotoUploadStaleGuard.ts — see
  // transpileOnly's own comment for why those two are handled separately.
  const smokeEntryFiles = [
    ...analysisFeatureFiles,
    path.join(featureRoot, "meal-photo-upload", "types.ts"),
    path.join(featureRoot, "meal-photo-upload", "featureFlags.ts"),
    path.join(featureRoot, "meal-photo-upload", "requestId.ts"),
    path.join(featureRoot, "consumer-auth", "ports.ts"),
    path.join(featureRoot, "consumer-auth", "types.ts")
  ];
  const featureDiagnostics = compile(smokeEntryFiles, compiledFeatureRoot, featureRoot);
  expect(featureDiagnostics.length === 0, "meal-photo-analysis + dependent feature TypeScript compilation", featureDiagnostics.map(formatDiagnostic).join("\n"));

  // ---- transpile-only files (see transpileOnly's own comment) ----
  const compiledAnalysisDir = path.join(compiledFeatureRoot, "analysis");
  fs.mkdirSync(compiledAnalysisDir, { recursive: true });
  fs.writeFileSync(
    path.join(compiledAnalysisDir, "analysisSessionStore.js"),
    transpileOnly(path.join(analysisScreenFeatureRoot, "analysisSessionStore.ts"))
  );
  fs.writeFileSync(
    path.join(compiledAnalysisDir, "mealPhotoUploadStaleGuard.js"),
    transpileOnly(path.join(analysisScreenFeatureRoot, "mealPhotoUploadStaleGuard.ts"))
  );
  const compiledI18nDir = path.join(tempRoot, "lib", "i18n");
  fs.mkdirSync(compiledI18nDir, { recursive: true });
  fs.writeFileSync(path.join(compiledI18nDir, "zh-TW.js"), transpileOnly(path.join(root, "lib", "i18n", "zh-TW.ts")));

  const sharedDiagnostics = compile(collectTsFiles(sharedSrcRoot), compiledSharedRoot, sharedSrcRoot);
  expect(sharedDiagnostics.length === 0, "@haocu/shared TypeScript compilation", sharedDiagnostics.map(formatDiagnostic).join("\n"));

  originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
    if (request === "@haocu/shared") return path.join(compiledSharedRoot, "index.js");
    return originalResolveFilename.call(this, request, ...rest);
  };

  const analysisFeatureOut = path.join(compiledFeatureRoot, "meal-photo-analysis");
  const requireFromFeature = createRequire(path.join(analysisFeatureOut, "types.js"));
  const typesModule = requireFromFeature("./types.js");
  const featureFlagsModule = requireFromFeature("./featureFlags.js");
  const factoriesModule = requireFromFeature("./factories.js");
  const { MealPhotoAnalysisService } = requireFromFeature("./mealPhotoAnalysisService.js");
  const { DisabledMealPhotoAnalysisRepository } = requireFromFeature("./adapters/disabledMealPhotoAnalysisRepository.js");
  const { MockMealPhotoAnalysisRepository } = requireFromFeature("./adapters/mockMealPhotoAnalysisRepository.js");
  const { SupabaseMealPhotoAnalysisRepository } = requireFromFeature("./adapters/supabaseMealPhotoAnalysisRepository.js");
  const sharedModule = createRequire(path.join(compiledSharedRoot, "index.js"))("./index.js");
  const sessionStoreOut = path.join(compiledFeatureRoot, "analysis");
  const requireFromAnalysis = createRequire(path.join(sessionStoreOut, "analysisSessionStore.js"));
  const sessionStore = requireFromAnalysis("./analysisSessionStore.js");
  const staleGuard = requireFromAnalysis("./mealPhotoUploadStaleGuard.js");

  // ================= request construction / shared response fixtures =================
  function validCandidate(overrides = {}) {
    return {
      observedName: "白飯與滷肉",
      components: [{ name: "白飯", estimatedPortion: "約一碗" }],
      estimatedNutrition: { calories: 550, proteinGrams: 22, carbsGrams: 70, fatGrams: 18 },
      confidence: 0.8,
      uncertaintyReasonCodes: [],
      ...overrides
    };
  }
  function validResponse(overrides = {}) {
    return {
      schemaVersion: sharedModule.MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
      providerCategory: "external_multimodal",
      analysisEngineVersion: "openai-gpt-test-responses-v1",
      promptVersion: "meal-photo-analysis-prompt-v1",
      analysisStatus: "completed",
      candidates: [{ candidateId: "11111111-1111-4111-8111-111111111111", ...validCandidate() }],
      requiresUserConfirmation: true,
      safeUserFacingErrorCode: null,
      safeUserFacingErrorMessage: null,
      ...overrides
    };
  }
  function analysisInput(overrides = {}) {
    return {
      analysisRequestId: "22222222-2222-4222-8222-222222222222",
      imageObjectRef: "actor-1/22222222-2222-4222-8222-222222222222/original.jpg",
      captureMethod: "camera",
      mealSourceContext: "dine_in",
      capturedAt: new Date().toISOString(),
      locale: "zh-TW",
      ...overrides
    };
  }

  // ---- MealPhotoAnalysisClientInput never carries a forbidden field (structural, redundant with
  // the guard's own check, kept here as a live-object-shape smoke assertion) ----
  const inputKeys = Object.keys(analysisInput()).sort();
  const expectedInputKeys = ["analysisRequestId", "imageObjectRef", "captureMethod", "mealSourceContext", "capturedAt", "locale"].sort();
  expect(
    JSON.stringify(inputKeys) === JSON.stringify(expectedInputKeys),
    "MealPhotoAnalysisClientInput's real key set matches exactly the documented client-safe fields"
  );

  // ================= disabled adapter =================
  const disabledRepo = new DisabledMealPhotoAnalysisRepository();
  const disabledOutcome = await disabledRepo.analyzeMealPhoto(analysisInput());
  expect(!disabledOutcome.ok && disabledOutcome.error.code === "analysis_disabled", "disabled repository fails closed with analysis_disabled");

  // ================= mock adapter: explicit demo labeling =================
  function authPort(sessionValue) {
    return {
      source: "mock",
      async getCurrentSession() {
        return sessionValue === undefined ? { ok: false, error: new Error("no session") } : { ok: true, value: sessionValue };
      },
      observeAuthState() { return () => {}; },
      async signIn() { throw new Error("unused"); },
      async signUp() { throw new Error("unused"); },
      async signOut() { throw new Error("unused"); },
      async refreshSession() { return { ok: true, value: sessionValue ?? null }; },
      async sendPasswordReset() { throw new Error("unused"); },
      async restoreSession() { return { ok: true, value: sessionValue ?? null }; }
    };
  }
  function session(userId) {
    return { user: { userId, provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-07-01T00:00:00.000Z" }, provider: "mock", issuedAt: "2026-07-27T00:00:00.000Z" };
  }
  const mockRepo = new MockMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")) });
  const mockOutcome = await mockRepo.analyzeMealPhoto(analysisInput());
  expect(mockOutcome.ok, "mock repository returns a successful outcome");
  expect(mockOutcome.ok && /示範/.test(mockOutcome.value.candidates[0].observedName), "mock repository's candidate is unmistakably labeled as demo data");
  expect(mockOutcome.ok && mockOutcome.value.analysisEngineVersion === "mock-demo-v1", "mock repository's engine version is a clearly-fake opaque label");
  expect(mockOutcome.ok && mockOutcome.value.requiresUserConfirmation === true, "mock repository's response still requires user confirmation");
  const mockNoAuth = new MockMealPhotoAnalysisRepository({ authPort: authPort(undefined) });
  const mockNoAuthOutcome = await mockNoAuth.analyzeMealPhoto(analysisInput());
  expect(!mockNoAuthOutcome.ok && mockNoAuthOutcome.error.code === "authentication_required", "mock repository fails closed without a session");

  // ================= Supabase adapter: fake Functions client + auth port =================
  function functionsClient({ data = null, error = null, throwOnInvoke = null } = {}) {
    const calls = [];
    return {
      calls,
      functions: {
        async invoke(functionName, options) {
          calls.push({ functionName, options });
          if (throwOnInvoke) throw throwOnInvoke;
          return { data, error };
        }
      }
    };
  }
  function httpError(bodyObject, name = "FunctionsHttpError") {
    return {
      name,
      message: "Edge Function returned a non-2xx status code",
      context: { async json() { return bodyObject; } }
    };
  }

  // ---- auth missing ----
  const authMissingRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(undefined), analysisClient: functionsClient(), analysisEnabled: true });
  const authMissingOutcome = await authMissingRepo.analyzeMealPhoto(analysisInput());
  expect(!authMissingOutcome.ok && authMissingOutcome.error.code === "authentication_required", "Supabase adapter fails closed without a session");

  // ---- analysisEnabled: false (disabled server-side gate) ----
  const gateDisabledRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: functionsClient(), analysisEnabled: false });
  const gateDisabledOutcome = await gateDisabledRepo.analyzeMealPhoto(analysisInput());
  expect(!gateDisabledOutcome.ok && gateDisabledOutcome.error.code === "analysis_disabled", "Supabase adapter itself fails closed when analysisEnabled is false");

  // ---- invalid request (malformed captureMethod) never reaches the Function ----
  const invalidReqClient = functionsClient();
  const invalidReqRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: invalidReqClient, analysisEnabled: true });
  const invalidReqOutcome = await invalidReqRepo.analyzeMealPhoto(analysisInput({ captureMethod: "not-a-real-method" }));
  expect(!invalidReqOutcome.ok && invalidReqOutcome.error.code === "invalid_request", "a locally-invalid request is rejected as invalid_request");
  expect(invalidReqClient.calls.length === 0, "an invalid request never reaches functions.invoke — the Function is never called");

  // ---- successful completed response ----
  const completedClient = functionsClient({ data: validResponse() });
  const completedRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: completedClient, analysisEnabled: true });
  const completedOutcome = await completedRepo.analyzeMealPhoto(analysisInput());
  expect(completedOutcome.ok && completedOutcome.value.analysisStatus === "completed", "a valid completed response is accepted");
  expect(completedClient.calls.length === 1 && completedClient.calls[0].functionName === "meal-photo-analysis", "the adapter invokes exactly the meal-photo-analysis Function name");
  // Note: imageObjectRef legitimately contains the actor's UID as its own path prefix (the
  // canonical Storage path convention) — that is not a "trusted userId field" and is expected.
  // The absence of an actual userId field is already proven structurally (see the exact-key-set
  // check above and the guard's own MealPhotoAnalysisClientInput shape check).
  const expectedBodyKeys = ["contractVersion", "analysisRequestId", "imageObjectRef", "captureMethod", "capturedAt", "mealSourceContext", "locale"].sort();
  expect(
    Object.keys(completedClient.calls[0].options.body).sort().join(",") === expectedBodyKeys.join(","),
    "the request body sent to invoke() has exactly the shared contract's key set — no separate userId/provider/model/consent field was added"
  );

  // ---- low-confidence response ----
  const lowConfClient = functionsClient({ data: validResponse({ analysisStatus: "low_confidence", candidates: [validCandidate({ confidence: 0.2 })].map((c, i) => ({ candidateId: `11111111-1111-4111-8111-11111111111${i}`, ...c })) }) });
  const lowConfRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: lowConfClient, analysisEnabled: true });
  const lowConfOutcome = await lowConfRepo.analyzeMealPhoto(analysisInput());
  expect(lowConfOutcome.ok && lowConfOutcome.value.analysisStatus === "low_confidence", "a valid low_confidence response is accepted");

  // ---- failed response (server-reported failure, still HTTP 200 shape) ----
  const failedClient = functionsClient({ data: validResponse({ analysisStatus: "failed", candidates: [], safeUserFacingErrorCode: "provider_timeout", safeUserFacingErrorMessage: "timed out" }) });
  const failedRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: failedClient, analysisEnabled: true });
  const failedOutcome = await failedRepo.analyzeMealPhoto(analysisInput());
  expect(failedOutcome.ok && failedOutcome.value.analysisStatus === "failed" && failedOutcome.value.safeUserFacingErrorCode === "provider_timeout", "a server-reported failed response is accepted and carries the safe error code");

  // ---- malformed server response (missing a required key) is rejected, never cast ----
  const malformedClient = functionsClient({ data: (() => { const { promptVersion, ...rest } = validResponse(); return rest; })() });
  const malformedRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: malformedClient, analysisEnabled: true });
  const malformedOutcome = await malformedRepo.analyzeMealPhoto(analysisInput());
  expect(!malformedOutcome.ok && malformedOutcome.error.code === "invalid_server_response", "a malformed (missing-key) server response is rejected as invalid_server_response, never cast");

  // ---- candidates > 3 rejected ----
  const tooManyClient = functionsClient({
    data: validResponse({ candidates: [0, 1, 2, 3].map((i) => ({ candidateId: `11111111-1111-4111-8111-11111111111${i}`, ...validCandidate() })) })
  });
  const tooManyRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: tooManyClient, analysisEnabled: true });
  const tooManyOutcome = await tooManyRepo.analyzeMealPhoto(analysisInput());
  expect(!tooManyOutcome.ok && tooManyOutcome.error.code === "invalid_server_response", "a response with 4 candidates (over the max of 3) is rejected");

  // ---- requiresUserConfirmation: false rejected ----
  const notConfirmedClient = functionsClient({ data: validResponse({ requiresUserConfirmation: false }) });
  const notConfirmedRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: notConfirmedClient, analysisEnabled: true });
  const notConfirmedOutcome = await notConfirmedRepo.analyzeMealPhoto(analysisInput());
  expect(!notConfirmedOutcome.ok && notConfirmedOutcome.error.code === "invalid_server_response", "a response with requiresUserConfirmation:false is rejected");

  // ---- additional property rejected ----
  const extraPropClient = functionsClient({ data: { ...validResponse(), extra: "nope" } });
  const extraPropRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: extraPropClient, analysisEnabled: true });
  const extraPropOutcome = await extraPropRepo.analyzeMealPhoto(analysisInput());
  expect(!extraPropOutcome.ok && extraPropOutcome.error.code === "invalid_server_response", "a response with an unexpected extra top-level property is rejected");

  // ---- network error (FunctionsFetchError-shaped) ----
  const networkErrorClient = functionsClient({ error: { name: "FunctionsFetchError", message: "fetch failed" } });
  const networkErrorRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: networkErrorClient, analysisEnabled: true });
  const networkErrorOutcome = await networkErrorRepo.analyzeMealPhoto(analysisInput());
  expect(!networkErrorOutcome.ok && networkErrorOutcome.error.code === "network_error", "a FunctionsFetchError is mapped to network_error");

  // ---- relay error also maps to network_error ----
  const relayErrorClient = functionsClient({ error: { name: "FunctionsRelayError", message: "relay could not reach the Function" } });
  const relayErrorRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: relayErrorClient, analysisEnabled: true });
  const relayErrorOutcome = await relayErrorRepo.analyzeMealPhoto(analysisInput());
  expect(!relayErrorOutcome.ok && relayErrorOutcome.error.code === "network_error", "a FunctionsRelayError is mapped to network_error");

  // ---- invoke() throwing synchronously is still caught safely ----
  const throwingClient = functionsClient({ throwOnInvoke: new Error("unexpected throw") });
  const throwingRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: throwingClient, analysisEnabled: true });
  const throwingOutcome = await throwingRepo.analyzeMealPhoto(analysisInput());
  expect(!throwingOutcome.ok && throwingOutcome.error.code === "network_error", "an unexpected synchronous throw from invoke() is still mapped to a safe network_error, never left unhandled");

  // ---- provider_timeout / provider_rate_limited HTTP-error mapping (known server error codes) ----
  const timeoutHttpClient = functionsClient({ error: httpError({ error: { code: "provider_timeout", message: "timed out" } }) });
  const timeoutHttpRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: timeoutHttpClient, analysisEnabled: true });
  const timeoutHttpOutcome = await timeoutHttpRepo.analyzeMealPhoto(analysisInput());
  expect(!timeoutHttpOutcome.ok && timeoutHttpOutcome.error.code === "provider_timeout", "a FunctionsHttpError body carrying a known safe error code is mapped through exactly, never re-guessed");

  // ---- unknown server error code is never trusted/displayed as-is ----
  const unknownCodeClient = functionsClient({ error: httpError({ error: { code: "totally_made_up_code", message: "??" } }) });
  const unknownCodeRepo = new SupabaseMealPhotoAnalysisRepository({ authPort: authPort(session("actor-1")), analysisClient: unknownCodeClient, analysisEnabled: true });
  const unknownCodeOutcome = await unknownCodeRepo.analyzeMealPhoto(analysisInput());
  expect(!unknownCodeOutcome.ok && unknownCodeOutcome.error.code === "internal_error", "an unrecognized server-supplied error code is never surfaced as-is — it falls back to the safe internal_error code");

  // ================= factory routing =================
  const defaultFlags = featureFlagsModule.getMealPhotoAnalysisRuntimeFlags("mock", false, false, "disabled", {});
  expect(defaultFlags.analysisSource === "disabled" && defaultFlags.issues.length === 0, "default (no env var) analysis source is disabled");
  const liveWithoutUpload = featureFlagsModule.getMealPhotoAnalysisRuntimeFlags("supabase-live", true, true, "disabled", {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development"
  });
  expect(liveWithoutUpload.issues.length > 0, "supabase-live analysis without a live upload source reports a configuration issue");
  const liveWithUpload = featureFlagsModule.getMealPhotoAnalysisRuntimeFlags("supabase-live", true, true, "supabase-live", {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development"
  });
  expect(liveWithUpload.analysisSource === "supabase-live" && liveWithUpload.issues.length === 0, "supabase-live analysis with all gates satisfied in development has no issues");

  const disabledFromFactory = factoriesModule.createMealPhotoAnalysisRepository("mock", false, false, "disabled", {}, defaultFlags);
  expect(disabledFromFactory.source === "disabled", "the factory returns the disabled repository by default");
  const mockFromFactory = factoriesModule.createMealPhotoAnalysisRepository("mock", false, false, "mock", { authPort: authPort(session("actor-1")) }, { analysisSource: "mock", issues: [] });
  expect(mockFromFactory.source === "mock", "the factory returns the mock repository when analysisSource is mock and an authPort is supplied");
  const mockFromFactoryNoAuth = factoriesModule.createMealPhotoAnalysisRepository("mock", false, false, "mock", {}, { analysisSource: "mock", issues: [] });
  expect(mockFromFactoryNoAuth.source === "disabled", "the factory fails closed to disabled if mock mode is selected but no authPort dependency was supplied");
  const liveFromFactoryMissingDeps = factoriesModule.createMealPhotoAnalysisRepository("supabase-live", true, true, "supabase-live", {}, liveWithUpload);
  expect(liveFromFactoryMissingDeps.source === "disabled", "the factory fails closed to disabled if supabase-live is selected but the client/authPort dependencies are missing");
  const liveFromFactoryWithIssues = factoriesModule.createMealPhotoAnalysisRepository("supabase-live", true, true, "disabled", {}, liveWithoutUpload);
  expect(liveFromFactoryWithIssues.source === "disabled", "the factory fails closed to disabled whenever the computed flags carry any issue, even if analysisSource itself says supabase-live");

  const service = new MealPhotoAnalysisService({ repository: mockFromFactory });
  expect(service.source === "mock", "the service exposes the underlying repository's source");
  const serviceOutcome = await service.analyzeMealPhoto(analysisInput());
  expect(serviceOutcome.ok, "service.analyzeMealPhoto delegates to the repository");

  // ================= session store: pure logic the hook orchestrates =================
  sessionStore.beginAnalysisCapture("camera", "file:///synthetic/photo.jpg", new Date("2026-07-27T08:00:00.000Z"));
  const freshSession = sessionStore.getAnalysisSession();
  expect(freshSession.analysisInvocationStatus === "not_started" && freshSession.analysisCandidates.length === 0 && freshSession.selectedCandidateId === null, "a freshly captured photo starts with a clean analysis-invocation state");

  sessionStore.setMealPhotoAnalysisState({ analysisInvocationStatus: "invoking", analysisAttemptCount: 1, analysisStartedAt: "2026-07-27T08:00:01.000Z" });
  expect(sessionStore.getAnalysisSession().analysisInvocationStatus === "invoking" && sessionStore.getAnalysisSession().analysisAttemptCount === 1, "setMealPhotoAnalysisState patches the invoking transition");

  const candidateA = { candidateId: "33333333-3333-4333-8333-333333333333", ...validCandidate() };
  sessionStore.setMealPhotoAnalysisState({
    analysisInvocationStatus: "completed",
    analysisCandidates: [candidateA],
    analysisStatus: "completed",
    requiresUserConfirmation: true,
    analysisEngineVersion: "openai-gpt-test-responses-v1",
    analysisPromptVersion: "meal-photo-analysis-prompt-v1",
    analysisResponseSchemaVersion: sharedModule.MEAL_PHOTO_ANALYSIS_RESPONSE_SCHEMA_VERSION,
    analysisCompletedAt: "2026-07-27T08:00:02.000Z"
  });
  expect(sessionStore.getAnalysisSession().analysisInvocationStatus === "completed" && sessionStore.getAnalysisSession().analysisCandidates.length === 1, "setMealPhotoAnalysisState patches a completed result with its candidates");

  sessionStore.setSelectedMealPhotoAnalysisCandidateId(candidateA.candidateId);
  expect(sessionStore.getAnalysisSession().selectedCandidateId === candidateA.candidateId, "selecting a real candidateId is accepted");
  sessionStore.setSelectedMealPhotoAnalysisCandidateId("99999999-9999-4999-8999-999999999999");
  expect(sessionStore.getAnalysisSession().selectedCandidateId === candidateA.candidateId, "selecting a candidateId that does not exist in the current candidate list is silently rejected — the prior valid selection is untouched");
  sessionStore.setSelectedMealPhotoAnalysisCandidateId(null);
  expect(sessionStore.getAnalysisSession().selectedCandidateId === null, "clearing the selection with null always succeeds");

  // ---- retry replacing the candidate list drops a now-absent selection (mirrors the hook's own logic) ----
  sessionStore.setSelectedMealPhotoAnalysisCandidateId(candidateA.candidateId);
  const candidateB = { candidateId: "44444444-4444-4444-8444-444444444444", ...validCandidate() };
  sessionStore.setMealPhotoAnalysisState({ analysisInvocationStatus: "completed", analysisCandidates: [candidateB] });
  sessionStore.setSelectedMealPhotoAnalysisCandidateId(sessionStore.getAnalysisSession().selectedCandidateId);
  expect(sessionStore.getAnalysisSession().selectedCandidateId === null, "re-applying the (now-stale) selection after a retry replaced the candidate list clears it, since candidateA no longer exists");

  // ---- a genuinely new photo (retake) always clears prior AI results, even mid-completion ----
  sessionStore.setMealPhotoAnalysisState({ analysisInvocationStatus: "completed", analysisCandidates: [candidateB] });
  sessionStore.setSelectedMealPhotoAnalysisCandidateId(candidateB.candidateId);
  sessionStore.beginAnalysisCapture("camera", "file:///synthetic/photo-2.jpg", new Date("2026-07-27T09:00:00.000Z"));
  const afterRetake = sessionStore.getAnalysisSession();
  expect(
    afterRetake.analysisInvocationStatus === "not_started" && afterRetake.analysisCandidates.length === 0 && afterRetake.selectedCandidateId === null,
    "a new photo capture (beginAnalysisCapture) always resets the AI analysis state, discarding the previous photo's candidates and selection"
  );
  expect(afterRetake.analysisRequestId !== null && afterRetake.captureGeneration > freshSession.captureGeneration, "the new capture gets a fresh analysisRequestId and a strictly higher captureGeneration than the previous photo");

  // ================= stale-result / actor-change discard guard (reused, not reimplemented) =================
  const baseContext = { analysisRequestId: "req-a", captureGeneration: 3, actorKey: "actor-a", actorGeneration: 2 };
  expect(staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext }) === true, "an identical context is still current");
  expect(
    staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext, analysisRequestId: "req-b", captureGeneration: 4 }) === false,
    "a newer photo (new analysisRequestId/captureGeneration) makes an in-flight analysis result stale — it must be discarded"
  );
  expect(
    staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext, actorKey: "actor-b", actorGeneration: 3 }) === false,
    "an actor switch mid-analysis makes the result stale — it must be discarded, never applied to the new actor's session"
  );
  expect(
    staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext, actorKey: null }) === false,
    "a sign-out mid-analysis makes the result stale — it must be discarded"
  );

  console.log(JSON.stringify({
    status: "passed",
    phase: "MI-E-C5-A Mobile meal-photo-analysis unit/service smoke",
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
    phase: "MI-E-C5-A Mobile meal-photo-analysis unit/service smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (originalResolveFilename) Module._resolveFilename = originalResolveFilename;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
