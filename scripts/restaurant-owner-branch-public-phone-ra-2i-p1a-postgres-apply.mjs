#!/usr/bin/env node
// RA-2I-P1A disposable PostgreSQL authority gate. No remote database or credentials are used.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-branch-public-phone-ra-2i-p1a-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const CANDIDATE = "20260910010000_restaurant_owner_branch_public_phone_authority.sql";
const PG_BIN = (process.env.RA2IP1A_PG_BIN ?? process.env.RA2HP1_PG_BIN)?.trim();
const PG_MODULES = (process.env.RA2IP1A_PG_MODULES ?? process.env.RA2HP1_PG_MODULES)?.trim();

if (!PG_BIN || !PG_MODULES
  || (!fs.existsSync(path.join(PG_BIN, "initdb.exe"))
    && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2IP1A_PG_BIN and RA2IP1A_PG_MODULES (RA2HP1_* fallbacks are accepted)"
  }, null, 2));
  process.exit(0);
}

const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const bootstrapSource = fs.readFileSync(
  path.join(ROOT, "scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"),
  "utf8"
);
const bootstrapStart = bootstrapSource.indexOf("const BOOTSTRAP = `") + "const BOOTSTRAP = `".length;
const bootstrapEnd = bootstrapSource.indexOf("\n`;", bootstrapStart);
if (bootstrapStart < "const BOOTSTRAP = `".length || bootstrapEnd < bootstrapStart) {
  throw new Error("frozen RA-2H-P1 disposable PostgreSQL bootstrap seam is unavailable");
}
const BOOTSTRAP = bootstrapSource.slice(bootstrapStart, bootstrapEnd);

const checks = [];
const failures = [];
function check(name, pass, detail) {
  const result = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore", windowsHide: true
    });
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch {
      try { process.kill(pid, "SIGKILL"); } catch { /* already stopped */ }
    }
  }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

