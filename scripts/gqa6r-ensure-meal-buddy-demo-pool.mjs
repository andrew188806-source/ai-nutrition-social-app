#!/usr/bin/env node
// GQA-6R ensure-gqa6r-meal-buddy-demo-pool — Development-only, READ-ONLY planner + Planner handoff.
//
//   node scripts/gqa6r-ensure-meal-buddy-demo-pool.mjs [--dining-date YYYY-MM-DD] [--meal-period dinner]
//        [--primary-email <tester email>]
//
// Candidate compatibility is canonical: a pool card must share the source card's dining date AND meal
// period, so the pool is planned for ONE target slot (default: the current/next Asia/Taipei meal period).
//
// Every counted Demo card is a RESTAURANT card derived from a real, recommendation-eligible Demo catalogue
// item (restaurant -> active branch -> published menu -> menu item -> branch_menu_item -> candidate view ->
// recommendation card), owned by its own Demo identity. The canonical card persists restaurant_id, the
// private exact branch binding, and the server-derived food context; menu / menu item / branch menu item
// are validated at creation and recorded in the fixture manifest binding (the card schema does not store
// them, and this round does not extend it).
//
// This utility performs NO writes. Demo Meal Buddy identities are canonical auth.users rows, and their cards
// may only be created through the deployed card Edge Function acting AS each identity (the card primitives
// are executable solely by social_runtime_executor). Creating those identities and sessions requires Auth
// credential handling that this repository's executor may not perform, so generation is handed to the
// Planner (HANDOFF_TO_PLANNER_FOR_DEMO_DATA_GENERATION) with the exact plan printed here.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEVELOPMENT_PROJECT_REF, MEAL_BUDDY_TARGET, buildMealBuddyIdentity } from "./gqa6r-demo-fixtures.mjs";
import { readOnlySql, verifyDevelopmentTarget } from "./gqa6r-development-api.mjs";

const PERIODS = new Set(["breakfast", "lunch", "dinner", "late_night"]);
const MAX_ORDINAL = 60;
export const MIN_DISTINCT_POOL_RESTAURANTS = 3;

/** Pure: the current/next Taipei meal slot at `instant` (the first period whose card would not yet be expired). */
export function defaultTargetSlot(instant = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(instant).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const period = hour < 10 ? "breakfast" : hour < 14 ? "lunch" : hour < 21 ? "dinner" : "late_night";
  return { diningDate: date, mealPeriod: period };
}

/** Pure: does `card` realise the identity's catalogue binding for `slot` (restaurant, exact branch, derived food context)? */
export function isBoundSlotCard(card, identity, slot) {
  const b = identity.card.recommendation;
  return card.active && card.card_type === "restaurant" && card.dining_date === slot.diningDate && card.meal_period === slot.mealPeriod
    && card.restaurant_id === b.restaurant_id && card.branch_id === b.branch_id && card.food_context_tag_key === b.expected_food_context_tag_key;
}

/**
 * Pure planning. `state` maps identity id -> { authUser, profile, participation, cards: [{id, owner_user_id,
 * card_type, restaurant_id, branch_id, food_context_tag_key, dining_date, meal_period, active}], consumed }.
 * Returns, per identity, the exact canonical steps still missing. Idempotent: an identity already holding its
 * bound restaurant card for the slot needs nothing; any other active restaurant card it holds (free quota:
 * one) is cancelled through the canonical primitive first. A buddy consumed by the tester (relationship or
 * block) is never reset — the next ordinal tops the pool up.
 */
export function planMealBuddyPool(state, slot, target = MEAL_BUDDY_TARGET.eligibleCards) {
  const actions = [];
  let eligible = 0;
  for (let ordinal = 1; ordinal <= MAX_ORDINAL && eligible < target; ordinal += 1) {
    const identity = buildMealBuddyIdentity(ordinal);
    const s = state.get(identity.id) ?? { authUser: false, profile: false, participation: false, cards: [], consumed: false };
    if (s.consumed) continue;
    const hasSlot = s.cards.some((c) => isBoundSlotCard(c, identity, slot));
    const steps = [];
    if (!s.authUser) steps.push("create_auth_user");
    if (!s.profile) steps.push("insert_profile");
    if (!s.participation) steps.push("insert_participation");
    if (!hasSlot) {
      for (const card of s.cards.filter((c) => c.active && c.card_type === "restaurant")) steps.push({ cancel: card.id });
      steps.push("create_recommendation_card");
    }
    if (steps.length) actions.push({ identity, steps });
    eligible += 1;
  }
  return { actions, eligibleAfter: eligible, target };
}

