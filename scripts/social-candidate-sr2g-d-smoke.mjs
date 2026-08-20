#!/usr/bin/env node
// SR-2G-D local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// The real SR-2G-C pool consumption, SR-1A pair composition, SR-2A ranking, SR-2B entitlement and
// exposure, SR-2C projection, SR-2C-R1 compact interest derivation and both real AES-256-GCM
// reference primitives all execute. Only the SQL transport and the authenticated Supabase client are
// substituted, and no repository byte is modified.
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
  const raw = fs.readFileSync(absolute, "utf8");
  const { outputText } = ts.transpileModule(raw, {
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
const policy = fromRoot("supabase/functions/_shared/meal-buddy-candidate-api/policy.ts");
const candidateRef = fromRoot("supabase/functions/_shared/social-candidate-ref/index.ts");
const cardRef = fromRoot("supabase/functions/_shared/meal-buddy-card-ref/index.ts");
const handlerModule = fromRoot("supabase/functions/meal-buddy-candidate-list/handler.ts");

// --- fixtures ----------------------------------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const SOURCE_CARD = "00000000-0000-4000-9000-0000000000a1";
const owner = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const cardOf = (index) => `00000000-0000-4000-9000-${String(index).padStart(12, "0")}`;
const OWNERS = Array.from({ length: 12 }, (_, index) => owner(index + 1));

const CANDIDATE_KEY = candidateRef.decodeSocialCandidateRefKey(Buffer.alloc(32, 7).toString("base64"));
const CARD_KEY = cardRef.decodeMealBuddyCardRefKey(Buffer.alloc(32, 9).toString("base64"));
const candidateCipher = candidateRef.createSocialCandidateRefCipher(CANDIDATE_KEY);
const cardCipher = cardRef.createMealBuddyCardRefCipher(CARD_KEY);
// One fixed instant for the whole run, pinned RELATIVE to now rather than to an absolute date. The
// frozen SR-2G-A card reference has a 24-hour TTL, so an absolute literal silently starts failing
// the handler checks a day after it is written — the reference expires and the endpoint correctly
// answers 400. This keeps every check deterministic within a run without re-opening that time bomb.
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

// One pool row per owner, exactly as the SR-2G-D bridge primitive returns it. Every owner appears
// once: the frozen SR-2G-C reduction has already happened before this boundary.
const poolRow = (ownerUserId, index) => ({
  candidate_owner_user_id: ownerUserId,
  candidate_card_id: cardOf(index + 1),
  card_type: index % 3 === 0 ? "restaurant" : "general",
  intention_type: index % 2 === 0 ? "chat_first" : "eat_together",
  restaurant_id: index % 3 === 0 ? `restaurant-${index + 1}` : null,
  restaurant_name: index % 3 === 0 ? `Restaurant ${index + 1}` : null,
  dining_date: "2026-08-21",
  meal_period: "dinner",
  // SR-2G-F successor awareness. A uniform label is the no-context case, which is exactly the
  // pre-SR-2G-F behaviour this suite exists to pin: one bucket, frozen SR-2A order, unchanged.
  context_state: "neutral"
});

const interestRow = (ordinal, namespace, tagKey, categoryKey, displayOrder) =>
  ({ exposure_ordinal: ordinal, namespace, tag_key: tagKey, category_key: categoryKey, display_order: displayOrder });

// Five general categories and four food categories for exposure ordinal 0: the overflow case.
const WIDE_INTERESTS = [
  interestRow(0, "general", "general.entertainment.movie", "general.entertainment", 101),
  interestRow(0, "general", "general.entertainment.anime", "general.entertainment", 103),
  interestRow(0, "general", "general.gaming.console_gaming", "general.gaming", 203),
  interestRow(0, "general", "general.fitness_sports.fitness", "general.fitness_sports", 301),
  interestRow(0, "general", "general.travel_outdoors.overseas_travel", "general.travel_outdoors", 401),
  interestRow(0, "general", "general.creative.photography", "general.creative", 601),
  interestRow(0, "food", "food.japanese.sushi", "food.japanese", 202),
  interestRow(0, "food", "food.japanese.ramen", "food.japanese", 205),
  interestRow(0, "food", "food.dessert_drinks.coffee", "food.dessert_drinks", 604)
];
const NARROW_INTERESTS = [
  interestRow(0, "general", "general.creative.photography", "general.creative", 601),
  interestRow(0, "food", "food.japanese.ramen", "food.japanese", 205)
];

// Substitutes only the SQL boundary and records the exact order in which authorities were consulted.
function createTransport({
  owners = OWNERS, interests = WIDE_INTERESTS, survives = () => true, failOn = null, capture = {}
} = {}) {
  capture.calls = capture.calls ?? [];
  capture.params = capture.params ?? {};
  return {
    async withTransaction(operation) {
      return await operation({
        query: async (statement, parameters) => {
          if (failOn && statement.text.includes(failOn)) throw new Error("dependency_failure");
          if (statement.text.includes("canonical_meal_buddy_context_candidates")) {
            capture.calls.push("pool");
            capture.params.pool = [...parameters];
            return owners.map((ownerUserId, index) => poolRow(ownerUserId, index));
          }
          if (statement.text.includes("canonical_candidate_taste_sources")) {
            capture.calls.push("taste");
            capture.params.taste = [...parameters];
            return [{ payload: tastePayload(owners) }];
          }
          if (statement.text.includes("project_exposed_social_profiles")) {
            capture.calls.push("profile");
            capture.params.profile = [...parameters];
            return parameters[1].map((userId, ordinal) => ({ ordinal, userId }))
              .filter(({ ordinal }) => survives(ordinal))
              .map(({ ordinal, userId }) => ({
                exposure_ordinal: ordinal,
                display_name: `Name ${userId.slice(-2)}`,
                mascot_avatar_key: `mascot_${userId.slice(-2)}`,
                public_bio: ordinal === 0 ? null : `bio ${ordinal}`,
                willing_to_chat: ordinal % 2 === 0
              }));
          }
          if (statement.text.includes("project_public_social_interests")) {
            capture.calls.push("interests");
            capture.params.interests = [...parameters];
            return interests;
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
    entitlementRowSource: entitlementSource(options.planCode ?? "premium"),
    candidateCipher, cardCipher,
    actorUserId: options.actorUserId ?? ACTOR,
    sourceCardId: options.sourceCardId ?? SOURCE_CARD,
    requestInstant: INSTANT
  });
}
const threw = async (operation) => {
  try { await operation(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};

const okConfig = () => ({ ok: true, value: { supabaseUrl: "https://dev.invalid", supabaseAnonKey: "anon", candidateRefKey: CANDIDATE_KEY, cardRefKey: CARD_KEY } });
function dependencies({ config = okConfig, authenticated = true, actor = ACTOR, transportFactory } = {}) {
  return {
    loadConfig: config,
    authenticateCaller: async () => (authenticated
      ? { ok: true, value: { userId: actor, userScopedClient: entitlementSource("premium") } }
      : { ok: false, errorCode: "authentication_required" }),
    createTransport: transportFactory ?? (() => createTransport({}))
  };
}
const request = (init = {}) => new Request(init.url ?? "https://edge.invalid/meal-buddy-candidate-list", {
  method: init.method ?? "POST",
  headers: init.headers ?? {},
  ...(init.body === undefined ? {} : { body: init.body })
});
const call = async (init, deps) => await handlerModule.processMealBuddyCandidateListRequest(request(init), deps ?? dependencies());

try {
  const SOURCE_REF = await cardCipher.seal(ACTOR, "source", SOURCE_CARD, INSTANT);
  const CANDIDATE_PURPOSE_REF = await cardCipher.seal(ACTOR, "candidate", SOURCE_CARD, INSTANT);
  const FOREIGN_REF = await cardCipher.seal(owner(1), "source", SOURCE_CARD, INSTANT);
  const body = (value) => JSON.stringify(value);

  // --- 1. the request boundary --------------------------------------------------------------
  check("01 an authenticated POST carrying one source reference succeeds",
    (await call({ body: body({ sourceCardRef: SOURCE_REF }) })).status === 200);
  check("02 an unauthenticated request is rejected with 401",
    (await call({ body: body({ sourceCardRef: SOURCE_REF }) }, dependencies({ authenticated: false }))).status === 401);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    // GET carries no body by construction; the other verbs carry a body that would otherwise be valid.
    const init = method === "GET" ? { method } : { method, body: body({ sourceCardRef: SOURCE_REF }) };
    check(`03 ${method} is rejected with 400`, (await call(init)).status === 400);
  }
  check("04 an empty body is rejected: the source reference is mandatory",
    (await call({ body: "{}" })).status === 400 && (await call({})).status === 400);
  check("05 a raw card id instead of a reference is rejected",
    (await call({ body: body({ sourceCardRef: SOURCE_CARD }) })).status === 400);
  check("06 a second business key is rejected rather than ignored",
    (await call({ body: body({ sourceCardRef: SOURCE_REF, limit: 10 }) })).status === 400
    && (await call({ body: body({ sourceCardRef: SOURCE_REF, actorUserId: ACTOR }) })).status === 400
    && (await call({ body: body({ sourceCardRef: SOURCE_REF, tier: "premium" }) })).status === 400);
  check("07 a raw source card id key is rejected",
    (await call({ body: body({ sourceCardId: SOURCE_CARD }) })).status === 400);
  check("08 a query parameter is rejected",
    (await call({ url: "https://edge.invalid/meal-buddy-candidate-list?limit=10", body: body({ sourceCardRef: SOURCE_REF }) })).status === 400);
  check("09 an actor, tier, page or clock header is rejected",
    (await Promise.all([
      { "x-actor-user-id": ACTOR }, { "x-tier": "premium" }, { "x-page": "2" },
      { "x-now": INSTANT.toISOString() }, { "x-candidate-card-ref": "mbc1.x" }
    ].map((headers) => call({ headers, body: body({ sourceCardRef: SOURCE_REF }) })))).every((r) => r.status === 400));
  check("10 a candidate-purpose reference is refused as a source",
    (await call({ body: body({ sourceCardRef: CANDIDATE_PURPOSE_REF }) })).status === 400);
  check("11 another actor's source reference is refused",
    (await call({ body: body({ sourceCardRef: FOREIGN_REF }) })).status === 400);
  check("12 a tampered reference is refused",
    (await call({ body: body({ sourceCardRef: `${SOURCE_REF.slice(0, -2)}ZZ` }) })).status === 400);
  check("13 an expired reference is refused",
    (await call({ body: body({ sourceCardRef: await cardCipher.seal(ACTOR, "source", SOURCE_CARD, new Date(Date.now() - 90_000_000)) }) })).status === 400);
  check("14 an infrastructure failure is a 503, never an empty success",
    (await call({ body: body({ sourceCardRef: SOURCE_REF }) },
      dependencies({ transportFactory: () => createTransport({ failOn: "canonical_meal_buddy_context_candidates" }) }))).status === 503);
  check("15 an absent reference key is a 503, never a degraded success",
    (await call({ body: body({ sourceCardRef: SOURCE_REF }) },
      dependencies({ config: () => ({ ok: false, errorCode: "server_unavailable" }) }))).status === 503);

  // --- 2. the pipeline order ------------------------------------------------------------------
  const capture = {};
  const premium = await compose({ capture });
  check("16 the pool is consulted first, from the actor and the opened source card only",
    capture.calls[0] === "pool" && capture.params.pool[0] === ACTOR && capture.params.pool[1] === SOURCE_CARD
    && capture.params.pool[2] === INSTANT.toISOString() && capture.params.pool.length === 3, capture.params.pool);
  check("17 Taste sources are read after the pool and take only the verified actor",
    capture.calls[1] === "taste" && capture.params.taste.length === 1 && capture.params.taste[0] === ACTOR);
  check("18 the public profile projection runs over the exposed prefix",
    capture.calls[2] === "profile" && capture.params.profile[0] === ACTOR && capture.params.profile[1].length === 10);
  check("19 interests are read LAST, strictly after exposure and after the profile projection",
    capture.calls[3] === "interests" && capture.calls.length === 4, capture.calls);
  check("20 the interest read is bounded by exactly the exposed candidate prefix",
    JSON.stringify(capture.params.interests[1]) === JSON.stringify(capture.params.profile[1]));
  check("21 no refill or secondary query is ever issued",
    capture.calls.filter((entry) => entry === "pool").length === 1
    && capture.calls.filter((entry) => entry === "interests").length === 1);

  // --- 3. exposure and ranking are frozen -------------------------------------------------------
  const free = await compose({ planCode: "free" });
  check("22 a Premium actor never exceeds the frozen cap of ten", premium.candidates.length === 10, premium.candidates.length);
  check("23 a Free actor never exceeds the frozen cap of three", free.candidates.length === 3, free.candidates.length);
  check("24 the Free result is the exact prefix of the Premium result",
    JSON.stringify(free.candidates.map((c) => c.displayName)) === JSON.stringify(premium.candidates.slice(0, 3).map((c) => c.displayName)));
  check("25 an unknown plan code fails closed rather than exposing", (await threw(() => compose({ planCode: "enterprise" }))) !== null);
  check("26 the SR-2A code-unit order is preserved end to end",
    JSON.stringify(premium.candidates.map((c) => c.displayName))
    === JSON.stringify([...OWNERS].sort().slice(0, 10).map((id) => `Name ${id.slice(-2)}`)));
  check("27 an omitted profile leaves a gap and is never refilled by a later candidate",
    (await compose({ survives: (ordinal) => ordinal !== 0 })).candidates.length === 9);
  check("28 interests never influence who is exposed",
    JSON.stringify((await compose({ interests: [] })).candidates.map((c) => c.candidateCardRef.length))
    === JSON.stringify(premium.candidates.map((c) => c.candidateCardRef.length))
    && (await compose({ interests: [] })).candidates.length === premium.candidates.length);
  check("29 the exposure cap restated here is the frozen SR-2B Premium cap",
    policy.MEAL_BUDDY_CANDIDATE_API_MAXIMUM_CANDIDATES === 10);

  // --- 4. the owner to card binding -------------------------------------------------------------
  const rankedOwners = [...OWNERS].sort().slice(0, 10);
  const openedCards = [];
  for (const candidate of premium.candidates) {
    openedCards.push((await cardCipher.open(ACTOR, "candidate", candidate.candidateCardRef, INSTANT)).cardId);
  }
  const expectedCards = rankedOwners.map((ownerUserId) => cardOf(OWNERS.indexOf(ownerUserId) + 1));
  check("30 each exposed owner carries exactly the card SR-2G-C bound to them",
    JSON.stringify(openedCards) === JSON.stringify(expectedCards), { openedCards, expectedCards });
  check("31 one owner appears exactly once", new Set(openedCards).size === openedCards.length);
  check("32 a second card for the same owner is a contract violation, never a silent winner",
    (await threw(() => compose({ owners: [...OWNERS, OWNERS[0]] }))) !== null);
  check("33 the actor can never be their own candidate",
    (await threw(() => compose({ owners: [...OWNERS.slice(0, 11), ACTOR] }))) !== null);
  check("34 the card binding is independent of the interest rows",
    JSON.stringify((await compose({ interests: NARROW_INTERESTS })).candidates.map((c) => c.card))
    === JSON.stringify(premium.candidates.map((c) => c.card)));

  // --- 5. public profile ------------------------------------------------------------------------
  const first = premium.candidates[0];
  check("35 the DTO carries exactly the frozen client-safe key set",
    JSON.stringify(Object.keys(first).sort()) === JSON.stringify(
      ["candidateCardRef", "candidateRef", "card", "displayName", "interests", "mascotAvatarKey", "publicBio", "willingToChat"]),
    Object.keys(first).sort());
  check("36 displayName, mascotAvatarKey, publicBio and willingToChat come from the frozen SR-2C projection",
    typeof first.displayName === "string" && typeof first.mascotAvatarKey === "string"
    && first.publicBio === null && typeof first.willingToChat === "boolean");
  check("37 a candidate unwilling to chat is presented, never filtered out",
    premium.candidates.some((c) => c.willingToChat === false));
  check("38 the envelope carries exactly policyVersion and candidates",
    JSON.stringify(Object.keys(premium).sort()) === JSON.stringify(["candidates", "policyVersion"])
    && premium.policyVersion === "meal-buddy-candidate-api-v1");

  // --- 6. compact interests ----------------------------------------------------------------------
  check("39 the compact general line shows at most three top-level categories",
    first.interests.generalCategoryKeys.length === 3, first.interests);
  check("40 the visible categories are the first three in canonical catalog order",
    JSON.stringify(first.interests.generalCategoryKeys)
    === JSON.stringify(["general.entertainment", "general.gaming", "general.fitness_sports"]));
  check("41 the general overflow count is derived, not persisted", first.interests.generalOverflowCount === 2);
  check("42 same-category fine tags collapse to a single top category",
    !first.interests.generalCategoryKeys.some((key, index, all) => all.indexOf(key) !== index));
  check("43 the food line collapses and does not overflow below the limit",
    JSON.stringify(first.interests.foodCategoryKeys) === JSON.stringify(["food.japanese", "food.dessert_drinks"])
    && first.interests.foodOverflowCount === 0);
  check("44 no fine-grained interest tag reaches the candidate DTO",
    !JSON.stringify(premium).includes("general.entertainment.movie") && !JSON.stringify(premium).includes("food.japanese.sushi"));
  check("45 a candidate with no selections yields empty arrays and zero overflow",
    premium.candidates.slice(1).every((c) =>
      c.interests.generalCategoryKeys.length === 0 && c.interests.generalOverflowCount === 0
      && c.interests.foodCategoryKeys.length === 0 && c.interests.foodOverflowCount === 0));
  check("46 no '+N' string is produced anywhere", !JSON.stringify(premium).includes("+"));
  check("47 the compact hierarchy is server-supplied, never derived from the tag string",
    JSON.stringify((await compose({
      interests: [interestRow(0, "general", "general.entertainment.movie", "general.music", 501)]
    })).candidates[0].interests.generalCategoryKeys) === JSON.stringify(["general.music"]));

  // --- 7. the no-snapshot invariant ------------------------------------------------------------------
  const before = await compose({
    interests: [
      interestRow(0, "general", "general.entertainment.movie", "general.entertainment", 101),
      interestRow(0, "food", "food.japanese.sushi", "food.japanese", 202)
    ]
  });
  const after = await compose({ interests: NARROW_INTERESTS });
  check("48 changing only the profile settings changes the very next presentation",
    JSON.stringify(before.candidates[0].interests.generalCategoryKeys) === JSON.stringify(["general.entertainment"])
    && JSON.stringify(after.candidates[0].interests.generalCategoryKeys) === JSON.stringify(["general.creative"]));
  check("49 the same candidate card survives the settings change unchanged",
    JSON.stringify(before.candidates[0].card) === JSON.stringify(after.candidates[0].card));
  check("50 the pool row carries no interest field of any kind",
    !Object.keys(poolRow(OWNERS[0], 0)).some((key) => /interest|tag|hobby/i.test(key)));

  // --- 8. restaurant projection --------------------------------------------------------------------------
  const restaurantCandidates = premium.candidates.filter((c) => c.card.restaurant !== null);
  check("51 a restaurant card presents exactly restaurantId and name",
    restaurantCandidates.length > 0
    && restaurantCandidates.every((c) => JSON.stringify(Object.keys(c.card.restaurant).sort()) === JSON.stringify(["name", "restaurantId"])));
  check("52 a general card presents no restaurant at all",
    premium.candidates.filter((c) => c.card.restaurant === null).length === premium.candidates.length - restaurantCandidates.length
    && premium.candidates.length - restaurantCandidates.length > 0);
  check("53 the card DTO carries exactly the public card context",
    premium.candidates.every((c) => JSON.stringify(Object.keys(c.card).sort())
      === JSON.stringify(["diningDate", "intentionType", "mealPeriod", "restaurant"])));
  check("54 the restaurant projection changes neither the candidate set nor its order",
    JSON.stringify((await compose({
      owners: OWNERS,
      interests: WIDE_INTERESTS
    })).candidates.map((c) => c.displayName)) === JSON.stringify(premium.candidates.map((c) => c.displayName)));
  check("55 a restaurant card without a restaurant identity fails closed",
    (await threw(async () => await composeModule.composeMealBuddyCandidateList({
      transport: {
        async withTransaction(operation) {
          return await operation({
            query: async (statement, parameters) => {
              if (statement.text.includes("canonical_meal_buddy_context_candidates")) {
                return [{ ...poolRow(OWNERS[0], 0), card_type: "restaurant", restaurant_id: null, restaurant_name: null }];
              }
              if (statement.text.includes("canonical_candidate_taste_sources")) return [{ payload: tastePayload([OWNERS[0]]) }];
              if (statement.text.includes("project_exposed_social_profiles")) {
                return [{ exposure_ordinal: 0, display_name: "N", mascot_avatar_key: "m", public_bio: null, willing_to_chat: true }];
              }
              return [];
            },
            abort: () => { throw new Error("aborted"); }
          });
        },
        async close() {}
      },
      entitlementRowSource: entitlementSource("free"),
      candidateCipher, cardCipher, actorUserId: ACTOR, sourceCardId: SOURCE_CARD, requestInstant: INSTANT
    }))) !== null);

  // --- 9. references and privacy -------------------------------------------------------------------------------
  const serialized = JSON.stringify(premium);
  check("56 the person reference carries the frozen SR-2D marker",
    premium.candidates.every((c) => c.candidateRef.startsWith("scr1.")));
  check("57 the card reference carries the frozen SR-2G-A marker",
    premium.candidates.every((c) => c.candidateCardRef.startsWith("mbc1.")));
  check("58 the person reference is actor-bound",
    (await threw(() => candidateCipher.open(owner(1), premium.candidates[0].candidateRef, INSTANT))) !== null);
  check("59 the card reference is actor-bound and purpose-bound",
    (await threw(() => cardCipher.open(owner(1), "candidate", premium.candidates[0].candidateCardRef, INSTANT))) !== null
    && (await threw(() => cardCipher.open(ACTOR, "source", premium.candidates[0].candidateCardRef, INSTANT))) !== null);
  check("60 the person reference resolves to the exposed person",
    (await candidateCipher.open(ACTOR, premium.candidates[0].candidateRef, INSTANT)).candidateUserId === rankedOwners[0]);
  check("61 no raw owner uuid appears in the response", !OWNERS.some((id) => serialized.includes(id)) && !serialized.includes(ACTOR));
  check("62 no raw card uuid appears in the response",
    !OWNERS.map((_, index) => cardOf(index + 1)).some((id) => serialized.includes(id)) && !serialized.includes(SOURCE_CARD));
  check("63 no profile id, ranking state, score or entitlement fact appears",
    !/profile_?id|rankingState|exposure|score|similarity|premium|entitlement|truncated/i.test(serialized));
  check("64 every request mints fresh references", (await compose()).candidates[0].candidateRef !== premium.candidates[0].candidateRef);

  // --- 10. legal empty ---------------------------------------------------------------------------------------------
  const empty = await compose({ owners: [] });
  check("65 an empty pool is a legal success, not an error",
    empty.policyVersion === "meal-buddy-candidate-api-v1" && Array.isArray(empty.candidates) && empty.candidates.length === 0);
  const emptyResponse = await call({ body: body({ sourceCardRef: SOURCE_REF }) },
    dependencies({ transportFactory: () => createTransport({ owners: [] }) }));
  check("66 the empty result is HTTP 200 with the policy version present",
    emptyResponse.status === 200 && (await emptyResponse.clone().json()).candidates.length === 0
    && (await emptyResponse.json()).policyVersion === "meal-buddy-candidate-api-v1");
  check("67 an empty pool never reveals whether the source card existed",
    JSON.stringify(empty) === JSON.stringify({ policyVersion: "meal-buddy-candidate-api-v1", candidates: [] }));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-d-smoke",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-d-smoke", error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
}
