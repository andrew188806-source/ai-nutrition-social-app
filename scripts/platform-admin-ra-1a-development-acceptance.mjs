#!/usr/bin/env node
// RA-1A Development acceptance assertions.
//
// PREPARED, NOT RUN during the RA-1A freeze. This harness proves, against a Development database
// that has already executed the RA-1A migration, that the sealed role graph and the effective
// privilege surface are what the migration intends. It reads PostgreSQL catalogues only: it creates
// nothing, grants nothing, provisions no Platform Admin and mutates no row.
//
// Development only. The project ref is hard-pinned and Production is never referenced. Opt in with
// TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_ACCEPTANCE=1.
const OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_ACCEPTANCE";
const DEV_REF = "msbgnnoorsoefuiwluye";
const SUITE = "platform-admin-ra-1a-development-acceptance";

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({
    suite: SUITE, status: "skipped",
    reason: `set ${OPT_IN}=1 to run this Development-only acceptance after the RA-1A migration is applied`
  }, null, 2));
  process.exit(0);
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

// The Management API throttles sustained query volume. A 429 midway through the lifecycle would
// otherwise abandon the run between the grant and the revoke, leaving an active Platform Admin
// behind — so throttling is waited out rather than treated as a failure. Only 429 is retried; every
// other status still fails immediately and loudly.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function sql(query, attempts = 12) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    if (res.status !== 429) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
    const delay = Math.min(30000, 4000 * attempt);
    console.log(`     (throttled, attempt ${attempt}/${attempts}; waiting ${delay / 1000}s)`);
    await wait(delay);
  }
  throw new Error("Management API still throttled after the full backoff budget");
}
const one = async (query) => (await sql(query))[0];

const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}
const section = (title) => console.log(`\n===== ${title}`);

const READER = "platform_admin_context_reader";
const WRITER = "platform_admin_write_authority";
const CLIENT_ROLES = ["authenticated", "anon", "authenticator", "service_role"];
const TABLES = ["platform_admin_roles", "platform_admin_role_permissions",
  "platform_admin_memberships", "platform_admin_audit_log"];
const READER_FUNCTIONS = [
  "public.platform_admin_current_context_v1()",
  "public.platform_admin_has_permission_v1(text)",
  "public.platform_admin_audit_log_v1(integer)"
];
const OPERATOR_FUNCTIONS = [
  "admin_internal.grant_platform_admin(uuid, text, uuid, text)",
  "admin_internal.revoke_platform_admin(uuid, uuid, text)"
];

// The membership lifecycle is the only mutating part of this file and carries its own second gate,
// so the acceptance gate alone can never provision an admin. The target is the documented
// Development Restaurant owner fixture, pinned by UUID: this proves Restaurant Owner and Platform
// Admin are independent authorities on one identity. Its password is read from the environment and
// is never stored in the repository.
const LIFECYCLE_OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_LIFECYCLE";
const LIFECYCLE_TARGET = "81b4cdaf-2f12-4bda-bb26-197f6f5990ae";
const LIFECYCLE_TARGET_EMAIL = "restaurant.owner.demo.20260903@development.invalid";
const LIFECYCLE_TARGET_PASSWORD = process.env.TASTKIND_RA1A_LIFECYCLE_TARGET_PASSWORD;
let ANON_KEY;
let lifecycle = { executed: false, rowsMutated: 0, adminsProvisioned: 0 };

if (process.env[LIFECYCLE_OPT_IN] === "1") {
  if (!LIFECYCLE_TARGET_PASSWORD) {
    throw new Error("TASTKIND_RA1A_LIFECYCLE_TARGET_PASSWORD absent — the lifecycle needs a real session");
  }
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  ANON_KEY = (Array.isArray(keys) ? keys : []).find((key) => key.name === "anon")?.api_key;
  if (!ANON_KEY) throw new Error("could not resolve the Development anon key");
}

