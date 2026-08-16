#!/usr/bin/env node
// SR-2F meaningful mutation contract. Mutants execute in memory; repository bytes are never changed.
// Every mutation targets the runtime authority of SR-2F's delta — which object is handed to the
// Social feature, and when — never a type alias or a comment, which carry no runtime effect.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2F_COMPOSITION } from "./social-candidate-sr2f-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const COMPOSITION_ABS = path.join(root, SR2F_COMPOSITION);
const BINDING = "apps/mobile/features/social-candidates/runtimeBinding.ts";
const FACTORIES = "apps/mobile/features/social-candidates/factories.ts";

const CANONICAL_BIND = `      bindSocialCandidateRuntimeDependencies({
        authPort,
        candidateClient: client as unknown as SupabaseSocialCandidateClientLike
      });
`;
const GUARD_LINE = `      if (!runtimeParts) return { ok: false, errorCode: "configuration_error" };\n`;

const LIVE_ENV = Object.freeze({
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://smoke.placeholder.invalid",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_smoke_placeholder",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SOCIAL_CANDIDATE_SOURCE: "supabase-live"
});

function clearEnv() {
  for (const key of Object.keys(process.env)) if (key.startsWith("EXPO_PUBLIC_TASTKIND_CONSUMER") || key.startsWith("EXPO_PUBLIC_SUPABASE")) delete process.env[key];
}

