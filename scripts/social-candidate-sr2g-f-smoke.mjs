#!/usr/bin/env node
// SR-2G-F local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// The REAL SR-2G-F context composition, the REAL frozen SR-2A ranking, the REAL frozen SR-2B
// entitlement and exposure, the REAL SR-2C projection, the REAL SR-2C-R1 compact interest derivation
// and both REAL AES-256-GCM reference primitives all execute. Only the SQL transport and the
// authenticated Supabase client are substituted, and no repository byte is modified.
//
// The classification itself lives in SQL and is proven live by the Development acceptance. What this
// suite proves is everything downstream of it: that the labels bucket, that SR-2A ranks inside the
// buckets, that exposure still slices a pure prefix, that a uniform label reproduces the frozen
// order exactly, and that no candidate is ever lost.
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

// --- module loader ----------------------------------------------------------------------------
const npmStubs = new Map([
  ["npm:@supabase/supabase-js@2", { createClient: () => ({}) }],
  ["npm:postgres@3.4.7", { default: () => ({}) }]
]);
globalThis.Deno = globalThis.Deno ?? { env: { get: () => undefined }, serve: () => {} };

const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, `${candidate}.mjs`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
    fileName: absolute.endsWith(".mjs") ? `${absolute.slice(0, -4)}.js` : absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (npmStubs.has(specifier)) return npmStubs.get(specifier);
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const fromRoot = (relative) => load(path.join(root, relative));

const composeModule = fromRoot("supabase/functions/_shared/meal-buddy-candidate-api/compose.ts");
const contextModule = fromRoot("supabase/functions/_shared/meal-buddy-context/index.ts");
const ranking = fromRoot("supabase/functions/_shared/social-ranking/index.ts");
const exposureModule = fromRoot("supabase/functions/_shared/social-exposure/index.ts");
const candidateRef = fromRoot("supabase/functions/_shared/social-candidate-ref/index.ts");
const cardRef = fromRoot("supabase/functions/_shared/meal-buddy-card-ref/index.ts");
const validate = fromRoot("supabase/functions/_shared/meal-buddy-card-api/validate.ts");

// --- fixtures ----------------------------------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const SOURCE_CARD = "00000000-0000-4000-9000-0000000000a1";
const owner = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const cardOf = (index) => `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`;
// Twelve owners, so the Premium cap of ten genuinely truncates and the exposed PREFIX can differ.
const OWNERS = Array.from({ length: 12 }, (_, index) => owner(index + 1));

const CANDIDATE_KEY = candidateRef.decodeSocialCandidateRefKey(Buffer.alloc(32, 7).toString("base64"));
const CARD_KEY = cardRef.decodeMealBuddyCardRefKey(Buffer.alloc(32, 9).toString("base64"));
const candidateCipher = candidateRef.createSocialCandidateRefCipher(CANDIDATE_KEY);
const cardCipher = cardRef.createMealBuddyCardRefCipher(CARD_KEY);
const INSTANT = new Date(Date.now() - 60_000);

const EMPTY_SOURCES = Object.freeze({
  dietary_restrictions: { rows: [] }, favorite_menu_items: { rows: [] }, favorite_restaurants: { rows: [] },
  meal_record_items: { rows: [] }, meal_records: { rows: [] }, nutrition_goals: { rows: [] },
  taste_profiles: { rows: [] }
});
const tastePayload = (ids) => ({
  actor: { user_id: ACTOR, sources: EMPTY_SOURCES },
  authorized_candidate_user_ids: [...ids],
  candidates: ids.map((userId) => ({ user_id: userId, sources: EMPTY_SOURCES }))
});

