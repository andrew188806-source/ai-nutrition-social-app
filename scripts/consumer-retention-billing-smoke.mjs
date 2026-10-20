#!/usr/bin/env node
// TastKind R0-B-ENT-F1 local acceptance gates (Owner G1-G4, 2026-10-20): inactive, provider-neutral PAID/TRIAL FACT INGESTION CORE. Disposable PostgreSQL 17 only; never a remote target. Gates are exported so the
// mutation harness runs the very same detectors against changed migration SQL. Every producer, ingress, resolver and reader role, every namespace configuration, every registry row, every fact and every receipt exists
// ONLY inside a disposable test database; the migration registers nobody, configures nothing, grants EXECUTE to nobody and has no endpoint or production call path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ROOT, MIGRATION, CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION, SEAL_MIGRATION, BILLING_MIGRATION as PINNED_BILLING_MIGRATION, BILLING_MIGRATION_SHA256, withSocialTail, recorder, sha, uuid, installProbe, ddlAttempts, PROBE_PAUSE_LOCK } from './consumer-retention-persistence-smoke.mjs';
import { act, frozenProof, inventoryProof, options } from './consumer-retention-capture-smoke.mjs';
import { entCluster, selectGates, outcomeOf, selectionContractRows } from './consumer-retention-entitlement-smoke.mjs';
import { acqApply, acqSource } from './consumer-retention-acquisition-smoke.mjs';
import { sealApply, sealSource } from './consumer-retention-seal-smoke.mjs';

export { options };
export const BILLING_MIGRATION = PINNED_BILLING_MIGRATION; // 20261021010000_consumer_retention_billing_fact_ingest.sql (name and sha256 are pinned by the persistence smoke)
export const BILLING_SCHEMA = 'retention_billing';
export const BILLING_OWNER = 'consumer_retention_billing_owner';
export const BILLING_BUILDER = 'consumer_retention_billing_builder';
export const BILLING_POST_DIGEST = 'fde427d0118ca68125b58572de8e9f4263e27ba57d81fae2c7b3f614b0229ad8';
export const billingSource = () => fs.readFileSync(path.join(ROOT, 'supabase/migrations', BILLING_MIGRATION), 'utf8');

const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 1);
const at = (days, extraMs = 0) => new Date(BASE + days * DAY + extraMs).toISOString();
const atMs = (days, extraMs = 0) => BASE + days * DAY + extraMs;
const iso = ms => new Date(ms).toISOString();
const isoMs = d => (d instanceof Date ? d : new Date(d)).toISOString();
const ENT = 'retention_entitlement';
const ACQ = 'retention_acquisition';
const B = BILLING_SCHEMA;
const OWNER_ROLES = [BILLING_OWNER, BILLING_BUILDER, 'consumer_retention_seal_owner', 'consumer_retention_seal_builder', 'consumer_retention_acquisition_owner', 'consumer_retention_acquisition_builder'];
const sha256hex = s => createHash('sha256').update(s, 'utf8').digest('hex');

// ---- pure core (TypeScript executed in Node without rewriting the production source) -----------------------------------------------------------------
const requireRoot = createRequire(path.join(ROOT, 'package.json'));
const tsc = requireRoot('typescript');
const moduleCache = new Map();
export function loadTs(file) {
  file = path.resolve(file);
  if (moduleCache.has(file)) return moduleCache.get(file).exports;
  const module = { exports: {} }; moduleCache.set(file, module);
  const code = tsc.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2022 }, fileName: file }).outputText;
  const localRequire = name => {
    if (!name.startsWith('.')) return requireRoot(name);
    const base = path.resolve(path.dirname(file), name);
    const resolved = [base, base + '.ts', path.join(base, 'index.ts')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!resolved) throw Error('unresolved ' + name + ' from ' + file);
    return loadTs(resolved);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
// The mutation harness points the loaders at a temporary COPY of the production TypeScript that carries one defect; the default is the repository itself.
const srcRoot = { dir: null };
export const setSourceRoot = dir => { srcRoot.dir = dir; };
export const core = () => loadTs(path.join(srcRoot.dir ?? ROOT, 'supabase/functions/_shared/billing-core/index.ts'));
export const ingest = () => loadTs(path.join(srcRoot.dir ?? ROOT, 'supabase/functions/_shared/billing-ingest/index.ts'));

// ---- apply / fresh database ---------------------------------------------------------------------------------------------------------------------------
// Template = 142 baseline + foundation + capture (entCluster); each database gets the accepted ENT0 (cl.fresh), ENT1-A and ENT-R migrations, then (optionally) the ENT-F1 migration.
export async function billingApply(ctx, sql) {
  const notices = [];
  const onNotice = m => notices.push(m.message);
  ctx.su.on('notice', onNotice);
  let error = null;
  try { await ctx.g.query(ctx.su, sql); }
  catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await ctx.su.query('ROLLBACK').catch(() => {}); }
  finally { ctx.su.removeListener('notice', onNotice); }
  return { error, notices, boundary: notices.includes('BILLING_DDL_BOUNDARY') };
}
export function billingFresh(cl, label, fn, { apply = true, billing = billingSource(), settings = [] } = {}) {
  return cl.fresh(label, async ctx => {
    for (const r of OWNER_ROLES) ctx.extraRoles.add(r);
    const a = await acqApply(ctx, acqSource());
    if (a.error) throw Error('SETUP_ACQ_APPLY ' + JSON.stringify(a.error));
    const s = await sealApply(ctx, sealSource());
    if (s.error) throw Error('SETUP_SEAL_APPLY ' + JSON.stringify(s.error));
    ctx.billingSource = billing;
    ctx.items0 = await catalogItems(ctx);
    if (apply) {
      ctx.billing = await billingApply(ctx, billing);
      if (ctx.billing.error) throw Error('SETUP_BILLING_APPLY ' + JSON.stringify(ctx.billing.error));
      ctx.items1 = await catalogItems(ctx);
    }
    return fn(ctx);
  }, { settings });
}

// ---- catalog items outside the new schema/roles (for the "only the approved seams changed" proof) -----------------------------------------------------------
const aclText = (aclExpr, kind, ownerExpr) => `coalesce((select string_agg(coalesce(nullif(pg_get_userbyid(a.grantee)::text,''),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable||':'||pg_get_userbyid(a.grantor), ',' order by pg_get_userbyid(a.grantee)::text, a.privilege_type) from aclexplode(coalesce(${aclExpr}, acldefault('${kind}', ${ownerExpr}))) a),'')`;
export async function catalogItems(ctx) {
  const own = `(n.nspname <> '${B}')`;
  const sys = "n.nspname !~ '^pg_' and n.nspname <> 'information_schema'";
  const Q = {
    ns: `select 'ns:'||n.nspname k, pg_get_userbyid(n.nspowner)::text core, ${aclText('n.nspacl', 'n', 'n.nspowner')} acl from pg_namespace n where ${sys} and ${own}`,
    cls: `select 'class:'||n.nspname||'.'||c.relname k, format('%s|%s|%s|%s|%s', c.relkind, pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity, c.reloptions) core, ${aclText('c.relacl', 'r', 'c.relowner')} acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    attr: `select 'attr:'||n.nspname||'.'||c.relname||'.'||a.attname k, format('%s|%s', format_type(a.atttypid,a.atttypmod), a.attnotnull) core, coalesce(a.attacl::text,'') acl from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own} and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v','m','p')`,
    proc: `select 'proc:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, format('%s|%s|%s|%s', pg_get_userbyid(p.proowner), p.proconfig, p.prosecdef, md5(pg_get_functiondef(p.oid))) core, ${aclText('p.proacl', 'f', 'p.proowner')} acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${sys} and ${own}`,
    pol: `select 'policy:'||n.nspname||'.'||c.relname||'.'||o.polname k, format('%s|%s|%s|%s|%s', o.polcmd, o.polpermissive, (select string_agg(coalesce(r.rolname,'PUBLIC'),',' order by r.rolname) from pg_roles r where r.oid=any(o.polroles)), pg_get_expr(o.polqual,o.polrelid), pg_get_expr(o.polwithcheck,o.polrelid)) core, '' acl from pg_policy o join pg_class c on c.oid=o.polrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    trg: `select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname k, pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text core, '' acl from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own} and not (t.tgisinternal and exists (select 1 from pg_constraint k where k.oid=t.tgconstraint and k.connamespace=to_regnamespace('${B}')))`,
    con: `select 'con:'||n.nspname||'.'||c.relname||'.'||k.conname k, pg_get_constraintdef(k.oid) core, '' acl from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    dacl: `select 'defacl:'||pg_get_userbyid(d.defaclrole)||':'||coalesce(d.defaclnamespace::regnamespace::text,'')||':'||d.defaclobjtype::text k, coalesce(d.defaclacl::text,'') core, '' acl from pg_default_acl d where pg_get_userbyid(d.defaclrole) not in ('${BILLING_OWNER}','${BILLING_BUILDER}')`,
    role: `select 'role:'||r.rolname k, format('%s|%s|%s|%s|%s|%s|%s|%s', r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconfig) core, '' acl from pg_roles r where r.rolname not in ('${BILLING_OWNER}','${BILLING_BUILDER}')`,
    mem: `select 'member:'||pg_get_userbyid(m.roleid)||'>'||pg_get_userbyid(m.member) k, format('%s|%s|%s|%s', pg_get_userbyid(m.grantor), m.admin_option, m.inherit_option, m.set_option) core, '' acl from pg_auth_members m where not exists (select 1 from pg_roles x where x.oid in (m.roleid,m.member,m.grantor) and x.rolname in ('${BILLING_OWNER}','${BILLING_BUILDER}'))`,
    evt: `select 'evt:'||e.evtname k, format('%s|%s', e.evtevent, e.evtfoid::regproc) core, '' acl from pg_event_trigger e`
  };
  const items = new Map();
  for (const [name, text] of Object.entries(Q)) {
    const rows = (await ctx.g.query(ctx.su, text)).rows;
    for (const r of rows) { items.set(r.k + '#core', r.core); if (r.acl !== '' && r.acl !== null) items.set(r.k + '#acl', r.acl); else if (name === 'ns' || name === 'cls' || name === 'proc') items.set(r.k + '#acl', ''); }
  }
  return items;
}
export function itemsDiff(a, b) {
  const added = [], removed = [], changed = [];
  for (const [k, v] of b) { if (!a.has(k)) added.push(k); else if (a.get(k) !== v) changed.push(k); }
  for (const k of a.keys()) if (!b.has(k)) removed.push(k);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
// The ONLY change to anything outside the new schema: the two approved ENT0 seam attributes.
export const EXPECTED_DELTA = {
  added: [],
  removed: [],
  changed: [`ns:${ENT}#acl`, `proc:${ENT}.admit_entitlement_event(p_owner uuid, p_namespace text, p_upstream_event_id text, p_class text, p_valid_from timestamp with time zone, p_valid_until timestamp with time zone, p_source_sequence bigint)#acl`].sort()
};

// ---- fixtures ----------------------------------------------------------------------------------------------------------------------------------------------
const q = (ctx, text, v) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
const count = async (ctx, table, where = 'true') => (await q(ctx, `select count(*)::int n from ${table} where ${where}`))[0].n;
const call = async (c, text, v = []) => {
  try { const r = await c.query(text, v); return { ok: true, value: r.rows[0]?.s }; }
  catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message) }; }
};
async function regWrite(ctx, text, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); }
  catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
