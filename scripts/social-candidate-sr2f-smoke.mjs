#!/usr/bin/env node
// SR-2F local smoke. Pure and local: no network, no database, no credentials, no deployment.
// The REAL modified consumerRuntimeComposition executes, along with the real consumer-auth client
// factory, the real auth adapter, the real meal runtime graph, the real frozen SR-2E runtime
// binding seam and the real Social factories. Only the Supabase SDK itself is substituted, by a
// sentinel `createClient`, so that object identity can be proven. Repository bytes are never
// modified: every module is transpiled in memory.
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

const COMPOSITION = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";
const BINDING = "apps/mobile/features/social-candidates/runtimeBinding.ts";
const FACTORIES = "apps/mobile/features/social-candidates/factories.ts";

// A non-secret placeholder environment. No real project ref, URL or key is used or read.
const LIVE_ENV = Object.freeze({
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://smoke.placeholder.invalid",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_smoke_placeholder"
});
const MOCK_ENV = Object.freeze({
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "mock",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "mock"
});
const DISABLED_ENV = Object.freeze({
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-disabled",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-disabled"
});
// Every consumer-facing EXPO_PUBLIC key the runtime may read, cleared before each scenario so the
// developer's own .env.local can never leak into, or rescue, a scenario.
const MANAGED_KEYS = Object.freeze([
  ...Object.keys(LIVE_ENV),
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORDS_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_WRITE_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_DAILY_NUTRITION_LIVE_READ_OPT_IN",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_WRITE_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_PLANNED_MEALS_LIVE_READ_OPT_IN",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_CORRECTION_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_NEXT_MEAL_RECOMMENDATION_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_WRITES_ENABLED",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_RECORD_LIVE_WRITE_OPT_IN",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_IDENTIFICATION_FINALIZATION_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE",
  "EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE"
]);

function applyEnv(overrides) {
  for (const key of MANAGED_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
}

// --- module loader ----------------------------------------------------------------------------
// A fresh loader per scenario: module-level state (the SR-2E binding singleton, the client factory
// singleton) starts pristine every time, so no scenario can inherit another scenario's binding.
function createLoader() {
  const created = [];
  const supabaseSdk = {
    createClient: (url, key, options) => {
      const client = {
        __sentinel: "supabase-client",
        url,
        key,
        options,
        auth: { __sentinel: "auth-client" },
        functions: { invoke: async () => ({ data: null, error: null }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) })
      };
      created.push(client);
      return client;
    },
    processLock: (_name, _acquireTimeout, fn) => fn()
  };

  const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" };
  const reactNativeStub = new Proxy({
    StyleSheet: { create: (styles) => styles },
    Platform: { OS: "ios", select: (spec) => spec.ios },
    AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) }
  }, { get: (target, key) => (key in target ? target[key] : String(key)) });

  // A real in-memory AsyncStorage: the mobile storage adapter hydrates from it at import time and
  // an inert proxy would break that promise chain before the composition ever runs.
  const asyncStorageApi = (() => {
    const store = new Map();
    return {
      getAllKeys: async () => [...store.keys()],
      multiGet: async (keys) => keys.map((key) => [key, store.get(key) ?? null]),
      multiSet: async (pairs) => { for (const [key, value] of pairs) store.set(key, value); },
      multiRemove: async (keys) => { for (const key of keys) store.delete(key); },
      getItem: async (key) => store.get(key) ?? null,
      setItem: async (key, value) => { store.set(key, value); },
      removeItem: async (key) => { store.delete(key); },
      clear: async () => { store.clear(); }
    };
  })();

  const externalStubs = new Map([
    ["@supabase/supabase-js", supabaseSdk],
    ["react/jsx-runtime", jsxRuntime],
    ["react-native", reactNativeStub],
    ["react-native-url-polyfill/auto", {}],
    ["@react-native-async-storage/async-storage", { __esModule: true, default: asyncStorageApi, ...asyncStorageApi }]
  ]);

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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, allowJs: true },
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

  return {
    createdClients: created,
    fromRoot: (relative) => load(path.join(root, relative))
  };
}

