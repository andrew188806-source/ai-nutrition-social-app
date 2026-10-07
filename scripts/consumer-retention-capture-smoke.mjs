#!/usr/bin/env node
// TastKind R0-B-CAP local acceptance gates. Disposable PostgreSQL 17 only; never a remote target.
// Gates are exported so the mutation harness exercises the very same detectors against changed migration SQL.
import fs from 'node:fs';
import path from 'node:path';
import child from 'node:child_process';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ROOT, MIGRATION, CAPTURE_SUCCESSOR, CAPTURE_SUCCESSOR_SHA256, recorder, cluster, baseline, sha, uuid, installProbe, ddlAttempts, PROBE_PAUSE_LOCK,
  recoverySuccessorState
} from './consumer-retention-persistence-smoke.mjs';
import { activateDisposableFixture } from './pc2-consumer-onboarding-fixtures.mjs';

export const CAPTURE_MIGRATION = CAPTURE_SUCCESSOR;
export const CAP_SCHEMA = 'retention_capture';
export const CAP_OWNER = 'consumer_retention_capture_owner';
export const CAP_BUILDER = 'consumer_retention_capture_builder';
export const CAP_POST_DIGEST = '3d314fc9c334f02d04932662c80617011bfef13fe418024b98fdc72538e22f76';
export const BASELINE_COMMIT = '3eb8d7fa0002555d504d900db44313fca860474a';
export const ALLOWED_PATHS = [
  'supabase/migrations/' + CAPTURE_MIGRATION,
  'scripts/consumer-retention-capture-smoke.mjs',
  'scripts/consumer-retention-capture-mutations.mjs',
  'scripts/consumer-retention-persistence-smoke.mjs',
  'docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md'
];
export const captureSource = () => fs.readFileSync(path.join(ROOT, 'supabase/migrations', CAPTURE_MIGRATION), 'utf8');
export const ELIGIBLE = uuid(910);   // legacy user: PC-2 preparation-cohort core eligible
export const INELIGIBLE = uuid(911); // Auth user without an active profile
const T_PAST = '2020-01-02T03:04:05.678Z';
const items = name => JSON.stringify([{ displayName: name, nutritionSource: 'manual', nutrition: { calories: 100, protein: 5, carbohydrates: 15, fat: 2, fiber: 1 } }]);
const V1_SQL = "select public.create_current_user_meal_record('lunch',$1::timestamptz,$2::date,'Asia/Taipei',$3,null,'manual',$4::jsonb) s";
const V2_SQL = "select public.create_current_user_meal_record_v2('lunch',$1::timestamptz,$2::date,$3::uuid,'Asia/Taipei',$4,null,'manual',$5::jsonb) s";
const FIN_SQL = "select public.finalize_current_user_meal_identification_v1($1::uuid,'lunch',$2::timestamptz,$3::date,'Asia/Taipei',$4::jsonb) s";
const legacyFinalization = (version = 'meal-identification-finalization-v1', extra = {}) => ({
  version,
  originalAnalysis: { status: 'unavailable', detectedItemNames: [], photoReferences: [], model: null, estimatedNutrition: null, confidence: null, analyzedAt: null },
  selection: { kind: 'personal_unresolved', sourceContext: 'unknown', identity: { branchId: null, branchMenuItemId: null, menuCategoryId: null, menuId: null, menuItemId: null, restaurantId: null }, mealItemName: 'SYNTHETIC finalized meal', reason: 'manual', restaurantName: 'SYNTHETIC place' },
  corrections: [],
  mealWrite: { isSelfCooked: false, mealName: 'SYNTHETIC finalized meal', nutrition: { calories: 120, protein: 6 }, portion: null, selectedMealPeriod: 'lunch', wasUserCorrected: false },
  ...extra
});
const v2Finalization = occurredAt => { const f = legacyFinalization('meal-identification-finalization-v2', { recordTiming: 'current', occurredAt }); return f; };
const v3Finalization = (analysisRequestId, occurredAt) => ({
  version: 'meal-identification-finalization-v3', analysisRequestId, captureMethod: null, occurredAt, recordTiming: 'current', selectedCandidateId: null, sourceContext: 'unknown',
  mealWrite: { components: [], mealName: 'SYNTHETIC v3 meal', nutrition: { calories: 130 }, portion: null }
});

export function options(argv = process.argv.slice(2)) {
  const allowed = ['--pg-bin', '--out'];
  if (argv.length % 2 || argv.some((v, i) => i % 2 === 0 && !allowed.includes(v))) throw Error('LOCAL_ONLY_ARGUMENTS: only --pg-bin and --out; no DSN/host');
  const a = Object.fromEntries(Array.from({ length: argv.length / 2 }, (_, i) => [argv[i * 2], argv[i * 2 + 1]]));
  if (!a['--pg-bin'] || !a['--out']) throw Error('Existing PostgreSQL 17 binary and external --out are required');
  const out = path.resolve(a['--out']);
  if (out === ROOT || out.startsWith(ROOT + path.sep)) throw Error('EVIDENCE_OUTSIDE_REPOSITORY_REQUIRED');
  return { bin: path.resolve(a['--pg-bin']), out };
}

