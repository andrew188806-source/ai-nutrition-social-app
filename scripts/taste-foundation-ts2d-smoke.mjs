#!/usr/bin/env node
// TS-2D contract smoke — LIVE TASTE FOUNDATION READ ACTIVATION.
//
// Executes the REAL production modules against a recording fake client: the live repository, the
// runtime flag resolution, the fail-closed factory and the frozen snapshot composition. No network,
// no Supabase client, no credential, no RPC, no Edge Function, no Production.
//
// The behaviours that matter most here are the ones a static read cannot prove:
//   * a permission failure stays `failed` and never collapses into `empty`
//   * a successful read of zero rows is `empty`, not `failed` and no longer `deferred`
//   * the query carries no user id — owner scoping is RLS's job
//   * the selected columns are exactly the approved set, so favourites/notes cannot leak in
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const moduleCache = new Map();
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
function loadTsFile(absolute) {
  const cached = moduleCache.get(absolute);
  if (cached) return cached.exports;
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolute
  });
  const module = { exports: {} };
  moduleCache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved relative import ${specifier}`);
    return loadTsFile(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const load = (relative) => loadTsFile(path.join(root, relative));

const mobileRoot = "apps/mobile/features/consumer-taste-profile";
const liveModule = load(`${mobileRoot}/adapters/supabaseConsumerTasteFoundationRepository.ts`);
const contracts = load(`${mobileRoot}/supabaseTasteFoundationContracts.ts`);
const flagsModule = load(`${mobileRoot}/featureFlags.ts`);
const factoriesModule = load(`${mobileRoot}/factories.ts`);
const serviceModule = load(`${mobileRoot}/consumerTasteProfileService.ts`);

const Repo = liveModule.SupabaseConsumerTasteFoundationRepository;
expect(typeof Repo === "function", "S0 the REAL live foundation repository loads");
expect(typeof flagsModule.getConsumerTasteProfileRuntimeFlags === "function", "S0 the REAL runtime flags load");
expect(typeof factoriesModule.createConsumerTasteProfileService === "function", "S0 the REAL factory loads");

// ---- recording fake client: captures every table + column list, returns a scripted response ------
const makeClient = (scripted) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, columns: null, filters: [] };
      calls.push(call);
      const builder = {
        select(columns) {
          call.columns = columns;
          return builder;
        },
        eq(column, value) {
          call.filters.push({ column, value });
          return builder;
        },
        is(column, value) {
          call.filters.push({ column, value });
          return builder;
        },
        then(resolve, reject) {
          const response = typeof scripted === "function" ? scripted(table) : scripted;
          return Promise.resolve(response).then(resolve, reject);
        }
      };
      return builder;
    }
  };
};

const PROFILE_ROW = {
  id: "tp-1", user_id: "user-a", preferred_cuisine_tags: ["japanese"], preferred_meal_types: ["lunch"],
  disliked_tastes: [], spice_preference: null, dining_style: null, payment_preference: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z"
};

// ================================ A. available / empty / failed ==================================
{
  const client = makeClient({ data: [PROFILE_ROW], error: null });
  const result = await new Repo(client).readCurrentUserTasteProfile();
  expect(result.status === "available" && result.rows.length === 1, "A1 rows present resolve to available", result.status);

  const emptyClient = makeClient({ data: [], error: null });
  const empty = await new Repo(emptyClient).readCurrentUserNutritionGoals();
  expect(empty.status === "empty", "A2 a successful read of zero rows resolves to EMPTY, not failed", empty.status);
  expect(empty.status !== "deferred", "A3 empty is no longer reported as deferred once live");
}

// ================================ B. permission failure != empty =================================
{
  const denied = makeClient({ data: null, error: { code: "42501", message: "permission denied for table taste_profiles" } });
  const result = await new Repo(denied).readCurrentUserTasteProfile();
  expect(result.status === "failed", "B1 a 42501 permission denial resolves to FAILED", result.status);
  expect(result.status !== "empty", "B2 a permission denial is never flattened into empty");
  expect(result.failureCode === "source_read_failed", "B3 the failure carries source_read_failed", result.failureCode);

  const thrown = { from() { throw new Error("network down"); } };
  const crashed = await new Repo(thrown).readCurrentUserDietaryRestrictions();
  expect(crashed.status === "failed", "B4 a thrown transport error resolves to FAILED", crashed.status);

  const malformed = makeClient({ data: { not: "an array" }, error: null });
  const bad = await new Repo(malformed).readCurrentUserNutritionGoals();
  expect(bad.status === "failed", "B5 a malformed payload resolves to FAILED, never available/empty", bad.status);
}

// ================================ C. exact tables and columns ===================================
{
  const client = makeClient({ data: [], error: null });
  const repo = new Repo(client);
  await repo.readCurrentUserTasteProfile();
  await repo.readCurrentUserNutritionGoals();
  await repo.readCurrentUserDietaryRestrictions();
  const tables = client.calls.map((call) => call.table);
  expect(
    JSON.stringify(tables) === JSON.stringify(["taste_profiles", "nutrition_goals", "dietary_restrictions"]),
    "C1 exactly the three allowlisted tables are queried, in order",
    tables
  );
  expect(
    client.calls[0].filters.length === 0
      && client.calls[1].filters.length === 0
      && JSON.stringify(client.calls[2].filters) === JSON.stringify([
        { column: "source_vocabulary_id", value: null }
      ]),
    "C2 no query carries a user id filter and Taste excludes governed Allergy rows"
  );
  expect(
    client.calls[0].columns === contracts.SUPABASE_TASTE_PROFILE_SELECT_COLUMNS &&
      client.calls[1].columns === contracts.SUPABASE_NUTRITION_GOAL_SELECT_COLUMNS &&
      client.calls[2].columns === contracts.SUPABASE_DIETARY_RESTRICTION_SELECT_COLUMNS,
    "C3 each read requests exactly its approved column list"
  );
  const allColumns = client.calls.map((call) => call.columns).join(",");
  expect(!/favorite_restaurant_ids|favorite_menu_item_ids/.test(allColumns), "C4 denormalized favourite ids are never selected");
  expect(!/health_notes|private_diet_notes|medical_sensitivity_notes/.test(allColumns), "C5 private note columns are never selected");
  expect(allColumns.includes("preferred_meal_types") && allColumns.includes("visibility"), "C6 approved TS-2A-C fields are present");
  expect(new Repo(client).source === "supabase-live", "C7 the repository reports the supabase-live source");
}

// ================================ D. activation gate ============================================
{
  const dev = { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true" };
  const live = flagsModule.getConsumerTasteProfileRuntimeFlags(dev);
  expect(live.foundationActivation === "live" && live.liveFoundationReadsEnabled === true, "D1 Development + live auth resolves to LIVE", live.foundationActivation);
  expect(live.sourceState === null, "D2 live activation carries no deferred placeholder state");
  expect(live.foundationSource === "supabase-live", "D3 live activation selects the supabase-live source");

  const prod = flagsModule.getConsumerTasteProfileRuntimeFlags({ ...dev, EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "production" });
  expect(prod.foundationActivation === "deferred" && prod.liveFoundationReadsEnabled === false, "D4 a non-development environment can NEVER resolve live", prod.foundationActivation);
  expect(prod.sourceState?.reason === "acl_activation_pending", "D5 non-live keeps the deferred placeholder");

  const noAuth = flagsModule.getConsumerTasteProfileRuntimeFlags({ ...dev, EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "mock" });
  expect(noAuth.foundationActivation === "deferred", "D6 a non-live auth source cannot resolve live", noAuth.foundationActivation);
  const authOff = flagsModule.getConsumerTasteProfileRuntimeFlags({ ...dev, EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "false" });
  expect(authOff.foundationActivation === "deferred" && authOff.issues.length > 0, "D7 disabled Supabase auth cannot resolve live and reports an issue");
  expect(flagsModule.getConsumerTasteProfileRuntimeFlags({}).foundationActivation === "deferred", "D8 an empty environment resolves to deferred (no live auth source)");
  // The environment key is deliberately unset in the repository's Development configuration, so an
  // absent value must resolve exactly as the canonical launcher resolves it — development — while
  // an explicit non-development value must still be refused.
  const absentEnvironment = flagsModule.getConsumerTasteProfileRuntimeFlags({
    EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
    EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true"
  });
  expect(absentEnvironment.foundationActivation === "live", "D9 an absent environment key resolves as development, matching the launcher", absentEnvironment.foundationActivation);
  expect(
    flagsModule.getConsumerTasteProfileRuntimeFlags({ ...dev, EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "staging" }).foundationActivation === "deferred",
    "D10 any explicit non-development environment is still refused"
  );
}

// ================================ E. fail-closed factory ========================================
{
  const dev = { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true" };
  const base = {
    authPort: { getCurrentSession: async () => ({ ok: true, value: null }) },
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) },
    favoriteService: { listCurrentUserFavorites: async () => ({ status: "empty", records: [], nextCursor: null, source: "mock" }) },
    ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [], source: "mock" }) },
    clock: { now: () => "2026-08-08T12:00:00.000Z" }
  };
  let threw = false;
  try {
    factoriesModule.createConsumerTasteProfileService({ ...base, env: dev });
  } catch {
    threw = true;
  }
  expect(threw, "E1 live activation WITHOUT the existing client throws — never a silent deferred fallback");

  const withClient = factoriesModule.createConsumerTasteProfileService({ ...base, env: dev, existingSupabaseClient: makeClient({ data: [], error: null }) });
  expect(Boolean(withClient), "E2 live activation WITH the existing client constructs the service");
  const deferredService = factoriesModule.createConsumerTasteProfileService({ ...base, env: {} });
  expect(Boolean(deferredService), "E3 a deferred runtime still constructs through the prepared seam");
}

// ================================ F. composed snapshot source states =============================
{
  const request = { mealWindow: { startDate: "2026-08-01", endDate: "2026-08-08", limit: 10 }, favoritePageSize: 10 };
  const session = { ok: true, value: { user: { userId: "user-a", provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-01-01T00:00:00Z" }, provider: "mock", issuedAt: "2026-08-08T00:00:00Z" } };
  const build = (scripted) => new serviceModule.ConsumerTasteProfileService({
    authPort: { getCurrentSession: async () => session },
    foundationRepository: new Repo(makeClient(scripted)),
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) },
    favoriteService: { listCurrentUserFavorites: async () => ({ status: "empty", records: [], nextCursor: null, source: "mock" }) },
    ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [], source: "mock" }) },
    clock: { now: () => "2026-08-08T12:00:00.000Z" }
  });

  const emptyService = build({ data: [], error: null });
  emptyService.setActor("user-a", 1);
  const emptyResult = await emptyService.readCurrentUserSnapshot(request);
  expect(emptyResult.status === "available", "F1 a live empty foundation still composes a snapshot", emptyResult.status);
  const emptyStates = emptyResult.snapshot.sourceStates;
  expect(
    ["taste_profile", "nutrition_goals", "dietary_restrictions"].every((name) => emptyStates[name].status === "empty"),
    "F2 all three foundation sources resolve to EMPTY — no longer deferred",
    Object.fromEntries(["taste_profile", "nutrition_goals", "dietary_restrictions"].map((n) => [n, emptyStates[n].status]))
  );
  expect(
    ["taste_profile", "nutrition_goals", "dietary_restrictions"].every((name) => emptyStates[name].status !== "deferred"),
    "F3 acl_activation_pending is gone from the live composition"
  );
  expect(emptyResult.snapshot.subjectUserId === "user-a", "F4 subjectUserId is the authenticated actor");
  expect(emptyResult.snapshot.generatedAt === "2026-08-08T12:00:00.000Z", "F5 generatedAt is the injected deterministic clock");

  const deniedService = build({ data: null, error: { code: "42501", message: "permission denied" } });
  deniedService.setActor("user-a", 1);
  const deniedResult = await deniedService.readCurrentUserSnapshot(request);
  expect(
    ["taste_profile", "nutrition_goals", "dietary_restrictions"].every((name) => deniedResult.snapshot.sourceStates[name].status === "failed"),
    "F6 a live permission denial surfaces as FAILED source states, not empty"
  );
  expect(
    deniedResult.snapshot.sourceStates.meals.status === "empty" && deniedResult.snapshot.sourceStates.ratings.status === "empty",
    "F7 a failed foundation source does not abort the behavioural sources"
  );

  const availableService = build((table) => table === "taste_profiles" ? { data: [PROFILE_ROW], error: null } : { data: [], error: null });
  availableService.setActor("user-a", 1);
  const availableResult = await availableService.readCurrentUserSnapshot(request);
  expect(availableResult.snapshot.sourceStates.taste_profile.status === "available", "F8 a live row resolves to AVAILABLE");
  expect(availableResult.snapshot.preferences.length > 0, "F9 live preference evidence reaches the snapshot");
  expect(
    !JSON.stringify(availableResult.snapshot).includes("favorite_restaurant_ids"),
    "F10 no denormalized favourite field reaches the snapshot"
  );
}

// ================================ G. actor isolation ============================================
{
  const request = { mealWindow: { startDate: "2026-08-01", endDate: "2026-08-08", limit: 10 }, favoritePageSize: 10 };
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let first = true;
  const service = new serviceModule.ConsumerTasteProfileService({
    authPort: { getCurrentSession: async () => ({ ok: true, value: { user: { userId: "user-a", provider: "mock", isAnonymous: false, emailVerified: true, createdAt: "2026-01-01T00:00:00Z" }, provider: "mock", issuedAt: "2026-08-08T00:00:00Z" } }) },
    foundationRepository: {
      source: "supabase-live",
      readCurrentUserTasteProfile: async () => first ? (first = false, pending) : ({ status: "empty", rows: [] }),
      readCurrentUserNutritionGoals: async () => ({ status: "empty", rows: [] }),
      readCurrentUserDietaryRestrictions: async () => ({ status: "empty", rows: [] })
    },
    mealRecordsService: { listCurrentUserMealRecords: async () => ({ ok: true, value: [] }) },
    favoriteService: { listCurrentUserFavorites: async () => ({ status: "empty", records: [], nextCursor: null, source: "mock" }) },
    ratingService: { listCurrentUserRatings: async () => ({ status: "available", records: [], source: "mock" }) },
    clock: { now: () => "2026-08-08T12:00:00.000Z" }
  });
  service.setActor("user-a", 1);
  const inFlight = service.readCurrentUserSnapshot(request);
  await new Promise((resolve) => setImmediate(resolve));
  service.setActor("user-b", 2);
  release({ status: "empty", rows: [] });
  const result = await inFlight;
  expect(result.status === "stale", "G1 an actor switch mid-read rejects the stale result for the arriving actor", result.status);
  expect(result.snapshot === undefined, "G2 no snapshot is handed to the arriving actor");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "taste-foundation-ts2d",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (failed.length) process.exit(1);
