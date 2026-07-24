#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const contractPath = "apps/mobile/features/meal-identification/finalizationContract.ts";
const adapterPath = "apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts";
const occurrenceTimePath = "apps/mobile/features/analysis/mealOccurrenceTime.ts";

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
      throw new Error(`MI-E-B2 smoke refused runtime dependency: ${request}`);
    },
    module,
    module.exports
  );
  return module.exports;
}

const occurrenceTime = loadCommonJs(occurrenceTimePath, () => undefined);
const contract = loadCommonJs(contractPath, () => undefined);
const {
  buildAnalysisMealIdentificationFinalizationDraft
} = loadCommonJs(adapterPath, (request) => (request === "../meal-identification" ? contract : undefined));

const {
  zonedWallClockToIsoInstant,
  isMealOccurrenceTooFarInFuture,
  isValidDateKey,
  isValidTimeKey,
  buildRecentMealDateOptions,
  filterMealOccurrenceTimeOptions,
  MEAL_OCCURRENCE_TIME_OPTIONS
} = occurrenceTime;

const checks = [];
function expect(condition, name) {
  if (!condition) throw new Error(`FAIL ${name}`);
  checks.push(name);
  console.log(`PASS ${name}`);
}

function nullIdentity() {
  return {
    restaurantId: null,
    branchId: null,
    menuId: null,
    menuCategoryId: null,
    menuItemId: null,
    branchMenuItemId: null
  };
}

function confirmedCandidate() {
  return {
    kind: "catalog_item",
    identity: {
      restaurantId: "restaurant-1",
      branchId: "branch-1",
      menuId: "menu-1",
      menuCategoryId: "category-1",
      menuItemId: "item-1",
      branchMenuItemId: "branch-item-1"
    },
    source: "supabase",
    restaurantName: "好初健康碗",
    branchName: "信義店",
    branchContext: "信義區",
    menuName: "午餐",
    menuCategoryName: "健康碗",
    mealItemName: "雞胸碗",
    price: 180,
    availability: "available",
    nutritionProvenance: "restaurant_confirmed",
    confidence: 0.9,
    matchReason: "catalog_match",
    tags: ["高蛋白"]
  };
}

function unresolvedCandidate(reason) {
  return {
    kind: "personal_unresolved",
    identity: nullIdentity(),
    source: reason,
    restaurantName: "手動輸入",
    mealItemName: "手動輸入餐點"
  };
}

function baseInput(overrides) {
  return {
    selectedMealPeriod: "lunch",
    restaurantName: "x",
    mealName: "x",
    sourceContext: "dine_in",
    recordTiming: "current",
    occurredAt: "2026-07-25T04:00:00.000Z",
    selectedCandidate: confirmedCandidate(),
    catalogConfirmed: true,
    isSelfCooked: false,
    nutritionSummary: { calories: 200, protein: 10, carbohydrates: 20, fat: 5, portion: "1", ingredientSummary: "x", balanceScore: 50 },
    nutritionRefreshed: false,
    correctionCompleted: false,
    correctedRows: {},
    preMealPhotoIds: [],
    analysisAvailability: "available",
    observedAt: "2026-07-25T03:55:00.000Z",
    ...overrides
  };
}

// ---- mealOccurrenceTime.ts: pure utility correctness (new this round) ----

expect(isValidDateKey("2026-07-20") === true, "isValidDateKey accepts a well-formed date");
expect(isValidDateKey("2026/07/20") === false, "isValidDateKey rejects a non-ISO separator");
expect(isValidDateKey("not-a-date") === false, "isValidDateKey rejects garbage");
expect(isValidTimeKey("07:30") === true, "isValidTimeKey accepts a well-formed time");
expect(isValidTimeKey("24:00") === false, "isValidTimeKey rejects an out-of-range hour");
expect(isValidTimeKey("7:30") === false, "isValidTimeKey rejects a non-zero-padded hour");

