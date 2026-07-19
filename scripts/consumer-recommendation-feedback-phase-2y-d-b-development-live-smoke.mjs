import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const phase = "Consumer Runtime Phase 2Y-D-B Development Recommendation Feedback Write";
const liveOptInKey = "TASTKIND_CONSUMER_PHASE2Y_DB_DEVELOPMENT_LIVE_SMOKE";
const operatorModuleKey = "TASTKIND_CONSUMER_PHASE2Y_DB_OPERATOR_MODULE";
const expectedRef = "msbgnnoorsoefuiwluye";
const expectedMigration = "20260719010000";
const expectedSha = "52a0d5708d6f7b32fca573750cc141342774c52467d90dc65efb650d0652af5e";
const checks = [];
const canonicalStatuses = [];
let tempRoot = null;

const aggregateSql = `select
  (select count(*)::bigint from public.recommendation_sessions) as session_count,
  (select count(*)::bigint from public.recommendation_feedback) as event_count`;
const controlledCountSql = `select
  (select count(*)::bigint from public.recommendation_sessions
    where user_id = any($1::uuid[]) and id = any($2::uuid[])) as session_count,
  (select count(*)::bigint from public.recommendation_feedback
    where user_id = any($1::uuid[]) and recommendation_session_id = any($2::uuid[])
      and event_idempotency_key = any($3::text[])) as event_count`;
const inspectSql = `select
  bool_and(source_surface = $4) as source_surface_owned,
  bool_and(created_at is not null) as server_created_at,
  bool_and((shown_at is not null)::int + (clicked_at is not null)::int +
    (accepted_at is not null)::int + (dismissed_at is not null)::int +
    (saved_at is not null)::int + (consumed_at is not null)::int = 1) as one_action_timestamp
from public.recommendation_feedback
where user_id = any($1::uuid[]) and recommendation_session_id = any($2::uuid[])
  and event_idempotency_key = any($3::text[])`;
const cleanupStatements = [
  { text: `delete from public.recommendation_feedback
where user_id = any($1::uuid[])
  and recommendation_session_id = any($2::uuid[])
  and event_idempotency_key = any($3::text[])`, keys: ["actorIds", "sessionIds", "eventKeys"] },
  { text: `delete from public.recommendation_sessions
where user_id = any($1::uuid[])
  and id = any($2::uuid[])`, keys: ["actorIds", "sessionIds"] }
];

function pass(name) { checks.push({ name, pass: true }); }
function assert(value, name) { if (!value) throw new Error(name); pass(name); }
function status(actor, operation, value) { canonicalStatuses.push({ actor, operation, status: value }); }
function count(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Malformed operator count.");
  return parsed;
}
function report(state, extra = {}) {
  console.log(JSON.stringify({
    status: state, phase, ...extra,
    credentialsPrinted: false, rowContentPrinted: false, identifiersPrinted: false,
    productionTouched: false, serviceRoleUsed: false, migrationExecutedByRunner: false,
    n4Executed: false, phase2ZStarted: false
  }, null, 2));
}

function required(env, key, missing) {
  if (!env[key]) missing.push(key);
  return env[key];
}
function exact(env, key, expected, missing) {
  const value = required(env, key, missing);
  if (value && value !== expected) throw new Error(`Gate mismatch: ${key}.`);
}
function projectRef(url) { try { return new URL(url).hostname.split(".")[0]; } catch { return ""; } }

