#!/usr/bin/env node
// MI-E-C5-R7-C3 behavioral smoke — executes the real Today Intake composition, frozen resolver,
// canonical UI-model mapping and v3 command builder. Fully local: no network, client or credential.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) =>
  checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const cache = new Map();
function loadTsModule(relativePath, mocks = {}) {
  const absolute = path.resolve(root, relativePath);
  if (cache.has(absolute)) return cache.get(absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    },
    fileName: absolute
  }).outputText;
  const mod = { exports: {} };
  cache.set(absolute, mod.exports);
  const localRequire = (request) => {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    if (request === "react") return { useMemo: (factory) => factory(), useCallback: (value) => value };
    if (request === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null, Fragment: Symbol("Fragment") };
    if (!request.startsWith(".")) return {};
    const base = path.resolve(path.dirname(absolute), request).replace(/\.(?:js|tsx?)$/, "");
    const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => fs.existsSync(candidate));
    if (!resolved) throw new Error(`C3 smoke could not resolve ${request} from ${relativePath}`);
    return loadTsModule(path.relative(root, resolved), mocks);
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(localRequire, mod, mod.exports);
  cache.set(absolute, mod.exports);
  return mod.exports;
}

const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const SCREEN = "apps/mobile/app/today-intake.tsx";
const UI_MODEL = "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts";
const V3 = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const resolverModule = loadTsModule(RESOLVER);
const resolver = resolverModule.resolveRestaurantContextPresentation;
const v3 = loadTsModule(V3).buildMealIdentificationFinalizationV3;
const observedResolverInputs = [];
const observedResolverModule = {
  ...resolverModule,
  resolveRestaurantContextPresentation(input) {
    observedResolverInputs.push(input);
    return resolver(input);
  }
};

const screenMocks = {
  "expo-router": { useRouter: () => ({ push() {} }) },
  "react-native": { Pressable() {}, StyleSheet: { create: (value) => value }, Text() {}, View() {} },
  "../../../lib/i18n/zh-TW": { zhTW: {} },
  "../components/DemoUi": { colors: new Proxy({}, { get: () => "mock-color" }) },
  "../components/NutritionDetailReport": {},
  "../components/PlaceholderScreen.tsx": {},
  "../features/consumer-meals": {},
  "../features/consumer-runtime": {},
  "../features/restaurants/catalog": {},
  "../features/restaurants/catalog/restaurantContextPresentation": observedResolverModule
};
const screen = loadTsModule(SCREEN, screenMocks);
const modelMocks = {
  "../../../../lib/i18n/zh-TW": {
    zhTW: {
      mobile: {
        refinedLogic: {
          lifestyleWorld: { todayIntake: { mealSlotOptions: ["早餐", "午餐", "晚餐", "點心"] } },
          mealBuddyCard: { emptyField: "未提供" }
        },
        todayNutritionSummary: {
          reminders: { lowProtein: "蛋白質", lowVegetable: "蔬菜", highSodium: "鈉" }
        }
      }
    }
  },
  "./factories": { createConsumerTodayIntakeOverviewService() { throw new Error("fixture must inject service"); } },
  "./featureFlags": { getConsumerMealRuntimeFlags: () => ({}) }
};
const uiModel = loadTsModule(UI_MODEL, modelMocks);

expect(typeof resolver === "function", "S0 real frozen resolver loads");
expect(typeof screen.adaptTodayIntakeCatalogStatus === "function", "S0 real screen status adapter loads");
expect(typeof screen.composeTodayIntakeCompletedMealRow === "function", "S0 real screen composition helper loads");
expect(typeof screen.getTodayIntakeRestaurantDisplayText === "function", "S0 real screen display formatter loads");
expect(typeof uiModel.getCurrentUserTodayIntakeUiModel === "function", "S0 real Today Intake UI-model pipeline loads");
expect(typeof v3 === "function", "S0 real v3 finalization builder loads");

