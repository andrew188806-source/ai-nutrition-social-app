#!/usr/bin/env node
// TastKind R0-B-ENT1-A local acceptance gates (Owner-approved 2026-10-16): inactive Paid/trial ACQUISITION RECEIPT. Disposable PostgreSQL 17 only; never a remote target.
// A receipt is acquisition evidence, not an effective retention grant. Gates are exported so the mutation harness runs the very same detectors against changed migration SQL.
// There is no production call path for the resolver: every gate below drives it through a test-only caller role that exists only in a disposable database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, MIGRATION, CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION as PINNED_ACQ_MIGRATION, ACQ_MIGRATION_SHA256, SEAL_MIGRATION, BILLING_MIGRATION, withAct2Tail, withSocialTail, recorder, sha, uuid, installProbe, ddlAttempts, PROBE_PAUSE_LOCK } from './consumer-retention-persistence-smoke.mjs';
import { act, frozenProof, inventoryProof, options, ELIGIBLE } from './consumer-retention-capture-smoke.mjs';
import { checkedEntw1State } from './consumer-retention-persistence-smoke.mjs';
import { ENTW1_WIRING } from './consumer-retention-entw1-exact-successor.mjs';
import { entCluster, selectGates, outcomeOf, selectionContractRows } from './consumer-retention-entitlement-smoke.mjs';

export { options };
export const ACQ_MIGRATION = PINNED_ACQ_MIGRATION; // 20261017010000_consumer_retention_acquisition_record.sql (name and sha256 are pinned by the persistence smoke)
export const ACQ_SCHEMA = 'retention_acquisition';
export const ACQ_OWNER = 'consumer_retention_acquisition_owner';
export const ACQ_BUILDER = 'consumer_retention_acquisition_builder';
export const ACQ_POST_DIGEST = 'a99805e1907d59f08b10d3aba7d2da0a9d78114631c0c6fd1556398f720e1d8c';
export const acqSource = () => fs.readFileSync(path.join(ROOT, 'supabase/migrations', ACQ_MIGRATION), 'utf8');

const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 1);
const at = (days, extraMs = 0) => new Date(BASE + days * DAY + extraMs).toISOString();
const isoMs = d => (d instanceof Date ? d : new Date(d)).toISOString();
const SQL_RESOLVE = `select ${ACQ_SCHEMA}.resolve_detail_acquisition($1::uuid) s`;
const ENT = 'retention_entitlement';
const FN_SIGS = [
  ['admit_entitlement_event', 'uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint'],
  ['advance_entitlement_coverage', 'uuid, text, timestamp with time zone'],
  ['entitlement_state_at', 'uuid, timestamp with time zone']
];

// ---- apply / fresh database -------------------------------------------------------------------------------------------
// The approved read seams are GRANT/POLICY on objects owned by the capture and entitlement owners, so the migration needs a native superuser: it is applied through the superuser connection.
export async function acqApply(ctx, sql) {
  const notices = [];
  const onNotice = m => notices.push(m.message);
  ctx.su.on('notice', onNotice);
  let error = null;
  try { await ctx.g.query(ctx.su, sql); }
  catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await ctx.su.query('ROLLBACK').catch(() => {}); }
  finally { ctx.su.removeListener('notice', onNotice); }
  return { error, notices, boundary: notices.includes('ACQ_DDL_BOUNDARY') };
}
// Template = 142 baseline + foundation + capture (entCluster); each database gets the accepted ENT0 migration, then (optionally) the ENT1-A migration.
export function acqFresh(cl, label, fn, { apply = true, acq = acqSource(), settings = [] } = {}) {
  return cl.fresh(label, async ctx => {
    ctx.extraRoles.add(ACQ_OWNER); ctx.extraRoles.add(ACQ_BUILDER);
    ctx.acqSource = acq;
    ctx.items0 = await catalogItems(ctx);
    if (apply) {
      ctx.acq = await acqApply(ctx, acq);
      if (ctx.acq.error) throw Error('SETUP_ACQ_APPLY ' + JSON.stringify(ctx.acq.error));
      ctx.items1 = await catalogItems(ctx);
    }
    return fn(ctx);
  }, { settings });
}

// ---- catalog items outside the new schema/roles (for the "only the approved seams changed" proof) -----------------------------
const aclText = (aclExpr, kind, ownerExpr) => `coalesce((select string_agg(coalesce(nullif(pg_get_userbyid(a.grantee)::text,''),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable||':'||pg_get_userbyid(a.grantor), ',' order by pg_get_userbyid(a.grantee)::text, a.privilege_type) from aclexplode(coalesce(${aclExpr}, acldefault('${kind}', ${ownerExpr}))) a),'')`;
export async function catalogItems(ctx) {
  const own = `(n.nspname <> '${ACQ_SCHEMA}')`;
  const sys = "n.nspname !~ '^pg_' and n.nspname <> 'information_schema'";
  const Q = {
    ns: `select 'ns:'||n.nspname k, pg_get_userbyid(n.nspowner)::text core, ${aclText('n.nspacl', 'n', 'n.nspowner')} acl from pg_namespace n where ${sys} and ${own}`,
    cls: `select 'class:'||n.nspname||'.'||c.relname k, format('%s|%s|%s|%s|%s', c.relkind, pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity, c.reloptions) core, ${aclText('c.relacl', 'r', 'c.relowner')} acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    attr: `select 'attr:'||n.nspname||'.'||c.relname||'.'||a.attname k, format('%s|%s', format_type(a.atttypid,a.atttypmod), a.attnotnull) core, coalesce(a.attacl::text,'') acl from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own} and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v','m','p')`,
    proc: `select 'proc:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, format('%s|%s|%s|%s', pg_get_userbyid(p.proowner), p.proconfig, p.prosecdef, md5(pg_get_functiondef(p.oid))) core, ${aclText('p.proacl', 'f', 'p.proowner')} acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${sys} and ${own}`,
    pol: `select 'policy:'||n.nspname||'.'||c.relname||'.'||o.polname k, format('%s|%s|%s|%s|%s', o.polcmd, o.polpermissive, (select string_agg(coalesce(r.rolname,'PUBLIC'),',' order by r.rolname) from pg_roles r where r.oid=any(o.polroles)), pg_get_expr(o.polqual,o.polrelid), pg_get_expr(o.polwithcheck,o.polrelid)) core, '' acl from pg_policy o join pg_class c on c.oid=o.polrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    trg: `select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname k, pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text core, '' acl from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own} and not (t.tgisinternal and exists (select 1 from pg_constraint k where k.oid=t.tgconstraint and k.connamespace=to_regnamespace('${ACQ_SCHEMA}')))`,
    con: `select 'con:'||n.nspname||'.'||c.relname||'.'||k.conname k, pg_get_constraintdef(k.oid) core, '' acl from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    dacl: `select 'defacl:'||pg_get_userbyid(d.defaclrole)||':'||coalesce(d.defaclnamespace::regnamespace::text,'')||':'||d.defaclobjtype::text k, coalesce(d.defaclacl::text,'') core, '' acl from pg_default_acl d where pg_get_userbyid(d.defaclrole) not in ('${ACQ_OWNER}','${ACQ_BUILDER}')`,
    role: `select 'role:'||r.rolname k, format('%s|%s|%s|%s|%s|%s|%s|%s', r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconfig) core, '' acl from pg_roles r where r.rolname not in ('${ACQ_OWNER}','${ACQ_BUILDER}')`,
    mem: `select 'member:'||pg_get_userbyid(m.roleid)||'>'||pg_get_userbyid(m.member) k, format('%s|%s|%s|%s', pg_get_userbyid(m.grantor), m.admin_option, m.inherit_option, m.set_option) core, '' acl from pg_auth_members m where not exists (select 1 from pg_roles x where x.oid in (m.roleid,m.member,m.grantor) and x.rolname in ('${ACQ_OWNER}','${ACQ_BUILDER}'))`,
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
export const EXPECTED_DELTA = {
  added: ['policy:retention_capture.detail_capture_anchors.acquisition_owner_select#core'],
  removed: [],
  changed: [
    'class:retention_capture.detail_capture_anchors#acl',
    'ns:retention_capture#acl',
    'ns:retention_entitlement#acl',
    `proc:${ENT}.entitlement_state_at(p_owner uuid, p_instant timestamp with time zone)#acl`
  ].sort()
};

// ---- fixtures -------------------------------------------------------------------------------------------------------------------
const q = (ctx, text, v) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
const count = async (ctx, table, where = 'true') => (await q(ctx, `select count(*)::int n from ${table} where ${where}`))[0].n;
const receiptsOf = (ctx, where = 'true', v = []) => q(ctx, `select * from ${ACQ_SCHEMA}.detail_acquisition_records where ${where} order by resource_id`, v);
const call = async (c, text, v = []) => {
  try { const r = await c.query(text, v); return { ok: true, value: r.rows[0]?.s }; }
  catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message) }; }
};
async function regWrite(ctx, text, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); }
  catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
// A user that PC-2 treats as core-eligible (profile + preparation cohort), needed to delete meals through the guarded tables as the superuser.
async function makeEligible(ctx, n) {
  const u = await makeUser(ctx, n);
  await ctx.g.query(ctx.su, "insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key) values($1,$2,'Synthetic','Synthetic','BG')", [u, 'acq-profile-' + n]);
  await ctx.g.query(ctx.su, "insert into consumer_internal.preparation_cohort(user_id,profile_id,predecessor,captured_at) values($1,$2,'30268ee4de59a8d8855c1dcaa01795d2f1ce33b1',now())", [u, 'acq-profile-' + n]);
  return u;
}
async function makeUser(ctx, n) { await ctx.g.query(ctx.su, 'insert into auth.users(id,email) values($1,$2)', [uuid(n), `acq${n}@synthetic.invalid`]); return uuid(n); }
// Test-only producer: a login role registered in the DISPOSABLE registry (registration written under replica so the test instants may lie in the past). The migrations register nobody.
async function makeProducer(ctx, ns, { registeredAt = at(-400), retiredAt = null, resolve = false } = {}) {
  const role = 'acq_p_' + ns.replace(/[^a-z0-9]/g, '_');
  ctx.extraRoles.add(role);
  await ctx.g.query(ctx.su, `create role ${role} login`);
  await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to ${role}`);
  for (const [fn, args] of FN_SIGS) await ctx.g.query(ctx.su, `grant execute on function ${ENT}.${fn}(${args}) to ${role}`);
  if (resolve) await grantResolve(ctx, role);
  await regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,$4::timestamptz)`, [ns, role, registeredAt, retiredAt]);
  return { ns, role, c: await ctx.open(role) };
}
async function grantResolve(ctx, role) {
  await ctx.g.query(ctx.su, `grant usage on schema ${ACQ_SCHEMA} to ${role}`);
  await ctx.g.query(ctx.su, `grant execute on function ${ACQ_SCHEMA}.resolve_detail_acquisition(uuid) to ${role}`);
}
// Test-only caller. The migration grants EXECUTE on the resolver to nobody; this role exists only in the disposable database.
async function makeCaller(ctx, name = 'acq_caller') {
  ctx.extraRoles.add(name);
  await ctx.g.query(ctx.su, `create role ${name} login`);
  await grantResolve(ctx, name);
  return { role: name, c: await ctx.open(name) };
}
const admit = (p, owner, up, cls, from, until, seq = null, ns = p.ns) =>
  call(p.c, `select ${ENT}.admit_entitlement_event($1::uuid,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::bigint) s`, [owner, ns, up, cls, from, until, seq]);
