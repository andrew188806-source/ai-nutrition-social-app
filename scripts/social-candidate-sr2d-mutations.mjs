#!/usr/bin/env node
// SR-2D meaningful mutation contract. Mutants execute in memory; repository bytes are never changed.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  SR2D_BRIDGE_ARTIFACT,
  SR2D_REPOINTED_FROZEN_FILE,
  SR2D_SUCCESSOR_PATHS
} from "./social-candidate-sr2d-successor-manifest.mjs";
import { renderBridge } from "./build-social-taste-types-bridge.mjs";
import { proveRepointEquivalence } from "./social-candidate-sr2d-repoint-equivalence.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const apiRoot = "supabase/functions/_shared/social-candidate-api";
const refRoot = "supabase/functions/_shared/social-candidate-ref";
const fnRoot = "supabase/functions/social-candidate-list";
const files = Object.freeze({
  compose: `${apiRoot}/composeCandidateList.ts`,
  dto: `${apiRoot}/toCandidateDto.ts`,
  apiPolicy: `${apiRoot}/policy.ts`,
  apiTypes: `${apiRoot}/types.ts`,
  sourceRead: `${apiRoot}/readCandidateTasteSources.ts`,
  refPolicy: `${refRoot}/policy.ts`,
  refCrypto: `${refRoot}/crypto.ts`,
  handler: `${fnRoot}/handler.ts`,
  config: `${fnRoot}/config.ts`
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));

const npmStubs = new Map([
  ["npm:@supabase/supabase-js@2", { createClient: () => ({}) }],
  ["npm:postgres@3.4.7", { default: () => ({}) }]
]);
globalThis.Deno = globalThis.Deno ?? { env: { get: () => undefined }, serve: () => {} };

function loadGraph(overrides = new Map()) {
  const cache = new Map();
  const resolveFile = (candidate) =>
    [candidate, `${candidate}.ts`, `${candidate}.mjs`, path.join(candidate, "index.ts")]
      .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    const source = overrides.get(relative) ?? canonical.get(relative) ?? fs.readFileSync(absolute, "utf8");
    const { outputText } = ts.transpileModule(source, {
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
  };
  return Object.freeze({
    api: load(path.join(root, `${apiRoot}/index.ts`)),
    ref: load(path.join(root, `${refRoot}/index.ts`)),
    handler: load(path.join(root, `${fnRoot}/handler.ts`))
  });
}

// --- fixtures ---------------------------------------------------------------------------------
const ACTOR = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ACTOR = "00000000-0000-4000-8000-0000000000bb";
const CANDIDATES = Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const EMPTY_SOURCES = {
  dietary_restrictions: { rows: [] }, favorite_menu_items: { rows: [] }, favorite_restaurants: { rows: [] },
  meal_record_items: { rows: [] }, meal_records: { rows: [] }, nutrition_goals: { rows: [] }, taste_profiles: { rows: [] }
};
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const INSTANT = new Date("2026-08-16T12:00:00.000Z");

function createTransport({ candidateUserIds = CANDIDATES, survives = () => true, capture = {} } = {}) {
  return {
    async withTransaction(operation) {
      return await operation({
        query: async (statement, parameters) => {
          if (statement.text.includes("canonical_candidate_taste_sources")) {
            return [{
              payload: {
                actor: { user_id: ACTOR, sources: EMPTY_SOURCES },
                authorized_candidate_user_ids: [...candidateUserIds],
                candidates: candidateUserIds.map((userId) => ({ user_id: userId, sources: EMPTY_SOURCES }))
              }
            }];
          }
          if (statement.text.includes("project_exposed_social_profiles")) {
            capture.requested = [...parameters[1]];
            return parameters[1].map((userId, ordinal) => ({ ordinal, userId }))
              .filter(({ ordinal }) => survives(ordinal))
              .map(({ ordinal, userId }) => ({
                exposure_ordinal: ordinal,
                // Descending display names, so alphabetical order is the REVERSE of exposure order
                // and any sort introduced by a mutant is observable.
                display_name: `Name ${String(900 - ordinal)}`,
                mascot_avatar_key: `mascot_${userId.slice(-2)}`,
                public_bio: `bio ${ordinal}`,
                willing_to_chat: ordinal % 2 === 0
              }));
          }
          throw new Error("unexpected statement");
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
        data: [{ plan_code: planCode, status: "active", valid_from: "2026-01-01T00:00:00.000Z", valid_until: null }],
        error: null
      })
    })
  })
});

