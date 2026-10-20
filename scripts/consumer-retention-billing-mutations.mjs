#!/usr/bin/env node
// TastKind R0-B-ENT-F1 actual-source mutations. Each mutant is the REAL migration SQL (or the real production TypeScript) with ONE defect. Every spec names its detector and class BEFORE it runs:
//   gate  : the named behavioural gate must fail on the installed mutant (a guard-only refusal does not count)
//   guard : the migration's own guard must refuse the raw mutant (recorded as a guard, never as behavioural detection)
//   green : an observably equivalent mutant (defence in depth): every listed detector must stay green
// A mutant whose only rejection is the exact post-state digest (BILLING_POST_STATE_MISMATCH) is re-pinned with the observed digest and then judged by its gate; the digest refusal is recorded separately.
// A gate that THROWS is never a detector (first independent acceptance, E02): connection / initdb / timeout-expired / watchdog errors make the WHOLE run BLOCKED (exit 2), any other unexpected exception is recorded as a CRASH and does not count as detection;
// only a gate that returns pass:false with an explicit observation counts. Refusal controls (N02/N03) record WHY they failed (case label, expected reason, observed error) so a refusal for another reason is not mistaken for proof that a guard is needed.
// TypeScript mutants are applied to a temporary copy of the production modules and judged by the pure gate P13.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, BILLING_MIGRATION, recorder, sha } from './consumer-retention-persistence-smoke.mjs';
import { entCluster } from './consumer-retention-entitlement-smoke.mjs';
import { billingSource, billingFresh, billingApply, runGate, ALL_GATE_IDS, options, setSourceRoot, pureChecks, runDetector, isExplicitFailure } from './consumer-retention-billing-smoke.mjs';

const once = (s, a, b) => { if (s.split(a).length !== 2) throw Error('MUTATION_ANCHOR_NOT_UNIQUE ' + a.slice(0, 90)); return s.replace(a, () => b); };
const G = id => { const m = ALL_GATE_IDS.filter(x => x.startsWith(id + '_')); if (m.length !== 1) throw Error('UNKNOWN_GATE ' + id); return m[0]; };
const PI_HEAD = "CREATE FUNCTION retention_billing.process_item(p_item_id uuid)\nRETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$";
const INGEST_HEAD = "p_period_start timestamptz, p_period_end timestamptz, p_signed_at timestamptz, p_environment text, p_binding_hash text, p_reason_code text)\nRETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$";
const AFTER_BUILDER_DROP = 'DROP ROLE consumer_retention_billing_builder;';
const ADMIT_SEAM = 'GRANT EXECUTE ON FUNCTION retention_entitlement.admit_entitlement_event(uuid, text, text, text, timestamptz, timestamptz, bigint) TO consumer_retention_billing_owner;';
const SCHEMA_SEAM = 'GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_billing_owner;';
const SUBJECT_LOCK = "PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('retention_billing:' || v_item.namespace || ':' || v_item.subject_ref, 0));";

