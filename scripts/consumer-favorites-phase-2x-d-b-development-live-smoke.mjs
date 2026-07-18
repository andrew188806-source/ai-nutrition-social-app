import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const phase = "Consumer Runtime Phase 2X-D-B Development Atomic Favorites Write Execution";
const root = process.cwd();
const expectedProjectRef = "msbgnnoorsoefuiwluye";
const expectedMigration = "20260718020000_consumer_favorites_atomic_write.sql";
const expectedMigrationSha = "63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475";
const liveOptInKey = "TASTKIND_CONSUMER_PHASE2X_DB_DEVELOPMENT_LIVE_SMOKE";
const operatorModuleKey = "TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_MODULE";
const checks = [];
const canonicalStatuses = [];
let tempRoot = null;

const aggregateSql = `
select
  (select count(*)::bigint from public.favorite_restaurants) as restaurant_count,
  (select count(*)::bigint from public.favorite_menu_items) as menu_item_count
`;
const catalogSql = `
select
  exists(select 1 from public.restaurants where id = $1) as restaurant_exists,
  exists(select 1 from public.restaurants where id = $2) as menu_restaurant_exists,
  exists(select 1 from public.menu_items where id = $3 and restaurant_id = $2) as menu_pair_exists,
  exists(select 1 from public.restaurants where id = $4 and id <> $2) as wrong_parent_exists,
  not exists(select 1 from public.menu_items where id = $3 and restaurant_id = $4) as wrong_pair_absent
`;
const controlledCountSql = `
select
  (select count(*)::bigint from public.favorite_restaurants
    where user_id = any($1::uuid[]) and restaurant_id = $2) as restaurant_total,
  (select count(*)::bigint from public.favorite_restaurants
    where user_id = any($1::uuid[]) and restaurant_id = $2 and removed_at is null) as restaurant_active,
  (select count(*)::bigint from public.favorite_menu_items
    where user_id = any($1::uuid[]) and restaurant_id = $3 and menu_item_id = $4) as menu_item_total,
  (select count(*)::bigint from public.favorite_menu_items
    where user_id = any($1::uuid[]) and restaurant_id = $3 and menu_item_id = $4 and removed_at is null) as menu_item_active,
  (select count(*)::bigint from public.favorite_menu_items
    where user_id = any($1::uuid[]) and restaurant_id = $5 and menu_item_id = $4) as wrong_parent_total,
  (select count(*)::bigint from public.favorite_menu_items
    where user_id = any($1::uuid[]) and restaurant_id = $5 and menu_item_id = $4 and removed_at is null) as wrong_parent_active
`;
const targetCountSql = `
select count(*)::bigint as total,
       count(*) filter (where removed_at is null)::bigint as active
from public.__FAVORITE_TABLE__
where user_id = $1::uuid and __TARGET_PREDICATE__
`;
const cleanupStatements = [
  {
    text: `delete from public.favorite_menu_items
      where user_id = any($1::uuid[]) and restaurant_id = $2 and menu_item_id = $3`,
    parameterKeys: ["actorUserIds", "menuRestaurantId", "menuItemId"]
  },
  {
    text: `delete from public.favorite_menu_items
      where user_id = any($1::uuid[]) and restaurant_id = $2 and menu_item_id = $3`,
    parameterKeys: ["actorUserIds", "wrongParentRestaurantId", "menuItemId"]
  },
  {
    text: `delete from public.favorite_restaurants
      where user_id = any($1::uuid[]) and restaurant_id = $2`,
    parameterKeys: ["actorUserIds", "restaurantId"]
  }
];

function report(status, extra = {}) {
  console.log(JSON.stringify({
    status,
    phase,
    ...extra,
    credentialsPrinted: false,
    emailPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    targetIdPrinted: false,
    favoriteContentPrinted: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2XEStarted: false,
    phase2YStarted: false
  }, null, 2));
}

function pass(name) {
  checks.push({ name, pass: true });
}

function assert(condition, name) {
  if (!condition) throw new Error(name);
  pass(name);
}

function recordStatus(actorLabel, entityLabel, operation, status) {
  canonicalStatuses.push({ actor: actorLabel, entity: entityLabel, operation, status });
}

