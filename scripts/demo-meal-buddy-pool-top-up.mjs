#!/usr/bin/env node
// Development-only Demo pool maintenance: the single canonical entrypoint for unattended automation.
//
//   node scripts/demo-meal-buddy-pool-top-up.mjs                                     # read-only plan
//   node scripts/demo-meal-buddy-pool-top-up.mjs --apply --confirm-development [--next-slot]
//
// Exit codes (for schedulers): 0 = pool and catalogue satisfied (including the zero-write no-op);
// 1 = refused or failed (wrong/unverified target, canonical authority unavailable, executor membership
// not in its canonical state, any card action failed or was rolled back); 2 = Meal Buddy shortfall could
// not be filled from eligible Demo identities; 3 = Demo catalogue below target (read-only; never repaired here).
//
// Invariants (each proven offline by scripts/demo-meal-buddy-pool-top-up-guard.mjs):
// - Target: the Management API's own answer must be ref msbgnnoorsoefuiwluye AND name tastkind-development,
//   checked first and again immediately before any write. Anything else (Production included) fails closed.
// - Identities: only profiles carrying BOTH Demo markers — profile_id `mealbuddy_demo_NN` and display name
//   `[DEMO] 飯友 NN` with the same NN. Ordinary users and the user-held interactive test identity are never
//   read into the plan, so they can never be written.
// - Participation is REUSED, never created: without an existing canonical `opted_in` row an identity is not
//   eligible. No consent, participation, invitation, relationship or block is ever written or removed.
// - Cards: only through the canonical writer the card Edge Function itself calls,
//   social_internal.create_meal_buddy_card_from_recommendation_with_branch_context, with the Edge Function's
//   argument shape: caps from the same entitlement resolution (free 1/1, premium 3/2; unknown plan or status
//   fails closed), server-derived food context, and the four canonical [DEMO] recommendation identities read
//   from consumer_public_next_meal_candidates_v2. Expiry, quota and eligibility stay inside that writer. A
//   card occupying the quota for another slot is cancelled only through social_internal.cancel_meal_buddy_card.
//   No table is ever INSERTed/UPDATEd/DELETEd here; expired cards are never revived, cancelled or deleted.
// - Slot: the current Asia/Taipei slot with the app's own boundaries (meal-buddy-card-create/types.ts), or the
//   next one; never an expired slot.
// - Executor access: each action is ONE transaction — advisory lock, in-transaction "already present" check,
//   grant social_runtime_executor to postgres (SET only), the canonical call(s), revoke the same grant, commit.
//   A failure rolls the whole transaction back, grant included. Writes are refused unless the membership is
//   in its canonical state first, and the run fails unless it is identical afterwards.
// - Idempotent: shortfall = target - currently valid, recomputed from canonical state right before writing.
//   A full pool performs ZERO write calls.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOGUE_TARGET, DEVELOPMENT_PROJECT_NAME, DEVELOPMENT_PROJECT_REF, MEAL_BUDDY_TARGET, mealBuddyCatalogueBinding } from "./gqa6r-demo-fixtures.mjs";

export const DEMO_PROFILE_ID_PATTERN = /^mealbuddy_demo_(\d{2})$/;
export const DEMO_DISPLAY_NAME_PATTERN = /^\[DEMO\] 飯友 (\d{2})$/;
export const DEMO_RESTAURANT_PREFIX = "gqa6r-demo-restaurant-";
export const DEMO_BRANCH_PREFIX = "gqa6r-demo-branch-";
export const DEMO_MENU_ITEM_PREFIX = "gqa6r-demo-item-";
// Mirrors supabase/functions/_shared/meal-buddy-card-api/policy.ts MEAL_BUDDY_CARD_QUOTA.
export const CARD_CAPS = Object.freeze({ free: Object.freeze({ general: 1, restaurant: 1 }), premium: Object.freeze({ general: 3, restaurant: 2 }) });
// Mirrors supabase/functions/_shared/social-exposure/policy.ts.
const PLAN_CODES = new Set(["free", "premium"]);
const ENTITLEMENT_STATUSES = new Set(["active", "expired", "cancelled", "grace_period"]);
const PREMIUM_STATUSES = new Set(["active", "grace_period"]);
// The app's create-card slot boundaries (apps/mobile/features/meal-buddy-card-create/types.ts), Asia/Taipei hours.
export const SLOT_HOUR_BOUNDARIES = Object.freeze({ breakfastBefore: 9, lunchBefore: 14, dinnerBefore: 21 });
const PERIOD_ORDER = ["breakfast", "lunch", "dinner", "late_night"];
// Canonical expiry (social_internal.meal_buddy_card_expires_at): end of the meal occasion in Asia/Taipei.
const PERIOD_END = Object.freeze({ breakfast: [0, 11], lunch: [0, 15], dinner: [0, 22], late_night: [1, 2] });
const POOL_LOCK_KEY = "demo_meal_buddy_pool_top_up";

