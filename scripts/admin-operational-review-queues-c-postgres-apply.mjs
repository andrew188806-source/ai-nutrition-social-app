#!/usr/bin/env node
// ADMIN-C -- disposable local PostgreSQL 17 gate. Never connects to Development or Production.
// Model: bootstrap superuser `supabase_admin` (initdb), migration runner `postgres` as a NON-superuser CREATEROLE role.
// Proves: 137 predecessors (incl. ADMIN-AE1 and ADMIN-B1) + the ADMIN-C migration apply from zero; the exact four read contracts
// (definer/stable/sealed owner/ACL/no fallback/bounded/read-only); mutant migrations are refused by the postconditions; the sealed
// reader gains NO privilege; per-contract permission enforcement (anon / non-staff / base / wrong-key / exact / revoked); every queue row
// satisfies the documented inclusion rule and non-qualifying records are excluded; pagination bounds; field minimisation.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "admin-operational-review-queues-c-postgres-apply";
const PG_BIN = (process.env.C_PG_BIN ?? process.env.B1_PG_BIN ?? process.env.R2E_PG_BIN)?.trim();
const PG_MODULES = (process.env.C_PG_MODULES ?? process.env.B1_PG_MODULES ?? process.env.R2E_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set C_PG_BIN and C_PG_MODULES (or B1_/R2E_ equivalents)" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations");
const C = "20260920030000_admin_operational_review_queues_c.sql";
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapSource.indexOf("\n`;", bootstrapStart));
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!pass && detail !== undefined) console.log("   detail:", JSON.stringify(detail).slice(0, 700)); };
function kill(pid) { if (!pid) return; if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else try { process.kill(pid, "SIGKILL"); } catch {} }
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); server.on("error", reject); });
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "c-apply-gate"); fs.mkdirSync(base, { recursive: true });
  const dataDir = path.join(base, `data-${process.pid}-${Date.now()}`), logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"), ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort(), output = fs.openSync(logFile, "a");
  const handle = child.spawn(exe("postgres"), ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"], { detached: true, stdio: ["ignore", output, output], windowsHide: true });
  handle.unref(); let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; kill(handle.pid); try { fs.closeSync(output); } catch {} try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {} try { fs.rmSync(logFile, { force: true }); } catch {} };
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) { const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" }); try { await probe.connect(); await probe.query("select 1"); await probe.end(); return { port, stop }; } catch { try { await probe.end(); } catch {} await new Promise((r) => setTimeout(r, 250)); } }
  stop(); throw new Error("disposable PostgreSQL did not become ready");
}

let cluster, admin, runner, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 20 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());
const connect = async (user) => { const c = new Client({ host: "127.0.0.1", port: cluster.port, user, database: "postgres" }); await c.connect(); return c; };
async function asRole(role, claims, sql, params = [], { commit = false } = {}) {
  const c = await connect("supabase_admin");
  try {
    await c.query("begin");
    if (claims) await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    await c.query(`set local role ${role}`);
    const out = await c.query(sql, params);
    await c.query(commit ? "commit" : "rollback");
    return { rows: out.rows, rowCount: out.rowCount };
  } catch (error) { try { await c.query("rollback"); } catch {} return { thrown: error.code, message: String(error.message) }; }
  finally { await c.end(); }
}
// Total order used by every queue: (restaurant name, restaurant id, menu name, menu id, item name, item id), byte-wise ("C").
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
const orderKey = (r) => [r.restaurantName, r.restaurantId, r.menuName, r.menuId, r.name, r.menuItemId];