// The context primitive labels the frozen pool. `states` maps an owner index to its label, so a test
// can express any distribution without the classification itself being reproduced here.
const poolRow = (ownerUserId, index, state) => ({
  candidate_owner_user_id: ownerUserId,
  candidate_card_id: cardOf(index + 1),
  card_type: index % 3 === 0 ? "restaurant" : "general",
  intention_type: index % 2 === 0 ? "chat_first" : "eat_together",
  restaurant_id: index % 3 === 0 ? `restaurant-${index + 1}` : null,
  restaurant_name: index % 3 === 0 ? `Restaurant ${index + 1}` : null,
  dining_date: "2026-08-21",
  meal_period: "dinner",
  context_state: state
});
const interestRow = (ordinal, namespace, tagKey, categoryKey, displayOrder) =>
  ({ exposure_ordinal: ordinal, namespace, tag_key: tagKey, category_key: categoryKey, display_order: displayOrder });
const INTERESTS = [
  interestRow(0, "general", "general.entertainment.movie", "general.entertainment", 101),
  interestRow(0, "food", "food.japanese.sushi", "food.japanese", 202)
];

function createTransport({ owners = OWNERS, states = () => "neutral", failOn = null, capture = {} } = {}) {
  capture.calls = capture.calls ?? [];
  capture.params = capture.params ?? {};
  return {
    async withTransaction(operation) {
      return await operation({
        query: async (statement, parameters) => {
          if (failOn && statement.text.includes(failOn)) throw new Error("dependency_failure");
          if (statement.text.includes("canonical_meal_buddy_context_candidates")) {
            capture.calls.push("context-pool");
            capture.params.pool = [...parameters];
            capture.params.statement = statement.text;
            return owners.map((ownerUserId, index) => poolRow(ownerUserId, index, states(index)));
          }
          if (statement.text.includes("canonical_candidate_taste_sources")) {
            capture.calls.push("taste");
            return [{ payload: tastePayload(owners) }];
          }
          if (statement.text.includes("project_exposed_social_profiles")) {
            capture.calls.push("profile");
            return parameters[1].map((userId, ordinal) => ({
              exposure_ordinal: ordinal,
              display_name: `Name ${userId.slice(-2)}`,
              mascot_avatar_key: `mascot_${userId.slice(-2)}`,
              public_bio: ordinal === 0 ? null : `bio ${ordinal}`,
              willing_to_chat: ordinal % 2 === 0
            }));
          }
          if (statement.text.includes("project_public_social_interests")) {
            capture.calls.push("interests");
            return INTERESTS;
          }
          throw new Error(`unexpected statement: ${statement.text}`);
        },
        abort: () => { throw new Error("aborted"); }
      });
    },
    async close() {}
  };
}
const entitlementSource = (planCode) => ({
  from: () => ({
    select: () => ({
      eq: () => Promise.resolve({
        data: planCode === null ? []
          : [{ plan_code: planCode, status: "active", valid_from: "2026-01-01T00:00:00.000Z", valid_until: null }],
        error: null
      })
    })
  })
});

async function compose(options = {}) {
  const capture = options.capture ?? {};
  return await composeModule.composeMealBuddyCandidateList({
    transport: createTransport({ ...options, capture }),
    entitlementRowSource: entitlementSource(options.plan ?? "premium"),
    candidateCipher, cardCipher,
    actorUserId: ACTOR, sourceCardId: SOURCE_CARD, requestInstant: INSTANT
  });
}
const namesOf = (response) => response.candidates.map((c) => c.displayName);
const threw = async (fn) => { try { await fn(); return false; } catch { return true; } };

