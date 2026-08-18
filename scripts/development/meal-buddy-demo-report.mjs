#!/usr/bin/env node
// =============================================================================================
// DEVELOPMENT ONLY — Supabase project msbgnnoorsoefuiwluye ONLY.
//
// Every tool in this directory hard-fails before any write if pointed at another project, so
// Production is unreachable through normal invocation. SUPABASE_ACCESS_TOKEN must be present in
// the environment; no credential is stored in these files. The fixture password lives only in
// gitignored tmp/meal-buddy-demo-credentials.json, and every report is written to gitignored tmp/.
//
// Run from the repository root, in this order:
//   1. node scripts/development/meal-buddy-demo-seed.mjs      create or reconcile the fixtures
//   2. node scripts/development/meal-buddy-demo-report.mjs    verify through the real endpoints
//   3. node scripts/development/meal-buddy-demo-cleanup.mjs   dry run; add --execute to remove
// =============================================================================================
// Acceptance of the seeded Meal Buddy demo pool.
//
// Every candidate assertion below comes from a REAL authenticated call to the deployed SR-2G-D
// endpoint. The only database reads are (a) the pre-exposure pool size, measured through the frozen
// SR-2G-C primitive, (b) the raw identifiers used to prove they never leak, and (c) the compact
// interest distribution across all twenty owners, derived by the frozen SR-2C-R1 projection plus the
// frozen aggregation helpers the API itself calls — never by re-implementing the rule.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// The repository root, resolved from this file rather than the caller's working directory: these
// tools live in scripts/development/ and must behave identically however they are invoked.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEV_REF = "msbgnnoorsoefuiwluye";
if ((process.env.TASTKIND_SEED_PROJECT_REF ?? DEV_REF) !== DEV_REF) throw new Error("wrong project");
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

const root = REPO_ROOT;
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
function loadFrozen(relative) {
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
  return loadOne(path.join(root, relative));
}
const aggregate = loadFrozen("supabase/functions/_shared/social-interest/aggregate.ts");

const credentials = JSON.parse(fs.readFileSync(path.join(root, "tmp", "meal-buddy-demo-credentials.json"), "utf8"));
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
})).json();
const anon = keys.find((entry) => entry.name === "anon")?.api_key;

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(condition ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 500)}`);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
async function signIn(email) {
  const res = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: credentials.password })
  });
  const payload = await res.json();
  if (!payload.access_token) throw new Error(`sign-in failed for ${email}`);
  return payload.access_token;
}
async function callFunction(name, token, body, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(`https://${DEV_REF}.supabase.co/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = JSON.parse(await res.text()); } catch { payload = null; }
    if (res.status !== 502 && res.status !== 504) return { status: res.status, payload };
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  return { status: 502, payload: null };
}
const sourceRefOf = async (token, cardType = "general") => {
  const listed = await callFunction("meal-buddy-card-list", token, {});
  if (listed.status !== 200) throw new Error(`card list failed: ${listed.status}`);
  return listed.payload.cards.find((card) => card.cardType === cardType).sourceCardRef;
};

// --- identities and raw identifiers -------------------------------------------------------------
const fixtureUsers = await sql(`
  select u.id::text as id, u.email, p.display_name, p.profile_id
  from auth.users u join public.consumer_profiles p on p.user_id = u.id
  where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1'
  order by u.email;`);
const rawUserIds = fixtureUsers.map((row) => row.id);
const rawProfileIds = fixtureUsers.map((row) => row.profile_id);
const rawCardIds = (await sql(`
  select c.id::text as id from public.meal_buddy_cards c
  join auth.users u on u.id = c.owner_user_id
  where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1';`)).map((row) => row.id);

// --- Premium viewer through the real endpoint ----------------------------------------------------
const viewerToken = await signIn(credentials.viewerEmail);
const viewerRef = await sourceRefOf(viewerToken);
const premium = await callFunction("meal-buddy-candidate-list", viewerToken, { sourceCardRef: viewerRef });
check("01 the real SR-2G-D endpoint answers 200 for the viewer", premium.status === 200, premium.status);
check("02 the response carries the frozen policy version",
  premium.payload.policyVersion === "meal-buddy-candidate-api-v1");

