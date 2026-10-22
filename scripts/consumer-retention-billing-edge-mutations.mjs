#!/usr/bin/env node
// TastKind ENT-F2 actual-source mutations. Each mutant is a temporary COPY of the real product TypeScript (the transport, the three entrypoints, and - for the protected-library controls - the ENT-F1 libraries they drive) with ONE defect.
// Every spec names its protection, its detector gate(s) and its class BEFORE it runs:
//   gate  : EVERY listed gate must return an EXPLICIT failure on the mutant: a gate that returned pass:false with the values it observed, or a typed StageRefusal (a named product stage refused by the database with a SQLSTATE, or sending a wrong statement / parameter vector).
//           An exception that merely escapes a gate is NEVER a detection (F2-E01): infrastructure / setup errors make the whole run BLOCKED, any other exception is a CRASH (recorded, the mutant counts as NOT detected).
//   green : an observably equivalent mutant (defence in depth): every listed gate must stay green; the reason is stated
// Rules inherited from the ENT-F1 correction (E02): a gate that THROWS an infrastructure / setup error (connection, timeout, initdb, SETUP_*) makes the WHOLE run BLOCKED, never a detection. Before any mutant the listed gates must PASS on an unmutated copy of the same files (a failing control
// blocks the run), and every mutant must actually differ from the original. The result is judged only by result.json cross-checked with the exit code, stdout/stderr and the per-mutant files (tools/verify-run.mjs).
// Node/PG layer only: the Deno wrapper is never executed; its mutants are caught by the static/structural gates and are labelled as such.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, recorder } from './consumer-retention-persistence-smoke.mjs';
import { entCluster } from './consumer-retention-entitlement-smoke.mjs';
import { ALL_GATE_IDS, PURE_IDS, runGate, setSourceRoot, sourceIdentity, options } from './consumer-retention-billing-edge-smoke.mjs';

const once = (s, a, b) => { if (s.split(a).length !== 2) throw Error('MUTATION_ANCHOR_NOT_UNIQUE ' + a.slice(0, 90)); return s.replace(a, () => b); };
const G = id => { const m = ALL_GATE_IDS.filter(x => x.startsWith(id + '_')); if (m.length !== 1) throw Error('UNKNOWN_GATE ' + id); return m[0]; };
const FN = 'supabase/functions/';
const SQL = FN + '_shared/billing-transport/sql.ts', CFG = FN + '_shared/billing-transport/config.ts', HTTP = FN + '_shared/billing-transport/http.ts', DENO = FN + '_shared/billing-transport/denoPostgresBillingTransport.ts';
const WH = FN + 'billing-webhook/handler.ts', WHC = FN + 'billing-webhook/config.ts', LH = FN + 'billing-link/handler.ts', PH = FN + 'billing-process/handler.ts', PHC = FN + 'billing-process/config.ts', PIDX = FN + 'billing-process/index.ts';
const RECEIVE = FN + '_shared/billing-ingest/receive.ts', LINKLIB = FN + '_shared/billing-ingest/link.ts';
const COPY_DIRS = ['_shared/billing-core', '_shared/billing-ingest', '_shared/billing-transport', 'billing-webhook', 'billing-link', 'billing-process'];

