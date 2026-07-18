import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const favoriteRoot = path.join(featureRoot, "consumer-favorites");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-d-a-"));
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
    this.filters = [];
    this.columns = "";
  }
  select(columns) { this.columns = columns; return this; }
  eq(column, value) { this.filters.push(["eq", column, value]); return this; }
  is(column, value) { this.filters.push(["is", column, value]); return this; }
  or(value) { this.filters.push(["or", value]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return this.client.finishRead(this); }
  then(resolve, reject) { return this.client.finishRead(this).then(resolve, reject); }
}

class FakeFavoriteClient {
  constructor() {
    this.calls = [];
    this.rpcResponses = [];
    this.readResponses = [];
  }
  from(table) { return new FakeFavoriteQuery(this, table); }
  rpc(functionName, arguments_) {
    this.calls.push({ kind: "rpc", functionName, arguments: arguments_ });
    const response = this.rpcResponses.shift();
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }
  finishRead(query) {
    this.calls.push({ kind: "read", table: query.table, columns: query.columns, filters: query.filters });
    const response = this.readResponses.shift();
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  }
  queueRpc(response) { this.rpcResponses.push(response); }
  queueRead(response) { this.readResponses.push(response); }
}

function session() {
  return {
    user: {
      userId: "actor-a",
      provider: "mock",
      isAnonymous: false,
      emailVerified: true,
      createdAt: "2026-07-18T00:00:00.000Z"
    },
    provider: "mock",
    issuedAt: "2026-07-18T00:00:00.000Z"
  };
}

function auth(value = session()) {
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value }; },
    observeAuthState() { return () => undefined; },
    async signIn() { return { ok: true, value: value ?? session() }; },
    async signUp() { return { ok: true, value: value ?? session() }; },
    async signOut() { return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value }; }
  };
}

const createdAt = "2026-07-18T08:00:00.000Z";
const restaurantTarget = { kind: "restaurant", restaurantId: "restaurant-1" };
const menuTarget = { kind: "menu_item", restaurantId: "restaurant-1", menuItemId: "menu-item-1" };

function restaurantResponse(status, active = true) {
  if (status === "already_absent") {
    return { status, target_kind: "restaurant", restaurant_id: restaurantTarget.restaurantId };
  }
  return {
    status,
    target_kind: "restaurant",
    restaurant_id: restaurantTarget.restaurantId,
    favorite_id: "00000000-0000-4000-8000-000000000001",
    collection_label: null,
    sort_order: 1,
    created_at: createdAt,
    active
  };
}

function menuResponse(status, active = true) {
  if (status === "already_absent") {
    return {
      status,
      target_kind: "menu_item",
      restaurant_id: menuTarget.restaurantId,
      menu_item_id: menuTarget.menuItemId
    };
  }
  return {
    status,
    target_kind: "menu_item",
    restaurant_id: menuTarget.restaurantId,
    menu_item_id: menuTarget.menuItemId,
    favorite_id: "00000000-0000-4000-8000-000000000002",
    collection_label: "午餐",
    sort_order: null,
    created_at: createdAt,
    active
  };
}