export const SPECS = [
  // ---- identity and key ----
  ['Y01_FACT_KEY_WITHOUT_CLASS', 'the ledger key no longer carries the class (trial and paid restatements would collide)', s => once(s, "|| ':' || p_class || ':'", "|| ':'"), G('P01'), [G('P02')]],
  ['Y02_FACT_KEY_PREFIX_TRUNCATED', 'the subject hash prefix is 16 instead of 32 characters', s => once(s, "'hex'), 1, 32)", "'hex'), 1, 16)"), G('P01'), []],
  ['Y03_SOURCE_SEQUENCE_PASSED_TO_THE_LEDGER', 'a non-null source_sequence enters the ENT0 digest (the same fact would conflict across deliveries)', s => once(s, 'v_ps[v_i], v_pe[v_i], NULL::pg_catalog.int8);', 'v_ps[v_i], v_pe[v_i], 1::pg_catalog.int8);'), G('P01'), [G('P02')]],
  // ---- interval arithmetic and relations ----
  ['Y04_ASSERTED_SET_NOT_ADVANCED', 'the cursor does not advance past an asserted segment (time is asserted twice)', s => once(s, 'v_cursor := GREATEST(v_cursor, v_seg.seg_end);', 'v_cursor := v_cursor;'), G('P02'), [G('P03')]],
  ['Y05_SEGMENT_END_BOUND_REMOVED', 'the end bound of a gap segment is not limited to the observation end (equivalent: only overlapping segments are read)', s => once(s, 'v_pe := v_pe || LEAST(v_seg.seg_start, v_end);', 'v_pe := v_pe || v_seg.seg_start;'), G('P02'), [G('P03')], { expect: 'green' }],
  ['Y06_REGISTRATION_CLIP_REMOVED', 'a period crossing the producer registration is asserted from its original start', s => once(s, 'v_start := GREATEST(v_item.period_start, v_cfg.registered_at);', 'v_start := v_item.period_start;'), G('P02'), []],
  ['Y07_SHORTENING_NOT_RECORDED', 'a shortened restatement leaves no relation record', s => once(s, "v_relation := v_relation || pg_catalog.jsonb_build_object('shortening_observed', true);", 'NULL;'), G('P02'), []],
  ['Y08_REVOCATION_BECOMES_DISMISSED', 'a revocation is dismissed instead of recorded', s => once(s, "v_final := 'recorded_only'; v_why := 'revocation_observed';", "v_final := 'dismissed'; v_why := 'revocation_observed';"), G('P02'), [G('P11')]],
  // ---- unsupported input ----
  ['Y09_UNSUPPORTED_KIND_NOT_QUARANTINED', 'an unknown kind is processed as if it were a trial period', s => once(s, "ELSIF v_item.kind NOT IN ('paid_period','trial_period') THEN", 'ELSIF false THEN'), G('P11'), [G('P03')]],
  ['Y10_ENVIRONMENT_CHECK_REMOVED', 'a sandbox observation is accepted in a production namespace', s => once(s, 'ELSIF v_item.environment <> v_cfg.environment THEN', 'ELSIF false THEN'), G('P11'), []],
  ['Y11_PERIOD_LIMIT_NEVER_REACHED', 'the single-period length limit is effectively disabled', s => once(s, '> v_cfg.max_period_ms THEN', '> v_cfg.max_period_ms * 1000000 THEN'), G('P11'), []],
  ['Y12_MISSING_PERIOD_ACCEPTED', 'a paid period without a period is not quarantined', s => once(s, 'ELSIF v_item.period_start IS NULL THEN', 'ELSIF false THEN'), G('P11'), []],
  ['Y13_NOT_AUTHORIZED_QUARANTINES_THE_ITEM', 'a producer configuration error is charged to the item', s => once(s, 'v_blocked := true;', "v_final := 'quarantined'; v_why := 'not_authorized';"), G('P11'), []],
  ['Y14_QUARANTINE_WITHOUT_EVIDENCE', 'quarantine leaves no evidence row', s => once(s, "IF v_final = 'quarantined' THEN\n   INSERT INTO", "IF false THEN\n   INSERT INTO"), G('P11'), [G('P02')]],
  // ---- links ----
  ['Y15_LINK_OWNER_CONFLICT_IGNORED', 'a subject already linked to one owner accepts another owner binding', s => once(s, 'AND l.owner_user_id <> v_owner) THEN', 'AND false) THEN'), G('P02'), []],
  ['Y16_EXPIRED_INTENT_ACCEPTED', 'an expired purchase intent still activates', s => once(s, 'ELSIF v_link.expires_at <= v_now THEN', 'ELSIF false THEN'), G('P10'), []],
  ['Y17_ACTIVE_LINK_BY_HASH_ACCEPTED', 'a binding that already activated another subject is accepted', s => once(s, "ELSIF v_link.state = 'active' THEN\n     v_final := 'quarantined'; v_why := 'link_conflict';", "ELSIF false THEN\n     v_final := 'quarantined'; v_why := 'link_conflict';"), G('P02'), []],
  ['Y18_CANDIDATE_IGNORES_EXPIRY', 'an expired intent keeps the unmapped item at the head of the queue', s => once(s, "AND (l.state = 'active' OR l.expires_at >", "AND (true OR l.expires_at >"), G('P10'), []],
  // ---- transaction, lock and error contract ----
  ['Y19_DIRTY_TRANSACTION_GUARD_REMOVED', 'one transaction may process several items (several owners)', s => once(s, "IF pg_catalog.pg_current_xact_id_if_assigned() IS NOT NULL THEN\n  RAISE EXCEPTION 'BILLING_DIRTY_TRANSACTION'", "IF false THEN\n  RAISE EXCEPTION 'BILLING_DIRTY_TRANSACTION'"), G('P05'), []],
  ['Y20_ITEM_ROW_LOCK_WAITS', 'a second worker waits on the item row instead of being told it is busy', s => once(s, 'FOR UPDATE SKIP LOCKED;', 'FOR UPDATE;'), G('P05'), []],
  ['Y21_SUBJECT_LOCK_REMOVED', 'two items of one subject are computed against the same stale asserted set', s => once(s, SUBJECT_LOCK, 'NULL;'), G('P05'), [G('P03')]],
  ['Y22_ADMIT_ANSWER_CHECK_REMOVED', 'the answer of the ledger call is not checked (equivalent: ENT0 returns only these two outcomes or raises)', s => once(s, "IF v_res->>'outcome' IS NULL OR v_res->>'outcome' NOT IN ('admitted','replayed') THEN", 'IF false THEN'), G('P02'), [G('P05')], { expect: 'green' }],
  ['Y23_EVERY_ERROR_IS_SWALLOWED', 'an unexpected error (injected failure, deadlock) is turned into a quarantine instead of propagating', s => once(s, 'ELSE\n        RAISE;\n       END IF;', "ELSE\n        v_final := 'quarantined'; v_why := 'swallowed';\n       END IF;"), G('P12'), [G('P06')]],
  ['Y24_OWNER_ABSENT_NOT_HANDLED', 'a deleted owner is not recognised', s => once(s, "ELSIF v_sqlstate = '23503' THEN", 'ELSIF false THEN'), G('P12'), []],
  ['Y25_RECORD_ATTEMPT_REOPENS_FINAL_ITEMS', 'a failed-attempt record is applied to any item', s => once(s, "WHERE item_id = p_item_id AND state IN ('received','retry_pending','mapping_pending');\n GET DIAGNOSTICS", 'WHERE item_id = p_item_id;\n GET DIAGNOSTICS'), G('P04'), []],
  // NOT equivalent (first independent acceptance, E01): without the function-level lock_timeout the wait for the SUBJECT advisory lock is bounded only by the caller (57014 after the caller's statement_timeout instead of retry/LOCK_TIMEOUT after 2 s). P04 part (e) is the behavioural detector; the raw G2 digest refusal is recorded separately and is not this detection.
  ['Y26_PROCESS_LOCK_TIMEOUT_REMOVED', 'process_item has no function-level lock_timeout: the subject advisory-lock wait is no longer bounded at 2 s (retry/LOCK_TIMEOUT becomes a caller-side 57014)', s => once(s, PI_HEAD, PI_HEAD.replace(" SET lock_timeout = '2s'", '')), G('P04'), [G('P05')]],
  // ---- ingress ----
  ['Y27_CONFLICT_TREATED_AS_DUPLICATE', 'a repeated delivery id with other content is silently accepted', s => once(s, 'IF v_existing.payload_digest = p_payload_digest THEN', 'IF true THEN'), G('P02'), [G('P09')]],
  ['Y28_INGRESS_IGNORES_THE_SWITCH', 'a disabled namespace still receives deliveries', s => once(s, "IF NOT v_cfg.enabled THEN\n  RETURN pg_catalog.jsonb_build_object('outcome', 'disabled', 'item_id', NULL);", "IF false THEN\n  RETURN pg_catalog.jsonb_build_object('outcome', 'disabled', 'item_id', NULL);"), G('P09'), []],
  ['Y29_PERIOD_PRECISION_CHECK_REMOVED', 'the function accepts sub-millisecond period bounds (only the table check remains)', s => once(s, "OR pg_catalog.date_trunc('milliseconds', p_period_start) <> p_period_start OR pg_catalog.date_trunc('milliseconds', p_period_end) <> p_period_end", 'OR false'), G('P11'), []],
  // ---- row-level rules ----
  ['Y30_TERMINAL_GUARD_REMOVED', 'a final inbox item can be changed', s => once(s, "IF OLD.state NOT IN ('received','retry_pending','mapping_pending') THEN", 'IF false THEN'), G('N01'), [G('P14')]],
  ['Y31_KIND_IMMUTABILITY_REMOVED', 'the asserted kind of an inbox item can be rewritten', s => once(s, 'OR NEW.kind IS DISTINCT FROM OLD.kind ', 'OR false '), G('N01'), []],
  ['Y32_ATTEMPTS_MAY_DECREASE', 'the attempt counter can go down', s => once(s, 'OR NEW.attempts < OLD.attempts', 'OR false'), G('N01'), []],
  ['Y33_SEGMENT_GUARD_REMOVED', 'overlapping or changed segments are accepted', s => once(s, 'CREATE TRIGGER segment_guard BEFORE INSERT OR UPDATE ON retention_billing.fact_segments\n FOR EACH ROW EXECUTE FUNCTION retention_billing.guard_segment();', ''), G('N01'), [G('P05')]],
  ['Y34_EVIDENCE_TRIGGER_REMOVED', 'evidence can be changed or deleted', s => once(s, 'CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON retention_billing.evidence_log\n FOR EACH ROW EXECUTE FUNCTION retention_billing.reject_evidence_change();', ''), G('N01'), []],
  // ---- structure and ACL ----
  ['Y35_FORCE_RLS_REMOVED', 'row security is not forced on the inbox', s => once(s, 'ALTER TABLE retention_billing.inbox FORCE ROW LEVEL SECURITY;\n', ''), G('P08'), []],
  ['Y36_PUBLIC_MAY_PROCESS', 'PUBLIC may execute the processing function', s => once(s, AFTER_BUILDER_DROP, AFTER_BUILDER_DROP + '\nGRANT EXECUTE ON FUNCTION retention_billing.process_item(uuid) TO PUBLIC;'), G('P08'), [G('P07')]],
  ['Y37_RUNTIME_ROLE_MAY_READ_THE_INBOX', 'authenticated can read the inbox', s => once(s, AFTER_BUILDER_DROP, AFTER_BUILDER_DROP + '\nGRANT USAGE ON SCHEMA retention_billing TO authenticated;\nGRANT SELECT ON retention_billing.inbox TO authenticated;\nCREATE POLICY leak ON retention_billing.inbox AS PERMISSIVE FOR SELECT TO authenticated USING (true);'), G('P07'), [G('N01')]],
  ['Y38_PROCESS_ITEM_IS_SECURITY_INVOKER', 'the processing function runs with the caller privileges', s => once(s, PI_HEAD, PI_HEAD.replace('SECURITY DEFINER', 'SECURITY INVOKER')), G('P01'), [G('P07')]],
  ['Y39_SEARCH_PATH_UNPINNED', 'the ingress function does not pin search_path', s => once(s, INGEST_HEAD, INGEST_HEAD.replace(" SET search_path = ''", '')), G('P08'), []],
  ['Y40_SEAM_WIDENED_TO_ADVANCE', 'the billing owner also receives EXECUTE on advance_entitlement_coverage', s => once(s, ADMIT_SEAM, ADMIT_SEAM + '\nGRANT EXECUTE ON FUNCTION retention_entitlement.advance_entitlement_coverage(uuid, text, timestamptz) TO consumer_retention_billing_owner;'), G('P08'), [], { expect: 'guard' }],
  ['Y41_SEAM_WIDENED_TO_THE_READER', 'the billing owner also receives EXECUTE on entitlement_state_at', s => once(s, ADMIT_SEAM, ADMIT_SEAM + '\nGRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_billing_owner;'), G('P08'), [], { expect: 'guard' }],
  ['Y42_SCHEMA_SEAM_GRANTED_TO_PUBLIC', 'the entitlement schema seam is granted to PUBLIC', s => once(s, SCHEMA_SEAM, 'GRANT USAGE ON SCHEMA retention_entitlement TO PUBLIC;'), G('P08'), [], { expect: 'guard' }],
  ['Y43_BUILDER_ROLE_KEPT', 'the disposable builder role is not dropped (the own residue guard refuses)', s => once(s, AFTER_BUILDER_DROP, '-- builder kept'), G('P08'), [], { expect: 'guard' }],
  // ---- migration guards ----
  // N02 refuses a non-superuser actor with an exact expected prefix; with this guard removed the actor is still refused (42501, permission denied) but NOT with the expected reason. That reason mismatch is the observation; it does not show that the mutant installs.
  ['Y44_SUPERUSER_REQUIREMENT_REMOVED', 'the superuser requirement of the actor guard is removed (the refusal changes reason: expected RETENTION_DDL_ACTOR_NOT_AUTHORIZED, observed 42501)', s => once(s, 'AND r.rolcanlogin AND r.rolsuper', 'AND r.rolcanlogin'), G('N02'), []],
  ['Y45_PREDECESSOR_DRIFT_REFUSAL_REMOVED', 'the pre-apply predecessor drift refusal is removed', s => once(s, "RAISE EXCEPTION 'BILLING_PREDECESSOR_DRIFT' USING ERRCODE='42501';", 'NULL;'), G('N02'), []],
  ['Y46_PLATFORM_MARKER_REFUSAL_REMOVED', 'the platform marker refusal is removed', s => once(s, "RAISE EXCEPTION 'BILLING_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';", 'NULL;'), G('N02'), []],
  ['Y47_G2_SCOPE_COMPARISON_REMOVED', 'the post-apply scope comparison is removed', s => once(s, "IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.billing_scope_digest') THEN", "IF false AND v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.billing_scope_digest') THEN"), G('N03'), []],
  ['Y48_G2_SEAM_CHECK_REMOVED', 'the exact seam-state refusal is removed', s => once(s, "RAISE EXCEPTION 'BILLING_SEAM_STATE_MISMATCH' USING ERRCODE='42501';", 'NULL;'), G('N03'), []],
  // ---- first independent acceptance fixes: owner reference clearing on finished items (A01) and link activation after the blocked check (A02) ----
  ['Y49_OWNER_CLEARING_ALLOWS_ANY_OTHER_CHANGE', 'a finished item whose owner reference is cleared may change any other column', s => once(s, "AND NEW.state = OLD.state AND NEW.reason IS NOT DISTINCT FROM OLD.reason AND NEW.attempts = OLD.attempts\n     AND NEW.last_error IS NOT DISTINCT FROM OLD.last_error AND NEW.processed_at IS NOT DISTINCT FROM OLD.processed_at AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome THEN", 'THEN'), G('P14'), []],
  ['Y50_OWNER_CLEARING_REFUSED_AGAIN', 'the owner reference of a finished item cannot be cleared (owner deletion is blocked again)', s => once(s, 'IF OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NULL AND NEW.state = OLD.state', 'IF false AND NEW.state = OLD.state'), G('P14'), []],
  ['Y51_OWNER_REFERENCE_MAY_BE_REPOINTED', 'a finished item accepts any change of its owner reference (set or re-pointed), not only clearing', s => once(s, 'IF OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NULL AND NEW.state = OLD.state', 'IF NEW.state = OLD.state'), G('P14'), []],
  ['Y52_LINK_ACTIVATED_BEFORE_THE_ADMIT', 'the pending intent is activated immediately (before the admit), so a blocked result keeps the activation', s => once(s, 'v_activate := true;', "UPDATE retention_billing.identity_links SET state = 'active', subject_ref = v_item.subject_ref, activated_at = v_now WHERE link_id = v_link.link_id;"), G('P15'), []],
  ['Y53_BLOCKED_RESULT_STILL_ACTIVATES_THE_LINK', 'the blocked branch activates the pending intent before returning', s => once(s, "IF v_blocked THEN\n   RETURN pg_catalog.jsonb_build_object('outcome', 'blocked'", "IF v_blocked THEN\n   IF v_activate THEN UPDATE retention_billing.identity_links SET state = 'active', subject_ref = v_item.subject_ref, activated_at = v_now WHERE link_id = v_link.link_id; END IF;\n   RETURN pg_catalog.jsonb_build_object('outcome', 'blocked'"), G('P15'), []],
  ['Y54_PENDING_INTENT_NEVER_ACTIVATES', 'a pending intent is never activated after a successful processing', s => once(s, 'IF v_activate THEN', 'IF false THEN'), G('P15'), [G('P10')]]
];

