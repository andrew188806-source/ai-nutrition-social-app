#!/usr/bin/env node
// Regression guard for scripts/demo-meal-buddy-pool-top-up.mjs, the Development Demo pool maintenance
// entrypoint. Offline: runs the real authority against a stateful in-memory fake of the Development
// Management API (own clock, canonical writer semantics, no network, no credentials) and checks its source.
import fs from "node:fs";
import path from "node:path";
import {
  buildActionSql, currentSlot, demoOrdinal, exitCodeFor, isValidSlotCard, nextSlot, planTopUp, resolveEntitlementClass,
  runTopUp, SLOT_HOUR_BOUNDARIES, slotExpiresAt
} from "./demo-meal-buddy-pool-top-up.mjs";

const results = [];
const check = (name, pass) => results.push({ name, pass: Boolean(pass) });
const ROOT = process.cwd();
const DEV = "msbgnnoorsoefuiwluye";
const T = (iso) => new Date(iso);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const p2 = (n) => String(n).padStart(2, "0");
const tuples = Array.from({ length: 20 }, (_, r) => [1, 2, 3].map((i) => ({
  candidate_id: `gqa6r-demo-bmi-${p2(r + 1)}-${i}`, menu_item_id: `gqa6r-demo-item-${p2(r + 1)}-${i}`,
  restaurant_id: `gqa6r-demo-restaurant-${p2(r + 1)}`, branch_id: `gqa6r-demo-branch-${p2(r + 1)}`
}))).flat();
const identity = (n, over = {}) => ({ user_id: uid(n), profile_id: `mealbuddy_demo_${p2(n)}`, display_name: `[DEMO] 飯友 ${p2(n)}`,
  profile_active: true, participation: "opted_in", blocked: false, has_relationship: false, entitlements: [], ...over });

