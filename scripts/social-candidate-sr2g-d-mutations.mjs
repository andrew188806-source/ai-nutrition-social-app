#!/usr/bin/env node
// SR-2G-D meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Three families: the restaurant BRIDGE MIGRATION mutated as text, the REQUEST/RESPONSE
// contract mutated as text, and the ORCHESTRATION mutated through an executable model so a design
// that ranks on interests, reselects a card after exposure, refills, paginates or leaks an
// identifier cannot pass as the frozen composition.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GD_API_ROOT, SR2GD_BRIDGE_FUNCTION, SR2GD_FUNCTION_ROOT, SR2GD_MIGRATION,
  SR2GD_POOL_FUNCTION, SR2GD_POOL_ROLE
} from "./social-candidate-sr2g-d-successor-manifest.mjs";

const root = process.cwd();
const readFile = (f) => fs.readFileSync(path.join(root, f), "utf8");
const sqlExec = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const tsExec = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

const MIGRATION = sqlExec(readFile(SR2GD_MIGRATION));
const REQUEST = readFile(`${SR2GD_API_ROOT}/request.ts`);
const POLICY = readFile(`${SR2GD_API_ROOT}/policy.ts`);
const TYPES = readFile(`${SR2GD_API_ROOT}/types.ts`);
const HANDLER = readFile(`${SR2GD_FUNCTION_ROOT}/handler.ts`);
const ERRORS = readFile(`${SR2GD_FUNCTION_ROOT}/errors.ts`);

// --- family A: the narrow restaurant bridge -------------------------------------------------------
function migrationViolations(migration) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const bridge = SR2GD_BRIDGE_FUNCTION.replace(".", "\\.");

  rec("only the two display columns are granted",
    new RegExp(`grant select \\(id, name\\) on table public\\.restaurants to ${SR2GD_POOL_ROLE};`).test(migration)
    && !/grant select on table public\.restaurants/.test(migration));
  rec("no restaurant write privilege exists",
    !/grant\s+(insert|update|delete|truncate|all)[^;]*public\.restaurants/i.test(migration));
  rec("the restaurant policy is SELECT only and scoped to the pool authority",
    new RegExp(`for select to ${SR2GD_POOL_ROLE} using \\(true\\);`).test(migration)
    && !/for (all|insert|update|delete)/i.test(migration));
  rec("no client role receives a restaurant or bridge grant",
    !/^\s*grant[^;]*\bto (anon|authenticated|authenticator|service_role|public)\b/im.test(migration));
  rec("the bridge composes the frozen pool rather than the card table",
    new RegExp(`from ${SR2GD_POOL_FUNCTION.replace(".", "\\.")}\\(`).test(migration)
    && !/from public\.meal_buddy_cards/.test(migration));
  rec("the bridge adds no eligibility predicate",
    !/dining_date\s*=|meal_period\s*=|cancelled_at|expires_at\s*>|owner_user_id\s*<>/.test(migration));
  rec("the bridge adds no ranking, window function or product cap",
    !/row_number|rank\(\)|limit \d|offset \d/i.test(migration));
  rec("the frozen pool ordering is preserved exactly",
    /order by pool\.candidate_owner_user_id asc, pool\.candidate_card_id asc;/.test(migration));
  rec("the restaurant join is a LEFT join so no candidate can vanish",
    /left join public\.restaurants/.test(migration));
  rec("the internal card columns never reach the projection",
    !/pool\.area|pool\.preferred_time|pool\.created_at|pool\.expires_at/.test(migration));
  rec("no new database role is created", !/create role/i.test(migration));
  rec("the frozen SR-2G-C primitive is never redefined",
    !new RegExp(`(create|replace|drop|alter) function ${SR2GD_POOL_FUNCTION.replace(".", "\\.")}`, "i").test(migration));
  rec("every client and unrelated Social role is revoked from the bridge",
    ["public", "anon", "authenticated", "authenticator", "service_role"]
      .every((role) => new RegExp(`revoke all on function ${bridge}\\(uuid, uuid, timestamptz\\) from ${role};`).test(migration)));
  rec("only the runtime executor receives EXECUTE",
    /grant execute on function[\s\S]*?to social_runtime_executor;/.test(migration)
    && (migration.match(/grant execute on function/g) ?? []).length === 1);
  rec("the transient grantor borrow is restored by grantor",
    (migration.match(/grant \w+ to postgres with inherit false, set true;/g) ?? []).length ===
    (migration.match(/revoke \w+ from postgres granted by postgres;/g) ?? []).length
    && /granted by postgres;/.test(migration));
  rec("the proven-incorrect WITH SET FALSE restoration is never used", !/with set false/i.test(migration));
  rec("transient schema CREATE is revoked again",
    /revoke create on schema social_internal from /.test(migration));
  rec("the migration is transactional", /^begin;/m.test(migration) && /^commit;/m.test(migration));
  return failed;
}

