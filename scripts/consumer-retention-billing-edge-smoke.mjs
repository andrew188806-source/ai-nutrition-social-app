#!/usr/bin/env node
// TastKind ENT-F2 local acceptance gates (Owner authorization 2026-10-21; prep-plan package F-C): the PRODUCT-side BillingTransport (real SQL against the ENT-F1 functions) and the three DEFAULT-DISABLED Edge entrypoints
// billing-webhook / billing-link / billing-process. Disposable PostgreSQL 17 only; never a remote target. Gates are exported so the mutation harness runs the very same detectors against changed product TypeScript.
// Three evidence layers are reported SEPARATELY and never substituted for one another:
//   NODE/PG   : the product modules (sql.ts, config.ts, http.ts, the three handlers, the REAL index.ts compositions with stubbed Deno/npm globals) executed in Node; the SQL layer executed against a real PostgreSQL
//               through real LOGIN roles (session_user is the dedicated role, never a superuser). The Node driver implements the SAME driver port the Deno binding implements.
//   DENO WRAPPER (denoPostgresBillingTransport.ts): NOT executed (no Deno runtime): UNVERIFIED. Only its shape is checked statically.
//   PLATFORM  : verify_jwt, CORS, deployed behaviour, Supavisor/pooler, TLS: NOT verified here. Safety of every entrypoint must hold in the handler itself, not in a platform default.
// Every provider adapter, producer, registry row, namespace configuration, link, delivery and fact in these gates exists ONLY in a disposable test database or an in-memory stub. Nothing here adds a migration, a role or a grant.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import child from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ROOT, recorder, sha, uuid } from './consumer-retention-persistence-smoke.mjs';
import { options, frozenProof, inventoryProof } from './consumer-retention-capture-smoke.mjs';
import { entCluster, selectGates, outcomeOf, selectionContractRows } from './consumer-retention-entitlement-smoke.mjs';
import { billingFresh } from './consumer-retention-billing-smoke.mjs';

export { options };
const requireRoot = createRequire(path.join(ROOT, 'package.json'));
const tsc = requireRoot('typescript');
const { Client } = requireRoot('pg');

const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256hex = s => createHash('sha256').update(s, 'utf8').digest('hex');
const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 1);
const at = (days, extraMs = 0) => new Date(BASE + days * DAY + extraMs).toISOString();
const atMs = (days, extraMs = 0) => BASE + days * DAY + extraMs;
const B = 'retention_billing';
const ENT = 'retention_entitlement';
const ACQ = 'retention_acquisition';

// ---- the ENT-F2 product inventory (exact paths; the mutation harness copies exactly these) -------------------------------------------------------------------------
export const ENT_F2_SOURCE_PATHS = Object.freeze([
  'supabase/functions/_shared/billing-transport/config.ts',
  'supabase/functions/_shared/billing-transport/denoPostgresBillingTransport.ts',
  'supabase/functions/_shared/billing-transport/executor.ts',
  'supabase/functions/_shared/billing-transport/http.ts',
  'supabase/functions/_shared/billing-transport/sql.ts',
  'supabase/functions/billing-link/config.ts',
  'supabase/functions/billing-link/handler.ts',
  'supabase/functions/billing-link/index.ts',
  'supabase/functions/billing-process/config.ts',
  'supabase/functions/billing-process/handler.ts',
  'supabase/functions/billing-process/index.ts',
  'supabase/functions/billing-webhook/config.ts',
  'supabase/functions/billing-webhook/handler.ts',
  'supabase/functions/billing-webhook/index.ts'
]);

// ---- TypeScript executed in Node WITHOUT rewriting the production source ----------------------------------------------------------------------------------------
// npm: specifiers are never resolved: they must be stubbed by the caller (an unstubbed one is a setup error, never a silent real import). The `Deno` global is supplied per session.
const srcRoot = { dir: null };
export const setSourceRoot = dir => { srcRoot.dir = dir; };
const baseDir = () => srcRoot.dir ?? ROOT;
export function newEdgeSession({ stubs = {}, deno } = {}) {
  const cache = new Map();
  const load = file => {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = tsc.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2022 }, fileName: file }).outputText;
    const localRequire = name => {
      if (Object.prototype.hasOwnProperty.call(stubs, name)) return stubs[name];
      if (name.startsWith('npm:')) throw Error('SETUP_UNSTUBBED_NPM_IMPORT ' + name);
      if (!name.startsWith('.')) return requireRoot(name);
      const b = path.resolve(path.dirname(file), name);
      const resolved = [b, b + '.ts', path.join(b, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!resolved) throw Error('SETUP_UNRESOLVED_IMPORT ' + name + ' from ' + file);
      return load(resolved);
    };
    new Function('require', 'module', 'exports', 'Deno', code)(localRequire, module, module.exports, deno);
    return module.exports;
  };
  return { load: rel => load(path.join(baseDir(), 'supabase/functions', rel)) };
}
// Stubs for the two npm packages the entrypoints import. They record every call; nothing here can reach a network.
function makeStubs() {
  const spies = { postgres: [], begins: 0, ends: 0, createClient: [], getUser: 0, getUserImpl: async () => ({ data: { user: null }, error: { message: 'no session' } }) };
  const postgres = (url, opts) => {
    spies.postgres.push({ url, opts });
    return { begin: async () => { spies.begins++; throw Object.assign(new Error('stub: connection refused'), { code: 'ECONNREFUSED' }); }, end: async () => { spies.ends++; } };
  };
  const supabase = { createClient: (url, key, opts) => { spies.createClient.push({ url, key, opts }); return { auth: { getUser: async () => { spies.getUser++; return spies.getUserImpl(); } } }; } };
  return { stubs: { 'npm:postgres@3.4.7': { default: postgres }, 'npm:@supabase/supabase-js@2': supabase }, spies };
}
async function captureConsole(fn) {
  const lines = []; const orig = {};
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) { orig[k] = console[k]; console[k] = (...a) => { lines.push(a.map(String).join(' ')); }; }
  try { return { value: await fn(), lines }; } finally { for (const k of Object.keys(orig)) console[k] = orig[k]; }
}

// ---- fixtures ----------------------------------------------------------------------------------------------------------------------------------------------
const PW_MARKER = 'PW-MARKER-93c1';
const SECRET = 'process-secret-MARKER-0123456789abcdefghij';
const ANON = 'anon-key-MARKER-77';
const DB_URL = role => `postgres://${role}:${PW_MARKER}@127.0.0.1:5432/billing`;
const WEBHOOK_ENV = Object.freeze({ BILLING_INGEST_ENABLED: 'true', BILLING_MAX_BODY_BYTES: '4096', BILLING_INGRESS_DB_URL: DB_URL('bill_ingress') });
const LINK_ENV = Object.freeze({ BILLING_INGEST_ENABLED: 'true', BILLING_NAMESPACE: 'store.sandbox', BILLING_LINK_TTL_SECONDS: '1800', BILLING_INGRESS_DB_URL: DB_URL('bill_ingress'), SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: ANON });
const PROCESS_ENV = Object.freeze({ BILLING_INGEST_ENABLED: 'true', BILLING_NAMESPACE: 'store.sandbox', BILLING_PRODUCER_DB_URL: DB_URL('bill_producer'), BILLING_PROCESS_SECRET: SECRET });
const without = (env, ...keys) => Object.fromEntries(Object.entries(env).filter(([k]) => !keys.includes(k)));
const obs = (ns, subject, delivery, kind, s, e, over = {}) => ({
  namespace: ns, environment: 'sandbox', deliveryId: delivery, subjectRef: subject, payloadDigest: sha256hex(`${ns}|${delivery}|${subject}|${kind}|${s}|${e}`),
  kind, periodStartMs: s, periodEndMs: e, signedAtMs: BASE, bindingHash: null, reasonCode: null, ...over
});
// ---- synthetic provider adapter (TEST ONLY: it exists in this file and nowhere in the product; it proves the Verifier/Mapper interface, not any real signature scheme) -------------------------------------------
const TEST_KEY = 'synthetic-test-key-not-a-secret';
const signatureOf = body => createHmac('sha256', TEST_KEY).update(body).digest('hex');
function syntheticAdapter(ns, verifyCalls = [], mapCalls = []) {
  return {
    verify: async (raw, headers) => { verifyCalls.push(Buffer.from(raw)); return headers.get('x-test-key-id') === 'k-' + ns && headers.get('x-test-signature') === signatureOf(Buffer.from(raw)) ? { ok: true, namespace: ns } : { ok: false, reason: 'bad_signature' }; },
    map: async raw => { mapCalls.push(1); const j = JSON.parse(Buffer.from(raw).toString('utf8')); return Array.isArray(j.observations) ? j.observations : null; }
  };
}
function signedRequest(ns, observations, { sig, headers = {}, method = 'POST', body } = {}) {
  const text = body ?? JSON.stringify({ observations });
  return new Request('http://localhost/billing', { method, body: method === 'GET' ? undefined : text, headers: { 'x-test-key-id': 'k-' + ns, 'x-test-signature': sig ?? signatureOf(text), ...headers } });
}
// A request whose body is a stream that records how much of it was ever read. highWaterMark 0: nothing is pulled until a reader asks.
function probeRequest(chunks, { headers = {}, method = 'POST' } = {}) {
  const state = { pulled: 0, bytes: 0 }; let i = 0;
  const body = new ReadableStream({ pull(c) { if (i >= chunks.length) { c.close(); return; } const x = chunks[i++]; state.pulled++; state.bytes += x.byteLength; c.enqueue(x); } }, { highWaterMark: 0 });
  return { state, request: new Request('http://localhost/x', { method, body, duplex: 'half', headers }) };
}
const bytes = n => new Uint8Array(n).fill(0x61);
// A fake transport: records the calls of every transaction; `commit` decides what the end of the transaction does.
function fakeTransport({ outcomes = [], commit = null, link = { outcome: 'created', link_id: 'link-1' }, calls = [] } = {}) {
  const t = {
    async transaction(fn) {
      calls.push('tx');
      const tx = {
        ingestDelivery: async o => { calls.push('ingest:' + o.deliveryId); return { outcome: outcomes.shift() ?? 'received', item_id: 'item-1' }; },
        createLinkIntent: async (...a) => { calls.push(['link', ...a]); return link; },
        nextCandidate: async () => null, processItem: async () => ({ outcome: 'not_found', item_id: null }), recordAttempt: async () => ({ outcome: 'no_change', item_id: null })
      };
      const r = await fn(tx);
      if (commit) await commit();
      calls.push('committed');
      return r;
    },
    async close() { calls.push('closed'); }
  };
  return { t, calls };
}

function webhookKit({ env = WEBHOOK_ENV, adapter = 'synthetic', ns = 'store.sandbox', transport = fakeTransport() } = {}) {
  const { stubs } = makeStubs(); const S = newEdgeSession({ stubs });
  const h = S.load('billing-webhook/handler.ts'), c = S.load('billing-webhook/config.ts');
  const created = [], verifyCalls = [], mapCalls = [];
  const syn = syntheticAdapter(ns, verifyCalls, mapCalls);
  const deps = { loadConfig: () => c.loadBillingWebhookConfig(k => env[k]), createTransport: url => { created.push(url); return transport.t; }, adapter: adapter === 'synthetic' ? syn : adapter };
  return { run: req => h.processBillingWebhookRequest(req, deps), created, verifyCalls, mapCalls, transport, deps, S };
}
const textOf = async res => { try { return await res.text(); } catch { return ''; } };

