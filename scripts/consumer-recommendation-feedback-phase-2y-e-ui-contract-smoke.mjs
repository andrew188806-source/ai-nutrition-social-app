import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const issues = [];
let tempRoot = null;
const tempBase = process.platform === "win32" ? os.tmpdir() : "/tmp";

function check(name, condition) {
  const item = { name, pass: Boolean(condition) };
  checks.push(item); if (!condition) issues.push(item);
}
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function collectTs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectTs(full) : entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}
function writeNodeStub(base, name, main, source) {
  const dir = path.join(base, "node_modules", ...name.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, main }), "utf8");
  fs.writeFileSync(path.join(dir, main), source, "utf8");
}
function compileProduction() {
  tempRoot = fs.mkdtempSync(path.join(tempBase, "consumer-feedback-phase2y-e-ui-"));
  writeNodeStub(tempRoot, "@react-native-async-storage/async-storage", "index.js",
    "const values=new Map();module.exports={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v)},removeItem:async k=>{values.delete(k)}};\n");
  writeNodeStub(tempRoot, "react-native-url-polyfill", "auto.js", "// Node has URL support.\n");
  const featureRoot = path.join(root, "apps/mobile/features");
  const outDir = path.join(tempRoot, "features");
  const program = ts.createProgram([
    ...collectTs(path.join(featureRoot, "consumer-auth")),
    ...collectTs(path.join(featureRoot, "consumer-recommendation-feedback"))
  ], { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.NodeJs, target: ts.ScriptTarget.ES2020,
    strict: true, esModuleInterop: true, skipLibCheck: true, outDir, rootDir: featureRoot });
  const emitted = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics);
  check("production TypeScript compiles with zero diagnostics", diagnostics.length === 0);
  if (diagnostics.length) throw new Error("Production TypeScript compilation failed.");
  process.env.NODE_PATH = [path.join(tempRoot, "node_modules"), path.join(root, "apps/mobile/node_modules"), path.join(root, "node_modules")].join(path.delimiter);
  Module._initPaths();
  const featureDir = path.join(outDir, "consumer-recommendation-feedback");
  return {
    ...createRequire(path.join(featureDir, "consumerRecommendationFeedbackComposition.js"))("./consumerRecommendationFeedbackComposition.js"),
    ...createRequire(path.join(featureDir, "consumerRecommendationFeedbackTargetMapper.js"))("./consumerRecommendationFeedbackTargetMapper.js"),
    ...createRequire(path.join(featureDir, "consumerRecommendationFeedbackUiModel.js"))("./consumerRecommendationFeedbackUiModel.js")
  };
}

