import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const ratingRoot = path.join(featureRoot, "consumer-ratings");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-ratings-phase2w-c-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function expect(condition, name, message = "Contract assertion failed.") {
  if (!condition) throw new Error(`${name}: ${message}`);
  checks.push({ name, pass: true });
}

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.columns = null;
    this.filters = [];
    this.orders = [];
  }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  order(column, options) { this.orders.push([column, options]); return this; }
  maybeSingle() { return this.client.finishQuery(this, "single"); }
  then(resolve, reject) { return this.client.finishQuery(this, "list").then(resolve, reject); }
}

class FakeRatingClient {
  constructor() {
    this.queryCalls = [];
    this.rpcCalls = [];
    this.responses = { single: new Map(), list: new Map(), rpc: [] };
  }
  from(table) { return new FakeQuery(this, table); }
  rpc(name, args) {
    this.rpcCalls.push({ name, args });
    return settle(this.responses.rpc.shift());
  }
  queue(mode, table, response) {
    const queue = this.responses[mode].get(table) ?? [];
    queue.push(response);
    this.responses[mode].set(table, queue);
  }
  finishQuery(query, mode) {
    this.queryCalls.push({ mode, table: query.table, columns: query.columns, filters: query.filters, orders: query.orders });
    return settle(this.responses[mode].get(query.table)?.shift());
  }
}

function settle(value) {
  return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
}

const timestamp = "2026-07-17T08:00:00.000Z";
const restaurantRow = {
  id: "rating-restaurant-1",
  restaurant_id: "restaurant-1",
  meal_record_id: "meal-record-1",
  private_rating: 4.5,
  taste_feeling: "balanced",
  portion_feeling: null,
  price_feeling: "reasonable",
  repurchase_intent: "yes",
  visibility: "private",
  is_current: true,
  rated_at: timestamp,
  updated_at: timestamp
};
const menuRow = {
  id: "rating-menu-1",
  restaurant_id: "restaurant-1",
  branch_id: null,
  menu_item_id: "menu-1",
  meal_record_item_id: null,
  private_rating: 4,
  finished: null,
  dislike_reasons: ["too_salty"],
  taste_feeling: "salty",
  portion_feeling: null,
  price_feeling: null,
  repurchase_intent: "maybe",
  visibility: "private",
  is_current: true,
  rated_at: timestamp,
  updated_at: timestamp
};