const R1 = "restaurant-one";
const R2 = "restaurant-two";
const B1 = "branch-first";
const B2 = "branch-second";
const B3 = "branch-third";
const branch = (restaurantId, branchId, name, district) => ({
  restaurantId, branchId, name, district, address: `${district}測試路`, menus: []
});
const catalogRestaurant = (restaurantId, name, branches) => ({
  id: restaurantId,
  restaurantId,
  branchId: branches[0]?.branchId,
  name,
  location: branches[0]?.district ?? "",
  distanceDisplay: "",
  category: "health",
  tags: [],
  priceRange: "NT$--",
  score: "—",
  menuItems: [],
  branches
});
const ONE = catalogRestaurant(R1, "好廚健康碗", [
  branch(R1, B1, "信義店", "信義區"),
  branch(R1, B2, "大安店", "大安區"),
  branch(R1, B3, "中山店", "中山區")
]);
const TWO = catalogRestaurant(R2, "青禾食堂", [branch(R2, "branch-two", "松山店", "松山區")]);
const catalog = [ONE, TWO];
const find = (id) => catalog.find((restaurant) => restaurant.restaurantId === id) ?? null;
const FALLBACK = "未提供";

const mealItem = (restaurantId, branchId, displayName = "藜麥雞胸") => ({
  mealRecordItemId: `item-${restaurantId ?? "generic"}-${branchId ?? "none"}`,
  restaurantId,
  branchId,
  displayName,
  portion: "1 份",
  nutrition: { calories: 520, protein: 42, carbohydrates: 48, fat: 16 },
  nutritionSource: "estimated",
  nutritionSchemaVersion: "v1",
  occurredAt: "2026-08-06T04:00:00.000Z",
  timezone: "Asia/Taipei",
  consumedRatio: 1
});
const canonicalMeal = (mealRecordId, restaurantId, branchId) => ({
  mealRecordId,
  mealType: "lunch",
  source: "ai_analysis",
  occurredAt: "2026-08-06T04:00:00.000Z",
  mealDate: "2026-08-06",
  timezone: "Asia/Taipei",
  title: `餐點 ${mealRecordId}`,
  note: null,
  items: [mealItem(restaurantId, branchId)]
});
const overview = (meals, plannedMeals = []) => ({
  date: "2026-08-06",
  timezone: "Asia/Taipei",
  status: "complete",
  meals,
  plannedMeals,
  calculatedNutrition: { calories: meals.length * 520, protein: meals.length * 42, carbohydrates: meals.length * 48, fat: meals.length * 16, fiber: 5 },
  storedNutrition: null,
  nutritionParity: null,
  mealCount: meals.length
});
const mapModel = async (meals, plannedMeals = []) =>
  uiModel.getCurrentUserTodayIntakeUiModel({
    overviewService: { getCurrentUserTodayIntakeOverview: async () => ({ ok: true, value: overview(meals, plannedMeals) }) }
  });
const compose = (meal, status = "success", finder = find) =>
  screen.composeTodayIntakeCompletedMealRow({ meal, catalogStatus: status, findRestaurant: finder });
const text = (row) => screen.getTodayIntakeRestaurantDisplayText(row.restaurantPresentation, FALLBACK);