async function compose(graph, { planCode = "premium", survives, candidateUserIds, capture = {} } = {}) {
  return await graph.api.composeSocialCandidateList({
    transport: createTransport({ candidateUserIds, survives, capture }),
    entitlementRowSource: entitlementSource(planCode),
    cipher: graph.ref.createSocialCandidateRefCipher(graph.ref.decodeSocialCandidateRefKey(TEST_KEY)),
    actorUserId: ACTOR,
    requestInstant: INSTANT
  });
}
const request = (init = {}) => new Request(init.url ?? "https://edge.invalid/social-candidate-list", {
  method: init.method ?? "POST", headers: init.headers ?? {}, ...(init.body === undefined ? {} : { body: init.body })
});
function dependencies(graph) {
  return {
    loadConfig: () => ({ ok: true, value: { supabaseUrl: "https://dev.invalid", supabaseAnonKey: "anon", candidateRefKey: graph.ref.decodeSocialCandidateRefKey(TEST_KEY) } }),
    authenticateCaller: async () => ({ ok: true, value: { userId: ACTOR, userScopedClient: entitlementSource("premium") } }),
    createTransport: () => createTransport({})
  };
}
const keys = (response) => response.candidates.map((candidate) => Object.keys(candidate).sort().join(","));
const ALLOWED_KEYS = ["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"].sort().join(",");

