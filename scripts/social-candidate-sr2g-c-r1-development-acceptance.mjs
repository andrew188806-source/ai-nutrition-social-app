#!/usr/bin/env node
// SR-2G-C-R1 targeted Development acceptance: privilege removal plus runtime invariance.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_C_R1_DEVELOPMENT_ACCEPTANCE=1.
//
// This deliberately does NOT rerun the full SR-2G-C eligibility matrix. It proves the one membership
// row is gone, that nothing else in the privilege topology moved, and that the pool primitive still
// composes and reduces exactly as frozen — which is what a hygiene repair must establish.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GCR1_FROZEN_BODY_MD5,
  SR2GCR1_MIGRATION,
  SR2GCR1_TARGET_ROLE
} from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_C_R1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-c-r1-development-acceptance";
const POOL_SIGNATURE = "social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz)";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(condition ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only acceptance` }, null, 2));
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
  const t = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${t.slice(0, 400)}`);
  return JSON.parse(t);
}

const TOPOLOGY = `
  select r.rolname as role, g.rolname as grantor, am.admin_option, am.inherit_option, am.set_option
  from pg_auth_members am
  join pg_roles r on r.oid=am.roleid join pg_roles m on m.oid=am.member join pg_roles g on g.oid=am.grantor
  where m.rolname='postgres'
    and r.rolname in ('meal_buddy_candidate_pool_authority','meal_buddy_card_write_authority',
                      'social_authority','social_pair_read_authority',
                      'social_profile_projection_authority','social_runtime_executor')
  order by r.rolname, g.rolname`;
const stamp = (r) => `${r.role}|${r.grantor}|a=${r.admin_option}|i=${r.inherit_option}|s=${r.set_option}`;

const ROLE_ATTRS = `
  select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
  from pg_roles where rolname='${SR2GCR1_TARGET_ROLE}'`;
const FUNCTIONS = `
  select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile,
         md5(p.prosrc) as body_md5, array_to_string(p.proconfig, ',') as config
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='social_internal'
    and p.proname in ('canonical_meal_buddy_candidate_cards','authorized_candidates')
  order by p.proname`;
const PRIVILEGES = `
  select
    (select count(*) from information_schema.table_privileges
      where grantee='${SR2GCR1_TARGET_ROLE}' and table_name='meal_buddy_cards' and privilege_type='SELECT') as cards_select,
    has_function_privilege('${SR2GCR1_TARGET_ROLE}','social_internal.authorized_candidates(uuid,uuid[])','EXECUTE') as pool_can_authorize,
    has_function_privilege('social_runtime_executor','${POOL_SIGNATURE}','EXECUTE') as executor_execute,
    has_function_privilege('authenticated','${POOL_SIGNATURE}','EXECUTE') as authenticated_execute,
    has_function_privilege('anon','${POOL_SIGNATURE}','EXECUTE') as anon_execute,
    has_function_privilege('service_role','${POOL_SIGNATURE}','EXECUTE') as service_role_execute,
    has_schema_privilege('${SR2GCR1_TARGET_ROLE}','social_internal','CREATE') as internal_create,
    has_schema_privilege('${SR2GCR1_TARGET_ROLE}','public','CREATE') as public_create,
    pg_has_role('${SR2GCR1_TARGET_ROLE}','social_authority','MEMBER') as member_of_social_authority,
    (select count(*) from pg_policy where polrelid='public.meal_buddy_cards'::regclass
       and polname='meal_buddy_cards_candidate_pool_read') as pool_policy`;

// Hex-only marker; a non-hex character would make every fixture insert fail as a malformed uuid.
const M = "5c3f0d01";
const U = (suffix) => `${M}-0000-4000-8000-${suffix.padStart(12, "0")}`;
const ACTOR = U("a");
const OWNER = { valid: U("b1"), blocked: U("b2"), notParticipating: U("b3"), multi: U("b4"), restaurantOther: U("b5") };
const C = { source: U("c1"), valid: U("d1"), blocked: U("d2"), notParticipating: U("d3"),
  multiOld: U("d4"), multiNew: U("d5"), restaurantOther: U("d6") };