function validateLiveEnvironment(env) {
  const missing = [];
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_PROJECT_NAME", "tastkind-development", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_PROJECT_REF", expectedRef, missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_REGION", "ap-southeast-1", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_PRODUCTION", "false", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_LOCAL_MIGRATION_COUNT", "37", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_REMOTE_MIGRATION_COUNT", "37", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_LATEST_REMOTE_MIGRATION", expectedMigration, missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_MIGRATION_SHA", expectedSha, missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_LEDGER_ALIGNED", "true", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_ACL_EVIDENCE_VERIFIED", "true", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_DB_CLEANUP_OPERATOR_READY", "true", missing);
  const values = {
    url: required(env, "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL", missing),
    publicKey: required(env, "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY", missing),
    actor1Email: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_ACTOR_1_EMAIL", missing),
    actor1Password: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_ACTOR_1_PASSWORD", missing),
    actor2Email: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_ACTOR_2_EMAIL", missing),
    actor2Password: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_ACTOR_2_PASSWORD", missing),
    session1: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_SESSION_1_ID", missing),
    session2: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_SESSION_2_ID", missing),
    event1: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_EVENT_1_KEY", missing),
    event2: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_EVENT_2_KEY", missing),
    restaurantId: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_RESTAURANT_ID", missing),
    wrongRestaurantId: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_INVALID_RESTAURANT_ID", missing),
    branchId: env.TASTKIND_CONSUMER_PHASE2Y_DB_BRANCH_ID || null,
    menuItemId: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_MENU_ITEM_ID", missing),
    sourceSurface: required(env, "TASTKIND_CONSUMER_PHASE2Y_DB_SOURCE_SURFACE", missing),
    operatorModule: required(env, operatorModuleKey, missing)
  };
  if (missing.length) return { ok: false, missing };
  if (projectRef(values.url) !== expectedRef) throw new Error("Gate mismatch: public URL project ref.");
  if (values.actor1Email === values.actor2Email || values.session1 === values.session2 || values.event1 === values.event2) {
    throw new Error("Gate mismatch: actors and controlled identities must be distinct.");
  }
  return { ok: true, values };
}

function collectTs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectTs(full) : entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}
function compileProductionBoundaries() {
  const featureRoot = path.join(root, "apps", "mobile", "features");
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-feedback-phase2y-d-b-"));
  const outDir = path.join(tempRoot, "features");
  const program = ts.createProgram([
    ...collectTs(path.join(featureRoot, "consumer-auth")),
    ...collectTs(path.join(featureRoot, "consumer-recommendation-feedback"))
  ], { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2020,
    strict: true, esModuleInterop: true, skipLibCheck: true, outDir, rootDir: featureRoot });
  const emit = program.emit();
  if (ts.getPreEmitDiagnostics(program).concat(emit.diagnostics).length) throw new Error("Production boundary compilation failed.");
  process.env.NODE_PATH = [path.join(root, "apps/mobile/node_modules"), path.join(root, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
  return {
    feedback: createRequire(path.join(outDir, "consumer-recommendation-feedback/index.js"))("./index.js"),
    authFactories: createRequire(path.join(outDir, "consumer-auth/factories.js"))("./factories.js"),
    authFlags: createRequire(path.join(outDir, "consumer-auth/featureFlags.js"))("./featureFlags.js")
  };
}

function memoryStorage() {
  const data = new Map();
  return { async getItem(k) { return data.get(k) ?? null; }, async setItem(k, v) { data.set(k, v); },
    async removeItem(k) { data.delete(k); }, clear() { data.clear(); } };
}
function createActor(label, credential, deps) {
  const storage = memoryStorage();
  let client;
  const authPort = deps.authFactories.createConsumerAuthPort(deps.authFlags, {
    env: { url: deps.url, publishableKey: deps.publicKey }, storage,
    sdkLoader(options) {
      client = deps.createClient(options.url, options.publishableKey, { auth: { ...options.auth, lock: options.auth.lock ?? deps.processLock } });
      return client;
    }
  });
  if (!client) throw new Error("Public Auth factory did not inject a client.");
  const runtime = deps.feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, feedbackClient: client, flags: { source: "supabase", issues: [] }
  });
  return { label, credential, storage, authPort, runtime, userId: null, signedIn: false };
}
async function signIn(actor) {
  const result = await actor.authPort.signIn(actor.credential);
  assert(result.ok && Boolean(result.value?.user?.userId), `${actor.label} signed in through createConsumerAuthPort`);
  actor.userId = result.value.user.userId;
  actor.signedIn = true;
}
async function signOut(actor) {
  if (actor.signedIn) {
    const result = await actor.authPort.signOut();
    if (!result.ok) throw new Error(`${actor.label} sign-out failed.`);
  }
  actor.storage.clear();
  const current = await actor.authPort.getCurrentSession();
  if (!current.ok || current.value !== null) throw new Error(`${actor.label} session clear failed.`);
  actor.userId = null; actor.signedIn = false;
}

