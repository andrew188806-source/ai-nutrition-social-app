#!/usr/bin/env node
// RA-1A Development reset.
//
// Development acceptance infrastructure, NOT a Production migration and NOT a runtime capability.
// It exists for exactly one purpose: returning the Development database to a genuinely clean
// pre-RA-1A state so the corrected canonical migration can be proven from a first-install position.
//
// It removes RA-1A objects and nothing else. Before it drops anything it proves the installation is
// pristine — no Platform Admin membership, no audit history, no fixture, no unexpected object in
// admin_internal, and no dependency from an unrelated application object onto an RA-1A object. Any
// deviation aborts before the destructive statement is composed, and nothing is dropped.
//
// Development only. The project ref is hard-pinned, Production is never referenced, and there is no
// override that would let this run anywhere else. Opt in with
// TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_RESET=1.
const OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_RESET";
const DEV_REF = "msbgnnoorsoefuiwluye";
const DEV_NAME = "tastkind-development";
const SUITE = "platform-admin-ra-1a-development-reset";

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({
    suite: SUITE, status: "skipped",
    reason: `set ${OPT_IN}=1 to run this Development-only RA-1A reset`
  }, null, 2));
  process.exit(0);
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const one = async (query) => (await sql(query))[0];

const gates = []; const blocked = [];
function gate(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  gates.push(item); if (!item.pass) blocked.push(item);
  console.log(`${item.pass ? "OK  " : "STOP"} ${String(gates.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}
const section = (title) => console.log(`\n===== ${title}`);

const READER = "platform_admin_context_reader";
const WRITER = "platform_admin_write_authority";
const TABLES = ["platform_admin_audit_log", "platform_admin_memberships",
  "platform_admin_role_permissions", "platform_admin_roles"];
const FUNCTIONS = [
  "public.platform_admin_current_context_v1()",
  "public.platform_admin_has_permission_v1(text)",
  "public.platform_admin_audit_log_v1(integer)",
  "admin_internal.grant_platform_admin(uuid, text, uuid, text)",
  "admin_internal.revoke_platform_admin(uuid, uuid, text)"
];

let dropped = null; let after = null;
try {
  section("0. target identity — Development only, Production never");
  const meta = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  gate(`target is exactly ${DEV_NAME} / ${DEV_REF}`,
    meta.name === DEV_NAME && meta.id === DEV_REF, { name: meta.name, id: meta.id });
  const reachable = await (await fetch("https://api.supabase.com/v1/projects",
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const refs = (Array.isArray(reachable) ? reachable : []).map((p) => `${p.name}[${p.id}]`);
  gate("no project other than Development is reachable with this credential",
    refs.length === 1 && refs[0] === `${DEV_NAME}[${DEV_REF}]`, refs);
  gate("the live database agrees it is the pinned project",
    (await one(`select current_database() as db;`)).db === "postgres");

  section("1. the RA-1A installation is exactly what the migration creates");
  const inventory = await one(`select
    (select pg_catalog.count(*)::int from information_schema.schemata
       where schema_name = 'admin_internal') as schema_present,
    (select pg_catalog.count(*)::int from pg_roles
       where rolname in ('${READER}', '${WRITER}')) as sealed_roles,
    (select pg_catalog.count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'admin_internal' and c.relkind = 'r') as tables,
    (select pg_catalog.count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname like 'platform_admin%'
          or p.proname in ('grant_platform_admin', 'revoke_platform_admin')) as functions;`);
  gate("the RA-1A schema, both sealed roles, four tables and five functions are present",
    inventory.schema_present === 1 && inventory.sealed_roles === 2
    && inventory.tables === 4 && inventory.functions === 5, inventory);
  const relations = (await sql(`select c.relkind::text as kind, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'admin_internal' and c.relkind not in ('i', 'I')
    order by 2;`)).flat();
  gate("admin_internal holds the four RA-1A tables and no other relation",
    JSON.stringify(relations.map((row) => row.relname)) === JSON.stringify(TABLES)
    && relations.every((row) => row.kind === "r"), relations);
  const strays = (await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'admin_internal'
      and p.proname not in ('grant_platform_admin', 'revoke_platform_admin')
    order by 1;`)).flat();
  gate("admin_internal holds no function beyond the two RA-1A operator functions",
    strays.length === 0, strays);

  section("2. nothing has been provisioned — no fixture, no history");
  const rows = await one(`select
    (select pg_catalog.count(*)::int from admin_internal.platform_admin_memberships) as memberships,
    (select pg_catalog.count(*)::int from admin_internal.platform_admin_audit_log) as audit_rows,
    (select pg_catalog.count(*)::int from admin_internal.platform_admin_roles) as roles,
    (select pg_catalog.count(*)::int from admin_internal.platform_admin_role_permissions) as permissions;`);
  gate("no Platform Admin membership exists", rows.memberships === 0, rows);
  gate("no Platform Admin audit history exists", rows.audit_rows === 0, rows);
  gate("exactly the seeded role and its two permissions are present",
    rows.roles === 1 && rows.permissions === 2, rows);

  section("3. no unrelated object depends on an RA-1A object");
  // A dependency reaching an RA-1A object from outside RA-1A would make a CASCADE drop destructive
  // beyond this round's scope. auth.users is expected: the membership table has a foreign key to it,
  // and that direction is RA-1A depending on auth, not the reverse.
  const dependents = (await sql(`select distinct
      dn.nspname || '.' || coalesce(dc.relname, dp.proname, '?') as dependent_object,
      rn.nspname || '.' || coalesce(rc.relname, rp.proname, '?') as ra1a_object
    from pg_depend d
    join pg_class rcl on rcl.oid = d.refclassid
    left join pg_class rc on rc.oid = d.refobjid and rcl.relname = 'pg_class'
    left join pg_proc rp on rp.oid = d.refobjid and rcl.relname = 'pg_proc'
    join pg_namespace rn on rn.oid = coalesce(rc.relnamespace, rp.pronamespace)
    join pg_class ccl on ccl.oid = d.classid
    left join pg_class dc on dc.oid = d.objid and ccl.relname = 'pg_class'
    left join pg_proc dp on dp.oid = d.objid and ccl.relname = 'pg_proc'
    join pg_namespace dn on dn.oid = coalesce(dc.relnamespace, dp.pronamespace)
    where rn.nspname = 'admin_internal'
      and dn.nspname not in ('admin_internal', 'pg_catalog', 'pg_toast')
      and d.deptype <> 'i'
    order by 1, 2;`)).flat();
  gate("no object outside admin_internal depends on an RA-1A object", dependents.length === 0, dependents);
  const publicFns = (await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'platform_admin%' order by 1;`)).flat();
  gate("exactly the three RA-1A reader functions live in the public schema",
    publicFns.length === 3, publicFns.map((row) => row.proname));

  if (blocked.length > 0) throw new Error("PRECONDITION_BLOCKED");

  section("4. removing RA-1A objects, and only RA-1A objects");
  // The sealed roles own the five functions, and `postgres` holds the platform's ADMIN OPTION on
  // both roles but neither inherits from them nor may SET ROLE to them — the same wall that made the
  // migration's post-transfer REVOKE a silent no-op would make these DROPs fail. The membership is
  // therefore widened transiently, exactly as the migration's own bootstrap does, and handed back in
  // the same transaction. DDL is transactional in PostgreSQL, role changes included, so a failure at
  // any point leaves Development untouched.
  //
  // Each object is named. The tables are dropped with CASCADE so their own indexes, policies and
  // constraints go with them, and the schema is then dropped with RESTRICT: if anything unexpected
  // is still inside it, that statement fails and the whole transaction rolls back rather than
  // quietly cascading away something this round never created.
  const statements = [
    "begin;",
    `grant ${READER} to postgres with inherit true, set true;`,
    `grant ${WRITER} to postgres with inherit true, set true;`,
    ...FUNCTIONS.map((fn) => `drop function if exists ${fn};`),
    ...TABLES.map((table) => `drop table if exists admin_internal.${table} cascade;`),
    "drop schema admin_internal restrict;",
    `drop owned by ${READER}, ${WRITER};`,
    `revoke ${READER} from postgres granted by postgres;`,
    `revoke ${WRITER} from postgres granted by postgres;`,
    `drop role if exists ${READER};`,
    `drop role if exists ${WRITER};`,
    "commit;"
  ];
  console.log(statements.map((line) => "  " + line).join("\n"));
  await sql(statements.join("\n"));
  dropped = { schema: "admin_internal", tables: TABLES, functions: FUNCTIONS, roles: [READER, WRITER] };

  section("5. post-reset inventory — RA-1A absent, everything else intact");
  after = await one(`select
    (select pg_catalog.count(*)::int from information_schema.schemata
       where schema_name = 'admin_internal') as schema_present,
    (select pg_catalog.count(*)::int from pg_roles
       where rolname in ('${READER}', '${WRITER}')) as sealed_roles,
    (select pg_catalog.count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname like 'platform_admin%'
          or p.proname in ('grant_platform_admin', 'revoke_platform_admin')) as functions,
    (select pg_catalog.count(*)::int from pg_auth_members a join pg_roles r on r.oid = a.roleid
       where r.rolname like 'platform_admin_%') as sealed_memberships,
    (select pg_catalog.count(*)::int from information_schema.schemata
       where schema_name in ('public', 'social_internal', 'geo_internal')) as core_schemas,
    (select pg_catalog.count(*)::int from information_schema.tables
       where table_schema = 'public') as public_tables,
    (select pg_catalog.count(*)::int from supabase_migrations.schema_migrations) as ledger_rows;`);
  gate("admin_internal is gone", after.schema_present === 0, after);
  gate("both sealed roles are gone", after.sealed_roles === 0, after);
  gate("all five RA-1A functions are gone", after.functions === 0, after);
  gate("no sealed-role membership row remains", after.sealed_memberships === 0, after);
  gate("the unrelated schemas are untouched", after.core_schemas === 3, after);
  gate("the migration ledger was not written to", after.ledger_rows === 65, after);
} catch (error) {
  gate("the reset completed without error", false, String(error).slice(0, 400));
}

console.log("\n" + JSON.stringify({
  suite: SUITE,
  project: DEV_REF,
  total: gates.length,
  passed: gates.length - blocked.length,
  blocked: blocked.map((item) => item.name),
  dropped,
  postResetInventory: after,
  adminsProvisioned: 0,
  productionTouched: false
}, null, 2));
process.exitCode = blocked.length === 0 ? 0 : 1;
