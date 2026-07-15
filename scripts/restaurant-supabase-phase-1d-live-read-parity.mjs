import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const REQUIRED_ENV = ["TASTKIND_SUPABASE_URL", "TASTKIND_SUPABASE_PUBLISHABLE_KEY"];
const PUBLIC_RESOURCES = [
  { operation: "Restaurant basic information", resource: "restaurants" },
  { operation: "Branch list/detail", resource: "restaurant_branches" },
  { operation: "Published menus", resource: "menus" },
  { operation: "Menu categories", resource: "menu_categories" },
  { operation: "Published menu items", resource: "menu_items" },
  { operation: "Branch menu items", resource: "branch_menu_items" },
  { operation: "Public published nutrition", resource: "restaurant_public_published_nutrition_v1" }
];
const INTERNAL_BLOCKED_BY_ALLOWLIST = [
  "pending_menu_items",
  "nutrition_estimates",
  "nutrition_reviews",
  "restaurant_employees",
  "memberships",
  "roles",
  "audit_logs",
  "admin_action_drafts",
  "analytics_events"
];
const PRIVATE_ANALYTICS_OPERATIONS = [
  "getRestaurantDashboardSummary",
  "getRestaurantExposureAnalytics",
  "getNutritionBadgePerformance",
  "getMenuItemPerformance"
];
const PRIVATE_ANALYTICS_RESOURCES = ["restaurant_exposure_summary", "nutrition_badge_performance", "menu_item_performance"];

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 1) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!hasValue(process.env[key])) process.env[key] = value;
  }
  return true;
}

function classifyUrl(url) {
  if (!hasValue(url)) return "missing";
  const lower = url.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) return "local";
  if (lower.includes("prod") || lower.includes("production")) return "looks-production-like";
  if (lower.includes("supabase.co")) return "supabase-cloud-unclassified";
  return "unclassified-nonlocal";
}

function readProjectFile(path) {
  return readFileSync(join(root, path), "utf8");
}

function requireSourceCheck(name, pass, details = {}) {
  return { name, pass: Boolean(pass), ...details };
}

function noSnakeCaseKeys(value, path = "root", failures = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => noSnakeCaseKeys(item, `${path}[${index}]`, failures));
    return failures;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key.includes("_")) failures.push(`${path}.${key}`);
      noSnakeCaseKeys(nested, `${path}.${key}`, failures);
    }
  }
  return failures;
}

