#!/usr/bin/env node
// RA-2A-P1 Development acceptance.
//
// Proves the governed sold-out authority against the real Development database and the real
// PostgREST boundary, using the EXISTING hidden-restaurant Owner. It creates no auth user, no
// restaurant user and no membership; it never repairs the target with a direct UPDATE, and it never
// removes audit evidence. Recovery runs back through the same canonical function.
//
// Development only. The project ref is hard-pinned and Production is never referenced. Opt in with
// TASTKIND_RESTAURANT_SOLD_OUT_RA2AP1_DEVELOPMENT_ACCEPTANCE=1 and supply the Owner's password in
// TASTKIND_RA2AP1_OWNER_PASSWORD; the password is never stored in this repository.
import {
  RA2AP1_ACCEPTANCE_BRANCH, RA2AP1_ACCEPTANCE_MENU_ITEM, RA2AP1_ACCEPTANCE_OWNER_AUTH_ID,
  RA2AP1_ACCEPTANCE_RESTAURANT, RA2AP1_ACCEPTANCE_TARGET, RA2AP1_AUDIT_RELATION,
  RA2AP1_PERMISSION_KEY, RA2AP1_PROJECT_NAME, RA2AP1_PROJECT_REF, RA2AP1_SEALED_ROLE
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";

const OPT_IN = "TASTKIND_RESTAURANT_SOLD_OUT_RA2AP1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "restaurant-owner-sold-out-ra-2a-p1-development-acceptance";
const REF = RA2AP1_PROJECT_REF;

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped",
    reason: `set ${OPT_IN}=1 to run this Development-only acceptance after the migration is applied`
  }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");
