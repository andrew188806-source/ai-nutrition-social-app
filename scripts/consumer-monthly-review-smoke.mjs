#!/usr/bin/env node
// R1-A owner-private monthly nutrition review v1 (Owner Q6 phase 1) — local smoke. No Hosted, no deploy, no enablement.
// PG gates share ONE disposable PostgreSQL 17 cluster: the database "postgres" receives the FULL predecessor chain (every migration
// of this tree except R1-A, sorted, with the installer rule of the accepted full-chain harnesses) plus synthetic owners created before
// the PC-2 foundation (preparation cohort => core eligible while the rollout is not enforcing). Each run clones it (CREATE DATABASE
// ... TEMPLATE postgres) and applies the R1-A migration as the ordinary installer (or a mutant for the mutation harness).
// Node gates (no cluster): app flags / strict mapper / service / view model through a TS transpile loader, static scope, and the
// exact successor record. Judgement: setup failure => BLOCKED (exit 2); only an explicit returned observation can pass or fail.
// usage: node scripts/consumer-monthly-review-smoke.mjs --pg-bin <pg17 bin> --out <dir>     (TK_GATES: comma-separated full ids)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import child from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as P from './consumer-retention-persistence-smoke.mjs';

export const ROOT = P.ROOT;
export const R1A_MIGRATION = '20261030120000_consumer_monthly_nutrition_review.sql';
const require_ = createRequire(path.join(ROOT, 'package.json'));
const ts = require_('typescript');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const RETENTION_SUPERUSER = /consumer_retention_entitlement_authority|consumer_retention_acquisition_record|consumer_retention_registry_seal|consumer_retention_billing_fact_ingest|consumer_retention_acquisition_resolve_sweep/;
const PC2 = '20260930174028_consumer_pc2_onboarding_consent_foundation.sql';

// ---- synthetic owners (ids are fixed; zones are the profile timezone at creation) ----
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const USERS = {
  A: { id: uid(101), zone: 'Asia/Taipei' }, B: { id: uid(102), zone: 'America/Los_Angeles' }, C: { id: uid(103), zone: 'Pacific/Auckland' },
  D: { id: uid(104), zone: 'Asia/Taipei' }, E: { id: uid(105), zone: 'Europe/London' }, F: { id: uid(106), zone: 'Asia/Taipei' },
  G: { id: uid(107), zone: 'Asia/Taipei' }, H: { id: uid(108), zone: 'Asia/Taipei' }, I: { id: uid(109), zone: 'Asia/Taipei' },
  K: { id: uid(111), zone: 'Asia/Taipei' }, L: { id: uid(112), zone: 'Asia/Taipei' }, M: { id: uid(113), zone: 'Asia/Taipei' }, N: { id: uid(114), zone: 'Asia/Taipei' },
  O: { id: uid(115), zone: 'Asia/Taipei' }, Q: { id: uid(116), zone: 'Asia/Taipei' }
};

// ---- independent oracle (Intl; does not use the migration or the app code) ----
function parts(iso, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { month: `${p.year}-${p.month}`, day: `${p.year}-${p.month}-${p.day}` };
}
const NUTRIENTS = [['calories', 'kcal'], ['protein', null], ['carbohydrates', 'carbs'], ['fat', null], ['fiber', null]];
function valueState(snapshot, key, alias) {
  let x = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot[key] : undefined;
  if ((x === undefined || x === null) && alias && snapshot && typeof snapshot === 'object') x = snapshot[alias];
  if (x === undefined || x === null) return { state: 'missing' };
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? { state: 'valid', value: x } : { state: 'invalid' };
}
const r2 = v => Math.round(v * 100) / 100;
export function oracleMonth(meals, monthKey, zone) {
  const inMonth = meals.filter(m => !m.deleted && parts(m.at, zone).month === monthKey);
  const items = inMonth.flatMap(m => m.items);
  const days = new Set(inMonth.map(m => parts(m.at, zone).day)).size;
  const nutrients = {};
  for (const [key, alias] of NUTRIENTS) {
    let total = 0, valid = 0, missing = 0, invalid = 0;
    for (const item of items) { const s = valueState(item.n, key, alias); if (s.state === 'valid') { total += s.value * (item.r ?? 1); valid++; } else if (s.state === 'missing') missing++; else invalid++; }
    nutrients[key] = { total: valid > 0 ? r2(total) : null, averagePerRecordedDay: valid > 0 && days > 0 ? r2(total / days) : null, validItems: valid, missingItems: missing, invalidItems: invalid };
  }
  return { hasRecords: inMonth.length > 0, recordedDays: days, mealCount: inMonth.length, itemCount: items.length, nutrients };
}
function sameMonth(got, want) {
  if (!got || !want.hasRecords) return !!got && got.hasRecords === false;
  if (got.recordedDays !== want.recordedDays || got.mealCount !== want.mealCount || got.itemCount !== want.itemCount) return false;
  return NUTRIENTS.every(([k]) => { const g = got.nutrients?.[k], w = want.nutrients[k]; return g && (w.total === null ? g.total === null : Math.abs(g.total - w.total) < 0.006) && (w.averagePerRecordedDay === null ? g.averagePerRecordedDay === null : Math.abs(g.averagePerRecordedDay - w.averagePerRecordedDay) < 0.006) && g.validItems === w.validItems && g.missingItems === w.missingItems && g.invalidItems === w.invalidItems; });
}

// ---- cluster / template / runs ----
export async function prepareCluster(bin, out) {
  const rec = P.recorder(path.join(out, 'cluster'));
  const cl = await P.cluster(bin, rec);
  try {
    const su = await cl.connect('postgres', 'supabase_admin');
    // As the accepted full-chain harnesses: real Supabase Auth fields absent from the legacy stub, the standard auth.jwt(), BYPASSRLS for the postgres installer.
    await rec.query(su, "alter table auth.users add column phone text unique,add column phone_confirmed_at timestamptz,add column banned_until timestamptz,add column deleted_at timestamptz,add column email_confirmed_at timestamptz,add column is_anonymous boolean not null default false;alter role postgres bypassrls;");
    await rec.query(su, "create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;");
    const db = await cl.connect('postgres', 'postgres');
    const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
    if (!files.includes(R1A_MIGRATION) || files.at(-1) !== R1A_MIGRATION) throw Error('SETUP_R1A_MIGRATION_NOT_LAST');
    const applied = [];
    for (const n of files.slice(0, -1)) {
      if (n === PC2) for (const [k, u] of Object.entries(USERS)) {
        await rec.query(su, 'insert into auth.users(id,email) values($1,$2)', [u.id, `r1a-${k.toLowerCase()}@synthetic.invalid`]);
        await rec.query(db, "insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key,timezone) values($1,$2,$3,$3,'BG',$4)", [u.id, `r1a-${k.toLowerCase()}`, `R1A ${k}`, u.zone]);
      }
      const by = RETENTION_SUPERUSER.test(n) ? su : db;
      try { await by.query(fs.readFileSync(path.join(ROOT, 'supabase/migrations', n), 'utf8')); } catch (e) { throw Error('SETUP_MIGRATION ' + n + ' ' + e.code + ' ' + e.message); }
      applied.push(n);
    }
    rec.write('template.json', { predecessors: applied.length, last: applied.at(-1), r1a: R1A_MIGRATION, total: files.length });
    // CREATE DATABASE ... TEMPLATE postgres needs no other session on the template: close this harness's two sessions and the cluster's own admin session.
    await su.end(); await db.end(); await cl.admin.end();
    return { cl, rec, files, predecessors: applied.length };
  } catch (e) { await cl.stop().catch(() => {}); throw e; }
}
let runSeq = 0;
export async function openRun(env, migrationSql) {
  const name = `r1a_run_${++runSeq}`;
  const t1 = await env.cl.connect('template1', 'supabase_admin');
  // 55006 = an automatic session (autovacuum) is briefly on the template: bounded retry of this setup step only.
  for (let attempt = 1; ; attempt++) { try { await t1.query(`create database ${name} owner postgres template postgres`); break; } catch (e) { if (e.code !== '55006' || attempt >= 10) throw Error('SETUP_TEMPLATE_CLONE ' + e.code + ' ' + e.message); await new Promise(r => setTimeout(r, 1000)); } }
  await t1.end();
  const db = await env.cl.connect(name, 'postgres'), su = await env.cl.connect(name, 'supabase_admin');
  try { await db.query(migrationSql); } catch (e) { const err = Error('SETUP_R1A_APPLY ' + e.code + ' ' + e.message); err.apply = { code: e.code, message: e.message }; throw err; }
  return { name, db, su, env };
}
export async function closeRun(run) { for (const c of [run.db, run.su]) { try { await c.end(); } catch { /* closing only */ } } }

