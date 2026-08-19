#!/usr/bin/env node
// SR-2G-E1 Development live acceptance for the real Mobile Meal Buddy candidate data layer.
//
// Nothing about the client is stubbed. The REAL @supabase/supabase-js installed under apps/mobile
// builds a REAL client, a REAL Development sign-in produces a REAL session, and the REAL Mobile
// repositories, service, shared validator and interest-catalog resolver then run against the
// deployed SR-2G-B and SR-2G-D endpoints. Only the auth PORT is adapted, because the frozen
// ConsumerAuthPort is a Mobile composition seam rather than part of this feature.
//
// Development only: the project ref is hard-guarded and Production is never referenced. Opt in with
// TASTKIND_SOCIAL_SR2G_E1_DEVELOPMENT_ACCEPTANCE=1.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const DEV_REF = "msbgnnoorsoefuiwluye";
const OPT_IN = "TASTKIND_SOCIAL_SR2G_E1_DEVELOPMENT_ACCEPTANCE";
const SUITE = "social-candidate-sr2g-e1-development-acceptance";
const FIXTURE = "meal-buddy-demo-v1";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(condition ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 500)}`);
}

if (process.env[OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: SUITE, status: "skipped", reason: `set ${OPT_IN}=1 to run this Development-only acceptance` }, null, 2));
  process.exit(0);
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN absent");

// --- real module graph -----------------------------------------------------------------------
const require_ = createRequire(import.meta.url);
const requireMobile = createRequire(path.join(root, "apps/mobile/package.json"));
const ts = require_("typescript");

const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (specifier === "@haocu/shared") return load(path.join(root, "packages/shared/src/index.ts"));
    if (!specifier.startsWith(".")) {
      for (const resolver of [requireMobile, require_]) {
        try { return resolver(specifier); } catch { /* next */ }
      }
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
const feature = load(path.join(featureRoot, "index.ts"));
const shared = load(path.join(root, "packages/shared/src/index.ts"));

// --- Development credentials and project keys ---------------------------------------------------
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
if (!anon) throw new Error("anon key unavailable");

const { createClient } = requireMobile("@supabase/supabase-js");
async function signedInClient(email) {
  const client = createClient(`https://${DEV_REF}.supabase.co`, anon, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: credentials.password });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}`);
  return client;
}
// The narrow slice of the frozen ConsumerAuthPort these repositories actually use.
const authPortFor = (client) => ({
  source: "supabase-live",
  async getCurrentSession() {
    const { data, error } = await client.auth.getSession();
    if (error) return { ok: false, error };
    return { ok: true, value: data.session };
  }
});
const LIVE_FLAGS = { candidateSource: "supabase-live", issues: [] };
const serviceFor = (client) => feature.createMealBuddyCandidateService(
  "supabase-live", true, { authPort: authPortFor(client), mealBuddyClient: client }, LIVE_FLAGS
);

