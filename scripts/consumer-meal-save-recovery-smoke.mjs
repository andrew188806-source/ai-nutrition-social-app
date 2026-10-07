#!/usr/bin/env node
// TastKind meal-save recovery gates R-01 … R-34 (R-27 is intentionally absent: the approved package ships no
// purgeActor / clear(actorKey); the static assertion that replaces it is R-28/R-27x below).
//
// Harness map (every gate id says which parts are real and which are modelled):
//   H-FS   real TypeScript repositories / services / runtimes / stores / ledger over an IN-MEMORY SERVER MODEL
//          (key -> row, fingerprint conflict, eligibility, fault injection) — the server is MODELLED.
//   H-SDK  the real @supabase/supabase-js client and postgrest-js dispatch against a MODELLED PostgREST fetch;
//          the token source (accessToken callback) and account-switch timing are simulated.
//   H-PG   (only with --pg-bin) the same App code against a disposable PostgreSQL 17 running the real migrations.
//   H-CRASH the real ledger over a crash-injecting storage (exhaustive crash points + seeded fuzz).
//   STATIC source assertions.
// The smoke runs against the source tree in the current working directory (mutation runs use a copy) and loads the
// BASELINE implementation straight from git objects for the R-07c comparison. No remote access of any kind.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import childProcess from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.cwd();
const BASELINE = "654b2a372eee6dcf2243a478857b17f3b8a34786";
const only = (process.env.TK_GATES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const pgBinIndex = process.argv.indexOf("--pg-bin");
const PG_BIN = pgBinIndex >= 0 ? path.resolve(process.argv[pgBinIndex + 1]) : null;
const OUT_INDEX = process.argv.indexOf("--out");
const OUT = OUT_INDEX >= 0 ? path.resolve(process.argv[OUT_INDEX + 1]) : null;

function expect(condition, label) {
  if (!condition) throw new Error(`FAIL [${label}]`);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = async (n = 1) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

// ------------------------------------------------------------------------------------------------ loaders
function makeLoader(readSource) {
  const cache = new Map();
  const load = (rel) => {
    rel = rel.split(path.sep).join("/");
    if (cache.has(rel)) return cache.get(rel).exports;
    const source = readSource(rel);
    if (source === null) throw new Error(`UNRESOLVED ${rel}`);
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    cache.set(rel, module);
    const localRequire = (request) => {
      if (!request.startsWith(".")) throw new Error(`Smoke refused external module: ${request}`);
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), request)).replace(/\.js$/, "");
      for (const candidate of [`${base}.ts`, `${base}/index.ts`]) if (readSource(candidate) !== null) return load(candidate);
      throw new Error(`UNRESOLVED ${request} from ${rel}`);
    };
    vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: rel })(localRequire, module, module.exports);
    return module.exports;
  };
  return load;
}
const fromDisk = (rel) => { const file = path.join(root, rel); return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, "utf8") : null; };
const fromBaseline = (rel) => {
  const result = childProcess.spawnSync("git", ["-C", SCRIPT_ROOT, "show", `${BASELINE}:${rel}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
};
const loadC = makeLoader(fromDisk);
const loadB = makeLoader(fromBaseline);
const F = "apps/mobile/features";
const C = {
  storage: loadC(`${F}/consumer-auth/storage.ts`),
  recovery: loadC(`${F}/consumer-runtime/mealSaveRecovery.ts`),
  ledger: loadC(`${F}/consumer-runtime/mealSaveOperationLedger.ts`),
  dispatch: loadC(`${F}/consumer-auth/actorBoundDispatch.ts`),
  mapper: loadC(`${F}/consumer-runtime/consumerMealWriteMapper.ts`),
  storeW: loadC(`${F}/consumer-runtime/consumerMealWriteOperationStore.ts`),
  runtimeW: loadC(`${F}/consumer-runtime/consumerMealWriteRuntime.ts`),
  repoW: loadC(`${F}/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`),
  storeF: loadC(`${F}/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts`),
  runtimeF: loadC(`${F}/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts`),
  repoF: loadC(`${F}/meal-identification-finalization/adapters/supabaseConsumerMealIdentificationFinalizationRepository.ts`),
  svcF: loadC(`${F}/meal-identification-finalization/consumerMealIdentificationFinalizationService.ts`),
  zh: loadC("lib/i18n/zh-TW.ts")
};
const readText = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ------------------------------------------------------------------------------------------------ fixtures
const NOW = new Date("2026-07-19T16:30:00.000Z");
// In-memory ConsumerAuthStorage whose persisted map can be re-opened by a new object (= a process restart).
class MapStorage {
  constructor(map = new Map()) { this.map = map; }
  async getItem(key) { return this.map.get(key) ?? null; }
  async setItem(key, value) { this.map.set(key, value); }
  async removeItem(key) { this.map.delete(key); }
}
const reopen = (storage) => new MapStorage(storage.map);
const uuid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const baseDraft = (name = "雞胸餐") => ({
  selectedMealPeriod: "午餐", mealName: name, originalDetectedName: name, portion: "1 份",
  nutrition: { calories: 520, protein: 38, carbohydrates: 56, fat: 14 }, isSelfCooked: false, wasUserCorrected: false, trustedCanonicalIdentity: null
});
const finalization = (occurredAt = "2026-07-19T12:00:00.000Z", name = "REC finalized") => ({
  version: "meal-identification-finalization-v2", recordTiming: "current", occurredAt,
  originalAnalysis: { status: "unavailable", detectedItemNames: [], photoReferences: [], model: null, estimatedNutrition: null, confidence: null, analyzedAt: null },
  selection: { kind: "personal_unresolved", sourceContext: "unknown", identity: { branchId: null, branchMenuItemId: null, menuCategoryId: null, menuId: null, menuItemId: null, restaurantId: null }, mealItemName: name, reason: "manual", restaurantName: "REC place" },
  corrections: [], mealWrite: { isSelfCooked: false, mealName: name, nutrition: { calories: 120 }, portion: null, selectedMealPeriod: "lunch", wasUserCorrected: false }
});
const finDraft = (clientRequestId, name) => ({ ...(clientRequestId ? { clientRequestId } : {}), mealType: "lunch", finalization: finalization(undefined, name) });
const ctx = (actor = "A", gen = 1) => ({ actorKey: actor, actorGeneration: gen, timezone: "Asia/Taipei" });
const actorCtx = (actor = "A", gen = 1) => ({ actorKey: actor, actorGeneration: gen });
const slim = (s) => ({ status: s.status, errorCode: s.errorCode, pending: s.pending, saved: Boolean(s.mealRecordId) });

// ------------------------------------------------------------------------------------------------ server model (MODELLED)
const httpModel = (code) => (!code ? 500 : code.startsWith("28") ? 403 : code === "42501" ? 403 : code === "23505" ? 409 : code === "42P01" ? 404 : /^(22|23)/.test(code) ? 400 : 500);
const NET = () => ({ data: null, error: { code: "", message: "TypeError: Network request failed", details: "", hint: "" }, status: 0 });
const GATEWAY = () => ({ data: null, error: { message: "<html>504 Gateway Time-out</html>" }, status: 504 });
const structured = (code, message, status = httpModel(code)) => ({ data: null, error: { code, message, details: "", hint: "" }, status });
// Measured PostgreSQL error payloads (S1 of the recovery review, real PostgreSQL 17.6).
const S1 = {
  ELIGIBILITY: { v2: ["42501", "CONSUMER_CORE_ELIGIBILITY_REQUIRED"], fin: ["42501", "CONSUMER_CORE_ELIGIBILITY_REQUIRED"] },
  AUTH: { v2: ["28000", "AUTHENTICATION_REQUIRED"], fin: ["28000", "AUTHENTICATION_REQUIRED"] },
  CAPTURE_PRIVILEGE: { v2: ["42501", "permission denied for table detail_capture_anchors"], fin: ["42501", "OWNERSHIP_OR_AUTHORIZATION_REJECTED"] },
  TABLE_MISSING: { v2: ["42P01", 'relation "retention_capture.detail_capture_anchors" does not exist'], fin: ["23514", "DURABLE_FINALIZATION_FAILED"] },
  CHECK_VIOLATION: { v2: ["23514", 'new row for relation "detail_capture_anchors" violates check constraint "rec_block"'], fin: ["23514", "DURABLE_STATE_INCONSISTENCY"] },
  LOCK_TIMEOUT: { v2: ["55P03", "canceling statement due to lock timeout"], fin: ["23514", "DURABLE_FINALIZATION_FAILED"] },
  STATEMENT_TIMEOUT: { v2: ["57014", "canceling statement due to statement timeout"], fin: ["57014", "canceling statement due to statement timeout"] },
  NOT_NULL: { v2: ["23502", 'null value in column "display_name_snapshot" of relation "meal_record_items" violates not-null constraint'], fin: null },
  CONFLICT: { v2: ["23505", "IDEMPOTENCY_KEY_CONFLICT"], fin: ["23505", "IDEMPOTENCY_KEY_CONFLICT"] }
};

function createServerModel() {
  const model = {
    rows: new Map(), eligible: new Set(["A", "B"]), faults: [], created: 0,
    rowsOf: (user) => [...model.rows.values()].filter((row) => row.user === user),
    handle(user, fn, args) {
      if (!user) return { kind: "err", code: "28000", message: "AUTHENTICATION_REQUIRED" };
      if (!model.eligible.has(user)) return { kind: "err", code: "42501", message: "CONSUMER_CORE_ELIGIBILITY_REQUIRED" };
      const fault = model.faults.shift();
      if (fault && !fault.commit) return { kind: "err", code: fault.code, message: fault.message };
      const key = args.p_client_request_id;
      const fingerprint = JSON.stringify({ ...args, p_client_request_id: undefined });
      const slot = `${user}|${key}`;
      const existing = model.rows.get(slot);
      if (existing) return existing.fingerprint === fingerprint ? { kind: "ok", row: existing, replayed: true } : { kind: "err", code: "23505", message: "IDEMPOTENCY_KEY_CONFLICT" };
      const row = { id: `row-${++model.created}`, user, key, fingerprint, fn, args };
      model.rows.set(slot, row);
      return { kind: "ok", row, replayed: false };
    }
  };
  return model;
}
const okPayload = (fn, row) => fn.startsWith("finalize")
  ? { replayed: false, meal_record_id: row.id, meal_record_item_id: `item-${row.id}`, meal_analysis_id: `analysis-${row.id}`, meal_identification_finalization_id: `fin-${row.id}`, meal_correction_ids: [] }
  : { id: row.id, user_id: row.user, meal_type: row.args.p_meal_type, source: row.args.p_source, occurred_at: row.args.p_occurred_at, meal_date: row.args.p_meal_date, timezone: row.args.p_timezone, created_at: row.args.p_occurred_at, updated_at: row.args.p_occurred_at, title: row.args.p_title ?? null, note: null, meal_record_items: [] };
function respond(model, user, fn, args) {
  const result = model.handle(user, fn, args);
  if (result.kind === "ok") return { data: okPayload(fn, result.row), error: null, status: 200 };
  return structured(result.code, result.message);
}

// A Supabase-like client whose rpc() is driven by behaviours (consumed in order) then by the server model.
function makeClient(model, world, behaviors = []) {
  const client = {
    calls: [],
    async rpc(fn, args) {
      client.calls.push({ fn, key: args.p_client_request_id, user: world.user, args: JSON.parse(JSON.stringify(args)) });
      const behaviour = behaviors.shift();
      if (!behaviour) return respond(model, world.user, fn, args);
      switch (behaviour.kind) {
        case "pass": return respond(model, world.user, fn, args);
        case "net": return NET();
        case "gateway": return GATEWAY();
        case "empty": return { data: null, error: null, status: 200 };
        case "hang": return new Promise(() => {});
        case "throw": throw new Error("simulated transport exception");
        case "fault": return structured(behaviour.code, behaviour.message, behaviour.status);
        case "committedThenNet": respond(model, world.user, fn, args); return NET();
        case "committedThenThrow": respond(model, world.user, fn, args); throw new Error("simulated loss after commit");
        case "committedThenMalformed": respond(model, world.user, fn, args); return { data: fn.startsWith("finalize") ? { replayed: false } : { id: 1 }, error: null, status: 200 };
        case "gate": { await behaviour.gate.promise; return behaviour.commit === false ? NET() : respond(model, behaviour.as ?? world.user, fn, args); }
        default: throw new Error(`unknown behaviour ${behaviour.kind}`);
      }
    }
  };
  return client;
}
const authPortFor = (world) => ({ getCurrentSession: async () => ({ ok: true, value: world.user ? { user: { userId: world.user } } : null }) });

function makeNormal({ behaviors = [], model = createServerModel(), world = { user: "A" }, storage = new MapStorage(), localWait, binding, start = 1000, clock = { now: () => NOW } } = {}) {
  const client = makeClient(model, world, behaviors);
  const repo = new C.repoW.SupabaseConsumerMealRecordWriteRepository({ authPort: authPortFor(world), mealClient: client, writeEnabled: true });
  const store = new C.storeW.ConsumerMealWriteOperationStore(storage);
  let n = start;
  const runtime = new C.runtimeW.ConsumerMealWriteRuntime({ service: { createCurrentUserMealRecord: (input) => repo.createCurrentUserMealRecord(input) }, operationStore: store, clock, uuidFactory: () => uuid(n++), localWait, dispatchBinding: binding });
  return { kind: "normal", runtime, store, storage, client, model, world, repo };
}
function makeFin({ behaviors = [], model = createServerModel(), world = { user: "A" }, storage = new MapStorage(), localWait, binding, start = 2000, clock = { now: () => NOW } } = {}) {
  const client = makeClient(model, world, behaviors);
  const repo = new C.repoF.SupabaseConsumerMealIdentificationFinalizationRepository(client);
  const service = new C.svcF.ConsumerMealIdentificationFinalizationService({ authPort: authPortFor(world), repository: repo });
  const store = new C.storeF.ConsumerMealIdentificationFinalizationOperationStore(storage);
  let n = start;
  const runtime = new C.runtimeF.ConsumerMealIdentificationFinalizationRuntime({ service, operationStore: store, clock, uuidFactory: () => uuid(n++), localWait, dispatchBinding: binding });
  return { kind: "finalization", runtime, store, storage, client, model, world, repo };
}
const submit = (h, actor = "A", gen = 1, name) => (h.kind === "normal" ? h.runtime.submit(ctx(actor, gen), baseDraft(name)) : h.runtime.submit(ctx(actor, gen), finDraft(undefined, name)));
async function boot(h, actor = "A", gen = 1) {
  await h.runtime.setActor(actor, gen);
  if (h.kind === "finalization") h.runtime.beginAnalysisOperation(actorCtx(actor, gen), "analysis-op-1");
  return h;
}
const entriesOf = async (h, actor = "A") => (await h.store.list(actor)).entries;
const bothKinds = [makeNormal, makeFin];

// ------------------------------------------------------------------------------------------------ gate registry
const gates = [];
const gate = (id, title, run) => gates.push({ id, title, run });

// ============================================================================================ R-01 … R-06
gate("R-01", "explicit rollback then retry [H-FS]", async () => {
  for (const make of bothKinds) {
    // first failure, no unknown history: structured rollback => retryable, same key on retry, exactly one row
    const h = await boot(make({ behaviors: [{ kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }] }));
    const first = await submit(h);
    const [entry] = await entriesOf(h);
    expect(first.status === "error" && !first.mealRecordId && entry?.state === "retryable" && entry.hadUnknown === false, `${make.name}: rollback without history is retryable`);
    const retried = await h.runtime.retry(actorCtx());
    expect(retried.status === "succeeded" && h.model.rowsOf("A").length === 1 && h.client.calls.length === 2 && h.client.calls[0].key === h.client.calls[1].key, `${make.name}: retry sends the same key, one row`);
    // with prior unknown: a later rollback proves nothing about the earlier attempt
    const u = await boot(make({ behaviors: [{ kind: "net" }, { kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }] }));
    await submit(u);
    await u.runtime.retry(actorCtx());
    const [after] = await entriesOf(u);
    const summary = u.runtime.getState().operations[0];
    expect(after.state === "unknown" && after.hadUnknown && after.lastReason === "server" && u.runtime.getState().status === "uncertain", `${make.name}: rollback after unknown stays unknown`);
    expect(!summary.actions.includes("cancel") && summary.actions.includes("defer"), `${make.name}: negative: an operation with unknown history cannot be cancelled`);
  }
});

gate("R-02", "response lost after commit [H-FS]", async () => {
  for (const make of bothKinds) for (const behaviour of [{ kind: "committedThenNet" }, { kind: "committedThenThrow" }, { kind: "committedThenMalformed" }]) {
    const h = await boot(make({ behaviors: [behaviour] }));
    const first = await submit(h);
    const [entry] = await entriesOf(h);
    expect(first.status === "uncertain" && entry.state === "unknown" && h.model.rowsOf("A").length === 1, `${make.name}/${behaviour.kind}: unknown, row exists`);
    const keyBefore = h.client.calls[0].key;
    const retried = await h.runtime.retry(actorCtx());
    expect(retried.status === "succeeded" && h.model.rowsOf("A").length === 1 && h.client.calls[1].key === keyBefore && JSON.stringify(h.client.calls[1].args) === JSON.stringify(h.client.calls[0].args), `${make.name}/${behaviour.kind}: retry replays the same key and payload, still one row`);
    expect((await entriesOf(h)).length === 0, `${make.name}/${behaviour.kind}: the entry is removed only after the trusted success`);
  }
});

gate("R-03", "late response / local wait [H-FS]", async () => {
  // a local wait that elapses immediately for hung requests (stands in for the 30 s limit)
  const elapsed = { race: (p) => Promise.race([p.then((value) => ({ timedOut: false, value })), wait(15).then(() => ({ timedOut: true }))]) };
  for (const make of bothKinds) {
    const gateD = deferred();
    const h = await boot(make({ behaviors: [{ kind: "gate", gate: gateD }], localWait: elapsed }));
    const first = await submit(h);
    const [entry] = await entriesOf(h);
    expect(first.status === "uncertain" && entry.state === "unknown" && entry.lastReason === "deadline" && h.model.rowsOf("A").length === 0, `${make.name}: local wait elapsed => unknown/deadline, nothing claimed about the server`);
    const revisionBefore = h.kind === "normal" ? h.runtime.getState().mealDataRevision : h.runtime.getState().finalizationDataRevision;
    gateD.resolve();                                        // the original request finally commits and answers
    await wait(40);
    const revisionAfter = h.kind === "normal" ? h.runtime.getState().mealDataRevision : h.runtime.getState().finalizationDataRevision;
    expect(h.model.rowsOf("A").length === 1 && (await entriesOf(h)).length === 0 && revisionAfter === revisionBefore + 1, `${make.name}: late success removes the entry and refreshes data`);
    // late success after the actor changed: reconciled in the owner's ledger, never published to the other actor
    const g2 = deferred();
    const s = await boot(make({ behaviors: [{ kind: "gate", gate: g2, as: "A" }], localWait: elapsed }));
    await submit(s);
    await s.runtime.setActor("B", 2);
    s.world.user = "B";
    const revisionOf = (state) => (s.kind === "normal" ? state.mealDataRevision : state.finalizationDataRevision);
    const bState = JSON.stringify(slim(s.runtime.getState())) + revisionOf(s.runtime.getState());
    g2.resolve();
    await wait(40);
    expect((await s.store.list("A")).entries.length === 0 && JSON.stringify(slim(s.runtime.getState())) + revisionOf(s.runtime.getState()) === bState, `${make.name}: late success reconciles the OWNER's ledger and leaves the other actor's state untouched`);
    // late structured error after unknown must not demote the sticky unknown
    const g3 = deferred();
    const t = await boot(make({ behaviors: [{ kind: "gate", gate: g3, commit: false }], localWait: elapsed }));
    await submit(t);
    t.model.faults.push({ code: "55P03", message: "canceling statement due to lock timeout" });
    await t.runtime.retry(actorCtx());
    g3.resolve();
    await wait(40);
    const [stay] = await entriesOf(t);
    expect(stay && stay.hadUnknown && stay.state === "unknown", `${make.name}: negative: a late/later error never turns a possibly-committed operation into 'not written'`);
  }
});

gate("R-04", "same key / different payload [H-FS]", async () => {
  const h = await boot(makeNormal({ behaviors: [] }));
  h.model.faults.push({ code: "23505", message: "IDEMPOTENCY_KEY_CONFLICT" });
  const first = await submit(h);
  expect(first.status === "error" && first.errorCode === "idempotency_conflict" && (await entriesOf(h)).length === 0, "first attempt conflict: operation removed, conflict shown");
  const u = await boot(makeNormal({ behaviors: [{ kind: "net" }] }));
  await submit(u);
  u.model.faults.push({ code: "23505", message: "IDEMPOTENCY_KEY_CONFLICT" });
  await u.runtime.retry(actorCtx());
  const [entry] = await entriesOf(u);
  const summary = u.runtime.getState().operations[0];
  expect(entry && entry.hadUnknown && entry.lastReason === "conflict" && !summary.actions.includes("retry") && summary.actions.includes("defer"), "conflict after unknown is kept as unknown, no retry button");
  // finalization: the same clientRequestId with a different payload is refused locally, nothing is sent
  const f = await boot(makeFin({ behaviors: [{ kind: "net" }] }));
  await f.runtime.submit(ctx(), finDraft(uuid(777), "REC one"));
  const callsBefore = f.client.calls.length;
  const conflicting = await f.runtime.submit(ctx(), finDraft(uuid(777), "REC two"));
  expect(conflicting.errorCode === "finalization_idempotency_conflict" && f.client.calls.length === callsBefore, "same id + different payload refused locally with 0 RPC");
  const same = await f.runtime.submit(ctx(), finDraft(uuid(777), "REC one"));
  expect(same.status === "succeeded" && f.client.calls.length === callsBefore + 1 && f.client.calls[1].key === uuid(777), "same id + same payload is a manual retry of the same operation");
});

gate("R-05", "rapid taps and concurrent retries [H-FS]", async () => {
  for (const make of bothKinds) {
    const g = deferred();
    const h = await boot(make({ behaviors: [{ kind: "gate", gate: g }] }));
    const taps = Array.from({ length: 8 }, () => submit(h));
    await wait(25);
    const retryDuring = h.runtime.retry(actorCtx());
    g.resolve();
    const states = await Promise.all([...taps, retryDuring]);
    expect(h.client.calls.length === 1 && h.model.rowsOf("A").length === 1 && new Set(states.map((s) => s.status)).size === 1, `${make.name}: 8 taps + a concurrent retry => 1 RPC, 1 row, one shared outcome`);
    const u = await boot(make({ behaviors: [{ kind: "net" }] }));
    await submit(u);
    const before = u.client.calls.length;
    const more = [];
    for (let i = 0; i < 8; i++) more.push(slim(await submit(u)));
    expect(u.client.calls.length === before && more.every((s) => s.status === "uncertain" && s.errorCode === "result_uncertain"), `${make.name}: while a foreground unknown operation is not set aside, new saves make 0 RPC`);
  }
  // two different operations retried concurrently are independent
  const h = await boot(makeNormal({ behaviors: [{ kind: "net" }] }));
  await submit(h, "A", 1, "one");
  const [first] = await entriesOf(h);
  await h.runtime.defer(actorCtx(), first.opId);
  h.client.calls.length = 0;
  h.world.user = "A";
  const second = await submit(h, "A", 1, "two");
  expect(second.status === "succeeded" && h.model.rowsOf("A").length === 1, "a new meal can be recorded after 暫不處理");
  const r = await Promise.all([h.runtime.retry(actorCtx(), first.opId), h.runtime.retry(actorCtx(), first.opId)]);
  expect(h.client.calls.length === 2 && h.model.rowsOf("A").length === 2 && r[0].status === r[1].status, "two retries of the same operation share one attempt");
});

gate("R-06", "restart and offline [H-FS]", async () => {
  for (const make of bothKinds) {
    const h = await boot(make({ behaviors: [{ kind: "net" }, { kind: "net" }] }));
    await submit(h);
    const key = h.client.calls[0].key;
    const retriedOffline = await h.runtime.retry(actorCtx());
    expect(retriedOffline.status === "uncertain" && h.model.rowsOf("A").length === 0, `${make.name}: offline retries stay unknown and create nothing`);
    // restart: brand new runtime/store/client over the same storage, 30 days later
    const later = new Date(NOW.getTime() + 30 * 24 * 3600e3);
    const r = await boot(make({ storage: reopen(h.storage), model: h.model, clock: { now: () => later } }));
    const state = r.runtime.getState();
    expect(state.status === "uncertain" && state.pending && state.operations.length === 1 && r.client.calls.length === 0, `${make.name}: restart restores the unknown operation with 0 RPC`);
    const done = await r.runtime.retry(actorCtx());
    expect(done.status === "succeeded" && r.client.calls[0].key === key && h.model.rowsOf("A").length === 1, `${make.name}: retry after restart sends the original key`);
  }
});

// ============================================================================================ R-07 account isolation
gate("R-07a", "account switch A→B→A [H-FS]", async () => {
  const h = await boot(makeNormal({ behaviors: [{ kind: "net" }, { kind: "net" }] }));
  await submit(h, "A", 1, "one");
  const [one] = await entriesOf(h);
  await h.runtime.defer(actorCtx(), one.opId);
  await submit(h, "A", 1, "two");
  const aKeys = (await entriesOf(h)).map((e) => e.opId);
  expect(aKeys.length === 2, "A holds two unknown operations");
  await h.runtime.setActor("B", 2);
  h.world.user = "B";
  const bState = h.runtime.getState();
  expect(bState.operations.length === 0 && bState.status === "idle", "B sees none of A's operations");
  expect((await h.runtime.retry(actorCtx("B", 2), aKeys[0])).status !== "succeeded" && h.client.calls.filter((c) => c.user === "B").length === 0, "B cannot retry A's operation (0 RPC under B)");
  const bMeal = await submit(h, "B", 2, "b meal");
  expect(bMeal.status === "succeeded" && h.model.rowsOf("B").length === 1 && h.model.rowsOf("A").length === 0, "B records its own meal");
  await h.runtime.setActor("A", 3);
  h.world.user = "A";
  const back = (await entriesOf(h)).map((e) => e.opId);
  expect(JSON.stringify(back) === JSON.stringify(aKeys) && h.runtime.getState().operations.length === 2, "A's operations are intact and in order after switching back");
  expect(h.client.calls.every((c) => (c.user === "B") === !aKeys.includes(c.key)), "every RPC carries its owner's identity (spy)");
  // negative: a foreign-owner entry planted in B's slot is not loaded
  const slot0 = await h.storage.getItem(`tastkind.consumerMealWrite.pending.v2.slot.A.0`);
  await h.storage.setItem(`tastkind.consumerMealWrite.pending.v2.slot.B.5`, slot0);
  const bList = await h.store.list("B");
  expect(bList.entries.every((e) => e.ownerActorKey === "B") && bList.unusable === 1, "negative: foreign-owner slot is ignored and counted as unusable");
});

gate("R-07b", "sign-out / generation bump / session loss never delete [H-FS]", async () => {
  for (const make of bothKinds) {
    const h = await boot(make({ behaviors: [{ kind: "committedThenNet" }, { kind: "pass" }, { kind: "committedThenNet" }] }));
    const lists = [];
    await submit(h, "A", 1, "one");
    await h.runtime.setActor("A", 2);                      // same-actor generation bump (invalidateAccess)
    if (make === makeFin) h.runtime.beginAnalysisOperation(actorCtx("A", 2), "analysis-op-2");
    lists.push((await entriesOf(h)).length);
    const keys1 = (await entriesOf(h)).map((e) => e.opId);
    await h.runtime.retry(actorCtx("A", 2), keys1[0]);
    await submit(h, "A", 2, "two");
    await h.runtime.setActor(null, 3);                     // sign-out / session expiry
    await h.runtime.setActor("A", 4);                      // re-login as the same account
    if (make === makeFin) h.runtime.beginAnalysisOperation(actorCtx("A", 4), "analysis-op-3");
    lists.push((await entriesOf(h)).length);
    expect(lists.every((n) => n >= 1), `${make.name}: operations survive generation bump and sign-out/in`);
    h.client.calls.length = 0;
    for (const e of await entriesOf(h)) await h.runtime.retry(actorCtx("A", 4), e.opId);
    expect((await entriesOf(h)).length === 0 && h.model.rowsOf("A").length === 2, `${make.name}: two intended meals => two rows (baseline forgot the key and created duplicates)`);
  }
});

// ---------------------------------------------------------------------------------------------- R-07c matrix (H-SDK)
const SDK = createRequire(path.join(SCRIPT_ROOT, "apps/mobile/package.json"))("@supabase/supabase-js");
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub, tv = 1) => `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ sub, role: sub ? "authenticated" : "anon", tv })}.sig`;
const claimsOf = (auth) => { try { return JSON.parse(Buffer.from(String(auth).replace(/^Bearer /, "").split(".")[1], "base64url").toString()); } catch { return {}; } };
const ANON_KEY = jwt(null);
const SB_URL = "http://postgrest.local";

// MODELLED PostgREST: serves each request as the identity found in the Authorization header it actually receives.
function makeBackend(model, log, world) {
  return async (input, init) => {
    const fn = String(input).match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/)?.[1];
    const headers = new Headers(init.headers);
    const claims = claimsOf(headers.get("authorization"));
    const args = JSON.parse(init.body);
    log.push({ stage: "received", fn, sub: claims.sub ?? null, role: claims.role ?? null, tagReachedServer: headers.has("x-tastkind-expected-user") });
    await world.hooks.afterDispatch?.();
    const response = claims.sub ? respond(model, claims.sub, fn, args) : structured("42501", `permission denied for function ${fn}`);
    return new Response(JSON.stringify(response.error ?? response.data), { status: response.status, headers: { "content-type": "application/json" } });
  };
}

const matrixScenarios = [
  { id: "no_race_control", hooks: () => ({}) },
  { id: "switch_during_getCurrentSession", hooks: (w) => ({ session: async () => { w.current = "B"; w.switched(); } }) },
  { id: "switch_after_session_before_dispatch", hooks: (w) => ({ token: async () => { w.current = "B"; w.switched(); } }) },
  { id: "signout_during_getCurrentSession", hooks: (w) => ({ session: async () => { w.current = null; w.switched(); } }) },
  { id: "signout_after_session_before_dispatch", hooks: (w) => ({ token: async () => { w.current = null; w.switched(); } }) },
  { id: "same_account_token_refresh_before_dispatch", hooks: (w) => ({ token: async () => { w.tv += 1; } }) },
  { id: "switch_after_request_dispatched", hooks: (w) => ({ afterDispatch: async () => { w.current = "B"; w.switched(); } }) }
];

async function matrixRow({ kind, variant, scenario, reaction, backendFactory, keyBase }) {
  const M = variant === "baseline" ? "B" : "C";
  const mods = variant === "baseline"
    ? { repoW: loadB(`${F}/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts`), runtimeW: loadB(`${F}/consumer-runtime/consumerMealWriteRuntime.ts`), storeW: loadB(`${F}/consumer-runtime/consumerMealWriteOperationStore.ts`), repoF: loadB(`${F}/meal-identification-finalization/adapters/supabaseConsumerMealIdentificationFinalizationRepository.ts`), svcF: loadB(`${F}/meal-identification-finalization/consumerMealIdentificationFinalizationService.ts`), runtimeF: loadB(`${F}/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts`), storeF: loadB(`${F}/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts`), storage: loadB(`${F}/consumer-auth/storage.ts`) }
    : C;
  const model = createServerModel();
  const log = [];
  const world = { current: "A", tv: 1, hooks: {}, switched: () => {} };
  const backendObject = backendFactory ? backendFactory(model, log, world) : null;
  const backend = backendObject ? backendObject.fetch : makeBackend(model, log, world);
  const candidate = variant === "candidate";
  const registry = candidate ? C.dispatch.createActorBindingRegistry() : null;
  const innerFetch = candidate ? C.dispatch.createActorBindingFetchGuard({ supabaseUrl: SB_URL, inner: backend }) : backend;
  const client = SDK.createClient(SB_URL, ANON_KEY, {
    accessToken: async () => { await world.hooks.token?.(); return world.current ? jwt(world.current, world.tv) : null; },
    global: { fetch: innerFetch }
  });
  const dispatchClient = candidate ? C.dispatch.withActorBinding(client, registry) : client;
  const authPort = { getCurrentSession: async () => { await Promise.resolve(); await world.hooks.session?.(); return { ok: true, value: world.current ? { user: { userId: world.current } } : null }; } };
  const storage = new mods.storage.MemoryConsumerAuthStorage();
  let n = keyBase ?? 5000;        // the PostgreSQL backend shares one database across rows: keys must be unique per row
  const clock = { now: () => NOW };
  let runtime;
  let store;
  if (kind === "normal") {
    const repo = new mods.repoW.SupabaseConsumerMealRecordWriteRepository({ authPort, mealClient: dispatchClient, writeEnabled: true });
    store = new mods.storeW.ConsumerMealWriteOperationStore(storage);
    runtime = new mods.runtimeW.ConsumerMealWriteRuntime({ service: { createCurrentUserMealRecord: (input) => repo.createCurrentUserMealRecord(input) }, operationStore: store, clock, uuidFactory: () => uuid(n++), ...(candidate ? { dispatchBinding: registry } : {}) });
  } else {
    const repo = new mods.repoF.SupabaseConsumerMealIdentificationFinalizationRepository(dispatchClient);
    const service = new mods.svcF.ConsumerMealIdentificationFinalizationService({ authPort, repository: repo });
    store = new mods.storeF.ConsumerMealIdentificationFinalizationOperationStore(storage);
    runtime = new mods.runtimeF.ConsumerMealIdentificationFinalizationRuntime({ service, operationStore: store, clock, uuidFactory: () => uuid(n++), ...(candidate ? { dispatchBinding: registry } : {}) });
  }
  world.switched = () => { if (reaction === "immediate") runtime.setActor(world.current, 2); else world.later = () => runtime.setActor(world.current, 2); };
  await runtime.setActor("A", 1);
  if (kind === "finalize") runtime.beginAnalysisOperation({ actorKey: "A", actorGeneration: 1 }, "analysis-op-1");
  const oneShot = (hooks) => Object.fromEntries(Object.entries(hooks).map(([k, f]) => { let used = false; return [k, async () => { if (used) return; used = true; await f(); }]; }));
  world.hooks = oneShot(scenario.hooks(world));
  const result = await (kind === "normal" ? runtime.submit(ctx("A", 1), baseDraft("matrix")) : runtime.submit(ctx("A", 1), finDraft(undefined, "matrix")));
  const atResponse = { status: result.status, errorCode: result.errorCode, saved: Boolean(result.mealRecordId) };
  if (world.later) await world.later();
  await wait(30);
  const after = runtime.getState();
  const received = log.filter((l) => l.stage === "received");
  const rowOwners = backendObject ? await backendObject.rowOwners() : [...model.rows.values()].map((row) => row.user);
  const entriesA = typeof store.list === "function" ? (await store.list("A")).entries : [];
  const label = (id) => (id === "A" ? "A" : id === "B" ? "B" : id === null ? "anon" : id);
  return {
    kind, variant, scenario: scenario.id, reaction, payloadOwner: "A",
    dispatchIdentity: received.length ? received.map((r) => label(r.sub)) : ["(not dispatched)"], serverRowOwners: rowOwners,
    crossAccountWrite: rowOwners.some((o) => o !== "A"), tagReachedServer: received.some((r) => r.tagReachedServer),
    runtimeAAtResponse: atResponse, actorNow: world.current ?? "none", runtimeStatusAfter: after.status, ledgerA: entriesA.map((e) => ({ state: e.state, attempts: e.attempts, hadUnknown: e.hadUnknown }))
  };
}

async function runMatrix(backendFactory) {
  const rows = [];
  for (const variant of ["baseline", "candidate"]) for (const kind of ["normal", "finalize"]) for (const scenario of matrixScenarios) {
    const reactions = ["no_race_control", "same_account_token_refresh_before_dispatch"].includes(scenario.id) ? ["immediate"] : ["immediate", "lag"];
    for (const reaction of reactions) rows.push(await matrixRow({ kind, variant, scenario, reaction, backendFactory }));
  }
  return rows;
}
const leakNames = (rows, variant) => rows.filter((r) => r.variant === variant && r.crossAccountWrite).map((r) => `${r.kind}/${r.scenario}/${r.reaction}`);
function assertMatrix(rows, label) {
  const baseLeaks = leakNames(rows, "baseline");
  const expected = ["normal/switch_during_getCurrentSession", "normal/switch_after_session_before_dispatch", "finalize/switch_during_getCurrentSession", "finalize/switch_after_session_before_dispatch"].flatMap((p) => [`${p}/immediate`, `${p}/lag`]).sort();
  expect(JSON.stringify(baseLeaks.sort()) === JSON.stringify(expected), `${label}: the committed baseline reproduces exactly the 8 cross-account writes (${baseLeaks.length})`);
  expect(rows.filter((r) => r.variant === "baseline").length === 24 && rows.filter((r) => r.variant === "candidate").length === 24, `${label}: 24-row matrix for both variants`);
  expect(rows.filter((r) => r.variant === "baseline" && r.runtimeAAtResponse.status === "succeeded" && r.crossAccountWrite).length >= 1, `${label}: baseline shows A "saved" while the row belongs to B (lagging runtime actor)`);
  const cand = rows.filter((r) => r.variant === "candidate");
  expect(cand.every((r) => !r.crossAccountWrite), `${label}: candidate: 0 cross-account writes`);
  expect(cand.every((r) => r.dispatchIdentity.every((d) => d === "A" || d === "(not dispatched)")), `${label}: candidate: every dispatch is signed as the owner or not dispatched (no anon, no other account)`);
  expect(cand.every((r) => !r.tagReachedServer), `${label}: candidate: the guard tag never reaches the server`);
  expect(cand.every((r) => !(r.runtimeAAtResponse.status === "succeeded") || r.serverRowOwners.includes("A")), `${label}: candidate: A is never shown "saved" unless the row belongs to A`);
  for (const kind of ["normal", "finalize"]) for (const id of ["no_race_control", "same_account_token_refresh_before_dispatch"]) {
    const row = cand.find((r) => r.kind === kind && r.scenario === id);
    expect(row.serverRowOwners.join() === "A" && row.runtimeAAtResponse.status === "succeeded", `${label}: candidate keeps legitimate save and same-account refresh (${kind}/${id})`);
  }
  const refused = cand.filter((r) => r.dispatchIdentity.join() === "(not dispatched)" && r.scenario !== "signout_during_getCurrentSession");
  expect(refused.length >= 8 && refused.every((r) => r.ledgerA.length === 1 && r.ledgerA[0].hadUnknown === false), `${label}: candidate: guard refusals leave the operation intact with no unknown history added`);
  const afterDispatch = cand.filter((r) => r.scenario === "switch_after_request_dispatched");
  expect(afterDispatch.every((r) => r.serverRowOwners.join() === "A" && r.ledgerA.length === 0), `${label}: candidate: a request already on the wire stays owner-signed and its late response reconciles the owner's ledger`);
}
gate("R-07c", "cross-account dispatch race, real SDK, baseline vs candidate [H-SDK; PostgREST/token/timing modelled]", async () => {
  const rows = await runMatrix(null);
  if (OUT) fs.writeFileSync(path.join(OUT, "R07C-matrix-model.json"), JSON.stringify(rows, null, 2));
  assertMatrix(rows, "model backend");
  globalThis.__tkMatrix = rows;
});

