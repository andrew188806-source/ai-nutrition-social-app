import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const phase = "Consumer Runtime Phase 2X-C-B Development Favorites Read Activation";
const root = process.cwd();
const expectedProjectRef = "msbgnnoorsoefuiwluye";
const expectedMigration = "20260718010000_consumer_favorites_authenticated_read.sql";
const liveOptInKey = "TASTKIND_CONSUMER_PHASE2X_CB_DEVELOPMENT_LIVE_SMOKE";
const checks = [];
let tempRoot = null;

function report(status, extra = {}) {
  console.log(JSON.stringify({
    status,
    phase,
    ...extra,
    credentialsPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    favoriteContentPrinted: false,
    databaseWriteUsed: false,
    rpcUsed: false,
    sqlExecuted: false,
    migrationExecutedByRunner: false,
    fixtureOrSeedUsed: false,
    persistentTestData: false,
    productionTouched: false,
    privilegedCredentialUsed: false,
    n4Executed: false
  }, null, 2));
}

function pass(name) {
  checks.push({ name, pass: true });
}

function assert(condition, name) {
  if (!condition) throw new Error(name);
  pass(name);
}

function skip(reason) {
  report("skipped", { reason, checks, networkUsed: false, databaseUsed: false });
}

function parseDotEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function buildLiveEnv() {
  return {
    ...parseDotEnvFile(path.join(root, ".env.local")),
    ...parseDotEnvFile(path.join(root, "apps", "mobile", ".env.local")),
    ...process.env
  };
}

function collectTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function compileRuntime() {
  const featureRoot = path.join(root, "apps", "mobile", "features");
  const sourceFiles = [
    ...collectTsFiles(path.join(featureRoot, "consumer-auth")),
    ...collectTsFiles(path.join(featureRoot, "consumer-favorites"))
  ];
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-c-b-"));
  const compiledRoot = path.join(tempRoot, "features");
  const program = ts.createProgram(sourceFiles, {
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
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
  if (diagnostics.length) {
    throw new Error(`Runtime compilation failed with ${diagnostics.length} diagnostic(s).`);
  }
  process.env.NODE_PATH = [
    path.join(root, "apps", "mobile", "node_modules"),
    path.join(root, "node_modules"),
    process.env.NODE_PATH
  ].filter(Boolean).join(path.delimiter);
  Module._initPaths();
  return {
    favorite: createRequire(path.join(compiledRoot, "consumer-favorites", "index.js"))("./index.js"),
    authFactories: createRequire(path.join(compiledRoot, "consumer-auth", "factories.js"))("./factories.js"),
    authFlags: createRequire(path.join(compiledRoot, "consumer-auth", "featureFlags.js"))("./featureFlags.js")
  };
}

class FakeFavoriteQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.columns = "";
    this.limitCount = null;
  }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push(["eq", column, value]); return this; }
  is(column, value) { this.filters.push(["is", column, value]); return this; }
  or(value) { this.filters.push(["or", value]); return this; }
  order(column, options) { this.orders.push([column, options]); return this; }
  limit(count) { this.limitCount = count; return this; }
  maybeSingle() { return this.client.finish(this, "single"); }
  then(resolve, reject) { return this.client.finish(this, "list").then(resolve, reject); }
}

class FakeFavoriteClient {
  constructor() {
    this.calls = [];
    this.responses = [];
  }
  from(table) { return new FakeFavoriteQuery(this, table); }
  queue(response) { this.responses.push(response); }
  finish(query, mode) {
    this.calls.push({ table: query.table, mode, filters: query.filters, orders: query.orders, limitCount: query.limitCount });
    return Promise.resolve(this.responses.shift());
  }
}

function fakeAuthPort() {
  const session = {
    user: { userId: "dry-run-actor", provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-07-18T00:00:00.000Z" },
    provider: "mock",
    issuedAt: "2026-07-18T00:00:00.000Z"
  };
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value: session }; },
    observeAuthState() { return () => undefined; },
    async signIn() { return { ok: true, value: session }; },
    async signUp() { return { ok: true, value: session }; },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value: session }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value: session }; }
  };
}