const pad = (n) => String(n).padStart(2, "0");

function taipeiParts(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(instant).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pure: canonical expiry instant of a slot (mirrors social_internal.meal_buddy_card_expires_at). */
export function slotExpiresAt(slot) {
  const end = PERIOD_END[slot.mealPeriod];
  if (!end) throw new Error("invalid meal period");
  return new Date(`${addDays(slot.diningDate, end[0])}T${pad(end[1])}:00:00+08:00`);
}

/** Pure: the slot the app itself would create a card for at `instant`. */
export function currentSlot(instant = new Date()) {
  const { date, hour } = taipeiParts(instant);
  const b = SLOT_HOUR_BOUNDARIES;
  const mealPeriod = hour < b.breakfastBefore ? "breakfast" : hour < b.lunchBefore ? "lunch" : hour < b.dinnerBefore ? "dinner" : "late_night";
  return { diningDate: date, mealPeriod };
}

/** Pure: the slot after `slot`. */
export function nextSlot(slot) {
  const i = PERIOD_ORDER.indexOf(slot.mealPeriod);
  if (i < 0) throw new Error("invalid meal period");
  return i === PERIOD_ORDER.length - 1
    ? { diningDate: addDays(slot.diningDate, 1), mealPeriod: PERIOD_ORDER[0] }
    : { diningDate: slot.diningDate, mealPeriod: PERIOD_ORDER[i + 1] };
}

/** Pure: only the current or the next slot is a legal target, and it must not already be expired. */
export function assertTargetSlot(slot, instant = new Date()) {
  const current = currentSlot(instant);
  const next = nextSlot(current);
  const same = (a, b) => a.diningDate === b.diningDate && a.mealPeriod === b.mealPeriod;
  if (!same(slot, current) && !same(slot, next)) throw new Error("refusing: target slot is neither the current nor the next Asia/Taipei meal slot");
  if (slotExpiresAt(slot).getTime() <= instant.getTime()) throw new Error("refusing: target slot has already expired");
  return slot;
}

/** Pure: a Demo identity row is recognised only when BOTH markers agree on the same ordinal. */
export function demoOrdinal(row) {
  const a = DEMO_PROFILE_ID_PATTERN.exec(row?.profile_id ?? "");
  const b = DEMO_DISPLAY_NAME_PATTERN.exec(row?.display_name ?? "");
  return a && b && a[1] === b[1] ? Number(a[1]) : null;
}

/** Pure: the Edge Function's entitlement resolution (resolveEntitlement.ts). Throws on an unknown shape. */
export function resolveEntitlementClass(rows, instant = new Date()) {
  const now = instant.getTime();
  let premium = false;
  for (const row of rows ?? []) {
    if (!PLAN_CODES.has(row?.plan_code) || !ENTITLEMENT_STATUSES.has(row?.status)) throw new Error("entitlement contract violated");
    const from = Date.parse(row.valid_from);
    if (!Number.isFinite(from)) throw new Error("entitlement contract violated");
    const until = row.valid_until === null || row.valid_until === undefined ? null : Date.parse(row.valid_until);
    if (until !== null && !Number.isFinite(until)) throw new Error("entitlement contract violated");
    if (row.plan_code === "premium" && PREMIUM_STATUSES.has(row.status) && now >= from && (until === null || now <= until)) premium = true;
  }
  return premium ? "premium" : "free";
}

const isActive = (card, instant) => card.cancelled_at === null && new Date(card.expires_at).getTime() > instant.getTime();

/** Pure: is this card the identity's own valid canonical [DEMO] restaurant card for the slot? */
export function isValidSlotCard(card, ownerId, slot, instant = new Date()) {
  return card.owner_user_id === ownerId
    && card.card_type === "restaurant"
    && isActive(card, instant)
    && card.dining_date === slot.diningDate && card.meal_period === slot.mealPeriod
    && typeof card.restaurant_id === "string" && card.restaurant_id.startsWith(DEMO_RESTAURANT_PREFIX)
    && typeof card.branch_id === "string" && card.branch_id.startsWith(DEMO_BRANCH_PREFIX)
    && card.context_restaurant_id === card.restaurant_id
    && typeof card.food_context_tag_key === "string" && card.food_context_tag_key.length > 0;
}

/** Pure: canonical candidate eligibility of the identity itself (card aside). */
export function isEligibleIdentity(s) {
  return s.profileActive === true && s.participation === "opted_in" && s.blocked === false && (s.entitlementClass === "free" || s.entitlementClass === "premium");
}

/** Pure: pick the canonical recommendation tuple for an ordinal (fixture rotation, else any eligible [DEMO] item). */
export function chooseRecommendation(ordinal, tuples) {
  const preferred = mealBuddyCatalogueBinding(ordinal);
  const byItem = new Map(tuples.map((t) => [t.menu_item_id, t]));
  const hit = byItem.get(preferred.menu_item_id)
    ?? tuples.find((t) => t.restaurant_id === preferred.restaurant_id)
    ?? tuples[(ordinal - 1) % Math.max(tuples.length, 1)];
  if (!hit) return null;
  if (!hit.menu_item_id.startsWith(DEMO_MENU_ITEM_PREFIX) || !hit.restaurant_id.startsWith(DEMO_RESTAURANT_PREFIX) || !hit.branch_id.startsWith(DEMO_BRANCH_PREFIX)) return null;
  return hit;
}

/**
 * Pure planning. `identities`: [{ ordinal, userId, profileActive, participation, blocked, hasRelationship,
 * entitlementClass, cards }] where `cards` are the identity's ACTIVE cards. Returns { eligible, valid,
 * shortfall, actions, unfillable }. A full pool yields zero actions.
 */
export function planTopUp(identities, slot, tuples, { target = MEAL_BUDDY_TARGET.eligibleCards, instant = new Date() } = {}) {
  const ordered = [...identities].sort((a, b) => a.ordinal - b.ordinal);
  const eligible = ordered.filter(isEligibleIdentity);
  const valid = eligible.filter((s) => s.cards.some((c) => isValidSlotCard(c, s.userId, slot, instant)));
  const shortfall = Math.max(0, target - valid.length);
  const actions = [];
  if (shortfall > 0) {
    // Identities without any invitation/relationship are used first; nothing is ever reset to free one up.
    const open = eligible.filter((s) => !valid.includes(s))
      .sort((a, b) => Number(a.hasRelationship) - Number(b.hasRelationship) || a.ordinal - b.ordinal);
    for (const s of open) {
      if (actions.length === shortfall) break;
      const recommendation = chooseRecommendation(s.ordinal, tuples);
      if (!recommendation) continue;
      const caps = CARD_CAPS[s.entitlementClass];
      // Only when the restaurant quota is full is the identity's own active restaurant card for ANOTHER slot
      // cancelled (oldest-expiring first), through the canonical cancel primitive. Expired cards hold no quota
      // and are never touched.
      const others = s.cards.filter((c) => c.owner_user_id === s.userId && c.card_type === "restaurant" && isActive(c, instant))
        .sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));
      const replace = others.slice(0, Math.max(0, others.length - caps.restaurant + 1)).map((c) => c.id);
      actions.push({ ordinal: s.ordinal, userId: s.userId, intention: s.ordinal % 2 ? "chat_first" : "eat_together", caps, recommendation, replace });
    }
  }
  return { eligible: eligible.length, valid: valid.length, shortfall, actions, unfillable: shortfall - actions.length };
}

