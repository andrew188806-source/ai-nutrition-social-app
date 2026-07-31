#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const expect = (condition, name) => {
  if (!condition) throw new Error(`R4 smoke assertion failed: ${name}`);
  checks.push({ name, pass: true });
};

function transpile(relativePath) {
  const absolute = path.join(root, relativePath);
  return {
    absolute,
    output: ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: absolute
    }).outputText
  };
}

function executeCommonJs(relativePath, localRequire) {
  const { absolute, output } = transpile(relativePath);
  const mod = { exports: {} };
  const wrapper = vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute });
  wrapper(localRequire, mod, mod.exports);
  return mod.exports;
}

const signature = executeCommonJs(
  "packages/shared/src/domain/meal-photo-analysis/binarySignature.ts",
  (request) => { throw new Error(`Binary signature smoke refused unexpected require: ${request}`); }
);
const MAX_BYTES = Number(
  fs.readFileSync(path.join(root, "packages/shared/src/domain/meal-photo-analysis/types.ts"), "utf8")
    .match(/MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE\s*=\s*([\d_]+)/)?.[1]
    ?.replaceAll("_", "")
);
expect(MAX_BYTES === 10_485_760, "smoke reads the real shared 10 MiB upload authority");

function loadNormalizer() {
  return executeCommonJs(
    "apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts",
    (request) => {
      if (request === "expo-file-system") {
        return { File: class {}, Paths: { cache: { uri: "file:///native-cache/" } } };
      }
      if (request === "expo-image-manipulator") {
        return { manipulateAsync: async () => { throw new Error("native adapter must be injected in smoke"); }, SaveFormat: { JPEG: "jpeg" } };
      }
      if (request === "@haocu/shared") {
        return { detectImageSignature: signature.detectImageSignature, MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE: MAX_BYTES };
      }
      throw new Error(`Normalizer smoke refused unexpected require: ${request}`);
    }
  );
}

const jpeg = (...tail) => Uint8Array.from([0xff, 0xd8, 0xff, ...tail]);
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = () => Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const heif = (brand) => Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...Buffer.from(brand)]);
const baseAsset = { uri: "file:///picker/source", width: 4032, height: 3024, fileSize: 12 };

function dependencies({ files, transcode, deleteFile = async () => {} }) {
  return {
    cacheDirectoryUri: "file:///app-cache/",
    async readBytes(uri) {
      const value = files.get(uri);
      if (value instanceof Error || value === undefined) throw value ?? new Error("missing");
      return value;
    },
    transcodeToJpeg: transcode ?? (async () => { throw new Error("unexpected transcode"); }),
    deleteFile
  };
}

for (const [label, bytes, mimeType, extension] of [
  ["JPEG", jpeg(1), "image/jpeg", "jpg"],
  ["PNG", png(), "image/png", "png"],
  ["WEBP", webp(), "image/webp", "webp"]
]) {
  const normalizer = loadNormalizer();
  let transcodeCalls = 0;
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    { ...baseAsset, mimeType: null, fileName: null },
    dependencies({
      files: new Map([[baseAsset.uri, bytes]]),
      transcode: async () => { transcodeCalls += 1; throw new Error("passthrough must not transcode"); }
    })
  );
  expect(result.ok && result.value.uri === baseAsset.uri, `gallery ${label} keeps the readable picker URI`);
  expect(result.ok && result.value.mimeType === mimeType && result.value.fileName === `meal-photo.${extension}`, `gallery ${label} derives MIME and missing filename from bytes`);
  expect(result.ok && result.value.width === 4032 && result.value.height === 3024 && !result.value.wasNormalized, `gallery ${label} preserves dimensions and is marked passthrough`);
  expect(transcodeCalls === 0, `gallery ${label} never invokes the HEIC transcode path`);
}

{
  const normalizer = loadNormalizer();
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    { ...baseAsset, mimeType: null, fileName: "library-photo.jpeg" },
    dependencies({ files: new Map([[baseAsset.uri, jpeg(7)]]) })
  );
  expect(result.ok && result.value.mimeType === "image/jpeg" && result.value.fileName === "meal-photo.jpg", "missing MIME with a valid filename still uses verified bytes and privacy-safe canonical filename");
}