async function runDryRun() {
  const { favorite } = compileRuntime();
  const client = new FakeFavoriteClient();
  const restaurantRow = {
    id: "00000000-0000-4000-8000-000000000001",
    restaurant_id: "restaurant-dry-run",
    collection_label: null,
    sort_order: 1,
    created_at: "2026-07-18T00:00:00.000Z",
    removed_at: null
  };
  client.queue({ data: restaurantRow, error: null, status: 200 });
  client.queue({ data: [restaurantRow], error: null, status: 200 });
  client.queue({ data: null, error: null, status: 200 });
  client.queue({ data: [], error: null, status: 200 });
  const runtime = favorite.createConsumerFavoriteRuntime({
    authPort: fakeAuthPort(),
    favoriteClient: client,
    flags: { readSource: "supabase", writeSource: "disabled", issues: [] }
  });
  assert(runtime.readRepository.readSource === "supabase", "dry-run selects the Supabase read source through the factory");
  assert(runtime.writeRepository.writeSource === "disabled", "dry-run keeps the write source disabled");
  const restaurant = await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "restaurant-dry-run" });
  assert(restaurant.status === "available" && restaurant.source === "supabase", "dry-run maps a restaurant read");
  const restaurants = await runtime.service.listCurrentUserFavorites({ entityType: "restaurant", pageSize: 20 });
  assert(restaurants.status === "available" && restaurants.source === "supabase", "dry-run maps a restaurant list");
  const menu = await runtime.service.getCurrentUserFavorite({ kind: "menu_item", restaurantId: "restaurant-dry-run", menuItemId: "menu-dry-run" });
  assert(menu.status === "missing" && menu.source === "supabase", "dry-run maps a missing menu-item read");
  const menus = await runtime.service.listCurrentUserFavorites({ entityType: "menu_item", pageSize: 20 });
  assert(menus.status === "empty" && menus.source === "supabase", "dry-run maps an empty menu-item list");
  assert(client.calls.every((call) => call.filters.every((filter) => !/user|owner/i.test(String(filter[1])))), "dry-run issues no caller ownership filter");
  assert(client.calls.every((call) => call.table === "favorite_restaurants" || call.table === "favorite_menu_items"), "dry-run reads only the two approved Favorites tables");
  report("passed", { mode: "dry-run", checks, networkUsed: false, databaseUsed: false });
}

function requireExactGate(env, key, expected, missing) {
  if (env[key] === undefined || env[key] === "") missing.push(key);
  else if (env[key] !== expected) throw new Error(`Development gate mismatch: ${key}.`);
}

function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function stableFavoriteProjection(records) {
  return records.map((record) => ({
    favoriteId: record.favoriteId,
    target: record.target,
    collectionLabel: record.collectionLabel,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt,
    active: record.active
  }));
}

function compareRecords(left, right) {
  return JSON.stringify(stableFavoriteProjection(left)) === JSON.stringify(stableFavoriteProjection(right));
}

function compareOrder(left, right) {
  const leftSort = left.sortOrder;
  const rightSort = right.sortOrder;
  if (leftSort === null && rightSort !== null) return 1;
  if (leftSort !== null && rightSort === null) return -1;
  if (leftSort !== rightSort) return leftSort - rightSort;
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1;
  return left.favoriteId.localeCompare(right.favoriteId);
}

async function readAll(service, entityType) {
  const records = [];
  const cursors = new Set();
  let cursor = null;
  for (let page = 0; page < 100; page += 1) {
    const result = await service.listCurrentUserFavorites({ entityType, pageSize: 20, cursor });
    if (!(["available", "empty"].includes(result.status)) || result.source !== "supabase") {
      throw new Error(`Favorites ${entityType} list failed closed.`);
    }
    if (result.records.some((record) => !record.active || record.target.kind !== entityType)) {
      throw new Error(`Favorites ${entityType} list returned a non-current or mismatched record.`);
    }
    records.push(...result.records);
    if (!result.nextCursor) break;
    if (typeof result.nextCursor !== "string" || cursors.has(result.nextCursor)) {
      throw new Error(`Favorites ${entityType} cursor did not advance.`);
    }
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
    if (page === 99) throw new Error(`Favorites ${entityType} pagination exceeded the safety bound.`);
  }
  for (let index = 1; index < records.length; index += 1) {
    if (compareOrder(records[index - 1], records[index]) > 0) {
      throw new Error(`Favorites ${entityType} ordering was not deterministic.`);
    }
  }
  return records;
}