// [id, protection (what a regression would break), file, mutate, class, detector gates, reason (green only)]
export const SPECS = [
  // ---- transport: commit classification, transaction boundary, SQL mapping ----
  ['Y01_EVERY_COMMIT_FAILURE_IS_DEFINITE', 'a lost COMMIT answer is reported as a certain abort (not unknown)', SQL, s => once(s, 'return typeof code === "string" && SQLSTATE.test(code) && !CONNECTION_OR_SHUTDOWN_CLASS.test(code);', 'return true;'), 'gate', ['T00', 'T05']],
  ['Y02_EVERY_COMMIT_FAILURE_IS_UNKNOWN', 'a server-side abort of the COMMIT is reported as unknown', SQL, s => once(s, 'return typeof code === "string" && SQLSTATE.test(code) && !CONNECTION_OR_SHUTDOWN_CLASS.test(code);', 'return false;'), 'gate', ['T00', 'T06']],
  ['Y03_UNKNOWN_COMMIT_RETHROWS_THE_RAW_CAUSE', 'the unknown-outcome marker is lost (the caller cannot tell it from a rolled-back failure)', SQL, s => once(s, 'throw new BillingCommitOutcomeUnknownError();', 'throw e.commitFailure;'), 'gate', ['T00', 'T05']],
  ['Y04_UNKNOWN_COMMIT_IS_NOT_RETRYABLE', 'the unknown-outcome error is classified as a non-retryable failure', SQL, s => once(s, 'readonly code = "08006";', 'readonly code = "22023";'), 'gate', ['T00']],
  ['Y05_COMMIT_FAILURE_IS_SWALLOWED', 'a failed COMMIT resolves as success', SQL, s => once(s, 'if (commitFailureIsDefinite(e.commitFailure)) throw e.commitFailure;\n          throw new BillingCommitOutcomeUnknownError();', 'return undefined as never;'), 'gate', ['T00', 'T05']],
  ['Y06_BODY_FAILURE_IS_SWALLOWED', 'a failure inside the transaction resolves as success (the rollback is hidden)', SQL, s => once(s, '        throw e;\n      }\n    },\n    close:', '        return undefined as never;\n      }\n    },\n    close:'), 'gate', ['T00', 'T02']],
  ['Y07_INGEST_PARAMETER_ORDER_SWAPPED', 'subject and payload digest are exchanged on the wire', SQL, s => once(s, 'o.namespace, o.deliveryId, o.subjectRef, o.payloadDigest, o.kind,', 'o.namespace, o.deliveryId, o.payloadDigest, o.subjectRef, o.kind,'), 'gate', ['T01']],
  ['Y08_SIGNED_AT_SENT_AS_RAW_MILLISECONDS', 'a timestamp is sent as a bare millisecond number', SQL, s => once(s, 'new Date(o.signedAtMs).toISOString(), o.environment', 'String(o.signedAtMs), o.environment'), 'gate', ['T01']],
  ['Y09_PROCESS_ITEM_CALLS_ANOTHER_FUNCTION', 'processItem maps to record_attempt', SQL, s => once(s, 'processItem: "select retention_billing.process_item($1::uuid) as s",', 'processItem: "select retention_billing.record_attempt($1::uuid,\'x\') as s",'), 'gate', ['T01']],
  ['Y10_SHAPE_CHECK_ACCEPTS_ANYTHING_OBJECT_LIKE', 'a result without a text outcome (or an array) is accepted', SQL, s => once(s, 'if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { outcome?: unknown }).outcome !== "string") throw new BillingTransportShapeError();', 'if (parsed === null || typeof parsed !== "object") throw new BillingTransportShapeError();'), 'gate', ['T00']],
  ['Y11_NEXT_CANDIDATE_COERCES_ANY_VALUE', 'a non-text candidate id is coerced instead of refused', SQL, s => once(s, 'if (typeof v !== "string") throw new BillingTransportShapeError();\n      return v;', 'return String(v);'), 'gate', ['T00']],
  ['Y12_NAMESPACE_INTERPOLATED_INTO_SQL', 'a value is spliced into the statement text instead of travelling as a parameter', SQL, s => once(s, 'await session.query(BILLING_SQL.nextCandidate, [namespace])', 'await session.query(BILLING_SQL.nextCandidate.replace("$1::text", "\'" + namespace + "\'"), [])'), 'gate', ['T01']],
  ['Y13_STATEMENT_REFERENCES_AN_ENT0_FUNCTION', 'the transport reaches beyond the five billing functions', SQL, s => once(s, 'processItem: "select retention_billing.process_item($1::uuid) as s",', 'processItem: "select retention_billing.process_item($1::uuid) as s /* retention_entitlement.admit_entitlement_event */",'), 'gate', ['S02', 'T00']],
  ['Y61_RECORD_ATTEMPT_ARGUMENTS_SWAPPED', 'the item id and the reason travel in each other place', SQL, s => once(s, 'await session.query(BILLING_SQL.recordAttempt, [itemId, reason])', 'await session.query(BILLING_SQL.recordAttempt, [reason, itemId])'), 'gate', ['T01']],
  ['Y62_LINK_EXPIRY_SENT_AS_RAW_MILLISECONDS', 'the purchase-intent expiry is sent as a bare millisecond number', SQL, s => once(s, '[namespace, ownerUserId, bindingHash, new Date(expiresAtMs).toISOString()]', '[namespace, ownerUserId, bindingHash, String(expiresAtMs)]'), 'gate', ['T01']],
  ['Y63_INGEST_PERIOD_BOUNDS_SWAPPED', 'the period start and end are exchanged on the wire', SQL, s => once(s, 'isoOrNull(o.periodStartMs), isoOrNull(o.periodEndMs), new Date(o.signedAtMs)', 'isoOrNull(o.periodEndMs), isoOrNull(o.periodStartMs), new Date(o.signedAtMs)'), 'gate', ['T01']],
  // ---- configuration and HTTP primitives ----
  ['Y14_ANY_NON_EMPTY_SWITCH_ENABLES', 'only the exact text "true" enables', CFG, s => once(s, 'return read(BILLING_ENV.enabled)?.trim() === "true";', 'return (read(BILLING_ENV.enabled)?.trim() ?? "") !== "";'), 'gate', ['W01']],
  ['Y15_PAYLOAD_LIMIT_HAS_A_DEFAULT', 'an absent / invalid payload limit must close the endpoint', WHC, s => once(s, 'const maxBodyBytes = readBoundedInteger(read, BILLING_ENV.maxBodyBytes, 1, MAX_BODY_BYTES_LIMIT);', 'const maxBodyBytes = readBoundedInteger(read, BILLING_ENV.maxBodyBytes, 1, MAX_BODY_BYTES_LIMIT) ?? 65536;'), 'gate', ['W01']],
  ['Y16_DATABASE_URL_WITHOUT_PASSWORD_ACCEPTED', 'a connection URL must carry a password', CFG, s => once(s, 'decodeURIComponent(u.username) !== "" && u.password !== "" && u.hostname !== ""', 'decodeURIComponent(u.username) !== "" && u.hostname !== ""'), 'gate', ['W01']],
  ['Y17_INTEGER_UPPER_BOUND_REMOVED', 'the payload limit has a structural upper bound', CFG, s => once(s, 'return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;', 'return Number.isSafeInteger(n) ? n : null;'), 'gate', ['W01']],
  ['Y18_NAMESPACE_PATTERN_ACCEPTS_ANYTHING', 'only a well-formed namespace is accepted', CFG, s => once(s, 'const NAMESPACE = /^[a-z][a-z0-9_.-]{2,63}$/;', 'const NAMESPACE = /^.*$/;'), 'gate', ['L01']],
  ['Y19_SECRET_COMPARED_ON_A_PREFIX_ONLY', 'the shared secret is compared over its whole length', HTTP, s => once(s, 'index < expected.length', 'index < Math.min(expected.length, 8)'), 'gate', ['P01']],
  ['Y20_SECRET_COMPARISON_RETURNS_EARLY', 'the secret comparison is constant-time', HTTP, s => once(s, 'difference |= expected.charCodeAt(index) ^ presented.charCodeAt(index);', 'if (expected.charCodeAt(index) !== presented.charCodeAt(index)) return false;'), 'gate', ['P01']],
  ['Y21_SECRET_LENGTH_CHECK_REMOVED', 'a longer value that starts with the secret is refused', HTTP, s => once(s, 'if (!presented || presented.length !== expected.length) return false;', 'if (!presented) return false;'), 'gate', ['P01']],
  ['Y22_BODY_CAP_TRUSTS_THE_DECLARED_LENGTH_ONLY', 'the ACTUAL body read is capped, not only the Content-Length header', HTTP, s => once(s, 'if (total > max) { await reader.cancel().catch(() => undefined); return null; }', 'if (total > 1e15) { await reader.cancel().catch(() => undefined); return null; }'), 'gate', ['L01']],
  ['Y23_BODY_CAP_OFF_BY_ONE', 'a body of exactly the limit is accepted', HTTP, s => once(s, 'if (total > max) {', 'if (total >= max) {'), 'gate', ['L01']],
  ['Y24_DECLARED_LENGTH_NOT_USED_FOR_EARLY_REFUSAL', 'an over-limit declared length is refused before any read', HTTP, s => once(s, '(!/^\\d+$/.test(declared) || Number(declared) > max)', 'false'), 'gate', ['L01']],
  ['Y25_UNAVAILABLE_RESPONSE_WRITES_A_LOG_LINE', 'the entrypoints write nothing to the console', HTTP, s => once(s, 'export const unavailableResponse = (): Response => jsonResponse(503, { status: "unavailable" });', 'export const unavailableResponse = (): Response => { console.warn("unavailable"); return jsonResponse(503, { status: "unavailable" }); };'), 'gate', ['W07']],
  // ---- webhook entrypoint ----
  ['Y26_PRODUCTION_COMPOSITION_HAS_A_PERMISSIVE_VERIFIER', 'the default composition has no verifier (nothing can ever be ingested)', WH, s => once(s, '    adapter: null\n', '    adapter: { verify: async () => ({ ok: true, namespace: "store.sandbox" }), map: async () => [] }\n'), 'gate', ['W02', 'S01']],
  ['Y27_WEBHOOK_TRANSPORT_CREATED_EAGERLY', 'a database connection is not created before verification', WH, s => once(s, 'let created: ClosableBillingTransport | null = null;', 'let created: ClosableBillingTransport | null = dependencies.createTransport(config.value.ingressDbUrl);'), 'gate', ['W04']],
  ['Y28_WEBHOOK_NEVER_CLOSES_THE_TRANSPORT', 'the transport is closed in every case', WH, s => once(s, 'if (created !== null) await (created as ClosableBillingTransport).close().catch(() => undefined);', ''), 'gate', ['W06']],
  ['Y29_WEBHOOK_IGNORES_THE_CONFIGURED_LIMIT', 'the configured payload limit is the one enforced', WH, s => once(s, 'maxBodyBytes: config.value.maxBodyBytes }', 'maxBodyBytes: 1048576 }'), 'gate', ['W03']],
  ['Y30_WEBHOOK_ADAPTER_NULL_CHECK_REMOVED', 'EQUIVALENT: the null adapter is dereferenced inside the try block before any body read or connection, so the answer is still 503 (defence in depth, not a separate guard)', WH, s => once(s, 'if (adapter === null) return unavailableResponse();\n', ''), 'green', ['W02', 'W01'], 'adapter.verify is evaluated while building the receiveDelivery arguments, inside the try: a TypeError there is caught and answered 503 before the body is read'],
  ['Y31_WEBHOOK_REUSES_ONE_TRANSPORT_VARIABLE_AGAIN', 'EQUIVALENT in this package: a delivery uses exactly one transaction, so re-creating the transport per transaction is not observable (it would leak connections once several transactions exist)', WH, s => once(s, 'created ??= dependencies.createTransport(config.value.ingressDbUrl);', 'created = dependencies.createTransport(config.value.ingressDbUrl);'), 'green', ['W06', 'W01', 'T05'], 'receiveDelivery issues exactly one transaction per request'],
  ['Y32_WEBHOOK_READS_THE_PRODUCER_URL', 'the webhook uses the ingress role, never the producer role', WHC, s => once(s, 'readDatabaseUrl(read, BILLING_ENV.ingressDbUrl)', 'readDatabaseUrl(read, BILLING_ENV.producerDbUrl)'), 'gate', ['W01', 'I01']],
  ['Y33_RECEIVE_ACKS_BEFORE_THE_TRANSACTION_ENDS', 'PROTECTED LIBRARY CONTROL: a 2xx is returned only after a confirmed commit', RECEIVE, s => { let t = once(s, 'const outcomes = await deps.transport.transaction(async (tx) => {', 'const outcomesPromise = deps.transport.transaction(async (tx) => {'); return once(t, '      return seen;\n    });\n', '      return seen;\n    });\n    outcomesPromise.catch(() => undefined);\n    const outcomes: string[] = [];\n'); }, 'gate', ['W06']],
  ['Y58_RECEIVE_BODY_CAP_TRUSTS_THE_DECLARED_LENGTH_ONLY', 'PROTECTED LIBRARY CONTROL: the ACTUAL webhook body read is capped (a missing or understated Content-Length cannot bypass it)', RECEIVE, s => once(s, 'if (total > max) { await reader.cancel().catch(() => undefined); return null; }', 'if (total > 1e15) { await reader.cancel().catch(() => undefined); return null; }'), 'gate', ['W03']],
  ['Y59_RECEIVE_BODY_CAP_OFF_BY_ONE', 'PROTECTED LIBRARY CONTROL: a webhook body of exactly the limit is accepted', RECEIVE, s => once(s, 'if (total > max) {', 'if (total >= max) {'), 'gate', ['W03']],
  ['Y60_RECEIVE_DECLARED_LENGTH_NOT_USED_FOR_EARLY_REFUSAL', 'PROTECTED LIBRARY CONTROL: an over-limit declared length is refused before any read', RECEIVE, s => once(s, '(!/^\\d+$/.test(declared) || Number(declared) > max)', 'false'), 'gate', ['W03']],
  // ---- link entrypoint ----
  ['Y34_LINK_TRUSTS_AN_OWNER_HEADER', 'the owner comes only from the platform-verified user', LH, s => once(s, 'authenticate: () => dependencies.authenticate(request, config.value),', 'authenticate: async () => { const o = request.headers.get("x-owner"); return o ? { userId: o } : dependencies.authenticate(request, config.value); },'), 'gate', ['L02']],
  ['Y35_LINK_BODY_CAP_REMOVED', 'the request body is bounded before the library reads it', LH, s => once(s, 'const raw = await readCappedBody(request, BILLING_LINK_BODY_LIMIT);\n  if (raw === null) return jsonResponse(413, { status: "payload_too_large" });', 'const raw = new Uint8Array(await request.arrayBuffer());'), 'gate', ['L01']],
  ['Y36_LINK_AUTHENTICATES_BEFORE_ANYTHING_ELSE', 'no authentication call happens when the endpoint is closed or the request is refused', LH, s => once(s, 'export async function processBillingLinkRequest(request: Request, dependencies: BillingLinkDependencies): Promise<Response> {\n  const config', 'export async function processBillingLinkRequest(request: Request, dependencies: BillingLinkDependencies): Promise<Response> {\n  await dependencies.authenticate(request, { supabaseUrl: "", supabaseAnonKey: "" });\n  const config'), 'gate', ['L01']],
  ['Y37_LINK_METHOD_CHECK_REMOVED_FROM_THE_HANDLER', 'a non-POST is refused by the handler (the bounded request handed to the library is always rebuilt as a POST, so the library cannot refuse it)', LH, s => once(s, '  if (request.method !== "POST") return jsonResponse(405, { status: "method_not_allowed" });\n', ''), 'gate', ['L01']],
  ['Y38_LINK_LIBRARY_STORES_THE_RAW_BINDING', 'PROTECTED LIBRARY CONTROL: only the hash of the binding is stored', LINKLIB, s => once(s, 'tx.createLinkIntent(deps.namespace, actor.userId, deps.sha256Hex(binding), deps.now() + deps.ttlMs)', 'tx.createLinkIntent(deps.namespace, actor.userId, binding, deps.now() + deps.ttlMs)'), 'gate', ['L02']],
  ['Y39_DEFAULT_AUTHENTICATION_TAKES_A_USER_ID_HEADER', 'the user id comes only from getUser()', LH, s => once(s, 'return { userId: data.user.id };', 'return { userId: request.headers.get("x-user-id") ?? data.user.id };'), 'gate', ['L02']],
  ['Y40_DEFAULT_AUTHENTICATION_IGNORES_THE_AUTH_ERROR', 'an authentication error is a refusal even if a user object is present', LH, s => once(s, 'if (error || !data.user) return null;', 'if (!data.user) return null;'), 'gate', ['L02']],
  ['Y41_LINK_COMPOSITION_CREATES_A_PLATFORM_CLIENT_AT_IMPORT', 'composition makes no platform call before a request', LH, s => once(s, 'export function createDefaultBillingLinkDependencies(): BillingLinkDependencies {\n', 'export function createDefaultBillingLinkDependencies(): BillingLinkDependencies {\n  createClient("http://127.0.0.1", "k");\n'), 'gate', ['I01']],
  // ---- process entrypoint ----
  ['Y42_PROCESS_SECRET_CHECK_REMOVED', 'the scheduler must present the shared secret', PH, s => once(s, '  if (!secretMatches(config.value.processSecret, request.headers.get(BILLING_PROCESS_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });\n', ''), 'gate', ['P01']],
  ['Y43_COMPLETED_COUNTED_BEFORE_THE_COMMIT', 'an item is counted completed only after its transaction is confirmed committed', PH, s => once(s, 'processItem: async (id) => { touchedProcess = true; const r = await tx.processItem(id); lastProcess = r; return r; }', 'processItem: async (id) => { touchedProcess = true; const r = await tx.processItem(id); lastProcess = r; if (isFinalOutcome(r.outcome)) state.completed += 1; return r; }'), 'gate', ['P02']],
  ['Y44_UNKNOWN_ITEM_OUTCOME_NEVER_FLAGGED', 'a lost COMMIT answer for an item is reported as unknown', PH, s => once(s, 'if (touchedProcess && isCommitOutcomeUnknown(e)) state.itemOutcomeUnknown = true;', ''), 'gate', ['P02', 'T05']],
  ['Y45_FAILED_DRAIN_ANSWERS_200', 'a failed or unknown drain is not answered 200', PH, s => once(s, 'jsonResponse(status === "ok" || status === "stopped" ? 200 : 503,', 'jsonResponse(200,'), 'gate', ['P02']],
  ['Y46_EVERY_COMMITTED_OUTCOME_COUNTS_AS_COMPLETED', 'only a final outcome is completed work', PH, s => once(s, 'if (isFinalOutcome(done.outcome)) state.completed += 1;', 'state.completed += 1;'), 'gate', ['P02']],
  ['Y47_SUMMARY_KEYS_ARE_ITEM_IDS', 'the summary carries no item id', PH, s => once(s, 'const key = /^[a-z_]{1,32}$/.test(done.outcome) ? done.outcome : "other";', 'const key = done.item_id ?? "other";'), 'gate', ['P02']],
  ['Y48_ITEM_LIMIT_RAISED', 'one drain is bounded by the operational item limit', PHC, s => once(s, 'export const BILLING_PROCESS_ITEM_LIMIT = 10 as const;', 'export const BILLING_PROCESS_ITEM_LIMIT = 1000 as const;'), 'gate', ['P02']],
  ['Y49_PROCESS_CREATES_A_NEW_TRANSPORT_PER_TRANSACTION', 'one connection object serves the drain and is closed once', PH, s => once(s, 'created ??= dependencies.createTransport(config.value.producerDbUrl);', 'created = dependencies.createTransport(config.value.producerDbUrl);'), 'gate', ['P02']],
  ['Y50_PROCESS_NEVER_CLOSES_THE_TRANSPORT', 'the transport is closed in every case', PH, s => once(s, 'if (created !== null) await (created as ClosableBillingTransport).close().catch(() => undefined);', ''), 'gate', ['P02']],
  ['Y51_UNKNOWN_FOLDED_INTO_FAILED', 'an unknown item outcome is distinguishable from a clean failure', PH, s => once(s, 'const status = state.itemOutcomeUnknown ? "unknown"', 'const status = false ? "unknown"'), 'gate', ['P02', 'T05']],
  // ---- composition / Deno binding ----
  ['Y52_PROCESS_INDEX_READS_THE_ENVIRONMENT_AT_IMPORT', 'importing an entrypoint reads no environment variable', PIDX, s => once(s, 'const dependencies = createDefaultBillingProcessDependencies();', 'Deno.env.get("BILLING_INGEST_ENABLED");\nconst dependencies = createDefaultBillingProcessDependencies();'), 'gate', ['I01']],
  ['Y53_DENO_BINDING_USES_PREPARED_STATEMENTS', 'prepare:false is an invariant (Supavisor transaction mode)', DENO, s => once(s, 'prepare: false,', 'prepare: true,'), 'gate', ['S03', 'I01']],
  ['Y54_DENO_BINDING_MARKS_EVERY_FAILURE_AS_COMMIT_PHASE', 'only a failure after the callback returned is a commit-phase failure', DENO, s => once(s, 'if (bodyFinished) throw new BillingCommitPhaseError(e);', 'throw new BillingCommitPhaseError(e);'), 'gate', ['S03']],
  ['Y55_PROVIDER_NAME_APPEARS_IN_THE_PRODUCT', 'no provider is chosen in this package', WH, s => once(s, 'export type BillingWebhookAdapter', 'const PROVIDER_HINT = "stripe";\nexport type BillingWebhookAdapter'), 'gate', ['S01']],
  ['Y56_A_SIGNATURE_PRIMITIVE_APPEARS_IN_THE_WEBHOOK', 'no verifier implementation exists in the product', WH, s => once(s, 'import { receiveDelivery }', 'import { createHmac } from "node:crypto";\nimport { receiveDelivery }'), 'gate', ['S01']],
  ['Y57_A_NEW_ENVIRONMENT_VARIABLE_APPEARS', 'only the recorded variable names are read', WHC, s => once(s, 'if (!readEnabled(read)) return unavailable;', 'if (!readEnabled(read) || read("BILLING_DEBUG_BYPASS") === "1") return unavailable;'), 'gate', ['S01']]
];

