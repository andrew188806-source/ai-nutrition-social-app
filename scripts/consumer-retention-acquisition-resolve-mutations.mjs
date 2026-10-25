#!/usr/bin/env node
// ENT-W1 mutation controls. Each mutant is ONE exact replacement that must match exactly once (else BLOCKED, never "detected") in a COPY of the migration (passed as --draft) or of supabase/functions (passed as
// --src-root). The repo smoke runs in a child process with only the mutant's target gates.
// ENT-W1-T01 (first independent acceptance): the rejected classifier read only result.status, dropped signal/error, and so counted an empty child run and a child that wrote its result and then timed out as
// PASS 12/12. Here ONE judge (judgeChild) decides every child, real mutants and meta-controls alike, from ALL of: the numeric OS exit, signal, spawn error / timeout, the parsed result.json, the exact non-empty
// selected gate set, one check file per gate with a matching kind (and a non-empty observation for every explicit failure), the stdout CHECK/RESULT lines (order and counts), and the source identity the child
// reports (smoke, migration and product SHA-256 = the bytes this harness actually wrote). Every disagreement has its own verdict; only DETECTED counts as detected, only CONTROL_OK as a valid control.
// usage: node scripts/consumer-retention-acquisition-resolve-mutations.mjs --pg-bin <bin> --out <new dir>
//        node scripts/consumer-retention-acquisition-resolve-mutations.mjs --meta-controls --out <new dir>     (real child processes running stand-ins; no PostgreSQL; checks the judge itself)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './consumer-retention-persistence-smoke.mjs';
import { ENTW1_MIGRATION } from './consumer-retention-entw1-exact-successor.mjs';