// Runs one composition scenario in a pristine module graph and reports what was bound.
function scenario(env, options = {}) {
  applyEnv(env);
  const loader = createLoader();
  const composition = loader.fromRoot(COMPOSITION);
  const binding = loader.fromRoot(BINDING);
  let result;
  let threw = null;
  try {
    result = composition.createConsumerRuntimeComposition(options);
  } catch (error) {
    threw = error;
    result = { ok: false, errorCode: "threw" };
  }
  return {
    loader,
    composition,
    binding,
    result,
    threw,
    bound: binding.getSocialCandidateRuntimeDependencies(),
    createdClients: loader.createdClients
  };
}

try {
  const originalEnv = { ...process.env };

  // --- live composition binds the canonical dependencies --------------------------------------
  const live = scenario(LIVE_ENV);
  const liveBound = live.bound;
  const controller = live.result.ok ? live.result.value.controller : null;

  check("1. the live composition succeeds", live.result.ok === true, { errorCode: live.result.errorCode, threw: live.threw ? live.threw.message : null });
  check("2. the live composition creates exactly one Supabase client", live.createdClients.length === 1, { created: live.createdClients.length });
  check("3. the Social feature receives a binding", Boolean(liveBound) && Object.keys(liveBound).length > 0, { keys: liveBound ? Object.keys(liveBound) : null });
  check("4. the binding exposes exactly authPort and candidateClient", liveBound && JSON.stringify(Object.keys(liveBound).sort()) === JSON.stringify(["authPort", "candidateClient"]), { keys: liveBound ? Object.keys(liveBound).sort() : null });
  check("5. the bound candidateClient is the identical singleton the factory created", liveBound?.candidateClient === live.createdClients[0]);
  check("6. the bound authPort is the identical instance the runtime controller uses", Boolean(controller) && liveBound?.authPort === controller.options.authPort);
  check("7. the bound authPort wraps the auth surface of the bound client", Boolean(liveBound?.candidateClient?.auth) && liveBound?.authPort?.authClient === liveBound?.candidateClient?.auth);
  check("8. the bound authPort reports the live source", liveBound?.authPort?.source === "supabase-live", { source: liveBound?.authPort?.source });
  check("9. no second client was constructed for Social", live.createdClients.length === 1 && liveBound?.candidateClient === live.createdClients[0]);

  // --- non-live compositions bind nothing ------------------------------------------------------
  const mock = scenario(MOCK_ENV);
  check("10. the mock composition succeeds", mock.result.ok === true, { errorCode: mock.result.errorCode });
  check("11. the mock composition binds no Social dependencies", Object.keys(mock.bound ?? {}).length === 0, { keys: Object.keys(mock.bound ?? {}) });
  check("12. the mock composition creates no Supabase client", mock.createdClients.length === 0);

  const disabled = scenario(DISABLED_ENV);
  check("13. the disabled composition binds no Social dependencies", Object.keys(disabled.bound ?? {}).length === 0, { keys: Object.keys(disabled.bound ?? {}) });
  check("14. the disabled composition creates no Supabase client", disabled.createdClients.length === 0);

  // --- a failed live composition must not bind -------------------------------------------------
  // Live auth with a mock profile source is rejected before any client is built, so nothing binds.
  const misconfigured = scenario({ ...LIVE_ENV, EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "mock" });
  check("15. a misconfigured live composition fails", misconfigured.result.ok === false, { errorCode: misconfigured.result.errorCode });
  check("16. a failed live composition binds nothing", Object.keys(misconfigured.bound ?? {}).length === 0, { keys: Object.keys(misconfigured.bound ?? {}) });
  check("17. a failed live composition leaves no client behind", misconfigured.createdClients.length === 0);

  // A live composition whose meal runtime graph refuses to build must also bind nothing, because
  // the binding sits after the runtimeParts guard.
  const mealMismatch = scenario(LIVE_ENV, { mealFlags: { authSource: "mock", issues: [] } });
  check("18. a live composition with an unusable meal runtime fails", mealMismatch.result.ok === false, { errorCode: mealMismatch.result.errorCode });
  check("19. a live composition that fails after client creation still binds nothing", Object.keys(mealMismatch.bound ?? {}).length === 0, { keys: Object.keys(mealMismatch.bound ?? {}) });

  // --- the binding actually powers the real Social feature -------------------------------------
  applyEnv({ ...LIVE_ENV, EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE: "supabase-live" });
  const wired = createLoader();
  const wiredComposition = wired.fromRoot(COMPOSITION);
  const wiredBinding = wired.fromRoot(BINDING);
  const wiredFactories = wired.fromRoot(FACTORIES);
  const wiredResult = wiredComposition.createConsumerRuntimeComposition();
  const wiredDeps = wiredBinding.getSocialCandidateRuntimeDependencies();
  let repository = null;
  let repositoryError = null;
  try {
    repository = wiredFactories.createSocialCandidateRepository("supabase-live", true, wiredDeps);
  } catch (error) {
    repositoryError = error.message;
  }
  check("20. the wired live composition succeeds", wiredResult.ok === true, { errorCode: wiredResult.errorCode });
  check("21. the bound dependencies build the real live Social repository", repository !== null && repository.constructor.name === "SupabaseSocialCandidateRepository", { repositoryError, actual: repository?.constructor?.name });
  check("22. the real Social repository was built from the canonical client", wiredDeps.candidateClient === wired.createdClients[0]);
  check("23. building the Social repository creates no additional client", wired.createdClients.length === 1, { created: wired.createdClients.length });
  // Without the SR-2F binding the very same factory degrades to the disabled repository: this is
  // the precise behaviour SR-2F exists to change.
  const unbound = wiredFactories.createSocialCandidateRepository("supabase-live", true, {});
  check("23b. the same factory without the binding falls back to the disabled repository", unbound.constructor.name === "DisabledSocialCandidateRepository", { actual: unbound.constructor.name });

  // --- the feature flag, not the binding, decides which repository is active --------------------
  applyEnv({ ...LIVE_ENV, EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE: "disabled" });
  const gated = createLoader();
  const gatedComposition = gated.fromRoot(COMPOSITION);
  const gatedBinding = gated.fromRoot(BINDING);
  const gatedFlags = gated.fromRoot("apps/mobile/features/social-candidates/featureFlags.ts");
  gatedComposition.createConsumerRuntimeComposition();
  const gatedDeps = gatedBinding.getSocialCandidateRuntimeDependencies();
  const gatedFlagValue = gatedFlags.getSocialCandidateRuntimeFlags("supabase-live", true);
  const gatedFactories = gated.fromRoot(FACTORIES);
  const gatedRepository = gatedFactories.createSocialCandidateRepository("supabase-live", true, gatedDeps);
  check("24. dependencies are still bound when the Social flag is disabled", Object.keys(gatedDeps ?? {}).length === 2, { keys: Object.keys(gatedDeps ?? {}) });
  check("25. the Social flag independently reports a non-live source", gatedFlagValue.candidateSource !== "supabase-live", { gatedFlagValue });
  check("25b. the flag, not the binding, keeps the repository disabled", gatedRepository.constructor.name === "DisabledSocialCandidateRepository", { actual: gatedRepository.constructor.name });

  // --- binding is capability availability, not session state ------------------------------------
  applyEnv(LIVE_ENV);
  const repeat = createLoader();
  const repeatComposition = repeat.fromRoot(COMPOSITION);
  const repeatBinding = repeat.fromRoot(BINDING);
  repeatComposition.createConsumerRuntimeComposition();
  const firstBinding = repeatBinding.getSocialCandidateRuntimeDependencies();
  const firstAuthPort = firstBinding?.authPort ?? null;
  const secondResult = repeatComposition.createConsumerRuntimeComposition();
  const secondBinding = repeatBinding.getSocialCandidateRuntimeDependencies();
  check("26. a second composition also succeeds", secondResult.ok === true, { errorCode: secondResult.errorCode });
  check("27. the binding remains populated across compositions", Object.keys(secondBinding ?? {}).length === 2);
  check("28. the auth port is read live rather than snapshotted", typeof firstAuthPort?.getCurrentSession === "function");
  check("29. no session, token or actor identifier is stored in the binding", !Object.keys(secondBinding ?? {}).some((key) => /session|token|actor|user|jwt/i.test(key)), { keys: Object.keys(secondBinding ?? {}) });

  for (const key of MANAGED_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) if (MANAGED_KEYS.includes(key)) process.env[key] = value;

  const summary = Object.freeze({
    round: "SR-2F",
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2F", error: error.message, stack: error.stack?.split("\n").slice(0, 6) }, null, 2));
  process.exit(1);
}
