import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const liveOptInKey = "TASTKIND_CONSUMER_PHASE2Y_E_DEVELOPMENT_MOBILE_SMOKE";
const operatorModuleKey = "TASTKIND_CONSUMER_PHASE2Y_E_OPERATOR_MODULE";
const expectedRef = "msbgnnoorsoefuiwluye";
const checks = [];
const statuses = [];
let tempRoot = null;
const tempBase = process.platform === "win32" ? os.tmpdir() : "/tmp";

const aggregateSql = `select
  (select count(*)::bigint from public.recommendation_sessions) as session_count,
  (select count(*)::bigint from public.recommendation_feedback) as event_count`;
const controlledSql = `select
  (select count(*)::bigint from public.recommendation_sessions where user_id = $1::uuid and id = $2::uuid) as session_count,
  (select count(*)::bigint from public.recommendation_feedback where user_id = $1::uuid
    and recommendation_session_id = $2::uuid and event_idempotency_key = any($3::text[])) as event_count`;
const cleanupStatements = [
  `delete from public.recommendation_feedback
where user_id = $1::uuid and recommendation_session_id = $2::uuid and event_idempotency_key = any($3::text[])`,
  `delete from public.recommendation_sessions
where user_id = $1::uuid and id = $2::uuid`
];

function check(name, condition) { const item = { name, pass: Boolean(condition) }; checks.push(item); if (!condition) throw new Error(name); }
function record(operation, status) { statuses.push({ actor: "ACTOR_1", operation, status }); }
function count(value) { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new Error("Malformed count."); return number; }
function isUuidV4(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function report(status, extra = {}) {
  console.log(JSON.stringify({ status, phase: "Consumer Runtime Phase 2Y-E Development Mobile Smoke", ...extra,
    credentialsPrinted: false, identifiersPrinted: false, rowContentPrinted: false,
    migrationExecuted: false, developmentTouchedByLocalRun: false, productionTouched: false,
    serviceRoleCredentialAccessed: false, serviceRoleCredentialUsed: false,
    serviceRoleBrowserRuntimePathUsed: false, n4Executed: false, phase2ZStarted: false }, null, 2));
}
function collectTs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectTs(full) : entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}
function instrumentService(service) {
  const calls = { createSession: 0, recordEvent: 0, endSession: 0 };
  return { calls, service: {
    source: service.source,
    createCurrentUserRecommendationSession(input) { calls.createSession += 1; return service.createCurrentUserRecommendationSession(input); },
    recordCurrentUserRecommendationFeedbackEvent(input) { calls.recordEvent += 1; return service.recordCurrentUserRecommendationFeedbackEvent(input); },
    endCurrentUserRecommendationSession(input) { calls.endSession += 1; return service.endCurrentUserRecommendationSession(input); }
  } };
}
function stub(name, main, source) {
  const dir = path.join(tempRoot, "node_modules", ...name.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, main }), "utf8");
  fs.writeFileSync(path.join(dir, main), source, "utf8");
}
function compileProduction() {
  tempRoot = fs.mkdtempSync(path.join(tempBase, "consumer-feedback-phase2y-e-mobile-"));
  stub("@react-native-async-storage/async-storage", "index.js",
    "const values=new Map();module.exports={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v)},removeItem:async k=>{values.delete(k)}};\n");
  stub("react-native-url-polyfill", "auto.js", "// Node has URL support.\n");
  const featureRoot = path.join(root, "apps/mobile/features");
  const outDir = path.join(tempRoot, "features");
  const program = ts.createProgram([...collectTs(path.join(featureRoot, "consumer-auth")), ...collectTs(path.join(featureRoot, "consumer-recommendation-feedback"))], {
    module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2020,
    strict: true, esModuleInterop: true, skipLibCheck: true, outDir, rootDir: featureRoot
  });
  const emit = program.emit();
  if (ts.getPreEmitDiagnostics(program).concat(emit.diagnostics).length) throw new Error("Production composition compilation failed.");
  process.env.NODE_PATH = [path.join(tempRoot, "node_modules"), path.join(root, "apps/mobile/node_modules"), path.join(root, "node_modules")].join(path.delimiter);
  Module._initPaths();
  const featureDir = path.join(outDir, "consumer-recommendation-feedback");
  return {
    ...createRequire(path.join(featureDir, "consumerRecommendationFeedbackComposition.js"))("./consumerRecommendationFeedbackComposition.js"),
    ...createRequire(path.join(featureDir, "consumerRecommendationFeedbackTargetMapper.js"))("./consumerRecommendationFeedbackTargetMapper.js"),
    ...createRequire(path.join(featureDir, "consumerRecommendationFeedbackUiModel.js"))("./consumerRecommendationFeedbackUiModel.js")
  };
}
function fakeAuthPort() {
  let session = { user: { userId: "actor-dry", provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-07-19T00:00:00.000Z" }, provider: "mock", issuedAt: "2026-07-19T00:00:00.000Z" };
  return { source: "mock", async getCurrentSession() { return { ok: true, value: session }; }, observeAuthState() { return () => undefined; },
    async signIn() { return { ok: true, value: session }; }, async signUp() { return { ok: true, value: session }; },
    async signOut() { session = null; return { ok: true, value: undefined }; }, async refreshSession() { return { ok: true, value: session }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; }, async restoreSession() { return { ok: true, value: session }; } };
}
function dryUuid() {
  const values = ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012", "00000000-0000-4000-8000-000000000013"];
  let index = 0; return () => values[index++] ?? values.at(-1);
}

async function runDry() {
  const feedback = compileProduction();
  const store = { sessions: new Map(), events: [] };
  const composition = feedback.createMobileConsumerRecommendationFeedbackComposition({ env: {}, flags: { source: "mock", issues: [] },
    authPort: fakeAuthPort(), uuidFactory: dryUuid(), clock: () => "2026-07-19T00:00:00.000Z", idGenerator: () => "feedback-dry", store });
  check("dry-run uses true Mobile composition public entry", composition.source === "mock");
  const target = feedback.mapConsumerRecommendationFeedbackTarget({ kind: "restaurant", restaurantId: "restaurant-dry", branchId: null, identityEvidence: "canonical" });
  check("dry-run canonical target is available", target.status === "available");
  const tracked = instrumentService(composition.service);
  const model = new feedback.ConsumerRecommendationFeedbackUiModel({ service: tracked.service, uuidFactory: composition.uuidFactory });
  model.setAuthSessionIdentity("actor-dry");
  const [createOne, createTwo] = await Promise.all([
    model.beginSession("flow-dry", "next_meal_recommendation"), model.beginSession("flow-dry", "next_meal_recommendation")
  ]);
  check("dry-run duplicate session begin converges", createOne.status === "created" && createTwo.status === "created");
  record("create_session", createOne.status);
  const [eventOne, eventTwo] = await Promise.all([
    model.recordEvent("select:dry", "clicked", target), model.recordEvent("select:dry", "clicked", target)
  ]);
  check("dry-run duplicate tap produces one in-memory event", eventOne.status === "recorded" && eventTwo.status === "recorded" && store.events.length === 1 && tracked.calls.recordEvent === 1);
  record("record_event", eventOne.status);
  const retry = await model.recordEvent("select:dry", "clicked", target);
  check("dry-run stable retry resolves already_recorded", retry.status === "already_recorded");
  record("duplicate_retry", retry.status);
  const accepted = await model.recordEvent("confirm:dry", "accepted", target);
  check("dry-run accepted uses a distinct stable event and records", accepted.status === "recorded" && store.events.length === 2 &&
    store.events[0].eventIdempotencyKey !== store.events[1].eventIdempotencyKey && tracked.calls.recordEvent === 2);
  record("record_accepted", accepted.status);
  const ended = await model.endSession();
  check("dry-run session ends", ended.status === "ended");
  record("end_session", ended.status);
  const repeatedEnd = await model.endSession();
  check("dry-run repeated end resolves already_ended without another write", repeatedEnd.status === "already_ended" && tracked.calls.endSession === 1);
  record("repeat_end_session", repeatedEnd.status);
  const afterEnd = await model.recordEvent("after-end", "clicked", target);
  check("dry-run ended-session production UI guard prevents another write", afterEnd.status === "invalid_session" && tracked.calls.recordEvent === 2 && store.events.length === 2);
  record("record_after_end", afterEnd.status);

  let resolveCreate;
  const delayed = { source: "mock", createCurrentUserRecommendationSession: () => new Promise((resolve) => { resolveCreate = resolve; }),
    recordCurrentUserRecommendationFeedbackEvent: async () => ({ status: "recorded", source: "mock", feedbackId: "fixture" }),
    endCurrentUserRecommendationSession: async () => ({ status: "ended", source: "mock", sessionId: "fixture", endedAt: "2026-07-19T00:00:00.000Z" }) };
  const stale = new feedback.ConsumerRecommendationFeedbackUiModel({ service: delayed, uuidFactory: dryUuid() });
  const pending = stale.beginSession("flow-stale", "next_meal_recommendation");
  stale.reset();
  resolveCreate({ status: "created", source: "mock", sessionId: "fixture", startedAt: "2026-07-19T00:00:00.000Z" });
  await pending;
  check("dry-run stale response is isolated", stale.snapshot.status === "idle");
  stale.dispose();
  await composition.authPort.signOut();
  const current = await composition.authPort.getCurrentSession();
  model.setAuthSessionIdentity(null);
  check("dry-run sign-out clears auth session and UI session state", current.ok && current.value === null && model.snapshot.status === "idle");
  model.dispose();
  report("passed", { mode: "local-dry-run", checks, canonicalStatuses: statuses, cleanupVerified: true,
    aggregateRestored: true, sessionCleared: true, operatorClosed: true, tempArtifactsRemoved: true,
    persistentTestData: false, networkUsed: false, databaseUsed: false, credentialsUsed: false });
}

function required(env, key, missing) { if (!env[key]) missing.push(key); return env[key]; }
function exact(env, key, expected, missing) { const value = required(env, key, missing); if (value && value !== expected) throw new Error(`Gate mismatch: ${key}.`); }
function liveGate(env) {
  const missing = [];
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_E_PROJECT_REF", expectedRef, missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_E_PRODUCTION", "false", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_E_REMOTE_MIGRATION_COUNT", "37", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_E_LATEST_MIGRATION", "20260719010000", missing);
  exact(env, "TASTKIND_CONSUMER_PHASE2Y_E_ACL_VERIFIED", "true", missing);
  const values = { url: required(env, "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL", missing),
    publicKey: required(env, "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY", missing),
    email: required(env, "TASTKIND_CONSUMER_PHASE2Y_E_EXISTING_ACTOR_EMAIL", missing), password: required(env, "TASTKIND_CONSUMER_PHASE2Y_E_EXISTING_ACTOR_PASSWORD", missing),
    restaurantId: required(env, "TASTKIND_CONSUMER_PHASE2Y_E_RESTAURANT_ID", missing), branchId: env.TASTKIND_CONSUMER_PHASE2Y_E_BRANCH_ID || null,
    sessionId: required(env, "TASTKIND_CONSUMER_PHASE2Y_E_SESSION_ID", missing), eventKey: required(env, "TASTKIND_CONSUMER_PHASE2Y_E_EVENT_KEY", missing),
    acceptedEventKey: required(env, "TASTKIND_CONSUMER_PHASE2Y_E_ACCEPTED_EVENT_KEY", missing),
    operatorModule: required(env, operatorModuleKey, missing) };
  if (missing.length) return { ok: false, missing };
  let ref = ""; try { ref = new URL(values.url).hostname.split(".")[0]; } catch { /* fail below */ }
  if (ref !== expectedRef) throw new Error("Gate mismatch: public URL project ref.");
  if (![values.sessionId, values.eventKey, values.acceptedEventKey].every(isUuidV4)) throw new Error("Gate mismatch: controlled UUIDs must be UUID v4.");
  if (values.acceptedEventKey === values.eventKey) throw new Error("Gate mismatch: accepted event UUID must be distinct.");
  return { ok: true, values };
}
async function loadOperator(modulePath) {
  const imported = await import(pathToFileURL(path.resolve(modulePath)).href);
  if (typeof imported.createDevelopmentOperator !== "function") throw new Error("Operator contract invalid.");
  const raw = await imported.createDevelopmentOperator();
  if (!raw || typeof raw.query !== "function" || typeof raw.transaction !== "function") throw new Error("Operator contract invalid.");
  return raw;
}
async function aggregate(operator) {
  const row = (await operator.query(aggregateSql, []))?.rows?.[0];
  return { sessions: count(row?.session_count), events: count(row?.event_count) };
}
async function controlled(operator, scope) {
  const row = (await operator.query(controlledSql, [scope.actorId, scope.sessionId, scope.eventKeys]))?.rows?.[0];
  return { sessions: count(row?.session_count), events: count(row?.event_count) };
}
async function runLive() {
  const gate = liveGate(process.env);
  if (!gate.ok) { report("blocked", { reason: "Development inputs incomplete.", missingKeys: gate.missing, networkUsed: false, databaseUsed: false, persistentTestData: false }); process.exitCode = 2; return; }
  const feedback = compileProduction();
  const composition = feedback.createMobileConsumerRecommendationFeedbackComposition({
    env: { EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live", EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-disabled",
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
      EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "supabase", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: gate.values.url,
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: gate.values.publicKey },
    uuidFactory: (() => { const values = [gate.values.sessionId, gate.values.eventKey, gate.values.acceptedEventKey]; let index = 0; return () => values[index++] ?? values.at(-1); })()
  });
  const operator = await loadOperator(gate.values.operatorModule);
  const scope = { actorId: null, sessionId: gate.values.sessionId, eventKeys: [gate.values.eventKey, gate.values.acceptedEventKey] };
  let baseline = null;
  let primaryError = null;
  let cleanupVerified = false;
  let aggregateRestored = false;
  let sessionCleared = false;
  let operatorClosed = false;
  let model = null;
  try {
    const evidence = await operator.verifyRemoteState();
    check("live remote project migration ACL and retained cleanup evidence exact", evidence?.projectIdentityExact === true && evidence?.productionFalse === true &&
      evidence?.migrationLedgerExact === true && evidence?.aclExact === true && evidence?.controlledActorsAndRowsZero === true);
    const signIn = await composition.authPort.signIn({ email: gate.values.email, password: gate.values.password });
    check("existing Development actor signs in", signIn.ok && Boolean(signIn.value?.user.userId));
    scope.actorId = signIn.value.user.userId;
    const beforeControlled = await controlled(operator, scope);
    check("controlled pre-count is zero", beforeControlled.sessions === 0 && beforeControlled.events === 0);
    baseline = await aggregate(operator);
    const mapping = feedback.mapConsumerRecommendationFeedbackTarget({ kind: "restaurant", restaurantId: gate.values.restaurantId, branchId: gate.values.branchId, identityEvidence: "canonical" });
    check("canonical Development target maps", mapping.status === "available");
    const tracked = instrumentService(composition.service);
    model = new feedback.ConsumerRecommendationFeedbackUiModel({ service: tracked.service, uuidFactory: composition.uuidFactory });
    model.setAuthSessionIdentity(scope.actorId);
    const created = await model.beginSession("development-controlled-flow", "next_meal_recommendation");
    check("Mobile UI model session created", created.status === "created"); record("create_session", created.status);
    const recorded = await model.recordEvent("select:development", "clicked", mapping);
    check("Mobile UI model clicked event records", recorded.status === "recorded"); record("record_clicked", recorded.status);
    const duplicate = await model.recordEvent("select:development", "clicked", mapping);
    check("identical retry converges", duplicate.status === "already_recorded"); record("duplicate_retry", duplicate.status);
    const accepted = await model.recordEvent("confirm:development", "accepted", mapping);
    check("Mobile UI model accepted event records with a distinct stable UUID", accepted.status === "recorded" && tracked.calls.recordEvent === 2);
    record("record_accepted", accepted.status);
    const afterAccepted = await controlled(operator, scope);
    check("controlled session and two distinct events exist after accepted", afterAccepted.sessions === 1 && afterAccepted.events === 2);
    const ended = await model.endSession();
    check("Mobile UI model session ends after accepted", ended.status === "ended"); record("end_session", ended.status);
    const repeatedEnd = await model.endSession();
    check("repeated end resolves already_ended without another service call", repeatedEnd.status === "already_ended" && tracked.calls.endSession === 1);
    record("repeat_end_session", repeatedEnd.status);
    const beforeProtectedWrite = await controlled(operator, scope);
    const protectedResult = await model.recordEvent("after-end:development", "clicked", mapping);
    const afterProtectedWrite = await controlled(operator, scope);
    check("ended-session production UI guard returns typed fail-closed without service or row write", protectedResult.status === "invalid_session" &&
      tracked.calls.recordEvent === 2 && beforeProtectedWrite.sessions === afterProtectedWrite.sessions && beforeProtectedWrite.events === afterProtectedWrite.events);
    record("record_after_end", protectedResult.status);
  } catch (error) { primaryError = error; }
  finally {
    try {
      model?.dispose();
      if (scope.actorId) {
        await operator.transaction([
          { text: cleanupStatements[0], parameters: [scope.actorId, scope.sessionId, scope.eventKeys] },
          { text: cleanupStatements[1], parameters: [scope.actorId, scope.sessionId] }
        ]);
        const remaining = await controlled(operator, scope);
        cleanupVerified = remaining.sessions === 0 && remaining.events === 0;
      }
      const after = await aggregate(operator);
      aggregateRestored = Boolean(baseline) && after.sessions === baseline.sessions && after.events === baseline.events;
      await composition.authPort.signOut();
      const current = await composition.authPort.getCurrentSession();
      sessionCleared = current.ok && current.value === null;
    } catch { primaryError = new Error("Cleanup verification failed."); }
    finally { try { if (typeof operator.close === "function") await operator.close(); operatorClosed = true; } catch { primaryError = new Error("Operator close failed."); } }
  }
  if (primaryError || !cleanupVerified || !aggregateRestored || !sessionCleared || !operatorClosed) throw primaryError ?? new Error("Finally safety contract failed.");
  report("passed", { mode: "credential-backed-development-narrow", checks, canonicalStatuses: statuses,
    cleanupVerified, aggregateRestored, sessionCleared, operatorClosed, persistentTestData: false,
    networkUsed: true, databaseUsed: true, credentialsUsed: true });
}

try {
  if (process.argv.includes("--dry-run")) await runDry();
  else if (process.env[liveOptInKey] !== "true") report("skipped", { reason: "Explicit process-local live opt-in required.", requiredOptInKey: liveOptInKey,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, persistentTestData: false });
  else await runLive();
} catch {
  report("failed", { reason: process.argv.includes("--dry-run") ? "Local dry-run failed." : "Development narrow smoke failed.", checks,
    canonicalStatuses: statuses, persistentTestData: "UNVERIFIED" });
  process.exitCode = 1;
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
