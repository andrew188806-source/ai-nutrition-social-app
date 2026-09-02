#!/usr/bin/env node
// Local activation proof: real readers/composition/handler, fake platform and network boundaries.
// Never loads dotenv or credentials, authenticates remotely, or invokes a provider.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";

const root = process.cwd();
const req = createRequire(path.join(root, "package.json"));
const mobileReq = createRequire(path.join(root, "apps/mobile/package.json"));
const ts = req("typescript");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function expect(pass, name) {
  checks.push({ name, pass: Boolean(pass) });
  if (!pass) throw new Error(name);
}
const prefix = "EXPO_PUBLIC_TASTKIND_CONSUMER_";
const devUrl = "https://msbgnnoorsoefuiwluye.supabase.co";
const publicKey = "PUBLIC_DEMO_ACTIVATION_PUBLIC_SENTINEL_NOT_A_CREDENTIAL";
const dev = Object.freeze({
  [prefix + "AUTH_SOURCE"]: "supabase-live",
  [prefix + "PROFILE_SOURCE"]: "supabase-live",
  [prefix + "SUPABASE_AUTH_ENABLED"]: "true",
  [prefix + "SUPABASE_WRITES_ENABLED"]: "true",
  [prefix + "SUPABASE_URL"]: devUrl,
  [prefix + "SUPABASE_PUBLISHABLE_KEY"]: publicKey,
  [prefix + "MEAL_PHOTO_UPLOAD_SOURCE"]: "supabase-live",
  [prefix + "MEAL_PHOTO_ANALYSIS_SOURCE"]: "supabase-live",
  EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development"
});
const serverSentinels = {
  OPENAI_API_KEY: "ACTIVATION_SERVER_PROVIDER_SENTINEL",
  MEAL_PHOTO_ANALYSIS_ADMIN_KEY: "ACTIVATION_SERVER_ADMIN_SENTINEL",
  SUPABASE_SERVICE_ROLE_KEY: "ACTIVATION_SERVER_ROLE_SENTINEL"
};
const authFlagsPath = "apps/mobile/features/consumer-auth/featureFlags.ts";
const envPath = "apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts";
const mealFlagsPath = "apps/mobile/features/consumer-meals/featureFlags.ts";
const uploadFlagsPath = "apps/mobile/features/meal-photo-upload/featureFlags.ts";
const analysisFlagsPath = "apps/mobile/features/meal-photo-analysis/featureFlags.ts";
const runtimePath = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";
const edgePath = "supabase/functions/meal-photo-analysis/index.ts";
const guardPath = "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs";
const manifest = [authFlagsPath, envPath, mealFlagsPath, uploadFlagsPath, analysisFlagsPath, runtimePath, edgePath,
  "scripts/public-demo-real-ai-activation-smoke.mjs",
  "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-smoke.mjs", guardPath];
const base = "a8ade613917908baee5a682f33f77aac8de3bbf6";
const compile = (source, file) => ts.transpileModule(source, {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const blocked = [];
const noNetwork = (...args) => { blocked.push(String(args[0])); throw new Error("Unexpected external operation"); };
let sdkCalls = 0;
const fakeClient = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    startAutoRefresh() {}, stopAutoRefresh() {}
  },
  from: noNetwork, rpc: noNetwork,
  storage: { from: noNetwork }, functions: { invoke: noNetwork }, channel: noNetwork
};
const native = {
  "@react-native-async-storage/async-storage": { default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } },
  "react-native": { Platform: { OS: "web" }, AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) } },
  "react-native-url-polyfill/auto": {},
  "@supabase/supabase-js": { createClient: (url, key) => {
    sdkCalls++;
    if (url !== devUrl && url !== devUrl + "/") throw new Error("Unexpected client URL");
    if (key !== publicKey) throw new Error("Unexpected client credential");
    return fakeClient;
  } },
  "expo-crypto": { randomUUID },
  "expo-file-system": { File: class { constructor() { noNetwork("native file"); } }, Paths: {} }
};
const sandbox = vm.createContext({ process: { env: {} }, console, Request, Response, Headers, URL,
  Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, setTimeout, clearTimeout, crypto: { randomUUID }, fetch: noNetwork });
