#!/usr/bin/env node
// ADMIN-AE1 mutation suite: every mutant of the AE1 contract must be killed by the AE1 guard.
// Mutants are applied in place and ALWAYS restored (finally + signal handlers); the run ends by proving the
// tree is byte-identical to its start and the unmutated guard passes.
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUARD = "scripts/admin-operational-read-permissions-ae1-guard.mjs";
const MIGRATION = "supabase/migrations/20260920010000_admin_operational_read_permissions_ae1.sql";
const VOCAB = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const files = [MIGRATION, VOCAB, REGISTRY];
const original = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");

function restore() { for (const [f, text] of original) fs.writeFileSync(path.join(ROOT, f), text); }
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { restore(); process.exit(130); });
process.on("exit", restore);

const routeLine = (id) => new RegExp(`(defineRoute\\(\\{ id: "${id}",[^\\n]*?requiredPermissions: )\\[[^\\]]*\\]`);
const setRoute = (file, id, permissions) => (text) => {
  const re = routeLine(id);
  if (!re.test(text)) throw new Error(`route ${id} not found`);
  return text.replace(re, `$1[${permissions.map((p) => `"${p}"`).join(", ")}]`);
};
const replaceOnce = (from, to) => (text) => {
  if (!text.includes(from)) throw new Error(`mutation anchor missing: ${from.slice(0, 60)}`);
  return text.replace(from, to);
};
const mutants = [
  { id: "A", name: "one required permission reverted to PLANNED", file: REGISTRY,
    fn: replaceOnce('{ key: "admin.restaurants.read", status: "CURRENT",', '{ key: "admin.restaurants.read", status: "PLANNED",') },
  { id: "B", name: "one AE1 route falls back to admin_context.read", file: REGISTRY, fn: setRoute(REGISTRY, "restaurants", ["admin_context.read"]) },
  { id: "C", name: "one deferred permission incorrectly CURRENT (registry)", file: REGISTRY,
    fn: replaceOnce('{ key: "admin.engineering.read", status: "PLANNED",', '{ key: "admin.engineering.read", status: "CURRENT",') },
  { id: "C2", name: "one deferred permission incorrectly added to the application vocabulary", file: VOCAB,
    fn: replaceOnce('"admin.dashboard.counts.read"\n]', '"admin.dashboard.counts.read",\n  "admin.engineering.read"\n]') },
  { id: "D", name: "one required route mapped to the wrong operational permission", file: REGISTRY, fn: setRoute(REGISTRY, "restaurant-menus", ["admin.restaurants.hours.read"]) },
  { id: "E", name: "dashboard mapped to an unrelated broad permission", file: REGISTRY, fn: setRoute(REGISTRY, "dashboard", ["admin.management.read"]) },
  { id: "E2", name: "dashboard hub mapped to the restaurant read permission", file: REGISTRY, fn: setRoute(REGISTRY, "dashboard", ["admin.restaurants.read"]) },
  { id: "F", name: "a blanket permission accidentally added to the registry", file: REGISTRY,
    fn: replaceOnce('  { key: "admin.dashboard.counts.read", status: "CURRENT",', '  { key: "admin.read", status: "CURRENT", description: "blanket" },\n  { key: "admin.dashboard.counts.read", status: "CURRENT",') },
  { id: "F2", name: "a blanket permission accidentally added to the vocabulary", file: VOCAB,
    fn: replaceOnce('"admin.dashboard.counts.read"\n]', '"admin.dashboard.counts.read",\n  "admin.read"\n]') },
  { id: "G", name: "migration inserts an umbrella catalogue key", file: MIGRATION,
    fn: replaceOnce("  ('admin.social.policies.read', 'PUBLIC')\n", "  ('admin.social.policies.read', 'PUBLIC'),\n  ('admin_all.read', 'RESTAURANT_OPERATIONAL')\n") },
  { id: "H", name: "migration makes the new keys supervisor-delegable instead of privileged-only", file: MIGRATION,
    fn: replaceOnce("'current', v.sensitivity_class, true, true, false, true, false, false", "'current', v.sensitivity_class, true, true, true, false, false, false") },
  { id: "I", name: "migration silently grants an entitlement (default grant)", file: MIGRATION,
    fn: replaceOnce("reset role;\nrevoke staff_authority_write_authority", "insert into admin_internal.staff_permission_entitlements (staff_account_id, permission_key) select id, 'admin.restaurants.read' from admin_internal.staff_accounts;\nreset role;\nrevoke staff_authority_write_authority") },
  { id: "J", name: "ADMIN-A branch status route remapped", file: REGISTRY, fn: setRoute(REGISTRY, "restaurant-branch-status", ["admin_context.read"]) },
  { id: "K", name: "migration loses its no-grant postcondition", file: MIGRATION,
    fn: replaceOnce("ae1_unexpected_grant_present", "ae1_removed") },
  { id: "L", name: "one AE1 key missing from the application vocabulary", file: VOCAB,
    fn: replaceOnce('  "admin.social.policies.read",\n', "") },
  { id: "M", name: "migration updates an existing predecessor catalogue row", file: MIGRATION,
    fn: replaceOnce("-- Fail-closed postconditions", "update admin_internal.staff_permission_catalog set readiness_status = 'current' where permission_key = 'admin.management.staff.bundle.write';\n-- Fail-closed postconditions") }
];

function runGuard() {
  const r = child.spawnSync("node", [GUARD], { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 1 << 26 });
  return { status: r.status, out: r.stdout ?? "" };
}

const results = [];
try {
  const baseline = runGuard();
  results.push({ id: "baseline", name: "unmutated guard passes", pass: baseline.status === 0 });
  console.log(`${baseline.status === 0 ? "PASS" : "FAIL"} baseline unmutated guard passes`);
  for (const mutant of mutants) {
    let killed = false, note = "";
    try {
      restore();
      const mutated = mutant.fn(original.get(mutant.file));
      if (mutated === original.get(mutant.file)) throw new Error("mutation changed nothing");
      fs.writeFileSync(path.join(ROOT, mutant.file), mutated);
      const run = runGuard();
      killed = run.status !== 0;
      note = killed ? (JSON.parse(run.out.slice(run.out.lastIndexOf("{\n  \"suite\""))).failures?.[0] ?? "") : "SURVIVED";
    } catch (error) { note = `harness error: ${String(error?.message ?? error).slice(0, 120)}`; }
    finally { restore(); }
    results.push({ id: mutant.id, name: mutant.name, pass: killed });
    console.log(`${killed ? "KILLED" : "FAIL"} ${mutant.id} ${mutant.name}${note ? ` -> ${note}` : ""}`);
  }
} finally { restore(); }

const identical = files.every((f) => sha(fs.readFileSync(path.join(ROOT, f), "utf8")) === sha(original.get(f)));
const after = runGuard();
results.push({ id: "restore", name: "tree byte-identical and unmutated guard passes again", pass: identical && after.status === 0 });
console.log(`${identical && after.status === 0 ? "PASS" : "FAIL"} restore tree byte-identical and guard passes again`);
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ suite: "admin-operational-read-permissions-ae1-mutations", mutants: mutants.length,
  killed: mutants.length - failed.filter((r) => r.id !== "baseline" && r.id !== "restore").length, failed: failed.length,
  failures: failed.map((r) => `${r.id} ${r.name}`) }, null, 2));
process.exitCode = failed.length ? 1 : 0;