const advance = (p, owner, through, ns = p.ns) => call(p.c, `select ${ENT}.advance_entitlement_coverage($1::uuid,$2,$3::timestamptz) s`, [owner, ns, through]);
const resolve = (c, id) => call(c, SQL_RESOLVE, [id]);
const stateAt = (ctx, owner, instant) => ctx.g.query(ctx.su, `select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [owner, instant]).then(r => r.rows[0].s);
const MEAL_SQL = "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source) values($1,'lunch',$2::timestamptz,$3::date,'manual') returning id";
// Anchor fixture: a meal row plus an anchor row with a CHOSEN T0 and capture_context, written by the superuser under replica (the capture trigger itself is exercised in P10/P14 through the real RPC).
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
const msOf = s => Date.parse(s);
const plus4320h = iso => new Date(Date.parse(iso) + 4320 * 3600 * 1000).toISOString();
const pend = (r, reason) => r.ok && r.value.outcome === 'pending' && r.value.reason === reason && r.value.receipt === null;
const items = name => JSON.stringify([{ displayName: name, nutritionSource: 'manual', nutrition: { calories: 100, protein: 5, carbohydrates: 15, fat: 2, fiber: 1 } }]);
const V2_SQL = "select public.create_current_user_meal_record_v2('lunch',$1::timestamptz,$2::date,$3::uuid,'Asia/Taipei',$4,null,'manual',$5::jsonb) s";
async function realMeal(ctx, key, uid = ELIGIBLE) {
  const now = new Date().toISOString();
  const r = await act(ctx, uid, V2_SQL, [now, now.slice(0, 10), uuid(key), 'SYNTHETIC acq meal', items('x')]);
  if (!r.ok) throw Error('SETUP_REAL_MEAL ' + r.code + ' ' + r.message);
  return r.rows[0].s.id ?? r.rows[0].s.mealRecordId ?? r.rows[0].s.record?.id;
}
const anchorOf = async (ctx, id) => (await q(ctx, 'select owner_user_id, original_recorded_at, capture_context from retention_capture.detail_capture_anchors where resource_id=$1', [id]))[0];

export const GATES = {};

const KEYS = ['owner_user_id', 'original_recorded_at', 'acquisition_ref', 'tier', 'basis', 'evidence_event_ids', 'entitlement_sampled_at', 'retained_until', 'resolved_at'];
const rcpt = r => r.ok && r.value.receipt;
Object.assign(GATES, {
  async P01_PAID_FACT_AT_T0_FORMS_RECEIPT_WITHOUT_COVERAGE(ctx) {
    const owner = await makeUser(ctx, 1); const caller = await makeCaller(ctx);
    const p = await makeProducer(ctx, 'billing');
    const t0 = at(10, 123);
    const id = await fixtureMeal(ctx, owner, { t0 });
    const a = await admit(p, owner, 'sub-1', 'paid', at(5), at(40)); // NO coverage was ever advanced: incomplete coverage must not block Paid (AP-2)
    const covRows = await count(ctx, `${ENT}.entitlement_coverage`);
    // the deadline is T0 + 4320 ELAPSED hours whatever the caller's session time zone (a calendar-day interval would move by an hour across a DST change)
    await caller.c.query("set time zone 'America/New_York'");
    const r = await resolve(caller.c, id);
    await caller.c.query('reset time zone');
    const row = (await receiptsOf(ctx))[0];
    const ok = a.ok && covRows === 0 && r.ok && r.value.outcome === 'recorded' && r.value.reason === null && Object.keys(r.value.receipt).sort().join() === [...KEYS].sort().join()
      && rcpt(r).tier === 'paid' && rcpt(r).basis === 'paid_subscription' && rcpt(r).acquisition_ref === 'acq:' + id && rcpt(r).owner_user_id === owner
      && rcpt(r).original_recorded_at === t0 && rcpt(r).retained_until === plus4320h(t0) && same(rcpt(r).evidence_event_ids, [a.value.event_id])
      && row && row.acquisition_tier === 'paid' && row.capture_context === 'authenticated_actor' && row.retention_policy_version === 'consumer-retention-owner-2026-10-03-v1' && row.entitlement_policy === 'retention-entitlement-v1'
      && isoMs(row.retained_until) === plus4320h(t0) && isoMs(row.original_recorded_at) === t0;
    return R(ok, { a, covRows, r, row: row && { ...row, entitlement_evidence: '…' } });
  },
  async P02_TRIAL_FACT_FORMS_A_TRIAL_BASIS_RECEIPT_NOT_A_PAYMENT(ctx) {
    const owner = await makeUser(ctx, 2); const caller = await makeCaller(ctx);
    const trial = await makeProducer(ctx, 'premium-trial'); await makeProducer(ctx, 'billing');
    const t0 = at(3);
    const id = await fixtureMeal(ctx, owner, { t0 });
    const a = await admit(trial, owner, 'trial-1', 'trial', at(0), at(14));
    await advance(trial, owner, at(2)); // billing never attests coverage: still a receipt
    const r = await resolve(caller.c, id);
    const cols = (await q(ctx, `select column_name from information_schema.columns where table_schema='${ACQ_SCHEMA}' and table_name='detail_acquisition_records' order by 1`)).map(x => x.column_name);
    const payment = cols.filter(c => /pay|price|amount|invoice|card|currency|charge|receipt_no/i.test(c));
    const subs = await count(ctx, 'public.subscription_entitlements');
    const ok = a.ok && r.ok && r.value.outcome === 'recorded' && rcpt(r).basis === 'trial' && rcpt(r).tier === 'paid' && rcpt(r).retained_until === plus4320h(t0)
      && same(rcpt(r).evidence_event_ids, [a.value.event_id]) && payment.length === 0 && subs === 0;
    return R(ok, { a, r, cols, payment, subs });
  },
  async P03_TRIAL_AND_PAID_OVERLAP_KEEP_BOTH_EVIDENCE_AND_PAID_BASIS(ctx) {
    const owner = await makeUser(ctx, 3); const caller = await makeCaller(ctx);
    const trial = await makeProducer(ctx, 'premium-trial'); const bill = await makeProducer(ctx, 'billing');
    const t0 = at(7);
    const id = await fixtureMeal(ctx, owner, { t0 });
    const a = await admit(trial, owner, 'trial-1', 'trial', at(0), at(14));
    const b = await admit(bill, owner, 'sub-1', 'paid', at(6), at(36));
    const r = await resolve(caller.c, id);
    const want = [a.value?.event_id, b.value?.event_id].sort();
    const ok = a.ok && b.ok && r.ok && r.value.outcome === 'recorded' && rcpt(r).basis === 'paid_subscription' && same(rcpt(r).evidence_event_ids, want) && rcpt(r).retained_until === plus4320h(t0);
    return R(ok, { a, b, r, want });
  },
  async P04_RECEIPT_EVIDENCE_IS_THE_SAME_RESOLUTION(ctx) {
    const owner = await makeUser(ctx, 4); const caller = await makeCaller(ctx);
    const bill = await makeProducer(ctx, 'billing'); const trial = await makeProducer(ctx, 'premium-trial');
    const t0 = at(20, 7);
    const id = await fixtureMeal(ctx, owner, { t0 });
    await admit(bill, owner, 'sub-1', 'paid', at(15), at(45));
    await admit(trial, owner, 'trial-1', 'trial', at(18), at(32));
    await advance(trial, owner, at(19)); // coverage revision 1 on one namespace, none on the other
    const r = await resolve(caller.c, id);
    const row = (await receiptsOf(ctx))[0];
    if (!row) return R(false, { r, receipt: 'ABSENT' }); // a defective resolver must make the gate FAIL, never throw
    const ev = row.entitlement_evidence;
    // independent oracle over the committed ledger (raw SQL, not the resolver)
    const oracleEvents = (await q(ctx, `select event_id from ${ENT}.entitlement_events where owner_user_id=$1 and valid_from <= $2::timestamptz and $2::timestamptz < valid_until order by event_id`, [owner, t0])).map(x => x.event_id);
    const oracleCov = await q(ctx, `select p.namespace, c.covered_through, c.revision from ${ENT}.producers p left join ${ENT}.entitlement_coverage c on c.namespace=p.namespace and c.owner_user_id=$1 where p.registered_at <= $2::timestamptz and (p.retired_at is null or $2::timestamptz < p.retired_at) order by p.namespace`, [owner, t0]);
    const covEv = ev.evidence.coverage;
    const covMatch = covEv.length === oracleCov.length && covEv.every((c, i) => c.namespace === oracleCov[i].namespace && c.revision === (oracleCov[i].revision === null ? null : Number(oracleCov[i].revision))
      && (oracleCov[i].covered_through === null ? c.covered_through === null : c.covered_through === isoMs(oracleCov[i].covered_through)));
    const fresh = await stateAt(ctx, owner, t0); // a later, independent call of the same resolver over unchanged facts
    const strip = s => ({ ...s, sampled_at: undefined });
    const ok = r.ok && r.value.outcome === 'recorded'
      && same(row.evidence_event_ids, oracleEvents) && same(ev.evidence.events, oracleEvents) && oracleEvents.length === 2
      && ev.state === 'paid' && ev.basis === row.acquisition_basis && ev.policy === row.entitlement_policy
      && ev.sampled_at === isoMs(row.entitlement_sampled_at) && rcpt(r).entitlement_sampled_at === ev.sampled_at
      && covMatch && same(strip(fresh), strip(ev)) && Date.parse(ev.sampled_at) >= Date.parse(t0);
    return R(ok, { r, evidence: ev, oracleEvents, oracleCov, covMatch, freshSameExceptSampledAt: same(strip(fresh), strip(ev)) });
  },
  async P05_REPLAY_NEVER_RESAMPLES_OR_RESETS_THE_DEADLINE(ctx) {
    const owner = await makeUser(ctx, 5); const caller = await makeCaller(ctx);
    const bill = await makeProducer(ctx, 'billing');
    const t0 = at(30);
    const id = await fixtureMeal(ctx, owner, { t0 });
    await admit(bill, owner, 'sub-1', 'paid', at(25), at(50));
    const first = await resolve(caller.c, id);
    // the world moves on: coverage advances, more facts, the producer is scheduled to retire, the original fact is long over
    await advance(bill, owner, at(100));
    await admit(bill, owner, 'sub-2', 'paid', at(120), at(150));
    const later = [];
    for (let i = 0; i < 3; i++) { await sleep(40); later.push(await resolve(caller.c, id)); }
    // replay must not take the registry lock or call the resolver: an open registry writer does not block it
    const w = await ctx.open('supabase_admin'); await w.query('begin');
    await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('lock-probe', 'acq_lock_probe')`);
    const t = Date.now(); const duringRegistryWrite = await resolve(caller.c, id); const ms = Date.now() - t; await w.query('rollback');
    const n = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    const ok = first.ok && first.value.outcome === 'recorded' && later.every(x => x.ok && x.value.outcome === 'replayed' && same(x.value.receipt, first.value.receipt))
      && duringRegistryWrite.ok && duringRegistryWrite.value.outcome === 'replayed' && same(duringRegistryWrite.value.receipt, first.value.receipt) && ms < 1000 && n === 1
      && rcpt(first).retained_until === plus4320h(t0);
    return R(ok, { first, replays: later.map(x => x.value?.outcome), duringRegistryWriteMs: ms, rows: n });
  },
  async P06_LATER_EXPIRY_OR_DOWNGRADE_NEVER_SHORTENS_AN_EXISTING_RECEIPT(ctx) {
    const owner = await makeUser(ctx, 6); const caller = await makeCaller(ctx);
    const bill = await makeProducer(ctx, 'billing');
    const t0 = at(10);
    const id = await fixtureMeal(ctx, owner, { t0 });
    await admit(bill, owner, 'sub-1', 'paid', at(0), at(12)); // the subscription ends two days after T0
    const first = await resolve(caller.c, id);
    await advance(bill, owner, at(200)); // the owner is Free from day 12 on, with complete coverage
    const nowState = await stateAt(ctx, owner, at(100));
    const again = await resolve(caller.c, id);
    const other = await fixtureMeal(ctx, owner, { t0: at(100) }); // a NEW meal in the Free period gets no receipt (Free is provisional, never recorded)
    const free = await resolve(caller.c, other);
    const ok = first.ok && again.ok && again.value.outcome === 'replayed' && same(again.value.receipt, first.value.receipt) && rcpt(again).retained_until === plus4320h(t0)
      && nowState.state === 'free' && pend(free, 'FREE_PROVISIONAL_NOT_FINAL') && await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`) === 1;
    return R(ok, { first: first.value?.outcome, again: again.value?.outcome, free: free.value, nowState: nowState.state });
  },
  async P07_FACT_BOUNDARIES_ARE_HALF_OPEN_AT_T0(ctx) {
    const caller = await makeCaller(ctx); const bill = await makeProducer(ctx, 'billing');
    const cases = [];
    const t0 = at(10, 500);
    const one = async (n, from, until) => {
      const o = await makeUser(ctx, 700 + n); const id = await fixtureMeal(ctx, o, { t0 });
      await admit(bill, o, 'sub-' + n, 'paid', from, until);
      const r = await resolve(caller.c, id);
      return { n, from, until, outcome: r.value?.outcome, reason: r.value?.reason };
    };
    cases.push(await one(1, t0, at(40)));                    // valid_from == T0: covered
    cases.push(await one(2, at(10, 501), at(40)));          // starts 1 ms after T0: not covered
    cases.push(await one(3, at(0), t0));                    // valid_until == T0: exclusive, not covered
    cases.push(await one(4, at(0), at(10, 501)));           // ends 1 ms after T0: covered
    cases.push(await one(5, at(10, 600), at(40)));          // starts after T0
    const rows = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    const ok = cases[0].outcome === 'recorded' && cases[1].outcome === 'pending' && cases[2].outcome === 'pending' && cases[3].outcome === 'recorded' && cases[4].outcome === 'pending' && rows === 2;
    return R(ok, { cases, rows });
  },
  async P08_LATE_ARRIVING_FACT_IS_PICKED_UP_BY_A_RETRY_AND_FREE_IS_NEVER_FLIPPED(ctx) {
    const owner = await makeUser(ctx, 8); const caller = await makeCaller(ctx);
    const bill = await makeProducer(ctx, 'billing');
    const t0 = at(10);
    const id = await fixtureMeal(ctx, owner, { t0 });
    const early = await resolve(caller.c, id); // no coverage yet -> unknown
    const late = await admit(bill, owner, 'sub-late', 'paid', at(9), at(30)); // the fact arrives after the meal; coverage has not passed it, so it is admissible
    const retry = await resolve(caller.c, id);
    // second owner: coverage already proves Free at T0 -> a late fact covering T0 is refused by the ledger and the resolver stays pending (provisional Free, nothing recorded)
    const owner2 = await makeUser(ctx, 80); const id2 = await fixtureMeal(ctx, owner2, { t0 });
    await advance(bill, owner2, at(20));
    const lateRejected = await admit(bill, owner2, 'sub-too-late', 'paid', at(9), at(30));
    const free = await resolve(caller.c, id2);
    const ok = pend(early, 'COVERAGE_SHORT') && late.ok && retry.ok && retry.value.outcome === 'recorded' && same(rcpt(retry).evidence_event_ids, [late.value.event_id])
      && !lateRejected.ok && /ENT_EVENT_BELOW_COVERAGE/.test(lateRejected.message) && pend(free, 'FREE_PROVISIONAL_NOT_FINAL') && await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`, `resource_id='${id2}'`) === 0;
    return R(ok, { early: early.value, retry: retry.value?.outcome, lateRejected: lateRejected.message, free: free.value });
  },
  async P09_COVERAGE_COMBINATIONS_FOLLOW_AP2(ctx) {
    const caller = await makeCaller(ctx);
    const bill = await makeProducer(ctx, 'billing'); const trial = await makeProducer(ctx, 'premium-trial');
    const t0 = at(10);
    const out = {};
    const mk = async n => { const o = await makeUser(ctx, 900 + n); return { o, id: await fixtureMeal(ctx, o, { t0 }) }; };
    { const { o, id } = await mk(1); await admit(bill, o, 's', 'paid', at(5), at(30)); out.paidCoverageNone = await resolve(caller.c, id); }
    { const { o, id } = await mk(2); await admit(bill, o, 's', 'paid', at(5), at(30)); await advance(trial, o, at(50)); out.paidOtherCoverageFullBillingNone = await resolve(caller.c, id); }
    { const { o, id } = await mk(3); await admit(trial, o, 't', 'trial', at(5), at(19)); await advance(bill, o, at(3)); out.trialBillingCoverageShort = await resolve(caller.c, id); }
    { const { o, id } = await mk(4); await advance(bill, o, at(3)); out.noFactCoverageShort = await resolve(caller.c, id); }
    { const { o, id } = await mk(5); await advance(bill, o, at(50)); await advance(trial, o, at(50)); out.noFactFullCoverage = await resolve(caller.c, id); }
    const rows = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    const ok = out.paidCoverageNone.value?.outcome === 'recorded' && out.paidOtherCoverageFullBillingNone.value?.outcome === 'recorded' && out.trialBillingCoverageShort.value?.outcome === 'recorded' && rcpt(out.trialBillingCoverageShort).basis === 'trial'
      && pend(out.noFactCoverageShort, 'COVERAGE_SHORT') && pend(out.noFactFullCoverage, 'FREE_PROVISIONAL_NOT_FINAL') && rows === 3;
    return R(ok, { out: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.value?.outcome + ':' + (v.value?.reason ?? v.value?.receipt?.basis)])), rows });
  }
});

