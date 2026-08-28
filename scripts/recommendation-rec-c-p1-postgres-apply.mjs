#!/usr/bin/env node
// REC-C-P1 disposable PostgreSQL 17 non-superuser apply/runtime gate. Localhost only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";

const SUITE = "recommendation-rec-c-p1-postgres-apply";
const ROOT = process.cwd(); const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const P1_MIGRATION = "20260831010000_user_allergy_setting_authority.sql";
const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const PG_BIN = (argument("--pg-bin") ?? process.env.RECCP1_PG_BIN
  ?? path.join(os.homedir(), "tastkind-pg17.6/install/bin")).trim();
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const postgresAvailable = fs.existsSync(exe("postgres")) && fs.existsSync(exe("psql"));
if (!postgresAvailable) {
  console.log(JSON.stringify({ suite: SUITE, status: "blocked",
    reason: `PostgreSQL 17 binaries not found at ${PG_BIN}`,
    networkUsed: false, developmentTouched: false, productionTouched: false }, null, 2));
  process.exitCode = 1;
}

async function run() {
  const checks = []; const failures = [];
  const check = (name, pass, detail) => {
    const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
    checks.push(item); if (!item.pass) failures.push(item);
    console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  };
  const tempRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
  const temp = fs.mkdtempSync(path.join(tempRoot, "reccp1-pg17-"));
  const data = path.join(temp, "data"); const log = path.join(temp, "postgres.log");
  const port = await freePort(); let started = false; let applied = 0; let unexpected = null;
  const env = { ...process.env, PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: "postgres" };
  const exec = (program, args, options = {}) => child.execFileSync(exe(program), args, {
    encoding: "utf8", env, maxBuffer: 32 * 1024 * 1024, ...options
  });
  const psql = (user, sql, allowFailure = false) => {
    try {
      return { ok: true, output: exec("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-c", sql]).trim() };
    } catch (error) {
      if (!allowFailure) throw error;
      return { ok: false, output: `${error.stderr ?? ""}${error.stdout ?? ""}` };
    }
  };
  const asUser = (userId, sql, allowFailure = false) => psql("postgres", `begin; set local role authenticated;
    select pg_catalog.set_config('request.jwt.claim.sub', '${userId}', true); ${sql} commit;`, allowFailure);
  try {
    const version = exec("postgres", ["--version"]).trim();
    check("runtime is PostgreSQL 17.x", /PostgreSQL\) 17\./.test(version), version);
    exec("initdb", ["-D", data, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"]);
    exec("pg_ctl", ["-D", data, "-l", log, "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c full_page_writes=off -c synchronous_commit=off`, "start"]);
    started = true;
    psql("supabase_admin", BOOTSTRAP);

    const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      try {
        exec("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-f", path.join(MIGRATIONS, file)]);
        applied += 1;
      } catch (error) {
        check(`migration applies through COMMIT: ${file}`, false, `${error.stderr ?? ""}${error.stdout ?? ""}`.slice(-1200));
        throw error;
      }
    }
    check("all repository migrations apply through COMMIT as non-superuser", applied === files.length, { applied, total: files.length });
    check("REC-C-P1 is exactly the migration after frozen P0", files.at(-1) === P1_MIGRATION
      && files.at(-2) === "20260830010000_candidate_allergen_data_authority.sql", files.slice(-3));
    const identity = psql("postgres", "select current_user || ':' || current_setting('is_superuser');").output;
    check("migration runner has no superuser bypass", identity === "postgres:off", identity);

    psql("supabase_admin", "grant authenticated, anon to postgres;");
    const userA = "00000000-0000-4000-8000-0000000000a1";
    const userB = "00000000-0000-4000-8000-0000000000b2";
    psql("postgres", `insert into auth.users(id,email) values ('${userA}','a@example.test'),('${userB}','b@example.test');`);
    const columns = psql("postgres", `select pg_catalog.string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns where table_schema='public' and table_name='dietary_restrictions'
      and column_name like 'source_%';`).output;
    check("exact governed source tuple exists", columns === "source_vocabulary_id,source_vocabulary_version,source_value_key", columns);

    psql("postgres", `insert into public.dietary_restrictions(user_id,restriction_type,label)
      values ('${userA}','allergy','peanut');`);
    check("legacy all-null row remains valid", psql("postgres", `select count(*) from public.dietary_restrictions
      where user_id='${userA}' and source_vocabulary_id is null;`).output === "1");
    const partial = psql("postgres", `insert into public.dietary_restrictions(user_id,restriction_type,label,source_vocabulary_id)
      values ('${userA}','x','x','private-restriction-allergen-v1');`, true);
    check("partial governed tuple is rejected", !partial.ok && /dietary_restrictions_governed_source_tuple_complete/.test(partial.output));
    const forged = psql("postgres", `insert into public.dietary_restrictions(user_id,restriction_type,label,
      source_vocabulary_id,source_vocabulary_version,source_value_key)
      values ('${userA}','x','x','private-restriction-allergen-v1',1,'shellfish');`, true);
    check("arbitrary source key is rejected by P0 FK", !forged.ok && /dietary_restrictions_governed_source_fk/.test(forged.output));

    const peanut = asUser(userA, "select public.replace_authenticated_allergy_settings_v1(array['peanut']);");
    check("governed peanut persists despite matching legacy text", peanut.ok
      && psql("postgres", `select count(*) from public.dietary_restrictions where user_id='${userA}';`).output === "2");
    check("reader returns canonical peanut key", /"allergen_keys": \["peanut"\]/.test(asUser(userA,
      "select public.read_authenticated_allergy_settings_v1();").output));
    const multi = asUser(userA, "select public.replace_authenticated_allergy_settings_v1(array['milk','egg']);");
    check("milk plus egg multi-select persists", multi.ok && /"egg"/.test(multi.output) && /"milk"/.test(multi.output));
    const duplicate = asUser(userA, "select public.replace_authenticated_allergy_settings_v1(array['peanut','peanut']);", true);
    check("duplicate active selection is rejected", !duplicate.ok && /ALLERGY_SOURCE_KEY_DUPLICATE/.test(duplicate.output));
    const unknown = asUser(userA, "select public.replace_authenticated_allergy_settings_v1(array['shellfish']);", true);
    check("arbitrary free text is rejected", !unknown.ok && /ALLERGY_SOURCE_KEY_NOT_ACTIVE/.test(unknown.output));

    check("another user reads an isolated empty setting", /"allergen_keys": \[\]/.test(asUser(userB,
      "select public.read_authenticated_allergy_settings_v1();").output));
    const crossWrite = asUser(userB, `update public.dietary_restrictions set label='forged' where user_id='${userA}';`, true);
    check("authenticated user cannot directly mutate another user's row", !crossWrite.ok && /permission denied/.test(crossWrite.output));
    const directOwn = asUser(userA, `insert into public.dietary_restrictions(user_id,restriction_type,label)
      values ('${userA}','x','direct');`, true);
    check("authenticated client cannot bypass canonical writer even for self", !directOwn.ok && /permission denied/.test(directOwn.output));
    const anon = psql("postgres", "begin; set local role anon; select public.read_authenticated_allergy_settings_v1(); commit;", true);
    check("anonymous user cannot execute private reader", !anon.ok && /permission denied/.test(anon.output));

    asUser(userA, "select public.replace_authenticated_allergy_settings_v1(array['peanut']);");
    psql("postgres", `update public.private_restriction_allergen_source_values
      set active=false, retired_at=pg_catalog.clock_timestamp()
      where source_vocabulary_id='private-restriction-allergen-v1' and source_vocabulary_version=1 and source_value_key='peanut';`);
    const retired = asUser(userA, "select public.read_authenticated_allergy_settings_v1();").output;
    check("retired governed value is unresolved rather than absent", /"allergen_keys": \[\]/.test(retired)
      && /"unresolved_selection_count": 1/.test(retired), retired);
    psql("postgres", `update public.private_restriction_allergen_source_values set active=true, retired_at=null
      where source_vocabulary_id='private-restriction-allergen-v1' and source_vocabulary_version=1 and source_value_key='peanut';`);
    const cleared = asUser(userA, "select public.replace_authenticated_allergy_settings_v1('{}'::text[]);").output;
    check("deselect clears governed rows only", /"allergen_keys": \[\]/.test(cleared)
      && psql("postgres", `select count(*) from public.dietary_restrictions where user_id='${userA}' and source_vocabulary_id is null;`).output === "1");
  } catch (error) {
    unexpected = error instanceof Error
      ? `${error.message}\n${error.stderr ?? ""}\n${error.stdout ?? ""}`.trim()
      : String(error);
  } finally {
    if (started) {
      try { exec("pg_ctl", ["-D", data, "-m", "immediate", "stop"]); } catch { /* best effort */ }
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
  check("gate completed without unexpected harness error", unexpected === null, unexpected);
  console.log("\n" + JSON.stringify({
    suite: SUITE, status: failures.length ? "failed" : "passed", postgresVersion: "17.6",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    failures: failures.map((item) => item.name), migrationsApplied: applied,
    unexpectedError: unexpected,
    clusterDisposable: true, residueRemoved: !fs.existsSync(temp), networkUsed: false,
    developmentTouched: false, productionTouched: false
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => { const address = server.address(); const port = address.port; server.close(() => resolve(port)); });
    server.on("error", reject);
  });
}

const BOOTSTRAP = `
do $$ begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='authenticator') then create role authenticator login noinherit password 'authenticator'; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='supabase_realtime_admin') then create role supabase_realtime_admin nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='supabase_storage_admin') then create role supabase_storage_admin nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='postgres') then create role postgres login nosuperuser createrole createdb; end if;
end $$;
alter role postgres nosuperuser createrole createdb;
grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;
alter database postgres owner to postgres;
alter schema public owner to pg_database_owner;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth authorization supabase_admin;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant select on table auth.users to service_role;
grant references, select, insert on table auth.users to postgres;
create schema if not exists storage authorization supabase_admin;
create table if not exists storage.buckets(id text primary key, name text not null, owner uuid, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now());
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz not null default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
alter table storage.buckets owner to supabase_storage_admin; alter table storage.objects owner to supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role, postgres; grant supabase_storage_admin to postgres with admin option;
create schema if not exists realtime authorization supabase_admin;
create table if not exists realtime.messages(id uuid not null default gen_random_uuid(), topic text not null, extension text not null,
  event text, payload jsonb, private boolean default false, inserted_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table realtime.messages owner to supabase_realtime_admin; alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
alter function realtime.topic() owner to supabase_realtime_admin;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$ begin insert into realtime.messages(topic,extension,event,payload,private)
values(topic,'broadcast',event,payload,private); end; $$;
alter function realtime.send(jsonb,text,text,boolean) owner to supabase_realtime_admin;
grant usage on schema realtime to anon, authenticated, service_role, postgres;
grant select on table realtime.messages to authenticated; grant usage on schema realtime to postgres with grant option;
grant insert, select on table realtime.messages to postgres; grant execute on function realtime.send(jsonb,text,text,boolean) to postgres;
alter table realtime.messages owner to postgres; grant insert, select on table realtime.messages to supabase_realtime_admin;
`;

if (postgresAvailable) await run();
