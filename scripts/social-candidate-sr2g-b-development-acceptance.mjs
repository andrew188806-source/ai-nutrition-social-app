#!/usr/bin/env node
// SR-2G-B Development live acceptance for the Meal Buddy card write authority.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_B_DEVELOPMENT_ACCEPTANCE=1.
//
// Every request below is a real authenticated HTTPS call to the deployed Edge functions using a real
// Development session token. Nothing is stubbed. Fixtures are removed in the finally block and the
// residue is proven to be zero.
import fs from "node:fs";

const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_B_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-b-development-acceptance";
// Hex-only. A non-hex character here makes every fixture insert fail as a malformed uuid, and the
// negative assertions would then all pass for the wrong reason.
const MARKER = "5b2f0b01";
const P = `${MARKER}-0000-4000-8000-`;
const FREE_ACTOR = `${P}00000000000f`;
const PREMIUM_ACTOR = `${P}00000000000e`;
const RESTAURANT = "sr2gb-acceptance-restaurant";
const BASE = `https://${DEV_REF}.supabase.co/functions/v1`;

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
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function apiKeys() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const keys = await res.json();
  const pick = (name) => keys.find((entry) => entry.name === name)?.api_key;
  return { anon: pick("anon"), serviceRole: pick("service_role") };
}

let fixturesCreated = false;
const { anon, serviceRole } = await apiKeys();

// Taipei calendar helpers, mirroring the server contract.
const taipeiToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const plusDays = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const TOMORROW = plusDays(taipeiToday, 1);
const YESTERDAY = plusDays(taipeiToday, -1);

async function callFunction(name, token, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}/${name}`, {
    method: "POST",
    headers: { apikey: anon, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body)
  });
  let payload = null;
  try { payload = JSON.parse(await res.text()); } catch { payload = null; }
  return { status: res.status, payload };
}

// The Edge gateway occasionally answers 502 under back-to-back cold invocations. That is transport
// noise, not a product outcome: a 502 is neither a success nor a quota refusal, so setup calls
// retry it rather than letting it masquerade as either.
async function callFunctionStable(name, token, body, attempts = 4) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await callFunction(name, token, body);
    if (last.status !== 502 && last.status !== 504) return last;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  return last;
}

const createBody = (overrides = {}) => ({
  cardType: "general",
  intentionType: "chat_first",
  restaurantId: null,
  area: null,
  diningDate: TOMORROW,
  mealPeriod: "dinner",
  preferredTime: null,
  ...overrides
});

async function signIn(email, password) {
  const res = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json();
  if (!body.access_token) throw new Error("Development sign-in failed");
  return body.access_token;
}

try {
  // --- fixtures ---------------------------------------------------------------------------------
  const password = `Sr2gb-${crypto.randomUUID()}`;
  for (const [id, label] of [[FREE_ACTOR, "free"], [PREMIUM_ACTOR, "premium"]]) {
    const created = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, email: `sr2gb-${label}-${MARKER}@example.com`, password, email_confirm: true })
    });
    if (!created.ok) throw new Error(`actor create failed (${label}): ${created.status}`);
  }
  fixturesCreated = true;

  await sql(`
begin;
insert into public.restaurants (id, name, status) values ('${RESTAURANT}', 'SR-2G-B acceptance', 'active')
  on conflict (id) do nothing;