export const GATES = {};
Object.assign(GATES, {
  // ---- W: the webhook entrypoint -------------------------------------------------------------------------------------------------------------------------------
  async W01_WEBHOOK_IS_CLOSED_BEFORE_ANY_RESOURCE_WHEN_NOT_CONFIGURED() {
    const cases = [
      ['empty environment', {}], ['switch false', { ...WEBHOOK_ENV, BILLING_INGEST_ENABLED: 'false' }], ['switch TRUE (case)', { ...WEBHOOK_ENV, BILLING_INGEST_ENABLED: 'TRUE' }],
      ['switch 1', { ...WEBHOOK_ENV, BILLING_INGEST_ENABLED: '1' }], ['switch yes', { ...WEBHOOK_ENV, BILLING_INGEST_ENABLED: 'yes' }], ['switch blank', { ...WEBHOOK_ENV, BILLING_INGEST_ENABLED: '  ' }],
      ['no switch', without(WEBHOOK_ENV, 'BILLING_INGEST_ENABLED')], ['no payload limit', without(WEBHOOK_ENV, 'BILLING_MAX_BODY_BYTES')], ['limit 0', { ...WEBHOOK_ENV, BILLING_MAX_BODY_BYTES: '0' }],
      ['limit above the structural bound', { ...WEBHOOK_ENV, BILLING_MAX_BODY_BYTES: '1073741824' }], ['limit not a number', { ...WEBHOOK_ENV, BILLING_MAX_BODY_BYTES: 'abc' }], ['limit fractional', { ...WEBHOOK_ENV, BILLING_MAX_BODY_BYTES: '10.5' }],
      ['no database url', without(WEBHOOK_ENV, 'BILLING_INGRESS_DB_URL')], ['http url', { ...WEBHOOK_ENV, BILLING_INGRESS_DB_URL: 'http://127.0.0.1/db' }],
      ['url without password', { ...WEBHOOK_ENV, BILLING_INGRESS_DB_URL: 'postgres://bill_ingress@127.0.0.1/db' }], ['url without user', { ...WEBHOOK_ENV, BILLING_INGRESS_DB_URL: 'postgres://:pw@127.0.0.1/db' }],
      ['url is garbage', { ...WEBHOOK_ENV, BILLING_INGRESS_DB_URL: 'not a url' }]
    ];
    const rows = [];
    for (const [name, env] of cases) {
      const kit = webhookKit({ env }); const text = JSON.stringify({ observations: [obs('store.sandbox', 's', 'd', 'paid_period', atMs(1), atMs(2))] });
      const probe = probeRequest([new TextEncoder().encode(text)], { headers: { 'x-test-key-id': 'k-store.sandbox', 'x-test-signature': signatureOf(text) } });
      const cap = await captureConsole(() => kit.run(probe.request));
      rows.push({ name, status: cap.value.status, verify: kit.verifyCalls.length, map: kit.mapCalls.length, transports: kit.created.length, pulled: probe.state.pulled, logs: cap.lines.length });
    }
    const getKit = webhookKit({ env: {} }); const getRes = await getKit.run(new Request('http://localhost/x', { method: 'GET' }));
    const control = webhookKit(); const ctext = JSON.stringify({ observations: [obs('store.sandbox', 's', 'd', 'paid_period', atMs(1), atMs(2))] });
    const cres = await control.run(signedRequest('store.sandbox', [obs('store.sandbox', 's', 'd', 'paid_period', atMs(1), atMs(2))], { body: ctext }));
    const closed = rows.every(r => r.status === 503 && r.verify === 0 && r.map === 0 && r.transports === 0 && r.pulled === 0 && r.logs === 0);
    return R(closed && getRes.status === 503 && getKit.created.length === 0 && cres.status === 200 && control.created.length === 1 && control.verifyCalls.length === 1, { rows, get: getRes.status, control: { status: cres.status, transports: control.created.length } });
  },

  async W02_WEBHOOK_WITHOUT_A_VERIFIER_NEVER_INGESTS() {
    const kit = webhookKit({ adapter: null });
    const probe = probeRequest([bytes(32)], { headers: { 'x-test-key-id': 'k-store.sandbox', 'x-test-signature': 'x' } });
    const res = await kit.run(probe.request);
    const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-webhook/handler.ts');
    const d = h.createDefaultBillingWebhookDependencies();
    const keys = Object.keys(d).sort(); const desc = Object.getOwnPropertyDescriptors(d);
    let replaced = false; try { d.adapter = { verify: async () => ({ ok: true, namespace: 'x' }), map: async () => [] }; replaced = d.adapter !== null; } catch { replaced = false; }
    return R(res.status === 503 && probe.state.pulled === 0 && kit.created.length === 0 && d.adapter === null && same(keys, ['adapter', 'createTransport', 'loadConfig']) && replaced === false && Object.isFrozen(d) && desc.adapter.writable === false,
      { status: res.status, pulled: probe.state.pulled, transports: kit.created.length, defaultAdapter: d.adapter, keys, frozen: desc.adapter.writable === false });
  },

  async W03_WEBHOOK_METHOD_AND_ACTUAL_BODY_SIZE_LIMITS() {
    const ns = 'store.sandbox'; const env = { ...WEBHOOK_ENV, BILLING_MAX_BODY_BYTES: '64' };
    const out = {};
    { const kit = webhookKit({ env }); const res = await kit.run(new Request('http://localhost/x', { method: 'GET' })); out.get = { status: res.status, verify: kit.verifyCalls.length, transports: kit.created.length }; }
    { const kit = webhookKit({ env }); const probe = probeRequest([bytes(200)], { headers: { 'content-length': '200' } }); const res = await kit.run(probe.request); out.declared = { status: res.status, pulled: probe.state.pulled, verify: kit.verifyCalls.length, transports: kit.created.length }; }
    { const kit = webhookKit({ env }); const probe = probeRequest(Array.from({ length: 40 }, () => bytes(16))); const res = await kit.run(probe.request); out.chunkedNoLength = { status: res.status, bytesRead: probe.state.bytes, chunks: probe.state.pulled, verify: kit.verifyCalls.length, transports: kit.created.length }; }
    { const kit = webhookKit({ env }); const probe = probeRequest(Array.from({ length: 40 }, () => bytes(16)), { headers: { 'content-length': '10' } }); let status = null; let threw = null;
      try { const res = await kit.run(probe.request); status = res.status; } catch (e) { threw = String(e.message).slice(0, 100); }
      out.understatedLength = { status, threw, bytesRead: probe.state.bytes, verify: kit.verifyCalls.length, transports: kit.created.length }; }
    { const kit = webhookKit({ env }); const probe = probeRequest([bytes(64)]); const res = await kit.run(probe.request); out.exactlyAtTheCap = { status: res.status, bytesRead: probe.state.bytes, verify: kit.verifyCalls.length }; }
    { const kit = webhookKit({ env }); const probe = probeRequest([bytes(65)]); const res = await kit.run(probe.request); out.oneOverTheCap = { status: res.status, verify: kit.verifyCalls.length }; }
    { const kit = webhookKit({ env }); const res = await kit.run(new Request('http://localhost/x', { method: 'POST', body: bytes(20) })); out.smallBodyReachesTheVerifier = { status: res.status, verify: kit.verifyCalls.length }; }
    const ok = out.get.status === 405 && out.get.verify === 0 && out.get.transports === 0
      && out.declared.status === 413 && out.declared.pulled === 0 && out.declared.verify === 0 && out.declared.transports === 0
      && out.chunkedNoLength.status === 413 && out.chunkedNoLength.bytesRead <= 64 + 16 && out.chunkedNoLength.verify === 0 && out.chunkedNoLength.transports === 0
      && out.understatedLength.status === 413 && out.understatedLength.bytesRead <= 64 + 16 && out.understatedLength.verify === 0 && out.understatedLength.transports === 0
      && out.exactlyAtTheCap.status !== 413 && out.exactlyAtTheCap.bytesRead === 64 && out.exactlyAtTheCap.verify === 1
      && out.oneOverTheCap.status === 413 && out.oneOverTheCap.verify === 0
      && out.smallBodyReachesTheVerifier.verify === 1;
    return R(ok, out);
  },

  async W04_WEBHOOK_VERIFICATION_AND_MAPPING_FAILURES_STORE_NOTHING() {
    const ns = 'store.sandbox'; const good = [obs(ns, 's-1', 'd-1', 'paid_period', atMs(1), atMs(2))]; const rows = {};
    const run = async (name, request, kitOver = {}) => { const kit = webhookKit(kitOver); const res = await kit.run(request); rows[name] = { status: res.status, transports: kit.created.length, calls: kit.transport.calls.filter(c => c !== 'closed').length }; return rows[name]; };
    await run('badSignature', signedRequest(ns, good, { sig: 'deadbeef' }));
    await run('missingSignature', new Request('http://localhost/x', { method: 'POST', body: '{}' }));
    await run('verifierThrows', signedRequest(ns, good), { adapter: { verify: async () => { throw Error('SECRET-INTERNAL-FAILURE'); }, map: async () => good } });
    await run('mapperThrows', signedRequest(ns, good), { adapter: { verify: async () => ({ ok: true, namespace: ns }), map: async () => { throw Error('boom'); } } });
    await run('mapperReturnsNull', signedRequest(ns, good), { adapter: { verify: async () => ({ ok: true, namespace: ns }), map: async () => null } });
    await run('mapperReturnsEmpty', signedRequest(ns, good), { adapter: { verify: async () => ({ ok: true, namespace: ns }), map: async () => [] } });
    await run('payloadChoosesAnotherNamespace', signedRequest(ns, [obs('other.sandbox', 's-1', 'd-1', 'paid_period', atMs(1), atMs(2))]));
    await run('malformedObservation', signedRequest(ns, [{ ...good[0], periodEndMs: good[0].periodStartMs }]));
    await run('extraKeyInObservation', signedRequest(ns, [{ ...good[0], email: 'x@example.invalid' }]));
    const control = webhookKit(); const cres = await control.run(signedRequest(ns, good));
    const refusals = Object.values(rows);
    const bad = rows.badSignature.status === 401 && rows.missingSignature.status === 401 && rows.verifierThrows.status === 401 && rows.mapperThrows.status === 400 && rows.mapperReturnsNull.status === 400 && rows.mapperReturnsEmpty.status === 400
      && rows.payloadChoosesAnotherNamespace.status === 422 && rows.malformedObservation.status === 422 && rows.extraKeyInObservation.status === 422;
    return R(bad && refusals.every(r => r.transports === 0 && r.calls === 0) && cres.status === 200 && control.created.length === 1, { rows, control: cres.status });
  },

  async W05_WEBHOOK_VERIFIER_RECEIVES_THE_RAW_BYTES() {
    const ns = 'store.sandbox'; const results = [];
    const payloads = [
      Buffer.from([0x7b, 0xff, 0xfe, 0x00, 0x80, 0x7d]),
      Buffer.from('{ "observations" : [ ]  }\r\n\r\n   '),
      Buffer.from('{"b":1,"a":"\\u00e9\\ud83d\\ude00","observations":[]}'),
      Buffer.from('')
    ];
    for (const p of payloads) {
      const kit = webhookKit({ adapter: { verify: async raw => { kit.seen = Buffer.from(raw); return { ok: false, reason: 'x' }; }, map: async () => null } });
      const res = await kit.run(new Request('http://localhost/x', { method: 'POST', body: p }));
      results.push({ len: p.length, status: res.status, identical: kit.seen !== undefined && Buffer.compare(kit.seen, p) === 0 });
    }
    return R(results.every(r => r.status === 401 && r.identical), { results });
  },

  async W06_WEBHOOK_ACKS_ONLY_AFTER_A_CONFIRMED_COMMIT() {
    const ns = 'store.sandbox'; const good = [obs(ns, 's-1', 'd-1', 'paid_period', atMs(1), atMs(2))]; const out = {};
    { let release; const gate = new Promise(r => { release = r; }); const tr = fakeTransport({ commit: () => gate }); const kit = webhookKit({ transport: tr });
      let settled = false; const p = kit.run(signedRequest(ns, good)).then(r => { settled = true; return r; });
      await sleep(150); const settledBeforeCommit = settled; release(); const res = await p; out.heldCommit = { settledBeforeCommit, status: res.status, calls: tr.calls }; }
    const failing = async (name, error, outcomes = []) => { const tr = fakeTransport({ commit: () => { throw error; }, outcomes }); const kit = webhookKit({ transport: tr }); const res = await kit.run(signedRequest(ns, good)); out[name] = { status: res.status, committed: tr.calls.includes('committed'), closed: tr.calls.includes('closed') }; };
    await failing('commitOutcomeUnknown', Object.assign(Error('BILLING_COMMIT_OUTCOME_UNKNOWN'), { code: '08006', commitOutcomeUnknown: true }));
    await failing('plainCommitError', Error('connection reset'));
    await failing('serverAbortAtCommit', Object.assign(Error('check violation'), { code: '23514' }));
    await failing('contractViolation', Object.assign(Error('BILLING_INVALID_ARGUMENT'), {}));
    { const tr = fakeTransport({ outcomes: ['delivery_conflict'] }); const kit = webhookKit({ transport: tr }); const res = await kit.run(signedRequest(ns, good)); out.conflict = { status: res.status }; }
    { const tr = fakeTransport({ outcomes: ['disabled'] }); const kit = webhookKit({ transport: tr }); const res = await kit.run(signedRequest(ns, good)); out.disabledNamespace = { status: res.status, committed: tr.calls.includes('committed') }; }
    { const tr = fakeTransport({ outcomes: ['unknown_namespace'] }); const kit = webhookKit({ transport: tr }); const res = await kit.run(signedRequest(ns, good)); out.unknownNamespace = { status: res.status, committed: tr.calls.includes('committed') }; }
    { const tr = fakeTransport({ outcomes: ['duplicate'] }); const kit = webhookKit({ transport: tr }); const res = await kit.run(signedRequest(ns, good)); out.duplicate = { status: res.status }; }
    const ok = out.heldCommit.settledBeforeCommit === false && out.heldCommit.status === 200 && out.commitOutcomeUnknown.status === 503 && out.plainCommitError.status === 503 && out.serverAbortAtCommit.status === 503
      && out.contractViolation.status === 500 && out.conflict.status === 409 && out.disabledNamespace.status === 503 && out.disabledNamespace.committed === false && out.unknownNamespace.status === 503 && out.unknownNamespace.committed === false && out.duplicate.status === 200
      && ['commitOutcomeUnknown', 'plainCommitError', 'serverAbortAtCommit'].every(k => out[k].committed === false && out[k].closed === true);
    return R(ok, out);
  },

  // ---- no logging, no echo (all three entrypoints) -----------------------------------------------------------------------------------------------------------------------
  async W07_NO_LOGGING_OR_ECHO_OF_PAYLOAD_SECRETS_OR_IDENTIFIERS() {
    const MARK = 'LEAK-MARKER-5e2a'; const ns = 'store.sandbox'; const seen = [];
    const leaks = text => [MARK, PW_MARKER, SECRET, ANON, 'bill_ingress', 'bill_producer', '127.0.0.1'].filter(m => text.includes(m));
    const note = (name, lines, res, body) => seen.push({ name, status: res.status, consoleLines: lines.length, leaked: [...leaks(lines.join('\n')), ...leaks(body)] });
    { const kit = webhookKit({ env: {} }); const cap = await captureConsole(() => kit.run(signedRequest(ns, [obs(ns, MARK, MARK, 'paid_period', atMs(1), atMs(2))]))); note('webhook closed', cap.lines, cap.value, await textOf(cap.value)); }
    { const kit = webhookKit({ adapter: null }); const cap = await captureConsole(() => kit.run(signedRequest(ns, [obs(ns, MARK, MARK, 'paid_period', atMs(1), atMs(2))]))); note('webhook without verifier', cap.lines, cap.value, await textOf(cap.value)); }
    { const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-link/handler.ts'), c = S.load('billing-link/config.ts');
      const cap = await captureConsole(() => h.processBillingLinkRequest(new Request('http://x/l', { method: 'POST', body: '{}' }), { loadConfig: () => c.loadBillingLinkConfig(() => undefined), authenticate: async () => null, createTransport: () => { throw Error('must not be created'); }, randomBindingValue: () => 'x', sha256Hex: sha256hex, now: () => 0 })); note('link closed', cap.lines, cap.value, await textOf(cap.value)); }
    { const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-process/handler.ts'), c = S.load('billing-process/config.ts');
      const cap = await captureConsole(() => h.processBillingProcessRequest(new Request('http://x/p', { method: 'POST' }), { loadConfig: () => c.loadBillingProcessConfig(() => undefined), createTransport: () => { throw Error('must not be created'); } })); note('process closed', cap.lines, cap.value, await textOf(cap.value)); }
    { const adapter = { verify: async () => { throw Error(MARK + ' internal'); }, map: async () => null }; const kit = webhookKit({ adapter }); const cap = await captureConsole(() => kit.run(signedRequest(ns, [obs(ns, MARK, MARK, 'paid_period', atMs(1), atMs(2))]))); note('webhook verifier throws', cap.lines, cap.value, await textOf(cap.value)); }
    { const kit = webhookKit({ transport: fakeTransport({ commit: () => { throw Error(MARK + ' commit ' + DB_URL('x')); } }) }); const cap = await captureConsole(() => kit.run(signedRequest(ns, [obs(ns, MARK, MARK, 'paid_period', atMs(1), atMs(2))]))); note('webhook commit fails', cap.lines, cap.value, await textOf(cap.value)); }
    { const kit = webhookKit({ transport: fakeTransport({ outcomes: ['delivery_conflict'] }) }); const cap = await captureConsole(() => kit.run(signedRequest(ns, [obs(ns, MARK, MARK, 'paid_period', atMs(1), atMs(2))]))); note('webhook conflict', cap.lines, cap.value, await textOf(cap.value)); }
    { const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-link/handler.ts'), c = S.load('billing-link/config.ts'); const tr = fakeTransport({ commit: () => { throw Error(MARK + ' ' + SECRET); } });
      const deps = { loadConfig: () => c.loadBillingLinkConfig(k => LINK_ENV[k]), authenticate: async () => ({ userId: '00000000-0000-4000-8000-0000000000aa' }), createTransport: () => tr.t, randomBindingValue: () => 'b'.repeat(64), sha256Hex: sha256hex, now: () => 1000 };
      const cap = await captureConsole(() => h.processBillingLinkRequest(new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer ' + MARK } }), deps)); note('link commit fails', cap.lines, cap.value, await textOf(cap.value)); }
    { const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-process/handler.ts'), c = S.load('billing-process/config.ts');
      const t = { async transaction() { throw Object.assign(Error(MARK + ' ' + DB_URL('p')), { code: '40P01' }); }, async close() {} };
      const deps = { loadConfig: () => c.loadBillingProcessConfig(k => PROCESS_ENV[k]), createTransport: () => t };
      const cap = await captureConsole(() => h.processBillingProcessRequest(new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET } }), deps)); note('process failure', cap.lines, cap.value, await textOf(cap.value));
      const cap2 = await captureConsole(() => h.processBillingProcessRequest(new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET + 'x' } }), deps)); note('process wrong secret', cap2.lines, cap2.value, await textOf(cap2.value)); }
    return R(seen.every(s => s.consoleLines === 0 && s.leaked.length === 0), { seen });
  },

  // ---- L: the link entrypoint ---------------------------------------------------------------------------------------------------------------------------------------
  async L01_LINK_REFUSALS_PRECEDE_AUTHENTICATION_AND_DATABASE() {
    const U = '00000000-0000-4000-8000-0000000000a1'; const rows = {};
    const kit = (env = LINK_ENV, over = {}) => {
      const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-link/handler.ts'), c = S.load('billing-link/config.ts');
      const k = { auth: [], created: [], tr: fakeTransport(over.transport ?? {}) };
      const deps = { loadConfig: () => c.loadBillingLinkConfig(x => env[x]), authenticate: async r => { k.auth.push(r.headers.get('authorization')); if (over.authThrows) throw Error('auth backend down ' + PW_MARKER); return over.user === undefined ? { userId: U } : over.user; },
        createTransport: url => { k.created.push(url); return k.tr.t; }, randomBindingValue: () => 'f'.repeat(64), sha256Hex: sha256hex, now: () => 1000000, ...over.deps };
      k.run = r => h.processBillingLinkRequest(r, deps); return k;
    };
    const rec = (name, k, res) => { rows[name] = { status: res.status, auth: k.auth.length, transports: k.created.length }; };
    for (const [name, env] of [['empty env', {}], ['switch off', { ...LINK_ENV, BILLING_INGEST_ENABLED: 'false' }], ['no namespace', without(LINK_ENV, 'BILLING_NAMESPACE')], ['bad namespace', { ...LINK_ENV, BILLING_NAMESPACE: 'X' }],
      ['no ttl', without(LINK_ENV, 'BILLING_LINK_TTL_SECONDS')], ['ttl too long', { ...LINK_ENV, BILLING_LINK_TTL_SECONDS: '9999999' }], ['no db url', without(LINK_ENV, 'BILLING_INGRESS_DB_URL')],
      ['no platform url', without(LINK_ENV, 'SUPABASE_URL')], ['no anon key', without(LINK_ENV, 'SUPABASE_ANON_KEY')]]) {
      const k = kit(env); const probe = probeRequest([new TextEncoder().encode('{}')], { headers: { authorization: 'Bearer t' } }); const res = await k.run(probe.request); rows[name] = { status: res.status, auth: k.auth.length, transports: k.created.length, pulled: probe.state.pulled };
    }
    { const k = kit(); rec('GET', k, await k.run(new Request('http://x/l', { method: 'GET', headers: { authorization: 'Bearer t' } }))); }
    // Fail fast on the explicit observations of the closed / refused endpoints BEFORE any later case runs: a mutant that authenticates or connects before refusing is judged by these COUNTS, never by an exception raised by a later case.
    const closedNames = ['empty env', 'switch off', 'no namespace', 'bad namespace', 'no ttl', 'ttl too long', 'no db url', 'no platform url', 'no anon key'];
    if (!(closedNames.every(n => rows[n].status === 503 && rows[n].auth === 0 && rows[n].transports === 0 && rows[n].pulled === 0) && rows.GET.status === 405 && rows.GET.auth === 0 && rows.GET.transports === 0)) return R(false, { phase: 'closed-and-method-refused-endpoints', rows });
    { const k = kit(); const probe = probeRequest(Array.from({ length: 40 }, () => bytes(32)), { headers: { authorization: 'Bearer t' } }); const res = await k.run(probe.request); rows.oversizedBody = { status: res.status, auth: k.auth.length, transports: k.created.length, bytesRead: probe.state.bytes }; }
    { const k = kit(); const probe = probeRequest([bytes(500)], { headers: { authorization: 'Bearer t', 'content-length': '500' } }); const res = await k.run(probe.request); rows.declaredOversize = { status: res.status, auth: k.auth.length, pulled: probe.state.pulled }; }
    { const k = kit(); const exact = '{}' + ' '.repeat(254); const res = await k.run(new Request('http://x/l', { method: 'POST', body: exact, headers: { authorization: 'Bearer t' } })); rows.exactlyAtTheCap = { status: res.status, auth: k.auth.length, bytes: exact.length }; }
    { const k = kit(); const over = '{}' + ' '.repeat(255); const res = await k.run(new Request('http://x/l', { method: 'POST', body: over, headers: { authorization: 'Bearer t' } })); rows.oneOverTheCap = { status: res.status, auth: k.auth.length, bytes: over.length }; }
    for (const [name, body] of [['ownerInBody', JSON.stringify({ owner: U })], ['ownerUserId', JSON.stringify({ ownerUserId: U })], ['bindingInBody', JSON.stringify({ binding: 'x'.repeat(40) })], ['arrayBody', '[]'], ['textBody', 'hello']]) {
      const k = kit(); rec(name, k, await k.run(new Request('http://x/l', { method: 'POST', body, headers: { authorization: 'Bearer t' } })));
    }
    { const k = kit(LINK_ENV, { user: null }); rec('unauthenticated', k, await k.run(new Request('http://x/l', { method: 'POST', body: '{}' }))); }
    { const k = kit(LINK_ENV, { authThrows: true }); const res = await k.run(new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer t' } })); rec('authenticationBackendDown', k, res); rows.authenticationBackendDown.body = await textOf(res); }
    const refused = ['empty env', 'switch off', 'no namespace', 'bad namespace', 'no ttl', 'ttl too long', 'no db url', 'no platform url', 'no anon key'].every(n => rows[n].status === 503 && rows[n].auth === 0 && rows[n].transports === 0 && rows[n].pulled === 0);
    const ok = refused && rows.GET.status === 405 && rows.GET.auth === 0 && rows.GET.transports === 0
      && rows.exactlyAtTheCap.bytes === 256 && rows.exactlyAtTheCap.status === 200 && rows.exactlyAtTheCap.auth === 1 && rows.oneOverTheCap.status === 413 && rows.oneOverTheCap.auth === 0
      && rows.oversizedBody.status === 413 && rows.oversizedBody.auth === 0 && rows.oversizedBody.transports === 0 && rows.oversizedBody.bytesRead <= 256 + 32 && rows.declaredOversize.status === 413 && rows.declaredOversize.auth === 0 && rows.declaredOversize.pulled === 0
      && ['ownerInBody', 'ownerUserId', 'bindingInBody', 'arrayBody', 'textBody'].every(n => rows[n].status === 422 && rows[n].auth === 0 && rows[n].transports === 0)
      && rows.unauthenticated.status === 401 && rows.unauthenticated.transports === 0 && rows.authenticationBackendDown.status === 503 && rows.authenticationBackendDown.transports === 0 && !rows.authenticationBackendDown.body.includes(PW_MARKER);
    return R(ok, rows);
  },

  async L02_LINK_TRUSTS_ONLY_THE_PLATFORM_VERIFIED_USER() {
    const PLATFORM_USER = '00000000-0000-4000-8000-0000000000b2'; const CLAIMED = '00000000-0000-4000-8000-0000000000c3'; const out = {};
    { const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-link/handler.ts'), c = S.load('billing-link/config.ts');
      const tr = fakeTransport(); const created = [];
      const deps = { loadConfig: () => c.loadBillingLinkConfig(x => LINK_ENV[x]), authenticate: async () => ({ userId: PLATFORM_USER }), createTransport: url => { created.push(url); return tr.t; }, randomBindingValue: () => 'ab'.repeat(32), sha256Hex: sha256hex, now: () => 5000000 };
      const res = await h.processBillingLinkRequest(new Request('http://x/l?owner=' + CLAIMED, { method: 'POST', body: '{}', headers: { authorization: 'Bearer t', 'x-owner': CLAIMED, 'x-user-id': CLAIMED } }), deps);
      const body = JSON.parse(await res.text()); const call = tr.calls.find(x => Array.isArray(x));
      out.success = { status: res.status, body: Object.keys(body).sort(), call, transports: created.length, closed: tr.calls.includes('closed') };
      out.successOk = res.status === 200 && same(Object.keys(body).sort(), ['binding', 'status']) && body.status === 'created' && body.binding === 'ab'.repeat(32) && call[1] === 'store.sandbox' && call[2] === PLATFORM_USER && call[3] === sha256hex(body.binding) && call[3] !== body.binding && call[4] === 5000000 + 1800000
        && created.length === 1 && created[0] === LINK_ENV.BILLING_INGRESS_DB_URL && tr.calls.includes('closed') && !JSON.stringify(call).includes(CLAIMED); }
    for (const [name, link, status] of [['conflict', { outcome: 'conflict', link_id: null }, 409], ['exists', { outcome: 'exists', link_id: null }, 503], ['ownerAbsent', { outcome: 'owner_absent', link_id: null }, 503], ['disabled', { outcome: 'disabled', link_id: null }, 503]]) {
      const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-link/handler.ts'), c = S.load('billing-link/config.ts'); const tr = fakeTransport({ link });
      const deps = { loadConfig: () => c.loadBillingLinkConfig(x => LINK_ENV[x]), authenticate: async () => ({ userId: PLATFORM_USER }), createTransport: () => tr.t, randomBindingValue: () => 'ab'.repeat(32), sha256Hex: sha256hex, now: () => 1 };
      const res = await h.processBillingLinkRequest(new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer t' } }), deps); const text = await res.text();
      out[name] = { status: res.status, bindingReturned: text.includes('ab'.repeat(32)) }; out[name + 'Ok'] = res.status === status && !out[name].bindingReturned;
    }
    // the default platform authentication (stubbed supabase client): the id comes ONLY from getUser()
    { const { stubs, spies } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-link/handler.ts'); const d = h.createDefaultBillingLinkDependencies(); const cfg = { supabaseUrl: LINK_ENV.SUPABASE_URL, supabaseAnonKey: ANON };
      const noHeader = await d.authenticate(new Request('http://x/l', { method: 'POST' }), cfg); const noHeaderClients = spies.createClient.length;
      spies.getUserImpl = async () => ({ data: { user: { id: PLATFORM_USER } }, error: null });
      const withHeader = await d.authenticate(new Request('http://x/l', { method: 'POST', headers: { authorization: 'Bearer user-jwt', 'x-user-id': CLAIMED } }), cfg); const call = spies.createClient[0];
      spies.getUserImpl = async () => ({ data: { user: { id: PLATFORM_USER } }, error: { message: 'jwt expired' } }); const withError = await d.authenticate(new Request('http://x/l', { method: 'POST', headers: { authorization: 'Bearer user-jwt' } }), cfg);
      spies.getUserImpl = async () => ({ data: { user: null }, error: null }); const noUser = await d.authenticate(new Request('http://x/l', { method: 'POST', headers: { authorization: 'Bearer user-jwt' } }), cfg);
      const rnd1 = d.randomBindingValue(), rnd2 = d.randomBindingValue();
      out.platform = { noHeader, noHeaderClients, withHeader, withError, noUser, url: call?.url, key: call?.key, auth: call?.opts?.global?.headers?.Authorization, persist: call?.opts?.auth?.persistSession, rnd: [rnd1.length, rnd1 !== rnd2, /^[0-9a-f]+$/.test(rnd1)], sha: d.sha256Hex('abc') };
      out.platformOk = noHeader === null && noHeaderClients === 0 && same(withHeader, { userId: PLATFORM_USER }) && call.url === LINK_ENV.SUPABASE_URL && call.key === ANON && call.opts.global.headers.Authorization === 'Bearer user-jwt' && call.opts.auth.persistSession === false && call.opts.auth.autoRefreshToken === false
        && withError === null && noUser === null && rnd1.length === 64 && rnd1 !== rnd2 && /^[0-9a-f]+$/.test(rnd1) && d.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'; }
    return R(out.successOk && out.conflictOk && out.existsOk && out.ownerAbsentOk && out.disabledOk && out.platformOk, out);
  },

  // ---- P: the process entrypoint ------------------------------------------------------------------------------------------------------------------------------------
  async P01_PROCESS_SECRET_AND_CLOSED_BY_DEFAULT() {
    const rows = {}; const hdr = 'x-billing-process-secret';
    const kit = (env = PROCESS_ENV) => { const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-process/handler.ts'), c = S.load('billing-process/config.ts'), http = S.load('_shared/billing-transport/http.ts');
      const k = { created: [], http, c }; const tr = fakeTransport(); const deps = { loadConfig: () => c.loadBillingProcessConfig(x => env[x]), createTransport: url => { k.created.push(url); return tr.t; } };
      k.run = r => h.processBillingProcessRequest(r, deps); k.calls = tr.calls; return k; };
    for (const [name, env] of [['empty env', {}], ['switch off', { ...PROCESS_ENV, BILLING_INGEST_ENABLED: 'false' }], ['no namespace', without(PROCESS_ENV, 'BILLING_NAMESPACE')], ['no producer url', without(PROCESS_ENV, 'BILLING_PRODUCER_DB_URL')],
      ['no secret', without(PROCESS_ENV, 'BILLING_PROCESS_SECRET')], ['short secret', { ...PROCESS_ENV, BILLING_PROCESS_SECRET: 's'.repeat(31) }]]) {
      const k = kit(env); const res = await k.run(new Request('http://x/p', { method: 'POST', headers: { [hdr]: SECRET } })); rows[name] = { status: res.status, transports: k.created.length };
    }
    { const k = kit(); const res = await k.run(new Request('http://x/p', { method: 'GET', headers: { [hdr]: SECRET } })); rows.GET = { status: res.status, transports: k.created.length }; }
    for (const [name, value] of [['missing header', null], ['wrong same length', SECRET.slice(0, -1) + 'X'], ['shorter', SECRET.slice(0, -1)], ['longer', SECRET + 'x'], ['empty', ''], ['reversed', [...SECRET].reverse().join('')]]) {
      const k = kit(); const res = await k.run(new Request('http://x/p', { method: 'POST', headers: value === null ? {} : { [hdr]: value } })); const text = await res.text(); rows[name] = { status: res.status, transports: k.created.length, leaked: text.includes(SECRET) || text.includes('MARKER') };
    }
    { const k = kit(); const res = await k.run(new Request('http://x/p', { method: 'POST', headers: { [hdr]: SECRET } })); rows.correct = { status: res.status, transports: k.created.length, closed: k.calls.includes('closed') }; }
    const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const http = S.load('_shared/billing-transport/http.ts');
    const unit = { equal: http.secretMatches('abcdef', 'abcdef'), lastDiffers: http.secretMatches('abcdef', 'abcdeg'), firstDiffers: http.secretMatches('abcdef', 'xbcdef'), shorter: http.secretMatches('abcdef', 'abcde'), longer: http.secretMatches('abcdef', 'abcdefg'), empty: http.secretMatches('abcdef', ''), nul: http.secretMatches('abcdef', null) };
    const src = fs.readFileSync(path.join(baseDir(), 'supabase/functions/_shared/billing-transport/http.ts'), 'utf8'); const fn = /export function secretMatches[\s\S]*?\n}\n/.exec(src)?.[0] ?? '';
    const loopBody = /for \(let index[\s\S]*?\n  }\n/.exec(fn)?.[0] ?? '';
    const constantTime = loopBody !== '' && !/\b(return|break)\b/.test(loopBody) && /difference \|= /.test(loopBody);
    const closed = ['empty env', 'switch off', 'no namespace', 'no producer url', 'no secret', 'short secret'].every(n => rows[n].status === 503 && rows[n].transports === 0);
    const refused = ['missing header', 'wrong same length', 'shorter', 'longer', 'empty', 'reversed'].every(n => rows[n].status === 401 && rows[n].transports === 0 && rows[n].leaked === false);
    return R(closed && rows.GET.status === 405 && rows.GET.transports === 0 && refused && rows.correct.status === 200 && rows.correct.closed === true
      && unit.equal === true && !unit.lastDiffers && !unit.firstDiffers && !unit.shorter && !unit.longer && !unit.empty && !unit.nul && constantTime, { rows, unit, constantTime });
  },

  async P02_PROCESS_SUMMARY_IS_ACCURATE_ABOUT_PARTIAL_AND_UNKNOWN_RESULTS() {
    const out = {};
    const unknownErr = () => Object.assign(Error('BILLING_COMMIT_OUTCOME_UNKNOWN'), { code: '08006', commitOutcomeUnknown: true });
    // A scripted database: `script` is a list of steps for the transactions in order; each step is { next } | { process, commit } | { attempt }.
    const drive = async (steps, { env = PROCESS_ENV } = {}) => {
      const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const h = S.load('billing-process/handler.ts'), c = S.load('billing-process/config.ts');
      let n = 0; const log = []; let createdCount = 0;
      const t = { async transaction(fn) {
        const step = steps[n++] ?? { next: null }; log.push(Object.keys(step)[0]);
        const tx = { ingestDelivery: async () => { throw Error('unused'); }, createLinkIntent: async () => { throw Error('unused'); },
          nextCandidate: async () => { if (!('next' in step)) throw Error('script mismatch: next'); return step.next; },
          processItem: async id => { if (!('process' in step)) throw Error('script mismatch: process'); if (step.process instanceof Error) throw step.process; return { outcome: step.process, item_id: id }; },
          recordAttempt: async () => ({ outcome: 'recorded', item_id: null }) };
        const r = await fn(tx); if (step.commit) throw step.commit(); return r; }, async close() { log.push('closed'); } };
      const res = await h.processBillingProcessRequest(new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET } }), { loadConfig: () => c.loadBillingProcessConfig(x => env[x]), createTransport: () => { createdCount++; return t; } });
      const text = await res.text(); return { status: res.status, body: JSON.parse(text), text, log, created: createdCount };
    };
    const keys = ['committedOutcomes', 'completed', 'failedTransactions', 'itemOutcomeUnknown', 'note', 'status', 'stoppedBecause'];
    out.allIdle = await drive([{ next: null }]);
    out.twoFinalThenFailure = await drive([{ next: 'item-one' }, { process: 'admitted' }, { next: 'item-two' }, { process: 'quarantined' }, { next: 'item-three' }, { process: Object.assign(Error('deadlock ' + PW_MARKER), { code: '40P01' }) }, { attempt: 1 }]);
    out.laterItemUnknown = await drive([{ next: 'item-one' }, { process: 'admitted' }, { next: 'item-two' }, { process: 'admitted', commit: unknownErr }, { attempt: 1 }]);
    out.blocked = await drive([{ next: 'item-one' }, { process: 'blocked' }]);
    out.retryBusy = await drive([{ next: 'item-one' }, { process: 'retry' }, { attempt: 1 }]);
    out.mappingPending = await drive([{ next: 'item-one' }, { process: 'mapping_pending' }, { next: 'item-two' }, { process: 'dismissed' }, { next: null }]);
    out.firstLookupFails = await drive([{ next: null, commit: () => Object.assign(Error('lost'), { code: '57P01' }) }]);
    out.limit = await drive(Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? { next: 'item-' + i } : { process: 'admitted' })));
    const body = k => out[k].body; const noIds = Object.values(out).every(o => !/item-|PW-MARKER|MARKER/.test(o.text));
    const ok = out.allIdle.status === 200 && body('allIdle').status === 'ok' && body('allIdle').completed === 0 && same(Object.keys(body('allIdle')).sort(), keys)
      && out.twoFinalThenFailure.status === 503 && body('twoFinalThenFailure').status === 'failed' && body('twoFinalThenFailure').completed === 2 && same(body('twoFinalThenFailure').committedOutcomes, { admitted: 1, quarantined: 1 }) && body('twoFinalThenFailure').itemOutcomeUnknown === false && body('twoFinalThenFailure').failedTransactions >= 1
      && out.laterItemUnknown.status === 503 && body('laterItemUnknown').status === 'unknown' && body('laterItemUnknown').itemOutcomeUnknown === true && body('laterItemUnknown').completed === 1 && same(body('laterItemUnknown').committedOutcomes, { admitted: 1 })
      && out.blocked.status === 200 && body('blocked').status === 'stopped' && body('blocked').stoppedBecause === 'blocked' && body('blocked').completed === 0 && same(body('blocked').committedOutcomes, { blocked: 1 })
      && out.retryBusy.status === 200 && body('retryBusy').status === 'stopped' && body('retryBusy').completed === 0 && same(body('retryBusy').committedOutcomes, { retry: 1 })
      && out.mappingPending.status === 200 && body('mappingPending').status === 'ok' && body('mappingPending').completed === 1 && same(body('mappingPending').committedOutcomes, { mapping_pending: 1, dismissed: 1 })
      && out.firstLookupFails.status === 503 && body('firstLookupFails').status === 'failed' && body('firstLookupFails').completed === 0
      && out.limit.status === 200 && body('limit').stoppedBecause === 'limit' && body('limit').completed === 10
      && Object.values(out).every(o => o.log.includes('closed') && o.created === 1) && noIds && Object.values(out).every(o => /committed/.test(o.body.note));
    return R(ok, Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { status: v.status, body: v.body }])));
  },

  // ---- I: the REAL index.ts compositions (stubbed Deno/npm globals) ------------------------------------------------------------------------------------------------------
  async I01_REAL_INDEX_COMPOSITION_HAS_NO_EARLY_SIDE_EFFECTS() {
    const out = {};
    const compose = (dir, env, getUser) => {
      const { stubs, spies } = makeStubs(); if (getUser) spies.getUserImpl = getUser;
      const served = [], envReads = [];
      const deno = { env: { get: name => { envReads.push(name); return env[name]; } }, serve: fn => { served.push(fn); return {}; } };
      const S = newEdgeSession({ stubs, deno }); S.load(`${dir}/index.ts`);
      return { served, envReads, spies, importReads: envReads.length, importPostgres: spies.postgres.length, importClients: spies.createClient.length };
    };
    const allowed = { 'billing-webhook': ['BILLING_INGEST_ENABLED', 'BILLING_MAX_BODY_BYTES', 'BILLING_INGRESS_DB_URL'], 'billing-link': ['BILLING_INGEST_ENABLED', 'BILLING_NAMESPACE', 'BILLING_LINK_TTL_SECONDS', 'BILLING_INGRESS_DB_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'], 'billing-process': ['BILLING_INGEST_ENABLED', 'BILLING_NAMESPACE', 'BILLING_PRODUCER_DB_URL', 'BILLING_PROCESS_SECRET'] };
    const imported = {};
    for (const dir of Object.keys(allowed)) { const k = compose(dir, {}); imported[dir] = { served: k.served.length, envReads: k.importReads, postgres: k.importPostgres, clients: k.importClients }; }
    // webhook: with a complete configuration the default composition still has no verifier: 503, body untouched, no connection
    { const k = compose('billing-webhook', WEBHOOK_ENV); const probe = probeRequest([bytes(20)], { headers: { 'x-test-key-id': 'k', 'x-test-signature': 's' } }); const cap = await captureConsole(() => k.served[0](probe.request));
      const k2 = compose('billing-webhook', {}); const r2 = await captureConsole(() => k2.served[0](new Request('http://x/w', { method: 'POST', body: 'x' })));
      out.webhook = { full: cap.value.status, pulled: probe.state.pulled, postgres: k.spies.postgres.length, reads: [...new Set(k.envReads)].sort(), logs: cap.lines.length, empty: r2.value.status, emptyPostgres: k2.spies.postgres.length }; }
    // link: complete configuration; no Authorization -> 401 with no platform client; a rejected token -> 401 with no connection; an accepted token -> lazily ONE connection, closed again
    { const k = compose('billing-link', LINK_ENV); const res = await k.served[0](new Request('http://x/l', { method: 'POST', body: '{}' }));
      const k2 = compose('billing-link', LINK_ENV, async () => ({ data: { user: null }, error: { message: 'bad jwt' } })); const res2 = await k2.served[0](new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer bad' } }));
      const k3 = compose('billing-link', LINK_ENV, async () => ({ data: { user: { id: '00000000-0000-4000-8000-0000000000d4' } }, error: null })); const res3 = await k3.served[0](new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer ok' } }));
      const k4 = compose('billing-link', {}); const res4 = await k4.served[0](new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer ok' } }));
      out.link = { noAuthHeader: { status: res.status, clients: k.spies.createClient.length, postgres: k.spies.postgres.length }, rejected: { status: res2.status, clients: k2.spies.createClient.length, postgres: k2.spies.postgres.length },
        accepted: { status: res3.status, postgres: k3.spies.postgres.length, url: k3.spies.postgres[0]?.url, opts: k3.spies.postgres[0]?.opts, begins: k3.spies.begins, ends: k3.spies.ends }, notConfigured: { status: res4.status, clients: k4.spies.createClient.length, postgres: k4.spies.postgres.length } }; }
    // process: wrong secret -> 401 with no connection; right secret -> lazily ONE connection, closed again; the failure is reported honestly
    { const k = compose('billing-process', PROCESS_ENV); const res = await k.served[0](new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET + 'x' } }));
      const k2 = compose('billing-process', PROCESS_ENV); const res2 = await k2.served[0](new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET } })); const body2 = JSON.parse(await res2.text());
      const k3 = compose('billing-process', {}); const res3 = await k3.served[0](new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET } }));
      out.process = { wrongSecret: { status: res.status, postgres: k.spies.postgres.length }, rightSecret: { status: res2.status, status2: body2.status, postgres: k2.spies.postgres.length, url: k2.spies.postgres[0]?.url, begins: k2.spies.begins, ends: k2.spies.ends }, notConfigured: { status: res3.status, postgres: k3.spies.postgres.length }, reads: [...new Set(k2.envReads)].sort() }; }
    const { stubs } = makeStubs(); const T = newEdgeSession({ stubs }).load('_shared/billing-transport/denoPostgresBillingTransport.ts');
    const optionsOk = same(T.BILLING_POSTGRES_OPTIONS, { max: 1, prepare: false, ssl: 'require', connect_timeout: 10, idle_timeout: 20 });
    const importsOk = Object.values(imported).every(i => i.served === 1 && i.envReads === 0 && i.postgres === 0 && i.clients === 0);
    const readsOk = (dir, reads) => reads.every(r => allowed[dir].includes(r));
    const ok = importsOk && optionsOk
      && out.webhook.full === 503 && out.webhook.pulled === 0 && out.webhook.postgres === 0 && readsOk('billing-webhook', out.webhook.reads) && out.webhook.logs === 0 && out.webhook.empty === 503 && out.webhook.emptyPostgres === 0
      && out.link.noAuthHeader.status === 401 && out.link.noAuthHeader.clients === 0 && out.link.noAuthHeader.postgres === 0 && out.link.rejected.status === 401 && out.link.rejected.clients === 1 && out.link.rejected.postgres === 0
      && out.link.accepted.status === 503 && out.link.accepted.postgres === 1 && out.link.accepted.url === LINK_ENV.BILLING_INGRESS_DB_URL && same(out.link.accepted.opts, { max: 1, prepare: false, ssl: 'require', connect_timeout: 10, idle_timeout: 20 }) && out.link.accepted.begins === 1 && out.link.accepted.ends === 1
      && out.link.notConfigured.status === 503 && out.link.notConfigured.clients === 0 && out.link.notConfigured.postgres === 0
      && out.process.wrongSecret.status === 401 && out.process.wrongSecret.postgres === 0 && out.process.rightSecret.status === 503 && out.process.rightSecret.status2 === 'failed' && out.process.rightSecret.postgres === 1 && out.process.rightSecret.url === PROCESS_ENV.BILLING_PRODUCER_DB_URL
      && out.process.rightSecret.begins === 1 && out.process.rightSecret.ends === 1 && out.process.notConfigured.status === 503 && out.process.notConfigured.postgres === 0 && readsOk('billing-process', out.process.reads);
    return R(ok, { imported, optionsOk, ...out });
  },

  // ---- T00: classification and shapes (pure) -------------------------------------------------------------------------------------------------------------------------
  async T00_TRANSPORT_COMMIT_CLASSIFICATION_AND_SHAPES() {
    const { stubs } = makeStubs(); const S = newEdgeSession({ stubs }); const Sq = S.load('_shared/billing-transport/sql.ts'), E = S.load('_shared/billing-transport/executor.ts'), core = S.load('_shared/billing-core/index.ts');
    const definite = [['23514', true], ['40001', true], ['40P01', true], ['P0001', true], ['23503', true], ['08006', false], ['08000', false], ['57P01', false], ['57014', true], ['XX000', false], ['58030', false], ['ECONNRESET', false], ['CONNECTION_CLOSED', false], ['', false], [undefined, false], [null, false], [42, false]];
    const classRows = definite.map(([code, want]) => [String(code), Sq.commitFailureIsDefinite(code === null && false ? null : { code }) === want]);
    classRows.push(['no object', Sq.commitFailureIsDefinite(null) === false], ['plain error', Sq.commitFailureIsDefinite(Error('x')) === false]);
    const driverOf = rows => ({ withTransaction: async fn => fn({ query: async (text, params) => rows(text, params) }), close: async () => {} });
    const asTx = async (rows, call) => { const t = Sq.createBillingTransport(driverOf(rows)); try { return { ok: true, v: await t.transaction(tx => call(tx)) }; } catch (e) { return { ok: false, name: e.constructor.name, message: e.message }; } };
    const shapes = {};
    shapes.object = await asTx(() => [{ s: { outcome: 'received', item_id: '8a3a8c0e-1111-4111-8111-111111111111' } }], tx => tx.ingestDelivery(obs('a.b.c', 's', 'd', 'paid_period', atMs(1), atMs(2))));
    shapes.jsonText = await asTx(() => [{ s: '{"outcome":"duplicate","item_id":null}' }], tx => tx.ingestDelivery(obs('a.b.c', 's', 'd', 'paid_period', atMs(1), atMs(2))));
    shapes.noRows = await asTx(() => [], tx => tx.processItem('8a3a8c0e-1111-4111-8111-111111111111'));
    shapes.twoRows = await asTx(() => [{ s: { outcome: 'x' } }, { s: { outcome: 'y' } }], tx => tx.processItem('8a3a8c0e-1111-4111-8111-111111111111'));
    shapes.notJson = await asTx(() => [{ s: 'not json' }], tx => tx.recordAttempt('8a3a8c0e-1111-4111-8111-111111111111', 'r'));
    shapes.outcomeNotString = await asTx(() => [{ s: { outcome: 5 } }], tx => tx.createLinkIntent('a.b.c', '8a3a8c0e-1111-4111-8111-111111111111', 'a'.repeat(64), 1));
    shapes.arrayResult = await asTx(() => [{ s: [] }], tx => tx.processItem('8a3a8c0e-1111-4111-8111-111111111111'));
    shapes.nextNull = await asTx(() => [{ s: null }], tx => tx.nextCandidate('a.b.c'));
    shapes.nextNumber = await asTx(() => [{ s: 7 }], tx => tx.nextCandidate('a.b.c'));
    shapes.missingColumn = await asTx(() => [{ other: 1 }], tx => tx.nextCandidate('a.b.c'));
    const bodyError = Error('body failed'); const cause = Object.assign(Error('server abort'), { code: '23514' }); const unknownCause = Object.assign(Error('Connection terminated unexpectedly'), {});
    const through = async (driver) => { const t = Sq.createBillingTransport(driver); try { await t.transaction(async () => 1); return { threw: false }; } catch (e) { return { threw: true, e }; } };
    const bodyThrown = await through({ withTransaction: async () => { throw bodyError; }, close: async () => {} });
    const definiteThrown = await through({ withTransaction: async () => { throw new E.BillingCommitPhaseError(cause); }, close: async () => {} });
    const unknownThrown = await through({ withTransaction: async () => { throw new E.BillingCommitPhaseError(unknownCause); }, close: async () => {} });
    const classified = unknownThrown.e ? core.classifyDbFailure(unknownThrown.e) : null;
    const sqlTexts = Object.values(Sq.BILLING_SQL);
    const maxParam = t => Math.max(0, ...[...t.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
    const sqlOk = sqlTexts.length === 5 && Object.isFrozen(Sq.BILLING_SQL) && sqlTexts.every(t => /^select retention_billing\.[a-z_]+\(/.test(t) && !/retention_(entitlement|acquisition|capture|internal)/.test(t) && !/;/.test(t)) && same(sqlTexts.map(maxParam), [11, 4, 1, 1, 2]);
    const ok = classRows.every(([, g]) => g) && shapes.object.ok && shapes.object.v.outcome === 'received' && shapes.jsonText.ok && shapes.jsonText.v.outcome === 'duplicate' && shapes.jsonText.v.item_id === null
      && ['noRows', 'twoRows', 'notJson', 'outcomeNotString', 'arrayResult', 'nextNumber', 'missingColumn'].every(k => shapes[k].ok === false && shapes[k].name === 'BillingTransportShapeError') && shapes.nextNull.ok && shapes.nextNull.v === null
      && bodyThrown.threw && bodyThrown.e === bodyError && definiteThrown.threw && definiteThrown.e === cause && unknownThrown.threw && unknownThrown.e.commitOutcomeUnknown === true && unknownThrown.e.code === '08006' && !String(unknownThrown.e.message).includes('terminated')
      && classified.failure === 'transient' && classified.retry === true && classified.terminal === false && sqlOk;
    return R(ok, { classRows: classRows.filter(([, g]) => !g), shapes: Object.fromEntries(Object.entries(shapes).map(([k, v]) => [k, v.ok ? 'ok' : v.name])), bodyPassThrough: bodyThrown.e === bodyError, definitePassThrough: definiteThrown.e === cause, unknown: unknownThrown.e?.commitOutcomeUnknown, classified, sqlOk });
  }
});

// ==== PG layer: the product transport against a REAL PostgreSQL, through REAL login roles ========================================================================
// Roles, namespace configuration, producer registrations, links and every fact below exist ONLY in the disposable database of one gate. The Node driver implements the SAME port (executor.ts) the Deno binding implements:
// BEGIN, the callback, COMMIT on one connection; ROLLBACK when the callback throws; BillingCommitPhaseError when anything fails after the COMMIT was sent.
const q = (ctx, text, v) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
const count = async (ctx, table, where = 'true', v = []) => (await q(ctx, `select count(*)::int n from ${table} where ${where}`, v))[0].n;
async function makeUser(ctx, n) { await ctx.g.query(ctx.su, 'insert into auth.users(id,email) values($1,$2)', [uuid(n), `edge${n}@synthetic.invalid`]); return uuid(n); }
async function makeLogin(ctx, name, grants = []) {
  ctx.extraRoles.add(name);
  await ctx.g.query(ctx.su, `create role ${name} login password 'pw-${name}'`);
  for (const g of grants) await ctx.g.query(ctx.su, g);
  return name;
}
const BILL_FN = {
  ingest: `${B}.ingest_delivery(text, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, text)`,
  link: `${B}.create_link_intent(text, uuid, text, timestamp with time zone)`,
  next: `${B}.next_candidate(text)`,
  process: `${B}.process_item(uuid)`,
  attempt: `${B}.record_attempt(uuid, text)`
};
const grantFns = (role, fns) => [`grant usage on schema ${B} to ${role}`, ...fns.map(f => `grant execute on function ${BILL_FN[f]} to ${role}`)];
async function regWrite(ctx, text, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); }
  catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