function skip() {
  report("skipped", {
    reason: "Development write smoke is explicit opt-in only.",
    requiredOptInKey: liveOptInKey,
    checks,
    networkUsed: false,
    databaseUsed: false,
    cleanupExecuted: false,
    persistentTestData: false
  });
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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-d-b-"));
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
  if (diagnostics.length) throw new Error("Runtime compilation failed.");
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

function parseDotEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
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

function requireExactGate(env, key, expected, missing) {
  if (env[key] === undefined || env[key] === "") missing.push(key);
  else if (env[key] !== expected) throw new Error(`Development gate mismatch: ${key}.`);
}

function requirePresent(env, alternatives, missing) {
  const key = alternatives.find((candidate) => env[candidate]);
  if (!key) missing.push(alternatives.join(" or "));
  return key ? env[key] : undefined;
}

function validateLiveGates(env, cleanupCapability) {
  const missing = [];
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_PROJECT_REF", expectedProjectRef, missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_PRODUCTION", "false", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_LOCAL_MIGRATION_COUNT", "36", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_REMOTE_MIGRATION_COUNT", "36", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_LATEST_REMOTE_MIGRATION", expectedMigration, missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_MIGRATION_SHA", expectedMigrationSha, missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_RPC_ACL_EVIDENCE_VERIFIED", "true", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_MENU_ID_UNIQUENESS_VERIFIED", "true", missing);
  requireExactGate(env, "TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_READY", "true", missing);
  if (!cleanupCapability) missing.push(operatorModuleKey);
  const values = {
    supabaseUrl: requirePresent(env, ["EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"], missing),
    publishableKey: requirePresent(env, ["EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"], missing),
    actorOneEmail: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_1_EMAIL"], missing),
    actorOnePassword: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_1_PASSWORD", "TASTKIND_DV_TEST_PASSWORD"], missing),
    actorTwoEmail: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_2_EMAIL"], missing),
    actorTwoPassword: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_2_PASSWORD", "TASTKIND_DV_TEST_PASSWORD"], missing),
    restaurantId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_RESTAURANT_ID"], missing),
    menuRestaurantId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_MENU_RESTAURANT_ID"], missing),
    menuItemId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_MENU_ITEM_ID"], missing),
    wrongParentRestaurantId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_WRONG_PARENT_RESTAURANT_ID"], missing)
  };
  if (missing.length) return { ok: false, missing };
  if (projectRefFromUrl(values.supabaseUrl) !== expectedProjectRef) throw new Error("Development gate mismatch: Supabase URL project reference.");
  if (values.actorOneEmail === values.actorTwoEmail) throw new Error("Development gate mismatch: actor credentials must be distinct.");
  return { ok: true, values };
}

