#!/usr/bin/env node
// TastKind R0-B-CAP actual-source mutations. Each mutant is the real migration SQL with one defect; setup errors are BLOCKED, never detections.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, recorder, sha } from './consumer-retention-persistence-smoke.mjs';
import { captureCluster, captureSource, runGate, tryApply, CAPTURE_MIGRATION, options } from './consumer-retention-capture-smoke.mjs';

const T0_LINE = "v_t0 := pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp());";
const INSERT_STMT = "INSERT INTO retention_capture.detail_capture_anchors\n  (resource_id, owner_user_id, original_recorded_at, capture_kind, capture_contract_version, capture_context)\n VALUES (NEW.id, NEW.user_id, v_t0, 'canonical_meal_insert', 'retention-capture-v1', v_context);";
const TRIGGER_STMT = 'CREATE TRIGGER retention_capture_t0 AFTER INSERT ON public.meal_records\n FOR EACH ROW EXECUTE FUNCTION retention_capture.capture_meal_record_insert();';
const BEFORE_MEMBERSHIP_REVOKE = "SET LOCAL ROLE consumer_retention_capture_builder;\nDO $$ BEGIN\n EXECUTE pg_catalog.format('REVOKE consumer_retention_capture_owner FROM %I',session_user);";
const once = (s, a, b) => { if (s.split(a).length !== 2) throw Error('MUTATION_ANCHOR_NOT_UNIQUE ' + a.slice(0, 60)); return s.replace(a, () => b); };