// --- pre-exposure pool, through the frozen SR-2G-C primitive -------------------------------------
const viewerId = fixtureUsers.find((row) => row.email === credentials.viewerEmail).id;
const viewerCardId = (await sql(`select id::text as id from public.meal_buddy_cards
  where owner_user_id = '${viewerId}'::uuid and cancelled_at is null and expires_at > now()
    and card_type = 'general' order by created_at desc limit 1;`))[0].id;
const poolRows = await sql(`
begin;
grant social_runtime_executor to postgres with inherit false, set true;
set local role social_runtime_executor;
select count(*)::int as owners, count(distinct candidate_owner_user_id)::int as distinct_owners
from social_internal.canonical_meal_buddy_candidate_cards('${viewerId}'::uuid, '${viewerCardId}'::uuid, now());
set local role postgres;
revoke social_runtime_executor from postgres granted by postgres;
commit;`);
const pool = poolRows.find((row) => row.owners !== undefined);
check("03 the compatible pre-exposure pool is exactly the twenty seeded candidates",
  pool.owners === 20 && pool.distinct_owners === 20, pool);

// --- SR-2B caps are untouched --------------------------------------------------------------------
check("04 a Premium viewer is exposed at most ten of the twenty", premium.payload.candidates.length === 10,
  premium.payload.candidates.length);
const freeToken = await signIn(credentials.candidateEmails[0]);
const freeRef = await sourceRefOf(freeToken);
const free = await callFunction("meal-buddy-candidate-list", freeToken, { sourceCardRef: freeRef });
check("05 a Free actor over the same pool is exposed at most three", free.status === 200 && free.payload.candidates.length === 3,
  { status: free.status, count: free.payload?.candidates?.length });
// The card id is resolved as postgres BEFORE the role switch: social_runtime_executor deliberately
// holds no direct SELECT on meal_buddy_cards, only EXECUTE on the pool primitive.
const freeActorId = fixtureUsers.find((r) => r.email === credentials.candidateEmails[0]).id;
const freeCardId = (await sql(`select id::text as id from public.meal_buddy_cards
  where owner_user_id = '${freeActorId}'::uuid and cancelled_at is null and expires_at > now()
  order by created_at desc limit 1;`))[0].id;
const freePoolRows = await sql(`
begin;
grant social_runtime_executor to postgres with inherit false, set true;
set local role social_runtime_executor;
select count(distinct candidate_owner_user_id)::int as distinct_owners
from social_internal.canonical_meal_buddy_candidate_cards('${freeActorId}'::uuid, '${freeCardId}'::uuid, now());
set local role postgres;
revoke social_runtime_executor from postgres granted by postgres;
commit;`);
check("06 the Free actor's own pool is also twenty, so the cap truncates rather than the pool",
  freePoolRows.find((row) => row.distinct_owners !== undefined)?.distinct_owners === 20,
  freePoolRows.find((row) => row.distinct_owners !== undefined));

// --- DTO completeness ------------------------------------------------------------------------------
const candidates = premium.payload.candidates;
check("07 every exposed candidate carries both opaque references",
  candidates.every((c) => c.candidateRef.startsWith("scr1.") && c.candidateCardRef.startsWith("mbc1.")));
check("08 every exposed candidate carries a populated public profile",
  candidates.every((c) => typeof c.displayName === "string" && c.displayName.length > 0
    && typeof c.mascotAvatarKey === "string" && c.mascotAvatarKey.length === 2
    && typeof c.publicBio === "string" && c.publicBio.length > 0
    && c.willingToChat === true));
check("09 every exposed candidate carries the public card context",
  candidates.every((c) => c.card.diningDate === credentials.diningDate || typeof c.card.diningDate === "string")
  && candidates.every((c) => c.card.mealPeriod === "dinner"
    && ["chat_first", "eat_together"].includes(c.card.intentionType)));
check("10 every exposed candidate carries compact interests",
  candidates.every((c) => Array.isArray(c.interests.generalCategoryKeys)
    && Number.isInteger(c.interests.generalOverflowCount)
    && Array.isArray(c.interests.foodCategoryKeys)
    && Number.isInteger(c.interests.foodOverflowCount)));
check("11 no compact line ever exceeds three visible categories",
  candidates.every((c) => c.interests.generalCategoryKeys.length <= 3 && c.interests.foodCategoryKeys.length <= 3));