function projectRefFromUrl(value) {
  try { return new URL(value).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function normalizeCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Operator count was malformed.");
  return count;
}

function normalizeAggregate(row) {
  return {
    restaurantCount: normalizeCount(row?.restaurant_count),
    menuItemCount: normalizeCount(row?.menu_item_count)
  };
}

function aggregateEquals(left, right) {
  return left.restaurantCount === right.restaurantCount && left.menuItemCount === right.menuItemCount;
}

class DevelopmentOperator {
  constructor(raw) { this.raw = raw; }
  async verifyReady() {
    const capabilities = this.raw.capabilities;
    if (capabilities?.developmentOnly !== true || capabilities?.parameterizedQueries !== true || capabilities?.transactions !== true) {
      throw new Error("Cleanup operator capability was not confirmed.");
    }
  }
  async captureAggregate() {
    const result = await this.raw.query(aggregateSql, []);
    return normalizeAggregate(result?.rows?.[0]);
  }
  async verifyCatalog(scope) {
    const result = await this.raw.query(catalogSql, [scope.restaurantId, scope.menuRestaurantId, scope.menuItemId, scope.wrongParentRestaurantId]);
    const row = result?.rows?.[0];
    return row?.restaurant_exists === true && row?.menu_restaurant_exists === true && row?.menu_pair_exists === true && row?.wrong_parent_exists === true && row?.wrong_pair_absent === true;
  }
  async countControlled(scope) {
    const result = await this.raw.query(controlledCountSql, [scope.actorUserIds, scope.restaurantId, scope.menuRestaurantId, scope.menuItemId, scope.wrongParentRestaurantId]);
    const row = result?.rows?.[0];
    return {
      restaurantTotal: normalizeCount(row?.restaurant_total),
      restaurantActive: normalizeCount(row?.restaurant_active),
      menuItemTotal: normalizeCount(row?.menu_item_total),
      menuItemActive: normalizeCount(row?.menu_item_active),
      wrongParentTotal: normalizeCount(row?.wrong_parent_total),
      wrongParentActive: normalizeCount(row?.wrong_parent_active)
    };
  }
  async countTarget(userId, target) {
    const table = target.kind === "restaurant" ? "favorite_restaurants" : "favorite_menu_items";
    const predicate = target.kind === "restaurant"
      ? "restaurant_id = $2"
      : "restaurant_id = $2 and menu_item_id = $3";
    const sql = targetCountSql.replace("__FAVORITE_TABLE__", table).replace("__TARGET_PREDICATE__", predicate);
    const parameters = target.kind === "restaurant"
      ? [userId, target.restaurantId]
      : [userId, target.restaurantId, target.menuItemId];
    const result = await this.raw.query(sql, parameters);
    return { total: normalizeCount(result?.rows?.[0]?.total), active: normalizeCount(result?.rows?.[0]?.active) };
  }
  async cleanup(scope) {
    const statements = cleanupStatements.map(({ text, parameterKeys }) => ({
      text,
      parameters: parameterKeys.map((key) => scope[key])
    }));
    await this.raw.transaction(statements);
  }
  async close() { if (typeof this.raw.close === "function") await this.raw.close(); }
}

async function loadDevelopmentOperator(env) {
  const modulePath = env[operatorModuleKey];
  if (!modulePath) return null;
  const imported = await import(pathToFileURL(path.resolve(modulePath)).href);
  if (typeof imported.createDevelopmentCleanupOperator !== "function") throw new Error("Cleanup operator module contract is invalid.");
  const raw = await imported.createDevelopmentCleanupOperator();
  if (!raw || typeof raw.query !== "function" || typeof raw.transaction !== "function") throw new Error("Cleanup operator module contract is invalid.");
  return new DevelopmentOperator(raw);
}

function createMemoryStorage() {
  const values = new Map();
  return {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
    clear() { values.clear(); }
  };
}

function createLiveActor(label, credential, dependencies) {
  const storage = createMemoryStorage();
  let favoriteClient;
  const authPort = dependencies.authFactories.createConsumerAuthPort(dependencies.authFlags, {
    env: { url: dependencies.supabaseUrl, publishableKey: dependencies.publishableKey },
    storage,
    sdkLoader(options) {
      favoriteClient = dependencies.createClient(options.url, options.publishableKey, {
        auth: { ...options.auth, lock: options.auth.lock ?? dependencies.processLock }
      });
      return favoriteClient;
    }
  });
  if (!favoriteClient) throw new Error("Consumer Auth factory did not inject a public client.");
  const runtime = dependencies.favorite.createConsumerFavoriteRuntime({
    authPort,
    favoriteClient,
    flags: { readSource: "supabase", writeSource: "supabase", issues: [] }
  });
  return { label, credential, authPort, favoriteClient, runtime, storage, userId: null, signedIn: false };
}

async function signInActor(actor) {
  const result = await actor.authPort.signIn(actor.credential);
  if (!result.ok || !result.value?.user?.userId) throw new Error("Consumer Auth sign-in failed.");
  actor.userId = result.value.user.userId;
  actor.signedIn = true;
  pass(`${actor.label} sign-in succeeded through Consumer Auth factory`);
}

async function signOutActor(actor) {
  if (actor.signedIn) {
    const result = await actor.authPort.signOut();
    if (!result.ok) throw new Error("Consumer Auth sign-out failed.");
  }
  actor.storage.clear();
  const session = await actor.authPort.getCurrentSession();
  if (!session.ok || session.value !== null) throw new Error("Consumer Auth session cleanup failed.");
  actor.signedIn = false;
  actor.userId = null;
  pass(`${actor.label} sign-out and session cleared`);
}

function targetLabel(target) {
  return target.kind === "restaurant" ? "RESTAURANT" : "MENU_ITEM";
}

async function expectRead(service, target, expected, actorLabel) {
  const result = await service.getCurrentUserFavorite(target);
  assert(result.status === expected, `${actorLabel} ${targetLabel(target)} read is ${expected}`);
  return result;
}

async function runTargetLifecycle(actor, target, operator) {
  const entity = targetLabel(target);
  await expectRead(actor.runtime.service, target, "missing", actor.label);
  const added = await actor.runtime.service.addCurrentUserFavorite(target);
  assert(added.status === "added", `${actor.label} ${entity} initial add is added`);
  recordStatus(actor.label, entity, "add", added.status);
  await expectRead(actor.runtime.service, target, "available", actor.label);
  const duplicate = await actor.runtime.service.addCurrentUserFavorite(target);
  assert(duplicate.status === "already_present", `${actor.label} ${entity} duplicate add is already_present`);
  recordStatus(actor.label, entity, "duplicate_add", duplicate.status);
  const removed = await actor.runtime.service.removeCurrentUserFavorite(target);
  assert(removed.status === "removed", `${actor.label} ${entity} remove is removed`);
  recordStatus(actor.label, entity, "remove", removed.status);
  const repeated = await actor.runtime.service.removeCurrentUserFavorite(target);
  assert(repeated.status === "already_absent", `${actor.label} ${entity} repeated remove is already_absent`);
  recordStatus(actor.label, entity, "repeated_remove", repeated.status);

  const concurrentAdds = await Promise.all([
    actor.runtime.service.addCurrentUserFavorite(target),
    actor.runtime.service.addCurrentUserFavorite(target)
  ]);
  const addStatuses = concurrentAdds.map(({ status }) => status).sort();
  assert(JSON.stringify(addStatuses) === JSON.stringify(["added", "already_present"]), `${actor.label} ${entity} concurrent add converges canonically`);
  const afterConcurrentAdd = await operator.countTarget(actor.userId, target);
  assert(afterConcurrentAdd.active === 1, `${actor.label} ${entity} concurrent add leaves one active row`);

  const concurrentRemoves = await Promise.all([
    actor.runtime.service.removeCurrentUserFavorite(target),
    actor.runtime.service.removeCurrentUserFavorite(target)
  ]);
  const removeStatuses = concurrentRemoves.map(({ status }) => status).sort();
  assert(JSON.stringify(removeStatuses) === JSON.stringify(["already_absent", "removed"]), `${actor.label} ${entity} concurrent remove converges canonically`);
  const afterConcurrentRemove = await operator.countTarget(actor.userId, target);
  assert(afterConcurrentRemove.active === 0, `${actor.label} ${entity} concurrent remove leaves no active row`);

  const readded = await actor.runtime.service.addCurrentUserFavorite(target);
  assert(readded.status === "added" && readded.record.favoriteId !== added.record.favoriteId, `${actor.label} ${entity} re-add creates a new favorite identity`);
  const finalCount = await operator.countTarget(actor.userId, target);
  assert(finalCount.active === 1 && finalCount.total >= 3, `${actor.label} ${entity} re-add preserves removed history`);
}

async function verifyWrongParent(actor, wrongTarget, operator) {
  const before = await operator.countTarget(actor.userId, wrongTarget);
  const result = await actor.runtime.service.addCurrentUserFavorite(wrongTarget);
  assert(result.status === "write_failed" || result.status === "invalid_target", `${actor.label} wrong-parent menu add fails closed`);
  const after = await operator.countTarget(actor.userId, wrongTarget);
  assert(before.total === after.total && before.active === after.active, `${actor.label} wrong-parent failure writes no row`);
}

async function verifyCrossActor(actorOne, actorTwo, targets) {
  for (const target of targets) {
    const entity = targetLabel(target);
    await expectRead(actorTwo.runtime.service, target, "missing", actorTwo.label);
    const deniedMutation = await actorTwo.runtime.service.removeCurrentUserFavorite(target);
    assert(deniedMutation.status === "already_absent", `${actorTwo.label} cannot remove ${actorOne.label} ${entity}`);
    const ownAdd = await actorTwo.runtime.service.addCurrentUserFavorite(target);
    assert(ownAdd.status === "added", `${actorTwo.label} creates independent ${entity}`);
    const actorOneRead = await actorOne.runtime.service.getCurrentUserFavorite(target);
    const actorTwoRead = await actorTwo.runtime.service.getCurrentUserFavorite(target);
    assert(actorOneRead.status === "available" && actorTwoRead.status === "available" && actorOneRead.record.favoriteId !== actorTwoRead.record.favoriteId, `${entity} remains isolated across actors`);
    for (const actor of [actorOne, actorTwo]) {
      const list = await actor.runtime.service.listCurrentUserFavorites({ entityType: target.kind, pageSize: 50 });
      assert((list.status === "available" || list.status === "empty") && list.records.filter((record) => targetsEqual(record.target, target)).length === 1, `${actor.label} ${entity} list exposes only own controlled row`);
    }
  }
}

function targetsEqual(left, right) {
  return left.kind === right.kind && left.restaurantId === right.restaurantId &&
    (left.kind === "restaurant" || (right.kind === "menu_item" && left.menuItemId === right.menuItemId));
}

async function verifyDirectDmlDenied(actor, scope, operator) {
  const before = await operator.countControlled(scope);
  const attempts = [
    actor.favoriteClient.from("favorite_restaurants").insert({ user_id: actor.userId, restaurant_id: scope.restaurantId }),
    actor.favoriteClient.from("favorite_restaurants").update({ sort_order: 99 }).eq("user_id", actor.userId).eq("restaurant_id", scope.restaurantId),
    actor.favoriteClient.from("favorite_restaurants").delete().eq("user_id", actor.userId).eq("restaurant_id", scope.restaurantId),
    actor.favoriteClient.from("favorite_menu_items").insert({ user_id: actor.userId, restaurant_id: scope.menuRestaurantId, menu_item_id: scope.menuItemId }),
    actor.favoriteClient.from("favorite_menu_items").update({ sort_order: 99 }).eq("user_id", actor.userId).eq("menu_item_id", scope.menuItemId),
    actor.favoriteClient.from("favorite_menu_items").delete().eq("user_id", actor.userId).eq("menu_item_id", scope.menuItemId)
  ];
  const results = await Promise.all(attempts);
  assert(results.length === 6 && results.every(({ error }) => error && (error.code === "42501" || error.status === 401 || error.status === 403)), "authenticated direct DML denial is 6/6");
  const after = await operator.countControlled(scope);
  assert(JSON.stringify(after) === JSON.stringify(before), "direct DML denial preserves controlled row counts");
}

async function executeControlledSmoke({ actors, operator, scope, injectFailure = false }) {
  const cleanupEvidence = { attempted: false, succeeded: false, controlledRowsAfter: null, aggregateRestored: false, sessionsCleared: false };
  let baseline = null;
  let primaryError = null;
  try {
    await operator.verifyReady();
    pass("cleanup operator capability confirmed before write smoke");
    baseline = await operator.captureAggregate();
    assert(await operator.verifyCatalog(scope), "controlled canonical target catalog evidence passed");
    for (const actor of actors) await signInActor(actor);
    scope.actorUserIds = actors.map(({ userId }) => userId);
    const initial = await operator.countControlled(scope);
    assert(Object.values(initial).every((count) => count === 0), "controlled actors and targets have no pre-smoke rows");

    const restaurantTarget = { kind: "restaurant", restaurantId: scope.restaurantId };
    const menuTarget = { kind: "menu_item", restaurantId: scope.menuRestaurantId, menuItemId: scope.menuItemId };
    const wrongTarget = { kind: "menu_item", restaurantId: scope.wrongParentRestaurantId, menuItemId: scope.menuItemId };
    await runTargetLifecycle(actors[0], restaurantTarget, operator);
    if (injectFailure) throw new Error("INJECTED_DRY_RUN_FAILURE");
    await verifyWrongParent(actors[0], wrongTarget, operator);
    await runTargetLifecycle(actors[0], menuTarget, operator);
    await verifyCrossActor(actors[0], actors[1], [restaurantTarget, menuTarget]);
    await verifyDirectDmlDenied(actors[0], scope, operator);
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    cleanupEvidence.attempted = true;
    try {
      if (scope.actorUserIds.length) await operator.cleanup(scope);
      const remaining = scope.actorUserIds.length ? await operator.countControlled(scope) : { restaurantTotal: 0, restaurantActive: 0, menuItemTotal: 0, menuItemActive: 0 };
      cleanupEvidence.controlledRowsAfter = Object.values(remaining).reduce((sum, count) => sum + count, 0);
      cleanupEvidence.succeeded = cleanupEvidence.controlledRowsAfter === 0;
    } catch { cleanupErrors.push("operator cleanup"); }
    for (const actor of actors) {
      try { await signOutActor(actor); } catch { cleanupErrors.push(`${actor.label} session cleanup`); }
    }
    cleanupEvidence.sessionsCleared = actors.every(({ signedIn, userId }) => !signedIn && userId === null);
    try {
      const after = await operator.captureAggregate();
      cleanupEvidence.aggregateRestored = baseline !== null && aggregateEquals(baseline, after);
    } catch { cleanupErrors.push("aggregate comparison"); }
    try { await operator.close(); } catch { cleanupErrors.push("operator close"); }
    if (!cleanupEvidence.succeeded || !cleanupEvidence.sessionsCleared || !cleanupEvidence.aggregateRestored || cleanupErrors.length) {
      primaryError = new Error("Cleanup or aggregate restoration failed.");
    }
  }
  if (primaryError) {
    primaryError.cleanupEvidence = cleanupEvidence;
    throw primaryError;
  }
  return cleanupEvidence;
}

class FakeFavoriteQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.limitCount = null;
    this.operation = "select";
    this.payload = null;
  }
  select() { return this; }
  eq(column, value) { this.filters.push(["eq", column, value]); return this; }
  is(column, value) { this.filters.push(["is", column, value]); return this; }
  or() { return this; }
  order(column, options) { this.orders.push([column, options]); return this; }
  limit(count) { this.limitCount = count; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  delete() { this.operation = "delete"; return this; }
  maybeSingle() { return this.client.finishQuery(this, true); }
  then(resolve, reject) { return this.client.finishQuery(this, false).then(resolve, reject); }
}

