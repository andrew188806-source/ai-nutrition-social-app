#!/usr/bin/env node
// SR-2G-C meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Two families with different teeth: the pool SEMANTICS are mutated in an executable model
// and must break a scenario, and the irreversible MIGRATION is mutated as text and must break the
// structural contract. A rule that only one family can see is a rule with a blind spot, so the model
// and the migration are cross-pinned by the smoke.
import fs from "node:fs";
import path from "node:path";
import { SR2GC_MIGRATION, SR2GC_POOL_ROLE } from "./social-candidate-sr2g-c-successor-manifest.mjs";

const root = process.cwd();
const migrationSource = fs.readFileSync(path.join(root, SR2GC_MIGRATION), "utf8");
const sqlExecutable = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const count = (h, n) => h.split(n).length - 1;

// Every GRANT whose target is the pool role, reduced to its privilege clause. `create on schema` is
// the transient ownership-transfer grant and is revoked later in the same migration.
const EXPECTED_POOL_GRANTS = Object.freeze([
  "create on schema social_internal",
  "execute on function social_internal.authorized_candidates(uuid, uuid[])",
  "select on table public.meal_buddy_cards",
  "usage on schema social_internal"
]);
function grantsToPoolRole(sql) {
  const flat = sql.replace(/\s+/g, " ");
  return [...flat.matchAll(new RegExp(`grant ([^;]*?) to ${SR2GC_POOL_ROLE}\\b`, "g"))]
    .map((match) => match[1].trim())
    .sort();
}

const INSTANT = Date.parse("2026-08-20T04:00:00Z");
const ACTOR = "actor";

const card = (id, owner, over = {}) => ({
  id, owner, cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
  diningDate: "2026-08-21", mealPeriod: "dinner", preferredTime: null,
  createdAt: "2026-08-19T00:00:00Z", expiresAt: "2026-08-22T00:00:00Z", cancelledAt: null, ...over
});

// Twelve extra plainly-eligible owners exist so the pool exceeds both frozen exposure caps. Without
// them a mutant that sliced the pool to 3 or 10 would change nothing observable and would survive.
const FILLER = Array.from({ length: 12 }, (_, index) => `filler${String(index).padStart(2, "0")}`);

function baseWorld() {
  const owners = ["general", "restSame", "restOther", "dateOff", "periodOff", "blocked", "noPart", "multi", "cancelled", "expired", ...FILLER];
  return {
    profiles: new Map([[ACTOR, "active"], ...owners.map((o) => [o, "active"])]),
    participation: new Map([[ACTOR, "opted_in"], ...owners.filter((o) => o !== "noPart").map((o) => [o, "opted_in"])]),
    blocks: [[ACTOR, "blocked"]],
    cards: [
      card("s-gen", ACTOR),
      card("s-rest", ACTOR, { cardType: "restaurant", restaurantId: "R1" }),
      card("s-cancelled", ACTOR, { cancelledAt: "2026-08-19T12:00:00Z" }),
      card("s-expired", ACTOR, { createdAt: "2026-08-18T00:00:00Z", expiresAt: "2026-08-19T00:00:00Z" }),
      card("c-general", "general", { area: "elsewhere", intentionType: "eat_together", preferredTime: "19:30" }),
      card("c-restSame", "restSame", { cardType: "restaurant", restaurantId: "R1" }),
      card("c-restOther", "restOther", { cardType: "restaurant", restaurantId: "R2" }),
      card("c-dateOff", "dateOff", { diningDate: "2026-08-22" }),
      card("c-periodOff", "periodOff", { mealPeriod: "lunch" }),
      card("c-blocked", "blocked"),
      card("c-noPart", "noPart"),
      card("c-multiOld", "multi", { createdAt: "2026-08-19T01:00:00Z" }),
      card("c-multiNew", "multi", { createdAt: "2026-08-19T09:00:00Z" }),
      card("c-cancelled", "cancelled", { cancelledAt: "2026-08-19T12:00:00Z" }),
      card("c-expired", "expired", { createdAt: "2026-08-18T00:00:00Z", expiresAt: "2026-08-19T00:00:00Z" }),
      ...FILLER.map((owner) => card(`c-${owner}`, owner))
    ]
  };
}