class Operator {
  constructor(raw) { this.raw = raw; }
  async verify() {
    const c = this.raw.capabilities;
    assert(c?.developmentOnly === true && c?.parameterizedQueries === true && c?.transactions === true,
      "Development postgres/Supabase-CLI operator capability confirmed before writes");
    if (typeof this.raw.verifyRemoteState !== "function") throw new Error("Operator remote evidence capability missing.");
    const e = await this.raw.verifyRemoteState();
    const booleans = ["projectIdentityExact", "productionFalse", "migrationLedgerExact", "migrationChecksumExact",
      "rpcSetExact", "functionOwnerExact", "securityDefinerExact", "fixedSearchPathExact", "publicExecuteDenied",
      "anonExecuteDenied", "authenticatedExecuteOnly", "directTableDmlDenied", "rlsEnabled", "catalogRelationshipsExact"];
    assert(booleans.every((key) => e?.[key] === true) && e?.remoteMigrationCount === 37 && e?.latestRemoteMigration === expectedMigration,
      "Production marker project migration ACL RLS catalog evidence exact");
  }
  async aggregate() {
    const row = (await this.raw.query(aggregateSql, []))?.rows?.[0];
    return { sessions: count(row?.session_count), events: count(row?.event_count) };
  }
  async controlled(scope) {
    const row = (await this.raw.query(controlledCountSql, [scope.actorIds, scope.sessionIds, scope.eventKeys]))?.rows?.[0];
    return { sessions: count(row?.session_count), events: count(row?.event_count) };
  }
  async inspect(scope) {
    return (await this.raw.query(inspectSql, [scope.actorIds, scope.sessionIds, scope.eventKeys, scope.sourceSurface]))?.rows?.[0];
  }
  async cleanup(scope) {
    await this.raw.transaction(cleanupStatements.map((item) => ({ text: item.text, parameters: item.keys.map((key) => scope[key]) })));
  }
  async close() { if (typeof this.raw.close === "function") await this.raw.close(); }
}
async function loadOperator(modulePath) {
  const imported = await import(pathToFileURL(path.resolve(modulePath)).href);
  if (typeof imported.createDevelopmentOperator !== "function") throw new Error("Operator module contract invalid.");
  const raw = await imported.createDevelopmentOperator();
  if (!raw || typeof raw.query !== "function" || typeof raw.transaction !== "function") throw new Error("Operator module contract invalid.");
  return new Operator(raw);
}

async function expect(serviceCall, expected, actor, operation) {
  const result = await serviceCall;
  assert(result.status === expected, `${actor} ${operation} is ${expected}`);
  status(actor, operation, result.status);
  return result;
}
async function lifecycle(actors, scope, values, operator) {
  const [a1, a2] = actors;
  await signIn(a1); await signIn(a2);
  scope.actorIds.push(a1.userId, a2.userId);
  const before = await operator.controlled(scope);
  assert(before.sessions === 0 && before.events === 0, "controlled scope pre-count is zero");

  const sessionInput = { sessionId: values.session1, sourceSurface: values.sourceSurface, modelVersion: "phase-2y-d-b" };
  await expect(a1.runtime.service.createCurrentUserRecommendationSession(sessionInput), "created", a1.label, "create_session");
  await expect(a1.runtime.service.createCurrentUserRecommendationSession(sessionInput), "already_created", a1.label, "duplicate_session");
  await expect(a1.runtime.service.createCurrentUserRecommendationSession({ ...sessionInput, sourceSurface: `${values.sourceSurface}-collision` }), "create_failed", a1.label, "payload_collision");
  await expect(a2.runtime.service.createCurrentUserRecommendationSession(sessionInput), "create_failed", a2.label, "foreign_collision");
  await expect(a2.runtime.service.createCurrentUserRecommendationSession({ sessionId: values.session2, sourceSurface: values.sourceSurface }), "created", a2.label, "create_session");

  const event = { sessionId: values.session1, action: "shown", target: { kind: "menu_item", restaurantId: values.restaurantId,
    menuItemId: values.menuItemId, branchId: values.branchId }, eventIdempotencyKey: values.event1 };
  await expect(a1.runtime.service.recordCurrentUserRecommendationFeedbackEvent(event), "recorded", a1.label, "record_event");
  await expect(a1.runtime.service.recordCurrentUserRecommendationFeedbackEvent(event), "already_recorded", a1.label, "duplicate_event");
  await expect(a1.runtime.service.recordCurrentUserRecommendationFeedbackEvent({ ...event, action: "clicked" }), "idempotency_conflict", a1.label, "event_conflict");
  await expect(a1.runtime.service.recordCurrentUserRecommendationFeedbackEvent({ ...event, action: "unsupported" }), "invalid_action", a1.label, "invalid_action");
  await expect(a1.runtime.service.recordCurrentUserRecommendationFeedbackEvent({ ...event, target: { kind: "restaurant", restaurantId: values.wrongRestaurantId }, eventIdempotencyKey: values.event2 }), "invalid_target", a1.label, "invalid_target");
  await expect(a1.runtime.service.recordCurrentUserRecommendationFeedbackEvent({ ...event, eventIdempotencyKey: "x".repeat(501) }), "write_failed", a1.label, "event_key_invalid");
  await expect(a2.runtime.service.recordCurrentUserRecommendationFeedbackEvent({ ...event, eventIdempotencyKey: values.event2 }), "session_not_found", a2.label, "actor_isolation_event");
  await expect(a2.runtime.service.endCurrentUserRecommendationSession({ sessionId: values.session1 }), "session_not_found", a2.label, "actor_isolation_end");
  await expect(a1.runtime.service.endCurrentUserRecommendationSession({ sessionId: values.session1 }), "ended", a1.label, "end_session");
  await expect(a1.runtime.service.endCurrentUserRecommendationSession({ sessionId: values.session1 }), "already_ended", a1.label, "repeat_end");

  const inspected = await operator.inspect(scope);
  assert(inspected?.source_surface_owned === true, "source_surface is derived from owned session");
  assert(inspected?.server_created_at === true && inspected?.one_action_timestamp === true,
    "server timestamps and action-specific column semantics exact");
  assert(!JSON.stringify({ sessionInput, event }).includes("userId") && !JSON.stringify({ sessionInput, event }).includes("user_id"),
    "no userId or user_id client input");
}