function targetEquals(left, right) {
  return left.kind === right.kind && left.restaurantId === right.restaurantId &&
    (left.kind === "restaurant" || (right.kind === "menu_item" && left.menuItemId === right.menuItemId));
}

async function verifyTarget(service, target, entityType) {
  const before = await readAll(service, entityType);
  const single = await service.getCurrentUserFavorite(target);
  if (!(single.status === "available" || single.status === "missing") || single.source !== "supabase") {
    throw new Error(`Favorites ${entityType} single-target read failed closed.`);
  }
  const matching = before.filter((record) => targetEquals(record.target, target));
  if ((single.status === "available") !== (matching.length === 1)) {
    throw new Error(`Favorites ${entityType} single/list consistency failed.`);
  }
  const after = await readAll(service, entityType);
  if (!compareRecords(before, after)) throw new Error(`Favorites ${entityType} repeated read changed.`);
  pass(`${entityType} get/list active read is internally consistent`);
  pass(`${entityType} repeated read is stable`);
  return { available: single.status === "available", controlledCrossActorProof: false };
}

async function runLive() {
  const env = buildLiveEnv();
  const missing = [];
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_PROJECT_NAME", "tastkind-development", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_PROJECT_REF", expectedProjectRef, missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_REGION", "ap-southeast-1", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_PRODUCTION", "false", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_REMOTE_MIGRATION_COUNT", "35", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_LATEST_MIGRATION", expectedMigration, missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_POST_DEPLOYMENT_ACL_VERIFIED", "true", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_CB_PRE_SMOKE_AGGREGATE_CAPTURED", "true", missing);

  const supabaseUrl = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const actorOneEmail = env.DV_CONSUMER_NON_MEMBER_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2X_CB_SMOKE_EMAIL;
  const actorTwoEmail = env.DV_A_OWNER_EMAIL ?? env.TASTKIND_CONSUMER_PHASE2X_CB_SMOKE_EMAIL_2;
  const password = env.TASTKIND_DV_TEST_PASSWORD ?? env.TASTKIND_CONSUMER_PHASE2X_CB_SMOKE_PASSWORD;
  const restaurantId = env.TASTKIND_CONSUMER_PHASE2X_CB_RESTAURANT_ID;
  const menuRestaurantId = env.TASTKIND_CONSUMER_PHASE2X_CB_MENU_ITEM_RESTAURANT_ID;
  const menuItemId = env.TASTKIND_CONSUMER_PHASE2X_CB_MENU_ITEM_ID;
  if (!supabaseUrl) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL");
  if (!publishableKey) missing.push("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (!actorOneEmail) missing.push("DV_CONSUMER_NON_MEMBER_EMAIL or TASTKIND_CONSUMER_PHASE2X_CB_SMOKE_EMAIL");
  if (!password) missing.push("TASTKIND_DV_TEST_PASSWORD or TASTKIND_CONSUMER_PHASE2X_CB_SMOKE_PASSWORD");
  if (!restaurantId) missing.push("TASTKIND_CONSUMER_PHASE2X_CB_RESTAURANT_ID");
  if (!menuRestaurantId) missing.push("TASTKIND_CONSUMER_PHASE2X_CB_MENU_ITEM_RESTAURANT_ID");
  if (!menuItemId) missing.push("TASTKIND_CONSUMER_PHASE2X_CB_MENU_ITEM_ID");
  if (missing.length) {
    report("blocked", { reason: "Development live smoke environment is incomplete.", missing, checks });
    process.exitCode = 2;
    return;
  }
  if (projectRefFromUrl(supabaseUrl) !== expectedProjectRef) throw new Error("Supabase URL does not identify the approved Development project.");
  if (new RegExp(["service", "role"].join("[_-]?"), "i").test(publishableKey)) {
    throw new Error("Privileged credentials are refused.");
  }
  pass("exact Development identity and post-deployment gates accepted");

  const { favorite, authFactories, authFlags } = compileRuntime();
  const parsedAuthFlags = authFlags.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-disabled",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
  });
  const favoriteFlags = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "supabase",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "disabled"
  });
  assert(parsedAuthFlags.issues.length === 0, "Consumer Auth live flags accepted");
  assert(favoriteFlags.readSource === "supabase" && favoriteFlags.writeSource === "disabled" && favoriteFlags.issues.length === 0, "Favorites live read and disabled write flags accepted");

  const storageValues = new Map();
  const storage = {
    async getItem(key) { return storageValues.get(key) ?? null; },
    async setItem(key, value) { storageValues.set(key, value); },
    async removeItem(key) { storageValues.delete(key); }
  };
  let favoriteClient;
  const requireFromMobilePackage = createRequire(path.join(root, "apps", "mobile", "package.json"));
  const { createClient, processLock } = requireFromMobilePackage("@supabase/supabase-js");
  const authPort = authFactories.createConsumerAuthPort(parsedAuthFlags, {
    env: { url: supabaseUrl, publishableKey },
    storage,
    sdkLoader(options) {
      favoriteClient = createClient(options.url, options.publishableKey, {
        auth: { ...options.auth, lock: options.auth.lock ?? processLock }
      });
      return favoriteClient;
    }
  });
  assert(favoriteClient, "Consumer Auth factory created the injected public client");
  const runtime = favorite.createConsumerFavoriteRuntime({ authPort, favoriteClient, flags: favoriteFlags });
  assert(runtime.readRepository.readSource === "supabase" && runtime.writeRepository.writeSource === "disabled", "Favorites factory selected read-only Supabase composition");

  const actors = [actorOneEmail];
  if (actorTwoEmail && actorTwoEmail !== actorOneEmail) actors.push(actorTwoEmail);
  const actorResults = [];
  for (const email of actors) {
    let signedIn = false;
    try {
      const signIn = await authPort.signIn({ email, password });
      if (!signIn.ok) throw new Error("Consumer Auth sign-in failed.");
      signedIn = true;
      pass("actor sign-in succeeded through Consumer Auth boundary");
      const restaurant = await verifyTarget(runtime.service, { kind: "restaurant", restaurantId }, "restaurant");
      const menu = await verifyTarget(runtime.service, { kind: "menu_item", restaurantId: menuRestaurantId, menuItemId }, "menu_item");
      actorResults.push({ restaurantAvailable: restaurant.available, menuItemAvailable: menu.available, controlledCrossActorProof: false });
    } finally {
      if (signedIn) {
        const signOut = await authPort.signOut();
        if (!signOut.ok) throw new Error("Consumer Auth sign-out failed.");
      }
      const session = await authPort.getCurrentSession();
      if (!session.ok || session.value !== null) throw new Error("Consumer Auth session cleanup failed.");
      pass("actor sign-out and session cleanup succeeded");
    }
  }
  report("passed", {
    mode: "credential-backed-development-read",
    checks,
    actorCount: actors.length,
    actorResults,
    crossActorControlledRowIsolationProven: false,
    preSmokeAggregateCaptured: true,
    postSmokeAggregateComparisonRequired: true,
    networkUsed: true,
    databaseUsed: true
  });
}

try {
  if (process.argv.includes("--dry-run")) {
    await runDryRun();
  } else if (process.env[liveOptInKey] !== "true") {
    skip(`Credential-backed Development smoke is opt-in only. Set ${liveOptInKey}=true in the current process.`);
  } else {
    await runLive();
  }
} catch (error) {
  report("failed", {
    reason: process.argv.includes("--dry-run") && error instanceof Error
      ? `Local dry-run failed: ${error.message}`
      : "Credential-backed Favorites read smoke failed.",
    checks
  });
  process.exitCode = 1;
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
