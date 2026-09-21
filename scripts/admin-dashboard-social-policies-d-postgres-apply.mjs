#!/usr/bin/env node
// ADMIN-D disposable PostgreSQL 17 gate. Applies every migration from zero as the repository's
// non-superuser migration runner, then proves exact permission, data, ACL, RLS and read-only behavior.
// It never connects to Development or Production.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "admin-dashboard-social-policies-d-postgres-apply";
const PG_BIN = (process.env.D_PG_BIN ?? process.env.C_PG_BIN ?? process.env.B1_PG_BIN ?? process.env.R2E_PG_BIN)?.trim();
const PG_MODULES = (process.env.D_PG_MODULES ?? process.env.C_PG_MODULES ?? process.env.B1_PG_MODULES ?? process.env.R2E_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set D_PG_BIN and D_PG_MODULES (or C_/B1_/R2E_ equivalents)" }, null, 2));
  process.exit(0);
}

const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const D = "20260921010000_admin_dashboard_social_policy_reads_d.sql";
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapSource.indexOf("\n`;", bootstrapStart));
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!pass && detail !== undefined) console.log("   detail:", JSON.stringify(detail).slice(0, 900));
};
function kill(pid) {
  if (!pid) return;
  if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else try { process.kill(pid, "SIGKILL"); } catch {}
}
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  server.on("error", reject);
});
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "admin-d-apply-gate");
  fs.mkdirSync(base, { recursive: true });
  const dataDir = path.join(base, `data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"), ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const output = fs.openSync(logFile, "a");
  const handle = child.spawn(exe("postgres"), ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1", "-c", `unix_socket_directories=${dataDir}`, "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"], { detached: true, stdio: ["ignore", output, output], windowsHide: true });
  handle.unref();
  let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true; kill(handle.pid);
    try { fs.closeSync(output); } catch {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(logFile, { force: true }); } catch {}
  };
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); await probe.end(); return { port, stop }; }
    catch { try { await probe.end(); } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  let logTail = "";
  try { logTail = fs.readFileSync(logFile, "utf8").slice(-4000); } catch {}
  stop(); throw new Error(`disposable PostgreSQL did not become ready${logTail ? `:\n${logTail}` : ""}`);
}

let cluster, admin, runner, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 20 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());
const connect = async (user) => { const client = new Client({ host: "127.0.0.1", port: cluster.port, user, database: "postgres" }); await client.connect(); return client; };
async function asRole(role, claims, sql, params = []) {
  const client = await connect("supabase_admin");
  try {
    await client.query("begin");
    if (claims) await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    await client.query(`set local role ${role}`);
    const out = await client.query(sql, params);
    await client.query("rollback");
    return { rows: out.rows, rowCount: out.rowCount };
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    return { thrown: error.code, message: String(error.message) };
  } finally { await client.end(); }
}

try {
  cluster = await startCluster();
  admin = await connect("supabase_admin");
  const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP);
  await admin.query(BOOTSTRAP_EXTRA);
  runner = await connect("postgres");
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migration runner is the non-superuser postgres role", identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files.filter((file) => file !== D)) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`predecessor applies: ${file}`, false, { code: error.code, message: String(error.message).slice(0, 700) }); throw error; }
  }
  check("all 138 predecessors apply from zero and ADMIN-D sorts 139th", applied === 138 && files.length === 139 && files.at(-1) === D, { applied, total: files.length, last: files.at(-1) });
  await admin.query("grant anon, authenticated, service_role to postgres");

  const rawAclBefore = await q("select c.relname, c.relacl::text acl from pg_class c where c.oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass) order by 1");
  const authReadBefore = await asRole("authenticated", { sub: "00000000-0000-4000-8000-000000000001" }, "select count(*)::int n from public.social_interest_catalog");

  const text = fs.readFileSync(path.join(MIGRATIONS, D), "utf8");
  try { await runner.query(text); applied += 1; }
  catch (error) { check("ADMIN-D applies as the non-superuser runner", false, { code: error.code, message: String(error.message).slice(0, 900), position: error.position, where: error.where, schema: error.schema, table: error.table, routine: error.routine }); throw error; }
  check("ADMIN-D applies cleanly as migration 139", applied === 139, applied);

  const uuid = (() => { let n = 10; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`; })();
  await q("insert into public.restaurants(id,name,status) values ('d-r','D Restaurant','active')");
  await q("insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name) values ('d-b','d-r','D Branch','active','Asia/Taipei')");
  await q("insert into public.menus(id,restaurant_id,name,status) values ('d-m','d-r','D Menu','published')");
  await q("insert into public.menu_categories(id,menu_id,name,sort_order) values ('d-c','d-m','D Category',1)");
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status,nutrition_badge_status) values
    ('d-draft','d-r','d-c','Draft','draft','missing'),
    ('d-quality','d-r','d-c','Quality','active','approved'),
    ('d-pending','d-r','d-c','Pending','active','pending_review')`);
  await q("insert into public.menu_item_nutrition(id,menu_item_id,source,verified_status,is_current,updated_at) values ('d-n','d-pending','pending','pending_review',false,now())");

  const staffUser = async (label, keys) => {
    const id = uuid();
    await q("insert into auth.users(id,email) values ($1,$2)", [id, `${label}@d.invalid`]);
    const sid = (await q("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id", [id]))[0].id;
    for (const key of ["admin_context.read", ...keys]) await q("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) values ($1,$2,'migration_backfill','active',now()-interval '1 day')", [sid, key]);
    return { id, sid };
  };
  const base = await staffUser("base", []);
  const dashboard = await staffUser("dashboard", ["admin.dashboard.counts.read"]);
  const social = await staffUser("social", ["admin.social.policies.read"]);
  const wrongDashboard = await staffUser("wrong-dashboard", ["admin.social.policies.read"]);
  const wrongSocial = await staffUser("wrong-social", ["admin.dashboard.counts.read"]);
  const revokable = await staffUser("revokable", ["admin.social.policies.read"]);
  const claims = (id) => ({ sub: id, session_id: uuid(), aal: "aal1" });
  const call = async (who, fn, args = [], role = "authenticated") => {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(",");
    const out = await asRole(role, role === "anon" ? null : claims(who), `select public.${fn}(${placeholders}) as out`, args);
    return out.thrown ? { thrown: out.thrown } : out.rows[0].out;
  };
  const dashboardFn = "staff_admin_dashboard_counts_v1";
  const socialFn = "staff_admin_social_policies_v1";
  const deny = (out) => out?.state === "forbidden" && Object.keys(out).length === 1;

  const anonDashboard = await call(null, dashboardFn, [], "anon");
  const anonSocial = await call(null, socialFn, [50, 0], "anon");
  check("anon is denied at the EXECUTE boundary on both contracts", anonDashboard.thrown === "42501" && anonSocial.thrown === "42501", { anonDashboard, anonSocial });
  check("base Admin is admitted but dashboard counts are forbidden", deny(await call(base.id, dashboardFn)));
  check("wrong dashboard permission is forbidden", deny(await call(wrongDashboard.id, dashboardFn)));
  const dashboardOut = await call(dashboard.id, dashboardFn);
  const expectedCounts = { restaurants: 1, branches: 1, menus: 1, menuItems: 3, draftMenuItems: 1, dataQualityMenuItems: 1, nutritionReviewPendingMenuItems: 1 };
  check("exact dashboard permission reads truthful aggregate counts", dashboardOut.state === "ready"
    && Object.keys(expectedCounts).every((key) => dashboardOut.counts?.[key] === expectedCounts[key])
    && Object.keys(dashboardOut.counts ?? {}).length === Object.keys(expectedCounts).length, dashboardOut);

  check("base Admin is forbidden from Social policies", deny(await call(base.id, socialFn, [50, 0])));
  check("wrong Social permission is forbidden", deny(await call(wrongSocial.id, socialFn, [50, 0])));
  const socialOne = await call(social.id, socialFn, [50, 0]);
  const socialTwo = await call(social.id, socialFn, [50, 50]);
  check("exact Social permission reads the canonical 100-row catalog in two bounded pages", socialOne.state === "ready" && socialOne.items.length === 50 && socialOne.hasMore === true && socialTwo.state === "ready" && socialTwo.items.length === 50 && socialTwo.hasMore === false, { first: socialOne.items?.length, second: socialTwo.items?.length });
  const ordered = [...socialOne.items, ...socialTwo.items];
  const sorted = [...ordered].sort((a, b) => a.namespace.localeCompare(b.namespace, "en", { usage: "sort" }) || a.displayOrder - b.displayOrder || a.tagKey.localeCompare(b.tagKey, "en", { usage: "sort" }));
  check("Social payload contains only canonical catalog/label fields in deterministic order", JSON.stringify(ordered) === JSON.stringify(sorted) && ordered.every((item) => Object.keys(item).sort().join() === ["active", "depth", "displayOrder", "labels", "namespace", "parentKey", "selectable", "tagKey"].sort().join() && item.labels.every((label) => Object.keys(label).sort().join() === "label,locale")), ordered[0]);
  const beforeRevoke = await call(revokable.id, socialFn, [50, 0]);
  await q("update admin_internal.staff_permission_entitlements set status='revoked', revoked_at=now() where staff_account_id=$1 and permission_key='admin.social.policies.read'", [revokable.sid]);
  const afterRevoke = await call(revokable.id, socialFn, [50, 0]);
  check("revoking the exact Social permission immediately changes ready to forbidden", beforeRevoke.state === "ready" && deny(afterRevoke));

  const fns = await q("select p.oid::regprocedure::text sig, pg_get_userbyid(p.proowner) owner, p.prosecdef, p.provolatile, p.proconfig, p.proacl::text acl from pg_proc p where p.oid in ('public.staff_admin_dashboard_counts_v1()'::regprocedure,'public.staff_admin_social_policies_v1(integer,integer)'::regprocedure) order by 1");
  check("both contracts are STABLE SECURITY DEFINER with empty search_path and row_security on", fns.length === 2 && fns.every((fn) => fn.prosecdef && fn.provolatile === "s" && fn.proconfig.includes("search_path=\"\"") && fn.proconfig.includes("row_security=on")), fns);
  check("each contract has its intended sealed owner and exact {owner, authenticated} ACL", fns.every((fn) => (fn.sig.startsWith("staff_admin_dashboard") ? fn.owner === "staff_admin_restaurant_reader" : fn.owner === "staff_admin_social_policy_reader") && fn.acl.replace(/[{}]/g, "").split(",").length === 2 && fn.acl.includes("authenticated=X/")), fns);
  const role = (await q("select rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole from pg_roles where rolname='staff_admin_social_policy_reader'"))[0];
  check("Social reader is sealed and has no role edge retained by postgres", role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper && !role.rolcreaterole && !(await q("select pg_has_role('postgres','staff_admin_social_policy_reader','SET') s"))[0].s, role);
  const schemaCreate = (await q("select has_schema_privilege('staff_admin_social_policy_reader','public','CREATE') social_public, has_schema_privilege('staff_admin_social_policy_reader','admin_internal','CREATE') social_private, has_schema_privilege('staff_admin_restaurant_reader','public','CREATE') restaurant_public"))[0];
  check("both sealed readers released their temporary schema CREATE privilege", !schemaCreate.social_public && !schemaCreate.social_private && !schemaCreate.restaurant_public, schemaCreate);
  const writeCodes = [];
  for (const sql of ["update public.social_interest_catalog set active=active", "insert into public.social_interest_catalog_label(tag_key,locale,label) values ('general-outdoor','x','x')", "delete from public.social_interest_catalog_label"]) writeCodes.push((await asRole("staff_admin_social_policy_reader", null, sql)).thrown);
  check("sealed Social reader cannot update, insert or delete", writeCodes.every((code) => code === "42501"), writeCodes);

  const rawAclAfter = await q("select c.relname, c.relacl::text acl from pg_class c where c.oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass) order by 1");
  const authReadAfter = await asRole("authenticated", claims(social.id), "select count(*)::int n from public.social_interest_catalog");
  check("ADMIN-D adds no client table privilege and preserves H4's existing authenticated Social runtime read", JSON.stringify(rawAclAfter) === JSON.stringify(rawAclBefore) && authReadBefore.rows?.[0]?.n === 100 && authReadAfter.rows?.[0]?.n === 100, { before: rawAclBefore, after: rawAclAfter });
  const policies = await q("select tablename, policyname, cmd, permissive, roles::text from pg_policies where policyname like '%admin_policy_reader_read' order by 1");
  check("only two permissive SELECT policies were added, both scoped to the sealed Social reader", policies.length === 2 && policies.every((policy) => policy.cmd === "SELECT" && policy.permissive === "PERMISSIVE" && policy.roles === "{staff_admin_social_policy_reader}"), policies);

  const failed = checks.filter((item) => !item.pass);
  console.log(JSON.stringify({ suite: SUITE, database: "disposable local PostgreSQL", migrationsApplied: applied, total: checks.length, passed: checks.length - failed.length, failed: failed.length, productionTouched: false, developmentTouched: false }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error("HARNESS ERROR:", error?.stack ?? error); process.exitCode = 1;
} finally {
  for (const client of [runner, admin]) { try { await client?.end(); } catch {} }
  cluster?.stop();
}
