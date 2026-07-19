#!/usr/bin/env node
// Phase 2Y-B Production-Backed Contract Smoke
// Compiles actual Phase 2Y-B TypeScript production files to a temporary directory
// and tests the real runtime via the public factory entry point.
// JavaScript provides only: test fixtures, injected auth port, injected deterministic
// clock, injected store, and assertions. No production logic is reimplemented here.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const PHASE = "Consumer Runtime Phase 2Y-B Local Disabled/Mock Contract Smoke";
const root = process.cwd();
const featureRoot = path.join(root, "apps", "mobile", "features");
const feedbackRoot = path.join(featureRoot, "consumer-recommendation-feedback");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-feedback-phase2y-b-"));
const compiledRoot = path.join(tempRoot, "features");
const checks = [];

function expect(condition, name, message = "") {
  if (!condition) throw new Error(`FAIL [${name}]${message ? `: ${message}` : ""}`);
  checks.push({ name, pass: true });
}

// --- Test fixtures (auth port stub, clock factory, id generator) ---

function makeAuth(userId) {
  return {
    source: "mock",
    async getCurrentSession() {
      if (userId === null) return { ok: true, value: null };
      return {
        ok: true,
        value: {
          user: {
            userId,
            provider: "mock",
            isAnonymous: false,
            emailVerified: true,
            createdAt: "2026-07-19T00:00:00.000Z"
          },
          provider: "mock",
          issuedAt: "2026-07-19T00:00:00.000Z"
        }
      };
    }
  };
}

function makeAuthError() {
  return {
    source: "mock",
    async getCurrentSession() { return { ok: false, error: new Error("auth-error") }; }
  };
}