// ---- positive gates, part 2 -----------------------------------------------------------------------------------------------
const EXPECT_COLUMNS = ['acquisition_basis', 'acquisition_ref', 'acquisition_tier', 'capture_context', 'entitlement_evidence', 'entitlement_policy', 'entitlement_sampled_at', 'evidence_event_ids', 'original_recorded_at', 'owner_user_id', 'resolved_at', 'resource_id', 'retained_until', 'retention_policy_version'];
const EXPECT_CONSTRAINTS = ['detail_acquisition_records_entitlement_sampled_at_instant', 'detail_acquisition_records_original_recorded_at_instant', 'detail_acquisition_records_pkey', 'detail_acquisition_records_resolved_at_instant', 'detail_acquisition_records_resource_id_fkey', 'detail_acquisition_records_retained_until_instant',
  'receipt_basis_valid', 'receipt_capture_context', 'receipt_deadline_exact', 'receipt_entitlement_policy', 'receipt_evidence_events', 'receipt_evidence_nonempty', 'receipt_evidence_sampled', 'receipt_evidence_state', 'receipt_ref_exact', 'receipt_retention_policy', 'receipt_sampled_not_before_t0', 'receipt_tier_paid'].sort();
// effective privilege matrix: (role, object, privilege) -> boolean, computed with the has_*_privilege functions (membership and inheritance included)
async function privilegeMatrix(ctx, roles) {
  const objs = [
    ['schema', ACQ_SCHEMA, ['USAGE', 'CREATE']], ['table', `${ACQ_SCHEMA}.detail_acquisition_records`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']],
    ['function', `${ACQ_SCHEMA}.resolve_detail_acquisition(uuid)`, ['EXECUTE']], ['function', `${ACQ_SCHEMA}.validate_receipt()`, ['EXECUTE']], ['function', `${ACQ_SCHEMA}.reject_receipt_update()`, ['EXECUTE']],
    ['schema', 'retention_capture', ['USAGE', 'CREATE']], ['table', 'retention_capture.detail_capture_anchors', ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']],
    ['function', 'retention_capture.capture_meal_record_insert()', ['EXECUTE']], ['function', 'retention_capture.reject_anchor_update()', ['EXECUTE']],
    ['schema', ENT, ['USAGE', 'CREATE']], ['table', `${ENT}.producers`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']], ['table', `${ENT}.entitlement_events`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']], ['table', `${ENT}.entitlement_coverage`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
    ['function', `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`, ['EXECUTE']], ['function', `${ENT}.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)`, ['EXECUTE']],
    ['function', `${ENT}.advance_entitlement_coverage(uuid,text,timestamp with time zone)`, ['EXECUTE']]
  ];
  const granted = [];
  for (const role of roles) for (const [kind, name, privs] of objs) for (const priv of privs) {
    const fn = kind === 'schema' ? 'has_schema_privilege' : kind === 'table' ? 'has_table_privilege' : 'has_function_privilege';
    const ok = (await q(ctx, `select ${fn}($1, $2, $3) v`, [role, name, priv]))[0].v;
    if (ok) granted.push(`${role}|${name}|${priv}`);
  }
  return granted.sort();
}
const OWN_PRIVS = (role, name, privs) => privs.map(p => `${role}|${name}|${p}`);
Object.assign(GATES, {
  async P10_REAL_CAPTURE_ANCHOR_FEEDS_THE_RESOLVER_AND_CONTEXT_IS_CHECKED(ctx) {
    const caller = await makeCaller(ctx); const bill = await makeProducer(ctx, 'billing');
    const id = await realMeal(ctx, 5001); // real RPC as the authenticated eligible user: the capture trigger writes the anchor
    const anchor = await anchorOf(ctx, id);
    const t0 = isoMs(anchor.original_recorded_at);
    const a = await admit(bill, ELIGIBLE, 'sub-real', 'paid', isoMs(new Date(Date.parse(t0) - 3600e3)), isoMs(new Date(Date.parse(t0) + 3600e3)));
    const r = await resolve(caller.c, id);
    // a meal inserted by the superuser WITHOUT an actor claim is captured as no_actor_claim: never used for a receipt
    const bare = (await ctx.g.query(ctx.su, MEAL_SQL, [ELIGIBLE, new Date().toISOString(), new Date().toISOString().slice(0, 10)])).rows[0].id;
    const bareAnchor = await anchorOf(ctx, bare);
    const rb = await resolve(caller.c, bare);
    const ok = anchor.capture_context === 'authenticated_actor' && anchor.owner_user_id === ELIGIBLE && a.ok && r.ok && r.value.outcome === 'recorded' && rcpt(r).owner_user_id === ELIGIBLE && rcpt(r).original_recorded_at === t0
      && rcpt(r).retained_until === plus4320h(t0) && bareAnchor.capture_context === 'no_actor_claim' && pend(rb, 'CAPTURE_CONTEXT_UNTRUSTED') && await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`) === 1;
    return R(ok, { anchor, t0, a, r: r.value?.outcome, bareContext: bareAnchor.capture_context, rb: rb.value });
  },
  async P11_MEAL_AND_ACCOUNT_DELETION_REMOVE_RECEIPTS_BY_CASCADE(ctx) {
    const caller = await makeCaller(ctx); const bill = await makeProducer(ctx, 'billing');
    const owner = await makeEligible(ctx, 11);
    const ids = [];
    for (const d of [10, 11]) { const id = await fixtureMeal(ctx, owner, { t0: at(d) }); ids.push(id); }
    await admit(bill, owner, 'sub-1', 'paid', at(0), at(60));
    const rs = [await resolve(caller.c, ids[0]), await resolve(caller.c, ids[1])];
    const before = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    const del1 = await ctx.g.query(ctx.su, 'delete from public.meal_records where id=$1', [ids[0]]).then(() => null, e => e.code);
    const mid = { receipts: await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`), anchors: await count(ctx, 'retention_capture.detail_capture_anchors', `resource_id='${ids[0]}'`) };
    const del2 = await ctx.g.query(ctx.su, 'delete from auth.users where id=$1', [owner]).then(() => null, e => e.code);
    const after = { receipts: await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`), anchors: await count(ctx, 'retention_capture.detail_capture_anchors'), events: await count(ctx, `${ENT}.entitlement_events`) };
    const orphans = (await q(ctx, `select count(*)::int n from ${ACQ_SCHEMA}.detail_acquisition_records r where not exists (select 1 from retention_capture.detail_capture_anchors a where a.resource_id=r.resource_id)`))[0].n;
    const ok = rs.every(x => x.ok && x.value.outcome === 'recorded') && before === 2 && del1 === null && mid.receipts === 1 && mid.anchors === 0 && del2 === null && after.receipts === 0 && after.anchors === 0 && after.events === 0 && orphans === 0;
    return R(ok, { before, del1, mid, del2, after, orphans });
  },
  async P12_EXACT_POST_STATE_SEALED_ROLE_OBJECTS_AND_EFFECTIVE_PRIVILEGE_MATRIX(ctx) {
    const src = ctx.acqSource;
    const own = /IS DISTINCT FROM '([0-9a-f]{64})'/.exec(src)?.[1];
    const pinned = !!own && src.split(own).length === 3 && (src !== acqSource() || own === ACQ_POST_DIGEST);
    const roles = await q(ctx, "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil is null nova, (select count(*) from pg_shadow s where s.usename=r.rolname and s.passwd is not null)::int pw from pg_roles r where rolname in ($1,$2) order by 1", [ACQ_OWNER, ACQ_BUILDER]);
    const roleOk = roles.length === 1 && roles[0].rolname === ACQ_OWNER && !roles[0].rolsuper && !roles[0].rolinherit && !roles[0].rolcreaterole && !roles[0].rolcreatedb && !roles[0].rolcanlogin && !roles[0].rolreplication && !roles[0].rolbypassrls && roles[0].rolconnlimit === -1 && roles[0].nova && roles[0].pw === 0;
    const members = (await q(ctx, "select count(*)::int n from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)", [ACQ_OWNER, ACQ_BUILDER]))[0].n;
    const owned = await q(ctx, "select n.nspname, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relowner=(select oid from pg_roles where rolname=$1) and n.nspname !~ '^pg_toast' order by 1,2", [ACQ_OWNER]);
    const ownedProcs = await q(ctx, "select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proowner=(select oid from pg_roles where rolname=$1) order by 1,2", [ACQ_OWNER]);
    const ownedSchemas = (await q(ctx, "select nspname from pg_namespace where nspowner=(select oid from pg_roles where rolname=$1)", [ACQ_OWNER])).map(x => x.nspname);
    const cols = (await q(ctx, `select column_name from information_schema.columns where table_schema='${ACQ_SCHEMA}' and table_name='detail_acquisition_records' order by 1`)).map(x => x.column_name);
    const cons = (await q(ctx, `select conname from pg_constraint where connamespace=to_regnamespace('${ACQ_SCHEMA}') order by 1`)).map(x => x.conname);
    const rls = (await q(ctx, `select relrowsecurity r, relforcerowsecurity f from pg_class where oid='${ACQ_SCHEMA}.detail_acquisition_records'::regclass`))[0];
    const pols = (await q(ctx, `select polname, polcmd, polpermissive, (select array_agg(rolname::text) from pg_roles where oid = any(polroles)) roles, pg_get_expr(polqual, polrelid) qual, pg_get_expr(polwithcheck, polrelid) chk from pg_policy where polrelid='${ACQ_SCHEMA}.detail_acquisition_records'::regclass order by 1`));
    const trgs = (await q(ctx, `select tgname, tgenabled::text e from pg_trigger where tgrelid='${ACQ_SCHEMA}.detail_acquisition_records'::regclass and not tgisinternal order by 1`));
    const fns = await q(ctx, `select p.proname, p.prosecdef, p.provolatile::text v, p.proconfig, pg_get_function_identity_arguments(p.oid) args from pg_proc p where p.pronamespace=to_regnamespace('${ACQ_SCHEMA}') order by 1`);
    const polOk = pols.length === 2 && pols[0].polname === 'acq_owner_insert' && pols[0].polcmd === 'a' && pols[0].chk === 'true' && pols[1].polname === 'acq_owner_select' && pols[1].polcmd === 'r' && pols[1].qual === 'true' && pols.every(p => p.polpermissive && same(p.roles, [ACQ_OWNER]));
    const fnOk = fns.length === 3 && fns[0].proname === 'reject_receipt_update' && !fns[0].prosecdef && fns[1].proname === 'resolve_detail_acquisition' && fns[1].prosecdef && fns[1].v === 'v' && same(fns[1].proconfig, ['search_path=""', 'lock_timeout=2s']) && fns[1].args === 'p_resource_id uuid'
      && fns[2].proname === 'validate_receipt' && !fns[2].prosecdef && fns[0].proconfig?.[0] === 'search_path=""' && fns[2].proconfig?.[0] === 'search_path=""';
    // effective privileges: nobody except the sealed owners (and, for the seams, the acquisition owner) holds anything; superusers are listed, not claimed
    await ctx.g.query(ctx.su, 'create role acq_nobody login'); ctx.extraRoles.add('acq_nobody');
    const supers = (await q(ctx, 'select rolname from pg_roles where rolsuper order by 1')).map(x => x.rolname);
    const roleNames = ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'acq_nobody', 'consumer_retention_capture_owner', 'consumer_retention_entitlement_owner', 'consumer_retention_foundation_owner', ACQ_OWNER].filter(r => !supers.includes(r) || r === 'postgres' && false);
    const got = await privilegeMatrix(ctx, roleNames.filter(r => !supers.includes(r)));
    const all = (kinds, role, name) => OWN_PRIVS(role, name, kinds);
    const want = [
      ...all(['USAGE', 'CREATE'], ACQ_OWNER, ACQ_SCHEMA), ...all(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], ACQ_OWNER, `${ACQ_SCHEMA}.detail_acquisition_records`),
      ...all(['EXECUTE'], ACQ_OWNER, `${ACQ_SCHEMA}.resolve_detail_acquisition(uuid)`), ...all(['EXECUTE'], ACQ_OWNER, `${ACQ_SCHEMA}.validate_receipt()`), ...all(['EXECUTE'], ACQ_OWNER, `${ACQ_SCHEMA}.reject_receipt_update()`),
      // the approved seams, and only them
      ...all(['USAGE'], ACQ_OWNER, 'retention_capture'), ...all(['SELECT'], ACQ_OWNER, 'retention_capture.detail_capture_anchors'),
      ...all(['USAGE'], ACQ_OWNER, ENT), ...all(['EXECUTE'], ACQ_OWNER, `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`),
      // the predecessors keep exactly their own owners' privileges
      ...all(['USAGE', 'CREATE'], 'consumer_retention_capture_owner', 'retention_capture'), ...all(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'consumer_retention_capture_owner', 'retention_capture.detail_capture_anchors'),
      ...all(['EXECUTE'], 'consumer_retention_capture_owner', 'retention_capture.capture_meal_record_insert()'), ...all(['EXECUTE'], 'consumer_retention_capture_owner', 'retention_capture.reject_anchor_update()'),
      ...all(['USAGE', 'CREATE'], 'consumer_retention_entitlement_owner', ENT), ...all(['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'consumer_retention_entitlement_owner', `${ENT}.producers`), ...all(['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'consumer_retention_entitlement_owner', `${ENT}.entitlement_events`),
      ...all(['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'consumer_retention_entitlement_owner', `${ENT}.entitlement_coverage`), ...all(['EXECUTE'], 'consumer_retention_entitlement_owner', `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`),
      ...all(['EXECUTE'], 'consumer_retention_entitlement_owner', `${ENT}.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)`), ...all(['EXECUTE'], 'consumer_retention_entitlement_owner', `${ENT}.advance_entitlement_coverage(uuid,text,timestamp with time zone)`)
    ].sort();
    const unexpected = got.filter(x => !want.includes(x)), missing = want.filter(x => !got.includes(x));
    // nobody (except superusers) can become the sealed owner: neither by inheritance nor by SET ROLE
    const reach = [];
    for (const r of ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'acq_nobody']) if (!supers.includes(r)) for (const p of ['USAGE', 'MEMBER', 'SET']) if ((await q(ctx, 'select pg_has_role($1,$2,$3) v', [r, ACQ_OWNER, p]))[0].v) reach.push(`${r}:${p}`);
    const ok = pinned && roleOk && members === 0 && same(ownedSchemas, [ACQ_SCHEMA]) && owned.every(o => o.nspname === ACQ_SCHEMA) && ownedProcs.every(o => o.nspname === ACQ_SCHEMA) && ownedProcs.length === 3
      && same(cols, EXPECT_COLUMNS) && same(cons, EXPECT_CONSTRAINTS) && rls.r && rls.f && polOk && same(trgs, [{ tgname: 'receipt_immutable', e: 'O' }, { tgname: 'receipt_validate', e: 'O' }]) && fnOk
      && unexpected.length === 0 && missing.length === 0 && reach.length === 0;
    return R(ok, { pols, pinned, own, roles, members, owned, ownedProcs: ownedProcs.length, ownedSchemas, cols, cons, polOk, trgs, fns, unexpected, missing, reach, supers });
  },
  async P13_CATALOG_DIFFERENCE_OUTSIDE_THE_NEW_SCHEMA_IS_EXACTLY_THE_APPROVED_SEAMS(ctx) {
    const d = itemsDiff(ctx.items0, ctx.items1);
    // the acl changes are exactly the approved grants (value-level), not just "something changed"
    const want = {
      'ns:retention_capture#acl': 'consumer_retention_acquisition_owner:USAGE:false:consumer_retention_capture_owner',
      'ns:retention_entitlement#acl': 'consumer_retention_acquisition_owner:USAGE:false:consumer_retention_entitlement_owner',
      'class:retention_capture.detail_capture_anchors#acl': 'consumer_retention_acquisition_owner:SELECT:false:consumer_retention_capture_owner'
    };
    const diffVal = k => { const b = ctx.items0.get(k), a = ctx.items1.get(k); return a.split(',').filter(x => !b.split(',').includes(x)); };
    const valuesOk = Object.entries(want).every(([k, v]) => same(diffVal(k), [v]) && ctx.items0.get(k).split(',').every(x => ctx.items1.get(k).split(',').includes(x)))
      && same(diffVal(`proc:${ENT}.entitlement_state_at(p_owner uuid, p_instant timestamp with time zone)#acl`), ['consumer_retention_acquisition_owner:EXECUTE:false:consumer_retention_entitlement_owner']);
    const pol = ctx.items1.get('policy:retention_capture.detail_capture_anchors.acquisition_owner_select#core');
    const polOk = pol === 'r|t|consumer_retention_acquisition_owner|true|';
    return R(same(d, EXPECTED_DELTA) && valuesOk && polOk, { diff: d, expected: EXPECTED_DELTA, valuesOk, pol });
  },
  async P14_MEAL_SAVE_STILL_WORKS_AND_NOTHING_WIRES_THE_RESOLVER(ctx) {
    const triggersBefore = (await q(ctx, "select tgname from pg_trigger where tgrelid='public.meal_records'::regclass and not tgisinternal order by 1")).map(x => x.tgname);
    const id = await realMeal(ctx, 5002);
    const anchors = await count(ctx, 'retention_capture.detail_capture_anchors', `resource_id='${id}'`);
    const receipts = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    const refs = (await q(ctx, "select n.nspname||'.'||p.proname n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname<>$1 and p.prosrc ilike '%resolve_detail_acquisition%' order by 1", [ACQ_SCHEMA])).map(x => x.n);
    const viewRefs = (await q(ctx, "select c.relname from pg_class c where c.relkind in ('v','m') and pg_get_viewdef(c.oid) ilike '%retention_acquisition%'")).map(x => x.relname);
    const trigFns = (await q(ctx, `select c.relname, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_class c on c.oid=t.tgrelid where p.pronamespace=to_regnamespace('${ACQ_SCHEMA}') and not t.tgisinternal order by 1,2`));
    const ext = (await q(ctx, "select extname from pg_extension where extname in ('pg_cron','pg_net','pg_background','pgmq')")).map(x => x.extname);
    // static scan of the repository: no application, edge function, shared package or script (other than the validators) names the schema or the resolver; with the complete exact ENT-W1 record exactly its
    // recorded files do (and only they import the ENT-W1 module), see resolverWiringProof
    const wiring = resolverWiringProof();
    const ok = anchors === 1 && receipts === 0 && triggersBefore.length > 0 && same(triggersBefore, (await q(ctx, "select tgname from pg_trigger where tgrelid='public.meal_records'::regclass and not tgisinternal order by 1")).map(x => x.tgname))
      && refs.length === 0 && viewRefs.length === 0 && same(trigFns.map(x => x.relname + '.' + x.proname), ['detail_acquisition_records.reject_receipt_update', 'detail_acquisition_records.validate_receipt']) && ext.length === 0 && wiring.ok
      && !triggersBefore.some(t => /acq|acquisition/i.test(t));
    return R(ok, { anchors, receipts, triggersBefore, refs, viewRefs, trigFns, ext, repoHits: wiring.names, wiring });
  },
  async P15_EIGHT_CONCURRENT_RESOLVES_ARE_EXACTLY_ONCE(ctx) {
    const owner = await makeUser(ctx, 15); const bill = await makeProducer(ctx, 'billing');
    await makeCaller(ctx, 'acq_caller');
    const id = await fixtureMeal(ctx, owner, { t0: at(10) });
    await admit(bill, owner, 'sub-1', 'paid', at(0), at(60));
    const clients = []; for (let i = 0; i < 8; i++) clients.push(await ctx.open('acq_caller'));
    const res = await Promise.all(clients.map(c => resolve(c, id)));
    const outcomes = res.map(r => r.ok ? r.value.outcome : 'ERR:' + r.code);
    const recorded = res.filter(r => r.ok && r.value.outcome === 'recorded');
    const receipts = res.filter(r => r.ok && r.value.receipt).map(r => JSON.stringify(r.value.receipt));
    const rows = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    // eight different resources of one owner at once: shared locks only, no deadlock, eight rows
    const ids = []; for (let i = 0; i < 8; i++) ids.push(await fixtureMeal(ctx, owner, { t0: at(11 + i) }));
    const res2 = await Promise.all(ids.map((rid, i) => resolve(clients[i], rid)));
    const rows2 = await count(ctx, `${ACQ_SCHEMA}.detail_acquisition_records`);
    const ok = recorded.length === 1 && outcomes.filter(o => o === 'replayed').length === 7 && new Set(receipts).size === 1 && rows === 1 && res2.every(r => r.ok && r.value.outcome === 'recorded') && rows2 === 9;
    return R(ok, { outcomes, rows, outcomes2: res2.map(r => r.ok ? r.value.outcome : 'ERR:' + r.code), rows2 });
  },
  async P16_ROLLBACK_FAULTS_AND_TIMEOUTS_LEAVE_NOTHING_AND_RETRY_WORKS(ctx) {
    const owner = await makeUser(ctx, 16); const bill = await makeProducer(ctx, 'billing'); const caller = await makeCaller(ctx);
    const out = {}; const tbl = `${ACQ_SCHEMA}.detail_acquisition_records`;
    const id1 = await fixtureMeal(ctx, owner, { t0: at(10) }); await admit(bill, owner, 'sub-1', 'paid', at(0), at(100));
    // (a) the caller rolls back after a successful resolve
    await caller.c.query('begin'); const inTx = await resolve(caller.c, id1); await caller.c.query('rollback').catch(() => {});
    out.rollback = { inTx: inTx.value?.outcome, rows: await count(ctx, tbl) };
    const retry = await resolve(caller.c, id1); out.retry = retry.value?.outcome;
    // (b) a fault after the insert (row trigger) and at commit (deferred constraint trigger) removes the whole call
    const id2 = await fixtureMeal(ctx, owner, { t0: at(11) });
    await ctx.g.query(ctx.su, "create function public.acq_fault() returns trigger language plpgsql as $$ begin raise exception 'ACQ_TEST_FAULT' using errcode='P0001'; end $$");
    await ctx.g.query(ctx.su, `create trigger acq_fault after insert on ${tbl} for each row execute function public.acq_fault()`);
    const f1 = await resolve(caller.c, id2); const rowsF1 = await count(ctx, tbl, `resource_id='${id2}'`);
    await ctx.g.query(ctx.su, `drop trigger acq_fault on ${tbl}`);
    await ctx.g.query(ctx.su, `create constraint trigger acq_fault after insert on ${tbl} deferrable initially deferred for each row execute function public.acq_fault()`);
    await caller.c.query('begin'); const f2a = await resolve(caller.c, id2); const f2c = await call(caller.c, 'commit'); await caller.c.query('rollback').catch(() => {}); const rowsF2 = await count(ctx, tbl, `resource_id='${id2}'`);
    await ctx.g.query(ctx.su, `drop trigger acq_fault on ${tbl}`); await ctx.g.query(ctx.su, 'drop function public.acq_fault()');
    const fixed = await resolve(caller.c, id2);
    out.fault = { rowTrigger: f1.ok ? 'OK' : f1.code, rowsF1, deferred: { call: f2a.value?.outcome, commit: f2c.ok ? 'OK' : f2c.code }, rowsF2, afterRemoval: fixed.value?.outcome };
    // (c) timeouts: registry writer open, in-flight admission, resource lock held. Each returns pending within the per-wait limit and writes nothing; once released the same call records.
    const timed = async (label, hold, release, id) => {
      const before = await count(ctx, tbl); const t = Date.now(); const rr = await resolve(caller.c, id); const ms = Date.now() - t; const during = await count(ctx, tbl);
      await release(); const after = await resolve(caller.c, id);
      return { label, pending: rr.value?.reason, ms, rows: [before, during], after: after.value?.outcome };
    };
    { const id = await fixtureMeal(ctx, owner, { t0: at(12) }); const w = await ctx.open('supabase_admin'); await w.query('begin'); await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('lock-probe', 'acq_lock_probe')`);
      out.registry = await timed('registry-writer-open', null, async () => { await w.query('rollback'); }, id); }
    { const o2 = await makeUser(ctx, 160); const id = await fixtureMeal(ctx, o2, { t0: at(12) }); const pc = await ctx.open(bill.role); await pc.query('begin'); const ad = await call(pc, `select ${ENT}.admit_entitlement_event($1::uuid,'billing','sub-open','paid',$2::timestamptz,$3::timestamptz,null) s`, [o2, at(0), at(100)]);
      out.owner = await timed('in-flight-admission', null, async () => { await pc.query('commit'); }, id); out.owner.admit = ad.ok; }
    { const id = await fixtureMeal(ctx, owner, { t0: at(13) }); const h = await ctx.open('supabase_admin'); await h.query('begin'); await h.query("select pg_advisory_xact_lock(hashtextextended($1::text || ':retention_acquisition', 0))", [id]);
      out.resource = await timed('resource-lock-held', null, async () => { await h.query('rollback'); }, id); }
    const within = x => x.ms >= 1500 && x.ms < 7000;
    const ok = out.rollback.inTx === 'recorded' && out.rollback.rows === 0 && out.retry === 'recorded'
      && !f1.ok && f1.code === 'P0001' && rowsF1 === 0 && f2a.ok && !f2c.ok && f2c.code === 'P0001' && rowsF2 === 0 && out.fault.afterRemoval === 'recorded'
      && out.registry.pending === 'REGISTRY_LOCK_TIMEOUT' && within(out.registry) && out.registry.rows[0] === out.registry.rows[1] && out.registry.after === 'recorded'
      && out.owner.admit && out.owner.pending === 'OWNER_LOCK_TIMEOUT' && within(out.owner) && out.owner.rows[0] === out.owner.rows[1] && out.owner.after === 'recorded'
      && out.resource.pending === 'ACQ_LOCK_TIMEOUT' && within(out.resource) && out.resource.rows[0] === out.resource.rows[1] && out.resource.after === 'recorded';
    return R(ok, out);
  },
  async P17_RESOLVER_AND_MEAL_DELETION_INTERLEAVED_BOTH_WAYS_LEAVE_NO_ORPHAN(ctx) {
    const owner = await makeEligible(ctx, 17); const bill = await makeProducer(ctx, 'billing'); const caller = await makeCaller(ctx);
    await admit(bill, owner, 'sub-1', 'paid', at(0), at(100));
    const tbl = `${ACQ_SCHEMA}.detail_acquisition_records`; const out = {};
    // order 1: the deletion is open (uncommitted) when the resolver runs; the resolver's insert waits on the anchor row and fails with 23503 once the deletion commits
    { const id = await fixtureMeal(ctx, owner, { t0: at(10) }); const del = await ctx.open('supabase_admin'); await del.query('begin'); await del.query('delete from public.meal_records where id=$1', [id]);
      const p = resolve(caller.c, id); const early = await Promise.race([p.then(() => 'DONE'), sleep(500).then(() => 'WAITING')]); await del.query('commit'); const r = await p;
      out.deleteFirst = { whileOpen: early, result: r.ok ? r.value.outcome : r.code, rows: await count(ctx, tbl, `resource_id='${id}'`) }; }
    // order 2: the resolver has recorded (its transaction is still open) when the deletion starts; the deletion waits, then removes the committed receipt with its anchor
    { const id = await fixtureMeal(ctx, owner, { t0: at(11) }); const rs = await ctx.open(caller.role); await rs.query('begin'); const r = await call(rs, SQL_RESOLVE, [id]);
      const del = await ctx.open('supabase_admin'); const dp = del.query('delete from public.meal_records where id=$1', [id]).then(() => 'DELETED', e => e.code);
      const early = await Promise.race([dp.then(() => 'DONE'), sleep(500).then(() => 'WAITING')]); await rs.query('commit'); const d = await dp;
      out.resolveFirst = { resolve: r.value?.outcome, whileOpen: early, delete: d, receipts: await count(ctx, tbl, `resource_id='${id}'`), anchors: await count(ctx, 'retention_capture.detail_capture_anchors', `resource_id='${id}'`) }; }
    const orphans = (await q(ctx, `select count(*)::int n from ${tbl} r where not exists (select 1 from retention_capture.detail_capture_anchors a where a.resource_id=r.resource_id)`))[0].n;
    const ok = out.deleteFirst.whileOpen === 'WAITING' && out.deleteFirst.result === '23503' && out.deleteFirst.rows === 0
      && out.resolveFirst.resolve === 'recorded' && out.resolveFirst.whileOpen === 'WAITING' && out.resolveFirst.delete === 'DELETED' && out.resolveFirst.receipts === 0 && out.resolveFirst.anchors === 0 && orphans === 0;
    return R(ok, { ...out, orphans });
  },
  async P18_RESOLVER_AND_PRODUCER_INTERLEAVED_WAIT_NEVER_FLIP_AND_NEVER_DEADLOCK(ctx) {
    const bill = await makeProducer(ctx, 'billing'); const caller = await makeCaller(ctx); const out = {};
    const tbl = `${ACQ_SCHEMA}.detail_acquisition_records`;
    const inflight = async (n, finish) => {
      const o = await makeUser(ctx, 1800 + n); const id = await fixtureMeal(ctx, o, { t0: at(10) }); await advance(bill, o, at(5));
      const pc = await ctx.open(bill.role); await pc.query('begin');
      const ad = await call(pc, `select ${ENT}.admit_entitlement_event($1::uuid,'billing','sub-x','paid',$2::timestamptz,$3::timestamptz,null) s`, [o, at(8), at(40)]);
      const p = resolve(caller.c, id); const early = await Promise.race([p.then(() => 'DONE'), sleep(500).then(() => 'WAITING')]);
      await pc.query(finish); const r = await p; return { admit: ad.ok, whileOpen: early, outcome: r.value?.outcome, reason: r.value?.reason, rows: await count(ctx, tbl, `resource_id='${id}'`) };
    };
    out.commit = await inflight(1, 'commit'); out.rollback = await inflight(2, 'rollback');
    // D-1 scope: the resolver only ever takes SHARED locks and never calls admit/advance, so a producer and resolvers on the same owner never produce 40P01 (or any lock error) in either direction
    { const o = await makeUser(ctx, 1899); const ids = []; for (let i = 0; i < 6; i++) ids.push(await fixtureMeal(ctx, o, { t0: at(20 + i) }));
      const errs = []; const rcs = []; for (let i = 0; i < 3; i++) rcs.push(await ctx.open(caller.role));
      let stop = false;
      const prod = (async () => { for (let i = 0; i < 25 && !stop; i++) { const r1 = await admit(bill, o, 'far-' + i, 'paid', at(300 + i * 2), at(301 + i * 2)); if (!r1.ok) errs.push('admit:' + r1.code); const r2 = await advance(bill, o, at(21 + i * 0.01)); if (!r2.ok) errs.push('advance:' + r2.code); } })();
      const readers = rcs.map(async (c, k) => { for (let i = 0; i < 25; i++) { const r = await resolve(c, ids[(i + k) % 6]); if (!r.ok) errs.push('resolve:' + r.code); } });
      await Promise.all([prod, ...readers]); stop = true;
      out.noDeadlock = { errors: errs, receipts: await count(ctx, tbl) }; }
    // an open resolver transaction keeps its shared locks: a producer waits for it (documented cost), nothing hangs, nothing is lost
    { const o = await makeUser(ctx, 1898); const id = await fixtureMeal(ctx, o, { t0: at(10) }); const rs = await ctx.open(caller.role); await rs.query('begin'); const r = await call(rs, SQL_RESOLVE, [id]);
      const pc = await ctx.open(bill.role); await pc.query("set lock_timeout = '6s'"); const t = Date.now(); const ap = admit({ ...bill, c: pc }, o, 'sub-after', 'paid', at(300), at(310));
      const early = await Promise.race([ap.then(() => 'DONE'), sleep(500).then(() => 'WAITING')]); await rs.query('commit'); const a = await ap;
      out.openResolver = { resolve: r.value?.reason, producerWhileOpen: early, producerAfter: a.ok ? a.value.outcome : a.code, ms: Date.now() - t }; }
    const ok = out.commit.admit && out.commit.whileOpen === 'WAITING' && out.commit.outcome === 'recorded' && out.commit.rows === 1
      && out.rollback.admit && out.rollback.whileOpen === 'WAITING' && out.rollback.outcome === 'pending' && out.rollback.reason === 'COVERAGE_SHORT' && out.rollback.rows === 0
      && out.noDeadlock.errors.length === 0 && out.openResolver.producerWhileOpen === 'WAITING' && out.openResolver.producerAfter === 'admitted';
    return R(ok, out);
  }
});

// ---- negative gates -------------------------------------------------------------------------------------------------------
// run a statement as a given role from the superuser connection; always rolled back
async function asRole(ctx, role, sql, values = []) {
  const c = await ctx.open('supabase_admin');
  try { await c.query('begin'); await c.query(`set local role ${role}`); const r = await c.query(sql, values); await c.query('rollback'); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { await c.query('rollback').catch(() => {}); return { ok: false, code: e.code ?? null, message: String(e.message) }; }
  finally { await c.end().catch(() => {}); }
}
const denied = r => !r.ok && r.code === '42501';
const TBL = `${ACQ_SCHEMA}.detail_acquisition_records`;
// a valid receipt row (every cross-field rule satisfied) for direct-insert forgery tests; any single change must be rejected for its own reason
function forged(id, owner, t0, over = {}) {
  const sampled = isoMs(new Date(Date.parse(t0) + 3600e3));
  const eid = uuid(777);
  const ev = { state: 'paid', basis: 'paid_subscription', reason: null, evidence: { events: [eid], coverage: [] }, sampled_at: sampled, policy: 'retention-entitlement-v1' };
  const base = { resource_id: id, owner_user_id: owner, original_recorded_at: t0, acquisition_ref: 'acq:' + id, acquisition_tier: 'paid', acquisition_basis: 'paid_subscription', evidence_event_ids: [eid], entitlement_evidence: ev,
    entitlement_sampled_at: sampled, entitlement_policy: 'retention-entitlement-v1', retention_policy_version: 'consumer-retention-owner-2026-10-03-v1', capture_context: 'authenticated_actor', retained_until: plus4320h(t0), resolved_at: sampled };
  return { ...base, ...over };
}
async function insertForged(ctx, row, { replica = false } = {}) {
  const cols = Object.keys(row);
  const vals = cols.map(c => (c === 'entitlement_evidence' ? JSON.stringify(row[c]) : c === 'evidence_event_ids' ? '{' + row[c].join(',') + '}' : row[c]));
  const ph = cols.map((c, i) => `$${i + 1}${c === 'entitlement_evidence' ? '::jsonb' : c === 'evidence_event_ids' ? '::uuid[]' : /_at$|retained_until/.test(c) ? '::timestamptz' : c === 'resource_id' || c === 'owner_user_id' ? '::uuid' : ''}`);
  try { if (replica) { await ctx.su.query('begin'); await ctx.su.query("set local session_replication_role = 'replica'"); } await ctx.su.query(`insert into ${TBL}(${cols.join(',')}) values (${ph.join(',')})`, vals); if (replica) await ctx.su.query('commit'); return { ok: true }; }
  catch (e) { if (replica) await ctx.su.query('rollback').catch(() => {}); return { ok: false, code: e.code ?? null, message: String(e.message), constraint: e.constraint ?? null }; }
}
Object.assign(GATES, {
  async N01_RUNTIME_ROLES_AND_THE_SEALED_OWNER_REACH_ONLY_WHAT_WAS_APPROVED(ctx) {
    const owner = await makeUser(ctx, 31); const bill = await makeProducer(ctx, 'billing'); const caller = await makeCaller(ctx);
    const id = await fixtureMeal(ctx, owner, { t0: at(10) }); await fixtureMeal(ctx, owner, { t0: at(11) });
    await admit(bill, owner, 'sub-1', 'paid', at(0), at(60)); await resolve(caller.c, id);
    await ctx.g.query(ctx.su, 'create role acq_nobody login'); ctx.extraRoles.add('acq_nobody');
    const stmts = [
      [`select count(*) from ${TBL}`], [`insert into ${TBL}(resource_id) values (gen_random_uuid())`], [`update ${TBL} set resolved_at = resolved_at`], [`delete from ${TBL}`], [`truncate ${TBL}`],
      [`select ${ACQ_SCHEMA}.resolve_detail_acquisition($1::uuid)`, [id]], [`select ${ENT}.entitlement_state_at($1::uuid, now())`, [owner]], ['select count(*) from retention_capture.detail_capture_anchors'],
      [`select count(*) from ${ENT}.entitlement_events`], [`select ${ENT}.admit_entitlement_event($1::uuid,'billing','x','paid',now(),now()+interval '1 day',null)`, [owner]],
      [`create function ${ACQ_SCHEMA}.f() returns int language sql as 'select 1'`]
    ];
    const results = {};
    for (const role of ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'acq_nobody']) {
      results[role] = [];
      for (const [sql, v] of stmts) { const r = await asRole(ctx, role, sql, v ?? []); results[role].push(denied(r) ? 'denied' : r.ok && /^select count/.test(sql) && Number(r.rows[0].count) === 0 ? 'denied' : r.ok ? 'ALLOWED' : r.code); }
    }
    // the sealed owner itself: the two seams work (reads exactly the anchors), nothing else does
    const own = {};
    own.readAnchors = await asRole(ctx, ACQ_OWNER, 'select count(*)::int n from retention_capture.detail_capture_anchors');
    own.captureOwnerSeesNone = await asRole(ctx, 'consumer_retention_capture_owner', 'select count(*)::int n from retention_capture.detail_capture_anchors');
    own.entOwnerReadsAnchors = await asRole(ctx, 'consumer_retention_entitlement_owner', 'select count(*)::int n from retention_capture.detail_capture_anchors');
    for (const [k, sql] of [['meals', 'select count(*) from public.meal_records'], ['events', `select count(*) from ${ENT}.entitlement_events`], ['producers', `select count(*) from ${ENT}.producers`],
      ['insertAnchor', "insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values (gen_random_uuid(),gen_random_uuid(),now(),'canonical_meal_insert','retention-capture-v1','authenticated_actor')"],
      ['updateAnchor', 'update retention_capture.detail_capture_anchors set capture_context = capture_context'], ['deleteAnchor', 'delete from retention_capture.detail_capture_anchors'],
      ['admit', `select ${ENT}.admit_entitlement_event(gen_random_uuid(),'billing','x','paid',now(),now()+interval '1 day',null)`], ['advance', `select ${ENT}.advance_entitlement_coverage(gen_random_uuid(),'billing',now())`], ['fn', 'select retention_capture.capture_meal_record_insert()']])
      own[k] = await asRole(ctx, ACQ_OWNER, sql);
    own.updateRows = await asRole(ctx, ACQ_OWNER, `update ${TBL} set resolved_at = resolved_at`).then(r => r.ok ? 'UPDATE ' + r.rowCount : r.code);
    own.deleteRows = await asRole(ctx, ACQ_OWNER, `delete from ${TBL}`).then(r => r.ok ? 'DELETE ' + r.rowCount : r.code);
    // SET ROLE is judged against the SESSION user: connect as real login roles (a superuser session could set any role, which proves nothing)
    const setRole = {};
    for (const login of ['acq_nobody', 'postgres']) { const c = await ctx.open(login); setRole[login] = await call(c, `set role ${ACQ_OWNER}`); await c.end().catch(() => {}); }
    const totalAnchors = await count(ctx, 'retention_capture.detail_capture_anchors');
    const roleOk = Object.values(results).every(rs => rs.every(x => x === 'denied')) && Object.values(setRole).every(r => !r.ok && r.code === '42501');
    const ownOk = own.readAnchors.ok && own.readAnchors.rows[0].n === totalAnchors && totalAnchors >= 2 && own.captureOwnerSeesNone.ok && own.captureOwnerSeesNone.rows[0].n === 0 && own.entOwnerReadsAnchors.ok === false
      && ['meals', 'events', 'producers', 'insertAnchor', 'updateAnchor', 'deleteAnchor', 'admit', 'advance', 'fn'].every(k => denied(own[k])) && own.updateRows === 'UPDATE 0' && own.deleteRows === 'DELETE 0' && await count(ctx, TBL) === 1;
    return R(roleOk && ownOk, { setRole, results, own: Object.fromEntries(Object.entries(own).map(([k, v]) => [k, typeof v === 'string' ? v : v.ok ? 'ok:' + JSON.stringify(v.rows?.[0] ?? v.rowCount) : v.code])), totalAnchors });
  },
  async N02_RECEIPTS_CANNOT_BE_CHANGED_OR_SHORTENED(ctx) {
    const owner = await makeUser(ctx, 32); const bill = await makeProducer(ctx, 'billing'); const caller = await makeCaller(ctx);
    const id = await fixtureMeal(ctx, owner, { t0: at(10) }); await admit(bill, owner, 'sub-1', 'paid', at(0), at(60)); const first = await resolve(caller.c, id);
    const snap = async () => JSON.stringify(await receiptsOf(ctx));
    const before = await snap(); const tries = {};
    const upd = async (label, sql) => { tries[label] = await ctx.g.query(ctx.su, sql).then(() => 'OK', e => e.code + ':' + String(e.message).slice(0, 40)); };
    await upd('noop', `update ${TBL} set resource_id = resource_id`);
    await upd('shorten', `update ${TBL} set retained_until = retained_until - interval '1 millisecond'`);
    await upd('shorten14', `update ${TBL} set retained_until = original_recorded_at + interval '336 hours'`);
    await upd('extend', `update ${TBL} set retained_until = retained_until + interval '1 day'`);
    await upd('resetT0', `update ${TBL} set original_recorded_at = original_recorded_at + interval '1 second'`);
    await upd('basis', `update ${TBL} set acquisition_basis = 'trial'`);
    await upd('resolvedAt', `update ${TBL} set resolved_at = resolved_at + interval '1 second'`);
    const after = await snap();
    const sameAfterReplay = (await resolve(caller.c, id)).value?.receipt;
    const ok = first.ok && Object.values(tries).every(v => v.startsWith('23514:ACQ_RECEIPT_IMMUTABLE')) && before === after && same(sameAfterReplay, first.value.receipt);
    return R(ok, { tries, unchanged: before === after });
  },
  async N03_FORGED_DIRECT_INSERTS_ARE_REJECTED_EACH_FOR_ITS_OWN_REASON(ctx) {
    const owner = await makeUser(ctx, 33); const other = await makeUser(ctx, 34);
    const t0 = at(10, 5); const results = [];
    const mk = async (ctxSpec = {}) => { const id = await fixtureMeal(ctx, owner, { t0, context: ctxSpec.context ?? 'authenticated_actor' }); return id; };
    const t = async (label, mkOver, expectCode, expectText, anchorCtx, opts = {}) => {
      const id = await mk({ context: anchorCtx }); const row = forged(id, owner, t0, typeof mkOver === 'function' ? mkOver(id) : mkOver);
      const r = await insertForged(ctx, row, opts);
      const good = !r.ok && r.code === expectCode && (r.message.includes(expectText) || r.constraint === expectText);
      results.push({ label, code: r.ok ? 'ACCEPTED' : r.code, text: r.ok ? null : (r.constraint ?? r.message.slice(0, 60)), expected: expectText, good });
    };
    // positive control: the unmodified consistent row is accepted by the table (a superuser can write it; no claim is made against a superuser), so every variant below is rejected for its own reason
    { const id = await mk(); const r = await insertForged(ctx, forged(id, owner, t0)); results.push({ label: 'control-consistent-row', good: r.ok }); await ctx.g.query(ctx.su, `delete from ${TBL}`); }
    await t('tier-free', { acquisition_tier: 'free' }, '23514', 'receipt_tier_paid');
    await t('basis-bogus', { acquisition_basis: 'bogus' }, '23514', 'receipt_basis_valid');
    await t('basis-mismatch-evidence', { acquisition_basis: 'trial' }, '23514', 'receipt_evidence_state');
    await t('deadline-plus-1ms', id => ({ retained_until: new Date(Date.parse(plus4320h(t0)) + 1).toISOString() }), '23514', 'receipt_deadline_exact');
    await t('deadline-minus-1ms', { retained_until: new Date(Date.parse(plus4320h(t0)) - 1).toISOString() }, '23514', 'receipt_deadline_exact');
    await t('deadline-free14', { retained_until: new Date(Date.parse(t0) + 336 * 3600e3).toISOString() }, '23514', 'receipt_deadline_exact');
    await t('deadline-4321h', { retained_until: new Date(Date.parse(t0) + 180 * 86400e3 + 3600e3).toISOString() }, '23514', 'receipt_deadline_exact');
    await t('ref-wrong', id => ({ acquisition_ref: 'acq:' + uuid(1) }), '23514', 'receipt_ref_exact');
    await t('context-untrusted', { capture_context: 'no_actor_claim' }, '23514', 'receipt_capture_context', 'no_actor_claim');
    await t('owner-differs-from-anchor', { owner_user_id: other }, '23514', 'ACQ_RECEIPT_ANCHOR_MISMATCH');
    await t('t0-differs-from-anchor', { original_recorded_at: new Date(Date.parse(t0) + 1).toISOString(), retained_until: plus4320h(new Date(Date.parse(t0) + 1).toISOString()) }, '23514', 'ACQ_RECEIPT_ANCHOR_MISMATCH');
    await t('no-anchor', id => ({ resource_id: uuid(4040), acquisition_ref: 'acq:' + uuid(4040) }), '23514', 'ACQ_RECEIPT_ANCHOR_MISMATCH');
    await t('context-differs-from-anchor', {}, '23514', 'ACQ_RECEIPT_ANCHOR_MISMATCH', 'no_actor_claim');
    await t('ids-not-the-resolver-ids', { evidence_event_ids: [uuid(778)] }, '23514', 'ACQ_RECEIPT_EVIDENCE_MISMATCH');
    await t('ids-empty', { evidence_event_ids: [] }, '23514', 'ACQ_RECEIPT_EVIDENCE_MISMATCH');
    await t('answer-says-free', id => ({ entitlement_evidence: { ...forged(id, owner, t0).entitlement_evidence, state: 'free' } }), '23514', 'receipt_evidence_state');
    await t('sampled-text-differs', id => ({ entitlement_sampled_at: isoMs(new Date(Date.parse(t0) + 7200e3)) }), '23514', 'receipt_evidence_sampled');
    await t('sampled-before-t0', id => { const s = isoMs(new Date(Date.parse(t0) - 1000)); return { entitlement_sampled_at: s, entitlement_evidence: { ...forged(id, owner, t0).entitlement_evidence, sampled_at: s } }; }, '23514', 'receipt_sampled_not_before_t0');
    await t('sampled-not-millisecond', id => ({ entitlement_sampled_at: new Date(Date.parse(t0) + 3600e3).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1999') + 'Z' }), '23514', 'detail_acquisition_records_entitlement_sampled_at_instant');
    await t('resolved-not-millisecond', { resolved_at: new Date(Date.parse(t0) + 3600e3).toISOString().replace(/\.(\d{3})Z$/, '.$1999Z') }, '23514', 'detail_acquisition_records_resolved_at_instant');
    await t('entitlement-policy-wrong', { entitlement_policy: 'retention-entitlement-v2' }, '23514', 'receipt_entitlement_policy');
    await t('retention-policy-wrong', { retention_policy_version: 'consumer-retention-owner-2099-v9' }, '23514', 'receipt_retention_policy');
    await t('events-array-length-differs-from-ids (trigger bypassed: the CHECK alone)', id => ({ entitlement_evidence: { ...forged(id, owner, t0).entitlement_evidence, evidence: { events: [uuid(777), uuid(778)], coverage: [] } } }), '23514', 'receipt_evidence_events', undefined, { replica: true });
    await t('ids-and-events-both-empty', id => ({ evidence_event_ids: [], entitlement_evidence: { ...forged(id, owner, t0).entitlement_evidence, evidence: { events: [], coverage: [] } } }), '23514', 'receipt_evidence_nonempty');
    const rows = await count(ctx, TBL);
    return R(results.every(r => r.good) && rows === 0, { results: results.filter(r => !r.good).length ? results : results.map(r => r.label + ':' + r.code + ':' + r.text), rows });
  },
  async N04_PENDING_AND_UNKNOWN_OUTCOMES_NEVER_WRITE(ctx) {
    const caller = await makeCaller(ctx); const out = {};
    const o1 = await makeUser(ctx, 41);
    out.noProducer = await resolve(caller.c, await fixtureMeal(ctx, o1, { t0: at(10) }));
    const bill = await makeProducer(ctx, 'billing');
    out.unknownResource = await resolve(caller.c, uuid(424242));
    out.untrusted = await resolve(caller.c, await fixtureMeal(ctx, o1, { t0: at(10), context: 'no_actor_claim' }));
    const nowPlusDay = new Date(Date.now() + 86400e3).toISOString();
    out.future = await resolve(caller.c, await fixtureMeal(ctx, o1, { t0: nowPlusDay }));
    out.coverageShort = await resolve(caller.c, await fixtureMeal(ctx, o1, { t0: at(10) }));
    const o2 = await makeUser(ctx, 42); await advance(bill, o2, at(100));
    out.freeProvisional = await resolve(caller.c, await fixtureMeal(ctx, o2, { t0: at(10) }));
    // an expired fact, a fact that ends exactly at T0 and a fact of another owner are no evidence
    const o3 = await makeUser(ctx, 43); await admit(bill, o3, 'old', 'paid', at(0), at(10)); const id3 = await fixtureMeal(ctx, o3, { t0: at(10) });
    out.endedAtT0 = await resolve(caller.c, id3);
    const invalid = await call(caller.c, `select ${ACQ_SCHEMA}.resolve_detail_acquisition(null) s`);
    const rows = await count(ctx, TBL);
    const ok = pend(out.noProducer, 'NO_REQUIRED_PRODUCER') && pend(out.unknownResource, 'NO_ANCHOR') && pend(out.untrusted, 'CAPTURE_CONTEXT_UNTRUSTED') && pend(out.future, 'INSTANT_IN_FUTURE') && pend(out.coverageShort, 'COVERAGE_SHORT')
      && pend(out.freeProvisional, 'FREE_PROVISIONAL_NOT_FINAL') && pend(out.endedAtT0, 'COVERAGE_SHORT') && !invalid.ok && invalid.code === '22023' && rows === 0;
    return R(ok, { out: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.value?.outcome + ':' + v.value?.reason])), invalid: invalid.code, rows });
  },
  async N05_NO_CURRENT_MEMBERSHIP_JWT_OR_CALLER_VALUE_CAN_CREATE_A_RECEIPT(ctx) {
    const caller = await makeCaller(ctx); const bill = await makeProducer(ctx, 'billing');
    // the legacy core-eligible actor holds an ACTIVE premium row in the legacy subscription table; the ledger has no fact for it
    await ctx.g.query(ctx.su, "insert into public.subscription_entitlements(user_id,plan_code,entitlement_source,valid_from,valid_until) values ($1,'premium','synthetic',$2,null)", [ELIGIBLE, at(0)]);
    const id = await fixtureMeal(ctx, ELIGIBLE, { t0: at(10) });
    const claims = JSON.stringify({ sub: ELIGIBLE, role: 'authenticated', plan: 'premium', tier: 'paid', entitlement: 'paid', app_metadata: { plan: 'premium' }, user_metadata: { tier: 'paid' } });
    const c2 = await ctx.open(caller.role);
    await c2.query("select set_config('request.jwt.claims',$1,false), set_config('request.jwt.claim.sub',$2,false), set_config('request.jwt.claim.role','service_role',false), set_config('tastkind.tier','paid',false), set_config('tastkind.t0',$3,false)", [claims, ELIGIBLE, at(10)]);
    const r1 = await resolve(c2, id);
    const sig = (await q(ctx, "select pg_get_function_identity_arguments(p.oid) args, p.pronargs from pg_proc p where p.pronamespace=$1::regnamespace and p.proname='resolve_detail_acquisition'", [ACQ_SCHEMA]))[0];
    const body = (await q(ctx, "select pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace=$1::regnamespace and p.proname='resolve_detail_acquisition'", [ACQ_SCHEMA]))[0].def.replace(/^[\s\S]*?AS \$function\$/, '');
    const mentions = /subscription_entitlements|auth\.|request\.|jwt|current_setting\s*\(\s*'(?!transaction_isolation)|tastkind\./i.test(body);
    // now a real ledger fact for the same owner appears: the receipt forms from the FACT, with the fact as evidence, not from the legacy row
    const a = await admit(bill, ELIGIBLE, 'sub-real', 'paid', at(0), at(60)); const r2 = await resolve(c2, id);
    const ok = pend(r1, 'NO_REQUIRED_PRODUCER') === false ? pend(r1, 'COVERAGE_SHORT') : true;
    return R(pend(r1, 'COVERAGE_SHORT') && sig.args === 'p_resource_id uuid' && sig.pronargs === 1 && !mentions && a.ok && r2.ok && r2.value.outcome === 'recorded' && same(r2.value.receipt.evidence_event_ids, [a.value.event_id]),
      { r1: r1.value, sig, mentions, r2: r2.value?.outcome, ok });
  },
  async N06_A_TRANSACTION_THAT_HAS_WRITTEN_ANYTHING_IS_REFUSED(ctx) {
    const owner = await makeUser(ctx, 46); const bill = await makeProducer(ctx, 'billing', { resolve: true }); const caller = await makeCaller(ctx);
    await admit(bill, owner, 'sub-1', 'paid', at(0), at(200));
    const mkId = async d => fixtureMeal(ctx, owner, { t0: at(d) });
    const rows0 = await count(ctx, TBL); const out = {};
    const code = r => (r.ok ? 'OK:' + r.value.outcome : r.code + ':' + r.message.split('\n')[0].slice(0, 30));
    // (a) a clean explicit transaction works
    { const id = await mkId(10); const c = await ctx.open(caller.role); await c.query('begin'); const r = await resolve(c, id); await c.query('commit'); out.clean = code(r); }
    // (b) after any write (here a temporary table) the call is refused, and the refusal itself leaves nothing
    { const id = await mkId(11); const c = await ctx.open(caller.role); await c.query('begin'); await c.query('create temp table acq_scratch(i int)'); await c.query('insert into acq_scratch values (1)'); const r = await resolve(c, id); await c.query('rollback'); out.afterWrite = code(r); out.afterWriteRows = await count(ctx, TBL, `resource_id='${id}'`); }
    // (c) after a producer fact written in the same transaction (the transaction that holds the owner lock exclusively)
    { const id = await mkId(12); const c = await ctx.open(bill.role); await c.query('begin'); const a = await admit({ ...bill, c }, owner, 'sub-same-tx', 'paid', at(300), at(310)); const r = await resolve(c, id); await c.query('rollback'); out.afterAdmit = code(r); out.afterAdmitAdmitted = a.ok; }
    // (d) after a registry write in the same transaction: refused, not a deadlock (the two-SHARE deadlock form of ENT0 17.8(5) cannot start)
    { const id = await mkId(13); const c = await ctx.open('supabase_admin'); await grantResolve(ctx, 'supabase_admin').catch(() => {}); await c.query('begin'); await c.query(`insert into ${ENT}.producers(namespace, role_name) values ('same-tx-reg','acq_nobody2')`); const r = await resolve(c, id); await c.query('rollback'); out.afterRegistryWrite = code(r); }
    // (e) one recording resolve per transaction: the second fresh resolve is refused, a replay (no write) is allowed
    { const a = await mkId(14), b = await mkId(15); const c = await ctx.open(caller.role); await c.query('begin'); const r1 = await resolve(c, a); const r2 = await resolve(c, b); await c.query('rollback'); out.second = [code(r1), code(r2)]; out.secondRows = await count(ctx, TBL, `resource_id in ('${a}','${b}')`); }
    { const a = await mkId(16); await resolve(caller.c, a); const c = await ctx.open(caller.role); await c.query('begin'); const r1 = await resolve(c, a); const r2 = await resolve(c, a); await c.query('commit'); out.replays = [code(r1), code(r2)]; }
    // (f) a savepoint that rolled its write back still leaves the transaction id assigned: refused (conservative, documented)
    { const id = await mkId(17); const c = await ctx.open(caller.role); await c.query('begin'); await c.query('create temp table acq_s2(i int)'); await c.query('savepoint s'); await c.query('insert into acq_s2 values (1)'); await c.query('rollback to savepoint s'); const r = await resolve(c, id); await c.query('rollback'); out.afterSavepointRollback = code(r); }
    // (g) isolation levels other than READ COMMITTED
    { const id = await mkId(18); out.iso = []; for (const lvl of ['repeatable read', 'serializable']) { const c = await ctx.open(caller.role); await c.query(`begin isolation level ${lvl}`); const r = await resolve(c, id); await c.query('rollback'); out.iso.push(code(r)); } }
    // (h) a read-only transaction can obtain pending answers but cannot write a receipt
    { const id = await mkId(19); const c = await ctx.open(caller.role); await c.query('begin read only'); const r = await resolve(c, id); await c.query('rollback'); out.readOnly = code(r); out.readOnlyRows = await count(ctx, TBL, `resource_id='${id}'`); }
    const ok = out.clean === 'OK:recorded' && out.afterWrite.startsWith('25000:ACQ_DIRTY_TRANSACTION') && out.afterWriteRows === 0 && out.afterAdmitAdmitted && out.afterAdmit.startsWith('25000:ACQ_DIRTY_TRANSACTION')
      && out.afterRegistryWrite.startsWith('25000:ACQ_DIRTY_TRANSACTION') && out.second[0] === 'OK:recorded' && out.second[1].startsWith('25000:ACQ_DIRTY_TRANSACTION') && out.secondRows === 0
      && out.replays.every(x => x === 'OK:replayed') && out.afterSavepointRollback.startsWith('25000:ACQ_DIRTY_TRANSACTION') && out.iso.every(x => x.startsWith('0A000:ACQ_ISOLATION_UNSUPPORTED')) && out.readOnly.startsWith('25006') && out.readOnlyRows === 0 && rows0 === 0;
    return R(ok, out);
  }
});

// ---- static source whitelist --------------------------------------------------------------------------------------------------
Object.assign(GATES, {
  async N09_RESOLVER_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST(ctx) {
    const rows = await q(ctx, "select p.proname, pg_get_functiondef(p.oid) def, p.prosecdef, p.provolatile::text v, p.proconfig, pg_get_userbyid(p.proowner) owner from pg_proc p where p.pronamespace=$1::regnamespace order by 1", [ACQ_SCHEMA]);
    const r = rows.find(x => x.proname === 'resolve_detail_acquisition');
    const body = r.def.replace(/^[\s\S]*?AS \$function\$/, '').replace(/--.*$/gm, '');
    const n = (re) => (body.match(re) ?? []).length;
    const pos = s => body.indexOf(s);
    const order = ['transaction_isolation', 'pg_current_xact_id_if_assigned', 'pg_advisory_xact_lock', 'FROM retention_acquisition.detail_acquisition_records r', 'FROM retention_capture.detail_capture_anchors', 'capture_context <> \'authenticated_actor\'', 'entitlement_state_at(', 'INSERT INTO'].map(pos);
    const inOrder = order.every((p, i) => p >= 0 && (i === 0 || p > order[i - 1]));
    const banned = /\b(now\s*\(\)|transaction_timestamp|statement_timestamp|current_timestamp|localtimestamp|current_date|subscription_entitlements|meal_records|meal_record_items|auth\.|request\.|jwt|tastkind\.|retention_internal|dblink|pg_notify|COPY\b)/i;
    const counts = { stateAt: n(/entitlement_state_at\(/g), clock: n(/clock_timestamp\(\)/g), xactLock: n(/pg_advisory_xact_lock\(/g), sessionLock: n(/pg_(try_)?advisory_lock/g), dynamic: n(/\bEXECUTE\b/g), onConflict: n(/ON CONFLICT/gi), insert: n(/INSERT INTO/g), update: n(/\bUPDATE\b/g), delete: n(/\bDELETE\b/g), dirty: n(/pg_current_xact_id_if_assigned/g), iso: n(/transaction_isolation/g), signatureCalls: n(/retention_entitlement\.(admit|advance)/g) };
    const others = rows.filter(x => x.proname !== 'resolve_detail_acquisition');
    const ok = r.prosecdef && r.v === 'v' && r.owner === ACQ_OWNER && same(r.proconfig, ['search_path=""', 'lock_timeout=2s']) && inOrder && !banned.test(body)
      && counts.stateAt === 1 && counts.clock === 1 && counts.xactLock === 1 && counts.sessionLock === 0 && counts.dynamic === 0 && counts.onConflict === 0 && counts.insert === 1 && counts.update === 0 && counts.delete === 0 && counts.dirty === 1 && counts.iso === 1 && counts.signatureCalls === 0
      && others.every(o => !o.prosecdef && o.owner === ACQ_OWNER && !/\b(now\s*\(\)|clock_timestamp|transaction_timestamp)/i.test(o.def.replace(/^[\s\S]*?AS \$function\$/, '')));
    return R(ok, { counts, order, inOrder, bannedHit: banned.exec(body)?.[0] ?? null, proconfig: r.proconfig });
  }
});

// ---- migration-level gates (each runs against a database where the ENT0 migration is applied and the ENT1-A migration is NOT yet) ------------------------------------
async function persistedNone(ctx) {
  return (await ctx.g.query(ctx.su, `select (select count(*)::int from pg_roles where rolname in ($1,$2)) roles, to_regnamespace('${ACQ_SCHEMA}') is not null schema, (select count(*)::int from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)) members`, [ACQ_OWNER, ACQ_BUILDER])).rows[0];
}
const noneLeft = p => p.roles === 0 && !p.schema && p.members === 0;
const membersJson = async ctx => JSON.stringify((await ctx.g.query(ctx.su, "select roleid,member,grantor from pg_auth_members where roleid::regrole::text !~ '^(authenticated|anon|service_role)' order by 1,2,3")).rows);
async function expectRefusal(cl, label, prepare, expectPrefix, { actor = 'su', settings = [], preexisting = false, source } = {}) {
  return acqFresh(cl, label, async ctx => {
    await prepare(ctx);
    const before = await persistedNone(ctx), members0 = await membersJson(ctx), items1 = await catalogItems(ctx);
    const runner = actor === 'su' ? ctx.su : actor === 'op' ? ctx.op : await ctx.open(actor);
    const notices = []; const onN = m => notices.push(m.message); runner.on('notice', onN);
    let error = null;
    try { await ctx.g.query(runner, ctx.acqSource); } catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await runner.query('ROLLBACK').catch(() => {}); }
    runner.removeListener('notice', onN);
    const after = await persistedNone(ctx), items2 = await catalogItems(ctx), d = itemsDiff(items1, items2);
    const stateUnchanged = same(before, after) && members0 === await membersJson(ctx) && d.added.length + d.removed.length + d.changed.length === 0;
    const pass = !!error && error.message.startsWith(expectPrefix) && stateUnchanged && (preexisting || noneLeft(after)) && !notices.includes('ACQ_DDL_BOUNDARY');
    return { label, expectPrefix, error: error && { code: error.code, message: error.message.slice(0, 120) }, stateUnchanged, diff: d, pass };
  }, { apply: false, settings, acq: source });
}
export async function migrationRefusals(cl, source = acqSource()) {
  const cases = [];
  const refuse = (label, prepare, prefix, opts = {}) => expectRefusal(cl, label, prepare, prefix, { ...opts, source });
  cases.push(await refuse('N07a-actor-db-owner-createrole-not-superuser', async () => {}, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actor: 'op' }));
  cases.push(await refuse('N07b-actor-createrole-not-db-owner', async ctx => { ctx.extraRoles.add('acq_creator'); await ctx.g.query(ctx.su, 'create role acq_creator login createrole'); await ctx.g.query(ctx.su, 'grant connect on database ' + ctx.name + ' to acq_creator'); }, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actor: 'acq_creator' }));
  for (const role of ['pgbouncer', 'supabase_auth_admin', 'dashboard_user', 'supabase_read_only_user', 'supabase_etl_admin']) {
    cases.push(await refuse('N07c-marker-role-' + role, async ctx => { ctx.extraRoles.add(role); await ctx.g.query(ctx.su, `create role ${role} nologin`); }, 'ACQ_PLATFORM_APPLY_NOT_AUTHORIZED role:' + role));
  }
  cases.push(await refuse('N07d-marker-history-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema supabase_migrations'); }, 'ACQ_PLATFORM_APPLY_NOT_AUTHORIZED schema:supabase_migrations'));
  cases.push(await refuse('N07e-marker-supautils-setting', async ctx => { await ctx.su.query("select set_config('supautils.reserved_roles','acq_probe',false)"); }, 'ACQ_PLATFORM_APPLY_NOT_AUTHORIZED setting:supautils'));
  for (const guc of ['tastkind.r0b_target', 'tastkind.r0b_manifest', 'tastkind.r0b_fixture_nonce']) {
    cases.push(await refuse('N07f-binding-setting-' + guc.split('.')[1], async ctx => { await ctx.su.query(`select set_config('${guc}','x',false)`); }, 'ACQ_BINDINGS_NOT_SUPPORTED'));
  }
  cases.push(await refuse('N07g-preexisting-acquisition-role', async ctx => { ctx.extraRoles.add(ACQ_OWNER); await ctx.g.query(ctx.su, `create role ${ACQ_OWNER} nologin`); }, 'ACQ_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('N07h-preexisting-acquisition-schema', async ctx => { await ctx.g.query(ctx.su, `create schema ${ACQ_SCHEMA}`); }, 'ACQ_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('N07i-unapproved-predefined-data-member', async ctx => { ctx.extraRoles.add('acq_reader'); await ctx.g.query(ctx.su, 'create role acq_reader nologin'); await ctx.g.query(ctx.su, 'grant pg_read_all_data to acq_reader'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('N07j-runtime-reaches-management-identity', async ctx => { await ctx.g.query(ctx.su, 'grant postgres to authenticated with inherit false, set false'); ctx.cleanups.push('revoke postgres from authenticated'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('N07k-missing-capture-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_capture cascade'); }, 'ACQ_PREDECESSORS_MISSING'));
  cases.push(await refuse('N07l-missing-entitlement-predecessor', async ctx => { await ctx.g.query(ctx.su, `drop schema ${ENT} cascade`); }, 'ACQ_PREDECESSORS_MISSING'));
  cases.push(await refuse('N07m-missing-foundation-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_internal cascade'); }, 'ACQ_PREDECESSORS_MISSING'));
  cases.push(await refuse('N07n-drift-anchors-granted-to-runtime', async ctx => { await ctx.g.query(ctx.su, 'grant select on retention_capture.detail_capture_anchors to anon'); }, 'ACQ_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N07o-drift-capture-schema-granted', async ctx => { await ctx.g.query(ctx.su, 'grant usage on schema retention_capture to authenticated'); }, 'ACQ_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N07p-drift-state-at-granted', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT}.entitlement_state_at(uuid, timestamptz) to authenticated`); }, 'ACQ_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N07q-drift-entitlement-schema-granted', async ctx => { await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to anon`); }, 'ACQ_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N07r-drift-extra-anchor-policy', async ctx => { await ctx.g.query(ctx.su, 'create policy extra_p on retention_capture.detail_capture_anchors for select to anon using (true)'); }, 'ACQ_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N07s-drift-anchor-owner-changed', async ctx => { await ctx.g.query(ctx.su, 'alter table retention_capture.detail_capture_anchors owner to postgres'); }, 'ACQ_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N07t-drift-state-at-owner-changed', async ctx => { await ctx.g.query(ctx.su, `alter function ${ENT}.entitlement_state_at(uuid, timestamptz) owner to postgres`); }, 'ACQ_PREDECESSOR_DRIFT'));
  return R(cases.every(c => c.pass), cases);
}
const FAULT_ANCHORS = [
  ['builder-created', 'CREATE ROLE consumer_retention_acquisition_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;'],
  ['owner-granted', "EXECUTE pg_catalog.format('GRANT consumer_retention_acquisition_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);\nEND $$;"],
  ['tables-built', 'CREATE TRIGGER receipt_immutable BEFORE UPDATE ON retention_acquisition.detail_acquisition_records\n FOR EACH ROW EXECUTE FUNCTION retention_acquisition.reject_receipt_update();'],
  ['resolver-owned', 'ALTER FUNCTION retention_acquisition.resolve_detail_acquisition(uuid) OWNER TO consumer_retention_acquisition_owner;'],
  ['seam-policy-created', 'CREATE POLICY acquisition_owner_select ON retention_capture.detail_capture_anchors AS PERMISSIVE FOR SELECT TO consumer_retention_acquisition_owner USING (true);'],
  ['seams-granted', 'GRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_acquisition_owner;'],
  ['builder-dropped', 'DROP ROLE consumer_retention_acquisition_builder;']
];
export async function migrationRollbackAndDrift(cl, installSource = acqSource()) {
  const out = [];
  for (const [label, anchor] of FAULT_ANCHORS) {
    if (installSource.split(anchor).length !== 2) throw Error('SETUP_FAULT_ANCHOR ' + label);
    const mutant = installSource.replace(anchor, () => anchor + '\nSELECT 1/0;');
    out.push(await acqFresh(cl, 'N08-fault-' + label, async ctx => {
      const before = await membersJson(ctx), items1 = await catalogItems(ctx);
      const a = await acqApply(ctx, mutant);
      const p = await persistedNone(ctx), d = itemsDiff(items1, await catalogItems(ctx));
      return { label, error: a.error, boundary: a.boundary, persisted: p, diff: d, pass: a.error?.code === '22012' && a.boundary && noneLeft(p) && before === await membersJson(ctx) && d.added.length + d.removed.length + d.changed.length === 0 };
    }, { apply: false, acq: installSource }));
  }
  const drifts = [
    ['role-created', async ctx => { ctx.extraRoles.add('acq_drift_role'); await ctx.g.query(ctx.su, 'create role acq_drift_role nologin'); }, 'ACQ_POST_GUARD_DRIFT'],
    ['public-table-acl', async ctx => { await ctx.g.query(ctx.su, 'grant select on public.restaurants to anon'); }, 'ACQ_POST_GUARD_DRIFT'],
    ['membership', async ctx => { await ctx.g.query(ctx.su, 'grant anon to service_role'); ctx.cleanups.push('revoke anon from service_role'); }, 'ACQ_POST_GUARD_DRIFT'],
    ['extra-anchor-policy', async ctx => { await ctx.g.query(ctx.su, 'create policy drift_p on retention_capture.detail_capture_anchors for select to anon using (true)'); }, 'ACQ_POST_GUARD_DRIFT'],
    ['anchors-granted-to-runtime-meanwhile', async ctx => { await ctx.g.query(ctx.su, 'grant select on retention_capture.detail_capture_anchors to anon'); }, 'ACQ_SEAM_STATE_MISMATCH'],
    ['state-at-granted-to-runtime-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT}.entitlement_state_at(uuid, timestamptz) to authenticated`); }, 'ACQ_SEAM_STATE_MISMATCH'],
    ['capture-schema-granted-meanwhile', async ctx => { await ctx.g.query(ctx.su, 'grant usage on schema retention_capture to anon'); }, 'ACQ_SEAM_STATE_MISMATCH']
  ];
  for (const [label, drift, expect] of drifts) {
    out.push(await acqFresh(cl, 'N08-drift-' + label, async ctx => {
      await installProbe(ctx.su);
      const d0 = await ddlAttempts(ctx.su);
      const runner = await ctx.open('supabase_admin'); const locker = await ctx.open('supabase_admin');
      let error = null, paused = false;
      try {
        await locker.query('select pg_catalog.pg_advisory_lock($1)', [PROBE_PAUSE_LOCK]);
        const pending = ctx.g.query(runner, ctx.acqSource).then(() => null, e => ({ code: e.code, message: String(e.message) }));
        for (let i = 0; i < 200 && !paused; i++) { paused = (await ctx.su.query("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) w", [PROBE_PAUSE_LOCK])).rows[0].w; if (!paused) await sleep(100); }
        if (paused) await drift(ctx);
        await locker.query('select pg_catalog.pg_advisory_unlock($1)', [PROBE_PAUSE_LOCK]);
        error = await pending;
      } finally { await runner.query('ROLLBACK').catch(() => {}); }
      const p = await persistedNone(ctx);
      const attempts = (await ddlAttempts(ctx.su)) - d0;
      await ctx.su.query('revoke select on public.restaurants from anon').catch(() => {});
      return { label, expect, paused, error: error && { code: error.code, message: error.message.slice(0, 100) }, persisted: p, ddlAttempts: attempts, pass: paused && !!error && error.message.startsWith(expect) && attempts > 0 && noneLeft(p) };
    }, { apply: false, settings: ["tastkind_probe.pause = 'on'"], acq: installSource }));
  }
  return R(out.every(o => o.pass), out);
}