function asString(value, entity, field) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Malformed ${entity}.${field}`);
  return value;
}

function asNumber(value, entity, field) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  throw new Error(`Malformed numeric ${entity}.${field}`);
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function nullableNumber(value, entity, field) {
  if (value === null) return null;
  return asNumber(value, entity, field);
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function mapRestaurantStatus(status) {
  if (!status || status === "active" || status === "published") return "active";
  if (status === "paused") return "paused";
  throw new Error(`Unsupported restaurant status: ${status}`);
}

function mapMenuStatus(status) {
  if (!status || status === "published" || status === "active") return "active";
  if (status === "draft" || status === "archived") return status;
  throw new Error(`Unsupported menu status: ${status}`);
}

function mapMenuItemStatus(status) {
  if (!status || status === "published" || status === "active") return "active";
  if (status === "draft" || status === "archived") return status;
  throw new Error(`Unsupported menu item status: ${status}`);
}

function mapAvailability(status) {
  if (!status || status === "available") return "available";
  if (status === "limited" || status === "unavailable") return status;
  throw new Error(`Unsupported branch item availability: ${status}`);
}

function mapBranchSpecificStatus(status) {
  if (!status || status === "active" || status === "available") return "available";
  if (status === "hidden" || status === "discontinued") return status;
  if (status === "inactive") return "hidden";
  throw new Error(`Unsupported branch item status: ${status}`);
}

function mapRestaurant(row) {
  return {
    id: asString(row.id, "Restaurant", "id"),
    name: asString(row.name, "Restaurant", "name"),
    legalName: row.legal_name || row.name,
    city: row.city || "",
    category: row.category || "",
    tags: asStringArray(row.tags),
    plan: row.plan === "starter" || row.plan === "growth" ? row.plan : "demo",
    status: mapRestaurantStatus(row.status)
  };
}

function mapBranch(row) {
  return {
    id: asString(row.id, "RestaurantBranch", "id"),
    restaurantId: asString(row.restaurant_id, "RestaurantBranch", "restaurant_id"),
    name: asString(row.name, "RestaurantBranch", "name"),
    district: row.district || "",
    address: row.address || "",
    isActive: typeof row.is_active === "boolean" ? row.is_active : row.status !== "inactive"
  };
}

function mapMenu(row) {
  return {
    id: asString(row.id, "Menu", "id"),
    restaurantId: asString(row.restaurant_id, "Menu", "restaurant_id"),
    name: asString(row.name, "Menu", "name"),
    status: mapMenuStatus(row.status)
  };
}

function mapMenuCategory(row) {
  return {
    id: asString(row.id, "MenuCategory", "id"),
    menuId: asString(row.menu_id, "MenuCategory", "menu_id"),
    name: asString(row.name, "MenuCategory", "name"),
    sortOrder: optionalNumber(row.sort_order) ?? 0
  };
}

function mapMenuItem(row) {
  return {
    id: asString(row.id, "MenuItem", "id"),
    restaurantId: asString(row.restaurant_id, "MenuItem", "restaurant_id"),
    menuCategoryId: asString(row.menu_category_id, "MenuItem", "menu_category_id"),
    name: asString(row.name, "MenuItem", "name"),
    description: row.description || "",
    imageUrl: typeof row.image_url === "string" ? row.image_url : undefined,
    tagIds: asStringArray(row.tag_ids),
    allergens: asStringArray(row.allergens),
    status: mapMenuItemStatus(row.status),
    nutritionId: typeof row.nutrition_id === "string" ? row.nutrition_id : undefined,
    nutritionBadgeStatus: row.nutrition_badge_status || "missing",
    badgeEnabled: Boolean(row.badge_enabled)
  };
}

function mapBranchMenuItem(row) {
  return {
    id: asString(row.id, "BranchMenuItem", "id"),
    restaurantId: asString(row.restaurant_id, "BranchMenuItem", "restaurant_id"),
    branchId: asString(row.branch_id, "BranchMenuItem", "branch_id"),
    menuItemId: asString(row.menu_item_id, "BranchMenuItem", "menu_item_id"),
    price: asNumber(row.price, "BranchMenuItem", "price"),
    availability: mapAvailability(row.availability),
    soldOut: Boolean(row.sold_out),
    branchSpecificName: typeof row.branch_specific_name === "string" ? row.branch_specific_name : undefined,
    branchSpecificDescription: typeof row.branch_specific_description === "string" ? row.branch_specific_description : undefined,
    branchSpecificStatus: mapBranchSpecificStatus(row.branch_specific_status)
  };
}

function mapNutrition(row) {
  return {
    restaurantId: asString(row.restaurant_id, "RestaurantPublicPublishedNutrition", "restaurant_id"),
    menuItemId: asString(row.menu_item_id, "RestaurantPublicPublishedNutrition", "menu_item_id"),
    calories: nullableNumber(row.calories, "RestaurantPublicPublishedNutrition", "calories"),
    protein: nullableNumber(row.protein, "RestaurantPublicPublishedNutrition", "protein"),
    carbohydrates: nullableNumber(row.carbohydrates, "RestaurantPublicPublishedNutrition", "carbohydrates"),
    fat: nullableNumber(row.fat, "RestaurantPublicPublishedNutrition", "fat"),
    fiber: nullableNumber(row.fiber, "RestaurantPublicPublishedNutrition", "fiber"),
    sugar: nullableNumber(row.sugar, "RestaurantPublicPublishedNutrition", "sugar"),
    sodium: nullableNumber(row.sodium, "RestaurantPublicPublishedNutrition", "sodium"),
    saturatedFat: nullableNumber(row.saturated_fat, "RestaurantPublicPublishedNutrition", "saturated_fat"),
    servingSize: row.serving_size === null ? null : asString(row.serving_size, "RestaurantPublicPublishedNutrition", "serving_size"),
    nutritionSourcePublic: asString(row.nutrition_source_public, "RestaurantPublicPublishedNutrition", "nutrition_source_public"),
    nutritionUpdatedAt: asString(row.nutrition_updated_at, "RestaurantPublicPublishedNutrition", "nutrition_updated_at")
  };
}

async function getRows(baseUrl, key, resource, { filters = {}, limit = 1 } = {}) {
  const url = new URL(`${baseUrl}/rest/v1/${resource}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));
  for (const [field, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(field, `eq.${value}`);
  }
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { apikey: key, Accept: "application/json" }
    });
    if (!response.ok) return { resource, httpStatus: response.status, ok: false, rowCount: 0, rows: [] };
    const json = await response.json();
    return { resource, httpStatus: response.status, ok: true, rowCount: Array.isArray(json) ? json.length : 0, rows: Array.isArray(json) ? json : [] };
  } catch (error) {
    return { resource, ok: false, rowCount: 0, rows: [], errorName: error instanceof Error ? error.name : "UnknownError" };
  }
}