// The canonical rule set. Each rule is an independent knob a mutant can turn off.
const CANONICAL_RULES = Object.freeze({
  sourceOwnership: true, sourceActive: true, ownerDiffers: true, candidateActive: true,
  dateMatch: true, periodMatch: true, restaurantRule: true, areaHard: false, intentionHard: false,
  preferredTimeHard: false, onePerOwner: true, newestWins: true, idTieBreak: true,
  useAuthorization: true, freeCap: 0, premiumCap: 0
});

const activeAt = (c) => c.cancelledAt === null && Date.parse(c.expiresAt) > INSTANT;

function authorizedCandidates(world, actor, ownerIds) {
  const actorOk = world.profiles.get(actor) === "active" && world.participation.get(actor) === "opted_in";
  if (!actorOk) return [];
  return ownerIds.filter((owner) =>
    owner !== actor
    && world.profiles.get(owner) === "active"
    && world.participation.get(owner) === "opted_in"
    && !world.blocks.some(([a, b]) => (a === actor && b === owner) || (a === owner && b === actor)));
}

function candidatePool(world, actor, sourceCardId, rules) {
  const source = world.cards.find((c) =>
    c.id === sourceCardId
    && (!rules.sourceOwnership || c.owner === actor)
    && (!rules.sourceActive || activeAt(c)));
  if (!source) return [];

  const compatible = world.cards.filter((c) =>
    (!rules.ownerDiffers || c.owner !== source.owner)
    && (!rules.candidateActive || activeAt(c))
    && (!rules.dateMatch || c.diningDate === source.diningDate)
    && (!rules.periodMatch || c.mealPeriod === source.mealPeriod)
    && (!rules.restaurantRule
      || source.cardType !== "restaurant" || c.cardType !== "restaurant" || c.restaurantId === source.restaurantId)
    && (!rules.areaHard || c.area === source.area)
    && (!rules.intentionHard || c.intentionType === source.intentionType)
    && (!rules.preferredTimeHard || c.preferredTime === source.preferredTime));

  let selected = compatible;
  if (rules.onePerOwner) {
    const byOwner = new Map();
    for (const c of compatible) {
      const held = byOwner.get(c.owner);
      let wins;
      if (!held) wins = true;
      else if (rules.newestWins) {
        wins = Date.parse(c.createdAt) > Date.parse(held.createdAt)
          || (rules.idTieBreak && Date.parse(c.createdAt) === Date.parse(held.createdAt) && c.id < held.id);
      } else {
        wins = Date.parse(c.createdAt) < Date.parse(held.createdAt);
      }
      if (wins) byOwner.set(c.owner, c);
    }
    selected = [...byOwner.values()];
  }

  if (rules.useAuthorization) {
    const ok = new Set(authorizedCandidates(world, actor, selected.map((c) => c.owner)));
    selected = selected.filter((c) => ok.has(c.owner));
  } else {
    selected = selected.filter((c) => c.owner !== actor);
  }

  selected = selected.sort((a, b) => (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : a.id < b.id ? -1 : 1));
  if (rules.freeCap > 0) selected = selected.slice(0, rules.freeCap);
  if (rules.premiumCap > 0) selected = selected.slice(0, rules.premiumCap);
  return selected;
}

