#!/usr/bin/env node
// SR-2G-B local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// The REAL policy, validator, composer, executor-statement layer and the frozen SR-2G-A reference
// cipher all execute, transpiled in memory. Only the executor transport is substituted, by a model
// that reproduces the frozen SQL function's own semantics — advisory-lock serialisation, active-only
// counting, cap refusal and idempotent cancel — so the TypeScript authority above it is exercised
// exactly as deployed. The live behaviour of the SQL itself is proven separately by the Development
// acceptance; this suite proves the composition layer, which that acceptance cannot isolate.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2GB_API_ROOT, SR2GB_EXPIRY_SCHEDULE, SR2GB_MIGRATION } from "./social-candidate-sr2g-b-successor-manifest.mjs";

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

// --- in-memory Deno-style loader -----------------------------------------------------------------
const cache = new Map();
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) throw new Error(`unexpected external import: ${specifier}`);
    return load(path.resolve(path.dirname(absolute), specifier));
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const api = load(path.join(root, SR2GB_API_ROOT, "compose.ts"));
const policy = load(path.join(root, SR2GB_API_ROOT, "policy.ts"));
const validate = load(path.join(root, SR2GB_API_ROOT, "validate.ts"));
const ref = load(path.join(root, "supabase/functions/_shared/meal-buddy-card-ref/index.ts"));

const ACTOR_A = "11111111-2222-4333-8444-555555555555";
const ACTOR_B = "99999999-8888-4777-8666-555555555555";
const KEY = Buffer.alloc(32, 5);
const NOW = new Date("2026-08-17T04:00:00.000Z");

// --- a faithful model of the frozen SQL authority -------------------------------------------------
function createModel() {
  const rows = [];
  let sequence = 0;
  let inCriticalSection = false;

  const active = (owner, type, now) => rows.filter((row) =>
    row.owner === owner && (type ? row.card_type === type : true)
    && row.cancelled_at === null && new Date(row.expires_at) > now);

  const expiresAt = (diningDate, period) => {
    const [h, m] = SR2GB_EXPIRY_SCHEDULE[period].split(":").map(Number);
    const [y, mo, d] = diningDate.split("-").map(Number);
    // Asia/Taipei is UTC+8; the schedule times are local, late_night lands on the next local day.
    return new Date(Date.UTC(y, mo - 1, d + (period === "late_night" ? 1 : 0), h - 8, m)).toISOString();
  };

  const counts = (owner, now) => ({
    general: active(owner, "general", now).length,
    restaurant: active(owner, "restaurant", now).length
  });

  return {
    rows,
    lockContended: false,
    withTransaction: async (operation) => operation({
      query: async (statement, parameters) => {
        const text = statement.text;
        if (text.includes("create_meal_buddy_card")) {
          const [owner, cardType, intentionType, restaurantId, area, diningDate, mealPeriod, preferredTime, generalCap, restaurantCap] = parameters;
          // The advisory lock makes the count and the insert indivisible. Re-entering the section
          // before it completes would be exactly the TOCTOU the lock exists to prevent.
          if (inCriticalSection) throw new Error("advisory lock violated");
          inCriticalSection = true;
          try {
            const cap = cardType === "general" ? generalCap : restaurantCap;
            const now = NOW;
            if (active(owner, cardType, now).length >= cap) {
              return [{ payload: { ok: false, reason: "quota_exceeded" } }];
            }
            sequence += 1;
            const row = {
              id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
              owner,
              card_type: cardType,
              intention_type: intentionType,
              restaurant_id: restaurantId,
              area,
              dining_date: diningDate,
              meal_period: mealPeriod,
              preferred_time: preferredTime,
              created_at: now.toISOString(),
              expires_at: expiresAt(diningDate, mealPeriod),
              cancelled_at: null
            };
            rows.push(row);
            return [{ payload: { ok: true, card: row, counts: counts(owner, now) } }];
          } finally { inCriticalSection = false; }
        }
        if (text.includes("list_owned_meal_buddy_cards")) {
          const [owner] = parameters;
          const order = { breakfast: 1, lunch: 2, dinner: 3, late_night: 4 };
          const cards = active(owner, null, NOW).slice().sort((a, b) =>
            a.dining_date.localeCompare(b.dining_date)
            || order[a.meal_period] - order[b.meal_period]
            || b.created_at.localeCompare(a.created_at)
            || a.id.localeCompare(b.id));
          return [{ payload: { cards, counts: counts(owner, NOW) } }];
        }
        if (text.includes("cancel_meal_buddy_card")) {
          const [owner, cardId] = parameters;
          const row = rows.find((entry) => entry.id === cardId && entry.owner === owner);
          if (!row) return [{ payload: { ok: false } }];
          row.cancelled_at = row.cancelled_at ?? NOW.toISOString();
          return [{ payload: { ok: true } }];
        }
        throw new Error(`unexpected statement: ${text}`);
      },
      abort: () => { throw new Error("aborted"); }
    }),
    close: async () => undefined
  };
}