async function asUser(run, userId, sql = 'select public.get_current_user_monthly_nutrition_review() v', values = [], role = 'authenticated') {
  const c = await run.env.cl.connect(run.name, 'supabase_admin');
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    if (userId) await c.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [userId, JSON.stringify({ sub: userId, role })]);
    const r = await c.query(sql, values); await c.query('commit');
    return { ok: true, value: r.rows[0]?.v ?? null, rows: r.rows };
  } catch (e) { await c.query('rollback').catch(() => {}); return { ok: false, code: e.code, message: e.message }; } finally { await c.end().catch(() => {}); }
}
async function windowMonths(run, zone) {
  const r = await run.su.query("select to_char(timezone($1, now()), 'YYYY-MM') cur", [zone]);
  const [y, m] = r.rows[0].cur.split('-').map(Number), out = [];
  for (let i = 5; i >= 0; i--) { const n = y * 12 + m - 1 - i; out.push(`${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`); }
  return out;
}
async function monthStart(run, zone, monthKey) { return (await run.su.query("select timezone($1, ($2||'-01')::timestamp) s", [zone, monthKey])).rows[0].s.toISOString(); }
const plus = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();
const DAY = 86400000, HOUR = 3600000;
async function addMeal(run, user, at, items, { deviceZone = user.zone, deviceDate = null } = {}) {
  const meal = (await run.su.query("insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,timezone,title) values($1,'lunch',$2,coalesce($3::date,(timezone($4,$2::timestamptz))::date),$4,'r1a') returning id", [user.id, at, deviceDate, deviceZone])).rows[0].id;
  const ids = [];
  for (const it of items) ids.push((await run.su.query('insert into public.meal_record_items(meal_record_id,user_id,display_name_snapshot,nutrition_snapshot,occurred_at,timezone,consumed_ratio) values($1,$2,$3,$4::jsonb,$5,$6,$7) returning id', [meal, user.id, 'r1a item', JSON.stringify(it.n), at, deviceZone, it.r ?? 1])).rows[0].id);
  return { id: meal, at, items, itemIds: ids, deleted: false };
}
async function storedRows(run, userId) { return (await run.su.query('select month_key, revision, computed_at, source_digest from consumer_review.monthly_nutrition_reviews where user_id=$1 order by month_key', [userId])).rows; }
const byMonth = v => Object.fromEntries((v?.months ?? []).map(m => [m.monthKey, m]));

// ---- gates ----
const R = (pass, observed) => ({ pass: !!pass, observed });
export const GATES = {};