function semanticViolations(rules) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  try {
    const w = baseWorld();
    const gen = candidatePool(w, ACTOR, "s-gen", rules);
    const rest = candidatePool(w, ACTOR, "s-rest", rules);
    const owners = (rows) => rows.map((r) => r.owner);

    record("a foreign-owned source yields nothing", candidatePool(w, "general", "s-gen", rules).length === 0);
    record("a cancelled source yields nothing", candidatePool(w, ACTOR, "s-cancelled", rules).length === 0);
    record("an expired source yields nothing", candidatePool(w, ACTOR, "s-expired", rules).length === 0);
    record("same date and period is included", owners(gen).includes("general"));
    record("a date mismatch is excluded", !owners(gen).includes("dateOff"));
    record("a period mismatch is excluded", !owners(gen).includes("periodOff"));
    record("restaurant/restaurant same restaurant included", owners(rest).includes("restSame"));
    record("restaurant/restaurant different restaurant excluded", !owners(rest).includes("restOther"));
    record("restaurant source matches a general candidate", owners(rest).includes("general"));
    record("general source matches a restaurant candidate", owners(gen).includes("restOther"));
    record("area mismatch remains eligible", owners(gen).includes("general"));
    record("intention mismatch remains eligible", owners(gen).includes("general"));
    record("preferred-time mismatch remains eligible", owners(gen).includes("general"));
    record("the actor never appears", !owners(gen).includes(ACTOR));
    record("a blocked owner is removed", !owners(gen).includes("blocked"));
    record("a non-participating owner is removed", !owners(gen).includes("noPart"));
    record("a cancelled candidate is excluded", !owners(gen).includes("cancelled"));
    record("an expired candidate is excluded", !owners(gen).includes("expired"));
    record("one row per owner", gen.filter((r) => r.owner === "multi").length === 1);
    record("the newest card wins", (gen.find((r) => r.owner === "multi") ?? {}).id === "c-multiNew");
    record("no Free cap is applied", gen.length > 3);
    record("no Premium cap is applied", gen.length > 10);

    // Two cards with the SAME created_at, evaluated in both input orders. Only a stable id
    // tie-break can return the same card both times; without one the answer follows array order.
    const tieA = baseWorld();
    tieA.cards.push(card("c-multiTieB", "multi", { createdAt: "2026-08-19T09:00:00Z" }));
    const tieB = baseWorld();
    tieB.cards.push(card("c-multiTieB", "multi", { createdAt: "2026-08-19T09:00:00Z" }));
    tieB.cards.reverse();
    const pickA = (candidatePool(tieA, ACTOR, "s-gen", rules).find((r) => r.owner === "multi") ?? {}).id;
    const pickB = (candidatePool(tieB, ACTOR, "s-gen", rules).find((r) => r.owner === "multi") ?? {}).id;
    record("the id tie-break is stable under both input orders", pickA === "c-multiNew" && pickB === "c-multiNew");

    const reversed = baseWorld();
    reversed.cards.reverse();
    record("input order cannot change the selected card",
      (candidatePool(reversed, ACTOR, "s-gen", rules).find((r) => r.owner === "multi") ?? {}).id === "c-multiNew");
  } catch (error) {
    failed.push(`contract threw: ${error.message}`);
  }
  return failed;
}

function migrationViolations(source) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const sql = sqlExecutable(source);
  const body = (sql.match(/as \$\$([\s\S]*?)\$\$;/) ?? ["", ""])[1];

  record("source ownership is in the predicate", /where card\.id = p_source_card_id\s*and card\.owner_user_id = p_actor_user_id/.test(body));
  record("the source must be active", /card\.cancelled_at is null/.test(body) && /card\.expires_at > p_authority_instant/.test(body));
  record("dining_date matches exactly", /candidate\.dining_date = source\.dining_date/.test(body));
  record("meal_period matches exactly", /candidate\.meal_period = source\.meal_period/.test(body));
  record("the restaurant rule applies only when both are restaurant-type",
    /source\.card_type <> 'restaurant'\s*or candidate\.card_type <> 'restaurant'\s*or candidate\.restaurant_id = source\.restaurant_id/.test(body));
  record("area is never compared", !/candidate\.area\s*=|source\.area\s*=/.test(body));
  record("preferred_time is never compared", !/candidate\.preferred_time\s*=|source\.preferred_time\s*=/.test(body));
  record("intention_type is never compared", !/candidate\.intention_type\s*=|source\.intention_type\s*=/.test(body));
  record("one card per owner by newest with a stable tie-break",
    /partition by compatible\.owner_user_id\s*order by compatible\.created_at desc, compatible\.id asc/.test(body) && /owner_rank = 1/.test(body));
  record("the frozen authorization primitive is composed", /social_internal\.authorized_candidates\(\s*p_actor_user_id,/.test(body));
  record("only authorized owners survive", /join authorized on authorized\.user_id = selected\.owner_user_id/.test(body));
  record("block logic is not reimplemented", !/social_blocks/.test(sql));
  record("participation logic is not reimplemented", !/social_participation/.test(sql));
  record("no LIMIT is applied", !/\blimit\b/i.test(body));
  record("no Taste, exposure or projection authority appears",
    !/rankSocialCandidates|applySocialExposure|project_exposed_social_profiles|candidateCardRef/.test(sql));
  record("a dedicated pool role is created", new RegExp(`create role ${SR2GC_POOL_ROLE} with nologin noinherit nobypassrls`).test(sql));
  record("the pool role is never made a member of social_authority", !new RegExp(`grant social_authority to ${SR2GC_POOL_ROLE}`).test(sql));
  record("the write authority is not reused as owner", !/owner to meal_buddy_card_write_authority/.test(sql));
  record("the pool role gets SELECT only on the card table",
    !new RegExp(`grant [^;]*(insert|update|delete)[^;]*to ${SR2GC_POOL_ROLE}`, "i").test(sql));
  record("no client role may execute the pool primitive",
    !/grant execute[^;]*canonical_meal_buddy_candidate_cards[^;]*to (anon|authenticated|authenticator|service_role)/i.test(sql));
  record("schema CREATE is revoked after transfer", new RegExp(`revoke create on schema social_internal from ${SR2GC_POOL_ROLE}`).test(sql));
  // Counting the bare phrase "to <role>" would also match the policy's `for select to`, the
  // `owner to` transfer and the transient CREATE. The privilege clauses themselves are compared.
  record("exactly the four intended grants reach the pool role",
    JSON.stringify(grantsToPoolRole(sql)) === JSON.stringify(EXPECTED_POOL_GRANTS));
  // The transient grantor lifecycle.
  record("the borrowed membership sets INHERIT FALSE and SET TRUE", /grant social_authority to postgres with inherit false, set true;/.test(sql));
  record("the borrowed membership row is revoked GRANTED BY postgres", /revoke social_authority from postgres granted by postgres;/.test(sql));
  record("the incorrect WITH SET FALSE restoration is never used", !/grant social_authority to postgres with set false/i.test(sql));
  record("social_authority is borrowed exactly once", count(sql, "set local role social_authority") === 1);
  record("the role is returned to postgres", /set local role postgres;/.test(sql));
  record("the revoke follows the grant", sql.indexOf("grant social_authority to postgres") < sql.indexOf("revoke social_authority from postgres"));
  record("no other frozen Social membership is granted", count(sql, "grant social_authority to") === 1
    && !/grant (social_pair_read_authority|social_profile_projection_authority|social_runtime_executor) to/.test(sql));
  record("no product table is created", !/create table/i.test(sql));
  return failed;
}