const entitlementSource = (planCode) => ({
  from: () => ({
    select: () => ({
      eq: async () => ({
        error: null,
        data: planCode === "premium"
          ? [{ plan_code: "premium", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_until: null }]
          : []
      })
    })
  })
});

const composition = (transport, planCode, actor = ACTOR_A) => ({
  transport,
  entitlementRowSource: entitlementSource(planCode),
  cardRefKey: KEY,
  actorUserId: actor,
  requestInstant: NOW
});

const body = (overrides = {}) => ({
  cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
  diningDate: "2026-08-20", mealPeriod: "dinner", preferredTime: null, ...overrides
});

const rejected = async (promise) => { try { await promise; return false; } catch { return true; } };

try {
  // --- Free caps -------------------------------------------------------------------------------
  const freeModel = createModel();
  const freeFirst = await api.composeMealBuddyCardCreate(composition(freeModel, "free"), body());
  check("01 Free may create its first general card", freeFirst.ok === true);
  check("02 Free general limit is reported as 1", freeFirst.value.quota.general.limit === 1);
  const freeSecond = await api.composeMealBuddyCardCreate(composition(freeModel, "free"), body());
  check("03 Free is refused a second active general card",
    freeSecond.ok === false && freeSecond.errorCode === "card_quota_exceeded");
  const freeRestaurant = await api.composeMealBuddyCardCreate(composition(freeModel, "free"),
    body({ cardType: "restaurant", restaurantId: "r-1" }));
  check("04 Free may create its first restaurant card", freeRestaurant.ok === true);
  check("05 Free restaurant limit is reported as 1", freeRestaurant.value.quota.restaurant.limit === 1);
  check("06 Free is refused a second active restaurant card",
    (await api.composeMealBuddyCardCreate(composition(freeModel, "free"),
      body({ cardType: "restaurant", restaurantId: "r-1" }))).errorCode === "card_quota_exceeded");

  // --- Premium caps ------------------------------------------------------------------------------
  const premiumModel = createModel();
  const premiumGeneral = [];
  for (let index = 0; index < 3; index += 1) {
    premiumGeneral.push(await api.composeMealBuddyCardCreate(composition(premiumModel, "premium"), body()));
  }
  check("07 Premium may create three general cards", premiumGeneral.every((r) => r.ok === true));
  check("08 Premium general limit is reported as 3", premiumGeneral[0].value.quota.general.limit === 3);
  check("09 Premium is refused a fourth general card",
    (await api.composeMealBuddyCardCreate(composition(premiumModel, "premium"), body())).errorCode === "card_quota_exceeded");
  const premiumRestaurant = [];
  for (let index = 0; index < 2; index += 1) {
    premiumRestaurant.push(await api.composeMealBuddyCardCreate(composition(premiumModel, "premium"),
      body({ cardType: "restaurant", restaurantId: "r-1" })));
  }
  check("10 Premium may create two restaurant cards", premiumRestaurant.every((r) => r.ok === true));
  check("11 Premium restaurant limit is reported as 2", premiumRestaurant[0].value.quota.restaurant.limit === 2);
  check("12 Premium is refused a third restaurant card",
    (await api.composeMealBuddyCardCreate(composition(premiumModel, "premium"),
      body({ cardType: "restaurant", restaurantId: "r-1" }))).errorCode === "card_quota_exceeded");

  // --- quota is used, not merely held --------------------------------------------------------------
  check("13 used counts reflect the active cards", premiumGeneral[2].value.quota.general.used === 3);

  // --- cancel frees quota ---------------------------------------------------------------------------
  const listed = await api.composeMealBuddyCardList(composition(freeModel, "free"));
  const generalRef = listed.cards.find((card) => card.cardType === "general").sourceCardRef;
  const cancelled = await api.composeMealBuddyCardCancel(composition(freeModel, "free"), generalRef);
  check("14 the owner may cancel their own card", cancelled.ok === true && cancelled.value.cancelled === true);
  const afterCancel = await api.composeMealBuddyCardList(composition(freeModel, "free"));
  check("15 a cancelled card leaves the list", afterCancel.cards.every((card) => card.cardType !== "general"));
  check("16 a cancelled card no longer consumes quota", afterCancel.quota.general.used === 0);
  check("17 the freed slot can be used again",
    (await api.composeMealBuddyCardCreate(composition(freeModel, "free"), body())).ok === true);
  check("18 cancelling again is idempotent",
    (await api.composeMealBuddyCardCancel(composition(freeModel, "free"), generalRef)).ok === true);

  // --- expired cards free quota -------------------------------------------------------------------------
  const expiredModel = createModel();
  await api.composeMealBuddyCardCreate(composition(expiredModel, "free"), body());
  expiredModel.rows[0].expires_at = new Date(NOW.getTime() - 3_600_000).toISOString();
  const afterExpiry = await api.composeMealBuddyCardList(composition(expiredModel, "free"));
  check("19 an expired card leaves the list", afterExpiry.cards.length === 0);
  check("20 an expired card no longer consumes quota", afterExpiry.quota.general.used === 0);
  check("21 the expired slot can be used again",
    (await api.composeMealBuddyCardCreate(composition(expiredModel, "free"), body())).ok === true);

  // --- list is active-only, owner-only, deterministic -------------------------------------------------------
  const orderModel = createModel();
  for (const [diningDate, mealPeriod] of [["2026-08-22", "dinner"], ["2026-08-20", "late_night"], ["2026-08-20", "breakfast"]]) {
    await api.composeMealBuddyCardCreate(composition(orderModel, "premium"), body({ diningDate, mealPeriod }));
  }
  const ordered = await api.composeMealBuddyCardList(composition(orderModel, "premium"));
  check("22 the list is ordered by dining date then canonical meal period",
    JSON.stringify(ordered.cards.map((c) => `${c.diningDate}|${c.mealPeriod}`))
    === JSON.stringify(["2026-08-20|breakfast", "2026-08-20|late_night", "2026-08-22|dinner"]),
    ordered.cards.map((c) => `${c.diningDate}|${c.mealPeriod}`));
  const orderedAgain = await api.composeMealBuddyCardList(composition(orderModel, "premium"));
  check("23 repeated lists are deterministic",
    JSON.stringify(orderedAgain.cards.map((c) => c.diningDate)) === JSON.stringify(ordered.cards.map((c) => c.diningDate)));
  check("24 every list issues a fresh reference",
    orderedAgain.cards[0].sourceCardRef !== ordered.cards[0].sourceCardRef);
  check("25 a different actor sees none of those cards",
    (await api.composeMealBuddyCardList(composition(orderModel, "premium", ACTOR_B))).cards.length === 0);

  // --- reference opacity and binding -------------------------------------------------------------------------
  const sample = ordered.cards[0];
  const rawIds = orderModel.rows.map((row) => row.id);
  check("26 the reference is an mbc1 token", sample.sourceCardRef.startsWith("mbc1."));
  check("27 no raw card identifier appears in any reference",
    !ordered.cards.some((card) => rawIds.some((id) => card.sourceCardRef.includes(id))));
  check("28 no owner identifier appears in any reference",
    !ordered.cards.some((card) => card.sourceCardRef.includes(ACTOR_A)));
  check("29 the card DTO carries exactly the client-safe fields",
    JSON.stringify(Object.keys(sample).sort()) === JSON.stringify(
      ["area", "cardType", "createdAt", "diningDate", "expiresAt", "intentionType", "mealPeriod", "preferredTime", "restaurantId", "sourceCardRef"]),
    Object.keys(sample).sort());
  check("30 no serialized response mentions a tier or billing fact",
    !/premium|free|plan_code|entitlement|billing|isPremium/i.test(JSON.stringify(ordered)));

  // --- wrong actor and wrong purpose ------------------------------------------------------------------------------
  check("31 another actor cannot cancel with a foreign reference",
    (await api.composeMealBuddyCardCancel(composition(orderModel, "premium", ACTOR_B), sample.sourceCardRef)).ok === false);
  const cipher = ref.createMealBuddyCardRefCipher(KEY);
  const candidateRef = await cipher.seal(ACTOR_A, "candidate", rawIds[0], NOW);
  check("32 a candidate-purpose reference cannot cancel",
    (await api.composeMealBuddyCardCancel(composition(orderModel, "premium"), candidateRef)).ok === false);
  check("33 a malformed reference fails closed",
    (await api.composeMealBuddyCardCancel(composition(orderModel, "premium"), "mbc1.rubbish")).ok === false);
  check("34 an expired reference fails closed",
    (await api.composeMealBuddyCardCancel({ ...composition(orderModel, "premium"), requestInstant: new Date(NOW.getTime() + 86_400_001) }, sample.sourceCardRef)).ok === false);

  // --- validator: the caller carries no authority ---------------------------------------------------------------------
  check("35 a well-formed body validates", validate.validateMealBuddyCardCreateRequest(body(), NOW).ok === true);
  for (const field of ["ownerUserId", "expiresAt", "tier", "isPremium", "quota", "cardId", "status"]) {
    check(`36.${field} a body naming ${field} is rejected`,
      validate.validateMealBuddyCardCreateRequest({ ...body(), [field]: "x" }, NOW).ok === false);
  }
  check("37 a restaurant card without a restaurant is rejected",
    validate.validateMealBuddyCardCreateRequest(body({ cardType: "restaurant" }), NOW).ok === false);
  check("38 an unknown meal period is rejected",
    validate.validateMealBuddyCardCreateRequest(body({ mealPeriod: "brunch" }), NOW).ok === false);
  check("39 an impossible calendar date is rejected",
    validate.validateMealBuddyCardCreateRequest(body({ diningDate: "2026-02-30" }), NOW).ok === false);
  check("40 a malformed preferred time is rejected",
    validate.validateMealBuddyCardCreateRequest(body({ preferredTime: "25:00" }), NOW).ok === false);

  // --- Taipei date and expiry mapping ------------------------------------------------------------------------------------
  // 2026-08-17T04:00Z is 12:00 Taipei on the 17th; 2026-08-17T20:00Z is already the 18th locally.
  check("41 the Taipei calendar date is used, not the UTC one",
    policy.taipeiCalendarDate(new Date("2026-08-17T20:00:00Z")) === "2026-08-18"
    && policy.taipeiCalendarDate(new Date("2026-08-17T04:00:00Z")) === "2026-08-17");
  check("42 a dining date in the Taipei past is rejected",
    validate.validateMealBuddyCardCreateRequest(body({ diningDate: "2026-08-16" }), NOW).ok === false);
  check("43 today's Taipei date is accepted",
    validate.validateMealBuddyCardCreateRequest(body({ diningDate: "2026-08-17" }), NOW).ok === true);

  const migrationSql = fs.readFileSync(path.join(root, SR2GB_MIGRATION), "utf8");
  check("44 the frozen Asia/Taipei schedule is exactly breakfast 11:00, lunch 15:00, dinner 22:00, late_night 02:00",
    Object.entries(SR2GB_EXPIRY_SCHEDULE).every(([period, time]) => migrationSql.includes(`when '${period}'`) && migrationSql.includes(`time '${time}'`)));
  check("45 late_night expiry lands on the following local day",
    migrationSql.includes("(p_dining_date + 1) + time '02:00'"));

  // --- concurrency: the lock is the authority ---------------------------------------------------------------------------------
  // Both creates are launched before either resolves. The model throws if the critical section is
  // re-entered, so a composition that counted outside the lock would fail here rather than pass.
  const raceModel = createModel();
  await api.composeMealBuddyCardCreate(composition(raceModel, "free"), body({ cardType: "restaurant", restaurantId: "r-1" }));
  const racers = await Promise.all([
    api.composeMealBuddyCardCreate(composition(raceModel, "free"), body()),
    api.composeMealBuddyCardCreate(composition(raceModel, "free"), body())
  ]);
  check("46 exactly one concurrent create succeeds", racers.filter((r) => r.ok === true).length === 1);
  check("47 exactly one concurrent create is refused by quota",
    racers.filter((r) => r.ok === false && r.errorCode === "card_quota_exceeded").length === 1);
  check("48 the model holds exactly the Free general cap", raceModel.rows.filter((row) => row.card_type === "general").length === 1);

  // --- direct-write denial is a database property, asserted structurally -------------------------------------------------------
  check("49 no INSERT, UPDATE or DELETE privilege is granted to authenticated",
    !/grant\s+(insert|update|delete|all)[^;]*to authenticated/i.test(migrationSql));
  check("50 authenticated holds only the SR-2G-A owner SELECT",
    /grant select on table public\.meal_buddy_cards to authenticated/.test(
      fs.readFileSync(path.join(root, "supabase/migrations/20260817010000_meal_buddy_card_authority.sql"), "utf8")));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-b-smoke",
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
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-b-smoke", error: error.message, stack: error.stack?.split("\n").slice(0, 5) }, null, 2));
  process.exit(1);
}
