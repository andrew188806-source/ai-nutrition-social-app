#!/usr/bin/env node
// TastKind R0-B-ENT1-A actual-source mutations. Each mutant is the real migration SQL with ONE defect. Every spec names its detector gate and class BEFORE it runs:
//   gate  : the named behavioural gate must fail on the installed mutant (a guard-only refusal does not count)
//   guard : the migration's own guard must refuse the raw mutant (recorded as a guard, never as behavioural detection)
//   green : an observably equivalent mutant (defence in depth): every listed detector must stay green
// A mutant whose only rejection is the exact post-state digest (ACQ_POST_STATE_MISMATCH) is re-pinned with the observed digest and then judged by its gate; the digest refusal is recorded separately.
// Setup errors are BLOCKED, never detections.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, ACQ_MIGRATION, recorder, sha } from './consumer-retention-persistence-smoke.mjs';
import { entCluster } from './consumer-retention-entitlement-smoke.mjs';
import { acqSource, acqFresh, acqApply, runGate, ALL_GATE_IDS, options } from './consumer-retention-acquisition-smoke.mjs';

const once = (s, a, b) => { if (s.split(a).length !== 2) throw Error('MUTATION_ANCHOR_NOT_UNIQUE ' + a.slice(0, 80)); return s.replace(a, () => b); };
const all = (s, a, b, total) => { if (s.split(a).length !== total + 1) throw Error(`MUTATION_ANCHOR_COUNT ${s.split(a).length - 1}!=${total} ` + a.slice(0, 70)); return s.split(a).join(b); };
const G = id => { const m = ALL_GATE_IDS.filter(x => x.startsWith(id + '_')); if (m.length !== 1) throw Error('UNKNOWN_GATE ' + id); return m[0]; };

const T = 'retention_acquisition.detail_acquisition_records';
const FN_HEAD = "RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$";
const LOCK_LINE = "  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_resource_id::text || ':retention_acquisition', 0));";
const LOCK_HANDLER = " EXCEPTION WHEN lock_not_available THEN\n  RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'ACQ_LOCK_TIMEOUT', 'resource_id', p_resource_id, 'receipt', NULL);\n END;";
const LOOKUP = "SELECT r.* INTO v_row FROM retention_acquisition.detail_acquisition_records r WHERE r.resource_id = p_resource_id;\n IF NOT FOUND THEN";
const STATE_CALL = 'retention_entitlement.entitlement_state_at(v_anchor.owner_user_id, v_anchor.original_recorded_at)';
const EVENTS_LINE = "  v_events := ARRAY(SELECT e::pg_catalog.uuid FROM pg_catalog.jsonb_array_elements_text(v_state->'evidence'->'events') AS t(e) ORDER BY 1);";
const AFTER_BUILDER_DROP = 'DROP ROLE consumer_retention_acquisition_builder;';
const line = (name, text) => ` CONSTRAINT ${name} ${text},\n`;