// --- family B: the request and response contract ---------------------------------------------------
function contractViolations({ request, policy, types, handler, errors }) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const dtoBlock = (types.match(/MealBuddyCandidateDto = Readonly<\{[\s\S]*?\}>;/) ?? [""])[0];
  const cardBlock = (types.match(/MealBuddyCandidateCardDto = Readonly<\{[\s\S]*?\}>;/) ?? [""])[0];

  rec("the body carries exactly one business key",
    /keys\.length !== 1 \|\| keys\[0\] !== MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY/.test(request));
  rec("the accepted key is the opaque source reference",
    /MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY = "sourceCardRef"/.test(policy));
  rec("a raw source card id is never accepted", policy.includes('"sourceCardId"'));
  rec("a caller-named actor is never accepted", policy.includes('"actorUserId"'));
  rec("a caller-named candidate is never accepted",
    policy.includes('"candidateUserId"') && policy.includes('"candidateRef"') && policy.includes('"candidateCardRef"'));
  rec("a caller limit, page or cursor is never accepted",
    policy.includes('"limit"') && policy.includes('"page"') && policy.includes('"cursor"'));
  rec("a caller tier or entitlement is never accepted",
    policy.includes('"tier"') && policy.includes('"entitlement"') && policy.includes('"isPremium"'));
  rec("a caller clock is never accepted", policy.includes('"clock"') && policy.includes('"authorityInstant"'));
  rec("a caller eligibility field is never accepted",
    policy.includes('"diningDate"') && policy.includes('"mealPeriod"') && policy.includes('"restaurantId"'));
  rec("caller interests and ranking weights are never accepted",
    policy.includes('"interests"') && policy.includes('"rankingWeights"') && policy.includes('"tasteWeights"'));
  rec("the forbidden key list is actually consulted",
    /MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS\.some/.test(request));
  rec("authority headers are refused",
    ["x-actor-user-id", "x-source-card-id", "x-limit", "x-tier", "x-now"].every((h) => request.includes(h)));
  rec("query parameters are refused", /searchParams/.test(request));
  rec("the reference must carry the frozen card marker", /startsWith\(MEAL_BUDDY_CARD_REF_PREFIX\)/.test(request));
  rec("the endpoint is POST only", /request\.method !== "POST"/.test(handler));
  rec("the actor comes only from the verified session", /authentication\.value\.userId/.test(handler));
  rec("the source reference is opened for the source purpose only",
    /MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE/.test(handler) && !/MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE/.test(handler));
  rec("a failed open is an opaque invalid_request",
    /catch \{\s*return buildMealBuddyCandidateListError\("invalid_request"\);/.test(handler));
  rec("both references are in the client DTO",
    /candidateRef: string/.test(dtoBlock) && /candidateCardRef: string/.test(dtoBlock));
  rec("no raw identifier is in the client DTO",
    !/\b(candidateUserId|ownerUserId|userId|cardId|profileId)\s*:/.test(dtoBlock)
    && !/\b(cardId|ownerUserId)\s*:/.test(cardBlock));
  rec("no ranking, score or entitlement fact is in the client DTO",
    !/\b(rankingState|score|similarity|exposureIndex|entitlement|isPremium|truncated)\s*:/.test(dtoBlock));
  rec("the compact interest DTO exposes category keys only",
    /generalCategoryKeys: readonly string\[\]/.test(types) && !/tagKey|publicInterestTags/.test(types));
  rec("the error vocabulary is exactly three codes",
    /authentication_required: 401/.test(errors) && /invalid_request: 400/.test(errors)
    && /server_unavailable: 503/.test(errors) && !/40[49]:|409/.test(errors));
  rec("no ownership or existence detail reaches a client message",
    !/not[ _]owned|not[ _]found|foreign|another user|owner|belongs to|social_internal|meal_buddy_cards/i.test(
      (errors.match(/const MESSAGE[\s\S]*?\};/) ?? [errors])[0]));
  return failed;
}

