#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const check = (name, condition) => checks.push({ name, pass: Boolean(condition) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });

function namedFunctionBody(source, name) {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let result = null;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) result = node.body.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

const normalizationPath = "apps/mobile/features/analysis/galleryMealPhotoAssetNormalization.ts";
const mediaCapturePath = "apps/mobile/features/analysis/mediaCapture.ts";
const mealPhotoPath = "apps/mobile/app/meal-photo.tsx";
const i18nPath = "lib/i18n/zh-TW.ts";
const normalization = read(normalizationPath);
const mediaCapture = read(mediaCapturePath);
const mealPhoto = read(mealPhotoPath);
const i18n = read(i18nPath);
const mobilePackage = JSON.parse(read("apps/mobile/package.json"));
const rootPackage = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const cameraBody = namedFunctionBody(mediaCapture, "captureMealPhotoFromCamera");
const galleryBody = namedFunctionBody(mediaCapture, "pickMealPhotoFromLibrary");
const frozenCameraSource = git(["show", "HEAD:" + mediaCapturePath]);
const frozenCameraBody = frozenCameraSource.status === 0
  ? namedFunctionBody(frozenCameraSource.stdout, "captureMealPhotoFromCamera")
  : null;

check("official Expo SDK 54 image manipulator is the only new transcode dependency", mobilePackage.dependencies?.["expo-image-manipulator"] === "~14.0.8" && !mobilePackage.dependencies?.["react-native-image-resizer"] && !mobilePackage.dependencies?.["react-native-image-crop-picker"]);
check("lockfile pins expo-image-manipulator 14.0.8 with integrity", lock.packages?.["apps/mobile/node_modules/expo-image-manipulator"]?.version === "14.0.8" && Boolean(lock.packages?.["apps/mobile/node_modules/expo-image-manipulator"]?.integrity));
check("root package exposes the exact R4 guard and smoke entry points", rootPackage.scripts?.["test:consumer-mi-e-c5-r4"] === "node scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs" && rootPackage.scripts?.["test:consumer-mi-e-c5-r4-smoke"] === "node scripts/meal-photo-gallery-mi-e-c5-r4-smoke.mjs");

