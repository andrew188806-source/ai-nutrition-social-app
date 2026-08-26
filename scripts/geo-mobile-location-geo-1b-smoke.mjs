#!/usr/bin/env node
// GEO-1B behavioural smoke — the REAL Mobile location controller driven against a deterministic
// in-process device double. No network, no database, no credentials, no Development, no handset.
//
// Everything that lives in the controller is executed for real. The rules that live only in JSX are
// asserted against the frozen component contract and are named as such.
import fs from "node:fs"; import path from "node:path"; import Module from "node:module";
const root = process.cwd();
const require_ = Module.createRequire(import.meta.url);
const ts = require_("typescript");

require_.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, isolatedModules: true },
    fileName: filename
  });
  module._compile(out.outputText, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith(".") && parent?.filename) {
    const base = path.resolve(path.dirname(parent.filename), request);
    for (const ext of [".ts", ".tsx"]) if (fs.existsSync(base + ext)) return base + ext;
  }
  return origResolve.call(this, request, parent, ...rest);
};

const FEATURE = path.join(root, "apps/mobile/features/consumer-location");
const { ConsumerLocationController } = require_(path.join(FEATURE, "controller.ts"));
const { parseConsumerLocationPosition, CONSUMER_LOCATION_ACCURACY } = require_(path.join(FEATURE, "types.ts"));

