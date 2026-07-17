import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const ratingRoot = path.join(root, "apps", "mobile", "features", "consumer-ratings");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-ratings-phase2w-a-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function pass(name) {
  checks.push({ name, pass: true });
}

function fail(name, message) {
  checks.push({ name, pass: false, message });
  throw new Error(`${name}: ${message}`);
}

function expect(condition, name, message) {
  if (!condition) fail(name, message);
  pass(name);
}

try {
  const tsFiles = collectTsFiles(ratingRoot);
  const program = ts.createProgram(tsFiles, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir: compiledRoot,
    rootDir: featureRoot
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  if (diagnostics.length) {
    fail("Phase 2W-A TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));
  }
  pass("Phase 2W-A TypeScript contract compilation");

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-ratings", "index.js"));
  const rating = requireFromTemp("./index.js");
  const mockModule = requireFromTemp("./adapters/mockConsumerRatingRepository.js");

  const signedInAuth = { source: "mock", async getCurrentSession() { return { ok: true, value: { provider: "mock" } }; } };
  const signedOutAuth = { source: "mock", async getCurrentSession() { return { ok: true, value: null }; } };

  const defaultFlags = rating.getConsumerRatingRuntimeFlags({});
  expect(defaultFlags.readSource === "mock", "default read source is mock", `Got ${defaultFlags.readSource}`);
  expect(defaultFlags.writeSource === "disabled", "default write source is disabled", `Got ${defaultFlags.writeSource}`);
  expect(defaultFlags.issues.length === 0, "default source configuration has no issues", "Default flags must be valid.");

  const defaultRuntime = rating.createConsumerRatingRuntime({ authPort: signedInAuth, flags: defaultFlags });
  expect(defaultRuntime.readRepository.readSource === "mock", "factory selects mock read repository", "Read repository source mismatch.");
  expect(defaultRuntime.writeRepository.writeSource === "disabled", "factory selects disabled write repository", "Write repository source mismatch.");

  const restaurantRead = await defaultRuntime.service.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "restaurant-haochu-bowl" });
  expect(restaurantRead.status === "available" && restaurantRead.record.target.kind === "restaurant", "mock restaurant rating read", `Got ${restaurantRead.status}`);

  const menuRead = await defaultRuntime.service.getCurrentUserMenuItemRating({ kind: "menu_item", menuItemId: "dish-haochu-1" });
  expect(menuRead.status === "available" && menuRead.record.target.kind === "menu_item", "mock menu-item rating read", `Got ${menuRead.status}`);

  const missing = await defaultRuntime.service.getCurrentUserMenuItemRating({ kind: "menu_item", menuItemId: "missing-menu-item" });
  expect(missing.status === "missing", "missing rating returns typed missing result", `Got ${missing.status}`);

  const listOne = await defaultRuntime.service.listCurrentUserRatings();
  const listTwo = await defaultRuntime.service.listCurrentUserRatings();
  expect(listOne.status === "available" && listTwo.status === "available", "mock list is available", "List result unavailable.");
  expect(JSON.stringify(listOne.records) === JSON.stringify(listTwo.records), "mock list and lookup are deterministic", "Repeated list changed.");

  const mockWriteFlags = { readSource: "mock", writeSource: "mock", issues: [] };
  const fixedTime = "2026-07-18T01:02:03.000Z";
  const writeRuntime = rating.createConsumerRatingRuntime({ authPort: signedInAuth, flags: mockWriteFlags, clock: () => fixedTime });
  const replaced = await writeRuntime.service.createOrReplaceCurrentUserRating({
    target: { kind: "restaurant", restaurantId: "restaurant-haochu-bowl", mealRecordId: "meal-record-haochu-lunch" },
    ratingValue: 5,
    repurchaseIntent: "yes"
  });
  expect(replaced.status === "replaced" && replaced.record.ratingValue === 5, "mock current-row replace", `Got ${replaced.status}`);
  const replacementRead = await writeRuntime.service.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "restaurant-haochu-bowl" });
  expect(replacementRead.status === "available" && replacementRead.record.ratingValue === 5, "replacement becomes the single current rating", "Replacement was not readable.");
  const history = writeRuntime.readRepository.getHistoryForContract?.({ kind: "restaurant", restaurantId: "restaurant-haochu-bowl" }) ?? [];
  expect(history.length === 2 && history.filter((record) => record.isCurrent).length === 1, "replacement preserves history with one current row", `History size/current mismatch: ${history.length}`);

  const sharedTargetFixtures = [
    {
      ratingId: "fixture-restaurant-shared",
      target: { kind: "restaurant", restaurantId: "shared-target" },
      ratingValue: 3,
      visibility: "private",
      isCurrent: true,
      tasteFeeling: null,
      portionFeeling: null,
      priceFeeling: null,
      repurchaseIntent: null,
      ratedAt: fixedTime,
      updatedAt: fixedTime
    },
    {
      ratingId: "fixture-menu-shared",
      target: { kind: "menu_item", restaurantId: "restaurant-shared", menuItemId: "shared-target" },
      ratingValue: 4,
      visibility: "private",
      isCurrent: true,
      tasteFeeling: null,
      portionFeeling: null,
      priceFeeling: null,
      repurchaseIntent: null,
      finished: null,
      dislikeReasons: [],
      ratedAt: fixedTime,
      updatedAt: fixedTime
    }
  ];
  const isolatedRepository = new mockModule.MockConsumerRatingRepository({ fixtures: sharedTargetFixtures });
  const isolatedRestaurant = await isolatedRepository.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "shared-target" });
  const isolatedMenu = await isolatedRepository.getCurrentUserMenuItemRating({ kind: "menu_item", menuItemId: "shared-target" });
  expect(isolatedRestaurant.status === "available" && isolatedRestaurant.record.ratingValue === 3, "restaurant target remains isolated", "Restaurant lookup crossed target namespace.");
  expect(isolatedMenu.status === "available" && isolatedMenu.record.ratingValue === 4, "menu-item target remains isolated", "Menu lookup crossed target namespace.");

  for (const value of [-0.1, 5.1, Number.NaN]) {
    const invalid = await writeRuntime.service.createOrReplaceCurrentUserRating({
      target: { kind: "restaurant", restaurantId: "restaurant-invalid" },
      ratingValue: value
    });
    expect(invalid.status === "invalid_input" && invalid.error.code === "rating_value_invalid", `invalid rating value fails closed: ${String(value)}`, `Got ${invalid.status}`);
  }

  const ownershipAttempt = await writeRuntime.service.createOrReplaceCurrentUserRating({
    target: { kind: "restaurant", restaurantId: "restaurant-haochu-bowl" },
    ratingValue: 4,
    userId: "arbitrary-user"
  });
  expect(ownershipAttempt.status === "invalid_input" && ownershipAttempt.error.code === "rating_ownership_field_rejected", "arbitrary ownership field is rejected", `Got ${ownershipAttempt.status}`);

  const disabledRuntime = rating.createConsumerRatingRuntime({
    authPort: signedInAuth,
    flags: { readSource: "disabled", writeSource: "disabled", issues: [] }
  });
  const disabledRead = await disabledRuntime.service.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "restaurant-haochu-bowl" });
  const disabledWrite = await disabledRuntime.service.createOrReplaceCurrentUserRating({
    target: { kind: "restaurant", restaurantId: "restaurant-haochu-bowl" },
    ratingValue: 4
  });
  expect(disabledRead.status === "disabled" && disabledRead.error instanceof rating.ConsumerRatingRuntimeError, "disabled read returns typed error", `Got ${disabledRead.status}`);
  expect(disabledWrite.status === "disabled" && disabledWrite.error instanceof rating.ConsumerRatingRuntimeError, "disabled write returns typed error", `Got ${disabledWrite.status}`);

  const invalidFlags = rating.getConsumerRatingRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE: "unexpected",
    EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_WRITE_SOURCE: "unexpected"
  });
  expect(invalidFlags.readSource === "disabled" && invalidFlags.writeSource === "disabled" && invalidFlags.issues.length === 2, "invalid sources fail closed", "Invalid flags did not become disabled issues.");
  let invalidFactoryError = null;
  try { rating.createConsumerRatingRepositories(invalidFlags); } catch (error) { invalidFactoryError = error; }
  expect(invalidFactoryError instanceof rating.ConsumerRatingConfigurationInvalidError, "invalid source never silently falls back to mock", "Factory did not reject invalid flags.");

  const unauthenticatedRuntime = rating.createConsumerRatingRuntime({ authPort: signedOutAuth, flags: defaultFlags });
  const unauthenticated = await unauthenticatedRuntime.service.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "restaurant-haochu-bowl" });
  expect(unauthenticated.status === "unauthenticated" && unauthenticated.error.code === "rating_authentication_required", "service enforces current authenticated session", `Got ${unauthenticated.status}`);

  let missingAuthError = null;
  try { rating.createConsumerRatingRuntime({ flags: defaultFlags }); } catch (error) { missingAuthError = error; }
  expect(missingAuthError instanceof rating.ConsumerRatingConfigurationInvalidError, "factory requires explicit auth boundary", "Missing auth dependency did not fail closed.");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Phase 2W-A Ratings Contract Smoke",
    checks,
    networkRequestUsed: false,
    credentialsUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    migrationCreated: false,
    n4Executed: false,
    productionTouched: false,
    phase2WBStarted: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2W-A Ratings Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    networkRequestUsed: false,
    credentialsUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    rpcInvoked: false,
    migrationCreated: false,
    n4Executed: false,
    productionTouched: false,
    phase2WBStarted: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
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