let userSeq = 100;
async function makeUser(ctx, n) { await ctx.g.query(ctx.su, 'insert into auth.users(id,email) values($1,$2)', [uuid(n), `bill${n}@synthetic.invalid`]); return uuid(n); }
// Test-only roles. Nothing below exists outside a disposable database.
async function makeRole(ctx, name, grants = []) {
  ctx.extraRoles.add(name);
  await ctx.g.query(ctx.su, `create role ${name} login`);
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
const ENT_FN = {
  admit: `${ENT}.admit_entitlement_event(uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint)`,
  advance: `${ENT}.advance_entitlement_coverage(uuid, text, timestamp with time zone)`,
  state: `${ENT}.entitlement_state_at(uuid, timestamp with time zone)`
};
const grantFns = (role, fns) => [`grant usage on schema ${B} to ${role}`, ...fns.map(f => `grant execute on function ${BILL_FN[f]} to ${role}`)];
// Ingress (receiver/link) role: ingest + link only. Producer role: the registered ENT0 database role for a namespace; it gets ONLY the three processing functions (no ENT0 privilege at all, no resolver).
async function makeIngress(ctx, name = 'bill_ingress') {
  await makeRole(ctx, name, grantFns(name, ['ingest', 'link']));
  return { role: name, c: await ctx.open(name) };
}
async function makeProducer(ctx, ns, { registeredAt = at(-400), retiredAt = null, extra = [] } = {}) {
  const role = 'bill_p_' + ns.replace(/[^a-z0-9]/g, '_');
  await makeRole(ctx, role, [...grantFns(role, ['next', 'process', 'attempt']), ...extra]);
  await regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,$4::timestamptz)`, [ns, role, registeredAt, retiredAt]);
  return { ns, role, c: await ctx.open(role) };
}
// Operator step (disposable DB only): namespace configuration as the superuser. registeredAt mirrors the registry value.
async function configure(ctx, ns, { environment = 'sandbox', registeredAt = at(-400), maxPeriodMs = 400 * DAY, enabled = true } = {}) {
  await ctx.g.query(ctx.su, `insert into ${B}.namespace_config(namespace, environment, registered_at, max_period_ms, enabled) values ($1,$2,$3::timestamptz,$4,$5)`, [ns, environment, registeredAt, maxPeriodMs, enabled]);
}
// A complete namespace: configured, producer registered, ingress role, the pure-core/DI pipeline wired to the test database.
async function setupNamespace(ctx, ns = 'store.sandbox', opts = {}) {
  await configure(ctx, ns, opts.config ?? {});
  const producer = await makeProducer(ctx, ns, opts.producer ?? {});
  const ingressRole = ctx.ingress ?? (ctx.ingress = await makeIngress(ctx));
  return { ns, producer, ingress: ingressRole };
}
const obs = (ns, subject, delivery, kind, s, e, over = {}) => ({
  namespace: ns, environment: 'sandbox', deliveryId: delivery, subjectRef: subject, payloadDigest: sha256hex(`${ns}|${delivery}|${subject}|${kind}|${s}|${e}`),
  kind, periodStartMs: s, periodEndMs: e, signedAtMs: BASE, bindingHash: null, reasonCode: null, ...over
});
// Transaction wrapper over a pg client: BEGIN/COMMIT, ROLLBACK on error, the BillingTx contract of the DI layer.
function pgTransport(client) {
  const txFor = c => ({
    async ingestDelivery(o) { return (await c.query(`select ${B}.ingest_delivery($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8::timestamptz,$9,$10,$11) s`, [o.namespace, o.deliveryId, o.subjectRef, o.payloadDigest, o.kind, o.periodStartMs === null ? null : iso(o.periodStartMs), o.periodEndMs === null ? null : iso(o.periodEndMs), iso(o.signedAtMs), o.environment, o.bindingHash, o.reasonCode])).rows[0].s; },
    async createLinkIntent(ns, owner, hash, expiresMs) { return (await c.query(`select ${B}.create_link_intent($1,$2::uuid,$3,$4::timestamptz) s`, [ns, owner, hash, iso(expiresMs)])).rows[0].s; },
    async nextCandidate(ns) { return (await c.query(`select ${B}.next_candidate($1) s`, [ns])).rows[0].s; },
    async processItem(id) { return (await c.query(`select ${B}.process_item($1::uuid) s`, [id])).rows[0].s; },
    async recordAttempt(id, reason) { return (await c.query(`select ${B}.record_attempt($1::uuid,$2) s`, [id, reason])).rows[0].s; }
  });
  return {
    async transaction(fn) {
      await client.query('begin');
      try { const r = await fn(txFor(client)); await client.query('commit'); return r; }
      catch (e) { await client.query('rollback').catch(() => {}); throw e; }
    }
  };
}
const ledgerRows = (ctx, owner) => q(ctx, `select e.event_id, e.namespace, e.upstream_event_id, e.class, e.valid_from, e.valid_until, e.source_sequence from ${ENT}.entitlement_events e where e.owner_user_id=$1 order by e.valid_from, e.upstream_event_id`, [owner]);
const segRows = (ctx, where = 'true', v = []) => q(ctx, `select namespace, subject_ref, class, seg_start, seg_end, owner_user_id, ledger_event_id, upstream_event_id, item_id from ${B}.fact_segments where ${where} order by namespace, subject_ref, class, seg_start`, v);
const inboxRows = (ctx, where = 'true', v = []) => q(ctx, `select item_id, namespace, delivery_id, subject_ref, kind, period_start, period_end, state, reason, attempts, last_error, owner_user_id, outcome from ${B}.inbox where ${where} order by received_at, item_id`, v);
const evidenceRows = (ctx, where = 'true', v = []) => q(ctx, `select item_id, namespace, kind, detail from ${B}.evidence_log where ${where} order by recorded_at, evidence_id`, v);
const stateAt = (ctx, owner, instant) => ctx.g.query(ctx.su, `select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [owner, instant]).then(r => r.rows[0].s);
const unionMs = rows => core().unionIntervals(rows.map(r => [Date.parse(r.seg_start ?? r.valid_from), Date.parse(r.seg_end ?? r.valid_until)]));
// Active link fixture (the server-side outcome of a verified purchase): written by the superuser in the disposable DB.
async function activeLink(ctx, ns, owner, subject) {
  const bh = sha256hex('binding:' + ns + ':' + subject);
  await ctx.g.query(ctx.su, `insert into ${B}.identity_links(namespace, owner_user_id, state, binding_hash, subject_ref, activated_at) values ($1,$2,'active',$3,$4,pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()))`, [ns, owner, bh, subject]);
}
// Feed observations through the REAL ingress transport, then drain with the REAL processing loop (ingest role / producer role, separate connections).
async function feed(ctx, ns, list) {
  const t = pgTransport(ctx.ingress.c);
  const out = [];
  for (const o of list) out.push(await t.transaction(tx => tx.ingestDelivery(o)));
  return out;
}
async function drain(ctx, producer, limit = 50) { return ingest().processNamespace(pgTransport(producer.c), producer.ns, limit); }
// ---- synthetic provider adapter (TEST ONLY: proves the verifier/mapper interface, not any real signature scheme) --------------------------------------------------
const TEST_KEY = 'synthetic-test-key-not-a-secret';
const signatureOf = body => createHmac('sha256', TEST_KEY).update(body).digest('hex');
function syntheticAdapter(ns) {
  const verify = async (raw, headers) => (headers.get('x-test-key-id') === 'k-' + ns && headers.get('x-test-signature') === signatureOf(Buffer.from(raw)) ? { ok: true, namespace: ns } : { ok: false, reason: 'bad_signature' });
  const map = async raw => { const j = JSON.parse(Buffer.from(raw).toString('utf8')); return Array.isArray(j.observations) ? j.observations : null; };
  return { verify, map };
}
function signedRequest(ns, observations, { sig, headers = {}, method = 'POST', body } = {}) {
  const text = body ?? JSON.stringify({ observations });
  return new Request('http://localhost/billing', { method, body: method === 'GET' ? undefined : text, headers: { 'x-test-key-id': 'k-' + ns, 'x-test-signature': sig ?? signatureOf(text), ...headers } });
}
function receiveDeps(ctx, ns, { enabled = true, maxBodyBytes = 65536, spy = null, client = ctx.ingress.c } = {}) {
  const a = syntheticAdapter(ns), t = pgTransport(client);
  const transport = spy ? { transaction: fn => t.transaction(tx => fn(new Proxy(tx, { get: (o, k) => (typeof o[k] === 'function' ? (...x) => { spy.push(String(k)); return o[k](...x); } : o[k]) }))) } : t;
  return { config: { enabled, maxBodyBytes }, verify: a.verify, map: a.map, transport };
}
// ---- anchor / resolver fixtures (same shape as the accepted ENT1-A smoke; disposable database only) -------------------------------------------------------------
const MEAL_SQL = "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source) values($1,'lunch',$2::timestamptz,$3::date,'manual') returning id";
async function fixtureMeal(ctx, owner, { t0, context = 'authenticated_actor' }) {
  await ctx.su.query('begin');
  try {
    await ctx.su.query("set local session_replication_role = 'replica'");
    const id = (await ctx.g.query(ctx.su, MEAL_SQL, [owner, t0, String(t0).slice(0, 10)])).rows[0].id;
    await ctx.g.query(ctx.su, "insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values($1,$2,$3::timestamptz,'canonical_meal_insert','retention-capture-v1',$4)", [id, owner, t0, context]);
    await ctx.su.query('commit');
    return id;
  } catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
async function makeResolver(ctx, name = 'bill_resolver') {
  await makeRole(ctx, name, [`grant usage on schema ${ACQ} to ${name}`, `grant execute on function ${ACQ}.resolve_detail_acquisition(uuid) to ${name}`]);
  return { role: name, c: await ctx.open(name) };
}
const resolve = (c, id) => call(c, `select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [id]);
// A test-only role that may call the ENT0 reader (state_at) directly: used ONLY for lock schedules and reverse controls.
async function makeReader(ctx, name = 'bill_reader') {
  await makeRole(ctx, name, [`grant usage on schema ${ENT} to ${name}`, `grant execute on function ${ENT_FN.state} to ${name}`]);
  return { role: name, c: await ctx.open(name) };
}
const sealPrivate = new Set();

export const GATES = {};
Object.assign(GATES, {
  async P01_VERTICAL_SLICE_SYNTHETIC_DELIVERY_TO_FACT_TO_STATE_AT_TO_RECEIPT(ctx) {
    const ns = 'store.sandbox';
    const o1 = await makeUser(ctx, 1), o2 = await makeUser(ctx, 2);
    const { producer } = await setupNamespace(ctx, ns);
    await activeLink(ctx, ns, o1, 'sub-paid'); await activeLink(ctx, ns, o2, 'sub-trial');
    const resolver = await makeResolver(ctx);
    const t0 = at(10, 123), t1 = at(3);
    const id1 = await fixtureMeal(ctx, o1, { t0 }), id2 = await fixtureMeal(ctx, o2, { t0: t1 });
    // before any delivery: both pending (no fact), nothing was invented
    const pending1 = await resolve(resolver.c, id1);
    // delivery: signed request -> verifier -> mapper -> inbox (ack only after commit)
    const reqObs = [obs(ns, 'sub-paid', 'd-paid-1', 'paid_period', atMs(5), atMs(40)), obs(ns, 'sub-trial', 'd-trial-1', 'trial_period', atMs(0), atMs(14))];
    const res = await ingest().receiveDelivery(signedRequest(ns, reqObs), receiveDeps(ctx, ns));
    const bodyText = await res.text();
    const inboxAfterIngest = await inboxRows(ctx);
    const noFactYet = (await count(ctx, `${ENT}.entitlement_events`)) === 0;
    const summary = await drain(ctx, producer);
    const ledger1 = await ledgerRows(ctx, o1), ledger2 = await ledgerRows(ctx, o2);
    const s1 = await stateAt(ctx, o1, t0), s2 = await stateAt(ctx, o2, t1);
    const covRows = await count(ctx, `${ENT}.entitlement_coverage`);
    // acquisition receipts come from the SEPARATE resolver role in its own transaction (never from the producer role)
    const r1 = await resolve(resolver.c, id1), r2 = await resolve(resolver.c, id2);
    const key1 = core().factKey(sha256hex, ns, 'sub-paid', 'paid', [atMs(5), atMs(40)]);
    const priv = (await q(ctx, `select has_function_privilege($1, '${ENT_FN.state}', 'EXECUTE') st, has_function_privilege($1, '${ENT_FN.admit}', 'EXECUTE') ad, has_function_privilege($1, '${ENT_FN.advance}', 'EXECUTE') av, has_schema_privilege($1, '${ENT}', 'USAGE') us`, [producer.role]))[0];
    const ok = pending1.ok && pending1.value.outcome === 'pending' && res.status === 200 && JSON.parse(bodyText).status === 'received' && inboxAfterIngest.length === 2 && inboxAfterIngest.every(r => r.state === 'received') && noFactYet
      && summary.processed === 2 && summary.stoppedBecause === 'idle'
      && ledger1.length === 1 && ledger1[0].class === 'paid' && ledger1[0].upstream_event_id === key1 && ledger1[0].source_sequence === null && isoMs(ledger1[0].valid_from) === iso(atMs(5)) && isoMs(ledger1[0].valid_until) === iso(atMs(40))
      && ledger2.length === 1 && ledger2[0].class === 'trial'
      && s1.state === 'paid' && s1.basis === 'paid_subscription' && same(s1.evidence.events, [ledger1[0].event_id])
      && s2.state === 'paid' && s2.basis === 'trial' && same(s2.evidence.events, [ledger2[0].event_id])
      && covRows === 0
      && r1.ok && r1.value.outcome === 'recorded' && r1.value.receipt.basis === 'paid_subscription' && same(r1.value.receipt.evidence_event_ids, [ledger1[0].event_id])
      && r2.ok && r2.value.outcome === 'recorded' && r2.value.receipt.basis === 'trial'
      && priv.st === false && priv.ad === false && priv.av === false && priv.us === false;
    return R(ok, { pending1, status: res.status, bodyText, summary, ledger1, ledger2, s1: view(s1), s2: view(s2), covRows, r1, r2, priv, key1 });
  },

  async P08_FRESH_APPLY_IS_INACTIVE_AND_CHANGES_ONLY_THE_TWO_SEAMS(ctx) {
    const tables = {};
    for (const t of ['namespace_config', 'identity_links', 'inbox', 'fact_segments', 'evidence_log']) tables[t] = await count(ctx, `${B}.${t}`);
    const ent = { producers: await count(ctx, `${ENT}.producers`), events: await count(ctx, `${ENT}.entitlement_events`), coverage: await count(ctx, `${ENT}.entitlement_coverage`) };
    const fnAcl = (await q(ctx, `select p.proname, (select string_agg(pg_get_userbyid(a.grantee)::text||':'||a.privilege_type, ',' order by pg_get_userbyid(a.grantee)::text) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee <> p.proowner) others from pg_proc p where p.pronamespace = '${B}'::regnamespace and p.prokind = 'f' order by 1`));
    const logins = (await q(ctx, "select rolname from pg_roles where rolcanlogin and rolname ~ '^(bill|consumer_retention_billing)' order by 1")).map(r => r.rolname);
    const delta = itemsDiff(ctx.items0, ctx.items1);
    const callers = (await q(ctx, `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname <> '${B}' and n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and p.prosrc ~ 'retention_billing'`)).map(r => r.proname);
    const refs = (await q(ctx, `select count(*)::int n from pg_depend d join pg_class c on c.oid = d.refobjid join pg_namespace n on n.oid = c.relnamespace where n.nspname = '${B}' and d.classid = 'pg_proc'::regclass`))[0].n;
    const unknown = (await ctx.g.query(ctx.su, `select ${B}.ingest_delivery('store.sandbox','d','s',$1,'paid_period',null::timestamptz,null::timestamptz,date_trunc('milliseconds', now()),'sandbox',null,null) s`, [sha256hex('x')])).rows[0].s;
    const owner = (await q(ctx, `select r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcanlogin, r.rolbypassrls, (select count(*)::int from pg_auth_members m where m.roleid=r.oid or m.member=r.oid) members from pg_roles r where r.rolname = '${BILLING_OWNER}'`))[0];
    const rls = await q(ctx, `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c where c.relnamespace = '${B}'::regnamespace and c.relkind = 'r' order by 1`);
    const defs = await q(ctx, `select p.proname, p.proconfig from pg_proc p where p.pronamespace = '${B}'::regnamespace and p.prokind = 'f' and p.prosecdef order by 1`);
    const rlsOk = rls.length === 5 && rls.every(r => r.relrowsecurity && r.relforcerowsecurity);
    const defsOk = defs.length === 5 && defs.every(d => (d.proconfig ?? []).some(c => /^search_path=/.test(c))) && defs.filter(d => d.proname !== 'next_candidate').every(d => (d.proconfig ?? []).includes('lock_timeout=2s'));
    const ok = rlsOk && defsOk && Object.values(tables).every(n => n === 0) && Object.values(ent).every(n => n === 0) && fnAcl.length === 11 && fnAcl.every(r => r.others === null)
      && logins.length === 0 && same(delta, EXPECTED_DELTA) && callers.length === 0 && refs === 0 && unknown.outcome === 'unknown_namespace'
      && owner.rolsuper === false && owner.rolinherit === false && owner.rolcreaterole === false && owner.rolcanlogin === false && owner.rolbypassrls === false && owner.members === 0
      && ctx.billing.boundary === true;
    return R(ok, { rls, defs, tables, ent, fnAcl, logins, delta, expected: EXPECTED_DELTA, callers, refs, unknown, owner });
  }
});
const view = s => ({ state: s.state, basis: s.basis, reason: s.reason, events: s.evidence.events });

// <<PART:seq>>
// ---- the fifteen event sequences (supplement-02 section 4) as executable cases ------------------------------------------------------------------------------------
// A test-only role that is a MEMBER of a namespace's producer role (so ENT0 recognises it as that producer) and may call admit/advance directly: it exists only to create coverage and to prove what the ledger itself does.
async function makeCoverageRole(ctx, producer, name = 'bill_cov_' + producer.ns.replace(/[^a-z0-9]/g, '_')) {
  await makeRole(ctx, name, [`grant ${producer.role} to ${name} with inherit true`, `grant usage on schema ${ENT} to ${name}`, `grant execute on function ${ENT_FN.admit} to ${name}`, `grant execute on function ${ENT_FN.advance} to ${name}`]);
  return { role: name, c: await ctx.open(name) };
}
const entAdmit = (c, owner, ns, up, cls, from, until, seq = null) => call(c, `select ${ENT}.admit_entitlement_event($1::uuid,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::bigint) s`, [owner, ns, up, cls, from, until, seq]);
const entAdvance = (c, owner, ns, through) => call(c, `select ${ENT}.advance_entitlement_coverage($1::uuid,$2,$3::timestamptz) s`, [owner, ns, through]);
async function feedAll(ctx, ns, list) { const out = []; for (const o of list) { out.push((await feed(ctx, ns, [o]))[0]); await sleep(3); } return out; }
const itemOf = async (ctx, subject, delivery) => (await inboxRows(ctx, 'subject_ref=$1 and delivery_id=$2', [subject, delivery]))[0];
const rel = it => it?.outcome?.relation ?? {};
const nsSetup = async (ctx, ns, opts) => ((ctx.namespaces ??= {})[ns] ??= await setupNamespace(ctx, ns, opts));
export async function sequenceCases(ctx) {
  const ns = 'store.sandbox';
  const W = await nsSetup(ctx, ns);
  const cov = await makeCoverageRole(ctx, W.producer);
  const cases = [];
  const rec = (name, pass, observed) => cases.push({ name, pass: !!pass, observed });
  let u = 200;
  const owner = async (subjects, nsName = ns) => { const o = await makeUser(ctx, ++u); for (const s of subjects) await activeLink(ctx, nsName, o, s); return o; };

  { // S1 redelivery of one delivery
    const o = await owner(['s1']);
    const d1 = obs(ns, 's1', 'S1-d1', 'paid_period', atMs(0), atMs(30));
    const f = await feedAll(ctx, ns, [d1, d1]);
    const sum = await drain(ctx, W.producer);
    const ib = await inboxRows(ctx, 'subject_ref=$1', ['s1']); const led = await ledgerRows(ctx, o);
    rec('S1 redelivery', same(f.map(x => x.outcome), ['received', 'duplicate']) && ib.length === 1 && ib[0].state === 'admitted' && led.length === 1 && sum.processed === 1, { f, ib: ib.map(x => x.state), led: led.length });
  }
  { // S2 same fact, different delivery
    const o = await owner(['s2']);
    const a = obs(ns, 's2', 'S2-d1', 'paid_period', atMs(0), atMs(30)), b = obs(ns, 's2', 'S2-d2', 'paid_period', atMs(0), atMs(30), { signedAtMs: BASE + 5000 });
    await feedAll(ctx, ns, [a, b]); await drain(ctx, W.producer);
    const ib = await inboxRows(ctx, 'subject_ref=$1', ['s2']); const led = await ledgerRows(ctx, o);
    rec('S2 same fact via a second delivery', same(ib.map(x => x.state).sort(), ['admitted', 'already_asserted']) && led.length === 1 && led[0].source_sequence === null, { states: ib.map(x => x.state), led: led.length });
  }
  { // S3 out of order
    const o = await owner(['s3']);
    await feedAll(ctx, ns, [obs(ns, 's3', 'S3-d2', 'paid_period', atMs(30), atMs(60)), obs(ns, 's3', 'S3-d1', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    const led = await ledgerRows(ctx, o), segs = await segRows(ctx, 'subject_ref=$1', ['s3']), st = await stateAt(ctx, o, at(10));
    rec('S3 out-of-order arrival', led.length === 2 && segs.length === 2 && same(unionMs(segs), [[atMs(0), atMs(60)]]) && st.state === 'paid', { led: led.length, union: unionMs(segs) });
  }
  { // S4 extension of an in-flight period after coverage passed its start
    const o = await owner(['s4']);
    await feedAll(ctx, ns, [obs(ns, 's4', 'S4-d1', 'paid_period', atMs(0), atMs(14))]); await drain(ctx, W.producer);
    const adv = await entAdvance(cov.c, o, ns, at(5));
    await feedAll(ctx, ns, [obs(ns, 's4', 'S4-d2', 'paid_period', atMs(0), atMs(21))]); await drain(ctx, W.producer);
    const it = await itemOf(ctx, 's4', 'S4-d2'); const led = await ledgerRows(ctx, o);
    const whole = await entAdmit(cov.c, o, ns, 'whole-period-key', 'paid', at(0), at(21)); // what a whole-period fact would have met
    rec('S4 extension adds only the new tail', adv.ok && it.state === 'admitted' && led.length === 2 && isoMs(led[1].valid_from) === iso(atMs(14)) && isoMs(led[1].valid_until) === iso(atMs(21)) && !whole.ok && whole.message === 'ENT_EVENT_BELOW_COVERAGE', { it: it.state, led: led.map(r => [isoMs(r.valid_from), isoMs(r.valid_until)]), whole });
  }
  { // S5 shortening and revocation never shorten or delete
    const o = await owner(['s5']);
    await feedAll(ctx, ns, [obs(ns, 's5', 'S5-d1', 'paid_period', atMs(0), atMs(30)), obs(ns, 's5', 'S5-rev', 'revocation', null, null), obs(ns, 's5', 'S5-d2', 'paid_period', atMs(0), atMs(10))]); await drain(ctx, W.producer);
    const rv = await itemOf(ctx, 's5', 'S5-rev'), sh = await itemOf(ctx, 's5', 'S5-d2'); const led = await ledgerRows(ctx, o); const st = await stateAt(ctx, o, at(20));
    rec('S5 shortening and revocation are recorded, not applied', rv.state === 'recorded_only' && rv.reason === 'revocation_observed' && sh.state === 'already_asserted' && rel(sh).shortening_observed === true && led.length === 1 && isoMs(led[0].valid_until) === iso(atMs(30)) && st.state === 'paid', { rv: rv.state, sh: sh.state, relation: rel(sh), led: led.length });
  }
  { // S6 same interval restated with the other class
    const o = await owner(['s6']);
    await feedAll(ctx, ns, [obs(ns, 's6', 'S6-d1', 'trial_period', atMs(0), atMs(14)), obs(ns, 's6', 'S6-d2', 'paid_period', atMs(0), atMs(14))]); await drain(ctx, W.producer);
    const led = await ledgerRows(ctx, o), it = await itemOf(ctx, 's6', 'S6-d2'), st = await stateAt(ctx, o, at(5));
    rec('S6 trial and paid for one interval coexist (no conflict)', led.length === 2 && new Set(led.map(r => r.class)).size === 2 && it.state === 'admitted' && rel(it).class_overlap_observed === true && st.state === 'paid' && st.basis === 'paid_subscription', { classes: led.map(r => r.class), relation: rel(it), basis: st.basis });
  }
  { // S7 two subscriptions of one owner over the same interval
    const o = await owner(['s7a', 's7b']);
    await feedAll(ctx, ns, [obs(ns, 's7a', 'S7-a', 'paid_period', atMs(0), atMs(30)), obs(ns, 's7b', 'S7-b', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    const led = await ledgerRows(ctx, o);
    rec('S7 two subscriptions, one owner', led.length === 2 && new Set(led.map(r => r.upstream_event_id)).size === 2, { led: led.length });
  }
  { // S8 two sources (namespaces) for one owner
    const W2 = await nsSetup(ctx, 'redeem.sandbox');
    const o = await owner(['s8a'], ns); await activeLink(ctx, 'redeem.sandbox', o, 's8r');
    await feedAll(ctx, ns, [obs(ns, 's8a', 'S8-a', 'paid_period', atMs(0), atMs(30))]); await feedAll(ctx, 'redeem.sandbox', [obs('redeem.sandbox', 's8r', 'S8-r', 'paid_period', atMs(0), atMs(30))]);
    await drain(ctx, W.producer); await drain(ctx, W2.producer);
    const led = await ledgerRows(ctx, o);
    rec('S8 two namespaces are independent', led.length === 2 && same(led.map(r => r.namespace).sort(), ['redeem.sandbox', 'store.sandbox']), { namespaces: led.map(r => r.namespace) });
  }
  { // S9 cross-owner claim and intent activation
    const A = await owner(['s9a']), Bo = await makeUser(ctx, ++u);
    const hB = sha256hex('binding-B-1'), hB2 = sha256hex('binding-B-2');
    const t = pgTransport(W.ingress.c);
    const i1 = await t.transaction(tx => tx.createLinkIntent(ns, Bo, hB, Date.now() + 3600000));
    const i2 = await t.transaction(tx => tx.createLinkIntent(ns, Bo, hB, Date.now() + 3600000));
    const i3 = await t.transaction(tx => tx.createLinkIntent(ns, A, hB, Date.now() + 3600000));
    await t.transaction(tx => tx.createLinkIntent(ns, Bo, hB2, Date.now() + 3600000));
    await feedAll(ctx, ns, [obs(ns, 's9a', 'S9-claim', 'paid_period', atMs(0), atMs(30), { bindingHash: hB }), obs(ns, 's9b', 'S9-activate', 'paid_period', atMs(0), atMs(30), { bindingHash: hB2 }), obs(ns, 's9c', 'S9-hash-claim', 'paid_period', atMs(0), atMs(30), { bindingHash: sha256hex('binding:' + ns + ':s9a') })]);
    await drain(ctx, W.producer);
    const claim = await itemOf(ctx, 's9a', 'S9-claim'), act2 = await itemOf(ctx, 's9b', 'S9-activate'), hc = await itemOf(ctx, 's9c', 'S9-hash-claim'); const ledA = await ledgerRows(ctx, A), ledB = await ledgerRows(ctx, Bo);
    const links = await q(ctx, `select owner_user_id, state, subject_ref from ${B}.identity_links where namespace=$1 and binding_hash in ($2,$3) order by binding_hash`, [ns, hB, hB2]);
    const ev = await evidenceRows(ctx, "kind in ('link_conflict')");
    rec('S9 a claimed subject never moves; an intent activates for its own owner only', i1.outcome === 'created' && i2.outcome === 'exists' && i3.outcome === 'conflict' && claim.state === 'quarantined' && claim.reason === 'link_conflict' && hc.state === 'quarantined' && hc.reason === 'link_conflict' && ledA.length === 0 && act2.state === 'admitted' && ledB.length === 1 && links.some(l => l.state === 'active' && l.subject_ref === 's9b') && ev.length >= 3, { hc: [hc.state, hc.reason], i1: i1.outcome, i2: i2.outcome, i3: i3.outcome, claim: claim.state, act2: act2.state, links, ev: ev.length });
  }
  { // S10 same delivery id, different content
    const o = await owner(['s10']);
    const a = obs(ns, 's10', 'S10-d', 'paid_period', atMs(0), atMs(30)), b = { ...a, payloadDigest: sha256hex('another payload') };
    const f = await feedAll(ctx, ns, [a, b]); await drain(ctx, W.producer);
    const ib = await inboxRows(ctx, 'subject_ref=$1', ['s10']); const ev = await evidenceRows(ctx, "kind='delivery_conflict' and item_id=$1", [ib[0].item_id]); const led = await ledgerRows(ctx, o);
    rec('S10 delivery id reused with other content', same(f.map(x => x.outcome), ['received', 'delivery_conflict']) && ib.length === 1 && ev.length === 1 && ev[0].detail.new_digest === b.payloadDigest && led.length === 1, { f: f.map(x => x.outcome), ev: ev.map(e => e.detail) });
  }
  { // S11 after coverage: replay is still a replay, genuinely late time is an incident
    const o = await owner(['s11']);
    await feedAll(ctx, ns, [obs(ns, 's11', 'S11-d1', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    const adv = await entAdvance(cov.c, o, ns, at(40));
    const led0 = await ledgerRows(ctx, o);
    const direct = await entAdmit(cov.c, o, ns, led0[0].upstream_event_id, 'paid', isoMs(led0[0].valid_from), isoMs(led0[0].valid_until));
    await feedAll(ctx, ns, [obs(ns, 's11', 'S11-d2', 'paid_period', atMs(0), atMs(30)), obs(ns, 's11', 'S11-late', 'paid_period', atMs(35), atMs(45))]); await drain(ctx, W.producer);
    const d2 = await itemOf(ctx, 's11', 'S11-d2'), late = await itemOf(ctx, 's11', 'S11-late'); const led = await ledgerRows(ctx, o); const segs = await segRows(ctx, 'subject_ref=$1', ['s11']); const ev = await evidenceRows(ctx, 'item_id=$1', [late.item_id]);
    const covRow = (await q(ctx, `select covered_through, revision from ${ENT}.entitlement_coverage where owner_user_id=$1`, [o]))[0];
    rec('S11 replay survives coverage; a late fact is quarantined with evidence and changes nothing', adv.ok && direct.ok && direct.value.outcome === 'replayed' && d2.state === 'already_asserted' && late.state === 'quarantined' && late.reason === 'event_below_coverage' && ev.length === 1 && led.length === 1 && segs.length === 1 && Number(covRow.revision) === 1, { direct, d2: d2.state, late: [late.state, late.reason], led: led.length, segs: segs.length, covRow });
  }
  { // S12 a gap is not bridged
    const o = await owner(['s12']);
    await feedAll(ctx, ns, [obs(ns, 's12', 'S12-d1', 'paid_period', atMs(0), atMs(30)), obs(ns, 's12', 'S12-d2', 'paid_period', atMs(31), atMs(60))]); await drain(ctx, W.producer);
    const it = await itemOf(ctx, 's12', 'S12-d2'); const led = await ledgerRows(ctx, o); const st = await stateAt(ctx, o, at(30, DAY / 2));
    rec('S12 gap_observed, no bridge', led.length === 2 && rel(it).gap_observed_ms === DAY && st.state !== 'paid', { relation: rel(it), state: st.state });
  }
  { // S13 registration boundary: only the part after registration is asserted; a wrong configuration copy is caught by ENT0 and quarantined
    const W3 = await nsSetup(ctx, 'trim.sandbox', { config: { registeredAt: at(10) }, producer: { registeredAt: at(10) } });
    const o = await owner(['s13'], 'trim.sandbox');
    await feedAll(ctx, 'trim.sandbox', [obs('trim.sandbox', 's13', 'S13-d1', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W3.producer);
    const led = await ledgerRows(ctx, o); const before = await stateAt(ctx, o, at(5)), after = await stateAt(ctx, o, at(15));
    const W4 = await nsSetup(ctx, 'drift.sandbox', { config: { registeredAt: at(-400) }, producer: { registeredAt: at(10) } });
    const o4 = await owner(['s13x'], 'drift.sandbox');
    await feedAll(ctx, 'drift.sandbox', [obs('drift.sandbox', 's13x', 'S13-x', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W4.producer);
    const it = await itemOf(ctx, 's13x', 'S13-x'); const ledx = await ledgerRows(ctx, o4); const evx = await evidenceRows(ctx, 'item_id=$1', [it.item_id]); const segx = await segRows(ctx, 'subject_ref=$1', ['s13x']);
    rec('S13 registration boundary', led.length === 1 && isoMs(led[0].valid_from) === at(10) && before.state !== 'paid' && after.state === 'paid' && it.state === 'quarantined' && it.reason === 'event_before_producer_registration' && ledx.length === 0 && segx.length === 0 && evx.length === 1, { led: led.map(r => [isoMs(r.valid_from), isoMs(r.valid_until)]), before: before.state, after: after.state, drift: [it.state, it.reason] });
  }
  { // S14 unknown outcome: abort after success, killed session, retry after commit
    const o = await owner(['s14']);
    await feedAll(ctx, ns, [obs(ns, 's14', 'S14-d1', 'paid_period', atMs(0), atMs(30))]);
    const id = (await inboxRows(ctx, 'subject_ref=$1', ['s14']))[0].item_id;
    const t = pgTransport(W.producer.c);
    const aborted = await t.transaction(async tx => { const r = await tx.processItem(id); if (r.outcome !== 'admitted') throw Error('unexpected ' + r.outcome); throw Error('ABORT_AFTER_SUCCESS'); }).then(() => null, e => e.message);
    const afterAbort = { item: (await inboxRows(ctx, 'item_id=$1', [id]))[0].state, led: (await ledgerRows(ctx, o)).length, segs: (await segRows(ctx, 'subject_ref=$1', ['s14'])).length };
    const c2 = await ctx.open(W.producer.role); const pid = (await c2.query('select pg_backend_pid() p')).rows[0].p;
    await c2.query('begin'); const inside = (await c2.query(`select ${B}.process_item($1::uuid) s`, [id])).rows[0].s;
    await ctx.su.query('select pg_terminate_backend($1)', [pid]); const killed = await c2.query('commit').then(() => 'commit-succeeded', () => 'connection-lost');
    await sleep(200);
    const afterKill = { item: (await inboxRows(ctx, 'item_id=$1', [id]))[0].state, led: (await ledgerRows(ctx, o)).length, segs: (await segRows(ctx, 'subject_ref=$1', ['s14'])).length };
    const sum = await drain(ctx, W.producer);
    const again = await pgTransport(W.producer.c).transaction(tx => tx.processItem(id));
    const dup = await feed(ctx, ns, [obs(ns, 's14', 'S14-d1', 'paid_period', atMs(0), atMs(30))]);
    await feedAll(ctx, ns, [obs(ns, 's14', 'S14-d2', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    const d2 = await itemOf(ctx, 's14', 'S14-d2'); const led = await ledgerRows(ctx, o);
    rec('S14 no half-done work; retries after an unknown outcome are idempotent', aborted === 'ABORT_AFTER_SUCCESS' && afterAbort.item === 'received' && afterAbort.led === 0 && afterAbort.segs === 0 && inside.outcome === 'admitted' && killed === 'connection-lost' && afterKill.item === 'received' && afterKill.led === 0 && afterKill.segs === 0
      && sum.processed === 1 && again.outcome === 'already_final' && dup[0].outcome === 'duplicate' && d2.state === 'already_asserted' && led.length === 1, { aborted, afterAbort, inside: inside.outcome, killed, afterKill, again: again.outcome, dup: dup[0].outcome, d2: d2.state, led: led.length });
  }
  { // S15 the segment table lost against a surviving ledger (restore): replay of the same segment, other segmentation
    const o = await owner(['s15']);
    await feedAll(ctx, ns, [obs(ns, 's15', 'S15-d1', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    await ctx.g.query(ctx.su, `delete from ${B}.fact_segments where subject_ref='s15'`);
    await feedAll(ctx, ns, [obs(ns, 's15', 'S15-d2', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    const it2 = await itemOf(ctx, 's15', 'S15-d2'); const led2 = await ledgerRows(ctx, o); const seg2 = await segRows(ctx, 'subject_ref=$1', ['s15']);
    await ctx.g.query(ctx.su, `delete from ${B}.fact_segments where subject_ref='s15'`);
    await feedAll(ctx, ns, [obs(ns, 's15', 'S15-d3', 'paid_period', atMs(0), atMs(40))]); await drain(ctx, W.producer);
    const led3 = await ledgerRows(ctx, o); const st = await stateAt(ctx, o, at(35));
    rec('S15 segments lost against a surviving ledger', it2.state === 'admitted' && it2.outcome.segments[0].ledger === 'replayed' && led2.length === 1 && seg2.length === 1 && led3.length === 2 && st.state === 'paid', { ledger: it2.outcome.segments[0].ledger, led2: led2.length, led3: led3.length });
  }
  return cases;
}
Object.assign(GATES, {
  async P02_FIFTEEN_EVENT_SEQUENCES_ARE_EXECUTED_NOT_ARGUED(ctx) {
    const cases = await sequenceCases(ctx);
    return R(cases.length === 15 && cases.every(c => c.pass), cases);
  }
});
// <<END:seq>>
// <<PART:prop>>
// ---- property: any arrival order, duplicates, interleaved draining and concurrent workers converge to the same asserted set as an independent oracle ----------------------------------------------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export async function propertyTrials(ctx, { trials = 14, seed = 20261020 } = {}) {
  const ns = 'store.sandbox';
  const W = await nsSetup(ctx, ns);
  const rnd = mulberry32(seed), pick = a => a[Math.floor(rnd() * a.length)], int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const results = [];
  for (let trial = 0; trial < trials; trial++) {
    const o = await makeUser(ctx, 400 + trial);
    const subjects = ['pa' + trial, 'pb' + trial];
    for (const s of subjects) await activeLink(ctx, ns, o, s);
    const list = [];
    const n = 10;
    for (let k = 0; k < n; k++) {
      const kindRoll = rnd();
      const subject = pick(subjects), cls = pick(['paid_period', 'trial_period']);
      if (kindRoll < 0.1) list.push(obs(ns, subject, `p${trial}-${k}`, 'revocation', null, null));
      else if (kindRoll < 0.18) list.push(obs(ns, subject, `p${trial}-${k}`, 'grace_period_unsupported', atMs(0), atMs(5)));
      else { const s = int(0, 40), len = int(1, 25); list.push(obs(ns, subject, `p${trial}-${k}`, cls, atMs(s), atMs(s + len))); }
    }
    // duplicates under new delivery ids, then a random arrival order
    for (let k = 0; k < 3; k++) { const base = pick(list.filter(x => x.periodStartMs !== null)); if (base) list.push({ ...base, deliveryId: base.deliveryId + '-dup' + k, payloadDigest: sha256hex(base.deliveryId + 'dup' + k) }); }
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    const workers = trial % 2 === 0 ? [W.producer] : [W.producer, { ...W.producer, c: await ctx.open(W.producer.role) }, { ...W.producer, c: await ctx.open(W.producer.role) }];
    const errors = [];
    // interleave arrival and processing; with several workers they drain concurrently
    for (let i = 0; i < list.length; i += 3) {
      await feedAll(ctx, ns, list.slice(i, i + 3));
      const settled = await Promise.allSettled(workers.map(w => drain(ctx, w, 4)));
      for (const r of settled) if (r.status === 'rejected') errors.push(String(r.reason?.code ?? r.reason?.message));
    }
    for (let guard = 0; guard < 10; guard++) {
      const settled = await Promise.allSettled(workers.map(w => drain(ctx, w, 50)));
      for (const r of settled) if (r.status === 'rejected') errors.push(String(r.reason?.code ?? r.reason?.message));
      if ((await q(ctx, `select count(*)::int n from ${B}.inbox where subject_ref = any($1::text[]) and state in ('received','retry_pending')`, [subjects]))[0].n === 0) break;
    }
    // independent oracle: union of the supported observations per (subject, class)
    const oracle = {};
    for (const x of list) { const cls = x.kind === 'paid_period' ? 'paid' : x.kind === 'trial_period' ? 'trial' : null; if (!cls) continue; (oracle[x.subjectRef + '|' + cls] ??= []).push([x.periodStartMs, x.periodEndMs]); }
    const segs = await segRows(ctx, 'owner_user_id=$1', [o]); const ledger = await ledgerRows(ctx, o); const ib = await q(ctx, `select kind, state, reason from ${B}.inbox where subject_ref = any($1::text[])`, [subjects]);
    const bySub = {};
    for (const s of segs) (bySub[s.subject_ref + '|' + s.class] ??= []).push(s);
    let equal = true; const mismatch = [];
    for (const key of new Set([...Object.keys(oracle), ...Object.keys(bySub)])) {
      const want = core().unionIntervals(oracle[key] ?? []), got = unionMs(bySub[key] ?? []);
      if (!same(want, got)) { equal = false; mismatch.push({ key, want, got }); }
      const sorted = [...(bySub[key] ?? [])].sort((a, b) => Date.parse(a.seg_start) - Date.parse(b.seg_start));
      for (let i = 1; i < sorted.length; i++) if (Date.parse(sorted[i].seg_start) < Date.parse(sorted[i - 1].seg_end)) { equal = false; mismatch.push({ key, overlap: [sorted[i - 1].seg_start, sorted[i].seg_start] }); }
    }
    const ledgerKeys = new Set(ledger.map(r => r.upstream_event_id)), segKeys = new Set(segs.map(s => s.upstream_event_id));
    const stateOk = ib.every(r => (r.kind === 'revocation' ? r.state === 'recorded_only' : r.kind === 'grace_period_unsupported' ? r.state === 'quarantined' && r.reason === 'unsupported_kind' : ['admitted', 'already_asserted'].includes(r.state)));
    const noConflict = errors.length === 0;
    results.push({ trial, workers: workers.length, items: list.length, equal, mismatch, ledgerEqSegments: ledger.length === segs.length && same([...ledgerKeys].sort(), [...segKeys].sort()), uniqueKeys: ledgerKeys.size === ledger.length, stateOk, errors, pass: equal && ledger.length === segs.length && same([...ledgerKeys].sort(), [...segKeys].sort()) && ledgerKeys.size === ledger.length && stateOk && noConflict });
  }
  return results;
}
Object.assign(GATES, {
  async P03_ANY_ORDER_DUPLICATES_AND_CONCURRENT_WORKERS_CONVERGE_TO_THE_ORACLE_SET(ctx) {
    const results = await propertyTrials(ctx);
    return R(results.length === 14 && results.every(r => r.pass), results);
  }
});
// <<END:prop>>
// <<PART:pure>>
// ---- pure core and DI layer (no database): the same detectors the mutation harness aims at the production TypeScript ------------------------------------------------------------------------------
function brute(interval, asserted) { const [s, e] = interval; const covered = new Set(); for (const [a, b] of asserted) for (let x = a; x < b; x++) covered.add(x); const out = []; let run = null; for (let x = s; x < e; x++) { if (covered.has(x)) { if (run !== null) { out.push([run, x]); run = null; } } else if (run === null) run = x; } if (run !== null) out.push([run, e]); return out; }
export async function pureChecks() {
  const c = core(), i = ingest();
  const rows = [];
  const check = (name, pass, observed) => rows.push({ name, pass: !!pass, observed: pass ? undefined : observed });
  const base = obs('store.sandbox', 'sub', 'd1', 'paid_period', atMs(0), atMs(30));
  // validation
  check('a valid observation passes and is frozen', c.validateObservation(base).ok && Object.isFrozen(c.validateObservation(base).value), c.validateObservation(base));
  const bad = [['missing key', (({ reasonCode, ...x }) => x)(base)], ['extra key (a token cannot ride along)', { ...base, token: 'x' }], ['namespace', { ...base, namespace: 'A' }], ['environment', { ...base, environment: 'prod' }], ['blank delivery', { ...base, deliveryId: ' ' }],
    ['subject too long', { ...base, subjectRef: 'x'.repeat(201) }], ['digest case', { ...base, payloadDigest: base.payloadDigest.toUpperCase() }], ['blank kind', { ...base, kind: '' }], ['kind too long', { ...base, kind: 'k'.repeat(65) }],
    ['only start', { ...base, periodEndMs: null }], ['end before start', { ...base, periodEndMs: base.periodStartMs }], ['fractional ms', { ...base, periodStartMs: base.periodStartMs + 0.5 }], ['signedAt NaN', { ...base, signedAtMs: NaN }],
    ['binding hash', { ...base, bindingHash: 'zz' }], ['reason too long', { ...base, reasonCode: 'r'.repeat(65) }], ['array', []], ['null', null], ['string period', { ...base, periodStartMs: '1' }]];
  for (const [name, v] of bad) check('validation rejects: ' + name, !c.validateObservation(v).ok, v);
  check('an unsupported kind is NOT a validation failure (it is quarantined with evidence by the database)', c.validateObservation({ ...base, kind: 'grace_period' }).ok, null);
  // interval arithmetic against a brute-force oracle
  let r = 12345, rn = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; let arith = true, firstBad = null;
  for (let t = 0; t < 600 && arith; t++) {
    const a = []; for (let k = 0; k < Math.floor(rn() * 5); k++) { const s = Math.floor(rn() * 30), e = s + 1 + Math.floor(rn() * 8); a.push([s, e]); }
    const s = Math.floor(rn() * 30), e = s + 1 + Math.floor(rn() * 20);
    const got = c.subtractAsserted([s, e], a), want = brute([s, e], a);
    if (!same(got, want)) { arith = false; firstBad = { a, s, e, got, want }; }
  }
  check('subtractAsserted equals the brute-force oracle on 600 random cases (never invents, never loses time)', arith, firstBad);
  check('subtraction never touches the asserted set and never returns an overlap', same(c.subtractAsserted([0, 10], [[0, 10]]), []) && same(c.subtractAsserted([0, 10], []), [[0, 10]]) && same(c.subtractAsserted([5, 5], []), []), null);
  check('unionIntervals merges overlapping and touching intervals', same(c.unionIntervals([[0, 5], [5, 9], [20, 25], [3, 4]]), [[0, 9], [20, 25]]), c.unionIntervals([[0, 5], [5, 9], [20, 25], [3, 4]]));
  check('clipToRegistration trims the start and drops what ends before registration', same(c.clipToRegistration([0, 30], 10), [10, 30]) && c.clipToRegistration([0, 10], 10) === null && same(c.clipToRegistration([20, 30], 10), [20, 30]), null);
  // plans (mirror of the database decision tree)
  const cfg = { namespace: 'store.sandbox', environment: 'sandbox', registeredAtMs: 0, maxPeriodMs: 400 };
  const plan = (o, asserted = []) => c.planObservation({ ...base, ...o }, cfg, asserted);
  check('plan: supported paid period', plan({ periodStartMs: 10, periodEndMs: 30 }).action === 'segments', plan({ periodStartMs: 10, periodEndMs: 30 }));
  check('plan: covered period is terminal already_asserted', plan({ periodStartMs: 10, periodEndMs: 30 }, [[0, 40]]).state === 'already_asserted', plan({ periodStartMs: 10, periodEndMs: 30 }, [[0, 40]]));
  check('plan: unsupported kinds (grace, refund, chargeback...) are quarantined, never admitted', ['grace_period', 'refund', 'chargeback', 'billing_retry', 'paused'].every(k => plan({ kind: k }).state === 'quarantined' && plan({ kind: k }).reason === 'unsupported_kind'), null);
  check('plan: revocation is recorded only; non_entitling is dismissed', plan({ kind: 'revocation', periodStartMs: null, periodEndMs: null }).state === 'recorded_only' && plan({ kind: 'non_entitling', periodStartMs: null, periodEndMs: null, reasonCode: 'price_change' }).reason === 'price_change', null);
  check('plan: environment mismatch and over-long periods are quarantined', plan({ environment: 'production' }).reason === 'environment_mismatch' && plan({ periodStartMs: 0, periodEndMs: 401 }).reason === 'period_too_long', null);
  check('plan: a period entirely before registration is terminal before_registration', c.planObservation({ ...base, periodStartMs: 0, periodEndMs: 10 }, { ...cfg, registeredAtMs: 10 }, []).state === 'before_registration', null);
  const gap = plan({ periodStartMs: 50, periodEndMs: 60 }, [[0, 40]]);
  check('plan: a gap is reported, never bridged', gap.action === 'segments' && same(gap.segments, [[50, 60]]) && gap.gapObservedMs === 10, gap);
  // keys
  const key = c.factKey(sha256hex, 'store.sandbox', 'sub', 'paid', [1767225600000, 1769904000000]);
  check('factKey = hash prefix(namespace|subject) : class : ms : ms and carries no provider identifier', key === `${sha256hex('store.sandbox|sub').slice(0, 32)}:paid:1767225600000:1769904000000` && !key.includes('sub'), key);
  // error classification
  const dec = f => c.classifyDbFailure(f);
  check('40P01 / 55P03 / 40001 / 57014 / connection and resource classes are transient and retryable', ['40P01', '55P03', '40001', '57014', '08006', '53300', '57P01'].every(code => dec({ code }).failure === 'transient' && dec({ code }).retry), null);
  check('ENT incidents are never retried', ['ENT_EVENT_CONFLICT', 'ENT_EVENT_BELOW_COVERAGE', 'ENT_EVENT_BEFORE_PRODUCER_REGISTRATION'].every(m => dec({ message: m }).failure === 'incident' && !dec({ message: m }).retry), null);
  check('configuration, contract and owner-absent classes are not retried', dec({ message: 'ENT_PRODUCER_NOT_AUTHORIZED' }).failure === 'configuration' && dec({ code: '22023' }).failure === 'contract_violation' && dec({ message: 'BILLING_DIRTY_TRANSACTION' }).failure === 'contract_violation' && dec({ code: '23503' }).failure === 'owner_absent', null);
  check('the default branch is unclassified + retryable + never terminal (no failure can become a success)', dec({ code: 'XX999' }).failure === 'unclassified' && dec({}).retry && ['40P01', 'XX999', '23505', '42501', ''].every(code => dec({ code }).terminal === false), null);
  check('only the six final outcomes are final; retry, busy, blocked, mapping_pending, idle and unknown strings never are', ['admitted', 'already_asserted', 'before_registration', 'recorded_only', 'dismissed', 'quarantined'].every(c.isFinalOutcome) && ['retry', 'busy', 'blocked', 'mapping_pending', 'idle', 'disabled', 'free', 'ok', 'success', '', undefined, null].every(x => !c.isFinalOutcome(x)), null);
  // processing loop against scripted transports
  const scripted = steps => { const log = []; const tx = { nextCandidate: async () => steps.next.shift() ?? null, processItem: async id => { const s = steps.process.shift(); if (s instanceof Error) throw s; return s ?? { outcome: 'idle', item_id: id }; }, recordAttempt: async (id, why) => { log.push(['attempt', id, why]); if (steps.attemptFails) throw Error('attempt-store-down'); return { outcome: 'recorded', item_id: id }; } };
    return { log, transport: { transaction: async fn => fn(tx) } }; };
  { const s = scripted({ next: [], process: [] }); const out = await i.processNamespace(s.transport, 'n', 5); check('processing: empty namespace is idle', out.stoppedBecause === 'idle' && out.processed === 0, out); }
  { const e = Object.assign(Error('deadlock'), { code: '40P01' }); const s = scripted({ next: ['i1', 'i2'], process: [e] }); const out = await i.processNamespace(s.transport, 'n', 5); check('processing: a deadlock rolls back, is recorded for the item in another transaction, stops the loop and counts as nothing processed', out.stoppedBecause === 'transient_failure' && out.processed === 0 && s.log.length === 1 && s.log[0][1] === 'i1' && out.outcomes['error:transient'] === 1, { out, log: s.log }); }
  { const s = scripted({ next: ['i1'], process: [{ outcome: 'retry', item_id: 'i1' }] }); const out = await i.processNamespace(s.transport, 'n', 5); check('processing: a lock-timeout retry is recorded, stops, and is not processed', out.stoppedBecause === 'busy_or_retry' && out.processed === 0 && s.log.length === 1, { out, log: s.log }); }
  { const s = scripted({ next: ['i1'], process: [{ outcome: 'blocked', item_id: 'i1' }] }); const out = await i.processNamespace(s.transport, 'n', 5); check('processing: blocked stops the loop without counting', out.stoppedBecause === 'blocked' && out.processed === 0, out); }
  { const s = scripted({ next: ['i1'], process: [{ outcome: 'totally-new-answer', item_id: 'i1' }] }); const out = await i.processNamespace(s.transport, 'n', 5); check('processing: an unknown answer claims no progress', out.stoppedBecause === 'transient_failure' && out.processed === 0, out); }
  { const s = scripted({ next: ['a', 'b', 'c', null], process: [{ outcome: 'admitted' }, { outcome: 'already_asserted' }, { outcome: 'mapping_pending' }] }); const out = await i.processNamespace(s.transport, 'n', 10); check('processing: finals count, mapping_pending is not final', out.processed === 2 && out.stoppedBecause === 'idle', out); }
  { const e = Object.assign(Error('x'), { code: '55P03' }); const s = scripted({ next: ['i1'], process: [e], attemptFails: true }); const out = await i.processNamespace(s.transport, 'n', 3).then(x => x, err => ({ threw: String(err) })); check('processing: a failing attempt store does not crash the loop or change the verdict', out.stoppedBecause === 'transient_failure', out); }
  // receive handler against scripted transports (no database)
  const rd = (over = {}) => { const calls = []; const a = syntheticAdapter('store.sandbox'); const tx = { ingestDelivery: async o => { calls.push(o.subjectRef + '/' + o.deliveryId); return over.outcome ? { outcome: over.outcome, item_id: 'x' } : { outcome: 'received', item_id: 'x' }; } };
    return { calls, deps: { config: { enabled: over.enabled ?? true, maxBodyBytes: over.max ?? 4096 }, verify: a.verify, map: a.map, transport: { transaction: async fn => { if (over.throws) throw over.throws; return fn(tx); } } } }; };
  const ns = 'store.sandbox', one = [obs(ns, 'b', 'd2', 'paid_period', 1, 2000), obs(ns, 'a', 'd1', 'paid_period', 1, 2000)];
  const st = async (req, over) => { const x = rd(over); const res = await i.receiveDelivery(req, x.deps); return { status: res.status, body: await res.text(), calls: x.calls }; };
  { const o = await st(signedRequest(ns, one, { method: 'GET' })); check('receive: GET is 405 and touches nothing', o.status === 405 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, one), { enabled: false }); check('receive: disabled is 503 and touches nothing', o.status === 503 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, one, { body: 'x'.repeat(5000) }), { max: 4096 }); check('receive: oversize is 413', o.status === 413 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, one, { sig: 'f'.repeat(64) })); check('receive: bad signature is 401 and no database call is made', o.status === 401 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, [], { body: '{"observations":"nope"}' })); check('receive: unmappable is 400', o.status === 400 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, [{ ...one[0], token: 'secret' }])); check('receive: an observation with an unexpected key is 422 and stores nothing', o.status === 422 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, [{ ...one[0], namespace: 'other.sandbox' }])); check('receive: a namespace claimed by the payload that differs from the verified one is 422', o.status === 422 && o.calls.length === 0, o); }
  { const o = await st(signedRequest(ns, one)); check('receive: success is 200, generic body, items are written in deterministic subject order', o.status === 200 && o.body === '{"status":"received"}' && same(o.calls, ['a/d1', 'b/d2']) && !o.body.includes('a/d1'), o); }
  { const o = await st(signedRequest(ns, one), { outcome: 'delivery_conflict' }); check('receive: a conflicting repeated delivery id is 409', o.status === 409, o); }
  { const o = await st(signedRequest(ns, one), { outcome: 'disabled' }); check('receive: a disabled namespace rolls the whole delivery back (503)', o.status === 503, o); }
  { const o = await st(signedRequest(ns, one), { throws: Object.assign(Error('deadlock'), { code: '40P01' }) }); check('receive: a database failure is 503 so the provider retries', o.status === 503, o); }
  { const o = await st(signedRequest(ns, one), { throws: Object.assign(Error('BILLING_INVALID_ARGUMENT'), { code: '22023' }) }); check('receive: a contract violation is 500 (not a silent success)', o.status === 500, o); }
  // purchase-intent handler
  const lk = (over = {}) => { const calls = []; const deps = { enabled: over.enabled ?? true, namespace: ns, authenticate: async () => (over.anon ? null : { userId: 'user-1' }), randomBindingValue: () => 'b'.repeat(40), sha256Hex: sha256hex, now: () => 1000, ttlMs: 3600000, transport: { transaction: async fn => fn({ createLinkIntent: async (n, o, h, exp) => { calls.push([n, o, h, exp]); return { outcome: over.outcome ?? 'created', link_id: 'l' }; } }) } }; return { calls, deps }; };
  { const x = lk(); const res = await i.createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: '{}' }), x.deps); const j = await res.json(); check('intent: the verified actor gets a binding; only its hash reaches the database', res.status === 200 && j.binding === 'b'.repeat(40) && x.calls.length === 1 && x.calls[0][2] === sha256hex('b'.repeat(40)) && x.calls[0][1] === 'user-1' && x.calls[0][3] === 3601000 && !JSON.stringify(x.calls).includes('b'.repeat(40)), { status: res.status, calls: x.calls }); }
  { const x = lk(); const res = await i.createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: '{"ownerUserId":"someone-else"}' }), x.deps); check('intent: a body carrying an owner is refused (422) and nothing is stored', res.status === 422 && x.calls.length === 0, res.status); }
  { const x = lk({ anon: true }); const res = await i.createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: '' }), x.deps); check('intent: unauthenticated is 401', res.status === 401 && x.calls.length === 0, res.status); }
  { const x = lk({ enabled: false }); const res = await i.createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: '' }), x.deps); check('intent: disabled is 503', res.status === 503 && x.calls.length === 0, res.status); }
  { const x = lk({ outcome: 'conflict' }); const res = await i.createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: '' }), x.deps); check('intent: a conflicting intent is 409', res.status === 409, res.status); }
  return rows;
}
Object.assign(GATES, {
  async P13_PURE_CORE_AND_DI_LAYER_NO_DATABASE() {
    const rows = await pureChecks();
    return R(rows.every(x => x.pass), rows);
  }
});
// <<END:pure>>
const PURE_IDS = new Set(['P13_PURE_CORE_AND_DI_LAYER_NO_DATABASE']);
// <<PART:atomic>>
// ---- timeouts, aborts and injected failures: nothing is ever half done -------------------------------------------------------------------------------------------------------------------------
const waitFor = async (fn, ms = 6000, step = 25) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(step); } return false; };
const ownerLockKey = (owner, ns) => `hashtextextended('${owner}:retention_entitlement:${ns}', 0)`;
const rowsFor = async (ctx, owner, subject) => ({ led: (await ledgerRows(ctx, owner)).length, segs: (await segRows(ctx, 'subject_ref=$1', [subject])).length });
Object.assign(GATES, {
  async P04_LOCK_TIMEOUT_AND_STATEMENT_TIMEOUT_LEAVE_NOTHING_PARTIAL_AND_THE_ITEM_RETRYABLE(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const o = await makeUser(ctx, 61); await activeLink(ctx, ns, o, 'tmo');
    await feedAll(ctx, ns, [obs(ns, 'tmo', 'T-1', 'paid_period', atMs(0), atMs(30))]);
    const id = (await inboxRows(ctx, 'subject_ref=$1', ['tmo']))[0].item_id;
    const holder = await ctx.open('supabase_admin');
    await holder.query(`select pg_advisory_lock(${ownerLockKey(o, ns)})`);
    // (a) the ENT0 owner lock is held elsewhere: process_item gives up after the function-level lock_timeout and reports retry; nothing changed
    const t0 = Date.now(); const sumA = await drain(ctx, W.producer); const waitedA = Date.now() - t0;
    const afterA = { item: (await inboxRows(ctx, 'item_id=$1', [id]))[0], ...(await rowsFor(ctx, o, 'tmo')) };
    // (b) a statement timeout shorter than the lock wait aborts the transaction (57014); the failure is recorded for the item in another transaction
    await W.producer.c.query("set statement_timeout = 400");
    const sumB = await drain(ctx, W.producer);
    await W.producer.c.query('reset statement_timeout');
    const afterB = { item: (await inboxRows(ctx, 'item_id=$1', [id]))[0], ...(await rowsFor(ctx, o, 'tmo')) };
    // (c) the lock is released: the SAME item completes, exactly once
    await holder.query(`select pg_advisory_unlock(${ownerLockKey(o, ns)})`);
    const sumC = await drain(ctx, W.producer);
    const afterC = { item: (await inboxRows(ctx, 'item_id=$1', [id]))[0], ...(await rowsFor(ctx, o, 'tmo')) };
    // (d) a failed-attempt record can never reopen or alter a finished item
    const noop = await pgTransport(W.producer.c).transaction(tx => tx.recordAttempt(id, 'LATE'));
    const afterD = (await inboxRows(ctx, 'item_id=$1', [id]))[0];
    const ok = sumA.stoppedBecause === 'busy_or_retry' && waitedA >= 1800 && afterA.item.state === 'retry_pending' && afterA.item.attempts === 1 && afterA.item.last_error === 'LOCK_TIMEOUT' && afterA.led === 0 && afterA.segs === 0
      && sumB.stoppedBecause === 'transient_failure' && afterB.item.state === 'retry_pending' && afterB.item.attempts === 2 && /^transient:57014/.test(afterB.item.last_error) && afterB.led === 0 && afterB.segs === 0
      && sumC.processed === 1 && afterC.item.state === 'admitted' && afterC.led === 1 && afterC.segs === 1
      && noop.outcome === 'noop' && afterD.state === 'admitted' && afterD.attempts === 2;
    return R(ok, { sumA, waitedA, afterA: { ...afterA, item: pickItem(afterA.item) }, sumB, afterB: { ...afterB, item: pickItem(afterB.item) }, sumC, afterC: { ...afterC, item: pickItem(afterC.item) }, noop });
  },

  async P12_INJECTED_DATABASE_FAILURES_AND_AN_OWNER_DELETION_RACE_LEAVE_NO_PARTIAL_STATE(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const out = {};
    // (a) the SECOND of two segments fails to record: the first ledger fact and segment must roll back with it
    const o1 = await makeUser(ctx, 71); await activeLink(ctx, ns, o1, 'inj');
    await feedAll(ctx, ns, [obs(ns, 'inj', 'I-1', 'paid_period', atMs(10), atMs(20))]); await drain(ctx, W.producer);
    await ctx.g.query(ctx.su, `create function ${B}.test_inject() returns trigger language plpgsql as $f$ begin if new.seg_start = '${at(20)}'::timestamptz then raise exception 'INJECTED_SEGMENT_FAILURE' using errcode='P0001'; end if; return new; end $f$`);
    await ctx.g.query(ctx.su, `create trigger test_inject before insert on ${B}.fact_segments for each row execute function ${B}.test_inject()`);
    await feedAll(ctx, ns, [obs(ns, 'inj', 'I-2', 'paid_period', atMs(0), atMs(30))]);
    const sumA = await drain(ctx, W.producer);
    const itA = await itemOf(ctx, 'inj', 'I-2');
    out.a = { sum: sumA, state: itA.state, attempts: itA.attempts, ...(await rowsFor(ctx, o1, 'inj')) };
    await ctx.g.query(ctx.su, `drop trigger test_inject on ${B}.fact_segments`);
    const sumA2 = await drain(ctx, W.producer);
    out.a2 = { sum: sumA2, ...(await rowsFor(ctx, o1, 'inj')), state: (await itemOf(ctx, 'inj', 'I-2')).state };
    await ctx.g.query(ctx.su, `drop function ${B}.test_inject()`);
    // (b) the final state update fails after the ledger fact and segment were written: everything rolls back
    const o2 = await makeUser(ctx, 72); await activeLink(ctx, ns, o2, 'inj2');
    await ctx.g.query(ctx.su, `create function ${B}.test_inject2() returns trigger language plpgsql as $f$ begin if new.state = 'admitted' then raise exception 'INJECTED_STATE_FAILURE' using errcode='P0001'; end if; return new; end $f$`);
    await ctx.g.query(ctx.su, `create trigger test_inject2 before update on ${B}.inbox for each row execute function ${B}.test_inject2()`);
    await feedAll(ctx, ns, [obs(ns, 'inj2', 'J-1', 'paid_period', atMs(0), atMs(30))]);
    const sumB = await drain(ctx, W.producer); const itB = await itemOf(ctx, 'inj2', 'J-1');
    out.b = { sum: sumB, state: itB.state, ...(await rowsFor(ctx, o2, 'inj2')) };
    await ctx.g.query(ctx.su, `drop trigger test_inject2 on ${B}.inbox`); await ctx.g.query(ctx.su, `drop function ${B}.test_inject2()`);
    const sumB2 = await drain(ctx, W.producer);
    out.b2 = { sum: sumB2, ...(await rowsFor(ctx, o2, 'inj2')) };
    // (c) the owner is deleted while the item is being processed (uncommitted deletion holds the user row): the outcome is one of the safe ones and no row of the deleted owner survives anywhere
    const o3 = await makeUser(ctx, 73); await activeLink(ctx, ns, o3, 'gone');
    await feedAll(ctx, ns, [obs(ns, 'gone', 'G-1', 'paid_period', atMs(0), atMs(30))]);
    const deleter = await ctx.open('supabase_admin');
    await deleter.query('begin'); await deleter.query('delete from auth.users where id = $1', [o3]);
    const pending = drain(ctx, W.producer).then(s => ({ ok: true, s }), e => ({ ok: false, code: e.code ?? null, message: String(e.message).slice(0, 100) }));
    await sleep(500); await deleter.query('commit');
    const raced = await pending;
    const itC = await itemOf(ctx, 'gone', 'G-1');
    const left = { ledger: await count(ctx, `${ENT}.entitlement_events`, 'owner_user_id=$1'.replace('$1', `'${o3}'`)), segs: await count(ctx, `${B}.fact_segments`, `owner_user_id='${o3}'`), links: await count(ctx, `${B}.identity_links`, `owner_user_id='${o3}'`) };
    out.c = { raced, state: itC.state, reason: itC.reason, owner: itC.owner_user_id, attempts: itC.attempts, left };
    const safe = itC.state === 'dismissed' && itC.reason === 'owner_absent' && itC.owner_user_id === null;
    const ok = out.a.sum.stoppedBecause === 'transient_failure' && out.a.state === 'retry_pending' && out.a.attempts === 1 && out.a.segs === 1 && out.a.led === 1
      && out.a2.state === 'admitted' && out.a2.led === 3 && out.a2.segs === 3
      && out.b.sum.stoppedBecause === 'transient_failure' && out.b.state === 'retry_pending' && out.b.led === 0 && out.b.segs === 0
      && out.b2.sum.processed === 1 && out.b2.led === 1 && out.b2.segs === 1
      && safe && left.ledger === 0 && left.segs === 0 && left.links === 0;
    return R(ok, out);
  }
});
const pickItem = i => ({ state: i.state, attempts: i.attempts, last_error: i.last_error, reason: i.reason });
// <<END:atomic>>
// <<PART:conc>>
// ---- concurrency: no duplicate facts; the lock schedules that were ACTUALLY run with separated roles, and the reverse controls that must still deadlock -----------------------------------------------------------
const settle = p => p.then(v => ({ ok: true, v }), e => ({ ok: false, code: e.code ?? null, message: String(e.message).slice(0, 120) }));
// a deadlock victim must end its transaction at once (its locks are released only then), exactly as an application would; the survivor then proceeds
const settleRb = (c, p) => settle(p).then(async r => { if (!r.ok) await c.query('rollback').catch(() => {}); return r; });
async function ownerWithItem(ctx, W, n, subject, delivery, start = 0, end = 30) {
  const o = await makeUser(ctx, n); await activeLink(ctx, W.ns, o, subject);
  await feedAll(ctx, W.ns, [obs(W.ns, subject, delivery, 'paid_period', atMs(start), atMs(end))]);
  const id = (await inboxRows(ctx, 'subject_ref=$1', [subject]))[0].item_id;
  return { o, id };
}
Object.assign(GATES, {
  async P05_CONCURRENT_WORKERS_AND_DELIVERIES_NEVER_DUPLICATE_A_FACT(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const out = {};
    // (a) the same item, two workers: the second one is told it is busy (row lock), then that it is final
    const a = await ownerWithItem(ctx, W, 81, 'cc1', 'C-1');
    const cB = await ctx.open(W.producer.role);
    await W.producer.c.query('begin'); const first = (await W.producer.c.query(`select ${B}.process_item($1::uuid) s`, [a.id])).rows[0].s;
    const second = (await cB.query(`select ${B}.process_item($1::uuid) s`, [a.id])).rows[0].s;
    await W.producer.c.query('commit');
    const third = (await cB.query(`select ${B}.process_item($1::uuid) s`, [a.id])).rows[0].s;
    out.a = { first: first.outcome, second: second.outcome, third: third.outcome, ...(await rowsFor(ctx, a.o, 'cc1')) };
    // (b) one delivery sent by six sessions at once: exactly one stored
    const ingressClients = []; for (let k = 0; k < 6; k++) ingressClients.push(await ctx.open('bill_ingress'));
    const same6 = obs(ns, 'cc2', 'C-2', 'paid_period', atMs(0), atMs(30));
    const res6 = await Promise.all(ingressClients.map(c => settle(pgTransport(c).transaction(tx => tx.ingestDelivery(same6)))));
    out.b = { outcomes: res6.map(r => r.ok ? r.v.outcome : r.code).sort(), stored: (await inboxRows(ctx, 'subject_ref=$1', ['cc2'])).length };
    // (c) one transaction may process only one item (one owner per transaction)
    const b1 = await ownerWithItem(ctx, W, 82, 'cc3', 'C-3'), b2 = await ownerWithItem(ctx, W, 83, 'cc4', 'C-4');
    const two = await settle(pgTransport(W.producer.c).transaction(async tx => { const x = await tx.processItem(b1.id); const y = await tx.processItem(b2.id); return [x.outcome, y.outcome]; }));
    out.c = { two, b1: (await inboxRows(ctx, 'item_id=$1', [b1.id]))[0].state, b2: (await inboxRows(ctx, 'item_id=$1', [b2.id]))[0].state, led1: (await ledgerRows(ctx, b1.o)).length, led2: (await ledgerRows(ctx, b2.o)).length };
    // (d) many owners, parallel workers
    const owners = []; for (let k = 0; k < 6; k++) { for (let j = 0; j < 3; j++) { const sub = `many${k}_${j}`; if (j === 0) owners.push((await ownerWithItem(ctx, W, 90 + k, sub, `M-${k}-${j}`, j * 10, j * 10 + 12)).o); else { await activeLink(ctx, ns, owners[k], sub); await feedAll(ctx, ns, [obs(ns, sub, `M-${k}-${j}`, 'paid_period', atMs(j * 10), atMs(j * 10 + 12))]); } } }
    const workers = [W.producer, { ...W.producer, c: await ctx.open(W.producer.role) }, { ...W.producer, c: await ctx.open(W.producer.role) }];
    const settled = await Promise.all(workers.map(w => settle(drain(ctx, w, 40))));
    const total = (await q(ctx, `select count(*)::int n from ${B}.inbox where subject_ref like 'many%' and state='admitted'`))[0].n;
    const dupKeys = (await q(ctx, `select count(*)::int n from (select upstream_event_id from ${ENT}.entitlement_events group by owner_user_id, namespace, upstream_event_id having count(*) > 1) d`))[0].n;
    out.d = { workers: settled.map(s => s.ok ? s.v.stoppedBecause : s.code), admitted: total, dupKeys, errors: settled.filter(s => !s.ok).length };
    // (e) two items of ONE subject in flight at once: the second must wait for the first (subject lock) and then see its committed segments, so it asserts only the new tail
    const eO = await makeUser(ctx, 99); await activeLink(ctx, ns, eO, 'sl1');
    await feedAll(ctx, ns, [obs(ns, 'sl1', 'SL-1', 'paid_period', atMs(0), atMs(30)), obs(ns, 'sl1', 'SL-2', 'paid_period', atMs(10), atMs(40))]);
    const eIds = (await inboxRows(ctx, 'subject_ref=$1', ['sl1'])).map(r => r.item_id);
    const cE = await ctx.open(W.producer.role);
    await W.producer.c.query('begin'); const e1 = (await W.producer.c.query(`select ${B}.process_item($1::uuid) s`, [eIds[0]])).rows[0].s;
    const e2p = settle(cE.query(`select ${B}.process_item($1::uuid) s`, [eIds[1]]).then(r => r.rows[0].s));
    await sleep(600); await W.producer.c.query('commit'); const e2 = await e2p;
    const eSegs = await segRows(ctx, 'subject_ref=$1', ['sl1']); const eLed = await ledgerRows(ctx, eO);
    out.e = { first: e1.outcome, second: e2.ok ? [e2.v.outcome, e2.v.segments.map(s => [Date.parse(s.start), Date.parse(s.end)])] : e2.code, segs: eSegs.length, led: eLed.length, union: unionMs(eSegs) };
    const ok = out.a.first === 'admitted' && out.a.second === 'busy' && out.a.third === 'already_final' && out.a.led === 1 && out.a.segs === 1
      && same(out.b.outcomes, ['duplicate', 'duplicate', 'duplicate', 'duplicate', 'duplicate', 'received']) && out.b.stored === 1
      && !out.c.two.ok && /BILLING_DIRTY_TRANSACTION/.test(out.c.two.message) && out.c.two.code === '25000' && out.c.b1 === 'received' && out.c.b2 === 'received' && out.c.led1 === 0 && out.c.led2 === 0
      && out.d.errors === 0 && out.d.admitted === 18 && out.d.dupKeys === 0
      && out.e.first === 'admitted' && same(out.e.second, ['admitted', [[atMs(30), atMs(40)]]]) && out.e.segs === 2 && out.e.led === 2 && same(out.e.union, [[atMs(0), atMs(40)]]);
    return R(ok, out);
  },

  async P06_LOCK_SCHEDULES_WITH_SEPARATED_ROLES_AND_THE_REVERSE_CONTROLS_THAT_DEADLOCK(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const resolver = await makeResolver(ctx);
    const out = {};
    const withAnchor = async (n, subject, delivery, t0Days = 5) => { const x = await ownerWithItem(ctx, W, n, subject, delivery, 0, 30); const meal = await fixtureMeal(ctx, x.o, { t0: at(t0Days) }); return { ...x, meal }; };
    // (a) a resolver transaction holds the shared owner locks for ~600 ms: the producer WAITS (no deadlock, no error) and then completes
    const A = await withAnchor(101, 'ls1', 'L-1');
    await resolver.c.query('begin'); const pendA = (await resolver.c.query(`select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [A.meal])).rows[0].s;
    const tA = Date.now(); const pa = settle(pgTransport(W.producer.c).transaction(tx => tx.processItem(A.id)));
    await sleep(600); await resolver.c.query('commit'); const ra = await pa;
    out.a = { resolverBefore: pendA.outcome, outcome: ra.ok ? ra.v.outcome : ra.code, waitedMs: Date.now() - tA };
    // (b) the resolver keeps the locks beyond the lock timeout: the producer reports retry after about two seconds, nothing changed; afterwards the item completes
    const B2 = await withAnchor(102, 'ls2', 'L-2');
    await resolver.c.query('begin'); await resolver.c.query(`select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [B2.meal]);
    const tB = Date.now(); const rb = await settle(pgTransport(W.producer.c).transaction(tx => tx.processItem(B2.id))); const waitedB = Date.now() - tB;
    const mid = { item: (await inboxRows(ctx, 'item_id=$1', [B2.id]))[0].state, ...(await rowsFor(ctx, B2.o, 'ls2')) };
    await resolver.c.query('commit');
    const rb2 = await settle(pgTransport(W.producer.c).transaction(tx => tx.processItem(B2.id)));
    out.b = { first: rb.ok ? rb.v.outcome : rb.code, waitedMs: waitedB, mid, second: rb2.ok ? rb2.v.outcome : rb2.code };
    // (c) the producer holds its transaction open; the resolver WAITS for it and then sees the committed Paid fact (receipt recorded, in its own transaction)
    const C = await withAnchor(103, 'ls3', 'L-3');
    await W.producer.c.query('begin'); const pc = (await W.producer.c.query(`select ${B}.process_item($1::uuid) s`, [C.id])).rows[0].s;
    const tC = Date.now(); const rc = settle(resolver.c.query(`select ${ACQ}.resolve_detail_acquisition($1::uuid) s`, [C.meal]).then(r => r.rows[0].s));
    await sleep(600); await W.producer.c.query('commit'); const rcv = await rc;
    out.c = { producer: pc.outcome, resolver: rcv.ok ? [rcv.v.outcome, rcv.v.receipt?.basis] : rcv.code, waitedMs: Date.now() - tC };
    // (d) different namespaces of one owner do not wait for each other
    const W2 = await nsSetup(ctx, 'redeem.sandbox');
    const D = await ownerWithItem(ctx, W, 104, 'ls4', 'L-4'); await activeLink(ctx, 'redeem.sandbox', D.o, 'ls4r'); await feedAll(ctx, 'redeem.sandbox', [obs('redeem.sandbox', 'ls4r', 'L-4r', 'paid_period', atMs(0), atMs(30))]);
    const idD2 = (await inboxRows(ctx, 'subject_ref=$1', ['ls4r']))[0].item_id;
    const cD = await ctx.open(W2.producer.role);
    await W.producer.c.query('begin'); await W.producer.c.query(`select ${B}.process_item($1::uuid) s`, [D.id]);
    const tD = Date.now(); const rd = await settle(pgTransport(cD).transaction(tx => tx.processItem(idD2))); const waitedD = Date.now() - tD;
    await W.producer.c.query('commit');
    out.d = { other: rd.ok ? rd.v.outcome : rd.code, waitedMs: waitedD };
    // (e) REVERSE CONTROL (ENT0 level): a role that holds BOTH the reader and the writer deadlocks exactly in the Owner-accepted D-1 shape
    const ctl = await nsSetup(ctx, 'ctl.sandbox', { producer: { extra: [`grant usage on schema ${ENT} to bill_p_ctl_sandbox`, `grant execute on function ${ENT_FN.admit} to bill_p_ctl_sandbox`, `grant execute on function ${ENT_FN.state} to bill_p_ctl_sandbox`] } });
    const oE = await makeUser(ctx, 110);
    const s1 = await ctx.open(ctl.producer.role), s2 = await ctx.open(ctl.producer.role);
    await s1.query('begin'); await s2.query('begin');
    await s1.query(`select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz)`, [oE, at(1)]); await s2.query(`select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz)`, [oE, at(1)]);
    const adm = (c, id) => settleRb(c, c.query(`select ${ENT}.admit_entitlement_event($1::uuid,'ctl.sandbox',$2,'paid',$3::timestamptz,$4::timestamptz,null) s`, [oE, id, at(2), at(9)]));
    const p1 = adm(s1, 'ctl-1'); await waitFor(async () => (await q(ctx, 'select count(*)::int n from pg_locks where not granted'))[0].n >= 1);
    const p2 = adm(s2, 'ctl-2'); const [e1, e2] = await Promise.all([p1, p2]);
    await s1.query('rollback').catch(() => {}); await s2.query('rollback').catch(() => {});
    out.e = { codes: [e1, e2].map(x => x.ok ? 'ok' : x.code).sort() };
    // (f) REVERSE CONTROL (billing level): the same combination through process_item
    const ctl2 = await nsSetup(ctx, 'ctl2.sandbox', { producer: { extra: [`grant execute on function ${ENT_FN.state} to bill_p_ctl2_sandbox`, `grant usage on schema ${ENT} to bill_p_ctl2_sandbox`] } });
    const F1 = await ownerWithItem(ctx, { ...W, ns: 'ctl2.sandbox' }, 111, 'lf1', 'L-f1'), F2 = { o: F1.o };
    await activeLink(ctx, 'ctl2.sandbox', F1.o, 'lf2'); await feedAll(ctx, 'ctl2.sandbox', [obs('ctl2.sandbox', 'lf2', 'L-f2', 'paid_period', atMs(0), atMs(30))]);
    const idF2 = (await inboxRows(ctx, 'subject_ref=$1', ['lf2']))[0].item_id;
    const f1 = await ctx.open(ctl2.producer.role), f2 = await ctx.open(ctl2.producer.role);
    await f1.query('begin'); await f2.query('begin');
    await f1.query(`select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz)`, [F1.o, at(1)]); await f2.query(`select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz)`, [F1.o, at(1)]);
    const proc = (c, id) => settleRb(c, c.query(`select ${B}.process_item($1::uuid) s`, [id]).then(r => r.rows[0].s));
    const q1 = proc(f1, F1.id); await waitFor(async () => (await q(ctx, 'select count(*)::int n from pg_locks where not granted'))[0].n >= 1);
    const q2 = proc(f2, idF2); const [g1, g2] = await Promise.all([q1, q2]);
    await f1.query('rollback').catch(() => {}); await f2.query('rollback').catch(() => {});
    out.f = { codes: [g1, g2].map(x => x.ok ? x.v.outcome : x.code).sort() };
    // (g) REVERSE CONTROL (cross-owner order): two writers touching two owners in opposite order deadlock - which is why one transaction may process one item only
    const oG1 = await makeUser(ctx, 112), oG2 = await makeUser(ctx, 113);
    const g_1 = await ctx.open(ctl.producer.role), g_2 = await ctx.open(ctl.producer.role);
    await g_1.query('begin'); await g_2.query('begin');
    const adm2 = (c, owner, id) => settleRb(c, c.query(`select ${ENT}.admit_entitlement_event($1::uuid,'ctl.sandbox',$2,'paid',$3::timestamptz,$4::timestamptz,null) s`, [owner, id, at(2), at(9)]));
    await adm2(g_1, oG1, 'x-1'); await adm2(g_2, oG2, 'x-2');
    const h1 = adm2(g_1, oG2, 'x-3'); await waitFor(async () => (await q(ctx, 'select count(*)::int n from pg_locks where not granted'))[0].n >= 1);
    const h2 = adm2(g_2, oG1, 'x-4'); const [k1, k2] = await Promise.all([h1, h2]);
    await g_1.query('rollback').catch(() => {}); await g_2.query('rollback').catch(() => {});
    out.g = { codes: [k1, k2].map(x => x.ok ? 'ok' : x.code).sort() };
    const ok = out.a.resolverBefore === 'pending' && out.a.outcome === 'admitted' && out.a.waitedMs >= 500
      && out.b.first === 'retry' && out.b.waitedMs >= 1800 && out.b.mid.item === 'received' && out.b.mid.led === 0 && out.b.mid.segs === 0 && out.b.second === 'admitted'
      && out.c.producer === 'admitted' && same(out.c.resolver, ['recorded', 'paid_subscription']) && out.c.waitedMs >= 500
      && out.d.other === 'admitted' && out.d.waitedMs < 1500
      && same(out.e.codes, ['40P01', 'ok']) && same(out.f.codes, ['40P01', 'admitted']) && same(out.g.codes, ['40P01', 'ok']);
    return R(ok, out);
  }
});
// <<END:conc>>
// <<PART:perm>>
// ---- privileges, membership paths, direct access and row-level immutability ----------------------------------------------------------------------------------------------------------------------
const BILL_TABLES = ['namespace_config', 'identity_links', 'inbox', 'fact_segments', 'evidence_log'];
const BILL_FUNCS = ['guard_config()', 'guard_link_update()', 'guard_inbox_update()', 'guard_segment()', 'reject_evidence_change()', 'fact_key(text,text,text,timestamptz,timestamptz)', 'ingest_delivery(text,text,text,text,text,timestamptz,timestamptz,timestamptz,text,text,text)', 'create_link_intent(text,uuid,text,timestamptz)', 'next_candidate(text)', 'process_item(uuid)', 'record_attempt(uuid,text)'];
const OTHER_FUNCS = { admit: ENT_FN.admit, advance: ENT_FN.advance, state_at: ENT_FN.state, resolve: `${ACQ}.resolve_detail_acquisition(uuid)`, seal: 'retention_seal.record_registry_seal(timestamptz, text)', covers: 'retention_seal.registry_seal_covers(timestamptz)' };
async function grantedList(ctx, role) {
  const out = [];
  for (const s of [B, ENT, ACQ, 'retention_seal', 'retention_capture']) for (const p of ['USAGE', 'CREATE']) if ((await q(ctx, 'select has_schema_privilege($1,$2,$3) v', [role, s, p]))[0].v) out.push(`schema:${s}:${p}`);
  for (const t of BILL_TABLES) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) if ((await q(ctx, 'select has_table_privilege($1,$2,$3) v', [role, `${B}.${t}`, p]))[0].v) out.push(`table:${B}.${t}:${p}`);
  for (const t of ['producers', 'entitlement_events', 'entitlement_coverage']) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) if ((await q(ctx, 'select has_table_privilege($1,$2,$3) v', [role, `${ENT}.${t}`, p]))[0].v) out.push(`table:${ENT}.${t}:${p}`);
  for (const t of ['registry_seals']) for (const p of ['SELECT', 'INSERT']) if ((await q(ctx, 'select has_table_privilege($1,$2,$3) v', [role, `retention_seal.${t}`, p]))[0].v) out.push(`table:retention_seal.${t}:${p}`);
  for (const t of ['detail_acquisition_records']) for (const p of ['SELECT', 'INSERT']) if ((await q(ctx, 'select has_table_privilege($1,$2,$3) v', [role, `${ACQ}.${t}`, p]))[0].v) out.push(`table:${ACQ}.${t}:${p}`);
  for (const f of BILL_FUNCS) if ((await q(ctx, 'select has_function_privilege($1,$2,$3) v', [role, `${B}.${f}`, 'EXECUTE']))[0].v) out.push(`fn:${B}.${f.split('(')[0]}`);
  for (const [k, f] of Object.entries(OTHER_FUNCS)) if ((await q(ctx, 'select has_function_privilege($1,$2,$3) v', [role, f, 'EXECUTE']))[0].v) out.push(`fn:${k}`);
  return out.sort();
}
async function asRole(ctx, role, sql, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query(`set local role "${role}"`); const r = await ctx.su.query(sql, values); return { ok: true, rows: r.rowCount }; }
  catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message).slice(0, 100) }; }
  finally { await ctx.su.query('rollback').catch(() => {}); }
}
async function attempt(ctx, sql, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query(sql, values); return { ok: true }; }
  catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message) }; }
  finally { await ctx.su.query('rollback').catch(() => {}); }
}
Object.assign(GATES, {
  async P07_EFFECTIVE_PRIVILEGE_MATRIX_AND_NO_MEMBERSHIP_OR_SET_PATH_TO_THE_BILLING_OWNER(ctx) {
    const W = await nsSetup(ctx, 'store.sandbox');
    const resolver = await makeResolver(ctx), reader = await makeReader(ctx);
    const existing = new Set((await q(ctx, 'select rolname from pg_roles')).map(r => r.rolname));
    const runtime = ['anon', 'authenticated', 'service_role', 'authenticator', 'social_runtime_executor'].filter(r => existing.has(r));
    const expected = {
      [W.ingress.role]: [`schema:${B}:USAGE`, `fn:${B}.ingest_delivery`, `fn:${B}.create_link_intent`].sort(),
      [W.producer.role]: [`schema:${B}:USAGE`, `fn:${B}.next_candidate`, `fn:${B}.process_item`, `fn:${B}.record_attempt`].sort(),
      [resolver.role]: [`schema:${ACQ}:USAGE`, 'fn:resolve'].sort(),
      [reader.role]: [`schema:${ENT}:USAGE`, 'fn:state_at'].sort()
    };
    for (const r of runtime) expected[r] = [];
    const matrix = {};
    for (const role of Object.keys(expected)) matrix[role] = await grantedList(ctx, role);
    // PUBLIC may reach nothing new: no PUBLIC grantee on any billing object, nor on the ENT0 writers
    const publicOn = (await q(ctx, `select (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.pronamespace='${B}'::regnamespace and a.grantee = 0)
      + (select count(*)::int from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where c.relnamespace='${B}'::regnamespace and a.grantee = 0)
      + (select count(*)::int from pg_namespace n, aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a where n.nspname='${B}' and a.grantee = 0)
      + (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid in ('${ENT_FN.admit}'::regprocedure, '${ENT_FN.advance}'::regprocedure) and a.grantee = 0) n`))[0].n;
    // owners: exactly the approved seam, nothing more
    const owners = {};
    for (const [role, probes] of [[BILLING_OWNER, ['admit', 'advance', 'state_at']], ['consumer_retention_acquisition_owner', ['admit', 'advance', 'state_at']], ['consumer_retention_seal_owner', ['admit', 'advance', 'state_at']]]) {
      owners[role] = {}; for (const k of probes) owners[role][k] = (await q(ctx, 'select has_function_privilege($1,$2,$3) v', [role, OTHER_FUNCS[k], 'EXECUTE']))[0].v;
    }
    const ownerOk = same(owners[BILLING_OWNER], { admit: true, advance: false, state_at: false }) && same(owners.consumer_retention_acquisition_owner, { admit: false, advance: false, state_at: true }) && same(owners.consumer_retention_seal_owner, { admit: false, advance: false, state_at: true });
    // membership / SET reachability of the billing owner from every non-superuser role
    const reach = await q(ctx, `select r.rolname, pg_has_role(r.oid, '${BILLING_OWNER}'::regrole, 'MEMBER') m, pg_has_role(r.oid, '${BILLING_OWNER}'::regrole, 'USAGE') u, pg_has_role(r.oid, '${BILLING_OWNER}'::regrole, 'SET') s from pg_roles r where not r.rolsuper and r.rolname <> '${BILLING_OWNER}'`);
    const reachable = reach.filter(r => r.m || r.u || r.s).map(r => r.rolname);
    const setRole = {};
    for (const c of [W.ingress, W.producer, resolver, reader]) { try { await c.c.query(`set role ${BILLING_OWNER}`); setRole[c.role] = 'allowed'; await c.c.query('reset role'); } catch (e) { setRole[c.role] = e.code; } } // real sessions of the login roles (SET ROLE is judged against the SESSION user)
    for (const r of runtime) { const row = reach.find(x => x.rolname === r); setRole[r] = row && !row.m && !row.u && !row.s ? '42501' : 'reachable'; }
    const edges = (await q(ctx, `select count(*)::int n from pg_auth_members m join pg_roles r on r.oid in (m.roleid, m.member, m.grantor) where r.rolname = '${BILLING_OWNER}'`))[0].n;
    const matrixOk = Object.keys(expected).every(r => same(matrix[r], expected[r]));
    const ok = matrixOk && publicOn === 0 && ownerOk && reachable.length === 0 && edges === 0 && Object.values(setRole).every(c => c === '42501');
    return R(ok, { matrix, expected, publicOn, owners, reachable, edges, setRole });
  },

  async N01_DIRECT_ACCESS_IS_REFUSED_FORGED_ROWS_ARE_REJECTED_AND_ROW_LEVEL_RULES_HOLD(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const resolver = await makeResolver(ctx), reader = await makeReader(ctx);
    const o = await makeUser(ctx, 121); await activeLink(ctx, ns, o, 'dm1');
    await feedAll(ctx, ns, [obs(ns, 'dm1', 'N-1', 'paid_period', atMs(0), atMs(30)), obs(ns, 'dm2', 'N-2', 'paid_period', atMs(0), atMs(30))]); await drain(ctx, W.producer);
    const existing = new Set((await q(ctx, 'select rolname from pg_roles')).map(r => r.rolname));
    const roles = ['anon', 'authenticated', 'service_role', 'authenticator', 'social_runtime_executor'].filter(r => existing.has(r)).concat([W.ingress.role, W.producer.role, resolver.role, reader.role]);
    const refused = []; const leaks = [];
    for (const role of roles) {
      for (const t of BILL_TABLES) for (const sql of [`select 1 from ${B}.${t} limit 1`, `delete from ${B}.${t}`, `truncate ${B}.${t}`]) { const r = await asRole(ctx, role, sql); (r.ok ? leaks : refused).push([role, sql, r.code]); }
      for (const [t, sql] of [['inbox', `update ${B}.inbox set attempts = attempts`], ['identity_links', `update ${B}.identity_links set created_at = created_at`], ['namespace_config', `update ${B}.namespace_config set enabled = enabled`]]) { const r = await asRole(ctx, role, sql); (r.ok ? leaks : refused).push([role, sql, r.code]); }
      const fns = [[`select ${B}.ingest_delivery('store.sandbox','x','x',repeat('a',64),'paid_period',null,null,now(),'sandbox',null,null)`, W.ingress.role], [`select ${B}.create_link_intent('store.sandbox','${o}',repeat('a',64),now() + interval '1 hour')`, W.ingress.role], [`select ${B}.next_candidate('store.sandbox')`, W.producer.role], [`select ${B}.process_item('${o}')`, W.producer.role], [`select ${B}.record_attempt('${o}','x')`, W.producer.role]];
      for (const [sql, allowed] of fns) { if (role === allowed) continue; const r = await asRole(ctx, role, sql); (r.ok ? leaks : refused).push([role, sql.slice(0, 40), r.code]); }
      for (const f of [`select ${ENT}.admit_entitlement_event('${o}','store.sandbox','k','paid',now(),now() + interval '1 day',null)`, `select ${ENT}.advance_entitlement_coverage('${o}','store.sandbox',now())`]) { const r = await asRole(ctx, role, f); (r.ok ? leaks : refused).push([role, f.slice(0, 40), r.code]); }
    }
    const allRefusedAs42501 = refused.every(x => x[2] === '42501');
    // a producer cannot read or write the inbox even through its allowed functions' schema: direct table access is refused
    const inboxRow = (await inboxRows(ctx, 'subject_ref=$1', ['dm1']))[0];
    const seg = (await segRows(ctx, 'subject_ref=$1', ['dm1']))[0];
    const expectErr = async (label, sql, values, prefix) => { const r = await attempt(ctx, sql, values); return { label, pass: !r.ok && (r.message.startsWith(prefix) || r.code === prefix), got: r.ok ? 'accepted' : `${r.code} ${r.message.slice(0, 60)}` }; };
    const rows = [];
    rows.push(await expectErr('terminal inbox item cannot be changed', `update ${B}.inbox set reason = 'x' where item_id = $1`, [inboxRow.item_id], 'BILLING_ITEM_TERMINAL'));
    rows.push(await expectErr('what the adapter asserted cannot be rewritten', `update ${B}.inbox set kind = 'trial_period' where item_id = $1`, [(await inboxRows(ctx, 'subject_ref=$1', ['dm2']))[0].item_id], 'BILLING_ITEM_IMMUTABLE').then(r => ({ ...r, pass: r.pass || /BILLING_ITEM_(IMMUTABLE|TERMINAL)/.test(r.got) })));
    rows.push(await expectErr('an item never returns to received', `update ${B}.inbox set state = 'received' where subject_ref = 'dm2'`, [], 'BILLING_ITEM_TRANSITION'));
    { const dec = await attempt(ctx, `update ${B}.inbox set attempts = 2 where subject_ref = 'dm2'; update ${B}.inbox set attempts = 1 where subject_ref = 'dm2'`); rows.push({ label: 'attempts never decrease', pass: !dec.ok && /BILLING_ITEM_TRANSITION/.test(dec.message), got: dec.ok ? 'accepted' : dec.message.slice(0, 60) }); }
    rows.push(await expectErr('unknown state is refused', `insert into ${B}.inbox(namespace, delivery_id, subject_ref, payload_digest, kind, signed_at, environment, state) values ('store.sandbox','z1','z',repeat('a',64),'k',now(),'sandbox','finished')`, [], '23514'));
    rows.push(await expectErr('period order is enforced', `insert into ${B}.inbox(namespace, delivery_id, subject_ref, payload_digest, kind, period_start, period_end, signed_at, environment) values ('store.sandbox','z2','z',repeat('a',64),'paid_period','2026-01-02','2026-01-01',date_trunc('milliseconds', now()),'sandbox')`, [], '23514'));
    rows.push(await expectErr('sub-millisecond precision is refused', `insert into ${B}.inbox(namespace, delivery_id, subject_ref, payload_digest, kind, signed_at, environment) values ('store.sandbox','z3','z',repeat('a',64),'k','2026-01-01 00:00:00.0005+00','sandbox')`, [], '23514'));
    rows.push(await expectErr('a terminal state needs a processed time', `insert into ${B}.inbox(namespace, delivery_id, subject_ref, payload_digest, kind, signed_at, environment, state) values ('store.sandbox','z4','z',repeat('a',64),'k',date_trunc('milliseconds', now()),'sandbox','admitted')`, [], '23514'));
    rows.push(await expectErr('delivery identity is unique', `insert into ${B}.inbox(namespace, delivery_id, subject_ref, payload_digest, kind, signed_at, environment) values ('store.sandbox','N-1','dm1',repeat('b',64),'k',date_trunc('milliseconds', now()),'sandbox')`, [], '23505'));
    rows.push(await expectErr('a pending link needs a binding and an expiry', `insert into ${B}.identity_links(namespace, owner_user_id, state) values ('store.sandbox', '${o}', 'pending')`, [], '23514'));
    rows.push(await expectErr('one subject cannot belong to two owners', `insert into ${B}.identity_links(namespace, owner_user_id, state, binding_hash, subject_ref, activated_at) values ('store.sandbox', '${o}', 'active', repeat('c',64), 'dm1', date_trunc('milliseconds', now()))`, [], '23505'));
    rows.push(await expectErr('an active link cannot go back to pending', `update ${B}.identity_links set state = 'pending', subject_ref = null, activated_at = null, expires_at = now() where subject_ref = 'dm1'`, [], 'BILLING_LINK_IMMUTABLE'));
    rows.push(await expectErr('a link cannot change owner', `update ${B}.identity_links set owner_user_id = '${await makeUser(ctx, 122)}' where subject_ref = 'dm1'`, [], 'BILLING_LINK_IMMUTABLE'));
    rows.push(await expectErr('a segment cannot change', `update ${B}.fact_segments set seg_end = seg_end + interval '1 day' where subject_ref = 'dm1'`, [], 'BILLING_SEGMENT_IMMUTABLE'));
    rows.push(await expectErr('segments of one chain never overlap', `insert into ${B}.fact_segments(namespace, subject_ref, class, seg_start, seg_end, owner_user_id, ledger_event_id, upstream_event_id, item_id) values ('store.sandbox','dm1','paid','${at(5)}','${at(6)}','${o}','${seg.ledger_event_id}','overlap-key','${inboxRow.item_id}')`, [], 'BILLING_SEGMENT_OVERLAP'));
    rows.push(await expectErr('an empty segment is refused', `insert into ${B}.fact_segments(namespace, subject_ref, class, seg_start, seg_end, owner_user_id, ledger_event_id, upstream_event_id, item_id) values ('store.sandbox','dm1','paid','${at(50)}','${at(50)}','${o}','${seg.ledger_event_id}','empty-key','${inboxRow.item_id}')`, [], '23514'));
    const ev = await attempt(ctx, `insert into ${B}.evidence_log(item_id, namespace, kind, detail) values (null,'store.sandbox','probe','{}'::jsonb); update ${B}.evidence_log set kind = 'x' where kind = 'probe'`);
    rows.push({ label: 'evidence cannot be updated (after an insert in the same transaction)', pass: !ev.ok && /BILLING_EVIDENCE_IMMUTABLE/.test(ev.message), got: ev.ok ? 'accepted' : ev.message.slice(0, 60) });
    const evd = await attempt(ctx, `insert into ${B}.evidence_log(item_id, namespace, kind, detail) values (null,'store.sandbox','probe','{}'::jsonb); delete from ${B}.evidence_log where kind = 'probe'`);
    rows.push({ label: 'evidence cannot be deleted', pass: !evd.ok && /BILLING_EVIDENCE_IMMUTABLE/.test(evd.message), got: evd.ok ? 'accepted' : evd.message.slice(0, 60) });
    rows.push(await expectErr('a namespace configuration cannot be rewritten (only the switch)', `update ${B}.namespace_config set environment = 'production' where namespace = 'store.sandbox'`, [], 'BILLING_CONFIG_IMMUTABLE'));
    const sw = await attempt(ctx, `update ${B}.namespace_config set enabled = false where namespace = 'store.sandbox'`);
    rows.push({ label: 'the operator switch may change', pass: sw.ok, got: sw.ok ? 'ok' : sw.message });
    rows.push(await expectErr('namespace format is enforced', `insert into ${B}.namespace_config(namespace, environment, registered_at, max_period_ms) values ('A','sandbox',now(),1)`, [], '23514'));
    rows.push(await expectErr('a zero period limit is refused', `insert into ${B}.namespace_config(namespace, environment, registered_at, max_period_ms) values ('zzz.sandbox','sandbox',date_trunc('milliseconds', now()),0)`, [], '23514'));
    rows.push(await expectErr('the period limit has no default', `insert into ${B}.namespace_config(namespace, environment, registered_at) values ('yyy.sandbox','sandbox',date_trunc('milliseconds', now()))`, [], '23502'));
    const ok = leaks.length === 0 && refused.length > 150 && allRefusedAs42501 && rows.every(r => r.pass);
    return R(ok, { checkedRoles: roles, refusedCount: refused.length, leaks, nonPermissionRefusals: refused.filter(x => x[2] !== '42501'), rows });
  }
});
// <<END:perm>>
// <<PART:handlers>>
// ---- the DI handlers against the real database, links, and the explicit refusal of every unsupported kind ------------------------------------------------------------------------------------------------
const bodyOf = async res => ({ status: res.status, body: await res.text() });
Object.assign(GATES, {
  async P09_RECEIVE_HANDLER_WITH_THE_DATABASE_STORES_ONLY_WHAT_WAS_VERIFIED_AND_NEVER_ACKS_BEFORE_COMMIT(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const out = {};
    const two = [obs(ns, 'ra', 'R-1', 'paid_period', atMs(0), atMs(30)), obs(ns, 'rb', 'R-2', 'trial_period', atMs(0), atMs(14))];
    const spy = []; const okRes = await bodyOf(await ingest().receiveDelivery(signedRequest(ns, two), receiveDeps(ctx, ns, { spy })));
    out.success = { ...okRes, calls: spy, stored: (await inboxRows(ctx)).map(r => [r.subject_ref, r.state]), ledger: await count(ctx, `${ENT}.entitlement_events`) };
    const dup = await bodyOf(await ingest().receiveDelivery(signedRequest(ns, two), receiveDeps(ctx, ns)));
    out.duplicate = { ...dup, stored: (await inboxRows(ctx)).length };
    const before = (await inboxRows(ctx)).length; const spy2 = [];
    const bad = await bodyOf(await ingest().receiveDelivery(signedRequest(ns, two, { sig: 'e'.repeat(64) }), receiveDeps(ctx, ns, { spy: spy2 })));
    out.badSignature = { ...bad, calls: spy2, stored: (await inboxRows(ctx)).length - before };
    const inv = await bodyOf(await ingest().receiveDelivery(signedRequest(ns, [{ ...two[0], deliveryId: 'R-9', token: 'secret' }]), receiveDeps(ctx, ns)));
    out.invalid = { ...inv, stored: (await inboxRows(ctx)).length - before };
    const confl = await bodyOf(await ingest().receiveDelivery(signedRequest(ns, [{ ...two[0], payloadDigest: sha256hex('different') }]), receiveDeps(ctx, ns)));
    out.conflict = { ...confl, evidence: (await evidenceRows(ctx, "kind='delivery_conflict'")).length, stored: (await inboxRows(ctx)).length - before };
    await ctx.g.query(ctx.su, `update ${B}.namespace_config set enabled = false where namespace = $1`, [ns]);
    const off = await bodyOf(await ingest().receiveDelivery(signedRequest(ns, [obs(ns, 'rc', 'R-3', 'paid_period', atMs(0), atMs(30)), obs(ns, 'rd', 'R-4', 'paid_period', atMs(0), atMs(30))]), receiveDeps(ctx, ns)));
    out.disabled = { ...off, stored: (await inboxRows(ctx)).length - before };
    await ctx.g.query(ctx.su, `update ${B}.namespace_config set enabled = true where namespace = $1`, [ns]);
    // opposite item order, same keys, ten pairs at once: the handler's deterministic order means no deadlock
    const clients = []; for (let k = 0; k < 20; k++) clients.push(await ctx.open('bill_ingress'));
    const pair = [obs(ns, 'pa', 'P-1', 'paid_period', atMs(0), atMs(30)), obs(ns, 'pb', 'P-2', 'paid_period', atMs(0), atMs(30))];
    const runs = await Promise.all(clients.map((c, k) => settle(ingest().receiveDelivery(signedRequest(ns, k % 2 ? [...pair].reverse() : pair), receiveDeps(ctx, ns, { client: c })).then(bodyOf))));
    out.pairs = { statuses: runs.map(r => r.ok ? r.v.status : r.code), stored: (await inboxRows(ctx, "delivery_id like 'P-%'")).length };
    const textBodies = [okRes.body, dup.body, bad.body, inv.body, confl.body, off.body];
    const leak = textBodies.some(t => /ra|rb|sub|owner|P-1|R-1/.test(t.replace(/"status":"[a-z_]+"/, '')));
    const ok = out.success.status === 200 && out.success.body === '{"status":"received"}' && same(out.success.calls, ['ingestDelivery', 'ingestDelivery']) && out.success.stored.length === 2 && out.success.ledger === 0
      && out.duplicate.status === 200 && out.duplicate.stored === 2
      && out.badSignature.status === 401 && out.badSignature.calls.length === 0 && out.badSignature.stored === 0
      && out.invalid.status === 422 && out.invalid.stored === 0
      && out.conflict.status === 409 && out.conflict.evidence === 1 && out.conflict.stored === 0
      && out.disabled.status === 503 && out.disabled.stored === 0
      && out.pairs.statuses.every(s => s === 200) && out.pairs.stored === 2 && !leak;
    return R(ok, out);
  },

  async P10_PURCHASE_INTENT_ACTIVATION_AND_UNMAPPED_SUBJECTS_WITH_THE_DATABASE(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns);
    const o = await makeUser(ctx, 131);
    const out = {};
    const t = pgTransport(W.ingress.c);
    const raw = 'purchase-binding-value-' + 'x'.repeat(24);
    const mk = (over = {}) => ({ enabled: true, namespace: ns, authenticate: async () => ({ userId: o }), randomBindingValue: () => raw, sha256Hex: sha256hex, now: () => Date.now(), ttlMs: 3600000, transport: t, ...over });
    const res = await ingest().createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: '{}' }), mk());
    const j = await res.json();
    const link = (await q(ctx, `select owner_user_id, state, binding_hash, subject_ref, expires_at from ${B}.identity_links`))[0];
    const everywhere = (await q(ctx, `select (select count(*)::int from ${B}.identity_links l where row_to_json(l)::text like '%' || $1 || '%') + (select count(*)::int from ${B}.inbox i where row_to_json(i)::text like '%' || $1 || '%') + (select count(*)::int from ${B}.evidence_log e where row_to_json(e)::text like '%' || $1 || '%') n`, [raw]))[0].n;
    out.intent = { status: res.status, bindingReturned: j.binding === raw, link: { ...link, expires_at: undefined }, rawStoredAnywhere: everywhere };
    const refusedBody = await ingest().createPurchaseIntent(new Request('http://l/x', { method: 'POST', body: JSON.stringify({ ownerUserId: o }) }), mk());
    out.bodyOwnerRefused = refusedBody.status;
    // the provider echoes only the HASH of the binding: the subject becomes linked to the intent's owner, and the first fact is admitted
    await feedAll(ctx, ns, [obs(ns, 'fresh-sub', 'K-1', 'paid_period', atMs(0), atMs(30), { bindingHash: sha256hex(raw) })]);
    const nc1 = (await ctx.g.query(W.producer.c, `select ${B}.next_candidate($1) s`, [ns])).rows[0].s;
    await drain(ctx, W.producer);
    const linked = (await q(ctx, `select state, subject_ref, owner_user_id from ${B}.identity_links`))[0];
    out.activation = { candidateOffered: nc1 !== null, linked, ledger: (await ledgerRows(ctx, o)).length };
    // an unmapped subject without any intent waits (mapping_pending), is not offered again, and is processed once a link exists
    await feedAll(ctx, ns, [obs(ns, 'orphan', 'K-2', 'paid_period', atMs(0), atMs(30))]);
    await drain(ctx, W.producer);
    const waiting = await itemOf(ctx, 'orphan', 'K-2'); const offeredWhileUnmapped = (await ctx.g.query(W.producer.c, `select ${B}.next_candidate($1) s`, [ns])).rows[0].s;
    const o2 = await makeUser(ctx, 132); await activeLink(ctx, ns, o2, 'orphan');
    const offeredAfter = (await ctx.g.query(W.producer.c, `select ${B}.next_candidate($1) s`, [ns])).rows[0].s;
    await drain(ctx, W.producer);
    const done = await itemOf(ctx, 'orphan', 'K-2');
    out.unmapped = { waiting: [waiting.state, waiting.reason], offeredWhileUnmapped, offeredAfter: offeredAfter === waiting.item_id, done: done.state, ledger: (await ledgerRows(ctx, o2)).length };
    // an expired intent never starves the queue: the item stays mapping_pending and is not offered
    const hExp = sha256hex('expired-binding');
    await ctx.g.query(ctx.su, `insert into ${B}.identity_links(namespace, owner_user_id, state, binding_hash, expires_at) values ($1,$2,'pending',$3, date_trunc('milliseconds', now()) + interval '1500 milliseconds')`, [ns, o2, hExp]);
    await sleep(1800);
    await feedAll(ctx, ns, [obs(ns, 'late-sub', 'K-3', 'paid_period', atMs(0), atMs(30), { bindingHash: hExp })]);
    await drain(ctx, W.producer);
    const ex = await itemOf(ctx, 'late-sub', 'K-3'); const offeredExpired = (await ctx.g.query(W.producer.c, `select ${B}.next_candidate($1) s`, [ns])).rows[0].s;
    out.expired = { state: ex.state, reason: ex.reason, offered: offeredExpired };
    const ok = out.intent.status === 200 && out.intent.bindingReturned && out.intent.link.state === 'pending' && out.intent.link.binding_hash === sha256hex(raw) && out.intent.link.subject_ref === null && out.intent.link.owner_user_id === o && out.intent.rawStoredAnywhere === 0
      && out.bodyOwnerRefused === 422
      && out.activation.candidateOffered && out.activation.linked.state === 'active' && out.activation.linked.subject_ref === 'fresh-sub' && out.activation.linked.owner_user_id === o && out.activation.ledger === 1
      && same(out.unmapped.waiting, ['mapping_pending', 'no_link']) && out.unmapped.offeredWhileUnmapped === null && out.unmapped.offeredAfter && out.unmapped.done === 'admitted' && out.unmapped.ledger === 1
      && out.expired.state === 'mapping_pending' && out.expired.reason === 'intent_expired' && out.expired.offered === null;
    return R(ok, out);
  },

  async P11_UNSUPPORTED_KINDS_ARE_QUARANTINED_WITH_EVIDENCE_AND_NO_PAYMENT_POLICY_IS_INVENTED(ctx) {
    const ns = 'store.sandbox';
    const W = await nsSetup(ctx, ns, { config: { maxPeriodMs: 100 * DAY } });
    const o = await makeUser(ctx, 141); for (const s of ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11']) await activeLink(ctx, ns, o, s);
    const kinds = ['grace_period', 'billing_retry', 'refund', 'chargeback', 'paused', 'price_change', 'PAID_PERIOD', 'upgrade'];
    const list = kinds.map((k, i) => obs(ns, 'u' + (i + 1), 'U-' + k, k, atMs(0), atMs(30)));
    list.push(obs(ns, 'u9', 'U-env', 'paid_period', atMs(0), atMs(30), { environment: 'production' }));
    list.push(obs(ns, 'u10', 'U-long', 'paid_period', atMs(0), atMs(101)));
    list.push(obs(ns, 'u11', 'U-missing', 'paid_period', null, null));
    const rev = obs(ns, 'u1', 'U-rev', 'revocation', null, null), non = obs(ns, 'u2', 'U-non', 'non_entitling', null, null, { reasonCode: 'price_change_notice' });
    await feedAll(ctx, ns, [...list, rev, non]); await drain(ctx, W.producer, 40);
    const items = await inboxRows(ctx); const by = id => items.find(i => i.delivery_id === id);
    const ev = await evidenceRows(ctx);
    const quarantined = [...kinds.map(k => 'U-' + k), 'U-env', 'U-long', 'U-missing'];
    const reasons = Object.fromEntries(quarantined.map(id => [id, [by(id).state, by(id).reason]]));
    const wantReason = id => id === 'U-env' ? 'environment_mismatch' : id === 'U-long' ? 'period_too_long' : id === 'U-missing' ? 'period_missing' : 'unsupported_kind';
    const allQ = quarantined.every(id => by(id).state === 'quarantined' && by(id).reason === wantReason(id));
    const evKeys = [...new Set(ev.flatMap(e => Object.keys(e.detail)))].sort();
    // a configured, enabled namespace whose producer is NOT registered in ENT0: the item is reported blocked and nothing at all changes (no state, no evidence, no fact)
    await configure(ctx, 'noreg.sandbox'); await makeRole(ctx, 'bill_p_noreg', grantFns('bill_p_noreg', ['next', 'process', 'attempt']));
    await activeLink(ctx, 'noreg.sandbox', o, 'nr1'); await feedAll(ctx, 'noreg.sandbox', [obs('noreg.sandbox', 'nr1', 'NR-1', 'paid_period', atMs(0), atMs(30))]);
    const nrc = await ctx.open('bill_p_noreg'); const nrBefore = (await inboxRows(ctx, 'subject_ref=$1', ['nr1']))[0]; const nrRes = await pgTransport(nrc).transaction(tx => tx.processItem(nrBefore.item_id)); const nrAfter = (await inboxRows(ctx, 'subject_ref=$1', ['nr1']))[0];
    const nrEvidence = (await evidenceRows(ctx, 'namespace=$1', ['noreg.sandbox'])).length;
    const shape1 = await attempt(ctx, `select ${B}.ingest_delivery('store.sandbox','bad1','x',repeat('a',64),'paid_period','${at(2)}'::timestamptz,'${at(1)}'::timestamptz,date_trunc('milliseconds', now()),'sandbox',null,null)`);
    const shape2 = await attempt(ctx, `select ${B}.ingest_delivery('store.sandbox','bad2','x',repeat('a',64),'paid_period','2026-01-01 00:00:00.0005+00'::timestamptz,'2026-01-02'::timestamptz,date_trunc('milliseconds', now()),'sandbox',null,null)`);
    const classes = (await q(ctx, `select distinct class from ${ENT}.entitlement_events`)).map(r => r.class);
    const ok = allQ && by('U-rev').state === 'recorded_only' && by('U-non').state === 'dismissed' && by('U-non').reason === 'price_change_notice'
      && (await ledgerRows(ctx, o)).length === 0 && (await count(ctx, `${B}.fact_segments`)) === 0 && ev.length === quarantined.length && same(evKeys, ['delivery_id', 'environment', 'kind'])
      && quarantined.every(id => items.some(i => i.delivery_id === id && i.kind === by(id).kind)) && classes.length === 0
      && !shape1.ok && shape1.code === '22023' && !shape2.ok && shape2.code === '22023'
      && nrRes.outcome === 'blocked' && nrRes.reason === 'ENT_PRODUCER_NOT_AUTHORIZED' && nrAfter.state === nrBefore.state && nrAfter.attempts === nrBefore.attempts && nrEvidence === 0;
    return R(ok, { reasons, rev: by('U-rev').state, non: [by('U-non').state, by('U-non').reason], evidence: ev.length, evKeys, shape: [shape1.code, shape2.code], blocked: [nrRes.outcome, nrAfter.state, nrEvidence], ledger: await count(ctx, `${ENT}.entitlement_events`) });
  }
});
// <<END:handlers>>
// <<PART:migr>>
// ---- migration refusals, rollback and concurrent drift ------------------------------------------------------------------------------------------------------------------------------------------------------
async function persistedNone(ctx) {
  return (await ctx.g.query(ctx.su, `select (select count(*)::int from pg_roles where rolname in ($1,$2)) roles, to_regnamespace('${B}') is not null schema, (select count(*)::int from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)) members`, [BILLING_OWNER, BILLING_BUILDER])).rows[0];
}
const noneLeft = p => p.roles === 0 && !p.schema && p.members === 0;
const membersJson = async ctx => JSON.stringify((await ctx.g.query(ctx.su, "select roleid,member,grantor from pg_auth_members where roleid::regrole::text !~ '^(authenticated|anon|service_role)' order by 1,2,3")).rows);
async function expectRefusal(cl, label, prepare, expectPrefix, { actor = 'su', settings = [], preexisting = false, source } = {}) {
  return billingFresh(cl, label, async ctx => {
    await prepare(ctx);
    const before = await persistedNone(ctx), members0 = await membersJson(ctx), items1 = await catalogItems(ctx);
    const runner = actor === 'su' ? ctx.su : actor === 'op' ? ctx.op : await ctx.open(actor);
    const notices = []; const onN = m => notices.push(m.message); runner.on('notice', onN);
    let error = null;
    try { await ctx.g.query(runner, ctx.billingSource); } catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await runner.query('ROLLBACK').catch(() => {}); }
    runner.removeListener('notice', onN);
    const after = await persistedNone(ctx), items2 = await catalogItems(ctx), d = itemsDiff(items1, items2);
    const stateUnchanged = same(before, after) && members0 === await membersJson(ctx) && d.added.length + d.removed.length + d.changed.length === 0;
    const pass = !!error && error.message.startsWith(expectPrefix) && stateUnchanged && (preexisting || noneLeft(after)) && !notices.includes('BILLING_DDL_BOUNDARY');
    return { label, expectPrefix, error: error && { code: error.code, message: error.message.slice(0, 120) }, stateUnchanged, diff: d, pass };
  }, { apply: false, settings, billing: source });
}
export async function migrationRefusals(cl, source = billingSource()) {
  const cases = [];
  const refuse = (label, prepare, prefix, opts = {}) => expectRefusal(cl, label, prepare, prefix, { ...opts, source });
  cases.push(await refuse('R01a-actor-db-owner-createrole-not-superuser', async () => {}, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actor: 'op' }));
  cases.push(await refuse('R01b-actor-createrole-not-db-owner', async ctx => { ctx.extraRoles.add('bill_creator'); await ctx.g.query(ctx.su, 'create role bill_creator login createrole'); await ctx.g.query(ctx.su, 'grant connect on database ' + ctx.name + ' to bill_creator'); }, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actor: 'bill_creator' }));
  for (const role of ['pgbouncer', 'supabase_auth_admin', 'dashboard_user', 'supabase_read_only_user', 'supabase_etl_admin']) {
    cases.push(await refuse('R02-marker-role-' + role, async ctx => { ctx.extraRoles.add(role); await ctx.g.query(ctx.su, `create role ${role} nologin`); }, 'BILLING_PLATFORM_APPLY_NOT_AUTHORIZED role:' + role));
  }
  cases.push(await refuse('R03-marker-history-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema supabase_migrations'); }, 'BILLING_PLATFORM_APPLY_NOT_AUTHORIZED schema:supabase_migrations'));
  cases.push(await refuse('R04-marker-supautils-setting', async ctx => { await ctx.su.query("select set_config('supautils.reserved_roles','bill_probe',false)"); }, 'BILLING_PLATFORM_APPLY_NOT_AUTHORIZED setting:supautils'));
  for (const guc of ['tastkind.r0b_target', 'tastkind.r0b_manifest', 'tastkind.r0b_fixture_nonce']) cases.push(await refuse('R05-binding-setting-' + guc.split('.')[1], async ctx => { await ctx.su.query(`select set_config('${guc}','x',false)`); }, 'BILLING_BINDINGS_NOT_SUPPORTED'));
  cases.push(await refuse('R06a-preexisting-billing-role', async ctx => { ctx.extraRoles.add(BILLING_OWNER); await ctx.g.query(ctx.su, `create role ${BILLING_OWNER} nologin`); }, 'BILLING_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('R06b-preexisting-billing-schema', async ctx => { await ctx.g.query(ctx.su, `create schema ${B}`); }, 'BILLING_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('R07a-unapproved-predefined-data-member', async ctx => { ctx.extraRoles.add('bill_reader2'); await ctx.g.query(ctx.su, 'create role bill_reader2 nologin'); await ctx.g.query(ctx.su, 'grant pg_read_all_data to bill_reader2'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('R07b-runtime-reaches-management-identity', async ctx => { await ctx.g.query(ctx.su, 'grant postgres to authenticated with inherit false, set false'); ctx.cleanups.push('revoke postgres from authenticated'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  for (const [what, ddl] of [['capture', 'drop schema retention_capture cascade'], ['entitlement', `drop schema ${ENT} cascade`], ['foundation', 'drop schema retention_internal cascade'], ['acquisition', `drop schema ${ACQ} cascade`], ['seal', 'drop schema retention_seal cascade']]) cases.push(await refuse('R08-missing-' + what + '-predecessor', async ctx => { await ctx.g.query(ctx.su, ddl); }, 'BILLING_PREDECESSORS_MISSING'));
  const drift = [
    ['anchors-granted-to-runtime', 'grant select on retention_capture.detail_capture_anchors to anon'], ['capture-schema-granted', 'grant usage on schema retention_capture to authenticated'],
    ['state-at-granted-to-runtime', `grant execute on function ${ENT_FN.state} to authenticated`], ['entitlement-schema-granted', `grant usage on schema ${ENT} to anon`],
    ['admit-already-granted', `grant execute on function ${ENT_FN.admit} to authenticated`], ['advance-already-granted', `grant execute on function ${ENT_FN.advance} to anon`],
    ['extra-anchor-policy', 'create policy extra_p on retention_capture.detail_capture_anchors for select to anon using (true)'], ['anchor-owner-changed', 'alter table retention_capture.detail_capture_anchors owner to postgres'],
    ['state-at-owner-changed', `alter function ${ENT_FN.state} owner to postgres`], ['admit-owner-changed', `alter function ${ENT_FN.admit} owner to postgres`],
    ['producers-granted-to-runtime', `grant select on ${ENT}.producers to anon`], ['seal-registry-select-revoked', `revoke select on ${ENT}.producers from consumer_retention_seal_owner`],
    ['seal-policy-dropped', `drop policy seal_owner_select on ${ENT}.producers`], ['acquisition-resolver-grant-revoked', `revoke execute on function ${ENT_FN.state} from consumer_retention_acquisition_owner`]
  ];
  for (const [label, ddl] of drift) cases.push(await refuse('R09-drift-' + label, async ctx => { await ctx.g.query(ctx.su, ddl); }, 'BILLING_PREDECESSOR_DRIFT'));
  return R(cases.every(c => c.pass), cases);
}
const FAULT_ANCHORS = [
  ['builder-created', 'CREATE ROLE consumer_retention_billing_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;'],
  ['owner-granted', "EXECUTE pg_catalog.format('GRANT consumer_retention_billing_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);\nEND $$;"],
  ['tables-built', 'CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON retention_billing.evidence_log\n FOR EACH ROW EXECUTE FUNCTION retention_billing.reject_evidence_change();'],
  ['functions-owned', 'ALTER FUNCTION retention_billing.record_attempt(uuid, text) OWNER TO consumer_retention_billing_owner;'],
  ['schema-seam-granted', 'GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_billing_owner;'],
  ['admit-seam-granted', 'GRANT EXECUTE ON FUNCTION retention_entitlement.admit_entitlement_event(uuid, text, text, text, timestamptz, timestamptz, bigint) TO consumer_retention_billing_owner;'],
  ['builder-dropped', 'DROP ROLE consumer_retention_billing_builder;']
];
export async function migrationRollbackAndDrift(cl, installSource = billingSource()) {
  const out = [];
  for (const [label, anchor] of FAULT_ANCHORS) {
    if (installSource.split(anchor).length !== 2) throw Error('SETUP_FAULT_ANCHOR ' + label);
    const mutant = installSource.replace(anchor, () => anchor + '\nSELECT 1/0;');
    out.push(await billingFresh(cl, 'D01-fault-' + label, async ctx => {
      const before = await membersJson(ctx), items1 = await catalogItems(ctx);
      const a = await billingApply(ctx, mutant);
      const p = await persistedNone(ctx), d = itemsDiff(items1, await catalogItems(ctx));
      return { label, error: a.error, boundary: a.boundary, persisted: p, diff: d, pass: a.error?.code === '22012' && a.boundary && noneLeft(p) && before === await membersJson(ctx) && d.added.length + d.removed.length + d.changed.length === 0 };
    }, { apply: false, billing: installSource }));
  }
  const drifts = [
    ['role-created', async ctx => { ctx.extraRoles.add('bill_drift_role'); await ctx.g.query(ctx.su, 'create role bill_drift_role nologin'); }, 'BILLING_POST_GUARD_DRIFT'],
    ['public-table-acl', async ctx => { await ctx.g.query(ctx.su, 'grant select on public.restaurants to anon'); }, 'BILLING_POST_GUARD_DRIFT'],
    ['membership', async ctx => { await ctx.g.query(ctx.su, 'grant anon to service_role'); ctx.cleanups.push('revoke anon from service_role'); }, 'BILLING_POST_GUARD_DRIFT'],
    ['extra-anchor-policy', async ctx => { await ctx.g.query(ctx.su, 'create policy drift_p on retention_capture.detail_capture_anchors for select to anon using (true)'); }, 'BILLING_POST_GUARD_DRIFT'],
    ['state-at-granted-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT_FN.state} to authenticated`); }, 'BILLING_POST_GUARD_DRIFT'],
    ['advance-granted-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT_FN.advance} to anon`); }, 'BILLING_POST_GUARD_DRIFT'],
    ['producers-granted-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant select on ${ENT}.producers to anon`); }, 'BILLING_POST_GUARD_DRIFT'],
    ['admit-granted-to-runtime-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT_FN.admit} to authenticated`); }, 'BILLING_SEAM_STATE_MISMATCH'],
    ['entitlement-schema-granted-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to anon`); }, 'BILLING_SEAM_STATE_MISMATCH']
  ];
  for (const [label, drift, expect] of drifts) {
    out.push(await billingFresh(cl, 'D02-drift-' + label, async ctx => {
      await installProbe(ctx.su);
      const d0 = await ddlAttempts(ctx.su);
      const runner = await ctx.open('supabase_admin'); const locker = await ctx.open('supabase_admin');
      let error = null, paused = false;
      try {
        await locker.query('select pg_catalog.pg_advisory_lock($1)', [PROBE_PAUSE_LOCK]);
        const pending = ctx.g.query(runner, ctx.billingSource).then(() => null, e => ({ code: e.code, message: String(e.message) }));
        for (let i = 0; i < 200 && !paused; i++) { paused = (await ctx.su.query("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) w", [PROBE_PAUSE_LOCK])).rows[0].w; if (!paused) await sleep(100); }
        if (paused) await drift(ctx);
        await locker.query('select pg_catalog.pg_advisory_unlock($1)', [PROBE_PAUSE_LOCK]);
        error = await pending;
      } finally { await runner.query('ROLLBACK').catch(() => {}); }
      const p = await persistedNone(ctx);
      const attempts = (await ddlAttempts(ctx.su)) - d0;
      await ctx.su.query('revoke select on public.restaurants from anon').catch(() => {});
      return { label, expect, paused, error: error && { code: error.code, message: error.message.slice(0, 100) }, persisted: p, ddlAttempts: attempts, pass: paused && !!error && error.message.startsWith(expect) && attempts > 0 && noneLeft(p) };
    }, { apply: false, settings: ["tastkind_probe.pause = 'on'"], billing: installSource }));
  }
  return R(out.every(o => o.pass), out);
}
// <<END:migr>>
GATES.F01_FROZEN_SCOPE_AND_INVENTORY = async () => {
  const frozen = frozenProof(), inv = inventoryProof();
  const source = billingSource();
  const sourceSha = sha(Buffer.from(source, 'utf8'));
  const own = /expected=([0-9a-f]{64}) observed=%/.exec(source)?.[1];
  // Exact ORDERED new-migration tail: capture, ENT0, the origin demo migration, ENT1-A, (social x2 with the exact social record), ENT-R, then this ENT-F1 migration (20261021010000). No file is assumed last except by this exact order.
  const tail = [...withSocialTail([CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION, SEAL_MIGRATION], frozen.recoverySuccessor.social === 'record'), BILLING_MIGRATION];
  return R(frozen.violations.length === 0 && frozen.recoverySuccessor.state === 'ent0' && frozen.recoverySuccessor.demo === 'record' && frozen.recoverySuccessor.acq === 'record' && frozen.recoverySuccessor.seal === 'record' && frozen.recoverySuccessor.social === 'record' && frozen.recoverySuccessor.billing === 'record'
    && inv.migrationCount === 143 + tail.length && inv.baselineCount === 143 && same(inv.newPaths, tail) && inv.changedBaselineMigrations.length === 0 && inv.timestampLaterThanAll
    && sourceSha === BILLING_MIGRATION_SHA256 && own === BILLING_POST_DIGEST, { frozen, inv, tail, sourceSha, pinned: BILLING_MIGRATION_SHA256, postDigest: own });
};

// ---- gate selection contract (same contract and code as the accepted ENT0/ENT-R runners: TK_GATES takes full ids only) ---------------------------------------------------
GATES.F02_GATE_SELECTION_CONTRACT = async () => {
  const rows = selectionContractRows(); const o = {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-f02-')); const bad = {};
  const A = 'P09_RECEIVE_HANDLER_WITH_THE_DATABASE_STORES_ONLY_WHAT_WAS_VERIFIED_AND_NEVER_ACKS_BEFORE_COMMIT', Z = 'P13_PURE_CORE_AND_DI_LAYER_NO_DATABASE';
  const spawn = (env, extra) => { const r = child.spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...extra], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600000, maxBuffer: 16 << 20 }); return { code: r.status, out: String(r.stdout ?? '') }; };
  for (const [name, val] of [['unknown', 'NO_SUCH_GATE'], ['mixed', A + ',NO_SUCH_GATE'], ['empty', ''], ['separators', ','], ['prefix', 'P09'], ['trailing-comma', A + ',']]) {
    const r = spawn({ TK_GATES: val }, ['--pg-bin', path.join(tmp, 'no-such-pg', 'bin'), '--out', path.join(tmp, 'neg-' + name)]);
    bad[name] = { code: r.code, checkLines: (r.out.match(/^CHECK /gm) ?? []).length, outDirCreated: fs.existsSync(path.join(tmp, 'neg-' + name)) };
  }
  o.refusals = bad;
  const refused = Object.values(bad).every(b => b.code !== 0 && b.code !== null && b.checkLines === 0 && !b.outDirCreated);
  const pos = spawn({ TK_GATES: Z + ',' + A }, ['--pg-bin', options().bin, '--out', path.join(tmp, 'pos')]);
  const lines = pos.out.split(/\r?\n/).filter(l => /^CHECK /.test(l)).map(l => l.split(' ')[1]);
  let res = null; try { res = JSON.parse(fs.readFileSync(path.join(tmp, 'pos', 'result.json'), 'utf8')); } catch { /* reported below */ }
  o.positive = { code: pos.code, lines, status: res?.status, selected: res?.selected };
  const exact = pos.code === 0 && same(lines, [A, Z]) && res?.status === 'PASS' && same(res.selected, [A, Z]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup only */ }
  o.rows = rows.map(r => ({ name: r.name, ok: r.ok }));
  return R(rows.every(r => r.ok) && refused && exact, o);
};export const POSITIVE_IDS = Object.keys(GATES).filter(k => /^P\d\d_/.test(k)).sort();
export const NEGATIVE_IDS = ['N01_DIRECT_ACCESS_IS_REFUSED_FORGED_ROWS_ARE_REJECTED_AND_ROW_LEVEL_RULES_HOLD', 'N02_MIGRATION_PRECONDITIONS_FAIL_CLOSED', 'N03_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT'];
export const SUPPLEMENTARY_IDS = ['F01_FROZEN_SCOPE_AND_INVENTORY', 'F02_GATE_SELECTION_CONTRACT'];
export const ALL_GATE_IDS = [...POSITIVE_IDS, ...NEGATIVE_IDS, ...SUPPLEMENTARY_IDS];
export async function runGate(cl, id, source = billingSource()) {
  if (PURE_IDS.has(id)) return GATES[id]();
  if (id === 'N02_MIGRATION_PRECONDITIONS_FAIL_CLOSED') return migrationRefusals(cl, source);
  if (id === 'N03_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT') return migrationRollbackAndDrift(cl, source);
  if (id.startsWith('F0')) return GATES[id]();
  return billingFresh(cl, id, ctx => GATES[id](ctx), { billing: source });
}
export async function runSmoke({ bin, out, selected = ALL_GATE_IDS }) {
  const rec = recorder(out);
  const results = []; let blocked = null;
  const cl = await entCluster(bin, rec);
  try {
    for (const id of ALL_GATE_IDS) {
      if (!selected.includes(id)) continue;
      let r;
      try { r = await runGate(cl, id); }
      catch (e) { blocked = { id, message: String(e.message), stack: e.stack }; rec.write('check-' + id + '.json', { id, status: 'BLOCKED', error: blocked.message }); console.log('CHECK ' + id + ' BLOCKED ' + blocked.message.slice(0, 600)); break; }
      rec.write('check-' + id + '.json', { id, pass: r.pass, observed: r.observed });
      results.push({ id, pass: r.pass });
      console.log('CHECK ' + id + ' ' + (r.pass ? 'PASS' : 'FAIL'));
    }
  } finally { await cl.stop(); }
  const o = outcomeOf({ selected, results, blocked });
  rec.write('result.json', { status: o.status, exitCode: o.exitCode, selected, checks: results, failed: o.failed, notExecuted: o.missing, reason: o.reason ?? null, blocked });
  if (o.reason) console.error('BLOCKED ' + o.reason + ' not executed: ' + o.missing.join(','));
  return o.exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try { const sel = selectGates(process.env.TK_GATES, ALL_GATE_IDS); code = await runSmoke({ ...options(), selected: sel.ids }); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