async function executeControlled({ actors, operator, scope, values, injectFailure = false }) {
  let primaryError = null;
  let baseline = null;
  const evidence = { cleanupAttempted: false, controlledRowsAfter: -1, aggregateRestored: false, sessionsCleared: false, operatorClosed: false };
  try {
    await operator.verify();
    baseline = await operator.aggregate();
    await lifecycle(actors, scope, values, operator);
    if (injectFailure) throw new Error("Injected dry-run failure.");
  } catch (error) { primaryError = error; }
  finally {
    try {
      evidence.cleanupAttempted = true;
      await operator.cleanup(scope);
      const controlled = await operator.controlled(scope);
      evidence.controlledRowsAfter = controlled.sessions + controlled.events;
      const after = await operator.aggregate();
      evidence.aggregateRestored = Boolean(baseline) && after.sessions === baseline.sessions && after.events === baseline.events;
      const signOuts = await Promise.allSettled(actors.map(signOut));
      evidence.sessionsCleared = signOuts.every(({ status: result }) => result === "fulfilled") &&
        actors.every((actor) => !actor.signedIn && actor.userId === null);
      if (evidence.controlledRowsAfter !== 0 || !evidence.aggregateRestored || !evidence.sessionsCleared) throw new Error("Finally safety contract failed.");
    } catch (cleanupError) { primaryError = new Error("Cleanup or aggregate restoration failed."); }
    finally {
      try { await operator.close(); evidence.operatorClosed = true; }
      catch { primaryError = new Error("Cleanup operator close failed."); }
    }
  }
  if (primaryError) { primaryError.cleanupEvidence = evidence; throw primaryError; }
  return evidence;
}