// ============================================================================================ R-08 … R-14
gate("R-08", "24 h / 30 d staleness never deletes [H-FS + pure]", async () => {
  const entry = { opId: uuid(1), kind: "meal_write", ownerActorKey: "A", seq: 1, input: {}, createdAt: "2026-07-19T00:00:00.000Z", expiresAt: "x", state: "unknown", priorState: null, deferred: false, hadUnknown: true, attempts: 1, lastReason: "transport", lastSqlstate: null, lastHttpStatus: null, lastAttemptAt: null, schema: 2 };
  const created = Date.parse(entry.createdAt);
  const stale = (delta) => C.recovery.summarizeMealSaveEntry(entry, { nowMs: created + delta, inFlight: false, describe: () => ({ label: "", mealType: null }) }).stale;
  const day = 24 * 3600e3;
  expect(stale(day - 1) === false && stale(day) === false && stale(day + 1) === true && stale(30 * day) === true, "stale flag boundaries 23:59:59.999 / 24:00:00.000 / +1 ms / 30 d");
  const h = await boot(makeNormal({ behaviors: [{ kind: "net" }, { kind: "net" }] }));
  await submit(h);
  const before = JSON.stringify((await entriesOf(h))[0]);
  const aged = await boot(makeNormal({ storage: reopen(h.storage), model: h.model, clock: { now: () => new Date(NOW.getTime() + 30 * day) } }));
  const restored = (await entriesOf(aged))[0];
  expect(JSON.stringify(restored) === before && aged.client.calls.length === 0, "a 30-day-old operation is byte-identical in storage and nothing is auto-sent");
});

