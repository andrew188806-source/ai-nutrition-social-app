#!/usr/bin/env node
// SR-2G-E1 local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// The REAL Mobile repositories, service, shared validator, interest-catalog resolver and Taipei date
// helper all execute. Only the Supabase Functions client and the auth port are substituted, and no
// repository byte is modified. The live behaviour is proven separately by the Development acceptance.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

// --- module loader --------------------------------------------------------------------------------
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
    if (!specifier.startsWith(".")) return require_(specifier);
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

// --- fixtures ---------------------------------------------------------------------------------------
const SOURCE_REF = "mbc1.AAAAAAAAAAAAAAAAAAAAsourcegeneral";
const RESTAURANT_REF = "mbc1.AAAAAAAAAAAAAAAAAAAAsourcerestaurant";
// Person and card references are independently sealed ciphertexts on the server, so the fixture
// gives them unrelated bodies: sharing a suffix would make the "never derived from" assertion pass
// or fail for the wrong reason.
const ref = (prefix, body, index) => `${prefix}${body}${String(index).padStart(6, "0")}`;
const candidate = (index, overrides = {}) => ({
  candidateRef: ref("scr1.", "QmFzZTY0UGVyc29uQm9keQ", index),
  candidateCardRef: ref("mbc1.", "V2hvbGx5VW5yZWxhdGVkQ2FyZA", index),
  displayName: `Name ${index}`,
  mascotAvatarKey: "PB",
  publicBio: index === 0 ? null : `bio ${index}`,
  willingToChat: index % 2 === 0,
  interests: {
    generalCategoryKeys: ["general.entertainment", "general.gaming", "general.fitness_sports"],
    generalOverflowCount: index === 0 ? 2 : 0,
    foodCategoryKeys: ["food.japanese"],
    foodOverflowCount: 0,
    ...(overrides.interests ?? {})
  },
  card: {
    diningDate: "2026-08-20",
    mealPeriod: "dinner",
    intentionType: index % 2 === 0 ? "chat_first" : "eat_together",
    restaurant: index === 1 ? { restaurantId: "dev-restaurant", name: "Dev Restaurant" } : null,
    ...(overrides.card ?? {})
  },
  ...overrides.top
});
const RESPONSE = (count = 10) => ({
  policyVersion: "meal-buddy-candidate-api-v1",
  candidates: Array.from({ length: count }, (_, index) => candidate(index))
});
const CARD_LIST = {
  cards: [
    { sourceCardRef: SOURCE_REF, cardType: "general", intentionType: "chat_first", restaurantId: null, area: null, diningDate: "2026-08-20", mealPeriod: "dinner", preferredTime: null, createdAt: "x", expiresAt: "y" },
    { sourceCardRef: RESTAURANT_REF, cardType: "restaurant", intentionType: "eat_together", restaurantId: "dev-restaurant", area: null, diningDate: "2026-08-20", mealPeriod: "dinner", preferredTime: null, createdAt: "x", expiresAt: "y" }
  ],
  quota: { general: { used: 1, limit: 3 }, restaurant: { used: 1, limit: 2 } }
};

const authPort = (authenticated = true) => ({
  source: "supabase-live",
  async getCurrentSession() {
    return authenticated ? { ok: true, value: { user: { id: "opaque" } } } : { ok: true, value: null };
  }
});
// Substitutes only the Functions boundary and records exactly what the client sent.
function client({ cardBody = CARD_LIST, candidateBody = RESPONSE(), error = null, throwOn = null, capture = {} } = {}) {
  capture.calls = capture.calls ?? [];
  return {
    functions: {
      async invoke(name, options) {
        capture.calls.push({ name, options });
        if (throwOn === name) throw new Error("transport exploded");
        if (error && error.on === name) return { data: null, error: error.value };
        return { data: name === "meal-buddy-card-list" ? cardBody : candidateBody, error: null };
      }
    }
  };
}
const LIVE = { candidateSource: "supabase-live", issues: [] };
const service = (options = {}) => feature.createMealBuddyCandidateService(
  "supabase-live", true,
  { authPort: authPort(options.authenticated ?? true), mealBuddyClient: client(options) },
  options.flags ?? LIVE
);

