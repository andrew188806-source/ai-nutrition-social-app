#!/usr/bin/env node
// ENT-W1 (retention line): validation of the acquisition sweep (migration 20261025010000_consumer_retention_acquisition_resolve_sweep.sql, the default-disabled Edge entrypoint retention-acquisition-resolve and its shared module).
// The gate BODIES below are byte-identical to the sealed isolated checkpoint (checkpoint-01-isolated-20261024, manifest 01918c14...): suite U01-U05/G01-G16, gap gates H01-H04 (own scope) and the
// Deno-vs-PostgreSQL gates E01-E05 (own scope). New here: F01-F03 (exact successor, P14 wiring and binding controls), D01-D03 (real Deno: type check, no-network runtime, Deno.serve entry) and
// G17 (the FULL migration chain of this tree applies, then one paid sweep records). PG gates other than G17 use the reduced retention fixture (entCluster + acqFresh + this migration); G16 adds the
// ENT-R seal and ENT-F1 billing tail; only G17 applies the full chain. Local disposable PostgreSQL only; no Hosted, no deploy, no enablement.
// usage: node scripts/consumer-retention-acquisition-resolve-smoke.mjs --pg-bin <bin> --out <new dir> --deno <deno exe> --deno-dir <DENO_DIR holding npm:postgres@3.4.7> [--src-root <dir>] [--draft <sql>]
//        TK_GATES=<comma separated full gate ids> (optional; an unknown id or an empty selection is BLOCKED)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import child from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as P from './consumer-retention-persistence-smoke.mjs';
import * as EN from './consumer-retention-entitlement-smoke.mjs';
import * as AQ from './consumer-retention-acquisition-smoke.mjs';
import * as EDGE from './consumer-retention-billing-edge-smoke.mjs';
import * as BS from './consumer-retention-billing-smoke.mjs';
import { ENTW1_FILES, ENTW1_WIRING, ENTW1_MIGRATION, ENTW1_BASE_COMMIT, entw1PredecessorGit } from './consumer-retention-entw1-exact-successor.mjs';
import { PH1_MIGRATION } from './s2-ph1-exact-successor.mjs';
import { R1A_MIGRATION } from './consumer-monthly-review-exact-successor.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = P.ROOT;
const BIN = arg('--pg-bin'), OUT = arg('--out') ? path.resolve(arg('--out')) : null, DENO = arg('--deno'), DENO_DIR = arg('--deno-dir') ? path.resolve(arg('--deno-dir')) : null;
if (!OUT) { console.error('usage: --pg-bin <bin> --out <new dir> --deno <deno> --deno-dir <dir> [--src-root <dir>] [--draft <sql>]'); process.exit(2); }
// --draft: the migration text the PG gates apply (the mutation harness passes a mutated copy); default: this tree's ENT-W1 migration
const DRAFT = path.resolve(arg('--draft') ?? path.join(ROOT, 'supabase/migrations', ENTW1_MIGRATION));
// --src-root: a directory holding supabase/functions (the mutation harness points it at a mutated copy); default: this tree
const SRC_ROOT = path.resolve(arg('--src-root') ?? ROOT);
EDGE.setSourceRoot(SRC_ROOT);
const { Client, DatabaseError: PgDatabaseError } = createRequire(path.join(ROOT, 'package.json'))('pg');
const rootGit = args => { const r = child.spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256e6, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); if (r.status) throw Error('SETUP_GIT ' + args.join(' ') + ' ' + r.stderr); return r.stdout; };

// ===== checkpoint suite (byte-identical body) =====
const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, m => m); // full ms precision
const WORKER = 'consumer_retention_acquisition_worker';
const ACQ = 'retention_acquisition', ENT = 'retention_entitlement';
const DRAFT_SQL = fs.readFileSync(DRAFT, 'utf8');
const FN_SIGS = [
  ['admit_entitlement_event', 'uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint'],
  ['advance_entitlement_coverage', 'uuid, text, timestamp with time zone'],
  ['entitlement_state_at', 'uuid, timestamp with time zone']
];

// ---- product modules (one session: one class identity for BillingCommitPhaseError) ---------------------------------------------------------------------------------
function session() {
  const stubs = { 'npm:postgres@3.4.7': { default: () => ({ begin: async () => { throw Object.assign(Error('stub: connection refused'), { code: 'ECONNREFUSED' }); }, end: async () => {} }) } };
  const S = EDGE.newEdgeSession({ stubs });
  return { E: S.load('_shared/billing-transport/executor.ts'), Q: S.load('_shared/acquisition-resolve/sql.ts'), W: S.load('_shared/acquisition-resolve/worker.ts'),
    H: S.load('retention-acquisition-resolve/handler.ts'), C: S.load('retention-acquisition-resolve/config.ts') };
}

// ---- fixtures ----------------------------------------------------------------------------------------------------------------------------------------------------
const q = (ctx, text, v = []) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
async function applyDraft(ctx, runner = ctx.su, sql = DRAFT_SQL) {
  ctx.extraRoles.add(WORKER);
  const notices = []; const on = m => notices.push(m.message); runner.on('notice', on);
  let error = null;
  try { await ctx.g.query(runner, sql); } catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await runner.query('ROLLBACK').catch(() => {}); }
  finally { runner.removeListener('notice', on); }
  return { error, boundary: notices.includes('ACQW_DDL_BOUNDARY') };
}
function fresh(cl, label, fn, { apply = true, acq = true } = {}) {
  return AQ.acqFresh(cl, label, async ctx => {
    ctx.uid = 0;
    if (apply) { ctx.draft = await applyDraft(ctx); if (ctx.draft.error) throw Error('SETUP_DRAFT_APPLY ' + JSON.stringify(ctx.draft.error)); }
    return fn(ctx);
  }, { apply: acq });
}
async function regWrite(ctx, text, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); }
  catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
async function makeUser(ctx, n) { const id = P.uuid(n); await ctx.g.query(ctx.su, 'insert into auth.users(id,email) values($1,$2)', [id, `w${n}@synthetic.invalid`]); return id; }
async function makeProducer(ctx, ns, registeredAtMs) {
  const role = 'w_p_' + ns.replace(/[^a-z0-9]/g, '_'); ctx.extraRoles.add(role);
  await ctx.g.query(ctx.su, `create role ${role} login password 'pw-${role}'`);
  await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to ${role}`);
  for (const [fn, args] of FN_SIGS) await ctx.g.query(ctx.su, `grant execute on function ${ENT}.${fn}(${args}) to ${role}`);
  await regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,null)`, [ns, role, iso(registeredAtMs)]);
  return { ns, role, c: await ctx.open(role) };
}
const callAs = async (c, text, v = []) => { try { const r = await c.query(text, v); return { ok: true, value: r.rows[0]?.s }; } catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message) }; } };
const admit = (p, owner, up, cls, fromMs, untilMs) => callAs(p.c, `select ${ENT}.admit_entitlement_event($1::uuid,$2,$3,$4,$5::timestamptz,$6::timestamptz,null) s`, [owner, p.ns, up, cls, iso(fromMs), iso(untilMs)]);
const coverage = (p, owner, throughMs) => callAs(p.c, `select ${ENT}.advance_entitlement_coverage($1::uuid,$2,$3::timestamptz) s`, [owner, p.ns, iso(throughMs)]);
// A meal row and its anchor with a CHOSEN id, T0 and capture context (superuser, replica: the capture trigger itself is covered by the accepted capture/ENT1-A gates).
async function anchor(ctx, owner, { id, t0Ms, context = 'authenticated_actor' }) {
  await ctx.su.query('begin');
  try {
    await ctx.su.query("set local session_replication_role = 'replica'");
    const t0 = iso(t0Ms);
    await ctx.g.query(ctx.su, "insert into public.meal_records(id,user_id,meal_type,occurred_at,meal_date,source) values($1,$2,'lunch',$3::timestamptz,$4::date,'manual')", [id, owner, t0, t0.slice(0, 10)]);
    await ctx.g.query(ctx.su, "insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values($1,$2,$3::timestamptz,'canonical_meal_insert','retention-capture-v1',$4)", [id, owner, t0, context]);
    await ctx.su.query('commit');
    return id;
  } catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
const rid = n => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`; // ordered resource ids
async function workerLogin(ctx, name = 'w_worker_login') {
  ctx.extraRoles.add(name);
  await ctx.g.query(ctx.su, `create role ${name} login password 'pw-${name}'`);
  await ctx.g.query(ctx.su, `grant ${WORKER} to ${name} with inherit true, set false`);
  return name;
}
const dbUrl = (ctx, role) => `postgres://${role}:pw-${role}@127.0.0.1:${ctx.cl.port}/${ctx.name}`;
const receipts = async ctx => (await q(ctx, `select resource_id, acquisition_basis, retained_until, original_recorded_at from ${ACQ}.detail_acquisition_records order by resource_id`));
const state = async ctx => (await q(ctx, `select cycle::text, cursor_after, inflight_resource, inflight_attempts, skipped_total::text from ${ACQ}.resolution_sweep_state`))[0];

// Node driver for the driver port (pg). A COMMIT-phase failure carries a server answer only when pg built a DatabaseError from the server's ErrorResponse. Injection hooks (driver boundary, test only):
//   inject.bodyEnd(stmts)      -> Error thrown at the end of the body (the driver rolls back; nothing commits)
//   inject.afterCommit(stmts)  -> raw Error reported as a commit-phase failure WITHOUT a server answer AFTER a successful real COMMIT
//   inject.afterCommitPlain(stmts) -> plain Error thrown after a successful real COMMIT (the worker process "dies" after commit)
function nodeDriver(url, E, inject = {}, log = null) {
  const u = new URL(url);
  const cfg = () => ({ host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), connectionTimeoutMillis: 5000 });
  const d = {
    transactions: 0, closed: 0,
    async withTransaction(fn) {
      const c = new Client(cfg()); c.on('error', () => {});
      const stmts = [];
      try {
        await c.connect();
        await c.query('begin'); d.transactions++;
        const s = { async query(text, params) { stmts.push({ text, params: [...params] }); log?.push({ text, params: [...params] }); return (await c.query(text, [...params])).rows; } };
        let result;
        try { result = await fn(s); const e = inject.bodyEnd?.(stmts); if (e) throw e; }
        catch (e) { await c.query('rollback').catch(() => {}); throw e; }
        try { await c.query('commit'); } catch (e) { throw new E.BillingCommitPhaseError(e, e instanceof PgDatabaseError ? { code: e.code, severity: e.severity } : null); }
        const lost = inject.afterCommit?.(stmts); if (lost) throw new E.BillingCommitPhaseError(lost, null);
        const died = inject.afterCommitPlain?.(stmts); if (died) throw died;
        return result;
      } finally { await c.end().catch(() => {}); }
    },
    async close() { d.closed++; }
  };
  return d;
}
const isResolveTx = stmts => stmts.some(s => /resolve_detail_acquisition/.test(s.text));
const isClaimTx = stmts => stmts.length === 1 && /claim_resolution_page/.test(stmts[0].text);
const isBeginTx = stmts => stmts.length === 1 && /begin_resolution_item/.test(stmts[0].text);
const paramId = stmts => stmts.find(s => /resolve_detail_acquisition|begin_resolution_item/.test(s.text))?.params.find(p => typeof p === 'string' && /^[0-9a-f-]{36}$/.test(p)) ?? null;
const LIM = (over = {}) => Object.freeze({ pageSize: 20, examine: 1000, maxItems: 50, maxClaims: 10, budgetMs: 60000, ...over });
async function sweep(M, driver, limits = LIM()) { return M.W.runAcquisitionSweep(driver, limits, () => Date.now()); }
const resolvedIds = log => log.filter(x => /resolve_detail_acquisition/.test(x.text)).map(x => x.params[0]);

// A paid world: producer 'billing' registered 400 days ago; owner gets a paid fact covering [from, until) and coverage advanced to now.
async function paidWorld(ctx) {
  const now = Date.now();
  const bill = await makeProducer(ctx, 'billing', now - 400 * DAY);
  return { now, bill };
}
async function paidOwner(ctx, world, n, { cls = 'paid', fromMs = world.now - 390 * DAY, untilMs = world.now + 30 * DAY, cover = true } = {}) {
  const o = await makeUser(ctx, n);
  const a = await admit(world.bill, o, 'up-' + n, cls, fromMs, untilMs); if (!a.ok) throw Error('SETUP_ADMIT ' + JSON.stringify(a));
  if (cover) { const c = await coverage(world.bill, o, world.now - 1000); if (!c.ok) throw Error('SETUP_COVERAGE ' + JSON.stringify(c)); }
  return o;
}

export const GATES = {};

// ==== pure gates (no PostgreSQL) ==================================================================================================================================
GATES.U01_COMMIT_CLASSIFICATION_REUSES_THE_DRIVER_ATTESTATION = async () => {
  const M = session();
  const through = async thrower => { try { await M.Q.inAcquisitionTransaction({ withTransaction: async () => thrower(), close: async () => {} }, async () => 1); return { threw: false }; } catch (e) { return { threw: true, e }; } };
  const body = Error('body'), attestedRaw = Object.assign(Error('dup'), { code: '23505', severity: 'ERROR' }), epipe = Object.assign(Error('write EPIPE'), { code: 'EPIPE' });
  const a = await through(() => { throw body; });
  const b = await through(() => { throw new M.E.BillingCommitPhaseError(attestedRaw, { code: '23505', severity: 'ERROR' }); });
  const c = await through(() => { throw new M.E.BillingCommitPhaseError(epipe, null); });
  const d = await through(() => { throw new M.E.BillingCommitPhaseError(attestedRaw, null); });
  const e = await through(() => { throw new M.E.BillingCommitPhaseError(attestedRaw, { code: '57P01', severity: 'FATAL' }); });
  const unknown = x => x.threw && x.e.commitOutcomeUnknown === true && x.e.name === 'AcquisitionCommitOutcomeUnknownError' && !/BILLING/.test(x.e.message);
  const ok = a.e === body && b.e === attestedRaw && unknown(c) && c.e.commitFailure === epipe && unknown(d) && d.e.commitFailure === attestedRaw && unknown(e);
  return R(ok, { body: a.e === body, definite: b.e === attestedRaw, epipeUnknown: unknown(c), unattestedShapeUnknown: unknown(d), fatalUnknown: unknown(e), names: [c.e?.name, c.e?.message] });
};

GATES.U02_RESULT_SHAPES_ARE_VALIDATED = async () => {
  const M = session();
  const id = rid(1);
  const sess = rows => ({ query: async () => rows });
  const tryP = async p => { try { await p; return 'ok'; } catch (e) { return e.name; } };
  const out = {
    claimNotPage: await tryP(M.Q.claimPage(sess([{ s: { outcome: 'x' } }]), 5, 10)),
    claimUnsorted: await tryP(M.Q.claimPage(sess([{ s: { outcome: 'page', cycle: 0, ids: [rid(2), rid(1)], examined: 2, at_end: true, examined_through: null } }]), 5, 10)),
    claimTooMany: await tryP(M.Q.claimPage(sess([{ s: { outcome: 'page', cycle: 0, ids: [rid(1), rid(2)], examined: 2, at_end: true, examined_through: null } }]), 1, 10)),
    claimBadId: await tryP(M.Q.claimPage(sess([{ s: { outcome: 'page', cycle: 0, ids: ['x'], examined: 1, at_end: true, examined_through: null } }]), 5, 10)),
    claimOk: await tryP(M.Q.claimPage(sess([{ s: { outcome: 'page', cycle: 3, ids: [rid(1), rid(2)], examined: 9, at_end: false, examined_through: rid(9) } }]), 5, 10)),
    resolveWrongId: await tryP(M.Q.resolveItem(sess([{ s: { outcome: 'recorded', resource_id: rid(2), receipt: {} } }]), id)),
    resolvePendingWithReceipt: await tryP(M.Q.resolveItem(sess([{ s: { outcome: 'pending', resource_id: id, reason: 'X', receipt: {} } }]), id)),
    resolveUnknownOutcome: await tryP(M.Q.resolveItem(sess([{ s: { outcome: 'free', resource_id: id, receipt: null } }]), id)),
    beginUnknown: await tryP(M.Q.beginItem(sess([{ s: { outcome: 'go' } }]), '0', id)),
    advanceUnknown: await tryP(M.Q.advanceCursor(sess([{ s: { outcome: 'moved' } }]), '0', id, 'resolved')),
    twoRows: await tryP(M.Q.beginItem(sess([{ s: { outcome: 'stale' } }, { s: { outcome: 'stale' } }]), '0', id))
  };
  const pend = await M.Q.resolveItem(sess([{ s: { outcome: 'pending', resource_id: id, reason: 'not a reason!', receipt: null } }]), id);
  const ok = Object.entries(out).every(([k, v]) => (k === 'claimOk' ? v === 'ok' : v === 'AcquisitionShapeError')) && pend.reason === 'OTHER';
  return R(ok, { ...out, sanitizedReason: pend.reason });
};