GATES.P01_FULL_CHAIN_APPLIES_AND_EXACT_POST_STATE = async run => {
  const q = async s => (await run.su.query(s)).rows;
  const fn = (await q("select p.oid::regprocedure::text sig, p.prosecdef definer, p.pronargs args, coalesce(p.proacl::text,'') acl, p.proconfig cfg from pg_proc p where p.proname='get_current_user_monthly_nutrition_review'"));
  const pub = await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%monthly%review%')");
  const schemaAcl = (await q("select coalesce(nspacl::text,'') acl from pg_namespace where nspname='consumer_review'"))[0]?.acl;
  const tables = await q("select c.relname, c.relrowsecurity rls, coalesce(c.relacl::text,'') acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='consumer_review' and c.relkind='r' order by 1");
  const internal = await q("select p.proname, coalesce(p.proacl::text,'') acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='consumer_review' order by 1");
  const runtime = /(^|[{,])(anon|authenticated|authenticator|service_role|)=/;
  const mealTriggers = await q("select count(*)::int n from pg_trigger t where t.tgrelid in ('public.meal_records'::regclass,'public.meal_record_items'::regclass) and not t.tgisinternal");
  const rows = await q('select (select count(*) from consumer_review.monthly_nutrition_reviews)::int r, (select count(*) from consumer_review.report_timezone_bindings)::int b');
  const retention = await q("select count(*)::int n, md5(string_agg(n.nspname||'.'||c.relname||coalesce(c.relacl::text,''),'|' order by n.nspname, c.relname)) d from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname like 'retention%'");
  const tpl = await run.env.cl.connect('postgres', 'supabase_admin');
  let tplRet, tplMealTriggers; try {
    tplRet = (await tpl.query("select count(*)::int n, md5(string_agg(n.nspname||'.'||c.relname||coalesce(c.relacl::text,''),'|' order by n.nspname, c.relname)) d from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname like 'retention%'")).rows[0];
    tplMealTriggers = (await tpl.query("select count(*)::int n from pg_trigger t where t.tgrelid in ('public.meal_records'::regclass,'public.meal_record_items'::regclass) and not t.tgisinternal")).rows[0].n;
  } finally { await tpl.end(); }
  const f = fn[0];
  const ok = run.env.predecessors === run.env.files.length - 1 && fn.length === 1 && f.definer && f.args === 0 && /authenticated=X\//.test(f.acl) && !/(^|[{,])(anon|authenticator|service_role|)=/.test(f.acl)
    && pub[0].n === 1 && !runtime.test(schemaAcl) && tables.length === 2 && tables.every(t => t.rls && !runtime.test(t.acl)) && internal.length === 4 && internal.every(p => !runtime.test(p.acl))
    && mealTriggers[0].n === tplMealTriggers && rows[0].r === 0 && rows[0].b === 0 && retention[0].n === tplRet.n && retention[0].d === tplRet.d;
  return R(ok, { files: run.env.files.length, predecessors: run.env.predecessors, fn, pub: pub[0].n, schemaAcl, tables, internal, mealTriggers: [mealTriggers[0].n, tplMealTriggers], rows: rows[0], retention: [retention[0], tplRet] });
};

GATES.P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE = async run => {
  const u = USERS.A, months = await windowMonths(run, u.zone), cur = months[5], older = months[3];
  const s0 = await monthStart(run, u.zone, cur), s2 = await monthStart(run, u.zone, older);
  const meals = [];
  meals.push(await addMeal(run, u, plus(s0, 2 * HOUR), [{ n: { calories: 500, protein: 20, carbohydrates: 60, fat: 10, fiber: 5 } }, { n: { calories: 200, protein: 8, carbohydrates: 30, fat: 4 }, r: 0.5 }]));
  meals.push(await addMeal(run, u, plus(s0, 3 * HOUR), [{ n: { kcal: 300, carbs: 40, protein: 12, fat: 9, fiber: null } }]));
  meals.push(await addMeal(run, u, plus(s0, DAY + 5 * HOUR), [{ n: { calories: 'abc', protein: -1, carbohydrates: 25, fat: 3, fiber: 2 } }, { n: {} }]));
  meals.push(await addMeal(run, u, plus(s0, 2 * DAY + 4 * HOUR), []));
  meals.push(await addMeal(run, u, plus(s2, 10 * HOUR), [{ n: { calories: 650, protein: 30, carbohydrates: 70, fat: 20 }, r: 0.25 }]));
  const res = await asUser(run, u.id);
  if (!res.ok) return R(false, { call: res });
  const got = byMonth(res.value), want = Object.fromEntries(months.map(m => [m, oracleMonth(meals, m, u.zone)]));
  const stored = await storedRows(run, u.id);
  const ok = months.every(m => sameMonth(got[m], want[m])) && months.every(m => got[m].inProgress === (m === cur))
    && res.value.score === null && !('grade' in res.value) && res.value.months.every(m => !('score' in m) && (!m.hasRecords || m.averageDenominator === 'recorded_days'))
    && res.value.window?.scope === 'latest_six_months_interface' && res.value.window?.entitlementWiring === 'not_implemented'
    && res.value.reportTimezone?.timezone === u.zone && res.value.reportTimezone?.bindingVersion === 1
    && stored.map(s => s.month_key).join() === [older, cur].join() && stored.every(s => s.revision === 1);
  return R(ok, { months, got: res.value, want, stored: stored.map(s => ({ month: s.month_key, revision: s.revision })) });
};

GATES.P03_COMPLETE_MONTH_BEYOND_100_RECORDS = async run => {
  const u = USERS.D, months = await windowMonths(run, u.zone), m1 = months[4], s1 = await monthStart(run, u.zone, m1);
  const meals = [];
  for (let i = 0; i < 130; i++) meals.push(await addMeal(run, u, plus(s1, (i % 20) * DAY + (i % 5) * HOUR + HOUR), [{ n: { calories: 10, protein: 1 } }]));
  const res = await asUser(run, u.id);
  const got = res.ok ? byMonth(res.value)[m1] : null, want = oracleMonth(meals, m1, u.zone);
  return R(res.ok && got?.mealCount === 130 && sameMonth(got, want), { got, want, call: res.ok ? 'ok' : res });
};

GATES.P04_REPORT_ZONE_MONTH_BOUNDARIES_DST_AND_DEVICE_ZONE = async run => {
  const u = USERS.C, months = await windowMonths(run, u.zone), meals = [], boundaries = [];
  for (const m of [months[4], months[5]]) {
    const s = await monthStart(run, u.zone, m);
    boundaries.push({ month: m, start: s });
    meals.push(await addMeal(run, u, plus(s, -15 * 60000), [{ n: { calories: 100 } }]));
    meals.push(await addMeal(run, u, plus(s, 15 * 60000), [{ n: { calories: 1000 } }], { deviceZone: 'America/New_York' }));
  }
  // UTC offset of the zone at each window month start (seconds): more than one distinct value means a DST transition lies inside the window.
  const zoneOffsets = (await run.su.query("select m, extract(epoch from ((m||'-01')::timestamp - timezone('UTC', timezone($1,(m||'-01')::timestamp))))::int s from unnest($2::text[]) m", [u.zone, months])).rows;
  const res = await asUser(run, u.id);
  if (!res.ok) return R(false, { call: res });
  const got = byMonth(res.value);
  const ok = months.every(m => sameMonth(got[m], oracleMonth(meals, m, u.zone)));
  return R(ok, { months, boundaries, zoneOffsets, dstTransitionInsideWindow: new Set(zoneOffsets.map(r => r.s)).size > 1, got: months.map(m => got[m]), want: months.map(m => oracleMonth(meals, m, u.zone)) });
};

GATES.P05_BINDING_FIXED_APPEND_ONLY_AND_ACCOUNT_DELETION_CASCADE = async run => {
  const u = USERS.E, months = await windowMonths(run, u.zone), s = await monthStart(run, u.zone, months[5]);
  await addMeal(run, u, plus(s, 23 * HOUR + 30 * 60000), [{ n: { calories: 400 } }]);
  const first = await asUser(run, u.id);
  await run.su.query("update public.consumer_profiles set timezone='Asia/Tokyo' where user_id=$1", [u.id]);
  const before = await storedRows(run, u.id);
  const second = await asUser(run, u.id);
  const after = await storedRows(run, u.id);
  const upd = await run.su.query("update consumer_review.report_timezone_bindings set timezone='Asia/Tokyo' where user_id=$1", [u.id]).then(() => null, e => ({ code: e.code, message: e.message }));
  const del = await run.su.query('delete from consumer_review.report_timezone_bindings where user_id=$1', [u.id]).then(() => null, e => ({ code: e.code, message: e.message }));
  const bindings = (await run.su.query('select binding_version, timezone from consumer_review.report_timezone_bindings where user_id=$1', [u.id])).rows;
  const cascade = await run.su.query('delete from auth.users where id=$1', [u.id]).then(() => null, e => ({ code: e.code, message: e.message }));
  const left = (await run.su.query('select (select count(*) from consumer_review.report_timezone_bindings where user_id=$1)::int b, (select count(*) from consumer_review.monthly_nutrition_reviews where user_id=$1)::int r', [u.id])).rows[0];
  const ok = first.ok && second.ok && first.value.reportTimezone.timezone === 'Europe/London' && second.value.reportTimezone.timezone === 'Europe/London'
    && JSON.stringify(first.value.months) === JSON.stringify(second.value.months) && JSON.stringify(before) === JSON.stringify(after) && before.length === 1
    && upd?.code === '23514' && /REPORT_TIMEZONE_BINDING_IMMUTABLE/.test(upd.message) && del?.code === '23514' && bindings.length === 1 && bindings[0].timezone === 'Europe/London'
    && cascade === null && left.b === 0 && left.r === 0;
  return R(ok, { first: first.ok ? first.value.reportTimezone : first, second: second.ok ? second.value.reportTimezone : second, before, after, upd, del, bindings, cascade, left });
};

GATES.P06_REVISION_IDEMPOTENT_LATE_CORRECTION_AND_REMOVAL = async run => {
  const u = USERS.I, months = await windowMonths(run, u.zone), cur = months[5], old = months[3];
  const s0 = await monthStart(run, u.zone, cur), s2 = await monthStart(run, u.zone, old);
  const meals = [await addMeal(run, u, plus(s0, 5 * HOUR), [{ n: { calories: 300, protein: 10 } }]), await addMeal(run, u, plus(s0, DAY + 5 * HOUR), [{ n: { calories: 200 } }]), await addMeal(run, u, plus(s2, 6 * HOUR), [{ n: { calories: 800, fat: 30 } }])];
  const steps = [];
  const call = async label => { const r = await asUser(run, u.id); const rows = await storedRows(run, u.id); steps.push({ label, ok: r.ok, rows: rows.map(x => ({ m: x.month_key, rev: x.revision, at: x.computed_at.toISOString() })), months: r.ok ? byMonth(r.value) : r }); return r; };
  await call('first'); await call('repeat-unchanged');
  // late correction of an older month while its details still exist
  await run.su.query("update public.meal_record_items set nutrition_snapshot='{\"calories\":900,\"fat\":31}'::jsonb, updated_at=now() + interval '1 second' where id=$1", [meals[2].itemIds[0]]);
  meals[2].items[0].n = { calories: 900, fat: 31 };
  await call('late-correction');
  // an added item and a removed (soft-deleted) record in the current month
  await run.su.query("insert into public.meal_record_items(meal_record_id,user_id,display_name_snapshot,nutrition_snapshot,occurred_at,timezone,consumed_ratio) values($1,$2,'late item','{\"calories\":50}'::jsonb,$3,$4,1)", [meals[0].id, u.id, meals[0].at, u.zone]);
  meals[0].items.push({ n: { calories: 50 } });
  await run.su.query('update public.meal_records set deleted_at=now(), updated_at=now() + interval \'2 second\' where id=$1', [meals[1].id]); meals[1].deleted = true;
  await call('added-item-and-soft-delete');
  // every record of the older month removed: its row stays (never deleted), recomputed to empty
  await run.su.query('update public.meal_records set deleted_at=now(), updated_at=now() + interval \'3 second\' where id=$1', [meals[2].id]); meals[2].deleted = true;
  const last = await call('older-month-emptied');
  const rev = (i, m) => steps[i].rows.find(x => x.m === m)?.rev;
  const at = (i, m) => steps[i].rows.find(x => x.m === m)?.at;
  const ok = steps.every(s => s.ok) && rev(0, cur) === 1 && rev(0, old) === 1 && rev(1, cur) === 1 && rev(1, old) === 1 && at(1, cur) === at(0, cur) && at(1, old) === at(0, old)
    && rev(2, old) === 2 && rev(2, cur) === 1 && rev(3, cur) === 2 && rev(3, old) === 2 && rev(4, old) === 3 && rev(4, cur) === 2
    && sameMonth(byMonth(last.value)[cur], oracleMonth(meals, cur, u.zone))
    && steps[2].months?.[old]?.nutrients?.calories?.total === 900 && steps[2].months?.[old]?.nutrients?.fat?.total === 31
    && byMonth(last.value)[old]?.hasRecords === true && byMonth(last.value)[old]?.mealCount === 0 && byMonth(last.value)[old]?.nutrients?.calories?.averagePerRecordedDay === null;
  return R(ok, { steps });
};

GATES.P07_PARALLEL_CALLS_ONE_CONSISTENT_RESULT = async run => {
  const u = USERS.H, months = await windowMonths(run, u.zone), s = await monthStart(run, u.zone, months[5]);
  for (let i = 0; i < 5; i++) await addMeal(run, u, plus(s, i * HOUR + HOUR), [{ n: { calories: 120, protein: 6 } }]);
  const results = await Promise.all(Array.from({ length: 8 }, () => asUser(run, u.id)));
  const bindings = (await run.su.query('select count(*)::int n from consumer_review.report_timezone_bindings where user_id=$1', [u.id])).rows[0].n;
  const rows = await storedRows(run, u.id);
  const payloads = new Set(results.map(r => r.ok ? JSON.stringify(r.value.months) : 'ERR:' + r.code));
  return R(results.every(r => r.ok) && bindings === 1 && rows.length === 1 && rows[0].revision === 1 && payloads.size === 1, { bindings, rows: rows.map(r => ({ m: r.month_key, rev: r.revision })), errors: results.filter(r => !r.ok), distinctPayloads: payloads.size });
};

// ---- R1A-SNAPSHOT-01: one source snapshot per refresh. Writers and reviews share no lock, so every interleaving below uses separate connections, an observed lock wait or an observed completion, and real COMMITs ----
// Test-only advisory key: the product never takes it. Only the two-statement sensitivity mutant waits on it, between its two reads.
export const STATEMENT_BARRIER = 1830212302;
const REVIEW_SQL = 'select public.get_current_user_monthly_nutrition_review() v';
const connectRun = run => run.env.cl.connect(run.name, 'supabase_admin');
const pause = ms => new Promise(r => setTimeout(r, ms));
const zoneDate = (at, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
async function writeMeal(run, user, at, calories) {
  const r = await asUser(run, user.id, "select public.create_current_user_meal_record('lunch',$1::timestamptz,$2::date,$3,'r1a snapshot',null,'manual',$4::jsonb) v", [at, zoneDate(at, user.zone), user.zone, JSON.stringify([{ displayName: 'r1a snapshot item', nutrition: { calories } }])]);
  if (!r.ok) throw Error(`SETUP_WRITER ${r.code} ${r.message}`);
}
// Independent witness: one REPEATABLE READ read of the details; the digest text is rebuilt here, not by the migration.
async function witness(run, user, monthKey) {
  const c = await connectRun(run);
  try {
    await c.query('begin isolation level repeatable read');
    const rows = (await c.query(`select m.id::text mid, to_char(m.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') mu, to_char(m.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') mo, i.id::text iid, to_char(i.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US') iu, i.consumed_ratio::text ratio, i.nutrition_snapshot::text nutrition from public.meal_records m left join public.meal_record_items i on i.meal_record_id = m.id where m.user_id = $1 and m.deleted_at is null and m.occurred_at >= timezone($2, ($3||'-01')::timestamp) and m.occurred_at < timezone($2, ($3||'-01')::date + interval '1 month') order by m.id, i.id`, [user.id, user.zone, monthKey])).rows;
    await c.query('commit');
    const meals = new Map(); let calories = 0, items = 0;
    for (const r of rows) {
      if (!meals.has(r.mid)) meals.set(r.mid, { ...r, list: [] });
      if (!r.iid) continue;
      meals.get(r.mid).list.push(`${r.iid}@${r.iu}@${r.ratio}@${r.nutrition}`); items++;
      const n = JSON.parse(r.nutrition); if (typeof n.calories === 'number' && n.calories >= 0) calories += n.calories * Number(r.ratio);
    }
    const payload = `consumer-monthly-review-v1|1|${user.zone}|` + [...meals.values()].map(m => `${m.mid}@${m.mu}@${m.mo}[${m.list.join(';')}]`).join(',');
    return { digest: sha(payload), calories, meals: meals.size, items };
  } finally { await c.end().catch(() => {}); }
}
async function reviewRow(run, user, monthKey) { return (await run.su.query('select * from consumer_review.monthly_nutrition_reviews where user_id=$1 and month_key=$2', [user.id, monthKey])).rows[0] ?? null; }
const sameSource = (row, w) => !!row && row.source_digest === w.digest && Number(row.calories_total) === w.calories && row.meal_count === w.meals && row.item_count === w.items;
async function beginAuthenticated(c, user) {
  await c.query('begin isolation level read committed');
  await c.query('set local role authenticated');
  await c.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [user.id, JSON.stringify({ sub: user.id, role: 'authenticated' })]);
}
const blockers = async (observer, pid) => (await observer.query('select pg_blocking_pids($1) b', [pid])).rows[0].b;
// A review inside its own open transaction, while `change` commits from another connection. `hold` takes the scheduling lock and returns
// a release function; `mustWait` means the review has to be seen waiting on that lock (else the schedule was not established: setup, never a verdict).
async function interleave(run, user, { hold, mustWait, change }) {
  const holder = await connectRun(run), worker = await connectRun(run), observer = await connectRun(run);
  let pending = null, done = null, release = null;
  try {
    release = await hold(holder);
    await beginAuthenticated(worker, user);
    pending = worker.query(REVIEW_SQL).then(r => { done = { ok: true, value: r.rows[0].v }; }, e => { done = { ok: false, code: e.code, message: e.message }; });
    const deadline = Date.now() + 20000; let waited = false;
    while (!waited && !done && Date.now() < deadline) { if ((await blockers(observer, worker.processID)).includes(holder.processID)) waited = true; else await pause(50); }
    if (!waited && !done) throw Error('SETUP_SCHEDULE_NOT_ESTABLISHED review neither waited nor finished');
    if (mustWait && !waited) throw Error('SETUP_SCHEDULE_NOT_ESTABLISHED review did not wait on the held row');
    await change();
    if (waited && !(await blockers(observer, worker.processID)).includes(holder.processID)) throw Error('SETUP_SCHEDULE_LOST review left the barrier before the change committed');
    await release(); release = null;
    await pending;
    if (!done.ok) throw Error(`SETUP_REVIEW_FAILED ${done.code} ${done.message}`);
    await worker.query('commit');
    return { waited, response: done.value };
  } finally {
    if (release) await release().catch(() => {});
    if (pending) await pending.catch(() => {});
    await worker.query('rollback').catch(() => {});
    for (const c of [holder, worker, observer]) await c.end().catch(() => {});
  }
}
const holdRow = (user, monthKey) => async c => {
  await c.query('begin');
  await c.query('select 1 from consumer_review.monthly_nutrition_reviews where user_id=$1 and month_key=$2 for update', [user.id, monthKey]);
  return () => c.query('commit');
};
const holdBarrier = user => async c => {
  await c.query('select pg_advisory_lock($1::int, hashtext($2::text))', [STATEMENT_BARRIER, user.id]);
  return () => c.query('select pg_advisory_unlock($1::int, hashtext($2::text))', [STATEMENT_BARRIER, user.id]);
};
// D0 stored as revision 1; D1 committed and not yet reviewed; the schedule then commits D2. Either coherent state is a legal outcome, D1 digest with D2 aggregates is not; a replay
// must then reach D2 with exactly the revisions the facts require, and a further replay must change nothing.
async function snapshotCase(run, user, monthKey, { hold, mustWait, change }) {
  const s = await monthStart(run, user.zone, monthKey);
  await writeMeal(run, user, plus(s, 12 * HOUR), 100);
  const first = await asUser(run, user.id);
  if (!first.ok) throw Error(`SETUP_FIRST_REVIEW ${first.code}`);
  await writeMeal(run, user, plus(s, 36 * HOUR), 50);
  const d0 = await reviewRow(run, user, monthKey), d1 = await witness(run, user, monthKey);
  let d2 = null;
  const ran = await interleave(run, user, { hold, mustWait, change: async () => { await change(s); d2 = await witness(run, user, monthKey); } });
  const stored = await reviewRow(run, user, monthKey), after = await witness(run, user, monthKey);
  const outcome = sameSource(stored, d1) ? 'D1' : sameSource(stored, d2) ? 'D2' : 'MIXED';
  const answered = byMonth(ran.response)[monthKey], responseMatches = !!answered && answered.mealCount === stored?.meal_count && Number(answered.nutrients?.calories?.total ?? 0) === Number(stored?.calories_total);
  const replay1 = await asUser(run, user.id), r1 = await reviewRow(run, user, monthKey);
  const replay2 = await asUser(run, user.id), r2 = await reviewRow(run, user, monthKey);
  const pass = outcome !== 'MIXED' && responseMatches && d0.revision === 1 && stored.revision === 2 && after.digest === d2.digest && replay1.ok && replay2.ok && sameSource(r1, d2)
    && r1.revision === stored.revision + (outcome === 'D1' ? 1 : 0) && (outcome === 'D1' || r1.computed_at.getTime() === stored.computed_at.getTime())
    && r2.revision === r1.revision && r2.computed_at.getTime() === r1.computed_at.getTime() && r2.source_digest === r1.source_digest;
  const brief = r => r && { revision: r.revision, digest: r.source_digest, calories: r.calories_total, meals: r.meal_count, items: r.item_count, computedAt: r.computed_at };
  return { pass, outcome, waited: ran.waited, responseMatches, d0: brief(d0), d1, d2, stored: brief(stored), after, replay1: brief(r1), replay2: brief(r2) };
}

GATES.P08_WRITER_AND_REFRESH_SHARE_ONE_SOURCE_SNAPSHOT = async run => {
  const addFifty = user => s => writeMeal(run, user, plus(s, 60 * HOUR), 50);
  const l = USERS.L, lm = (await windowMonths(run, l.zone))[5];
  const rowHeld = await snapshotCase(run, l, lm, { hold: holdRow(l, lm), mustWait: true, change: addFifty(l) });
  const m = USERS.M, mm = (await windowMonths(run, m.zone))[5];
  const betweenReads = await snapshotCase(run, m, mm, { hold: holdBarrier(m), mustWait: false, change: addFifty(m) });
  return R(rowHeld.pass && betweenReads.pass, { rowHeld, betweenReads });
};

GATES.P09_CORRECTION_EMPTIED_MONTH_RESEND_AND_WRITER_STORM = async run => {
  const n = USERS.N, nm = (await windowMonths(run, n.zone))[3];
  const correction = await snapshotCase(run, n, nm, { hold: holdRow(n, nm), mustWait: true, change: async () => { await run.su.query("update public.meal_record_items set nutrition_snapshot='{\"calories\":300}'::jsonb, updated_at=now() + interval '1 second' where user_id=$1", [n.id]); } });
  const o = USERS.O, om = (await windowMonths(run, o.zone))[4];
  const emptied = await snapshotCase(run, o, om, { hold: holdRow(o, om), mustWait: true, change: async () => { await run.su.query("update public.meal_records set deleted_at=now(), updated_at=now() + interval '1 second' where user_id=$1", [o.id]); } });
  // Normal concurrency: each round commits one authenticated writer alongside three reviews. A stored row may lag one round, never mix two.
  const q = USERS.Q, qm = (await windowMonths(run, q.zone))[5], s = await monthStart(run, q.zone, qm), rounds = [];
  let prior = null, reviewsOk = true, everyRoundCoherent = true;
  for (let i = 0; i < 6; i++) {
    const [, ...reviews] = await Promise.all([writeMeal(run, q, plus(s, (i + 1) * 3 * HOUR), 10 * (i + 1)), asUser(run, q.id), asUser(run, q.id), asUser(run, q.id)]);
    const w = await witness(run, q, qm), row = await reviewRow(run, q, qm);
    const coherent = sameSource(row, w) || (prior ? sameSource(row, prior) : row === null);
    reviewsOk &&= reviews.every(r => r.ok); everyRoundCoherent &&= coherent;
    rounds.push({ round: i, coherent, digest: row?.source_digest ?? null, revision: row?.revision ?? null, witness: w }); prior = w;
  }
  const settled = await asUser(run, q.id), r1 = await reviewRow(run, q, qm), replay = await asUser(run, q.id), r2 = await reviewRow(run, q, qm);
  // Safe resend: the same request id twice is one meal, so the second review writes nothing.
  const at = plus(s, 30 * HOUR), request = '5c0d0c5e-7b1f-4d55-9f0a-2d6f0b4f7a11', resendSql = "select public.create_current_user_meal_record_v2('lunch',$1::timestamptz,$2::date,$3::uuid,$4::text,'r1a resend',null,'manual',$5::jsonb) v", resendArgs = [at, zoneDate(at, q.zone), request, q.zone, JSON.stringify([{ displayName: 'r1a resend', nutrition: { calories: 75 } }])];
  const sent = await asUser(run, q.id, resendSql, resendArgs); await asUser(run, q.id); const r3 = await reviewRow(run, q, qm), w3 = await witness(run, q, qm);
  const resent = await asUser(run, q.id, resendSql, resendArgs); await asUser(run, q.id); const r4 = await reviewRow(run, q, qm), w4 = await witness(run, q, qm);
  if (!sent.ok || !resent.ok) throw Error(`SETUP_RESEND ${sent.code ?? resent.code}`);
  const storm = settled.ok && replay.ok && reviewsOk && everyRoundCoherent && sameSource(r1, prior) && r2.revision === r1.revision && r2.computed_at.getTime() === r1.computed_at.getTime() && r1.revision <= 7;
  const resend = sameSource(r3, w3) && w3.digest === w4.digest && r4.revision === r3.revision && r4.computed_at.getTime() === r3.computed_at.getTime();
  return R(correction.pass && emptied.pass && storm && resend, { correction, emptied, rounds, finalRevision: r1?.revision, storm, resend });
};

GATES.N01_OWNER_ISOLATION_AND_NO_OWNER_PARAMETER = async run => {
  const a = USERS.A, b = USERS.B, months = await windowMonths(run, b.zone), s = await monthStart(run, b.zone, months[5]);
  const mine = [await addMeal(run, b, plus(s, 9 * HOUR), [{ n: { calories: 77, protein: 7 } }])];
  const aMonths = await windowMonths(run, a.zone);
  await addMeal(run, a, plus(await monthStart(run, a.zone, aMonths[5]), 9 * HOUR), [{ n: { calories: 5000 } }]);
  const res = await asUser(run, b.id);
  const got = res.ok ? byMonth(res.value) : {};
  const aRowsBefore = await storedRows(run, a.id);
  const bRows = (await run.su.query('select count(*)::int n from consumer_review.monthly_nutrition_reviews where user_id=$1', [b.id])).rows[0].n;
  const aRowsAfter = await storedRows(run, a.id);
  const args = (await run.su.query("select pronargs n from pg_proc where proname='get_current_user_monthly_nutrition_review'")).rows[0].n;
  const ok = res.ok && months.every(m => sameMonth(got[m], oracleMonth(mine, m, b.zone))) && bRows === 1 && JSON.stringify(aRowsBefore) === JSON.stringify(aRowsAfter) && args === 0;
  return R(ok, { b: months.map(m => got[m]), bRows, aRows: aRowsAfter.length, args });
};

GATES.N02_AUTHENTICATION_ROLES_AND_CORE_GATE = async run => {
  const f = USERS.F;
  await addMeal(run, f, plus(await monthStart(run, f.zone, (await windowMonths(run, f.zone))[5]), HOUR), [{ n: { calories: 10 } }]);
  const anon = await asUser(run, null, undefined, [], 'anon');
  const service = await asUser(run, null, undefined, [], 'service_role');
  const noSub = await asUser(run, null);
  await run.su.query("update public.consumer_profiles set status='disabled' where user_id=$1", [f.id]);
  const denied = await asUser(run, f.id);
  const rows = (await run.su.query('select (select count(*) from consumer_review.report_timezone_bindings where user_id=$1)::int b, (select count(*) from consumer_review.monthly_nutrition_reviews where user_id=$1)::int r', [f.id])).rows[0];
  const ok = !anon.ok && anon.code === '42501' && !service.ok && service.code === '42501' && !noSub.ok && noSub.code === '28000' && /AUTHENTICATION_REQUIRED/.test(noSub.message)
    && !denied.ok && denied.code === '42501' && /CORE_ACCESS_DENIED/.test(denied.message) && rows.b === 0 && rows.r === 0;
  return R(ok, { anon, service, noSub, denied, rows });
};

GATES.N03_NO_DIRECT_ACCESS_TO_INTERNALS = async run => {
  const a = USERS.A.id, probes = {};
  for (const role of ['authenticated', 'anon']) {
    probes[role] = {
      select: await asUser(run, a, 'select count(*) v from consumer_review.monthly_nutrition_reviews', [], role),
      insertBinding: await asUser(run, a, "insert into consumer_review.report_timezone_bindings(user_id,binding_version,timezone,source) values($1,9,'UTC','consumer_profiles.timezone') returning 1 v", [a], role),
      refresh: await asUser(run, a, "select consumer_review.refresh_month($1,1,'UTC','2026-01') v", [a], role),
      monthJson: await asUser(run, a, 'select count(*) v from pg_catalog.pg_class where false', [], role)
    };
  }
  const denied = r => !r.ok && r.code === '42501';
  const ok = ['authenticated', 'anon'].every(role => denied(probes[role].select) && denied(probes[role].insertBinding) && denied(probes[role].refresh));
  return R(ok, probes);
};

GATES.N04_INVALID_PROFILE_ZONE_REFUSED_WITHOUT_WRITES = async run => {
  const g = USERS.G;
  await run.su.query("update public.consumer_profiles set timezone='Mars/Phobos' where user_id=$1", [g.id]);
  const res = await asUser(run, g.id);
  const rows = (await run.su.query('select (select count(*) from consumer_review.report_timezone_bindings where user_id=$1)::int b, (select count(*) from consumer_review.monthly_nutrition_reviews where user_id=$1)::int r', [g.id])).rows[0];
  return R(!res.ok && res.code === '22023' && /REPORT_TIMEZONE_INVALID/.test(res.message) && rows.b === 0 && rows.r === 0, { res, rows });
};

GATES.N05_NO_DESTRUCTION_NO_ENTITLEMENT_AND_OLDER_MONTHS_KEPT = async run => {
  const k = USERS.K, months = await windowMonths(run, k.zone), s = await monthStart(run, k.zone, months[5]);
  await addMeal(run, k, plus(s, 2 * HOUR), [{ n: { calories: 250 } }]);
  const digest = async () => (await run.su.query("select md5(coalesce((select string_agg(id::text||updated_at::text||coalesce(deleted_at::text,''),',' order by id) from public.meal_records),'')||coalesce((select string_agg(id::text||updated_at::text||nutrition_snapshot::text,',' order by id) from public.meal_record_items),'')) m, (select count(*) from retention_capture.detail_capture_anchors)::int anchors, (select count(*) from retention_acquisition.detail_acquisition_records)::int receipts")).rows[0];
  const first = await asUser(run, k.id);
  const d0 = await digest();
  const [y, m] = months[0].split('-').map(Number), n = y * 12 + m - 1 - 3, outside = `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`;
  await run.su.query("insert into consumer_review.monthly_nutrition_reviews select user_id, $2, binding_version, report_timezone, calculation_version, 1, repeat('a',64), 1, 1, 1, 10,1,0,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, now() from consumer_review.monthly_nutrition_reviews where user_id=$1 and month_key=$3", [k.id, outside, months[5]]);
  const second = await asUser(run, k.id);
  const d1 = await digest();
  const kept = (await run.su.query('select month_key, revision, source_digest from consumer_review.monthly_nutrition_reviews where user_id=$1 and month_key=$2', [k.id, outside])).rows;
  const ok = first.ok && second.ok && JSON.stringify(d0) === JSON.stringify(d1) && kept.length === 1 && kept[0].revision === 1 && kept[0].source_digest === 'a'.repeat(64)
    && !second.value.months.some(x => x.monthKey === outside) && second.value.window.entitlementWiring === 'not_implemented' && second.value.score === null;
  return R(ok, { d0, d1, outside, kept, window: second.ok ? second.value.window : second });
};

// ---- Node gates (no cluster) ----
function makeLoader(readSource) {
  const cache = new Map();
  const load = rel => {
    rel = rel.split(path.sep).join('/'); if (cache.has(rel)) return cache.get(rel).exports;
    const source = readSource(rel); if (source === null) throw Error(`UNRESOLVED ${rel}`);
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const module = { exports: {} }; cache.set(rel, module);
    const localRequire = request => { if (!request.startsWith('.')) throw Error(`external module refused: ${request}`); const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), request)); for (const c of [`${base}.ts`, `${base}/index.ts`]) if (readSource(c) !== null) return load(c); throw Error(`UNRESOLVED ${request} from ${rel}`); };
    vm.runInThisContext(`(function(require,module,exports,process){${output}\n})`, { filename: rel })(localRequire, module, module.exports, { env: {} });
    return module.exports;
  };
  return load;
}
const F = 'apps/mobile/features/consumer-monthly-review';
const fromDisk = rel => { const file = path.join(ROOT, rel); return fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf8') : null; };
function sampleReview(over = {}) {
  const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((m, i) => i === 3 ? { monthKey: m, hasRecords: true, inProgress: false, revision: 2, computedAt: '2026-10-30T04:00:00.123456+00:00', bindingVersion: 1, recordedDays: 2, mealCount: 3, itemCount: 3, averageDenominator: 'recorded_days', nutrients: Object.fromEntries(['calories', 'protein', 'carbohydrates', 'fat', 'fiber'].map(k => [k, k === 'calories' ? { total: 900, averagePerRecordedDay: 450, validItems: 2, missingItems: 1, invalidItems: 0 } : { total: null, averagePerRecordedDay: null, validItems: 0, missingItems: 3, invalidItems: 0 }])) } : { monthKey: m, hasRecords: false, inProgress: i === 5 });
  return { status: 'ok', calculationVersion: 'consumer-monthly-review-v1', currentMonth: '2026-10', reportTimezone: { timezone: 'Asia/Taipei', bindingVersion: 1, source: 'consumer_profiles.timezone' }, window: { scope: 'latest_six_months_interface', entitlementWiring: 'not_implemented' }, score: null, months, ...over };
}

GATES.U01_FLAGS_DEFAULT_DISABLED_AND_LIVE_NEEDS_BOTH = async () => {
  const load = makeLoader(fromDisk), flags = load(`${F}/featureFlags.ts`), factory = load(`${F}/factory.ts`);
  const S = 'EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_SOURCE', O = 'EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_LIVE_READ_OPT_IN';
  const p = env => flags.parseConsumerMonthlyReviewFlags(env);
  const live = { authSource: 'supabase-live', supabaseAuthEnabled: true }, deps = { client: { rpc: async () => ({ data: null, error: null }) }, sessionPort: { getCurrentSession: async () => ({ ok: true, value: null }) } };
  const cases = {
    empty: factory.createConsumerMonthlyReviewRuntime(live, deps, p({})).mode,
    disabled: factory.createConsumerMonthlyReviewRuntime(live, deps, p({ [S]: 'disabled', [O]: 'false' })).mode,
    sourceOnly: factory.createConsumerMonthlyReviewRuntime(live, deps, p({ [S]: 'supabase-live' })).mode,
    optInOnly: factory.createConsumerMonthlyReviewRuntime(live, deps, p({ [O]: 'true' })).mode,
    unknown: factory.createConsumerMonthlyReviewRuntime(live, deps, p({ [S]: 'mock' })).mode,
    loose: factory.createConsumerMonthlyReviewRuntime(live, deps, p({ [S]: 'supabase-live', [O]: 'TRUE' })).mode,
    both: factory.createConsumerMonthlyReviewRuntime(live, deps, p({ [S]: 'supabase-live', [O]: 'true' })).mode,
    bothMockAuth: factory.createConsumerMonthlyReviewRuntime({ authSource: 'mock', supabaseAuthEnabled: false }, deps, p({ [S]: 'supabase-live', [O]: 'true' })).mode,
    bothNoClient: factory.createConsumerMonthlyReviewRuntime(live, {}, p({ [S]: 'supabase-live', [O]: 'true' })).mode,
    fallbackDisabled: factory.fallbackMonthlyReviewRuntime(p({})).mode,
    fallbackRequested: factory.fallbackMonthlyReviewRuntime(p({ [S]: 'supabase-live', [O]: 'true' })).mode,
    processEnvDefault: flags.getConsumerMonthlyReviewFlags().requested
  };
  const want = { empty: 'disabled', disabled: 'disabled', sourceOnly: 'misconfigured', optInOnly: 'misconfigured', unknown: 'misconfigured', loose: 'misconfigured', both: 'live', bothMockAuth: 'misconfigured', bothNoClient: 'misconfigured', fallbackDisabled: 'disabled', fallbackRequested: 'misconfigured', processEnvDefault: 'disabled' };
  const literal = fs.readFileSync(path.join(ROOT, F, 'featureFlags.ts'), 'utf8');
  const inlined = literal.includes(`process.env.${S}`) && literal.includes(`process.env.${O}`);
  return R(JSON.stringify(cases) === JSON.stringify(want) && inlined, { cases, want, inlined });
};

GATES.U02_STRICT_MAPPER_AND_SERVICE_STATES = async () => {
  const load = makeLoader(fromDisk), mapper = load(`${F}/mapper.ts`), service = load(`${F}/service.ts`);
  const parse = v => mapper.parseMonthlyNutritionReview(v) !== null;
  const bad = {
    score: sampleReview({ score: 'B+' }), grade: { ...sampleReview(), grade: 'A' }, noScoreKey: (() => { const v = sampleReview(); delete v.score; return v; })(),
    version: sampleReview({ calculationVersion: 'v2' }), five: sampleReview({ months: sampleReview().months.slice(1) }), gap: sampleReview({ months: [...sampleReview().months.slice(0, 5), { monthKey: '2026-12', hasRecords: false, inProgress: true }] }),
    inProgressOld: sampleReview({ months: sampleReview().months.map((m, i) => i === 0 ? { ...m, inProgress: true } : m) }),
    accounting: (() => { const v = sampleReview(); v.months[3].nutrients.calories.missingItems = 5; return v; })(),
    averageWrong: (() => { const v = sampleReview(); v.months[3].nutrients.calories.averagePerRecordedDay = 900; return v; })(),
    negative: (() => { const v = sampleReview(); v.months[3].nutrients.calories.total = -1; return v; })(),
    totalWithoutValidItems: (() => { const v = sampleReview(); v.months[3].nutrients.protein.total = 3; v.months[3].nutrients.protein.averagePerRecordedDay = 1.5; return v; })(),
    missingAsZero: (() => { const v = sampleReview(); v.months[3].nutrients.protein.total = 0; v.months[3].nutrients.protein.averagePerRecordedDay = 0; return v; })(),
    nullTotalWithValidItems: (() => { const v = sampleReview(); v.months[3].nutrients.calories.total = null; v.months[3].nutrients.calories.averagePerRecordedDay = null; return v; })(),
    entitlementClaim: sampleReview({ window: { scope: 'latest_six_months_interface', entitlementWiring: 'paid_permanent' } }),
    denominator: (() => { const v = sampleReview(); v.months[3].averageDenominator = 'calendar_days'; return v; })(),
    notOk: sampleReview({ status: 'error' }), array: [], nil: null
  };
  const rejected = Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, !parse(v)]));
  const session = { getCurrentSession: async () => ({ ok: true, value: { user: { userId: 'u' } } }) };
  const svc = rpc => new service.ConsumerMonthlyNutritionReviewService({ client: { rpc }, sessionPort: session });
  const calls = [];
  const states = {
    ready: (await svc(async fn => { calls.push(fn); return { data: sampleReview(), error: null }; }).getCurrentUserMonthlyReview()).status,
    malformed: await svc(async () => ({ data: sampleReview({ score: 'B+' }), error: null })).getCurrentUserMonthlyReview(),
    core: (await svc(async () => ({ data: null, error: { code: '42501', message: 'CORE_ACCESS_DENIED' } })).getCurrentUserMonthlyReview()).status,
    auth: (await svc(async () => ({ data: null, error: { code: '28000', message: 'AUTHENTICATION_REQUIRED' } })).getCurrentUserMonthlyReview()).status,
    otherError: await svc(async () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } })).getCurrentUserMonthlyReview(),
    thrown: await svc(async () => { throw Error('network'); }).getCurrentUserMonthlyReview(),
    signedOut: (await new service.ConsumerMonthlyNutritionReviewService({ client: { rpc: async () => { calls.push('should-not'); return { data: sampleReview(), error: null }; } }, sessionPort: { getCurrentSession: async () => ({ ok: true, value: null }) } }).getCurrentUserMonthlyReview()).status
  };
  const ok = parse(sampleReview()) && Object.values(rejected).every(Boolean) && states.ready === 'ready' && states.malformed.status === 'unavailable' && states.malformed.reason === 'malformed'
    && states.core === 'coreDenied' && states.auth === 'signInRequired' && states.otherError.status === 'unavailable' && states.thrown.status === 'unavailable' && states.signedOut === 'signInRequired'
    && JSON.stringify(calls) === JSON.stringify(['get_current_user_monthly_nutrition_review']);
  return R(ok, { rejected, states, calls });
};