try {
  // --- 1. auth/session -> card list -> sourceCardRef ------------------------------------------------
  const capture = {};
  const cards = await service({ capture }).listSourceCards();
  check("01 the pipeline starts at the real card-list function",
    capture.calls[0].name === "meal-buddy-card-list", capture.calls[0]?.name);
  check("02 the card list is sent the frozen empty body",
    JSON.stringify(capture.calls[0].options) === JSON.stringify({ body: {} }));
  check("03 the actor's own source cards are returned with opaque references",
    cards.ok && cards.value.length === 2 && cards.value.every((c) => c.sourceCardRef.startsWith("mbc1.")));
  check("04 owner-facing card detail is dropped at the boundary",
    Object.keys(cards.value[0]).every((key) => !["area", "preferredTime", "createdAt", "expiresAt", "quota"].includes(key)),
    Object.keys(cards.value[0]));
  check("05 an unauthenticated session cannot reach the card list",
    (await service({ authenticated: false }).listSourceCards()).error.code === "authentication_required");

  // --- 2. sourceCardRef -> real candidate endpoint ---------------------------------------------------
  const capture2 = {};
  const listed = await service({ capture: capture2 }).listCandidates(SOURCE_REF);
  check("06 the candidate call targets the real SR-2G-D function, never the SR-2D surface",
    capture2.calls[0].name === "meal-buddy-candidate-list");
  check("07 the request body is exactly one source reference",
    JSON.stringify(capture2.calls[0].options) === JSON.stringify({ body: { sourceCardRef: SOURCE_REF } }));
  check("08 a raw identifier is refused before any request is made", await (async () => {
    const capture3 = {};
    const outcome = await service({ capture: capture3 }).listCandidates("00000000-0000-4000-8000-000000000001");
    return outcome.ok === false && outcome.error.code === "invalid_request" && capture3.calls.length === 0;
  })());
  check("09 an empty reference is refused before any request is made",
    (await service().listCandidates("")).error.code === "invalid_request");

  // --- 3. strict DTO validation ------------------------------------------------------------------------
  check("10 a valid response passes and carries the frozen policy version",
    listed.ok && listed.value.policyVersion === "meal-buddy-candidate-api-v1" && listed.value.candidates.length === 10);
  const rejects = async (body) => (await service({ candidateBody: body }).listCandidates(SOURCE_REF)).error?.code;
  check("11 an unknown authority-bearing field is rejected",
    await rejects({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [{ ...candidate(0), rankingState: "scored" }] }) === "invalid_server_response");
  check("12 a raw identifier field is rejected",
    await rejects({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [{ ...candidate(0), candidateUserId: "u" }] }) === "invalid_server_response");
  check("13 a fine-grained interest tag is rejected",
    await rejects({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [candidate(0, { interests: { generalCategoryKeys: ["general.entertainment.movie"] } })] }) === "invalid_server_response");
  check("14 a fourth visible category is rejected rather than truncated",
    await rejects({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [candidate(0, { interests: { generalCategoryKeys: ["general.entertainment", "general.gaming", "general.fitness_sports", "general.music"] } })] }) === "invalid_server_response");
  check("15 an over-cap response is rejected, never trimmed to ten",
    await rejects(RESPONSE(11)) === "invalid_server_response");
  check("16 a non-opaque reference is rejected",
    await rejects({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [{ ...candidate(0), candidateRef: "00000000-0000-4000-8000-000000000001" }] }) === "invalid_server_response");
  check("17 a wrong policy version is rejected",
    await rejects({ policyVersion: "social-candidate-api-v1", candidates: [] }) === "invalid_server_response");
  check("18 a legal empty result is a success, never an error",
    (await service({ candidateBody: { policyVersion: "meal-buddy-candidate-api-v1", candidates: [] } }).listCandidates(SOURCE_REF)).ok === true);

  // --- 4. server order is authoritative -----------------------------------------------------------------
  check("19 the client preserves the server array order exactly",
    JSON.stringify(listed.value.candidates.map((c) => c.displayName))
    === JSON.stringify(Array.from({ length: 10 }, (_, i) => `Name ${i}`)));
  const reversed = { policyVersion: "meal-buddy-candidate-api-v1", candidates: [...RESPONSE().candidates].reverse() };
  check("20 a differently ordered server response is rendered in that order, not re-sorted",
    JSON.stringify((await service({ candidateBody: reversed }).listCandidates(SOURCE_REF)).value.candidates.map((c) => c.displayName))
    === JSON.stringify(reversed.candidates.map((c) => c.displayName)));
  check("21 the client applies no Free/Premium cap of its own",
    (await service({ candidateBody: RESPONSE(3) }).listCandidates(SOURCE_REF)).value.candidates.length === 3
    && (await service({ candidateBody: RESPONSE(10) }).listCandidates(SOURCE_REF)).value.candidates.length === 10);
  check("22 exactly one request is issued per read, so nothing refills or paginates",
    capture2.calls.filter((entry) => entry.name === "meal-buddy-candidate-list").length === 1);

  // --- 5. canonical interest labels and the compact model ------------------------------------------------
  const labelClient = {
    from: () => ({ select: () => ({ eq: async () => ({
      data: [
        { tag_key: "general.entertainment", label: "娛樂" },
        { tag_key: "general.gaming", label: "遊戲" },
        { tag_key: "general.fitness_sports", label: "運動" },
        { tag_key: "food.japanese", label: "日式" }
      ], error: null }) }) })
  };
  const labels = await feature.loadInterestCategoryLabels(labelClient);
  check("23 labels load from the canonical catalog table", labels.ok && labels.value.size === 4);
  check("24 a category resolves to its canonical localized label",
    feature.resolveInterestCategoryLabel(labels.value, "general.entertainment") === "娛樂");
  check("25 an uncatalogued key degrades to the key itself, never to an invented label",
    feature.resolveInterestCategoryLabel(labels.value, "general.unknown") === "general.unknown");
  const overflowLine = feature.buildCompactInterestLine(
    listed.value.candidates[0].interests.generalCategoryKeys, listed.value.candidates[0].interests.generalOverflowCount, labels.value);
  check("26 an overflowing line is three chips plus ONE overflow chip, never a fourth category",
    overflowLine.chips.length === 3 && overflowLine.overflowLabel === "+2",
    overflowLine);
  check("27 a line within the limit carries no overflow chip",
    feature.buildCompactInterestLine(["food.japanese"], 0, labels.value).overflowLabel === null);
  check("28 the compact model never reorders the server's category order",
    JSON.stringify(overflowLine.chips) === JSON.stringify(["娛樂", "遊戲", "運動"]));
  check("29 a catalog read failure is reported, not silently replaced by a hard-coded map",
    (await feature.loadInterestCategoryLabels({ from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: "x" } }) }) }) })).ok === false);

  // --- 6. state classification ---------------------------------------------------------------------------
  const httpError = (code) => ({ on: "meal-buddy-candidate-list", value: { name: "FunctionsHttpError", context: { json: async () => ({ error: { code } }) } } });
  check("30 a server invalid_request stays invalid_request",
    (await service({ error: httpError("invalid_request") }).listCandidates(SOURCE_REF)).error.code === "invalid_request");
  check("31 a server_unavailable stays server_unavailable and never becomes an empty list",
    await (async () => {
      const outcome = await service({ error: httpError("server_unavailable") }).listCandidates(SOURCE_REF);
      return outcome.ok === false && outcome.error.code === "server_unavailable";
    })());
  check("32 a transport failure is network_error, never an empty list",
    (await service({ throwOn: "meal-buddy-candidate-list" }).listCandidates(SOURCE_REF)).error.code === "network_error");
  check("33 an unknown server code collapses to internal_error",
    (await service({ error: httpError("teapot") }).listCandidates(SOURCE_REF)).error.code === "internal_error");
  check("34 holding no active card is its own state, distinct from an empty list",
    (await service().listCandidatesForOwnedCard(() => null)).error.code === "no_source_card");
  check("35 an unconfigured runtime is its own state and never falls back to demo data",
    await (async () => {
      const disabled = feature.createMealBuddyCandidateService("mock", false, {}, { candidateSource: "disabled", issues: [] });
      const outcome = await disabled.listCandidates(SOURCE_REF);
      return outcome.ok === false && outcome.error.code === "meal_buddy_candidates_disabled";
    })());
  check("36 all five failure states are mutually distinguishable",
    new Set(["invalid_request", "server_unavailable", "network_error", "no_source_card", "meal_buddy_candidates_disabled"]).size === 5);
  check("37 no failure path ever yields a successful empty response",
    await (async () => {
      for (const options of [{ error: httpError("server_unavailable") }, { throwOn: "meal-buddy-candidate-list" }, { error: httpError("teapot") }]) {
        const outcome = await service(options).listCandidates(SOURCE_REF);
        if (outcome.ok) return false;
      }
      return true;
    })());

  // --- 7. end-to-end owned-card read -------------------------------------------------------------------------
  const capture4 = {};
  const endToEnd = await service({ capture: capture4 }).listCandidatesForOwnedCard(
    (list) => list.find((c) => c.cardType === "general") ?? null);
  check("38 the end-to-end read goes card list -> chosen reference -> candidate list",
    capture4.calls.map((c) => c.name).join(">") === "meal-buddy-card-list>meal-buddy-candidate-list");
  check("39 the reference sent is the one the card list returned, never a hard-coded value",
    capture4.calls[1].options.body.sourceCardRef === SOURCE_REF);
  check("40 choosing a different owned card sends that card's reference instead",
    await (async () => {
      const capture5 = {};
      await service({ capture: capture5 }).listCandidatesForOwnedCard(
        (list) => list.find((c) => c.cardType === "restaurant") ?? null);
      return capture5.calls[1].options.body.sourceCardRef === RESTAURANT_REF;
    })());
  check("41 the end-to-end read returns the server result unchanged", endToEnd.ok && endToEnd.value.candidates.length === 10);

  // --- 8. references stay opaque and unpersisted -----------------------------------------------------------------
  check("42 both references survive as opaque strings only",
    listed.value.candidates.every((c) => c.candidateRef.startsWith("scr1.") && c.candidateCardRef.startsWith("mbc1.")));
  check("43 the person reference is never derived from the card reference",
    listed.value.candidates.every((c) => c.candidateRef !== c.candidateCardRef
      && !c.candidateCardRef.includes(c.candidateRef.slice(5))));
  check("44 the service retains no reference between calls",
    JSON.stringify(Object.keys(service())) === JSON.stringify(["options"]));
  check("45 nothing in the feature writes to device storage",
    !/AsyncStorage|localStorage|setItem\(/.test(
      ["types.ts", "ports.ts", "factories.ts", "featureFlags.ts", "runtimeBinding.ts", "mealBuddyCandidateService.ts",
        "interestCatalog.ts", "taipeiDiningDate.ts", "supabaseMealBuddyCandidateContracts.ts", "index.ts"]
        .map((f) => fs.readFileSync(path.join(featureRoot, f), "utf8")).join("\n")));

  // --- 9. Asia/Taipei dining date -----------------------------------------------------------------------------------
  // 2026-08-19T00:30 Taipei is 2026-08-18T16:30Z; the old UTC key returned the previous day.
  const earlyMorning = new Date("2026-08-18T16:30:00.000Z");
  check("46 an early-morning Taipei instant no longer yields the previous UTC day",
    feature.mealBuddyTaipeiDateKey(earlyMorning) === "2026-08-19"
    && earlyMorning.toISOString().slice(0, 10) === "2026-08-18");
  check("47 a late-evening Taipei instant stays on the same local day",
    feature.mealBuddyTaipeiDateKey(new Date("2026-08-19T15:00:00.000Z")) === "2026-08-19");
  check("48 the helper is a pure conversion with no clock of its own",
    feature.mealBuddyTaipeiDateKey(earlyMorning) === feature.mealBuddyTaipeiDateKey(earlyMorning));
  check("49 the policy zone is named, never an offset constant",
    feature.MEAL_BUDDY_DINING_DATE_TIME_ZONE === "Asia/Taipei");
  check("50 a server dining date is carried through unchanged and never re-parsed",
    listed.value.candidates.every((c) => c.card.diningDate === "2026-08-20"));

  // --- 10. shared contract constants stay frozen -------------------------------------------------------------------------
  check("51 the shared contract pins the frozen exposure cap and compact limit",
    shared.MEAL_BUDDY_CANDIDATE_MAXIMUM === 10 && shared.MEAL_BUDDY_CANDIDATE_COMPACT_VISIBLE === 3);
  check("52 the candidate DTO is exactly eight fields", shared.MEAL_BUDDY_CANDIDATE_FIELDS.length === 8);
  check("53 the restaurant projection is identity plus display name only",
    JSON.stringify([...shared.MEAL_BUDDY_CANDIDATE_RESTAURANT_FIELDS].sort()) === JSON.stringify(["name", "restaurantId"]));
  check("54 a general card carries no restaurant and a restaurant card carries both fields",
    listed.value.candidates[0].card.restaurant === null
    && JSON.stringify(Object.keys(listed.value.candidates[1].card.restaurant).sort()) === JSON.stringify(["name", "restaurantId"]));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-e1-smoke",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-e1-smoke", error: error.message, stack: error.stack?.split("\n").slice(0, 5) }, null, 2));
  process.exit(1);
}
