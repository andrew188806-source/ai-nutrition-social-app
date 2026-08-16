#!/usr/bin/env node
// SR-2D local smoke. Pure and local: no network, no database, no credentials, no deployment.
// The real SR-1A pair composition, SR-2A ranking, SR-2B exposure, SR-2C projection and the real
// AES-256-GCM reference primitive all execute; only the SQL transport and the authenticated
// Supabase client are substituted, and the repository bytes are never modified.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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

// --- module loader --------------------------------------------------------------------------
const npmStubs = new Map([
  ["npm:@supabase/supabase-js@2", { createClient: () => ({}) }],
  ["npm:postgres@3.4.7", { default: () => ({}) }]
]);
globalThis.Deno = globalThis.Deno ?? { env: { get: () => undefined }, serve: () => {} };

const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, `${candidate}.mjs`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const raw = fs.readFileSync(absolute, "utf8");
  // TypeScript forces ESM output for a .mjs filename regardless of the module setting, so the
  // generated Taste runtime is transpiled under a .js name to obtain CommonJS.
  const { outputText } = ts.transpileModule(raw, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
    fileName: absolute.endsWith(".mjs") ? `${absolute.slice(0, -4)}.js` : absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (npmStubs.has(specifier)) return npmStubs.get(specifier);
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const fromRoot = (relative) => load(path.join(root, relative));

const api = fromRoot("supabase/functions/_shared/social-candidate-api/index.ts");
const ref = fromRoot("supabase/functions/_shared/social-candidate-ref/index.ts");
const handlerModule = fromRoot("supabase/functions/social-candidate-list/handler.ts");

// --- fixtures --------------------------------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ACTOR = "00000000-0000-4000-8000-0000000000bb";
const candidateId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const CANDIDATES = Array.from({ length: 12 }, (_, index) => candidateId(index + 1));
const EMPTY_SOURCES = Object.freeze({
  dietary_restrictions: { rows: [] },
  favorite_menu_items: { rows: [] },
  favorite_restaurants: { rows: [] },
  meal_record_items: { rows: [] },
  meal_records: { rows: [] },
  nutrition_goals: { rows: [] },
  taste_profiles: { rows: [] }
});
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const cipher = ref.createSocialCandidateRefCipher(ref.decodeSocialCandidateRefKey(TEST_KEY));
const INSTANT = new Date("2026-08-16T12:00:00.000Z");

function tastePayload(candidateUserIds) {
  return {
    actor: { user_id: ACTOR, sources: EMPTY_SOURCES },
    authorized_candidate_user_ids: [...candidateUserIds],
    candidates: candidateUserIds.map((userId) => ({ user_id: userId, sources: EMPTY_SOURCES }))
  };
}

// Substitutes only the SQL boundary. `survives` decides which exposure ordinals SR-2C returns a
// profile for, which is how omission and refill behaviour is driven.
function createTransport({ candidateUserIds, survives = () => true, failOn = null, capture = {} }) {
  return {
    async withTransaction(operation) {
      return await operation({
        query: async (statement, parameters) => {
          if (failOn && statement.text.includes(failOn)) throw new Error("dependency_failure");
          if (statement.text.includes("canonical_candidate_taste_sources")) {
            return [{ payload: tastePayload(candidateUserIds) }];
          }
          if (statement.text.includes("project_exposed_social_profiles")) {
            capture.requestedCandidateUserIds = [...parameters[1]];
            return parameters[1].map((userId, ordinal) => ({ ordinal, userId }))
              .filter(({ ordinal }) => survives(ordinal))
              .map(({ ordinal, userId }) => ({
                exposure_ordinal: ordinal,
                display_name: `Name ${userId.slice(-2)}`,
                mascot_avatar_key: `mascot_${userId.slice(-2)}`,
                public_bio: ordinal === 0 ? null : `bio ${ordinal}`,
                willing_to_chat: ordinal % 2 === 0
              }));
          }
          throw new Error(`unexpected statement: ${statement.text}`);
        },
        abort: () => { throw new Error("aborted"); }
      });
    },
    async close() {}
  };
}
const entitlementSource = (planCode) => ({
  from: () => ({
    select: () => ({
      eq: () => Promise.resolve({
        data: planCode === null
          ? []
          : [{ plan_code: planCode, status: "active", valid_from: "2026-01-01T00:00:00.000Z", valid_until: null }],
        error: null
      })
    })
  })
});

async function compose({ candidateUserIds = CANDIDATES, planCode = "premium", survives, failOn, capture = {} } = {}) {
  return await api.composeSocialCandidateList({
    transport: createTransport({ candidateUserIds, survives, failOn, capture }),
    entitlementRowSource: entitlementSource(planCode),
    cipher,
    actorUserId: ACTOR,
    requestInstant: INSTANT
  });
}
const threw = async (operation) => {
  try { await operation(); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
};

// --- handler request contract -----------------------------------------------------------------
const okConfig = () => ({ ok: true, value: { supabaseUrl: "https://dev.invalid", supabaseAnonKey: "anon", candidateRefKey: ref.decodeSocialCandidateRefKey(TEST_KEY) } });
function dependencies({ config = okConfig, authenticated = true, transportFactory } = {}) {
  return {
    loadConfig: config,
    authenticateCaller: async () => (authenticated
      ? { ok: true, value: { userId: ACTOR, userScopedClient: entitlementSource("premium") } }
      : { ok: false, errorCode: "authentication_required" }),
    createTransport: transportFactory ?? (() => createTransport({ candidateUserIds: CANDIDATES }))
  };
}
const request = (init = {}) => new Request(init.url ?? "https://edge.invalid/social-candidate-list", {
  method: init.method ?? "POST",
  headers: init.headers ?? {},
  ...(init.body === undefined ? {} : { body: init.body })
});
const call = async (init, deps) => await handlerModule.processSocialCandidateListRequest(request(init), deps ?? dependencies());

try {
  const success = await call({});
  const successBody = await success.clone().json();
  check("01 an authenticated empty POST succeeds", success.status === 200);
  check("02 unauthenticated request is rejected with 401",
    (await call({}, dependencies({ authenticated: false }))).status === 401);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    check(`03 ${method} is rejected with 400`, (await call({ method })).status === 400);
  }
  check("04 a query parameter is rejected with 400",
    (await call({ url: "https://edge.invalid/social-candidate-list?limit=10" })).status === 400);
  check("05 an actor header is rejected with 400",
    (await call({ headers: { "x-actor-user-id": ACTOR } })).status === 400);
  check("06 a candidate header is rejected with 400",
    (await call({ headers: { "x-candidate-user-ids": CANDIDATES.join(",") } })).status === 400);
  check("07 a caller limit header is rejected with 400",
    (await call({ headers: { "x-limit": "10" } })).status === 400);
  check("08 a tier or entitlement header is rejected with 400",
    (await call({ headers: { "x-premium": "true" } })).status === 400
    && (await call({ headers: { "x-entitlement": "premium" } })).status === 400);
  check("09 a caller clock header is rejected with 400",
    (await call({ headers: { "x-now": INSTANT.toISOString() } })).status === 400);
  check("10 a meaningful body is rejected with 400",
    (await call({ body: JSON.stringify({ limit: 10 }) })).status === 400
    && (await call({ body: "not json" })).status === 400);
  check("11 an empty object body is tolerated", (await call({ body: "{}" })).status === 200);

  // --- envelope and DTO --------------------------------------------------------------------
  check("12 the envelope carries exactly policyVersion and candidates",
    JSON.stringify(Object.keys(successBody).sort()) === JSON.stringify(["candidates", "policyVersion"]));
  check("13 the policy version is social-candidate-api-v1", successBody.policyVersion === "social-candidate-api-v1");
  const premium = await compose({ planCode: "premium" });
  const free = await compose({ planCode: "free" });
  check("14 a Premium actor never exceeds the frozen cap of 10", premium.candidates.length === 10, premium.candidates.length);
  check("15 a free actor never exceeds the frozen cap of 3", free.candidates.length === 3, free.candidates.length);
  check("16 an unknown plan code fails closed rather than exposing", (await threw(() => compose({ planCode: "enterprise" }))) !== null);
  check("17 every candidate carries exactly the five allow-listed keys",
    premium.candidates.every((candidate) => JSON.stringify(Object.keys(candidate).sort())
      === JSON.stringify(["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"])));
  const serialized = JSON.stringify(premium);
  for (const forbidden of [
    "exposureIndex", "exposure_ordinal", "candidateUserId", "userId", "user_id",
    "profileId", "profile_id", "rankingState", "score", "matchPercent", "compatibilityLabel",
    "matchReasons", "needsAttention", "restriction", "truncated", "hasMore",
    "isPremium", "isVerified", "verification", "real_avatar_url", "diet_summary",
    "nutrition_goal_summary", "recent_meal_style", "distance", "latitude", "longitude",
    "birthdate", "age_years", "gender", "entitlement", "plan_code", "subscription", "billing",
    "social-ranking-v1", "social-exposure-v1", "social-profile-projection-v1", ACTOR
  ]) {
    check(`18 forbidden value never serialized: ${forbidden}`, !serialized.includes(forbidden));
  }
  check("19 no raw candidate UUID appears anywhere in the response",
    CANDIDATES.every((candidateUserId) => !serialized.includes(candidateUserId)));
  check("20 publicBio null is preserved rather than coerced",
    premium.candidates[0].publicBio === null && typeof premium.candidates[1].publicBio === "string");
  check("21 willingToChat=false candidates remain in the result",
    premium.candidates.some((candidate) => candidate.willingToChat === false)
    && premium.candidates.some((candidate) => candidate.willingToChat === true));

  // --- ordering, omission and refill ---------------------------------------------------------
  const capture = {};
  const gapped = await compose({ planCode: "premium", survives: (ordinal) => ordinal !== 1 && ordinal !== 4, capture });
  const exposureOrder = capture.requestedCandidateUserIds;
  const opened = [];
  for (const candidate of gapped.candidates) {
    opened.push((await cipher.open(ACTOR, candidate.candidateRef, INSTANT)).candidateUserId);
  }
  const expectedSurvivors = exposureOrder.filter((_, ordinal) => ordinal !== 1 && ordinal !== 4);
  check("22 omitted profiles are dropped and never refilled", gapped.candidates.length === exposureOrder.length - 2);
  check("23 survivors keep the exact relative exposure order",
    JSON.stringify(opened) === JSON.stringify(expectedSurvivors), { opened: opened.length, expected: expectedSurvivors.length });
  check("24 no candidate outside the exposed prefix is ever substituted in",
    opened.every((userId) => exposureOrder.includes(userId)));
  const full = {};
  await compose({ planCode: "free", capture: full });
  check("25 the projection is asked for exactly the exposed prefix and no more",
    full.requestedCandidateUserIds.length === 3);
  check("26 repeated composition is deterministic",
    JSON.stringify((await compose({ planCode: "free", capture: {} })).candidates.map((c) => c.displayName))
    === JSON.stringify(free.candidates.map((c) => c.displayName)));

  // --- empty and failure semantics ------------------------------------------------------------
  const empty = await compose({ candidateUserIds: [] });
  check("27 an empty canonical pool is a successful empty list",
    empty.policyVersion === "social-candidate-api-v1" && empty.candidates.length === 0);
  check("28 fewer candidates than the free cap returns all of them",
    (await compose({ candidateUserIds: CANDIDATES.slice(0, 2), planCode: "free" })).candidates.length === 2);
  const sourceFailure = await call({}, dependencies({
    transportFactory: () => createTransport({ candidateUserIds: CANDIDATES, failOn: "canonical_candidate_taste_sources" })
  }));
  check("29 a candidate-source failure returns 503", sourceFailure.status === 503);
  check("30 a dependency failure is never converted into an empty success",
    !(await sourceFailure.clone().text()).includes("\"candidates\""));
  const profileFailure = await call({}, dependencies({
    transportFactory: () => createTransport({ candidateUserIds: CANDIDATES, failOn: "project_exposed_social_profiles" })
  }));
  check("31 a profile-projection failure returns 503", profileFailure.status === 503);
  const keyAbsent = await call({}, dependencies({ config: () => ({ ok: false, errorCode: "server_unavailable" }) }));
  check("32 an absent candidate reference key returns 503 and never an empty list",
    keyAbsent.status === 503 && !(await keyAbsent.clone().text()).includes("\"candidates\""));
  check("33 the error envelope is the frozen shape",
    JSON.stringify(Object.keys(await sourceFailure.clone().json())) === JSON.stringify(["error"]));

  // --- candidateRef ------------------------------------------------------------------------------
  const refs = premium.candidates.map((candidate) => candidate.candidateRef);
  check("34 a reference is generated for every surviving candidate", refs.length === premium.candidates.length && refs.every((value) => typeof value === "string" && value.length > 0));
  check("35 references are distinct per candidate", new Set(refs).size === refs.length);
  check("36 every reference carries the scr1 version prefix", refs.every((value) => value.startsWith("scr1.")));
  check("37 no reference equals or contains a raw identifier",
    refs.every((value) => !CANDIDATES.some((id) => value.includes(id)) && !value.includes(ACTOR)));
  check("38 base64url-decoding a reference never reveals an identifier", refs.every((value) => {
    const body = value.slice("scr1.".length).replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(body.padEnd(body.length + ((4 - (body.length % 4)) % 4), "="), "base64").toString("latin1");
    return !CANDIDATES.some((id) => decoded.includes(id)) && !decoded.includes(ACTOR);
  }));
  const roundTrip = await cipher.open(ACTOR, refs[0], INSTANT);
  check("39 the correct actor recovers the exact candidate identity",
    roundTrip.candidateUserId === (await (async () => { const c = {}; await compose({ planCode: "premium", capture: c }); return c.requestedCandidateUserIds[0]; })()));
  check("40 the recovered claims carry the frozen version and a 24 hour lifetime",
    roundTrip.version === "scr1" && roundTrip.expiresAtMs - roundTrip.issuedAtMs === 86_400_000);
  check("41 a different actor cannot open the reference", (await threw(() => cipher.open(OTHER_ACTOR, refs[0], INSTANT))) !== null);
  check("42 a tampered reference body fails authentication", (await threw(() => {
    const body = refs[0].slice("scr1.".length);
    const flipped = `${body.slice(0, -1)}${body.at(-1) === "A" ? "B" : "A"}`;
    return cipher.open(ACTOR, `scr1.${flipped}`, INSTANT);
  })) !== null);
  check("43 a truncated reference fails", (await threw(() => cipher.open(ACTOR, refs[0].slice(0, -4), INSTANT))) !== null);
  check("44 a foreign version prefix is rejected", (await threw(() => cipher.open(ACTOR, refs[0].replace("scr1.", "scr2."), INSTANT))) !== null);
  check("45 an expired reference is rejected exactly at the boundary",
    (await threw(() => cipher.open(ACTOR, refs[0], new Date(INSTANT.getTime() + 86_400_000)))) !== null
    && (await cipher.open(ACTOR, refs[0], new Date(INSTANT.getTime() + 86_400_000 - 1))).version === "scr1");
  check("46 a reference sealed under another key cannot be opened", (await threw(async () => {
    const otherCipher = ref.createSocialCandidateRefCipher(ref.decodeSocialCandidateRefKey(Buffer.alloc(32, 9).toString("base64")));
    return await cipher.open(ACTOR, await otherCipher.seal(ACTOR, CANDIDATES[0], INSTANT), INSTANT);
  })) !== null);
  check("47 a fresh IV makes two seals of the same pair differ",
    (await cipher.seal(ACTOR, CANDIDATES[0], INSTANT)) !== (await cipher.seal(ACTOR, CANDIDATES[0], INSTANT)));
  for (const badKey of [Buffer.alloc(16, 1).toString("base64"), Buffer.alloc(24, 1).toString("base64"), Buffer.alloc(31, 1).toString("base64"), "not-base64!!"]) {
    check(`48 a key of the wrong length or encoding is rejected: ${badKey.length} chars`,
      (await threw(async () => ref.decodeSocialCandidateRefKey(badKey))) !== null);
  }

  console.log(JSON.stringify({
    suite: "social-candidate-sr2d-smoke",
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
} catch (error) {
  console.log(JSON.stringify({
    suite: "social-candidate-sr2d-smoke",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? String(error.stack).split("\n").slice(0, 5) : undefined
  }, null, 2));
  process.exit(1);
}