// The repository-wide wiring scan of P14, under apps/, packages/ and supabase/functions/:
//  - names:      files naming the acquisition schema or the resolver (unchanged rule)
//  - edges:      "importer -> target" for every module reference that RESOLVES (relative to the importer's own directory, normalized) to a file of the ENT-W1 modules (supabase/functions/_shared/acquisition-resolve/**
//                or supabase/functions/retention-acquisition-resolve/**). Supported references: import ... from / export ... from, side-effect import "x", import type, dynamic import("x") and require("x") with a
//                string literal. Same-directory (./worker.ts), parent (../), re-exports and dynamic imports are all edges; references to unrelated modules are resolved and ignored.
//  - unresolved: files with a quoted string naming one of the ENT-W1 module directories that did not resolve to an edge (a template / computed specifier, an import-map alias, ...): never allowed
// ENT-W1-A02 (first independent acceptance): the rejected candidate only matched fixed path fragments, so "./worker.ts" from inside the module directory and "./acquisition-resolve/worker.ts" from _shared were missed.
export const ENTW1_MODULE_DIR = /^supabase\/functions\/(?:_shared\/acquisition-resolve|retention-acquisition-resolve)\//;
const SPECIFIERS = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g,     // import x from "m"; import type {T} from "m"; export {a} from "m"; export * from "m"
  /\bimport\s*(['"])([^'"\n]+)\1/g,                                // import "m"
  /\b(?:import|require)\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g            // import("m"), require("m")
];
export function moduleReferences(importer, source) {
  const refs = new Set();
  for (const re of SPECIFIERS) for (const m of source.matchAll(re)) refs.add(m[2]);
  return [...refs].map(spec => {
    const bare = spec.replace(/[?#].*$/, '');
    let target = null;
    if (bare.startsWith('./') || bare.startsWith('../')) target = path.posix.normalize(path.posix.join(path.posix.dirname(importer), bare));
    else if (bare.startsWith('file://')) { try { target = path.relative(ROOT, fileURLToPath(bare)).split(path.sep).join('/'); } catch { target = null; } }
    return { spec, target };
  });
}
export function scanWiring({ extra = {}, drop = [] } = {}) {
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs|json)$/.test(e.name)) files.push(path.relative(ROOT, p).replace(/\\/g, '/')); } };
  for (const d of ['apps', 'packages', 'supabase/functions']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
  const all = [...new Set([...files.filter(p => !drop.includes(p)), ...Object.keys(extra)])].sort();
  const text = p => (Object.prototype.hasOwnProperty.call(extra, p) ? extra[p] : fs.readFileSync(path.join(ROOT, p), 'utf8'));
  const names = [], edges = [], unresolved = [];
  for (const p of all) {
    const t = text(p);
    if (/retention_acquisition|resolve_detail_acquisition/.test(t)) names.push(p);
    const refs = moduleReferences(p, t), hits = refs.filter(r => r.target && ENTW1_MODULE_DIR.test(r.target) && r.target !== p);
    for (const h of hits) edges.push(p + ' -> ' + h.target);
    const quoted = [...t.matchAll(/["'`]([^"'`\n]*(?:acquisition-resolve\/|retention-acquisition-resolve\/)[^"'`\n]*)["'`]/g)].map(m => m[1]);
    if (quoted.some(q => !refs.some(r => r.spec === q && r.target && ENTW1_MODULE_DIR.test(r.target)))) unresolved.push(p);
  }
  return { names, edges: [...new Set(edges)].sort(), unresolved };
}
// Without the ENT-W1 module (state 'base') names, edges and unresolved must all be empty, exactly as before ENT-W1. With the complete exact ENT-W1 record (the root's checkedEntw1State, which also requires the
// whole older chain) names and edges must EQUAL the recorded lists (ENTW1_WIRING) and unresolved must be empty; an 'invalid' (partial, tampered, mixed) ENT-W1 state never passes. `git`, `extra` (virtual
// added/overridden files) and `drop` (paths hidden) exist only for the negative controls of the ENT-W1 smoke; P14 calls it with the defaults.
export function resolverWiringProof({ git = args => { const r = child.spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256e6, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); if (r.status) throw Error('GIT ' + args[0] + ' ' + r.stderr); return r.stdout; }, extra = {}, drop = [] } = {}) {
  const { names, edges, unresolved } = scanWiring({ extra, drop });
  const importers = [...new Set(edges.map(e => e.split(' -> ')[0]))].sort();
  const entw1 = checkedEntw1State(git);
  const sameList = (a, b) => JSON.stringify(a) === JSON.stringify([...b].sort());
  const ok = entw1.state === 'record' ? sameList(names, ENTW1_WIRING.names) && sameList(edges, ENTW1_WIRING.edges) && unresolved.length === 0 : entw1.state === 'base' && names.length === 0 && edges.length === 0 && unresolved.length === 0;
  return { ok, entw1: entw1.state, entw1Violations: entw1.violations, names, edges, importers, unresolved, expected: entw1.state === 'record' ? ENTW1_WIRING : { names: [], edges: [] } };
}
GATES.F01_FROZEN_SCOPE_AND_INVENTORY = async () => {
  const frozen = frozenProof(), inv = inventoryProof();
  const sourceSha = sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', ACQ_MIGRATION)));
  const own = /IS DISTINCT FROM '([0-9a-f]{64})'/.exec(acqSource())?.[1];
  // Exact ORDERED new-migration tail: capture, ENT0, the origin demo migration, then the ENT1-A migration (20261017010000). No file is assumed last except by this exact order.
  // With the exact ENT-R record (persistence smoke, byte-pinned) the ENT-R migration (20261018010000) sorts after the ENT1-A migration; the ENT1-A record itself is required in both states.
  // With the exact social integration record (persistence smoke, byte-pinned, only on top of the ENT-R record) the two social migrations sort between the ENT1-A migration and the ENT-R migration.
  const tail = withAct2Tail([...withSocialTail(frozen.recoverySuccessor.seal === 'record' ? [CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION, SEAL_MIGRATION] : [CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION], frozen.recoverySuccessor.seal === 'record' && frozen.recoverySuccessor.social === 'record'), ...(frozen.recoverySuccessor.seal === 'record' && frozen.recoverySuccessor.social === 'record' && frozen.recoverySuccessor.billing === 'record' ? [BILLING_MIGRATION] : [])]);
  return R(frozen.violations.length === 0 && frozen.recoverySuccessor.state === 'ent0' && frozen.recoverySuccessor.demo === 'record' && frozen.recoverySuccessor.acq === 'record'
    && inv.migrationCount === 143 + tail.length && inv.baselineCount === 143 && same(inv.newPaths, tail) && inv.changedBaselineMigrations.length === 0 && inv.timestampLaterThanAll
    && sourceSha === ACQ_MIGRATION_SHA256 && own === ACQ_POST_DIGEST, { frozen, inv, tail, sourceSha, pinned: ACQ_MIGRATION_SHA256, postDigest: own });
};