// The sweep logic against a scripted session: stop at the first failure / unknown / busy, at most one wrap per run, pending only counted.
GATES.U03_SWEEP_STOP_RULES_WITH_A_SCRIPTED_DATABASE = async () => {
  const M = session();
  const scripted = steps => { let i = 0; const seen = []; return { seen, withTransaction: async fn => { const step = steps[i++]; if (!step) throw Error('script exhausted'); return fn({ query: async (text, params) => { seen.push(text.match(/\.(\w+)\(/)[1]); const r = step(text, params); if (r instanceof Error) throw r; return [{ s: r }]; } }); }, close: async () => {} }; };
  const page = (ids, extra = {}) => () => ({ outcome: 'page', cycle: 0, ids, examined: ids.length, at_end: false, examined_through: null, ...extra });
  const proceed = () => ({ outcome: 'proceed', attempt: 1 });
  const resolved = outcome => (text, params) => (/resolve_detail/.test(text) ? { outcome, resource_id: params[0], reason: outcome === 'pending' ? 'COVERAGE_SHORT' : null, receipt: outcome === 'pending' ? null : {} } : { outcome: 'advanced' });
  const failing = (text) => (/resolve_detail/.test(text) ? Object.assign(Error('boom'), { code: 'XX000' }) : { outcome: 'advanced' });
  const r1 = await sweep(M, scripted([page([rid(1), rid(2)]), proceed, failing]), LIM());
  const r2 = await sweep(M, scripted([page([rid(1)]), proceed, resolved('pending'), page([], { at_end: true }), () => ({ outcome: 'wrapped', cycle: 1 })]), LIM());
  const r3 = await sweep(M, scripted([page([rid(1), rid(2)]), () => ({ outcome: 'busy' })]), LIM());
  const r4 = await sweep(M, scripted([page([rid(1), rid(2), rid(3)]), proceed, resolved('recorded'), () => ({ outcome: 'skipped_after_attempts', attempts: 3 }), proceed, resolved('replayed'), page([], { at_end: true }), () => ({ outcome: 'wrapped', cycle: 1 })]), LIM({ maxClaims: 2 }));
  const r5 = await sweep(M, scripted([page([rid(1), rid(2)]), proceed, resolved('recorded'), proceed]), LIM({ maxItems: 1 }));
  // a refused wrap claims again instead of ending the run; the claim bound ends it
  const r6 = await sweep(M, scripted([page([], { at_end: true }), () => ({ outcome: 'refused', reason: 'UNRESOLVED_REMAIN' }), page([rid(4)]), proceed, resolved('recorded')]), LIM({ maxClaims: 2 }));
  const ok = r1.status === 'failed' && r1.recorded === 0
    && r2.status === 'ok' && r2.wrapped === 1 && r2.pending.COVERAGE_SHORT === 1 && r2.claims === 2
    && r3.status === 'stopped' && r3.stoppedBecause === 'busy'
    && r4.status === 'ok' && r4.recorded === 1 && r4.replayed === 1 && r4.skippedAfterAttempts === 1 && r4.wrapped === 1
    && r5.stoppedBecause === 'limit' && r5.recorded === 1
    && r6.refused === 1 && r6.recorded === 1 && r6.stoppedBecause === 'limit' && r6.claims === 2;
  return R(ok, { r1, r2, r3, r4, r5, r6 });
};

GATES.U04_ENDPOINT_REFUSALS_PRECEDE_ANY_DATABASE = async () => {
  const M = session();
  const env = { RETENTION_RESOLVE_ENABLED: 'true', RETENTION_RESOLVER_DB_URL: 'postgres://w:pw@127.0.0.1:5432/x', RETENTION_RESOLVE_SECRET: 's'.repeat(40) };
  const drivers = [];
  const deps = e => ({ loadConfig: () => M.C.loadRetentionResolveConfig(k => e[k]), createDriver: url => { const d = { url, closed: 0, withTransaction: async fn => fn({ query: async text => [{ s: /claim_resolution_page/.test(text) ? { outcome: 'page', cycle: 0, ids: [], examined: 0, at_end: true, examined_through: null } : { outcome: 'wrapped', cycle: 1 } }] }), close: async () => { d.closed++; } }; drivers.push(d); return d; }, limits: LIM({ maxClaims: 1 }), now: () => Date.now() });
  const req = (method = 'POST', secret = env.RETENTION_RESOLVE_SECRET) => new Request('http://x/r', { method, headers: secret === null ? {} : { 'x-retention-resolve-secret': secret } });
  const call = async (e, r) => { const before = drivers.length; const res = await M.H.processRetentionResolveRequest(r, deps(e)); return { status: res.status, body: await res.json(), drivers: drivers.length - before }; };
  const out = {
    disabled: await call({ ...env, RETENTION_RESOLVE_ENABLED: 'TRUE' }, req()),
    noUrl: await call({ ...env, RETENTION_RESOLVER_DB_URL: '' }, req()),
    shortSecret: await call({ ...env, RETENTION_RESOLVE_SECRET: 'short' }, req()),
    get: await call(env, req('GET')),
    wrongSecret: await call(env, req('POST', 'x'.repeat(40))),
    noSecret: await call(env, req('POST', null)),
    ok: await call(env, req())
  };
  const noDb = k => out[k].drivers === 0;
  const ok = out.disabled.status === 503 && noDb('disabled') && out.noUrl.status === 503 && noDb('noUrl') && out.shortSecret.status === 503 && noDb('shortSecret')
    && out.get.status === 405 && noDb('get') && out.wrongSecret.status === 401 && noDb('wrongSecret') && out.noSecret.status === 401 && noDb('noSecret')
    && out.ok.status === 200 && out.ok.drivers === 1 && drivers.at(-1).closed === 1 && out.ok.body.status === 'ok' && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(out.ok.body));
  return R(ok, out);
};

GATES.U05_STATIC_SHAPE_OF_THE_PRODUCT = async () => {
  const rd = rel => fs.readFileSync(path.join(SRC_ROOT, 'supabase/functions', rel), 'utf8');
  const files = ['_shared/acquisition-resolve/sql.ts', '_shared/acquisition-resolve/worker.ts', 'retention-acquisition-resolve/config.ts', 'retention-acquisition-resolve/handler.ts', 'retention-acquisition-resolve/index.ts'];
  const imports = Object.fromEntries(files.map(f => [f, [...rd(f).matchAll(/from\s*"([^"]+)"/g)].map(m => m[1]).sort()]));
  const allText = files.map(rd).join('\n');
  const M = session(); const sqls = Object.values(M.Q.ACQUISITION_SWEEP_SQL);
  const rows = {
    imports,
    onlyGenericF2Modules: Object.values(imports).flat().filter(x => x.includes('billing-transport')).every(x => /billing-transport\/(executor|sql|http|config|denoPostgresBillingTransport)\.ts$/.test(x)),
    noBillingEnvOrTx: !/BILLING_ENV|readEnabled|readNamespace|createBillingTransport|BillingCommitOutcomeUnknownError|processNamespace/.test(allText),
    noConsole: !/console\./.test(allText),
    indexReadsNoEnvAtImport: !/Deno\.env/.test(rd('retention-acquisition-resolve/index.ts')),
    fourConstantStatements: sqls.length === 4 && Object.isFrozen(M.Q.ACQUISITION_SWEEP_SQL) && sqls.every(t => /^select retention_acquisition\.[a-z_]+\(\$1/.test(t) && !/;/.test(t)),
    noEnt0OrOtherSchema: !/retention_entitlement|retention_capture|retention_billing|public\./.test(sqls.join(' '))
  };
  return R(Object.entries(rows).every(([k, v]) => k === 'imports' || v === true), rows);
};

// ==== PG gates ===================================================================================================================================================
GATES.G01_MIGRATION_EXACT_POST_STATE = async cl => fresh(cl, 'G01', async ctx => {
  const role = (await q(ctx, `select rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls from pg_roles where rolname=$1`, [WORKER]))[0];
  const members = (await q(ctx, `select count(*)::int n from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname=$1`, [WORKER]))[0].n;
  const fnAcl = await q(ctx, `select p.proname, coalesce((select string_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type, ',' order by 1) from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a where a.grantee<>p.proowner),'') acl, pg_get_userbyid(p.proowner) owner, p.prosecdef from pg_proc p where p.pronamespace='${ACQ}'::regnamespace order by 1`);
  const nsAcl = (await q(ctx, `select coalesce((select string_agg(pg_get_userbyid(a.grantee)||':'||a.privilege_type, ',' order by 1) from aclexplode(n.nspacl) a where a.grantee<>n.nspowner),'') acl from pg_namespace n where nspname='${ACQ}'`))[0].acl;
  const tbl = (await q(ctx, `select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) owner, (select count(*)::int from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee <> c.relowner) others from pg_class c where c.oid='${ACQ}.resolution_sweep_state'::regclass`))[0];
  const st = await state(ctx);
  const runtime = {};
  const fns = ['claim_resolution_page(integer,integer)', 'begin_resolution_item(bigint,uuid)', 'advance_resolution_cursor(bigint,uuid,text)', 'resolve_detail_acquisition(uuid)', 'first_unresolved_in(uuid,uuid)'];
  for (const r of ['anon', 'authenticated', 'service_role', 'authenticator', 'public']) {
    runtime[r] = (await q(ctx, `select has_schema_privilege($1,'${ACQ}','USAGE') u, has_table_privilege($1,'${ACQ}.resolution_sweep_state','SELECT,INSERT,UPDATE,DELETE') t, ${fns.map((f, i) => `has_function_privilege($1,'${ACQ}.${f}','EXECUTE') f${i}`).join(',')}`, [r]).catch(e => [{ error: e.code }]))[0];
  }
  const workerReach = (await q(ctx, `select has_table_privilege($1,'retention_capture.detail_capture_anchors','SELECT') anchors, has_table_privilege($1,'${ACQ}.detail_acquisition_records','SELECT') receipts, has_table_privilege($1,'${ACQ}.resolution_sweep_state','SELECT,UPDATE') state_tbl, has_function_privilege($1,'${ENT}.entitlement_state_at(uuid,timestamp with time zone)','EXECUTE') state_at, has_function_privilege($1,'${ACQ}.first_unresolved_in(uuid,uuid)','EXECUTE') next_fn, has_schema_privilege($1,'retention_capture','USAGE') cap_usage, has_schema_privilege($1,'${ENT}','USAGE') ent_usage`, [WORKER]))[0];
  const want = { advance_resolution_cursor: `${WORKER}:EXECUTE`, begin_resolution_item: `${WORKER}:EXECUTE`, claim_resolution_page: `${WORKER}:EXECUTE`, first_unresolved_in: '', reject_receipt_update: '', resolve_detail_acquisition: `${WORKER}:EXECUTE`, validate_receipt: '' };
  const aclOk = same(Object.fromEntries(fnAcl.map(f => [f.proname, f.acl])), want) && fnAcl.every(f => f.owner === 'consumer_retention_acquisition_owner');
  const runtimeNone = Object.values(runtime).every(v => v && !('error' in v) && Object.values(v).every(b => b === false));
  const ok = ctx.draft.boundary && role && !role.rolcanlogin && !role.rolinherit && !role.rolsuper && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication && !role.rolbypassrls && members === 0
    && aclOk && nsAcl === `${WORKER}:USAGE` && tbl.relrowsecurity && tbl.relforcerowsecurity && tbl.owner === 'consumer_retention_acquisition_owner' && tbl.others === 0
    && st.cycle === '0' && st.cursor_after === null && st.inflight_attempts === 0 && runtimeNone && Object.values(workerReach).every(v => v === false);
  return R(ok, { role, members, fnAcl, nsAcl, tbl, st, runtime, workerReach, boundary: ctx.draft.boundary });
});

GATES.G02_MIGRATION_REFUSALS_LEAVE_NOTHING = async cl => {
  const left = async ctx => (await q(ctx, `select (select count(*)::int from pg_roles where rolname=$1) roles, to_regclass('${ACQ}.resolution_sweep_state') is not null or to_regclass('${ACQ}.resolution_attempts') is not null tbl, (select count(*)::int from pg_proc where pronamespace='${ACQ}'::regnamespace and proname in ('claim_resolution_page','begin_resolution_item','advance_resolution_cursor','first_unresolved_in')) fns`, [WORKER]))[0];
  const cases = {};
  const refuse = async (label, prepare, prefix, { runner = 'su', acq = true } = {}) => fresh(cl, 'G02-' + label, async ctx => {
    await prepare(ctx);
    const r = await applyDraft(ctx, runner === 'su' ? ctx.su : ctx.op);
    const l = acq ? await left(ctx) : { roles: (await q(ctx, 'select count(*)::int n from pg_roles where rolname=$1', [WORKER]))[0].n, tbl: false, fns: 0 };
    cases[label] = { error: r.error && { code: r.error.code, message: r.error.message.slice(0, 100) }, left: l, boundary: r.boundary };
    return !!r.error && r.error.message.startsWith(prefix) && !r.boundary && l.roles === 0 && !l.tbl && l.fns === 0;
  }, { apply: false, acq });
  const res = [
    await refuse('actor-not-superuser', async () => {}, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { runner: 'op' }),
    await refuse('marker-role', async ctx => { ctx.extraRoles.add('pgbouncer'); await ctx.g.query(ctx.su, 'create role pgbouncer nologin'); }, 'ACQW_PLATFORM_APPLY_NOT_AUTHORIZED role:pgbouncer'),
    await refuse('marker-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema supabase_migrations'); }, 'ACQW_PLATFORM_APPLY_NOT_AUTHORIZED schema:supabase_migrations'),
    await refuse('binding-setting', async ctx => { await ctx.su.query("select set_config('tastkind.r0b_target','x',false)"); }, 'ACQW_BINDINGS_NOT_SUPPORTED'),
    await refuse('ent1a-missing', async () => {}, 'ACQW_PREDECESSORS_MISSING', { acq: false }),
    await refuse('ent1a-drift-extra-grant', async ctx => { ctx.extraRoles.add('w_drift'); await ctx.g.query(ctx.su, 'create role w_drift nologin'); await ctx.g.query(ctx.su, `grant select on ${ACQ}.detail_acquisition_records to w_drift`); }, 'ACQW_PREDECESSOR_DRIFT'),
    await refuse('ent1a-drift-resolver-replaced', async ctx => { await ctx.g.query(ctx.su, `alter function ${ACQ}.resolve_detail_acquisition(uuid) set lock_timeout = '3s'`); }, 'ACQW_PREDECESSOR_DRIFT'),
    await refuse('unsafe-data-member', async ctx => { ctx.extraRoles.add('w_reader'); await ctx.g.query(ctx.su, 'create role w_reader nologin'); await ctx.g.query(ctx.su, 'grant pg_read_all_data to w_reader'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE')
  ];
  const twice = await fresh(cl, 'G02-twice', async ctx => { const r = await applyDraft(ctx); return { error: r.error && r.error.message.slice(0, 60), st: await state(ctx) }; });
  cases.applyTwice = twice;
  const ok = res.every(Boolean) && twice.error?.startsWith('ACQW_ALREADY_PRESENT') && twice.st.cycle === '0';
  return R(ok, cases);
};

GATES.G03_WORKER_MEMBER_REACHES_ONLY_THE_FOUR_FUNCTIONS = async cl => fresh(cl, 'G03', async ctx => {
  const login = await workerLogin(ctx); const c = await ctx.open(login);
  ctx.extraRoles.add('w_outsider'); await ctx.g.query(ctx.su, "create role w_outsider login password 'pw-w_outsider'"); const outsider = await ctx.open('w_outsider');
  const owner = await makeUser(ctx, 1); const id = await anchor(ctx, owner, { id: rid(1), t0Ms: Date.now() - DAY });
  const tryQ = async (conn, text, v = []) => { try { await conn.query(text, v); return 'ok'; } catch (e) { return e.code; } };
  const out = {
    claim: await tryQ(c, `select ${ACQ}.claim_resolution_page(5,10)`),
    resolve: await tryQ(c, `select ${ACQ}.resolve_detail_acquisition($1::uuid)`, [id]),
    anchors: await tryQ(c, 'select * from retention_capture.detail_capture_anchors'),
    receipts: await tryQ(c, `select * from ${ACQ}.detail_acquisition_records`),
    stateTable: await tryQ(c, `select * from ${ACQ}.resolution_sweep_state`),
    stateUpdate: await tryQ(c, `update ${ACQ}.resolution_sweep_state set cycle = 9`),
    nextFn: await tryQ(c, `select ${ACQ}.first_unresolved_in(null, null)`),
    stateAt: await tryQ(c, `select ${ENT}.entitlement_state_at($1::uuid, now())`, [owner]),
    admit: await tryQ(c, `select ${ENT}.admit_entitlement_event($1::uuid,'billing','x','paid',now(),now()+interval '1 day',null)`, [owner]),
    outsiderClaim: await tryQ(outsider, `select ${ACQ}.claim_resolution_page(5,10)`),
    outsiderResolve: await tryQ(outsider, `select ${ACQ}.resolve_detail_acquisition($1::uuid)`, [id]),
    sessionUser: (await c.query('select session_user::text su, current_user::text cu')).rows[0]
  };
  const ok = out.claim === 'ok' && out.resolve === 'ok' && ['anchors', 'receipts', 'stateTable', 'stateUpdate', 'nextFn', 'stateAt', 'admit', 'outsiderClaim', 'outsiderResolve'].every(k => out[k] === '42501') && out.sessionUser.su === login;
  return R(ok, out);
});

GATES.G04_RESOLVER_DECIDES_EVERY_OUTCOME_WITHOUT_A_TIME_CUTOFF = async cl => fresh(cl, 'G04', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const now = w.now;
  const paid = await paidOwner(ctx, w, 1), trial = await paidOwner(ctx, w, 2, { cls: 'trial' }), free = await paidOwner(ctx, w, 3, { cls: 'paid', fromMs: now - 395 * DAY, untilMs: now - 394 * DAY });
  const shortCov = await makeUser(ctx, 4); const untrusted = await paidOwner(ctx, w, 5);
  const ids = {
    paid: await anchor(ctx, paid, { id: rid(10), t0Ms: now - DAY }),
    trial: await anchor(ctx, trial, { id: rid(11), t0Ms: now - 2 * DAY }),
    free: await anchor(ctx, free, { id: rid(12), t0Ms: now - 3 * DAY }),
    coverageShort: await anchor(ctx, shortCov, { id: rid(13), t0Ms: now - 4 * DAY }),
    beforeRegistration: await anchor(ctx, paid, { id: rid(14), t0Ms: now - 500 * DAY }),
    oldPaidPastDeadline: await anchor(ctx, paid, { id: rid(15), t0Ms: now - 300 * DAY }),
    noActorClaim: await anchor(ctx, untrusted, { id: rid(16), t0Ms: now - 5 * DAY, context: 'no_actor_claim' })
  };
  const log = [];
  const r1 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E, {}, log));
  const rec1 = await receipts(ctx); const st1 = await state(ctx);
  const log2 = [];
  const r2 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E, {}, log2));
  const rec2 = await receipts(ctx); const st2 = await state(ctx);
  const byId = Object.fromEntries(rec1.map(r => [r.resource_id, r]));
  const old = byId[ids.oldPaidPastDeadline];
  const pendingIds2 = resolvedIds(log2);
  const ok = r1.status === 'ok' && r1.recorded === 3 && r1.pending.FREE_PROVISIONAL_NOT_FINAL === 1 && r1.pending.COVERAGE_SHORT === 1 && r1.pending.NO_REQUIRED_PRODUCER === 1 && r1.pending.CAPTURE_CONTEXT_UNTRUSTED === 1
    && same(Object.keys(byId).sort(), [ids.paid, ids.trial, ids.oldPaidPastDeadline].sort()) && byId[ids.trial].acquisition_basis === 'trial'
    && old && new Date(old.retained_until).getTime() === new Date(old.original_recorded_at).getTime() + 4320 * 3600 * 1000 && new Date(old.retained_until).getTime() < Date.now()
    && same(resolvedIds(log).sort(), Object.values(ids).sort())
    && rec2.length === 3 && same(pendingIds2.sort(), [ids.free, ids.coverageShort, ids.beforeRegistration, ids.noActorClaim].sort()) && Number(st2.cycle) >= 1;
  return R(ok, { r1, r2, receipts: rec1.map(r => r.resource_id), st1, st2, resolvedRun1: resolvedIds(log), resolvedRun2: pendingIds2, ids });
});