GATES.U03_VIEW_DISCLOSES_DENOMINATOR_MISSING_AND_SCOPE = async () => {
  const load = makeLoader(fromDisk), mapper = load(`${F}/mapper.ts`), vmod = load(`${F}/viewModel.ts`);
  const review = mapper.parseMonthlyNutritionReview(sampleReview());
  const view = vmod.toMonthlyReviewView({ status: 'ready', review });
  const text = JSON.stringify(view);
  const messages = ['signInRequired', 'coreDenied'].map(s => vmod.toMonthlyReviewView({ status: s })).concat([vmod.toMonthlyReviewView({ status: 'unavailable', reason: 'server' }), vmod.toMonthlyReviewView(null)]);
  const featureText = fs.readdirSync(path.join(ROOT, F)).map(n => fs.readFileSync(path.join(ROOT, F, n), 'utf8')).join('\n');
  const ok = view.kind === 'review' && view.months[0].monthKey === '2026-10' && view.months[0].badge && view.months[2].lines.some(l => l.includes('以 2 天計')) && view.months[2].disclosures.some(l => l.includes('1 項沒有熱量資料'))
    && view.months[2].lines.some(l => l.includes('沒有可用的蛋白質資料（不以 0 計）')) && !view.months[2].lines.some(l => /蛋白質：總計 0/.test(l)) && view.notes.some(n => n.includes('不當作沒有進食')) && view.notes.some(n => n.includes('介面範圍，不是會員保存規則')) && view.notes.some(n => n.includes('Asia/Taipei'))
    && !/B\+|月評分|評分：|grade/i.test(text) && messages.every(m => m.kind === 'message') && messages[2].retry === true
    && !/i18n\/zh-TW|zhTW\.|mealLog\.foodDiary|monthlyCards|demo-user-plan|useDemoUserPlan/.test(featureText);
  return R(ok, { view, messages });
};

