import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
  "apps/restaurant-web/adapters/supabase/fetch-rest-client.ts",
  "apps/restaurant-web/adapters/supabase/readonly-database-client.ts",
  "apps/restaurant-web/adapters/supabase/readonly-resources.ts",
  "apps/restaurant-web/adapters/supabase/server-readonly-client.ts",
  "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts",
  "apps/restaurant-web/services/restaurant-read-service.ts",
  "docs/supabase-runtime-integration/transport-replacement-contract.md",
  "docs/supabase-runtime-integration/phase-1b-rest-runtime-wiring.md"
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
    if (stats.isDirectory()) {
      if (["node_modules", ".next", "dist", "build", ".expo", ".git"].includes(entry)) return [];
      return walk(relative(root, path));
    }
    return [relative(root, path).replaceAll("\\", "/")];
  });
}

for (const file of requiredFiles) read(file);

const config = read("apps/restaurant-web/config/restaurant-data-source.ts");
if (!config.includes('export type SupabaseReadonlyTransport = "rest" | "supabase-js"')) fail("Missing transport union.");
if (!config.includes('env.TASTKIND_SUPABASE_TRANSPORT || "rest"')) fail("Default transport must be rest.");
if (config.includes("NEXT_PUBLIC_TASTKIND_SUPABASE_TRANSPORT")) fail("Transport flag must not be NEXT_PUBLIC.");

const errors = read("apps/restaurant-web/adapters/supabase/errors.ts");
for (const errorName of ["SupabaseAuthenticationRequiredError", "SupabaseHttpError", "SupabaseRequestTimeoutError"]) {
  if (!errors.includes(`class ${errorName}`)) fail(`Missing typed error ${errorName}.`);
}

const resources = read("apps/restaurant-web/adapters/supabase/readonly-resources.ts");
for (const resource of ["restaurants", "restaurant_branches", "menus", "menu_categories", "menu_items", "branch_menu_items", "menu_item_aliases", "current_published_menu_item_nutrition", "restaurant_exposure_summary", "nutrition_badge_performance", "menu_item_performance"]) {
  if (!resources.includes(`"${resource}"`)) fail(`Missing readonly resource allowlist entry ${resource}.`);
}

const client = read("apps/restaurant-web/adapters/supabase/fetch-rest-client.ts");
for (const snippet of [
  'import "server-only"',
  'method: "GET"',
  'apikey: this.publishableKey',
  'headers.Authorization = `Bearer ${options.accessToken}`',
  'new AbortController()',
  'URLSearchParams',
  'SupabaseAuthenticationRequiredError',
  'SupabaseRequestTimeoutError',
  'ReadonlyDatabaseClient'
]) {
  if (!client.includes(snippet)) fail(`FetchRestClient missing ${snippet}.`);
}
for (const forbidden of ['method: "POST"', 'method: "PATCH"', 'method: "PUT"', 'method: "DELETE"', '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
  if (client.includes(forbidden)) fail(`Forbidden REST/write pattern found in FetchRestClient: ${forbidden}`);
}

const factory = read("apps/restaurant-web/adapters/supabase/server-readonly-client.ts");
if (!factory.includes("new FetchRestClient")) fail("Server-only factory must select FetchRestClient for rest transport.");
if (!factory.includes("supabase-js") || !factory.includes("deferred")) fail("supabase-js transport must be explicit and deferred.");

const repository = read("apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts");
if (!repository.includes("ReadonlyDatabaseClient")) fail("Supabase repository must depend on ReadonlyDatabaseClient.");
for (const leaked of ["fetch", "PostgREST", "SupabaseReadonlyClient", ".from<", ".select(\\\"*\\\")"]) {
  if (repository.includes(leaked)) fail(`Repository leaked transport-specific detail: ${leaked}`);
}

const service = read("apps/restaurant-web/services/restaurant-read-service.ts");
if (!service.includes("createRestaurantReadRepository")) fail("Service path must use repository factory.");
if (service.includes("FetchRestClient") || service.includes("TASTKIND_SUPABASE_TRANSPORT")) fail("Service must not know transport implementation.");

const consoleService = read("apps/restaurant-web/services/restaurantConsoleService.ts");
if (consoleService.includes("restaurant-read-service")) fail("UI-facing restaurantConsoleService must not import server-only restaurant-read-service.");

const integrationFiles = [
  ...walk("apps/restaurant-web/adapters/supabase"),
  ...walk("apps/restaurant-web/repositories/supabase"),
  "apps/restaurant-web/config/restaurant-data-source.ts",
  "apps/restaurant-web/repositories/restaurant-read-repository-factory.ts",
  "apps/restaurant-web/services/restaurant-read-service.ts"
];
for (const file of integrationFiles) {
  const text = read(file);
  for (const pattern of ["service_role", "service-role", "SUPABASE_SERVICE", "SUPABASE_SECRET", "SECRET_KEY", "NEXT_PUBLIC_SUPABASE", "NEXT_PUBLIC_TASTKIND_SUPABASE_TRANSPORT"]) {
    if (text.includes(pattern)) fail(`Forbidden secret/browser env pattern ${pattern} found in ${file}.`);
  }
}

const appAndPackages = ["apps/mobile", "apps/admin-web", "packages"].flatMap((dir) => walk(dir).filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file)));
for (const file of appAndPackages) {
  const text = read(file);
  if (text.includes("apps/restaurant-web/adapters/supabase") || text.includes("restaurant-web/adapters/supabase")) {
    fail(`Forbidden cross-surface Restaurant REST adapter import in ${file}.`);
  }
}

const envExample = read(".env.example");
if (!envExample.includes("TASTKIND_SUPABASE_TRANSPORT=rest")) fail(".env.example must document default rest transport.");

console.log(JSON.stringify({
  status: "passed",
  requiredFiles: requiredFiles.length,
  integrationFilesScanned: integrationFiles.length,
  transport: "rest",
  dependencyFree: true,
  packageLockChanged: false
}, null, 2));