async function configure(ctx, ns, { environment = 'sandbox', registeredAt = at(-400), maxPeriodMs = 400 * DAY, enabled = true } = {}) {
  await ctx.g.query(ctx.su, `insert into ${B}.namespace_config(namespace, environment, registered_at, max_period_ms, enabled) values ($1,$2,$3::timestamptz,$4,$5)`, [ns, environment, registeredAt, maxPeriodMs, enabled]);
}
const ingressRole = (ctx, name = 'bill_ingress') => makeLogin(ctx, name, grantFns(name, ['ingest', 'link']));
async function producerRole(ctx, ns, { register = true, name = 'bill_p_' + ns.replace(/[^a-z0-9]/g, '_'), registeredAt = at(-400) } = {}) {
  await makeLogin(ctx, name, grantFns(name, ['next', 'process', 'attempt']));
  if (register) await registerProducer(ctx, ns, name, registeredAt);
  return { ns, role: name };
}
const registerProducer = (ctx, ns, role, registeredAt = at(-400)) => regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,null)`, [ns, role, registeredAt]);
async function activeLink(ctx, ns, owner, subject) {
  await ctx.g.query(ctx.su, `insert into ${B}.identity_links(namespace, owner_user_id, state, binding_hash, subject_ref, activated_at) values ($1,$2,'active',$3,$4,pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()))`, [ns, owner, sha256hex('binding:' + ns + ':' + subject), subject]);
}
const dbUrl = (ctx, role, port = ctx.cl.port) => `postgres://${role}:pw-${role}@127.0.0.1:${port}/${ctx.name}`;
const inboxRows = (ctx, where = 'true', v = []) => q(ctx, `select item_id, namespace, delivery_id, subject_ref, kind, period_start, period_end, signed_at, binding_hash, reason_code, state, reason, attempts, last_error, owner_user_id, outcome from ${B}.inbox where ${where} order by received_at, item_id`, v);
const ledgerRows = (ctx, owner) => q(ctx, `select e.event_id, e.namespace, e.upstream_event_id, e.class, e.valid_from, e.valid_until from ${ENT}.entitlement_events e where e.owner_user_id=$1 order by e.valid_from, e.upstream_event_id`, [owner]);
const ms = d => (d instanceof Date ? d : new Date(d)).getTime();

