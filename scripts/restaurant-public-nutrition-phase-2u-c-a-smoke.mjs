import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const contractMode = process.argv.includes("--contract");

if (!contractMode) {
  console.log(JSON.stringify({
    status: "skipped",
    phase: "2U-C-A",
    mode: "offline",
    reason: "Expected offline skip; use --contract for the local fake-client contract smoke.",
    clientCreated: false,
    networkRequestMade: false,
    databaseReadExecuted: false,
    databaseWriteExecuted: false,
    credentialsUsed: false
  }, null, 2));
  process.exit(0);
}

const requireFromRoot = createRequire(path.join(root, "package.json"));
const ts = requireFromRoot("typescript");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tastkind-2u-c-a-"));
const checks = [];
const issues = [];

function pass(name) { checks.push({ name, pass: true }); }
function fail(name, message) { checks.push({ name, pass: false, message }); issues.push({ name, message }); }
function check(name, condition, message) { if (condition) pass(name); else fail(name, message); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function compile(rel) {
  const source = read(rel);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: rel
  }).outputText;
  const target = path.join(tempRoot, rel.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
}

try {
  for (const rel of [
    "apps/restaurant-web/adapters/supabase/errors.ts",
    "apps/restaurant-web/adapters/supabase/mappers.ts",
    "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts"
  ]) compile(rel);

  const compiledRepository = createRequire(path.join(tempRoot, "package.json"))(
    path.join(tempRoot, "apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.js")
  );
  const calls = [];
  let writeCount = 0;
  const row = {
    restaurant_id: "restaurant-contract",
    menu_item_id: "item-contract",
    calories: "520",
    protein: null,
    carbohydrates: null,
    fat: null,
    fiber: null,
    sugar: null,
    sodium: null,
    saturated_fat: null,
    serving_size: null,
    nutrition_source_public: "restaurant_confirmed",
    nutrition_updated_at: "2026-07-15T00:00:00Z",
    id: "internal-row-id",
    source: "restaurant_verified",
    confidence_score: 0.99,
    verified_status: "verified",
    is_current: true
  };
  const client = {
    select: async (resource, options) => {
      calls.push({ resource, authenticated: Boolean(options?.accessToken), operation: options?.operation });
      if (resource !== "restaurant_public_published_nutrition_v1") throw new Error(`Unexpected resource: ${resource}`);
      return [row];
    }
  };
  const repository = compiledRepository.createSupabaseRestaurantReadRepository(client);
  const anonRows = await repository.listPublicPublishedNutrition("restaurant-contract");
  const authenticatedRow = await repository.getPublicPublishedNutrition("item-contract", { accessToken: "opaque-local-contract-token" });
  const publicKeys = [
    "restaurantId", "menuItemId", "calories", "protein", "carbohydrates", "fat", "fiber", "sugar",
    "sodium", "saturatedFat", "servingSize", "nutritionSourcePublic", "nutritionUpdatedAt"
  ];
  const canonical = authenticatedRow;

  check("only the safe projection resource is queried", calls.every((call) => call.resource === "restaurant_public_published_nutrition_v1"), "An internal resource was queried.");
  check("anon public read path is configurable", calls.some((call) => !call.authenticated), "No tokenless public read was observed.");
  check("authenticated public read path is configurable", calls.some((call) => call.authenticated), "No authenticated public read was observed.");
  check("canonical output has exactly the 13 public fields", canonical && JSON.stringify(Object.keys(canonical)) === JSON.stringify(publicKeys), "Canonical field set differs from the public contract.");
  check("nullable macros remain null", canonical && canonical.protein === null && canonical.carbohydrates === null && canonical.sodium === null, "A nullable macro was coerced.");
  check("sanitized provenance is retained", canonical?.nutritionSourcePublic === "restaurant_confirmed", "Sanitized provenance changed.");
  check("canonical timestamp is retained", canonical?.nutritionUpdatedAt === row.nutrition_updated_at, "Nutrition timestamp changed.");
  check("malicious internal fields are excluded", canonical && !["id", "source", "confidenceScore", "verifiedStatus", "isCurrent"].some((key) => key in canonical), "Internal fields leaked into canonical output.");
  check("list and single public methods both map safely", anonRows.length === 1 && anonRows[0].protein === null && authenticatedRow?.menuItemId === "item-contract", "Public repository mapping failed.");

  const readsBeforeUnsupported = calls.length;
  let getUnsupported = false;
  let listUnsupported = false;
  try { await repository.getCurrentPublishedNutrition("item-contract"); } catch { getUnsupported = true; }
  try { await repository.listCurrentPublishedNutrition("restaurant-contract"); } catch { listUnsupported = true; }
  check("internal nutrition methods fail before any client query", getUnsupported && listUnsupported && calls.length === readsBeforeUnsupported, "An internal method queried the client or did not fail closed.");

  const repoSource = read("apps/restaurant-web/repositories/supabase/supabase-restaurant-read-repository.ts");
  const activeUiDiff = requireFromRoot("node:child_process").spawnSync("git", ["diff", "--name-only", "--", "apps/restaurant-web/app", "apps/restaurant-web/components", "apps/restaurant-web/services/restaurantConsoleService.ts"], { cwd: root, encoding: "utf8", windowsHide: true });
  check("no raw or internal nutrition query exists", !/client\.select[^\n]*(?:current_published_menu_item_nutrition|["']menu_item_nutrition["'])/.test(repoSource), "Internal query found in prepared repository source.");
  check("zero write and owner workflow mutation", writeCount === 0 && !/\.(insert|update|upsert|delete|rpc)\s*\(/.test(repoSource), "Write capability was found.");
  check("zero active page wiring", activeUiDiff.status === 0 && !activeUiDiff.stdout.trim(), "Active UI wiring changed.");
} catch (error) {
  fail("contract smoke execution", error instanceof Error ? error.message : String(error));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2U-C-A",
  mode: "contract",
  checks,
  issues,
  networkRequestMade: false,
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  ownerWorkflowMutationExecuted: false,
  activePageWiringChanged: false,
  credentialsUsed: false,
  temporaryArtifactsRemoved: !fs.existsSync(tempRoot)
}, null, 2));
process.exit(issues.length ? 1 : 0);