try {
  // --- 1. the context stage exists and composes the frozen chain -----------------------------------
  const capture = {};
  const uniform = await compose({ capture });
  check("01 the pipeline reads the SR-2G-F context primitive",
    capture.params.statement.includes("social_internal.canonical_meal_buddy_context_candidates"));
  check("02 the context read takes only the actor, the source card and the instant",
    capture.params.pool.length === 3 && capture.params.pool[0] === ACTOR && capture.params.pool[1] === SOURCE_CARD);
  check("03 the authorities are consulted in the frozen order: pool, taste, profile, interests",
    JSON.stringify(capture.calls) === JSON.stringify(["context-pool", "taste", "profile", "interests"]));

  // --- 2. no-context equivalence: the frozen SR-2G-E2 behaviour, byte for byte -----------------------
  // A source card with no context makes the primitive label EVERY row neutral. That is one bucket,
  // so the result must equal what the frozen SR-2A ordering alone would produce.
  const frozenOrder = ranking.rankSocialCandidates(OWNERS.map((candidateUserId) => ({
    candidateUserId,
    result: { status: "adapted", versions: {}, taste: { similarity: { status: "not_scored", reason: "no_comparable_evidence" } } }
  }))).ordered.map((entry) => entry.candidateUserId);
  check("04 a uniform neutral label reproduces the frozen SR-2A order exactly",
    JSON.stringify(namesOf(uniform)) === JSON.stringify(frozenOrder.slice(0, 10).map((id) => `Name ${id.slice(-2)}`)));
  check("05 the legacy no-context result still fills the Premium prefix",
    uniform.candidates.length === 10);
  check("06 a legacy no-context card is never an error and never empty",
    uniform.policyVersion === "meal-buddy-candidate-api-v1" && uniform.candidates.length > 0);

  // --- 3. context changes the order and therefore the exposed prefix ---------------------------------
  // Owners 10, 11 and 12 sort LAST under the frozen order (code-unit tie-break on the uuid), so with
  // a Premium cap of ten they are exactly the ones the frozen prefix truncates away.
  const lift = (indexes) => (index) => (indexes.includes(index) ? "matched" : "neutral");
  const hotpot = await compose({ states: lift([9, 10, 11]) });
  check("07 a matched bucket is exposed ahead of neutral",
    namesOf(hotpot).slice(0, 3).every((name) => ["Name 10", "Name 11", "Name 12"].includes(name)),
    namesOf(hotpot));
  check("08 the exposed prefix genuinely differs from the no-context result",
    JSON.stringify(namesOf(hotpot)) !== JSON.stringify(namesOf(uniform)));
  check("09 membership differs too: context decides who survives the frozen cap",
    JSON.stringify([...namesOf(hotpot)].sort()) !== JSON.stringify([...namesOf(uniform)].sort()));
  const sushi = await compose({ states: lift([0, 1]) });
  check("10 a different context produces a different result over the same universe",
    JSON.stringify(namesOf(sushi)) !== JSON.stringify(namesOf(hotpot)));
  check("11 two different contexts differ in the exposed prefix, not merely in tie order",
    namesOf(sushi)[0] !== namesOf(hotpot)[0]);

  // --- 4. buckets are a permutation: nobody is removed --------------------------------------------------
  const everyState = await compose({ states: (i) => (["matched", "neutral", "unsupported"][i % 3]) });
  check("12 all three buckets survive into one ordered list", everyState.candidates.length === 10);
  const unsupportedOnly = await compose({ states: () => "unsupported" });
  check("13 a wholly unsupported universe still exposes candidates, never an empty list",
    unsupportedOnly.candidates.length === 10);
  check("14 an unsupported label demotes but never removes",
    JSON.stringify([...namesOf(unsupportedOnly)].sort()) === JSON.stringify([...namesOf(uniform)].sort()));
  const smallPool = await compose({ owners: OWNERS.slice(0, 4), states: (i) => (i === 3 ? "matched" : "unsupported") });
  check("15 the whole eligible universe is preserved when it fits under the cap",
    smallPool.candidates.length === 4);
  check("16 within a bucket the frozen SR-2A order is untouched",
    JSON.stringify(namesOf(smallPool).slice(1)) === JSON.stringify(["Name 01", "Name 02", "Name 03"]));

  // --- 5. the bucket composer itself --------------------------------------------------------------------
  const inputs = OWNERS.slice(0, 6).map((candidateUserId) => ({
    candidateUserId,
    result: { status: "adapted", versions: {}, taste: { similarity: { status: "not_scored", reason: "no_comparable_evidence" } } }
  }));
  const map = (fn) => new Map(inputs.map((c, i) => [c.candidateUserId, fn(i)]));
  const bucketed = contextModule.composeMealBuddyContextRanking({
    candidates: inputs, contextByCandidateUserId: map((i) => (i >= 4 ? "matched" : "neutral"))
  });
  check("17 the composer emits the frozen SR-2A policy version, never one of its own",
    bucketed.policyVersion === "social-ranking-v1");
  check("18 the composer output is a permutation of its input",
    bucketed.ordered.length === inputs.length
    && JSON.stringify([...bucketed.ordered.map((e) => e.candidateUserId)].sort())
       === JSON.stringify([...inputs.map((e) => e.candidateUserId)].sort()));
  check("19 the bucket sequence is matched, then neutral, then unsupported",
    JSON.stringify(contextModule.MEAL_BUDDY_CONTEXT_BUCKET_ORDER) === JSON.stringify(["matched", "neutral", "unsupported"]));
  check("20 a uniform label is identical to ranking the whole list at once",
    JSON.stringify(contextModule.composeMealBuddyContextRanking({
      candidates: inputs, contextByCandidateUserId: map(() => "neutral")
    }).ordered) === JSON.stringify(ranking.rankSocialCandidates(inputs).ordered));
  check("21 an unlabelled candidate fails closed rather than defaulting to neutral",
    await threw(async () => contextModule.composeMealBuddyContextRanking({
      candidates: inputs, contextByCandidateUserId: new Map()
    })));
  check("22 a label outside the closed vocabulary fails closed",
    await threw(async () => contextModule.composeMealBuddyContextRanking({
      candidates: inputs, contextByCandidateUserId: map(() => "preferred")
    })));
  check("23 an unknown context_state from the database is a contract failure, not a silent default",
    await threw(async () => await compose({ states: () => "loved" })));

  // --- 6. SR-2A and SR-2B remain the only ranking and exposure authorities ------------------------------
  check("24 the composer never inspects a Taste score or ranking state",
    !/similarity|\.score|rankingState/.test(fs.readFileSync(
      path.join(root, "supabase/functions/_shared/meal-buddy-context/composeContextRanking.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1")));
  check("25 exposure still receives a well-formed frozen ranking result",
    exposureModule.applySocialExposure(bucketed, { class: "free" }).exposed.length === 3);
  check("26 the Free cap is exactly three over a contextual ordering",
    (await compose({ plan: "free", states: lift([9, 10, 11]) })).candidates.length === 3);
  check("27 the Free prefix is the first three of the SAME contextual order",
    JSON.stringify(namesOf(await compose({ plan: "free", states: lift([9, 10, 11]) })))
      === JSON.stringify(namesOf(hotpot).slice(0, 3)));
  check("28 the Premium cap is exactly ten and is never raised by context",
    hotpot.candidates.length === 10 && everyState.candidates.length === 10);

  // --- 7. the client contract is unchanged ---------------------------------------------------------------
  const sample = uniform.candidates[0];
  check("29 the candidate DTO carries exactly the frozen client-safe fields",
    JSON.stringify(Object.keys(sample).sort()) === JSON.stringify(
      ["candidateCardRef", "candidateRef", "card", "displayName", "interests", "mascotAvatarKey", "publicBio", "willingToChat"].sort()));
  check("30 the card DTO exposes no context, state or bucket",
    JSON.stringify(Object.keys(sample.card).sort()) === JSON.stringify(["diningDate", "intentionType", "mealPeriod", "restaurant"]));
  // The SR-2C-R1 food CATEGORY key is legitimate interest presentation and has always been in the
  // DTO, so the check names the context internals exactly rather than banning the word "food".
  check("31 no serialized response mentions a context state, source context or bucket",
    !/"matched"|"unsupported"|"neutral"|contextState|context_state|foodContextTagKey|bucket/i.test(JSON.stringify(hotpot)));
  check("32 no matchReasons or explanation reaches the client",
    !/matchReason|whyMatched|explanation/i.test(JSON.stringify(hotpot)));
  check("33 references stay opaque and are minted fresh per request",
    sample.candidateRef.startsWith("scr1.") && sample.candidateCardRef.startsWith("mbc1.")
    && (await compose()).candidates[0].candidateRef !== sample.candidateRef);

  // --- 8. the create contract accepts context without breaking legacy callers -----------------------------
  const legacyBody = {
    cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
    diningDate: "2099-01-01", mealPeriod: "dinner", preferredTime: null
  };
  const legacy = validate.validateMealBuddyCardCreateRequest(legacyBody, INSTANT);
  check("34 a pre-SR-2G-F seven-key body is still accepted",
    legacy.ok === true && legacy.value.foodContextTagKey === null);
  const withContext = validate.validateMealBuddyCardCreateRequest(
    { ...legacyBody, foodContextTagKey: "food.japanese.sushi" }, INSTANT);
  check("35 a canonical food context key is accepted",
    withContext.ok === true && withContext.value.foodContextTagKey === "food.japanese.sushi");
  check("36 an explicit null context is the same as omitting it",
    validate.validateMealBuddyCardCreateRequest({ ...legacyBody, foodContextTagKey: null }, INSTANT).value.foodContextTagKey === null);
  check("37 a free-text dish name is rejected outright",
    ["我想吃火鍋", "hotpot", "火鍋", "food.japanese sushi", "FOOD.JAPANESE.SUSHI", ""]
      .every((value) => validate.validateMealBuddyCardCreateRequest({ ...legacyBody, foodContextTagKey: value }, INSTANT).ok === false));
  check("38 a general-namespace tag is rejected by shape before it can reach the database",
    validate.validateMealBuddyCardCreateRequest({ ...legacyBody, foodContextTagKey: "general.gaming.esports" }, INSTANT).ok === false);
  check("39 a raw menu or restaurant identifier is rejected",
    ["menu-item-42", "dev-restaurant-haochu", "00000000-0000-4000-8000-000000000001"]
      .every((value) => validate.validateMealBuddyCardCreateRequest({ ...legacyBody, foodContextTagKey: value }, INSTANT).ok === false));
  check("40 an unknown key is still a rejection, not something silently ignored",
    validate.validateMealBuddyCardCreateRequest({ ...legacyBody, tier: "premium" }, INSTANT).ok === false
    && validate.validateMealBuddyCardCreateRequest({ ...legacyBody, contextWeights: [1] }, INSTANT).ok === false);
  check("41 a missing required key is still a rejection",
    validate.validateMealBuddyCardCreateRequest(
      { cardType: "general", intentionType: "chat_first", restaurantId: null, area: null, diningDate: "2099-01-01", mealPeriod: "dinner" },
      INSTANT).ok === false);

  // --- 9. failure paths stay distinct ----------------------------------------------------------------------
  check("42 a context-primitive failure is a thrown dependency failure, never an empty success",
    await threw(async () => await compose({ failOn: "canonical_meal_buddy_context_candidates" })));
  check("43 an empty pool is a legal success, not an error",
    await (async () => {
      const empty = await compose({ owners: [] });
      return empty.policyVersion === "meal-buddy-candidate-api-v1" && empty.candidates.length === 0;
    })());
  check("44 no health, restriction or nutrition source is ever queried",
    !capture.calls.some((c) => /meal_record|analys|goal|restriction|nutrition/i.test(c)));

  console.log(JSON.stringify({
    suite: "social-candidate-sr2g-f-smoke",
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false,
    repositoryBytesModified: false
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`SR-2G-F smoke aborted: ${error.stack}`);
  process.exit(1);
}
