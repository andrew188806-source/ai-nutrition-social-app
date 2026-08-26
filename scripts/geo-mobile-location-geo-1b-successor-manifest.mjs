// GEO-1B canonical manifest, lifecycle and source invariants.
//
// One definition shared by the guard (which reads the real tree) and the mutation suite (which reads
// mutated text), so the two can never drift apart and quietly disagree about what GEO-1B is.
import crypto from "node:crypto";
import { GEO1CP0_PATHS } from "./geo-coordinate-source-geo-1c-p0-successor-manifest.mjs";

export const GEO1B_BASELINE = "1e8e881ec74f5e9a70fcd0806867f9639e47b709";
export const GEO1B_BASELINE_SUBJECT = "Add shared Geo candidate authority";

export const GEO1B_FEATURE_ROOT = "apps/mobile/features/consumer-location/";

// The product surface GEO-1B contributes. Everything else in the manifest is configuration or
// validation.
export const GEO1B_PRODUCT_PATHS = Object.freeze([
  "apps/mobile/features/consumer-location/ConsumerLocationPermissionCard.tsx",
  "apps/mobile/features/consumer-location/controller.ts",
  "apps/mobile/features/consumer-location/expoLocationPort.ts",
  "apps/mobile/features/consumer-location/index.ts",
  "apps/mobile/features/consumer-location/types.ts",
  "apps/mobile/features/consumer-location/useConsumerLocation.ts"
]);

// Predecessor validation amended for successor awareness ONLY, from measured sweep evidence.
//
// Fifteen guards pin package.json against their own frozen baseline and learn GEO-1B's three command
// keys, named exactly. GEO-1A additionally learns to recognise a GEO-1B successor rather than
// reporting its mere existence as a defect. SR-2K-B is SELF-SCOPED to its own freeze commit: it used
// to measure its authored delta against the worktree, so any successor editing a shared file — the
// i18n bundle, the Mobile package — had those lines judged against SR-2K-B's rules. Pinning it to
// its own freeze is strictly more exact and cannot drift again.
//
// No assertion is weakened, no forbidden feature is unbanned, and no product byte is touched.
export const GEO1B_PREDECESSOR_GUARDS = Object.freeze([
  "scripts/geo-shared-authority-geo-1a-guard.mjs",
  "scripts/geo-shared-authority-geo-1a-successor-manifest.mjs",
  "scripts/meal-buddy-closure-sr2k-a-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs",
  "scripts/meal-buddy-relationship-sr2i-b-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/social-candidate-sr2g-e1-guard.mjs",
  "scripts/social-candidate-sr2g-e2-guard.mjs",
  "scripts/social-candidate-sr2g-f-guard.mjs",
  "scripts/social-candidate-sr2g-g-guard.mjs",
  "scripts/social-candidate-sr2h-a-guard.mjs",
  "scripts/social-exposure-sr2b-guard.mjs",
  "scripts/social-final-sr2k-b-guard.mjs",
  "scripts/social-final-sr2k-b-mutations.mjs",
  "scripts/social-final-sr2k-b-successor-manifest.mjs",
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs"
]);

export const GEO1B_NPM_KEYS = Object.freeze([
  "test:geo-mobile-location-geo-1b",
  "test:geo-mobile-location-geo-1b-smoke",
  "test:geo-mobile-location-geo-1b-mutations"
]);

// Read from expo's own bundledNativeModules for SDK 54, not guessed.
export const GEO1B_EXPO_LOCATION_RANGE = "~19.0.8";

export const GEO1B_PATHS = Object.freeze([
  ...GEO1B_PRODUCT_PATHS,
  ...GEO1B_PREDECESSOR_GUARDS,
  "apps/mobile/app.json",
  "apps/mobile/package.json",
  "lib/i18n/zh-TW.ts",
  "package-lock.json",
  "package.json",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-mutations.mjs",
  "scripts/geo-mobile-location-geo-1b-smoke.mjs",
  "scripts/geo-mobile-location-geo-1b-successor-manifest.mjs"
].sort());

