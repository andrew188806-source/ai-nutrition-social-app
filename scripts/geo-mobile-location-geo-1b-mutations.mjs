#!/usr/bin/env node
// GEO-1B mutation suite.
//
// Every mutation below is a defect a reviewer could plausibly ship: a background permission slipped
// into the port, a coordinate written to storage "just for convenience", a permission dialog raised
// on mount, a distance helper added on the handset, a session that leaks one account's position to
// the next. Each is applied to the source text IN MEMORY and must be KILLED by the shared
// invariants. The repository is never written to.
import fs from "node:fs";
import path from "node:path";
import {
  GEO1B_PATHS,
  auditGeo1bAuthoredSources
} from "./geo-mobile-location-geo-1b-successor-manifest.mjs";

const SUITE = "geo-mobile-location-geo-1b-mutations";
const root = process.cwd();
const TYPES = "apps/mobile/features/consumer-location/types.ts";
const CONTROLLER = "apps/mobile/features/consumer-location/controller.ts";
const PORT = "apps/mobile/features/consumer-location/expoLocationPort.ts";
const HOOK = "apps/mobile/features/consumer-location/useConsumerLocation.ts";
const APP_JSON = "apps/mobile/app.json";
const MOBILE_PACKAGE = "apps/mobile/package.json";

