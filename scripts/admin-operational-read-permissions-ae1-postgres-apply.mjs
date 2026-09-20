#!/usr/bin/env node
// ADMIN-AE1 -- disposable local PostgreSQL 17 gate. Never connects to Development or Production.
// Model: bootstrap superuser `supabase_admin` (initdb), migration runner `postgres` as a NON-superuser CREATEROLE role (the
// Supabase platform shape). Proves: all 135 predecessors apply from zero; the AE1 migration applies as the 136th; the exact
// catalogue delta (16 CURRENT privileged-lane keys, nothing else, no default grant); mutant migrations are refused by the
// postconditions; the existing privileged lane grants/revokes exactly one key and the delegated lane stays closed.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "admin-operational-read-permissions-ae1-postgres-apply";
const PG_BIN = (process.env.AE1_PG_BIN ?? process.env.R2E_PG_BIN ?? process.env.R2B_PG_BIN)?.trim();
const PG_MODULES = (process.env.AE1_PG_MODULES ?? process.env.R2E_PG_MODULES ?? process.env.R2B_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set AE1_PG_BIN and AE1_PG_MODULES (or R2E_PG_BIN / R2E_PG_MODULES)" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations");
const AE1 = "20260920010000_admin_operational_read_permissions_ae1.sql";
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapSource.indexOf("\n`;", bootstrapStart));
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!pass && detail !== undefined) console.log("   detail:", JSON.stringify(detail).slice(0, 700)); };
function kill(pid) { if (!pid) return; if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else try { process.kill(pid, "SIGKILL"); } catch {} }
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); server.on("error", reject); });
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ae1-apply-gate"); fs.mkdirSync(base, { recursive: true });
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

  // The exact ADMIN-B1 (20260920020000) and ADMIN-C (20260920030000) successors are proven by their own gates; this gate covers the 136 migrations through AE1.
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== "20260920020000_admin_restaurant_operational_read_foundation_b1.sql" && f !== "20260920030000_admin_operational_review_queues_c.sql").sort();
  for (const file of files.filter((f) => f !== AE1)) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`predecessor applies: ${file}`, false, { code: error.code, message: String(error.message).slice(0, 600) }); throw error; }
  }
  check("all 135 predecessor migrations apply from zero, and ADMIN-AE1 is the 136th and sorts last", applied === 135 && files.length === 136 && files.at(-1) === AE1, { applied, total: files.length });

  const KEYS = ["admin.dashboard.counts.read", "admin.nutrition.certification.pending.read", "admin.restaurants.about.read", "admin.restaurants.branches.read", "admin.restaurants.contact.read", "admin.restaurants.geo.read", "admin.restaurants.hours.read", "admin.restaurants.menu_item.read", "admin.restaurants.menu_items.read", "admin.restaurants.menu.read", "admin.restaurants.menu_management.data_quality.read", "admin.restaurants.menu_management.pending.read", "admin.restaurants.menu_management.read", "admin.restaurants.menus.read", "admin.restaurants.read", "admin.social.policies.read"];
  const fingerprint = async () => ({
    // Catalogue readable only through the sealed writer (FORCE RLS): read via SET ROLE from the superuser session.
    catalog: (await asRole("staff_authority_write_authority", null, "select permission_key, lifecycle_status, readiness_status, sensitivity_class, individually_provisionable, temporary_grantable, ordinary_supervisor_delegable, privileged_only, deferred, console_admission_required, created_at::text c, updated_at::text u from admin_internal.staff_permission_catalog order by 1")).rows,
    counts: {},
    functions: (await q("select md5(string_agg(p.oid::regprocedure::text||':'||md5(pg_get_functiondef(p.oid))||':'||coalesce(p.proacl::text,''), '|' order by p.oid::regprocedure::text)) h, count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','admin_internal')"))[0],
    policies: (await q("select md5(string_agg(schemaname||'.'||tablename||':'||policyname||':'||cmd||':'||roles::text, '|' order by schemaname,tablename,policyname)) h, count(*)::int n from pg_policies where schemaname in ('public','admin_internal')"))[0],
    tableAcl: (await q("select md5(string_agg(n.nspname||'.'||c.relname||':'||coalesce(c.relacl::text,''), '|' order by n.nspname,c.relname)) h from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','admin_internal') and c.relkind='r'"))[0].h,
    memberships: (await q("select md5(string_agg(r.rolname||'>'||m.rolname||':'||g.rolname||':'||a.admin_option||a.inherit_option||a.set_option, '|' order by r.rolname, m.rolname, g.rolname)) h, count(*)::int n from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member join pg_roles g on g.oid=a.grantor"))[0],
    roles: (await q("select count(*)::int n from pg_roles"))[0].n
  });
  const tableCounts = async () => { const out = {}; for (const { t } of await q("select n.nspname||'.'||c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_internal' and c.relkind='r' order by 1")) out[t] = (await q(`select count(*)::int n from ${t}`))[0].n; return out; };

  // ---- fixtures for the functional proof (created BEFORE the migration, superuser session) -------------------------------
  const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`; })();
  const actor = uuid(), actorSession = uuid(), baseA = uuid(), baseB = uuid(), baseC = uuid();
  await q("insert into auth.users(id,email) values ($1,'actor@invalid.test'),($2,'base-a@invalid.test'),($3,'base-b@invalid.test'),($4,'base-c@invalid.test')", [actor, baseA, baseB, baseC]);
  await q("insert into auth.sessions(id,user_id) values ($1,$2)", [actorSession, actor]);
  const staff = {};
  for (const [name, id] of [["actor", actor], ["baseA", baseA], ["baseB", baseB], ["baseC", baseC]]) staff[name] = (await q("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id", [id]))[0].id;
  await q("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) select $1,permission_key,'migration_backfill','active',now()-interval '1 day' from admin_internal.staff_permission_catalog where permission_key in ('admin.management.staff.account.write','admin.management.staff.delegation.write','admin.management.staff.console_admission.write','admin.management.staff.permission.write','admin_context.read')", [staff.actor]);
  for (const who of ["baseA", "baseB", "baseC"]) await q("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) values ($1,'admin_context.read','migration_backfill','active',now()-interval '1 day')", [staff[who]]);

  // ---------------- BEFORE ------------------------------------------------------------------------------------------------
  const before = await fingerprint(); before.counts = await tableCounts();
  check("BEFORE: catalogue is exactly the eleven known rows (ten current, one planned) and no AE1 key exists", before.catalog.length === 11 && before.catalog.filter((r) => r.readiness_status === "current").length === 10 && before.catalog.filter((r) => KEYS.includes(r.permission_key)).length === 0, before.catalog.map((r) => r.permission_key));
  const contextOf = async (userId, sessionId) => (await asRole("authenticated", { sub: userId, session_id: sessionId ?? uuid(), aal: "aal1" }, "select permission_key from public.staff_current_context_v1()")).rows?.map((r) => r.permission_key).sort();
  const baseBefore = await contextOf(baseA);
  check("BEFORE: a base Admin (console admission only) resolves exactly [admin_context.read]", JSON.stringify(baseBefore) === JSON.stringify(["admin_context.read"]), baseBefore);

  // ---------------- mutant migrations: every one must refuse to commit ------------------------------------------------------
  const text = fs.readFileSync(path.join(MIGRATIONS, AE1), "utf8");
  async function mutantRefuses(name, sqlText, expected) {
    const c = await connect("postgres");
    try { await c.query(sqlText); check(`mutant refused: ${name}`, false, "mutant migration committed"); await c.query("rollback").catch(() => {}); }
    catch (error) { try { await c.query("rollback"); } catch {} check(`mutant refused: ${name}`, expected.test(String(error.message)), error.message); }
    finally { await c.end(); }
  }
  await mutantRefuses("one key row missing", text.replace("  ('admin.social.policies.read', 'PUBLIC')\n", "").replace("  ('admin.restaurants.read', 'RESTAURANT_OPERATIONAL'),\n", "  ('admin.restaurants.read', 'RESTAURANT_OPERATIONAL')\n"), /ae1_catalog_delta_mismatch/);
  await mutantRefuses("an umbrella key inserted with the rest", text.replace("  ('admin.social.policies.read', 'PUBLIC')\n", "  ('admin.social.policies.read', 'PUBLIC'),\n  ('admin_all.read', 'RESTAURANT_OPERATIONAL')\n"), /ae1_catalog_delta_mismatch/);
  await mutantRefuses("keys made supervisor-delegable instead of privileged-only", text.replace("'current', v.sensitivity_class, true, true, false, true, false, false", "'current', v.sensitivity_class, true, true, true, false, false, false"), /ae1_new_key_shape_mismatch/);
  await mutantRefuses("keys given the wrong sensitivity class", text.replace("('admin.restaurants.read', 'RESTAURANT_OPERATIONAL')", "('admin.restaurants.read', 'SECURITY_AUTH')"), /ae1_new_key_shape_mismatch/);
  await mutantRefuses("a default entitlement is created for a new key", text.replace("-- Fail-closed postconditions: only the intended delta occurred.", "insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) select id,'admin.restaurants.read','direct_grant','active',now() from admin_internal.staff_accounts;\n-- Fail-closed postconditions: only the intended delta occurred."), /ae1_unexpected_grant_present/);
  await mutantRefuses("the SET edge to the sealed writer is not released", text.replace("revoke staff_authority_write_authority from postgres granted by postgres;", ""), /ae1_writer_set_edge_retained/);
  await mutantRefuses("a predecessor catalogue row is silently promoted", text.replace("-- Fail-closed postconditions: only the intended delta occurred.", "update admin_internal.staff_permission_catalog set readiness_status = 'current' where permission_key = 'admin.management.staff.bundle.write';\n-- Fail-closed postconditions: only the intended delta occurred."), /ae1_(predecessor_rows_changed|catalog_delta_mismatch)/);
  // A drifted predecessor (extra catalogue row) is refused by the predecessor precondition.
  const drift = await connect("postgres");
  try {
    await drift.query("begin; grant staff_authority_write_authority to postgres with admin false, inherit false, set true; set role staff_authority_write_authority; insert into admin_internal.staff_permission_catalog(permission_key,lifecycle_status,readiness_status,sensitivity_class,individually_provisionable,temporary_grantable,ordinary_supervisor_delegable,privileged_only,deferred,console_admission_required) values ('admin.drift.probe','active','planned','PUBLIC',false,false,false,true,false,false); reset role; revoke staff_authority_write_authority from postgres granted by postgres;");
    await drift.query(text.replace(/^begin;\n/m, ""));
    check("mutant refused: drifted predecessor catalogue (extra row) fails the precondition", false, "migration committed on drift");
  } catch (error) { check("mutant refused: drifted predecessor catalogue (extra row) fails the precondition", /ae1_predecessor_catalog_mismatch/.test(String(error.message)), error.message); }
  finally { try { await drift.query("rollback"); } catch {} await drift.end(); }
  const afterMutants = await fingerprint(); afterMutants.counts = await tableCounts();
  check("all mutant migrations rolled back: the BEFORE state is byte-identical", JSON.stringify(before) === JSON.stringify(afterMutants));

  // ---------------- apply the real AE1 migration ------------------------------------------------------------------------------
  try { await runner.query(text); applied += 1; }
  catch (error) { check("ADMIN-AE1 applies as the non-superuser runner", false, { code: error.code, message: String(error.message).slice(0, 800) }); throw error; }
  check("ADMIN-AE1 applies cleanly as the non-superuser runner; 136 migrations applied", applied === 136, applied);

  // ---------------- AFTER ---------------------------------------------------------------------------------------------------------
  const after = await fingerprint(); after.counts = await tableCounts();
  const newRows = after.catalog.filter((r) => KEYS.includes(r.permission_key));
  check("AFTER: catalogue has 27 rows: 26 current, 1 planned (bundle.write still planned)", after.catalog.length === 27 && after.catalog.filter((r) => r.readiness_status === "current").length === 26 && after.catalog.filter((r) => r.readiness_status === "planned").map((r) => r.permission_key).join() === "admin.management.staff.bundle.write");
  check("AFTER: exactly the 16 AE1 keys exist, each active/current/privileged-only, provisionable, temporary-grantable, not delegable, not console-admission", newRows.length === 16 && newRows.every((r) => r.lifecycle_status === "active" && r.readiness_status === "current" && r.individually_provisionable && r.temporary_grantable && !r.ordinary_supervisor_delegable && r.privileged_only && !r.deferred && !r.console_admission_required && ["PUBLIC", "RESTAURANT_OPERATIONAL"].includes(r.sensitivity_class)), newRows);
  check("AFTER: the eleven predecessor catalogue rows are byte-identical (incl. timestamps)", JSON.stringify(before.catalog) === JSON.stringify(after.catalog.filter((r) => !KEYS.includes(r.permission_key))));
  check("AFTER: no umbrella, wildcard or blanket key exists in the catalogue", after.catalog.every((r) => !/[*%]/.test(r.permission_key) && !["admin_all.read", "platform_everything.read", "admin.read"].includes(r.permission_key)));
  check("AFTER: every function body/ACL, policy, table ACL and role membership is byte-identical (only catalogue rows changed)", JSON.stringify([before.functions, before.policies, before.tableAcl, before.memberships, before.roles]) === JSON.stringify([after.functions, after.policies, after.tableAcl, after.memberships, after.roles]), { f: [before.functions, after.functions] });
  check("AFTER: no other admin_internal table changed row count (catalogue +16 only)", Object.keys(after.counts).every((t) => after.counts[t] === before.counts[t] + (t === "admin_internal.staff_permission_catalog" ? 16 : 0)), after.counts);
  check("AFTER: postgres holds no SET edge to the sealed catalogue writer", (await q("select pg_has_role('postgres','staff_authority_write_authority','SET') s"))[0].s === false);
  check("AFTER: activation granted nothing: no entitlement exists for any AE1 key", (await q("select count(*)::int n from admin_internal.staff_permission_entitlements where permission_key = any($1)", [KEYS]))[0].n === 0);
  const baseAfter = await contextOf(baseA);
  check("AFTER: a base Admin still resolves exactly [admin_context.read] (no operational read by default)", JSON.stringify(baseAfter) === JSON.stringify(["admin_context.read"]), baseAfter);
  const anonCtx = await asRole("anon", null, "select permission_key from public.staff_current_context_v1()");
  check("AFTER: anon and service_role resolve no AE1 permission", (anonCtx.thrown === "42501" || (anonCtx.rows ?? []).length === 0) && ((await asRole("service_role", { sub: uuid() }, "select permission_key from public.staff_current_context_v1()")).rows ?? []).every((r) => !KEYS.includes(r.permission_key)));

  // ---------------- functional: the existing privileged lane grants/revokes exactly one key ---------------------------------------
  broker = await (async () => { await admin.query("create role ae1_test_broker login inherit nosuperuser nocreatedb nocreaterole nobypassrls; grant staff_step_up_receipt_issuer_authority to ae1_test_broker with admin false, inherit true, set true"); return connect("ae1_test_broker"); })();
  const FACTOR = "f".repeat(64);
  let proofN = 0;
  const receipt = async () => { const proof = (++proofN).toString(16).padStart(64, "a").slice(-64); const r = (await broker.query("select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)", [actor, actorSession, proof, FACTOR, new Date().toISOString(), uuid()])).rows[0]; return { id: r.receipt_id, proof }; };
  const grant = async (target, key) => { const r = await receipt(); return (await asActor(actor, actorSession, "aal2", "select public.staff_management_grant_privileged_permission_v2($1,$2,null,null,'test_reason',$3,$4,$5) v", [target, key, uuid(), r.id, r.proof])).rows?.[0]?.v; };
  const revoke = async (grantId, version) => { const r = await receipt(); return (await asActor(actor, actorSession, "aal2", "select public.staff_management_revoke_privileged_permission_v2($1,$2,'test_reason',$3,$4,$5) v", [grantId, version, uuid(), r.id, r.proof])).rows?.[0]?.v; };
  const gA = await grant(staff.baseA, "admin.restaurants.read");
  check("privileged lane: a Primary-shaped actor grants exactly admin.restaurants.read (Family B) via the existing v2 operator", gA?.ok === true && gA?.outcome === "applied", gA);
  const gC = await grant(staff.baseB, "admin.nutrition.certification.pending.read");
  const gD = await grant(staff.baseC, "admin.social.policies.read");
  check("privileged lane: Family C (nutrition pending) and Family D (social policies) grants are also applied", gC?.ok === true && gD?.ok === true, { gC, gD });
  const ctxA = await contextOf(baseA), ctxB = await contextOf(baseB), ctxC = await contextOf(baseC);
  check("exact grant positive: each account resolves base + exactly its one granted key", JSON.stringify(ctxA) === JSON.stringify(["admin.restaurants.read", "admin_context.read"]) && JSON.stringify(ctxB) === JSON.stringify(["admin.nutrition.certification.pending.read", "admin_context.read"]) && JSON.stringify(ctxC) === JSON.stringify(["admin.social.policies.read", "admin_context.read"]), { ctxA, ctxB, ctxC });
  check("cross-permission negative: holding one AE1 key yields no other AE1 key (no umbrella, no family bleed)", !ctxA.includes("admin.restaurants.menus.read") && !ctxA.includes("admin.social.policies.read") && !ctxB.includes("admin.restaurants.read") && !ctxC.includes("admin.restaurants.read") && !ctxC.includes("admin.nutrition.certification.pending.read"));
  const delegated = await receipt().then(async (r) => (await asActor(actor, actorSession, "aal2", "select public.staff_management_grant_permission_delegation_v2($1,'admin.restaurants.read',true,true,false,now(),null,'test_reason',$2,$3,$4) v", [staff.baseB, uuid(), r.id, r.proof])).rows?.[0]?.v);
  check("the ordinary delegated lane is closed to AE1 keys (permission_ineligible): they cannot be spread by supervisors", delegated?.ok === false && /permission_ineligible/.test(JSON.stringify(delegated)), delegated);
  const badKey = await grant(staff.baseB, "admin.engineering.read");
  check("a deferred (still-planned, uncatalogued) key cannot be granted: permission_ineligible", badKey?.ok === false && /permission_ineligible/.test(JSON.stringify(badKey)), badKey);
  const noReceipt = (await asActor(actor, actorSession, "aal2", "select public.staff_management_grant_privileged_permission_v2($1,'admin.restaurants.menus.read',null,null,'test_reason',$2,null,null) v", [staff.baseA, uuid()])).rows?.[0]?.v;
  check("existing step-up control unchanged: a grant without a live receipt is rejected (step_up_required)", noReceipt?.ok === false && /step_up_required/.test(JSON.stringify(noReceipt)), noReceipt);
  const grantRow = (await q("select privileged_permission_grant_id id, status_version::text v from admin_internal.staff_privileged_permission_grants where target_staff_account_id=$1 and permission_key='admin.restaurants.read'", [staff.baseA]))[0];
  const rv = await revoke(grantRow.id, grantRow.v);
  check("revoke via the existing v2 operator applies", rv?.ok === true && rv?.outcome === "applied", rv);
  const ctxA2 = await contextOf(baseA);
  check("revoke removes access again: the account is back to [admin_context.read]", JSON.stringify(ctxA2) === JSON.stringify(["admin_context.read"]), ctxA2);
  const auditRows = await q("select operation_kind, outcome from admin_internal.staff_management_audit_log where permission_key = 'admin.restaurants.read' order by occurred_at");
  check("existing audit trail recorded the AE1 grant and the revoke (applied, with permission key)", auditRows.length >= 2 && auditRows.some((r) => /grant/.test(r.operation_kind) && r.outcome === "applied") && auditRows.some((r) => /revoke/.test(r.operation_kind) && r.outcome === "applied"), auditRows);
  check("temporary entitlement window works for AE1 keys (temporary_grantable) via the existing operator", (await (async () => { const r = await receipt(); return (await asActor(actor, actorSession, "aal2", "select public.staff_management_grant_privileged_permission_v2($1,'admin.restaurants.hours.read',clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '1 hour','test_reason',$2,$3,$4) v", [staff.baseB, uuid(), r.id, r.proof])).rows?.[0]?.v; })())?.ok === true);

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ suite: SUITE, database: "disposable local PostgreSQL", migrationsApplied: applied, total: checks.length, passed: checks.length - failed.length, failed: failed.length, productionTouched: false, developmentTouched: false }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error("HARNESS ERROR:", error?.stack ?? error); process.exitCode = 1;
} finally {
  for (const c of [broker, runner, admin]) { try { await c?.end(); } catch {} }
  cluster?.stop();
}
