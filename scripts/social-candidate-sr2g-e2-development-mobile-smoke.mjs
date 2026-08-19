#!/usr/bin/env node
// SR-2G-E2 Development live Mobile QA for the real Meal Buddy candidate screen.
//
// The REAL @supabase/supabase-js installed under apps/mobile builds a REAL client, a REAL
// Development sign-in produces a REAL session, and the REAL SR-2G-E1 service plus the REAL SR-2G-E2
// screen logic — the source-card selection rule, the compact interest line and the state
// classification — run against the deployed SR-2G-B and SR-2G-D endpoints. Nothing is stubbed.
//
// React itself is not mounted: the product rules live in the state machine and the compact-line
// model, and both are exercised directly here. The two cases that genuinely need a device are
// reported as such rather than silently claimed.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_E2_DEVELOPMENT_MOBILE_SMOKE=1.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_E2_DEVELOPMENT_MOBILE_SMOKE";
const SUITE = "social-candidate-sr2g-e2-development-mobile-smoke";
const FIXTURE = "meal-buddy-demo-v1";

const checks = [];
const failures = [];
const deviceOnly = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(condition ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}
function device(name, note) {
  deviceOnly.push({ name, note });
  console.log(`DEVICE ${name} — ${note}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only QA` }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

const require_ = createRequire(import.meta.url);
const requireMobile = createRequire(path.join(root, "apps/mobile/package.json"));
const ts = require_("typescript");
const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (specifier === "@haocu/shared") return load(path.join(root, "packages/shared/src/index.ts"));
    if (!specifier.startsWith(".")) {
      for (const resolver of [requireMobile, require_]) { try { return resolver(specifier); } catch { /* next */ } }
      throw new Error(`unresolved external: ${specifier}`);
    }
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const featureRoot = path.join(root, "apps/mobile/features/meal-buddy-candidates");
const factories = load(path.join(featureRoot, "factories.ts"));
const catalog = load(path.join(featureRoot, "interestCatalog.ts"));

const credentials = JSON.parse(fs.readFileSync(path.join(root, "tmp", "meal-buddy-demo-credentials.json"), "utf8"));
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}
const projectKeys = await (await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` }
})).json();
const anon = projectKeys.find((entry) => entry.name === "anon")?.api_key;

const { createClient } = requireMobile("@supabase/supabase-js");
async function signedInClient(email) {
  const client = createClient(`https://${DEV_REF}.supabase.co`, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: credentials.password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}`);
  return client;
}
const authPortFor = (client) => ({
  source: "supabase-live",
  async getCurrentSession() {
    const { data, error } = await client.auth.getSession();
    if (error) return { ok: false, error };
    return { ok: true, value: data.session };
  }
});
const LIVE = { candidateSource: "supabase-live", issues: [] };
const serviceFor = (client) => factories.createMealBuddyCandidateService(
  "supabase-live", true, { authPort: authPortFor(client), mealBuddyClient: client, catalogClient: client }, LIVE
);
// The REAL SR-2G-E2 selection rule: the reference the user picked from their own real card list is
// the source identity, forwarded verbatim. No field match, no positional pick, no fallback, and no
// client-side ownership lookup — the server re-verifies ownership on every request.
const selectByRef = (svc, sourceCardRef) => svc.listCandidates(sourceCardRef);

