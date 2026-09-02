#!/usr/bin/env node
// Local integration: real compositions, Auth/Profile, Recommendation policies/readers, route
// callbacks and canonical meal-write runtime. Only native/SDK transport is fake; no credentials,
// dotenv, network, database, emitted JS, or repository artifacts are used.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function expect(pass, name, detail) {
  checks.push({ name, pass: Boolean(pass) });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}
const mobile = "apps/mobile/features/";
const compositionPath = mobile + "next-meal-prototype/canonicalNextMealPrototypeComposition.ts";
const providerPath = mobile + "next-meal-prototype/canonicalNextMealPrototypeProvider.ts";
const runtimePath = mobile + "consumer-runtime/consumerRuntimeComposition.ts";
// Regression mutants alter only the in-memory compiler input, never repository files.
const mutationKey = process.argv.find((arg) => arg.startsWith("--mutation="))?.slice(11);
const mutations = {
  raw_auth: [compositionPath, "deriveLiveSupabaseClientFlags(getConsumerRuntimeFlags())", "getConsumerRuntimeFlags()"],
  raw_read: [providerPath, "createConsumerNextMealRecommendationService(recommendationReadFlags(), dependencies)",
    "createConsumerNextMealRecommendationService(undefined, dependencies)"],
  raw_feedback: [mobile + "consumer-recommendation-feedback/consumerRecommendationFeedbackComposition.ts",
    "deriveLiveSupabaseClientFlags(getConsumerRuntimeFlags(env))", "getConsumerRuntimeFlags(env)"]
};
if (mutationKey && !Object.hasOwn(mutations, mutationKey)) throw new Error("Unknown integration mutation");
let mutationHits = 0;
const prefix = "EXPO_PUBLIC_TASTKIND_CONSUMER_";
const devUrl = "https://msbgnnoorsoefuiwluye.supabase.co";
const publicKey = "LOCAL_PUBLIC_TEST_SENTINEL_NOT_A_CREDENTIAL";
const liveEnv = Object.freeze({
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development",
  [prefix + "AUTH_SOURCE"]: "supabase-live", [prefix + "PROFILE_SOURCE"]: "supabase-live",
  [prefix + "SUPABASE_AUTH_ENABLED"]: "true", [prefix + "SUPABASE_WRITES_ENABLED"]: "true",
  [prefix + "SUPABASE_URL"]: devUrl, [prefix + "SUPABASE_PUBLISHABLE_KEY"]: publicKey,
  [prefix + "MEAL_RECORDS_SOURCE"]: "supabase-live",
  [prefix + "DAILY_NUTRITION_SOURCE"]: "supabase-live",
  [prefix + "DAILY_NUTRITION_LIVE_READ_OPT_IN"]: "true",
  [prefix + "MEAL_RECORD_WRITES_ENABLED"]: "true",
  [prefix + "MEAL_RECORD_LIVE_WRITE_OPT_IN"]: "true",
  [prefix + "NEXT_MEAL_RECOMMENDATION_SOURCE"]: "supabase"
});
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = uid(1);
const timestamp = new Date().toISOString();
const fixtureSession = { user: { id: actor, email: "local@example.invalid", created_at: timestamp,
  app_metadata: { provider: "email" } },
  access_token: "LOCAL_SESSION_SENTINEL", refresh_token: "LOCAL_REFRESH_SENTINEL", expires_at: 4102444800 };
const events = [];
const unexpected = [];
const deny = (name) => { unexpected.push(name); throw new Error(`Forbidden external boundary: ${name}`); };
let session = fixtureSession;
let sdkCalls = 0;
let mealRows = [];
let geoMode = "available";
let allergyMode = "active";
let avoidanceMode = "active";
let failView = null;
const row = (n, name, calories = 500) => ({ candidate_id: uid(n), restaurant_id: uid(100),
  branch_id: uid(200 + n), menu_item_id: uid(300 + n), meal_name: name,
  restaurant_name: "Local fixture", branch_name: name, district: null, public_image_url: null,
  calories, protein: 25, carbohydrates: 50, fat: 15, fiber: 5,
  nutrition_source_public: "restaurant_verified", nutrition_updated_at: timestamp, availability: "available" });
const candidates = [row(10, "outside-geo"), row(11, "allergy-conflict"), row(12, "avoidance-conflict"),
  row(13, "eligible-a", 600), row(14, "eligible-b", 400), row(15, "unknown-coverage"), row(16, "partial-coverage")];
