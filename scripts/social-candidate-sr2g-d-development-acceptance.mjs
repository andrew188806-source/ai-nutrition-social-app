#!/usr/bin/env node
// SR-2G-D Development live acceptance for the real Meal Buddy candidate orchestration API.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_D_DEVELOPMENT_ACCEPTANCE=1.
//
// Every candidate request below is a real authenticated HTTPS call to the deployed Edge function
// using a real Development session token. Nothing about the server is stubbed. Fixtures are removed
// in the finally block and the residue is proven to be zero.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_D_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-d-development-acceptance";
const BASE = `https://${DEV_REF}.supabase.co/functions/v1`;
const ENDPOINT = "meal-buddy-candidate-list";

// Hex-only marker. A non-hex character makes every fixture insert fail as a malformed uuid, and the
// negative assertions would then all pass for the wrong reason.
const MARKER = "5d2f0d01";
const P = `${MARKER}-0000-4000-8000-`;
const U = (suffix) => `${P}${suffix.padStart(12, "0")}`;

const ACTOR_PREMIUM = U("a1");
const ACTOR_FREE = U("a2");
// D1 exposure pool: eleven candidates plus the other actor, so the Premium cap of ten truncates.
const POOL = Array.from({ length: 11 }, (_, index) => U(`10${String(index + 1).padStart(2, "0")}`));
const E_SAME = U("2001"), E_DATE = U("2002"), E_MEAL = U("2003"), E_R1 = U("2004"), E_R2 = U("2005");
const A_OK = U("3001"), A_BLOCK = U("3002"), A_NONPART = U("3003");
const M_OWNER = U("4001");
const I_SUBJECT = U("5001"), I_WIDE = U("5002"), I_EMPTY = U("5003"), I_DERIVED = U("5004");
const EVERY_USER = [ACTOR_PREMIUM, ACTOR_FREE, ...POOL, E_SAME, E_DATE, E_MEAL, E_R1, E_R2,
  A_OK, A_BLOCK, A_NONPART, M_OWNER, I_SUBJECT, I_WIDE, I_EMPTY, I_DERIVED];