// --- in-memory module graph -------------------------------------------------------------------
function createGraph(mutate) {
  const created = [];
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
  const supabaseSdk = {
    createClient: (url, key, options) => {
      const client = {
        url, key, options,
        auth: { __sentinel: "auth-client" },
        functions: { invoke: async () => ({ data: null, error: null }) },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) })
      };
      created.push(client);
      return client;
    },
    processLock: (_name, _timeout, fn) => fn()
  };
  const externalStubs = new Map([
    ["@supabase/supabase-js", supabaseSdk],
    ["react/jsx-runtime", { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" }],
    ["react-native", new Proxy({
      StyleSheet: { create: (styles) => styles },
      Platform: { OS: "ios", select: (spec) => spec.ios },
      AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) }
    }, { get: (target, key) => (key in target ? target[key] : String(key)) })],
    ["react-native-url-polyfill/auto", {}],
    ["@react-native-async-storage/async-storage", { __esModule: true, default: asyncStorageApi, ...asyncStorageApi }]
  ]);
  function externalStub(specifier) {
    if (externalStubs.has(specifier)) return externalStubs.get(specifier);
    try { return require_(specifier); } catch {
      const stub = new Proxy(function inert() { return undefined; }, {
        get: (_t, key) => (key === "default" ? stub : (key === "__esModule" ? true : stub)),
        apply: () => undefined, construct: () => ({})
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
    let source = fs.readFileSync(absolute, "utf8");
    if (absolute === COMPOSITION_ABS && mutate) source = mutate(source);
    const { outputText } = ts.transpileModule(source, {
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
  return { created, fromRoot: (relative) => load(path.join(root, relative)) };
}

// --- the SR-2F contract -------------------------------------------------------------------------
// Returns the list of violated invariants. A canonical graph must violate none; a mutant that
// violates none has survived, which is a real defect in this suite.
function violations(mutate) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };

  try {
    // Live: the exact canonical dependencies, exactly once, only after a successful composition.
    clearEnv();
    Object.assign(process.env, LIVE_ENV);
    const live = createGraph(mutate);
    const liveComposition = live.fromRoot(SR2F_COMPOSITION);
    const liveBinding = live.fromRoot(BINDING);
    const liveFactories = live.fromRoot(FACTORIES);
    const preCompositionBinding = liveBinding.getSocialCandidateRuntimeDependencies();
    record("nothing is bound before a composition runs", Object.keys(preCompositionBinding ?? {}).length === 0);

    const result = liveComposition.createConsumerRuntimeComposition();
    const bound = liveBinding.getSocialCandidateRuntimeDependencies();
    record("live composition succeeds", result.ok === true);
    record("exactly one client is created", live.created.length === 1);
    record("binding has exactly the two canonical keys", JSON.stringify(Object.keys(bound ?? {}).sort()) === JSON.stringify(["authPort", "candidateClient"]));
    record("bound client is the canonical singleton", bound?.candidateClient === live.created[0]);
    record("bound authPort is the canonical instance", result.ok && bound?.authPort === result.value.controller.options.authPort);
    record("bound authPort wraps the bound client's auth surface", bound?.authPort?.authClient === live.created[0]?.auth);
    const repository = liveFactories.createSocialCandidateRepository("supabase-live", true, bound ?? {});
    record("the live repository is the real Supabase repository", repository.constructor.name === "SupabaseSocialCandidateRepository");

    // Mock: nothing may be bound.
    clearEnv();
    process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE = "mock";
    process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE = "mock";
    const mock = createGraph(mutate);
    const mockComposition = mock.fromRoot(SR2F_COMPOSITION);
    const mockBinding = mock.fromRoot(BINDING);
    mockComposition.createConsumerRuntimeComposition();
    record("a mock composition binds nothing", Object.keys(mockBinding.getSocialCandidateRuntimeDependencies() ?? {}).length === 0);
    record("a mock composition creates no client", mock.created.length === 0);

    // A live composition that fails after the client exists must still bind nothing.
    clearEnv();
    Object.assign(process.env, LIVE_ENV);
    const broken = createGraph(mutate);
    const brokenComposition = broken.fromRoot(SR2F_COMPOSITION);
    const brokenBinding = broken.fromRoot(BINDING);
    const brokenResult = brokenComposition.createConsumerRuntimeComposition({ mealFlags: { authSource: "mock", issues: [] } });
    record("a live composition with an unusable meal runtime fails", brokenResult.ok === false);
    record("a failed live composition binds nothing", Object.keys(brokenBinding.getSocialCandidateRuntimeDependencies() ?? {}).length === 0);
  } catch (error) {
    failed.push(`contract threw: ${error.message}`);
  } finally {
    clearEnv();
  }
  return failed;
}

// --- mutants --------------------------------------------------------------------------------
const mutants = [
  {
    name: "the binding call is removed entirely",
    apply: (source) => source.replace(CANONICAL_BIND, "")
  },
  {
    name: "the binding runs before the runtime parts guard, so a failed composition still binds",
    // The guard line appears in all three branches, so the live branch is located first and the
    // binding is re-inserted ahead of that branch's own guard.
    apply: (source) => {
      const without = source.replace(CANONICAL_BIND, "");
      const liveIndex = without.indexOf('if (capabilityFlags.authSource === "supabase-live")');
      if (liveIndex < 0) return source;
      const guardIndex = without.indexOf(GUARD_LINE, liveIndex);
      if (guardIndex < 0) return source;
      return `${without.slice(0, guardIndex)}${CANONICAL_BIND}${without.slice(guardIndex)}`;
    }
  },
  {
    name: "Social receives a freshly constructed auth adapter instead of the canonical one",
    apply: (source) => source.replace(
      "        authPort,\n        candidateClient: client as unknown as SupabaseSocialCandidateClientLike",
      "        authPort: new SupabaseConsumerAuthAdapter({ authClient: client.auth, transportEnabled: true }),\n        candidateClient: client as unknown as SupabaseSocialCandidateClientLike")
  },
  {
    name: "Social receives a second client from a second factory",
    apply: (source) => source.replace(
      "        candidateClient: client as unknown as SupabaseSocialCandidateClientLike",
      "        candidateClient: new SupabaseConsumerClientFactory({ env: getSupabaseConsumerEnvironment(), flags: authFlags, storage, sdkLoader: createOfficialSupabaseConsumerSdkLoader() }).getOrCreateClient().client as unknown as SupabaseSocialCandidateClientLike")
  },
  {
    name: "Social receives the auth surface rather than the client",
    apply: (source) => source.replace(
      "        candidateClient: client as unknown as SupabaseSocialCandidateClientLike",
      "        candidateClient: client.auth as unknown as SupabaseSocialCandidateClientLike")
  },
  {
    name: "the binding is emptied so the feature silently falls back to disabled",
    apply: (source) => source.replace(CANONICAL_BIND, "      bindSocialCandidateRuntimeDependencies({});\n")
  },
  {
    name: "the binding is hoisted to module scope, so it happens without a live composition",
    apply: (source) => source.replace(
      "export function createConsumerRuntimeComposition(",
      "bindSocialCandidateRuntimeDependencies({ authPort: {} as never, candidateClient: {} as never });\n\nexport function createConsumerRuntimeComposition(")
  },
  {
    name: "the mock branch binds the Social feature too",
    apply: (source) => source.replace(
      "    const storage = options.operationStorage ?? createAsyncStorageConsumerAuthStorage();\n    const scaffold = createConsumerAuthScaffold({ flags: authFlags, storage });",
      "    const storage = options.operationStorage ?? createAsyncStorageConsumerAuthStorage();\n    const scaffold = createConsumerAuthScaffold({ flags: authFlags, storage });\n    bindSocialCandidateRuntimeDependencies({ authPort: scaffold.authPort, candidateClient: {} as never });")
  }
];

const canonicalSource = fs.readFileSync(COMPOSITION_ABS, "utf8");
const results = [];

const canonicalViolations = violations(null);
results.push({
  name: "canonical composition satisfies the exact SR-2F contract",
  applied: true,
  killed: canonicalViolations.length === 0,
  status: canonicalViolations.length === 0 ? "killed" : "survived",
  violations: canonicalViolations
});

for (const mutant of mutants) {
  const mutated = mutant.apply(canonicalSource);
  const applied = mutated !== canonicalSource;
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  const failed = applied ? violations(() => mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({
    name: mutant.name,
    applied,
    killed,
    status: killed ? "killed" : "survived",
    violations: failed.slice(0, 4)
  });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${mutant.name}`);
}

const survivors = results.filter((entry) => entry.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2f-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  survivors
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
