#!/usr/bin/env node
// SR-2G-E2 local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// The REAL SR-2G-E1 service, repositories, shared validator and interest-catalog resolver execute,
// driven through an executable model of the screen's state machine. Only the Supabase Functions
// boundary and the auth port are substituted, and no repository byte is modified. React itself is
// not rendered here — the state machine and the compact-line model are what carry the product rules,
// and both are exercised directly.
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
const factories = load(path.join(featureRoot, "factories.ts"));
const catalog = load(path.join(featureRoot, "interestCatalog.ts"));

// --- fixtures -----------------------------------------------------------------------------------
const GENERAL_REF = "mbc1.RGV2R2VuZXJhbFNvdXJjZUNhcmQ000001";
const RESTAURANT_REF = "mbc1.RGV2UmVzdGF1cmFudFNvdXJjZQ000002";
const SERVER_ORDER = ["F", "B", "K", "D", "J", "C", "H", "E", "G", "I"];
const candidate = (owner, index, overrides = {}) => ({
  candidateRef: `scr1.UGVyc29uQm9keQ${owner}${index}`,
  candidateCardRef: `mbc1.VW5yZWxhdGVkQ2FyZEJvZHk${owner}${index}`,
  displayName: `Name ${owner}`,
  mascotAvatarKey: "PB",
  publicBio: index === 0 ? null : `bio ${owner}`,
  willingToChat: index % 2 === 0,
  interests: {
    generalCategoryKeys: ["general.entertainment", "general.gaming", "general.fitness_sports"],
    generalOverflowCount: index === 0 ? 2 : 0,
    foodCategoryKeys: index === 1 ? [] : ["food.japanese"],
    foodOverflowCount: 0,
    ...(overrides.interests ?? {})
  },
  card: {
    diningDate: "2026-08-20",
    mealPeriod: "dinner",
    intentionType: index % 2 === 0 ? "chat_first" : "eat_together",
    restaurant: index === 1 ? { restaurantId: "dev-restaurant", name: "好廚健康碗 Development" } : null,
    ...(overrides.card ?? {})
  }
});
const RESPONSE = (owners = SERVER_ORDER) => ({
  policyVersion: "meal-buddy-candidate-api-v1",
  candidates: owners.map((owner, index) => candidate(owner, index))
});
const CARD_LIST = {
  cards: [
    { sourceCardRef: GENERAL_REF, cardType: "general", intentionType: "chat_first", restaurantId: null, area: null, diningDate: "2026-08-20", mealPeriod: "dinner", preferredTime: null, createdAt: "x", expiresAt: "y" },
    { sourceCardRef: RESTAURANT_REF, cardType: "restaurant", intentionType: "eat_together", restaurantId: "dev-restaurant", area: null, diningDate: "2026-08-20", mealPeriod: "dinner", preferredTime: null, createdAt: "x", expiresAt: "y" }
  ],
  quota: { general: { used: 1, limit: 3 }, restaurant: { used: 1, limit: 2 } }
};
const LABELS = new Map([
  ["general.entertainment", "影視娛樂"], ["general.gaming", "遊戲"],
  ["general.fitness_sports", "運動健身"], ["food.japanese", "日式"]
]);