async function startCluster() {
  const base = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2ip1a-apply-gate");
  fs.mkdirSync(base, { recursive: true });
  const dataDir = path.join(base, `data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"), [
    "-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"
  ], { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const output = fs.openSync(logFile, "a");
  const processHandle = child.spawn(exe("postgres"), [
    "-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1",
    "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"
  ], { detached: true, windowsHide: true, stdio: ["ignore", output, output] });
  processHandle.unref();
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    killTree(processHandle.pid);
    try { fs.closeSync(output); } catch { /* already closed */ }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    try { fs.rmSync(logFile, { force: true }); } catch { /* best effort */ }
  };
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try {
      await probe.connect();
      await probe.query("select 1");
      await probe.end();
      return { port, stop };
    } catch {
      try { await probe.end(); } catch { /* not connected */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  stop();
  throw new Error("disposable PostgreSQL did not become ready");
}

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const STRANGER = "44444444-4444-4444-8444-444444444444";
const WRITER = "restaurant_owner_branch_public_phone_write_authority";
const AUDIT = "restaurant_internal.branch_public_phone_audit_log";
let cluster;
let admin;
let runner;
let applied = 0;
const watchdog = setTimeout(() => {
  console.error("watchdog: P1A PostgreSQL gate exceeded 20 minutes");
  cluster?.stop();
  process.exit(1);
}, 20 * 60 * 1000);
watchdog.unref?.();
process.on("exit", () => cluster?.stop());

try {
  cluster = await startCluster();
  admin = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await admin.connect();
  const q = async (sql, params) => (await admin.query(sql, params)).rows;
  await admin.query(BOOTSTRAP);
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query(
    "select current_user, current_setting('is_superuser') as superuser"
  )).rows[0];
  check("migration runner is non-superuser", identity.current_user === "postgres"
    && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
    } catch (error) {
      check(`migration applies through COMMIT: ${file}`, false, {
        code: error.code, position: error.position, message: String(error.message).slice(0, 500)
      });
      throw error;
    }
  }
  check("all migrations apply and P1A is the sole last successor",
    applied === files.length && files.at(-1) === CANDIDATE,
    { applied, total: files.length, last: files.at(-1) });

  const privileges = (await q(`select
    has_table_privilege('authenticated','public.restaurant_branches','UPDATE') auth_update,
    has_table_privilege($1,'public.restaurant_branches','UPDATE') writer_update,
    has_column_privilege($1,'public.restaurant_branches','public_phone','UPDATE') phone_update,
    has_column_privilege($1,'public.restaurant_branches','name','UPDATE') name_update,
    has_column_privilege($1,'public.restaurant_branches','address','UPDATE') address_update,
    has_column_privilege($1,'public.restaurant_branches','status','UPDATE') status_update,
    has_column_privilege($1,'public.restaurant_branches','public_phone_version','UPDATE') version_update,
    has_column_privilege($1,'public.restaurant_branches','latitude','UPDATE') latitude_update,
    has_column_privilege($1,'public.restaurant_branches','geocode_status','UPDATE') geocode_update`,
    [WRITER]))[0];
  check("authenticated has no broad branch UPDATE", !privileges.auth_update, privileges);
  check("sealed writer updates public_phone only", privileges.phone_update
    && !privileges.writer_update && !privileges.name_update && !privileges.address_update
    && !privileges.status_update && !privileges.version_update
    && !privileges.latitude_update && !privileges.geocode_update,
  privileges);
  const rpcAcl = (await q(`select
    has_function_privilege('authenticated','public.restaurant_owner_preview_branch_public_phone_v1(text,text)','EXECUTE') preview_auth,
    has_function_privilege('anon','public.restaurant_owner_preview_branch_public_phone_v1(text,text)','EXECUTE') preview_anon,
    has_function_privilege('authenticated','public.restaurant_owner_set_branch_public_phone_v1(text,text,text,text,bigint)','EXECUTE') mutate_auth,
    has_function_privilege('anon','public.restaurant_owner_set_branch_public_phone_v1(text,text,text,text,bigint)','EXECUTE') mutate_anon,
    has_function_privilege('service_role','public.restaurant_owner_set_branch_public_phone_v1(text,text,text,text,bigint)','EXECUTE') mutate_service,
    has_function_privilege('authenticator','public.restaurant_owner_set_branch_public_phone_v1(text,text,text,text,bigint)','EXECUTE') mutate_authenticator,
    has_table_privilege('authenticated',$1,'SELECT') audit_auth,
    has_table_privilege('anon',$1,'SELECT') audit_anon,
    has_table_privilege('service_role',$1,'SELECT') audit_service`, [AUDIT]))[0];
  check("only authenticated executes the RPCs and audit stays private",
    rpcAcl.preview_auth && !rpcAcl.preview_anon && rpcAcl.mutate_auth
    && !rpcAcl.mutate_anon && !rpcAcl.mutate_service && !rpcAcl.mutate_authenticator
    && !rpcAcl.audit_auth && !rpcAcl.audit_anon && !rpcAcl.audit_service, rpcAcl);
  const metadata = await q(`select proname,pg_get_userbyid(proowner) owner,prosecdef,provolatile,
      proconfig::text config,pg_get_function_arguments(p.oid) arguments
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and proname in
      ('restaurant_owner_preview_branch_public_phone_v1',
       'restaurant_owner_set_branch_public_phone_v1') order by proname`);
  check("RPCs are sealed SECURITY DEFINER functions with pinned configuration",
    metadata.length === 2 && metadata.every((row) => row.owner === WRITER && row.prosecdef
      && /search_path=/.test(row.config) && /row_security=on/.test(row.config)), metadata);
  check("mutation accepts no caller-supplied restaurant or actor identity",
    metadata.find((row) => row.proname.includes("set_branch"))?.arguments
      .match(/restaurant_id|actor|auth_user|membership|owner_id/i) === null, metadata);
  const roleFlags = (await q(`select rolcanlogin,rolinherit,rolbypassrls from pg_roles
    where rolname=$1`, [WRITER]))[0];
  check("sealed writer is NOLOGIN NOINHERIT NOBYPASSRLS",
    !roleFlags.rolcanlogin && !roleFlags.rolinherit && !roleFlags.rolbypassrls, roleFlags);

  await q(`insert into auth.users(id,email) values
    ($1,'owner-a@invalid.test'),($2,'owner-b@invalid.test'),
    ($3,'manager@invalid.test'),($4,'stranger@invalid.test')`,
  [OWNER_A, OWNER_B, MANAGER, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values
    ('p1a-rest-a','A','active'),('p1a-rest-b','B','active')`);
  await q(`insert into public.restaurant_branches
    (id,restaurant_id,name,district,address,status,timezone_name) values
    ('p1a-branch-a','p1a-rest-a','A Branch','A District','A Address','active','Asia/Taipei'),
    ('p1a-branch-a2','p1a-rest-a','A Branch 2','A District','A2 Address','active','Asia/Taipei'),
    ('p1a-branch-b','p1a-rest-b','B Branch','B District','B Address','active','Asia/Taipei')`);
  await q(`insert into public.menus(id,restaurant_id,name,status)
    values ('p1a-menu-a','p1a-rest-a','Menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name)
    values ('p1a-category-a','p1a-menu-a','Main')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('p1a-item-a','p1a-rest-a','p1a-category-a','Item','active')`);
  await q(`insert into public.branch_menu_items
    (id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status)
    values ('p1a-bmi-a','p1a-rest-a','p1a-branch-a','p1a-item-a',100,'available',false,'available')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled') returning id,auth_user_id`,
  [OWNER_A, OWNER_B, MANAGER]);
  const userId = (actor) => users.find((row) => row.auth_user_id === actor).id;
  const roles = await q("select id,role_key from public.restaurant_roles");
  const roleId = (role) => roles.find((row) => row.role_key === role).id;
  const memberships = await q(`insert into public.restaurant_memberships
    (restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'p1a-rest-a',$4,'active'),($2,'p1a-rest-b',$4,'active'),
    ($3,'p1a-rest-a',$5,'active') returning id,restaurant_user_id`,
  [userId(OWNER_A), userId(OWNER_B), userId(MANAGER), roleId("owner"), roleId("manager")]);
  const managerMembership = memberships.find((row) => row.restaurant_user_id === userId(MANAGER)).id;
  await q(`insert into public.restaurant_membership_branch_scopes(membership_id,branch_id)
    values ($1,'p1a-branch-a2')`, [managerMembership]);
  await q("grant anon, authenticated, service_role to postgres");

  const asClient = async (actor, sql, params) => {
    const client = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await client.connect();
    try {
      await client.query("begin");
      if (actor) await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      await client.query("set local role authenticated");
      const result = await client.query(sql, params);
      await client.query("commit");
      return result.rows[0].out;
    } catch (error) {
      try { await client.query("rollback"); } catch { /* already aborted */ }
      return { thrown: `${error.code} ${String(error.message).slice(0, 160)}` };
    } finally {
      await client.end();
    }
  };
  const preview = (actor, restaurant, branch) => asClient(actor,
    "select public.restaurant_owner_preview_branch_public_phone_v1($1,$2) as out",
    [restaurant, branch]);
  const mutate = (actor, branch, operation, expected, next, version) => asClient(actor,
    "select public.restaurant_owner_set_branch_public_phone_v1($1,$2,$3,$4,$5::bigint) as out",
    [branch, operation, expected, next, version]);
  const asWriter = async (actor, sql) => {
    const client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      await client.query(`set local role ${WRITER}`);
      const result = await client.query(sql);
      await client.query("commit");
      return result.rows;
    } catch (error) {
      try { await client.query("rollback"); } catch { /* already aborted */ }
      return [{ thrown: error.code }];
    } finally {
      await client.end();
    }
  };
  const branch = async () => (await q(`select public_phone,public_phone_version,name,address,status,
    status_version,district,latitude,longitude,geocode_status,geocode_provider,
    geocode_provider_ref,geocode_normalized_address,geocode_address_fingerprint,
    geocode_resolved_at,geocode_attempts,geocode_last_error,geocode_last_attempt_at,timezone_name
    from public.restaurant_branches where id='p1a-branch-a'`))[0];
  const auditCount = async () => (await q(`select count(*)::int n from ${AUDIT}`))[0].n;
  const catalogPhone = async () => (await q(`select branch_public_phone
    from public.consumer_public_restaurant_catalog_v3 where branch_id='p1a-branch-a' limit 1`))[0];

  const initial = await preview(OWNER_A, "p1a-rest-a", "p1a-branch-a");
  check("authorized owner previews NULL and decimal-string version",
    initial.ok === true && initial.publicPhone === null && initial.publicPhoneVersion === "0", initial);
  check("unauthenticated is rejected",
    (await preview(null, "p1a-rest-a", "p1a-branch-a")).errorCode === "unauthenticated");
  check("non-member is rejected",
    (await preview(STRANGER, "p1a-rest-a", "p1a-branch-a")).errorCode === "permission_denied");
  check("caller cannot spoof restaurant ownership",
    (await preview(OWNER_B, "p1a-rest-a", "p1a-branch-a")).errorCode === "target_not_found");
  const ownRows = await asWriter(OWNER_A,
    "select id from public.restaurant_branches where id='p1a-branch-a'");
  const foreignRows = await asWriter(OWNER_B,
    "select id from public.restaurant_branches where id='p1a-branch-a'");
  check("restrictive RLS exposes the writer's own branch only",
    ownRows.length === 1 && foreignRows.length === 0, { ownRows, foreignRows });
  const foreignWrite = await asWriter(OWNER_B,
    "update public.restaurant_branches set public_phone='blocked' where id='p1a-branch-a' returning id");
  check("restrictive RLS blocks a direct cross-tenant sealed-role write",
    foreignWrite.length === 0 || foreignWrite[0].thrown !== undefined, foreignWrite);

  const before = await branch();
  const set = await mutate(OWNER_A, "p1a-branch-a", "set", null,
    "  +886 2-1234  5678 #9  ", "0");
  const afterSet = await branch();
  check("SET trims only the outside and preserves plus/interior punctuation",
    set.ok === true && set.publicPhone === "+886 2-1234  5678 #9"
    && afterSet.public_phone === "+886 2-1234  5678 #9"
    && afterSet.public_phone_version === "1", { set, afterSet });
  check("phone-only write leaves name, lifecycle, timezone and GEO byte-identical",
    ["name", "address", "district", "status", "status_version", "latitude", "longitude",
      "geocode_status", "geocode_provider", "geocode_provider_ref", "geocode_normalized_address",
      "geocode_address_fingerprint", "geocode_resolved_at", "geocode_attempts",
      "geocode_last_error", "geocode_last_attempt_at", "timezone_name"]
      .every((key) => before[key] === afterSet[key]),
  { before, afterSet });
  const offering = (await q(`select price,availability,sold_out,branch_specific_status
    from public.branch_menu_items where id='p1a-bmi-a'`))[0];
  check("phone SET leaves price, availability, sold_out and branch status untouched",
    offering.price === "100.00" && offering.availability === "available"
    && offering.sold_out === false && offering.branch_specific_status === "available", offering);
  check("SET writes one private audit receipt",
    await auditCount() === 1 && (await q(`select action,actor_auth_user_id,previous_public_phone,
      next_public_phone from ${AUDIT}`))[0].action === "SET");
  check("public catalogue exposes SET phone", (await catalogPhone()).branch_public_phone === set.publicPhone);

  const invalids = [
    ["whitespace-only", "   "], ["empty", ""], ["33 code points", "電".repeat(33)],
    ["newline", "12\n34"], ["CR", "12\r34"], ["tab", "12\t34"],
    ["C1 control", `12${String.fromCharCode(0x85)}34`]
  ];
  for (const [name, value] of invalids) {
    const result = await mutate(OWNER_A, "p1a-branch-a", "set", set.publicPhone, value, "1");
    check(`${name} SET is rejected`, result.errorCode === "invalid_request", result);
  }
  const nul = await mutate(OWNER_A, "p1a-branch-a", "set", set.publicPhone,
    `12${String.fromCharCode(0)}34`, "1");
  check("NUL input is rejected before storage",
    nul.errorCode === "invalid_request" || nul.thrown !== undefined, nul);
  for (const [name, value] of [["1 code point", "電"], ["32 code points", "電".repeat(32)]]) {
    const current = await branch();
    const result = await mutate(OWNER_A, "p1a-branch-a", "set",
      current.public_phone, value, current.public_phone_version);
    check(`${name} SET is accepted`, result.ok === true && result.publicPhone === value, result);
  }

  const current = await branch();
  check("wrong restaurant membership cannot mutate the branch",
    (await mutate(OWNER_B, "p1a-branch-a", "set", current.public_phone, "x",
      current.public_phone_version)).errorCode === "target_not_found");
  check("branch-scoped manager cannot mutate an unscoped branch",
    (await mutate(MANAGER, "p1a-branch-a", "set", current.public_phone, "x",
      current.public_phone_version)).errorCode === "permission_denied");
  check("stale version is rejected",
    (await mutate(OWNER_A, "p1a-branch-a", "set", current.public_phone, "x", "0"))
      .errorCode === "stale_state");
  const clear = await mutate(OWNER_A, "p1a-branch-a", "clear",
    current.public_phone, null, current.public_phone_version);
  check("CLEAR stores NULL and advances its own version", clear.ok === true
    && clear.publicPhone === null && (await branch()).public_phone === null, clear);
  check("CLEAR already NULL is deterministic no_change",
    (await mutate(OWNER_A, "p1a-branch-a", "clear", null, null,
      clear.publicPhoneVersion)).errorCode === "no_change");
  check("public catalogue exposes NULL after CLEAR without depublishing",
    (await catalogPhone())?.branch_public_phone === null, await catalogPhone());

  const columns = await q(`select table_name,column_name,ordinal_position from information_schema.columns
    where table_schema='public' and table_name in
      ('consumer_public_restaurant_catalog_v2','consumer_public_restaurant_catalog_v3')
    order by table_name,ordinal_position`);
  const v2 = columns.filter((row) => row.table_name.endsWith("v2")).map((row) => row.column_name);
  const v3 = columns.filter((row) => row.table_name.endsWith("v3")).map((row) => row.column_name);
  check("v3 is exactly v2 plus branch_public_phone", JSON.stringify(v3)
    === JSON.stringify([...v2, "branch_public_phone"]), { v2, v3 });
  const catalogue = (await q(`select branch_name,branch_temporal_state,branch_price,
    branch_availability,branch_public_phone from public.consumer_public_restaurant_catalog_v3
    where branch_id='p1a-branch-a' limit 1`))[0];
  check("branch name, temporal and RA-2A-D offering semantics remain present",
    catalogue.branch_name === "A Branch"
    && ["OPEN", "CLOSED", "UNKNOWN"].includes(catalogue.branch_temporal_state)
    && catalogue.branch_price === "100.00" && catalogue.branch_availability === "available",
  catalogue);
  check("audit is append-only for the writer",
    !(await q("select has_table_privilege($1,$2,'UPDATE') value", [WRITER, AUDIT]))[0].value
    && !(await q("select has_table_privilege($1,$2,'DELETE') value", [WRITER, AUDIT]))[0].value);
  check("no website, social or email column was introduced by P1A",
    (await q(`select count(*)::int n from information_schema.columns
      where table_schema='public' and table_name='restaurant_branches'
        and column_name in ('website','homepage','instagram','facebook','line','public_email')`))[0].n === 0);
} catch (error) {
  if (failures.length === 0) check("harness completed without unexpected error", false, {
    code: error.code, message: String(error.message).slice(0, 500)
  });
} finally {
  try { await runner?.end(); } catch { /* already closed */ }
  try { await admin?.end(); } catch { /* already closed */ }
  cluster?.stop();
  clearTimeout(watchdog);
}

console.log(JSON.stringify({
  suite: SUITE,
  status: failures.length ? "failed" : "passed",
  database: "disposable local PostgreSQL",
  migrationsApplied: applied,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  productionTouched: false,
  developmentTouched: false
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
