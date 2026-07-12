import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

function extractObjects(text, arrayName) {
  const arrayStart = text.indexOf(`export const ${arrayName}`);
  if (arrayStart < 0) return [];
  const open = text.indexOf("[", arrayStart);
  const close = text.indexOf("];", open);
  if (open < 0 || close < 0) return [];
  const arrayBody = text.slice(open + 1, close);
  return matches(arrayBody, /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gs).map((match) => match[0]);
}

function prop(objectText, name) {
  return objectText.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1];
}

const restaurantsText = read("packages/shared/src/mock/restaurant-platform/restaurants.ts");
const menusText = read("packages/shared/src/mock/restaurant-platform/menus.ts");
const nutritionText = read("packages/shared/src/mock/restaurant-platform/nutrition.ts");
const pendingText = read("packages/shared/src/mock/restaurant-platform/pending-menu-items.ts");
const analyticsText = read("packages/shared/src/mock/restaurant-platform/analytics-events.ts");

const restaurants = extractObjects(restaurantsText, "canonicalRestaurants");
const branches = extractObjects(restaurantsText, "canonicalBranches");
const menus = extractObjects(menusText, "canonicalMenus");
const categories = extractObjects(menusText, "canonicalMenuCategories");
const menuItems = extractObjects(menusText, "canonicalMenuItems");
const branchMenuItems = extractObjects(menusText, "canonicalBranchMenuItems");
const aliases = extractObjects(menusText, "canonicalMenuItemAliases");
const nutritionRows = extractObjects(nutritionText, "canonicalMenuItemNutrition");
const estimates = extractObjects(nutritionText, "canonicalNutritionEstimates");
const pendingItems = extractObjects(pendingText, "canonicalPendingMenuItems");
const analyticsEvents = extractObjects(analyticsText, "canonicalAnalyticsEvents");
const recommendations = extractObjects(analyticsText, "canonicalRecommendationResults");

const restaurantIds = new Set(restaurants.map((item) => prop(item, "id")));
const branchIds = new Set(branches.map((item) => prop(item, "id")));
const menuIds = new Set(menus.map((item) => prop(item, "id")));
const categoryIds = new Set(categories.map((item) => prop(item, "id")));
const menuItemIds = new Set(menuItems.map((item) => prop(item, "id")));
const analyticsIds = analyticsEvents.map((item) => prop(item, "id"));

const issues = [];
const duplicates = [];

function checkExists(kind, sourceId, field, value, targetSet) {
  if (value && !targetSet.has(value)) {
    issues.push({ kind, sourceId, field, value });
  }
}