// ---- gate selection contract (same contract and same code as the accepted ENT0 runner: TK_GATES takes full ids only) ---------------------------------------------------
GATES.F02_GATE_SELECTION_CONTRACT = async () => {
  const rows = selectionContractRows(); const o = {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-f02-')); const bad = {};
  const spawn = (env, extra) => { const r = child.spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...extra], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600000, maxBuffer: 16 << 20 }); return { code: r.status, out: String(r.stdout ?? '') }; };
  for (const [name, val] of [['unknown', 'NO_SUCH_GATE'], ['mixed', 'N09_RESOLVER_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST,NO_SUCH_GATE'], ['empty', ''], ['separators', ','], ['prefix', 'N09'], ['trailing-comma', 'N09_RESOLVER_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST,']]) {
    const r = spawn({ TK_GATES: val }, ['--pg-bin', path.join(tmp, 'no-such-pg', 'bin'), '--out', path.join(tmp, 'neg-' + name)]);
    bad[name] = { code: r.code, checkLines: (r.out.match(/^CHECK /gm) ?? []).length, outDirCreated: fs.existsSync(path.join(tmp, 'neg-' + name)) };
  }
  o.refusals = bad;
  const refused = Object.values(bad).every(b => b.code !== 0 && b.code !== null && b.checkLines === 0 && !b.outDirCreated);
  const N09 = 'N09_RESOLVER_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST', P01 = 'P01_PAID_FACT_AT_T0_FORMS_RECEIPT_WITHOUT_COVERAGE';
  const pos = spawn({ TK_GATES: N09 + ',' + P01 }, ['--pg-bin', options().bin, '--out', path.join(tmp, 'pos')]);
  const lines = pos.out.split(/\r?\n/).filter(l => /^CHECK /.test(l)).map(l => l.split(' ')[1]);
  let res = null; try { res = JSON.parse(fs.readFileSync(path.join(tmp, 'pos', 'result.json'), 'utf8')); } catch { /* reported below */ }
  o.positive = { code: pos.code, lines, status: res?.status, selected: res?.selected };
  const exact = pos.code === 0 && same(lines, [P01, N09]) && res?.status === 'PASS' && same(res.selected, [P01, N09]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup only */ }
  o.rows = rows.map(r => ({ name: r.name, ok: r.ok }));
  return R(rows.every(r => r.ok) && refused && exact, o);
};