class FakeFavoriteClient {
  constructor(actorId, store) { this.actorId = actorId; this.store = store; this.calls = []; }
  from(table) { return new FakeFavoriteQuery(this, table); }
  async rpc(functionName, args) {
    this.calls.push({ kind: "rpc", functionName });
    return this.store.rpc(this.actorId, functionName, args);
  }
  async finishQuery(query, single) {
    this.calls.push({ kind: query.operation, table: query.table });
    if (query.operation !== "select") return { data: null, error: { code: "42501", status: 403 }, status: 403 };
    return this.store.read(this.actorId, query, single);
  }
}

class FakeStore {
  constructor() { this.rows = []; this.sequence = 0; }
  targetFromRpc(name, args) {
    return name.includes("menu_item")
      ? { kind: "menu_item", restaurantId: args.p_restaurant_id, menuItemId: args.p_menu_item_id }
      : { kind: "restaurant", restaurantId: args.p_restaurant_id };
  }
  async rpc(actorId, name, args) {
    const target = this.targetFromRpc(name, args);
    if (target.kind === "menu_item" && target.restaurantId !== "menu-restaurant") return { data: null, error: { code: "22023" }, status: 400 };
    const active = this.rows.find((row) => row.actorId === actorId && targetsEqual(row.target, target) && row.removedAt === null);
    if (name.startsWith("add_")) {
      if (active) return { data: this.writeResponse("already_present", active), error: null, status: 200 };
      const row = { actorId, favoriteId: `fake-favorite-${++this.sequence}`, target, createdAt: `2026-07-18T00:00:${String(this.sequence).padStart(2, "0")}.000Z`, removedAt: null };
      this.rows.push(row);
      return { data: this.writeResponse("added", row), error: null, status: 200 };
    }
    if (!active) return { data: this.absentResponse(target), error: null, status: 200 };
    active.removedAt = "2026-07-18T01:00:00.000Z";
    return { data: this.writeResponse("removed", active), error: null, status: 200 };
  }
  writeResponse(status, row) {
    return {
      status,
      target_kind: row.target.kind,
      restaurant_id: row.target.restaurantId,
      ...(row.target.kind === "menu_item" ? { menu_item_id: row.target.menuItemId } : {}),
      favorite_id: row.favoriteId,
      collection_label: null,
      sort_order: null,
      created_at: row.createdAt,
      active: status !== "removed"
    };
  }
  absentResponse(target) {
    return {
      status: "already_absent",
      target_kind: target.kind,
      restaurant_id: target.restaurantId,
      ...(target.kind === "menu_item" ? { menu_item_id: target.menuItemId } : {})
    };
  }
  async read(actorId, query, single) {
    const targetKind = query.table === "favorite_restaurants" ? "restaurant" : "menu_item";
    let rows = this.rows.filter((row) => row.actorId === actorId && row.target.kind === targetKind && row.removedAt === null);
    for (const [, column, value] of query.filters) {
      if (column === "restaurant_id") rows = rows.filter((row) => row.target.restaurantId === value);
      if (column === "menu_item_id") rows = rows.filter((row) => row.target.kind === "menu_item" && row.target.menuItemId === value);
    }
    rows = rows.map((row) => ({
      id: row.favoriteId,
      restaurant_id: row.target.restaurantId,
      ...(row.target.kind === "menu_item" ? { menu_item_id: row.target.menuItemId } : {}),
      collection_label: null,
      sort_order: null,
      created_at: row.createdAt,
      removed_at: null
    }));
    if (single) return { data: rows[0] ?? null, error: null, status: 200 };
    return { data: rows.slice(0, query.limitCount ?? rows.length), error: null, status: 200 };
  }
}

