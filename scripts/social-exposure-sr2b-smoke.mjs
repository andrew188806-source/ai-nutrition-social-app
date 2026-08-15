#!/usr/bin/env node
// SR-2B deterministic semantic smoke. Executes the real exposure module in memory only.
// No network, database, Supabase, credentials, persistence, cache or private-payload logging.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = [];

function expect(condition, name) {
  const result = Object.freeze({ name, pass: Boolean(condition) });
  checks.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

function loadExposure() {
  const cache = new Map();
  const resolveTsFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require_(specifier);
      const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
      if (!resolved) throw new Error(`unresolved exposure import: ${specifier}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, "supabase/functions/_shared/social-exposure/index.ts"));
}

const {
  applySocialExposure,
  resolveSocialEntitlement,
  SOCIAL_EXPOSURE_CONTRACT_ERROR,
  SOCIAL_EXPOSURE_FREE_CAP,
  SOCIAL_EXPOSURE_PREMIUM_CAP
} = loadExposure();

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const STATES = ["scored", "not_scored", "unsupported"];
const ranking = (count, state = "scored") => Object.freeze({
  policyVersion: "social-ranking-v1",
  ordered: Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    candidateUserId: id(index),
    rankingState: typeof state === "function" ? state(index) : state
  })))
});
const FREE = Object.freeze({ class: "free" });
const PREMIUM = Object.freeze({ class: "premium" });
const ids = (result) => result.exposed.map(({ candidateUserId }) => candidateUserId);
const threw = (run) => {
  try { run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};
const threwAsync = async (run) => {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};

// ---- frozen caps -------------------------------------------------------------------------------
expect(SOCIAL_EXPOSURE_FREE_CAP === 3, "01 frozen free cap is exactly 3");
expect(SOCIAL_EXPOSURE_PREMIUM_CAP === 10, "02 frozen premium cap is exactly 10");

// ---- pure exposure -----------------------------------------------------------------------------
const emptyFree = applySocialExposure(ranking(0), FREE);
expect(emptyFree.exposed.length === 0 && emptyFree.truncated === false, "03 empty ranking is empty and untruncated for free");
const emptyPremium = applySocialExposure(ranking(0), PREMIUM);
expect(emptyPremium.exposed.length === 0 && emptyPremium.truncated === false, "04 empty ranking is empty and untruncated for premium");
expect(emptyFree.policyVersion === "social-exposure-v1", "05 result carries the exact social-exposure-v1 policy version");

const freeBelow = applySocialExposure(ranking(2), FREE);
expect(freeBelow.exposed.length === 2 && freeBelow.truncated === false, "06 free below cap exposes everything untruncated");
const freeExact = applySocialExposure(ranking(3), FREE);
expect(freeExact.exposed.length === 3 && freeExact.truncated === false, "07 free at exactly cap exposes everything untruncated");
const freeAbove = applySocialExposure(ranking(4), FREE);
expect(freeAbove.exposed.length === 3 && freeAbove.truncated === true, "08 free above cap exposes exactly three and reports truncation");

const premiumBelow = applySocialExposure(ranking(9), PREMIUM);
expect(premiumBelow.exposed.length === 9 && premiumBelow.truncated === false, "09 premium below cap exposes everything untruncated");
const premiumExact = applySocialExposure(ranking(10), PREMIUM);
expect(premiumExact.exposed.length === 10 && premiumExact.truncated === false, "10 premium at exactly cap exposes everything untruncated");
const premiumAbove = applySocialExposure(ranking(11), PREMIUM);
expect(premiumAbove.exposed.length === 10 && premiumAbove.truncated === true, "11 premium above cap exposes exactly ten and reports truncation");

const wide = ranking(256);
expect(JSON.stringify(ids(applySocialExposure(wide, FREE))) === JSON.stringify([id(0), id(1), id(2)]),
  "12 free exposure is the canonical prefix, never a suffix or sample");
expect(JSON.stringify(ids(applySocialExposure(wide, PREMIUM))) === JSON.stringify(wide.ordered.slice(0, 10).map((entry) => entry.candidateUserId)),
  "13 premium exposure is the canonical prefix in unchanged SR-2A order");

const mixed = ranking(12, (index) => STATES[index % 3]);
const mixedExposed = applySocialExposure(mixed, PREMIUM);
expect(JSON.stringify(mixedExposed.exposed) === JSON.stringify(mixed.ordered.slice(0, 10)),
  "14 mixed ranking-state sequence is exposed byte-identically and in order");
expect(mixedExposed.exposed.some(({ rankingState }) => rankingState === "scored"), "15 scored candidates are retained");
expect(mixedExposed.exposed.some(({ rankingState }) => rankingState === "not_scored"), "16 not_scored cold-start candidates are retained");
expect(mixedExposed.exposed.some(({ rankingState }) => rankingState === "unsupported"), "17 unsupported candidates are retained");

const unsupportedOnly = applySocialExposure(ranking(5, "unsupported"), FREE);
expect(unsupportedOnly.exposed.length === 3 && unsupportedOnly.exposed.every(({ rankingState }) => rankingState === "unsupported"),
  "18 an all-unsupported ranking still exposes the canonical prefix");

const source = ranking(6);
const before = JSON.stringify(source);
applySocialExposure(source, FREE);
expect(JSON.stringify(source) === before, "19 exposure never mutates the SR-2A ranking input");
expect(Object.isFrozen(freeAbove) && Object.isFrozen(freeAbove.exposed), "20 exposure result and exposed list are frozen");
expect(threw(() => applySocialExposure({ policyVersion: "social-ranking-v0", ordered: [] }, FREE)) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "21 a foreign ranking policy version fails closed");
expect(threw(() => applySocialExposure(ranking(1), { class: "enterprise" })) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "22 an unrecognized entitlement class fails closed");

// ---- entitlement resolution --------------------------------------------------------------------
const NOW = new Date("2026-08-15T12:00:00.000Z");
const calls = [];
function rowSource(outcome) {
  return Object.freeze({
    from(table) {
      calls.push({ fn: "from", table });
      return Object.freeze({
        select(columns) {
          calls.push({ fn: "select", columns });
          return Object.freeze({
            eq(column, value) {
              calls.push({ fn: "eq", column, value });
              return Promise.resolve(outcome);
            }
          });
        }
      });
    }
  });
}
const rows = (data) => ({ data, error: null });
const row = (overrides = {}) => ({
  plan_code: "premium",
  status: "active",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_until: null,
  ...overrides
});
const ACTOR = id(1);
const resolve = (outcome, actor = ACTOR, now = NOW) => resolveSocialEntitlement(rowSource(outcome), actor, now);

expect((await resolve(rows([]))).class === "free", "23 an absent entitlement row resolves to canonical free");
expect((await resolve(rows([row({ plan_code: "free", status: "active" })]))).class === "free", "24 an explicit free plan resolves to free");
expect((await resolve(rows([row()]))).class === "premium", "25 premium active inside the window resolves to premium");
expect((await resolve(rows([row({ status: "grace_period" })]))).class === "premium", "26 premium grace_period inside the window resolves to premium");
expect((await resolve(rows([row({ status: "expired" })]))).class === "free", "27 premium expired resolves to free");
expect((await resolve(rows([row({ status: "cancelled" })]))).class === "free", "28 premium cancelled resolves to free");
expect((await resolve(rows([row({ valid_from: "2026-09-01T00:00:00.000Z" })]))).class === "free", "29 premium before valid_from resolves to free");
expect((await resolve(rows([row({ valid_until: "2026-08-01T00:00:00.000Z" })]))).class === "free", "30 premium after valid_until resolves to free");
expect((await resolve(rows([row({ valid_until: null })]))).class === "premium", "31 premium with null valid_until and a started window resolves to premium");
expect((await resolve(rows([row({ valid_until: "2026-12-31T00:00:00.000Z" })]))).class === "premium", "32 premium inside an explicit upper bound resolves to premium");
expect((await resolve(rows([row({ status: "expired" }), row()]))).class === "premium", "33 a historical expired row never suppresses a live premium row");
expect((await resolve(rows([row({ plan_code: "free" }), row({ plan_code: "free", status: "expired" })]))).class === "free", "34 multiple free rows resolve to free");

expect(await threwAsync(() => resolve(rows([row({ plan_code: "enterprise" })]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "35 an unknown plan_code fails closed rather than downgrading to free");
expect(await threwAsync(() => resolve(rows([row({ status: "trialing" })]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "36 an unknown entitlement status fails closed");
expect(await threwAsync(() => resolve(rows([{ plan_code: "premium" }]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "37 a malformed row missing required fields fails closed");
expect(await threwAsync(() => resolve(rows([row({ valid_from: "not-a-timestamp" })]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "38 an unparsable validity instant fails closed");
expect(await threwAsync(() => resolve({ data: null, error: { message: "permission denied" } })) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "39 a database or RLS read failure fails the request instead of becoming free");
expect(await threwAsync(() => resolve({ data: null, error: null })) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "40 a non-array payload fails closed");
expect(await threwAsync(() => resolve(rows([row()]), "")) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "41 an empty actor identity fails closed");
expect(await threwAsync(() => resolve(rows([row()]), ACTOR, new Date("nonsense"))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "42 an invalid canonical instant fails closed");

calls.length = 0;
await resolve(rows([row()]));
expect(calls.some(({ fn, table }) => fn === "from" && table === "subscription_entitlements"), "43 the resolver reads only subscription_entitlements");
expect(calls.some(({ fn, column, value }) => fn === "eq" && column === "user_id" && value === ACTOR),
  "44 the resolver carries an explicit owner predicate for the verified actor only");
expect(calls.filter(({ fn }) => fn === "eq").length === 1, "45 the resolver issues exactly one owner-scoped filter");
const selected = calls.find(({ fn }) => fn === "select")?.columns ?? "";
expect(!/entitlement_source|source_reference|\bid\b|created_at|updated_at/.test(selected),
  "46 the resolver never selects billing provenance or identity columns");

// ---- composed request-time behaviour -----------------------------------------------------------
const composed = applySocialExposure(ranking(20), await resolve(rows([row()])));
expect(composed.exposed.length === 10 && composed.truncated === true, "47 a resolved premium actor consumes the premium prefix");
const downgraded = applySocialExposure(ranking(20), await resolve(rows([row({ status: "cancelled" })])));
expect(downgraded.exposed.length === 3 && downgraded.truncated === true, "48 the same ranking contracts to the free prefix after downgrade");
expect(JSON.stringify(ids(downgraded)) === JSON.stringify(ids(composed).slice(0, 3)),
  "49 a downgraded prefix is the exact head of the premium prefix, never a rerank");

// ---- frozen multi-row entitlement authority ----------------------------------------------------
// The schema permits many entitlement rows per actor. The complete visible set must be validated
// before any premium decision, and row order must never change the outcome.
const PREMIUM_ACTIVE = row();
const PREMIUM_GRACE = row({ status: "grace_period" });
const PREMIUM_EXPIRED = row({ status: "expired" });
const PREMIUM_CANCELLED = row({ status: "cancelled" });
const PREMIUM_FUTURE = row({ valid_from: "2099-01-01T00:00:00.000Z" });
const PREMIUM_PAST = row({ valid_until: "2026-02-01T00:00:00.000Z" });
const FREE_ACTIVE = row({ plan_code: "free" });
const UNKNOWN_PLAN = row({ plan_code: "enterprise" });
const MALFORMED_ROW = { plan_code: "premium" };

expect((await resolve(rows([PREMIUM_EXPIRED, PREMIUM_ACTIVE]))).class === "premium", "50 an expired premium row never suppresses a currently-valid premium row");
expect((await resolve(rows([PREMIUM_CANCELLED, PREMIUM_GRACE]))).class === "premium", "51 a cancelled premium row never suppresses a valid grace premium row");
expect((await resolve(rows([FREE_ACTIVE, PREMIUM_ACTIVE]))).class === "premium", "52 an active free row never suppresses a currently-valid premium row");
expect((await resolve(rows([PREMIUM_EXPIRED, PREMIUM_CANCELLED]))).class === "free", "53 only terminal premium rows resolve to free");
expect((await resolve(rows([PREMIUM_FUTURE, PREMIUM_PAST]))).class === "free", "54 premium rows entirely outside the window resolve to free");
expect((await resolve(rows([]))).class === "free", "55 an empty visible row set resolves to free");

const permutations = [
  [PREMIUM_EXPIRED, FREE_ACTIVE, PREMIUM_ACTIVE],
  [PREMIUM_ACTIVE, FREE_ACTIVE, PREMIUM_EXPIRED],
  [FREE_ACTIVE, PREMIUM_ACTIVE, PREMIUM_EXPIRED],
  [PREMIUM_ACTIVE, PREMIUM_EXPIRED, FREE_ACTIVE]
];
const permutationClasses = [];
for (const permutation of permutations) permutationClasses.push((await resolve(rows(permutation))).class);
expect(permutationClasses.every((entry) => entry === "premium"), "56 row order never changes the resolved entitlement");

expect(await threwAsync(() => resolve(rows([PREMIUM_ACTIVE, UNKNOWN_PLAN]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "57 a valid premium row does not short-circuit validation of a later unknown-plan row");
expect(await threwAsync(() => resolve(rows([UNKNOWN_PLAN, PREMIUM_ACTIVE]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "58 an unknown-plan row before a valid premium row fails closed");
expect(await threwAsync(() => resolve(rows([PREMIUM_ACTIVE, MALFORMED_ROW]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "59 a valid premium row does not short-circuit validation of a later malformed row");
expect(await threwAsync(() => resolve(rows([MALFORMED_ROW, PREMIUM_ACTIVE]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "60 a malformed row before a valid premium row fails closed");
expect(await threwAsync(() => resolve(rows([PREMIUM_ACTIVE, row({ status: "trialing" })]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "61 a valid premium row does not short-circuit validation of a later unknown-status row");
expect(await threwAsync(() => resolve(rows([PREMIUM_ACTIVE, row({ valid_from: "not-a-timestamp" })]))) === SOCIAL_EXPOSURE_CONTRACT_ERROR,
  "62 a valid premium row does not short-circuit validation of a later unparsable instant");

const failures = checks.filter(({ pass }) => !pass);
console.log(JSON.stringify({
  suite: "social-exposure-sr2b-smoke",
  status: failures.length === 0 ? "passed" : "failed",
  totalChecks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