const SUITE = "geo-mobile-location-geo-1b-smoke";
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 420)}`);
};

const POSITION = Object.freeze({
  latitude: 25.033964, longitude: 121.564468, accuracyMeters: 42, acquiredAt: "2026-08-26T00:00:00.000Z"
});

// A device double that records every call, so anything the controller does on its own — a prompt
// nobody asked for, an acquisition on sign-in — is immediately visible.
function deviceDouble(overrides = {}) {
  const calls = [];
  const device = {
    supported: overrides.supported ?? true,
    async getPermission() {
      calls.push("getPermission");
      return overrides.permission ?? { status: "undetermined", canAskAgain: true };
    },
    async requestPermission() {
      calls.push("requestPermission");
      return overrides.requested ?? { status: "granted", canAskAgain: false };
    },
    async hasServicesEnabled() {
      calls.push("hasServicesEnabled");
      return overrides.servicesEnabled ?? true;
    },
    async getCurrentPosition() {
      calls.push("getCurrentPosition");
      if (overrides.onAcquire) await overrides.onAcquire();
      return overrides.position === undefined ? POSITION : overrides.position;
    }
  };
  return { calls, device };
}
const controllerFor = (overrides) => {
  const { calls, device } = deviceDouble(overrides);
  return { calls, controller: new ConsumerLocationController(device) };
};

// --- resting states ------------------------------------------------------------------------------
{
  const { controller } = controllerFor();
  check("a fresh controller is signed out", controller.getState().phase === "signed_out");
  await controller.setActor("actor-a", 1);
  check("binding an actor rests at idle", controller.getState().phase === "idle");
}
{
  const { calls, controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  check("binding an actor NEVER prompts and NEVER acquires", calls.length === 0, calls);
}
{
  const { controller } = controllerFor({ supported: false });
  await controller.setActor("actor-a", 1);
  check("an unsupported platform rests at unsupported, never at an error",
    controller.getState().phase === "unsupported");
}
{
  const { calls, controller } = controllerFor({ supported: false });
  await controller.setActor("actor-a", 1);
  check("an unsupported platform never reaches the device at all",
    (await controller.requestAndAcquire()) === false && calls.length === 0);
}

// --- the happy path ------------------------------------------------------------------------------
{
  const { calls, controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  const phases = [];
  controller.subscribe((state) => phases.push(state.phase));
  const ok = await controller.requestAndAcquire();
  const state = controller.getState();
  check("an explicit request prompts, then acquires", ok === true
    && calls.join(",") === "getPermission,requestPermission,hasServicesEnabled,getCurrentPosition", calls);
  check("the state passes through prompting and acquiring to available",
    phases.join(",") === "idle,prompting,acquiring,available", phases);
  check("the available state carries the validated position",
    state.phase === "available" && state.position.latitude === POSITION.latitude
    && state.position.longitude === POSITION.longitude, state);
  check("the position carries acquisition metadata and nothing else",
    Object.keys(state.position).sort().join(",") === "accuracyMeters,acquiredAt,latitude,longitude",
    Object.keys(state.position));
}
{
  const { calls, controller } = controllerFor({ permission: { status: "granted", canAskAgain: false } });
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  check("an already-granted permission is not re-prompted",
    !calls.includes("requestPermission"), calls);
}

// --- refusal is a settled state ---------------------------------------------------------------
{
  const { controller } = controllerFor({ requested: { status: "denied", canAskAgain: true } });
  await controller.setActor("actor-a", 1);
  const ok = await controller.requestAndAcquire();
  const state = controller.getState();
  check("a refusal that can be asked again is recorded as such",
    ok === false && state.phase === "denied" && state.canAskAgain === true, state);
}
{
  const { controller } = controllerFor({ requested: { status: "denied", canAskAgain: false } });
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  check("a final refusal is distinguished from a retryable one",
    controller.getState().canAskAgain === false);
}
{
  const { calls, controller } = controllerFor({ requested: { status: "denied", canAskAgain: true } });
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  const before = calls.filter((entry) => entry === "requestPermission").length;
  await controller.requestAndAcquire();
  const after = calls.filter((entry) => entry === "requestPermission").length;
  check("at most one prompt is raised per session", before === 1 && after === 1, calls);
}
{
  const { calls, controller } = controllerFor({ permission: { status: "denied", canAskAgain: false } });
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  check("a permanently denied permission is never prompted again",
    !calls.includes("requestPermission") && controller.getState().phase === "denied", calls);
}

// --- device and acquisition failures --------------------------------------------------------------
{
  const { controller } = controllerFor({ servicesEnabled: false });
  await controller.setActor("actor-a", 1);
  const ok = await controller.requestAndAcquire();
  check("disabled location services are their own state, not a denial",
    ok === false && controller.getState().phase === "services_disabled");
}
{
  const { controller } = controllerFor({ position: null });
  await controller.setActor("actor-a", 1);
  const ok = await controller.requestAndAcquire();
  const state = controller.getState();
  check("an unusable reading fails closed and is recoverable",
    ok === false && state.phase === "failed" && state.errorCode === "position_unavailable", state);
}
{
  const { controller } = controllerFor({ permission: { status: "denied", canAskAgain: true } });
  await controller.setActor("actor-a", 1);
  check("refresh never prompts", (await controller.refresh()) === false
    && controller.getState().phase === "denied");
}

// --- session scope is the privacy model ------------------------------------------------------------
{
  const { controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  check("a position is held for the signed-in actor", controller.getState().phase === "available");
  await controller.setActor(null, 1);
  check("signing out drops the held position immediately",
    controller.getState().phase === "signed_out" && !("position" in controller.getState()));
}
{
  const { controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  await controller.setActor("actor-b", 2);
  const state = controller.getState();
  check("a second account never inherits the first account's position",
    state.phase === "idle" && !("position" in state), state);
}
{
  const { controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  await controller.setActor("actor-a", 2);
  check("a new session generation for the SAME account also drops the position",
    controller.getState().phase === "idle");
}
{
  const { calls, controller } = controllerFor({ requested: { status: "denied", canAskAgain: true } });
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  await controller.setActor("actor-b", 2);
  await controller.requestAndAcquire();
  check("prompt history does not carry across a change of actor",
    calls.filter((entry) => entry === "requestPermission").length === 2, calls);
}
{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { controller } = controllerFor({
    permission: { status: "granted", canAskAgain: false },
    onAcquire: () => gate
  });
  await controller.setActor("actor-a", 1);
  const pending = controller.requestAndAcquire();
  await controller.setActor("actor-b", 2);
  release();
  await pending;
  check("an acquisition already in flight cannot publish after the actor changed",
    controller.getState().phase === "idle", controller.getState());
}
{
  const { controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  controller.clear();
  check("clearing forgets the position without changing the permission decision",
    controller.getState().phase === "idle");
}
{
  const { controller } = controllerFor();
  await controller.setActor("actor-a", 1);
  await controller.requestAndAcquire();
  controller.dispose();
  check("disposal drops the position", controller.getState().phase === "signed_out");
  check("a disposed controller acquires nothing", (await controller.requestAndAcquire()) === false);
}

// --- coordinate validity ---------------------------------------------------------------------------
check("a valid coordinate parses and is frozen", (() => {
  const parsed = parseConsumerLocationPosition(25.5, 121.5, 10, "2026-08-26T00:00:00.000Z");
  return parsed !== null && Object.isFrozen(parsed) && parsed.accuracyMeters === 10;
})());
check("the poles and the antimeridian are inclusive",
  parseConsumerLocationPosition(90, 180, null, "t") !== null
  && parseConsumerLocationPosition(-90, -180, null, "t") !== null);
for (const [label, lat, lng] of [
  ["a latitude past the pole", 90.0001, 0],
  ["a longitude past the antimeridian", 0, 180.0001],
  ["a NaN latitude", Number.NaN, 0],
  ["an infinite longitude", 0, Number.POSITIVE_INFINITY],
  ["a string coordinate", "25", 121.5],
  ["a null coordinate", null, 121.5]
]) {
  check(`${label} is rejected`, parseConsumerLocationPosition(lat, lng, null, "t") === null);
}
check("a negative or non-finite accuracy degrades to unknown rather than being trusted",
  parseConsumerLocationPosition(25, 121, -5, "t").accuracyMeters === null
  && parseConsumerLocationPosition(25, 121, Number.NaN, "t").accuracyMeters === null);
check("the accuracy policy is balanced, not the highest available",
  CONSUMER_LOCATION_ACCURACY === "balanced");

// --- the component contract, and the absence of a second distance authority -----------------------
const source = (file) => fs.readFileSync(path.join(FEATURE, file), "utf8");
const card = source("ConsumerLocationPermissionCard.tsx");
const featureCode = ["types.ts", "controller.ts", "expoLocationPort.ts", "useConsumerLocation.ts",
  "index.ts", "ConsumerLocationPermissionCard.tsx"].map(source).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");

check("the card renders nothing once a position is available, and nothing when signed out",
  /state\.phase === "signed_out" \|\| state\.phase === "unsupported" \|\| state\.phase === "available"/.test(card)
  && /return null;/.test(card));
check("the card offers a retry only where a retry can succeed",
  /state\.canAskAgain \? copy\.denied : copy\.deniedForever/.test(card)
  && /state\.canAskAgain \? \(/.test(card));
check("the card never blocks or gates the surrounding screen",
  !/Modal|blocking|disabled=\{true\}|pointerEvents="none"/.test(card));
check("the feature contains no distance arithmetic of its own",
  !/Math\.(sin|cos|asin|atan2|sqrt)|haversine|6371/i.test(featureCode));
check("the feature performs no radius filtering",
  !/withinRadius|radiusMeters|distanceMeters/i.test(featureCode));
check("the feature never persists a coordinate",
  !/AsyncStorage|SecureStore|localStorage|storage\./i.test(featureCode));
// Location-specific by construction: a bare /Background/ would match `backgroundColor` in a
// StyleSheet and fail on ordinary styling.
check("the feature never requests background permission or watches position",
  !/BackgroundPermissions|BackgroundLocation|ACCESS_BACKGROUND_LOCATION|watchPosition|TaskManager|geofenc/i
    .test(featureCode));
check("no coordinate reaches a Social or public projection",
  !/publicProfile|communityCard|candidateDto|mealBuddyCard|socialProfile/i.test(featureCode));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name),
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