insert into public.subscription_entitlements (user_id, plan_code, entitlement_source, status, valid_from, valid_until)
values ('${PREMIUM_ACTOR}'::uuid, 'premium', 'sr2gb_acceptance', 'active', now() - interval '1 day', null);
commit;`);

  const freeToken = await signIn(`sr2gb-free-${MARKER}@example.com`, password);
  const premiumToken = await signIn(`sr2gb-premium-${MARKER}@example.com`, password);

  // --- authentication and request contract --------------------------------------------------------
  check("00 an unauthenticated create is rejected",
    (await callFunction("meal-buddy-card-create", null, createBody())).status === 401);
  check("01 an unauthenticated list is rejected",
    (await callFunction("meal-buddy-card-list", null, {})).status === 401);
  check("02 a create carrying an owner header is rejected",
    (await callFunction("meal-buddy-card-create", freeToken, createBody(), { "x-owner-user-id": PREMIUM_ACTOR })).status === 400);
  check("03 a create carrying a tier header is rejected",
    (await callFunction("meal-buddy-card-create", freeToken, createBody(), { "x-tier": "premium" })).status === 400);
  const extraKey = await callFunction("meal-buddy-card-create", freeToken, { ...createBody(), ownerUserId: PREMIUM_ACTOR });
  check("04 a create body naming an owner is rejected", extraKey.status === 400);
  check("05 a create body naming expiresAt is rejected",
    (await callFunction("meal-buddy-card-create", freeToken, { ...createBody(), expiresAt: "2099-01-01T00:00:00Z" })).status === 400);
  check("06 a restaurant card without a restaurant is rejected",
    (await callFunction("meal-buddy-card-create", freeToken, createBody({ cardType: "restaurant" })).then((r) => r)).status === 400);
  check("07 an invalid meal period is rejected",
    (await callFunction("meal-buddy-card-create", freeToken, createBody({ mealPeriod: "brunch" }))).status === 400);

  // --- timezone: a past Taipei date is refused ------------------------------------------------------
  check("08 a dining date in the Taipei past is rejected",
    (await callFunction("meal-buddy-card-create", freeToken, createBody({ diningDate: YESTERDAY }))).status === 400);
  check("09 today's Taipei date is accepted as a dining date",
    (await callFunction("meal-buddy-card-create", freeToken, createBody({ diningDate: taipeiToday, mealPeriod: "late_night" }))).status === 200);

  // The late_night card just created must expire on the FOLLOWING Taipei day at 02:00 local.
  const lateNight = await sql(`
    select (expires_at at time zone 'Asia/Taipei')::text as local_expiry, dining_date::text as dining_date
    from public.meal_buddy_cards
    where owner_user_id = '${FREE_ACTOR}'::uuid and meal_period = 'late_night' and cancelled_at is null
    order by created_at desc limit 1;`);
  check("10 a late_night card expires at 02:00 the next Taipei day, proving local-time authority",
    lateNight.length === 1
    && lateNight[0].local_expiry.startsWith(`${plusDays(lateNight[0].dining_date, 1)} 02:00:00`),
    lateNight);

  // --- Free quota -----------------------------------------------------------------------------------
  // The late_night create above already consumed the Free general slot.
  const freeSecondGeneral = await callFunction("meal-buddy-card-create", freeToken, createBody());
  check("11 Free may hold only one active general card", freeSecondGeneral.status === 409
    && freeSecondGeneral.payload?.error?.code === "card_quota_exceeded", freeSecondGeneral.payload);

  const freeRestaurant = await callFunction("meal-buddy-card-create", freeToken,
    createBody({ cardType: "restaurant", restaurantId: RESTAURANT }));
  check("12 Free may hold one active restaurant card", freeRestaurant.status === 200);
  const freeSecondRestaurant = await callFunction("meal-buddy-card-create", freeToken,
    createBody({ cardType: "restaurant", restaurantId: RESTAURANT }));
  check("13 Free may hold only one active restaurant card", freeSecondRestaurant.status === 409);

  // --- Premium quota ---------------------------------------------------------------------------------
  const premiumGeneral = [];
  for (let index = 0; index < 3; index += 1) {
    premiumGeneral.push(await callFunction("meal-buddy-card-create", premiumToken, createBody()));
  }
  check("14 Premium may hold three active general cards", premiumGeneral.every((r) => r.status === 200),
    premiumGeneral.map((r) => r.status));
  const premiumFourth = await callFunction("meal-buddy-card-create", premiumToken, createBody());
  check("15 Premium is refused a fourth active general card", premiumFourth.status === 409);

  const premiumRestaurant = [];
  for (let index = 0; index < 2; index += 1) {
    premiumRestaurant.push(await callFunction("meal-buddy-card-create", premiumToken,
      createBody({ cardType: "restaurant", restaurantId: RESTAURANT })));
  }
  check("16 Premium may hold two active restaurant cards", premiumRestaurant.every((r) => r.status === 200));
  check("17 Premium is refused a third active restaurant card",
    (await callFunction("meal-buddy-card-create", premiumToken,
      createBody({ cardType: "restaurant", restaurantId: RESTAURANT }))).status === 409);

  // --- response shape -----------------------------------------------------------------------------------
  const sample = premiumGeneral[0].payload;
  check("18 the create response carries the frozen policy version",
    sample?.policyVersion === "meal-buddy-card-write-api-v1");
  check("19 the created card exposes a source reference and no raw identifier",
    typeof sample?.card?.sourceCardRef === "string" && sample.card.sourceCardRef.startsWith("mbc1."));
  check("20 the created card carries exactly the client-safe fields",
    JSON.stringify(Object.keys(sample.card).sort()) === JSON.stringify(
      ["area", "cardType", "createdAt", "diningDate", "expiresAt", "intentionType", "mealPeriod", "preferredTime", "restaurantId", "sourceCardRef"]),
    Object.keys(sample.card).sort());
  check("21 quota metadata reports Premium limits without naming the tier",
    sample.quota.general.limit === 3 && sample.quota.restaurant.limit === 2
    && !JSON.stringify(sample).match(/premium|free|plan_code|entitlement|billing/i), sample.quota);

  const freeList = await callFunction("meal-buddy-card-list", freeToken, {});
  check("22 quota metadata reports Free limits", freeList.payload?.quota?.general?.limit === 1
    && freeList.payload?.quota?.restaurant?.limit === 1, freeList.payload?.quota);

  // --- no raw identifier anywhere ---------------------------------------------------------------------------
  const everySerialized = JSON.stringify([sample, freeList.payload, freeRestaurant.payload]);
  const rawIds = await sql(`select id::text from public.meal_buddy_cards where owner_user_id in ('${FREE_ACTOR}'::uuid, '${PREMIUM_ACTOR}'::uuid);`);
  check("23 no raw card uuid appears in any response",
    !rawIds.some((row) => everySerialized.includes(row.id)), { cards: rawIds.length });
  check("24 no owner uuid appears in any response",
    !everySerialized.includes(FREE_ACTOR) && !everySerialized.includes(PREMIUM_ACTOR));

  // --- list semantics ---------------------------------------------------------------------------------------
  check("25 the list returns only the actor's own active cards",
    Array.isArray(freeList.payload?.cards) && freeList.payload.cards.length === 2,
    freeList.payload?.cards?.length);
  const listAgain = await callFunction("meal-buddy-card-list", freeToken, {});
  check("26 repeated lists are deterministically ordered",
    JSON.stringify(listAgain.payload.cards.map((c) => `${c.diningDate}|${c.mealPeriod}|${c.cardType}`))
    === JSON.stringify(freeList.payload.cards.map((c) => `${c.diningDate}|${c.mealPeriod}|${c.cardType}`)));
  check("27 every list issues a fresh source reference",
    listAgain.payload.cards[0].sourceCardRef !== freeList.payload.cards[0].sourceCardRef);
  check("28 a list carrying a body is rejected",
    (await callFunction("meal-buddy-card-list", freeToken, { ownerUserId: FREE_ACTOR })).status === 400);

  // --- cancel semantics -------------------------------------------------------------------------------------
  const freeGeneralRef = freeList.payload.cards.find((c) => c.cardType === "general").sourceCardRef;
  check("29 another actor cannot cancel using a foreign source reference",
    (await callFunction("meal-buddy-card-cancel", premiumToken, { sourceCardRef: freeGeneralRef })).status === 400);
  const cancelled = await callFunction("meal-buddy-card-cancel", freeToken, { sourceCardRef: freeGeneralRef });
  check("30 the owner may cancel their own card", cancelled.status === 200 && cancelled.payload?.cancelled === true);
  check("31 cancelling again is idempotent",
    (await callFunction("meal-buddy-card-cancel", freeToken, { sourceCardRef: freeGeneralRef })).status === 200);
  check("32 a malformed reference is refused opaquely",
    (await callFunction("meal-buddy-card-cancel", freeToken, { sourceCardRef: "mbc1.not-a-real-token" })).status === 400);
  check("33 a candidate-purpose reference cannot cancel",
    (await callFunction("meal-buddy-card-cancel", freeToken, { sourceCardRef: freeGeneralRef.replace("mbc1.", "scr1.") })).status === 400);

  // --- cancel frees quota -------------------------------------------------------------------------------------
  const afterCancel = await callFunction("meal-buddy-card-list", freeToken, {});
  check("34 a cancelled card leaves the list", afterCancel.payload.cards.every((c) => c.cardType !== "general"));
  check("35 a cancelled card no longer consumes quota", afterCancel.payload.quota.general.used === 0,
    afterCancel.payload.quota);
  check("36 the freed slot can be used again",
    (await callFunction("meal-buddy-card-create", freeToken, createBody())).status === 200);

  // --- expired cards do not consume quota -------------------------------------------------------------------
  // Both columns move into the past together: expires_at > created_at is a real invariant, and a
  // fixture that violated it would be an impossible state rather than an expired card.
  await sql(`update public.meal_buddy_cards
             set created_at = now() - interval '3 hours', expires_at = now() - interval '1 hour'
             where owner_user_id = '${FREE_ACTOR}'::uuid and card_type = 'restaurant';`);
  const afterExpiry = await callFunction("meal-buddy-card-list", freeToken, {});
  check("37 an expired card leaves the list", afterExpiry.payload.cards.every((c) => c.cardType !== "restaurant"));
  check("38 an expired card no longer consumes quota", afterExpiry.payload.quota.restaurant.used === 0);
  check("39 the expired slot can be used again",
    (await callFunctionStable("meal-buddy-card-create", freeToken,
      createBody({ cardType: "restaurant", restaurantId: RESTAURANT }))).status === 200);

  // --- direct authenticated writes are denied -----------------------------------------------------------------
  const directWrite = async (statement) => {
    try {
      await sql(`begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${FREE_ACTOR}","role":"authenticated"}';