function fakeAuthPort(actorId) {
  let currentSession = null;
  const session = { user: { userId: actorId, provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-07-18T00:00:00.000Z" }, provider: "mock", issuedAt: "2026-07-18T00:00:00.000Z" };
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value: currentSession }; },
    observeAuthState() { return () => undefined; },
    async signIn() { currentSession = session; return { ok: true, value: session }; },
    async signUp() { return { ok: true, value: session }; },
    async signOut() { currentSession = null; return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value: currentSession }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value: currentSession }; }
  };
}

class FakeOperator {
  constructor(store) {
    this.store = store;
    this.capabilities = { developmentOnly: true, parameterizedQueries: true, transactions: true };
    this.cleanupCalls = 0;
    this.closed = false;
  }
  async query(sql, parameters) {
    if (sql === aggregateSql) return { rows: [{ restaurant_count: this.store.rows.filter(({ target }) => target.kind === "restaurant").length, menu_item_count: this.store.rows.filter(({ target }) => target.kind === "menu_item").length }] };
    if (sql === catalogSql) return { rows: [{ restaurant_exists: true, menu_restaurant_exists: true, menu_pair_exists: true, wrong_parent_exists: true, wrong_pair_absent: true }] };
    const actorIds = Array.isArray(parameters[0]) ? parameters[0] : [parameters[0]];
    const relevant = this.store.rows.filter((row) => actorIds.includes(row.actorId));
    if (sql === controlledCountSql) {
      const restaurants = relevant.filter((row) => row.target.kind === "restaurant" && row.target.restaurantId === parameters[1]);
      const menus = relevant.filter((row) => row.target.kind === "menu_item" && row.target.restaurantId === parameters[2] && row.target.menuItemId === parameters[3]);
      const wrongParentRows = relevant.filter((row) => row.target.kind === "menu_item" && row.target.restaurantId === parameters[4] && row.target.menuItemId === parameters[3]);
      return { rows: [{ restaurant_total: restaurants.length, restaurant_active: restaurants.filter(({ removedAt }) => removedAt === null).length, menu_item_total: menus.length, menu_item_active: menus.filter(({ removedAt }) => removedAt === null).length, wrong_parent_total: wrongParentRows.length, wrong_parent_active: wrongParentRows.filter(({ removedAt }) => removedAt === null).length }] };
    }
    const target = sql.includes("favorite_restaurants")
      ? { kind: "restaurant", restaurantId: parameters[1] }
      : { kind: "menu_item", restaurantId: parameters[1], menuItemId: parameters[2] };
    const rows = relevant.filter((row) => targetsEqual(row.target, target));
    return { rows: [{ total: rows.length, active: rows.filter(({ removedAt }) => removedAt === null).length }] };
  }
  async transaction(statements) {
    this.cleanupCalls += 1;
    const actorIds = statements[0].parameters[0];
    const menuRestaurantId = statements[0].parameters[1];
    const menuItemId = statements[0].parameters[2];
    const wrongParentRestaurantId = statements[1].parameters[1];
    const restaurantId = statements[2].parameters[1];
    this.store.rows = this.store.rows.filter((row) => !actorIds.includes(row.actorId) || (row.target.kind === "restaurant"
      ? row.target.restaurantId !== restaurantId
      : ![menuRestaurantId, wrongParentRestaurantId].includes(row.target.restaurantId) || row.target.menuItemId !== menuItemId));
  }
  async close() { this.closed = true; }
}