const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INT = (n) => { if (!Number.isInteger(n) || n < 0 || n > 9) throw new Error("invalid cap"); return String(n); };

/** Pure: the single write transaction for one action. Canonical primitives only; net-zero executor grant. */
export function buildActionSql(action, slot) {
  if (!UUID.test(action.userId)) throw new Error("invalid actor id");
  for (const id of action.replace) if (!UUID.test(id)) throw new Error("invalid card id");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.diningDate) || !PERIOD_ORDER.includes(slot.mealPeriod)) throw new Error("invalid slot");
  const r = action.recommendation;
  const actor = `${lit(action.userId)}::uuid`;
  const run = "where pg_catalog.current_setting('demo_pool.skip') = 'off'";
  // Only the final create statement returns rows, so its payload is unambiguous in the API result.
  return [
    "begin;",
    // Concurrent automation: a run queued behind the lock sees the card the first run committed and skips.
    `do $$ begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(${lit(POOL_LOCK_KEY)}, 0));`
      + ` perform pg_catalog.set_config('demo_pool.skip', case when exists (select 1 from public.meal_buddy_cards c where c.owner_user_id = ${actor}`
      + ` and c.card_type = 'restaurant' and c.cancelled_at is null and c.expires_at > pg_catalog.now()`
      + ` and c.dining_date = ${lit(slot.diningDate)}::date and c.meal_period = ${lit(slot.mealPeriod)}) then 'on' else 'off' end, true); end $$;`,
    "grant social_runtime_executor to postgres with inherit false, set true;",
    "set local role social_runtime_executor;",
    ...action.replace.map((id) => `do $$ begin if pg_catalog.current_setting('demo_pool.skip') = 'off' then perform social_internal.cancel_meal_buddy_card(${actor}, ${lit(id)}::uuid); end if; end $$;`),
    `select social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(${actor}, 'restaurant', ${lit(action.intention)}, ${lit(r.restaurant_id)}, null, ${lit(slot.diningDate)}::date, ${lit(slot.mealPeriod)}, null, ${INT(action.caps.general)}, ${INT(action.caps.restaurant)}, null, ${lit(r.candidate_id)}, ${lit(r.menu_item_id)}, ${lit(r.restaurant_id)}, ${lit(r.branch_id)}) as payload ${run};`,
    "reset role;",
    "revoke social_runtime_executor from postgres granted by postgres;",
    "commit;"
  ].join("\n");
}