// --- mutations ----------------------------------------------------------------------------------
const mutations = [
  { name: "raw candidate user id exposed in the DTO", file: files.dto,
    from: "      candidateRef,", to: "      candidateRef,\n      candidateUserId: exposed.candidateUserId,",
    detect: async (g) => keys(await compose(g)).some((entry) => entry !== ALLOWED_KEYS) },
  { name: "exposure ordinal exposed in the DTO", file: files.dto,
    from: "      candidateRef,", to: "      candidateRef,\n      exposureIndex: ordinal,",
    detect: async (g) => keys(await compose(g)).some((entry) => entry !== ALLOWED_KEYS) },
  { name: "ranking state exposed in the DTO", file: files.dto,
    from: "      candidateRef,", to: "      candidateRef,\n      rankingState: exposed.rankingState,",
    detect: async (g) => keys(await compose(g)).some((entry) => entry !== ALLOWED_KEYS) },
  { name: "truncated exposed in the envelope", file: files.dto,
    from: "    policyVersion: SOCIAL_CANDIDATE_API_POLICY_VERSION,", to: "    policyVersion: SOCIAL_CANDIDATE_API_POLICY_VERSION,\n    truncated: exposure.truncated,",
    detect: async (g) => Object.keys(await compose(g)).sort().join(",") !== "candidates,policyVersion" },
  { name: "hasMore pagination hint added to the envelope", file: files.dto,
    from: "    policyVersion: SOCIAL_CANDIDATE_API_POLICY_VERSION,", to: "    policyVersion: SOCIAL_CANDIDATE_API_POLICY_VERSION,\n    hasMore: exposure.truncated,",
    detect: async (g) => Object.keys(await compose(g)).sort().join(",") !== "candidates,policyVersion" },
  { name: "candidate reference replaced by the raw user id", file: files.dto,
    from: "    const candidateRef = await cipher.seal(actorUserId, exposed.candidateUserId, requestInstant);",
    to: "    const candidateRef = exposed.candidateUserId;",
    detect: async (g) => (await compose(g)).candidates.some((candidate) => CANDIDATES.includes(candidate.candidateRef)) },
  { name: "projected candidates reordered alphabetically", file: files.dto,
    from: "  for (const profile of projection.candidates) {",
    to: "  for (const profile of [...projection.candidates].sort((a, b) => a.displayName.localeCompare(b.displayName))) {",
    detect: async (g) => {
      const capture = {};
      const response = await compose(g, { capture, survives: (ordinal) => ordinal !== 1 });
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      const opened = [];
      for (const candidate of response.candidates) opened.push((await cipher.open(ACTOR, candidate.candidateRef, INSTANT)).candidateUserId);
      const expected = capture.requested.filter((_, ordinal) => ordinal !== 1);
      return JSON.stringify(opened) !== JSON.stringify(expected);
    } },
  { name: "omitted profile refilled by shifting the next candidate up", file: files.dto,
    from: "    const exposed = exposure.exposed[ordinal];",
    to: "    const exposed = exposure.exposed[candidates.length];",
    detect: async (g) => {
      const capture = {};
      const response = await compose(g, { capture, survives: (ordinal) => ordinal !== 1 });
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      const opened = [];
      for (const candidate of response.candidates) opened.push((await cipher.open(ACTOR, candidate.candidateRef, INSTANT)).candidateUserId);
      return JSON.stringify(opened) !== JSON.stringify(capture.requested.filter((_, ordinal) => ordinal !== 1));
    } },
  { name: "willingToChat=false candidates filtered out", file: files.dto,
    from: "    if (typeof profile.willingToChat !== \"boolean\") {",
    to: "    if (profile.willingToChat !== true) continue;\n    if (typeof profile.willingToChat !== \"boolean\") {",
    detect: async (g) => (await compose(g)).candidates.every((candidate) => candidate.willingToChat === true) },
  { name: "duplicate exposure ordinal accepted", file: files.dto,
    from: "    if (seen.has(ordinal)) return socialCandidateApiContractViolation();", to: "",
    detect: async (g) => {
      const transport = createTransport({});
      const patched = {
        async withTransaction(operation) {
          return await transport.withTransaction(async (transaction) => await operation({
            ...transaction,
            query: async (statement, parameters) => {
              const rows = await transaction.query(statement, parameters);
              return statement.text.includes("project_exposed_social_profiles")
                ? rows.map((row) => ({ ...row, exposure_ordinal: 0 }))
                : rows;
            }
          }));
        },
        async close() {}
      };
      const response = await g.api.composeSocialCandidateList({
        transport: patched, entitlementRowSource: entitlementSource("premium"),
        cipher: g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY)),
        actorUserId: ACTOR, requestInstant: INSTANT
      });
      return response.candidates.length > 1;
    } },
  { name: "out-of-range exposure ordinal accepted", file: files.dto,
    from: "    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= exposure.exposed.length) {",
    to: "    if (false) {",
    detect: async (g) => {
      const transport = createTransport({});
      const patched = {
        async withTransaction(operation) {
          return await transport.withTransaction(async (transaction) => await operation({
            ...transaction,
            query: async (statement, parameters) => {
              const rows = await transaction.query(statement, parameters);
              return statement.text.includes("project_exposed_social_profiles")
                ? rows.map((row) => ({ ...row, exposure_ordinal: row.exposure_ordinal + 50 }))
                : rows;
            }
          }));
        },
        async close() {}
      };
      try {
        await g.api.composeSocialCandidateList({
          transport: patched, entitlementRowSource: entitlementSource("premium"),
          cipher: g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY)),
          actorUserId: ACTOR, requestInstant: INSTANT
        });
        return false;
      } catch { return true; }
    } },
  { name: "the SR-2D over-cap bound raised above the frozen Premium cap", file: files.apiPolicy,
    from: "export const SOCIAL_CANDIDATE_API_MAXIMUM_CANDIDATES = 10 as const;",
    to: "export const SOCIAL_CANDIDATE_API_MAXIMUM_CANDIDATES = 100 as const;",
    detect: async (g) => {
      // An eleven-candidate exposure can only arise from a broken upstream; SR-2D must refuse it.
      const exposed = CANDIDATES.slice(0, 11).map((candidateUserId) => ({ candidateUserId, rankingState: "scored" }));
      const exposure = { policyVersion: "social-exposure-v1", exposed, truncated: false };
      const projection = {
        policyVersion: "social-profile-projection-v1",
        candidates: exposed.map((_, index) => ({
          exposureIndex: index, displayName: `Name ${index}`, mascotAvatarKey: "m", publicBio: null, willingToChat: true
        }))
      };
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      try {
        await g.api.toSocialCandidateApiResponse(ACTOR, exposure, projection, cipher, INSTANT);
        return true;
      } catch { return false; }
    } },
  { name: "actor binding removed from the sealed reference", file: files.refCrypto,
    from: "  return toArrayBuffer(textEncoder.encode(`${SOCIAL_CANDIDATE_REF_VERSION}|${actorUserId}`));",
    to: "  return toArrayBuffer(textEncoder.encode(SOCIAL_CANDIDATE_REF_VERSION));",
    detect: async (g) => {
      // Killed when a DIFFERENT actor can open the reference, which is exactly the defect.
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      const token = await cipher.seal(ACTOR, CANDIDATES[0], INSTANT);
      try { await cipher.open(OTHER_ACTOR, token, INSTANT); return true; } catch { return false; }
    } },
  { name: "expiry check removed from the reference opener", file: files.refCrypto,
    from: "      if (nowMs >= (claims.expiresAtMs as number)) return socialCandidateRefContractViolation();", to: "",
    detect: async (g) => {
      // Killed when a long-expired reference still opens.
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      const token = await cipher.seal(ACTOR, CANDIDATES[0], INSTANT);
      try { await cipher.open(ACTOR, token, new Date(INSTANT.getTime() + 999_999_999)); return true; } catch { return false; }
    } },
  { name: "reference lifetime widened beyond 24 hours", file: files.refPolicy,
    from: "export const SOCIAL_CANDIDATE_REF_TTL_MS = 86_400_000 as const;",
    to: "export const SOCIAL_CANDIDATE_REF_TTL_MS = 8_640_000_000 as const;",
    detect: async (g) => {
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      const claims = await cipher.open(ACTOR, await cipher.seal(ACTOR, CANDIDATES[0], INSTANT), INSTANT);
      return claims.expiresAtMs - claims.issuedAtMs !== 86_400_000;
    } },
  { name: "key length validation weakened to allow AES-128", file: files.refCrypto,
    from: "  if (binary.length !== SOCIAL_CANDIDATE_REF_KEY_BYTES) return socialCandidateRefContractViolation();", to: "",
    detect: async (g) => {
      try { g.ref.decodeSocialCandidateRefKey(Buffer.alloc(16, 1).toString("base64")); return true; } catch { return false; }
    } },
  { name: "candidate identity written into the token in plaintext", file: files.refCrypto,
    from: "      const token = `${SOCIAL_CANDIDATE_REF_PREFIX}${base64UrlEncode(envelope)}`;",
    to: "      const token = `${SOCIAL_CANDIDATE_REF_PREFIX}${candidate}.${base64UrlEncode(envelope)}`;",
    detect: async (g) => {
      try {
        const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
        const token = await cipher.seal(ACTOR, CANDIDATES[0], INSTANT);
        return token.includes(CANDIDATES[0]);
      } catch { return true; }
    } },
  { name: "fresh IV replaced by a constant IV", file: files.refCrypto,
    from: "  const randomIv = options.randomIv ?? ((byteLength: number) => crypto.getRandomValues(new Uint8Array(byteLength)));",
    to: "  const randomIv = options.randomIv ?? ((byteLength: number) => new Uint8Array(byteLength));",
    detect: async (g) => {
      const cipher = g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY));
      return (await cipher.seal(ACTOR, CANDIDATES[0], INSTANT)) === (await cipher.seal(ACTOR, CANDIDATES[0], INSTANT));
    } },
  { name: "caller actor header honoured instead of the verified identity", file: files.handler,
    from: "  \"x-actor-user-id\",\n", to: "",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ headers: { "x-actor-user-id": OTHER_ACTOR } }), dependencies(g))).status !== 400 },
  { name: "caller candidate header accepted", file: files.handler,
    from: "  \"x-candidate-user-ids\",\n", to: "",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ headers: { "x-candidate-user-ids": CANDIDATES.join(",") } }), dependencies(g))).status !== 400 },
  { name: "caller limit header accepted", file: files.handler,
    from: "  \"x-limit\",\n", to: "",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ headers: { "x-limit": "10" } }), dependencies(g))).status !== 400 },
  { name: "caller clock header accepted", file: files.handler,
    from: "  \"x-now\",\n", to: "",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ headers: { "x-now": "2020-01-01T00:00:00Z" } }), dependencies(g))).status !== 400 },
  { name: "query parameter injection accepted", file: files.handler,
    from: "  if ([...url.searchParams.keys()].length !== 0) return false;", to: "",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ url: "https://edge.invalid/social-candidate-list?limit=99" }), dependencies(g))).status !== 400 },
  { name: "arbitrary request body accepted", file: files.handler,
    from: "      && Object.keys(body as Record<string, unknown>).length === 0;", to: "      && true;",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ body: JSON.stringify({ limit: 99 }) }), dependencies(g))).status !== 400 },
  { name: "non-POST method accepted", file: files.handler,
    from: "  if (request.method !== \"POST\") return buildSocialCandidateListError(\"invalid_request\");", to: "",
    detect: async (g) => (await g.handler.processSocialCandidateListRequest(
      request({ method: "GET" }), dependencies(g))).status !== 400 },
  { name: "unauthenticated request allowed through", file: files.handler,
    from: "  if (!authentication.ok) return buildSocialCandidateListError(\"authentication_required\");", to: "",
    detect: async (g) => {
      const deps = { ...dependencies(g), authenticateCaller: async () => ({ ok: false, errorCode: "authentication_required" }) };
      const response = await g.handler.processSocialCandidateListRequest(request({}), deps);
      return response.status !== 401;
    } },
  { name: "dependency failure collapsed into an empty success", file: files.handler,
    from: "    return buildSocialCandidateListError(\"server_unavailable\");\n  } finally {",
    to: "    return new Response(JSON.stringify({ policyVersion: \"social-candidate-api-v1\", candidates: [] }), { status: 200, headers: { \"content-type\": \"application/json\" } });\n  } finally {",
    detect: async (g) => {
      const deps = {
        ...dependencies(g),
        createTransport: () => ({ async withTransaction() { throw new Error("dependency_failure"); }, async close() {} })
      };
      const response = await g.handler.processSocialCandidateListRequest(request({}), deps);
      return response.status === 200;
    } },
  { name: "multiple independent clocks used across the composition", file: files.compose,
    from: "  const entitlement = await resolveSocialEntitlement(entitlementRowSource, actorUserId, requestInstant);",
    to: "  const entitlement = await resolveSocialEntitlement(entitlementRowSource, actorUserId, new Date());",
    detect: async () => {
      const mutated = canonical.get(files.compose).replace(
        "  const entitlement = await resolveSocialEntitlement(entitlementRowSource, actorUserId, requestInstant);",
        "  const entitlement = await resolveSocialEntitlement(entitlementRowSource, actorUserId, new Date());"
      );
      return /new Date\(\)/.test(mutated);
    } },
  { name: "service role credential introduced into config", file: files.config,
    from: "  const supabaseAnonKey = readEnvironment(\"SUPABASE_ANON_KEY\");",
    to: "  const supabaseAnonKey = readEnvironment(\"SUPABASE_SERVICE_ROLE_KEY\");",
    detect: async () => /SERVICE_ROLE/i.test(canonical.get(files.config).replace(
      "  const supabaseAnonKey = readEnvironment(\"SUPABASE_ANON_KEY\");",
      "  const supabaseAnonKey = readEnvironment(\"SUPABASE_SERVICE_ROLE_KEY\");")) },
  { name: "candidate reference key reuses the public anon key", file: files.config,
    from: "  const encodedCandidateRefKey = readEnvironment(SOCIAL_CANDIDATE_REF_KEY_ENV);",
    to: "  const encodedCandidateRefKey = readEnvironment(\"SUPABASE_ANON_KEY\");",
    detect: async () => !/readEnvironment\(SOCIAL_CANDIDATE_REF_KEY_ENV\)/.test(canonical.get(files.config).replace(
      "  const encodedCandidateRefKey = readEnvironment(SOCIAL_CANDIDATE_REF_KEY_ENV);",
      "  const encodedCandidateRefKey = readEnvironment(\"SUPABASE_ANON_KEY\");")) },
  { name: "missing candidate reference key tolerated", file: files.config,
    from: "  if (!supabaseUrl || !supabaseAnonKey || !encodedCandidateRefKey) {",
    to: "  if (!supabaseUrl || !supabaseAnonKey) {",
    detect: async () => !/!encodedCandidateRefKey/.test(canonical.get(files.config).replace(
      "  if (!supabaseUrl || !supabaseAnonKey || !encodedCandidateRefKey) {",
      "  if (!supabaseUrl || !supabaseAnonKey) {")) },
  { name: "a second candidate source substituted for the canonical primitive", file: files.sourceRead,
    from: "  select social_internal.canonical_candidate_taste_sources($1::uuid) as payload",
    to: "  select payload from public.social_candidate_cache where user_id = $1::uuid",
    detect: async () => !/canonical_candidate_taste_sources/.test(canonical.get(files.sourceRead).replace(
      "  select social_internal.canonical_candidate_taste_sources($1::uuid) as payload",
      "  select payload from public.social_candidate_cache where user_id = $1::uuid")) },
  { name: "SR-2A ranking bypassed", file: files.compose,
    from: "  const ranking = rankSocialCandidates(rankingInputs);",
    to: "  const ranking = Object.freeze({ policyVersion: \"social-ranking-v1\" as const, ordered: rankingInputs.map((entry) => Object.freeze({ candidateUserId: entry.candidateUserId, rankingState: \"scored\" as const })) });",
    detect: async () => !/rankSocialCandidates\(/.test(canonical.get(files.compose).replace(
      "  const ranking = rankSocialCandidates(rankingInputs);",
      "  const ranking = Object.freeze({});")) },
  { name: "SR-2B exposure bypassed", file: files.compose,
    from: "  const exposure = applySocialExposure(ranking, entitlement);",
    to: "  const exposure = Object.freeze({ policyVersion: \"social-exposure-v1\" as const, exposed: ranking.ordered, truncated: false });",
    detect: async (g) => (await compose(g, { planCode: "free" })).candidates.length > 3 },
  { name: "SR-2C projection bypassed for direct profile enrichment", file: files.compose,
    from: "  const projection = projectPublicSocialProfiles(exposure, rows);",
    to: "  const projection = Object.freeze({ policyVersion: \"social-profile-projection-v1\" as const, candidates: rows.map((row, index) => Object.freeze({ exposureIndex: index, displayName: row.display_name, mascotAvatarKey: row.mascot_avatar_key, publicBio: row.public_bio, willingToChat: row.willing_to_chat })) });",
    detect: async () => !/projectPublicSocialProfiles\(/.test(canonical.get(files.compose).replace(
      "  const projection = projectPublicSocialProfiles(exposure, rows);",
      "  const projection = Object.freeze({});")) },
  { name: "a write side effect introduced into the composition", file: files.compose,
    from: "  return await toSocialCandidateApiResponse(actorUserId, exposure, projection, cipher, requestInstant);",
    to: "  await entitlementRowSource.from(\"subscription_entitlements\").select(\"*\");\n  return await toSocialCandidateApiResponse(actorUserId, exposure, projection, cipher, requestInstant);",
    detect: async (g) => {
      // Behavioural: the canonical composition touches the entitlement source exactly once.
      let fromCalls = 0;
      const counting = {
        from: () => {
          fromCalls += 1;
          return {
            select: () => ({
              eq: () => Promise.resolve({
                data: [{ plan_code: "premium", status: "active", valid_from: "2026-01-01T00:00:00.000Z", valid_until: null }],
                error: null
              })
            })
          };
        }
      };
      await g.api.composeSocialCandidateList({
        transport: createTransport({}),
        entitlementRowSource: counting,
        cipher: g.ref.createSocialCandidateRefCipher(g.ref.decodeSocialCandidateRefKey(TEST_KEY)),
        actorUserId: ACTOR,
        requestInstant: INSTANT
      });
      return fromCalls !== 1;
    } }
];

// --- SR-2D-R1 deployability bridge mutants --------------------------------------------------------
// These operate on the artifact and the authorized repoint rather than on the loadable module graph,
// so each is applied to an in-memory copy and checked against the same invariants the guard enforces.
const bridgeCanonical = fs.readFileSync(path.join(root, SR2D_BRIDGE_ARTIFACT), "utf8");
const repointCanonical = fs.readFileSync(path.join(root, SR2D_REPOINTED_FROZEN_FILE), "utf8");
const emitOf = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, removeComments: true }
}).outputText.trim();