try {
  const program = ts.createProgram(collectTsFiles(ratingRoot), {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir: compiledRoot,
    rootDir: featureRoot
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  expect(diagnostics.length === 0, "Phase 2W-C TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-ratings", "index.js"));
  const rating = requireFromTemp("./index.js");
  const client = new FakeRatingClient();
  const repository = new rating.SupabaseConsumerRatingRepository(client);

  client.queue("single", rating.SUPABASE_USER_RESTAURANT_RATINGS_TABLE, { data: restaurantRow, error: null, status: 200 });
  const restaurantRead = await repository.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: " restaurant-1 " });
  expect(restaurantRead.status === "available" && restaurantRead.record.ratingValue === 4.5, "restaurant read maps snake_case row", `Got ${restaurantRead.status}`);
  const restaurantCall = client.queryCalls.at(-1);
  expect(restaurantCall.table === "user_restaurant_ratings" && restaurantCall.filters.some(([key, value]) => key === "restaurant_id" && value === "restaurant-1"), "restaurant read query targets the approved table and opaque target");
  expect(restaurantCall.filters.some(([key, value]) => key === "is_current" && value === true), "restaurant read filters current rows only");
  expect(!restaurantCall.filters.some(([key]) => /user|owner/i.test(key)), "restaurant read has no caller-supplied owner filter");

  client.queue("single", rating.SUPABASE_USER_MENU_ITEM_RATINGS_TABLE, { data: menuRow, error: null, status: 200 });
  const menuRead = await repository.getCurrentUserMenuItemRating({ kind: "menu_item", menuItemId: "menu-1" });
  expect(menuRead.status === "available" && menuRead.record.target.kind === "menu_item", "menu-item read maps the target discriminator");
  expect(menuRead.status === "available" && menuRead.record.target.branchId === null && menuRead.record.finished === null, "menu-item nullable branches map explicitly");
  expect(menuRead.status === "available" && menuRead.record.dislikeReasons[0] === "too_salty", "menu-item structured feedback maps explicitly");
  const menuCall = client.queryCalls.at(-1);
  expect(!menuCall.filters.some(([key]) => /user|owner/i.test(key)), "menu-item read has no caller-supplied owner filter");

  client.queue("single", rating.SUPABASE_USER_MENU_ITEM_RATINGS_TABLE, { data: null, error: null, status: 200 });
  const missing = await repository.getCurrentUserMenuItemRating({ kind: "menu_item", menuItemId: "missing" });
  expect(missing.status === "missing", "missing row returns the typed missing result", `Got ${missing.status}`);

  client.queue("list", rating.SUPABASE_USER_RESTAURANT_RATINGS_TABLE, { data: [restaurantRow], error: null, status: 200 });
  client.queue("list", rating.SUPABASE_USER_MENU_ITEM_RATINGS_TABLE, { data: [menuRow], error: null, status: 200 });
  const list = await repository.listCurrentUserRatings();
  expect(list.status === "available" && list.records.length === 2, "current ratings list combines both tables");
  expect(list.status === "available" && list.records.some((record) => record.target.kind === "restaurant") && list.records.some((record) => record.target.kind === "menu_item"), "list preserves restaurant/menu-item discriminators");
  const listCalls = client.queryCalls.slice(-2);
  expect(listCalls.every((call) => call.filters.some(([key, value]) => key === "is_current" && value === true)), "list queries are current-only");
  expect(listCalls.every((call) => !call.filters.some(([key]) => /user|owner/i.test(key))), "list queries contain no ownership filter");

  const restaurantInput = {
    target: { kind: "restaurant", restaurantId: "restaurant-1", mealRecordId: "meal-record-1" },
    ratingValue: 5,
    tasteFeeling: "great",
    portionFeeling: null,
    priceFeeling: "fair",
    repurchaseIntent: "yes"
  };
  client.responses.rpc.push({
    data: {
      rating_id: "rating-restaurant-2", target_kind: "restaurant", restaurant_id: "restaurant-1",
      meal_record_id: "meal-record-1", rating_value: 5, taste_feeling: "great", portion_feeling: null,
      price_feeling: "fair", repurchase_intent: "yes", visibility: "private", is_current: true,
      rated_at: timestamp, updated_at: timestamp, replaced_previous: true
    },
    error: null,
    status: 200
  });
  const restaurantWrite = await repository.createOrReplaceCurrentUserRating(restaurantInput);
  expect(restaurantWrite.status === "replaced" && restaurantWrite.record.ratingValue === 5, "restaurant RPC response maps to replaced result", `Got ${restaurantWrite.status}`);
  const restaurantRpc = client.rpcCalls.at(-1);
  expect(restaurantRpc.name === "save_authenticated_restaurant_rating", "restaurant write calls only the approved RPC");
  expect(Object.keys(restaurantRpc.args).sort().join(",") === ["p_meal_record_id", "p_portion_feeling", "p_price_feeling", "p_private_rating", "p_repurchase_intent", "p_restaurant_id", "p_taste_feeling"].sort().join(","), "restaurant RPC arguments are exact");
  expect(!Object.keys(restaurantRpc.args).some((key) => /user|owner/i.test(key)), "restaurant RPC arguments contain no ownership field");

  const menuInput = {
    target: { kind: "menu_item", restaurantId: "restaurant-1", branchId: null, menuItemId: "menu-1", mealRecordItemId: null },
    ratingValue: 4,
    finished: null,
    dislikeReasons: ["too_salty"],
    tasteFeeling: "salty"
  };
  client.responses.rpc.push({
    data: {
      rating_id: "rating-menu-2", target_kind: "menu_item", restaurant_id: "restaurant-1", branch_id: null,
      menu_item_id: "menu-1", meal_record_item_id: null, rating_value: 4, finished: null,
      dislike_reasons: ["too_salty"], taste_feeling: "salty", portion_feeling: null, price_feeling: null,
      repurchase_intent: null, visibility: "private", is_current: true, rated_at: timestamp, updated_at: timestamp,
      replaced_previous: false
    },
    error: null,
    status: 200
  });
  const menuWrite = await repository.createOrReplaceCurrentUserRating(menuInput);
  expect(menuWrite.status === "saved" && menuWrite.record.target.kind === "menu_item", "menu-item RPC response maps to saved result", `Got ${menuWrite.status}`);
  const menuRpc = client.rpcCalls.at(-1);
  expect(menuRpc.name === "save_authenticated_menu_item_rating", "menu-item write calls only the approved RPC");
  expect(Object.keys(menuRpc.args).sort().join(",") === ["p_branch_id", "p_dislike_reasons", "p_finished", "p_meal_record_item_id", "p_menu_item_id", "p_portion_feeling", "p_price_feeling", "p_private_rating", "p_repurchase_intent", "p_restaurant_id", "p_taste_feeling"].sort().join(","), "menu-item RPC arguments are exact");
  expect(menuRpc.args.p_branch_id === null && menuRpc.args.p_meal_record_item_id === null && menuRpc.args.p_dislike_reasons[0] === "too_salty", "optional linkage and structured feedback map to RPC arguments");
  expect(!Object.keys(menuRpc.args).some((key) => /user|owner/i.test(key)), "menu-item RPC arguments contain no ownership field");

  client.responses.rpc.push({ data: { target_kind: "restaurant" }, error: null, status: 200 });
  const malformed = await repository.createOrReplaceCurrentUserRating(restaurantInput);
  expect(malformed.status === "write_failed" && malformed.error.code === "rating_response_malformed", "malformed RPC response fails closed", `Got ${malformed.status}`);

  for (const [response, expectedStatus, expectedCode, name] of [
    [{ data: null, error: { code: "28000" }, status: 401 }, "unauthenticated", "rating_authentication_required", "auth failure maps to typed result"],
    [{ data: null, error: { code: "42501" }, status: 403 }, "read_failed", "rating_permission_denied", "permission denial maps to typed result"],
    [{ data: null, error: { code: "XX000" }, status: 500 }, "read_failed", "rating_database_failed", "database failure maps to typed result"]
  ]) {
    client.queue("single", rating.SUPABASE_USER_RESTAURANT_RATINGS_TABLE, response);
    const result = await repository.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "restaurant-1" });
    expect(result.status === expectedStatus && result.error.code === expectedCode, name, `Got ${result.status}/${result.error?.code}`);
  }
  client.queue("single", rating.SUPABASE_USER_RESTAURANT_RATINGS_TABLE, new Error("offline"));
  const transport = await repository.getCurrentUserRestaurantRating({ kind: "restaurant", restaurantId: "restaurant-1" });
  expect(transport.status === "read_failed" && transport.error.code === "rating_transport_failed", "transport failure maps without leaking the underlying error");

  const signedInAuth = { source: "mock", async getCurrentSession() { return { ok: true, value: { provider: "fake" } }; } };
  const supabaseFlags = { readSource: "supabase", writeSource: "supabase", issues: [] };
  const composed = rating.createConsumerRatingRuntime({ authPort: signedInAuth, ratingClient: client, flags: supabaseFlags });
  expect(composed.readRepository === composed.writeRepository && composed.readRepository.readSource === "supabase", "explicit Supabase source composes one injected repository");
  let missingClientError = null;
  try { rating.createConsumerRatingRuntime({ authPort: signedInAuth, flags: supabaseFlags }); } catch (error) { missingClientError = error; }
  expect(missingClientError?.code === "rating_configuration_invalid", "Supabase source without an injected client fails closed");

  const defaults = rating.getConsumerRatingRuntimeFlags({});
  expect(defaults.readSource === "mock" && defaults.writeSource === "disabled", "default read remains mock and default write remains disabled");
  const invalid = rating.getConsumerRatingRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE: "live-ish" });
  let invalidError = null;
  try { rating.createConsumerRatingRepositories(invalid); } catch (error) { invalidError = error; }
  expect(invalid.readSource === "disabled" && invalidError?.code === "rating_configuration_invalid", "invalid source never falls back to mock");

  const adapterSource = fs.readFileSync(path.join(ratingRoot, "adapters", "supabaseConsumerRatingRepository.ts"), "utf8");
  expect(!/\.(insert|update|delete|upsert)\s*\(/.test(adapterSource), "adapter contains no direct table write API");
  expect(!/service_role|supabase_access_token|authorization\s*:/i.test(adapterSource), "adapter contains no privileged credential path");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Phase 2W-C Ratings Supabase Repository Contract Smoke",
    totalChecks: checks.length,
    checks,
    networkRequestUsed: false,
    credentialsUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    n4Executed: false,
    uiCutoverUsed: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2W-C Ratings Supabase Repository Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    networkRequestUsed: false,
    credentialsUsed: false,
    databaseReadUsed: false,
    databaseWriteUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    n4Executed: false,
    uiCutoverUsed: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function collectTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
}