function makeClock(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

let _idSeq = 0;
function makeIdGen(prefix = "id") {
  let local = 0;
  return () => `smoke-${prefix}-${String(++local).padStart(4, "0")}`;
}

try {
  // =====================================================================
  // STEP 1: Compile production TypeScript files to temp directory
  // =====================================================================

  const tsFiles = collectTsFiles(feedbackRoot);
  expect(tsFiles.length >= 10, "TypeScript source files found for compilation", `found ${tsFiles.length}`);

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
    "Phase 2Y-B TypeScript production compilation succeeds with zero diagnostics",
    diagnostics.map(formatDiagnostic).join("\n")
  );

  // =====================================================================
  // STEP 2: Import from compiled public entry point
  // =====================================================================

  const compiledEntryDir = path.join(compiledRoot, "consumer-recommendation-feedback");
  const compiledEntryPath = path.join(compiledEntryDir, "index.js");
  expect(fs.existsSync(compiledEntryPath), "Compiled production entry index.js exists at expected path");

  const requireFromCompiled = createRequire(compiledEntryPath);
  const feedback = requireFromCompiled("./index.js");

  // Verify public API surface from compiled module
  expect(typeof feedback.createConsumerRecommendationFeedbackRuntime === "function",
    "createConsumerRecommendationFeedbackRuntime exported from compiled index");
  expect(typeof feedback.createConsumerRecommendationFeedbackRepository === "function",
    "createConsumerRecommendationFeedbackRepository exported from compiled index");
  expect(typeof feedback.ConsumerRecommendationFeedbackService === "function",
    "ConsumerRecommendationFeedbackService class exported from compiled index");
  expect(typeof feedback.DisabledConsumerRecommendationFeedbackRepository === "function",
    "DisabledConsumerRecommendationFeedbackRepository class exported from compiled index");
  expect(typeof feedback.MockConsumerRecommendationFeedbackRepository === "function",
    "MockConsumerRecommendationFeedbackRepository class exported from compiled index");
  expect(typeof feedback.getConsumerRecommendationFeedbackRuntimeFlags === "function",
    "getConsumerRecommendationFeedbackRuntimeFlags exported from compiled index");
  expect(typeof feedback.isValidId === "function",
    "isValidId exported from compiled index");

  // =====================================================================
  // STEP 3: Feature flag behavior
  // =====================================================================

  const defaultFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({});
  expect(defaultFlags.source === "disabled",
    "feature flags: default source is disabled when env var absent");
  expect(defaultFlags.issues.length === 0,
    "feature flags: default flags have no issues");

  const supabaseFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "supabase"
  });
  expect(supabaseFlags.source === "disabled",
    "feature flags: supabase source falls back to disabled in Phase 2Y-B");
  expect(supabaseFlags.issues.length > 0,
    "feature flags: unsupported supabase source records an issue");

  const unknownFlags = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "live"
  });
  expect(unknownFlags.source === "disabled",
    "feature flags: unknown source does not fall back to mock");

  const mockFlagsFromEnv = feedback.getConsumerRecommendationFeedbackRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_RECOMMENDATION_FEEDBACK_SOURCE: "mock"
  });
  expect(mockFlagsFromEnv.source === "mock",
    "feature flags: mock source is recognized and accepted");

  // =====================================================================
  // STEP 4: Disabled source — all three operations return disabled
  // =====================================================================

  const disabledFlags = { source: "disabled", issues: [] };
  const disabledRuntime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-a"),
    flags: disabledFlags
  });
  expect(disabledRuntime.service.source === "disabled",
    "disabled runtime: service.source is disabled");
  expect(
    (await disabledRuntime.service.createCurrentUserRecommendationSession({ sessionId: "s1", sourceSurface: "home" })).status === "disabled",
    "disabled create returns disabled"
  );
  expect(
    (await disabledRuntime.service.endCurrentUserRecommendationSession({ sessionId: "s1" })).status === "disabled",
    "disabled end returns disabled"
  );
  expect(
    (await disabledRuntime.service.recordCurrentUserRecommendationFeedbackEvent({
      sessionId: "s1", action: "shown", target: { kind: "recommendation", recommendationId: "r1" }, eventIdempotencyKey: "k1"
    })).status === "disabled",
    "disabled record returns disabled"
  );

  // =====================================================================
  // STEP 5: Mock source — session lifecycle
  // =====================================================================

  const mockFlags = { source: "mock", issues: [] };
  const clock1 = makeClock(["T1", "T2", "T3", "T4"]);
  const runtime = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-a"),
    flags: mockFlags,
    clock: clock1,
    idGenerator: makeIdGen("sess")
  });
  expect(runtime.service.source === "mock", "mock runtime: service.source is mock");

  // Session create
  const created = await runtime.service.createCurrentUserRecommendationSession({
    sessionId: "session-1", sourceSurface: "home", modelVersion: "v1"
  });
  expect(created.status === "created", "mock create: first call returns created");
  expect(created.sessionId === "session-1", "mock create: result has correct sessionId");
  expect(created.startedAt === "T1", "mock create: startedAt comes from injected clock");
  expect(created.source === "mock", "mock create: result source is mock");

  // Session idempotency (already_created)
  const alreadyCreated = await runtime.service.createCurrentUserRecommendationSession({
    sessionId: "session-1", sourceSurface: "home", modelVersion: "v1"
  });
  expect(alreadyCreated.status === "already_created",
    "mock create: same sessionId+payload returns already_created");
  expect(alreadyCreated.sessionId === "session-1",
    "mock create: already_created result includes sessionId");

  // Session create conflict (same sessionId, different payload)
  const createConflict = await runtime.service.createCurrentUserRecommendationSession({
    sessionId: "session-1", sourceSurface: "search", modelVersion: "v1"
  });
  expect(createConflict.status === "invalid_input",
    "mock create: same sessionId+different payload returns invalid_input");

  // Immutable session fields
  const sessionRow = runtime.repository.getSessionForContract("session-1");
  expect(sessionRow.sourceSurface === "home",
    "mock create: session sourceSurface is immutable after create conflict");
  expect(sessionRow.startedAt === "T1",
    "mock create: session startedAt is immutable after create conflict");

  // Session end
  const ended = await runtime.service.endCurrentUserRecommendationSession({ sessionId: "session-1" });
  expect(ended.status === "ended", "mock end: first call returns ended");
  expect(ended.sessionId === "session-1", "mock end: result has sessionId");
  expect(ended.endedAt === "T2", "mock end: endedAt comes from injected clock");

  // Session already_ended + endedAt stability
  const alreadyEnded = await runtime.service.endCurrentUserRecommendationSession({ sessionId: "session-1" });
  expect(alreadyEnded.status === "already_ended",
    "mock end: repeat call returns already_ended");
  expect(runtime.repository.getSessionForContract("session-1").endedAt === "T2",
    "mock end: endedAt is stable on repeated end (not overwritten by new clock value)");

  // =====================================================================
  // STEP 6: Six action timestamp mappings + nonmatching null
  // =====================================================================

  const runtimeActions = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-b"),
    flags: mockFlags,
    clock: () => "CLOCK_NOW",
    idGenerator: makeIdGen("action")
  });
  await runtimeActions.service.createCurrentUserRecommendationSession({
    sessionId: "s-actions", sourceSurface: "surf-b"
  });

  const ACTIONS = ["shown", "clicked", "accepted", "dismissed", "saved", "consumed"];
  const ACTION_COLS = {
    shown: "shownAt", clicked: "clickedAt", accepted: "acceptedAt",
    dismissed: "dismissedAt", saved: "savedAt", consumed: "consumedAt"
  };
  const ALL_COLS = Object.values(ACTION_COLS);

  for (const action of ACTIONS) {
    const r = await runtimeActions.service.recordCurrentUserRecommendationFeedbackEvent({
      sessionId: "s-actions", action,
      target: { kind: "recommendation", recommendationId: "rec-1" },
      eventIdempotencyKey: `key-${action}`
    });
    expect(r.status === "recorded", `action '${action}' records successfully`);
    const ev = runtimeActions.repository.getStore().events.at(-1);
    const thisCol = ACTION_COLS[action];
    expect(ev[thisCol] === "CLOCK_NOW", `action '${action}' sets ${thisCol} to clock value`);
    const otherCols = ALL_COLS.filter(c => c !== thisCol);
    expect(otherCols.every(c => ev[c] === null),
      `action '${action}' leaves all other action timestamp columns null`);
  }

  // =====================================================================
  // STEP 7: sourceSurface derived from session, not from event input
  // =====================================================================

  const shownEvent = runtimeActions.repository.getStore().events.find(ev => ev.action === "shown");
  expect(shownEvent.sourceSurface === "surf-b",
    "event sourceSurface is derived from session row (surf-b), not supplied by client");

  // =====================================================================
  // STEP 8: Feedback event idempotency
  // =====================================================================

  const runtimeIdem = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-c"),
    flags: mockFlags,
    clock: () => "T_IDEM",
    idGenerator: makeIdGen("idem")
  });
  await runtimeIdem.service.createCurrentUserRecommendationSession({ sessionId: "s-c", sourceSurface: "home" });
  const idemTarget = { kind: "recommendation", recommendationId: "rec-x" };

  const rec1 = await runtimeIdem.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-c", action: "shown", target: idemTarget, eventIdempotencyKey: "idem-1"
  });
  expect(rec1.status === "recorded", "feedback event: first record returns recorded");
  expect(typeof rec1.feedbackId === "string" && rec1.feedbackId.length > 0,
    "feedback event: recorded result has a non-empty feedbackId");

  const rec2 = await runtimeIdem.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-c", action: "shown", target: idemTarget, eventIdempotencyKey: "idem-1"
  });
  expect(rec2.status === "already_recorded",
    "feedback event: same key+same payload returns already_recorded");

  const rec3 = await runtimeIdem.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-c", action: "clicked", target: idemTarget, eventIdempotencyKey: "idem-1"
  });
  expect(rec3.status === "idempotency_conflict",
    "feedback event: same key+different payload returns idempotency_conflict");

  // Same key from different actor is independent
  const runtimeOtherActor = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-d"),
    flags: mockFlags,
    clock: () => "T_D",
    idGenerator: makeIdGen("d")
  });
  await runtimeOtherActor.service.createCurrentUserRecommendationSession({ sessionId: "s-d", sourceSurface: "home" });
  const crossActorRec = await runtimeOtherActor.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-d", action: "shown", target: idemTarget, eventIdempotencyKey: "idem-1"
  });
  expect(crossActorRec.status === "recorded",
    "same eventIdempotencyKey from different actor is independent (not a conflict)");

  // =====================================================================
  // STEP 9: Foreign actor — session end and record denied
  // =====================================================================

  const runtimeOwner = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-e"),
    flags: mockFlags,
    clock: () => "T_E",
    idGenerator: makeIdGen("e")
  });
  await runtimeOwner.service.createCurrentUserRecommendationSession({ sessionId: "s-e", sourceSurface: "home" });

  // Intruder shares same store but different auth identity
  const runtimeIntruder = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-f"),
    flags: mockFlags,
    clock: () => "T_F",
    idGenerator: makeIdGen("f"),
    store: runtimeOwner.repository.getStore()
  });

  const foreignEnd = await runtimeIntruder.service.endCurrentUserRecommendationSession({ sessionId: "s-e" });
  expect(foreignEnd.status === "session_not_found",
    "foreign actor cannot end another actor's session (returns session_not_found, no existence leak)");

  const foreignRecord = await runtimeIntruder.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-e", action: "shown",
    target: { kind: "recommendation", recommendationId: "r" },
    eventIdempotencyKey: "foreign-k"
  });
  expect(foreignRecord.status === "session_not_found",
    "foreign actor cannot record against another actor's session (returns session_not_found)");

  // =====================================================================
  // STEP 10: Store isolation
  // =====================================================================

  // Default: separate instances have isolated stores
  const runtimeIsoA = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-iso"),
    flags: mockFlags,
    clock: () => "T_ISO",
    idGenerator: makeIdGen("iso-a")
  });
  const runtimeIsoB = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-iso"),
    flags: mockFlags,
    clock: () => "T_ISO",
    idGenerator: makeIdGen("iso-b")
  });
  await runtimeIsoA.service.createCurrentUserRecommendationSession({ sessionId: "iso-s", sourceSurface: "home" });
  expect(!runtimeIsoB.repository.getStore().sessions.has("iso-s"),
    "isolated store: separate runtime instances do not share sessions by default");

  // Shared store: actor isolation is still enforced
  const sharedStore = { sessions: new Map(), events: [] };
  const runtimeShareA = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-share-a"),
    flags: mockFlags,
    clock: () => "T_SHARE",
    idGenerator: makeIdGen("share-a"),
    store: sharedStore
  });
  const runtimeShareB = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-share-b"),
    flags: mockFlags,
    clock: () => "T_SHARE",
    idGenerator: makeIdGen("share-b"),
    store: sharedStore
  });
  await runtimeShareA.service.createCurrentUserRecommendationSession({ sessionId: "shared-s", sourceSurface: "home" });
  const shareEndB = await runtimeShareB.service.endCurrentUserRecommendationSession({ sessionId: "shared-s" });
  expect(shareEndB.status === "session_not_found",
    "shared store: actor B cannot end actor A's session");
  const shareRecB = await runtimeShareB.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "shared-s", action: "shown",
    target: { kind: "recommendation", recommendationId: "r" },
    eventIdempotencyKey: "share-k"
  });
  expect(shareRecB.status === "session_not_found",
    "shared store: actor B cannot record against actor A's session");

  // =====================================================================
  // STEP 11: Validation rules
  // =====================================================================

  const runtimeVal = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-val"),
    flags: mockFlags,
    clock: () => "T_VAL",
    idGenerator: makeIdGen("val")
  });

  // isValidId contract
  expect(feedback.isValidId("12345") === true,
    "validation: numeric text string passes isValidId (no bare-integer rejection)");
  expect(feedback.isValidId("") === false,
    "validation: empty string fails isValidId");
  expect(feedback.isValidId("   ") === false,
    "validation: whitespace-only string fails isValidId");
  expect(feedback.isValidId("fav-derived-123") === false,
    "validation: fav-* prefix fails isValidId");

  // Numeric text sessionId accepted end-to-end
  const numResult = await runtimeVal.service.createCurrentUserRecommendationSession({
    sessionId: "12345", sourceSurface: "home"
  });
  expect(numResult.status === "created",
    "validation: numeric text sessionId accepted end-to-end");

  // Need a session to test record validation
  await runtimeVal.service.createCurrentUserRecommendationSession({ sessionId: "s-val", sourceSurface: "home" });

  // Empty sessionId rejected
  const emptyId = await runtimeVal.service.createCurrentUserRecommendationSession({
    sessionId: "", sourceSurface: "home"
  });
  expect(emptyId.status === "invalid_input",
    "validation: empty sessionId returns invalid_input");

  // fav-* sessionId rejected
  const favId = await runtimeVal.service.createCurrentUserRecommendationSession({
    sessionId: "fav-123", sourceSurface: "home"
  });
  expect(favId.status === "invalid_input",
    "validation: fav-* sessionId returns invalid_input");

  // Ownership field userId rejected
  const ownerUserId = await runtimeVal.service.createCurrentUserRecommendationSession({
    sessionId: "s-own", sourceSurface: "home", userId: "injected"
  });
  expect(ownerUserId.status === "invalid_input",
    "validation: userId in create input is rejected");

  // Ownership field user_id rejected
  const ownerUnderScore = await runtimeVal.service.createCurrentUserRecommendationSession({
    sessionId: "s-own2", sourceSurface: "home", user_id: "injected"
  });
  expect(ownerUnderScore.status === "invalid_input",
    "validation: user_id in create input is rejected");

  // Invalid menu_item target (empty menuItemId)
  const menuBadItem = await runtimeVal.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-val", action: "shown",
    target: { kind: "menu_item", restaurantId: "r1", menuItemId: "" },
    eventIdempotencyKey: "k-bad-menu"
  });
  expect(menuBadItem.status === "invalid_target",
    "validation: menu_item target with empty menuItemId returns invalid_target");

  // Invalid action
  const badAction = await runtimeVal.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-val", action: "unknown_action",
    target: { kind: "recommendation", recommendationId: "r" },
    eventIdempotencyKey: "k-bad-action"
  });
  expect(badAction.status === "invalid_action",
    "validation: unknown action returns invalid_action");

  // =====================================================================
  // STEP 12: Auth states
  // =====================================================================

  const runtimeUnauth = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth(null),
    flags: mockFlags,
    clock: () => "T_UNAUTH",
    idGenerator: makeIdGen("unauth")
  });
  const unauthResult = await runtimeUnauth.service.createCurrentUserRecommendationSession({
    sessionId: "s-unauth", sourceSurface: "home"
  });
  expect(unauthResult.status === "unauthenticated",
    "auth: null session (no logged-in user) returns unauthenticated");

  const runtimeAuthErr = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuthError(),
    flags: mockFlags,
    clock: () => "T_AUTHERR",
    idGenerator: makeIdGen("autherr")
  });
  const authErrResult = await runtimeAuthErr.service.createCurrentUserRecommendationSession({
    sessionId: "s-autherr", sourceSurface: "home"
  });
  expect(authErrResult.status === "unauthenticated",
    "auth: auth port error returns unauthenticated");

  // =====================================================================
  // STEP 13: Factory zero-call construction
  // =====================================================================

  let factoryAuthCalls = 0;
  const trackingAuth = {
    source: "mock",
    async getCurrentSession() { factoryAuthCalls++; return { ok: true, value: null }; }
  };
  feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: trackingAuth,
    flags: mockFlags,
    idGenerator: makeIdGen("track")
  });
  expect(factoryAuthCalls === 0,
    "factory: constructing a mock runtime makes zero authPort calls");

  // =====================================================================
  // STEP 14: Configuration error — mock without authPort (via repository factory)
  // =====================================================================

  let configErr = null;
  try {
    feedback.createConsumerRecommendationFeedbackRepository(mockFlags, {});
  } catch (e) {
    configErr = e;
  }
  expect(configErr !== null,
    "factory: mock repository without authPort throws a configuration error");

  // =====================================================================
  // STEP 15: Append-only event history
  // =====================================================================

  const eventCountBefore = runtimeIdem.repository.getStore().events.length;
  await runtimeIdem.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "s-c", action: "accepted", target: idemTarget, eventIdempotencyKey: "idem-append"
  });
  expect(runtimeIdem.repository.getStore().events.length === eventCountBefore + 1,
    "feedback events are append-only (count strictly increases, no removal)");

  // =====================================================================
  // STEP 16: Session not found (no session created)
  // =====================================================================

  const runtimeSnf = feedback.createConsumerRecommendationFeedbackRuntime({
    authPort: makeAuth("actor-snf"),
    flags: mockFlags,
    clock: () => "T_SNF",
    idGenerator: makeIdGen("snf")
  });
  const snfResult = await runtimeSnf.service.recordCurrentUserRecommendationFeedbackEvent({
    sessionId: "nonexistent-session", action: "shown",
    target: { kind: "recommendation", recommendationId: "r" },
    eventIdempotencyKey: "k-snf"
  });
  expect(snfResult.status === "session_not_found",
    "record on nonexistent session returns session_not_found");

  // =====================================================================
  // FINAL: Compilation evidence and cleanup readiness
  // =====================================================================

  expect(fs.existsSync(compiledEntryPath),
    "Compiled production artifacts present in temp directory before cleanup");

  const compiledFiles = collectJsFiles(compiledRoot);
  expect(compiledFiles.length >= 10,
    "At least 10 compiled JS files produced in temp directory",
    `found ${compiledFiles.length}`);

  console.log(JSON.stringify({
    status: "passed",
    phase: PHASE,
    totalChecks: checks.length,
    checks,
    compilationProof: {
      compiledEntryPath,
      importedPublicFactory: "createConsumerRecommendationFeedbackRuntime",
      productionMethodsCalled: [
        "createCurrentUserRecommendationSession",
        "endCurrentUserRecommendationSession",
        "recordCurrentUserRecommendationFeedbackEvent"
      ],
      compiledJsFileCount: compiledFiles.length,
      temporaryArtifactPath: tempRoot
    },
    networkUsed: false,
    databaseUsed: false,
    supabaseUsed: false,
    migrationExecuted: false,
    developmentTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2ZStarted: false
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
    n4Executed: false,
    phase2ZStarted: false
  }, null, 2));
  process.exitCode = 1;
} finally {
  // Always remove temporary compilation artifacts
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

// --- Utility functions ---

function collectTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
}
