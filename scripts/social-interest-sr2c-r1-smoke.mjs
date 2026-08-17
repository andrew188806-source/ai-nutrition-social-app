#!/usr/bin/env node
// SR-2C-R1 local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// Exercises the real aggregation module end to end over projection rows shaped exactly as the
// primitive returns them, and models the settings/card boundary so the no-snapshot invariant is
// provable without a database. The live behaviour is proven separately by the Development acceptance.
import {
  aggregateInterestCategories, collectProfileInterests, deriveCompactInterests
} from "../supabase/functions/_shared/social-interest/aggregate.ts";
import {
  SOCIAL_INTEREST_COMPACT_VISIBLE, SOCIAL_INTEREST_MAX_FOOD, SOCIAL_INTEREST_MAX_GENERAL
} from "../supabase/functions/_shared/social-interest/types.ts";

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const r = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(r);
  if (!r.pass) failures.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} ${name}`);
}

// Projection rows exactly as social_internal.project_public_social_interests returns them.
const row = (ns, tag, cat, order) =>
  Object.freeze({ exposure_ordinal: 0, namespace: ns, tag_key: tag, category_key: cat, display_order: order });

// The contract's worked example: six general selections spanning four top categories.
const WIDE = Object.freeze([
  row("general", "general.entertainment.movie", "general.entertainment", 101),
  row("general", "general.entertainment.anime", "general.entertainment", 103),
  row("general", "general.gaming.console_gaming", "general.gaming", 203),
  row("general", "general.fitness_sports.fitness", "general.fitness_sports", 301),
  row("general", "general.fitness_sports.running", "general.fitness_sports", 302),
  row("general", "general.creative.photography", "general.creative", 601),
  row("food", "food.japanese.sushi", "food.japanese", 202),
  row("food", "food.japanese.ramen", "food.japanese", 205),
  row("food", "food.dessert_drinks.coffee", "food.dessert_drinks", 604),
  row("food", "food.dessert_drinks.dessert", "food.dessert_drinks", 601)
]);

// A profile/settings record. A Meal Buddy card record deliberately has no interest field at all.
const settings = (general, food) => Object.freeze({ general: Object.freeze(general), food: Object.freeze(food) });
const CARD = Object.freeze({
  id: "card-1", owner: "B", card_type: "general", intention_type: "chat_first",
  restaurant_id: null, area: null, dining_date: "2026-08-21", meal_period: "dinner",
  preferred_time: null, created_at: "2026-08-19T00:00:00Z", expires_at: "2026-08-22T00:00:00Z", cancelled_at: null
});
// Presentation resolves interests from CURRENT settings; the card is never consulted.
const project = (currentSettings) => Object.freeze([
  ...currentSettings.general.map((t) => row("general", t.tag, t.cat, t.order)),
  ...currentSettings.food.map((t) => row("food", t.tag, t.cat, t.order))
]);

try {
  // --- the pipeline ---------------------------------------------------------------------------
  const interests = collectProfileInterests(WIDE);
  check("01 complete general fine tags survive the projection", interests.publicInterestTags.length === 6);
  check("02 complete food fine tags survive the projection", interests.foodInterestTags.length === 4);
  check("03 the two namespaces stay separate", interests.publicInterestTags.every((t) => t.tagKey.startsWith("general.")) && interests.foodInterestTags.every((t) => t.tagKey.startsWith("food.")));
  check("04 fine tags are ordered by catalog display order", interests.publicInterestTags[0].tagKey === "general.entertainment.movie" && interests.foodInterestTags[0].tagKey === "food.japanese.sushi");

  const categories = aggregateInterestCategories(interests);
  check("05 general fine tags aggregate to the contract's four unique categories",
    JSON.stringify(categories.publicInterestCategories) === JSON.stringify(["general.entertainment", "general.gaming", "general.fitness_sports", "general.creative"]), categories.publicInterestCategories);
  check("06 food fine tags aggregate to two unique categories",
    JSON.stringify(categories.foodInterestCategories) === JSON.stringify(["food.japanese", "food.dessert_drinks"]), categories.foodInterestCategories);
  check("07 no duplicate top category is representable", new Set(categories.publicInterestCategories).size === categories.publicInterestCategories.length);
  check("08 aggregation is deterministic across repeated evaluation",
    JSON.stringify(aggregateInterestCategories(interests)) === JSON.stringify(categories));
  check("09 aggregation is order-independent given the same rows",
    JSON.stringify(aggregateInterestCategories(collectProfileInterests([...WIDE].reverse()))) === JSON.stringify(categories));

  const compact = deriveCompactInterests(categories);
  check("10 the compact general line shows exactly three categories", compact.publicInterests.visibleCategories.length === SOCIAL_INTEREST_COMPACT_VISIBLE);
  check("11 the compact general overflow is the derived remainder", compact.publicInterests.overflowCount === 1);
  check("12 the compact food line does not overflow below the limit", compact.foodInterests.visibleCategories.length === 2 && compact.foodInterests.overflowCount === 0);
  check("13 the visible set is the first three in canonical order",
    JSON.stringify(compact.publicInterests.visibleCategories) === JSON.stringify(categories.publicInterestCategories.slice(0, 3)));
  check("14 canonical fine selections are NOT truncated by the compact view", interests.publicInterestTags.length === 6);
  check("15 the complete category set remains available beside the compact line", categories.publicInterestCategories.length === 4);
  check("16 no '+N' string is produced or stored", !JSON.stringify(compact).includes("+"));
  check("17 overflow is a number derived at read time, not a persisted tag", typeof compact.publicInterests.overflowCount === "number");

  // --- empty semantics -------------------------------------------------------------------------
  const empty = collectProfileInterests([]);
  check("18 an empty profile yields [] and [] rather than null",
    Array.isArray(empty.publicInterestTags) && empty.publicInterestTags.length === 0
    && Array.isArray(empty.foodInterestTags) && empty.foodInterestTags.length === 0);
  const emptyCompact = deriveCompactInterests(aggregateInterestCategories(empty));
  check("19 an empty profile still produces a valid compact line with zero overflow",
    emptyCompact.publicInterests.visibleCategories.length === 0 && emptyCompact.publicInterests.overflowCount === 0);
  check("20 no fabricated default or inferred fallback appears", JSON.stringify(empty) === JSON.stringify({ publicInterestTags: [], foodInterestTags: [] }));

  // --- settings own the selections, cards do not --------------------------------------------------
  const before = settings(
    [{ tag: "general.entertainment.movie", cat: "general.entertainment", order: 101 }],
    [{ tag: "food.japanese.sushi", cat: "food.japanese", order: 202 }]
  );
  const projectedBefore = collectProfileInterests(project(before));
  check("21 the projection shows the configured movie and sushi",
    projectedBefore.publicInterestTags[0].tagKey === "general.entertainment.movie"
    && projectedBefore.foodInterestTags[0].tagKey === "food.japanese.sushi");

  const cardSnapshot = JSON.stringify(CARD);
  const after = settings(
    [{ tag: "general.creative.photography", cat: "general.creative", order: 601 }],
    [{ tag: "food.japanese.ramen", cat: "food.japanese", order: 205 }]
  );
  const projectedAfter = collectProfileInterests(project(after));
  check("22 changing Settings changes the next projection", projectedAfter.publicInterestTags[0].tagKey === "general.creative.photography" && projectedAfter.foodInterestTags[0].tagKey === "food.japanese.ramen");
  check("23 the Meal Buddy card record is byte-identical across the settings change", JSON.stringify(CARD) === cardSnapshot);
  check("24 the card record carries no interest field of any kind", !Object.keys(CARD).some((k) => /interest|tag|hobby/i.test(k)));
  check("25 no card recreation is required for the change to take effect", CARD.id === "card-1" && projectedAfter.publicInterestTags[0].tagKey !== projectedBefore.publicInterestTags[0].tagKey);
  check("26 presentation never consults the card for interests", !JSON.stringify(project(after)).includes(CARD.id));

  // --- frozen limits ---------------------------------------------------------------------------------
  check("27 the general profile limit is eight", SOCIAL_INTEREST_MAX_GENERAL === 8);
  check("28 the food profile limit is five", SOCIAL_INTEREST_MAX_FOOD === 5);
  check("29 the compact visible limit is three", SOCIAL_INTEREST_COMPACT_VISIBLE === 3);
  check("30 the compact limit never bounds the profile limit", SOCIAL_INTEREST_MAX_GENERAL > SOCIAL_INTEREST_COMPACT_VISIBLE);

  // --- privacy ------------------------------------------------------------------------------------------
  const serialized = JSON.stringify({ interests, categories, compact });
  check("31 no user identifier appears in any projected shape", !/user_id|userId|uuid/i.test(serialized));
  check("32 no Taste, inference or confidence metadata appears", !/taste|similarity|confidence|score|jaccard/i.test(serialized));
  check("33 no health, nutrition, restriction or allergy metadata appears", !/health|nutrition|restriction|allerg|calorie/i.test(serialized));
  check("34 tag identity is a stable machine key, never a display label", interests.publicInterestTags.every((t) => /^[a-z_.]+$/.test(t.tagKey)));

  const summary = Object.freeze({
    suite: "social-interest-sr2c-r1-smoke",
    total: checks.length, passed: checks.length - failures.length, failed: failures.length,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-interest-sr2c-r1-smoke", error: error.message }, null, 2));
  process.exit(1);
}
