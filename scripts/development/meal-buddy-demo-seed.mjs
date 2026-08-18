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
// Meal Buddy demo seed: 20 synthetic candidates plus one dedicated viewer.
//
// SCOPE. This script writes DATA ONLY. It creates no role, no policy, no function and no migration,
// and it changes no Social authority: participation, interests and Meal Buddy cards are all written
// through the frozen canonical write paths, and the SR-2B Free 3 / Premium 10 exposure caps are
// neither touched nor worked around. Twenty candidates form a POOL; the API still exposes at most
// three or ten of them.
//
// IDEMPOTENT. Identity is the deterministic e-mail plus a fixed uuid. A second run reuses every
// existing fixture and converges its profile, interests, taste sources and card rather than creating
// a duplicate: running twice yields exactly 20 candidates, never 40.
//
// SAFETY. The project ref is hard-pinned below and the script refuses to run against anything else.
// No secret is stored in this file: the management token comes from the environment and the project
// API keys are fetched at run time. The fixture password is generated on first run and kept in a
// gitignored local handoff file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository root, resolved from this file rather than the caller's working directory: these
// tools live in scripts/development/ and must behave identically however they are invoked.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------------------------
// 0. Hard environment pin. Development only; there is no "any project" mode.
// ---------------------------------------------------------------------------------------------
const DEV_REF = "msbgnnoorsoefuiwluye";
const REQUESTED_REF = process.env.TASTKIND_SEED_PROJECT_REF ?? DEV_REF;
if (REQUESTED_REF !== DEV_REF) {
  throw new Error(`refusing to seed: project ref must be exactly ${DEV_REF}, got ${REQUESTED_REF}`);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

const FIXTURE = "meal-buddy-demo-v1";
const EMAIL_DOMAIN = "development.invalid";
const UUID_PREFIX = "de300001-0000-4000-8000-";
const candidateId = (index) => `${UUID_PREFIX}${String(index).padStart(12, "0")}`;
const VIEWER_ID = `${UUID_PREFIX}${"99".padStart(12, "0")}`;
const VIEWER_EMAIL = `mealbuddy.viewer@${EMAIL_DOMAIN}`;
const CREDENTIALS_FILE = path.join(REPO_ROOT, "tmp", "meal-buddy-demo-credentials.json");

const log = (message) => console.log(message);

// ---------------------------------------------------------------------------------------------
// 1. Transport.
// ---------------------------------------------------------------------------------------------
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 500)}`);
  try { return JSON.parse(text); } catch { return text; }
}
const keysRes = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
});
const projectKeys = await keysRes.json();
const anon = projectKeys.find((entry) => entry.name === "anon")?.api_key;
const serviceRole = projectKeys.find((entry) => entry.name === "service_role")?.api_key;
if (!anon || !serviceRole) throw new Error("project API keys unavailable");

const authAdmin = (suffix, init = {}) => fetch(`https://${DEV_REF}.supabase.co/auth/v1/admin/users${suffix}`, {
  ...init,
  headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
});
async function callFunction(name, token, body, attempts = 4) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const res = await fetch(`https://${DEV_REF}.supabase.co/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    let payload = null;
    try { payload = JSON.parse(await res.text()); } catch { payload = null; }
    last = { status: res.status, payload };
    // 502/504 is Edge cold-start transport noise, never a product answer.
    if (res.status !== 502 && res.status !== 504) return last;
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  return last;
}
async function signIn(email, password) {
  const res = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const payload = await res.json();
  if (!payload.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(payload).slice(0, 200)}`);
  return payload.access_token;
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const textArray = (values) => `array[${values.map(quote).join(",")}]::text[]`;
// The canonical settings authority derives ownership from auth.uid() alone, so a fixture write must
// run as the real `authenticated` role carrying that user's claim.
const asUser = (id, statement) => `
set local role authenticated;
set local request.jwt.claims = '{"sub":"${id}","role":"authenticated"}';
${statement}
reset role;`;

// ---------------------------------------------------------------------------------------------
// 2. The dining occasion: tomorrow's Asia/Taipei calendar date, resolved at run time.
// ---------------------------------------------------------------------------------------------
const taipeiToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const [ty, tm, td] = taipeiToday.split("-").map(Number);
const DINING_DATE = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
const MEAL_PERIOD = "dinner";

