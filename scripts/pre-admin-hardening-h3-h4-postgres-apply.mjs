#!/usr/bin/env node
// H3 + H4 -- disposable local PostgreSQL 17 gate. Never connects to Development or Production.
// Model: bootstrap superuser `supabase_admin` (initdb), migration runner `postgres` as a NON-superuser
// CREATEROLE role (the Supabase platform shape). A superuser apply gate cannot see the H3 defect: the
// P3H `revoke ... from public` on gate-owned functions is a silent no-op for a non-owner runner.
// Proves: BEFORE state reproduces Development; H3/H4 apply from zero; exact AFTER ACL/RLS; functional
// step-up flow unchanged; every client-role denial; mutant migrations are killed by the epilogues.
import fs from "node:fs"; import path from "node:path"; import net from "node:net"; import child from "node:child_process"; import { createRequire } from "node:module";
const SUITE = "pre-admin-hardening-h3-h4-postgres-apply";
const PG_BIN = (process.env.H34_PG_BIN ?? process.env.R2E_PG_BIN ?? process.env.R2B_PG_BIN)?.trim();
const PG_MODULES = (process.env.H34_PG_MODULES ?? process.env.R2E_PG_MODULES ?? process.env.R2B_PG_MODULES)?.trim();
if (!PG_BIN || !PG_MODULES || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: "set H34_PG_BIN and H34_PG_MODULES (or R2E_PG_BIN / R2E_PG_MODULES)" }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const ROOT = process.cwd(), MIGRATIONS = path.join(ROOT, "supabase/migrations");
const H3 = "20260919020000_staff_management_v2_outer_acl_hardening_h3.sql", H4 = "20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql";
const bootstrapSource = fs.readFileSync(path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"), "utf8");
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapSource.indexOf("\n`;", bootstrapStart));
const BOOTSTRAP_EXTRA = "create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id)); grant select on auth.sessions to postgres;";