function authPort() {
  let current = { user: { userId: "actor-contract", provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-07-19T00:00:00.000Z" }, provider: "mock", issuedAt: "2026-07-19T00:00:00.000Z" };
  return {
    source: "mock",
    async getCurrentSession() { return { ok: true, value: current }; },
    observeAuthState() { return () => undefined; },
    async signIn() { return { ok: true, value: current }; },
    async signUp() { return { ok: true, value: current }; },
    async signOut() { current = null; return { ok: true, value: undefined }; },
    async refreshSession() { return { ok: true, value: current }; },
    async sendPasswordReset() { return { ok: true, value: undefined }; },
    async restoreSession() { return { ok: true, value: current }; }
  };
}
function uuidSequence() {
  const values = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004"
  ];
  let index = 0;
  return () => values[index++] ?? values.at(-1);
}

try {
  const feedback = compileProduction();
  check("compiled Mobile module exports public composition entry", typeof feedback.createMobileConsumerRecommendationFeedbackComposition === "function");
  check("compiled target module exports target mapper", typeof feedback.mapConsumerRecommendationFeedbackTarget === "function");
  check("compiled UI module exports production UI model", typeof feedback.ConsumerRecommendationFeedbackUiModel === "function");

  const composition = feedback.createMobileConsumerRecommendationFeedbackComposition({
    store: { sessions: new Map(), events: [] },
    env: {}, flags: { source: "mock", issues: [] }, authPort: authPort(), uuidFactory: uuidSequence(),
    clock: () => "2026-07-19T00:00:00.000Z", idGenerator: () => "feedback-contract"
  });
  check("Mobile composition resolves explicit mock source", composition.source === "mock" && composition.runtime.flags.source === "mock");
  const contractStore = { sessions: new Map(), events: [] };
  const lifecycleComposition = feedback.createMobileConsumerRecommendationFeedbackComposition({
    store: contractStore, env: {}, flags: { source: "mock", issues: [] }, authPort: authPort(), uuidFactory: uuidSequence(),
    clock: () => "2026-07-19T00:00:00.000Z", idGenerator: () => "feedback-lifecycle"
  });
  check("Mobile composition factory construction makes zero writes", contractStore.sessions.size === 0 && contractStore.events.length === 0);

  const mapper = feedback.mapConsumerRecommendationFeedbackTarget;
  const canonical = mapper({ kind: "restaurant", restaurantId: "42", branchId: "branch-01", identityEvidence: "canonical" });
  check("canonical numeric text remains allowed when evidence is canonical", canonical.status === "available" && canonical.target.restaurantId === "42");
  for (const [name, input] of [
    ["empty ID", { kind: "restaurant", restaurantId: "", identityEvidence: "canonical" }],
    ["display name", { kind: "restaurant", restaurantId: "好廚 台北", identityEvidence: "display_name" }],
    ["array index", { kind: "restaurant", restaurantId: "1", identityEvidence: "array_index" }],
    ["fav ID", { kind: "restaurant", restaurantId: "fav-1", identityEvidence: "canonical" }],
    ["meal record ID", { kind: "restaurant", restaurantId: "meal-record-1", identityEvidence: "canonical" }],
    ["local meal ID", { kind: "restaurant", restaurantId: "local-meal-1", identityEvidence: "local_meal_id" }],
    ["rating ID", { kind: "restaurant", restaurantId: "rating-1", identityEvidence: "rating_id" }],
    ["presentation ID", { kind: "restaurant", restaurantId: "presentation-1", identityEvidence: "presentation_card_id" }],
    ["unsupported kind", { kind: "dish", restaurantId: "rest-1", identityEvidence: "canonical" }],
    ["cross-kind extra", { kind: "restaurant", restaurantId: "rest-1", menuItemId: "menu-1", identityEvidence: "canonical" }],
    ["menu parent missing", { kind: "menu_item", restaurantId: "", menuItemId: "menu-1", identityEvidence: "canonical" }]
  ]) check(`target mapper rejects ${name}`, mapper(input).status === "target_unavailable");

  const serviceCalls = { create: 0, record: 0, end: 0 };
  const trackedService = {
    source: lifecycleComposition.service.source,
    createCurrentUserRecommendationSession(input) { serviceCalls.create += 1; return lifecycleComposition.service.createCurrentUserRecommendationSession(input); },
    recordCurrentUserRecommendationFeedbackEvent(input) { serviceCalls.record += 1; return lifecycleComposition.service.recordCurrentUserRecommendationFeedbackEvent(input); },
    endCurrentUserRecommendationSession(input) { serviceCalls.end += 1; return lifecycleComposition.service.endCurrentUserRecommendationSession(input); }
  };
  const model = new feedback.ConsumerRecommendationFeedbackUiModel({ service: trackedService, uuidFactory: lifecycleComposition.uuidFactory });
  const create1 = model.beginSession("flow-1", "next_meal_recommendation");
  const create2 = model.beginSession("flow-1", "next_meal_recommendation");
  const [created, duplicateCreate] = await Promise.all([create1, create2]);
  check("session create is stable across duplicate begin", created.status === "created" && duplicateCreate.status === "created" && contractStore.sessions.size === 1 && serviceCalls.create === 1);

  const event1 = model.recordEvent("select:one", "clicked", canonical);
  const event2 = model.recordEvent("select:one", "clicked", canonical);
  const [recorded, duplicateTap] = await Promise.all([event1, event2]);
  check("duplicate tap shares one write", recorded.status === "recorded" && duplicateTap.status === "recorded" && contractStore.events.length === 1 && serviceCalls.record === 1);
  const stableRetry = await model.recordEvent("select:one", "clicked", canonical);
  check("completed identical retry resolves already_recorded", stableRetry.status === "already_recorded" && contractStore.events.length === 1 && serviceCalls.record === 1);
  const accepted = await model.recordEvent("confirm:one", "accepted", canonical);
  check("accepted uses a distinct stable key and records through production UI model", accepted.status === "recorded" && contractStore.events.length === 2 &&
    contractStore.events[0].eventIdempotencyKey !== contractStore.events[1].eventIdempotencyKey && serviceCalls.record === 2);
  const conflict = await model.recordEvent("select:one", "accepted", canonical);
  check("same gesture identity with changed payload conflicts", conflict.status === "idempotency_conflict");
  const ended = await model.endSession();
  const repeatedEnd = await model.endSession();
  check("end and repeated end are safe without a repeated service call", ended.status === "ended" && repeatedEnd.status === "already_ended" && serviceCalls.end === 1);
  const afterEnd = await model.recordEvent("after-end", "clicked", canonical);
  check("ended session rejects later events before service or row write", afterEnd.status === "invalid_session" && contractStore.events.length === 2 && serviceCalls.record === 2);
  model.setAuthSessionIdentity("actor-a");
  model.setAuthSessionIdentity("actor-b");
  check("auth identity change clears local runtime state", model.snapshot.status === "idle");

  let resolveCreate;
  const staleService = {
    source: "mock",
    createCurrentUserRecommendationSession: () => new Promise((resolve) => { resolveCreate = resolve; }),
    recordCurrentUserRecommendationFeedbackEvent: async () => ({ status: "recorded", source: "mock", feedbackId: "fixture" }),
    endCurrentUserRecommendationSession: async () => ({ status: "ended", source: "mock", sessionId: "fixture", endedAt: "2026-07-19T00:00:00.000Z" })
  };
  const staleModel = new feedback.ConsumerRecommendationFeedbackUiModel({ service: staleService, uuidFactory: uuidSequence() });
  const stalePending = staleModel.beginSession("flow-stale", "next_meal_recommendation");
  staleModel.reset();
  resolveCreate({ status: "created", source: "mock", sessionId: "fixture", startedAt: "2026-07-19T00:00:00.000Z" });
  await stalePending;
  check("generation counter isolates stale create response", staleModel.snapshot.status === "idle");
  staleModel.dispose();

  const content = read("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");
  const provider = read("apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts");
  check("production UI uses Mobile composition public entry", /createMobileConsumerRecommendationFeedbackComposition/.test(content));
  check("production UI uses target mapper and UI model", /mapConsumerRecommendationFeedbackTarget/.test(content) && /ConsumerRecommendationFeedbackUiModel/.test(content));
  check("production UI has no direct runtime factory repository Supabase RPC or DML", !/createConsumerRecommendationFeedbackRuntime|Repository\s*\(|supabase|\.rpc\s*\(|\.from\s*\(|\b(?:insert|update|delete)\s*\(/i.test(content));
  check("only live canonical provider projects feedback target", /dataProvenance === "live"/.test(provider) && /canonicalFeedbackTarget/.test(provider));
  check("UI records only actual clicked and accepted gestures", /"clicked"/.test(content) && /"accepted"/.test(content) && !/"shown"|"dismissed"|"saved"|"consumed"/.test(content));
  check("event input cannot spoof sourceSurface timestamp or excluded payload", !/event[^\n]*(?:sourceSurface|timestamp|rating|feedbackNote|dismissReason)|userId\s*:|user_id\s*:/i.test(content));
  check("UI contains no unsafe UUID generation", !/Math\.random|Date\.now\(\).*uuid|random.*string/i.test(content));

  const developmentRunner = read("scripts/consumer-recommendation-feedback-phase-2y-e-development-mobile-smoke.mjs");
  check("Development runner imports the true Mobile composition through compiled production exports",
    /feedback\.createMobileConsumerRecommendationFeedbackComposition/.test(developmentRunner) && /feedback\.ConsumerRecommendationFeedbackUiModel/.test(developmentRunner));
  check("Development live contract covers clicked accepted repeated end and ended-session protection",
    /"clicked"/.test(developmentRunner) && /"accepted"/.test(developmentRunner) && /repeat_end_session/.test(developmentRunner) && /record_after_end/.test(developmentRunner));
  check("Development runner has no direct runtime repository or RPC access",
    !/composition\.runtime|\.repository|\.rpc\s*\(/.test(developmentRunner));
  check("Development runner has no service-role or API-keys endpoint path",
    !/service_role|\/api-keys|apikeys/i.test(developmentRunner));
  check("Development runner retains finally cleanup sign-out session and operator-close invariants",
    /finally\s*\{[\s\S]*cleanupStatements[\s\S]*signOut\(\)[\s\S]*getCurrentSession\(\)[\s\S]*operator\.close/.test(developmentRunner));

  console.log(JSON.stringify({ status: issues.length ? "failed" : "passed", phase: "Consumer Runtime Phase 2Y-E UI Contract Smoke",
    totalChecks: checks.length, checks, issues, importedPublicComposition: "createMobileConsumerRecommendationFeedbackComposition",
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false,
    serviceRoleCredentialAccessed: false, serviceRoleCredentialUsed: false, serviceRoleBrowserRuntimePathUsed: false }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ status: "failed", phase: "Consumer Runtime Phase 2Y-E UI Contract Smoke",
    reason: error instanceof Error ? error.message : String(error), checks, issues,
    networkUsed: false, databaseUsed: false, credentialsUsed: false }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