const modules = new Map();
function load(file) {
  const abs = path.resolve(root, file);
  if (modules.has(abs)) return modules.get(abs).exports;
  const module = { exports: {} }; modules.set(abs, module);
  const localRequire = (id) => {
    if (Object.hasOwn(native, id)) return native[id];
    if (id.startsWith("npm:@supabase/supabase-js")) return { createClient: noNetwork };
    let stem;
    if (id.startsWith(".")) stem = path.resolve(path.dirname(abs), id);
    else if (id === "@haocu/shared" || id.startsWith("@haocu/shared/")) {
      stem = path.join(root, "packages/shared/src", id.slice("@haocu/shared".length));
    } else throw new Error(`Unexpected module boundary: ${id}`);
    for (const candidate of [stem, stem + ".ts", stem + ".tsx", path.join(stem, "index.ts")]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
    }
    throw new Error(`Unresolved module: ${id}`);
  };
  vm.runInContext(`(function(require,module,exports){${compile(fs.readFileSync(abs, "utf8"), abs)}\n})`, sandbox,
    { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
function compose(env, options) {
  sandbox.process.env = { ...env };
  sdkCalls = 0;
  return load(runtimePath).createConsumerRuntimeComposition(options);
}

try {
  const defaults = compose({});
  expect(defaults.ok && defaults.value.flags.authSource === "mock" && defaults.value.flags.profileSource === "mock"
    && sdkCalls === 0, "Absent selectors preserve mock Auth/Profile without an SDK client");
  const live = compose(dev);
  expect(Object.keys(dev).length === 9 && live.ok && sdkCalls === 1, "Exact nine-variable Development contract constructs one live client");
  expect(live.value.flags.authSource === "supabase-live" && live.value.flags.profileSource === "supabase-live",
    "Exact Development selects live Auth and Profile");
  expect(live.value.mealPhotoUploadService.source === "supabase-live"
    && live.value.mealPhotoAnalysisService.source === "supabase-live", "Exact Development composes both real photo repositories");
  const rawMeals = load(mealFlagsPath).getConsumerMealRuntimeFlags(dev);
  expect(!rawMeals.mealRecordWritesEnabled && rawMeals.dailyNutritionWriteSource === "disabled"
    && rawMeals.plannedMealsWriteSource === "disabled"
    && rawMeals.issues.includes("Consumer Supabase writes require an explicit approved write source."),
  "Raw meal parsers retain their frozen defaults and approved-write assertion");
  const mealWrite = await live.value.mealWriteRuntime.options.service.createCurrentUserMealRecord({});
  const plannedWrite = await live.value.plannedMealService.create({
    createRequestId: "00000000-0000-4000-8000-000000000001", plannedFor: "2026-09-02", plannedLocalTime: null,
    plannedTimezone: "Asia/Taipei", mealType: "lunch", title: "Local fixture", mealCategory: null,
    restaurantNameSnapshot: null, note: null, restaurantId: null, branchId: null, menuItemId: null, nutritionSnapshot: {}
  });
  expect(!mealWrite.ok && mealWrite.error.code === "meal_write_disabled" && !plannedWrite.ok && plannedWrite.error.code === "meal_write_disabled",
    "Photo-only activation does not authorize unrelated meal-record or planned-meal writes");
  for (const [label, over] of [
    ["Production", { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "production" }],
    ["Missing Development pin", { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: undefined }],
    ["Wrong project", { [prefix + "SUPABASE_URL"]: "https://wrongproject.supabase.co" }],
    ["HTTP project", { [prefix + "SUPABASE_URL"]: devUrl.replace("https:", "http:") }],
    ["URL path", { [prefix + "SUPABASE_URL"]: devUrl + "/rest/v1" }],
    ["URL query", { [prefix + "SUPABASE_URL"]: devUrl + "?redirect=1" }],
    ["URL userinfo", { [prefix + "SUPABASE_URL"]: devUrl.replace("https://", "https://user@") }],
    ["Missing URL", { [prefix + "SUPABASE_URL"]: undefined }],
    ["Missing public key", { [prefix + "SUPABASE_PUBLISHABLE_KEY"]: undefined }],
    ["Blank public key", { [prefix + "SUPABASE_PUBLISHABLE_KEY"]: "  " }],
    ["Auth disabled", { [prefix + "SUPABASE_AUTH_ENABLED"]: "false" }],
    ["Missing live Auth selector", { [prefix + "AUTH_SOURCE"]: undefined }],
    ["Missing live Profile selector", { [prefix + "PROFILE_SOURCE"]: undefined }]
  ]) {
    const result = compose({ ...dev, ...over });
    expect(!result.ok && result.errorCode === "configuration_error" && sdkCalls === 0,
      `${label} is refused before SDK construction, without mock fallback`);
  }
  expect(compose({ ...dev, [prefix + "SUPABASE_URL"]: devUrl + "/" }).ok, "Exact Development trailing slash is accepted");
  const alias = { ...dev, [prefix + "SUPABASE_URL"]: undefined, [prefix + "SUPABASE_PUBLISHABLE_KEY"]: undefined,
    EXPO_PUBLIC_SUPABASE_URL: devUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: publicKey };
  expect(compose(alias).ok && sdkCalls === 1, "Existing aliases obey the same exact Development validation");
  expect(!compose({ ...alias, [prefix + "SUPABASE_URL"]: "https://wrongproject.supabase.co" }).ok && sdkCalls === 0,
    "An invalid canonical URL cannot fall back to a valid legacy URL");
  for (const [label, over] of [
    ["No upload approval", { [prefix + "MEAL_PHOTO_UPLOAD_SOURCE"]: "disabled" }],
    ["Unknown upload", { [prefix + "MEAL_PHOTO_UPLOAD_SOURCE"]: "unknown" }],
    ["Invalid meal write opt-in", { [prefix + "MEAL_RECORD_LIVE_WRITE_OPT_IN"]: "true" }],
    ["Unknown meal source", { [prefix + "MEAL_RECORDS_SOURCE"]: "unknown" }]
  ]) expect(!compose({ ...dev, ...over }).ok, `${label} is not erased by photo-only reconciliation`);
  const writesOff = compose({ ...dev, [prefix + "SUPABASE_WRITES_ENABLED"]: "false" });
  expect(!writesOff.ok || (writesOff.value.mealPhotoUploadService.source !== "supabase-live"
    && writesOff.value.mealPhotoAnalysisService.source !== "supabase-live"), "Writes-disabled never activates live photo services");
  const noAnalysis = compose({ ...dev, [prefix + "MEAL_PHOTO_ANALYSIS_SOURCE"]: undefined });
  expect(noAnalysis.ok && noAnalysis.value.mealPhotoAnalysisService.source === "disabled", "Missing analysis selector stays disabled");
  const noValidatedProject = compose(dev, { authPort: { getCurrentSession: async () => ({ ok: true, value: null }) }, profileService: {} });
  expect(!noValidatedProject.ok, "Injected ports without project validation cannot receive the photo-only exception");
  expect(blocked.length === 0, "Composition makes no authentication, Storage, RPC, provider or other network request");

  // Use the installed Expo production transform, then execute with NO browser process global.
  const babel = mobileReq("@babel/core");
  const expoReq = createRequire(mobileReq.resolve("expo/package.json"));
  const { expoInlineEnvVars } = expoReq("babel-preset-expo/build/inline-env-vars.js");
  const readerPaths = [authFlagsPath, envPath, mealFlagsPath, uploadFlagsPath, analysisFlagsPath];
  const sourceKeys = new Set(readerPaths.flatMap((file) => [...read(file).matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)].map((match) => match[1])));
  const previous = new Map([...sourceKeys, ...Object.keys(serverSentinels)].map((key) => [key, process.env[key]]));
  const transformed = new Map();
  try {
    for (const key of sourceKeys) {
      if (dev[key] === undefined) delete process.env[key]; else process.env[key] = dev[key];
    }
    Object.assign(process.env, serverSentinels);
    for (const file of readerPaths) {
      const source = read(file);
      expect(!/globalThis|process\.env\s*\[/.test(source), `${file}: no indirect required env reader`);
      const output = babel.transformSync(compile(source, file), {
        filename: file, configFile: false, babelrc: false, caller: { name: "metro", isDev: false }, plugins: [expoInlineEnvVars]
      }).code;
      expect(!/process\.env\.EXPO_PUBLIC_/.test(output), `${file}: Expo replaces every static public lookup`);
      const module = { exports: {} };
      vm.runInNewContext(`(function(module,exports){${output}\n})`)(module, module.exports);
      transformed.set(file, module.exports);
      expect(!Object.entries(serverSentinels).some(([key, value]) => output.includes(key) || output.includes(value)),
        `${file}: transformed browser module excludes server secrets`);
    }
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  expect(transformed.get(authFlagsPath).getConsumerRuntimeFlags().authSource === "supabase-live"
    && transformed.get(envPath).getSupabaseConsumerEnvironment().publishableKey === publicKey
    && transformed.get(mealFlagsPath).getConsumerMealRuntimeFlags().supabaseWritesEnabled
    && transformed.get(uploadFlagsPath).getMealPhotoUploadRuntimeFlags("supabase-live", true, true).uploadSource === "supabase-live"
    && transformed.get(analysisFlagsPath).getMealPhotoAnalysisRuntimeFlags("supabase-live", true, true, "supabase-live").analysisSource === "supabase-live",
  "All five transformed readers execute the Development contract without a browser process global");

  // Exercise the actual entrypoint and actual handler; inject only its declared external dependencies.
  const handler = load("supabase/functions/meal-photo-analysis/handler.ts");
  const errors = load("supabase/functions/meal-photo-analysis/errors.ts");
  let serve, authCalls = 0, handlerCalls = 0, mode = "auth-denied";
  const deps = {
    loadServerConfig: () => ({ ok: true, value: { supabaseUrl: devUrl, supabaseAnonKey: publicKey } }),
    authenticateCaller: async () => { authCalls++; return mode === "auth-accepted"
      ? { ok: true, value: { userId: "00000000-0000-4000-8000-000000000001", userScopedClient: {} } }
      : { ok: false }; },
    downloadAndValidateImage: noNetwork, createAdminClient: noNetwork, createProvider: noNetwork, generateCandidateId: randomUUID
  };
  const entryContext = vm.createContext({ Request, Response, Headers, Deno: { serve: (callback) => { serve = callback; } } });
  const entryModule = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${compile(read(edgePath), edgePath)}\n})`, entryContext)((id) => {
    if (id === "./errors.ts") return errors;
    if (id !== "./handler.ts") throw new Error("Unexpected Edge dependency");
    return { createDefaultDependencies: () => deps, processMealPhotoAnalysisRequest: (request, passed) => {
      handlerCalls++;
      if (passed !== deps) throw new Error("Entrypoint replaced handler dependencies");
      if (mode === "throw") throw new Error("PRIVATE_INTERNAL_SENTINEL");
      if (mode === "success") return new Response("test-success", { status: 200, headers: { Vary: "Accept", "x-test": "preserved" } });
      return handler.processMealPhotoAnalysisRequest(request, passed);
    } };
  }, entryModule, entryModule.exports);
  const origin = "https://haocu-demo.vercel.app";
  const request = (method, originValue = origin, extra = {}) => new Request("https://local.test/analysis", {
    method, headers: { ...(originValue === undefined ? {} : { Origin: originValue }), ...extra },
    ...(method === "POST" ? { body: "{}" } : {})
  });
  const preflight = await serve(request("OPTIONS", origin, {
    "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, apikey, content-type, x-client-info"
  }));
  expect(preflight.status === 204 && preflight.headers.get("Access-Control-Allow-Origin") === origin
    && preflight.headers.get("Vary") === "Origin" && preflight.headers.get("Access-Control-Allow-Methods") === "POST, OPTIONS"
    && preflight.headers.get("Access-Control-Allow-Headers") === "authorization, apikey, content-type, x-client-info"
    && authCalls === 0 && handlerCalls === 0, "Exact-origin OPTIONS negotiates Supabase headers without running analysis");
  for (const badOrigin of ["https://evil.test", origin + ".evil.test", origin + "/", "null", origin.replace("https", "http")]) {
    const denied = await serve(request("OPTIONS", badOrigin, { "Access-Control-Request-Method": "POST" }));
    expect(denied.status === 403 && !denied.headers.has("Access-Control-Allow-Origin"), `Preflight does not authorize ${badOrigin}`);
  }
  expect((await serve(request("OPTIONS", origin, { "Access-Control-Request-Method": "DELETE" }))).status === 403,
    "Preflight cannot authorize unrelated methods");
  expect((await serve(request("OPTIONS", origin, { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-unapproved" }))).status === 403,
    "Preflight cannot authorize unrelated headers");
  const deniedPost = await serve(request("POST"));
  expect(deniedPost.status === 401 && authCalls === 1 && handlerCalls === 1
    && deniedPost.headers.get("Access-Control-Allow-Origin") === origin, "POST still enters the real handler/auth boundary; auth errors carry exact CORS");
  mode = "auth-accepted";
  const authenticated = await serve(request("POST"));
  expect(authenticated.status === 400 && authCalls === 2 && handlerCalls === 2
    && authenticated.headers.get("Access-Control-Allow-Origin") === origin, "Authenticated POST reaches unchanged request validation");
  mode = "success";
  const success = await serve(request("POST"));
  expect(success.status === 200 && await success.text() === "test-success" && success.headers.get("x-test") === "preserved"
    && success.headers.get("Vary") === "Accept, Origin" && success.headers.get("Access-Control-Allow-Origin") === origin,
    "Successful response decoration preserves body, status, headers and existing Vary");
  const external = await serve(request("POST", "https://evil.test"));
  expect(external.status === 200 && !external.headers.has("Access-Control-Allow-Origin"), "Other origins receive no browser authorization; CORS is not POST authentication");
  const noOrigin = await serve(new Request("https://local.test/analysis", { method: "POST", body: "{}" }));
  expect(noOrigin.status === 200 && !noOrigin.headers.has("Access-Control-Allow-Origin"), "Non-browser POST remains supported");
  mode = "throw";
  const failure = await serve(request("POST"));
  expect(failure.status === 500 && failure.headers.get("Access-Control-Allow-Origin") === origin
    && !(await failure.text()).includes("PRIVATE_INTERNAL_SENTINEL"), "Caught errors retain CORS without exposing internal details");
  expect(/\[functions\.meal-photo-analysis\][\s\S]*?verify_jwt\s*=\s*true/.test(read("supabase/config.toml"))
    && blocked.length === 0, "JWT verification remains enabled; transport tests performed zero external operations");

  // Execute the REAL guard with an in-memory Git/filesystem view; never mutate working files.
  function guardProbe({ paths = manifest, frozen = false, originRef = base, parent = base, subject = "Activate Development AI for public demo", authTamper = false } = {}) {
    let report;
    const output = (args) => {
      if (args[0] === "status") return frozen ? "" : paths.map((file) => ` M ${file}\0`).join("");
      if (args[0] === "branch") return "main";
      if (args[0] === "rev-parse") return args[1] === "origin/main" ? originRef : args[1] === "HEAD^" ? parent : frozen ? "frozen-fixture-sha" : base;
      if (args[0] === "show") return args.includes("--format=%P") ? parent : subject;
      if (args[0] === "diff") return args.includes(base) ? (frozen ? paths.join("\n") : "") : (frozen ? "" : paths.join("\n"));
      throw new Error(`Unexpected guard git command: ${args[0]}`);
    };
    const guard = read(guardPath).replace(/^import .*;\r?\n/gm, "");
    vm.runInNewContext(guard, {
      fs: { ...fs, readFileSync: (file, encoding) => {
        const source = fs.readFileSync(file, encoding);
        return authTamper && file === path.join(root, authFlagsPath) ? source + "\n// unauthorized mutation\n" : source;
      } }, path, createHash,
      spawnSync: (_command, args) => ({ stdout: output(args), status: 0 }),
      process: { cwd: () => root, exit: () => {}, exitCode: 0 },
      console: { log: (json) => { report = JSON.parse(json); } }
    }, { filename: guardPath });
    return report;
  }
  expect(guardProbe().passed === 37 && guardProbe({ frozen: true }).passed === 37,
    "Predecessor guard remains 37/37 for exact candidate and exact frozen-local successor");
  for (const file of manifest) {
    expect(guardProbe({ paths: manifest.filter((entry) => entry !== file) }).failed > 0
      && guardProbe({ frozen: true, paths: manifest.filter((entry) => entry !== file) }).failed > 0,
    `Exact successor rejects missing required path: ${file}`);
  }
  for (const probe of [
    { paths: [...manifest, "README.md"] }, { frozen: true, paths: [...manifest, "README.md"] },
    { authTamper: true }, { frozen: true, authTamper: true }, { originRef: "wrong-origin" },
    { frozen: true, parent: "wrong-parent" }, { frozen: true, subject: "arbitrary successor" }
  ]) expect(guardProbe(probe).failed > 0, `Guard rejects unauthorized successor: ${JSON.stringify(probe)}`);

  const exportArg = process.argv.indexOf("--export-dir");
  if (exportArg !== -1) {
    const exportRoot = path.resolve(process.argv[exportArg + 1]);
    const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? collect(file) : /\.(js|html|json)$/.test(file) ? [file] : [];
    });
    const files = collect(exportRoot);
    const bundle = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(files.some((file) => file.endsWith(".js")) && fs.existsSync(path.join(exportRoot, "index.html")), "Controlled Expo export contains browser JS and entry HTML");
    expect(bundle.includes(publicKey) && bundle.includes(devUrl) && bundle.includes("supabase-live"), "Controlled export contains the safe public Development contract");
    expect(![...Object.keys(dev)].some((key) => bundle.includes("process.env." + key)), "Controlled browser export has no unresolved required activation lookups");
    expect(!Object.entries(serverSentinels).some(([key, value]) => bundle.includes(key) || bundle.includes(value)), "Controlled browser export contains no server-secret names or sentinels");
  }
  console.log(JSON.stringify({ suite: "public-demo-real-ai-activation", status: "passed", passed: checks.length, failed: 0,
    checks, networkUsed: false, credentialsUsed: false }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ suite: "public-demo-real-ai-activation", status: "failed", checks,
    error: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
}