for (const branch of branches) checkExists("RestaurantBranch", prop(branch, "id"), "restaurantId", prop(branch, "restaurantId"), restaurantIds);
for (const menu of menus) checkExists("Menu", prop(menu, "id"), "restaurantId", prop(menu, "restaurantId"), restaurantIds);
for (const category of categories) checkExists("MenuCategory", prop(category, "id"), "menuId", prop(category, "menuId"), menuIds);
for (const item of menuItems) {
  checkExists("MenuItem", prop(item, "id"), "restaurantId", prop(item, "restaurantId"), restaurantIds);
  checkExists("MenuItem", prop(item, "id"), "menuCategoryId", prop(item, "menuCategoryId"), categoryIds);
}
for (const item of branchMenuItems) {
  checkExists("BranchMenuItem", prop(item, "id"), "restaurantId", prop(item, "restaurantId"), restaurantIds);
  checkExists("BranchMenuItem", prop(item, "id"), "branchId", prop(item, "branchId"), branchIds);
  checkExists("BranchMenuItem", prop(item, "id"), "menuItemId", prop(item, "menuItemId"), menuItemIds);
}
for (const alias of aliases) checkExists("MenuItemAlias", prop(alias, "id"), "menuItemId", prop(alias, "menuItemId"), menuItemIds);
for (const row of nutritionRows) checkExists("MenuItemNutrition", prop(row, "id"), "menuItemId", prop(row, "menuItemId"), menuItemIds);
for (const row of estimates) checkExists("NutritionEstimate", prop(row, "id"), "menuItemId", prop(row, "menuItemId"), menuItemIds);
for (const item of pendingItems) {
  checkExists("PendingMenuItem", prop(item, "id"), "restaurantId", prop(item, "restaurantId"), restaurantIds);
  checkExists("PendingMenuItem", prop(item, "id"), "branchId", prop(item, "branchId"), branchIds);
  checkExists("PendingMenuItem", prop(item, "id"), "aiSuggestedMenuItemId", prop(item, "aiSuggestedMenuItemId"), menuItemIds);
}
for (const event of analyticsEvents) {
  checkExists("AnalyticsEvent", prop(event, "id"), "restaurantId", prop(event, "restaurantId"), restaurantIds);
  checkExists("AnalyticsEvent", prop(event, "id"), "branchId", prop(event, "branchId"), branchIds);
  checkExists("AnalyticsEvent", prop(event, "id"), "menuItemId", prop(event, "menuItemId"), menuItemIds);
}
for (const recommendation of recommendations) {
  checkExists("RecommendationResult", prop(recommendation, "id"), "restaurantId", prop(recommendation, "restaurantId"), restaurantIds);
  checkExists("RecommendationResult", prop(recommendation, "id"), "branchId", prop(recommendation, "branchId"), branchIds);
  checkExists("RecommendationResult", prop(recommendation, "id"), "menuItemId", prop(recommendation, "menuItemId"), menuItemIds);
}

for (const [label, values] of [
  ["Restaurant.id", restaurants.map((item) => prop(item, "id"))],
  ["RestaurantBranch.id", branches.map((item) => prop(item, "id"))],
  ["MenuItem.id", menuItems.map((item) => prop(item, "id"))],
  ["BranchMenuItem.id", branchMenuItems.map((item) => prop(item, "id"))],
  ["MenuItemAlias.id", aliases.map((item) => prop(item, "id"))],
  ["MenuItemNutrition.menuItemId", nutritionRows.map((item) => prop(item, "menuItemId"))],
  ["AnalyticsEvent.id", analyticsIds]
]) {
  for (const duplicate of duplicateValues(values)) duplicates.push({ label, ...duplicate });
}

const mobileText = [
  "apps/mobile/features/meal-buddy-card/mealBuddyCardMock.ts",
  "apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts",
  "apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts",
  "apps/mobile/features/analysis/analysisMealRecordStore.ts"
].map(read).join("\n");

const mobileRestaurantRefs = unique(matches(mobileText, /restaurant-[a-z0-9-]+/g).map((match) => match[0]));
const mobileMenuItemRefs = unique(matches(mobileText, /dish-[a-z0-9-]+/g).map((match) => match[0]));
for (const id of mobileRestaurantRefs) checkExists("MobileReference", "mobile-demo", "restaurantId", id, restaurantIds);
for (const id of mobileMenuItemRefs) checkExists("MobileReference", "mobile-demo", "menuItemId", id, menuItemIds);

const report = {
  counts: {
    restaurants: restaurantIds.size,
    branches: branchIds.size,
    menus: menuIds.size,
    menuCategories: categoryIds.size,
    menuItems: menuItemIds.size,
    branchMenuItems: branchMenuItems.length,
    aliases: aliases.length,
    nutritionRows: nutritionRows.length,
    nutritionEstimates: estimates.length,
    pendingItems: pendingItems.length,
    analyticsEvents: analyticsEvents.length,
    recommendations: recommendations.length,
    mobileRestaurantRefs: mobileRestaurantRefs.length,
    mobileMenuItemRefs: mobileMenuItemRefs.length
  },
  orphanReferences: issues,
  duplicateIds: duplicates
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = issues.length || duplicates.length ? 1 : 0;
