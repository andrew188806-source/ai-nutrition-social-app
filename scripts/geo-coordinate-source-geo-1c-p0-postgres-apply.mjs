#!/usr/bin/env node
// GEO-1C-P0 REAL PostgreSQL apply gate and coordinate-source authority matrix.
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

const SUITE = "geo-coordinate-source-geo-1c-p0-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260825010000_geo_shared_candidate_authority.sql";
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

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "geo1cp0-apply-gate");
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
        { code: error.code, message: String(error.message).slice(0, 300) });
      throw error;
    }
  }
  check("the frozen predecessor schema and the GEO-1C-P0 migration apply through COMMIT",
    applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one GEO-1C-P0 migration",
    candidates.length === 1 && candidates[0].includes("restaurant_geocode_source_authority"), candidates);

  // --- the lifecycle admits exactly four states -------------------------------------------------
  // Probed by UPDATE, not INSERT: the BEFORE INSERT trigger legitimately OWNS the status on
  // insertion and overwrites whatever a caller supplied, so an insert can never reach the CHECK.
  await q(`insert into public.restaurants (id, name, status) values ('probe-r','probe','active')`);
  await q(`insert into public.restaurant_branches (id, restaurant_id, name, status)
           values ('probe-b','probe-r','probe','active')`);
  const accepted = [];
  for (const state of ["unknown", "pending", "resolved", "failed", "stale", "resolving"]) {
    try {
      await client.query("begin");
      await client.query(`update public.restaurant_branches set geocode_status = $1 where id = 'probe-b'`, [state]);
      accepted.push(state);
    } catch { /* refused by a CHECK */ } finally { await client.query("rollback"); }
  }
  // `resolved` is legitimately refused for this row too: the equivalence forbids it without a
  // coordinate, which is the same constraint stated from the other direction.
  check("the status CHECK admits the canonical states, refuses stale, and refuses resolved without a coordinate",
    accepted.sort().join(",") === "failed,pending,unknown", accepted);

  // --- fixtures ---------------------------------------------------------------------------------
  await q(`insert into public.restaurants (id, name, city, status) values ($1, 'Geo fixture', '台北市', 'active')`, [R]);
  const insert = (suffix, district, address) =>
    q(`insert into public.restaurant_branches (id, restaurant_id, name, district, address, status)
       values ($1, $2, $3, $4, $5, 'active')`, [B(suffix), R, suffix, district, address]);
  await insert("full", "松山區", "南京東路三段 100 號");
  await insert("nodistrict", null, "信義路四段 200 號");
  await insert("noaddress", "大安區", null);

  const row = async (suffix) => (await q(
    `select geocode_status, geocode_address_fingerprint, latitude, longitude, geocode_attempts,
            geocode_provider, geocode_provider_ref, geocode_normalized_address, geocode_resolved_at,
            geocode_last_error
     from public.restaurant_branches where id = $1`, [B(suffix)]))[0];

  const full0 = await row("full");
  check("a branch with a street address is inserted as pending, fingerprinted, with no coordinate",
    full0.geocode_status === "pending" && full0.geocode_address_fingerprint !== null
    && full0.latitude === null, full0);
  const none0 = await row("noaddress");
  check("a branch with no street address is unknown and has no fingerprint",
    none0.geocode_status === "unknown" && none0.geocode_address_fingerprint === null, none0);
  check("a district is optional: city plus street address still composes",
    (await row("nodistrict")).geocode_status === "pending");

  const composed = (await q(
    `select geo_internal.compose_branch_address(r.city, b.district, b.address) as composed
     from public.restaurant_branches b join public.restaurants r on r.id = b.restaurant_id
     where b.id = $1`, [B("full")]))[0].composed;
  check("the canonical address is composed from city, district and street address",
    composed === "台北市 松山區 南京東路三段 100 號", composed);

  const fingerprints = (await q(`select
      geo_internal.branch_address_fingerprint('台北市','松山區','南京東路三段 100 號') =
        geo_internal.branch_address_fingerprint('台北市','松山區','南京東路三段 100 號') as deterministic,
      geo_internal.branch_address_fingerprint('台北市','松山區','南京東路三段 100 號') <>
        geo_internal.branch_address_fingerprint('新北市','松山區','南京東路三段 100 號') as city_differs,
      geo_internal.branch_address_fingerprint('台北市','松山區','南京東路三段 100 號') <>
        geo_internal.branch_address_fingerprint('台北市','大安區','南京東路三段 100 號') as district_differs,
      geo_internal.branch_address_fingerprint('台北市','松山區','南京東路三段 100 號') <>
        geo_internal.branch_address_fingerprint('台北市','松山區','南京東路三段 101 號') as address_differs,
      geo_internal.branch_address_fingerprint('台北市','松山區', null) is null as no_address_is_null`))[0];
  check("the fingerprint is deterministic and changes with every canonical component",
    fingerprints.deterministic && fingerprints.city_differs && fingerprints.district_differs
    && fingerprints.address_differs && fingerprints.no_address_is_null, fingerprints);

  // --- claiming ----------------------------------------------------------------------------------
  const claimAll = async (limit = 10, maxAttempts = 3) => await q(
    `select branch_id, source_address, address_fingerprint from geo_internal.claim_branch_geocodes($1,$2)`,
    [limit, maxAttempts]);
  const claimed = await claimAll();
  check("claiming returns only branches with a sufficient address, and never a coordinate",
    claimed.length === 2 && claimed.every((c) => c.source_address && c.address_fingerprint)
    && !claimed.some((c) => "latitude" in c || "longitude" in c),
    claimed.map((c) => c.branch_id).sort());
  check("claiming counts the attempt at claim time", (await row("full")).geocode_attempts === 1);

  const target = claimed.find((c) => c.branch_id === B("full"));
  const complete = async (branchId, fingerprint, lat, lng, provider = "mock", ref = "fixture") => (await q(
    `select geo_internal.complete_branch_geocode($1,$2,$3,$4,$5,$6) as outcome`,
    [branchId, fingerprint, lat, lng, provider, ref]))[0].outcome;

  check("a current-fingerprint completion resolves the branch",
    (await complete(target.branch_id, target.address_fingerprint, 25.0521, 121.5439)) === "resolved");
  const resolved = await row("full");
  check("resolution stores the coordinate, the provider and this repository's OWN composed address",
    Number(resolved.latitude) === 25.0521 && Number(resolved.longitude) === 121.5439
    && resolved.geocode_status === "resolved" && resolved.geocode_provider === "mock"
    && resolved.geocode_provider_ref === "fixture"
    && resolved.geocode_normalized_address === "台北市 松山區 南京東路三段 100 號"
    && resolved.geocode_resolved_at !== null, resolved);
  check("a resolved branch becomes visible to the frozen GEO-1A narrowing authority",
    (await q(`select branch_id from geo_internal.narrow_branch_candidates(25.0521, 121.5439, 500, 20)`))
      .some((r) => r.branch_id === B("full")));

  check("a completion presenting an unknown fingerprint is rejected as stale",
    (await complete(target.branch_id, ZERO_FINGERPRINT, 1, 1)) === "rejected_stale");
  check("the stale rejection wrote nothing", Number((await row("full")).latitude) === 25.0521);
  for (const [label, args] of [
    ["an out-of-range latitude", [B("full"), target.address_fingerprint, 91, 121]],
    ["an out-of-range longitude", [B("full"), target.address_fingerprint, 25, 181]],
    ["a null coordinate", [B("full"), target.address_fingerprint, null, null]]
  ]) {
    check(`${label} is refused rather than written`,
      (await q(`select geo_internal.complete_branch_geocode($1,$2,$3,$4,'mock','r') as outcome`, args))[0]
        .outcome === "rejected_invalid");
  }
  check("completing an unknown branch reports not_found",
    (await complete("no-such-branch", target.address_fingerprint, 25, 121)) === "not_found");

  // --- THE RACE: the address moves while a resolution is in flight ------------------------------
  const inflight = (await claimAll()).find((c) => c.branch_id === B("nodistrict"));
  await q(`update public.restaurant_branches set address = $2 where id = $1`,
    [B("nodistrict"), "信義路四段 999 號"]);
  check("an in-flight completion is rejected once the address moved beneath it",
    (await complete(inflight.branch_id, inflight.address_fingerprint, 25.03, 121.55)) === "rejected_stale");
  const raced = await row("nodistrict");
  check("the raced branch is back to pending, with no coordinate and a fresh budget",
    raced.geocode_status === "pending" && raced.latitude === null && raced.geocode_attempts === 0, raced);

  // --- invalidation on the branch side ------------------------------------------------------------
  await q(`update public.restaurant_branches set address = $2 where id = $1`,
    [B("full"), "南京東路三段 101 號"]);
  const afterAddress = await row("full");
  check("a branch ADDRESS change clears the coordinate and the provider provenance",
    afterAddress.latitude === null && afterAddress.longitude === null
    && afterAddress.geocode_status === "pending" && afterAddress.geocode_provider === null
    && afterAddress.geocode_provider_ref === null && afterAddress.geocode_resolved_at === null
    && afterAddress.geocode_normalized_address === null, afterAddress);

  const reResolve = async (suffix) => {
    const item = (await claimAll(10, 9)).find((c) => c.branch_id === B(suffix));
    if (!item) return "not_claimed";
    return await complete(item.branch_id, item.address_fingerprint, 25.0521, 121.5439);
  };
  await reResolve("full");
  await q(`update public.restaurant_branches set district = $2 where id = $1`, [B("full"), "中山區"]);
  check("a branch DISTRICT change clears the coordinate",
    (await row("full")).latitude === null && (await row("full")).geocode_status === "pending");

  await reResolve("full");
  await q(`update public.restaurant_branches set name = 'renamed' where id = $1`, [B("full")]);
  const untouched = await row("full");
  check("an edit that does not change the canonical address keeps the resolution",
    Number(untouched.latitude) === 25.0521 && untouched.geocode_status === "resolved", untouched);

  // --- invalidation on the parent, which a branch-only trigger would miss -------------------------
  await reResolve("nodistrict");
  const beforeCity = [(await row("full")).geocode_status, (await row("nodistrict")).geocode_status];
  await q(`update public.restaurants set city = '新北市' where id = $1`, [R]);
  const afterFull = await row("full");
  const afterNoDistrict = await row("nodistrict");
  const afterNoAddress = await row("noaddress");
  check("a parent CITY change clears the coordinates of EVERY affected child branch",
    afterFull.latitude === null && afterNoDistrict.latitude === null
    && afterFull.geocode_status === "pending" && afterNoDistrict.geocode_status === "pending",
    { beforeCity, after: [afterFull.geocode_status, afterNoDistrict.geocode_status] });
  check("a city change re-fingerprints the affected branches to the new city",
    afterFull.geocode_address_fingerprint
      === (await q(`select geo_internal.branch_address_fingerprint('新北市','中山區','南京東路三段 101 號') as f`))[0].f);
  check("a branch with no address is untouched by a city change",
    afterNoAddress.geocode_status === "unknown" && afterNoAddress.geocode_address_fingerprint === null);

  // --- failure and bounded retry -------------------------------------------------------------------
  const failItem = (await claimAll()).find((c) => c.branch_id === B("full"));
  check("a failure is recorded and creates no coordinate",
    (await q(`select geo_internal.fail_branch_geocode($1,$2,'provider_no_match') as outcome`,
      [failItem.branch_id, failItem.address_fingerprint]))[0].outcome === "failed");
  const failed = await row("full");
  check("the failed branch holds no coordinate and no provider provenance",
    failed.geocode_status === "failed" && failed.latitude === null
    && failed.geocode_provider === null && failed.geocode_last_error === "provider_no_match", failed);
  check("a failure attributed to an old fingerprint is rejected",
    (await q(`select geo_internal.fail_branch_geocode($1,$2,'x') as outcome`,
      [B("full"), ZERO_FINGERPRINT]))[0].outcome === "rejected_stale");

  let rounds = 0;
  while (rounds < 8) {
    const batch = await claimAll(10, 2);
    if (!batch.some((c) => c.branch_id === B("full"))) break;
    await q(`select geo_internal.fail_branch_geocode($1,$2,'provider_unavailable') as outcome`,
      [B("full"), (await row("full")).geocode_address_fingerprint]);
    rounds += 1;
  }
  const bounded = await row("full");
  check("retries stop at the configured attempt maximum instead of looping forever",
    rounds < 8 && bounded.geocode_attempts >= 2, { rounds, attempts: bounded.geocode_attempts });
  check("an explicit reset restores the budget for the current address",
    (await q(`select geo_internal.reset_branch_geocode($1) as outcome`, [B("full")]))[0].outcome === "pending"
    && (await row("full")).geocode_attempts === 0);

  // --- sealing and privacy ---------------------------------------------------------------------
  const sealed = (await q(`select
      has_function_privilege('anon','geo_internal.claim_branch_geocodes(integer,integer)','EXECUTE') as anon_claim,
      has_function_privilege('authenticated','geo_internal.complete_branch_geocode(text,text,numeric,numeric,text,text)','EXECUTE') as auth_complete,
      has_function_privilege('service_role','geo_internal.complete_branch_geocode(text,text,numeric,numeric,text,text)','EXECUTE') as service_complete,
      has_function_privilege('social_runtime_executor','geo_internal.claim_branch_geocodes(integer,integer)','EXECUTE') as executor_claim,
      has_column_privilege('anon','public.restaurant_branches','latitude','UPDATE') as anon_write_lat,
      has_column_privilege('authenticated','public.restaurant_branches','latitude','UPDATE') as auth_write_lat,
      has_column_privilege('service_role','public.restaurant_branches','geocode_status','UPDATE') as service_write_status,
      has_column_privilege('geo_geocode_authority','public.restaurant_branches','latitude','UPDATE') as authority_write_lat,
      has_column_privilege('geo_geocode_authority','public.restaurant_branches','geocode_address_fingerprint','UPDATE') as authority_write_fingerprint,
      has_column_privilege('geo_authority','public.restaurant_branches','latitude','UPDATE') as narrower_write_lat`))[0];
  check("no client role may execute the resolution authority; only the frozen executor may",
    sealed.anon_claim === false && sealed.auth_complete === false && sealed.service_complete === false
    && sealed.executor_claim === true, sealed);
  check("no client role may write a coordinate or a lifecycle column",
    sealed.anon_write_lat === false && sealed.auth_write_lat === false
    && sealed.service_write_status === false, sealed);
  check("the authority writes coordinates but NOT the fingerprint it is checked against",
    sealed.authority_write_lat === true && sealed.authority_write_fingerprint === false, sealed);
  check("the GEO-1A narrowing role still cannot write a coordinate",
    sealed.narrower_write_lat === false, sealed);

  const roleShape = (await q(`select rolcanlogin, rolbypassrls, rolinherit, rolsuper
                              from pg_roles where rolname='geo_geocode_authority'`))[0];
  check("the write role cannot log in and cannot bypass row level security",
    roleShape.rolcanlogin === false && roleShape.rolbypassrls === false
    && roleShape.rolinherit === false && roleShape.rolsuper === false, roleShape);
  check("no consumer projection exposes a coordinate or any geocode column",
    (await q(`select count(*)::int as leaks from information_schema.columns
              where table_schema='public' and table_name like 'consumer_public_%'
                and (column_name in ('latitude','longitude') or column_name like 'geocode_%')`))[0].leaks === 0);
  check("no Social projection gained a coordinate or geocode column",
    (await q(`select count(*)::int as leaks from information_schema.columns
              where table_schema='public' and (table_name like 'meal_buddy%' or table_name like 'social_%')
                and (column_name in ('latitude','longitude') or column_name like 'geocode_%')`))[0].leaks === 0);
  check("GEO-1A's narrowing authority is unchanged and still owned by its own role",
    (await q(`select pg_get_userbyid(p.proowner) as owner from pg_proc p
              join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='geo_internal' and p.proname='narrow_branch_candidates'`))[0].owner === "geo_authority");
  check("no location history or user-location table was created",
    (await q(`select count(*)::int as n from information_schema.tables
              where table_schema in ('public','geo_internal')
                and (table_name like '%user_location%' or table_name like '%location_history%'
                     or table_name like '%geocode_log%')`))[0].n === 0);

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
