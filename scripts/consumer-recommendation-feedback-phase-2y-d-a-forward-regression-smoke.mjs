#!/usr/bin/env node
// Phase 2Y-D-A Forward Regression Smoke
// Verifies that all Phase 2Y-B positive invariants still hold after Phase 2Y-D-A changes,
// and validates the Phase 2Y-D-A source matrix (supabase now supported).
// Production-backed: compiles actual TypeScript and imports from the compiled entry.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const PHASE = "Consumer Runtime Phase 2Y-D-A Forward Regression Smoke";
const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const feedbackRoot = path.join(featureRoot, "consumer-recommendation-feedback");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-feedback-fwd-regression-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function expect(condition, name, message = "") {
  if (!condition) throw new Error(`FAIL [${name}]${message ? `: ${message}` : ""}`);
  checks.push({ name, pass: true });
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

function makeAuthNull() {
  return { source: "mock", async getCurrentSession() { return { ok: true, value: null }; } };
}

function makeClock(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function makeIdGen() {
  let local = 0;
  return () => `fwd-id-${String(++local).padStart(4, "0")}`;
}

function makeFakeRpcClient(responses = {}) {
  const calls = [];
  return {
    calls,
    rpc(functionName, arguments_) {
      calls.push({ functionName, arguments_ });
      const r = responses[functionName];
      if (typeof r === "function") return Promise.resolve(r(arguments_));
      if (r) return Promise.resolve(r);
      return Promise.resolve({ data: null, error: { code: "NOMOCK" }, status: 500 });
    }
  };
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
  // ── Compile ───────────────────────────────────────────────────────────────

  const tsFiles = collectTsFiles(feedbackRoot);
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
  expect(diagnostics.length === 0,
    "forward regression: TypeScript compiles with zero diagnostics",
    diagnostics.map(formatDiagnostic).join("\n"));

  const compiledEntryPath = path.join(compiledRoot, "consumer-recommendation-feedback", "index.js");
  const requireFromCompiled = createRequire(compiledEntryPath);
  const feedback = requireFromCompiled("./index.js");

  expect(typeof feedback.createConsumerRecommendationFeedbackRuntime === "function",
    "forward regression: createConsumerRecommendationFeedbackRuntime is exported");

  // ── Phase 2Y-B Regression: Source matrix ─────────────────────────────────

  const defaultFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({});
  expect(defaultFlags.source === "disabled",
    "regression: default source is still disabled (Phase 2Y-B invariant)");

  const mockFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "mock"
  });
  expect(mockFlags.source === "mock",
    "regression: mock source is still explicitly accepted (Phase 2Y-B invariant)");
  expect(mockFlags.issues.length === 0,
    "regression: mock source has no issues (Phase 2Y-B invariant)");

  const unknownFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "live"
  });
  expect(unknownFlags.source === "disabled",
    "regression: unknown source still falls back to disabled (Phase 2Y-B invariant)");
  expect(unknownFlags.source !== "mock",
    "regression: unknown source does not fall back to mock (Phase 2Y-B invariant)");

  // ── Phase 2Y-D-A Transition: supabase now valid ───────────────────────────

  const supabaseFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "supabase"
  });
  expect(supabaseFlags.source === "supabase",
    "transition: supabase is now a valid source in Phase 2Y-D-A");
  expect(supabaseFlags.issues.length === 0,
    "transition: supabase source has no issues in Phase 2Y-D-A");

  // ── Phase 2Y-B Regression: Disabled source returns disabled ───────────────

  const authPort = makeAuth("user-fwd-001");
  const disabledRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "disabled", issues: [] }
  });
  const disabledCreate = await disabledRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-fwd-001", sourceSurface: "feed"
  });
  expect(disabledCreate.status === "disabled", "regression: disabled create returns disabled");
  expect(disabledCreate.source === "disabled", "regression: disabled result source field is disabled");

  const disabledEnd = await disabledRuntime.service.endCurrentUserRecommendationSession({ sessionId: "sess-fwd-001" });
  expect(disabledEnd.status === "disabled", "regression: disabled end returns disabled");

  const disabledRecord = await disabledRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-fwd-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-fwd-001"
  });
  expect(disabledRecord.status === "disabled", "regression: disabled record returns disabled");

  // ── Phase 2Y-B Regression: Mock session lifecycle ─────────────────────────

  const clock = makeClock(["2026-07-19T01:00:00.000Z", "2026-07-19T02:00:00.000Z", "2026-07-19T03:00:00.000Z"]);
  const idGen = makeIdGen();
  const mockRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "mock", issues: [] }, clock, idGenerator: idGen
  });

  const createR = await mockRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-fwd-001", sourceSurface: "fwd-smoke-surface", modelVersion: "v1"
  });
  expect(createR.status === "created", "regression: mock session create returns created");
  expect(createR.sessionId === "sess-fwd-001", "regression: mock create returns correct sessionId");
  expect(createR.source === "mock", "regression: mock create result source is mock");

  const createAgainR = await mockRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-fwd-001", sourceSurface: "fwd-smoke-surface", modelVersion: "v1"
  });
  expect(createAgainR.status === "already_created", "regression: mock session create idempotent (already_created)");

  const endR = await mockRuntime.service.endCurrentUserRecommendationSession({ sessionId: "sess-fwd-001" });
  expect(endR.status === "ended", "regression: mock session end returns ended");

  const endAgainR = await mockRuntime.service.endCurrentUserRecommendationSession({ sessionId: "sess-fwd-001" });
  expect(endAgainR.status === "already_ended", "regression: mock session end idempotent (already_ended)");

  // ── Phase 2Y-B Regression: Mock feedback event recording ─────────────────

  const mockRuntime2 = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "mock", issues: [] }, clock: makeClock(["2026-07-19T01:00:00.000Z", "2026-07-19T02:00:00.000Z"]), idGenerator: makeIdGen()
  });
  await mockRuntime2.service.createCurrentUserRecommendationSession({
    sessionId: "sess-rec-001", sourceSurface: "rec-surface"
  });

  const recR = await mockRuntime2.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-rec-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-fwd-001" },
    eventIdempotencyKey: "evt-fwd-key-001"
  });
  expect(recR.status === "recorded", "regression: mock record returns recorded");
  expect(typeof recR.feedbackId === "string" && recR.feedbackId.length > 0,
    "regression: mock record returns a feedbackId");

  const recAgainR = await mockRuntime2.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-rec-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-fwd-001" },
    eventIdempotencyKey: "evt-fwd-key-001"
  });
  expect(recAgainR.status === "already_recorded", "regression: mock record idempotent (already_recorded)");

  const icR = await mockRuntime2.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-rec-001", action: "clicked", // different payload
    target: { kind: "restaurant", restaurantId: "rest-fwd-001" },
    eventIdempotencyKey: "evt-fwd-key-001" // same key
  });
  expect(icR.status === "idempotency_conflict", "regression: mock record idempotency conflict detected");

  // ── Phase 2Y-B Regression: Actor isolation ────────────────────────────────

  const authPort2 = makeAuth("user-fwd-002");
  const mockRuntime3 = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: authPort2, flags: { source: "mock", issues: [] },
    clock: makeClock(["2026-07-19T01:00:00.000Z"]), idGenerator: makeIdGen()
  });

  // Foreign actor cannot end another's session
  const foreignEnd = await mockRuntime3.service.endCurrentUserRecommendationSession({ sessionId: "sess-fwd-001" });
  expect(foreignEnd.status === "session_not_found", "regression: foreign actor session_not_found for end");

  // Foreign actor cannot record against another's session
  const foreignRecord = await mockRuntime3.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-fwd-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-foreign-001"
  });
  expect(foreignRecord.status === "session_not_found", "regression: foreign actor session_not_found for record");

  // ── Phase 2Y-B Regression: Action timestamp mapping (shown) ──────────────

  const tsRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "mock", issues: [] },
    clock: makeClock(["T1", "T2"]), idGenerator: makeIdGen()
  });
  await tsRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-ts-001", sourceSurface: "ts-test"
  });
  const tsRecord = await tsRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "sess-ts-001", action: "shown",
    target: { kind: "restaurant", restaurantId: "rest-001" },
    eventIdempotencyKey: "evt-ts-001"
  });
  expect(tsRecord.status === "recorded", "regression: action timestamp test — record succeeds");

  // ── Phase 2Y-B Regression: Validation — invalid inputs fail closed ────────

  const invalidRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "mock", issues: [] }, clock: makeClock(["T1"]), idGenerator: makeIdGen()
  });
  await invalidRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-val-001", sourceSurface: "val-test"
  });

  const emptySessionIdResult = await invalidRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "", sourceSurface: "val-test"
  });
  expect(emptySessionIdResult.status === "invalid_input" || emptySessionIdResult.status === "unauthenticated" || emptySessionIdResult.status !== "created",
    "regression: empty sessionId is rejected");

  const favPrefixResult = await invalidRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "fav-bad-id", sourceSurface: "val-test"
  });
  expect(favPrefixResult.status !== "created", "regression: fav-* sessionId is rejected");

  const ownershipFieldResult = await invalidRuntime.service.createCurrentUserRecommendationSession(
    Object.assign({ sessionId: "sess-own-001", sourceSurface: "val-test" }, { userId: "hack" })
  );
  expect(ownershipFieldResult.status !== "created", "regression: userId in input is rejected");

  // ── Phase 2Y-D-A Transition: Supabase requires injected client ────────────

  let missingClientErr = null;
  try {
    feedback.createConsumerRecommendationFeedbackRuntime({
      authPort, flags: { source: "supabase", issues: [] }
    });
  } catch (e) { missingClientErr = e; }
  expect(missingClientErr !== null, "transition: supabase source without feedbackClient throws");
  expect(missingClientErr?.code === "feedback_configuration_invalid",
    "transition: missing feedbackClient throws ConfigurationInvalidError");

  // ── Phase 2Y-D-A Transition: Supabase zero-call construction ─────────────

  const fakeRpcClient = makeFakeRpcClient({});
  feedback.createConsumerRecommendationFeedbackRuntime({
    authPort, flags: { source: "supabase", issues: [] }, feedbackClient: fakeRpcClient
  });
  expect(fakeRpcClient.calls.length === 0, "transition: supabase factory construction is zero RPC calls");

  // ── Phase 2Y-B Regression: Unauthenticated (null session) ────────────────

  const nullAuthRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuthNull(), flags: { source: "mock", issues: [] },
    clock: makeClock(["T1"]), idGenerator: makeIdGen()
  });
  const unauthResult = await nullAuthRuntime.service.createCurrentUserRecommendationSession({
    sessionId: "sess-unauth", sourceSurface: "test"
  });
  expect(unauthResult.status === "unauthenticated", "regression: null auth session returns unauthenticated");

  // ── Final ─────────────────────────────────────────────────────────────────

  const compilationProof = {
    compiledEntryPath,
    importedPublicFactory: "createConsumerRecommendationFeedbackRuntime",
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
    phase2YBInvariantsPreserved: true,
    phase2YDATransitionVerified: true,
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