const mapped = await mapModel([
  canonicalMeal("generic", null, null),
  canonicalMeal("restaurant-only", R1, null),
  canonicalMeal("first", R1, B1),
  canonicalMeal("second", R1, B2),
  canonicalMeal("third", R1, B3)
]);
const [generic, restaurantOnly, first, second, third] = mapped.mealRecords;
expect(generic.restaurantId === undefined && generic.branchId === null, "A generic UI-model row uses legacy undefined restaurant absence and nullable branch absence");
expect(generic.restaurantName === "", "A UI-model restaurantName remains a non-authoritative placeholder");
const genericComposed = compose(generic);
const genericResolverInput = observedResolverInputs.at(-1);
expect(genericResolverInput.restaurantId === null && genericResolverInput.branchId === null, "A resolver boundary normalizes generic undefined and null absence to canonical null");
expect(text(genericComposed) === FALLBACK && genericComposed.restaurantPresentation.kind === "none", "A generic meal resolves to no context and renders the existing fallback");
const explicitNullComposed = compose({ ...generic, restaurantId: null, branchId: null });
const explicitNullResolverInput = observedResolverInputs.at(-1);
expect(explicitNullResolverInput.restaurantId === null && explicitNullResolverInput.branchId === null, "A explicit null source values remain null at the resolver boundary");
expect(explicitNullComposed.restaurantPresentation.kind === "none", "A explicit null source resolves to no context");
const noFirstItem = { ...canonicalMeal("no-first-item", null, null), items: [] };
const noFirstItemRow = (await mapModel([noFirstItem])).mealRecords[0];
expect(
  noFirstItemRow.restaurantId === undefined && noFirstItemRow.branchId === null,
  "A meal with no first item keeps legacy undefined restaurant absence and null branch absence"
);
expect(
  restaurantOnly.restaurantId === R1 && restaurantOnly.branchId === null,
  "B restaurant-only preserves its restaurant ID and null branch ID"
);
const restaurantOnlyComposed = compose(restaurantOnly);
const restaurantOnlyResolverInput = observedResolverInputs.at(-1);
expect(restaurantOnlyResolverInput.restaurantId === R1 && restaurantOnlyResolverInput.branchId === null, "B resolver input preserves restaurant ID and canonical null branch");
expect(text(restaurantOnlyComposed) === "好廚健康碗", "B restaurant-only renders the live restaurant name");
expect(!text(compose(restaurantOnly)).includes("｜"), "B restaurant-only invents no branch or separator");
expect(text(compose(first)) === "好廚健康碗｜信義店", "C first branch renders its exact branch name");
const secondComposed = compose(second);
const secondResolverInput = observedResolverInputs.at(-1);
expect(secondResolverInput.restaurantId === R1 && secondResolverInput.branchId === B2, "D resolver input preserves both ID strings exactly");
expect(text(secondComposed) === "好廚健康碗｜大安店", "D second branch renders its exact branch name");
expect(second.restaurantId === R1 && second.branchId === B2, "D restaurant plus branch preserves both durable IDs exactly");
expect(!text(compose(second)).includes("信義店"), "D second branch never falls back to the first branch");
expect(text(compose(third)) === "好廚健康碗｜中山店", "E third branch renders its exact branch name");
expect(![first, second, third].map((meal) => text(compose(meal))).some((value) => /信義區|大安區|中山區/.test(value)), "C-E no district is displayed as a branch name");

const missingBranchMeal = (await mapModel([canonicalMeal("missing-branch", R1, "missing")])).mealRecords[0];
expect(text(compose(missingBranchMeal)) === "好廚健康碗", "F missing branch keeps the restaurant and omits branch");
const foreignBranchMeal = (await mapModel([canonicalMeal("foreign", R1, "branch-two")])).mealRecords[0];
expect(text(compose(foreignBranchMeal)) === "好廚健康碗", "G foreign branch does not resolve against another restaurant");
const missingRestaurantMeal = (await mapModel([canonicalMeal("missing-restaurant", "missing", B2)])).mealRecords[0];
const missingRestaurantRow = compose(missingRestaurantMeal);
expect(text(missingRestaurantRow) === FALLBACK && missingRestaurantRow.meal.mealName.includes("missing-restaurant"), "H catalog miss fails soft while retaining the meal");