// The Node driver for the driver port. `log` records every statement (text and parameters) so a gate can prove which statements the product transport actually sent.
function nodePgDriver(url, CommitPhaseError, log = null) {
  const u = new URL(url);
  const cfg = () => ({ host: u.hostname, port: Number(u.port), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), connectionTimeoutMillis: 5000 });
  return {
    async withTransaction(fn) {
      const c = new Client(cfg()); c.on('error', () => {});
      try {
        await c.connect();
        const session = { async query(text, params) { log?.push({ text, params: [...params] }); return (await c.query(text, [...params])).rows; } };
        log?.push({ text: 'begin' }); await c.query('begin');
        let result;
        try { result = await fn(session); }
        catch (e) { log?.push({ text: 'rollback' }); await c.query('rollback').catch(() => {}); throw e; }
        log?.push({ text: 'commit' });
        try { await c.query('commit'); } catch (e) { throw new CommitPhaseError(e); }
        return result;
      } finally { await c.end().catch(() => {}); }
    },
    async close() {}
  };
}
function edgeKit() {
  const { stubs, spies } = makeStubs(); const S = newEdgeSession({ stubs });
  const kit = { S, spies, E: S.load('_shared/billing-transport/executor.ts'), Sq: S.load('_shared/billing-transport/sql.ts'), core: S.load('_shared/billing-core/index.ts'),
    W: S.load('billing-webhook/handler.ts'), Wc: S.load('billing-webhook/config.ts'), Lh: S.load('billing-link/handler.ts'), Lc: S.load('billing-link/config.ts'), Ph: S.load('billing-process/handler.ts'), Pc: S.load('billing-process/config.ts') };
  kit.factory = (log = null) => url => kit.Sq.createBillingTransport(nodePgDriver(url, kit.E.BillingCommitPhaseError, log));
  kit.webhook = (env, adapter, factory) => req => kit.W.processBillingWebhookRequest(req, { loadConfig: () => kit.Wc.loadBillingWebhookConfig(k => env[k]), createTransport: factory, adapter });
  kit.link = (env, userId, factory, now = () => Date.now()) => req => kit.Lh.processBillingLinkRequest(req, { loadConfig: () => kit.Lc.loadBillingLinkConfig(k => env[k]), authenticate: async () => (userId === null ? null : { userId }),
    createTransport: factory, randomBindingValue: () => createHash('sha256').update(String(Math.random()) + Date.now()).digest('hex'), sha256Hex: sha256hex, now });
  kit.process = (env, factory) => req => kit.Ph.processBillingProcessRequest(req, { loadConfig: () => kit.Pc.loadBillingProcessConfig(k => env[k]), createTransport: factory });
  return kit;
}
const webhookReq = (ns, list, over = {}) => signedRequest(ns, list, over);
const linkReq = () => new Request('http://x/l', { method: 'POST', body: '{}', headers: { authorization: 'Bearer t' } });
const processReq = () => new Request('http://x/p', { method: 'POST', headers: { 'x-billing-process-secret': SECRET } });
const envFor = (ctx, { ing, prod, ns = 'store.sandbox', port } = {}) => ({
  webhook: { BILLING_INGEST_ENABLED: 'true', BILLING_MAX_BODY_BYTES: '65536', BILLING_INGRESS_DB_URL: dbUrl(ctx, ing, port) },
  link: { BILLING_INGEST_ENABLED: 'true', BILLING_NAMESPACE: ns, BILLING_LINK_TTL_SECONDS: '3600', BILLING_INGRESS_DB_URL: dbUrl(ctx, ing, port), SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_ANON_KEY: 'anon' },
  process: { BILLING_INGEST_ENABLED: 'true', BILLING_NAMESPACE: ns, BILLING_PRODUCER_DB_URL: dbUrl(ctx, prod, port), BILLING_PROCESS_SECRET: SECRET }
});
const bodyOf = async res => { const t = await res.text(); try { return JSON.parse(t); } catch { return t; } };

