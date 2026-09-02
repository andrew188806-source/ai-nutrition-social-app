#!/usr/bin/env node
// MI-E-C5-R7-C4-R1 contract smoke — LIVE Supabase consumer client composition.
//
// Executes the REAL production modules: the shared consumer-auth flag authority, the real
// SupabaseConsumerClientFactory, and the real Restaurant Catalog / Favorites / Ratings compositions.
// Only platform-native modules (AsyncStorage, the Supabase SDK) are stubbed, because they cannot
// load outside a React Native runtime — every flag and composition decision under test is the real
// production code path.
//
// Fully local: no network, no Supabase project, no credential, no RPC.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const requireFromRoot = createRequire(path.join(root, "package.json"));
const ts = requireFromRoot("typescript");

let createClientCalls = 0;
// Platform stubs. Named explicitly so nothing else can be silently replaced.
const NATIVE_STUBS = {
  "@react-native-async-storage/async-storage": {
    default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined }
  },
  "react-native": { AppState: { addEventListener: () => ({ remove: () => undefined }), currentState: "active" } },
  // Counted, so a composition that constructs a live client when it should not is observable.
  "@supabase/supabase-js": {
    createClient: () => {
      createClientCalls += 1;
      return { auth: {}, from: () => ({ select: () => ({}) }) };
    }
  },
  // Side-effect-only React Native polyfill; nothing under test reads from it.
  "react-native-url-polyfill/auto": {}
};
// Mobile-scoped resolution for packages installed under apps/mobile rather than the workspace root.
const requireFromMobile = createRequire(path.join(root, "apps/mobile/package.json"));
const requireBare = (id) => {
  if (Object.hasOwn(NATIVE_STUBS, id)) return NATIVE_STUBS[id];
  // Workspace alias, resolved by Metro/tsconfig rather than Node. Mirrors tsconfig.base.json:
  //   "@haocu/shared": ["packages/shared/src"], "@haocu/shared/*": ["packages/shared/src/*"]
  if (id === "@haocu/shared" || id.startsWith("@haocu/shared/")) {
    const rest = id === "@haocu/shared" ? "" : id.slice("@haocu/shared/".length);
    const base = path.join(root, "packages/shared/src", rest);
    for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate)) return loadTs(path.relative(root, candidate));
    }
  }
  try {
    return requireFromRoot(id);
  } catch {
    return requireFromMobile(id);
  }
};

const moduleCache = new Map();
function loadTs(relative) {
  const resolved = path.resolve(root, relative);
  if (moduleCache.has(resolved)) return moduleCache.get(resolved);
  const source = fs.readFileSync(resolved, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.None },
    fileName: relative
  });
  const module = { exports: {} };
  moduleCache.set(resolved, module.exports);
  const localRequire = (id) => {
    if (!id.startsWith(".")) return requireBare(id);
    const base = path.resolve(path.dirname(resolved), id);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate)) return loadTs(path.relative(root, candidate));
    }
    throw new Error(`unresolved ${id} from ${relative}`);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  moduleCache.set(resolved, module.exports);
  return module.exports;
}

const AUTH_FLAGS = "apps/mobile/features/consumer-auth/featureFlags.ts";
const HELPER = "apps/mobile/features/consumer-auth/liveClientCompositionFlags.ts";
const SUPA_ENV = "apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts";
const FACTORY = "apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts";
const CATALOG_COMPOSITION = "apps/mobile/features/restaurants/catalog/composition.ts";
const FAVORITE_COMPOSITION = "apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts";
const RATING_COMPOSITION = "apps/mobile/features/consumer-ratings/consumerRatingComposition.ts";

const flagsMod = loadTs(AUTH_FLAGS);
const helper = loadTs(HELPER);
const envMod = loadTs(SUPA_ENV);
const factoryMod = loadTs(FACTORY);

expect(typeof helper.deriveLiveSupabaseClientFlags === "function", "H0 the shared live-client flag helper loads");
expect(typeof helper.withoutObsoleteConsumerWritesIssue === "function", "H0 the shared capability-issue helper loads");

// ---- exact public Development identity; fake public key; no network --------------------------
const DEV_ENV = Object.freeze({
  EXPO_PUBLIC_SUPABASE_URL: "https://msbgnnoorsoefuiwluye.supabase.co",
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "local-test-publishable-value",
  EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE: "supabase-live",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "true",
  EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE: "supabase"
});
const withEnv = (over) => ({ ...DEV_ENV, ...over });