expect(screen.adaptTodayIntakeCatalogStatus("loading") === "loading", "I loading maps exhaustively to loading");
expect(text(compose(second, screen.adaptTodayIntakeCatalogStatus("loading"))) === FALLBACK, "I loading retains the row and shows fallback");
expect(screen.adaptTodayIntakeCatalogStatus("error") === "error", "J error maps exhaustively to error");
expect(text(compose(second, screen.adaptTodayIntakeCatalogStatus("error"))) === FALLBACK, "J error retains the row and shows fallback");
expect(screen.adaptTodayIntakeCatalogStatus("unavailable") === "disabled", "K unavailable maps exhaustively to disabled");
expect(text(compose(second, screen.adaptTodayIntakeCatalogStatus("unavailable"))) === FALLBACK, "K unavailable retains the row and shows fallback");
expect(screen.adaptTodayIntakeCatalogStatus("empty") === "success", "L empty maps to success without inventing a restaurant");
expect(text(compose(second, screen.adaptTodayIntakeCatalogStatus("empty"), () => null)) === FALLBACK, "L empty catalog renders fallback");

const multiple = await mapModel([canonicalMeal("one", R1, B2), canonicalMeal("two", R2, "branch-two")]);
expect(
  multiple.mealRecords.map((meal) => text(compose(meal))).join("|") === "好廚健康碗｜大安店|青禾食堂｜松山店",
  "M multiple meals compose independently against different restaurants"
);
const mixed = await mapModel([canonicalMeal("generic-mixed", null, null), canonicalMeal("named-mixed", R2, null)]);
expect(
  mixed.mealRecords.map((meal) => text(compose(meal))).join("|") === `${FALLBACK}|青禾食堂`,
  "N generic and restaurant meals coexist without cross-row identity leakage"
);

const durableBefore = { restaurantId: second.restaurantId, branchId: second.branchId };
const renamed = { ...ONE, name: "好廚健康碗（新名）", branches: ONE.branches.map((item) => item.branchId === B2 ? { ...item, name: "大安新店名" } : item) };
const renamedText = text(compose(second, "success", (id) => id === R1 ? renamed : null));
expect(renamedText === "好廚健康碗（新名）｜大安新店名", "O current catalog rename updates the live display");
expect(second.restaurantId === durableBefore.restaurantId && second.branchId === durableBefore.branchId, "O live rename never mutates durable meal IDs");
expect(compose(second).meal === second && !("restaurantDisplayName" in second) && !("branchName" in second), "O composition returns the original meal without writing names into it");

const BASE = {
  analysisRequestId: "request-1",
  selectedCandidateId: "candidate-1",
  captureMethod: "camera",
  sourceContext: "dine_in",
  recordTiming: "current",
  occurredAt: "2026-08-06T04:00:00.000Z",
  mealWrite: { mealName: "藜麥雞胸", components: ["雞胸"], portion: "1 份", nutrition: { calories: 520 } }
};
const genericCommand = v3(BASE);
const restaurantCommand = v3({ ...BASE, restaurantId: R1, branchId: B2, restaurantName: "污染", branchName: "污染" });
expect(genericCommand.ok && Object.keys(genericCommand.value).length === 8, "P generic v3 command remains the exact 8-key shape");
expect(restaurantCommand.ok && Object.keys(restaurantCommand.value).length === 10, "P restaurant v3 command remains the exact 10-key ID shape");
expect(
  restaurantCommand.ok && !("restaurantName" in restaurantCommand.value) && !("branchName" in restaurantCommand.value),
  "P display names cannot contaminate the real finalization command"
);

const plannedSnapshot = "預定餐廳快照";
const planned = {
  plannedMealId: "planned-1",
  date: "2026-08-06",
  title: "預定晚餐",
  mealType: "dinner",
  mealTime: "晚餐",
  restaurantName: plannedSnapshot,
  note: null,
  estimatedNutrition: { calories: 400 }
};
const plannedModel = await mapModel([canonicalMeal("completed", R1, B2)], [planned]);
compose(plannedModel.mealRecords[0], "success", () => renamed);
expect(plannedModel.plannedMeals[0].restaurantName === plannedSnapshot, "Q completed-meal live composition leaves planned snapshot semantics untouched");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "restaurant-display-mi-e-c5-r7-c3",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