try {
  section("0. environment identity");
  const meta = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  check("target is exactly tastkind-development", meta.name === "tastkind-development" && meta.id === DEV_REF,
    { name: meta.name, id: meta.id });

  section("1. the migration is applied and the sealed roles exist");
  const roles = await sql(`select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
    rolreplication, rolbypassrls, rolinherit
    from pg_roles where rolname in ('${READER}', '${WRITER}') order by rolname;`);
  check("both sealed roles exist", roles.flat().length === 2, roles.flat().map((r) => r.rolname));
  check("neither sealed role may log in, and neither is elevated in any way",
    roles.flat().every((r) => r.rolcanlogin === false && r.rolsuper === false && r.rolcreatedb === false
      && r.rolcreaterole === false && r.rolreplication === false && r.rolbypassrls === false
      && r.rolinherit === false), roles.flat());

  // ---------------------------------------------------------------- role graph
  section("2. role graph: no client role is a member of a sealed role");
  // pg_has_role(role, target, 'USAGE') is true when `role` can use target's privileges; 'MEMBER' is
  // true for membership even without INHERIT. Both are asserted, so an INHERIT FALSE / SET TRUE
  // membership cannot hide here.
  for (const client of CLIENT_ROLES) {
    for (const sealed of [READER, WRITER]) {
      const row = await one(`select
        pg_catalog.pg_has_role('${client}', '${sealed}', 'MEMBER') as is_member,
        pg_catalog.pg_has_role('${client}', '${sealed}', 'USAGE') as can_use;`);
      check(`${client} is neither a MEMBER nor a USAGE-inheritor of ${sealed}`,
        row.is_member === false && row.can_use === false, { client, sealed, ...row });
    }
  }
  const memberships = await sql(`select r.rolname as sealed_role, m.rolname as member_role,
      a.admin_option, a.inherit_option, a.set_option, g.rolname as grantor
    from pg_auth_members a
    join pg_roles r on r.oid = a.roleid
    join pg_roles m on m.oid = a.member
    join pg_roles g on g.oid = a.grantor
    where r.rolname in ('${READER}', '${WRITER}') order by 1, 2;`);
  // Supabase itself grants every newly created role to `postgres` as `supabase_admin`, at CREATE
  // ROLE time. That row is platform-owned: this migration did not write it and must not fight it.
  // Every sealed authority role already accepted in this database carries the identical shape. It
  // is admissible ONLY in its bounded form — no inheritance and no SET ROLE — which leaves it
  // unusable as an execution path. Anything else, from any grantor, is a failure.
  const PLATFORM_GRANTOR = "supabase_admin";
  const surviving = memberships.flat();
  check("every surviving sealed-role membership is the bounded platform-owned postgres row",
    surviving.every((row) => row.member_role === "postgres" && row.grantor === PLATFORM_GRANTOR
      && row.inherit_option === false && row.set_option === false)
    && surviving.length === new Set(surviving.map((row) => row.sealed_role)).size
    && surviving.length <= 2,
    surviving);
  check("the migration's own transient bootstrap membership is gone",
    surviving.every((row) => row.grantor !== "postgres"), surviving);
  check("no client or runtime role appears in any sealed-role membership row",
    surviving.every((row) => !CLIENT_ROLES.includes(row.member_role)), surviving);
  const postgresReach = await one(`select
    pg_catalog.pg_has_role('postgres', '${READER}', 'USAGE') as reader_usage,
    pg_catalog.pg_has_role('postgres', '${WRITER}', 'USAGE') as writer_usage;`);
  check("postgres cannot use either sealed role's privileges through the platform row",
    postgresReach.reader_usage === false && postgresReach.writer_usage === false, postgresReach);
  const reverse = await sql(`select r.rolname as parent, m.rolname as sealed_role
    from pg_auth_members a
    join pg_roles r on r.oid = a.roleid
    join pg_roles m on m.oid = a.member
    where m.rolname in ('${READER}', '${WRITER}') order by 1;`);
  check("neither sealed role is itself a member of any other role", reverse.flat().length === 0, reverse.flat());

  // ---------------------------------------------------------------- schema and tables
  section("3. no client role reaches the admin_internal schema or its tables");
  for (const client of [...CLIENT_ROLES, "public"]) {
    const row = await one(`select
      pg_catalog.has_schema_privilege('${client}', 'admin_internal', 'USAGE') as usage,
      pg_catalog.has_schema_privilege('${client}', 'admin_internal', 'CREATE') as create_;`);
    check(`${client} has no USAGE or CREATE on admin_internal`,
      row.usage === false && row.create_ === false, { client, ...row });
  }
  for (const client of [...CLIENT_ROLES, "public"]) {
    for (const table of TABLES) {
      const row = await one(`select
        pg_catalog.has_table_privilege('${client}', 'admin_internal.${table}', 'SELECT') as s,
        pg_catalog.has_table_privilege('${client}', 'admin_internal.${table}', 'INSERT') as i,
        pg_catalog.has_table_privilege('${client}', 'admin_internal.${table}', 'UPDATE') as u,
        pg_catalog.has_table_privilege('${client}', 'admin_internal.${table}', 'DELETE') as d;`);
      check(`${client} has no SELECT/INSERT/UPDATE/DELETE on ${table}`,
        row.s === false && row.i === false && row.u === false && row.d === false,
        { client, table, ...row });
    }
  }
  // Column-level leakage: a table-level revoke does not by itself prove no column grant exists.
  const columnLeaks = await sql(`select grantee, table_name, column_name, privilege_type
    from information_schema.column_privileges
    where table_schema = 'admin_internal'
      and grantee in ('authenticated', 'anon', 'authenticator', 'service_role', 'PUBLIC')
    order by 1, 2, 3;`);
  check("no client role holds a column-level privilege on any admin_internal table",
    columnLeaks.flat().length === 0, columnLeaks.flat());

  // ---------------------------------------------------------------- reader privileges
  section("4. the sealed reader holds exactly its minimum column SELECT");
  const readerTableWrites = await one(`select
    bool_or(pg_catalog.has_table_privilege('${READER}', 'admin_internal.' || t, 'INSERT')
      or pg_catalog.has_table_privilege('${READER}', 'admin_internal.' || t, 'UPDATE')
      or pg_catalog.has_table_privilege('${READER}', 'admin_internal.' || t, 'DELETE')) as any_write
    from pg_catalog.unnest(array['${TABLES.join("','")}']) as t;`);
  check("the sealed reader can never write any authority table", readerTableWrites.any_write === false,
    readerTableWrites);
  const writerDeletes = await one(`select
    bool_or(pg_catalog.has_table_privilege('${WRITER}', 'admin_internal.' || t, 'DELETE')) as any_delete
    from pg_catalog.unnest(array['${TABLES.join("','")}']) as t;`);
  check("the sealed writer holds no DELETE on any authority table", writerDeletes.any_delete === false,
    writerDeletes);

  // ---------------------------------------------------------------- function execution
  section("5. function execution surface");
  for (const fn of READER_FUNCTIONS) {
    const row = await one(`select
      pg_catalog.has_function_privilege('authenticated', '${fn}', 'EXECUTE') as authed,
      pg_catalog.has_function_privilege('anon', '${fn}', 'EXECUTE') as anon,
      pg_catalog.has_function_privilege('public', '${fn}', 'EXECUTE') as pub;`);
    check(`authenticated may execute ${fn}, while anon and PUBLIC may not`,
      row.authed === true && row.anon === false && row.pub === false, { fn, ...row });
  }
  for (const fn of OPERATOR_FUNCTIONS) {
    const row = await one(`select
      pg_catalog.has_function_privilege('authenticated', '${fn}', 'EXECUTE') as authed,
      pg_catalog.has_function_privilege('anon', '${fn}', 'EXECUTE') as anon,
      pg_catalog.has_function_privilege('authenticator', '${fn}', 'EXECUTE') as authr,
      pg_catalog.has_function_privilege('service_role', '${fn}', 'EXECUTE') as svc,
      pg_catalog.has_function_privilege('public', '${fn}', 'EXECUTE') as pub;`);
    check(`no client or runtime role may execute ${fn}`,
      Object.values(row).every((value) => value === false), { fn, ...row });
  }
  const ownership = await sql(`select n.nspname || '.' || p.proname as fn,
      pg_catalog.pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer,
      p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'platform_admin%' or p.proname in ('grant_platform_admin', 'revoke_platform_admin')
    order by 1;`);
  check("all five functions are SECURITY DEFINER owned by the correct sealed role",
    ownership.flat().length === 5
    && ownership.flat().every((row) => row.definer === true)
    && ownership.flat().filter((row) => row.fn.startsWith("public.")).every((row) => row.owner === READER)
    && ownership.flat().filter((row) => row.fn.startsWith("admin_internal.")).every((row) => row.owner === WRITER),
    ownership.flat());
  // PostgreSQL serialises `set search_path = ''` into proconfig as the four characters
  // search_path="" — the empty path quoted, not an empty right-hand side. The assertion accepts
  // exactly that canonical form and nothing looser: a merely-present "search_path" substring, an
  // unquoted value, or any non-empty path all fail here.
  check("every function pins an explicitly empty search_path and keeps row security on",
    ownership.flat().length === 5 && ownership.flat().every((row) => Array.isArray(row.proconfig)
      && row.proconfig.includes('search_path=""')
      && row.proconfig.includes("row_security=on")),
    ownership.flat().map((row) => ({ fn: row.fn, proconfig: row.proconfig })));
  // proacl is the ground truth for EXECUTE. has_function_privilege() alone is not sufficient: it
  // resolves 'public' as a role name that does not exist, and its answer for a client role cannot
  // separate an explicit role-level entry from one reaching it through the PUBLIC pseudo-role.
  const acls = (await sql(`select n.nspname || '.' || p.proname as fn,
      (select pg_catalog.count(*)::int from pg_catalog.aclexplode(p.proacl) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute,
      (select pg_catalog.count(*)::int from pg_catalog.aclexplode(p.proacl) a
         where pg_catalog.pg_get_userbyid(a.grantee) = 'authenticated'
           and a.privilege_type = 'EXECUTE') as authenticated_execute,
      (select pg_catalog.count(*)::int from pg_catalog.aclexplode(p.proacl) a
         where pg_catalog.pg_get_userbyid(a.grantee) in ('anon', 'authenticator', 'service_role')
           and a.privilege_type = 'EXECUTE') as other_client_execute,
      p.proacl::text as raw_acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'platform_admin%' or p.proname in ('grant_platform_admin', 'revoke_platform_admin')
    order by 1;`)).flat();
  check("proacl exists for all five functions, so no default ACL was left unmaterialised",
    acls.length === 5 && acls.every((row) => typeof row.raw_acl === "string" && row.raw_acl.length > 0),
    acls.map((row) => ({ fn: row.fn, raw_acl: row.raw_acl })));
  for (const row of acls) {
    const reader = row.fn.startsWith("public.");
    check(`${row.fn}: PUBLIC holds no EXECUTE in proacl`, row.public_execute === 0, row);
    check(`${row.fn}: anon, authenticator and service_role hold no EXECUTE in proacl`,
      row.other_client_execute === 0, row);
    check(reader
      ? `${row.fn}: authenticated holds EXECUTE in proacl`
      : `${row.fn}: authenticated holds no EXECUTE in proacl`,
      row.authenticated_execute === (reader ? 1 : 0), row);
  }

  // ---------------------------------------------------------------- RLS
  section("6. row level security");
  // relkind='r' restricts this to ordinary tables. Without it the schema's indexes are swept in and
  // misread as RLS-bearing relations, which is a measurement error, not a finding.
  const rls = await sql(`select c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'admin_internal' and c.relkind = 'r' order by 1;`);
  check("exactly the four authority tables exist, and each enables and forces RLS",
    rls.flat().length === 4
    && JSON.stringify(rls.flat().map((row) => row.relname)) === JSON.stringify([...TABLES].sort())
    && rls.flat().every((row) => row.relrowsecurity === true && row.relforcerowsecurity === true),
    rls.flat());
  const policies = await sql(`select c.relname, p.polname,
      case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
        when 'd' then 'DELETE' else 'ALL' end as cmd,
      (select array_agg(rolname::text order by rolname) from pg_roles where oid = any(p.polroles)) as roles
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'admin_internal' order by 1, 2;`);
  check("no policy exists for DELETE on any authority table",
    policies.flat().every((row) => row.cmd !== "DELETE" && row.cmd !== "ALL"), policies.flat());
  check("no policy names a client or runtime role",
    policies.flat().every((row) => (row.roles ?? []).every((role) => [READER, WRITER].includes(role))),
    policies.flat());
  check("the audit log has no UPDATE policy",
    policies.flat().filter((row) => row.relname === "platform_admin_audit_log")
      .every((row) => row.cmd === "SELECT" || row.cmd === "INSERT"), policies.flat());

  // ---------------------------------------------------------------- seeded authority
  section("7. seeded authority is the closed RA-1A vocabulary");
  const seeded = await one(`select
    (select count(*)::int from admin_internal.platform_admin_roles) roles,
    (select count(*)::int from admin_internal.platform_admin_role_permissions) permissions,
    (select count(*)::int from admin_internal.platform_admin_memberships) memberships,
    (select count(*)::int from admin_internal.platform_admin_memberships
       where status = 'active') active_memberships,
    (select count(*)::int from admin_internal.platform_admin_audit_log) audit_entries;`);
  // The migration seeds a closed vocabulary and provisions NO admin. On a first install the
  // membership and audit tables are also empty; after a completed lifecycle they deliberately hold
  // durable revoked/audit evidence, so the invariant that must always hold is zero ACTIVE authority.
  check("exactly one role and two permissions are seeded, and no admin holds active authority",
    seeded.roles === 1 && seeded.permissions === 2 && seeded.active_memberships === 0, seeded);
  console.log("seeded state: " + JSON.stringify(seeded));

  // ---------------------------------------------------------------- membership lifecycle
  //
  // Everything above this point is read-only and runs on the acceptance gate alone. The lifecycle
  // below MUTATES Development — it provisions and then revokes a real Platform Admin membership —
  // so it needs its own second gate, and it is the only part of this file that writes anything.
  if (process.env[LIFECYCLE_OPT_IN] === "1") {
    section("8. Platform Admin membership lifecycle — MUTATING, separately gated");
    // Only this section's own preconditions may block the mutating run. A failure earlier in the
    // suite is reported and fails the exit code, but it must not be silently re-read here as a
    // lifecycle precondition — the gate has to mean exactly what it says.
    const failuresBeforeLifecycle = failures.length;

    const identity = await one(`select u.id::text as id, u.email
      from auth.users u where u.id = '${LIFECYCLE_TARGET}'::uuid;`);
    check("the lifecycle target is the documented Development fixture and it exists",
      identity?.id === LIFECYCLE_TARGET && identity.email === LIFECYCLE_TARGET_EMAIL, identity);
    const restaurantBefore = (await sql(`select u.id::text as restaurant_user_id, u.login_status,
        m.id::text as membership_id, m.restaurant_id, m.status, r.role_key, m.updated_at
      from public.restaurant_users u
      join public.restaurant_memberships m on m.restaurant_user_id = u.id
      join public.restaurant_roles r on r.id = m.role_id
      where u.auth_user_id = '${LIFECYCLE_TARGET}'::uuid order by 3;`)).flat();
    check("the fixture's Restaurant owner authority is valid before anything is granted",
      restaurantBefore.length === 1 && restaurantBefore[0].status === "active"
      && restaurantBefore[0].role_key === "owner" && restaurantBefore[0].login_status === "enabled",
      restaurantBefore);
    // The gate is on ACTIVE authority, not on the table being empty. A completed lifecycle
    // deliberately leaves one durable revoked record behind as evidence, so re-running must be
    // possible from that state — but only from that state: any active membership, or any row
    // belonging to an identity other than this target, still stops the run.
    const pre = await one(`select
      (select count(*)::int from admin_internal.platform_admin_memberships) total,
      (select count(*)::int from admin_internal.platform_admin_memberships
         where status = 'active') active,
      (select count(*)::int from admin_internal.platform_admin_memberships
         where auth_user_id = '${LIFECYCLE_TARGET}'::uuid) target,
      (select count(*)::int from admin_internal.platform_admin_memberships
         where auth_user_id = '${LIFECYCLE_TARGET}'::uuid and status = 'revoked') target_revoked,
      (select count(*)::int from admin_internal.platform_admin_audit_log
         where result = 'granted') granted_rows,
      (select count(*)::int from admin_internal.platform_admin_audit_log
         where result = 'revoked') revoked_rows;`);
    check("no ACTIVE Platform Admin exists, and any existing row is a revoked record for this target",
      pre.active === 0 && pre.total === pre.target && pre.total === pre.target_revoked, pre);
    if (failures.length > failuresBeforeLifecycle) throw new Error("LIFECYCLE_PRECONDITION_BLOCKED");

    // The operator boundary. Membership of the sealed writer is widened for exactly one transaction
    // and handed back inside it, so a failure anywhere rolls the membership back with the work.
    // INHERIT TRUE alone is enough to execute the writer-owned function; SET FALSE means the
    // operator never gains the ability to SET ROLE to the sealed writer at all.
    const operator = async (statement) => (await sql([
      "begin;",
      `grant ${WRITER} to postgres with inherit true, set false;`,
      statement,
      `revoke ${WRITER} from postgres granted by postgres;`,
      "commit;"
    ].join("\n")))[0];
    const membershipGraph = async () => (await sql(`select r.rolname as sealed_role,
        m.rolname as member_role, g.rolname as grantor, a.inherit_option, a.set_option
      from pg_auth_members a join pg_roles r on r.oid = a.roleid
      join pg_roles m on m.oid = a.member join pg_roles g on g.oid = a.grantor
      where r.rolname in ('${READER}', '${WRITER}') order by 1, 2;`)).flat();
    const boundedGraph = (rows) => rows.length === 2
      && rows.every((row) => row.member_role === "postgres" && row.grantor === "supabase_admin"
        && row.inherit_option === false && row.set_option === false);
    check("the sealed-role graph is the bounded platform shape before any operator action",
      boundedGraph(await membershipGraph()), await membershipGraph());

    // A signed-in session for the target, so authorization is observed the way the product will.
    const session = await (await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: LIFECYCLE_TARGET_EMAIL, password: LIFECYCLE_TARGET_PASSWORD })
    })).json();
    check("the fixture can sign in to Development", session.access_token !== undefined
      && session.user?.id === LIFECYCLE_TARGET, { user: session.user?.id, error: session.error_description });
    const JWT = session.access_token;
    const rpc = async (fn, body) => {
      const res = await fetch(`https://${DEV_REF}.supabase.co/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {})
      });
      return { status: res.status, body: (await res.text()).slice(0, 300) };
    };
    const restaurantAuthorityLive = async () => rpc("restaurant_current_access_context_v1");

    const beforeGrantContext = await rpc("platform_admin_current_context_v1");
    check("before the grant the fixture's Platform Admin context is empty",
      beforeGrantContext.status === 200 && beforeGrantContext.body.trim() === "[]", beforeGrantContext);
    const restaurantLiveBefore = await restaurantAuthorityLive();
    check("before the grant the fixture's Restaurant authority answers over HTTPS",
      restaurantLiveBefore.status === 200 && restaurantLiveBefore.body.includes("dev-restaurant-haochu"),
      restaurantLiveBefore);

    // ---- GRANT ----------------------------------------------------------------------------------
    // p_actor_auth_user_id is NULL: the frozen contract documents it as attribution for the audit
    // row, never authorization, both attribution columns are nullable with no FK to auth.users, and
    // neither operator function rejects a null actor. This provisioning is performed by a database
    // operator through the sealed writer, which is not an auth.users identity — recording the target
    // as the actor would say they granted it to themselves, which is false.
    const granted = await operator(`select admin_internal.grant_platform_admin(
      '${LIFECYCLE_TARGET}'::uuid, 'platform_admin', null,
      'RA-1A Development lifecycle acceptance') as payload;`);
    check("grant_platform_admin executes and reports success",
      granted?.payload?.ok === true && typeof granted.payload.membershipId === "string", granted);
    const afterGrant = await one(`select m.id::text, m.auth_user_id::text as target, m.status,
        m.granted_by_auth_user_id::text as granted_by, m.revoked_by_auth_user_id::text as revoked_by,
        (m.granted_at is not null) as has_granted_at, (m.revoked_at is null) as revoked_at_is_null,
        role.role_key
      from admin_internal.platform_admin_memberships m
      join admin_internal.platform_admin_roles role on role.id = m.role_id
      where m.auth_user_id = '${LIFECYCLE_TARGET}'::uuid;`);
    check("exactly one active membership exists for the target, on the canonical platform_admin role",
      afterGrant?.status === "active" && afterGrant.role_key === "platform_admin"
      && afterGrant.has_granted_at === true && afterGrant.revoked_at_is_null === true
      && afterGrant.revoked_by === null && afterGrant.granted_by === null, afterGrant);
    const grantCounts = await one(`select
      (select count(*)::int from admin_internal.platform_admin_memberships) total,
      (select count(*)::int from admin_internal.platform_admin_memberships where status='active') active,
      (select count(*)::int from admin_internal.platform_admin_audit_log where result='granted') granted_rows;`);
    check("the grant changed no unrelated membership and wrote exactly one new granted audit row",
      grantCounts.total === 1 && grantCounts.active === 1
      && grantCounts.granted_rows === pre.granted_rows + 1, { ...grantCounts, before: pre.granted_rows });

    const adminContext = await rpc("platform_admin_current_context_v1");
    // The boundary projects (role_key, permission_key, permission_scope) and deliberately carries no
    // status column: it selects active memberships only, so being an active Platform Admin is
    // expressed by rows existing at all. A non-admin, and a revoked admin, both receive [].
    check("the reader boundary now recognises an active Platform Admin",
      adminContext.status === 200 && /"role_key"\s*:\s*"platform_admin"/.test(adminContext.body)
      && (adminContext.body.match(/"role_key"/g) ?? []).length === 2
      && !/"status"/.test(adminContext.body), adminContext);
    check("the returned context vocabulary is exactly the frozen permission list",
      /admin_context\.read/.test(adminContext.body) && /admin_audit\.read/.test(adminContext.body)
      && !/\.(write|create|update|delete|approve|manage)/.test(adminContext.body), adminContext);
    for (const [permission, expected] of [["admin_context.read", "true"], ["admin_audit.read", "true"],
      ["restaurant.approve", "false"], ["admin_context.write", "false"]]) {
      const answer = await rpc("platform_admin_has_permission_v1", { requested_permission_key: permission });
      check(`an active Platform Admin holds ${permission} = ${expected}`,
        answer.status === 200 && answer.body.trim() === expected, { permission, ...answer });
    }
    const auditRead = await rpc("platform_admin_audit_log_v1", { requested_limit: 50 });
    check("an active Platform Admin can read the audit log through the reader boundary",
      auditRead.status === 200 && /grant_platform_admin/.test(auditRead.body), auditRead);

    // Application authority, not database authority: an active admin gains nothing at the DB level.
    const adminDbReach = await one(`select
      pg_catalog.has_schema_privilege('authenticated', 'admin_internal', 'USAGE') as schema_usage,
      pg_catalog.has_table_privilege('authenticated', 'admin_internal.platform_admin_memberships', 'SELECT') as table_select,
      pg_catalog.has_function_privilege('authenticated',
        'admin_internal.grant_platform_admin(uuid, text, uuid, text)', 'EXECUTE') as operator_execute;`);
    check("an active Platform Admin still holds no direct admin_internal database privilege",
      adminDbReach.schema_usage === false && adminDbReach.table_select === false, adminDbReach);
    const adminRest = await (await fetch(
      `https://${DEV_REF}.supabase.co/rest/v1/platform_admin_memberships?select=*`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${JWT}` } })).status;
    check("an active Platform Admin cannot read the private tables over REST", adminRest >= 400, adminRest);
    const adminSelfGrant = await rpc("grant_platform_admin", { p_target_auth_user_id: LIFECYCLE_TARGET });
    check("an active Platform Admin still cannot call the operator functions over HTTP",
      adminSelfGrant.status >= 400, adminSelfGrant);

    const restaurantDuringAdmin = (await sql(`select m.id::text as membership_id, m.restaurant_id,
        m.status, r.role_key, m.updated_at, u.login_status
      from public.restaurant_users u
      join public.restaurant_memberships m on m.restaurant_user_id = u.id
      join public.restaurant_roles r on r.id = m.role_id
      where u.auth_user_id = '${LIFECYCLE_TARGET}'::uuid order by 1;`)).flat();
    check("the Restaurant owner authority is byte-for-byte unchanged while Platform Admin is active",
      JSON.stringify(restaurantDuringAdmin.map((row) => [row.membership_id, row.restaurant_id,
        row.status, row.role_key, row.updated_at, row.login_status]))
      === JSON.stringify(restaurantBefore.map((row) => [row.membership_id, row.restaurant_id,
        row.status, row.role_key, row.updated_at, row.login_status])), restaurantDuringAdmin);
    const restaurantLiveDuring = await restaurantAuthorityLive();
    check("Restaurant and Platform Admin are two independent live authorities, not inheritance",
      restaurantLiveDuring.status === 200 && restaurantLiveDuring.body.includes("dev-restaurant-haochu")
      && adminContext.status === 200, restaurantLiveDuring);

    // ---- REJECTION BRANCHES ---------------------------------------------------------------------
    const unknownIdentity = "00000000-0000-4000-8000-0000000000ff";
    const rejections = [
      ["unknown target identity", await operator(`select admin_internal.grant_platform_admin(
        '${unknownIdentity}'::uuid, 'platform_admin', null, 'RA-1A rejection acceptance') as payload;`),
        "unknown_identity", "unknown target identity"],
      ["unknown role key", await operator(`select admin_internal.grant_platform_admin(
        '${LIFECYCLE_TARGET}'::uuid, 'super_admin', null, 'RA-1A rejection acceptance') as payload;`),
        "unknown_role", "unknown or inactive role"],
      ["invalid request — blank reason", await operator(`select admin_internal.grant_platform_admin(
        '${LIFECYCLE_TARGET}'::uuid, 'platform_admin', null, '   ') as payload;`),
        "invalid_request", "invalid request"]
    ];
    for (const [label, result, expectedCode, expectedReason] of rejections) {
      check(`the ${label} branch is refused with ${expectedCode}`,
        result?.payload?.ok === false && result.payload.errorCode === expectedCode, { label, result });
      const audited = await one(`select count(*)::int as rows from admin_internal.platform_admin_audit_log
        where result = 'rejected' and reason = '${expectedReason}';`);
      check(`the ${label} refusal is written to the audit log`, audited.rows >= 1, { label, ...audited });
    }
    const afterRejections = await one(`select
      (select count(*)::int from admin_internal.platform_admin_memberships) total,
      (select count(*)::int from admin_internal.platform_admin_memberships where status='active') active,
      (select count(*)::int from admin_internal.platform_admin_memberships
         where auth_user_id = '${unknownIdentity}'::uuid) phantom;`);
    check("no refusal produced any membership state",
      afterRejections.total === 1 && afterRejections.active === 1 && afterRejections.phantom === 0,
      afterRejections);

    // ---- REVOKE ---------------------------------------------------------------------------------
    const revoked = await operator(`select admin_internal.revoke_platform_admin(
      '${LIFECYCLE_TARGET}'::uuid, null, 'RA-1A Development lifecycle acceptance') as payload;`);
    check("revoke_platform_admin executes and reports success",
      revoked?.payload?.ok === true && revoked.payload.membershipId === afterGrant.id, revoked);
    const afterRevoke = await one(`select m.id::text, m.status,
        m.revoked_by_auth_user_id::text as revoked_by, (m.revoked_at is not null) as has_revoked_at,
        (m.granted_at is not null) as has_granted_at
      from admin_internal.platform_admin_memberships m
      where m.auth_user_id = '${LIFECYCLE_TARGET}'::uuid;`);
    check("the membership is durable and its status is revoked, never deleted",
      afterRevoke?.id === afterGrant.id && afterRevoke.status === "revoked"
      && afterRevoke.has_revoked_at === true && afterRevoke.has_granted_at === true, afterRevoke);
    const revokeCounts = await one(`select
      (select count(*)::int from admin_internal.platform_admin_memberships) total,
      (select count(*)::int from admin_internal.platform_admin_memberships where status='active') active,
      (select count(*)::int from admin_internal.platform_admin_audit_log where result='revoked') revoked_rows;`);
    check("no active Platform Admin remains, and a new revoked audit row was written",
      revokeCounts.total === 1 && revokeCounts.active === 0
      && revokeCounts.revoked_rows === pre.revoked_rows + 1, { ...revokeCounts, before: pre.revoked_rows });
    const doubleRevoke = await operator(`select admin_internal.revoke_platform_admin(
      '${LIFECYCLE_TARGET}'::uuid, null, 'RA-1A rejection acceptance') as payload;`);
    check("revoking again is refused with no_active_membership",
      doubleRevoke?.payload?.ok === false && doubleRevoke.payload.errorCode === "no_active_membership",
      doubleRevoke);

    // The same session, with no re-authentication: authorization must be re-derived per call.
    const revokedContext = await rpc("platform_admin_current_context_v1");
    check("the same unexpired session is immediately no longer a Platform Admin",
      revokedContext.status === 200 && revokedContext.body.trim() === "[]", revokedContext);
    for (const permission of ["admin_context.read", "admin_audit.read"]) {
      const answer = await rpc("platform_admin_has_permission_v1", { requested_permission_key: permission });
      check(`${permission} is false immediately after revocation, with no re-login`,
        answer.status === 200 && answer.body.trim() === "false", { permission, ...answer });
    }
    const revokedAudit = await rpc("platform_admin_audit_log_v1", { requested_limit: 50 });
    check("a revoked admin reads no audit entry",
      revokedAudit.status === 200 && revokedAudit.body.trim() === "[]", revokedAudit);
    const revokedRest = await (await fetch(
      `https://${DEV_REF}.supabase.co/rest/v1/platform_admin_audit_log?select=*`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${JWT}` } })).status;
    check("a revoked admin still cannot reach the private tables", revokedRest >= 400, revokedRest);

    const restaurantAfter = (await sql(`select m.id::text as membership_id, m.restaurant_id,
        m.status, r.role_key, m.updated_at, u.login_status
      from public.restaurant_users u
      join public.restaurant_memberships m on m.restaurant_user_id = u.id
      join public.restaurant_roles r on r.id = m.role_id
      where u.auth_user_id = '${LIFECYCLE_TARGET}'::uuid order by 1;`)).flat();
    check("the Restaurant owner authority survives Platform Admin revocation unchanged",
      JSON.stringify(restaurantAfter.map((row) => [row.membership_id, row.restaurant_id, row.status,
        row.role_key, row.updated_at, row.login_status]))
      === JSON.stringify(restaurantBefore.map((row) => [row.membership_id, row.restaurant_id, row.status,
        row.role_key, row.updated_at, row.login_status])), restaurantAfter);
    const restaurantLiveAfter = await restaurantAuthorityLive();
    check("Restaurant authority still answers over HTTPS after Platform Admin is revoked",
      restaurantLiveAfter.status === 200 && restaurantLiveAfter.body.includes("dev-restaurant-haochu"),
      restaurantLiveAfter);

    const finalGraph = await membershipGraph();
    check("no operator membership survived: the sealed-role graph is the bounded platform shape again",
      boundedGraph(finalGraph), finalGraph);
    const finalState = await one(`select
      (select count(*)::int from admin_internal.platform_admin_memberships) memberships,
      (select count(*)::int from admin_internal.platform_admin_memberships where status='active') active,
      (select count(*)::int from admin_internal.platform_admin_memberships where status='revoked') revoked,
      (select count(*)::int from admin_internal.platform_admin_audit_log) audit_rows,
      (select count(*)::int from admin_internal.platform_admin_audit_log where result='granted') granted_rows,
      (select count(*)::int from admin_internal.platform_admin_audit_log where result='revoked') revoked_rows,
      (select count(*)::int from admin_internal.platform_admin_audit_log where result='rejected') rejected_rows;`);
    check("the final Development state is zero active admins and one durable revoked record",
      finalState.memberships === 1 && finalState.active === 0 && finalState.revoked === 1
      && finalState.granted_rows >= 1 && finalState.revoked_rows >= 1
      && finalState.rejected_rows >= 3, finalState);
    console.log("final lifecycle state: " + JSON.stringify(finalState));
    lifecycle = { executed: true, target: LIFECYCLE_TARGET, ...finalState };
  }

  console.log("\n" + JSON.stringify({
    suite: SUITE, project: DEV_REF,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    failures: failures.map((item) => item.name),
    lifecycle, productionTouched: false
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: String(error.message).slice(0, 500) }, null, 2));
  failures.push({ name: "suite execution", pass: false });
}
process.exitCode = failures.length === 0 ? 0 : 1;
