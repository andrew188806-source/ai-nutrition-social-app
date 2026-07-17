import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const ratingRoot = path.join(featureRoot, "consumer-ratings");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-ratings-phase2w-e-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

// The smoke exercises presentation-only mappers and the submission coordinator.
// Keep its temporary CommonJS output independent from the Mobile workspace's
// package layout without invoking React hooks or creating repository artifacts.
const reactStubRoot = path.join(tempRoot, "node_modules", "react");
fs.mkdirSync(reactStubRoot, { recursive: true });
fs.writeFileSync(path.join(reactStubRoot, "index.js"), "module.exports = {};\n", "utf8");

function expect(condition, name, details = "contract assertion failed") {
  if (!condition) throw new Error(`${name}: ${details}`);
  checks.push({ name, pass: true });
}

const timestamp = "2026-07-18T00:00:00.000Z";

try {
  const program = ts.createProgram(collectTsFiles(ratingRoot), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir: compiledRoot,
    rootDir: featureRoot,
    jsx: ts.JsxEmit.ReactJSX
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  expect(diagnostics.length === 0, "Phase 2W-E TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-ratings", "consumerRatingUiModel.js"));
  const targetMapper = requireFromTemp("./consumerRatingTargetMapper.js");
  const ui = requireFromTemp("./consumerRatingUiModel.js");
  const serviceModule = requireFromTemp("./consumerRatingService.js");

  const restaurantMapping = targetMapper.mapConsumerRatingTarget({ restaurantId: " restaurant-1 " });
  expect(restaurantMapping.status === "available" && restaurantMapping.target.kind === "restaurant" && restaurantMapping.target.restaurantId === "restaurant-1", "safe restaurant target maps from opaque ID");

  const menuMapping = targetMapper.mapConsumerRatingTarget({ restaurantId: "restaurant-1", menuItemId: "menu-item-1", branchId: null });
  expect(menuMapping.status === "available" && menuMapping.target.kind === "menu_item" && menuMapping.target.branchId === null, "safe menu-item target maps and preserves nullable branch");
  expect(targetMapper.mapConsumerRatingTarget({ menuItemId: "menu-item-1" }).status === "target_unavailable", "menu-item target without restaurant fails closed");

  const restaurantOnly = targetMapper.mapConsumerRatingTarget({ restaurantId: "restaurant-1", menuItemId: "" });
  expect(restaurantOnly.status === "available" && restaurantOnly.target.kind === "restaurant", "missing menu-item ID never pretends to perform menu-item rating");
  expect(targetMapper.mapConsumerRatingTarget({}).status === "target_unavailable", "missing restaurant ID fails closed");
  expect(targetMapper.mapConsumerRatingTarget({ restaurantName: "Same Name", menuItemName: "Same Name" }).status === "target_unavailable", "matching display names never create a target");

  const localMealMapping = targetMapper.mapConsumerRatingTarget({ restaurantId: "restaurant-1" });
  expect(localMealMapping.status === "available" && localMealMapping.target.kind === "restaurant" && localMealMapping.target.mealRecordId === null, "local mealId never becomes canonical mealRecordId");
  expect(!fs.readFileSync(path.join(ratingRoot, "consumerRatingTargetMapper.ts"), "utf8").includes("localMealId"), "local mealId is excluded from the canonical target mapper boundary");
  const canonicalMealMapping = targetMapper.mapConsumerRatingTarget({ restaurantId: "restaurant-1", canonicalMealRecordId: "123e4567-e89b-42d3-a456-426614174000" });
  expect(canonicalMealMapping.status === "available" && canonicalMealMapping.target.kind === "restaurant" && canonicalMealMapping.target.mealRecordId === "123e4567-e89b-42d3-a456-426614174000", "valid canonical database UUID may be linked explicitly");

  let ratingDirty = ui.createConsumerRatingFormHydrationState("local-meal-1");
  ratingDirty = ui.reduceConsumerRatingFormHydration(ratingDirty, { type: "edit_rating", value: 5 });
  ratingDirty = ui.reduceConsumerRatingFormHydration(ratingDirty, {
    type: "hydrate",
    identity: "local-meal-1",
    values: { rating: 2, portionFeeling: "tooLittle", wouldEatAgain: false }
  });
  expect(ratingDirty.values.rating === 5, "delayed read preserves a user-edited rating");

  let portionDirty = ui.createConsumerRatingFormHydrationState("local-meal-1");
  portionDirty = ui.reduceConsumerRatingFormHydration(portionDirty, { type: "edit_portion", value: "tooMuch" });
  portionDirty = ui.reduceConsumerRatingFormHydration(portionDirty, { type: "hydrate", identity: "local-meal-1", values: { portionFeeling: "tooLittle" } });
  expect(portionDirty.values.portionFeeling === "tooMuch", "delayed read preserves a user-edited portion feeling");

  let repurchaseDirty = ui.createConsumerRatingFormHydrationState("local-meal-1");
  repurchaseDirty = ui.reduceConsumerRatingFormHydration(repurchaseDirty, { type: "edit_would_eat_again", value: false });
  repurchaseDirty = ui.reduceConsumerRatingFormHydration(repurchaseDirty, { type: "hydrate", identity: "local-meal-1", values: { wouldEatAgain: true } });
  expect(repurchaseDirty.values.wouldEatAgain === false, "delayed read preserves a user-edited would-eat-again value");

  const untouchedHydration = ui.reduceConsumerRatingFormHydration(
    ui.createConsumerRatingFormHydrationState("local-meal-1"),
    { type: "hydrate", identity: "local-meal-1", values: { rating: 4, portionFeeling: "tooLittle", wouldEatAgain: false } }
  );
  expect(untouchedHydration.values.rating === 4 && untouchedHydration.values.portionFeeling === "tooLittle" && untouchedHydration.values.wouldEatAgain === false, "delayed read hydrates every untouched field");

  const resetForNewTarget = ui.reduceConsumerRatingFormHydration(ratingDirty, {
    type: "reset",
    identity: "local-meal-2",
    values: { rating: 1 }
  });
  const hydratedNewTarget = ui.reduceConsumerRatingFormHydration(resetForNewTarget, {
    type: "hydrate",
    identity: "local-meal-2",
    values: { rating: 3 }
  });
  expect(!hydratedNewTarget.dirty.rating && hydratedNewTarget.values.rating === 3, "target switch resets dirty state and hydrates the new target");
  const staleOldTarget = ui.reduceConsumerRatingFormHydration(hydratedNewTarget, {
    type: "hydrate",
    identity: "local-meal-1",
    values: { rating: 1, portionFeeling: "tooMuch", wouldEatAgain: true }
  });
  expect(staleOldTarget === hydratedNewTarget, "delayed old-target hydration cannot pollute the new target");

  const restaurantRecord = currentRestaurantRecord();
  const availableRead = ui.mapConsumerRatingReadResult({ status: "available", record: restaurantRecord, source: "mock" });
  expect(availableRead.status === "available" && availableRead.ratingValue === 4, "initial available read maps to presentation state");
  expect(ui.mapConsumerRatingReadResult({ status: "missing", lookup: { kind: "restaurant", restaurantId: "restaurant-1" }, source: "mock" }).status === "missing", "initial missing read is a normal presentation state");
  expect(ui.mapConsumerRatingReadResult({ status: "disabled", source: "disabled", error: {} }).status === "disabled", "disabled read maps without raw error");
  expect(ui.mapConsumerRatingReadResult({ status: "unauthenticated", source: "mock", error: {} }).status === "unauthenticated", "unauthenticated read maps explicitly");
  expect(ui.mapConsumerRatingReadResult({ status: "read_failed", source: "mock", error: {} }).status === "failed", "repository read failure maps to failed state");

  expect(ui.mapConsumerRatingWriteResult({ status: "saved", record: restaurantRecord, source: "mock" }, true).status === "saved", "saved write maps explicitly");
  expect(ui.mapConsumerRatingWriteResult({ status: "replaced", record: restaurantRecord, source: "mock" }, true).status === "replaced", "replaced write maps explicitly");
  expect(Object.keys(ui.getConsumerRatingInitialValues(ui.mapConsumerRatingWriteResult({ status: "saved", record: restaurantRecord, source: "mock" }, true))).length === 0, "saved state does not rehydrate the active form");
  expect(Object.keys(ui.getConsumerRatingInitialValues(ui.mapConsumerRatingWriteResult({ status: "replaced", record: restaurantRecord, source: "mock" }, true))).length === 0, "replaced state does not rehydrate the active form");
  expect(ui.mapConsumerRatingWriteResult({ status: "disabled", source: "disabled", error: {} }, true).status === "disabled", "disabled write maps explicitly");
  expect(ui.mapConsumerRatingWriteResult({ status: "unauthenticated", source: "mock", error: {} }, true).status === "unauthenticated", "unauthenticated write maps explicitly");
  const failedWriteState = ui.mapConsumerRatingWriteResult({ status: "write_failed", source: "mock", error: {} }, true);
  expect(failedWriteState.status === "failed" && failedWriteState.localCompletionSaved, "canonical write failure preserves local completion success");

  const writeInput = ui.buildConsumerRatingWriteInput(restaurantMapping.target, { rating: 5, portionFeeling: "justRight", wouldEatAgain: true });
  expect(writeInput.ratingValue === 5 && writeInput.portionFeeling === "justRight" && writeInput.repurchaseIntent === "yes" && !("unfinishedReason" in writeInput) && !("dislikeReasons" in writeInput), "Meal Log fields map only to exact canonical semantics");

  let resolveWrite;
  let writeCalls = 0;
  const pendingWrite = new Promise((resolve) => { resolveWrite = resolve; });
  const service = new serviceModule.ConsumerRatingService({
    authPort: { async getCurrentSession() { return { ok: true, value: { provider: "mock" } }; } },
    readRepository: {
      readSource: "mock",
      async getCurrentUserRestaurantRating() { return { status: "missing", lookup: { kind: "restaurant", restaurantId: "restaurant-1" }, source: "mock" }; },
      async getCurrentUserMenuItemRating() { return { status: "missing", lookup: { kind: "menu_item", menuItemId: "menu-item-1" }, source: "mock" }; },
      async listCurrentUserRatings() { return { status: "available", records: [], source: "mock" }; }
    },
    writeRepository: {
      writeSource: "mock",
      async createOrReplaceCurrentUserRating() { writeCalls += 1; return pendingWrite; }
    }
  });
  const coordinator = ui.createConsumerRatingSubmissionCoordinator(service);
  const states = [];
  const firstSubmit = coordinator.submit(restaurantMapping.target, { rating: 4, portionFeeling: "justRight", wouldEatAgain: true }, true, (state) => states.push(state));
  await Promise.resolve();
  const repeatedSubmit = await coordinator.submit(restaurantMapping.target, { rating: 4, portionFeeling: "justRight", wouldEatAgain: true }, true, (state) => states.push(state));
  expect(repeatedSubmit === false && writeCalls === 1, "rating saving prevents repeated canonical submit");
  resolveWrite({ status: "saved", record: restaurantRecord, source: "mock" });
  await firstSubmit;
  expect(states[0].status === "saving" && states.at(-1).status === "saved", "submission coordinator exposes saving then saved");

  const invalidService = new serviceModule.ConsumerRatingService({
    authPort: { async getCurrentSession() { return { ok: true, value: { provider: "mock" } }; } },
    readRepository: { readSource: "mock" },
    writeRepository: { writeSource: "mock", async createOrReplaceCurrentUserRating() { throw new Error("must not be called"); } }
  });
  for (const rating of [Number.NaN, -0.1, 5.1]) {
    const result = await invalidService.createOrReplaceCurrentUserRating({ target: restaurantMapping.target, ratingValue: rating });
    expect(result.status === "invalid_input", `rating validation remains finite 0-5: ${String(rating)}`);
  }

  console.log(JSON.stringify({ status: "passed", phase: "Consumer Runtime Phase 2W-E Mobile UI Contract Smoke", totalChecks: checks.length, checks, networkUsed: false, databaseUsed: false, credentialsUsed: false, migrationExecuted: false, productionTouched: false }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", phase: "Consumer Runtime Phase 2W-E Mobile UI Contract Smoke", reason: error instanceof Error ? error.message : String(error), checks }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function currentRestaurantRecord() {
  return {
    ratingId: "rating-1",
    target: { kind: "restaurant", restaurantId: "restaurant-1", mealRecordId: null },
    ratingValue: 4,
    visibility: "private",
    isCurrent: true,
    tasteFeeling: null,
    portionFeeling: "justRight",
    priceFeeling: null,
    repurchaseIntent: "yes",
    ratedAt: timestamp,
    updatedAt: timestamp
  };
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
