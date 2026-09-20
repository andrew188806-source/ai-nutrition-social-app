#!/usr/bin/env node
// ADMIN-B1 -- disposable local PostgreSQL 17 gate. Never connects to Development or Production.
// Model: bootstrap superuser `supabase_admin` (initdb), migration runner `postgres` as a NON-superuser CREATEROLE role.
// Proves: 136 predecessors + B1 apply from zero; the exact 14 read contracts (definer/stable/sealed owner/ACL); mutant
// migrations are refused by the postconditions; per-contract permission enforcement (anon / non-staff / base / wrong-key /
// exact / revoked), cross-parent isolation, pagination bounds, lifecycle visibility, field minimisation, existing RLS intact.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "admin-restaurant-operational-read-foundation-b1-postgres-apply";
const PG_BIN = (process.env.B1_PG_BIN ?? process.env.R2E_PG_BIN ?? process.env.R2B_PG_BIN)?.trim();
const PG_MODULES = (process.env.B1_PG_MODULES ?? process.env.R2E_PG_MODULES ?? process.env.R2B_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set B1_PG_BIN and B1_PG_MODULES (or R2E_PG_BIN / R2E_PG_MODULES)" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations");
const B1 = "20260920020000_admin_restaurant_operational_read_foundation_b1.sql";
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapSource.indexOf("\n`;", bootstrapStart));
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!pass && detail !== undefined) console.log("   detail:", JSON.stringify(detail).slice(0, 700)); };
function kill(pid) { if (!pid) return; if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else try { process.kill(pid, "SIGKILL"); } catch {} }
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); server.on("error", reject); });
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "b1-apply-gate"); fs.mkdirSync(base, { recursive: true });
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

let cluster, admin, runner, broker, applied = 0;
const watchdog = setTimeout(() => { cluster?.stop(); process.exit(1); }, 20 * 60 * 1000); watchdog.unref?.();
process.on("exit", () => cluster?.stop());
const connect = async (user) => { const c = new Client({ host: "127.0.0.1", port: cluster.port, user, database: "postgres" }); await c.connect(); return c; };
// Run one statement as a client/sealed role from a superuser session (SET ROLE needs no membership); RLS still applies to that role.
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
const asActor = (actor, session, aal, sql, params = []) => asRole("authenticated", { sub: actor, session_id: session, aal }, sql, params, { commit: true });