const R1 = "sr2gcr1-restaurant-one";
const R2 = "sr2gcr1-restaurant-two";
const INSTANT = "2026-08-20T04:00:00Z";
const DATE = "2026-08-21";

const person = (id) => `
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${id}'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','${id}@example.com','',now(),now());
insert into public.consumer_profiles (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, status)
values ('${id}'::uuid,'sr2gcr1_${id}','N ${id}','Anon ${id}','PB','active');`;
const participate = (id) => `
insert into public.social_participation (user_id, state, opted_in_at)
values ('${id}'::uuid,'opted_in', timestamptz '2026-01-01T00:00:00Z');`;
const card = (id, owner, opts = {}) => {
  const { cardType = "general", restaurantId = "null", createdAt = `timestamptz '2026-08-19T00:00:00Z'` } = opts;
  return `
insert into public.meal_buddy_cards
  (id, owner_user_id, card_type, intention_type, restaurant_id, area, dining_date, meal_period, preferred_time, created_at, expires_at, cancelled_at)
values ('${id}'::uuid,'${owner}'::uuid,'${cardType}','chat_first',${restaurantId},null, date '${DATE}', 'dinner', null, ${createdAt}, timestamptz '2026-08-22T00:00:00Z', null);`;
};
const pool = (actor, source) =>
  `select coalesce(json_agg(json_build_object('owner', candidate_owner_user_id, 'card', candidate_card_id) order by candidate_owner_user_id, candidate_card_id), '[]'::json)
   from social_internal.canonical_meal_buddy_candidate_cards('${actor}'::uuid, '${source}'::uuid, timestamptz '${INSTANT}')`;

