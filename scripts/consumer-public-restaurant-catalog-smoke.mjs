import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-restaurant-catalog-"));
const outputRoot = tempRoot;
const checks = [];
const issues = [];

process.on("exit", () => fs.rmSync(tempRoot, { recursive: true, force: true }));

function check(name, pass, details = "") {
  checks.push({ name, pass, ...(details ? { details } : {}) });
  if (!pass) issues.push({ name, details });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const migration = read(
  "supabase/migrations/20260724010000_consumer_public_restaurant_catalog_v1.sql"
);
const sql = migration.replace(/--[^\n]*/g, "");

check("versioned public catalog view", /CREATE VIEW public\.consumer_public_restaurant_catalog_v1/i.test(sql));
check("projection uses security barrier", /WITH\s*\(\s*security_barrier\s*=\s*true\s*\)/i.test(sql));
for (const identity of [
  "restaurant_id",
  "branch_id",
  "menu_id",
  "menu_category_id",
  "branch_menu_item_id",
  "menu_item_id"
]) {
  check(`projection exposes canonical ${identity}`, new RegExp(`\\b${identity}\\b`, "i").test(sql));
}
check("active restaurant filter", /WHERE r\.status = 'active'/i.test(sql));
check("active branch filter", /rb\.status = 'active'[\s\S]*rb\.is_active = true/i.test(sql));
check("published menu filter", /m\.status = 'published'/i.test(sql));
check("active item filter", /mi\.status = 'active'/i.test(sql));
check("branch parent consistency", /bmi\.restaurant_id = r\.id[\s\S]*bmi\.branch_id = rb\.id[\s\S]*bmi\.menu_item_id = mi\.id/i.test(sql));
check("availability and sold-out filters", /bmi\.availability IN \('available', 'limited'\)[\s\S]*bmi\.sold_out = false[\s\S]*bmi\.branch_specific_status = 'available'/i.test(sql));
check("nutrition LEFT JOIN uses safe projection", /LEFT JOIN public\.restaurant_public_published_nutrition_v1 AS n/i.test(sql));
check("projection never reads raw nutrition", !/\b(?:FROM|JOIN)\s+public\.menu_item_nutrition\b/i.test(sql));
check("projection omits internal nutrition fields", !/\bconfidence_score\b|\bverified_status\b|\bis_current\b|\bverified_by\b/i.test(sql));
check("PUBLIC revoked", /REVOKE ALL ON public\.consumer_public_restaurant_catalog_v1 FROM PUBLIC/i.test(sql));
check("anon receives only SELECT after revoke", /REVOKE ALL ON public\.consumer_public_restaurant_catalog_v1 FROM anon[\s\S]*GRANT SELECT ON public\.consumer_public_restaurant_catalog_v1 TO anon/i.test(sql));
check("authenticated receives only SELECT after revoke", /REVOKE ALL ON public\.consumer_public_restaurant_catalog_v1 FROM authenticated[\s\S]*GRANT SELECT ON public\.consumer_public_restaurant_catalog_v1 TO authenticated/i.test(sql));

const catalogRoot = path.join(root, "apps", "mobile", "features", "restaurants", "catalog");
const rootFiles = fs
  .readdirSync(catalogRoot)
  .filter((name) => name.endsWith(".ts") && !["composition.ts", "useRestaurantCatalog.ts", "index.ts"].includes(name))
  .map((name) => path.join(catalogRoot, name));
const program = ts.createProgram(rootFiles, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  strict: true,
  esModuleInterop: true,
  skipLibCheck: true,
  outDir: outputRoot,
  rootDir: root,
  baseUrl: root,
  paths: {
    "@haocu/shared": ["packages/shared/src"],
    "@haocu/shared/*": ["packages/shared/src/*"]
  }
});
const diagnostics = ts.getPreEmitDiagnostics(program);
check("catalog functional modules compile", diagnostics.length === 0, diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, " ")).join(" | "));
program.emit();

const adapterOutput = path.join(outputRoot, "apps", "mobile", "adapters", "mock", "mobile-restaurant-mock-adapter.js");
fs.mkdirSync(path.dirname(adapterOutput), { recursive: true });
fs.writeFileSync(
  adapterOutput,
  `"use strict";
exports.mobileRestaurantMockAdapter = { getSnapshot() { return {
  restaurants: [{ id: "restaurant-db-1", name: "Test Restaurant", legalName: "Test", city: "Taipei", category: "Cafe", tags: ["public"], plan: "demo", status: "active" }],
  branches: [
    { id: "branch-db-1", restaurantId: "restaurant-db-1", name: "Branch A", district: "A", address: "A1", isActive: true },
    { id: "branch-db-2", restaurantId: "restaurant-db-1", name: "Branch B", district: "B", address: "B1", isActive: true }
  ],
  menus: [{ id: "menu-db-1", restaurantId: "restaurant-db-1", name: "Published Menu", status: "active" }],
  menuCategories: [{ id: "category-db-1", menuId: "menu-db-1", name: "Main", sortOrder: 1 }],
  menuItems: [{ id: "menu-item-db-1", restaurantId: "restaurant-db-1", menuCategoryId: "category-db-1", name: "Item", description: "Description", tagIds: [], allergens: [], status: "active", nutritionBadgeStatus: "missing", badgeEnabled: false }],
  branchMenuItems: [
    { id: "branch-menu-item-db-1", restaurantId: "restaurant-db-1", branchId: "branch-db-1", menuItemId: "menu-item-db-1", price: 100, availability: "available", soldOut: false, branchSpecificStatus: "available" },
    { id: "branch-menu-item-db-2", restaurantId: "restaurant-db-1", branchId: "branch-db-2", menuItemId: "menu-item-db-1", price: 110, availability: "limited", soldOut: false, branchSpecificStatus: "available" }
  ],
  menuItemAliases: [], menuItemNutrition: [], nutritionEstimates: [], nutritionReviews: []
}; } };`
);