const SUITE = path.join(ROOT, 'scripts/consumer-retention-acquisition-resolve-smoke.mjs'), DRAFT = path.join(ROOT, 'supabase/migrations', ENTW1_MIGRATION);
export const PRODUCT = Object.freeze(['supabase/functions/_shared/acquisition-resolve/sql.ts', 'supabase/functions/_shared/acquisition-resolve/worker.ts', 'supabase/functions/retention-acquisition-resolve/config.ts', 'supabase/functions/retention-acquisition-resolve/handler.ts', 'supabase/functions/retention-acquisition-resolve/index.ts']);
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const sha256File = f => sha256(fs.readFileSync(f));
export const MUTANTS = Object.freeze([
  { id: 'D1_EXAMINED_PASSES_UNRESOLVED', file: 'draft', from: ' ELSIF v_next IS NOT NULL THEN\n', to: ' ELSIF false THEN\n', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D2_NO_ATTEMPT_BOUND', file: 'draft', from: ' IF v_attempt > 3 THEN', to: ' IF false THEN', gates: ['G06_A_PERSISTENTLY_FAILING_ID_DOES_NOT_STARVE_LATER_IDS'] },
  { id: 'D3_WRAP_WITH_UNRESOLVED', file: 'draft', from: "  IF v_next IS NOT NULL THEN\n   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_REMAIN');", to: "  IF false THEN\n   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_REMAIN');", gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D4_BEGIN_ACCEPTS_A_LATER_ID', file: 'draft', from: ' ELSIF v_next < p_resource THEN', to: ' ELSIF false THEN', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  // retargeted by ENT-W1-A01: 'not begun' is now "no committed start row of this resource in this cycle"
  { id: 'D5_RESOLVED_WITHOUT_BEGIN', file: 'draft', from: '  IF NOT EXISTS (SELECT 1 FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle AND a.resource_id = p_to) THEN', to: '  IF false THEN', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D6_RESOLVED_PASSES_A_LATE_ANCHOR', file: 'draft', from: '  IF v_next IS NOT NULL AND v_next < p_to THEN', to: '  IF false THEN', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  // retargeted by ENT-W1-A01: the count now comes from the per-resource start row
  { id: 'D7_ATTEMPTS_NEVER_COUNT', file: 'draft', from: ' v_attempt := COALESCE(v_starts, 0) + 1;', to: ' v_attempt := 1;', gates: ['G06_A_PERSISTENTLY_FAILING_ID_DOES_NOT_STARVE_LATER_IDS'] },
  // new (ENT-W1-A01 defect class): any cursor move wipes every start row of the cycle, so a late lower anchor resets the failing id
  { id: 'D8_ANY_MOVE_RESETS_EVERY_START', file: 'draft', from: ' DELETE FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle AND a.resource_id <= p_to;', to: ' DELETE FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle;', gates: ['A01_LATE_LOWER_ANCHOR_KEEPS_THE_COMMITTED_STARTS_OF_A_FAILING_ID', 'A01_CONCURRENT_INTERLEAVED_AND_ROLLED_BACK_STARTS_STAY_WITHIN_THREE'] },
  { id: 'T1_UNKNOWN_COMMIT_TREATED_AS_DEFINITE', file: 'supabase/functions/_shared/acquisition-resolve/sql.ts', from: '    throw new AcquisitionCommitOutcomeUnknownError(e.commitFailure);', to: '    throw e.commitFailure;', gates: ['U01_COMMIT_CLASSIFICATION_REUSES_THE_DRIVER_ATTESTATION', 'G08_COMMIT_UNKNOWN_AFTER_A_REAL_RESOLVER_COMMIT'] },
  { id: 'T2_RAW_CODE_IS_A_SERVER_ANSWER', file: 'supabase/functions/_shared/acquisition-resolve/sql.ts', from: '      if (commitFailureIsDefinite(e)) throw e.commitFailure;', to: '      if (commitFailureIsDefinite(e) || typeof (e.commitFailure as { code?: unknown })?.code === "string") throw e.commitFailure;', gates: ['U01_COMMIT_CLASSIFICATION_REUSES_THE_DRIVER_ATTESTATION', 'G08_COMMIT_UNKNOWN_AFTER_A_REAL_RESOLVER_COMMIT'] },
  { id: 'T3_PAGE_CONTINUES_AFTER_A_FAILED_ITEM', file: 'supabase/functions/_shared/acquisition-resolve/worker.ts', from: '        const r = await inAcquisitionTransaction(driver, async (q) => {\n          const resolved = await resolveItem(q, id);\n          const moved = await advanceCursor(q, page.cycle, id, "resolved");\n          return { resolved, moved };\n        });', to: '        let r;\n        try {\n          r = await inAcquisitionTransaction(driver, async (q) => {\n            const resolved = await resolveItem(q, id);\n            const moved = await advanceCursor(q, page.cycle, id, "resolved");\n            return { resolved, moved };\n          });\n        } catch { continue; }', gates: ['G09_A_SERVER_ABORT_AT_COMMIT_IS_DEFINITE_AND_LEAVES_THE_CURSOR', 'U03_SWEEP_STOP_RULES_WITH_A_SCRIPTED_DATABASE'] },
  { id: 'T4_DRIVER_BEFORE_SECRET', file: 'supabase/functions/retention-acquisition-resolve/handler.ts', from: '  if (!secretMatches(config.value.secret, request.headers.get(RETENTION_RESOLVE_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });\n\n  const driver = dependencies.createDriver(config.value.resolverDbUrl);', to: '  const driver = dependencies.createDriver(config.value.resolverDbUrl);\n  if (!secretMatches(config.value.secret, request.headers.get(RETENTION_RESOLVE_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });', gates: ['U04_ENDPOINT_REFUSALS_PRECEDE_ANY_DATABASE'] },
  { id: 'T5_SECOND_WRAP_IN_ONE_RUN', file: 'supabase/functions/_shared/acquisition-resolve/worker.ts', from: '          if (a === "wrapped") { s.wrapped += 1; return stop("idle"); }', to: '          if (a === "wrapped") { s.wrapped += 1; continue; }', gates: ['U03_SWEEP_STOP_RULES_WITH_A_SCRIPTED_DATABASE', 'G04_RESOLVER_DECIDES_EVERY_OUTCOME_WITHOUT_A_TIME_CUTOFF'] }
]);

// ---- one child run: everything the OS and the child produced is kept --------------------------------------------------------------------------------------------
export function runChild({ out, script = SUITE, args = [], gates, timeoutMs = 900000, env = {}, label }) {
  const t0 = Date.now();
  const p = spawnSync(process.execPath, [script, ...args, '--out', out], { cwd: ROOT, env: { ...process.env, ...env, TK_GATES: gates.join(',') }, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64e6 });
  const run = { label, script, argv: [process.execPath, script, ...args, '--out', out], gates: [...gates], status: p.status, signal: p.signal, error: p.error ? { code: p.error.code ?? null, message: String(p.error.message).slice(0, 300) } : null, ms: Date.now() - t0, stdout: p.stdout ?? '', stderr: p.stderr ?? '', out };
  let result = null, resultError = null; try { result = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')); } catch (e) { resultError = String(e.code ?? e.message); }
  const checkFiles = {};
  for (const id of gates) { try { checkFiles[id] = JSON.parse(fs.readFileSync(path.join(out, 'check-' + id + '.json'), 'utf8')); } catch { checkFiles[id] = null; } }
  return { ...run, result, resultError, checkFiles };
}
// ---- the judge ---------------------------------------------------------------------------------------------------------------------------------------------------
// expect: 'control' (unmutated sources: must PASS completely, exit 0) or 'detector' (mutated sources: must FAIL completely, exit 1, with explicit observations). identity: what the child must report.
export function judgeChild(run, { expect, identity }) {
  const reasons = [];
  const verdict = v => ({ verdict: v, reasons });
  if (run.error) { reasons.push('spawn error ' + run.error.code); return verdict(run.error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'SPAWN_ERROR'); }
  if (run.signal) { reasons.push('signal ' + run.signal); return verdict('SIGNAL'); }
  if (typeof run.status !== 'number') { reasons.push('no numeric exit'); return verdict('INCOMPLETE'); }
  const r = run.result;
  if (!r || typeof r !== 'object') { reasons.push('no result.json (' + run.resultError + ')'); return verdict('INCOMPLETE'); }
  const lines = run.stdout.split(/\r?\n/), checkLines = lines.filter(l => /^CHECK /.test(l)), resultLines = lines.filter(l => /^RESULT /.test(l)), blockedLines = lines.filter(l => /^BLOCKED /.test(l));
  if (r.status === 'BLOCKED') { reasons.push('child BLOCKED: ' + String(r.blocked?.message ?? '').slice(0, 160)); return verdict((r.crashed ?? []).length ? 'CRASH' : 'BLOCKED_SETUP'); }
  if ((r.crashed ?? []).length || (r.checks ?? []).some(c => c.kind === 'crash') || checkLines.some(l => / CRASH$/.test(l))) { reasons.push('crashed gate(s) ' + JSON.stringify(r.crashed)); return verdict('CRASH'); }
  // completeness: the exact non-empty selection, one check per selected gate, one file per check
  const sel = Array.isArray(r.selected) ? r.selected : [], checks = Array.isArray(r.checks) ? r.checks : [];
  const want = [...run.gates].sort(), got = [...sel].sort(), ids = checks.map(c => c.id);
  if (want.length === 0 || sel.length === 0) reasons.push('empty selection');
  if (JSON.stringify(want) !== JSON.stringify(got) || new Set(sel).size !== sel.length) reasons.push('selected ' + JSON.stringify(sel) + ' != requested ' + JSON.stringify(run.gates));
  if (JSON.stringify(ids) !== JSON.stringify(sel)) reasons.push('checks ' + JSON.stringify(ids) + ' != selected');
  for (const c of checks) { const f = run.checkFiles[c.id]; if (!f) reasons.push('missing check file ' + c.id); else if (f.kind !== c.kind || f.id !== c.id) reasons.push('check file disagrees ' + c.id); if (!['pass', 'explicit_fail'].includes(c.kind)) reasons.push('unexpected kind ' + c.kind); }
  if (reasons.length) return verdict('INCOMPLETE');
  // stdout must say the same thing in the same order
  const expectLines = checks.map(c => 'CHECK ' + c.id + ' ' + (c.kind === 'pass' ? 'PASS' : 'FAIL'));
  const passed = checks.filter(c => c.kind === 'pass').length;
  if (JSON.stringify(checkLines) !== JSON.stringify(expectLines)) reasons.push('stdout CHECK lines disagree with result.checks');
  if (resultLines.length !== 1 || resultLines[0] !== 'RESULT ' + r.status + ' ' + passed + '/' + sel.length) reasons.push('stdout RESULT line ' + JSON.stringify(resultLines));
  if (blockedLines.length) reasons.push('stdout BLOCKED line');
  const failed = Array.isArray(r.failed) ? r.failed : [];
  const explicit = checks.filter(c => c.kind === 'explicit_fail').map(c => c.id);
  if (JSON.stringify([...failed].sort()) !== JSON.stringify([...explicit].sort())) reasons.push('result.failed != explicit failures');
  for (const id of explicit) { const o = run.checkFiles[id]?.observed; if (!o || typeof o !== 'object' || Object.keys(o).length === 0 || o.gateCrashed) reasons.push('explicit failure without an observation ' + id); }
  if (r.status !== (explicit.length ? 'FAIL' : 'PASS')) reasons.push('status ' + r.status + ' disagrees with the checks');
  if (reasons.length) return verdict('CONTRADICTION');
  // the source the child actually ran
  const idn = r.identity ?? {};
  if (idn.smokeSha256 !== identity.smoke || idn.draftSha256 !== identity.draft || path.resolve(idn.srcRoot ?? '') !== path.resolve(identity.srcRoot) || JSON.stringify(idn.product ?? null) !== JSON.stringify(identity.product)) { reasons.push('identity ' + JSON.stringify({ reported: { smoke: idn.smokeSha256, draft: idn.draftSha256, srcRoot: idn.srcRoot }, expected: { smoke: identity.smoke, draft: identity.draft, srcRoot: identity.srcRoot } })); return verdict('IDENTITY_MISMATCH'); }
  // the expected outcome and exit
  if (expect === 'control') { if (r.status === 'PASS' && run.status === 0) return verdict('CONTROL_OK'); if (r.status === 'PASS' || run.status === 0) { reasons.push('control status ' + r.status + ' exit ' + run.status); return verdict('EXIT_MISMATCH'); } reasons.push('control failed ' + JSON.stringify(failed)); return verdict('CONTROL_FAILED'); }
  if (r.status === 'FAIL' && run.status === 1) return verdict('DETECTED');
  if (r.status === 'PASS' && run.status === 0) return verdict('NOT_DETECTED');
  reasons.push('detector status ' + r.status + ' exit ' + run.status); return verdict('EXIT_MISMATCH');
}
// the whole run: PASS only with a valid control and every mutant DETECTED and an unchanged identity; FAIL when the only problems are semantic (a mutant not detected, a failing control); else BLOCKED
export function aggregate(control, rows, identityUnchanged) {
  const semantic = new Set(['NOT_DETECTED', 'CONTROL_FAILED']);
  const all = [control, ...rows];
  if (!identityUnchanged) return 'BLOCKED';
  if (all.some(x => !['CONTROL_OK', 'DETECTED', ...semantic].includes(x.verdict))) return 'BLOCKED';
  if (control.verdict === 'CONTROL_OK' && rows.length > 0 && rows.every(x => x.verdict === 'DETECTED')) return 'PASS';
  return 'FAIL';
}
const EXIT = { PASS: 0, FAIL: 1, BLOCKED: 2 };
function copyDir(src, dst) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) copyDir(s, d); else { fs.copyFileSync(s, d); fs.chmodSync(d, 0o644); } } }
const keep = (OUT, run, judged) => { fs.writeFileSync(path.join(OUT, run.label + '.child.json'), JSON.stringify({ argv: run.argv, gates: run.gates, status: run.status, signal: run.signal, error: run.error, ms: run.ms, resultError: run.resultError, verdict: judged.verdict, reasons: judged.reasons }, null, 2)); fs.writeFileSync(path.join(OUT, run.label + '.stdout.txt'), run.stdout); fs.writeFileSync(path.join(OUT, run.label + '.stderr.txt'), run.stderr); };

// ---- meta-controls: REAL child processes (stand-ins written here), the SAME runChild + judgeChild + aggregate -------------------------------------------------------------
const STANDIN = `import fs from 'node:fs'; import path from 'node:path';
const a = process.argv.slice(2), out = a[a.indexOf('--out') + 1], mode = process.env.TK_META_MODE, idn = JSON.parse(process.env.TK_META_IDENTITY), sel = (process.env.TK_GATES ?? '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const fail = mode === 'detector' || mode === 'exit_mismatch' || mode === 'stdout_contradiction' || mode === 'fail_without_observation' || mode === 'timeout_after_result_detector';
const empty = mode === 'empty_control' || mode === 'empty_detector';
const selected = empty ? [] : sel, checks = selected.map(id => ({ id, kind: fail ? 'explicit_fail' : 'pass' }));
const identity = mode === 'identity_mismatch' ? { ...idn, draftSha256: '0'.repeat(64) } : idn;
const status = mode === 'blocked' ? 'BLOCKED' : mode === 'crash' ? 'BLOCKED' : fail ? 'FAIL' : 'PASS';
const result = { status, selected, checks: mode === 'crash' ? selected.map(id => ({ id, kind: 'crash' })) : checks, failed: fail ? selected : [], crashed: mode === 'crash' ? selected : [], blocked: mode === 'blocked' || mode === 'crash' ? { message: 'SETUP_META' } : null, identity };
if (mode !== 'missing_result') fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result));
for (const c of result.checks) fs.writeFileSync(path.join(out, 'check-' + c.id + '.json'), JSON.stringify({ id: c.id, kind: c.kind, observed: mode === 'fail_without_observation' ? {} : { meta: true } }));
for (const c of result.checks) process.stdout.write('CHECK ' + c.id + ' ' + (mode === 'stdout_contradiction' ? 'PASS' : c.kind === 'pass' ? 'PASS' : c.kind === 'crash' ? 'CRASH' : 'FAIL') + '\\n');
process.stdout.write('RESULT ' + status + ' ' + checks.filter(c => c.kind === 'pass').length + '/' + selected.length + '\\n');
if (mode.startsWith('timeout_after_result')) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); }
process.exitCode = mode === 'exit_mismatch' ? 0 : status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2;
`;
async function metaControls(OUT) {
  const script = path.join(OUT, 'standin-child.mjs'); fs.writeFileSync(script, STANDIN);
  const identity = { smoke: '1'.repeat(64), draft: '2'.repeat(64), srcRoot: ROOT, product: { a: '3'.repeat(64) } };
  const env = mode => ({ TK_META_MODE: mode, TK_META_IDENTITY: JSON.stringify({ smokeSha256: identity.smoke, draftSha256: identity.draft, srcRoot: identity.srcRoot, product: identity.product }) });
  const gates = ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES', 'G06_A_PERSISTENTLY_FAILING_ID_DOES_NOT_STARVE_LATER_IDS'];
  const CASES = [
    ['valid_control', 'control', 'CONTROL_OK'], ['detector', 'detector', 'DETECTED'], ['valid_control', 'detector', 'NOT_DETECTED'],
    ['empty_control', 'control', 'INCOMPLETE'], ['empty_detector', 'detector', 'INCOMPLETE'],                                       // the acceptor's first counterexample (empty completion)
    ['timeout_after_result_control', 'control', 'TIMEOUT'], ['timeout_after_result_detector', 'detector', 'TIMEOUT'],             // the acceptor's second counterexample (result written, then a real timeout)
    ['missing_result', 'detector', 'INCOMPLETE'], ['crash', 'detector', 'CRASH'], ['blocked', 'detector', 'BLOCKED_SETUP'],
    ['exit_mismatch', 'detector', 'EXIT_MISMATCH'], ['stdout_contradiction', 'detector', 'CONTRADICTION'], ['identity_mismatch', 'control', 'IDENTITY_MISMATCH'], ['fail_without_observation', 'detector', 'CONTRADICTION']
  ];
  const rows = [];
  for (const [mode, expect, want] of CASES) {
    const label = 'meta-' + mode + '-' + expect, run = runChild({ out: path.join(OUT, label), script, gates, env: env(mode), timeoutMs: mode.startsWith('timeout') ? 3000 : 60000, label });
    const j = judgeChild(run, { expect, identity }); keep(OUT, run, j);
    rows.push({ mode, expect, want, got: j.verdict, ok: j.verdict === want, os: { status: run.status, signal: run.signal, error: run.error }, reasons: j.reasons });
    console.log((j.verdict === want ? 'PASS ' : 'FAIL ') + 'meta ' + mode + ' as ' + expect + ': ' + j.verdict + ' (want ' + want + ')');
  }
  // the two counterexamples as WHOLE runs through aggregate(): never PASS
  const v = m => ({ verdict: rows.find(r => r.mode === m[0] && r.expect === m[1]).got });
  const whole = {
    emptyCompletion: aggregate(v(['empty_control', 'control']), [v(['empty_detector', 'detector'])], true),
    timeoutAfterResult: aggregate(v(['timeout_after_result_control', 'control']), [v(['timeout_after_result_detector', 'detector'])], true),
    validRun: aggregate(v(['valid_control', 'control']), [v(['detector', 'detector'])], true),
    undetectedMutant: aggregate(v(['valid_control', 'control']), [v(['valid_control', 'detector'])], true),
    identityChanged: aggregate(v(['valid_control', 'control']), [v(['detector', 'detector'])], false)
  };
  const wholeOk = whole.emptyCompletion === 'BLOCKED' && whole.timeoutAfterResult === 'BLOCKED' && whole.validRun === 'PASS' && whole.undetectedMutant === 'FAIL' && whole.identityChanged === 'BLOCKED';
  const status = rows.every(r => r.ok) && wholeOk ? 'PASS' : 'FAIL';
  fs.writeFileSync(path.join(OUT, 'meta-controls.json'), JSON.stringify({ status, rows, whole, method: 'real child processes (node) running a stand-in; the same runChild/judgeChild/aggregate as the real mutants; not product or PostgreSQL evidence' }, null, 2));
  console.log('META ' + status + ' ' + rows.filter(r => r.ok).length + '/' + rows.length + ' whole=' + JSON.stringify(whole));
  return status === 'PASS' ? 0 : 1;
}

// ---- the real run ------------------------------------------------------------------------------------------------------------------------------------------------
async function realRun(OUT, BIN) {
  const identityNow = () => ({ suite: sha256File(SUITE), draft: sha256File(DRAFT), product: Object.fromEntries(PRODUCT.map(p => [p, sha256File(path.join(ROOT, p))])) });
  const before = identityNow();
  const allGates = [...new Set(MUTANTS.flatMap(m => m.gates))];
  const base = { smoke: before.suite, srcRoot: ROOT, product: before.product };
  const controlRun = runChild({ out: path.join(OUT, 'control'), args: ['--pg-bin', BIN, '--draft', DRAFT], gates: allGates, label: 'control' });
  const control = { id: 'CONTROL_UNMUTATED', gates: allGates, ...judgeChild(controlRun, { expect: 'control', identity: { ...base, draft: before.draft } }) }; keep(OUT, controlRun, control);
  console.log('CONTROL ' + control.verdict);
  const rows = [];
  for (const m of MUTANTS) {
    const dir = path.join(OUT, 'src-' + m.id);
    let draft = DRAFT, srcRoot = ROOT, target;
    if (m.file === 'draft') { fs.mkdirSync(dir, { recursive: true }); target = path.join(dir, 'draft.sql'); fs.copyFileSync(DRAFT, target); fs.chmodSync(target, 0o644); draft = target; }
    else { copyDir(path.join(ROOT, 'supabase/functions'), path.join(dir, 'supabase/functions')); srcRoot = dir; target = path.join(dir, m.file); }
    const text = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    const hits = text.split(m.from).length - 1;
    if (hits !== 1) { rows.push({ id: m.id, gates: m.gates, verdict: 'REPLACEMENT_MATCHED_' + hits, reasons: [] }); console.log('MUTANT ' + m.id + ' REPLACEMENT_MATCHED_' + hits); continue; }
    fs.writeFileSync(target, text.replace(m.from, m.to));
    const mutantSha = sha256File(target);
    const expectIdentity = { ...base, draft: m.file === 'draft' ? mutantSha : before.draft, srcRoot, product: m.file === 'draft' ? before.product : Object.fromEntries(PRODUCT.map(p => [p, sha256File(path.join(srcRoot, p))])) };
    const run = runChild({ out: path.join(OUT, m.id), args: ['--pg-bin', BIN, '--draft', draft, ...(srcRoot !== ROOT ? ['--src-root', srcRoot] : [])], gates: m.gates, label: m.id });
    const j = judgeChild(run, { expect: 'detector', identity: expectIdentity }); keep(OUT, run, j);
    rows.push({ id: m.id, gates: m.gates, mutantFile: m.file, mutantSha256: mutantSha, failed: run.result?.failed ?? null, os: { status: run.status, signal: run.signal, error: run.error }, ...j });
    console.log('MUTANT ' + m.id + ' ' + j.verdict);
  }
  const after = identityNow(), unchanged = JSON.stringify(before) === JSON.stringify(after);
  const status = aggregate(control, rows, unchanged);
  const counts = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {});
  fs.writeFileSync(path.join(OUT, 'mutants.json'), JSON.stringify({ status, control, mutants: MUTANTS.length, detected: rows.filter(r => r.verdict === 'DETECTED').length, verdictCounts: counts, identity: before, identityUnchangedDuringRun: unchanged, rows }, null, 2));
  console.log('MUTANTS ' + status + ' control=' + control.verdict + ' detected=' + rows.filter(r => r.verdict === 'DETECTED').length + '/' + MUTANTS.length + ' ' + JSON.stringify(counts));
  return EXIT[status];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const OUT = arg('--out') ? path.resolve(arg('--out')) : null;
  if (!OUT) { console.error('usage: --pg-bin <bin> --out <new dir> | --meta-controls --out <new dir>'); process.exit(2); }
  if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.error('REFUSED: --out must be a new or empty directory'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  let code = 2;
  try { code = process.argv.includes('--meta-controls') ? await metaControls(OUT) : (arg('--pg-bin') ? await realRun(OUT, arg('--pg-bin')) : (console.error('--pg-bin required'), 2)); }
  catch (e) { console.error(e.stack); code = 2; }
  process.exitCode = code;
}