// --- family C: the executable orchestration model -----------------------------------------------------
const ACTOR = "A";
const WORLD = Object.freeze({
  owners: Object.freeze([
    // B holds two eligible cards; the frozen pool reduces to the newest, then the id tie-break.
    { id: "B", cards: [{ id: "b2", createdAt: 2 }, { id: "b1", createdAt: 1 }], taste: 0.9, categories: 5 },
    { id: "C", cards: [{ id: "c1", createdAt: 1 }], taste: 0.5, categories: 1 },
    { id: "D", cards: [{ id: "d1", createdAt: 1 }], taste: 0.7, categories: 0, blocked: true },
    { id: "E", cards: [{ id: "e1", createdAt: 1 }], taste: 0.8, categories: 2, nonparticipant: true },
    { id: "F", cards: [{ id: "f1", createdAt: 1 }], taste: 0.4, categories: 4 },
    { id: "G", cards: [{ id: "g1", createdAt: 1 }], taste: 0.3, categories: 0 },
    { id: "H", cards: [{ id: "h1", createdAt: 1 }], taste: 0.2, categories: 1 },
    { id: "A", cards: [{ id: "a1", createdAt: 1 }], taste: 1.0, categories: 9, self: true }
  ]),
  // The projection omits this exposure ordinal, which must leave a gap rather than refill.
  omittedOrdinal: 2
});

const CANONICAL = Object.freeze({
  includeSelf: false, includeBlocked: false, includeNonparticipant: false,
  twoCardsPerOwner: false, reselectAfterRank: false,
  rankByInterests: false, rankByCard: false, premiumBoost: false,
  freeCap: 3, premiumCap: 10, refill: false, paginate: false,
  interestsBeforeExposure: false, interestsFromCard: false, snapshotInterests: false,
  compactVisible: 3, wrongOverflow: false, persistOverflow: false, exposeFineTags: false,
  exposeRawIds: false, exposeScore: false, omitCardRef: false, cardRefPurpose: "candidate",
  entitlement: "premium"
});