// GEO-1B owns foreground acquisition and nothing else. Matched against PRODUCT source with comments
// stripped: the validation harnesses must name every forbidden capability in order to test for it,
// and this file's own prose names them too.
export const GEO1B_FORBIDDEN_FEATURES = Object.freeze([
  ["background permission", /requestBackgroundPermissions|getBackgroundPermissions|ACCESS_BACKGROUND_LOCATION|allowsBackgroundLocationUpdates/i],
  ["continuous position watching", /watchPositionAsync|watchHeadingAsync|startLocationUpdatesAsync|removeWatchAsync/i],
  ["background task registration", /TaskManager|defineTask|startGeofencingAsync|BackgroundFetch/i],
  ["geofencing", /geofenc/i],
  ["location history", /locationHistory|location_history|positionHistory|trackHistory|breadcrumb/i],
  ["map browsing UI", /react-native-maps|MapView|mapMarker|markerCluster/i],
  ["route or navigation", /turnByTurn|routePlanning|directionsService|navigationRoute/i],
  ["travel time or traffic", /travelTime|etaMinutes|trafficLevel|durationInTraffic/i],
  ["location sharing between users", /shareLocationWith|liveLocation|broadcastLocation/i],
  ["persistence of a coordinate", /AsyncStorage|SecureStore|localStorage|storage\.setItem|persistLocation|saveCoordinate/i],
  ["a public or Social projection of the coordinate", /publicProfile|communityCard|candidateDto|mealBuddyCard|socialProfile/i]
]);

// A distance formula must exist in exactly one place: the GEO-1A database authority.
export const GEO1B_FORBIDDEN_DISTANCE = Object.freeze([
  ["a haversine implementation", /haversine|Math\.asin|Math\.atan2/i],
  ["an earth radius constant", /637100|6371\b|EARTH_RADIUS/i],
  ["a degrees-to-radians conversion", /Math\.PI\s*\/\s*180|toRadians|deg2rad/i],
  ["a trigonometric term", /Math\.(?:sin|cos|tan|sqrt)\s*\(/i],
  ["a radius comparison", /withinRadius|radiusMeters|distanceMeters|<=\s*radius/i]
]);

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)\/\/[^\n]*/g, "$1");