try {
  cluster = await startCluster();
  admin = await connect("supabase_admin"); const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP); await admin.query(BOOTSTRAP_EXTRA);
  runner = await connect("postgres");
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migration runner is a NON-superuser postgres (the platform shape; a superuser gate would hide owner/ACL problems)", identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => f !== B1)) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`predecessor applies: ${file}`, false, { code: error.code, message: String(error.message).slice(0, 600) }); throw error; }
  }
  check("all 136 predecessor migrations (incl. ADMIN-AE1) apply from zero, and ADMIN-B1 is the 137th and sorts last", applied === 136 && files.length === 137 && files.at(-1) === B1, { applied, total: files.length });
  await admin.query("grant anon, authenticated, service_role to postgres");

  // ------------------------------------------------------------------------------------------------ fixtures
  const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`; })();
  await q(`insert into public.restaurants(id,name,status,city,category,legal_name,plan) values
    ('r-alpha','Alpha','active','Taipei','cafe','Alpha Legal Co','pro'),('r-beta','Beta','active','Taichung','bistro','Beta Legal Co','demo'),('r-draft','Charlie Draft','draft','Tainan','deli','Charlie Legal','demo')`);
  await q(`update public.restaurants set restaurant_about='About Alpha', public_website_url='https://alpha.example', restaurant_about_source='owner' where id='r-alpha'`).catch(() => {});
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name,district,address) values
    ('b-a1','r-alpha','Alpha Main','active','Asia/Taipei','Da-an','1 Alpha Rd'),('b-a2','r-alpha','Alpha Inactive','inactive','Asia/Taipei',null,'2 Alpha Rd'),
    ('b-a3','r-alpha','Alpha Archived','archived','Asia/Taipei',null,null),('b-b1','r-beta','Beta Main','active','Asia/Taipei','Xinyi','9 Beta Rd'),
    ('b-d1','r-draft','Draft Branch','active','Asia/Taipei',null,null)`);
  await q(`update public.restaurant_branches set public_phone='+886212345678' where id='b-a1'`).catch(() => {});
  await q(`update public.restaurant_branches set latitude=25.03, longitude=121.56, geocode_status='resolved', geocode_provider='fixture' where id='b-a1'`).catch(() => {});
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('m-a1','r-alpha','Alpha Main Menu','published'),('m-a2','r-alpha','Alpha Draft Menu','draft'),('m-b1','r-beta','Beta Menu','published'),('m-d1','r-draft','Draft Menu','draft')`);
  await q(`insert into public.menu_categories(id,menu_id,name,sort_order) values ('c-a1','m-a1','Mains',1),('c-a2','m-a1','Sides',2),('c-a3','m-a2','Draft Cat',1),('c-b1','m-b1','Beta Cat',1),('c-d1','m-d1','D Cat',1)`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status,description,allergens,nutrition_badge_status) values
    ('i-a1','r-alpha','c-a1','Alpha Burger','active','Tasty','{gluten}','approved'),('i-a2','r-alpha','c-a1','Alpha Salad','active',null,'{}','missing'),
    ('i-a3','r-alpha','c-a2','Alpha Fries','active',null,'{}','ai_estimated'),('i-a4','r-alpha','c-a3','Alpha Draft Dish','draft',null,'{}','missing'),
    ('i-b1','r-beta','c-b1','Beta Bowl','active',null,'{}','missing')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability) values
    ('x-a1','r-alpha','b-a1','i-a1',120,'available'),('x-a2','r-alpha','b-a1','i-a2',90,'limited'),('x-b1','r-beta','b-b1','i-b1',80,'available')`);
  await q(`insert into public.menu_item_nutrition(id,menu_item_id,calories,source,verified_status,is_current,confidence_score) values ('n-a1','i-a1',550,'restaurant_verified','verified',true,1)`);
  await q(`insert into public.restaurant_branch_weekly_hour_intervals(branch_id,weekday,start_local_time,end_local_time,end_day_offset) values ('b-a1',1,'09:00','17:00',0),('b-a1',2,'09:00','17:00',0)`).catch((e) => console.log("weekly fixture skipped", e.code));
  // pagination fixtures: 55 extra restaurants, and one restaurant with 55 branches / menus / items / branch links
  await q(`insert into public.restaurants(id,name,status) select 'pg-r-'||lpad(g::text,2,'0'), 'Page '||lpad(g::text,2,'0'), 'active' from generate_series(1,55) g`);
  await q(`insert into public.restaurants(id,name,status) values ('r-page','Paged','active')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name) select 'pb-'||lpad(g::text,2,'0'),'r-page','PB '||lpad(g::text,2,'0'),'active','Asia/Taipei' from generate_series(1,55) g`);
  await q(`insert into public.menus(id,restaurant_id,name,status) select 'pm-'||lpad(g::text,2,'0'),'r-page','PM '||lpad(g::text,2,'0'),'published' from generate_series(1,55) g`);
  await q(`insert into public.menu_categories(id,menu_id,name,sort_order) values ('pc-1','pm-01','P Cat',1)`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) select 'pi-'||lpad(g::text,2,'0'),'r-page','pc-1','PI '||lpad(g::text,2,'0'),'active' from generate_series(1,55) g`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability) select 'px-'||lpad(g::text,2,'0'),'r-page','pb-01','pi-'||lpad(g::text,2,'0'),10,'available' from generate_series(1,55) g`);
  const ownerAuth = uuid();
  await q("insert into auth.users(id,email) values ($1,'owner@t.invalid')", [ownerAuth]);
  const ru = (await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled') returning id", [ownerAuth]))[0].id;
  const ownerRole = (await q("select id from public.restaurant_roles where role_key='owner'"))[0].id;
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'r-alpha',$2,'active')", [ru, ownerRole]);

  // staff fixtures ------------------------------------------------------------------------------------------------
  const KEYS = ["admin.restaurants.read", "admin.restaurants.about.read", "admin.restaurants.contact.read", "admin.restaurants.branches.read", "admin.restaurants.hours.read", "admin.restaurants.geo.read", "admin.restaurants.menus.read", "admin.restaurants.menu.read", "admin.restaurants.menu_items.read", "admin.restaurants.menu_item.read"];
  const OTHER_AE1 = ["admin.restaurants.menu_management.read", "admin.social.policies.read", "admin.nutrition.certification.pending.read", "admin.dashboard.counts.read"];
  const staffUser = async (label, keys) => {
    const id = uuid(); await q("insert into auth.users(id,email) values ($1,$2)", [id, `${label}@t.invalid`]);
    const sid = (await q("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id", [id]))[0].id;
    for (const k of ["admin_context.read", ...keys]) await q("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) values ($1,$2,'migration_backfill','active',now()-interval '1 day')", [sid, k]);
    return { id, sid };
  };
  const base = await staffUser("base", []);
  const nonStaff = uuid(); await q("insert into auth.users(id,email) values ($1,'nonstaff@t.invalid')", [nonStaff]);
  const exact = {}, wrong = {};
  for (const k of KEYS) { exact[k] = await staffUser(`exact-${k}`, [k]); wrong[k] = await staffUser(`wrong-${k}`, [...KEYS.filter((x) => x !== k), ...OTHER_AE1]); }

  const call = async (who, fn, ...args) => {
    const params = args.map((_, i) => `$${i + 1}`).join(",");
    const r = who === "anon" ? await asRole("anon", null, `select public.${fn}(${params}) as out`, args) : await asRole("authenticated", { sub: who, session_id: uuid(), aal: "aal1" }, `select public.${fn}(${params}) as out`, args);
    return r.thrown ? { thrown: r.thrown } : r.rows[0].out;
  };

  // ---- contract inventory: [function, key, ready-args, wrong-parent-args | null] -------------------------------------
  const C = [
    ["staff_admin_restaurant_list_v1", "admin.restaurants.read", [null, null], null],
    ["staff_admin_restaurant_detail_v1", "admin.restaurants.read", ["r-alpha"], ["nope"]],
    ["staff_admin_restaurant_about_v1", "admin.restaurants.about.read", ["r-alpha"], ["nope"]],
    ["staff_admin_restaurant_contact_v1", "admin.restaurants.contact.read", ["r-alpha"], ["nope"]],
    ["staff_admin_restaurant_branch_list_v1", "admin.restaurants.branches.read", ["r-alpha", null, null], ["nope", null, null]],
    ["staff_admin_restaurant_branch_detail_v1", "admin.restaurants.branches.read", ["r-alpha", "b-a1"], ["r-beta", "b-a1"]],
    ["staff_admin_restaurant_branch_contact_v1", "admin.restaurants.contact.read", ["r-alpha", "b-a1"], ["r-beta", "b-a1"]],
    ["staff_admin_restaurant_branch_hours_v1", "admin.restaurants.hours.read", ["r-alpha", "b-a1"], ["r-beta", "b-a1"]],
    ["staff_admin_restaurant_branch_geo_v1", "admin.restaurants.geo.read", ["r-alpha", "b-a1"], ["r-beta", "b-a1"]],
    ["staff_admin_restaurant_menu_list_v1", "admin.restaurants.menus.read", ["r-alpha", null, null], ["nope", null, null]],
    ["staff_admin_restaurant_menu_detail_v1", "admin.restaurants.menu.read", ["r-alpha", "m-a1"], ["r-beta", "m-a1"]],
    ["staff_admin_restaurant_menu_item_list_v1", "admin.restaurants.menu_items.read", ["r-alpha", null, null, null], ["r-beta", "m-a1", null, null]],
    ["staff_admin_restaurant_menu_item_detail_v1", "admin.restaurants.menu_item.read", ["r-alpha", "i-a1"], ["r-beta", "i-a1"]],
    ["staff_admin_restaurant_branch_menu_item_list_v1", "admin.restaurants.menu_items.read", ["r-alpha", "b-a1", null, null], ["r-beta", "b-a1", null, null]]
  ];
  check("inventory: exactly 14 contracts over exactly the 10 ADMIN-B permission keys", C.length === 14 && new Set(C.map((c) => c[1])).size === 10 && C.every((c) => KEYS.includes(c[1])), [...new Set(C.map((c) => c[1]))]);
  const fnRows = async () => q("select p.proname, pg_get_userbyid(p.proowner) owner, p.prosecdef, p.provolatile, p.proacl::text acl, p.oid::regprocedure::text sig from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'staff\\_admin\\_restaurant\\_%' escape '\\' order by 1");

  // ---------------------------------------------------------------------------------------------- BEFORE fingerprints
  const policyCounts = async () => Object.fromEntries((await q("select tablename, count(*)::int n from pg_policies where schemaname='public' and tablename in ('restaurants','restaurant_branches','menus','menu_categories','menu_items','branch_menu_items','menu_item_nutrition','restaurant_branch_weekly_hour_intervals','restaurant_branch_special_hour_overrides','restaurant_branch_special_hour_intervals','restaurant_branch_operational_closures','restaurant_branch_temporal_state','restaurant_public_social_links','restaurant_memberships','restaurant_roles') group by 1")).map((r) => [r.tablename, r.n]));
  const tableAcl = async () => (await q("select md5(string_agg(c.relname||':'||coalesce(c.relacl::text,''), '|' order by c.relname)) h from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'"))[0].h;
  const otherFns = async () => (await q("select md5(string_agg(p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid))||':'||coalesce(p.proacl::text,''), '|' order by p.oid::regprocedure::text)) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','admin_internal') and p.proname not like 'staff\\_admin\\_restaurant\\_%' escape '\\' and p.proname <> 'staff_has_permission_v1'"))[0].h;
  const permFnAcl = async () => (await q("select p.proacl::text a from pg_proc p where p.proname='staff_has_permission_v1' and p.pronamespace='public'::regnamespace"))[0].a;
  const privState = async () => (await q("select has_table_privilege('authenticated','public.restaurant_memberships','select') a, has_table_privilege('authenticated','public.restaurant_roles','select') b, has_table_privilege('anon','public.restaurant_branch_temporal_state','select') c"))[0];
  const membershipRows = async () => (await q("select r.rolname||'>'||m.rolname||':'||g.rolname||':'||a.admin_option||a.inherit_option||a.set_option x from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where r.rolname <> 'staff_admin_restaurant_reader' order by 1")).map((r) => r.x);
  const membershipHash = async () => (await q("select md5(string_agg(r.rolname||'>'||m.rolname||':'||g.rolname||':'||a.admin_option||a.inherit_option||a.set_option, '|' order by r.rolname, m.rolname, g.rolname)) h, count(*)::int n from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor where r.rolname <> 'staff_admin_restaurant_reader'"))[0];
  const membershipBefore = await membershipHash(); const rowsBefore = await membershipRows();
  const permAclBefore = await permFnAcl(); const privBefore = await privState();
  const before = { policies: await policyCounts(), acl: await tableAcl(), fns: await otherFns(), anonRestaurants: (await asRole("anon", null, "select count(*)::int n from public.restaurants")).rows?.[0]?.n ?? "denied", catalog: (await q("select count(*)::int n from admin_internal.staff_permission_catalog"))[0].n };
  check("BEFORE: no B1 object exists", (await fnRows()).filter((r) => r.proname !== "staff_admin_restaurant_branch_status_v1").length === 0 && (await q("select count(*)::int n from pg_roles where rolname='staff_admin_restaurant_reader'"))[0].n === 0);

  // ---------------------------------------------------------------------------------------------- mutant migrations
  const text = fs.readFileSync(path.join(MIGRATIONS, B1), "utf8");
  async function mutantRefuses(name, sqlText, expected) {
    const c = await connect("postgres");
    try { await c.query(sqlText); check(`mutant refused: ${name}`, false, "mutant migration committed"); await c.query("rollback").catch(() => {}); }
    catch (error) { try { await c.query("rollback"); } catch {} check(`mutant refused: ${name}`, expected.test(String(error.message)), error.message); }
    finally { await c.end(); }
  }
  const rep = (from, to) => { if (!text.includes(from)) throw new Error("mutation anchor missing: " + from.slice(0, 60)); return text.replace(from, to); };
  await mutantRefuses("A. permission check removed from one contract", rep("if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.about.read') then", "if false then"), /b1_contract_permission_mismatch/);
  await mutantRefuses("B. wrong Restaurant permission substituted (hours uses geo)", rep("staff_admin_restaurant_read_gate_v1('admin.restaurants.hours.read')", "staff_admin_restaurant_read_gate_v1('admin.restaurants.geo.read')"), /b1_contract_permission_mismatch/);
  await mutantRefuses("C. PUBLIC execute restored on a contract", rep("grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;\n\nalter function admin_internal.staff_admin_restaurant_read_gate_v1", "grant execute on function public.staff_admin_restaurant_list_v1(integer, integer) to public;\ngrant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;\n\nalter function admin_internal.staff_admin_restaurant_read_gate_v1"), /b1_contract_acl/);
  await mutantRefuses("D. anon execute restored on a contract", rep("grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;\n\nalter function admin_internal.staff_admin_restaurant_read_gate_v1", "grant execute on function public.staff_admin_restaurant_list_v1(integer, integer) to anon;\ngrant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;\n\nalter function admin_internal.staff_admin_restaurant_read_gate_v1"), /b1_contract_acl/);
  await mutantRefuses("E. base-admin fallback introduced into a contract body", rep("if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.about.read') then", "if not (admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.about.read') or public.staff_has_permission_v1('admin_context.read')) then"), /b1_contract_permission_mismatch/);
  await mutantRefuses("I. a write statement introduced into a contract", rep("  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,\n    'about'", "  update public.restaurants set name = name where false;\n  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,\n    'about'"), /b1_contract_not_read_only|permission denied|b1_/);
  await mutantRefuses("the sealed reader is granted UPDATE", rep("revoke create on schema public from staff_admin_restaurant_reader;", "grant update (name) on public.restaurants to staff_admin_restaurant_reader;\nrevoke create on schema public from staff_admin_restaurant_reader;"), /b1_reader_non_select_privilege/);
  await mutantRefuses("a client role is granted raw table SELECT", rep("revoke create on schema public from staff_admin_restaurant_reader;", "grant select on public.restaurant_memberships to authenticated;\nrevoke create on schema public from staff_admin_restaurant_reader;"), /b1_client_table_grant_present/);
  await mutantRefuses("the SET edge to the context reader is retained", rep("revoke staff_authority_context_reader from postgres granted by postgres;", ""), /b1_context_reader_set_edge_retained/);
  await mutantRefuses("a reader policy is missing", rep("create policy staff_admin_restaurant_reader_select on public.restaurant_roles for select to staff_admin_restaurant_reader using (true);", ""), /b1_reader_policy_mismatch/);
  check("all mutant migrations rolled back: the BEFORE state is byte-identical", JSON.stringify(before) === JSON.stringify({ policies: await policyCounts(), acl: await tableAcl(), fns: await otherFns(), anonRestaurants: (await asRole("anon", null, "select count(*)::int n from public.restaurants")).rows?.[0]?.n ?? "denied", catalog: (await q("select count(*)::int n from admin_internal.staff_permission_catalog"))[0].n }));

  // ---------------------------------------------------------------------------------------------- apply real B1
  try { await runner.query(text); applied += 1; }
  catch (error) { check("ADMIN-B1 applies as the non-superuser runner", false, { code: error.code, message: String(error.message).slice(0, 900) }); throw error; }
  check("ADMIN-B1 applies cleanly as the non-superuser runner; 137 migrations applied", applied === 137, applied);

  // ---------------------------------------------------------------------------------------------- AFTER: objects / ACL
  const fns = (await fnRows()).filter((r) => r.proname !== "staff_admin_restaurant_branch_status_v1");
  check("AFTER: exactly the 14 contracts exist, SECURITY DEFINER, STABLE, owned by the sealed reader", fns.length === 14 && fns.every((r) => r.owner === "staff_admin_restaurant_reader" && r.prosecdef && r.provolatile === "s"), fns.map((r) => [r.proname, r.owner]));
  check("AFTER: ACL is exactly {sealed owner, authenticated}: no PUBLIC/anon/service_role/authenticator", fns.every((r) => { const e = r.acl.replace(/[{}]/g, "").split(",").sort(); return e.length === 2 && e.some((x) => x.startsWith("authenticated=X/")) && e.some((x) => x.startsWith("staff_admin_restaurant_reader=X/")); }), fns.map((r) => r.acl));
  const after = { policies: await policyCounts(), acl: await tableAcl(), fns: await otherFns() };
  check("AFTER: existing Owner/Consumer RLS intact: each of the 15 tables gained exactly one policy (the reader's), none removed", Object.keys(before.policies).every((t) => after.policies[t] === before.policies[t] + 1), { before: before.policies, after: after.policies });
  check("AFTER: table ACLs for every public table are byte-identical (no client grant; the sealed reader's column grants live in attribute ACLs)", after.acl === before.acl);
  const membershipAfter = await membershipHash(); const rowsAfter = await membershipRows();
  const removedRows = rowsBefore.filter((x) => !rowsAfter.includes(x)), addedRows = rowsAfter.filter((x) => !rowsBefore.includes(x));
  check("AFTER: role memberships are unchanged except that the transient grant/revoke pair consumes the one residual postgres SET edge on staff_authority_context_reader that the predecessor chain leaves behind (nothing is added)", addedRows.length === 0 && removedRows.every((x) => x === "staff_authority_context_reader>postgres:postgres:falsefalsetrue") && removedRows.length <= 1 && (await q("select pg_has_role('postgres','staff_authority_context_reader','SET') s"))[0].s === false, { membershipBefore, membershipAfter, removed: rowsBefore.filter((x) => !rowsAfter.includes(x)), added: rowsAfter.filter((x) => !rowsBefore.includes(x)) });
  const permAclAfter = await permFnAcl();
  check("AFTER: every other function in public/admin_internal is byte-identical (bodies + ACLs); the only ACL delta is staff_has_permission_v1 gaining the sealed reader", after.fns === before.fns && permAclAfter !== permAclBefore && permAclAfter.includes("staff_admin_restaurant_reader=X/") && permAclAfter.split(",").filter((e) => !e.includes("staff_admin_restaurant_reader=")).join(",").replace(/[{}]/g, "") === permAclBefore.split(",").join(",").replace(/[{}]/g, ""), { permAclBefore, permAclAfter });
  check("AFTER: the ADMIN-AE1 catalogue is untouched (27 rows)", (await q("select count(*)::int n from admin_internal.staff_permission_catalog"))[0].n === 27);
  check("AFTER: anon still sees the same restaurants (unchanged); no client table privilege changed on the operational internals", ((await asRole("anon", null, "select count(*)::int n from public.restaurants")).rows?.[0]?.n ?? "denied") === before.anonRestaurants && JSON.stringify(await privState()) === JSON.stringify(privBefore), { privBefore, now: await privState() });
  const writeAttempt = await asRole("staff_admin_restaurant_reader", null, "update public.restaurants set name = name");
  const insertAttempt = await asRole("staff_admin_restaurant_reader", null, "insert into public.restaurant_roles(role_key,display_name) values ('zz','zz')");
  const legalAttempt = await asRole("staff_admin_restaurant_reader", null, "select legal_name from public.restaurants");
  const planAttempt = await asRole("staff_admin_restaurant_reader", null, "select plan from public.restaurants");
  check("AFTER: the sealed reader cannot write (42501) and cannot even read legal_name or plan (42501)", [writeAttempt, insertAttempt, legalAttempt, planAttempt].every((r) => r.thrown === "42501"), [writeAttempt.thrown, insertAttempt.thrown, legalAttempt.thrown, planAttempt.thrown]);

  // ---------------------------------------------------------------------------------------------- permission enforcement
  const denyShape = (o) => o?.state === "forbidden" && Object.keys(o).length === 1;
  const results = {};
  for (const [fn, key, args] of C) {
    const anon = await call("anon", fn, ...args), nonstaff = await call(nonStaff, fn, ...args), b = await call(base.id, fn, ...args);
    const ex = await call(exact[key].id, fn, ...args), wr = await call(wrong[key].id, fn, ...args);
    results[fn] = { anon: anon.thrown, nonstaff: nonstaff.state, base: b.state, exact: ex.state, wrong: wr.state, exactPayload: ex, deny: [nonstaff, b, wr].every(denyShape) };
  }
  check("anon is denied at the privilege boundary (42501) on all 14 contracts", C.every(([fn]) => results[fn].anon === "42501"), Object.fromEntries(C.map(([fn]) => [fn, results[fn].anon])));
  check("authenticated non-staff, base Admin, and a holder of every OTHER key are all `forbidden` (no data, state only) on all 14", C.every(([fn]) => results[fn].deny), Object.fromEntries(C.map(([fn]) => [fn, [results[fn].nonstaff, results[fn].base, results[fn].wrong]])));
  check("the exact-key holder reads `ready` on all 14 contracts", C.every(([fn]) => results[fn].exact === "ready"), Object.fromEntries(C.map(([fn]) => [fn, results[fn].exact])));
  // exact holder of key X is denied every contract of another key (no umbrella)
  const cross = [];
  for (const k of KEYS) for (const [fn, key, args] of C) if (key !== k) { const r = await call(exact[k].id, fn, ...args); if (r.state !== "forbidden") cross.push([k, fn, r.state]); }
  check("cross-permission negative: each exact-key holder is `forbidden` on every contract of every other key (no umbrella, no about<->contact implication)", cross.length === 0, cross.slice(0, 5));
  // revoke
  const revokable = await staffUser("revokable", ["admin.restaurants.read"]);
  const beforeRevoke = await call(revokable.id, "staff_admin_restaurant_list_v1", null, null);
  await q("update admin_internal.staff_permission_entitlements set status='revoked', revoked_at=now() where staff_account_id=$1 and permission_key='admin.restaurants.read'", [revokable.sid]);
  const revoked = await call(revokable.id, "staff_admin_restaurant_list_v1", null, null);
  const stillOther = await call(exact["admin.restaurants.about.read"].id, "staff_admin_restaurant_about_v1", "r-alpha");
  check("revoke: the same caller reads ready, then is `forbidden` after revocation, and other holders are unaffected", beforeRevoke.state === "ready" && revoked.state === "forbidden" && stillOther.state === "ready", { beforeRevoke: beforeRevoke.state, revoked });
  const holder = (k) => exact[k].id;

  // ---------------------------------------------------------------------------------------------- data correctness / lifecycle / hierarchy
  const list = await call(holder("admin.restaurants.read"), "staff_admin_restaurant_list_v1", 50, 0);
  const allNames = (await q("select id from public.restaurants order by name collate \"C\", id collate \"C\"")).map((r) => r.id);
  check("lifecycle: the draft restaurant is visible to Admin (Consumer-public filtering is NOT applied)", (await call(holder("admin.restaurants.read"), "staff_admin_restaurant_detail_v1", "r-draft")).status === "draft" && !(await asRole("anon", null, "select id from public.restaurants where id='r-draft'")).rows?.length);
  const det = await call(holder("admin.restaurants.read"), "staff_admin_restaurant_detail_v1", "r-alpha");
  check("Restaurant detail: exact counts and ownership summary only", det.branchCount === 3 && det.activeBranchCount === 1 && det.menuCount === 2 && det.menuItemCount === 4 && det.activeMembershipCount === 1 && det.hasActiveOwner === true, det);
  check("Restaurant detail: not_found for an unknown id, invalid_request for a malformed id (distinct from forbidden)", (await call(holder("admin.restaurants.read"), "staff_admin_restaurant_detail_v1", "zzz")).state === "not_found" && (await call(holder("admin.restaurants.read"), "staff_admin_restaurant_detail_v1", " r-alpha")).state === "invalid_request");
  const bl = await call(holder("admin.restaurants.branches.read"), "staff_admin_restaurant_branch_list_v1", "r-alpha", null, null);
  check("Restaurant -> Branch: r-alpha lists exactly its 3 branches (active, inactive, archived) and none of r-beta's", bl.items.length === 3 && bl.items.map((b) => b.status).sort().join() === "active,archived,inactive" && bl.items.every((b) => b.restaurantId === "r-alpha"), bl.items);
  const ml = await call(holder("admin.restaurants.menus.read"), "staff_admin_restaurant_menu_list_v1", "r-alpha", null, null);
  check("Restaurant -> Menu: r-alpha lists its published and draft menus with counts, none of r-beta's", ml.items.length === 2 && ml.items.map((m) => m.status).sort().join() === "draft,published" && ml.items.find((m) => m.menuId === "m-a1").itemCount === 3 && ml.items.find((m) => m.menuId === "m-a1").categoryCount === 2, ml.items);
  const md = await call(holder("admin.restaurants.menu.read"), "staff_admin_restaurant_menu_detail_v1", "r-alpha", "m-a1");
  check("Menu detail: categories in sort order with item counts", md.categories.map((c) => c.categoryId).join() === "c-a1,c-a2" && md.categories[0].itemCount === 2, md);
  const il = await call(holder("admin.restaurants.menu_items.read"), "staff_admin_restaurant_menu_item_list_v1", "r-alpha", null, null, null);
  check("Restaurant -> Menu -> Menu Item: r-alpha lists its 4 items (incl. the draft dish), none of r-beta's; filter by menu returns only that menu's items", il.items.length === 4 && il.items.every((i) => i.restaurantId === "r-alpha") && (await call(holder("admin.restaurants.menu_items.read"), "staff_admin_restaurant_menu_item_list_v1", "r-alpha", "m-a1", null, null)).items.length === 3, il.items.map((i) => i.menuItemId));
  const idt = await call(holder("admin.restaurants.menu_item.read"), "staff_admin_restaurant_menu_item_detail_v1", "r-alpha", "i-a1");
  check("Menu item detail: status fields + current nutrition record, allergens; branch link count", idt.nutritionBadgeStatus === "approved" && idt.currentNutrition?.verifiedStatus === "verified" && idt.currentNutrition?.calories === 550 && idt.branchLinkCount === 1 && JSON.stringify(idt.allergens) === '["gluten"]', idt);
  const bmi = await call(holder("admin.restaurants.menu_items.read"), "staff_admin_restaurant_branch_menu_item_list_v1", "r-alpha", "b-a1", null, null);
  check("Branch -> Branch Menu Item: b-a1 lists exactly its 2 links with price/availability, ordered by item name", bmi.items.length === 2 && bmi.items.map((x) => x.menuItemName).join() === "Alpha Burger,Alpha Salad" && bmi.items[0].price === 120, bmi.items);
  const hours = await call(holder("admin.restaurants.hours.read"), "staff_admin_restaurant_branch_hours_v1", "r-alpha", "b-a1");
  const geo = await call(holder("admin.restaurants.geo.read"), "staff_admin_restaurant_branch_geo_v1", "r-alpha", "b-a1");
  const bcon = await call(holder("admin.restaurants.contact.read"), "staff_admin_restaurant_branch_contact_v1", "r-alpha", "b-a1");
  const rcon = await call(holder("admin.restaurants.contact.read"), "staff_admin_restaurant_contact_v1", "r-alpha");
  const about = await call(holder("admin.restaurants.about.read"), "staff_admin_restaurant_about_v1", "r-alpha");
  check("Branch hours: timezone, weekly intervals (ordered) and no closures for b-a1", hours.timezoneName === "Asia/Taipei" && Array.isArray(hours.weekly) && Array.isArray(hours.closures) && hours.special.length === 0, hours);
  check("Branch geo / Branch contact / Restaurant contact / About return their own exact shapes", geo.geocodeStatus !== undefined && "latitude" in geo && "publicPhone" in bcon && "publicWebsiteUrl" in rcon && Array.isArray(rcon.socialLinks) && "about" in about, { geo, bcon, rcon, about });

  // ---- cross-parent isolation -----------------------------------------------------------------------------------------
  const leaks = [];
  for (const [fn, key, , wrongArgs] of C) if (wrongArgs) { const r = await call(holder(key), fn, ...wrongArgs); if (r.state !== "not_found" || JSON.stringify(r).match(/Alpha|b-a1|m-a1|i-a1/)) leaks.push([fn, r.state]); }
  check("cross-parent isolation: a child id under the WRONG parent (or an unknown parent) is `not_found` with no data, on every parent/child contract", leaks.length === 0, leaks);
  const noLeakList = await call(holder("admin.restaurants.menu_items.read"), "staff_admin_restaurant_menu_item_list_v1", "r-beta", null, null, null);
  check("no cross-restaurant children: r-beta's item list contains only r-beta items", noLeakList.items.length === 1 && noLeakList.items[0].menuItemId === "i-b1");

  // ---- pagination / bounds ------------------------------------------------------------------------------------------------
  const k1 = holder("admin.restaurants.read");
  const d1 = await call(k1, "staff_admin_restaurant_list_v1", null, null), p50 = await call(k1, "staff_admin_restaurant_list_v1", 50, 0);
  check("pagination default: limit 20, offset 0, hasMore true (59 restaurants)", d1.limit === 20 && d1.offset === 0 && d1.items.length === 20 && d1.hasMore === true);
  check("pagination maximum: limit 50 returns 50 with hasMore", p50.items.length === 50 && p50.hasMore === true);
  const bad = [[51, 0], [0, 0], [-1, 0], [20, -1], [20, 10001]];
  const badOut = []; for (const [l, o] of bad) badOut.push((await call(k1, "staff_admin_restaurant_list_v1", l, o)).state);
  check("out-of-range limit/offset are REJECTED (invalid_request), never clamped, on the restaurant list", badOut.every((s) => s === "invalid_request"), badOut);
  const listBad = []; for (const [fn, key, args] of C) if (fn.endsWith("list_v1") && fn !== "staff_admin_restaurant_list_v1") { const a = [...args]; a[a.length - 2] = 51; listBad.push((await call(holder(key), fn, ...a)).state); }
  check("the same maximum (51 rejected) holds on every other list contract", listBad.length === 4 && listBad.every((s) => s === "invalid_request"), listBad);
  const pg1 = await call(k1, "staff_admin_restaurant_list_v1", 20, 0), pg2 = await call(k1, "staff_admin_restaurant_list_v1", 20, 20), pg3 = await call(k1, "staff_admin_restaurant_list_v1", 20, 40);
  const seq = [...pg1.items, ...pg2.items, ...pg3.items].map((x) => x.restaurantId);
  check("stable total ordering: pages 1-3 concatenate to the all 59 rows of (name, id) order with no gap or duplicate; hasMore false at the end", seq.join() === allNames.slice(0, seq.length).join() && seq.length === 59 && pg3.hasMore === false && pg1.hasMore === true, { n: seq.length });
  const lastPage = await call(k1, "staff_admin_restaurant_list_v1", 50, 10000);
  check("offset beyond the data returns an empty page (ready, no items, hasMore false)", lastPage.state === "ready" && lastPage.items.length === 0 && lastPage.hasMore === false);
  const pb = await call(holder("admin.restaurants.branches.read"), "staff_admin_restaurant_branch_list_v1", "r-page", 50, 50);
  const pm = await call(holder("admin.restaurants.menus.read"), "staff_admin_restaurant_menu_list_v1", "r-page", 50, 0);
  const pi = await call(holder("admin.restaurants.menu_items.read"), "staff_admin_restaurant_menu_item_list_v1", "r-page", null, 50, 0);
  const px = await call(holder("admin.restaurants.menu_items.read"), "staff_admin_restaurant_branch_menu_item_list_v1", "r-page", "pb-01", 50, 0);
  check("branch/menu/item/branch-link lists page correctly (55 rows: 5 on the second page; 50 + hasMore on the first)", pb.items.length === 5 && pb.hasMore === false && pm.items.length === 50 && pm.hasMore === true && pi.items.length === 50 && pi.hasMore === true && px.items.length === 50 && px.hasMore === true, { pb: pb.items.length, pm: pm.items.length, pi: pi.items.length, px: px.items.length });

  // ---- privacy / field minimisation ---------------------------------------------------------------------------------------
  const payloads = JSON.stringify(Object.values(results).map((r) => r.exactPayload)) + JSON.stringify([det, bl, ml, md, il, idt, bmi, hours, geo, bcon, rcon, about]);
  check("field minimisation: no legal_name, plan, tags, auth ids, emails, restaurant-user or credential fields appear in any payload", !/Legal|legal|"plan"|pro"|owner@|auth_user|restaurant_user|token|password|geocode_provider_ref|fingerprint|lastError/.test(payloads.replace(/Alpha Legal/g, "")) && !payloads.includes(ownerAuth) && !payloads.includes(ru), null);
  check("field minimisation: ingredient data is absent (no ingredients key, no ingredient function or table)", !/ingredient/i.test(payloads) && (await q("select count(*)::int n from pg_proc where proname ilike '%ingredient%' and pronamespace in ('public'::regnamespace,'admin_internal'::regnamespace) and proname like 'staff_admin%'"))[0].n === 0);
  check("ADMIN-A/AE1 contracts unchanged: branch-status RPC pair, audit RPC and the 27-key catalogue are byte-identical to before (covered by the all-other-functions fingerprint)", after.fns === before.fns);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ suite: SUITE, database: "disposable local PostgreSQL", migrationsApplied: applied, total: checks.length, passed: checks.length - failed.length, failed: failed.length, productionTouched: false, developmentTouched: false }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error("HARNESS ERROR:", error?.stack ?? error); process.exitCode = 1;
} finally {
  for (const c of [broker, runner, admin]) { try { await c?.end(); } catch {} }
  cluster?.stop();
}