// ---------------------------------------------------------------------------------------------
// 3. The twenty fictional profiles. Every interest key below is a real frozen catalog key.
// ---------------------------------------------------------------------------------------------
const G = (tag) => `general.${tag}`;
const F = (tag) => `food.${tag}`;
const CANDIDATES = [
  { n: 1, name: "阿澄", mascot: "PB", bio: "下班最喜歡找新餐廳，最近迷上日料。",
    general: [G("entertainment.movie"), G("entertainment.tv_series"), G("entertainment.anime")],
    food: [F("japanese.sushi"), F("japanese.ramen")],
    card: "general", intention: "chat_first", taste: ["japanese", "italian", "thai", "korean"] },
  { n: 2, name: "小夏", mascot: "DH", bio: "甜點控，最近開始學攝影。",
    general: [G("entertainment.movie"), G("gaming.console_gaming"), G("fitness_sports.fitness")],
    food: [F("dessert_drinks.dessert"), F("dessert_drinks.coffee"), F("dessert_drinks.bubble_tea")],
    card: "general", intention: "eat_together", taste: ["japanese", "italian", "thai"] },
  { n: 3, name: "Momo", mascot: "TE", bio: "喜歡拍照跟看書，週末常常在展覽。",
    general: [G("creative.photography"), G("creative.drawing"), G("learning_culture.reading"), G("learning_culture.technology")],
    food: [F("japanese.sushi"), F("korean.korean_bbq"), F("western.italian"), F("international.thai")],
    card: "restaurant", restaurant: "dev-restaurant-haochu", intention: "chat_first", taste: ["japanese", "italian"] },
  { n: 4, name: "阿岳", mascot: "BG", bio: "平日健身，假日爬山，吃飯不挑。",
    general: [G("fitness_sports.fitness"), G("fitness_sports.running"), G("fitness_sports.hiking"), G("fitness_sports.yoga")],
    food: [F("western.steak"), F("taiwanese_chinese.hotpot")],
    card: "general", intention: "eat_together", taste: null },
  { n: 5, name: "Nina", mascot: "VG", bio: "旅行時最大的行程通常是吃東西。",
    general: [G("travel_outdoors.overseas_travel"), G("travel_outdoors.camping"), G("creative.photography"), G("music.listening_music"), G("learning_culture.reading")],
    food: [F("ingredient_style.vegetarian_food"), F("dining_style.brunch"), F("dessert_drinks.coffee")],
    card: "general", intention: "chat_first", taste: ["japanese", "korean", "thai"] },
  { n: 6, name: "小宇", mascot: "MD", bio: "平常玩遊戲，假日喜歡找朋友吃飯。",
    general: [G("gaming.pc_gaming"), G("gaming.esports"), G("entertainment.movie")],
    food: [F("dining_style.late_night"), F("taiwanese_chinese.taiwanese_snacks"), F("ingredient_style.spicy_food")],
    card: "general", intention: "eat_together", taste: null },
  { n: 7, name: "Yuki", mascot: "DH", bio: "動漫、咖啡廳跟音樂祭，三個都不能少。",
    general: [G("entertainment.anime"), G("gaming.mobile_gaming"), G("lifestyle_social.cafes"), G("creative.photography"), G("music.music_festival")],
    food: [F("japanese.ramen"), F("japanese.izakaya"), F("japanese.sushi"), F("dessert_drinks.dessert"), F("dessert_drinks.bubble_tea")],
    card: "restaurant", restaurant: "synthetic-fixture-restaurant", intention: "chat_first", taste: ["japanese"] },
  { n: 8, name: "阿哲", mascot: "LC", bio: "跑步跟登山愛好者，很喜歡海鮮。",
    general: [G("fitness_sports.running"), G("fitness_sports.hiking"), G("learning_culture.technology")],
    food: [F("ingredient_style.seafood"), F("western.steak"), F("taiwanese_chinese.hotpot"), F("korean.korean_bbq")],
    card: "general", intention: "eat_together", taste: null },
  { n: 9, name: "Luna", mascot: "TE", bio: "愛看電影跟演唱會，也很愛下午茶。",
    general: [G("entertainment.movie"), G("music.concerts"), G("creative.drawing"), G("learning_culture.museums"), G("lifestyle_social.pets"), G("travel_outdoors.domestic_travel")],
    food: [F("dessert_drinks.cake"), F("dessert_drinks.afternoon_tea"), F("dining_style.brunch")],
    card: "general", intention: "chat_first", taste: ["italian", "thai"] },
  { n: 10, name: "小安", mascot: "BG", bio: "喜歡安靜的地方，看書配一碗好吃的。",
    general: [G("learning_culture.reading"), G("entertainment.movie"), G("fitness_sports.yoga")],
    food: [F("japanese.japanese_cuisine"), F("taiwanese_chinese.taiwanese_snacks")],
    card: "general", intention: "eat_together", taste: null },
  { n: 11, name: "Ray", mascot: "FF", bio: "桌遊跟密室逃脫都可以約，吃飯速度很快。",
    general: [G("gaming.board_games"), G("lifestyle_social.escape_rooms"), G("lifestyle_social.karaoke"), G("fitness_sports.ball_sports")],
    food: [F("western.pizza"), F("western.american"), F("korean.korean_fried_chicken"), F("dining_style.buffet")],
    card: "restaurant", restaurant: "dev-restaurant-haochu", intention: "chat_first", taste: ["korean", "american"] },
  { n: 12, name: "米米", mascot: "DH", bio: "逛街跟咖啡廳的常客，甜點是主食。",
    general: [G("lifestyle_social.shopping"), G("lifestyle_social.cafes"), G("entertainment.tv_series"), G("music.singing")],
    food: [F("dessert_drinks.dessert"), F("dessert_drinks.ice_cream"), F("dessert_drinks.bubble_tea"), F("dessert_drinks.cake")],
    card: "general", intention: "eat_together", taste: null },
  { n: 13, name: "Evan", mascot: "TE", bio: "喜歡科技也喜歡亂走，什麼都想試一次。",
    general: [G("learning_culture.technology"), G("gaming.pc_gaming"), G("travel_outdoors.city_exploration"), G("learning_culture.exhibitions"), G("creative.photography")],
    food: [F("japanese.sushi"), F("western.italian"), F("international.thai"), F("international.mexican"), F("taiwanese_chinese.hotpot")],
    card: "restaurant", restaurant: "synthetic-fixture-restaurant", intention: "chat_first", taste: ["japanese", "italian", "thai", "korean", "mexican"] },
  { n: 14, name: "晴晴", mascot: "VG", bio: "瑜珈跟手作的日常，吃得比較清爽。",
    general: [G("fitness_sports.yoga"), G("fitness_sports.swimming"), G("creative.handicraft")],
    food: [F("ingredient_style.vegetarian_food"), F("dining_style.brunch")],
    card: "general", intention: "eat_together", taste: null },
  { n: 15, name: "Leo", mascot: "PB", bio: "健身完最期待的就是一頓好肉。",
    general: [G("fitness_sports.fitness"), G("fitness_sports.ball_sports"), G("gaming.esports"), G("travel_outdoors.overseas_travel")],
    food: [F("ingredient_style.meat_lover"), F("western.steak"), F("japanese.yakiniku"), F("korean.korean_bbq")],
    card: "restaurant", restaurant: "dev-restaurant-haochu", intention: "eat_together", taste: ["steakhouse", "korean"] },
  { n: 16, name: "小葵", mascot: "BG", bio: "跟貓一起生活，最近在畫畫。",
    general: [G("lifestyle_social.pets"), G("creative.drawing"), G("travel_outdoors.domestic_travel"), G("music.listening_music")],
    food: [F("taiwanese_chinese.taiwanese_snacks"), F("taiwanese_chinese.stir_fry")],
    card: "general", intention: "chat_first", taste: null },
  { n: 17, name: "Ian", mascot: "MD", bio: "深夜的居酒屋跟老電影最搭。",
    general: [G("entertainment.movie"), G("learning_culture.history"), G("music.instruments")],
    food: [F("dining_style.late_night"), F("japanese.izakaya"), F("ingredient_style.spicy_food")],
    card: "general", intention: "eat_together", taste: ["japanese", "izakaya"] },
  { n: 18, name: "可可", mascot: "DH", bio: "咖啡廳寫東西，一坐就是一下午。",
    general: [G("lifestyle_social.cafes"), G("creative.writing"), G("learning_culture.reading")],
    food: [F("dessert_drinks.coffee"), F("dessert_drinks.afternoon_tea"), F("dessert_drinks.cake"), F("dessert_drinks.dessert"), F("dessert_drinks.ice_cream")],
    card: "general", intention: "chat_first", taste: null },
  { n: 19, name: "Ryan", mascot: "FF", bio: "手遊跟綜藝的忠實觀眾，很愛揪團。",
    general: [G("gaming.mobile_gaming"), G("entertainment.variety_show"), G("lifestyle_social.social_gatherings"), G("fitness_sports.running"), G("travel_outdoors.camping")],
    food: [F("western.american"), F("western.pizza"), F("dining_style.buffet")],
    card: "restaurant", restaurant: "synthetic-fixture-restaurant", intention: "eat_together", taste: ["american", "pizza"] },
  { n: 20, name: "沐沐", mascot: "VG", bio: "看展、手作，然後找一間沒吃過的店。",
    general: [G("learning_culture.museums"), G("learning_culture.exhibitions"), G("creative.handicraft"), G("fitness_sports.hiking")],
    food: [F("ingredient_style.vegetarian_food"), F("international.southeast_asian"), F("international.indian"), F("taiwanese_chinese.hong_kong")],
    card: "general", intention: "chat_first", taste: ["vegetarian", "thai"] }
];
const VIEWER = {
  name: "好廚示範帳號", mascot: "TE", bio: "Development 示範用的看板帳號。",
  taste: ["japanese", "italian", "thai", "korean"]
};