GATES.U04_SCREEN_AND_COMPOSITION_NEVER_SHOW_DEMO_FOR_LIVE = async () => {
  const me = fs.readFileSync(path.join(ROOT, 'apps/mobile/app/me.tsx'), 'utf8');
  const comp = fs.readFileSync(path.join(ROOT, 'apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts'), 'utf8');
  const prov = fs.readFileSync(path.join(ROOT, 'apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx'), 'utf8');
  const demoUses = [...me.matchAll(/latestMonth\.[a-zA-Z]+/g)].map(m => m.index);
  const gated = demoUses.every(i => { const before = me.slice(Math.max(0, i - 700), i); const lastGate = before.lastIndexOf('monthlyReview.mode === "disabled"'); return lastGate >= 0; });
  const ok = gated && demoUses.length >= 6 && /<MonthlyNutritionReviewCard runtime=\{monthlyReview\}/.test(me)
    && /monthlyReview: createConsumerMonthlyReviewRuntime\(input\.authFlags, \{ client: input\.mealClient, sessionPort: input\.authPort \}\)/.test(comp)
    && /monthlyReview: composition\.ok \? composition\.value\.monthlyReview : fallbackMonthlyReviewRuntime\(\)/.test(prov);
  return R(ok, { demoUses: demoUses.length, gated });
};