const taipeiNoon = zonedWallClockToIsoInstant("2026-07-20", "12:00", "Asia/Taipei");
expect(taipeiNoon === "2026-07-20T04:00:00.000Z", "Asia/Taipei wall clock converts to the correct UTC instant (UTC+8, no DST)");

const nyMorning = zonedWallClockToIsoInstant("2026-01-15", "09:00", "America/New_York");
expect(nyMorning === "2026-01-15T14:00:00.000Z", "America/New_York wall clock converts to the correct UTC instant (winter, UTC-5)");

expect(zonedWallClockToIsoInstant("2026-13-40", "12:00", "Asia/Taipei") === null, "zonedWallClockToIsoInstant rejects a malformed date");
expect(zonedWallClockToIsoInstant("2026-07-20", "12:00", "") === null, "zonedWallClockToIsoInstant rejects a missing timezone");

const referenceNow = new Date("2026-07-25T10:00:00.000Z");
expect(isMealOccurrenceTooFarInFuture(new Date(referenceNow.getTime() + 60 * 60 * 1000).toISOString(), referenceNow) === true,
  "an occurrence one hour after reference-now is rejected as too far in the future");
expect(isMealOccurrenceTooFarInFuture(new Date(referenceNow.getTime() - 60 * 60 * 1000).toISOString(), referenceNow) === false,
  "an occurrence one hour before reference-now is accepted");
expect(isMealOccurrenceTooFarInFuture(referenceNow.toISOString(), referenceNow) === false,
  "an occurrence exactly at reference-now is accepted (no false-positive at the boundary)");

const dateOptions = buildRecentMealDateOptions(referenceNow, "Asia/Taipei", 3);
expect(dateOptions.length === 4, "buildRecentMealDateOptions returns daysBack+1 options");
expect(dateOptions[0].label === "今天", "the first recent-date option is labeled 今天");
expect(dateOptions[1].label === "昨天", "the second recent-date option is labeled 昨天");
expect(new Set(dateOptions.map((option) => option.key)).size === dateOptions.length,
  "recent-date options never repeat the same date key");

const todayKeyTaipei = dateOptions[0].key;
const filteredToday = filterMealOccurrenceTimeOptions(todayKeyTaipei, MEAL_OCCURRENCE_TIME_OPTIONS, referenceNow, "Asia/Taipei");
expect(filteredToday.length < MEAL_OCCURRENCE_TIME_OPTIONS.length,
  "filtering today's time options removes at least one future-of-now slot (proves future-time filtering is active)");
expect(filteredToday.every((option) => !isMealOccurrenceTooFarInFuture(
  zonedWallClockToIsoInstant(todayKeyTaipei, option.key, "Asia/Taipei"), referenceNow
)), "every surviving time option for today is not in the future");

const yesterdayKey = dateOptions[1].key;
const filteredYesterday = filterMealOccurrenceTimeOptions(yesterdayKey, MEAL_OCCURRENCE_TIME_OPTIONS, referenceNow, "Asia/Taipei");
expect(filteredYesterday.length === MEAL_OCCURRENCE_TIME_OPTIONS.length,
  "no time options are filtered out for a fully-past date");

// ---- adapter: dynamic recordTiming/occurredAt now flow from UI state (not hardcoded) ----

const confirmedCurrent = buildAnalysisMealIdentificationFinalizationDraft(baseInput({}));
expect(confirmedCurrent.ok === true, "confirmed dine_in + current builds a valid draft");
expect(confirmedCurrent.value.finalization.recordTiming === "current", "confirmed dine_in + current preserves recordTiming=current");
expect(confirmedCurrent.value.finalization.occurredAt === "2026-07-25T04:00:00.000Z", "confirmed dine_in + current preserves the exact caller-supplied occurredAt");

const confirmedPostHoc = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
  recordTiming: "post_hoc",
  occurredAt: "2026-07-20T04:00:00.000Z"
}));
expect(confirmedPostHoc.ok === true, "confirmed dine_in + post_hoc builds a valid draft");
expect(confirmedPostHoc.value.finalization.recordTiming === "post_hoc", "confirmed dine_in + post_hoc preserves recordTiming=post_hoc");

