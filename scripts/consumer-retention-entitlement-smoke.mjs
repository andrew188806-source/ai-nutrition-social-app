#!/usr/bin/env node
// TastKind R0-B-ENT0 (R2) local acceptance gates (Owner-approved 2026-10-09; R1 contract revisions AP-1..AP-5 kept; AP-4 replaced by the R2 consistency contract: registry table lock + stamp-after-lock;
// decision OQ-1: a 14-day Premium trial is a Paid-level entitlement fact that is NOT a paid subscription). Disposable PostgreSQL 17 only; never a remote target. Gates are exported so the mutation harness runs
// the very same detectors against changed migration SQL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ROOT, MIGRATION, CAPTURE_SUCCESSOR, ENT0_MIGRATION, ENT0_MIGRATION_SHA256, DEMO_MIGRATION, recorder, cluster, baseline, sha, uuid, installProbe, ddlAttempts, PROBE_PAUSE_LOCK
} from './consumer-retention-persistence-smoke.mjs';
import { act, frozenProof, inventoryProof, options } from './consumer-retention-capture-smoke.mjs';

export { options };
export const ENT_SCHEMA = 'retention_entitlement';
export const ENT_OWNER = 'consumer_retention_entitlement_owner';
export const ENT_BUILDER = 'consumer_retention_entitlement_builder';
export const ENT_POST_DIGEST = 'aa4c8eee8bfb9aa29030ce602a43f58afea81b0c4fcbc9f49e2c957a3f0bd003';
export const entSource = () => fs.readFileSync(path.join(ROOT, 'supabase/migrations', ENT0_MIGRATION), 'utf8');

const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 1);
const at = (days, extraMs = 0) => new Date(T0 + days * DAY + extraMs).toISOString();
const digestOf = (owner, ns, up, cls, from, until, seq) => createHash('sha256').update('[' + [owner, ns, up, cls, from, until, seq].map(v => JSON.stringify(v)).join(', ') + ']', 'utf8').digest('hex');
const FN_SIGS = [
  ['admit_entitlement_event', 'uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint'],
  ['advance_entitlement_coverage', 'uuid, text, timestamp with time zone'],
  ['entitlement_state_at', 'uuid, timestamp with time zone']
];

// ---- cluster / template ---------------------------------------------------------------------------------
// Template = complete 142-migration baseline + the accepted R0-B foundation + the accepted R0-B-CAP capture migration. Never the ENT0 migration.
// Restart the disposable server with extra postmaster settings (the template stays on disk). Used to enable prepared transactions for the 2PC gate; all gates then run on that server.
export async function restartWith(cl, bin, extra) {
  for (const c of cl.clients) { try { await c.end(); } catch { /* already closed */ } }
  cl.clients.clear();
  const exe = path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'), data = path.join(cl.base, 'data');
  const o = fs.openSync(path.join(cl.base, 'restart.out'), 'w'), e = fs.openSync(path.join(cl.base, 'restart.err'), 'w'); let r;
  try { r = child.spawnSync(exe, ['-D', data, '-l', path.join(cl.base, 'postgres.log'), '-m', 'fast', '-w', 'restart', '-o', `-p ${cl.port} -c listen_addresses=127.0.0.1 -c fsync=off ${extra}`], { stdio: ['ignore', o, e], timeout: 90000 }); }
  finally { fs.closeSync(o); fs.closeSync(e); }
  if (r.status !== 0) throw Error('SETUP_RESTART ' + fs.readFileSync(path.join(cl.base, 'restart.err'), 'utf8') + ' ' + (r.error?.message ?? ''));
}
export async function entCluster(bin, rec) {
  const cl = await cluster(bin, rec);
  try {
    const db = await baseline(cl, rec, { legacy: true });
    await rec.query(db, fs.readFileSync(path.join(ROOT, 'supabase/migrations', MIGRATION), 'utf8'));
    await rec.query(db, fs.readFileSync(path.join(ROOT, 'supabase/migrations', CAPTURE_SUCCESSOR), 'utf8'));
    await db.end(); cl.clients.delete(db); await cl.admin.end(); cl.clients.delete(cl.admin);
    await restartWith(cl, bin, '-c max_prepared_transactions=8');
    cl.admin = await cl.connect('template1');
    cl.prepared = (await cl.admin.query('show max_prepared_transactions')).rows[0].max_prepared_transactions;
    if (cl.prepared !== '8') throw Error('SETUP_PREPARED_TRANSACTIONS ' + cl.prepared);
  } catch (e) { await cl.stop().catch(() => {}); throw e; } // teardown gap fixed: a failed setup no longer leaves a running server and its data directory behind
  let n = 0;
  const extraRoles = new Set();
  cl.fresh = async (label, fn, { ent = true, source = entSource(), settings = [] } = {}) => {
    const name = `ent_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 36)}_${n++}`;
    const g = recorder(path.join(rec.out, 'gates', label));
    await g.query(cl.admin, `create database ${name} template postgres owner postgres`);
    for (const s of settings) await g.query(cl.admin, `alter database ${name} set ${s}`);
    const op = await cl.connect(name, 'postgres'), su = await cl.connect(name);
    const opened = new Set();
    const open = async (user = 'supabase_admin') => { const c = await cl.connect(name, user); cl.clients.delete(c); c.on('error', () => {}); opened.add(c); return c; };
    const notices = [];
    op.on('notice', m => notices.push(m.message));
    const ctx = { cl, g, op, su, open, name, notices, extraRoles, source, rec, cleanups: [] };
    try {
      if (ent) {
        ctx.pre = await fingerprint(ctx);
        ctx.apply = await tryApply(ctx, source);
        if (ctx.apply.error) throw Error('SETUP_ENT_APPLY ' + JSON.stringify(ctx.apply.error));
        ctx.post = await fingerprint(ctx);
      }
      return await fn(ctx);
    } finally {
      for (const c of opened) await c.end().catch(() => {});
      for (const c of [op, su]) { await c.end().catch(() => {}); cl.clients.delete(c); }
      await rec.query(cl.admin, 'select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where datname=$1 and pid<>pg_catalog.pg_backend_pid()', [name]);
      await rec.query(cl.admin, `drop database ${name}`);
      for (const sql of ctx.cleanups.reverse()) await rec.query(cl.admin, sql).catch(() => {});
      for (const role of [ENT_OWNER, ENT_BUILDER, ...extraRoles]) {
        if ((await rec.query(cl.admin, 'select 1 from pg_roles where rolname=$1', [role])).rowCount) await rec.query(cl.admin, `drop role "${role}"`);
      }
      extraRoles.clear();
    }
  };
  return cl;
}
export async function tryApply(ctx, sql) {
  const before = ctx.notices.length;
  let error = null;
  try { await ctx.g.query(ctx.op, sql); }
  catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await ctx.op.query('ROLLBACK').catch(() => {}); }
  return { error, notices: ctx.notices.slice(before), boundary: ctx.notices.slice(before).includes('ENT_DDL_BOUNDARY') };
}

// Catalog fingerprint of EVERYTHING outside the new schema and the two new roles: any change to a predecessor object (meal-save RPCs, tables, triggers, policies,
// ACLs, memberships, default privileges) changes one of these digests.
export async function fingerprint(ctx) {
  const scope = "n.nspname !~ '^pg_' and n.nspname not in ('information_schema','retention_entitlement')";
  let chain = Promise.resolve(); // one query at a time on the shared client
  const one = (label, text) => (chain = chain.then(async () => [label, (await ctx.g.query(ctx.su, text)).rows[0].d]));
  const roleOk = "r.rolname not in ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')";
  const out = await Promise.all([
    one('proc', `select md5(coalesce(string_agg(format('%s.%s(%s) owner=%s acl=%s cfg=%s def=%s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner), p.proacl, p.proconfig, md5(pg_get_functiondef(p.oid))), E'\\n' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), '')) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${scope} and p.prokind in ('f','p')`),
    one('class', `select md5(coalesce(string_agg(format('%s.%s k=%s owner=%s acl=%s rls=%s/%s', n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner), c.relacl, c.relrowsecurity, c.relforcerowsecurity), E'\\n' order by n.nspname, c.relname), '')) d from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${scope}`),
    one('columns', `select md5(coalesce(string_agg(format('%s.%s.%s %s %s', n.nspname, c.relname, a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull), E'\\n' order by n.nspname, c.relname, a.attnum), '')) d from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where ${scope} and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v','m','p')`),
    one('policy', `select md5(coalesce(string_agg(format('%s.%s %s %s %s %s %s %s', n.nspname, c.relname, p.polname, p.polcmd, p.polpermissive, p.polroles, pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid)), E'\\n' order by n.nspname, c.relname, p.polname), '')) d from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where ${scope}`),
    one('trigger', `select md5(coalesce(string_agg(format('%s.%s %s %s', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid)), E'\\n' order by n.nspname, c.relname, t.tgname), '')) d from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and ${scope}`),
    one('constraint', `select md5(coalesce(string_agg(format('%s.%s %s %s', n.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid)), E'\\n' order by n.nspname, c.relname, k.conname), '')) d from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where ${scope}`),
    one('namespace', `select md5(coalesce(string_agg(format('%s owner=%s acl=%s', n.nspname, pg_get_userbyid(n.nspowner), n.nspacl), E'\\n' order by n.nspname), '')) d from pg_namespace n where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' and n.nspname <> 'retention_entitlement'`),
    one('default_acl', `select md5(coalesce(string_agg(format('%s %s %s %s', pg_get_userbyid(d.defaclrole), d.defaclnamespace, d.defaclobjtype, d.defaclacl), E'\\n' order by d.defaclrole, d.defaclnamespace, d.defaclobjtype), '')) d from pg_default_acl d where pg_get_userbyid(d.defaclrole) not in ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')`),
    one('roles', `select md5(coalesce(string_agg(format('%s %s %s %s %s %s %s', r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcanlogin, r.rolbypassrls, r.rolconfig), E'\\n' order by r.rolname), '')) d from pg_roles r where ${roleOk}`),
    one('members', `select md5(coalesce(string_agg(format('%s>%s by %s %s %s', pg_get_userbyid(m.roleid), pg_get_userbyid(m.member), pg_get_userbyid(m.grantor), m.inherit_option, m.set_option), E'\\n' order by m.roleid, m.member, m.grantor), '')) d from pg_auth_members m where pg_get_userbyid(m.roleid) not in ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder') and pg_get_userbyid(m.member) not in ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder') and pg_get_userbyid(m.grantor) not in ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')`),
    one('event_triggers', `select md5(coalesce(string_agg(format('%s %s %s', e.evtname, e.evtevent, e.evtfoid), E'\\n' order by e.evtname), '')) d from pg_event_trigger e`)
  ]);
  return Object.fromEntries(out);
}

// ---- helpers ------------------------------------------------------------------------------------------------
const q = (ctx, text, v) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
// Fixture only: registry rows (and the privileged rows they imply) are written in session_replication_role=replica so the R1 registry guards (never retroactive, 5 s commit bound) do not forbid test instants in the past.
// The guards themselves are exercised WITHOUT this bypass in P16, N13, N14, N15, N17 and N18.
async function regWrite(ctx, text, values = []) { await ctx.su.query('begin'); try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); } catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; } }
const count = async (ctx, table, where = 'true') => (await q(ctx, `select count(*)::int n from ${table} where ${where}`))[0].n;
const call = async (c, text, v = []) => {
  try { const r = await c.query(text, v); return { ok: true, value: r.rows[0]?.s }; }
  catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message) }; }
};
async function makeUser(ctx, n) { await ctx.g.query(ctx.su, 'insert into auth.users(id,email) values($1,$2)', [uuid(n), `ent${n}@synthetic.invalid`]); return uuid(n); }
// Test-only registration (superuser in a disposable database). The migration itself registers nobody and grants EXECUTE to nobody.
async function makeProducer(ctx, ns, { role = 'ent_p_' + ns.replace(/[^a-z0-9]/g, '_'), registeredAt = at(-400), retiredAt = null, grant = true } = {}) {
  ctx.extraRoles.add(role);
  await ctx.g.query(ctx.su, `create role ${role} login`);
  if (grant) {
    await ctx.g.query(ctx.su, `grant usage on schema ${ENT_SCHEMA} to ${role}`);
    for (const [fn, args] of FN_SIGS) await ctx.g.query(ctx.su, `grant execute on function ${ENT_SCHEMA}.${fn}(${args}) to ${role}`);
  }
  await regWrite(ctx, `insert into ${ENT_SCHEMA}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,$4::timestamptz)`, [ns, role, registeredAt, retiredAt]);
  return { ns, role, c: await ctx.open(role) };
}
const admit = (p, owner, up, cls, from, until, seq = null, ns = p.ns) =>
  call(p.c, `select ${ENT_SCHEMA}.admit_entitlement_event($1::uuid,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::bigint) s`, [owner, ns, up, cls, from, until, seq]);
const advance = (p, owner, through, ns = p.ns) =>
  call(p.c, `select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,$2,$3::timestamptz) s`, [owner, ns, through]);
