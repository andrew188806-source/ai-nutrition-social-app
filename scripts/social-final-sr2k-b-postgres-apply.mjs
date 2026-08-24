#!/usr/bin/env node
// SR-2K-B REAL PostgreSQL apply gate and authority matrix.
//
// Static SQL checks cannot prove a migration compiles: SR-2J-A was byte-frozen, digest-verified and
// fully "green" while being syntactically invalid PL/pgSQL that PostgreSQL 17 rejected at CREATE
// FUNCTION time. This harness therefore applies the EXACT frozen predecessor schema and then the
// EXACT candidate migrations to a disposable real cluster, through COMMIT, and exercises the
// resulting authority with real queries.
//
// It is opt-in because it needs PostgreSQL binaries that are not part of this repository:
//   SR2KB_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   SR2KB_PG_MODULES  directory containing a node_modules with the `pg` client
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

const SUITE = "social-final-sr2k-b-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260823020000_meal_buddy_chat_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.SR2KB_PG_BIN?.trim();
const PG_MODULES = process.env.SR2KB_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set SR2KB_PG_BIN and SR2KB_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
  -- one proves far less than it appears to: \`create or replace function\` on a routine owned by a
  -- sealed authority role succeeds for a superuser and is refused for the real runner.
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
-- The migration runner never owns \`auth\`, but every Social table keys off auth.users, so it holds
-- exactly the REFERENCES it needs and nothing more.
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
-- As with realtime, the runner administers storage through the platform's admin role rather than by
-- owning the schema.
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
-- MEASURED FROM THE PLATFORM, NOT ASSUMED. On the Development project realtime.send is owned by
-- supabase_realtime_admin and is NOT SECURITY DEFINER, so its INSERT executes with the CALLER's
-- privileges. A caller therefore needs INSERT on realtime.messages and not merely EXECUTE. Modelling
-- it as SECURITY DEFINER would hide exactly that requirement.
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
-- MEASURED FROM THE PLATFORM. On Development the runner holds USAGE on the realtime schema WITH
-- GRANT OPTION, plus INSERT/SELECT on the spool and EXECUTE on send — but it is NOT a member of the
-- spool's owning role, so a grant of INSERT on realtime.messages issued BY the runner is silently
-- dropped. Reproducing that asymmetry is the point: it is what forces the publish to go through a
-- definer the runner owns rather than through a grant the platform quietly ignores.
grant usage on schema realtime to postgres with grant option;
grant insert, select on table realtime.messages to postgres;
grant execute on function realtime.send(jsonb, text, text, boolean) to postgres;
-- Policies on the spool are administered by the runner, exactly as the platform allows.
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
    if (entry.isDirectory() && entry.name.startsWith("sr2kb-data-")) {
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
  const dataDir = path.join(workDir, `sr2kb-data-${process.pid}-${Date.now()}`);
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
  checks.push({ name, ok: Boolean(ok) });
  if (!ok) failures.push({ name, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";
const TOKEN_1 = "ExponentPushToken[HARNESSAAAAAAAAAAAAA1]";
const TOKEN_2 = "ExponentPushToken[HARNESSAAAAAAAAAAAAA2]";

const workDir = path.join(PG_MODULES, "..");
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error(`WATCHDOG: ${SUITE} exceeded ${WATCHDOG_MS}ms — tearing down and failing closed`);
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);

let cluster;
let client;
let runner;
let applied = 0;
let candidates = [];
try {
  cluster = await startCluster(workDir);
  // The superuser connection exists only to lay down the platform surface and to arrange fixtures.
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  await client.query(BOOTSTRAP);

  // Migrations are applied over a SEPARATE, deliberately unprivileged connection: `postgres`, exactly
  // as `supabase db push` does it. Nothing about this connection may be a superuser.
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const runnerIdentity = (await runner.query(
    "select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations are applied by a non-superuser runner, as the platform applies them",
    runnerIdentity.current_user === "postgres" && runnerIdentity.superuser === "off", runnerIdentity);

  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidates.push(file);
    } catch (error) {
      check(`every migration applies through COMMIT (${file})`, false, { code: error.code, message: String(error.message).slice(0, 300) });
      throw error;
    }
  }
  check("the frozen predecessor schema and every candidate migration apply through COMMIT on real PostgreSQL",
    applied === files.length, { applied, total: files.length });
  check("the round contributes exactly the three SR-2K-B migrations",
    candidates.length === 3
    && candidates[0].includes("unfriend_authority")
    && candidates[1].includes("chat_realtime_authority")
    && candidates[2].includes("push_notification_authority"), candidates);

  // The platform silently drops a spool grant issued by the runner, so a design that depended on one
  // would pass here and fail in Development. Publishing must not rest on any privilege the chat
  // authority holds over realtime.messages directly.
  const spool = (await q(`select
    has_table_privilege('meal_buddy_chat_authority','realtime.messages','INSERT') as ins,
    has_table_privilege('meal_buddy_chat_authority','realtime.messages','SELECT') as sel,
    has_function_privilege('meal_buddy_chat_authority','social_internal.publish_meal_buddy_chat_signal(text,text,jsonb)','EXECUTE') as publisher`))[0];
  check("delivery does not depend on the chat authority holding the realtime spool",
    spool.ins === false && spool.sel === false && spool.publisher === true, spool);

  for (const [id, email, tag] of [[A, "a@development.invalid", "A"], [B, "b@development.invalid", "B"], [C, "c@development.invalid", "C"]]) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
    await q(`insert into public.consumer_profiles
      (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, status)
      values ($1, $2, $3, $4, 'DH', 'active')`, [id, `sr2kb-${tag}`, `Buddy ${tag}`, `Anon ${tag}`]);
    await q(`insert into public.social_participation (user_id, state) values ($1, 'opted_in')`, [id]);
  }
  const pair = async () => (await q(
    `select id, state, accepted_at, resolved_at, ended_at, invited_by_user_id
     from public.meal_buddy_relationships
     where user_low_id = least($1::uuid,$2::uuid) and user_high_id = greatest($1::uuid,$2::uuid)`, [A, B]))[0];
  const outbox = async (recipient) => q(
    `select event_kind, dedupe_key, dispatched_at from public.meal_buddy_notification_outbox
     where recipient_user_id = $1 order by created_at`, [recipient]);
  // Subscribing to a private topic IS a SELECT on realtime.messages as `authenticated`, with the
  // Realtime server supplying realtime.topic. This runs exactly that, so the real policy is proven.
  const canSubscribe = async (actorId, topic) => {
    await client.query("begin");
    try {
      await client.query("set local role authenticated");
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [actorId]);
      await client.query(`select set_config('realtime.topic', $1, true)`, [topic]);
      return (await client.query(`select public.meal_buddy_chat_realtime_authorized($1) as allowed`, [topic]))
        .rows[0].allowed === true;
    } finally { await client.query("rollback"); }
  };

  // ---- UNFRIEND ---------------------------------------------------------------------------------
  await q(`select * from social_internal.send_meal_buddy_invite($1, $2)`, [A, B]);
  const invited = await pair();
  check("a pending invite cannot be unfriended",
    (await q(`select * from social_internal.end_meal_buddy_relationship($1, $2)`, [B, invited.id])).length === 0
    && (await pair()).state === "pending");
  await q(`select * from social_internal.resolve_meal_buddy_relationship($1, $2, 'accept')`, [B, invited.id]);
  const conversationId = (await q(`select * from social_internal.open_meal_buddy_chat($1, $2)`, [A, invited.id]))[0].conversation_id;
  await q(`select * from social_internal.send_meal_buddy_chat_message($1, $2, $3, $4)`,
    [A, conversationId, "11111111-1111-4111-8111-111111111111", "before the unfriend"]);
  const topic = (await q(`select * from social_internal.authorize_meal_buddy_chat_channel($1, $2)`, [A, conversationId]))[0].topic;

  const ended = await q(`select * from social_internal.end_meal_buddy_relationship($1, $2)`, [A, invited.id]);
  const endedRow = await pair();
  check("an accepted relationship is ended by a member and reports the none state",
    ended.length === 1 && ended[0].relative_state === "none" && endedRow.state === "ended" && endedRow.ended_at !== null, ended);
  check("the ended pair leaves exactly one canonical row and disappears from both lists",
    (await q(`select count(*)::int as n from public.meal_buddy_relationships`))[0].n === 1
    && (await q(`select * from social_internal.list_meal_buddy_relationships($1)`, [A])).length === 0
    && (await q(`select * from social_internal.list_meal_buddy_relationships($1)`, [B])).length === 0);
  check("chat loses every authority after the unfriend",
    (await q(`select * from social_internal.authorize_meal_buddy_chat($1, null, $2)`, [A, conversationId])).length === 0
    && (await q(`select * from social_internal.open_meal_buddy_chat($1, $2)`, [A, endedRow.id])).length === 0
    && (await q(`select * from social_internal.list_meal_buddy_chat_messages($1, $2, null, 30)`, [A, conversationId])).length === 0);
  check("the conversation and its messages are retained, never deleted",
    (await q(`select count(*)::int as n from public.meal_buddy_conversations where id = $1`, [conversationId]))[0].n === 1
    && (await q(`select count(*)::int as n from public.meal_buddy_messages where conversation_id = $1`, [conversationId]))[0].n === 1);
  check("a repeated unfriend is idempotent and an unrelated actor is refused",
    (await q(`select * from social_internal.end_meal_buddy_relationship($1, $2)`, [A, endedRow.id]))[0]?.relative_state === "none"
    && (await q(`select * from social_internal.end_meal_buddy_relationship($1, $2)`, [C, endedRow.id])).length === 0);

  // ---- REALTIME ---------------------------------------------------------------------------------
  check("the realtime topic is opaque and carries no internal identifier",
    typeof topic === "string" && topic.startsWith("mbrt1.")
    && !topic.includes(conversationId) && !topic.includes(invited.id) && !topic.includes(A) && !topic.includes(B)
    && !/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}/.test(topic), topic);
  check("an unfriended member can no longer subscribe, and a stale topic grants nothing",
    (await canSubscribe(A, topic)) === false && (await canSubscribe(B, topic)) === false);
  check("no further realtime signal can be published once the pair is ended", await (async () => {
    const before = (await q(`select count(*)::int as n from realtime.messages where topic = $1`, [topic]))[0].n;
    await q(`select * from social_internal.send_meal_buddy_chat_message($1, $2, $3, $4)`,
      [A, conversationId, "22222222-2222-4222-8222-222222222222", "after unfriend"]).catch(() => {});
    return (await q(`select count(*)::int as n from realtime.messages where topic = $1`, [topic]))[0].n === before;
  })());

  // ---- RE-INVITE / RE-ACCEPT --------------------------------------------------------------------
  await q(`select * from social_internal.send_meal_buddy_invite($1, $2)`, [B, A]);
  const reinvited = await pair();
  check("a re-invite reuses the same canonical row, clears the end instant and adds no duplicate",
    reinvited.id === endedRow.id && reinvited.state === "pending" && reinvited.ended_at === null
    && (await q(`select count(*)::int as n from public.meal_buddy_relationships`))[0].n === 1, reinvited);
  await q(`select * from social_internal.resolve_meal_buddy_relationship($1, $2, 'accept')`, [A, reinvited.id]);
  check("re-accept restores the SAME canonical conversation and its retained history",
    (await q(`select * from social_internal.open_meal_buddy_chat($1, $2)`, [A, reinvited.id]))[0].conversation_id === conversationId
    && (await q(`select * from social_internal.list_meal_buddy_chat_messages($1, $2, null, 30)`, [A, conversationId])).length === 1);
  check("re-accepting restores subscription authority on the same opaque topic",
    (await canSubscribe(A, topic)) === true && (await canSubscribe(C, topic)) === false);

  // ---- REALTIME PUBLISH / DEDUPE ----------------------------------------------------------------
  const before = (await q(`select count(*)::int as n from realtime.messages where topic = $1`, [topic]))[0].n;
  const key = "33333333-3333-4333-8333-333333333333";
  await q(`select * from social_internal.send_meal_buddy_chat_message($1, $2, $3, $4)`, [A, conversationId, key, "live"]);
  await q(`select * from social_internal.send_meal_buddy_chat_message($1, $2, $3, $4)`, [A, conversationId, key, "live"]);
  const signals = await q(`select event, payload, private from realtime.messages where topic = $1 order by inserted_at desc limit 1`, [topic]);
  check("one new canonical message publishes exactly one private signal, and an idempotent retry publishes none",
    (await q(`select count(*)::int as n from realtime.messages where topic = $1`, [topic]))[0].n === before + 1
    && signals[0].private === true && signals[0].event === "meal_buddy_chat_activity");
  check("the realtime payload carries no identity, body or counterpart data",
    JSON.stringify(signals[0].payload) === JSON.stringify({ kind: "meal_buddy_chat_activity" }), signals[0].payload);

  // ---- PUSH -------------------------------------------------------------------------------------
  await q(`select * from social_internal.register_meal_buddy_push_device($1, $2, $3, $4)`, [B, "install-sr2kb-01", "ios", TOKEN_1]);
  await q(`select * from social_internal.register_meal_buddy_push_device($1, $2, $3, $4)`, [B, "install-sr2kb-02", "android", TOKEN_2]);
  const rotated = await q(`select * from social_internal.register_meal_buddy_push_device($1, $2, $3, $4)`, [C, "install-sr2kb-03", "ios", TOKEN_2]);
  check("a token that moves to another user releases its previous holder",
    rotated[0].rotated === true
    && (await q(`select count(*)::int as n from public.meal_buddy_push_devices where push_token = $1`, [TOKEN_2]))[0].n === 1);
  check("a message event reached the recipient and never the sender",
    (await outbox(B)).some((event) => event.event_kind === "meal_buddy_message_received")
    && !(await outbox(A)).some((event) => event.event_kind === "meal_buddy_message_received"));
  check("an idempotent message retry produced no second event",
    (await outbox(B)).filter((event) => event.dedupe_key.startsWith("message:")).length
      === new Set((await outbox(B)).filter((event) => event.dedupe_key.startsWith("message:")).map((e) => e.dedupe_key)).size);
  const claimed = await q(`select * from social_internal.claim_meal_buddy_notifications($1)`, [50]);
  check("the dispatcher claim carries only dispatch fields, no body and no display identity",
    claimed.length > 0
    && claimed.every((row) => Object.keys(row).sort().join(",")
      === "actor_user_id,event_kind,notification_id,platform,push_token,recipient_user_id")
    && !/live|before the unfriend/.test(JSON.stringify(claimed)));
  const relationBefore = (await pair()).state;
  await q(`select social_internal.complete_meal_buddy_notification($1, false, $2)`, [claimed[0].notification_id, "DeviceNotRegistered"]);
  check("a provider failure is retryable and rolls back no relationship, message or chat state",
    (await q(`select dispatched_at, last_error from public.meal_buddy_notification_outbox where id = $1`, [claimed[0].notification_id]))[0].dispatched_at === null
    && (await pair()).state === relationBefore);
  check("the push device and outbox tables are sealed from every client role",
    (await q(`select grantee from information_schema.role_table_grants
      where table_name in ('meal_buddy_push_devices','meal_buddy_notification_outbox')
        and grantee in ('anon','authenticated','authenticator','service_role','PUBLIC')`)).length === 0);
  check("no push token is reachable from any Social projection",
    !JSON.stringify(await q(`select * from social_internal.list_meal_buddy_relationships($1)`, [A])).includes("ExponentPushToken"));
} catch (error) {
  if (failures.length === 0) check("harness completed without an unexpected error", false, String(error?.message).slice(0, 400));
} finally {
  clearTimeout(watchdog);
  if (runner) await runner.end().catch(() => {});
  if (client) await client.end().catch(() => {});
  if (cluster) cluster.stop();
  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length ? "failed" : "passed",
    postgres: child.spawnSync(exe("postgres"), ["--version"], { encoding: "utf8", windowsHide: true }).stdout?.trim(),
    migrationsApplied: applied,
    candidateMigrations: candidates,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures: failures.map((failure) => failure.name),
    networkUsed: false, credentialsUsed: false, developmentTouched: false, productionTouched: false
  }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}
