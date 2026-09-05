#!/usr/bin/env node
// RA-2B-P1 Development acceptance.
//
// Proves the governed availability authority against the real Development database and the real
// PostgREST boundary, using the EXISTING hidden-restaurant Owner. It creates no auth user, no
// restaurant user and no membership; it never repairs the target with a direct write, never calls
// RA-2A's frozen sold-out mutation, and never removes audit evidence. Recovery runs back through
// the same canonical function.
//
// Development only. The project ref is hard-pinned and Production is never referenced. Opt in with
// TASTKIND_RESTAURANT_AVAILABILITY_RA2BP1_DEVELOPMENT_ACCEPTANCE=1 and supply the Owner's password
// in TASTKIND_RA2AP1_OWNER_PASSWORD; it is never stored in this repository.
import {
  B1_AUDIT, B1_EXPECTED_AUDIT_ROWS, B1_EXPECTED_FINAL_VERSION, B1_EXPECTED_START_AVAILABILITY,
  B1_FROZEN_SOLD_OUT_VERSION, B1_MUTATION_ERRORS, B1_OWNER_AUTH_ID, B1_PERMISSION_KEY,
  B1_PREVIEW_FIELDS, B1_PROJECT_NAME, B1_PROJECT_REF, B1_ROLE, B1_TARGET, B1_TARGET_BRANCH,
  B1_TARGET_MENU_ITEM, B1_TARGET_RESTAURANT
} from "./restaurant-owner-availability-ra-2b-p1-contract.mjs";

const OPT_IN = "TASTKIND_RESTAURANT_AVAILABILITY_RA2BP1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "restaurant-owner-availability-ra-2b-p1-development-acceptance";
const REF = B1_PROJECT_REF;
const SOLD_OUT_AUDIT = "restaurant_internal.branch_menu_item_sold_out_audit_log";

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
const OWNER_EMAIL = process.env.TASTKIND_RA2AP1_OWNER_EMAIL;
if (!OWNER_EMAIL) throw new Error("TASTKIND_RA2AP1_OWNER_EMAIL absent");
const PUBLISHABLE = process.env.TASTKIND_SUPABASE_PUBLISHABLE_KEY;
if (!PUBLISHABLE) throw new Error("TASTKIND_SUPABASE_PUBLISHABLE_KEY absent");

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
const snapshot = async () => one(`select b.availability, b.availability_version::text as availability_version,
    b.sold_out, b.sold_out_version::text as sold_out_version, b.price, b.branch_specific_status,
    (select count(*)::int from ${B1_AUDIT}) as availability_audit,
    (select count(*)::int from ${SOLD_OUT_AUDIT}) as sold_out_audit
  from public.branch_menu_items b where b.id = '${B1_TARGET}';`);
const rpc = async (fn, jwt, body) => {
  const headers = { apikey: PUBLISHABLE, "Content-Type": "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${host}/rest/v1/rpc/${fn}`, {
    method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* bounded text */ }
  return { status: res.status, json, text: text.slice(0, 300) };
};
const preview = (jwt, restaurant, branch, item) =>
  rpc("restaurant_owner_preview_branch_menu_item_availability_v1", jwt,
    { p_restaurant_id: restaurant, p_branch_id: branch, p_branch_menu_item_id: item });
const setAvailability = (jwt, expected, next, version) =>
  rpc("restaurant_owner_set_branch_menu_item_availability_v1", jwt,
    { p_branch_menu_item_id: B1_TARGET, p_expected_availability: expected,
      p_next_availability: next, p_expected_version: version });