const geoRows = candidates.slice(1);
const survivorIds = [uid(13), uid(14)];
const profile = { id: uid(2), user_id: actor, display_name: "Local actor", timezone: "Asia/Taipei",
  lifecycle_status: "active", created_at: timestamp, updated_at: timestamp };
const memory = new Map();
const storage = { getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); }, removeItem: async (key) => { memory.delete(key); } };
const modules = new Map();
const sandbox = vm.createContext({ process: { env: {} }, console, Request, Response, Headers, URL,
  setTimeout, clearTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
  crypto: { randomUUID }, fetch: () => deny("fetch") });
const native = {
  "@react-native-async-storage/async-storage": { default: storage },
  "react-native": { Platform: { OS: "web" }, AppState: { currentState: "active",
    addEventListener: () => ({ remove() {} }) } },
  "react-native-url-polyfill/auto": {}, "expo-crypto": { randomUUID },
  "expo-file-system": { File: class { constructor() { deny("native file"); } }, Paths: {} },
  "@supabase/supabase-js": { createClient: (url, key) => {
    sdkCalls++;
    if (url !== devUrl || key !== publicKey) return deny("unexpected SDK configuration");
    return client;
  } }
};
const compile = (source, file) => ts.transpileModule(source, { fileName: file,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file) {
  const abs = path.resolve(root, file);
  if (modules.has(abs)) return modules.get(abs).exports;
  const module = { exports: {} }; modules.set(abs, module);
  const require = (id) => {
    if (Object.hasOwn(native, id)) return native[id];
    const stem = id.startsWith(".") ? path.resolve(path.dirname(abs), id)
      : id === "@haocu/shared" || id.startsWith("@haocu/shared/")
        ? path.join(root, "packages/shared/src", id.slice("@haocu/shared".length)) : null;
    if (!stem) throw new Error(`Unexpected module ${id}`);
    for (const name of [stem, stem + ".ts", stem + ".tsx", path.join(stem, "index.ts")]) {
      if (fs.existsSync(name) && fs.statSync(name).isFile()) return load(name);
    }
    throw new Error(`Unresolved module ${id}`);
  };
  let source = read(path.relative(root, abs));
  const mutation = mutations[mutationKey];
  if (mutation && path.resolve(root, mutation[0]) === abs) {
    if (source.split(mutation[1]).length !== 2) throw new Error("STALE_INTEGRATION_MUTATION");
    source = source.replace(mutation[1], mutation[2]); mutationHits++;
  }
  vm.runInContext(`(function(require,module,exports){${compile(source, abs)}\n})`, sandbox,
    { filename: file })(require, module, module.exports);
  // Observation only: always call the original production function with the original arguments.
  for (const name of ["rankNextMealCandidatesByNutrition", "composeDualLaneRecommendation"]) {
    if (typeof module.exports[name] !== "function") continue;
    const original = module.exports[name];
    module.exports[name] = (...args) => {
      const result = original(...args);
      events.push({ kind: name, ids: args[0].map((entry) => (entry.candidate ?? entry).candidateId) });
      return result;
    };
  }
  return module.exports;
}
const allergy = load("packages/shared/src/domain/candidate-allergen/index.ts");
const avoidance = load("packages/shared/src/domain/candidate-ingredient-avoidance/index.ts");
const taste = load("packages/shared/src/domain/candidate-taste/index.ts");
function settings(domain, mode) {
  if (mode === "unavailable") return { data: null, error: { message: "local authority unavailable" } };
  const isAllergy = domain === "allergy";
  return { error: null, data: {
    source_vocabulary_id: isAllergy ? allergy.PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_ID
      : avoidance.PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_ID,
    source_vocabulary_version: isAllergy ? allergy.PRIVATE_RESTRICTION_ALLERGEN_SOURCE_VOCABULARY_VERSION
      : avoidance.PRIVATE_INGREDIENT_AVOIDANCE_SOURCE_VOCABULARY_VERSION,
    taxonomy_id: isAllergy ? allergy.CANDIDATE_ALLERGEN_TAXONOMY_ID : avoidance.CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
    taxonomy_version: 1, unresolved_selection_count: mode === "unresolved" ? 1 : 0,
    [isAllergy ? "allergen_keys" : "ingredient_avoidance_keys"]: mode === "active" ? [isAllergy ? "peanut" : "pork"] : []
  } };
}
function evidence(domain, facts) {
  const isAllergy = domain === "allergen";
  return candidates.filter((entry) => !facts || entry.candidate_id === uid(isAllergy ? 11 : 12))
    .map((entry) => ({ ...entry,
      taxonomy_id: isAllergy ? allergy.CANDIDATE_ALLERGEN_TAXONOMY_ID : avoidance.CANDIDATE_INGREDIENT_AVOIDANCE_TAXONOMY_ID,
      taxonomy_version: 1, fact_domain: isAllergy ? "allergen_content" : "ingredient_avoidance_content",
      coverage_state: !isAllergy && entry.candidate_id === uid(15) ? "unknown"
        : !isAllergy && entry.candidate_id === uid(16) ? "partial" : "complete",
      ...(facts ? { [isAllergy ? "allergen_key" : "ingredient_avoidance_key"]: isAllergy ? "peanut" : "pork" } : {}) }));
}
function rowsFor(table) {
  if (table === "meal_records") return mealRows;
  if (table === "daily_nutrition_summaries") return [];
  if (table === "consumer_profiles") return [profile];
  if (table === "nutrition_goals") return [{ id: uid(3), user_id: actor, goal_label: "local",
    daily_calories_target: 2000, protein_target_g: 100, carbohydrates_target_g: 250, fat_target_g: 60,
    fiber_target_g: 25, starts_on: "2020-01-01", ends_on: null, is_active: true,
    created_at: timestamp, updated_at: timestamp }];
  if (table === "taste_profiles") return [{ id: uid(4), user_id: actor, preferred_cuisine_tags: [],
    preferred_meal_types: ["rice"], disliked_tastes: [], spice_preference: null, dining_style: null,
    payment_preference: null, created_at: timestamp, updated_at: timestamp }];
  if (table === "consumer_public_next_meal_candidates_v1") return candidates;
  if (table === "consumer_authenticated_next_meal_candidate_allergen_facts_v1") return evidence("allergen", true);
  if (table === "consumer_authenticated_next_meal_candidate_allergen_coverage_v1") return evidence("allergen", false);
  if (table === "consumer_authenticated_candidate_avoidance_facts_v1") return evidence("avoidance", true);
  if (table === "consumer_authenticated_candidate_avoidance_coverage_v1") return evidence("avoidance", false);
  if (table === "consumer_public_next_meal_candidate_taste_state_v1") return candidates.map((entry) => ({ ...entry,
    taxonomy_version: taste.CANDIDATE_TASTE_TAXONOMY_VERSION, mapping_state: "unknown", known_facet_keys: [],
    unknown_facet_keys: [...taste.CANDIDATE_TASTE_FACET_KEYS] }));
  if (["consumer_public_next_meal_candidate_taste_facts_v1", "consumer_private_taste_source_values_v1",
    "consumer_private_taste_normalization_dictionary_v1"].includes(table)) return [];
  return deny(`table ${table}`);
}
function query(table) {
  const event = { kind: "select", table, filters: [], ids: null }; events.push(event);
  let single = false;
  const q = {
    select() { return q; }, order() { return q; }, limit() { return q; }, range() { return q; },
    eq(key, value) { event.filters.push([key, value]); return q; },
    is(key, value) { event.filters.push([key, value]); return q; }, gte() { return q; }, lte() { return q; },
    in(key, values) { if (key !== "candidate_id") return deny(`filter ${key}`); event.ids = [...values]; return q; },
    maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    then(resolve, reject) {
      const rows = rowsFor(table).filter((entry) => !event.ids || event.ids.includes(entry.candidate_id));
      return Promise.resolve(table === failView ? { data: null, error: { message: "local read failure" } }
        : { data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
    }
  };
  return q;
}
const client = {
  auth: { getSession: async () => ({ data: { session }, error: null }),
    signInWithPassword: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    startAutoRefresh() {}, stopAutoRefresh() {} },
  from: query,
  functions: { invoke: async (name, options) => {
    if (name !== "next-meal-geo-candidates") return deny(`function ${name}`);
    events.push({ kind: "GEO", body: options.body });
    return geoMode === "failure" ? { data: null, error: { message: "local transport failure" } }
      : { error: null, data: { version: "next-meal-geo-v1", status: geoMode === "empty" ? "empty" : "available",
        geoCandidateCount: geoMode === "empty" ? 0 : geoRows.length, candidates: geoMode === "empty" ? [] : geoRows } };
  } },
  rpc: async (name, args) => {
    events.push({ kind: "rpc", name, args, actor: session?.user.id });
    if (name === "read_authenticated_allergy_settings_v1") return settings("allergy", allergyMode);
    if (name === "read_authenticated_ingredient_avoidance_settings_v1") return settings("avoidance", avoidanceMode);
    if (name !== "create_current_user_meal_record_v2") return deny(`rpc ${name}`);
    const record = { id: uid(900), user_id: actor, meal_type: args.p_meal_type, source: args.p_source,
      title: args.p_title, note: args.p_note, occurred_at: args.p_occurred_at, meal_date: args.p_meal_date,
      timezone: args.p_timezone, created_at: timestamp, updated_at: timestamp,
      meal_record_items: args.p_items.map((item, index) => ({ id: uid(901 + index), meal_record_id: uid(900),
        user_id: actor, restaurant_id: item.restaurantId, branch_id: item.branchId, menu_item_id: item.menuItemId,
        display_name_snapshot: item.displayName, nutrition_source: item.nutritionSource,
        nutrition_snapshot: item.nutrition, portion_snapshot: item.portion, correction_status: "none",
        nutrition_schema_version: "v1", occurred_at: args.p_occurred_at, timezone: args.p_timezone,
        consumed_ratio: 1, created_at: timestamp, updated_at: timestamp })) };
    mealRows.push(record);
    return { data: record, error: null };
  },
  storage: { from: () => deny("Storage") }, channel: () => deny("Realtime")
};
function compose(env = liveEnv) {
  sandbox.process.env = { ...env }; sdkCalls = 0;
  const dependencies = load(compositionPath).createCanonicalNextMealPrototypeRuntimeDependencies();
  const provider = load(providerPath).createCanonicalNextMealPrototypeProvider(dependencies);
  return { dependencies, provider, runtime: load(runtimePath).createConsumerRuntimeComposition() };
}
const request = { entitlement: "premium", currentLocation: { latitude: 25.03, longitude: 121.56 } };
const writeEvents = () => events.filter((event) => event.kind === "rpc" && event.name === "create_current_user_meal_record_v2");

// Execute the unchanged production route callback and Provider bridge, not a copied facsimile.
function findNode(file, predicate) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; ts.forEachChild(node, visit); }
  visit(source);
  if (!found) throw new Error(`Missing production action in ${file}`);
  return found.getText(source);
}
function routeAction(runtimeValue) {
  const route = "apps/mobile/app/recommendation.tsx";
  const action = findNode(route, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "addRecommendationToTodayIntake");
  const period = findNode(route, (node) => ts.isFunctionDeclaration(node) && node.name?.text === "currentMealPeriod");
  const providerBridge = findNode(mobile + "consumer-runtime/ConsumerRuntimeProvider.tsx", (node) =>
    ts.isPropertyAssignment(node) && node.name.getText() === "createMealRecord");
  const state = runtimeValue.controller.getState();
  const bindings = { state, mealWriteRuntime: runtimeValue.mealWriteRuntime, profileTimezone: "Asia/Taipei",
    isValidIanaTimezone: (zone) => zone === "Asia/Taipei", unavailableMealWriteState: { status: "error" } };
  const bridge = vm.runInNewContext(compile(`({${providerBridge}})`, "bridge.ts"), bindings);
  return vm.runInNewContext(compile(`${period}\n${action}\naddRecommendationToTodayIntake;`, "route.ts"), {
    runtime: bridge, actorTimezone: "Asia/Taipei"
  });
}

try {
  const beforeEnv = JSON.stringify(liveEnv);
  const live = compose();
  expect(live.dependencies.authPort?.source === "supabase-live" && live.dependencies.mealClient === client,
    "A canonical live Recommendation dependencies construct through the real SDK factory");
  expect(live.runtime.ok && live.runtime.value.flags.supabaseWritesEnabled && sdkCalls === 2,
    "A the same env composes write-enabled main runtime without capability mutation");
  const main = live.runtime.value;
  await main.controller.signIn("local@example.invalid", "LOCAL_TEST_PASSWORD");
  await main.controller.retryProfile();
  expect(main.controller.getState().authState.status === "signedIn"
    && main.controller.getState().profileState.status === "available", "A real Auth/Profile adapters bind the current actor");
  events.length = 0;
  const result = await live.provider.getRecommendation(request);
  expect(result.status === "success" && !result.recommendation.isSampleData,
    "D real canonical service produces a selectable live recommendation", result);
  const visible = result.recommendation.candidates;
  expect(visible.length === 2 && visible.every((entry) => survivorIds.includes(entry.branchMenuItemId)),
    "B/C GEO, Allergy, avoidance unknown/partial/conflict exclusions cannot re-enter", visible);
  const stages = events.filter((event) => event.kind === "GEO" || event.kind === "rankNextMealCandidatesByNutrition"
    || event.kind === "composeDualLaneRecommendation" || event.kind === "rpc").map((event) => event.name ?? event.kind);
  expect(stages.join("|") === ["GEO", "read_authenticated_allergy_settings_v1",
    "read_authenticated_ingredient_avoidance_settings_v1", "rankNextMealCandidatesByNutrition",
    "composeDualLaneRecommendation"].join("|"), "B exact GEO → REC-C → REC-D → REC-A → REC-B execution order", stages);
  expect(events.filter((event) => event.kind === "rankNextMealCandidatesByNutrition" || event.kind === "composeDualLaneRecommendation")
    .every((event) => event.ids.length === 2 && event.ids.every((id) => survivorIds.includes(id))),
  "B both real ranking authorities receive only eligible branch offers");
  expect(events.filter((event) => event.kind === "rpc").every((event) => Object.keys(event.args).length === 0 && event.actor === actor),
    "B governed settings reads use authenticated current-user authority without an arbitrary actor parameter");
  expect(writeEvents().length === 0, "G Recommendation construction, read and selection perform zero writes");
  expect(JSON.stringify(liveEnv) === beforeEnv, "G original live capability configuration remains unchanged");
  const state = main.controller.getState();
  await main.mealWriteRuntime.setActor(state.actorKey, state.actorGeneration);
  const selected = visible[0];
  const outcome = await routeAction(main)(selected);
  expect(outcome === "succeeded" && writeEvents().length === 1,
    "E unchanged selected-candidate route/Provider callbacks reach canonical v2 meal write", { outcome, state: main.mealWriteRuntime.getState() });
  const write = writeEvents()[0];
  expect(write.args.p_items[0].restaurantId === selected.restaurantId && write.args.p_items[0].branchId === selected.branchId
    && write.args.p_items[0].menuItemId === selected.menuItemId && !Object.hasOwn(write.args, "actor_id"),
  "E canonical write retains selected branch/menu identity and current-user binding");
  const overview = await main.createOverviewService("Asia/Taipei").getCurrentUserTodayIntakeOverview({ date: mealRows[0].meal_date });
  expect(overview.ok && overview.value.calculatedNutrition.calories > 0,
    "E the same runtime reads the canonical written meal into Today Intake", overview);

  const offEnv = { ...liveEnv, [prefix + "SUPABASE_WRITES_ENABLED"]: "false",
    [prefix + "MEAL_RECORD_WRITES_ENABLED"]: "false", [prefix + "MEAL_RECORD_LIVE_WRITE_OPT_IN"]: "false" };
  const off = compose(offEnv);
  expect(off.runtime.ok && (await off.provider.getRecommendation(request)).status === "success",
    "F read-only live Recommendation remains available with writes disabled");
  const offMain = off.runtime.value;
  await offMain.controller.signIn("local@example.invalid", "LOCAL_TEST_PASSWORD"); await offMain.controller.retryProfile();
  const offState = offMain.controller.getState(); await offMain.mealWriteRuntime.setActor(offState.actorKey, offState.actorGeneration);
  const previousWrites = writeEvents().length;
  expect(await routeAction(offMain)(selected) === "failed" && writeEvents().length === previousWrites
    && offMain.mealWriteRuntime.getState().errorCode === "disabled",
    "F the identical action cannot write when explicit write authority is disabled");
  const factories = load(mobile + "consumer-meals/factories.ts");
  const raw = load(mobile + "consumer-meals/featureFlags.ts").getConsumerMealRuntimeFlags(liveEnv);
  let refused = false;
  try { factories.createConsumerNextMealRecommendationService(raw, live.dependencies); } catch { refused = true; }
  expect(refused && !factories.assertConsumerTodayIntakeOverviewRuntimeFlags({ ...raw, issues: [] }).ok,
    "G historical raw read factories retain both issue and writes-enabled refusals");
  const planned = await main.plannedMealService.create({ createRequestId: uid(800), plannedFor: "2026-09-02",
    plannedLocalTime: null, plannedTimezone: "Asia/Taipei", mealType: "lunch", title: "Local fixture",
    mealCategory: null, restaurantNameSnapshot: null, note: null, restaurantId: null,
    branchId: null, menuItemId: null, nutritionSnapshot: {} });
  expect(!planned.ok && planned.error.code === "meal_write_disabled",
    "G the read projection grants no unrelated planned-meal write capability", planned);

  for (const [name, override] of [
    ["Production", { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "production" }],
    ["wrong project", { [prefix + "SUPABASE_URL"]: "https://wrongproject.supabase.co" }],
    ["missing Development", { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: undefined }],
    ["missing key", { [prefix + "SUPABASE_PUBLISHABLE_KEY"]: undefined }],
    ["invalid Auth", { [prefix + "AUTH_SOURCE"]: "invalid" }],
    ["Auth disabled", { [prefix + "SUPABASE_AUTH_ENABLED"]: "false" }],
    ["invalid Profile", { [prefix + "PROFILE_SOURCE"]: "invalid" }],
    ["missing write opt-in", { [prefix + "MEAL_RECORD_LIVE_WRITE_OPT_IN"]: "false" }],
    ["missing read opt-in", { [prefix + "DAILY_NUTRITION_LIVE_READ_OPT_IN"]: "false" }],
    ["invalid boolean", { [prefix + "MEAL_RECORD_WRITES_ENABLED"]: "invalid" }],
    ["mixed mock intake", { [prefix + "MEAL_RECORDS_SOURCE"]: "mock", [prefix + "DAILY_NUTRITION_SOURCE"]: "mock",
      [prefix + "DAILY_NUTRITION_LIVE_READ_OPT_IN"]: "false" }]
  ]) {
    events.length = 0;
    const invalid = compose({ ...liveEnv, ...override });
    const output = await invalid.provider.getRecommendation(request);
    expect(output.status === "error" && events.length === 0, `H/I ${name} fails closed without live-looking mock data or I/O`, output);
  }
  for (const domain of ["allergy", "avoidance"]) {
    for (const mode of ["unavailable", "unresolved"]) {
      allergyMode = domain === "allergy" ? mode : "active";
      avoidanceMode = domain === "avoidance" ? mode : "active";
      const current = compose(); events.length = 0;
      expect((await current.provider.getRecommendation(request)).status !== "success"
        && !events.some((event) => event.kind === "rankNextMealCandidatesByNutrition")
        && !events.some((event) => event.table === "consumer_public_next_meal_candidates_v1"),
      `C/I ${domain} ${mode} fails closed before ranking without non-GEO fallback`);
    }
  }
  allergyMode = avoidanceMode = "active";
  const current = compose(); geoMode = "empty"; events.length = 0;
  expect((await current.provider.getRecommendation(request)).status !== "success"
    && !events.some((event) => event.kind === "rpc" || event.table === "consumer_public_next_meal_candidates_v1"),
  "B valid zero-nearby stays applied empty and is never repopulated");
  geoMode = "failure"; events.length = 0;
  expect((await current.provider.getRecommendation(request)).status === "success"
    && events.some((event) => event.table === "consumer_public_next_meal_candidates_v1"),
  "B genuine GEO infrastructure failure retains the existing non-GEO fallback");
  geoMode = "available"; failView = "consumer_authenticated_candidate_avoidance_coverage_v1";
  expect((await current.provider.getRecommendation(request)).status !== "success", "C failed coverage cannot become neutral eligibility");
  failView = null; session = null; events.length = 0;
  expect((await current.provider.getRecommendation(request)).status !== "success" && events.length === 0,
    "H signed-out caller cannot read live candidates or private authority");
  session = fixtureSession;
  const feedback = load(mobile + "consumer-recommendation-feedback/consumerRecommendationFeedbackComposition.ts");
  const feedbackResult = feedback.createMobileConsumerRecommendationFeedbackComposition({
    env: { ...liveEnv, [prefix + "RECOMMENDATION_FEEDBACK_SOURCE"]: "supabase" } });
  expect(feedbackResult.authPort.source === "supabase-live" && feedbackResult.source === "supabase",
    "Related UI feedback caller uses the same successor construction authority");
  expect(feedback.createMobileConsumerRecommendationFeedbackComposition({ env: liveEnv }).source === "disabled",
    "Feedback is not activated without its own explicit source selector");
  expect(unexpected.length === 0, "No unexpected table/RPC, network, Storage, provider, or remote operation occurred", unexpected);
  console.log(JSON.stringify({ suite: "recommendation-live-write-composition", mutationKey, mutationHits, passed: checks.length,
    failed: 0, checks, networkUsed: false, databaseUsed: false }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ suite: "recommendation-live-write-composition", mutationKey, mutationHits, checks,
    error: String(error), events, unexpected }, null, 2));
  process.exitCode = 1;
}