const pristine = Object.fromEntries(
  GEO1B_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package-lock.json")
    .map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 320)}`);
};

check("pristine GEO-1B source satisfies every invariant",
  auditGeo1bAuthoredSources(pristine).length === 0, auditGeo1bAuthoredSources(pristine));

const MUTATIONS = [
  // --- foreground only -----------------------------------------------------------------------------
  ["background permission is requested", PORT,
    (s) => s.replace("requestForegroundPermissionsAsync()", "requestBackgroundPermissionsAsync()")],
  ["a background permission helper is added alongside the foreground one", PORT,
    (s) => `${s}\nexport const always = () => requestBackgroundPermissionsAsync();\n`],
  ["continuous position watching is introduced", PORT,
    (s) => `${s}\nexport const track = (cb) => watchPositionAsync({}, cb);\n`],
  ["a background task is registered", PORT,
    (s) => `${s}\nexport const register = () => TaskManager.defineTask("geo", () => {});\n`],
  ["geofencing is introduced", PORT,
    (s) => `${s}\nexport const fence = () => startGeofencingAsync("geo", []);\n`],
  ["the highest available precision is requested", PORT,
    (s) => s.replace("location.Accuracy?.Balanced", "location.Accuracy?.Highest")],
  // Targets the CALL SITE, not the first textual occurrence: the module's own prose names the
  // foreground API too, and a mutation that lands in a comment is erased before the audit sees it.
  ["the foreground permission read is swapped for the unscoped one", PORT,
    (s) => s.replace("location.getForegroundPermissionsAsync()", "location.getPermissionsAsync()")],

  // --- no automatic acquisition ----------------------------------------------------------------
  ["binding an actor silently acquires a position", CONTROLLER,
    (s) => s.replace("this.update(Object.freeze({ phase: \"idle\" }));",
      "this.update(Object.freeze({ phase: \"idle\" })); await this.device.getCurrentPosition();")],
  ["binding an actor silently prompts", CONTROLLER,
    (s) => s.replace("this.update(Object.freeze({ phase: \"idle\" }));",
      "this.update(Object.freeze({ phase: \"idle\" })); await this.device.requestPermission();")],
  ["the hook acquires on mount", HOOK,
    (s) => s.replace("void controller.setActor(actorKey, actorGeneration);",
      "void controller.setActor(actorKey, actorGeneration); void controller.requestAndAcquire();")],
  ["the explicit action is removed from the hook", HOOK,
    (s) => s.replace("enable: () => controller.requestAndAcquire()", "enable: () => false")],

  // --- permission semantics --------------------------------------------------------------------
  ["the retryable-versus-final denial distinction is collapsed", TYPES,
    (s) => s.replace('phase: "denied"; canAskAgain: boolean', 'phase: "denied"')],
  ["the one-prompt-per-session limit is removed", CONTROLLER,
    (s) => s.replace(/promptedThisSession/g, "promptedNever")],
  ["disabled location services are reported as a denial", TYPES,
    (s) => s.replace('| Readonly<{ phase: "services_disabled" }>', "")],
  ["the unsupported resting state is removed", TYPES,
    (s) => s.replace('| Readonly<{ phase: "unsupported" }>', "")],
  ["the acquiring state is removed", TYPES,
    (s) => s.replace('| Readonly<{ phase: "acquiring" }>', "")],

  // --- coordinate validity ---------------------------------------------------------------------
  ["a non-finite coordinate stops failing closed", TYPES,
    (s) => s.replace("if (!finite(latitude) || !finite(longitude)) return null;", "")],
  ["the latitude bound is widened", TYPES,
    (s) => s.replace("CONSUMER_LOCATION_LATITUDE_MIN = -90", "CONSUMER_LOCATION_LATITUDE_MIN = -900")],
  ["the longitude bound is widened", TYPES,
    (s) => s.replace("CONSUMER_LOCATION_LONGITUDE_MIN = -180", "CONSUMER_LOCATION_LONGITUDE_MIN = -1800")],

  // --- session scope ----------------------------------------------------------------------------
  ["signing out stops dropping the held position", CONTROLLER,
    (s) => s.replace("if (!actorKey) return this.update(SIGNED_OUT);", "if (!actorKey) return;")],
  ["an actor change no longer invalidates in-flight work", CONTROLLER,
    (s) => s.replace(/this\.requestSequence \+= 1;\n    this\.promptedThisSession = false;/,
      "this.promptedThisSession = false;")],
  ["disposal keeps the last position", CONTROLLER,
    (s) => s.replace("this.state = SIGNED_OUT;\n    this.listeners.clear();", "this.listeners.clear();")],
  ["the staleness guard stops checking the actor generation", CONTROLLER,
    (s) => s.replace("&& request.actorKey === this.actorKey && request.actorGeneration === this.actorGeneration",
      "")],

  // --- persistence and leakage ---------------------------------------------------------------------
  ["the coordinate is persisted to device storage", CONTROLLER,
    (s) => `${s}\nexport const persistLocation = (p) => AsyncStorage.setItem("geo", JSON.stringify(p));\n`],
  ["the coordinate is written to secure storage", CONTROLLER,
    (s) => `${s}\nexport const save = (p) => SecureStore.setItemAsync("geo", String(p));\n`],
  ["the coordinate is attached to a public profile projection", TYPES,
    (s) => `${s}\nexport type Leak = { publicProfile: ConsumerLocationPosition };\n`],
  ["the coordinate is attached to a Meal Buddy card", TYPES,
    (s) => `${s}\nexport type CardLeak = { mealBuddyCard: ConsumerLocationPosition };\n`],
  ["a location history buffer is introduced", TYPES,
    (s) => `${s}\nexport type History = { locationHistory: ConsumerLocationPosition[] };\n`],
  ["user-to-user location sharing is introduced", TYPES,
    (s) => `${s}\nexport type Share = { shareLocationWith: string };\n`],

  // --- a second distance authority ----------------------------------------------------------------
  ["a haversine implementation appears on Mobile", CONTROLLER,
    (s) => `${s}\nexport const between = (a, b) => Math.asin(a - b);\n`],
  ["an earth radius constant appears on Mobile", TYPES,
    (s) => `${s}\nexport const EARTH_RADIUS = 6371;\n`],
  ["a degrees-to-radians helper appears on Mobile", TYPES,
    (s) => `${s}\nexport const toRadians = (d) => d * Math.PI / 180;\n`],
  ["radius filtering is performed on Mobile", TYPES,
    (s) => `${s}\nexport const near = (d) => d.distanceMeters <= 3000;\n`],
  ["map browsing UI is pulled into the feature", TYPES,
    (s) => `${s}\nexport type Marker = { mapMarker: string };\n`],
  ["route planning is pulled into the feature", TYPES,
    (s) => `${s}\nexport type Route = { turnByTurn: boolean };\n`],

  // --- platform configuration --------------------------------------------------------------------
  ["background location is enabled on iOS", APP_JSON,
    (s) => s.replace('"isIosBackgroundLocationEnabled": false', '"isIosBackgroundLocationEnabled": true')],
  ["background location is enabled on Android", APP_JSON,
    (s) => s.replace('"isAndroidBackgroundLocationEnabled": false', '"isAndroidBackgroundLocationEnabled": true')],
  ["an always-on permission string is declared", APP_JSON,
    (s) => s.replace('"locationAlwaysPermission": false', '"locationAlwaysPermission": "always"')],
  ["the foreground permission string is removed", APP_JSON,
    (s) => s.replace(/"locationWhenInUsePermission": "[^"]*"/, '"locationWhenInUsePermissionRemoved": ""')],
  ["a background mode is declared", APP_JSON,
    (s) => s.replace('"web": {', '"UIBackgroundModes": ["location"],\n    "web": {')],
  ["the location dependency is dropped", MOBILE_PACKAGE,
    (s) => s.replace(/"expo-location": "[^"]*",?\n?/, "")]
];

for (const [label, file, mutate] of MUTATIONS) {
  const mutated = { ...pristine, [file]: mutate(pristine[file]) };
  if (mutated[file] === pristine[file]) {
    check(`${label} is killed`, false, "mutation did not change the source");
    continue;
  }
  check(`${label} is killed`, auditGeo1bAuthoredSources(mutated).length > 0);
}

check("the repository was never written to during mutation",
  Object.keys(pristine).every((file) =>
    fs.readFileSync(path.join(root, file), "utf8") === pristine[file]));

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
