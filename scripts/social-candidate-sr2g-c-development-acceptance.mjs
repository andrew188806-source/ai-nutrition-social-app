#!/usr/bin/env node
// SR-2G-C Development acceptance for the canonical compatible-card candidate pool.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_C_DEVELOPMENT_ACCEPTANCE=1.
//
// The whole fixture matrix and every assertion run inside ONE transaction that is always rolled
// back, so the acceptance leaves nothing behind by construction. The real frozen
// social_internal.authorized_candidates is used throughout — block and participation rules are never
// faked or reimplemented here.
const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_C_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-c-development-acceptance";

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
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${t.slice(0, 600)}`);
  return JSON.parse(t);
}

// Hex-only marker: a non-hex character would make every fixture insert fail as a malformed uuid and
// every negative assertion pass for the wrong reason.
const M = "5c2f0c01";
const U = (suffix) => `${M}-0000-4000-8000-${suffix.padStart(12, "0")}`;
const ACTOR = U("a");
const OWNER = {
  general: U("b1"),      // general card, same date + period, mismatched area/intention/time
  restaurantSame: U("b2"), // restaurant card, same restaurant as the restaurant source
  restaurantOther: U("b3"), // restaurant card, different restaurant
  dateMismatch: U("b4"),
  periodMismatch: U("b5"),
  blocked: U("b6"),
  notParticipating: U("b7"),
  multi: U("b8"),
  cancelled: U("b9"),
  expired: U("ba")
};
const R1 = "sr2gc-restaurant-one";
const R2 = "sr2gc-restaurant-two";
const INSTANT = "2026-08-20T04:00:00Z";
const DATE = "2026-08-21";

const person = (id) => `
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${id}'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','${id}@example.com','',now(),now());
insert into public.consumer_profiles (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, status)
values ('${id}'::uuid,'sr2gc_${id}','N ${id}','Anon ${id}','PB','active');`;

const participate = (id) => `
insert into public.social_participation (user_id, state, opted_in_at)
values ('${id}'::uuid,'opted_in', timestamptz '2026-01-01T00:00:00Z');`;

// created_at is set explicitly so the newest-card rule is testable; expires_at respects the frozen
// SR-2G-A invariant expires_at > created_at in every case, including the expired fixtures.
const card = (id, owner, opts = {}) => {
  const {
    cardType = "general", restaurantId = "null", diningDate = DATE, mealPeriod = "'dinner'",
    area = "null", intention = "'chat_first'", preferredTime = "null",
    createdAt = `timestamptz '2026-08-19T00:00:00Z'`,
    expiresAt = `timestamptz '2026-08-22T00:00:00Z'`, cancelledAt = "null"
  } = opts;
  return `
insert into public.meal_buddy_cards
  (id, owner_user_id, card_type, intention_type, restaurant_id, area, dining_date, meal_period, preferred_time, created_at, expires_at, cancelled_at)
values ('${id}'::uuid,'${owner}'::uuid,'${cardType}',${intention},${restaurantId},${area}, date '${diningDate}', ${mealPeriod}, ${preferredTime}, ${createdAt}, ${expiresAt}, ${cancelledAt});`;
};

const C = {
  sourceGeneral: U("c1"),
  sourceRestaurant: U("c2"),
  sourceCancelled: U("c3"),
  sourceExpired: U("c4"),
  actorSecond: U("c5"),
  general: U("d1"),
  restaurantSame: U("d2"),
  restaurantOther: U("d3"),
  dateMismatch: U("d4"),
  periodMismatch: U("d5"),
  blocked: U("d6"),
  notParticipating: U("d7"),
  multiOld: U("d8"),
  multiNew: U("d9"),
  cancelled: U("da"),
  expired: U("db")
};

const pool = (source) =>
  `select coalesce(json_agg(json_build_object('owner', candidate_owner_user_id, 'card', candidate_card_id) order by candidate_owner_user_id, candidate_card_id), '[]'::json)
   from social_internal.canonical_meal_buddy_candidate_cards('${ACTOR}'::uuid, '${source}'::uuid, timestamptz '${INSTANT}')`;

try {
  const fixtures = `