GATES.G05_PAGES_COVER_EVERY_UNRESOLVED_ANCHOR_ONCE_PER_CYCLE = async cl => fresh(cl, 'G05', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx);
  const freeOwner = await paidOwner(ctx, w, 1, { fromMs: w.now - 395 * DAY, untilMs: w.now - 394 * DAY }); const paidO = await paidOwner(ctx, w, 2);
  ctx.extraRoles.add('w_pre'); await ctx.g.query(ctx.su, "create role w_pre login"); await ctx.g.query(ctx.su, `grant usage on schema ${ACQ} to w_pre`); await ctx.g.query(ctx.su, `grant execute on function ${ACQ}.resolve_detail_acquisition(uuid) to w_pre`);
  const pre = await ctx.open('w_pre');
  const all = [], receipted = [], unresolved = [];
  for (let i = 1; i <= 45; i++) {
    const isReceipted = i % 3 === 0;
    const id = await anchor(ctx, isReceipted ? paidO : freeOwner, { id: rid(100 + i), t0Ms: w.now - (i + 1) * 3600 * 1000 });
    all.push(id); (isReceipted ? receipted : unresolved).push(id);
  }
  for (const id of receipted) { const r = await pre.query(`select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [id]); if (r.rows[0].s.outcome !== 'recorded') throw Error('SETUP_PRE_RECEIPT'); }
  const log = []; const runs = [];
  for (let k = 0; k < 20; k++) { const r = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E, {}, log), LIM({ pageSize: 7, examine: 10, maxItems: 5, maxClaims: 3 })); runs.push({ status: r.status, stop: r.stoppedBecause, wrapped: r.wrapped, cycle: r.cycle }); if (r.wrapped) break; }
  const seen = resolvedIds(log);
  const counts = {}; for (const id of seen) counts[id] = (counts[id] ?? 0) + 1;
  const ok = same([...new Set(seen)].sort(), [...unresolved].sort()) && Object.values(counts).every(n => n === 1) && !seen.some(id => receipted.includes(id)) && runs.some(r => r.wrapped === 1);
  return R(ok, { runs, resolvedCount: seen.length, unresolved: unresolved.length, duplicates: Object.entries(counts).filter(([, n]) => n > 1), receiptedSeen: seen.filter(id => receipted.includes(id)) });
});

// A persistently failing id (test-only trigger on the receipt table, so the resolver's INSERT fails in the body) first in the page, and in the middle: later Paid anchors still get receipts.
GATES.G06_A_PERSISTENTLY_FAILING_ID_DOES_NOT_STARVE_LATER_IDS = async cl => {
  const scenario = async (label, failingPos) => fresh(cl, 'G06-' + label, async ctx => {
    const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
    const ids = [rid(201), rid(202), rid(203)];
    for (const id of ids) await anchor(ctx, o, { id, t0Ms: w.now - DAY });
    const bad = ids[failingPos];
    await ctx.g.query(ctx.su, `create function public.w_fail_receipt() returns trigger language plpgsql as $f$ begin if new.resource_id = '${bad}'::uuid then raise exception 'W_TEST_RECEIPT_FAILURE' using errcode = '23514'; end if; return new; end $f$`);
    await ctx.g.query(ctx.su, `create trigger w_fail_receipt before insert on ${ACQ}.detail_acquisition_records for each row execute function public.w_fail_receipt()`);
    const runs = [];
    for (let k = 0; k < 6; k++) { const r = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E), LIM()); runs.push({ status: r.status, stop: r.stoppedBecause, recorded: r.recorded, skipped: r.skippedAfterAttempts, st: await state(ctx) }); }
    const rec = (await receipts(ctx)).map(r => r.resource_id);
    const good = ids.filter(id => id !== bad);
    // the bad id holds the cursor for at most 3 starts (3 failed runs); the 4th start skips it for this cycle and the later ids are resolved in that same run
    const firstAllGood = runs.findIndex(r => r.recorded > 0 && r.skipped === 1);
    return { label, bad, rec, runs, firstAllGood, ok: same(rec.sort(), good.sort()) && runs.slice(0, 3).every(r => r.status === 'failed') && firstAllGood === 3 };
  });
  const first = await scenario('first', 0), middle = await scenario('middle', 1);
  return R(first.ok && middle.ok, { first, middle });
};

// Worker death at several points (plain error after a real commit / at the end of a body) and a lost claim answer: nothing is lost, no receipt is duplicated.
GATES.G07_REPEATED_MID_RUN_DEATH_AND_A_LOST_CLAIM_ANSWER_RECOVER = async cl => fresh(cl, 'G07', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  const ids = []; for (let i = 0; i < 8; i++) ids.push(await anchor(ctx, o, { id: rid(300 + i), t0Ms: w.now - DAY }));
  const deaths = [
    { afterCommitPlain: s => (isBeginTx(s) ? Error('worker died after begin committed') : null) },
    { bodyEnd: s => (isResolveTx(s) ? Error('worker died inside the resolver transaction') : null) },
    { afterCommitPlain: s => (isResolveTx(s) ? Error('worker died after the resolver transaction committed') : null) },
    { afterCommit: s => (isClaimTx(s) ? Object.assign(Error('write EPIPE'), { code: 'EPIPE' }) : null) },
    { afterCommitPlain: s => (isClaimTx(s) ? Error('worker died after the claim answer') : null) }
  ];
  // EVERY run is killed once (no clean run at all): progress may only come from work committed before the kill. pg-1 capped this at 30 runs and reached 6/8 (kept as a failure output); one receipt needs one rotation
  // of 5 runs here, so the cap is 8 ids x 5 + 10.
  const names = ['died-after-begin-commit', 'died-inside-resolver-tx', 'died-after-resolver-commit', 'claim-answer-lost-EPIPE', 'died-after-claim-answer'];
  const runs = [];
  for (let k = 0; k < 50 && (await receipts(ctx)).length < ids.length; k++) {
    const inj = deaths[k % deaths.length];
    let fired = false; const once = Object.fromEntries(Object.entries(inj).map(([kk, f]) => [kk, s => { if (fired) return null; const e = f(s); if (e) fired = true; return e; }]));
    const r = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E, once), LIM({ maxItems: 3 }));
    runs.push({ k, injection: names[k % names.length], fired, status: r.status, stop: r.stoppedBecause, recorded: r.recorded, skipped: r.skippedAfterAttempts });
  }
  const rec = (await receipts(ctx)).map(r => r.resource_id);
  const st = await state(ctx);
  const ok = same(rec.sort(), [...ids].sort()) && runs.every(r => r.fired && r.status !== 'ok') && runs.some(r => r.status === 'unknown') && st.skipped_total === '0';
  return R(ok, { runs, receipts: rec.length, st });
});

GATES.G08_COMMIT_UNKNOWN_AFTER_A_REAL_RESOLVER_COMMIT = async cl => fresh(cl, 'G08', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  const ids = [await anchor(ctx, o, { id: rid(401), t0Ms: w.now - DAY }), await anchor(ctx, o, { id: rid(402), t0Ms: w.now - DAY })];
  // The first resolver COMMIT is really applied, then the driver reports a socket failure without a server answer (EPIPE / EBADF / a raw '08006'-coded non-server error): unknown, the run stops, its driver is not
  // used again; the truth is read on an independent connection; the next run (a new driver) continues without a duplicate.
  const mk = inj => nodeDriver(dbUrl(ctx, login), M.E, inj);
  let fired = false; const raw = Object.assign(Error('write EPIPE'), { code: 'EPIPE', errno: -32, syscall: 'write' });
  const d1 = mk({ afterCommit: s => (!fired && isResolveTx(s) ? (fired = true, raw) : null) });
  const r1 = await sweep(M, d1);
  const txAfterUnknown = d1.transactions;
  const truthAfterFirst = { receipts: (await receipts(ctx)).map(r => r.resource_id), st: await state(ctx) };
  const r2 = await sweep(M, mk({}));
  const kinds = {};
  for (const [name, e] of [['ebadf', Object.assign(Error('EBADF'), { code: 'EBADF' })], ['raw08006', Object.assign(Error('connection failure'), { code: '08006' })]]) {
    const extra = await anchor(ctx, o, { id: rid(410 + Object.keys(kinds).length), t0Ms: w.now - DAY });
    let f = false; const r = await sweep(M, mk({ afterCommit: s => (!f && isResolveTx(s) ? (f = true, e) : null) }));
    kinds[name] = { status: r.status, unknown: r.commitOutcomeUnknown, committed: (await receipts(ctx)).some(x => x.resource_id === extra) };
  }
  const ok = r1.status === 'unknown' && r1.commitOutcomeUnknown === true && r1.recorded === 0 && txAfterUnknown === 3 && truthAfterFirst.receipts.length === 1 && truthAfterFirst.receipts[0] === ids[0] && truthAfterFirst.st.cursor_after === ids[0]
    && r2.recorded === 1 && Object.values(kinds).every(k => k.status === 'unknown' && k.unknown && k.committed);
  return R(ok, { r1, txAfterUnknown, truthAfterFirst, r2, kinds, receipts: (await receipts(ctx)).length });
});

GATES.G09_A_SERVER_ABORT_AT_COMMIT_IS_DEFINITE_AND_LEAVES_THE_CURSOR = async cl => fresh(cl, 'G09', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  const id = await anchor(ctx, o, { id: rid(501), t0Ms: w.now - DAY });
  await ctx.g.query(ctx.su, 'create table public.w_dup(k int, constraint w_dup_u unique (k) deferrable initially deferred)');
  await ctx.g.query(ctx.su, "create function public.w_dup_at_commit() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $f$ begin insert into public.w_dup values (1), (1); return null; end $f$");
  await ctx.g.query(ctx.su, `create trigger w_dup_at_commit after insert on ${ACQ}.detail_acquisition_records for each row execute function public.w_dup_at_commit()`);
  let captured = null;
  const d = nodeDriver(dbUrl(ctx, login), M.E);
  const inner = d.withTransaction.bind(d); d.withTransaction = async fn => { try { return await inner(fn); } catch (e) { if (e?.commitFailure) captured = { name: e.commitFailure.constructor?.name, code: e.commitFailure.code, severity: e.commitFailure.severity, attested: e.serverAnswer }; throw e; } };
  const r1 = await sweep(M, d);
  const after1 = { receipts: (await receipts(ctx)).length, st: await state(ctx), dup: (await q(ctx, 'select count(*)::int n from public.w_dup'))[0].n };
  await ctx.g.query(ctx.su, `drop trigger w_dup_at_commit on ${ACQ}.detail_acquisition_records`);
  const r2 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));
  const ok = r1.status === 'failed' && r1.commitOutcomeUnknown === false && captured?.name === 'DatabaseError' && captured.code === '23505' && captured.attested?.severity === 'ERROR'
    && after1.receipts === 0 && after1.st.cursor_after === null && after1.st.inflight_attempts === 1 && after1.dup === 0 && r2.recorded === 1 && (await receipts(ctx)).length === 1;
  return R(ok, { r1, captured, after1, r2 });
});

GATES.G10_PARTIAL_BATCH_KEEPS_CONFIRMED_AND_UNKNOWN_APART = async cl => fresh(cl, 'G10', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  const ids = [await anchor(ctx, o, { id: rid(601), t0Ms: w.now - DAY }), await anchor(ctx, o, { id: rid(602), t0Ms: w.now - DAY }), await anchor(ctx, o, { id: rid(603), t0Ms: w.now - DAY })];
  let n = 0;
  const r1 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E, { afterCommit: s => (isResolveTx(s) && ++n === 2 ? Object.assign(Error('write EPIPE'), { code: 'EPIPE' }) : null) }));
  const truth = { receipts: (await receipts(ctx)).map(r => r.resource_id), st: await state(ctx) };
  const log = [];
  const r2 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E, {}, log));
  const ok = r1.status === 'unknown' && r1.recorded === 1 && r1.commitOutcomeUnknown && same(truth.receipts, [ids[0], ids[1]]) && truth.st.cursor_after === ids[1]
    && r2.recorded === 1 && same(resolvedIds(log), [ids[2]]) && (await receipts(ctx)).length === 3;
  return R(ok, { r1, truth, r2, resolvedRun2: resolvedIds(log) });
});

GATES.G11_CONCURRENT_WORKERS_LOSE_NOTHING_AND_DUPLICATE_NO_RECEIPT = async cl => fresh(cl, 'G11', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1); const f = await paidOwner(ctx, w, 2, { fromMs: w.now - 395 * DAY, untilMs: w.now - 394 * DAY });
  const paid = [], free = [];
  for (let i = 0; i < 40; i++) { const id = await anchor(ctx, i % 4 === 0 ? f : o, { id: rid(700 + i), t0Ms: w.now - DAY }); (i % 4 === 0 ? free : paid).push(id); }
  const rounds = [];
  for (let k = 0; k < 40 && (await receipts(ctx)).length < paid.length; k++) {
    const rs = await Promise.all([0, 1, 2].map(() => sweep(M, nodeDriver(dbUrl(ctx, login), M.E), LIM({ pageSize: 5, examine: 20, maxItems: 10, maxClaims: 6 }))));
    rounds.push(rs.map(r => ({ status: r.status, stop: r.stoppedBecause, recorded: r.recorded, replayed: r.replayed, stale: r.stale, outOfOrder: r.outOfOrder, refused: r.refused })));
  }
  const rec = (await receipts(ctx)).map(r => r.resource_id);
  const ok = same(rec.sort(), [...paid].sort()) && new Set(rec).size === rec.length;
  return R(ok, { rounds, receipts: rec.length, paid: paid.length, st: await state(ctx) });
});

GATES.G12_LATE_VISIBLE_AND_NEW_ANCHORS_ARE_REACHED = async cl => fresh(cl, 'G12', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  for (const i of [10, 20, 30, 40]) await anchor(ctx, o, { id: rid(800 + i), t0Ms: w.now - DAY });
  // process two ids, so the cursor sits at 820
  const r1 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E), LIM({ maxItems: 2 }));
  const st1 = await state(ctx);
  // a meal transaction that is still open while the next run claims; its id (815) lies BEHIND the cursor, another (835) ahead
  const lateConn = await ctx.open('supabase_admin');
  await lateConn.query('begin'); await lateConn.query("set local session_replication_role = 'replica'");
  const ins = async (conn, id) => { const t0 = iso(w.now - DAY); await conn.query("insert into public.meal_records(id,user_id,meal_type,occurred_at,meal_date,source) values($1,$2,'lunch',$3::timestamptz,$4::date,'manual')", [id, o, t0, t0.slice(0, 10)]); await conn.query("insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values($1,$2,$3::timestamptz,'canonical_meal_insert','retention-capture-v1','authenticated_actor')", [id, o, t0]); };
  await ins(lateConn, rid(815)); await ins(lateConn, rid(835));
  const r2 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));   // sees 830, 840 only; wraps
  await lateConn.query('commit');
  const r3 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));   // next cycle: 815 and 835 are reached
  const rec = (await receipts(ctx)).map(r => r.resource_id);
  const ok = st1.cursor_after === rid(820) && rec.includes(rid(815)) && rec.includes(rid(835)) && rec.length === 6;
  return R(ok, { r1, st1, r2, r3, receipts: rec });
});

GATES.G13_LOCKS_ARE_PENDING_OR_BUSY_AND_RECOVER = async cl => fresh(cl, 'G13', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  const a = await anchor(ctx, o, { id: rid(901), t0Ms: w.now - DAY }), b = await anchor(ctx, o, { id: rid(902), t0Ms: w.now - DAY });
  const holder = await ctx.open('supabase_admin');
  await holder.query("select pg_advisory_lock(hashtextextended($1::text || ':retention_acquisition', 0))", [a]);
  const r1 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));
  await holder.query("select pg_advisory_unlock(hashtextextended($1::text || ':retention_acquisition', 0))", [a]);
  const afterLock = (await receipts(ctx)).map(r => r.resource_id);
  // state row lock: begin/advance answer 'busy' and the run stops without any change
  const st0 = await state(ctx);
  await holder.query('begin'); await holder.query(`select * from ${ACQ}.resolution_sweep_state for update`);
  const r2 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));
  const stBusy = await state(ctx);
  await holder.query('rollback');
  const r3 = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));
  const rec = (await receipts(ctx)).map(r => r.resource_id);
  const ok = r1.pending.ACQ_LOCK_TIMEOUT === 1 && r1.wrapped === 1 && same(afterLock, [b]) && r2.status === 'stopped' && r2.stoppedBecause === 'busy' && same(stBusy, st0) && same(rec.sort(), [a, b].sort());
  return R(ok, { r1, afterLock, r2, st0, stBusy, r3, receipts: rec });
});

// The database itself refuses any cursor move that would pass an unresolved anchor, whatever the caller sends.
GATES.G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES = async cl => fresh(cl, 'G14', async ctx => {
  const login = await workerLogin(ctx); const c = await ctx.open(login); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1, { fromMs: w.now - 395 * DAY, untilMs: w.now - 394 * DAY });
  for (const i of [1, 2, 3]) await anchor(ctx, o, { id: rid(1000 + i), t0Ms: w.now - DAY });
  const call = async (text, v) => (await c.query(text, v)).rows[0].s;
  const out = {
    advancePastUnresolved: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1003)]),
    examinedPastUnresolved: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'examined') s`, [rid(1002)]),
    wrapWithUnresolved: await call(`select ${ACQ}.advance_resolution_cursor(0, null, 'wrap') s`, []),
    beginNotNext: await call(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [rid(1002)]),
    beginWrongCycle: await call(`select ${ACQ}.begin_resolution_item(7, $1::uuid) s`, [rid(1001)]),
    advanceWrongCycle: await call(`select ${ACQ}.advance_resolution_cursor(7, $1::uuid, 'resolved') s`, [rid(1001)]),
    beginNext: await call(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [rid(1001)]),
    advanceNext: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1001)]),
    advanceBehind: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1001)]),
    examinedOntoUnresolved: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'examined') s`, [rid(1002)]),
    resolvedWithoutBegin: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1002)]),
    begin1002: await call(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [rid(1002)]),
    resolvedOtherThanBegun: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1003)]),
    resolved1002: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1002)]),
    begin1003: await call(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [rid(1003)]),
    resolved1003: await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1003)])
  };
  // an anchor that becomes visible between the cursor and an already begun id after the begin: the 'resolved' move onto that id is refused
  await anchor(ctx, o, { id: rid(1100), t0Ms: w.now - DAY });
  out.begin1100 = await call(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [rid(1100)]);
  await anchor(ctx, o, { id: rid(1050), t0Ms: w.now - DAY });
  out.resolvedPastLateAnchor = await call(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [rid(1100)]);
  let badArg = null; try { await c.query(`select ${ACQ}.advance_resolution_cursor(0, null, 'resolved')`); } catch (e) { badArg = e.code; }
  let badLimit = null; try { await c.query(`select ${ACQ}.claim_resolution_page(0, 10)`); } catch (e) { badLimit = e.code; }
  const st = await state(ctx);
  const refused = (k, reason) => out[k].outcome === 'refused' && out[k].reason === reason;
  const ok = refused('advancePastUnresolved', 'NOT_BEGUN') && refused('examinedPastUnresolved', 'UNRESOLVED_IN_RANGE') && refused('wrapWithUnresolved', 'UNRESOLVED_REMAIN') && out.beginNotNext.outcome === 'out_of_order'
    && out.beginWrongCycle.outcome === 'stale' && out.advanceWrongCycle.outcome === 'stale' && out.beginNext.outcome === 'proceed' && out.advanceNext.outcome === 'advanced' && out.advanceBehind.outcome === 'stale'
    && refused('examinedOntoUnresolved', 'UNRESOLVED_IN_RANGE') && refused('resolvedWithoutBegin', 'NOT_BEGUN') && out.begin1002.outcome === 'proceed' && refused('resolvedOtherThanBegun', 'NOT_BEGUN')
    && out.resolved1002.outcome === 'advanced' && out.begin1003.outcome === 'proceed' && out.resolved1003.outcome === 'advanced' && out.begin1100.outcome === 'proceed' && refused('resolvedPastLateAnchor', 'UNRESOLVED_BEFORE_TARGET')
    && badArg === '22023' && badLimit === '22023' && st.cursor_after === rid(1003) && st.inflight_resource === rid(1100);
  return R(ok, { out, badArg, badLimit, st });
});

GATES.G15_ENDPOINT_AGAINST_THE_REAL_DATABASE = async cl => fresh(cl, 'G15', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  await anchor(ctx, o, { id: rid(1101), t0Ms: w.now - DAY });
  const secret = 'S'.repeat(40);
  const env = { RETENTION_RESOLVE_ENABLED: 'true', RETENTION_RESOLVER_DB_URL: dbUrl(ctx, login), RETENTION_RESOLVE_SECRET: secret };
  const drivers = [];
  const deps = { loadConfig: () => M.C.loadRetentionResolveConfig(k => env[k]), createDriver: url => { const d = nodeDriver(url, M.E); drivers.push(d); return d; }, limits: LIM(), now: () => Date.now() };
  const res = await M.H.processRetentionResolveRequest(new Request('http://x/r', { method: 'POST', headers: { 'x-retention-resolve-secret': secret } }), deps);
  const body = await res.json();
  const ok = res.status === 200 && body.status === 'ok' && body.recorded === 1 && drivers.length === 1 && drivers[0].closed === 1 && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(JSON.stringify(body)) && (await receipts(ctx)).length === 1;
  return R(ok, { status: res.status, body, drivers: drivers.length, closed: drivers[0]?.closed });
});

// The longer retention tail: ENT0 + ENT1-A + ENT-R seal + ENT-F1 billing (the billing smoke's own fixture), then the draft. The later retention migrations only READ the acquisition owner, so the ENT1-A post digest
// still holds and the draft applies; one paid sweep then records. (Still NOT the full 152-migration chain: the social / ACT2 / PH1 migrations are not in this fixture.)
GATES.G16_DRAFT_APPLIES_AFTER_THE_SEAL_AND_BILLING_TAIL = async cl => BS.billingFresh(cl, 'G16', async ctx => {
  ctx.uid = 0;
  const d = await applyDraft(ctx);
  if (d.error) return R(false, { applyError: d.error });
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  await anchor(ctx, o, { id: rid(1201), t0Ms: w.now - DAY });
  const r = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));
  const sealPresent = (await q(ctx, "select to_regnamespace('retention_seal') is not null s, to_regnamespace('retention_billing') is not null b"))[0];
  return R(d.boundary && r.status === 'ok' && r.recorded === 1 && sealPresent.s && sealPresent.b, { boundary: d.boundary, r, sealPresent });
}, { apply: true });


// ===== checkpoint gap gates H01-H04 (byte-identical body, own scope) =====
const GAP_GATES = (() => {
const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
const WORKER = 'consumer_retention_acquisition_worker', ACQ = 'retention_acquisition', ENT = 'retention_entitlement';
const DRAFT_SQL = fs.readFileSync(DRAFT, 'utf8');
const FN_SIGS = [['admit_entitlement_event', 'uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint'], ['advance_entitlement_coverage', 'uuid, text, timestamp with time zone'], ['entitlement_state_at', 'uuid, timestamp with time zone']];
const session = () => { const S = EDGE.newEdgeSession({ stubs: { 'npm:postgres@3.4.7': { default: () => ({}) } } }); return { E: S.load('_shared/billing-transport/executor.ts'), W: S.load('_shared/acquisition-resolve/worker.ts') }; };
const q = (ctx, text, v = []) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
async function applyDraft(ctx) { ctx.extraRoles.add(WORKER); try { await ctx.g.query(ctx.su, DRAFT_SQL); return null; } catch (e) { await ctx.su.query('ROLLBACK').catch(() => {}); return { code: e.code, message: String(e.message) }; } }
const fresh = (cl, label, fn) => AQ.acqFresh(cl, label, async ctx => { const e = await applyDraft(ctx); if (e) throw Error('SETUP_DRAFT_APPLY ' + JSON.stringify(e)); return fn(ctx); }, { apply: true });
async function regWrite(ctx, text, values) { await ctx.su.query('begin'); try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); } catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; } }
async function makeUser(ctx, n) { const id = P.uuid(n); await q(ctx, 'insert into auth.users(id,email) values($1,$2)', [id, `h${n}@synthetic.invalid`]); return id; }
async function paidOwner(ctx, n) {
  const now = Date.now(); const role = 'h_p_billing';
  if (!ctx.producer) { ctx.extraRoles.add(role); await q(ctx, `create role ${role} login`); await q(ctx, `grant usage on schema ${ENT} to ${role}`); for (const [f, a] of FN_SIGS) await q(ctx, `grant execute on function ${ENT}.${f}(${a}) to ${role}`); await regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ('billing',$1,$2::timestamptz,null)`, [role, iso(now - 400 * DAY)]); ctx.producer = await ctx.open(role); }
  const o = await makeUser(ctx, n);
  await ctx.producer.query(`select ${ENT}.admit_entitlement_event($1::uuid,'billing',$2,'paid',$3::timestamptz,$4::timestamptz,null)`, [o, 'h-' + n, iso(now - 390 * DAY), iso(now + 30 * DAY)]);
  await ctx.producer.query(`select ${ENT}.advance_entitlement_coverage($1::uuid,'billing',$2::timestamptz)`, [o, iso(now - 1000)]);
  return o;
}
async function anchor(ctx, owner, id) {
  const t0 = iso(Date.now() - DAY);
  await ctx.su.query('begin');
  try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, "insert into public.meal_records(id,user_id,meal_type,occurred_at,meal_date,source) values($1,$2,'lunch',$3::timestamptz,$4::date,'manual')", [id, owner, t0, t0.slice(0, 10)]); await ctx.g.query(ctx.su, "insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values($1,$2,$3::timestamptz,'canonical_meal_insert','retention-capture-v1','authenticated_actor')", [id, owner, t0]); await ctx.su.query('commit'); }
  catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
  return id;
}
const rid = n => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
async function workerLogin(ctx, name = 'h_worker_login') { ctx.extraRoles.add(name); await q(ctx, `create role ${name} login`); await q(ctx, `grant ${WORKER} to ${name} with inherit true, set false`); return name; }
const dbUrl = (ctx, role) => `postgres://${role}@127.0.0.1:${ctx.cl.port}/${ctx.name}`;
const receipts = async ctx => (await q(ctx, `select resource_id from ${ACQ}.detail_acquisition_records order by resource_id`)).map(r => r.resource_id);
const state = async ctx => (await q(ctx, `select cycle::text, cursor_after, inflight_resource, inflight_attempts, skipped_total::text from ${ACQ}.resolution_sweep_state`))[0];
// Node driver (same as the suite's) plus `commitLost`: the driver ROLLS BACK instead of committing and then reports a commit-phase failure without a server answer (the COMMIT never reached the server).
function nodeDriver(url, E, inject = {}, log = null) {
  const u = new URL(url);
  const d = { transactions: 0, async withTransaction(fn) {
    const c = new Client({ host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username), database: u.pathname.slice(1), connectionTimeoutMillis: 5000 }); c.on('error', () => {});
    const stmts = [];
    try {
      await c.connect(); await c.query('begin'); d.transactions++;
      const s = { async query(text, params) { stmts.push(text); log?.push(text); return (await c.query(text, [...params])).rows; } };
      let result;
      try { result = await fn(s); } catch (e) { await c.query('rollback').catch(() => {}); throw e; }
      const lostBefore = inject.commitLost?.(stmts);
      if (lostBefore) { await c.query('rollback'); throw new E.BillingCommitPhaseError(lostBefore, null); }
      try { await c.query('commit'); } catch (e) { throw new E.BillingCommitPhaseError(e, e instanceof PgDatabaseError ? { code: e.code, severity: e.severity } : null); }
      const lostAfter = inject.afterCommit?.(stmts); if (lostAfter) throw new E.BillingCommitPhaseError(lostAfter, null);
      const died = inject.afterCommitPlain?.(stmts); if (died) throw died;
      return result;
    } finally { await c.end().catch(() => {}); }
  }, async close() {} };
  return d;
}
const isBeginTx = s => s.length === 1 && /begin_resolution_item/.test(s[0]);
const resolverCalls = log => log.filter(t => /resolve_detail_acquisition/.test(t)).length;
const LIM = Object.freeze({ pageSize: 20, examine: 1000, maxItems: 50, maxClaims: 10, budgetMs: 60000 });
const epipe = () => Object.assign(Error('write EPIPE'), { code: 'EPIPE' });
const once = f => { let fired = false; return s => { if (fired) return null; const e = f(s); if (e) fired = true; return e; }; };

