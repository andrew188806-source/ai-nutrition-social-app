// MI-E-C4 unit/service smoke: compiles the real production Deno TypeScript modules (not a
// parallel reimplementation) and exercises them directly in Node. Companion to
// meal-photo-analysis-edge-function-mi-e-c4-guard.mjs (static/structural).
//
// Scope boundary, disclosed: this smoke uses ts.transpileModule (per-file syntax-directed
// transform), not a full ts.createProgram type-check, because these files are genuine Deno
// source (Deno global, npm:/relative-.ts specifiers, no ambient Node/DOM lib) that no tsconfig
// in this repo has ever included — recreating a faithful parallel Deno type environment here
// would be more fragile than the value it adds. Real compile/bundle evidence for this Edge
// Function comes from `supabase functions deploy` bundling at deploy time (MI-E-C4 report
// §16/§27), not from this script. This script's job is behavioral: prove the real production
// logic (auth branching, path validation, idempotency, provider error mapping, response
// building) does what MI-E-C4 requires, using injected test doubles for every external boundary
// (Supabase clients, fetch) exactly the way handler.ts's own HandlerDependencies is designed to
// be tested.
//
// index.ts is deliberately excluded from compilation — it calls Deno.serve(...) at module scope,
// which would throw immediately under plain Node. Every other file it wires
// (processMealPhotoAnalysisRequest + friends) is exercised directly here instead.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const fnRoot = path.join(root, "supabase", "functions");
const mealPhotoAnalysisRoot = path.join(fnRoot, "meal-photo-analysis");
const sharedGeneratedRoot = path.join(fnRoot, "_shared", "meal-photo-analysis");
const sharedAuthRoot = path.join(fnRoot, "_shared", "auth");
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "meal-photo-analysis-mi-e-c4-smoke-"));
const outRoot = path.join(tempRoot, "functions");
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

function transpile(absPath, relFromFnRoot) {
  const source = fs.readFileSync(absPath, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: absPath
  });
  const outPath = path.join(outRoot, relFromFnRoot.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.outputText);
}

let originalResolveFilename = null;