const STATE_SQL = `
  select p.user_id::text user_id, p.profile_id, p.display_name,
    (p.status = 'active' and p.deleted_at is null) profile_active,
    (select sp.state from public.social_participation sp where sp.user_id = p.user_id) participation,
    exists (select 1 from public.social_blocks b where p.user_id in (b.blocker_user_id, b.blocked_user_id)) blocked,
    exists (select 1 from public.meal_buddy_relationships r where p.user_id in (r.user_low_id, r.user_high_id)) has_relationship,
    coalesce((select json_agg(json_build_object('plan_code', e.plan_code, 'status', e.status, 'valid_from', e.valid_from, 'valid_until', e.valid_until))
      from public.subscription_entitlements e where e.user_id = p.user_id), '[]'::json) entitlements,
    coalesce((select json_agg(json_build_object('id', c.id, 'owner_user_id', c.owner_user_id, 'card_type', c.card_type,
      'restaurant_id', c.restaurant_id, 'branch_id', bc.branch_id, 'context_restaurant_id', bc.restaurant_id,
      'food_context_tag_key', c.food_context_tag_key, 'dining_date', c.dining_date::text, 'meal_period', c.meal_period,
      'cancelled_at', c.cancelled_at, 'expires_at', c.expires_at))
      from public.meal_buddy_cards c left join social_internal.meal_buddy_card_branch_context bc on bc.card_id = c.id
      where c.owner_user_id = p.user_id and c.cancelled_at is null and c.expires_at > now()), '[]'::json) cards
  from public.consumer_profiles p
  where p.profile_id ~ '^mealbuddy_demo_[0-9]{2}$' and p.display_name ~ '^\\[DEMO\\] 飯友 [0-9]{2}$'`;