export const SPECS = [
  // ---- table constraints and triggers (direct-insert forgery and immutability) ----
  ['Z01_TIER_CHECK_ALLOWS_FREE', 'the table accepts a Free tier', s => once(s, "CONSTRAINT receipt_tier_paid CHECK (acquisition_tier = 'paid')", "CONSTRAINT receipt_tier_paid CHECK (acquisition_tier IN ('paid','free'))"), G('N03'), []],
  ['Z02_DEADLINE_CHECK_WEAKENED', 'the table accepts any deadline not before T0', s => once(s, "CONSTRAINT receipt_deadline_exact CHECK (retained_until = original_recorded_at + interval '4320 hours'),", 'CONSTRAINT receipt_deadline_exact CHECK (retained_until >= original_recorded_at),'), G('N03'), []],
  ['Z03_DEADLINE_IN_CALENDAR_DAYS', 'the deadline is T0 + 180 calendar days (moves by an hour across a DST change) in table and resolver', s => all(s, "interval '4320 hours'", "interval '180 days'", 2), G('P01'), [G('N03')]],
  ['Z04_IMMUTABILITY_TRIGGER_REMOVED', 'a receipt can be updated', s => once(s, `CREATE TRIGGER receipt_immutable BEFORE UPDATE ON ${T}\n FOR EACH ROW EXECUTE FUNCTION retention_acquisition.reject_receipt_update();`, ''), G('N02'), []],
  ['Z05_VALIDATE_TRIGGER_REMOVED', 'the anchor/evidence cross-check on insert is removed', s => once(s, `CREATE TRIGGER receipt_validate BEFORE INSERT ON ${T}\n FOR EACH ROW EXECUTE FUNCTION retention_acquisition.validate_receipt();`, ''), G('N03'), []],
  ['Z06_PARTIAL_IMMUTABILITY', 'only a change of retained_until is refused; every other update is allowed', s => once(s, "BEGIN\n RAISE EXCEPTION 'ACQ_RECEIPT_IMMUTABLE' USING ERRCODE='23514';\nEND $$;", "BEGIN\n IF NEW.retained_until IS DISTINCT FROM OLD.retained_until THEN\n  RAISE EXCEPTION 'ACQ_RECEIPT_IMMUTABLE' USING ERRCODE='23514';\n END IF;\n RETURN NEW;\nEND $$;"), G('N02'), []],
  ['Z07_CASCADE_REMOVED', 'a deleted meal can no longer remove its receipt', s => once(s, 'REFERENCES retention_capture.detail_capture_anchors(resource_id) ON DELETE CASCADE,', 'REFERENCES retention_capture.detail_capture_anchors(resource_id),'), G('P11'), []],
  ['Z08_EVIDENCE_STATE_CHECK_REMOVED', 'the stored answer may say anything about state, basis or policy', s => once(s, line('receipt_evidence_state', "CHECK (entitlement_evidence->>'state' = 'paid' AND entitlement_evidence->>'basis' = acquisition_basis AND entitlement_evidence->>'policy' = entitlement_policy)"), ''), G('N03'), []],
  ['Z09_SAMPLED_TEXT_CHECK_REMOVED', 'the stored sampled_at may differ from the stored answer', s => once(s, line('receipt_evidence_sampled', "CHECK (entitlement_evidence->>'sampled_at' = pg_catalog.to_char(entitlement_sampled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))"), ''), G('N03'), []],
  ['Z10_REF_CHECK_REMOVED', 'the acquisition reference may be anything', s => once(s, line('receipt_ref_exact', "CHECK (acquisition_ref = 'acq:' || resource_id::text)"), ''), G('N03'), []],
  ['Z11_SAMPLED_BEFORE_T0_ALLOWED', 'a resolution sampled before T0 is accepted', s => once(s, line('receipt_sampled_not_before_t0', 'CHECK (entitlement_sampled_at >= original_recorded_at)'), ''), G('N03'), []],
  ['Z12_EMPTY_EVIDENCE_ALLOWED', 'a receipt without any fact id is accepted', s => once(s, "CONSTRAINT receipt_evidence_nonempty CHECK (pg_catalog.cardinality(evidence_event_ids) >= 1)", 'CONSTRAINT receipt_evidence_nonempty CHECK (pg_catalog.cardinality(evidence_event_ids) >= 0)'), G('N03'), []],
  ['Z13_EVENTS_LENGTH_CHECK_REMOVED', 'the stored fact ids may differ in number from the stored answer (trigger bypassed)', s => once(s, " CONSTRAINT receipt_evidence_events CHECK (pg_catalog.jsonb_typeof(entitlement_evidence->'evidence'->'events') = 'array'\n   AND pg_catalog.jsonb_array_length(entitlement_evidence->'evidence'->'events') = pg_catalog.cardinality(evidence_event_ids))\n", " CONSTRAINT receipt_evidence_events CHECK (true)\n"), G('N03'), []],
  ['Z14_CONTEXT_CHECK_ALLOWS_UNTRUSTED', 'the table accepts a no_actor_claim anchor context', s => once(s, "CONSTRAINT receipt_capture_context CHECK (capture_context = 'authenticated_actor')", "CONSTRAINT receipt_capture_context CHECK (capture_context IN ('authenticated_actor','no_actor_claim'))"), G('N03'), []],
  ['Z15_MILLISECOND_CHECK_LOOP_DISABLED', 'timestamps with sub-millisecond precision are accepted', s => once(s, "WHERE table_schema='retention_acquisition' AND data_type='timestamp with time zone'", "WHERE table_schema='retention_acquisition' AND data_type='timestamp with time zone' AND false"), G('N03'), []],
  // ---- resolver decisions ----
  ['Z16_UNTRUSTED_CONTEXT_NOT_REFUSED', 'the resolver does not refuse a no_actor_claim anchor', s => once(s, "IF v_anchor.capture_context <> 'authenticated_actor' THEN", 'IF false THEN'), G('N04'), [G('P10')]],
  ['Z17_FREE_BRANCH_REMOVED', 'a Free answer is no longer a pending outcome', s => once(s, "IF v_state->>'state' = 'free' THEN", 'IF false THEN'), G('N04'), [G('P09')]],
  ['Z18_FREE_FLOWS_TO_INSERT', 'a Free answer is pushed toward the insert as if it were final', s => once(once(s, "IF v_state->>'state' = 'free' THEN", 'IF false THEN'), "ELSIF v_state->>'state' IS DISTINCT FROM 'paid' OR v_state->>'basis' NOT IN ('paid_subscription','trial')", "ELSIF v_state->>'basis' NOT IN ('paid_subscription','trial')"), G('N04'), [G('P09')]],
  ['Z19_UNKNOWN_BRANCH_REMOVED', 'an unknown answer is no longer a pending outcome', s => once(s, "ELSIF v_state->>'state' = 'unknown' THEN", 'ELSIF false THEN'), G('N04'), [G('P09')]],
  ['Z20_UNKNOWN_REASON_REPLACED', 'every unknown answer reports the same reason', s => once(s, "COALESCE(v_state->>'reason', 'ACQ_UNKNOWN')", "'NO_REQUIRED_PRODUCER'"), G('N04'), []],
  ['Z21_RESOLVES_CURRENT_STATE_NOT_T0', 'the resolver asks for the owner state NOW instead of at T0', s => once(s, STATE_CALL, 'retention_entitlement.entitlement_state_at(v_anchor.owner_user_id, pg_catalog.clock_timestamp())'), G('P06'), [G('P07')]],
  ['Z22_PAID_REQUIRES_COMPLETE_COVERAGE', 'Paid evidence is refused while any coverage is incomplete (AP-2 reversed)', s => once(s, EVENTS_LINE, "  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_state->'evidence'->'coverage') c WHERE c->>'covered_through' IS NULL) THEN\n   RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'COVERAGE_SHORT', 'resource_id', p_resource_id, 'receipt', NULL);\n  END IF;\n" + EVENTS_LINE), G('P09'), [G('P01')]],
  ['Z23_BASIS_HARDCODED', 'the basis is always paid_subscription (a trial is disguised as a payment)', s => once(s, "'paid', v_state->>'basis', v_events, v_state,", "'paid', 'paid_subscription', v_events, v_state,"), G('P02'), []],
  ['Z24_SAMPLED_AT_FROM_ANOTHER_CLOCK_READ', 'the stored sampling time is a new clock read, not the one of the answer', s => once(s, "(v_state->>'sampled_at')::pg_catalog.timestamptz,", "pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),"), G('P04'), [G('P01')]],
  ['Z25_REPLAY_RECOMPUTES', 'a stored receipt is not looked up; every call recomputes', s => once(s, LOOKUP, "SELECT r.* INTO v_row FROM retention_acquisition.detail_acquisition_records r WHERE false;\n IF NOT FOUND THEN"), G('P05'), [G('P15')]],
  ['Z26_REPLAY_SAMPLES_THE_RESOLVER', 'a replay still calls the resolver (and discards the answer)', s => once(s, LOOKUP, "SELECT r.* INTO v_row FROM retention_acquisition.detail_acquisition_records r WHERE r.resource_id = p_resource_id;\n IF FOUND THEN\n  PERFORM retention_entitlement.entitlement_state_at(v_row.owner_user_id, v_row.original_recorded_at);\n END IF;\n IF NOT FOUND THEN"), G('P05'), []],
  ['Z27_REPLAY_REPORTED_AS_RECORDED', 'a replay reports recorded', s => once(s, " v_outcome text := 'replayed';", " v_outcome text := 'recorded';"), G('P05'), [G('P15')]],
  // ---- transaction contract ----
  ['Z28_DIRTY_TRANSACTION_GUARD_REMOVED', 'a transaction that has already written is accepted', s => once(s, 'IF pg_catalog.pg_current_xact_id_if_assigned() IS NOT NULL THEN', 'IF false THEN'), G('N06'), []],
  ['Z29_ISOLATION_GUARD_REMOVED', 'the resolver does not refuse isolation levels itself', s => once(s, "IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN\n  RAISE EXCEPTION 'ACQ_ISOLATION_UNSUPPORTED'", "IF false THEN\n  RAISE EXCEPTION 'ACQ_ISOLATION_UNSUPPORTED'"), G('N06'), []],
  ['Z30_RESOURCE_LOCK_REMOVED', 'concurrent resolves of one resource are not serialised', s => once(s, LOCK_LINE, '  NULL;'), G('P15'), [G('P16')]],
  ['Z31_RESOURCE_LOCK_NEVER_RELEASED', 'the resource lock is session-level and never released', s => once(s, 'PERFORM pg_catalog.pg_advisory_xact_lock(', 'PERFORM pg_catalog.pg_advisory_lock('), G('P15'), [G('N09')]],
  ['Z32_LOCK_TIMEOUT_NOT_CAUGHT', 'a resource-lock timeout is raised as an error instead of a pending outcome', s => once(s, LOCK_HANDLER, ' END;'), G('P16'), []],
  // ---- function attributes ----
  ['Z33_RESOLVER_IS_SECURITY_INVOKER', 'the resolver runs with the caller privileges', s => once(s, FN_HEAD, FN_HEAD.replace('SECURITY DEFINER', 'SECURITY INVOKER')), G('N09'), [G('P01')]],
  ['Z34_SEARCH_PATH_UNPINNED', 'the resolver does not pin search_path', s => once(s, FN_HEAD, FN_HEAD.replace(" SET search_path = ''", '')), G('N09'), []],
  ['Z35_FUNCTION_LOCK_TIMEOUT_REMOVED', 'the resolver has no function-level lock_timeout', s => once(s, FN_HEAD, FN_HEAD.replace(" SET lock_timeout = '2s'", '')), G('N09'), []],
  // ---- ACLs ----
  ['Z36_PUBLIC_MAY_CALL_THE_RESOLVER', 'PUBLIC holds USAGE on the schema and EXECUTE on the resolver', s => once(s, AFTER_BUILDER_DROP, AFTER_BUILDER_DROP + '\nGRANT USAGE ON SCHEMA retention_acquisition TO PUBLIC;\nGRANT EXECUTE ON FUNCTION retention_acquisition.resolve_detail_acquisition(uuid) TO PUBLIC;'), G('N01'), [G('P12')]],
  ['Z37_RUNTIME_ROLE_MAY_READ_RECEIPTS', 'authenticated can read the receipts', s => once(s, AFTER_BUILDER_DROP, AFTER_BUILDER_DROP + `\nGRANT USAGE ON SCHEMA retention_acquisition TO authenticated;\nGRANT SELECT ON ${T} TO authenticated;\nCREATE POLICY leak ON ${T} AS PERMISSIVE FOR SELECT TO authenticated USING (true);`), G('N01'), [G('P12')]],
  ['Z38_FORCE_RLS_REMOVED', 'row level security is not forced on the receipt table', s => once(s, `ALTER TABLE ${T} FORCE ROW LEVEL SECURITY;\n`, ''), G('P12'), []],
  ['Z39_BUILDER_ROLE_KEPT', 'the disposable builder role is not dropped (its membership edge on the sealed owner remains: the own residue guard of the migration refuses)', s => once(s, AFTER_BUILDER_DROP, '-- builder kept'), G('P12'), [], { expect: 'guard' }],
  ['Z40_SEAM_WIDENED_TO_ALL_PRIVILEGES', 'the anchors seam grants ALL instead of SELECT', s => once(s, 'GRANT SELECT ON retention_capture.detail_capture_anchors TO consumer_retention_acquisition_owner;', 'GRANT ALL ON retention_capture.detail_capture_anchors TO consumer_retention_acquisition_owner;'), G('P12'), [], { expect: 'guard' }],
  ['Z41_SEAM_GRANTED_TO_PUBLIC', 'the entitlement schema seam is granted to PUBLIC', s => once(s, 'GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_acquisition_owner;', 'GRANT USAGE ON SCHEMA retention_entitlement TO PUBLIC;'), G('P12'), [], { expect: 'guard' }],
  ['Z42_ANCHOR_POLICY_FOR_PUBLIC', 'the anchors SELECT policy applies to PUBLIC', s => once(s, 'CREATE POLICY acquisition_owner_select ON retention_capture.detail_capture_anchors AS PERMISSIVE FOR SELECT TO consumer_retention_acquisition_owner USING (true);', 'CREATE POLICY acquisition_owner_select ON retention_capture.detail_capture_anchors AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);'), G('P12'), [], { expect: 'guard' }],
  // ---- migration guards ----
  ['Z43_PREDECESSOR_DRIFT_GUARD_REMOVED', 'the pre-apply predecessor drift refusal is removed', s => once(s, "RAISE EXCEPTION 'ACQ_PREDECESSOR_DRIFT' USING ERRCODE='42501';", 'NULL;'), G('N07'), []],
  ['Z44_PLATFORM_MARKER_REFUSAL_REMOVED', 'the platform marker refusal is removed', s => once(s, "RAISE EXCEPTION 'ACQ_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';", 'NULL;'), G('N07'), []],
  ['Z45_SUPERUSER_REQUIREMENT_REMOVED', 'a non-superuser actor is accepted', s => once(s, 'AND r.rolcanlogin AND r.rolsuper', 'AND r.rolcanlogin'), G('N07'), []],
  ['Z46_G2_SCOPE_COMPARISON_REMOVED', 'the post-apply scope comparison is removed', s => once(s, "IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.acq_scope_digest') THEN", "IF false AND v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.acq_scope_digest') THEN"), G('N08'), []],
  ['Z47_G2_SEAM_CHECK_REMOVED', 'the exact seam-state refusal is removed', s => once(s, "RAISE EXCEPTION 'ACQ_SEAM_STATE_MISMATCH' USING ERRCODE='42501';", 'NULL;'), G('N08'), []],
  // ---- equivalent mutant (defence in depth; must stay green) ----
  ['Z48_EVENT_ID_SORT_REMOVED', 'the resolver no longer sorts the fact ids (the resolver answer is already ordered by event id)', s => once(s, EVENTS_LINE, EVENTS_LINE.replace(' ORDER BY 1', '')), G('P03'), [G('P04')], { expect: 'green' }]
];