// ---- production TypeScript mutants (judged by the pure gate P13 on a temporary copy of the modules) -------------------------------------------------------------------------------
const CORE = 'supabase/functions/_shared/billing-core', ING = 'supabase/functions/_shared/billing-ingest';
export const TS_SPECS = [
  ['X01_ASSERTED_CURSOR_ASSIGNED_NOT_MAXED', 'the cursor takes the segment end even for a nested segment', `${CORE}/segments.ts`, s => once(s, 'cursor = Math.max(cursor, e);', 'cursor = e;')],
  ['X02_EMPTY_TAIL_EMITTED', 'a fully covered observation yields an empty segment', `${CORE}/segments.ts`, s => once(s, 'if (cursor < end) out.push([cursor, end]);', 'if (cursor <= end) out.push([cursor, end]);')],
  ['X03_REGISTRATION_CLIP_USES_MIN', 'the clip keeps the earlier bound', `${CORE}/segments.ts`, s => once(s, 'const start = Math.max(interval[0], registeredAtMs);', 'const start = Math.min(interval[0], registeredAtMs);')],
  ['X04_UNSUPPORTED_KIND_NOT_QUARANTINED', 'the plan no longer quarantines an unknown kind', `${CORE}/segments.ts`, s => once(s, 'if (obs.kind !== "paid_period" && obs.kind !== "trial_period") return { action: "terminal", state: "quarantined", reason: "unsupported_kind" };', '')],
  ['X05_DEFAULT_FAILURE_IS_FINAL', 'an unclassified failure is not retryable', `${CORE}/errors.ts`, s => once(s, 'return decide("unclassified", true);', 'return decide("transient", false);')],
  ['X06_FAILURE_DECISION_IS_TERMINAL', 'a failure decision claims to be terminal', `${CORE}/errors.ts`, s => once(s, 'terminal: false as const', 'terminal: true as never')],
  ['X07_RETRY_IS_A_FINAL_OUTCOME', 'retry counts as a final outcome', `${CORE}/errors.ts`, s => once(s, '"dismissed", "quarantined"] as const;', '"dismissed", "quarantined", "retry"] as const;')],
  ['X08_UNEXPECTED_KEYS_ACCEPTED', 'extra keys (a token) pass validation', `${CORE}/validate.ts`, s => once(once(s, 'keys.length !== KEYS.length || ', ''), ' || keys.some((k) => !(KEYS as readonly string[]).includes(k))', '')],
  ['X09_KEY_PREFIX_SHORTENED', 'the subject hash prefix is 31 characters', `${CORE}/keys.ts`, s => once(s, '.slice(0, 32)', '.slice(0, 31)')],
  ['X10_RECEIVE_ORDER_NOT_DETERMINISTIC', 'a delivery writes its items in arrival order', `${ING}/receive.ts`, s => once(s, 'items.sort(', '[].sort(')],
  ['X11_DATABASE_FAILURE_IS_ACKED', 'a database failure is answered 200', `${ING}/receive.ts`, s => once(s, 'return reply(d.failure === "contract_violation" ? 500 : 503, "unavailable");', 'return reply(200, "received");')],
  ['X12_PAYLOAD_NAMESPACE_TRUSTED', 'a namespace claimed by the payload is accepted', `${ING}/receive.ts`, s => once(s, ' || v.value.namespace !== verified.namespace', '')],
  ['X13_VERIFICATION_RESULT_IGNORED', 'a failed verification is not refused', `${ING}/receive.ts`, s => once(s, 'if (!verified.ok) return reply(401, "unauthorized");', '')],
  ['X14_BODY_CAP_DISABLED', 'the body size cap is effectively disabled', `${ING}/receive.ts`, s => once(s, 'if (total > max) {', 'if (total > max * 1000) {')],
  ['X15_UNKNOWN_ANSWER_COUNTED_AS_PROGRESS', 'an unknown processing answer is counted as processed', `${ING}/process.ts`, s => once(s, 'else return { processed, outcomes, stoppedBecause: "transient_failure" }; // unknown answer: no progress is claimed', 'else processed++;')],
  ['X16_INTENT_BODY_ACCEPTED', 'an intent request may carry an owner in its body', `${ING}/link.ts`, s => once(s, 'if (body.trim() !== "" && body.trim() !== "{}") return reply(422, { status: "unprocessable" });', '')],
  ['X17_RAW_BINDING_STORED', 'the raw binding value (not its hash) reaches the database', `${ING}/link.ts`, s => once(s, 'deps.sha256Hex(binding)', 'binding')]
];