/**
 * Pure measurement of the Planner invariant for one slot. A card counts only when it is active, is the
 * identity's catalogue-bound restaurant card for the slot (same dining date AND meal period, exact
 * restaurant + branch, server-derived food context), its bound menu item is CURRENTLY recommendation-
 * eligible (`eligibleMenuItems`: menu_item_id set read from the candidate view), and its owner_user_id equals
 * the Demo identity that holds it; the identity itself must be an authorized candidate (active profile,
 * opted in, not consumed by the tester). Twenty users sharing one card, users without cards, cards owned by
 * some other authority, free-form cards, and cards on a withdrawn item therefore never count. The pool must
 * also span at least MIN_DISTINCT_POOL_RESTAURANTS restaurants.
 */
export function measureMealBuddyPool(state, slot, eligibleMenuItems, target = MEAL_BUDDY_TARGET.eligibleCards) {
  let identities = 0;
  let eligibleCards = 0;
  let identitiesWithOwnEligibleCard = 0;
  const ownerMismatches = [];
  const restaurants = new Set();
  const menuItems = new Set();
  const foodContexts = new Set();
  for (let ordinal = 1; ordinal <= MAX_ORDINAL; ordinal += 1) {
    const identity = buildMealBuddyIdentity(ordinal);
    const s = state.get(identity.id);
    if (!s?.authUser) continue;
    identities += 1;
    if (!s.profile || !s.participation || s.consumed) continue;
    const binding = identity.card.recommendation;
    if (!eligibleMenuItems.has(binding.menu_item_id)) continue;
    const bound = s.cards.filter((c) => isBoundSlotCard(c, identity, slot));
    for (const card of bound) if (card.owner_user_id !== identity.id) ownerMismatches.push(card.id);
    const owned = bound.filter((c) => c.owner_user_id === identity.id);
    eligibleCards += owned.length;
    if (owned.length) {
      identitiesWithOwnEligibleCard += 1;
      restaurants.add(binding.restaurant_id);
      menuItems.add(binding.menu_item_id);
      foodContexts.add(binding.expected_food_context_tag_key);
    }
  }
  const pass = identities >= target && eligibleCards >= target && identitiesWithOwnEligibleCard >= target
    && ownerMismatches.length === 0 && restaurants.size >= MIN_DISTINCT_POOL_RESTAURANTS;
  return {
    DEMO_MEAL_BUDDY_IDENTITIES: identities,
    DEMO_ACTIVE_ELIGIBLE_MEAL_BUDDY_CARDS: eligibleCards,
    DEMO_IDENTITIES_WITH_OWN_ELIGIBLE_CARD: identitiesWithOwnEligibleCard,
    OWNER_MISMATCHES: ownerMismatches.length,
    DISTINCT_POOL_RESTAURANTS: restaurants.size,
    DISTINCT_POOL_MENU_ITEMS: menuItems.size,
    DISTINCT_POOL_FOOD_CONTEXTS: foodContexts.size,
    target,
    DEMO_MEAL_BUDDY_POOL: pass ? "PASS" : "FAIL"
  };
}

async function readEligibleMenuItems(ref) {
  const rows = await readOnlySql(ref, `select distinct menu_item_id from public.consumer_public_next_meal_candidates_v2 where menu_item_id like 'gqa6r-demo-item-%'`);
  return new Set(rows.map((r) => r.menu_item_id));
}