/** Stateful fake of the Development project: canonical writer semantics, clock-driven expiry. */
function fakeDevelopment(people, opts = {}) {
  const state = { now: opts.now ?? T("2026-10-02T14:30:00Z"), cards: [], seq: 1, verify: 0, reads: 0, writes: [], membership: [{ grantor: "supabase_admin", admin_option: true, inherit_option: false, set_option: false }] };
  const caps = (p) => resolveEntitlementClass(p.entitlements, state.now) === "premium" ? { general: 3, restaurant: 2 } : { general: 1, restaurant: 1 };
  const active = (c) => c.cancelled_at === null && new Date(c.expires_at) > state.now;
  const api = {
    state,
    async verifyDevelopmentTarget() {
      state.verify += 1;
      if ((opts.ref ?? DEV) !== DEV || (opts.name ?? "tastkind-development") !== "tastkind-development") throw new Error("refusing: not Development");
      return DEV;
    },
    async readOnlySql(_ref, sql) {
      state.reads += 1;
      if (/to_regprocedure/.test(sql)) return [{ writer: opts.writerMissing ? false : true, cancel: true, expiry: true, candidates: true, executor: true }];
      if (/pg_auth_members/.test(sql)) return opts.nonCanonicalMembership ? [...state.membership, { grantor: "postgres", set_option: true }] : state.membership;
      if (/count\(distinct r\.id\)/.test(sql)) return [opts.catalogue ?? { restaurants: 20, eligible_items: 60, min_per_restaurant: 3 }];
      if (/consumer_public_next_meal_candidates_v2/.test(sql)) return tuples;
      return people.map((p) => ({ ...p, cards: state.cards.filter((c) => c.owner_user_id === p.user_id && active(c)) }));
    },
    async fixtureWriteSql(ref, verified, sql) {
      if (ref !== verified || ref !== DEV) throw new Error("unverified write");
      state.writes.push(sql);
      const actor = /with_branch_context\('([0-9a-f-]{36})'::uuid/.exec(sql)[1];
      if (opts.failActor === actor) throw new Error("Management API 400: simulated failure (transaction rolled back)");
      const [, date, period] = /'(\d{4}-\d{2}-\d{2})'::date, '([a-z_]+)', null/.exec(sql);
      const person = people.find((p) => p.user_id === actor);
      const skip = state.cards.some((c) => c.owner_user_id === actor && c.card_type === "restaurant" && active(c) && c.dining_date === date && c.meal_period === period);
      if (skip) return [];
      for (const [, id] of sql.matchAll(/cancel_meal_buddy_card\('[0-9a-f-]{36}'::uuid, '([0-9a-f-]{36})'::uuid\)/g)) {
        const card = state.cards.find((c) => c.id === id && c.owner_user_id === actor && active(c));
        if (card) card.cancelled_at = state.now.toISOString();
      }
      if (state.cards.filter((c) => c.owner_user_id === actor && c.card_type === "restaurant" && active(c)).length >= caps(person).restaurant) return [{ payload: { ok: false, reason: "quota_exceeded" } }];
      const [, bmi, , rid, bid] = /null, '([^']+)', '([^']+)', '([^']+)', '([^']+)'\) as payload/.exec(sql);
      state.cards.push({ id: uid(5000 + state.seq++), owner_user_id: actor, card_type: "restaurant", restaurant_id: rid, branch_id: bid, context_restaurant_id: rid,
        food_context_tag_key: `food.${bmi}`, dining_date: date, meal_period: period, cancelled_at: null, expires_at: slotExpiresAt({ diningDate: date, mealPeriod: period }).toISOString(),
        created_at: state.now.toISOString() });
      return [{ payload: { ok: true } }];
    }
  };
  return api;
}
const twenty = (over = () => ({})) => Array.from({ length: 20 }, (_, i) => identity(i + 1, over(i + 1)));
const run = (api, extra = {}) => runTopUp({ api, apply: true, slot: currentSlot(api.state.now), instant: api.state.now, ...extra });
const actorsOf = (writes) => writes.map((sql) => /with_branch_context\('([0-9a-f-]{36})'/.exec(sql)[1]);

// 1. Fill, then full-pool rerun is a zero-write no-op (and exit 0).
{
  const api = fakeDevelopment(twenty());
  const first = await run(api);
  const writesAfterFirst = api.state.writes.length;
  const second = await run(api);
  check("empty pool: exactly target cards created for distinct identities", first.cardsCreated === 20 && new Set(actorsOf(api.state.writes)).size === 20);
  check("full pool rerun under --apply: zero write calls, exit 0", second.writeCalls === 0 && api.state.writes.length === writesAfterFirst && exitCodeFor(second) === 0);
}
// 2. Only the shortfall is written.
{
  const api = fakeDevelopment(twenty());
  await run(api, { target: 13 });
  const report = await run(api);
  check("13 valid -> shortfall 7 -> exactly 7 more writes", report.mealBuddy.validCardsBefore === 13 && report.mealBuddy.shortfallBefore === 7 && report.writeCalls === 7 && report.mealBuddy.shortfallAfter === 0);
}
// 3. Meal-slot rollover: expired cards are neither revived, cancelled nor deleted; new cards use the new slot.
{
  const api = fakeDevelopment(twenty(), { now: T("2026-10-02T14:30:00Z") }); // 22:30 Taipei, late_night
  await run(api);
  const lateNight = api.state.cards.map((c) => ({ ...c }));
  api.state.now = T("2026-10-03T01:30:00Z"); // 09:30 Taipei next day: lunch slot, late_night expired at 02:00
  const writesBefore = api.state.writes.length;
  const rolled = await run(api);
  const newSql = api.state.writes.slice(writesBefore);
  const fresh = api.state.cards.filter((c) => c.dining_date === "2026-10-03" && c.meal_period === "lunch");
  check("rollover: shortfall recomputed after expiry and refilled for the new slot", rolled.mealBuddy.validCardsBefore === 0 && rolled.cardsCreated === 20 && fresh.length === 20);
  check("rollover: new cards carry the new slot's canonical expiry (server-derived, never caller-supplied)",
    fresh.every((c) => c.expires_at === "2026-10-03T07:00:00.000Z") && newSql.every((s) => !/expires_at\s*=|expires_at'?\s*,/.test(s.split("as payload")[0].split("social_internal.create")[1] ?? "")));
  check("rollover: expired cards are never cancelled, revived or deleted",
    newSql.every((s) => !/cancel_meal_buddy_card/.test(s)) && lateNight.every((old) => { const now = api.state.cards.find((c) => c.id === old.id); return now && now.cancelled_at === null && now.expires_at === old.expires_at; }));
  const again = await run(api);
  check("rollover: immediate rerun is a zero-write no-op", again.writeCalls === 0 && exitCodeFor(again) === 0);
}
// 4. Quota overlap (00:30 Taipei: app creates breakfast while late_night is still active): canonical cancel only.
{
  const api = fakeDevelopment(twenty(), { now: T("2026-10-02T14:30:00Z") });
  await run(api);
  api.state.now = T("2026-10-02T16:30:00Z"); // 00:30 Taipei: late_night still active until 02:00
  const before = api.state.writes.length;
  const report = await run(api);
  const sqls = api.state.writes.slice(before);
  check("quota-full identity: its own other-slot card is cancelled only via the canonical cancel primitive, inside the same transaction",
    report.cardsCreated === 20 && sqls.every((s) => (s.match(/social_internal\.cancel_meal_buddy_card\(/g) ?? []).length === 1));
}
// 5. Only doubly-marked [DEMO] identities with existing canonical participation and resolvable entitlement.
{
  const people = [identity(1), identity(2, { participation: null }), identity(3, { participation: "paused" }), identity(4, { profile_active: false }),
    identity(5, { blocked: true }), { ...identity(6), display_name: "Ordinary user" }, { ...identity(7), profile_id: "someone_else" },
    { ...identity(8), display_name: "[DEMO] 飯友 09" }, { ...identity(9), display_name: "[DEMO] 飯友 測試帳號", profile_id: "gqa6r_demo_secondary" },
    identity(10, { entitlements: [{ plan_code: "mystery", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_until: null }] })];
  const api = fakeDevelopment(people);
  const report = await run(api);
  check("only the eligible doubly-marked [DEMO] identity is ever written", actorsOf(api.state.writes).join() === uid(1));
  check("unfillable shortfall is reported with exit code 2", report.mealBuddy.unfillable === 19 && exitCodeFor(report) === 2);
  check("marker parsing requires both markers on the same ordinal", demoOrdinal(identity(4)) === 4 && demoOrdinal({ profile_id: "mealbuddy_demo_08", display_name: "[DEMO] 飯友 09" }) === null);
}
// 6. Relationship holders are used last and never touched.
{
  const plan = planTopUp([1, 2, 3].map((n) => ({ ordinal: n, userId: uid(n), profileActive: true, participation: "opted_in", blocked: false, entitlementClass: "free", hasRelationship: n === 1, cards: [] })),
    currentSlot(T("2026-10-02T14:30:00Z")), tuples, { target: 2, instant: T("2026-10-02T14:30:00Z") });
  check("identities holding an invitation/relationship are not preferred", plan.actions.map((a) => a.ordinal).join() === "2,3");
}
// 7. Entitlement/cap rules mirror the Edge Function.
{
  const now = T("2026-10-02T14:30:00Z");
  check("no entitlement row resolves to free", resolveEntitlementClass([], now) === "free");
  check("active premium within its window resolves to premium", resolveEntitlementClass([{ plan_code: "premium", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_until: null }], now) === "premium");
  check("expired premium status resolves to free", resolveEntitlementClass([{ plan_code: "premium", status: "expired", valid_from: "2026-01-01T00:00:00Z", valid_until: null }], now) === "free");
  let threw = false; try { resolveEntitlementClass([{ plan_code: "gold", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_until: null }], now); } catch { threw = true; }
  check("unknown plan fails closed", threw);
  const api = fakeDevelopment([identity(1, { entitlements: [{ plan_code: "premium", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_until: null }] }), identity(2)]);
  await run(api, { target: 2 });
  const byActor = Object.fromEntries(api.state.writes.map((s) => [/with_branch_context\('([0-9a-f-]{36})'/.exec(s)[1], /, null, (\d), (\d), null, 'gqa6r/.exec(s).slice(1).join("/")]));
  check("caps sent are the entitlement's caps (premium 3/2, free 1/1)", byActor[uid(1)] === "3/2" && byActor[uid(2)] === "1/1");
}
// 8. Wrong target / Production fails closed before any read or write.
{
  const api = fakeDevelopment(twenty(), { ref: "productionref000000", name: "tastkind-production" });
  let refused = false;
  try { await run(api); } catch { refused = true; }
  check("non-Development target refused with zero reads and zero writes", refused && api.state.reads === 0 && api.state.writes.length === 0);
  const api2 = fakeDevelopment(twenty(), { name: "tastkind-production" });
  let refused2 = false;
  try { await run(api2); } catch { refused2 = true; }
  check("right ref with a wrong project name is refused too", refused2 && api2.state.writes.length === 0);
  const api3 = fakeDevelopment(twenty());
  await run(api3);
  check("target is re-verified immediately before writing", api3.state.verify === 2);
}
// 9. Canonical authority unavailable / executor membership not canonical: fail closed, zero writes.
{
  const api = fakeDevelopment(twenty(), { writerMissing: true });
  let refused = false; try { await run(api); } catch (e) { refused = /canonical authority unavailable/.test(e.message); }
  check("missing canonical writer: refused before any write", refused && api.state.writes.length === 0);
  const api2 = fakeDevelopment(twenty(), { nonCanonicalMembership: true });
  let refused2 = false; try { await run(api2); } catch (e) { refused2 = /executor membership/.test(e.message); }
  check("non-canonical executor membership: writes refused", refused2 && api2.state.writes.length === 0);
}
// 10. Partial failure: the failed action leaves nothing behind, the rest proceed, the run exits 1.
{
  const api = fakeDevelopment(twenty(), { failActor: uid(5) });
  const report = await run(api);
  check("one failed transaction: no card for that identity, others created, exit code 1",
    !api.state.cards.some((c) => c.owner_user_id === uid(5)) && report.cardsCreated === 19 && exitCodeFor(report) === 1 && report.executorAuthorityRestored);
}
// 11. Catalogue is verified read-only; below target is a blocker (exit 3), never repaired.
{
  const api = fakeDevelopment(twenty(), { catalogue: { restaurants: 19, eligible_items: 57, min_per_restaurant: 3 } });
  const report = await run(api);
  check("catalogue below target: exit 3 with zero catalogue writes", exitCodeFor(report) === 3 && report.catalogue.maintenance === "read-only"
    && api.state.writes.every((s) => !/(restaurants|menu_items|menus|branch_menu_items)\s*\(/.test(s)));
}
// 12. Slot legality and alignment with the app's own create-card boundaries.
{
  const now = T("2026-10-02T14:30:00Z");
  const refuse = async (slot) => { const api = fakeDevelopment([identity(1)], { now }); try { await runTopUp({ api, apply: true, slot, instant: now }); return false; } catch { return api.state.writes.length === 0; } };
  check("an already-expired slot is refused", await refuse({ diningDate: "2026-10-02", mealPeriod: "dinner" }));
  check("a slot beyond next is refused", await refuse({ diningDate: "2026-10-03", mealPeriod: "lunch" }));
  check("late_night expiry crosses midnight to 02:00 Asia/Taipei", slotExpiresAt({ diningDate: "2026-10-02", mealPeriod: "late_night" }).toISOString() === "2026-10-02T18:00:00.000Z");
  check("next slot after late_night is tomorrow's breakfast", JSON.stringify(nextSlot({ diningDate: "2026-10-02", mealPeriod: "late_night" })) === JSON.stringify({ diningDate: "2026-10-03", mealPeriod: "breakfast" }));
  const app = fs.readFileSync(path.join(ROOT, "apps/mobile/features/meal-buddy-card-create/types.ts"), "utf8");
  const appBounds = /hour < (\d+)\s*\?\s*"breakfast"\s*:\s*hour < (\d+)\s*\?\s*"lunch"\s*:\s*hour < (\d+)\s*\?\s*"dinner"/.exec(app.replace(/\s+/g, " "));
  check("slot boundaries equal the app's create-card defaults",
    appBounds && Number(appBounds[1]) === SLOT_HOUR_BOUNDARIES.breakfastBefore && Number(appBounds[2]) === SLOT_HOUR_BOUNDARIES.lunchBefore && Number(appBounds[3]) === SLOT_HOUR_BOUNDARIES.dinnerBefore
    && currentSlot(T("2026-10-03T00:59:00Z")).mealPeriod === "breakfast" && currentSlot(T("2026-10-03T01:00:00Z")).mealPeriod === "lunch");
}
// 13. Card validity: other owners, non-Demo context, missing branch context, cancelled never count.
{
  const now = T("2026-10-02T14:30:00Z");
  const slot = currentSlot(now);
  const base = { id: uid(9), owner_user_id: uid(1), card_type: "restaurant", restaurant_id: "gqa6r-demo-restaurant-01", branch_id: "gqa6r-demo-branch-01", context_restaurant_id: "gqa6r-demo-restaurant-01",
    food_context_tag_key: "food.x", dining_date: slot.diningDate, meal_period: slot.mealPeriod, cancelled_at: null, expires_at: slotExpiresAt(slot).toISOString() };
  check("only the identity's own canonical [DEMO] slot card counts",
    isValidSlotCard(base, uid(1), slot, now) && !isValidSlotCard(base, uid(2), slot, now)
    && !isValidSlotCard({ ...base, branch_id: null, context_restaurant_id: null }, uid(1), slot, now)
    && !isValidSlotCard({ ...base, restaurant_id: "real-restaurant", context_restaurant_id: "real-restaurant" }, uid(1), slot, now)
    && !isValidSlotCard({ ...base, cancelled_at: now.toISOString() }, uid(1), slot, now));
}
// 14. Write SQL shape: one transaction, lock + in-transaction skip, net-zero executor grant, canonical primitives only.
{
  const sql = buildActionSql({ ordinal: 1, userId: uid(1), intention: "chat_first", caps: { general: 1, restaurant: 1 }, recommendation: tuples[0], replace: [uid(2001)] }, { diningDate: "2026-10-02", mealPeriod: "late_night" });
  const lines = sql.split("\n");
  check("transaction order: begin, lock+skip, grant, set local role, cancel, create, reset, revoke, commit",
    lines[0] === "begin;" && /pg_advisory_xact_lock[\s\S]*set_config\('demo_pool\.skip'/.test(lines[1])
    && lines[2] === "grant social_runtime_executor to postgres with inherit false, set true;" && lines[3] === "set local role social_runtime_executor;"
    && /social_internal\.cancel_meal_buddy_card\(/.test(lines[4]) && /^select social_internal\.create_meal_buddy_card_from_recommendation_with_branch_context\(/.test(lines[5])
    && lines[6] === "reset role;" && lines[7] === "revoke social_runtime_executor from postgres granted by postgres;" && lines[8] === "commit;" && lines.length === 9);
  check("only the create statement returns rows (lock, skip and cancel run in DO blocks)", lines.filter((l) => /^select /.test(l)).length === 1);
  check("server-derived food context and the four canonical recommendation identities, as the Edge Function sends",
    /, 1, 1, null, 'gqa6r-demo-bmi-01-1', 'gqa6r-demo-item-01-1', 'gqa6r-demo-restaurant-01', 'gqa6r-demo-branch-01'\) as payload/.test(sql));
  let rejected = false;
  try { buildActionSql({ ordinal: 1, userId: "x'; drop table t; --", intention: "chat_first", caps: { general: 1, restaurant: 1 }, recommendation: tuples[0], replace: [] }, { diningDate: "2026-10-02", mealPeriod: "late_night" }); } catch { rejected = true; }
  check("non-uuid actor ids are rejected", rejected);
}
// 15. Static source invariants.
{
  const src = fs.readFileSync(path.join(ROOT, "scripts/demo-meal-buddy-pool-top-up.mjs"), "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, "");
  check("no INSERT/UPDATE/DELETE/TRUNCATE anywhere (no direct-table fallback)", !/\b(insert\s+into|update\s+(public|social_internal|auth)\.|delete\s+from|truncate)\b/i.test(code));
  check("never writes participation, consent, relationships, blocks, profiles or auth users",
    !/(opt_in_authenticated_social_participation|consumer_data_consents|send_meal_buddy_invite|resolve_meal_buddy_relationship|auth\.users)/.test(code));
  check("only the two canonical card primitives are invoked",
    (code.match(/social_internal\.[a-z_]+\(/g) ?? []).every((f) => ["social_internal.cancel_meal_buddy_card(", "social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(", "social_internal.meal_buddy_card_expires_at(", "social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(uuid,"].some((ok) => f.startsWith(ok.replace(/\(.*/, "(")))));
  check("--apply requires --confirm-development (no interactive prompt)", /if \(apply && !process\.argv\.includes\("--confirm-development"\)\) throw/.test(code) && !/readline|prompt\(/.test(code));
  check("no secret or credential literal", !/(eyJ[A-Za-z0-9_-]{15,}\.|sb_secret_|sbp_[A-Za-z0-9]{20,}|service_role_key|postgres(ql)?:\/\/)/i.test(src));
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name}`);
console.log(JSON.stringify({ suite: "demo-meal-buddy-pool-top-up-guard", total: results.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