const GATES = {};
// H01: three runs each die right after the begin COMMIT (before the resolver starts). Each run's committed state is read on an independent connection: the attempt counter rose by one and the resolver was never
// called. The 4th start skips the id for cycle 0 (no receipt, no decision written); that run wraps; the next run (cycle 1) processes the id and records its receipt.
GATES.H01_DEATH_AFTER_BEGIN_COMMIT_THEN_SKIP_THEN_NEXT_CYCLE = async cl => fresh(cl, 'H01', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const o = await paidOwner(ctx, 1); const id = await anchor(ctx, o, rid(1));
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const log = []; const r = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E, { afterCommitPlain: once(s => (isBeginTx(s) ? Error('worker died after the begin COMMIT') : null)) }, log), LIM, () => Date.now());
    runs.push({ k, status: r.status, resolverCalls: resolverCalls(log), st: await state(ctx), receipts: (await receipts(ctx)).length });
  }
  const log4 = []; const r4 = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E, {}, log4), LIM, () => Date.now());
  const after4 = { status: r4.status, skipped: r4.skippedAfterAttempts, wrapped: r4.wrapped, resolverCalls: resolverCalls(log4), st: await state(ctx), receipts: (await receipts(ctx)).length };
  const log5 = []; const r5 = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E, {}, log5), LIM, () => Date.now());
  const after5 = { status: r5.status, recorded: r5.recorded, wrapped: r5.wrapped, resolverCalls: resolverCalls(log5), st: await state(ctx), receipts: await receipts(ctx) };
  const ok = runs.every((x, i) => x.status === 'failed' && x.resolverCalls === 0 && x.receipts === 0 && x.st.inflight_resource === id && x.st.inflight_attempts === i + 1 && x.st.cursor_after === null && x.st.cycle === '0')
    && after4.skipped === 1 && after4.wrapped === 1 && after4.resolverCalls === 0 && after4.receipts === 0 && after4.st.cycle === '1' && after4.st.skipped_total === '1'
    // after recording in cycle 1 the same run finds nothing left and wraps (cycle 2, cursor reset): gaps-1 expected the cursor to stay on the id (test error, kept as a failure output)
    && after5.recorded === 1 && after5.resolverCalls === 1 && same(after5.receipts, [id]) && after5.wrapped === 1 && after5.st.cycle === '2' && after5.st.cursor_after === null;
  return R(ok, { runs, after4, after5 });
});