function createDryActors(favorite, store) {
  return ["ACTOR_1", "ACTOR_2"].map((label, index) => {
    const actorId = `fake-actor-${index + 1}`;
    const favoriteClient = new FakeFavoriteClient(actorId, store);
    const authPort = fakeAuthPort(actorId);
    const runtime = favorite.createConsumerFavoriteRuntime({ authPort, favoriteClient, flags: { readSource: "supabase", writeSource: "supabase", issues: [] } });
    return { label, credential: { email: "redacted", password: "redacted" }, authPort, favoriteClient, runtime, storage: createMemoryStorage(), userId: null, signedIn: false };
  });
}

function dryScope() {
  return { actorUserIds: [], restaurantId: "restaurant-controlled", menuRestaurantId: "menu-restaurant", menuItemId: "menu-controlled", wrongParentRestaurantId: "wrong-parent" };
}

async function runDryRun() {
  const { favorite } = compileRuntime();
  for (const [gateName, env, capability] of [
    ["wrong project", completeDryGateEnv({ TASTKIND_CONSUMER_PHASE2X_DB_PROJECT_REF: "wrong" }), true],
    ["missing migration evidence", completeDryGateEnv({ TASTKIND_CONSUMER_PHASE2X_DB_REMOTE_MIGRATION_COUNT: "" }), true],
    ["missing cleanup capability", completeDryGateEnv(), false]
  ]) {
    let rejected = false;
    try {
      const result = validateLiveGates(env, capability);
      rejected = !result.ok;
    } catch { rejected = true; }
    assert(rejected, `${gateName} gate rejects before writes`);
  }

  const successStore = new FakeStore();
  const successOperator = new DevelopmentOperator(new FakeOperator(successStore));
  const successEvidence = await executeControlledSmoke({ actors: createDryActors(favorite, successStore), operator: successOperator, scope: dryScope() });
  assert(successEvidence.succeeded && successEvidence.aggregateRestored && successEvidence.sessionsCleared, "dry-run success path always performs exact cleanup");

  const failureStore = new FakeStore();
  const failureOperatorRaw = new FakeOperator(failureStore);
  let injectedEvidence = null;
  try {
    await executeControlledSmoke({ actors: createDryActors(favorite, failureStore), operator: new DevelopmentOperator(failureOperatorRaw), scope: dryScope(), injectFailure: true });
  } catch (error) {
    injectedEvidence = error.cleanupEvidence;
  }
  assert(injectedEvidence?.attempted && injectedEvidence.succeeded && injectedEvidence.aggregateRestored && injectedEvidence.sessionsCleared, "dry-run injected failure still performs exact finally cleanup");
  assert(failureOperatorRaw.cleanupCalls === 1 && failureStore.rows.length === 0, "dry-run injected failure leaves no persistent rows");

  report("passed", {
    mode: "local-dry-run",
    checks,
    canonicalStatuses,
    cleanupVerified: true,
    persistentTestData: false,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    migrationExecutedByRunner: false
  });
}

