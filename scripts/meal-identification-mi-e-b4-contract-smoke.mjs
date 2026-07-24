#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function loadCommonJs(relativePath, resolver) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename: path.join(root, relativePath)
  })(
    (request) => {
      const resolved = resolver ? resolver(request) : undefined;
      if (resolved !== undefined) return resolved;
      throw new Error(`MI-E-B4 smoke refused runtime dependency: ${request}`);
    },
    module,
    module.exports
  );
  return module.exports;
}

const checks = [];
function expect(condition, name) {
  if (!condition) throw new Error(`FAIL ${name}`);
  checks.push(name);
  console.log(`PASS ${name}`);
}

// ---- mealOccurrenceTime.ts: centralized future-tolerance policy ----
const occurrenceTime = loadCommonJs(
  "apps/mobile/features/analysis/mealOccurrenceTime.ts",
  () => undefined
);
const { isMealOccurrenceTooFarInFuture, maximumMealOccurrenceInstant } = occurrenceTime;

const referenceNow = new Date("2026-07-25T10:00:00.000Z");
expect(
  isMealOccurrenceTooFarInFuture(new Date(referenceNow.getTime() + 60 * 60 * 1000).toISOString(), referenceNow) === true,
  "an occurrence one hour after reference-now is rejected as too far in the future"
);
expect(
  isMealOccurrenceTooFarInFuture(new Date(referenceNow.getTime() - 60 * 60 * 1000).toISOString(), referenceNow) === false,
  "an occurrence one hour before reference-now is accepted"
);
expect(
  isMealOccurrenceTooFarInFuture(referenceNow.toISOString(), referenceNow) === false,
  "an occurrence exactly at reference-now is accepted (no false-positive at the boundary)"
);
const maxInstant = maximumMealOccurrenceInstant(referenceNow);
expect(
  maxInstant.getTime() > referenceNow.getTime() && maxInstant.getTime() - referenceNow.getTime() <= 10 * 60 * 1000,
  "maximumMealOccurrenceInstant returns a small, bounded clock-skew allowance above reference-now"
);
expect(
  isMealOccurrenceTooFarInFuture(maxInstant.toISOString(), referenceNow) === false,
  "the picker's own maximumDate boundary is itself always accepted (no off-by-one rejection)"
);

// ---- mediaCapture.ts: mocked expo-image-picker, every outcome branch ----
function buildMockImagePicker(overrides) {
  return {
    requestCameraPermissionsAsync: overrides.requestCameraPermissionsAsync ?? (async () => ({ status: "granted", granted: true, expires: "never", canAskAgain: true })),
    requestMediaLibraryPermissionsAsync: overrides.requestMediaLibraryPermissionsAsync ?? (async () => ({ status: "granted", granted: true, expires: "never", canAskAgain: true })),
    launchCameraAsync: overrides.launchCameraAsync ?? (async () => ({ canceled: false, assets: [{ uri: "file:///mock-camera.jpg" }] })),
    launchImageLibraryAsync: overrides.launchImageLibraryAsync ?? (async () => ({ canceled: false, assets: [{ uri: "file:///mock-library.jpg" }] }))
  };
}

function loadMediaCapture(mockImagePicker) {
  return loadCommonJs(
    "apps/mobile/features/analysis/mediaCapture.ts",
    (request) => (request === "expo-image-picker" ? mockImagePicker : undefined)
  );
}

// 1. camera: permission granted, photo captured
{
  const { captureMealPhotoFromCamera } = loadMediaCapture(buildMockImagePicker({}));
  const outcome = await captureMealPhotoFromCamera();
  expect(outcome.status === "captured" && outcome.uri === "file:///mock-camera.jpg" && typeof outcome.capturedAt === "string",
    "camera: granted + photo taken produces a captured outcome with uri and ISO capturedAt");
}

// 2. camera: user cancels the native capture screen
{
  const { captureMealPhotoFromCamera } = loadMediaCapture(buildMockImagePicker({
    launchCameraAsync: async () => ({ canceled: true, assets: null })
  }));
  const outcome = await captureMealPhotoFromCamera();
  expect(outcome.status === "canceled", "camera: user cancellation produces a canceled outcome, not an error");
}

// 3. camera: permission denied, can ask again
{
  const { captureMealPhotoFromCamera } = loadMediaCapture(buildMockImagePicker({
    requestCameraPermissionsAsync: async () => ({ status: "denied", granted: false, expires: "never", canAskAgain: true })
  }));
  const outcome = await captureMealPhotoFromCamera();
  expect(outcome.status === "permission_denied" && outcome.canAskAgain === true,
    "camera: permission denied with canAskAgain=true is reported as such (no crash)");
}

// 4. camera: permission permanently denied
{
  const { captureMealPhotoFromCamera } = loadMediaCapture(buildMockImagePicker({
    requestCameraPermissionsAsync: async () => ({ status: "denied", granted: false, expires: "never", canAskAgain: false })
  }));
  const outcome = await captureMealPhotoFromCamera();
  expect(outcome.status === "permission_denied" && outcome.canAskAgain === false,
    "camera: permanently denied permission (canAskAgain=false) is reported as such, directing to Settings");
}

// 5. camera: native call throws — never propagates, never crashes the caller
{
  const { captureMealPhotoFromCamera } = loadMediaCapture(buildMockImagePicker({
    launchCameraAsync: async () => { throw new Error("native module exploded"); }
  }));
  const outcome = await captureMealPhotoFromCamera();
  expect(outcome.status === "unavailable", "camera: a thrown native error becomes a typed unavailable outcome, not an exception");
}

// 6. gallery: permission granted, photo picked
{
  const { pickMealPhotoFromLibrary } = loadMediaCapture(buildMockImagePicker({}));
  const outcome = await pickMealPhotoFromLibrary();
  expect(outcome.status === "captured" && outcome.uri === "file:///mock-library.jpg",
    "gallery: granted + photo picked produces a captured outcome with the real uri");
}

// 7. gallery: user cancels the picker
{
  const { pickMealPhotoFromLibrary } = loadMediaCapture(buildMockImagePicker({
    launchImageLibraryAsync: async () => ({ canceled: true, assets: null })
  }));
  const outcome = await pickMealPhotoFromLibrary();
  expect(outcome.status === "canceled", "gallery: user cancellation produces a canceled outcome, not an error");
}

// 8. gallery: permission denied
{
  const { pickMealPhotoFromLibrary } = loadMediaCapture(buildMockImagePicker({
    requestMediaLibraryPermissionsAsync: async () => ({ status: "denied", granted: false, expires: "never", canAskAgain: true })
  }));
  const outcome = await pickMealPhotoFromLibrary();
  expect(outcome.status === "permission_denied" && outcome.canAskAgain === true,
    "gallery: permission denied is reported as a typed outcome");
}

// 9. malformed success result (no assets) never crashes
{
  const { pickMealPhotoFromLibrary } = loadMediaCapture(buildMockImagePicker({
    launchImageLibraryAsync: async () => ({ canceled: false, assets: [] })
  }));
  const outcome = await pickMealPhotoFromLibrary();
  expect(outcome.status === "unavailable", "gallery: a malformed success result with no assets fails closed as unavailable, not a crash");
}

console.log(`RESULT ${checks.length}/${checks.length} PASS`);