function pipeline(rules) {
  // 1. Frozen pool: hard eligibility plus authorization, reduced to one card per owner.
  const pooled = WORLD.owners.filter((o) =>
    (rules.includeSelf || !o.self) && (rules.includeBlocked || !o.blocked) && (rules.includeNonparticipant || !o.nonparticipant));
  const selected = pooled.flatMap((o) => {
    const ordered = [...o.cards].sort((l, r) => r.createdAt - l.createdAt || (l.id < r.id ? -1 : 1));
    return (rules.twoCardsPerOwner ? ordered : ordered.slice(0, 1)).map((card) => ({ owner: o.id, card: card.id, meta: o }));
  });
  // 2. The owner -> card binding, fixed here.
  const binding = new Map();
  for (const row of selected) if (!binding.has(row.owner)) binding.set(row.owner, row.card);

  // Interests exist as CURRENT settings; a snapshot design freezes them onto the card instead.
  const interestsOf = (owner) => {
    const meta = WORLD.owners.find((o) => o.id === owner);
    const source = rules.interestsFromCard || rules.snapshotInterests ? 0 : meta.categories;
    return Array.from({ length: source }, (_, index) => `cat.${index}`);
  };

  // 3. Ranking. Taste ranks PEOPLE; nothing about a card or an interest may enter it. A design that
  //    returned two cards for one owner would rank card ROWS, which is exactly what `selected` is.
  const rankKey = (owner) => {
    const meta = WORLD.owners.find((o) => o.id === owner);
    if (rules.rankByInterests) return meta.categories;
    if (rules.rankByCard) return binding.get(owner).charCodeAt(0);
    if (rules.premiumBoost && rules.entitlement === "premium") return meta.taste + (owner === "H" ? 1 : 0);
    return meta.taste;
  };
  const ranked = selected.map((row) => row.owner)
    .sort((l, r) => rankKey(r) - rankKey(l) || (l < r ? -1 : 1));

  // 4. Exposure: a pure prefix of the ranking.
  const cap = rules.entitlement === "premium" ? rules.premiumCap : rules.freeCap;
  const exposed = ranked.slice(0, cap);

  // 5. Projection over exactly the exposed prefix; an omitted position is never refilled.
  let projected = exposed.filter((_, ordinal) => ordinal !== WORLD.omittedOrdinal);
  if (rules.refill) projected = ranked.filter((owner) => !projected.includes(owner)).slice(0, 1).concat(projected);
  if (rules.paginate) projected = projected.concat(ranked.slice(cap, cap * 2));

  // 6. Interests, read AFTER exposure. Reading them earlier is what a ranking design would need.
  const interestReadOrder = rules.interestsBeforeExposure ? "before_exposure" : "after_exposure";

  // 7. Compact presentation and the client DTO.
  return {
    interestReadOrder,
    binding: Object.fromEntries(binding),
    ranked,
    exposed,
    candidates: projected.map((owner) => {
      const categories = interestsOf(owner);
      const visible = categories.slice(0, rules.compactVisible);
      const overflow = rules.wrongOverflow ? 0 : Math.max(categories.length - rules.compactVisible, 0);
      // A reselect would swap B's frozen newest card for the older one after ranking finished.
      const card = rules.reselectAfterRank && owner === "B" ? "b1" : binding.get(owner);
      return {
        candidateRef: `scr1.${owner}`,
        ...(rules.omitCardRef ? {} : { candidateCardRef: `mbc1.${rules.cardRefPurpose}.${card}` }),
        ...(rules.exposeRawIds ? { candidateUserId: owner, cardId: card } : {}),
        ...(rules.exposeScore ? { rankingState: "scored", score: WORLD.owners.find((o) => o.id === owner).taste } : {}),
        interests: {
          generalCategoryKeys: visible,
          generalOverflowCount: rules.persistOverflow ? `+${overflow}` : overflow,
          ...(rules.exposeFineTags ? { generalTagKeys: categories.map((c) => `${c}.fine`) } : {})
        },
        card: { boundCard: card }
      };
    })
  };
}

function pipelineViolations(rules) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const out = pipeline(rules);
  const free = pipeline({ ...rules, entitlement: "free" });
  const owners = out.candidates.map((c) => c.candidateRef.slice(5));
  const serialized = JSON.stringify(out.candidates);

  rec("the actor is never their own candidate", !owners.includes(ACTOR) && !out.exposed.includes(ACTOR));
  rec("a blocked owner is excluded", !out.exposed.includes("D"));
  rec("a non-participant owner is excluded", !out.exposed.includes("E"));
  rec("one owner appears at most once", new Set(owners).size === owners.length);
  rec("the bound card is the frozen deterministic newest card", out.binding.B === "b2");
  rec("no card is reselected after ranking", out.candidates.every((c) => c.card.boundCard === out.binding[c.candidateRef.slice(5)]));
  rec("ranking follows the Taste order alone",
    JSON.stringify(out.ranked) === JSON.stringify(["B", "F", "G", "H", "C"].sort((l, r) => {
      const t = (id) => WORLD.owners.find((o) => o.id === id).taste;
      return t(r) - t(l) || (l < r ? -1 : 1);
    })));
  rec("interests never change the ranking order",
    JSON.stringify(out.ranked) === JSON.stringify(pipeline({ ...CANONICAL, entitlement: rules.entitlement }).ranked));
  rec("the Premium exposure cap is ten", rules.premiumCap === 10 && out.exposed.length <= 10);
  rec("the Free exposure cap is three", rules.freeCap === 3 && free.exposed.length <= 3);
  rec("exposure is a pure prefix of the ranking",
    out.exposed.every((owner, index) => owner === out.ranked[index]));
  rec("an omitted position is never refilled",
    out.candidates.length === out.exposed.length - 1
    && free.candidates.length === free.exposed.length - 1);
  rec("no page beyond the exposure prefix is ever returned",
    owners.every((owner) => out.exposed.includes(owner))
    && free.candidates.every((c) => free.exposed.includes(c.candidateRef.slice(5))));
  rec("interests are read after exposure", out.interestReadOrder === "after_exposure");
  rec("interests come from current settings, never from the card or a snapshot",
    out.candidates.find((c) => c.candidateRef === "scr1.B")?.interests.generalCategoryKeys.length > 0);
  rec("the compact line shows at most three categories",
    out.candidates.every((c) => c.interests.generalCategoryKeys.length <= 3));
  rec("the overflow count is the derived remainder",
    out.candidates.find((c) => c.candidateRef === "scr1.B")?.interests.generalOverflowCount === 2);
  rec("no '+N' label is ever produced", !serialized.includes("+"));
  rec("no fine-grained interest tag reaches the DTO", !/fine/.test(serialized));
  rec("no raw owner or card identifier reaches the DTO", !/candidateUserId|"cardId"/.test(serialized));
  rec("no score, ranking state or entitlement fact reaches the DTO", !/rankingState|"score"/.test(serialized));
  rec("both references are always present",
    out.candidates.every((c) => typeof c.candidateRef === "string" && typeof c.candidateCardRef === "string"));
  rec("the card reference is minted for the candidate purpose",
    out.candidates.every((c) => c.candidateCardRef?.startsWith("mbc1.candidate.")));
  return failed;
}