${person(ACTOR)}${participate(ACTOR)}
${Object.values(OWNER).map((id) => person(id)).join("")}
${Object.entries(OWNER).filter(([key]) => key !== "notParticipating").map(([, id]) => participate(id)).join("")}
insert into public.social_blocks (blocker_user_id, blocked_user_id) values ('${ACTOR}'::uuid,'${OWNER.blocked}'::uuid);
insert into public.restaurants (id, name, status) values ('${R1}','R One','active'),('${R2}','R Two','active');

${card(C.sourceGeneral, ACTOR)}
${card(C.sourceRestaurant, ACTOR, { cardType: "restaurant", restaurantId: `'${R1}'` })}
${card(C.sourceCancelled, ACTOR, { cancelledAt: `timestamptz '2026-08-19T12:00:00Z'` })}
${card(C.sourceExpired, ACTOR, { createdAt: `timestamptz '2026-08-18T00:00:00Z'`, expiresAt: `timestamptz '2026-08-19T00:00:00Z'` })}
${card(C.actorSecond, ACTOR)}

${card(C.general, OWNER.general, { area: `'somewhere else'`, intention: `'eat_together'`, preferredTime: `time '19:30'` })}
${card(C.restaurantSame, OWNER.restaurantSame, { cardType: "restaurant", restaurantId: `'${R1}'` })}
${card(C.restaurantOther, OWNER.restaurantOther, { cardType: "restaurant", restaurantId: `'${R2}'` })}
${card(C.dateMismatch, OWNER.dateMismatch, { diningDate: "2026-08-22" })}
${card(C.periodMismatch, OWNER.periodMismatch, { mealPeriod: "'lunch'" })}
${card(C.blocked, OWNER.blocked)}
${card(C.notParticipating, OWNER.notParticipating)}
${card(C.multiOld, OWNER.multi, { createdAt: `timestamptz '2026-08-19T01:00:00Z'` })}
${card(C.multiNew, OWNER.multi, { createdAt: `timestamptz '2026-08-19T09:00:00Z'` })}
${card(C.cancelled, OWNER.cancelled, { cancelledAt: `timestamptz '2026-08-19T12:00:00Z'` })}
${card(C.expired, OWNER.expired, { createdAt: `timestamptz '2026-08-18T00:00:00Z'`, expiresAt: `timestamptz '2026-08-19T00:00:00Z'` })}`;

  const result = await sql(`
begin;
${fixtures}
select
  (${pool(C.sourceGeneral)}) as from_general,
  (${pool(C.sourceRestaurant)}) as from_restaurant,
  (${pool(C.sourceCancelled)}) as from_cancelled_source,
  (${pool(C.sourceExpired)}) as from_expired_source,
  (select coalesce(json_agg(json_build_object('owner', candidate_owner_user_id, 'card', candidate_card_id) order by candidate_owner_user_id, candidate_card_id), '[]'::json)
     from social_internal.canonical_meal_buddy_candidate_cards('${OWNER.general}'::uuid, '${C.sourceGeneral}'::uuid, timestamptz '${INSTANT}')) as from_foreign_actor,
  (${pool(C.sourceGeneral)}) as from_general_repeat;