try {
  const before = await sql(TOPOLOGY);
  const attrsBefore = await sql(ROLE_ATTRS);
  const fnBefore = await sql(FUNCTIONS);
  const privBefore = await sql(PRIVILEGES);

  // --- apply the repair ------------------------------------------------------------------------
  const debtPresent = before.some((r) => r.role === SR2GCR1_TARGET_ROLE && r.grantor === "postgres");
  if (debtPresent) {
    await sql(fs.readFileSync(path.join(process.cwd(), SR2GCR1_MIGRATION), "utf8"));
    console.log("     (repair applied)");
  } else {
    console.log("     (repair already applied)");
  }
  const after = await sql(TOPOLOGY);
  const attrsAfter = await sql(ROLE_ATTRS);
  const fnAfter = await sql(FUNCTIONS);
  const privAfter = await sql(PRIVILEGES);

  const beforeSet = new Set(before.map(stamp));
  const afterSet = new Set(after.map(stamp));
  const removed = [...beforeSet].filter((k) => !afterSet.has(k));
  const added = [...afterSet].filter((k) => !beforeSet.has(k));
  const poolRows = after.filter((r) => r.role === SR2GCR1_TARGET_ROLE);
  const fn = (name, rows) => rows.find((r) => r.proname === name);

  // --- 1-2. the target row, and only the target row -------------------------------------------------
  check("01 the postgres-granted pool-authority membership row is gone",
    !poolRows.some((r) => r.grantor === "postgres"), poolRows);
  // Rerunnable: on the run that applies the repair exactly one row must disappear, and on every later
  // run the topology must already be clean and must not move at all.
  check("02 the repair removes exactly the one debt row, and is idempotent thereafter",
    debtPresent
      ? removed.length === 1 && removed[0] === `${SR2GCR1_TARGET_ROLE}|postgres|a=false|i=true|s=true` && added.length === 0
      : removed.length === 0 && added.length === 0
        && !before.some((r) => r.role === SR2GCR1_TARGET_ROLE && r.grantor === "postgres"),
    { debtPresent, removed, added });
  check("03 the legitimate supabase_admin pool row survives with ADMIN OPTION",
    poolRows.length === 1 && poolRows[0].grantor === "supabase_admin" && poolRows[0].admin_option === true
    && poolRows[0].inherit_option === false && poolRows[0].set_option === false, poolRows);

  // --- 3-4. every other authority is untouched --------------------------------------------------------
  const other = (role) => after.filter((r) => r.role === role);
  check("04 social_authority membership is unchanged",
    JSON.stringify(other("social_authority")) === JSON.stringify(before.filter((r) => r.role === "social_authority"))
    && other("social_authority").every((r) => r.admin_option && !r.inherit_option && !r.set_option), other("social_authority"));
  check("05 the SR-2G-B-R1 write-authority repair remains intact",
    other("meal_buddy_card_write_authority").length === 1
    && !other("meal_buddy_card_write_authority").some((r) => r.grantor === "postgres"), other("meal_buddy_card_write_authority"));
  check("06 every remaining Social authority holds one supabase_admin row without SET or INHERIT",
    after.every((r) => r.grantor === "supabase_admin" && r.admin_option === true && r.inherit_option === false && r.set_option === false), after);

  // --- 5-7. role and function invariance -----------------------------------------------------------------
  check("07 pool role attributes are unchanged", JSON.stringify(attrsBefore) === JSON.stringify(attrsAfter), { attrsBefore, attrsAfter });
  check("08 the pool role remains NOLOGIN, NOINHERIT and NOBYPASSRLS",
    attrsAfter[0].rolcanlogin === false && attrsAfter[0].rolinherit === false && attrsAfter[0].rolbypassrls === false, attrsAfter[0]);
  check("09 the pool function owner is unchanged",
    fn("canonical_meal_buddy_candidate_cards", fnAfter).owner === SR2GCR1_TARGET_ROLE
    && fn("canonical_meal_buddy_candidate_cards", fnAfter).owner === fn("canonical_meal_buddy_candidate_cards", fnBefore).owner);
  check("10 both function bodies are byte-identical to the pre-repair digests",
    JSON.stringify(fnBefore) === JSON.stringify(fnAfter)
    && fn("canonical_meal_buddy_candidate_cards", fnAfter).body_md5 === SR2GCR1_FROZEN_BODY_MD5.canonical_meal_buddy_candidate_cards
    && fn("authorized_candidates", fnAfter).body_md5 === SR2GCR1_FROZEN_BODY_MD5.authorized_candidates,
    { fnBefore, fnAfter });
  check("11 SECURITY DEFINER and STABLE are retained",
    fn("canonical_meal_buddy_candidate_cards", fnAfter).prosecdef === true
    && fn("canonical_meal_buddy_candidate_cards", fnAfter).provolatile === "s");

  // --- 8-13. privilege invariance --------------------------------------------------------------------------
  check("12 privilege topology is identical before and after", JSON.stringify(privBefore) === JSON.stringify(privAfter), { privBefore, privAfter });
  check("13 the pool role keeps SELECT on public.meal_buddy_cards", privAfter[0].cards_select === 1);
  check("14 the pool role keeps EXECUTE on authorized_candidates", privAfter[0].pool_can_authorize === true);
  check("15 social_runtime_executor can still execute the pool primitive", privAfter[0].executor_execute === true);
  check("16 authenticated cannot execute the pool primitive", privAfter[0].authenticated_execute === false);
  check("17 anon cannot execute the pool primitive", privAfter[0].anon_execute === false);
  check("18 service_role has no product EXECUTE on the pool primitive", privAfter[0].service_role_execute === false);
  check("19 the pool role holds no schema CREATE", privAfter[0].internal_create === false && privAfter[0].public_create === false);
  check("20 the pool role is not a member of social_authority", privAfter[0].member_of_social_authority === false);
  check("21 the role-scoped RLS policy still exists", privAfter[0].pool_policy === 1);

  // --- 14-18. live pool behaviour, in a rolled-back transaction ------------------------------------------------
  const fixtures = `
${person(ACTOR)}${participate(ACTOR)}
${Object.values(OWNER).map((id) => person(id)).join("")}
${Object.entries(OWNER).filter(([k]) => k !== "notParticipating").map(([, id]) => participate(id)).join("")}
insert into public.social_blocks (blocker_user_id, blocked_user_id) values ('${ACTOR}'::uuid,'${OWNER.blocked}'::uuid);
insert into public.restaurants (id, name, status) values ('${R1}','R One','active'),('${R2}','R Two','active');
${card(C.source, ACTOR, { cardType: "restaurant", restaurantId: `'${R1}'` })}
${card(C.valid, OWNER.valid)}
${card(C.blocked, OWNER.blocked)}
${card(C.notParticipating, OWNER.notParticipating)}
${card(C.multiOld, OWNER.multi, { createdAt: `timestamptz '2026-08-19T01:00:00Z'` })}
${card(C.multiNew, OWNER.multi, { createdAt: `timestamptz '2026-08-19T09:00:00Z'` })}
${card(C.restaurantOther, OWNER.restaurantOther, { cardType: "restaurant", restaurantId: `'${R2}'` })}`;

  // The repair removes exactly the implicit capability postgres should never have had, so postgres can
  // no longer invoke the pool primitive directly — proof of the repair, not an obstacle to it. The pool
  // is therefore exercised through the real runtime identity, social_runtime_executor, borrowed with
  // the frozen transient pattern (INHERIT FALSE, SET TRUE) inside a transaction that is rolled back.
  const live = await sql(`
begin;
${fixtures}
grant social_runtime_executor to postgres with inherit false, set true;
set local role social_runtime_executor;
select (${pool(ACTOR, C.source)}) as from_source,
       (${pool(OWNER.valid, C.source)}) as from_foreign_actor;
set local role postgres;
rollback;`);
  const rows = live[0].from_source ?? [];
  const owners = rows.map((e) => e.owner);
  const cardOf = (owner) => rows.find((e) => e.owner === owner)?.card ?? null;

  check("22 a valid compatible candidate is still included", owners.includes(OWNER.valid), owners);
  check("23 a blocked candidate is still excluded", !owners.includes(OWNER.blocked));
  check("24 a non-participating candidate is still excluded", !owners.includes(OWNER.notParticipating));
  check("25 the actor's own card never appears", !owners.includes(ACTOR));
  check("26 restaurant/restaurant mismatch is still excluded", !owners.includes(OWNER.restaurantOther));
  check("27 one card per owner is still enforced", owners.filter((o) => o === OWNER.multi).length === 1);
  check("28 the newest card still wins the per-owner reduction", cardOf(OWNER.multi) === C.multiNew,
    { chosen: cardOf(OWNER.multi), expected: C.multiNew });
  check("29 a source card owned by another actor still yields nothing", (live[0].from_foreign_actor ?? []).length === 0);
  check("30 the pool is still ordered deterministically by owner then card",
    JSON.stringify(owners) === JSON.stringify([...owners].sort()));

  // --- 19. residue -------------------------------------------------------------------------------------------------
  const residue = await sql(`
    select
      (select count(*) from auth.users where id::text like '${M}%') as users,
      (select count(*) from public.consumer_profiles where user_id::text like '${M}%') as profiles,
      (select count(*) from public.meal_buddy_cards where id::text like '${M}%') as cards,
      (select count(*) from public.social_blocks where blocker_user_id::text like '${M}%') as blocks,
      (select count(*) from public.social_participation where user_id::text like '${M}%') as participation,
      (select count(*) from public.restaurants where id in ('${R1}','${R2}')) as restaurants`);
  check("31 zero fixture residue remains", Object.values(residue[0]).every((n) => Number(n) === 0), residue[0]);

  // The transient executor borrow above must not have outlived its rolled-back transaction.
  const settled = await sql(TOPOLOGY);
  check("32 the transient executor borrow left no residual membership row",
    JSON.stringify(settled.map(stamp)) === JSON.stringify(after.map(stamp))
    && !settled.some((r) => r.grantor === "postgres"), settled);
  check("33 postgres can no longer execute the pool primitive by inheritance",
    (await sql(`select has_function_privilege('postgres','${POOL_SIGNATURE}','EXECUTE') as can`))[0].can === false);

  const summary = Object.freeze({
    suite: SUITE, projectRef: DEV_REF, environment: "development", productionTouched: false,
    repairApplied: debtPresent, membershipRowsRemoved: removed, membershipRowsAdded: added,
    postRepairTopology: after.map(stamp),
    total: checks.length, passed: checks.length - failures.length, failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message }, null, 2));
  process.exit(1);
}