// H02: the begin transaction's OWN commit outcome is unknown - (a) the COMMIT was applied and the answer lost; (b) the COMMIT never reached the server (rolled back). The run stops 'unknown' without calling the
// resolver; the truth differs (attempt 1 committed vs nothing committed); the next run (new driver) proceeds either way and records once.
GATES.H02_BEGIN_COMMIT_OUTCOME_UNKNOWN = async cl => {
  const variant = async (label, inject, expectAttempts) => fresh(cl, 'H02-' + label, async ctx => {
    const M = session(); const login = await workerLogin(ctx); const o = await paidOwner(ctx, 1); const id = await anchor(ctx, o, rid(2));
    const log1 = []; const r1 = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E, inject, log1), LIM, () => Date.now());
    const truth1 = { st: await state(ctx), receipts: (await receipts(ctx)).length };
    const log2 = []; const r2 = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E, {}, log2), LIM, () => Date.now());
    const truth2 = { st: await state(ctx), receipts: await receipts(ctx) };
    const ok = r1.status === 'unknown' && r1.commitOutcomeUnknown && resolverCalls(log1) === 0 && truth1.receipts === 0 && truth1.st.inflight_attempts === expectAttempts && truth1.st.cursor_after === null
      && r2.recorded === 1 && r2.wrapped === 1 && resolverCalls(log2) === 1 && same(truth2.receipts, [id]) && truth2.st.cycle === '1' && truth2.st.cursor_after === null; // the recording run then wraps (gaps-1 expected cursor = id: test error)
    return { ok, r1: { status: r1.status, unknown: r1.commitOutcomeUnknown, resolverCalls: resolverCalls(log1) }, truth1, r2: { status: r2.status, recorded: r2.recorded, wrapped: r2.wrapped, resolverCalls: resolverCalls(log2) }, truth2 };
  });
  const applied = await variant('applied', { afterCommit: once(s => (isBeginTx(s) ? epipe() : null)) }, 1);
  const notApplied = await variant('not-applied', { commitLost: once(s => (isBeginTx(s) ? epipe() : null)) }, 0);
  return R(applied.ok && notApplied.ok, { applied, notApplied });
};

// H03: concurrent workers consume ONE id's attempt budget. Four separate worker connections call begin for the same id at once: exactly three 'proceed' (attempts 1..3) and one 'skipped_after_attempts' (the
// cursor moves onto the id, nothing else is written). The workers then die (no resolver call). The id is NOT receipted in cycle 0; the next sweep wraps, and the one after records it in cycle 1.
GATES.H03_CONCURRENT_WORKERS_CONSUME_ONE_IDS_ATTEMPTS = async cl => fresh(cl, 'H03', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const o = await paidOwner(ctx, 1); const id = await anchor(ctx, o, rid(3));
  const conns = []; for (let i = 0; i < 4; i++) conns.push(await ctx.open(login));
  const outcomes = (await Promise.all(conns.map(c => c.query(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [id]).then(r => r.rows[0].s)))).map(s => s.outcome).sort();
  const afterBegins = { st: await state(ctx), receipts: (await receipts(ctx)).length, pendingRowsWritten: (await q(ctx, `select count(*)::int n from ${ACQ}.detail_acquisition_records`))[0].n };
  const r1 = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E), LIM, () => Date.now());
  const afterWrap = { status: r1.status, wrapped: r1.wrapped, recorded: r1.recorded, st: await state(ctx) };
  const r2 = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E), LIM, () => Date.now());
  const final = { recorded: r2.recorded, st: await state(ctx), receipts: await receipts(ctx) };
  const ok = same(outcomes, ['proceed', 'proceed', 'proceed', 'skipped_after_attempts']) && afterBegins.st.cursor_after === id && afterBegins.st.skipped_total === '1' && afterBegins.st.inflight_resource === null && afterBegins.receipts === 0
    && afterWrap.wrapped === 1 && afterWrap.recorded === 0 && afterWrap.st.cycle === '1' && final.recorded === 1 && same(final.receipts, [id]);
  return R(ok, { outcomes, afterBegins, afterWrap, final });
});

