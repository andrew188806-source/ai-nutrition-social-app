#!/usr/bin/env node
// TastKind R0-B-ENT-R local gates (retention-line construction 2026-10-17; NOT an acceptance): inactive REGISTRY INTEGRITY SEAL. Disposable PostgreSQL 17 only; never a remote target.
// A seal is an operator attestation that the ENT0 required-producer set is final and complete for [epoch_from, sealed_through]; it is not coverage, not Free finalization, not a grant. Gates are exported so the mutation harness
// runs the very same detectors against changed migration SQL. There is no production call path: every gate drives the functions through a test-only operator role that exists only in a disposable database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, MIGRATION, CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION, SEAL_MIGRATION as PINNED_SEAL_MIGRATION, SEAL_MIGRATION_SHA256, BILLING_MIGRATION, withAct2Tail, withSocialTail, recorder, sha, uuid, installProbe, ddlAttempts, PROBE_PAUSE_LOCK } from './consumer-retention-persistence-smoke.mjs';
import { act, frozenProof, inventoryProof, options, ELIGIBLE } from './consumer-retention-capture-smoke.mjs';
import { entCluster, selectGates, outcomeOf, selectionContractRows } from './consumer-retention-entitlement-smoke.mjs';
import { acqApply, acqSource } from './consumer-retention-acquisition-smoke.mjs';

export { options };
export const SEAL_MIGRATION = PINNED_SEAL_MIGRATION; // 20261018010000_consumer_retention_registry_seal.sql (name and sha256 are pinned by the persistence smoke)
export const SEAL_SCHEMA = 'retention_seal';
export const SEAL_OWNER = 'consumer_retention_seal_owner';
export const SEAL_BUILDER = 'consumer_retention_seal_builder';
export const ACQ_OWNER = 'consumer_retention_acquisition_owner';
export const ACQ_BUILDER = 'consumer_retention_acquisition_builder';
export const SEAL_POST_DIGEST = 'a80974703ed4b0cd26d5ac4a57328fe1991372c3ab5484c7a6b492f84d242950';
export const sealSource = () => fs.readFileSync(path.join(ROOT, 'supabase/migrations', SEAL_MIGRATION), 'utf8');

const R = (pass, observed) => ({ pass: !!pass, observed });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
const BASE = Date.UTC(2026, 0, 1);
const at = (days, extraMs = 0) => new Date(BASE + days * DAY + extraMs).toISOString();
const isoMs = d => (d instanceof Date ? d : new Date(d)).toISOString();
const SQL_SEAL = `select ${SEAL_SCHEMA}.record_registry_seal($1::timestamptz,$2) s`;
const SQL_COVERS = `select ${SEAL_SCHEMA}.registry_seal_covers($1::timestamptz) s`;
const ENT = 'retention_entitlement';
const TBL = `${SEAL_SCHEMA}.registry_seals`;
const E0 = at(-500); // epoch start used by the gates: long before any test producer
const FN_SIGS = [
  ['admit_entitlement_event', 'uuid, text, text, text, timestamp with time zone, timestamp with time zone, bigint'],
  ['advance_entitlement_coverage', 'uuid, text, timestamp with time zone'],
  ['entitlement_state_at', 'uuid, timestamp with time zone']
];

// ---- apply / fresh database ---------------------------------------------------------------------------------------------------------
export async function sealApply(ctx, sql) {
  const notices = [];
  const onNotice = m => notices.push(m.message);
  ctx.su.on('notice', onNotice);
  let error = null;
  try { await ctx.g.query(ctx.su, sql); }
  catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await ctx.su.query('ROLLBACK').catch(() => {}); }
  finally { ctx.su.removeListener('notice', onNotice); }
  return { error, notices, boundary: notices.includes('SEAL_DDL_BOUNDARY') };
}
// Template = 142 baseline + foundation + capture (entCluster); each database gets the accepted ENT0 migration (cl.fresh), then the accepted ENT1-A migration, then (optionally) the ENT-R migration.
export function sealFresh(cl, label, fn, { apply = true, seal = sealSource(), settings = [] } = {}) {
  return cl.fresh(label, async ctx => {
    for (const r of [SEAL_OWNER, SEAL_BUILDER, ACQ_OWNER, ACQ_BUILDER]) ctx.extraRoles.add(r);
    const a = await acqApply(ctx, acqSource());
    if (a.error) throw Error('SETUP_ACQ_APPLY ' + JSON.stringify(a.error));
    ctx.sealSource = seal;
    ctx.items0 = await catalogItems(ctx);
    if (apply) {
      ctx.seal = await sealApply(ctx, seal);
      if (ctx.seal.error) throw Error('SETUP_SEAL_APPLY ' + JSON.stringify(ctx.seal.error));
      ctx.items1 = await catalogItems(ctx);
    }
    return fn(ctx);
  }, { settings });
}

// ---- catalog items outside the new schema/roles (for the "only the approved seams changed" proof) ---------------------------------------
const aclText = (aclExpr, kind, ownerExpr) => `coalesce((select string_agg(coalesce(nullif(pg_get_userbyid(a.grantee)::text,''),'PUBLIC')||':'||a.privilege_type||':'||a.is_grantable||':'||pg_get_userbyid(a.grantor), ',' order by pg_get_userbyid(a.grantee)::text, a.privilege_type) from aclexplode(coalesce(${aclExpr}, acldefault('${kind}', ${ownerExpr}))) a),'')`;
export async function catalogItems(ctx) {
  const own = `(n.nspname <> '${SEAL_SCHEMA}')`;
  const sys = "n.nspname !~ '^pg_' and n.nspname <> 'information_schema'";
  const Q = {
    ns: `select 'ns:'||n.nspname k, pg_get_userbyid(n.nspowner)::text core, ${aclText('n.nspacl', 'n', 'n.nspowner')} acl from pg_namespace n where ${sys} and ${own}`,
    cls: `select 'class:'||n.nspname||'.'||c.relname k, format('%s|%s|%s|%s|%s', c.relkind, pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity, c.reloptions) core, ${aclText('c.relacl', 'r', 'c.relowner')} acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    attr: `select 'attr:'||n.nspname||'.'||c.relname||'.'||a.attname k, format('%s|%s', format_type(a.atttypid,a.atttypmod), a.attnotnull) core, coalesce(a.attacl::text,'') acl from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own} and a.attnum>0 and not a.attisdropped and c.relkind in ('r','v','m','p')`,
    proc: `select 'proc:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, format('%s|%s|%s|%s', pg_get_userbyid(p.proowner), p.proconfig, p.prosecdef, md5(pg_get_functiondef(p.oid))) core, ${aclText('p.proacl', 'f', 'p.proowner')} acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${sys} and ${own}`,
    pol: `select 'policy:'||n.nspname||'.'||c.relname||'.'||o.polname k, format('%s|%s|%s|%s|%s', o.polcmd, o.polpermissive, (select string_agg(coalesce(r.rolname,'PUBLIC'),',' order by r.rolname) from pg_roles r where r.oid=any(o.polroles)), pg_get_expr(o.polqual,o.polrelid), pg_get_expr(o.polwithcheck,o.polrelid)) core, '' acl from pg_policy o join pg_class c on c.oid=o.polrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    trg: `select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname k, pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text core, '' acl from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    con: `select 'con:'||n.nspname||'.'||c.relname||'.'||k.conname k, pg_get_constraintdef(k.oid) core, '' acl from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where ${sys} and ${own}`,
    dacl: `select 'defacl:'||pg_get_userbyid(d.defaclrole)||':'||coalesce(d.defaclnamespace::regnamespace::text,'')||':'||d.defaclobjtype::text k, coalesce(d.defaclacl::text,'') core, '' acl from pg_default_acl d where pg_get_userbyid(d.defaclrole) not in ('${SEAL_OWNER}','${SEAL_BUILDER}')`,
    role: `select 'role:'||r.rolname k, format('%s|%s|%s|%s|%s|%s|%s|%s', r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconfig) core, '' acl from pg_roles r where r.rolname not in ('${SEAL_OWNER}','${SEAL_BUILDER}')`,
    mem: `select 'member:'||pg_get_userbyid(m.roleid)||'>'||pg_get_userbyid(m.member) k, format('%s|%s|%s|%s', pg_get_userbyid(m.grantor), m.admin_option, m.inherit_option, m.set_option) core, '' acl from pg_auth_members m where not exists (select 1 from pg_roles x where x.oid in (m.roleid,m.member,m.grantor) and x.rolname in ('${SEAL_OWNER}','${SEAL_BUILDER}'))`,
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
  added: ['policy:retention_entitlement.producers.seal_owner_select#core'],
  removed: [],
  changed: [
    'class:retention_entitlement.producers#acl',
    'ns:retention_entitlement#acl',
    `proc:${ENT}.entitlement_state_at(p_owner uuid, p_instant timestamp with time zone)#acl`
  ].sort()
};

// ---- fixtures -------------------------------------------------------------------------------------------------------------------------
const q = (ctx, text, v) => ctx.g.query(ctx.su, text, v).then(r => r.rows);
const count = async (ctx, table, where = 'true') => (await q(ctx, `select count(*)::int n from ${table} where ${where}`))[0].n;
const sealRows = ctx => q(ctx, `select * from ${TBL} order by seal_seq`);
const call = async (c, text, v = []) => {
  try { const r = await c.query(text, v); return { ok: true, value: r.rows[0]?.s }; }
  catch (e) { return { ok: false, code: e.code ?? null, message: String(e.message) }; }
};
async function regWrite(ctx, text, values = []) {
  await ctx.su.query('begin');
  try { await ctx.su.query("set local session_replication_role = 'replica'"); await ctx.g.query(ctx.su, text, values); await ctx.su.query('commit'); }
  catch (e) { await ctx.su.query('rollback').catch(() => {}); throw e; }
}
// Registry row written WITHOUT the registry guard (replica) so a test instant may lie in the past. The role need not exist for a pure registry test. The migrations register nobody.
async function addProducer(ctx, ns, { registeredAt = at(-400), retiredAt = null, role = null } = {}) {
  const r = role ?? 'seal_p_' + ns.replace(/[^a-z0-9]/g, '_');
  await regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,$4::timestamptz)`, [ns, r, registeredAt, retiredAt]);
  return { ns, role: r };
}
// Test-only producer with a real login role (for the gates that exercise ENT0 admit/advance next to the seal).
async function makeProducer(ctx, ns, { registeredAt = at(-400), retiredAt = null } = {}) {
  const role = 'seal_p_' + ns.replace(/[^a-z0-9]/g, '_');
  ctx.extraRoles.add(role);
  await ctx.g.query(ctx.su, `create role ${role} login`);
  await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to ${role}`);
  for (const [fn, args] of FN_SIGS) await ctx.g.query(ctx.su, `grant execute on function ${ENT}.${fn}(${args}) to ${role}`);
  await regWrite(ctx, `insert into ${ENT}.producers(namespace, role_name, registered_at, retired_at) values ($1,$2,$3::timestamptz,$4::timestamptz)`, [ns, role, registeredAt, retiredAt]);
  return { ns, role, c: await ctx.open(role) };
}
// Test-only operator. The migration grants EXECUTE on the seal functions to nobody; this role exists only in the disposable database.
async function makeOperator(ctx, name = 'seal_operator') {
  ctx.extraRoles.add(name);
  await ctx.g.query(ctx.su, `create role ${name} login`);
  await ctx.g.query(ctx.su, `grant usage on schema ${SEAL_SCHEMA} to ${name}`);
  await ctx.g.query(ctx.su, `grant execute on function ${SEAL_SCHEMA}.record_registry_seal(timestamptz, text) to ${name}`);
  await ctx.g.query(ctx.su, `grant execute on function ${SEAL_SCHEMA}.registry_seal_covers(timestamptz) to ${name}`);
  return { role: name, c: await ctx.open(name) };
}
async function makeUser(ctx, n) { await ctx.g.query(ctx.su, 'insert into auth.users(id,email) values($1,$2)', [uuid(n), `seal${n}@synthetic.invalid`]); return uuid(n); }
const sealCall = (c, epoch, ref) => call(c, SQL_SEAL, [epoch, ref]);
const covers = (c, instant) => call(c, SQL_COVERS, [instant]);
const admit = (p, owner, up, cls, from, until, seq = null) =>
  call(p.c, `select ${ENT}.admit_entitlement_event($1::uuid,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::bigint) s`, [owner, p.ns, up, cls, from, until, seq]);