GATES.S01_STATIC_SCOPE_OF_THE_MIGRATION = async () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations', R1A_MIGRATION), 'utf8');
  const code = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  const grants = [...code.matchAll(/\bgrant\b[^;]*;/gi)].map(m => m[0].replace(/\s+/g, ' '));
  const ok = grants.length === 1 && grants[0] === 'grant execute on function public.get_current_user_monthly_nutrition_review() to authenticated;'
    && !/\b(delete\s+from|truncate|drop\s+(table|function|schema)|alter\s+table\s+public\.|create\s+trigger[^;]*\bon\s+public\.)/i.test(code)
    && !/retention_(capture|entitlement|acquisition|seal|billing|internal)/i.test(code) && !/\b(score|grade|rating)\b/i.test(code.replace(/'score', null/, ''))
    && !/subscription_entitlements|entitlement_state_at|rolsuper|create role/i.test(code) && /security definer/i.test(code) && /consumer_core_eligible\(\)/.test(code) && /auth\.uid\(\)/.test(code);
  return R(ok, { grants, sha256: sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', R1A_MIGRATION))) });
};

// A live interleaving can only expose a second read if a barrier sits between the two reads, so a future two-statement refresh is also refused by shape: the row lock, then one statement that alone reads the details.
function refreshReadShape(code) {
  const body = code.slice(code.indexOf('create function consumer_review.refresh_month'), code.indexOf('create function consumer_review.month_json'));
  const lock = body.indexOf('for update'), head = body.indexOf('  with meals as ('), tail = body.indexOf('  into a;');
  const statement = head >= 0 && tail > head ? body.slice(head, tail).replace(/'[^']*'/g, "''") : '';
  const reads = [...body.matchAll(/\bpublic\.meal_record(s|_items)\b/g)].map(m => m[0]).sort();
  return { lockBeforeRead: lock >= 0 && lock < head, oneStatement: statement.length > 0 && !statement.includes(';'), digestInStatement: statement.includes('src_digest'), reads, ok: lock >= 0 && lock < head && statement.length > 0 && !statement.includes(';') && statement.includes('src_digest') && reads.join() === 'public.meal_record_items,public.meal_records' };
}
GATES.S02_REFRESH_READS_THE_DETAILS_IN_ONE_STATEMENT = async () => {
  const code = fs.readFileSync(path.join(ROOT, 'supabase/migrations', R1A_MIGRATION), 'utf8').split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  const lockLine = '  select * into v_row from consumer_review.monthly_nutrition_reviews where user_id = p_user and month_key = p_month_key for update;\n', second = '  select count(*) into v_has from public.meal_records m where m.user_id = p_user;\n';
  const shapes = { product: refreshReadShape(code), secondReadBefore: refreshReadShape(code.replace('  with meals as (', () => second + '  with meals as (')), secondReadAfter: refreshReadShape(code.replace('  into a;\n', () => '  into a;\n' + second)), lockAfterRead: refreshReadShape(code.replace(lockLine, '').replace('  into a;\n', () => '  into a;\n' + lockLine)) };
  return R(shapes.product.ok && !shapes.secondReadBefore.ok && !shapes.secondReadAfter.ok && !shapes.lockAfterRead.ok, shapes);
};

// ---- the exact successor record (no cluster): exact => record and the older chain complete; any tampered/partial/mixed state => invalid ----
GATES.F01_R1A_EXACT_SUCCESSOR_RECORD_AND_TAMPER_CONTROLS = async () => {
  const { R1A_FILES, r1aFilesState, r1aPredecessorGit } = await import('./consumer-monthly-review-exact-successor.mjs');
  const rootGit = args => { const r = child.spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256e6, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }); if (r.status) throw Error('SETUP_GIT ' + args.join(' ') + ' ' + r.stderr); return r.stdout; };
  // Changes only what a path REPORTS (index blob and/or worktree hash); nothing on disk is touched.
  const lying = ({ stage = {}, hash = {} }) => args => {
    const out = rootGit(args);
    if (args[0] === 'ls-files' && args.includes('--stage')) return out.split('\n').map(line => { const at = line.indexOf('\t'); if (at < 0) return line; const name = line.slice(at + 1); return name in stage ? (stage[name] === null ? '' : `100644 ${stage[name]} 0\t${name}`) : line; }).filter(Boolean).join('\n') + '\n';
    if (args[0] === 'hash-object' && args.includes('--')) { const names = args.slice(args.indexOf('--') + 1), lines = out.trim().split('\n'); return names.map((n, i) => n in hash ? hash[n] : lines[i]).join('\n') + '\n'; }
    return out;
  };
  const me = 'apps/mobile/app/me.tsx', mig = 'supabase/migrations/' + R1A_MIGRATION, mod = P.R1A_MODULE_PATH, base = R1A_FILES[me].base;
  const exact = { r1a: P.checkedR1aState(rootGit).state, chain: P.recoverySuccessorState(rootGit), act2: P.checkedAct2State(rootGit), tail: P.withAct2Tail([]).at(-1), isR1a: P.isR1aMigration(R1A_MIGRATION) };
  const cases = {
    worktreeTampered: { stage: {}, hash: { [me]: '0'.repeat(40) } },
    indexTampered: { stage: { [me]: '1'.repeat(40) }, hash: {} },
    partialOneLeafAtBase: { stage: { [me]: base }, hash: { [me]: base } },
    mixedIndexBaseWorktreeRecord: { stage: { [me]: base }, hash: {} },
    newLeafUnstaged: { stage: { [mig]: null }, hash: {} },
    moduleTampered: { stage: {}, hash: { [mod]: 'f'.repeat(40) } }
  };
  const observed = {};
  for (const [name, c] of Object.entries(cases)) { const g = lying(c); const s = P.checkedR1aState(g), chain = P.recoverySuccessorState(g), act2 = P.checkedAct2State(g); observed[name] = { r1a: s.state, violations: s.violations.slice(0, 3), chain: chain.state, exempt: chain.exempt, act2: act2.state }; }
  // Predecessor view: every modified leaf reports its main identity (index and hash); every new leaf is absent from the index (it still exists on disk, as with ENT-W1's view).
  const view = r1aPredecessorGit(rootGit), leaves = Object.keys(R1A_FILES);
  const viewIndex = new Map(view(['ls-files', '--stage', '--', ...leaves]).trim().split('\n').filter(Boolean).map(v => [v.slice(v.indexOf('\t') + 1), v]));
  const present = leaves.filter(p => R1A_FILES[p].base), viewHash = view(['hash-object', '--', ...present]).trim().split('\n');
  const predecessorLeaves = leaves.every(p => R1A_FILES[p].base ? viewIndex.get(p) === `${R1A_FILES[p].baseMode} ${R1A_FILES[p].base} 0\t${p}` && viewHash[present.indexOf(p)] === R1A_FILES[p].base : !viewIndex.has(p)) ? 'base' : 'mismatch';
  void r1aFilesState;
  const ok = exact.r1a === 'record' && exact.chain.r1a === 'record' && exact.chain.exempt === true && ['entw1', 'ph1', 'edge', 'act2', 'billing'].every(k => exact.chain[k] === 'record')
    && exact.act2.state === 'record' && [...Object.keys(R1A_FILES), mod].every(p => exact.act2.paths.includes(p)) && exact.tail === R1A_MIGRATION && exact.isR1a === true
    && Object.values(observed).every(o => o.r1a === 'invalid' && o.chain === 'invalid' && o.exempt === false && o.act2 === 'invalid') && predecessorLeaves === 'base';
  return R(ok, { exact: { r1a: exact.r1a, chain: { state: exact.chain.state, r1a: exact.chain.r1a, exempt: exact.chain.exempt, violations: exact.chain.violations }, act2: exact.act2.state, tail: exact.tail, isR1a: exact.isR1a }, observed, predecessorLeaves });
};