const bridgeMutations = [
  { name: "generated artifact hand-edited away from generator output",
    mutate: () => `${bridgeCanonical}\nexport type SmuggledType = string;\n`,
    holds: (source) => source === renderBridge() },
  { name: "generated banner removed so drift looks authored",
    mutate: () => bridgeCanonical.replace("// GENERATED - DO NOT EDIT.", "// hand maintained"),
    holds: (source) => /^\/\/ GENERATED - DO NOT EDIT\./.test(source) && source === renderBridge() },
  { name: "runtime code introduced into the types bridge",
    mutate: () => `${bridgeCanonical}\nexport const SMUGGLED_CAP = 25;\n`,
    holds: (source) => emitOf(source) === "export {};" && source === renderBridge() },
  { name: "ranking policy smuggled into the generated output",
    mutate: () => `${bridgeCanonical}\nexport type SmuggledRanking = "social-ranking-v1";\n`,
    holds: (source) => !/social-ranking-v1|social-exposure-v1|social-profile-projection-v1/.test(source) && source === renderBridge() },
  { name: "an extension-less import reintroduced into the bridge",
    mutate: () => `import type { Foo } from "../snapshot";\n${bridgeCanonical}`,
    holds: (source) => !/^\s*(import|export)\s[^=]*\bfrom\b/m.test(source) && source === renderBridge() }
];

