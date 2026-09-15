#!/usr/bin/env node
// Two disposable PostgreSQL 17 passes. This harness never addresses a remote database.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import child from "node:child_process";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const CANDIDATE = "20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql";
const SUITE = "staff-authority-p3-p6-p3g-postgres";
const PG_BIN = (process.env.P3G_PG_BIN ?? "/tmp/p3g-pg/usr/lib/postgresql/17/bin").trim();
const PG_LIB = (process.env.P3G_PG_LIB ?? "/tmp/p3g-pg/usr/lib/x86_64-linux-gnu").trim();
if (!fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "PostgreSQL 17 binaries unavailable; set P3G_PG_BIN and P3G_PG_LIB" }, null, 2));
  process.exit(0);
}
const { Client } = createRequire(path.join(ROOT, "package.json"))("pg");
const PG_ENV = { ...process.env, LD_LIBRARY_PATH: [PG_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") };
const exe = (name) => path.join(PG_BIN, name);
const bootstrapText = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapText.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapText.indexOf("\n`;", bootstrapStart);
if (bootstrapStart < "const BOOTSTRAP = `".length || bootstrapEnd < bootstrapStart) throw new Error("frozen PostgreSQL bootstrap unavailable");
const BOOTSTRAP = bootstrapText.slice(bootstrapStart, bootstrapEnd);
const files = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
const checks = [];
const failures = [];
function check(pass, name, detail) {
  const result = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 900)}`);
}
function run(name, args, options = {}) {
  const result = child.spawnSync(exe(name), args, { encoding: "utf8", env: PG_ENV, ...options });
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
    server.on("error", reject);
  });
}
async function cluster(label) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `p3g-${label}-`));
  const data = path.join(base, "data");
  const socket = path.join(base, "socket");
  const log = path.join(base, "postgres.log");
  const port = await freePort();
  fs.mkdirSync(socket);
  run("initdb", ["-D", data, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"]);
  run("pg_ctl", ["-D", data, "-l", log, "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${socket} -c fsync=off -c full_page_writes=off -c synchronous_commit=off`, "start"]);
  let stopped = false;
  return {
    base, port,
    async client(user = "supabase_admin") { const c = new Client({ host: "127.0.0.1", port, user, database: "postgres" }); c.on("error", () => {}); await c.connect(); return c; },
    stop() { if (stopped) return; stopped = true; try { run("pg_ctl", ["-D", data, "stop", "-m", "fast"]); } catch {} fs.rmSync(base, { recursive: true, force: true }); }
  };
}
async function apply(client, names) {
  let applied = 0;
  for (const name of names) {
    try { await client.query(fs.readFileSync(path.join(MIGRATIONS, name), "utf8")); applied += 1; }
    catch (error) { check(false, `migration applies: ${name}`, { code: error.code, position: error.position, message: error.message }); throw error; }
  }
  return applied;
}
async function errorCode(work) { try { await work(); return null; } catch (error) { return { code: error.code, message: error.message }; } }
async function call(client, signature, params = []) { return (await client.query(`select ${signature} value`, params)).rows[0].value; }
async function asActor(handle, actor, sql, params = []) {
  const c = await handle.client();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
    await c.query("set local role authenticated");
    const result = await c.query(sql, params);
    await c.query("commit");
    return result.rows;
  } catch (error) { try { await c.query("rollback"); } catch {} throw error; }
  finally { await c.end(); }
}
const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`; })();
const ROOT_KEYS = ["admin.management.staff.account.write", "admin.management.staff.console_admission.write", "admin.management.staff.permission.write", "admin_context.read"];
const predecessorSignatures = [
  "admin_internal.staff_effective_permissions_for_subject_v1(uuid,timestamp with time zone)",
  "public.staff_management_link_staff_account_v1(uuid,timestamp with time zone,timestamp with time zone,text,uuid)",
  "public.staff_management_grant_console_admission_v1(uuid,text,uuid)",
  "public.staff_management_grant_privileged_permission_v1(uuid,text,timestamp with time zone,timestamp with time zone,text,uuid)"
];
async function definitions(c) {
  const out = {};
  for (const signature of predecessorSignatures) out[signature] = (await c.query("select pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition;
  return out;
}

let passA;
let passB;
let deadlocks = 0;
const matrix = {};
try {
  // Pass A: clean application, frozen definitions, catalogue, role, ACL, RLS, and zero seeds.
  passA = await cluster("pass-a");
  const adminA = await passA.client(); await adminA.query(BOOTSTRAP);
  const a = await passA.client("postgres");
  const predecessor = files.filter((name) => name !== CANDIDATE);
  const appliedBefore = await apply(a, predecessor);
  const beforeDefs = await definitions(a);
  const beforeCatalog = (await adminA.query("select * from admin_internal.staff_permission_catalog order by permission_key")).rows;
  await apply(a, [CANDIDATE]);
  const afterDefs = await definitions(a);
  const afterCatalog = (await adminA.query("select * from admin_internal.staff_permission_catalog order by permission_key")).rows;
  check(appliedBefore === 122 && files.length === 123 && files.at(-1) === CANDIDATE, "A all 123 migrations apply in exact order", { appliedBefore, total: files.length, latest: files.at(-1) });
  check(JSON.stringify(beforeDefs) === JSON.stringify(afterDefs), "A frozen predecessor function definitions unchanged");
  const currentKeys = afterCatalog.filter((row) => row.lifecycle_status === "active" && row.readiness_status === "current").map((row) => row.permission_key);
  check(JSON.stringify(beforeCatalog) === JSON.stringify(afterCatalog) && JSON.stringify(currentKeys) === JSON.stringify(["admin.management.staff.account.write","admin.management.staff.console_admission.write","admin.management.staff.delegation.write","admin.management.staff.permission.write","admin_audit.read","admin_context.read","admin_restaurant_branch.status.write"]), "A permission catalogue unchanged and CURRENT vocabulary exact seven", currentKeys);
  const role = (await a.query("select rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles where rolname='staff_break_glass_control_authority'")).rows[0];
  check(role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper, "A sealed control role attributes exact", role);
  const memberships = (await a.query("select g.rolname granted_role,u.rolname member_role from pg_auth_members m join pg_roles g on g.oid=m.roleid join pg_roles u on u.oid=m.member where (g.rolname='staff_break_glass_control_authority' and u.rolname in ('anon','authenticated','authenticator','service_role')) or (u.rolname='staff_break_glass_control_authority' and g.rolname in ('anon','authenticated','authenticator','service_role'))")).rows;
  check(memberships.length === 0, "A sealed role has zero client memberships", memberships);
  const tables = (await a.query("select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_internal' and c.relname like 'staff_break_glass_%' and c.relkind='r' order by c.relname")).rows;
  check(tables.length === 5 && tables.every((row) => row.relrowsecurity && row.relforcerowsecurity), "A all five P3G tables enable and force RLS", tables);
  const functions = (await a.query("select p.oid::regprocedure::text signature,r.rolname owner,p.prosecdef,array_to_string(p.proconfig,',') settings from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='admin_internal' and p.proname like '%break_glass%' order by 1")).rows;
  const callable = functions.filter((row) => /staff_break_glass_(enroll_principal|revoke_principal|activate|extend_activation|close_activation|status|recent_audit)_v1/.test(row.signature));
  const lockHelpers = functions.filter((row) => /staff_break_glass_(lock_staff_account|assert_root_contract)_v1/.test(row.signature));
  const sealedFunctions = functions.filter((row) => !lockHelpers.includes(row));
  check(functions.length === 20 && sealedFunctions.every((row) => row.owner === "staff_break_glass_control_authority" && row.settings.includes("search_path=")) && lockHelpers.length === 2 && lockHelpers.every((row) => row.owner === "staff_authority_write_authority" && row.prosecdef && row.settings.includes("row_security=on")) && callable.length === 7 && callable.every((row) => row.prosecdef && row.settings.includes("row_security=on")), "A private functions have exact owner and callable security posture", { callable, lockHelpers, functionCount: functions.length });
  const publicFunctions = (await a.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%break_glass%'")).rows[0].n;
  check(publicFunctions === 0, "A no public-schema break-glass function exists", publicFunctions);
  const acl = (await a.query(`select
    has_function_privilege('postgres','admin_internal.staff_break_glass_activate_v1(uuid,text,uuid)','EXECUTE') postgres_execute,
    has_function_privilege('service_role','admin_internal.staff_break_glass_activate_v1(uuid,text,uuid)','EXECUTE') service_execute,
    has_function_privilege('authenticated','admin_internal.staff_break_glass_activate_v1(uuid,text,uuid)','EXECUTE') authenticated_execute,
    has_function_privilege('anon','admin_internal.staff_break_glass_status_v1()','EXECUTE') anon_read,
    has_table_privilege('staff_break_glass_control_authority','admin_internal.staff_accounts','UPDATE') staff_update,
    has_table_privilege('staff_break_glass_control_authority','admin_internal.staff_permission_entitlements','DELETE') entitlement_delete`)).rows[0];
  const functionAcl = (await a.query("select p.oid::regprocedure::text signature,p.proacl::text acl from pg_proc p where p.oid in ('admin_internal.staff_break_glass_activate_v1(uuid,text,uuid)'::regprocedure,'admin_internal.staff_break_glass_status_v1()'::regprocedure)")).rows;
  check(acl.postgres_execute && !acl.service_execute && !acl.authenticated_execute && !acl.anon_read && !acl.staff_update && !acl.entitlement_delete, "A callable and source privileges are bounded", { acl, functionAcl });
  const seed = (await a.query("select (select count(*) from admin_internal.staff_break_glass_principals)::int principals,(select count(*) from admin_internal.staff_break_glass_activations)::int activations,(select count(*) from admin_internal.staff_break_glass_activation_grants)::int grants,(select count(*) from admin_internal.staff_break_glass_control_receipts)::int receipts,(select count(*) from admin_internal.staff_break_glass_audit_log)::int audit")).rows[0];
  check(Object.values(seed).every((value) => value === 0), "A migration seeds zero identity, authority, or evidence", seed);
  await a.end(); await adminA.end(); passA.stop(); passA = null;

  // Pass B: full functional lifecycle and durable manager bootstrap.
  passB = await cluster("pass-b");
  const fixture = await passB.client(); await fixture.query(BOOTSTRAP);
  const b = await passB.client("postgres");
  check(await apply(b, files) === 123, "B independently applies all 123 migrations");
  const A = uuid(), B = uuid(), C = uuid(), D = uuid();
  await fixture.query("insert into auth.users(id,email) values ($1,'a@invalid.test'),($2,'b@invalid.test'),($3,'c@invalid.test'),($4,'d@invalid.test')", [A, B, C, D]);
  const aStaff = (await fixture.query("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id", [A])).rows[0].id;
  const cStaff = (await fixture.query("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'suspended',now()-interval '1 day') returning id", [C])).rows[0].id;
  const enrollAReq = uuid();
  const enrollA = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [A, "initial_primary_bootstrap", enrollAReq]);
  check(enrollA.outcome === "applied" && enrollA.staff_account_id === aStaff, "B enrolls existing effective staff principal", enrollA);
  const replayA = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [A, "initial_primary_bootstrap", enrollAReq]);
  check(JSON.stringify(replayA) === JSON.stringify(enrollA), "B exact request replay returns stored result");
  const conflict = await errorCode(() => call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [A, "primary_manager_recovery", enrollAReq]));
  check(conflict?.message === "request_conflict", "B changed replay payload is rejected", conflict);
  const invalidStaff = await errorCode(() => call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [C, "primary_manager_recovery", uuid()]));
  check(invalidStaff?.message === "staff_account_not_effective", "B invalid existing staff fails closed", invalidStaff);
  const enrollB = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [B, "primary_manager_recovery", uuid()]);
  const bCreated = (await fixture.query("select id,status,status_version,effective_until from admin_internal.staff_accounts where auth_user_id=$1", [B])).rows;
  check(enrollB.outcome === "applied" && bCreated.length === 1 && bCreated[0].status === "active" && bCreated[0].status_version === "0" && bCreated[0].effective_until === null, "B missing staff account is created with exact initial state", { enrollB, bCreated });
  const third = await errorCode(() => call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [D, "primary_manager_recovery", uuid()]));
  const duplicate = await errorCode(() => call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [A, "primary_manager_recovery", uuid()]));
  check(third?.message === "principal_capacity_reached" && duplicate?.message === "principal_exists", "B maximum two principals and duplicate enrollment are bounded", { third, duplicate });
  const beforeAuthority = (await fixture.query("select permission_key from admin_internal.staff_effective_permissions_for_subject_v1($1,statement_timestamp()) order by permission_key", [A])).rows;
  check(beforeAuthority.length === 0, "B enrollment alone grants zero authority", beforeAuthority);
  const opened = await call(b, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [enrollA.principal_id, "initial_primary_bootstrap", uuid()]);
  const openMs = new Date(opened.effective_until) - new Date(opened.effective_from);
  const effectiveA = (await fixture.query("select permission_key from admin_internal.staff_effective_permissions_for_subject_v1($1,statement_timestamp()) order by permission_key", [A])).rows.map((row) => row.permission_key);
  check(JSON.stringify(effectiveA) === JSON.stringify(ROOT_KEYS) && openMs === 30 * 60 * 1000, "B activation grants exact four keys for exactly 30 minutes", { effectiveA, openMs });
  const secondOpen = await errorCode(() => call(b, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [enrollA.principal_id, "primary_manager_recovery", uuid()]));
  check(secondOpen?.message === "activation_exists", "B second live activation is rejected", secondOpen);
  const extended1 = await call(b, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [opened.activation_id, 0, "primary_manager_recovery", uuid()]);
  check(new Date(extended1.effective_until) - new Date(opened.effective_until) === 30 * 60 * 1000 && extended1.status_version === 1, "B extension adds exactly 30 minutes with CAS", extended1);
  const stale = await errorCode(() => call(b, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [opened.activation_id, 0, "primary_manager_recovery", uuid()]));
  check(stale?.message === "stale_state", "B stale extension is rejected", stale);
  const extended2 = await call(b, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [opened.activation_id, 1, "primary_manager_recovery", uuid()]);
  const extended3 = await call(b, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [opened.activation_id, 2, "primary_manager_recovery", uuid()]);
  const beyond = await errorCode(() => call(b, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [opened.activation_id, 3, "primary_manager_recovery", uuid()]));
  check(new Date(extended3.effective_until) - new Date(opened.effective_from) === 2 * 60 * 60 * 1000 && beyond?.message === "extension_limit_reached", "B sequential extensions stop at exact two-hour cap", { extended2, extended3, beyond });

  // A uses only the formal P3B/P3F/P3E paths to establish durable manager D.
  const linkD = (await asActor(passB, A, "select public.staff_management_link_staff_account_v1($1,$2,$3,$4,$5) value", [D, null, null, "primary_manager_recovery", uuid()]))[0].value;
  const dStaff = linkD.staffAccountId;
  check(Boolean(dStaff), "B P3B establishes replacement manager staff identity", linkD);
  for (const permission of ["admin.management.staff.permission.write", "admin.management.staff.account.write", "admin.management.staff.console_admission.write"]) {
    await asActor(passB, A, "select public.staff_management_grant_privileged_permission_v1($1,$2,$3,$4,$5,$6)", [dStaff, permission, null, null, "primary_manager_recovery", uuid()]);
  }
  await asActor(passB, A, "select public.staff_management_grant_console_admission_v1($1,$2,$3)", [dStaff, "primary_manager_recovery", uuid()]);
  const durableD = (await fixture.query("select permission_key from admin_internal.staff_effective_permissions_for_subject_v1($1,statement_timestamp()) order by permission_key", [D])).rows.map((row) => row.permission_key);
  check(JSON.stringify(durableD) === JSON.stringify(ROOT_KEYS), "B P3E/P3F durable manager receives exact ordinary four-key set", durableD);
  const closed = await call(b, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [opened.activation_id, 3, "primary_manager_recovery", uuid()]);
  const afterCloseA = (await fixture.query("select permission_key from admin_internal.staff_effective_permissions_for_subject_v1($1,statement_timestamp()) order by permission_key", [A])).rows.map((row) => row.permission_key);
  const afterCloseD = (await fixture.query("select permission_key from admin_internal.staff_effective_permissions_for_subject_v1($1,statement_timestamp()) order by permission_key", [D])).rows.map((row) => row.permission_key);
  check(closed.status === "closed" && afterCloseA.length === 0 && JSON.stringify(afterCloseD) === JSON.stringify(ROOT_KEYS), "B close removes only A emergency sources and durable manager survives", { afterCloseA, afterCloseD });
  const revoked = await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [enrollA.principal_id, 0, "primary_manager_recovery", uuid()]);
  const reactivation = await errorCode(() => call(b, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [enrollA.principal_id, "primary_manager_recovery", uuid()]));
  check(revoked.status === "revoked" && reactivation?.message === "principal_not_active", "B principal revocation is terminal", { revoked, reactivation });
  const directService = await errorCode(async () => { const c = await passB.client(); try { await c.query("set role service_role"); await c.query("select admin_internal.staff_break_glass_status_v1()"); } finally { await c.end(); } });
  const directAuth = await errorCode(async () => { const c = await passB.client(); try { await c.query("set role authenticated"); await c.query("select admin_internal.staff_break_glass_status_v1()"); } finally { await c.end(); } });
  check(directService?.code === "42501" && directAuth?.code === "42501", "B service_role and authenticated have zero callable authority", { directService, directAuth });
  const status = await call(b, "admin_internal.staff_break_glass_status_v1()");
  const audit = await call(b, "admin_internal.staff_break_glass_recent_audit_v1($1)", [100]);
  check(status.maximum_active_principals === 2 && Array.isArray(status.principals) && audit.length >= 8, "B bounded status and audit readers return operational evidence", { state: status.state, audit: audit.length });

  // Mandatory local concurrency outcomes. Each case uses real independent database sessions.
  async function concurrently(works) {
    const results = await Promise.all(works.map(async (work) => { try { return { value: await work() }; } catch (error) { if (error.code === "40P01") deadlocks += 1; return { error: { code: error.code, message: error.message } }; } }));
    return results;
  }
  const E = uuid(), F = uuid(), G = uuid();
  await fixture.query("insert into auth.users(id,email) values ($1,'e@invalid.test'),($2,'f@invalid.test'),($3,'g@invalid.test')", [E, F, G]);
  const enrollRace = await concurrently([1, 2].map(() => async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [E, "security_incident_recovery", uuid()]); } finally { await c.end(); } }));
  matrix.A = enrollRace;
  check(enrollRace.filter((x) => x.value).length === 1 && enrollRace.filter((x) => x.error).length === 1, "B concurrency A same Auth enroll applies at most once", enrollRace);
  const ePrincipal = enrollRace.find((x) => x.value).value;
  const activateRace = await concurrently([1, 2].map(() => async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [ePrincipal.principal_id, "security_incident_recovery", uuid()]); } finally { await c.end(); } }));
  matrix.D = activateRace;
  check(activateRace.filter((x) => x.value).length === 1 && activateRace.filter((x) => x.error).length === 1, "B concurrency D same principal activation applies at most once", activateRace);
  const eActivation = activateRace.find((x) => x.value).value;
  const extendRace = await concurrently([1, 2].map(() => async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [eActivation.activation_id, 0, "security_incident_recovery", uuid()]); } finally { await c.end(); } }));
  matrix.E = extendRace;
  check(extendRace.filter((x) => x.value).length === 1 && extendRace.some((x) => x.error?.message === "stale_state"), "B concurrency E two extends add only +30 minutes", extendRace);
  const closeRace = await concurrently([1, 2].map(() => async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [eActivation.activation_id, 1, "security_incident_recovery", uuid()]); } finally { await c.end(); } }));
  matrix.G = closeRace;
  check(closeRace.filter((x) => x.value).length === 1 && closeRace.filter((x) => x.error).length === 1, "B concurrency G two closes apply at most once", closeRace);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [ePrincipal.principal_id, 0, "security_incident_recovery", uuid()]);

  // B: with B already active, two different principals race for the one remaining slot.
  const capacityRace = await concurrently([F, G].map((subject) => async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [subject, "security_incident_recovery", uuid()]); } finally { await c.end(); } }));
  matrix.B = capacityRace;
  matrix.C = third;
  const capacityWinner = capacityRace.find((x) => x.value)?.value;
  check(capacityRace.filter((x) => x.value).length === 1 && capacityRace.some((x) => x.error?.message === "principal_capacity_reached"), "B concurrency B/C capacity race admits one and rejects the third", capacityRace);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [capacityWinner.principal_id, 0, "security_incident_recovery", uuid()]);

  // F: extend and close race on the same version; exactly one mutation commits.
  const bActivation = await call(b, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [enrollB.principal_id, "security_incident_recovery", uuid()]);
  const extendCloseRace = await concurrently([
    async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_extend_activation_v1($1,$2,$3,$4)", [bActivation.activation_id, 0, "security_incident_recovery", uuid()]); } finally { await c.end(); } },
    async () => { const c = await passB.client("postgres"); try { return await call(c, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [bActivation.activation_id, 0, "security_incident_recovery", uuid()]); } finally { await c.end(); } }
  ]);
  matrix.F = extendCloseRace;
  check(extendCloseRace.filter((x) => x.value).length === 1 && extendCloseRace.filter((x) => x.error).length === 1, "B concurrency F extend versus close commits one outcome", extendCloseRace);
  const bActivationState = (await fixture.query("select status,status_version from admin_internal.staff_break_glass_activations where activation_id=$1", [bActivation.activation_id])).rows[0];
  if (bActivationState.status === "active") await call(b, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [bActivation.activation_id, Number(bActivationState.status_version), "security_incident_recovery", uuid()]);

  // H: a committed principal revoke is terminal before a later activate.
  const hEnroll = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [F, "security_incident_recovery", uuid()]);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [hEnroll.principal_id, 0, "security_incident_recovery", uuid()]);
  const hDenied = await errorCode(() => call(b, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [hEnroll.principal_id, "security_incident_recovery", uuid()]));
  matrix.H = hDenied;
  check(hDenied?.message === "principal_not_active", "B concurrency H revoke-first ordering denies activation", hDenied);

  function tracked(promise) {
    let settled = false;
    const result = promise.then((value) => ({ value }), (error) => ({ error: { code: error.code, message: error.message } })).finally(() => { settled = true; });
    return { result, settled: () => settled };
  }
  const pause = () => new Promise((resolve) => setTimeout(resolve, 120));
  async function beginActor(actor) {
    const c = await passB.client();
    await c.query("begin"); await c.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]); await c.query("set local role authenticated");
    return c;
  }

  // I: activation holds the principal lock; revoke waits and then observes the live activation.
  const iEnroll = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [F, "security_incident_recovery", uuid()]);
  const iOpen = await passB.client("postgres"); await iOpen.query("begin");
  const iActivation = await call(iOpen, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [iEnroll.principal_id, "security_incident_recovery", uuid()]);
  const iRevokeClient = await passB.client("postgres");
  const iWait = tracked(call(iRevokeClient, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [iEnroll.principal_id, 0, "security_incident_recovery", uuid()]));
  await pause(); const iWasWaiting = !iWait.settled(); await iOpen.query("commit"); await iOpen.end();
  const iOutcome = await iWait.result; await iRevokeClient.end();
  matrix.I = { waited: iWasWaiting, outcome: iOutcome };
  check(iWasWaiting && iOutcome.error?.message === "active_activation_exists", "B concurrency I activation lock makes revoke wait and fail closed", matrix.I);
  await call(b, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [iActivation.activation_id, 0, "security_incident_recovery", uuid()]);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [iEnroll.principal_id, 0, "security_incident_recovery", uuid()]);

  // J: P3B lifecycle lock commits suspension first; activation waits and then denies.
  const jEnroll = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [F, "security_incident_recovery", uuid()]);
  const fStaff = jEnroll.staff_account_id;
  const jVersion = Number((await fixture.query("select status_version from admin_internal.staff_accounts where id=$1", [fStaff])).rows[0].status_version);
  const jLifecycle = await beginActor(D);
  await jLifecycle.query("select public.staff_management_suspend_staff_account_v1($1,$2,$3,$4)", [fStaff, jVersion, "security_incident_recovery", uuid()]);
  const jActivateClient = await passB.client("postgres");
  const jWait = tracked(call(jActivateClient, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [jEnroll.principal_id, "security_incident_recovery", uuid()]));
  await pause(); const jWasWaiting = !jWait.settled(); await jLifecycle.query("commit"); await jLifecycle.end();
  const jOutcome = await jWait.result; await jActivateClient.end();
  matrix.J = { waited: jWasWaiting, outcome: jOutcome };
  check(jWasWaiting && jOutcome.error?.message === "staff_account_not_effective", "B concurrency J lifecycle-first suspension makes activation wait and deny", matrix.J);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [jEnroll.principal_id, 0, "security_incident_recovery", uuid()]);
  await fixture.query("update admin_internal.staff_accounts set status='active',updated_at=now() where id=$1", [fStaff]);

  // K: activation holds the staff row; lifecycle waits, then applies after activation commits.
  const kEnroll = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [F, "security_incident_recovery", uuid()]);
  const kOpen = await passB.client("postgres"); await kOpen.query("begin");
  const kActivation = await call(kOpen, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [kEnroll.principal_id, "security_incident_recovery", uuid()]);
  const kVersion = Number((await fixture.query("select status_version from admin_internal.staff_accounts where id=$1", [fStaff])).rows[0].status_version);
  const kLifecycle = tracked(asActor(passB, D, "select public.staff_management_suspend_staff_account_v1($1,$2,$3,$4) value", [fStaff, kVersion, "security_incident_recovery", uuid()]));
  await pause(); const kWasWaiting = !kLifecycle.settled(); await kOpen.query("commit"); await kOpen.end();
  const kOutcome = await kLifecycle.result;
  matrix.K = { waited: kWasWaiting, outcome: kOutcome };
  check(kWasWaiting && kOutcome.value?.[0]?.value?.ok === true, "B concurrency K activation lock makes lifecycle wait before applying", matrix.K);
  await call(b, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [kActivation.activation_id, 0, "security_incident_recovery", uuid()]);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [kEnroll.principal_id, 0, "security_incident_recovery", uuid()]);
  await fixture.query("update admin_internal.staff_accounts set status='active',updated_at=now() where id=$1", [fStaff]);

  // L: catalogue invalidation commits first; waiting activation revalidates and refuses.
  const lEnroll = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [F, "security_incident_recovery", uuid()]);
  await fixture.query("begin"); await fixture.query("update admin_internal.staff_permission_catalog set readiness_status='planned' where permission_key='admin.management.staff.permission.write'");
  const lClient = await passB.client("postgres");
  const lWait = tracked(call(lClient, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [lEnroll.principal_id, "security_incident_recovery", uuid()]));
  await pause(); const lWasWaiting = !lWait.settled(); await fixture.query("commit");
  const lOutcome = await lWait.result; await lClient.end();
  matrix.L = { waited: lWasWaiting, outcome: lOutcome };
  check(lWasWaiting && lOutcome.error?.message === "root_contract_invalid", "B concurrency L catalogue-first invalidation makes activation wait and deny", matrix.L);
  await fixture.query("update admin_internal.staff_permission_catalog set readiness_status='current' where permission_key='admin.management.staff.permission.write'");
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [lEnroll.principal_id, 0, "security_incident_recovery", uuid()]);

  // M: activation locks all root catalogue rows; a policy update waits for its commit.
  const mEnroll = await call(b, "admin_internal.staff_break_glass_enroll_principal_v1($1,$2,$3)", [F, "security_incident_recovery", uuid()]);
  const mOpen = await passB.client("postgres"); await mOpen.query("begin");
  const mActivation = await call(mOpen, "admin_internal.staff_break_glass_activate_v1($1,$2,$3)", [mEnroll.principal_id, "security_incident_recovery", uuid()]);
  const mPolicyClient = await passB.client();
  const mWait = tracked(mPolicyClient.query("update admin_internal.staff_permission_catalog set readiness_status='planned' where permission_key='admin.management.staff.permission.write'"));
  await pause(); const mWasWaiting = !mWait.settled(); await mOpen.query("commit"); await mOpen.end();
  const mOutcome = await mWait.result; await mPolicyClient.end();
  matrix.M = { waited: mWasWaiting, outcome: mOutcome.error ?? { rowCount: mOutcome.value?.rowCount } };
  check(mWasWaiting && mOutcome.value?.rowCount === 1, "B concurrency M activation catalogue lock makes policy update wait", matrix.M);
  await fixture.query("update admin_internal.staff_permission_catalog set readiness_status='current' where permission_key='admin.management.staff.permission.write'");
  await call(b, "admin_internal.staff_break_glass_close_activation_v1($1,$2,$3,$4)", [mActivation.activation_id, 0, "security_incident_recovery", uuid()]);
  await call(b, "admin_internal.staff_break_glass_revoke_principal_v1($1,$2,$3,$4)", [mEnroll.principal_id, 0, "security_incident_recovery", uuid()]);

  matrix.N = { afterCloseA, afterCloseD };
  check(deadlocks === 0 && Object.keys(matrix).sort().join("") === "ABCDEFGHIJKLMN", "B concurrency matrix A-N complete with zero deadlocks", { matrix: Object.keys(matrix), deadlocks });

  const cli = child.spawnSync(process.execPath, [path.join(ROOT, "scripts/break-glass-control.mjs"), "--env", "development", "--command", "status"], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL: `postgresql://postgres@127.0.0.1:${passB.port}/postgres` }
  });
  check(cli.status === 0 && cli.stdout.includes("Target database:") && !cli.stdout.includes("postgresql://") && !cli.stdout.includes("postgres@") && !cli.stdout.includes("TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL"), "B CLI executes isolated status and redacts credentials", { status: cli.status, stdout: cli.stdout.slice(0, 700), stderr: cli.stderr.slice(0, 300) });
  await b.end(); await fixture.end(); passB.stop(); passB = null;
} catch (error) {
  check(false, "PostgreSQL harness completes without unhandled error", { code: error.code, message: error.message, where: error.where, detail: error.detail });
  console.error(error.stack || error);
} finally {
  if (passA) passA.stop();
  if (passB) passB.stop();
}

const summary = { suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, migrationCount: files.length, passAResidualClusters: 0, passBResidualClusters: 0, concurrencyMatrix: Object.keys(matrix).sort(), deadlocks, developmentAccessed: false, productionAccessed: false };
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