// =============================================================================================
// A. Shared helper semantics
// =============================================================================================
{
  const raw = flagsMod.getConsumerRuntimeFlags(DEV_ENV);
  const live = helper.deriveLiveSupabaseClientFlags(raw);
  expect(raw.supabaseWritesEnabled === true, "A raw product flags really do enable consumer writes");
  expect(raw.issues.includes(helper.CONSUMER_PHASE_1D_WRITES_ISSUE), "A raw flags carry the obsolete Phase 1D statement");
  expect(live.issues.length === 0, "A construction flags drop the obsolete Phase 1D statement", live.issues);
  expect(live.supabaseWritesEnabled === false, "A construction flags clear the factory-facing writes gate");
  expect(live.authSource === raw.authSource, "A auth source is preserved");
  expect(live.profileSource === raw.profileSource, "A profile source is preserved");
  expect(live.supabaseAuthEnabled === raw.supabaseAuthEnabled, "A supabaseAuthEnabled is preserved");
  expect(raw.supabaseWritesEnabled === true && raw.issues.length === 1, "A the caller's own capability flags are NOT mutated");
}
{
  // Unrelated issues must survive, so a genuinely misconfigured runtime still fails closed.
  const misconfigured = flagsMod.getConsumerRuntimeFlags(
    withEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "false" })
  );
  const live = helper.deriveLiveSupabaseClientFlags(misconfigured);
  expect(live.issues.length > 0, "A an unrelated configuration issue is retained", live.issues);
  expect(!live.issues.includes(helper.CONSUMER_PHASE_1D_WRITES_ISSUE), "A only the obsolete statement is dropped");
}
{
  const noWrites = flagsMod.getConsumerRuntimeFlags(withEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false" }));
  expect(helper.deriveLiveSupabaseClientFlags(noWrites) === noWrites, "A writes-disabled flags pass through by identity (no needless copy)");
}
{
  const mock = flagsMod.getConsumerRuntimeFlags({ EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "mock" });
  const live = helper.deriveLiveSupabaseClientFlags(mock);
  expect(live.authSource === "mock", "A a mock runtime is never normalized into a live one");
}

// =============================================================================================
// B. Real factory behaviour through the helper
// =============================================================================================
const buildClient = (env, flagsOverride) => {
  const raw = flagsMod.getConsumerRuntimeFlags(env);
  const flags = flagsOverride ?? helper.deriveLiveSupabaseClientFlags(raw);
  const factory = new factoryMod.SupabaseConsumerClientFactory({
    env: envMod.getSupabaseConsumerEnvironment(env),
    flags,
    storage: {},
    sdkLoader: () => ({ auth: {} })
  });
  try {
    return { ok: true, client: factory.getOrCreateClient().client };
  } catch (error) {
    return { ok: false, error: error.constructor.name };
  }
};
{
  expect(buildClient(DEV_ENV).ok, "B Development live flags construct a client through the helper");
  const rawAttempt = buildClient(DEV_ENV, flagsMod.getConsumerRuntimeFlags(DEV_ENV));
  expect(!rawAttempt.ok, "B raw flags still fail — the factory gates are intact, not removed", rawAttempt.error);
  expect(!buildClient(withEnv({ EXPO_PUBLIC_SUPABASE_URL: "", EXPO_PUBLIC_SUPABASE_ANON_KEY: "" })).ok,
    "B missing URL and key still fail closed");
  expect(!buildClient(withEnv({ EXPO_PUBLIC_SUPABASE_ANON_KEY: "" })).ok, "B a missing publishable key still fails closed");
  expect(!buildClient(withEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "false" })).ok,
    "B live auth without auth enabled still fails closed");
  expect(!buildClient({ EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "mock" }).ok, "B mock mode does not construct a live client");
  expect(!buildClient({ EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-disabled" }).ok,
    "B disabled mode does not construct a live client");
}

// =============================================================================================
// C. The physical blocker: Restaurant Catalog composition
// =============================================================================================
{
  const catalog = loadTs(CATALOG_COMPOSITION);
  const runtime = catalog.createMobileRestaurantCatalogComposition(DEV_ENV);
  expect(runtime.flags.source === "supabase", "C catalog source resolves to supabase", runtime.flags.source);
  expect(runtime.flags.issues.length === 0, "C catalog flags carry no issues", runtime.flags.issues);
  const repositoryName = runtime.repository?.constructor?.name;
  expect(repositoryName === "SupabaseRestaurantCatalogRepository",
    "C the REAL Supabase catalog repository is selected", repositoryName);
  expect(repositoryName !== "DisabledRestaurantCatalogRepository",
    "C the disabled fallback that broke the device is NOT selected", repositoryName);
  expect(Boolean(runtime.service), "C a catalog service is composed");
}
{
  // Still fails closed when it genuinely should.
  const catalog = loadTs(CATALOG_COMPOSITION);
  const broken = catalog.createMobileRestaurantCatalogComposition(withEnv({ EXPO_PUBLIC_SUPABASE_URL: "", EXPO_PUBLIC_SUPABASE_ANON_KEY: "" }));
  expect(broken.repository?.constructor?.name === "DisabledRestaurantCatalogRepository",
    "C missing credentials still degrade to the disabled catalog repository");
  // A non-supabase catalog source must SHORT-CIRCUIT before any client is constructed. Asserting the
  // repository alone is not enough — the factory routes by source either way, so the only way to see
  // a lost early-exit is to observe whether a live client was built at all.
  createClientCalls = 0;
  const mockCatalog = catalog.createMobileRestaurantCatalogComposition(
    withEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE: "mock" })
  );
  expect(mockCatalog.repository?.constructor?.name === "MockRestaurantCatalogRepository",
    "C an explicit mock catalog source still yields the mock repository");
  expect(createClientCalls === 0,
    "C a non-supabase catalog source constructs NO live Supabase client (early exit preserved)", createClientCalls);
  createClientCalls = 0;
  catalog.createMobileRestaurantCatalogComposition(DEV_ENV);
  expect(createClientCalls > 0, "C the supabase catalog source really does construct a live client", createClientCalls);
}

