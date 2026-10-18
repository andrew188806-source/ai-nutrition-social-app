#!/usr/bin/env node
// TastKind R0-B-ENT-R actual-source mutations (retention-line construction 2026-10-17; NOT an acceptance). Each mutant is the real migration SQL with ONE defect. Every spec names its detector gate and class BEFORE it runs:
//   gate  : the named behavioural gate must fail on the installed mutant (a guard-only refusal does not count)
//   guard : the migration's own guard must refuse the raw mutant (recorded as a guard, never as behavioural detection)
//   green : an observably equivalent mutant (defence in depth): every listed detector must stay green
// opts.cls 'message-overlap' marks a mutant whose defect is ALSO caught by a second, independent protection (a table CHECK, or ENT0 itself); the gate detects it only because the error identity differs. It is counted separately and is
// never reported as an independent behavioural detection.
// A mutant whose only rejection is the exact post-state digest (SEAL_POST_STATE_MISMATCH) is re-pinned with the observed digest and then judged by its gate; the digest refusal is recorded separately.
// Setup errors are BLOCKED, never detections.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, SEAL_MIGRATION, recorder, sha } from './consumer-retention-persistence-smoke.mjs';
import { entCluster } from './consumer-retention-entitlement-smoke.mjs';
import { sealSource, sealFresh, sealApply, runGate, ALL_GATE_IDS, options, deriveApplicationClass, migrationObservationControls } from './consumer-retention-seal-smoke.mjs';

const once = (s, a, b) => { if (s.split(a).length !== 2) throw Error('MUTATION_ANCHOR_NOT_UNIQUE ' + a.slice(0, 80)); return s.replace(a, () => b); };
const cut = (s, from, to, replacement) => { const i = s.indexOf(from); const j = s.indexOf(to, i); if (i < 0 || j < 0 || s.indexOf(from, i + 1) >= 0) throw Error('MUTATION_CUT_ANCHOR ' + from.slice(0, 60)); return s.slice(0, i) + replacement + s.slice(j + to.length); };
const G = id => { const m = ALL_GATE_IDS.filter(x => x.startsWith(id + '_')); if (m.length !== 1) throw Error('UNKNOWN_GATE ' + id); return m[0]; };

const T = 'retention_seal.registry_seals';
const REC_HEAD = "RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$";
const AFTER_BUILDER_DROP = 'DROP ROLE consumer_retention_seal_builder;';
const CHAIN_LOCK = "PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('retention_registry_seal:chain', 0));";
const REPLAY_SELECT = 'SELECT s.* INTO v_row FROM retention_seal.registry_seals s WHERE s.attestation_ref = p_attestation_ref;';
const STATE_AT_CALL = "v_lock := retention_entitlement.entitlement_state_at('00000000-0000-0000-0000-000000000000'::pg_catalog.uuid, 'epoch'::pg_catalog.timestamptz);";
const ARGS_CHECK = "IF p_epoch_from IS NULL OR NOT pg_catalog.isfinite(p_epoch_from) OR pg_catalog.date_trunc('milliseconds', p_epoch_from) <> p_epoch_from\n    OR p_attestation_ref IS NULL OR pg_catalog.btrim(p_attestation_ref) = '' OR pg_catalog.length(p_attestation_ref) > 500 THEN";
const VALIDATE_COND = "ELSIF NEW.seal_seq <> v_prev.seal_seq + 1 OR NEW.epoch_from <> v_prev.epoch_from OR NEW.sealed_through <= v_prev.sealed_through\n    OR NEW.sealed_at < v_prev.sealed_at OR NEW.producer_count < v_prev.producer_count THEN";
const MS = "'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'";