function success(data) {
  return { data, error: null, status: 200 };
}

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
  expect(diagnostics.length === 0, "Phase 2X-D-A TypeScript contract compilation", diagnostics.map(formatDiagnostic).join("\n"));

  const requireFromTemp = createRequire(path.join(compiledRoot, "consumer-favorites", "index.js"));
  const favorite = requireFromTemp("./index.js");
  const defaults = favorite.getConsumerFavoriteRuntimeFlags({});
  expect(defaults.readSource === "disabled" && defaults.writeSource === "disabled", "default read and write remain disabled");
  const explicit = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "disabled",
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "supabase"
  });
  expect(explicit.writeSource === "supabase" && explicit.issues.length === 0, "Supabase write is explicit opt-in");
  const invalid = favorite.getConsumerFavoriteRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "live-ish"
  });
  expect(invalid.writeSource === "disabled" && invalid.issues.length === 1, "invalid write source fails closed without mock fallback");

  let missingAuthError = null;
  try {
    favorite.createConsumerFavoriteRuntime({ flags: explicit, favoriteClient: new FakeFavoriteClient() });
  } catch (error) {
    missingAuthError = error;
  }
  expect(missingAuthError?.code === "favorite_configuration_invalid", "Supabase write requires an injected Auth boundary");

  let missingClientError = null;
  try {
    favorite.createConsumerFavoriteRuntime({ flags: explicit, authPort: auth() });
  } catch (error) {
    missingClientError = error;
  }
  expect(missingClientError?.code === "favorite_configuration_invalid", "Supabase write requires an injected client");

  let readOnlyClientError = null;
  try {
    favorite.createConsumerFavoriteRuntime({ flags: explicit, authPort: auth(), favoriteClient: { from() {} } });
  } catch (error) {
    readOnlyClientError = error;
  }
  expect(readOnlyClientError?.code === "favorite_configuration_invalid", "Supabase write requires an RPC-capable client");

  const client = new FakeFavoriteClient();
  const runtime = favorite.createConsumerFavoriteRuntime({ flags: explicit, authPort: auth(), favoriteClient: client });
  expect(runtime.readRepository.readSource === "disabled", "read source stays independent from Supabase write");
  expect(runtime.writeRepository.writeSource === "supabase", "factory composes the Supabase write repository");
  expect(client.calls.length === 0, "factory construction makes zero client calls");

  client.queueRpc(success(restaurantResponse("added")));
  const restaurantAdded = await runtime.service.addCurrentUserFavorite(restaurantTarget);
  expect(restaurantAdded.status === "added" && restaurantAdded.record.active, "restaurant added response maps canonically");
  const restaurantAddCall = client.calls.at(-1);
  expect(restaurantAddCall.functionName === "add_authenticated_restaurant_favorite", "restaurant add uses the approved RPC");
  expect(JSON.stringify(restaurantAddCall.arguments) === JSON.stringify({ p_restaurant_id: "restaurant-1" }), "restaurant add sends exact target-only arguments");

  client.queueRpc(success(restaurantResponse("already_present")));
  const restaurantDuplicate = await runtime.service.addCurrentUserFavorite(restaurantTarget);
  expect(restaurantDuplicate.status === "already_present", "duplicate restaurant add maps already_present");
  client.queueRpc(success(restaurantResponse("already_present")));
  const restaurantDuplicateRepeat = await runtime.service.addCurrentUserFavorite(restaurantTarget);
  expect(JSON.stringify(restaurantDuplicate) === JSON.stringify(restaurantDuplicateRepeat), "duplicate response mapping is deterministic");

  client.queueRpc(success(restaurantResponse("removed", false)));
  const restaurantRemoved = await runtime.service.removeCurrentUserFavorite(restaurantTarget);
  expect(restaurantRemoved.status === "removed" && !restaurantRemoved.record.active, "restaurant remove maps a soft-removed record");
  const restaurantRemoveCall = client.calls.at(-1);
  expect(restaurantRemoveCall.functionName === "remove_authenticated_restaurant_favorite", "restaurant remove uses the approved RPC");
  expect(JSON.stringify(restaurantRemoveCall.arguments) === JSON.stringify({ p_restaurant_id: "restaurant-1" }), "restaurant remove sends exact target-only arguments");

  client.queueRpc(success(restaurantResponse("already_absent")));
  const restaurantAbsent = await runtime.service.removeCurrentUserFavorite(restaurantTarget);
  expect(restaurantAbsent.status === "already_absent" && restaurantAbsent.target.restaurantId === "restaurant-1", "second restaurant remove maps already_absent");

  client.queueRpc(success(menuResponse("added")));
  const menuAdded = await runtime.service.addCurrentUserFavorite(menuTarget);
  expect(menuAdded.status === "added" && menuAdded.record.target.kind === "menu_item", "menu-item added response maps canonically");
  const menuAddCall = client.calls.at(-1);
  expect(menuAddCall.functionName === "add_authenticated_menu_item_favorite", "menu-item add uses the approved RPC");
  expect(JSON.stringify(menuAddCall.arguments) === JSON.stringify({ p_restaurant_id: "restaurant-1", p_menu_item_id: "menu-item-1" }), "menu-item add sends exact parent and item arguments");

  client.queueRpc(success(menuResponse("removed", false)));
  const menuRemoved = await runtime.service.removeCurrentUserFavorite(menuTarget);
  expect(menuRemoved.status === "removed" && !menuRemoved.record.active, "menu-item remove maps a soft-removed record");
  const menuRemoveCall = client.calls.at(-1);
  expect(menuRemoveCall.functionName === "remove_authenticated_menu_item_favorite", "menu-item remove uses the approved RPC");
  expect(JSON.stringify(menuRemoveCall.arguments) === JSON.stringify({ p_restaurant_id: "restaurant-1", p_menu_item_id: "menu-item-1" }), "menu-item remove sends the full canonical target identity");

  client.queueRpc(success(menuResponse("already_absent")));
  expect((await runtime.service.removeCurrentUserFavorite(menuTarget)).status === "already_absent", "second menu-item remove maps already_absent");
  expect(client.calls.filter((call) => call.kind === "rpc").every((call) => !Object.keys(call.arguments).some((key) => /user|owner/i.test(key))), "RPC arguments contain no ownership field");

  const signedOutClient = new FakeFavoriteClient();
  const signedOutRuntime = favorite.createConsumerFavoriteRuntime({ flags: explicit, authPort: auth(null), favoriteClient: signedOutClient });
  const signedOut = await signedOutRuntime.service.addCurrentUserFavorite(restaurantTarget);
  expect(signedOut.status === "unauthenticated" && signedOutClient.calls.length === 0, "unauthenticated write fails before RPC");

  for (const [response, expectedCode, name] of [
    [{ data: null, error: { code: "28000" }, status: 401 }, "favorite_authentication_required", "RPC authentication denial maps"],
    [{ data: null, error: { code: "42501" }, status: 403 }, "favorite_permission_denied", "RPC permission denial maps"],
    [{ data: null, error: { code: "XX000" }, status: 500 }, "favorite_database_failed", "RPC database failure maps"]
  ]) {
    client.queueRpc(response);
    const result = await runtime.service.addCurrentUserFavorite(restaurantTarget);
    expect((result.status === "unauthenticated" || result.status === "write_failed") && result.error.code === expectedCode, name);
  }

  client.queueRpc(new Error("offline"));
  const transport = await runtime.service.addCurrentUserFavorite(restaurantTarget);
  expect(transport.status === "write_failed" && transport.error.code === "favorite_transport_failed", "RPC transport failure maps without details");

  for (const [malformed, name] of [
    [{ ...restaurantResponse("added"), active: false }, "added response with inactive state fails closed"],
    [{ ...restaurantResponse("added"), user_id: "forbidden" }, "ownership-bearing response fails closed"],
    [{ ...restaurantResponse("added"), restaurant_id: "wrong-target" }, "target-mismatched response fails closed"],
    [{ ...restaurantResponse("added"), status: "saved" }, "non-Frozen saved vocabulary fails closed"]
  ]) {
    client.queueRpc(success(malformed));
    const result = await runtime.service.addCurrentUserFavorite(restaurantTarget);
    expect(result.status === "write_failed" && result.error.code === "favorite_response_malformed", name);
  }

  const readClient = new FakeFavoriteClient();
  const readFlags = { readSource: "supabase", writeSource: "disabled", issues: [] };
  const readRuntime = favorite.createConsumerFavoriteRuntime({ flags: readFlags, authPort: auth(), favoriteClient: readClient });
  readClient.queueRead(success({
    id: "00000000-0000-4000-8000-000000000003",
    restaurant_id: "restaurant-1",
    collection_label: null,
    sort_order: null,
    created_at: createdAt,
    removed_at: null
  }));
  const readResult = await readRuntime.service.getCurrentUserFavorite(restaurantTarget);
  expect(readResult.status === "available" && readResult.source === "supabase", "Frozen Supabase read behavior remains available");
  expect(readRuntime.writeRepository.writeSource === "disabled", "Supabase read does not activate writes");

  const adapterSource = fs.readFileSync(path.join(favoriteRoot, "adapters", "supabaseConsumerFavoriteWriteRepository.ts"), "utf8");
  const contractSource = fs.readFileSync(path.join(favoriteRoot, "supabaseFavoriteContracts.ts"), "utf8");
  expect(!/\.(?:insert|update|delete|upsert)\s*\(/.test(adapterSource), "write adapter contains no direct table DML");
  expect(!/user_id|userId|owner_id|ownerId/.test(contractSource), "write contract exposes no ownership argument");
  expect(!/MockConsumerFavorite|fallback/i.test(adapterSource), "write adapter contains no mock fallback");
  expect(!/console\.|logger\.|SUPABASE_ACCESS_TOKEN/.test(`${adapterSource}\n${contractSource}`), "write path logs no payload or privileged credential");

  console.log(JSON.stringify({
    status: "passed",
    phase: "Consumer Runtime Phase 2X-D-A Atomic Favorites Write Contract Smoke",
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    migrationExecuted: false,
    databaseWriteUsed: false,
    productionTouched: false,
    privilegedCredentialUsed: false,
    n4Executed: false,
    phase2YStarted: false
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-D-A Atomic Favorites Write Contract Smoke",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    migrationExecuted: false,
    databaseWriteUsed: false,
    productionTouched: false,
    privilegedCredentialUsed: false,
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