const TUPLES_SQL = `select distinct candidate_id, menu_item_id, restaurant_id, branch_id from public.consumer_public_next_meal_candidates_v2
  where menu_item_id like 'gqa6r-demo-item-%' and restaurant_id like 'gqa6r-demo-restaurant-%' and branch_id like 'gqa6r-demo-branch-%' order by menu_item_id`;

const CATALOGUE_SQL = `select count(distinct r.id)::int restaurants, count(distinct v.menu_item_id)::int eligible_items,
  coalesce((select min(c)::int from (select count(distinct v2.menu_item_id) c from public.restaurants r2
    left join public.consumer_public_next_meal_candidates_v2 v2 on v2.restaurant_id = r2.id where r2.name like '[DEMO]%' group by r2.id) x), 0) min_per_restaurant
  from public.restaurants r left join public.consumer_public_next_meal_candidates_v2 v on v.restaurant_id = r.id where r.name like '[DEMO]%'`;

const AUTHORITY_SQL = `select
  to_regprocedure('social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(uuid,text,text,text,text,date,text,time,integer,integer,text,text,text,text,text)') is not null as writer,
  to_regprocedure('social_internal.cancel_meal_buddy_card(uuid,uuid)') is not null as cancel,
  to_regprocedure('social_internal.meal_buddy_card_expires_at(date,text)') is not null as expiry,
  to_regclass('public.consumer_public_next_meal_candidates_v2') is not null as candidates,
  to_regrole('social_runtime_executor') is not null as executor`;

const EXECUTOR_MEMBERSHIP_SQL = `select pg_get_userbyid(m.grantor) grantor, m.admin_option, m.inherit_option, m.set_option from pg_auth_members m
  where m.member = 'postgres'::regrole and m.roleid = 'social_runtime_executor'::regrole order by 1`;

/** Pure: the only membership state from which writes are allowed (and to which they must return). */
export function isCanonicalExecutorMembership(rows) {
  return Array.isArray(rows) && rows.length === 1 && rows[0].grantor === "supabase_admin" && rows[0].set_option === false;
}

export function catalogueMeetsTarget(c) {
  return c.restaurants >= CATALOGUE_TARGET.restaurants && c.min_per_restaurant >= CATALOGUE_TARGET.itemsPerRestaurant
    && c.eligible_items >= CATALOGUE_TARGET.restaurants * CATALOGUE_TARGET.itemsPerRestaurant;
}

/** Reads canonical Meal Buddy state through the injected read-only API. */
export async function readCanonicalState(api, ref, instant = new Date()) {
  const rows = await api.readOnlySql(ref, STATE_SQL);
  const identities = [];
  for (const row of rows) {
    const ordinal = demoOrdinal(row);
    if (ordinal === null) continue;
    let entitlementClass = null;
    try { entitlementClass = resolveEntitlementClass(row.entitlements, instant); } catch { entitlementClass = null; } // fail closed for this identity
    identities.push({ ordinal, userId: row.user_id, profileActive: row.profile_active === true, participation: row.participation ?? null,
      blocked: row.blocked === true, hasRelationship: row.has_relationship === true, entitlementClass, cards: Array.isArray(row.cards) ? row.cards : [] });
  }
  const tuples = await api.readOnlySql(ref, TUPLES_SQL);
  return { identities, tuples };
}

async function verifyTarget(api) {
  const ref = await api.verifyDevelopmentTarget(DEVELOPMENT_PROJECT_REF);
  if (ref !== DEVELOPMENT_PROJECT_REF) throw new Error("refusing: Development target not verified");
  return ref;
}