const GATE_WATCHDOG_MS = 900000;
const guarded = (cl, id, source) => Promise.race([runDetector(() => runGate(cl, id, source), id), new Promise((_, rej) => setTimeout(() => rej(Error('SETUP_GATE_WATCHDOG_TIMEOUT ' + id)), GATE_WATCHDOG_MS).unref())]);
// What a failing refusal/negative-control gate actually observed: the failing cases with expected reason and observed error (so the reason of a refusal is auditable).
const failingCases = observed => (Array.isArray(observed) ? observed : []).filter(c => c && c.pass === false).slice(0, 6).map(c => ({ label: c.label ?? c.name ?? null, expectPrefix: c.expectPrefix ?? c.expect ?? null, error: c.error ?? null, stateUnchanged: c.stateUnchanged ?? null }));
function copyTree(from, to) { fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (e.isDirectory()) copyTree(a, b); else fs.copyFileSync(a, b); } }
async function tsMutant(id, rel, mutate) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-ts-'));
  try {
    copyTree(path.join(ROOT, CORE), path.join(tmp, CORE)); copyTree(path.join(ROOT, ING), path.join(tmp, ING));
    const f = path.join(tmp, rel); const text = fs.readFileSync(f, 'utf8'); const m = mutate(text); if (m === text) throw Error('MUTATION_NOT_APPLIED ' + id);
    fs.writeFileSync(f, m);
    setSourceRoot(tmp);
    let rows; try { rows = await pureChecks(); } catch (e) { return { failedChecks: [], crashed: String(e.message).slice(0, 200) }; } // a thrown pure-check run is a crash, not a detection
    return { failedChecks: rows.filter(r => !r.pass).map(r => r.name), crashed: null };
  } finally { setSourceRoot(null); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp cleanup only */ } }
}
export async function runMutations({ bin, out, only }) {
  const rec = recorder(out);
  rec.write('executed-source-bindings.json', { billingMigrationSha256: sha(fs.readFileSync(path.join(ROOT, 'supabase/migrations', BILLING_MIGRATION))), mutationsSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), sql: SPECS.length, ts: TS_SPECS.length });
  const results = []; const survivors = []; const normal = billingSource();
  const ids = [...SPECS.map(x => x[0]), ...TS_SPECS.map(x => x[0])];
  if (only) { const unknown = only.filter(x => !ids.includes(x)); if (unknown.length) throw Error('UNKNOWN_MUTANT_ID ' + unknown.join(',')); }
  let cl;
  try {
    for (const [id, , mutate] of SPECS) if (mutate(normal) === normal) throw Error('MUTATION_NOT_APPLIED ' + id);
    // the pure gate must be green on the unmodified TypeScript before any TypeScript mutant is judged
    const pure = await pureChecks(); if (!pure.every(r => r.pass)) throw Error('NORMAL_SETUP_DETECTOR_FAILED P13');
    cl = await entCluster(bin, rec);
    const sqlRun = SPECS.filter(([id]) => !only || only.includes(id));
    const detectors = [...new Set(sqlRun.flatMap(([, , , p, more]) => [p, ...more]))];
    const control = [];
    for (const id of detectors) { const r = await guarded(cl, id, normal); control.push({ id, pass: r.pass && !r.crashed, crashed: r.crashed }); }
    rec.write('control.json', control);
    if (!control.every(c => c.pass)) throw Error('NORMAL_SETUP_DETECTOR_FAILED ' + control.filter(c => !c.pass).map(c => c.id).join(','));
    for (const [id, defect, mutate, primary, more, opts = {}] of sqlRun) {
      const expect = opts.expect ?? 'gate';
      const dir = path.join(out, id); fs.mkdirSync(dir, { recursive: true });
      const raw = mutate(normal);
      fs.writeFileSync(path.join(dir, 'raw-mutant.sql'), raw);
      // raw apply on a clean database (ENT0, ENT1-A and ENT-R applied, ENT-F1 not): record how the migration's own guards react
      const probe = await billingFresh(cl, id + '-raw', async ctx => billingApply(ctx, raw), { apply: false, billing: raw });
      let installed = raw, g2 = null;
      const mismatch = /^BILLING_POST_STATE_MISMATCH expected=([0-9a-f]{64}) observed=([0-9a-f]{64})$/.exec(probe.error?.message ?? '');
      if (mismatch) { g2 = { rejected: 'BILLING_POST_STATE_MISMATCH', expected: mismatch[1], observed: mismatch[2] }; installed = raw.split(mismatch[1]).join(mismatch[2]); }
      else if (probe.error && /^(BILLING_|RETENTION_)/.test(probe.error.message)) g2 = { rejected: probe.error.message.split(' ')[0], raw: true };
      else if (probe.error) throw Error('MUTANT_UNEXPECTED_APPLY_ERROR ' + id + ' ' + probe.error.message);
      fs.writeFileSync(path.join(dir, 'installed-mutant.sql'), installed);
      const failed = []; const passedGates = []; const crashedGates = []; const evaluated = []; const observations = {};
      const guardOnly = g2?.raw === true;
      if (!guardOnly || [G('N02'), G('N03')].includes(primary)) {
        for (const gate of [primary, ...more]) {
          const r = await guarded(cl, gate, installed);
          evaluated.push(gate); (r.crashed ? crashedGates : r.pass ? passedGates : isExplicitFailure(r) ? failed : crashedGates).push(gate);
          observations[gate] = failingCases(r.observed);
          fs.writeFileSync(path.join(dir, `gate-${gate}.json`), JSON.stringify({ gate, pass: r.pass, crashed: r.crashed, explicitFailure: isExplicitFailure(r), observed: r.observed }, null, 2));
        }
      }
      const detectedByGate = failed.includes(primary);
      const detectedByGuard = g2 !== null; // any refusal by the migration's own guards or its exact post-state digest (recorded as a guard, never as behavioural detection)
      const primaryCrashed = crashedGates.includes(primary);
      const pass = expect === 'gate' ? detectedByGate && !primaryCrashed : expect === 'guard' ? detectedByGuard : (!guardOnly && failed.length === 0 && crashedGates.length === 0);
      const result = { id, kind: 'sql', defect, expect, primary, rawMutantSha256: sha(raw), installedMutantSha256: sha(installed), normalSha256: sha(normal), rawApply: probe.error ?? 'applied', g2, evaluated, failedGates: failed, passedGates, crashedGates, primaryCrashed, failingObservations: observations, detectedByGate, detectedByGuard, rebased: installed !== raw, pass };
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2));
      results.push(result); rec.write('check-' + id + '.json', { id, pass, observed: result }); console.log('CHECK ' + id + ' ' + (pass ? 'PASS' : 'FAIL')); if (!pass) survivors.push(id);
    }
    for (const [id, defect, rel, mutate] of TS_SPECS.filter(([id]) => !only || only.includes(id))) {
      const t = await tsMutant(id, rel, mutate);
      const pass = t.failedChecks.length > 0 && !t.crashed;
      const result = { id, kind: 'ts', defect, expect: 'gate', primary: G('P13'), failedChecks: t.failedChecks, crashed: t.crashed, pass };
      results.push(result); rec.write('check-' + id + '.json', { id, pass, observed: result }); console.log('CHECK ' + id + ' ' + (pass ? 'PASS' : 'FAIL')); if (!pass) survivors.push(id);
    }
    if (survivors.length) { const err = Error('SURVIVING_MUTANTS ' + survivors.join(',')); err.behavior = true; throw err; }
    rec.write('result.json', { status: 'PASS', exitCode: 0, controls: results.length, detectorsControlPass: control.length, sql: SPECS.length, ts: TS_SPECS.length, results });
    return 0;
  } catch (e) {
    rec.write('result.json', { status: e.behavior ? 'FAIL' : 'BLOCKED', exitCode: e.behavior ? 1 : 2, error: e.message, stack: e.stack, results });
    console.error(e.stack);
    return e.behavior ? 1 : 2;
  } finally { if (cl) await cl.stop(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code; try { code = await runMutations({ ...options(), only: process.env.TK_MUTANT_PREFIXES ? process.env.TK_MUTANT_PREFIXES.split(',').flatMap(p => [...SPECS.map(x => x[0]), ...TS_SPECS.map(x => x[0])].filter(id => id.startsWith(p + '_'))) : null }); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