// ---------------------------------------------------------------------------------------------
// 4. Stable fixture credential, kept out of source and out of git.
// ---------------------------------------------------------------------------------------------
function loadOrCreateCredential() {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    const stored = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf8"));
    if (typeof stored.password === "string" && stored.password.length >= 24) return stored.password;
  }
  // Synthetic Development-only credential. It never belongs to a real person and is never a reused
  // password: a fresh CSPRNG value is minted the first time and then kept stable for Mobile login.
  const password = `Mbd-${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
  fs.writeFileSync(CREDENTIALS_FILE, `${JSON.stringify({
    fixture: FIXTURE,
    projectRef: DEV_REF,
    note: "Development-only synthetic fixture credential. Not a real user. Local handoff only; tmp/ is gitignored.",
    emailDomain: EMAIL_DOMAIN,
    viewerEmail: VIEWER_EMAIL,
    candidateEmails: CANDIDATES.map((c) => `mealbuddy.demo.${String(c.n).padStart(2, "0")}@${EMAIL_DOMAIN}`),
    password
  }, null, 2)}\n`, "utf8");
  return password;
}
const PASSWORD = loadOrCreateCredential();

// ---------------------------------------------------------------------------------------------
// 5. Auth identity: reuse by e-mail, create with the deterministic uuid, converge the password.
// ---------------------------------------------------------------------------------------------
const existingByEmail = new Map();
for (let page = 1; page <= 20; page += 1) {
  const res = await authAdmin(`?page=${page}&per_page=200`);
  if (!res.ok) throw new Error(`admin list failed: ${res.status}`);
  const { users } = await res.json();
  if (!users || users.length === 0) break;
  for (const user of users) existingByEmail.set(user.email, user);
  if (users.length < 200) break;
}

async function ensureAuthUser(email, desiredId) {
  const existing = existingByEmail.get(email);
  if (existing) {
    const res = await authAdmin(`/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true, app_metadata: { fixture: FIXTURE } })
    });
    if (!res.ok) throw new Error(`admin update failed for ${email}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return { id: existing.id, created: false };
  }
  const res = await authAdmin("", {
    method: "POST",
    body: JSON.stringify({
      id: desiredId, email, password: PASSWORD, email_confirm: true,
      app_metadata: { fixture: FIXTURE }
    })
  });
  if (!res.ok) throw new Error(`admin create failed for ${email}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { id: (await res.json()).id, created: true };
}