/** The whole maintenance run, with the API injected (the guard runs it against fakes). */
export async function runTopUp({ api, apply = false, slot, instant = new Date(), target = MEAL_BUDDY_TARGET.eligibleCards }) {
  const verifiedRef = await verifyTarget(api);
  assertTargetSlot(slot, instant);
  const authority = (await api.readOnlySql(verifiedRef, AUTHORITY_SQL))?.[0] ?? {};
  const missing = Object.entries({ writer: authority.writer, cancel: authority.cancel, expiry: authority.expiry, candidates: authority.candidates, executor: authority.executor })
    .filter(([, ok]) => ok !== true).map(([k]) => k);
  if (missing.length) throw new Error(`refusing: canonical authority unavailable (${missing.join(", ")})`);
  const catalogue = (await api.readOnlySql(verifiedRef, CATALOGUE_SQL))?.[0] ?? { restaurants: 0, eligible_items: 0, min_per_restaurant: 0 };
  const before = await readCanonicalState(api, verifiedRef, instant);
  const plan = planTopUp(before.identities, slot, before.tuples, { target, instant });
  const outcomes = [];
  let membershipBefore = null;
  let membershipAfter = null;
  const write = apply && plan.actions.length > 0;
  if (write) {
    if ((await verifyTarget(api)) !== verifiedRef) throw new Error("refusing: target changed before write");
    membershipBefore = await api.readOnlySql(verifiedRef, EXECUTOR_MEMBERSHIP_SQL);
    if (!isCanonicalExecutorMembership(membershipBefore)) throw new Error("refusing: executor membership is not in its canonical state");
    for (const action of plan.actions) {
      try {
        const result = await api.fixtureWriteSql(verifiedRef, verifiedRef, buildActionSql(action, slot));
        const payloadRow = (Array.isArray(result) ? result : []).find((r) => r && "payload" in r);
        if (!payloadRow) { outcomes.push({ ordinal: action.ordinal, status: "skipped_already_present" }); continue; }
        const payload = typeof payloadRow.payload === "string" ? JSON.parse(payloadRow.payload) : payloadRow.payload;
        outcomes.push({ ordinal: action.ordinal, status: payload?.ok === true ? "created" : `rejected:${String(payload?.reason ?? payload?.error ?? "unknown").slice(0, 60)}`, replaced: action.replace.length });
      } catch (error) {
        // The whole transaction (lock, grant, cancel, create) rolled back; nothing from this action persisted.
        outcomes.push({ ordinal: action.ordinal, status: `failed:${String(error?.message ?? error).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>").slice(0, 140)}` });
      }
    }
    membershipAfter = await api.readOnlySql(verifiedRef, EXECUTOR_MEMBERSHIP_SQL);
  }
  const after = write ? await readCanonicalState(api, verifiedRef, new Date(Math.max(instant.getTime(), Date.now()))) : before;
  const afterPlan = planTopUp(after.identities, slot, after.tuples, { target, instant });
  const executorAuthorityRestored = !write || JSON.stringify(membershipBefore) === JSON.stringify(membershipAfter);
  return {
    target: { project: DEVELOPMENT_PROJECT_NAME, ref: verifiedRef, verified: true },
    slot, slotExpiresAt: slotExpiresAt(slot).toISOString(),
    catalogue: { ...catalogue, meetsTarget: catalogueMeetsTarget(catalogue), maintenance: "read-only" },
    mealBuddy: { eligibleIdentities: afterPlan.eligible, validCardsBefore: plan.valid, shortfallBefore: plan.shortfall, validCardsAfter: afterPlan.valid, shortfallAfter: afterPlan.shortfall, unfillable: plan.unfillable },
    writeCalls: write ? plan.actions.length : 0,
    cardsCreated: outcomes.filter((o) => o.status === "created").length,
    outcomes, executorAuthorityRestored
  };
}

/** Pure: scheduler exit code for a report. */
export function exitCodeFor(report) {
  if (!report.executorAuthorityRestored || report.outcomes.some((o) => o.status !== "created" && o.status !== "skipped_already_present")) return 1;
  if (report.mealBuddy.shortfallAfter > 0) return 2;
  if (!report.catalogue.meetsTarget) return 3;
  return 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--confirm-development")) throw new Error("refusing: --apply requires --confirm-development");
  const api = await import("./gqa6r-development-api.mjs");
  const instant = new Date();
  const base = currentSlot(instant);
  const slot = process.argv.includes("--next-slot") ? nextSlot(base) : base;
  const report = await runTopUp({ api, apply, slot, instant });
  // Aggregates only: ordinals of synthetic [DEMO] identities, never auth ids, emails or tokens.
  console.log(JSON.stringify({ mode: apply ? "apply" : "plan", ...report }, null, 1));
  process.exitCode = exitCodeFor(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
