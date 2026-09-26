#!/usr/bin/env node
// Negative and positive proof for the GQA-3 public-schema Data API guard.
// In-memory only: the real migrations are read, never written; fixtures exist only in this process.
import assert from "node:assert/strict";
import { readManifest } from "./db-migration-baseline-manifest.mjs";
import { evaluateMigrations, readRepositoryMigrations } from "./public-schema-data-api-grant-guard.mjs";

const manifest = readManifest();
const historical = readRepositoryMigrations();
assert.equal(historical.length, manifest.count, "harness runs against the exact historical set");
const NAME = "20990101000000_gqa3_fixture.sql";
const run = (sql, { name = NAME, files = historical } = {}) => evaluateMigrations({ manifest, files: [...files, ...(sql === null ? [] : [{ name, text: sql }])] }).failures;

const T = "public.gqa3_fixture_notes";
const authRead = `-- TASTKIND_DATA_API: ${T} mode=AUTHENTICATED_READ rls=ENABLED
create table ${T} (id uuid primary key, owner_id uuid not null);
alter table ${T} enable row level security;
revoke all on table ${T} from public, anon, authenticated;
grant select on table ${T} to authenticated;
create policy gqa3_fixture_notes_select on ${T} for select to authenticated using (owner_id = auth.uid());
`;
const authReadWrite = `-- TASTKIND_DATA_API: ${T} mode=AUTHENTICATED_READ_WRITE rls=ENABLED
create table ${T} (id uuid primary key, owner_id uuid not null);
alter table ${T} enable row level security;
revoke all on table ${T} from public, anon, authenticated;
grant select, insert, update on table ${T} to authenticated;
create policy gqa3_fixture_notes_select on ${T} for select to authenticated using (owner_id = auth.uid());
create policy gqa3_fixture_notes_insert on ${T} for insert to authenticated with check (owner_id = auth.uid());
create policy gqa3_fixture_notes_update on ${T} for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
`;
const serverOnly = `-- TASTKIND_DATA_API: ${T} mode=SERVER_ONLY rls=ENABLED
create table ${T} (id uuid primary key, payload jsonb not null);
alter table ${T} enable row level security;
revoke all on table ${T} from public, anon, authenticated;
grant select, insert, update, delete on table ${T} to service_role;
`;
const sealed = `-- TASTKIND_DATA_API: ${T} mode=SEALED_RPC_ONLY rls=FORCED
create role gqa3_fixture_writer nologin noinherit nobypassrls;
create table ${T} (id uuid primary key, payload jsonb not null);
alter table ${T} enable row level security;
alter table ${T} force row level security;
revoke all on table ${T} from public, anon, authenticated, service_role;
grant select, insert on table ${T} to gqa3_fixture_writer;
create policy gqa3_fixture_notes_writer on ${T} for all to gqa3_fixture_writer using (true) with check (true);
create function public.gqa3_fixture_read_v1() returns integer language sql security definer set search_path = '' as $$ select count(*)::integer from public.gqa3_fixture_notes $$;
revoke all on function public.gqa3_fixture_read_v1() from public, anon, authenticated, service_role;
grant execute on function public.gqa3_fixture_read_v1() to authenticated;
`;
const noPublicTable = `create schema if not exists gqa3_internal;
create table gqa3_internal.fixture_private (id uuid primary key);
create function public.gqa3_fixture_ping_v1() returns integer language sql as $$ select 1 $$;
`;
const publicRead = `-- TASTKIND_DATA_API: ${T} mode=PUBLIC_READ rls=ENABLED justification="published catalogue rows readable before sign-in"
create table ${T} (id uuid primary key, published boolean not null);
alter table ${T} enable row level security;
revoke all on table ${T} from public, anon, authenticated;
grant select on table ${T} to anon, authenticated;
create policy gqa3_fixture_notes_public on ${T} for select to anon, authenticated using (published);
`;

let passed = 0;
const legit = (name, sql, options) => {
  const f = run(sql, options);
  assert.deepEqual(f, [], `legitimate fixture rejected (${name}): ${f.join(" | ")}`);
  passed += 1; console.log(`PASS legit ${name}`);
};
legit("current repository (no new migration)", null);
legit("authenticated read", authRead);
legit("authenticated read/write", authReadWrite);
legit("server-only", serverOnly);
legit("sealed-RPC-only", sealed);
legit("migration that creates no public table", noPublicTable);
legit("public read with justification", publicRead);

const rows = [];
const reject = (label, sql, pattern, options) => {
  const f = run(sql, options);
  const hit = f.some((x) => pattern.test(x));
  assert.ok(hit, `NOT rejected as expected (${label}); failures: ${f.join(" | ") || "none"}`);
  rows.push(label); console.log(`KILLED ${String(rows.length).padStart(2, "0")} ${label}`);
};
const replace = (sql, from, to) => { assert.ok(sql.includes(from), `fixture anchor missing: ${from}`); return sql.replace(from, to); };
const firstHistorical = historical[0];