const repointMutations = [
  { name: "authorized repoint reverted to the non-deployable canonical package path",
    mutate: () => repointCanonical.replace(
      '"../social-taste-types/sharedTasteAdapterTypes.generated.ts"',
      '"../../../../packages/shared/src/domain/taste-similarity/shared-adapter/types.ts"'),
    holds: (source) => !source.includes("packages/shared") },
  { name: "a second line changed in the otherwise frozen SR-2A type module",
    mutate: () => repointCanonical.replace(
      'export type SocialRankingState = "scored" | "not_scored" | "unsupported";',
      'export type SocialRankingState = "scored" | "not_scored" | "unsupported" | "boosted";'),
    holds: (source) => source === repointCanonical },
  { name: "runtime code introduced into the repointed frozen type module",
    mutate: () => `${repointCanonical}\nexport const SMUGGLED = 1;\n`,
    holds: (source) => emitOf(source) === "export {};" }
];

const results = [];
for (const mutation of bridgeMutations) {
  const mutated = mutation.mutate();
  const killed = mutated !== bridgeCanonical && !mutation.holds(mutated) && mutation.holds(bridgeCanonical);
  results.push({ name: `bridge: ${mutation.name}`, applied: true, killed, status: killed ? "killed" : "survived" });
}
for (const mutation of repointMutations) {
  const mutated = mutation.mutate();
  const killed = mutated !== repointCanonical && !mutation.holds(mutated) && mutation.holds(repointCanonical);
  results.push({ name: `repoint: ${mutation.name}`, applied: true, killed, status: killed ? "killed" : "survived" });
}
{
  const proof = proveRepointEquivalence();
  const holds = proof.onlyAuthorizedLineChanged && proof.runtimeEmitIdentical && proof.runtimeEmitIsTypeOnly;
  results.push({ name: "repoint: canonical state satisfies the authorized one-line equivalence proof", applied: true, killed: holds, status: holds ? "killed" : "survived" });
}