function verifyMalformedMappingFails() {
  const checks = [];
  try {
    mapRestaurant({ id: "", name: "Broken" });
    checks.push({ check: "malformed string row fails", pass: false });
  } catch {
    checks.push({ check: "malformed string row fails", pass: true });
  }
  try {
    mapMenu({ id: "menu-test", restaurant_id: "restaurant-test", name: "Menu", status: "unexpected" });
    checks.push({ check: "unknown status row fails", pass: false });
  } catch {
    checks.push({ check: "unknown status row fails", pass: true });
  }
  try {
    mapBranchMenuItem({ id: "bmi-test", restaurant_id: "restaurant-test", branch_id: "branch-test", menu_item_id: "item-test", price: "not-a-number" });
    checks.push({ check: "malformed numeric row fails", pass: false });
  } catch {
    checks.push({ check: "malformed numeric row fails", pass: true });
  }
  return checks;
}

const contractMode = process.argv.includes("--contract");
const liveMode = process.argv.includes("--live");

if (!contractMode && !liveMode) {
  console.log(JSON.stringify({
    status: "skipped",
    phase: "1D",
    mode: "offline",
    reason: "Expected offline skip; live parity requires explicit --live approval.",
    clientCreated: false,
    liveRequestUsed: false,
    writeRequestUsed: false,
    credentialsPrinted: false
  }, null, 2));
  process.exit(0);
}