// A TCP proxy in front of PostgreSQL that can fail a connection at an exact protocol point. It parses only frame boundaries and the text of simple/parse messages; it never alters a byte it forwards.
//   cut        : do not forward the matching frame and drop the connection (the server never sees that message)
//   lose_reply : forward the matching frame, then drop the connection when the server's answer arrives (the server DID process the message)
async function startProxy(targetPort) {
  const rules = []; const events = []; const sockets = new Set();
  const server = net.createServer(client => {
    const upstream = net.connect({ host: '127.0.0.1', port: targetPort });
    sockets.add(client); sockets.add(upstream);
    const st = { typed: false, buf: Buffer.alloc(0), seen: [], dropNext: false, dead: false };
    const kill = why => { if (st.dead) return; st.dead = true; events.push(why); client.destroy(); upstream.destroy(); };
    client.on('error', () => kill('client_error')); upstream.on('error', () => kill('upstream_error'));
    client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
    upstream.on('data', d => { if (st.dropNext) { kill('reply_dropped'); return; } if (!st.dead) client.write(d); });
    client.on('data', d => {
      st.buf = Buffer.concat([st.buf, d]);
      for (;;) {
        let total;
        if (!st.typed) { if (st.buf.length < 8) return; total = st.buf.readInt32BE(0); if (st.buf.length < total) return; if (st.buf.readInt32BE(4) !== 80877103) st.typed = true; const f = st.buf.subarray(0, total); st.buf = st.buf.subarray(total); upstream.write(f); continue; }
        if (st.buf.length < 5) return; total = 1 + st.buf.readInt32BE(1); if (st.buf.length < total) return;
        const frame = st.buf.subarray(0, total); st.buf = st.buf.subarray(total);
        const type = String.fromCharCode(frame[0]); let text = '';
        if (type === 'Q') text = frame.toString('utf8', 5, total - 1);
        else if (type === 'P') { const n = frame.indexOf(0, 5); const e = frame.indexOf(0, n + 1); text = frame.toString('utf8', n + 1, e); }
        const rule = rules.find(r => !r.fired && r.frame === type && r.match.test(text) && (!r.afterSeen || st.seen.some(s => r.afterSeen.test(s))));
        if (type === 'Q' || type === 'P') st.seen.push(text);
        if (rule) {
          rule.fired = true; events.push(`${rule.action}:${rule.name}`);
          if (rule.action === 'cut') { kill('cut:' + rule.name); return; }
          upstream.write(frame); st.dropNext = true; continue;
        }
        if (!st.dead) upstream.write(frame);
      }
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port, events, rules,
    arm: rule => { rules.push({ fired: false, afterSeen: null, ...rule }); },
    clear: () => { rules.length = 0; events.length = 0; },
    async stop() { for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); }
  };
}

Object.assign(GATES, {
  async T01_FIVE_SQL_METHODS_AGAINST_THE_REAL_DATABASE_AS_THE_REAL_ROLES(ctx) {
    const ns = 'store.sandbox'; const O1 = await makeUser(ctx, 1); await configure(ctx, ns);
    const ing = await ingressRole(ctx); const prod = await producerRole(ctx, ns);
    const kit = edgeKit(); const log = []; const mk = kit.factory(log); const tIng = mk(dbUrl(ctx, ing)), tProd = mk(dbUrl(ctx, prod.role));
    const bh = sha256hex('binding:e2e'); const expires = Date.now() + 3600000;
    const isoOf = x => new Date(x).toISOString();
    // The wire-level parameter vector the product MUST send for an observation (computed here from the observation, never from product code).
    const ingestParams = o => [o.namespace, o.deliveryId, o.subjectRef, o.payloadDigest, o.kind, o.periodStartMs === null ? null : isoOf(o.periodStartMs), o.periodEndMs === null ? null : isoOf(o.periodEndMs), isoOf(o.signedAtMs), o.environment, o.bindingHash, o.reasonCode];
    // Every product call goes through stageCall(): at a NAMED stage a database rejection (SQLSTATE) or a wrong statement / parameter vector is an explicit, typed observation (StageRefusal). Any other exception escaping this gate is NEVER a detection.
    const call = (label, key, expected, fn) => stageCall(log, kit.Sq.BILLING_SQL, label, key, expected, fn);
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const link = await call('createLinkIntent', 'createLinkIntent', [ns, O1, bh, isoOf(expires)], () => tIng.transaction(tx => tx.createLinkIntent(ns, O1, bh, expires)));
    const linkRow = (await q(ctx, `select * from ${B}.identity_links`))[0];
    const o1 = obs(ns, 'sub-e2e-1', 'd-ü-測試-1', 'paid_period', atMs(5, 123), atMs(40, 456), { signedAtMs: BASE + 789, bindingHash: bh });
    const r1 = await call('ingestDelivery(o1)', 'ingestDelivery', ingestParams(o1), () => tIng.transaction(tx => tx.ingestDelivery(o1)));
    const row1 = (await inboxRows(ctx, 'item_id=$1', [r1.item_id]))[0];
    const dup = await call('ingestDelivery(o1 again)', 'ingestDelivery', ingestParams(o1), () => tIng.transaction(tx => tx.ingestDelivery(o1)));
    const o1c = { ...o1, payloadDigest: sha256hex('different') };
    const conflict = await call('ingestDelivery(o1 other digest)', 'ingestDelivery', ingestParams(o1c), () => tIng.transaction(tx => tx.ingestDelivery(o1c)));
    const o2 = obs(ns, 'sub-e2e-1', 'd-grace-1', 'grace_period', null, null, { reasonCode: 'GRACE_X' });
    const r2 = await call('ingestDelivery(o2)', 'ingestDelivery', ingestParams(o2), () => tIng.transaction(tx => tx.ingestDelivery(o2)));
    const row2 = (await inboxRows(ctx, 'item_id=$1', [r2.item_id]))[0];
    const oU = { ...o1, namespace: 'no.such.namespace', deliveryId: 'x' };
    const unknownNs = await call('ingestDelivery(unknown namespace)', 'ingestDelivery', ingestParams(oU), () => tIng.transaction(tx => tx.ingestDelivery(oU)));
    const c1 = await call('nextCandidate(ns)', 'nextCandidate', [ns], () => tProd.transaction(tx => tx.nextCandidate(ns)));
    const cOther = await call('nextCandidate(other)', 'nextCandidate', ['no.such.namespace'], () => tProd.transaction(tx => tx.nextCandidate('no.such.namespace')));
    const p1 = await call('processItem(c1)', 'processItem', [c1], () => tProd.transaction(tx => tx.processItem(c1)));
    const row1After = (await inboxRows(ctx, 'item_id=$1', [r1.item_id]))[0];
    const ledger = await ledgerRows(ctx, O1);
    const linkAfter = (await q(ctx, `select state, subject_ref, owner_user_id from ${B}.identity_links`))[0];
    const c2 = await call('nextCandidate(ns) again', 'nextCandidate', [ns], () => tProd.transaction(tx => tx.nextCandidate(ns)));
    const p2 = await call('processItem(c2)', 'processItem', [c2], () => tProd.transaction(tx => tx.processItem(c2)));
    const row2After = (await inboxRows(ctx, 'item_id=$1', [r2.item_id]))[0];
    const o3 = obs(ns, 'sub-e2e-1', 'd-later-1', 'paid_period', atMs(60), atMs(90));
    const r3 = await call('ingestDelivery(o3)', 'ingestDelivery', ingestParams(o3), () => tIng.transaction(tx => tx.ingestDelivery(o3)));
    const att = await call('recordAttempt(r3)', 'recordAttempt', [r3.item_id, 'LOCK_TIMEOUT'], () => tProd.transaction(tx => tx.recordAttempt(r3.item_id, 'LOCK_TIMEOUT')));
    const row3 = (await inboxRows(ctx, 'item_id=$1', [r3.item_id]))[0];
    const attFinal = await call('recordAttempt(r1)', 'recordAttempt', [r1.item_id, 'LOCK_TIMEOUT'], () => tProd.transaction(tx => tx.recordAttempt(r1.item_id, 'LOCK_TIMEOUT')));
    const row1Final = (await inboxRows(ctx, 'item_id=$1', [r1.item_id]))[0];
    const allowedSql = new Set([...Object.values(kit.Sq.BILLING_SQL), 'begin', 'commit', 'rollback']); const stray = [...new Set(log.map(l => l.text))].filter(t => !allowedSql.has(t));
    const ok = stray.length === 0 && link.outcome === 'created' && UUID.test(link.link_id) && linkRow.link_id === link.link_id && linkRow.state === 'pending' && linkRow.owner_user_id === O1 && linkRow.binding_hash === bh && linkRow.subject_ref === null && ms(linkRow.expires_at) === expires
      && r1.outcome === 'received' && UUID.test(r1.item_id) && row1.delivery_id === 'd-ü-測試-1' && row1.subject_ref === 'sub-e2e-1' && row1.kind === 'paid_period' && ms(row1.period_start) === atMs(5, 123) && ms(row1.period_end) === atMs(40, 456) && ms(row1.signed_at) === BASE + 789 && row1.binding_hash === bh && row1.reason_code === null && row1.state === 'received'
      && dup.outcome === 'duplicate' && dup.item_id === r1.item_id && conflict.outcome === 'delivery_conflict'
      && r2.outcome === 'received' && row2.kind === 'grace_period' && row2.period_start === null && row2.period_end === null && row2.reason_code === 'GRACE_X' && row2.binding_hash === null
      && unknownNs.outcome === 'unknown_namespace' && unknownNs.item_id === null
      && c1 === r1.item_id && cOther === null
      && p1.outcome === 'admitted' && p1.item_id === r1.item_id && row1After.state === 'admitted' && row1After.owner_user_id === O1 && ledger.length === 1 && ledger[0].class === 'paid' && ms(ledger[0].valid_from) === atMs(5, 123) && ms(ledger[0].valid_until) === atMs(40, 456) && linkAfter.state === 'active' && linkAfter.subject_ref === 'sub-e2e-1'
      && c2 === r2.item_id && p2.outcome === 'quarantined' && row2After.state === 'quarantined' && (await count(ctx, `${ENT}.entitlement_events`)) === 1
      && r3.outcome === 'received' && typeof att.outcome === 'string' && row3.attempts === 1 && row3.last_error !== null && typeof attFinal.outcome === 'string' && row1Final.attempts === row1After.attempts && row1Final.state === 'admitted';
    return R(ok, { stray, link, linkRow: { state: linkRow.state, expires: ms(linkRow.expires_at) === expires }, r1, row1: { ...row1, period_start: ms(row1.period_start), period_end: ms(row1.period_end), signed_at: ms(row1.signed_at) }, dup, conflict, r2, row2: { kind: row2.kind, reason: row2.reason_code }, unknownNs, c1, cOther, p1, row1After: row1After.state, ledger, linkAfter, c2, p2, row2After: row2After.state, r3, att, row3: { attempts: row3.attempts, last_error: row3.last_error, state: row3.state }, attFinal, row1Final: { attempts: row1Final.attempts, state: row1Final.state } });
  },

  async T02_TRANSACTION_BOUNDARIES_AND_ERROR_PASS_THROUGH(ctx) {
    const ns = 'store.sandbox'; const O1 = await makeUser(ctx, 1); await configure(ctx, ns); await activeLink(ctx, ns, O1, 'sub-t2');
    const ing = await ingressRole(ctx); const prod = await producerRole(ctx, ns);
    const kit = edgeKit(); const log = []; const mk = kit.factory(log); const tIng = mk(dbUrl(ctx, ing)), tProd = mk(dbUrl(ctx, prod.role));
    const o = (d, k = 'paid_period') => obs(ns, 'sub-t2', d, k, atMs(2), atMs(9));
    const out = {};
    // a) a failure after the first call rolls the first call back
    { let threw = null; try { await tIng.transaction(async tx => { await tx.ingestDelivery(o('d-a')); throw Error('stop-after-first'); }); } catch (e) { threw = e.message; }
      out.rollback = { threw, rows: await count(ctx, `${B}.inbox`), statements: log.map(l => (l.text.length > 12 ? 'sql' : l.text)) }; }
    log.length = 0;
    // b) nothing is committed between the calls of one transaction; everything is committed when it ends
    { let visibleInside = null; await tIng.transaction(async tx => { await tx.ingestDelivery(o('d-b1')); visibleInside = await count(ctx, `${B}.inbox`); await tx.ingestDelivery(o('d-b2')); });
      out.noAutocommit = { visibleInside, after: await count(ctx, `${B}.inbox`), statements: log.map(l => (l.text.length > 12 ? 'sql' : l.text)) }; }
    // c) the database enforces one item per transaction; the product transport does not hide it and the failure rolls the whole transaction back
    { const a = (await tIng.transaction(tx => tx.ingestDelivery(o('d-c1')))).item_id, b = (await tIng.transaction(tx => tx.ingestDelivery(o('d-c2')))).item_id;
      let err = null; try { await tProd.transaction(async tx => { await tx.processItem(a); await tx.processItem(b); }); } catch (e) { err = { code: e.code ?? null, message: e.message }; }
      const states = await q(ctx, `select delivery_id, state from ${B}.inbox where delivery_id in ('d-c1','d-c2') order by delivery_id`);
      out.dirty = { err, decision: err ? kit.core.classifyDbFailure(err) : null, states, ledger: await count(ctx, `${ENT}.entitlement_events`) }; }
    // d) a database error keeps its SQLSTATE and message through the transport and rolls back
    { let err = null; try { await tIng.transaction(async tx => { await tx.ingestDelivery(o('d-d1')); await tx.ingestDelivery({ ...o('d-d2'), payloadDigest: 'not-hex' }); }); } catch (e) { err = { code: e.code ?? null, name: e.constructor.name, message: String(e.message).slice(0, 60) }; }
      out.dbError = { err, d1Rows: await count(ctx, `${B}.inbox`, "delivery_id in ('d-d1','d-d2')") }; }
    // e) every statement ever sent is one of the five constants or begin/commit/rollback; parameters never contain SQL text
    const allowed = new Set([...Object.values(kit.Sq.BILLING_SQL), 'begin', 'commit', 'rollback']); const texts = new Set(log.map(l => l.text)); const stray = [...texts].filter(t => !allowed.has(t));
    out.hygiene = { distinct: texts.size, stray, paramsHaveSql: log.some(l => (l.params ?? []).some(p => typeof p === 'string' && /\bselect\b|\binsert\b/i.test(p))) };
    const seq = a => a.join('>');
    const ok = out.rollback.threw === 'stop-after-first' && out.rollback.rows === 0 && seq(out.rollback.statements) === 'begin>sql>rollback',
      ok2 = seq(out.noAutocommit.statements) === 'begin>sql>sql>commit' && out.noAutocommit.visibleInside === 0 && out.noAutocommit.after === 2;
    const dirtyOk = out.dirty.err !== null && /BILLING_DIRTY_TRANSACTION/.test(out.dirty.err.message) && out.dirty.err.code === '25000' && out.dirty.decision.failure === 'contract_violation' && out.dirty.decision.retry === false
      && out.dirty.states.every(s => s.state === 'received') && out.dirty.ledger === 0;
    const dbErrOk = out.dbError.err !== null && typeof out.dbError.err.code === 'string' && out.dbError.d1Rows === 0 && out.dbError.err.name !== 'BillingCommitOutcomeUnknownError';
    return R(ok && ok2 && dirtyOk && dbErrOk && out.hygiene.stray.length === 0 && out.hygiene.paramsHaveSql === false, out);
  },

  async T03_END_TO_END_LINK_WEBHOOK_PROCESS_WITH_REAL_LOGIN_ROLES(ctx) {
    const ns = 'store.sandbox', ns2 = 'store.blocked'; const O1 = await makeUser(ctx, 1), O2 = await makeUser(ctx, 2);
    await configure(ctx, ns); await configure(ctx, ns2);
    const ing = await ingressRole(ctx); const prod = await producerRole(ctx, ns); const prod2 = await producerRole(ctx, ns2, { register: false });
    const kit = edgeKit(); const mk = kit.factory(); const e = envFor(ctx, { ing, prod: prod.role, ns }); const e2 = envFor(ctx, { ing, prod: prod2.role, ns: ns2 });
    const out = {};
    // the connection identity is the dedicated login role (not a superuser, not the owner)
    const who = async role => (await nodePgDriver(dbUrl(ctx, role), kit.E.BillingCommitPhaseError).withTransaction(s => s.query('select session_user su, current_user cu, (select rolsuper from pg_roles where rolname=session_user) super', [])))[0];
    out.who = { ingress: await who(ing), producer: await who(prod.role) };
    // link
    const lres = await kit.link(e.link, O1, mk)(linkReq()); const lbody = await bodyOf(lres);
    const lrow = (await q(ctx, `select state, owner_user_id, binding_hash, subject_ref from ${B}.identity_links where owner_user_id=$1`, [O1]))[0];
    out.link = { status: lres.status, keys: Object.keys(lbody).sort(), state: lrow?.state, hashIsOfReturned: lrow?.binding_hash === sha256hex(lbody.binding), rawStored: await count(ctx, `${B}.identity_links`, 'binding_hash=$1', [lbody.binding]) };
    // webhook: the observation echoes the server-issued binding; the 200 is returned only after the commit
    const adapter = syntheticAdapter(ns); const wh = kit.webhook(e.webhook, adapter, mk);
    const d1 = obs(ns, 'sub-e2e', 'd-e2e-1', 'paid_period', atMs(2), atMs(30), { bindingHash: sha256hex(lbody.binding) });
    const wres = await wh(webhookReq(ns, [d1])); const afterAck = await inboxRows(ctx);
    const wdup = await wh(webhookReq(ns, [d1]));
    out.webhook = { status: wres.status, body: await bodyOf(wres), rowsVisibleAtAck: afterAck.length, state: afterAck[0]?.state, dup: wdup.status, rowsAfterDup: await count(ctx, `${B}.inbox`) };
    // process with the registered producer
    const pr = kit.process(e.process, mk); const pres = await pr(processReq()); const pbody = await bodyOf(pres);
    const ledger1 = await ledgerRows(ctx, O1); const link1 = (await q(ctx, `select state, subject_ref from ${B}.identity_links where owner_user_id=$1`, [O1]))[0];
    const pres2 = await pr(processReq()); const pbody2 = await bodyOf(pres2);
    out.process = { status: pres.status, body: pbody, ledger: ledger1.map(r => [r.class, ms(r.valid_from), ms(r.valid_until)]), link: link1, again: { status: pres2.status, body: pbody2, ledger: (await ledgerRows(ctx, O1)).length } };
    // an unsupported kind is quarantined with evidence and is NOT turned into a fact
    await wh(webhookReq(ns, [obs(ns, 'sub-e2e', 'd-e2e-grace', 'grace_period', null, null)]));
    const pres3 = await pr(processReq()); out.quarantine = { status: pres3.status, body: await bodyOf(pres3), ledger: (await ledgerRows(ctx, O1)).length, evidence: await count(ctx, `${B}.evidence_log`, "kind <> ''") };
    // blocked: the namespace's producer is not registered => nothing at all changes, the link stays pending, and the response says "stopped", not success
    const lres2 = await kit.link(e2.link, O2, mk)(linkReq()); const lbody2 = await bodyOf(lres2);
    const wh2 = kit.webhook(e2.webhook, syntheticAdapter(ns2), mk);
    await wh2(webhookReq(ns2, [obs(ns2, 'sub-blk', 'd-blk-1', 'paid_period', atMs(2), atMs(30), { bindingHash: sha256hex(lbody2.binding) })]));
    const snap = async () => ({ link: (await q(ctx, `select state, subject_ref, activated_at from ${B}.identity_links where owner_user_id=$1`, [O2]))[0], items: (await inboxRows(ctx, 'namespace=$1', [ns2])).map(r => [r.state, r.attempts, r.owner_user_id]), ledger: (await ledgerRows(ctx, O2)).length, segments: await count(ctx, `${B}.fact_segments`, 'namespace=$1', [ns2]) });
    const before = await snap(); const pr2 = kit.process(e2.process, mk); const bres = await pr2(processReq()); const bbody = await bodyOf(bres); const mid = await snap();
    await registerProducer(ctx, ns2, prod2.role);
    const bres2 = await pr2(processReq()); const bbody2 = await bodyOf(bres2); const after = await snap();
    out.blocked = { first: { status: bres.status, body: bbody }, before, mid, unchangedWhileBlocked: same(before, mid), second: { status: bres2.status, body: bbody2 }, after };
    const ok = out.who.ingress.su === ing && out.who.ingress.cu === ing && out.who.ingress.super === false && out.who.producer.su === prod.role && out.who.producer.super === false
      && out.link.status === 200 && same(out.link.keys, ['binding', 'status']) && out.link.state === 'pending' && out.link.hashIsOfReturned === true && out.link.rawStored === 0
      && out.webhook.status === 200 && same(out.webhook.body, { status: 'received' }) && out.webhook.rowsVisibleAtAck === 1 && out.webhook.state === 'received' && out.webhook.dup === 200 && out.webhook.rowsAfterDup === 1
      && out.process.status === 200 && out.process.body.status === 'ok' && out.process.body.completed === 1 && same(out.process.body.committedOutcomes, { admitted: 1 }) && same(out.process.ledger, [['paid', atMs(2), atMs(30)]]) && out.process.link.state === 'active' && out.process.link.subject_ref === 'sub-e2e'
      && out.process.again.status === 200 && out.process.again.body.completed === 0 && out.process.again.ledger === 1
      && out.quarantine.status === 200 && out.quarantine.body.completed === 1 && same(out.quarantine.body.committedOutcomes, { quarantined: 1 }) && out.quarantine.ledger === 1 && out.quarantine.evidence >= 1
      && lres2.status === 200 && out.blocked.first.status === 200 && out.blocked.first.body.status === 'stopped' && out.blocked.first.body.completed === 0 && same(out.blocked.first.body.committedOutcomes, { blocked: 1 }) && out.blocked.unchangedWhileBlocked
      && before.link.state === 'pending' && before.link.subject_ref === null && before.ledger === 0 && before.segments === 0
      && out.blocked.second.status === 200 && out.blocked.second.body.completed === 1 && same(out.blocked.second.body.committedOutcomes, { admitted: 1 }) && after.link.state === 'active' && after.ledger === 1;
    return R(ok, out);
  },

  async T04_ROLE_ISOLATION_SESSION_USER_AND_EFFECTIVE_PRIVILEGES(ctx) {
    const ns = 'store.sandbox'; const O1 = await makeUser(ctx, 1); await configure(ctx, ns); await activeLink(ctx, ns, O1, 'sub-t4');
    const ing = await ingressRole(ctx); const prod = await producerRole(ctx, ns);
    const kit = edgeKit(); const mk = kit.factory(); const tIng = mk(dbUrl(ctx, ing)), tProd = mk(dbUrl(ctx, prod.role));
    const funcs = await q(ctx, `select p.oid::regprocedure::text sig, n.nspname schema from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('${B}','${ENT}','${ACQ}','retention_capture','retention_internal') and p.prokind='f' order by 1`);
    const tables = await q(ctx, `select c.oid::regclass::text rel from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('${B}','${ENT}','${ACQ}','retention_capture','retention_internal') and c.relkind in ('r','p','v','m','S') order by 1`);
    const schemas = [B, ENT, ACQ, 'retention_capture', 'retention_internal'];
    const matrix = async role => {
      const fx = []; for (const f of funcs) if ((await q(ctx, 'select has_function_privilege($1,$2::regprocedure,\'EXECUTE\') x', [role, f.sig]))[0].x) fx.push(f.sig);
      const tx = []; for (const t of tables) if ((await q(ctx, "select (has_table_privilege($1,$2::regclass,'SELECT') or has_table_privilege($1,$2::regclass,'INSERT') or has_table_privilege($1,$2::regclass,'UPDATE') or has_table_privilege($1,$2::regclass,'DELETE') or has_table_privilege($1,$2::regclass,'TRUNCATE') or has_table_privilege($1,$2::regclass,'REFERENCES') or has_table_privilege($1,$2::regclass,'TRIGGER')) x", [role, t.rel]))[0].x) tx.push(t.rel);
      const sx = []; for (const s of schemas) if ((await q(ctx, "select has_schema_privilege($1,$2,'USAGE') or has_schema_privilege($1,$2,'CREATE') x", [role, s]))[0].x) sx.push(s);
      const r = (await q(ctx, 'select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit from pg_roles where rolname=$1', [role]))[0];
      const mem = await q(ctx, 'select pg_get_userbyid(roleid) r from pg_auth_members where member = $1::regrole', [role]);
      return { functions: fx.map(x => x.replace(/^retention_billing\./, 'B.')), tables: tx, schemas: sx, flags: r, memberOf: mem.map(m => m.r) };
    };
    const mIng = await matrix(ing), mProd = await matrix(prod.role), mAdmin = await matrix('supabase_admin');
    const tryCall = async (t, fn) => { try { await t.transaction(fn); return { ok: true }; } catch (e) { return { ok: false, code: e.code ?? null, decision: kit.core.classifyDbFailure(e).failure }; } };
    const o = obs(ns, 'sub-t4', 'd-t4', 'paid_period', atMs(2), atMs(9));
    const neg = {
      ingressNext: await tryCall(tIng, tx => tx.nextCandidate(ns)), ingressProcess: await tryCall(tIng, tx => tx.processItem(uuid(77))), ingressAttempt: await tryCall(tIng, tx => tx.recordAttempt(uuid(77), 'x')),
      producerIngest: await tryCall(tProd, tx => tx.ingestDelivery(o)), producerLink: await tryCall(tProd, tx => tx.createLinkIntent(ns, O1, 'a'.repeat(64), Date.now() + 1000))
    };
    // a handler wired to the WRONG role fails closed and writes nothing
    const e = envFor(ctx, { ing: prod.role, prod: ing, ns }); const wrong = {};
    { const res = await kit.webhook(e.webhook, syntheticAdapter(ns), mk)(webhookReq(ns, [o])); wrong.webhook = { status: res.status, rows: await count(ctx, `${B}.inbox`) }; }
    { const res = await kit.process(e.process, mk)(processReq()); wrong.process = { status: res.status, body: await bodyOf(res) }; }
    const sameSet = (a, b) => same([...a].sort(), [...b].sort());
    const wantIng = ['B.create_link_intent(text,uuid,text,timestamp with time zone)', 'B.ingest_delivery(text,text,text,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text)'];
    const wantProd = ['B.next_candidate(text)', 'B.process_item(uuid)', 'B.record_attempt(uuid,text)'];
    const flagsOk = f => f.rolsuper === false && f.rolbypassrls === false && f.rolcreaterole === false && f.rolcreatedb === false && f.rolreplication === false;
    const ok = sameSet(mIng.functions, wantIng) && sameSet(mProd.functions, wantProd)
      && mIng.tables.length === 0 && mProd.tables.length === 0 && same(mIng.schemas, [B]) && same(mProd.schemas, [B]) && flagsOk(mIng.flags) && flagsOk(mProd.flags) && mIng.memberOf.length === 0 && mProd.memberOf.length === 0
      && mAdmin.flags.rolsuper === true && mAdmin.functions.length > 5
      && Object.values(neg).every(n => n.ok === false && n.code === '42501' && n.decision === 'configuration')
      && wrong.webhook.status === 503 && wrong.webhook.rows === 0 && wrong.process.status === 503 && wrong.process.body.status === 'failed' && wrong.process.body.completed === 0;
    return R(ok, { mIng, mProd, control: { adminSuper: mAdmin.flags.rolsuper, adminFunctions: mAdmin.functions.length }, neg, wrong });
  },

  async T05_COMMIT_AND_CONNECTION_FAILURES_BEFORE_DURING_AND_AFTER_COMMIT(ctx) {
    const ns = 'store.sandbox'; const O1 = await makeUser(ctx, 1); await configure(ctx, ns); await activeLink(ctx, ns, O1, 'sub-t5');
    const ing = await ingressRole(ctx); const prod = await producerRole(ctx, ns);
    const proxy = await startProxy(ctx.cl.port);
    try {
      const kit = edgeKit(); const mk = kit.factory(); const direct = envFor(ctx, { ing, prod: prod.role, ns }); const viaProxy = envFor(ctx, { ing, prod: prod.role, ns, port: proxy.port });
      const adapter = syntheticAdapter(ns); const out = { webhook: {}, process: {} };
      const flagOf = async fn => { try { await fn(); return { threw: false }; } catch (e) { return { threw: true, unknown: e.commitOutcomeUnknown === true, code: e.code ?? null }; } };
      // ---- webhook: three distinct failure points, each followed by a redelivery of the SAME delivery id ----
      const webhookCase = async (name, rule, deliveryId, expectRowsAfterFailure) => {
        proxy.clear(); proxy.arm({ name, ...rule });
        const o = obs(ns, 'sub-t5', deliveryId, 'paid_period', atMs(2 + Object.keys(out.webhook).length * 3), atMs(4 + Object.keys(out.webhook).length * 3));
        const transportFlag = await flagOf(() => mk(dbUrl(ctx, ing, proxy.port)).transaction(async tx => { await tx.ingestDelivery({ ...o, deliveryId: deliveryId + '-probe' }); })); // same failure point seen from the transport (separate delivery id)
        const probeRows = await count(ctx, `${B}.inbox`, 'delivery_id=$1', [deliveryId + '-probe']);
        proxy.clear(); proxy.arm({ name, ...rule });
        const res = await kit.webhook(viaProxy.webhook, adapter, mk)(webhookReq(ns, [o]));
        const rowsAfterFailure = await count(ctx, `${B}.inbox`, 'delivery_id=$1', [deliveryId]); const events = [...proxy.events]; proxy.clear();
        const retry = await kit.webhook(direct.webhook, adapter, mk)(webhookReq(ns, [o])); const retryBody = await bodyOf(retry);
        const rowsAfterRetry = await count(ctx, `${B}.inbox`, 'delivery_id=$1', [deliveryId]); const evidence = await count(ctx, `${B}.evidence_log`);
        const retry2 = await kit.webhook(direct.webhook, adapter, mk)(webhookReq(ns, [o]));
        out.webhook[name] = { transportFlag, probeRows, status: res.status, rowsAfterFailure, events, retry: retry.status, retryBody, rowsAfterRetry, retry2: retry2.status, rowsAfterRetry2: await count(ctx, `${B}.inbox`, 'delivery_id=$1', [deliveryId]), evidenceStable: evidence === await count(ctx, `${B}.evidence_log`), expectRowsAfterFailure };
      };
      await webhookCase('before_commit_is_sent', { frame: 'P', match: /ingest_delivery/, action: 'cut' }, 'd-t5-a', 0);
      await webhookCase('commit_sent_but_never_arrives', { frame: 'Q', match: /^commit$/i, action: 'cut' }, 'd-t5-b', 0);
      await webhookCase('commit_applied_reply_lost', { frame: 'Q', match: /^commit$/i, action: 'lose_reply' }, 'd-t5-c', 1);
      { proxy.clear(); const drained = await kit.process(direct.process, mk)(processReq()); out.drainedBeforeProcessCases = { status: drained.status, body: await bodyOf(drained) }; } // the three redelivered items are processed first so each process case below sees exactly one item
      // ---- process: item-level failure points; the item states after the failure are read from the database, never assumed ----
      const makeItem = async (deliveryId, kind, startDay) => {
        const o = obs(ns, 'sub-t5', deliveryId, kind, kind === 'paid_period' ? atMs(startDay) : null, kind === 'paid_period' ? atMs(startDay + 2) : null);
        const r = await kit.webhook(direct.webhook, adapter, mk)(webhookReq(ns, [o])); if (r.status !== 200) throw Error('SETUP_ITEM ' + deliveryId); return (await inboxRows(ctx, 'delivery_id=$1', [deliveryId]))[0].item_id;
      };
      const itemState = async id => { const r = (await inboxRows(ctx, 'item_id=$1', [id]))[0]; return { state: r.state, attempts: r.attempts }; };
      const processCase = async (name, rule, deliveryId, kind, startDay) => {
        const id = await makeItem(deliveryId, kind, startDay); const factsBefore = await count(ctx, `${ENT}.entitlement_events`); const evidenceBefore = await count(ctx, `${B}.evidence_log`, 'item_id=$1', [id]);
        proxy.clear(); proxy.arm({ name, ...rule });
        const res = await kit.process(viaProxy.process, mk)(processReq()); const body = await bodyOf(res); const events = [...proxy.events]; proxy.clear();
        const afterFailure = { item: await itemState(id), facts: await count(ctx, `${ENT}.entitlement_events`), evidence: await count(ctx, `${B}.evidence_log`, 'item_id=$1', [id]) };
        const retry = await kit.process(direct.process, mk)(processReq()); const retryBody = await bodyOf(retry);
        const afterRetry = { item: await itemState(id), facts: await count(ctx, `${ENT}.entitlement_events`), evidence: await count(ctx, `${B}.evidence_log`, 'item_id=$1', [id]) };
        const retry2 = await kit.process(direct.process, mk)(processReq()); const afterRetry2 = { item: await itemState(id), facts: await count(ctx, `${ENT}.entitlement_events`) };
        out.process[name] = { status: res.status, body, events, factsBefore, evidenceBefore, afterFailure, retry: { status: retry.status, body: retryBody }, afterRetry, retry2Facts: afterRetry2.facts, retry2State: afterRetry2.item.state };
      };
      const processRule = (action, afterSeen = /process_item/) => ({ frame: 'Q', match: /^commit$/i, afterSeen, action });
      await processCase('admitted_reply_lost', processRule('lose_reply'), 'd-t5-p1', 'paid_period', 20);
      await processCase('admitted_commit_never_arrives', processRule('cut'), 'd-t5-p2', 'paid_period', 30);
      await processCase('quarantined_reply_lost', processRule('lose_reply'), 'd-t5-p3', 'grace_period', 0);
      const w = out.webhook, p = out.process;
      const webhookOk = ['before_commit_is_sent', 'commit_sent_but_never_arrives', 'commit_applied_reply_lost'].every(k => w[k].status === 503 && w[k].retry === 200 && w[k].rowsAfterRetry === 1 && w[k].rowsAfterRetry2 === 1 && w[k].evidenceStable && w[k].events.length > 0)
        && w.before_commit_is_sent.rowsAfterFailure === 0 && w.before_commit_is_sent.transportFlag.threw && w.before_commit_is_sent.transportFlag.unknown === false && w.before_commit_is_sent.probeRows === 0 && same(w.before_commit_is_sent.retryBody, { status: 'received' })
        && w.commit_sent_but_never_arrives.rowsAfterFailure === 0 && w.commit_sent_but_never_arrives.transportFlag.unknown === true && w.commit_sent_but_never_arrives.probeRows === 0 && same(w.commit_sent_but_never_arrives.retryBody, { status: 'received' })
        && w.commit_applied_reply_lost.rowsAfterFailure === 1 && w.commit_applied_reply_lost.transportFlag.unknown === true && w.commit_applied_reply_lost.probeRows === 1;
      const processOk = p.admitted_reply_lost.status === 503 && p.admitted_reply_lost.body.status === 'unknown' && p.admitted_reply_lost.body.itemOutcomeUnknown === true && p.admitted_reply_lost.body.completed === 0
        && p.admitted_reply_lost.afterFailure.item.state === 'admitted' && p.admitted_reply_lost.afterFailure.facts === p.admitted_reply_lost.factsBefore + 1 && p.admitted_reply_lost.retry.status === 200 && p.admitted_reply_lost.retry.body.completed === 0 && p.admitted_reply_lost.afterRetry.facts === p.admitted_reply_lost.afterFailure.facts && p.admitted_reply_lost.retry2Facts === p.admitted_reply_lost.afterFailure.facts
        && p.admitted_commit_never_arrives.status === 503 && p.admitted_commit_never_arrives.body.status === 'unknown' && p.admitted_commit_never_arrives.afterFailure.item.state !== 'admitted' && p.admitted_commit_never_arrives.afterFailure.facts === p.admitted_commit_never_arrives.factsBefore
        && p.admitted_commit_never_arrives.retry.status === 200 && p.admitted_commit_never_arrives.retry.body.completed === 1 && p.admitted_commit_never_arrives.afterRetry.item.state === 'admitted' && p.admitted_commit_never_arrives.afterRetry.facts === p.admitted_commit_never_arrives.factsBefore + 1 && p.admitted_commit_never_arrives.retry2Facts === p.admitted_commit_never_arrives.afterRetry.facts
        && p.quarantined_reply_lost.status === 503 && p.quarantined_reply_lost.body.status === 'unknown' && p.quarantined_reply_lost.afterFailure.item.state === 'quarantined' && p.quarantined_reply_lost.afterFailure.facts === p.quarantined_reply_lost.factsBefore
        && p.quarantined_reply_lost.afterRetry.item.state === 'quarantined' && p.quarantined_reply_lost.afterRetry.facts === p.quarantined_reply_lost.factsBefore && p.quarantined_reply_lost.afterRetry.evidence === p.quarantined_reply_lost.afterFailure.evidence && p.quarantined_reply_lost.retry.body.completed === 0;
      return R(webhookOk && processOk, out);
    } finally { await proxy.stop(); }
  },

  async T06_A_DEFINITE_COMMIT_ABORT_IS_NOT_REPORTED_AS_UNKNOWN(ctx) {
    const ns = 'store.sandbox'; await configure(ctx, ns); const ing = await ingressRole(ctx);
    // A deferred constraint trigger (test database only) makes the server answer the COMMIT with an error: the transaction is certainly NOT committed.
    await ctx.g.query(ctx.su, "create function public.edge_fail_at_commit() returns trigger language plpgsql as $f$ begin if new.delivery_id = 'FAIL-AT-COMMIT' then raise exception 'EDGE_COMMIT_ABORT' using errcode = '23514'; end if; return null; end $f$");
    await ctx.g.query(ctx.su, `create constraint trigger edge_fail_at_commit after insert on ${B}.inbox deferrable initially deferred for each row execute function public.edge_fail_at_commit()`);
    const kit = edgeKit(); const mk = kit.factory(); const e = envFor(ctx, { ing, prod: ing, ns });
    const o = obs(ns, 'sub-t6', 'FAIL-AT-COMMIT', 'paid_period', atMs(2), atMs(9));
    let err = null; try { await mk(dbUrl(ctx, ing)).transaction(tx => tx.ingestDelivery(o)); } catch (x) { err = { code: x.code ?? null, unknown: x.commitOutcomeUnknown === true, message: String(x.message).slice(0, 40) }; }
    const res = await kit.webhook(e.webhook, syntheticAdapter(ns), mk)(webhookReq(ns, [o]));
    const rows = await count(ctx, `${B}.inbox`, "delivery_id='FAIL-AT-COMMIT'");
    const control = await kit.webhook(e.webhook, syntheticAdapter(ns), mk)(webhookReq(ns, [{ ...o, deliveryId: 'FINE' }]));
    return R(err !== null && err.code === '23514' && err.unknown === false && /EDGE_COMMIT_ABORT/.test(err.message) && res.status === 503 && rows === 0 && control.status === 200, { err, status: res.status, rows, control: control.status });
  },

  async T07_A_LOCK_WAIT_IS_A_STOPPED_RETRY_NOT_A_FAILURE_THROUGH_THE_PRODUCT_PATH(ctx) {
    const ns = 'store.sandbox'; const O1 = await makeUser(ctx, 1); await configure(ctx, ns); await activeLink(ctx, ns, O1, 'sub-t7');
    const ing = await ingressRole(ctx); const prod = await producerRole(ctx, ns); const kit = edgeKit(); const mk = kit.factory(); const e = envFor(ctx, { ing, prod: prod.role, ns });
    const wh = kit.webhook(e.webhook, syntheticAdapter(ns), mk);
    const w = await wh(webhookReq(ns, [obs(ns, 'sub-t7', 'd-t7-1', 'paid_period', atMs(2), atMs(9))]));
    // the SAME subject advisory lock the processing function takes, held by another transaction
    const holder = await ctx.open('supabase_admin'); await holder.query('begin');
    await holder.query("select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('retention_billing:' || $1::text || ':' || $2::text, 0))", [ns, 'sub-t7']);
    const t0 = Date.now(); const res = await kit.process(e.process, mk)(processReq()); const waited = Date.now() - t0; const body = await bodyOf(res);
    const during = (await inboxRows(ctx))[0]; await holder.query('rollback');
    const res2 = await kit.process(e.process, mk)(processReq()); const body2 = await bodyOf(res2); const after = (await inboxRows(ctx))[0];
    return R(w.status === 200 && res.status === 200 && body.status === 'stopped' && body.stoppedBecause === 'busy_or_retry' && body.completed === 0 && same(body.committedOutcomes, { retry: 1 }) && waited >= 1500 && waited < 6000
      && during.state !== 'admitted' && res2.status === 200 && body2.completed === 1 && after.state === 'admitted' && (await ledgerRows(ctx, O1)).length === 1, { w: w.status, res: res.status, body, waited, during: { state: during.state, attempts: during.attempts }, res2: res2.status, body2, after: after.state });
  }
});

// ==== static / structural gates ======================================================================================================================================
// Source text WITHOUT comments, keeping every import and identifier (a transpile would drop an unused import and hide it from the static gates).
function stripComments(text) { const sc = tsc.createScanner(tsc.ScriptTarget.ES2022, false, tsc.LanguageVariant.Standard, text); let out = ''; for (let k = sc.scan(); k !== tsc.SyntaxKind.EndOfFileToken; k = sc.scan()) { if (k === tsc.SyntaxKind.SingleLineCommentTrivia || k === tsc.SyntaxKind.MultiLineCommentTrivia) continue; out += sc.getTokenText(); } return out; }
const strip = file => stripComments(fs.readFileSync(path.join(baseDir(), file), 'utf8'));
const sourcesStripped = () => Object.fromEntries(ENT_F2_SOURCE_PATHS.map(p => [p, strip(p)]));
const gitRun = args => { const r = child.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 64e6 }); if (r.status) throw Error('SETUP_GIT ' + args.join(' ') + ' ' + r.stderr); return r.stdout; };
export const BASE_TREE = 'c9e33c81bf717ea29f9230c841d24d062e47681a';
export const CONFIG_TOML_BLOB = '3054925598e5849d7927853a241207aab154056a';
export const ENT_F1_PROTECTED = Object.freeze([
  'supabase/functions/_shared/billing-core/errors.ts', 'supabase/functions/_shared/billing-core/index.ts', 'supabase/functions/_shared/billing-core/keys.ts', 'supabase/functions/_shared/billing-core/segments.ts', 'supabase/functions/_shared/billing-core/types.ts', 'supabase/functions/_shared/billing-core/validate.ts',
  'supabase/functions/_shared/billing-ingest/index.ts', 'supabase/functions/_shared/billing-ingest/link.ts', 'supabase/functions/_shared/billing-ingest/process.ts', 'supabase/functions/_shared/billing-ingest/receive.ts', 'supabase/functions/_shared/billing-ingest/types.ts',
  'supabase/migrations/20261021010000_consumer_retention_billing_fact_ingest.sql', 'scripts/consumer-retention-billing-smoke.mjs', 'scripts/consumer-retention-billing-mutations.mjs'
]);
const ALLOWED_CHANGES = new Set([...ENT_F2_SOURCE_PATHS, 'scripts/consumer-retention-billing-edge-smoke.mjs', 'scripts/consumer-retention-billing-edge-mutations.mjs', 'docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md',
  'scripts/consumer-meal-save-recovery-guard.mjs', 'scripts/consumer-retention-persistence-smoke.mjs', 'scripts/consumer-retention-capture-smoke.mjs']);