const OWNER_PASSWORD = process.env.TASTKIND_RA2AP1_OWNER_PASSWORD;
if (!OWNER_PASSWORD) throw new Error("TASTKIND_RA2AP1_OWNER_PASSWORD absent");
const PUBLISHABLE = process.env.TASTKIND_SUPABASE_PUBLISHABLE_KEY;
if (!PUBLISHABLE) throw new Error("TASTKIND_SUPABASE_PUBLISHABLE_KEY absent");
const OWNER_EMAIL = process.env.TASTKIND_RA2AP1_OWNER_EMAIL;
if (!OWNER_EMAIL) throw new Error("TASTKIND_RA2AP1_OWNER_EMAIL absent");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function sql(query, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    if (res.status !== 429) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
    await wait(Math.min(30000, 4000 * attempt));
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

const host = `https://${REF}.supabase.co`;
const targetRow = async () => one(`select id, restaurant_id, branch_id, menu_item_id, price,
  availability, sold_out, sold_out_version, branch_specific_name, branch_specific_description,
  branch_specific_status from public.branch_menu_items where id = '${RA2AP1_ACCEPTANCE_TARGET}';`);
const auditRows = async () => (await sql(`select actor_auth_user_id::text as actor,
  membership_id::text as membership, restaurant_id, branch_id, branch_menu_item_id,
  previous_sold_out, next_sold_out, previous_sold_out_version, next_sold_out_version, created_at
  from ${RA2AP1_AUDIT_RELATION}
  where branch_menu_item_id = '${RA2AP1_ACCEPTANCE_TARGET}' order by created_at, id;`)).flat();
const callRpc = async (jwt, body) => {
  const headers = { apikey: PUBLISHABLE, "Content-Type": "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${host}/rest/v1/rpc/restaurant_owner_set_branch_menu_item_sold_out_v1`, {
    method: "POST", headers, body: JSON.stringify(body), cache: "no-store"
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* bounded text */ }
  return { status: res.status, json, text: text.slice(0, 300) };
};
const request = (expected, next, version) => ({
  p_branch_menu_item_id: RA2AP1_ACCEPTANCE_TARGET,
  p_expected_sold_out: expected, p_next_sold_out: next, p_expected_version: version
});

let applied = 0;
try {
  section("0. environment identity and read-only preconditions");
  const meta = await (await fetch(`https://api.supabase.com/v1/projects/${REF}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  check("the target project is exactly the Development project",
    meta.name === RA2AP1_PROJECT_NAME && meta.id === REF, { name: meta.name, id: meta.id });

  const before = await targetRow();
  check("the approved target exists under its approved parent chain",
    before?.id === RA2AP1_ACCEPTANCE_TARGET && before.restaurant_id === RA2AP1_ACCEPTANCE_RESTAURANT
    && before.branch_id === RA2AP1_ACCEPTANCE_BRANCH
    && before.menu_item_id === RA2AP1_ACCEPTANCE_MENU_ITEM, before);
  check("the target's current sold_out state is a supported boolean",
    before.sold_out === false || before.sold_out === true, before);
  const parent = await one(`select restaurant.status as restaurant_status, branch.status as branch_status,
      item.status as menu_item_status
    from public.restaurants restaurant
    join public.restaurant_branches branch on branch.id = '${RA2AP1_ACCEPTANCE_BRANCH}'
    join public.menu_items item on item.id = '${RA2AP1_ACCEPTANCE_MENU_ITEM}'
    where restaurant.id = '${RA2AP1_ACCEPTANCE_RESTAURANT}';`);
  check("the parent restaurant is a non-public draft, as the approved target requires",
    parent.restaurant_status === "draft", parent);
  const publicRows = await one(`select count(*)::int as rows
    from public.consumer_public_restaurant_catalog_v1
    where branch_id = '${RA2AP1_ACCEPTANCE_BRANCH}';`);
  check("the target is absent from the consumer public catalogue before acceptance",
    publicRows.rows === 0, publicRows);
  const owner = await one(`select user_row.auth_user_id::text as auth_user_id, user_row.login_status,
      membership.id::text as membership_id, membership.status as membership_status,
      role.role_key, role.status as role_status
    from public.restaurant_users user_row
    join public.restaurant_memberships membership on membership.restaurant_user_id = user_row.id
    join public.restaurant_roles role on role.id = membership.role_id
    where membership.restaurant_id = '${RA2AP1_ACCEPTANCE_RESTAURANT}' and role.role_key = 'owner';`);
  check("exactly the approved active Owner fixture backs this restaurant",
    owner.auth_user_id === RA2AP1_ACCEPTANCE_OWNER_AUTH_ID && owner.login_status === "enabled"
    && owner.membership_status === "active" && owner.role_status === "active", owner);
  const permission = await one(`select count(*)::int as rows from public.role_permissions permission
    join public.restaurant_roles role on role.id = permission.role_id
    where permission.permission_key = '${RA2AP1_PERMISSION_KEY}'
      and role.role_key = 'owner' and permission.permission_scope = 'restaurant';`);
  check("the new permission is seeded for owner at restaurant scope", permission.rows === 1, permission);
  const sealed = await one(`select rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreatedb,
      rolcreaterole, rolreplication from pg_roles where rolname = '${RA2AP1_SEALED_ROLE}';`);
  check("the sealed writer exists and is sealed in every attribute",
    sealed && sealed.rolcanlogin === false && sealed.rolinherit === false
    && sealed.rolbypassrls === false && sealed.rolsuper === false && sealed.rolcreatedb === false
    && sealed.rolcreaterole === false && sealed.rolreplication === false, sealed);
  const controlPlane = (await sql(`select member.rolname as member, grantor.rolname as grantor,
      auth.admin_option, auth.inherit_option, auth.set_option
    from pg_auth_members auth
    join pg_roles sealed_role on sealed_role.oid = auth.roleid
    join pg_roles member on member.oid = auth.member
    join pg_roles grantor on grantor.oid = auth.grantor
    where sealed_role.rolname = '${RA2AP1_SEALED_ROLE}';`)).flat();
  check("the sealed writer carries only the accepted platform control-plane creator row",
    controlPlane.length === 1 && controlPlane[0].member === "postgres"
    && controlPlane[0].grantor === "supabase_admin" && controlPlane[0].inherit_option === false
    && controlPlane[0].set_option === false, controlPlane);
  const reach = await one(`select
    pg_catalog.pg_has_role('postgres', '${RA2AP1_SEALED_ROLE}', 'USAGE') as postgres_usage,
    pg_catalog.pg_has_role('postgres', '${RA2AP1_SEALED_ROLE}', 'SET') as postgres_set,
    pg_catalog.pg_has_role('authenticated', '${RA2AP1_SEALED_ROLE}', 'MEMBER') as authed_member,
    pg_catalog.pg_has_role('anon', '${RA2AP1_SEALED_ROLE}', 'MEMBER') as anon_member,
    pg_catalog.pg_has_role('service_role', '${RA2AP1_SEALED_ROLE}', 'MEMBER') as service_member,
    pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE') as client_update;`);
  check("no runtime role can use, set or reach the sealed writer, and no client may write the table",
    reach.postgres_usage === false && reach.postgres_set === false && reach.authed_member === false
    && reach.anon_member === false && reach.service_member === false && reach.client_update === false, reach);

  const auditBefore = await auditRows();
  check("the target carries no prior sold-out audit evidence", auditBefore.length === 0, auditBefore);

  section("1. live authorization refusals");
  const anonymous = await callRpc(null, request(before.sold_out, !before.sold_out, "0"));
  check("an anonymous caller is refused by the database, not by a server layer",
    anonymous.status >= 400 || anonymous.json?.errorCode === "unauthenticated",
    { status: anonymous.status, body: anonymous.text });

  const session = await (await fetch(`${host}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
  })).json();
  check("the approved Owner fixture signs in to Development",
    session.user?.id === RA2AP1_ACCEPTANCE_OWNER_AUTH_ID,
    { user: session.user?.id, error: session.error_description });
  const JWT = session.access_token;

  const restaurantContext = await (await fetch(`${host}/rest/v1/rpc/restaurant_current_access_context_v1`, {
    method: "POST", headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json" }, body: "{}"
  })).text();
  check("the Owner's canonical Restaurant authority answers and now carries the new permission",
    restaurantContext.includes(RA2AP1_ACCEPTANCE_RESTAURANT)
    && restaurantContext.includes(RA2AP1_PERMISSION_KEY), restaurantContext.slice(0, 200));

  const malformed = await callRpc(JWT, request(before.sold_out, !before.sold_out, "-1"));
  check("a malformed typed request is bounded as invalid_request",
    malformed.json?.errorCode === "invalid_request", malformed);
  const foreign = await callRpc(JWT, { p_branch_menu_item_id: "ra2a-nonexistent-offering",
    p_expected_sold_out: false, p_next_sold_out: true, p_expected_version: "0" });
  check("an offering outside the Owner's authorised scope is not found, revealing nothing",
    foreign.json?.errorCode === "target_not_found", foreign);
  check("no refusal wrote an audit row", (await auditRows()).length === 0);

  section("2. the governed transition");
  const startVersion = String(before.sold_out_version);
  const first = await callRpc(JWT, request(before.sold_out, !before.sold_out, startVersion));
  applied += first.json?.ok === true ? 1 : 0;
  const afterFirst = await targetRow();
  check("the Owner applies the transition through the canonical RPC",
    first.json?.ok === true && first.json.soldOut === !before.sold_out, first);
  check("the target's sold_out flipped and the version advanced exactly once",
    afterFirst.sold_out === !before.sold_out
    && Number(afterFirst.sold_out_version) === Number(before.sold_out_version) + 1, afterFirst);
  check("the version crossed the boundary as a decimal string",
    typeof first.json.soldOutVersion === "string", first.json);
  check("every unrelated column on the target is unchanged",
    afterFirst.price === before.price && afterFirst.availability === before.availability
    && afterFirst.branch_specific_status === before.branch_specific_status
    && afterFirst.branch_specific_name === before.branch_specific_name
    && afterFirst.branch_specific_description === before.branch_specific_description
    && afterFirst.restaurant_id === before.restaurant_id
    && afterFirst.branch_id === before.branch_id
    && afterFirst.menu_item_id === before.menu_item_id, { before, afterFirst });
  const audit1 = await auditRows();
  check("exactly one applied transition is audited with server-derived actor and membership",
    audit1.length === 1 && audit1[0].actor === RA2AP1_ACCEPTANCE_OWNER_AUTH_ID
    && audit1[0].membership === owner.membership_id
    && audit1[0].restaurant_id === RA2AP1_ACCEPTANCE_RESTAURANT
    && audit1[0].branch_id === RA2AP1_ACCEPTANCE_BRANCH
    && audit1[0].branch_menu_item_id === RA2AP1_ACCEPTANCE_TARGET
    && audit1[0].previous_sold_out === before.sold_out
    && audit1[0].next_sold_out === !before.sold_out, audit1);

  section("3. stale, no-change and ABA");
  const replay = await callRpc(JWT, request(before.sold_out, !before.sold_out, startVersion));
  check("replaying the original expected version is stale, not a second write",
    replay.json?.errorCode === "stale_state", replay);
  const noChange = await callRpc(JWT,
    request(!before.sold_out, !before.sold_out, String(afterFirst.sold_out_version)));
  check("requesting the state that already holds is no_change",
    noChange.json?.errorCode === "no_change", noChange);
  check("stale and no_change wrote no further audit row", (await auditRows()).length === 1);

  section("4. canonical recovery");
  const second = await callRpc(JWT,
    request(!before.sold_out, before.sold_out, String(afterFirst.sold_out_version)));
  applied += second.json?.ok === true ? 1 : 0;
  const afterSecond = await targetRow();
  check("recovery runs back through the same canonical RPC, never a direct write",
    second.json?.ok === true && afterSecond.sold_out === before.sold_out, second);
  check("the version advanced again rather than being reset",
    Number(afterSecond.sold_out_version) === Number(before.sold_out_version) + 2, afterSecond);
  const audit2 = await auditRows();
  check("the recovery is audited as a second applied transition",
    audit2.length === 2 && audit2[1].previous_sold_out === !before.sold_out
    && audit2[1].next_sold_out === before.sold_out
    && Number(audit2[1].next_sold_out_version) === Number(before.sold_out_version) + 2, audit2);
  const aba = await callRpc(JWT, request(before.sold_out, !before.sold_out, startVersion));
  check("ABA: the original precondition is stale even though sold_out returned to its first value",
    aba.json?.errorCode === "stale_state" && afterSecond.sold_out === before.sold_out, aba);

  section("5. isolation and final state");
  const publicAfter = await one(`select count(*)::int as rows
    from public.consumer_public_restaurant_catalog_v1
    where branch_id = '${RA2AP1_ACCEPTANCE_BRANCH}';`);
  check("the operation surfaced nothing into the consumer public catalogue",
    publicAfter.rows === 0, publicAfter);
  const neighbours = (await sql(`select id, sold_out, sold_out_version from public.branch_menu_items
    where id <> '${RA2AP1_ACCEPTANCE_TARGET}' order by id;`)).flat();
  check("no other offering changed state",
    neighbours.every((row) => Number(row.sold_out_version) === 0), neighbours);
  const ownerAfter = await one(`select membership.status as membership_status, role.role_key,
      user_row.login_status
    from public.restaurant_users user_row
    join public.restaurant_memberships membership on membership.restaurant_user_id = user_row.id
    join public.restaurant_roles role on role.id = membership.role_id
    where membership.restaurant_id = '${RA2AP1_ACCEPTANCE_RESTAURANT}' and role.role_key = 'owner';`);
  check("the Owner's membership, role and login state are unchanged",
    ownerAfter.membership_status === "active" && ownerAfter.role_key === "owner"
    && ownerAfter.login_status === "enabled", ownerAfter);
  const parentAfter = await one(`select restaurant.status as restaurant_status,
      branch.status as branch_status, branch.status_version as branch_status_version
    from public.restaurants restaurant
    join public.restaurant_branches branch on branch.id = '${RA2AP1_ACCEPTANCE_BRANCH}'
    where restaurant.id = '${RA2AP1_ACCEPTANCE_RESTAURANT}';`);
  check("the parent restaurant and branch publication authority are untouched",
    parentAfter.restaurant_status === parent.restaurant_status
    && parentAfter.branch_status === parent.branch_status, { parent, parentAfter });
  check("the target rests at its original business state with the version intentionally advanced",
    afterSecond.sold_out === before.sold_out
    && Number(afterSecond.sold_out_version) === Number(before.sold_out_version) + 2, afterSecond);
  check("exactly the two intentional applied transitions are retained as evidence",
    (await auditRows()).length === 2);
} catch (error) {
  check("acceptance executed without an unexpected error", false, String(error.message).slice(0, 400));
} finally {
  console.log("\n" + JSON.stringify({
    suite: SUITE, project: REF, status: failures.length === 0 ? "passed" : "failed",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    failures: failures.map((item) => item.name), appliedTransitions: applied, productionTouched: false
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
}
