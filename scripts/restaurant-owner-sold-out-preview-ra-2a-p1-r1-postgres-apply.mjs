#!/usr/bin/env node
// RA-2A-P1-R1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// Static SQL checks cannot prove a migration compiles, and a SUPERUSER apply cannot prove it
// deploys: SR-2K-B passed 23/23 on a superuser cluster and was then refused by Development, because
// ownership checks, role-membership options and RLS all behave differently for a superuser. This
// harness therefore applies the EXACT frozen predecessor schema and then the EXACT RA-2A-P1-R1 migration
// to a disposable real cluster THROUGH A NON-SUPERUSER RUNNER, through COMMIT, and exercises the
// resulting authority with real queries.
//
// It is opt-in because it needs PostgreSQL binaries that are not part of this repository:
//   RA2AP1R1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2AP1R1_PG_MODULES  directory containing a node_modules with the `pg` client
// Provision both with `npm install embedded-postgres@17.6.0-beta.15` into a scratch directory; that
// build matches Development's PostgreSQL 17.6 exactly. Without them the harness reports `skipped`
// rather than pretending to have proven anything.
//
// LIFECYCLE. `process.kill` on Windows leaves the postmaster's backends alive holding the data
// directory and any inherited handle, which is how a FINISHED proof can sit "Running" forever. The
// whole process tree is killed, teardown is registered on every exit path rather than only in a
// `finally`, strays from a previous run are reaped on start-up, and a watchdog fails closed.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-sold-out-preview-ra-2a-p1-r1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql";
const CANDIDATE = "20260904040000_restaurant_owner_branch_menu_item_sold_out_preview.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2AP1R1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2AP1R1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2AP1R1_PG_BIN and RA2AP1R1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
  }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");

// --- Supabase platform surface the repository's migrations assume but never create ---------------
const BOOTSTRAP = `
create extension if not exists pgcrypto;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'authenticator'; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_realtime_admin') then create role supabase_realtime_admin nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin noinherit; end if;
  -- THE MIGRATION RUNNER IS NOT A SUPERUSER. On a real Supabase project the cluster superuser is
  -- \`supabase_admin\` and migrations run as \`postgres\`, which is merely privileged. A superuser
  -- bypasses every ownership check, every role-membership option and RLS, so applying migrations as
  -- one proves far less than it appears to.
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres') then create role postgres login nosuperuser createrole createdb; end if;
end
$$;
alter role postgres nosuperuser createrole createdb;
grant anon, authenticated, service_role to authenticator;
alter database postgres owner to postgres;
alter schema public owner to pg_database_owner;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth authorization supabase_admin;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant select on table auth.users to service_role;
grant references, select on table auth.users to postgres;
create schema if not exists storage authorization supabase_admin;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role, postgres;
grant supabase_storage_admin to postgres with inherit true, set true;
create schema if not exists realtime authorization supabase_admin;
create table if not exists realtime.messages (
  id uuid not null default gen_random_uuid(), topic text not null, extension text not null,
  event text, payload jsonb, private boolean default false,
  inserted_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table realtime.messages owner to supabase_realtime_admin;
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text
$$;
alter function realtime.topic() owner to supabase_realtime_admin;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
begin
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private);
end;
$$;
alter function realtime.send(jsonb, text, text, boolean) owner to supabase_realtime_admin;
grant usage on schema realtime to anon, authenticated, service_role;
grant select on table realtime.messages to authenticated;
grant usage on schema realtime to postgres with grant option;
grant insert, select on table realtime.messages to postgres;
grant execute on function realtime.send(jsonb, text, text, boolean) to postgres;
alter table realtime.messages owner to postgres;
grant insert, select on table realtime.messages to supabase_realtime_admin;
`;