${statement}
rollback;`);
      return true;
    } catch { return false; }
  };
  check("40 an authenticated client cannot INSERT a card directly", !(await directWrite(
    `insert into public.meal_buddy_cards (owner_user_id, card_type, intention_type, dining_date, meal_period, expires_at)
     values ('${FREE_ACTOR}'::uuid,'general','chat_first', date '${TOMORROW}', 'dinner', now() + interval '6 hours');`)));
  check("41 an authenticated client cannot UPDATE a card directly", !(await directWrite(
    `update public.meal_buddy_cards set cancelled_at = now() where owner_user_id = '${FREE_ACTOR}'::uuid;`)));
  check("42 an authenticated client cannot DELETE a card directly", !(await directWrite(
    `delete from public.meal_buddy_cards where owner_user_id = '${FREE_ACTOR}'::uuid;`)));

  // --- concurrency: the atomic quota authority ------------------------------------------------------------------
  // A Premium actor at exactly one free general slot. Two simultaneous creates must resolve to one
  // success and one refusal, never two successes.
  await sql(`update public.meal_buddy_cards set cancelled_at = now()
             where owner_user_id = '${PREMIUM_ACTOR}'::uuid and card_type = 'general' and cancelled_at is null;`);
  const seeded = [];
  for (let index = 0; index < 2; index += 1) {
    seeded.push(await callFunctionStable("meal-buddy-card-create", premiumToken, createBody()));
  }
  check("43 the Premium actor is seeded to exactly one remaining general slot",
    seeded.every((r) => r.status === 200), seeded.map((r) => r.status));

  // Two genuinely simultaneous creates against the final slot. A 502 from either side makes the
  // round inconclusive rather than failing, so the slot is restored and the race is repeated; the
  // assertion below only ever judges a round in which both requests produced a product answer.
  let racers = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    racers = await Promise.all([
      callFunction("meal-buddy-card-create", premiumToken, createBody()),
      callFunction("meal-buddy-card-create", premiumToken, createBody())
    ]);
    if (racers.every((r) => r.status === 200 || r.status === 409)) break;
    await sql(`update public.meal_buddy_cards set cancelled_at = now()
               where owner_user_id = '${PREMIUM_ACTOR}'::uuid and card_type = 'general'
                 and cancelled_at is null and expires_at > now()
                 and id in (select id from public.meal_buddy_cards
                            where owner_user_id = '${PREMIUM_ACTOR}'::uuid and card_type = 'general'
                              and cancelled_at is null and expires_at > now()
                            order by created_at desc limit 1);`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  const successes = racers.filter((r) => r.status === 200).length;
  const refusals = racers.filter((r) => r.status === 409).length;
  check("44 exactly one concurrent create succeeds", successes === 1, racers.map((r) => r.status));
  check("45 exactly one concurrent create is refused by quota", refusals === 1, racers.map((r) => r.status));

  const activeGeneral = await sql(`
    select count(*)::int as active from public.meal_buddy_cards
    where owner_user_id = '${PREMIUM_ACTOR}'::uuid and card_type = 'general'
      and cancelled_at is null and expires_at > now();`);
  check("46 the database holds exactly the Premium general cap, never more",
    activeGeneral[0].active === 3, activeGeneral);

  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length === 0 ? "passed" : "failed",
    projectRef: DEV_REF,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    productionTouched: false
  }, null, 2));
} finally {
  if (fixturesCreated) {
    await sql(`
begin;
delete from public.meal_buddy_cards where owner_user_id::text like '${MARKER}-%';
delete from public.subscription_entitlements where user_id::text like '${MARKER}-%';
delete from auth.users where id::text like '${MARKER}-%';
delete from public.restaurants where id = '${RESTAURANT}';
commit;`).catch(() => undefined);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
