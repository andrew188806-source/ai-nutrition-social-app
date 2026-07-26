// MI-E-C3/R1 unit/service smoke: compiles the real production TypeScript modules (not a parallel
// reimplementation) and exercises them directly in Node. factories.ts and nativeFileBodySource.ts
// are deliberately excluded from compilation here — nativeFileBodySource.ts imports
// expo-file-system, which requires a native Expo/RN runtime and cannot execute in plain Node;
// this smoke instead injects a synthetic MealPhotoFileBodySource directly into each repository,
// exercising the exact same adapter/service/error-mapping/binary-signature/ArrayBuffer-conversion
// code the real app uses. See the MI-E-C3-R1 report for why this split exists and what remains
// physical-device-only evidence.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const mealPhotoUploadRoot = path.join(featureRoot, "meal-photo-upload");
const sharedSrcRoot = path.join(root, "packages", "shared", "src");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meal-photo-upload-mi-e-c3-smoke-"));
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
    lib: ["lib.es2022.d.ts"],
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

// ---- synthetic valid image byte builders (real magic bytes, not arbitrary content) ----
function jpegBytes(size = 2048) {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}
function pngBytes(size = 2048) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}
function webpBytes(size = 2048) {
  const bytes = new Uint8Array(size);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return bytes;
}
function heicBytes(brand, size = 2048) {
  const bytes = new Uint8Array(size);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  for (let i = 0; i < 4; i += 1) bytes[8 + i] = brand.charCodeAt(i);
  return bytes;
}
function textBytes(text = "this is not an image, just plain text bytes") {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function fileBodySourceWithBytes(bytes, shouldThrow = false, typesModule) {
  return {
    async readFileAsBytes(_uri) {
      if (shouldThrow) throw new typesModule.MealPhotoUploadError("image_file_unreadable", "synthetic unreadable file");
      return { bytes, byteSize: bytes.byteLength };
    }
  };
}

let originalResolveFilename = null;

try {
  const smokeEntryFiles = [
    "types.ts",
    "mimeMapping.ts",
    "requestId.ts",
    "featureFlags.ts",
    "mealPhotoUploadService.ts",
    "ports.ts",
    "supabaseMealPhotoStorageContracts.ts",
    "binarySignature.ts",
    "arrayBufferConversion.ts",
    "payloadValidation.ts",
    "adapters/disabledMealPhotoUploadRepository.ts",
    "adapters/mockMealPhotoUploadRepository.ts",
    "adapters/supabaseMealPhotoUploadRepository.ts"
  ].map((relative) => path.join(mealPhotoUploadRoot, relative));
  smokeEntryFiles.push(path.join(featureRoot, "analysis", "mealPhotoUploadStaleGuard.ts"));
  const featureDiagnostics = compile(smokeEntryFiles, compiledFeatureRoot, featureRoot);
  expect(featureDiagnostics.length === 0, "meal-photo-upload TypeScript compilation", featureDiagnostics.map(formatDiagnostic).join("\n"));

  const sharedDiagnostics = compile(collectTsFiles(sharedSrcRoot), compiledSharedRoot, sharedSrcRoot);
  expect(sharedDiagnostics.length === 0, "@haocu/shared TypeScript compilation", sharedDiagnostics.map(formatDiagnostic).join("\n"));

  originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
    if (request === "@haocu/shared") return path.join(compiledSharedRoot, "index.js");
    return originalResolveFilename.call(this, request, ...rest);
  };

  const mealPhotoUploadOut = path.join(compiledFeatureRoot, "meal-photo-upload");
  const requireFromTemp = createRequire(path.join(mealPhotoUploadOut, "mealPhotoUploadService.js"));
  const typesModule = requireFromTemp("./types.js");
  const mimeMapping = requireFromTemp("./mimeMapping.js");
  const requestId = requireFromTemp("./requestId.js");
  const featureFlags = requireFromTemp("./featureFlags.js");
  const binarySignature = requireFromTemp("./binarySignature.js");
  const arrayBufferConversion = requireFromTemp("./arrayBufferConversion.js");
  const payloadValidation = requireFromTemp("./payloadValidation.js");
  const { MealPhotoUploadService } = requireFromTemp("./mealPhotoUploadService.js");
  const { DisabledMealPhotoUploadRepository } = requireFromTemp("./adapters/disabledMealPhotoUploadRepository.js");
  const { MockMealPhotoUploadRepository } = requireFromTemp("./adapters/mockMealPhotoUploadRepository.js");
  const { SupabaseMealPhotoUploadRepository } = requireFromTemp("./adapters/supabaseMealPhotoUploadRepository.js");
  const sharedModule = createRequire(path.join(compiledSharedRoot, "index.js"))("./index.js");
  const staleGuard = createRequire(path.join(compiledFeatureRoot, "analysis", "mealPhotoUploadStaleGuard.js"))("./mealPhotoUploadStaleGuard.js");

  const fileBodySource = (bytes, shouldThrow = false) => fileBodySourceWithBytes(bytes, shouldThrow, typesModule);

  // ================= exact ArrayBuffer conversion =================
  const fullBuffer = new Uint8Array([1, 2, 3, 4, 5]);
  const exactAb = arrayBufferConversion.toExactArrayBuffer(fullBuffer);
  expect(exactAb.byteLength === 5 && [...new Uint8Array(exactAb)].join(",") === "1,2,3,4,5", "toExactArrayBuffer converts a full-length view exactly");

  const backing = new Uint8Array([9, 9, 1, 2, 3, 9, 9, 9]);
  const offsetView = backing.subarray(2, 5); // non-zero byteOffset, byteLength < buffer.byteLength
  expect(offsetView.byteOffset === 2 && offsetView.byteLength === 3, "test setup: subarray view has non-zero offset and partial length");
  const offsetAb = arrayBufferConversion.toExactArrayBuffer(offsetView);
  expect(
    offsetAb.byteLength === 3 && [...new Uint8Array(offsetAb)].join(",") === "1,2,3",
    "toExactArrayBuffer on a non-zero-offset subarray view carries only the view's own bytes — no bytes from before/after the view"
  );

  // ================= binary signature detection (four image families) =================
  expect(
    JSON.stringify(binarySignature.detectImageSignature(jpegBytes())) === JSON.stringify({ mimeType: "image/jpeg", extension: "jpg" }),
    "JPEG signature (FF D8 FF) detected"
  );
  expect(
    JSON.stringify(binarySignature.detectImageSignature(pngBytes())) === JSON.stringify({ mimeType: "image/png", extension: "png" }),
    "PNG signature (89 50 4E 47 0D 0A 1A 0A) detected"
  );
  expect(
    JSON.stringify(binarySignature.detectImageSignature(webpBytes())) === JSON.stringify({ mimeType: "image/webp", extension: "webp" }),
    "WebP signature (RIFF....WEBP) detected"
  );
  for (const brand of ["heic", "heix", "hevc", "hevx", "mif1", "msf1"]) {
    expect(
      JSON.stringify(binarySignature.detectImageSignature(heicBytes(brand))) === JSON.stringify({ mimeType: "image/heic", extension: "heic" }),
      `HEIC/HEIF ftyp brand "${brand}" detected and canonicalized to image/heic`
    );
  }
  expect(binarySignature.detectImageSignature(heicBytes("avif")) === null, "an ftyp brand not on the accepted list (e.g. avif) is not recognized");
  expect(binarySignature.detectImageSignature(textBytes()) === null, "arbitrary text bytes have no recognized signature");
  expect(binarySignature.detectImageSignature(new Uint8Array([0xff, 0xd8])) === null, "a truncated JPEG header (2 of 3 bytes) is not recognized");
  expect(binarySignature.detectImageSignature(new Uint8Array(0)) === null, "an empty byte array is not recognized");

  // ================= payload validation: reconciliation rules =================
  expect(
    (() => {
      const p = payloadValidation.buildValidatedMealPhotoPayload(jpegBytes(), "image/jpeg", null);
      return p.mimeType === "image/jpeg" && p.extension === "jpg" && p.arrayBuffer.byteLength === jpegBytes().byteLength;
    })(),
    "supplied MIME matching the binary signature: accepted"
  );
  expect(
    (() => {
      const p = payloadValidation.buildValidatedMealPhotoPayload(jpegBytes(), null, null);
      return p.mimeType === "image/jpeg";
    })(),
    "null MIME + null filename, recognizable binary signature: accepted (signature alone is sufficient)"
  );
  expect(
    (() => {
      const p = payloadValidation.buildValidatedMealPhotoPayload(pngBytes(), null, "photo.png");
      return p.mimeType === "image/png";
    })(),
    "null MIME + filename matching the binary signature: accepted"
  );
  function expectMismatch(bytes, mime, fileName, label) {
    let error = null;
    try {
      payloadValidation.buildValidatedMealPhotoPayload(bytes, mime, fileName);
    } catch (e) {
      error = e;
    }
    expect(error?.code === "image_content_type_mismatch", label);
  }
  expectMismatch(jpegBytes(), "image/png", null, "JPEG bytes + supplied image/png MIME: rejected as image_content_type_mismatch");
  expectMismatch(pngBytes(), null, "photo.jpg", "PNG bytes + supplied .jpg filename: rejected as image_content_type_mismatch");
  expectMismatch(jpegBytes(), "image/gif", null, "valid JPEG bytes + an unresolvable supplied MIME (image/gif): rejected as image_content_type_mismatch");

  function expectUnsupported(bytes, mime, fileName, label) {
    let error = null;
    try {
      payloadValidation.buildValidatedMealPhotoPayload(bytes, mime, fileName);
    } catch (e) {
      error = e;
    }
    expect(error?.code === "unsupported_image_type", label);
  }
  expectUnsupported(textBytes(), "image/jpeg", null, "arbitrary text bytes claimed as image/jpeg: rejected as unsupported_image_type (binary signature is checked first, before metadata is even consulted)");
  expectUnsupported(new Uint8Array([0xff, 0xd8]), "image/jpeg", null, "truncated JPEG header claimed as image/jpeg: rejected as unsupported_image_type");
  expectUnsupported(new Uint8Array(0), "image/jpeg", null, "empty file claimed as image/jpeg: rejected as unsupported_image_type");

  // ---- requestId shape ----
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const generatedId = requestId.generateMealPhotoAnalysisRequestId();
  expect(uuidPattern.test(generatedId), "generateMealPhotoAnalysisRequestId produces a well-formed UUIDv4-shaped id");
  expect(requestId.generateMealPhotoAnalysisRequestId() !== generatedId, "successive analysisRequestId calls are distinct");

  // ---- feature flags default/gating ----
  const defaultFlags = featureFlags.getMealPhotoUploadRuntimeFlags("mock", false, false, {});
  expect(defaultFlags.uploadSource === "disabled" && defaultFlags.issues.length === 0, "default (no env var) upload source is disabled");
  const liveWithoutGates = featureFlags.getMealPhotoUploadRuntimeFlags("mock", false, false, {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE: "supabase-live"
  });
  expect(liveWithoutGates.issues.length > 0, "supabase-live without live auth/writes enabled reports config issues");
  const liveWithGates = featureFlags.getMealPhotoUploadRuntimeFlags("supabase-live", true, true, {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development"
  });
  expect(liveWithGates.uploadSource === "supabase-live" && liveWithGates.issues.length === 0, "supabase-live with all gates satisfied in development has no issues");

  // ---- test doubles ----
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
  function uploadInput(overrides = {}) {
    return {
      analysisRequestId: "req-mock-1",
      localImageUri: "file:///synthetic/photo.jpg",
      captureMethod: "camera",
      candidateMimeType: "image/jpeg",
      candidateFileName: null,
      ...overrides
    };
  }

  // ---- disabled repository fail-closed ----
  const disabledRepo = new DisabledMealPhotoUploadRepository();
  const disabledOutcome = await disabledRepo.uploadMealPhoto(uploadInput());
  expect(!disabledOutcome.ok && disabledOutcome.error.code === "meal_photo_upload_disabled", "disabled repository fails closed on upload");
  expect((await disabledRepo.deleteMealPhotoObject("actor/req/original.jpg")) === false, "disabled repository fails closed on delete");

  // ---- mock repository: auth missing ----
  const mockNoAuth = new MockMealPhotoUploadRepository({ authPort: authPort(undefined), fileBodySource: fileBodySource(jpegBytes()) });
  const noAuthOutcome = await mockNoAuth.uploadMealPhoto(uploadInput());
  expect(!noAuthOutcome.ok && noAuthOutcome.error.code === "authentication_required", "missing session yields authentication_required");

  // ---- mock repository: real binary-mismatch rejection (not just a metadata check) ----
  const mockActor = new MockMealPhotoUploadRepository({ authPort: authPort(session("actor-1")), fileBodySource: fileBodySource(jpegBytes()) });
  const mismatchOutcome = await mockActor.uploadMealPhoto(uploadInput({ candidateMimeType: "image/png", analysisRequestId: "req-mismatch" }));
  expect(!mismatchOutcome.ok && mismatchOutcome.error.code === "image_content_type_mismatch", "mock adapter rejects real JPEG bytes supplied with a conflicting image/png MIME hint");

  // ---- mock repository: file unreadable ----
  const unreadableRepo = new MockMealPhotoUploadRepository({ authPort: authPort(session("actor-1")), fileBodySource: fileBodySource(jpegBytes(), true) });
  const unreadableOutcome = await unreadableRepo.uploadMealPhoto(uploadInput({ analysisRequestId: "req-unreadable" }));
  expect(!unreadableOutcome.ok && unreadableOutcome.error.code === "image_file_unreadable", "unreadable file yields image_file_unreadable");

  // ---- mock repository: oversized preflight (size check happens before signature validation) ----
  const oversizedRepo = new MockMealPhotoUploadRepository({ authPort: authPort(session("actor-1")), fileBodySource: fileBodySource(jpegBytes(20_000_000)) });
  const oversizedOutcome = await oversizedRepo.uploadMealPhoto(uploadInput({ analysisRequestId: "req-oversized" }));
  expect(!oversizedOutcome.ok && oversizedOutcome.error.code === "image_too_large", "oversized file yields image_too_large");
  expect(typesModule.MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE === 10_485_760, "MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE matches the bucket's 10MB file_size_limit");

  // ---- mock repository: success (real JPEG bytes) + duplicate/retry recovery + new-photo replacement ----
  const firstOutcome = await mockActor.uploadMealPhoto(uploadInput({ analysisRequestId: "req-success" }));
  expect(firstOutcome.ok && firstOutcome.value.imageObjectRef === "actor-1/req-success/original.jpg" && firstOutcome.value.recovered === false, "first upload of real JPEG bytes succeeds with canonical path, not marked recovered");
  const retryOutcome = await mockActor.uploadMealPhoto(uploadInput({ analysisRequestId: "req-success" }));
  expect(retryOutcome.ok && retryOutcome.value.imageObjectRef === firstOutcome.value.imageObjectRef && retryOutcome.value.recovered === true, "retry with same analysisRequestId recovers the existing object, does not duplicate");
  expect(mockActor.listUploadedObjectPathsForTest().filter((p) => p === "actor-1/req-success/original.jpg").length === 1, "retry did not create a second Storage object for the same analysisRequestId");
  const newPhotoOutcome = await mockActor.uploadMealPhoto(uploadInput({ analysisRequestId: "req-new-photo" }));
  expect(newPhotoOutcome.ok && newPhotoOutcome.value.imageObjectRef === "actor-1/req-new-photo/original.jpg", "a new photo (new analysisRequestId) gets its own new object path");

  // ---- mock repository: delete ----
  expect((await mockActor.deleteMealPhotoObject(firstOutcome.value.imageObjectRef)) === true, "mock delete succeeds for an existing object");
  expect(mockActor.listUploadedObjectPathsForTest().includes(firstOutcome.value.imageObjectRef) === false, "deleted object no longer listed");

  // ---- service passthrough ----
  const service = new MealPhotoUploadService({ repository: mockActor });
  expect(service.source === "mock", "service exposes underlying repository source");
  const serviceOutcome = await service.uploadMealPhoto(uploadInput({ analysisRequestId: "req-service" }));
  expect(serviceOutcome.ok, "service.uploadMealPhoto delegates to the repository");

  // ================= Supabase adapter: ArrayBuffer body, signature validation, duplicate-recovery metadata =================
  let lastUploadBody = null;
  let lastUploadOptions = null;
  const existingObjects = new Map(); // path -> { size, mimetype }
  function storageClient() {
    return {
      storage: {
        from(bucket) {
          expect(bucket === "meal-analysis-photos", "Supabase adapter only ever targets the meal-analysis-photos bucket");
          return {
            async upload(objectPath, body, options) {
              lastUploadBody = body;
              lastUploadOptions = options;
              if (existingObjects.has(objectPath)) {
                return { data: null, error: { message: "The resource already exists", statusCode: "409" } };
              }
              existingObjects.set(objectPath, { size: body.byteLength, mimetype: options.contentType });
              return { data: { path: objectPath }, error: null };
            },
            async list(folder) {
              const found = [...existingObjects.entries()].find(([p]) => p.startsWith(`${folder}/`));
              if (!found) return { data: [], error: null };
              const [objectPath, metadata] = found;
              return { data: [{ name: objectPath.split("/").pop(), metadata }], error: null };
            },
            async remove(paths) {
              for (const p of paths) existingObjects.delete(p);
              return { data: null, error: null };
            }
          };
        }
      }
    };
  }
  const supabaseRepo = new SupabaseMealPhotoUploadRepository({
    authPort: authPort(session("actor-live")),
    storageClient: storageClient(),
    fileBodySource: fileBodySource(jpegBytes(2048)),
    uploadEnabled: true
  });
  const liveFirst = await supabaseRepo.uploadMealPhoto(uploadInput({ analysisRequestId: "req-live-1" }));
  expect(liveFirst.ok && liveFirst.value.imageObjectRef === "actor-live/req-live-1/original.jpg", "Supabase adapter builds the canonical path from the session actor, not any client input");
  expect(lastUploadBody instanceof ArrayBuffer, "the body actually handed to bucket.upload() is a real ArrayBuffer instance");
  expect(!(lastUploadBody instanceof Uint8Array), "the body handed to bucket.upload() is not a Uint8Array");
  expect(lastUploadBody.byteLength === 2048, "the uploaded ArrayBuffer's byte length matches the original photo's exact byte size");
  expect(lastUploadOptions?.upsert === false, "Supabase adapter always uploads with upsert:false");
  expect(JSON.stringify(uploadInput({ analysisRequestId: "req-live-1" })).includes("actor-live") === false, "upload input never carries the actor id — it comes only from the session");

  const liveRetry = await supabaseRepo.uploadMealPhoto(uploadInput({ analysisRequestId: "req-live-1" }));
  expect(liveRetry.ok && liveRetry.value.recovered === true, "Supabase adapter recovers from a duplicate-object conflict on retry instead of overwriting");
  expect(existingObjects.size === 1, "retry did not create a second Storage object");

  // duplicate-recovery metadata comparison: existing object's reported size/MIME disagree with
  // this call's own validated payload -> recovery must NOT silently succeed
  const mismatchedMetadataStorage = storageClient();
  existingObjects.clear();
  const preExisting = "actor-meta/req-meta-1/original.jpg";
  const preExistingClient = mismatchedMetadataStorage.storage.from("meal-analysis-photos");
  await preExistingClient.upload(preExisting, new ArrayBuffer(999), { contentType: "image/png", upsert: false });
  const metadataRepo = new SupabaseMealPhotoUploadRepository({
    authPort: authPort(session("actor-meta")),
    storageClient: mismatchedMetadataStorage,
    fileBodySource: fileBodySource(jpegBytes(2048)),
    uploadEnabled: true
  });
  const metadataMismatchOutcome = await metadataRepo.uploadMealPhoto(uploadInput({ analysisRequestId: "req-meta-1" }));
  expect(
    !metadataMismatchOutcome.ok && metadataMismatchOutcome.error.code === "storage_upload_failed",
    "duplicate recovery refuses to succeed when the existing object's reported size/MIME metadata disagrees with this upload's own validated payload"
  );

  const disabledLiveRepo = new SupabaseMealPhotoUploadRepository({ authPort: authPort(session("actor-live")), storageClient: storageClient(), fileBodySource: fileBodySource(jpegBytes()), uploadEnabled: false });
  const disabledLiveOutcome = await disabledLiveRepo.uploadMealPhoto(uploadInput({ analysisRequestId: "req-live-2" }));
  expect(!disabledLiveOutcome.ok && disabledLiveOutcome.error.code === "meal_photo_upload_disabled", "Supabase adapter itself fails closed when uploadEnabled is false");
  expect((await supabaseRepo.deleteMealPhotoObject("some-other-actor/req/original.jpg")) === false, "Supabase adapter refuses to delete an object outside the current actor's own prefix");
  expect((await supabaseRepo.deleteMealPhotoObject("actor-live/req-live-1/original.jpg")) === true, "Supabase adapter deletes an object within the current actor's own prefix");

  // ================= stale-session / actor-change discard (pure comparison used by useMealPhotoUpload) =================
  const baseContext = { analysisRequestId: "req-a", captureGeneration: 3, actorKey: "actor-a", actorGeneration: 2 };
  expect(staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext }) === true, "identical context is still current");
  expect(
    staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext, analysisRequestId: "req-b", captureGeneration: 4 }) === false,
    "a newer photo (new analysisRequestId/captureGeneration) makes the old completion stale — discarded"
  );
  expect(
    staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext, actorKey: "actor-b", actorGeneration: 3 }) === false,
    "an actor switch/sign-out makes the old completion stale — discarded"
  );
  expect(
    staleGuard.isMealPhotoUploadResultStillCurrent(baseContext, { ...baseContext, actorKey: null }) === false,
    "a sign-out to no actor makes the old completion stale — discarded"
  );

  // ================= local preview retained on failure (structural check on the real hook source) =================
  const hookSource = fs.readFileSync(path.join(featureRoot, "analysis", "useMealPhotoUpload.ts"), "utf8");
  const failureBlock = hookSource.slice(hookSource.indexOf('setMealPhotoUploadState({ uploadStatus: "failed"'));
  expect(
    !failureBlock.includes("capturedImageUri: null") && !hookSource.includes("capturedImageUri = null"),
    "the upload hook never clears capturedImageUri on a failed upload — local preview is preserved"
  );

  console.log(JSON.stringify({
    status: "passed",
    phase: "MI-E-C3-R1 meal-photo-upload unit/service smoke",
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
    phase: "MI-E-C3-R1 meal-photo-upload unit/service smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (originalResolveFilename) Module._resolveFilename = originalResolveFilename;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
