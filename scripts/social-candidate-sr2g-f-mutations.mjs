#!/usr/bin/env node
// SR-2G-F meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Three families:
//
//   A. the SERVER COMPOSITION, mutated as text over the real Edge sources
//   B. the CONTEXT CLASSIFICATION, mutated through an executable model of the SQL rule
//   C. the SQL AUTHORITY ITSELF, mutated as text over the real migration
//
// so a design that ignores context, applies it after exposure, lets a client supply it, scores it as
// a float, treats missing evidence as negative, reads general interests or health data, breaks a
// legacy no-context card, bypasses the frozen pool or leaks a context internal cannot pass as this
// one.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GF_CONTEXT_ROOT, SR2GF_CANDIDATE_API_ROOT, SR2GF_CARD_API_ROOT, SR2GF_CONTEXT_PRIMITIVE,
  SR2GF_CONTEXT_STATES, SR2GF_FORBIDDEN_HEALTH_EVIDENCE, SR2GF_FORBIDDEN_SCORE_MARKERS,
  SR2GF_FROZEN_POOL_PRIMITIVE, SR2GF_MIGRATION
} from "./social-candidate-sr2g-f-successor-manifest.mjs";

const root = process.cwd();
const readFile = (f) => fs.readFileSync(path.join(root, f), "utf8");
const tsExec = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
const sqlExec = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
// A `comment on ... is '...'` body is documentation that legitimately NAMES the concepts the
// executable statements must never touch, so it is stripped before any "must not appear" scan.
const sqlProse = (s) => sqlExec(s).replace(/comment on [\s\S]*?';/g, "");
// Just the context primitive's body. The successor write and list functions in the same migration
// legitimately reproduce the frozen owner-card ordering, which is not candidate eligibility.
const contextBody = (s) => {
  const start = s.indexOf("create function social_internal.canonical_meal_buddy_context_candidates(");
  const end = s.indexOf("comment on function social_internal.canonical_meal_buddy_context_candidates");
  return start < 0 || end < 0 ? "" : sqlExec(s.slice(start, end));
};

const SOURCES = {
  migration: readFile(SR2GF_MIGRATION),
  contextCompose: readFile(`${SR2GF_CONTEXT_ROOT}/composeContextRanking.ts`),
  contextPolicy: readFile(`${SR2GF_CONTEXT_ROOT}/policy.ts`),
  contextTypes: readFile(`${SR2GF_CONTEXT_ROOT}/types.ts`),
  compose: readFile(`${SR2GF_CANDIDATE_API_ROOT}/compose.ts`),
  readCards: readFile(`${SR2GF_CANDIDATE_API_ROOT}/readCandidateCards.ts`),
  dto: readFile(`${SR2GF_CANDIDATE_API_ROOT}/toCandidateDto.ts`),
  validate: readFile(`${SR2GF_CARD_API_ROOT}/validate.ts`),
  picker: readFile("apps/mobile/features/meal-buddy-candidates/MealBuddyRealSourceCardPicker.tsx")
};

// --- family A: the server composition ------------------------------------------------------------
function compositionViolations(s) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const composeExec = tsExec(s.compose);
  const contextExec = tsExec(s.contextCompose);
  const migrationExec = sqlExec(s.migration);

  rec("the context stage runs before ranking and exposure",
    composeExec.includes("composeMealBuddyContextRanking")
    && composeExec.indexOf("composeMealBuddyContextRanking") < composeExec.indexOf("applySocialExposure"));
  rec("the composition reads the SR-2G-F context primitive",
    s.readCards.includes(`social_internal.${SR2GF_CONTEXT_PRIMITIVE}(`));
  rec("the context label reaches the bucket composer",
    /contextByCandidateUserId: new Map\(\s*selectedCards\.map\(\(card\) => \[card\.ownerUserId, card\.contextState\]\)/.test(composeExec));
  rec("SR-2A is called, never reimplemented", /rankSocialCandidates\(/.test(contextExec)
    && !/similarity|\.score\b|rankingState/.test(contextExec));
  rec("the ranking policy version is read back from SR-2A", /ranked\[0\]\.policyVersion/.test(contextExec));
  rec("no candidate is dropped by bucketing", /ordered\.length !== candidates\.length/.test(contextExec));
  rec("an unlabelled or unknown-state candidate fails closed",
    /bucket === undefined\) return mealBuddyContextContractViolation\(\)/.test(contextExec));
  rec("an out-of-vocabulary state from the database fails closed",
    /CONTEXT_STATES\.has\(row\.context_state\)/.test(tsExec(s.readCards)));
  rec("exposure receives the ranking result untouched",
    /applySocialExposure\(ranking, entitlement\)/.test(composeExec));
  rec("nothing reorders or re-filters after exposure",
    !/exposure[\s\S]{0,300}(\.sort\(|contextState|\.filter\()/.test(composeExec));
  rec("no exposure cap is restated in the context layer",
    !/\b(3|10)\b/.test(contextExec) && !/slice\(/.test(contextExec));
  rec("no context score, weight or threshold exists",
    !SR2GF_FORBIDDEN_SCORE_MARKERS.some((m) => new RegExp(`\\b${m}\\b`).test(contextExec + tsExec(s.contextPolicy))));
  rec("the bucket sequence is fixed",
    /\["matched", "neutral", "unsupported"\]/.test(s.contextTypes));
  rec("no randomization exists", !/Math\.random|shuffle/.test(contextExec + migrationExec));
  rec("no client-supplied context is accepted by the candidate endpoint",
    !/body\.[a-zA-Z]*[Cc]ontext|contextWeights|desiredDish/.test(`${composeExec}\n${tsExec(s.readCards)}`));
  rec("the context state never reaches the client DTO", !/contextState|context_state/.test(s.dto));
  rec("no matchReasons or explanation is emitted", !/matchReason|whyMatched|explanation/i.test(s.dto + composeExec));
  rec("a free-text dish can never be a context",
    /\^food\\\.\[a-z0-9_\]\+/.test(s.validate) && /FOOD_CONTEXT_TAG_KEY\.test/.test(s.validate));
  rec("the required create keys stay required",
    /CREATE_KEYS\.every\(\(key\) => Object\.hasOwn\(body, key\)\)/.test(s.validate));
  rec("unknown create keys stay rejected",
    /keys\.every\(\(key\) => known\.has\(key\)\)/.test(s.validate));
  rec("Mobile performs no context matching or ranking",
    !/\.sort\(|\.filter\(|matched|unsupported|bucket/i.test(tsExec(s.picker).replace(/foodContextTagKey/g, "")));
  rec("Mobile resolves the context label from the canonical catalog",
    /resolveInterestCategoryLabel\(controller\.labels, card\.foodContextTagKey\)/.test(s.picker)
    && !/(火鍋|壽司|拉麵)/.test(tsExec(s.picker)));
  return failed;
}

// --- family B: the executable classification model -------------------------------------------------
// A faithful model of the SQL CASE expression. The mutants below change the RULE, not the data.
const CATALOG = Object.freeze({
  "food.taiwanese_chinese.hotpot": "food.taiwanese_chinese",
  "food.japanese.sushi": "food.japanese",
  "food.japanese.ramen": "food.japanese",
  "food.japanese.izakaya": "food.japanese",
  "food.western.steak": "food.western",
  "food.dessert_drinks.dessert": "food.dessert_drinks"
});
const family = (key) => CATALOG[key] ?? null;

// Ten candidates: some declare a card context, some declare only profile food interests, some
// declare nothing at all. Deliberately overlapping, so no context yields a disjoint fake universe.
const CANDIDATES = Object.freeze([
  { id: "A", cardContext: "food.taiwanese_chinese.hotpot", food: ["food.taiwanese_chinese.hotpot"] },
  { id: "B", cardContext: "food.japanese.sushi", food: ["food.japanese.sushi", "food.japanese.ramen"] },
  { id: "C", cardContext: "food.japanese.ramen", food: ["food.japanese.ramen"] },
  { id: "D", cardContext: "food.japanese.izakaya", food: ["food.japanese.izakaya"] },
  { id: "E", cardContext: "food.western.steak", food: ["food.western.steak"] },
  { id: "F", cardContext: null, food: ["food.japanese.sushi", "food.taiwanese_chinese.hotpot"] },
  { id: "G", cardContext: null, food: ["food.japanese.ramen"] },
  { id: "H", cardContext: null, food: [] },
  { id: "I", cardContext: null, food: ["food.dessert_drinks.dessert"] },
  // General-namespace interests only. They must never be food-context evidence.
  { id: "J", cardContext: null, food: [], general: ["general.gaming.esports", "general.entertainment.movie"] },
  // Declares a restriction touching the hotpot family. It must stay NEUTRAL: a restriction is health
  // data, and meal context is an explicit preference, never a medical inference about somebody.
  { id: "K", cardContext: null, food: [], restrictions: ["food.taiwanese_chinese.hotpot"] }
]);

const CANONICAL = Object.freeze({
  useCardContext: true, exactIsMatched: true, familyIsNeutral: true,
  conflictIsUnsupported: true, profileLifts: true, missingIsNeutral: true,
  profileDemotes: false, generalIsEvidence: false, restrictionIsNegative: false,
  nullContextLabelsAll: "neutral", removesUnsupported: false
});

function classify(rules, sourceContext, candidate) {
  if (sourceContext === null) return rules.nullContextLabelsAll;
  const sourceFamily = family(sourceContext);
  const declared = rules.useCardContext ? candidate.cardContext : null;
  if (declared !== null) {
    if (declared === sourceContext) return rules.exactIsMatched ? "matched" : "neutral";
    if (family(declared) === sourceFamily) return rules.familyIsNeutral ? "neutral" : "matched";
    return rules.conflictIsUnsupported ? "unsupported" : "neutral";
  }
  if (rules.restrictionIsNegative && (candidate.restrictions ?? []).includes(sourceContext)) return "unsupported";
  const evidence = [
    ...(candidate.food ?? []),
    ...(rules.generalIsEvidence ? (candidate.general ?? []) : [])
  ];
  if (evidence.includes(sourceContext)) return rules.profileLifts ? "matched" : "neutral";
  if (rules.profileDemotes) return "unsupported";
  return rules.missingIsNeutral ? "neutral" : "unsupported";
}

const ORDER = Object.freeze(["matched", "neutral", "unsupported"]);
function classifyAll(rules, sourceContext) {
  const labelled = CANDIDATES.map((candidate) => ({ id: candidate.id, state: classify(rules, sourceContext, candidate) }));
  const kept = rules.removesUnsupported ? labelled.filter((e) => e.state !== "unsupported") : labelled;
  // SR-2A's order inside a bucket is its own; the model uses the stable id order it would produce.
  return kept.slice().sort((l, r) => (ORDER.indexOf(l.state) - ORDER.indexOf(r.state)) || (l.id < r.id ? -1 : 1));
}
const idsOf = (rows) => rows.map((e) => e.id).join("");
const statesOf = (rules, ctx) => Object.fromEntries(classifyAll(rules, ctx).map((e) => [e.id, e.state]));

function classificationViolations(rules) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const HOTPOT = "food.taiwanese_chinese.hotpot";
  const SUSHI = "food.japanese.sushi";
  const RAMEN = "food.japanese.ramen";
  const hotpot = statesOf(rules, HOTPOT);
  const sushi = statesOf(rules, SUSHI);
  const ramen = statesOf(rules, RAMEN);
  const legacy = statesOf(rules, null);

  rec("a null source context labels every candidate neutral",
    Object.values(legacy).every((state) => state === "neutral"));
  rec("a legacy no-context card keeps the whole universe",
    classifyAll(rules, null).length === CANDIDATES.length);
  rec("an exact card declaration is matched", hotpot.A === "matched" && sushi.B === "matched" && ramen.C === "matched");
  rec("the same cuisine family is neutral, never promoted to matched",
    sushi.C === "neutral" && ramen.B === "neutral" && sushi.D === "neutral");
  rec("a different family declared on the card is unsupported",
    sushi.A === "unsupported" && hotpot.B === "unsupported" && hotpot.E === "unsupported");
  rec("a profile food declaration lifts a card without context",
    hotpot.F === "matched" && sushi.F === "matched" && ramen.G === "matched");
  rec("missing evidence is neutral, never negative",
    hotpot.H === "neutral" && sushi.H === "neutral" && ramen.H === "neutral" && sushi.I === "neutral");
  rec("a profile declaration never demotes anybody",
    !Object.values(hotpot).includes("unsupported") || CANDIDATES.some((c) => c.cardContext !== null));
  rec("general interests are never food-context evidence", hotpot.J === "neutral" && sushi.J === "neutral");
  rec("a declared restriction never makes anybody unsupported", hotpot.K === "neutral" && sushi.K === "neutral");
  rec("no candidate is ever removed by context",
    classifyAll(rules, HOTPOT).length === CANDIDATES.length
    && classifyAll(rules, SUSHI).length === CANDIDATES.length);
  rec("hotpot and sushi produce different orders", idsOf(classifyAll(rules, HOTPOT)) !== idsOf(classifyAll(rules, SUSHI)));
  rec("sushi and ramen produce different orders", idsOf(classifyAll(rules, SUSHI)) !== idsOf(classifyAll(rules, RAMEN)));
  rec("a context genuinely reorders relative to the legacy result",
    idsOf(classifyAll(rules, HOTPOT)) !== idsOf(classifyAll(rules, null)));
  rec("matched precedes neutral precedes unsupported",
    classifyAll(rules, HOTPOT).map((e) => ORDER.indexOf(e.state)).every((v, i, a) => i === 0 || a[i - 1] <= v));
  rec("exact equality is not a global hard exclusion",
    classifyAll(rules, HOTPOT).filter((e) => e.state !== "unsupported").length > 1);
  return failed;
}

// --- family C: the SQL authority --------------------------------------------------------------------
function sqlViolations(s) {
  const failed = [];
  const rec = (n, c) => { if (!c) failed.push(n); };
  const m = sqlProse(s.migration);
  const body = contextBody(s.migration);

  rec("the primitive composes the frozen SR-2G-D bridge",
    body.includes(`social_internal.${SR2GF_FROZEN_POOL_PRIMITIVE}(`));
  rec("hard eligibility is not reimplemented",
    !/authorized_candidates|row_number\(\) over|partition by|social_blocks|social_participation/i.test(body));
  rec("the restaurant hard rule is not restated", !/candidate\.restaurant_id|restaurant_id = source/.test(m));
  rec("only the food namespace is read", !/namespace = 'general'/.test(m));
  rec("no health, allergy, restriction or nutrition source is read",
    !SR2GF_FORBIDDEN_HEALTH_EVIDENCE.some((k) => new RegExp(k, "i").test(m)));
  rec("the source context is read only from a card the actor owns",
    /card\.id = p_source_card_id[\s\S]{0,120}card\.owner_user_id = p_actor_user_id/.test(m));
  rec("a null source context labels everything neutral",
    /when not exists \(select 1 from source_context\) then 'neutral'/.test(m));
  rec("the closed vocabulary is emitted", SR2GF_CONTEXT_STATES.every((state) => m.includes(`'${state}'`)));
  rec("no pool row is filtered away", !/where\s+pool\./i.test(m) && /left join candidate_context/.test(m));
  rec("the context column is optional", !/food_context_tag_key text not null/.test(m));
  rec("the namespace is pinned by referential integrity",
    /references public\.social_interest_catalog \(tag_key, namespace\)/.test(m));
  rec("the write authority validates selectable and active",
    /catalog\.selectable[\s\S]{0,40}catalog\.active/.test(m));
  rec("an invalid context raises rather than storing", /INVALID_FOOD_CONTEXT/.test(m));
  // A -1 from indexOf is not "earlier": both anchors must exist before their order means anything.
  rec("the quota cap is still computed before the quota check",
    m.includes("v_cap := case p_card_type") && m.includes("if v_used >= v_cap")
    && m.indexOf("v_cap := case p_card_type") < m.indexOf("if v_used >= v_cap"));
  rec("no frozen function is replaced or dropped", !/create or replace function|drop function/i.test(m));
  rec("the transient grantor borrow is revoked",
    (m.match(/granted by postgres/g) ?? []).length === 2 && !/set option false/i.test(m));
  rec("no client role may execute the primitive",
    ["anon", "authenticated", "service_role"].every((role) =>
      new RegExp(`revoke all on function social_internal\\.${SR2GF_CONTEXT_PRIMITIVE}[^\\n]*from ${role};`).test(m)));
  rec("the added policy is scoped to one authority role",
    /for select to meal_buddy_candidate_pool_authority using \(true\)/.test(m));
  return failed;
}

// --- mutants ------------------------------------------------------------------------------------------
const compositionMutants = [
  ["the context stage is removed entirely", (s) => ({ ...s, compose: s.compose.replace(/const ranking = composeMealBuddyContextRanking\(\{[\s\S]*?\n  \}\);/, "const ranking = rankSocialCandidates(rankingInputs);") })],
  ["context is applied AFTER exposure", (s) => ({ ...s, compose: s.compose.replace("const exposure = applySocialExposure(ranking, entitlement);", "const exposure = applySocialExposure(ranking, entitlement);\n  exposure.exposed.sort((l, r) => (l.contextState < r.contextState ? -1 : 1));") })],
  ["the frozen pool is read directly, skipping context", (s) => ({ ...s, readCards: s.readCards.replace(`social_internal.${SR2GF_CONTEXT_PRIMITIVE}(`, `social_internal.${SR2GF_FROZEN_POOL_PRIMITIVE}(`) })],
  ["the label is taken from a client field instead of the card", (s) => ({ ...s, compose: s.compose.replace("[card.ownerUserId, card.contextState]", "[card.ownerUserId, body.foodContext]") })],
  ["SR-2A is reimplemented inside the context layer", (s) => ({ ...s, contextCompose: `${s.contextCompose}\nconst score = candidates.map((c) => c.result.taste.similarity.score);` })],
  ["a context float score is introduced", (s) => ({ ...s, contextCompose: `${s.contextCompose}\nconst contextScore = 0.75;` })],
  ["the ranking policy version is minted locally", (s) => ({ ...s, contextCompose: s.contextCompose.replace("policyVersion: ranked[0].policyVersion", 'policyVersion: "social-ranking-v1"') })],
  ["bucketing silently drops candidates", (s) => ({ ...s, contextCompose: s.contextCompose.replace("if (ordered.length !== candidates.length) return mealBuddyContextContractViolation();", "") })],
  ["an unlabelled candidate defaults to neutral", (s) => ({ ...s, contextCompose: s.contextCompose.replace("if (bucket === undefined) return mealBuddyContextContractViolation();", 'const safe = bucket ?? buckets.get("neutral");') })],
  ["an unknown database state is accepted", (s) => ({ ...s, readCards: s.readCards.replace("!CONTEXT_STATES.has(row.context_state)", "false") })],
  ["a client-side cap is applied to the contextual order", (s) => ({ ...s, contextCompose: s.contextCompose.replace("const ordered = ranked.flatMap((result) => [...result.ordered]);", "const ordered = ranked.flatMap((result) => [...result.ordered]).slice(0, 10);") })],
  ["the bucket order is randomized", (s) => ({ ...s, contextCompose: s.contextCompose.replace("const ordered = ranked.flatMap((result) => [...result.ordered]);", "const ordered = ranked.flatMap((result) => [...result.ordered]).sort(() => Math.random() - 0.5);") })],
  ["the context state is projected to the client", (s) => ({ ...s, dto: s.dto.replace("intentionType: card.intentionType,", "intentionType: card.intentionType,\n    contextState: card.contextState,") })],
  ["a matchReasons field is added", (s) => ({ ...s, dto: s.dto.replace("intentionType: card.intentionType,", 'intentionType: card.intentionType,\n    matchReason: "same food",') })],
  ["an arbitrary free-text dish is accepted as a context", (s) => ({ ...s, validate: s.validate.replace("if (!FOOD_CONTEXT_TAG_KEY.test(trimmed)) return { ok: false };", "") })],
  ["unknown request keys become silently ignored", (s) => ({ ...s, validate: s.validate.replace("if (!keys.every((key) => known.has(key))) return { ok: false };", "") })],
  ["a required create key becomes droppable", (s) => ({ ...s, validate: s.validate.replace("if (!CREATE_KEYS.every((key) => Object.hasOwn(body, key))) return { ok: false };", "") })],
  ["Mobile filters the candidate list by context", (s) => ({ ...s, picker: `${s.picker}\nconst shown = cards.filter((c) => c.foodContextTagKey === "matched");` })],
  ["Mobile hard-codes the context labels", (s) => ({ ...s, picker: s.picker.replace("resolveInterestCategoryLabel(controller.labels, card.foodContextTagKey)", '"火鍋"') })]
];

const classificationMutants = [
  ["the card context is ignored entirely", { useCardContext: false }],
  ["an exact declaration is no longer matched", { exactIsMatched: false }],
  ["the whole cuisine family is treated as matched", { familyIsNeutral: false }],
  ["a conflicting declaration is silently neutral", { conflictIsUnsupported: false }],
  ["profile food evidence no longer lifts", { profileLifts: false }],
  ["missing evidence is treated as negative", { missingIsNeutral: false }],
  ["absence of a tag is read as dislike", { profileDemotes: true }],
  ["a dietary restriction is read as a negative signal", { restrictionIsNegative: true }],
  ["a legacy no-context card is labelled unsupported", { nullContextLabelsAll: "unsupported" }],
  ["a legacy no-context card is labelled matched", { nullContextLabelsAll: "matched" }],
  ["unsupported candidates are removed from the pool", { removesUnsupported: true }]
];

const sqlMutants = [
  ["the primitive stops composing the frozen bridge", (s) => ({ ...s, migration: s.migration.replace(`social_internal.${SR2GF_FROZEN_POOL_PRIMITIVE}(`, "public.meal_buddy_cards_direct(") })],
  ["hard eligibility is duplicated inside the context primitive", (s) => ({ ...s, migration: s.migration.replace("  with pool as (", "  with authorized as (select * from social_internal.authorized_candidates(p_actor_user_id, '{}')),\n  pool as (") })],
  ["the restaurant hard rule is restated", (s) => ({ ...s, migration: `${s.migration}\nselect 1 where candidate.restaurant_id = 'x';` })],
  ["general interests are read as evidence", (s) => ({ ...s, migration: s.migration.replace("where selection.namespace = 'food'", "where selection.namespace = 'general'") })],
  ["a dietary restriction is read as evidence", (s) => ({ ...s, migration: `${s.migration}\nselect * from public.dietary_restrictions;` })],
  ["ownership is dropped from the source context lookup", (s) => ({ ...s, migration: s.migration.replace("      and card.owner_user_id = p_actor_user_id\n", "") })],
  ["a null source context no longer means neutral", (s) => ({ ...s, migration: s.migration.replace("when not exists (select 1 from source_context) then 'neutral'", "when not exists (select 1 from source_context) then 'unsupported'") })],
  ["unsupported candidates are filtered out of the pool", (s) => ({ ...s, migration: s.migration.replace("  from pool\n  left join candidate_context", "  from pool\n  where pool.card_type is not null\n  left join candidate_context") })],
  ["the context column becomes mandatory", (s) => ({ ...s, migration: s.migration.replace("add column food_context_tag_key text,", "add column food_context_tag_key text not null,") })],
  ["the namespace pin is dropped from the foreign key", (s) => ({ ...s, migration: s.migration.replace("references public.social_interest_catalog (tag_key, namespace)", "references public.social_interest_catalog (tag_key)") })],
  ["an inactive catalog tag becomes selectable as a context", (s) => ({ ...s, migration: s.migration.replace("      and catalog.selectable\n      and catalog.active", "      and true") })],
  ["an invalid context is stored instead of rejected", (s) => ({ ...s, migration: s.migration.replace("raise exception 'INVALID_FOOD_CONTEXT' using errcode = '22023';", "null;") })],
  ["the quota cap check is bypassed", (s) => ({ ...s, migration: s.migration.replace("  v_cap := case p_card_type when 'general' then p_general_cap else p_restaurant_cap end;\n", "") })],
  ["a frozen function is replaced in place", (s) => ({ ...s, migration: s.migration.replace("create function social_internal.canonical_meal_buddy_context_candidates(", "create or replace function social_internal.canonical_meal_buddy_context_candidates(") })],
  ["the transient role borrow is never revoked", (s) => ({ ...s, migration: s.migration.replace(/revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;/, "") })],
  ["authenticated keeps execute on the context primitive", (s) => ({ ...s, migration: s.migration.replace(`revoke all on function social_internal.${SR2GF_CONTEXT_PRIMITIVE}(uuid, uuid, timestamptz) from authenticated;`, "") })],
  ["the RLS policy is opened to every role", (s) => ({ ...s, migration: s.migration.replace("for select to meal_buddy_candidate_pool_authority using (true)", "for select using (true)") })]
];

const results = [];
const push = (name, applied, failed) => {
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
};

let baselineBroken = false;
for (const [label, value, fn] of [
  ["canonical server composition satisfies the exact SR-2G-F contract", SOURCES, compositionViolations],
  ["canonical classification satisfies the exact SR-2G-F contract", CANONICAL, classificationViolations],
  ["canonical SQL authority satisfies the exact SR-2G-F contract", SOURCES, sqlViolations]
]) {
  const failed = fn(value);
  results.push({ name: label, applied: true, killed: failed.length === 0, status: failed.length === 0 ? "killed" : "survived", violations: failed });
  if (failed.length) { baselineBroken = true; console.log(`BASELINE BROKEN ${label}: ${failed.join(" | ")}`); }
  else console.log(`BASELINE OK ${label}`);
}

for (const [name, apply] of compositionMutants) {
  const mutated = apply(SOURCES);
  const applied = JSON.stringify(mutated) !== JSON.stringify(SOURCES);
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  push(name, applied, applied ? compositionViolations(mutated) : ["mutation did not apply"]);
}
for (const [name, override] of classificationMutants) push(name, true, classificationViolations({ ...CANONICAL, ...override }));
for (const [name, apply] of sqlMutants) {
  const mutated = apply(SOURCES);
  const applied = JSON.stringify(mutated) !== JSON.stringify(SOURCES);
  push(name, applied, applied ? sqlViolations(mutated) : ["mutation did not apply"]);
}

const survivors = results.filter((r) => r.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-f-mutations",
  total: results.length, killed: results.length - survivors.length, survived: survivors.length,
  baselineBroken, survivors, repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