export const SPECS = [
  // ---- table constraints and triggers (direct-insert forgery, chain and immutability) ----
  ['Z01_COUNT_CHECK_ALLOWS_ZERO', 'a seal of an empty registry is accepted by the table', s => once(s, 'CHECK (producer_count >= 1)', 'CHECK (producer_count >= 0)'), G('N03'), []],
  ['Z02_DIGEST_FORMAT_CHECK_REMOVED', 'the stored registry digest may be any text', s => once(s, "CONSTRAINT seal_digest_hex CHECK (registry_digest ~ '^[0-9a-f]{64}$')", 'CONSTRAINT seal_digest_hex CHECK (true)'), G('N03'), []],
  ['Z03_REFERENCE_CHECK_REMOVED', 'the attestation reference may be blank or unbounded', s => once(s, "CONSTRAINT seal_ref_valid CHECK (pg_catalog.btrim(attestation_ref) <> '' AND pg_catalog.length(attestation_ref) <= 500)", 'CONSTRAINT seal_ref_valid CHECK (true)'), G('N03'), []],
  ['Z04_REFERENCE_UNIQUENESS_REMOVED', 'one attestation reference may be recorded twice', s => once(s, 'CONSTRAINT seal_ref_unique UNIQUE ', ''), G('N03'), [G('P05')]],
  ['Z05_POLICY_CHECK_REMOVED', 'any seal policy text is accepted', s => once(s, "CONSTRAINT seal_policy_version CHECK (seal_policy = 'retention-registry-seal-v1')", 'CONSTRAINT seal_policy_version CHECK (true)'), G('N03'), []],
  ['Z06_EPOCH_ORDER_CHECK_REMOVED', 'a seal may begin after the instant it seals through', s => once(s, 'CONSTRAINT seal_epoch_not_after_through CHECK (epoch_from <= sealed_through)', 'CONSTRAINT seal_epoch_not_after_through CHECK (true)'), G('N03'), []],
  ['Z07_SEALED_AT_ORDER_CHECK_REMOVED', 'a seal may be recorded before the instant it claims to seal through', s => once(s, 'CONSTRAINT seal_through_not_after_sealed CHECK (sealed_through <= sealed_at)', 'CONSTRAINT seal_through_not_after_sealed CHECK (true)'), G('N03'), []],
  ['Z08_MILLISECOND_CHECK_LOOP_DISABLED', 'timestamps with sub-millisecond precision are accepted', s => once(s, "WHERE table_schema='retention_seal' AND data_type='timestamp with time zone'", "WHERE table_schema='retention_seal' AND data_type='timestamp with time zone' AND false"), G('N03'), []],
  ['Z09_SEQ_POSITIVE_CHECK_REMOVED', 'a non-positive sequence number is accepted by the table (trigger bypassed)', s => once(s, 'CONSTRAINT seal_seq_positive CHECK (seal_seq >= 1)', 'CONSTRAINT seal_seq_positive CHECK (true)'), G('N03'), []],
  ['Z10_IMMUTABILITY_TRIGGER_REMOVED', 'a seal can be updated or deleted', s => once(s, `CREATE TRIGGER seal_immutable BEFORE UPDATE OR DELETE ON ${T}\n FOR EACH ROW EXECUTE FUNCTION retention_seal.reject_seal_change();`, ''), G('N02'), []],
  ['Z11_PARTIAL_IMMUTABILITY', 'only a change of sealed_through is refused; every other update and every delete is allowed', s => once(s, "BEGIN\n RAISE EXCEPTION 'SEAL_IMMUTABLE' USING ERRCODE='23514';\nEND $$;", "BEGIN\n IF TG_OP = 'UPDATE' AND NEW.sealed_through IS DISTINCT FROM OLD.sealed_through THEN\n  RAISE EXCEPTION 'SEAL_IMMUTABLE' USING ERRCODE='23514';\n END IF;\n RETURN COALESCE(NEW, OLD);\nEND $$;"), G('N02'), []],
  ['Z12_DELETE_NOT_COVERED_BY_IMMUTABILITY', 'a seal can be deleted by a statement (updates are still refused)', s => once(s, `BEFORE UPDATE OR DELETE ON ${T}`, `BEFORE UPDATE ON ${T}`), G('N02'), []],
  ['Z13_VALIDATE_TRIGGER_REMOVED', 'no row-level chain rule exists', s => once(s, `CREATE TRIGGER seal_validate BEFORE INSERT ON ${T}\n FOR EACH ROW EXECUTE FUNCTION retention_seal.validate_seal();`, ''), G('N03'), []],
  ['Z14_CHAIN_ALLOWS_EPOCH_CHANGE', 'the epoch of the chain may change between seals', s => once(s, VALIDATE_COND, VALIDATE_COND.replace('OR NEW.epoch_from <> v_prev.epoch_from ', '')), G('N03'), []],
  ['Z15_CHAIN_ALLOWS_NON_ADVANCING_RANGE', 'a seal may repeat the previous sealed_through', s => once(s, VALIDATE_COND, VALIDATE_COND.replace('NEW.sealed_through <= v_prev.sealed_through', 'NEW.sealed_through < v_prev.sealed_through')), G('N03'), []],
  ['Z16_CHAIN_ALLOWS_SEALED_AT_REGRESSION', 'a seal may be recorded earlier than its predecessor', s => once(s, VALIDATE_COND, VALIDATE_COND.replace('\n    OR NEW.sealed_at < v_prev.sealed_at', '')), G('N03'), []],
  ['Z17_CHAIN_ALLOWS_REGISTRY_SHRINKAGE', 'the producer count may decrease between seals', s => once(s, VALIDATE_COND, VALIDATE_COND.replace(' OR NEW.producer_count < v_prev.producer_count', '')), G('N03'), []],
  ['Z18_CHAIN_ALLOWS_SEQUENCE_GAPS', 'sequence numbers may skip', s => once(s, VALIDATE_COND, VALIDATE_COND.replace('NEW.seal_seq <> v_prev.seal_seq + 1 OR ', '')), G('N03'), []],
  // ---- digest function (what "the sealed history" means) ----
  ['Z19_DIGEST_SHOWS_FUTURE_RETIREMENTS', 'a retirement scheduled for the future changes the digest of already sealed history', s => once(s, 'CASE WHEN p.retired_at IS NOT NULL AND p.retired_at <= p_through THEN', 'CASE WHEN p.retired_at IS NOT NULL THEN'), G('P03'), []],
  ['Z20_DIGEST_IGNORES_ROLE_NAMES', 'a producer role renamed after sealing goes unnoticed', s => once(s, 'p.namespace, p.role_name::text,', "p.namespace, ''::text,"), G('P04'), []],
  ['Z21_DIGEST_IGNORES_EFFECTIVE_RETIREMENTS', 'a retroactive retirement of sealed history goes unnoticed', s => once(s, 'p.retired_at IS NOT NULL AND p.retired_at <= p_through', 'false'), G('P04'), [G('P03')]],
  ['Z22_DIGEST_COVERS_PRODUCERS_REGISTERED_AFTER_THE_RANGE', 'a producer registered after the sealed range changes the digest of that range', s => once(s, 'FROM retention_entitlement.producers p WHERE p.registered_at <= p_through), \'[]\'', "FROM retention_entitlement.producers p), '[]'"), G('P03'), [G('P05')]],
  ['Z23_DIGEST_IGNORES_REGISTRATION_TIME', 'a producer whose registration time was moved earlier goes unnoticed', s => once(s, `pg_catalog.to_char(p.registered_at AT TIME ZONE 'UTC', ${MS}),`, "'-',"), G('P04'), []],
  // ---- recording function: sampling, history, chain ----
  ['Z24_HISTORY_CHECK_REMOVED', 'the extension does not verify the previously sealed history', s => once(s, 'IF retention_seal.registry_digest_through(v_prev.sealed_through) <> v_prev.registry_digest THEN', 'IF false THEN'), G('P04'), []],
  ['Z25_HISTORY_CHECK_AGAINST_THE_NEW_RANGE', 'the history check recomputes through the new range instead of the previous one', s => once(s, 'IF retention_seal.registry_digest_through(v_prev.sealed_through) <> v_prev.registry_digest THEN', 'IF retention_seal.registry_digest_through(v_through) <> v_prev.registry_digest THEN'), G('P03'), [G('P05')]],
  ['Z26_SAMPLED_WITHOUT_THE_REGISTRY_LOCK', 'sealed_through is a plain clock read: the seal does not wait for open registry writes', s => cut(s, STATE_AT_CALL, "v_through := (v_lock->>'sampled_at')::pg_catalog.timestamptz;", "v_through := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());"), G('P02'), [G('P11')]],
  ['Z27_REGISTRY_TIMEOUT_NOT_PENDING', 'a registry-lock timeout is not reported as pending', s => once(s, "IF v_lock->>'reason' IN ('REGISTRY_LOCK_TIMEOUT', 'OWNER_LOCK_TIMEOUT') THEN", 'IF false THEN'), G('P06'), []],
  ['Z28_EMPTY_REGISTRY_BRANCH_REMOVED', 'an empty registry is not a pending outcome (the table CHECK raises instead)', s => once(s, 'IF v_count = 0 THEN', 'IF false THEN'), G('P06'), []],
  ['Z29_CHAIN_LOCK_REMOVED', 'concurrent seals are not serialised', s => once(s, CHAIN_LOCK, 'NULL;'), G('P11'), [G('P12')]],
  ['Z30_CHAIN_LOCK_NEVER_RELEASED', 'the chain lock is session-level and never released', s => once(s, 'PERFORM pg_catalog.pg_advisory_xact_lock(', 'PERFORM pg_catalog.pg_advisory_lock('), G('N07'), [G('P12')]],
  ['Z31_CHAIN_LOCK_TIMEOUT_NOT_CAUGHT', 'a chain-lock timeout is raised as an error instead of a pending outcome', s => once(s, " EXCEPTION WHEN lock_not_available THEN\n  RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'SEAL_LOCK_TIMEOUT', 'seal', NULL);\n END;", ' END;'), G('P06'), []],
  ['Z32_NOT_ADVANCED_BRANCH_REMOVED', 'a call that cannot advance the sealed range is not pending (the table chain trigger raises instead)', s => once(s, 'IF v_through <= v_prev.sealed_through THEN', 'IF false THEN'), G('P06'), []],
  ['Z33_EPOCH_MISMATCH_ALLOWED', 'the function lets a later seal change the epoch (the row trigger still refuses)', s => once(s, 'IF v_prev.epoch_from <> p_epoch_from THEN', 'IF false THEN'), G('N04'), [G('P05')], { cls: 'message-overlap' }],
  // ---- replay / idempotency ----
  ['Z34_REPLAY_LOOKUP_REMOVED', 'a known attestation reference is not recognised', s => once(s, REPLAY_SELECT, 'SELECT s.* INTO v_row FROM retention_seal.registry_seals s WHERE false;'), G('P05'), []],
  ['Z35_REPLAY_CONFLICT_REMOVED', 'the same reference with another epoch is replayed instead of refused', s => once(s, 'IF v_row.epoch_from <> p_epoch_from THEN', 'IF false THEN'), G('P05'), []],
  ['Z36_REPLAY_SAMPLES_THE_REGISTRY', 'a replay still waits for the registry (calls the resolver first)', s => once(s, REPLAY_SELECT, STATE_AT_CALL.replace('v_lock :=', 'PERFORM') + '\n ' + REPLAY_SELECT), G('P05'), []],
  ['Z37_REPLAY_REPORTED_AS_SEALED', 'a replay reports sealed', s => once(s, "RETURN retention_seal.seal_json('replayed', v_row);", "RETURN retention_seal.seal_json('sealed', v_row);"), G('P05'), []],
  ['Z38_SEALED_BY_IS_THE_DEFINER', 'the recorded operator is the function owner, not the invoking login', s => once(s, 'p_attestation_ref, session_user,', 'p_attestation_ref, current_user,'), G('P01'), []],
  // ---- transaction contract and arguments ----
  ['Z39_DIRTY_TRANSACTION_GUARD_REMOVED', 'a transaction that has already written is accepted', s => once(s, 'IF pg_catalog.pg_current_xact_id_if_assigned() IS NOT NULL THEN', 'IF false THEN'), G('N04'), []],
  ['Z40_ISOLATION_GUARD_REMOVED', 'the function does not refuse isolation levels itself (ENT0 refuses them with another message)', s => once(s, "IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN\n  RAISE EXCEPTION 'SEAL_ISOLATION_UNSUPPORTED'", "IF false THEN\n  RAISE EXCEPTION 'SEAL_ISOLATION_UNSUPPORTED'"), G('N04'), [], { cls: 'message-overlap' }],
  ['Z41_EPOCH_IN_FUTURE_CHECK_REMOVED', 'an epoch later than the sampled instant is not refused by the function (the table CHECK refuses it with another code)', s => once(s, 'IF p_epoch_from > v_through THEN', 'IF false THEN'), G('N04'), [], { cls: 'message-overlap' }],
  ['Z42_ARGUMENT_VALIDATION_REMOVED', 'the function validates no argument (the table CHECKs refuse some with another code)', s => once(s, ARGS_CHECK, 'IF false THEN'), G('N04'), [], { cls: 'message-overlap' }],
  // ---- covers() ----
  ['Z43_COVERS_END_BOUNDARY_EXCLUSIVE', 'sealed_through itself is reported as not sealed', s => once(s, 'IF p_instant > v_seal.sealed_through THEN', 'IF p_instant >= v_seal.sealed_through THEN'), G('P13'), []],
  ['Z44_COVERS_IGNORES_THE_EPOCH', 'instants before the epoch are reported as sealed', s => once(s, 'IF p_instant < v_seal.epoch_from THEN', 'IF false THEN'), G('P13'), []],
  ['Z45_COVERS_USES_THE_FIRST_SEAL', 'covers() looks at the first seal, not the latest', s => once(s, "ORDER BY s.seal_seq DESC LIMIT 1;\n IF NOT FOUND THEN\n  RETURN pg_catalog.jsonb_build_object('sealed', false, 'reason', 'NO_SEAL'", "ORDER BY s.seal_seq ASC LIMIT 1;\n IF NOT FOUND THEN\n  RETURN pg_catalog.jsonb_build_object('sealed', false, 'reason', 'NO_SEAL'"), G('P03'), [G('P13')]],
  // ---- function attributes ----
  ['Z46_RECORDER_IS_SECURITY_INVOKER', 'the recorder runs with the caller privileges', s => once(s, REC_HEAD, REC_HEAD.replace('SECURITY DEFINER', 'SECURITY INVOKER')), G('N07'), [G('P01')]],
  ['Z47_SEARCH_PATH_UNPINNED', 'the recorder does not pin search_path', s => once(s, REC_HEAD, REC_HEAD.replace(" SET search_path = ''", '')), G('N07'), []],
  ['Z48_FUNCTION_LOCK_TIMEOUT_REMOVED', 'the recorder has no function-level lock_timeout', s => once(s, REC_HEAD, REC_HEAD.replace(" SET lock_timeout = '2s'", '')), G('N07'), []],
  // ---- ACLs ----
  ['Z49_PUBLIC_MAY_CALL_THE_RECORDER', 'PUBLIC holds USAGE on the schema and EXECUTE on the recorder', s => once(s, AFTER_BUILDER_DROP, AFTER_BUILDER_DROP + '\nGRANT USAGE ON SCHEMA retention_seal TO PUBLIC;\nGRANT EXECUTE ON FUNCTION retention_seal.record_registry_seal(timestamptz, text) TO PUBLIC;'), G('N01'), [G('P08')]],
  ['Z50_RUNTIME_ROLE_MAY_READ_SEALS', 'authenticated can read the seals', s => once(s, AFTER_BUILDER_DROP, AFTER_BUILDER_DROP + `\nGRANT USAGE ON SCHEMA retention_seal TO authenticated;\nGRANT SELECT ON ${T} TO authenticated;\nCREATE POLICY leak ON ${T} AS PERMISSIVE FOR SELECT TO authenticated USING (true);`), G('N01'), [G('P08')]],
  ['Z51_FORCE_RLS_REMOVED', 'row level security is not forced on the seal table', s => once(s, `ALTER TABLE ${T} FORCE ROW LEVEL SECURITY;\n`, ''), G('P08'), []],
  ['Z52_BUILDER_ROLE_KEPT', 'the disposable builder role is not dropped (its membership edge on the sealed owner remains: the own residue guard of the migration refuses)', s => once(s, AFTER_BUILDER_DROP, '-- builder kept'), G('P08'), [], { expect: 'guard' }],
  ['Z53_SEAM_WIDENED_TO_ALL_PRIVILEGES', 'the registry seam grants ALL instead of SELECT', s => once(s, 'GRANT SELECT ON retention_entitlement.producers TO consumer_retention_seal_owner;', 'GRANT ALL ON retention_entitlement.producers TO consumer_retention_seal_owner;'), G('P08'), [], { expect: 'guard' }],
  ['Z54_SEAM_SCHEMA_USAGE_TO_PUBLIC', 'the entitlement schema seam is granted to PUBLIC', s => once(s, 'GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_seal_owner;', 'GRANT USAGE ON SCHEMA retention_entitlement TO PUBLIC;'), G('P08'), [], { expect: 'guard' }],
  ['Z55_REGISTRY_POLICY_FOR_PUBLIC', 'the registry SELECT policy applies to PUBLIC', s => once(s, 'CREATE POLICY seal_owner_select ON retention_entitlement.producers AS PERMISSIVE FOR SELECT TO consumer_retention_seal_owner USING (true);', 'CREATE POLICY seal_owner_select ON retention_entitlement.producers AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);'), G('P08'), [], { expect: 'guard' }],
  ['Z56_SEAM_ADDS_A_REGISTRY_WRITE_GRANT', 'the seal owner may also UPDATE the producer registry', s => once(s, 'GRANT SELECT ON retention_entitlement.producers TO consumer_retention_seal_owner;', 'GRANT SELECT ON retention_entitlement.producers TO consumer_retention_seal_owner;\nGRANT UPDATE ON retention_entitlement.producers TO consumer_retention_seal_owner;'), G('P08'), [], { expect: 'guard' }],
  ['Z57_SEAM_ADDS_PRODUCER_ADMISSION_EXECUTE', 'the seal owner may also execute producer admission', s => once(s, 'GRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_seal_owner;', 'GRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_seal_owner;\nGRANT EXECUTE ON FUNCTION retention_entitlement.admit_entitlement_event(uuid, text, text, text, timestamptz, timestamptz, bigint) TO consumer_retention_seal_owner;'), G('P08'), [], { expect: 'guard' }],
  // ---- migration guards ----
  ['Z58_PREDECESSOR_DRIFT_GUARD_REMOVED', 'the pre-apply predecessor drift refusal is removed (R1 re-judgement: drifted predecessors in several objects are then INSTALLED, not refused; first-run declaration message-overlap was wrong and failed the derived-class check, see out/mut-n0506)', s => once(s, "RAISE EXCEPTION 'SEAL_PREDECESSOR_DRIFT' USING ERRCODE='42501';", 'NULL;'), G('N05'), [], { expectCls: 'behavioural' }],
  ['Z59_PLATFORM_MARKER_REFUSAL_REMOVED', 'the platform marker refusal is removed', s => once(s, "RAISE EXCEPTION 'SEAL_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';", 'NULL;'), G('N05'), [], { expectCls: 'behavioural' }],
  ['Z60_SUPERUSER_REQUIREMENT_REMOVED', 'a non-superuser actor is accepted (PostgreSQL itself still refuses the seams, with another message)', s => once(s, 'AND r.rolcanlogin AND r.rolsuper', 'AND r.rolcanlogin'), G('N05'), [], { expectCls: 'message-overlap' }],
  ['Z61_G2_SCOPE_COMPARISON_REMOVED', 'the post-apply scope comparison is removed', s => once(s, "IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.seal_scope_digest') THEN", "IF false AND v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.seal_scope_digest') THEN"), G('N06'), [], { expectCls: 'behavioural' }],
  ['Z62_G2_SEAM_CHECK_REMOVED', 'the exact seam-state refusal is removed', s => once(s, "RAISE EXCEPTION 'SEAL_SEAM_STATE_MISMATCH' USING ERRCODE='42501';", 'NULL;'), G('N06'), [], { expectCls: 'behavioural' }],
  ['Z63_RECEIPT_TABLE_PREDECESSOR_CHECK_REMOVED', "the ENT1-A receipt-table existence check is removed: a database whose receipt table is missing but whose resolver function remains is accepted (independent counterexample R1)", s => once(s, "   OR pg_catalog.to_regclass('retention_acquisition.detail_acquisition_records') IS NULL\n", ''), G('N05'), [], { expectCls: 'behavioural' }],
  ['Z64_ALREADY_PRESENT_GUARD_REMOVED', 'the explicit refusal is removed; PostgreSQL still rejects a duplicate role/schema and rolls back (message/entry-overlap, C1)' , s => once(s, "RAISE EXCEPTION 'SEAL_ALREADY_PRESENT' USING ERRCODE='42710';", 'NULL;'), G('N05'), [], { expectCls: 'message-overlap' }],
  ['Z65_BOTH_ENT1A_EXISTENCE_CHECKS_REMOVED', "neither ENT1-A existence check is present: receipt table missing, resolver missing, or both are accepted", s => once(once(s, "   OR pg_catalog.to_regclass('retention_acquisition.detail_acquisition_records') IS NULL\n", ''), "   OR pg_catalog.to_regprocedure('retention_acquisition.resolve_detail_acquisition(uuid)') IS NULL\n", ''), G('N05'), [], { expectCls: 'behavioural' }],
  ['Z66_RESOLVER_FUNCTION_PREDECESSOR_CHECK_REMOVED', "the ENT1-A resolver-function existence check is removed: a database whose resolver is missing but whose receipt table remains is accepted", s => once(s, "   OR pg_catalog.to_regprocedure('retention_acquisition.resolve_detail_acquisition(uuid)') IS NULL\n", ''), G('N05'), [], { expectCls: 'behavioural' }],
  ['Z67_AUTH_USERS_PREDECESSOR_CHECK_REMOVED', "the auth.users existence check is removed", s => once(s, "IF pg_catalog.to_regclass('auth.users') IS NULL" + "\n" + "   OR pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL", "IF pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL"), G('N05'), [], { expectCls: 'behavioural' }],
  ['Z68_ANCHORS_PREDECESSOR_CHECK_REMOVED', "the capture-anchors existence check is removed (a later owner/ACL comparison on the missing table still refuses, under another name)", s => once(s, "   OR pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL" + "\n", ''), G('N05'), [], { expectCls: 'message-overlap' }],
  ['Z69_STATE_AT_PREDECESSOR_CHECK_REMOVED', "the entitlement-resolver existence check is removed (a later owner comparison on the missing function still refuses, under another name)", s => once(s, "   OR pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') IS NULL" + "\n", ''), G('N05'), [], { expectCls: 'message-overlap' }],
  ['Z70_REGISTRY_PREDECESSOR_CHECK_REMOVED', "the producer-registry existence check is removed (a later owner comparison on the missing table still refuses, under another name)", s => once(s, "   OR pg_catalog.to_regclass('retention_entitlement.producers') IS NULL" + "\n", ''), G('N05'), [], { expectCls: 'message-overlap' }],
  ['Z71_FOUNDATION_SCHEMA_PREDECESSOR_CHECK_REMOVED', "the foundation-schema existence check is removed", s => once(s, "\n" + "   OR pg_catalog.to_regnamespace('retention_internal') IS NULL THEN", ' THEN'), G('N05'), [], { expectCls: 'behavioural' }]
];

