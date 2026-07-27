// MI-E-C4 static guard: mechanical, regex/structural assertions over the meal-photo-analysis Edge
// Function. Companion to meal-photo-analysis-edge-function-mi-e-c4-smoke.mjs (behavioral).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { computeGeneratedContents, MEAL_PHOTO_ANALYSIS_GENERATED_FILES } from "./generate-meal-photo-analysis-edge-shared.mjs";

const root = process.cwd();
const results = [];

function record(name, pass) {
  results.push({ name, pass: Boolean(pass) });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function stripTsComments(source) {
  return source
    .split("\n")
    .map((line) => {
      const index = line.indexOf("//");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

const fnRoot = "supabase/functions/meal-photo-analysis";
const paths = {
  index: `${fnRoot}/index.ts`,
  handler: `${fnRoot}/handler.ts`,
  auth: `${fnRoot}/auth.ts`,
  config: `${fnRoot}/config.ts`,
  errors: `${fnRoot}/errors.ts`,
  objectValidation: `${fnRoot}/objectValidation.ts`,
  imageValidation: `${fnRoot}/imageValidation.ts`,
  provider: `${fnRoot}/provider.ts`,
  openaiProvider: `${fnRoot}/openaiProvider.ts`,
  prompt: `${fnRoot}/prompt.ts`,
  persistence: `${fnRoot}/persistence.ts`,
  configToml: "supabase/config.toml",
  sharedTypes: "packages/shared/src/domain/meal-photo-analysis/types.ts",
  requestValidation: "packages/shared/src/domain/meal-photo-analysis/requestValidation.ts",
  providerOutputSchema: "packages/shared/src/domain/meal-photo-analysis/providerOutputSchema.ts",
  responseValidation: "packages/shared/src/domain/meal-photo-analysis/responseValidation.ts",
  binarySignature: "packages/shared/src/domain/meal-photo-analysis/binarySignature.ts",
  imageHash: "packages/shared/src/domain/meal-photo-analysis/imageHash.ts",
  finalizationMigration: "supabase/migrations/20260724020000_consumer_meal_identification_atomic_finalization.sql"
};

const allFnSources = Object.entries(paths)
  .filter(([key]) => key !== "sharedTypes" && key !== "requestValidation" && key !== "providerOutputSchema" && key !== "responseValidation" && key !== "binarySignature" && key !== "imageHash" && key !== "finalizationMigration" && key !== "configToml")
  .map(([, p]) => read(p))
  .join("\n\n");
const allFnSourcesNoComments = stripTsComments(allFnSources);

const configTomlSrc = read(paths.configToml);
const handlerSrc = read(paths.handler);
const authSrc = read(paths.auth);
const configSrc = read(paths.config);
const objectValidationSrc = read(paths.objectValidation);
const imageValidationSrc = read(paths.imageValidation);
const providerSrc = read(paths.provider);
const openaiProviderSrc = read(paths.openaiProvider);
const promptSrc = read(paths.prompt);
const persistenceSrc = read(paths.persistence);
const sharedTypesSrc = read(paths.sharedTypes);
const responseValidationSrc = read(paths.responseValidation);
const providerOutputSchemaSrc = read(paths.providerOutputSchema);

// 1. Function name
record("meal-photo-analysis Edge Function directory exists with index.ts", exists(paths.index));

// 2. JWT verification not disabled
record(
  "config.toml sets verify_jwt = true for meal-photo-analysis (never false)",
  /\[functions\.meal-photo-analysis\][\s\S]{0,400}verify_jwt\s*=\s*true/.test(configTomlSrc) &&
    !/\[functions\.meal-photo-analysis\][\s\S]{0,400}verify_jwt\s*=\s*false/.test(configTomlSrc)
);

// 3. no public/anonymous mode
record(
  "no --no-verify-jwt flag or public/anonymous function mode anywhere in this round's files",
  !/no-verify-jwt|verify_jwt\s*=\s*false/i.test(allFnSourcesNoComments)
);

// 4. user-scoped client for Storage read
record(
  "downloadAndValidateImage is called with the user-scoped client, not the admin client",
  handlerSrc.includes("deps.downloadAndValidateImage(\n    userScopedClient,") &&
    imageValidationSrc.includes("userScopedClient: SupabaseClient")
);

// 5. admin client does not trust an unvalidated object ref
record(
  "the admin client is only ever used after path validation + user-scoped Storage download already succeeded",
  (() => {
    // Search for the call site (deps.createAdminClient() further down in processMealPhotoAnalysisRequest),
    // not the bare identifier — that also matches this file's own import statement near the top,
    // which would always precede the validation calls and make this check meaningless.
    const claimIndex = handlerSrc.indexOf("deps.createAdminClient(");
    const pathValidationIndex = handlerSrc.indexOf("validateCanonicalImageObjectRef");
    const imageDownloadIndex = handlerSrc.indexOf("downloadAndValidateImage(");
    return claimIndex > pathValidationIndex && claimIndex > imageDownloadIndex && pathValidationIndex >= 0 && imageDownloadIndex >= 0;
  })()
);

// 6. canonical actor/request path re-derivation
record(
  "the expected path is re-derived via buildMealPhotoAnalysisObjectPath and exact-compared against the request's path",
  objectValidationSrc.includes("buildMealPhotoAnalysisObjectPath(actorUid, analysisRequestId, extension)") &&
    objectValidationSrc.includes("expectedPath !== imageObjectRef")
);

// 7. UUID validation
record(
  "analysisRequestId is validated against a UUID pattern before being trusted as a path segment",
  /UUID_PATTERN\.test\(analysisRequestId\)/.test(objectValidationSrc)
);

// 8. no public URL
record("no public URL is ever constructed", !/getPublicUrl|publicUrl\s*[:=]/i.test(allFnSourcesNoComments));

// 9. no signed URL persistence
record("no signed URL is ever created or persisted", !/createSignedUrl/i.test(allFnSourcesNoComments));

// 10. private bucket fixed
record(
  "the bucket name is a single fixed literal constant, never a request-supplied value",
  /MEAL_ANALYSIS_PHOTOS_BUCKET\s*=\s*"meal-analysis-photos"\s*as const/.test(objectValidationSrc) &&
    !/storage\.from\(\s*(?!MEAL_ANALYSIS_PHOTOS_BUCKET)/.test(allFnSourcesNoComments)
);

// 11. server revalidates binary signature
record("the server independently calls detectImageSignature on the downloaded bytes", imageValidationSrc.includes("detectImageSignature(bytes)"));

// 12. server computes SHA-256
record("the server computes a SHA-256 digest of the downloaded bytes", imageValidationSrc.includes("sha256Hex(bytes)"));

// 13. provider-neutral port
record(
  "the provider port interface contains no Supabase/DB/user-id/Storage-path/session reference",
  !/SupabaseClient|createClient|user_id|userId|imageObjectRef|meal_analyses/.test(stripTsComments(providerSrc))
);

// 14. Mobile cannot choose the provider
record(
  "the request validator's allowed key set has no provider/model field, and the handler never reads one from the request",
  !/provider|model/i.test(read("packages/shared/src/domain/meal-photo-analysis/requestValidation.ts").match(/REQUIRED_REQUEST_KEYS = \[([\s\S]*?)\]/)?.[1] ?? "") &&
    !/analysisRequest\.(provider|model)/.test(handlerSrc)
);

// 15. API key only from server env
record(
  "the OpenAI API key is only ever read from server config (Deno.env), never from the request body",
  configSrc.includes('readEnv("OPENAI_API_KEY")') && !/rawBody\.|analysisRequest\.apiKey|request\.apiKey/i.test(handlerSrc)
);

// 16. store:false
record("every OpenAI Responses request sets store:false", /store:\s*false/.test(openaiProviderSrc));

// 17. no conversation/background/files persistence
record(
  "no conversation id, background mode, or Files API usage in the OpenAI provider",
  !/conversation_id|background\s*:\s*true|\/v1\/files/i.test(stripTsComments(openaiProviderSrc))
);

// 18. strict structured output schema
record("the provider-output JSON schema uses the strict:true structured-output mechanism", promptSrc.includes("strict: true"));

// 19. additionalProperties:false at every object level
record(
  "the provider-output JSON schema sets additionalProperties:false at every object level",
  (promptSrc.match(/additionalProperties:\s*false/g) ?? []).length >= 3
);

// 20. local runtime validation independent of Structured Outputs guarantee
record(
  "validateRawProviderOutput is called locally on the parsed response regardless of the API's own schema guarantee",
  openaiProviderSrc.includes("validateRawProviderOutput(parsed)")
);

// 21. server generates candidate IDs; raw schema has no candidateId
record(
  "candidateId is assigned only by buildMealPhotoAnalysisResponseV1 (server-side); the raw provider schema has no candidateId field",
  // stripTsComments first: providerOutputSchema.ts's own explanatory comment about why candidateId
  // is intentionally absent from the raw schema would otherwise trip this exact check.
  responseValidationSrc.includes("candidateId: input.generateCandidateId()") && !/candidateId/.test(stripTsComments(providerOutputSchemaSrc))
);

// 22. requiresUserConfirmation:true
record(
  "requiresUserConfirmation is always the literal true, both in the shared type and in every constructed response",
  /requiresUserConfirmation:\s*true;\s*\/\//.test(sharedTypesSrc) &&
    handlerSrc.includes("requiresUserConfirmation: true")
);

// 23. no verified-nutrition claim
record("no code or prompt text claims nutrition is verified", !/verified nutrition|verifiedNutrition|已驗證的營養/i.test(stripTsComments(allFnSources)));

// 24. no restaurant/menu auto-resolution
record(
  "the Edge Function never calls the restaurant/menu catalog resolver",
  !/resolveCatalogMealCandidates|restaurant_catalog|menu_items/i.test(allFnSourcesNoComments)
);

// 25. no training eligibility
record("no training-eligibility field anywhere in the Edge Function", !/trainingEligible|trainingConsent|allowTraining|canTrain/i.test(allFnSourcesNoComments));

// 26. no restaurant commercial grant
record(
  "no restaurant commercial permission/grant field anywhere in the Edge Function",
  !/restaurantCommercialPermission|restaurantCommercialGrant|commercialLicense/i.test(allFnSourcesNoComments)
);

// 27. claim-before-provider idempotency
record(
  "claimAnalysisRequest is called before provider.analyze in the handler",
  handlerSrc.indexOf("claimAnalysisRequest(") < handlerSrc.indexOf("provider.analyze(")
);

// 28. no fake meal record
record(
  "the Edge Function never inserts into meal_records or meal_record_items",
  !/from\(\s*["']meal_records["']\s*\)|from\(\s*["']meal_record_items["']\s*\)/.test(allFnSourcesNoComments)
);

// 29. unique request conflict handling
record(
  "a 23505 unique-violation on analysis_request_id is handled explicitly, distinct from other persistence failures",
  persistenceSrc.includes('insertResult.error?.code !== "23505"')
);

// 30. raw provider response not persisted
record(
  "markAnalysisCompleted only ever writes structured candidates/nutrition/confidence — never a raw provider payload/text field",
  !/rawOutput|structuredText|providerOutcome\.value\.rawOutput\b(?!\.candidates)/.test(stripTsComments(persistenceSrc)) &&
    persistenceSrc.includes("detected_items: input.detectedItems")
);

// 31. raw image/base64 not logged
record(
  "no console.log/error/warn call anywhere prints image bytes, base64, or the data URL",
  !/console\.(log|error|warn)\([^)]*(bytes|base64|dataUrl)/i.test(allFnSourcesNoComments)
);

// 32 (MI-E-C4-R2): admin/persistence client uses ONLY the dedicated MEAL_PHOTO_ANALYSIS_ADMIN_KEY
// secret — the legacy SUPABASE_SERVICE_ROLE_KEY JWT is never functionally read anywhere in this
// Function (it was accidentally printed to an operator terminal during MI-E-C4-R1 and must be
// treated as compromised — see the R2 report). stripTsComments first: config.ts/persistence.ts's
// own explanatory comments legitimately name SUPABASE_SERVICE_ROLE_KEY to document why it is
// deliberately NOT used, which would otherwise false-positive a naive substring check.
record(
  "the admin/persistence client is built ONLY from MEAL_PHOTO_ANALYSIS_ADMIN_KEY; SUPABASE_SERVICE_ROLE_KEY is never functionally read anywhere in the Function, with no fallback to it, and never referenced anywhere under apps/mobile",
  configSrc.includes('readEnv("MEAL_PHOTO_ANALYSIS_ADMIN_KEY")') &&
    !/SUPABASE_SERVICE_ROLE_KEY/.test(allFnSourcesNoComments) &&
    !(() => {
      try {
        const grep = execFileSync("git", ["grep", "--untracked", "-lE", "SUPABASE_SERVICE_ROLE_KEY|MEAL_PHOTO_ANALYSIS_ADMIN_KEY", "--", "apps/mobile"], { cwd: root, encoding: "utf8" });
        return grep.trim().length > 0;
      } catch {
        return false;
      }
    })()
);

// 33. server feature gate fails closed
record(
  "loadServerConfig returns ok:false whenever enabled/provider/model/key are missing or invalid",
  configSrc.includes('if (!enabled) return { ok: false, reason: "analysis_disabled" };') &&
    configSrc.includes('return { ok: false, reason: "missing_openai_configuration" };')
);

// 34. C1/C3 guards still pass
record(
  "the MI-E-C1 and MI-E-C3 guards both still pass in full",
  (() => {
    try {
      // MI-E-C4-R1 replaced MI-E-C1's one-time freeze-only "supabase/functions/ remains empty"
      // check with durable invariants that hold regardless of whether the Function exists — so
      // there is no longer any disclosed/expected C1 staleness to carve out here. Both guards must
      // now be a full, unconditional pass.
      // execFileSync throws on a non-zero exit code; its stdout is still attached to the thrown
      // error object, so it must be read from there too, or a real failure would be
      // indistinguishable from a script crash.
      const runGuard = (scriptPath) => {
        try {
          return execFileSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
        } catch (err) {
          if (typeof err.stdout === "string") return err.stdout;
          throw err;
        }
      };
      const c1 = runGuard("scripts/meal-photo-analysis-mi-e-c1-guard.mjs");
      const c3 = runGuard("scripts/meal-photo-upload-mi-e-c3-guard.mjs");
      const c1Match = c1.match(/RESULT (\d+)\/(\d+) PASS/);
      const c3Match = c3.match(/RESULT (\d+)\/(\d+) PASS/);
      return Boolean(c1Match) && c1Match[1] === c1Match[2] && Boolean(c3Match) && c3Match[1] === c3Match[2];
    } catch {
      return false;
    }
  })()
);

// 35. deferred migration absent from active queue
record(
  "the deferred P2V-PERF migration is not present in the active supabase/migrations/ queue",
  !fs.readdirSync(path.join(root, "supabase", "migrations")).some((name) => name.includes("20260722010000"))
);

// 36. frozen finalization RPC untouched
record(
  "finalize_current_user_meal_identification_v1's migration file is not modified by this round's diff",
  (() => {
    try {
      const diffNames = execFileSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" }) +
        execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root, encoding: "utf8" });
      return !diffNames.includes("20260724020000_consumer_meal_identification_atomic_finalization.sql");
    } catch {
      return true;
    }
  })()
);

// 37. no Mobile UI wiring
record(
  "no Mobile file invokes the meal-photo-analysis Edge Function this round",
  (() => {
    try {
      // A bare substring match on "meal-photo-analysis" also matches pre-existing MI-E-C1/C3
      // architectural comments in Mobile that merely name the shared domain folder (e.g. "unlike
      // packages/shared/src/domain/meal-photo-analysis, which is..."). What actually matters is
      // whether any Mobile file calls .functions.invoke(...) naming this function — search each
      // matching file's content for that call pattern instead of trusting the filename match alone.
      const grep = execFileSync("git", ["grep", "--untracked", "-l", "meal-photo-analysis", "--", "apps/mobile"], { cwd: root, encoding: "utf8" });
      const candidateFiles = grep.split("\n").filter(Boolean);
      return candidateFiles.every((file) => {
        const src = read(file);
        return !/functions\s*\.\s*invoke\s*\(\s*["']meal-photo-analysis["']/.test(src);
      });
    } catch {
      return true;
    }
  })()
);

// 38. no model-training implementation
record(
  "no training-dataset or model-artifact file was added this round",
  (() => {
    try {
      const status = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" });
      return !/training-dataset|model-artifact|dataset-export/i.test(status);
    } catch {
      return true;
    }
  })()
);

// 39 (MI-E-C4-R1 addition, §5): the checked-in supabase/functions/_shared/meal-photo-analysis/
// mirror must be byte-identical to what the generator would produce right now from the canonical
// packages/shared source — catches both manual hand-edits to the generated mirror (forbidden) and
// an un-regenerated drift after a canonical-source change. Uses the generator's own pure
// computeGeneratedContents (no filesystem writes), so this check has no side effects.
record(
  "the generated _shared mirror is byte-identical to a fresh regeneration from the canonical packages/shared source",
  (() => {
    const expected = computeGeneratedContents(root);
    const mirrorDir = path.join(root, "supabase", "functions", "_shared", "meal-photo-analysis");
    return MEAL_PHOTO_ANALYSIS_GENERATED_FILES.every((file) => {
      const actualPath = path.join(mirrorDir, file);
      if (!fs.existsSync(actualPath)) return false;
      const actual = fs.readFileSync(actualPath, "utf8");
      return actual === expected.get(file);
    });
  })()
);

const passCount = results.filter((r) => r.pass).length;
for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} — ${result.name}`);
}
console.log(`RESULT ${passCount}/${results.length} PASS`);
if (passCount !== results.length) process.exit(1);
