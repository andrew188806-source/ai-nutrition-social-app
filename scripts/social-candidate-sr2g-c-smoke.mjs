#!/usr/bin/env node
// SR-2G-C local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// The pool authority is pure SQL, so this suite proves the contract two ways at once. A
// deterministic model implements exactly the predicates the migration declares, every §24/§27
// scenario is exercised against it, and each modelled rule is then pinned back to the migration
// text — so the model can never drift away from the SQL it stands in for. The SQL's real behaviour
// is proven separately by the Development acceptance.
import fs from "node:fs";
import path from "node:path";
import { SR2GC_MIGRATION } from "./social-candidate-sr2g-c-successor-manifest.mjs";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, SR2GC_MIGRATION), "utf8").replace(/(^|\n)\s*--[^\n]*/g, "$1");
const body = (migration.match(/as \$\$([\s\S]*?)\$\$;/) ?? ["", ""])[1];

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

const INSTANT = Date.parse("2026-08-20T04:00:00Z");
const active = (card) => card.cancelledAt === null && Date.parse(card.expiresAt) > INSTANT;

// The frozen authorization primitive, modelled exactly as social_internal.authorized_candidates
// defines it: self excluded, both parties active and opted in, neither direction blocked.
function authorizedCandidates(world, actor, ownerIds) {
  const actorOk = world.profiles.get(actor) === "active" && world.participation.get(actor) === "opted_in";
  if (!actorOk) return [];
  return ownerIds.filter((owner) =>
    owner !== actor
    && world.profiles.get(owner) === "active"
    && world.participation.get(owner) === "opted_in"
    && !world.blocks.some(([a, b]) => (a === actor && b === owner) || (a === owner && b === actor)));
}

// The pool primitive, modelled exactly as the migration declares it.
function candidatePool(world, actor, sourceCardId) {
  const source = world.cards.find((card) =>
    card.id === sourceCardId && card.owner === actor && active(card));
  if (!source) return [];

  const compatible = world.cards.filter((candidate) =>
    candidate.owner !== source.owner
    && active(candidate)
    && candidate.diningDate === source.diningDate
    && candidate.mealPeriod === source.mealPeriod
    && (source.cardType !== "restaurant"
      || candidate.cardType !== "restaurant"
      || candidate.restaurantId === source.restaurantId));

  const byOwner = new Map();
  for (const candidate of compatible) {
    const held = byOwner.get(candidate.owner);
    const wins = !held
      || Date.parse(candidate.createdAt) > Date.parse(held.createdAt)
      || (Date.parse(candidate.createdAt) === Date.parse(held.createdAt) && candidate.id < held.id);
    if (wins) byOwner.set(candidate.owner, candidate);
  }

  const selected = [...byOwner.values()];
  const authorized = new Set(authorizedCandidates(world, actor, selected.map((c) => c.owner)));
  return selected
    .filter((candidate) => authorized.has(candidate.owner))
    .sort((a, b) => (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : a.id < b.id ? -1 : 1));
}

// --- fixture world ---------------------------------------------------------------------------------
const ACTOR = "actor";
const card = (id, owner, over = {}) => ({
  id, owner, cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
  diningDate: "2026-08-21", mealPeriod: "dinner", preferredTime: null,
  createdAt: "2026-08-19T00:00:00Z", expiresAt: "2026-08-22T00:00:00Z", cancelledAt: null, ...over
});

function baseWorld() {
  const owners = ["general", "restSame", "restOther", "dateOff", "periodOff", "blocked", "noPart", "multi", "cancelled", "expired"];
  const world = {
    profiles: new Map([[ACTOR, "active"], ...owners.map((o) => [o, "active"])]),
    participation: new Map([[ACTOR, "opted_in"], ...owners.filter((o) => o !== "noPart").map((o) => [o, "opted_in"])]),
    blocks: [[ACTOR, "blocked"]],
    cards: [
      card("s-gen", ACTOR),
      card("s-rest", ACTOR, { cardType: "restaurant", restaurantId: "R1" }),
      card("s-cancelled", ACTOR, { cancelledAt: "2026-08-19T12:00:00Z" }),
      card("s-expired", ACTOR, { createdAt: "2026-08-18T00:00:00Z", expiresAt: "2026-08-19T00:00:00Z" }),
      card("s-actor2", ACTOR),
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
      card("c-expired", "expired", { createdAt: "2026-08-18T00:00:00Z", expiresAt: "2026-08-19T00:00:00Z" })
    ]
  };
  return world;
}

