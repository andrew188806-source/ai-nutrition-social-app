#!/usr/bin/env node
// Phase 2Y-D-A Production-Backed Contract Smoke
// Compiles actual TypeScript production files to a temp directory.
// Provides only test fixtures (fake RPC client, injected auth, clock, store).
// Tests three RPC names, argument shapes, response mapping, and error classification.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const PHASE = "Consumer Runtime Phase 2Y-D-A Supabase Adapter Contract Smoke";
const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const feedbackRoot = path.join(featureRoot, "consumer-recommendation-feedback");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-feedback-phase2y-d-a-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function expect(condition, name, message = "") {
  if (!condition) throw new Error(`FAIL [${name}]${message ? `: ${message}` : ""}`);
  checks.push({ name, pass: true });
}

// ── Fake RPC client fixture ───────────────────────────────────────────────────

function makeFakeRpcClient(responses) {
  const calls = [];
  return {
    calls,
    rpc(functionName, arguments_) {
      calls.push({ functionName, arguments_ });
      const response = responses[functionName];
      if (typeof response === "function") return Promise.resolve(response(arguments_));
      if (response) return Promise.resolve(response);
      return Promise.resolve({ data: null, error: { code: "UNKNOWN", message: "no mock" }, status: 500 });
    }
  };
}

function makeAuth(userId) {
  return {
    source: "mock",
    async getCurrentSession() {
      if (userId === null) return { ok: true, value: null };
      return {
        ok: true,
        value: {
          user: { userId, provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-07-19T00:00:00.000Z" },
          provider: "mock",
          issuedAt: "2026-07-19T00:00:00.000Z"
        }
      };
    }
  };
}

function makeClock(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function makeIdGen() {
  let local = 0;
  return () => `smoke-id-${String(++local).padStart(4, "0")}`;
}

function collectTsFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) result.push(full);
  }
  return result;
}

function formatDiagnostic(d) {
  if (d.file) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
    return `${d.file.fileName}:${line + 1}:${character + 1} — ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`;
  }
  return ts.flattenDiagnosticMessageText(d.messageText, "\n");
}