function completeDryGateEnv(overrides = {}) {
  return {
    TASTKIND_CONSUMER_PHASE2X_DB_PROJECT_REF: expectedProjectRef,
    TASTKIND_CONSUMER_PHASE2X_DB_PRODUCTION: "false",
    TASTKIND_CONSUMER_PHASE2X_DB_LOCAL_MIGRATION_COUNT: "36",
    TASTKIND_CONSUMER_PHASE2X_DB_REMOTE_MIGRATION_COUNT: "36",
    TASTKIND_CONSUMER_PHASE2X_DB_LATEST_REMOTE_MIGRATION: expectedMigration,
    TASTKIND_CONSUMER_PHASE2X_DB_MIGRATION_SHA: expectedMigrationSha,
    TASTKIND_CONSUMER_PHASE2X_DB_RPC_ACL_EVIDENCE_VERIFIED: "true",
    TASTKIND_CONSUMER_PHASE2X_DB_MENU_ID_UNIQUENESS_VERIFIED: "true",
    TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_READY: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: `https://${expectedProjectRef}.supabase.co`,
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: "redacted-public-key",
    TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_1_EMAIL: "redacted-1",
    TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_1_PASSWORD: "redacted",
    TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_2_EMAIL: "redacted-2",
    TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_2_PASSWORD: "redacted",
    TASTKIND_CONSUMER_PHASE2X_DB_RESTAURANT_ID: "redacted",
    TASTKIND_CONSUMER_PHASE2X_DB_MENU_RESTAURANT_ID: "redacted",
    TASTKIND_CONSUMER_PHASE2X_DB_MENU_ITEM_ID: "redacted",
    TASTKIND_CONSUMER_PHASE2X_DB_WRONG_PARENT_RESTAURANT_ID: "redacted",
    ...overrides
  };
}

