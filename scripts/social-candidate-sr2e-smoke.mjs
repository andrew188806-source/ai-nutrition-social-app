#!/usr/bin/env node
// SR-2E local smoke. Pure and local: no network, no database, no credentials, no deployment.
// The real Mobile feature modules, the real shared validator and the real mascot adapter all
// execute; only the Supabase Functions client, the auth port and the JSX runtime are substituted,
// and repository bytes are never modified.
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
// A minimal JSX runtime: components are invoked directly and return a plain {type, props} tree, so
// the real card renders without React or a native host.
const jsxRuntime = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
  Fragment: "Fragment"
};
const reactNativeStub = new Proxy({
  StyleSheet: { create: (styles) => styles },
  Platform: { OS: "ios", select: (spec) => spec.ios }
}, {
  get: (target, key) => (key in target ? target[key] : String(key))
});
const externalStubs = new Map([
  ["react/jsx-runtime", jsxRuntime],
  ["react-native", reactNativeStub]
]);

// Native/Expo packages are not installed for headless validation and are irrelevant to the contract
// under test. Any other unresolvable external specifier becomes an inert proxy so the real feature
// modules still load and execute exactly as written.
function externalStub(specifier) {
  if (externalStubs.has(specifier)) return externalStubs.get(specifier);
  try {
    return require_(specifier);
  } catch {
    const stub = new Proxy(function inert() { return undefined; }, {
      get: (_target, key) => (key === "default" ? stub : (key === "__esModule" ? true : stub)),
      apply: () => undefined,
      construct: () => ({})
    });
    externalStubs.set(specifier, stub);
    return stub;
  }
}

const cache = new Map();
const resolveFile = (candidate) =>
  [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());

function load(absolute) {
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: true
    },
    fileName: absolute
  });
  const module = { exports: {} };
  cache.set(absolute, module);
  const localRequire = (specifier) => {
    if (specifier === "@haocu/shared") return load(path.join(root, "packages/shared/src/index.ts"));
    if (!specifier.startsWith(".")) return externalStub(specifier);
    const resolved = resolveFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved import: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const fromRoot = (relative) => load(path.join(root, relative));

const FEATURE = "apps/mobile/features/social-candidates";
const feature = fromRoot(`${FEATURE}/index.ts`);
const shared = fromRoot("packages/shared/src/index.ts");

// --- fixtures --------------------------------------------------------------------------------
const ALLOWED = ["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"].sort();
const candidate = (index, overrides = {}) => ({
  candidateRef: `scr1.ref-${index}`,
  displayName: `Name ${index}`,
  mascotAvatarKey: "PB",
  publicBio: `bio ${index}`,
  willingToChat: index % 2 === 0,
  ...overrides
});
const response = (count, overrides = []) => ({
  policyVersion: "social-candidate-api-v1",
  candidates: Array.from({ length: count }, (_, index) => candidate(index, overrides[index] ?? {}))
});
const authPort = (authenticated = true) => ({
  getCurrentSession: async () => (authenticated
    ? { ok: true, value: { user: { id: "actor" }, provider: "email", issuedAt: "2026-01-01T00:00:00Z" } }
    : { ok: true, value: null })
});
function client({ data = null, error = null, throws = false, calls = [] } = {}) {
  return {
    functions: {
      invoke: async (...args) => {
        calls.push(args);
        if (throws) throw new Error("network down");
        return { data, error };
      }
    }
  };
}
const liveRepo = (options) => feature.createSocialCandidateRepository(
  "supabase-live", true,
  { authPort: authPort(options.authenticated ?? true), candidateClient: options.client },
  { candidateSource: "supabase-live", issues: [] }
);
const texts = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) texts(child, out); return out; }
  if (typeof node === "object" && node.props) texts(node.props.children, out);
  return out;
};