try {
  // ── Step 1: Compile production TypeScript ──────────────────────────────────

  const tsFiles = collectTsFiles(feedbackRoot);
  expect(tsFiles.length >= 13, "TypeScript source files found for D-A compilation", `found ${tsFiles.length}`);

  const program = ts.createProgram(tsFiles, {
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
  expect(
    diagnostics.length === 0,
    "Phase 2Y-D-A TypeScript production compilation succeeds with zero diagnostics",
    diagnostics.map(formatDiagnostic).join("\n")
  );

  // ── Step 2: Import from compiled entry ────────────────────────────────────

  const compiledEntryPath = path.join(compiledRoot, "consumer-recommendation-feedback", "index.js");
  expect(fs.existsSync(compiledEntryPath), "Compiled entry index.js exists");

  const requireFromCompiled = createRequire(compiledEntryPath);
  const feedback = requireFromCompiled("./index.js");

  expect(typeof feedback.createConsumerRecommendationFeedbackRuntime === "function",
    "createConsumerRecommendationFeedbackRuntime exported from compiled index");
  expect(typeof feedback.SupabaseConsumerRecommendationFeedbackWriteRepository === "function",
    "SupabaseConsumerRecommendationFeedbackWriteRepository class exported from compiled index");
  expect(typeof feedback.SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION === "string",
    "SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION constant exported");
  expect(typeof feedback.SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION === "string",
    "SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION constant exported");
  expect(typeof feedback.SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION === "string",
    "SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION constant exported");
  expect(typeof feedback.mapCreateSessionRpcResponse === "function",
    "mapCreateSessionRpcResponse mapper exported");
  expect(typeof feedback.mapEndSessionRpcResponse === "function",
    "mapEndSessionRpcResponse mapper exported");
  expect(typeof feedback.mapRecordFeedbackRpcResponse === "function",
    "mapRecordFeedbackRpcResponse mapper exported");

  // Exact RPC function name strings
  expect(feedback.SUPABASE_CREATE_RECOMMENDATION_SESSION_FUNCTION === "create_authenticated_recommendation_session",
    "CREATE_SESSION function name is create_authenticated_recommendation_session");
  expect(feedback.SUPABASE_END_RECOMMENDATION_SESSION_FUNCTION === "end_authenticated_recommendation_session",
    "END_SESSION function name is end_authenticated_recommendation_session");
  expect(feedback.SUPABASE_RECORD_RECOMMENDATION_FEEDBACK_EVENT_FUNCTION === "record_authenticated_recommendation_feedback_event",
    "RECORD_EVENT function name is record_authenticated_recommendation_feedback_event");

  // ── Step 3: Feature flags — supabase is now supported ─────────────────────

  const supabaseFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "supabase"
  });
  expect(supabaseFlags.source === "supabase",
    "feature flags: supabase source is now a valid supported source in Phase 2Y-D-A");
  expect(supabaseFlags.issues.length === 0,
    "feature flags: supabase source has no issues in Phase 2Y-D-A");

  const disabledFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({});
  expect(disabledFlags.source === "disabled",
    "feature flags: default (no env var) is still disabled");

  const unknownFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "live"
  });
  expect(unknownFlags.source === "disabled",
    "feature flags: unknown source still falls back to disabled");
  expect(unknownFlags.issues.length > 0,
    "feature flags: unknown source records an issue");

  // ── Step 4: Factory zero-call construction for supabase source ────────────

  const authPort = makeAuth("user-smoke-001");
  const fakeClient = makeFakeRpcClient({});
  const supabaseRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort,
    flags: { source: "supabase", issues: [] },
    feedbackClient: fakeClient
  });

  expect(fakeClient.calls.length === 0,
    "factory construction makes zero RPC calls (zero-call construction)");
  expect(supabaseRuntime.flags.source === "supabase",
    "runtime source is supabase");
  expect(typeof supabaseRuntime.service.createCurrentUserRecommendationSession === "function",
    "service.createCurrentUserRecommendationSession is accessible");

  // ── Step 5: RPC argument shape — create session ───────────────────────────

  const createSessionRpcResponses = {
    "create_authenticated_recommendation_session": () => ({
      data: { status: "created", session_id: "sess-001", started_at: "2026-07-19T01:00:00.000Z" },
      error: null
    })
  };

  const createClient = makeFakeRpcClient(createSessionRpcResponses);
  const createRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort,
    flags: { source: "supabase", issues: [] },
    feedbackClient: createClient
  });

  const createResult = await createRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-smoke-001",
    sourceSurface: "recommendation-feed",
    modelVersion: "v2-smoke"
  });

  expect(createClient.calls.length === 1, "create session makes exactly 1 RPC call");
  expect(createClient.calls[0].functionName === "create_authenticated_recommendation_session",
    "create session calls correct RPC function name");
  const createArgs = createClient.calls[0].arguments_;
  expect(createArgs.p_session_id === "sess-smoke-001",
    "create session passes p_session_id in snake_case");
  expect(createArgs.p_source_surface === "recommendation-feed",
    "create session passes p_source_surface in snake_case");
  expect(createArgs.p_model_version === "v2-smoke",
    "create session passes p_model_version in snake_case");
  expect(createResult.status === "created", "create session response maps to status: created");
  expect(createResult.sessionId === "sess-001", "create session maps session_id → sessionId");
  expect(createResult.startedAt === "2026-07-19T01:00:00.000Z", "create session maps started_at → startedAt");
  expect(createResult.source === "supabase", "create session result source is supabase");

  // ── Step 6: Create session — already_created idempotency ─────────────────

  const alreadyCreatedClient = makeFakeRpcClient({
    "create_authenticated_recommendation_session": () => ({
      data: { status: "already_created", session_id: "sess-001" },
      error: null
    })
  });
  const acRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: alreadyCreatedClient
  });
  const acResult = await acRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-smoke-001", sourceSurface: "recommendation-feed"
  });
  expect(acResult.status === "already_created", "create session: already_created mapped correctly");
  expect(acResult.sessionId === "sess-001", "already_created preserves sessionId");

  // ── Step 7: End session — RPC argument shape ──────────────────────────────

  const endClient = makeFakeRpcClient({
    "end_authenticated_recommendation_session": () => ({
      data: { status: "ended", session_id: "sess-001", ended_at: "2026-07-19T02:00:00.000Z" },
      error: null
    })
  });
  const endRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: endClient
  });
  const endResult = await endRuntime.service.endCurrentUserRecommendationSession({ sessionId: "sess-smoke-001" });

  expect(endClient.calls.length === 1, "end session makes exactly 1 RPC call");
  expect(endClient.calls[0].functionName === "end_authenticated_recommendation_session",
    "end session calls correct RPC function name");
  expect(endClient.calls[0].arguments_.p_session_id === "sess-smoke-001",
    "end session passes p_session_id in snake_case");
  expect(endResult.status === "ended", "end session maps to status: ended");
  expect(endResult.endedAt === "2026-07-19T02:00:00.000Z", "end session maps ended_at → endedAt");

  // ── Step 8: End session — already_ended ───────────────────────────────────

  const aeClient = makeFakeRpcClient({
    "end_authenticated_recommendation_session": () => ({
      data: { status: "already_ended", session_id: "sess-001", ended_at: "2026-07-19T02:00:00.000Z" },
      error: null
    })
  });
  const aeRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: aeClient
  });
  const aeResult = await aeRuntime.service.endCurrentUserRecommendationSession({ sessionId: "sess-smoke-001" });
  expect(aeResult.status === "already_ended", "end session: already_ended mapped correctly");

  // ── Step 9: End session — session_not_found (fail closed) ─────────────────

  const snfClient = makeFakeRpcClient({
    "end_authenticated_recommendation_session": () => ({
      data: { status: "session_not_found" },
      error: null
    })
  });
  const snfRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: snfClient
  });
  const snfResult = await snfRuntime.service.endCurrentUserRecommendationSession({ sessionId: "sess-smoke-missing" });
  expect(snfResult.status === "session_not_found", "end session: session_not_found mapped correctly");

  // ── Step 10: Record feedback event — RPC argument shape ───────────────────

  const recordClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": (args) => ({
      data: { status: "recorded", feedback_id: "fb-001" },
      error: null
    })
  });
  const recordRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: recordClient
  });
  const recordResult = await recordRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001",
    action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001", branchId: "branch-001" },
    eventIdempotencyKey: "evt-key-001"
  });

  expect(recordClient.calls.length === 1, "record event makes exactly 1 RPC call");
  expect(recordClient.calls[0].functionName === "record_authenticated_recommendation_feedback_event",
    "record event calls correct RPC function name");
  const recordArgs = recordClient.calls[0].arguments_;
  expect(recordArgs.p_session_id === "sess-smoke-001", "record event passes p_session_id");
  expect(recordArgs.p_action === "shown", "record event passes p_action");
  expect(recordArgs.p_target_kind === "restaurant", "record event passes p_target_kind");
  expect(recordArgs.p_event_idempotency_key === "evt-key-001", "record event passes p_event_idempotency_key");
  expect(recordArgs.p_restaurant_id === "rest-001", "record event passes p_restaurant_id");
  expect(recordArgs.p_branch_id === "branch-001", "record event passes p_branch_id");
  expect(recordResult.status === "recorded", "record event maps to status: recorded");
  expect(recordResult.feedbackId === "fb-001", "record event maps feedback_id → feedbackId");
  expect(recordResult.source === "supabase", "record event result source is supabase");

  // ── Step 11: Record — menu_item target shape ─────────────────────────────

  const menuRecordClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: { status: "recorded", feedback_id: "fb-002" }, error: null
    })
  });
  const menuRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: menuRecordClient
  });
  await menuRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001",
    action: "clicked",
    target: { kind: "menu_item", restaurantId: "rest-001", menuItemId: "item-001" },
    eventIdempotencyKey: "evt-key-002"
  });
  const menuArgs = menuRecordClient.calls[0].arguments_;
  expect(menuArgs.p_target_kind === "menu_item", "menu_item target: p_target_kind is menu_item");
  expect(menuArgs.p_menu_item_id === "item-001", "menu_item target: p_menu_item_id passed");
  expect(menuArgs.p_restaurant_id === "rest-001", "menu_item target: p_restaurant_id passed");

  // ── Step 12: Record — recommendation target shape ─────────────────────────

  const recTargetClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: { status: "recorded", feedback_id: "fb-003" }, error: null
    })
  });
  const recTargetRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: recTargetClient
  });
  await recTargetRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001",
    action: "accepted",
    target: { kind: "recommendation", recommendationId: "rec-abc-001" },
    eventIdempotencyKey: "evt-key-003"
  });
  const recArgs = recTargetClient.calls[0].arguments_;
  expect(recArgs.p_target_kind === "recommendation", "recommendation target: p_target_kind is recommendation");
  expect(recArgs.p_recommendation_id === "rec-abc-001", "recommendation target: p_recommendation_id passed");

  // ── Step 13: Record — already_recorded idempotency ────────────────────────

  const arClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: { status: "already_recorded" }, error: null
    })
  });
  const arRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: arClient
  });
  const arResult = await arRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-key-001"
  });
  expect(arResult.status === "already_recorded", "record: already_recorded mapped correctly");

  // ── Step 14: Record — idempotency_conflict ────────────────────────────────

  const icClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: { status: "idempotency_conflict" }, error: null
    })
  });
  const icRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: icClient
  });
  const icResult = await icRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-key-conflict"
  });
  expect(icResult.status === "idempotency_conflict", "record: idempotency_conflict mapped correctly");

  // ── Step 15: Record — invalid_session (ended session) ────────────────────

  const isClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: { status: "invalid_session" }, error: null
    })
  });
  const isRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: isClient
  });
  const isResult = await isRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-ended", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-key-ended"
  });
  expect(isResult.status === "invalid_session", "record: invalid_session (ended) mapped correctly");

  // ── Step 16: Error mapping — authentication required (28000) ─────────────

  const authErrClient = makeFakeRpcClient({
    "create_authenticated_recommendation_session": () => ({
      data: null, error: { code: "28000", message: "AUTHENTICATION_REQUIRED" }, status: 401
    })
  });
  const authErrRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: authErrClient
  });
  const authErrResult = await authErrRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-xxx", sourceSurface: "feed"
  });
  expect(authErrResult.status === "unauthenticated", "RPC 28000 error maps to unauthenticated");

  // ── Step 17: Error mapping — target/catalog validation error (22023) ────────
  // 22023 from the record RPC covers catalog checks (branch not found, restaurant not found,
  // target shape violation). The adapter classifies these as invalid_target, not write_failed.

  const dbErrClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: null, error: { code: "22023", message: "FEEDBACK_BRANCH_NOT_FOUND_OR_MISMATCH" }, status: 400
    })
  });
  const dbErrRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: dbErrClient
  });
  const dbErrResult = await dbErrRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001", branchId: "branch-missing" },
    eventIdempotencyKey: "evt-key-xxx"
  });
  expect(dbErrResult.status === "invalid_target", "RPC 22023 from record (catalog/branch/shape validation) maps to invalid_target");

  // ── Step 18: Error mapping — transport failure (network throw) ────────────

  const throwClient = {
    rpc() { return Promise.reject(new Error("network down")); }
  };
  const throwRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: throwClient
  });
  const throwResult = await throwRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-xxx", sourceSurface: "feed"
  });
  expect(throwResult.status === "create_failed", "RPC network throw maps to create_failed");

  // ── Step 19: Malformed response (missing field) fails closed ─────────────

  const malformedClient = makeFakeRpcClient({
    "create_authenticated_recommendation_session": () => ({
      data: { status: "created" }, // missing session_id and started_at
      error: null
    })
  });
  const malformedRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: malformedClient
  });
  const malformedResult = await malformedRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-smoke-001", sourceSurface: "feed"
  });
  expect(malformedResult.status === "create_failed", "malformed RPC response (missing fields) maps to create_failed");

  // ── Step 20: Missing feedbackClient fails closed ──────────────────────────

  let missingClientError = null;
  try {
    feedback.createConsumerRecommendationFeedbackRuntime({
      authPort,
      flags: { source: "supabase", issues: [] }
      // feedbackClient intentionally omitted
    });
  } catch (e) {
    missingClientError = e;
  }
  expect(missingClientError !== null && missingClientError.code === "feedback_configuration_invalid",
    "missing feedbackClient throws ConsumerRecommendationFeedbackConfigurationInvalidError");

  // ── Step 21: Default source is still disabled (no env var) ───────────────

  const defaultRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort,
    flags: { source: "disabled", issues: [] }
  });
  const defaultResult = await defaultRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-smoke-001", sourceSurface: "feed"
  });
  expect(defaultResult.status === "disabled", "disabled source returns disabled for create");

  // ── Step 23: Recommendation target — p_branch_id absent from RPC args ───────
  // The recommendation discriminated union has no branchId field; buildRecordArgs must
  // not inject p_branch_id for recommendation targets.

  const recShapeClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: { status: "recorded", feedback_id: "fb-shape-001" }, error: null
    })
  });
  const recShapeRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: recShapeClient
  });
  await recShapeRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001",
    action: "accepted",
    target: { kind: "recommendation", recommendationId: "rec-shape-001" },
    eventIdempotencyKey: "evt-shape-001"
  });
  const recShapeArgs = recShapeClient.calls[0].arguments_;
  expect(
    recShapeArgs.p_branch_id === undefined || recShapeArgs.p_branch_id === null,
    "recommendation target: adapter does not pass p_branch_id (exact shape — no branch on recommendation)"
  );
  expect(
    recShapeArgs.p_restaurant_id === undefined || recShapeArgs.p_restaurant_id === null,
    "recommendation target: adapter does not pass p_restaurant_id (exact shape)"
  );
  expect(
    recShapeArgs.p_menu_item_id === undefined || recShapeArgs.p_menu_item_id === null,
    "recommendation target: adapter does not pass p_menu_item_id (exact shape)"
  );

  // ── Step 24: Target shape validation (22023) → invalid_target ────────────
  // Covers: branch not found, target shape invalid, restaurant not found from record RPC.

  const shapeErrClient = makeFakeRpcClient({
    "record_authenticated_recommendation_feedback_event": () => ({
      data: null, error: { code: "22023", message: "FEEDBACK_TARGET_SHAPE_INVALID" }, status: 400
    })
  });
  const shapeErrRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: shapeErrClient
  });
  const shapeErrResult = await shapeErrRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-smoke-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-shape-err"
  });
  expect(shapeErrResult.status === "invalid_target",
    "record: FEEDBACK_TARGET_SHAPE_INVALID (22023) maps to invalid_target (exact shape enforcement)");
  expect(shapeErrResult.errorCode === "feedback_target_invalid",
    "record: 22023 target shape error errorCode is feedback_target_invalid (not SQL message)");

  // ── Step 25: UUID/session collision on create → generic create_failed ─────
  // SESSION_CREATE_CONFLICT (22023) is raised for both foreign-actor UUID collision and
  // same-actor payload conflict. The public result must be create_failed with no field that
  // reveals whether the session_id exists or belongs to another actor.

  const collisionClient = makeFakeRpcClient({
    "create_authenticated_recommendation_session": () => ({
      data: null, error: { code: "22023", message: "SESSION_CREATE_CONFLICT" }, status: 400
    })
  });
  const collisionRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: collisionClient
  });
  const collisionResult = await collisionRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-collision", sourceSurface: "feed"
  });
  expect(collisionResult.status === "create_failed",
    "create: SESSION_CREATE_CONFLICT (22023) maps to create_failed (no session existence leak)");
  expect(collisionResult.status !== "session_not_found",
    "create: SESSION_CREATE_CONFLICT does not produce session_not_found (no existence disclosure)");

  // ── Step 22: No table DML in adapter (static proof) ──────────────────────

  const adapterFile = path.join(feedbackRoot, "adapters", "supabaseConsumerRecommendationFeedbackWriteRepository.ts");
  const adapterSource = fs.readFileSync(adapterFile, "utf8");
  expect(!/\.from\s*\(/.test(adapterSource), "adapter has no .from() table access");
  expect(!/INSERT|UPDATE|DELETE/i.test(adapterSource), "adapter has no raw SQL DML");

  // ── Final: compilation proof ──────────────────────────────────────────────

  const jsFiles = [];
  function collectJs(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) collectJs(full);
      else if (e.name.endsWith(".js")) jsFiles.push(full);
    }
  }
  collectJs(compiledRoot);

  const compilationProof = {
    compiledEntryPath,
    importedPublicFactory: "createConsumerRecommendationFeedbackRuntime",
    productionMethodsCalled: [
      "createCurrentUserRecommendationSession",
      "endCurrentUserRecommendationSession",
      "recordCurrentUserRecommendationFeedbackEvent"
    ],
    compiledJsFileCount: jsFiles.length,
    temporaryArtifactPath: tempRoot
  };

  console.log(JSON.stringify({
    status: "passed",
    phase: PHASE,
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    compilationProof
  }, null, 2));

} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: PHASE,
    reason: error instanceof Error ? error.message : String(error),
    totalChecks: checks.length,
    checks,
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}