{
  const normalizer = loadNormalizer();
  const outputUri = "file:///app-cache/rendered.jpg";
  const deleted = [];
  let receivedUri = null;
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    { ...baseAsset, mimeType: "image/heif", fileName: "portrait.HEIF" },
    dependencies({
      files: new Map([[baseAsset.uri, heif("mif1")], [outputUri, jpeg(4, 5, 6)]]),
      transcode: async (uri) => {
        receivedUri = uri;
        return { uri: outputUri, width: 3024, height: 4032 };
      },
      deleteFile: async (uri) => { deleted.push(uri); }
    })
  );
  expect(receivedUri === baseAsset.uri, "HEIF normalization decodes the actual materialized source URI");
  expect(result.ok && result.value.uri === outputUri && result.value.wasNormalized, "HEIF is normalized to a distinct app-cache asset");
  expect(result.ok && result.value.mimeType === "image/jpeg" && result.value.fileName === "meal-photo.jpg", "HEIF output metadata matches verified JPEG bytes without retaining photo-library metadata");
  expect(result.ok && result.value.width === 3024 && result.value.height === 4032, "HEIF output uses renderer dimensions after orientation normalization");
  expect(!deleted.includes(baseAsset.uri), "HEIF normalization never deletes or modifies the original picker asset");
}

{
  const normalizer = loadNormalizer();
  const deleted = [];
  let renderCounter = 0;
  const files = new Map([
    ["file:///picker/a.heic", heif("heic")],
    ["file:///picker/b.heic", heif("msf1")],
    ["file:///app-cache/a.jpg", jpeg(1)],
    ["file:///app-cache/b.jpg", jpeg(2)]
  ]);
  const deps = dependencies({
    files,
    transcode: async () => {
      renderCounter += 1;
      return { uri: `file:///app-cache/${renderCounter === 1 ? "a" : "b"}.jpg`, width: 1200, height: 900 };
    },
    deleteFile: async (uri) => { deleted.push(uri); }
  });
  const first = await normalizer.normalizeGalleryMealPhotoAsset({ ...baseAsset, uri: "file:///picker/a.heic" }, deps);
  const second = await normalizer.normalizeGalleryMealPhotoAsset({ ...baseAsset, uri: "file:///picker/b.heic" }, deps);
  expect(first.ok && first.value.mimeType === "image/jpeg" && second.ok && second.value.mimeType === "image/jpeg", "HEIC and generic HEIF brands both normalize to verified JPEG assets");
  expect(first.ok && second.ok && deleted.includes("file:///app-cache/a.jpg"), "a replacement normalization best-effort deletes the prior owned cache file");
  expect(!deleted.some((uri) => uri.startsWith("file:///picker/")), "bounded cleanup never targets either original asset");
  await normalizer.releaseOwnedGalleryMealPhotoAsset();
  expect(deleted.includes("file:///app-cache/b.jpg"), "explicit release cleans the current owned cache file");
}

for (const [name, asset, files, expected] of [
  ["missing URI", { ...baseAsset, uri: "" }, new Map(), "gallery_asset_unavailable"],
  ["missing dimensions", { ...baseAsset, width: 0 }, new Map(), "gallery_asset_unavailable"],
  ["unreadable/iCloud source", baseAsset, new Map([[baseAsset.uri, new Error("not materialized")]]), "gallery_asset_materialization_failed"],
  ["unsupported bytes", baseAsset, new Map([[baseAsset.uri, Uint8Array.from([1, 2, 3])]]), "gallery_asset_unsupported"]
]) {
  const normalizer = loadNormalizer();
  const result = await normalizer.normalizeGalleryMealPhotoAsset(asset, dependencies({ files }));
  expect(!result.ok && result.errorCode === expected, `${name} fails closed with ${expected}`);
}

{
  const normalizer = loadNormalizer();
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    { ...baseAsset, fileSize: MAX_BYTES + 1 },
    dependencies({ files: new Map([[baseAsset.uri, jpeg()]]) })
  );
  expect(!result.ok && result.errorCode === "gallery_asset_too_large", "reported oversize asset is rejected before materialization");
}

{
  const normalizer = loadNormalizer();
  const oversized = new Uint8Array(MAX_BYTES + 1);
  oversized.set(jpeg());
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    { ...baseAsset, fileSize: undefined },
    dependencies({ files: new Map([[baseAsset.uri, oversized]]) })
  );
  expect(!result.ok && result.errorCode === "gallery_asset_too_large", "actual oversize bytes are rejected when picker size metadata is missing");
}