try {
  const viewerClient = await signedInClient(credentials.viewerEmail);
  const viewerService = serviceFor(viewerClient);

  // --- 1. real source cards through the frozen SR-2G-B endpoint ---------------------------------
  const sourceCards = await viewerService.listSourceCards();
  check("01 the real card-list endpoint returns the actor's own source cards",
    sourceCards.ok && sourceCards.value.length > 0, sourceCards.ok ? sourceCards.value.length : sourceCards.error?.code);
  const general = sourceCards.value.find((card) => card.cardType === "general");
  check("02 every source card carries an opaque mbc1 reference and no raw identifier",
    sourceCards.value.every((card) => card.sourceCardRef.startsWith("mbc1.")
      && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/.test(card.sourceCardRef)));
  check("03 the adapted source card exposes only the fields needed to choose and send it",
    JSON.stringify(Object.keys(general).sort()) === JSON.stringify(
      ["cardType", "diningDate", "intentionType", "mealPeriod", "restaurantId", "sourceCardRef"]),
    Object.keys(general).sort());

  // --- 2. real candidates through the frozen SR-2G-D endpoint -------------------------------------
  const premium = await viewerService.listCandidates(general.sourceCardRef);
  check("04 the real candidate endpoint answers through the Mobile repository",
    premium.ok && premium.value.policyVersion === "meal-buddy-candidate-api-v1",
    premium.ok ? premium.value.policyVersion : premium.error?.code);
  const candidates = premium.value.candidates;
  check("05 a Premium viewer receives the server's exposure, never a client-chosen count",
    candidates.length === 10, candidates.length);

  // --- 3. shared DTO validation is the only trust boundary -----------------------------------------
  check("06 every candidate passed the exact shared validator",
    candidates.every((c) => Object.keys(c).length === 8));
  check("07 both references are opaque and carry the frozen family markers",
    candidates.every((c) => c.candidateRef.startsWith("scr1.") && c.candidateCardRef.startsWith("mbc1.")));
  check("08 a response carrying an unexpected field is rejected rather than rendered",
    shared.validateMealBuddyCandidateApiResponseV1({
      policyVersion: "meal-buddy-candidate-api-v1",
      candidates: [{ ...candidates[0], rankingState: "scored" }]
    }).ok === false);
  check("09 a response carrying a fine-grained interest tag is rejected",
    shared.validateMealBuddyCandidateApiResponseV1({
      policyVersion: "meal-buddy-candidate-api-v1",
      candidates: [{ ...candidates[0], interests: { ...candidates[0].interests, generalCategoryKeys: ["general.entertainment.movie"] } }]
    }).ok === false);
  check("10 a response longer than the frozen Premium cap is rejected, never trimmed",
    shared.validateMealBuddyCandidateApiResponseV1({
      policyVersion: "meal-buddy-candidate-api-v1",
      candidates: Array.from({ length: 11 }, (_, i) => ({ ...candidates[0], candidateRef: `scr1.x${i}` }))
    }).ok === false);
  check("11 a legal empty result is a valid success",
    shared.validateMealBuddyCandidateApiResponseV1({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [] }).ok === true);

  // --- 4. server order is authoritative -------------------------------------------------------------
  const repeat = await viewerService.listCandidates(general.sourceCardRef);
  check("12 the client preserves the server array order exactly",
    JSON.stringify(repeat.value.candidates.map((c) => c.displayName))
    === JSON.stringify(candidates.map((c) => c.displayName)),
    { first: candidates.map((c) => c.displayName), second: repeat.value.candidates.map((c) => c.displayName) });
  check("13 every request mints fresh references, so none is a stable identity",
    repeat.value.candidates[0].candidateRef !== candidates[0].candidateRef
    && repeat.value.candidates[0].candidateCardRef !== candidates[0].candidateCardRef);

  // --- 5. compact interests, labelled from the canonical catalog --------------------------------------
  const catalog = await feature.loadInterestCategoryLabels(viewerClient);
  check("14 the canonical SR-2C-R1 catalog labels load through the authenticated session",
    catalog.ok && catalog.value.size > 0, catalog.ok ? catalog.value.size : catalog.reason);
  check("15 a top-level category resolves to its canonical localized label",
    feature.resolveInterestCategoryLabel(catalog.value, "general.entertainment") !== "general.entertainment"
    && feature.resolveInterestCategoryLabel(catalog.value, "food.japanese") !== "food.japanese",
    {
      entertainment: feature.resolveInterestCategoryLabel(catalog.value, "general.entertainment"),
      japanese: feature.resolveInterestCategoryLabel(catalog.value, "food.japanese")
    });
  check("16 no compact line ever exceeds three visible categories",
    candidates.every((c) => c.interests.generalCategoryKeys.length <= 3 && c.interests.foodCategoryKeys.length <= 3));
  const overflowCandidate = candidates.find((c) => c.interests.generalOverflowCount > 0);
  check("17 an overflowing line renders three chips plus one +N chip, never a fourth category",
    Boolean(overflowCandidate) && (() => {
      const line = feature.buildCompactInterestLine(
        overflowCandidate.interests.generalCategoryKeys, overflowCandidate.interests.generalOverflowCount, catalog.value);
      return line.chips.length === 3 && line.overflowLabel === `+${overflowCandidate.interests.generalOverflowCount}`;
    })(), overflowCandidate?.interests);
  const plainCandidate = candidates.find((c) => c.interests.foodOverflowCount === 0);
  check("18 a line within the limit renders no overflow chip at all",
    feature.buildCompactInterestLine(plainCandidate.interests.foodCategoryKeys, plainCandidate.interests.foodOverflowCount, catalog.value)
      .overflowLabel === null);
  check("19 no fine-grained interest tag reaches the client model",
    candidates.every((c) => [...c.interests.generalCategoryKeys, ...c.interests.foodCategoryKeys]
      .every((key) => key.split(".").length === 2)));

  // --- 6. privacy ---------------------------------------------------------------------------------------
  const fixtureIds = (await sql(`select u.id::text as id from auth.users u where u.raw_app_meta_data->>'fixture' = '${FIXTURE}';`)).map((r) => r.id);
  const cardIds = (await sql(`select c.id::text as id from public.meal_buddy_cards c join auth.users u on u.id = c.owner_user_id where u.raw_app_meta_data->>'fixture' = '${FIXTURE}';`)).map((r) => r.id);
  const serialized = JSON.stringify(premium.value);
  check("20 no raw user or card identifier reaches the client",
    !fixtureIds.some((id) => serialized.includes(id)) && !cardIds.some((id) => serialized.includes(id)));
  check("21 no ranking, score or entitlement fact reaches the client",
    !/rankingState|exposureIndex|similarity|"score"|entitlement|plan_code|isPremium/i.test(serialized));

  // --- 7. source-card sensitivity ---------------------------------------------------------------------------
  const restaurantCards = sourceCards.value.filter((card) => card.cardType === "restaurant");
  const sensitivity = [];
  for (const card of [general, ...restaurantCards]) {
    const outcome = await viewerService.listCandidates(card.sourceCardRef);
    sensitivity.push({
      cardType: card.cardType,
      restaurantId: card.restaurantId,
      count: outcome.ok ? outcome.value.candidates.length : null,
      names: outcome.ok ? outcome.value.candidates.map((c) => c.displayName) : null
    });
  }
  check("22 a general source card reaches the whole compatible pool",
    sensitivity[0].count === 10, sensitivity[0]);
  check("23 the source card genuinely changes the server-returned candidate set",
    sensitivity.length === 1 || sensitivity.slice(1).some((entry) => JSON.stringify(entry.names) !== JSON.stringify(sensitivity[0].names)),
    sensitivity);

  // --- 8. distinguishable failure states ------------------------------------------------------------------------
  const bogus = await viewerService.listCandidates("mbc1.not-a-real-token");
  check("24 an invalid source reference is a typed error, never an empty list",
    bogus.ok === false && bogus.error.code === "invalid_request", bogus.ok ? "ok" : bogus.error.code);
  const notARef = await viewerService.listCandidates("00000000-0000-4000-8000-000000000001");
  check("25 a raw identifier is refused before any request is made",
    notARef.ok === false && notARef.error.code === "invalid_request");
  const signedOutClient = createClient(`https://${DEV_REF}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedOut = await serviceFor(signedOutClient).listCandidates(general.sourceCardRef);
  check("26 a signed-out session yields authentication_required, never candidates",
    signedOut.ok === false && signedOut.error.code === "authentication_required", signedOut.ok ? "ok" : signedOut.error.code);
  const disabled = feature.createMealBuddyCandidateService("mock", false, {}, { candidateSource: "disabled", issues: [] });
  const disabledOutcome = await disabled.listCandidates(general.sourceCardRef);
  check("27 an unconfigured runtime fails closed and never falls back to demo candidates",
    disabledOutcome.ok === false && disabledOutcome.error.code === "meal_buddy_candidates_disabled",
    disabledOutcome.ok ? "ok" : disabledOutcome.error.code);
  check("28 a live source is impossible without live auth",
    feature.getMealBuddyCandidateRuntimeFlags("mock", false, { EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_BUDDY_CANDIDATE_SOURCE: "supabase-live" }).issues.length > 0);
  check("29 a mock candidate source is not even representable",
    feature.getMealBuddyCandidateRuntimeFlags("supabase-live", true, { EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_BUDDY_CANDIDATE_SOURCE: "mock" }).candidateSource === "disabled");

  // --- 9. no-source-card is its own state ------------------------------------------------------------------------------
  const noCard = await viewerService.listCandidatesForOwnedCard(() => null);
  check("30 holding no active card is a distinct state, not an empty candidate list",
    noCard.ok === false && noCard.error.code === "no_source_card");
  const viaOwnedCard = await viewerService.listCandidatesForOwnedCard(
    (cards) => cards.find((card) => card.cardType === "general") ?? null);
  check("31 the end-to-end owned-card read returns the same server result",
    viaOwnedCard.ok && viaOwnedCard.value.candidates.length === 10);

  // --- 10. Asia/Taipei dining-date semantics -----------------------------------------------------------------------------
  const taipeiToday = (await sql("select (now() at time zone 'Asia/Taipei')::date::text as d;"))[0].d;
  check("32 the canonical helper agrees with the server's Asia/Taipei calendar date",
    feature.mealBuddyTaipeiDateKey() === taipeiToday, { client: feature.mealBuddyTaipeiDateKey(), server: taipeiToday });
  // 2026-08-19T00:30 Taipei is 2026-08-18T16:30Z: the old UTC-oriented key returned the previous day.
  const earlyMorning = new Date("2026-08-18T16:30:00.000Z");
  check("33 an early-morning Taipei instant no longer yields the previous UTC day",
    feature.mealBuddyTaipeiDateKey(earlyMorning) === "2026-08-19"
    && earlyMorning.toISOString().slice(0, 10) === "2026-08-18",
    { taipei: feature.mealBuddyTaipeiDateKey(earlyMorning), utc: earlyMorning.toISOString().slice(0, 10) });
  check("34 every server dining date is carried as an exact calendar string, never re-parsed",
    candidates.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.card.diningDate) && c.card.diningDate === general.diningDate));

  await viewerClient.auth.signOut();
  const afterSignOut = await viewerService.listCandidates(general.sourceCardRef);
  check("35 after sign-out the same service can no longer return candidates",
    afterSignOut.ok === false && afterSignOut.error.code === "authentication_required",
    afterSignOut.ok ? "ok" : afterSignOut.error.code);

  console.log(JSON.stringify({
    suite: SUITE, status: failures.length === 0 ? "passed" : "failed", projectRef: DEV_REF,
    environment: "development", productionTouched: false,
    diningDate: general.diningDate, mealPeriod: general.mealPeriod,
    premiumExposed: candidates.length, sensitivity,
    total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ suite: SUITE, error: error.message, stack: error.stack?.split("\n").slice(0, 6) }, null, 2));
  failures.push({ name: "suite execution", pass: false, detail: error.message });
}

process.exitCode = failures.length === 0 ? 0 : 1;