const takeoutCurrent = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
  sourceContext: "takeout",
  selectedCandidate: unresolvedCandidate("manual"),
  catalogConfirmed: false
}));
expect(takeoutCurrent.ok === true, "takeout + current builds a valid draft with zero restaurant/branch identity required");
expect(takeoutCurrent.value.finalization.selection.kind === "personal_unresolved" &&
  takeoutCurrent.value.finalization.selection.identity.restaurantId === null &&
  takeoutCurrent.value.finalization.selection.identity.branchId === null,
  "takeout unresolved selection carries no populated Catalog identity");

const takeoutPostHoc = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
  sourceContext: "takeout",
  recordTiming: "post_hoc",
  occurredAt: "2026-07-20T11:30:00.000Z",
  selectedCandidate: unresolvedCandidate("manual"),
  catalogConfirmed: false
}));
expect(takeoutPostHoc.ok === true, "takeout + post_hoc builds a valid draft (required verification #14)");

const selfCookedPostHoc = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
  sourceContext: "self_cooked",
  isSelfCooked: true,
  recordTiming: "post_hoc",
  occurredAt: "2026-07-20T11:30:00.000Z",
  selectedCandidate: unresolvedCandidate("self_cooked"),
  catalogConfirmed: false
}));
expect(selfCookedPostHoc.ok === true, "self_cooked + post_hoc builds a valid draft (required verification #15)");
expect(selfCookedPostHoc.value.finalization.selection.identity.restaurantId === null &&
  selfCookedPostHoc.value.finalization.selection.identity.branchId === null,
  "self_cooked never fabricates a restaurant or branch identity, even for a post_hoc entry");

const dineInPostHoc = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
  sourceContext: "dine_in",
  recordTiming: "post_hoc",
  occurredAt: "2026-07-20T11:30:00.000Z"
}));
expect(dineInPostHoc.ok === true, "dine_in + post_hoc builds a valid draft (required verification #16)");

// ---- capture provenance never leaks into the finalization command ----
expect(!JSON.stringify(confirmedCurrent.value).toLowerCase().includes("capturemethod"),
  "captureMethod is never present anywhere in the built finalization command");
expect(!JSON.stringify(confirmedCurrent.value).toLowerCase().includes('"camera"') &&
  !JSON.stringify(confirmedCurrent.value).toLowerCase().includes('"gallery"'),
  "capture method values (camera/gallery) never leak into the built finalization command");

// ---- regression: the frozen builder still rejects invalid timing/occurredAt (MI-E-B2 must not weaken MI-E-B1) ----
const invalidTiming = buildAnalysisMealIdentificationFinalizationDraft(baseInput({ recordTiming: "sometime" }));
expect(invalidTiming.ok === false, "an invalid recordTiming value is still rejected");

const missingOccurredAt = buildAnalysisMealIdentificationFinalizationDraft(baseInput({ occurredAt: "" }));
expect(missingOccurredAt.ok === false, "a missing/empty occurredAt is still rejected");

const unresolvedReasons = ["manual", "self_cooked", "none_of_the_above", "catalog_unavailable"];
for (const reason of unresolvedReasons) {
  const result = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
    sourceContext: reason === "self_cooked" ? "self_cooked" : "dine_in",
    isSelfCooked: reason === "self_cooked",
    selectedCandidate: unresolvedCandidate(reason),
    catalogConfirmed: false
  }));
  expect(result.ok === true, `unresolved reason "${reason}" still builds a valid draft (no regression)`);
}

const bogusReason = buildAnalysisMealIdentificationFinalizationDraft(baseInput({
  selectedCandidate: unresolvedCandidate("bogus_not_real"),
  catalogConfirmed: false
}));
expect(bogusReason.ok === false, "a 5th/unsupported unresolved reason is still rejected (no new reason introduced)");

console.log(`RESULT ${checks.length}/${checks.length} PASS`);
