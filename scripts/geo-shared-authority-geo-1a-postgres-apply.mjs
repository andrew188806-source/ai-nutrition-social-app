#!/usr/bin/env node
// GEO-1A REAL PostgreSQL apply gate and Geo authority matrix.
//
// Static SQL checks cannot prove a migration compiles, and a SUPERUSER apply cannot prove it
// deploys: SR-2K-B passed 23/23 on a superuser cluster and was then refused by Development, because
// ownership checks, role-membership options and RLS all behave differently for a superuser. This
// harness therefore applies the EXACT frozen predecessor schema and then the EXACT GEO-1A migration
// to a disposable real cluster THROUGH A NON-SUPERUSER RUNNER, through COMMIT, and exercises the
// resulting authority with real queries.
//
// It is opt-in because it needs PostgreSQL binaries that are not part of this repository:
//   GEO1A_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   GEO1A_PG_MODULES  directory containing a node_modules with the `pg` client
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

const SUITE = "geo-shared-authority-geo-1a-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260824030000_meal_buddy_push_notification_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.GEO1A_PG_BIN?.trim();
const PG_MODULES = process.env.GEO1A_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set GEO1A_PG_BIN and GEO1A_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
    if (entry.isDirectory() && entry.name.startsWith("geo1a-data-")) {
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
  const dataDir = path.join(workDir, `geo1a-data-${process.pid}-${Date.now()}`);
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
const near = (value, expected, tolerance) => value !== null && Math.abs(Number(value) - expected) <= tolerance;

// Two real Taipei landmarks, used only as a fixed arithmetic reference for the formula.
const T101 = { lat: 25.033964, lng: 121.564468 };
const TMAIN = { lat: 25.047924, lng: 121.517081 };

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "geo1a-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

let cluster;
let client;
let runner;
let applied = 0;
let candidates = [];
try {
  cluster = await startCluster(workDir);
  // The superuser connection exists only to lay down the platform surface and arrange fixtures.
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  await client.query(BOOTSTRAP);

  // Migrations are applied over a SEPARATE, deliberately unprivileged connection: `postgres`,
  // exactly as `supabase db push` does it. Nothing about this connection may be a superuser.
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
        { code: error.code, message: String(error.message).slice(0, 300) });
      throw error;
    }
  }
  check("the frozen predecessor schema and the GEO-1A migration apply through COMMIT on real PostgreSQL",
    applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one GEO-1A migration",
    candidates.length === 1 && candidates[0].includes("geo_shared_candidate_authority"), candidates);

  // --- schema shape ---------------------------------------------------------------------------
  const columns = await q(`
    select column_name, data_type, is_nullable, numeric_precision, numeric_scale
    from information_schema.columns
    where table_schema='public' and table_name='restaurant_branches'
      and column_name in ('latitude','longitude') order by column_name`);
  check("both coordinate columns exist, are nullable and carry the canonical precision",
    columns.length === 2 && columns.every((c) => c.is_nullable === "YES"
      && c.data_type === "numeric" && Number(c.numeric_precision) === 9 && Number(c.numeric_scale) === 6),
    columns);

  check("no coordinate was fabricated for any pre-existing branch",
    (await q(`select count(*)::int as known from public.restaurant_branches
              where latitude is not null or longitude is not null`))[0].known === 0);

  const rejects = async (sql) => {
    try { await client.query(sql); return false; } catch { return true; }
  };
  await q(`insert into public.restaurants (id, name, status) values ('geo1a-r', 'Geo Fixture', 'active')`);
  const insertBranch = (id, lat, lng) =>
    `insert into public.restaurant_branches (id, restaurant_id, name, status, latitude, longitude)
     values ('${id}', 'geo1a-r', '${id}', 'active', ${lat}, ${lng})`;

  check("an out-of-range latitude is rejected at rest",
    await rejects(insertBranch("geo1a-bad-lat", "90.000001", "121.5")));
  check("an out-of-range longitude is rejected at rest",
    await rejects(insertBranch("geo1a-bad-lng", "25.0", "180.000001")));
  check("a half-known coordinate is rejected at rest",
    await rejects(insertBranch("geo1a-half", "25.0", "null")));

  // --- distance authority ---------------------------------------------------------------------
  const d = async (a, b) => Number((await q(
    `select geo_internal.distance_meters($1,$2,$3,$4) as m`, [a.lat, a.lng, b.lat, b.lng]))[0].m);

  check("an identical coordinate is exactly zero distance", (await d(T101, T101)) === 0);
  const reference = await d(T101, TMAIN);
  check("a fixed real-world reference pair returns the correct great-circle distance",
    near(reference, 5025, 130), { reference });
  check("distance is symmetric", Math.abs(reference - (await d(TMAIN, T101))) < 1e-6);

  // Degrees-vs-radians and kilometres-vs-metres bugs both survive a single-pair check, so the
  // magnitude is pinned against an independently known quantity: one degree of latitude is
  // ~111.19 km on the mean sphere.
  check("one degree of latitude is ~111.19 km, so the unit and angle basis are both correct",
    near(await d({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 111195, 60));

  check("swapping latitude and longitude changes the answer",
    Math.abs(reference - (await d({ lat: T101.lng % 90, lng: T101.lat }, { lat: TMAIN.lng % 90, lng: TMAIN.lat }))) > 1);

  check("the antimeridian is crossed the short way, not the long way",
    near(await d({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }), 222.6, 5));

  check("a high-latitude pair converges as longitude lines do",
    near(await d({ lat: 89.9, lng: 0 }, { lat: 89.9, lng: 180 }), 22239, 60));

  check("antipodal points do not overflow the arcsine",
    near(await d({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }), 20015115, 200));

  for (const [label, args] of [
    ["a null origin", [null, 121.5, 25.0, 121.5]],
    ["a null candidate", [25.0, 121.5, null, null]],
    ["an out-of-range latitude", [91, 121.5, 25.0, 121.5]],
    ["an out-of-range longitude", [25.0, 181, 25.0, 121.5]]
  ]) {
    check(`${label} yields UNKNOWN rather than a number`,
      (await q(`select geo_internal.distance_meters($1,$2,$3,$4) as m`, args))[0].m === null);
  }

  // --- radius eligibility -----------------------------------------------------------------------
  const within = async (a, b, radius) => (await q(
    `select geo_internal.within_radius($1,$2,$3,$4,$5) as ok`, [a.lat, a.lng, b.lat, b.lng, radius]))[0].ok;

  check("the radius boundary is INCLUSIVE: exactly the distance is inside",
    (await within(T101, TMAIN, reference)) === true);
  check("just inside the radius is inside", (await within(T101, TMAIN, reference + 0.001)) === true);
  check("just outside the radius is outside", (await within(T101, TMAIN, reference - 0.001)) === false);
  check("a zero radius accepts nothing", (await within(T101, T101, 0)) === false);
  check("a negative radius fails closed", (await within(T101, TMAIN, -1)) === false);
  check("a NaN radius fails closed", (await within(T101, TMAIN, Number.NaN)) === false);
  check("a null radius fails closed", (await within(T101, TMAIN, null)) === false);
  check("a radius beyond half the Earth's circumference fails closed",
    (await within(T101, TMAIN, 20037509)) === false);
  check("an UNKNOWN coordinate is never inside any radius",
    (await q(`select geo_internal.within_radius(25.0,121.5,null,null,1000000) as ok`))[0].ok === false);

  // --- candidate narrowing ------------------------------------------------------------------------
  await q(insertBranch("geo1a-b-near", T101.lat, T101.lng));
  await q(insertBranch("geo1a-b-mid", TMAIN.lat, TMAIN.lng));
  await q(`insert into public.restaurant_branches (id, restaurant_id, name, status, latitude, longitude)
           values ('geo1a-b-unknown', 'geo1a-r', 'unknown', 'active', null, null)`);
  await q(insertBranch("geo1a-b-far", "35.681236", "139.767125"));
  await q(`insert into public.restaurant_branches (id, restaurant_id, name, status, latitude, longitude)
           values ('geo1a-b-inactive', 'geo1a-r', 'inactive', 'inactive', ${T101.lat}, ${T101.lng})`);

  const narrow = async (point, radius, limit) => await q(
    `select branch_id, distance_meters from geo_internal.narrow_branch_candidates($1,$2,$3,$4)`,
    [point.lat, point.lng, radius, limit]);

  const near10km = await narrow(T101, 10000, 50);
  check("narrowing includes candidates inside the radius and excludes the distant one",
    near10km.some((r) => r.branch_id === "geo1a-b-near")
    && near10km.some((r) => r.branch_id === "geo1a-b-mid")
    && !near10km.some((r) => r.branch_id === "geo1a-b-far"),
    near10km.map((r) => r.branch_id));
  check("an UNKNOWN-coordinate branch is EXCLUDED, never implied to be nearby",
    !near10km.some((r) => r.branch_id === "geo1a-b-unknown"));
  check("an inactive branch is excluded", !near10km.some((r) => r.branch_id === "geo1a-b-inactive"));
  check("narrowing orders nearest first",
    near10km.length >= 2 && Number(near10km[0].distance_meters) <= Number(near10km[1].distance_meters)
    && near10km[0].branch_id === "geo1a-b-near", near10km);
  check("narrowing is deterministic across repeated calls",
    JSON.stringify(await narrow(T101, 10000, 50)) === JSON.stringify(near10km));
  check("a tight radius narrows the set further",
    (await narrow(T101, 100, 50)).map((r) => r.branch_id).join(",") === "geo1a-b-near");
  check("a limit truncates the result", (await narrow(T101, 10000, 1)).length === 1);
  for (const [label, args] of [
    ["a non-positive limit", [T101.lat, T101.lng, 10000, 0]],
    ["a null limit", [T101.lat, T101.lng, 10000, null]],
    ["an out-of-range origin", [91, 121.5, 10000, 50]],
    ["a null origin", [null, null, 10000, 50]],
    ["a negative radius", [T101.lat, T101.lng, -5, 50]]
  ]) {
    check(`narrowing with ${label} returns nothing`,
      (await q(`select branch_id from geo_internal.narrow_branch_candidates($1,$2,$3,$4)`, args)).length === 0);
  }

  // --- sealing and privacy --------------------------------------------------------------------
  const privileged = (await q(`
    select
      has_schema_privilege('anon','geo_internal','USAGE') as anon_schema,
      has_schema_privilege('authenticated','geo_internal','USAGE') as auth_schema,
      has_function_privilege('anon','geo_internal.narrow_branch_candidates(numeric,numeric,double precision,integer)','EXECUTE') as anon_exec,
      has_function_privilege('authenticated','geo_internal.narrow_branch_candidates(numeric,numeric,double precision,integer)','EXECUTE') as auth_exec,
      has_function_privilege('social_runtime_executor','geo_internal.narrow_branch_candidates(numeric,numeric,double precision,integer)','EXECUTE') as executor_exec,
      has_schema_privilege('social_runtime_executor','geo_internal','USAGE') as executor_schema`))[0];
  check("the Geo authority is sealed from every client role and reachable only by the frozen executor",
    privileged.anon_schema === false && privileged.auth_schema === false
    && privileged.anon_exec === false && privileged.auth_exec === false
    && privileged.executor_exec === true && privileged.executor_schema === true, privileged);

  const owners = await q(`
    select p.proname, pg_get_userbyid(p.proowner) as owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'geo_internal' order by 1`);
  check("every Geo function is owned by the sealed authority role, not by the migration runner",
    owners.length === 3 && owners.every((r) => r.owner === "geo_authority"), owners);

  const roleShape = (await q(`select rolcanlogin, rolbypassrls, rolinherit, rolsuper
                              from pg_roles where rolname='geo_authority'`))[0];
  check("the authority role cannot log in and cannot bypass row level security",
    roleShape.rolcanlogin === false && roleShape.rolbypassrls === false
    && roleShape.rolinherit === false && roleShape.rolsuper === false, roleShape);

  const catalogCoordinates = await q(`
    select count(*)::int as leaks from information_schema.columns
    where table_schema='public' and table_name like 'consumer_public_%'
      and column_name in ('latitude','longitude')`);
  check("no consumer projection view exposes a coordinate", catalogCoordinates[0].leaks === 0);

  // Geo narrows; it never ranks. Nothing in the authority may reference a scoring domain.
  const bodies = (await q(`
    select pg_catalog.string_agg(pg_get_functiondef(p.oid), '\n') as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='geo_internal'`))[0].src;
  check("the Geo authority references no taste, nutrition or social ranking signal",
    !/taste|nutrition|calorie|protein|similarity|compatib|social_internal|meal_buddy|rank|score/i.test(bodies));

  check("no location history or tracking table was created",
    (await q(`select count(*)::int as n from information_schema.tables
              where table_schema in ('public','geo_internal')
                and (table_name like '%location_history%' or table_name like '%geo_track%'
                     or table_name like '%user_location%')`))[0].n === 0);

  console.log("\n" + JSON.stringify({
    suite: SUITE,
    status: failures.length ? "failed" : "passed",
    postgres: child.spawnSync(exe("postgres"), ["--version"], { encoding: "utf8" }).stdout?.trim(),
    runnerIsSuperuser: false,
    migrationsApplied: applied,
    candidateMigrations: candidates,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures: failures.map((f) => f.name),
    networkUsed: false,
    credentialsUsed: false,
    developmentTouched: false,
    productionTouched: false
  }, null, 2));
  check("harness completed without an unexpected error", true);
} catch (error) {
  check("harness completed without an unexpected error", false, String(error?.message ?? error).slice(0, 300));
} finally {
  clearTimeout(watchdog);
  if (runner) await runner.end().catch(() => {});
  if (client) await client.end().catch(() => {});
  if (cluster) cluster.stop();
  reapStrays(workDir);
}
if (failures.length) process.exitCode = 1;
