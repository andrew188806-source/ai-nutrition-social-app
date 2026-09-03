#!/usr/bin/env node
// RA-1C-P0 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// Static SQL checks cannot prove a migration compiles, and a SUPERUSER apply cannot prove it
// deploys: SR-2K-B passed 23/23 on a superuser cluster and was then refused by Development, because
// ownership checks, role-membership options and RLS all behave differently for a superuser. This
// harness therefore applies the EXACT frozen predecessor schema and then the EXACT GEO-1A migration
// to a disposable real cluster THROUGH A NON-SUPERUSER RUNNER, through COMMIT, and exercises the
// resulting authority with real queries.
//
// It is opt-in because it needs PostgreSQL binaries that are not part of this repository:
//   GEO1CP0_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   GEO1CP0_PG_MODULES  directory containing a node_modules with the `pg` client
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

const SUITE = "platform-admin-ra-1c-p0-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260904010000_platform_admin_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.GEO1CP0_PG_BIN?.trim();
const PG_MODULES = process.env.GEO1CP0_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set GEO1CP0_PG_BIN and GEO1CP0_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
    if (entry.isDirectory() && entry.name.startsWith("geo1cp0-data-")) {
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
  const dataDir = path.join(workDir, `geo1cp0-data-${process.pid}-${Date.now()}`);
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

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra1cp0-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const R = "geo1cp0-restaurant";
const B = (suffix) => `geo1cp0-branch-${suffix}`;
const ZERO_FINGERPRINT = "0".repeat(64);

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
  for (const file of files) {
    try {
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidates.push(file);
    } catch (error) {
      check(`every migration applies through COMMIT (${file})`, false,
        { code: error.code, position: error.position, internalPosition: error.internalPosition,
          schema: error.schema, table: error.table, routine: error.routine,
          message: String(error.message).slice(0, 300) });
      throw error;
    }
  }
  check("all frozen predecessors and RA-1C-P0 apply through COMMIT",
    applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one RA-1C-P0 migration",
    candidates.length === 1 && candidates[0] === "20260904020000_platform_admin_branch_status_authority.sql", candidates);

  await q(`insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','admin@test.invalid');
    insert into public.restaurants(id,name,status) values ('synthetic-fixture-restaurant','fixture','active');
    insert into public.restaurant_branches(id,restaurant_id,name,status)
      values ('synthetic-fixture-branch-b','synthetic-fixture-restaurant','branch b','active');`);
  const catalog = (await q(`select status,status_version from public.restaurant_branches where id='synthetic-fixture-branch-b'`))[0];
  check("new target version starts at zero", catalog.status === "active" && catalog.status_version === "0", catalog);
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles where rolname='platform_admin_branch_status_authority'`))[0];
  check("branch authority is sealed", role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper, role);
  const acl = (await q(`select
    has_function_privilege('authenticated','public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)','EXECUTE') authed,
    has_function_privilege('anon','public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)','EXECUTE') anon,
    has_function_privilege('service_role','public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)','EXECUTE') service,
    has_table_privilege('authenticated','public.restaurant_branches','UPDATE') client_update,
    has_column_privilege('platform_admin_branch_status_authority','public.restaurant_branches','status','UPDATE') status_update,
    has_column_privilege('platform_admin_branch_status_authority','public.restaurant_branches','name','UPDATE') name_update`))[0];
  check("only authenticated may execute the fixed RPC",acl.authed&&!acl.anon&&!acl.service,acl);
  check("clients cannot update the table and sealed writer is status-only",!acl.client_update&&acl.status_update&&!acl.name_update,acl);
  await q(`select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)`);
  const denied=(await q(`select public.platform_admin_set_restaurant_branch_status_v1('synthetic-fixture-restaurant','synthetic-fixture-branch-b','active','inactive',0,'operational_pause','20000000-0000-4000-8000-000000000001') result`))[0].result;
  check("signed-in non-admin is denied",denied.errorCode==="permission_denied",denied);
  await q(`insert into admin_internal.platform_admin_memberships(auth_user_id,role_id,status)
    values ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-00000000ad01','active')`);
  const appliedResult=(await q(`select public.platform_admin_set_restaurant_branch_status_v1('synthetic-fixture-restaurant','synthetic-fixture-branch-b','active','inactive',0,'operational_pause','20000000-0000-4000-8000-000000000002') result`))[0].result;
  check("authorized mutation applies",appliedResult.ok===true&&appliedResult.outcome==="applied"&&appliedResult.version==="1",appliedResult);
  const replay=(await q(`select public.platform_admin_set_restaurant_branch_status_v1('synthetic-fixture-restaurant','synthetic-fixture-branch-b','active','inactive',0,'operational_pause','20000000-0000-4000-8000-000000000002') result`))[0].result;
  check("exact replay is stable",JSON.stringify(replay)===JSON.stringify(appliedResult),{appliedResult,replay});
  const conflict=(await q(`select public.platform_admin_set_restaurant_branch_status_v1('synthetic-fixture-restaurant','synthetic-fixture-branch-b','inactive','inactive',0,'operational_pause','20000000-0000-4000-8000-000000000002') result`))[0].result;
  check("changed replay conflicts",conflict.errorCode==="idempotency_conflict",conflict);
  const stale=(await q(`select public.platform_admin_set_restaurant_branch_status_v1('synthetic-fixture-restaurant','synthetic-fixture-branch-b','active','inactive',0,'operational_pause','20000000-0000-4000-8000-000000000003') result`))[0].result;
  check("new stale request rejects",stale.errorCode==="stale_state",stale);
  const evidence=(await q(`select status,status_version,(select count(*) from admin_internal.platform_admin_operation_receipts) receipts from public.restaurant_branches where id='synthetic-fixture-branch-b'`))[0];
  check("one mutation and one stale rejection leave two receipts",evidence.status==="inactive"&&evidence.status_version==="1"&&evidence.receipts==="2",evidence);
  await q(`update admin_internal.platform_admin_memberships set status='revoked',revoked_at=clock_timestamp() where auth_user_id='11111111-1111-4111-8111-111111111111'`);
  const afterRevoke=(await q(`select public.platform_admin_set_restaurant_branch_status_v1('synthetic-fixture-restaurant','synthetic-fixture-branch-b','inactive','active',1,'operational_resume','20000000-0000-4000-8000-000000000004') result`))[0].result;
  check("revoked actor is immediately denied",afterRevoke.errorCode==="permission_denied",afterRevoke);
} catch (error) {
  check("suite execution",false,{code:error.code,message:String(error.message).slice(0,500)});
} finally {
  try { await runner?.end(); } catch {}
  try { await client?.end(); } catch {}
  try { cluster?.stop(); } catch {}
  clearTimeout(watchdog);
}
console.log(JSON.stringify({suite:SUITE,total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures,migrationsApplied:applied,productionTouched:false},null,2));
if(failures.length)process.exitCode=1;