try {
  // ---- 1-3. authenticated load, real source cards, real candidates -----------------------------
  const viewerClient = await signedInClient(credentials.viewerEmail);
  const viewer = serviceFor(viewerClient);
  const cards = await viewer.listSourceCards();
  check("01 the authenticated screen resolves the actor's real source cards",
    cards.ok && cards.value.length > 0, cards.ok ? cards.value.length : cards.error?.code);
  const general = cards.value.find((c) => c.cardType === "general");
  check("02 a real general source card is available and carries an opaque reference",
    Boolean(general) && general.sourceCardRef.startsWith("mbc1."));
  const premium = await selectByRef(viewer, general.sourceCardRef);
  check("03 selecting that real card returns real candidates",
    premium.ok && premium.value.candidates.length > 0, premium.ok ? premium.value.candidates.length : premium.error?.code);

  // ---- 4-6. Premium exposure, server order, real fixture profiles --------------------------------
  const list = premium.value.candidates;
  check("04 a Premium viewer sees the server's exposure of up to ten", list.length === 10, list.length);
  const again = await selectByRef(viewer, general.sourceCardRef);
  check("05 the server order is preserved and stable across reads",
    JSON.stringify(again.value.candidates.map((c) => c.displayName)) === JSON.stringify(list.map((c) => c.displayName)),
    { first: list.map((c) => c.displayName), second: again.value.candidates.map((c) => c.displayName) });
  const fixtureNames = (await sql(`select p.display_name from public.consumer_profiles p join auth.users u on u.id = p.user_id where u.raw_app_meta_data->>'fixture' = '${FIXTURE}';`)).map((r) => r.display_name);
  check("06 every rendered name is a real Development fixture profile",
    list.every((c) => fixtureNames.includes(c.displayName)), list.map((c) => c.displayName));

  // ---- 7-8. mascots and bios -------------------------------------------------------------------------
  check("07 every candidate carries a mascot key the Mobile adapter can resolve",
    list.every((c) => typeof c.mascotAvatarKey === "string" && c.mascotAvatarKey.length === 2));
  check("08 bios render safely: a string or an explicit null, never undefined",
    list.every((c) => c.publicBio === null || (typeof c.publicBio === "string" && c.publicBio.length > 0)));

  // ---- 9-10. general and restaurant cards ---------------------------------------------------------------
  const generalCards = list.filter((c) => c.card.restaurant === null);
  const restaurantCards = list.filter((c) => c.card.restaurant !== null);
  check("09 general cards carry restaurant = null and render nothing for it", generalCards.length > 0);
  check("10 restaurant cards carry a canonical name, never a raw identifier",
    restaurantCards.length > 0 && restaurantCards.every((c) => typeof c.card.restaurant.name === "string" && c.card.restaurant.name.length > 0),
    restaurantCards.map((c) => c.card.restaurant));

  // ---- 11-15. compact interest lines through the real catalog ---------------------------------------------
  const labels = await catalog.loadInterestCategoryLabels(viewerClient);
  check("11 the canonical SR-2C-R1 catalog labels load through the authenticated session",
    labels.ok && labels.value.size > 0, labels.ok ? labels.value.size : labels.reason);
  const generalLines = list.map((c) => catalog.buildCompactInterestLine(
    c.interests.generalCategoryKeys, c.interests.generalOverflowCount, labels.value));
  const foodLines = list.map((c) => catalog.buildCompactInterestLine(
    c.interests.foodCategoryKeys, c.interests.foodOverflowCount, labels.value));
  check("12 the general interest line renders localized labels, never raw keys",
    generalLines.some((l) => l.chips.length > 0)
    && generalLines.every((l) => l.chips.every((chip) => !chip.includes("general."))),
    generalLines.map((l) => l.chips));
  check("13 the food interest line renders localized labels, never raw keys",
    foodLines.some((l) => l.chips.length > 0)
    && foodLines.every((l) => l.chips.every((chip) => !chip.includes("food."))),
    foodLines.map((l) => l.chips));
  const generalOverflow = generalLines.filter((l) => l.overflowLabel !== null);
  const foodOverflow = foodLines.filter((l) => l.overflowLabel !== null);
  check("14 at least one general line renders a +N overflow chip",
    generalOverflow.length > 0 && generalOverflow.every((l) => l.chips.length === 3 && /^\+\d+$/.test(l.overflowLabel)),
    generalOverflow);
  check("15 at least one food line renders a +N overflow chip",
    foodOverflow.length > 0 && foodOverflow.every((l) => l.chips.length === 3 && /^\+\d+$/.test(l.overflowLabel)),
    foodOverflow);
  check("16 no line ever exceeds three chips plus one overflow chip",
    [...generalLines, ...foodLines].every((l) => l.chips.length <= 3));

  // ---- 17-18. privacy ------------------------------------------------------------------------------------
  const serialized = JSON.stringify(premium.value);
  const rawUserIds = (await sql(`select id::text as id from auth.users where raw_app_meta_data->>'fixture' = '${FIXTURE}';`)).map((r) => r.id);
  const rawCardIds = (await sql(`select c.id::text as id from public.meal_buddy_cards c join auth.users u on u.id = c.owner_user_id where u.raw_app_meta_data->>'fixture' = '${FIXTURE}';`)).map((r) => r.id);
  check("17 no fine-grained interest tag reaches the screen",
    list.every((c) => [...c.interests.generalCategoryKeys, ...c.interests.foodCategoryKeys].every((k) => k.split(".").length === 2)));
  check("18 no raw user or card identifier reaches the screen",
    !rawUserIds.some((id) => serialized.includes(id)) && !rawCardIds.some((id) => serialized.includes(id)));
  check("19 both references stay opaque and are freshly minted per read",
    list.every((c) => c.candidateRef.startsWith("scr1.") && c.candidateCardRef.startsWith("mbc1."))
    && again.value.candidates[0].candidateRef !== list[0].candidateRef);

  // ---- 20-23. state paths --------------------------------------------------------------------------------------
  // A source reference is an actor-bound ciphertext, so one this actor does not hold cannot open
  // server-side. It is rejected, never silently resolved to some other card's pool.
  const foreignRef = await selectByRef(viewer, "mbc1.definitelyNotOneOfMyCards");
  check("20 a reference the actor does not hold never resolves to another card",
    foreignRef.ok === false, foreignRef.ok ? "ok" : foreignRef.error.code);
  const signedOut = serviceFor(createClient(`https://${DEV_REF}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } }));
  const authFail = await selectByRef(signedOut, general.sourceCardRef);
  check("21 a signed-out session yields the auth error state, never candidates",
    authFail.ok === false && authFail.error.code === "authentication_required");
  const disabled = factories.createMealBuddyCandidateService("mock", false, {}, { candidateSource: "disabled", issues: [] });
  check("22 an unconfigured runtime fails closed and never shows demo candidates",
    (await disabled.listCandidates(general.sourceCardRef)).error?.code === "meal_buddy_candidates_disabled");
  await viewerClient.auth.signOut();
  const afterSignOut = await selectByRef(viewer, general.sourceCardRef);
  check("23 after sign-out the same controller can no longer return candidates",
    afterSignOut.ok === false && afterSignOut.error.code === "authentication_required");

  // ---- 24. Free exposure ---------------------------------------------------------------------------------------------
  const freeClient = await signedInClient(credentials.candidateEmails[0]);
  const freeService = serviceFor(freeClient);
  const freeCards = await freeService.listSourceCards();
  const freeCard = freeCards.value[0];
  const free = await selectByRef(freeService, freeCard.sourceCardRef);
  check("24 a Free actor over the same Development pool sees at most three",
    free.ok && free.value.candidates.length === 3, free.ok ? free.value.candidates.length : free.error?.code);

  // ---- 25-27. source-card sensitivity ---------------------------------------------------------------------------------
  // Sensitivity only means anything if the actor holds MORE THAN ONE kind of real card, so the two
  // Development restaurant cards are provisioned here when absent. They are created through the REAL
  // frozen SR-2G-B create endpoint — never by a table write — and an existing card is reused, so the
  // selection under test is still an ordinary owned card the picker would render.
  const viewerAgain = await signedInClient(credentials.viewerEmail);
  const viewer2 = serviceFor(viewerAgain);
  let ownedCards = (await viewer2.listSourceCards()).value;
  const template = ownedCards[0];
  for (const restaurantId of ["dev-restaurant-haochu", "synthetic-fixture-restaurant"]) {
    if (ownedCards.some((card) => card.restaurantId === restaurantId)) continue;
    const { error } = await viewerAgain.functions.invoke("meal-buddy-card-create", {
      body: {
        cardType: "restaurant", intentionType: "chat_first", restaurantId, area: null,
        diningDate: template.diningDate, mealPeriod: template.mealPeriod, preferredTime: null
      }
    });
    if (error) console.log(`     note: restaurant card ${restaurantId} not provisioned (${error.name ?? error})`);
    ownedCards = (await viewer2.listSourceCards()).value;
  }
  const allCards = ownedCards;
  const sensitivity = [];
  for (const card of allCards) {
    const outcome = await selectByRef(viewer2, card.sourceCardRef);
    sensitivity.push({
      cardType: card.cardType, restaurantId: card.restaurantId, mealPeriod: card.mealPeriod,
      count: outcome.ok ? outcome.value.candidates.length : null,
      names: outcome.ok ? outcome.value.candidates.map((c) => c.displayName) : null
    });
  }
  check("25 every one of the actor's real cards produces a server answer",
    sensitivity.every((s) => s.count !== null), sensitivity);
  check("26 a general source card reaches the whole compatible pool",
    sensitivity.find((s) => s.cardType === "general")?.count === 10);
  check("27 different source cards genuinely produce different server results",
    new Set(sensitivity.map((s) => JSON.stringify(s.names))).size > 1, sensitivity.map((s) => ({ t: s.cardType, n: s.count })));

  // ---- device-only ---------------------------------------------------------------------------------------------------
  device("interest lines never wrap into a second chip row on a narrow device",
    "enforced structurally: interestRow has no flexWrap, chips flexShrink:1 with numberOfLines=1, overflow chip flexShrink:0 — visual confirmation still needs a device");
  device("the candidate card stays visually compact",
    "bio clamped to 2 lines and name/occasion/restaurant to 1 — visual confirmation still needs a device");

  console.log(JSON.stringify({
    suite: SUITE, status: failures.length === 0 ? "passed" : "failed", projectRef: DEV_REF,
    environment: "development", productionTouched: false,
    diningDate: general.diningDate, premiumExposed: list.length, freeExposed: free.value.candidates.length,
    sensitivity: sensitivity.map((s) => ({ cardType: s.cardType, restaurantId: s.restaurantId, count: s.count })),
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    deviceOnly, failures
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message, stack: error.stack?.split("\n").slice(0, 6) }, null, 2));
  failures.push({ name: "suite execution", pass: false, detail: error.message });
}

process.exitCode = failures.length === 0 ? 0 : 1;