// ---- runner ----
export const PG_GATES = Object.keys(GATES).filter(k => /^(P|N)\d\d_/.test(k));
export const ALL_GATE_IDS = Object.keys(GATES);
export function selectGates(value) {
  if (value === undefined) return ALL_GATE_IDS;
  const ids = value.split(',').map(s => s.trim());
  if (!ids.length || ids.some(id => !ALL_GATE_IDS.includes(id))) throw Error('SETUP_TK_GATES_INVALID ' + value);
  return ALL_GATE_IDS.filter(id => ids.includes(id));
}
export async function runPgGates(env, migrationSql, ids, out, log = () => {}) {
  const run = await openRun(env, migrationSql);
  const results = {};
  try {
    for (const id of ids) {
      let r;
      try { r = await GATES[id](run); } catch (e) { r = { pass: false, crashed: true, error: e.message, stack: e.stack }; if (/^SETUP_|Connection terminated|ECONNREFUSED|timeout expired/i.test(e.message)) { e.setup = true; throw e; } }
      results[id] = r; fs.writeFileSync(path.join(out, `check-${id}.json`), JSON.stringify({ id, ...r }, null, 2)); log(id, r);
    }
  } finally { await closeRun(run); }
  return results;
}
export async function runSmoke({ bin, out, migrationFile = null, selected = ALL_GATE_IDS }) {
  fs.mkdirSync(out, { recursive: true });
  const checks = {}, crashed = [], failed = []; let blocked = null, env = null;
  const say = (id, r) => console.log(`CHECK ${id} ${r.crashed ? 'CRASH' : r.pass ? 'PASS' : 'FAIL'}`);
  try {
    for (const id of selected.filter(id => !PG_GATES.includes(id))) {
      let r; try { r = await GATES[id](); } catch (e) { r = { pass: false, crashed: true, error: e.message }; }
      checks[id] = r; fs.writeFileSync(path.join(out, `check-${id}.json`), JSON.stringify({ id, ...r }, null, 2)); say(id, r);
    }
    const pg = selected.filter(id => PG_GATES.includes(id));
    if (pg.length) {
      if (!bin) throw Error('SETUP_NO_PG_BIN');
      env = await prepareCluster(bin, out);
      const sql = fs.readFileSync(migrationFile ?? path.join(ROOT, 'supabase/migrations', R1A_MIGRATION), 'utf8');
      Object.assign(checks, await runPgGates(env, sql, pg, out, say));
    }
  } catch (e) { blocked = { message: e.message, stack: e.stack }; } finally { if (env) await env.cl.stop().catch(() => {}); }
  for (const [id, r] of Object.entries(checks)) { if (r.crashed) crashed.push(id); else if (!r.pass) failed.push(id); }
  const notExecuted = selected.filter(id => !(id in checks));
  const status = blocked || crashed.length || notExecuted.length ? 'BLOCKED' : failed.length ? 'FAIL' : 'PASS';
  const identity = { migrationSha256: sha(fs.readFileSync(migrationFile ?? path.join(ROOT, 'supabase/migrations', R1A_MIGRATION))), smokeSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) };
  const result = { status, exitCode: status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2, selected, checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { pass: v.pass, crashed: !!v.crashed }])), failed, crashed, notExecuted, blocked, identity };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`RESULT ${status} ${Object.values(checks).filter(v => v.pass).length}/${selected.length}`);
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  let code;
  try { const out = arg('--out'); if (!out) throw Error('SETUP_NO_OUT'); code = await runSmoke({ bin: arg('--pg-bin'), out: path.resolve(out), migrationFile: arg('--migration'), selected: selectGates(process.env.TK_GATES) }); }
  catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
