import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const favoriteRoot = path.join(featureRoot, "consumer-favorites");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-d-a-forward-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function expect(condition, name, message = "Contract assertion failed.") {
  if (!condition) throw new Error(`${name}: ${message}`);
  checks.push({ name, pass: true });
}

class FakeFavoriteQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.columns = null;
    this.filters = [];
    this.orFilters = [];
    this.orders = [];
    this.limitCount = null;
  }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push(["eq", column, value]); return this; }
  is(column, value) { this.filters.push(["is", column, value]); return this; }
  or(filters) { this.orFilters.push(filters); return this; }
  order(column, options) { this.orders.push([column, options]); return this; }
  limit(count) { this.limitCount = count; return this; }
  maybeSingle() { return this.client.finishRead(this, "single"); }
  then(resolve, reject) { return this.client.finishRead(this, "list").then(resolve, reject); }
}

class FakeFavoriteClient {
  constructor() {
    this.calls = [];
    this.responses = { single: new Map(), list: new Map() };
  }
  from(table) { return new FakeFavoriteQuery(this, table); }
  rpc(functionName, arguments_) {
    this.calls.push({ mode: "rpc", functionName, arguments: arguments_ });
    return Promise.resolve({ data: null, error: null, status: 200 });
  }
  queue(mode, table, response) {
    const queue = this.responses[mode].get(table) ?? [];
    queue.push(response);
    this.responses[mode].set(table, queue);
  }
  finishRead(query, mode) {
    this.calls.push({
      mode,
      table: query.table,
      columns: query.columns,
      filters: query.filters,
      orFilters: query.orFilters,
      orders: query.orders,
      limitCount: query.limitCount
    });
    const response = this.responses[mode].get(query.table)?.shift();
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }
}

function session(actorId) {
  return {
    user: {
      userId: actorId,
      provider: "mock",
      isAnonymous: false,
      emailVerified: true,
      createdAt: "2026-07-01T00:00:00.000Z"
    },
    provider: "mock",
    issuedAt: "2026-07-18T00:00:00.000Z"
  };
}

function auth(value) {
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value }; },
    observeAuthState() { return () => undefined; },
    async signIn() { return { ok: true, value: value ?? session("actor") }; },
    async signUp() { return { ok: true, value: value ?? session("actor") }; },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value }; }
  };
}

const restaurant = { kind: "restaurant", restaurantId: "restaurant-1" };
const otherRestaurant = { kind: "restaurant", restaurantId: "restaurant-2" };
const createdAt = "2026-07-18T08:00:00.000Z";
const restaurantRow = {
  id: "00000000-0000-4000-8000-000000000001",
  restaurant_id: restaurant.restaurantId,
  collection_label: null,
  sort_order: 1,
  created_at: createdAt,
  removed_at: null
};