for (const [name, transcode, outputUri, outputBytes, expectedDelete] of [
  ["transcode exception", async () => { throw new Error("decode failed"); }, null, null, null],
  ["non-cache output", async () => ({ uri: "file:///outside/output.jpg", width: 1, height: 1 }), "file:///outside/output.jpg", jpeg(), "file:///outside/output.jpg"],
  ["same-as-original output", async () => ({ uri: baseAsset.uri, width: 1, height: 1 }), baseAsset.uri, null, null],
  ["invalid output dimensions", async () => ({ uri: "file:///app-cache/bad.jpg", width: 0, height: 1 }), "file:///app-cache/bad.jpg", jpeg(), "file:///app-cache/bad.jpg"],
  ["non-JPEG output bytes", async () => ({ uri: "file:///app-cache/bad.jpg", width: 1, height: 1 }), "file:///app-cache/bad.jpg", png(), "file:///app-cache/bad.jpg"]
]) {
  const normalizer = loadNormalizer();
  const deleted = [];
  const files = new Map([[baseAsset.uri, heif("heic")]]);
  if (outputUri && outputBytes) files.set(outputUri, outputBytes);
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    baseAsset,
    dependencies({ files, transcode, deleteFile: async (uri) => { deleted.push(uri); } })
  );
  expect(!result.ok && result.errorCode === "gallery_asset_normalization_failed", `${name} maps to the safe normalization failure`);
  expect(expectedDelete === null ? !deleted.includes(baseAsset.uri) : deleted.includes(expectedDelete), `${name} cleanup is limited to a distinct generated output`);
}

{
  const normalizer = loadNormalizer();
  const outputUri = "file:///app-cache/large.jpg";
  const largeJpeg = new Uint8Array(MAX_BYTES + 1);
  largeJpeg.set(jpeg());
  const deleted = [];
  const result = await normalizer.normalizeGalleryMealPhotoAsset(
    baseAsset,
    dependencies({
      files: new Map([[baseAsset.uri, heif("heic")], [outputUri, largeJpeg]]),
      transcode: async () => ({ uri: outputUri, width: 800, height: 600 }),
      deleteFile: async (uri) => { deleted.push(uri); }
    })
  );
  expect(!result.ok && result.errorCode === "gallery_asset_too_large", "oversize normalized JPEG fails with the distinct size error");
  expect(deleted.includes(outputUri) && !deleted.includes(baseAsset.uri), "oversize generated output is cleaned without touching the original");
}

{
  let normalizationCalls = 0;
  const picker = {
    requestCameraPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    requestMediaLibraryPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
    launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: "file:///camera.jpg", width: 10, height: 20, mimeType: "image/jpeg", fileName: "camera.jpg" }] }),
    launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: "file:///gallery.heic", width: 20, height: 10, mimeType: "image/heic", fileName: "gallery.heic" }] })
  };
  const media = executeCommonJs("apps/mobile/features/analysis/mediaCapture.ts", (request) => {
    if (request === "expo-image-picker") return picker;
    if (request === "./galleryMealPhotoAssetNormalization") {
      return {
        releaseOwnedGalleryMealPhotoAsset: async () => {},
        normalizeGalleryMealPhotoAsset: async () => {
          normalizationCalls += 1;
          return { ok: true, value: { uri: "file:///app-cache/gallery.jpg", mimeType: "image/jpeg", fileName: "gallery.jpg" } };
        }
      };
    }
    throw new Error(`MediaCapture smoke refused unexpected require: ${request}`);
  });
  const camera = await media.captureMealPhotoFromCamera();
  expect(camera.status === "captured" && camera.uri === "file:///camera.jpg" && normalizationCalls === 0, "camera JPEG path remains byte-for-byte outside gallery normalization");
  const gallery = await media.pickMealPhotoFromLibrary();
  expect(gallery.status === "captured" && gallery.uri === "file:///app-cache/gallery.jpg" && gallery.mimeType === "image/jpeg", "gallery capture hands the normalized JPEG URI and metadata to the existing session/upload path");
  expect(normalizationCalls === 1, "gallery capture invokes exactly one canonical normalization boundary");
  picker.launchImageLibraryAsync = async () => { throw new Error("iCloud representation unavailable"); };
  const failed = await media.pickMealPhotoFromLibrary();
  expect(failed.status === "gallery_error" && failed.errorCode === "gallery_asset_materialization_failed", "picker/iCloud materialization exception is safely classified without raw exception text");
}


{
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
  try {
    const provider = executeCommonJs("apps/mobile/features/consumer-runtime/secureUuidProvider.ts", (request) => {
      if (request === "expo-crypto") return { randomUUID: () => "44444444-4444-4444-8444-444444444444" };
      throw new Error(`UUID smoke refused unexpected require: ${request}`);
    });
    expect(provider.generateSecureUuidV4() === "44444444-4444-4444-8444-444444444444", "R3-A secure UUID provider remains executable for its frozen runtime request identities under Hermes");
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, "crypto", originalDescriptor);
    else delete globalThis.crypto;
  }
}

console.log(JSON.stringify({
  phase: "MI-E-C5-R4 Gallery Asset Normalization Smoke",
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