const GATE_WATCHDOG_MS = 900000;
const guarded = (cl, id, source) => Promise.race([runGate(cl, id, source), new Promise((_, rej) => setTimeout(() => rej(Error('GATE_WATCHDOG_TIMEOUT ' + id)), GATE_WATCHDOG_MS).unref())]);
export async function runMutations({ bin, out, only }) {
  const rec = recorder(out);
  rec.write('executed-source-bindings.json', { sealMigrationSha256: sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', SEAL_MIGRATION))), mutationsSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), smokeSha256: sha(fs.readFileSync(path.join(ROOT, 'scripts/consumer-retention-seal-smoke.mjs'))), observationVersion: 2 });
  const results = []; const survivors = []; const normal = sealSource();
  if (only) { const unknown = only.filter(x => !SPECS.some(([id]) => id === x)); if (unknown.length) throw Error('UNKNOWN_MUTANT_ID ' + unknown.join(',')); }
  let cl;
  try {
    for (const [id, , mutate] of SPECS) if (mutate(normal) === normal) throw Error('MUTATION_NOT_APPLIED ' + id);
    cl = await entCluster(bin, rec);
    const meta = await migrationObservationControls(cl);
    rec.write('observation-meta-controls.json', meta);
    if (!meta.pass) throw Error('APPLICATION_OBSERVATION_META_CONTROLS_FAILED');
    // control: every detector passes on the unmodified migration
    const detectors = [...new Set(SPECS.filter(([id]) => !only || only.includes(id)).flatMap(([, , , p, more]) => [p, ...more]))];
    const control = [];
    for (const id of detectors) { const r = await guarded(cl, id, normal); control.push({ id, pass: r.pass, observed: r.observed }); }
    rec.write('control.json', control);
    if (!control.every(c => c.pass)) throw Error('NORMAL_SETUP_DETECTOR_FAILED ' + control.filter(c => !c.pass).map(c => c.id).join(','));
    for (const [id, defect, mutate, primary, more, opts = {}] of SPECS) {
      if (only && !only.includes(id)) continue;
      const expect = opts.expect ?? 'gate';
      const dir = path.join(out, id); fs.mkdirSync(dir, { recursive: true });
      const raw = mutate(normal);
      fs.writeFileSync(path.join(dir, 'raw-mutant.sql'), raw);
      // raw apply on a clean database (ENT0 and ENT1-A applied, ENT-R not): record how the migration's own guards react
      const probe = await sealFresh(cl, id + '-raw', async ctx => sealApply(ctx, raw), { apply: false, seal: raw });
      let installed = raw, g2 = null;
      const mismatch = /^SEAL_POST_STATE_MISMATCH expected=([0-9a-f]{64}) observed=([0-9a-f]{64})$/.exec(probe.error?.message ?? '');
      if (mismatch) { g2 = { rejected: 'SEAL_POST_STATE_MISMATCH', expected: mismatch[1], observed: mismatch[2] }; installed = raw.split(mismatch[1]).join(mismatch[2]); }
      else if (probe.error && /^(SEAL_|RETENTION_)/.test(probe.error.message)) g2 = { rejected: probe.error.message.split(' ')[0], raw: true };
      else if (probe.error) throw Error('MUTANT_UNEXPECTED_APPLY_ERROR ' + id + ' ' + probe.error.message);
      fs.writeFileSync(path.join(dir, 'installed-mutant.sql'), installed);
      const failed = []; const passedGates = []; const evaluated = [];
      const guardOnly = g2?.raw === true;
      // N05/N06 mutants are judged on their own behavioural gate against the mutant text; a mutant refused raw by its own guard is not run
      if (!guardOnly || [G('N05'), G('N06')].includes(primary)) {
        for (const gate of [primary, ...more]) {
          const r = await guarded(cl, gate, installed);
          evaluated.push(gate); (r.pass ? passedGates : failed).push(gate);
          fs.writeFileSync(path.join(dir, `gate-${gate}.json`), JSON.stringify({ gate, pass: r.pass, observed: r.observed }, null, 2));
        }
      }
      const STRUCTURAL = [G('N07'), G('P08')];
      // Recompute from full identity/attribute snapshots; a DDL entry notice is never installation.
      // Old presence-only evidence is rejected as incomplete, not silently reclassified.
      let derivedCls = null;
      if ([G('N05'), G('N06')].includes(primary) && !guardOnly) {
        const obs = JSON.parse(fs.readFileSync(path.join(dir, `gate-${primary}.json`), 'utf8')).observed;
        // The case kind comes from the harness (the gate it is judging), never from the shape of the observed rows.
        derivedCls = deriveApplicationClass(obs, primary === G('N06') ? 'N06' : 'N05');
      }
      const detectedByGate = failed.includes(primary);
      const detectedByGuard = guardOnly;
      const clsOk = derivedCls === null || opts.expectCls === undefined || opts.expectCls === derivedCls;
      const pass = (expect === 'gate' ? detectedByGate : expect === 'guard' ? detectedByGuard : (!guardOnly && failed.length === 0)) && clsOk;
      const declaredCls = opts.expectCls ?? opts.cls ?? null;
      const cls = derivedCls ?? opts.cls ?? (expect === 'gate' ? 'behavioural' : expect);
      const evidenceType = guardOnly ? 'migration-guard' : expect === 'green' ? 'green' : !failed.length ? 'none' : cls === 'message-overlap' ? 'message-overlap' : failed.every(g => STRUCTURAL.includes(g)) ? 'structural' : 'gate-behavioural';
      const result = { id, defect, expect, declaredCls, cls, evidenceType, primary, rawMutantSha256: sha(raw), installedMutantSha256: sha(installed), normalSha256: sha(normal), rawApply: probe.error ?? 'applied', g2, evaluated, failedGates: failed, passedGates, detectedByGate, detectedByGuard, rebased: installed !== raw, pass };
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