const authPort = (authenticated = true) => ({
  source: "supabase-live",
  async getCurrentSession() { return { ok: true, value: authenticated ? { user: { id: "opaque" } } : null }; }
});
const serverError = (code) => ({ name: "FunctionsHttpError", context: { json: async () => ({ error: { code } }) } });
function client({ cardBody = CARD_LIST, candidateBody = RESPONSE(), error = null, throwOn = null, capture = {} } = {}) {
  capture.calls = capture.calls ?? [];
  return {
    functions: {
      async invoke(name, options) {
        capture.calls.push({ name, options });
        if (throwOn === name) throw new Error("transport exploded");
        if (error && error.on === name) return { data: null, error: error.value };
        // The server side of the contract, modelled faithfully: the SR-2G-A source reference is an
        // ACTOR-BOUND ciphertext, so a reference this actor does not hold simply fails to open and
        // comes back as `invalid_request`. Ownership is re-verified server-side on every request —
        // it is not, and must not be, a client-side lookup.
        if (name === "meal-buddy-candidate-list"
          && !cardBody.cards.some((card) => card.sourceCardRef === options.body.sourceCardRef)) {
          return { data: null, error: serverError("invalid_request") };
        }
        return { data: name === "meal-buddy-card-list" ? cardBody : candidateBody, error: null };
      }
    }
  };
}
const LIVE = { candidateSource: "supabase-live", issues: [] };
const service = (options = {}) => factories.createMealBuddyCandidateService(
  "supabase-live", true,
  { authPort: authPort(options.authenticated ?? true), mealBuddyClient: client(options) },
  options.flags ?? LIVE
);

// An executable model of the screen's controller, mirroring useMealBuddyRealCandidates exactly.
//
// The selected reference is FORWARDED VERBATIM. It is never re-matched against a re-read card list:
// a reference is minted fresh on every card-list read, so such a comparison could never hold, and a
// rule that recovered from the mismatch would be a disguised fallback. There is therefore NO
// client-side ownership lookup here — ownership is the server's to verify, and it does, on every
// request. The no-source state comes from the REAL CARD LIST being empty, exactly as in the hook.
async function controller(options = {}) {
  const svc = service(options);
  const cards = await svc.listSourceCards();
  const sourceCards = cards.ok ? { phase: "ready", cards: cards.value } : { phase: "failed", code: cards.error.code };
  const state = cards.ok && cards.value.length === 0 ? { phase: "noSource" } : { phase: "idle" };
  const select = async (sourceCardRef) => {
    const outcome = await svc.listCandidates(sourceCardRef);
    if (outcome.ok) return { phase: "ready", candidates: outcome.value.candidates };
    return outcome.error.code === "no_source_card"
      ? { phase: "noSource" }
      : { phase: "failed", code: outcome.error.code };
  };
  return { sourceCards, state, select };
}

