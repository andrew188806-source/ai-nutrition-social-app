#!/usr/bin/env node
// R1-A mutation harness. Each mutant is ONE textual defect of the real migration (the target text must occur exactly once, else the run
// is BLOCKED), applied to a fresh clone of the full-chain template, and judged ONLY by its pre-declared detector gates of the smoke.
// Classes: DETECTED (a declared detector returned an explicit pass:false), NOT_DETECTED (all declared detectors passed), APPLY_REFUSED
// (the mutant SQL itself failed to install: not a behaviour detection), CRASH (a gate threw: never a detection). A setup failure, or an
// unmutated control that does not pass, makes the whole run BLOCKED (exit 2). The equivalent control (Z00) must stay all-pass.
// A mutant may carry `edits` (several exact targets of one defect) instead of from/to; each target must still occur exactly once.
// usage: node scripts/consumer-monthly-review-mutations.mjs --pg-bin <pg17 bin> --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as S from './consumer-monthly-review-smoke.mjs';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
// The R1A-SNAPSHOT-01 defect shapes: the digest read again in a statement of its own, then carried past the aggregate statement.
const EARLY_DIGEST = `  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'consumer-monthly-review-v1|' || p_binding_version || '|' || p_timezone || '|' || coalesce((
        select pg_catalog.string_agg(m.id::text || '@' || pg_catalog.to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '@' || pg_catalog.to_char(m.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '[' || coalesce((
            select pg_catalog.string_agg(i.id::text || '@' || pg_catalog.to_char(i.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '@' || i.consumed_ratio::text || '@' || i.nutrition_snapshot::text, ';' order by i.id)
            from public.meal_record_items i where i.meal_record_id = m.id), '') || ']', ',' order by m.id)
        from public.meal_records m
        where m.user_id = p_user and m.deleted_at is null and m.occurred_at >= v_start and m.occurred_at < v_end), ''), 'UTF8')), 'hex')
    into v_early;
`;
const DECLARE = '  v_row consumer_review.monthly_nutrition_reviews%rowtype; v_has boolean; a record;\n';
const ROW_LOCK = '  select * into v_row from consumer_review.monthly_nutrition_reviews where user_id = p_user and month_key = p_month_key for update;\n';
const EARLY_DECLARED = { from: DECLARE, to: '  v_early text;\n' + DECLARE }, EARLY_KEPT = { from: '  into a;\n', to: '  into a;\n  a.src_digest := v_early;\n' };
const CTE = "where m.user_id = p_user and m.deleted_at is null and m.occurred_at >= v_start and m.occurred_at < v_end\n  ), items as (";
export const MUTANTS = [
  { id: 'Z00_EQUIVALENT_COMMENT_CONTROL', from: '-- Bindings are append-only.', to: '-- (equivalent) Bindings are append-only.', detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'], equivalent: true },
  { id: 'Z01_CONSUMED_RATIO_IGNORED', from: "coalesce((select sum((c ->> 'value')::numeric * consumed_ratio) from items where c ->> 'state' = 'valid'), 0) c_t", to: "coalesce((select sum((c ->> 'value')::numeric) from items where c ->> 'state' = 'valid'), 0) c_t", detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z02_MISSING_VALUE_COUNTED_AS_ZERO', from: "when x is null or pg_catalog.jsonb_typeof(x) = 'null' then pg_catalog.jsonb_build_object('state', 'missing')", to: "when x is null or pg_catalog.jsonb_typeof(x) = 'null' then pg_catalog.jsonb_build_object('state', 'valid', 'value', 0)", detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z03_LEGACY_KCAL_ALIAS_IGNORED', from: "consumer_review.nutrient_value(i.nutrition_snapshot, 'calories', 'kcal')", to: "consumer_review.nutrient_value(i.nutrition_snapshot, 'calories', null)", detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z04_DELETED_MEALS_INCLUDED', from: CTE, to: CTE.replace(' and m.deleted_at is null', ''), detectors: ['P06_REVISION_IDEMPOTENT_LATE_CORRECTION_AND_REMOVAL'] },
  { id: 'Z05_MONTH_RANGE_IN_UTC', from: "v_start timestamptz := pg_catalog.timezone(p_timezone, (p_month_key || '-01')::timestamp);", to: "v_start timestamptz := pg_catalog.timezone('UTC', (p_month_key || '-01')::timestamp);", detectors: ['P04_REPORT_ZONE_MONTH_BOUNDARIES_DST_AND_DEVICE_ZONE'] },
  { id: 'Z06_REPORT_ZONE_FOLLOWS_CURRENT_PROFILE', from: "  v_local := pg_catalog.timezone(v_binding.timezone, pg_catalog.transaction_timestamp());", to: "  select p.timezone into v_binding.timezone from public.consumer_profiles p where p.user_id = v_user;\n  v_local := pg_catalog.timezone(v_binding.timezone, pg_catalog.transaction_timestamp());", detectors: ['P05_BINDING_FIXED_APPEND_ONLY_AND_ACCOUNT_DELETION_CASCADE'] },
  { id: 'Z07_CORE_GATE_REMOVED', from: "  if not public.consumer_core_eligible() then raise exception 'CORE_ACCESS_DENIED' using errcode = '42501'; end if;\n", to: '', detectors: ['N02_AUTHENTICATION_ROLES_AND_CORE_GATE'] },
  { id: 'Z08_AUTHENTICATION_CHECK_REMOVED', from: "  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;\n", to: '', detectors: ['N02_AUTHENTICATION_ROLES_AND_CORE_GATE'] },
  { id: 'Z09_ANON_GRANTED', from: 'grant execute on function public.get_current_user_monthly_nutrition_review() to authenticated;', to: 'grant execute on function public.get_current_user_monthly_nutrition_review() to authenticated, anon;', detectors: ['P01_FULL_CHAIN_APPLIES_AND_EXACT_POST_STATE', 'N02_AUTHENTICATION_ROLES_AND_CORE_GATE'] },
  { id: 'Z10_UNCHANGED_SOURCE_STILL_BUMPS_REVISION', from: '  if v_has and v_row.source_digest = a.src_digest and v_row.binding_version = p_binding_version then return; end if;\n', to: '', detectors: ['P06_REVISION_IDEMPOTENT_LATE_CORRECTION_AND_REMOVAL'] },
  { id: 'Z11_INCREMENTAL_DOUBLE_COUNT', from: 'calories_total = a.c_t,', to: 'calories_total = calories_total + a.c_t,', detectors: ['P06_REVISION_IDEMPOTENT_LATE_CORRECTION_AND_REMOVAL'] },
  { id: 'Z12_EMPTIED_MONTH_ROW_DELETED', from: '  if not v_has and a.meal_n = 0 then return; end if;', to: '  if a.meal_n = 0 then delete from consumer_review.monthly_nutrition_reviews where user_id = p_user and month_key = p_month_key; return; end if;', detectors: ['P06_REVISION_IDEMPOTENT_LATE_CORRECTION_AND_REMOVAL'] },
  { id: 'Z13_BINDING_UPDATE_ALLOWED', from: "  raise exception 'REPORT_TIMEZONE_BINDING_IMMUTABLE' using errcode = '23514';", to: '  return coalesce(new, old);', detectors: ['P05_BINDING_FIXED_APPEND_ONLY_AND_ACCOUNT_DELETION_CASCADE'] },
  { id: 'Z14_AVERAGE_OVER_CALENDAR_DAYS', from: 'round(r.calories_total / r.recorded_days, 2)', to: 'round(r.calories_total / 30, 2)', detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z15_ALL_MISSING_SHOWN_AS_ZERO_TOTAL', from: "'total', case when r.fiber_valid_items > 0 then round(r.fiber_total, 2) end", to: "'total', round(r.fiber_total, 2)", detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z16_WINDOW_SHIFTED_BY_ONE_MONTH', from: 'for i in reverse 5..0 loop', to: 'for i in reverse 6..1 loop', detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z17_OTHER_OWNERS_MEALS_COUNTED', from: CTE, to: CTE.replace('m.user_id = p_user and ', ''), detectors: ['N01_OWNER_ISOLATION_AND_NO_OWNER_PARAMETER'] },
  { id: 'Z18_INVALID_VALUE_COUNTED_AS_MISSING', from: "    else pg_catalog.jsonb_build_object('state', 'invalid') end", to: "    else pg_catalog.jsonb_build_object('state', 'missing') end", detectors: ['P02_OWNER_TOTALS_AVERAGES_AND_MISSING_DISCLOSURE'] },
  { id: 'Z19_INVALID_ZONE_ACCEPTED', from: "    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone) then raise exception 'REPORT_TIMEZONE_INVALID' using errcode = '22023'; end if;\n", to: '', detectors: ['N04_INVALID_PROFILE_ZONE_REFUSED_WITHOUT_WRITES'] },
  { id: 'Z20_DIGEST_READ_BEFORE_ROW_LOCK', edits: [EARLY_DECLARED, { from: ROW_LOCK, to: EARLY_DIGEST + ROW_LOCK }, EARLY_KEPT], detectors: ['P08_WRITER_AND_REFRESH_SHARE_ONE_SOURCE_SNAPSHOT'] },
  { id: 'Z21_LOCK_MOVED_FIRST_BUT_TWO_STATEMENTS', edits: [EARLY_DECLARED, { from: '  v_has := found;\n', to: '  v_has := found;\n' + EARLY_DIGEST + `  if v_has then perform pg_catalog.pg_advisory_xact_lock(${S.STATEMENT_BARRIER}, pg_catalog.hashtext(p_user::text)); end if;\n` }, EARLY_KEPT], detectors: ['P08_WRITER_AND_REFRESH_SHARE_ONE_SOURCE_SNAPSHOT'] },
  { id: 'Z22_RECOMPUTE_KEEPS_THE_OLD_DIGEST', from: 'revision = revision + 1, source_digest = a.src_digest,', to: 'revision = revision + 1,', detectors: ['P08_WRITER_AND_REFRESH_SHARE_ONE_SOURCE_SNAPSHOT'] },
  { id: 'Z23_DIGEST_READ_BEFORE_ROW_LOCK_WITH_CORRECTION', edits: [EARLY_DECLARED, { from: ROW_LOCK, to: EARLY_DIGEST + ROW_LOCK }, EARLY_KEPT], detectors: ['P09_CORRECTION_EMPTIED_MONTH_RESEND_AND_WRITER_STORM'] }
];

export async function runMutations({ bin, out }) {
  fs.mkdirSync(out, { recursive: true });
  const source = fs.readFileSync(path.join(S.ROOT, 'supabase/migrations', S.R1A_MIGRATION), 'utf8');
  const rows = []; let blocked = null, env = null, control = null;
  try {
    const editsOf = m => m.edits ?? [m];
    for (const m of MUTANTS) for (const e of editsOf(m)) { const n = source.split(e.from).length - 1; if (n !== 1) throw Error(`SETUP_MUTANT_TARGET ${m.id} occurs ${n} times`); }
    env = await S.prepareCluster(bin, out);
    const detectorSet = [...new Set(MUTANTS.flatMap(m => m.detectors))];
    const controlOut = path.join(out, 'control'); fs.mkdirSync(controlOut, { recursive: true });
    control = await S.runPgGates(env, source, S.PG_GATES.filter(g => detectorSet.includes(g)), controlOut);
    if (!Object.values(control).every(r => r.pass && !r.crashed)) throw Error('SETUP_CONTROL_NOT_PASSING ' + JSON.stringify(Object.fromEntries(Object.entries(control).map(([k, v]) => [k, v.pass]))));
    for (const m of MUTANTS) {
      const sql = editsOf(m).reduce((text, e) => text.replace(e.from, () => e.to), source), dir = path.join(out, m.id); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'mutant.sql'), sql);
      let verdict, results = null, applyError = null;
      try { results = await S.runPgGates(env, sql, m.detectors, dir); }
      catch (e) { if (e.apply) applyError = e.apply; else throw e; }
      if (applyError) verdict = 'APPLY_REFUSED';
      else if (Object.values(results).some(r => r.crashed)) verdict = 'CRASH';
      else if (Object.values(results).some(r => !r.pass)) verdict = 'DETECTED';
      else verdict = 'NOT_DETECTED';
      const expected = m.equivalent ? 'NOT_DETECTED' : 'DETECTED';
      rows.push({ id: m.id, detectors: m.detectors, verdict, expected, asDeclared: verdict === expected, applyError, mutantSha256: sha(sql), results: results && Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { pass: v.pass, crashed: !!v.crashed }])) });
      console.log(`MUTANT ${m.id} ${verdict}${verdict === expected ? '' : ' (expected ' + expected + ')'}`);
    }
  } catch (e) { blocked = { message: e.message, stack: e.stack }; } finally { if (env) await env.cl.stop().catch(() => {}); }
  const status = blocked ? 'BLOCKED' : rows.every(r => r.asDeclared) && rows.length === MUTANTS.length ? 'PASS' : 'FAIL';
  const result = { status, exitCode: status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2, mutants: MUTANTS.length, asDeclared: rows.filter(r => r.asDeclared).length, rows, control: control && Object.fromEntries(Object.entries(control).map(([k, v]) => [k, v.pass])), blocked, identity: { migrationSha256: sha(source), harnessSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) } };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`RESULT ${status} ${result.asDeclared}/${MUTANTS.length}`);
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
  let code;
  try { if (!arg('--pg-bin') || !arg('--out')) throw Error('SETUP_ARGS'); code = await runMutations({ bin: arg('--pg-bin'), out: path.resolve(arg('--out')) }); }
  catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