reject("1 new public table with no Data API decision", replace(authRead, `-- TASTKIND_DATA_API: ${T} mode=AUTHENTICATED_READ rls=ENABLED\n`, ""), /has no TASTKIND_DATA_API decision/);
reject("2a new public table with no RLS decision in the marker", replace(authRead, " rls=ENABLED", ""), /malformed Data API marker/);
reject("2b marker declares RLS but the table never enables it", replace(authRead, `alter table ${T} enable row level security;\n`, ""), /row level security is not enabled/);
reject("3 AUTHENTICATED_READ without a SELECT grant", replace(authRead, `grant select on table ${T} to authenticated;\n`, ""), /requires exactly SELECT for authenticated/);
reject("4 AUTHENTICATED_READ with a write grant", `${authRead}grant insert on table ${T} to authenticated;\n`, /requires exactly SELECT for authenticated/);
reject("5 READ_WRITE with the INSERT policy missing", replace(authReadWrite, `create policy gqa3_fixture_notes_insert on ${T} for insert to authenticated with check (owner_id = auth.uid());\n`, ""), /grants INSERT without a matching policy/);
reject("6 SERVER_ONLY with a direct authenticated grant", `${serverOnly}grant select on table ${T} to authenticated;\n`, /SERVER_ONLY but authenticated holds/);
reject("7 SEALED_RPC_ONLY with a direct anon grant", `${sealed}grant select on table ${T} to anon;\n`, /SEALED_RPC_ONLY but anon holds/);
reject("8 broad GRANT ALL", `${authRead}grant all on table ${T} to authenticated;\n`, /broad grant is not allowed/);
reject("8b GRANT ... ON ALL TABLES IN SCHEMA public", `${authRead}grant select on all tables in schema public to anon;\n`, /broad grant is not allowed/);
reject("9 schema-wide ALTER DEFAULT PRIVILEGES grant", `${noPublicTable}alter default privileges in schema public grant select on tables to anon;\n`, /ALTER DEFAULT PRIVILEGES/);
reject("10 marker for the wrong table", replace(authRead, `-- TASTKIND_DATA_API: ${T} `, "-- TASTKIND_DATA_API: public.some_other_table "), /does not introduce|has no TASTKIND_DATA_API decision/);
reject("11 duplicate conflicting markers", `-- TASTKIND_DATA_API: ${T} mode=SERVER_ONLY rls=ENABLED\n${authRead}`, /duplicate Data API marker/);
reject("12 unknown access mode", replace(authRead, "mode=AUTHENTICATED_READ", "mode=AUTHENTICATED_READS"), /unknown Data API mode/);
reject("13 public table hidden by whitespace and casing", `${noPublicTable}CREATE\n   TABLE    PUBLIC.Gqa3_Hidden\n (id uuid);\n`, /public\.gqa3_hidden has no TASTKIND_DATA_API decision/);
reject("14 quoted public identifier", `${noPublicTable}create table "public"."gqa3_quoted" (id uuid);\n`, /public\.gqa3_quoted has no TASTKIND_DATA_API decision/);
reject("15 CREATE TABLE IF NOT EXISTS public", `${noPublicTable}create table if not exists public.gqa3_ine (id uuid);\n`, /public\.gqa3_ine has no TASTKIND_DATA_API decision/);
reject("16 table created then renamed to evade the marker", `${authRead}alter table ${T} rename to gqa3_renamed;\n`, /public\.gqa3_renamed has no TASTKIND_DATA_API decision/);
reject("17 grant written only in a comment", replace(authRead, `grant select on table ${T} to authenticated;`, `-- grant select on table ${T} to authenticated;`), /requires exactly SELECT for authenticated/);
reject("18 RLS written only in a comment", replace(authRead, `alter table ${T} enable row level security;`, `/* alter table ${T} enable row level security; */`), /row level security is not enabled/);
reject("19 historical migration edited instead of adding a new one", null, /historical migration edited/, {
  files: [{ ...firstHistorical, text: `${firstHistorical.text}\ngrant select on table public.restaurants to anon;\n` }, ...historical.slice(1)]
});
reject("20a wildcard marker bypass", replace(authRead, `-- TASTKIND_DATA_API: ${T} `, "-- TASTKIND_DATA_API: public.* "), /marker must name one exact public table/);
reject("20b prefix marker bypass", replace(authRead, `-- TASTKIND_DATA_API: ${T} `, "-- TASTKIND_DATA_API: public.gqa3_ "), /does not introduce|has no TASTKIND_DATA_API decision/);
reject("21 migration name without the timestamp convention", authRead, /does not follow <14-digit timestamp>/, { name: "2099_gqa3_fixture.sql" });
reject("22 duplicate timestamp", authRead, /duplicate migration timestamp/, { name: `${firstHistorical.name.slice(0, 14)}_gqa3_fixture.sql` });
reject("22b new migration ordered before the historical tail", authRead, /does not sort after the last historical migration/, { name: "20200101000000_gqa3_fixture.sql" });
reject("23 anon grant without an explicit PUBLIC_READ mode", `${authRead}grant select on table ${T} to anon;\n`, /AUTHENTICATED_READ but anon holds/);
reject("24 policy on an unrelated table", replace(authRead, `create policy gqa3_fixture_notes_select on ${T}`, "create policy gqa3_fixture_notes_select on public.meal_records"), /requires a SELECT policy for authenticated on this table/);
reject("25 REVOKE contradicts the marker", `${authRead}revoke select on table ${T} from authenticated;\n`, /requires exactly SELECT for authenticated/);
reject("26 public table created inside a DO block", `${noPublicTable}do $$ begin if true then create table public.gqa3_do_hidden (id uuid); end if; end $$;\n`, /public\.gqa3_do_hidden has no TASTKIND_DATA_API decision/);
reject("27 anon grant hidden in EXECUTE inside a DO block", `${authRead}do $$ begin execute 'grant select on table ${T} to anon'; end $$;\n`, /AUTHENTICATED_READ but anon holds/);
reject("28 table moved into public with SET SCHEMA", `${noPublicTable}alter table gqa3_internal.fixture_private set schema public;\n`, /public\.fixture_private has no TASTKIND_DATA_API decision/);
reject("29 PUBLIC_READ without justification", replace(publicRead, ' justification="published catalogue rows readable before sign-in"', ""), /PUBLIC_READ requires justification/);
reject("30 SEALED_RPC_ONLY without FORCE ROW LEVEL SECURITY", replace(replace(sealed, "rls=FORCED", "rls=ENABLED"), `alter table ${T} force row level security;\n`, ""), /SEALED_RPC_ONLY requires rls=FORCED/);
reject("31 SERVER_ONLY with no server grant", replace(serverOnly, `grant select, insert, update, delete on table ${T} to service_role;\n`, ""), /SERVER_ONLY requires an explicit grant/);
reject("32 SERVER_ONLY without an explicit REVOKE", replace(serverOnly, `revoke all on table ${T} from public, anon, authenticated;\n`, ""), /requires an explicit REVOKE/);
reject("33 existing table grant changed without a CHANGE decision", `${noPublicTable}grant insert on table public.meal_records to authenticated;\n`, /public\.meal_records changes grants\/policies\/RLS without a TASTKIND_DATA_API_CHANGE decision/);
reject("34 existing table RLS disabled", `-- TASTKIND_DATA_API_CHANGE: public.meal_records mode=AUTHENTICATED_READ rls=ENABLED\nalter table public.meal_records disable row level security;\n`, /weakening row level security/);
reject("35 sealed table with a policy that applies to every role", `${sealed}create policy gqa3_fixture_open on ${T} for select using (true);\n`, /policy applies to a client role/);
reject("36 PUBLIC granted table privileges", `${authRead}grant select on table ${T} to public;\n`, /PUBLIC holds table privileges/);
reject("37 TRUNCATE granted to a client role", `${authReadWrite}grant truncate on table ${T} to authenticated;\n`, /non-CRUD privileges/);