rollback;`);

  const row = result[0];
  const owners = (set) => (row[set] ?? []).map((entry) => entry.owner).sort();
  const cardOf = (set, owner) => (row[set] ?? []).find((entry) => entry.owner === owner)?.card ?? null;
  const fromGeneral = owners("from_general");
  const fromRestaurant = owners("from_restaurant");

  // --- source validation -------------------------------------------------------------------------
  check("01 an owned active source card yields a pool", fromGeneral.length > 0, fromGeneral.length);
  check("02 a source card owned by another actor yields nothing", (row.from_foreign_actor ?? []).length === 0);
  check("03 a cancelled source card yields nothing", (row.from_cancelled_source ?? []).length === 0);
  check("04 an expired source card yields nothing", (row.from_expired_source ?? []).length === 0);

  // --- hard compatibility ------------------------------------------------------------------------
  check("05 same date and period general/general is included", fromGeneral.includes(OWNER.general));
  check("06 a dining-date mismatch is excluded", !fromGeneral.includes(OWNER.dateMismatch));
  check("07 a meal-period mismatch is excluded", !fromGeneral.includes(OWNER.periodMismatch));
  check("08 restaurant/restaurant with the same restaurant is included", fromRestaurant.includes(OWNER.restaurantSame));
  check("09 restaurant/restaurant with a different restaurant is excluded", !fromRestaurant.includes(OWNER.restaurantOther));
  check("10 a restaurant source matches a general candidate", fromRestaurant.includes(OWNER.general));
  check("11 a general source matches a restaurant candidate", fromGeneral.includes(OWNER.restaurantOther) && fromGeneral.includes(OWNER.restaurantSame));

  // --- fields that are deliberately NOT hard eligibility -------------------------------------------
  check("12 an area mismatch remains eligible", fromGeneral.includes(OWNER.general));
  check("13 an intention mismatch remains eligible", fromGeneral.includes(OWNER.general));
  check("14 a preferred-time difference inside the same period remains eligible", fromGeneral.includes(OWNER.general));

  // --- existing Social authority, composed not reimplemented ----------------------------------------
  check("15 the actor's own card never appears", !fromGeneral.includes(ACTOR));
  check("16 a blocked owner is excluded by the frozen authorization primitive", !fromGeneral.includes(OWNER.blocked));
  check("17 a non-participating owner is excluded", !fromGeneral.includes(OWNER.notParticipating));
  check("18 an otherwise eligible owner is included", fromGeneral.includes(OWNER.multi));

  // --- multiplicity ----------------------------------------------------------------------------------
  const multiRows = (row.from_general ?? []).filter((entry) => entry.owner === OWNER.multi);
  check("19 an owner with two compatible cards yields exactly one row", multiRows.length === 1, multiRows.length);
  check("20 the newest created_at card wins", cardOf("from_general", OWNER.multi) === C.multiNew,
    { chosen: cardOf("from_general", OWNER.multi), expected: C.multiNew });
  check("21 every owner appears at most once", new Set(fromGeneral).size === fromGeneral.length);

  // --- lifecycle ---------------------------------------------------------------------------------------
  check("22 a cancelled candidate card is excluded", !fromGeneral.includes(OWNER.cancelled));
  check("23 an expired candidate card is excluded", !fromGeneral.includes(OWNER.expired));

  // --- determinism and absence of product slicing ---------------------------------------------------------
  check("24 repeated evaluation returns an identical pool",
    JSON.stringify(row.from_general) === JSON.stringify(row.from_general_repeat));
  check("25 no Free or Premium slicing is applied", fromGeneral.length > 3,
    { returned: fromGeneral.length });
  check("26 the pool is ordered deterministically by owner then card",
    JSON.stringify(fromGeneral) === JSON.stringify([...fromGeneral].sort()));

  // --- residue -----------------------------------------------------------------------------------------------
  const residue = await sql(`
    select (select count(*)::int from public.meal_buddy_cards where owner_user_id::text like '${M}-%') as cards,
           (select count(*)::int from auth.users where id::text like '${M}-%') as users,
           (select count(*)::int from public.restaurants where id in ('${R1}','${R2}')) as restaurants,
           (select count(*)::int from public.social_blocks where blocker_user_id::text like '${M}-%') as blocks;`);
  check("27 the acceptance left no fixture behind",
    residue[0].cards === 0 && residue[0].users === 0 && residue[0].restaurants === 0 && residue[0].blocks === 0, residue[0]);

  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length === 0 ? "passed" : "failed",
    projectRef: DEV_REF,
    poolSizeFromGeneralSource: fromGeneral.length,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message }, null, 2));
  process.exit(1);
}