const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!pass && detail !== undefined) console.log("   detail:", JSON.stringify(detail).slice(0, 700)); };
function kill(pid) { if (!pid) return; if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else try { process.kill(pid, "SIGKILL"); } catch {} }
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); server.on("error", reject); });
async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "h34-apply-gate"); fs.mkdirSync(base, { recursive: true });
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
  check("migration runner is a NON-superuser postgres (the platform shape)", identity.current_user === "postgres" && identity.superuser === "off", identity);

  // The exact ADMIN-AE1 (20260920010000) and ADMIN-B1 (20260920020000) successors are proven by their own gates; this gate covers the 135 migrations through H4.
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f !== "20260920010000_admin_operational_read_permissions_ae1.sql" && f !== "20260920020000_admin_restaurant_operational_read_foundation_b1.sql").sort();
  const predecessors = files.filter((f) => f !== H3 && f !== H4);
  for (const file of predecessors) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`predecessor applies: ${file}`, false, { code: error.code, message: String(error.message).slice(0, 600) }); throw error; }
  }
  check("exactly 133 predecessor migrations apply from zero; H3 and H4 are the only successors and sort last in order", applied === 133 && files.length === 135 && files.at(-2) === H3 && files.at(-1) === H4, { applied, total: files.length });

  // Development fidelity: the live catalog (read 2026-09-19) shows both lookup tables carrying the platform default residue
  // anon=Dxtm, authenticated=rDxtm, service_role=Dxtm (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) beside authenticated SELECT.
  // A bare local cluster has no such default privileges, so reproduce the measured state on exactly these two tables.
  await runner.query("grant truncate, references, trigger, maintain on table public.social_interest_catalog, public.social_interest_catalog_label to anon, authenticated, service_role");
  const V2 = ["staff_management_link_staff_account_v2", "staff_management_suspend_staff_account_v2", "staff_management_reactivate_staff_account_v2", "staff_management_revoke_staff_account_v2", "staff_management_grant_permission_delegation_v2", "staff_management_revoke_permission_delegation_v2", "staff_management_grant_console_admission_v2", "staff_management_revoke_console_admission_v2", "staff_management_grant_privileged_permission_v2", "staff_management_revoke_privileged_permission_v2"];
  const V1_MUTATORS = V2.map((n) => n.replace(/_v2$/, "_v1"));
  const v2State = async () => q(`select p.oid::regprocedure::text sig, p.proname, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proacl::text acl,
    exists (select 1 from aclexplode(coalesce(p.proacl,'{}')) a where a.grantee=0) public_exec,
    has_function_privilege('anon',p.oid,'EXECUTE') anon, has_function_privilege('authenticated',p.oid,'EXECUTE') auth,
    has_function_privilege('service_role',p.oid,'EXECUTE') svc, has_function_privilege('authenticator',p.oid,'EXECUTE') authr,
    md5(pg_get_functiondef(p.oid)) body, p.proconfig::text cfg
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'staff\\_management\\_%\\_v2' escape '\\' order by 1`);
  const v1State = async () => q(`select p.proname, has_function_privilege('anon',p.oid,'EXECUTE') anon, has_function_privilege('authenticated',p.oid,'EXECUTE') auth from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname = any($1) order by 1`, [V1_MUTATORS]);

  // ================= BEFORE: reproduce the Development defect =====================================
  const before = await v2State(), v1Before = await v1State();
  check("BEFORE H3: exactly the ten v2 wrappers exist, SECURITY DEFINER, owned by the sealed gate role", before.length === 10 && before.every((r) => r.prosecdef && r.owner === "staff_step_up_gate_authority") && JSON.stringify(before.map((r) => r.proname).sort()) === JSON.stringify([...V2].sort()), before.map((r) => r.proname));
  check("BEFORE H3 reproduces Development: PUBLIC has EXECUTE on all ten (so anon, service_role, authenticator can too)", before.every((r) => r.public_exec && r.anon && r.svc && r.authr && r.auth), before.map((r) => [r.proname, r.acl]));
  check("BEFORE H3: the ten protected mutating _v1 functions are closed to anon and authenticated", v1Before.length === 10 && v1Before.every((r) => !r.anon && !r.auth), v1Before);

  // step-up fixtures ------------------------------------------------------------------------------------
  const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`; })();
  const actor = uuid(), noPerm = uuid(), actorSession = uuid(), noPermSession = uuid();
  await q("insert into auth.users(id,email) values ($1,'actor@invalid.test'),($2,'noperm@invalid.test')", [actor, noPerm]);
  await q("insert into auth.sessions(id,user_id) values ($1,$2),($3,$4)", [actorSession, actor, noPermSession, noPerm]);
  const actorStaff = (await q("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day') returning id", [actor]))[0].id;
  await q("insert into admin_internal.staff_accounts(auth_user_id,status,effective_from) values ($1,'active',now()-interval '1 day')", [noPerm]);
  await q("insert into admin_internal.staff_permission_entitlements(staff_account_id,permission_key,source_type,status,effective_from) select $1,permission_key,'migration_backfill','active',now()-interval '1 day' from admin_internal.staff_permission_catalog where permission_key in ('admin.management.staff.account.write','admin.management.staff.delegation.write','admin.management.staff.console_admission.write','admin.management.staff.permission.write','admin_context.read')", [actorStaff]);
  await admin.query("create role h34_test_broker login inherit nosuperuser nocreatedb nocreaterole nobypassrls; grant staff_step_up_receipt_issuer_authority to h34_test_broker with admin false, inherit true, set true");
  broker = await connect("h34_test_broker");
  const FACTOR = "f".repeat(64);
  const issue = async (who, session, proof) => (await broker.query("select * from admin_internal.staff_step_up_issue_receipt_v1($1,$2,$3,$4,$5,$6)", [who, session, proof, FACTOR, new Date().toISOString(), uuid()])).rows[0];
  const evidence = async (requestId) => (await q("select (select count(*) from admin_internal.staff_step_up_receipt_uses where request_id=$1)::int uses, (select count(*) from admin_internal.staff_security_notification_outbox where request_id=$1)::int outbox, (select string_agg(distinct operation_kind, ',') from admin_internal.staff_step_up_receipt_uses where request_id=$1) kind", [requestId]))[0];
  const link = (who, session, aal, target, receipt, proof, requestId) => asActor(who, session, aal, "select public.staff_management_link_staff_account_v2($1,now(),null,'test_reason',$2,$3,$4) v", [target, requestId, receipt, proof]);
  async function validFlow(label) {
    const proof = label.repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, "a");
    const target = uuid(); await q("insert into auth.users(id,email) values ($1,$2)", [target, `${target}@invalid.test`]);
    const receipt = await issue(actor, actorSession, proof), requestId = uuid();
    const out = await link(actor, actorSession, "aal2", target, receipt.receipt_id, proof, requestId);
    return { out: out.rows?.[0]?.v ?? out, evidence: await evidence(requestId) };
  }
  const flowBefore = await validFlow("a");
  check("BEFORE H3: a valid AAL2 step-up flow succeeds (baseline for 'behaviour unchanged')", flowBefore.out?.ok === true && flowBefore.out?.outcome === "applied" && flowBefore.evidence.uses === 1 && flowBefore.evidence.outbox >= 0, flowBefore);

  // H4 BEFORE-state reads ---------------------------------------------------------------------------------
  const catalogCount = (await q("select count(*)::int n from public.social_interest_catalog"))[0].n, labelCount = (await q("select count(*)::int n from public.social_interest_catalog_label"))[0].n;
  check("seeded lookup catalogs are populated (100 tags, 100 labels)", catalogCount === 100 && labelCount === 100, { catalogCount, labelCount });
  const SEALED = ["social_profile_projection_authority", "meal_buddy_candidate_pool_authority", "meal_buddy_card_write_authority"];
  const countAs = async (role, table, column = "tag_key") => { const r = await asRole(role, { sub: uuid() }, `select count(${column})::int n from ${table}`); return r.thrown ? r : r.rows[0].n; };
  const readsBefore = { auth: await countAs("authenticated", "public.social_interest_catalog"), authLabel: await countAs("authenticated", "public.social_interest_catalog_label"), sealed: {} };
  for (const role of SEALED) readsBefore.sealed[role] = await countAs(role, "public.social_interest_catalog");
  check("BEFORE H4: authenticated and every sealed reader read all 100 catalog rows and authenticated reads all labels", readsBefore.auth === 100 && readsBefore.authLabel === 100 && SEALED.every((r) => readsBefore.sealed[r] === 100), readsBefore);
  check("BEFORE H4: RLS is OFF on both tables", (await q("select bool_or(relrowsecurity) rls from pg_class where oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass)"))[0].rls === false);
  const residueBefore = await q("select c.relname, string_agg(a.privilege_type, ',' order by a.privilege_type) privs from pg_class c, lateral aclexplode(c.relacl) a where c.oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass) and a.grantee = 'authenticated'::regrole group by 1 order by 1");
  check("BEFORE H4: authenticated holds the default residue (TRUNCATE, TRIGGER, REFERENCES, MAINTAIN) beside SELECT", residueBefore.every((r) => /TRUNCATE/.test(r.privs) && /TRIGGER/.test(r.privs) && /REFERENCES/.test(r.privs) && /MAINTAIN/.test(r.privs) && /SELECT/.test(r.privs)), residueBefore);
  const truncateBefore = await asRole("authenticated", { sub: uuid() }, "truncate public.social_interest_catalog_label");
  check("BEFORE H4: authenticated could TRUNCATE the label table (rolled back here) -- the residue was real", truncateBefore.thrown === undefined, truncateBefore);
  check("BEFORE H4: anon cannot SELECT either table (no grant)", (await asRole("anon", null, "select 1 from public.social_interest_catalog limit 1")).thrown === "42501" && (await asRole("anon", null, "select 1 from public.social_interest_catalog_label limit 1")).thrown === "42501");

  // ================= mutant migrations: the epilogues must refuse to commit =======================
  const h3Text = fs.readFileSync(path.join(MIGRATIONS, H3), "utf8"), h4Text = fs.readFileSync(path.join(MIGRATIONS, H4), "utf8");
  async function mutantRefuses(name, sqlText, expectedMessage) {
    const c = await connect("postgres");
    try { await c.query(sqlText); check(`mutant refused: ${name}`, false, "mutant migration committed"); await c.query("rollback").catch(() => {}); }
    catch (error) { try { await c.query("rollback"); } catch {} check(`mutant refused: ${name}`, expectedMessage.test(String(error.message)), error.message); }
    finally { await c.end(); }
  }
  const stateAfterMutants = async () => JSON.stringify((await v2State()).map((r) => r.acl));
  const aclSnapshot = await stateAfterMutants();
  await mutantRefuses("H3 issued WITHOUT the owner role (the exact P3H defect) is a silent no-op and the epilogue refuses it", h3Text.replace("set local role staff_step_up_gate_authority;", "").replace("\nreset role;\n", "\n"), /H3: .* is still executable by PUBLIC/);
  await mutantRefuses("H3 that forgets to re-grant authenticated", h3Text.replace(/grant execute on function[\s\S]*?to authenticated;/, ""), /H3: .* must remain executable by authenticated/);
  await mutantRefuses("H3 that leaves the SET edge on the sealed owner", h3Text.replace("revoke staff_step_up_gate_authority from postgres granted by postgres;", ""), /H3: postgres retained a SET edge/);
  await mutantRefuses("H4 without the candidate-pool reader policy", h4Text.replace(/create policy social_interest_catalog_candidate_pool_authority_read[\s\S]*?using \(true\);\n/, ""), /H4: unexpected catalog policy set/);
  await mutantRefuses("H4 that leaves TRUNCATE on authenticated", h4Text.replace("revoke all on table public.social_interest_catalog_label from anon, authenticated;\n", "revoke all on table public.social_interest_catalog_label from anon;\n"), /H4: authenticated still holds TRUNCATE/);
  await mutantRefuses("H4 that forgets to enable RLS on the label table", h4Text.replace("alter table public.social_interest_catalog_label enable row level security;\n", ""), /H4: .*must have RLS enabled/);
  check("all mutant migrations rolled back: the BEFORE state is untouched", (await stateAfterMutants()) === aclSnapshot && (await q("select bool_or(relrowsecurity) rls from pg_class where oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass)"))[0].rls === false);

  // ================= apply the real H3 and H4 ========================================================
  for (const file of [H3, H4]) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; }
    catch (error) { check(`migration applies: ${file}`, false, { code: error.code, message: String(error.message).slice(0, 800) }); throw error; }
  }
  check("H3 and H4 apply cleanly as the non-superuser runner; total migrations applied is exactly 135", applied === 135, applied);

  // ---------------- H3 AFTER ----------------------------------------------------------------------------
  const after = await v2State(), v1After = await v1State();
  check("AFTER H3: PUBLIC, anon, service_role and authenticator have no EXECUTE on any of the ten; authenticated keeps it", after.length === 10 && after.every((r) => !r.public_exec && !r.anon && !r.svc && !r.authr && r.auth), after.map((r) => [r.proname, r.acl]));
  check("AFTER H3: ACL is exactly {owner, authenticated} for every function", after.every((r) => { const entries = r.acl.replace(/[{}]/g, "").split(",").sort(); return entries.length === 2 && entries.includes("staff_step_up_gate_authority=X/staff_step_up_gate_authority") && entries.includes("authenticated=X/staff_step_up_gate_authority"); }), after.map((r) => r.acl));
  check("AFTER H3: function bodies are byte-identical (md5 of the full definition)", JSON.stringify(before.map((r) => [r.sig, r.body])) === JSON.stringify(after.map((r) => [r.sig, r.body])));
  check("AFTER H3: SECURITY DEFINER, owner, search_path and row_security settings are unchanged", JSON.stringify(before.map((r) => [r.sig, r.prosecdef, r.owner, r.cfg])) === JSON.stringify(after.map((r) => [r.sig, r.prosecdef, r.owner, r.cfg])));
  check("AFTER H3: protected mutating _v1 layer is unchanged and still closed to client roles", JSON.stringify(v1Before) === JSON.stringify(v1After) && v1After.every((r) => !r.anon && !r.auth));
  check("AFTER H3: postgres holds no SET edge to the sealed gate owner (temporary membership removed)", (await q("select pg_has_role('postgres','staff_step_up_gate_authority','SET') s"))[0].s === false);
  const signatures = after.map((r) => r.sig);
  for (const role of ["anon", "service_role", "authenticator"]) {
    const denied = [];
    for (const sig of signatures) { const r = await asRole(role, null, `select ${sig.replace(/\(.*\)/, "")}(${sig.match(/\((.*)\)/)[1].split(",").map(() => "null").join(",")})`); denied.push(r.thrown); }
    check(`AFTER H3: ${role} is denied at the privilege boundary (42501) on all ten`, denied.length === 10 && denied.every((c) => c === "42501"), denied);
  }
  const nullCall = (name, count) => `select public.${name}(${Array(count).fill("null").join(",")}) v`;
  const arities = { staff_management_link_staff_account_v2: 7, staff_management_suspend_staff_account_v2: 6, staff_management_reactivate_staff_account_v2: 6, staff_management_revoke_staff_account_v2: 6, staff_management_grant_permission_delegation_v2: 11, staff_management_revoke_permission_delegation_v2: 6, staff_management_grant_console_admission_v2: 5, staff_management_revoke_console_admission_v2: 6, staff_management_grant_privileged_permission_v2: 8, staff_management_revoke_privileged_permission_v2: 6 };
  const authRejected = [];
  for (const name of V2) { const r = await asActor(actor, actorSession, "aal2", nullCall(name, arities[name])); authRejected.push(r.rows?.[0]?.v?.errorCode ?? r.thrown); }
  check("AFTER H3: authenticated still reaches all ten and is rejected INSIDE the gate without a receipt (step_up_required)", authRejected.length === 10 && authRejected.every((c) => c === "step_up_required"), authRejected);
  const proofX = "b".repeat(64), goodReceipt = await issue(actor, actorSession, proofX), targetX = uuid();
  await q("insert into auth.users(id,email) values ($1,'x@invalid.test')", [targetX]);
  const aal1 = (await link(actor, actorSession, "aal1", targetX, goodReceipt.receipt_id, proofX, uuid())).rows?.[0]?.v;
  check("AFTER H3: authenticated at AAL1 with a valid receipt is still rejected (step_up_aal2_required)", aal1?.errorCode === "step_up_aal2_required", aal1);
  const noPermReceipt = await issue(noPerm, noPermSession, "c".repeat(64));
  const noPermOut = (await asActor(noPerm, noPermSession, "aal2", "select public.staff_management_suspend_staff_account_v2($1,0,'test_reason',$2,$3,$4) v", [actorStaff, uuid(), noPermReceipt.receipt_id, "c".repeat(64)])).rows?.[0]?.v;
  check("AFTER H3: an unauthorized authenticated user with their own valid receipt is still rejected (permission_denied)", noPermOut?.errorCode === "permission_denied", noPermOut);
  const crossOut = (await asActor(noPerm, noPermSession, "aal2", "select public.staff_management_grant_privileged_permission_v2($1,'admin_context.read',now(),null,'test_reason',$2,$3,$4) v", [actorStaff, uuid(), noPermReceipt.receipt_id, "c".repeat(64)])).rows?.[0]?.v;
  check("AFTER H3: cross-authority attempt (unauthorized actor targets another staff account) is rejected", crossOut?.ok === false, crossOut);
  const wrongProof = (await link(actor, actorSession, "aal2", targetX, goodReceipt.receipt_id, "d".repeat(64), uuid())).rows?.[0]?.v;
  check("AFTER H3: a wrong receipt proof is rejected", wrongProof?.ok === false && /^step_up_/.test(wrongProof?.errorCode ?? ""), wrongProof);
  const newer = await issue(actor, actorSession, "e".repeat(64));
  const stale = (await link(actor, actorSession, "aal2", targetX, goodReceipt.receipt_id, proofX, uuid())).rows?.[0]?.v;
  check("AFTER H3: a superseded (stale) receipt is rejected", stale?.ok === false && /^step_up_/.test(stale?.errorCode ?? ""), stale);
  const flowAfter = await validFlow("f");
  check("AFTER H3: a valid AAL2 step-up flow still succeeds with the same outcome", flowAfter.out?.ok === true && flowAfter.out?.outcome === "applied", flowAfter);
  check("AFTER H3: audit behaviour is unchanged (exactly one receipt-use evidence row, same operation kind and outbox count)", flowAfter.evidence.uses === flowBefore.evidence.uses && flowAfter.evidence.kind === flowBefore.evidence.kind && flowAfter.evidence.outbox === flowBefore.evidence.outbox, { before: flowBefore.evidence, after: flowAfter.evidence });

  // ---------------- H4 AFTER ----------------------------------------------------------------------------
  const rls = await q("select relname, relrowsecurity, relforcerowsecurity from pg_class where oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass) order by 1");
  check("AFTER H4: RLS is enabled (not forced) on both tables", rls.length === 2 && rls.every((r) => r.relrowsecurity && !r.relforcerowsecurity), rls);
  const pols = await q("select tablename, policyname, cmd, permissive, roles::text from pg_policies where schemaname='public' and tablename like 'social_interest_catalog%' order by 1,2");
  check("AFTER H4: exactly five permissive SELECT policies exist (authenticated + three sealed readers on the catalog; authenticated on labels) and no mutation policy", pols.length === 5 && pols.every((p) => p.cmd === "SELECT" && p.permissive === "PERMISSIVE"), pols);
  const readsAfter = { auth: await countAs("authenticated", "public.social_interest_catalog"), authLabel: await countAs("authenticated", "public.social_interest_catalog_label"), sealed: {} };
  for (const role of SEALED) readsAfter.sealed[role] = await countAs(role, "public.social_interest_catalog");
  check("AFTER H4: authenticated and every sealed reader still read all 100 catalog rows; authenticated reads all 100 labels (effective behaviour preserved)", readsAfter.auth === 100 && readsAfter.authLabel === 100 && SEALED.every((r) => readsAfter.sealed[r] === 100), readsAfter);
  check("AFTER H4: anon SELECT is denied (42501) on both tables", (await asRole("anon", null, "select 1 from public.social_interest_catalog limit 1")).thrown === "42501" && (await asRole("anon", null, "select 1 from public.social_interest_catalog_label limit 1")).thrown === "42501");
  for (const role of ["anon", "authenticated"]) {
    const attempts = [
      ["INSERT catalog", "insert into public.social_interest_catalog(tag_key,namespace,depth,selectable,display_order,active) values ('h4-x','general',0,true,1,true)"],
      ["UPDATE catalog", "update public.social_interest_catalog set active = false"],
      ["DELETE catalog", "delete from public.social_interest_catalog"],
      ["TRUNCATE catalog", "truncate public.social_interest_catalog"],
      ["INSERT label", "insert into public.social_interest_catalog_label(tag_key,locale,label) values ('h4-x','zz','x')"],
      ["UPDATE label", "update public.social_interest_catalog_label set locale = locale"],
      ["DELETE label", "delete from public.social_interest_catalog_label"],
      ["TRUNCATE label", "truncate public.social_interest_catalog_label"],
      ["CREATE TRIGGER", "create trigger h4_t before insert on public.social_interest_catalog for each row execute function pg_catalog.suppress_redundant_updates_trigger()"]
    ];
    const codes = []; for (const [, sql] of attempts) codes.push((await asRole(role, { sub: uuid() }, sql)).thrown);
    check(`AFTER H4: ${role} cannot INSERT/UPDATE/DELETE/TRUNCATE either table or create a trigger (all 42501)`, codes.every((c) => c === "42501"), codes);
  }
  const countsAfter = { c: (await q("select count(*)::int n from public.social_interest_catalog"))[0].n, l: (await q("select count(*)::int n from public.social_interest_catalog_label"))[0].n };
  check("AFTER H4: data is untouched (100 / 100)", countsAfter.c === 100 && countsAfter.l === 100);
  const residueAfter = await q("select c.relname, string_agg(a.privilege_type, ',' order by a.privilege_type) privs from pg_class c, lateral aclexplode(c.relacl) a where c.oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass) and a.grantee = 'authenticated'::regrole group by 1 order by 1");
  check("AFTER H4: authenticated's table privilege is SELECT only", residueAfter.length === 2 && residueAfter.every((r) => r.privs === "SELECT"), residueAfter);
  check("AFTER H4: no privilege remains for anon on either table", (await q("select count(*)::int n from pg_class c, lateral aclexplode(c.relacl) a where c.oid in ('public.social_interest_catalog'::regclass,'public.social_interest_catalog_label'::regclass) and a.grantee = 'anon'::regrole"))[0].n === 0);
  check("AFTER H4: sealed readers keep their exact column-scoped SELECT grants (unchanged)", (await q("select attrelid::regclass::text t, attname, attacl::text from pg_attribute where attrelid='public.social_interest_catalog'::regclass and attacl is not null order by attname")).length === 7);
  const ri = await runner.query("select 1 from public.social_interest_catalog limit 1");
  check("AFTER H4: the table owner is exempt from RLS (owner-run functions unaffected)", ri.rowCount === 1);
  const validKey = (await q("select tag_key from public.social_interest_catalog limit 1"))[0].tag_key;
  const riOk = await runner.query("insert into public.social_interest_catalog_label(tag_key,locale,label) values ($1,'zz','h4-ri-probe') returning tag_key", [validKey]).then(() => "ok", (e) => `${e.code}:${e.message}`);
  check("AFTER H4: foreign-key integrity against the catalog still resolves rows under RLS (insert with a valid tag_key passes)", riOk === "ok", riOk);
  const riBad = await runner.query(`insert into public.social_interest_catalog_label(tag_key, locale, label) values ('does-not-exist','zz','x')`).then(() => "ok", (e) => e.code);
  check("AFTER H4: foreign-key integrity still rejects an unknown tag_key (23503)", riBad === "23503", riBad);
  await runner.query("delete from public.social_interest_catalog_label where locale = 'zz'");

  const failed = checks.filter((c) => !c.pass);
  console.log(JSON.stringify({ suite: SUITE, database: "disposable local PostgreSQL", migrationsApplied: applied, total: checks.length, passed: checks.length - failed.length, failed: failed.length, productionTouched: false, developmentTouched: false }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error("HARNESS ERROR:", error?.stack ?? error); process.exitCode = 1;
} finally {
  for (const c of [broker, runner, admin]) { try { await c?.end(); } catch {} }
  cluster?.stop();
}