export function auditGeo1bAuthoredSources(sources) {
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };
  const get = (suffix) => {
    const key = Object.keys(sources).find((path) => path.endsWith(suffix));
    return key ? sources[key] : "";
  };
  const types = get("consumer-location/types.ts");
  const controller = get("consumer-location/controller.ts");
  const port = get("consumer-location/expoLocationPort.ts");
  const hook = get("consumer-location/useConsumerLocation.ts");
  const card = get("consumer-location/ConsumerLocationPermissionCard.tsx");
  const barrel = get("consumer-location/index.ts");
  const appJson = get("apps/mobile/app.json");
  const mobilePackage = get("apps/mobile/package.json");
  const product = `${types}\n${controller}\n${port}\n${hook}\n${card}\n${barrel}`;
  const code = stripComments(product);
  const portCode = stripComments(port);
  const controllerCode = stripComments(controller);
  const hookCode = stripComments(hook);

  // --- foreground only ---------------------------------------------------------------------------
  // Presence alone is not enough: the name appears in the module type, the availability probe and
  // the call site, so swapping ONE of them for a non-foreground variant leaves the others behind.
  // The decisive rule is therefore the absence of any non-foreground permission API in this file.
  rule("the port requests FOREGROUND permission",
    /requestForegroundPermissionsAsync/.test(portCode)
    && /getForegroundPermissionsAsync/.test(portCode)
    && !/(?<!Foreground|Background)(?:get|request)PermissionsAsync/.test(portCode));
  rule("one position is read, never a stream",
    /getCurrentPositionAsync/.test(portCode));
  rule("minimum necessary precision is requested, not the highest available",
    /Accuracy\?\.Balanced/.test(portCode) && !/Accuracy\?\.Highest|Accuracy\.Highest|BestForNavigation/.test(portCode));

  // --- no automatic acquisition -------------------------------------------------------------------
  // Bounded to setActor's OWN body. A fixed-width window would run past the closing brace into the
  // next method and match `requestAndAcquire`'s own declaration, so the rule would pass on a
  // controller that really did acquire on sign-in.
  const setActorBody = (() => {
    const start = controllerCode.indexOf("async setActor(");
    if (start === -1) return "";
    const end = controllerCode.indexOf("\n  }", start);
    return end === -1 ? controllerCode.slice(start) : controllerCode.slice(start, end);
  })();
  rule("binding an actor never prompts and never acquires",
    setActorBody.length > 0
    && !/requestAndAcquire|requestPermission\(|getCurrentPosition\(|acquire\(/.test(setActorBody));
  rule("the hook never acquires on mount",
    !/useEffect\([^)]*\)\s*=>\s*\{?\s*void controller\.(?:requestAndAcquire|refresh)/.test(hookCode)
    && !/controller\.requestAndAcquire\(\)\s*;/.test(hookCode.replace(/enable:\s*\(\)\s*=>\s*controller\.requestAndAcquire\(\)/, "")));
  rule("acquisition is reachable only through an explicit action",
    /enable: \(\) => controller\.requestAndAcquire\(\)/.test(hookCode));

  // --- permission state model ---------------------------------------------------------------------
  for (const phase of ["signed_out", "idle", "unsupported", "prompting", "denied",
    "services_disabled", "acquiring", "available", "failed"]) {
    rule(`the state model distinguishes ${phase}`, new RegExp(`phase: "${phase}"`).test(types));
  }
  rule("a denial preserves whether it can be asked again",
    /canAskAgain/.test(types) && /phase: "denied"; canAskAgain: boolean/.test(types));
  rule("at most one prompt is raised per session",
    /promptedThisSession/.test(controllerCode));

  // --- coordinate validity ---------------------------------------------------------------------
  // Terminated at `as const`, because `-90` is a prefix of `-900`: a widened bound would otherwise
  // still satisfy a bare prefix match.
  rule("coordinates are range-checked against the canonical WGS84 bounds",
    /CONSUMER_LOCATION_LATITUDE_MIN = -90 as const/.test(types)
    && /CONSUMER_LOCATION_LATITUDE_MAX = 90 as const/.test(types)
    && /CONSUMER_LOCATION_LONGITUDE_MIN = -180 as const/.test(types)
    && /CONSUMER_LOCATION_LONGITUDE_MAX = 180 as const/.test(types));
  rule("a non-finite coordinate fails closed",
    /Number\.isFinite/.test(types) && /if \(!finite\(latitude\) \|\| !finite\(longitude\)\) return null;/.test(types));

  // --- session scope -------------------------------------------------------------------------------
  // Asserted INSIDE setActor's own body: `requestSequence += 1` also appears in clear, dispose and
  // captureRequest, so a repository-wide match would survive its removal from the one place that
  // makes an actor change invalidate work already in flight.
  rule("a change of actor or generation drops the held position",
    /this\.requestSequence \+= 1;/.test(setActorBody)
    && /if \(!actorKey\) return this\.update\(SIGNED_OUT\);/.test(setActorBody));
  rule("disposal clears the held position",
    /dispose\(\)[\s\S]{0,220}?this\.state = SIGNED_OUT;/.test(controllerCode));
  // Likewise bounded to isCurrent: the same equality appears in setActor's early-return guard.
  const isCurrentBody = (() => {
    const start = controllerCode.indexOf("private isCurrent(");
    if (start === -1) return "";
    const end = controllerCode.indexOf("\n  }", start);
    return end === -1 ? controllerCode.slice(start) : controllerCode.slice(start, end);
  })();
  rule("an in-flight acquisition cannot publish across an actor change",
    isCurrentBody.length > 0
    && /request\.actorKey === this\.actorKey/.test(isCurrentBody)
    && /request\.actorGeneration === this\.actorGeneration/.test(isCurrentBody)
    && /request\.sequence === this\.requestSequence/.test(isCurrentBody));

  // --- no second distance authority ---------------------------------------------------------------
  for (const [label, pattern] of GEO1B_FORBIDDEN_DISTANCE) {
    rule(`Mobile carries no ${label}`, !pattern.test(code));
  }

  // --- platform configuration ---------------------------------------------------------------------
  // The exact key with a non-empty string value: a renamed key is a removed key, and a bare prefix
  // match would accept `locationWhenInUsePermissionRemoved`.
  rule("the location plugin declares a foreground permission string",
    /"locationWhenInUsePermission":\s*"[^"]+"/.test(appJson));
  rule("no background location is declared",
    !/isIosBackgroundLocationEnabled":\s*true|isAndroidBackgroundLocationEnabled":\s*true|locationAlwaysPermission":\s*"/.test(appJson)
    && !/UIBackgroundModes/.test(appJson));
  rule("the expo-location dependency is declared",
    /"expo-location":/.test(mobilePackage));

  // --- scope ----------------------------------------------------------------------------------------
  for (const [label, pattern] of GEO1B_FORBIDDEN_FEATURES) {
    rule(`no ${label}`, !pattern.test(code));
  }
  rule("no deployment operator or credential material",
    !/(supabase\s+(db push|functions deploy)|--project-ref|SUPABASE_SERVICE_ROLE|DATABASE_URL)/.test(code));
  return Object.freeze(violations);
}

const exact = (a, b) => {
  const left = [...a].sort(); const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export function classifyGeo1bLifecycle(state) {
  const candidate = state.head === GEO1B_BASELINE && state.originHead === GEO1B_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && state.stagedPaths.length === 0
    && exact(state.worktreePaths, GEO1B_PATHS);
  const frozen = state.head !== GEO1B_BASELINE && state.parent === GEO1B_BASELINE && !state.deleted
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, GEO1B_PATHS);
  const frozenUnpushed = frozen && state.originHead === GEO1B_BASELINE
    && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozen && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  // GEO-1B is frozen AND PUSHED, so its own commit is HEAD and origin/main. A GEO-1C-P0 candidate
  // therefore appears as that same pushed commit with a worktree holding GEO-1C-P0 paths — some of
  // which (package.json, this round's own guard and manifest) are legitimately inside GEO-1B's set.
  // Recognised by GEO-1C-P0's EXACT path list: a worktree holding anything else is still invalid.
  const geo1bIsFrozenHere = state.head !== GEO1B_BASELINE && state.parent === GEO1B_BASELINE
    && !state.deleted && (state.stagedPaths?.length ?? 0) === 0
    && exact(state.deltaPaths, GEO1B_PATHS);
  const successorWorktree = (state.worktreePaths ?? []).length > 0
    && (state.worktreePaths ?? []).every((file) => GEO1CP0_PATHS.includes(file));
  const successorCandidate = geo1bIsFrozenHere && state.originHead === state.head
    && state.ahead === 0 && state.behind === 0 && successorWorktree;
  // Once the successor is FROZEN, HEAD is the successor's commit and origin/main is still GEO-1B's
  // own pushed commit — which is exactly HEAD's parent. The cumulative delta from GEO-1B's baseline
  // is then GEO-1B's own set plus the successor's, and GEO-1B's set must be wholly present: a commit
  // that dropped part of this round is not a successor to it.
  const successorWorktreeSettled = (state.worktreePaths ?? []).length === 0 || successorWorktree;
  const successorFrozenUnpushed = state.parent === state.originHead
    && state.ahead === 1 && state.behind === 0 && !state.deleted
    && successorWorktreeSettled && (state.stagedPaths?.length ?? 0) === 0
    && Array.isArray(state.deltaPaths)
    && state.deltaPaths.every((file) => GEO1B_PATHS.includes(file) || GEO1CP0_PATHS.includes(file))
    && GEO1B_PATHS.every((file) => state.deltaPaths.includes(file));
  const phase = candidate ? "candidate"
    : frozenUnpushed ? "frozen_unpushed"
    : frozenPushed ? "frozen_pushed"
    : successorCandidate ? "successor_candidate"
    : successorFrozenUnpushed ? "successor_frozen_unpushed"
    : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: candidate ? state.worktreePaths : state.deltaPaths
  });
}

export function createGeo1bManifest(readBytes) {
  const entries = GEO1B_PATHS.map((path) => ({
    path,
    sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: crypto.createHash("sha256").update(text).digest("hex")
  });
}