// --- disposable cluster ---------------------------------------------------------------------------
const ACTIVE = new Set();
let guardsInstalled = false;
function treeKill(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  }
}
function removeDir(dir) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { /* handles closing */ }
  }
}
function installGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;
  const teardown = () => { for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } } };
  process.on("exit", teardown);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
    process.on(signal, () => { teardown(); process.exit(130); });
  }
  process.on("uncaughtException", (error) => { teardown(); console.error(error); process.exit(1); });
  process.on("unhandledRejection", (error) => { teardown(); console.error(error); process.exit(1); });
}
function reapStrays(workDir) {
  if (!fs.existsSync(workDir)) return;
  for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("ra2ap1r1-data-")) {
      const pidFile = path.join(workDir, entry.name, "postmaster.harness.pid");
      if (fs.existsSync(pidFile)) treeKill(Number(fs.readFileSync(pidFile, "utf8").trim()));
      removeDir(path.join(workDir, entry.name));
    }
  }
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
async function startCluster(workDir) {
  installGuards();
  const dataDir = path.join(workDir, `ra2ap1r1-data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"),
    ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"],
    { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const out = fs.openSync(logFile, "a");
  const server = child.spawn(exe("postgres"),
    ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1",
      "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"],
    { detached: true, windowsHide: true, stdio: ["ignore", out, out] });
  server.unref();
  fs.writeFileSync(path.join(dataDir, "postmaster.harness.pid"), String(server.pid));

  let stopped = false;
  const cluster = {
    port,
    stop() {
      if (stopped) return;
      stopped = true;
      ACTIVE.delete(cluster);
      treeKill(server.pid);
      try { fs.closeSync(out); } catch { /* already closed */ }
      removeDir(dataDir);
      try { fs.rmSync(logFile, { force: true }); } catch { /* in use */ }
    }
  };
  ACTIVE.add(cluster);

  // An open port is not readiness: the postmaster answers 57P03 while still starting up.
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


// --- assertions ------------------------------------------------------------------------------------
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2ap1r1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const PREVIEW = "public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)";
const MUTATE = "public.restaurant_owner_set_branch_menu_item_sold_out_v1(text,boolean,boolean,bigint)";
const WRITER = "restaurant_owner_branch_menu_item_write_authority";
const AUDIT = "restaurant_internal.branch_menu_item_sold_out_audit_log";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const STRANGER = "55555555-5555-4555-8555-555555555555";

let cluster;
let client;
let runner;
let applied = 0;
let candidates = [];
try {
  cluster = await startCluster(workDir);
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);

  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations are applied by a non-superuser runner, as the platform applies them",
    identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let rolesBefore = null;
  for (const file of files) {
    try {
      if (file === CANDIDATE) rolesBefore = (await q(`select count(*)::int as n from pg_roles`))[0].n;
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidates.push(file);
    } catch (error) {
      check(`every migration applies through COMMIT (${file})`, false,
        { code: error.code, position: error.position, schema: error.schema, table: error.table,
          routine: error.routine, message: String(error.message).slice(0, 400) });
      throw error;
    }
  }
  check("all frozen predecessors, RA-2A-P1 and RA-2A-P1-R1 apply through COMMIT",
    applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ---------------------------------------------------------------- shape and security
  const meta = (await q(`select pg_get_userbyid(proowner) as owner, prosecdef, provolatile,
      proconfig::text as config, pg_get_function_result(p.oid) as result,
      pg_get_function_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='restaurant_owner_preview_branch_menu_item_sold_out_v1'`))[0];
  check("exactly one preview exists, STABLE, SECURITY DEFINER, owned by the existing sealed writer",
    meta && meta.owner === WRITER && meta.prosecdef === true && meta.provolatile === "s", meta);
  check("the preview pins an empty search_path and row_security on",
    /search_path=/.test(meta.config) && /row_security=on/.test(meta.config), meta.config);
  check("the preview takes only selector parameters, never an actor, role or permission",
    meta.args === "p_restaurant_id text, p_branch_id text, p_branch_menu_item_id text", meta.args);
  const rolesAfter = (await q(`select count(*)::int as n from pg_roles`))[0].n;
  check("the successor migration created no new role",
    rolesBefore !== null && rolesAfter === rolesBefore, { before: rolesBefore, after: rolesAfter });
  const acl = (await q(`select
    has_function_privilege('authenticated','${PREVIEW}','EXECUTE') authed,
    has_function_privilege('anon','${PREVIEW}','EXECUTE') anon,
    has_function_privilege('service_role','${PREVIEW}','EXECUTE') service,
    has_function_privilege('authenticator','${PREVIEW}','EXECUTE') authr,
    has_table_privilege('authenticated','public.branch_menu_items','SELECT') client_select,
    has_table_privilege('authenticated','public.branch_menu_items','UPDATE') client_update,
    has_table_privilege('authenticated','${AUDIT}','SELECT') client_audit`))[0];
  check("only authenticated may execute the preview", acl.authed && !acl.anon && !acl.service && !acl.authr, acl);
  check("no client role gained direct table access for the preview",
    !acl.client_select && !acl.client_update && !acl.client_audit, acl);

  // ---------------------------------------------------------------- fixtures
  await q(`insert into auth.users(id,email) values
      ($1,'owner-a@test.invalid'),($2,'owner-b@test.invalid'),($3,'mgr@test.invalid'),
      ($4,'stranger@test.invalid')`, [OWNER_A, OWNER_B, MANAGER, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values
      ('r1-rest-a','A','active'),('r1-rest-b','B','draft')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
      ('r1-branch-a','r1-rest-a','A branch','active'),('r1-branch-b','r1-rest-b','B branch','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values
      ('r1-menu-a','r1-rest-a','A menu','published'),('r1-menu-b','r1-rest-b','B menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values
      ('r1-cat-a','r1-menu-a','A cat'),('r1-cat-b','r1-menu-b','B cat')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
      ('r1-item-a','r1-rest-a','r1-cat-a','A item','active'),
      ('r1-item-b','r1-rest-b','r1-cat-b','B item','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability)
      values ('r1-bmi-a','r1-rest-a','r1-branch-a','r1-item-a',10,'available'),
             ('r1-bmi-b','r1-rest-b','r1-branch-b','r1-item-b',20,'available')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
      ($1,'enabled'),($2,'enabled'),($3,'enabled') returning id, auth_user_id`, [OWNER_A, OWNER_B, MANAGER]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (key) => (await q(`select id from public.restaurant_roles where role_key=$1`, [key]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
      ($1,'r1-rest-a',$4,'active'),($2,'r1-rest-b',$4,'active'),($3,'r1-rest-a',$5,'active')`,
    [uid(OWNER_A), uid(OWNER_B), uid(MANAGER), await roleId("owner"), await roleId("manager")]);
  await q(`grant anon, authenticated, service_role to postgres`);

  const asClient = async (actor, sql, params) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await c.connect();
    try {
      await c.query("begin");
      if (actor) await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [actor]);
      await c.query("set local role authenticated");
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows[0].out;
    } catch (e) { try { await c.query("rollback"); } catch {} return { thrown: e.code + " " + String(e.message).slice(0, 140) }; }
    finally { await c.end(); }
  };
  const preview = (actor, args) => asClient(actor,
    `select public.restaurant_owner_preview_branch_menu_item_sold_out_v1($1,$2,$3) as out`, args);
  const mutate = (actor, args) => asClient(actor,
    `select public.restaurant_owner_set_branch_menu_item_sold_out_v1($1,$2,$3,$4::bigint) as out`, args);
  const target = async (id) => (await q(`select sold_out, sold_out_version, price, availability
    from public.branch_menu_items where id=$1`, [id]))[0];
  const auditCount = async () => (await q(`select count(*)::int as n from ${AUDIT}`))[0].n;

  // ---------------------------------------------------------------- authorised read
  const ok = await preview(OWNER_A, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"]);
  check("an authorised owner receives the exact target state and version",
    ok.ok === true && ok.state === "ready" && ok.branchMenuItemId === "r1-bmi-a"
    && ok.branchId === "r1-branch-a" && ok.menuItemId === "r1-item-a"
    && ok.soldOut === false && ok.soldOutVersion === "0", ok);
  check("the version is TEXT, never a JSON number", typeof ok.soldOutVersion === "string", typeof ok.soldOutVersion);
  check("the preview projects nothing beyond the approved vocabulary",
    JSON.stringify(Object.keys(ok).sort())
      === JSON.stringify(["branchId", "branchMenuItemId", "menuItemId", "ok", "soldOut", "soldOutVersion", "state"]),
    Object.keys(ok));
  check("the preview leaks no actor, membership, price, permission or database metadata",
    !/actor|membership|price|permission|restaurant_id|auth_user|audit/i.test(JSON.stringify(ok)), ok);

  // ---------------------------------------------------------------- refusals and privacy
  check("an unauthenticated caller is refused",
    (await preview(null, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"])).errorCode === "unauthenticated");
  check("an authenticated non-member is refused with permission_denied",
    (await preview(STRANGER, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"])).errorCode === "permission_denied");
  check("a manager is refused with permission_denied",
    (await preview(MANAGER, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"])).errorCode === "permission_denied");
  const cross = await preview(OWNER_B, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"]);
  const ghost = await preview(OWNER_B, ["r1-rest-b", "r1-branch-b", "r1-bmi-nonexistent"]);
  check("a cross-tenant target and a nonexistent target are indistinguishable",
    cross.errorCode === "target_not_found" && ghost.errorCode === "target_not_found"
    && JSON.stringify(cross) === JSON.stringify(ghost), { cross, ghost });
  const spoof = await preview(OWNER_A, ["r1-rest-b", "r1-branch-b", "r1-bmi-b"]);
  check("naming another restaurant's identifiers grants nothing: selectors are not authority",
    spoof.errorCode === "target_not_found", spoof);
  const mismatch = await preview(OWNER_A, ["r1-rest-a", "r1-branch-b", "r1-bmi-a"]);
  check("a selector that does not match the row is not found, not silently ignored",
    mismatch.errorCode === "target_not_found", mismatch);
  for (const [label, args] of [
    ["null restaurant", [null, "r1-branch-a", "r1-bmi-a"]],
    ["empty branch", ["r1-rest-a", "", "r1-bmi-a"]],
    ["null offering", ["r1-rest-a", "r1-branch-a", null]]
  ]) check(`a malformed request (${label}) is bounded as invalid_request`,
    (await preview(OWNER_A, args)).errorCode === "invalid_request");

  // ---------------------------------------------------------------- read-only proof
  const beforeState = await target("r1-bmi-a");
  const beforeAudit = await auditCount();
  for (let i = 0; i < 5; i += 1) await preview(OWNER_A, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"]);
  const afterState = await target("r1-bmi-a");
  check("repeated preview leaves the business row byte-identical",
    JSON.stringify(beforeState) === JSON.stringify(afterState), { beforeState, afterState });
  check("repeated preview writes no audit row", (await auditCount()) === beforeAudit);
  const writeAttempt = await asClient(OWNER_A,
    `select 1 as out from public.branch_menu_items where id='r1-bmi-a'`);
  check("a client still cannot read the table directly, preview or not",
    writeAttempt?.thrown !== undefined, writeAttempt);

  // ---------------------------------------------------------------- P1 still behaves, and preview tracks it
  const applyOne = await mutate(OWNER_A, ["r1-bmi-a", false, true, "0"]);
  check("the RA-2A-P1 mutation still applies unchanged",
    applyOne.ok === true && applyOne.soldOutVersion === "1", applyOne);
  check("the mutation still writes exactly one audit row", (await auditCount()) === beforeAudit + 1);
  const afterMutation = await preview(OWNER_A, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"]);
  check("the preview reports the new state and the advanced version",
    afterMutation.soldOut === true && afterMutation.soldOutVersion === "1", afterMutation);
  const recovered = await mutate(OWNER_A, ["r1-bmi-a", true, false, "1"]);
  check("canonical recovery still works and the preview follows it",
    recovered.ok === true
    && (await preview(OWNER_A, ["r1-rest-a", "r1-branch-a", "r1-bmi-a"])).soldOutVersion === "2");
  check("a stale mutation is still refused after previewing",
    (await mutate(OWNER_A, ["r1-bmi-a", false, true, "0"])).errorCode === "stale_state");
  check("the RA-2A-P1 mutation still refuses a cross-tenant target",
    (await mutate(OWNER_B, ["r1-bmi-a", false, true, "0"])).errorCode === "target_not_found");
  check("the other tenant's row was never touched",
    (await target("r1-bmi-b")).sold_out === false && (await target("r1-bmi-b")).sold_out_version === "0");
} catch (error) {
  if (failures.length === 0) check("harness executed without an unexpected error", false, String(error.message).slice(0, 400));
} finally {
  try { await runner?.end(); } catch { /* already closed */ }
  try { await client?.end(); } catch { /* already closed */ }
  try { cluster?.stop(); } catch { /* best effort */ }
  clearTimeout(watchdog);
}

console.log("\n" + JSON.stringify({
  suite: SUITE, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name), migrationsApplied: applied, candidates
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