const advance = (p, owner, through) => call(p.c, `select ${ENT}.advance_entitlement_coverage($1::uuid,$2,$3::timestamptz) s`, [owner, p.ns, through]);
const stateAt = (ctx, owner, instant) => ctx.g.query(ctx.su, `select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [owner, instant]).then(r => r.rows[0].s);
// Independent oracle (JS, raw SQL rows; not the migration's digest function): the canonical text of the registry part that decides "required at t" for every t <= through.
async function oracleDigest(ctx, through) {
  const rows = await q(ctx, `select namespace, role_name::text role, registered_at, retired_at from ${ENT}.producers where registered_at <= $1::timestamptz order by namespace collate "C"`, [through]);
  const arr = rows.map(r => [r.namespace, r.role, isoMs(r.registered_at), r.retired_at && r.retired_at.getTime() <= Date.parse(through) ? isoMs(r.retired_at) : null]);
  const text = '[' + arr.map(a => '[' + a.map(v => JSON.stringify(v)).join(', ') + ']').join(', ') + ']';
  return { digest: createHash('sha256').update(text, 'utf8').digest('hex'), count: rows.length };
}
const waiting = async p => Promise.race([p.then(() => 'DONE'), sleep(600).then(() => 'WAITING')]);
const sealOf = r => r.ok ? r.value?.seal : undefined;
// every stored seal digest must equal the digest recomputed NOW from the final registry (ENT0 non-retroactivity is what makes this true)
async function chainConsistent(ctx) {
  const rows = await sealRows(ctx); const bad = [];
  let prev = null;
  for (const r of rows) {
    const o = await oracleDigest(ctx, isoMs(r.sealed_through));
    if (o.digest !== r.registry_digest || o.count !== r.producer_count) bad.push({ seq: r.seal_seq, stored: r.registry_digest, oracle: o.digest, count: [r.producer_count, o.count] });
    if (prev && (Number(r.seal_seq) !== Number(prev.seal_seq) + 1 || isoMs(r.epoch_from) !== isoMs(prev.epoch_from) || r.sealed_through.getTime() <= prev.sealed_through.getTime())) bad.push({ seq: r.seal_seq, chain: true });
    prev = r;
  }
  return { rows: rows.length, bad };
}

export const GATES = {};
const SEAL_KEYS = ['seal_seq', 'epoch_from', 'sealed_through', 'registry_digest', 'producer_count', 'attestation_ref', 'sealed_by', 'sealed_at', 'policy'];
Object.assign(GATES, {
  async P01_FIRST_SEAL_SAMPLES_UNDER_THE_REGISTRY_LOCK_AND_RECORDS_AN_ORACLE_DIGEST(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); await addProducer(ctx, 'premium-trial', { registeredAt: at(-300) });
    const t0 = Date.now(); const r = await sealCall(op.c, E0, 'att-001'); const t1 = Date.now();
    const s = sealOf(r); const rows = await sealRows(ctx);
    const S = s ? Date.parse(s.sealed_through) : NaN;
    const o = s ? await oracleDigest(ctx, s.sealed_through) : { digest: null, count: -1 };
    const row = rows[0];
    const ok = r.ok && r.value.outcome === 'sealed' && r.value.reason === null && s && same(Object.keys(s).sort(), [...SEAL_KEYS].sort()) && s.seal_seq === 1 && s.epoch_from === E0 && s.producer_count === 2 && o.count === 2 && s.registry_digest === o.digest
      && s.attestation_ref === 'att-001' && s.sealed_by === op.role && s.policy === 'retention-registry-seal-v1'
      && S >= t0 - 3 && S <= t1 + 3 && Date.parse(s.sealed_at) >= S && Date.parse(s.sealed_at) <= t1 + 3
      && rows.length === 1 && Number(row.seal_seq) === 1 && isoMs(row.sealed_through) === s.sealed_through && row.registry_digest === s.registry_digest && row.sealed_by === op.role && row.producer_count === 2;
    return R(ok, { r, window: [t0, t1], S, oracle: o, rows: rows.length });
  },
  async P02_WRITER_ORDERING_AROUND_THE_SAMPLE_IS_DECIDED_BY_THE_REGISTRY_LOCK(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); await addProducer(ctx, 'premium-trial', { registeredAt: at(-300) });
    const out = {};
    // (A) a registry write is OPEN (uncommitted) when the seal is requested: the seal waits, then includes the committed row
    { const w = await ctx.open('supabase_admin'); await w.query('begin'); await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('late-a','seal_late_a')`);
      const p = sealCall(op.c, E0, 'att-A'); const early = await waiting(p); await w.query('commit'); const r = await p; const s = sealOf(r);
      const o = s ? await oracleDigest(ctx, s.sealed_through) : {}; const late = (await q(ctx, `select registered_at from ${ENT}.producers where namespace='late-a'`))[0];
      out.A = { early, outcome: r.value?.outcome, count: s?.producer_count, oracleMatch: !!s && s.registry_digest === o.digest, lateIncluded: !!s && !!late && late.registered_at.getTime() <= Date.parse(s.sealed_through) }; }
    await sleep(15);
    // (B) the open registry write is ROLLED BACK: the seal waits and then does not include it
    { const w = await ctx.open('supabase_admin'); await w.query('begin'); await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('late-b','seal_late_b')`);
      const p = sealCall(op.c, E0, 'att-B'); const early = await waiting(p); await w.query('rollback'); const r = await p; const s = sealOf(r);
      const o = s ? await oracleDigest(ctx, s.sealed_through) : {};
      out.B = { early, outcome: r.value?.outcome, count: s?.producer_count, oracleMatch: !!s && s.registry_digest === o.digest, absent: await count(ctx, `${ENT}.producers`, "namespace='late-b'") === 0 }; }
    await sleep(15);
    // (C) the seal transaction is OPEN (it holds the registry lock) when a registry write starts: the write waits, and its effective time is strictly after sealed_through
    { const sc = await ctx.open(op.role); await sc.query('begin'); const r3 = await sealCall(sc, E0, 'att-C'); const s3 = sealOf(r3);
      const w2 = await ctx.open('supabase_admin'); const wp = w2.query(`insert into ${ENT}.producers(namespace, role_name) values ('late-c','seal_late_c') returning registered_at`).then(r => r.rows[0].registered_at, e => 'ERR:' + e.code);
      const early = await waiting(wp); await sc.query('commit'); const reg = await wp;
      out.C = { sealed: r3.value?.outcome, early, afterThrough: reg instanceof Date && !!s3 && reg.getTime() > Date.parse(s3.sealed_through), margin: reg instanceof Date && s3 ? reg.getTime() - Date.parse(s3.sealed_through) : null };
      await w2.end().catch(() => {}); }
    await sleep(15);
    const fin = await sealCall(op.c, E0, 'att-D'); const sf = sealOf(fin);
    const cc = await chainConsistent(ctx);
    const ok = out.A.early === 'WAITING' && out.A.outcome === 'sealed' && out.A.count === 3 && out.A.oracleMatch && out.A.lateIncluded
      && out.B.early === 'WAITING' && out.B.outcome === 'sealed' && out.B.count === 3 && out.B.oracleMatch && out.B.absent
      && out.C.sealed === 'sealed' && out.C.early === 'WAITING' && out.C.afterThrough
      && fin.ok && fin.value.outcome === 'sealed' && sf.producer_count === 4 && cc.bad.length === 0 && cc.rows === 4;
    return R(ok, { out, fin: fin.value, chain: cc });
  },
  async P03_CHAIN_EXTENSION_ADVANCES_THE_RANGE_AND_ADDITIONS_OR_FUTURE_RETIREMENTS_DO_NOT_CHANGE_SEALED_HISTORY(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); await addProducer(ctx, 'premium-trial', { registeredAt: at(-300) });
    const r1 = await sealCall(op.c, E0, 'ext-1'); const s1 = sealOf(r1);
    // after seal 1: a new producer, and a retirement of an existing producer scheduled shortly (both through the real ENT0 registry guard, no replica)
    await ctx.g.query(ctx.su, `insert into ${ENT}.producers(namespace, role_name) values ('added-after','seal_added_after')`);
    await ctx.g.query(ctx.su, `update ${ENT}.producers set retired_at = date_trunc('milliseconds', clock_timestamp()) + interval '1500 milliseconds' where namespace='billing'`);
    const hist1 = s1 ? await oracleDigest(ctx, s1.sealed_through) : {};
    await sleep(40);
    const r2 = await sealCall(op.c, E0, 'ext-2'); const s2 = sealOf(r2); // billing's retirement is still in the future at S2: shown as open
    await sleep(1800); // billing's retirement becomes effective
    const r3 = await sealCall(op.c, E0, 'ext-3'); const s3 = sealOf(r3); // history through S2 is re-verified with billing still open at S2, and now sealed through a point after its retirement
    await sleep(20);
    await ctx.g.query(ctx.su, `insert into ${ENT}.producers(namespace, role_name) values ('added-late','seal_added_late')`);
    await sleep(20);
    const r4 = await sealCall(op.c, E0, 'ext-4'); const s4 = sealOf(r4);
    const cov = [E0, s1?.sealed_through, s2?.sealed_through, s4?.sealed_through].map(x => x ?? at(0));
    const cv = []; for (const t of cov) cv.push((await covers(op.c, t)).value?.sealed);
    const cc = await chainConsistent(ctx);
    const o3 = s3 ? await oracleDigest(ctx, s3.sealed_through) : {};
    const ok = [r1, r2, r3, r4].every(x => x.ok && x.value.outcome === 'sealed') && s1.seal_seq === 1 && s2.seal_seq === 2 && s3.seal_seq === 3 && s4.seal_seq === 4
      && hist1.digest === s1.registry_digest && s1.producer_count === 2 && s2.producer_count === 3 && s3.producer_count === 3 && s4.producer_count === 4
      && s2.registry_digest !== s1.registry_digest && s3.registry_digest === o3.digest && s3.registry_digest !== s2.registry_digest
      && Date.parse(s1.sealed_through) < Date.parse(s2.sealed_through) && Date.parse(s2.sealed_through) < Date.parse(s3.sealed_through) && Date.parse(s3.sealed_through) < Date.parse(s4.sealed_through)
      && cv.every(x => x === true) && cc.bad.length === 0 && cc.rows === 4;
    return R(ok, { hist1: hist1.digest === s1?.registry_digest, counts: [s1?.producer_count, s2?.producer_count, s3?.producer_count, s4?.producer_count], covers: cv, chain: cc, outcomes: [r1, r2, r3, r4].map(x => x.ok ? x.value.outcome : x.code + ':' + x.message) });
  },
  async P04_PRIVILEGED_EDITS_OF_SEALED_REGISTRY_HISTORY_BLOCK_THE_NEXT_EXTENSION_AND_WRITE_NOTHING(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); await addProducer(ctx, 'premium-trial', { registeredAt: at(-300) });
    const r1 = await sealCall(op.c, E0, 'tam-1'); const s1 = sealOf(r1);
    const tries = {}; let n = 0;
    const attempt = async (label, tamper, restore) => {
      await regWrite(ctx, tamper);
      const r = await sealCall(op.c, E0, 'tam-try-' + (++n));
      await regWrite(ctx, restore);
      tries[label] = { ok: r.ok, code: r.code, history: r.ok ? 'ACCEPTED:' + r.value?.outcome : /SEAL_REGISTRY_HISTORY_CHANGED/.test(r.message ?? ''), rows: await count(ctx, TBL) };
    };
    await attempt('registered-earlier', `update ${ENT}.producers set registered_at = registered_at - interval '1 day' where namespace='billing'`, `update ${ENT}.producers set registered_at = registered_at + interval '1 day' where namespace='billing'`);
    await attempt('role-renamed', `update ${ENT}.producers set role_name = 'tampered_role' where namespace='billing'`, `update ${ENT}.producers set role_name = 'seal_p_billing' where namespace='billing'`);
    await attempt('row-deleted', `delete from ${ENT}.producers where namespace='premium-trial'`, `insert into ${ENT}.producers(namespace, role_name, registered_at) values ('premium-trial','seal_p_premium_trial','${at(-300)}')`);
    await attempt('retroactive-retirement', `update ${ENT}.producers set retired_at = '${s1.sealed_through}'::timestamptz - interval '1 hour' where namespace='billing'`, `update ${ENT}.producers set retired_at = null where namespace='billing'`);
    await attempt('retroactive-registration', `insert into ${ENT}.producers(namespace, role_name, registered_at) values ('ghost','seal_ghost','${s1.sealed_through}'::timestamptz - interval '1 hour')`, `delete from ${ENT}.producers where namespace='ghost'`);
    // controls: with the history restored the extension succeeds; a change to a producer registered AFTER the sealed range (history not yet attested) does not block it
    await ctx.g.query(ctx.su, `insert into ${ENT}.producers(namespace, role_name) values ('future-p','seal_future_p')`);
    await regWrite(ctx, `update ${ENT}.producers set registered_at = registered_at + interval '7 days' where namespace='future-p'`);
    await sleep(15);
    const ctl = await sealCall(op.c, E0, 'tam-ok'); const sc = sealOf(ctl);
    const cc = await chainConsistent(ctx);
    const ok = r1.ok && Object.values(tries).every(t => !t.ok && t.code === '23514' && t.history === true && t.rows === 1) && Object.keys(tries).length === 5
      && ctl.ok && ctl.value.outcome === 'sealed' && sc.seal_seq === 2 && sc.producer_count === 2 && cc.bad.length === 0;
    return R(ok, { tries, ctl: ctl.ok ? ctl.value.outcome : ctl.message, chain: cc });
  },
  async P05_REPLAY_AND_CONFLICT_ON_THE_ATTESTATION_REFERENCE(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing');
    const first = await sealCall(op.c, E0, 'rep-1'); const rows1 = await count(ctx, TBL);
    await sleep(20); await ctx.g.query(ctx.su, `insert into ${ENT}.producers(namespace, role_name) values ('after-first','seal_after_first')`); await sleep(20);
    const again = []; for (let i = 0; i < 3; i++) again.push(await sealCall(op.c, E0, 'rep-1'));
    // a replay must not touch the registry: an open registry writer does not block it
    const w = await ctx.open('supabase_admin'); await w.query('begin'); await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('lock-probe','seal_lock_probe')`);
    const t = Date.now(); const during = await sealCall(op.c, E0, 'rep-1'); const ms = Date.now() - t; await w.query('rollback');
    const conflict = await sealCall(op.c, at(-499), 'rep-1');
    const second = await sealCall(op.c, E0, 'rep-2');
    const ok = first.ok && first.value.outcome === 'sealed' && rows1 === 1 && again.every(x => x.ok && x.value.outcome === 'replayed' && same(x.value.seal, first.value.seal)) && during.ok && during.value.outcome === 'replayed' && same(during.value.seal, first.value.seal) && ms < 1000
      && !conflict.ok && conflict.code === '23505' && /SEAL_ATTESTATION_CONFLICT/.test(conflict.message) && second.ok && second.value.outcome === 'sealed' && second.value.seal.seal_seq === 2 && await count(ctx, TBL) === 2;
    return R(ok, { first: first.value?.outcome, replays: again.map(x => x.value?.outcome), duringMs: ms, conflict: conflict.code, second: second.value?.outcome, rows: await count(ctx, TBL) });
  },
  async P06_PENDING_OUTCOMES_WRITE_NOTHING_AND_THE_SAME_CALL_SUCCEEDS_WHEN_THE_CONDITION_ENDS(ctx) {
    const op = await makeOperator(ctx); const out = {};
    const pendingOf = r => r.ok && r.value.outcome === 'pending' && r.value.seal === null ? r.value.reason : (r.ok ? r.value.outcome : r.code);
    // (a) an empty registry cannot be sealed (a seal of "nothing required" is not accepted as an attestation)
    out.empty = pendingOf(await sealCall(op.c, E0, 'pend-empty'));
    await addProducer(ctx, 'billing');
    // (b) registry write open for longer than the per-wait limit -> pending REGISTRY_LOCK_TIMEOUT; nothing written; the same call succeeds afterwards
    { const w = await ctx.open('supabase_admin'); await w.query('begin'); await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('lock-probe','seal_lock_probe')`);
      const t = Date.now(); const r = await sealCall(op.c, E0, 'pend-reg'); const ms = Date.now() - t; const during = await count(ctx, TBL); await w.query('rollback');
      const after = await sealCall(op.c, E0, 'pend-reg'); out.registry = { pending: pendingOf(r), ms, rows: during, after: after.value?.outcome }; }
    // (c) the chain lock is held elsewhere -> pending SEAL_LOCK_TIMEOUT
    { const h = await ctx.open('supabase_admin'); await h.query('begin'); await h.query("select pg_advisory_xact_lock(hashtextextended('retention_registry_seal:chain', 0))");
      const rowsBefore = await count(ctx, TBL); const t = Date.now(); const r = await sealCall(op.c, E0, 'pend-chain'); const ms = Date.now() - t; await h.query('rollback');
      const after = await sealCall(op.c, E0, 'pend-chain'); out.chain = { pending: pendingOf(r), ms, rows: [rowsBefore, await count(ctx, TBL) - (after.value?.outcome === 'sealed' ? 1 : 0)], after: after.value?.outcome }; }
    // (d) the previous seal reaches into the future of this call (clock did not advance past it) -> pending SEAL_NOT_ADVANCED
    { const row = (await sealRows(ctx)).at(-1); const far = new Date(Date.now() + 3600e3).toISOString();
      await regWrite(ctx, `insert into ${TBL}(seal_seq, epoch_from, sealed_through, registry_digest, producer_count, attestation_ref, sealed_by, sealed_at, seal_policy) values ($1, $2::timestamptz, $3::timestamptz, $4, $5, 'pend-future', 'seal_operator', $3::timestamptz, 'retention-registry-seal-v1')`,
        [Number(row.seal_seq) + 1, isoMs(row.epoch_from), far, row.registry_digest, row.producer_count]);
      const rowsBefore = await count(ctx, TBL); const r = await sealCall(op.c, E0, 'pend-adv'); out.advance = { pending: pendingOf(r), rows: [rowsBefore, await count(ctx, TBL)] };
      await regWrite(ctx, `delete from ${TBL} where attestation_ref = 'pend-future'`); }
    const ok = out.empty === 'SEAL_REGISTRY_EMPTY' && out.registry.pending === 'REGISTRY_LOCK_TIMEOUT' && out.registry.ms >= 1500 && out.registry.ms < 7000 && out.registry.rows === 0 && out.registry.after === 'sealed'
      && out.chain.pending === 'SEAL_LOCK_TIMEOUT' && out.chain.ms >= 1500 && out.chain.ms < 7000 && out.chain.rows[0] === out.chain.rows[1] && out.chain.after === 'sealed'
      && out.advance.pending === 'SEAL_NOT_ADVANCED' && out.advance.rows[0] === out.advance.rows[1];
    return R(ok, out);
  },
  async P07_ENT0_ANSWERS_ARE_UNCHANGED_BY_SEALS_AND_A_SEAL_NEVER_MAKES_UNKNOWN_FREE(ctx) {
    const op = await makeOperator(ctx); const bill = await makeProducer(ctx, 'billing'); const trial = await makeProducer(ctx, 'premium-trial');
    const o1 = await makeUser(ctx, 71), o2 = await makeUser(ctx, 72), o3 = await makeUser(ctx, 73);
    await admit(bill, o1, 'sub-1', 'paid', at(5), at(40)); await admit(trial, o2, 'trial-1', 'trial', at(0), at(14));
    await advance(bill, o2, at(100)); await advance(trial, o2, at(100)); await advance(bill, o3, at(3));
    const probes = []; for (const o of [o1, o2, o3]) for (const d of [-1, 2, 6, 20, 30, 50, 99]) probes.push([o, at(d)]);
    const strip = s => ({ ...s, sampled_at: undefined });
    const before = []; for (const [o, t] of probes) before.push(strip(await stateAt(ctx, o, t)));
    const r1 = await sealCall(op.c, E0, 'ans-1'); await sleep(20); const r2 = await sealCall(op.c, E0, 'ans-2');
    const after = []; for (const [o, t] of probes) after.push(strip(await stateAt(ctx, o, t)));
    const unknownStill = after.filter((s, i) => s.state === 'unknown').length;
    const sealedCovers = (await covers(op.c, at(6))).value?.sealed === true;
    const states = after.reduce((m, s) => (m[s.state] = (m[s.state] ?? 0) + 1, m), {});
    // o3 has billing coverage only to day 3 and trial none: day 20 stays unknown although day 20 lies inside the sealed range
    const o3d20 = after[probes.findIndex(([o, t]) => o === o3 && t === at(20))];
    const ok = r1.ok && r2.ok && r1.value.outcome === 'sealed' && r2.value.outcome === 'sealed' && same(before, after) && sealedCovers && o3d20.state === 'unknown' && o3d20.reason === 'COVERAGE_SHORT' && unknownStill > 0 && (states.free ?? 0) > 0 && (states.paid ?? 0) > 0;
    return R(ok, { states, same: same(before, after), o3d20 });
  }
});

// ---- part 2: catalog / privileges / wiring / concurrency / rollback ------------------------------------------------------------------------------
const EXPECT_COLUMNS = ['attestation_ref', 'epoch_from', 'producer_count', 'registry_digest', 'seal_policy', 'seal_seq', 'sealed_at', 'sealed_by', 'sealed_through'];
const EXPECT_CONSTRAINTS = ['registry_seals_epoch_from_instant', 'registry_seals_pkey', 'registry_seals_sealed_at_instant', 'registry_seals_sealed_through_instant',
  'seal_by_nonempty', 'seal_count_positive', 'seal_digest_hex', 'seal_epoch_not_after_through', 'seal_policy_version', 'seal_ref_unique', 'seal_ref_valid', 'seal_seq_positive', 'seal_through_not_after_sealed'].sort();
const FN_SEAL = ['record_registry_seal(timestamptz,text)', 'registry_digest_through(timestamptz)', 'registry_seal_covers(timestamptz)', `seal_json(text,${SEAL_SCHEMA}.registry_seals)`, 'validate_seal()', 'reject_seal_change()'];
const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
async function privilegeMatrix(ctx, roles) {
  const objs = [
    ['schema', SEAL_SCHEMA, ['USAGE', 'CREATE']], ['table', TBL, TABLE_PRIVS], ...FN_SEAL.map(f => ['function', `${SEAL_SCHEMA}.${f}`, ['EXECUTE']]),
    ['schema', 'retention_capture', ['USAGE', 'CREATE']], ['table', 'retention_capture.detail_capture_anchors', TABLE_PRIVS],
    ['function', 'retention_capture.capture_meal_record_insert()', ['EXECUTE']], ['function', 'retention_capture.reject_anchor_update()', ['EXECUTE']],
    ['schema', ENT, ['USAGE', 'CREATE']], ['table', `${ENT}.producers`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']], ['table', `${ENT}.entitlement_events`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']], ['table', `${ENT}.entitlement_coverage`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
    ['function', `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`, ['EXECUTE']], ['function', `${ENT}.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)`, ['EXECUTE']],
    ['function', `${ENT}.advance_entitlement_coverage(uuid,text,timestamp with time zone)`, ['EXECUTE']],
    ['schema', 'retention_acquisition', ['USAGE', 'CREATE']], ['table', 'retention_acquisition.detail_acquisition_records', TABLE_PRIVS], ['function', 'retention_acquisition.resolve_detail_acquisition(uuid)', ['EXECUTE']]
  ];
  const granted = [];
  for (const role of roles) for (const [kind, name, privs] of objs) for (const priv of privs) {
    const fn = kind === 'schema' ? 'has_schema_privilege' : kind === 'table' ? 'has_table_privilege' : 'has_function_privilege';
    if ((await q(ctx, `select ${fn}($1, $2, $3) v`, [role, name, priv]))[0].v) granted.push(`${role}|${name}|${priv}`);
  }
  return granted.sort();
}
const OWN = (role, name, privs) => privs.map(p => `${role}|${name}|${p}`);
const MEAL_SQL = "insert into public.meal_records(user_id,meal_type,occurred_at,meal_date,source) values($1,'lunch',$2::timestamptz,$3::date,'manual') returning id";
const items = name => JSON.stringify([{ displayName: name, nutritionSource: 'manual', nutrition: { calories: 100, protein: 5, carbohydrates: 15, fat: 2, fiber: 1 } }]);
const V2_SQL = "select public.create_current_user_meal_record_v2('lunch',$1::timestamptz,$2::date,$3::uuid,'Asia/Taipei',$4,null,'manual',$5::jsonb) s";
async function realMeal(ctx, key, uid = ELIGIBLE) {
  const now = new Date().toISOString();
  const r = await act(ctx, uid, V2_SQL, [now, now.slice(0, 10), uuid(key), 'SYNTHETIC seal meal', items('x')]);
  if (!r.ok) throw Error('SETUP_REAL_MEAL ' + r.code + ' ' + r.message);
  return r.rows[0].s.id ?? r.rows[0].s.mealRecordId ?? r.rows[0].s.record?.id;
}
Object.assign(GATES, {
  async P08_EXACT_POST_STATE_SEALED_ROLE_OBJECTS_AND_EFFECTIVE_PRIVILEGE_MATRIX(ctx) {
    const src = ctx.sealSource;
    const own = /IS DISTINCT FROM '([0-9a-f]{64})'/.exec(src)?.[1];
    const pinned = !!own && src.split(own).length === 3 && (src !== sealSource() || own === SEAL_POST_DIGEST);
    const roles = await q(ctx, "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil is null nova, (select count(*) from pg_shadow s where s.usename=r.rolname and s.passwd is not null)::int pw from pg_roles r where rolname in ($1,$2) order by 1", [SEAL_OWNER, SEAL_BUILDER]);
    const roleOk = roles.length === 1 && roles[0].rolname === SEAL_OWNER && !roles[0].rolsuper && !roles[0].rolinherit && !roles[0].rolcreaterole && !roles[0].rolcreatedb && !roles[0].rolcanlogin && !roles[0].rolreplication && !roles[0].rolbypassrls && roles[0].rolconnlimit === -1 && roles[0].nova && roles[0].pw === 0;
    const members = (await q(ctx, "select count(*)::int n from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)", [SEAL_OWNER, SEAL_BUILDER]))[0].n;
    const owned = await q(ctx, "select n.nspname, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relowner=(select oid from pg_roles where rolname=$1) and n.nspname !~ '^pg_toast' order by 1,2", [SEAL_OWNER]);
    const ownedProcs = await q(ctx, "select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proowner=(select oid from pg_roles where rolname=$1) order by 1,2", [SEAL_OWNER]);
    const ownedSchemas = (await q(ctx, "select nspname from pg_namespace where nspowner=(select oid from pg_roles where rolname=$1)", [SEAL_OWNER])).map(x => x.nspname);
    const cols = (await q(ctx, `select column_name from information_schema.columns where table_schema='${SEAL_SCHEMA}' and table_name='registry_seals' order by 1`)).map(x => x.column_name);
    const cons = (await q(ctx, `select conname from pg_constraint where connamespace=to_regnamespace('${SEAL_SCHEMA}') order by 1`)).map(x => x.conname);
    const rls = (await q(ctx, `select relrowsecurity r, relforcerowsecurity f from pg_class where oid='${TBL}'::regclass`))[0];
    const pols = await q(ctx, `select polname, polcmd, polpermissive, (select array_agg(rolname::text) from pg_roles where oid = any(polroles)) roles, pg_get_expr(polqual, polrelid) qual, pg_get_expr(polwithcheck, polrelid) chk from pg_policy where polrelid='${TBL}'::regclass order by 1`);
    const trgs = await q(ctx, `select tgname, tgenabled::text e from pg_trigger where tgrelid='${TBL}'::regclass and not tgisinternal order by 1`);
    const fns = await q(ctx, `select p.proname, p.prosecdef, p.provolatile::text v, p.proconfig, pg_get_function_identity_arguments(p.oid) args from pg_proc p where p.pronamespace=to_regnamespace('${SEAL_SCHEMA}') order by 1`);
    const polOk = pols.length === 2 && pols[0].polname === 'seal_owner_insert' && pols[0].polcmd === 'a' && pols[0].chk === 'true' && pols[1].polname === 'seal_owner_select' && pols[1].polcmd === 'r' && pols[1].qual === 'true' && pols.every(p => p.polpermissive && same(p.roles, [SEAL_OWNER]));
    const fn = n => fns.find(f => f.proname === n);
    const cfgSp = ['search_path=""'];
    const fnOk = fns.length === 6 && fn('record_registry_seal')?.prosecdef && fn('record_registry_seal').v === 'v' && same(fn('record_registry_seal').proconfig, ['search_path=""', 'lock_timeout=2s']) && fn('record_registry_seal').args === 'p_epoch_from timestamp with time zone, p_attestation_ref text'
      && fn('registry_seal_covers')?.prosecdef && fn('registry_seal_covers').v === 's' && same(fn('registry_seal_covers').proconfig, cfgSp)
      && !fn('registry_digest_through')?.prosecdef && fn('registry_digest_through').v === 's' && same(fn('registry_digest_through').proconfig, cfgSp)
      && !fn('seal_json')?.prosecdef && fn('seal_json').v === 'i' && same(fn('seal_json').proconfig, cfgSp)
      && !fn('validate_seal')?.prosecdef && same(fn('validate_seal').proconfig, cfgSp) && !fn('reject_seal_change')?.prosecdef && same(fn('reject_seal_change').proconfig, cfgSp);
    await ctx.g.query(ctx.su, 'create role seal_nobody login'); ctx.extraRoles.add('seal_nobody');
    const supers = (await q(ctx, 'select rolname from pg_roles where rolsuper order by 1')).map(x => x.rolname);
    const roleNames = ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'seal_nobody', 'consumer_retention_capture_owner', 'consumer_retention_entitlement_owner', 'consumer_retention_foundation_owner', ACQ_OWNER, SEAL_OWNER].filter(r => !supers.includes(r));
    const got = await privilegeMatrix(ctx, roleNames);
    const want = [
      ...OWN(SEAL_OWNER, SEAL_SCHEMA, ['USAGE', 'CREATE']), ...OWN(SEAL_OWNER, TBL, TABLE_PRIVS), ...FN_SEAL.flatMap(f => OWN(SEAL_OWNER, `${SEAL_SCHEMA}.${f}`, ['EXECUTE'])),
      // the approved seams of this migration, and only them
      ...OWN(SEAL_OWNER, ENT, ['USAGE']), ...OWN(SEAL_OWNER, `${ENT}.producers`, ['SELECT']), ...OWN(SEAL_OWNER, `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`, ['EXECUTE']),
      // the accepted ENT1-A seams of the acquisition owner stay exactly as they were, with its own objects
      ...OWN(ACQ_OWNER, 'retention_capture', ['USAGE']), ...OWN(ACQ_OWNER, 'retention_capture.detail_capture_anchors', ['SELECT']), ...OWN(ACQ_OWNER, ENT, ['USAGE']), ...OWN(ACQ_OWNER, `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`, ['EXECUTE']),
      ...OWN(ACQ_OWNER, 'retention_acquisition', ['USAGE', 'CREATE']), ...OWN(ACQ_OWNER, 'retention_acquisition.detail_acquisition_records', TABLE_PRIVS), ...OWN(ACQ_OWNER, 'retention_acquisition.resolve_detail_acquisition(uuid)', ['EXECUTE']),
      // the predecessors keep exactly their own owners' privileges
      ...OWN('consumer_retention_capture_owner', 'retention_capture', ['USAGE', 'CREATE']), ...OWN('consumer_retention_capture_owner', 'retention_capture.detail_capture_anchors', TABLE_PRIVS),
      ...OWN('consumer_retention_capture_owner', 'retention_capture.capture_meal_record_insert()', ['EXECUTE']), ...OWN('consumer_retention_capture_owner', 'retention_capture.reject_anchor_update()', ['EXECUTE']),
      ...OWN('consumer_retention_entitlement_owner', ENT, ['USAGE', 'CREATE']), ...OWN('consumer_retention_entitlement_owner', `${ENT}.producers`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']), ...OWN('consumer_retention_entitlement_owner', `${ENT}.entitlement_events`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
      ...OWN('consumer_retention_entitlement_owner', `${ENT}.entitlement_coverage`, ['SELECT', 'INSERT', 'UPDATE', 'DELETE']), ...OWN('consumer_retention_entitlement_owner', `${ENT}.entitlement_state_at(uuid,timestamp with time zone)`, ['EXECUTE']),
      ...OWN('consumer_retention_entitlement_owner', `${ENT}.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)`, ['EXECUTE']), ...OWN('consumer_retention_entitlement_owner', `${ENT}.advance_entitlement_coverage(uuid,text,timestamp with time zone)`, ['EXECUTE'])
    ].sort();
    const unexpected = got.filter(x => !want.includes(x)), missing = want.filter(x => !got.includes(x));
    const reach = [];
    for (const r of ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'seal_nobody', ACQ_OWNER, 'consumer_retention_entitlement_owner']) if (!supers.includes(r)) for (const p of ['USAGE', 'MEMBER', 'SET']) if ((await q(ctx, 'select pg_has_role($1,$2,$3) v', [r, SEAL_OWNER, p]))[0].v) reach.push(`${r}:${p}`);
    const ok = pinned && roleOk && members === 0 && same(ownedSchemas, [SEAL_SCHEMA]) && owned.every(o => o.nspname === SEAL_SCHEMA) && ownedProcs.every(o => o.nspname === SEAL_SCHEMA) && ownedProcs.length === 6
      && same(cols, EXPECT_COLUMNS) && same(cons, EXPECT_CONSTRAINTS) && rls.r && rls.f && polOk && same(trgs, [{ tgname: 'seal_immutable', e: 'O' }, { tgname: 'seal_validate', e: 'O' }]) && fnOk
      && unexpected.length === 0 && missing.length === 0 && reach.length === 0;
    return R(ok, { pinned, own, roles, members, ownedProcs: ownedProcs.length, ownedSchemas, cols, cons, polOk, trgs, fns, fnOk, unexpected, missing, reach, supers });
  },
  async P09_CATALOG_DIFFERENCE_OUTSIDE_THE_NEW_SCHEMA_IS_EXACTLY_THE_FOUR_APPROVED_SEAMS(ctx) {
    const d = itemsDiff(ctx.items0, ctx.items1);
    const want = {
      'ns:retention_entitlement#acl': `${SEAL_OWNER}:USAGE:false:consumer_retention_entitlement_owner`,
      'class:retention_entitlement.producers#acl': `${SEAL_OWNER}:SELECT:false:consumer_retention_entitlement_owner`
    };
    const diffVal = k => { const b = ctx.items0.get(k), a = ctx.items1.get(k); return a.split(',').filter(x => !b.split(',').includes(x)); };
    const procKey = `proc:${ENT}.entitlement_state_at(p_owner uuid, p_instant timestamp with time zone)#acl`;
    const valuesOk = Object.entries(want).every(([k, v]) => same(diffVal(k), [v]) && ctx.items0.get(k).split(',').every(x => ctx.items1.get(k).split(',').includes(x)))
      && same(diffVal(procKey), [`${SEAL_OWNER}:EXECUTE:false:consumer_retention_entitlement_owner`]) && ctx.items0.get(procKey).split(',').every(x => ctx.items1.get(procKey).split(',').includes(x));
    const pol = ctx.items1.get('policy:retention_entitlement.producers.seal_owner_select#core');
    const polOk = pol === `r|t|${SEAL_OWNER}|true|`;
    // the accepted ENT1-A seams are untouched by name: they are not in the diff
    const acqSeamsUntouched = !d.changed.concat(d.added, d.removed).some(k => /acquisition|capture/.test(k));
    return R(same(d, EXPECTED_DELTA) && valuesOk && polOk && acqSeamsUntouched, { diff: d, expected: EXPECTED_DELTA, valuesOk, pol, acqSeamsUntouched });
  },
  async P10_MEAL_SAVE_AND_THE_ENT1A_RECEIPT_PATH_STILL_WORK_AND_NOTHING_WIRES_THE_SEAL(ctx) {
    const triggersBefore = (await q(ctx, "select tgname from pg_trigger where tgrelid='public.meal_records'::regclass and not tgisinternal order by 1")).map(x => x.tgname);
    const id = await realMeal(ctx, 6001); // real RPC as the authenticated eligible user: the capture trigger writes the anchor
    const anchor = (await q(ctx, 'select owner_user_id, original_recorded_at, capture_context from retention_capture.detail_capture_anchors where resource_id=$1', [id]))[0];
    // ENT1-A still records a receipt through the seams it already had (test-only producer and caller; the migrations grant nothing)
    const bill = await makeProducer(ctx, 'billing'); const t0 = isoMs(anchor.original_recorded_at);
    ctx.extraRoles.add('seal_acq_caller'); await ctx.g.query(ctx.su, 'create role seal_acq_caller login'); await ctx.g.query(ctx.su, 'grant usage on schema retention_acquisition to seal_acq_caller'); await ctx.g.query(ctx.su, 'grant execute on function retention_acquisition.resolve_detail_acquisition(uuid) to seal_acq_caller');
    const a = await admit(bill, ELIGIBLE, 'sub-real', 'paid', isoMs(new Date(Date.parse(t0) - 3600e3)), isoMs(new Date(Date.parse(t0) + 3600e3)));
    const cc = await ctx.open('seal_acq_caller'); const r = await call(cc, 'select retention_acquisition.resolve_detail_acquisition($1::uuid) s', [id]);
    const receipts = await count(ctx, 'retention_acquisition.detail_acquisition_records'); const seals = await count(ctx, TBL);
    const refs = (await q(ctx, "select n.nspname||'.'||p.proname n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname<>$1 and p.prosrc ~* '(retention_seal|record_registry_seal|registry_seal_covers)' order by 1", [SEAL_SCHEMA])).map(x => x.n);
    const viewRefs = (await q(ctx, "select c.relname from pg_class c where c.relkind in ('v','m') and pg_get_viewdef(c.oid) ilike '%retention_seal%'")).map(x => x.relname);
    const trigFns = await q(ctx, `select c.relname, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_class c on c.oid=t.tgrelid where p.pronamespace=to_regnamespace('${SEAL_SCHEMA}') and not t.tgisinternal order by 1,2`);
    const ext = (await q(ctx, "select extname from pg_extension where extname in ('pg_cron','pg_net','pg_background','pgmq')")).map(x => x.extname);
    const hits = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.name === 'node_modules' || e.name === '.git') continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs|json)$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); if (/retention_seal|record_registry_seal|registry_seal_covers/.test(t)) hits.push(path.relative(ROOT, p).replace(/\\/g, '/')); } } };
    for (const d of ['apps', 'packages', 'supabase/functions']) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));
    const ok = anchor.capture_context === 'authenticated_actor' && a.ok && r.ok && r.value.outcome === 'recorded' && receipts === 1 && seals === 0 && triggersBefore.length > 0
      && same(triggersBefore, (await q(ctx, "select tgname from pg_trigger where tgrelid='public.meal_records'::regclass and not tgisinternal order by 1")).map(x => x.tgname)) && !triggersBefore.some(t => /seal/i.test(t))
      && refs.length === 0 && viewRefs.length === 0 && same(trigFns.map(x => x.relname + '.' + x.proname), ['registry_seals.reject_seal_change', 'registry_seals.validate_seal']) && ext.length === 0 && hits.length === 0;
    return R(ok, { anchor: anchor.capture_context, a: a.ok, receipt: r.value?.outcome, receipts, seals, triggersBefore, refs, viewRefs, trigFns, ext, repoHits: hits });
  },
  async P11_CONCURRENT_SEALS_AND_REGISTRY_TRAFFIC_NEVER_DEADLOCK_AND_EVERY_SEAL_DIGEST_SURVIVES_THE_FINAL_REGISTRY(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing');
    const bill = await makeProducer(ctx, 'billing-direct'); const owner = await makeUser(ctx, 110);
    const clients = []; for (let i = 0; i < 8; i++) clients.push(await ctx.open(op.role));
    const res = await Promise.all(clients.map((c, i) => sealCall(c, E0, 'conc-' + i)));
    const outcome = r => r.ok ? r.value.outcome + (r.value.reason ? ':' + r.value.reason : '') : 'ERR:' + r.code;
    const first = res.map(outcome);
    // ones that lost only because the clock had not advanced a whole millisecond are retried sequentially; each reference ends up sealed exactly once
    for (let i = 0; i < res.length; i++) if (outcome(res[i]) === 'pending:SEAL_NOT_ADVANCED') { await sleep(5); res[i] = await sealCall(clients[i], E0, 'conc-' + i); }
    const afterRetry = res.map(outcome);
    const rows1 = await sealRows(ctx);
    // storm: registry writers (each commit stamped by the real guard), producer admit/advance on one owner, resolver readers, and seals, all at once
    const errs = []; let stop = false;
    const writer = (async () => { for (let i = 0; i < 6 && !stop; i++) { try { await ctx.g.query(ctx.su, `insert into ${ENT}.producers(namespace, role_name) values ($1,$2)`, ['storm-' + i, 'seal_storm_' + i]); } catch (e) { errs.push('writer:' + e.code); } await sleep(30); } })();
    const prod = (async () => { for (let i = 0; i < 20 && !stop; i++) { const a = await admit(bill, owner, 'far-' + i, 'paid', at(300 + i * 2), at(301 + i * 2)); if (!a.ok) errs.push('admit:' + a.code); const b = await advance(bill, owner, at(21 + i * 0.01)); if (!b.ok) errs.push('advance:' + b.code); } })();
    const readers = [0, 1].map(async k => { const c = await ctx.open('supabase_admin'); for (let i = 0; i < 20; i++) { const r = await call(c, `select ${ENT}.entitlement_state_at($1::uuid,$2::timestamptz) s`, [owner, at(10 + i)]); if (!r.ok) errs.push('state_at:' + r.code); } });
    const sealers = [0, 1, 2, 3, 4, 5].map(async k => { const c = clients[k]; for (let i = 0; i < 3; i++) { const r = await sealCall(c, E0, `storm-${k}-${i}`); if (!r.ok) errs.push('seal:' + r.code); else if (r.value.outcome === 'pending' && r.value.reason !== 'SEAL_NOT_ADVANCED') errs.push('seal-pending:' + r.value.reason); await sleep(10); } });
    await Promise.all([writer, prod, ...readers, ...sealers]); stop = true;
    await sleep(15); const fin = await sealCall(op.c, E0, 'conc-final');
    const cc = await chainConsistent(ctx);
    const firstOk = afterRetry.every(x => x === 'sealed');
    const ok = res.every(r => r.ok) && firstOk && rows1.length === 8 && errs.length === 0 && fin.ok && fin.value.outcome === 'sealed' && cc.bad.length === 0 && cc.rows >= 9 && !JSON.stringify(first).includes('ERR');
    return R(ok, { first, afterRetry, rows1: rows1.length, errs, chain: { rows: cc.rows, bad: cc.bad }, fin: fin.value?.outcome });
  },
  async P12_ROLLBACK_FAULTS_AND_RETRY_LEAVE_NOTHING_AND_AN_OPEN_SEAL_TRANSACTION_ONLY_DELAYS_REGISTRY_WRITERS(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); const out = {};
    // (a) the caller rolls back after a successful seal
    await op.c.query('begin'); const inTx = await sealCall(op.c, E0, 'rb-1'); await op.c.query('rollback').catch(() => {});
    out.rollback = { inTx: inTx.value?.outcome, rows: await count(ctx, TBL) };
    const retry = await sealCall(op.c, E0, 'rb-1'); out.retry = retry.value?.outcome;
    await sleep(15);
    // (b) a fault after the insert (row trigger) and at commit (deferred constraint trigger) removes the whole call
    await ctx.g.query(ctx.su, "create function public.seal_fault() returns trigger language plpgsql as $$ begin raise exception 'SEAL_TEST_FAULT' using errcode='P0001'; end $$");
    await ctx.g.query(ctx.su, `create trigger seal_fault after insert on ${TBL} for each row execute function public.seal_fault()`);
    const f1 = await sealCall(op.c, E0, 'rb-2'); const rowsF1 = await count(ctx, TBL, "attestation_ref='rb-2'");
    await ctx.g.query(ctx.su, `drop trigger seal_fault on ${TBL}`);
    await ctx.g.query(ctx.su, `create constraint trigger seal_fault after insert on ${TBL} deferrable initially deferred for each row execute function public.seal_fault()`);
    await op.c.query('begin'); const f2a = await sealCall(op.c, E0, 'rb-2'); const f2c = await call(op.c, 'commit'); await op.c.query('rollback').catch(() => {}); const rowsF2 = await count(ctx, TBL, "attestation_ref='rb-2'");
    await ctx.g.query(ctx.su, `drop trigger seal_fault on ${TBL}`); await ctx.g.query(ctx.su, 'drop function public.seal_fault()');
    const fixed = await sealCall(op.c, E0, 'rb-2');
    out.fault = { rowTrigger: f1.ok ? 'OK' : f1.code, rowsF1, deferred: { call: f2a.value?.outcome, commit: f2c.ok ? 'OK' : f2c.code }, rowsF2, afterRemoval: fixed.value?.outcome };
    // (c) an open seal transaction holds the registry lock until it ends: a registry writer waits for it (documented operator cost), and nothing is lost
    await sleep(15);
    const sc = await ctx.open(op.role); await sc.query('begin'); const open = await sealCall(sc, E0, 'rb-3');
    const w = await ctx.open('supabase_admin'); const wp = w.query(`insert into ${ENT}.producers(namespace, role_name) values ('behind-seal','seal_behind')`).then(() => 'INSERTED', e => 'ERR:' + e.code);
    const early = await waiting(wp); await sc.query('rollback'); const wr = await wp;
    out.open = { open: open.value?.outcome, writerWhileOpen: early, writerAfter: wr, rowsAfterRollback: await count(ctx, TBL, "attestation_ref='rb-3'") };
    const ok = out.rollback.inTx === 'sealed' && out.rollback.rows === 0 && out.retry === 'sealed'
      && !f1.ok && f1.code === 'P0001' && rowsF1 === 0 && f2a.ok && !f2c.ok && f2c.code === 'P0001' && rowsF2 === 0 && out.fault.afterRemoval === 'sealed'
      && out.open.open === 'sealed' && out.open.writerWhileOpen === 'WAITING' && out.open.writerAfter === 'INSERTED' && out.open.rowsAfterRollback === 0 && (await chainConsistent(ctx)).bad.length === 0;
    return R(ok, out);
  },
  async P13_REGISTRY_SEAL_COVERS_REPORTS_THE_ATTESTED_RANGE_ONLY_AND_NEVER_TAKES_A_LOCK(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing');
    const none = await covers(op.c, at(0));
    const r = await sealCall(op.c, at(-100), 'cov-1'); const s = sealOf(r); const S = Date.parse(s?.sealed_through);
    const E = Date.parse(at(-100));
    const probe = async t => { const c = await covers(op.c, new Date(t).toISOString()); return c.ok ? `${c.value.sealed}:${c.value.reason}:${c.value.seal?.seal_seq ?? '-'}` : 'ERR:' + c.code; };
    const got = { noSeal: none.ok ? `${none.value.sealed}:${none.value.reason}` : none.code, beforeEpoch: await probe(E - 1), atEpoch: await probe(E), middle: await probe(Math.floor((E + S) / 2)), atThrough: await probe(S), afterThrough: await probe(S + 1) };
    // read-only and lock-free: an open registry writer does not delay it, and it changes nothing
    const w = await ctx.open('supabase_admin'); await w.query('begin'); await w.query(`insert into ${ENT}.producers(namespace, role_name) values ('lock-probe','seal_lock_probe')`);
    const t = Date.now(); const during = await covers(op.c, new Date(S).toISOString()); const ms = Date.now() - t; await w.query('rollback');
    const bad = []; for (const v of [null, 'infinity', '-infinity']) bad.push((await call(op.c, `select ${SEAL_SCHEMA}.registry_seal_covers($1::timestamptz) s`, [v])).code);
    const ok = got.noSeal === 'false:NO_SEAL' && got.beforeEpoch === 'false:BEFORE_EPOCH:1' && got.atEpoch === 'true:null:1' && got.middle === 'true:null:1' && got.atThrough === 'true:null:1' && got.afterThrough === 'false:AFTER_SEALED_THROUGH:1'
      && during.ok && during.value.sealed === true && ms < 1000 && bad.every(x => x === '22023') && await count(ctx, TBL) === 1;
    return R(ok, { got, ms, bad });
  }
});

