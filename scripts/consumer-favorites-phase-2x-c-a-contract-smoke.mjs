import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const favoriteRoot = path.join(featureRoot, "consumer-favorites");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-c-a-"));
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
  maybeSingle() { return this.client.finish(this, "single"); }
  then(resolve, reject) { return this.client.finish(this, "list").then(resolve, reject); }
}

class FakeFavoriteClient {
  constructor() {
    this.calls = [];
    this.responses = { single: new Map(), list: new Map() };
  }
  from(table) { return new FakeFavoriteQuery(this, table); }
  queue(mode, table, response) {
    const queue = this.responses[mode].get(table) ?? [];
    queue.push(response);
    this.responses[mode].set(table, queue);
  }
  finish(query, mode) {
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

function session(actorId = "actor-a") {
  return {
    user: {
      userId: actorId,
      provider: "mock",
      isAnonymous: false,
      emailVerified: true,
      createdAt: "2026-07-18T00:00:00.000Z"
    },
    provider: "mock",
    issuedAt: "2026-07-18T00:00:00.000Z"
  };
}

function auth(value) {
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value }; },
    observeAuthState() { return () => {}; },
    async signIn() { return { ok: true, value: value ?? session() }; },
    async signUp() { return { ok: true, value: value ?? session() }; },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value }; }
  };
}