export function makeCopy(file, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-mut-'));
  for (const d of COPY_DIRS) fs.cpSync(path.join(ROOT, FN, d), path.join(dir, FN, d), { recursive: true });
  let changed = false;
  if (file) { const p = path.join(dir, file); const before = fs.readFileSync(p, 'utf8'); const after = mutate(before); changed = after !== before; fs.writeFileSync(p, after); }
  return { dir, changed };
}
// The ONE judgement used by the smoke runner too (runGate -> judgeGate): kind is 'pass' | 'explicit_fail' | 'crash'; a setup error has already thrown SETUP_GATE (the whole run is BLOCKED).
const gateRunner = async (cl, id) => { const r = await runGate(cl, id); return { kind: r.kind, pass: r.kind === 'pass', explicit: r.kind === 'explicit_fail', crashed: r.kind === 'crash', observed: r.observed }; };

export async function runMutations({ bin, out, prefixes = [] }) {
  const rec = recorder(out); const started = new Date().toISOString();
  const ids = SPECS.map(x => x[0]);
  if (new Set(ids).size !== ids.length) throw Error('DUPLICATE_MUTANT_ID');
  const selected = SPECS.filter(sp => prefixes.length === 0 || prefixes.some(p => sp[0].startsWith(p)));
  if (prefixes.length && selected.length === 0) throw Error('UNKNOWN_MUTANT_PREFIX ' + prefixes.join(','));
  const results = []; let blocked = null; let cl = null; let exitCode = 0;
  const needsPg = gates => gates.some(g => !PURE_IDS.has(G(g)));
  const run = async (copy, gates) => { setSourceRoot(copy.dir); const o = {}; for (const g of gates) { const id = G(g); if (!PURE_IDS.has(id) && cl === null) cl = await entCluster(bin, rec); o[g] = await gateRunner(cl, id); } return o; };
  try {
    // controls: every gate that is used must PASS on an unmutated copy
    const used = [...new Set(selected.flatMap(sp => sp[5]))].sort(); const controls = {};
    const base = makeCopy(null, null);
    try { Object.assign(controls, await run(base, used)); } finally { setSourceRoot(null); fs.rmSync(base.dir, { recursive: true, force: true }); }
    rec.write('controls.json', Object.fromEntries(Object.entries(controls).map(([g, v]) => [g, { pass: v.pass, kind: v.kind }])));
    const badControls = Object.entries(controls).filter(([, v]) => v.kind !== 'pass').map(([g]) => g);
    console.log('CONTROL ' + (badControls.length === 0 ? 'PASS' : 'FAIL ' + badControls.join(',')) + ' gates=' + used.join(','));
    if (badControls.length) throw Error('SETUP_CONTROL_FAILED ' + badControls.join(','));
    for (const [id, protection, file, mutate, cls, gates, reason] of selected) {
      const copy = makeCopy(file, mutate);
      let obs;
      try {
        if (!copy.changed) throw Error('SETUP_MUTANT_UNCHANGED ' + id);
        obs = await run(copy, gates);
      } finally { setSourceRoot(null); fs.rmSync(copy.dir, { recursive: true, force: true }); }
      const detectedBy = gates.filter(g => obs[g].explicit), crashedGates = gates.filter(g => obs[g].crashed), passedGates = gates.filter(g => obs[g].pass);
      // gate: every listed gate returned an explicit failure. green: every listed gate PASSED (an explicit failure or a crash is a mismatch).
      const ok = cls === 'gate' ? detectedBy.length === gates.length : passedGates.length === gates.length;
      const row = { id, class: cls, protection, file, gates, reason: reason ?? null, ok, detectedBy, crashedGates, kinds: Object.fromEntries(gates.map(g => [g, obs[g].kind])), observed: Object.fromEntries(gates.map(g => [g, { pass: obs[g].pass, kind: obs[g].kind, observed: JSON.stringify(obs[g].observed) }])) };
      results.push(row); rec.write('mut-' + id + '.json', row);
      console.log('MUTANT ' + id + ' ' + cls + ' ' + (ok ? 'OK' : 'MISMATCH') + ' detectedBy=' + detectedBy.join(','));
      if (!ok) exitCode = 1;
    }
  } catch (e) { blocked = { message: String(e.message), stack: e.stack }; exitCode = 2; console.log('MUTANT_RUN BLOCKED ' + blocked.message.slice(0, 400)); }
  finally { setSourceRoot(null); if (cl) await cl.stop(); }
  const gateRows = results.filter(r => r.class === 'gate'), greenRows = results.filter(r => r.class === 'green');
  const summary = { total: results.length, selected: selected.length, gateMutants: gateRows.length, gateDetected: gateRows.filter(r => r.ok).length, crashedMutants: results.filter(r => r.crashedGates.length > 0).length, greenMutants: greenRows.length, greenOk: greenRows.filter(r => r.ok).length, mismatches: results.filter(r => !r.ok).map(r => r.id) };
  const complete = !blocked && results.length === selected.length;
  const status = blocked ? 'BLOCKED' : !complete ? 'BLOCKED' : summary.mismatches.length ? 'FAIL' : 'PASS';
  if (status === 'BLOCKED' && exitCode === 0) exitCode = 2;
  rec.write('result.json', { status, exitCode, exitCodeNote: 'exitCode is the value runMutations RETURNS (the value the CLI wrapper hands to process.exit); it is not an OS exit code. The OS exit code of the node process is recorded by the runner (run-meta.json).', prefixes, summary, results: results.map(r => ({ id: r.id, class: r.class, ok: r.ok })), blocked, startedUtc: started, endedUtc: new Date().toISOString(), identity: sourceIdentity() });
  console.log('SUMMARY ' + JSON.stringify(summary));
  return exitCode;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code;
  try { const prefixes = (process.env.TK_MUTANTS ?? '').split(',').map(s => s.trim()).filter(Boolean); code = await runMutations({ ...options(), prefixes }); } catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