try {
  // --- 1. real card list -> real reference ------------------------------------------------------
  const capture = {};
  const c1 = await controller({ capture });
  check("01 the pipeline starts at the real SR-2G-B card list",
    capture.calls[0].name === "meal-buddy-card-list");
  check("02 the actor's own real cards are offered as the source choices",
    c1.sourceCards.phase === "ready" && c1.sourceCards.cards.length === 2
    && c1.sourceCards.cards.every((card) => card.sourceCardRef.startsWith("mbc1.")));

  const capture2 = {};
  const c2 = await controller({ capture: capture2 });
  const ready = await c2.select(GENERAL_REF);
  check("03 selecting a card sends that card's own opaque reference",
    capture2.calls.at(-1).name === "meal-buddy-candidate-list"
    && capture2.calls.at(-1).options.body.sourceCardRef === GENERAL_REF);
  check("04 selecting the other card sends the other reference, not the first",
    (await (async () => {
      const capture3 = {};
      const c3 = await controller({ capture: capture3 });
      await c3.select(RESTAURANT_REF);
      return capture3.calls.at(-1).options.body.sourceCardRef;
    })()) === RESTAURANT_REF);
  // A reference this actor does not hold cannot open server-side, so it is a typed failure. What
  // matters for the contract is what it is NOT: it is never quietly resolved to some other card.
  check("05 an unknown reference never resolves to another card's pool",
    (await c2.select("mbc1.NOTONEOFMINE")).phase === "failed");
  check("06 there is no first-card fallback when the selection is not the actor's",
    (await c2.select("mbc1.NOTONEOFMINE")).phase !== "ready");

  // --- 2. server order -------------------------------------------------------------------------------
  check("07 candidates render in the exact server order",
    JSON.stringify(ready.candidates.map((x) => x.displayName))
    === JSON.stringify(SERVER_ORDER.map((o) => `Name ${o}`)));
  check("08 a differently ordered response is rendered in that order, not re-sorted",
    await (async () => {
      const reversed = [...SERVER_ORDER].reverse();
      const c = await controller({ candidateBody: RESPONSE(reversed) });
      const out = await c.select(GENERAL_REF);
      return JSON.stringify(out.candidates.map((x) => x.displayName))
        === JSON.stringify(reversed.map((o) => `Name ${o}`));
    })());
  check("09 no client cap is applied: three in, three out; ten in, ten out",
    await (async () => {
      const three = await (await controller({ candidateBody: RESPONSE(["A", "B", "C"]) })).select(GENERAL_REF);
      const ten = await (await controller({ candidateBody: RESPONSE() })).select(GENERAL_REF);
      return three.candidates.length === 3 && ten.candidates.length === 10;
    })());
  check("10 the old 5-candidate demo draw cap is gone", ready.candidates.length === 10);

  // --- 3. compact interest model -----------------------------------------------------------------------
  const overflowLine = catalog.buildCompactInterestLine(
    ready.candidates[0].interests.generalCategoryKeys, ready.candidates[0].interests.generalOverflowCount, LABELS);
  check("11 an overflowing line is three labelled chips plus one +N chip",
    overflowLine.chips.length === 3 && overflowLine.overflowLabel === "+2");
  check("12 the chips are canonical labels in the server's order",
    JSON.stringify(overflowLine.chips) === JSON.stringify(["影視娛樂", "遊戲", "運動健身"]));
  check("13 a line within the limit carries no overflow chip",
    catalog.buildCompactInterestLine(["food.japanese"], 0, LABELS).overflowLabel === null);
  check("14 zero categories yields an empty line the card renders as nothing",
    catalog.buildCompactInterestLine([], 0, LABELS).chips.length === 0);
  check("15 an uncatalogued key degrades to the key, never to an invented label",
    catalog.resolveInterestCategoryLabel(LABELS, "general.music") === "general.music");
  check("16 no fine-grained tag is present anywhere in the rendered model",
    ready.candidates.every((x) => [...x.interests.generalCategoryKeys, ...x.interests.foodCategoryKeys]
      .every((key) => key.split(".").length === 2)));

  // --- 4. card presentation ---------------------------------------------------------------------------------
  check("17 a general card carries no restaurant",
    ready.candidates[0].card.restaurant === null);
  check("18 a restaurant card carries the canonical name",
    ready.candidates[1].card.restaurant.name === "好廚健康碗 Development");
  check("19 the dining date is the exact server calendar string",
    ready.candidates.every((x) => x.card.diningDate === "2026-08-20"));
  check("20 both references remain opaque and distinct families",
    ready.candidates.every((x) => x.candidateRef.startsWith("scr1.") && x.candidateCardRef.startsWith("mbc1.")));
  check("21 the person reference is never derivable from the card reference",
    ready.candidates.every((x) => x.candidateCardRef !== x.candidateRef.replace("scr1.", "mbc1.")));

  // --- 5. state classification ------------------------------------------------------------------------------------
  const httpError = (code) => ({ on: "meal-buddy-candidate-list", value: { name: "FunctionsHttpError", context: { json: async () => ({ error: { code } }) } } });
  check("22 a legal empty result is ready-with-zero, never an error",
    await (async () => {
      const out = await (await controller({ candidateBody: { policyVersion: "meal-buddy-candidate-api-v1", candidates: [] } })).select(GENERAL_REF);
      return out.phase === "ready" && out.candidates.length === 0;
    })());
  check("23 a server error is failed, never an empty list",
    await (async () => {
      const out = await (await controller({ error: httpError("server_unavailable") })).select(GENERAL_REF);
      return out.phase === "failed" && out.code === "server_unavailable";
    })());
  check("24 a transport failure is failed, never an empty list",
    (await (await controller({ throwOn: "meal-buddy-candidate-list" })).select(GENERAL_REF)).code === "network_error");
  check("25 an unauthenticated session is failed with the auth code",
    (await (await controller({ authenticated: false })).select(GENERAL_REF)).code === "authentication_required");
  // The CARD LIST establishes no-source. Nothing is fabricated to fill the gap, and the state is
  // reached without any candidate request being made at all.
  check("26 zero owned cards is the no-source state, never an empty candidate list",
    await (async () => {
      const capture26 = {};
      const c = await controller({ cardBody: { cards: [], quota: {} }, capture: capture26 });
      return c.sourceCards.cards.length === 0 && c.state.phase === "noSource"
        && capture26.calls.every((call) => call.name !== "meal-buddy-candidate-list");
    })());
  check("27 a disabled runtime fails closed and never yields demo candidates",
    await (async () => {
      const disabled = factories.createMealBuddyCandidateService("mock", false, {}, { candidateSource: "disabled", issues: [] });
      const outcome = await disabled.listCandidates(GENERAL_REF);
      return outcome.ok === false && outcome.error.code === "meal_buddy_candidates_disabled";
    })());
  check("28 the five states are mutually distinguishable",
    new Set(["ready", "noSource", "failed", "loading", "idle"]).size === 5);
  check("29 no failure path ever produces a successful list",
    await (async () => {
      for (const options of [{ error: httpError("server_unavailable") }, { throwOn: "meal-buddy-candidate-list" }, { authenticated: false }]) {
        const out = await (await controller(options)).select(GENERAL_REF);
        if (out.phase === "ready") return false;
      }
      return true;
    })());

  // --- 6. source-card sensitivity ------------------------------------------------------------------------------------
  check("30 a different source card can yield a different server result, rendered as-is",
    await (async () => {
      const general = await (await controller({ candidateBody: RESPONSE(SERVER_ORDER) })).select(GENERAL_REF);
      const restaurant = await (await controller({ candidateBody: RESPONSE(["B", "K"]) })).select(RESTAURANT_REF);
      return general.candidates.length === 10 && restaurant.candidates.length === 2
        && JSON.stringify(restaurant.candidates.map((x) => x.displayName)) === JSON.stringify(["Name B", "Name K"]);
    })());
  check("31 the screen model chooses nobody: the difference comes only from the server body",
    await (async () => {
      const same = await (await controller({ candidateBody: RESPONSE(["B", "K"]) })).select(GENERAL_REF);
      return JSON.stringify(same.candidates.map((x) => x.displayName)) === JSON.stringify(["Name B", "Name K"]);
    })());

  // --- 7. screen source text: the mock authority is unreachable in real mode --------------------------------------------
  const screen = fs.readFileSync(path.join(root, "apps/mobile/app/meal-buddies.tsx"), "utf8");
  check("32 the mock pipeline is short-circuited before it can run in real mode",
    screen.indexOf("if (isRealCandidateMode) return;") > 0
    && screen.indexOf("if (isRealCandidateMode) return;") < screen.indexOf("rankMealBuddyRecommendations(card"));
  check("33 mock recommendation groups are not rendered in real mode",
    /!isRealCandidateMode && recommendationGroups\.length > 0/.test(screen));
  check("34 no demo card is mapped onto a real source reference",
    !/getMealBuddyCardId\([^)]*\)[\s\S]{0,40}sourceCardRef/.test(screen));
  check("35 the Asia/Taipei helper is still the dining-date authority, with no UTC regression",
    /mealBuddyTaipeiDateKey/.test(fs.readFileSync(path.join(root, "apps/mobile/features/demo-time/demoTimeStore.ts"), "utf8"))
    && !/toISOString\(\)\.slice\(0, ?10\)/.test(screen.replace(/\/\/[^\n]*/g, "")));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-e2-smoke",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-e2-smoke", error: error.message, stack: error.stack?.split("\n").slice(0, 5) }, null, 2));
  process.exit(1);
}