const requireFromOutput = createRequire(path.join(outputRoot, "_catalog-smoke.cjs"));
const { getRestaurantCatalogRuntimeFlags } = requireFromOutput("./apps/mobile/features/restaurants/catalog/featureFlags.js");
const { MockRestaurantCatalogRepository } = requireFromOutput("./apps/mobile/features/restaurants/catalog/mockRepository.js");
const { SupabaseRestaurantCatalogRepository } = requireFromOutput("./apps/mobile/features/restaurants/catalog/supabaseRepository.js");
const { mapRestaurantCatalogRows } = requireFromOutput("./apps/mobile/features/restaurants/catalog/mapper.js");

check("default catalog source is safe mock", getRestaurantCatalogRuntimeFlags({}).source === "mock");
check("explicit Supabase source is selectable", getRestaurantCatalogRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE: "supabase" }).source === "supabase");
check("unknown source fails closed", getRestaurantCatalogRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE: "production-live" }).source === "disabled");

const mockResult = await new MockRestaurantCatalogRepository().listCatalog();
check("mock source returns catalog", mockResult.status === "available" && mockResult.source === "mock");
const mockRestaurant = mockResult.status === "available" ? mockResult.restaurants[0] : null;
check("mock preserves restaurant ID", mockRestaurant?.restaurantId === "restaurant-db-1");
check("mock preserves two branch IDs", mockRestaurant?.branches.map((branch) => branch.branchId).join(",") === "branch-db-1,branch-db-2");
const mockItem = mockRestaurant?.branches[0]?.menus[0]?.categories[0]?.items[0];
check("mock preserves menu/category/item identities", mockItem?.menuId === "menu-db-1" && mockItem.menuCategoryId === "category-db-1" && mockItem.menuItemId === "menu-item-db-1");
check("branch-menu-item ID remains distinct", mockItem?.branchMenuItemId === "branch-menu-item-db-1" && mockItem.menuItemId !== mockItem.branchMenuItemId);
check("missing nutrition remains nullable", mockItem?.publishedNutrition === null);

const mappedWithNutrition = mapRestaurantCatalogRows([
  {
    restaurant_id: "restaurant-db-2", restaurant_name: "Nutrition", restaurant_city: "Taipei", restaurant_category: "Cafe", restaurant_tags: [],
    branch_id: "branch-db-3", branch_name: "Branch", branch_district: "D", branch_address: "A",
    menu_id: "menu-db-2", menu_name: "Menu", menu_category_id: "category-db-2", menu_category_name: "Main", menu_category_sort_order: 1,
    branch_menu_item_id: "branch-menu-item-db-3", menu_item_id: "menu-item-db-2", menu_item_name: "Item", menu_item_description: "", menu_item_image_url: null,
    menu_item_tags: [], menu_item_allergens: [], branch_price: 120, branch_availability: "available",
    calories: 300, protein: null, carbohydrates: null, fat: null, fiber: null, sugar: null, sodium: null, saturated_fat: null, serving_size: null,
    nutrition_source_public: "restaurant_confirmed", nutrition_updated_at: "2026-07-23T00:00:00Z"
  }
]);
check("safe nutrition maps without inventing null macros", mappedWithNutrition[0]?.menuItems[0]?.publishedNutrition?.protein === null);

const emptyResult = await new SupabaseRestaurantCatalogRepository({
  from() { return { select() { return { order: async () => ({ data: [], error: null }) }; } }; }
}).listCatalog();
check("Supabase empty maps explicitly", emptyResult.status === "empty");

const errorResult = await new SupabaseRestaurantCatalogRepository({
  from() { return { select() { return { order: async () => ({ data: null, error: { message: "blocked", status: 403 } }) }; } }; }
}).listCatalog();
check("Supabase error maps explicitly", errorResult.status === "error" && errorResult.retryable === false);

const hookSource = read("apps/mobile/features/restaurants/catalog/useRestaurantCatalog.ts");
check("UI hook covers loading success empty error unavailable", ["loading", "success", "empty", "error", "unavailable"].every((state) => hookSource.includes(`"${state}"`)));
const restaurantsSource = read("apps/mobile/app/restaurants.tsx");
check("route lookup uses exact selected catalog source", /catalog\.findRestaurantById\(params\.restaurantId\)/.test(restaurantsSource));
check("restaurant Favorites use projection restaurant ID", /restaurantFavorites\.toggle\(restaurant\.restaurantId\)/.test(restaurantsSource));
const mealLogSource = read("apps/mobile/app/meal-log.tsx");
check("Favorites restoration uses selected catalog source", /restaurantCatalog\.findMenuItemById\(target\.menuItemId\)[\s\S]*restaurantCatalog\.findRestaurantById\(target\.restaurantId\)/.test(mealLogSource));
check("Favorites restoration no longer uses fixed mock facade", !/getCanonicalMenuItemById|getCanonicalRestaurantById/.test(mealLogSource));

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "Consumer Public Restaurant Catalog Local Functional Smoke",
  totalChecks: checks.length,
  passedChecks: checks.filter((entry) => entry.pass).length,
  failedChecks: issues.length,
  checks,
  issues,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  migrationExecuted: false,
  productionTouched: false
}, null, 2));
process.exit(issues.length ? 1 : 0);