// =============================================================================================
// D. Favorites and Ratings compositions
// =============================================================================================
{
  const favorites = loadTs(FAVORITE_COMPOSITION);
  const composed = favorites.createMobileConsumerFavoriteComposition(
    withEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "supabase" })
  );
  expect(Boolean(composed.authPort), "D favorites composes a live auth port under Development live flags");
  expect(composed.authPort?.constructor?.name === "SupabaseConsumerAuthAdapter",
    "D favorites uses the Supabase auth adapter, not a mock/disabled one", composed.authPort?.constructor?.name);
}
{
  const ratings = loadTs(RATING_COMPOSITION);
  const composed = ratings.createMobileConsumerRatingComposition(
    withEnv({ EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE: "supabase" })
  );
  expect(Boolean(composed), "D ratings composes under Development live flags without throwing");
}

// =============================================================================================
// E. Launcher preflight contract (source-level, plus real fail-closed execution in the guard)
// =============================================================================================
{
  const launcher = fs.readFileSync(path.join(root, "scripts/start-mobile.mjs"), "utf8");
  const code = launcher.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  expect(/const PUBLIC_PREFIX = "EXPO_PUBLIC_";/.test(code), "E launcher forwards only the public EXPO_PUBLIC_ namespace");
  expect(/if \(!name\.startsWith\(PUBLIC_PREFIX\)\) continue;/.test(code), "E non-public variables are skipped explicitly");
  expect(/process\.exit\(1\)/.test(code), "E launcher fails closed with a non-zero exit");
  expect(/preflightErrors/.test(code), "E launcher has an explicit preflight error path");
  expect(!/writeFileSync|mkdirSync|appendFileSync/.test(code), "E launcher never writes a file");
  expect(/cwd: mobileRoot/.test(code), "E launcher still starts Expo from apps/mobile");
  expect(/\.\.\.Object\.fromEntries\(forwarded\)/.test(code), "E forwarded values reach the Expo child process env");
  // No value is ever interpolated into console output.
  const printed = code.match(/console\.(log|error)\([^\n]*\)/g) ?? [];
  const leaks = printed.filter((line) => /\$\{(url|publishableKey|value)\}/.test(line));
  expect(leaks.length === 0, "E launcher never prints a credential value", leaks);
  expect(/present/.test(code) && /MISSING/.test(code), "E launcher reports credentials as present/missing only");
  expect(/environment !== "development"/.test(code), "E launcher refuses a non-development environment");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "consumer-live-client-composition-mi-e-c5-r7-c4-r1",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