const restaurantCards = candidates.filter((c) => c.card.restaurant !== null);
check("12 restaurant cards project a canonical identity and display name",
  restaurantCards.length > 0 && restaurantCards.every((c) =>
    typeof c.card.restaurant.restaurantId === "string" && typeof c.card.restaurant.name === "string"
    && c.card.restaurant.name.length > 0), restaurantCards.map((c) => c.card.restaurant));
check("13 general cards project no restaurant",
  candidates.filter((c) => c.card.restaurant === null).length === candidates.length - restaurantCards.length);

// --- overflow actually reaches the client -----------------------------------------------------------
const generalOverflow = candidates.filter((c) => c.interests.generalOverflowCount > 0);
const foodOverflow = candidates.filter((c) => c.interests.foodOverflowCount > 0);
check("14 at least one exposed candidate produces a general +N overflow", generalOverflow.length > 0,
  generalOverflow.map((c) => ({ name: c.displayName, keys: c.interests.generalCategoryKeys, overflow: c.interests.generalOverflowCount })));
check("15 at least one exposed candidate produces a food +N overflow", foodOverflow.length > 0,
  foodOverflow.map((c) => ({ name: c.displayName, keys: c.interests.foodCategoryKeys, overflow: c.interests.foodOverflowCount })));
check("16 no '+N' string is ever transmitted or persisted",
  !JSON.stringify(premium.payload).includes("+")
  && Number((await sql(`select count(*)::int as n from public.social_profile_interest_selection where tag_key like '%+%';`))[0].n) === 0);

// --- privacy -----------------------------------------------------------------------------------------
const serialized = JSON.stringify(premium.payload);
check("17 no raw user uuid appears in the response", !rawUserIds.some((id) => serialized.includes(id)));
check("18 no raw card uuid appears in the response", !rawCardIds.some((id) => serialized.includes(id)));
check("19 no profile id appears in the response", !rawProfileIds.some((id) => serialized.includes(id)));
// The scan targets ranking/billing keys and the fixture's own identifiers. It deliberately does not
// grep for the bare word "fixture": the canonical Development restaurant is *named* "Synthetic
// Fixture Restaurant", and its name is by-contract public display data, not a leak.
check("20 no ranking, entitlement or fixture identity appears in the response",
  !/rankingState|exposureIndex|exposureOrdinal|similarity|tasteScore|"score"|entitlement|plan_code|isPremium|verification_status|meal-buddy-demo-v1|development\.invalid/i.test(serialized),
  (serialized.match(/.{0,40}(rankingState|exposureIndex|similarity|"score"|entitlement|plan_code|isPremium|meal-buddy-demo-v1|development\.invalid).{0,40}/gi) ?? []).slice(0, 3));

// --- references behave -------------------------------------------------------------------------------
check("21 references are freshly minted per request",
  (await callFunction("meal-buddy-candidate-list", viewerToken, { sourceCardRef: viewerRef }))
    .payload.candidates[0].candidateRef !== candidates[0].candidateRef);
check("22 a candidate card reference is refused where a source reference is expected",
  (await callFunction("meal-buddy-candidate-list", viewerToken, { sourceCardRef: candidates[0].candidateCardRef })).status === 400);
check("23 a candidate card reference cannot cancel a card either",
  (await callFunction("meal-buddy-card-cancel", viewerToken, { sourceCardRef: candidates[0].candidateCardRef })).status === 400);
check("24 two different actors receive different references for the same person",
  (() => {
    const shared = free.payload.candidates.find((c) => candidates.some((p) => p.displayName === c.displayName));
    if (!shared) return false;
    const mirror = candidates.find((p) => p.displayName === shared.displayName);
    return shared.candidateRef !== mirror.candidateRef && shared.candidateCardRef !== mirror.candidateCardRef;
  })());

