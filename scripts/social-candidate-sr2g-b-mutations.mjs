#!/usr/bin/env node
// SR-2G-B meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Two families: the TypeScript authority is mutated and executed against a model of the
// frozen SQL, and the irreversible migration is mutated and re-evaluated against the structural
// contract. Every mutation targets a real authority — a cap, a binding, a lock, a leak or the
// frozen local-time schedule.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  SR2GB_API_ROOT,
  SR2GB_EXPIRY_SCHEDULE,
  SR2GB_MIGRATION
} from "./social-candidate-sr2g-b-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const POLICY = path.join(root, SR2GB_API_ROOT, "policy.ts");
const VALIDATE = path.join(root, SR2GB_API_ROOT, "validate.ts");
const COMPOSE = path.join(root, SR2GB_API_ROOT, "compose.ts");
const CONFIG_TOML = path.join(root, "supabase/config.toml");

const ACTOR_A = "11111111-2222-4333-8444-555555555555";
const ACTOR_B = "99999999-8888-4777-8666-555555555555";
const KEY = Buffer.alloc(32, 5);
const NOW = new Date("2026-08-17T04:00:00.000Z");

function loadGraph(mutate = {}) {
  const cache = new Map();
  function load(absolute) {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    let source = fs.readFileSync(absolute, "utf8");
    if (mutate[absolute]) source = mutate[absolute](source);
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    new Function("require", "module", "exports", outputText)(
      (spec) => load(path.resolve(path.dirname(absolute), spec)), module, module.exports);
    return module.exports;
  }
  return {
    api: load(COMPOSE),
    policy: load(POLICY),
    validate: load(VALIDATE),
    ref: load(path.join(root, "supabase/functions/_shared/meal-buddy-card-ref/index.ts"))
  };
}

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
    return new Date(Date.UTC(y, mo - 1, d + (period === "late_night" ? 1 : 0), h - 8, m)).toISOString();
  };
  const counts = (owner, now) => ({
    general: active(owner, "general", now).length,
    restaurant: active(owner, "restaurant", now).length
  });
  return {
    rows,
    withTransaction: async (operation) => operation({
      query: async (statement, parameters) => {
        const text = statement.text;
        if (text.includes("create_meal_buddy_card")) {
          const [owner, cardType, intentionType, restaurantId, area, diningDate, mealPeriod, preferredTime, generalCap, restaurantCap] = parameters;
          if (inCriticalSection) throw new Error("advisory lock violated");
          inCriticalSection = true;
          try {
            const cap = cardType === "general" ? generalCap : restaurantCap;
            if (active(owner, cardType, NOW).length >= cap) return [{ payload: { ok: false, reason: "quota_exceeded" } }];
            sequence += 1;
            const row = {
              id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
              owner, card_type: cardType, intention_type: intentionType, restaurant_id: restaurantId,
              area, dining_date: diningDate, meal_period: mealPeriod, preferred_time: preferredTime,
              created_at: NOW.toISOString(), expires_at: expiresAt(diningDate, mealPeriod), cancelled_at: null
            };
            rows.push(row);
            return [{ payload: { ok: true, card: row, counts: counts(owner, NOW) } }];
          } finally { inCriticalSection = false; }
        }
        if (text.includes("list_owned_meal_buddy_cards")) {
          const [owner] = parameters;
          return [{ payload: { cards: active(owner, null, NOW), counts: counts(owner, NOW) } }];
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
  from: () => ({ select: () => ({ eq: async () => ({
    error: null,
    data: planCode === "premium"
      ? [{ plan_code: "premium", status: "active", valid_from: "2026-01-01T00:00:00Z", valid_until: null }] : []
  }) }) })
});
const body = (overrides = {}) => ({
  cardType: "general", intentionType: "chat_first", restaurantId: null, area: null,
  diningDate: "2026-08-20", mealPeriod: "dinner", preferredTime: null, ...overrides
});

// --- the TypeScript authority contract -----------------------------------------------------------
async function typescriptViolations(mutate) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  try {
    const { api, validate, ref } = loadGraph(mutate);
    const comp = (model, plan, actor = ACTOR_A) => ({
      transport: model, entitlementRowSource: entitlementSource(plan),
      cardRefKey: KEY, actorUserId: actor, requestInstant: NOW
    });

    const free = createModel();
    const first = await api.composeMealBuddyCardCreate(comp(free, "free"), body());
    record("Free may create one general card", first.ok === true);
    record("Free general limit is exactly 1", first.ok && first.value.quota.general.limit === 1);
    record("Free is refused a second general card",
      (await api.composeMealBuddyCardCreate(comp(free, "free"), body())).ok === false);
    const freeRest = await api.composeMealBuddyCardCreate(comp(free, "free"), body({ cardType: "restaurant", restaurantId: "r" }));
    record("Free may create one restaurant card", freeRest.ok === true);
    record("Free restaurant limit is exactly 1", freeRest.ok && freeRest.value.quota.restaurant.limit === 1);
    record("Free is refused a second restaurant card",
      (await api.composeMealBuddyCardCreate(comp(free, "free"), body({ cardType: "restaurant", restaurantId: "r" }))).ok === false);
    record("the create response discloses no tier or billing fact",
      !/premium|free|plan_code|entitlement|isPremium|entitlementClass/i.test(JSON.stringify(first.value)));

    const premium = createModel();
    const three = [];
    for (let i = 0; i < 3; i += 1) three.push(await api.composeMealBuddyCardCreate(comp(premium, "premium"), body()));
    record("Premium may create three general cards", three.every((r) => r.ok === true));
    record("Premium general limit is exactly 3", three[0].ok && three[0].value.quota.general.limit === 3);
    record("Premium is refused a fourth general card",
      (await api.composeMealBuddyCardCreate(comp(premium, "premium"), body())).ok === false);
    const rest = [];
    for (let i = 0; i < 2; i += 1) rest.push(await api.composeMealBuddyCardCreate(comp(premium, "premium"), body({ cardType: "restaurant", restaurantId: "r" })));
    record("Premium restaurant limit is exactly 2", rest[0].ok && rest[0].value.quota.restaurant.limit === 2);
    record("Premium is refused a third restaurant card",
      (await api.composeMealBuddyCardCreate(comp(premium, "premium"), body({ cardType: "restaurant", restaurantId: "r" }))).ok === false);

    const listed = await api.composeMealBuddyCardList(comp(premium, "premium"));
    const sample = listed.cards[0];
    const rawIds = premium.rows.map((r) => r.id);
    record("no raw card identifier appears in a reference", !listed.cards.some((c) => rawIds.some((id) => c.sourceCardRef.includes(id))));
    record("no owner identifier appears in a reference", !listed.cards.some((c) => c.sourceCardRef.includes(ACTOR_A)));
    record("the DTO exposes no raw id field", !("id" in sample));
    record("no candidate reference is emitted", !("candidateCardRef" in sample));
    record("no tier or billing fact is serialized", !/premium|free|plan_code|entitlement|isPremium/i.test(JSON.stringify(listed)));

    record("a foreign actor cannot cancel",
      (await api.composeMealBuddyCardCancel(comp(premium, "premium", ACTOR_B), sample.sourceCardRef)).ok === false);
    const cipher = ref.createMealBuddyCardRefCipher(KEY);
    const candidateRef = await cipher.seal(ACTOR_A, "candidate", rawIds[0], NOW);
    record("a candidate-purpose reference cannot cancel",
      (await api.composeMealBuddyCardCancel(comp(premium, "premium"), candidateRef)).ok === false);
    // A reference sealed FOR this actor but naming somebody else's card. The cipher opens cleanly,
    // so only the database ownership predicate can refuse it — this is what proves possession of a
    // reference is never authority.
    const foreignCardId = "00000000-0000-4000-8000-999999999999";
    premium.rows.push({
      id: foreignCardId, owner: ACTOR_B, card_type: "general", intention_type: "chat_first",
      restaurant_id: null, area: null, dining_date: "2026-08-20", meal_period: "dinner",
      preferred_time: null, created_at: NOW.toISOString(),
      expires_at: new Date(NOW.getTime() + 86_400_000).toISOString(), cancelled_at: null
    });
    const sealedForeign = await cipher.seal(ACTOR_A, "source", foreignCardId, NOW);
    record("a reference naming another owner's card is refused by ownership",
      (await api.composeMealBuddyCardCancel(comp(premium, "premium"), sealedForeign)).ok === false);

    const cancelled = await api.composeMealBuddyCardCancel(comp(premium, "premium"), sample.sourceCardRef);
    record("the owner may cancel", cancelled.ok === true);
    record("cancel is idempotent",
      (await api.composeMealBuddyCardCancel(comp(premium, "premium"), sample.sourceCardRef)).ok === true);

    const expired = createModel();
    await api.composeMealBuddyCardCreate(comp(expired, "free"), body());
    expired.rows[0].expires_at = new Date(NOW.getTime() - 3_600_000).toISOString();
    record("an expired card frees quota",
      (await api.composeMealBuddyCardList(comp(expired, "free"))).quota.general.used === 0);

    record("a body naming an owner is rejected", validate.validateMealBuddyCardCreateRequest({ ...body(), ownerUserId: ACTOR_B }, NOW).ok === false);
    record("a body naming a tier is rejected", validate.validateMealBuddyCardCreateRequest({ ...body(), tier: "premium" }, NOW).ok === false);
    record("a body naming expiresAt is rejected", validate.validateMealBuddyCardCreateRequest({ ...body(), expiresAt: "2099-01-01" }, NOW).ok === false);
    record("a body naming a quota is rejected", validate.validateMealBuddyCardCreateRequest({ ...body(), quota: 9 }, NOW).ok === false);
    record("a past Taipei dining date is rejected", validate.validateMealBuddyCardCreateRequest(body({ diningDate: "2026-08-16" }), NOW).ok === false);
    // 20:00Z is already the NEXT day in Taipei but still the same day in UTC, so only a genuinely
    // Taipei-based comparison rejects 2026-08-17 here. A UTC implementation would accept it.
    record("the past-date rule is evaluated in Taipei, not UTC",
      validate.validateMealBuddyCardCreateRequest(body({ diningDate: "2026-08-17" }), new Date("2026-08-17T20:00:00Z")).ok === false);

    const race = createModel();
    await api.composeMealBuddyCardCreate(comp(race, "free"), body({ cardType: "restaurant", restaurantId: "r" }));
    const racers = await Promise.all([
      api.composeMealBuddyCardCreate(comp(race, "free"), body()),
      api.composeMealBuddyCardCreate(comp(race, "free"), body())
    ]);
    record("exactly one concurrent create succeeds", racers.filter((r) => r.ok === true).length === 1);
  } catch (error) {
    failed.push(`contract threw: ${error.message}`);
  }
  return failed;
}

// --- the SQL and config structural contract -------------------------------------------------------
const sqlExecutable = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const count = (h, n) => h.split(n).length - 1;

function migrationViolations(source, configToml) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const sql = sqlExecutable(source);
  record("quota is serialised by a transaction-scoped advisory lock", /pg_advisory_xact_lock\(/.test(sql));
  record("the lock is keyed by actor and card type", /p_actor_user_id::pg_catalog\.text \|\| ':' \|\| p_card_type/.test(sql));
  record("the lock precedes the active count", sql.indexOf("pg_advisory_xact_lock") < sql.indexOf("into v_used"));
  // Exact counts, not thresholds. The canonical migration has four active-card predicates — the
  // create count, the create recount, the list rows and the list counts — so a `>=` bound would let
  // a mutation delete one of them and still pass.
  record("cancelled cards are excluded from every active-card predicate", count(sql, "card.cancelled_at is null") === 4);
  record("expired cards are excluded from every active-card predicate", count(sql, "card.expires_at > v_now") === 4);
  record("ownership is part of the cancel predicate", /where card\.id = p_card_id\s*and card\.owner_user_id = p_actor_user_id/.test(sql));
  record("cancel is idempotent through coalesce", /set cancelled_at = coalesce\(card\.cancelled_at, v_now\)/.test(sql));
  record("coalesce is never schema-qualified", !/pg_catalog\.coalesce/.test(sql));
  record("list filters by owner", /card\.owner_user_id = p_actor_user_id/.test(sql));
  record("no write privilege is granted to authenticated", !/grant\s+(insert|update|delete|all)[^;]*to authenticated/i.test(sql));
  record("no privilege is granted to service_role", !/to service_role/.test(sql));
  record("EXECUTE goes only to the runtime executor", count(sql, "to social_runtime_executor") === 3);
  record("exactly one role is created", count(sql, "create role") === 1);
  record("the authority is NOBYPASSRLS", /nobypassrls/.test(sql));
  record("schema CREATE is revoked after transfer", /revoke create on schema social_internal from meal_buddy_card_write_authority/.test(sql));
  record("the breakfast expiry is 11:00 Taipei", /when 'breakfast'\s*then \(\(p_dining_date \+ time '11:00'\)/.test(sql));
  record("the lunch expiry is 15:00 Taipei", /when 'lunch'\s*then \(\(p_dining_date \+ time '15:00'\)/.test(sql));
  record("the dinner expiry is 22:00 Taipei", /when 'dinner'\s*then \(\(p_dining_date \+ time '22:00'\)/.test(sql));
  record("late_night expires 02:00 the next local day", /when 'late_night' then \(\(\(p_dining_date \+ 1\) \+ time '02:00'\)/.test(sql));
  record("every branch converts through Asia/Taipei", count(sql, "at time zone 'Asia/Taipei'") === 4);
  record("no candidate pool or ranking authority appears",
    !/canonical_candidate_pool|authorized_candidates|authorized_pair_sources|rankSocialCandidates/.test(sql));
  record("all three write functions verify JWT",
    ["meal-buddy-card-create", "meal-buddy-card-list", "meal-buddy-card-cancel"]
      .every((name) => new RegExp(`\\[functions\\.${name}\\][^\\[]*?verify_jwt = true`).test(configToml)));
  // A block-scoped search alone is not enough: an inserted `verify_jwt = false` above the real line
  // still leaves a later `= true` for the pattern to find. No function may disable verification.
  record("no function anywhere disables JWT verification", !/verify_jwt\s*=\s*false/.test(configToml));
  return failed;
}

// --- mutants --------------------------------------------------------------------------------------
const policySource = fs.readFileSync(POLICY, "utf8");
const validateSource = fs.readFileSync(VALIDATE, "utf8");
const composeSource = fs.readFileSync(COMPOSE, "utf8");
const migrationSource = fs.readFileSync(path.join(root, SR2GB_MIGRATION), "utf8");
const configSource = fs.readFileSync(CONFIG_TOML, "utf8");

const tsMutants = [
  { name: "the Free general cap is widened to two", file: POLICY,
    apply: (s) => s.replace("free: Object.freeze({ general: 1, restaurant: 1 })", "free: Object.freeze({ general: 2, restaurant: 1 })") },
  { name: "the Free restaurant cap is widened", file: POLICY,
    apply: (s) => s.replace("free: Object.freeze({ general: 1, restaurant: 1 })", "free: Object.freeze({ general: 1, restaurant: 2 })") },
  { name: "the Premium general cap is widened to four", file: POLICY,
    apply: (s) => s.replace("premium: Object.freeze({ general: 3, restaurant: 2 })", "premium: Object.freeze({ general: 4, restaurant: 2 })") },
  { name: "the Premium restaurant cap is widened to three", file: POLICY,
    apply: (s) => s.replace("premium: Object.freeze({ general: 3, restaurant: 2 })", "premium: Object.freeze({ general: 3, restaurant: 3 })") },
  { name: "Free is silently granted the Premium caps", file: POLICY,
    apply: (s) => s.replace("free: Object.freeze({ general: 1, restaurant: 1 })", "free: Object.freeze({ general: 3, restaurant: 2 })") },
  { name: "the Taipei calendar is replaced by UTC", file: POLICY,
    apply: (s) => s.replace('timeZone: MEAL_BUDDY_CARD_TIMEZONE,', 'timeZone: "UTC",') },
  { name: "the caller may supply an owner identifier", file: VALIDATE,
    apply: (s) => s.replace('"cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime"',
      '"cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime", "ownerUserId"') },
  { name: "the caller may supply an expiry", file: VALIDATE,
    apply: (s) => s.replace('"cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime"',
      '"cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime", "expiresAt"') },
  { name: "the caller may supply a tier", file: VALIDATE,
    apply: (s) => s.replace('"cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime"',
      '"cardType", "intentionType", "restaurantId", "area", "diningDate", "mealPeriod", "preferredTime", "tier"') },
  { name: "unknown request keys are ignored instead of rejected", file: VALIDATE,
    apply: (s) => s.replace("if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {\n    return { ok: false };\n  }", "") },
  { name: "the past-date rule is removed", file: VALIDATE,
    apply: (s) => s.replace("if (diningDate < taipeiCalendarDate(requestInstant)) return { ok: false };", "") },
  { name: "the raw card id is returned to the client", file: COMPOSE,
    apply: (s) => s.replace("  return Object.freeze({\n    sourceCardRef,", "  return Object.freeze({\n    id: row.id,\n    sourceCardRef,") },
  { name: "a candidate reference is emitted alongside the source reference", file: COMPOSE,
    apply: (s) => s.replace("  return Object.freeze({\n    sourceCardRef,",
      "  return Object.freeze({\n    candidateCardRef: await cipher.seal(actorUserId, \"candidate\", row.id, issuedAt),\n    sourceCardRef,") },
  { name: "the entitlement class is disclosed in the response", file: COMPOSE,
    apply: (s) => s.replace("      quota: toQuotaDto(outcome.counts, caps)", "      quota: toQuotaDto(outcome.counts, caps), entitlementClass: (await resolveCaps(composition)) === caps ? \"premium\" : \"free\"") },
  { name: "cancel accepts a candidate-purpose reference", file: COMPOSE,
    apply: (s) => s.replace("MEAL_BUDDY_CARD_REF_PURPOSE_SOURCE, sourceCardRef, requestInstant", "\"candidate\", sourceCardRef, requestInstant") },
  { name: "cancel drops the actor binding, enabling cross-user cancel", file: COMPOSE,
    apply: (s) => s.replace("const cancelled = await cancelOwnedCard(composition.transport, actorUserId, cardId);",
      "const cancelled = await cancelOwnedCard(composition.transport, actorUserId, cardId) || true;") },
  { name: "the opacity assertion is removed and the raw id leaks into the reference", file: COMPOSE,
    apply: (s) => s
      .replace("  if (sourceCardRef.includes(row.id) || sourceCardRef.includes(actorUserId)) {\n    return mealBuddyCardContractViolation();\n  }\n", "")
      .replace("  return Object.freeze({\n    sourceCardRef,", "  return Object.freeze({\n    sourceCardRef: `${sourceCardRef}${row.id}`,") }
];

const sqlMutants = [
  { name: "the advisory lock is removed, reopening the quota race",
    apply: (s) => s.replace(/  perform pg_catalog\.pg_advisory_xact_lock\([\s\S]*?\);\n/, "") },
  { name: "cancelled cards are counted toward quota",
    apply: (s) => s.replace("and card.cancelled_at is null\n    and card.expires_at > v_now;", "and card.expires_at > v_now;") },
  { name: "expired cards are counted toward quota",
    apply: (s) => s.replace("and card.cancelled_at is null\n    and card.expires_at > v_now;", "and card.cancelled_at is null;") },
  { name: "cancel no longer checks ownership, enabling cross-user cancel",
    apply: (s) => s.replace("where card.id = p_card_id\n    and card.owner_user_id = p_actor_user_id;", "where card.id = p_card_id;") },
  { name: "cancel becomes non-idempotent by overwriting the cancellation instant",
    apply: (s) => s.replace("set cancelled_at = coalesce(card.cancelled_at, v_now)", "set cancelled_at = v_now") },
  { name: "authenticated is granted INSERT on the card table",
    apply: (s) => s.replace("grant select, insert on table public.meal_buddy_cards to meal_buddy_card_write_authority;",
      "grant select, insert on table public.meal_buddy_cards to meal_buddy_card_write_authority;\ngrant insert on table public.meal_buddy_cards to authenticated;") },
  { name: "service_role is granted the write functions",
    apply: (s) => s.replace("grant execute on function social_internal.list_owned_meal_buddy_cards(uuid) to social_runtime_executor;",
      "grant execute on function social_internal.list_owned_meal_buddy_cards(uuid) to service_role;") },
  { name: "schema CREATE is left granted to the authority",
    apply: (s) => s.replace("revoke create on schema social_internal from meal_buddy_card_write_authority;\n", "") },
  { name: "the dinner expiry is moved off the frozen schedule",
    apply: (s) => s.replace("when 'dinner'     then ((p_dining_date + time '22:00')", "when 'dinner'     then ((p_dining_date + time '23:30')") },
  { name: "late_night no longer crosses midnight",
    apply: (s) => s.replace("when 'late_night' then (((p_dining_date + 1) + time '02:00')", "when 'late_night' then ((p_dining_date + time '02:00')") },
  { name: "expiry is computed in UTC rather than Asia/Taipei",
    apply: (s) => s.replaceAll("at time zone 'Asia/Taipei'", "at time zone 'UTC'") },
  { name: "the authority role becomes BYPASSRLS",
    apply: (s) => s.replace("nologin noinherit nobypassrls", "nologin noinherit bypassrls") },
  { name: "candidate pool authority is introduced into the write round",
    apply: (s) => s.replace("commit;", "create function social_internal.mbc_pool(a uuid) returns setof uuid language sql stable as $x$ select user_id from social_internal.canonical_candidate_pool(a) $x$;\n\ncommit;") }
];

const configMutants = [
  { name: "a write function is deployed without JWT verification",
    apply: (s) => s.replace("[functions.meal-buddy-card-create]", "[functions.meal-buddy-card-create]\nverify_jwt = false\n#") }
];

const results = [];

const canonicalTs = await typescriptViolations({});
results.push({ name: "canonical TypeScript authority satisfies the exact SR-2G-B contract", applied: true,
  killed: canonicalTs.length === 0, status: canonicalTs.length === 0 ? "killed" : "survived", violations: canonicalTs });
const canonicalSql = migrationViolations(migrationSource, configSource);
results.push({ name: "canonical migration and config satisfy the exact SR-2G-B contract", applied: true,
  killed: canonicalSql.length === 0, status: canonicalSql.length === 0 ? "killed" : "survived", violations: canonicalSql });

for (const mutant of tsMutants) {
  const original = mutant.file === POLICY ? policySource : mutant.file === VALIDATE ? validateSource : composeSource;
  const mutated = mutant.apply(original);
  const applied = mutated !== original;
  const failed = applied ? await typescriptViolations({ [mutant.file]: () => mutated }) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name: mutant.name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${mutant.name}`);
}

for (const mutant of sqlMutants) {
  const mutated = mutant.apply(migrationSource);
  const applied = mutated !== migrationSource;
  const failed = applied ? migrationViolations(mutated, configSource) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name: mutant.name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${mutant.name}`);
}

for (const mutant of configMutants) {
  const mutated = mutant.apply(configSource);
  const applied = mutated !== configSource;
  const failed = applied ? migrationViolations(migrationSource, mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name: mutant.name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${mutant.name}`);
}

const survivors = results.filter((entry) => entry.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-b-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  survivors,
  repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