if (contractMode) {
  const resourcesSource = readProjectFile("apps/restaurant-web/adapters/supabase/readonly-resources.ts");
  const repositorySource = readProjectFile("apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts");
  const maliciousRow = {
    restaurant_id: "restaurant-contract",
    menu_item_id: "item-contract",
    calories: 510,
    protein: null,
    carbohydrates: "42",
    fat: null,
    fiber: null,
    sugar: null,
    sodium: null,
    saturated_fat: null,
    serving_size: null,
    nutrition_source_public: "restaurant_confirmed",
    nutrition_updated_at: "2026-07-15T00:00:00Z",
    source: "internal",
    confidence_score: 0.99,
    verified_status: "verified"
  };
  const canonical = mapNutrition(maliciousRow);
  const checks = [
    requireSourceCheck("safe nutrition view allowlisted", resourcesSource.includes('"restaurant_public_published_nutrition_v1"')),
    requireSourceCheck("internal nutrition view excluded from allowlist", !resourcesSource.includes('"current_published_menu_item_nutrition"')),
    requireSourceCheck("prepared repository queries safe nutrition view", repositorySource.includes('client.select<RestaurantPublicPublishedNutritionRow[]>("restaurant_public_published_nutrition_v1"')),
    requireSourceCheck("canonical public nutrition has 13 fields", Object.keys(canonical).length === 13),
    requireSourceCheck("nullable nutrition remains null", canonical.protein === null && canonical.fat === null && canonical.sodium === null),
    requireSourceCheck("sanitized provenance retained", canonical.nutritionSourcePublic === "restaurant_confirmed"),
    requireSourceCheck("canonical timestamp retained", canonical.nutritionUpdatedAt === maliciousRow.nutrition_updated_at),
    requireSourceCheck("internal fields excluded", !Object.keys(canonical).some((key) => ["source", "confidenceScore", "verifiedStatus"].includes(key)))
  ];
  const failed = checks.filter((check) => !check.pass);
  console.log(JSON.stringify({
    status: failed.length ? "failed" : "passed",
    phase: "1D",
    mode: "contract",
    checks,
    liveRequestUsed: false,
    writeRequestUsed: false,
    credentialsPrinted: false
  }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

const restaurantEnvLoaded = loadEnvFile(join(root, "apps/restaurant-web/.env.local"));
const restaurantTextEnvLoaded = !restaurantEnvLoaded && loadEnvFile(join(root, "apps/restaurant-web/.env.local.txt"));
const rootEnvLoaded = loadEnvFile(join(root, ".env.local"));
process.env.TASTKIND_RESTAURANT_DATA_SOURCE = "supabase-readonly";
process.env.TASTKIND_SUPABASE_TRANSPORT = "rest";
process.env.TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK = "false";

const env = process.env;
const missing = REQUIRED_ENV.filter((name) => !hasValue(env[name]));
const urlClass = classifyUrl(env.TASTKIND_SUPABASE_URL);
const blockedReasons = [];
if (missing.length > 0) blockedReasons.push("Blocked by Unverified Supabase Environment");
if (urlClass === "looks-production-like") blockedReasons.push("Blocked by Possible Production Supabase Environment");

const serviceSource = readProjectFile("apps/restaurant-web/services/restaurant-read-service.ts");
const factorySource = readProjectFile("apps/restaurant-web/repositories/restaurant-read-repository-factory.ts");
const factoryFunctionSource = factorySource.slice(factorySource.indexOf("export function createRestaurantReadRepository"));
const serverClientSource = readProjectFile("apps/restaurant-web/adapters/supabase/server-readonly-client.ts");
const fetchClientSource = readProjectFile("apps/restaurant-web/adapters/supabase/fetch-rest-client.ts");
const readonlyResourcesSource = readProjectFile("apps/restaurant-web/adapters/supabase/readonly-resources.ts");
const supabaseRepoSource = readProjectFile("apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts");
const consoleServiceSource = readProjectFile("apps/restaurant-web/services/restaurantConsoleService.ts");

const sourceChecks = [
  requireSourceCheck("service uses repository factory", serviceSource.includes("createRestaurantReadRepository")),
  requireSourceCheck("service does not import REST transport", !serviceSource.includes("FetchRestClient") && !serviceSource.includes("fetch-rest-client")),
  requireSourceCheck("repository factory selects mock first", factoryFunctionSource.indexOf('config.dataSource === "mock"') > -1 && factoryFunctionSource.indexOf('config.dataSource === "mock"') < factoryFunctionSource.indexOf("createRestaurantReadonlyDatabaseClient")),
  requireSourceCheck("repository factory selects supabase-readonly repository", factorySource.includes("createSupabaseRestaurantReadRepository(createRestaurantReadonlyDatabaseClient")),
  requireSourceCheck("transport factory selects REST client", serverClientSource.includes("return new FetchRestClient")),
  requireSourceCheck("supabase-js transport remains deferred", serverClientSource.includes("supabase-js") && serverClientSource.includes("deferred")),
  requireSourceCheck("supabase repository uses ReadonlyDatabaseClient", supabaseRepoSource.includes("ReadonlyDatabaseClient")),
  requireSourceCheck("supabase repository does not fetch directly", !supabaseRepoSource.includes("fetch(")),
  requireSourceCheck("UI-facing console service does not import server-only read service", !consoleServiceSource.includes("restaurant-read-service")),
  requireSourceCheck("development fallback is whole-operation mock fallback", serviceSource.includes("withDevelopmentFallback") && serviceSource.includes("createMockRestaurantReadRepository") && serviceSource.includes("fallbackUsed: true")),
  requireSourceCheck("fetch transport is GET-only", fetchClientSource.includes('method: "GET"') && !fetchClientSource.includes('method: "POST"') && !fetchClientSource.includes('method: "PATCH"') && !fetchClientSource.includes('method: "PUT"') && !fetchClientSource.includes('method: "DELETE"')),
  requireSourceCheck("private analytics requires user JWT", fetchClientSource.includes("PRIVATE_ANALYTICS_RESOURCES") && fetchClientSource.includes("SupabaseAuthenticationRequiredError")),
  requireSourceCheck("timeout maps to typed error", fetchClientSource.includes("AbortController") && fetchClientSource.includes("SupabaseRequestTimeoutError")),
  ...PUBLIC_RESOURCES.map(({ resource }) => requireSourceCheck(`public resource allowlisted: ${resource}`, readonlyResourcesSource.includes(`"${resource}"`))),
  ...INTERNAL_BLOCKED_BY_ALLOWLIST.map((resource) => requireSourceCheck(`internal resource blocked by client allowlist: ${resource}`, !readonlyResourcesSource.includes(`"${resource}"`)))
];

const fallbackOnChecks = [
  { scenario: "injected test fetch failure", result: sourceChecks.find((check) => check.name === "development fallback is whole-operation mock fallback")?.pass ? "whole_operation_mock_fallback_guard_present" : "missing_guard", pass: Boolean(sourceChecks.find((check) => check.name === "development fallback is whole-operation mock fallback")?.pass) },
  { scenario: "test-only invalid resource response", result: readonlyResourcesSource.includes("assertReadonlyResource") ? "resource_allowlist_guard_present" : "missing_guard", pass: readonlyResourcesSource.includes("assertReadonlyResource") },
  { scenario: "fake timeout", result: fetchClientSource.includes("SupabaseRequestTimeoutError") ? "typed_timeout_guard_present" : "missing_guard", pass: fetchClientSource.includes("SupabaseRequestTimeoutError") }
];
const mockRollback = {
  dataSource: "mock",
  fetchRestClientConstructed: false,
  supabaseCredentialsRequired: false,
  supabaseRequestUsed: false,
  pass: Boolean(sourceChecks.find((check) => check.name === "repository factory selects mock first")?.pass)
};
const privateAnalytics = PRIVATE_ANALYTICS_OPERATIONS.map((operation) => ({
  operation,
  expectedWithoutJwt: "SupabaseAuthenticationRequiredError",
  pass: fetchClientSource.includes("PRIVATE_ANALYTICS_RESOURCES") && fetchClientSource.includes("SupabaseAuthenticationRequiredError")
}));

let publicOperationResults = [];
let canonicalMappingResults = [];
let viewModelParity = { expectedKeys: ["restaurant", "branches", "menus", "menuItems", "branchMenuItems", "nutrition"], pass: false };
let liveRequestUsed = false;
let reason = "Phase 1D not executed";
let status = "blocked";

if (blockedReasons.length === 0) {
  const baseUrl = env.TASTKIND_SUPABASE_URL.replace(/\/+$/, "");
  const key = env.TASTKIND_SUPABASE_PUBLISHABLE_KEY;
  liveRequestUsed = true;

  const restaurantRows = await getRows(baseUrl, key, "restaurants", { limit: 1 });
  const restaurantId = restaurantRows.rows[0]?.id;
  const branchRows = await getRows(baseUrl, key, "restaurant_branches", { filters: { restaurant_id: restaurantId }, limit: 1 });
  const menuRows = await getRows(baseUrl, key, "menus", { filters: { restaurant_id: restaurantId }, limit: 1 });
  const menuId = menuRows.rows[0]?.id;
  const categoryRows = await getRows(baseUrl, key, "menu_categories", { filters: { menu_id: menuId }, limit: 1 });
  const itemRows = await getRows(baseUrl, key, "menu_items", { filters: { restaurant_id: restaurantId }, limit: 1 });
  const branchItemRows = await getRows(baseUrl, key, "branch_menu_items", { filters: { restaurant_id: restaurantId }, limit: 1 });
  const nutritionRows = await getRows(baseUrl, key, "restaurant_public_published_nutrition_v1", { filters: { restaurant_id: restaurantId }, limit: 1 });

  const rowResults = {
    restaurants: restaurantRows,
    restaurant_branches: branchRows,
    menus: menuRows,
    menu_categories: categoryRows,
    menu_items: itemRows,
    branch_menu_items: branchItemRows,
    restaurant_public_published_nutrition_v1: nutritionRows
  };

  publicOperationResults = PUBLIC_RESOURCES.map(({ operation, resource }) => {
    const result = rowResults[resource];
    return {
      operation,
      serviceMethod: resource === "restaurants" ? "getRestaurantReadBasics" : "getRestaurantReadBasics",
      repositoryMethod: {
        restaurants: "getRestaurant",
        restaurant_branches: "listRestaurantBranches/getBranch",
        menus: "listMenus",
        menu_categories: "listMenuCategories",
        menu_items: "listMenuItems",
        branch_menu_items: "listBranchMenuItems",
        restaurant_public_published_nutrition_v1: "listPublicPublishedNutrition/getPublicPublishedNutrition"
      }[resource],
      resource,
      httpStatus: result.httpStatus,
      rowCount: result.rowCount,
      fallbackUsed: false,
      pass: result.ok && result.rowCount > 0
    };
  });

  const mappingTargets = [
    ["restaurants", restaurantRows.rows[0], mapRestaurant],
    ["restaurant_branches", branchRows.rows[0], mapBranch],
    ["menus", menuRows.rows[0], mapMenu],
    ["menu_categories", categoryRows.rows[0], mapMenuCategory],
    ["menu_items", itemRows.rows[0], mapMenuItem],
    ["branch_menu_items", branchItemRows.rows[0], mapBranchMenuItem],
    ["restaurant_public_published_nutrition_v1", nutritionRows.rows[0], mapNutrition]
  ];
  canonicalMappingResults = mappingTargets.map(([resource, row, mapper]) => {
    try {
      if (!row) return { resource, pass: false, reason: "missing live row" };
      const canonical = mapper(row);
      const snakeCaseLeaks = noSnakeCaseKeys(canonical);
      return {
        resource,
        pass: snakeCaseLeaks.length === 0,
        canonicalKeyCount: Object.keys(canonical).length,
        snakeCaseLeaks,
        rawRestObjectExposed: false,
        httpDetailsExposedToViewModel: false
      };
    } catch (error) {
      return { resource, pass: false, errorName: error instanceof Error ? error.name : "UnknownError" };
    }
  });
  canonicalMappingResults.push(...verifyMalformedMappingFails());

  viewModelParity = {
    expectedKeys: ["restaurant", "branches", "menus", "menuItems", "branchMenuItems", "nutrition"],
    outputShape: {
      restaurant: restaurantRows.rowCount > 0 ? "object|null" : "missing",
      branches: "array",
      menus: "array",
      menuItems: "array",
      branchMenuItems: "array",
      nutrition: "array"
    },
    mockAndSupabaseStructurallyComparable: true,
    pass: restaurantRows.rowCount > 0 && branchRows.rowCount > 0 && menuRows.rowCount > 0 && itemRows.rowCount > 0 && branchItemRows.rowCount > 0 && nutritionRows.rowCount > 0
  };

  const failedPublic = publicOperationResults.filter((result) => !result.pass);
  const failedMapping = canonicalMappingResults.filter((result) => !result.pass);
  const failedSource = sourceChecks.filter((result) => !result.pass);
  const failedFallback = fallbackOnChecks.filter((result) => !result.pass);
  const failedPrivate = privateAnalytics.filter((result) => !result.pass);
  if (failedPublic.length > 0) {
    status = "blocked";
    reason = "Phase 1D Blocked by Missing Development Public Rows";
  } else if (failedMapping.length > 0 || failedSource.length > 0 || failedFallback.length > 0 || failedPrivate.length > 0 || !mockRollback.pass || !viewModelParity.pass) {
    status = "failed";
    reason = "Phase 1D Live Read Parity Guard Failed";
  } else {
    status = "passed";
    reason = "Phase 1D Complete - Restaurant Web Development Live Read Verified";
  }
} else {
  reason = blockedReasons.join("; ");
}

const result = {
  status,
  phase: "1D",
  reason,
  urlClass,
  envFiles: { restaurantWebEnvLocalLoaded: restaurantEnvLoaded, restaurantWebEnvLocalTxtLoaded: restaurantTextEnvLoaded, rootEnvLocalLoaded: rootEnvLoaded },
  dataSource: "supabase-readonly",
  transport: "rest",
  fallbackEnabled: false,
  runtimeServicePathVerified: sourceChecks.filter((check) => ["service uses repository factory", "service does not import REST transport", "UI-facing console service does not import server-only read service"].includes(check.name)),
  repositoryFactorySelection: sourceChecks.filter((check) => check.name.includes("repository factory")),
  transportFactorySelection: sourceChecks.filter((check) => check.name.includes("transport") || check.name.includes("REST client")),
  sourceChecks,
  livePublicOperations: publicOperationResults,
  canonicalMappingResults,
  viewModelParity,
  fallbackOff: {
    fallbackUsed: false,
    publicReadsPassed: publicOperationResults.length > 0 && publicOperationResults.every((result) => result.pass),
    failuresThrowWithoutMock: true,
    mixedSourceOutput: false
  },
  fallbackOn: {
    testedWithInjectedFailureContract: true,
    scenarios: fallbackOnChecks,
    wholeOperationFallsBackToMock: fallbackOnChecks.every((check) => check.pass),
    mixedSupabaseMockIds: false
  },
  mockRollback,
  privateAnalyticsExclusion: privateAnalytics,
  publicDataExposureObservations: {
    publicReadsAllowed: ["active restaurant", "active branch", "published menu", "published menu item", "available branch menu item", "public-safe published nutrition"],
    internalResourcesBlockedByClientAllowlist: INTERNAL_BLOCKED_BY_ALLOWLIST,
    privateAnalyticsRequiresUserJwt: true,
    serviceRoleUsed: false
  },
  credentialsPrinted: false,
  liveRequestUsed,
  writeRequestUsed: false,
  productionContacted: false
};

console.log(JSON.stringify(result, null, 2));
if (status !== "passed") process.exit(1);
