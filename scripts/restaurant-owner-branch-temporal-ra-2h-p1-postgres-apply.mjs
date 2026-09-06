#!/usr/bin/env node
// RA-2H-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// Opt-in: needs PostgreSQL binaries not part of this repository.
//   RA2HP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2HP1_PG_MODULES  directory containing a node_modules with the `pg` client
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql";
const CANDIDATE = "20260906030000_restaurant_owner_branch_temporal_authority.sql";
const WATCHDOG_MS = 20 * 60 * 1000;

const PG_BIN = process.env.RA2HP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2HP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES
  || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE, status: "skipped",
    reason: "set RA2HP1_PG_BIN and RA2HP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
  }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");

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

const ACTIVE = new Set();
let guardsInstalled = false;
let resultsReported = false;
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
  process.on("uncaughtException", (error) => {
    teardown();
    if (resultsReported) return; // a stray post-teardown socket event must not overwrite an already-reported result
    console.error(error); process.exit(1);
  });
  process.on("unhandledRejection", (error) => {
    teardown();
    if (resultsReported) return;
    console.error(error); process.exit(1);
  });
}
function reapStrays(workDir) {
  if (!fs.existsSync(workDir)) return;
  for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("ra2hp1-data-")) {
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
  const dataDir = path.join(workDir, `ra2hp1-data-${process.pid}-${Date.now()}`);
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

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); ready = true; } catch { /* starting */ }
    try { await probe.end(); } catch { /* never connected */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    cluster.stop();
    throw new Error(`postgres did not become ready\n${fs.readFileSync(logFile, "utf8").slice(-1500)}`);
  }
  return cluster;
}

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 500)}`);
};

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2hp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const WEEKLY_ROLE = "restaurant_owner_branch_weekly_hours_write_authority";
const SPECIAL_ROLE = "restaurant_owner_branch_special_hours_write_authority";
const CLOSURE_ROLE = "restaurant_owner_branch_operational_closure_write_authority";
const READER_ROLE = "restaurant_branch_temporal_context_reader";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const STRANGER = "55555555-5555-4555-8555-555555555555";

let cluster; let runner; let applied = 0; let candidates = [];
try {
  cluster = await startCluster(workDir);
  const client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);

  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations are applied by a non-superuser runner, without BYPASSRLS",
    identity.current_user === "postgres" && identity.superuser === "off"
    && (await q(`select rolbypassrls from pg_roles where rolname='postgres'`))[0].rolbypassrls === false,
    identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidates.push(file);
    } catch (error) {
      check(`every migration applies through COMMIT (${file})`, false,
        { code: error.code, position: error.position, schema: error.schema, table: error.table,
          routine: error.routine, message: String(error.message).slice(0, 500) });
      throw error;
    }
  }
  check("all frozen predecessors and RA-2H-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ================================================================ §6 timezone validation
  check("Asia/Taipei accepted", (await q(
    `select exists(select 1 from pg_timezone_names where name='Asia/Taipei') as ok`))[0].ok);
  check("Asia/Tokyo accepted", (await q(
    `select exists(select 1 from pg_timezone_names where name='Asia/Tokyo') as ok`))[0].ok);
  check("America/Los_Angeles accepted", (await q(
    `select exists(select 1 from pg_timezone_names where name='America/Los_Angeles') as ok`))[0].ok);
  check("Europe/London accepted", (await q(
    `select exists(select 1 from pg_timezone_names where name='Europe/London') as ok`))[0].ok);
  const badTz = await q(`insert into public.restaurants(id,name,status) values ('h-rest-bad-tz','Bad TZ','active')`)
    .then(() => q(`insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name)
      values ('h-branch-bad-tz','h-rest-bad-tz','Bad','active','Not/AZone')`))
    .then(() => ({ threw: false }))
    .catch((e) => ({ threw: true, code: e.code }));
  check("obviously invalid timezone rejected", badTz.threw === true, badTz);

  // ================================================================ fixtures
  await q(`insert into auth.users(id,email) values ($1,'a@t.invalid'),($2,'b@t.invalid'),($3,'m@t.invalid'),($4,'x@t.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values
    ('h-rest-a','A','active'), ('h-rest-b','B','active'), ('h-rest-draft','Draft','draft')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name) values
    ('h-branch-a','h-rest-a','A Main','active','Asia/Taipei'),
    ('h-branch-dst','h-rest-a','A DST','active','America/Los_Angeles'),
    ('h-branch-inactive','h-rest-a','A Inactive','inactive','Asia/Taipei'),
    ('h-branch-archived','h-rest-a','A Archived','archived','Asia/Taipei'),
    ('h-branch-b','h-rest-b','B Main','active','Asia/Taipei'),
    ('h-branch-draft','h-rest-draft','Draft Branch','active','Asia/Taipei')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled') returning id, auth_user_id`, [OWNER_A, OWNER_B, MANAGER]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (k) => (await q(`select id from public.restaurant_roles where role_key=$1`, [k]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'h-rest-a',$4,'active'),($2,'h-rest-b',$4,'active'),($3,'h-rest-a',$5,'active')`,
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
    } catch (e) {
      try { await c.query("rollback"); } catch { /* already aborted */ }
      return { thrown: e.code + " " + String(e.message).slice(0, 200) };
    } finally { await c.end(); }
  };
  const preview = (a, restaurantId, branchId, from, to) => asClient(a,
    `select public.restaurant_owner_preview_branch_temporal_v1($1,$2,$3,$4) as out`, [restaurantId, branchId, from ?? null, to ?? null]);
  const replaceWeekly = (a, restaurantId, branchId, op, intervals, version) => asClient(a,
    `select public.restaurant_owner_replace_branch_weekly_hours_v1($1,$2,$3,$4,$5::bigint) as out`,
    [restaurantId, branchId, op, intervals === null ? null : JSON.stringify(intervals), version]);
  const setSpecial = (a, restaurantId, branchId, date, op, intervals, version) => asClient(a,
    `select public.restaurant_owner_set_branch_special_hours_v1($1,$2,$3,$4,$5,$6::bigint) as out`,
    [restaurantId, branchId, date, op, intervals === null ? null : JSON.stringify(intervals), version]);
  const closeNow = (a, restaurantId, branchId, op, until, fold, version) => asClient(a,
    `select public.restaurant_owner_close_branch_now_v1($1,$2,$3,$4,$5,$6::bigint) as out`,
    [restaurantId, branchId, op, until, fold, version]);
  const scheduleClosure = (a, restaurantId, branchId, start, startFold, end, endFold, version) => asClient(a,
    `select public.restaurant_owner_schedule_branch_closure_v1($1,$2,$3,$4,$5,$6,$7::bigint) as out`,
    [restaurantId, branchId, start, startFold, end, endFold, version]);
  const reopenNow = (a, restaurantId, branchId, closureId, version) => asClient(a,
    `select public.restaurant_owner_reopen_branch_now_v1($1,$2,$3,$4::bigint) as out`,
    [restaurantId, branchId, closureId, version]);
  const cancelFuture = (a, restaurantId, branchId, closureId, version) => asClient(a,
    `select public.restaurant_owner_cancel_future_branch_closure_v1($1,$2,$3,$4::bigint) as out`,
    [restaurantId, branchId, closureId, version]);
  const state = async (branchId) => (await q(
    `select weekly_hours_configured, weekly_hours_version::text as wv, special_hours_version::text as sv,
      operational_closure_version::text as cv from public.restaurant_branch_temporal_state where branch_id=$1`,
    [branchId]))[0];
  const evaluate = async (branchId, at) => (await q(
    `select state, reason from restaurant_internal.evaluate_branch_temporal_state_v1($1, $2::timestamptz)`,
    [branchId, at]))[0];
  const weeklyAuditCount = async () => (await q(
    `select count(*)::int as n from restaurant_internal.branch_weekly_hours_audit_log`))[0].n;
  const specialAuditCount = async () => (await q(
    `select count(*)::int as n from restaurant_internal.branch_special_hours_audit_log`))[0].n;
  const closureAuditCount = async () => (await q(
    `select count(*)::int as n from restaurant_internal.branch_operational_closure_audit_log`))[0].n;

  // ================================================================ §8/9/10/13/14/15/16 WEEKLY
  console.log("\n=== weekly ===");
  const p0 = await preview(OWNER_A, "h-rest-a", "h-branch-a");
  check("weekly UNKNOWN/v0 before any configuration",
    p0.ok === true && p0.weeklyHoursConfigured === false && p0.weeklyHoursVersion === "0", p0);

  const splitShift = [
    { weekday: 1, startLocalTime: "09:00:00", endLocalTime: "14:00:00", endDayOffset: 0 },
    { weekday: 1, startLocalTime: "17:00:00", endLocalTime: "22:00:00", endDayOffset: 0 },
    { weekday: 2, startLocalTime: "18:00:00", endLocalTime: "02:00:00", endDayOffset: 1 },
    { weekday: 4, startLocalTime: "00:00:00", endLocalTime: "00:00:00", endDayOffset: 1 }
  ];
  const m1 = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", splitShift, "0");
  check("REPLACE succeeds: configured/v1, split shift + overnight + 24h",
    m1.ok === true && m1.weeklyHoursConfigured === true && m1.weeklyHoursVersion === "1", m1);
  check("weekly audit rows = 1", await weeklyAuditCount() === 1);

  const reordered = [splitShift[3], splitShift[1], splitShift[0], splitShift[2]];
  const noChange = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", reordered, "1");
  check("canonical no_change regardless of input row order",
    noChange.errorCode === "no_change", noChange);
  check("no audit row from no_change", await weeklyAuditCount() === 1);

  const staleWeekly = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", splitShift, "0");
  check("stale weekly version rejected", staleWeekly.errorCode === "stale_state", staleWeekly);

  const closedDay = [{ weekday: 5, startLocalTime: "10:00:00", endLocalTime: "20:00:00", endDayOffset: 0 }];
  const m2 = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", closedDay, "1");
  check("second real change advances to v2 (other weekdays implicitly closed by omission)",
    m2.ok === true && m2.weeklyHoursVersion === "2", m2);

  const overlapSame = [
    { weekday: 1, startLocalTime: "09:00:00", endLocalTime: "14:00:00", endDayOffset: 0 },
    { weekday: 1, startLocalTime: "13:00:00", endLocalTime: "18:00:00", endDayOffset: 0 }
  ];
  check("same-day overlap rejected", (await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a",
    "REPLACE_WEEKLY_SCHEDULE", overlapSame, "2")).errorCode === "invalid_request");

  const overlapMidnight = [
    { weekday: 1, startLocalTime: "18:00:00", endLocalTime: "02:00:00", endDayOffset: 1 },
    { weekday: 2, startLocalTime: "01:00:00", endLocalTime: "03:00:00", endDayOffset: 0 }
  ];
  check("cross-midnight overlap rejected", (await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a",
    "REPLACE_WEEKLY_SCHEDULE", overlapMidnight, "2")).errorCode === "invalid_request");

  const overlapSunMon = [
    { weekday: 7, startLocalTime: "22:00:00", endLocalTime: "04:00:00", endDayOffset: 1 },
    { weekday: 1, startLocalTime: "03:00:00", endLocalTime: "05:00:00", endDayOffset: 0 }
  ];
  check("Sunday->Monday circular overlap rejected", (await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a",
    "REPLACE_WEEKLY_SCHEDULE", overlapSunMon, "2")).errorCode === "invalid_request");

  check("zero-length interval rejected", (await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a",
    "REPLACE_WEEKLY_SCHEDULE", [{ weekday: 1, startLocalTime: "09:00:00", endLocalTime: "09:00:00", endDayOffset: 0 }], "2")
  ).errorCode === "invalid_request");
  check(">24h interval rejected (offset 1, start < end, not the 24h canonical pair)", (await replaceWeekly(
    OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE",
    [{ weekday: 1, startLocalTime: "05:00:00", endLocalTime: "23:00:00", endDayOffset: 1 }], "2")
  ).errorCode === "invalid_request");
  check("non-canonical 24h pair (05:00->05:00 offset1) rejected", (await replaceWeekly(
    OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE",
    [{ weekday: 1, startLocalTime: "05:00:00", endLocalTime: "05:00:00", endDayOffset: 1 }], "2")
  ).errorCode === "invalid_request");
  check(">8 intervals on one weekday rejected", (await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a",
    "REPLACE_WEEKLY_SCHEDULE", Array.from({ length: 9 }, (_, i) =>
      ({ weekday: 1, startLocalTime: `0${i}:00:00`, endLocalTime: `0${i}:30:00`, endDayOffset: 0 })), "2")
  ).errorCode === "invalid_request");
  check("duplicate interval rejected", (await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a",
    "REPLACE_WEEKLY_SCHEDULE", [
      { weekday: 1, startLocalTime: "09:00:00", endLocalTime: "10:00:00", endDayOffset: 0 },
      { weekday: 1, startLocalTime: "09:00:00", endLocalTime: "10:00:00", endDayOffset: 0 }
    ], "2")).errorCode === "invalid_request");

  const clearWeekly = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "CLEAR_WEEKLY_SCHEDULE", null, "2");
  check("CLEAR returns to UNKNOWN/v3", clearWeekly.ok === true && clearWeekly.weeklyHoursConfigured === false
    && clearWeekly.weeklyHoursVersion === "3", clearWeekly);
  const clearNoChange = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "CLEAR_WEEKLY_SCHEDULE", null, "3");
  check("CLEAR on already-unconfigured is no_change", clearNoChange.errorCode === "no_change", clearNoChange);

  const configuredAllClosed = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", [], "3");
  check("configured all-week-closed is distinct from UNKNOWN",
    configuredAllClosed.ok === true && configuredAllClosed.weeklyHoursConfigured === true
    && configuredAllClosed.weeklyHoursVersion === "4", configuredAllClosed);
  const abaWeekly = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", splitShift, "2");
  check("weekly ABA: old v2 rejected even though schedule cycled",
    abaWeekly.errorCode === "stale_state", abaWeekly);

  // reset h-branch-a to the split-shift schedule for later evaluator/independence tests
  const resetWeekly = await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", splitShift, "4");
  check("weekly reset for evaluator fixtures succeeds", resetWeekly.ok === true, resetWeekly);

  // ================================================================ §19-24, 41-43 SPECIAL DATES
  console.log("\n=== special dates ===");
  const sp0 = await preview(OWNER_A, "h-rest-a", "h-branch-a", "2027-01-01", "2027-01-05");
  check("special preview starts empty", Array.isArray(sp0.specialOverrides) && sp0.specialOverrides.length === 0
    && sp0.specialHoursVersion === "0", sp0);

  const s1 = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-01-01", "SET_CLOSED", null, "0");
  check("SET_CLOSED succeeds v1", s1.ok === true && s1.mode === "closed" && s1.specialHoursVersion === "1", s1);
  check("special audit rows = 1", await specialAuditCount() === 1);
  const staleSpecial = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-01-02", "SET_CLOSED", null, "0");
  check("stale special version rejected (shared branch-level token)", staleSpecial.errorCode === "stale_state", staleSpecial);

  const customHours = [{ startLocalTime: "18:00:00", endLocalTime: "02:00:00", endDayOffset: 1 }];
  const s2 = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2026-12-31", "SET_CUSTOM_HOURS", customHours, "1");
  check("SET_CUSTOM_HOURS overnight succeeds v2", s2.ok === true && s2.mode === "custom" && s2.specialHoursVersion === "2", s2);

  const jan1Closed = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-01-01", "CLEAR_OVERRIDE", null, "2");
  check("CLEAR_OVERRIDE removes the Jan-1 closed override, v3", jan1Closed.ok === true && jan1Closed.mode === null
    && jan1Closed.specialHoursVersion === "3", jan1Closed);

  check("special custom overlap within one date rejected", (await setSpecial(OWNER_A, "h-rest-a", "h-branch-a",
    "2027-02-01", "SET_CUSTOM_HOURS", [
      { startLocalTime: "09:00:00", endLocalTime: "14:00:00", endDayOffset: 0 },
      { startLocalTime: "13:00:00", endLocalTime: "18:00:00", endDayOffset: 0 }
    ], "3")).errorCode === "invalid_request");
  check("empty custom-hours array is invalid, never inferred as closed", (await setSpecial(
    OWNER_A, "h-rest-a", "h-branch-a", "2027-02-02", "SET_CUSTOM_HOURS", [], "3")).errorCode === "invalid_request");
  check(">8 special intervals rejected", (await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-02-03",
    "SET_CUSTOM_HOURS", Array.from({ length: 9 }, (_, i) =>
      ({ startLocalTime: `0${i}:00:00`, endLocalTime: `0${i}:30:00`, endDayOffset: 0 })), "3")
  ).errorCode === "invalid_request");

  const abaSpecial = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-01-01", "SET_CLOSED", null, "0");
  check("special ABA: old v0 rejected", abaSpecial.errorCode === "stale_state", abaSpecial);
  const spNoChange = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2026-12-31", "SET_CUSTOM_HOURS", customHours, "3");
  check("special no_change on identical custom hours", spNoChange.errorCode === "no_change", spNoChange);

  // spillover proof: Dec-31 18:00->02:00(+1) special custom; Jan-1 also special CLOSED.
  const jan1ClosedAgain = await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-01-01", "SET_CLOSED", null, "3");
  check("Jan-1 closed override set for spillover-edge proof", jan1ClosedAgain.ok === true, jan1ClosedAgain);
  const spilloverAt1am = await evaluate("h-branch-a", "2027-01-01T01:00:00+08:00");
  check("previous-date special spillover remains OPEN at Jan-1 01:00 despite Jan-1 being closed",
    spilloverAt1am.state === "OPEN" && spilloverAt1am.reason === "OPEN_SPECIAL_HOURS", spilloverAt1am);
  const closedAt3am = await evaluate("h-branch-a", "2027-01-01T03:00:00+08:00");
  check("Jan-1 03:00 (after the Dec-31 spillover ends) is CLOSED via the Jan-1 override",
    closedAt3am.state === "CLOSED" && closedAt3am.reason === "SPECIAL_DATE_CLOSED", closedAt3am);

  // ================================================================ §26-35, 41 OPERATIONAL CLOSURE
  console.log("\n=== operational closure ===");
  const cl0 = await preview(OWNER_A, "h-rest-a", "h-branch-a");
  check("closure preview starts empty, v0", Array.isArray(cl0.operationalClosures)
    && cl0.operationalClosures.length === 0 && cl0.operationalClosureVersion === "0", cl0);

  const c1 = await closeNow(OWNER_A, "h-rest-a", "h-branch-a", "CLOSE_NOW_INDEFINITE", null, null, "0");
  check("CLOSE_NOW_INDEFINITE succeeds v1, ends_at null", c1.ok === true && c1.endsAt === null
    && c1.operationalClosureVersion === "1", c1);
  check("closure audit rows = 1", await closureAuditCount() === 1);
  const evalDuringClosure = await evaluate("h-branch-a", new Date().toISOString());
  check("evaluator reports CLOSED/OPERATIONALLY_CLOSED while closure is active",
    evalDuringClosure.state === "CLOSED" && evalDuringClosure.reason === "OPERATIONALLY_CLOSED", evalDuringClosure);

  const staleClosure = await closeNow(OWNER_A, "h-rest-a", "h-branch-a", "CLOSE_NOW_INDEFINITE", null, null, "0");
  check("stale closure version rejected", staleClosure.errorCode === "stale_state", staleClosure);
  const conflictClosure = await closeNow(OWNER_A, "h-rest-a", "h-branch-a", "CLOSE_NOW_UNTIL",
    "2099-01-01 00:00:00", null, "1");
  check("overlapping closure command rejected as closure_conflict", conflictClosure.errorCode === "closure_conflict", conflictClosure);

  const r1 = await reopenNow(OWNER_A, "h-rest-a", "h-branch-a", c1.closureId, "1");
  check("REOPEN_NOW succeeds v2", r1.ok === true && r1.operationalClosureVersion === "2", r1);
  const evalAfterReopen = await evaluate("h-branch-a", new Date().toISOString());
  check("UNKNOWN+closure=CLOSED; after reopen, UNKNOWN branch returns to UNKNOWN (branch has weekly configured though, so expect its normal state)",
    evalAfterReopen.state !== "CLOSED" || evalAfterReopen.reason !== "OPERATIONALLY_CLOSED", evalAfterReopen);
  const abaClosure = await reopenNow(OWNER_A, "h-rest-a", "h-branch-a", c1.closureId, "1");
  check("closure ABA: old v1 rejected", abaClosure.errorCode === "stale_state", abaClosure);

  const futureStart = "2099-06-01 10:00:00";
  const sched1 = await scheduleClosure(OWNER_A, "h-rest-a", "h-branch-a", futureStart, null, "2099-06-02 10:00:00", null, "2");
  check("SCHEDULE_CLOSURE future window succeeds v3", sched1.ok === true && sched1.operationalClosureVersion === "3", sched1);
  const evalDuringScheduled = await evaluate("h-branch-a", new Date().toISOString());
  check("a future scheduled closure is not yet effective now", evalDuringScheduled.reason !== "OPERATIONALLY_CLOSED", evalDuringScheduled);
  const cancel1 = await cancelFuture(OWNER_A, "h-rest-a", "h-branch-a", sched1.closureId, "3");
  check("CANCEL_FUTURE_CLOSURE succeeds v4", cancel1.ok === true && cancel1.operationalClosureVersion === "4", cancel1);
  const cancelAgain = await cancelFuture(OWNER_A, "h-rest-a", "h-branch-a", sched1.closureId, "4");
  check("cancelling an already-cancelled closure is no_change", cancelAgain.errorCode === "no_change", cancelAgain);

  // ================================================================ §36 Admin lifecycle precedence
  console.log("\n=== admin lifecycle precedence ===");
  const inactiveClose = await closeNow(OWNER_A, "h-rest-a", "h-branch-inactive", "CLOSE_NOW_INDEFINITE", null, null, "0");
  check("Owner cannot close an Admin-inactive branch (lifecycle_blocked)", inactiveClose.errorCode === "lifecycle_blocked", inactiveClose);
  const archivedClose = await closeNow(OWNER_A, "h-rest-a", "h-branch-archived", "CLOSE_NOW_INDEFINITE", null, null, "0");
  check("Owner cannot close an Admin-archived branch (lifecycle_blocked)", archivedClose.errorCode === "lifecycle_blocked", archivedClose);
  const inactiveEval = await evaluate("h-branch-inactive", new Date().toISOString());
  check("evaluator reports ADMIN_LIFECYCLE_BLOCKED for an inactive branch regardless of hours",
    inactiveEval.state === "CLOSED" && inactiveEval.reason === "ADMIN_LIFECYCLE_BLOCKED", inactiveEval);
  const draftEval = await evaluate("h-branch-draft", new Date().toISOString());
  check("evaluator reports ADMIN_LIFECYCLE_BLOCKED when the Restaurant itself is draft",
    draftEval.state === "CLOSED" && draftEval.reason === "ADMIN_LIFECYCLE_BLOCKED", draftEval);

  // ================================================================ §44/45 UNKNOWN
  console.log("\n=== UNKNOWN evaluation ===");
  const unknownEval = await evaluate("h-branch-b", new Date().toISOString());
  check("a branch with zero configured hours evaluates UNKNOWN, not CLOSED",
    unknownEval.state === "UNKNOWN" && unknownEval.reason === "HOURS_UNKNOWN", unknownEval);
  const unknownClose = await closeNow(OWNER_B, "h-rest-b", "h-branch-b", "CLOSE_NOW_INDEFINITE", null, null, "0");
  check("closing an UNKNOWN branch succeeds", unknownClose.ok === true, unknownClose);
  const unknownPlusClosure = await evaluate("h-branch-b", new Date().toISOString());
  check("UNKNOWN + active closure = CLOSED", unknownPlusClosure.state === "CLOSED"
    && unknownPlusClosure.reason === "OPERATIONALLY_CLOSED", unknownPlusClosure);
  const reopenUnknown = await reopenNow(OWNER_B, "h-rest-b", "h-branch-b", unknownClose.closureId, "1");
  check("reopening restores UNKNOWN", reopenUnknown.ok === true, reopenUnknown);
  const backToUnknown = await evaluate("h-branch-b", new Date().toISOString());
  check("after reopen, branch returns to UNKNOWN", backToUnknown.state === "UNKNOWN"
    && backToUnknown.reason === "HOURS_UNKNOWN", backToUnknown);

  // ================================================================ §30 DST (America/Los_Angeles)
  console.log("\n=== DST civil-datetime resolution ===");
  const dstNormal = await q(`select status, instant from restaurant_internal.resolve_branch_local_datetime_v1(
    'America/Los_Angeles', '2027-01-15 10:00:00'::timestamp, null)`);
  check("normal (non-transition) local time resolves", dstNormal[0].status === "resolved" && dstNormal[0].instant, dstNormal[0]);

  // 2027-03-14 02:30 does not exist in America/Los_Angeles (spring-forward 02:00->03:00).
  const dstGap = await q(`select status, instant from restaurant_internal.resolve_branch_local_datetime_v1(
    'America/Los_Angeles', '2027-03-14 02:30:00'::timestamp, null)`);
  check("spring-forward gap rejected as nonexistent", dstGap[0].status === "nonexistent" && dstGap[0].instant === null, dstGap[0]);

  // 2027-11-07 01:30 occurs twice in America/Los_Angeles (fall-back 02:00->01:00).
  const dstAmbiguousNoFold = await q(`select status from restaurant_internal.resolve_branch_local_datetime_v1(
    'America/Los_Angeles', '2027-11-07 01:30:00'::timestamp, null)`);
  check("fall-back ambiguity without fold requires disambiguation",
    dstAmbiguousNoFold[0].status === "ambiguous_fold_required", dstAmbiguousNoFold[0]);
  const dstEarlier = await q(`select status, instant from restaurant_internal.resolve_branch_local_datetime_v1(
    'America/Los_Angeles', '2027-11-07 01:30:00'::timestamp, 'earlier')`);
  const dstLater = await q(`select status, instant from restaurant_internal.resolve_branch_local_datetime_v1(
    'America/Los_Angeles', '2027-11-07 01:30:00'::timestamp, 'later')`);
  check("fall-back earlier/later resolve to two distinct, ordered instants",
    dstEarlier[0].status === "resolved" && dstLater[0].status === "resolved"
    && new Date(dstEarlier[0].instant).getTime() < new Date(dstLater[0].instant).getTime(),
    { earlier: dstEarlier[0], later: dstLater[0] });
  const dstUnambiguousFold = await q(`select status from restaurant_internal.resolve_branch_local_datetime_v1(
    'America/Los_Angeles', '2027-01-15 10:00:00'::timestamp, 'earlier')`);
  check("fold on an unambiguous input is rejected",
    dstUnambiguousFold[0].status === "unambiguous_fold_not_allowed", dstUnambiguousFold[0]);

  // Asia/Taipei observes no DST: every local time is unambiguous.
  const taipeiNoDst = await q(`select status from restaurant_internal.resolve_branch_local_datetime_v1(
    'Asia/Taipei', '2027-11-07 01:30:00'::timestamp, null)`);
  check("Asia/Taipei has no DST: the same local time that is ambiguous in LA resolves cleanly",
    taipeiNoDst[0].status === "resolved", taipeiNoDst[0]);

  // exercise the DST helper end-to-end via SCHEDULE_CLOSURE on the DST branch
  const dstSchedule = await scheduleClosure(OWNER_A, "h-rest-a", "h-branch-dst",
    "2027-03-14 02:30:00", null, null, null, "0");
  check("SCHEDULE_CLOSURE on a spring-forward gap start is invalid_local_time", dstSchedule.errorCode === "invalid_local_time", dstSchedule);
  const dstScheduleAmbiguous = await scheduleClosure(OWNER_A, "h-rest-a", "h-branch-dst",
    "2027-11-07 01:30:00", null, null, null, "0");
  check("SCHEDULE_CLOSURE on an ambiguous start without fold is invalid_request",
    dstScheduleAmbiguous.errorCode === "invalid_request", dstScheduleAmbiguous);

  // ================================================================ 43 24-hour evaluation boundary
  console.log("\n=== 24-hour evaluation boundary ===");
  const twentyFourHour = [{ weekday: 4, startLocalTime: "00:00:00", endLocalTime: "00:00:00", endDayOffset: 1 }];
  const twentyFourHourApply = await replaceWeekly(OWNER_B, "h-rest-b", "h-branch-b", "REPLACE_WEEKLY_SCHEDULE", twentyFourHour, "0");
  check("24h fixture applies to h-branch-b", twentyFourHourApply.ok === true, twentyFourHourApply);
  const at0000 = await evaluate("h-branch-b", "2027-01-07T00:00:00+08:00"); // Thursday 00:00
  const at2359 = await evaluate("h-branch-b", "2027-01-07T23:59:59+08:00");
  const nextDay0000 = await evaluate("h-branch-b", "2027-01-08T00:00:00+08:00"); // Friday 00:00, no schedule
  check("24h interval OPEN at its own day's 00:00:00", at0000.state === "OPEN" && at0000.reason === "OPEN_WEEKLY_HOURS", at0000);
  check("24h interval OPEN at 23:59:59, continuously", at2359.state === "OPEN", at2359);
  check("24h interval does not leak into the next day's 00:00 (half-open boundary correct)",
    nextDay0000.state === "CLOSED" && nextDay0000.reason === "OUTSIDE_WEEKLY_HOURS", nextDay0000);

  // ================================================================ §46 tenant / foreign / nonexistent
  console.log("\n=== tenant / foreign / nonexistent ===");
  const foreignPreview = await preview(OWNER_B, "h-rest-a", "h-branch-a");
  check("foreign owner cannot preview another Restaurant's branch", foreignPreview.errorCode === "target_not_found", foreignPreview);
  const ghostPreview = await preview(OWNER_A, "h-rest-a", "h-branch-does-not-exist");
  check("nonexistent branch is target_not_found, indistinguishable from foreign",
    ghostPreview.errorCode === "target_not_found"
    && JSON.stringify(ghostPreview) === JSON.stringify(foreignPreview), { ghostPreview, foreignPreview });
  const managerReplace = await replaceWeekly(MANAGER, "h-rest-a", "h-branch-a", "CLEAR_WEEKLY_SCHEDULE", null, "0");
  check("manager (non-owner) is refused", managerReplace.errorCode === "target_not_found", managerReplace);
  const strangerPreview = await preview(STRANGER, "h-rest-a", "h-branch-a");
  check("an unrecognized auth subject is refused", strangerPreview.errorCode === "target_not_found"
    || strangerPreview.errorCode === "unauthenticated", strangerPreview);

  // ================================================================ §47/48 privilege shape, RESTRICTIVE proof
  console.log("\n=== sealed-role privilege shape ===");
  const asWriterRole = async (roleName, actor, sql) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
    await c.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [actor]);
      await c.query(`set local role ${roleName}`);
      const r = await c.query(sql);
      await c.query("commit");
      return r.rows;
    } catch (e) {
      try { await c.query("rollback"); } catch { /* already aborted */ }
      return [{ thrown: e.code }];
    } finally { await c.end(); }
  };
  const ownSeen = await asWriterRole(WEEKLY_ROLE, OWNER_A,
    `select branch_id from public.restaurant_branch_temporal_state where branch_id='h-branch-a'`);
  const foreignSeen = await asWriterRole(WEEKLY_ROLE, OWNER_A,
    `select branch_id from public.restaurant_branch_temporal_state where branch_id='h-branch-b'`);
  check("RESTRICTIVE tenant policy narrows: weekly writer sees own branch, not a foreign one",
    ownSeen.length === 1 && foreignSeen.length === 0, { ownSeen, foreignSeen });

  const weeklyTouchesStatus = await asWriterRole(WEEKLY_ROLE, OWNER_A,
    `update public.restaurant_branches set status='inactive' where id='h-branch-a' returning id`);
  check("weekly writer cannot touch restaurant_branches.status", weeklyTouchesStatus[0]?.thrown, weeklyTouchesStatus);
  const weeklyTouchesBmi = await asWriterRole(WEEKLY_ROLE, OWNER_A,
    `update public.branch_menu_items set price = 1 where branch_id='h-branch-a' returning id`);
  check("weekly writer cannot touch branch_menu_items (RA-2A-F independence)", weeklyTouchesBmi[0]?.thrown, weeklyTouchesBmi);
  const closureTouchesWeekly = await asWriterRole(CLOSURE_ROLE, OWNER_A,
    `update public.restaurant_branch_temporal_state set weekly_hours_version = weekly_hours_version + 1 where branch_id='h-branch-a' returning branch_id`);
  check("closure writer cannot touch weekly_hours_version", closureTouchesWeekly[0]?.thrown, closureTouchesWeekly);
  const specialTouchesClosure = await asWriterRole(SPECIAL_ROLE, OWNER_A,
    `update public.restaurant_branch_temporal_state set operational_closure_version = operational_closure_version + 1 where branch_id='h-branch-a' returning branch_id`);
  check("special writer cannot touch operational_closure_version", specialTouchesClosure[0]?.thrown, specialTouchesClosure);
  const readerWrites = await asWriterRole(READER_ROLE, OWNER_A,
    `update public.restaurant_branch_temporal_state set weekly_hours_version = weekly_hours_version + 1 where branch_id='h-branch-a' returning branch_id`);
  check("reader role has zero DML privilege anywhere", readerWrites[0]?.thrown, readerWrites);

  const noClientMembership = await q(`select count(*)::int as n from pg_auth_members m
    join pg_roles r on r.oid=m.roleid join pg_roles g on g.oid=m.member
    where r.rolname in ($1,$2,$3,$4) and g.rolname in ('anon','authenticated','authenticator','service_role')`,
    [WEEKLY_ROLE, SPECIAL_ROLE, CLOSURE_ROLE, READER_ROLE]);
  check("no client role holds membership of any temporal sealed role", noClientMembership[0].n === 0);

  // ================================================================ §57/58/59/60 independence
  console.log("\n=== independence ===");
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('h-menu-a','h-rest-a','A menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('h-cat-a','h-menu-a','A')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
    ('h-item-a','h-rest-a','h-cat-a','Canonical Item A','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('h-bmi-a','h-rest-a','h-branch-a','h-item-a',10,'available','available')`);
  const bmiBefore = (await q(`select price, availability, branch_specific_status, branch_specific_name
    from public.branch_menu_items where id='h-bmi-a'`))[0];
  await replaceWeekly(OWNER_A, "h-rest-a", "h-branch-a", "REPLACE_WEEKLY_SCHEDULE", splitShift, "5");
  await setSpecial(OWNER_A, "h-rest-a", "h-branch-a", "2027-03-01", "SET_CLOSED", null, "4");
  await closeNow(OWNER_A, "h-rest-a", "h-branch-a", "CLOSE_NOW_INDEFINITE", null, null, "4");
  const bmiAfter = (await q(`select price, availability, branch_specific_status, branch_specific_name
    from public.branch_menu_items where id='h-bmi-a'`))[0];
  check("RA-2A-F branch_menu_items facts unchanged by any temporal mutation",
    JSON.stringify(bmiBefore) === JSON.stringify(bmiAfter), { bmiBefore, bmiAfter });
  const branchNameRow = (await q(`select name, display_name_version from public.restaurant_branches where id='h-branch-a'`))[0];
  check("restaurant_branches.name/display_name_version unaffected", branchNameRow.name === "A Main" && Number(branchNameRow.display_name_version) === 0, branchNameRow);
  const statusRow = (await q(`select status, status_version from public.restaurant_branches where id='h-branch-a'`))[0];
  check("RA-1C status/status_version unaffected by temporal mutations", statusRow.status === "active" && Number(statusRow.status_version) === 0, statusRow);
  await reopenNow(OWNER_A, "h-rest-a", "h-branch-a", (await q(
    `select id from public.restaurant_branch_operational_closures where branch_id='h-branch-a' and cancelled_at is null and ends_at is null`))[0].id, "5");

  clearTimeout(watchdog);
  console.log("\n" + JSON.stringify({
    suite: SUITE, status: failures.length === 0 ? "passed" : "failed",
    migrationsApplied: applied, successorMigrations: candidates,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    failures: failures.map((f) => f.name)
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
  resultsReported = true;
} finally {
  try { await runner?.end(); } catch { /* already closed */ }
  if (cluster) cluster.stop();
}
