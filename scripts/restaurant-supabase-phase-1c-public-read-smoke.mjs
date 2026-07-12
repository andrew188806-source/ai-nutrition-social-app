import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const REQUIRED_ENV = [
  "TASTKIND_SUPABASE_URL",
  "TASTKIND_SUPABASE_PUBLISHABLE_KEY"
];
const PUBLIC_RESOURCES = [
  "restaurants",
  "restaurant_branches",
  "menus",
  "menu_categories",
  "menu_items",
  "branch_menu_items",
  "current_published_menu_item_nutrition"
];
const INTERNAL_EXCLUDED = [
  "pending_menu_items",
  "nutrition_estimates",
  "nutrition_reviews",
  "menu_item_aliases",
  "analytics_events",
  "restaurant_employees",
  "restaurant_users",
  "audit_logs",
  "admin_action_drafts"
];

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

function blocked(reason, details = {}) {
  console.log(JSON.stringify({
    status: "blocked",
    phase: "1C",
    reason,
    ...details,
    credentialsPrinted: false,
    liveRequestUsed: false,
    writeRequestUsed: false
  }, null, 2));
  process.exit(0);
}

const restaurantEnvLoaded = loadEnvFile(join(root, "apps/restaurant-web/.env.local"));
const restaurantTextEnvLoaded = !restaurantEnvLoaded && loadEnvFile(join(root, "apps/restaurant-web/.env.local.txt"));
const rootEnvLoaded = loadEnvFile(join(root, ".env.local"));
process.env.TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK = "false";
process.env.TASTKIND_RESTAURANT_DATA_SOURCE = process.env.TASTKIND_RESTAURANT_DATA_SOURCE || "supabase-readonly";
process.env.TASTKIND_SUPABASE_TRANSPORT = process.env.TASTKIND_SUPABASE_TRANSPORT || "rest";

const env = process.env;
const missing = REQUIRED_ENV.filter((name) => !hasValue(env[name]));
if (missing.length > 0) {
  blocked("Blocked by Unverified Supabase Environment", {
    missing,
    envFiles: { restaurantWebEnvLocalLoaded: restaurantEnvLoaded, restaurantWebEnvLocalTxtLoaded: restaurantTextEnvLoaded, rootEnvLocalLoaded: rootEnvLoaded },
    envPresence: Object.fromEntries(REQUIRED_ENV.map((name) => [name, hasValue(env[name])]))
  });
}

const urlClass = classifyUrl(env.TASTKIND_SUPABASE_URL);
if (urlClass === "looks-production-like") {
  blocked("Blocked by Possible Production Supabase Environment", { urlClass });
}

const resourceFile = readFileSync(join(root, "apps/restaurant-web/adapters/supabase/readonly-resources.ts"), "utf8");
const missingAllowlistResources = PUBLIC_RESOURCES.filter((resource) => !resourceFile.includes(`"${resource}"`));
if (missingAllowlistResources.length > 0) {
  blocked("Blocked by Missing Public Resource Allowlist", { missingResources: missingAllowlistResources });
}

const baseUrl = env.TASTKIND_SUPABASE_URL.replace(/\/+$/, "");
const results = [];
for (const resource of PUBLIC_RESOURCES) {
  const requestUrl = `${baseUrl}/rest/v1/${resource}?select=*&limit=1`;
  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        apikey: env.TASTKIND_SUPABASE_PUBLISHABLE_KEY,
        Accept: "application/json"
      }
    });
    let rowCount = 0;
    let shape = "unknown";
    let safeErrorCategory;
    if (response.ok) {
      const json = await response.json();
      shape = Array.isArray(json) ? "array" : typeof json;
      rowCount = Array.isArray(json) ? json.length : 0;
    } else if (response.status === 404) {
      safeErrorCategory = "missing_resource";
    } else if (response.status === 401 || response.status === 403) {
      safeErrorCategory = "auth_or_rls_denied";
    } else {
      safeErrorCategory = "http_error";
    }
    results.push({ operation: "public-read", resource, httpStatus: response.status, ok: response.ok, rowCount, responseShape: shape, safeErrorCategory });
  } catch (error) {
    results.push({ operation: "public-read", resource, ok: false, errorCategory: error instanceof Error ? error.name : "UnknownError" });
  }
}

const missingSchemaResources = results.filter((result) => result.httpStatus === 404).map((result) => result.resource);
const failed = results.filter((result) => !result.ok);
const totalRows = results.reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
let status;
let reason;
if (missingSchemaResources.length > 0) {
  status = "blocked";
  reason = "Phase 1C Blocked by Missing Development Schema";
} else if (failed.length === 0) {
  status = totalRows > 0 ? "passed" : "blocked";
  reason = totalRows > 0 ? "Development Public Read Verified" : "Development Connection Verified with Empty Dataset - Phase 1C Blocked by Missing Development Seed Data";
} else {
  status = "failed";
  reason = "Live REST query failed";
}

console.log(JSON.stringify({
  status,
  phase: "1C",
  reason,
  urlClass,
  envFiles: { restaurantWebEnvLocalLoaded: restaurantEnvLoaded, restaurantWebEnvLocalTxtLoaded: restaurantTextEnvLoaded, rootEnvLocalLoaded: rootEnvLoaded },
  dataSource: env.TASTKIND_RESTAURANT_DATA_SOURCE || "mock",
  transport: env.TASTKIND_SUPABASE_TRANSPORT || "rest",
  fallbackEnabled: env.TASTKIND_SUPABASE_READONLY_FALLBACK_TO_MOCK !== "false",
  missingSchemaResources,
  missingSeedData: missingSchemaResources.length === 0 && failed.length === 0 && totalRows === 0,
  publicResourcesTested: PUBLIC_RESOURCES,
  internalResourcesIntentionallyExcluded: INTERNAL_EXCLUDED,
  results,
  credentialsPrinted: false,
  liveRequestUsed: true,
  writeRequestUsed: false
}, null, 2));