const stateAt = async (ctx, owner, instant) => ctx.g.query(ctx.su, `select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [owner, instant]).then(r => r.rows[0].s, e => ({ state: 'ERROR', basis: null, reason: e.code ?? String(e.message).slice(0, 80), evidence: { events: [], coverage: [] }, policy: null, error: String(e.message).slice(0, 120) }));
const view = s => ({ state: s.state, basis: s.basis, reason: s.reason, events: s.evidence.events });
const is = (s, state, basis = null, reason = null) => s.state === state && s.basis === basis && s.reason === reason;
const eventRows = (ctx, owner) => q(ctx, `select e.event_id, e.namespace, e.upstream_event_id, e.class, e.valid_from, e.valid_until, e.source_sequence, e.semantic_digest, e.admitted_at from ${ENT_SCHEMA}.entitlement_events e where e.owner_user_id=$1 order by e.upstream_event_id`, [owner]);

export const GATES = {};
Object.assign(GATES, {
  async P01_EMPTY_REGISTRY_IS_UNKNOWN_NEVER_FREE(ctx) {
    const owner = await makeUser(ctx, 1);
    const tables = { producers: await count(ctx, `${ENT_SCHEMA}.producers`), events: await count(ctx, `${ENT_SCHEMA}.entitlement_events`), coverage: await count(ctx, `${ENT_SCHEMA}.entitlement_coverage`) };
    const nowIso = (await q(ctx, "select to_char((clock_timestamp() - interval '1 minute') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') t"))[0].t;
    const results = [];
    for (const instant of ['1970-01-01T00:00:00Z', at(-1000), at(0), at(100), nowIso]) results.push({ instant, s: await stateAt(ctx, owner, instant) });
    const unknownEverywhere = results.every(r => is(r.s, 'unknown', null, 'NO_REQUIRED_PRODUCER') && same(r.s.evidence.events, []) && same(r.s.evidence.coverage, []) && r.s.policy === 'retention-entitlement-v1');
    const stranger = await stateAt(ctx, uuid(999999), at(10));
    return R(tables.producers === 0 && tables.events === 0 && tables.coverage === 0 && unknownEverywhere && is(stranger, 'unknown', null, 'NO_REQUIRED_PRODUCER'), { tables, results, stranger });
  },
  async P02_PAID_FACT_CLOSED_OPEN_INTERVAL(ctx) {
    const owner = await makeUser(ctx, 2);
    const p = await makeProducer(ctx, 'billing');
    const a = await admit(p, owner, 'sub-1', 'paid', at(10), at(40));
    const adv = await advance(p, owner, at(100));
    const eventId = a.value?.event_id;
    const probes = {};
    for (const [k, instant] of Object.entries({ before: at(10, -1), start: at(10), middle: at(25), lastMs: at(40, -1), end: at(40), after: at(60) })) probes[k] = await stateAt(ctx, owner, instant);
    const ok = a.ok && a.value.outcome === 'admitted' && adv.ok
      && is(probes.before, 'free') && is(probes.start, 'paid', 'paid_subscription') && is(probes.middle, 'paid', 'paid_subscription') && is(probes.lastMs, 'paid', 'paid_subscription')
      && is(probes.end, 'free') && is(probes.after, 'free')
      && same(probes.start.evidence.events, [eventId]) && same(probes.middle.evidence.events, [eventId]) && same(probes.end.evidence.events, []);
    return R(ok, { a, adv, probes: Object.fromEntries(Object.entries(probes).map(([k, s]) => [k, view(s)])) });
  },
  async P03_FREE_PROVABLE_ONLY_UNDER_COVERAGE(ctx) {
    const owner = await makeUser(ctx, 3);
    const p = await makeProducer(ctx, 'billing');
    const none = await stateAt(ctx, owner, at(10));
    const a1 = await advance(p, owner, at(50));
    const atEdge = await stateAt(ctx, owner, at(50));
    const past = await stateAt(ctx, owner, at(10));
    const beyond = await stateAt(ctx, owner, at(50, 1));
    const a2 = await advance(p, owner, at(60));
    const afterAdvance = await stateAt(ctx, owner, at(55));
    const covEvidence = afterAdvance.evidence.coverage;
    const ok = is(none, 'unknown', null, 'COVERAGE_SHORT') && none.evidence.coverage[0].covered_through === null
      && a1.ok && a1.value.revision === 1 && is(atEdge, 'free') && is(past, 'free') && is(beyond, 'unknown', null, 'COVERAGE_SHORT')
      && a2.ok && a2.value.revision === 2 && is(afterAdvance, 'free') && covEvidence.length === 1 && covEvidence[0].namespace === 'billing' && covEvidence[0].revision === 2 && covEvidence[0].covered_through === at(60);
    return R(ok, { none: view(none), a1, atEdge: view(atEdge), past: view(past), beyond: view(beyond), a2, afterAdvance: view(afterAdvance), covEvidence });
  },
  // ---- Owner decision OQ-1 -------------------------------------------------------------------------------
  async P04_OQ1_TRIAL_IS_PAID_LEVEL_BUT_NOT_A_PAYMENT(ctx) {
    const owner = await makeUser(ctx, 4);
    const bill = await makeProducer(ctx, 'billing');
    const trial = await makeProducer(ctx, 'premium-trial');
    const a = await admit(trial, owner, 'trial-1', 'trial', at(0), at(14));
    for (const p of [bill, trial]) await advance(p, owner, at(60));
    const rows = await eventRows(ctx, owner);
    const probes = { first: await stateAt(ctx, owner, at(0)), middle: await stateAt(ctx, owner, at(7)), last: await stateAt(ctx, owner, at(14, -1)), end: await stateAt(ctx, owner, at(14)) };
    const subscriptionRows = await count(ctx, 'public.subscription_entitlements');
    const ok = a.ok && rows.length === 1 && rows[0].class === 'trial' && rows[0].namespace === 'premium-trial'
      && is(probes.first, 'paid', 'trial') && is(probes.middle, 'paid', 'trial') && is(probes.last, 'paid', 'trial') && is(probes.end, 'free')
      && probes.middle.basis !== 'paid_subscription' && same(probes.middle.evidence.events, [a.value.event_id]) && subscriptionRows === 0;
    return R(ok, { a, rows, probes: Object.fromEntries(Object.entries(probes).map(([k, s]) => [k, view(s)])), subscriptionRows });
  },
  async P05_OQ1_EXPIRED_TRIAL_NEW_RECORDS_ARE_FREE(ctx) {
    const owner = await makeUser(ctx, 5);
    const bill = await makeProducer(ctx, 'billing');
    const trial = await makeProducer(ctx, 'premium-trial');
    await admit(trial, owner, 'trial-1', 'trial', at(0), at(14));
    await advance(trial, owner, at(60));
    const billingShort = await stateAt(ctx, owner, at(20)); // billing has not attested coverage: absence of a subscription fact is NOT proof of Free
    await advance(bill, owner, at(60));
    const probes = { lastTrialMs: await stateAt(ctx, owner, at(14, -1)), expiry: await stateAt(ctx, owner, at(14)), later: await stateAt(ctx, owner, at(30)) };
    const ok = is(billingShort, 'unknown', null, 'COVERAGE_SHORT') && is(probes.lastTrialMs, 'paid', 'trial') && is(probes.expiry, 'free') && is(probes.later, 'free') && same(probes.later.evidence.events, []);
    return R(ok, { billingShort: view(billingShort), probes: Object.fromEntries(Object.entries(probes).map(([k, s]) => [k, view(s)])) });
  },
  async P06_OQ1_EXISTING_RECORD_INSTANT_IS_NEVER_SHORTENED(ctx) {
    const owner = await makeUser(ctx, 6);
    const bill = await makeProducer(ctx, 'billing');
    const trial = await makeProducer(ctx, 'premium-trial');
    const a = await admit(trial, owner, 'trial-1', 'trial', at(0), at(14));
    for (const p of [bill, trial]) await advance(p, owner, at(12));
    const recordInstant = at(10); // a record created on day 10 of the trial
    const whenCreated = await stateAt(ctx, owner, recordInstant);
    // the trial then expires with no subscription, coverage moves on, a later paid period is admitted: the answer for the record's own instant must not move
    for (const p of [bill, trial]) await advance(p, owner, at(100));
    const paid = await admit(bill, owner, 'sub-1', 'paid', at(120), at(150));
    for (const p of [bill, trial]) await advance(p, owner, at(200));
    const afterExpiry = await stateAt(ctx, owner, recordInstant);
    const newRecord = await stateAt(ctx, owner, at(30));
    const rows = await eventRows(ctx, owner);
    const trialRow = rows.find(r => r.upstream_event_id === 'trial-1');
    const ok = is(whenCreated, 'paid', 'trial') && same(view(whenCreated), view(afterExpiry)) && same(whenCreated.evidence.events, [a.value.event_id])
      && is(newRecord, 'free') && paid.ok && trialRow.valid_until.toISOString() === at(14);
    return R(ok, { whenCreated: view(whenCreated), afterExpiry: view(afterExpiry), newRecord: view(newRecord), trialRow });
  },
  async P07_OQ1_TRIAL_TO_PAID_NO_DUPLICATE_EXTENSION(ctx) {
    const owner = await makeUser(ctx, 7);
    const bill = await makeProducer(ctx, 'billing');
    const trial = await makeProducer(ctx, 'premium-trial');
    const t = await admit(trial, owner, 'trial-1', 'trial', at(0), at(14));
    const trialBefore = (await eventRows(ctx, owner)).find(r => r.upstream_event_id === 'trial-1');
    const s = await admit(bill, owner, 'sub-1', 'paid', at(7), at(37)); // converts on day 7 of the trial
    for (const p of [bill, trial]) await advance(p, owner, at(100));
    const rows = await eventRows(ctx, owner);
    const trialAfter = rows.find(r => r.upstream_event_id === 'trial-1');
    const probes = {};
    for (const [k, d] of Object.entries({ trialOnly: at(5), overlap: at(10), paidOnly: at(20), lastPaidMs: at(37, -1), end: at(37), naiveSum: at(51), farLater: at(80) })) probes[k] = await stateAt(ctx, owner, d);
    const ok = t.ok && s.ok && rows.length === 2 && same(trialBefore, trialAfter)
      && is(probes.trialOnly, 'paid', 'trial') && is(probes.overlap, 'paid', 'paid_subscription') && probes.overlap.evidence.events.length === 2
      && is(probes.paidOnly, 'paid', 'paid_subscription') && probes.paidOnly.evidence.events.length === 1 && is(probes.lastPaidMs, 'paid', 'paid_subscription')
      && is(probes.end, 'free') && is(probes.naiveSum, 'free') && is(probes.farLater, 'free')
      && rows.map(r => r.class).sort().join() === 'paid,trial';
    return R(ok, { rows: rows.map(r => ({ id: r.upstream_event_id, cls: r.class })), trialUnchanged: same(trialBefore, trialAfter), probes: Object.fromEntries(Object.entries(probes).map(([k, v]) => [k, view(v)])) });
  },
  // ---------------------------------------------------------------------------------------------------------
  async P08_REPLAY_IDEMPOTENT_AND_DIGEST_COMPUTED_IN_DATABASE(ctx) {
    const owner = await makeUser(ctx, 8);
    const p = await makeProducer(ctx, 'billing');
    const first = await admit(p, owner, 'sub-1', 'paid', at(10), at(40), 7);
    const rows1 = await eventRows(ctx, owner);
    const again = await admit(p, owner, 'sub-1', 'paid', at(10), at(40), 7);
    const rows2 = await eventRows(ctx, owner);
    await advance(p, owner, at(90));
    const replayAfterCoverage = await admit(p, owner, 'sub-1', 'paid', at(10), at(40), 7); // a producer retry after coverage moved on is still a replay, not an error
    const expected = digestOf(owner, 'billing', 'sub-1', 'paid', at(10), at(40), 7);
    const noSeq = await admit(p, owner, 'sub-2', 'trial', at(100), at(114));
    const rowsAll = await eventRows(ctx, owner);
    const ok = first.ok && first.value.outcome === 'admitted' && again.ok && again.value.outcome === 'replayed' && again.value.event_id === first.value.event_id
      && rows1.length === 1 && same(rows1, rows2) && replayAfterCoverage.ok && replayAfterCoverage.value.outcome === 'replayed' && rows1[0].semantic_digest === expected && first.value.semantic_digest === expected
      && noSeq.ok && rowsAll.length === 2 && rowsAll[1].source_sequence === null && rowsAll[1].semantic_digest === digestOf(owner, 'billing', 'sub-2', 'trial', at(100), at(114), null);
    return R(ok, { first, again, replayAfterCoverage, expected, stored: rows1[0]?.semantic_digest, noSeq });
  },
  async P09_MULTI_NAMESPACE_REGISTRATION_WINDOWS_AND_FACT_RETENTION(ctx) {
    const owner = await makeUser(ctx, 9);
    const a = await makeProducer(ctx, 'billing-a');
    const b = await makeProducer(ctx, 'billing-b', { registeredAt: at(30) });
    const c = await makeProducer(ctx, 'billing-c');
    await admit(c, owner, 'c-sub', 'paid', at(40), at(90)); // produced by a producer that is retired at day 50
    const bEarly = await admit(b, owner, 'b-sub', 'paid', at(5), at(8)); // a producer registered only at day 30 may NOT assert an earlier interval (R1)
    for (const p of [a, c]) await advance(p, owner, at(100));
    await regWrite(ctx, `update ${ENT_SCHEMA}.producers set retired_at=$1 where namespace='billing-c'`, [at(50)]); // retired once: stops being required, its facts stay
    const probes = {};
    probes.requiredAB = await stateAt(ctx, owner, at(20)); // b not registered yet: required = {a, c}, both covered -> free
    probes.bFactBeforeRegistration = await stateAt(ctx, owner, at(6)); // the refused fact does not exist: the instant stays Free for the producers that were required then
    probes.bRequiredNoCoverage = await stateAt(ctx, owner, at(35)); // b registered, no coverage -> unknown
    await advance(b, owner, at(100));
    probes.allCovered = await stateAt(ctx, owner, at(35));
    probes.retiredFactStillCounts = await stateAt(ctx, owner, at(60)); // c retired at 50: its fact (valid to 90) still counts at day 60
    probes.afterRetirementFree = await stateAt(ctx, owner, at(95)); // c no longer required; a, b covered; no fact
    const ok = is(probes.requiredAB, 'free') && same(probes.requiredAB.evidence.coverage.map(x => x.namespace), ['billing-a', 'billing-c'])
      && !bEarly.ok && bEarly.code === '23514' && bEarly.message.startsWith('ENT_EVENT_BEFORE_PRODUCER_REGISTRATION') && is(probes.bFactBeforeRegistration, 'free') && is(probes.bRequiredNoCoverage, 'unknown', null, 'COVERAGE_SHORT')
      && is(probes.allCovered, 'free') && same(probes.allCovered.evidence.coverage.map(x => x.namespace), ['billing-a', 'billing-b', 'billing-c'])
      && is(probes.retiredFactStillCounts, 'paid', 'paid_subscription') && is(probes.afterRetirementFree, 'free') && same(probes.afterRetirementFree.evidence.coverage.map(x => x.namespace), ['billing-a', 'billing-b']);
    return R(ok, Object.fromEntries(Object.entries(probes).map(([k, s]) => [k, { ...view(s), coverage: s.evidence.coverage.map(x => x.namespace) }])));
  },
  async P10_CONCURRENT_ADMISSION_AND_COVERAGE(ctx) {
    const p = await makeProducer(ctx, 'billing');
    const conns = [p.c, await ctx.open(p.role), await ctx.open(p.role), await ctx.open(p.role)];
    const variants = [['paid', at(10), at(40)], ['trial', at(10), at(24)]];
    const rounds = [];
    for (let round = 0; round < 6; round++) {
      const owner = await makeUser(ctx, 100 + round);
      // 8 concurrent calls for ONE upstream id: exactly one admits; same-content calls replay; different-content calls conflict
      const calls = await Promise.all(Array.from({ length: 8 }, (_, i) => { const v = variants[i % 2]; return admit({ ns: 'billing', c: conns[i % conns.length] }, owner, 'race-1', v[0], v[1], v[2]); }));
      const admitted = calls.filter(r => r.ok && r.value.outcome === 'admitted');
      const replayed = calls.filter(r => r.ok && r.value.outcome === 'replayed');
      const conflicts = calls.filter(r => !r.ok && r.code === '23505' && r.message.startsWith('ENT_EVENT_CONFLICT'));
      const rows = await eventRows(ctx, owner);
      const winner = rows[0]?.class;
      const coverageCalls = await Promise.all([at(10), at(20), at(30), at(40), at(50), at(60)].map((t, i) => advance({ ns: 'billing', c: conns[i % conns.length] }, owner, t)));
      const final = (await q(ctx, `select covered_through, revision from ${ENT_SCHEMA}.entitlement_coverage where owner_user_id=$1`, [owner]))[0];
      const unexpected = coverageCalls.filter(r => !r.ok && !(r.code === '23514' && r.message.startsWith('ENT_COVERAGE_REGRESSION')));
      const ok = admitted.length === 1 && rows.length === 1 && admitted.length + replayed.length + conflicts.length === 8
        && calls.filter((r, i) => (variants[i % 2][0] === winner) !== (r.ok)).length === 0
        && unexpected.length === 0 && final?.covered_through.toISOString() === at(60) && Number(final.revision) >= 1 && Number(final.revision) <= 6;
      rounds.push({ round, ok, admitted: admitted.length, replayed: replayed.length, conflicts: conflicts.length, other: calls.filter(r => !r.ok && !conflicts.includes(r)).map(r => r.code + ' ' + r.message.slice(0, 50)), winner, rows: rows.length, coverageCalls: coverageCalls.map(r => r.ok ? r.value : r.code + ' ' + r.message.slice(0, 40)), final });
    }
    return R(rounds.every(r => r.ok), rounds);
  },
  async P11_READER_SNAPSHOT_NEVER_SEES_COVERAGE_WITHOUT_ITS_FACTS(ctx) {
    const owner = await makeUser(ctx, 11);
    const p = await makeProducer(ctx, 'billing');
    const w = p.c;
    await w.query('begin');
    const a = await call(w, `select ${ENT_SCHEMA}.admit_entitlement_event($1::uuid,'billing','tx-1','paid',$2::timestamptz,$3::timestamptz,null) s`, [owner, at(10), at(40)]);
    const v = await call(w, `select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'billing',$2::timestamptz) s`, [owner, at(100)]);
    const during = await stateAt(ctx, owner, at(20)); // the producer's transaction is open: R3 waits for it (per-owner lock) and, past the 2 s limit, answers unknown/OWNER_LOCK_TIMEOUT - neither the fact nor the coverage is ever seen alone
    await w.query('commit');
    const afterCommit = await stateAt(ctx, owner, at(20));
    // a rolled-back producer transaction leaves neither the fact nor the coverage
    await w.query('begin');
    await call(w, `select ${ENT_SCHEMA}.admit_entitlement_event($1::uuid,'billing','tx-2','paid',$2::timestamptz,$3::timestamptz,null) s`, [owner, at(150), at(160)]);
    await call(w, `select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'billing',$2::timestamptz) s`, [owner, at(200)]);
    await w.query('rollback');
    const rolledBack = await stateAt(ctx, owner, at(155));
    const rows = await eventRows(ctx, owner);
    const ok = a.ok && v.ok && is(during, 'unknown', null, 'OWNER_LOCK_TIMEOUT') && view(during).events.length === 0 && is(afterCommit, 'paid', 'paid_subscription') && is(rolledBack, 'unknown', null, 'COVERAGE_SHORT') && rows.length === 1;
    return R(ok, { during: view(during), afterCommit: view(afterCommit), rolledBack: view(rolledBack), rows: rows.length });
  },
  async P12_EXACT_POST_STATE_SEALED_ROLES_AND_ACL(ctx) {
    const src = ctx.source;
    const own = /IS DISTINCT FROM '([0-9a-f]{64})'/.exec(src)?.[1];
    const pinned = !!own && src.split(own).length === 3 && (src !== entSource() || own === ENT_POST_DIGEST);
    const roles = await q(ctx, 'select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit, rolpassword is null nopw from pg_authid where rolname in ($1,$2)', [ENT_OWNER, ENT_BUILDER]);
    const members = (await q(ctx, 'select count(*)::int n from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)', [ENT_OWNER, ENT_BUILDER]))[0].n;
    const owner = roles.find(r => r.rolname === ENT_OWNER);
    const tables = await q(ctx, "select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner)::text owner,c.relacl::text acl from pg_class c where c.relnamespace=$1::regnamespace and c.relkind not in ('i','I') order by 1", [ENT_SCHEMA]);
    const fns = await q(ctx, "select p.proname,pg_get_userbyid(p.proowner)::text owner,p.prosecdef,p.proconfig config,p.proacl::text acl,p.provolatile vol,pg_get_function_identity_arguments(p.oid) args from pg_proc p where p.pronamespace=$1::regnamespace order by 1", [ENT_SCHEMA]);
    const schema = (await q(ctx, "select n.nspacl::text acl, pg_get_userbyid(n.nspowner)::text owner from pg_namespace n where n.nspname=$1", [ENT_SCHEMA]))[0];
    const policies = await q(ctx, "select c.relname,p.polname,p.polcmd,p.polpermissive,(select array_agg(rolname order by rolname) from pg_roles where oid=any(p.polroles)) roles from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace=$1::regnamespace order by 1,2", [ENT_SCHEMA]);
    const triggers = await q(ctx, "select c.relname,t.tgname,t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace=$1::regnamespace and not t.tgisinternal order by 1,2", [ENT_SCHEMA]);
    const execPublic = (await q(ctx, "select count(*)::int n from pg_proc p where p.pronamespace=$1::regnamespace and has_function_privilege('public',p.oid,'EXECUTE')", [ENT_SCHEMA]))[0].n;
    const other = (await q(ctx, "select count(*)::int n from pg_class c where c.relnamespace=$1::regnamespace and c.relkind not in ('r','i')", [ENT_SCHEMA]))[0].n;
    const ownerOnly = acl => acl === null || String(acl).replace(/[{}"]/g, '').split(',').filter(Boolean).every(e => e.startsWith(ENT_OWNER + '='));
    const definer = ['admit_entitlement_event', 'advance_entitlement_coverage', 'entitlement_state_at'];
    const invoker = ['reject_event_update', 'guard_coverage_update', 'guard_producer_update'];
    const sp = JSON.stringify(['search_path=""']), spLock = JSON.stringify(['search_path=""', 'lock_timeout=2s']); // R2: the three definer functions carry a function-level lock_timeout (per lock wait, not per call)
    const ok = pinned && owner && !owner.rolcanlogin && !owner.rolsuper && !owner.rolcreaterole && !owner.rolcreatedb && !owner.rolbypassrls && !owner.rolreplication && !owner.rolinherit && owner.nopw
      && roles.length === 1 && members === 0 && tables.length === 3 && tables.every(t => t.relrowsecurity && t.relforcerowsecurity && t.owner === ENT_OWNER && ownerOnly(t.acl)) && other === 0
      && fns.length === 6 && fns.every(f => f.owner === ENT_OWNER && JSON.stringify(f.config) === (definer.includes(f.proname) ? spLock : sp) && ownerOnly(f.acl))
      && definer.every(n => fns.find(f => f.proname === n).prosecdef === true) && invoker.every(n => fns.find(f => f.proname === n).prosecdef === false)
      && definer.every(n => fns.find(f => f.proname === n).vol === 'v') // PostgreSQL refuses LOCK TABLE in a non-volatile function, and only a volatile function takes a fresh snapshot after the lock
      && execPublic === 0 && schema.owner === ENT_OWNER && ownerOnly(schema.acl)
      && policies.length === 6 && policies.every(p => p.polpermissive && String(p.roles) === '{' + ENT_OWNER + '}') && !policies.some(p => p.polcmd === 'd' || p.polcmd === '*')
      && triggers.length === 3 && triggers.every(t => t.tgenabled === 'O' && t.tgdeferrable === false && t.tginitdeferred === false) && triggers.filter(t => t.relname === 'producers').map(t => t.tgname).sort().join() === 'producer_guard'; // no deferrable (commit-time) trigger exists
    return R(ok, { pinned, roles, members, tables, fns, schema, policies, triggers, execPublic, other, notices: ctx.apply.notices });
  },
  async P13_NO_CATALOG_CHANGE_OUTSIDE_THE_NEW_SCHEMA_AND_MEAL_SAVE_STILL_WORKS(ctx) {
    const unchanged = same(ctx.pre, ctx.post);
    const before = { anchors: await count(ctx, 'retention_capture.detail_capture_anchors'), meals: await count(ctx, 'public.meal_records') };
    const occurred = new Date(Date.now() - 3600000).toISOString();
    const mealDate = new Date(occurred).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
    const items = JSON.stringify([{ displayName: 'SYNTHETIC', nutritionSource: 'manual', nutrition: { calories: 100, protein: 5, carbohydrates: 15, fat: 2, fiber: 1 } }]);
    const sql = "select public.create_current_user_meal_record_v2('lunch',$1::timestamptz,$2::date,$3::uuid,'Asia/Taipei','SYNTHETIC entitlement round',null,'manual',$4::jsonb) s";
    const save = await act(ctx, uuid(910), sql, [occurred, mealDate, uuid(7100), items]);
    const after = { anchors: await count(ctx, 'retention_capture.detail_capture_anchors'), meals: await count(ctx, 'public.meal_records'), entEvents: await count(ctx, `${ENT_SCHEMA}.entitlement_events`), entCoverage: await count(ctx, `${ENT_SCHEMA}.entitlement_coverage`) };
    const retention = {};
    for (const t of ['owner_authority_state', 'authority_events', 'operation_receipts', 'detail_grants']) retention[t] = await count(ctx, 'retention_internal.' + t);
    const mealTriggers = await q(ctx, "select tgname from pg_trigger where tgrelid='public.meal_records'::regclass and not tgisinternal order by 1");
    return R(unchanged && save.ok && after.meals === before.meals + 1 && after.anchors === before.anchors + 1 && after.entEvents === 0 && after.entCoverage === 0
      && Object.values(retention).every(n => n === 0) && same(mealTriggers.map(t => t.tgname).filter(n => /entitlement/.test(n)), []), { unchanged, differing: Object.keys(ctx.pre).filter(k => ctx.pre[k] !== ctx.post[k]), save, before, after, retention, mealTriggers });
  },
  async P14_ACCOUNT_DELETION_REMOVES_FACTS(ctx) {
    const owner = await makeUser(ctx, 14), other = await makeUser(ctx, 15);
    const p = await makeProducer(ctx, 'billing');
    await admit(p, owner, 'sub-1', 'paid', at(10), at(40)); await advance(p, owner, at(50));
    await admit(p, other, 'sub-1', 'paid', at(10), at(40)); await advance(p, other, at(50));
    const deletion = await ctx.g.query(ctx.su, 'delete from auth.users where id=$1', [owner]).then(() => 'DELETED', e => e.code);
    const left = await q(ctx, `select owner_user_id, (select count(*)::int from ${ENT_SCHEMA}.entitlement_coverage c where c.owner_user_id=e.owner_user_id) cov from ${ENT_SCHEMA}.entitlement_events e`);
    return R(deletion === 'DELETED' && left.length === 1 && left[0].owner_user_id === other && left[0].cov === 1 && await count(ctx, `${ENT_SCHEMA}.entitlement_coverage`, `owner_user_id='${owner}'`) === 0, { deletion, left });
  },

  // ---- negatives ------------------------------------------------------------------------------------------
  async N01_RUNTIME_ROLES_CANNOT_REACH_LEDGER(ctx) {
    const owner = await makeUser(ctx, 20);
    await makeProducer(ctx, 'billing');
    const matrix = await q(ctx, `select r.rolname,
      has_schema_privilege(r.oid,'${ENT_SCHEMA}','USAGE') usage, has_schema_privilege(r.oid,'${ENT_SCHEMA}','CREATE') cr,
      (select coalesce(bool_or(has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),false) from pg_class c where c.relnamespace='${ENT_SCHEMA}'::regnamespace and c.relkind='r') tbl,
      (select coalesce(bool_or(has_function_privilege(r.oid,p.oid,'EXECUTE')),false) from pg_proc p where p.pronamespace='${ENT_SCHEMA}'::regnamespace) fn,
      r.rolsuper, pg_has_role(r.oid,'pg_read_all_data','MEMBER') rd, pg_has_role(r.oid,'pg_write_all_data','MEMBER') wr
      from pg_roles r where r.rolname<>$1 and r.rolname !~ '^ent_p_' order by 1`, [ENT_OWNER]);
    const leaks = matrix.filter(m => !m.rolsuper && !m.rd && !m.wr && (m.usage || m.cr || m.tbl || m.fn));
    const attempts = [];
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const sqls = [
        `select count(*) s from ${ENT_SCHEMA}.entitlement_events`,
        `select count(*) s from ${ENT_SCHEMA}.producers`,
        `select ${ENT_SCHEMA}.entitlement_state_at('${owner}'::uuid, '${at(1)}'::timestamptz) s`,
        `select ${ENT_SCHEMA}.admit_entitlement_event('${owner}'::uuid,'billing','x','paid','${at(1)}'::timestamptz,'${at(2)}'::timestamptz,null) s`,
        `select ${ENT_SCHEMA}.advance_entitlement_coverage('${owner}'::uuid,'billing','${at(1)}'::timestamptz) s`,
        `insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ('${owner}','billing','x','paid','${at(1)}','${at(2)}','${'0'.repeat(64)}')`
      ];
      for (const sql of sqls) { const r = await act(ctx, owner, sql, [], { role }); attempts.push({ role, sql: sql.slice(0, 60), ok: r.ok, code: r.code }); }
    }
    const rows = await count(ctx, `${ENT_SCHEMA}.entitlement_events`);
    return R(leaks.length === 0 && attempts.every(a => !a.ok && a.code === '42501') && rows === 0, { leaks, attempts, rows });
  },
  async N02_PRODUCER_IDENTITY_IS_THE_REGISTERED_DATABASE_ROLE(ctx) {
    const owner = await makeUser(ctx, 21);
    const a = await makeProducer(ctx, 'billing-a');
    const b = await makeProducer(ctx, 'billing-b');
    const retired = await makeProducer(ctx, 'billing-old', { retiredAt: at(5) });
    const stranger = await makeProducer(ctx, 'stranger-role', { grant: true }); // has EXECUTE, then its registration is removed below
    await regWrite(ctx, `delete from ${ENT_SCHEMA}.producers where namespace='stranger-role'`);
    const cases = {
      strangerAdmit: await admit(stranger, owner, 'x', 'paid', at(10), at(20), null, 'billing-a'),
      strangerAdvance: await advance(stranger, owner, at(10), 'billing-a'),
      crossNamespaceAdmit: await admit(a, owner, 'x', 'paid', at(10), at(20), null, 'billing-b'),
      crossNamespaceAdvance: await advance(a, owner, at(10), 'billing-b'),
      unknownNamespace: await admit(a, owner, 'x', 'paid', at(10), at(20), null, 'no-such-namespace'),
      retiredAdmit: await admit(retired, owner, 'x', 'paid', at(10), at(20)),
      retiredAdvance: await advance(retired, owner, at(10)),
      // a string in an argument authenticates nothing
      claimInUpstreamId: await admit(a, owner, 'role=ent_p_billing_b', 'paid', at(10), at(20), null, 'billing-b')
    };
    const refused = Object.values(cases).every(r => !r.ok && r.code === '42501' && r.message.startsWith('ENT_PRODUCER_NOT_AUTHORIZED'));
    const own = await admit(a, owner, 'x', 'paid', at(10), at(20));
    const ownAdv = await advance(b, owner, at(10));
    const events = await count(ctx, `${ENT_SCHEMA}.entitlement_events`);
    return R(refused && own.ok && ownAdv.ok && events === 1, { cases: Object.fromEntries(Object.entries(cases).map(([k, r]) => [k, r.ok ? 'ADMITTED' : r.code + ' ' + r.message.slice(0, 40)])), own, ownAdv, events });
  },
  async N03_CALLER_CANNOT_SUPPLY_DIGEST_TIER_OR_PAYMENT_CLAIM(ctx) {
    const owner = await makeUser(ctx, 22);
    const p = await makeProducer(ctx, 'billing');
    const sigs = await q(ctx, "select p.proname, pg_get_function_arguments(p.oid) args from pg_proc p where p.pronamespace=$1::regnamespace and p.prosecdef order by 1", [ENT_SCHEMA]);
    const argNames = sigs.flatMap(s => s.args.split(',').map(x => x.trim().split(' ')[0]));
    const noSuppliedAuthority = !argNames.some(n => /digest|tier|grant|retention|payment|amount|price|currency|receipt|invoice/i.test(n));
    const tableCols = (await q(ctx, "select column_name from information_schema.columns where table_schema=$1 order by 1", [ENT_SCHEMA])).map(r => r.column_name);
    const noPaymentColumns = !tableCols.some(n => /payment|amount|price|currency|receipt|invoice|tier|plan|card/i.test(n));
    const classes = {};
    for (const cls of ['free', 'premium', 'PAID', 'subscription', 'expired', '', 'trial ']) classes[JSON.stringify(cls)] = await admit(p, owner, 'c-' + cls.length + cls, cls, at(10), at(20));
    const nullClass = await admit(p, owner, 'c-null', null, at(10), at(20));
    const rejected = [...Object.values(classes), nullClass].every(r => !r.ok && r.code === '22023' && r.message.startsWith('ENT_INVALID_ARGUMENT'));
    const tierColumn = await ctx.g.query(ctx.su, `insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','direct','free',$2,$3,$4)`, [owner, at(10), at(20), '0'.repeat(64)]).then(() => 'INSERTED', e => e.code);
    const events = await count(ctx, `${ENT_SCHEMA}.entitlement_events`);
    return R(noSuppliedAuthority && noPaymentColumns && rejected && tierColumn === '23514' && events === 0, { sigs, tableCols, noSuppliedAuthority, noPaymentColumns, classes: Object.fromEntries(Object.entries(classes).map(([k, r]) => [k, r.ok ? 'ADMITTED' : r.code])), nullClass: nullClass.code, tierColumn, events });
  },
  async N04_FACTS_ARE_IMMUTABLE_AND_PRODUCERS_ARE_PINNED(ctx) {
    const owner = await makeUser(ctx, 23);
    const p = await makeProducer(ctx, 'billing');
    await admit(p, owner, 'sub-1', 'paid', at(10), at(40)); await advance(p, owner, at(5));
    const before = await eventRows(ctx, owner);
    const tryUpdate = async (set, values = []) => ctx.g.query(ctx.su, `update ${ENT_SCHEMA}.entitlement_events set ${set} where owner_user_id='${owner}'`, values).then(() => 'UPDATED', e => e.code + ' ' + e.message.slice(0, 22));
    const updates = {
      validUntil: await tryUpdate("valid_until = valid_until + interval '1 day'"),
      validFrom: await tryUpdate("valid_from = valid_from - interval '1 day'"),
      klass: await tryUpdate("class = 'trial'"),
      digest: await tryUpdate("semantic_digest = repeat('1',64)"),
      owner: await tryUpdate(`owner_user_id = '${uuid(99)}'`),
      admittedAt: await tryUpdate("admitted_at = admitted_at + interval '1 second'")
    };
    const ownerDelete = await ctx.g.query(ctx.su, `begin; set local role ${ENT_OWNER}; delete from ${ENT_SCHEMA}.entitlement_events; commit`).then(() => 'DONE', e => e.code);
    await ctx.su.query('rollback').catch(() => {});
    const ownerUpdate = await ctx.g.query(ctx.su, `begin; set local role ${ENT_OWNER}; update ${ENT_SCHEMA}.entitlement_events set class='trial'; commit`).then(() => 'DONE', e => e.code);
    await ctx.su.query('rollback').catch(() => {});
    const after = await eventRows(ctx, owner);
    const prod = async sql => ctx.g.query(ctx.su, sql).then(() => 'UPDATED', e => e.code + ' ' + e.message.slice(0, 24));
    const producerUpdates = {
      namespace: await prod(`update ${ENT_SCHEMA}.producers set namespace='renamed' where namespace='billing'`),
      role: await prod(`update ${ENT_SCHEMA}.producers set role_name='someone_else' where namespace='billing'`),
      registeredAt: await prod(`update ${ENT_SCHEMA}.producers set registered_at=registered_at - interval '1 day' where namespace='billing'`)
    };
    const retire = await prod(`update ${ENT_SCHEMA}.producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '1 day') where namespace='billing'`);
    const retireAgain = await prod(`update ${ENT_SCHEMA}.producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '2 days') where namespace='billing'`);
    const unretire = await prod(`update ${ENT_SCHEMA}.producers set retired_at=null where namespace='billing'`);
    const ok = same(before, after) && Object.values(updates).every(u => u.startsWith('23514 ENT_EVENT_IMMUTABLE'))
      && ownerDelete === 'DONE' && ownerUpdate === 'DONE' && same(before, after) && Object.values(producerUpdates).every(u => u.startsWith('23514 ENT_PRODUCER_IMMUTABLE'))
      && retire === 'UPDATED' && retireAgain.startsWith('23514 ENT_PRODUCER_IMMUTABLE') && unretire.startsWith('23514 ENT_PRODUCER_IMMUTABLE');
    return R(ok, { updates, ownerDelete, ownerUpdate, unchangedRows: same(before, after), producerUpdates, retire, retireAgain, unretire });
  },
  async N05_SAME_ID_DIFFERENT_CONTENT_CONFLICTS(ctx) {
    const owner = await makeUser(ctx, 24);
    const p = await makeProducer(ctx, 'billing');
    await admit(p, owner, 'sub-1', 'paid', at(10), at(40), 5);
    const before = await eventRows(ctx, owner);
    const variants = {
      klass: await admit(p, owner, 'sub-1', 'trial', at(10), at(40), 5),
      from: await admit(p, owner, 'sub-1', 'paid', at(11), at(40), 5),
      until: await admit(p, owner, 'sub-1', 'paid', at(10), at(41), 5),
      sequence: await admit(p, owner, 'sub-1', 'paid', at(10), at(40), 6),
      noSequence: await admit(p, owner, 'sub-1', 'paid', at(10), at(40), null)
    };
    const otherOwner = await makeUser(ctx, 25);
    const sameIdOtherOwner = await admit(p, otherOwner, 'sub-1', 'trial', at(10), at(24));
    const after = await eventRows(ctx, owner);
    const isolation = { owner: await stateAt(ctx, owner, at(15)), other: await stateAt(ctx, otherOwner, at(15)) };
    const isolated = is(isolation.owner, 'paid', 'paid_subscription') && isolation.owner.evidence.events.length === 1 && is(isolation.other, 'paid', 'trial') && isolation.other.evidence.events.length === 1 && isolation.owner.evidence.events[0] !== isolation.other.evidence.events[0];
    return R(Object.values(variants).every(r => !r.ok && r.code === '23505' && r.message.startsWith('ENT_EVENT_CONFLICT')) && same(before, after) && sameIdOtherOwner.ok && sameIdOtherOwner.value.outcome === 'admitted' && isolated,
      { variants: Object.fromEntries(Object.entries(variants).map(([k, r]) => [k, r.ok ? 'ADMITTED' : r.code])), unchanged: same(before, after), sameIdOtherOwner, isolation: { owner: view(isolation.owner), other: view(isolation.other) } });
  },
  async N06_COVERAGE_NEVER_REGRESSES_OR_JUMPS_AHEAD_OF_THE_CLOCK(ctx) {
    const owner = await makeUser(ctx, 26);
    const p = await makeProducer(ctx, 'billing');
    const first = await advance(p, owner, at(50));
    const lower = await advance(p, owner, at(40));
    const equal = await advance(p, owner, at(50));
    const state = async () => (await q(ctx, `select covered_through, revision from ${ENT_SCHEMA}.entitlement_coverage where owner_user_id=$1`, [owner]))[0];
    const s1 = await state();
    const future = await advance(p, owner, new Date(Date.now() + 2 * DAY).toISOString());
    const direct = async set => ctx.g.query(ctx.su, `update ${ENT_SCHEMA}.entitlement_coverage set ${set} where owner_user_id='${owner}'`).then(() => 'UPDATED', e => e.code + ' ' + e.message.slice(0, 24));
    const directs = {
      lower: await direct(`covered_through='${at(10)}', revision=revision+1`),
      equal: await direct('revision=revision+1'),
      skippedRevision: await direct(`covered_through='${at(60)}', revision=revision+2`),
      sameRevision: await direct(`covered_through='${at(60)}'`),
      owner: await direct(`owner_user_id='${uuid(98)}'`)
    };
    const s2 = await state();
    const ok = first.ok && first.value.revision === 1 && !lower.ok && lower.code === '23514' && lower.message.startsWith('ENT_COVERAGE_REGRESSION')
      && equal.ok && equal.value.outcome === 'unchanged' && equal.value.revision === 1 && Number(s1.revision) === 1
      && !future.ok && future.code === '22023' && future.message.startsWith('ENT_COVERAGE_IN_FUTURE')
      && Object.values(directs).every(r => r.startsWith('23514 ENT_COVERAGE_REGRESSION')) && same(s1, s2) && s2.covered_through.toISOString() === at(50);
    return R(ok, { first, lower: lower.code, equal, future: future.code, directs, s1, s2 });
  },
  async N07_FACT_AT_OR_BEFORE_COVERAGE_IS_REJECTED(ctx) {
    const owner = await makeUser(ctx, 27);
    const p = await makeProducer(ctx, 'billing');
    await advance(p, owner, at(50));
    const results = {
      before: await admit(p, owner, 'a', 'paid', at(40), at(60)),
      equal: await admit(p, owner, 'b', 'paid', at(50), at(60)),
      oneMsAfter: await admit(p, owner, 'c', 'paid', at(50, 1), at(60)),
      longBefore: await admit(p, owner, 'd', 'trial', at(-30), at(14))
    };
    const rows = await eventRows(ctx, owner);
    const otherOwner = await makeUser(ctx, 28);
    const independent = await admit(p, otherOwner, 'a', 'paid', at(40), at(60)); // coverage is per owner
    const ok = ['before', 'equal', 'longBefore'].every(k => !results[k].ok && results[k].code === '23514' && results[k].message.startsWith('ENT_EVENT_BELOW_COVERAGE'))
      && results.oneMsAfter.ok && rows.length === 1 && rows[0].upstream_event_id === 'c' && independent.ok;
    return R(ok, { results: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.ok ? 'ADMITTED' : r.code])), rows: rows.length, independent });
  },
  async N08_INVALID_ARGUMENTS_AND_ROWS_ARE_REJECTED(ctx) {
    const owner = await makeUser(ctx, 29);
    const p = await makeProducer(ctx, 'billing');
    const bad = {
      nullOwner: () => admit(p, null, 'x', 'paid', at(10), at(20)),
      nullId: () => admit(p, owner, null, 'paid', at(10), at(20)),
      blankId: () => admit(p, owner, '   ', 'paid', at(10), at(20)),
      longId: () => admit(p, owner, 'x'.repeat(201), 'paid', at(10), at(20)),
      equalInterval: () => admit(p, owner, 'x', 'paid', at(10), at(10)),
      invertedInterval: () => admit(p, owner, 'x', 'paid', at(20), at(10)),
      subMillisecondFrom: () => admit(p, owner, 'x', 'paid', '2026-01-11T00:00:00.0005Z', at(20)),
      subMillisecondUntil: () => admit(p, owner, 'x', 'paid', at(10), '2026-01-21T00:00:00.0005Z'),
      infinityFrom: () => admit(p, owner, 'x', 'paid', '-infinity', at(20)),
      infinityUntil: () => admit(p, owner, 'x', 'paid', at(10), 'infinity'),
      nullFrom: () => admit(p, owner, 'x', 'paid', null, at(20)),
      nullUntil: () => admit(p, owner, 'x', 'paid', at(10), null),
      negativeSequence: () => admit(p, owner, 'x', 'paid', at(10), at(20), -1),
      advanceNull: () => advance(p, owner, null),
      advanceSubMs: () => advance(p, owner, '2026-01-11T00:00:00.0005Z'),
      advanceInfinity: () => advance(p, owner, 'infinity')
    };
    const results = {};
    for (const [k, f] of Object.entries(bad)) results[k] = await f();
    const functionsRejected = Object.values(results).every(r => !r.ok && r.code === '22023' && r.message.startsWith('ENT_INVALID_ARGUMENT'));
    const direct = async (text, values) => ctx.g.query(ctx.su, text, values).then(() => 'INSERTED', e => e.code);
    const D = '0'.repeat(64), ins = (cols, vals) => direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest${cols}) values ($1,'billing','d','paid',$2,$3,$4${vals})`, [owner, at(10), at(20), D]);
    const rows = {
      goodControl: await ins('', ''),
      blankId: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','  ','paid',$2,$3,$4)`, [owner, at(10), at(20), D]),
      invertedInterval: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','e','paid',$2,$3,$4)`, [owner, at(20), at(10), D]),
      badDigest: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','f','paid',$2,$3,'XYZ')`, [owner, at(10), at(20)]),
      subMs: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','g','paid','2026-01-11T00:00:00.0005Z',$2,$3)`, [owner, at(20), D]),
      noUntil: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','h','paid',$2,null,$3)`, [owner, at(10), D]),
      unknownNamespace: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'nobody','i','paid',$2,$3,$4)`, [owner, at(10), at(20), D]),
      unknownOwner: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','j','paid',$2,$3,$4)`, [uuid(97), at(10), at(20), D]),
      negativeSequence: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest,source_sequence) values ($1,'billing','k','paid',$2,$3,$4,-1)`, [owner, at(10), at(20), D]),
      duplicate: await direct(`insert into ${ENT_SCHEMA}.entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing','d','paid',$2,$3,$4)`, [owner, at(30), at(40), D])
    };
    const producers = {
      badNamespace: await direct(`insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at) values ('Bad Name','r1',date_trunc('milliseconds', clock_timestamp() + interval '2 seconds'))`),
      emptyRole: await direct(`insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at) values ('good-name','',date_trunc('milliseconds', clock_timestamp() + interval '2 seconds'))`),
      duplicateRole: await direct(`insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at) values ('other-name',$1,date_trunc('milliseconds', clock_timestamp() + interval '2 seconds'))`, [p.role]),
      retiredBeforeRegistered: await direct(`insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at,retired_at) values ('late-name','r2',date_trunc('milliseconds', clock_timestamp() + interval '2 seconds'),date_trunc('milliseconds', clock_timestamp() + interval '1 second'))`)
    };
    const ok = functionsRejected && rows.goodControl === 'INSERTED' && ['blankId', 'invertedInterval', 'badDigest', 'subMs', 'noUntil', 'negativeSequence'].every(k => rows[k] === '23514' || rows[k] === '23502')
      && rows.unknownNamespace === '23503' && rows.unknownOwner === '23503' && rows.duplicate === '23505'
      && producers.badNamespace === '23514' && producers.emptyRole === '23514' && producers.duplicateRole === '23505' && producers.retiredBeforeRegistered === '23514';
    return R(ok, { functions: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.ok ? 'ADMITTED' : r.code])), rows, producers });
  },
  async N09_FUTURE_AND_UNCOVERED_INSTANTS_ARE_UNKNOWN(ctx) {
    const owner = await makeUser(ctx, 30), other = await makeUser(ctx, 31);
    const a = await makeProducer(ctx, 'billing-a');
    const b = await makeProducer(ctx, 'billing-b');
    const future = new Date(Date.now() + DAY).toISOString();
    const farFuture = new Date(Date.now() + 400 * DAY).toISOString();
    await admit(a, owner, 'long', 'paid', at(10), '2036-01-01T00:00:00.000Z');
    await advance(a, owner, at(100));
    await advance(b, owner, at(100));
    const probes = {
      futureInstant: await stateAt(ctx, owner, future),
      farFuture: await stateAt(ctx, owner, farFuture),
      justBeforeCoverageEnds: await stateAt(ctx, owner, at(100)),
      oneMsPastCoverage: await stateAt(ctx, owner, at(100, 1)),
      otherOwnerSameInstant: await stateAt(ctx, other, at(50)),
      otherOwnerFreeLooking: await stateAt(ctx, other, at(5))
    };
    await advance(a, other, at(100)); // only billing-a covers `other`
    probes.oneNamespaceCoversOther = await stateAt(ctx, other, at(50));
    const invalid = {};
    for (const [k, args] of Object.entries({ nullOwner: [null, at(1)], nullInstant: [owner, null], infinity: [owner, 'infinity'], negInfinity: [owner, '-infinity'] })) {
      invalid[k] = await call(ctx.su, `select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, args);
    }
    const ok = is(probes.futureInstant, 'unknown', null, 'INSTANT_IN_FUTURE') && is(probes.farFuture, 'unknown', null, 'INSTANT_IN_FUTURE') && same(probes.futureInstant.evidence.events, [])
      && is(probes.justBeforeCoverageEnds, 'paid', 'paid_subscription') && is(probes.oneMsPastCoverage, 'paid', 'paid_subscription') // a recorded Paid fact does not need coverage
      && is(probes.otherOwnerSameInstant, 'unknown', null, 'COVERAGE_SHORT') && is(probes.otherOwnerFreeLooking, 'unknown', null, 'COVERAGE_SHORT')
      && is(probes.oneNamespaceCoversOther, 'unknown', null, 'COVERAGE_SHORT')
      && Object.values(invalid).every(r => !r.ok && r.code === '22023' && r.message.startsWith('ENT_INVALID_ARGUMENT'));
    return R(ok, { probes: Object.fromEntries(Object.entries(probes).map(([k, s]) => [k, view(s)])), invalid: Object.fromEntries(Object.entries(invalid).map(([k, r]) => [k, r.ok ? 'OK' : r.code])) });
  },
  async N10_NO_RETENTION_MEAL_OR_SUBSCRIPTION_COUPLING(ctx) {
    const owner = uuid(910); // the legacy Consumer-core-eligible actor: only such an owner can hold a subscription_entitlements row
    const p = await makeProducer(ctx, 'billing');
    const defs = await q(ctx, "select p.proname, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace=$1::regnamespace order by 1", [ENT_SCHEMA]);
    const banned = /\b(now\s*\(\)|current_timestamp|current_date|localtimestamp|statement_timestamp|subscription_entitlements|meal_records|meal_record_items|retention_internal|retention_capture|detail_grants|public\.)/i;
    const clock = /clock_timestamp/gi;
    const bodyHits = defs.filter(d => banned.test(d.def.replace(/^[\s\S]*?AS \$function\$/, ''))).map(d => d.proname);
    const clockUses = Object.fromEntries(defs.map(d => [d.proname, (d.def.match(clock) ?? []).length]));
    const stateDef = defs.find(d => d.proname === 'entitlement_state_at').def;
    const stateBody = stateDef.replace(/^[\s\S]*?AS \$function\$/, '');
    // R2: the function body now has a prologue (isolation check, registry lock, clock sample); the RESOLUTION is still exactly ONE statement: everything from the last RETURN ( up to the end is one WITH ... SELECT
    // with no variable assignment, INTO, PERFORM or EXECUTE, and the lock (LOCK TABLE) is a separate command BEFORE it (so the resolver statement's snapshot is taken after the lock was granted).
    const resolverAt = stateBody.lastIndexOf('RETURN (');
    const resolver = resolverAt >= 0 ? stateBody.slice(resolverAt) : '';
    const prologue = resolverAt >= 0 ? stateBody.slice(0, resolverAt) : '';
    const oneStatement = (stateBody.match(/\bWITH required AS\b/g) ?? []).length === 1 && resolver.startsWith('RETURN (') && !/\bPERFORM\b|\bINTO\b|\bDECLARE\b|:=|\bEXECUTE\b|\bLOCK TABLE\b/i.test(resolver)
      && (prologue.match(/\bLOCK TABLE retention_entitlement\.producers IN SHARE MODE\b/g) ?? []).length === 1 && prologue.indexOf('LOCK TABLE') < prologue.indexOf('v_sampled := ') && /transaction_isolation/.test(prologue)
      // R3: besides validation, the isolation check, the registry lock and the clock sample, the prologue contains exactly ONE loop over the registry namespaces that takes the SHARED per-owner advisory lock (the F1 synchronisation,
      // between the registry lock and the clock sample): exactly one PERFORM (that lock) and one SELECT (the namespace list), no INTO / EXECUTE, one assignment (v_sampled), one DECLARE block
      && (prologue.match(/\bPERFORM\b/g) ?? []).length === 1 && /PERFORM pg_catalog\.pg_advisory_xact_lock_shared\(/.test(prologue) && (prologue.match(/\bSELECT\b/g) ?? []).length === 1 && /FOR v_ns IN SELECT p\.namespace FROM retention_entitlement\.producers p ORDER BY/.test(prologue)
      && !/\bINTO\b|\bEXECUTE\b/i.test(prologue) && (prologue.match(/:=/g) ?? []).length === 1 && (prologue.match(/\bDECLARE\b/g) ?? []).length === 1
      && prologue.indexOf('pg_advisory_xact_lock_shared') > prologue.indexOf('LOCK TABLE') && prologue.indexOf('pg_advisory_xact_lock_shared') < prologue.indexOf('v_sampled := ');
    const sixRefs = (await q(ctx, "select count(*)::int n from pg_depend d join pg_class c on c.oid=d.refobjid where d.classid='pg_proc'::regclass and d.refclassid='pg_class'::regclass and c.relnamespace in ('public'::regnamespace,'retention_internal'::regnamespace,'retention_capture'::regnamespace) and d.objid in (select oid from pg_proc where pronamespace=$1::regnamespace)", [ENT_SCHEMA]))[0].n;
    const fkTargets = await q(ctx, "select c.confrelid::regclass::text target from pg_constraint c where c.conrelid in (select oid from pg_class where relnamespace=$1::regnamespace) and c.contype='f' order by 1", [ENT_SCHEMA]);
    // behavioural: a conflicting subscription_entitlements row, a meal record and a retention grant table row never change the answer
    await admit(p, owner, 'sub-1', 'paid', at(10), at(40)); await advance(p, owner, at(100));
    const before = [await stateAt(ctx, owner, at(5)), await stateAt(ctx, owner, at(20)), await stateAt(ctx, owner, at(60))].map(view);
    await ctx.g.query(ctx.su, "insert into public.subscription_entitlements(user_id,plan_code,entitlement_source,valid_from,valid_until) values ($1,'premium','synthetic',$2,null)", [owner, at(0)]);
    const after = [await stateAt(ctx, owner, at(5)), await stateAt(ctx, owner, at(20)), await stateAt(ctx, owner, at(60))].map(view);
    const txTs = defs.filter(d => /transaction_timestamp|statement_timestamp/i.test(d.def.replace(/^[\s\S]*?AS \$function\$/, ''))).map(d => d.proname); // R2: NO function reads the transaction or statement time (nothing depends on transaction age)
    const ok = bodyHits.length === 0 && same(txTs, []) && Object.entries(clockUses).every(([k, n]) => ({ entitlement_state_at: 1, admit_entitlement_event: 2, advance_entitlement_coverage: 3, guard_producer_update: 1 }[k] ?? 0) === n)
      && /v_sampled := pg_catalog\.clock_timestamp\(\);\s+IF p_instant > v_sampled THEN/.test(stateDef) && sixRefs === 0 && same(fkTargets.map(f => f.target), ['auth.users', 'auth.users', 'retention_entitlement.producers', 'retention_entitlement.producers'])
      && oneStatement && same(before, after) && is(before[0], 'free') && is(before[1], 'paid', 'paid_subscription') && is(before[2], 'free');
    return R(ok, { bodyHits, clockUses, oneStatement, sixRefs, fkTargets, before, after });
  },
  // ---- migration-level negatives -----------------------------------------------------------------------------
  async N11_MIGRATION_PRECONDITIONS_FAIL_CLOSED(ctx) { throw Error('N11 runs through runGate'); },
  async N12_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT(ctx) { throw Error('N12 runs through runGate'); }
});

// ---- R1 controls: registry effective window, never-retroactive registry, authority window, commit bound, concurrency, oracle differential, model limits ------------------------------------
// R2: registered_at NULL = stamped by the registry guard (>= the next whole millisecond after the clock the guard reads once the writer holds its lock); an explicit value is accepted only if it is not earlier than that bound
async function plainProducer(ctx, ns, { role = 'ent_p_' + ns.replace(/[^a-z0-9]/g, '_'), regSql = 'null', retSql = 'null', grant = true } = {}) {
  ctx.extraRoles.add(role);
  await ctx.g.query(ctx.su, 'create role ' + role + ' login');
  if (grant) {
    await ctx.g.query(ctx.su, 'grant usage on schema ' + ENT_SCHEMA + ' to ' + role);
    for (const [fn, args] of FN_SIGS) await ctx.g.query(ctx.su, 'grant execute on function ' + ENT_SCHEMA + '.' + fn + '(' + args + ') to ' + role);
  }
  // NO replica role: the registry guards are ACTIVE for this insert
  const r = await ctx.g.query(ctx.su, 'insert into ' + ENT_SCHEMA + '.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,' + regSql + ',' + retSql + ') returning registered_at', [ns, role]);
  return { ns, role, registeredAt: r.rows[0].registered_at.toISOString(), c: await ctx.open(role) };
}
const code = r => r.ok ? 'OK' : r.code + ' ' + r.message.slice(0, 48);
const sqlCode = (ctx, text, values = []) => ctx.g.query(ctx.su, text, values).then(() => 'OK', e => e.code + ' ' + String(e.message).slice(0, 48));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const names = x => x.evidence.coverage.map(y => y.namespace);
// independent oracle of the stated contract (R-2/R-3/R-4); reads only the stored rows
function oracleState(producers, events, coverage, instantIso) {
  const I = Date.parse(instantIso);
  const required = producers.filter(p => Date.parse(p.registered_at) <= I && (p.retired_at === null || I < Date.parse(p.retired_at))).sort((a, b) => (a.namespace < b.namespace ? -1 : 1));
  const hits = events.filter(e => Date.parse(e.valid_from) <= I && I < Date.parse(e.valid_until));
  const cov = required.map(p => { const c = coverage.find(x => x.namespace === p.namespace); return { namespace: p.namespace, covered_through: c ? c.covered_through : null, revision: c ? Number(c.revision) : null }; });
  const hasPaid = hits.some(e => e.class === 'paid'), hasTrial = hits.some(e => e.class === 'trial');
  let state, basis = null, reason = null;
  if (hasPaid || hasTrial) { state = 'paid'; basis = hasPaid ? 'paid_subscription' : 'trial'; }
  else if (required.length === 0) { state = 'unknown'; reason = 'NO_REQUIRED_PRODUCER'; }
  else if (cov.some(c => c.covered_through === null || Date.parse(c.covered_through) < I)) { state = 'unknown'; reason = 'COVERAGE_SHORT'; }
  else state = 'free';
  return { state, basis, reason, events: hits.map(e => e.event_id).sort(), coverage: cov };
}
// ---- R2 consistency harness (timing scenarios S01-S17 of the R2 scope proposal) -----------------------------------------------------------------------------------------
// Each gate drives real concurrent sessions against the installed migration: registry writers, readers and producers on separate connections, a lock observer on a third. An answer of state free/paid
// is a VIOLATION when the FINAL state (every transaction finished, so nothing can wait any more) contradicts it; an unknown answer promises nothing and is never a violation.
const ISOFMT = '\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\'';
const msFloor = "date_trunc('milliseconds', clock_timestamp())";
const rows1 = async (c, text, v = []) => (await c.query(text, v)).rows;
const fmtAt = async (c, expr) => (await rows1(c, `select to_char((${expr}) at time zone 'UTC', ${ISOFMT}) t`))[0].t;
const pidOf = async c => (await rows1(c, 'select pg_backend_pid() p'))[0].p;
const stOf = s => s ? `${s.state}${s.basis ? '/' + s.basis : ''}${s.reason ? '(' + s.reason + ')' : ''}` : 'ERROR';
const errOf = e => `${e.code ?? 'conn'} ${String(e.message).split('\n')[0]}`;
const sqlTry = (c, text, v = []) => c.query(text, v).then(() => 'OK', e => e.code + ' ' + String(e.message).slice(0, 48));
async function blockedOn(obs, pid, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = (await rows1(obs, 'select wait_event_type from pg_stat_activity where pid=$1', [pid]))[0]; if (r && r.wait_event_type === 'Lock') return true; await sleep(20); } return false; }
const ENT_FUNCS = ['entitlement_state_at(uuid, timestamp with time zone)', 'admit_entitlement_event(uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint)', 'advance_entitlement_coverage(uuid, text, timestamp with time zone)'];
const regSql = ns => `insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at) values ('${ns}','r_${ns.replace(/[^a-z0-9]/g, '_')}',null) returning to_char(registered_at at time zone 'UTC',${ISOFMT}) r`;
const retireSql = ns => `update ${ENT_SCHEMA}.producers set retired_at = date_trunc('milliseconds', clock_timestamp()) + interval '30 milliseconds' where namespace='${ns}' returning to_char(retired_at at time zone 'UTC',${ISOFMT}) t`;
const admitSql = (ns, id, owner = '$1') => `select ${ENT_SCHEMA}.admit_entitlement_event(${owner}::uuid,'${ns}','${id}','paid',date_trunc('milliseconds', now()+interval '1 day'),date_trunc('milliseconds', now()+interval '5 days')) s`;
async function consFixture(ctx) {
  const owner = await makeUser(ctx, 701), owner2 = await makeUser(ctx, 702);
  const pa = await makeProducer(ctx, 'prod-a');
  ctx.extraRoles.add('acc_reader'); await ctx.su.query('create role acc_reader login');
  await ctx.su.query(`grant usage on schema ${ENT_SCHEMA} to acc_reader`);
  await ctx.su.query(`grant execute on function ${ENT_SCHEMA}.${ENT_FUNCS[0]} to acc_reader`);
  ctx.extraRoles.add('acc_writer'); await ctx.su.query('create role acc_writer login nosuperuser bypassrls');
  await ctx.su.query(`grant usage on schema ${ENT_SCHEMA} to acc_writer`);
  await ctx.su.query(`grant select, insert, update, delete on ${ENT_SCHEMA}.producers to acc_writer`);
  const f = { ctx, owner, owner2, pa, rd: await ctx.open('acc_reader'), w: await ctx.open('acc_writer'), obs: await ctx.open('supabase_admin'), pending: [] };
  f.pid = { rd: await pidOf(f.rd), w: await pidOf(f.w), pa: await pidOf(pa.c) };
  // coverage of prod-a up to an instant T chosen NOW. Under R2 the call waits for any open registry write (that is the contract), so it is STARTED on its own connection and only given a short head start.
  f.advance = async (o = owner) => {
    const c = await ctx.open(pa.role); const T = await fmtAt(f.obs, msFloor);
    const p = c.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz)`, [o, T]).then(() => 'ok', e => errOf(e));
    f.pending.push(p); await Promise.race([p, sleep(150)]); return T;
  };
  f.now = async () => fmtAt(f.obs, msFloor);
  f.final = async (I, o = owner) => { await Promise.all(f.pending); return stOf((await rows1(ctx.su, `select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [o, I]))[0].s); };
  f.resolve = async (c, I, o = owner) => {
    const t0 = Date.now();
    try { const s = (await c.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [o, I])).rows[0].s; return { answer: stOf(s), ms: Date.now() - t0, ns: s.evidence.coverage.map(x => x.namespace), sampled_at: s.sampled_at ?? null }; }
    catch (e) { return { error: errOf(e), ms: Date.now() - t0 }; }
  };
  // 'default' restores whatever lock_timeout the installed migration itself sets on each function (read once, so a changed migration value is respected)
  f.migrationTimeouts = {}; for (const sig of ENT_FUNCS) f.migrationTimeouts[sig] = (await rows1(ctx.su, `select (select regexp_replace(c, '^lock_timeout=', '') from unnest(p.proconfig) c where c like 'lock_timeout=%') v from pg_proc p where p.oid = '${ENT_SCHEMA}.${sig}'::regprocedure`))[0].v;
  f.setTimeouts = async s => { for (const sig of ENT_FUNCS) await ctx.su.query(`alter function ${ENT_SCHEMA}.${sig} set lock_timeout='${s === 'default' ? f.migrationTimeouts[sig] : s}'`); };
  f.counts = async () => (await rows1(ctx.su, `select (select count(*)::int from ${ENT_SCHEMA}.entitlement_events) e, (select count(*)::int from ${ENT_SCHEMA}.entitlement_coverage) c, (select count(*)::int from ${ENT_SCHEMA}.producers) p`))[0];
  return f;
}
async function openWriter(f, ns, { all = false, retire = false } = {}) {
  const w = f.w; await w.query('begin'); if (all) await w.query('set constraints all immediate');
  const row = (await rows1(w, retire ? retireSql(ns) : regSql(ns)))[0];
  return { row, pid: await pidOf(w), commit: () => w.query('commit'), rollback: () => w.query('rollback') };
}
const retireNow = async (f, ns) => { const rt = await openWriter(f, ns, { retire: true }); await rt.commit(); await sleep(120); };
// completeness of the evidence and the V-READ check; a lock-timeout unknown promises nothing and is exempt
async function verdict(f, readers) {
  const v = [];
  for (const r of readers) {
    if (!r.answer) { if (r.error && !r.allowError) v.push({ type: 'V-ERR', ...r }); continue; }
    const timedOut = /(REGISTRY|OWNER)_LOCK_TIMEOUT/.test(r.answer);
    if (!timedOut && r.mustSee && !(r.ns ?? []).includes(r.mustSee)) v.push({ type: 'V-INCOMPLETE-EVIDENCE', label: r.label, answered: r.answer, missing: r.mustSee });
    if (!timedOut && r.mustNotSee && (r.ns ?? []).includes(r.mustNotSee)) v.push({ type: 'V-PHANTOM-EVIDENCE', label: r.label, answered: r.answer, phantom: r.mustNotSee });
    if (/^(free|paid)/.test(r.answer)) { const fin = await f.final(r.I, r.o); if (fin.split('/')[0] !== r.answer.split('/')[0]) v.push({ type: 'V-READ', label: r.label, answered: r.answer, final: fin, I: r.I }); }
  }
  return v;
}
const passOf = (chk, viol) => Object.values(chk).every(Boolean) && viol.length === 0;

Object.assign(GATES, {
  async P15_REGISTRY_EFFECTIVE_WINDOW_BOUNDARIES(ctx) {
    const o = await makeUser(ctx, 40), o2 = await makeUser(ctx, 41);
    const a = await makeProducer(ctx, 'billing-a');
    const b = await makeProducer(ctx, 'billing-b', { registeredAt: at(30) });
    await advance(a, o, at(100));
    const reg = {};
    for (const [k, d] of Object.entries({ before: at(30, -1), exact: at(30), after: at(30, 1) })) reg[k] = await stateAt(ctx, o, d);
    const c = await makeProducer(ctx, 'billing-c');
    await makeProducer(ctx, 'billing-d', { retiredAt: at(50) });
    for (const p of [a, b, c]) await advance(p, o2, at(100));
    await regWrite(ctx, 'insert into ' + ENT_SCHEMA + ".entitlement_coverage(owner_user_id,namespace,covered_through,revision) values ($1,'billing-d',$2,1)", [o2, at(40)]); // d attested only through day 40 before it retired at day 50
    await regWrite(ctx, 'insert into ' + ENT_SCHEMA + ".entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing-d','kept','paid',$2,$3,$4)", [o2, at(52), at(60), '0'.repeat(64)]); // a fact admitted before the retirement stays
    const ret = {};
    for (const [k, d] of Object.entries({ before: at(50, -1), exact: at(50), after: at(50, 1), keptFact: at(55) })) ret[k] = await stateAt(ctx, o2, d);
    const ok = is(reg.before, 'free') && same(names(reg.before), ['billing-a'])
      && is(reg.exact, 'unknown', null, 'COVERAGE_SHORT') && same(names(reg.exact), ['billing-a', 'billing-b']) && is(reg.after, 'unknown', null, 'COVERAGE_SHORT')
      && is(ret.before, 'unknown', null, 'COVERAGE_SHORT') && same(names(ret.before), ['billing-a', 'billing-b', 'billing-c', 'billing-d'])
      && is(ret.exact, 'free') && same(names(ret.exact), ['billing-a', 'billing-b', 'billing-c']) && is(ret.after, 'free') && is(ret.keptFact, 'paid', 'paid_subscription');
    return R(ok, { reg: Object.fromEntries(Object.entries(reg).map(([k, x]) => [k, { ...view(x), required: names(x) }])), ret: Object.fromEntries(Object.entries(ret).map(([k, x]) => [k, { ...view(x), required: names(x) }])) });
  },
  async P16_PROVEN_ANSWERS_SURVIVE_REGISTRY_CHANGES(ctx) {
    const o = await makeUser(ctx, 42), o3 = await makeUser(ctx, 43);
    const a = await makeProducer(ctx, 'billing-a');
    await admit(a, o, 's1', 'paid', at(40), at(60)); await advance(a, o, at(100)); await advance(a, o3, at(100));
    const before = { free: view(await stateAt(ctx, o, at(20))), paid: view(await stateAt(ctx, o, at(50))) };
    // case 1 (free -> paid): a producer registered now cannot overturn a proven Free for an earlier instant
    const b = await plainProducer(ctx, 'billing-b');
    const backfill = await admit(b, o, 'late-1', 'paid', at(15), at(25));
    const afterB = { free: view(await stateAt(ctx, o, at(20))), paid: view(await stateAt(ctx, o, at(50))) };
    // case 2 (free -> unknown): a registration dated in the past is refused
    const backdatedReg = await sqlCode(ctx, 'insert into ' + ENT_SCHEMA + ".producers(namespace, role_name, registered_at) values ('billing-x','nobody',$1)", [at(0)]);
    const afterX = view(await stateAt(ctx, o, at(20)));
    // case 3 (unknown -> free): a retirement dated in the past is refused; a future-dated one leaves that instant unknown
    const e = await plainProducer(ctx, 'billing-e');
    const I = e.registeredAt;
    const unknownBefore = view(await stateAt(ctx, o3, I));
    const backdatedRetire = await sqlCode(ctx, 'update ' + ENT_SCHEMA + ".producers set retired_at=registered_at + interval '1 millisecond' where namespace='billing-e'");
    const unknownAfterRefused = view(await stateAt(ctx, o3, I));
    const futureRetire = await sqlCode(ctx, 'update ' + ENT_SCHEMA + ".producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '1 day') where namespace='billing-e'");
    const unknownAfterFuture = view(await stateAt(ctx, o3, I));
    const ok = same(before.free, { state: 'free', basis: null, reason: null, events: [] }) && before.paid.state === 'paid'
      && !backfill.ok && backfill.code === '23514' && backfill.message.startsWith('ENT_EVENT_BEFORE_PRODUCER_REGISTRATION') && same(afterB, before)
      && backdatedReg.startsWith('23514') && backdatedReg.includes('ENT_PRODUCER_RETROACTIVE') && same(afterX, before.free)
      && unknownBefore.state === 'unknown' && unknownBefore.reason === 'COVERAGE_SHORT'
      && backdatedRetire.includes('ENT_PRODUCER_RETROACTIVE') && same(unknownAfterRefused, unknownBefore) && futureRetire === 'OK' && same(unknownAfterFuture, unknownBefore);
    return R(ok, { before, backfill: code(backfill), afterB, backdatedReg, afterX, unknownBefore, backdatedRetire, unknownAfterRefused, futureRetire, unknownAfterFuture });
  },
  async P17_STATE_AT_EQUALS_AN_INDEPENDENT_ORACLE_OVER_REPRESENTABLE_DATA(ctx) {
    // deterministic pseudo-random scenarios; every accepted/refused write is whatever the real functions decide; the oracle sees only the stored rows
    let seed = 20261010; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)], int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
    const P = { p1: await makeProducer(ctx, 'billing-1'), p2: await makeProducer(ctx, 'billing-2'), p3: await makeProducer(ctx, 'trial-3', { registeredAt: at(20) }), p4: await makeProducer(ctx, 'billing-4', { retiredAt: at(40) }) };
    const list = Object.values(P);
    const outcomes = {}; let mismatches = []; let compared = 0; let invariantViolations = 0;
    for (let n = 0; n < 60; n++) {
      const o = await makeUser(ctx, 5000 + n); let idn = 0;
      for (let k = 0; k < 14; k++) {
        const p = pick(list);
        if (rnd() < 0.62) { const from = int(0, 70), len = int(1, 28); const r = await admit(p, o, 'e' + (idn++), pick(['paid', 'trial']), at(from, pick([0, 0, 0, 1, -1])), at(from + len)); outcomes[code(r).slice(0, 34)] = (outcomes[code(r).slice(0, 34)] ?? 0) + 1; }
        else { const r = await advance(p, o, at(int(0, 95))); outcomes['adv ' + code(r).slice(0, 30)] = (outcomes['adv ' + code(r).slice(0, 30)] ?? 0) + 1; }
      }
      if (n % 7 === 0) await regWrite(ctx, 'insert into ' + ENT_SCHEMA + ".entitlement_events(owner_user_id,namespace,upstream_event_id,class,valid_from,valid_until,semantic_digest) values ($1,'billing-4','pre-retire',$2,$3,$4,$5)", [o, pick(['paid', 'trial']), at(30), at(60), String(n).padStart(64, '0')]); // a fact admitted before the retirement of billing-4
      const prod = (await q(ctx, 'select namespace, registered_at, retired_at from ' + ENT_SCHEMA + '.producers')).map(x => ({ namespace: x.namespace, registered_at: x.registered_at.toISOString(), retired_at: x.retired_at ? x.retired_at.toISOString() : null }));
      const ev = (await q(ctx, 'select event_id, namespace, class, valid_from, valid_until from ' + ENT_SCHEMA + '.entitlement_events where owner_user_id=$1', [o])).map(x => ({ event_id: x.event_id, namespace: x.namespace, class: x.class, valid_from: x.valid_from.toISOString(), valid_until: x.valid_until.toISOString() }));
      const cov = (await q(ctx, 'select namespace, covered_through, revision from ' + ENT_SCHEMA + '.entitlement_coverage where owner_user_id=$1', [o])).map(x => ({ namespace: x.namespace, covered_through: x.covered_through.toISOString(), revision: Number(x.revision) }));
      for (const e of ev) { const reg = prod.find(x => x.namespace === e.namespace).registered_at; if (e.namespace !== 'billing-4' && Date.parse(e.valid_from) < Date.parse(reg)) invariantViolations++; }
      const instants = []; for (let d = 0; d <= 96; d += 1) instants.push(at(d)); for (const x of [at(20, -1), at(20), at(40, -1), at(40)]) instants.push(x);
      for (const I of instants) {
        const sql = await stateAt(ctx, o, I); const want = oracleState(prod, ev, cov, I); compared++;
        const got = { state: sql.state, basis: sql.basis, reason: sql.reason, events: sql.evidence.events.slice().sort(), coverage: sql.evidence.coverage.map(c => ({ namespace: c.namespace, covered_through: c.covered_through ? new Date(c.covered_through).toISOString() : null, revision: c.revision === null ? null : Number(c.revision) })) };
        if (!same(got, want) && mismatches.length < 5) mismatches.push({ owner: n, I, got, want });
        else if (!same(got, want)) mismatches.push(null);
      }
    }
    return R(mismatches.length === 0 && invariantViolations === 0 && compared > 5000, { compared, mismatchCount: mismatches.length, firstMismatches: mismatches.filter(Boolean), invariantViolations, outcomes });
  },
  async N13_PRODUCER_CANNOT_ASSERT_BEFORE_ITS_REGISTRATION(ctx) {
    const o = await makeUser(ctx, 44);
    const b = await makeProducer(ctx, 'billing-b', { registeredAt: at(30) });
    const res = {
      oneMsBefore: code(await admit(b, o, 'e1', 'paid', at(30, -1), at(40))),
      straddling: code(await admit(b, o, 'e2', 'trial', at(20), at(34))),
      exact: code(await admit(b, o, 'e3', 'paid', at(30), at(40))),
      later: code(await admit(b, o, 'e4', 'paid', at(35), at(45)))
    };
    const replay = await admit(b, o, 'e3', 'paid', at(30), at(40));
    const rows = await count(ctx, ENT_SCHEMA + '.entitlement_events');
    const ok = res.oneMsBefore.startsWith('23514 ENT_EVENT_BEFORE_PRODUCER_REGISTRATION') && res.straddling.startsWith('23514 ENT_EVENT_BEFORE_PRODUCER_REGISTRATION') && res.exact === 'OK' && res.later === 'OK'
      && replay.ok && replay.value.outcome === 'replayed' && rows === 2;
    return R(ok, { res, replay: code(replay), rows });
  },
  async N14_REGISTRY_ROWS_ARE_NEVER_RETROACTIVE_OR_DELETED(ctx) {
    // R2: the writer's own clock reading, taken once it holds the registry lock, defines the earliest allowed effective time (floor_ms(clock)+1ms); registered_at NULL is stamped with that bound.
    // 'ns-old' is a fixture registered long ago, so retiring it in the past is refused by the registry GUARD (the R1 version of this control updated a row it had never managed to insert).
    const ins = (ns, role, reg, ret = 'null') => sqlCode(ctx, 'insert into ' + ENT_SCHEMA + '.producers(namespace, role_name, registered_at, retired_at) values (' + ns + ',' + role + ',' + reg + ',' + ret + ')');
    const NOWMS = "date_trunc('milliseconds', clock_timestamp())", FUT = "date_trunc('milliseconds', clock_timestamp() + interval '1 day')", PAST = "timestamptz '2026-01-01T00:00:00Z'";
    await makeProducer(ctx, 'ns-old');
    const r = {
      insertRegisteredInPast: await ins("'ns-a'", "'r_a'", PAST),
      insertRegisteredExplicitNow: await ins("'ns-b'", "'r_b'", NOWMS), // R1 accepted 'now'; R2 requires the NEXT millisecond after the guard's own reading
      insertRegisteredStamped: await ins("'ns-b'", "'r_b'", 'null'),
      insertRegisteredFuture: await ins("'ns-c'", "'r_c'", FUT),
      insertAlreadyRetiredInPast: await ins("'ns-d'", "'r_d'", FUT, PAST)
    };
    const upd = t => sqlCode(ctx, 'update ' + ENT_SCHEMA + '.producers set ' + t);
    r.updateRetireInPast = await upd("retired_at=timestamptz '2026-01-02T00:00:00Z' where namespace='ns-old'");
    r.updateRetireExplicitNow = await upd('retired_at=' + NOWMS + " where namespace='ns-old'");
    r.updateRetireFuture = await upd("retired_at=date_trunc('milliseconds', clock_timestamp() + interval '1 day') where namespace='ns-old'");
    r.updateRetireAgain = await upd("retired_at=date_trunc('milliseconds', clock_timestamp() + interval '2 days') where namespace='ns-old'");
    r.updateUnretire = await upd("retired_at=null where namespace='ns-old'");
    r.updateRegisteredAt = await upd("registered_at=registered_at + interval '1 second' where namespace='ns-c'");
    r.deleteUnused = await sqlCode(ctx, 'delete from ' + ENT_SCHEMA + ".producers where namespace='ns-c'");
    r.deleteRetired = await sqlCode(ctx, 'delete from ' + ENT_SCHEMA + ".producers where namespace='ns-old'");
    const stamped = (await q(ctx, 'select registered_at, (registered_at = date_trunc(\'milliseconds\', registered_at)) ms from ' + ENT_SCHEMA + ".producers where namespace='ns-b'"))[0];
    const rows = await count(ctx, ENT_SCHEMA + '.producers'), targets = await count(ctx, ENT_SCHEMA + '.producers', "namespace in ('ns-old','ns-b','ns-c')");
    const ok = r.insertRegisteredInPast.includes('ENT_PRODUCER_RETROACTIVE') && r.insertRegisteredExplicitNow.includes('ENT_PRODUCER_RETROACTIVE') && r.insertRegisteredStamped === 'OK' && !!stamped && stamped.ms && r.insertRegisteredFuture === 'OK'
      && r.insertAlreadyRetiredInPast.includes('ENT_PRODUCER_RETROACTIVE')
      && r.updateRetireInPast.includes('ENT_PRODUCER_RETROACTIVE') && r.updateRetireExplicitNow.includes('ENT_PRODUCER_RETROACTIVE') && r.updateRetireFuture === 'OK' && r.updateRetireAgain.includes('ENT_PRODUCER_IMMUTABLE') && r.updateUnretire.includes('ENT_PRODUCER_IMMUTABLE')
      && r.updateRegisteredAt.includes('ENT_PRODUCER_IMMUTABLE') && r.deleteUnused.includes('ENT_PRODUCER_IMMUTABLE') && r.deleteRetired.includes('ENT_PRODUCER_IMMUTABLE') && rows === 3 && targets === 3;
    return R(ok, { r, rows, targets, stampedAtWholeMs: stamped?.ms ?? null });
  },
  async N15_AUTHORISATION_FOLLOWS_THE_EFFECTIVE_WINDOW(ctx) {
    const o = await makeUser(ctx, 45);
    const reg = "date_trunc('milliseconds', clock_timestamp() + interval '1500 milliseconds')";
    const p1 = await plainProducer(ctx, 'future-reg', { regSql: reg });
    const early = { admit: code(await admit(p1, o, 'x', 'paid', p1.registeredAt, '2036-01-01T00:00:00.000Z')), advance: code(await advance(p1, o, new Date(Date.now() - 1000).toISOString())) };
    await sleep(1800);
    const later = { admit: code(await admit(p1, o, 'x', 'paid', p1.registeredAt, '2036-01-01T00:00:00.000Z')) };
    const p2 = await plainProducer(ctx, 'future-retire');
    await sqlCode(ctx, 'update ' + ENT_SCHEMA + ".producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '1500 milliseconds') where namespace='future-retire'");
    const stillOpen = { admit: code(await admit(p2, o, 'y', 'paid', p2.registeredAt, '2036-01-01T00:00:00.000Z')), advance: code(await advance(p2, o, new Date(Date.now() - 500).toISOString())) };
    await sleep(1800);
    const closed = { admit: code(await admit(p2, o, 'z', 'paid', p2.registeredAt, '2036-01-01T00:00:00.000Z')), advance: code(await advance(p2, o, new Date(Date.now() - 100).toISOString())), replay: code(await admit(p2, o, 'y', 'paid', p2.registeredAt, '2036-01-01T00:00:00.000Z')) };
    const kept = await count(ctx, ENT_SCHEMA + '.entitlement_events', "upstream_event_id='y'"); // the fact admitted before the retirement stays
    const ok = early.admit.startsWith('42501 ENT_PRODUCER_NOT_AUTHORIZED') && early.advance.startsWith('42501') && later.admit === 'OK'
      && stillOpen.admit === 'OK' && stillOpen.advance === 'OK' && closed.admit.startsWith('42501') && closed.advance.startsWith('42501') && closed.replay.startsWith('42501') && kept === 1;
    return R(ok, { early, later, stillOpen, closed, keptFactRows: kept });
  },
  async N16_UNREPRESENTABLE_EVENTS_ARE_NOT_SILENTLY_HANDLED(ctx) {
    const o = await makeUser(ctx, 46);
    const a = await makeProducer(ctx, 'billing-a'); const t = await makeProducer(ctx, 'trial-a');
    await advance(a, o, at(100)); await advance(t, o, at(100));
    const defs = await q(ctx, "select p.proname from pg_proc p where p.pronamespace=$1::regnamespace and p.prosecdef order by 1", [ENT_SCHEMA]);
    const hasCancelApi = defs.some(d => /cancel|refund|void|revoke|correct|retract/i.test(d.proname));
    const sameKey = { a: await admit(a, o, 'sub', 'paid', at(101), at(131)) , b: null };
    sameKey.b = await admit(a, o, 'sub', 'paid', at(101), at(120)); // "correction" of the same key
    const shorter = await admit(a, o, 'sub-shorter', 'paid', at(101), at(110)); // a later, shorter fact: it does NOT cancel the longer one
    const mid = await stateAt(ctx, o, at(115));
    const afterEnd = await stateAt(ctx, o, at(131, 0)); // end of the last fact: "not renewed", beyond coverage -> unknown, never "cancelled"
    const rows = await count(ctx, ENT_SCHEMA + '.entitlement_events');
    const ok = !hasCancelApi && defs.length === 3 && sameKey.a.ok && !sameKey.b.ok && sameKey.b.code === '23505' && shorter.ok && is(mid, 'paid', 'paid_subscription') && mid.evidence.events.length === 1 && rows === 2
      && afterEnd.state === 'unknown';
    return R(ok, { definerFunctions: defs.map(d => d.proname), hasCancelApi, sameKeyCorrection: code(sameKey.b), shorterLaterFact: code(shorter), stateInsideLongerFact: view(mid), rows, afterEnd: view(afterEnd), notHandled: ['cancellation', 'refund', 'void', 'correction'], note: 'These events are not representable; ENT0 does not claim to handle them. A fact that ends only means not renewed.' });
  },
  async N17_REGISTRY_STAMP_IS_TAKEN_AFTER_THE_LOCK(ctx) {
    // R2 replaces the R1 gate "5 s commit bound": there is NO deferred or commit-time check any more. The registry guard judges every write at STATEMENT time with the clock it reads once the writer holds the registry lock,
    // so transaction age, SET CONSTRAINTS (ALL or named, any mode switching), a long transaction and the time COMMIT takes cannot change the outcome.
    const f = await consFixture(ctx); const out = {}, chk = {};
    const w = f.w, c = await ctx.open('supabase_admin');
    // (1) stamp trials: registered_at NULL is stamped strictly after every clock reading taken before the statement, never later than the next whole millisecond after a reading taken after it, whole ms
    let bad = 0; const N = 120;
    for (let i = 0; i < N; i++) {
      await w.query('begin');
      const r0 = (await rows1(w, 'select clock_timestamp() c0'))[0].c0;
      const row = (await rows1(w, 'insert into ' + ENT_SCHEMA + ".producers(namespace,role_name,registered_at) values ('s17-" + i + "','r_s17_" + i + "',null) returning registered_at, clock_timestamp() c1"))[0];
      await w.query('rollback');
      if (!(row.registered_at > r0) || row.registered_at > new Date(Math.floor(row.c1.getTime()) + 1) || row.registered_at.getTime() % 1 !== 0) bad++;
    }
    out.stampTrials = { n: N, outsideBounds: bad }; chk.stampWithinBounds = bad === 0;
    // (2) explicit values: k whole ms added to floor_ms(clock) evaluated BEFORE the guard's own, later reading: k<=0 is never accepted, k>=2 always is; k=1 depends on the race and is only recorded
    const acc = {}; for (const k of [-1, 0, 1, 2, 3]) { acc[k] = 0; for (let i = 0; i < 60; i++) { await w.query('begin'); const r = await sqlTry(w, 'insert into ' + ENT_SCHEMA + ".producers(namespace,role_name,registered_at) values ('s17e-" + k + '-' + i + "','r_s17e_" + (k + 1) + '_' + i + "'," + msFloor + " + interval '" + k + " milliseconds')"); await w.query('rollback'); if (r === 'OK') acc[k]++; } }
    out.explicitAcceptedOf60 = acc; chk.explicitBoundary = acc[-1] === 0 && acc[0] === 0 && acc[2] === 60 && acc[3] === 60;
    // (3) long transactions and constraint modes: a NULL-stamped registration commits after 6.5 s (R1 refused it after 5 s); an explicit value taken from the stale transaction start is refused at the statement, not at commit
    const tx = async (stmts, { sleepMs = 0, pre = [] } = {}) => {
      await c.query('begin');
      try { for (const s of pre) await c.query(s); for (const s of stmts) await c.query(s); if (sleepMs) await c.query('select pg_sleep(' + (sleepMs / 1000) + ')'); await c.query('commit'); return 'OK'; }
      catch (e) { await c.query('rollback').catch(() => {}); return e.code + ' ' + String(e.message).slice(0, 48); }
    };
    const insSql = (ns, reg) => 'insert into ' + ENT_SCHEMA + ".producers(namespace, role_name, registered_at) values ('" + ns + "','r_" + ns.replace(/-/g, '_') + "'," + reg + ')';
    const STALE = "date_trunc('milliseconds', transaction_timestamp())";
    const L = {
      nullStampedLong: await tx([insSql('b17-1', 'null')], { sleepMs: 6500 }),
      nullStampedLongImmediateAll: await tx([insSql('b17-2', 'null')], { sleepMs: 6500, pre: ['set constraints all immediate'] }),
      nullStampedModeSwitching: await tx([insSql('b17-3', 'null')], { sleepMs: 1500, pre: ['set constraints all immediate', 'set constraints all deferred', 'set constraints all immediate'] }),
      staleExplicitAfterWait: await tx(['select pg_sleep(1.5)', insSql('b17-4', STALE)]),
      staleExplicitAfterWaitImmediateAll: await tx(['select pg_sleep(1.5)', insSql('b17-5', STALE)], { pre: ['set constraints all immediate'] }),
      namedR1ConstraintNoLongerExists: await tx([], { pre: ['set constraints ' + ENT_SCHEMA + '.producer_commit_bound immediate'] }),
      retireFutureAfterLongTransaction: await tx(['update ' + ENT_SCHEMA + ".producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '1 day') where namespace='b17-1'"], { sleepMs: 6500 }),
      retireStaleAfterWait: await tx(['select pg_sleep(1.5)', 'update ' + ENT_SCHEMA + ".producers set retired_at=" + STALE + " where namespace='b17-3'"])
    };
    out.long = L;
    const present = (await q(ctx, 'select namespace from ' + ENT_SCHEMA + ".producers where namespace like 'b17-%' order by 1")).map(x => x.namespace);
    chk.longNullStampedCommits = L.nullStampedLong === 'OK' && L.nullStampedLongImmediateAll === 'OK' && L.nullStampedModeSwitching === 'OK';
    chk.staleExplicitRefusedAtStatement = L.staleExplicitAfterWait.includes('ENT_PRODUCER_RETROACTIVE') && L.staleExplicitAfterWaitImmediateAll.includes('ENT_PRODUCER_RETROACTIVE') && L.retireStaleAfterWait.includes('ENT_PRODUCER_RETROACTIVE');
    chk.noCommitTimeCheckLeft = L.namedR1ConstraintNoLongerExists.startsWith('42704') && L.retireFutureAfterLongTransaction === 'OK' && same(present, ['b17-1', 'b17-2', 'b17-3']);
    chk.noDeferredTrigger = (await count(ctx, 'pg_trigger', "tgrelid='" + ENT_SCHEMA + ".producers'::regclass and not tgisinternal")) === 1;
    // (4) a writer that waited for a row lock is stamped AFTER the wait
    const holder = await ctx.open('supabase_admin'); await holder.query('begin'); await holder.query('select 1 from ' + ENT_SCHEMA + ".producers where namespace='prod-a' for update");
    await w.query('begin'); const t0 = (await rows1(w, 'select clock_timestamp() c'))[0].c;
    const upd = w.query('update ' + ENT_SCHEMA + ".producers set retired_at=date_trunc('milliseconds', clock_timestamp()) + interval '1 day' where namespace='prod-a'").then(() => 'OK', e => e.code);
    const waited = await blockedOn(f.obs, f.pid.w, 1500); await sleep(700); await holder.query('commit'); const ur = await upd;
    const reg = (await rows1(w, 'insert into ' + ENT_SCHEMA + ".producers(namespace,role_name,registered_at) values ('b17-after-wait','r_b17aw',null) returning registered_at"))[0].registered_at; await w.query('commit');
    out.afterLockWait = { blocked: waited, update: ur, stampMinusClockBeforeWaitMs: reg.getTime() - t0.getTime() };
    chk.stampAfterTheLockWait = waited && ur === 'OK' && reg.getTime() - t0.getTime() >= 700;
    return R(Object.values(chk).every(Boolean), { chk, out });
  },
  async N18_CONCURRENT_REQUESTS_AND_LOCK_ORDER(ctx) {
    // (a) lock order: a call that started before the retirement but waited on the per-owner lock until after it must be refused.
    // R2: each wait inside a call is bounded by the function-level lock_timeout (2 s); the whole wait here (about 1.3 s) stays below it. A longer wait is a separate, tested outcome (N22: 55P03 and nothing written).
    const o = await makeUser(ctx, 47);
    const p = await plainProducer(ctx, 'lock-order');
    await sqlCode(ctx, 'update ' + ENT_SCHEMA + ".producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '900 milliseconds') where namespace='lock-order'");
    const c1 = p.c, c2 = await ctx.open(p.role);
    await c1.query('begin');
    const first = await admit({ ns: 'lock-order', c: c1 }, o, 'held', 'paid', p.registeredAt, '2036-01-01T00:00:00.000Z'); // authorised, uncommitted, holds the lock
    const waiting = admit({ ns: 'lock-order', c: c2 }, o, 'waited', 'paid', p.registeredAt, '2036-01-01T00:00:00.000Z'); // starts before the retirement, blocks on the lock
    await sleep(1300); // the retirement time passes while it waits
    const stillBlocked = await Promise.race([waiting.then(() => 'RETURNED'), sleep(50).then(() => 'STILL_WAITING')]);
    await c1.query('commit');
    const late = await waiting;
    const heldRows = await count(ctx, ENT_SCHEMA + '.entitlement_events', "upstream_event_id='held'"), waitedRows = await count(ctx, ENT_SCHEMA + '.entitlement_events', "upstream_event_id='waited'");
    // (b) parallel admits around a short-dated retirement: starts well before succeed, starts well after are refused, nothing is half-written
    const o2 = await makeUser(ctx, 48);
    const q2 = await plainProducer(ctx, 'straddle');
    const conns = [q2.c]; for (let i = 0; i < 5; i++) conns.push(await ctx.open(q2.role));
    const retIso = (await ctx.g.query(ctx.su, "update " + ENT_SCHEMA + ".producers set retired_at=date_trunc('milliseconds', clock_timestamp() + interval '2000 milliseconds') where namespace='straddle' returning retired_at")).rows[0].retired_at;
    const results = [];
    const wave = async (cn, base) => { for (let i = 0; i < 30; i++) { const started = (await cn.query('select clock_timestamp() t')).rows[0].t; const rr = await admit({ ns: 'straddle', c: cn }, o2, 'w' + base + '-' + i, 'paid', q2.registeredAt, '2036-01-01T00:00:00.000Z'); results.push({ started, ok: rr.ok, code: rr.code }); await sleep(100); } };
    await Promise.all(conns.map((cn, i) => wave(cn, i)));
    const early = results.filter(x => x.started.getTime() < retIso.getTime() - 400), lateStarts = results.filter(x => x.started.getTime() > retIso.getTime() + 400);
    const stored = await count(ctx, ENT_SCHEMA + '.entitlement_events', "owner_user_id='" + o2 + "'");
    // (c) an uncommitted coverage advance makes a concurrent admission of a fact at/below it wait, then be refused
    const o3 = await makeUser(ctx, 49); const a3 = await makeProducer(ctx, 'billing-q'); const a3b = await ctx.open(a3.role);
    await a3.c.query('begin'); const adv = await advance(a3, o3, at(20));
    const racing = admit({ ns: 'billing-q', c: a3b }, o3, 'race', 'paid', at(15), at(40));
    await sleep(500); const racingState = await Promise.race([racing.then(() => 'RETURNED'), sleep(50).then(() => 'STILL_WAITING')]);
    await a3.c.query('commit'); const racingResult = await racing;
    const ok = first.ok && stillBlocked === 'STILL_WAITING' && !late.ok && late.code === '42501' && heldRows === 1 && waitedRows === 0
      && early.length > 5 && early.every(x => x.ok) && lateStarts.length > 5 && lateStarts.every(x => !x.ok && x.code === '42501') && stored === results.filter(x => x.ok).length
      && adv.ok && racingState === 'STILL_WAITING' && !racingResult.ok && racingResult.code === '23514';
    return R(ok, { lockOrder: { first: code(first), stillBlocked, late: code(late), heldRows, waitedRows }, straddle: { calls: results.length, earlyOk: early.filter(x => x.ok).length, early: early.length, lateRefused: lateStarts.filter(x => !x.ok).length, lateStarts: lateStarts.length, stored }, advanceVsAdmit: { adv: adv.ok, racingState, racing: code(racingResult) } });
  },
  async N19_READERS_WAIT_FOR_OPEN_REGISTRY_WRITES(ctx) {
    const f = await consFixture(ctx); const out = {}, chk = {}, viol = [];
    // (a) a reader that asks while a registry write is open waits for it and then sees it: plain, and under SET CONSTRAINTS ALL IMMEDIATE (the R1 acceptance bypass)
    out.modes = [];
    for (const all of [true, false]) {
      const ns = 'b-' + (all ? 'all' : 'plain'); const wr = await openWriter(f, ns, { all });
      await sleep(300); const I = await f.advance(); const p = f.resolve(f.rd, I);
      const blocked = await blockedOn(f.obs, f.pid.rd, 1500); await sleep(900); await wr.commit(); const r = await p;
      out.modes.push({ all, stamp: wr.row.r, blocked, answer: r.answer ?? r.error, ms: r.ms });
      chk['readerWaits_' + ns] = blocked && !!r.answer && r.ms >= 800;
      viol.push(...await verdict(f, [{ label: ns, I, mustSee: ns, ...r }]));
      await retireNow(f, ns);
    }
    // (b) constraint mode switching and a registry retirement inside the same open transaction
    await makeProducer(ctx, 'prod-c');
    { const w = f.w; await w.query('begin'); await w.query('set constraints all immediate'); await rows1(w, regSql('b-sw')); await sleep(400);
      await w.query('set constraints all deferred'); await sleep(200); await w.query('set constraints all immediate'); await rows1(w, retireSql('prod-c')); await sleep(300);
      const I = await f.advance(); const p = f.resolve(f.rd, I); const blocked = await blockedOn(f.obs, f.pid.rd, 1500); await sleep(500); await w.query('commit'); const r = await p;
      out.modeSwitch = { blocked, answer: r.answer ?? r.error }; chk.modeSwitchReaderWaits = blocked && !!r.answer;
      viol.push(...await verdict(f, [{ label: 'mode-switch', I, mustSee: 'b-sw', ...r }])); await retireNow(f, 'b-sw'); }
    // (c) slow deferred work queued AFTER the registry guard in the same transaction: COMMIT takes 2.5 s while the lock is held; a reader (20 s) waits it out and sees the row
    await ctx.su.query('create table public.acc_other(id int)');
    await ctx.su.query("create function public.acc_slow() returns trigger language plpgsql as $$ begin perform pg_sleep(2.5); return null; end $$");
    await ctx.su.query('create constraint trigger acc_slow_ct after insert on public.acc_other deferrable initially deferred for each row execute function public.acc_slow()');
    await ctx.su.query('grant insert on public.acc_other to acc_writer; grant usage on schema public to acc_writer');
    await f.setTimeouts('20s');
    { const w = f.w; await w.query('begin'); const row = (await rows1(w, regSql('b-df')))[0]; await w.query('insert into public.acc_other values (1)');
      const commit = w.query('commit').then(() => 'ok', e => e.message); await sleep(500); const I = await f.advance(); const r = await f.resolve(f.rd, I); const cm = await commit;
      out.postGuardDelay = { stamp: row.r, commit: cm, answer: r.answer ?? r.error, readerMs: r.ms }; chk.postGuardDelayReaderSeesRow = cm === 'ok' && !!r.answer && r.ms >= 1200;
      viol.push(...await verdict(f, [{ label: 'post-guard-delay', I, mustSee: 'b-df', ...r }])); await retireNow(f, 'b-df'); }
    // (d) writer vs reader sampling: a writer that arrives while a reader holds the registry lock waits, and its stamp is later than every clock reading of that reader; an instant later than the clock sampled under the lock is unknown
    { const I0 = await f.advance(); await sleep(50); const c = await ctx.open('acc_reader'); await c.query('begin'); const ans = await f.resolve(c, I0);
      const w = f.w; await w.query('begin'); const stampP = rows1(w, regSql('b-after')).then(r => r[0].r); const wb = await blockedOn(f.obs, f.pid.w, 1200); await sleep(600);
      const readerClock = (await rows1(c, 'select clock_timestamp() t'))[0].t; await c.query('commit'); const stamp = await stampP; await w.query('commit');
      const I1 = await f.advance(); const r1 = await f.resolve(f.rd, I1); const fut = await f.resolve(f.rd, new Date(Date.now() + 3600e3).toISOString());
      out.sampling = { readerAnswer: ans.answer, writerBlockedByReaderLock: wb, stamp, readerLastClock: readerClock.toISOString(), afterWriter: r1.answer ?? r1.error, futureInstant: fut.answer ?? fut.error };
      chk.readerBeforeWriterIsFree = ans.answer === 'free'; chk.writerWaitsForReaderLock = wb; chk.stampAfterEveryReaderReading = new Date(stamp) > readerClock; chk.futureInstantIsUnknown = fut.answer === 'unknown(INSTANT_IN_FUTURE)' && !!fut.sampled_at;
      viol.push(...await verdict(f, [{ label: 'sample-a', I: I0, ...ans }, { label: 'sample-b', I: I1, mustSee: 'b-after', ...r1 }])); await retireNow(f, 'b-after'); }
    // (d2) the clock is sampled AFTER the lock is granted: an instant that lies in the future when the call starts but not when the lock is granted is answered, not refused as INSTANT_IN_FUTURE
    { const wr = await openWriter(f, 'b-d2'); const I = await fmtAt(f.obs, `${msFloor} + interval '300 milliseconds'`); const p = f.resolve(f.rd, I); await sleep(900); await wr.commit(); const r = await p;
      out.sampleAfterLock = { instant: I, answer: r.answer ?? r.error, sampled_at: r.sampled_at };
      chk.sampleTakenAfterTheLock = !!r.answer && r.answer !== 'unknown(INSTANT_IN_FUTURE)' && !!r.sampled_at && Date.parse(r.sampled_at) >= Date.parse(I); await retireNow(f, 'b-d2'); }
    // (e) timeout, rollback, killed writer, cancelled reader
    await f.setTimeouts('default');
    { const wr = await openWriter(f, 'b-to'); await sleep(200); const I = await f.advance(); const tr = await f.resolve(f.rd, I);
      out.timeout = { answer: tr.answer ?? tr.error, ms: tr.ms, evidence: tr.ns, sampled_at: tr.sampled_at };
      chk.timeoutIsUnknownNeverFree = tr.answer === 'unknown(REGISTRY_LOCK_TIMEOUT)' && tr.ms >= 1800 && tr.ms < 6000 && tr.ns.length === 0 && tr.sampled_at === null;
      viol.push(...await verdict(f, [{ label: 'timeout', I, ...tr }])); await wr.rollback();
      const after = await f.resolve(f.rd, I); chk.afterRollbackNoTraceOfTheWriter = !!after.answer && !/TIMEOUT/.test(after.answer) && !after.ns.includes('b-to'); out.afterRollback = after.answer ?? after.error; }
    await f.setTimeouts('20s');
    { const wr = await openWriter(f, 'b-kill'); await sleep(200); const I = await f.advance(); const pk = f.resolve(f.rd, I); await sleep(500);
      await rows1(f.obs, 'select pg_terminate_backend($1)', [wr.pid]); const rk = await pk; f.w = await ctx.open('acc_writer'); f.pid.w = await pidOf(f.w);
      const left = (await rows1(ctx.su, `select count(*)::int n from ${ENT_SCHEMA}.producers where namespace='b-kill'`))[0].n; out.killedWriter = { answer: rk.answer ?? rk.error, ms: rk.ms, rowsLeft: left };
      chk.killedWriterReleasesLockAndLeavesNothing = !!rk.answer && left === 0 && rk.ms >= 400; viol.push(...await verdict(f, [{ label: 'killed-writer', I, mustNotSee: 'b-kill', ...rk }])); }
    { const wr = await openWriter(f, 'b-cancel'); const I = await f.advance(); const pc = f.resolve(f.rd, I); await sleep(400); await rows1(f.obs, 'select pg_cancel_backend($1)', [f.pid.rd]); const rc = await pc; await wr.commit();
      const held = (await rows1(f.obs, `select count(*)::int n from pg_locks where pid=$1 and relation='${ENT_SCHEMA}.producers'::regclass and granted`, [f.pid.rd]))[0].n;
      out.cancelledReader = { result: rc.answer ?? rc.error, registryLocksHeldAfterCancel: held }; chk.cancelledReaderHoldsNothing = /^57014/.test(rc.error ?? '') && held === 0; await retireNow(f, 'b-cancel'); }
    // (f) ordering of COMMIT, visibility, lock release and reader sampling over many trials: a reader that asked after the writer took its lock never misses the writer's row
    await f.setTimeouts('5s');
    { const N = 60; let misses = 0, errors = 0; const sample = [];
      for (let i = 0; i < N; i++) {
        const ns = 'ord-' + i; await f.w.query('begin'); const row = (await rows1(f.w, regSql(ns)))[0]; await sleep(4); const I = await fmtAt(f.obs, msFloor);
        const p = f.rd.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [f.owner, I]).then(r => ({ s: r.rows[0].s }), e => ({ err: e.code }));
        await sleep(Math.floor(Math.random() * 12)); await f.w.query('commit'); const r = await p;
        if (r.err) errors++; else if (!r.s.evidence.coverage.some(c => c.namespace === ns)) misses++;
        if (i < 3) sample.push({ stamp: row.r, instant: I, sampled_at: r.s?.sampled_at ?? null });
        await retireNow(f, ns);
      }
      out.ordering = { trials: N, missed: misses, errors, sample }; chk.noMissedRowAfterLockRelease = misses === 0 && errors === 0; }
    return R(passOf(chk, viol), { chk, viol, out });
  },
  async N20_PREPARED_TRANSACTIONS_AND_SYNC_COMMIT_STALLS(ctx) {
    const f = await consFixture(ctx); const out = { variants: [] }, chk = {}, viol = [];
    let stalled = false;
    try {
      chk.preparedTransactionsEnabled = (await rows1(ctx.su, 'show max_prepared_transactions'))[0].max_prepared_transactions !== '0';
      // (a) PREPARE TRANSACTION: no backend holds the registry write any more, yet the lock stays until COMMIT PREPARED / ROLLBACK PREPARED
      for (const fate of ['commit', 'rollback']) for (const timeout of ['2s', '20s']) {
        await f.setTimeouts(timeout === '2s' ? 'default' : timeout);
        const ns = `b-2pc-${fate}-${timeout}`; const w = f.w; await w.query('begin'); const row = (await rows1(w, regSql(ns)))[0];
        const gid = 'g_' + ns; await w.query(`prepare transaction '${gid}'`); await sleep(300);
        const preparedHeld = (await rows1(f.obs, 'select count(*)::int n from pg_prepared_xacts where gid=$1', [gid]))[0].n;
        const I = await f.advance(); const p = f.resolve(f.rd, I); const blocked = await blockedOn(f.obs, f.pid.rd, 800);
        await sleep(timeout === '2s' ? 2600 : 1200); const early = await Promise.race([p, sleep(10).then(() => null)]);
        await ctx.su.query(fate === 'commit' ? `commit prepared '${gid}'` : `rollback prepared '${gid}'`);
        const r = await p; const after = await f.resolve(f.rd, I); const see = fate === 'commit' ? { mustSee: ns } : { mustNotSee: ns };
        out.variants.push({ fate, timeout, stamp: row.r, preparedHeld, blocked, answerBeforeFate: early ? (early.answer ?? early.error) : '(still waiting)', answer: r.answer ?? r.error, afterFate: after.answer ?? after.error });
        chk[`prepared_${fate}_${timeout}`] = preparedHeld === 1 && blocked && (timeout === '2s' ? early?.answer === 'unknown(REGISTRY_LOCK_TIMEOUT)' : early === null)
          && (timeout === '2s' || !!r.answer) && !!after.answer && (fate !== 'commit' || after.ns.includes(ns)) && (fate !== 'rollback' || !after.ns.includes(ns));
        viol.push(...await verdict(f, [{ label: `reader-${fate}-${timeout}`, I, ...see, ...r }, { label: `after-${fate}-${timeout}`, I, ...see, ...after }]));
        if (fate === 'commit') await retireNow(f, ns);
      }
      // (b) synchronous replication stall AFTER the guard: COMMIT waits for a standby that never answers; the row is invisible and the lock is still held, so a reader still waits instead of answering without it
      await f.setTimeouts('30s');
      const w = f.w; await w.query('begin'); const row = (await rows1(w, regSql('b-sync')))[0]; await sleep(300); const I = await f.advance();
      await ctx.cl.admin.query("alter system set synchronous_standby_names = 'ent_ghost'"); await ctx.cl.admin.query('select pg_reload_conf()'); stalled = true; await sleep(700);
      const tCommit = Date.now(); const commit = w.query('commit').then(() => ({ ok: true, at: Date.now() }), e => ({ ok: false, err: e.message })); await sleep(300);
      const readerP = f.resolve(f.rd, I).then(r => ({ ...r, at: Date.now() })); let visibleAt = null;
      const poll = (async () => { const t0 = Date.now(); while (visibleAt === null && Date.now() - t0 < 15000) { const n = (await rows1(f.obs, `select count(*)::int n from ${ENT_SCHEMA}.producers where namespace='b-sync'`))[0].n; if (n) visibleAt = Date.now(); else await sleep(25); } })();
      await sleep(3000);
      const waitState = (await rows1(f.obs, 'select wait_event_type, wait_event from pg_stat_activity where pid=$1', [f.pid.w]))[0];
      const stall = { writerWait: waitState, readerReturnedYet: !!(await Promise.race([readerP, sleep(1)])), rowVisibleYet: visibleAt !== null };
      await ctx.cl.admin.query('alter system reset synchronous_standby_names'); await ctx.cl.admin.query('select pg_reload_conf()'); stalled = false;
      const cm = await commit; const rd = await readerP; await poll;
      out.syncRep = { stall, stamp: row.r, commitReplyMs: cm.at - tCommit, visibleAfterMs: visibleAt ? visibleAt - tCommit : null, readerAnswer: rd.answer ?? rd.error, readerReturnedAfterVisible: visibleAt !== null && rd.at >= visibleAt };
      chk.syncRepStallObserved = stall.writerWait?.wait_event === 'SyncRep' && !stall.readerReturnedYet && !stall.rowVisibleYet;
      chk.syncRepReaderSeesRow = cm.ok && visibleAt !== null && !!rd.answer && rd.ns.includes('b-sync'); // the reader's own answer contains the row, so the row was visible to it; the observer poll lags the real visibility moment and is only recorded
      viol.push(...await verdict(f, [{ label: 'reader-during-stall', I, mustSee: 'b-sync', ...rd }]));
    } finally {
      if (stalled) { await ctx.cl.admin.query('alter system reset synchronous_standby_names').catch(() => {}); await ctx.cl.admin.query('select pg_reload_conf()').catch(() => {}); }
      for (const g of await rows1(ctx.su, 'select gid from pg_prepared_xacts').catch(() => [])) await ctx.su.query(`rollback prepared '${g.gid}'`).catch(() => {});
    }
    return R(passOf(chk, viol), { chk, viol, out });
  },
  async N21_ISOLATION_LEVELS_AND_EARLIER_SNAPSHOTS(ctx) {
    const f = await consFixture(ctx); const out = {}, chk = {}, viol = [];
    await f.setTimeouts('20s');
    // (a) entitlement_state_at: READ COMMITTED (also after an earlier statement, also READ ONLY) sees the open registry write once it commits; REPEATABLE READ / SERIALIZABLE are refused before any lock is taken
    const mk = async (label, begin, pre) => {
      const ns = 'b-sn-' + label.replace(/[^a-z0-9]/g, '_'); const wr = await openWriter(f, ns); await sleep(300); const I = await f.advance();
      const c = await ctx.open('acc_reader'); await c.query(begin); if (pre) await c.query(pre);
      const t0 = Date.now(); const p = c.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [f.owner, I]).then(r => ({ answer: stOf(r.rows[0].s), ns: r.rows[0].s.evidence.coverage.map(x => x.namespace), ms: Date.now() - t0 }), e => ({ error: errOf(e), ms: Date.now() - t0 }));
      await sleep(800); await wr.commit(); const r = await p; await c.query('rollback').catch(() => {});
      out[label] = { answer: r.answer ?? r.error, ms: r.ms }; const unsupported = /^repeatable|^serializable/.test(label);
      viol.push(...await verdict(f, [{ label, I, mustSee: ns, ...r, allowError: unsupported }]));
      if (unsupported) chk[label] = /^0A000 ENT_ISOLATION_UNSUPPORTED/.test(r.error ?? '') && r.ms < 700; else chk[label] = !!r.answer && r.ns.includes(ns) && r.ms >= 700;
      await retireNow(f, ns);
    };
    await mk('rc_plain', 'begin', null);
    await mk('rc_after_earlier_select', 'begin', 'select count(*) from information_schema.tables');
    await mk('rc_read_only', 'begin read only', null);
    await mk('repeatable_read', 'begin isolation level repeatable read', null);
    await mk('serializable', 'begin isolation level serializable', null);
    // a STABLE wrapper and a statement whose snapshot was built before the call must still see the committed write (the function is VOLATILE and every command in it takes a fresh snapshot)
    await ctx.su.query(`create function public.acc_wrap(o uuid, i timestamptz) returns jsonb language sql stable as $$ select ${ENT_SCHEMA}.entitlement_state_at(o, i) $$`);
    await ctx.su.query('grant execute on function public.acc_wrap(uuid, timestamptz) to acc_reader; grant usage on schema public to acc_reader');
    for (const [label, sql] of [['stable_wrapper', 'select public.acc_wrap($1::uuid,$2::timestamptz) s'], ['same_statement_earlier_snapshot', `select (select count(*) from information_schema.schemata) n, ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`]]) {
      const ns = 'b-sn-' + label; const wr = await openWriter(f, ns); await sleep(300); const I = await f.advance(); const c = await ctx.open('acc_reader');
      const p = c.query(sql, [f.owner, I]).then(r => ({ answer: stOf(r.rows[0].s), ns: r.rows[0].s.evidence.coverage.map(x => x.namespace) }), e => ({ error: errOf(e) }));
      await sleep(800); await wr.commit(); const r = await p; out[label] = r.answer ?? r.error; chk[label] = !!r.answer && r.ns.includes(ns);
      viol.push(...await verdict(f, [{ label, I, mustSee: ns, ...r }])); await retireNow(f, ns);
    }
    // (b) all three functions refuse REPEATABLE READ / SERIALIZABLE with no partial write; admission is refused even while another transaction holds an uncommitted coverage advance for the same owner
    const T = await fmtAt(f.obs, msFloor); const refusal = {};
    for (const level of ['repeatable read', 'serializable']) {
      for (const [fn, sql, args] of [['admit', admitSql('prod-a', 'iso-' + level.replace(' ', '-'), '$1'), [f.owner2]], ['advance', `select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz) s`, [f.owner2, T]], ['state_at', `select ${ENT_SCHEMA}.entitlement_state_at($1::uuid, now() - interval '1 second') s`, [f.owner2]]]) {
        const c = await ctx.open(f.pa.role); const before = await f.counts(); await c.query(`begin isolation level ${level}`);
        const t0 = Date.now(); const r = await sqlTry(c, sql, args); await c.query('rollback').catch(() => {}); const after = await f.counts();
        refusal[`${fn}/${level}`] = { result: r, ms: Date.now() - t0, unchanged: same(before, after) };
        chk[`refuses_${fn}_${level.replace(' ', '_')}`] = r.startsWith('0A000') && same(before, after);
      }
    }
    const holderTx = await ctx.open(f.pa.role); await holderTx.query('begin'); await holderTx.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz)`, [f.owner, await fmtAt(f.obs, msFloor)]);
    const rr = await ctx.open(f.pa.role); await rr.query('begin isolation level repeatable read'); const t1 = Date.now(); const rrRes = await sqlTry(rr, admitSql('prod-a', 'rr-while-advance-open', '$1'), [f.owner]); await rr.query('rollback').catch(() => {}); await holderTx.query('commit');
    refusal.admitWhileCoverageOpen = { result: rrRes, ms: Date.now() - t1 }; chk.admitRefusedImmediatelyWhileCoverageOpen = rrRes.startsWith('0A000') && Date.now() - t1 < 1500;
    chk.noEventWasStored = (await count(ctx, ENT_SCHEMA + '.entitlement_events', "upstream_event_id like 'iso-%' or upstream_event_id like 'rr-%'")) === 0;
    out.refusal = refusal;
    return R(passOf(chk, viol), { chk, viol, out });
  },
  async N22_ADMISSION_AND_COVERAGE_FAIL_CLOSED(ctx) {
    const f = await consFixture(ctx); const out = {}, chk = {}, viol = [];
    const adm = (c, id, o = f.owner2, ns = 'prod-a') => { const t0 = Date.now(); return c.query(admitSql(ns, id, '$1'), [o]).then(r => ({ outcome: r.rows[0].s.outcome, ms: Date.now() - t0 }), e => ({ error: errOf(e), ms: Date.now() - t0 })); };
    const advTo = async (c, ns = 'prod-a', o = f.owner2) => { const T = await fmtAt(f.obs, msFloor); return c.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'${ns}',$2::timestamptz)`, [o, T]).then(() => 'OK', e => errOf(e)); };
    // (a) admission during an open registry write waits for it and then succeeds; a write that stays open longer than lock_timeout makes admission AND coverage fail closed (55P03) with nothing written
    { const wr = await openWriter(f, 'b-adm'); const p = adm(f.pa.c, 'x-adm-1'); const blocked = await blockedOn(f.obs, f.pid.pa, 800); await sleep(700); await wr.commit(); const r1 = await p;
      out.waits = { blocked, ...r1 }; chk.admissionWaitsThenSucceeds = blocked && r1.outcome === 'admitted' && r1.ms >= 600; await retireNow(f, 'b-adm'); }
    // (a2) identity is checked BEFORE the registry lock: a role that holds EXECUTE but is not a registered producer is refused at once and never waits on (or occupies) the registry lock
    { ctx.extraRoles.add('acc_x'); await ctx.su.query('create role acc_x login'); await ctx.su.query(`grant usage on schema ${ENT_SCHEMA} to acc_x`); await ctx.su.query(`grant execute on function ${ENT_SCHEMA}.${ENT_FUNCS[1]} to acc_x`);
      const x = await ctx.open('acc_x'); const wr = await openWriter(f, 'b-x'); const t0 = Date.now(); const r = await sqlTry(x, admitSql('prod-a', 'x-unregistered', '$1'), [f.owner2]); const ms = Date.now() - t0; await wr.rollback();
      out.unregisteredCaller = { result: r, ms }; chk.unregisteredCallerRefusedWithoutWaiting = r.startsWith('42501') && ms < 700; }
    { const wr2 = await openWriter(f, 'b-adm2'); const before = await f.counts(); const r = await adm(f.pa.c, 'x-adm-3'); const a = await advTo(f.pa.c); const after = await f.counts(); await wr2.rollback();
      out.timeout = { admission: r, advance: a, before, after }; chk.timeoutFailsClosedNoPartialWrite = /^55P03/.test(r.error ?? '') && /^55P03/.test(a) && r.ms >= 1800 && same(before, after);
      const ok = await adm(f.pa.c, 'x-adm-4'); chk.afterTimeoutNextCallWorks = ok.outcome === 'admitted'; }
    // (b) a retirement whose time has passed but whose transaction has not committed: admission and coverage wait for the registry lock and are then refused
    await f.setTimeouts('20s');
    { const pr = await makeProducer(ctx, 'prod-r'); const wr = await openWriter(f, 'prod-r', { retire: true }); await sleep(Math.max(0, Date.parse(wr.row.t) - Date.now() + 400));
      const pr2 = await ctx.open(pr.role); const ap = adm(pr.c, 'late-1', f.owner, 'prod-r'); const advp = advTo(pr2, 'prod-r', f.owner); await sleep(600); await wr.commit(); const r = await ap; const a = await advp;
      const stored = await count(ctx, ENT_SCHEMA + '.entitlement_events', "namespace='prod-r'"), cov = await count(ctx, ENT_SCHEMA + '.entitlement_coverage', "namespace='prod-r'");
      out.retirementUncommitted = { retiredAt: wr.row.t, admission: r, advance: a, stored, cov }; chk.lateAdmissionAndCoverageRefused = /^42501/.test(r.error ?? '') && /^42501/.test(a) && stored === 0 && cov === 0; }
    // (c) timeout accounting: lock_timeout bounds EACH wait, not the whole call; a second wait that itself exceeds it fails closed
    await f.setTimeouts('default');
    const key = `hashtextextended('${f.owner2}' || ':retention_entitlement:' || 'prod-a', 0)`; const holder = await ctx.open('supabase_admin'); const w = f.w;
    { await w.query('begin'); await rows1(w, regSql('lt-1')); await holder.query('begin'); await holder.query(`select pg_advisory_xact_lock(${key})`);
      const p = adm(f.pa.c, 'lt-e1'); await blockedOn(f.obs, f.pid.pa, 1000); await sleep(1400); await w.query('commit'); await blockedOn(f.obs, f.pid.pa, 1500); await sleep(1400); await holder.query('commit'); const e1 = await p;
      out.twoWaitsOfAbout1400ms = e1; chk.totalMayExceedLockTimeoutWhenEachWaitDoesNot = e1.outcome === 'admitted' && e1.ms >= 2600; await retireNow(f, 'lt-1'); }
    { await holder.query('begin'); await holder.query(`select pg_advisory_xact_lock(${key})`); const before = await f.counts(); const r = await adm(f.pa.c, 'lt-e1b'); await holder.query('commit'); const after = await f.counts();
      out.perOwnerWaitTimesOut = { r, before, after }; chk.perOwnerWaitTimeoutFailsClosed = /^55P03/.test(r.error ?? '') && r.ms >= 1800 && r.ms < 5000 && same(before, after); }
    // (d) the caller's own lock_timeout is not polluted by success, timeout, exception, savepoint rollback or an enclosing SET LOCAL
    { const c = await ctx.open(f.pa.role); const gl = async () => (await rows1(c, "select current_setting('lock_timeout') v"))[0].v; const e2 = {};
      await c.query("set lock_timeout='7s'"); e2.start = await gl(); await adm(c, 'lt-e2-ok'); e2.afterSuccess = await gl();
      await w.query('begin'); await rows1(w, regSql('lt-2')); e2.timeoutResult = (await adm(c, 'lt-e2-to')).error?.slice(0, 5); e2.afterTimeout = await gl(); await w.query('rollback');
      e2.exceptionResult = (await sqlTry(c, admitSql('prod-a', '', '$1'), [f.owner2])).slice(0, 5); e2.afterException = await gl();
      await c.query('begin'); await c.query("set local lock_timeout='9s'"); e2.localSet = await gl(); await c.query('savepoint s1'); await sqlTry(c, admitSql('prod-a', '', '$1'), [f.owner2]); await c.query('rollback to savepoint s1'); e2.afterSavepointRollback = await gl();
      await adm(c, 'lt-e2-sp'); e2.afterCallInSameTx = await gl(); await c.query('commit'); e2.afterTxEnd = await gl();
      await c.query('begin'); await c.query('savepoint s2'); await w.query('begin'); await rows1(w, regSql('lt-3')); const t3 = await adm(c, 'lt-e2-t3'); await c.query('rollback to savepoint s2'); await w.query('rollback'); e2.timeoutInSavepoint = t3.error?.slice(0, 5); e2.afterSavepointTimeout = await gl();
      const okAfter = await adm(c, 'lt-e2-t3b'); e2.callAfterTimeoutInSameTx = okAfter.outcome ?? okAfter.error; await c.query('commit');
      out.guc = e2; chk.lockTimeoutNotPolluted = [e2.start, e2.afterSuccess, e2.afterTimeout, e2.afterException, e2.afterTxEnd, e2.afterSavepointTimeout].every(v => v === '7s') && e2.localSet === '9s' && e2.afterSavepointRollback === '9s' && e2.afterCallInSameTx === '9s'
        && e2.timeoutResult === '55P03' && e2.exceptionResult === '22023' && e2.timeoutInSavepoint === '55P03' && e2.callAfterTimeoutInSameTx === 'admitted'; }
    return R(passOf(chk, viol), { chk, viol, out });
  },
  async N23_HISTORICAL_CASES_LOCK_ORDER_AND_CHAOS(ctx) {
    const f = await consFixture(ctx); const out = {}, chk = {}, viol = [];
    // (a) the three historical repro cases of the R1 acceptance round stay refused, and the earlier answer does not change
    { const I0 = await f.advance(); await sleep(50); const before = await f.final(I0); const w = f.w;
      ctx.extraRoles.add('acc_pb'); await ctx.su.query('create role acc_pb login'); await ctx.su.query(`grant usage on schema ${ENT_SCHEMA} to acc_pb`); await ctx.su.query(`grant execute on function ${ENT_SCHEMA}.${ENT_FUNCS[1]} to acc_pb`);
      await w.query('begin'); await rows1(w, "insert into " + ENT_SCHEMA + ".producers(namespace,role_name,registered_at) values ('prod-b','acc_pb',null) returning registered_at"); await w.query('commit'); const pb = await ctx.open('acc_pb');
      const h2 = await pb.query(`select ${ENT_SCHEMA}.admit_entitlement_event($1::uuid,'prod-b','late-1','paid',$2::timestamptz,date_trunc('milliseconds', now()+interval '1 day')) s`, [f.owner, new Date(Date.parse(I0) - 86400e3).toISOString()]).then(() => 'ADMITTED', e => errOf(e));
      await w.query('begin'); const h3 = await sqlTry(w, `insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at) values ('prod-h3','r_h3',date_trunc('milliseconds', now()-interval '30 days'))`); await w.query('rollback');
      await w.query('begin'); const h4 = await sqlTry(w, `update ${ENT_SCHEMA}.producers set retired_at=date_trunc('milliseconds', now()-interval '30 days') where namespace='prod-a'`); await w.query('rollback');
      const del = await sqlTry(w, `delete from ${ENT_SCHEMA}.producers where namespace='prod-b'`);
      await w.query('begin'); const txStart = await sqlTry(w, `insert into ${ENT_SCHEMA}.producers(namespace,role_name,registered_at) values ('prod-tx0','r_tx0',date_trunc('milliseconds', transaction_timestamp()))`); await w.query('rollback');
      out.historical = { H2_backfillAfterRegistration: h2, H3_backdatedInsert: h3, H4_backdatedRetirement: h4, delete: del, explicitTransactionStart: txStart, answerUnchanged: (await f.final(I0)) === before };
      chk.historicalCasesRefused = /^23514 ENT_EVENT_BEFORE_PRODUCER_REGISTRATION/.test(h2) && h3.includes('ENT_PRODUCER_RETROACTIVE') && h4.includes('ENT_PRODUCER_RETROACTIVE') && del.includes('ENT_PRODUCER_IMMUTABLE') && txStart.includes('ENT_PRODUCER_RETROACTIVE') && out.historical.answerUnchanged; }
    // (b) lock order registry -> per-owner: a conforming sequence never deadlocks; the reverse order is detected (never a hang, never an answer from the blocked call); two transactions that already hold SHARE and then write the registry deadlock and one is told so
    await f.setTimeouts('20s');
    { const key = `hashtextextended('${f.owner}' || ':retention_entitlement:' || 'prod-a', 0)`; const settle = async p => Promise.race([p, sleep(9000).then(() => 'HUNG')]); out.lockOrder = {};
      for (const order of ['reverse_owner_then_registry', 'conforming_registry_then_owner']) {
        const rogue = await ctx.open('supabase_admin'), a = await ctx.open(f.pa.role), w = await ctx.open('acc_writer'); const log = {};
        await rogue.query('begin'); if (order.startsWith('reverse')) await rogue.query(`select pg_advisory_xact_lock(${key})`); else await rogue.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid, now() - interval '1 hour')`, [f.owner]);
        await a.query('begin'); const aP = a.query(admitSql('prod-a', 'dl-' + order, '$1'), [f.owner]).then(async () => { await a.query('commit'); return 'ok'; }, e => e.code); await sleep(400);
        await w.query('begin'); const wP = w.query(regSql('dl-' + order.slice(0, 4))).then(() => 'ok', e => e.code); await sleep(400);
        log.rogue = order.startsWith('reverse') ? await rogue.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid, now() - interval '1 hour') s`, [f.owner]).then(r => stOf(r.rows[0].s), e => e.code) : await rogue.query(`select pg_advisory_xact_lock(${key})`).then(() => 'lock-acquired', e => e.code);
        await rogue.query('rollback').catch(() => {}); log.admission = await settle(aP); await a.query('rollback').catch(() => {}); log.writer = await settle(wP); await w.query('rollback').catch(() => {}); out.lockOrder[order] = log; }
      const rev = out.lockOrder.reverse_owner_then_registry, con = out.lockOrder.conforming_registry_then_owner;
      chk.reverseOrderNeverHangs = !Object.values(rev).includes('HUNG'); // PostgreSQL's lock queue rearranges a soft deadlock silently (no 40P01); a hard deadlock is exercised below chk.conformingOrderNeverDeadlocks = !Object.values(con).includes('HUNG') && !Object.values(con).includes('40P01') && con.rogue === 'lock-acquired' && con.admission === 'ok' && con.writer === 'ok';
      const t1 = await ctx.open('supabase_admin'), t2 = await ctx.open('supabase_admin'); await t1.query('begin'); await t2.query('begin');
      await t1.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid, now() - interval '1 hour')`, [f.owner]); await t2.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid, now() - interval '1 hour')`, [f.owner]);
      const p1 = t1.query(regSql('dl-hard-1')).then(() => 'ok', e => e.code); await sleep(300); const p2 = t2.query(regSql('dl-hard-2')).then(() => 'ok', e => e.code);
      const hard = { t1: await settle(p1) }; await t1.query('rollback').catch(() => {}); hard.t2 = await settle(p2); await t2.query('rollback').catch(() => {}); out.lockOrder.writerAfterAuthoritativeRead = hard;
      chk.holdersOfShareThatWriteDeadlockDetected = !Object.values(hard).includes('HUNG') && Object.values(hard).includes('40P01'); }
    // (c) a caller that leaves its transaction open after an authoritative call keeps registry writers waiting (SHARE is held to the end of ITS transaction); COMMIT releases them
    { await f.setTimeouts('default'); const rd = await ctx.open('acc_reader'); const rpid = await pidOf(rd); await rd.query('begin'); await rd.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid, now() - interval '1 second')`, [f.owner]);
      const held = (await rows1(f.obs, `select mode from pg_locks where pid=$1 and relation='${ENT_SCHEMA}.producers'::regclass and granted`, [rpid])).map(x => x.mode);
      const w3 = await ctx.open('acc_writer'); const w3pid = await pidOf(w3); const t5 = Date.now(); const ins = w3.query(regSql('lt-4')).then(() => ({ ok: true, ms: Date.now() - t5 }), e => ({ err: e.code, ms: Date.now() - t5 }));
      const wb = await blockedOn(f.obs, w3pid, 1500); await sleep(3000); const stillWaiting = await Promise.race([ins.then(() => false), sleep(10).then(() => true)]); await rd.query('commit'); const insR = await ins;
      out.shareHold = { held, writerBlocked: wb, stillWaitingAfter3s: stillWaiting, releasedAfterCallerCommit: insR }; chk.shareHeldToCallerTransactionEnd = held.includes('ShareLock') && wb && stillWaiting && insR.ok === true && insR.ms >= 3000; }
    // (d) randomized stress with chaos (backend kills, rollbacks, PREPARE/COMMIT/ROLLBACK PREPARED, SET CONSTRAINTS) and an ENT1 persistence model: every persisted free/paid answer (same transaction or split transaction) is confirmed by the final state
    { await ctx.su.query('create table public.ent1_model(owner uuid, instant timestamptz, state text, mode text)'); await ctx.su.query('grant insert on public.ent1_model to acc_reader; grant usage on schema public to acc_reader');
      await f.setTimeouts('3s'); const DUR = 10000; const t0 = Date.now(); const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1)); const stop = () => Date.now() - t0 > DUR;
      const owner3 = await makeUser(ctx, 703); const Ts = await f.advance(); await f.pa.c.query(`select ${ENT_SCHEMA}.admit_entitlement_event($1::uuid,'prod-a','st-fact','paid',$2::timestamptz,date_trunc('milliseconds', now()+interval '1 day')) s`, [owner3, Ts]); let lastT = Ts; const errors = {}; const note = k => { errors[k] = (errors[k] ?? 0) + 1; }; const answers = []; let wseq = 0, kills = 0;
      const conn = async user => ({ user, c: await ctx.open(user) });
      const fix = async (h, e) => { if (e.code === undefined || e.code === '57P01' || e.code === '08006') { try { h.c = await ctx.open(h.user); } catch { /* next loop */ } } else await h.c.query('rollback').catch(() => {}); };
      const writer = async id => { const h = await conn('acc_writer');
        while (!stop()) { const ns = `st-${id}-${wseq++}`; const kind = rnd(0, 9);
          try { await h.c.query('begin'); if (kind < 3) await h.c.query('set constraints all immediate'); await rows1(h.c, regSql(ns)); await sleep(rnd(100, 900));
            if (kind === 9) { await h.c.query('rollback'); continue; }
            if (kind === 8) { const gid = 'gst' + ns; await h.c.query(`prepare transaction '${gid}'`); await sleep(rnd(100, 500)); await ctx.su.query(rnd(0, 1) ? `commit prepared '${gid}'` : `rollback prepared '${gid}'`); } else await h.c.query('commit');
            await sleep(rnd(50, 300)); await h.c.query('begin'); await rows1(h.c, retireSql(ns)); await sleep(rnd(0, 300)); await h.c.query('commit');
          } catch (e) { note('writer:' + (e.code ?? 'conn')); await fix(h, e); } await sleep(rnd(50, 400)); } };
      const advancer = async () => { const h = await conn(f.pa.role); while (!stop()) { try { const T = await fmtAt(f.obs, msFloor); await h.c.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz)`, [f.owner, T]); lastT = T; } catch (e) { note('advance:' + (e.code ?? 'conn')); await fix(h, e); } await sleep(rnd(20, 120)); } };
      const reader = async id => { const h = await conn('acc_reader');
        while (!stop()) { const kind = rnd(0, 3); const o = kind === 3 ? owner3 : f.owner; const I = kind === 0 ? lastT : kind === 2 ? await fmtAt(f.obs, `'${Ts}'::timestamptz - interval '5 milliseconds'`) : await fmtAt(f.obs, `${msFloor} - interval '${rnd(0, 500)} milliseconds'`); const split = rnd(0, 1);
          try { await h.c.query('begin'); const st = stOf((await h.c.query(`select ${ENT_SCHEMA}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [o, I])).rows[0].s); answers.push({ I, answer: st, id, o });
            if (!split && /^(free|paid)/.test(st)) await h.c.query("insert into public.ent1_model values ($1,$2,$3,'same_tx')", [o, I, st.split('/')[0]]);
            await h.c.query('commit'); if (split && /^(free|paid)/.test(st)) { await sleep(rnd(0, 400)); await h.c.query("insert into public.ent1_model values ($1,$2,$3,'split_tx')", [o, I, st.split('/')[0]]); }
          } catch (e) { note('reader:' + (e.code ?? 'conn')); await fix(h, e); } await sleep(rnd(10, 100)); } };
      const killer = async () => { while (!stop()) { await sleep(rnd(900, 1800)); const r = await rows1(f.obs, `select pid from pg_stat_activity where usename in ('acc_writer','acc_reader','${f.pa.role}') and pid<>pg_backend_pid() and state='active' order by random() limit 1`); if (r[0]) { await rows1(f.obs, 'select pg_terminate_backend($1)', [r[0].pid]).catch(() => {}); kills++; } } };
      const admitter = async () => { const h = await conn(f.pa.role); let n = 0; while (!stop()) { try { await h.c.query(admitSql('prod-a', 'st-adm-' + n++, '$1'), [f.owner2]); } catch (e) { note('admit:' + (e.code ?? 'conn')); await fix(h, e); } await sleep(rnd(30, 150)); } };
      const done = await Promise.race([Promise.all([writer(1), writer(2), advancer(), reader(1), reader(2), reader(3), admitter(), killer()]).then(() => 'finished'), sleep(DUR + 30000).then(() => 'HUNG')]);
      await sleep(500); for (const g of await rows1(ctx.su, 'select gid from pg_prepared_xacts')) await ctx.su.query(`rollback prepared '${g.gid}'`).catch(() => {});
      const seen = new Set(); let checked = 0; for (const a of answers.filter(x => /^(free|paid)/.test(x.answer))) { const k = a.o + a.I + a.answer; if (seen.has(k)) continue; seen.add(k); checked++; const fin = await f.final(a.I, a.o); if (fin.split('/')[0] !== a.answer.split('/')[0]) viol.push({ type: 'V-READ', answered: a.answer, final: fin, I: a.I }); }
      const model = await rows1(ctx.su, 'select owner, instant, state, mode from public.ent1_model'); for (const m of model) { const fin = await f.final(m.instant.toISOString(), m.owner); if (fin.split('/')[0] !== m.state) viol.push({ type: 'V-ENT1-MODEL', mode: m.mode, persisted: m.state, final: fin, I: m.instant }); }
      const outside = (await rows1(ctx.su, `select count(*)::int n from ${ENT_SCHEMA}.entitlement_events e join ${ENT_SCHEMA}.producers p on p.namespace=e.namespace where p.retired_at is not null and e.admitted_at >= p.retired_at`))[0].n;
      out.stress = { completion: done, kills, errorCounts: errors, readerAnswers: answers.length, checkedFreePaidAnswers: checked, ent1ModelRows: model.length, modelByMode: model.reduce((m, r) => (m[r.mode] = (m[r.mode] ?? 0) + 1, m), {}), admittedOutsideWindow: outside };
      chk.stressCompletes = done === 'finished'; chk.stressNoDeadlockOnConformingOperations = !Object.keys(errors).some(k => k.endsWith(':40P01')); chk.stressExercisedAnswersAndModel = answers.length > 30 && checked > 0 && model.length > 0; chk.stressNoAdmissionOutsideAuthorityWindow = outside === 0; }
    return R(passOf(chk, viol), { chk, viol, out });
  },
  async N24_INFLIGHT_ADMISSIONS_ARE_AWAITED_BEFORE_ANY_ANSWER(ctx) {
    // R3 (F1): an admission that passed its authority-window check BEFORE a producer's scheduled retirement but commits after it must never be missed by a reader that answers for an instant at or after the retirement.
    // Each scenario opens real in-flight admissions (uncommitted / PREPAREd / terminated), lets the retirement times pass, resolves the instant from another session and finishes the admissions in a chosen way.
    const f = await consFixture(ctx); const out = {}, chk = {}, viol = [];
    let seq = 0, uid = 0; const prepared = []; const fresh = () => makeUser(ctx, 800 + ++uid); // every scenario gets its own owner: committed facts of one scenario must not colour another
    const factSql = (ns, id, cls) => `select ${ENT_SCHEMA}.admit_entitlement_event($1::uuid,'${ns}','${id}','${cls}',date_trunc('milliseconds', now() - interval '1 hour'),date_trunc('milliseconds', now() + interval '10 days')) s`;
    // registry writes queue behind any open admission's registry SHARE (by design), so every producer is created and scheduled BEFORE the first admission is opened
    const retireIn = async (nss, ms) => { await f.w.query('begin'); const r = (await rows1(f.w, `with u as (update ${ENT_SCHEMA}.producers set retired_at = (select date_trunc('milliseconds', clock_timestamp()) + interval '${ms} milliseconds') where namespace = any($1::text[]) returning retired_at) select to_char(max(retired_at) at time zone 'UTC',${ISOFMT}) t from u`, [[].concat(nss)]))[0]; await f.w.query('commit'); return r.t; };
    const expectOf = classes => classes.includes('paid') ? 'paid/paid_subscription' : classes.includes('trial') ? 'paid/trial' : 'free';
    const finishItem = async (it, fate, label, i) => {
      const gid = `r3_${label}_${i}`;
      if (fate === 'commit') await it.c.query('commit');
      else if (fate === 'rollback') await it.c.query('rollback');
      else if (fate === 'prepare-commit') { await it.c.query(`prepare transaction '${gid}'`); await ctx.su.query(`commit prepared '${gid}'`); }
      else if (fate === 'prepare-rollback') { await it.c.query(`prepare transaction '${gid}'`); await ctx.su.query(`rollback prepared '${gid}'`); }
      else if (fate === 'terminate') await rows1(f.obs, 'select pg_terminate_backend($1)', [it.pid]);
      else if (fate === 'late-commit-prepared') await ctx.su.query(`commit prepared '${gid}'`);
      else if (fate === 'late-rollback-prepared') await ctx.su.query(`rollback prepared '${gid}'`);
    };
    const committing = fate => /commit/.test(fate) && !/rollback/.test(fate);
    const scenario = async (label, { producers, fates, to = 'long', hold = 700, gap = 300, openTx = false, prepareFirst = false }) => {
      await f.setTimeouts(to === 'long' ? '20s' : 'default'); const o = await fresh(); const items = []; const made = [];
      for (const p of producers) { const ns = `r${++seq}-${label}`; made.push({ ns, prod: await makeProducer(ctx, ns), p }); }
      const lastRet = await retireIn(made.map(m => m.ns), 2500);
      for (const { ns, prod, p } of made) {
        const c = await ctx.open(prod.role); const pid = await pidOf(c); await c.query('begin'); const r = await call(c, factSql(ns, 'if-' + seq, p), [o]); items.push({ ns, c, pid, cls: p, admitted: r.ok && r.value?.outcome === 'admitted' });
      }
      if (prepareFirst) for (let i = 0; i < items.length; i++) { await items[i].c.query(`prepare transaction 'r3_${label}_${i}'`); prepared.push(`r3_${label}_${i}`); }
      await sleep(Math.max(0, Date.parse(lastRet) - Date.now() + 300));
      const I = await f.advance(o); let rc = f.rd; if (openTx) { rc = await ctx.open('acc_reader'); await rc.query('begin'); await rc.query('select count(*) from pg_catalog.pg_class'); }
      const p = f.resolve(rc, I, o); await sleep(hold);
      for (let i = 0; i < items.length; i++) { await finishItem(items[i], fates[i], label, i); await sleep(gap); }
      const a = await p; if (openTx) await rc.query('rollback').catch(() => {});
      const committed = items.filter((it, i) => it.admitted && committing(fates[i])).map(it => it.cls); const expected = expectOf(committed);
      const fin = await f.final(I, o);
      out[label] = { answer: a.answer ?? a.error, waitedMs: a.ms, expected, final: fin, admitted: items.map(it => it.admitted) };
      chk[label] = items.every(it => it.admitted) && (to === 'long' ? a.answer === expected : a.answer === 'unknown(OWNER_LOCK_TIMEOUT)' && a.ns.length === 0 && a.sampled_at === null) && fin === expected;
      viol.push(...await verdict(f, [{ label, I, o, ...a }]));
      for (const it of items) await it.c.query('rollback').catch(() => {});
      return { I, a, items, lastRet };
    };
    // (a) one in-flight admission, each end of the transaction; (b) PREPARE TRANSACTION first, committed / rolled back after the reader answered or while it still waits
    await scenario('commit', { producers: ['paid'], fates: ['commit'] });
    await scenario('rollback', { producers: ['paid'], fates: ['rollback'] });
    await scenario('prepare-commit', { producers: ['paid'], fates: ['prepare-commit'] });
    await scenario('prepare-rollback', { producers: ['paid'], fates: ['prepare-rollback'] });
    await scenario('terminate', { producers: ['paid'], fates: ['terminate'] });
    // (c) the admission outlives the reader's own wait limit (default 2 s): unknown, never free; the fact is committed afterwards
    await scenario('default-open', { producers: ['paid'], fates: ['commit'], to: 'default', hold: 2600 });
    await scenario('default-prepared', { producers: ['trial'], fates: ['late-commit-prepared'], to: 'default', hold: 2600, prepareFirst: true });
    await scenario('long-prepared-rolledback', { producers: ['paid'], fates: ['late-rollback-prepared'], hold: 700, prepareFirst: true });
    // (d) several producers, several in-flight admissions, both fact classes
    await scenario('multi-mixed', { producers: ['paid', 'trial', 'paid'], fates: ['commit', 'rollback', 'commit'] });
    await scenario('multi-trial-only', { producers: ['trial', 'trial'], fates: ['commit', 'prepare-commit'] });
    await scenario('multi-paid-rolled-trial-kept', { producers: ['paid', 'trial'], fates: ['rollback', 'commit'] });
    await scenario('multi-all-gone', { producers: ['paid', 'paid', 'trial'], fates: ['rollback', 'terminate', 'prepare-rollback'] });
    // (e) the reader's caller transaction already ran a SELECT before the call: the snapshot of the resolving statement is taken after the wait
    await scenario('earlier-select', { producers: ['paid'], fates: ['commit'], openTx: true });
    // (f) retirement boundary instants: r-1ms (still required), r (no longer required), r+1ms, all with the admission still in flight
    { await f.setTimeouts('20s'); const o = await fresh(); const ns = `r${++seq}-edge`; const prod = await makeProducer(ctx, ns); const ret = await retireIn(ns, 2000); const c = await ctx.open(prod.role); await c.query('begin'); const r0 = await call(c, factSql(ns, 'edge-1', 'paid'), [o]);
      await sleep(Math.max(0, Date.parse(ret) - Date.now() + 300)); await f.advance(o);
      const rds = [f.rd, await ctx.open('acc_reader'), await ctx.open('acc_reader')]; const Is = [-1, 0, 1].map(d => new Date(Date.parse(ret) + d).toISOString());
      const ps = rds.map((rd, i) => f.resolve(rd, Is[i], o)); await sleep(700); await c.query('commit'); const as = await Promise.all(ps);
      out.boundary = { retiredAt: ret, answers: as.map(a => a.answer ?? a.error) }; chk.boundaryInstantsAllAwaited = r0.ok && as.every(a => a.answer === 'paid/paid_subscription');
      for (let i = 0; i < 3; i++) viol.push(...await verdict(f, [{ label: 'boundary' + i, I: Is[i], o, ...as[i] }])); }
    // (g) the original safe control: a producer that is still REQUIRED (prod-a, owner2): the reader waits for its in-flight admission as well, and never answers free before the fact is visible
    { await f.setTimeouts('default'); const c = await ctx.open(f.pa.role); await c.query('begin'); const o2 = f.owner2;
      const r0 = await call(c, factSql('prod-a', 'req-1', 'paid'), [o2]); const I = await f.now(); const a1 = await f.resolve(f.rd, I, o2);
      await f.setTimeouts('20s'); const p2 = f.resolve(f.rd, I, o2); await sleep(600); await c.query('commit'); const a2 = await p2;
      out.requiredControl = { whileOpenDefaultTimeout: a1.answer ?? a1.error, afterCommit: a2.answer ?? a2.error }; chk.requiredProducerNeverFreeBeforeFactVisible = r0.ok && a1.answer === 'unknown(OWNER_LOCK_TIMEOUT)' && a2.answer === 'paid/paid_subscription';
      viol.push(...await verdict(f, [{ label: 'required-a1', I, o: o2, ...a1 }, { label: 'required-a2', I, o: o2, ...a2 }])); }
    // (h) stage "not yet written": the admission waits for the per-owner lock (held by another transaction) while the retirement time passes; once it runs it is refused and the reader answers free, consistently
    { await f.setTimeouts('20s'); const o = await fresh(); const ns = `r${++seq}-wait`; const prod = await makeProducer(ctx, ns); const ret = await retireIn(ns, 600);
      const holder = await ctx.open('supabase_admin'); await holder.query('begin'); const held = (await rows1(holder, `select pg_try_advisory_xact_lock(hashtextextended('${o}' || ':retention_entitlement:' || '${ns}', 0)) g`))[0].g; chk.notYetWrittenHolderAcquiredTheOwnerLock = held;
      const c = await ctx.open(prod.role); const adm = call(c, factSql(ns, 'wait-1', 'paid'), [o]); await sleep(Math.max(0, Date.parse(ret) - Date.now() + 300));
      const I = await f.advance(o); const p = f.resolve(f.rd, I, o); await sleep(400); await holder.query('commit'); const r0 = await adm; const a = await p; const fin = await f.final(I, o);
      out.notYetWritten = { admission: r0.ok ? 'ADMITTED' : r0.code, reader: a.answer ?? a.error, final: fin }; chk.notYetWrittenAdmissionRefusedAndReaderConsistent = !r0.ok && r0.code === '42501' && fin === 'free' && a.answer === 'free';
      viol.push(...await verdict(f, [{ label: 'not-yet-written', I, o, ...a }])); }
    out.preparedLeft = (await rows1(ctx.su, 'select count(*)::int n from pg_prepared_xacts'))[0].n; chk.noPreparedTransactionLeft = out.preparedLeft === 0;
    for (const g of prepared) await ctx.su.query(`rollback prepared '${g}'`).catch(() => {});
    await f.setTimeouts('default');
    return R(passOf(chk, viol), { chk, viol, out });
  },
  async N25_OWNER_SYNCHRONISATION_COSTS_TIMEOUTS_AND_LOCK_ORDER(ctx) {
    // R3 (F1): what the owner-level wait does NOT do (no wrong answer on timeout, no partial write, no needless blocking of other owners or of other readers) and how it interacts with coverage, savepoints and lock order.
    const f = await consFixture(ctx); const out = {}, chk = {}, viol = [];
    const o = f.owner, o2 = f.owner2; const factSql = (id, who) => `select ${ENT_SCHEMA}.admit_entitlement_event('${who}'::uuid,'prod-a','${id}','paid',date_trunc('milliseconds', now() + interval '1 day'),date_trunc('milliseconds', now() + interval '5 days')) s`;
    const factPast = (id, who) => `select ${ENT_SCHEMA}.admit_entitlement_event('${who}'::uuid,'prod-a','${id}','paid',date_trunc('milliseconds', now() - interval '1 hour'),date_trunc('milliseconds', now() + interval '5 days')) s`;
    // (a) in-flight COVERAGE advance of a required producer: the reader waits for it and then sees the coverage (free), or times out to unknown; never a wrong free
    { await f.setTimeouts('20s'); const c = await ctx.open(f.pa.role); await c.query('begin'); const T = await f.now(); await c.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz)`, [o2, T]);
      const p = f.resolve(f.rd, T, o2); await sleep(700); await c.query('commit'); const a = await p; out.coverageInFlight = a.answer ?? a.error; chk.coverageInFlightAwaitedThenFree = a.answer === 'free'; viol.push(...await verdict(f, [{ label: 'cov-a', I: T, o: o2, ...a }]));
      await f.setTimeouts('default'); const c2 = await ctx.open(f.pa.role); await c2.query('begin'); const T2 = await f.now(); await c2.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz)`, [o, T2]);
      const b = await f.resolve(f.rd, T2, o); chk.coverageInFlightPastTimeoutIsUnknown = b.answer === 'unknown(OWNER_LOCK_TIMEOUT)'; out.coverageInFlightTimeout = b.answer ?? b.error; await c2.query('rollback'); viol.push(...await verdict(f, [{ label: 'cov-b', I: T2, o, ...b }])); }
    // (b) admission and coverage advance of the SAME producer racing with a reader: whatever the order, no answer is contradicted by the final state
    { await f.setTimeouts('20s'); const owner3 = await makeUser(ctx, 750); const a1 = await ctx.open(f.pa.role), a2 = await ctx.open(f.pa.role); await a1.query('begin'); const r0 = await call(a1, factPast('race-1', owner3));
      const T = await f.now(); const adv = a2.query(`select ${ENT_SCHEMA}.advance_entitlement_coverage($1::uuid,'prod-a',$2::timestamptz)`, [owner3, T]).then(() => 'ok', e => e.code); await sleep(250);
      const p = f.resolve(f.rd, T, owner3); await sleep(500); await a1.query('commit'); const [a, av] = [await p, await adv]; const fin = await f.final(T, owner3);
      out.admissionVsCoverage = { admission: r0.ok, advance: av, reader: a.answer ?? a.error, final: fin }; chk.admissionVsCoverageConsistent = r0.ok && av === 'ok' && a.answer === 'paid/paid_subscription' && fin === 'paid/paid_subscription'; viol.push(...await verdict(f, [{ label: 'race', I: T, o: owner3, ...a }])); }
    // (c) timeout default: no persistence anywhere; termination of the in-flight admission releases the owner locks and nothing of it remains
    { await f.setTimeouts('default'); const I = await f.advance(o); await f.final(I, o); const before = await f.counts(); const c = await ctx.open(f.pa.role); const pid = await pidOf(c); await c.query('begin'); const r0 = await call(c, factSql('term-1', o)); const a = await f.resolve(f.rd, I, o);
      await rows1(f.obs, 'select pg_terminate_backend($1)', [pid]); await sleep(300); const b = await f.resolve(f.rd, I, o); const after = await f.counts();
      out.timeoutThenTerminate = { inflightAdmission: r0.ok, readerWhileInFlight: a.answer ?? a.error, readerAfterTermination: b.answer ?? b.error, before, after }; chk.timeoutIsUnknownThenTerminationLeavesNothing = r0.ok && a.answer === 'unknown(OWNER_LOCK_TIMEOUT)' && a.sampled_at === null && b.answer === 'free' && JSON.stringify(before) === JSON.stringify(after);
      viol.push(...await verdict(f, [{ label: 'term-a', I, o, ...a }, { label: 'term-b', I, o, ...b }])); }
    // (d) savepoint boundary: locks taken inside a rolled-back savepoint are released with it; a plain call keeps them until the caller's transaction ends; RELEASE SAVEPOINT keeps them
    { await f.setTimeouts('default'); const mk = async (how) => { const c = await ctx.open('acc_reader'); await c.query('begin'); if (how !== 'plain') await c.query('savepoint s'); await f.resolve(c, await f.now(), o); if (how === 'rollback') await c.query('rollback to savepoint s'); if (how === 'release') await c.query('release savepoint s'); return c; };
      const life = {}; for (const how of ['plain', 'rollback', 'release']) { const c = await mk(how); const before = await f.counts(); const adm = await ctx.open(f.pa.role); const t0 = Date.now(); const r = await call(adm, factSql('sp-' + how, o)); const ms = Date.now() - t0; const after = await f.counts();
        life[how] = { admission: r.ok ? 'admitted' : r.code, ms, eventsBefore: before.e, eventsAfter: after.e }; await c.query('rollback'); }
      out.savepointBoundary = life; chk.savepointRollbackReleasesOwnerLocks = life.rollback.admission === 'admitted' && life.rollback.ms < 800; chk.openCallerTransactionHoldsThemAndTimeoutIsFailClosed = life.plain.admission === '55P03' && life.plain.ms >= 1800 && life.plain.eventsAfter === life.plain.eventsBefore; chk.releaseSavepointKeepsThem = life.release.admission === '55P03' && life.release.eventsAfter === life.release.eventsBefore; }
    // (e) other owners and other readers are not blocked
    { await f.setTimeouts('default'); const c = await ctx.open(f.pa.role); await c.query('begin'); const r0 = await call(c, factSql('own-1', o)); const t0 = Date.now(); const aOther = await f.resolve(f.rd, await f.now(), o2); const admOther = await call(await ctx.open(f.pa.role), factSql('own-2', o2));
      const ra = await ctx.open('acc_reader'), rb = await ctx.open('acc_reader'); await c.query('rollback'); await ra.query('begin'); await rb.query('begin'); const Ig = await f.now(); await f.resolve(ra, Ig, o); const t1 = Date.now(); const bb = await Promise.race([f.resolve(rb, Ig, o), sleep(1500).then(() => 'BLOCKED')]); await ra.query('commit'); await rb.query('commit');
      out.isolationBetweenOwnersAndReaders = { inFlightForOwner1: r0.ok, readerOwner2Ms: aOther.ms, admissionOwner2: admOther.ok, secondOpenReaderMs: bb === 'BLOCKED' ? 'BLOCKED' : Date.now() - t1 };
      chk.otherOwnerNotBlocked = r0.ok && aOther.ms < 800 && aOther.answer !== undefined && admOther.ok; chk.readersDoNotBlockEachOther = bb !== 'BLOCKED' && bb.ms < 1000; }
    // (f) lock order and deadlock: two caller transactions that both resolve and then both admit for the same owner/namespace deadlock; one is told 40P01, the other completes; nothing hangs, nothing partial
    { await f.setTimeouts('20s'); const before = await f.counts(); const t1 = await ctx.open(f.pa.role), t2 = await ctx.open(f.pa.role); await t1.query('begin'); await t2.query('begin'); const Id = await f.now(); await f.resolve(t1, Id, o); await f.resolve(t2, Id, o);
      const e1 = call(t1, factSql('dl-1', o)); await sleep(300); const e2 = call(t2, factSql('dl-2', o)); const res = await Promise.race([Promise.all([e1, e2]), sleep(9000).then(() => 'HUNG')]);
      const codes = res === 'HUNG' ? ['HUNG'] : res.map(r => r.ok ? 'ok' : r.code); await t1.query('commit').catch(() => {}); await t2.query('commit').catch(() => {}); const after = await f.counts();
      out.upgradeDeadlock = { codes, eventsBefore: before.e, eventsAfter: after.e }; chk.deadlockDetectedNotHungExactlyOneCommitted = res !== 'HUNG' && codes.includes('40P01') && codes.includes('ok') && after.e === before.e + 1; }
    // (g) a reader that waits for the owner lock keeps the registry SHARE: a registry writer queues behind it (documented cost, bounded by the reader's own timeout), then runs; nothing hangs
    { await f.setTimeouts('default'); const holder = await ctx.open('supabase_admin'); await holder.query('begin'); const held = (await rows1(holder, `select pg_try_advisory_xact_lock(hashtextextended('${o}' || ':retention_entitlement:' || 'prod-a', 0)) g`))[0].g; chk.holderAcquiredTheOwnerLock = held;
      const p = f.resolve(f.rd, await f.now(), o); await sleep(300); const t0 = Date.now(); const wI = f.w.query(regSql('cost-w')).then(() => ({ ok: true, ms: Date.now() - t0 }), e => ({ err: e.code }));
      const reader = await p; const w = await Promise.race([wI, sleep(6000).then(() => 'HUNG')]); await holder.query('rollback');
      out.registryWriterBehindWaitingReader = { reader: reader.answer ?? reader.error, readerMs: reader.ms, writer: w }; chk.writerQueuedBehindWaitingReaderThenReleased = w !== 'HUNG' && w.ok === true && reader.answer === 'unknown(OWNER_LOCK_TIMEOUT)' && w.ms >= 1200; }
    await f.setTimeouts('default');
    return R(passOf(chk, viol), { chk, viol, out });
  }
});