Object.assign(GATES, {
  async S01_NO_PROVIDER_NO_VERIFIER_IMPLEMENTATION_AND_NO_PRODUCTION_BYPASS() {
    const code = sourcesStripped(); const rows = {};
    const PROVIDER = /stripe|revenuecat|paddle|lemon ?squeezy|app ?store|play ?billing|google ?play|apple|xendit|ecpay|newebpay|linepay|tappay|paypal|braintree|adyen|checkout\.com|mollie|razorpay/i;
    const CRYPTO = /createHmac|timingSafeEqual|subtle\s*\.\s*(verify|sign|importKey)|jsonwebtoken|\bjwt\.verify|createVerify|x-test-|synthetic/i;
    rows.provider = Object.entries(code).filter(([, t]) => PROVIDER.test(t)).map(([p]) => p);
    rows.crypto = Object.entries(code).filter(([, t]) => CRYPTO.test(t)).map(([p]) => p);
    const handlerWebhook = code['supabase/functions/billing-webhook/handler.ts'];
    rows.defaultAdapter = (handlerWebhook.match(/adapter:\s*[^,}\n]+/g) ?? []).map(x => x.trim()).filter(x => !/BillingWebhookAdapter/.test(x));
    rows.verifyDefinitions = Object.entries(code).filter(([p, t]) => !/billing-ingest/.test(p) && /(^|[\s,{(])(verify|map)\s*[:=]\s*(async|\(|function|[a-zA-Z_]+\s*=>)/.test(t)).map(([p]) => p);
    const envNames = new Set(); for (const t of Object.values(code)) for (const m of t.matchAll(/["']((?:BILLING|SUPABASE|PG|DENO)_[A-Z0-9_]+)["']/g)) if (!['BILLING_COMMIT_PHASE_FAILURE', 'BILLING_COMMIT_OUTCOME_UNKNOWN', 'BILLING_TRANSPORT_SHAPE'].includes(m[1])) envNames.add(m[1]);
    const allowedEnv = new Set(['BILLING_INGEST_ENABLED', 'BILLING_NAMESPACE', 'BILLING_MAX_BODY_BYTES', 'BILLING_INGRESS_DB_URL', 'BILLING_PRODUCER_DB_URL', 'BILLING_PROCESS_SECRET', 'BILLING_LINK_TTL_SECONDS', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']);
    rows.unexpectedEnvNames = [...envNames].filter(n => !allowedEnv.has(n));
    rows.processEnv = Object.entries(code).filter(([, t]) => /process\s*\.\s*env/.test(t)).map(([p]) => p);
    // Deno.env.get appears only as the generic reader `(name) => Deno.env.get(name)` inside a config.ts; the names it is ever asked for are fixed by the loaders (and observed by I01).
    rows.dynamicEnvRead = Object.entries(code).filter(([p, t]) => { const uses = [...t.matchAll(/Deno\s*\.\s*env\s*\.\s*get\(([^)]*)\)/g)]; return uses.length > 0 && (!/\/config\.ts$/.test(p) || uses.length !== 1 || uses[0][1].trim() !== 'name'); }).map(([p]) => p);
    rows.processHeaderBypass = Object.entries(code).filter(([p, t]) => /billing-(process|webhook|link)\/(handler|index)/.test(p) && /(skip|bypass|debug|insecure|allowAll|trustAll)/i.test(t)).map(([p]) => p);
    rows.indexFiles = ENT_F2_SOURCE_PATHS.filter(p => /\/index\.ts$/.test(p) && p.includes('/billing-')).map(p => ({ p, serves: (code[p].match(/Deno\.serve\(/g) ?? []).length, imports: [...code[p].matchAll(/from\s*"([^"]+)"/g)].map(m => m[1]).join('|') }));
    const webhookDefault = /adapter:\s*null/.test(handlerWebhook);
    const ok = rows.provider.length === 0 && rows.crypto.length === 0 && webhookDefault && same(rows.defaultAdapter, ['adapter: null']) && rows.verifyDefinitions.length === 0 && rows.unexpectedEnvNames.length === 0 && rows.processEnv.length === 0 && rows.dynamicEnvRead.length === 0 && rows.processHeaderBypass.length === 0
      && rows.indexFiles.length === 3 && rows.indexFiles.every(i => i.serves === 1 && i.imports === './handler.ts');
    return R(ok, rows);
  },

  async S02_ONLY_THE_FIVE_BILLING_FUNCTIONS_ARE_REFERENCED() {
    const code = sourcesStripped(); const rows = {};
    const referenced = new Set(); for (const t of Object.values(code)) for (const m of t.matchAll(/\bretention_[a-z_]+\.[a-z_]+/g)) referenced.add(m[0]);
    rows.referenced = [...referenced].sort();
    rows.forbidden = Object.entries(code).flatMap(([p, t]) => [...t.matchAll(/retention_(entitlement|acquisition|capture|internal)|resolve_detail_acquisition|entitlement_state_at|admit_entitlement_event|advance_entitlement_coverage|producers|detail_capture_anchors|subscription_entitlements/g)].map(m => p + ':' + m[0]));
    rows.tableAccess = Object.entries(code).filter(([, t]) => /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from|from\s+retention_|truncate)\b/i.test(t.replace(/\bselect retention_billing\.[a-z_]+\(/g, ''))).map(([p]) => p);
    rows.imports = Object.entries(code).flatMap(([p, t]) => [...t.matchAll(/from\s*"([^"]+)"/g)].map(m => [p, m[1]])).filter(([, s]) => /entitlement|acquisition|capture|retention-|social|geo|taste|meal/.test(s)).map(([p, s]) => p + '->' + s);
    const want = ['retention_billing.create_link_intent', 'retention_billing.ingest_delivery', 'retention_billing.next_candidate', 'retention_billing.process_item', 'retention_billing.record_attempt'];
    return R(same(rows.referenced, want) && rows.forbidden.length === 0 && rows.tableAccess.length === 0 && rows.imports.length === 0, rows);
  },

  async S03_THE_DENO_WRAPPER_IS_A_THIN_BINDING_NOT_EXECUTED_HERE() {
    const code = strip('supabase/functions/_shared/billing-transport/denoPostgresBillingTransport.ts');
    const rows = {
      imports: [...code.matchAll(/from\s*"([^"]+)"/g)].map(m => m[1]).sort(),
      optionsPinned: /max:\s*1/.test(code) && /prepare:\s*false/.test(code) && /ssl:\s*"require"/.test(code),
      commitPhaseOnlyAfterTheBody: /bodyFinished\s*=\s*true/.test(code) && /if\s*\(bodyFinished\)\s*throw new BillingCommitPhaseError\(e\)/.test(code),
      connectsLazily: !/await\s+sql\s*`|\.connect\(/.test(code),
      noLogging: !/console\./.test(code),
      denoExecuted: false
    };
    const ok = same(rows.imports, ['./executor.ts', './sql.ts', 'npm:postgres@3.4.7']) && rows.optionsPinned && rows.commitPhaseOnlyAfterTheBody && rows.connectsLazily && rows.noLogging;
    return R(ok, { ...rows, note: 'static shape only: NOT executed under Deno (no Deno runtime); behaviour UNVERIFIED' });
  },

  async F01_FROZEN_SCOPE_AND_INVENTORY() {
    const changed = new Set(gitRun(['diff', '--name-only', BASE_TREE]).split('\n').filter(Boolean));
    for (const p of gitRun(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) changed.add(p);
    const extra = [...changed].filter(p => !ALLOWED_CHANGES.has(p) && !['.env.example', 'docs/handoff/04_DEPLOYMENT_ENVIRONMENTS/REQUIRED_ENV_NAMES.md'].includes(p));
    const touchedForbidden = [...changed].filter(p => /^supabase\/migrations\//.test(p) || p === 'supabase/config.toml' || /^apps\//.test(p) || /^packages\//.test(p) || (/^supabase\/functions\//.test(p) && !/^supabase\/functions\/(billing-(webhook|link|process)|_shared\/billing-transport)\//.test(p)));
    const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(f => f.endsWith('.sql')).length;
    const configBlob = gitRun(['hash-object', '--', 'supabase/config.toml']).trim();
    const protectedChanged = ENT_F1_PROTECTED.filter(p => gitRun(['hash-object', '--', p]).trim() !== gitRun(['rev-parse', `${BASE_TREE}:${p}`]).trim());
    const presentNew = ENT_F2_SOURCE_PATHS.filter(p => fs.existsSync(path.join(ROOT, p)));
    const sourcesAreNew = ENT_F2_SOURCE_PATHS.filter(p => { try { gitRun(['rev-parse', `${BASE_TREE}:${p}`]); return true; } catch { return false; } });
    const frozen = frozenProof(), inv = inventoryProof();
    const ok = extra.length === 0 && touchedForbidden.length === 0 && migrations === 151 && configBlob === CONFIG_TOML_BLOB && protectedChanged.length === 0 && presentNew.length === ENT_F2_SOURCE_PATHS.length && sourcesAreNew.length === 0
      && frozen.violations.length === 0 && frozen.recoverySuccessor.state === 'ent0' && frozen.recoverySuccessor.billing === 'record' && frozen.recoverySuccessor.edge === 'record' && inv.migrationCount === 151 && inv.changedBaselineMigrations.length === 0;
    return R(ok, { changed: [...changed].sort(), extra, touchedForbidden, migrations, configBlob, protectedChanged, presentNew: presentNew.length, sourcesAreNew, frozen: { violations: frozen.violations, successor: frozen.recoverySuccessor }, inv: { migrationCount: inv.migrationCount, newPaths: inv.newPaths.length, last: inv.last } });
  },

  // F03 drives the REAL judgement chain of THIS package (judgeGate -> runGate -> runSmoke, and -> gateRunner -> runMutations), not helpers imported from ENT-F1. The chains run in child processes with a test-side fault injected into a gate AFTER the unmutated control passed,
  // so a "baseline passed earlier" can never be what makes a later setup fault or crash look like a detection. Controls in both directions keep the correction from degenerating into "reject everything" or "detect nothing".
  async F03_HARNESS_SETUP_AND_CRASH_ARE_NEVER_A_DETECTOR() {
    const out = {};
    // (a) the classification function itself
    const setupMsgs = ['timeout expired', 'connect ECONNREFUSED 127.0.0.1:5432', 'Connection terminated unexpectedly', 'terminating connection due to administrator command', 'SETUP_UNSTUBBED_NPM_IMPORT npm:x', 'SETUP_GIT diff', 'GATE_WATCHDOG_TIMEOUT x', 'spawnSync initdb.exe ETIMEDOUT', 'read ECONNRESET'];
    const crashBodies = [() => { throw Error("Cannot read properties of undefined (reading 'x')"); }, () => { const o = null; return o.x; }, () => { throw Error('BILLING_COMMIT_OUTCOME_UNKNOWN'); }, () => { throw new TypeError('x is not a function'); }, () => undefined, () => 'not an object', () => ({}), () => ({ pass: false }), () => ({ pass: false, observed: null }), () => ({ pass: false, observed: {} }), () => ({ pass: 'yes' })];
    const setup = []; for (const m of setupMsgs) { try { const v = await judgeGate(async () => { throw Error(m); }, 'x'); setup.push([m, 'absorbed:' + v.kind]); } catch (e) { setup.push([m, /^SETUP_GATE /.test(e.message) ? 'BLOCKED' : 'wrong:' + e.message]); } }
    const crash = []; for (const b of crashBodies) { try { const v = await judgeGate(async () => b(), 'x'); crash.push(v.kind); } catch (e) { crash.push('thrown:' + e.message.slice(0, 40)); } }
    const goodPass = await judgeGate(async () => R(true, { v: 1 }), 'p'), goodFail = await judgeGate(async () => R(false, { expected: 1, actual: 2 }), 'f');
    const stageFail = await judgeGate(async () => { throw new StageRefusal({ stage: 's', sql: 'k', rejection: { code: '22023' }, parameterDiffs: [] }); }, 's');
    const dbRej = [isDatabaseRejection(Object.assign(new (class DatabaseError extends Error {})('x'), { code: '22023' })), isDatabaseRejection(Object.assign(Error('x'), { code: '22023' })), isDatabaseRejection(Object.assign(new (class DatabaseError extends Error {})('x'), { code: 'E123' }))];
    out.classification = { setup, crash, goodPass: goodPass.kind, goodFail: goodFail.kind, stageFail: stageFail.kind, dbRejectionRecognition: dbRej };
    const aOk = setup.every(([, v]) => v === 'BLOCKED') && crash.every(k => k === 'crash') && goodPass.kind === 'pass' && goodFail.kind === 'explicit_fail' && stageFail.kind === 'explicit_fail' && same(dbRej, [true, false, false]);
    // (b)+(c) the real mutation chain and the real smoke runner, with injected faults
    const here = fileURLToPath(import.meta.url), mutFile = path.join(path.dirname(here), 'consumer-retention-billing-edge-mutations.mjs');
    const script = `
      import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
      const S = await import(pathToFileURL(process.env.F03_SMOKE).href), M = await import(pathToFileURL(process.env.F03_MUT).href);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-f03-')); const rows = [];
      const inject = {
        setup1: () => { throw Error('Connection terminated unexpectedly'); }, setup2: () => { throw Error('terminating connection due to administrator command'); }, setup3: () => { throw Error('timeout expired'); },
        crash1: () => { const o = null; return o.x; }, crash2: () => { throw Error("Cannot read properties of undefined (reading 'x')"); }, crash3: () => { throw Error('something unexpected'); },
        explicit: () => ({ pass: false, observed: { auth: 1, expected: 0, injected: true } }), alwaysPass: () => ({ pass: true, observed: {} }), malformed: () => ({ pass: false })
      };
      const withInjection = async (gateId, how, fn, passFirst = true) => { const saved = S.GATES[gateId]; let calls = 0; S.GATES[gateId] = how === 'none' ? saved : async () => { if (passFirst && ++calls === 1) return saved(); return inject[how](); }; try { return await fn(); } finally { S.GATES[gateId] = saved; } };
      const mutChain = async (prefix, gatePrefix, how) => { const gateId = S.ALL_GATE_IDS.find(x => x.startsWith(gatePrefix + '_')); const dir = path.join(tmp, 'mut-' + prefix + '-' + how);
        const code = await withInjection(gateId, how, () => M.runMutations({ bin: 'D:/no-such-pg', out: dir, prefixes: [prefix] }));
        const r = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')); return { chain: 'mutations', mutant: prefix, how, code, status: r.status, exitCode: r.exitCode, detected: r.summary?.gateDetected ?? null, greenOk: r.summary?.greenOk ?? null, crashed: r.summary?.crashedMutants ?? null, mismatches: (r.summary?.mismatches ?? []).length }; };
      const smokeChain = async (gatePrefix, how) => { const gateId = S.ALL_GATE_IDS.find(x => x.startsWith(gatePrefix + '_')); const dir = path.join(tmp, 'smoke-' + gatePrefix + '-' + how);
        const code = await withInjection(gateId, how, () => S.runSmoke({ bin: 'D:/no-such-pg', out: dir, selected: [gateId] }), false);
        const r = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')); return { chain: 'smoke', gate: gatePrefix, how, code, status: r.status, exitCode: r.exitCode, failed: r.failed.length, checks: r.checks.length }; };
      for (const how of ['none', 'setup1', 'setup2', 'setup3', 'crash1', 'crash2', 'crash3', 'explicit', 'alwaysPass', 'malformed']) rows.push(await mutChain('Y36_', 'L01', how));
      for (const how of ['none', 'setup1', 'crash1', 'explicit', 'malformed']) rows.push(await mutChain('Y30_', 'W01', how)); // a GREEN mutant: only 'none' may be accepted
      for (const how of ['none', 'setup1', 'setup2', 'crash1', 'crash3', 'explicit', 'malformed']) rows.push(await smokeChain('S02', how));
      fs.rmSync(tmp, { recursive: true, force: true });
      console.log('F03_ROWS ' + JSON.stringify(rows));`;
    const ch = child.spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, F03_SMOKE: here, F03_MUT: mutFile }, encoding: 'utf8', timeout: 900000, maxBuffer: 32 << 20, cwd: ROOT });
    const line = String(ch.stdout ?? '').split(/\r?\n/).find(l => l.startsWith('F03_ROWS ')); let rows = []; try { rows = JSON.parse(line.slice('F03_ROWS '.length)); } catch { /* reported */ }
    const get = (chain, key, how) => rows.find(r => r.chain === chain && (r.mutant ?? r.gate) === key && r.how === how);
    const m = (k, h) => get('mutations', k, h), s = (k, h) => get('smoke', k, h);
    const mutOk = r => r && r.status === 'PASS' && r.exitCode === 0 && r.detected === 1 && !r.mismatches;
    const mutBlocked = r => r && r.status === 'BLOCKED' && r.exitCode === 2 && !r.detected;
    const mutNotDetected = r => r && r.status === 'FAIL' && r.exitCode === 1 && !r.detected && r.mismatches === 1;
    const checks = {
      mutNormalDetected: mutOk(m('Y36_', 'none')), mutExplicitInjectionDetected: mutOk(m('Y36_', 'explicit')),
      mutSetupBlocked: ['setup1', 'setup2', 'setup3'].map(h => mutBlocked(m('Y36_', h))), mutCrashNotDetected: ['crash1', 'crash2', 'crash3', 'malformed'].map(h => mutNotDetected(m('Y36_', h)) && m('Y36_', h).crashed === 1),
      mutAlwaysPassUndetected: mutNotDetected(m('Y36_', 'alwaysPass')) && m('Y36_', 'alwaysPass').crashed === 0,
      greenNormalAccepted: m('Y30_', 'none')?.status === 'PASS' && m('Y30_', 'none')?.greenOk === 1, greenSetupBlocked: mutBlocked(m('Y30_', 'setup1')), greenCrashRejected: m('Y30_', 'crash1')?.status === 'FAIL' && m('Y30_', 'crash1')?.mismatches === 1, greenExplicitRejected: m('Y30_', 'explicit')?.status === 'FAIL' && m('Y30_', 'explicit')?.mismatches === 1, greenMalformedRejected: m('Y30_', 'malformed')?.status === 'FAIL',
      smokeNormalPass: s('S02', 'none')?.status === 'PASS' && s('S02', 'none')?.exitCode === 0, smokeSetupBlocked: ['setup1', 'setup2'].map(h => s('S02', h)?.status === 'BLOCKED' && s('S02', h)?.exitCode === 2), smokeCrashBlocked: ['crash1', 'crash3', 'malformed'].map(h => s('S02', h)?.status === 'BLOCKED' && s('S02', h)?.exitCode === 2 && s('S02', h)?.checks === 0), smokeExplicitFails: s('S02', 'explicit')?.status === 'FAIL' && s('S02', 'explicit')?.exitCode === 1 && s('S02', 'explicit')?.failed === 1
    };
    out.chains = { childExit: ch.status, rows: rows.length, checks };
    const flat = Object.values(checks).flat();
    return R(aOk && ch.status === 0 && rows.length === 22 && flat.every(v => v === true), { ...out, rowsDetail: rows });
  }
});

GATES.F02_GATE_SELECTION_CONTRACT = async () => {
  const rows = selectionContractRows(); const o = {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-f02-')); const bad = {};
  const A = 'W05_WEBHOOK_VERIFIER_RECEIVES_THE_RAW_BYTES', Z = 'S02_ONLY_THE_FIVE_BILLING_FUNCTIONS_ARE_REFERENCED';
  const spawn = (env, extra) => { const r = child.spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...extra], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600000, maxBuffer: 16 << 20 }); return { code: r.status, out: String(r.stdout ?? '') }; };
  for (const [name, val] of [['unknown', 'NO_SUCH_GATE'], ['mixed', A + ',NO_SUCH_GATE'], ['empty', ''], ['separators', ','], ['prefix', 'W05'], ['trailing-comma', A + ',']]) {
    const r = spawn({ TK_GATES: val }, ['--pg-bin', path.join(tmp, 'no-such-pg', 'bin'), '--out', path.join(tmp, 'neg-' + name)]);
    bad[name] = { code: r.code, checkLines: (r.out.match(/^CHECK /gm) ?? []).length, outDirCreated: fs.existsSync(path.join(tmp, 'neg-' + name)) };
  }
  o.refusals = bad;
  const refused = Object.values(bad).every(b => b.code !== 0 && b.code !== null && b.checkLines === 0 && !b.outDirCreated);
  const pos = spawn({ TK_GATES: Z + ',' + A }, ['--pg-bin', options().bin, '--out', path.join(tmp, 'pos')]);
  const lines = pos.out.split(/\r?\n/).filter(l => /^CHECK /.test(l)).map(l => l.split(' ')[1]);
  let res = null; try { res = JSON.parse(fs.readFileSync(path.join(tmp, 'pos', 'result.json'), 'utf8')); } catch { /* reported below */ }
  o.positive = { code: pos.code, lines, status: res?.status, selected: res?.selected, exitCode: res?.exitCode };
  const exact = pos.code === 0 && same(lines, [A, Z]) && res?.status === 'PASS' && res?.exitCode === 0 && same(res.selected, [A, Z]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup only */ }
  o.rows = rows.map(r => ({ name: r.name, ok: r.ok }));
  return R(rows.every(r => r.ok) && refused && exact, o);
};

export const PURE_IDS = new Set(Object.keys(GATES).filter(k => /^(W|L|P|I|S|F)\d\d_/.test(k) || k.startsWith('T00_')));
export const PG_IDS = Object.keys(GATES).filter(k => /^T0[1-9]_/.test(k)).sort();
const order = id => (/^W/.test(id) ? 0 : /^L/.test(id) ? 1 : /^P/.test(id) ? 2 : /^I/.test(id) ? 3 : /^T00/.test(id) ? 4 : /^S/.test(id) ? 5 : /^T/.test(id) ? 6 : 7);
export const ALL_GATE_IDS = Object.keys(GATES).sort((a, b) => order(a) - order(b) || (a < b ? -1 : 1));
export const BEHAVIOUR_IDS = ALL_GATE_IDS.filter(id => !/^(F|S)\d\d_/.test(id));

export function sourceIdentity() {
  const own = ['scripts/consumer-retention-billing-edge-smoke.mjs', 'scripts/consumer-retention-billing-edge-mutations.mjs'];
  const hash = (root, p) => (fs.existsSync(path.join(root, p)) ? sha(fs.readFileSync(path.join(root, p))) : null);
  const files = {}; for (const p of ENT_F2_SOURCE_PATHS) files[p] = hash(baseDir(), p); for (const p of own) files[p] = hash(ROOT, p);
  let head = null, tree = null; try { head = gitRun(['rev-parse', 'HEAD']).trim(); tree = gitRun(['rev-parse', 'HEAD^{tree}']).trim(); } catch { /* reported as null */ }
  return { head, tree, sourceRoot: srcRoot.dir === null ? 'repository' : 'mutated-copy', files };
}

// ==== the gate judgement chain (F2-E01 correction) =====================================================================================================================
// ONE classification, used by the smoke runner AND the mutation harness (the harness imports runGate):  body -> judgeGate -> { kind, pass, observed }
//   pass          : the gate returned pass:true
//   explicit_fail : the gate RETURNED pass:false together with a non-empty observation object (values it observed), or a typed StageRefusal (a NAMED product stage that the database refused with a SQLSTATE, or whose statement / parameter vector differs from the expected one)
//   crash         : ANY other exception, or a malformed gate result (no boolean, or pass:false without an observation). A crash is NEVER a detector. The smoke runner reports it as BLOCKED; the mutation harness records the mutant as not detected.
//   (throws)      : infrastructure / setup / connection / initialisation failure => Error('SETUP_GATE ...') => the whole run is BLOCKED, never a detection.
// Nothing here depends on the earlier PASS of the same gate on an unmutated copy: a baseline PASS does not turn later exceptions into product observations.
export const SETUP_ERROR = /timeout expired|connection timeout|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|terminating connection|the database system is|too many clients|cannot connect|initdb|pg_ctl|postmaster|spawnSync|GATE_WATCHDOG_TIMEOUT|SETUP_/i;
export class StageRefusal extends Error {
  constructor(detail) { super('STAGE_REFUSAL ' + detail.stage); this.name = 'StageRefusal'; this.detail = detail; }
}
export const isDatabaseRejection = e => e?.constructor?.name === 'DatabaseError' && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code);
// Runs one product call at a NAMED stage and compares what the product actually sent (statement text and parameter vector, recorded by the driver BEFORE the statement runs) with the expected vector.
export async function stageCall(log, sqlMap, label, key, expected, fn) {
  const before = log.length; let value; let rejection = null;
  try { value = await fn(); }
  catch (e) {
    if (!isDatabaseRejection(e)) throw e; // connection / unexpected errors are not stage observations: they stay setup (BLOCKED) or crash (not a detector)
    rejection = { name: e.constructor.name, code: e.code, message: String(e.message).slice(0, 120) };
  }
  const sent = log.slice(before).filter(l => l.text === sqlMap[key]);
  const diffs = [];
  if (sent.length !== 1) diffs.push({ kind: 'statement-count', expected: 1, actual: sent.length });
  else {
    const p = sent[0].params ?? [];
    if (p.length !== expected.length) diffs.push({ kind: 'param-count', expected: expected.length, actual: p.length });
    expected.forEach((x, i) => { if (!Object.is(p[i], x)) diffs.push({ index: i, expected: x, actual: p[i] }); });
  }
  if (rejection || diffs.length) throw new StageRefusal({ stage: label, sql: key, rejection, parameterDiffs: diffs });
  return value;
}
export async function judgeGate(body, id = '?') {
  let r;
  try { r = await body(); }
  catch (e) {
    const message = String(e?.message ?? e);
    if (e instanceof StageRefusal) return { kind: 'explicit_fail', pass: false, observed: { stageRefusal: e.detail } };
    if (SETUP_ERROR.test(message)) throw Error('SETUP_GATE ' + id + ' ' + message.slice(0, 200));
    return { kind: 'crash', pass: false, observed: { gateCrashed: { name: e?.constructor?.name ?? null, code: e?.code ?? null, message: message.slice(0, 200) } } };
  }
  if (r === null || typeof r !== 'object' || typeof r.pass !== 'boolean') return { kind: 'crash', pass: false, observed: { gateCrashed: { name: 'MalformedGateResult', message: 'the gate returned no boolean pass' } } };
  if (r.pass) return { kind: 'pass', pass: true, observed: r.observed };
  if (r.observed === null || typeof r.observed !== 'object' || Object.keys(r.observed).length === 0) return { kind: 'crash', pass: false, observed: { gateCrashed: { name: 'MalformedGateResult', message: 'pass:false without an observation' } } };
  return { kind: 'explicit_fail', pass: false, observed: r.observed };
}
export async function runGate(cl, id) {
  const body = PURE_IDS.has(id) ? () => GATES[id]() : () => billingFresh(cl, id, ctx => GATES[id](ctx), { apply: true });
  return judgeGate(body, id);
}
export async function runSmoke({ bin, out, selected = ALL_GATE_IDS }) {
  const rec = recorder(out);
  const results = []; let blocked = null; const startedUtc = new Date().toISOString();
  let cl = null;
  try {
    for (const id of ALL_GATE_IDS) {
      if (!selected.includes(id)) continue;
      let r; const t0 = Date.now();
      try {
        if (!PURE_IDS.has(id) && cl === null) cl = await entCluster(bin, rec);
        r = await runGate(cl, id);
      } catch (e) { blocked = { id, message: String(e.message), stack: e.stack }; rec.write('check-' + id + '.json', { id, status: 'BLOCKED', error: blocked.message }); console.log('CHECK ' + id + ' BLOCKED ' + blocked.message.slice(0, 600)); break; }
      if (r.kind === 'crash') { blocked = { id, message: 'GATE_CRASH ' + JSON.stringify(r.observed.gateCrashed) }; rec.write('check-' + id + '.json', { id, status: 'BLOCKED', error: blocked.message, ms: Date.now() - t0 }); console.log('CHECK ' + id + ' BLOCKED ' + blocked.message.slice(0, 600)); break; }
      rec.write('check-' + id + '.json', { id, pass: r.pass, kind: r.kind, ms: Date.now() - t0, observed: r.observed });
      results.push({ id, pass: r.pass });
      console.log('CHECK ' + id + ' ' + (r.pass ? 'PASS' : 'FAIL'));
    }
  } finally { if (cl) await cl.stop(); }
  const o = outcomeOf({ selected, results, blocked });
  rec.write('result.json', { status: o.status, exitCode: o.exitCode, selected, checks: results, failed: o.failed, notExecuted: o.missing, reason: o.reason ?? null, blocked, startedUtc, endedUtc: new Date().toISOString(), identity: sourceIdentity() });
  if (o.reason) console.error('BLOCKED ' + o.reason + ' not executed: ' + o.missing.join(','));
  return o.exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try { const sel = selectGates(process.env.TK_GATES, ALL_GATE_IDS); code = await runSmoke({ ...options(), selected: sel.ids }); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