try {
  // --- shared validator -----------------------------------------------------------------------
  check("01 a well-formed response validates", shared.validateSocialCandidateApiResponseV1(response(3)).ok);
  check("02 an empty candidate list is a valid success",
    shared.validateSocialCandidateApiResponseV1(response(0)).ok);
  check("03 a foreign policy version is rejected",
    !shared.validateSocialCandidateApiResponseV1({ ...response(1), policyVersion: "social-candidate-api-v2" }).ok);
  check("04 an extra envelope key is rejected",
    !shared.validateSocialCandidateApiResponseV1({ ...response(1), truncated: false }).ok);
  for (const extra of ["candidateUserId", "userId", "profileId", "exposureIndex", "rankingState", "score", "isPremium", "isVerified", "distanceKm"]) {
    const bad = response(1);
    bad.candidates[0] = { ...bad.candidates[0], [extra]: "x" };
    check(`05 a leaked candidate field is rejected: ${extra}`, !shared.validateSocialCandidateApiResponseV1(bad).ok);
  }
  check("06 a missing required candidate field is rejected",
    !shared.validateSocialCandidateApiResponseV1({ policyVersion: "social-candidate-api-v1", candidates: [{ candidateRef: "a", displayName: "b", mascotAvatarKey: "PB", publicBio: null }] }).ok);
  check("07 a null publicBio is accepted and preserved",
    shared.validateSocialCandidateApiResponseV1(response(1, [{ publicBio: null }])).value.candidates[0].publicBio === null);
  check("08 a non-boolean willingToChat is rejected",
    !shared.validateSocialCandidateApiResponseV1(response(1, [{ willingToChat: "yes" }])).ok);
  check("09 a non-array candidates field is rejected",
    !shared.validateSocialCandidateApiResponseV1({ policyVersion: "social-candidate-api-v1", candidates: {} }).ok);

  // --- repository behaviour --------------------------------------------------------------------
  for (const count of [1, 3, 10]) {
    const outcome = await liveRepo({ client: client({ data: response(count) }) }).listSocialCandidates();
    check(`10 a ${count}-candidate response is returned untouched`,
      outcome.ok && outcome.value.candidates.length === count, outcome.ok ? outcome.value.candidates.length : outcome.error.code);
  }
  const twelve = await liveRepo({ client: client({ data: response(12) }) }).listSocialCandidates();
  check("11 the client applies no cap or slice of its own", twelve.ok && twelve.value.candidates.length === 12);
  const ordered = await liveRepo({ client: client({ data: response(6) }) }).listSocialCandidates();
  check("12 server order is preserved exactly",
    JSON.stringify(ordered.value.candidates.map((c) => c.displayName))
    === JSON.stringify(["Name 0", "Name 1", "Name 2", "Name 3", "Name 4", "Name 5"]));
  const emptyOutcome = await liveRepo({ client: client({ data: response(0) }) }).listSocialCandidates();
  check("13 an empty list is a success, never an error", emptyOutcome.ok && emptyOutcome.value.candidates.length === 0);
  const calls = [];
  await liveRepo({ client: client({ data: response(1), calls }) }).listSocialCandidates();
  check("14 invoke is called with the function name and no options at all",
    calls.length === 1 && calls[0].length === 1 && calls[0][0] === "social-candidate-list", calls[0]);
  check("15 an unauthenticated session yields authentication_required without invoking",
    await (async () => {
      const seen = [];
      const outcome = await liveRepo({ authenticated: false, client: client({ data: response(1), calls: seen }) }).listSocialCandidates();
      return !outcome.ok && outcome.error.code === "authentication_required" && seen.length === 0;
    })());
  for (const [code, name] of [["authentication_required", "401"], ["invalid_request", "400"], ["server_unavailable", "503"]]) {
    const outcome = await liveRepo({
      client: client({ error: { name: "FunctionsHttpError", context: { json: async () => ({ error: { code } }) } } })
    }).listSocialCandidates();
    check(`16 a ${name} server error maps to ${code}`, !outcome.ok && outcome.error.code === code, outcome.ok ? "ok" : outcome.error.code);
  }
  check("17 a relay or fetch failure maps to network_error", await (async () => {
    const outcome = await liveRepo({ client: client({ error: { name: "FunctionsFetchError" } }) }).listSocialCandidates();
    return !outcome.ok && outcome.error.code === "network_error";
  })());
  check("18 a thrown invoke maps to network_error", await (async () => {
    const outcome = await liveRepo({ client: client({ throws: true }) }).listSocialCandidates();
    return !outcome.ok && outcome.error.code === "network_error";
  })());
  check("19 an unknown server error collapses to internal_error", await (async () => {
    const outcome = await liveRepo({ client: client({ error: { name: "FunctionsHttpError", context: { json: async () => ({ error: { code: "leaked_sql_detail" } }) } } }) }).listSocialCandidates();
    return !outcome.ok && outcome.error.code === "internal_error";
  })());
  check("20 a malformed success body is invalid_server_response, not a render", await (async () => {
    const outcome = await liveRepo({ client: client({ data: { policyVersion: "social-candidate-api-v1", candidates: [{ candidateRef: "a" }] } }) }).listSocialCandidates();
    return !outcome.ok && outcome.error.code === "invalid_server_response";
  })());
  check("21 a leaked identifier in a success body is rejected before rendering", await (async () => {
    const bad = response(1);
    bad.candidates[0] = { ...bad.candidates[0], candidateUserId: "00000000-0000-4000-8000-000000000001" };
    const outcome = await liveRepo({ client: client({ data: bad }) }).listSocialCandidates();
    return !outcome.ok && outcome.error.code === "invalid_server_response";
  })());
  check("22 a retry after a failure succeeds and replaces the result", await (async () => {
    let attempt = 0;
    const flaky = {
      functions: {
        invoke: async () => {
          attempt += 1;
          return attempt === 1 ? { data: null, error: { name: "FunctionsFetchError" } } : { data: response(2), error: null };
        }
      }
    };
    const repository = feature.createSocialCandidateRepository("supabase-live", true,
      { authPort: authPort(), candidateClient: flaky }, { candidateSource: "supabase-live", issues: [] });
    const first = await repository.listSocialCandidates();
    const second = await repository.listSocialCandidates();
    return !first.ok && first.error.code === "network_error" && second.ok && second.value.candidates.length === 2;
  })());
  check("23 a refresh replaces the list and its references", await (async () => {
    let generation = 0;
    const rotating = {
      functions: {
        invoke: async () => {
          generation += 1;
          return { data: { policyVersion: "social-candidate-api-v1", candidates: [candidate(0, { candidateRef: `scr1.gen-${generation}` })] }, error: null };
        }
      }
    };
    const repository = feature.createSocialCandidateRepository("supabase-live", true,
      { authPort: authPort(), candidateClient: rotating }, { candidateSource: "supabase-live", issues: [] });
    const first = await repository.listSocialCandidates();
    const second = await repository.listSocialCandidates();
    return first.value.candidates[0].candidateRef !== second.value.candidates[0].candidateRef;
  })());

  // --- factory / flags ---------------------------------------------------------------------------
  check("24 an unset source defaults to the disabled repository",
    feature.createSocialCandidateRepository("supabase-live", true, {}, feature.getSocialCandidateRuntimeFlags("supabase-live", true, {})).source === "disabled");
  check("25 the disabled repository fails closed rather than returning an empty list", await (async () => {
    const outcome = await feature.createSocialCandidateRepository("disabled", false, {}, { candidateSource: "disabled", issues: [] }).listSocialCandidates();
    return !outcome.ok && outcome.error.code === "social_candidates_disabled";
  })());
  check("26 a live source without a client falls back to disabled",
    feature.createSocialCandidateRepository("supabase-live", true, { authPort: authPort() }, { candidateSource: "supabase-live", issues: [] }).source === "disabled");
  check("27 flag issues force the disabled repository",
    feature.createSocialCandidateRepository("supabase-live", true, { authPort: authPort(), candidateClient: client({}) }, { candidateSource: "supabase-live", issues: ["bad"] }).source === "disabled");
  const mockOutcome = await feature.createSocialCandidateRepository("mock", false, { authPort: authPort() }, { candidateSource: "mock", issues: [] }).listSocialCandidates();
  check("28 the mock adapter returns frozen-shape candidates only",
    mockOutcome.ok && mockOutcome.value.candidates.every((c) => JSON.stringify(Object.keys(c).sort()) === JSON.stringify(ALLOWED)));
  check("29 the mock fixture carries both willingToChat values and a null bio",
    mockOutcome.value.candidates.some((c) => c.willingToChat === true)
    && mockOutcome.value.candidates.some((c) => c.willingToChat === false)
    && mockOutcome.value.candidates.some((c) => c.publicBio === null));

  // --- mascot adapter -----------------------------------------------------------------------------
  for (const assetKey of ["PB", "VG", "FF", "DH", "BG", "MD", "LC", "TE"]) {
    const resolved = feature.resolveSocialCandidateMascot(assetKey);
    check(`30 known mascot assetKey resolves: ${assetKey}`, resolved.resolvedFromKey && resolved.assetKey === assetKey && resolved.mascotId.length > 0);
  }
  const unknown = feature.resolveSocialCandidateMascot("ZZ-not-a-mascot");
  check("31 an unknown mascot key falls back without throwing", unknown.resolvedFromKey === false && unknown.mascotId.length > 0);
  check("32 the mascot adapter maps by assetKey, not by mascot id",
    feature.resolveSocialCandidateMascot("protein-believer").resolvedFromKey === false);

  // --- card rendering ------------------------------------------------------------------------------
  const rendered = feature.SocialCandidateCard({ candidate: candidate(1, { displayName: "Ada", publicBio: "loves ramen", willingToChat: true }) });
  const renderedText = texts(rendered).join(" | ");
  check("33 the card renders the display name and public bio", renderedText.includes("Ada") && renderedText.includes("loves ramen"));
  check("34 the card renders a willing-to-chat indicator", renderedText.length > 0 && /聊/.test(renderedText));
  const nullBio = texts(feature.SocialCandidateCard({ candidate: candidate(2, { publicBio: null }) })).join(" | ");
  check("35 a null public bio renders without invented filler", !nullBio.includes("null") && !nullBio.includes("undefined"));
  const unwilling = texts(feature.SocialCandidateCard({ candidate: candidate(3, { displayName: "Bo", willingToChat: false }) })).join(" | ");
  check("36 a candidate unwilling to chat still renders", unwilling.includes("Bo"));
  const unknownMascotCard = texts(feature.SocialCandidateCard({ candidate: candidate(4, { displayName: "Cy", mascotAvatarKey: "ZZZ" }) })).join(" | ");
  check("37 an unknown mascot key still renders the candidate", unknownMascotCard.includes("Cy"));
  const serialized = JSON.stringify(rendered);
  for (const forbidden of ["candidateUserId", "userId", "profileId", "exposureIndex", "rankingState", "score", "isPremium", "isVerified", "distance", "scr1."]) {
    check(`38 the rendered card never exposes: ${forbidden}`, !serialized.includes(forbidden));
  }

  console.log(JSON.stringify({
    suite: "social-candidate-sr2e-smoke",
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
    suite: "social-candidate-sr2e-smoke",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? String(error.stack).split("\n").slice(0, 6) : undefined
  }, null, 2));
  process.exit(1);
}