try {
  const program = ts.createProgram(collectTsFiles(favoriteRoot), {
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
  expect(diagnostics.length === 0, "forward regression TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-favorites", "index.js"));
  const favorite = requireFromTemp("./index.js");

  // Phase 2X-D transition matrix and defaults.
  const defaults = favorite.getConsumerFavoriteRuntimeFlags({});
  expect(defaults.readSource === "disabled" && defaults.writeSource === "disabled", "default read and write remain disabled");
  const missing = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: ""
  });
  expect(missing.readSource === "disabled" && missing.writeSource === "disabled" && missing.issues.length === 0, "missing sources fail closed to disabled");
  const matrix = ["disabled", "mock", "supabase"];
  for (const readSource of matrix) {
    for (const writeSource of matrix) {
      const parsed = favorite.getConsumerFavoriteRuntimeFlags({
        EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: readSource,
        EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: writeSource
      });
      expect(parsed.readSource === readSource && parsed.writeSource === writeSource && parsed.issues.length === 0, `source matrix allows ${readSource}/${writeSource}`);
    }
  }
  const invalid = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "live-ish",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "fallback-ish"
  });
  expect(invalid.readSource === "disabled" && invalid.writeSource === "disabled" && invalid.issues.length === 2, "invalid sources fail closed without mock fallback");
  let invalidError = null;
  try { favorite.createConsumerFavoriteRepositories(invalid); } catch (error) { invalidError = error; }
  expect(invalidError?.code === "favorite_configuration_invalid", "invalid source configuration cannot compose repositories");

  // Phase 2X-B retained positive behavior.
  const mockFlags = { readSource: "mock", writeSource: "mock", issues: [] };
  let idSequence = 0;
  let timeSequence = 0;
  const times = [
    "2026-07-18T01:00:00.000Z",
    "2026-07-18T02:00:00.000Z",
    "2026-07-18T03:00:00.000Z",
    "2026-07-18T04:00:00.000Z"
  ];
  const mockRuntime = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")),
    actorId: "actor-a",
    clock: () => times[Math.min(timeSequence++, times.length - 1)],
    idGenerator: () => `favorite-id-${++idSequence}`,
    flags: mockFlags
  });
  expect(mockRuntime.readRepository.readSource === "mock" && mockRuntime.writeRepository.writeSource === "mock", "explicit mock read and write compose normally");
  const add = await mockRuntime.service.addCurrentUserFavorite(restaurant);
  expect(add.status === "added" && add.record.favoriteId === "favorite-id-1" && add.record.createdAt === times[0], "mock add uses deterministic injected ID and clock");
  const duplicate = await mockRuntime.service.addCurrentUserFavorite(restaurant);
  expect(duplicate.status === "already_present" && duplicate.record.favoriteId === "favorite-id-1", "mock duplicate add remains already_present");
  const removed = await mockRuntime.service.removeCurrentUserFavorite(restaurant);
  expect(removed.status === "removed" && removed.record.active === false, "mock remove remains soft removed");
  expect((await mockRuntime.service.removeCurrentUserFavorite(restaurant)).status === "already_absent", "mock repeated remove remains already_absent");
  const readded = await mockRuntime.service.addCurrentUserFavorite(restaurant);
  expect(readded.status === "added" && readded.record.favoriteId === "favorite-id-2", "mock re-add creates a new active row");
  const history = mockRuntime.writeRepository.getHistoryForContract(restaurant);
  expect(history.length === 2 && history[0].favoriteId === "favorite-id-1" && history[0].active === false, "mock removed history remains preserved");

  const sharedStore = favorite.createMockConsumerFavoriteStore();
  const actorA = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", store: sharedStore,
    idGenerator: () => "actor-a-row", clock: () => createdAt, flags: mockFlags
  });
  const actorB = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-b")), actorId: "actor-b", store: sharedStore,
    idGenerator: () => "actor-b-row", clock: () => createdAt, flags: mockFlags
  });
  await actorA.service.addCurrentUserFavorite(otherRestaurant);
  expect((await actorB.service.getCurrentUserFavorite(otherRestaurant)).status === "missing", "mock actors cannot read each other's favorites");
  expect((await actorB.service.removeCurrentUserFavorite(otherRestaurant)).status === "already_absent", "mock actors cannot mutate each other's favorites");
  await actorB.service.addCurrentUserFavorite(otherRestaurant);
  expect(sharedStore.rows.length === 2, "same mock target remains actor isolated");

  const isolatedA = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", idGenerator: () => "isolated-a",
    clock: () => createdAt, flags: mockFlags
  });
  const isolatedB = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), actorId: "actor-a", idGenerator: () => "isolated-b",
    clock: () => createdAt, flags: mockFlags
  });
  await isolatedA.service.addCurrentUserFavorite(restaurant);
  expect((await isolatedB.service.getCurrentUserFavorite(restaurant)).status === "missing", "separate mock stores remain isolated");

  // Phase 2X-C retained positive Supabase read behavior.
  const readClient = new FakeFavoriteClient();
  const readFlags = { readSource: "supabase", writeSource: "disabled", issues: [] };
  const readRuntime = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("actor-a")), favoriteClient: readClient, flags: readFlags
  });
  expect(readRuntime.readRepository.readSource === "supabase" && readRuntime.writeRepository.writeSource === "disabled", "Supabase read composes independently with disabled write");
  expect(readClient.calls.length === 0, "Supabase read factory construction makes zero client calls");
  readClient.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, { data: restaurantRow, error: null, status: 200 });
  const read = await readRuntime.service.getCurrentUserFavorite(restaurant);
  expect(read.status === "available" && read.record.favoriteId === restaurantRow.id && read.record.active, "Supabase active row mapping remains canonical");
  const singleCall = readClient.calls.at(-1);
  expect(singleCall.filters.some(([, column, value]) => column === "removed_at" && value === null), "Supabase single read remains active-only");
  expect(!singleCall.filters.some(([, column]) => /user|owner/i.test(column)), "Supabase read retains session/RLS ownership without caller filter");

  const row2 = { ...restaurantRow, id: "00000000-0000-4000-8000-000000000002", sort_order: 2 };
  const row3 = { ...restaurantRow, id: "00000000-0000-4000-8000-000000000003", sort_order: null };
  readClient.queue("list", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, { data: [restaurantRow, row2, row3], error: null, status: 200 });
  const page = await readRuntime.service.listCurrentUserFavorites({ entityType: "restaurant", pageSize: 2 });
  expect(page.status === "available" && page.records.length === 2 && page.nextCursor, "Supabase list mapping and cursor remain available");
  const listCall = readClient.calls.at(-1);
  expect(listCall.limitCount === 3, "Supabase list retains page-size-plus-one fetch");
  expect(listCall.orders.length === 3 && listCall.orders[0][0] === "sort_order" && listCall.orders[1][0] === "created_at" && listCall.orders[2][0] === "id", "Supabase list retains canonical ordering tuple");
  expect(listCall.filters.some(([, column, value]) => column === "removed_at" && value === null), "Supabase list remains active-only");

  readClient.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, { data: { ...restaurantRow, removed_at: createdAt }, error: null, status: 200 });
  const malformed = await readRuntime.service.getCurrentUserFavorite(restaurant);
  expect(malformed.status === "read_failed" && malformed.error.code === "favorite_response_malformed", "malformed Supabase read response remains fail closed");
  readClient.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, { data: null, error: { code: "42501" }, status: 403 });
  const denied = await readRuntime.service.getCurrentUserFavorite(restaurant);
  expect(denied.status === "read_failed" && denied.error.code === "favorite_permission_denied", "Supabase read permission denial remains typed and fail closed");
  const callsBeforeDisabledWrite = readClient.calls.length;
  expect((await readRuntime.service.addCurrentUserFavorite(restaurant)).status === "disabled", "disabled write remains disabled beside Supabase read");
  expect(readClient.calls.length === callsBeforeDisabledWrite && !readClient.calls.some((call) => call.mode === "rpc"), "disabled write never calls a write RPC");

  // Phase 2X-D explicit Supabase write dependency gates.
  const writeFlags = { readSource: "disabled", writeSource: "supabase", issues: [] };
  let missingAuthError = null;
  try { favorite.createConsumerFavoriteRuntime({ flags: writeFlags, favoriteClient: new FakeFavoriteClient() }); } catch (error) { missingAuthError = error; }
  expect(missingAuthError?.code === "favorite_configuration_invalid", "Supabase write requires explicit Auth dependency");
  let missingClientError = null;
  try { favorite.createConsumerFavoriteRuntime({ flags: writeFlags, authPort: auth(session("actor-a")) }); } catch (error) { missingClientError = error; }
  expect(missingClientError?.code === "favorite_configuration_invalid", "Supabase write requires explicit client dependency");
  const writeClient = new FakeFavoriteClient();
  const writeRuntime = favorite.createConsumerFavoriteRuntime({
    flags: writeFlags, authPort: auth(session("actor-a")), favoriteClient: writeClient
  });
  expect(writeRuntime.readRepository.readSource === "disabled" && writeRuntime.writeRepository.writeSource === "supabase", "Supabase write composes independently only when explicitly selected");
  expect(writeClient.calls.length === 0, "Supabase write factory construction makes zero client calls");

  console.log(JSON.stringify({
    status: "passed",
    classification: "FORWARD_COMPATIBLE_POSITIVE_INVARIANTS",
    phase: "Consumer Runtime Phase 2X-D-A Forward-Compatible Regression Smoke",
    totalChecks: checks.length,
    checks,
    retainedPhases: ["2X-B", "2X-C-A"],
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    migrationExecuted: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2YStarted: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    classification: "FORWARD_COMPATIBLE_POSITIVE_INVARIANTS",
    phase: "Consumer Runtime Phase 2X-D-A Forward-Compatible Regression Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    migrationExecuted: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2YStarted: false
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