async function readState(ref, primaryEmail) {
  const ids = Array.from({ length: MAX_ORDINAL }, (_, i) => buildMealBuddyIdentity(i + 1).id);
  const rows = await readOnlySql(ref, `select u.id::text id,
      exists (select 1 from public.consumer_profiles p where p.user_id = u.id and p.status = 'active' and p.deleted_at is null) profile,
      exists (select 1 from public.social_participation sp where sp.user_id = u.id and sp.state = 'opted_in') participation,
      coalesce((select json_agg(json_build_object('id', c.id, 'owner_user_id', c.owner_user_id, 'card_type', c.card_type, 'restaurant_id', c.restaurant_id,
        'branch_id', bc.branch_id, 'food_context_tag_key', c.food_context_tag_key, 'dining_date', c.dining_date, 'meal_period', c.meal_period,
        'active', c.cancelled_at is null and c.expires_at > now()))
        from public.meal_buddy_cards c left join social_internal.meal_buddy_card_branch_context bc on bc.card_id = c.id
        where c.owner_user_id = u.id), '[]'::json) cards,
      ${primaryEmail ? `exists (select 1 from auth.users pu where lower(pu.email) = lower('${primaryEmail.replace(/'/g, "''")}') and (
        exists (select 1 from public.meal_buddy_relationships r where r.user_low_id = least(u.id, pu.id) and r.user_high_id = greatest(u.id, pu.id))
        or exists (select 1 from public.social_blocks b where (b.blocker_user_id = u.id and b.blocked_user_id = pu.id) or (b.blocker_user_id = pu.id and b.blocked_user_id = u.id))))` : "false"} consumed
    from auth.users u where u.id in (${ids.map((id) => `'${id}'::uuid`).join(",")})`);
  return new Map(rows.map((r) => [r.id, { authUser: true, profile: r.profile, participation: r.participation, cards: r.cards, consumed: r.consumed }]));
}

/** Pure: the exact per-identity handoff (no user ids beyond the deterministic Demo ids in the manifest). */
export function handoffPlan(plan) {
  return plan.actions.map((a) => {
    const b = a.identity.card.recommendation;
    return {
      label: a.identity.label, id: a.identity.id,
      steps: a.steps.map((s) => typeof s === "string" ? s : "cancel_other_restaurant_card_via_edge"),
      create_request: a.steps.includes("create_recommendation_card") ? {
        edge_function: "meal-buddy-card-create", acting_as: a.identity.label, cardType: "restaurant", intentionType: a.identity.card.intention_type,
        restaurantId: b.restaurant_id, selectedRecommendation: { source: "canonical_next_meal", branchMenuItemId: b.branch_menu_item_id, menuItemId: b.menu_item_id, restaurantId: b.restaurant_id, branchId: b.branch_id },
        menu_item_label: b.menu_item_label, restaurant_label: b.restaurant_label, expected_food_context_tag_key: b.expected_food_context_tag_key
      } : null
    };
  });
}

async function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  if (process.argv.includes("--apply")) throw new Error("refusing: this utility is read-only; Meal Buddy Demo generation is HANDOFF_TO_PLANNER_FOR_DEMO_DATA_GENERATION");
  const slot = { ...defaultTargetSlot(), ...(arg("--dining-date") ? { diningDate: arg("--dining-date") } : {}), ...(arg("--meal-period") ? { mealPeriod: arg("--meal-period") } : {}) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.diningDate) || !PERIODS.has(slot.mealPeriod)) throw new Error("invalid target slot");
  const ref = DEVELOPMENT_PROJECT_REF;
  await verifyDevelopmentTarget(ref);
  const state = await readState(ref, arg("--primary-email"));
  const eligibleMenuItems = await readEligibleMenuItems(ref);
  const plan = planMealBuddyPool(state, slot);
  const measured = measureMealBuddyPool(state, slot, eligibleMenuItems);
  const catalogueMissing = [...new Set(plan.actions.map((a) => a.identity.card.recommendation.menu_item_id))].filter((id) => !eligibleMenuItems.has(id));
  console.log(JSON.stringify({ status: measured.DEMO_MEAL_BUDDY_POOL === "PASS" ? "POOL_SATISFIED" : "HANDOFF_TO_PLANNER_FOR_DEMO_DATA_GENERATION", slot, ...measured,
    prerequisite: catalogueMissing.length ? { catalogue_items_not_yet_eligible: catalogueMissing.length, run_first: "gqa6r-ensure-demo-catalogue-pool.mjs --apply --confirm-development" } : null,
    identitiesNeedingWork: handoffPlan(plan) }, null, 1));
  if (measured.DEMO_MEAL_BUDDY_POOL !== "PASS") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
