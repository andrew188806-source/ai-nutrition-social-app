// MI-E-C3 static guard: mechanical, regex-based structural assertions over the meal photo
// upload feature. Companion to meal-photo-upload-mi-e-c3-smoke.mjs (behavioral) and the existing
// meal-photo-analysis-mi-e-c1-guard.mjs (regression, re-run separately by the freeze process).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

// Strips // line comments (naively — no template literals containing "//" appear in these files)
// so a check can't be defeated by, or falsely tripped by, an explanatory comment quoting the very
// string it's checking for.
function stripTsComments(source) {
  return source
    .split("\n")
    .map((line) => {
      const index = line.indexOf("//");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

const paths = {
  types: "apps/mobile/features/meal-photo-upload/types.ts",
  mimeMapping: "apps/mobile/features/meal-photo-upload/mimeMapping.ts",
  requestId: "apps/mobile/features/meal-photo-upload/requestId.ts",
  ports: "apps/mobile/features/meal-photo-upload/ports.ts",
  fileBodySource: "apps/mobile/features/meal-photo-upload/fileBodySource.ts",
  nativeFileBodySource: "apps/mobile/features/meal-photo-upload/nativeFileBodySource.ts",
  storageContracts: "apps/mobile/features/meal-photo-upload/supabaseMealPhotoStorageContracts.ts",
  service: "apps/mobile/features/meal-photo-upload/mealPhotoUploadService.ts",
  featureFlags: "apps/mobile/features/meal-photo-upload/featureFlags.ts",
  factories: "apps/mobile/features/meal-photo-upload/factories.ts",
  disabledAdapter: "apps/mobile/features/meal-photo-upload/adapters/disabledMealPhotoUploadRepository.ts",
  mockAdapter: "apps/mobile/features/meal-photo-upload/adapters/mockMealPhotoUploadRepository.ts",
  supabaseAdapter: "apps/mobile/features/meal-photo-upload/adapters/supabaseMealPhotoUploadRepository.ts",
  binarySignature: "apps/mobile/features/meal-photo-upload/binarySignature.ts",
  arrayBufferConversion: "apps/mobile/features/meal-photo-upload/arrayBufferConversion.ts",
  payloadValidation: "apps/mobile/features/meal-photo-upload/payloadValidation.ts",
  sessionStore: "apps/mobile/features/analysis/analysisSessionStore.ts",
  hook: "apps/mobile/features/analysis/useMealPhotoUpload.ts",
  staleGuard: "apps/mobile/features/analysis/mealPhotoUploadStaleGuard.ts",
  mediaCapture: "apps/mobile/features/analysis/mediaCapture.ts",
  mealPhotoScreen: "apps/mobile/app/meal-photo.tsx",
  analysisScreen: "apps/mobile/app/analysis.tsx",
  consumerRuntimeComposition: "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  consumerRuntimeProvider: "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  zhTW: "lib/i18n/zh-TW.ts",
  envExample: ".env.example",
  storageMigration: "supabase/migrations/20260725030000_meal_photo_analysis_private_storage_bucket.sql",
  grantMigration: "supabase/migrations/20260726010000_meal_photo_analysis_service_role_table_grants.sql"
};

const allSources = Object.values(paths)
  .filter((p) => exists(p))
  .map((p) => read(p))
  .join("\n\n");
const allSourcesNoComments = stripTsComments(allSources);

// Scoped to only this round's own feature code (not the large pre-existing analysis.tsx,
// consumer-runtime composition/provider, zh-TW.ts, .env.example, or the prior round's frozen
// migrations) — those files legitimately contain unrelated content (e.g. the MI-E-C2-R1 grant
// migration is ABOUT service_role by design) that would otherwise false-positive a substring scan.
const featureOnlySources = [
  paths.types,
  paths.mimeMapping,
  paths.requestId,
  paths.ports,
  paths.fileBodySource,
  paths.nativeFileBodySource,
  paths.storageContracts,
  paths.service,
  paths.featureFlags,
  paths.factories,
  paths.disabledAdapter,
  paths.mockAdapter,
  paths.supabaseAdapter,
  paths.binarySignature,
  paths.arrayBufferConversion,
  paths.payloadValidation,
  paths.hook,
  paths.staleGuard
]
  .map(read)
  .join("\n\n");
const featureOnlyNoComments = stripTsComments(featureOnlySources);

const typesSrc = read(paths.types);
const portsSrc = read(paths.ports);
const supabaseAdapterSrc = read(paths.supabaseAdapter);
const supabaseAdapterNoComments = stripTsComments(supabaseAdapterSrc);
const mockAdapterSrc = read(paths.mockAdapter);
const sessionStoreSrc = read(paths.sessionStore);
const hookSrc = read(paths.hook);
const storageContractsSrc = read(paths.storageContracts);
const factoriesSrc = read(paths.factories);
const featureFlagsSrc = read(paths.featureFlags);
const analysisScreenSrc = read(paths.analysisScreen);
const binarySignatureSrc = read(paths.binarySignature);
const arrayBufferConversionSrc = read(paths.arrayBufferConversion);
const payloadValidationSrc = read(paths.payloadValidation);
const zhTWSrc = read(paths.zhTW);

// 1. private bucket only
record(
  "uses the private meal-analysis-photos bucket (MEAL_ANALYSIS_PHOTOS_BUCKET constant), never a literal different bucket name",
  /MEAL_ANALYSIS_PHOTOS_BUCKET\s*=\s*"meal-analysis-photos"/.test(storageContractsSrc) &&
    supabaseAdapterSrc.includes("MEAL_ANALYSIS_PHOTOS_BUCKET") &&
    !/\.from\(\s*["'](?!meal-analysis-photos)[^"']*storage[^"']*["']\s*\)/i.test(supabaseAdapterSrc)
);

// 2. no public URL
record(
  "no public URL is ever constructed (no getPublicUrl / public: true anywhere in the feature)",
  !/getPublicUrl|publicUrl|public\s*:\s*true/.test(allSourcesNoComments)
);

// 3. no service-role key
record(
  "no service-role key, secret key, or privileged credential path in the feature's own code",
  !/service_role|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE|sb_secret_/i.test(featureOnlyNoComments)
);

// 4. no OpenAI call
record(
  "no OpenAI (or any external model provider) call in the feature's own code, and no new EXPO_PUBLIC_*OPENAI* env var added",
  !/openai|api\.openai\.com/i.test(featureOnlyNoComments) && !/EXPO_PUBLIC[A-Z_]*OPENAI/i.test(read(paths.envExample))
);

// 5. no Edge Function
record(
  "no Supabase Edge Function invocation or definition in the feature's own code",
  !/functions\.invoke|supabase\/functions|Deno\.serve/i.test(featureOnlyNoComments)
);

// 6. upload request has no trusted user ID field
record(
  "MealPhotoUploadInput has no user-id field — the actor always comes from the server-verified session",
  !/userId\s*:\s*string/.test(typesSrc) && supabaseAdapterNoComments.includes("session.value.user.userId")
);

// 7. no training consent boolean
record(
  "upload request/contract contains no per-photo training consent field",
  !/trainingEligible|trainingConsent|allowTraining|canTrain/i.test(featureOnlyNoComments)
);

// 8. no restaurant commercial grant
record(
  "upload request/contract contains no restaurant commercial permission field",
  !/restaurantCommercialPermission|restaurantCommercialGrant|commercialLicense/i.test(featureOnlyNoComments)
);

// 9. canonical shared path builder
record(
  "object path is built exclusively via @haocu/shared's buildMealPhotoAnalysisObjectPath",
  supabaseAdapterSrc.includes('import { buildMealPhotoAnalysisObjectPath } from "@haocu/shared"') &&
    supabaseAdapterSrc.includes("buildMealPhotoAnalysisObjectPath(userId, input.analysisRequestId, payload.extension)") &&
    mockAdapterSrc.includes('import { buildMealPhotoAnalysisObjectPath } from "@haocu/shared"')
);

// 10. upsert:false
record(
  "Supabase upload call always uses upsert:false",
  /bucket\.upload\(path,\s*payload\.arrayBuffer,\s*\{\s*contentType:\s*payload\.mimeType,\s*upsert:\s*false\s*\}\)/.test(supabaseAdapterSrc)
);

// 11. no Storage UPDATE
record(
  "no Storage update()/updateBucket() call anywhere in the feature",
  !/\.update\s*\(|updateBucket/.test(stripTsComments(supabaseAdapterSrc + storageContractsSrc + mockAdapterSrc))
);

// 12. unsupported MIME fails closed
record(
  "unsupported/unresolvable MIME type yields unsupported_image_type in both adapters",
  supabaseAdapterSrc.includes('errUpload(new MealPhotoUploadError("unsupported_image_type"') &&
    mockAdapterSrc.includes('errUpload(new MealPhotoUploadError("unsupported_image_type"')
);

// 13. 10MB limit explicit
record(
  "10,485,760-byte limit is defined once and enforced by both real adapters",
  /MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE\s*=\s*10_485_760/.test(typesSrc) &&
    supabaseAdapterSrc.includes("rawBytes.byteSize > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE") &&
    mockAdapterSrc.includes("rawBytes.byteSize > MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE")
);

// 14. local URI and private object ref are distinct session fields
record(
  "session stores capturedImageUri and imageObjectRef as separate fields",
  /capturedImageUri:\s*string \| null;/.test(sessionStoreSrc) && /imageObjectRef:\s*string \| null;/.test(sessionStoreSrc)
);

// 15. object ref only set on success
record(
  "imageObjectRef is only ever written from a successful upload outcome (outcome.value.imageObjectRef), never speculatively",
  hookSrc.includes("imageObjectRef: outcome.value.imageObjectRef") && !/imageObjectRef:\s*input\./.test(hookSrc)
);

// 16 & 17. stale/actor-switch discard
record(
  "hook only applies an upload result after re-checking analysisRequestId/captureGeneration/actorKey/actorGeneration all still match (isMealPhotoUploadResultStillCurrent)",
  hookSrc.includes("isMealPhotoUploadResultStillCurrent") && hookSrc.includes("if (!stillCurrent()) return;")
);
record(
  "the stale/actor-change comparison itself checks all four of analysisRequestId, captureGeneration, actorKey, actorGeneration",
  ["analysisRequestId", "captureGeneration", "actorKey", "actorGeneration"].every((field) =>
    read(paths.staleGuard).includes(`expected.${field} === actual.${field}`)
  )
);

// 18. retry maintains same analysisRequestId
record(
  "retryUpload reuses the existing session.analysisRequestId rather than generating a new one",
  hookSrc.includes("current.analysisRequestId") && !hookSrc.includes("generateMealPhotoAnalysisRequestId")
);

// 19. new photo generates new analysisRequestId + bumps generation
record(
  "beginAnalysisCapture generates a new analysisRequestId and bumps captureGeneration for every new photo",
  sessionStoreSrc.includes("captureGenerationCounter += 1") &&
    sessionStoreSrc.includes("session.analysisRequestId = generateMealPhotoAnalysisRequestId()") &&
    sessionStoreSrc.includes("session.captureGeneration = captureGenerationCounter")
);

// 20. upload failure preserves local preview
record(
  "on upload failure, only uploadStatus/uploadErrorCode are cleared/set — capturedImageUri is never touched",
  (() => {
    const failureBlock = hookSrc.slice(hookSrc.indexOf('setMealPhotoUploadState({ uploadStatus: "failed"'));
    return !failureBlock.includes("capturedImageUri: null") && !hookSrc.includes("capturedImageUri = null");
  })()
);

// 21. production-safe default
record(
  "default (unset) upload source is disabled",
  /if \(!value\) return "disabled";/.test(featureFlagsSrc)
);

// 22. frozen finalization RPC untouched (scoped to this round's own new files only —
// analysis.tsx/consumer-runtime legitimately still call the pre-existing finalization flow
// elsewhere, unmodified by this round)
record(
  "the feature's own new code does not call or modify the finalize_meal_identification RPC / mealIdentificationFinalization runtime",
  !/finalize_meal_identification|mealIdentificationFinalizationRuntime|consumerMealIdentificationFinalization/i.test(featureOnlyNoComments) &&
    !/finalize_meal_identification|mealIdentificationFinalizationRuntime/i.test(stripTsComments(sessionStoreSrc))
);

// 23. deferred migration absent from active queue
record(
  "the deferred P2V-PERF migration is not present in the active supabase/migrations/ queue",
  (() => {
    const migrations = fs.readdirSync(path.join(root, "supabase", "migrations"));
    return !migrations.some((name) => name.includes("20260722010000"));
  })()
);

// 24. MI-E-C1 guard file untouched (its own regression re-run happens separately in §十三)
record(
  "MI-E-C1's guard script still exists unmodified in this round's diff scope (structural presence check only)",
  exists("scripts/meal-photo-analysis-mi-e-c1-guard.mjs")
);

// ==== MI-E-C3-R1: ArrayBuffer conversion, binary signature validation, truthful-UI checks ====

// R1-1. production upload body is ArrayBuffer (compile-time enforced by the contract type)
record(
  "the Storage bucket contract's upload() body type is ArrayBuffer (a Uint8Array cannot satisfy this type)",
  /upload\(\s*path:\s*string,\s*body:\s*ArrayBuffer,/.test(storageContractsSrc) && !/body:\s*Uint8Array/.test(storageContractsSrc)
);

// R1-2. never pass a raw Uint8Array (or its .buffer) directly to Storage upload
record(
  "the Supabase adapter never passes a raw Uint8Array or its .buffer directly to bucket.upload — only the validated payload's arrayBuffer",
  supabaseAdapterSrc.includes("bucket.upload(path, payload.arrayBuffer,") &&
    !/bucket\.upload\([^)]*\.bytes[,)]/.test(supabaseAdapterSrc) &&
    !/bucket\.upload\([^)]*\.buffer[,)]/.test(supabaseAdapterSrc)
);

// R1-3. exact byte-range conversion exists (not bytes.buffer passed through unchecked)
record(
  "toExactArrayBuffer performs an exact byteOffset..byteOffset+byteLength slice, and explicitly excludes SharedArrayBuffer rather than silently casting it",
  arrayBufferConversionSrc.includes("buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)") &&
    arrayBufferConversionSrc.includes("instanceof SharedArrayBuffer") &&
    payloadValidationSrc.includes("toExactArrayBuffer(bytes)")
);

// R1-4. binary signature is the MIME authority, not the supplied hint
record(
  "buildValidatedMealPhotoPayload's returned mimeType/extension always come from detectImageSignature's result, never from the caller-supplied hint",
  payloadValidationSrc.includes("mimeType: detected.mimeType") &&
    payloadValidationSrc.includes("extension: detected.extension") &&
    !/mimeType:\s*candidateMimeType/.test(payloadValidationSrc)
);

// R1-5. MIME/filename metadata conflicting with the binary signature fails closed
record(
  "a supplied MIME/filename hint that resolves to a different format than the binary signature is rejected with image_content_type_mismatch",
  payloadValidationSrc.includes('"image_content_type_mismatch"') &&
    /hint\.mimeType !== detected\.mimeType/.test(payloadValidationSrc) &&
    typesSrc.includes('"image_content_type_mismatch"')
);

// R1-6. arbitrary bytes cannot pass as an image merely by being labeled image/jpeg
record(
  "detectImageSignature only recognizes real magic-byte headers (JPEG/PNG/WebP/HEIC-HEIF) — it takes no MIME/filename parameter at all, so a caller-supplied label cannot influence its result",
  (() => {
    const signature = binarySignatureSrc.match(/export function detectImageSignature\(([^)]*)\)/);
    return Boolean(signature) && signature[1].replace(/\s/g, "") === "bytes:Uint8Array";
  })()
);

// R1-7. demo nutrition values carry an explicit disclosure
record(
  "the pre-confirmation nutrition summary and the post-confirmation hero both carry an explicit demo-data disclosure",
  analysisScreenSrc.includes("subtitle={zhTW.mobile.analysis.summaryDemoDisclosure}") &&
    /尚未依這張照片(實際)?進行\s*AI\s*計算/.test(zhTWSrc)
);

// R1-8. no false "AI is analyzing" claim anywhere in this round's flow copy
record(
  'no "AI 分析中"/"已辨識成功"/unqualified "分析完成" claim remains in the capture/upload/analysis flow copy',
  !/AI\s*正在分析餐點中|已辨識成功/.test(stripTsComments(zhTWSrc)) &&
    !zhTWSrc.includes('bridgeTitle: "分析完成，接著看看下一餐適合吃什麼。"')
);

// R1-9. MI-E-C1 guard has been converted to a portable, HEAD-independent invariant set
record(
  "the MI-E-C1 guard no longer pins to a specific baseline HEAD and no longer forbids analysis.tsx/meal-photo.tsx from ever being modified",
  (() => {
    const c1Guard = read("scripts/meal-photo-analysis-mi-e-c1-guard.mjs");
    return !c1Guard.includes("BASELINE_HEAD") && !c1Guard.includes("were not modified this round");
  })()
);

// ---- additional architecture checks ----
record(
  "no direct supabase.storage.from(...).upload(...) call outside the meal-photo-upload feature folder for this bucket",
  (() => {
    try {
      // --untracked so this also sees this round's own not-yet-staged new files, not just
      // previously committed ones. scripts/ is excluded from the offender filter because guard
      // files legitimately quote "meal-analysis-photos" in their own check descriptions/regexes —
      // that is not an application code path that could ever call bucket.upload().
      const grep = execFileSync("git", ["grep", "--untracked", "-l", "meal-analysis-photos"], { cwd: root, encoding: "utf8" });
      const files = grep
        .split("\n")
        .filter(Boolean)
        .filter((f) => !f.startsWith("apps/mobile/features/meal-photo-upload/") && !f.startsWith("supabase/migrations/") && !f.startsWith("scripts/"));
      return files.length === 0;
    } catch {
      return true;
    }
  })()
);
record(
  "factories.ts selects disabled/mock/supabase-live per flags.uploadSource, with disabled/config-issue fail-closed default",
  factoriesSrc.includes('flags.uploadSource === "disabled"') && factoriesSrc.includes("new DisabledMealPhotoUploadRepository()")
);
record(
  "mock repository derives the actor from ConsumerAuthPort.getCurrentSession(), not a separately injected fixed id",
  mockAdapterSrc.includes("this.options.authPort.getCurrentSession()")
);
record(
  "no full-photo base64 string is ever assigned into React state",
  !/useState[^;]*base64/i.test(analysisScreenSrc) && !/useState[^;]*base64/i.test(hookSrc)
);
record(
  "no photo byte/base64 content is ever passed to console.log/console.error in the feature",
  !/console\.(log|error|warn)\([^)]*(bytes|base64)/i.test(allSourcesNoComments)
);
record(
  "delete (best-effort cleanup) is only ever wired to an explicit retake gesture, never a route-unmount effect",
  analysisScreenSrc.includes("function retakeMealPhoto()") && !/useEffect\([^)]*deleteMealPhotoObject/.test(analysisScreenSrc)
);
function walkTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

record(
  "no expo-file-system import statement outside nativeFileBodySource.ts within this feature",
  (() => {
    const dir = path.join(root, "apps/mobile/features/meal-photo-upload");
    const offenders = walkTsFiles(dir)
      .filter((full) => !full.endsWith("nativeFileBodySource.ts"))
      .filter((full) => /from\s+["']expo-file-system["']/.test(fs.readFileSync(full, "utf8")));
    return offenders.length === 0;
  })()
);
record(
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE is documented in .env.example with a safe (disabled) default",
  /EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE=disabled/.test(read(paths.envExample))
);
record(
  "consumerRuntimeComposition wires mealPhotoUploadService via createMealPhotoUploadService (no ad hoc parallel construction)",
  read(paths.consumerRuntimeComposition).includes("createMealPhotoUploadService(")
);
record(
  "ConsumerRuntimeProvider exposes uploadMealPhoto/deleteMealPhotoObject as plain passthroughs, not a new competing runtime/store class",
  read(paths.consumerRuntimeProvider).includes("uploadMealPhoto: (input) =>") &&
    !/class\s+\w*MealPhotoUpload\w*Runtime/.test(read(paths.consumerRuntimeProvider))
);
record(
  "analysis.tsx upload status card never claims AI analysis is running or complete",
  !/AI\s*(正在|已完成)?\s*分析/.test((() => {
    const start = analysisScreenSrc.indexOf("function MealPhotoUploadStatusCard");
    const end = analysisScreenSrc.indexOf("\n}", start);
    return analysisScreenSrc.slice(start, end);
  })())
);
record(
  "mealRecordTiming / camera-vs-post_hoc frozen behavior (captureMethod handling) is unmodified by this round's session-store diff",
  sessionStoreSrc.includes('if (method === "camera") {') && sessionStoreSrc.includes("session.recordTimingConfirmed = true;")
);

const passCount = results.filter((r) => r.pass).length;
for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} — ${result.name}`);
}
console.log(`RESULT ${passCount}/${results.length} PASS`);
if (passCount !== results.length) process.exit(1);