async function runLive() {
  const env = buildLiveEnv();
  const gate = validateLiveGates(env, Boolean(env[operatorModuleKey]));
  if (!gate.ok) {
    report("blocked", { reason: "Development environment is incomplete.", missingKeys: gate.missing, checks, networkUsed: false, databaseUsed: false, cleanupExecuted: false, persistentTestData: false });
    process.exitCode = 2;
    return;
  }
  const operator = await loadDevelopmentOperator(env);
  if (!operator) throw new Error("Cleanup operator capability was not confirmed.");
  let executionOwnsOperator = false;
  try {
    await operator.verifyReady();
    pass("all Development identity migration ACL catalog and cleanup gates accepted");
    const { favorite, authFactories, authFlags } = compileRuntime();
    const parsedAuthFlags = authFlags.getConsumerRuntimeFlags({
      EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
      EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-disabled",
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
    });
    if (parsedAuthFlags.issues.length) throw new Error("Consumer Auth flag composition failed.");
    const requireFromMobile = createRequire(path.join(root, "apps", "mobile", "package.json"));
    const { createClient, processLock } = requireFromMobile("@supabase/supabase-js");
    const dependencies = { favorite, authFactories, authFlags: parsedAuthFlags, supabaseUrl: gate.values.supabaseUrl, publishableKey: gate.values.publishableKey, createClient, processLock };
    const actors = [
      createLiveActor("ACTOR_1", { email: gate.values.actorOneEmail, password: gate.values.actorOnePassword }, dependencies),
      createLiveActor("ACTOR_2", { email: gate.values.actorTwoEmail, password: gate.values.actorTwoPassword }, dependencies)
    ];
    const scope = { actorUserIds: [], restaurantId: gate.values.restaurantId, menuRestaurantId: gate.values.menuRestaurantId, menuItemId: gate.values.menuItemId, wrongParentRestaurantId: gate.values.wrongParentRestaurantId };
    executionOwnsOperator = true;
    const cleanupEvidence = await executeControlledSmoke({ actors, operator, scope });
    report("passed", {
      mode: "credential-backed-development-write",
      checks,
      canonicalStatuses,
      actorCount: 2,
      cleanupVerified: cleanupEvidence.succeeded,
      sessionsCleared: cleanupEvidence.sessionsCleared,
      aggregateRestored: cleanupEvidence.aggregateRestored,
      persistentTestData: false,
      networkUsed: true,
      databaseUsed: true,
      migrationExecutedByRunner: false
    });
  } finally {
    if (!executionOwnsOperator) await operator.close();
  }
}

try {
  if (process.argv.includes("--dry-run")) await runDryRun();
  else if (process.env[liveOptInKey] !== "true") skip();
  else await runLive();
} catch (error) {
  report("failed", {
    reason: process.argv.includes("--dry-run") ? "Local dry-run failed." : "Controlled Development write smoke failed.",
    checks,
    canonicalStatuses,
    cleanupVerified: error?.cleanupEvidence?.succeeded === true,
    sessionsCleared: error?.cleanupEvidence?.sessionsCleared === true,
    aggregateRestored: error?.cleanupEvidence?.aggregateRestored === true,
    persistentTestData: error?.cleanupEvidence?.controlledRowsAfter === 0 ? false : "UNVERIFIED"
  });
  process.exitCode = 1;
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