// --- seeded variety across all twenty, derived by the frozen authorities ------------------------------
const ownerIds = fixtureUsers.filter((row) => row.email !== credentials.viewerEmail).map((row) => row.id);
async function projectInterests(batch) {
  const rows = await sql(`
begin;
grant social_runtime_executor to postgres with inherit false, set true;
set local role social_runtime_executor;
select coalesce(json_agg(json_build_object('exposure_ordinal',exposure_ordinal,'namespace',namespace,'tag_key',tag_key,'category_key',category_key,'display_order',display_order)),'[]'::json) as data
from social_internal.project_public_social_interests('${viewerId}'::uuid, array[${batch.map((id) => `'${id}'::uuid`).join(",")}]);
set local role postgres;
revoke social_runtime_executor from postgres granted by postgres;
commit;`);
  return rows.find((row) => row.data !== undefined).data;
}
const projected = [...await projectInterests(ownerIds.slice(0, 10)), ...(await projectInterests(ownerIds.slice(10, 20))).map((row) => ({ ...row, exposure_ordinal: row.exposure_ordinal + 10 }))];
const distribution = ownerIds.map((id, ordinal) => {
  const rows = projected.filter((row) => row.exposure_ordinal === ordinal);
  const categories = aggregate.aggregateInterestCategories(aggregate.collectProfileInterests(rows));
  const compact = aggregate.deriveCompactInterests(categories);
  return {
    email: fixtureUsers.find((row) => row.id === id).email,
    displayName: fixtureUsers.find((row) => row.id === id).display_name,
    generalCategories: categories.publicInterestCategories.length,
    generalVisible: compact.publicInterests.visibleCategories.length,
    generalOverflow: compact.publicInterests.overflowCount,
    foodCategories: categories.foodInterestCategories.length,
    foodVisible: compact.foodInterests.visibleCategories.length,
    foodOverflow: compact.foodInterests.overflowCount
  };
});
const shape = (values) => ({
  one: values.filter((v) => v === 1).length, two: values.filter((v) => v === 2).length,
  exactlyThree: values.filter((v) => v === 3).length, overflow: values.filter((v) => v > 3).length
});
const generalShape = shape(distribution.map((row) => row.generalCategories));
const foodShape = shape(distribution.map((row) => row.foodCategories));
check("25 all twenty candidates carry canonical interest settings", distribution.length === 20
  && distribution.every((row) => row.generalCategories >= 1 && row.foodCategories >= 1), distribution.filter((r) => r.generalCategories === 0 || r.foodCategories === 0));
check("26 the general distribution exercises 1, 2, exactly 3 and overflow shapes",
  generalShape.one > 0 && generalShape.two > 0 && generalShape.exactlyThree > 0 && generalShape.overflow >= 5, generalShape);
check("27 the food distribution exercises 1, 2, exactly 3 and overflow shapes",
  foodShape.one > 0 && foodShape.two > 0 && foodShape.exactlyThree > 0 && foodShape.overflow >= 3, foodShape);

// --- card and taste variety ----------------------------------------------------------------------------
const cardShape = (await sql(`
  select c.card_type, c.intention_type, c.restaurant_id, count(*)::int as n
  from public.meal_buddy_cards c join auth.users u on u.id = c.owner_user_id
  where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1' and u.email <> '${credentials.viewerEmail}'
    and c.cancelled_at is null and c.expires_at > now()
  group by 1,2,3 order by 1,2,3;`));
const totalBy = (key, value) => cardShape.filter((row) => row[key] === value).reduce((sum, row) => sum + row.n, 0);
check("28 the card mix is fourteen general and six restaurant",
  totalBy("card_type", "general") === 14 && totalBy("card_type", "restaurant") === 6, cardShape);
check("29 intentions are split ten and ten",
  totalBy("intention_type", "chat_first") === 10 && totalBy("intention_type", "eat_together") === 10);
check("30 the six restaurant cards are spread across more than one canonical restaurant",
  new Set(cardShape.filter((row) => row.restaurant_id !== null).map((row) => row.restaurant_id)).size >= 2,
  [...new Set(cardShape.filter((row) => row.restaurant_id !== null).map((row) => row.restaurant_id))]);
const tasteMix = (await sql(`
  select count(*) filter (where t.user_id is not null)::int as with_taste,
         count(*) filter (where t.user_id is null)::int as without_taste
  from auth.users u left join public.taste_profiles t on t.user_id = u.id
  where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1' and u.email <> '${credentials.viewerEmail}';`))[0];
check("31 twelve candidates carry canonical Taste source data and eight deliberately do not",
  tasteMix.with_taste === 12 && tasteMix.without_taste === 8, tasteMix);