export const POSITIVE_IDS = Object.keys(GATES).filter(k => /^P\d\d_/.test(k));
export const NEGATIVE_IDS = ['N01_RUNTIME_ROLES_AND_THE_SEALED_OWNER_REACH_ONLY_WHAT_WAS_APPROVED', 'N02_RECEIPTS_CANNOT_BE_CHANGED_OR_SHORTENED', 'N03_FORGED_DIRECT_INSERTS_ARE_REJECTED_EACH_FOR_ITS_OWN_REASON', 'N04_PENDING_AND_UNKNOWN_OUTCOMES_NEVER_WRITE',
  'N05_NO_CURRENT_MEMBERSHIP_JWT_OR_CALLER_VALUE_CAN_CREATE_A_RECEIPT', 'N06_A_TRANSACTION_THAT_HAS_WRITTEN_ANYTHING_IS_REFUSED', 'N07_MIGRATION_PRECONDITIONS_FAIL_CLOSED', 'N08_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT', 'N09_RESOLVER_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST'];
export const SUPPLEMENTARY_IDS = ['F01_FROZEN_SCOPE_AND_INVENTORY', 'F02_GATE_SELECTION_CONTRACT'];
export const ALL_GATE_IDS = [...POSITIVE_IDS, ...NEGATIVE_IDS, ...SUPPLEMENTARY_IDS];
export async function runGate(cl, id, source = acqSource()) {
  if (id === 'N07_MIGRATION_PRECONDITIONS_FAIL_CLOSED') return migrationRefusals(cl, source);
  if (id === 'N08_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT') return migrationRollbackAndDrift(cl, source);
  if (id.startsWith('F0')) return GATES[id]();
  return acqFresh(cl, id, ctx => GATES[id](ctx), { acq: source });
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