try {
  const sourceFiles = [
    ...collectTsFiles(mealPhotoAnalysisRoot).filter((f) => path.basename(f) !== "index.ts"),
    ...collectTsFiles(sharedGeneratedRoot),
    ...collectTsFiles(sharedAuthRoot)
  ];
  expect(sourceFiles.length >= 10, "discovered the expected set of meal-photo-analysis Edge Function + generated shared source files");
  for (const absPath of sourceFiles) {
    transpile(absPath, path.relative(fnRoot, absPath));
  }

  const realSupabaseJsEntry = createRequire(path.join(root, "apps", "mobile", "package.json")).resolve("@supabase/supabase-js");

  originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
    if (request.startsWith("npm:@supabase/supabase-js")) return realSupabaseJsEntry;
    if (request.startsWith("npm:")) return originalResolveFilename.call(this, request.slice(4).replace(/@[^/@]+$/, ""), ...rest);
    if ((request.startsWith("./") || request.startsWith("../")) && request.endsWith(".ts")) {
      return originalResolveFilename.call(this, request.slice(0, -3), ...rest);
    }
    return originalResolveFilename.call(this, request, ...rest);
  };

  const fnOut = path.join(outRoot, "meal-photo-analysis");
  const requireFromFn = createRequire(path.join(fnOut, "handler.js"));
  const handlerModule = requireFromFn("./handler.js");
  const errorsModule = requireFromFn("./errors.js");
  const objectValidationModule = requireFromFn("./objectValidation.js");
  const imageValidationModule = requireFromFn("./imageValidation.js");
  const providerModule = requireFromFn("./provider.js");
  const openaiProviderModule = requireFromFn("./openaiProvider.js");
  const promptModule = requireFromFn("./prompt.js");
  const persistenceModule = requireFromFn("./persistence.js");
  const configModule = requireFromFn("./config.js");
  const sharedModule = requireFromFn("../_shared/meal-photo-analysis/index.js");

  // ================= synthetic valid image byte builders (real magic bytes) =================
  function jpegBytes(size = 2048) {
    const bytes = new Uint8Array(size);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    return bytes;
  }
  function textBytes(text = "not an image") {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    return bytes;
  }

  // ================= objectValidation: canonical path re-derivation =================
  const actorUid = "11111111-1111-4111-8111-111111111111";
  const requestId1 = "22222222-2222-4222-8222-222222222222";
  const canonicalRef = `${actorUid}/${requestId1}/original.jpg`;
  const ov1 = objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, canonicalRef);
  expect(ov1.ok && ov1.value.path === canonicalRef && ov1.value.extension === "jpg", "canonical actor/request/extension path is accepted and re-derived exactly");

  expect(
    !objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, `other-actor/${requestId1}/original.jpg`).ok,
    "a foreign actor prefix is rejected as invalid_image_object_ref"
  );
  expect(
    !objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, `${actorUid}/different-request-id/original.jpg`).ok,
    "a mismatched analysisRequestId segment is rejected"
  );
  expect(!objectValidationModule.validateCanonicalImageObjectRef(actorUid, "not-a-uuid", `${actorUid}/not-a-uuid/original.jpg`).ok, "a malformed UUID analysisRequestId is rejected");
  expect(!objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, `${actorUid}/${requestId1}/../secret.jpg`).ok, "path traversal (..) is rejected");
  expect(!objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, `https://evil.example/${canonicalRef}`).ok, "an absolute/host-qualified URL is rejected");
  expect(!objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, `${actorUid}/${requestId1}/original.gif`).ok, "an unsupported extension is rejected");
  expect(!objectValidationModule.validateCanonicalImageObjectRef(actorUid, requestId1, `${actorUid}/${requestId1}/original.jpg?x=1`).ok, "a query string on the object ref is rejected");
  expect(objectValidationModule.MEAL_ANALYSIS_PHOTOS_BUCKET === "meal-analysis-photos", "the bucket name constant is the fixed literal");

  // ================= imageValidation: server-side revalidation =================
  function storageDownloadClient(bytes, { type = null, missing = false } = {}) {
    return {
      storage: {
        from(bucket) {
          expect(bucket === objectValidationModule.MEAL_ANALYSIS_PHOTOS_BUCKET, "imageValidation only ever downloads from the fixed meal-analysis-photos bucket");
          return {
            async download(_path) {
              if (missing) return { data: null, error: { message: "not found" } };
              return { data: { type, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } }, error: null };
            }
          };
        }
      }
    };
  }
  const validJpeg = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(jpegBytes(), { type: "image/jpeg" }), canonicalRef, "jpg");
  expect(validJpeg.ok && validJpeg.value.mimeType === "image/jpeg" && validJpeg.value.extension === "jpg" && typeof validJpeg.value.sha256 === "string" && validJpeg.value.sha256.length === 64, "a valid JPEG object downloads, revalidates, and hashes (64-char hex SHA-256)");

  const missingOutcome = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(jpegBytes(), { missing: true }), canonicalRef, "jpg");
  expect(!missingOutcome.ok && missingOutcome.errorCode === "image_object_not_found", "a missing/RLS-denied object yields image_object_not_found");

  const emptyOutcome = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(new Uint8Array(0)), canonicalRef, "jpg");
  expect(!emptyOutcome.ok && emptyOutcome.errorCode === "unsupported_image_type", "an empty object is rejected as unsupported_image_type");

  const oversizedOutcome = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(jpegBytes(11_000_000)), canonicalRef, "jpg");
  expect(!oversizedOutcome.ok && oversizedOutcome.errorCode === "image_too_large", "an object over 10,485,760 bytes is rejected as image_too_large");

  const notAnImageOutcome = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(textBytes()), canonicalRef, "jpg");
  expect(!notAnImageOutcome.ok && notAnImageOutcome.errorCode === "unsupported_image_type", "arbitrary text bytes are rejected as unsupported_image_type (server never trusts the extension alone)");

  const extensionMismatchOutcome = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(jpegBytes(), { type: "image/jpeg" }), canonicalRef, "png");
  expect(!extensionMismatchOutcome.ok && extensionMismatchOutcome.errorCode === "unsupported_image_type", "real JPEG bytes at a path claiming .png extension are rejected (binary signature vs. path extension mismatch)");

  const mimeMismatchOutcome = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(jpegBytes(), { type: "image/png" }), canonicalRef, "jpg");
  expect(!mimeMismatchOutcome.ok && mimeMismatchOutcome.errorCode === "unsupported_image_type", "real JPEG bytes with a Storage-reported image/png MIME are rejected (signature vs. reported MIME mismatch)");

  const sha256Repeat = await imageValidationModule.downloadAndValidateImage(storageDownloadClient(jpegBytes(), { type: "image/jpeg" }), canonicalRef, "jpg");
  expect(sha256Repeat.value.sha256 === validJpeg.value.sha256, "SHA-256 of the same bytes is deterministic across calls");

  // ================= provider port: disabled + mock =================
  const disabledProvider = new providerModule.DisabledMealPhotoAnalysisProvider();
  const disabledOutcome = await disabledProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "unknown", capturedAt: new Date().toISOString() });
  expect(!disabledOutcome.ok && disabledOutcome.errorCode === "provider_unavailable", "the disabled provider fails closed with provider_unavailable");

  function rawCandidate(overrides = {}) {
    return {
      observedName: "牛肉麵",
      components: [{ name: "牛肉", estimatedPortion: "約 150 公克" }],
      estimatedNutrition: { calories: 650, proteinGrams: 35, carbsGrams: 70, fatGrams: 20 },
      confidence: 0.8,
      uncertaintyReasonCodes: [],
      ...overrides
    };
  }
  const validRawOutput = { candidates: [rawCandidate()] };
  const mockProviderOk = new providerModule.MockMealPhotoAnalysisProvider({ result: { engineVersion: "mock-v1", rawOutput: validRawOutput } });
  const mockOkOutcome = await mockProviderOk.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "unknown", capturedAt: new Date().toISOString() });
  expect(mockOkOutcome.ok && mockOkOutcome.value.rawOutput.candidates.length === 1, "mock provider returns an injected successful result");

  const mockProviderErr = new providerModule.MockMealPhotoAnalysisProvider({ errorCode: "provider_timeout" });
  const mockErrOutcome = await mockProviderErr.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "unknown", capturedAt: new Date().toISOString() });
  expect(!mockErrOutcome.ok && mockErrOutcome.errorCode === "provider_timeout", "mock provider returns an injected error outcome");

  const providerSrcNoComments = fs
    .readFileSync(path.join(mealPhotoAnalysisRoot, "provider.ts"), "utf8")
    .split("\n")
    .map((line) => { const i = line.indexOf("//"); return i === -1 ? line : line.slice(0, i); })
    .join("\n");
  expect(!/SupabaseClient|createClient|user_id|userId|imageObjectRef|meal_analyses/.test(providerSrcNoComments), "the provider port source (outside comments) contains no Supabase/DB/user-id/Storage-path reference (mirrors the static guard's own check)");

  // ================= raw provider output schema validation (via shared runtime authority) =================
  expect(sharedModule.validateRawProviderOutput(validRawOutput).ok, "a well-formed raw provider output validates");
  expect(!sharedModule.validateRawProviderOutput({ candidates: [] }).ok, "zero candidates is rejected");
  expect(!sharedModule.validateRawProviderOutput({ candidates: [rawCandidate(), rawCandidate(), rawCandidate(), rawCandidate()] }).ok, "four candidates (over the max of 3) is rejected");
  expect(!sharedModule.validateRawProviderOutput({ candidates: [rawCandidate({ estimatedNutrition: { calories: -1, proteinGrams: 0, carbsGrams: 0, fatGrams: 0 } })] }).ok, "negative calories is rejected");
  expect(!sharedModule.validateRawProviderOutput({ candidates: [rawCandidate({ confidence: 1.5 })] }).ok, "confidence out of the 0-1 range is rejected");
  expect(!sharedModule.validateRawProviderOutput({ candidates: [rawCandidate()], extra: "nope" }).ok, "an extra top-level property is rejected (additionalProperties:false equivalent)");
  expect(!sharedModule.validateRawProviderOutput({ candidates: [{ ...rawCandidate(), candidateId: "should-not-exist" }] }).ok, "a model-supplied candidateId field is rejected — the raw schema has no such field");
  expect(!sharedModule.validateRawProviderOutput("not even an object").ok, "raw prose / a non-object payload is rejected outright");

  // ================= prompt / structured-output schema =================
  expect(promptModule.MEAL_PHOTO_ANALYSIS_PROMPT_VERSION === "meal-photo-analysis-prompt-v1", "prompt version constant matches the documented version");
  const promptText = promptModule.buildMealPhotoAnalysisPrompt("zh-TW", "dine_in");
  expect(typeof promptText === "string" && promptText.length > 0 && !promptText.includes("candidateId"), "prompt text is built and never mentions candidateId (server-only identity)");
  expect(promptModule.MEAL_PHOTO_ANALYSIS_PROVIDER_OUTPUT_JSON_SCHEMA.strict === true, "the structured-output schema wrapper sets strict:true");
  expect(promptModule.MEAL_PHOTO_ANALYSIS_PROVIDER_OUTPUT_JSON_SCHEMA.schema.additionalProperties === false, "the structured-output schema's top level sets additionalProperties:false");

  // ================= config: server-only feature gate, fails closed =================
  globalThis.Deno = { env: { get: (name) => process.env[`MI_E_C4_SMOKE_${name}`] } };
  function setEnv(vars) {
    for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "MEAL_PHOTO_ANALYSIS_ADMIN_KEY", "MEAL_PHOTO_ANALYSIS_ENABLED", "MEAL_PHOTO_ANALYSIS_PROVIDER", "OPENAI_API_KEY", "OPENAI_MEAL_ANALYSIS_MODEL", "OPENAI_MEAL_ANALYSIS_TIMEOUT_MS"]) {
      delete process.env[`MI_E_C4_SMOKE_${key}`];
    }
    for (const [key, value] of Object.entries(vars)) process.env[`MI_E_C4_SMOKE_${key}`] = value;
  }
  setEnv({});
  expect(configModule.loadServerConfig().ok === false, "missing all config fails closed");
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", MEAL_PHOTO_ANALYSIS_ADMIN_KEY: "admin-key" });
  expect(configModule.loadServerConfig().ok === false, "missing MEAL_PHOTO_ANALYSIS_ENABLED fails closed (analysis_disabled)");
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", MEAL_PHOTO_ANALYSIS_ENABLED: "true" });
  expect(configModule.loadServerConfig().ok === false, "missing MEAL_PHOTO_ANALYSIS_ADMIN_KEY fails closed (missing_admin_persistence_key), even with everything else present");
  // MI-E-C4-R2: the legacy SUPABASE_SERVICE_ROLE_KEY being present must NEVER substitute for a
  // missing MEAL_PHOTO_ANALYSIS_ADMIN_KEY — proves there is no fallback path to the compromised key.
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-value", MEAL_PHOTO_ANALYSIS_ENABLED: "true", MEAL_PHOTO_ANALYSIS_PROVIDER: "openai", OPENAI_API_KEY: "sk-x", OPENAI_MEAL_ANALYSIS_MODEL: "gpt-x" });
  expect(configModule.loadServerConfig().ok === false, "a present legacy SUPABASE_SERVICE_ROLE_KEY never substitutes for a missing MEAL_PHOTO_ANALYSIS_ADMIN_KEY — no fallback exists");
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", MEAL_PHOTO_ANALYSIS_ADMIN_KEY: "admin-key", MEAL_PHOTO_ANALYSIS_ENABLED: "true" });
  expect(configModule.loadServerConfig().ok === false, "enabled but missing MEAL_PHOTO_ANALYSIS_PROVIDER fails closed");
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", MEAL_PHOTO_ANALYSIS_ADMIN_KEY: "admin-key", MEAL_PHOTO_ANALYSIS_ENABLED: "true", MEAL_PHOTO_ANALYSIS_PROVIDER: "openai" });
  expect(configModule.loadServerConfig().ok === false, "provider=openai but missing OPENAI_API_KEY/OPENAI_MEAL_ANALYSIS_MODEL fails closed");
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", MEAL_PHOTO_ANALYSIS_ADMIN_KEY: "admin-key", MEAL_PHOTO_ANALYSIS_ENABLED: "true", MEAL_PHOTO_ANALYSIS_PROVIDER: "disabled" });
  expect(configModule.loadServerConfig().ok === false, "provider=disabled fails closed (analysis_disabled) even when otherwise fully configured");
  setEnv({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", MEAL_PHOTO_ANALYSIS_ADMIN_KEY: "admin-key", MEAL_PHOTO_ANALYSIS_ENABLED: "true", MEAL_PHOTO_ANALYSIS_PROVIDER: "openai", OPENAI_API_KEY: "sk-x", OPENAI_MEAL_ANALYSIS_MODEL: "gpt-x" });
  const fullConfig = configModule.loadServerConfig();
  expect(fullConfig.ok === true && fullConfig.value.provider === "openai" && fullConfig.value.openaiTimeoutMs === 30000, "fully configured openai provider loads with the documented default timeout");
  expect(fullConfig.ok === true && fullConfig.value.adminPersistenceKey === "admin-key", "the loaded admin persistence key is exactly the MEAL_PHOTO_ANALYSIS_ADMIN_KEY value, not any other secret");

  // ================= openaiProvider: store:false, retry-once-on-transient, schema validation =================
  function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, async json() { return body; } };
  }
  function structuredOutputPayload(rawOutput) {
    return { output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(rawOutput) }] }] };
  }

  let lastRequestBody = null;
  let callCount = 0;
  const okFetch = async (_url, options) => {
    callCount += 1;
    lastRequestBody = JSON.parse(options.body);
    return jsonResponse(200, structuredOutputPayload(validRawOutput));
  };
  const okOpenaiProvider = new openaiProviderModule.OpenAiMealPhotoAnalysisProvider({ apiKey: "sk-test", model: "gpt-test", timeoutMs: 5000, fetchImpl: okFetch });
  const okResult = await okOpenaiProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "dine_in", capturedAt: new Date().toISOString() });
  expect(okResult.ok && okResult.value.engineVersion === "openai-gpt-test-responses-v1" && okResult.value.rawOutput.candidates.length === 1, "OpenAI provider parses a valid structured-output response into a validated result");
  expect(lastRequestBody.store === false, "every OpenAI Responses request sets store:false");
  expect(lastRequestBody.model === "gpt-test", "the request uses the server-configured model, never a hardcoded one");
  expect(!("conversation" in lastRequestBody) && !("background" in lastRequestBody), "no conversation id or background mode field is ever sent");
  expect(callCount === 1, "a successful first attempt makes exactly one provider call (no retry)");

  callCount = 0;
  const transientThenOkFetch = async (_url, options) => {
    callCount += 1;
    lastRequestBody = JSON.parse(options.body);
    if (callCount === 1) return jsonResponse(503, {});
    return jsonResponse(200, structuredOutputPayload(validRawOutput));
  };
  const retryProvider = new openaiProviderModule.OpenAiMealPhotoAnalysisProvider({ apiKey: "sk-test", model: "gpt-test", timeoutMs: 5000, fetchImpl: transientThenOkFetch });
  const retryResult = await retryProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "dine_in", capturedAt: new Date().toISOString() });
  expect(retryResult.ok && callCount === 2, "a transient 503 triggers exactly one bounded retry, which then succeeds");

  callCount = 0;
  const alwaysRateLimitedFetch = async () => { callCount += 1; return jsonResponse(429, {}); };
  const rateLimitedProvider = new openaiProviderModule.OpenAiMealPhotoAnalysisProvider({ apiKey: "sk-test", model: "gpt-test", timeoutMs: 5000, fetchImpl: alwaysRateLimitedFetch });
  const rateLimitedResult = await rateLimitedProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "dine_in", capturedAt: new Date().toISOString() });
  expect(!rateLimitedResult.ok && rateLimitedResult.errorCode === "provider_rate_limited" && callCount === 2, "a persistent 429 retries exactly once more (2 calls total) then reports provider_rate_limited, never an unbounded retry loop");

  callCount = 0;
  const badRequestFetch = async () => { callCount += 1; return jsonResponse(400, {}); };
  const badRequestProvider = new openaiProviderModule.OpenAiMealPhotoAnalysisProvider({ apiKey: "sk-test", model: "gpt-test", timeoutMs: 5000, fetchImpl: badRequestFetch });
  const badRequestResult = await badRequestProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "dine_in", capturedAt: new Date().toISOString() });
  expect(!badRequestResult.ok && callCount === 1, "a 400-class error is never retried (exactly one call)");

  const invalidSchemaFetch = async () => jsonResponse(200, structuredOutputPayload({ candidates: [] }));
  const invalidSchemaProvider = new openaiProviderModule.OpenAiMealPhotoAnalysisProvider({ apiKey: "sk-test", model: "gpt-test", timeoutMs: 5000, fetchImpl: invalidSchemaFetch });
  const invalidSchemaResult = await invalidSchemaProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "dine_in", capturedAt: new Date().toISOString() });
  expect(!invalidSchemaResult.ok && invalidSchemaResult.errorCode === "provider_invalid_response", "a structurally-valid-JSON-but-schema-invalid provider response is rejected locally, even though it came back as valid JSON (Structured Outputs' own guarantee is never trusted alone)");

  const proseFetch = async () => jsonResponse(200, { output: [{ type: "message", content: [{ type: "output_text", text: "Sure! Here is your meal: a bowl of noodles." }] }] });
  const proseProvider = new openaiProviderModule.OpenAiMealPhotoAnalysisProvider({ apiKey: "sk-test", model: "gpt-test", timeoutMs: 5000, fetchImpl: proseFetch });
  const proseResult = await proseProvider.analyze({ imageBytes: jpegBytes(), mimeType: "image/jpeg", locale: "zh-TW", mealSourceContext: "dine_in", capturedAt: new Date().toISOString() });
  expect(!proseResult.ok && proseResult.errorCode === "provider_invalid_response", "raw prose instead of JSON is rejected as provider_invalid_response, not parsed heuristically");

  // ================= errors.ts: safe envelope =================
  const errResponse = errorsModule.buildErrorResponse("authentication_required");
  const errBody = await errResponse.json();
  expect(errResponse.status === 401 && errBody.error.code === "authentication_required" && !JSON.stringify(errBody).match(/sk-|Bearer|postgres/i), "buildErrorResponse returns a safe, minimal envelope with no leaked secret-shaped content");

  // ================= persistence.ts: claim-before-call idempotency (fake fluent client, no real network) =================
  function fakeAdminClient(initialRows = []) {
    const rows = new Map(initialRows.map((r) => [r.analysis_request_id, r]));
    let nextId = 1;
    return {
      _rows: rows,
      from(table) {
        expect(table === "meal_analyses", "persistence.ts only ever writes to the meal_analyses table");
        let pendingUpdate = null;
        const filters = {};
        const builder = {
          insert(payload) {
            if (rows.has(payload.analysis_request_id)) {
              return { select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }) }) };
            }
            const id = `row-${nextId++}`;
            rows.set(payload.analysis_request_id, { id, ...payload });
            return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
          },
          update(payload) {
            pendingUpdate = payload;
            return builder;
          },
          eq(column, value) {
            filters[column] = value;
            return builder;
          },
          select() {
            return builder;
          },
          async maybeSingle() {
            const row = [...rows.values()].find((r) => r.analysis_request_id === filters.analysis_request_id);
            return { data: row ?? null, error: null };
          },
          async single() {
            const row = [...rows.values()].find((r) => (filters.id ? r.id === filters.id : true) && (filters.analysis_request_id ? r.analysis_request_id === filters.analysis_request_id : true));
            if (!row) return { data: null, error: { message: "no row" } };
            if (pendingUpdate) Object.assign(row, pendingUpdate);
            return { data: { id: row.id }, error: null };
          },
          async then(resolve) {
            const matching = [...rows.values()].filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
            if (pendingUpdate) {
              for (const r of matching) Object.assign(r, pendingUpdate);
              resolve({ data: matching, error: null });
            } else {
              resolve({ data: matching, error: null });
            }
          }
        };
        return builder;
      }
    };
  }

  function claimInput(overrides = {}) {
    return {
      actorUid,
      analysisRequestId: requestId1,
      imageObjectRef: canonicalRef,
      imageSha256: "a".repeat(64),
      provider: "openai",
      promptVersion: promptModule.MEAL_PHOTO_ANALYSIS_PROMPT_VERSION,
      analysisContractVersion: sharedModule.MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
      ...overrides
    };
  }

  const freshAdmin = fakeAdminClient();
  const firstClaim = await persistenceModule.claimAnalysisRequest(freshAdmin, claimInput());
  expect(firstClaim.kind === "claimed" && typeof firstClaim.analysisId === "string", "first claim for a new analysisRequestId creates exactly one processing row and returns claimed");
  expect(freshAdmin._rows.size === 1, "exactly one meal_analyses row exists after the first claim");

  const sameRequestSameAdmin = freshAdmin;
  const secondClaimSame = await persistenceModule.claimAnalysisRequest(sameRequestSameAdmin, claimInput());
  expect(secondClaimSame.kind === "existing_processing", "a second claim with the same request/actor/object/hash while still processing returns existing_processing, never a second row");
  expect(sameRequestSameAdmin._rows.size === 1, "no second row was created on the concurrent-processing branch");

  const differentObjectAdmin = fakeAdminClient([{ analysis_request_id: requestId1, user_id: actorUid, image_object_ref: canonicalRef, image_sha256: "a".repeat(64), analysis_status: "processing" }]);
  const conflictOutcome = await persistenceModule.claimAnalysisRequest(differentObjectAdmin, claimInput({ imageSha256: "b".repeat(64) }));
  expect(conflictOutcome.kind === "conflict", "same request ID with a different image hash fails closed as conflict, never silently reused");

  const foreignActorAdmin = fakeAdminClient([{ analysis_request_id: requestId1, user_id: "someone-else", image_object_ref: canonicalRef, image_sha256: "a".repeat(64), analysis_status: "processing" }]);
  const foreignConflict = await persistenceModule.claimAnalysisRequest(foreignActorAdmin, claimInput());
  expect(foreignConflict.kind === "conflict", "same request ID belonging to a different actor fails closed as conflict (no cross-actor information leak)");

  const completedAdmin = fakeAdminClient([{
    id: "row-completed",
    analysis_request_id: requestId1,
    user_id: actorUid,
    image_object_ref: canonicalRef,
    image_sha256: "a".repeat(64),
    analysis_status: "completed",
    provider: "openai",
    model_name: "openai",
    model_version: "openai-gpt-test-responses-v1",
    prompt_version: promptModule.MEAL_PHOTO_ANALYSIS_PROMPT_VERSION,
    analysis_contract_version: sharedModule.MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
    estimated_nutrition: rawCandidate().estimatedNutrition,
    detected_items: [],
    confidence_score: 0.8,
    error_code: null,
    analyzed_at: new Date().toISOString()
  }]);
  const existingCompletedOutcome = await persistenceModule.claimAnalysisRequest(completedAdmin, claimInput());
  expect(existingCompletedOutcome.kind === "existing_completed" && existingCompletedOutcome.row.id === "row-completed", "a completed row for the same request/actor/object/hash is replayed directly — the provider is never re-called");

  const failedAdmin = fakeAdminClient([{ id: "row-failed", analysis_request_id: requestId1, user_id: actorUid, image_object_ref: canonicalRef, image_sha256: "a".repeat(64), analysis_status: "failed" }]);
  const retryClaim = await persistenceModule.claimAnalysisRequest(failedAdmin, claimInput());
  expect(retryClaim.kind === "claimed" && retryClaim.analysisId === "row-failed", "a previously-failed row for the same request is retried via the SAME row/request id, never a new one");
  expect(failedAdmin._rows.size === 1, "the bounded retry did not create a second row");

  const completionAdmin = fakeAdminClient([{ id: "row-x", analysis_request_id: requestId1, user_id: actorUid, analysis_status: "processing" }]);
  const completedOk = await persistenceModule.markAnalysisCompleted(completionAdmin, {
    analysisId: "row-x",
    actorUid,
    modelName: "openai",
    modelVersion: "openai-gpt-test-responses-v1",
    analysisStatus: "completed",
    detectedItems: [],
    estimatedNutrition: rawCandidate().estimatedNutrition,
    confidenceScore: 0.8
  });
  expect(completedOk === true, "markAnalysisCompleted succeeds for the claimed row");

  const failAdmin = fakeAdminClient([{ id: "row-y", analysis_request_id: requestId1, user_id: actorUid, analysis_status: "processing" }]);
  const failedOk = await persistenceModule.markAnalysisFailed(failAdmin, "row-y", actorUid, "provider_timeout");
  expect(failedOk === true, "markAnalysisFailed succeeds for the claimed row");

  // ================= handler.ts: full orchestration via injected HandlerDependencies =================
  function baseRequestBody(overrides = {}) {
    return {
      contractVersion: sharedModule.MEAL_PHOTO_ANALYSIS_REQUEST_CONTRACT_VERSION,
      analysisRequestId: requestId1,
      imageObjectRef: canonicalRef,
      captureMethod: "camera",
      capturedAt: new Date().toISOString(),
      mealSourceContext: "dine_in",
      locale: "zh-TW",
      ...overrides
    };
  }
  function makeRequest(body, { authorization = "Bearer test-jwt" } = {}) {
    const headers = new Headers();
    if (authorization) headers.set("Authorization", authorization);
    return new Request("https://example.test/functions/v1/meal-photo-analysis", { method: "POST", headers, body: JSON.stringify(body) });
  }
  function baseDeps(overrides = {}) {
    return {
      loadServerConfig: () => ({ ok: true, value: { enabled: true, provider: "openai", openaiApiKey: "sk-x", openaiModel: "gpt-x", openaiTimeoutMs: 5000, supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon", adminPersistenceKey: "admin-key" } }),
      authenticateCaller: async (request) => {
        if (!request.headers.get("Authorization")) return { ok: false, errorCode: "authentication_required" };
        return { ok: true, value: { userId: actorUid, userScopedClient: {} } };
      },
      downloadAndValidateImage: async () => ({ ok: true, value: { bytes: jpegBytes(), byteSize: 2048, mimeType: "image/jpeg", extension: "jpg", sha256: "c".repeat(64) } }),
      createAdminClient: () => fakeAdminClient(),
      createProvider: () => new providerModule.MockMealPhotoAnalysisProvider({ result: { engineVersion: "mock-v1", rawOutput: validRawOutput } }),
      generateCandidateId: () => crypto.randomUUID(),
      ...overrides
    };
  }

  const noAuthResponse = await handlerModule.processMealPhotoAnalysisRequest(makeRequest(baseRequestBody(), { authorization: null }), baseDeps());
  expect(noAuthResponse.status === 401, "no Authorization header -> HTTP 401");
  expect((await noAuthResponse.json()).error.code === "authentication_required", "no Authorization header -> authentication_required error code");

  const malformedJsonRequest = new Request("https://example.test/functions/v1/meal-photo-analysis", { method: "POST", headers: { Authorization: "Bearer x" }, body: "{not json" });
  const malformedResponse = await handlerModule.processMealPhotoAnalysisRequest(malformedJsonRequest, baseDeps());
  expect(malformedResponse.status === 400 && (await malformedResponse.json()).error.code === "invalid_request", "malformed JSON body -> invalid_request");

  const missingFieldResponse = await handlerModule.processMealPhotoAnalysisRequest(makeRequest({ ...baseRequestBody(), locale: undefined }), baseDeps());
  expect(missingFieldResponse.status === 400, "a request missing a required field is rejected as invalid_request");

  const foreignPrefixResponse = await handlerModule.processMealPhotoAnalysisRequest(makeRequest(baseRequestBody({ imageObjectRef: `other-actor/${requestId1}/original.jpg` })), baseDeps());
  expect(foreignPrefixResponse.status === 400 && (await foreignPrefixResponse.json()).error.code === "invalid_image_object_ref", "a request naming another actor's Storage prefix is rejected before any download is attempted");

  const disabledResponse = await handlerModule.processMealPhotoAnalysisRequest(makeRequest(baseRequestBody()), baseDeps({ loadServerConfig: () => ({ ok: false, reason: "analysis_disabled" }) }));
  expect(disabledResponse.status === 503 && (await disabledResponse.json()).error.code === "analysis_disabled", "a disabled server feature gate fails closed with analysis_disabled, before auth is even attempted for cost reasons is irrelevant — it must still fail closed");

  let claimCallCount = 0;
  let providerCallCount = 0;
  const successAdmin = fakeAdminClient();
  const successResponse = await handlerModule.processMealPhotoAnalysisRequest(
    makeRequest(baseRequestBody()),
    baseDeps({
      createAdminClient: () => successAdmin,
      createProvider: () => ({
        name: "mock",
        async analyze() {
          providerCallCount += 1;
          return { ok: true, value: { engineVersion: "mock-v1", rawOutput: validRawOutput } };
        }
      })
    })
  );
  expect(successResponse.status === 200, "a fully valid request succeeds with HTTP 200");
  const successBody = await successResponse.json();
  expect(successBody.requiresUserConfirmation === true, "the success response always sets requiresUserConfirmation:true");
  expect(successBody.providerCategory === "external_multimodal", "the success response uses the neutral provider category, never the vendor name, as a Mobile-facing field");
  expect(successBody.candidates.length === 1 && typeof successBody.candidates[0].candidateId === "string" && successBody.candidates[0].candidateId.length > 0, "the response's candidateId was assigned server-side by the injected generator, not by the provider");
  expect(successBody.analysisStatus === "completed", "confidence 0.8 (>= 0.5 threshold) yields analysisStatus completed, not low_confidence");
  expect(successBody.safeUserFacingErrorCode === null && successBody.safeUserFacingErrorMessage === null, "a successful response has null safe-error fields");
  expect(providerCallCount === 1, "the provider was called exactly once for a fresh, successfully-claimed request");
  expect(successAdmin._rows.size === 1, "exactly one meal_analyses row exists after a successful analysis");
  const persistedRow = [...successAdmin._rows.values()][0];
  expect(persistedRow.analysis_status === "completed" && persistedRow.model_name === "openai" && persistedRow.model_version === "mock-v1", "the persisted row reflects the completed status and provider/model identity");
  expect(!("rawOutput" in persistedRow) && JSON.stringify(persistedRow).length < 5000, "no raw provider payload field was persisted onto the row");

  const lowConfidenceRawOutput = { candidates: [rawCandidate({ confidence: 0.2 })] };
  const lowConfidenceAdmin = fakeAdminClient();
  const lowConfidenceResponse = await handlerModule.processMealPhotoAnalysisRequest(
    makeRequest(baseRequestBody({ analysisRequestId: "33333333-3333-4333-8333-333333333333", imageObjectRef: `${actorUid}/33333333-3333-4333-8333-333333333333/original.jpg` })),
    baseDeps({ createAdminClient: () => lowConfidenceAdmin, createProvider: () => ({ name: "mock", async analyze() { return { ok: true, value: { engineVersion: "mock-v1", rawOutput: lowConfidenceRawOutput } }; } }) })
  );
  const lowConfidenceBody = await lowConfidenceResponse.json();
  expect(lowConfidenceBody.analysisStatus === "low_confidence", "confidence 0.2 (< 0.5 threshold) yields analysisStatus low_confidence");

  const secondInvokeAdmin = fakeAdminClient();
  await handlerModule.processMealPhotoAnalysisRequest(makeRequest(baseRequestBody({ analysisRequestId: "44444444-4444-4444-8444-444444444444", imageObjectRef: `${actorUid}/44444444-4444-4444-8444-444444444444/original.jpg` })), baseDeps({ createAdminClient: () => secondInvokeAdmin, createProvider: () => { providerCallCount = 0; return { name: "mock", async analyze() { providerCallCount += 1; return { ok: true, value: { engineVersion: "mock-v1", rawOutput: validRawOutput } }; } }; } }));
  providerCallCount = 0;
  const secondInvokeResponse = await handlerModule.processMealPhotoAnalysisRequest(
    makeRequest(baseRequestBody({ analysisRequestId: "44444444-4444-4444-8444-444444444444", imageObjectRef: `${actorUid}/44444444-4444-4444-8444-444444444444/original.jpg` })),
    baseDeps({ createAdminClient: () => secondInvokeAdmin, createProvider: () => ({ name: "mock", async analyze() { providerCallCount += 1; return { ok: true, value: { engineVersion: "mock-v1", rawOutput: validRawOutput } }; } }) })
  );
  expect(secondInvokeResponse.status === 200, "replaying the same already-completed analysisRequestId succeeds");
  expect(providerCallCount === 0, "the provider is never re-called for an already-completed analysisRequestId — the existing row is replayed instead");
  expect(secondInvokeAdmin._rows.size === 1, "still exactly one row after the second invoke of the same request");

  const providerFailureAdmin = fakeAdminClient();
  const providerFailureResponse = await handlerModule.processMealPhotoAnalysisRequest(
    makeRequest(baseRequestBody({ analysisRequestId: "55555555-5555-4555-8555-555555555555", imageObjectRef: `${actorUid}/55555555-5555-4555-8555-555555555555/original.jpg` })),
    baseDeps({ createAdminClient: () => providerFailureAdmin, createProvider: () => ({ name: "mock", async analyze() { return { ok: false, errorCode: "provider_timeout" }; } }) })
  );
  expect(providerFailureResponse.status === 200, "a provider-level failure after a legitimate claim still returns HTTP 200 (the shared contract's own reserved failed-status shape), not an HTTP error envelope");
  const providerFailureBody = await providerFailureResponse.json();
  expect(providerFailureBody.analysisStatus === "failed" && providerFailureBody.safeUserFacingErrorCode === "provider_timeout" && providerFailureBody.candidates.length === 0, "a provider failure response has analysisStatus failed, the safe error code, and empty candidates");
  const failedRow = [...providerFailureAdmin._rows.values()][0];
  expect(failedRow.analysis_status === "failed" && failedRow.error_code === "provider_timeout", "the SAME row (never a second one) is updated to failed with the safe error code");

  expect(
    JSON.stringify([successBody, lowConfidenceBody, providerFailureBody]).match(/meal_records|meal_record_items|INSERT INTO/i) === null,
    "no response body anywhere in this run contains any meal_records/meal_record_items trace"
  );

  console.log(JSON.stringify({
    status: "passed",
    phase: "MI-E-C4 meal-photo-analysis Edge Function unit/service smoke",
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
    phase: "MI-E-C4 meal-photo-analysis Edge Function unit/service smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (originalResolveFilename) Module._resolveFilename = originalResolveFilename;
  delete globalThis.Deno;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