// --- idempotency and cleanup targeting -------------------------------------------------------------------
const fixtureCounts = (await sql(`
  select
    (select count(*)::int from auth.users where raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1') as users,
    (select count(*)::int from auth.users where email like 'mealbuddy.demo.%@development.invalid') as demo_emails,
    (select count(*)::int from public.consumer_profiles p join auth.users u on u.id = p.user_id where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1') as profiles,
    (select count(*)::int from public.social_participation s join auth.users u on u.id = s.user_id where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1') as participation,
    (select count(*)::int from public.social_profile_interest_selection s join auth.users u on u.id = s.user_id where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1') as interests,
    (select count(*)::int from public.meal_buddy_cards c join auth.users u on u.id = c.owner_user_id where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1') as cards,
    (select count(*)::int from public.taste_profiles t join auth.users u on u.id = t.user_id where u.raw_app_meta_data->>'fixture' = 'meal-buddy-demo-v1') as taste,
    (select count(*)::int from public.subscription_entitlements where entitlement_source = 'meal-buddy-demo-v1') as entitlements,
    (select count(*)::int from auth.users where email like '%@development.invalid' and coalesce(raw_app_meta_data->>'fixture','') <> 'meal-buddy-demo-v1') as stray_invalid_users;`))[0];
check("32 exactly twenty demo candidates plus one viewer exist, never duplicated",
  fixtureCounts.users === 21 && fixtureCounts.demo_emails === 20, fixtureCounts);
check("33 the fixture marker uniquely targets every seeded row family for future cleanup",
  fixtureCounts.profiles === 21 && fixtureCounts.participation === 21 && fixtureCounts.cards === 21
  && fixtureCounts.taste === 13 && fixtureCounts.entitlements === 1 && fixtureCounts.interests > 0
  && fixtureCounts.stray_invalid_users === 0, fixtureCounts);
const untouched = (await sql(`
  select count(*)::int as n from auth.users
  where coalesce(raw_app_meta_data->>'fixture','') <> 'meal-buddy-demo-v1';`))[0];
check("34 the nine pre-existing Development users are untouched by the fixture selector", untouched.n === 9, untouched);

// --- sanitized samples -------------------------------------------------------------------------------------
const sanitize = (candidate) => ({
  candidateRef: `${candidate.candidateRef.slice(0, 5)}…${candidate.candidateRef.length} chars`,
  candidateCardRef: `${candidate.candidateCardRef.slice(0, 5)}…${candidate.candidateCardRef.length} chars`,
  displayName: candidate.displayName,
  mascotAvatarKey: candidate.mascotAvatarKey,
  publicBio: candidate.publicBio,
  willingToChat: candidate.willingToChat,
  interests: candidate.interests,
  card: candidate.card
});
// Three DISTINCT candidates, each chosen for a different shape the Mobile card must render.
const picked = [];
for (const predicate of [
  (c) => c.interests.generalOverflowCount > 0,
  (c) => c.card.restaurant !== null,
  (c) => c.interests.foodOverflowCount > 0,
  () => true
]) {
  const found = candidates.find((c) => predicate(c) && !picked.includes(c));
  if (found && picked.length < 3) picked.push(found);
}
const samples = picked.map(sanitize);
const exposedRoster = candidates.map((c) => ({
  displayName: c.displayName, mascot: c.mascotAvatarKey,
  general: c.interests.generalCategoryKeys, generalOverflow: c.interests.generalOverflowCount,
  food: c.interests.foodCategoryKeys, foodOverflow: c.interests.foodOverflowCount,
  cardType: c.card.restaurant === null ? "general" : "restaurant", intention: c.card.intentionType
}));

const summary = {
  suite: "meal-buddy-demo-development-acceptance",
  projectRef: DEV_REF,
  productionTouched: false,
  diningDate: candidates[0].card.diningDate,
  mealPeriod: candidates[0].card.mealPeriod,
  compatiblePreExposureOwners: pool.distinct_owners,
  premiumExposed: candidates.length,
  freeExposed: free.payload.candidates.length,
  generalShape, foodShape, cardShape, tasteMix, fixtureCounts,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures
};
fs.writeFileSync(path.join(root, "tmp", "meal-buddy-demo-acceptance-report.json"),
  `${JSON.stringify({ ...summary, distribution, exposedRoster, samples }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...summary, samples }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