// [id, defect, mutate(source), primary detector (must fail), further detectors (may fail)]
export const SPECS = [
  ['X01_TRIGGER_REMOVED', 'the meal_records trigger is not created', s => once(s, TRIGGER_STMT, '-- mutation: trigger removed'), 'P02_ENTRY_V1_DIRECT', ['P03_ENTRY_V2', 'P04_ENTRY_FINALIZE_LEGACY', 'P06_ENTRY_PLANNED_CONVERSION']],
  ['X02_TRIGGER_ON_UPDATE', 'capture fires on UPDATE instead of INSERT', s => once(s, TRIGGER_STMT, TRIGGER_STMT.replace('AFTER INSERT', 'AFTER UPDATE')), 'P02_ENTRY_V1_DIRECT', ['P03_ENTRY_V2']],
  ['X03_T0_FROM_MEAL_TIME', 'T0 taken from the caller occurred_at', s => once(s, T0_LINE, "v_t0 := pg_catalog.date_trunc('milliseconds', NEW.occurred_at);"), 'P07_BACKFILLED_MEAL_TIME_DOES_NOT_MOVE_T0', ['P02_ENTRY_V1_DIRECT']],
  ['X04_T0_FROM_CREATED_AT', 'T0 taken from the row created_at', s => once(s, T0_LINE, "v_t0 := pg_catalog.date_trunc('milliseconds', NEW.created_at);"), 'P14_ACTOR_CONTEXT_LABEL_AND_AUTH_UID_PARITY', []],
  ['X05_CLOCK_TIMESTAMP', 'wall clock at trigger time instead of the transaction timestamp', s => once(s, T0_LINE, "v_t0 := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());"), 'P10_LATER_WRITES_AND_LONG_TRANSACTION_KEEP_T0', ['P02_ENTRY_V1_DIRECT']],
  ['X06_NO_MILLISECOND_TRUNCATION', 'T0 keeps microseconds', s => once(s, T0_LINE, 'v_t0 := pg_catalog.transaction_timestamp();'), 'P02_ENTRY_V1_DIRECT', ['P03_ENTRY_V2']],
  ['X07_IMMUTABILITY_TRIGGER_REMOVED', 'anchors can be updated', s => once(s, 'CREATE TRIGGER anchor_immutable BEFORE UPDATE ON retention_capture.detail_capture_anchors\n FOR EACH ROW EXECUTE FUNCTION retention_capture.reject_anchor_update();', '-- mutation: immutability trigger removed'), 'N02_ANCHOR_CANNOT_BE_REWRITTEN', []],
  ['X08A_RUNTIME_SELECT_GRANT', 'authenticated may read anchors', s => once(s, BEFORE_MEMBERSHIP_REVOKE, 'GRANT USAGE ON SCHEMA retention_capture TO authenticated;\nGRANT SELECT ON retention_capture.detail_capture_anchors TO authenticated;\n' + BEFORE_MEMBERSHIP_REVOKE), 'N01_RUNTIME_CANNOT_REACH_ANCHORS', ['P13_EXACT_POST_STATE_AND_CLEAN_ROLES']],
  ['X08B_INSERT_POLICY_FOR_PUBLIC', 'insert policy widened to PUBLIC', s => once(s, 'TO consumer_retention_capture_owner WITH CHECK (true);', 'TO PUBLIC WITH CHECK (true);'), 'P13_EXACT_POST_STATE_AND_CLEAN_ROLES', []],
  ['X08C_FORCE_RLS_REMOVED', 'FORCE ROW LEVEL SECURITY is not applied', s => once(s, 'ALTER TABLE retention_capture.detail_capture_anchors FORCE ROW LEVEL SECURITY;', '-- mutation: FORCE RLS removed'), 'P13_EXACT_POST_STATE_AND_CLEAN_ROLES', []],
  ['X09_ANCHOR_FAILURE_SWALLOWED', 'anchor INSERT errors are ignored', s => once(s, INSERT_STMT, 'BEGIN\n ' + INSERT_STMT + '\n EXCEPTION WHEN OTHERS THEN NULL;\n END;'), 'N06_ANCHOR_FAILURE_FAILS_THE_WHOLE_SAVE', ['N12_APP_SAVE_CALL_RECOGNISES_CAPTURE_FAILURE']],
  ['X10_TRIGGER_ALSO_ON_UPDATE', 'trigger fires on INSERT or UPDATE (request id write-back)', s => once(s, TRIGGER_STMT, TRIGGER_STMT.replace('AFTER INSERT', 'AFTER INSERT OR UPDATE')), 'P03_ENTRY_V2', ['P08_REPLAY_KEEPS_RECORD_AND_T0']],
  ['X11_FK_CASCADE_REMOVED', 'anchors block record deletion', s => once(s, 'REFERENCES public.meal_records(id) ON DELETE CASCADE', 'REFERENCES public.meal_records(id)'), 'P12_DELETE_AND_ACCOUNT_CASCADE_REMOVE_ANCHOR', []],
  ['X12_CONTEXT_ALWAYS_AUTHENTICATED', 'every anchor claims an authenticated actor', s => once(s, "v_context text := 'no_actor_claim';", "v_context text := 'authenticated_actor';"), 'P14_ACTOR_CONTEXT_LABEL_AND_AUTH_UID_PARITY', []],
  ['X13A_CAPTURE_FUNCTION_SECURITY_INVOKER', 'capture function runs as the invoker', s => once(s, "LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$\nDECLARE\n v_t0 timestamptz;", "LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$\nDECLARE\n v_t0 timestamptz;"), 'P02_ENTRY_V1_DIRECT', ['P13_EXACT_POST_STATE_AND_CLEAN_ROLES']],
  ['X13B_EXECUTE_FOR_PUBLIC', 'capture function executable by PUBLIC', s => once(s, BEFORE_MEMBERSHIP_REVOKE, 'GRANT EXECUTE ON FUNCTION retention_capture.capture_meal_record_insert() TO PUBLIC;\n' + BEFORE_MEMBERSHIP_REVOKE), 'N01_RUNTIME_CANNOT_REACH_ANCHORS', ['P13_EXACT_POST_STATE_AND_CLEAN_ROLES']],
  ['X14_MIGRATION_BACKFILLS_EXISTING_ROWS', 'migration writes anchors for existing records', s => once(s, BEFORE_MEMBERSHIP_REVOKE, "INSERT INTO retention_capture.detail_capture_anchors SELECT m.id, m.user_id, pg_catalog.date_trunc('milliseconds', m.created_at), 'canonical_meal_insert', 'retention-capture-v1', 'no_actor_claim' FROM public.meal_records m;\n" + BEFORE_MEMBERSHIP_REVOKE), 'P01_LEGACY_ROWS_NO_BACKFILL', []],
  ['X15_EXISTING_FUNCTION_ALTERED', 'a predecessor RPC is altered', s => once(s, BEFORE_MEMBERSHIP_REVOKE, 'ALTER FUNCTION public.create_current_user_meal_record(public.meal_type, timestamp with time zone, date, text, text, text, public.meal_source_type, jsonb) SECURITY INVOKER;\n' + BEFORE_MEMBERSHIP_REVOKE), 'P11_EXISTING_DEFINITIONS_ACL_UNCHANGED', []],
  ['X15B_EXISTING_FUNCTION_COST_ALTERED', 'a predecessor RPC attribute outside the scope digest is altered', s => once(s, BEFORE_MEMBERSHIP_REVOKE, 'ALTER FUNCTION public.create_current_user_meal_record(public.meal_type, timestamp with time zone, date, text, text, text, public.meal_source_type, jsonb) COST 777;\n' + BEFORE_MEMBERSHIP_REVOKE), 'P11_EXISTING_DEFINITIONS_ACL_UNCHANGED', []],
  ['X16_TIER_COLUMN_ADDED', 'a tier column appears on the anchor', s => once(s, BEFORE_MEMBERSHIP_REVOKE, 'ALTER TABLE retention_capture.detail_capture_anchors ADD COLUMN tier text;\n' + BEFORE_MEMBERSHIP_REVOKE), 'N11_NO_ENTITLEMENT_OR_TIER_SURFACE', []],
  ['X17_PATH_SPECIFIC_HOOK', 'capture only for manual-source records', s => once(s, TRIGGER_STMT, TRIGGER_STMT.replace('FOR EACH ROW', "FOR EACH ROW WHEN (NEW.source = 'manual')")), 'P04_ENTRY_FINALIZE_LEGACY', ['P05_ENTRY_FINALIZE_V3_EXISTING_ANALYSIS']],
  ['X18_TRIGGER_BEFORE_INSERT', 'capture runs before the record exists', s => once(s, TRIGGER_STMT, TRIGGER_STMT.replace('AFTER INSERT', 'BEFORE INSERT')), 'P02_ENTRY_V1_DIRECT', ['P03_ENTRY_V2']],
  ['X19_FAIL_OPEN_ON_MISSING_SCHEMA_GUARD', 'G1 platform marker refusal removed', s => once(s, "IF pg_catalog.cardinality(v_markers) > 0 THEN", "IF false AND pg_catalog.cardinality(v_markers) > 0 THEN"), 'N08_MIGRATION_PRECONDITIONS_FAIL_CLOSED', []],
  ['X20_SCOPE_DRIFT_GUARD_REMOVED', 'G2 scope comparison removed', s => once(s, "IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.cap_scope_digest') THEN", "IF false AND v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.cap_scope_digest') THEN"), 'N09_MIGRATION_ROLLBACK_AND_CONCURRENT_DRIFT', []]
];

