import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "apps/restaurant-web/config/restaurant-data-source.ts",
  "apps/restaurant-web/adapters/supabase/errors.ts",
  "apps/restaurant-web/adapters/supabase/server-readonly-client.ts",
  "apps/restaurant-web/adapters/supabase/mappers.ts",
  "apps/restaurant-web/adapters/supabase/rows.ts",
  "apps/restaurant-web/repositories/restaurant-read-repository.ts",
  "apps/restaurant-web/repositories/mock-restaurant-read-repository.ts",
  "apps/restaurant-web/repositories/restaurant-read-repository-factory.ts",
  "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts"
];

const forbiddenWritePatterns = [".insert(", ".update(", ".upsert(", ".delete(", ".rpc(\"write", ".rpc('write"];
const forbiddenSecretPatterns = ["service_role", "service-role", "SUPABASE_SERVICE", "SECRET_KEY"];
const requiredMapperExports = [
  "mapRestaurantRow",
  "mapRestaurantBranchRow",
  "mapMenuRow",
  "mapMenuCategoryRow",
  "mapMenuItemRow",
  "mapBranchMenuItemRow",
  "mapMenuItemAliasRow",
  "mapMenuItemNutritionRow"
];

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(dir) {
  const absolute = join(root, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return walk(relative(root, path));
    return [relative(root, path).replaceAll("\\", "/")];
  });
}

for (const file of requiredFiles) {
  read(file);
}

const config = read("apps/restaurant-web/config/restaurant-data-source.ts");
if (!config.includes('rawDataSource = env.TASTKIND_RESTAURANT_DATA_SOURCE || "mock"')) fail("Config default must remain mock.");
if (!config.includes('dataSource === "supabase-readonly"')) fail("Config must support supabase-readonly flag.");
if (!config.includes("Production Restaurant Web Supabase readonly mode cannot silently fall back to mock data")) fail("Production fallback must fail closed.");
if (config.includes("NEXT_PUBLIC_")) fail("Restaurant runtime config must not use NEXT_PUBLIC_ Supabase keys.");

const client = read("apps/restaurant-web/adapters/supabase/server-readonly-client.ts");
if (!client.includes('import "server-only"')) fail("Supabase client factory must be server-only guarded.");
if (!client.includes("ReadonlyDatabaseClient")) fail("Supabase client factory must expose injectable readonly database client type.");
if (client.includes("createClient")) fail("Phase 1A must not instantiate a live Supabase SDK client.");

const mappers = read("apps/restaurant-web/adapters/supabase/mappers.ts");
for (const exportName of requiredMapperExports) {
  if (!mappers.includes(`export function ${exportName}`)) fail(`Missing mapper export: ${exportName}`);
}
if (!mappers.includes("published") || !mappers.includes("Unsupported")) fail("Mappers must explicitly handle status mapping and unsupported states.");
if (mappers.includes("row as ")) fail("Mappers must not cast whole rows into canonical entities.");

const repositoryInterface = read("apps/restaurant-web/repositories/restaurant-read-repository.ts");
for (const method of [
  "getRestaurant",
  "listRestaurantBranches",
  "getBranch",
  "listMenus",
  "listMenuCategories",
  "listMenuItems",
  "listBranchMenuItems",
  "listMenuItemAliases",
  "getCurrentPublishedNutrition",
  "listCurrentPublishedNutrition",
  "getRestaurantDashboardSummary",
  "getRestaurantExposureAnalytics",
  "getNutritionBadgePerformance",
  "getMenuItemPerformance"
]) {
  if (!repositoryInterface.includes(method)) fail(`Repository interface missing ${method}.`);
}

const integrationFiles = [
  ...walk("apps/restaurant-web/adapters/supabase"),
  ...walk("apps/restaurant-web/repositories/supabase"),
  "apps/restaurant-web/config/restaurant-data-source.ts",
  "apps/restaurant-web/repositories/restaurant-read-repository-factory.ts"
];
for (const file of integrationFiles) {
  const text = read(file);
  for (const pattern of forbiddenWritePatterns) {
    if (text.includes(pattern)) fail(`Forbidden write operation pattern ${pattern} found in ${file}.`);
  }
  for (const pattern of forbiddenSecretPatterns) {
    if (text.includes(pattern)) fail(`Forbidden secret/service-role pattern ${pattern} found in ${file}.`);
  }
  if (text.includes("NEXT_PUBLIC_SUPABASE")) fail(`Browser-exposed Supabase env reference found in ${file}.`);
}

const envExample = read(".env.example");
for (const key of [
  "TASTKIND_RESTAURANT_DATA_SOURCE=mock",
  "TASTKIND_SUPABASE_URL=",
  "TASTKIND_SUPABASE_PUBLISHABLE_KEY=",
  "TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK=true"
]) {
  if (!envExample.includes(key)) fail(`Missing .env.example placeholder ${key}`);
}

console.log(JSON.stringify({
  status: "passed",
  requiredFiles: requiredFiles.length,
  integrationFilesScanned: integrationFiles.length,
  forbiddenWritePatterns,
  forbiddenSecretPatterns
}, null, 2));