// ---- migration-level gates (each runs against a database where the ENT0 migration is NOT yet applied) -------------------
async function persistedNone(ctx) {
  const r = await ctx.g.query(ctx.su, "select (select count(*)::int from pg_roles where rolname in ($1,$2)) roles, to_regnamespace('retention_entitlement') is not null schema, (select count(*)::int from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)) members", [ENT_OWNER, ENT_BUILDER]);
  return r.rows[0];
}
const noneLeft = p => p.roles === 0 && !p.schema && p.members === 0;
async function expectRefusal(cl, label, prepare, expectPrefix, { actorUser = 'postgres', settings = [], preexisting = false, source } = {}) {
  return cl.fresh(label, async ctx => {
    await prepare(ctx);
    const before = await persistedNone(ctx);
    const members = async () => JSON.stringify((await ctx.g.query(ctx.su, "select roleid,member,grantor from pg_auth_members where roleid::regrole::text !~ '^(authenticated|anon|service_role)' order by 1,2,3")).rows);
    const members0 = await members();
    const runner = actorUser === 'postgres' ? ctx.op : await ctx.open(actorUser);
    const notices = [];
    runner.on('notice', m => notices.push(m.message));
    let error = null;
    try { await ctx.g.query(runner, ctx.source); } catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await runner.query('ROLLBACK').catch(() => {}); }
    const after = await persistedNone(ctx);
    const stateUnchanged = same(before, after) && members0 === await members();
    const pass = !!error && error.message.startsWith(expectPrefix) && stateUnchanged && (preexisting || noneLeft(after)) && !notices.includes('ENT_DDL_BOUNDARY');
    return { label, expectPrefix, error, before, after, stateUnchanged, pass };
  }, { ent: false, settings, source });
}
export async function migrationRefusals(cl, source = entSource()) {
  const cases = [];
  const refuse = (label, prepare, prefix, opts = {}) => expectRefusal(cl, label, prepare, prefix, { ...opts, source });
  cases.push(await refuse('N11a-actor-createrole-not-db-owner', async ctx => { ctx.extraRoles.add('ent_creator'); await ctx.g.query(ctx.su, 'create role ent_creator login createrole'); await ctx.g.query(ctx.su, 'grant connect on database ' + ctx.name + ' to ent_creator'); }, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actorUser: 'ent_creator' }));
  for (const role of ['pgbouncer', 'supabase_auth_admin', 'dashboard_user', 'supabase_read_only_user', 'supabase_etl_admin']) {
    cases.push(await refuse('N11b-marker-role-' + role, async ctx => { ctx.extraRoles.add(role); await ctx.g.query(ctx.su, `create role ${role} nologin`); }, 'ENT_PLATFORM_APPLY_NOT_AUTHORIZED role:' + role));
  }
  cases.push(await refuse('N11c-marker-history-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema supabase_migrations'); }, 'ENT_PLATFORM_APPLY_NOT_AUTHORIZED schema:supabase_migrations'));
  cases.push(await refuse('N11d-marker-supautils-setting', async () => {}, 'ENT_PLATFORM_APPLY_NOT_AUTHORIZED setting:supautils', { settings: ["supautils.reserved_roles = 'ent_probe'"] }));
  for (const guc of ['tastkind.r0b_target', 'tastkind.r0b_manifest', 'tastkind.r0b_fixture_nonce']) {
    cases.push(await refuse('N11e-binding-setting-' + guc.split('.')[1], async ctx => { await ctx.op.query(`select set_config('${guc}','x',false)`); }, 'ENT_BINDINGS_NOT_SUPPORTED'));
  }
  cases.push(await refuse('N11f-preexisting-entitlement-role', async ctx => { ctx.extraRoles.add(ENT_OWNER); await ctx.g.query(ctx.su, `create role ${ENT_OWNER} nologin`); }, 'ENT_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('N11g-preexisting-entitlement-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema retention_entitlement'); }, 'ENT_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('N11h-unapproved-predefined-data-member', async ctx => { ctx.extraRoles.add('ent_reader'); await ctx.g.query(ctx.su, 'create role ent_reader nologin'); await ctx.g.query(ctx.su, 'grant pg_read_all_data to ent_reader'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('N11i-runtime-reaches-management-identity', async ctx => { await ctx.g.query(ctx.su, 'grant postgres to authenticated with inherit false, set false'); ctx.cleanups.push('revoke postgres from authenticated'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('N11j-missing-capture-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_capture cascade'); }, 'ENT_PREDECESSORS_MISSING'));
  cases.push(await refuse('N11k-missing-foundation-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_internal cascade'); }, 'ENT_PREDECESSORS_MISSING'));
  return R(cases.every(c => c.pass), cases);
}
const FAULT_ANCHORS = [
  ['builder-created', 'CREATE ROLE consumer_retention_entitlement_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;'],
  ['owner-granted', "EXECUTE pg_catalog.format('GRANT consumer_retention_entitlement_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);\nEND $$;"],
  ['tables-built', 'CREATE TRIGGER producer_guard BEFORE INSERT OR UPDATE OR DELETE ON retention_entitlement.producers\n FOR EACH ROW EXECUTE FUNCTION retention_entitlement.guard_producer_update();'],
  ['state-function-created', 'ALTER FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) OWNER TO consumer_retention_entitlement_owner;'],
  ['rls-forced', 'ALTER TABLE retention_entitlement.entitlement_coverage FORCE ROW LEVEL SECURITY;'],
  ['builder-dropped', 'DROP ROLE consumer_retention_entitlement_builder;']
];
export async function migrationRollbackAndDrift(cl, installSource = entSource()) {
  const out = [];
  for (const [label, anchor] of FAULT_ANCHORS) {
    if (installSource.split(anchor).length !== 2) throw Error('SETUP_FAULT_ANCHOR ' + label);
    const mutant = installSource.replace(anchor, () => anchor + '\nSELECT 1/0;');
    out.push(await cl.fresh('N12-fault-' + label, async ctx => {
      const members = async () => JSON.stringify((await ctx.g.query(ctx.su, 'select roleid,member,grantor from pg_auth_members order by 1,2,3')).rows);
      const before = await members();
      const a = await tryApply(ctx, mutant);
      const p = await persistedNone(ctx);
      const after = await members();
      return { label, error: a.error, boundary: a.boundary, persisted: p, membershipsUnchanged: before === after, pass: a.error?.code === '22012' && a.boundary && noneLeft(p) && before === after };
    }, { ent: false, source: installSource }));
  }
  const drifts = [
    ['role-created', async ctx => { ctx.extraRoles.add('ent_drift_role'); await ctx.g.query(ctx.su, 'create role ent_drift_role nologin'); }],
    ['public-table-acl', async ctx => { await ctx.g.query(ctx.su, 'grant select on public.restaurants to anon'); }],
    ['membership', async ctx => { await ctx.g.query(ctx.su, 'grant anon to service_role'); ctx.cleanups.push('revoke anon from service_role'); }]
  ];
  for (const [label, drift] of drifts) {
    out.push(await cl.fresh('N12-drift-' + label, async ctx => {
      await installProbe(ctx.su);
      const d0 = await ddlAttempts(ctx.su);
      const runner = await ctx.open('postgres'); const locker = await ctx.open('supabase_admin');
      let error = null, paused = false;
      try {
        await locker.query('select pg_catalog.pg_advisory_lock($1)', [PROBE_PAUSE_LOCK]);
        const pending = ctx.g.query(runner, ctx.source).then(() => null, e => ({ code: e.code, message: String(e.message) }));
        for (let i = 0; i < 200 && !paused; i++) { paused = (await ctx.su.query("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) w", [PROBE_PAUSE_LOCK])).rows[0].w; if (!paused) await new Promise(r => setTimeout(r, 100)); }
        if (paused) await drift(ctx);
        await locker.query('select pg_catalog.pg_advisory_unlock($1)', [PROBE_PAUSE_LOCK]);
        error = await pending;
      } finally { await runner.query('ROLLBACK').catch(() => {}); }
      const p = await persistedNone(ctx);
      const attempts = (await ddlAttempts(ctx.su)) - d0;
      await ctx.su.query('revoke select on public.restaurants from anon').catch(() => {});
      await ctx.su.query('revoke anon from service_role').catch(() => {});
      return { label, paused, error, persisted: p, ddlAttempts: attempts, pass: paused && !!error && error.message.startsWith('ENT_POST_GUARD_DRIFT') && attempts > 0 && noneLeft(p) };
    }, { ent: false, settings: ["tastkind_probe.pause = 'on'"], source: installSource }));
  }
  return R(out.every(o => o.pass), out);
}

// ---- frozen scope -----------------------------------------------------------------------------------------------
GATES.F01_FROZEN_SCOPE_AND_INVENTORY = async () => {
  const frozen = frozenProof(), inv = inventoryProof();
  const sourceSha = sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', ENT0_MIGRATION)));
  // Exact ORDERED new-migration tail; ENT0 is not assumed to be last. With the origin successor recorded (persistence smoke, byte-pinned) the demo migration (20261010172126) sorts after ENT0 (20261010010000).
  const tail = frozen.recoverySuccessor.demo === 'record' ? [CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION] : [CAPTURE_SUCCESSOR, ENT0_MIGRATION];
  return R(frozen.violations.length === 0 && frozen.recoverySuccessor.state === 'ent0' && inv.migrationCount === 143 + tail.length && same(inv.newPaths, tail) && inv.changedBaselineMigrations.length === 0 && sourceSha === ENT0_MIGRATION_SHA256, { frozen, inv, tail, sourceSha, pinned: ENT0_MIGRATION_SHA256 });
};

// ---- runner ------------------------------------------------------------------------------------------------------
export const POSITIVE_IDS = ['P01_EMPTY_REGISTRY_IS_UNKNOWN_NEVER_FREE', 'P02_PAID_FACT_CLOSED_OPEN_INTERVAL', 'P03_FREE_PROVABLE_ONLY_UNDER_COVERAGE', 'P04_OQ1_TRIAL_IS_PAID_LEVEL_BUT_NOT_A_PAYMENT',
  'P05_OQ1_EXPIRED_TRIAL_NEW_RECORDS_ARE_FREE', 'P06_OQ1_EXISTING_RECORD_INSTANT_IS_NEVER_SHORTENED', 'P07_OQ1_TRIAL_TO_PAID_NO_DUPLICATE_EXTENSION', 'P08_REPLAY_IDEMPOTENT_AND_DIGEST_COMPUTED_IN_DATABASE',
  'P09_MULTI_NAMESPACE_REGISTRATION_WINDOWS_AND_FACT_RETENTION', 'P10_CONCURRENT_ADMISSION_AND_COVERAGE', 'P11_READER_SNAPSHOT_NEVER_SEES_COVERAGE_WITHOUT_ITS_FACTS', 'P12_EXACT_POST_STATE_SEALED_ROLES_AND_ACL',
  'P13_NO_CATALOG_CHANGE_OUTSIDE_THE_NEW_SCHEMA_AND_MEAL_SAVE_STILL_WORKS', 'P14_ACCOUNT_DELETION_REMOVES_FACTS', 'P15_REGISTRY_EFFECTIVE_WINDOW_BOUNDARIES', 'P16_PROVEN_ANSWERS_SURVIVE_REGISTRY_CHANGES', 'P17_STATE_AT_EQUALS_AN_INDEPENDENT_ORACLE_OVER_REPRESENTABLE_DATA'];
export const NEGATIVE_IDS = ['N01_RUNTIME_ROLES_CANNOT_REACH_LEDGER', 'N02_PRODUCER_IDENTITY_IS_THE_REGISTERED_DATABASE_ROLE', 'N03_CALLER_CANNOT_SUPPLY_DIGEST_TIER_OR_PAYMENT_CLAIM', 'N04_FACTS_ARE_IMMUTABLE_AND_PRODUCERS_ARE_PINNED',
  'N05_SAME_ID_DIFFERENT_CONTENT_CONFLICTS', 'N06_COVERAGE_NEVER_REGRESSES_OR_JUMPS_AHEAD_OF_THE_CLOCK', 'N07_FACT_AT_OR_BEFORE_COVERAGE_IS_REJECTED', 'N08_INVALID_ARGUMENTS_AND_ROWS_ARE_REJECTED',
  'N09_FUTURE_AND_UNCOVERED_INSTANTS_ARE_UNKNOWN', 'N10_NO_RETENTION_MEAL_OR_SUBSCRIPTION_COUPLING', 'N11_MIGRATION_PRECONDITIONS_FAIL_CLOSED', 'N12_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT', 'N13_PRODUCER_CANNOT_ASSERT_BEFORE_ITS_REGISTRATION', 'N14_REGISTRY_ROWS_ARE_NEVER_RETROACTIVE_OR_DELETED', 'N15_AUTHORISATION_FOLLOWS_THE_EFFECTIVE_WINDOW', 'N16_UNREPRESENTABLE_EVENTS_ARE_NOT_SILENTLY_HANDLED', 'N17_REGISTRY_STAMP_IS_TAKEN_AFTER_THE_LOCK', 'N18_CONCURRENT_REQUESTS_AND_LOCK_ORDER',
  'N19_READERS_WAIT_FOR_OPEN_REGISTRY_WRITES', 'N20_PREPARED_TRANSACTIONS_AND_SYNC_COMMIT_STALLS', 'N21_ISOLATION_LEVELS_AND_EARLIER_SNAPSHOTS', 'N22_ADMISSION_AND_COVERAGE_FAIL_CLOSED', 'N23_HISTORICAL_CASES_LOCK_ORDER_AND_CHAOS',
  'N24_INFLIGHT_ADMISSIONS_ARE_AWAITED_BEFORE_ANY_ANSWER', 'N25_OWNER_SYNCHRONISATION_COSTS_TIMEOUTS_AND_LOCK_ORDER'];
export const SUPPLEMENTARY_IDS = ['F01_FROZEN_SCOPE_AND_INVENTORY', 'F02_GATE_SELECTION_CONTRACT', 'F03_GATE_SELECTION_MUTANTS_ARE_DETECTED'];
export const ALL_GATE_IDS = [...POSITIVE_IDS, ...NEGATIVE_IDS, ...SUPPLEMENTARY_IDS];
// ---- R3 (F2): gate selection contract -----------------------------------------------------------------------------------
// TK_GATES unset -> every gate. TK_GATES set -> EXACTLY the named gates (full ids, comma separated, canonical order). An unknown id, a mixed list (known + unknown), an empty token or an empty value is refused with a
// non-zero exit BEFORE any cluster work; a selection that ends up executing nothing is BLOCKED, never a pass. Consistent with TK_MUTANTS (full ids only).
export function selectGates(raw, all) {
  if (raw === undefined) return { ids: [...all], filtered: false };
  const toks = String(raw).split(',').map(s => s.trim());
  if (toks.every(t => t === '')) throw Error('EMPTY_GATE_SELECTION TK_GATES is set but names no gate');
  const bad = toks.filter(t => t === '' || !all.includes(t));
  if (bad.length) throw Error('UNKNOWN_GATE_ID ' + bad.map(t => t === '' ? '<empty>' : t).join(','));
  const set = new Set(toks);
  return { ids: all.filter(id => set.has(id)), filtered: true };
}
export function outcomeOf({ selected, results, blocked }) {
  const failed = results.filter(r => !r.pass).map(r => r.id);
  const missing = selected.filter(id => !results.some(r => r.id === id));
  if (blocked) return { status: 'BLOCKED', exitCode: 2, failed, missing };
  if (selected.length === 0 || results.length === 0 || missing.length) return { status: 'BLOCKED', exitCode: 2, failed, missing, reason: 'SELECTION_NOT_EXECUTED' };
  return failed.length ? { status: 'FAIL', exitCode: 1, failed, missing } : { status: 'PASS', exitCode: 0, failed, missing };
}
const SEL_ALL = ['A1', 'A2', 'B1'];
const SEL_CASES = [
  ['unset selects all', undefined, { ids: ['A1', 'A2', 'B1'], filtered: false }], ['one valid id', 'A2', { ids: ['A2'], filtered: true }], ['two valid ids, canonical order', 'B1,A1', { ids: ['A1', 'B1'], filtered: true }],
  ['whitespace tolerated', ' A1 , B1 ', { ids: ['A1', 'B1'], filtered: true }], ['duplicate id selects once', 'A1,A1', { ids: ['A1'], filtered: true }],
  ['unknown id refused', 'ZZ', { error: 'UNKNOWN_GATE_ID' }], ['mixed known and unknown refused', 'A1,ZZ', { error: 'UNKNOWN_GATE_ID' }], ['prefix is not an id', 'A', { error: 'UNKNOWN_GATE_ID' }],
  ['empty value refused', '', { error: 'EMPTY_GATE_SELECTION' }], ['only separators refused', ' , ', { error: 'EMPTY_GATE_SELECTION' }], ['empty token among valid ids refused', 'A1,,B1', { error: 'UNKNOWN_GATE_ID' }], ['trailing comma refused', 'A1,', { error: 'UNKNOWN_GATE_ID' }]];
const OUT_CASES = [
  ['all selected, all pass', { selected: ['A1', 'A2'], results: [{ id: 'A1', pass: true }, { id: 'A2', pass: true }], blocked: null }, { status: 'PASS', exitCode: 0 }],
  ['one failing', { selected: ['A1', 'A2'], results: [{ id: 'A1', pass: true }, { id: 'A2', pass: false }], blocked: null }, { status: 'FAIL', exitCode: 1 }],
  ['nothing executed is blocked', { selected: ['A1'], results: [], blocked: null }, { status: 'BLOCKED', exitCode: 2 }],
  ['empty selection is blocked', { selected: [], results: [], blocked: null }, { status: 'BLOCKED', exitCode: 2 }],
  ['a selected gate that did not run is blocked', { selected: ['A1', 'A2'], results: [{ id: 'A1', pass: true }], blocked: null }, { status: 'BLOCKED', exitCode: 2 }],
  ['a blocked gate is blocked', { selected: ['A1'], results: [], blocked: { id: 'A1' } }, { status: 'BLOCKED', exitCode: 2 }]];
export function selectionContractRows(sel = selectGates, out = outcomeOf) {
  const rows = [];
  for (const [name, raw, want] of SEL_CASES) {
    let got; try { got = sel(raw, SEL_ALL); } catch (e) { got = { error: String(e.message).split(' ')[0] }; }
    rows.push({ name: 'select: ' + name, ok: JSON.stringify(got) === JSON.stringify(want), got });
  }
  for (const [name, arg, want] of OUT_CASES) { const got = out(arg); rows.push({ name: 'outcome: ' + name, ok: got.status === want.status && got.exitCode === want.exitCode, got: { status: got.status, exitCode: got.exitCode } }); }
  return rows;
}
const asFn = src => new Function('return ' + src)();
// each runner mutant restores one old / unsafe behaviour; the contract rows must fail for it
const swap = (id, s, a, b) => { if (s.split(a).length !== 2) throw Error('RUNNER_MUTANT_ANCHOR ' + id); return s.replace(a, () => b); };
const RUNNER_MUTANTS = [
  ['m1_unknown_ids_ignored', 'selectGates', s => swap('m1', s, "const bad = toks.filter(t => t === '' || !all.includes(t));", 'const bad = [];')],
  ['m2_prefix_matching', 'selectGates', s => swap('m2', swap('m2', s, "const bad = toks.filter(t => t === '' || !all.includes(t));", 'const bad = [];'), 'return { ids: all.filter(id => set.has(id)), filtered: true };', "return { ids: all.filter(id => toks.some(t => t !== '' && id.startsWith(t))), filtered: true };")],
  ['m3_empty_selection_allowed', 'selectGates', s => swap('m3', s, "if (toks.every(t => t === '')) throw", 'if (false) throw')],
  ['m4_unset_selects_nothing', 'selectGates', s => swap('m4', s, 'return { ids: [...all], filtered: false };', 'return { ids: [], filtered: false };')],
  ['m5_zero_executed_is_a_pass', 'outcomeOf', s => swap('m5', s, 'if (selected.length === 0 || results.length === 0 || missing.length) return', 'if (false) return')],
  ['m6_unexecuted_selected_gate_ignored', 'outcomeOf', s => swap('m6', s, '|| missing.length) return', ') return')]];
const runnerSpawn = (env, extra = []) => { const r = child.spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...extra], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 240000, maxBuffer: 16 << 20 }); return { code: r.status, out: String(r.stdout ?? ''), err: String(r.stderr ?? '') }; };
GATES.F02_GATE_SELECTION_CONTRACT = async () => {
  const rows = selectionContractRows(); const o = {};
  // real processes: refusals happen before any cluster or binary work (the --pg-bin below does not exist); the selection is never silently narrowed
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ent0-f02-')); const bad = {};
  for (const [name, val] of [['unknown', 'NO_SUCH_GATE'], ['mixed', 'F01_FROZEN_SCOPE_AND_INVENTORY,NO_SUCH_GATE'], ['empty', ''], ['separators', ','], ['prefix', 'N10'], ['trailing-comma', 'F01_FROZEN_SCOPE_AND_INVENTORY,']]) {
    const r = runnerSpawn({ TK_GATES: val }, ['--pg-bin', path.join(tmp, 'no-such-pg', 'bin'), '--out', path.join(tmp, 'neg-' + name)]);
    bad[name] = { code: r.code, checkLines: (r.out.match(/^CHECK /gm) ?? []).length, outDirCreated: fs.existsSync(path.join(tmp, 'neg-' + name)) };
  }
  o.refusals = bad;
  const refused = Object.values(bad).every(b => b.code !== 0 && b.code !== null && b.checkLines === 0 && !b.outDirCreated);
  // positive: exactly the selected gates run, in canonical order, whatever the order named (needs a cluster; cheap gates only)
  const P01 = 'P01_EMPTY_REGISTRY_IS_UNKNOWN_NEVER_FREE', P02 = 'P02_PAID_FACT_CLOSED_OPEN_INTERVAL';
  const pos = runnerSpawn({ TK_GATES: P02 + ',' + P01 }, ['--pg-bin', options().bin, '--out', path.join(tmp, 'pos')]);
  const lines = pos.out.split(/\r?\n/).filter(l => /^CHECK /.test(l)).map(l => l.split(' ')[1]);
  let res = null; try { res = JSON.parse(fs.readFileSync(path.join(tmp, 'pos', 'result.json'), 'utf8')); } catch {}
  o.positive = { code: pos.code, lines, status: res?.status, selected: res?.selected };
  const exact = pos.code === 0 && same(lines, [P01, P02]) && res?.status === 'PASS' && same(res.selected, [P01, P02]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  o.rows = rows.map(r => ({ name: r.name, ok: r.ok }));
  return R(rows.every(r => r.ok) && refused && exact, o);
};
GATES.F03_GATE_SELECTION_MUTANTS_ARE_DETECTED = async () => {
  const pristine = selectionContractRows(); const o = { pristineFailing: pristine.filter(r => !r.ok).map(r => r.name), mutants: {} }; let allDetected = true;
  for (const [id, fn, mutate] of RUNNER_MUTANTS) {
    const src = (fn === 'selectGates' ? selectGates : outcomeOf).toString(); const m = mutate(src);
    if (m === src) throw Error('RUNNER_MUTANT_NOT_APPLIED ' + id);
    const rows = fn === 'selectGates' ? selectionContractRows(asFn(m), outcomeOf) : selectionContractRows(selectGates, asFn(m));
    const failing = rows.filter(r => !r.ok).map(r => r.name); o.mutants[id] = failing; if (!failing.length) allDetected = false;
  }
  return R(o.pristineFailing.length === 0 && allDetected, o);
};

// the real runner: the selection is validated before any cluster work, and what ran is compared with what was selected
export async function runGate(cl, id, source = entSource()) {
  if (id === 'N11_MIGRATION_PRECONDITIONS_FAIL_CLOSED') return migrationRefusals(cl, source);
  if (id === 'N12_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT') return migrationRollbackAndDrift(cl, source);
  if (id.startsWith('F0')) return GATES[id]();
  return cl.fresh(id, ctx => GATES[id](ctx), { source });
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
      catch (e) { blocked = { id, message: String(e.message), stack: e.stack }; rec.write('check-' + id + '.json', { id, status: 'BLOCKED', error: blocked.message }); console.log('CHECK ' + id + ' BLOCKED ' + blocked.message.slice(0, 300)); break; }
      rec.write('check-' + id + '.json', { id, pass: r.pass, observed: r.observed });
      results.push({ id, pass: r.pass });
      console.log('CHECK ' + id + ' ' + (r.pass ? 'PASS' : 'FAIL'));
    }
  } finally { await cl.stop(); }
  const o = outcomeOf({ selected, results, blocked });
  rec.write('result.json', { status: o.status, exitCode: o.exitCode, selected, positives: POSITIVE_IDS.length, negatives: NEGATIVE_IDS.length, supplementary: SUPPLEMENTARY_IDS.length, checks: results, failed: o.failed, notExecuted: o.missing, reason: o.reason ?? null, blocked });
  if (o.reason) console.error('BLOCKED ' + o.reason + ' not executed: ' + o.missing.join(','));
  return o.exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try { const sel = selectGates(process.env.TK_GATES, ALL_GATE_IDS); code = await runSmoke({ ...options(), selected: sel.ids }); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