// --- mutants ------------------------------------------------------------------------------------------
const semanticMutants = [
  ["source ownership is no longer required", { sourceOwnership: false }],
  ["a cancelled or expired source is accepted", { sourceActive: false }],
  ["the dining-date match is removed", { dateMatch: false }],
  ["the meal-period match is removed", { periodMatch: false }],
  ["area becomes hard eligibility", { areaHard: true }],
  ["intention_type becomes hard eligibility", { intentionHard: true }],
  ["preferred_time becomes hard eligibility", { preferredTimeHard: true }],
  ["a different restaurant is allowed for restaurant/restaurant", { restaurantRule: false }],
  ["the owner reduction is removed, returning every card", { onePerOwner: false }],
  ["the oldest card is chosen instead of the newest", { newestWins: false }],
  ["the stable id tie-break is removed", { idTieBreak: false }],
  ["the frozen authorization primitive is bypassed", { useAuthorization: false }],
  ["a Free cap of 3 is applied", { freeCap: 3 }],
  ["a Premium cap of 10 is applied", { premiumCap: 10 }],
  ["candidate lifecycle is ignored, admitting cancelled and expired cards", { candidateActive: false }],
  ["self exclusion is removed", { ownerDiffers: false, useAuthorization: false }]
];

const migrationMutants = [
  ["the source ownership predicate is dropped",
    (s) => s.replace("where card.id = p_source_card_id\n      and card.owner_user_id = p_actor_user_id", "where card.id = p_source_card_id")],
  ["the dining-date predicate is dropped",
    (s) => s.replace("      and candidate.dining_date = source.dining_date\n", "")],
  ["the meal-period predicate is dropped",
    (s) => s.replace("      and candidate.meal_period = source.meal_period\n", "")],
  ["an area equality predicate is added",
    (s) => s.replace("      and candidate.meal_period = source.meal_period", "      and candidate.meal_period = source.meal_period\n      and candidate.area = source.area")],
  ["a preferred_time equality predicate is added",
    (s) => s.replace("      and candidate.meal_period = source.meal_period", "      and candidate.meal_period = source.meal_period\n      and candidate.preferred_time = source.preferred_time")],
  ["an intention_type equality predicate is added",
    (s) => s.replace("      and candidate.meal_period = source.meal_period", "      and candidate.meal_period = source.meal_period\n      and candidate.intention_type = source.intention_type")],
  ["the restaurant rule is widened to every pair",
    (s) => s.replace("        source.card_type <> 'restaurant'\n        or candidate.card_type <> 'restaurant'\n        or candidate.restaurant_id = source.restaurant_id", "        candidate.restaurant_id = source.restaurant_id")],
  ["the owner reduction picks the oldest card",
    (s) => s.replace("order by compatible.created_at desc, compatible.id asc", "order by compatible.created_at asc, compatible.id asc")],
  ["the stable id tie-break is removed",
    (s) => s.replace("order by compatible.created_at desc, compatible.id asc", "order by compatible.created_at desc")],
  ["the authorization join is removed",
    (s) => s.replace("  join authorized on authorized.user_id = selected.owner_user_id\n", "")],
  ["block logic is reimplemented locally",
    (s) => s.replace("      and candidate.meal_period = source.meal_period", "      and candidate.meal_period = source.meal_period\n      and not exists (select 1 from public.social_blocks sb where sb.blocker_user_id = p_actor_user_id)")],
  ["a Free cap of 3 is applied to the pool",
    (s) => s.replace("  order by selected.owner_user_id asc, selected.id asc", "  order by selected.owner_user_id asc, selected.id asc\n  limit 3")],
  ["the pool primitive is exposed to authenticated",
    (s) => s.replace("to social_runtime_executor;", "to authenticated;")],
  ["the pool authority is made a member of social_authority",
    (s) => s.replace(`grant usage on schema social_internal to ${SR2GC_POOL_ROLE};`, `grant usage on schema social_internal to ${SR2GC_POOL_ROLE};\ngrant social_authority to ${SR2GC_POOL_ROLE};`)],
  ["the SR-2G-B write authority is reused as the pool owner",
    (s) => s.replace(`owner to ${SR2GC_POOL_ROLE};`, "owner to meal_buddy_card_write_authority;")],
  ["the pool authority is granted INSERT on the card table",
    (s) => s.replace(`grant select on table public.meal_buddy_cards to ${SR2GC_POOL_ROLE};`, `grant select, insert on table public.meal_buddy_cards to ${SR2GC_POOL_ROLE};`)],
  ["the borrowed membership is left in place",
    (s) => s.replace("revoke social_authority from postgres granted by postgres;", "")],
  ["restoration uses the proven-incorrect WITH SET FALSE form",
    (s) => s.replace("revoke social_authority from postgres granted by postgres;", "grant social_authority to postgres with set false;")],
  ["the borrowed membership inherits privileges",
    (s) => s.replace("grant social_authority to postgres with inherit false, set true;", "grant social_authority to postgres with inherit true, set true;")],
  ["schema CREATE is left granted to the pool authority",
    (s) => s.replace(`revoke create on schema social_internal from ${SR2GC_POOL_ROLE};\n`, "")],
  ["a candidate pool table is materialised",
    (s) => s.replace("commit;", "create table public.meal_buddy_candidate_pool (id uuid primary key);\n\ncommit;")],
  // Executable SQL, not a comment: a comment mentioning a later round's authority is stripped before
  // the contract runs and would change nothing, so it would prove nothing.
  ["projection authority is invoked from the pool",
    (s) => s.replace("  from selected\n  join authorized on authorized.user_id = selected.owner_user_id",
      "  from selected\n  join social_internal.project_exposed_social_profiles(p_actor_user_id, '{}'::uuid[]) as proj on true\n  join authorized on authorized.user_id = selected.owner_user_id")]
];

const results = [];

const canonicalSemantic = semanticViolations(CANONICAL_RULES);
results.push({ name: "canonical pool semantics satisfy the exact SR-2G-C contract", applied: true,
  killed: canonicalSemantic.length === 0, status: canonicalSemantic.length === 0 ? "killed" : "survived", violations: canonicalSemantic });
const canonicalMigration = migrationViolations(migrationSource);
results.push({ name: "canonical migration satisfies the exact SR-2G-C structural contract", applied: true,
  killed: canonicalMigration.length === 0, status: canonicalMigration.length === 0 ? "killed" : "survived", violations: canonicalMigration });

for (const [name, override] of semanticMutants) {
  const failed = semanticViolations({ ...CANONICAL_RULES, ...override });
  const killed = failed.length > 0;
  results.push({ name, applied: true, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}

for (const [name, apply] of migrationMutants) {
  const mutated = apply(migrationSource);
  const applied = mutated !== migrationSource;
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  const failed = applied ? migrationViolations(mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}

const survivors = results.filter((entry) => entry.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-c-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  survivors,
  repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
