import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");
const checks = [];

function expect(condition, name, message = "Contract assertion failed.") {
  if (!condition) throw new Error(`${name}: ${message}`);
  checks.push({ name, pass: true });
}

function expectThrows(fn, expectedCode, name) {
  try {
    fn();
  } catch (error) {
    expect(error instanceof ContractError && error.code === expectedCode, name, `Expected ${expectedCode}, got ${error?.code ?? error}`);
    return;
  }
  throw new Error(`${name}: expected ${expectedCode}.`);
}

class ContractError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function normalize(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function validateRating(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) {
    throw new ContractError("RATING_VALUE_INVALID");
  }
}

function assertAuthenticated(sessionUser) {
  if (!sessionUser) throw new ContractError("AUTHENTICATION_REQUIRED");
}

function validateRestaurantLinkage(input, sessionUser, meals, items) {
  if (!input.mealRecordId) return;
  const meal = meals.find((candidate) => candidate.id === input.mealRecordId && candidate.owner === sessionUser && !candidate.deleted);
  if (!meal) throw new ContractError("RATING_MEAL_RECORD_NOT_OWNED");
  const matches = items.some((item) =>
    item.mealRecordId === meal.id && item.owner === sessionUser && item.restaurantId === normalize(input.restaurantId)
  );
  if (!matches) throw new ContractError("RATING_MEAL_RESTAURANT_MISMATCH");
}

function validateMenuItemLinkage(input, sessionUser, meals, items) {
  if (!input.mealRecordItemId) return;
  const item = items.find((candidate) => candidate.id === input.mealRecordItemId && candidate.owner === sessionUser);
  const meal = item && meals.find((candidate) => candidate.id === item.mealRecordId && candidate.owner === sessionUser && !candidate.deleted);
  if (!item || !meal) throw new ContractError("RATING_MEAL_RECORD_ITEM_NOT_OWNED");
  if (
    item.restaurantId !== normalize(input.restaurantId) ||
    item.menuItemId !== normalize(input.menuItemId) ||
    (item.branchId ?? null) !== normalize(input.branchId)
  ) {
    throw new ContractError("RATING_MEAL_ITEM_TARGET_MISMATCH");
  }
}

function saveRestaurantRating(state, input, sessionUser, meals, items) {
  assertAuthenticated(sessionUser);
  validateRating(input.ratingValue);
  if (!normalize(input.restaurantId)) throw new ContractError("RATING_RESTAURANT_ID_REQUIRED");
  validateRestaurantLinkage(input, sessionUser, meals, items);
  for (const record of state) {
    if (record.owner === sessionUser && record.target.kind === "restaurant" && record.target.restaurantId === normalize(input.restaurantId) && record.isCurrent) {
      record.isCurrent = false;
    }
  }
  state.push({ owner: sessionUser, target: { kind: "restaurant", restaurantId: normalize(input.restaurantId) }, ratingValue: input.ratingValue, isCurrent: true });
}

function saveMenuItemRating(state, input, sessionUser, meals, items) {
  assertAuthenticated(sessionUser);
  validateRating(input.ratingValue);
  if (!normalize(input.restaurantId)) throw new ContractError("RATING_RESTAURANT_ID_REQUIRED");
  if (!normalize(input.menuItemId)) throw new ContractError("RATING_MENU_ITEM_ID_REQUIRED");
  validateMenuItemLinkage(input, sessionUser, meals, items);
  for (const record of state) {
    if (record.owner === sessionUser && record.target.kind === "menu_item" && record.target.menuItemId === normalize(input.menuItemId) && record.isCurrent) {
      record.isCurrent = false;
    }
  }
  state.push({
    owner: sessionUser,
    target: { kind: "menu_item", restaurantId: normalize(input.restaurantId), branchId: normalize(input.branchId), menuItemId: normalize(input.menuItemId) },
    ratingValue: input.ratingValue,
    isCurrent: true
  });
}

