#!/usr/bin/env node
// ENT-W1 mutation controls. The 12 mutants are byte-identical to the sealed checkpoint's (each ONE exact replacement that must match exactly once, else BLOCKED, never "detected") in a COPY of the migration
// (passed as --draft) or of supabase/functions (passed as --src-root). The repo smoke runs in a child process with only the mutant's target gates. DETECTED only when the child's result is FAIL with
// explicit observations; BLOCKED (setup, crash, empty run) is NOT detected. The unmutated control must PASS. The smoke, migration and product identity are hashed before and after the run.
// usage: node scripts/consumer-retention-acquisition-resolve-mutations.mjs --pg-bin <bin> --out <new dir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT } from './consumer-retention-persistence-smoke.mjs';
import { ENTW1_MIGRATION } from './consumer-retention-entw1-exact-successor.mjs';
const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const BIN = arg('--pg-bin'), OUT = path.resolve(arg('--out'));
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length) { console.error('REFUSED: --out must be a new or empty directory'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const SUITE = path.join(ROOT, 'scripts/consumer-retention-acquisition-resolve-smoke.mjs'), DRAFT = path.join(ROOT, 'supabase/migrations', ENTW1_MIGRATION);
const PRODUCT = ["supabase/functions/_shared/acquisition-resolve/sql.ts","supabase/functions/_shared/acquisition-resolve/worker.ts","supabase/functions/retention-acquisition-resolve/config.ts","supabase/functions/retention-acquisition-resolve/handler.ts","supabase/functions/retention-acquisition-resolve/index.ts"];
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const identityNow = () => ({ suite: sha256(SUITE), draft: sha256(DRAFT), product: Object.fromEntries(PRODUCT.map(p => [p, sha256(path.join(ROOT, p))])) });
const identity = identityNow();
const MUTANTS = [
  { id: 'D1_EXAMINED_PASSES_UNRESOLVED', file: 'draft', from: ' ELSIF v_next IS NOT NULL THEN\n', to: ' ELSIF false THEN\n', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D2_NO_ATTEMPT_BOUND', file: 'draft', from: ' IF v_attempt > 3 THEN', to: ' IF false THEN', gates: ['G06_A_PERSISTENTLY_FAILING_ID_DOES_NOT_STARVE_LATER_IDS'] },
  { id: 'D3_WRAP_WITH_UNRESOLVED', file: 'draft', from: "  IF v_next IS NOT NULL THEN\n   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_REMAIN');", to: "  IF false THEN\n   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_REMAIN');", gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D4_BEGIN_ACCEPTS_A_LATER_ID', file: 'draft', from: ' ELSIF v_next < p_resource THEN', to: ' ELSIF false THEN', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D5_RESOLVED_WITHOUT_BEGIN', file: 'draft', from: '  IF v_s.inflight_resource IS DISTINCT FROM p_to OR v_s.inflight_cycle IS DISTINCT FROM p_cycle THEN', to: '  IF false THEN', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D6_RESOLVED_PASSES_A_LATE_ANCHOR', file: 'draft', from: '  IF v_next IS NOT NULL AND v_next < p_to THEN', to: '  IF false THEN', gates: ['G14_THE_DATABASE_REFUSES_NON_CONTIGUOUS_MOVES'] },
  { id: 'D7_ATTEMPTS_NEVER_COUNT', file: 'draft', from: 'THEN v_s.inflight_attempts + 1 ELSE 1 END', to: 'THEN 1 ELSE 1 END', gates: ['G06_A_PERSISTENTLY_FAILING_ID_DOES_NOT_STARVE_LATER_IDS'] },
  { id: 'T1_UNKNOWN_COMMIT_TREATED_AS_DEFINITE', file: 'supabase/functions/_shared/acquisition-resolve/sql.ts', from: '    throw new AcquisitionCommitOutcomeUnknownError(e.commitFailure);', to: '    throw e.commitFailure;', gates: ['U01_COMMIT_CLASSIFICATION_REUSES_THE_DRIVER_ATTESTATION', 'G08_COMMIT_UNKNOWN_AFTER_A_REAL_RESOLVER_COMMIT'] },
  { id: 'T2_RAW_CODE_IS_A_SERVER_ANSWER', file: 'supabase/functions/_shared/acquisition-resolve/sql.ts', from: '      if (commitFailureIsDefinite(e)) throw e.commitFailure;', to: '      if (commitFailureIsDefinite(e) || typeof (e.commitFailure as { code?: unknown })?.code === "string") throw e.commitFailure;', gates: ['U01_COMMIT_CLASSIFICATION_REUSES_THE_DRIVER_ATTESTATION', 'G08_COMMIT_UNKNOWN_AFTER_A_REAL_RESOLVER_COMMIT'] },
  { id: 'T3_PAGE_CONTINUES_AFTER_A_FAILED_ITEM', file: 'supabase/functions/_shared/acquisition-resolve/worker.ts', from: '        const r = await inAcquisitionTransaction(driver, async (q) => {\n          const resolved = await resolveItem(q, id);\n          const moved = await advanceCursor(q, page.cycle, id, "resolved");\n          return { resolved, moved };\n        });', to: '        let r;\n        try {\n          r = await inAcquisitionTransaction(driver, async (q) => {\n            const resolved = await resolveItem(q, id);\n            const moved = await advanceCursor(q, page.cycle, id, "resolved");\n            return { resolved, moved };\n          });\n        } catch { continue; }', gates: ['G09_A_SERVER_ABORT_AT_COMMIT_IS_DEFINITE_AND_LEAVES_THE_CURSOR', 'U03_SWEEP_STOP_RULES_WITH_A_SCRIPTED_DATABASE'] },
  { id: 'T4_DRIVER_BEFORE_SECRET', file: 'supabase/functions/retention-acquisition-resolve/handler.ts', from: '  if (!secretMatches(config.value.secret, request.headers.get(RETENTION_RESOLVE_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });\n\n  const driver = dependencies.createDriver(config.value.resolverDbUrl);', to: '  const driver = dependencies.createDriver(config.value.resolverDbUrl);\n  if (!secretMatches(config.value.secret, request.headers.get(RETENTION_RESOLVE_SECRET_HEADER))) return jsonResponse(401, { status: "unauthorized" });', gates: ['U04_ENDPOINT_REFUSALS_PRECEDE_ANY_DATABASE'] },
  { id: 'T5_SECOND_WRAP_IN_ONE_RUN', file: 'supabase/functions/_shared/acquisition-resolve/worker.ts', from: '          if (a === "wrapped") { s.wrapped += 1; return stop("idle"); }', to: '          if (a === "wrapped") { s.wrapped += 1; continue; }', gates: ['U03_SWEEP_STOP_RULES_WITH_A_SCRIPTED_DATABASE', 'G04_RESOLVER_DECIDES_EVERY_OUTCOME_WITHOUT_A_TIME_CUTOFF'] }
];
function copyDir(src, dst) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { const s = path.join(src, e.name), d = path.join(dst, e.name); if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d); } }
function child(label, { draft = DRAFT, srcRoot = null, gates }) {
  const out = path.join(OUT, label);
  const args = [SUITE, '--pg-bin', BIN, '--out', out, '--draft', draft]; if (srcRoot) args.push('--src-root', srcRoot);
  const p = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, TK_GATES: gates.join(',') }, encoding: 'utf8', timeout: 900000 });
  fs.writeFileSync(path.join(OUT, label + '.stdout.txt'), (p.stdout ?? '') + '\n--stderr--\n' + (p.stderr ?? ''));
  let res = null; try { res = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')); } catch { res = null; }
  return { exit: p.status, result: res };
}
const rows = [];
const allGates = [...new Set(MUTANTS.flatMap(m => m.gates))];
const control = child('control', { gates: allGates });
rows.push({ id: 'CONTROL_UNMUTATED', gates: allGates, status: control.result?.status ?? null, exit: control.exit, verdict: control.result?.status === 'PASS' ? 'control-pass' : 'CONTROL_NOT_PASS' });
for (const m of MUTANTS) {
  let draft = DRAFT, srcRoot = null;
  const dir = path.join(OUT, 'src-' + m.id);
  const target = m.file === 'draft' ? path.join(dir, 'draft.sql') : path.join(dir, m.file);
  if (m.file === 'draft') { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(DRAFT, target); draft = target; }
  else { copyDir(path.join(ROOT, 'supabase/functions'), path.join(dir, 'supabase/functions')); srcRoot = dir; }
  const text = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  const hits = text.split(m.from).length - 1;
  if (hits !== 1) { rows.push({ id: m.id, gates: m.gates, verdict: 'BLOCKED_REPLACEMENT_MATCHED_' + hits }); continue; }
  fs.writeFileSync(target, text.replace(m.from, m.to));
  const r = child(m.id, { draft, srcRoot, gates: m.gates });
  const st = r.result?.status ?? null;
  const detected = st === 'FAIL' && (r.result.crashed ?? []).length === 0 && !r.result.blocked;
  rows.push({ id: m.id, gates: m.gates, status: st, exit: r.exit, failed: r.result?.failed ?? null, crashed: r.result?.crashed ?? null, blocked: r.result?.blocked?.message?.slice(0, 200) ?? null, verdict: detected ? 'DETECTED' : st === 'PASS' ? 'NOT_DETECTED_PASS' : 'NOT_DETECTED_BLOCKED' });
  console.log('MUTANT ' + m.id + ' ' + rows.at(-1).verdict);
}
const after = identityNow();
const unchanged = JSON.stringify(identity) === JSON.stringify(after);
const detected = rows.filter(r => r.verdict === 'DETECTED').length;
const status = !unchanged ? 'BLOCKED_IDENTITY_CHANGED' : rows[0].verdict === 'control-pass' && detected === MUTANTS.length ? 'PASS' : 'FAIL';
fs.writeFileSync(path.join(OUT, 'mutants.json'), JSON.stringify({ status, control: rows[0].verdict, mutants: MUTANTS.length, detected, identity, identityUnchangedDuringRun: unchanged, rows }, null, 2));
console.log('MUTANTS ' + status + ' control=' + rows[0].verdict + ' detected=' + detected + '/' + MUTANTS.length);
process.exitCode = status === 'PASS' ? 0 : 1;