check("normalization uses the existing binary signature and shared byte ceiling authorities", /detectImageSignature/.test(normalization) && /MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE/.test(normalization) && !/mimeType\?\..*includes|fileName\?\..*endsWith/.test(normalization));
check("normalization error vocabulary is complete and gallery-specific", ["gallery_asset_unavailable", "gallery_asset_unsupported", "gallery_asset_materialization_failed", "gallery_asset_normalization_failed", "gallery_asset_too_large"].every((code) => normalization.includes(`\"${code}\"`)));
check("normalized success vocabulary excludes HEIC and includes only JPEG PNG WEBP", /mimeType:\s*"image\/jpeg" \| "image\/png" \| "image\/webp";/.test(normalization) && !/NormalizedGalleryMealPhotoAsset[\s\S]{0,300}"image\/heic"/.test(normalization));
check("JPEG PNG WEBP return the original readable URI before the HEIC-only transcode block", normalization.indexOf("if (sourceFormat.mimeType !== \"image/heic\")") !== -1 && normalization.indexOf("uri: asset.uri") < normalization.indexOf("transcodeToJpeg(asset.uri)"));
check("HEIC/HEIF invokes one official JPEG render with explicit quality", /manipulateAsync\(uri, \[\], \{ compress: 0\.9, format: SaveFormat\.JPEG \}\)/.test(normalization) && (normalization.match(/transcodeToJpeg\(asset\.uri\)/g) ?? []).length === 1);
check("source and normalized output are both checked against the canonical 10 MiB ceiling", (normalization.match(/> MEAL_PHOTO_UPLOAD_MAX_BYTE_SIZE/g) ?? []).length >= 3);
check("transcoded bytes are re-read and must have a real JPEG signature", /outputBytes = await dependencies\.readBytes\(rendered\.uri\)/.test(normalization) && /detectImageSignature\(outputBytes\)/.test(normalization) && /outputFormat\?\.mimeType !== "image\/jpeg"/.test(normalization));
check("transcoded output must be distinct, app-private cache, and dimensionally usable", /rendered\.uri !== asset\.uri/.test(normalization) && /isInsideCacheDirectory\(rendered\.uri, dependencies\.cacheDirectoryUri\)/.test(normalization) && /isUsableDimension\(rendered\.width\)/.test(normalization) && /isUsableDimension\(rendered\.height\)/.test(normalization));
check("native manipulator fixes orientation before save according to installed SDK source", read("apps/mobile/node_modules/expo-image-manipulator/ios/ImageManipulatorModule.swift").includes("ImageFixOrientationTransformer") && read("apps/mobile/node_modules/expo-image-manipulator/ios/Transformers/ImageFixOrientationTransformer.swift").includes("original pixel data matches the displayed orientation"));
check("privacy-safe canonical filename extension comes only from detected/rendered format", /canonicalFileName\(passthroughExtension\)/.test(normalization) && /canonicalFileName\("jpg"\)/.test(normalization) && !/canonicalFileName\(asset\.fileName/.test(normalization));
check("cleanup owns only generated output and never registers the picker source", /ownedNormalizedAsset = \{ uri: rendered\.uri/.test(normalization) && !/ownedNormalizedAsset = \{ uri: asset\.uri/.test(normalization));
check("normalization uses no weak temporary naming and emits no photo bytes paths or base64 diagnostics", !/Math\.random|console\.|base64/i.test(normalization));
check("failed distinct outputs are best-effort deleted without ever deleting same-as-source output", /if \(rendered\.uri !== asset\.uri\) await bestEffortDelete\(rendered\.uri, dependencies\)/.test(normalization));
check("replacement selection releases prior owned cache before acquiring another gallery asset", galleryBody?.includes("await releaseOwnedGalleryMealPhotoAsset()") && normalization.includes("await releaseOwnedGalleryMealPhotoAsset();"));
check("new session retake and durable finalization all release owned cache without blocking navigation", /function startAiAnalysis\(\)[\s\S]{0,220}void releaseOwnedGalleryMealPhotoAsset\(\)/.test(mealPhoto) && (mealPhoto.match(/void releaseOwnedGalleryMealPhotoAsset\(\);/g) ?? []).length === 2 && /function retakeMealPhoto\(\)[\s\S]{0,350}void releaseOwnedGalleryMealPhotoAsset\(\)/.test(read("apps/mobile/app/analysis.tsx")) && (read("apps/mobile/app/analysis.tsx").match(/void releaseOwnedGalleryMealPhotoAsset\(\);/g) ?? []).length === 3);

check("camera function remains text-identical to the frozen R3-A authority", Boolean(cameraBody) && cameraBody === frozenCameraBody);
check("camera function cannot call gallery normalization or cleanup", Boolean(cameraBody) && !/normalizeGallery|releaseOwnedGallery/.test(cameraBody));
check("gallery function alone calls the canonical normalizer and returns its URI MIME and filename", Boolean(galleryBody) && /normalizeGalleryMealPhotoAsset\(asset\)/.test(galleryBody) && /uri: normalized\.value\.uri/.test(galleryBody) && /mimeType: normalized\.value\.mimeType/.test(galleryBody) && /fileName: normalized\.value\.fileName/.test(galleryBody));
check("picker remains single-image-only and excludes Live Photo paired-video authority", /mediaTypes:\s*\["images"\]/.test(mediaCapture) && !/mediaTypes:\s*\[[^\]]*"livePhotos"/.test(mediaCapture) && !/pairedVideoAsset/.test(mediaCapture));
check("gallery picker/native exceptions map to materialization failure without returning exception text", Boolean(galleryBody) && /errorCode: "gallery_asset_materialization_failed"/.test(galleryBody) && !/error\.message|String\(error/.test(galleryBody));
check("meal-photo UI maps gallery errors through dedicated safe localized copy", /outcome\.status === "gallery_error"/.test(mealPhoto) && /galleryAssetErrors\[errorCode\]/.test(mealPhoto));
check("all five safe gallery errors have title/body copy", ["gallery_asset_unavailable", "gallery_asset_unsupported", "gallery_asset_materialization_failed", "gallery_asset_normalization_failed", "gallery_asset_too_large"].every((code) => new RegExp(`${code}:\\s*\\{\\s*title:\\s*\"[^\"]+\",\\s*body:\\s*\"[^\"]+\"`).test(i18n)));
check("normalized capture still enters the one existing session/finalization route", /startRealAnalysis\(method, outcome\.uri, new Date\(outcome\.capturedAt\), outcome\.mimeType, outcome\.fileName\)/.test(mealPhoto) && /beginAnalysisCapture\(method, imageUri, capturedAt, mimeType, fileName\)/.test(mealPhoto));
check("R3-A secure UUID authority remains wired into its three frozen runtime consumers", ["consumerMealIdentificationFinalizationRuntime.ts", "consumerMealWriteRuntime.ts", "consumerPlannedMealRuntime.ts"].every((file) => /generateSecureUuidV4\(\)/.test(read(`apps/mobile/features/consumer-runtime/${file}`))));
check("upload and analysis failures remain distinct downstream UI states", /setMealPhotoUploadState\(\{ uploadStatus: "failed"/.test(read("apps/mobile/features/analysis/useMealPhotoUpload.ts")) && /setMealPhotoAnalysisState\(\{ analysisInvocationStatus: "failed"/.test(read("apps/mobile/features/analysis/useMealPhotoAnalysis.ts")));
check("R3 guard is successor-compatible but still forbids competing transcode libraries", /successor-compatible transcode authority/.test(read("scripts/consumer-runtime-mi-e-c5-r3-guard.mjs")) && /react-native-image-resizer/.test(read("scripts/consumer-runtime-mi-e-c5-r3-guard.mjs")));

const backendDiff = git(["diff", "--name-only", "--", "supabase/migrations", "supabase/functions"]);
check("no migration RPC Edge Function or other Supabase implementation changed", backendDiff.status === 0 && backendDiff.stdout.trim() === "");
const frozenContractDiff = git(["diff", "--name-only", "--", "apps/mobile/features/meal-identification-finalization", "packages/shared/src/domain/meal-identification-finalization"]);
check("B1/B2 frozen finalization implementation and shared schema remain untouched", frozenContractDiff.status === 0 && frozenContractDiff.stdout.trim() === "");
const promptDiff = git(["diff", "--name-only", "--", "supabase/functions/meal-photo-analysis", "packages/shared/src/domain/meal-photo-analysis"]);
check("AI prompt provider payload and analysis schema remain untouched", promptDiff.status === 0 && promptDiff.stdout.trim() === "");
const staged = git(["diff", "--cached", "--name-only"]);
check("nothing is staged", staged.status === 0 && staged.stdout.trim() === "");
const candidateDiff = git(["diff", "--", normalizationPath, mediaCapturePath, mealPhotoPath, i18nPath]);
check("candidate source and comments make no physical iOS gallery PASS claim", candidateDiff.status === 0 && !/physical[^\n]{0,40}(gallery[^\n]{0,20})?PASS/i.test(candidateDiff.stdout));

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  phase: "MI-E-C5-R4 Gallery Asset Normalization Guard",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  physicalDeviceUsed: false
}, null, 2));
if (failed.length) process.exitCode = 1;
