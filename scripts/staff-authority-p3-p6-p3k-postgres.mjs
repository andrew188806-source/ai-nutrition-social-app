#!/usr/bin/env node
// P3K mandatory fresh-apply-from-zero proof: all 127 repository migrations, on a disposable real
// PostgreSQL 17 cluster, from an empty data directory, through COMMIT, then destroyed. Reuses the
// exact lifecycle-hardened disposable-cluster technique already proven in this repository by
// scripts/social-final-sr2k-b-postgres-apply.mjs (tree-kill teardown on every exit path, stray
// reaping, a fail-closed watchdog) and the frozen Supabase platform-surface bootstrap already proven
// by scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs and reused unmodified by
// scripts/staff-authority-p3-p6-p3h-postgres.mjs. No remote database is addressed.
//
// Opt-in: needs PostgreSQL 17.x binaries that are not part of this repository.
//   P3K_PG_BIN      directory containing initdb(.exe)/postgres(.exe)/pg_ctl(.exe)
//   P3K_PG_MODULES  directory containing a node_modules with the `pg` client
// Provision with `npm install embedded-postgres@17.6.0-beta.15` into a scratch directory (matches
// Development's PostgreSQL 17.6 exactly). Without them this reports `skipped`, never a false pass.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "staff-authority-p3-p6-p3k-postgres";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.P3K_PG_BIN?.trim();
const PG_MODULES = process.env.P3K_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE, status: "skipped",
    reason: "set P3K_PG_BIN and P3K_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
  }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");

const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapSource.indexOf("\n`;", bootstrapStart);
if (bootstrapStart < "const BOOTSTRAP = `".length || bootstrapEnd < bootstrapStart) throw new Error("frozen PostgreSQL bootstrap unavailable");
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapEnd);
// P3H's Step-Up validator reads auth.sessions, which the frozen bootstrap does not create.
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

// --- disposable cluster (lifecycle copied from social-final-sr2k-b-postgres-apply.mjs) ------------
const ACTIVE = new Set();
let guardsInstalled = false;
function treeKill(pid) {
  if (!pid) return;
  if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } } }
}
function removeDir(dir) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) { try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { /* handles closing */ } }
}
function installGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;
  const teardown = () => { for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } } };
  process.on("exit", teardown);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { teardown(); process.exit(130); });
  process.on("uncaughtException", (error) => { teardown(); console.error(error); process.exit(1); });
  process.on("unhandledRejection", (error) => { teardown(); console.error(error); process.exit(1); });
}
function reapStrays(workDir) {
  if (!fs.existsSync(workDir)) return;
  for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("p3k-data-")) {
      const pidFile = path.join(workDir, entry.name, "postmaster.harness.pid");
      if (fs.existsSync(pidFile)) treeKill(Number(fs.readFileSync(pidFile, "utf8").trim()));
      removeDir(path.join(workDir, entry.name));
    }
  }
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
    server.on("error", reject);
  });
}
async function startCluster(workDir) {
  installGuards();
  const dataDir = path.join(workDir, `p3k-data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"), ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const out = fs.openSync(logFile, "a");
  const server = child.spawn(exe("postgres"), ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"], { detached: true, windowsHide: true, stdio: ["ignore", out, out] });
  server.unref();
  fs.writeFileSync(path.join(dataDir, "postmaster.harness.pid"), String(server.pid));
  let stopped = false;
  const cluster = { port, stop() { if (stopped) return; stopped = true; ACTIVE.delete(cluster); treeKill(server.pid); try { fs.closeSync(out); } catch { /* closed */ } removeDir(dataDir); try { fs.rmSync(logFile, { force: true }); } catch { /* in use */ } } };
  ACTIVE.add(cluster);
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); ready = true; } catch { /* starting */ }
    try { await probe.end(); } catch { /* never connected */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) { cluster.stop(); throw new Error(`postgres did not become ready\n${fs.readFileSync(logFile, "utf8").slice(-1500)}`); }
  return cluster;
}

// --- assertions --------------------------------------------------------------------------------
const checks = []; const failures = [];
function check(pass, name, detail) { const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 800)}`); }

const workDir = path.join(PG_MODULES, "..");
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error(`WATCHDOG: ${SUITE} exceeded ${WATCHDOG_MS}ms — tearing down and failing closed`);
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