const identities = [];
let createdCount = 0;
for (const candidate of CANDIDATES) {
  const email = `mealbuddy.demo.${String(candidate.n).padStart(2, "0")}@${EMAIL_DOMAIN}`;
  const { id, created } = await ensureAuthUser(email, candidateId(candidate.n));
  if (created) createdCount += 1;
  identities.push({ ...candidate, email, id, created });
}
const viewerAuth = await ensureAuthUser(VIEWER_EMAIL, VIEWER_ID);
if (viewerAuth.created) createdCount += 1;
const viewer = { ...VIEWER, email: VIEWER_EMAIL, id: viewerAuth.id, created: viewerAuth.created, n: 99 };
log(`auth identities: ${identities.length + 1} total, ${createdCount} created, ${identities.length + 1 - createdCount} reused`);

// ---------------------------------------------------------------------------------------------
// 6. Public profile, canonical participation, canonical interests, canonical taste sources.
// ---------------------------------------------------------------------------------------------
// consumer_profiles carries no unique constraint on user_id, so ON CONFLICT is not expressible here.
// The reconciliation is delete-then-insert, scoped to the fixture's own user_id and nothing else.
const profileReconcile = (person, isViewer) => `
delete from public.consumer_profiles where user_id = '${person.id}'::uuid;
insert into public.consumer_profiles
  (user_id, profile_id, display_name, anonymous_display_name, mascot_avatar_key, status, public_bio, willing_to_chat, visibility, locale, timezone)
values (
  '${person.id}'::uuid,
  ${quote(isViewer ? "mealbuddy_demo_viewer" : `mealbuddy_demo_${String(person.n).padStart(2, "0")}`)},
  ${quote(person.name)},
  ${quote(isViewer ? "示範看板" : `好廚夥伴 ${String(person.n).padStart(2, "0")}`)},
  ${quote(person.mascot)}, 'active', ${quote(person.bio)}, true, 'public', 'zh-TW', 'Asia/Taipei'
);`;