try {
  const world = baseWorld();
  const fromGeneral = candidatePool(world, ACTOR, "s-gen");
  const fromRestaurant = candidatePool(world, ACTOR, "s-rest");
  const owners = (rows) => rows.map((r) => r.owner);

  // --- source authority --------------------------------------------------------------------------
  check("01 an owned active source yields a pool", fromGeneral.length > 0);
  check("02 a source owned by another actor yields nothing", candidatePool(world, "general", "s-gen").length === 0);
  check("03 a cancelled source yields nothing", candidatePool(world, ACTOR, "s-cancelled").length === 0);
  check("04 an expired source yields nothing", candidatePool(world, ACTOR, "s-expired").length === 0);
  check("05 a source card that does not exist yields nothing", candidatePool(world, ACTOR, "no-such-card").length === 0);

  // --- hard eligibility --------------------------------------------------------------------------
  check("06 same date and period general/general is included", owners(fromGeneral).includes("general"));
  check("07 a dining-date mismatch is excluded", !owners(fromGeneral).includes("dateOff"));
  check("08 a meal-period mismatch is excluded", !owners(fromGeneral).includes("periodOff"));
  check("09 restaurant/restaurant with the same restaurant is included", owners(fromRestaurant).includes("restSame"));
  check("10 restaurant/restaurant with a different restaurant is excluded", !owners(fromRestaurant).includes("restOther"));
  check("11 a restaurant source matches a general candidate", owners(fromRestaurant).includes("general"));
  check("12 a general source matches a restaurant candidate", owners(fromGeneral).includes("restOther") && owners(fromGeneral).includes("restSame"));

  // --- explicit non-eligibility ---------------------------------------------------------------------
  check("13 an area mismatch remains eligible", owners(fromGeneral).includes("general"));
  check("14 an intention mismatch remains eligible", owners(fromGeneral).includes("general"));
  check("15 a preferred-time difference inside the same period remains eligible", owners(fromGeneral).includes("general"));

  // --- authorization composition ----------------------------------------------------------------------
  check("16 the actor's own card never appears", !owners(fromGeneral).includes(ACTOR));
  check("17 a blocked owner is removed", !owners(fromGeneral).includes("blocked"));
  check("18 a block in the reverse direction is also removed", (() => {
    const w = baseWorld();
    w.blocks = [["blocked", ACTOR]];
    return !owners(candidatePool(w, ACTOR, "s-gen")).includes("blocked");
  })());
  check("19 a non-participating owner is removed", !owners(fromGeneral).includes("noPart"));
  check("20 a paused owner is removed", (() => {
    const w = baseWorld();
    w.participation.set("general", "paused");
    return !owners(candidatePool(w, ACTOR, "s-gen")).includes("general");
  })());
  check("21 an inactive-profile owner is removed", (() => {
    const w = baseWorld();
    w.profiles.set("general", "suspended");
    return !owners(candidatePool(w, ACTOR, "s-gen")).includes("general");
  })());
  check("22 an actor who has not opted in receives nothing", (() => {
    const w = baseWorld();
    w.participation.delete(ACTOR);
    return candidatePool(w, ACTOR, "s-gen").length === 0;
  })());

  // --- lifecycle -------------------------------------------------------------------------------------------
  check("23 a cancelled candidate is excluded", !owners(fromGeneral).includes("cancelled"));
  check("24 an expired candidate is excluded", !owners(fromGeneral).includes("expired"));

  // --- multiplicity and determinism -----------------------------------------------------------------------------
  check("25 an owner with two compatible cards yields exactly one row",
    fromGeneral.filter((r) => r.owner === "multi").length === 1);
  check("26 the newest created_at card wins", fromGeneral.find((r) => r.owner === "multi").id === "c-multiNew");
  check("27 every owner appears at most once", new Set(owners(fromGeneral)).size === owners(fromGeneral).length);
  check("28 the id tie-break is stable when created_at is identical", (() => {
    const w = baseWorld();
    w.cards.push(card("c-multiTieB", "multi", { createdAt: "2026-08-19T09:00:00Z" }));
    const chosen = candidatePool(w, ACTOR, "s-gen").find((r) => r.owner === "multi").id;
    return chosen === "c-multiNew"; // "c-multiNew" < "c-multiTieB"
  })());
  check("29 input order cannot change the selected card", (() => {
    const w = baseWorld();
    w.cards.reverse();
    return candidatePool(w, ACTOR, "s-gen").find((r) => r.owner === "multi").id === "c-multiNew";
  })());
  check("30 repeated evaluation is byte-identical",
    JSON.stringify(candidatePool(world, ACTOR, "s-gen")) === JSON.stringify(fromGeneral));
  check("31 the pool is ordered by owner then card", (() => {
    const keys = fromGeneral.map((r) => `${r.owner}|${r.id}`);
    return JSON.stringify(keys) === JSON.stringify([...keys].sort());
  })());

  // --- no product slicing ---------------------------------------------------------------------------------------------
  check("32 no Free or Premium slice is applied", fromGeneral.length > 3, { returned: fromGeneral.length });
  check("33 the primitive accepts no caller limit", !/p_limit|p_cap|p_max/.test(migration));

  // --- the model is pinned to the migration it stands in for -------------------------------------------------------------
  check("34 the migration declares the same source predicate the model uses",
    /where card\.id = p_source_card_id\s*and card\.owner_user_id = p_actor_user_id/.test(body)
    && /card\.cancelled_at is null/.test(body) && /card\.expires_at > p_authority_instant/.test(body));
  check("35 the migration declares the same hard eligibility the model uses",
    /candidate\.dining_date = source\.dining_date/.test(body)
    && /candidate\.meal_period = source\.meal_period/.test(body)
    && /candidate\.owner_user_id <> source\.owner_user_id/.test(body));
  check("36 the migration declares the same restaurant rule the model uses",
    /source\.card_type <> 'restaurant'\s*or candidate\.card_type <> 'restaurant'\s*or candidate\.restaurant_id = source\.restaurant_id/.test(body));
  check("37 the migration declares the same owner reduction the model uses",
    /partition by compatible\.owner_user_id\s*order by compatible\.created_at desc, compatible\.id asc/.test(body));
  check("38 the migration composes the same authorization primitive the model reproduces",
    /social_internal\.authorized_candidates\(\s*p_actor_user_id,/.test(body));
  check("39 the migration compares none of the non-hard fields",
    !/candidate\.area\s*=|candidate\.preferred_time\s*=|candidate\.intention_type\s*=/.test(body));
  check("40 the migration applies no LIMIT", !/\blimit\b/i.test(body));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-c-smoke",
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-c-smoke", error: error.message, stack: error.stack?.split("\n").slice(0, 5) }, null, 2));
  process.exit(1);
}