// --- mutants --------------------------------------------------------------------------------------------
const migrationMutants = [
  ["the bridge is granted the whole restaurants table", (m) => m.replace("grant select (id, name) on table public.restaurants", "grant select on table public.restaurants")],
  ["the bridge is granted restaurant writes", (m) => m.replace("grant select (id, name) on table public.restaurants", "grant select, insert, update on table public.restaurants")],
  ["the restaurant policy is opened to every command", (m) => m.replace("for select to meal_buddy_candidate_pool_authority", "for all to meal_buddy_candidate_pool_authority")],
  ["a client role is granted the restaurant read", (m) => m.replace("grant select (id, name) on table public.restaurants to meal_buddy_candidate_pool_authority;", "grant select (id, name) on table public.restaurants to authenticated;")],
  ["the bridge reads the card table directly instead of the frozen pool", (m) => m.replace(/from social_internal\.canonical_meal_buddy_candidate_cards\([\s\S]*?\) as pool/, "from public.meal_buddy_cards as pool")],
  ["the bridge duplicates the hard date eligibility rule", (m) => m.replace("  left join public.restaurants as restaurant", "  where pool.dining_date = current_date\n  left join public.restaurants as restaurant")],
  ["the bridge drops candidates whose restaurant row is missing", (m) => m.replace("left join public.restaurants as restaurant", "join public.restaurants as restaurant")],
  ["the bridge reorders the pool", (m) => m.replace("order by pool.candidate_owner_user_id asc, pool.candidate_card_id asc;", "order by restaurant.name asc;")],
  ["the bridge introduces its own product cap", (m) => m.replace("order by pool.candidate_owner_user_id asc, pool.candidate_card_id asc;", "order by pool.candidate_owner_user_id asc, pool.candidate_card_id asc\n  limit 3;")],
  ["the bridge re-selects one card per owner itself", (m) => m.replace("  select\n    pool.candidate_owner_user_id,", "  select\n    pg_catalog.row_number() over (partition by pool.candidate_owner_user_id) as owner_rank,\n    pool.candidate_owner_user_id,")],
  ["the bridge leaks the internal card timestamps", (m) => m.replace("    pool.meal_period\n", "    pool.meal_period,\n    pool.created_at,\n    pool.expires_at\n")],
  ["a client role is granted EXECUTE on the bridge", (m) => m.replace(/revoke all on function social_internal\.meal_buddy_candidate_cards_with_restaurant\(uuid, uuid, timestamptz\) from authenticated;\n/, "")],
  ["the bridge is granted to a client role", (m) => m.replace("to social_runtime_executor;", "to authenticated;")],
  ["a new database role is created", (m) => m.replace("begin;", "begin;\ncreate role meal_buddy_restaurant_authority with nologin;")],
  ["the frozen SR-2G-C pool primitive is redefined", (m) => m.replace("commit;", "create or replace function social_internal.canonical_meal_buddy_candidate_cards(uuid, uuid, timestamptz) returns void language sql as $x$ select $x$;\ncommit;")],
  ["the transient grantor borrow is left unrestored", (m) => m.replace("revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;", "")],
  ["restoration uses the proven-incorrect WITH SET FALSE form", (m) => m.replace("revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;", "grant meal_buddy_candidate_pool_authority to postgres with set false;")],
  ["transient schema CREATE is left in place", (m) => m.replace("revoke create on schema social_internal from meal_buddy_candidate_pool_authority;", "")],
  ["the migration stops being transactional", (m) => m.replace(/^begin;$/m, "")]
];