const everyone = [...identities, viewer];
const profileSql = everyone.map((person) => profileReconcile(person, person.n === 99)).join("\n");
await sql(`begin;\n${profileSql}\ncommit;`);
log(`public profiles reconciled: ${everyone.length}`);

// Participation and interests both go through the frozen canonical RPCs, executed as the user.
const participationSql = everyone
  .map((person) => asUser(person.id, "select public.opt_in_authenticated_social_participation();"))
  .join("\n");
await sql(`begin;\n${participationSql}\ncommit;`);
log(`canonical Social opt-in performed for ${everyone.length} identities`);

const interestSql = identities.map((person) => asUser(person.id, `
select public.replace_authenticated_social_interests('general', ${textArray(person.general)});
select public.replace_authenticated_social_interests('food', ${textArray(person.food)});`)).join("\n");
await sql(`begin;\n${interestSql}\ncommit;`);
log(`canonical interest settings written for ${identities.length} candidates`);

// Taste SOURCE data only — the user's own declared cuisine preferences. No score is fabricated and
// SR-2A is untouched: the frozen SR-1D comparison derives everything from these rows.
const tasteRows = [...identities.filter((person) => person.taste !== null), viewer];
const tasteSql = tasteRows.map((person) => `
delete from public.taste_profiles where user_id = '${person.id}'::uuid;
insert into public.taste_profiles (user_id, preferred_cuisine_tags, preferred_meal_types, disliked_tastes, spice_preference, dining_style, payment_preference)
values ('${person.id}'::uuid, ${textArray(person.taste)}, array['dinner']::meal_type[], '{}'::text[], 'medium', 'casual', 'split');`).join("\n");
await sql(`begin;\n${tasteSql}\ncommit;`);
log(`taste source rows: ${tasteRows.length} (${identities.filter((p) => p.taste !== null).length} candidates + viewer), ${identities.filter((p) => p.taste === null).length} candidates deliberately without`);

