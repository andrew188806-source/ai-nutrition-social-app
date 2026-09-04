#!/usr/bin/env node
// RA-2A-P1-R1 Development acceptance.
//
// Read-only by construction. This round proves the governed preview against the real Development
// database and the real PostgREST boundary, and mutates nothing: no business write, no audit row, no
// user, no membership, no permission change. The target's state and version, and the RA-2A audit
// count, must be byte-identical before and after.
//
// Development only. The project ref is hard-pinned and Production is never referenced. Opt in with
// TASTKIND_RESTAURANT_SOLD_OUT_R1_DEVELOPMENT_ACCEPTANCE=1 and supply the existing hidden-restaurant
// Owner's password in TASTKIND_RA2AP1_OWNER_PASSWORD; it is never stored in this repository.
import {
  R1_ACCEPTANCE_BRANCH, R1_ACCEPTANCE_MENU_ITEM, R1_ACCEPTANCE_OWNER_AUTH_ID,
  R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_TARGET, R1_ERROR_CODES, R1_EXPECTED_AUDIT_ROWS,
  R1_EXPECTED_SOLD_OUT, R1_EXPECTED_VERSION, R1_PROJECT_NAME, R1_PROJECT_REF, R1_RESULT_FIELDS,
  R1_SEALED_ROLE
} from "./restaurant-owner-sold-out-preview-ra-2a-p1-r1-contract.mjs";

const OPT_IN = "TASTKIND_RESTAURANT_SOLD_OUT_R1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "restaurant-owner-sold-out-preview-ra-2a-p1-r1-development-acceptance";
const REF = R1_PROJECT_REF;
const AUDIT = "restaurant_internal.branch_menu_item_sold_out_audit_log";

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
const snapshot = async () => one(`select b.sold_out, b.sold_out_version::text as version, b.price,
    b.availability, b.branch_specific_status,
    (select count(*)::int from ${AUDIT}) as audit_rows
  from public.branch_menu_items b where b.id = '${R1_ACCEPTANCE_TARGET}';`);