let cluster; let client; let runner; let applied = 0;
try {
  cluster = await startCluster(workDir);
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  await client.query(BOOTSTRAP);
  await client.query(BOOTSTRAP_EXTRA);

  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check(identity.current_user === "postgres" && identity.superuser === "off", "migrations are applied by a non-superuser runner, as Development applies them", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  check(files.length === 127, "exactly 127 migration files present before apply", files.length);
  for (const file of files) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(false, `migration applies through COMMIT: ${file}`, { code: error.code, position: error.position, message: String(error.message).slice(0, 300) }); throw error; }
  }
  check(applied === 127 && applied === files.length, "all 127 migrations apply from an empty cluster through COMMIT", { applied, total: files.length });

  const vocab = (await client.query("select permission_key from admin_internal.staff_permission_catalog where lifecycle_status = 'active' and readiness_status = 'current' order by permission_key")).rows.map((r) => r.permission_key);
  const expectedVocab = ["admin.management.permissions.read", "admin.management.read", "admin.management.staff.read", "admin.management.staff.account.write", "admin.management.staff.console_admission.write", "admin.management.staff.delegation.write", "admin.management.staff.permission.write", "admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"].sort();
  check(JSON.stringify(vocab) === JSON.stringify(expectedVocab), "exact final CURRENT permission vocabulary (ten keys) after a from-zero apply", vocab);
  const bundleWrite = (await client.query("select readiness_status from admin_internal.staff_permission_catalog where permission_key = 'admin.management.staff.bundle.write'")).rows[0];
  check(bundleWrite?.readiness_status === "planned", "admin.management.staff.bundle.write remains PLANNED after a from-zero apply", bundleWrite);

  const p3iRpcs = (await runner.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('staff_management_list_staff_v1','staff_management_staff_detail_v1','staff_management_staff_authority_v1','staff_management_permission_catalog_v1') and has_function_privilege('authenticated', p.oid, 'EXECUTE')")).rows[0].n;
  check(p3iRpcs === 4, "all four P3I read RPCs exist and are callable by authenticated", p3iRpcs);
  const p3jRpcs = (await runner.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('staff_management_receipt_use_log_v1','staff_management_security_outbox_v1') and has_function_privilege('authenticated', p.oid, 'EXECUTE')")).rows[0].n;
  check(p3jRpcs === 2, "both P3J read RPCs exist and are callable by authenticated", p3jRpcs);
  const sealedRole = (await runner.query("select rolcanlogin, rolinherit, rolbypassrls from pg_roles where rolname = 'staff_management_read_authority'")).rows[0];
  check(sealedRole && !sealedRole.rolcanlogin && !sealedRole.rolinherit && !sealedRole.rolbypassrls, "the P3I/P3J sealed read role is NOLOGIN NOINHERIT NOBYPASSRLS", sealedRole);
  const readTables = (await runner.query("select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'admin_internal' and relname in ('staff_accounts','staff_permission_entitlements','staff_permission_delegations','staff_console_admission_grants','staff_privileged_permission_grants','staff_permission_catalog','staff_step_up_receipt_uses','staff_security_notification_outbox') order by relname")).rows;
  check(readTables.length === 8 && readTables.every((r) => r.relrowsecurity && r.relforcerowsecurity), "every table the P3I/P3J RPCs read enables and forces RLS", readTables);

  const p3hRoles = (await runner.query("select rolname, rolcanlogin, rolinherit, rolbypassrls from pg_roles where rolname like 'staff_step_up_%' order by rolname")).rows;
  check(p3hRoles.length === 3 && p3hRoles.every((r) => !r.rolcanlogin && !r.rolinherit && !r.rolbypassrls), "all three P3H Step-Up roles remain sealed after P3I/P3J", p3hRoles);
  const v1Acl = (await runner.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('staff_management_link_staff_account_v1','staff_management_suspend_staff_account_v1','staff_management_reactivate_staff_account_v1','staff_management_revoke_staff_account_v1','staff_management_grant_permission_delegation_v1','staff_management_revoke_permission_delegation_v1','staff_management_grant_console_admission_v1','staff_management_revoke_console_admission_v1','staff_management_grant_privileged_permission_v1','staff_management_revoke_privileged_permission_v1') and has_function_privilege('authenticated', p.oid, 'EXECUTE')")).rows[0].n;
  const v2Acl = (await runner.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'staff_management_%_v2' and has_function_privilege('authenticated', p.oid, 'EXECUTE')")).rows[0].n;
  check(v1Acl === 0 && v2Acl === 10, "P3H protected v1 ACL closed and exactly ten v2 wrappers callable, unaffected by P3I/P3J", { v1Acl, v2Acl });
  const bgFns = (await runner.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'admin_internal' and p.proname like 'staff_break_glass_%'")).rows[0].n;
  check(bgFns > 0, "P3G break-glass functions remain present after a from-zero apply", bgFns);

  const identities = (await client.query("select (select count(*)::int from auth.users) users, (select count(*)::int from admin_internal.staff_accounts) staff_accounts, (select count(*)::int from admin_internal.staff_step_up_receipts) receipts")).rows[0];
  check(identities.users === 0 && identities.staff_accounts === 0 && identities.receipts === 0, "zero seeded synthetic identity or authority row exists after a from-zero apply with no fixtures", identities);

  const migrationTableExists = (await runner.query("select to_regclass('supabase_migrations.schema_migrations') as reg")).rows[0].reg;
  check(migrationTableExists === null, "no schema_migrations bookkeeping table is faked or asserted by this proof", migrationTableExists);

  await runner.end(); await client.end(); cluster.stop(); cluster = null;
} catch (error) {
  check(false, "PostgreSQL fresh-apply-from-zero completes without unhandled error", { code: error.code, message: String(error.message).slice(0, 500) });
  console.error(error);
} finally {
  clearTimeout(watchdog);
  if (cluster) cluster.stop();
}
console.log(JSON.stringify({ suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, migrationCount: applied, developmentAccessed: false, productionAccessed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