// The viewer's Premium entitlement, through the canonical entitlement table the frozen SR-2B
// resolver reads. No entitlement logic is changed and nothing is faked in the API.
await sql(`
begin;
delete from public.subscription_entitlements where user_id = '${viewer.id}'::uuid and entitlement_source = ${quote(FIXTURE)};
insert into public.subscription_entitlements (user_id, plan_code, entitlement_source, status, valid_from, valid_until)
values ('${viewer.id}'::uuid, 'premium', ${quote(FIXTURE)}, 'active', now() - interval '1 day', null);
commit;`);
log("viewer Premium entitlement reconciled");

// ---------------------------------------------------------------------------------------------
// 7. Meal Buddy cards, written through the REAL frozen SR-2G-B create endpoint.
// ---------------------------------------------------------------------------------------------
// 503 is the endpoints' opaque "infrastructure unavailable" answer, and back-to-back cold Supavisor
// connections do occasionally produce one. A LIST is a safe read and is simply retried. A CREATE is
// not retried blindly: the list is re-read first, so a create that actually landed before the error
// is recognised as an existing card instead of being issued twice.
async function listOwnCards(person, token, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const listed = await callFunction("meal-buddy-card-list", token, {});
    if (listed.status === 200) return listed.payload.cards;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`card list unavailable for ${person.email} after ${attempts} attempts`);
}
async function ensureCard(person, spec) {
  const token = await signIn(person.email, PASSWORD);
  const matches = (card) =>
    card.diningDate === DINING_DATE && card.mealPeriod === MEAL_PERIOD && card.cardType === spec.cardType;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = (await listOwnCards(person, token)).find(matches);
    if (existing) return { token, sourceCardRef: existing.sourceCardRef, created: attempt > 0 };
    const created = await callFunction("meal-buddy-card-create", token, {
      cardType: spec.cardType,
      intentionType: spec.intentionType,
      restaurantId: spec.restaurantId ?? null,
      area: null,
      diningDate: DINING_DATE,
      mealPeriod: MEAL_PERIOD,
      preferredTime: null
    });
    if (created.status === 200) return { token, sourceCardRef: created.payload.card.sourceCardRef, created: true };
    if (created.status !== 503) {
      throw new Error(`card create failed for ${person.email}: ${created.status} ${JSON.stringify(created.payload).slice(0, 200)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`card create unavailable for ${person.email}`);
}

let cardsCreated = 0;
let cardsReused = 0;
for (const person of identities) {
  const outcome = await ensureCard(person, {
    cardType: person.card,
    intentionType: person.intention,
    restaurantId: person.card === "restaurant" ? person.restaurant : null
  });
  if (outcome.created) cardsCreated += 1; else cardsReused += 1;
}
const viewerCard = await ensureCard(viewer, { cardType: "general", intentionType: "chat_first" });
log(`candidate cards: ${cardsCreated} created, ${cardsReused} reused; viewer source card ${viewerCard.created ? "created" : "reused"}`);

// ---------------------------------------------------------------------------------------------
// 8. Verification through the real pipeline, never through table reads.
// ---------------------------------------------------------------------------------------------
const viewerToken = await signIn(viewer.email, PASSWORD);
const listed = await callFunction("meal-buddy-card-list", viewerToken, {});
const sourceCardRef = listed.payload.cards.find((card) =>
  card.diningDate === DINING_DATE && card.mealPeriod === MEAL_PERIOD && card.cardType === "general").sourceCardRef;
const response = await callFunction("meal-buddy-candidate-list", viewerToken, { sourceCardRef });

const report = {
  projectRef: DEV_REF,
  fixture: FIXTURE,
  diningDate: DINING_DATE,
  mealPeriod: MEAL_PERIOD,
  candidates: identities.length,
  authCreated: createdCount,
  cardsCreated,
  cardsReused,
  viewerEmail: viewer.email,
  credentialsFile: path.relative(REPO_ROOT, CREDENTIALS_FILE),
  apiStatus: response.status,
  apiCandidateCount: response.payload?.candidates?.length ?? null,
  productionTouched: false
};
fs.writeFileSync(path.join(REPO_ROOT, "tmp", "meal-buddy-demo-seed-report.json"),
  `${JSON.stringify({ ...report, response: response.payload }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