gate("R-09", "real authentication failure [H-FS]", async () => {
  const authFaults = [structured("28000", "AUTHENTICATION_REQUIRED"), structured("PGRST303", "JWT expired", 401), structured("PGRST301", "JWSError", 401)];
  for (const make of bothKinds) for (const fault of authFaults) {
    const behaviours = [{ kind: "fault", code: fault.error.code, message: fault.error.message, status: fault.status }];
    const h = await boot(make({ behaviors: [...behaviours] }));
    const first = await submit(h);
    const [entry] = await entriesOf(h);
    const summary = h.runtime.getState().operations[0];
    expect(entry.state === "blocked_login" && !entry.hadUnknown && /authentication_required$/.test(first.errorCode) && summary.actions.includes("login") && summary.actions.includes("retry") && summary.actions.includes("cancel"), `${make.name}/${fault.error.code}: needs_login, retained under the account`);
    await h.runtime.setActor(null, 2);
    await h.runtime.setActor("A", 3);
    if (make === makeFin) h.runtime.beginAnalysisOperation(actorCtx("A", 3), "analysis-op-3");
    const done = await h.runtime.retry(actorCtx("A", 3), entry.opId);
    // Retry by id = the notice's 重新確認. Normal save reports it in the foreground; a photo operation is
    // resolved beside the bound analysis (never taking it over), so the authority is ledger + server.
    expect((make === makeNormal ? done.status === "succeeded" : done.status !== "succeeded") && (await entriesOf(h)).length === 0 && h.model.rowsOf("A").length === 1 && h.client.calls.at(-1).key === entry.opId, `${make.name}/${fault.error.code}: after re-login as the same account the retry succeeds`);
    const u = await boot(make({ behaviors: [{ kind: "net" }, ...behaviours] }));
    await submit(u);
    await u.runtime.retry(actorCtx());
    const [uEntry] = await entriesOf(u);
    expect(uEntry.state === "unknown" && uEntry.lastReason === "login" && uEntry.hadUnknown, `${make.name}/${fault.error.code}: login failure after unknown stays unknown`);
    const other = await boot(make({ storage: u.storage, model: u.model, world: { user: "B" } }), "B", 2);
    expect(other.runtime.getState().operations.length === 0, `${make.name}/${fault.error.code}: a different account sees nothing`);
  }
  const noSession = await boot(makeNormal({ world: { user: "A" } }));
  noSession.world.user = null;
  await submit(noSession);
  expect(noSession.client.calls.length === 0 && (await entriesOf(noSession))[0]?.state === "blocked_login", "client-side missing session: no request is made, operation retained");
});

gate("R-10", "consent withdrawn / eligibility lost [H-FS]", async () => {
  for (const make of bothKinds) {
    const h = await boot(make({ behaviors: [{ kind: "committedThenNet" }] }));
    await submit(h);                                       // committed, answer lost
    const committedKey = h.client.calls[0].key;
    h.model.eligible.delete("A");
    const denied = await h.runtime.retry(actorCtx());
    const [committedEntry] = await entriesOf(h);
    expect(committedEntry.state === "unknown" && committedEntry.lastReason === "consent" && denied.status === "uncertain", `${make.name}: denial after unknown => unknown/consent (no claim either way)`);
    const text = JSON.stringify(h.runtime.getState().operations[0]);
    expect(!/已儲存|未寫入|尚未儲存/.test(text) && h.runtime.getState().operations[0].copyKey === "unknownConsent", `${make.name}: copy says it cannot be confirmed`);
    // identical denial for an operation that never reached the server
    const never = await boot(make({ behaviors: [{ kind: "net" }], storage: new MapStorage(), model: h.model, start: 3000 }));
    await submit(never);
    const neverDenied = await never.runtime.retry(actorCtx());
    const [neverEntry] = await entriesOf(never);
    expect(neverDenied.status === denied.status && neverDenied.errorCode === denied.errorCode && neverEntry.lastReason === committedEntry.lastReason, `${make.name}: the client cannot tell committed from never-sent (identical denial)`);
    h.model.eligible.add("A");
    const rowsBefore = h.model.rowsOf("A").length;
    const back = await h.runtime.retry(actorCtx());
    const second = await never.runtime.retry(actorCtx());
    expect(back.status === "succeeded" && second.status === "succeeded" && h.model.rowsOf("A").length === rowsBefore + 1 && committedKey, `${make.name}: restored eligibility: committed op returns its original row, never-sent op creates exactly one`);
    // first attempt without history
    const g = await boot(make({}));
    g.model.eligible.delete("A");
    const first = await submit(g);
    const [be] = await entriesOf(g);
    expect(be.state === "blocked_consent" && /eligibility_required$/.test(first.errorCode) && g.runtime.getState().operations[0].actions.includes("consent"), `${make.name}: eligibility token => needs_consent (never login)`);
  }
});

gate("R-11", "permission / server-fault classification with measured payloads and real SDK response shape [H-FS]", async () => {
  const expectedRetryable = ["CAPTURE_PRIVILEGE", "TABLE_MISSING", "CHECK_VIOLATION", "LOCK_TIMEOUT", "STATEMENT_TIMEOUT", "NOT_NULL"];
  for (const make of bothKinds) {
    const key = make === makeNormal ? "v2" : "fin";
    for (const [name, payload] of Object.entries(S1)) {
      const pair = payload[key];
      if (!pair) continue;
      const h = await boot(make({ behaviors: [{ kind: "fault", code: pair[0], message: pair[1] }] }));
      const state = await submit(h);
      const entries = await entriesOf(h);
      const entry = entries[0];
      if (name === "ELIGIBILITY") expect(entry?.state === "blocked_consent", `${make.name}/${name}: consent`);
      else if (name === "AUTH") expect(entry?.state === "blocked_login", `${make.name}/${name}: login`);
      else if (name === "CONFLICT") expect(!entry && /idempotency_conflict$/.test(state.errorCode), `${make.name}/${name}: conflict`);
      else expect(expectedRetryable.includes(name) && entry?.state === "retryable" && state.status === "error" && !/authentication_required$/.test(state.errorCode), `${make.name}/${name}: server fault, retryable, never login copy`);
    }
    for (const status of [400, 403, 404, 409, 500, 503]) {
      const h = await boot(make({ behaviors: [{ kind: "fault", code: "42501", message: "permission denied for table x", status }] }));
      await submit(h);
      expect((await entriesOf(h))[0]?.state === "retryable", `${make.name}: 42501 without the eligibility token is a server fault at HTTP ${status} too`);
    }
    const topLevel401 = await boot(make({ behaviors: [{ kind: "fault", code: "XX000", message: "boom", status: 401 }] }));
    await submit(topLevel401);
    expect((await entriesOf(topLevel401))[0]?.state === "blocked_login", `${make.name}: a structured answer with top-level HTTP 401 is a real authentication failure (status read from the response, not from error)`);
    const login = await boot(make({ behaviors: [{ kind: "fault", code: "PGRST301", message: "JWT invalid", status: 401 }] }));
    await submit(login);
    expect((await entriesOf(login))[0]?.state === "blocked_login", `${make.name}: a structured 401 is a real authentication failure`);
  }
  // legacy harness shape (status inside the error body) must not change the real-shape conclusion
  const legacy = await boot(makeNormal({ behaviors: [] }));
  legacy.client.rpc = async () => ({ data: null, error: { code: "42501", message: "CONSUMER_CORE_ELIGIBILITY_REQUIRED", status: 403 }, status: 403 });
  await submit(legacy);
  expect((await entriesOf(legacy))[0]?.state === "blocked_consent", "eligibility token wins over any status shape");
});

gate("R-12", "faults are never reported as saved [H-FS]", async () => {
  const shapes = [{ kind: "net" }, { kind: "gateway" }, { kind: "empty" }, { kind: "throw" }];
  for (const make of bothKinds) {
    const key = make === makeNormal ? "v2" : "fin";
    const faults = Object.values(S1).map((p) => p[key]).filter(Boolean).filter((p) => p[1] !== "IDEMPOTENCY_KEY_CONFLICT").map((p) => ({ kind: "fault", code: p[0], message: p[1] }));
    for (const behaviour of [...faults, ...shapes]) {
      const h = await boot(make({ behaviors: [behaviour] }));
      const state = await submit(h);
      expect(state.status !== "succeeded" && !state.mealRecordId && h.model.rowsOf("A").length === 0, `${make.name}/${behaviour.kind}${behaviour.code ?? ""}: never saved, 0 rows`);
      if (["net", "gateway", "empty", "throw"].includes(behaviour.kind)) expect((await entriesOf(h))[0]?.state === "unknown", `${make.name}/${behaviour.kind}: unreadable/transport result is unknown for BOTH write paths`);
    }
    const m = await boot(make({ behaviors: [{ kind: "committedThenMalformed" }] }));
    const malformed = await submit(m);
    expect(malformed.status === "uncertain" && m.model.rowsOf("A").length === 1 && (await entriesOf(m)).length === 1, `${make.name}: a committed write with an unreadable body keeps its key (baseline finalization erased it)`);
  }
});

gate("R-13", "payload and key preservation [H-FS]", async () => {
  for (const make of bothKinds) {
    const scenarios = [
      [{ kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }],
      [{ kind: "fault", code: "28000", message: "AUTHENTICATION_REQUIRED" }],
      [{ kind: "fault", code: "42501", message: "CONSUMER_CORE_ELIGIBILITY_REQUIRED" }],
      [{ kind: "net" }]
    ];
    for (const behaviours of scenarios) {
      const label = `${behaviours[0].kind}${behaviours[0].code ?? ""}`;
      const h = await boot(make({ behaviors: [...behaviours] }));
      await submit(h);
      const [entry] = await entriesOf(h);
      const stored = JSON.stringify(entry.input);
      await h.runtime.retry(actorCtx());
      const [after] = await entriesOf(h).then((l) => (l.length ? l : [null]));
      const sameStored = after === null || JSON.stringify(after.input) === stored;
      expect(sameStored && h.client.calls.length >= 2 && h.client.calls[1].key === h.client.calls[0].key && JSON.stringify(h.client.calls[1].args) === JSON.stringify(h.client.calls[0].args), `${make.name}/${label}: stored input and retry arguments are byte-identical`);
    }
  }
});

gate("R-14", "no duplicate records, and the stated limit [H-FS]", async () => {
  const h = await boot(makeNormal({ behaviors: [{ kind: "committedThenNet" }, { kind: "committedThenNet" }, { kind: "committedThenNet" }] }));
  await submit(h, "A", 1, "meal 1");
  await h.runtime.setActor("A", 2);                                      // generation bump
  await h.runtime.defer(actorCtx("A", 2));
  await submit(h, "A", 2, "meal 2");
  await h.runtime.setActor(null, 3);                                     // sign-out
  await h.runtime.setActor("A", 4);
  await h.runtime.defer(actorCtx("A", 4));
  await submit(h, "A", 4, "meal 3");
  await h.runtime.setActor("B", 5); h.world.user = "B";                 // account switch away and back
  await h.runtime.setActor("A", 6); h.world.user = "A";
  const restart = await boot(makeNormal({ storage: reopen(h.storage), model: h.model, start: 6000 }), "A", 7);
  for (const e of await entriesOf(restart)) await restart.runtime.retry(actorCtx("A", 7), e.opId);
  expect(h.model.rowsOf("A").length === 3 && (await entriesOf(restart)).length === 0, "3 intended meals across bump / sign-out / switch / restart => exactly 3 rows");
  // stated limit: re-entering the same meal is a NEW operation and the server dedupes by key only
  const again = await submit(restart, "A", 7, "meal 1");
  expect(again.status === "succeeded" && h.model.rowsOf("A").length === 4, "limit (documented): manually re-entering the same meal creates another row");
});

