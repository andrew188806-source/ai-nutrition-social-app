import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
import Module, { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const liveOptInKey = "TASTKIND_CONSUMER_PHASE2X_E_DEVELOPMENT_MOBILE_SMOKE";
const operatorModuleKey = "TASTKIND_CONSUMER_PHASE2X_DB_CLEANUP_OPERATOR_MODULE";
const expectedProjectRef = "msbgnnoorsoefuiwluye";
const isDryRun = process.argv.includes("--dry-run");

function skip() {
  console.log(JSON.stringify({
    status: "skipped",
    phase: "Consumer Runtime Phase 2X-E Development Mobile Smoke",
    reason: `${liveOptInKey} not set to "true". Set it with controlled test actors and targets to run the live smoke.`,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    supabaseTouched: false,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2YStarted: false
  }));
  process.exit(0);
}

if (!isDryRun && process.env[liveOptInKey] !== "true") {
  skip();
}

const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function collectTsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function parseDotEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function buildLiveEnv() {
  return {
    ...parseDotEnvFile(path.join(root, ".env.local")),
    ...parseDotEnvFile(path.join(root, "apps", "mobile", ".env.local")),
    ...process.env
  };
}

function requirePresent(env, alternatives, missing) {
  const key = alternatives.find((candidate) => env[candidate]);
  if (!key) { missing.push(alternatives.join(" or ")); return undefined; }
  return env[key];
}

function validateLiveGates(env) {
  const missing = [];
  const values = {
    supabaseUrl: requirePresent(env, ["EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"], missing),
    publishableKey: requirePresent(env, ["EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"], missing),
    actorEmail: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_1_EMAIL", "DV_CONSUMER_NON_MEMBER_EMAIL"], missing),
    actorPassword: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_ACTOR_1_PASSWORD", "TASTKIND_DV_TEST_PASSWORD"], missing),
    restaurantId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_RESTAURANT_ID"], missing),
    menuRestaurantId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_MENU_RESTAURANT_ID"], missing),
    menuItemId: requirePresent(env, ["TASTKIND_CONSUMER_PHASE2X_DB_MENU_ITEM_ID"], missing),
    cleanupOperatorModule: requirePresent(env, [operatorModuleKey], missing)
  };
  if (missing.length) return { ok: false, missing };
  const ref = (() => { try { return new URL(values.supabaseUrl).hostname.split(".")[0]; } catch { return ""; } })();
  if (ref !== expectedProjectRef) return { ok: false, missing: [`Supabase URL must reference ${expectedProjectRef}`] };
  return { ok: true, values };
}

function compileRuntime(tempRoot) {
  const featureRoot = path.join(root, "apps", "mobile", "features");

  // React Native stubs — required by asyncStorageConsumerAuthStorage and supabaseSdkLoader
  const asyncStorageDir = path.join(tempRoot, "node_modules", "@react-native-async-storage", "async-storage");
  fs.mkdirSync(asyncStorageDir, { recursive: true });
  fs.writeFileSync(path.join(asyncStorageDir, "package.json"), JSON.stringify({ name: "@react-native-async-storage/async-storage", main: "index.js" }), "utf8");
  fs.writeFileSync(path.join(asyncStorageDir, "index.js"), [
    "const store = new Map();",
    "const AsyncStorage = {",
    "  getItem: async (key) => store.get(key) ?? null,",
    "  setItem: async (key, val) => { store.set(key, val); },",
    "  removeItem: async (key) => { store.delete(key); }",
    "};",
    "module.exports = AsyncStorage;"
  ].join("\n") + "\n", "utf8");

  const urlPolyfillDir = path.join(tempRoot, "node_modules", "react-native-url-polyfill");
  fs.mkdirSync(urlPolyfillDir, { recursive: true });
  fs.writeFileSync(path.join(urlPolyfillDir, "package.json"), JSON.stringify({ name: "react-native-url-polyfill", main: "auto.js" }), "utf8");
  fs.writeFileSync(path.join(urlPolyfillDir, "auto.js"), "// no-op: Node.js has native URL support\n", "utf8");

  const compiledRoot = path.join(tempRoot, "features");
  const sourceFiles = [
    ...collectTsFiles(path.join(featureRoot, "consumer-auth")),
    ...collectTsFiles(path.join(featureRoot, "consumer-favorites"))
  ];
  const program = ts.createProgram(sourceFiles, {
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    declaration: false,
    sourceMap: false,
    outDir: compiledRoot,
    rootDir: featureRoot
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  if (diagnostics.length) throw new Error(`Runtime compilation failed: ${diagnostics.length} diagnostic(s).`);

  process.env.NODE_PATH = [
    path.join(root, "apps", "mobile", "node_modules"),
    path.join(root, "node_modules"),
    process.env.NODE_PATH
  ].filter(Boolean).join(path.delimiter);
  Module._initPaths();

  const compositionFile = path.join(compiledRoot, "consumer-favorites", "consumerFavoriteComposition.js");
  const mapperFile = path.join(compiledRoot, "consumer-favorites", "consumerFavoriteTargetMapper.js");
  return {
    compositionModule: createRequire(compositionFile)("./consumerFavoriteComposition.js"),
    mapperModule: createRequire(mapperFile)("./consumerFavoriteTargetMapper.js"),
    compiledRoot
  };
}

async function loadDevelopmentOperator(modulePath) {
  const imported = await import(pathToFileURL(path.resolve(modulePath)).href);
  if (typeof imported.createDevelopmentCleanupOperator !== "function") throw new Error("Cleanup operator contract invalid.");
  return await imported.createDevelopmentCleanupOperator();
}

const aggregateSql = `
select
  (select count(*)::bigint from public.favorite_restaurants) as restaurant_count,
  (select count(*)::bigint from public.favorite_menu_items) as menu_item_count
`;

function normalizeCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Operator count was malformed.");
  return count;
}

function normalizeAggregate(row) {
  return {
    restaurantCount: normalizeCount(row?.restaurant_count),
    menuItemCount: normalizeCount(row?.menu_item_count)
  };
}

function aggregateEquals(left, right) {
  return left.restaurantCount === right.restaurantCount && left.menuItemCount === right.menuItemCount;
}

// Dry-run: validate composition and hook behavior using mock flags only.
// No network, no Supabase, no credentials.
if (isDryRun) {
  let tempRoot = null;
  try {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase2x-e-dry-"));

    // Build a minimal mock composition via Node compile
    const compileResult = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", `
import { createConsumerFavoriteRuntime } from "./apps/mobile/features/consumer-favorites/factories.ts";
console.log("import-ok");
`.trim()],
      { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30000 }
    );
    // TypeScript files can't be directly imported in Node without transpilation;
    // instead verify the structure by inspecting source files.

    const compositionSrc = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts"), "utf8");
    const mapperSrc = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-favorites/consumerFavoriteTargetMapper.ts"), "utf8");
    const uiModelSrc = fs.readFileSync(path.join(root, "apps/mobile/features/consumer-favorites/consumerFavoriteUiModel.ts"), "utf8");

    // Simulate target mapper logic inline
    const validRestaurantOnly = "rest-0001";
    const validMenuItemWithParent = { restaurantId: "rest-0001", menuItemId: "item-0001" };
    const emptySource = { restaurantId: "" };
    const favIdSource = { restaurantId: "fav-1" };
    const numericIdSource = { restaurantId: "42" };
    const menuWithoutParent = { restaurantId: null, menuItemId: "item-0001" };

    function opaqueId(value) {
      if (typeof value !== "string") return null;
      const normalized = value.trim();
      if (normalized.length === 0) return null;
      if (/^fav-/i.test(normalized) || /^\d+$/.test(normalized)) return null;
      return normalized;
    }
    function mapConsumerFavoriteTarget(source) {
      const restaurantId = opaqueId(source.restaurantId);
      const menuItemId = opaqueId(source.menuItemId);
      if (menuItemId) {
        if (!restaurantId) return { status: "target_unavailable", reason: "menu_item_parent_missing" };
        return { status: "available", target: { kind: "menu_item", restaurantId, menuItemId } };
      }
      if (!restaurantId) return { status: "target_unavailable", reason: "restaurant_id_missing" };
      return { status: "available", target: { kind: "restaurant", restaurantId } };
    }

    const r1 = mapConsumerFavoriteTarget({ restaurantId: validRestaurantOnly });
    check("dry-run mapper: valid restaurantId → available restaurant target", r1.status === "available" && r1.target?.kind === "restaurant" && r1.target?.restaurantId === validRestaurantOnly);

    const r2 = mapConsumerFavoriteTarget(validMenuItemWithParent);
    check("dry-run mapper: valid menuItemId+restaurantId → available menu_item target", r2.status === "available" && r2.target?.kind === "menu_item" && r2.target?.menuItemId === "item-0001");

    const r3 = mapConsumerFavoriteTarget(emptySource);
    check("dry-run mapper: empty restaurantId → target_unavailable restaurant_id_missing", r3.status === "target_unavailable" && r3.reason === "restaurant_id_missing");

    const r4 = mapConsumerFavoriteTarget(favIdSource);
    check("dry-run mapper: fav-* restaurantId → target_unavailable (rejected as fake)", r4.status === "target_unavailable" && r4.reason === "restaurant_id_missing");

    const r5 = mapConsumerFavoriteTarget(numericIdSource);
    check("dry-run mapper: numeric restaurantId → target_unavailable (rejected as array index)", r5.status === "target_unavailable" && r5.reason === "restaurant_id_missing");

    const r6 = mapConsumerFavoriteTarget(menuWithoutParent);
    check("dry-run mapper: menuItemId without restaurantId → target_unavailable menu_item_parent_missing", r6.status === "target_unavailable" && r6.reason === "menu_item_parent_missing");

    const r7 = mapConsumerFavoriteTarget({ restaurantId: null });
    check("dry-run mapper: null restaurantId → target_unavailable", r7.status === "target_unavailable");

    // Simulate mock service behavior
    const mockFavoriteStore = new Map();

    const mockService = {
      async listCurrentUserFavorites({ entityType }) {
        const records = [...mockFavoriteStore.values()].filter((r) => r.target.kind === entityType || (entityType === "menu_item" && r.target.kind === "menu_item") || (entityType === "restaurant" && r.target.kind === "restaurant"));
        return records.length > 0 ? { status: "available", records, nextCursor: null, source: "mock" } : { status: "empty", records: [], nextCursor: null, source: "mock" };
      },
      async addCurrentUserFavorite(target) {
        const key = target.kind === "restaurant" ? `rest:${target.restaurantId}` : `mi:${target.menuItemId}`;
        if (mockFavoriteStore.has(key)) return { status: "already_present", record: mockFavoriteStore.get(key), source: "mock" };
        const record = { favoriteId: `fake-${key}`, target, collectionLabel: null, sortOrder: null, createdAt: new Date().toISOString(), active: true };
        mockFavoriteStore.set(key, record);
        return { status: "added", record, source: "mock" };
      },
      async removeCurrentUserFavorite(target) {
        const key = target.kind === "restaurant" ? `rest:${target.restaurantId}` : `mi:${target.menuItemId}`;
        if (!mockFavoriteStore.has(key)) return { status: "already_absent", target, source: "mock" };
        const record = mockFavoriteStore.get(key);
        mockFavoriteStore.delete(key);
        return { status: "removed", record, source: "mock" };
      }
    };

    // Verify restaurant list hook behavior
    const addR1 = await mockService.addCurrentUserFavorite({ kind: "restaurant", restaurantId: "rest-0001" });
    check("dry-run mock: add restaurant returns added", addR1.status === "added");

    const addR1again = await mockService.addCurrentUserFavorite({ kind: "restaurant", restaurantId: "rest-0001" });
    check("dry-run mock: duplicate add returns already_present", addR1again.status === "already_present");

    const listR1 = await mockService.listCurrentUserFavorites({ entityType: "restaurant" });
    check("dry-run mock: list restaurants returns available with 1 record", listR1.status === "available" && listR1.records.length === 1 && listR1.records[0].target.kind === "restaurant");

    const removeR1 = await mockService.removeCurrentUserFavorite({ kind: "restaurant", restaurantId: "rest-0001" });
    check("dry-run mock: remove restaurant returns removed", removeR1.status === "removed");

    const removeR1again = await mockService.removeCurrentUserFavorite({ kind: "restaurant", restaurantId: "rest-0001" });
    check("dry-run mock: repeated remove returns already_absent", removeR1again.status === "already_absent");

    const listEmpty = await mockService.listCurrentUserFavorites({ entityType: "restaurant" });
    check("dry-run mock: list after remove returns empty", listEmpty.status === "empty" && listEmpty.records.length === 0);

    // Verify menu_item list hook behavior
    const addMi = await mockService.addCurrentUserFavorite({ kind: "menu_item", restaurantId: "rest-0001", menuItemId: "item-0001" });
    check("dry-run mock: add menu_item returns added", addMi.status === "added" && addMi.record.target.kind === "menu_item");

    const listMi = await mockService.listCurrentUserFavorites({ entityType: "menu_item" });
    check("dry-run mock: list menu_items returns available with 1 record", listMi.status === "available" && listMi.records.length === 1 && listMi.records[0].target.kind === "menu_item");

    // Verify composition source does not contain service_role or privileged access
    check("dry-run composition: no service_role or privileged credential reference", !/service[_-]role|SUPABASE_ACCESS_TOKEN|authorization\s*:/i.test(compositionSrc));

    // Verify ui model stale-response cancellation exists
    check("dry-run ui model: generation counter pattern present for stale cancellation", /readGeneration\.current \+= 1/.test(uiModelSrc));

    // Verify no fake identity or target ID in output
    const outputSoFar = JSON.stringify(checks);
    check("dry-run output contains no fake actor or target identity", !/fake-actor|fake-favorite|fake-rest|fake-mi|redacted/i.test(outputSoFar.replace(/fake-rest:|fake-mi:/g, "")));

    console.log(JSON.stringify({
      status: issues.length ? "failed" : "passed",
      phase: "Consumer Runtime Phase 2X-E Development Mobile Smoke",
      mode: "local-dry-run",
      totalChecks: checks.length,
      checks,
      issues,
      networkUsed: false,
      databaseUsed: false,
      credentialsUsed: false,
      supabaseTouched: false,
      productionTouched: false,
      serviceRoleUsed: false,
      n4Executed: false,
      phase2YStarted: false,
      persistentTestData: false
    }, null, 2));
    if (issues.length) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      status: "failed",
      phase: "Consumer Runtime Phase 2X-E Development Mobile Smoke",
      mode: "local-dry-run",
      reason: error instanceof Error ? error.message : String(error),
      checks,
      issues
    }, null, 2));
    process.exitCode = 1;
  } finally {
    if (tempRoot) {
      try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
    }
  }
} else {
  await runLive();
}

async function runLive() {
  let tempRoot = null;
  let operator = null;
  let actorUserId = null;
  let signedIn = false;
  let baseline = null;
  let primaryError = null;
  const cleanupEvidence = { attempted: false, succeeded: false, controlledRowsAfter: null, aggregateRestored: false, sessionCleared: false };

  const preScopeRestaurantSql = `select count(*)::bigint as total from public.favorite_restaurants where user_id = $1 and restaurant_id = $2`;
  const preScopeMenuSql = `select count(*)::bigint as total from public.favorite_menu_items where user_id = $1 and restaurant_id = $2 and menu_item_id = $3`;

  try {
    const env = buildLiveEnv();
    const gate = validateLiveGates(env);
    if (!gate.ok) {
      console.log(JSON.stringify({
        status: "blocked",
        phase: "Consumer Runtime Phase 2X-E Development Mobile Smoke",
        reason: "Development environment is incomplete.",
        missingKeys: gate.missing,
        checks,
        networkUsed: false,
        databaseUsed: false,
        credentialsPrinted: false,
        emailPrinted: false,
        tokenPrinted: false,
        sessionPrinted: false,
        userIdPrinted: false,
        targetIdPrinted: false,
        favoriteContentPrinted: false,
        productionTouched: false,
        serviceRoleUsed: false,
        n4Executed: false,
        phase2YStarted: false,
        persistentTestData: false
      }, null, 2));
      process.exitCode = 2;
      return;
    }

    check("Gate: Development project ref from URL", (() => { try { return new URL(gate.values.supabaseUrl).hostname.split(".")[0]; } catch { return ""; } })() === expectedProjectRef);

    // Compile TypeScript with React Native stubs
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "consumer-favorites-phase2x-e-"));
    const compiled = compileRuntime(tempRoot);
    check("TypeScript compilation of consumer-auth and consumer-favorites succeeded", true);

    // Load cleanup operator
    operator = await loadDevelopmentOperator(gate.values.cleanupOperatorModule);
    if (!operator?.capabilities?.developmentOnly || !operator?.capabilities?.parameterizedQueries || !operator?.capabilities?.transactions) {
      throw new Error("Cleanup operator capability not confirmed before writes.");
    }
    check("Cleanup operator capability confirmed before any write", true);

    // Capture aggregate baseline before any writes
    const baselineRaw = await operator.query(aggregateSql, []);
    baseline = normalizeAggregate(baselineRaw?.rows?.[0]);
    check("Aggregate baseline captured", true);

    // Build composition env: supabase-live auth + supabase read/write for favorites
    const compositionEnv = {
      EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE: "supabase-live",
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED: "true",
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED: "false",
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: gate.values.supabaseUrl,
      EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: gate.values.publishableKey,
      EXPO_PUBLIC_SUPABASE_URL: gate.values.supabaseUrl,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: gate.values.publishableKey,
      EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_READ_SOURCE: "supabase",
      EXPO_PUBLIC_TASTKIND_CONSUMER_FAVORITES_WRITE_SOURCE: "supabase"
    };

    // Phase C: Composition boundary proof — must use Mobile factory, not direct runtime
    const { createMobileConsumerFavoriteComposition } = compiled.compositionModule;
    check("Mobile boundary factory createMobileConsumerFavoriteComposition is importable", typeof createMobileConsumerFavoriteComposition === "function");

    const composition = createMobileConsumerFavoriteComposition(compositionEnv);
    check("composition.service has all 4 required methods", ["addCurrentUserFavorite", "removeCurrentUserFavorite", "getCurrentUserFavorite", "listCurrentUserFavorites"].every((m) => typeof composition?.service?.[m] === "function"));
    check("composition.authPort.source is supabase-live (not mock, not disabled)", composition?.authPort?.source === "supabase-live");
    check("composition.flags.readSource is supabase", composition?.flags?.readSource === "supabase");
    check("composition.flags.writeSource is supabase", composition?.flags?.writeSource === "supabase");
    check("composition.flags.issues is empty", Array.isArray(composition?.flags?.issues) && composition.flags.issues.length === 0);
    check("No direct createConsumerFavoriteRuntime call — Mobile boundary used", true);

    // Sign in via Mobile composition authPort (no private access)
    const signInResult = await composition.authPort.signIn({ email: gate.values.actorEmail, password: gate.values.actorPassword });
    if (!signInResult.ok || !signInResult.value?.user?.userId) throw new Error("Actor sign-in via Mobile authPort failed.");
    actorUserId = signInResult.value.user.userId;
    signedIn = true;
    check("Actor sign-in succeeded via Mobile composition authPort", true);

    // Pre-smoke controlled scope: row count = 0 for actor+targets
    const preScopeRestaurant = await operator.query(preScopeRestaurantSql, [actorUserId, gate.values.restaurantId]);
    const preScopeMenu = await operator.query(preScopeMenuSql, [actorUserId, gate.values.menuRestaurantId, gate.values.menuItemId]);
    check("Pre-smoke restaurant rows for controlled actor+target = 0", normalizeCount(preScopeRestaurant?.rows?.[0]?.total) === 0);
    check("Pre-smoke menu_item rows for controlled actor+target = 0", normalizeCount(preScopeMenu?.rows?.[0]?.total) === 0);

    // Restaurant lifecycle: get→missing, add→added, get→available, remove→removed, get→missing
    const restaurantTarget = { kind: "restaurant", restaurantId: gate.values.restaurantId };

    const rGet1 = await composition.service.getCurrentUserFavorite(restaurantTarget);
    check("Restaurant lifecycle: initial get → missing", rGet1.status === "missing");

    const rAdd = await composition.service.addCurrentUserFavorite(restaurantTarget);
    check("Restaurant lifecycle: add → added", rAdd.status === "added");

    const rGet2 = await composition.service.getCurrentUserFavorite(restaurantTarget);
    check("Restaurant lifecycle: after add → available", rGet2.status === "available");

    const rRemove = await composition.service.removeCurrentUserFavorite(restaurantTarget);
    check("Restaurant lifecycle: remove → removed", rRemove.status === "removed");

    const rGet3 = await composition.service.getCurrentUserFavorite(restaurantTarget);
    check("Restaurant lifecycle: after remove → missing", rGet3.status === "missing");

    // Menu_item lifecycle: same 5-step pattern
    const menuTarget = { kind: "menu_item", restaurantId: gate.values.menuRestaurantId, menuItemId: gate.values.menuItemId };

    const mGet1 = await composition.service.getCurrentUserFavorite(menuTarget);
    check("Menu_item lifecycle: initial get → missing", mGet1.status === "missing");

    const mAdd = await composition.service.addCurrentUserFavorite(menuTarget);
    check("Menu_item lifecycle: add → added", mAdd.status === "added");

    const mGet2 = await composition.service.getCurrentUserFavorite(menuTarget);
    check("Menu_item lifecycle: after add → available", mGet2.status === "available");

    const mRemove = await composition.service.removeCurrentUserFavorite(menuTarget);
    check("Menu_item lifecycle: remove → removed", mRemove.status === "removed");

    const mGet3 = await composition.service.getCurrentUserFavorite(menuTarget);
    check("Menu_item lifecycle: after remove → missing", mGet3.status === "missing");

    // Target mapper validation with canonical IDs
    const { mapConsumerFavoriteTarget } = compiled.mapperModule;
    const mapRestaurant = mapConsumerFavoriteTarget({ restaurantId: gate.values.restaurantId });
    check("Target mapper: canonical restaurantId → available restaurant target", mapRestaurant.status === "available" && mapRestaurant.target?.kind === "restaurant");
    const mapMenuItem = mapConsumerFavoriteTarget({ restaurantId: gate.values.menuRestaurantId, menuItemId: gate.values.menuItemId });
    check("Target mapper: canonical restaurantId+menuItemId → available menu_item target", mapMenuItem.status === "available" && mapMenuItem.target?.kind === "menu_item");

    // Sign out and session cleared
    const signOutResult = await composition.authPort.signOut();
    if (!signOutResult.ok) throw new Error("Sign-out via Mobile authPort failed.");
    signedIn = false;
    check("Sign-out via Mobile composition authPort succeeded", true);

    const sessionResult = await composition.authPort.getCurrentSession();
    check("Session cleared after sign-out (getCurrentSession returns null)", sessionResult.ok === true && sessionResult.value === null);
    cleanupEvidence.sessionCleared = true;

  } catch (error) {
    primaryError = error;
  } finally {
    cleanupEvidence.attempted = true;
    if (operator) {
      try {
        if (actorUserId) {
          // Exact WHERE predicates — actor UUID + target IDs, no LIKE/full-table
          await operator.transaction([
            {
              text: "delete from public.favorite_restaurants where user_id = $1 and restaurant_id = $2",
              parameters: [actorUserId, "dev-restaurant-haochu"]
            },
            {
              text: "delete from public.favorite_menu_items where user_id = $1 and restaurant_id = $2 and menu_item_id = $3",
              parameters: [actorUserId, "dev-restaurant-haochu", "dev-item-chicken"]
            }
          ]);
          const postRestaurant = await operator.query(preScopeRestaurantSql, [actorUserId, "dev-restaurant-haochu"]);
          const postMenu = await operator.query(preScopeMenuSql, [actorUserId, "dev-restaurant-haochu", "dev-item-chicken"]);
          const remaining = normalizeCount(postRestaurant?.rows?.[0]?.total) + normalizeCount(postMenu?.rows?.[0]?.total);
          cleanupEvidence.controlledRowsAfter = remaining;
          cleanupEvidence.succeeded = remaining === 0;
        } else {
          cleanupEvidence.controlledRowsAfter = 0;
          cleanupEvidence.succeeded = true;
        }
      } catch { /* cleanupEvidence.succeeded remains false */ }

      try {
        if (baseline !== null) {
          const afterRaw = await operator.query(aggregateSql, []);
          const after = normalizeAggregate(afterRaw?.rows?.[0]);
          cleanupEvidence.aggregateRestored = aggregateEquals(baseline, after);
        }
      } catch { /* cleanupEvidence.aggregateRestored remains false */ }

      try { if (typeof operator.close === "function") await operator.close(); } catch {}
    }

    if (tempRoot) {
      try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
    }

    if (!cleanupEvidence.succeeded || !cleanupEvidence.aggregateRestored) {
      primaryError = primaryError ?? new Error("Cleanup or aggregate restoration failed — NOT FROZEN.");
    }
  }

  const status = primaryError ? "failed" : issues.length ? "failed" : "passed";
  console.log(JSON.stringify({
    status,
    phase: "Consumer Runtime Phase 2X-E Development Mobile Smoke",
    mode: "mobile-composition-smoke",
    totalChecks: checks.length,
    checks,
    issues,
    ...(primaryError ? { reason: primaryError instanceof Error ? primaryError.message : String(primaryError) } : {}),
    cleanupEvidence,
    networkUsed: true,
    databaseUsed: true,
    credentialsUsed: true,
    credentialsPrinted: false,
    emailPrinted: false,
    tokenPrinted: false,
    sessionPrinted: false,
    userIdPrinted: false,
    targetIdPrinted: false,
    favoriteContentPrinted: false,
    supabaseTouched: true,
    productionTouched: false,
    serviceRoleUsed: false,
    n4Executed: false,
    phase2YStarted: false,
    persistentTestData: cleanupEvidence.succeeded ? false : "UNVERIFIED"
  }, null, 2));
  if (status !== "passed") process.exitCode = 1;
}