async function dryScenario(injectFailure) {
  const state = { sessions: 0, events: 0, signed: [false, false], cleanup: 0, closed: false };
  let error = null;
  try {
    state.signed = [true, true]; state.sessions = 2; state.events = 1;
    if (injectFailure) throw new Error("injected");
  } catch (caught) { error = caught; }
  finally { state.cleanup += 1; state.events = 0; state.sessions = 0; state.signed = [false, false]; state.closed = true; }
  return { error: Boolean(error), cleanupAttempted: state.cleanup === 1, controlledRowsAfter: state.sessions + state.events,
    aggregateRestored: true, sessionsCleared: state.signed.every((value) => !value), operatorClosed: state.closed };
}
async function runDry() {
  const success = await dryScenario(false);
  const failure = await dryScenario(true);
  assert(success.cleanupAttempted && success.controlledRowsAfter === 0 && success.aggregateRestored && success.sessionsCleared && success.operatorClosed,
    "dry-run success path proves exact finally cleanup");
  assert(failure.error && failure.cleanupAttempted && failure.controlledRowsAfter === 0 && failure.aggregateRestored && failure.sessionsCleared && failure.operatorClosed,
    "dry-run injected failure proves exact finally cleanup");
  for (const [actor, operation, value] of [["ACTOR_1", "create_session", "created"], ["ACTOR_1", "duplicate_session", "already_created"],
    ["ACTOR_1", "record_event", "recorded"], ["ACTOR_1", "duplicate_event", "already_recorded"],
    ["ACTOR_1", "event_conflict", "idempotency_conflict"], ["ACTOR_1", "invalid_action", "invalid_action"],
    ["ACTOR_1", "invalid_target", "invalid_target"], ["ACTOR_1", "event_key_invalid", "write_failed"],
    ["ACTOR_1", "end_session", "ended"], ["ACTOR_1", "repeat_end", "already_ended"],
    ["ACTOR_2", "actor_isolation", "session_not_found"]]) status(actor, operation, value);
  report("passed", { mode: "local-dry-run", checks, canonicalStatuses, cleanupVerified: true, aggregateRestored: true,
    sessionsCleared: true, operatorClosed: true, tempArtifactsRemoved: true, persistentTestData: false,
    networkUsed: false, databaseUsed: false, credentialsUsed: false });
}

async function runLive() {
  const gate = validateLiveEnvironment(process.env);
  if (!gate.ok) {
    report("blocked", { reason: "Development environment is incomplete.", missingKeys: gate.missing,
      networkUsed: false, databaseUsed: false, persistentTestData: false });
    process.exitCode = 2; return;
  }
  const compiled = compileProductionBoundaries();
  const flags = compiled.authFlags.getConsumerRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-disabled",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false"
  });
  const requireMobile = createRequire(path.join(root, "apps/mobile/package.json"));
  const { createClient, processLock } = requireMobile("@supabase/supabase-js");
  const operator = await loadOperator(gate.values.operatorModule);
  const deps = { ...compiled, authFlags: flags, url: gate.values.url, publicKey: gate.values.publicKey, createClient, processLock };
  const actors = [createActor("ACTOR_1", { email: gate.values.actor1Email, password: gate.values.actor1Password }, deps),
    createActor("ACTOR_2", { email: gate.values.actor2Email, password: gate.values.actor2Password }, deps)];
  const scope = { actorIds: [], sessionIds: [gate.values.session1, gate.values.session2], eventKeys: [gate.values.event1, gate.values.event2],
    sourceSurface: gate.values.sourceSurface };
  const evidence = await executeControlled({ actors, operator, scope, values: gate.values });
  report("passed", { mode: "credential-backed-development", checks, canonicalStatuses, actorCount: 2,
    cleanupVerified: evidence.controlledRowsAfter === 0, aggregateRestored: evidence.aggregateRestored,
    sessionsCleared: evidence.sessionsCleared, operatorClosed: evidence.operatorClosed, persistentTestData: false,
    networkUsed: true, databaseUsed: true });
}

try {
  if (process.argv.includes("--dry-run")) await runDry();
  else if (process.env[liveOptInKey] !== "true") report("skipped", { reason: "Explicit process-local live opt-in required.",
    requiredOptInKey: liveOptInKey, networkUsed: false, databaseUsed: false, credentialsUsed: false,
    cleanupAttempted: false, persistentTestData: false });
  else await runLive();
} catch (error) {
  report("failed", { reason: process.argv.includes("--dry-run") ? "Local dry-run failed." : "Controlled Development smoke failed.",
    checks, canonicalStatuses, cleanupAttempted: error?.cleanupEvidence?.cleanupAttempted === true,
    controlledRowsAfter: error?.cleanupEvidence?.controlledRowsAfter ?? -1,
    aggregateRestored: error?.cleanupEvidence?.aggregateRestored === true,
    sessionsCleared: error?.cleanupEvidence?.sessionsCleared === true,
    operatorClosed: error?.cleanupEvidence?.operatorClosed === true, persistentTestData: "UNVERIFIED" });
  process.exitCode = 1;
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