const callPreview = async (jwt, body) => {
  const headers = { apikey: PUBLISHABLE, "Content-Type": "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(
    `${host}/rest/v1/rpc/restaurant_owner_preview_branch_menu_item_sold_out_v1`,
    { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* bounded text */ }
  return { status: res.status, json, text: text.slice(0, 300) };
};
const selectors = (restaurant, branch, item) => ({
  p_restaurant_id: restaurant, p_branch_id: branch, p_branch_menu_item_id: item
});

try {
  section("0. environment identity and read-only preconditions");
  const meta = await (await fetch(`https://api.supabase.com/v1/projects/${REF}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  check("the target project is exactly the Development project",
    meta.name === R1_PROJECT_NAME && meta.id === REF, { name: meta.name, id: meta.id });

  const before = await snapshot();
  check("the target is at the exact state RA-2A-P1 left it in",
    before.sold_out === R1_EXPECTED_SOLD_OUT && before.version === R1_EXPECTED_VERSION
    && before.audit_rows === R1_EXPECTED_AUDIT_ROWS, before);
  const hidden = await one(`select status from public.restaurants where id = '${R1_ACCEPTANCE_RESTAURANT}';`);
  check("the parent restaurant is still non-public", hidden.status === "draft", hidden);
  const shape = await one(`select pg_catalog.pg_get_userbyid(routine.proowner) as owner,
      routine.prosecdef, routine.provolatile::text as volatility,
      pg_catalog.array_to_string(routine.proconfig, ',') as config
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace space on space.oid = routine.pronamespace
    where space.nspname = 'public'
      and routine.proname = 'restaurant_owner_preview_branch_menu_item_sold_out_v1';`);
  check("the live preview is STABLE, SECURITY DEFINER and owned by the existing sealed writer",
    shape && shape.owner === R1_SEALED_ROLE && shape.prosecdef === true && shape.volatility === "s"
    && /search_path=/.test(shape.config) && /row_security=on/.test(shape.config), shape);
  const acl = await one(`select
    pg_catalog.has_function_privilege('authenticated','public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)','EXECUTE') authed,
    pg_catalog.has_function_privilege('anon','public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)','EXECUTE') anon,
    pg_catalog.has_function_privilege('service_role','public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)','EXECUTE') service,
    pg_catalog.has_function_privilege('authenticator','public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)','EXECUTE') authr,
    pg_catalog.has_table_privilege('authenticated','public.branch_menu_items','SELECT') client_select;`);
  check("only authenticated may execute the live preview, and no client gained table access",
    acl.authed === true && acl.anon === false && acl.service === false && acl.authr === false
    && acl.client_select === false, acl);

  section("1. live preview authorization");
  const anonymous = await callPreview(null,
    selectors(R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_BRANCH, R1_ACCEPTANCE_TARGET));
  check("an unauthenticated caller is refused by the database, not by a server layer",
    anonymous.status >= 400 || anonymous.json?.errorCode === "unauthenticated",
    { status: anonymous.status, body: anonymous.text });

  const session = await (await fetch(`${host}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
  })).json();
  check("the existing hidden-restaurant Owner fixture signs in",
    session.user?.id === R1_ACCEPTANCE_OWNER_AUTH_ID,
    { user: session.user?.id, error: session.error_description });
  const JWT = session.access_token;

  const ready = await callPreview(JWT,
    selectors(R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_BRANCH, R1_ACCEPTANCE_TARGET));
  check("the authorised Owner receives the exact current state and version",
    ready.json?.ok === true && ready.json.state === "ready"
    && ready.json.soldOut === R1_EXPECTED_SOLD_OUT
    && ready.json.soldOutVersion === R1_EXPECTED_VERSION
    && ready.json.branchMenuItemId === R1_ACCEPTANCE_TARGET
    && ready.json.branchId === R1_ACCEPTANCE_BRANCH
    && ready.json.menuItemId === R1_ACCEPTANCE_MENU_ITEM, ready.json);
  check("the version arrives as a decimal string, never a JSON number",
    typeof ready.json.soldOutVersion === "string", typeof ready.json?.soldOutVersion);
  check("the response carries exactly the approved DTO fields and nothing else",
    JSON.stringify(Object.keys(ready.json).sort()) === JSON.stringify([...R1_RESULT_FIELDS].sort()),
    Object.keys(ready.json));
  check("the response leaks no actor, membership, pricing, permission or database metadata",
    !/actor|membership|price|availability|permission|auth_user|role_key|geocode|audit/i
      .test(JSON.stringify(ready.json)), ready.json);

  section("2. privacy and bounded refusals");
  const ghost = await callPreview(JWT,
    selectors(R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_BRANCH, "ra2a-r1-nonexistent-offering"));
  check("a nonexistent target is bounded as target_not_found",
    ghost.json?.errorCode === "target_not_found", ghost);
  const foreignRestaurant = await callPreview(JWT,
    selectors("dev-restaurant-haochu", R1_ACCEPTANCE_BRANCH, R1_ACCEPTANCE_TARGET));
  check("naming another restaurant grants nothing and is indistinguishable from nonexistent",
    foreignRestaurant.json?.errorCode === "target_not_found"
    && JSON.stringify(foreignRestaurant.json) === JSON.stringify(ghost.json), foreignRestaurant);
  const malformed = await callPreview(JWT, selectors(R1_ACCEPTANCE_RESTAURANT, "", R1_ACCEPTANCE_TARGET));
  check("a malformed request is bounded as invalid_request",
    malformed.json?.errorCode === "invalid_request", malformed);
  check("every refusal used only the closed error vocabulary",
    [ghost, foreignRestaurant, malformed].every((r) => R1_ERROR_CODES.includes(r.json?.errorCode)));

  section("3. the preview changes nothing");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await callPreview(JWT, selectors(R1_ACCEPTANCE_RESTAURANT, R1_ACCEPTANCE_BRANCH, R1_ACCEPTANCE_TARGET));
  }
  const after = await snapshot();
  check("repeated previewing left the business row byte-identical",
    JSON.stringify(before) === JSON.stringify(after), { before, after });
  check("no audit row was written by any preview",
    after.audit_rows === R1_EXPECTED_AUDIT_ROWS, after);
  check("the target still rests at its RA-2A-P1 state and version",
    after.sold_out === R1_EXPECTED_SOLD_OUT && after.version === R1_EXPECTED_VERSION, after);
} catch (error) {
  check("acceptance executed without an unexpected error", false, String(error.message).slice(0, 400));
} finally {
  console.log("\n" + JSON.stringify({
    suite: SUITE, project: REF, status: failures.length === 0 ? "passed" : "failed",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    failures: failures.map((item) => item.name),
    businessMutationsPerformed: 0, productionTouched: false
  }, null, 2));
  process.exitCode = failures.length === 0 ? 0 : 1;
}