// ============================================================================================ ledger gates (H-CRASH)
class Crash extends Error {}
function mulberry(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
class CrashStorage {
  constructor(map, rnd) { this.m = map; this.n = 0; this.crashAt = null; this.mode = "before"; this.dead = false; this.rnd = rnd; this.failSet = false; this.events = []; this.corruptReadBack = false; }
  async _op(kind, key, fn) {
    if (this.dead) throw new Crash("dead");
    this.n++;
    await tick(this.rnd ? Math.floor(this.rnd() * 4) : 0);
    if (this.dead) throw new Crash("dead");
    if (this.crashAt === this.n) { this.dead = true; if (this.mode === "after") fn(); throw new Crash(`crash@${this.n}`); }
    this.events.push(`${kind}:${key}`);
    return fn();
  }
  getItem(k) { return this._op("get", k, () => { const v = this.m.get(k) ?? null; return this.corruptReadBack && v !== null && k.includes(".slot.") ? v + " " : v; }); }
  setItem(k, v) { return this._op("set", k, () => { if (this.failSet) throw new Error("simulated disk full"); this.m.set(k, v); }); }
  removeItem(k) { return this._op("remove", k, () => { this.m.delete(k); }); }
}
const noValidate = () => {};
const newLedger = (storage, extra = {}) => new C.ledger.MealSaveOperationLedger({ storage, kind: "meal_write", keyPrefix: "tk.test.pending", validateInput: noValidate, ...extra });
const seed = (i, extra = {}) => ({ opId: uuid(7000 + i), input: { title: `meal ${i}` }, createdAt: NOW.toISOString(), expiresAt: NOW.toISOString(), ...extra });
const legacyRecord = (i = 1, created = NOW) => ({ idempotencyKey: uuid(7000 + i), input: { title: `legacy ${i}` }, createdAt: created.toISOString(), expiresAt: new Date(created.getTime() + 24 * 3600e3).toISOString() });

// Known-bad control: the R1 design (one key per operation + an index key). It is kept ONLY to prove the gates can fail.
class IndexLedger {
  constructor(storage) { this.s = storage; }
  idx(a) { return `tk.bad.index.${a}`; }
  ek(a, id) { return `tk.bad.op.${a}.${id}`; }
  async ids(a) { const raw = await this.s.getItem(this.idx(a)); if (raw === null) return []; try { const j = JSON.parse(raw); return Array.isArray(j.ids) ? j.ids : []; } catch { return []; } }
  async add(a, o) { const ids = await this.ids(a); await this.s.setItem(this.ek(a, o.opId), JSON.stringify({ ...o, state: "new" })); await this.s.setItem(this.idx(a), JSON.stringify({ ids: [...ids, o.opId] })); return { ok: true }; }
  async markInflight(a, id) { const e = JSON.parse(await this.s.getItem(this.ek(a, id))); await this.s.setItem(this.ek(a, id), JSON.stringify({ ...e, state: "inflight" })); return { ok: true }; }
  async list(a) { const out = []; for (const id of await this.ids(a)) { const raw = await this.s.getItem(this.ek(a, id)); if (raw) out.push(JSON.parse(raw)); } return { entries: out }; }
  async remove(a, id) { const ids = await this.ids(a); await this.s.setItem(this.idx(a), JSON.stringify({ ids: ids.filter((i) => i !== id) })); await this.s.removeItem(this.ek(a, id)); return { ok: true }; }
}

async function crashSweep(scenario, { v1 = null, makeLedger = (s) => newLedger(s) } = {}) {
  const dry = new Map(); if (v1) dry.set(`tk.test.pending.v1.A`, JSON.stringify(v1));
  const ds = new CrashStorage(dry); await scenario(makeLedger(ds), { inflight: new Set(), removeStarted: new Set() });
  const total = ds.n; const bad = [];
  for (const mode of ["before", "after"]) for (let k = 1; k <= total; k++) {
    const m = new Map(); if (v1) m.set(`tk.test.pending.v1.A`, JSON.stringify(v1));
    const st = new CrashStorage(m); st.crashAt = k; st.mode = mode;
    const ev = { inflight: new Set(), removeStarted: new Set() };
    try { await scenario(makeLedger(st), ev); } catch (e) { if (!(e instanceof Crash)) throw e; }
    const restart = makeLedger(new CrashStorage(m));
    const listing = await restart.list("A");
    const ids = listing.entries.map((e) => e.opId);
    const required = [...ev.inflight].filter((i) => !ev.removeStarted.has(i));
    const lost = required.filter((i) => !ids.includes(i));
    const v1Lost = v1 && !ids.includes(v1.idempotencyKey) && !m.has(`tk.test.pending.v1.A`) && !ev.removeStarted.has(v1.idempotencyKey);
    const dup = ids.length !== new Set(ids).size;
    const notUnknown = listing.entries.filter((e) => ev.inflight.has(e.opId) && !ev.removeStarted.has(e.opId) && !e.hadUnknown && e.state === "inflight");
    if (lost.length || v1Lost || dup || notUnknown.length) bad.push({ mode, k, lost, v1Lost: !!v1Lost, dup });
  }
  return { total, cases: total * 2, bad };
}
const scenarioJournal = async (l, ev) => {
  const a = seed(1), b = seed(2);
  const ra = await l.add("A", a, { inflight: true }); if (!ra.ok) return; ev.inflight.add(a.opId);
  if (!(await l.update("A", a.opId, (e) => ({ ...e, state: "unknown", hadUnknown: true, priorState: null }))).ok) return;
  const rb = await l.add("A", b, { inflight: true }); if (!rb.ok) return; ev.inflight.add(b.opId);
  ev.removeStarted.add(b.opId); await l.remove("A", b.opId);
};
const scenarioRetry = async (l, ev) => {
  const a = seed(3);
  const ra = await l.add("A", a, { inflight: true }); if (!ra.ok) return; ev.inflight.add(a.opId);
  if (!(await l.update("A", a.opId, (e) => ({ ...e, state: "unknown", hadUnknown: true, priorState: null }))).ok) return;
  if (!(await l.markInflight("A", a.opId)).ok) return; ev.removeStarted.add(a.opId); await l.remove("A", a.opId);   // server committed + success; local removal may crash
};
gate("R-15", "legacy v1 -> v2 slot migration [H-CRASH, real stores/ledger]", async () => {
  const storageOf = () => new C.storage.MemoryConsumerAuthStorage();
  const makeInput = () => ({ ...C.mapper.mapConsumerAnalysisMealWrite({ ...baseDraft("legacy"), timezone: "Asia/Taipei", submittedAt: NOW }), idempotencyKey: uuid(9100) });
  for (const [label, created] of [["valid", NOW], ["expired (30 d)", new Date(NOW.getTime() - 30 * 24 * 3600e3)]]) {
    const storage = storageOf();
    const store = new C.storeW.ConsumerMealWriteOperationStore(storage);
    await storage.setItem(store.legacyStorageKey("A"), JSON.stringify({ idempotencyKey: uuid(9100), input: makeInput(), createdAt: created.toISOString(), expiresAt: new Date(created.getTime() + 24 * 3600e3).toISOString() }));
    const listing = await store.list("A");
    expect(listing.entries.length === 1 && listing.entries[0].opId === uuid(9100) && listing.entries[0].state === "unknown" && listing.entries[0].hadUnknown && listing.entries[0].createdAt === created.toISOString(), `${label} v1 record migrates as a possibly-sent unknown operation (not deleted by age)`);
    expect((await storage.getItem(store.legacyStorageKey("A"))) === null && (await storage.getItem("tastkind.consumerMealWrite.pending.v2.slot.A.0")) !== null, `${label}: slot verified before the legacy key was dropped`);
  }
  // unreadable v1: quarantined, never deleted, never sent
  const s1 = storageOf(); const st1 = new C.storeW.ConsumerMealWriteOperationStore(s1);
  await s1.setItem(st1.legacyStorageKey("A"), "{not json");
  const l1 = await st1.list("A");
  expect(l1.entries.length === 0 && (await s1.getItem("tastkind.consumerMealWrite.pending.v1.quarantine.A.0")) === "{not json" && (await s1.getItem(st1.legacyStorageKey("A"))) === null, "unreadable v1 is quarantined byte-for-byte");
  // v1 + slot both present (crash after the slot write, before the v1 removal)
  const mBoth = new Map(); const firstBoot = newLedger(new CrashStorage(mBoth));
  await firstBoot.add("A", seed(1), { inflight: true });
  mBoth.set("tk.test.pending.v1.A", JSON.stringify(legacyRecord(1)));       // crash after the slot write, before the v1 removal
  const secondBoot = newLedger(new CrashStorage(mBoth));                     // a restart = a new storage object = a new boot
  const dedup = await secondBoot.list("A");
  expect(dedup.entries.length === 1 && dedup.entries[0].opId === uuid(7001) && !mBoth.has("tk.test.pending.v1.A"), "v1 + slot for the same operation: exactly one entry (no duplicate, no new key), v1 dropped");
  // slots full: v1 stays, nothing is lost
  const ml = new Map(); const crashFull = new CrashStorage(ml); const full = newLedger(crashFull, { slots: 2 });
  await full.list("A"); await full.add("A", seed(1)); await full.add("A", seed(2));
  ml.set("tk.test.pending.v1.A", JSON.stringify(legacyRecord(9)));
  const fullAgain = newLedger(new CrashStorage(ml), { slots: 2 }); const bootFull = await fullAgain.list("A");
  expect(bootFull.entries.length === 2 && ml.has("tk.test.pending.v1.A"), "slots full: the legacy record is kept (not lost) and retried next boot");
  // unsupported newer schema is preserved, counted, never loaded
  const ms = new Map(); const sl = newLedger(new CrashStorage(ms));
  ms.set("tk.test.pending.v2.slot.A.0", JSON.stringify({ schema: 3, opId: "x", ownerActorKey: "A" }));
  const ls = await sl.list("A");
  expect(ls.entries.length === 0 && ls.unusable === 1 && ms.get("tk.test.pending.v2.slot.A.0").includes('"schema":3'), "negative: a newer-schema slot is preserved and counted as occupied");
  // exhaustive crash points through the migration (and the first journal write after it)
  const sweep = await crashSweep(async (l) => { await l.list("A"); const x = seed(9); await l.add("A", x, { inflight: true }); }, { v1: legacyRecord(1) });
  expect(sweep.bad.length === 0 && sweep.cases >= 20, `migration: ${sweep.cases} crash cases (before/after every storage call) never lose or duplicate the legacy operation`);
  // mutation-sensitivity control: removing v1 BEFORE the slot is verified loses the operation at some crash point
  const badSweep = await crashSweep(async (l) => { await l.list("A"); }, { v1: legacyRecord(1), makeLedger: (s) => {
    const l = newLedger(s); const original = l.migrateLegacy.bind(l);
    l.migrateLegacy = async (actor) => { const raw = await s.getItem(l.legacyKey(actor)); if (raw === null) return; await s.removeItem(l.legacyKey(actor)); await original(actor); };
    return l; } });
  expect(badSweep.bad.length > 0, "known-bad control: deleting v1 before the slot is verified IS detected");
});

gate("R-16", "crash recovery, persist-before-send, concurrency [H-CRASH exhaustive + seeded fuzz, real ledger]", async () => {
  for (const scenario of [scenarioJournal, scenarioRetry]) {
    const sweep = await crashSweep(scenario);
    expect(sweep.bad.length === 0, `exhaustive crash sweep (${sweep.cases} cases) of ${scenario.name}: no dispatched unresolved operation lost, in-flight => unknown`);
  }
  // seeded fuzz: concurrent tasks, random crash point/mode, 6 slots
  const runFuzz = async (make, { seeds, corrupt = false, twoInstances = false, shared = true }) => {
    let violations = 0; let crashes = 0;
    for (let seed0 = 1; seed0 <= seeds; seed0++) {
      const rnd = mulberry(seed0 * 7919); const m = new Map(); const st = new CrashStorage(m, rnd);
      const scopeA = {}; const scopeB = {};
      const mk = (n) => make(st, shared ? undefined : (n ? scopeB : scopeA));
      const ledgers = [mk(0), twoInstances ? mk(1) : null];
      const pick = () => ledgers[twoInstances && rnd() < 0.5 ? 1 : 0];
      st.crashAt = 1 + Math.floor(rnd() * 140); st.mode = rnd() < 0.5 ? "before" : "after";
      const ev = { inflight: new Set(), removeStarted: new Set() };
      await Promise.all(Array.from({ length: 5 }, (_, i) => (async () => {
        await tick(Math.floor(rnd() * 10)); const o = seed(100 + i); const l = pick();
        const r = await l.add("A", o, { inflight: true }); if (!r.ok) return; ev.inflight.add(o.opId);
        await tick(Math.floor(rnd() * 6));
        if (rnd() < 0.5) { ev.removeStarted.add(o.opId); await pick().remove("A", o.opId); }
      })().catch((e) => { if (!(e instanceof Crash)) throw e; })));
      if (st.dead) crashes++;
      if (corrupt) m.set("tk.bad.index.A", "{not json");
      const restart = make(new CrashStorage(m));
      const listing = await restart.list("A");
      const ids = listing.entries.map((e) => e.opId);
      const lost = [...ev.inflight].filter((i) => !ev.removeStarted.has(i) && !ids.includes(i));
      if (lost.length || ids.length !== new Set(ids).size || listing.entries.some((e) => e.ownerActorKey && e.ownerActorKey !== "A")) violations++;
    }
    return { violations, crashes };
  };
  const slotMake = (s, scope) => newLedger(s, { slots: 6, ...(scope ? { lockScope: scope } : {}) });
  const good1 = await runFuzz(slotMake, { seeds: 150 });
  const good2 = await runFuzz(slotMake, { seeds: 150, twoInstances: true, shared: true });
  expect(good1.violations === 0 && good2.violations === 0 && good1.crashes > 30, `fuzz (real ledger): 0 violations over ${good1.crashes + good2.crashes} injected crashes (one instance, two instances sharing the lock)`);
  const badMake = (s) => new IndexLedger(s);
  const badIdx = await runFuzz(badMake, { seeds: 60, corrupt: true });
  expect(badIdx.violations > 0, `known-bad control (index design) loses unresolved operations when its index is corrupt (${badIdx.violations}/60)`);
  // dispatch must follow ONE verified durable write: spy on the runtime
  const events = [];
  class Spy extends C.storage.MemoryConsumerAuthStorage { async setItem(k, v) { events.push("persist"); return super.setItem(k, v); } async getItem(k) { return super.getItem(k); } }
  const h = makeNormal({ storage: new Spy() });
  const orig = h.client.rpc.bind(h.client);
  h.client.rpc = async (fn, args) => { events.push("dispatch"); return orig(fn, args); };
  await boot(h);
  await submit(h);
  expect(events.join(",") === "persist,dispatch", "exactly one durable verified write precedes the first dispatch");
});

gate("R-17", "capacity, storage failure, size [H-FS + H-CRASH]", async () => {
  // 20 unknown operations occupy all slots; the 21st is refused with 0 RPC; nothing is evicted
  const behaviours = Array.from({ length: 20 }, () => ({ kind: "net" }));
  const h = await boot(makeNormal({ behaviors: behaviours }));
  for (let i = 0; i < 20; i++) { await submit(h, "A", 1, `m${i}`); await h.runtime.defer(actorCtx()); }
  const list = await h.store.list("A");
  expect(list.entries.length === 20 && list.free === 0 && list.entries.every((e) => e.state === "unknown" && e.hadUnknown), "20 unknown operations fill the 20 slots");
  const before = h.client.calls.length;
  const refused = await submit(h, "A", 1, "overflow");
  expect(refused.status === "error" && refused.errorCode === "capacity_exhausted" && h.client.calls.length === before && (await h.store.list("A")).entries.length === 20, "21st save is refused with 0 RPC and nothing is evicted");
  const keys = list.entries.map((e) => e.opId);
  const resolved = await h.runtime.retry(actorCtx(), keys[3]);
  expect(resolved.status === "succeeded" && (await h.store.list("A")).entries.length === 19, "a trusted success frees exactly that slot");
  const after = await submit(h, "A", 1, "fits now");
  expect(after.status === "succeeded" || after.status === "uncertain", "after one resolution a new save is accepted again");
  // both kinds: the refusal stays visible (capacity_exhausted) until a slot is free again, and ends as soon as a
  // NON-foreground slot is freed (cancel of a never-unknown draft); a late success of a held op frees it too.
  for (const make of bothKinds) {
    const k = make({ behaviors: [{ kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }, ...Array.from({ length: 19 }, () => ({ kind: "net" }))] });
    await boot(k);
    let op = 1;
    const next = async () => { if (k.kind === "finalization") k.runtime.beginAnalysisOperation(actorCtx(), `analysis-op-cap-${op++}`); };
    await submit(k, "A", 1, "draft");
    for (let i = 0; i < 19; i++) { await next(); await submit(k, "A", 1, `u${i}`); await k.runtime.defer(actorCtx()); }
    await next();
    const calls = k.client.calls.length;
    const full = await submit(k, "A", 1, "overflow");
    expect(full.status === "error" && full.errorCode === "capacity_exhausted" && k.client.calls.length === calls && (await entriesOf(k)).length === 20, `${k.kind}: the 21st save is refused (capacity_exhausted), 0 RPC, nothing evicted`);
    const draft = (await entriesOf(k)).find((e) => e.state === "retryable");
    await k.runtime.cancel(actorCtx(), draft.opId);
    expect(k.runtime.getState().errorCode !== "capacity_exhausted" && (await entriesOf(k)).length === 19 && (await entriesOf(k)).every((e) => e.hadUnknown), `${k.kind}: freeing a non-foreground slot ends the capacity refusal; every unknown operation is kept`);
    await next();
    const accepted = await submit(k, "A", 1, "fits");
    expect(k.client.calls.length === calls + 1 && accepted.errorCode !== "capacity_exhausted", `${k.kind}: a new save is accepted (and sent) once a slot is free`);
  }
  // Re-confirming a set-aside operation (the usual capacity exit) never takes over the current foreground.
  {
    const n = makeNormal({ behaviors: [{ kind: "net" }, { kind: "net" }, { kind: "pass" }] });
    await boot(n);
    await submit(n, "A", 1, "Y"); await n.runtime.defer(actorCtx());
    await submit(n, "A", 1, "X");
    const y = (await entriesOf(n)).find((e) => e.deferred);
    const resolvedY = await n.runtime.retry(actorCtx(), y.opId);
    const calls = n.client.calls.length;
    const blocked = await submit(n, "A", 1, "Z");
    expect((await entriesOf(n)).length === 1 && blocked.status === "uncertain" && n.client.calls.length === calls && resolvedY.status === "uncertain", "normal: re-confirming a set-aside operation keeps the other unknown operation's new-save block (0 RPC)");
  }
  {
    const f = makeFin({ behaviors: [{ kind: "net" }, { kind: "pass" }, { kind: "pass" }] });
    await boot(f);
    await submit(f, "A", 1, "Y"); await f.runtime.defer(actorCtx());
    expect(f.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-current") === true, "finalization: a set-aside operation does not block the next analysis");
    const [y] = await entriesOf(f);
    const before = f.runtime.getState();
    await f.runtime.retry(actorCtx(), y.opId);
    const after = f.runtime.getState();
    expect(after.status === before.status && after.mealRecordId === null && after.finalizationDataRevision === before.finalizationDataRevision + 1 && (await entriesOf(f)).length === 0, "finalization: re-confirming a set-aside operation saves it without taking over (or locking) the current analysis");
    const own = await submit(f, "A", 1, "current photo");
    expect(own.status === "succeeded" && f.client.calls.length === 3, "finalization: the current photo is still saved afterwards");
  }
  // drafts occupy slots too and are freed by their own cancel
  const d = await boot(makeNormal({ behaviors: [{ kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }] }));
  await submit(d);
  const [draft] = await entriesOf(d);
  expect(draft.state === "retryable", "a rolled-back draft occupies a slot");
  await d.runtime.cancel(actorCtx(), draft.opId);
  expect((await entriesOf(d)).length === 0, "cancel frees the draft's slot");
  // storage failure: nothing is sent
  const failing = new C.storage.MemoryConsumerAuthStorage();
  const f = makeNormal({ storage: failing });
  await boot(f);
  failing.setItem = async () => { throw new Error("disk full"); };
  const failed = await submit(f);
  expect(failed.status === "error" && failed.errorCode === "storage_unavailable" && f.client.calls.length === 0, "local write failure: not sent, honest error");
  const g = makeNormal({ storage: new C.storage.MemoryConsumerAuthStorage() });
  await boot(g);
  const orig = g.storage.getItem.bind(g.storage);
  g.storage.getItem = async (k) => (k.includes(".slot.") ? null : orig(k));      // the write is never observable => not durable
  const mismatch = await submit(g);
  expect(mismatch.errorCode === "storage_unavailable" && g.client.calls.length === 0, "negative: a write that does not read back verified is not trusted and nothing is sent");
  // size: 256 KiB per entry
  const big = newLedger(new CrashStorage(new Map()));
  const tooBig = await big.add("A", seed(1, { input: { blob: "x".repeat(300 * 1024) } }));
  const fitsAt = await big.add("A", seed(2, { input: { blob: "x".repeat(200 * 1024) } }));
  expect(tooBig.ok === false && tooBig.reason === "too_large" && fitsAt.ok, "entries above 256 KiB are refused before persisting; 200 KiB fits");
});

gate("R-18", "local reference code and privacy [H-FS + STATIC]", async () => {
  const h = await boot(makeNormal({ behaviors: [{ kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }, { kind: "net" }] }));
  await submit(h, "A", 1, "秘密餐點名稱 private-meal");
  const state = h.runtime.getState();
  const op = state.operations[0];
  expect(/^TK-[NF]-[A-Z]{2}-([0-9A-Z]{5}|NET|DLN|—)-[0-9a-f]{8}$/.test(op.reference), `reference code format (${op.reference})`);
  const [entry] = await entriesOf(h);
  expect(op.reference.endsWith(entry.opId.replace(/-/g, "").slice(0, 8)) && op.reference.includes("55P03"), "reference carries the SQLSTATE and 8 hex of the random operation id only");
  for (const secret of ["秘密餐點名稱", "private-meal", "A", "Bearer", "Authorization", "token"]) {
    if (secret.length === 1) continue;
    expect(!op.reference.includes(secret), `reference does not contain ${secret}`);
  }
  const net = await boot(makeNormal({ behaviors: [{ kind: "net" }] })); await submit(net);
  expect(/^TK-N-UK-NET-[0-9a-f]{8}$/.test(net.runtime.getState().operations[0].reference), "network failure => ...-NET-...");
  const dl = await boot(makeNormal({ behaviors: [{ kind: "hang" }], localWait: { race: (p) => Promise.race([p.then((value) => ({ timedOut: false, value })), wait(10).then(() => ({ timedOut: true }))]) } })); await submit(dl);
  expect(/^TK-N-UK-DLN-[0-9a-f]{8}$/.test(dl.runtime.getState().operations[0].reference), "local wait elapsed => ...-DLN-...");
  const ledgerKeys = Object.keys(entry).sort().join(",");
  expect(ledgerKeys === ["schema", "opId", "kind", "ownerActorKey", "seq", "input", "createdAt", "expiresAt", "state", "priorState", "deferred", "hadUnknown", "attempts", "lastReason", "lastSqlstate", "lastHttpStatus", "lastAttemptAt"].sort().join(","), "ledger diagnostics are limited to state/attempt metadata (no message, token or header fields)");
  const recoverySource = readText(`${F}/consumer-runtime/mealSaveRecovery.ts`);
  expect(!/import .* from "@supabase|Authorization|console\.(log|info|warn|error)/.test(recoverySource), "STATIC: the recovery policy imports no SDK, handles no Authorization and logs nothing");
});

gate("R-19", "暫不處理 [H-FS]", async () => {
  for (const make of bothKinds) {
    const h = await boot(make({ behaviors: [{ kind: "net" }] }));
    await submit(h);
    const [before] = await entriesOf(h);
    await h.runtime.defer(actorCtx());
    const [after] = await entriesOf(h);
    expect(JSON.stringify({ ...after, deferred: false }) === JSON.stringify(before) && after.deferred === true, `${make.name}: defer changes only the deferred flag (key, payload, state, history untouched)`);
    if (make === makeNormal) expect(h.runtime.getState().status === "idle" && h.client.calls.length === 1, "normal: foreground released, nothing cancelled or re-sent");
    else expect(h.runtime.getState().status === "uncertain" && h.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2") && h.runtime.getState().status === "idle" && (await entriesOf(h)).length === 1, "finalize: the bound analysis stays locked/uncertain, another analysis may start, the operation stays in its slot");
    // in-flight request is not cancelled by defer
    const gt = deferred();
    const g = await boot(make({ behaviors: [{ kind: "gate", gate: gt }] }));
    const pendingSubmit = submit(g);
    await tick(10);
    await g.runtime.defer(actorCtx());
    gt.resolve();
    await pendingSubmit;
    await wait(30);
    expect(g.model.rowsOf("A").length === 1 && (await entriesOf(g)).length === 0, `${make.name}: defer during an in-flight request does not cancel it; its success still reconciles the ledger`);
    // later retry uses the original key
    const keyBefore = h.client.calls[0].key;
    await h.runtime.retry(actorCtx(), before.opId);
    expect(h.client.calls[1].key === keyBefore, `${make.name}: retry after defer uses the original key`);
  }
  const m = await boot(makeNormal({ behaviors: [{ kind: "net" }] }));
  await submit(m, "A", 1, "first");
  await m.runtime.defer(actorCtx());
  const other = await submit(m, "A", 1, "second meal");
  expect(other.status === "succeeded", "other meals can be recorded after defer");
});

gate("R-20", "recovery actions are bound to the current actor and generation [H-FS + STATIC]", async () => {
  const h = await boot(makeNormal({ behaviors: [{ kind: "net" }] }));
  await submit(h);
  const [entry] = await entriesOf(h);
  const calls = h.client.calls.length;
  await h.runtime.retry(actorCtx("B", 1), entry.opId);
  await h.runtime.retry(actorCtx("A", 9), entry.opId);
  await h.runtime.defer(actorCtx("B", 1), entry.opId);
  await h.runtime.cancel(actorCtx("A", 9), entry.opId);
  expect(h.client.calls.length === calls && (await entriesOf(h))[0].deferred === false, "wrong actor / stale generation: 0 RPC and nothing changed");
  const provider = readText(`${F}/consumer-runtime/ConsumerRuntimeProvider.tsx`);
  expect(/retryMealSaveOperation:[\s\S]*actorKey: state\.actorKey, actorGeneration: state\.actorGeneration/.test(provider) && /deferMealSaveOperation/.test(provider) && /cancelMealSaveOperation/.test(provider), "STATIC: the Provider binds all three actions to state.actorKey / state.actorGeneration");
});

gate("R-21", "cancel only without unknown history [H-FS]", async () => {
  const h = await boot(makeNormal({ behaviors: [{ kind: "net" }] }));
  await submit(h);
  const [u] = await entriesOf(h);
  await h.runtime.cancel(actorCtx(), u.opId);
  expect((await entriesOf(h)).length === 1, "an unknown operation cannot be cancelled");
  for (const [label, behaviours] of [["rolled back", [{ kind: "fault", code: "55P03", message: "canceling statement due to lock timeout" }]], ["needs login", [{ kind: "fault", code: "28000", message: "AUTHENTICATION_REQUIRED" }]], ["needs consent", [{ kind: "fault", code: "42501", message: "CONSUMER_CORE_ELIGIBILITY_REQUIRED" }]]]) {
    const d = await boot(makeNormal({ behaviors: behaviours }));
    await submit(d);
    const [draft] = await entriesOf(d);
    await d.runtime.cancel(actorCtx(), draft.opId);
    expect((await entriesOf(d)).length === 0, `${label}: a never-unknown draft can be cancelled`);
  }
  const gt = deferred();
  const live = await boot(makeNormal({ behaviors: [{ kind: "gate", gate: gt }] }));
  const p = submit(live);
  await tick(10);
  const [inflight] = await entriesOf(live);
  await live.runtime.cancel(actorCtx(), inflight.opId);
  expect((await entriesOf(live)).length === 1, "an in-flight operation cannot be cancelled");
  gt.resolve(); await p;
});

gate("R-22", "no automatic retry [H-FS + STATIC]", async () => {
  const h = await boot(makeNormal({ behaviors: [{ kind: "net" }, { kind: "fault", code: "28000", message: "AUTHENTICATION_REQUIRED" }, { kind: "fault", code: "55P03", message: "x" }] }));
  await submit(h);
  const calls = h.client.calls.length;
  await h.runtime.setActor("A", 2); await h.runtime.setActor(null, 3); await h.runtime.setActor("A", 4);
  await wait(80);
  expect(h.client.calls.length === calls, "no RPC after failures, restore, sign-out/in or time passing without a user action");
  for (const rel of ["consumerMealWriteRuntime.ts", "consumerMealIdentificationFinalizationRuntime.ts", "consumerMealWriteOperationStore.ts", "consumerMealIdentificationFinalizationOperationStore.ts", "mealSaveOperationLedger.ts"]) {
    expect(!/setInterval|setTimeout|background|automaticRetry/i.test(readText(`${F}/consumer-runtime/${rel}`)), `STATIC: ${rel} contains no timer, background or automatic-retry text`);
  }
  expect(/setTimeout/.test(readText(`${F}/consumer-runtime/mealSaveRecovery.ts`)), "the only timer lives in mealSaveRecovery.ts (the local wait)");
  const notice = readText(`${F}/consumer-runtime/PendingMealSaveNotice.tsx`);
  expect(!/useEffect|setInterval|setTimeout|AppState/.test(notice), "STATIC: the notice has no effect, timer or app-state hook that could trigger a send");
});

gate("R-23", "30 s local wait semantics [H-FS + pure]", async () => {
  const handles = [];
  const wait30 = C.recovery.createLocalWait(30000, { set: (cb, ms) => { handles.push({ cb, ms }); return handles.length - 1; }, clear: () => {} });
  const never = new Promise(() => {});
  const racePromise = wait30.race(never);
  expect(handles[0].ms === 30000, "the local wait is 30 s");
  handles[0].cb();
  expect((await racePromise).timedOut === true, "expiry resolves as timedOut (stop waiting)");
  const g = deferred();
  const late = wait30.race(g.promise);
  g.resolve("answer");
  expect((await late).timedOut === false, "a request that answers first is not timed out");
  const text = JSON.stringify(C.zh.zhTW.mobile.pendingMealSave.unknown);
  expect(!/取消|未寫入|沒有寫入|不會寫入/.test(text), "copy for an elapsed wait never claims cancellation or non-write");
  const gate2 = deferred();
  const elapsed = { race: (p) => Promise.race([p.then((value) => ({ timedOut: false, value })), wait(10).then(() => ({ timedOut: true }))]) };
  const h = await boot(makeNormal({ behaviors: [{ kind: "gate", gate: gate2 }], localWait: elapsed }));
  await submit(h);
  gate2.resolve();
  await wait(30);
  expect(h.model.rowsOf("A").length === 1, "the request was NOT cancelled by the local wait: it still committed");
  const again = await boot(makeNormal({ behaviors: [{ kind: "hang" }, { kind: "gate", gate: deferred() }], localWait: elapsed }));
  await submit(again);
  again.world.user = "A";
  const concurrent = await Promise.all([again.runtime.retry(actorCtx()), again.runtime.retry(actorCtx())]);
  expect(again.client.calls.length === 2 && concurrent[0].status === concurrent[1].status, "after the wait elapsed a manual retry may start a new same-key attempt (and repeated taps join it)");
});

gate("R-24", "entry size [H-CRASH + real validator]", async () => {
  const item = () => ({ restaurantId: "店".repeat(120), branchId: "分".repeat(120), menuId: "菜".repeat(120), menuItemId: "品".repeat(120), displayName: "餐".repeat(160), userEnteredName: "輸".repeat(160), aiDetectedName: "識".repeat(160), normalizedName: "正".repeat(160), portion: "份".repeat(120), nutrition: { calories: 1000, protein: 10, carbohydrates: 10, fat: 10, fiber: 1 }, nutritionSource: "manual", sourceEntityVersion: "版".repeat(120), confidenceScore: 0.9, consumedRatio: 1 });
  const input = { idempotencyKey: uuid(9200), mealType: "lunch", occurredAt: NOW.toISOString(), mealDate: "2026-07-20", timezone: "Asia/Taipei", title: "題".repeat(140), note: "註".repeat(1000), source: "manual", items: Array.from({ length: 20 }, item) };
  const storage = new C.storage.MemoryConsumerAuthStorage();
  const store = new C.storeW.ConsumerMealWriteOperationStore(storage);
  const entry = await store.save("A", C.storeW.createConsumerMealWritePendingOperation(input, NOW));
  const bytes = C.recovery.utf8ByteLength(JSON.stringify(entry));
  expect(bytes > 50_000 && bytes < 256 * 1024, `maximal valid normal-save entry accepted by the real validator and under 256 KiB (${bytes} bytes)`);
  const fstore = new C.storeF.ConsumerMealIdentificationFinalizationOperationStore(new C.storage.MemoryConsumerAuthStorage());
  const finInput = (size) => ({ clientRequestId: uuid(9201), mealType: "lunch", occurredAt: NOW.toISOString(), mealDate: "2026-07-20", timezone: "Asia/Taipei", finalization: { ...finalization(), mealWrite: { ...finalization().mealWrite, mealName: "x".repeat(size) } } });
  let big = null; try { await fstore.save("A", C.storeF.createConsumerMealIdentificationFinalizationPendingOperation(finInput(300 * 1024), NOW)); } catch (e) { big = e; }
  expect(big && big.reason === "too_large", "an oversized finalization entry is refused before persisting");
  const ok = await fstore.save("A", C.storeF.createConsumerMealIdentificationFinalizationPendingOperation(finInput(100 * 1024), NOW));
  expect(ok.opId === uuid(9201), "a 100 KiB finalization entry is accepted");
});

gate("R-25", "photo finalize specifics [H-FS + STATIC]", async () => {
  const h = await boot(makeFin({ behaviors: [{ kind: "net" }] }));
  await h.runtime.submit(ctx(), finDraft(uuid(8800), "photo"));
  expect(h.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2") === false, "foreground unknown (not set aside): another analysis may not bind");
  await h.runtime.defer(actorCtx());
  expect(h.runtime.getState().status === "uncertain" && h.runtime.isBoundToOperation(actorCtx(), "analysis-op-1"), "after 暫不處理 the bound analysis keeps its locked uncertain state");
  expect(h.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2") === true && (await entriesOf(h)).length === 1, "a deferred operation no longer blocks another analysis and stays in its slot");
  const gt = deferred();
  const live = await boot(makeFin({ behaviors: [{ kind: "gate", gate: gt }] }));
  const p = live.runtime.submit(ctx(), finDraft(uuid(8801), "p"));
  await tick(10);
  expect(live.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2") === false, "an in-flight attempt blocks binding another analysis");
  gt.resolve(); await p;
  const rt = await boot(makeFin({ behaviors: [{ kind: "fault", code: "55P03", message: "x" }] }));
  await rt.runtime.submit(ctx(), finDraft(uuid(8802), "p"));
  expect(rt.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2") === true && (await entriesOf(rt)).length === 1, "a known-not-written draft does not block another analysis");
  // restart without any screen state: the runtime retries the persisted operation itself
  const restored = await boot(makeFin({ storage: reopen(h.storage), model: h.model }));
  await restored.runtime.retry(actorCtx(), uuid(8800));
  expect(restored.client.calls.length === 1 && restored.client.calls[0].key === uuid(8800) && !(await entriesOf(restored)).some((e) => e.opId === uuid(8800)) && h.model.rowsOf("A").length >= 1, "after a restart the persisted operation is retried without any draft (same key)");
  const hook = readText(`${F}/analysis/useMealPhotoFinalization.ts`);
  const analysisScreen = readText("apps/mobile/app/analysis.tsx");
  expect(/mealPhotoFinalization\.draft\s*\?\s*mealPhotoFinalization\.retryPending\(\)\s*:[\s\S]{0,200}consumerRuntime\.retryPendingMealIdentificationFinalization\(\)/.test(analysisScreen), "STATIC: when the screen has no frozen draft (restart) the retry button retries the PERSISTED operation itself");
  expect(/const frozen = frozenSubmissionRef\.current;/.test(hook) && /getMealPhotoFinalizationPayloadFingerprint\(current\) !== frozen\.fingerprint/.test(hook) && !/retryPendingMealIdentificationFinalization\(\)\s*;\s*\} finally/.test(hook), "STATIC: the byte-pinned hook keeps its fingerprint guard unchanged");
});

// ============================================================================================ UI / copy (STATIC + presenter)
gate("R-26", "UI truthfulness: every shown action is executable [STATIC + presenter]", async () => {
  const copy = C.zh.zhTW.mobile.pendingMealSave;
  const base = { opId: uuid(1), kind: "meal_write", hadUnknown: false, deferred: false, stale: false, inFlight: false, reason: null, label: "", mealType: null, createdAt: NOW.toISOString(), reference: "TK-N-UK-NET-00000001" };
  const cases = [
    { state: "unknown", hadUnknown: true, reason: "transport", copyKey: "unknown", actions: ["retry", "defer"] },
    { state: "unknown", hadUnknown: true, reason: "login", copyKey: "unknownLogin", actions: ["retry", "login", "defer"] },
    { state: "unknown", hadUnknown: true, reason: "consent", copyKey: "unknownConsent", actions: ["retry", "consent", "defer"] },
    { state: "unknown", hadUnknown: true, reason: "server", copyKey: "unknownServer", actions: ["retry", "defer"] },
    { state: "unknown", hadUnknown: true, reason: "invalid", copyKey: "unknownAnomaly", actions: ["defer"] },
    { state: "unknown", hadUnknown: true, reason: "conflict", copyKey: "unknownAnomaly", actions: ["defer"] },
    { state: "retryable", hadUnknown: false, reason: "server", copyKey: "retryable", actions: ["retry", "cancel"] },
    { state: "blocked_login", hadUnknown: false, reason: "login", copyKey: "blockedLogin", actions: ["retry", "login", "cancel"] },
    { state: "blocked_consent", hadUnknown: false, reason: "consent", copyKey: "blockedConsent", actions: ["retry", "consent", "cancel"] },
    { state: "inflight", hadUnknown: false, reason: null, copyKey: "submitting", actions: [] }
  ];
  const notice = readText(`${F}/consumer-runtime/PendingMealSaveNotice.tsx`);
  for (const c of cases) {
    const entry = { ...base, state: c.state, hadUnknown: c.hadUnknown, lastReason: c.reason, kind: "meal_write", opId: uuid(1), lastSqlstate: null, input: {}, ownerActorKey: "A", seq: 1, expiresAt: "x", priorState: null, attempts: 1, lastHttpStatus: null, lastAttemptAt: null, schema: 2 };
    const summary = C.recovery.summarizeMealSaveEntry(entry, { nowMs: NOW.getTime(), inFlight: c.state === "inflight", describe: () => ({ label: "", mealType: null }) });
    const view = C.recovery.presentMealSaveOperation(summary, copy);
    expect(summary.copyKey === c.copyKey && JSON.stringify(summary.actions) === JSON.stringify(c.actions), `presenter ${c.state}/${c.reason}: copy ${c.copyKey}, actions ${c.actions.join("+") || "none"}`);
    expect(view.actions.every((a) => a.label.length > 0) && view.title.length > 0, `presenter ${c.state}/${c.reason}: titled, every action labelled`);
    expect(!/(?<!是否)已儲存|已經儲存/.test(`${view.title}${view.body}`), `presenter ${c.state}/${c.reason}: never asserts "saved" for an unconfirmed operation`);
  }
  for (const id of ["retry", "defer", "cancel", "login", "consent"]) expect(new RegExp(`action === "${id}"`).test(notice), `STATIC: the notice has a handler for ${id}`);
  expect(/retryMealSaveOperation\(operation\.kind, operation\.opId\)/.test(notice) && /deferMealSaveOperation/.test(notice) && /cancelMealSaveOperation/.test(notice), "STATIC: retry/defer/cancel call the Provider actions");
  for (const route of ["login.tsx", "onboarding.tsx", "today-intake.tsx", "meal-photo.tsx"]) expect(fs.existsSync(path.join(root, "apps/mobile/app", route)), `STATIC: route ${route} exists`);
  expect(/router\.replace\("\/login"/.test(notice) && /router\.push\("\/onboarding"/.test(notice), "STATIC: login / consent buttons use the existing routes");
  const reco = readText("apps/mobile/app/recommendation.tsx"), today = readText("apps/mobile/app/today-intake.tsx"), analysis = readText("apps/mobile/app/analysis.tsx"), nextMeal = readText(`${F}/next-meal-prototype/NextMealPrototypeContent.tsx`);
  expect(/pendingNotice=\{<PendingMealSaveNotice kinds=\{\["meal_write"\]\}/.test(reco) && /\{pendingNotice \?\? null\}/.test(nextMeal), "STATIC: the recommendation screen renders the notice for normal saves");
  expect(/intakeStatus !== "idle" && !\(intakeStatus === "uncertain" && pendingNotice\)/.test(nextMeal), "STATIC: with a notice, the card shows no second (stale) local 'uncertain' line after a later 重新確認 success");
  expect(/errorCode === "capacity_exhausted"\) return "notice"/.test(reco) && /result === "notice" \? "idle" : result/.test(nextMeal), "STATIC: a capacity refusal is presented by the notice, not by a generic 'try later' line on the card");
  expect(/copy\.capacity\.title/.test(notice) && /copy\.capacity\.body/.test(notice) && /action\.id !== "defer"/.test(notice) && /capacity \|\| !operation\.deferred/.test(notice), "STATIC: in capacity mode the notice shows the approved copy, expands every operation and offers no 暫不處理 (it frees nothing)");
  expect(/mealIdentificationFinalizationState\.errorCode === "capacity_exhausted" \? null/.test(analysis), "STATIC: the photo screen leaves a capacity refusal to the notice (no generic error card)");
  expect(/pendingMealSave\.referenceLabel\} \$\{unresolvedFinalizationOperation\.reference\}/.test(analysis), "STATIC: the photo screen's unknown card shows the local reference code");
  expect(/<PendingMealSaveNotice \/>/.test(today), "STATIC: Today renders the notice for both write paths");
  expect(/deferMealSaveOperation\("finalization"/.test(analysis) && /<PendingMealSaveNotice[\s\S]{0,120}kinds=\{\["finalization"\]\}/.test(analysis) && /deferCta/.test(analysis), "STATIC: the photo flow offers 暫不處理 and renders the notice");
  expect(!/consumerRuntime\.(?:createMealRecord|retryPendingMealRecord)\s*\(/.test(analysis), "STATIC: the analysis screen still calls no normal-save API");
  const noticeOps = /runtime\.mealSaveOperations/.test(notice) && /runtime\.signOut\(\)/.test(notice);
  expect(noticeOps, "STATIC: the notice reads the current actor's operations and uses the existing sign-out for 重新登入");
});

gate("R-28", "copy guard [STATIC]", async () => {
  const zh = C.zh.zhTW.mobile;
  const blocks = JSON.stringify([zh.pendingMealSave, zh.consumerMealWrite, { u: zh.mealIdentificationFinalization.uncertainTitle, b: zh.mealIdentificationFinalization.uncertainBody, r: zh.mealIdentificationFinalization.retrySameRequest, d: zh.mealIdentificationFinalization.deferCta, a: zh.mealIdentificationFinalization.errors.authorization }, zh.nextMealPrototype.intakeUncertain]);
  expect(!/放棄|未送出|好廚|好初|Haocu/.test(blocks), "no 放棄, no 未送出 for retained operations, no old Chinese brand in new copy");
  const approved = "目前無法確認這筆餐點是否已儲存。你可以重新確認，或暫時保留、繼續記錄其他餐點。請勿重新建立同一筆餐點，以免重複。";
  expect(zh.pendingMealSave.unknown.title === "目前無法確認這筆餐點是否已儲存" && zh.pendingMealSave.unknown.body === "你可以重新確認，或暫時保留、繼續記錄其他餐點。請勿重新建立同一筆餐點，以免重複。" && zh.nextMealPrototype.intakeUncertain === approved, "Owner-approved sentences are present verbatim");
  expect(zh.pendingMealSave.actions.retry === "重新確認" && zh.pendingMealSave.actions.defer === "暫不處理" && zh.mealIdentificationFinalization.retrySameRequest === "重新確認" && zh.mealIdentificationFinalization.deferCta === "暫不處理", "buttons 重新確認 / 暫不處理");
  expect(!/登入/.test(JSON.stringify([zh.pendingMealSave.unknownServer, zh.pendingMealSave.retryable, zh.mealIdentificationFinalization.errors.authorization])), "server-fault copy never asks the user to log in");
  expect(/目前登入的帳號與這筆餐點的帳號不同/.test(zh.pendingMealSave.actorMismatch.title) && /無法在這支裝置保留這筆餐點/.test(zh.pendingMealSave.storage.title) && /目前有太多尚待確認的餐點/.test(zh.pendingMealSave.capacity.title), "T20, storage and capacity copy are present");
  const stores = ["consumerMealWriteOperationStore.ts", "consumerMealIdentificationFinalizationOperationStore.ts", "mealSaveOperationLedger.ts"].map((f) => readText(`${F}/consumer-runtime/${f}`)).join("\n");
  expect(!/\bclear\s*\(|purgeActor/.test(stores), "R-27 (removed gate) static replacement: the stores expose neither clear(actorKey) nor purgeActor");
});

// ============================================================================================ dispatch guard (H-SDK / pure)
gate("R-29", "dispatch guard unit matrix [H-SDK + pure]", async () => {
  const D = C.dispatch;
  const calls = [];
  const inner = async (input, init) => { calls.push({ input, init }); return new Response("{}", { status: 200 }); };
  const guard = D.createActorBindingFetchGuard({ supabaseUrl: SB_URL, inner });
  const URLV2 = `${SB_URL}/rest/v1/rpc/create_current_user_meal_record_v2`;
  const mk = (over = {}) => ({ method: "POST", headers: new Headers({ authorization: `Bearer ${jwt("A")}`, apikey: "k", "content-type": "application/json", "x-tastkind-expected-user": "A", ...over }), body: "{}" });
  const refused = async (input, init) => { const before = calls.length; const r = await guard(input, init); const body = await r.json(); return calls.length === before && r.status === 409 && body.code === "TKACT0"; };
  const okReq = mk(); const ok = await guard(URLV2, okReq);
  const sent = calls[0]?.init?.headers;
  expect(ok.status === 200 && calls.length === 1 && !sent.has("x-tastkind-expected-user") && sent.get("authorization") === `Bearer ${jwt("A")}` && sent.get("apikey") === "k" && calls[0].init.body === "{}", "matching sub: forwarded once, same headers and body, tag removed");
  expect(await refused(URLV2, mk({ authorization: `Bearer ${jwt("B")}` })), "wrong sub: refused, inner never called");
  expect(await refused(URLV2, mk({ authorization: `Bearer ${ANON_KEY}` })), "anon key: refused");
  expect(await refused(URLV2, mk({ authorization: "Bearer not-a-jwt" })), "undecodable token: refused");
  expect(await refused(URLV2, { ...mk(), headers: new Headers({ apikey: "k", "x-tastkind-expected-user": "A" }) }), "missing token: refused");
  expect(await refused(URLV2, mk({ "x-tastkind-expected-user": "__unbound__" })), "__unbound__ (unregistered key): refused");
  expect(await refused("http://evil.example/rest/v1/rpc/create_current_user_meal_record_v2", mk()), "other origin: refused");
  expect(await refused(`${SB_URL}/rest/v1/rpc/other_function`, mk()), "other RPC: refused");
  expect(await refused(URLV2, { ...mk(), method: "GET" }), "non-POST: refused");
  expect(await refused(new Request(URLV2, { method: "POST" }), mk()), "Request-object input with a tag: refused (fail closed)");
  const plain = { method: "POST", headers: new Headers({ authorization: `Bearer ${jwt("B")}`, apikey: "k" }), body: "{}" };
  const beforePlain = calls.length;
  await guard(`${SB_URL}/auth/v1/token`, plain);
  expect(calls.length === beforePlain + 1 && calls.at(-1).input === `${SB_URL}/auth/v1/token` && calls.at(-1).init === plain, "requests without the tag pass through byte-identical (same arguments)");
  // decoder
  expect(D.decodeBearerSubject(`Bearer ${jwt("用戶-é")}`) === "用戶-é" && D.decodeBearerSubject("Bearer a.b") === null && D.decodeBearerSubject(null) === null && D.decodeBearerSubject(`Bearer ${b64u({})}.${b64u({ nosub: 1 })}.x`) === null && D.decodeBearerSubject(`Bearer x.${"=".repeat(1)}.y`) === null, "decoder: unicode sub, garbage, missing sub");
  // registry + proxy
  const registry = D.createActorBindingRegistry();
  const seen = [];
  const builder = () => ({ setHeader(name, value) { seen.push([name, value]); return this; } });
  const raw = { other: 1, rpc: (fn) => { seen.push(["rpc", fn]); return builder(); } };
  const bound = D.withActorBinding(raw, registry);
  registry.bind(uuid(1), "A");
  bound.rpc("create_current_user_meal_record_v2", { p_client_request_id: uuid(1) });
  bound.rpc("create_current_user_meal_record_v2", { p_client_request_id: uuid(2) });
  bound.rpc("convert_authenticated_planned_meal_v2", { p_client_request_id: uuid(1) });
  const tags = seen.filter((s) => s[0] === "x-tastkind-expected-user").map((s) => s[1]);
  expect(JSON.stringify(tags) === JSON.stringify(["A", "__unbound__"]) && bound.other === 1, "proxy: registered key tagged with its owner, unregistered key fail-closed, planned-meal RPC untouched, other members forwarded");
  registry.release(uuid(1));
  bound.rpc("finalize_current_user_meal_identification_v1", { p_client_request_id: uuid(1) });
  expect(seen.filter((s) => s[0] === "x-tastkind-expected-user").at(-1)[1] === "__unbound__", "released key is no longer registered");
  expect(D.withActorBinding({ rpc: () => ({}) }, registry).rpc("create_current_user_meal_record_v2", { p_client_request_id: uuid(1) }) !== undefined, "a client whose builder has no setHeader is left unchanged");
  // real SDK: header-less RPCs reach the inner fetch with identical headers; tagged ones are verified against the token SDK resolved
  const sdkCalls = [];
  const sdkInner = async (input, init) => { sdkCalls.push({ input: String(input), headers: new Headers(init.headers) }); return new Response("null", { status: 200, headers: { "content-type": "application/json" } }); };
  const reg2 = D.createActorBindingRegistry();
  const client = SDK.createClient(SB_URL, ANON_KEY, { accessToken: async () => jwt("A"), global: { fetch: D.createActorBindingFetchGuard({ supabaseUrl: SB_URL, inner: sdkInner }) } });
  await client.rpc("some_other_function", {});
  reg2.bind(uuid(5), "A");
  await D.withActorBinding(client, reg2).rpc("create_current_user_meal_record_v2", { p_client_request_id: uuid(5) });
  reg2.bind(uuid(6), "B");
  await D.withActorBinding(client, reg2).rpc("create_current_user_meal_record_v2", { p_client_request_id: uuid(6) });
  expect(sdkCalls.length === 2 && sdkCalls.every((c) => !c.headers.has("x-tastkind-expected-user") && c.headers.get("authorization") === `Bearer ${jwt("A")}` && c.headers.get("apikey") === ANON_KEY), "real SDK: header-less RPC untouched, owner-matching RPC forwarded with the SDK's final Authorization, mismatching RPC never reaches the network");
});

gate("R-30", "module-level lock shared by every ledger instance [H-CRASH]", async () => {
  const run = async (shared) => {
    let lost = 0;
    for (let seed0 = 1; seed0 <= 25; seed0++) {
      const m = new Map(); const st = new CrashStorage(m, mulberry(seed0));
      const a = newLedger(st, shared ? {} : { lockScope: {} }), b = newLedger(st, shared ? {} : { lockScope: {} });
      const results = await Promise.all([a.add("A", seed(1)), b.add("A", seed(2)), a.add("A", seed(3)), b.add("A", seed(4))]);
      const listed = (await a.list("A")).entries.length;
      lost += results.filter((r) => r.ok).length - listed;
    }
    return lost;
  };
  expect((await run(true)) === 0, "two ledger instances over one storage share the lock: 0 silently lost adds (25 seeds)");
  expect((await run(false)) > 0, "known-bad control: per-instance locks silently lose adds");
});

gate("R-31", "unusable slots are preserved, counted, never overwritten [H-CRASH]", async () => {
  const m = new Map(); const st = new CrashStorage(m); const l = newLedger(st, { slots: 5 });
  const slot = (a, n) => `tk.test.pending.v2.slot.${a}.${n}`;
  m.set(slot("A", 0), JSON.stringify({ schema: 2, kind: "meal_write", opId: "x", ownerActorKey: "B", seq: 1, input: {}, state: "unknown", priorState: null, deferred: false, hadUnknown: true, attempts: 1, lastReason: null, createdAt: "a", expiresAt: "b" }));
  m.set(slot("A", 1), "garbage{");
  m.set(slot("A", 2), JSON.stringify({ schema: 3, opId: "y" }));
  const snapshot = [0, 1, 2].map((n) => m.get(slot("A", n)));
  const a1 = await l.add("A", seed(1)); const a2 = await l.add("A", seed(2)); const full = await l.add("A", seed(3));
  expect(a1.ok && a2.ok && full.ok === false && full.reason === "capacity", "unusable slots count as occupied (capacity is honest)");
  expect(JSON.stringify([0, 1, 2].map((n) => m.get(slot("A", n)))) === JSON.stringify(snapshot), "unusable slots are preserved byte-for-byte across adds");
  const listing = await l.list("A");
  expect(listing.entries.length === 2 && listing.unusable === 3, "unusable slots are never loaded");
  expect((await newLedger(st, { slots: 5 }).list("B")).entries.length === 0, "another actor's slots are separate keys");
  await l.update("A", seed(1).opId, (e) => ({ ...e, deferred: true }));
  expect(JSON.stringify([0, 1, 2].map((n) => m.get(slot("A", n)))) === JSON.stringify(snapshot), "an update elsewhere does not touch unusable slots");
});

gate("R-32", "not_sent: guard refusal never changes unknown history [H-SDK + pure]", async () => {
  const R = C.recovery;
  const mkEntry = (over) => ({ schema: 2, opId: uuid(1), kind: "meal_write", ownerActorKey: "A", seq: 1, input: {}, createdAt: "x", expiresAt: "y", state: "inflight", priorState: "new", deferred: false, hadUnknown: false, attempts: 1, lastReason: null, lastSqlstate: null, lastHttpStatus: null, lastAttemptAt: null, ...over });
  const clean = R.applyAttemptOutcome(mkEntry({}), { cls: "not_sent" }, "t");
  expect(clean.action === "update" && clean.entry.state === "new" && clean.entry.attempts === 0 && clean.entry.hadUnknown === false, "no history: not_sent restores `new`, attempt not counted, no history added");
  const sticky = R.applyAttemptOutcome(mkEntry({ hadUnknown: true, priorState: "unknown", attempts: 2, lastReason: "transport" }), { cls: "not_sent" }, "t");
  expect(sticky.action === "update" && sticky.entry.state === "unknown" && sticky.entry.hadUnknown === true && sticky.entry.attempts === 1 && sticky.entry.lastReason === "transport", "with unknown history: not_sent keeps it unknown and does not erase it");
  expect(R.classifyMealWriteErrorCode("meal_write_actor_binding_mismatch", "").cls === "not_sent" && R.classifyFinalizationErrorCode("finalization_actor_binding_mismatch").cls === "not_sent", "both paths classify the guard code as not_sent (never unknown)");
  // end-to-end with the real SDK: unknown first, then a refused dispatch
  const model = createServerModel(); const log = []; const world = { current: "A", tv: 1, hooks: {}, switched: () => {} };
  const backend = async (input, init) => { const fn = String(input).match(/\/rpc\/([a-z0-9_]+)/)[1]; const claims = claimsOf(new Headers(init.headers).get("authorization")); log.push(claims.sub); if (world.netNext) { world.netNext = false; throw new TypeError("Network request failed"); } const r = respond(model, claims.sub, fn, JSON.parse(init.body)); return new Response(JSON.stringify(r.error ?? r.data), { status: r.status }); };
  const registry = C.dispatch.createActorBindingRegistry();
  const client = SDK.createClient(SB_URL, ANON_KEY, { accessToken: async () => { await world.hooks.token?.(); return world.current ? jwt(world.current) : null; }, global: { fetch: C.dispatch.createActorBindingFetchGuard({ supabaseUrl: SB_URL, inner: backend }) } });
  const repo = new C.repoW.SupabaseConsumerMealRecordWriteRepository({ authPort: { getCurrentSession: async () => ({ ok: true, value: world.current ? { user: { userId: world.current } } : null }) }, mealClient: C.dispatch.withActorBinding(client, registry), writeEnabled: true });
  const storage = new C.storage.MemoryConsumerAuthStorage(); const store = new C.storeW.ConsumerMealWriteOperationStore(storage);
  let n = 9300;
  const runtime = new C.runtimeW.ConsumerMealWriteRuntime({ service: { createCurrentUserMealRecord: (i) => repo.createCurrentUserMealRecord(i) }, operationStore: store, clock: { now: () => NOW }, uuidFactory: () => uuid(n++), dispatchBinding: registry });
  await runtime.setActor("A", 1);
  world.netNext = true;
  await runtime.submit(ctx("A", 1), baseDraft("sticky"));
  const [afterNet] = (await store.list("A")).entries;
  expect(afterNet.state === "unknown" && afterNet.hadUnknown && afterNet.attempts === 1, "SDK: a network failure leaves an unknown operation");
  world.hooks = { token: (() => { let used = false; return async () => { if (used) return; used = true; world.current = "B"; }; })() };
  const refusedState = await runtime.retry(actorCtx("A", 1));
  const [afterRefusal] = (await store.list("A")).entries;
  expect(refusedState.errorCode === "actor_binding_mismatch" && afterRefusal.state === "unknown" && afterRefusal.hadUnknown && afterRefusal.attempts === 1 && log.length === 1, "SDK: a refused dispatch (account switched) is not an attempt: unknown history intact, nothing was sent");
});

gate("R-33", "capacity recovery actions per occupied state [presenter + H-FS]", async () => {
  const h = await boot(makeNormal({ behaviors: [] }));
  const states = [["unknown", { kind: "net" }], ["draft", { kind: "fault", code: "55P03", message: "x" }], ["login", { kind: "fault", code: "28000", message: "AUTHENTICATION_REQUIRED" }], ["consent", { kind: "fault", code: "42501", message: "CONSUMER_CORE_ELIGIBILITY_REQUIRED" }]];
  const mix = makeNormal({ behaviors: states.map((s) => s[1]) });
  await boot(mix);
  for (const [label] of states) {
    if (label === "consent") mix.model.eligible.delete("A");
    await submit(mix, "A", 1, label);
    if (label === "unknown") await mix.runtime.defer(actorCtx());
  }
  const ops = mix.runtime.getState().operations;
  const byReason = Object.fromEntries(ops.map((o) => [o.state + "/" + (o.reason ?? ""), o.actions.join("+")]));
  expect(byReason["unknown/transport"] === "retry+defer" && byReason["retryable/server"] === "retry+cancel" && byReason["blocked_login/login"] === "retry+login+cancel" && byReason["blocked_consent/consent"] === "retry+consent+cancel", `each occupied state offers exactly the actions that can run (${JSON.stringify(byReason)})`);
  expect(h.runtime.getState().operations.length === 0, "empty ledger shows nothing");
});

gate("R-34", "SDK version coupling is reproducible [STATIC]", async () => {
  const installed = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, "apps/mobile/node_modules/@supabase/supabase-js/package.json"), "utf8")).version;
  const lock = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, "package-lock.json"), "utf8"));
  const locked = lock.packages["apps/mobile/node_modules/@supabase/supabase-js"]?.version;
  const range = JSON.parse(fs.readFileSync(path.join(SCRIPT_ROOT, "apps/mobile/package.json"), "utf8")).dependencies["@supabase/supabase-js"];
  expect(installed === locked && range === "^2.110.2", `installed supabase-js ${installed} equals the lockfile resolution ${locked}; manifest range unchanged (${range})`);
  const diff = childProcess.spawnSync("git", ["-C", SCRIPT_ROOT, "diff", "--quiet", BASELINE, "--", "package.json", "package-lock.json", "apps/mobile/package.json"], { encoding: "utf8" });
  expect(diff.status === 0, "dependencies and lockfile are byte-identical to the baseline");
  const loader = readText(`${F}/consumer-auth/supabaseSdkLoader.ts`);
  expect(/global:\s*\{\s*fetch:\s*createActorBindingFetchGuard\(\{\s*supabaseUrl:\s*options\.url\s*\}\)/.test(loader), "STATIC: the guard is the SDK client's global.fetch and is scoped to the configured Supabase URL");
  const composition = readText(`${F}/consumer-runtime/consumerRuntimeComposition.ts`);
  expect(/withActorBinding\(input\.mealClient, dispatchRegistry\)/.test(composition) && /finalizationClient: boundMealClient/.test(composition) && /createConsumerMealRecordWriteService\(writeFlags, writeDependencies\)/.test(composition) && /createConsumerPlannedMealsService\(overviewFlags, dependencies\)/.test(composition), "STATIC: only the two meal write repositories receive the proxy; planned meals / reads keep the raw client");
  expect((composition.match(/dispatchBinding: dispatchRegistry/g) ?? []).length === 2, "STATIC: both runtimes register the operation owner through the shared registry");
});


// ============================================================================================ H-PG gates (only with --pg-bin and --out)
// The same App code (real repositories / runtimes / stores / ledger and the real SDK matrix) against a disposable
// PostgreSQL 17 running the real migrations. The PostgREST layer stays modelled (status mapping, HTTP).
async function withPg(run) {
  if (!PG_BIN || !OUT) throw new Error("PG gates need --pg-bin <PostgreSQL 17 bin> and --out <external evidence dir>");
  const S = await import(new URL(`file:///${path.join(SCRIPT_ROOT, "scripts/consumer-retention-persistence-smoke.mjs").split(path.sep).join("/")}`).href);
  const pgOut = path.join(OUT, "pg");
  const rec = S.recorder(pgOut);
  const cl = await S.cluster(PG_BIN, rec);
  const names = { create: ["p_meal_type", "p_occurred_at", "p_meal_date", "p_client_request_id", "p_timezone", "p_title", "p_note", "p_source", "p_items"], fin: ["p_client_request_id", "p_meal_type", "p_occurred_at", "p_meal_date", "p_timezone", "p_finalization"] };
  const cast = { p_meal_type: "public.meal_type", p_occurred_at: "timestamptz", p_meal_date: "date", p_client_request_id: "uuid", p_timezone: "text", p_title: "text", p_note: "text", p_source: "public.meal_source_type", p_items: "jsonb", p_finalization: "jsonb" };
  const U = S.uuid(910), BU = S.uuid(912);
  let count = 0;
  try {
    const db0 = await S.baseline(cl, rec, { legacy: true });
    await rec.query(db0, fs.readFileSync(path.join(S.ROOT, "supabase/migrations", S.MIGRATION), "utf8"));
    await db0.end(); cl.clients.delete(db0); await cl.admin.end(); cl.clients.delete(cl.admin); cl.admin = await cl.connect("template1");
    const capture = fs.readFileSync(path.join(S.ROOT, "supabase/migrations", S.CAPTURE_SUCCESSOR), "utf8");
    const fresh = async (label, fn) => {
      const name = `tk_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}_${count++}`;
      await cl.admin.query(`create database ${name} template postgres owner postgres`);
      const op = await cl.connect(name, "postgres"), su = await cl.connect(name);
      const open = async (user = "supabase_admin") => { const c = await cl.connect(name, user); cl.clients.delete(c); c.on("error", () => {}); return c; };
      const c = { name, op, su, open, q: (t, v) => su.query(t, v).then((r) => r.rows) };
      try {
        await op.query(capture);
        await su.query("insert into auth.users(id,email) values($1,'tk-b@synthetic.invalid')", [BU]);
        const prof = (await c.q("select * from public.consumer_profiles where user_id=$1", [U]))[0]; const coh = (await c.q("select * from consumer_internal.preparation_cohort where user_id=$1", [U]))[0];
        const p2 = { ...prof, user_id: BU, profile_id: "tk-synthetic-b", display_name: "Synthetic B", anonymous_display_name: "Synthetic B B" }; delete p2.id;
        await su.query(`insert into public.consumer_profiles(${Object.keys(p2).join(",")}) select ${Object.keys(p2).join(",")} from json_populate_record(null::public.consumer_profiles, $1::json)`, [JSON.stringify(p2)]);
        const c2 = { ...coh, user_id: BU, profile_id: "tk-synthetic-b" }; delete c2.id;
        await su.query(`insert into consumer_internal.preparation_cohort(${Object.keys(c2).join(",")}) select ${Object.keys(c2).join(",")} from json_populate_record(null::consumer_internal.preparation_cohort, $1::json)`, [JSON.stringify(c2)]);
        return await fn(c);
      } finally {
        for (const x of [op, su]) { await x.end().catch(() => {}); cl.clients.delete(x); }
        await cl.admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()", [name]);
        await cl.admin.query(`drop database ${name}`);
        for (const r of ["consumer_retention_capture_owner", "consumer_retention_capture_builder"]) if ((await cl.admin.query("select 1 from pg_roles where rolname=$1", [r])).rowCount) await cl.admin.query(`drop role "${r}"`);
      }
    };
    const act = async (c, uid, sql, values = [], role = "authenticated") => {
      const conn = await c.open();
      try {
        await conn.query("begin");
        if (uid !== undefined) await conn.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [uid ?? "", JSON.stringify({ sub: uid })]);
        if (role) await conn.query(`set local role ${role}`);
        const r = await conn.query(sql, values); await conn.query("commit");
        return { ok: true, rows: r.rows };
      } catch (e) { await conn.query("rollback").catch(() => {}); return { ok: false, code: e.code ?? null, message: String(e.message), detail: e.detail ?? null, hint: e.hint ?? null }; }
      finally { await conn.end().catch(() => {}); }
    };
    const rpcSql = (fn, args) => { const list = fn.startsWith("finalize") ? names.fin : names.create; const keys = list.filter((k) => k in args); return { sql: `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${cast[k]}`).join(",")}) s`, values: keys.map((k) => (typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])) }; };
    await run({ fresh, act, rpcSql, U, BU, S });
  } finally { await cl.stop(); }
}
const uidOf = (U, BU) => ({ A: U, B: BU });
// The App identifies accounts by the aliases "A"/"B"; the database by their uuids. The PostgREST model maps the JWT
// alias to the uuid for the SQL call and maps the owner uuids in the returned JSON back to the alias.
let aliasMap = { };
const aliasBack = (data) => { let text = JSON.stringify(data); for (const [uuidValue, alias] of Object.entries(aliasMap)) text = text.split(`"${uuidValue}"`).join(`"${alias}"`); return JSON.parse(text); };
const pgResponse = (r) => (r.ok ? { data: aliasBack(r.rows[0].s), error: null, status: 200 } : structured(r.code, r.message));

// ============================================================================================ D1 / D2 corrective
gate("R-35", "a late success resolves the bound photo operation and nothing else [H-FS + STATIC]", async () => {
  const elapsed = { race: (p) => Promise.race([p.then((value) => ({ timedOut: false, value })), wait(15).then(() => ({ timedOut: true }))]) };
  // current photo: local wait elapsed, then the original request commits and answers
  const g1 = deferred();
  const h = await boot(makeFin({ behaviors: [{ kind: "gate", gate: g1 }], localWait: elapsed }));
  expect((await submit(h)).status === "uncertain", "photo: the elapsed local wait first shows the operation as unresolved");
  g1.resolve(); await wait(40);
  const s1 = h.runtime.getState();
  expect(s1.status === "succeeded" && Boolean(s1.mealRecordId) && !s1.pending && (await entriesOf(h)).length === 0 && h.model.rowsOf("A").length === 1 && h.client.calls.length === 1, "photo: a late trusted success of the bound operation publishes succeeded with its durable IDs (no residual unknown, no extra request)");
  // no unresolved state is left, so the screen offers no retry control; a programmatic retry has no ledger target and sends nothing
  await h.runtime.retry(actorCtx());
  expect(s1.status === "succeeded" && h.client.calls.length === 1 && (await entriesOf(h)).length === 0, "photo: after the late success no retry target remains and nothing is re-sent");
  // set aside (暫不處理) while still on the same photo, then the late success
  const g2 = deferred();
  const d = await boot(makeFin({ behaviors: [{ kind: "gate", gate: g2 }], localWait: elapsed }));
  await submit(d); await d.runtime.defer(actorCtx());
  g2.resolve(); await wait(40);
  expect(d.runtime.getState().status === "succeeded" && (await entriesOf(d)).length === 0, "photo: set aside, then a late success of the still-bound operation resolves it");
  // a NEW photo is in front: the earlier operation's late success never lands on it
  const g3 = deferred();
  const n = await boot(makeFin({ behaviors: [{ kind: "gate", gate: g3 }], localWait: elapsed }));
  await submit(n); await n.runtime.defer(actorCtx());
  expect(n.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2") === true, "photo: the set-aside operation lets a new analysis bind");
  const newPhotoBefore = JSON.stringify(slim(n.runtime.getState()));
  g3.resolve(); await wait(40);
  expect(JSON.stringify(slim(n.runtime.getState())) === newPhotoBefore && n.runtime.getState().status === "idle" && (await entriesOf(n)).length === 0 && n.runtime.isBoundToOperation(actorCtx(), "analysis-op-2"), "photo: the earlier operation's late success reconciles its ledger only and never appears as the new photo's save");
  // account switch: A's late success never changes B's screen
  const g4 = deferred();
  const x = await boot(makeFin({ behaviors: [{ kind: "gate", gate: g4, as: "A" }], localWait: elapsed }));
  await submit(x);
  await x.runtime.setActor("B", 2); x.world.user = "B";
  x.runtime.beginAnalysisOperation(actorCtx("B", 2), "analysis-op-b");
  const bBefore = JSON.stringify(slim(x.runtime.getState()));
  g4.resolve(); await wait(40);
  expect(JSON.stringify(slim(x.runtime.getState())) === bBefore && x.runtime.getState().status !== "succeeded" && (await x.store.list("A")).entries.length === 0 && (await x.store.list("B")).entries.length === 0, "photo: A's late success reconciles A's ledger and never changes B's screen");
  // sign-out: the late success is reconciled for the owner and nothing is published
  const g5 = deferred();
  const o = await boot(makeFin({ behaviors: [{ kind: "gate", gate: g5, as: "A" }], localWait: elapsed }));
  await submit(o);
  await o.runtime.setActor(null, 2);
  g5.resolve(); await wait(40);
  expect(o.runtime.getState().status === "idle" && (await o.store.list("A")).entries.length === 0, "photo: after sign-out the late success is reconciled in the owner's ledger and nothing is shown");
  // normal save keeps its existing behaviour: a late success ends the unresolved state (idle), one row
  const g6 = deferred();
  const w = await boot(makeNormal({ behaviors: [{ kind: "gate", gate: g6 }], localWait: elapsed }));
  await submit(w);
  g6.resolve(); await wait(40);
  expect(w.runtime.getState().status === "idle" && !w.runtime.getState().pending && (await entriesOf(w)).length === 0 && w.model.rowsOf("A").length === 1, "normal save: a late success still ends the unresolved state (unchanged behaviour)");
  // STATIC: the analysis screen adopts only its OWN operation's late success (operation-scoped status) and never shows
  // the 暫不處理 note unless such an operation exists
  const screen = readText("apps/mobile/app/analysis.tsx");
  expect(/mealPhotoFinalization\.runtimeStatus !== "succeeded"\) return;/.test(screen) && /draft\.submissionStatus !== "failed" \|\| draft\.lastSafeError !== "result_uncertain"\) return;/.test(screen) && /applyMealPhotoFinalizationResult\(draft, lateFinalizationState\)/.test(screen) && /if \(next\.submissionStatus === "succeeded"\) completeMealPhotoFinalization\(next\);/.test(screen), "STATIC: the photo screen completes from the runtime's operation-scoped success only for its own unresolved draft");
  expect(/!unresolvedFinalizationOperationId && deferredFinalizationOperation \? zhTW\.mobile\.pendingMealSave\.deferredNote/.test(screen), "STATIC: the set-aside note is shown only for an operation the user actually set aside");
});

gate("R-36", "answers without a well-formed server error code stay unknown on both write paths; trusted codes unchanged [H-SDK + H-FS]", async () => {
  const BODIES = [
    ["kong-502-json", 502, "application/json", JSON.stringify({ message: "An invalid response was received from the upstream server" })],
    ["html-502-invalid", 502, "text/html", "<html><body><h1>502 Bad Gateway</h1><p>Invalid response from upstream</p></body></html>"],
    ["html-503-required", 503, "text/html", "<html><body>Service Unavailable. Retry is required later.</body></html>"],
    ["proxy-502-forbidden", 502, "application/json", JSON.stringify({ message: "Upstream connection forbidden by proxy policy" })],
    ["codeless-401-token", 401, "application/json", JSON.stringify({ message: "AUTHENTICATION_REQUIRED" })],
    ["codeless-403-token", 403, "application/json", JSON.stringify({ message: "OWNERSHIP_OR_AUTHORIZATION_REJECTED" })],
    ["codeless-409-conflict", 409, "application/json", JSON.stringify({ message: "IDEMPOTENCY_KEY_CONFLICT" })],
    ["empty-code", 500, "application/json", JSON.stringify({ code: "", message: "INVALID", details: null, hint: null })],
    ["malformed-code", 502, "application/json", JSON.stringify({ code: "BAD_GATEWAY", message: "INVALID upstream", details: null, hint: null })],
    ["numeric-code", 502, "application/json", JSON.stringify({ code: 502, message: "invalid", details: null, hint: null })],
    ["lowercase-code", 500, "application/json", JSON.stringify({ code: "pgrst301", message: "INVALID", details: null, hint: null })]
  ];
  const build = (kind, body, commit) => {
    const model = createServerModel();
    const calls = [];
    const backend = async (input, init) => {
      const fn = String(input).split("/rpc/")[1];
      const args = JSON.parse(init.body);
      calls.push(args.p_client_request_id);
      const committed = commit || calls.length > 1 ? model.handle("A", fn, args) : null;
      if (calls.length > 1) return new Response(JSON.stringify(okPayload(fn, committed.row)), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(body[3], { status: body[1], headers: { "content-type": body[2] } });
    };
    const registry = C.dispatch.createActorBindingRegistry();
    const client = C.dispatch.withActorBinding(SDK.createClient(SB_URL, ANON_KEY, { accessToken: async () => jwt("A"), global: { fetch: C.dispatch.createActorBindingFetchGuard({ supabaseUrl: SB_URL, inner: backend }) } }), registry);
    const world = { user: "A" };
    let n = kind === "normal" ? 3600 : 3700;
    if (kind === "normal") {
      const repo = new C.repoW.SupabaseConsumerMealRecordWriteRepository({ authPort: authPortFor(world), mealClient: client, writeEnabled: true });
      const store = new C.storeW.ConsumerMealWriteOperationStore(new MapStorage());
      return { kind, model, calls, store, runtime: new C.runtimeW.ConsumerMealWriteRuntime({ service: { createCurrentUserMealRecord: (i) => repo.createCurrentUserMealRecord(i) }, operationStore: store, uuidFactory: () => uuid(n++), dispatchBinding: registry }) };
    }
    const service = new C.svcF.ConsumerMealIdentificationFinalizationService({ authPort: authPortFor(world), repository: new C.repoF.SupabaseConsumerMealIdentificationFinalizationRepository(client) });
    const store = new C.storeF.ConsumerMealIdentificationFinalizationOperationStore(new MapStorage());
    return { kind: "finalization", model, calls, store, runtime: new C.runtimeF.ConsumerMealIdentificationFinalizationRuntime({ service, operationStore: store, uuidFactory: () => uuid(n++), dispatchBinding: registry }) };
  };
  for (const kind of ["normal", "finalization"]) for (const body of BODIES) for (const commit of [true, false]) {
    const h = await boot(build(kind, body, commit));
    const first = await submit(h);
    const [entry] = await entriesOf(h);
    const op = h.runtime.getState().operations[0];
    expect(entry && entry.state === "unknown" && entry.hadUnknown && first.status === "uncertain" && op && !op.actions.includes("cancel") && h.model.rowsOf("A").length === (commit ? 1 : 0), `${kind}/${body[0]}/${commit ? "committed" : "not committed"}: real SDK answer without a well-formed code => unknown (kept, not cancellable, never "not written")`);
    const done = await h.runtime.retry(actorCtx());
    expect((done.status === "succeeded" || (kind === "normal" && done.status === "idle") || kind === "finalization") && (await entriesOf(h)).length === 0 && h.model.rowsOf("A").length === 1 && h.calls.length === 2 && h.calls[0] === h.calls[1], `${kind}/${body[0]}/${commit ? "committed" : "not committed"}: 重新確認 sends the original key once; exactly one row`);
  }
  // classification boundary (H-FS, typed repository errors)
  for (const make of bothKinds) {
    for (const [label, error, status] of [["code missing", { message: "INVALID" }, 400], ["code empty", { code: "", message: "REQUIRED", details: "", hint: "" }, 400], ["code malformed", { code: "E-502", message: "FORBIDDEN", details: "", hint: "" }, 502], ["code null", { code: null, message: "TOO_MANY", details: "", hint: "" }, 429]]) {
      const h = await boot(make({ behaviors: [] }));
      h.client.rpc = async () => ({ data: null, error, status });
      await submit(h);
      const [e] = await entriesOf(h);
      expect(e && e.state === "unknown" && e.hadUnknown, `${make.name}: ${label} => unknown`);
    }
    // trusted codes keep their classification (no relaxation of login, consent, ownership or input rules)
    const trusted = [["22023", "INVALID_MEAL_RECORD", 400], ["XX000", "boom", 500], ["28000", "AUTHENTICATION_REQUIRED", 401], ["42501", "CONSUMER_CORE_ELIGIBILITY_REQUIRED", 403]];
    for (const [code, message, status] of trusted) {
      const h = await boot(make({ behaviors: [{ kind: "fault", code, message, status }] }));
      await submit(h);
      const [e] = await entriesOf(h);
      const expected = code === "22023" ? (make === makeNormal ? null : "removed-or-anomaly") : code === "XX000" ? "retryable" : code === "28000" ? "blocked_login" : "blocked_consent";
      expect(expected === null ? !e : expected === "removed-or-anomaly" ? !e || e.state !== "unknown" : e && e.state === expected, `${make.name}: trusted code ${code} keeps its classification`);
    }
  }
});

gate("R-PG", "real PostgreSQL 17 + real migrations: R-02/R-03/R-10/R-14 and the full R-07c matrix [H-PG; PostgREST modelled]", async () => {
  await withPg(async ({ fresh, act, rpcSql, U, BU }) => {
    const ids = uidOf(U, BU);
    aliasMap = { [U]: "A", [BU]: "B" };
    const pgClient = (c, world, behaviors = []) => ({ calls: [], async rpc(fn, args) {
      this.calls.push({ fn, key: args.p_client_request_id, user: world.user });
      const b = behaviors.shift();
      if (b?.kind === "net") return NET();
      if (b?.kind === "gate") await b.gate.promise;
      const { sql, values } = rpcSql(fn, args);
      const r = await act(c, ids[world.user], sql, values);
      if (b?.kind === "committedThenNet" && r.ok) return NET();
      if (b?.kind === "committedThenGateway" && r.ok) return { data: null, error: { message: "An invalid response was received from the upstream server" }, status: 502 };
      return pgResponse(r);
    } });
    const build = (c, make, { behaviors = [], world = { user: "A" }, storage = new MapStorage(), localWait, start = 12000 } = {}) => {
      const client = pgClient(c, world, behaviors); let n = start; const clock = { now: () => new Date() };
      if (make === "normal") {
        const repo = new C.repoW.SupabaseConsumerMealRecordWriteRepository({ authPort: authPortFor(world), mealClient: client, writeEnabled: true });
        const store = new C.storeW.ConsumerMealWriteOperationStore(storage);
        return { client, store, storage, world, runtime: new C.runtimeW.ConsumerMealWriteRuntime({ service: { createCurrentUserMealRecord: (i) => repo.createCurrentUserMealRecord(i) }, operationStore: store, clock, uuidFactory: () => uuid(n++), localWait }) };
      }
      const repo = new C.repoF.SupabaseConsumerMealIdentificationFinalizationRepository(client);
      const service = new C.svcF.ConsumerMealIdentificationFinalizationService({ authPort: authPortFor(world), repository: repo });
      const store = new C.storeF.ConsumerMealIdentificationFinalizationOperationStore(storage);
      return { client, store, storage, world, runtime: new C.runtimeF.ConsumerMealIdentificationFinalizationRuntime({ service, operationStore: store, clock, uuidFactory: () => uuid(n++), localWait }) };
    };
    const rowsFor = (c) => c.q("select m.user_id, m.client_request_id, a.original_recorded_at t0 from public.meal_records m left join retention_capture.detail_capture_anchors a on a.resource_id=m.id order by m.created_at");
    const ONE = (kind, h, name) => (kind === "normal" ? h.runtime.submit(ctx(), baseDraft(name)) : h.runtime.submit(ctx(), finDraft(undefined, name)));
    for (const kind of ["normal", "finalize"]) {
      // R-02 / R-14 / R-36: committed, answer lost, replay: same row, one anchor, T0 unchanged
      for (const lost of ["committedThenNet", "committedThenGateway"]) await fresh(`r02${kind}${lost === "committedThenNet" ? "" : "gw"}`, async (c) => {
        const h = build(c, kind, { behaviors: [{ kind: lost }] });
        await h.runtime.setActor("A", 1); if (kind === "finalize") h.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-1");
        const first = await ONE(kind, h, "pg lost");
        const t0 = (await rowsFor(c))[0]?.t0?.getTime();
        await wait(300);
        const done = await h.runtime.retry(actorCtx());
        const rows = await rowsFor(c);
        expect(first.status === "uncertain" && done.status === "succeeded" && rows.length === 1 && rows[0].t0.getTime() === t0 && (await h.store.list("A")).entries.length === 0, `R-02 PG/${kind}/${lost}: replay returns the original row; one row, one anchor, T0 unchanged`);
      });
      // R-10: eligibility lost -> identical denial for committed and never-sent operations; restore -> one row each
      await fresh(`r10${kind}`, async (c) => {
        const h = build(c, kind, { behaviors: [{ kind: "committedThenNet" }, { kind: "net" }] });
        await h.runtime.setActor("A", 1); if (kind === "finalize") h.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-1");
        await ONE(kind, h, "committed");
        await h.runtime.defer(actorCtx());
        if (kind === "finalize") h.runtime.beginAnalysisOperation(actorCtx(), "analysis-op-2");
        await ONE(kind, h, "never");
        const entries = (await h.store.list("A")).entries;
        const snap = (await c.q("select * from consumer_internal.preparation_cohort where user_id=$1", [U]))[0];
        await c.su.query("delete from consumer_internal.preparation_cohort where user_id=$1", [U]);
        const denied = [];
        for (const e of entries) { await h.runtime.retry(actorCtx(), e.opId); denied.push((await h.store.list("A")).entries.find((x) => x.opId === e.opId)); }
        expect(denied.every((d) => d.state === "unknown" && d.lastReason === "consent" && d.lastSqlstate === "42501"), `R-10 PG/${kind}: the real denial (42501 CONSUMER_CORE_ELIGIBILITY_REQUIRED) is identical for the committed and the never-sent operation and both stay unknown/consent`);
        const cols = Object.keys(snap);
        await c.su.query(`insert into consumer_internal.preparation_cohort(${cols.join(",")}) select ${cols.join(",")} from json_populate_record(null::consumer_internal.preparation_cohort, $1::json)`, [JSON.stringify(snap)]);
        for (const e of entries) await h.runtime.retry(actorCtx(), e.opId);
        expect((await rowsFor(c)).length === 2 && (await h.store.list("A")).entries.length === 0, `R-10 PG/${kind}: restored eligibility => exactly one row per operation (original returned / created once)`);
      });
    }
    // R-03: delayed commit after the client stopped waiting + concurrent same-key retry + late answer
    await fresh("r03", async (c) => {
      const lockConn = await c.open("supabase_admin");
      await lockConn.query("begin"); await lockConn.query("lock table retention_capture.detail_capture_anchors in access exclusive mode");
      const elapsed = { race: (p) => Promise.race([p.then((value) => ({ timedOut: false, value })), wait(400).then(() => ({ timedOut: true }))]) };
      const h = build(c, "normal", { localWait: elapsed });
      await h.runtime.setActor("A", 1);
      const submitted = h.runtime.submit(ctx(), baseDraft("pg delayed"));
      const state1 = await submitted;                                              // local wait elapsed while the transaction is blocked
      const [entry] = (await h.store.list("A")).entries;
      const retryWhileBlocked = h.runtime.retry(actorCtx(), entry.opId);            // same key, still blocked on the advisory lock
      await wait(300);
      const visible = (await c.q("select count(*)::int n from public.meal_records"))[0].n;
      await lockConn.query("rollback"); await lockConn.end().catch(() => {});
      await retryWhileBlocked; await wait(400);
      const rows = await rowsFor(c);
      expect(state1.status === "uncertain" && entry.lastReason === "deadline" && visible === 0 && rows.length === 1 && (await h.store.list("A")).entries.length === 0, "R-03 PG: wait elapsed => unknown; nothing visible while blocked; after release exactly one row/anchor and the ledger is reconciled");
    });
    // R-14 (PG): three intended meals across bump / sign-out / restart => three rows
    await fresh("r14", async (c) => {
      const behaviours = [{ kind: "committedThenNet" }, { kind: "committedThenNet" }, { kind: "committedThenNet" }];
      const h = build(c, "normal", { behaviors: behaviours });
      await h.runtime.setActor("A", 1); await h.runtime.submit(ctx("A", 1), baseDraft("m1"));
      await h.runtime.setActor("A", 2); await h.runtime.defer(actorCtx("A", 2)); await h.runtime.submit(ctx("A", 2), baseDraft("m2"));
      await h.runtime.setActor(null, 3); await h.runtime.setActor("A", 4); await h.runtime.defer(actorCtx("A", 4)); await h.runtime.submit(ctx("A", 4), baseDraft("m3"));
      const restart = build(c, "normal", { storage: reopen(h.storage), start: 15000 });
      await restart.runtime.setActor("A", 5);
      for (const e of (await restart.store.list("A")).entries) await restart.runtime.retry(actorCtx("A", 5), e.opId);
      expect((await rowsFor(c)).length === 3 && (await restart.store.list("A")).entries.length === 0, "R-14 PG: three intended meals => exactly three rows");
    });
    // R-07c with real SQL: the full 24-row matrix, baseline vs candidate
    const rows = [];
    for (const variant of ["baseline", "candidate"]) await fresh(`m${variant}`, async (c) => {
      const factory = (model, log, world) => {
        const startedAt = new Date(Date.now() - 50);
        return {
          fetch: async (input, init) => {
            const fn = String(input).match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/)?.[1];
            const headers = new Headers(init.headers); const claims = claimsOf(headers.get("authorization")); const args = JSON.parse(init.body);
            log.push({ stage: "received", fn, sub: claims.sub ?? null, role: claims.role ?? null, tagReachedServer: headers.has("x-tastkind-expected-user") });
            await world.hooks.afterDispatch?.();
            const { sql, values } = rpcSql(fn, args);
            const r = claims.sub ? await act(c, ids[claims.sub], sql, values) : await act(c, undefined, sql, values, "anon");
            const response = pgResponse(r);
            return new Response(JSON.stringify(response.error ?? response.data), { status: response.status, headers: { "content-type": "application/json" } });
          },
          rowOwners: async () => (await c.q("select user_id from public.meal_records where created_at >= $1", [startedAt])).map((r) => (r.user_id === U ? "A" : r.user_id === BU ? "B" : r.user_id))
        };
      };
      for (const kind of ["normal", "finalize"]) for (const scenario of matrixScenarios) {
        const reactions = ["no_race_control", "same_account_token_refresh_before_dispatch"].includes(scenario.id) ? ["immediate"] : ["immediate", "lag"];
        for (const reaction of reactions) rows.push(await matrixRow({ kind, variant, scenario, reaction, backendFactory: factory, keyBase: 20000 + rows.length * 10 }));
      }
    });
    fs.writeFileSync(path.join(OUT, "R07C-matrix-pg.json"), JSON.stringify(rows, null, 2));
    assertMatrix(rows, "PostgreSQL backend");
  });
});

// ============================================================================================ runner
const selected = gates.filter((g) => (g.id !== "R-PG" || PG_BIN) && (only.length === 0 || only.some((o) => g.id === o || g.id.startsWith(o))));
if (!PG_BIN) console.log("SKIP R-PG (no --pg-bin: the real-PostgreSQL gates did not run)");
let passed = 0; const failed = [];
for (const g of selected) {
  try { await g.run(); passed++; console.log(`PASS ${g.id} ${g.title}`); }
  catch (error) { failed.push(g.id); console.log(`FAIL ${g.id} ${g.title}\n     ${error.message}`); }
}
if (OUT) fs.writeFileSync(path.join(OUT, "recovery-smoke-summary.json"), JSON.stringify({ passed, failed, total: selected.length }, null, 2));
console.log(`RESULT ${passed}/${selected.length}${failed.length ? ` FAIL ${failed.join(",")}` : " PASS"}`);
process.exit(failed.length ? 1 : 0);
