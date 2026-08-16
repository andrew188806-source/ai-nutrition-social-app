#!/usr/bin/env node
// SR-2C deterministic semantic smoke. Executes the real projection module in memory only.
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

function loadProfile() {
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
      if (!resolved) throw new Error(`unresolved profile import: ${specifier}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, "supabase/functions/_shared/social-profile/index.ts"));
}

const {
  projectPublicSocialProfiles,
  readExposedSocialProfileFacts,
  SOCIAL_PROFILE_CONTRACT_ERROR,
  SOCIAL_PROFILE_MAXIMUM_CANDIDATES,
  SOCIAL_PROFILE_PROJECTION_POLICY_VERSION
} = loadProfile();

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const exposure = (count, state = "scored") => Object.freeze({
  policyVersion: "social-exposure-v1",
  exposed: Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    candidateUserId: id(index),
    rankingState: state
  }))),
  truncated: false
});
const row = (ordinal, overrides = {}) => ({
  exposure_ordinal: ordinal,
  display_name: `Name ${ordinal}`,
  mascot_avatar_key: `mascot_${ordinal}`,
  public_bio: `bio ${ordinal}`,
  willing_to_chat: true,
  ...overrides
});
const threw = (run) => {
  try { run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};
const threwAsync = async (run) => {
  try { await run(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};
const indices = (result) => result.candidates.map(({ exposureIndex }) => exposureIndex);

// ---- frozen policy -----------------------------------------------------------------------------
expect(SOCIAL_PROFILE_PROJECTION_POLICY_VERSION === "social-profile-projection-v1", "01 policy version is exactly social-profile-projection-v1");
expect(SOCIAL_PROFILE_MAXIMUM_CANDIDATES === 10, "02 maximum projected candidates is exactly the frozen SR-2B premium cap of 10");

// ---- pure projection ---------------------------------------------------------------------------
const empty = projectPublicSocialProfiles(exposure(0), []);
expect(empty.candidates.length === 0 && empty.policyVersion === "social-profile-projection-v1", "03 empty exposure projects zero candidates successfully");

const single = projectPublicSocialProfiles(exposure(1), [row(0)]);
expect(single.candidates.length === 1 && single.candidates[0].exposureIndex === 0, "04 a single exposed candidate with a profile projects one candidate");

const shuffled = projectPublicSocialProfiles(exposure(4), [row(3), row(0), row(2), row(1)]);
expect(JSON.stringify(indices(shuffled)) === JSON.stringify([0, 1, 2, 3]), "05 database rows returned out of order are restored to exposure order");
expect(shuffled.candidates[0].displayName === "Name 0" && shuffled.candidates[3].displayName === "Name 3", "06 restored order carries each candidate's own facts");

expect(JSON.stringify(indices(projectPublicSocialProfiles(exposure(3), [row(1), row(2)]))) === JSON.stringify([1, 2]), "07 a missing first profile is omitted and later indices are preserved");
expect(JSON.stringify(indices(projectPublicSocialProfiles(exposure(3), [row(0), row(2)]))) === JSON.stringify([0, 2]), "08 a missing middle profile leaves a gap rather than compacting");
expect(JSON.stringify(indices(projectPublicSocialProfiles(exposure(3), [row(0), row(1)]))) === JSON.stringify([0, 1]), "09 a missing last profile is omitted");
expect(projectPublicSocialProfiles(exposure(10), [row(0)]).candidates.length === 1, "10 missing profiles are never refilled from beyond the supplied exposure");
expect(projectPublicSocialProfiles(exposure(3), []).candidates.length === 0, "11 an exposure whose candidates all lack profiles projects zero candidates without failing");

const optional = projectPublicSocialProfiles(exposure(2), [
  row(0, { mascot_avatar_key: null }),
  row(1, { public_bio: null, willing_to_chat: false })
]);
expect(optional.candidates[0].mascotAvatarKey === null, "12 a missing mascot avatar key projects as null");
expect(optional.candidates[1].publicBio === null, "13 a missing public bio projects as null");
expect(optional.candidates[0].willingToChat === true && optional.candidates[1].willingToChat === false, "14 willingToChat is carried verbatim for true and false");

// ---- contract violations -----------------------------------------------------------------------
expect(threw(() => projectPublicSocialProfiles(exposure(1), [row(0, { display_name: "" })])) === SOCIAL_PROFILE_CONTRACT_ERROR, "15 an empty display name fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(1), [row(0, { display_name: null })])) === SOCIAL_PROFILE_CONTRACT_ERROR, "16 a null display name fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(2), [row(0), row(0)])) === SOCIAL_PROFILE_CONTRACT_ERROR, "17 a duplicate returned ordinal fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(2), [row(5)])) === SOCIAL_PROFILE_CONTRACT_ERROR, "18 an ordinal outside the exposure range fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(2), [row(-1)])) === SOCIAL_PROFILE_CONTRACT_ERROR, "19 a negative ordinal fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(2), [row(0.5)])) === SOCIAL_PROFILE_CONTRACT_ERROR, "20 a non-integer ordinal fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(1), [row(0), row(0)])) === SOCIAL_PROFILE_CONTRACT_ERROR, "21 more rows than exposed candidates fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(1), [row(0, { willing_to_chat: "yes" })])) === SOCIAL_PROFILE_CONTRACT_ERROR, "22 a non-boolean willing_to_chat fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(1), [row(0, { public_bio: 42 })])) === SOCIAL_PROFILE_CONTRACT_ERROR, "23 a non-string public bio fails closed");
expect(threw(() => projectPublicSocialProfiles({ policyVersion: "social-exposure-v0", exposed: [], truncated: false }, [])) === SOCIAL_PROFILE_CONTRACT_ERROR, "24 a foreign exposure policy version fails closed");
expect(threw(() => projectPublicSocialProfiles(exposure(11), [])) === SOCIAL_PROFILE_CONTRACT_ERROR, "25 an exposure larger than the frozen cap fails closed");

// ---- forbidden output --------------------------------------------------------------------------
const wide = projectPublicSocialProfiles(exposure(3), [row(0), row(1), row(2)]);
const serialized = JSON.stringify(wide);
const allowedKeys = ["displayName", "exposureIndex", "mascotAvatarKey", "publicBio", "willingToChat"];
expect(wide.candidates.every((candidate) => JSON.stringify(Object.keys(candidate).sort()) === JSON.stringify(allowedKeys)), "26 every projected candidate carries exactly the five allow-listed keys");
expect(JSON.stringify(Object.keys(wide).sort()) === JSON.stringify(["candidates", "policyVersion"]), "27 the envelope carries exactly policyVersion and candidates");
for (const forbidden of [
  "candidateUserId", "user_id", "userId", "profile_id", "profileId",
  "real_avatar_url", "realAvatarUrl", "anonymous_display_name", "anonymousDisplayName",
  "verification", "verified", "diet_summary", "dietSummary", "nutrition_goal_summary",
  "nutritionGoalSummary", "recent_meal_style", "recentMealStyle", "locale", "timezone",
  "age", "birthdate", "gender", "location", "distance",
  "rankingState", "score", "similarity", "confidence", "restriction", "needs_attention",
  "entitlement", "premium", "plan_code", "subscription", "status", "deleted_at", "visibility"
]) {
  expect(!serialized.includes(forbidden), `28 forbidden field never serialized: ${forbidden}`);
}
expect(!/00000000-0000-4000-8000-/.test(serialized), "29 no raw candidate UUID is serialized");
expect(JSON.stringify(projectPublicSocialProfiles(exposure(3), [row(2), row(0), row(1)])) === serialized, "30 repeated projection over identical evidence is deterministic");

// ---- protected read boundary --------------------------------------------------------------------
const calls = [];
const transport = (rows) => Object.freeze({
  withTransaction: async (operation) => operation(Object.freeze({
    query: async (statement, parameters) => { calls.push({ text: statement.text, parameters }); return rows; },
    abort: () => { throw new Error("aborted"); }
  })),
  close: async () => {}
});

calls.length = 0;
const facts = await readExposedSocialProfileFacts(transport([row(0)]), id(99), exposure(1));
expect(Array.isArray(facts) && facts.length === 1, "31 the protected read returns the primitive rows unchanged");
expect(calls.length === 1 && /social_internal\.project_exposed_social_profiles\(\$1::uuid, \$2::uuid\[\]\)/.test(calls[0].text), "32 the read invokes only the protected projection primitive");
expect(!/select\s+\*/i.test(calls[0].text), "33 the protected read never issues select *");
expect(/exposure_ordinal, display_name, mascot_avatar_key, public_bio, willing_to_chat/.test(calls[0].text), "34 the protected read names exactly the five public-safe columns");
expect(calls[0].parameters[0] === id(99) && Array.isArray(calls[0].parameters[1]) && calls[0].parameters[1].length === 1, "35 the read passes the verified actor and the server-owned candidate array");

expect(await threwAsync(() => readExposedSocialProfileFacts(transport([]), "", exposure(1))) === SOCIAL_PROFILE_CONTRACT_ERROR, "36 an empty actor identity fails closed");
expect(await threwAsync(() => readExposedSocialProfileFacts(transport([]), id(99), exposure(11))) === SOCIAL_PROFILE_CONTRACT_ERROR, "37 an exposure above the frozen cap fails closed before any query");
const duplicated = { policyVersion: "social-exposure-v1", exposed: [{ candidateUserId: id(1), rankingState: "scored" }, { candidateUserId: id(1), rankingState: "scored" }], truncated: false };
expect(await threwAsync(() => readExposedSocialProfileFacts(transport([]), id(99), duplicated)) === SOCIAL_PROFILE_CONTRACT_ERROR, "38 a duplicate exposed candidate fails closed");
const nulled = { policyVersion: "social-exposure-v1", exposed: [{ candidateUserId: null, rankingState: "scored" }], truncated: false };
expect(await threwAsync(() => readExposedSocialProfileFacts(transport([]), id(99), nulled)) === SOCIAL_PROFILE_CONTRACT_ERROR, "39 a null exposed candidate identity fails closed");
expect(await threwAsync(() => readExposedSocialProfileFacts(transport([]), id(99), { policyVersion: "social-exposure-v0", exposed: [], truncated: false })) === SOCIAL_PROFILE_CONTRACT_ERROR, "40 a foreign exposure policy version fails closed before any query");

calls.length = 0;
await readExposedSocialProfileFacts(transport([]), id(99), exposure(0));
expect(calls.length === 1 && calls[0].parameters[1].length === 0, "41 an empty exposure still issues exactly one bounded query with no candidates");

const failures = checks.filter(({ pass }) => !pass);
console.log(JSON.stringify({
  suite: "social-profile-sr2c-smoke",
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