// ---- negative gates ---------------------------------------------------------------------------------------------------------------------------
// run a statement as a given role from the superuser connection; always rolled back
async function asRole(ctx, role, sql, values = []) {
  const c = await ctx.open('supabase_admin');
  try { await c.query('begin'); await c.query(`set local role ${role}`); const r = await c.query(sql, values); await c.query('rollback'); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { await c.query('rollback').catch(() => {}); return { ok: false, code: e.code ?? null, message: String(e.message) }; }
  finally { await c.end().catch(() => {}); }
}
const denied = r => !r.ok && r.code === '42501';
// a valid seal row (every cross-field rule satisfied) for direct-insert forgery tests; any single change must be rejected for its own reason
function forged(over = {}) {
  const base = { seal_seq: 1, epoch_from: at(-500), sealed_through: at(10), registry_digest: 'a'.repeat(64), producer_count: 1, attestation_ref: 'forged-1', sealed_by: 'seal_operator', sealed_at: at(10, 5), seal_policy: 'retention-registry-seal-v1' };
  return { ...base, ...over };
}
async function insertForged(ctx, row, { replica = false } = {}) {
  const cols = Object.keys(row);
  const ph = cols.map((c, i) => `$${i + 1}${/_at$|_through$|^epoch_from$/.test(c) ? '::timestamptz' : c === 'seal_seq' ? '::bigint' : c === 'producer_count' ? '::int' : ''}`);
  try { if (replica) { await ctx.su.query('begin'); await ctx.su.query("set local session_replication_role = 'replica'"); } await ctx.su.query(`insert into ${TBL}(${cols.join(',')}) values (${ph.join(',')})`, cols.map(c => row[c])); if (replica) await ctx.su.query('commit'); return { ok: true }; }
  catch (e) { if (replica) await ctx.su.query('rollback').catch(() => {}); return { ok: false, code: e.code ?? null, message: String(e.message), constraint: e.constraint ?? null }; }
}
Object.assign(GATES, {
  async N01_RUNTIME_ROLES_AND_THE_SEALED_OWNER_REACH_ONLY_WHAT_WAS_APPROVED(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); await addProducer(ctx, 'premium-trial', { registeredAt: at(-300) });
    const owner = await makeUser(ctx, 131); const bill = await makeProducer(ctx, 'billing-direct'); await admit(bill, owner, 'sub-1', 'paid', at(0), at(60));
    await sealCall(op.c, E0, 'n01-1');
    await ctx.g.query(ctx.su, 'create role seal_nobody login'); ctx.extraRoles.add('seal_nobody');
    const stmts = [
      [`select count(*) from ${TBL}`], [`insert into ${TBL}(seal_seq) values (99)`], [`update ${TBL} set sealed_at = sealed_at`], [`delete from ${TBL}`], [`truncate ${TBL}`],
      [`select ${SEAL_SCHEMA}.record_registry_seal($1::timestamptz,'x')`, [E0]], [`select ${SEAL_SCHEMA}.registry_seal_covers($1::timestamptz)`, [E0]], [`select ${SEAL_SCHEMA}.registry_digest_through(now())`],
      [`select ${ENT}.entitlement_state_at($1::uuid, now())`, [owner]], [`select count(*) from ${ENT}.producers`], [`select count(*) from ${ENT}.entitlement_events`],
      [`select ${ENT}.admit_entitlement_event($1::uuid,'billing','x','paid',now(),now()+interval '1 day',null)`, [owner]], [`create function ${SEAL_SCHEMA}.f() returns int language sql as 'select 1'`]
    ];
    const results = {};
    for (const role of ['anon', 'authenticated', 'authenticator', 'service_role', 'postgres', 'seal_nobody']) {
      results[role] = [];
      for (const [sql, v] of stmts) {
        const r = await asRole(ctx, role, sql, v ?? []);
        results[role].push(denied(r) ? 'denied' : r.ok && /^select count/.test(sql) && Number(r.rows[0].count) === 0 ? 'denied' : r.ok ? 'ALLOWED' : r.code);
      }
    }
    // the other retention owners reach nothing of the seal schema (the acquisition owner keeps only its accepted ENT1-A seams)
    const foreign = {};
    for (const role of [ACQ_OWNER, 'consumer_retention_capture_owner', 'consumer_retention_entitlement_owner']) {
      foreign[role] = [];
      for (const sql of [`select count(*) from ${TBL}`, `select ${SEAL_SCHEMA}.registry_seal_covers(now())`, `select ${SEAL_SCHEMA}.record_registry_seal(now(),'x')`]) foreign[role].push(denied(await asRole(ctx, role, sql)) ? 'denied' : 'ALLOWED');
    }
    const own = {};
    own.readProducers = await asRole(ctx, SEAL_OWNER, `select count(*)::int n from ${ENT}.producers`);
    own.entOwnerSeesNoSeals = await asRole(ctx, 'consumer_retention_entitlement_owner', `select count(*)::int n from ${TBL}`);
    own.callState = await asRole(ctx, SEAL_OWNER, `select ${ENT}.entitlement_state_at($1::uuid, now()) s`, [owner]);
    for (const [k, sql] of [['events', `select count(*) from ${ENT}.entitlement_events`], ['coverage', `select count(*) from ${ENT}.entitlement_coverage`], ['insertProducer', `insert into ${ENT}.producers(namespace, role_name) values ('x-seal','x_seal')`],
      ['updateProducer', `update ${ENT}.producers set retired_at = null`], ['deleteProducer', `delete from ${ENT}.producers`], ['truncateProducers', `truncate ${ENT}.producers`], ['admit', `select ${ENT}.admit_entitlement_event(gen_random_uuid(),'billing','x','paid',now(),now()+interval '1 day',null)`],
      ['advance', `select ${ENT}.advance_entitlement_coverage(gen_random_uuid(),'billing',now())`], ['anchors', 'select count(*) from retention_capture.detail_capture_anchors'], ['receipts', 'select count(*) from retention_acquisition.detail_acquisition_records'],
      ['resolve', `select retention_acquisition.resolve_detail_acquisition(gen_random_uuid())`], ['meals', 'select count(*) from public.meal_records']]) own[k] = await asRole(ctx, SEAL_OWNER, sql);
    const setRole = {};
    for (const login of ['seal_nobody', 'postgres']) { const c = await ctx.open(login); setRole[login] = await call(c, `set role ${SEAL_OWNER}`); await c.end().catch(() => {}); }
    const totalProducers = await count(ctx, `${ENT}.producers`);
    const roleOk = Object.values(results).every(rs => rs.every(x => x === 'denied')) && Object.values(foreign).every(rs => rs.every(x => x === 'denied')) && Object.values(setRole).every(r => !r.ok && r.code === '42501');
    const ownOk = own.readProducers.ok && own.readProducers.rows[0].n === totalProducers && totalProducers >= 3 && own.entOwnerSeesNoSeals.ok === false && own.callState.ok
      && ['events', 'coverage', 'insertProducer', 'updateProducer', 'deleteProducer', 'truncateProducers', 'admit', 'advance', 'anchors', 'receipts', 'resolve', 'meals'].every(k => denied(own[k])) && await count(ctx, TBL) === 1;
    return R(roleOk && ownOk, { setRole, results, foreign, own: Object.fromEntries(Object.entries(own).map(([k, v]) => [k, v.ok ? 'ok:' + JSON.stringify(v.rows?.[0] ?? v.rowCount).slice(0, 60) : v.code])), totalProducers });
  },
  async N02_SEALS_CANNOT_BE_CHANGED_OR_REMOVED_BY_STATEMENT(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); const first = await sealCall(op.c, E0, 'imm-1');
    const snap = async () => JSON.stringify(await sealRows(ctx));
    const before = await snap(); const tries = {};
    const run = async (label, sql) => { tries[label] = await ctx.g.query(ctx.su, sql).then(() => 'OK', e => e.code + ':' + String(e.message).slice(0, 30)); };
    await run('noop-update', `update ${TBL} set seal_seq = seal_seq`);
    await run('shorten-range', `update ${TBL} set sealed_through = sealed_through - interval '1 millisecond'`);
    await run('extend-range', `update ${TBL} set sealed_through = sealed_through + interval '1 day', sealed_at = sealed_at + interval '1 day'`);
    await run('move-epoch', `update ${TBL} set epoch_from = epoch_from - interval '1 day'`);
    await run('digest', `update ${TBL} set registry_digest = '${'b'.repeat(64)}'`);
    await run('attestation', `update ${TBL} set attestation_ref = 'changed'`);
    await run('delete', `delete from ${TBL}`);
    const after = await snap();
    const ok = first.ok && Object.values(tries).every(v => v.startsWith('23514:SEAL_IMMUTABLE')) && before === after;
    return R(ok, { tries, unchanged: before === after });
  },
  async N03_FORGED_DIRECT_INSERTS_ARE_REJECTED_EACH_FOR_ITS_OWN_REASON(ctx) {
    const results = [];
    const t = async (label, over, expectCode, expectText, opts = {}) => {
      const r = await insertForged(ctx, forged({ attestation_ref: 'f-' + label, ...over }), opts);
      results.push({ label, code: r.ok ? 'ACCEPTED' : r.code, text: r.ok ? null : (r.constraint ?? r.message.slice(0, 60)), expected: expectText, good: !r.ok && r.code === expectCode && (r.message.includes(expectText) || r.constraint === expectText) });
      if (r.ok) await ctx.su.query(`delete from ${TBL}`).catch(async () => { await regWrite(ctx, `delete from ${TBL}`); });
    };
    // positive control: the unmodified consistent row is accepted by the table (a superuser can write it; no claim is made against a superuser), so every variant below is rejected for its own reason
    { const r = await insertForged(ctx, forged({ attestation_ref: 'f-control' })); results.push({ label: 'control-consistent-row', good: r.ok }); await regWrite(ctx, `delete from ${TBL}`); }
    await t('seq-zero-trigger-first', { seal_seq: 0 }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('seq-zero-check-alone', { seal_seq: 0 }, '23514', 'seal_seq_positive', { replica: true });
    await t('digest-short', { registry_digest: 'abc' }, '23514', 'seal_digest_hex');
    await t('digest-uppercase', { registry_digest: 'A'.repeat(64) }, '23514', 'seal_digest_hex');
    await t('count-zero', { producer_count: 0 }, '23514', 'seal_count_positive');
    await t('ref-blank', { attestation_ref: '   ' }, '23514', 'seal_ref_valid');
    await t('ref-too-long', { attestation_ref: 'x'.repeat(501) }, '23514', 'seal_ref_valid');
    await t('sealed-by-empty', { sealed_by: '' }, '23514', 'seal_by_nonempty');
    await t('policy-wrong', { seal_policy: 'retention-registry-seal-v2' }, '23514', 'seal_policy_version');
    await t('epoch-after-through', { epoch_from: at(11) }, '23514', 'seal_epoch_not_after_through');
    await t('through-after-sealed-at', { sealed_at: at(9) }, '23514', 'seal_through_not_after_sealed');
    await t('through-not-millisecond', { sealed_through: new Date(Date.parse(at(10))).toISOString().replace(/\.000Z$/, '.000999Z') }, '23514', 'registry_seals_sealed_through_instant');
    await t('epoch-not-millisecond', { epoch_from: '2026-01-01T00:00:00.000999Z' }, '23514', 'registry_seals_epoch_from_instant');
    await t('sealed-at-infinity', { sealed_at: 'infinity' }, '23514', 'registry_seals_sealed_at_instant');
    // chain rules (row trigger, independent of the recording function)
    await t('first-seq-two', { seal_seq: 2 }, '23514', 'SEAL_CHAIN_BROKEN');
    { const r = await insertForged(ctx, forged({ attestation_ref: 'f-chain-1' })); results.push({ label: 'chain-first-row', good: r.ok }); }
    await t('seq-gap', { seal_seq: 3, sealed_through: at(11), sealed_at: at(11, 5) }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('seq-repeat', { seal_seq: 1, sealed_through: at(11), sealed_at: at(11, 5) }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('seq-repeat-pkey-alone', { seal_seq: 1, sealed_through: at(11), sealed_at: at(11, 5) }, '23505', 'registry_seals_pkey', { replica: true });
    await t('epoch-changed', { seal_seq: 2, epoch_from: at(-499), sealed_through: at(11), sealed_at: at(11, 5) }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('through-not-advanced', { seal_seq: 2, sealed_through: at(10), sealed_at: at(11, 5) }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('through-regressed', { seal_seq: 2, sealed_through: at(9), sealed_at: at(11, 5) }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('sealed-at-regressed', { seal_seq: 2, sealed_through: at(10, 1), sealed_at: at(10, 2) }, '23514', 'SEAL_CHAIN_BROKEN');
    await t('ref-duplicate', { seal_seq: 2, attestation_ref: 'f-chain-1', sealed_through: at(11), sealed_at: at(11, 5) }, '23505', 'seal_ref_unique');
    { const r = await insertForged(ctx, forged({ seal_seq: 2, attestation_ref: 'f-chain-2', producer_count: 2, sealed_through: at(11), sealed_at: at(11, 5) })); results.push({ label: 'chain-second-row', good: r.ok }); }
    await t('count-regressed-real', { seal_seq: 3, producer_count: 1, sealed_through: at(12), sealed_at: at(12, 5) }, '23514', 'SEAL_CHAIN_BROKEN');
    const rows = await count(ctx, TBL);
    return R(results.every(r => r.good) && rows === 2, { results: results.filter(r => !r.good).length ? results : results.map(r => r.label + ':' + r.code + ':' + r.text), rows });
  },
  async N04_INVALID_ARGUMENTS_ISOLATION_DIRTY_AND_READ_ONLY_TRANSACTIONS_ARE_REFUSED(ctx) {
    const op = await makeOperator(ctx); await addProducer(ctx, 'billing'); const rows0 = await count(ctx, TBL); const out = {};
    const code = r => (r.ok ? 'OK:' + r.value.outcome : r.code + ':' + r.message.split('\n')[0].slice(0, 36));
    out.args = [];
    for (const [e, ref] of [[null, 'x'], ['infinity', 'x'], ['2026-01-01T00:00:00.000999Z', 'x'], [E0, null], [E0, ''], [E0, '   '], [E0, 'x'.repeat(501)]]) out.args.push(code(await sealCall(op.c, e, ref)));
    out.future = code(await sealCall(op.c, new Date(Date.now() + 3600e3).toISOString(), 'future-epoch'));
    // (a) a clean explicit transaction works; (b) any earlier write refuses; (c) a registry write in the same transaction refuses (the two-SHARE deadlock form cannot start); (d) a second recording seal in one transaction refuses; (e) savepoint rollback still counts as written
    { const c = await ctx.open(op.role); await c.query('begin'); out.clean = code(await sealCall(c, E0, 'tx-clean')); await c.query('commit'); }
    // a later seal may not change the epoch (the function refuses it; the row trigger is a second line of defence)
    await sleep(15); out.epochMismatch = code(await sealCall(op.c, at(-499), 'tx-epoch-b'));
    { const c = await ctx.open(op.role); await c.query('begin'); await c.query('create temp table seal_scratch(i int)'); await c.query('insert into seal_scratch values (1)'); out.afterWrite = code(await sealCall(c, E0, 'tx-dirty')); await c.query('rollback'); }
    { const c = await ctx.open('supabase_admin'); await c.query('begin'); await c.query(`insert into ${ENT}.producers(namespace, role_name) values ('same-tx-reg','seal_same_tx')`); out.afterRegistryWrite = code(await sealCall(c, E0, 'tx-reg')); await c.query('rollback'); }
    { await sleep(15); const c = await ctx.open(op.role); await c.query('begin'); const r1 = await sealCall(c, E0, 'tx-two-a'); const r2 = await sealCall(c, E0, 'tx-two-b'); await c.query('rollback'); out.second = [code(r1), code(r2)]; }
    { const c = await ctx.open(op.role); await c.query('begin'); await c.query('create temp table seal_s2(i int)'); await c.query('savepoint s'); await c.query('insert into seal_s2 values (1)'); await c.query('rollback to savepoint s'); out.afterSavepointRollback = code(await sealCall(c, E0, 'tx-sp')); await c.query('rollback'); }
    out.iso = []; for (const lvl of ['repeatable read', 'serializable']) { const c = await ctx.open(op.role); await c.query(`begin isolation level ${lvl}`); out.iso.push(code(await sealCall(c, E0, 'tx-iso-' + lvl.length))); await c.query('rollback'); }
    { const c = await ctx.open(op.role); await c.query('begin read only'); out.readOnly = code(await sealCall(c, E0, 'tx-ro')); await c.query('rollback'); }
    // covers() is a read: refusing nothing but invalid arguments, allowed in read-only and any isolation level
    { const c = await ctx.open(op.role); await c.query('begin isolation level serializable read only'); out.coversRo = code(await covers(c, E0)); await c.query('rollback'); }
    const rowsAfter = await count(ctx, TBL, "attestation_ref like 'tx-%' and attestation_ref not in ('tx-clean')");
    const ok = rows0 === 0 && out.args.every(x => x.startsWith('22023:SEAL_INVALID_ARGUMENT')) && out.future.startsWith('22023:SEAL_EPOCH_IN_FUTURE') && out.clean === 'OK:sealed' && out.epochMismatch.startsWith('23514:SEAL_EPOCH_MISMATCH')
      && out.afterWrite.startsWith('25000:SEAL_DIRTY_TRANSACTION') && out.afterRegistryWrite.startsWith('25000:SEAL_DIRTY_TRANSACTION') && out.second[0] === 'OK:sealed' && out.second[1].startsWith('25000:SEAL_DIRTY_TRANSACTION')
      && out.afterSavepointRollback.startsWith('25000:SEAL_DIRTY_TRANSACTION') && out.iso.every(x => x.startsWith('0A000:SEAL_ISOLATION_UNSUPPORTED')) && out.readOnly.startsWith('25006') && /^OK/.test(out.coversRo) && rowsAfter === 0;
    return R(ok, { ...out, rowsAfter });
  }
});

// ---- static source whitelist -----------------------------------------------------------------------------------------------------------------
Object.assign(GATES, {
  async N07_FUNCTION_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST(ctx) {
    const rows = await q(ctx, "select p.proname, pg_get_functiondef(p.oid) def, p.prosecdef, p.provolatile::text v, p.proconfig, pg_get_userbyid(p.proowner) owner from pg_proc p where p.pronamespace=$1::regnamespace order by 1", [SEAL_SCHEMA]);
    const body = def => def.replace(/^[\s\S]*?AS \$(function|[a-z_]+)\$/, '').replace(/--.*$/gm, '');
    const rec = rows.find(x => x.proname === 'record_registry_seal'); const b = body(rec.def);
    const n = re => (b.match(re) ?? []).length; const pos = s => b.indexOf(s);
    const order = ['transaction_isolation', 'pg_current_xact_id_if_assigned', 'pg_advisory_xact_lock', 'WHERE s.attestation_ref', 'entitlement_state_at(', 'SEAL_EPOCH_IN_FUTURE', 'ORDER BY s.seal_seq DESC', 'registry_digest_through(v_prev.sealed_through)', 'FROM retention_entitlement.producers p WHERE p.registered_at <= v_through', 'INSERT INTO'].map(pos);
    const inOrder = order.every((p, i) => p >= 0 && (i === 0 || p > order[i - 1]));
    const banned = /\b(now\s*\(\)|transaction_timestamp|statement_timestamp|current_timestamp|localtimestamp|current_date|subscription_entitlements|meal_records|meal_record_items|auth\.|request\.|jwt|tastkind\.|retention_internal|retention_capture|retention_acquisition|entitlement_events|entitlement_coverage|admit_entitlement_event|advance_entitlement_coverage|dblink|pg_notify|COPY\b)/i;
    const counts = { stateAt: n(/entitlement_state_at\(/g), clock: n(/clock_timestamp\(\)/g), xactLock: n(/pg_advisory_xact_lock\(/g), sessionLock: n(/pg_(try_)?advisory_lock/g), dynamic: n(/\bEXECUTE\b/g), onConflict: n(/ON CONFLICT/gi), insert: n(/INSERT INTO/g), update: n(/\bUPDATE\b/g), delete: n(/\bDELETE\b/g), dirty: n(/pg_current_xact_id_if_assigned/g), iso: n(/transaction_isolation/g), digestCalls: n(/registry_digest_through\(/g), producerReads: n(/retention_entitlement\.producers/g) };
    const others = rows.filter(x => x.proname !== 'record_registry_seal');
    const covers_ = others.find(x => x.proname === 'registry_seal_covers'); const dig = others.find(x => x.proname === 'registry_digest_through');
    const noClock = x => !/\b(now\s*\(\)|clock_timestamp|transaction_timestamp|statement_timestamp|current_timestamp)/i.test(body(x.def));
    const ok = rec.prosecdef && rec.v === 'v' && rec.owner === SEAL_OWNER && same(rec.proconfig, ['search_path=""', 'lock_timeout=2s']) && inOrder && !banned.test(b)
      && counts.stateAt === 1 && counts.clock === 1 && counts.xactLock === 1 && counts.sessionLock === 0 && counts.dynamic === 0 && counts.onConflict === 0 && counts.insert === 1 && counts.update === 0 && counts.delete === 0 && counts.dirty === 1 && counts.iso === 1 && counts.digestCalls === 2 && counts.producerReads === 1
      && others.every(o => o.owner === SEAL_OWNER) && others.every(noClock) && !banned.test(body(covers_.def)) && !/retention_entitlement/.test(body(covers_.def)) && /FROM retention_entitlement\.producers p WHERE p\.registered_at <= p_through/.test(body(dig.def)) && !/\b(INSERT|UPDATE|DELETE)\b/.test(body(dig.def));
    return R(ok, { counts, order, inOrder, bannedHit: banned.exec(b)?.[0] ?? null, proconfig: rec.proconfig, others: others.map(o => [o.proname, o.prosecdef, o.v, noClock(o)]) });
  }
});

// ---- migration-level gates (each runs against a database where ENT0 and ENT1-A are applied and the ENT-R migration is NOT yet) ----------------------------------------
async function persistedNone(ctx) {
  return (await ctx.g.query(ctx.su, `select (select count(*)::int from pg_roles where rolname in ($1,$2)) roles, to_regnamespace('${SEAL_SCHEMA}') is not null schema, (select count(*)::int from pg_auth_members m join pg_roles r on r.oid in (m.roleid,m.member,m.grantor) where r.rolname in ($1,$2)) members`, [SEAL_OWNER, SEAL_BUILDER])).rows[0];
}
const noneLeft = p => p.roles === 0 && !p.schema && p.members === 0;
const membersJson = async ctx => JSON.stringify((await ctx.g.query(ctx.su, "select roleid,member,grantor from pg_auth_members where roleid::regrole::text !~ '^(authenticated|anon|service_role)' order by 1,2,3")).rows);
// The seven existence conditions of the migration's predecessor check, observed one by one (a partial-absence case must prove that EXACTLY the intended objects are absent before the migration is applied).
export const PREDECESSOR_PRESENT_SQL = `select to_regclass('auth.users') is not null auth_users, to_regclass('retention_capture.detail_capture_anchors') is not null anchors,
  to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') is not null state_at, to_regclass('retention_entitlement.producers') is not null producers,
  to_regclass('retention_acquisition.detail_acquisition_records') is not null acq_table, to_regprocedure('retention_acquisition.resolve_detail_acquisition(uuid)') is not null acq_fn, to_regnamespace('retention_internal') is not null internal`;
// Snapshot identities and full catalog attributes, not just presence counts. All roles and memberships
// are included; the private seal schema also includes relations, columns, functions, ACLs and policies.
export async function applicationSnapshot(ctx) {
  const ns = `(select oid from pg_namespace where nspname=$1)`;
  const parts = [
    `select 'role:'||r.oid k, to_jsonb(r)::text v from pg_roles r`,
    `select 'member:'||m.oid k, to_jsonb(m)::text v from pg_auth_members m`,
    `select 'schema:'||n.oid k, to_jsonb(n)::text v from pg_namespace n where n.oid in ${ns}`,
    `select 'class:'||c.oid k, to_jsonb(c)::text v from pg_class c where c.relnamespace in ${ns}`,
    `select 'attribute:'||a.attrelid||':'||a.attnum k, to_jsonb(a)::text v from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace in ${ns}`,
    `select 'function:'||p.oid k, to_jsonb(p)::text v from pg_proc p where p.pronamespace in ${ns}`,
    `select 'type:'||t.oid k, to_jsonb(t)::text v from pg_type t where t.typnamespace in ${ns}`,
    `select 'constraint:'||c.oid k, to_jsonb(c)::text v from pg_constraint c where c.connamespace in ${ns}`,
    `select 'trigger:'||t.oid k, to_jsonb(t)::text v from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace in ${ns}`,
    `select 'policy:'||p.oid k, to_jsonb(p)::text v from pg_policy p join pg_class c on c.oid=p.polrelid where c.relnamespace in ${ns}`,
    `select 'default:'||d.oid k, to_jsonb(d)::text v from pg_attrdef d join pg_class c on c.oid=d.adrelid where c.relnamespace in ${ns}`,
    `select 'index:'||i.indexrelid k, to_jsonb(i)::text v from pg_index i join pg_class c on c.oid=i.indexrelid where c.relnamespace in ${ns}`,
    `select 'default-acl:'||d.oid k, to_jsonb(d)::text v from pg_default_acl d where d.defaclnamespace in ${ns} or d.defaclrole in (select oid from pg_roles where rolname in ($2,$3))`
  ];
  const rows = (await ctx.g.query(ctx.su, parts.join(' union all '), [SEAL_SCHEMA, SEAL_OWNER, SEAL_BUILDER])).rows;
  return { objects: rows.map(r => [r.k, JSON.parse(r.v)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), catalog: await catalogItems(ctx) };
}
// A DDL notice is an entry signal only. Persisted additions and modifications come from before/after.
export function applicationEvidence(before, after, enteredDdlBoundary) {
  const b = new Map(before.objects.map(([k, v]) => [k, JSON.stringify(v)])), a = new Map(after.objects.map(([k, v]) => [k, JSON.stringify(v)]));
  const delta = itemsDiff(b, a), diff = itemsDiff(before.catalog, after.catalog);
  const newObjectsPersisted = delta.added.map(k => ({ identity: k, after: JSON.parse(a.get(k)) }));
  const existingObjectsChanged = [...delta.changed, ...delta.removed].map(k => ({ identity: k, before: JSON.parse(b.get(k)), after: a.has(k) ? JSON.parse(a.get(k)) : null }));
  const catalogChanges = [...diff.added, ...diff.changed, ...diff.removed].map(k => ({ key: k, before: before.catalog.get(k) ?? null, after: after.catalog.get(k) ?? null }));
  const preexistingObjectsUnchanged = existingObjectsChanged.length === 0 && diff.changed.length === 0 && diff.removed.length === 0;
  return { observationVersion: 2, enteredDdlBoundary, preexistingObjects: before.objects, objectsAfter: after.objects, newObjectsPersisted, existingObjectsChanged, preexistingObjectsUnchanged, diff, catalogChanges,
    stateUnchanged: preexistingObjectsUnchanged && newObjectsPersisted.length === 0 && diff.added.length === 0 };
}
// The error field is a REQUIRED part of an observation, never inferred from absence or truthiness:
//   null                      -> a valid, explicitly recorded success (no PostgreSQL error). It must be backed by persisted additions, otherwise it is a contradiction.
//   {code: SQLSTATE, message} -> a valid recorded PostgreSQL refusal (exactly these two keys; code is a five-character SQLSTATE; message is a non-empty string).
//   anything else (missing key, undefined, {}, string, number, array, partial or extra-key record, non-SQLSTATE code) -> the observation is rejected, no classification is produced.
const SQLSTATE = /^[0-9A-Z]{5}$/;
export function errorObservation(c) {
  if (!Object.prototype.hasOwnProperty.call(c, 'error')) throw Error('APPLICATION_OBSERVATION_INCOMPLETE ' + c.label + ' error-missing');
  const e = c.error;
  if (e === null) return 'success';
  const keys = e !== null && typeof e === 'object' && !Array.isArray(e) ? Object.keys(e).sort() : null;
  if (!keys || keys.length !== 2 || keys[0] !== 'code' || keys[1] !== 'message' || typeof e.code !== 'string' || !SQLSTATE.test(e.code) || typeof e.message !== 'string' || !e.message.length) throw Error('APPLICATION_OBSERVATION_INVALID ' + c.label + ' error-not-null-or-sqlstate-record');
  return 'failure';
}
// ---- case kind, case identity and N06 provenance (C3) ----------------------------------------------------------------------------------------
// The CALLER states which gate the observations come from ('N05' or 'N06'); the rows never decide which checks apply. A missing or unknown kind is rejected, there is no content-based fallback.
// Case identity comes from trusted constants (the case specs of the gate), not from whichever fields a row happens to carry:
//   N05 rows : label of an N05 or META case and an expectPrefix; they must NOT carry any N06 concurrency field.
//   N06 rows : label must be a known N06 drift case (its expected refusal must equal the trusted spec) or a known N06 fault case. A drift case MUST carry complete baseline provenance;
//              a fault case is not concurrent and must not carry concurrency fields. Any other label is rejected.
// N06 concurrent rows must carry their baseline provenance: launch snapshot + exactly the external drift delta; never a snapshot taken after the migration already ran.
export const N06_BASELINE_PHASE = 'launch-snapshot-plus-external-delta';
export const N06_DRIFT_EXPECT = Object.freeze({
  'role-created': 'SEAL_POST_GUARD_DRIFT', 'public-table-acl': 'SEAL_POST_GUARD_DRIFT', 'membership': 'SEAL_POST_GUARD_DRIFT', 'extra-registry-policy': 'SEAL_POST_GUARD_DRIFT', 'acquisition-table-acl': 'SEAL_POST_GUARD_DRIFT',
  'registry-granted-to-runtime-meanwhile': 'SEAL_SEAM_STATE_MISMATCH', 'state-at-granted-to-runtime-meanwhile': 'SEAL_SEAM_STATE_MISMATCH', 'entitlement-schema-granted-meanwhile': 'SEAL_SEAM_STATE_MISMATCH'
});
export const N06_DRIFT_LABELS = Object.freeze(Object.keys(N06_DRIFT_EXPECT));
export const N06_FAULT_LABELS = Object.freeze(['builder-created', 'owner-granted', 'tables-built', 'functions-owned', 'seam-policy-created', 'seams-granted', 'builder-dropped']);
export const APPLICATION_CASE_KINDS = Object.freeze(['N05', 'N06']);
const N06_CONCURRENT_FIELDS = Object.freeze(['paused', 'baseline', 'baselinePhase', 'externalDeltaSize']);
const N05_LABEL = /^(?:N05[a-z0-9]*-|META-)[A-Za-z0-9._-]+$/;
const reject = (kindOfError, c, what) => Error(`APPLICATION_OBSERVATION_${kindOfError} ${typeof c?.label === 'string' ? c.label : '<no-label>'} ${what}`);
function requireKind(kind) { if (!APPLICATION_CASE_KINDS.includes(kind)) throw Error('APPLICATION_OBSERVATION_INCOMPLETE case-kind-context'); }
function caseIdentity(c, kind) {
  requireKind(kind);
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw reject('INCOMPLETE', c, 'row-not-object');
  if (typeof c.label !== 'string' || !c.label.length) throw reject('INCOMPLETE', c, 'case-label');
  const carried = N06_CONCURRENT_FIELDS.filter(k => Object.prototype.hasOwnProperty.call(c, k));
  if (kind === 'N05') {
    if (!N05_LABEL.test(c.label) || typeof c.expectPrefix !== 'string' || !c.expectPrefix.length) throw reject('INVALID', c, 'n05-case-identity');
    if (carried.length) throw reject('INCONSISTENT', c, 'n05-row-carries-n06-fields:' + carried.join(','));
    return 'n05';
  }
  if (Object.prototype.hasOwnProperty.call(N06_DRIFT_EXPECT, c.label)) {
    if (c.expect !== N06_DRIFT_EXPECT[c.label]) throw reject('INCONSISTENT', c, 'drift-expected-refusal-not-the-trusted-spec');
    return 'drift';
  }
  if (N06_FAULT_LABELS.includes(c.label)) {
    if (carried.length) throw reject('INCONSISTENT', c, 'fault-row-carries-concurrency-fields:' + carried.join(','));
    return 'fault';
  }
  throw reject('INVALID', c, 'unknown-n06-case-label');
}
const arrays = (o, keys) => !!o && typeof o === 'object' && !Array.isArray(o) && keys.every(k => Array.isArray(o[k]));
function verifyN06Baseline(c) {
  const b = c.baseline;
  if (Object.prototype.hasOwnProperty.call(c, 'baselinePhase')) throw reject('INCONSISTENT', c, 'legacy-baselinePhase-marker');
  if (c.paused !== true) throw reject('INCOMPLETE', c, 'paused');
  if (!b || typeof b !== 'object' || Array.isArray(b) || b.phase !== N06_BASELINE_PHASE || !Array.isArray(b.launchObjects) || !Array.isArray(b.overlap)
    || !b.externalDelta || !arrays(b.externalDelta.objects, ['added', 'changed', 'removed']) || !arrays(b.externalDelta.catalog, ['added', 'changed', 'removed'])) throw reject('INCOMPLETE', c, 'baseline-provenance');
  const size = ['objects', 'catalog'].reduce((n, k) => n + b.externalDelta[k].added.length + b.externalDelta[k].changed.length + b.externalDelta[k].removed.length, 0);
  if (!Number.isInteger(c.externalDeltaSize) || c.externalDeltaSize !== size) throw reject('INCOMPLETE', c, 'externalDeltaSize-missing-or-not-the-recorded-delta');
  if (b.overlap.length) throw reject('INCONSISTENT', c, 'baseline-overlap');
  const expected = new Map(b.launchObjects.map(([k, v]) => [k, JSON.stringify(v)])), d = b.externalDelta.objects;
  for (const [k, v] of [...d.added, ...d.changed]) expected.set(k, JSON.stringify(v));
  for (const k of d.removed) expected.delete(k);
  const got = new Map(c.preexistingObjects.map(([k, v]) => [k, JSON.stringify(v)]));
  if (expected.size !== got.size || [...expected].some(([k, v]) => got.get(k) !== v)) throw reject('INCONSISTENT', c, 'baseline-not-launch-plus-external-delta');
}
export function deriveApplicationClass(observations, kind) {
  requireKind(kind);
  if (!Array.isArray(observations) || observations.some(c => !c || typeof c !== 'object' || typeof c.pass !== 'boolean')) throw Error('APPLICATION_OBSERVATION_INCOMPLETE pass-flag');
  // Every observation, failed or not, must have a legal identity for the declared kind before anything is classified.
  for (const c of observations) caseIdentity(c, kind);
  const bad = observations.filter(c => !c.pass);
  if (!bad.length) throw Error('NO_FAILED_APPLICATION_CASES');
  const clean = c => {
    if (c.observationVersion !== 2 || typeof c.enteredDdlBoundary !== 'boolean' || !Array.isArray(c.preexistingObjects) || !Array.isArray(c.objectsAfter) || !Array.isArray(c.catalogChanges)) throw reject('INCOMPLETE', c, 'observation-shape');
    const identity = caseIdentity(c, kind), errKind = errorObservation(c);
    if (identity === 'drift') verifyN06Baseline(c);
    const before = new Map(), after = new Map();
    for (const r of c.catalogChanges) { if (r.before !== null) before.set(r.key, r.before); if (r.after !== null) after.set(r.key, r.after); }
    const e = applicationEvidence({ objects: c.preexistingObjects, catalog: before }, { objects: c.objectsAfter, catalog: after }, c.enteredDdlBoundary);
    for (const k of ['newObjectsPersisted', 'existingObjectsChanged', 'preexistingObjectsUnchanged', 'diff', 'stateUnchanged']) if (!same(c[k], e[k])) throw Error('APPLICATION_OBSERVATION_INCONSISTENT ' + c.label + ' ' + k);
    // A recorded success that persisted nothing is contradictory (the migration always installs objects when it succeeds).
    if (errKind === 'success') { if (!e.newObjectsPersisted.length) throw Error('APPLICATION_OBSERVATION_INCONSISTENT ' + c.label + ' success-without-additions'); return false; }
    return e.stateUnchanged;
  };
  // Validate every failed row even if an earlier one already demonstrates a behavioural difference.
  return bad.map(clean).every(Boolean) ? 'message-overlap' : 'behavioural';
}
// Pure contract checks of the classifier against REAL receipts (rows of the F03 controls). Mutates copies only; runs without PostgreSQL.
export function classifierContractChecks(receipts) {
  const get = id => receipts.find(r => r.id === id)?.observed;
  const failure = get('META-role-Z64'), success = get('META-successful-install'), residue = get('META-committed-residue'), changed = get('META-existing-role-changed-no-additions');
  if (!failure || !success || !residue || !changed) throw Error('CLASSIFIER_CONTRACT_RECEIPTS_MISSING');
  const clone = v => JSON.parse(JSON.stringify(v));
  const cls = r => { try { return deriveApplicationClass([{ ...clone(r), pass: false }], 'N05'); } catch (e) { return 'REJECTED:' + String(e.message); } };
  const without = (r, k) => { const x = clone(r); delete x[k]; return x; };
  const withError = (r, v) => ({ ...clone(r), error: v });
  const rejected = x => typeof x === 'string' && x.startsWith('REJECTED:');
  const rows = [
    ['valid recorded refusal, state unchanged', cls(failure), 'message-overlap'],
    ['valid recorded success with additions', cls(success), 'behavioural'],
    ['valid refusal but state changed (committed residue)', cls(residue), 'behavioural'],
    ['valid refusal but existing object changed', cls(changed), 'behavioural'],
    ['error key missing', cls(without(failure, 'error')), 'REJECT'],
    ['error undefined', cls(withError(failure, undefined)), 'REJECT'],
    ['error empty object', cls(withError(failure, {})), 'REJECT'],
    ['error string', cls(withError(failure, 'SEAL_ALREADY_PRESENT')), 'REJECT'],
    ['error empty string', cls(withError(failure, '')), 'REJECT'],
    ['error number', cls(withError(failure, 42)), 'REJECT'],
    ['error true', cls(withError(failure, true)), 'REJECT'],
    ['error array', cls(withError(failure, [failure.error])), 'REJECT'],
    ['error without message', cls(withError(failure, { code: failure.error.code })), 'REJECT'],
    ['error without code', cls(withError(failure, { message: failure.error.message })), 'REJECT'],
    ['error with empty message', cls(withError(failure, { code: failure.error.code, message: '' })), 'REJECT'],
    ['error with non-SQLSTATE code', cls(withError(failure, { code: 'ECONNRESET', message: failure.error.message })), 'REJECT'],
    ['error with null code', cls(withError(failure, { code: null, message: failure.error.message })), 'REJECT'],
    ['error with non-string message', cls(withError(failure, { code: failure.error.code, message: 7 })), 'REJECT'],
    ['error with extra key', cls(withError(failure, { ...failure.error, extra: 1 })), 'REJECT'],
    ['success recorded but nothing persisted (contradiction)', cls(withError(failure, null)), 'REJECT'],
    ['refusal recorded but derived field falsified', cls({ ...clone(failure), stateUnchanged: false }), 'REJECT'],
    ['pass flag missing', (() => { try { deriveApplicationClass([without(failure, 'pass')], 'N05'); return 'ACCEPTED'; } catch { return 'REJECT'; } })(), 'REJECT'],
    ['one valid behavioural row cannot hide an invalid sibling', (() => { try { return deriveApplicationClass([{ ...clone(residue), pass: false }, { ...without(failure, 'error'), pass: false }], 'N05'); } catch { return 'REJECT'; } })(), 'REJECT'],
    ['no failed rows', (() => { try { return deriveApplicationClass([{ ...clone(failure), pass: true }], 'N05'); } catch { return 'REJECT'; } })(), 'REJECT']
  ].map(([name, got, want]) => ({ name, got: rejected(got) ? 'REJECT' : got, want, detail: rejected(got) ? got : undefined, ok: (rejected(got) ? 'REJECT' : got) === want }));
  return R(rows.every(r => r.ok), rows);
}
// Pure checks of expectedBaseline() on synthetic snapshots: own commits stay visible, external drift is absorbed, overlaps are never absorbed.
export function baselineContractChecks() {
  const snap = (objs, cat) => ({ objects: Object.entries(objs).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => [k, { v }]), catalog: new Map(Object.entries(cat)) });
  const keys = e => e.snapshot.objects.map(([k]) => k);
  const launch = snap({ a: 1, b: 1 }, { x: '1' });
  const own = expectedBaseline(launch, snap({ a: 1, b: 1, own: 1 }, { x: '1' }), snap({ a: 1, b: 1, own: 1, ext: 1 }, { x: '1' }));
  const ownCatalog = expectedBaseline(launch, snap({ a: 1, b: 1 }, { x: '2' }), snap({ a: 1, b: 1, ext: 1 }, { x: '2' }));
  const onlyExternal = expectedBaseline(launch, snap({ a: 1, b: 1 }, { x: '1' }), snap({ a: 1, b: 2, ext: 1 }, { x: '3' }));
  const removed = expectedBaseline(launch, snap({ a: 1, b: 1 }, { x: '1' }), snap({ b: 1 }, { x: '1' }));
  const noDrift = expectedBaseline(launch, snap({ a: 1, b: 1, own: 1 }, { x: '1' }), snap({ a: 1, b: 1, own: 1 }, { x: '1' }));
  const overlap = expectedBaseline(launch, snap({ a: 1, b: 5 }, { x: '1' }), snap({ a: 1, b: 6 }, { x: '1' }));
  const rows = [
    ['migration-committed object before the pause is NOT in the expected baseline; external drift is', same(keys(own), ['a', 'b', 'ext']) && own.baseline.overlap.length === 0 && own.baseline.externalDelta.objects.added.length === 1 && own.baseline.externalDelta.objects.added[0][0] === 'ext'],
    ['migration-committed catalog change before the pause is NOT absorbed', ownCatalog.snapshot.catalog.get('x') === '1' && ownCatalog.baseline.externalDelta.catalog.changed.length === 0],
    ['external change and external addition are absorbed into the baseline', onlyExternal.snapshot.catalog.get('x') === '3' && same(keys(onlyExternal), ['a', 'b', 'ext']) && JSON.stringify(onlyExternal.snapshot.objects.find(([k]) => k === 'b')[1]) === JSON.stringify({ v: 2 })],
    ['external removal is absorbed into the baseline', same(keys(removed), ['b']) && removed.baseline.externalDelta.objects.removed.length === 1],
    ['no external drift leaves the launch state exactly (no blanket absorption of the post-pause state)', same(keys(noDrift), ['a', 'b']) && noDrift.baseline.externalDelta.objects.added.length === 0],
    ['a key both the migration and the drift changed is an overlap and stays at its launch value', same(overlap.baseline.overlap, ['object:b']) && JSON.stringify(overlap.snapshot.objects.find(([k]) => k === 'b')[1]) === JSON.stringify({ v: 1 })]
  ].map(([name, ok]) => ({ name, ok: !!ok }));
  return R(rows.every(r => r.ok), rows);
}
// Probes that the classifier refuses N06 concurrent rows whose baseline provenance is missing, old-style or tampered. `row` is a real, valid N06 drift row.
export function n06ProvenanceChecks(row) {
  const clone = v => JSON.parse(JSON.stringify(v));
  const verdict = r => { try { return deriveApplicationClass([{ ...clone(r), pass: false }], 'N06'); } catch (e) { return 'REJECT'; } };
  const noBaseline = clone(row); delete noBaseline.baseline;
  const oldStyle = clone(row); oldStyle.baseline = { ...oldStyle.baseline, phase: 'after-external-drift-before-unpause' };
  const swallowed = clone(row); swallowed.preexistingObjects = [...swallowed.preexistingObjects, ...swallowed.newObjectsPersisted.map(o => [o.identity, o.after])].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const overlapped = clone(row); overlapped.baseline.overlap = ['object:role:1'];
  const notPaused = clone(row); notPaused.paused = false;
  const rows = [
    ['valid row is classified', verdict(row) !== 'REJECT'],
    ['row without baseline provenance is rejected', verdict(noBaseline) === 'REJECT'],
    ['old-style baseline phase (snapshot after the migration ran) is rejected', verdict(oldStyle) === 'REJECT'],
    ['baseline that absorbed the migration\'s own persisted additions is rejected', !row.newObjectsPersisted.length || verdict(swallowed) === 'REJECT'],
    ['baseline overlap is rejected', verdict(overlapped) === 'REJECT'],
    ['unpaused row is rejected', verdict(notPaused) === 'REJECT']
  ].map(([name, ok]) => ({ name, ok: !!ok }));
  return R(rows.every(r => r.ok), rows);
}
// C3: the classifier must refuse an observation whose case kind or N06 provenance cannot be established, whatever fields the row still carries. Every probe is a modified COPY of a REAL receipt.
export function n06CaseKindChecks({ own, legit, fault, n05 }) {
  const clone = v => JSON.parse(JSON.stringify(v));
  // an EXPLICIT second argument (even undefined or null) is passed through unchanged; with none given the default kind is N06
  const verdict = (r, ...k) => { try { return deriveApplicationClass([{ ...clone(r), pass: false }], ...(k.length ? k : ['N06'])); } catch (e) { return 'REJECT'; } };
  const noKindArgument = r => { try { return deriveApplicationClass([{ ...clone(r), pass: false }]); } catch (e) { return 'REJECT'; } };
  const del = (r, ks) => { const x = clone(r); for (const k of ks) delete x[k]; return x; };
  const FOUR = ['paused', 'baseline', 'externalDeltaSize', 'label'];
  const swallow = r => { const x = clone(r); x.preexistingObjects = clone(x.objectsAfter); x.newObjectsPersisted = []; x.existingObjectsChanged = []; x.preexistingObjectsUnchanged = true; x.catalogChanges = []; x.diff = { added: [], removed: [], changed: [] }; x.stateUnchanged = true; return x; };
  const rows = [
    ['valid concurrent row with migration residue is classified behavioural', verdict(own) === 'behavioural'],
    ['valid concurrent row of a legitimate external drift (clean refusal) is classified message-overlap', verdict(legit) === 'message-overlap'],
    ['valid fault row (non-concurrent) is classified', verdict(fault) !== 'REJECT'],
    ['valid N05 row is classified under the N05 kind', verdict(n05, 'N05') !== 'REJECT'],
    ['all four discriminators (paused, baseline, externalDeltaSize, label) deleted: rejected', verdict(del(own, FOUR)) === 'REJECT'],
    ['provenance present, but the baseline absorbed the persisted additions of the migration itself (all derived fields recomputed consistently): rejected', own.newObjectsPersisted.length > 0 && verdict(swallow(own)) === 'REJECT'],
    ['all four discriminators deleted AND the post-state swallowed as the baseline: rejected', verdict(swallow(del(own, FOUR))) === 'REJECT'],
    ['every non-empty subset of the four discriminators deleted: rejected', Array.from({ length: 15 }, (_, i) => i + 1).every(mask => verdict(del(own, FOUR.filter((_, i) => mask & (1 << i)))) === 'REJECT')],
    ['every non-empty subset deleted, post-state swallowed: rejected', Array.from({ length: 15 }, (_, i) => i + 1).every(mask => verdict(swallow(del(own, FOUR.filter((_, i) => mask & (1 << i))))) === 'REJECT')],
    ['each required baseline field missing (phase, launchObjects, externalDelta, overlap, delta.objects, delta.catalog): rejected', [['phase'], ['launchObjects'], ['externalDelta'], ['overlap'], ['externalDelta', 'objects'], ['externalDelta', 'catalog']].every(p => { const x = clone(own); let o = x.baseline; for (const k of p.slice(0, -1)) o = o[k]; delete o[p.at(-1)]; return verdict(x) === 'REJECT'; })],
    ['baseline / paused / delta-size invalid values: rejected', [x => { x.baseline = null; }, x => { x.baseline = 'launch'; }, x => { x.baseline.phase = 'after-external-drift-before-unpause'; }, x => { x.paused = false; }, x => { x.paused = 'true'; }, x => { x.externalDeltaSize = -1; }, x => { x.externalDeltaSize = '1'; }, x => { x.externalDeltaSize += 1; }, x => { x.baselinePhase = N06_BASELINE_PHASE; }, x => { x.baseline.overlap = ['object:role:1']; }].every(m => { const x = clone(own); m(x); return verdict(x) === 'REJECT'; })],
    ['label missing, non-string, empty, unknown, or another case kind: rejected', [undefined, 7, '', 'some-other-case', 'N05a-actor-db-owner-createrole-not-superuser', 'META-role-normal', 'builder-created'].every(v => { const x = clone(own); if (v === undefined) delete x.label; else x.label = v; return verdict(x) === 'REJECT'; })],
    ['drift row whose expected refusal is not the trusted spec: rejected', (() => { const x = clone(own); x.expect = x.expect === 'SEAL_POST_GUARD_DRIFT' ? 'SEAL_SEAM_STATE_MISMATCH' : 'SEAL_POST_GUARD_DRIFT'; return verdict(x) === 'REJECT'; })()],
    ['case-kind context absent, undefined, null, unknown, lower-case or an object: rejected (no content-based fallback)', [own, legit, fault].every(r => noKindArgument(r) === 'REJECT') && noKindArgument(n05) === 'REJECT' && [undefined, null, 'N07', 'n06', { kind: 'N06' }].every(k => verdict(own, k) === 'REJECT')],
    ['N06 row presented under the N05 kind, N05 row under the N06 kind: rejected', verdict(own, 'N05') === 'REJECT' && verdict(n05, 'N06') === 'REJECT'],
    ['fault row carrying a concurrency field, relabelled to a drift case, or presented under N05: rejected', (() => { const a = clone(fault); a.paused = true; const b = clone(fault); b.label = 'role-created'; return verdict(a) === 'REJECT' && verdict(b) === 'REJECT' && verdict(fault, 'N05') === 'REJECT'; })()],
    ['drift row relabelled to a fault case (to skip provenance): rejected', (() => { const x = clone(own); x.label = 'builder-created'; return verdict(x) === 'REJECT'; })()],
    ['N05 row carrying any N06 concurrency field: rejected', ['paused', 'baseline', 'baselinePhase', 'externalDeltaSize'].every(k => { const x = clone(n05); x[k] = k === 'paused' ? true : 1; return verdict(x, 'N05') === 'REJECT'; })],
    ['error observation stays closed on N06 rows (missing, empty object, string)', [x => { delete x.error; }, x => { x.error = {}; }, x => { x.error = 'SEAL_POST_GUARD_DRIFT'; }].every(m => { const x = clone(own); m(x); return verdict(x) === 'REJECT'; })],
    ['one valid concurrent row cannot hide an invalid concurrent sibling', (() => { try { return deriveApplicationClass([{ ...clone(own), pass: false }, { ...del(own, FOUR), pass: false }], 'N06'); } catch { return 'REJECT'; } })() === 'REJECT'],
    ['a passing row with an invalid identity still rejects the whole observation set', (() => { try { return deriveApplicationClass([{ ...clone(own), pass: false }, { ...del(own, ['label']), pass: true }], 'N06'); } catch { return 'REJECT'; } })() === 'REJECT']
  ].map(([name, ok]) => ({ name, ok: !!ok }));
  return R(rows.every(r => r.ok), rows);
}
// ---- N06 baseline: launch snapshot plus exactly the external drift delta ---------------------------------------------------------------------
const objectMap = snap => new Map(snap.objects.map(([k, v]) => [k, JSON.stringify(v)]));
// Expected state = snapshot taken BEFORE the migration was launched, with only the delta caused by the intentional external drift applied.
// The delta is (paused, before drift) -> (paused, after drift). A key that the migration had already changed before the pause and that the drift also touches
// is ambiguous: it is NOT absorbed into the baseline (it stays at its launch value, so the migration's change remains visible) and is reported as an overlap.
export function expectedBaseline(launch, pausedBefore, pausedAfter) {
  const apply = (l, p, q) => {
    const d = itemsDiff(p, q), expected = new Map(l), overlap = [];
    for (const k of [...d.added, ...d.changed, ...d.removed]) {
      if (l.get(k) !== p.get(k)) { overlap.push(k); continue; }
      if (q.has(k)) expected.set(k, q.get(k)); else expected.delete(k);
    }
    return { expected, delta: d, overlap };
  };
  const o = apply(objectMap(launch), objectMap(pausedBefore), objectMap(pausedAfter)), c = apply(launch.catalog, pausedBefore.catalog, pausedAfter.catalog);
  const pairs = (keys, m) => keys.map(k => [k, JSON.parse(m.get(k))]);
  const post = objectMap(pausedAfter);
  return {
    snapshot: { objects: [...o.expected].map(([k, v]) => [k, JSON.parse(v)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), catalog: c.expected },
    baseline: {
      phase: N06_BASELINE_PHASE, launchObjects: launch.objects,
      externalDelta: {
        objects: { added: pairs(o.delta.added, post), changed: pairs(o.delta.changed, post), removed: o.delta.removed },
        catalog: { added: c.delta.added, changed: c.delta.changed, removed: c.delta.removed }
      },
      overlap: [...o.overlap.map(k => 'object:' + k), ...c.overlap.map(k => 'catalog:' + k)]
    }
  };
}


async function expectRefusal(cl, label, prepare, expectPrefix, { actor = 'su', settings = [], preexisting = false, source, expectPresent = null } = {}) {
  return sealFresh(cl, label, async ctx => {
    await prepare(ctx);
    const precond = expectPresent ? (await ctx.g.query(ctx.su, PREDECESSOR_PRESENT_SQL)).rows[0] : null;
    const precondOk = !expectPresent || same(precond, expectPresent);
    const before = await applicationSnapshot(ctx);
    const runner = actor === 'su' ? ctx.su : actor === 'op' ? ctx.op : await ctx.open(actor);
    const notices = []; const onN = m => notices.push(m.message); runner.on('notice', onN);
    let error = null;
    try { await ctx.g.query(runner, ctx.sealSource); } catch (e) { error = { code: e.code ?? null, message: String(e.message) }; await runner.query('ROLLBACK').catch(() => {}); }
    runner.removeListener('notice', onN);
    const after = await applicationSnapshot(ctx), p = await persistedNone(ctx);
    const evidence = applicationEvidence(before, after, notices.includes('SEAL_DDL_BOUNDARY'));
    const { stateUnchanged } = evidence;
    const pass = precondOk && !!error && error.message.startsWith(expectPrefix) && stateUnchanged && (preexisting || noneLeft(p)) && !notices.includes('SEAL_DDL_BOUNDARY');
    return { label, expectPrefix, precond: expectPresent ? { expected: expectPresent, observed: precond, ok: precondOk } : undefined, error: error && { code: error.code, message: error.message.slice(0, 120) }, ...evidence, pass };
  }, { apply: false, settings, seal: source });
}
export async function migrationRefusals(cl, source = sealSource(), { caseLabels = null } = {}) {
  const cases = [], seen = new Set();
  const refuse = (label, prepare, prefix, opts = {}) => {
    seen.add(label);
    return !caseLabels || caseLabels.includes(label) ? expectRefusal(cl, label, prepare, prefix, { ...opts, source }) : null;
  };
  cases.push(await refuse('N05a-actor-db-owner-createrole-not-superuser', async () => {}, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actor: 'op' }));
  cases.push(await refuse('N05b-actor-createrole-not-db-owner', async ctx => { ctx.extraRoles.add('seal_creator'); await ctx.g.query(ctx.su, 'create role seal_creator login createrole'); await ctx.g.query(ctx.su, 'grant connect on database ' + ctx.name + ' to seal_creator'); }, 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED', { actor: 'seal_creator' }));
  for (const role of ['pgbouncer', 'supabase_auth_admin', 'dashboard_user', 'supabase_read_only_user', 'supabase_etl_admin']) {
    cases.push(await refuse('N05c-marker-role-' + role, async ctx => { ctx.extraRoles.add(role); await ctx.g.query(ctx.su, `create role ${role} nologin`); }, 'SEAL_PLATFORM_APPLY_NOT_AUTHORIZED role:' + role));
  }
  cases.push(await refuse('N05d-marker-history-schema', async ctx => { await ctx.g.query(ctx.su, 'create schema supabase_migrations'); }, 'SEAL_PLATFORM_APPLY_NOT_AUTHORIZED schema:supabase_migrations'));
  cases.push(await refuse('N05e-marker-supautils-setting', async ctx => { await ctx.su.query("select set_config('supautils.reserved_roles','seal_probe',false)"); }, 'SEAL_PLATFORM_APPLY_NOT_AUTHORIZED setting:supautils'));
  for (const guc of ['tastkind.r0b_target', 'tastkind.r0b_manifest', 'tastkind.r0b_fixture_nonce']) {
    cases.push(await refuse('N05f-binding-setting-' + guc.split('.')[1], async ctx => { await ctx.su.query(`select set_config('${guc}','x',false)`); }, 'SEAL_BINDINGS_NOT_SUPPORTED'));
  }
  cases.push(await refuse('N05g-preexisting-seal-role', async ctx => { ctx.extraRoles.add(SEAL_OWNER); await ctx.g.query(ctx.su, `create role ${SEAL_OWNER} nologin`); }, 'SEAL_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('N05h-preexisting-seal-schema', async ctx => { await ctx.g.query(ctx.su, `create schema ${SEAL_SCHEMA}`); }, 'SEAL_ALREADY_PRESENT', { preexisting: true }));
  cases.push(await refuse('N05i-unapproved-predefined-data-member', async ctx => { ctx.extraRoles.add('seal_reader'); await ctx.g.query(ctx.su, 'create role seal_reader nologin'); await ctx.g.query(ctx.su, 'grant pg_read_all_data to seal_reader'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('N05j-runtime-reaches-management-identity', async ctx => { await ctx.g.query(ctx.su, 'grant postgres to authenticated with inherit false, set false'); ctx.cleanups.push('revoke postgres from authenticated'); }, 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'));
  cases.push(await refuse('N05k-missing-capture-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_capture cascade'); }, 'SEAL_PREDECESSORS_MISSING'));
  cases.push(await refuse('N05l-missing-entitlement-predecessor', async ctx => { await ctx.g.query(ctx.su, `drop schema ${ENT} cascade`); }, 'SEAL_PREDECESSORS_MISSING'));
  cases.push(await refuse('N05m-missing-foundation-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_internal cascade'); }, 'SEAL_PREDECESSORS_MISSING'));
  cases.push(await refuse('N05n-missing-ent1a-predecessor', async ctx => { await ctx.g.query(ctx.su, 'drop schema retention_acquisition cascade'); }, 'SEAL_PREDECESSORS_MISSING'));
  // R1 corrective (independent acceptance finding): the whole-schema drops above remove several objects at once and cannot show that EACH existence condition is enforced. Each case below removes ONE object (or the
  // table and the function with the schema kept), PROVES by catalog lookup that exactly that state exists, and then requires the normal migration to refuse it with nothing installed.
  const ALL = { auth_users: true, anchors: true, state_at: true, producers: true, acq_table: true, acq_fn: true, internal: true };
  const partial = async (label, sqls, off) => cases.push(await refuse(label, async ctx => { for (const q of sqls) await ctx.g.query(ctx.su, q); }, 'SEAL_PREDECESSORS_MISSING', { expectPresent: { ...ALL, ...Object.fromEntries(off.map(k => [k, false])) } }));
  await partial('N05p1-receipt-table-only-missing-resolver-kept', ['drop table retention_acquisition.detail_acquisition_records cascade'], ['acq_table']);
  await partial('N05p2-resolver-function-only-missing-table-kept', ['drop function retention_acquisition.resolve_detail_acquisition(uuid)'], ['acq_fn']);
  await partial('N05p3-receipt-table-and-resolver-missing-schema-kept', ['drop table retention_acquisition.detail_acquisition_records cascade', 'drop function retention_acquisition.resolve_detail_acquisition(uuid)'], ['acq_table', 'acq_fn']);
  await partial('N05p4-capture-anchors-table-only-missing-schema-kept', ['drop table retention_capture.detail_capture_anchors cascade'], ['anchors']);
  await partial('N05p5-entitlement-resolver-function-only-missing', [`drop function ${ENT}.entitlement_state_at(uuid, timestamptz)`], ['state_at']);
  await partial('N05p6-entitlement-registry-table-only-missing', [`drop table ${ENT}.producers cascade`], ['producers']);
  await partial('N05p7-auth-users-table-only-missing', ['drop table auth.users cascade'], ['auth_users']);
  await partial('N05p8-foundation-schema-only-missing', ['drop schema retention_internal cascade'], ['internal']);
  cases.push(await refuse('N05o-drift-registry-granted-to-runtime', async ctx => { await ctx.g.query(ctx.su, `grant select on ${ENT}.producers to anon`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05p-drift-state-at-granted-to-runtime', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT}.entitlement_state_at(uuid, timestamptz) to authenticated`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05q-drift-entitlement-schema-granted', async ctx => { await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to anon`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05r-drift-capture-schema-granted', async ctx => { await ctx.g.query(ctx.su, 'grant usage on schema retention_capture to authenticated'); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05s-drift-anchors-granted', async ctx => { await ctx.g.query(ctx.su, 'grant select on retention_capture.detail_capture_anchors to anon'); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05t-drift-extra-registry-policy', async ctx => { await ctx.g.query(ctx.su, `create policy extra_p on ${ENT}.producers for select to anon using (true)`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05u-drift-extra-anchor-policy', async ctx => { await ctx.g.query(ctx.su, 'create policy extra_p on retention_capture.detail_capture_anchors for select to anon using (true)'); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05v-drift-registry-owner-changed', async ctx => { await ctx.g.query(ctx.su, `alter table ${ENT}.producers owner to postgres`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05w-drift-state-at-owner-changed', async ctx => { await ctx.g.query(ctx.su, `alter function ${ENT}.entitlement_state_at(uuid, timestamptz) owner to postgres`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05x-drift-ent1a-seam-revoked', async ctx => { await ctx.g.query(ctx.su, `revoke execute on function ${ENT}.entitlement_state_at(uuid, timestamptz) from ${ACQ_OWNER}`); }, 'SEAL_PREDECESSOR_DRIFT'));
  cases.push(await refuse('N05y-drift-ent1a-schema-owner-changed', async ctx => { await ctx.g.query(ctx.su, 'alter schema retention_acquisition owner to postgres'); }, 'SEAL_PREDECESSOR_DRIFT'));
  if (caseLabels && (!caseLabels.length || new Set(caseLabels).size !== caseLabels.length || caseLabels.some(k => !seen.has(k)))) throw Error('INVALID_N05_CASE_SELECTION');
  const selected = cases.filter(Boolean);
  return R(selected.every(c => c.pass), selected);
}
// C1 meta-controls use the real observation helper and classifier. Sources below are TEST-ONLY.
// They distinguish rollback, successful installation, committed residue and changes without additions.
export async function migrationObservationControls(cl) {
  const rows = [], normal = sealSource();
  const anchor = "RAISE EXCEPTION 'SEAL_ALREADY_PRESENT' USING ERRCODE='42710';";
  if (normal.split(anchor).length !== 2) throw Error('META_Z64_ANCHOR');
  const z64 = normal.replace(anchor, 'NULL;');
  const role = async ctx => {
    await ctx.g.query(ctx.su, `create role ${SEAL_OWNER} nologin noinherit connection limit 7`);
    await ctx.g.query(ctx.su, `alter role ${SEAL_OWNER} set statement_timeout='3s'`);
    await ctx.g.query(ctx.su, `grant anon to ${SEAL_OWNER} with inherit false, set false`);
  };
  const schema = async ctx => {
    await ctx.g.query(ctx.su, `create schema ${SEAL_SCHEMA}`);
    await ctx.g.query(ctx.su, `grant usage on schema ${SEAL_SCHEMA} to anon`);
    await ctx.g.query(ctx.su, `create table ${SEAL_SCHEMA}.meta_existing(i integer default 7)`);
    await ctx.g.query(ctx.su, `grant select on ${SEAL_SCHEMA}.meta_existing to anon`);
    await ctx.g.query(ctx.su, `create function ${SEAL_SCHEMA}.meta_existing_fn() returns integer language sql as 'select 7'`);
    await ctx.g.query(ctx.su, `revoke all on function ${SEAL_SCHEMA}.meta_existing_fn() from public`);
  };
  for (const [kind, prepare] of [['role', role], ['schema', schema]]) for (const [variant, source] of [['normal', normal], ['Z64', z64]]) {
    const r = await expectRefusal(cl, 'META-' + kind + '-' + variant, prepare, 'SEAL_ALREADY_PRESENT', { preexisting: true, source });
    const cls = deriveApplicationClass([{ ...r, pass: false }], 'N05');
    const original = r.preexistingObjects.find(([k, v]) => kind === 'role' ? k.startsWith('role:') && v.rolname === SEAL_OWNER : k.startsWith('schema:') && v.nspname === SEAL_SCHEMA);
    const fixture = !!original && (kind === 'role' ? original[1].rolconnlimit === 7 && original[1].rolcanlogin === false && original[1].rolinherit === false && original[1].rolconfig.includes('statement_timeout=3s') && r.preexistingObjects.some(([k, v]) => k.startsWith('member:') && v.member === original[1].oid && !v.inherit_option && !v.set_option) : original[1].nspacl.some(a => a.startsWith('anon=U/')) && r.preexistingObjects.some(([k, v]) => k.startsWith('class:') && v.relname === 'meta_existing' && v.relacl.some(a => a.startsWith('anon=r/'))));
    const pass = fixture && cls === 'message-overlap' && r.stateUnchanged && r.preexistingObjectsUnchanged && !r.newObjectsPersisted.length && !r.existingObjectsChanged.length
      && (variant === 'normal' ? r.pass && !r.enteredDdlBoundary && r.error?.message === 'SEAL_ALREADY_PRESENT' : !r.pass && r.enteredDdlBoundary && r.error?.code === (kind === 'role' ? '42710' : '42P06'));
    rows.push({ id: 'META-' + kind + '-' + variant, pass, fixture, derivedClass: cls, observed: r });
  }
  const controls = [
    ['successful-install', async () => {}, normal, r => !r.error && r.enteredDdlBoundary && r.newObjectsPersisted.some(o => o.after.nspname === SEAL_SCHEMA) && r.newObjectsPersisted.some(o => o.after.rolname === SEAL_OWNER)],
    ['committed-residue', async () => {}, `BEGIN; CREATE ROLE ${SEAL_OWNER} NOLOGIN; COMMIT; SELECT 1/0;`, r => r.error?.code === '22012' && !r.enteredDdlBoundary && r.newObjectsPersisted.some(o => o.after.rolname === SEAL_OWNER)],
    ['existing-role-changed-no-additions', role, `BEGIN; ALTER ROLE ${SEAL_OWNER} CONNECTION LIMIT 9; COMMIT; SELECT 1/0;`, r => r.error?.code === '22012' && !r.newObjectsPersisted.length && r.existingObjectsChanged.some(o => o.before.rolconnlimit === 7 && o.after?.rolconnlimit === 9 && o.before.oid === o.after.oid)]
  ];
  for (const [id, prepare, source, oracle] of controls) {
    const r = await expectRefusal(cl, 'META-' + id, prepare, 'META_EXPECTED_REFUSAL', { preexisting: true, source });
    const cls = deriveApplicationClass([{ ...r, pass: false }], 'N05');
    rows.push({ id: 'META-' + id, pass: oracle(r) && !r.stateUnchanged && cls === 'behavioural', derivedClass: cls, observed: r });
  }
  // C2 (1): the classifier refuses missing, invalid or contradictory error observations; every probe is a modified copy of a REAL receipt above.
  const contract = classifierContractChecks(rows);
  rows.push({ id: 'META-classifier-error-contract', pass: contract.pass, observed: contract.observed });
  // C2 (2): N06 baseline. The first (and only) BEGIN; line of the normal migration is replaced by a test-only prefix that COMMITS a change before the migration
  // pauses. Nothing here is ever written into the candidate migration.
  const begins = normal.match(/^BEGIN;$/gm);
  if (!begins || begins.length !== 1) throw Error('META_N06_BEGIN_ANCHOR');
  const withPrefix = sql => normal.replace(/^BEGIN;$/m, () => 'BEGIN; ' + sql + ' COMMIT; BEGIN;');
  const OWN = 'own_n06_committed_residue', names = list => list.map(o => o.after.rolname).filter(Boolean).sort();
  const baselineRows = [
    ['N06-baseline-legitimate-external-role-drift', normal, 'role-created', [], (g, r, cls) => g.pass && r.pass && r.stateUnchanged && !r.newObjectsPersisted.length && !r.existingObjectsChanged.length && !r.baseline.overlap.length
      && r.baseline.externalDelta.objects.added.some(([, v]) => v.rolname === 'seal_drift_role') && r.preexistingObjects.some(([, v]) => v.rolname === 'seal_drift_role') && r.objectsAfter.some(([, v]) => v.rolname === 'seal_drift_role') && cls === undefined],
    ['N06-baseline-legitimate-external-acl-drift', normal, 'public-table-acl', [], (g, r, cls) => g.pass && r.pass && r.stateUnchanged && !r.newObjectsPersisted.length && !r.existingObjectsChanged.length && !r.baseline.overlap.length
      && [...r.baseline.externalDelta.catalog.added, ...r.baseline.externalDelta.catalog.changed].includes('class:public.restaurants#acl') && !r.catalogChanges.length && cls === undefined],
    ['N06-baseline-own-committed-role-with-external-role-drift', withPrefix('CREATE ROLE ' + OWN + ' NOLOGIN;'), 'role-created', [OWN], (g, r, cls) => !g.pass && !r.pass && !r.stateUnchanged && String(r.error?.message).startsWith('SEAL_POST_GUARD_DRIFT') && same(names(r.newObjectsPersisted), [OWN])
      && !r.preexistingObjects.some(([, v]) => v.rolname === OWN) && r.preexistingObjects.some(([, v]) => v.rolname === 'seal_drift_role') && !r.baseline.overlap.length && !r.baseline.externalDelta.objects.added.some(([, v]) => v.rolname === OWN) && cls === 'behavioural'],
    ['N06-baseline-own-committed-acl-change-with-external-role-drift', withPrefix('GRANT SELECT ON public.restaurants TO anon;'), 'role-created', [], (g, r, cls) => !g.pass && !r.pass && !r.stateUnchanged && String(r.error?.message).startsWith('SEAL_POST_GUARD_DRIFT') && !r.newObjectsPersisted.length
      && [...r.diff.added, ...r.diff.changed].includes('class:public.restaurants#acl') && !r.baseline.overlap.length && cls === 'behavioural']
  ];
  let provenanceRow = null, legitRow = null;
  for (const [id, source, label, extra, oracle] of baselineRows) {
    const g = await migrationRollbackAndDrift(cl, source, { caseLabels: [label], extraRoles: extra }), r = g.observed[0];
    const cls = r.pass ? undefined : deriveApplicationClass([{ ...r, pass: false }], 'N06');
    if (id.includes('own-committed-role')) provenanceRow = r;
    if (id.includes('legitimate-external-role-drift')) legitRow = r;
    rows.push({ id: 'META-' + id, pass: oracle(g, r, cls), derivedClass: cls ?? null, observed: g });
  }
  // C3: a real N06 FAULT-case receipt (non-concurrent, launch snapshot taken immediately before the migration); its class is derived under the N06 kind.
  const faultG = await migrationRollbackAndDrift(cl, normal, { caseLabels: ['builder-created'] }), faultRow = faultG.observed[0];
  rows.push({ id: 'META-n06-fault-row', pass: faultG.pass && faultRow.label === 'builder-created' && faultRow.pass && !('paused' in faultRow) && deriveApplicationClass([{ ...faultRow, pass: false }], 'N06') === 'message-overlap', observed: faultG });
  const kindChecks = n06CaseKindChecks({ own: provenanceRow, legit: legitRow, fault: faultRow, n05: rows.find(x => x.id === 'META-role-normal').observed });
  rows.push({ id: 'META-n06-case-kind-and-provenance-mandatory', pass: kindChecks.pass, observed: kindChecks.observed });
  const pure = baselineContractChecks(), prov = n06ProvenanceChecks(provenanceRow);
  rows.push({ id: 'META-n06-baseline-construction', pass: pure.pass, observed: pure.observed });
  rows.push({ id: 'META-n06-baseline-provenance-contract', pass: prov.pass, observed: prov.observed });
  return R(rows.every(r => r.pass), rows);
}

const FAULT_ANCHORS = [
  ['builder-created', 'CREATE ROLE consumer_retention_seal_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;'],
  ['owner-granted', "EXECUTE pg_catalog.format('GRANT consumer_retention_seal_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);\nEND $$;"],
  ['tables-built', 'CREATE TRIGGER seal_immutable BEFORE UPDATE OR DELETE ON retention_seal.registry_seals\n FOR EACH ROW EXECUTE FUNCTION retention_seal.reject_seal_change();'],
  ['functions-owned', 'ALTER FUNCTION retention_seal.registry_seal_covers(timestamptz) OWNER TO consumer_retention_seal_owner;'],
  ['seam-policy-created', 'CREATE POLICY seal_owner_select ON retention_entitlement.producers AS PERMISSIVE FOR SELECT TO consumer_retention_seal_owner USING (true);'],
  ['seams-granted', 'GRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_seal_owner;'],
  ['builder-dropped', 'DROP ROLE consumer_retention_seal_builder;']
];
export async function migrationRollbackAndDrift(cl, installSource = sealSource(), { caseLabels = null, extraRoles = [] } = {}) {
  if (!Array.isArray(extraRoles) || extraRoles.some(r => typeof r !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(r))) throw Error('INVALID_N06_EXTRA_ROLES');
  const out = [], seen = new Set();
  const selected = label => { seen.add(label); return !caseLabels || caseLabels.includes(label); };
  for (const [label, anchor] of FAULT_ANCHORS) {
    if (!selected(label)) continue;
    if (installSource.split(anchor).length !== 2) throw Error('SETUP_FAULT_ANCHOR ' + label);
    const mutant = installSource.replace(anchor, () => anchor + '\nSELECT 1/0;');
    out.push(await sealFresh(cl, 'N06-fault-' + label, async ctx => {
      for (const r of extraRoles) ctx.extraRoles.add(r);
      const members0 = await membersJson(ctx), before = await applicationSnapshot(ctx);
      const a = await sealApply(ctx, mutant), after = await applicationSnapshot(ctx), p = await persistedNone(ctx);
      const evidence = applicationEvidence(before, after, a.boundary);
      return { label, error: a.error, persisted: p, ...evidence, pass: a.error?.code === '22012' && a.boundary && noneLeft(p) && members0 === await membersJson(ctx) && evidence.stateUnchanged };
    }, { apply: false, seal: installSource }));
  }
  const drifts = [
    ['role-created', async ctx => { ctx.extraRoles.add('seal_drift_role'); await ctx.g.query(ctx.su, 'create role seal_drift_role nologin'); }, 'SEAL_POST_GUARD_DRIFT'],
    ['public-table-acl', async ctx => { await ctx.g.query(ctx.su, 'grant select on public.restaurants to anon'); }, 'SEAL_POST_GUARD_DRIFT'],
    ['membership', async ctx => { await ctx.g.query(ctx.su, 'grant anon to service_role'); ctx.cleanups.push('revoke anon from service_role'); }, 'SEAL_POST_GUARD_DRIFT'],
    ['extra-registry-policy', async ctx => { await ctx.g.query(ctx.su, `create policy drift_p on ${ENT}.producers for select to anon using (true)`); }, 'SEAL_POST_GUARD_DRIFT'],
    ['acquisition-table-acl', async ctx => { await ctx.g.query(ctx.su, 'grant select on retention_acquisition.detail_acquisition_records to anon'); }, 'SEAL_POST_GUARD_DRIFT'],
    ['registry-granted-to-runtime-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant select on ${ENT}.producers to anon`); }, 'SEAL_SEAM_STATE_MISMATCH'],
    ['state-at-granted-to-runtime-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant execute on function ${ENT}.entitlement_state_at(uuid, timestamptz) to authenticated`); }, 'SEAL_SEAM_STATE_MISMATCH'],
    ['entitlement-schema-granted-meanwhile', async ctx => { await ctx.g.query(ctx.su, `grant usage on schema ${ENT} to anon`); }, 'SEAL_SEAM_STATE_MISMATCH']
  ];
  if (!same(drifts.map(d => d[0]), N06_DRIFT_LABELS) || !same(drifts.map(d => d[2]), N06_DRIFT_LABELS.map(l => N06_DRIFT_EXPECT[l]))) throw Error('SETUP_N06_DRIFT_LABELS');
  if (!same(FAULT_ANCHORS.map(a => a[0]), N06_FAULT_LABELS)) throw Error('SETUP_N06_FAULT_LABELS');
  for (const [label, drift, expect] of drifts) {
    if (!selected(label)) continue;
    out.push(await sealFresh(cl, 'N06-drift-' + label, async ctx => {
      for (const r of extraRoles) ctx.extraRoles.add(r);
      await installProbe(ctx.su);
      const d0 = await ddlAttempts(ctx.su);
      const runner = await ctx.open('supabase_admin'); const locker = await ctx.open('supabase_admin');
      let error = null, paused = false, pausedBefore = null, pausedAfter = null;
      const notices = [], onNotice = n => notices.push(n.message); runner.on('notice', onNotice);
      // Baseline step 1: the state BEFORE the migration is launched. Nothing the migration commits can be in it.
      const launch = await applicationSnapshot(ctx);
      try {
        await locker.query('select pg_catalog.pg_advisory_lock($1)', [PROBE_PAUSE_LOCK]);
        const pending = ctx.g.query(runner, ctx.sealSource).then(() => null, e => ({ code: e.code, message: String(e.message) }));
        for (let i = 0; i < 200 && !paused; i++) { paused = (await ctx.su.query("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) w", [PROBE_PAUSE_LOCK])).rows[0].w; if (!paused) await sleep(100); }
        // Baseline step 2: while the migration is blocked, take the state just before and just after the intentional external drift. Whatever the migration
        // committed before it paused is in BOTH of these and therefore never part of the external delta.
        if (paused) { pausedBefore = await applicationSnapshot(ctx); await drift(ctx); pausedAfter = await applicationSnapshot(ctx); }
        await locker.query('select pg_catalog.pg_advisory_unlock($1)', [PROBE_PAUSE_LOCK]);
        error = await pending;
      } finally { await runner.query('ROLLBACK').catch(() => {}); runner.removeListener('notice', onNotice); }
      const after = await applicationSnapshot(ctx);
      // Baseline step 3: expected = launch snapshot + exactly the external delta. If the pause was never reached there is no delta and the gate fails on !paused.
      const eb = paused ? expectedBaseline(launch, pausedBefore, pausedAfter) : { snapshot: launch, baseline: { phase: N06_BASELINE_PHASE, launchObjects: launch.objects, externalDelta: { objects: { added: [], changed: [], removed: [] }, catalog: { added: [], changed: [], removed: [] } }, overlap: [] } };
      const evidence = applicationEvidence(eb.snapshot, after, notices.includes('SEAL_DDL_BOUNDARY'));
      const deltaSize = eb.baseline.externalDelta.objects.added.length + eb.baseline.externalDelta.objects.changed.length + eb.baseline.externalDelta.objects.removed.length + eb.baseline.externalDelta.catalog.added.length + eb.baseline.externalDelta.catalog.changed.length + eb.baseline.externalDelta.catalog.removed.length;
      const p = await persistedNone(ctx);
      const attempts = (await ddlAttempts(ctx.su)) - d0;
      await ctx.su.query('revoke select on public.restaurants from anon').catch(() => {});
      return { label, expect, paused, baseline: eb.baseline, externalDeltaSize: deltaSize, error: error && { code: error.code ?? null, message: error.message.slice(0, 100) }, persisted: p, ...evidence, ddlAttempts: attempts, pass: paused && deltaSize > 0 && eb.baseline.overlap.length === 0 && !!error && error.message.startsWith(expect) && attempts > 0 && noneLeft(p) && evidence.stateUnchanged };
    }, { apply: false, settings: ["tastkind_probe.pause = 'on'"], seal: installSource }));
  }
  if (caseLabels && (!caseLabels.length || new Set(caseLabels).size !== caseLabels.length || caseLabels.some(k => !seen.has(k)))) throw Error('INVALID_N06_CASE_SELECTION');
  return R(out.every(o => o.pass), out);
}

GATES.F01_FROZEN_SCOPE_AND_INVENTORY = async () => {
  const frozen = frozenProof(), inv = inventoryProof();
  const sourceSha = sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', SEAL_MIGRATION)));
  const own = /IS DISTINCT FROM '([0-9a-f]{64})'/.exec(sealSource())?.[1];
  // Exact ORDERED new-migration tail: capture, ENT0, the origin demo migration, ENT1-A (20261017010000), then the ENT-R migration (20261018010000). No file is assumed last except by this exact order.
  // With the exact social integration record (persistence smoke, byte-pinned) the two social migrations sort between the ENT1-A migration and the ENT-R migration.
  const tail = withAct2Tail([...withSocialTail([CAPTURE_SUCCESSOR, ENT0_MIGRATION, DEMO_MIGRATION, ACQ_MIGRATION, SEAL_MIGRATION], frozen.recoverySuccessor.social === 'record'), ...(frozen.recoverySuccessor.social === 'record' && frozen.recoverySuccessor.billing === 'record' ? [BILLING_MIGRATION] : [])]); // ENT-F1 (20261021010000) sorts after this migration
  return R(frozen.violations.length === 0 && frozen.recoverySuccessor.state === 'ent0' && frozen.recoverySuccessor.demo === 'record' && frozen.recoverySuccessor.acq === 'record' && frozen.recoverySuccessor.seal === 'record'
    && inv.migrationCount === 143 + tail.length && inv.baselineCount === 143 && same(inv.newPaths, tail) && inv.changedBaselineMigrations.length === 0 && inv.timestampLaterThanAll
    && sourceSha === SEAL_MIGRATION_SHA256 && own === SEAL_POST_DIGEST, { frozen, inv, tail, sourceSha, pinned: SEAL_MIGRATION_SHA256, postDigest: own });
};

// ---- gate selection contract (same contract and same code as the accepted ENT0 runner: TK_GATES takes full ids only) ---------------------------------------------------
GATES.F02_GATE_SELECTION_CONTRACT = async () => {
  const rows = selectionContractRows(); const o = {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-f02-')); const bad = {};
  const N07 = 'N07_FUNCTION_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST', P01 = 'P01_FIRST_SEAL_SAMPLES_UNDER_THE_REGISTRY_LOCK_AND_RECORDS_AN_ORACLE_DIGEST';
  const spawn = (env, extra) => { const r = child.spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...extra], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600000, maxBuffer: 16 << 20 }); return { code: r.status, out: String(r.stdout ?? '') }; };
  for (const [name, val] of [['unknown', 'NO_SUCH_GATE'], ['mixed', N07 + ',NO_SUCH_GATE'], ['empty', ''], ['separators', ','], ['prefix', 'N07'], ['trailing-comma', N07 + ',']]) {
    const r = spawn({ TK_GATES: val }, ['--pg-bin', path.join(tmp, 'no-such-pg', 'bin'), '--out', path.join(tmp, 'neg-' + name)]);
    bad[name] = { code: r.code, checkLines: (r.out.match(/^CHECK /gm) ?? []).length, outDirCreated: fs.existsSync(path.join(tmp, 'neg-' + name)) };
  }
  o.refusals = bad;
  const refused = Object.values(bad).every(b => b.code !== 0 && b.code !== null && b.checkLines === 0 && !b.outDirCreated);
  const pos = spawn({ TK_GATES: N07 + ',' + P01 }, ['--pg-bin', options().bin, '--out', path.join(tmp, 'pos')]);
  const lines = pos.out.split(/\r?\n/).filter(l => /^CHECK /.test(l)).map(l => l.split(' ')[1]);
  let res = null; try { res = JSON.parse(fs.readFileSync(path.join(tmp, 'pos', 'result.json'), 'utf8')); } catch { /* reported below */ }
  o.positive = { code: pos.code, lines, status: res?.status, selected: res?.selected };
  const exact = pos.code === 0 && same(lines, [P01, N07]) && res?.status === 'PASS' && same(res.selected, [P01, N07]);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup only */ }
  o.rows = rows.map(r => ({ name: r.name, ok: r.ok }));
  return R(rows.every(r => r.ok) && refused && exact, o);
};

export const POSITIVE_IDS = Object.keys(GATES).filter(k => /^P\d\d_/.test(k));
export const NEGATIVE_IDS = ['N01_RUNTIME_ROLES_AND_THE_SEALED_OWNER_REACH_ONLY_WHAT_WAS_APPROVED', 'N02_SEALS_CANNOT_BE_CHANGED_OR_REMOVED_BY_STATEMENT', 'N03_FORGED_DIRECT_INSERTS_ARE_REJECTED_EACH_FOR_ITS_OWN_REASON', 'N04_INVALID_ARGUMENTS_ISOLATION_DIRTY_AND_READ_ONLY_TRANSACTIONS_ARE_REFUSED',
  'N05_MIGRATION_PRECONDITIONS_FAIL_CLOSED', 'N06_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT', 'N07_FUNCTION_SOURCE_ORDER_CLOCK_LOCK_AND_SOURCE_WHITELIST'];
export const SUPPLEMENTARY_IDS = ['F01_FROZEN_SCOPE_AND_INVENTORY', 'F02_GATE_SELECTION_CONTRACT', 'F03_MIGRATION_OBSERVATION_META_CONTROLS'];
export const ALL_GATE_IDS = [...POSITIVE_IDS, ...NEGATIVE_IDS, ...SUPPLEMENTARY_IDS];
export async function runGate(cl, id, source = sealSource()) {
  if (id === 'N05_MIGRATION_PRECONDITIONS_FAIL_CLOSED') return migrationRefusals(cl, source);
  if (id === 'N06_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT') return migrationRollbackAndDrift(cl, source);
  if (id === 'F03_MIGRATION_OBSERVATION_META_CONTROLS') return migrationObservationControls(cl);
  if (id.startsWith('F0')) return GATES[id]();
  return sealFresh(cl, id, ctx => GATES[id](ctx), { seal: source });
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