const GATE_WATCHDOG_MS = 900000;
const guarded = (cl, id, source) => Promise.race([runGate(cl, id, source), new Promise((_, rej) => setTimeout(() => rej(Error('GATE_WATCHDOG_TIMEOUT ' + id)), GATE_WATCHDOG_MS).unref())]);
export async function runMutations({ bin, out, only }) {
  const rec = recorder(out);
  rec.write('executed-source-bindings.json', { acqMigrationSha256: sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', ACQ_MIGRATION))), mutationsSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) });
  const results = []; const survivors = []; const normal = acqSource();
  if (only) { const unknown = only.filter(x => !SPECS.some(([id]) => id === x)); if (unknown.length) throw Error('UNKNOWN_MUTANT_ID ' + unknown.join(',')); }
  let cl;
  try {
    for (const [id, , mutate] of SPECS) if (mutate(normal) === normal) throw Error('MUTATION_NOT_APPLIED ' + id);
    cl = await entCluster(bin, rec);
    // control: every detector passes on the unmodified migration
    const detectors = [...new Set(SPECS.filter(([id]) => !only || only.includes(id)).flatMap(([, , , p, more]) => [p, ...more]))];
    const control = [];
    for (const id of detectors) { const r = await guarded(cl, id, normal); control.push({ id, pass: r.pass }); }
    rec.write('control.json', control);
    if (!control.every(c => c.pass)) throw Error('NORMAL_SETUP_DETECTOR_FAILED ' + control.filter(c => !c.pass).map(c => c.id).join(','));
    for (const [id, defect, mutate, primary, more, opts = {}] of SPECS) {
      if (only && !only.includes(id)) continue;
      const expect = opts.expect ?? 'gate';
      const dir = path.join(out, id); fs.mkdirSync(dir, { recursive: true });
      const raw = mutate(normal);
      fs.writeFileSync(path.join(dir, 'raw-mutant.sql'), raw);
      // raw apply on a clean database (ENT0 applied, ENT1-A not): record how the migration's own guards react
      const probe = await acqFresh(cl, id + '-raw', async ctx => acqApply(ctx, raw), { apply: false, acq: raw });
      let installed = raw, g2 = null;
      const mismatch = /^ACQ_POST_STATE_MISMATCH expected=([0-9a-f]{64}) observed=([0-9a-f]{64})$/.exec(probe.error?.message ?? '');
      if (mismatch) { g2 = { rejected: 'ACQ_POST_STATE_MISMATCH', expected: mismatch[1], observed: mismatch[2] }; installed = raw.split(mismatch[1]).join(mismatch[2]); }
      else if (probe.error && /^(ACQ_|RETENTION_)/.test(probe.error.message)) g2 = { rejected: probe.error.message.split(' ')[0], raw: true };
      else if (probe.error) throw Error('MUTANT_UNEXPECTED_APPLY_ERROR ' + id + ' ' + probe.error.message);
      fs.writeFileSync(path.join(dir, 'installed-mutant.sql'), installed);
      const failed = []; const passedGates = []; const evaluated = [];
      const guardOnly = g2?.raw === true;
      // N07/N08 mutants are judged on their own behavioural gate against the mutant text; a mutant refused raw by its own guard is not run
      if (!guardOnly || [G('N07'), G('N08')].includes(primary)) {
        for (const gate of [primary, ...more]) {
          const r = await guarded(cl, gate, installed);
          evaluated.push(gate); (r.pass ? passedGates : failed).push(gate);
          fs.writeFileSync(path.join(dir, `gate-${gate}.json`), JSON.stringify({ gate, pass: r.pass, observed: r.observed }, null, 2));
        }
      }
      const detectedByGate = failed.includes(primary);
      const detectedByGuard = guardOnly;
      const pass = expect === 'gate' ? detectedByGate : expect === 'guard' ? detectedByGuard : (!guardOnly && failed.length === 0);
      const result = { id, defect, expect, primary, rawMutantSha256: sha(raw), installedMutantSha256: sha(installed), normalSha256: sha(normal), rawApply: probe.error ?? 'applied', g2, evaluated, failedGates: failed, passedGates, detectedByGate, detectedByGuard, rebased: installed !== raw, pass };
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
      results.push(result); rec.write('check-' + id + '.json', { id, pass, observed: result }); console.log('CHECK ' + id + ' ' + (pass ? 'PASS' : 'FAIL')); if (!pass) survivors.push(id);
    }
    if (survivors.length) { const err = Error('SURVIVING_MUTANTS ' + survivors.join(',')); err.behavior = true; throw err; }
    rec.write('result.json', { status: 'PASS', exitCode: 0, controls: results.length, detectorsControlPass: control.length, results });
    return 0;
  } catch (e) {
    rec.write('result.json', { status: e.behavior ? 'FAIL' : 'BLOCKED', exitCode: e.behavior ? 1 : 2, error: e.message, stack: e.stack, results });
    console.error(e.stack);
    return e.behavior ? 1 : 2;
  } finally { if (cl) await cl.stop(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code; try { code = await runMutations({ ...options(), only: process.env.TK_MUTANTS ? process.env.TK_MUTANTS.split(',') : null }); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