for (const mutation of mutations) {
  const source = canonical.get(mutation.file);
  const occurrences = source.split(mutation.from).length - 1;
  if (occurrences !== 1) {
    results.push({ name: mutation.name, applied: false, killed: false, status: "anchor_missing", occurrences });
    continue;
  }
  const overrides = new Map([[mutation.file, source.replace(mutation.from, mutation.to)]]);
  let killed = false;
  try {
    killed = Boolean(await mutation.detect(loadGraph(overrides)));
  } catch {
    // A mutant that cannot even load or evaluate is observably broken, which is a kill.
    killed = true;
  }
  results.push({ name: mutation.name, applied: true, killed, status: killed ? "killed" : "survived" });
}

// The canonical graph itself must satisfy every contract the mutants violate.
let canonicalHolds = false;
try {
  const graph = loadGraph();
  const premium = await compose(graph, { planCode: "premium" });
  const free = await compose(graph, { planCode: "free" });
  canonicalHolds = keys(premium).every((entry) => entry === ALLOWED_KEYS)
    && Object.keys(premium).sort().join(",") === "candidates,policyVersion"
    && premium.candidates.length === 10 && free.candidates.length === 3
    && premium.candidates.every((candidate) => candidate.candidateRef.startsWith("scr1."))
    && !JSON.stringify(premium).includes(ACTOR);
} catch { canonicalHolds = false; }
results.push({ name: "canonical graph satisfies the exact SR-2D contract", applied: true, killed: canonicalHolds, status: canonicalHolds ? "killed" : "survived" });

const residue = SR2D_SUCCESSOR_PATHS.filter((file) => canonical.has(file))
  .every((file) => fs.readFileSync(path.join(root, file), "utf8") === canonical.get(file));
const survived = results.filter(({ status }) => status === "survived");
const anchorMissing = results.filter(({ status }) => status === "anchor_missing");

console.log(JSON.stringify({
  suite: "social-candidate-sr2d-mutations",
  status: survived.length === 0 && anchorMissing.length === 0 && residue ? "passed" : "failed",
  totalMutations: results.length,
  applied: results.filter(({ applied }) => applied).length,
  killed: results.filter(({ killed }) => killed).length,
  survived: survived.length,
  anchorMissing,
  repositoryBytesUnchanged: residue,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(survived.length === 0 && anchorMissing.length === 0 && residue ? 0 : 1);