let applied = 0;
try {
  section("0. environment identity and read-only preconditions");
  const meta = await (await fetch(`https://api.supabase.com/v1/projects/${REF}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  check("the target project is exactly the Development project",
    meta.name === B1_PROJECT_NAME && meta.id === REF, { name: meta.name, id: meta.id });

  const before = await snapshot();
  check("the target starts at the expected availability and a fresh version",
    before.availability === B1_EXPECTED_START_AVAILABILITY && before.availability_version === "0"
    && before.availability_audit === 0, before);
  check("RA-2A's frozen sold-out state is exactly as that round left it",
    before.sold_out === false && before.sold_out_version === B1_FROZEN_SOLD_OUT_VERSION, before);
  const hidden = await one(`select status from public.restaurants where id = '${B1_TARGET_RESTAURANT}';`);
  check("the parent restaurant is still non-public", hidden.status === "draft", hidden);
  const soldOutAuditBefore = before.sold_out_audit;

  const policies = (await sql(`select polname, polpermissive from pg_policy
    where polrelid = 'public.branch_menu_items'::regclass
      and polname like '%owner_availability%' order by polname;`)).flat();
  check("the live tenant policies are RESTRICTIVE and the visibility pair is permissive",
    policies.length === 4
    && policies.filter((p) => /tenant/.test(p.polname)).every((p) => p.polpermissive === false)
    && policies.filter((p) => !/tenant/.test(p.polname)).every((p) => p.polpermissive === true), policies);
  const authority = await one(`select
    pg_catalog.has_column_privilege('${B1_ROLE}','public.branch_menu_items','availability','UPDATE') av,
    pg_catalog.has_column_privilege('${B1_ROLE}','public.branch_menu_items','sold_out','UPDATE') so,
    pg_catalog.has_column_privilege('${B1_ROLE}','public.branch_menu_items','availability_version','UPDATE') ver,
    pg_catalog.has_column_privilege('restaurant_owner_branch_menu_item_write_authority','public.branch_menu_items','availability','UPDATE') frozen,
    pg_catalog.has_table_privilege('authenticated','public.branch_menu_items','UPDATE') client,
    pg_catalog.has_table_privilege('authenticated','${B1_AUDIT}','SELECT') client_audit;`);
  check("the two writers are independent and no client role gained table authority",
    authority.av === true && authority.so === false && authority.ver === false
    && authority.frozen === false && authority.client === false && authority.client_audit === false,
    authority);

  section("1. live authorization");
  const anonymous = await preview(null, B1_TARGET_RESTAURANT, B1_TARGET_BRANCH, B1_TARGET);
  check("an anonymous caller is refused by the database, not by a server layer",
    anonymous.status >= 400 || anonymous.json?.errorCode === "unauthenticated",
    { status: anonymous.status, body: anonymous.text });

  const session = await (await fetch(`${host}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
  })).json();
  check("the existing hidden-restaurant Owner fixture signs in",
    session.user?.id === B1_OWNER_AUTH_ID,
    { user: session.user?.id, error: session.error_description });
  const JWT = session.access_token;

  const context = await (await fetch(`${host}/rest/v1/rpc/restaurant_current_access_context_v1`, {
    method: "POST", headers: { apikey: PUBLISHABLE, Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json" }, body: "{}" })).text();
  check("the Owner's canonical Restaurant authority now carries the availability permission",
    context.includes(B1_TARGET_RESTAURANT) && context.includes(B1_PERMISSION_KEY), context.slice(0, 200));

  const ready = await preview(JWT, B1_TARGET_RESTAURANT, B1_TARGET_BRANCH, B1_TARGET);
  check("the authorised Owner previews the exact state and version",
    ready.json?.ok === true && ready.json.state === "ready"
    && ready.json.availability === B1_EXPECTED_START_AVAILABILITY
    && ready.json.availabilityVersion === "0"
    && ready.json.branchId === B1_TARGET_BRANCH
    && ready.json.menuItemId === B1_TARGET_MENU_ITEM, ready.json);
  check("the response carries exactly the approved DTO fields",
    JSON.stringify(Object.keys(ready.json).sort()) === JSON.stringify([...B1_PREVIEW_FIELDS].sort()),
    Object.keys(ready.json));
  check("the version arrives as a decimal string", typeof ready.json.availabilityVersion === "string");
  const ghost = await preview(JWT, B1_TARGET_RESTAURANT, B1_TARGET_BRANCH, "ra2b-nonexistent-offering");
  const foreign = await preview(JWT, "dev-restaurant-haochu", B1_TARGET_BRANCH, B1_TARGET);
  check("cross-tenant and nonexistent previews are byte-identical target_not_found",
    ghost.json?.errorCode === "target_not_found"
    && JSON.stringify(ghost.json) === JSON.stringify(foreign.json), { ghost, foreign });

  section("2. the governed transition");
  const first = await setAvailability(JWT, "available", "limited", "0");
  applied += first.json?.ok === true ? 1 : 0;
  const afterFirst = await snapshot();
  check("the Owner applies available -> limited through the canonical RPC",
    first.json?.ok === true && first.json.availability === "limited"
    && first.json.availabilityVersion === "1", first.json);
  check("availability and its version advanced exactly once",
    afterFirst.availability === "limited" && afterFirst.availability_version === "1", afterFirst);
  check("INDEPENDENCE: RA-2A's sold-out state and version are byte-identical",
    afterFirst.sold_out === false && afterFirst.sold_out_version === B1_FROZEN_SOLD_OUT_VERSION,
    afterFirst);
  check("INDEPENDENCE: no sold-out audit row was written",
    afterFirst.sold_out_audit === soldOutAuditBefore, afterFirst);
  check("unrelated columns are untouched",
    afterFirst.price === before.price
    && afterFirst.branch_specific_status === before.branch_specific_status, { before, afterFirst });
  const audit1 = (await sql(`select actor_auth_user_id::text as actor, membership_id::text as membership,
      restaurant_id, branch_id, branch_menu_item_id, previous_availability, next_availability,
      previous_availability_version::text as prev_v, next_availability_version::text as next_v
    from ${B1_AUDIT} order by created_at;`)).flat();
  check("exactly one applied transition is audited with server-derived actor and membership",
    audit1.length === 1 && audit1[0].actor === B1_OWNER_AUTH_ID && audit1[0].membership
    && audit1[0].restaurant_id === B1_TARGET_RESTAURANT && audit1[0].branch_id === B1_TARGET_BRANCH
    && audit1[0].branch_menu_item_id === B1_TARGET
    && audit1[0].previous_availability === "available" && audit1[0].next_availability === "limited"
    && audit1[0].prev_v === "0" && audit1[0].next_v === "1", audit1);

  section("3. stale, no-change and ABA");
  const stale = await setAvailability(JWT, "available", "limited", "0");
  check("replaying the original expected version is stale", stale.json?.errorCode === "stale_state", stale);
  const noChange = await setAvailability(JWT, "limited", "limited", "1");
  check("requesting the value that already holds is no_change",
    noChange.json?.errorCode === "no_change", noChange);
  const badVocab = await setAvailability(JWT, "limited", "discontinued", "1");
  check("an out-of-vocabulary value is invalid_request",
    badVocab.json?.errorCode === "invalid_request", badVocab);
  check("every refusal used only the closed error vocabulary",
    [stale, noChange, badVocab].every((r) => B1_MUTATION_ERRORS.includes(r.json?.errorCode)));
  check("no refusal wrote a further audit row", (await snapshot()).availability_audit === 1);

  section("4. canonical recovery");
  const second = await setAvailability(JWT, "limited", "available", "1");
  applied += second.json?.ok === true ? 1 : 0;
  const afterSecond = await snapshot();
  check("recovery runs back through the same canonical RPC, never a direct write",
    second.json?.ok === true && afterSecond.availability === B1_EXPECTED_START_AVAILABILITY, second.json);
  check("the version advanced again rather than being reset",
    afterSecond.availability_version === B1_EXPECTED_FINAL_VERSION, afterSecond);
  check("the recovery is audited as a second applied transition",
    afterSecond.availability_audit === B1_EXPECTED_AUDIT_ROWS, afterSecond);
  const aba = await setAvailability(JWT, "available", "limited", "0");
  check("ABA: the original available/0 precondition is stale even though availability is available again",
    aba.json?.errorCode === "stale_state" && afterSecond.availability === "available", aba);

  section("5. final state");
  const final = await snapshot();
  check("the target rests at its original availability with the version intentionally advanced",
    final.availability === B1_EXPECTED_START_AVAILABILITY
    && final.availability_version === B1_EXPECTED_FINAL_VERSION, final);
  check("exactly the two intentional applied transitions are retained",
    final.availability_audit === B1_EXPECTED_AUDIT_ROWS, final);
  check("RA-2A's sold-out state, version and audit are completely unchanged",
    final.sold_out === false && final.sold_out_version === B1_FROZEN_SOLD_OUT_VERSION
    && final.sold_out_audit === soldOutAuditBefore, final);
  const publicRows = await one(`select count(*)::int as rows
    from public.consumer_public_restaurant_catalog_v1 where branch_menu_item_id = '${B1_TARGET}';`);
  check("the hidden restaurant surfaced nothing into the consumer public catalogue",
    publicRows.rows === 0, publicRows);
  const neighbours = (await sql(`select id, availability, availability_version::text as v
    from public.branch_menu_items where id <> '${B1_TARGET}' order by id;`)).flat();
  check("no other offering changed availability state",
    neighbours.every((row) => row.v === "0"), neighbours);
  const owner = await one(`select membership.status, role.role_key, user_row.login_status
    from public.restaurant_users user_row
    join public.restaurant_memberships membership on membership.restaurant_user_id = user_row.id
    join public.restaurant_roles role on role.id = membership.role_id
    where membership.restaurant_id = '${B1_TARGET_RESTAURANT}' and role.role_key = 'owner';`);
  check("the Owner's membership, role and login state are unchanged",
    owner.status === "active" && owner.role_key === "owner" && owner.login_status === "enabled", owner);
} catch (error) {
  check("acceptance executed without an unexpected error", false, String(error.message).slice(0, 400));
} finally {
  console.log("\n" + JSON.stringify({
    suite: SUITE, project: REF, status: failures.length === 0 ? "passed" : "failed",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    failures: failures.map((item) => item.name),
    appliedTransitions: applied, soldOutMutationsPerformed: 0, productionTouched: false
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
}