const createdAt = "2026-07-18T08:00:00.000Z";
const restaurantRow = {
  id: "00000000-0000-4000-8000-000000000001",
  restaurant_id: "restaurant-1",
  collection_label: null,
  sort_order: 1,
  created_at: createdAt,
  removed_at: null
};
const menuItemRow = {
  id: "00000000-0000-4000-8000-000000000002",
  restaurant_id: "restaurant-1",
  menu_item_id: "menu-item-1",
  collection_label: "午餐",
  sort_order: null,
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
  expect(diagnostics.length === 0, "Phase 2X-C-A TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-favorites", "index.js"));
  const favorite = requireFromTemp("./index.js");
  const client = new FakeFavoriteClient();
  const supabaseFlags = { readSource: "supabase", writeSource: "disabled", issues: [] };

  const defaults = favorite.getConsumerFavoriteRuntimeFlags({});
  expect(defaults.readSource === "disabled" && defaults.writeSource === "disabled", "default read and write remain disabled");
  const parsed = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "supabase",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "disabled"
  });
  expect(parsed.readSource === "supabase" && parsed.writeSource === "disabled" && parsed.issues.length === 0, "Supabase read is explicit opt-in");
  const rejectedWrite = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "supabase"
  });
  expect(rejectedWrite.writeSource === "disabled" && rejectedWrite.issues.length === 1, "Supabase write source is rejected");
  const invalidRead = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "live-ish"
  });
  expect(invalidRead.readSource === "disabled" && invalidRead.issues.length === 1, "invalid read source never falls back to mock");

  let missingClientError = null;
  try {
    favorite.createConsumerFavoriteRuntime({ authPort: auth(session()), flags: supabaseFlags });
  } catch (error) {
    missingClientError = error;
  }
  expect(missingClientError?.code === "favorite_configuration_invalid", "Supabase read without injected client fails closed");

  const runtime = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session()),
    favoriteClient: client,
    flags: supabaseFlags
  });
  expect(runtime.readRepository.readSource === "supabase", "factory selects Supabase read only when explicit");
  expect(runtime.writeRepository.writeSource === "disabled", "Supabase read leaves write disabled");
  expect(client.calls.length === 0, "factory construction makes no client call");

  client.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, {
    data: restaurantRow,
    error: null,
    status: 200
  });
  const restaurantRead = await runtime.service.getCurrentUserFavorite({
    kind: "restaurant",
    restaurantId: "restaurant-1"
  });
  expect(restaurantRead.status === "available" && restaurantRead.record.favoriteId === restaurantRow.id, "restaurant row maps to canonical record");
  expect(restaurantRead.status === "available" && restaurantRead.record.active === true, "active restaurant maps explicitly");
  const restaurantCall = client.calls.at(-1);
  expect(restaurantCall.table === "favorite_restaurants", "restaurant read selects the approved table");
  expect(restaurantCall.filters.some(([operator, column, value]) => operator === "eq" && column === "restaurant_id" && value === "restaurant-1"), "restaurant read filters its target");
  expect(restaurantCall.filters.some(([operator, column, value]) => operator === "is" && column === "removed_at" && value === null), "restaurant read filters active rows only");
  expect(!restaurantCall.filters.some(([, column]) => /user|owner/i.test(column)), "restaurant read has no caller owner filter");
  expect(!/user_id|removed history/i.test(restaurantCall.columns), "restaurant select omits ownership data");

  client.queue("single", favorite.SUPABASE_FAVORITE_MENU_ITEMS_TABLE, {
    data: menuItemRow,
    error: null,
    status: 200
  });
  const menuRead = await runtime.service.getCurrentUserFavorite({
    kind: "menu_item",
    restaurantId: "restaurant-1",
    menuItemId: "menu-item-1"
  });
  expect(menuRead.status === "available" && menuRead.record.target.kind === "menu_item", "menu-item row maps its discriminator");
  expect(menuRead.status === "available" && menuRead.record.collectionLabel === "午餐" && menuRead.record.sortOrder === null, "nullable menu-item metadata maps");
  const menuCall = client.calls.at(-1);
  expect(menuCall.table === "favorite_menu_items", "menu-item read selects the approved table");
  expect(menuCall.filters.some(([, column, value]) => column === "restaurant_id" && value === "restaurant-1"), "menu-item read enforces restaurant parent");
  expect(menuCall.filters.some(([, column, value]) => column === "menu_item_id" && value === "menu-item-1"), "menu-item read filters menu item target");
  expect(menuCall.filters.some(([, column, value]) => column === "removed_at" && value === null), "menu-item read filters active rows only");
  expect(!menuCall.filters.some(([, column]) => /user|owner/i.test(column)), "menu-item read has no caller owner filter");

  client.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, { data: null, error: null, status: 200 });
  const missing = await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "missing" });
  expect(missing.status === "missing", "empty single result maps to missing");

  client.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, {
    data: { ...restaurantRow, removed_at: createdAt },
    error: null,
    status: 200
  });
  const removedLeak = await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "restaurant-1" });
  expect(removedLeak.status === "read_failed" && removedLeak.error.code === "favorite_response_malformed", "removed history in a response fails closed");

  client.queue("single", favorite.SUPABASE_FAVORITE_MENU_ITEMS_TABLE, {
    data: { ...menuItemRow, restaurant_id: "wrong-parent" },
    error: null,
    status: 200
  });
  const wrongParent = await runtime.service.getCurrentUserFavorite({
    kind: "menu_item",
    restaurantId: "restaurant-1",
    menuItemId: "menu-item-1"
  });
  expect(wrongParent.status === "read_failed" && wrongParent.error.code === "favorite_response_malformed", "response target mismatch fails closed");

  for (const [response, expectedStatus, expectedCode, name] of [
    [{ data: null, error: { code: "28000" }, status: 401 }, "unauthenticated", "favorite_authentication_required", "PostgREST auth error maps deterministically"],
    [{ data: null, error: { code: "42501" }, status: 403 }, "read_failed", "favorite_permission_denied", "PostgREST permission error maps deterministically"],
    [{ data: null, error: { code: "XX000" }, status: 500 }, "read_failed", "favorite_database_failed", "PostgREST database error maps deterministically"]
  ]) {
    client.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, response);
    const result = await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "restaurant-1" });
    expect(result.status === expectedStatus && result.error.code === expectedCode, name);
  }
  client.queue("single", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, new Error("offline"));
  const transport = await runtime.service.getCurrentUserFavorite({ kind: "restaurant", restaurantId: "restaurant-1" });
  expect(transport.status === "read_failed" && transport.error.code === "favorite_transport_failed", "transport failure maps without leaking details");

  const signedOutRuntime = favorite.createConsumerFavoriteRuntime({
    authPort: auth(null),
    favoriteClient: client,
    flags: supabaseFlags
  });
  const callCountBeforeSignedOut = client.calls.length;
  const signedOut = await signedOutRuntime.service.getCurrentUserFavorite({
    kind: "restaurant",
    restaurantId: "restaurant-1"
  });
  expect(signedOut.status === "unauthenticated", "missing authenticated session fails closed");
  expect(client.calls.length === callCountBeforeSignedOut, "unauthenticated service never calls the repository client");

  const row2 = { ...restaurantRow, id: "00000000-0000-4000-8000-000000000003", sort_order: 2 };
  const row3 = { ...restaurantRow, id: "00000000-0000-4000-8000-000000000004", sort_order: null };
  client.queue("list", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, {
    data: [restaurantRow, row2, row3],
    error: null,
    status: 200
  });
  const page = await runtime.service.listCurrentUserFavorites({ entityType: "restaurant", pageSize: 2 });
  expect(page.status === "available" && page.records.length === 2 && page.nextCursor, "list applies page size and emits a cursor");
  const listCall = client.calls.at(-1);
  expect(listCall.limitCount === 3, "list requests page size plus one");
  expect(listCall.orders.length === 3, "list applies exactly three ordering layers");
  expect(listCall.orders[0][0] === "sort_order" && listCall.orders[0][1].ascending === true && listCall.orders[0][1].nullsFirst === false, "sort_order is ascending nulls last");
  expect(listCall.orders[1][0] === "created_at" && listCall.orders[1][1].ascending === false, "created_at is descending");
  expect(listCall.orders[2][0] === "id" && listCall.orders[2][1].ascending === true, "id is ascending");
  expect(listCall.filters.some(([, column, value]) => column === "removed_at" && value === null), "list reads active rows only");

  client.queue("list", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, {
    data: [row3],
    error: null,
    status: 200
  });
  const afterCursor = await runtime.service.listCurrentUserFavorites({
    entityType: "restaurant",
    pageSize: 2,
    cursor: page.nextCursor
  });
  expect(afterCursor.status === "available" && afterCursor.records.length === 1, "cursor page maps successfully");
  const cursorCall = client.calls.at(-1);
  expect(cursorCall.orFilters.length === 1, "cursor adds one grouped PostgREST predicate");
  expect(/sort_order\.gt\.|created_at\.lt\.|id\.gt\.|sort_order\.is\.null/.test(cursorCall.orFilters[0]), "non-null cursor preserves full tuple and null-last branch");

  const nullCursor = favorite.encodeConsumerFavoriteCursor({
    sortOrder: null,
    createdAt,
    favoriteId: menuItemRow.id
  });
  client.queue("list", favorite.SUPABASE_FAVORITE_MENU_ITEMS_TABLE, { data: [], error: null, status: 200 });
  const emptyMenu = await runtime.service.listCurrentUserFavorites({
    entityType: "menu_item",
    cursor: nullCursor
  });
  expect(emptyMenu.status === "empty" && emptyMenu.nextCursor === null, "empty list maps to empty");
  const nullCursorCall = client.calls.at(-1);
  expect(nullCursorCall.table === "favorite_menu_items", "per-entity menu list never combines tables");
  expect(nullCursorCall.orFilters.length === 1 && !/sort_order\.gt\./.test(nullCursorCall.orFilters[0]), "null cursor remains inside null-last partition");
  expect(/created_at\.lt\.|id\.gt\./.test(nullCursorCall.orFilters[0]), "null cursor preserves createdAt and id tie-breakers");

  client.queue("list", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, {
    data: [{ ...restaurantRow, sort_order: 1.5 }],
    error: null,
    status: 200
  });
  const malformedList = await runtime.service.listCurrentUserFavorites({ entityType: "restaurant" });
  expect(malformedList.status === "read_failed" && malformedList.error.code === "favorite_response_malformed", "malformed list row fails closed");

  client.queue("list", favorite.SUPABASE_FAVORITE_RESTAURANTS_TABLE, {
    data: [{ ...restaurantRow, restaurant_id: "fav-derived-target" }],
    error: null,
    status: 200
  });
  const invalidCanonicalTarget = await runtime.service.listCurrentUserFavorites({ entityType: "restaurant" });
  expect(invalidCanonicalTarget.status === "read_failed" && invalidCanonicalTarget.error.code === "favorite_response_malformed", "non-canonical database target fails closed");

  const writeAttempt = await runtime.service.addCurrentUserFavorite({
    kind: "restaurant",
    restaurantId: "restaurant-1"
  });
  expect(writeAttempt.status === "disabled", "Supabase read activation leaves writes disabled");
  expect(typeof runtime.readRepository.addCurrentUserFavorite === "undefined", "Supabase read repository exposes no write method");

  const mockRuntime = favorite.createConsumerFavoriteRuntime({
    authPort: auth(session("mock-a")),
    actorId: "mock-a",
    clock: () => createdAt,
    idGenerator: () => "mock-row-1",
    flags: { readSource: "mock", writeSource: "mock", issues: [] }
  });
  const mockAdd = await mockRuntime.service.addCurrentUserFavorite({
    kind: "restaurant",
    restaurantId: "restaurant-mock"
  });
  const mockDuplicate = await mockRuntime.service.addCurrentUserFavorite({
    kind: "restaurant",
    restaurantId: "restaurant-mock"
  });
  expect(mockAdd.status === "added" && mockDuplicate.status === "already_present", "frozen mock add behavior is retained");
  expect((await mockRuntime.service.removeCurrentUserFavorite({ kind: "restaurant", restaurantId: "restaurant-mock" })).status === "removed", "frozen mock soft-remove behavior is retained");

  const adapterSource = fs.readFileSync(
    path.join(favoriteRoot, "adapters", "supabaseConsumerFavoriteReadRepository.ts"),
    "utf8"
  );
  const contractsSource = fs.readFileSync(path.join(favoriteRoot, "supabaseFavoriteContracts.ts"), "utf8");
  expect(!/\.(?:insert|update|delete|upsert|rpc)\s*\(/.test(adapterSource), "Supabase Favorites adapter contains no write or RPC API");
  expect(!/user_id|userId/.test(contractsSource), "Supabase read contract contains no ownership field");
  expect(!/service_role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(`${adapterSource}\n${contractsSource}`), "Supabase read path contains no privileged credential");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Phase 2X-C-A Authenticated Favorites Read Contract Smoke",
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    databaseWriteUsed: false,
    credentialsUsed: false,
    supabaseRemoteUsed: false,
    migrationExecuted: false,
    developmentWriteUsed: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    mobileUiCutover: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-C-A Authenticated Favorites Read Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    networkUsed: false,
    databaseUsed: false,
    databaseWriteUsed: false,
    credentialsUsed: false,
    supabaseRemoteUsed: false,
    migrationExecuted: false,
    developmentWriteUsed: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    mobileUiCutover: false
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