try {
  const restaurantParams = sql.match(/save_authenticated_restaurant_rating\(([\s\S]*?)\)\s*returns jsonb/i)?.[1] ?? "";
  const menuParams = sql.match(/save_authenticated_menu_item_rating\(([\s\S]*?)\)\s*returns jsonb/i)?.[1] ?? "";
  expect(restaurantParams.length > 0 && menuParams.length > 0, "both write RPC signatures are present");
  expect(!/\b(user_id|userid|userId|owner_id|ownerId)\b/.test(`${restaurantParams}\n${menuParams}`), "write RPC signatures expose no ownership parameter");
  expect((sql.match(/set search_path = pg_catalog, public, pg_temp/gi) ?? []).length === 2, "both SECURITY DEFINER RPCs fix the safe search_path");
  expect((sql.match(/grant select on table public\.user_(restaurant|menu_item)_ratings to authenticated;/gi) ?? []).length === 2, "authenticated read grants cover both rating tables");
  expect(!/grant\s+(all|insert|update|delete)[\s\S]*user_(restaurant|menu_item)_ratings[\s\S]*authenticated/i.test(sql), "authenticated has no direct rating DML grant");
  expect((sql.match(/revoke all on function public\.save_authenticated_(restaurant|menu_item)_rating\([\s\S]*?\) from public, anon, authenticated;/gi) ?? []).length === 2, "PUBLIC and anon cannot execute rating write RPCs");

  const owner = "contract-owner";
  const otherOwner = "contract-other-owner";
  const meals = [
    { id: "meal-owned", owner, deleted: false },
    { id: "meal-other", owner: otherOwner, deleted: false },
    { id: "meal-deleted", owner, deleted: true }
  ];
  const items = [
    { id: "item-owned", mealRecordId: "meal-owned", owner, restaurantId: "restaurant-a", branchId: "branch-a", menuItemId: "menu-a" },
    { id: "item-other", mealRecordId: "meal-other", owner: otherOwner, restaurantId: "restaurant-a", branchId: "branch-a", menuItemId: "menu-a" }
  ];

  for (const value of [-0.01, 5.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expectThrows(() => validateRating(value), "RATING_VALUE_INVALID", `invalid rating fails closed: ${String(value)}`);
  }
  validateRating(0);
  validateRating(5);
  validateRating(4.25);
  expect(true, "inclusive fractional rating range is accepted");

  expectThrows(() => saveRestaurantRating([], { restaurantId: "restaurant-a", ratingValue: 4 }, null, meals, items), "AUTHENTICATION_REQUIRED", "signed-out write is denied");
  expectThrows(() => saveRestaurantRating([], { restaurantId: "restaurant-a", ratingValue: 4, mealRecordId: "meal-other" }, owner, meals, items), "RATING_MEAL_RECORD_NOT_OWNED", "cross-owner restaurant meal linkage is denied");
  expectThrows(() => saveRestaurantRating([], { restaurantId: "restaurant-b", ratingValue: 4, mealRecordId: "meal-owned" }, owner, meals, items), "RATING_MEAL_RESTAURANT_MISMATCH", "restaurant linkage target mismatch is denied");
  expectThrows(() => saveMenuItemRating([], { restaurantId: "restaurant-a", branchId: "branch-a", menuItemId: "menu-a", ratingValue: 4, mealRecordItemId: "item-other" }, owner, meals, items), "RATING_MEAL_RECORD_ITEM_NOT_OWNED", "cross-owner menu-item linkage is denied");
  expectThrows(() => saveMenuItemRating([], { restaurantId: "restaurant-a", branchId: "branch-b", menuItemId: "menu-a", ratingValue: 4, mealRecordItemId: "item-owned" }, owner, meals, items), "RATING_MEAL_ITEM_TARGET_MISMATCH", "menu-item branch mismatch is denied");

  const restaurantState = [];
  saveRestaurantRating(restaurantState, { restaurantId: "restaurant-a", ratingValue: 3, mealRecordId: "meal-owned" }, owner, meals, items);
  saveRestaurantRating(restaurantState, { restaurantId: "restaurant-a", ratingValue: 4.5, mealRecordId: "meal-owned" }, owner, meals, items);
  expect(restaurantState.length === 2 && restaurantState.filter((record) => record.isCurrent).length === 1, "restaurant replacement preserves history and one current row");
  expect(restaurantState.find((record) => record.isCurrent)?.ratingValue === 4.5, "restaurant replacement becomes current");

  const menuState = [];
  saveMenuItemRating(menuState, { restaurantId: "restaurant-a", branchId: "branch-a", menuItemId: "menu-a", ratingValue: 3, mealRecordItemId: "item-owned" }, owner, meals, items);
  saveMenuItemRating(menuState, { restaurantId: "restaurant-a", branchId: "branch-a", menuItemId: "menu-a", ratingValue: 5, mealRecordItemId: "item-owned" }, owner, meals, items);
  expect(menuState.length === 2 && menuState.filter((record) => record.isCurrent).length === 1, "menu-item replacement preserves history and one current row");

  const isolatedState = [];
  saveRestaurantRating(isolatedState, { restaurantId: "same-id", ratingValue: 3 }, owner, meals, items);
  saveMenuItemRating(isolatedState, { restaurantId: "restaurant-a", menuItemId: "same-id", ratingValue: 4 }, owner, meals, items);
  expect(isolatedState.filter((record) => record.isCurrent).length === 2, "restaurant and menu-item target namespaces remain isolated");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Phase 2W-B Ratings Migration Contract Smoke",
    totalChecks: checks.length,
    checks,
    databaseConnectionUsed: false,
    migrationExecuted: false,
    credentialUsed: false,
    databaseWriteUsed: false,
    developmentTouched: false,
    productionTouched: false,
    n4Executed: false,
    phase2WCStarted: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2W-B Ratings Migration Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    databaseConnectionUsed: false,
    migrationExecuted: false,
    credentialUsed: false,
    databaseWriteUsed: false,
    developmentTouched: false,
    productionTouched: false,
    n4Executed: false,
    phase2WCStarted: false
  }, null, 2));
  process.exitCode = 1;
}