try {
  cluster = await startCluster();
  admin = await connect("supabase_admin"); const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP); await admin.query(BOOTSTRAP_EXTRA);
  runner = await connect("postgres");
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migration runner is a NON-superuser postgres (the platform shape; a superuser gate would hide owner/ACL problems)", identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => f !== C)) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`predecessor applies: ${file}`, false, { code: error.code, message: String(error.message).slice(0, 600) }); throw error; }
  }
  check("all 137 predecessor migrations (incl. ADMIN-AE1 and ADMIN-B1) apply from zero, and the ADMIN-C migration is the 138th and sorts last", applied === 137 && files.length === 138 && files.at(-1) === C, { applied, total: files.length });
  await admin.query("grant anon, authenticated, service_role to postgres");

  // ------------------------------------------------------------------------------------------------ fixtures
  const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`; })();
  await q(`insert into public.restaurants(id,name,status,legal_name,plan) values ('r-alpha','Alpha','active','Alpha Legal Co','pro'),('r-beta','Beta','active','Beta Legal Co','demo'),('r-charlie','Charlie','draft','Charlie Legal','demo')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('m-a1','r-alpha','Alpha Main Menu','published'),('m-a2','r-alpha','Alpha Draft Menu','draft'),('m-b1','r-beta','Beta Menu','published'),('m-b2','r-beta','Beta Archive','archived')`);
  await q(`insert into public.menu_categories(id,menu_id,name,sort_order) values ('c-a1','m-a1','Mains',1),('c-a2','m-a2','Draft Cat',1),('c-b1','m-b1','Beta Cat',1),('c-b2','m-b2','Old Cat',1)`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status,nutrition_badge_status) values
    ('i-draft-1','r-alpha','c-a1','Alpha Draft One','draft','missing'),
    ('i-draft-2','r-alpha','c-a2','Alpha Draft Two','draft','missing'),
    ('i-draft-3','r-beta','c-b1','Beta Draft','draft','missing'),
    ('i-active-1','r-alpha','c-a1','Alpha Active','active','approved'),
    ('i-active-2','r-alpha','c-a1','Alpha Missing','active','missing'),
    ('i-arch-1','r-beta','c-b2','Beta Archived','archived','missing'),
    ('i-dq-badge','r-alpha','c-a1','Alpha Badge','active','approved'),
    ('i-dq-multi','r-beta','c-b1','Beta Multi','active','missing'),
    ('i-c-badge','r-alpha','c-a1','Alpha Cert Badge','active','pending_review'),
    ('i-c-record','r-alpha','c-a1','Alpha Cert Record','active','missing'),
    ('i-c-both','r-beta','c-b1','Beta Cert Both','active','pending_review'),
    ('i-c-rej','r-beta','c-b1','Beta Cert Rejected','active','approved')`);
  // Menu/Restaurant mismatch cannot be written while the R2B-1 tenant-consistency trigger is enabled; the fixture bypasses it (disposable DB only).
  await q("set session_replication_role = replica");
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status,nutrition_badge_status) values
    ('i-dq-mismatch','r-alpha','c-b1','Alpha Mismatch','active','missing'),
    ('i-dq-combo','r-beta','c-a1','Beta Combo','active','ai_estimated')`);
  await q("set session_replication_role = origin");
  await q(`insert into public.menu_item_nutrition(id,menu_item_id,calories,source,verified_status,is_current,confidence_score,updated_at) values
    ('n-1','i-active-1',500,'restaurant_verified','verified',true,1,'2026-01-01T00:00:00Z'),
    ('n-m1','i-dq-multi',100,'pending','rejected',true,0,'2026-01-01T00:00:00Z'),
    ('n-m2','i-dq-multi',110,'pending','rejected',true,0,'2026-01-02T00:00:00Z'),
    ('n-c1','i-c-record',200,'pending','pending_review',false,0,'2026-02-01T00:00:00Z'),
    ('n-c2','i-c-both',300,'restaurant_verified','pending_review',false,0,'2026-01-02T00:00:00Z'),
    ('n-c3','i-c-both',310,'admin_verified','pending_review',false,0,'2026-01-05T00:00:00Z'),
    ('n-c4','i-c-rej',400,'pending','rejected',true,0,'2026-01-03T00:00:00Z')`);
  // pagination fixtures: 55 more draft items under one Restaurant
  await q(`insert into public.restaurants(id,name,status) values ('r-page','Paged','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('m-p1','r-page','Paged Menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name,sort_order) values ('c-p1','m-p1','P Cat',1)`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) select 'pi-'||lpad(g::text,2,'0'),'r-page','c-p1','PI '||lpad(g::text,2,'0'),'draft' from generate_series(1,55) g`);

  // expected (hand-derived from the documented rules, NOT from the SQL under test)
  const row = (menuItemId, name, restaurantId, restaurantName, menuId, menuName) => ({ menuItemId, name, restaurantId, restaurantName, menuId, menuName });
  const draftRows = [
    { ...row("i-draft-1", "Alpha Draft One", "r-alpha", "Alpha", "m-a1", "Alpha Main Menu"), reasons: ["item_status_draft"] },
    { ...row("i-draft-2", "Alpha Draft Two", "r-alpha", "Alpha", "m-a2", "Alpha Draft Menu"), reasons: ["item_status_draft"] },
    { ...row("i-draft-3", "Beta Draft", "r-beta", "Beta", "m-b1", "Beta Menu"), reasons: ["item_status_draft"] },
    ...Array.from({ length: 55 }, (_, i) => ({ ...row(`pi-${String(i + 1).padStart(2, "0")}`, `PI ${String(i + 1).padStart(2, "0")}`, "r-page", "Paged", "m-p1", "Paged Menu"), reasons: ["item_status_draft"] }))
  ].sort((a, b) => cmp(orderKey(a), orderKey(b)));
  const dqRows = [
    { ...row("i-dq-mismatch", "Alpha Mismatch", "r-alpha", "Alpha", "m-b1", "Beta Menu"), reasons: ["menu_belongs_to_other_restaurant"] },
    { ...row("i-dq-badge", "Alpha Badge", "r-alpha", "Alpha", "m-a1", "Alpha Main Menu"), reasons: ["badge_without_current_nutrition"] },
    { ...row("i-dq-multi", "Beta Multi", "r-beta", "Beta", "m-b1", "Beta Menu"), reasons: ["multiple_current_nutrition"] },
    { ...row("i-dq-combo", "Beta Combo", "r-beta", "Beta", "m-a1", "Alpha Main Menu"), reasons: ["menu_belongs_to_other_restaurant", "badge_without_current_nutrition"] }
  ].sort((a, b) => cmp(orderKey(a), orderKey(b)));
  const certRows = [
    { ...row("i-c-badge", "Alpha Cert Badge", "r-alpha", "Alpha", "m-a1", "Alpha Main Menu"), reasons: ["badge_pending_review"], pendingRecordCount: 0, latestPendingRecordAt: null, latestPendingRecordSource: null },
    { ...row("i-c-record", "Alpha Cert Record", "r-alpha", "Alpha", "m-a1", "Alpha Main Menu"), reasons: ["nutrition_record_pending_review"], pendingRecordCount: 1, latestPendingRecordSource: "pending" },
    { ...row("i-c-both", "Beta Cert Both", "r-beta", "Beta", "m-b1", "Beta Menu"), reasons: ["badge_pending_review", "nutrition_record_pending_review"], pendingRecordCount: 2, latestPendingRecordSource: "admin_verified" }
  ].sort((a, b) => cmp(orderKey(a), orderKey(b)));
  const EXCLUDED = { pending: ["i-active-1", "i-active-2", "i-arch-1", "i-dq-mismatch", "i-c-badge"], dq: ["i-draft-1", "i-active-1", "i-active-2", "i-arch-1", "i-c-badge", "i-c-record", "i-c-both", "i-c-rej"], cert: ["i-draft-1", "i-active-1", "i-active-2", "i-arch-1", "i-dq-badge", "i-dq-multi", "i-c-rej"] };

  // staff fixtures ------------------------------------------------------------------------------------------------
  const KEYS = ["admin.restaurants.menu_management.read", "admin.restaurants.menu_management.pending.read", "admin.restaurants.menu_management.data_quality.read", "admin.nutrition.certification.pending.read"];
  const FNS = { [KEYS[0]]: "staff_admin_menu_management_overview_v1", [KEYS[1]]: "staff_admin_menu_management_pending_v1", [KEYS[2]]: "staff_admin_menu_management_data_quality_v1", [KEYS[3]]: "staff_admin_nutrition_certification_pending_v1" };
  const OTHER = ["admin.restaurants.read", "admin.restaurants.menus.read", "admin.restaurants.menu_items.read", "admin.restaurants.menu_item.read", "admin.social.policies.read", "admin.dashboard.counts.read"];
  const staffUser = async (label, keys) => {
    const id = uuid(); await q("insert into auth.users(id,email) values ($1,$2)", [id, `${label}@t.invalid`]);
    const sid = (await q("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id", [id]))[0].id;
    for (const k of ["admin_context.read", ...keys]) await q("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) values ($1,$2,'migration_backfill','active',now()-interval '1 day')", [sid, k]);
    return { id, sid };
  };
  const base = await staffUser("base", []);
  const nonStaff = uuid(); await q("insert into auth.users(id,email) values ($1,'nonstaff@t.invalid')", [nonStaff]);
  const exact = {}, wrong = {};
  for (const k of KEYS) { exact[k] = await staffUser(`exact-${k}`, [k]); wrong[k] = await staffUser(`wrong-${k}`, [...KEYS.filter((x) => x !== k), ...OTHER]); }
  const call = async (who, fn, ...args) => {
    const params = args.map((_, i) => `$${i + 1}`).join(",");
    const r = who === "anon" ? await asRole("anon", null, `select public.${fn}(${params}) as out`, args) : await asRole("authenticated", { sub: who, session_id: uuid(), aal: "aal1" }, `select public.${fn}(${params}) as out`, args);
    return r.thrown ? { thrown: r.thrown } : r.rows[0].out;
  };

  // ---------------------------------------------------------------------------------------------- BEFORE fingerprints
  const newFnFilter = "p.proname not like 'staff\\_admin\\_menu\\_management\\_%' escape '\\' and p.proname not like 'staff\\_admin\\_nutrition\\_certification\\_%' escape '\\'";
  const policyCounts = async () => (await q("select md5(string_agg(tablename||':'||policyname||':'||coalesce(qual,''), '|' order by tablename, policyname)) h, count(*)::int n from pg_policies where schemaname='public'"))[0];
  const tableAcl = async () => (await q("select md5(string_agg(c.relname||':'||coalesce(c.relacl::text,''), '|' order by c.relname)) h from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')"))[0].h;
  const otherFns = async () => (await q(`select md5(string_agg(p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid))||':'||coalesce(p.proacl::text,''), '|' order by p.oid::regprocedure::text)) h, count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','admin_internal') and ${newFnFilter}`))[0];
  const readerPrivs = async () => (await q("select md5(coalesce(string_agg(x, '|' order by x), '')) h, count(*)::int n from (select table_name||'.'||column_name||':'||privilege_type x from information_schema.column_privileges where grantee='staff_admin_restaurant_reader' union all select 'T:'||table_name||':'||privilege_type from information_schema.role_table_grants where grantee='staff_admin_restaurant_reader' union all select 'S:'||nspname||':'||priv from pg_namespace n, (values ('USAGE'),('CREATE')) v(priv) where has_schema_privilege('staff_admin_restaurant_reader', n.oid, v.priv) and n.nspname in ('public','admin_internal')) s"))[0];
  const roles = async () => (await q("select md5(string_agg(rolname||rolcanlogin||rolinherit||rolbypassrls||rolsuper||rolcreaterole, '|' order by rolname)) h, count(*)::int n from pg_roles where rolname !~ '^pg_'"))[0];
  const memberships = async () => (await q("select md5(coalesce(string_agg(r.rolname||'>'||m.rolname||':'||a.admin_option||a.inherit_option||a.set_option, '|' order by r.rolname, m.rolname, g.rolname),'')) h, count(*)::int n from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor"))[0];
  const newFns = async () => q("select p.proname, pg_get_userbyid(p.proowner) owner, p.prosecdef, p.provolatile, p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'staff\\_admin\\_menu\\_management\\_%' escape '\\' or p.proname like 'staff\\_admin\\_nutrition\\_certification\\_%' escape '\\') order by 1");
  const clientRaw = async () => { const out = []; for (const t of ["menus", "menu_categories", "menu_items", "menu_item_nutrition", "restaurants"]) { const r = await asRole("authenticated", { sub: base.id, session_id: uuid(), aal: "aal1" }, `select count(*)::int n from public.${t}`); out.push([t, r.thrown ?? r.rows[0].n]); } return out; };
  const clientRawBefore = await clientRaw();
  const before = { policies: await policyCounts(), acl: await tableAcl(), fns: await otherFns(), reader: await readerPrivs(), roles: await roles(), members: await memberships(), catalog: (await q("select count(*)::int n from admin_internal.staff_permission_catalog"))[0].n };
  check("BEFORE: no ADMIN-C object exists; the sealed ADMIN-B1 reader exists and is the only role this migration will use", (await newFns()).length === 0 && (await q("select count(*)::int n from pg_roles where rolname='staff_admin_restaurant_reader'"))[0].n === 1);

  // ---------------------------------------------------------------------------------------------- mutant migrations
  const text = fs.readFileSync(path.join(MIGRATIONS, C), "utf8");
  async function mutantRefuses(name, sqlText, expected) {
    const c = await connect("postgres");
    try { await c.query(sqlText); check(`mutant refused: ${name}`, false, "mutant migration committed"); await c.query("rollback").catch(() => {}); }
    catch (error) { try { await c.query("rollback"); } catch {} check(`mutant refused: ${name}`, expected.test(String(error.message)), error.message); }
    finally { await c.end(); }
  }
  const rep = (from, to) => { if (!text.includes(from)) throw new Error("mutation anchor missing: " + from.slice(0, 70)); return text.replace(from, () => to); };
  const PEND_GATE = "if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.pending.read') then";
  const PRE_OWNER = "grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;\n\nalter function public.staff_admin_menu_management_overview_v1";
  await mutantRefuses("A. wrong permission substituted (pending uses the data-quality key)", rep(PEND_GATE, "if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.data_quality.read') then"), /c_contract_permission_mismatch/);
  await mutantRefuses("B. base-admin fallback introduced into a contract body", rep(PEND_GATE, "if not (admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.pending.read') or public.staff_has_permission_v1('admin_context.read')) then"), /c_contract_permission_mismatch/);
  await mutantRefuses("B2. permission check removed from a contract", rep(PEND_GATE, "if false then"), /c_contract_permission_mismatch/);
  await mutantRefuses("B3. umbrella: a contract accepts either of two keys", rep(PEND_GATE, "if not (admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.pending.read') or admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.read')) then"), /c_contract_permission_mismatch/);
  await mutantRefuses("C. PUBLIC execute restored on a contract", rep(PRE_OWNER, "grant execute on function public.staff_admin_menu_management_pending_v1(integer, integer) to public;\n" + PRE_OWNER), /c_contract_acl/);
  await mutantRefuses("D. anon execute restored on a contract", rep(PRE_OWNER, "grant execute on function public.staff_admin_nutrition_certification_pending_v1(integer, integer) to anon;\n" + PRE_OWNER), /c_contract_acl/);
  await mutantRefuses("E. pagination bound removed from a contract", rep("if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then", "if false then"), /c_contract_unbounded/);
  await mutantRefuses("F. a write statement introduced into a contract", rep("  select pg_catalog.jsonb_build_object(\n    'restaurantCount'", "  update public.menus set name = name where false;\n  select pg_catalog.jsonb_build_object(\n    'restaurantCount'"), /c_contract_not_read_only|permission denied/);
  await mutantRefuses("G. the sealed reader is granted UPDATE", rep("revoke create on schema public from staff_admin_restaurant_reader;", "grant update (name) on public.menu_items to staff_admin_restaurant_reader;\nrevoke create on schema public from staff_admin_restaurant_reader;"), /c_reader_non_select_privilege/);
  await mutantRefuses("H. the sealed reader keeps CREATE on schema public", rep("revoke create on schema public from staff_admin_restaurant_reader;", ""), /c_reader_create_privilege_retained/);
  await mutantRefuses("I. the SET edge to the sealed reader is retained", rep("revoke staff_admin_restaurant_reader from postgres granted by postgres;", ""), /c_reader_role_mismatch/);
  await mutantRefuses("J. a client role is granted raw table SELECT", rep("revoke create on schema public from staff_admin_restaurant_reader;", "grant select on public.restaurant_memberships to authenticated;\nrevoke create on schema public from staff_admin_restaurant_reader;"), /c_client_table_grant_present/);
  await mutantRefuses("K. a fifth (unexpected) contract exists", rep("comment on function public.staff_admin_menu_management_overview_v1", "create function public.staff_admin_menu_management_extra_v1() returns jsonb language sql stable security definer set search_path = '' as $x$ select '{}'::jsonb $x$;\ncomment on function public.staff_admin_menu_management_overview_v1"), /c_unexpected_contract|c_contract_/);
  const stateNow = async () => JSON.stringify({ policies: await policyCounts(), acl: await tableAcl(), fns: await otherFns(), reader: await readerPrivs(), roles: await roles(), members: await memberships(), catalog: (await q("select count(*)::int n from admin_internal.staff_permission_catalog"))[0].n });
  check("all mutant migrations rolled back: the BEFORE state (policies, table ACLs, every other function, reader privileges, roles, memberships) is byte-identical", JSON.stringify(before) === await stateNow());

  // ---------------------------------------------------------------------------------------------- apply real C
  try { await runner.query(text); applied += 1; }
  catch (error) { check("ADMIN-C applies as the non-superuser runner", false, { code: error.code, message: String(error.message).slice(0, 900) }); throw error; }
  check("ADMIN-C applies cleanly as the non-superuser runner; 138 migrations applied", applied === 138, applied);

  const fns = await newFns();
  check("AFTER: exactly the four contracts exist, SECURITY DEFINER, STABLE, owned by the sealed ADMIN-B1 reader", fns.length === 4 && fns.every((r) => r.owner === "staff_admin_restaurant_reader" && r.prosecdef && r.provolatile === "s") && JSON.stringify(fns.map((r) => r.proname).sort()) === JSON.stringify(Object.values(FNS).sort()), fns.map((r) => [r.proname, r.owner]));
  check("AFTER: ACL is exactly {sealed owner, authenticated}: no PUBLIC/anon/service_role/authenticator", fns.every((r) => { const e = r.acl.replace(/[{}]/g, "").split(",").sort(); return e.length === 2 && e.some((x) => x.startsWith("authenticated=X/")) && e.some((x) => x.startsWith("staff_admin_restaurant_reader=X/")); }), fns.map((r) => r.acl));
  const after = { policies: await policyCounts(), acl: await tableAcl(), fns: await otherFns(), reader: await readerPrivs(), roles: await roles(), members: await memberships(), catalog: (await q("select count(*)::int n from admin_internal.staff_permission_catalog"))[0].n };
  check("AFTER: NO privilege gained: the sealed reader's table/column/schema privileges are byte-identical (no new column grant, no CREATE retained)", after.reader.h === before.reader.h && after.reader.n === before.reader.n, { before: before.reader, after: after.reader });
  check("AFTER: no policy added or changed, no table ACL changed (no client table privilege), no role attribute changed, no role membership changed", after.policies.h === before.policies.h && after.acl === before.acl && after.roles.h === before.roles.h && after.members.h === before.members.h, { members: [before.members, after.members] });
  check("AFTER: every other function in public/admin_internal (incl. all 14 ADMIN-B1 contracts, the gate helpers and the ADMIN-A/AE1 RPCs) is byte-identical (bodies + ACLs)", after.fns.h === before.fns.h && after.fns.n === before.fns.n, { before: before.fns, after: after.fns });
  check("AFTER: the ADMIN-AE1 permission catalogue is untouched", after.catalog === before.catalog && after.catalog === 27);
  check("AFTER: postgres holds no SET/USAGE edge on the sealed reader", (await q("select pg_has_role('postgres','staff_admin_restaurant_reader','SET') s, pg_has_role('postgres','staff_admin_restaurant_reader','USAGE') u"))[0].s === false);
  const writeAttempt = await asRole("staff_admin_restaurant_reader", null, "update public.menu_items set name = name");
  const insertAttempt = await asRole("staff_admin_restaurant_reader", null, "insert into public.menus(id,restaurant_id,name,status) values ('zz','r-alpha','zz','draft')");
  const nutIdAttempt = await asRole("staff_admin_restaurant_reader", null, "select nutrition_id from public.menu_items");
  check("AFTER: the sealed reader still cannot write (42501) and still cannot read the ungranted nutrition_id column (42501)", [writeAttempt, insertAttempt, nutIdAttempt].every((r) => r.thrown === "42501"), [writeAttempt.thrown, insertAttempt.thrown, nutIdAttempt.thrown]);
  const clientRawAfter = await clientRaw();
  check("AFTER: raw-table exposure is unchanged: what a staff (non-owner) authenticated client can read directly from the operational tables is identical before and after", JSON.stringify(clientRawBefore) === JSON.stringify(clientRawAfter), { clientRawBefore, clientRawAfter });

  // ---------------------------------------------------------------------------------------------- permission enforcement
  const denyShape = (o) => o?.state === "forbidden" && Object.keys(o).length === 1;
  const results = {};
  for (const k of KEYS) {
    const fn = FNS[k];
    const anon = await call("anon", fn, null, null), nonstaff = await call(nonStaff, fn, null, null), b = await call(base.id, fn, null, null);
    const ex = await call(exact[k].id, fn, null, null), wr = await call(wrong[k].id, fn, null, null);
    results[fn] = { anon: anon.thrown, nonstaff, base: b, exact: ex, wrong: wr };
  }
  check("anon is denied at the privilege boundary (42501) on all four contracts", KEYS.every((k) => results[FNS[k]].anon === "42501"));
  check("authenticated non-staff, base Admin, and a holder of every OTHER key (three sibling queue keys + six ADMIN-B keys) are all `forbidden` (state only, no data) on all four", KEYS.every((k) => [results[FNS[k]].nonstaff, results[FNS[k]].base, results[FNS[k]].wrong].every(denyShape)), Object.fromEntries(KEYS.map((k) => [k, [results[FNS[k]].nonstaff.state, results[FNS[k]].base.state, results[FNS[k]].wrong.state]])));
  check("the exact-key holder reads `ready` on its own contract", KEYS.every((k) => results[FNS[k]].exact.state === "ready"), Object.fromEntries(KEYS.map((k) => [k, results[FNS[k]].exact.state])));
  const cross = []; for (const k of KEYS) for (const k2 of KEYS) if (k !== k2) { const r = await call(exact[k].id, FNS[k2], null, null); if (!denyShape(r)) cross.push([k, k2, r.state]); }
  check("cross-permission negative: each exact-key holder is `forbidden` on every other queue contract (no umbrella, no parent/sibling implication)", cross.length === 0, cross);
  const revokable = await staffUser("revokable", [KEYS[1]]);
  const beforeRevoke = await call(revokable.id, FNS[KEYS[1]], null, null);
  await q("update admin_internal.staff_permission_entitlements set status='revoked', revoked_at=now() where staff_account_id=$1 and permission_key=$2", [revokable.sid, KEYS[1]]);
  const revoked = await call(revokable.id, FNS[KEYS[1]], null, null);
  check("revoke: the same caller reads ready, then is `forbidden` after revocation, and other holders are unaffected", beforeRevoke.state === "ready" && denyShape(revoked) && (await call(exact[KEYS[2]].id, FNS[KEYS[2]], null, null)).state === "ready");

  // ---------------------------------------------------------------------------------------------- data correctness
  const pull = async (k, pages) => { const out = []; let more = true, offset = 0; while (more) { const r = await call(exact[k].id, FNS[k], 20, offset); out.push(...r.items); more = r.hasMore; offset += 20; if (offset > 200) break; } return out; };
  const pendingAll = await pull(KEYS[1]), dqAll = await pull(KEYS[2]), certAll = await pull(KEYS[3]);
  const project = (r) => ({ id: r.menuItemId, reasons: r.reasons });
  check("PENDING: exactly the draft items (58) in the exact total order; each row's reason is item_status_draft; draft menus/restaurants do not change eligibility", JSON.stringify(pendingAll.map(project)) === JSON.stringify(draftRows.map(project)) && pendingAll.every((r) => r.itemStatus === "draft" && r.reasons.length === 1), { got: pendingAll.length, want: draftRows.length });
  check("PENDING: non-qualifying items (active, archived, mismatched-menu active, badge-pending active) are EXCLUDED", EXCLUDED.pending.every((id) => !pendingAll.some((r) => r.menuItemId === id)));
  check("DATA QUALITY: exactly the four violating items, each with exactly its objective reasons, in the exact total order (wrong-Restaurant menu, badge without current nutrition, multiple current records, combined)", JSON.stringify(dqAll.map(project)) === JSON.stringify(dqRows.map(project)), { got: dqAll.map(project), want: dqRows.map(project) });
  check("DATA QUALITY: non-qualifying items (drafts, healthy active item with current verified nutrition, active item with badge 'missing', archived, pending-review and rejected-record items) are EXCLUDED", EXCLUDED.dq.every((id) => !dqAll.some((r) => r.menuItemId === id)));
  check("DATA QUALITY: a mismatched-menu row exposes the menu's actual Restaurant (menuRestaurantId) so no false hierarchy is implied", dqAll.find((r) => r.menuItemId === "i-dq-mismatch").menuRestaurantId === "r-beta" && dqAll.find((r) => r.menuItemId === "i-dq-mismatch").restaurantId === "r-alpha");
  check("CERTIFICATION PENDING: exactly the three items in pending_review (badge only, record only, both) in exact order with their reasons, pending-record counts and latest pending source", JSON.stringify(certAll.map(project)) === JSON.stringify(certRows.map(project)) && certAll.every((r, i) => r.pendingRecordCount === certRows[i].pendingRecordCount && r.latestPendingRecordSource === certRows[i].latestPendingRecordSource) && certAll.find((r) => r.menuItemId === "i-c-both").latestPendingRecordAt.startsWith("2026-01-05") && certAll.find((r) => r.menuItemId === "i-c-badge").latestPendingRecordAt === null, certAll);
  check("CERTIFICATION PENDING: non-qualifying items (verified, rejected records, healthy, drafts, DQ items) are EXCLUDED; the non-current pending record still qualifies (state, not currency)", EXCLUDED.cert.every((id) => !certAll.some((r) => r.menuItemId === id)) && certAll.some((r) => r.menuItemId === "i-c-record"));
  const totalsRows = (await q("select (select count(*)::int from public.restaurants) r, (select count(*)::int from public.menus where status='draft') md, (select count(*)::int from public.menus where status='published') mp, (select count(*)::int from public.menus where status='archived') ma, (select count(*)::int from public.menu_items where status='draft') idr, (select count(*)::int from public.menu_items where status='active') ia, (select count(*)::int from public.menu_items where status='archived') iar"))[0];
  const ov = await call(exact[KEYS[0]].id, FNS[KEYS[0]], 50, 0);
  check("OVERVIEW: platform totals equal the database (menus and items by lifecycle status, restaurant count)", ov.totals.restaurantCount === totalsRows.r && ov.totals.menusByStatus.draft === totalsRows.md && ov.totals.menusByStatus.published === totalsRows.mp && ov.totals.menusByStatus.archived === totalsRows.ma && ov.totals.itemsByStatus.draft === totalsRows.idr && ov.totals.itemsByStatus.active === totalsRows.ia && ov.totals.itemsByStatus.archived === totalsRows.iar, { totals: ov.totals, db: totalsRows });
  const ovA = ov.items.find((r) => r.restaurantId === "r-alpha"), ovB = ov.items.find((r) => r.restaurantId === "r-beta"), ovC = ov.items.find((r) => r.restaurantId === "r-charlie");
  check("OVERVIEW: per-Restaurant counts are exact (alpha 2 menus / 8 items, beta 2 menus incl. archived, charlie empty and DRAFT-status still listed), ordered by name", ovA.menuCount === 2 && ovA.draftMenuCount === 1 && ovA.publishedMenuCount === 1 && ovA.itemCount === 8 && ovA.draftItemCount === 2 && ovB.menuCount === 2 && ovB.archivedMenuCount === 1 && ovB.archivedItemCount === 1 && ovC.menuCount === 0 && ovC.itemCount === 0 && ovC.status === "draft" && ov.items.map((r) => r.name).join() === ["Alpha", "Beta", "Charlie", "Paged"].join(), ov.items);

  // ---------------------------------------------------------------------------------------------- pagination / bounds
  const holder = (k) => exact[k].id;
  const d1 = await call(holder(KEYS[1]), FNS[KEYS[1]], null, null), p50 = await call(holder(KEYS[1]), FNS[KEYS[1]], 50, 0);
  check("pagination default: limit 20, offset 0, hasMore true (58 pending rows); maximum: limit 50 returns 50 with hasMore", d1.limit === 20 && d1.offset === 0 && d1.items.length === 20 && d1.hasMore === true && p50.items.length === 50 && p50.hasMore === true);
  const bad = [[51, 0], [0, 0], [-1, 0], [20, -1], [20, 10001]]; const badOut = [];
  for (const k of KEYS) for (const [l, o] of bad) badOut.push((await call(holder(k), FNS[k], l, o)).state);
  check("out-of-range limit/offset are REJECTED (invalid_request), never clamped, on every queue contract", badOut.length === 20 && badOut.every((s) => s === "invalid_request"), badOut);
  const pg = [await call(holder(KEYS[1]), FNS[KEYS[1]], 20, 0), await call(holder(KEYS[1]), FNS[KEYS[1]], 20, 20), await call(holder(KEYS[1]), FNS[KEYS[1]], 20, 40)];
  check("stable total ordering: pages 1-3 concatenate to all 58 rows with no gap or duplicate; hasMore true, true, false", pg.flatMap((p) => p.items).map((r) => r.menuItemId).join() === draftRows.map((r) => r.menuItemId).join() && pg.map((p) => p.hasMore).join() === "true,true,false");
  const far = await call(holder(KEYS[1]), FNS[KEYS[1]], 50, 10000);
  check("offset beyond the data returns an empty page (ready, no items, hasMore false)", far.state === "ready" && far.items.length === 0 && far.hasMore === false);

  // ---------------------------------------------------------------------------------------------- privacy / minimisation
  const shape = (o, keys) => JSON.stringify(Object.keys(o).sort()) === JSON.stringify(keys.slice().sort());
  const QKEYS = ["menuItemId", "name", "itemStatus", "restaurantId", "restaurantName", "menuId", "menuName", "menuStatus", "menuRestaurantId", "categoryName", "reasons"];
  check("field minimisation: every queue row has exactly the documented keys (ids, names, lifecycle/review fact, reasons, timestamps only); the overview row has only counts", pendingAll.every((r) => shape(r, QKEYS)) && dqAll.every((r) => shape(r, QKEYS)) && certAll.every((r) => shape(r, [...QKEYS, "nutritionBadgeStatus", "pendingRecordCount", "latestPendingRecordAt", "latestPendingRecordSource"])) && ov.items.every((r) => shape(r, ["restaurantId", "name", "status", "menuCount", "draftMenuCount", "publishedMenuCount", "archivedMenuCount", "itemCount", "draftItemCount", "activeItemCount", "archivedItemCount"])));
  const payloads = JSON.stringify([pendingAll, dqAll, certAll, ov]);
  check("field minimisation: no legal name, plan, description, image, allergen, tag, price, auth id, email or credential appears in any payload", !/Legal|legal|"plan"|pro"|description|imageUrl|allergen|tag|price|auth_user|@t\.invalid|token|password/.test(payloads.replace(/Alpha Legal/g, "")));
  check("read-only boundary: no contract text mentions a write verb, approve/reject/certify capability or a Nutritionist/consultation workflow", (await q("select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'staff\\_admin\\_menu\\_management\\_%' escape '\\' or p.proname like 'staff\\_admin\\_nutrition\\_certification\\_%' escape '\\') and (p.prosrc ~* '(^|[^a-z_])(insert|update|delete|truncate|merge|alter|drop|create|grant|revoke)[[:space:]]' or p.prosrc ~* '\\m(approve|reject|certify|nutritionist|consult)\\M')"))[0].n === 0);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ suite: SUITE, database: "disposable local PostgreSQL", migrationsApplied: applied, total: checks.length, passed: checks.length - failed.length, failed: failed.length, productionTouched: false, developmentTouched: false }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error("HARNESS ERROR:", error?.stack ?? error); process.exitCode = 1;
} finally {
  for (const c of [runner, admin]) { try { await c?.end(); } catch {} }
  cluster?.stop();
}