// ---- cluster / template ---------------------------------------------------------------------------------
// Template = complete 142-migration baseline (legacy actor 910 before PC-2) + the accepted R0-B foundation. Never the capture migration.
export async function captureCluster(bin, rec) {
  const cl = await cluster(bin, rec);
  const db = await baseline(cl, rec, { legacy: true });
  await rec.query(db, fs.readFileSync(path.join(ROOT, 'supabase/migrations', MIGRATION), 'utf8'));
  await db.end(); cl.clients.delete(db); await cl.admin.end(); cl.clients.delete(cl.admin);
  cl.admin = await cl.connect('template1');
  let n = 0;
  const extraRoles = new Set();
  cl.fresh = async (label, fn, { capture = true, source = captureSource(), settings = [] } = {}) => {
    const name = `cap_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 36)}_${n++}`;
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
      if (capture) {
        ctx.pre = await snapshot(ctx);
        ctx.apply = await tryApply(ctx, source);
        if (ctx.apply.error) throw Error('SETUP_CAPTURE_APPLY ' + JSON.stringify(ctx.apply.error));
        ctx.post = await snapshot(ctx);
      }
      return await fn(ctx);
    } finally {
      for (const c of opened) await c.end().catch(() => {});
      for (const c of [op, su]) { await c.end().catch(() => {}); cl.clients.delete(c); }
      await rec.query(cl.admin, 'select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where datname=$1 and pid<>pg_catalog.pg_backend_pid()', [name]);
      await rec.query(cl.admin, `drop database ${name}`);
      for (const sql of ctx.cleanups.reverse()) await rec.query(cl.admin, sql).catch(() => {});
      for (const role of [CAP_OWNER, CAP_BUILDER, ...extraRoles]) {
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
  return { error, notices: ctx.notices.slice(before), boundary: ctx.notices.slice(before).includes('CAP_DDL_BOUNDARY') };
}

const FUNCTIONS = ['create_current_user_meal_record', 'create_current_user_meal_record_v2', 'finalize_current_user_meal_identification_v1',
  'finalize_current_user_meal_identification_v1_legacy_internal', 'create_authenticated_planned_meal_v2', 'convert_authenticated_planned_meal_v2'];
export async function snapshot(ctx) {
  const q = (t, v) => ctx.g.query(ctx.su, t, v).then(r => r.rows);
  const fn = await q("select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_userbyid(p.proowner)::text owner, p.proacl::text acl, p.proconfig::text config, p.prosecdef secdef, p.provolatile vol, p.procost, p.prorows, p.proparallel, p.proisstrict, p.proleakproof, p.prokind, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') src, encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') def from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=any($1) order by 1,2", [FUNCTIONS]);
  const table = await q("select c.relname, pg_get_userbyid(c.relowner)::text owner, c.relacl::text acl, c.relrowsecurity rls, c.relforcerowsecurity force_rls from pg_class c where c.oid in ('public.meal_records'::regclass,'public.meal_record_items'::regclass,'public.subscription_entitlements'::regclass) order by 1");
  const policies = await q("select polrelid::regclass::text rel, polname, polcmd, polpermissive, polroles::text roles, pg_get_expr(polqual,polrelid) qual, pg_get_expr(polwithcheck,polrelid) chk from pg_policy where polrelid in ('public.meal_records'::regclass,'public.meal_record_items'::regclass) order by 1,2");
  const triggers = await q("select tgrelid::regclass::text rel, tgname, tgenabled, pg_get_triggerdef(oid) def from pg_trigger where tgrelid in ('public.meal_records'::regclass,'public.meal_record_items'::regclass) and not tgisinternal order by 1,2");
  const columns = await q("select attrelid::regclass::text rel, attname, format_type(atttypid,atttypmod) typ, attnotnull from pg_attribute where attrelid in ('public.meal_records'::regclass,'public.meal_record_items'::regclass) and attnum>0 and not attisdropped order by 1,attnum");
  return { fn, table, policies, triggers, columns };
}

// ---- actor / RPC helpers -----------------------------------------------------------------------------------
export async function act(ctx, uid, sql, values = [], { role = 'authenticated', claims = true, extraSet = [] } = {}) {
  const c = await ctx.open('supabase_admin');
  try {
    await ctx.g.query(c, 'begin');
    if (claims) await ctx.g.query(c, "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [uid ?? '', JSON.stringify({ sub: uid })]);
    for (const [k, v] of extraSet) await ctx.g.query(c, 'select set_config($1,$2,true)', [k, v]);
    if (role) await ctx.g.query(c, `set local role ${role}`);
    const r = await ctx.g.query(c, sql, values);
    await ctx.g.query(c, 'commit');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await c.query('rollback').catch(() => {});
    return { ok: false, code: e.code ?? null, message: String(e.message) };
  } finally { await c.end().catch(() => {}); ctx.noop = 0; }
}
const one = r => { if (!r.ok) throw Error('RPC_FAILED ' + r.code + ' ' + r.message); return r.rows[0].s; };
const anchors = (ctx, where = 'true', values = []) => ctx.g.query(ctx.su, `select to_jsonb(a) a, a.original_recorded_at, (select m.created_at from public.meal_records m where m.id=a.resource_id) created_at from retention_capture.detail_capture_anchors a where ${where} order by a.resource_id`, values).then(r => r.rows);
const count = async (ctx, table, where = 'true') => (await ctx.g.query(ctx.su, `select count(*)::int n from ${table} where ${where}`)).rows[0].n;
const msIso = d => d.toISOString();
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
const dateKey = d => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const within = (t, a, b) => t.getTime() >= a.getTime() - 1 && t.getTime() <= b.getTime() + 1;
const msAligned = d => d.getTime() % 1 === 0;

async function createPlanned(ctx, key) {
  const r = await act(ctx, ELIGIBLE, "select public.create_authenticated_planned_meal_v2($1::uuid,'2026-10-07','Asia/Taipei','dinner','SYNTHETIC planned',$2::jsonb) s", [key, JSON.stringify({ calories: 200 })]);
  return one(r);
}

// ---- gate library -------------------------------------------------------------------------------------------
const R = (pass, observed) => ({ pass: !!pass, observed });
const nowBounds = async ctx => (await ctx.g.query(ctx.su, 'select clock_timestamp() t')).rows[0].t;
async function entry(ctx, kind, keyN, { occurredAt = iso(), uid = ELIGIBLE } = {}) {
  const occurred = occurredAt; const mealDate = dateKey(occurred); const key = uuid(keyN);
  const before = await nowBounds(ctx);
  let r;
  if (kind === 'v1') r = await act(ctx, uid, V1_SQL, [occurred, mealDate, 'SYNTHETIC v1', items('SYNTHETIC v1 food')]);
  else if (kind === 'v2') r = await act(ctx, uid, V2_SQL, [occurred, mealDate, key, 'SYNTHETIC v2', items('SYNTHETIC v2 food')]);
  else if (kind === 'finalize-v1') r = await act(ctx, uid, FIN_SQL, [key, occurred, mealDate, JSON.stringify(legacyFinalization())]);
  else if (kind === 'finalize-v2') r = await act(ctx, uid, FIN_SQL, [key, occurred, mealDate, JSON.stringify(v2Finalization(occurred))]);
  else if (kind === 'finalize-v3') {
    const request = uuid(keyN + 5000);
    await ctx.g.query(ctx.su, "insert into public.meal_analyses(user_id,model_name,model_version,analysis_request_id,analysis_status) values($1,'synthetic','v0',$2,'completed')", [uid, request]);
    r = await act(ctx, uid, FIN_SQL, [key, occurred, mealDate, JSON.stringify(v3Finalization(request, occurred))]);
  } else if (kind === 'conversion') {
    var planned = await createPlanned(ctx, uuid(keyN + 6000));
    const stamp = occurred;
    r = await act(ctx, uid, "select public.convert_authenticated_planned_meal_v2($1::uuid,$2::uuid,$3::timestamptz,$4::timestamptz,'Asia/Taipei') s", [planned.id, key, planned.updated_at, stamp]);
    if (r.ok) r.rows[0].s.meal_record_id = r.rows[0].s.meal_record_id;
  } else throw Error('UNKNOWN_ENTRY ' + kind);
  const after = await nowBounds(ctx);
  return { r, before, after, key, occurred, mealDate, planned: typeof planned === 'undefined' ? null : planned };
}
const recordIdOf = (kind, s) => kind === 'v1' || kind === 'v2' ? s.id : s.meal_record_id;

function entryGate(kind, keyN) {
  return async ctx => {
    const e = await entry(ctx, kind, keyN);
    if (!e.r.ok) return R(false, { rpcError: e.r });
    const s = e.r.rows[0].s; const id = recordIdOf(kind, s);
    const a = await anchors(ctx, 'a.resource_id=$1', [id]);
    const total = await count(ctx, 'retention_capture.detail_capture_anchors');
    const rec = a[0];
    const ok = a.length === 1 && total === 1 && rec.a.owner_user_id === ELIGIBLE && rec.a.capture_kind === 'canonical_meal_insert'
      && rec.a.capture_contract_version === 'retention-capture-v1' && rec.a.capture_context === 'authenticated_actor'
      && within(rec.original_recorded_at, e.before, e.after) && rec.original_recorded_at.getTime() === Math.floor(rec.created_at.getTime())
      && msAligned(rec.original_recorded_at);
    return R(ok, { kind, recordId: id, anchors: a.length, total, anchor: rec?.a, createdAt: rec?.created_at, before: e.before, after: e.after });
  };
}

export const GATES = {
  P02_ENTRY_V1_DIRECT: entryGate('v1', 1001),
  P03_ENTRY_V2: entryGate('v2', 1002),
  P04_ENTRY_FINALIZE_LEGACY: entryGate('finalize-v1', 1003),
  P05_ENTRY_FINALIZE_V3_EXISTING_ANALYSIS: entryGate('finalize-v3', 1004),
  P06_ENTRY_PLANNED_CONVERSION: entryGate('conversion', 1005),
  async S01_ENTRY_FINALIZE_V2_RECORD_TIMING(ctx) { return entryGate('finalize-v2', 1006)(ctx); },
  async P07_BACKFILLED_MEAL_TIME_DOES_NOT_MOVE_T0(ctx) {
    const cases = [['past', T_PAST], ['future', iso(2 * 86400e3)], ['near-midnight-tz', '2026-03-29T16:30:00.000Z']];
    const out = [];
    for (const [i, [label, occurred]] of cases.entries()) {
      const before = await nowBounds(ctx);
      const r = await act(ctx, ELIGIBLE, V2_SQL, [occurred, dateKey(occurred), uuid(1100 + i), 'SYNTHETIC backfill ' + label, items('SYNTHETIC backfill')]);
      const after = await nowBounds(ctx);
      if (!r.ok) { out.push({ label, error: r }); continue; }
      const a = (await anchors(ctx, 'a.resource_id=$1', [r.rows[0].s.id]))[0];
      out.push({ label, occurred, t0: a?.original_recorded_at, ok: !!a && within(a.original_recorded_at, before, after) && Math.abs(a.original_recorded_at.getTime() - new Date(occurred).getTime()) > 3600e3 });
    }
    return R(out.length === 3 && out.every(x => x.ok), out);
  },
  async P08_REPLAY_KEEPS_RECORD_AND_T0(ctx) {
    const out = [];
    const specs = [['v2', 1201], ['finalize-v1', 1202], ['finalize-v3', 1203], ['conversion', 1204]];
    for (const [kind, n] of specs) {
      const e = await entry(ctx, kind, n);
      if (!e.r.ok) { out.push({ kind, error: e.r }); continue; }
      const id = recordIdOf(kind, e.r.rows[0].s);
      const a1 = (await anchors(ctx, 'a.resource_id=$1', [id]))[0];
      await new Promise(r => setTimeout(r, 30));
      let again;
      if (kind === 'v2') again = await act(ctx, ELIGIBLE, V2_SQL, [e.occurred, e.mealDate, e.key, 'SYNTHETIC v2', items('SYNTHETIC v2 food')]);
      else if (kind === 'finalize-v1') again = await act(ctx, ELIGIBLE, FIN_SQL, [e.key, e.occurred, e.mealDate, JSON.stringify(legacyFinalization())]);
      else if (kind === 'finalize-v3') again = await act(ctx, ELIGIBLE, FIN_SQL, [e.key, e.occurred, e.mealDate, JSON.stringify(v3Finalization(uuid(n + 5000), e.occurred))]);
      else {
        again = await act(ctx, ELIGIBLE, "select public.convert_authenticated_planned_meal_v2($1::uuid,$2::uuid,$3::timestamptz,$4::timestamptz,'Asia/Taipei') s", [e.planned.id, e.key, e.planned.updated_at, e.occurred]);
      }
      const a2 = (await anchors(ctx, 'a.resource_id=$1', [id]))[0];
      const total = await count(ctx, 'public.meal_records', 'id=$1'.replace('$1', `'${id}'`));
      out.push({ kind, replayOk: again.ok, replayError: again.ok ? null : again, sameAnchor: JSON.stringify(a1.a) === JSON.stringify(a2.a), t0Same: a1.original_recorded_at.getTime() === a2.original_recorded_at.getTime(), record: total });
    }
    const totalAnchors = await count(ctx, 'retention_capture.detail_capture_anchors'), totalRecords = await count(ctx, 'public.meal_records');
    return R(out.length === 4 && out.every(x => x.replayOk && x.sameAnchor && x.t0Same && x.record === 1) && totalAnchors === totalRecords, { out, totalAnchors, totalRecords });
  },
  async P09_CONCURRENT_SAME_AND_DIFFERENT_KEYS(ctx) {
    const occurred = iso(), md = dateKey(occurred);
    const same = await Promise.all(Array.from({ length: 8 }, () => act(ctx, ELIGIBLE, V2_SQL, [occurred, md, uuid(1301), 'SYNTHETIC concurrent', items('SYNTHETIC c')])));
    const diff = await Promise.all(Array.from({ length: 8 }, (_, i) => act(ctx, ELIGIBLE, V2_SQL, [occurred, md, uuid(1310 + i), 'SYNTHETIC concurrent d' + i, items('SYNTHETIC cd')])));
    const sameRecords = await count(ctx, 'public.meal_records', `client_request_id='${uuid(1301)}'`);
    const sameAnchors = await count(ctx, 'retention_capture.detail_capture_anchors a', `a.resource_id in (select id from public.meal_records where client_request_id='${uuid(1301)}')`);
    const ids = new Set(same.filter(x => x.ok).map(x => x.rows[0].s.id));
    const diffAnchors = await count(ctx, 'retention_capture.detail_capture_anchors a', `a.resource_id in (select id from public.meal_records where client_request_id::text like '00000000-0000-4000-8000-0000000013_%' and client_request_id<>'${uuid(1301)}')`);
    return R(same.every(x => x.ok) && ids.size === 1 && sameRecords === 1 && sameAnchors === 1 && diff.every(x => x.ok) && diffAnchors === 8,
      { sameOk: same.filter(x => x.ok).length, distinctIds: ids.size, sameRecords, sameAnchors, diffOk: diff.filter(x => x.ok).length, diffAnchors, sameErrors: same.filter(x => !x.ok).slice(0, 2) });
  },
  async P10_LATER_WRITES_AND_LONG_TRANSACTION_KEEP_T0(ctx) {
    // (a) long transaction: T0 is the transaction timestamp, not the later INSERT/commit moment
    const c = await ctx.open('supabase_admin');
    let longT = null, rec = null;
    try {
      await ctx.g.query(c, 'begin');
      await ctx.g.query(c, "select set_config('request.jwt.claim.sub',$1,true)", [ELIGIBLE]);
      await ctx.g.query(c, 'set local role authenticated');
      longT = (await ctx.g.query(c, "select date_trunc('milliseconds',transaction_timestamp()) tx, clock_timestamp() c0")).rows[0];
      await ctx.g.query(c, 'select pg_sleep(1.3)');
      const a = (await ctx.g.query(c, V2_SQL, [iso(), dateKey(iso()), uuid(1401), 'SYNTHETIC long', items('SYNTHETIC long')])).rows[0].s;
      const b = (await ctx.g.query(c, V2_SQL, [iso(), dateKey(iso()), uuid(1402), 'SYNTHETIC long 2', items('SYNTHETIC long 2')])).rows[0].s;
      await ctx.g.query(c, 'commit'); rec = { a: a.id, b: b.id };
    } finally { await c.end().catch(() => {}); }
    const rows = await anchors(ctx, 'a.resource_id in ($1,$2)', [rec.a, rec.b]);
    const longOk = rows.length === 2 && rows.every(r => r.original_recorded_at.getTime() === longT.tx.getTime()) && (Date.now() - longT.c0.getTime()) >= 1000;
    // (b) later writes by an administrator do not change the anchor
    const before = JSON.stringify((await anchors(ctx, 'a.resource_id=$1', [rec.a]))[0].a);
    await ctx.g.query(ctx.su, "update public.meal_records set title='SYNTHETIC edited', updated_at=now()+interval '1 day', created_at=timestamptz '2001-01-01' where id=$1", [rec.a]);
    await ctx.g.query(ctx.su, "update public.meal_record_items set display_name_snapshot='SYNTHETIC edited item' where meal_record_id=$1", [rec.a]);
    const after = JSON.stringify((await anchors(ctx, 'a.resource_id=$1', [rec.a]))[0].a);
    return R(longOk && before === after, { longT, rows: rows.map(r => r.original_recorded_at), longOk, anchorUnchangedAfterRecordEdits: before === after });
  },
  async P11_EXISTING_DEFINITIONS_ACL_UNCHANGED(ctx) {
    const a = ctx.pre, b = ctx.post;
    const sameFn = JSON.stringify(a.fn) === JSON.stringify(b.fn) && a.fn.length === 8; // 6 names, two names have 1 overload each => count verified below
    const sameTable = JSON.stringify(a.table) === JSON.stringify(b.table) && JSON.stringify(a.policies) === JSON.stringify(b.policies) && JSON.stringify(a.columns) === JSON.stringify(b.columns);
    const added = b.triggers.filter(t => !a.triggers.some(x => x.tgname === t.tgname && x.rel === t.rel));
    const keptTriggers = a.triggers.every(t => b.triggers.some(x => JSON.stringify(x) === JSON.stringify(t)));
    return R(JSON.stringify(a.fn) === JSON.stringify(b.fn) && a.fn.length >= 6 && sameTable && keptTriggers && added.length === 1 && added[0].tgname === 'retention_capture_t0' && added[0].rel === 'meal_records' && added[0].tgenabled === 'O',
      { functions: a.fn.length, sameFn, sameTable, keptTriggers, added });
  },
  async P12_DELETE_AND_ACCOUNT_CASCADE_REMOVE_ANCHOR(ctx) {
    const e1 = await entry(ctx, 'v2', 1501);
    const id1 = e1.r.rows[0].s.id;
    const deleteCode = await ctx.g.query(ctx.su, 'delete from public.meal_records where id=$1', [id1]).then(() => null, e => e.code);
    // a disposable Auth user with a record, removed through the account cascade
    const user = uuid(920);
    await ctx.g.query(ctx.su, "insert into auth.users(id,email) values($1,'cap-cascade@synthetic.invalid')", [user]);
    await ctx.g.query(ctx.su, "insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key) values($1,'synthetic-cascade','Synthetic','Synthetic','BG')", [user]);
    await ctx.g.query(ctx.su, "insert into consumer_internal.preparation_cohort(user_id,profile_id,predecessor,captured_at) values($1,$2,'30268ee4de59a8d8855c1dcaa01795d2f1ce33b1',now())", [user, 'synthetic-cascade']);
    const rid = (await ctx.g.query(ctx.su, "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source) values($1,'lunch',now(),current_date,'manual') returning id", [user])).rows[0].id;
    const made = await count(ctx, 'retention_capture.detail_capture_anchors', `resource_id='${rid}'`);
    const accountDeleteCode = await ctx.g.query(ctx.su, 'delete from auth.users where id=$1', [user]).then(() => null, e => e.code);
    const left = await count(ctx, 'retention_capture.detail_capture_anchors');
    const orphans = (await ctx.g.query(ctx.su, 'select count(*)::int n from retention_capture.detail_capture_anchors a where not exists (select 1 from public.meal_records m where m.id=a.resource_id)')).rows[0].n;
    return R(deleteCode === null && accountDeleteCode === null && made === 1 && left === 0 && orphans === 0, { deleteCode, accountDeleteCode, made, left, orphans });
  },
  async P13_EXACT_POST_STATE_AND_CLEAN_ROLES(ctx) {
    const src = ctx.source;
    const own = /IS DISTINCT FROM '([0-9a-f]{64})'/.exec(src)?.[1];
    const pinned = !!own && src.split(own).length === 3 && (src !== captureSource() || own === CAP_POST_DIGEST);
    const q = (t, v) => ctx.g.query(ctx.su, t, v).then(r => r.rows);
    const roles = await q('select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit, rolpassword is null nopw from pg_authid where rolname in ($1,$2)', [CAP_OWNER, CAP_BUILDER]);
    const members = (await q('select count(*)::int n from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)', [CAP_OWNER, CAP_BUILDER]))[0].n;
    const owner = roles.find(r => r.rolname === CAP_OWNER);
    const flags = (await q("select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner)::text owner from pg_class c where c.relnamespace=$1::regnamespace and c.relkind='r'", [CAP_SCHEMA]));
    const fns = await q("select p.proname,pg_get_userbyid(p.proowner)::text owner,p.prosecdef,p.proconfig config,p.proacl::text acl from pg_proc p where p.pronamespace=$1::regnamespace order by 1", [CAP_SCHEMA]);
    const schemaAcl = (await q("select n.nspacl::text acl, pg_get_userbyid(n.nspowner)::text owner from pg_namespace n where n.nspname=$1", [CAP_SCHEMA]))[0];
    const tableAcl = (await q("select relacl::text acl from pg_class where oid='retention_capture.detail_capture_anchors'::regclass"))[0];
    const policy = await q("select polname,polcmd,polpermissive,(select array_agg(rolname) from pg_roles where oid=any(polroles)) roles from pg_policy where polrelid='retention_capture.detail_capture_anchors'::regclass");
    const cap = fns.find(f => f.proname === 'capture_meal_record_insert'), rej = fns.find(f => f.proname === 'reject_anchor_update');
    const execPublic = (await q("select count(*)::int n from pg_proc p where p.pronamespace=$1::regnamespace and has_function_privilege('public',p.oid,'EXECUTE')", [CAP_SCHEMA]))[0].n;
    const ok = pinned && owner && !owner.rolcanlogin && !owner.rolsuper && !owner.rolcreaterole && !owner.rolcreatedb && !owner.rolbypassrls && !owner.rolreplication && !owner.rolinherit && owner.nopw
      && roles.length === 1 && members === 0 && flags.length === 1 && flags[0].relrowsecurity && flags[0].relforcerowsecurity && flags[0].owner === CAP_OWNER
      && cap.owner === CAP_OWNER && cap.prosecdef === true && JSON.stringify(cap.config) === JSON.stringify(['search_path=""']) && rej.owner === CAP_OWNER && rej.prosecdef === false && JSON.stringify(rej.config) === JSON.stringify(['search_path=""'])
      && execPublic === 0 && schemaAcl.owner === CAP_OWNER && policy.length === 1 && policy[0].polcmd === 'a' && String(policy[0].roles) === '{' + CAP_OWNER + '}';
    return R(ok, { pinned, roles, members, flags, fns, schemaAcl, tableAcl, policy, execPublic, notices: ctx.apply.notices });
  },
  async P14_ACTOR_CONTEXT_LABEL_AND_AUTH_UID_PARITY(ctx) {
    const ins = async (setup, createdAt = null) => {
      const c = await ctx.open('supabase_admin');
      try {
        await ctx.g.query(c, 'begin');
        for (const [k, v] of setup) await ctx.g.query(c, 'select set_config($1,$2,true)', [k, v]);
        let authUid = null; try { await ctx.g.query(c, 'savepoint s'); authUid = (await ctx.g.query(c, 'select auth.uid()::text u')).rows[0].u; } catch { await ctx.g.query(c, 'rollback to savepoint s'); authUid = 'AUTH_UID_REJECTS_INPUT'; }
        const id = (await ctx.g.query(c, "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source,created_at) values($1,'lunch',now(),current_date,'manual',coalesce($2::timestamptz,now())) returning id", [ELIGIBLE, createdAt])).rows[0].id;
        await ctx.g.query(c, 'commit');
        const a = (await anchors(ctx, 'a.resource_id=$1', [id]))[0];
        return { context: a.a.capture_context, authUid, t0: a.original_recorded_at };
      } catch (e) { await c.query('rollback').catch(() => {}); return { error: e.message, code: e.code }; } finally { await c.end().catch(() => {}); }
    };
    const none = await ins([]);
    const other = await ins([['request.jwt.claim.sub', uuid(911)]]);
    const own = await ins([['request.jwt.claim.sub', ELIGIBLE]]);
    const jsonOnly = await ins([['request.jwt.claims', JSON.stringify({ sub: ELIGIBLE })]]);
    const badJson = await ins([['request.jwt.claims', '{not json']]);
    const badSub = await ins([['request.jwt.claim.sub', 'not-a-uuid']]);
    const lo = await nowBounds(ctx); const explicitCreatedAt = await ins([], '2001-01-01T00:00:00Z'); const hi = await nowBounds(ctx);
    const createdAtIgnored = !!explicitCreatedAt.t0 && within(explicitCreatedAt.t0, lo, hi);
    const ok = createdAtIgnored && !badSub.error && none.context === 'no_actor_claim' && other.context === 'no_actor_claim' && own.context === 'authenticated_actor' && jsonOnly.context === 'authenticated_actor' && badSub.context === 'no_actor_claim'
      && (badJson.context === 'no_actor_claim' || badJson.error) // auth.uid() itself may reject malformed claims; capture must not misreport an actor
      && own.authUid === ELIGIBLE && other.authUid === uuid(911) && badSub.authUid === 'AUTH_UID_REJECTS_INPUT'; // the local bootstrap auth.uid() reads only request.jwt.claim.sub; the JSON-claims fallback mirrors the platform function and is verified only at the Hosted stage
    return R(ok, { none, other, own, jsonOnly, badJson, badSub, explicitCreatedAt, createdAtIgnored });
  },
  async N11_NO_ENTITLEMENT_OR_TIER_SURFACE(ctx) {
    const cols = (await ctx.g.query(ctx.su, "select attname, format_type(atttypid,atttypmod) typ, attnotnull from pg_attribute where attrelid='retention_capture.detail_capture_anchors'::regclass and attnum>0 and not attisdropped order by attnum")).rows;
    const names = cols.map(c => c.attname);
    const src = (await ctx.g.query(ctx.su, "select string_agg(p.prosrc, E'\\n') s from pg_proc p where p.pronamespace='retention_capture'::regnamespace")).rows[0].s;
    const forbidden = /subscription|entitle|\btier\b|plan_code|retained_until|\bgrant\b|\bpaid\b|premium|occurred_at|meal_date|created_at|updated_at/i.test(src);
    return R(JSON.stringify(names) === JSON.stringify(['resource_id', 'owner_user_id', 'original_recorded_at', 'capture_kind', 'capture_contract_version', 'capture_context']) && cols.every(c => c.attnotnull) && !forbidden,
      { names, forbidden, srcPreview: src.slice(0, 120) });
  },
};
// P01 needs a database that has legacy rows BEFORE apply, so it has a dedicated runner.
export async function legacyNoBackfill(cl, source = captureSource()) {
  return cl.fresh('P01_LEGACY_ROWS_NO_BACKFILL', async ctx => {
    const seeded = [];
    for (let i = 0; i < 3; i++) seeded.push((await ctx.g.query(ctx.su, "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source,created_at) values($1,'lunch',$2::timestamptz,$3::date,'manual',$2::timestamptz) returning id", [ELIGIBLE, '2025-01-0' + (i + 1) + 'T12:00:00Z', '2025-01-0' + (i + 1)])).rows[0].id);
    await ctx.g.query(ctx.su, "insert into public.meal_record_items(meal_record_id,user_id,display_name_snapshot,occurred_at) select id,user_id,'SYNTHETIC legacy',occurred_at from public.meal_records");
    ctx.pre = await snapshot(ctx);
    ctx.apply = await tryApply(ctx, ctx.source);
    const anchorsAfter = ctx.apply.error ? null : await count(ctx, 'retention_capture.detail_capture_anchors');
    const rows = await count(ctx, 'public.meal_records');
    const body = ctx.source.replace(/--.*$/gm, '');
    const noWrites = !/\b(insert\s+into\s+(public|auth)|update\s+public|delete\s+from\s+public)\b/i.test(body.replace(/INSERT INTO retention_capture\.detail_capture_anchors[\s\S]*?;/i, ''));
    return R(!ctx.apply.error && anchorsAfter === 0 && rows === 3 && ctx.apply.boundary && noWrites, { seeded, anchorsAfter, rows, noWrites, apply: ctx.apply });
  }, { capture: false, source });
}

// ---- negative gates -----------------------------------------------------------------------------------------
const RUNTIME_ROLES = ['anon', 'authenticated', 'service_role', 'authenticator'];
const COUNT_TABLES = ['public.meal_records', 'public.meal_record_items', 'public.meal_analyses', 'public.meal_identification_finalizations', 'public.meal_corrections', 'retention_capture.detail_capture_anchors'];
async function counts(ctx) {
  const out = {};
  for (const t of COUNT_TABLES) out[t] = await count(ctx, t);
  out.plannedConverted = await count(ctx, 'public.planned_meals', "status='converted'");
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function persistedNone(ctx) {
  const q = (t, v) => ctx.g.query(ctx.su, t, v).then(r => r.rows[0]);
  const r = await q("select (select count(*)::int from pg_roles where rolname in ($1,$2)) roles, to_regnamespace('retention_capture') is not null schema, exists(select 1 from pg_trigger where tgname='retention_capture_t0') trigger, (select count(*)::int from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)) members", [CAP_OWNER, CAP_BUILDER]);
  return r;
}
const noneLeft = p => p.roles === 0 && !p.schema && !p.trigger && p.members === 0;

Object.assign(GATES, {
  async N01_RUNTIME_CANNOT_REACH_ANCHORS(ctx) {
    const e = await entry(ctx, 'v2', 2001);
    if (!e.r.ok) return R(false, { setup: e.r });
    const q = (t, v) => ctx.g.query(ctx.su, t, v).then(r => r.rows);
    const matrix = await q(`select r.rolname,
      has_schema_privilege(r.oid,'retention_capture','USAGE') usage, has_schema_privilege(r.oid,'retention_capture','CREATE') cr,
      has_table_privilege(r.oid,'retention_capture.detail_capture_anchors','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') tbl,
      (select coalesce(bool_or(has_function_privilege(r.oid,p.oid,'EXECUTE')),false) from pg_proc p where p.pronamespace='retention_capture'::regnamespace) fn,
      r.rolsuper, pg_has_role(r.oid,'pg_read_all_data','MEMBER') rd, pg_has_role(r.oid,'pg_write_all_data','MEMBER') wr
      from pg_roles r where r.rolname<>$1 order by 1`, [CAP_OWNER]);
    const leaks = matrix.filter(m => !m.rolsuper && !m.rd && !m.wr && (m.usage || m.cr || m.tbl || m.fn));
    const attempts = [];
    for (const role of RUNTIME_ROLES) {
      const row = { role };
      for (const [name, sql] of [['select', 'select * from retention_capture.detail_capture_anchors'], ['insert', "insert into retention_capture.detail_capture_anchors values('00000000-0000-4000-8000-000000009999','00000000-0000-4000-8000-000000000910',now(),'canonical_meal_insert','retention-capture-v1','authenticated_actor')"], ['update', "update retention_capture.detail_capture_anchors set capture_context='no_actor_claim'"], ['delete', 'delete from retention_capture.detail_capture_anchors'], ['truncate', 'truncate retention_capture.detail_capture_anchors'], ['call', 'select retention_capture.capture_meal_record_insert()']]) {
        const r = await act(ctx, ELIGIBLE, sql, [], { role });
        row[name] = r.ok ? 'OK' : r.code;
      }
      attempts.push(row);
    }
    const ownerSeesRows = (await act(ctx, null, 'select count(*)::int n from retention_capture.detail_capture_anchors', [], { role: CAP_OWNER, claims: false }));
    const stillOne = await count(ctx, 'retention_capture.detail_capture_anchors');
    const ok = leaks.length === 0 && attempts.every(a => Object.values(a).slice(1).every(v => v === '42501')) && ownerSeesRows.ok && ownerSeesRows.rows[0].n === 0 && stillOne === 1;
    return R(ok, { leaks, attempts, ownerSeesRows: ownerSeesRows.ok ? ownerSeesRows.rows[0] : ownerSeesRows, stillOne, excludedPredefinedOrSuperuser: matrix.filter(m => m.rolsuper || m.rd || m.wr).map(m => m.rolname) });
  },
  async N02_ANCHOR_CANNOT_BE_REWRITTEN(ctx) {
    const e = await entry(ctx, 'v2', 2101);
    const id = e.r.rows[0].s.id;
    const before = JSON.stringify((await anchors(ctx, 'a.resource_id=$1', [id]))[0].a);
    const attempts = {};
    for (const [name, sql] of [['t0', "update retention_capture.detail_capture_anchors set original_recorded_at=original_recorded_at+interval '1 millisecond'"], ['owner', "update retention_capture.detail_capture_anchors set owner_user_id='00000000-0000-4000-8000-000000000911'"], ['context', "update retention_capture.detail_capture_anchors set capture_context='no_actor_claim'"], ['resource', "update retention_capture.detail_capture_anchors set resource_id=gen_random_uuid()"]]) {
      const r = await act(ctx, null, sql, [], { role: 'supabase_admin', claims: false });
      attempts[name] = r.ok ? 'OK' : r.code;
    }
    // sealed owner under FORCE RLS has no UPDATE policy: zero rows touched, no error, nothing changes
    const asOwner = await act(ctx, null, "update retention_capture.detail_capture_anchors set capture_context='no_actor_claim' returning 1", [], { role: CAP_OWNER, claims: false });
    const after = JSON.stringify((await anchors(ctx, 'a.resource_id=$1', [id]))[0].a);
    // Disclosed administrator boundary (not claimed as secrecy): a superuser can still DELETE/TRUNCATE.
    const adminBoundary = await act(ctx, null, 'delete from retention_capture.detail_capture_anchors', [], { role: 'supabase_admin', claims: false });
    return R(Object.values(attempts).every(v => v === '23514') && asOwner.ok && asOwner.rows.length === 0 && before === after,
      { attempts, asOwner, unchanged: before === after, disclosedAdministratorBoundary: { superuserDeleteAllowed: adminBoundary.ok } });
  },
  async N03_CLIENT_INPUT_CANNOT_SET_T0_TIER_OR_PROVENANCE(ctx) {
    const base = counts(ctx); const c0 = await base;
    const forbidden = ['createdAt', 't0', 'originalRecordedAt', 'tier', 'retentionTier', 'grant', 'paid', 'provenance', 'retainedUntil'];
    const results = [];
    for (const key of forbidden) {
      const item = { displayName: 'SYNTHETIC forbidden', nutritionSource: 'manual', nutrition: { calories: 1 }, [key]: key === 'createdAt' ? '2001-01-01T00:00:00Z' : 'x' };
      const r = await act(ctx, ELIGIBLE, V1_SQL, [iso(), dateKey(iso()), 'SYNTHETIC forbidden', JSON.stringify([item])]);
      results.push({ key, code: r.ok ? 'OK' : r.code, message: r.ok ? null : r.message });
    }
    const c1 = await counts(ctx);
    const before = await nowBounds(ctx);
    const r = await act(ctx, ELIGIBLE, V2_SQL, [T_PAST, dateKey(T_PAST), uuid(2201), 'SYNTHETIC guc', items('SYNTHETIC guc')], { extraSet: [['tastkind.t0', T_PAST], ['app.t0', T_PAST], ['retention.t0', T_PAST], ['request.header.x_t0', T_PAST], ['request.headers', JSON.stringify({ 'x-t0': T_PAST })], ['tastkind.r0b_mode', 'x']] });
    const after = await nowBounds(ctx);
    const a = r.ok ? (await anchors(ctx, 'a.resource_id=$1', [r.rows[0].s.id]))[0] : null;
    const direct = await act(ctx, ELIGIBLE, "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,created_at) values($1,'lunch',now(),current_date,timestamptz '2001-01-01')", [ELIGIBLE]);
    return R(results.every(x => x.code === '22023') && same(c0, c1) && r.ok && a && within(a.original_recorded_at, before, after) && !direct.ok && direct.code === '42501',
      { results, unchangedCounts: same(c0, c1), gucCall: r.ok ? 'ok' : r, t0: a?.original_recorded_at, bounds: [before, after], directInsertCode: direct.ok ? 'OK' : direct.code });
  },
  async N04_PC2_AUTHORITY_DENIAL_LEAVES_NO_ANCHOR(ctx) {
    const c0 = await counts(ctx);
    const denied = [];
    denied.push(['v1-ineligible', await act(ctx, INELIGIBLE, V1_SQL, [iso(), dateKey(iso()), 'SYNTHETIC denied', items('x')])]);
    denied.push(['v2-ineligible', await act(ctx, INELIGIBLE, V2_SQL, [iso(), dateKey(iso()), uuid(2301), 'SYNTHETIC denied', items('x')])]);
    denied.push(['finalize-ineligible', await act(ctx, INELIGIBLE, FIN_SQL, [uuid(2302), iso(), dateKey(iso()), JSON.stringify(legacyFinalization())])]);
    denied.push(['anon', await act(ctx, null, V2_SQL, [iso(), dateKey(iso()), uuid(2303), 'SYNTHETIC denied', items('x')], { role: 'anon', claims: false })]);
    const direct = await ctx.g.query(ctx.su, "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source) values($1,'lunch',now(),current_date,'manual')", [INELIGIBLE]).then(() => 'OK', e => e.code);
    const c1 = await counts(ctx);
    await activateDisposableFixture(ctx.su); // PC-2 enforcement on: the legacy actor loses core eligibility
    const afterEnforce = await act(ctx, ELIGIBLE, V2_SQL, [iso(), dateKey(iso()), uuid(2304), 'SYNTHETIC denied', items('x')]);
    const c2 = await counts(ctx);
    return R(denied.every(([, r]) => !r.ok && ['42501', '28000'].includes(r.code)) && direct === '42501' && !afterEnforce.ok && afterEnforce.code === '42501' && same(c0, c1) && same(c0, c2),
      { denied: denied.map(([k, r]) => ({ k, code: r.ok ? 'OK' : r.code })), directSuperuserInsertForIneligible: direct, afterEnforce: afterEnforce.ok ? 'OK' : afterEnforce.code, c0, c1, c2 });
  },
  async N05_FAILURE_AFTER_RECORD_INSERT_ROLLS_BACK_RECORD_AND_ANCHOR(ctx) {
    const faultFn = "create function public.cap_fault() returns trigger language plpgsql as $$ begin raise exception 'CAP_SYNTHETIC_FAULT' using errcode='22012'; end $$";
    await ctx.g.query(ctx.su, faultFn);
    const results = [];
    const base = await counts(ctx);
    const trial = async (label, trigSql, dropSql, call) => {
      await ctx.g.query(ctx.su, trigSql);
      const r = await call();
      await ctx.g.query(ctx.su, dropSql);
      const c = await counts(ctx);
      results.push({ label, code: r.ok ? 'OK' : r.code, unchanged: same(base, c), counts: c });
    };
    await trial('v1-items-insert-fault', 'create trigger cap_f before insert on public.meal_record_items for each row execute function public.cap_fault()', 'drop trigger cap_f on public.meal_record_items', () => act(ctx, ELIGIBLE, V1_SQL, [iso(), dateKey(iso()), 'SYNTHETIC f', items('f')]));
    await trial('v2-request-id-writeback-fault', "create trigger cap_f before update on public.meal_records for each row when (new.client_request_id is not null) execute function public.cap_fault()", 'drop trigger cap_f on public.meal_records', () => act(ctx, ELIGIBLE, V2_SQL, [iso(), dateKey(iso()), uuid(2401), 'SYNTHETIC f', items('f')]));
    await trial('finalize-legacy-analysis-insert-fault', 'create trigger cap_f before insert on public.meal_analyses for each row execute function public.cap_fault()', 'drop trigger cap_f on public.meal_analyses', () => act(ctx, ELIGIBLE, FIN_SQL, [uuid(2402), iso(), dateKey(iso()), JSON.stringify(legacyFinalization())]));
    const request = uuid(2403);
    await ctx.g.query(ctx.su, "insert into public.meal_analyses(user_id,model_name,model_version,analysis_request_id,analysis_status) values($1,'synthetic','v0',$2,'completed')", [ELIGIBLE, request]);
    const base3 = await counts(ctx);
    await ctx.g.query(ctx.su, 'create trigger cap_f before update on public.meal_analyses for each row execute function public.cap_fault()');
    const occ3 = iso(); const v3 = await act(ctx, ELIGIBLE, FIN_SQL, [uuid(2404), occ3, dateKey(occ3), JSON.stringify(v3Finalization(request, occ3))]);
    await ctx.g.query(ctx.su, 'drop trigger cap_f on public.meal_analyses');
    const c3 = await counts(ctx);
    const unlinked = await count(ctx, 'public.meal_analyses', `analysis_request_id='${request}' and meal_record_id is null`);
    results.push({ label: 'finalize-v3-analysis-link-fault', code: v3.ok ? 'OK' : v3.code, unchanged: same(base3, c3), unlinked });
    // idempotency conflict after a successful save must not touch the anchor
    const e = await entry(ctx, 'v2', 2405);
    const idv = e.r.rows[0].s.id;
    const a1 = JSON.stringify((await anchors(ctx, 'a.resource_id=$1', [idv]))[0].a);
    const conflict = await act(ctx, ELIGIBLE, V2_SQL, [e.occurred, e.mealDate, e.key, 'SYNTHETIC DIFFERENT TITLE', items('different')]);
    const a2 = JSON.stringify((await anchors(ctx, 'a.resource_id=$1', [idv]))[0].a);
    results.push({ label: 'v2-key-conflict', code: conflict.ok ? 'OK' : conflict.code, anchorUnchanged: a1 === a2, anchors: await count(ctx, 'retention_capture.detail_capture_anchors') });
    const ok = results.slice(0, 2).every(x => x.code === '22012' && x.unchanged) && results[2].code !== 'OK' && results[2].unchanged && results[3].code !== 'OK' && results[3].unchanged && results[3].unlinked === 1 && results[4].code === '23505' && results[4].anchorUnchanged && results[4].anchors === 1;
    return R(ok, results);
  },
  async N06_ANCHOR_FAILURE_FAILS_THE_WHOLE_SAVE(ctx) {
    const faults = [
      ['check-false', 'alter table retention_capture.detail_capture_anchors add constraint cap_block check (false) not valid', 'alter table retention_capture.detail_capture_anchors drop constraint cap_block', '23514'],
      ['owner-insert-privilege-revoked', 'revoke insert on retention_capture.detail_capture_anchors from ' + CAP_OWNER, 'grant insert on retention_capture.detail_capture_anchors to ' + CAP_OWNER, '42501'],
      ['insert-policy-removed', 'drop policy capture_owner_insert on retention_capture.detail_capture_anchors', 'create policy capture_owner_insert on retention_capture.detail_capture_anchors as permissive for insert to ' + CAP_OWNER + ' with check (true)', '42501']
    ];
    const out = [];
    for (const [fi, [label, fault, undo, expect]] of faults.entries()) {
      const planned = await createPlanned(ctx, uuid(2500 + fi));
      const request = uuid(2520 + fi);
      await ctx.g.query(ctx.su, "insert into public.meal_analyses(user_id,model_name,model_version,analysis_request_id,analysis_status) values($1,'synthetic','v0',$2,'completed')", [ELIGIBLE, request]);
      const occ = iso(), md = dateKey(occ);
      const mk = () => ({
        v1: () => act(ctx, ELIGIBLE, V1_SQL, [occ, md, 'SYNTHETIC failing', items('x')]),
        v2: () => act(ctx, ELIGIBLE, V2_SQL, [occ, md, uuid(2530 + fi), 'SYNTHETIC failing', items('x')]),
        finalizeLegacy: () => act(ctx, ELIGIBLE, FIN_SQL, [uuid(2540 + fi), occ, md, JSON.stringify(legacyFinalization())]),
        finalizeV3: () => act(ctx, ELIGIBLE, FIN_SQL, [uuid(2550 + fi), occ, md, JSON.stringify(v3Finalization(request, occ))]),
        conversion: () => act(ctx, ELIGIBLE, "select public.convert_authenticated_planned_meal_v2($1::uuid,$2::uuid,$3::timestamptz,$4::timestamptz,'Asia/Taipei') s", [planned.id, uuid(2560 + fi), planned.updated_at, occ])
      });
      const withFixtures = await counts(ctx);
      await ctx.g.query(ctx.su, fault);
      const failing = {};
      for (const [k, call] of Object.entries(mk())) failing[k] = await call();
      await ctx.g.query(ctx.su, undo);
      const afterFailure = await counts(ctx);
      const unlinked = await count(ctx, 'public.meal_analyses', `analysis_request_id='${request}' and meal_record_id is null`);
      const plannedStill = await count(ctx, 'public.planned_meals', `id='${planned.id}' and status='planned' and converted_meal_record_id is null`);
      // The very same requests succeed once the fault is removed: the failure was caused by the capture fault, not by validation or poisoned idempotency.
      const recovered = {};
      for (const [k, call] of Object.entries(mk())) recovered[k] = await call();
      const afterRecovery = await counts(ctx);
      const finalizing = ['finalizeLegacy', 'finalizeV3'];
      out.push({
        label, expect,
        failureCodes: Object.fromEntries(Object.entries(failing).map(([k, v]) => [k, v.ok ? 'OK' : v.code])),
        recovered: Object.fromEntries(Object.entries(recovered).map(([k, v]) => [k, v.ok ? 'OK' : v.code + ' ' + v.message])),
        unchangedAfterFailure: same(withFixtures, afterFailure), unlinked, plannedStill,
        recordsAdded: afterRecovery['public.meal_records'] - afterFailure['public.meal_records'], anchorsAdded: afterRecovery['retention_capture.detail_capture_anchors'] - afterFailure['retention_capture.detail_capture_anchors'],
        pass: Object.entries(failing).every(([k, v]) => !v.ok && (finalizing.includes(k) || v.code === expect)) && same(withFixtures, afterFailure) && unlinked === 1 && plannedStill === 1
          && Object.values(recovered).every(v => v.ok) && afterRecovery['public.meal_records'] - afterFailure['public.meal_records'] === 5 && afterRecovery['retention_capture.detail_capture_anchors'] - afterFailure['retention_capture.detail_capture_anchors'] === 5
      });
    }
    return R(out.every(o => o.pass), out);
  },
  async N07_DIRECT_CALLS_BAD_VALUES_AND_MISUSE_REJECTED(ctx) {
    const e = await entry(ctx, 'v2', 2601);
    const id = e.r.rows[0].s.id;
    const su = (sql, v = []) => ctx.g.query(ctx.su, sql, v).then(() => 'OK', x => x.code);
    const call = await su('select retention_capture.capture_meal_record_insert()');
    const mk = (col, val) => `insert into retention_capture.detail_capture_anchors(resource_id,owner_user_id,original_recorded_at,capture_kind,capture_contract_version,capture_context) values(gen_random_uuid(),$1,${col === 't0' ? val : "now()::timestamptz(3)"},'${col === 'kind' ? val : 'canonical_meal_insert'}','${col === 'ver' ? val : 'retention-capture-v1'}','${col === 'ctx' ? val : 'authenticated_actor'}')`;
    const rows = {
      noParent: await su(mk('none', ''), [ELIGIBLE]),
      kind: await su(mk('kind', 'x'), [ELIGIBLE]),
      version: await su(mk('ver', 'x'), [ELIGIBLE]),
      context: await su(mk('ctx', 'tier=paid'), [ELIGIBLE]),
      micros: await su(mk('t0', "timestamptz '2026-01-01 00:00:00.123456+00'"), [ELIGIBLE]),
      infinity: await su(mk('t0', "'infinity'::timestamptz"), [ELIGIBLE]),
      duplicate: await su("insert into retention_capture.detail_capture_anchors select * from retention_capture.detail_capture_anchors where resource_id=$1", [id])
    };
    // the capture function attached to a different table or event refuses to run
    await ctx.g.query(ctx.su, 'create table public.cap_misuse(id uuid primary key default gen_random_uuid(), user_id uuid)');
    await ctx.g.query(ctx.su, 'create trigger cap_misuse_t after insert on public.cap_misuse for each row execute function retention_capture.capture_meal_record_insert()');
    const misuse = await su('insert into public.cap_misuse(user_id) values($1)', [ELIGIBLE]);
    const totalAfter = await count(ctx, 'retention_capture.detail_capture_anchors');
    return R(call === '0A000' && rows.noParent === '23503' && rows.kind === '23514' && rows.version === '23514' && rows.context === '23514' && rows.micros === '23514' && rows.infinity === '23514' && rows.duplicate === '23505' && misuse === '42501' && totalAfter === 1,
      { directCallBySuperuser: call, rows, misuse, totalAfter });
  },
  async N10_NO_PUBLICATION_SEQUENCE_OR_API_SURFACE(ctx) {
    const q = (t, v) => ctx.g.query(ctx.su, t, v).then(r => r.rows);
    const pubs = await q("select count(*)::int n from pg_publication_rel pr join pg_class c on c.oid=pr.prrelid where c.relnamespace='retention_capture'::regnamespace");
    const allTables = await q("select count(*)::int n from pg_publication where puballtables");
    const seq = await q("select count(*)::int n from pg_class where relnamespace='retention_capture'::regnamespace and relkind in ('S','v','m','f')");
    const rpc = await q("select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and pg_get_functiondef(p.oid) ilike '%retention_capture%'");
    const exposed = await q("select count(*)::int n from pg_namespace n where n.nspname='retention_capture' and (has_schema_privilege('anon',n.oid,'USAGE') or has_schema_privilege('authenticated',n.oid,'USAGE') or has_schema_privilege('service_role',n.oid,'USAGE'))");
    return R(pubs[0].n === 0 && allTables[0].n === 0 && seq[0].n === 0 && rpc[0].n === 0 && exposed[0].n === 0, { publicationRelations: pubs[0].n, allTablesPublications: allTables[0].n, sequencesViewsOther: seq[0].n, publicFunctionsReferencingCapture: rpc[0].n, apiRolesWithUsage: exposed[0].n });
  }
});

// ---- migration-level negative gates (each runs against a database where the capture migration is NOT yet applied) ----
async function expectRefusal(cl, label, prepare, expectPrefix, { actorUser = 'postgres', source, settings = [], preexisting = false, srcOverride = captureSource() } = {}) {
  return cl.fresh(label, async ctx => {
    await prepare(ctx);
    const before = await persistedNone(ctx);
    const members0 = JSON.stringify((await ctx.g.query(ctx.su, "select roleid,member,grantor from pg_auth_members where roleid::regrole::text !~ '^(authenticated|anon|service_role)' order by 1,2,3")).rows);
    const runner = actorUser === 'postgres' ? ctx.op : await ctx.open(actorUser);
    const notices = [];
    runner.on('notice', m => notices.push(m.message));
    let error = null;
    try { await ctx.g.query(runner, source ?? ctx.source); } catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await runner.query('ROLLBACK').catch(() => {}); }
    const after = await persistedNone(ctx);
    const members1 = JSON.stringify((await ctx.g.query(ctx.su, "select roleid,member,grantor from pg_auth_members where roleid::regrole::text !~ '^(authenticated|anon|service_role)' order by 1,2,3")).rows);
    const stateUnchanged = JSON.stringify(before) === JSON.stringify(after) && members0 === members1;
    const pass = !!error && error.message.startsWith(expectPrefix) && stateUnchanged && (preexisting || noneLeft(after)) && !notices.includes('CAP_DDL_BOUNDARY') && !notices.includes('CAP_DDL_BOUNDARY');
    return { label, expectPrefix, error, boundaryNoticeBeforeFailure: notices.includes('CAP_DDL_BOUNDARY'), before, after, stateUnchanged, pass };
  }, { capture: false, settings, source: srcOverride });
}
const expectRefusalWith = (source, cl, label, prepare, expectPrefix, opts = {}) => expectRefusal(cl, label, prepare, expectPrefix, { ...opts, srcOverride: source });
export async function migrationRefusals(cl, source = captureSource()) {
  const cases = [];
  cases.push(await expectRefusalWith(source, cl, 'N08a-actor-createrole-not-db-owner', async ctx => { ctx.extraRoles.add('cap_creator'); await ctx.g.query(ctx.su, 'create role cap_creator login createrole'); await ctx.g.query(ctx.su, 'grant connect on database ' + ctx.name + ' to cap_creator'); }, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actorUser: 'cap_creator' }));
  for (const role of ['pgbouncer', 'supabase_auth_admin', 'dashboard_user', 'supabase_read_only_user', 'supabase_etl_admin']) {
    cases.push(await expectRefusalWith(source, cl, 'N08b-marker-role-' + role, async ctx => { ctx.extraRoles.add(role); await ctx.g.query(ctx.su, `create role ${role} nologin`); }, 'CAP_PLATFORM_APPLY_NOT_AUTHORIZED role:' + role));
  }
  cases.push(await expectRefusalWith(source, cl, 'N08c-marker-history-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema supabase_migrations'); }, 'CAP_PLATFORM_APPLY_NOT_AUTHORIZED schema:supabase_migrations'));
  cases.push(await expectRefusalWith(source, cl, 'N08d-marker-supautils-setting', async () => {}, 'CAP_PLATFORM_APPLY_NOT_AUTHORIZED setting:supautils', { settings: ["supautils.reserved_roles = 'cap_probe'"] }));
  for (const guc of ['tastkind.r0b_target', 'tastkind.r0b_manifest', 'tastkind.r0b_fixture_nonce']) {
    cases.push(await expectRefusalWith(source, cl, 'N08e-binding-setting-' + guc.split('.')[1], async ctx => { await ctx.op.query(`select set_config('${guc}','x',false)`); }, 'CAP_BINDINGS_NOT_SUPPORTED'));
  }
  cases.push(await expectRefusalWith(source, cl, 'N08f-preexisting-capture-role', async ctx => { ctx.extraRoles.add(CAP_OWNER); await ctx.g.query(ctx.su, `create role ${CAP_OWNER} nologin`); }, 'CAP_CAPTURE_PRESENT', { preexisting: true }));
  cases.push(await expectRefusalWith(source, cl, 'N08g-preexisting-capture-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema retention_capture'); }, 'CAP_CAPTURE_PRESENT', { preexisting: true }));
  cases.push(await expectRefusalWith(source, cl, 'N08h-preexisting-capture-trigger', async ctx => { await ctx.g.query(ctx.su, 'create function public.cap_noop() returns trigger language plpgsql as $$ begin return null; end $$'); await ctx.g.query(ctx.su, 'create trigger retention_capture_t0 after insert on public.meal_records for each row execute function public.cap_noop()'); }, 'CAP_CAPTURE_PRESENT', { preexisting: true }));
  cases.push(await expectRefusalWith(source, cl, 'N08i-unapproved-predefined-data-member', async ctx => { ctx.extraRoles.add('cap_reader'); await ctx.g.query(ctx.su, 'create role cap_reader nologin'); await ctx.g.query(ctx.su, 'grant pg_read_all_data to cap_reader'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await expectRefusalWith(source, cl, 'N08j-runtime-reaches-management-identity', async ctx => { await ctx.g.query(ctx.su, 'grant postgres to authenticated with inherit false, set false'); ctx.cleanups.push('revoke postgres from authenticated'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await expectRefusalWith(source, cl, 'N08k-missing-meal-records', async ctx => { await ctx.g.query(ctx.su, 'alter table public.meal_records rename to meal_records_hidden'); }, 'CAP_MEAL_RECORDS_MISSING'));
  return R(cases.every(c => c.pass), cases);
}

const FAULT_ANCHORS = [
  ['builder-created', 'CREATE ROLE consumer_retention_capture_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;'],
  ['owner-granted', "EXECUTE pg_catalog.format('GRANT consumer_retention_capture_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);\nEND $$;"],
  ['anchor-table-built', 'CREATE TRIGGER anchor_immutable BEFORE UPDATE ON retention_capture.detail_capture_anchors\n FOR EACH ROW EXECUTE FUNCTION retention_capture.reject_anchor_update();'],
  ['meal-records-trigger-created', 'CREATE TRIGGER retention_capture_t0 AFTER INSERT ON public.meal_records\n FOR EACH ROW EXECUTE FUNCTION retention_capture.capture_meal_record_insert();'],
  ['builder-dropped', 'DROP ROLE consumer_retention_capture_builder;']
];
export async function migrationRollbackAndDrift(cl, installSource = captureSource()) {
  const out = [];
  for (const [label, anchor] of FAULT_ANCHORS) {
    const source = installSource;
    if (source.split(anchor).length !== 2) throw Error('SETUP_FAULT_ANCHOR ' + label);
    const mutant = source.replace(anchor, () => anchor + '\nSELECT 1/0;');
    out.push(await cl.fresh('N09-fault-' + label, async ctx => {
      const before = JSON.stringify((await ctx.g.query(ctx.su, 'select roleid,member,grantor from pg_auth_members order by 1,2,3')).rows);
      const a = await tryApply(ctx, mutant);
      const p = await persistedNone(ctx);
      const after = JSON.stringify((await ctx.g.query(ctx.su, 'select roleid,member,grantor from pg_auth_members order by 1,2,3')).rows);
      // a later save in the same database must not find a half-installed capture
      const save = await act(ctx, ELIGIBLE, V2_SQL, [iso(), dateKey(iso()), uuid(2700), 'SYNTHETIC after failed apply', items('x')]);
      return { label, error: a.error, boundary: a.boundary, persisted: p, membershipsUnchanged: before === after, saveStillWorks: save.ok, pass: a.error?.code === '22012' && a.boundary && noneLeft(p) && before === after && save.ok };
    }, { capture: false, source: installSource }));
  }
  const drifts = [
    ['role-created', async ctx => { ctx.extraRoles.add('cap_drift_role'); await ctx.g.query(ctx.su, 'create role cap_drift_role nologin'); }],
    ['public-table-acl', async ctx => { await ctx.g.query(ctx.su, 'grant select on public.restaurants to anon'); }],
    ['membership', async ctx => { await ctx.g.query(ctx.su, 'grant anon to service_role'); ctx.cleanups.push('revoke anon from service_role'); }]
  ];
  for (const [label, drift] of drifts) {
    out.push(await cl.fresh('N09-drift-' + label, async ctx => {
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
      return { label, paused, error, persisted: p, ddlAttempts: attempts, pass: paused && !!error && error.message.startsWith('CAP_POST_GUARD_DRIFT') && attempts > 0 && noneLeft(p) };
    }, { capture: false, settings: ["tastkind_probe.pause = 'on'"], source: installSource }));
  }
  return R(out.every(o => o.pass), out);
}

// ---- App save-call failure recognition (real TypeScript sources, transpiled in-process; no UI, no network) ------
function loadTs(entry) {
  const ts = createRequire(path.join(ROOT, 'package.json'))('typescript');
  const cache = new Map();
  const context = vm.createContext({ Date, Intl, console, Promise, setTimeout, clearTimeout, crypto: globalThis.crypto, Error, JSON, Map, Set, Array, Object, Number, String, Boolean, RegExp, Math, Symbol, URL, TextEncoder, TextDecoder });
  const resolve = (from, request) => {
    const base = path.resolve(path.dirname(from), request);
    for (const c of [base + '.ts', path.join(base, 'index.ts')]) if (fs.existsSync(c)) return c;
    throw Error('APP_MODULE_UNRESOLVED ' + request + ' from ' + from);
  };
  const load = file => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(request => {
      if (!request.startsWith('.')) throw Error('APP_EXTERNAL_IMPORT ' + request);
      return load(resolve(file, request));
    }, module, module.exports);
    return module.exports;
  };
  return load(entry);
}
const FEATURES = path.join(ROOT, 'apps/mobile/features');
// PostgREST maps SQLSTATE classes to HTTP status; this table models that mapping (it is NOT a measurement of a remote service).
const statusFor = code => (code === '42501' ? 403 : code === '28000' ? 401 : /^23(503|505)$/.test(code ?? '') ? 409 : /^(22|23|P0)/.test(code ?? '') ? 400 : 500);
async function appSave(ctx, label, { failing }) {
  const writeRepo = loadTs(path.join(FEATURES, 'consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts'));
  const runtimeMod = loadTs(path.join(FEATURES, 'consumer-runtime/consumerMealWriteRuntime.ts'));
  const storeMod = loadTs(path.join(FEATURES, 'consumer-runtime/consumerMealWriteOperationStore.ts'));
  const names = ['p_meal_type', 'p_occurred_at', 'p_meal_date', 'p_client_request_id', 'p_timezone', 'p_title', 'p_note', 'p_source', 'p_items'];
  const cast = { p_meal_type: 'public.meal_type', p_occurred_at: 'timestamptz', p_meal_date: 'date', p_client_request_id: 'uuid', p_timezone: 'text', p_title: 'text', p_note: 'text', p_source: 'public.meal_source_type', p_items: 'jsonb' };
  const calls = [];
  const mealClient = {
    async rpc(fn, args) {
      calls.push(fn);
      const keys = names.filter(k => k in args);
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}::${cast[k]}`).join(',')}) s`;
      const r = await act(ctx, ELIGIBLE, sql, keys.map(k => typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      if (r.ok) return { data: r.rows[0].s, error: null };
      return { data: null, error: { code: r.code, message: r.message, status: statusFor(r.code) } };
    }
  };
  const authPort = { getCurrentSession: async () => ({ ok: true, value: { user: { userId: ELIGIBLE } } }) };
  const repository = new writeRepo.SupabaseConsumerMealRecordWriteRepository({ authPort, mealClient, writeEnabled: true });
  const service = { createCurrentUserMealRecord: input => repository.createCurrentUserMealRecord(input) };
  // The App's real operation store over a controlled, per-call in-memory storage (no device storage involved).
  const memory = new Map();
  const operationStore = new storeMod.ConsumerMealWriteOperationStore({ getItem: async k => memory.get(k) ?? null, setItem: async (k, v) => { memory.set(k, v); }, removeItem: async k => { memory.delete(k); } });
  const runtime = new runtimeMod.ConsumerMealWriteRuntime({ service, operationStore, clock: { now: () => new Date() }, uuidFactory: () => uuid(failing ? 2800 : 2801) });
  await runtime.setActor('actor-key', 1);
  const state = await runtime.submit({ actorKey: 'actor-key', actorGeneration: 1, timezone: 'Asia/Taipei' }, {
    selectedMealPeriod: 'lunch', mealName: 'SYNTHETIC app save', originalDetectedName: null, portion: '1 份', nutrition: { calories: 100 }, isSelfCooked: false, wasUserCorrected: false
  });
  return { label, state: { status: state.status, errorCode: state.errorCode, pending: state.pending, mealRecordId: state.mealRecordId, mealDataRevision: state.mealDataRevision }, rpcCalls: calls };
}
Object.assign(GATES, {
  async N12_APP_SAVE_CALL_RECOGNISES_CAPTURE_FAILURE(ctx) {
    const ok = await appSave(ctx, 'control-success', { failing: false });
    const recordsAfterOk = await count(ctx, 'public.meal_records'), anchorsAfterOk = await count(ctx, 'retention_capture.detail_capture_anchors');
    const faults = [
      ['anchor-check-false', 'alter table retention_capture.detail_capture_anchors add constraint cap_block check (false) not valid', 'alter table retention_capture.detail_capture_anchors drop constraint cap_block'],
      ['anchor-insert-denied', 'revoke insert on retention_capture.detail_capture_anchors from ' + CAP_OWNER, 'grant insert on retention_capture.detail_capture_anchors to ' + CAP_OWNER],
      ['anchor-table-missing', 'alter table retention_capture.detail_capture_anchors rename to anchors_hidden', 'alter table retention_capture.anchors_hidden rename to detail_capture_anchors']
    ];
    const failed = [];
    for (const [label, fault, undo] of faults) {
      await ctx.g.query(ctx.su, fault);
      failed.push(await appSave(ctx, label, { failing: true }));
      await ctx.g.query(ctx.su, undo);
    }
    const recordsAfterFail = await count(ctx, 'public.meal_records');
    const notSuccess = failed.every(f => f.state.status !== 'succeeded' && f.state.mealRecordId === null && f.state.errorCode !== null && f.state.mealDataRevision === 0);
    return R(ok.state.status === 'succeeded' && ok.state.mealRecordId && recordsAfterOk === 1 && anchorsAfterOk === 1 && notSuccess && recordsAfterFail === 1 && failed.every(f => f.rpcCalls.length === 1 && f.rpcCalls[0] === 'create_current_user_meal_record_v2'),
      { ok, failed, recordsAfterOk, anchorsAfterOk, recordsAfterFail, httpStatusMappingIsModelled: true });
  }
});

// ---- inventory / frozen proof ---------------------------------------------------------------------------------
function git(args) {
  const p = child.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 64e6 });
  if (p.status) throw Error(`GIT_READ ${args.join(' ')} ${p.stderr}`);
  return p.stdout;
}
export function frozenProof() {
  const entries = git(['ls-tree', '-r', BASELINE_COMMIT]).trim().split('\n').map(l => { const [m, p] = l.split('\t'); const [mode, , blob] = m.split(' '); return { path: p, mode, blob }; });
  const index = new Map(git(['ls-files', '--stage']).trim().split('\n').map(l => { const [m, p] = l.split('\t'); const [mode, blob, stage] = m.split(' '); return [p, { mode, blob, stage }]; }));
  // Only the exact, complete meal-save recovery successor (record in the persistence smoke) exempts its 27 paths;
  // a capture-state or invalid tree keeps every check below for them. The capture state itself is unchanged.
  const successor = recoverySuccessorState(git);
  const exempt = new Set(successor.exempt ? successor.paths : []);
  const violations = [...successor.violations];
  for (const e of entries) {
    if (ALLOWED_PATHS.includes(e.path) || exempt.has(e.path)) continue;
    const i = index.get(e.path);
    if (!i || i.mode !== e.mode || i.blob !== e.blob || i.stage !== '0') violations.push(e.path + ':index');
  }
  for (const p of git(['diff', BASELINE_COMMIT, '--name-only']).trim().split('\n').filter(Boolean)) if (!ALLOWED_PATHS.includes(p) && !exempt.has(p)) violations.push(p + ':tracked');
  for (const p of git(['ls-files', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean)) if (!ALLOWED_PATHS.includes(p)) violations.push(p + ':untracked');
  const added = [...index.keys()].filter(p => !entries.some(e => e.path === p));
  for (const p of added) if (!ALLOWED_PATHS.includes(p) && !exempt.has(p)) violations.push(p + ':added');
  const wt = ALLOWED_PATHS.filter(p => fs.existsSync(path.join(ROOT, p)));
  return { baseline: BASELINE_COMMIT, trackedAtBaseline: entries.length, added: added.filter(p => ALLOWED_PATHS.includes(p)), violations, allowed: ALLOWED_PATHS, present: wt, recoverySuccessor: { state: successor.state, violations: successor.violations } };
}
export function inventoryProof() {
  const dir = path.join(ROOT, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter(n => n.endsWith('.sql')).sort();
  const baselineFiles = git(['ls-tree', '--name-only', BASELINE_COMMIT, 'supabase/migrations/']).trim().split('\n').map(p => path.basename(p)).sort();
  const changed = baselineFiles.filter(n => sha(fs.readFileSync(path.join(dir, n))) !== sha(spawnBlob(`supabase/migrations/${n}`)));
  const newest = files.at(-1);
  return { migrationCount: files.length, baselineCount: baselineFiles.length, last: newest, newPaths: files.filter(n => !baselineFiles.includes(n)), changedBaselineMigrations: changed, timestampLaterThanAll: files.filter(n => n !== CAPTURE_MIGRATION).every(n => n < CAPTURE_MIGRATION), captureSha256: sha(fs.readFileSync(path.join(dir, CAPTURE_MIGRATION))), pinnedByPersistenceSmoke: CAPTURE_SUCCESSOR_SHA256 };
}
function spawnBlob(p) { const r = child.spawnSync('git', ['show', `${BASELINE_COMMIT}:${p}`], { cwd: ROOT, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, maxBuffer: 64e6 }); if (r.status) throw Error('GIT_BLOB ' + p); return r.stdout; }
Object.assign(GATES, {
  async F01_FROZEN_SCOPE_AND_INVENTORY() {
    const frozen = frozenProof(), inv = inventoryProof();
    return R(frozen.violations.length === 0 && frozen.trackedAtBaseline === 3345 && inv.migrationCount === 144 && inv.baselineCount === 143 && inv.changedBaselineMigrations.length === 0 && same(inv.newPaths, [CAPTURE_MIGRATION]) && inv.timestampLaterThanAll && inv.captureSha256 === CAPTURE_SUCCESSOR_SHA256, { frozen, inv });
  }
});

// ---- runner ------------------------------------------------------------------------------------------------------
export const POSITIVE_IDS = ['P01_LEGACY_ROWS_NO_BACKFILL', 'P02_ENTRY_V1_DIRECT', 'P03_ENTRY_V2', 'P04_ENTRY_FINALIZE_LEGACY', 'P05_ENTRY_FINALIZE_V3_EXISTING_ANALYSIS', 'P06_ENTRY_PLANNED_CONVERSION', 'P07_BACKFILLED_MEAL_TIME_DOES_NOT_MOVE_T0', 'P08_REPLAY_KEEPS_RECORD_AND_T0', 'P09_CONCURRENT_SAME_AND_DIFFERENT_KEYS', 'P10_LATER_WRITES_AND_LONG_TRANSACTION_KEEP_T0', 'P11_EXISTING_DEFINITIONS_ACL_UNCHANGED', 'P12_DELETE_AND_ACCOUNT_CASCADE_REMOVE_ANCHOR', 'P13_EXACT_POST_STATE_AND_CLEAN_ROLES', 'P14_ACTOR_CONTEXT_LABEL_AND_AUTH_UID_PARITY'];
export const NEGATIVE_IDS = ['N01_RUNTIME_CANNOT_REACH_ANCHORS', 'N02_ANCHOR_CANNOT_BE_REWRITTEN', 'N03_CLIENT_INPUT_CANNOT_SET_T0_TIER_OR_PROVENANCE', 'N04_PC2_AUTHORITY_DENIAL_LEAVES_NO_ANCHOR', 'N05_FAILURE_AFTER_RECORD_INSERT_ROLLS_BACK_RECORD_AND_ANCHOR', 'N06_ANCHOR_FAILURE_FAILS_THE_WHOLE_SAVE', 'N07_DIRECT_CALLS_BAD_VALUES_AND_MISUSE_REJECTED', 'N08_MIGRATION_PRECONDITIONS_FAIL_CLOSED', 'N09_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT', 'N10_NO_PUBLICATION_SEQUENCE_OR_API_SURFACE', 'N11_NO_ENTITLEMENT_OR_TIER_SURFACE'];
export const SUPPLEMENTARY_IDS = ['S01_ENTRY_FINALIZE_V2_RECORD_TIMING', 'N12_APP_SAVE_CALL_RECOGNISES_CAPTURE_FAILURE', 'F01_FROZEN_SCOPE_AND_INVENTORY'];
export async function runGate(cl, id, source = captureSource()) {
  if (id === 'P01_LEGACY_ROWS_NO_BACKFILL') return legacyNoBackfill(cl, source);
  if (id === 'N08_MIGRATION_PRECONDITIONS_FAIL_CLOSED') return migrationRefusals(cl, source);
  if (id === 'N09_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT') return migrationRollbackAndDrift(cl, source);
  if (id === 'F01_FROZEN_SCOPE_AND_INVENTORY') return GATES[id]();
  return cl.fresh(id, ctx => GATES[id](ctx), { source });
}
export async function runSmoke({ bin, out }) {
  const rec = recorder(out);
  const results = []; let blocked = null;
  const cl = await captureCluster(bin, rec);
  try {
    for (const id of [...POSITIVE_IDS, ...NEGATIVE_IDS, ...SUPPLEMENTARY_IDS]) {
      let r;
      try { r = await runGate(cl, id); }
      catch (e) { blocked = { id, message: String(e.message), stack: e.stack }; rec.write('check-' + id + '.json', { id, status: 'BLOCKED', error: blocked.message }); console.log('CHECK ' + id + ' BLOCKED'); break; }
      rec.write('check-' + id + '.json', { id, pass: r.pass, observed: r.observed });
      results.push({ id, pass: r.pass });
      console.log('CHECK ' + id + ' ' + (r.pass ? 'PASS' : 'FAIL'));
    }
  } finally { await cl.stop(); }
  const failed = results.filter(r => !r.pass).map(r => r.id);
  const status = blocked ? 'BLOCKED' : failed.length ? 'FAIL' : 'PASS';
  rec.write('result.json', { status, exitCode: blocked ? 2 : failed.length ? 1 : 0, positives: POSITIVE_IDS.length, negatives: NEGATIVE_IDS.length, supplementary: SUPPLEMENTARY_IDS.length, checks: results, failed, blocked });
  return status === 'PASS' ? 0 : blocked ? 2 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try { code = await runSmoke(options()); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