export async function runMutations({ bin, out, only }) {
  const rec = recorder(out);
  rec.write('executed-source-bindings.json', { captureMigrationSha256: sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', CAPTURE_MIGRATION))), mutationsSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) });
  const results = []; const normal = captureSource();
  let cl;
  try {
    cl = await captureCluster(bin, rec);
    // control: every detector passes on the unmodified migration
    const detectors = [...new Set(SPECS.flatMap(([, , , p, more]) => [p, ...more]))];
    const control = [];
    for (const id of detectors) { const r = await runGate(cl, id, normal); control.push({ id, pass: r.pass }); }
    rec.write('control.json', control);
    if (!control.every(c => c.pass)) throw Error('NORMAL_SETUP_DETECTOR_FAILED ' + control.filter(c => !c.pass).map(c => c.id).join(','));
    for (const [id, defect, mutate, primary, more] of SPECS) {
      if (only && !only.includes(id)) continue;
      const dir = path.join(out, id); fs.mkdirSync(dir, { recursive: true });
      const raw = mutate(normal);
      if (raw === normal) throw Error('MUTATION_NOT_APPLIED ' + id);
      fs.writeFileSync(path.join(dir, 'raw-mutant.sql'), raw);
      // raw apply on a clean database: record how the migration's own guards react
      const probe = await cl.fresh(id + '-raw', async ctx => ({ ...(await tryApply(ctx, raw)) }), { capture: false });
      let installed = raw, g2 = null;
      const mismatch = /^CAP_POST_STATE_MISMATCH expected=([0-9a-f]{64}) observed=([0-9a-f]{64})$/.exec(probe.error?.message ?? '');
      if (mismatch) { g2 = { rejected: 'CAP_POST_STATE_MISMATCH', expected: mismatch[1], observed: mismatch[2] }; installed = raw.split(mismatch[1]).join(mismatch[2]); }
      else if (probe.error && /^CAP_POST_GUARD_DRIFT|^CAP_PLATFORM|^CAP_/.test(probe.error.message)) g2 = { rejected: probe.error.message.split(' ')[0], raw: true };
      else if (probe.error) throw Error('MUTANT_UNEXPECTED_APPLY_ERROR ' + id + ' ' + probe.error.message);
      fs.writeFileSync(path.join(dir, 'installed-mutant.sql'), installed);
      const failed = []; const passedGates = []; const evaluated = [];
      const guardOnly = g2?.raw === true && g2.rejected === 'CAP_POST_GUARD_DRIFT';
      // N08/N09 mutants are judged on their own behavioural gate against the mutant text
      for (const gate of [primary, ...more]) {
        if (guardOnly) break;
        const r = await runGate(cl, gate, installed);
        evaluated.push(gate); (r.pass ? passedGates : failed).push(gate);
        fs.writeFileSync(path.join(dir, `gate-${gate}.json`), JSON.stringify({ gate, pass: r.pass, observed: r.observed }, null, 2));
      }
      const detectedByGate = failed.includes(primary);
      const detectedByGuard = guardOnly;
      const pass = detectedByGate || detectedByGuard;
      const result = { id, defect, primary, rawMutantSha256: sha(raw), installedMutantSha256: sha(installed), normalSha256: sha(normal), rawApply: probe.error ?? 'applied', g2, evaluated, failedGates: failed, passedGates, detectedByGate, detectedByGuard, rebased: installed !== raw, pass };
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
      results.push(result); rec.check(id, pass, result);
    }
    rec.write('result.json', { status: 'PASS', exitCode: 0, controls: results.length, detectorsControlPass: control.length, results });
    return 0;
  } catch (e) {
    rec.write('result.json', { status: e.behavior ? 'FAIL' : 'BLOCKED', exitCode: e.behavior ? 1 : 2, error: e.message, stack: e.stack, results });
    console.error(e.stack);
    return e.behavior ? 1 : 2;
  } finally { if (cl) await cl.stop(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code; try { code = await runMutations(options()); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