const contractMutants = [
  ["a raw source card id is accepted", (s) => ({ ...s, policy: s.policy.replace('"sourceCardId", ', ""), request: s.request.replace('MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY = "sourceCardRef"', 'MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY = "sourceCardId"') })],
  ["a caller-supplied actor is accepted", (s) => ({ ...s, policy: s.policy.replace('"actorUserId", ', "") })],
  ["a caller-supplied limit is accepted", (s) => ({ ...s, policy: s.policy.replace('"limit", ', "") })],
  ["a caller-supplied page is accepted", (s) => ({ ...s, policy: s.policy.replace('"page", ', "") })],
  ["a caller-supplied tier is accepted", (s) => ({ ...s, policy: s.policy.replace('"tier", ', "") })],
  ["a caller-supplied clock is accepted", (s) => ({ ...s, policy: s.policy.replace('"clock", ', "") })],
  ["caller-supplied eligibility fields are accepted", (s) => ({ ...s, policy: s.policy.replace('"diningDate", ', "") })],
  ["caller-supplied interests are accepted", (s) => ({ ...s, policy: s.policy.replace('"interests", ', "") })],
  ["caller-supplied ranking weights are accepted", (s) => ({ ...s, policy: s.policy.replace('"rankingWeights"', '"unused"') })],
  ["extra body keys are silently ignored", (s) => ({ ...s, request: s.request.replace("keys.length !== 1 || keys[0] !== MEAL_BUDDY_CANDIDATE_API_REQUEST_KEY", "false") })],
  ["the forbidden key list is never consulted", (s) => ({ ...s, request: s.request.replace("MEAL_BUDDY_CANDIDATE_API_FORBIDDEN_REQUEST_KEYS.some", "[].some") })],
  ["authority headers are ignored", (s) => ({ ...s, request: s.request.replace(/"x-actor-user-id",\n/, "") })],
  ["query parameters are ignored", (s) => ({ ...s, request: s.request.replace("searchParams", "noParams") })],
  ["any string is accepted as a source reference", (s) => ({ ...s, request: s.request.replace("!sourceCardRef.startsWith(MEAL_BUDDY_CARD_REF_PREFIX)", "false") })],
  ["the endpoint accepts any verb", (s) => ({ ...s, handler: s.handler.replace('request.method !== "POST"', "false") })],
  ["a candidate-purpose reference is accepted as a source", (s) => ({ ...s, handler: s.handler.replace("MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE", "MEAL_BUDDY_CARD_REF_PURPOSE_CANDIDATE") })],
  ["a failed reference open becomes a distinguishable error", (s) => ({ ...s, handler: s.handler.replace('return buildMealBuddyCandidateListError("invalid_request");\n  }\n\n  const transport', 'return buildMealBuddyCandidateListError("server_unavailable");\n  }\n\n  const transport') })],
  ["the actor is taken from the request instead of the session", (s) => ({ ...s, handler: s.handler.replace("const actorUserId = authentication.value.userId;", "const actorUserId = String(parsed.value.sourceCardRef);") })],
  ["the candidate card reference is dropped from the DTO", (s) => ({ ...s, types: s.types.replace("  candidateCardRef: string;\n", "") })],
  ["a raw candidate user id is added to the DTO", (s) => ({ ...s, types: s.types.replace("  candidateRef: string;", "  candidateRef: string;\n  candidateUserId: string;") })],
  ["a raw card id is added to the card DTO", (s) => ({ ...s, types: s.types.replace("export type MealBuddyCandidateCardDto = Readonly<{\n  diningDate: string;", "export type MealBuddyCandidateCardDto = Readonly<{\n  cardId: string;\n  diningDate: string;") })],
  ["the ranking state is disclosed", (s) => ({ ...s, types: s.types.replace("  willingToChat: boolean;\n  interests:", "  willingToChat: boolean;\n  rankingState: string;\n  interests:") })],
  ["fine-grained interest tags are disclosed", (s) => ({ ...s, types: s.types.replace("  generalCategoryKeys: readonly string[];", "  publicInterestTags: readonly string[];\n  generalCategoryKeys: readonly string[];") })],
  ["an ownership-revealing error code is introduced", (s) => ({ ...s, errors: s.errors.replace('invalid_request: "The request is invalid."', 'invalid_request: "The card is not owned by this user."') })],
  ["a 409 quota outcome leaks into this contract", (s) => ({ ...s, errors: s.errors.replace("  invalid_request: 400,", "  invalid_request: 400,\n  card_quota_exceeded: 409,") })]
];