// H04: in-flight work continues while the budget is exhausted by others: worker A has begun the id (attempt 1); three more begins exhaust the budget and skip it; A then completes resolver + 'resolved' advance in one
// transaction: the receipt commits (the resolver is idempotent and the skip did not decide anything), the advance answers 'stale' (the cursor is already on the id), and nothing is duplicated later.
GATES.H04_INFLIGHT_WORKER_FINISHES_AFTER_ITS_ID_WAS_SKIPPED = async cl => fresh(cl, 'H04', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const o = await paidOwner(ctx, 1); const id = await anchor(ctx, o, rid(4));
  const a = await ctx.open(login); const others = []; for (let i = 0; i < 3; i++) others.push(await ctx.open(login));
  const beginA = (await a.query(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [id])).rows[0].s.outcome;
  const beginsOthers = []; for (const c of others) beginsOthers.push((await c.query(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [id])).rows[0].s.outcome);
  await a.query('begin');
  const resolved = (await a.query(`select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [id])).rows[0].s.outcome;
  const moved = (await a.query(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [id])).rows[0].s.outcome;
  await a.query('commit');
  const mid = { st: await state(ctx), receipts: await receipts(ctx) };
  const log = []; const r = await M.W.runAcquisitionSweep(nodeDriver(dbUrl(ctx, login), M.E, {}, log), LIM, () => Date.now());
  const ok = beginA === 'proceed' && same(beginsOthers, ['proceed', 'proceed', 'skipped_after_attempts']) && resolved === 'recorded' && moved === 'stale' && same(mid.receipts, [id]) && mid.st.cursor_after === id
    && r.recorded === 0 && resolverCalls(log) === 0 && same(await receipts(ctx), [id]);
  return R(ok, { beginA, beginsOthers, resolved, moved, mid, next: { status: r.status, wrapped: r.wrapped, recorded: r.recorded, resolverCalls: resolverCalls(log) } });
});

return GATES;
})();

// ===== checkpoint Deno-vs-PostgreSQL gates E01-E05 (byte-identical body except the two repo paths, own scope) =====
// Throwaway self-signed certificate (CN=localhost, RSA-2048, sha256WithRSAEncryption, 2 days) built from DER by hand with node:crypto, for the LOCAL test cluster only: the pinned ENT-F2 driver hard-codes
// ssl:'require' (encryption, no verification), so the local PostgreSQL needs TLS. Never used outside the throwaway cluster; nothing is installed in any certificate store.
const len = n => n < 0x80 ? Buffer.from([n]) : (b => Buffer.concat([Buffer.from([0x80 | b.length]), b]))(Buffer.from(n.toString(16).padStart(Math.ceil(n.toString(16).length / 2) * 2, '0'), 'hex'));
const tlv = (tag, ...parts) => { const c = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(c.length), c]); };
const seq = (...p) => tlv(0x30, ...p), set = (...p) => tlv(0x31, ...p);
const oid = s => { const a = s.split('.').map(Number); const out = [40 * a[0] + a[1]]; for (const v of a.slice(2)) { const b = []; let x = v; do { b.unshift(x & 0x7f); x >>= 7; } while (x); for (let i = 0; i < b.length - 1; i++) b[i] |= 0x80; out.push(...b); } return tlv(0x06, Buffer.from(out)); };
const int = buf => tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);
const utc = d => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
function makeSelfSigned() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const alg = seq(oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]));
  const name = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from('localhost')))));
  const now = Date.now();
  const tbs = seq(tlv(0xa0, int(Buffer.from([2]))), int(crypto.randomBytes(8)), alg, name, seq(utc(new Date(now - 3600e3)), utc(new Date(now + 2 * 86400e3))), name, publicKey.export({ type: 'spki', format: 'der' }));
  const sig = crypto.sign('sha256', tbs, privateKey);
  const der = seq(tbs, alg, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  const pem = '-----BEGIN CERTIFICATE-----\n' + der.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  const x = new crypto.X509Certificate(pem);
  if (!x.verify(publicKey) || !/CN=localhost/.test(x.subject)) throw Error('SETUP_SELF_SIGNED_INVALID');
  return { certPem: pem, keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }), subject: x.subject, validTo: x.validTo, fingerprint256: x.fingerprint256 };
}

const DENO_PG = (() => {
const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000, iso = ms => new Date(ms).toISOString();
const WORKER = 'consumer_retention_acquisition_worker', ACQ = 'retention_acquisition', ENT = 'retention_entitlement', LOGIN = 'd_worker';
const DRAFT_SQL = fs.readFileSync(DRAFT, 'utf8');
const FN_SIGS = [['admit_entitlement_event', 'uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint'], ['advance_entitlement_coverage', 'uuid, text, timestamp with time zone'], ['entitlement_state_at', 'uuid, timestamp with time zone']];
const q = (ctx, text, v = []) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
const rid = n => `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
fs.mkdirSync(OUT, { recursive: true });

let tls = null;
async function enableTls(ctx) {
  const dir = (await q(ctx, 'show data_directory'))[0].data_directory;
  const c = makeSelfSigned();
  fs.writeFileSync(path.join(dir, 'server.crt'), c.certPem); fs.writeFileSync(path.join(dir, 'server.key'), c.keyPem);
  await ctx.su.query("alter system set ssl_cert_file = 'server.crt'"); await ctx.su.query("alter system set ssl_key_file = 'server.key'"); await ctx.su.query('alter system set ssl = on');
  await ctx.su.query('select pg_reload_conf()'); await sleep(800);
  const probe = new Client({ host: '127.0.0.1', port: ctx.cl.port, user: 'supabase_admin', database: ctx.name, ssl: { rejectUnauthorized: false } });
  await probe.connect(); const s = (await probe.query('select ssl, version from pg_stat_ssl where pid = pg_backend_pid()')).rows[0]; await probe.end();
  if (!s?.ssl) throw Error('SETUP_TLS_NOT_ACTIVE');
  return { subject: c.subject, validTo: c.validTo, fingerprint256: c.fingerprint256, sessionTls: s.version, note: 'throwaway self-signed certificate in the throwaway cluster data directory (ALTER SYSTEM of that cluster only)' };
}
const fresh = (cl, label, fn) => AQ.acqFresh(cl, label, async ctx => {
  ctx.extraRoles.add(WORKER);
  try { await ctx.g.query(ctx.su, DRAFT_SQL); } catch (e) { await ctx.su.query('ROLLBACK').catch(() => {}); throw Error('SETUP_DRAFT_APPLY ' + e.message); }
  if (!tls) tls = await enableTls(ctx);
  ctx.extraRoles.add(LOGIN); await q(ctx, `create role ${LOGIN} login`); await q(ctx, `grant ${WORKER} to ${LOGIN} with inherit true, set false`);
  const now = Date.now(), role = 'd_p_billing'; ctx.extraRoles.add(role);
  await q(ctx, `create role ${role} login`); await q(ctx, `grant usage on schema ${ENT} to ${role}`); for (const [f, a] of FN_SIGS) await q(ctx, `grant execute on function ${ENT}.${f}(${a}) to ${role}`);
  await ctx.su.query('begin'); await ctx.su.query("set local session_replication_role='replica'"); await q(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ('billing',$1,$2::timestamptz,null)`, [role, iso(now - 400 * DAY)]); await ctx.su.query('commit');
  const pc = await ctx.open(role);
  ctx.paid = P.uuid(1); ctx.unknown = P.uuid(2);
  for (const [i, o] of [[1, ctx.paid], [2, ctx.unknown]]) await q(ctx, 'insert into auth.users(id,email) values($1,$2)', [o, `d${i}@synthetic.invalid`]);
  await pc.query(`select ${ENT}.admit_entitlement_event($1::uuid,'billing','d-1','paid',$2::timestamptz,$3::timestamptz,null)`, [ctx.paid, iso(now - 390 * DAY), iso(now + 30 * DAY)]);
  await pc.query(`select ${ENT}.advance_entitlement_coverage($1::uuid,'billing',$2::timestamptz)`, [ctx.paid, iso(now - 1000)]);
  ctx.anchor = async (owner, id) => { const t0 = iso(now - DAY); await ctx.su.query('begin'); await ctx.su.query("set local session_replication_role='replica'");
    await q(ctx, "insert into public.meal_records(id,user_id,meal_type,occurred_at,meal_date,source) values($1,$2,'lunch',$3::timestamptz,$4::date,'manual')", [id, owner, t0, t0.slice(0, 10)]);
    await q(ctx, "insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values($1,$2,$3::timestamptz,'canonical_meal_insert','retention-capture-v1','authenticated_actor')", [id, owner, t0]); await ctx.su.query('commit'); return id; };
  return fn(ctx);
}, { apply: true });
const truth = async ctx => ({ receipts: (await q(ctx, `select resource_id from ${ACQ}.detail_acquisition_records order by 1`)).map(r => r.resource_id), st: (await q(ctx, `select cycle::text, cursor_after, inflight_resource, inflight_attempts from ${ACQ}.resolution_sweep_state`))[0] });
const runs = [];
function deno(ctx, scenario, label) {
  const workerUrl = `postgres://${LOGIN}@127.0.0.1:${ctx.cl.port}/${ctx.name}`, adminUrl = `postgres://supabase_admin@127.0.0.1:${ctx.cl.port}/${ctx.name}`;
  const args = ['run', '--no-config', '--no-lock', '--cached-only', '--no-prompt', '--allow-net=127.0.0.1', '--allow-env', path.join(ROOT, 'scripts/consumer-retention-acquisition-resolve-deno/pg.ts'), scenario, workerUrl, adminUrl, LOGIN, String(ctx.cl.port)];
  const p = spawnSync(DENO, args, { cwd: ROOT, env: { ...process.env, DENO_DIR, DENO_NO_UPDATE_CHECK: '1' }, encoding: 'utf8', timeout: 120000 });
  fs.writeFileSync(path.join(OUT, label + '.deno.txt'), `exit=${p.status} signal=${p.signal}\n--stdout--\n${p.stdout}\n--stderr--\n${p.stderr}`);
  const line = (p.stdout ?? '').split(/\r?\n/).find(l => l.startsWith('RESULT '));
  if (p.status !== 0 || !line) throw Error('SETUP_DENO_RUN ' + label + ' exit=' + p.status + ' ' + String(p.stderr).slice(-300));
  const r = JSON.parse(line.slice(7)); runs.push({ label, exit: p.status, ...r }); return r;
}
const waitNoCommit = async ctx => { for (let i = 0; i < 150; i++) { const n = (await q(ctx, "select count(*)::int n from pg_stat_activity where usename = $1 and state = 'active'", [LOGIN]))[0].n; if (n === 0) return i; await sleep(100); } return -1; };
const sleeper = async ctx => { await q(ctx, "create function public.d_sleep_at_commit() returns trigger language plpgsql as $f$ begin perform pg_sleep(4); return null; end $f$");
  await q(ctx, `create constraint trigger d_sleep_at_commit after insert on ${ACQ}.detail_acquisition_records deferrable initially deferred for each row execute function public.d_sleep_at_commit()`); };
const dropSleeper = ctx => q(ctx, `drop trigger d_sleep_at_commit on ${ACQ}.detail_acquisition_records`);

const GATES = {
  E01_NORMAL_TRANSACTION_OVER_TLS: async cl => fresh(cl, 'E01', async ctx => {
    const a = await ctx.anchor(ctx.paid, rid(1)), b = await ctx.anchor(ctx.unknown, rid(2));
    const r = deno(ctx, 'normal', 'E01'); const t = await truth(ctx);
    return R(r.summary.status === 'ok' && r.summary.recorded === 1 && r.summary.pending.COVERAGE_SHORT === 1 && r.summary.wrapped === 1 && r.commitFailures.length === 0 && same(t.receipts, [a]) && r.observed.sslSeen?.includes('true') && !r.observed.sslSeen?.includes('false'),
      { summary: r.summary, transactions: r.transactions, sslSeen: r.observed.sslSeen, truth: t, b });
  }),
  E02_TRUSTED_SERVER_ABORT_AT_COMMIT: async cl => fresh(cl, 'E02', async ctx => {
    const a = await ctx.anchor(ctx.paid, rid(1));
    await q(ctx, 'create table public.d_dup(k int, constraint d_dup_u unique (k) deferrable initially deferred)');
    await q(ctx, "create function public.d_dup_at_commit() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $f$ begin insert into public.d_dup values (1), (1); return null; end $f$");
    await q(ctx, `create trigger d_dup_at_commit after insert on ${ACQ}.detail_acquisition_records for each row execute function public.d_dup_at_commit()`);
    const r = deno(ctx, 'commit_abort', 'E02'); const t = await truth(ctx);
    await q(ctx, `drop trigger d_dup_at_commit on ${ACQ}.detail_acquisition_records`);
    const r2 = deno(ctx, 'normal', 'E02-after'); const t2 = await truth(ctx);
    const f = r.commitFailures[0];
    return R(r.summary.status === 'failed' && r.summary.commitOutcomeUnknown === false && f?.isPostgresError === true && f.code === '23505' && f.severity === 'ERROR' && same(f.serverAnswer, { code: '23505', severity: 'ERROR' })
      && t.receipts.length === 0 && t.st.cursor_after === null && t.st.inflight_attempts === 1 && r2.summary.recorded === 1 && same(t2.receipts, [a]),
      { summary: r.summary, commitFailures: r.commitFailures, truth: t, after: { summary: r2.summary, truth: t2 } });
  }),
  E03_BODY_FAILURE_ROLLS_BACK: async cl => fresh(cl, 'E03', async ctx => {
    const a = await ctx.anchor(ctx.paid, rid(1));
    await q(ctx, "create function public.d_fail() returns trigger language plpgsql as $f$ begin raise exception 'D_TEST_BODY_FAILURE' using errcode = '23514'; end $f$");
    await q(ctx, `create trigger d_fail before insert on ${ACQ}.detail_acquisition_records for each row execute function public.d_fail()`);
    const r = deno(ctx, 'body_rollback', 'E03'); const t = await truth(ctx);
    await q(ctx, `drop trigger d_fail on ${ACQ}.detail_acquisition_records`);
    const r2 = deno(ctx, 'normal', 'E03-after'); const t2 = await truth(ctx);
    return R(r.summary.status === 'failed' && r.summary.commitOutcomeUnknown === false && r.commitFailures.length === 0 && r.observed.nonCommitError?.code === '23514'
      && t.receipts.length === 0 && t.st.cursor_after === null && t.st.inflight_attempts === 1 && r2.summary.recorded === 1 && same(t2.receipts, [a]),
      { summary: r.summary, nonCommitError: r.observed.nonCommitError, truth: t, after: { summary: r2.summary, truth: t2 } });
  }),
  E04_SERVER_FATAL_DURING_COMMIT_IS_UNKNOWN: async cl => fresh(cl, 'E04', async ctx => {
    const a = await ctx.anchor(ctx.paid, rid(1)); await sleeper(ctx);
    const r = deno(ctx, 'fatal_at_commit', 'E04'); const waited = await waitNoCommit(ctx); const t = await truth(ctx);
    await dropSleeper(ctx); const r2 = deno(ctx, 'normal', 'E04-after'); const t2 = await truth(ctx);
    const f = r.commitFailures[0];
    return R(r.observed.terminated?.t === true && r.summary.status === 'unknown' && r.summary.commitOutcomeUnknown === true && f?.isPostgresError === true && f.severity === 'FATAL' && f.code === '57P01' && r.transactions === 3
      && t.receipts.length === 0 && t.st.cursor_after === null && r2.summary.recorded === 1 && same(t2.receipts, [a]),
      { summary: r.summary, transactions: r.transactions, commitFailures: r.commitFailures, terminated: r.observed.terminated, waited, truth: t, after: { summary: r2.summary, truth: t2 } });
  }),
  E05_TRANSPORT_LOSS_AFTER_THE_SERVER_COMMITTED_IS_UNKNOWN: async cl => fresh(cl, 'E05', async ctx => {
    const a = await ctx.anchor(ctx.paid, rid(1)); await sleeper(ctx);
    const r = deno(ctx, 'transport_after_commit', 'E05'); const waited = await waitNoCommit(ctx); const t = await truth(ctx);
    await dropSleeper(ctx); const r2 = deno(ctx, 'normal', 'E05-after'); const t2 = await truth(ctx);
    const f = r.commitFailures[0];
    return R(r.observed.proxyKilled !== undefined && r.summary.status === 'unknown' && r.summary.commitOutcomeUnknown === true && f !== undefined && f.isPostgresError === false && f.serverAnswer === null && r.transactions === 3
      && same(t.receipts, [a]) && t.st.cursor_after === a && r2.summary.recorded === 0 && r2.summary.replayed === 0 && same(t2.receipts, [a]),
      { summary: r.summary, transactions: r.transactions, commitFailures: r.commitFailures, proxyKilled: r.observed.proxyKilled, waited, truth: t, after: { summary: r2.summary, truth: t2 } });
  })
};

return { GATES, runs, tls: () => tls };
})();

// ===== new integration gates =====
// The checkpoint (and the rejected candidate 4fc3c6b3) migration bytes. ENT-W1-A01 changed the migration, so runtime evidence produced on these bytes does NOT apply to this tree's migration; the product TypeScript is unchanged.
const CHECKPOINT_MIGRATION_SHA256 = '19999f49f730d7669351e21e1e4fb183c56fb482be199a3b7e2bcd33fb1532b0';
const CHECKPOINT_PRODUCT_SHA256 = Object.freeze({"supabase/functions/_shared/acquisition-resolve/sql.ts":"14a61fd906d66d8f9a51858d11165c444882f4d2d8efce565a2d809f8dc2e7ef","supabase/functions/_shared/acquisition-resolve/worker.ts":"c6eaad91f12e4f68384c3b5643118a217ee7ae8a52826da9c01bc91b4b3c24fd","supabase/functions/retention-acquisition-resolve/config.ts":"aca37dd0474c5881fc2f993a8e1ae9d69a66fb447f1b0c12c575595cedf5bf1d","supabase/functions/retention-acquisition-resolve/handler.ts":"27fc37aa6acf8c30a49c83eede63df2c3def617c814eb0f9eb6369185acd54d2","supabase/functions/retention-acquisition-resolve/index.ts":"1dbf38f2d939764cd8518783a198534308fc58f3f134a210dfa9d87ad5c31c9e"});
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const NEW = {};
// ---- ENT-W1-A01: the per-resource / per-cycle start bound (the first independent acceptance's counterexample, and its controls) ----
// The judged quantity is the number of COMMITTED 'proceed' answers of begin_resolution_item for one (cycle, resource), observed at the driver boundary of transactions that committed, plus the truth read on an
// independent superuser connection (state row and, when present, the per-resource start rows). Never a handler label alone.
const A01_SECRET = 'a'.repeat(40);
function startsDriver(url, E, inject = {}) {
  const d = nodeDriver(url, E, inject), begins = [];
  return { begins, transactions: () => d.transactions, async withTransaction(fn) { const local = []; const out = await d.withTransaction(s => fn({ async query(text, params) { const rows = await s.query(text, params); if (/begin_resolution_item/.test(text)) local.push({ cycle: String(params[0]), resource: params[1], answer: rows[0]?.s ?? null }); return rows; } })); begins.push(...local); return out; }, async close() { await d.close(); } };
}
const startRows = async ctx => (await q(ctx, `select to_regclass('${ACQ}.resolution_attempts') is not null t`))[0].t ? (await q(ctx, `select cycle::text, resource_id, starts from ${ACQ}.resolution_attempts order by cycle, resource_id`)) : null;
async function handlerRun(M, ctx, url, inject) {
  const d = startsDriver(url, M.E, inject);
  const res = await M.H.processRetentionResolveRequest(new Request('http://x/r', { method: 'POST', headers: { 'x-retention-resolve-secret': A01_SECRET } }), { loadConfig: () => ({ ok: true, value: { resolverDbUrl: url, secret: A01_SECRET } }), createDriver: () => d, limits: LIM(), now: () => Date.now() });
  return { http: res.status, body: await res.json(), begins: d.begins, st: await state(ctx), rows: await startRows(ctx), receipts: (await receipts(ctx)).map(r => r.resource_id) };
}
const failOn = bad => ({ bodyEnd: s => (isResolveTx(s) && paramId(s) === bad ? Error('A01 injected persistent body failure for one resource') : null) });
const proceedCount = (runs, cycle, resource) => runs.flatMap(r => r.begins).filter(b => b.cycle === cycle && b.resource === resource && b.answer?.outcome === 'proceed').length;
// invariant of the start state at every observation: rows only for the CURRENT cycle and only for resources after the cursor; each 1..3
const startInvariant = r => r.rows === null || r.rows.every(x => x.cycle === r.st.cycle && (r.st.cursor_after === null || x.resource_id > r.st.cursor_after) && x.starts >= 1 && x.starts <= 3);
NEW.A01_LATE_LOWER_ANCHOR_KEEPS_THE_COMMITTED_STARTS_OF_A_FAILING_ID = async cl => {
  const scenario = async (label, withLate) => fresh(cl, 'A01-' + label, async ctx => {
    const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
    const low = rid(2001), bad = rid(2002), good = rid(2003); await anchor(ctx, o, { id: bad, t0Ms: w.now - DAY }); await anchor(ctx, o, { id: good, t0Ms: w.now - DAY });
    let late = null;
    if (withLate) { late = await ctx.open('supabase_admin'); await late.query('begin'); await late.query("set local session_replication_role = 'replica'"); const t0 = iso(w.now - DAY);
      await late.query("insert into public.meal_records(id,user_id,meal_type,occurred_at,meal_date,source) values($1,$2,'lunch',$3::timestamptz,$4::date,'manual')", [low, o, t0, t0.slice(0, 10)]);
      await late.query("insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values($1,$2,$3::timestamptz,'canonical_meal_insert','retention-capture-v1','authenticated_actor')", [low, o, t0]); }
    const url = dbUrl(ctx, login), runs = [];
    for (let k = 1; k <= 3; k++) runs.push({ k, ...(await handlerRun(M, ctx, url, failOn(bad))) });
    const visibleBefore = withLate ? (await q(ctx, 'select count(*)::int n from retention_capture.detail_capture_anchors where resource_id = $1', [low]))[0].n : null;
    if (late) await late.query('commit');
    for (let k = 4; k <= 6; k++) runs.push({ k, ...(await handlerRun(M, ctx, url, failOn(bad))) });
    const cycle0Bad = proceedCount(runs, '0', bad), cycle1Bad = proceedCount(runs, '1', bad);
    const r4 = runs[3];
    const skippedInCycle0 = runs.flatMap(r => r.begins).filter(b => b.cycle === '0' && b.resource === bad && b.answer?.outcome === 'skipped_after_attempts').length;
    const ok = runs.slice(0, 3).every((r, i) => r.http === 503 && r.body.status === 'failed' && r.st.cycle === '0' && r.st.inflight_resource === bad && r.st.inflight_attempts === i + 1 && r.receipts.length === 0)
      && (!withLate || visibleBefore === 0)
      && cycle0Bad === 3 && skippedInCycle0 === 1
      && r4.receipts.includes(good) && !r4.receipts.includes(bad) && (!withLate || r4.receipts.includes(low)) && r4.st.cycle === '1'
      && cycle1Bad >= 1 && runs.every(startInvariant);
    return { ok, cycle0BadProceedStarts: cycle0Bad, cycle0BadSkips: skippedInCycle0, cycle1BadProceedStarts: cycle1Bad, visibleBefore, runs: runs.map(r => ({ k: r.k, http: r.http, status: r.body.status, recorded: r.body.recorded, skipped: r.body.skippedAfterAttempts, begins: r.begins.map(b => b.cycle + ':' + b.resource.slice(-4) + ':' + (b.answer?.outcome ?? '?') + (b.answer?.attempt ? '#' + b.answer.attempt : '')), st: r.st, rows: r.rows, receipts: r.receipts.map(x => x.slice(-4)) })) };
  });
  const lateLower = await scenario('late-lower-anchor', true), control = await scenario('no-late-anchor-control', false);
  return R(lateLower.ok && control.ok, { lateLower, control, expected: 'exactly 3 committed proceed starts for the failing id in cycle 0, then one skip in cycle 0, later Paid ids recorded, a new start in cycle 1' });
};
NEW.A01_CONCURRENT_INTERLEAVED_AND_ROLLED_BACK_STARTS_STAY_WITHIN_THREE = async cl => fresh(cl, 'A01C', async ctx => {
  const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1, { fromMs: w.now - 395 * DAY, untilMs: w.now - 394 * DAY });
  const low = rid(3001), bad = rid(3002), next = rid(3003); await anchor(ctx, o, { id: bad, t0Ms: w.now - DAY }); await anchor(ctx, o, { id: next, t0Ms: w.now - DAY });
  const conns = []; for (let i = 0; i < 4; i++) conns.push(await ctx.open(login));
  const begin = (c, id) => c.query(`select ${ACQ}.begin_resolution_item(0, $1::uuid) s`, [id]).then(r => r.rows[0].s);
  const out = {};
  // (1) a start inside a transaction that ROLLS BACK is not counted
  await conns[0].query('begin'); out.rolledBack = await begin(conns[0], bad); await conns[0].query('rollback');
  out.afterRollback = { st: await state(ctx), rows: await startRows(ctx) };
  // (2) two concurrent committed starts on the failing id
  out.concurrentPair = (await Promise.all([begin(conns[1], bad), begin(conns[2], bad)])).map(s => s.outcome).sort();
  // (3) a lower anchor becomes visible; the failing id is no longer next; the lower one is begun, resolved (pending: Free) and passed in ONE transaction
  await anchor(ctx, o, { id: low, t0Ms: w.now - DAY });
  out.badWhileLowerUnresolved = (await begin(conns[1], bad)).outcome;
  out.lowerBegin = (await begin(conns[1], low)).outcome;
  await conns[1].query('begin'); out.lowerResolved = (await conns[1].query(`select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [low])).rows[0].s.outcome; out.lowerAdvanced = (await conns[1].query(`select ${ACQ}.advance_resolution_cursor(0, $1::uuid, 'resolved') s`, [low])).rows[0].s.outcome; await conns[1].query('commit');
  out.afterLower = { st: await state(ctx), rows: await startRows(ctx) };
  // (4) three concurrent starts on the failing id: only ONE more proceed may exist (the third), the rest skip or are stale
  out.concurrentTriple = (await Promise.all([begin(conns[1], bad), begin(conns[2], bad), begin(conns[3], bad)])).map(s => s.outcome).sort();
  out.final = { st: await state(ctx), rows: await startRows(ctx) };
  const proceeds = [...out.concurrentPair, ...out.concurrentTriple].filter(x => x === 'proceed').length;
  const ok = out.rolledBack.outcome === 'proceed' && out.afterRollback.st.inflight_resource === null && (out.afterRollback.rows === null || out.afterRollback.rows.length === 0)
    && same(out.concurrentPair, ['proceed', 'proceed']) && out.badWhileLowerUnresolved === 'out_of_order' && out.lowerBegin === 'proceed' && out.lowerResolved === 'pending' && out.lowerAdvanced === 'advanced'
    && proceeds === 3 && out.concurrentTriple.includes('skipped_after_attempts') && out.final.st.cursor_after === bad && out.final.st.skipped_total === '1' && (await receipts(ctx)).length === 0;
  return R(ok, { ...out, committedProceedStartsForBadInCycle0: proceeds });
});
NEW.A01_START_STATE_HAS_A_BOUNDED_LIFECYCLE = async cl => fresh(cl, 'A01L', async ctx => {
  const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
  const exists = (await q(ctx, `select to_regclass('${ACQ}.resolution_attempts') is not null t`))[0].t;
  if (!exists) return R(false, { startTable: 'absent: the rejected candidate keeps ONE inflight counter (no per-resource start state)' });
  const ids = [rid(4001), rid(4002), rid(4003)]; for (const id of ids) await anchor(ctx, o, { id, t0Ms: w.now - DAY });
  const url = dbUrl(ctx, login);
  const seen = [];
  const r1 = await handlerRun(M, ctx, url, failOn(ids[1])); seen.push(r1);                     // 4001 recorded, 4002 fails: one row (cycle 0, 4002, 1)
  const r2 = await handlerRun(M, ctx, url, {}); seen.push(r2);                                   // 4002, 4003 recorded, wrap: no row left
  const acl = (await q(ctx, `select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) owner, (select count(*)::int from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee <> c.relowner) others, has_table_privilege($1, '${ACQ}.resolution_attempts', 'SELECT,INSERT,UPDATE,DELETE') worker from pg_class c where c.oid = '${ACQ}.resolution_attempts'::regclass`, [WORKER]))[0];
  const ok = same(r1.rows, [{ cycle: '0', resource_id: ids[1], starts: 1 }]) && r2.rows.length === 0 && r2.st.cycle === '1' && r2.receipts.length === 3 && seen.every(startInvariant)
    && acl.relrowsecurity && acl.relforcerowsecurity && acl.owner === 'consumer_retention_acquisition_owner' && acl.others === 0 && acl.worker === false;
  return R(ok, { afterFailure: { st: r1.st, rows: r1.rows }, afterCycle: { st: r2.st, rows: r2.rows, receipts: r2.receipts.length }, acl });
});
NEW.F01_ENTW1_EXACT_SUCCESSOR_AND_INVENTORY = async () => {
  const w = P.checkedEntw1State(rootGit), chain = P.recoverySuccessorState(rootGit), act2 = P.checkedAct2State(rootGit);
  // R1-A (the outermost exact successor above ENT-W1): only with its complete exact record are its own migration and its non-ENT-W1 paths set aside; the ENT-W1 rows below are unchanged.
  const r1a = P.checkedR1aState(rootGit), r1aQualified = r1a.state === 'record' && chain.r1a === 'record';
  const r1aOnly = new Set(r1aQualified ? [...r1a.paths.filter(p => !(p in ENTW1_FILES)), P.R1A_MODULE_PATH] : []);
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(n => n.endsWith('.sql') && !(r1aQualified && n === R1A_MIGRATION)).sort();
  const changed = [...new Set([...rootGit(['diff', '--name-only', ENTW1_BASE_COMMIT]).split('\n').filter(Boolean), ...rootGit(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)])].filter(p => !r1aOnly.has(p)).sort();
  const expected = [...Object.keys(ENTW1_FILES), P.ENTW1_MODULE_PATH, 'scripts/consumer-retention-persistence-smoke.mjs'].sort();
  const baseTruth = Object.entries(ENTW1_FILES).filter(([p, f]) => { let at = null; try { at = rootGit(['rev-parse', ENTW1_BASE_COMMIT + ':' + p]).trim(); } catch { at = null; } return at !== f.base; }).map(([p]) => p);
  const migSha = sha256(fs.readFileSync(path.join(ROOT, 'supabase/migrations', ENTW1_MIGRATION)));
  const productDrift = Object.entries(CHECKPOINT_PRODUCT_SHA256).filter(([p, h]) => sha256(fs.readFileSync(path.join(ROOT, p))) !== h).map(([p]) => p);
  const config = { now: rootGit(['hash-object', '--', 'supabase/config.toml']).trim(), base: rootGit(['rev-parse', ENTW1_BASE_COMMIT + ':supabase/config.toml']).trim() };
  const tail0 = P.withAct2Tail([]), tail = r1aQualified && tail0.at(-1) === R1A_MIGRATION ? tail0.slice(0, -1) : tail0;
  const rows = {
    entw1Record: w.state === 'record',
    chainComplete: chain.exempt === true && chain.entw1 === 'record' && chain.ph1 === 'record' && chain.edge === 'record' && chain.act2 === 'record' && chain.billing === 'record',
    act2StateCarriesEntw1Paths: act2.state === 'record' && Object.keys(ENTW1_FILES).every(p => act2.paths.includes(p)) && act2.paths.includes(P.ENTW1_MODULE_PATH),
    migrationCount154: migrations.length === 154, lastIsEntw1: migrations.at(-1) === ENTW1_MIGRATION, tailEndsPh1ThenEntw1: JSON.stringify(tail.slice(-2)) === JSON.stringify([PH1_MIGRATION, ENTW1_MIGRATION]),
    migrationPinned: migSha === P.ENTW1_MIGRATION_SHA256, migrationIsNotTheRejectedA01Bytes: migSha !== CHECKPOINT_MIGRATION_SHA256, productIsCheckpointBytes: productDrift.length === 0,
    diffVsMainIsExactlyTheRecord: JSON.stringify(changed) === JSON.stringify(expected), recordedBasesAreTrue: baseTruth.length === 0, configTomlUnchanged: config.now === config.base
  };
  return R(Object.values(rows).every(Boolean), { rows, r1aQualified, changed, expected, baseTruth, productDrift, migSha, tail: tail.slice(-3), chain: { state: chain.state, entw1: chain.entw1, ph1: chain.ph1, edge: chain.edge, act2: chain.act2, billing: chain.billing, violations: chain.violations }, w: { state: w.state, violations: w.violations } });
};
// Wrapper over the real git that changes what one path reports (index blob and/or worktree hash): the "tampered / partial / mixed" states, without touching any byte on disk.
const lyingGit = (git, { stage = {}, hash = {} }) => args => {
  const out = git(args);
  if (args[0] === 'ls-files' && args.includes('--stage')) return out.split('\n').map(l => { const t = l.indexOf('\t'), n = l.slice(t + 1); return t < 0 || !(n in stage) ? l : stage[n] === null ? '' : stage[n] + ' 0\t' + n; }).filter(Boolean).join('\n') + '\n';
  if (args[0] === 'hash-object' && args.includes('--')) { const names = args.slice(args.indexOf('--') + 1), ls = out.trim().split('\n'); return names.map((n, i) => (n in hash ? hash[n] : ls[i])).join('\n') + '\n'; }
  return out;
};
const FAKE = 'f'.repeat(40);
// P14 module-resolution controls (virtual files through resolverWiringProof's extra/drop; the real worktree/index controls are F04). Every refused case must be refused BY P14's own wiring evidence (an extra edge,
// name or unresolved reference, or an invalid record), not by another guard.
const P14_CASES = {
  sameDirectoryRelativeImport: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'import { runAcquisitionSweep } from "./worker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge' },
  sharedParentRelativeImport: { file: 'supabase/functions/_shared/zz-extra-caller.ts', body: 'import { runAcquisitionSweep } from "./acquisition-resolve/worker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge' },
  upOneLevelRelativeImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'import { runAcquisitionSweep } from "../_shared/acquisition-resolve/worker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge' },
  dottedDetourImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'import { runAcquisitionSweep } from "../zz-extra-caller/../_shared/./acquisition-resolve/worker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge' },
  reExport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export * from "../_shared/acquisition-resolve/worker.ts";\n', refuse: 'edge' },
  namedReExport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export { runAcquisitionSweep as run } from "../_shared/acquisition-resolve/worker.ts";\n', refuse: 'edge' },
  typeOnlyImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'import type { SweepLimits } from "../_shared/acquisition-resolve/worker.ts";\nexport type L = SweepLimits;\n', refuse: 'edge' },
  dynamicImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export const load = () => import("../_shared/acquisition-resolve/worker.ts");\n', refuse: 'edge' },
  entrypointHandlerImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'import { processRetentionResolveRequest } from "../retention-acquisition-resolve/handler.ts";\nexport const h = processRetentionResolveRequest;\n', refuse: 'edge' },
  computedSpecifier: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'const n = "worker";\nexport const load = () => import(`../_shared/acquisition-resolve/${n}.ts`);\n', refuse: 'unresolved' },
  newEdgeInsideTheModule: { file: 'supabase/functions/retention-acquisition-resolve/zz-extra.ts', body: 'export * from "../_shared/acquisition-resolve/sql.ts";\n', refuse: 'edge' },
  extraFileNamesTheResolver: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export const s = "select retention_acquisition.resolve_detail_acquisition($1)";\n', refuse: 'name' },
  unrelatedRelativeImportPositive: { file: 'supabase/functions/zz-unrelated/index.ts', body: 'import { jsonResponse } from "../_shared/billing-transport/http.ts";\nimport "./local.ts";\nexport const r = jsonResponse;\n', refuse: null },
  unrelatedSiblingNamedLikeTheModulePositive: { file: 'supabase/functions/zz-unrelated/acquisition-resolve-notes.ts', body: 'import { x } from "./other.ts";\nexport const y = x;\n', refuse: null },
  // ENT-W1-A02 (targeted re-acceptance): the parser, not a pattern, reads comments, line breaks and escapes. `target` = the decoded, normalized edge the refusal must name.
  dynamicImportBlockComment: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const anotherWorker = () => import(/* valid comment */ "./worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  dynamicImportLineCommentAndNewlines: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const anotherWorker = () =>\n  import(\n    // the worker\n    "./worker.ts"\n  );\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  dynamicImportWithOptions: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const anotherWorker = () => import("./worker.ts", { with: {} });\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  staticImportWithComments: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'import /* a */ { runAcquisitionSweep } /* b */ from /* c */ "./worker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  multilineReExportFromParent: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export {\n  runAcquisitionSweep,\n} from\n  "../_shared/acquisition-resolve/worker.ts";\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  escapedSpecifier: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'import { runAcquisitionSweep } from "./w\\u006frker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  percentEncodedSpecifier: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const w = () => import("./w%6Frker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  templateLiteralSpecifier: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const w = () => import(`./worker.ts`);\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  requireCall: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'declare const require: (m: string) => unknown;\nexport const w = require(/* c */ "./worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  importEqualsRequire: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'import w = require("./worker.ts");\nexport const again = w;\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  importTypeNode: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export type W = typeof import("../_shared/acquisition-resolve/worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  newUrlWorker: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const w = new Worker(new URL("./worker.ts", import.meta.url).href, { type: "module" });\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  importMetaResolve: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'export const u = import.meta.resolve("./worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  tripleSlashReferencePath: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: '/// <reference path="./worker.ts" />\nexport const x = 1;\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  nonLiteralDynamicImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'const m = "x";\nexport const load = () => import(m);\n', refuse: 'unresolved' },
  stringNamingTheModuleDirectory: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export const where = "../_shared/acquisition-resolve/worker.ts";\n', refuse: 'unresolved' },
  sourceThatDoesNotParse: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.ts', body: 'import { runAcquisitionSweep from "./worker.ts";\n', refuse: 'unresolved' },
  commentedOutReferencesPositive: { file: 'supabase/functions/zz-unrelated/index.ts', body: '// import "../_shared/acquisition-resolve/worker.ts";\n/* export * from "../_shared/acquisition-resolve/worker.ts"; import("../_shared/acquisition-resolve/worker.ts") */\nexport const x = 1;\n', refuse: null },
  unrelatedDynamicImportWithCommentPositive: { file: 'supabase/functions/zz-unrelated/index.ts', body: 'export const l = () => import(/* valid comment */ "../_shared/billing-transport/http.ts");\n', refuse: null },
  unrelatedReExportPositive: { file: 'supabase/functions/zz-unrelated/index.ts', body: 'export * from "../_shared/billing-transport/http.ts";\nexport { jsonResponse as j } from "../_shared/billing-transport/http.ts";\n', refuse: null },
  unrelatedSharedSiblingImportPositive: { file: 'supabase/functions/_shared/zz-unrelated.ts', body: 'export const helper = () => import("./billing-transport/executor.ts");\n', refuse: null },
  // ENT-W1-A02 (second targeted re-acceptance): target IDENTITY under every supported loader, canonicalized by the real file system (Windows separators, case aliases, absolute paths, file URLs,
  // directory loads). Unrelated Windows-style references stay accepted; a reference that cannot be canonicalized is refused as unresolved.
  windowsBackslashRequire: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require(".\\\\worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  caseAliasRequire: { file: 'supabase/functions/_shared/acquisition-resolve/zz-extra-caller.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require("../ACQUISITION-RESOLVE/worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  mixedSeparatorsAndCaseRequire: { file: 'supabase/functions/zz-extra-caller/index.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require("..\\\\_shared/Acquisition-Resolve\\\\WORKER.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  outsideBackslashRequire: { file: 'supabase/functions/_shared/zz-extra-caller.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require(".\\\\acquisition-resolve\\\\worker.ts");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  caseAliasStaticImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'import { runAcquisitionSweep } from "../_shared/ACQUISITION-RESOLVE/worker.ts";\nexport const again = runAcquisitionSweep;\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  caseAliasEntrypointReExport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export * from "../Retention-Acquisition-Resolve/handler.ts";\n', refuse: 'edge', target: 'supabase/functions/retention-acquisition-resolve/handler.ts' },
  absoluteWindowsPathRequire: { file: 'supabase/functions/zz-extra-caller/index.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require(' + JSON.stringify(path.win32.join(ROOT, 'supabase', 'functions', '_shared', 'acquisition-resolve', 'worker.ts')) + ');\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  fileUrlImport: { file: 'supabase/functions/zz-extra-caller/index.ts', body: 'export const w = () => import(' + JSON.stringify(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/acquisition-resolve/worker.ts')).href) + ');\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve/worker.ts' },
  directoryLoad: { file: 'supabase/functions/_shared/acquisition-resolve/zz-sub/zz-extra-caller.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = () => require("..");\n', refuse: 'edge', target: 'supabase/functions/_shared/acquisition-resolve' },
  unresolvableRelativeReference: { file: 'supabase/functions/zz-extra-caller/index.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = () => require("./zz\\u0000.ts");\n', refuse: 'unresolved' },
  unrelatedWindowsRequirePositive: { file: 'supabase/functions/_shared/zz-unrelated.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require(".\\\\billing-transport\\\\executor.ts");\n', refuse: null },
  unrelatedWindowsCaseAliasPositive: { file: 'supabase/functions/_shared/zz-unrelated.mjs', body: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nexport const loaded = require(".\\\\BILLING-TRANSPORT\\\\executor.ts");\n', refuse: null },
  unrelatedAbsoluteUrlAndCasePositive: { file: 'supabase/functions/zz-unrelated/index.ts', body: 'export const a = () => import(' + JSON.stringify(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared/billing-transport/http.ts')).href) + ');\nexport const b = () => import("../_shared/Billing-Transport/http.ts");\n', refuse: null }
};
NEW.F02_P14_WIRING_IS_EXACT_AND_REFUSES_EVERY_DEVIATION = async () => {
  const proof = o => AQ.resolverWiringProof(o);
  const sqlTs = 'supabase/functions/_shared/acquisition-resolve/sql.ts';
  const exact = proof({ git: rootGit });
  const cases = {};
  for (const [k, c] of Object.entries(P14_CASES)) { const v = proof({ git: rootGit, extra: { [c.file]: c.body } }); const extraEdges = v.edges.filter(e => !ENTW1_WIRING.edges.includes(e)); const extraNames = v.names.filter(n => !ENTW1_WIRING.names.includes(n));
    const byOwnEvidence = c.refuse === 'edge' ? (c.target ? extraEdges.includes(c.file + ' -> ' + c.target) : extraEdges.some(e => e.startsWith(c.file + ' -> '))) : c.refuse === 'name' ? extraNames.includes(c.file) : c.refuse === 'unresolved' ? v.unresolved.includes(c.file) : true;
    cases[k] = { expected: c.refuse ? 'refused (' + c.refuse + ')' : 'accepted', ok: v.ok, pass: c.refuse ? v.ok === false && byOwnEvidence && v.entw1 === 'record' : v.ok === true && v.unresolved.length === 0, extraEdges, extraNames, unresolved: v.unresolved, unresolvedReasons: v.unresolvedReasons }; }
  const integrity = {
    recordedFileTampered: proof({ git: lyingGit(rootGit, { hash: { [sqlTs]: FAKE } }) }),
    recordedNameFileMissing: proof({ git: rootGit, drop: [sqlTs] }),
    newModuleWithOldLeaves: proof({ git: entw1PredecessorGit(rootGit) }),
    moduleTampered: proof({ git: lyingGit(rootGit, { hash: { [P.ENTW1_MODULE_PATH]: FAKE } }) })
  };
  // a parser that cannot be loaded is a SETUP error: P14 must throw SETUP_P14_PARSER, never return a refusal that a caller could count as a detection
  let parserSetup;
  try { const v = proof({ git: rootGit, parser: () => { throw Error('parser unavailable (control)'); } }); parserSetup = { threw: false, returned: { ok: v.ok } }; }
  catch (e) { parserSetup = { threw: true, message: String(e.message).slice(0, 160), setup: /^SETUP_P14_PARSER /.test(e.message) }; }
  const oldRuleOnThisTree = { names: exact.names.length, passes: exact.names.length === 0 };
  const ok = exact.ok && exact.entw1 === 'record' && same(exact.names, [...ENTW1_WIRING.names].sort()) && same(exact.edges, [...ENTW1_WIRING.edges].sort()) && exact.edges.length > 0 && exact.unresolved.length === 0
    && Object.values(cases).every(c => c.pass) && Object.values(integrity).every(v => v.ok === false)
    && integrity.recordedFileTampered.entw1 === 'invalid' && integrity.newModuleWithOldLeaves.entw1 === 'invalid' && integrity.moduleTampered.entw1 === 'invalid' && oldRuleOnThisTree.passes === false
    && parserSetup.threw === true && parserSetup.setup === true;
  return R(ok, { exact: { ok: exact.ok, names: exact.names, edges: exact.edges, unresolved: exact.unresolved }, cases, integrity: Object.fromEntries(Object.entries(integrity).map(([k, v]) => [k, { ok: v.ok, entw1: v.entw1, violations: (v.entw1Violations ?? []).slice(0, 4) }])), parserSetup, oldRuleOnThisTree, note: 'old rule = the P14 of main 9d4d50c5 (no file may name the resolver): it refuses this tree, which is why P14 had to change' });
};
// P14 with REAL bytes: a throwaway clone of this tree (git clone --shared, junctions to this tree's node_modules removed afterwards with a non-recursive rmdir); each control writes a real file into the worktree,
// then also stages it, and asks the clone's own P14 wiring proof; the exact candidate must be accepted before, between and after the controls.
NEW.F04_P14_REAL_WORKTREE_AND_INDEX_CONTROLS = async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entw1-p14-')), Q = path.join(tmp, 'fx');
  const g = (cwd, args) => { const r = child.spawnSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 256e6 }); if (r.status) throw Error('SETUP_GIT ' + args.join(' ') + ' ' + r.stderr); return r.stdout; };
  const links = [];
  try {
    if (rootGit(['diff', '--name-only']).trim() || rootGit(['ls-files', '--others', '--exclude-standard']).trim()) throw Error('SETUP_F04_NEEDS_NO_UNSTAGED_OR_UNTRACKED_CHANGE');
    g(tmp, ['clone', '--shared', '--no-checkout', '--quiet', ROOT, Q]); g(Q, ['config', 'core.autocrlf', 'false']); g(Q, ['checkout', '--quiet', '--detach', rootGit(['rev-parse', 'HEAD']).trim()]);
    // an uncommitted staged candidate: carry the index state of the leaves into the fixture
    const staged = rootGit(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
    for (const p of staged) { if (fs.existsSync(path.join(ROOT, p))) { fs.mkdirSync(path.dirname(path.join(Q, p)), { recursive: true }); fs.copyFileSync(path.join(ROOT, p), path.join(Q, p)); g(Q, ['add', '--', p]); } }
    for (const l of ['node_modules', 'apps/mobile/node_modules']) { const t = fs.realpathSync(path.join(ROOT, l)); fs.symlinkSync(t, path.join(Q, l), 'junction'); links.push(path.join(Q, l)); }
    const AQX = await import(pathToFileURL(path.join(Q, 'scripts/consumer-retention-acquisition-smoke.mjs')).href);
    const qGit = args => g(Q, args), idx = fs.readFileSync(path.join(Q, '.git/index'));
    const proof = () => { const v = AQX.resolverWiringProof({ git: qGit }); return { ok: v.ok, entw1: v.entw1, edges: v.edges, names: v.names, unresolved: v.unresolved }; };
    const rows = [{ name: 'exact-before', ...proof() }];
    for (const k of ['sameDirectoryRelativeImport', 'sharedParentRelativeImport', 'upOneLevelRelativeImport', 'reExport', 'dynamicImport', 'computedSpecifier', 'unrelatedRelativeImportPositive',
      'dynamicImportBlockComment', 'dynamicImportLineCommentAndNewlines', 'escapedSpecifier', 'commentedOutReferencesPositive', 'unrelatedSharedSiblingImportPositive',
      'windowsBackslashRequire', 'caseAliasRequire', 'mixedSeparatorsAndCaseRequire', 'unrelatedWindowsRequirePositive', 'unrelatedWindowsCaseAliasPositive']) {
      const c = P14_CASES[k], abs = path.join(Q, c.file), created = !fs.existsSync(path.dirname(abs));
      try { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, c.body); rows.push({ name: k + ':worktree', expectRefused: !!c.refuse, ...proof() }); g(Q, ['add', '--', c.file]); rows.push({ name: k + ':staged', expectRefused: !!c.refuse, ...proof() }); }
      finally { fs.writeFileSync(path.join(Q, '.git/index'), idx); fs.rmSync(abs, { force: true }); if (created) { try { fs.rmdirSync(path.dirname(abs)); } catch { /* not empty or gone */ } } }
      rows.push({ name: k + ':restored', ...proof() });
    }
    const clean = g(Q, ['status', '--porcelain', '--untracked-files=all']).trim() === '' || staged.length > 0;
    rows.push({ name: 'exact-after', ...proof() });
    const ok = rows.every(r => (r.expectRefused === undefined ? r.ok === true && r.entw1 === 'record' : r.expectRefused ? r.ok === false && r.entw1 === 'record' : r.ok === true)) && clean;
    return R(ok, { rows, fixtureClean: clean });
  } finally {
    for (const l of links) { try { child.spawnSync('cmd', ['/c', 'rmdir', l]); } catch { /* gone */ } }
    const leftLinks = links.filter(l => { try { fs.lstatSync(l); return true; } catch { return false; } });
    if (leftLinks.length === 0) fs.rmSync(tmp, { recursive: true, force: true });
  }
};
NEW.F03_SUCCESSOR_BINDING_REFUSES_TAMPERED_PARTIAL_AND_MIXED_STATES = async () => {
  const leaf = 'supabase/functions/_shared/acquisition-resolve/worker.ts', mod = P.ENTW1_MODULE_PATH, ph1Mod = 'scripts/s2-ph1-exact-successor.mjs', capture = 'scripts/consumer-retention-capture-smoke.mjs';
  const f = ENTW1_FILES[capture];
  const states = git => ({ entw1: P.checkedEntw1State(git).state, chain: P.recoverySuccessorState(git).state, chainEntw1: P.recoverySuccessorState(git).entw1 ?? null, act2: P.checkedAct2State(git).state, ph1: P.checkedPH1State(git).state });
  const cases = {
    exact: states(rootGit),
    moduleBlobTampered: states(lyingGit(rootGit, { hash: { [mod]: FAKE } })),
    moduleIndexMismatch: states(lyingGit(rootGit, { stage: { [mod]: '100644 ' + FAKE } })),
    leafTampered: states(lyingGit(rootGit, { hash: { [leaf]: FAKE } })),
    leafPartiallyRevertedToMain: states(lyingGit(rootGit, { stage: { [capture]: f.baseMode + ' ' + f.base }, hash: { [capture]: f.base } })),
    ph1ModuleTamperedUnderExactEntw1: states(lyingGit(rootGit, { hash: { [ph1Mod]: FAKE } }))
  };
  const bad = s => s.entw1 === 'invalid' || s.chain === 'invalid';
  const ok = cases.exact.entw1 === 'record' && cases.exact.chainEntw1 === 'record' && cases.exact.act2 === 'record' && cases.exact.ph1 === 'record'
    && ['moduleBlobTampered', 'moduleIndexMismatch', 'leafTampered', 'leafPartiallyRevertedToMain'].every(k => cases[k].entw1 === 'invalid' && cases[k].chain === 'invalid' && cases[k].act2 === 'invalid')
    && bad(cases.ph1ModuleTamperedUnderExactEntw1) && cases.ph1ModuleTamperedUnderExactEntw1.chain === 'invalid' && cases.ph1ModuleTamperedUnderExactEntw1.act2 === 'invalid';
  return R(ok, cases);
};
// ---- real Deno (same scripts as the checkpoint, repo paths) ----
const DENO_SCRIPTS = 'scripts/consumer-retention-acquisition-resolve-deno';
const PRODUCT_FILES = Object.keys(CHECKPOINT_PRODUCT_SHA256);
function denoSetup() { if (!DENO || !fs.existsSync(DENO)) throw Error('SETUP_DENO_MISSING --deno'); if (!DENO_DIR || !fs.existsSync(path.join(DENO_DIR, 'npm/registry.npmjs.org/postgres/3.4.7/package.json'))) throw Error('SETUP_DENO_DIR_WITHOUT_PINNED_POSTGRES --deno-dir'); }
function deno(args, label) { denoSetup(); const p = spawnSync(DENO, args, { cwd: ROOT, env: { ...process.env, DENO_DIR, DENO_NO_UPDATE_CHECK: '1' }, encoding: 'utf8', timeout: 180000 }); fs.writeFileSync(path.join(OUT, label + '.deno.txt'), 'exit=' + p.status + '\n--stdout--\n' + p.stdout + '\n--stderr--\n' + p.stderr); if (p.error) throw Error('SETUP_DENO_SPAWN ' + p.error.message); return p; }
const resultLine = p => { const l = (p.stdout ?? '').split(/\r?\n/).find(x => x.startsWith('RESULT ')); return l ? JSON.parse(l.slice(7)) : null; };
NEW.D01_DENO_TYPE_CHECK_OF_PRODUCT_AND_DENO_SCRIPTS = async () => {
  const p = deno(['check', '--no-config', '--no-lock', ...PRODUCT_FILES, DENO_SCRIPTS + '/pure.ts', DENO_SCRIPTS + '/index.ts', DENO_SCRIPTS + '/pg.ts'], 'D01');
  const downloads = (p.stderr ?? '').split('\n').filter(l => /^Download/.test(l));
  return R(p.status === 0 && downloads.length === 0, { exit: p.status, downloads, stderrTail: String(p.stderr).slice(-800) });
};
NEW.D02_DENO_RUNTIME_WITHOUT_NETWORK = async () => {
  const p = deno(['run', '--no-config', '--no-lock', '--cached-only', '--no-prompt', '--allow-env', DENO_SCRIPTS + '/pure.ts'], 'D02'); const r = resultLine(p);
  if (!r) throw Error('SETUP_DENO_NO_RESULT D02 exit=' + p.status + ' ' + String(p.stderr).slice(-300));
  return R(p.status === 0 && r.status === 'PASS' && r.total === 8, { exit: p.status, ...r });
};
NEW.D03_DENO_SERVE_ENTRY = async () => {
  const p = deno(['run', '--no-config', '--no-lock', '--cached-only', '--no-prompt', '--allow-run=' + DENO, '--allow-net=127.0.0.1:8000', '--allow-env', DENO_SCRIPTS + '/index.ts', DENO, path.join(ROOT, 'supabase/functions/retention-acquisition-resolve/index.ts'), DENO_DIR], 'D03'); const r = resultLine(p);
  if (!r) throw Error('SETUP_DENO_NO_RESULT D03 exit=' + p.status + ' ' + String(p.stderr).slice(-300));
  return R(p.status === 0 && r.status === 'PASS' && r.total === 2, { exit: p.status, ...r });
};
// ---- the FULL migration chain of this tree (own throwaway cluster; same installer rule as the accepted PH1 harness, plus this migration as a superuser installer) ----
NEW.G17_FULL_MIGRATION_CHAIN_APPLIES_AND_ONE_PAID_SWEEP_RECORDS = async () => {
  const rec = P.recorder(path.join(OUT, 'gates', 'G17')); let cl = null;
  try {
    cl = await P.cluster(BIN, rec);
    const su = await cl.connect('postgres', 'supabase_admin');
    // as the accepted PH1 full-chain harness: real Supabase Auth fields absent from the legacy stub, the standard auth.jwt(), and BYPASSRLS for the postgres installer
    await rec.query(su, "alter table auth.users add column phone text unique,add column phone_confirmed_at timestamptz,add column banned_until timestamptz,add column deleted_at timestamptz,add column email_confirmed_at timestamptz,add column is_anonymous boolean not null default false;alter role postgres bypassrls;");
    await rec.query(su, "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;");
    const db = await P.baseline(cl, rec, { legacy: true }); // exact inventory recognition of all 154 files (incl. the pinned PH1 and ENT-W1 tail) + the first 142
    const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
    const superuserInstaller = /consumer_retention_entitlement_authority|consumer_retention_acquisition_record|consumer_retention_registry_seal|consumer_retention_billing_fact_ingest|consumer_retention_acquisition_resolve_sweep/;
    const applied = [];
    for (const n of files.slice(142)) { const by = superuserInstaller.test(n) ? su : db; const sql = n === ENTW1_MIGRATION ? fs.readFileSync(DRAFT, 'utf8') : fs.readFileSync(path.join(ROOT, 'supabase/migrations', n), 'utf8'); try { await rec.query(by, sql); } catch (e) { throw Error('SETUP_MIGRATION ' + n + ' ' + e.code + ' ' + e.message); } applied.push({ n, by: by === su ? 'supabase_admin' : 'postgres' }); }
    const ctx = { g: rec, su, open: async u => cl.connect('postgres', u), extraRoles: new Set(), cl: { port: cl.port }, name: 'postgres', uid: 0 };
    const post = (await q(ctx, `select (select rolcanlogin from pg_roles where rolname=$1) login, (select count(*)::int from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member) where r.rolname=$1) members, (select cycle::text from ${ACQ}.resolution_sweep_state) cycle, (select count(*)::int from pg_proc where pronamespace='${ACQ}'::regnamespace and proname in ('claim_resolution_page','begin_resolution_item','advance_resolution_cursor','first_unresolved_in')) fns, (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname<>'${ACQ}' and p.prosrc ilike '%resolve_detail_acquisition%') outside_refs`, [WORKER]))[0];
    const M = session(); const login = await workerLogin(ctx); const w = await paidWorld(ctx); const o = await paidOwner(ctx, w, 1);
    const id = await anchor(ctx, o, { id: rid(1701), t0Ms: w.now - DAY });
    const r = await sweep(M, nodeDriver(dbUrl(ctx, login), M.E));
    const got = await receipts(ctx);
    // With the exact R1-A record the chain has one more, ordinary-installer migration after ENT-W1; otherwise exactly as before.
    const r1aQualified = P.recoverySuccessorState(rootGit).r1a === 'record';
    const tailOk = r1aQualified
      ? applied.length === 13 && files.length === 155 && applied.at(-1).n === R1A_MIGRATION && applied.at(-1).by === 'postgres' && applied.at(-2).n === ENTW1_MIGRATION && applied.at(-2).by === 'supabase_admin' && applied.at(-3).n === PH1_MIGRATION
      : applied.length === 12 && files.length === 154 && applied.at(-1).n === ENTW1_MIGRATION && applied.at(-1).by === 'supabase_admin' && applied.at(-2).n === PH1_MIGRATION;
    const ok = tailOk
      && post.login === false && post.members === 0 && post.cycle === '0' && post.fns === 4 && post.outside_refs === 0 && r.status === 'ok' && r.recorded === 1 && got.length === 1 && got[0].resource_id === id;
    return R(ok, { files: files.length, applied, post, sweep: r, receipts: got.map(x => x.resource_id) });
  } finally { if (cl) await cl.stop().catch(() => {}); }
};

// ===== runner (the ENT-F2 judgement chain: setup => BLOCKED, crash never a pass or detector, only explicit observations count) =====
const ALL_GATES = { ...GATES, ...GAP_GATES, ...DENO_PG.GATES, ...NEW };
const ALL = Object.keys(ALL_GATES);
const NO_CLUSTER = new Set(ALL.filter(k => /^(U|F|D)\d/.test(k) || k.startsWith('G17_')));
export const GATE_IDS = Object.freeze(ALL);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sel = (process.env.TK_GATES ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const unknown = sel.filter(s => !ALL.includes(s));
  const selected = sel.length ? ALL.filter(k => sel.includes(k)) : ALL;
  if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.error('REFUSED: --out must be a new or empty directory'); process.exit(2); }
  const rec = P.recorder(OUT);
  const identity = { head: rootGit(['rev-parse', 'HEAD']).trim(), tree: rootGit(['rev-parse', 'HEAD^{tree}']).trim(), dirty: rootGit(['status', '--porcelain', '-uall']).trim().split('\n').filter(Boolean), smokeSha256: sha256(fs.readFileSync(new URL(import.meta.url))), draftSha256: sha256(fs.readFileSync(DRAFT)), srcRoot: SRC_ROOT, product: Object.fromEntries(PRODUCT_FILES.map(p => [p, sha256(fs.readFileSync(path.join(SRC_ROOT, p)))])) };
  const results = []; let blocked = null; let cl = null;
  try {
    if (unknown.length || selected.length === 0) throw Error('SETUP_GATE_SELECTION ' + JSON.stringify({ unknown, selected }));
    for (const id of selected) {
      if (!NO_CLUSTER.has(id) && cl === null) { if (!BIN) throw Error('SETUP_NO_PG_BIN'); cl = await EN.entCluster(BIN, rec); }
      const v = await EDGE.judgeGate(() => ALL_GATES[id](cl), id);
      results.push({ id, kind: v.kind }); rec.write('check-' + id + '.json', { id, kind: v.kind, observed: v.observed });
      console.log('CHECK ' + id + ' ' + (v.kind === 'pass' ? 'PASS' : v.kind === 'explicit_fail' ? 'FAIL' : 'CRASH'));
    }
  } catch (e) { blocked = { message: String(e.message), stack: e.stack }; console.log('BLOCKED ' + blocked.message.slice(0, 300)); }
  finally { if (cl) await cl.stop().catch(() => {}); }
  const failed = results.filter(r => r.kind === 'explicit_fail').map(r => r.id), crashed = results.filter(r => r.kind === 'crash').map(r => r.id);
  const complete = !blocked && crashed.length === 0 && results.length === selected.length;
  const status = !complete ? 'BLOCKED' : failed.length ? 'FAIL' : 'PASS';
  rec.write('result.json', { status, selected, checks: results, failed, crashed, blocked, identity, denoRuns: DENO_PG.runs, tls: DENO_PG.tls(), fixture: 'reduced retention fixture except G16 (+seal/billing tail) and G17 (full chain of this tree)' });
  console.log('RESULT ' + status + ' ' + results.filter(r => r.kind === 'pass').length + '/' + selected.length);
  process.exitCode = status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2;
}