const R1 = `sr2gd-restaurant-one-${MARKER}`;
const R2 = `sr2gd-restaurant-two-${MARKER}`;

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(condition ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  // A live suite that aborts mid-run would otherwise lose every detail it had already gathered.
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 600)}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only acceptance` }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

// The frozen SR-2A ranking authority the deployed function imports, loaded in process so the third
// ranking bucket — which valid Development data cannot produce — is still asserted against the exact
// module rather than a restatement of it.
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
function loadFrozenRanking() {
  const file = path.join(root, "supabase/functions/_shared/social-ranking/rankCandidates.ts");
  const cache = new Map();
  const loadOne = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    new Function("require", "module", "exports", outputText)(
      (specifier) => loadOne(path.resolve(path.dirname(absolute), specifier)), module, module.exports);
    return module.exports;
  };
  return loadOne(file);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}
async function trySql(query) {
  try { return { ok: true, rows: await sql(query) }; } catch (error) { return { ok: false, error: error.message }; }
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

const taipeiToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plusDays = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const D1 = plusDays(taipeiToday, 1);
const D2 = plusDays(taipeiToday, 2);
const D3 = plusDays(taipeiToday, 3);
const D4 = plusDays(taipeiToday, 4);
const D5 = plusDays(taipeiToday, 5);
const D6 = plusDays(taipeiToday, 6);

async function callEndpoint(name, token, body, extraHeaders = {}, method = "POST") {
  const res = await fetch(`${BASE}/${name}`, {
    method,
    headers: { apikey: anon, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...extraHeaders },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
  });
  let payload = null;
  try { payload = JSON.parse(await res.text()); } catch { payload = null; }
  return { status: res.status, payload };
}
// The Edge gateway occasionally answers 502/504 on a cold invocation. That is transport noise, not a
// product outcome, so a request whose answer the suite judges retries rather than being scored.
async function stable(name, token, body, extraHeaders = {}, attempts = 4) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await callEndpoint(name, token, body, extraHeaders);
    if (last.status !== 502 && last.status !== 504) return last;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  return last;
}
async function signIn(email, password) {
  const res = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const payload = await res.json();
  if (!payload.access_token) throw new Error("Development sign-in failed");
  return payload.access_token;
}

const person = (id, label) => `
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('${id}'::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','${id}@example.com','',now(),now())
on conflict (id) do nothing;
insert into public.consumer_profiles (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, status, public_bio, willing_to_chat)
values ('${id}'::uuid,'sr2gd_${label}','SR2GD ${label}','Anon ${label}','PB','active',${label === "a1" || label === "1001" ? "null" : `'bio ${label}'`}, ${label.startsWith("10") && Number(label.slice(2)) % 2 === 1 ? "false" : "true"})
on conflict (profile_id) do nothing;
insert into public.social_participation (user_id, state, opted_in_at)
values ('${id}'::uuid,'opted_in', timestamptz '2026-01-01T00:00:00Z')
on conflict (user_id) do nothing;`;

const card = (id, ownerId, { type = "general", intention = "chat_first", restaurant = null, date, period, createdAt = "now() - interval '1 hour'" }) => `
insert into public.meal_buddy_cards (id, owner_user_id, card_type, intention_type, restaurant_id, area, dining_date, meal_period, preferred_time, created_at, expires_at, cancelled_at)
values ('${id}'::uuid,'${ownerId}'::uuid,'${type}','${intention}',${restaurant === null ? "null" : `'${restaurant}'`},null,date '${date}','${period}',null, ${createdAt}, now() + interval '30 days', null);`;

const asUser = (id, statement) => `
set local role authenticated;
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
${statement}
reset role;`;

const setInterests = (id, general, food) => asUser(id, `
select public.replace_authenticated_social_interests('general', array[${general.map((t) => `'${t}'`).join(",")}]::text[]);
select public.replace_authenticated_social_interests('food', array[${food.map((t) => `'${t}'`).join(",")}]::text[]);`);

const tasteProfile = (id, tags) => `
insert into public.taste_profiles (user_id, preferred_cuisine_tags, preferred_meal_types, disliked_tastes, spice_preference, dining_style, payment_preference)
values ('${id}'::uuid, array[${tags.map((t) => `'${t}'`).join(",")}]::text[], array['lunch']::meal_type[], '{}'::text[], 'medium', 'casual', 'split')
on conflict (user_id) do nothing;`;

const cardId = (n) => `${MARKER}-0000-4000-9000-${String(n).padStart(12, "0")}`;
const names = (payload) => (payload?.candidates ?? []).map((c) => c.displayName);
const has = (payload, id, label) => names(payload).includes(`SR2GD ${label}`);
const byLabel = (payload, label) => (payload?.candidates ?? []).find((c) => c.displayName === `SR2GD ${label}`);

try {
  // --- fixtures ----------------------------------------------------------------------------------
  const password = `Sr2gd-${crypto.randomUUID()}`;
  for (const [id, label] of [[ACTOR_PREMIUM, "a1"], [ACTOR_FREE, "a2"]]) {
    const created = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, email: `${id}@example.com`, password, email_confirm: true })
    });
    if (!created.ok) throw new Error(`actor create failed (${label}): ${created.status} ${(await created.text()).slice(0, 200)}`);
  }
  fixturesCreated = true;

  const labelOf = new Map(EVERY_USER.map((id) => [id, id.slice(-4).replace(/^0+/, "") || "0"]));
  labelOf.set(ACTOR_PREMIUM, "a1");
  labelOf.set(ACTOR_FREE, "a2");
  POOL.forEach((id, index) => labelOf.set(id, `10${String(index + 1).padStart(2, "0")}`));
  for (const [id, label] of [[E_SAME, "2001"], [E_DATE, "2002"], [E_MEAL, "2003"], [E_R1, "2004"], [E_R2, "2005"],
    [A_OK, "3001"], [A_BLOCK, "3002"], [A_NONPART, "3003"], [M_OWNER, "4001"],
    [I_SUBJECT, "5001"], [I_WIDE, "5002"], [I_EMPTY, "5003"], [I_DERIVED, "5004"]]) labelOf.set(id, label);

  await sql(`begin;\n${EVERY_USER.map((id) => person(id, labelOf.get(id))).join("\n")}\ncommit;`);
  await sql(`
begin;
insert into public.restaurants (id, name, status) values ('${R1}','SR2GD Restaurant One','active') on conflict (id) do nothing;
insert into public.restaurants (id, name, status) values ('${R2}','SR2GD Restaurant Two','active') on conflict (id) do nothing;
insert into public.subscription_entitlements (user_id, plan_code, entitlement_source, status, valid_from, valid_until)
values ('${ACTOR_PREMIUM}'::uuid,'premium','sr2gd_acceptance','active', now() - interval '1 day', null);
-- 'paused' is the canonical non-participating state: the frozen authorization primitive admits only
-- 'opted_in', so a paused owner must never reach the candidate pool.
update public.social_participation set state = 'paused' where user_id = '${A_NONPART}'::uuid;
insert into public.social_blocks (blocker_user_id, blocked_user_id) values ('${A_BLOCK}'::uuid,'${ACTOR_PREMIUM}'::uuid);
commit;`);

  // Taste: the actor plus the first four pool candidates carry cuisine tags, so the frozen SR-1D
  // comparison genuinely scores them; every other candidate stays not_scored.
  await sql(`
begin;
${tasteProfile(ACTOR_PREMIUM, ["japanese", "italian", "thai", "korean"])}
${tasteProfile(POOL[0], ["japanese", "italian", "thai", "korean"])}
${tasteProfile(POOL[1], ["japanese", "italian", "thai"])}
${tasteProfile(POOL[2], ["japanese", "italian"])}
${tasteProfile(POOL[3], ["japanese"])}
commit;`);

  // Cards. Every actor source card and every candidate card is inserted directly so the eligibility
  // matrix is exactly controlled; the source REFERENCES still come from the real SR-2G-B list API.
  let sequence = 1;
  const statements = [];
  const sourceCards = {};
  const addSource = (actorId, key, options) => {
    const id = cardId(sequence++);
    sourceCards[key] = { id, actorId, ...options };
    statements.push(card(id, actorId, options));
  };
  addSource(ACTOR_PREMIUM, "mainPremium", { date: D1, period: "dinner" });
  addSource(ACTOR_FREE, "mainFree", { date: D1, period: "dinner" });
  addSource(ACTOR_PREMIUM, "generalD2", { date: D2, period: "lunch" });
  addSource(ACTOR_PREMIUM, "restaurantD2", { type: "restaurant", restaurant: R1, date: D2, period: "lunch" });
  addSource(ACTOR_PREMIUM, "authD3", { date: D3, period: "breakfast" });
  addSource(ACTOR_PREMIUM, "multiD4", { date: D4, period: "late_night" });
  addSource(ACTOR_PREMIUM, "interestD5", { date: D5, period: "breakfast" });
  addSource(ACTOR_PREMIUM, "emptyD6", { date: D6, period: "dinner" });
  // The actor's own second card on the authorization date: self must never be a candidate.
  statements.push(card(cardId(sequence++), ACTOR_PREMIUM, { date: D3, period: "breakfast", intention: "eat_together" }));

  // The highest-scoring candidate carries the restaurant card and the second-highest a general card
  // with the other intention: if card shape influenced ranking, those two would not stay adjacent at
  // the top in Taste order.
  POOL.forEach((id, index) => statements.push(card(cardId(sequence++), id, {
    date: D1, period: "dinner",
    type: index === 0 ? "restaurant" : "general",
    restaurant: index === 0 ? R1 : null,
    intention: index === 1 ? "eat_together" : "chat_first"
  })));
  statements.push(card(cardId(sequence++), E_SAME, { date: D2, period: "lunch" }));
  statements.push(card(cardId(sequence++), E_DATE, { date: D3, period: "lunch" }));
  statements.push(card(cardId(sequence++), E_MEAL, { date: D2, period: "dinner" }));
  statements.push(card(cardId(sequence++), E_R1, { type: "restaurant", restaurant: R1, date: D2, period: "lunch" }));
  statements.push(card(cardId(sequence++), E_R2, { type: "restaurant", restaurant: R2, date: D2, period: "lunch" }));
  statements.push(card(cardId(sequence++), A_OK, { date: D3, period: "breakfast" }));
  statements.push(card(cardId(sequence++), A_BLOCK, { date: D3, period: "breakfast" }));
  statements.push(card(cardId(sequence++), A_NONPART, { date: D3, period: "breakfast" }));
  // The multi-card owner: the NEWER card is the deterministic SR-2G-C choice.
  const MULTI_NEW = cardId(900);
  const MULTI_OLD = cardId(901);
  statements.push(card(MULTI_OLD, M_OWNER, { date: D4, period: "late_night", intention: "chat_first", createdAt: "now() - interval '5 hours'" }));
  statements.push(card(MULTI_NEW, M_OWNER, { date: D4, period: "late_night", intention: "eat_together", type: "restaurant", restaurant: R2, createdAt: "now() - interval '1 hour'" }));
  const INTEREST_CARD = cardId(910);
  statements.push(card(INTEREST_CARD, I_SUBJECT, { date: D5, period: "breakfast" }));
  statements.push(card(cardId(911), I_WIDE, { date: D5, period: "breakfast" }));
  statements.push(card(cardId(912), I_EMPTY, { date: D5, period: "breakfast" }));
  statements.push(card(cardId(913), I_DERIVED, { date: D5, period: "breakfast" }));
  await sql(`begin;\n${statements.join("\n")}\ncommit;`);

  // Interests. Current profile settings only; no card is ever touched by these writes.
  await sql(`
begin;
${setInterests(I_SUBJECT, ["general.entertainment.movie"], ["food.japanese.sushi"])}
${setInterests(I_WIDE, ["general.entertainment.movie", "general.gaming.console_gaming", "general.fitness_sports.fitness", "general.travel_outdoors.overseas_travel", "general.creative.photography"], ["food.japanese.sushi", "food.japanese.ramen", "food.dessert_drinks.coffee", "food.western.pizza", "food.korean.korean_bbq"])}
${setInterests(POOL[0], ["general.entertainment.movie", "general.entertainment.anime", "general.gaming.console_gaming", "general.fitness_sports.fitness", "general.travel_outdoors.overseas_travel", "general.creative.photography"], [])}
${setInterests(POOL[5], ["general.entertainment.movie", "general.entertainment.anime", "general.gaming.console_gaming", "general.fitness_sports.fitness", "general.travel_outdoors.overseas_travel", "general.creative.photography", "general.music.singing", "general.learning_culture.reading"], ["food.japanese.sushi", "food.korean.korean_bbq", "food.western.pizza", "food.dessert_drinks.coffee", "food.taiwanese_chinese.hotpot"])}
commit;`);
  // A candidate whose only signals are Taste, favorites and meal history: its interests must stay [].
  await sql(`
begin;
${tasteProfile(I_DERIVED, ["japanese", "italian"])}
insert into public.favorite_restaurants (user_id, restaurant_id) values ('${I_DERIVED}'::uuid, '${R1}') on conflict do nothing;
commit;`);

  const premiumToken = await signIn(`${ACTOR_PREMIUM}@example.com`, password);
  const freeToken = await signIn(`${ACTOR_FREE}@example.com`, password);

  // Source references come from the real frozen SR-2G-B list endpoint, never minted here.
  const refFor = async (token, predicate) => {
    const listed = await stable("meal-buddy-card-list", token, {});
    if (listed.status !== 200) throw new Error(`card list failed: ${listed.status}`);
    const match = listed.payload.cards.find(predicate);
    if (!match) throw new Error(`no source card matched: ${JSON.stringify(listed.payload.cards)}`);
    return match.sourceCardRef;
  };
  const REF = {
    mainPremium: await refFor(premiumToken, (c) => c.diningDate === D1 && c.mealPeriod === "dinner"),
    mainFree: await refFor(freeToken, (c) => c.diningDate === D1 && c.mealPeriod === "dinner"),
    generalD2: await refFor(premiumToken, (c) => c.diningDate === D2 && c.mealPeriod === "lunch" && c.cardType === "general"),
    restaurantD2: await refFor(premiumToken, (c) => c.diningDate === D2 && c.mealPeriod === "lunch" && c.cardType === "restaurant"),
    authD3: await refFor(premiumToken, (c) => c.diningDate === D3 && c.mealPeriod === "breakfast" && c.intentionType === "chat_first"),
    multiD4: await refFor(premiumToken, (c) => c.diningDate === D4 && c.mealPeriod === "late_night"),
    interestD5: await refFor(premiumToken, (c) => c.diningDate === D5 && c.mealPeriod === "breakfast"),
    emptyD6: await refFor(premiumToken, (c) => c.diningDate === D6 && c.mealPeriod === "dinner")
  };

  // ====== SOURCE REF ==============================================================================
  const main = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium });
  check("01 a valid owned active source reference succeeds",
    main.status === 200 && Array.isArray(main.payload?.candidates) && main.payload.candidates.length > 0,
    { status: main.status, count: main.payload?.candidates?.length });
  check("02 another actor's source reference is rejected",
    (await stable(ENDPOINT, freeToken, { sourceCardRef: REF.mainPremium })).status === 400);
  const candidateCardRef = main.payload.candidates[0].candidateCardRef;
  check("03 a candidate-purpose card reference is rejected as a source",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: candidateCardRef })).status === 400);
  check("04 a malformed reference is rejected",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: "mbc1.not-a-real-token" })).status === 400
    && (await stable(ENDPOINT, premiumToken, { sourceCardRef: "" })).status === 400);
  check("05 a tampered reference is rejected",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: `${REF.mainPremium.slice(0, -3)}ZZZ` })).status === 400);
  // A 24h TTL cannot be aged inside one run and the seal cannot be forged without the server secret.
  // Expiry is authenticated inside the sealed claims, so an altered expiry is an altered ciphertext:
  // this asserts exactly that, and the real clock-based expiry path is proven by the local smoke
  // against the same frozen SR-2G-A primitive the deployed function imports.
  check("06 a reference whose sealed claims are altered, expiry included, is rejected",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: `mbc1.${REF.mainPremium.slice(5).split("").reverse().join("")}` })).status === 400);
  await sql(`update public.meal_buddy_cards set cancelled_at = now() where id = '${sourceCards.emptyD6.id}'::uuid;`);
  const inactive = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.emptyD6 });
  check("07 a still-valid reference to an inactive source fails closed with no candidate and no detail",
    inactive.status === 200 && inactive.payload.candidates.length === 0
    && JSON.stringify(inactive.payload) === JSON.stringify({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [] }),
    inactive);

  // ====== CARD ELIGIBILITY =========================================================================
  const g2 = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.generalD2 });
  const r2 = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.restaurantD2 });
  check("08 a candidate on the same date and meal period is included", has(g2.payload, E_SAME, "2001"), names(g2.payload));
  check("09 a date mismatch is excluded", !has(g2.payload, E_DATE, "2002"));
  check("10 a meal period mismatch is excluded", !has(g2.payload, E_MEAL, "2003"));
  check("11 restaurant to restaurant at the same restaurant is included", has(r2.payload, E_R1, "2004"), names(r2.payload));
  check("12 restaurant to restaurant at a different restaurant is excluded", !has(r2.payload, E_R2, "2005"));
  check("13 a restaurant source and a general candidate are compatible", has(r2.payload, E_SAME, "2001"));
  check("14 a general source and a restaurant candidate are compatible",
    has(g2.payload, E_R1, "2004") && has(g2.payload, E_R2, "2005"));
  check("15 a general source and a general candidate are compatible", has(g2.payload, E_SAME, "2001"));

  // ====== AUTHORIZATION ============================================================================
  const auth = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.authD3 });
  check("16 a blocked owner is excluded", !has(auth.payload, A_BLOCK, "3002"), names(auth.payload));
  check("17 a non-participant owner is excluded", !has(auth.payload, A_NONPART, "3003"));
  check("18 the actor is never their own candidate",
    !has(auth.payload, ACTOR_PREMIUM, "a1") && has(auth.payload, A_OK, "3001"));

  // ====== MULTIPLE CARDS ===========================================================================
  const multi = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.multiD4 });
  const multiEntries = multi.payload.candidates.filter((c) => c.displayName === "SR2GD 4001");
  check("19 an owner holding two eligible cards appears exactly once", multiEntries.length === 1, multi.payload.candidates);
  check("20 the selected card is the SR-2G-C deterministic newest card",
    multiEntries[0]?.card.intentionType === "eat_together" && multiEntries[0]?.card.restaurant?.restaurantId === R2,
    multiEntries[0]?.card);
  const multiAgain = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.multiD4 });
  check("21 the selected card is stable across requests and unaffected by ranking",
    JSON.stringify(multiAgain.payload.candidates.map((c) => c.card)) === JSON.stringify(multi.payload.candidates.map((c) => c.card)));

  // ====== TASTE / RANK =============================================================================
  const order = names(main.payload);
  const rank = (label) => order.indexOf(`SR2GD ${label}`);
  check("22 scored candidates follow the Taste score, highest first",
    rank("1001") < rank("1002") && rank("1002") < rank("1003") && rank("1003") < rank("1004"), order);
  check("23 every not_scored candidate follows every scored candidate",
    rank("1004") < Math.min(...["1005", "1006", "1007", "1008"].map(rank)), order);
  const ranking = loadFrozenRanking();
  const bucket = (state) => (state === "unsupported"
    ? { status: "unsupported", reason: "unsupported_snapshot_schema", versions: {} }
    : { status: "adapted", versions: {}, taste: { similarity: state === "scored" ? { status: "scored", score: 0.5 } : { status: "not_scored", reason: "no_comparable_evidence" } } });
  const ordered = ranking.rankSocialCandidates([
    { candidateUserId: U("9003"), result: bucket("unsupported") },
    { candidateUserId: U("9002"), result: bucket("not_scored") },
    { candidateUserId: U("9001"), result: bucket("scored") }
  ]).ordered.map((entry) => entry.rankingState);
  check("24 unsupported follows not_scored in the frozen SR-2A authority the function imports",
    JSON.stringify(ordered) === JSON.stringify(["scored", "not_scored", "unsupported"]), ordered);
  // 1006 declares the most interests in the whole pool and is not_scored; a design that let interests
  // reach ranking would promote it above every scored candidate.
  check("25 interests never change the ranking order",
    rank("1006") > rank("1004") && rank("1006") > 0 && order.length === 10,
    { wideInterestCandidateRank: rank("1006"), lastScoredRank: rank("1004") });
  check("26 card type and intention never change the ranking order",
    rank("1001") === 0 && rank("1002") === 1
    && byLabel(main.payload, "1001").card.restaurant !== null
    && byLabel(main.payload, "1002").card.restaurant === null
    && byLabel(main.payload, "1001").card.intentionType !== byLabel(main.payload, "1002").card.intentionType,
    order);
  const premiumCandidate = await sql(`insert into public.subscription_entitlements (user_id, plan_code, entitlement_source, status, valid_from, valid_until)
    values ('${POOL[9]}'::uuid,'premium','sr2gd_acceptance','active', now() - interval '1 day', null) returning user_id;`);
  const afterPremiumCandidate = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium });
  check("27 a Premium candidate receives no rank boost",
    Boolean(premiumCandidate) && JSON.stringify(names(afterPremiumCandidate.payload)) === JSON.stringify(order),
    names(afterPremiumCandidate.payload));

  // ====== EXPOSURE =================================================================================
  check("28 a Premium actor is capped at ten", main.payload.candidates.length === 10, main.payload.candidates.length);
  await sql(`update public.subscription_entitlements set status = 'cancelled' where user_id = '${ACTOR_PREMIUM}'::uuid and entitlement_source = 'sr2gd_acceptance';`);
  const asFree = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium });
  check("29 the same actor without entitlement is capped at three", asFree.payload.candidates.length === 3, asFree.payload.candidates.length);
  check("30 the Free result is the exact prefix of the Premium result",
    JSON.stringify(names(asFree.payload)) === JSON.stringify(order.slice(0, 3)), { free: names(asFree.payload), premium: order.slice(0, 3) });
  await sql(`update public.subscription_entitlements set status = 'active' where user_id = '${ACTOR_PREMIUM}'::uuid and entitlement_source = 'sr2gd_acceptance';`);
  check("31 no pagination input is expressible",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, page: 2 })).status === 400
    && (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, cursor: "x" })).status === 400
    && (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, limit: 50 })).status === 400);
  const repeat = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium });
  check("32 the pool holds more candidates than the cap and nothing beyond the prefix is ever drawn",
    JSON.stringify(names(repeat.payload)) === JSON.stringify(order) && repeat.payload.candidates.length === 10
    && Number((await sql(`select count(*)::int as n from public.meal_buddy_cards where dining_date = date '${D1}' and meal_period = 'dinner' and cancelled_at is null;`))[0].n) > 11);

  // ====== PROFILE ==================================================================================
  const sample = main.payload.candidates[0];
  const serialized = JSON.stringify(main.payload);
  check("33 displayName comes from the frozen SR-2C projection", typeof sample.displayName === "string" && sample.displayName.startsWith("SR2GD "));
  check("34 mascotAvatarKey is projected", sample.mascotAvatarKey === "PB");
  check("35 publicBio is projected, including the null case",
    main.payload.candidates.every((c) => c.publicBio === null || typeof c.publicBio === "string")
    && main.payload.candidates.some((c) => typeof c.publicBio === "string"));
  check("36 willingToChat is projected and never filters",
    main.payload.candidates.every((c) => typeof c.willingToChat === "boolean")
    && main.payload.candidates.some((c) => c.willingToChat === false));
  check("37 no raw user uuid appears in any response", !EVERY_USER.some((id) => serialized.includes(id)));
  const profileIds = await sql(`select profile_id from public.consumer_profiles where user_id::text like '${MARKER}%';`);
  check("38 no profile id appears in any response", !profileIds.some((row) => serialized.includes(row.profile_id)));
  check("39 no Premium, verification, ranking or Taste fact appears",
    !/premium|entitlement|plan_code|verified|verification|rankingState|score|similarity|taste/i.test(serialized));

  // ====== INTERESTS ================================================================================
  const interests = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.interestD5 });
  const subject = byLabel(interests.payload, "5001");
  check("40 the candidate owner's CURRENT general profile interests are used",
    JSON.stringify(subject.interests.generalCategoryKeys) === JSON.stringify(["general.entertainment"]), subject.interests);
  check("41 the candidate owner's CURRENT food profile interests are used",
    JSON.stringify(subject.interests.foodCategoryKeys) === JSON.stringify(["food.japanese"]));
  const emptyInterests = byLabel(interests.payload, "5003");
  check("42 a candidate with no selections yields empty arrays and a zero overflow",
    JSON.stringify(emptyInterests.interests) === JSON.stringify({
      generalCategoryKeys: [], generalOverflowCount: 0, foodCategoryKeys: [], foodOverflowCount: 0
    }), emptyInterests.interests);
  const derived = byLabel(interests.payload, "5004");
  check("43 no interest is inferred for a candidate that declared none",
    derived.interests.generalCategoryKeys.length === 0 && derived.interests.foodCategoryKeys.length === 0);
  check("44 a Taste cuisine tag is never substituted for a declared food interest",
    !JSON.stringify(derived).includes("japanese") && !JSON.stringify(derived).includes("italian"));
  check("45 favorites and meal history never become interests",
    !JSON.stringify(derived).includes(R1) || derived.card.restaurant === null);

  // ====== COMPACT ==================================================================================
  const wide = byLabel(interests.payload, "5002");
  check("46 only top-level category keys are returned",
    [...wide.interests.generalCategoryKeys, ...wide.interests.foodCategoryKeys].every((key) => key.split(".").length === 2), wide.interests);
  const collapse = byLabel(main.payload, "1001");
  check("47 two fine tags under one category collapse to a single key",
    new Set(collapse.interests.generalCategoryKeys).size === collapse.interests.generalCategoryKeys.length
    && collapse.interests.generalCategoryKeys[0] === "general.entertainment"
    && collapse.interests.generalOverflowCount === 2, collapse.interests);
  const catalogOrder = await sql(`select tag_key from public.social_interest_catalog where namespace = 'general' and depth = 0 order by display_order, tag_key;`);
  const catalogSequence = catalogOrder.map((row) => row.tag_key);
  check("48 the visible order is the canonical catalog display order",
    wide.interests.generalCategoryKeys.every((key, index, all) =>
      index === 0 || catalogSequence.indexOf(all[index - 1]) < catalogSequence.indexOf(key)), { keys: wide.interests.generalCategoryKeys, catalogSequence });
  check("49 at most three general categories are visible", wide.interests.generalCategoryKeys.length === 3);
  check("50 the general overflow count is the derived remainder", wide.interests.generalOverflowCount === 2, wide.interests);
  check("51 at most three food categories are visible", wide.interests.foodCategoryKeys.length === 3);
  check("52 the food overflow count is the derived remainder", wide.interests.foodOverflowCount === 1, wide.interests);
  const persisted = await sql(`select count(*)::int as n from public.social_profile_interest_selection where tag_key like '%+%' or tag_key like '%overflow%';`);
  check("53 no '+N' marker is persisted anywhere",
    Number(persisted[0].n) === 0 && !JSON.stringify(interests.payload).includes("+"));
  const fineTags = await sql(`select tag_key from public.social_profile_interest_selection where user_id = '${I_WIDE}'::uuid;`);
  check("54 no fine-grained selection reaches the candidate DTO",
    fineTags.length === 10 && !fineTags.some((row) => JSON.stringify(interests.payload).includes(row.tag_key)),
    { canonicalSelections: fineTags.length });

  // ====== REFS =====================================================================================
  const rawCardIds = await sql(`select id::text from public.meal_buddy_cards where owner_user_id::text like '${MARKER}%';`);
  check("55 candidateRef is an opaque person reference under the frozen SR-2D authority",
    main.payload.candidates.every((c) => c.candidateRef.startsWith("scr1.") && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(c.candidateRef)));
  const seenByFree = await stable(ENDPOINT, freeToken, { sourceCardRef: REF.mainFree });
  const sharedName = names(seenByFree.payload).find((name) => order.includes(name));
  check("56 candidateRef is actor-bound: two actors never receive the same reference for one person",
    Boolean(sharedName)
    && byLabel(seenByFree.payload, sharedName.replace("SR2GD ", "")).candidateRef
      !== byLabel(main.payload, sharedName.replace("SR2GD ", "")).candidateRef);
  check("57 candidateCardRef is opaque under the frozen SR-2G-A authority",
    main.payload.candidates.every((c) => c.candidateCardRef.startsWith("mbc1.")
      && !rawCardIds.some((row) => c.candidateCardRef.includes(row.id))));
  check("58 candidateCardRef names the exact selected card, proven by its projected content",
    multiEntries[0].card.intentionType === "eat_together"
    && multiEntries[0].candidateCardRef.startsWith("mbc1.")
    && multiEntries[0].candidateCardRef !== REF.multiD4);
  check("59 source and candidate purposes are separated in both directions",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: multiEntries[0].candidateCardRef })).status === 400
    && (await callEndpoint("meal-buddy-card-cancel", premiumToken, { sourceCardRef: multiEntries[0].candidateCardRef })).status === 400);
  check("60 no raw identifier of any kind appears in a response",
    !rawCardIds.some((row) => serialized.includes(row.id)) && !EVERY_USER.some((id) => serialized.includes(id)));

  // ====== EMPTY ====================================================================================
  const emptyPool = await stable(ENDPOINT, freeToken, { sourceCardRef: await refFor(freeToken, (c) => c.diningDate === D1) });
  check("61 a legal zero-candidate result is HTTP 200", inactive.status === 200 && emptyPool.status === 200);
  check("62 the policy version is present on the empty result", inactive.payload.policyVersion === "meal-buddy-candidate-api-v1");
  check("63 the empty result carries an empty candidates array",
    Array.isArray(inactive.payload.candidates) && inactive.payload.candidates.length === 0
    && JSON.stringify(Object.keys(inactive.payload).sort()) === JSON.stringify(["candidates", "policyVersion"]));

  // ====== AUTHENTICATION AND METHOD ===============================================================
  check("64 an unauthenticated request is rejected with 401",
    (await callEndpoint(ENDPOINT, null, { sourceCardRef: REF.mainPremium })).status === 401);
  check("65 a non-POST verb is rejected",
    (await callEndpoint(ENDPOINT, premiumToken, undefined, {}, "GET")).status === 400);
  check("66 a caller-named actor is rejected in body and header",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, actorUserId: ACTOR_FREE })).status === 400
    && (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium }, { "x-actor-user-id": ACTOR_FREE })).status === 400);
  check("67 a caller-supplied eligibility, tier or clock input is rejected",
    (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, diningDate: D1 })).status === 400
    && (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, tier: "premium" })).status === 400
    && (await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.mainPremium, clock: new Date().toISOString() })).status === 400);
  check("68 a query parameter is rejected",
    (await (async () => {
      const res = await fetch(`${BASE}/${ENDPOINT}?limit=10`, {
        method: "POST",
        headers: { apikey: anon, Authorization: `Bearer ${premiumToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCardRef: REF.mainPremium })
      });
      return res.status;
    })()) === 400);

  // ====== RESTAURANT PROJECTION ====================================================================
  const restaurantCandidate = byLabel(main.payload, "1001");
  check("69 a restaurant card projects exactly the canonical identity and display name",
    JSON.stringify(restaurantCandidate.card.restaurant) === JSON.stringify({ restaurantId: R1, name: "SR2GD Restaurant One" }),
    restaurantCandidate.card);
  check("70 a general card projects no restaurant",
    main.payload.candidates.filter((c) => c.displayName !== "SR2GD 1001").every((c) => c.card.restaurant === null));
  check("71 the card context is exactly the four public fields",
    main.payload.candidates.every((c) => JSON.stringify(Object.keys(c.card).sort())
      === JSON.stringify(["diningDate", "intentionType", "mealPeriod", "restaurant"])));
  const restaurantColumns = await sql(`select column_name from information_schema.column_privileges
    where grantee = 'meal_buddy_candidate_pool_authority' and table_schema = 'public' and table_name = 'restaurants' order by column_name;`);
  check("72 the pool authority holds column privileges on exactly id and name",
    JSON.stringify([...new Set(restaurantColumns.map((row) => row.column_name))].sort()) === JSON.stringify(["id", "name"]),
    restaurantColumns);
  const restaurantPrivileges = await sql(`select distinct privilege_type from information_schema.column_privileges
    where grantee = 'meal_buddy_candidate_pool_authority' and table_schema = 'public' and table_name = 'restaurants';`);
  check("73 the pool authority holds SELECT on restaurants and nothing else",
    JSON.stringify(restaurantPrivileges.map((row) => row.privilege_type)) === JSON.stringify(["SELECT"]), restaurantPrivileges);
  const tableGrants = await sql(`select count(*)::int as n from information_schema.role_table_grants
    where grantee = 'meal_buddy_candidate_pool_authority' and table_schema = 'public' and table_name = 'restaurants';`);
  check("74 no whole-table restaurant grant exists for the pool authority", Number(tableGrants[0].n) === 0, tableGrants);
  const restaurantPolicies = await sql(`select polname, polcmd, polroles::regrole[]::text[] as roles from pg_policy
    where polrelid = 'public.restaurants'::regclass and polname = 'restaurants_meal_buddy_candidate_pool_read';`);
  check("75 the restaurant policy is SELECT only and scoped to the pool authority alone",
    restaurantPolicies.length === 1 && restaurantPolicies[0].polcmd === "r"
    && JSON.stringify(restaurantPolicies[0].roles) === JSON.stringify(["meal_buddy_candidate_pool_authority"]), restaurantPolicies);
  const clientRestaurantProbe = await trySql(`begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${ACTOR_PREMIUM}","role":"authenticated"}';
select social_internal.meal_buddy_candidate_cards_with_restaurant('${ACTOR_PREMIUM}'::uuid, '${sourceCards.mainPremium.id}'::uuid, now());
rollback;`);
  check("76 no client role may execute the bridge primitive", clientRestaurantProbe.ok === false, clientRestaurantProbe.error?.slice(0, 120));
  const membership = await sql(`select r.rolname, count(m.member)::int as rows,
      coalesce(bool_or(m.admin_option), false) as admin,
      coalesce(bool_or(m.inherit_option), false) as inherit,
      coalesce(bool_or(m.set_option), false) as set_option,
      coalesce(string_agg(distinct g.rolname, ','), '') as grantors
    from pg_roles r left join pg_auth_members m on m.roleid = r.oid
    left join pg_roles g on g.oid = m.grantor
    where r.rolname in ('meal_buddy_candidate_pool_authority','meal_buddy_card_write_authority','social_authority','social_pair_read_authority','social_profile_projection_authority','social_runtime_executor')
    group by r.rolname order by r.rolname;`);
  check("77 every Social authority keeps exactly one supabase_admin membership row with no borrowed privilege",
    membership.length === 6 && membership.every((row) => Number(row.rows) === 1 && row.grantors === "supabase_admin"
      && row.admin === true && row.inherit === false && row.set_option === false), membership);

  // ====== THE MANDATORY NO-SNAPSHOT LIVE TEST =======================================================
  const cardBefore = await sql(`select to_jsonb(c.*) as row from public.meal_buddy_cards c where c.id = '${INTEREST_CARD}'::uuid;`);
  check("78 before the settings change the candidate presents entertainment and japanese",
    JSON.stringify(subject.interests.generalCategoryKeys) === JSON.stringify(["general.entertainment"])
    && JSON.stringify(subject.interests.foodCategoryKeys) === JSON.stringify(["food.japanese"]));
  await sql(`begin;\n${setInterests(I_SUBJECT, ["general.creative.photography"], ["food.japanese.ramen"])}\ncommit;`);
  const afterSettings = await stable(ENDPOINT, premiumToken, { sourceCardRef: REF.interestD5 });
  const subjectAfter = byLabel(afterSettings.payload, "5001");
  const cardAfter = await sql(`select to_jsonb(c.*) as row from public.meal_buddy_cards c where c.id = '${INTEREST_CARD}'::uuid;`);
  check("79 the same unmodified card now presents creative and japanese",
    JSON.stringify(subjectAfter.interests.generalCategoryKeys) === JSON.stringify(["general.creative"])
    && JSON.stringify(subjectAfter.interests.foodCategoryKeys) === JSON.stringify(["food.japanese"]), subjectAfter.interests);
  check("80 the Meal Buddy card row is byte-identical before and after the settings change",
    JSON.stringify(cardBefore[0].row) === JSON.stringify(cardAfter[0].row));
  check("81 the same candidate card is still the selected card",
    JSON.stringify(subjectAfter.card) === JSON.stringify(subject.card), { before: subject.card, after: subjectAfter.card });
  check("82 the card carries no interest column and no interest snapshot table exists",
    !/interest|tag_key|hobby/i.test(JSON.stringify(cardAfter[0].row))
    && Number((await sql(`select count(*)::int as n from information_schema.tables where table_schema = 'public' and (table_name like '%interest%snapshot%' or table_name like '%card%interest%');`))[0].n) === 0);

  // ====== THE MANDATORY OVERFLOW TEST ===============================================================
  const canonicalGeneral = await sql(`select tag_key from public.social_profile_interest_selection where user_id = '${I_WIDE}'::uuid and namespace = 'general' order by tag_key;`);
  check("83 the candidate declares five distinct general categories",
    canonicalGeneral.length === 5, canonicalGeneral.map((row) => row.tag_key));
  check("84 the API returns exactly the first three in canonical catalog order with an overflow of two",
    JSON.stringify(wide.interests.generalCategoryKeys) === JSON.stringify(["general.entertainment", "general.gaming", "general.fitness_sports"])
    && wide.interests.generalOverflowCount === 2, wide.interests);
  check("85 the canonical profile still retains all five fine selections",
    canonicalGeneral.length === 5
    && Number((await sql(`select count(*)::int as n from public.social_profile_interest_selection where user_id = '${I_WIDE}'::uuid;`))[0].n) === 10);
  check("86 the food overflow case behaves identically",
    JSON.stringify(wide.interests.foodCategoryKeys) === JSON.stringify(["food.japanese", "food.korean", "food.western"])
    && wide.interests.foodOverflowCount === 1, wide.interests);

  console.log(JSON.stringify({
    suite: SUITE, status: failures.length === 0 ? "passed" : "failed", projectRef: DEV_REF,
    environment: "development", productionTouched: false,
    totalChecks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message, stack: error.stack?.split("\n").slice(0, 6) }, null, 2));
  failures.push({ name: "suite execution", pass: false, detail: error.message });
} finally {
  if (fixturesCreated) {
    await sql(`
begin;
delete from public.social_profile_interest_selection where user_id::text like '${MARKER}%';
delete from public.meal_buddy_cards where owner_user_id::text like '${MARKER}%';
delete from public.social_blocks where blocker_user_id::text like '${MARKER}%' or blocked_user_id::text like '${MARKER}%';
delete from public.social_participation where user_id::text like '${MARKER}%';
delete from public.subscription_entitlements where user_id::text like '${MARKER}%';
delete from public.favorite_restaurants where user_id::text like '${MARKER}%';
delete from public.taste_profiles where user_id::text like '${MARKER}%';
delete from public.consumer_profiles where user_id::text like '${MARKER}%';
delete from auth.users where id::text like '${MARKER}%';
delete from public.restaurants where id in ('${R1}','${R2}');
commit;`).catch(() => undefined);
    const residue = (await sql(`
      select (select count(*) from auth.users where id::text like '${MARKER}%') as users,
             (select count(*) from public.consumer_profiles where user_id::text like '${MARKER}%') as profiles,
             (select count(*) from public.social_participation where user_id::text like '${MARKER}%') as participation,
             (select count(*) from public.social_blocks where blocker_user_id::text like '${MARKER}%') as blocks,
             (select count(*) from public.meal_buddy_cards where owner_user_id::text like '${MARKER}%') as cards,
             (select count(*) from public.social_profile_interest_selection where user_id::text like '${MARKER}%') as interests,
             (select count(*) from public.taste_profiles where user_id::text like '${MARKER}%') as taste,
             (select count(*) from public.favorite_restaurants where user_id::text like '${MARKER}%') as favorites,
             (select count(*) from public.subscription_entitlements where user_id::text like '${MARKER}%') as entitlements,
             (select count(*) from public.restaurants where id in ('${R1}','${R2}')) as restaurants`).catch(() => [{}]))[0];
    const clean = Object.values(residue).every((value) => Number(value) === 0);
    console.log(`${clean ? "PASS" : "FAIL"} 87 zero fixture residue remains`);
    console.log(JSON.stringify({ suite: SUITE, residue, residueClean: clean }, null, 2));
    if (!clean) failures.push({ name: "87 zero fixture residue remains", pass: false, detail: residue });
  }
}

process.exit(failures.length === 0 ? 0 : 1);