const pipelineMutants = [
  ["the actor becomes their own candidate", { includeSelf: true }],
  ["a blocked owner is included", { includeBlocked: true }],
  ["a non-participant owner is included", { includeNonparticipant: true }],
  ["an owner returns two cards", { twoCardsPerOwner: true }],
  ["the card is reselected after ranking", { reselectAfterRank: true }],
  ["interests become a ranking input", { rankByInterests: true }],
  ["card data becomes a ranking input", { rankByCard: true }],
  ["Premium receives a rank boost", { premiumBoost: true }],
  ["the Free exposure cap is raised", { freeCap: 5 }],
  ["the Premium exposure cap is raised", { premiumCap: 20 }],
  ["an omitted candidate is refilled", { refill: true }],
  ["a second page is returned", { paginate: true }],
  ["interests are read before exposure", { interestsBeforeExposure: true }],
  ["interests are read from the card", { interestsFromCard: true }],
  ["interests are snapshotted at card creation", { snapshotInterests: true }],
  ["more than three categories are shown", { compactVisible: 5 }],
  ["the overflow count is wrong", { wrongOverflow: true }],
  ["the overflow marker is persisted as a label", { persistOverflow: true }],
  ["fine-grained tags are exposed", { exposeFineTags: true }],
  ["raw identifiers are exposed", { exposeRawIds: true }],
  ["the Taste score is exposed", { exposeScore: true }],
  ["the candidate card reference is omitted", { omitCardRef: true }],
  ["the card reference is minted for the wrong purpose", { cardRefPurpose: "source" }]
];

const results = [];
const push = (name, applied, failed) => {
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
};

const CONTRACT = { request: tsExec(REQUEST), policy: tsExec(POLICY), types: tsExec(TYPES), handler: tsExec(HANDLER), errors: tsExec(ERRORS) };

let baselineBroken = false;
for (const [label, value, fn] of [
  ["canonical restaurant bridge satisfies the exact SR-2G-D contract", MIGRATION, migrationViolations],
  ["canonical request and response contract satisfies the exact SR-2G-D contract", CONTRACT, contractViolations],
  ["canonical orchestration satisfies the exact SR-2G-D contract", CANONICAL, pipelineViolations]
]) {
  const failed = fn(value);
  results.push({ name: label, applied: true, killed: failed.length === 0, status: failed.length === 0 ? "killed" : "survived", violations: failed });
  if (failed.length) {
    baselineBroken = true;
    console.log(`BASELINE BROKEN ${label}: ${failed.join(" | ")}`);
  } else {
    console.log(`BASELINE OK ${label}`);
  }
}

for (const [name, apply] of migrationMutants) {
  const mutated = apply(MIGRATION);
  const applied = mutated !== MIGRATION;
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  push(name, applied, applied ? migrationViolations(mutated) : ["mutation did not apply"]);
}
for (const [name, apply] of contractMutants) {
  const mutated = apply(CONTRACT);
  const applied = JSON.stringify(mutated) !== JSON.stringify(CONTRACT);
  push(name, applied, applied ? contractViolations(mutated) : ["mutation did not apply"]);
}
for (const [name, override] of pipelineMutants) push(name, true, pipelineViolations({ ...CANONICAL, ...override }));

const survivors = results.filter((r) => r.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-d-mutations",
  total: results.length, killed: results.length - survivors.length, survived: survivors.length,
  baselineBroken, survivors, repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