// Contract-scan classifier: synthetic references against the real definitions.
const { collectDefinitions, classify } = await import("./db-object-contract-scan.mjs");
const definitions = collectDefinitions();
const ref = (name, kind, how, file = "apps/mobile/features/x/supabaseContracts.ts") => ({ name, kind, how, file, context: /mock|test/i.test(file) ? "non-runtime" : "runtime" });
const scan = classify(definitions, { refs: [
  ref("create_current_user_meal_record_v2", "function", "rpc-literal"),
  ref("consumer_imaginary_missing_rpc_v1", "function", "rpc-literal"),
  ref("imaginary_missing_table", "relation", "from-literal"),
  ref("auth.users", "relation", "sql-qualified-relation"),
  ref("<dynamic:NAME>", "function", "rpc-constant"),
  ref("consumer_imaginary_missing_rpc_v1", "function", "rpc-literal", "apps/mobile/features/x/mockRepository.ts"),
  ref("meal-photo-analysis", "edge-function", "invoke-literal"),
  ref("imaginary-edge-function", "edge-function", "invoke-literal")
], sources: 0 });
const statusOf = (i) => scan[i].status;
const scanChecks = [
  ["defined RPC resolves", statusOf(0) === "DEFINED_LOCAL"],
  ["undefined runtime RPC is a possible missing contract", statusOf(1) === "POSSIBLE_MISSING_CONTRACT" && scan[1].context === "runtime"],
  ["undefined runtime table is a possible missing contract", statusOf(2) === "POSSIBLE_MISSING_CONTRACT"],
  ["Supabase-managed auth.users is external", statusOf(3) === "EXTERNAL_PLATFORM_OBJECT"],
  ["dynamic identifier is not statically provable", statusOf(4) === "DYNAMIC"],
  ["mock/test context never blocks", scan[5].context === "non-runtime"],
  ["existing Edge Function resolves", statusOf(6) === "DEFINED_LOCAL"],
  ["missing Edge Function is a possible missing contract", statusOf(7) === "POSSIBLE_MISSING_CONTRACT"]
];
for (const [label, ok] of scanChecks) { assert.ok(ok, `contract-scan classifier: ${label}`); console.log(`PASS scan ${label}`); }

console.log(`public-schema Data API mutations PASS: ${passed} legitimate fixtures accepted, ${rows.length} mutations rejected, ${scanChecks.length} contract-scan classifier checks; no real migration touched`);
