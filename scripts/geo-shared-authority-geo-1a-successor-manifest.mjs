// GEO-1A canonical manifest, lifecycle and source invariants.
//
// One definition shared by the guard (which reads the real tree) and the mutation suite (which reads
// mutated text), so the two can never drift apart and quietly disagree about what GEO-1A is.
import crypto from "node:crypto";

export const GEO1A_BASELINE = "5df2fd85a0d35abfd73d51e247374607c2eab0ca";
export const GEO1A_BASELINE_SUBJECT = "Close Social MVP with unfriend realtime and push";

export const GEO1A_MIGRATION = "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql";

// Predecessor guards amended for successor awareness ONLY. Each pins package.json against its own
// frozen baseline, and three additionally enumerate the exact repository migration set; a new round
// is an unexplained edit until it is named. Every amendment is one additive line naming GEO-1A's
// four command keys or its one migration exactly — never a pattern — so anything these guards have
// not been told about still fails. No assertion is weakened and no product byte is touched.
export const GEO1A_PREDECESSOR_GUARDS = Object.freeze([
  "scripts/meal-buddy-chat-sr2j-a-guard.mjs",
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
  "scripts/social-interest-sr2c-r1-guard.mjs",
  "scripts/social-interest-sr2h-b-guard.mjs",
  "scripts/social-profile-sr2c-guard.mjs",
  "scripts/social-ranking-sr2a-guard.mjs"
]);

// The product surface GEO-1A contributes: the authority itself and the shared contract. Everything
// else in the manifest is validation.
export const GEO1A_PRODUCT_PATHS = Object.freeze([
  "supabase/functions/_shared/geo-api/index.ts",
  "supabase/functions/_shared/geo-api/repository.ts",
  "supabase/functions/_shared/geo-api/types.ts",
  "supabase/functions/_shared/geo-api/validate.ts",
  "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql"
]);

// Exact, sorted, wildcard-free. Every byte GEO-1A is allowed to contribute.
export const GEO1A_PATHS = Object.freeze([
  ...GEO1A_PREDECESSOR_GUARDS,
  "package.json",
  "scripts/geo-shared-authority-geo-1a-guard.mjs",
  "scripts/geo-shared-authority-geo-1a-mutations.mjs",
  "scripts/geo-shared-authority-geo-1a-postgres-apply.mjs",
  "scripts/geo-shared-authority-geo-1a-smoke.mjs",
  "scripts/geo-shared-authority-geo-1a-successor-manifest.mjs",
  "supabase/functions/_shared/geo-api/index.ts",
  "supabase/functions/_shared/geo-api/repository.ts",
  "supabase/functions/_shared/geo-api/types.ts",
  "supabase/functions/_shared/geo-api/validate.ts",
  GEO1A_MIGRATION
].sort());

export const GEO1A_NPM_KEYS = Object.freeze([
  "test:geo-shared-authority-geo-1a",
  "test:geo-shared-authority-geo-1a-smoke",
  "test:geo-shared-authority-geo-1a-mutations",
  "test:geo-shared-authority-geo-1a-postgres"
]);

// GEO-1A is the shared foundation, not a consumer and not a Mobile phase. Matched against AUTHORED
// bytes with comments stripped, because this file's own prose names every one of these.
export const GEO1A_FORBIDDEN_FEATURES = Object.freeze([
  ["device location acquisition", /expo-location|navigator\.geolocation|requestForegroundPermissions|watchPositionAsync/i],
  ["background or continuous tracking", /backgroundLocation|startLocationUpdates|geofenc|watchPosition/i],
  ["location history", /locationHistory|location_history|lastKnownLocations|trackHistory/i],
  ["map browsing UI", /react-native-maps|MapView|mapMarker|markerCluster|<Map\b/i],
  ["route or navigation", /turnByTurn|routePlanning|directionsService|navigationRoute/i],
  ["travel time or traffic", /travelTime|etaMinutes|trafficLevel|durationInTraffic/i],
  ["location sharing between users", /shareLocationWith|liveLocation|broadcastLocation/i],
  ["ranking, taste or nutrition signal", /tasteScore|nutritionScore|compatibilityScore|rankCandidates|similarityScore/i],
  ["a hard-coded product radius", /\b(?:3|5|10)\s*km\b|DEFAULT_RADIUS|RADIUS_KM\s*=/i]
]);

// A distance formula must exist in exactly one place: the database. These are the shapes a
// TypeScript reimplementation would take.
export const GEO1A_FORBIDDEN_TS_DISTANCE = Object.freeze([
  ["a haversine implementation", /haversine|Math\.asin|Math\.atan2/i],
  ["an earth radius constant", /637100|6371\b|EARTH_RADIUS/i],
  ["a degrees-to-radians conversion", /Math\.PI\s*\/\s*180|toRadians|deg2rad/i],
  ["a trigonometric distance term", /Math\.(?:sin|cos|sqrt)\s*\(/i]
]);

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)\/\/[^\n]*/g, "$1")
  .replace(/(^|\s)--[^\n]*/g, "$1");

// `comment on ... is '...'` documentation is prose, not executable SQL, and this migration's prose
// necessarily names the very signals the authority is forbidden to carry. Only SQL single-quoted
// literals are removed, and only from the SQL side: a TypeScript `import "expo-location"` must stay
// visible to the absence rules, so that half is scanned intact.
const stripSqlLiterals = (source) => source.replace(/'(?:[^']|'')*'/g, "''");

// Invariants over GEO-1A authored source. Returns the list of violated rule names.
export function auditGeo1aAuthoredSources(sources) {
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };
  const get = (suffix) => {
    const key = Object.keys(sources).find((path) => path.endsWith(suffix));
    return key ? sources[key] : "";
  };
  const migration = get("20260825010000_geo_shared_candidate_authority.sql");
  const types = get("geo-api/types.ts");
  const validate = get("geo-api/validate.ts");
  const repository = get("geo-api/repository.ts");
  const barrel = get("geo-api/index.ts");
  const typescript = `${types}\n${validate}\n${repository}\n${barrel}`;
  const migrationCode = stripComments(migration);
  const typescriptCode = stripComments(typescript);
  // ABSENCE IS ASSERTED OVER PRODUCT SOURCE ONLY. The validation harnesses under `scripts/` must
  // name every forbidden feature in order to test for it, so scanning them would make this suite
  // fail on its own vocabulary — a false positive that teaches nothing.
  const code = `${stripSqlLiterals(migrationCode)}\n${typescriptCode}`;

  // --- the single distance authority ------------------------------------------------------------
  rule("the canonical distance function exists in the sealed schema",
    /create function geo_internal\.distance_meters\(/.test(migrationCode));
  rule("distance is computed from the great-circle formula, in metres",
    /pg_catalog\.asin/.test(migrationCode) && /6371008\.8/.test(migrationCode)
    && /pg_catalog\.radians/.test(migrationCode));
  // Bounded to the distance function's OWN definition. A lazy match across the whole file would be
  // satisfied by the NEXT function's `immutable`, so this rule would survive its own mutation.
  const distanceBlock = migrationCode
    .slice(migrationCode.indexOf("create function geo_internal.distance_meters("))
    .split("$$;")[0];
  rule("the distance function is immutable so the same inputs always give the same answer",
    distanceBlock.length > 0 && /\bimmutable\b/.test(distanceBlock));
  for (const [label, pattern] of GEO1A_FORBIDDEN_TS_DISTANCE) {
    rule(`TypeScript carries no ${label}`, !pattern.test(typescriptCode));
  }

  // --- unknown is never nearby ------------------------------------------------------------------
  rule("a null coordinate yields UNKNOWN rather than a number",
    /p_from_latitude is null or p_from_longitude is null/.test(migrationCode));
  rule("an out-of-range coordinate yields UNKNOWN rather than a number",
    /p_from_latitude < -90 or p_from_latitude > 90/.test(migrationCode));
  rule("narrowing excludes branches whose coordinate is unknown",
    /branch\.latitude is not null/.test(migrationCode) && /branch\.longitude is not null/.test(migrationCode));
  // Pinned to the RETURN, not merely to the vocabulary: the union type in types.ts would keep the
  // word alive even if the repository stopped ever producing it.
  rule("an unknown location is a distinct outcome, not a coerced boolean",
    /if \(candidate === null\) return "unknown_location";/.test(typescriptCode));
  // `Number(null)` is 0. A distance that the authority reported as UNKNOWN must never arrive at a
  // consumer as zero metres, which would read as "exactly here".
  rule("a null distance is refused before any numeric coercion",
    /value === null \|\| value === undefined\) return null/.test(typescriptCode));
  // Latitude first, longitude second, everywhere. A swapped pair is the classic geo defect and it
  // survives every range check whenever both values happen to be valid latitudes.
  // Counted, not merely present: the ordered pair appears once per call site, so a swap at ONE site
  // must fail even while the other site still reads correctly.
  rule("the origin is passed latitude-first to the authority",
    /query\.origin\.latitude, query\.origin\.longitude/.test(typescriptCode)
    && (typescriptCode.match(/origin\.latitude, origin\.longitude, candidate\.latitude, candidate\.longitude/g) ?? []).length === 2);
  rule("a half-known coordinate is rejected at rest",
    /\(latitude is null\) = \(longitude is null\)/.test(migrationCode));

  // --- radius ------------------------------------------------------------------------------------
  rule("the radius boundary is inclusive",
    /<= p_radius_meters/.test(migrationCode));
  rule("a non-positive radius fails closed",
    /p_radius_meters <= 0 then false/.test(migrationCode));
  rule("a NaN radius fails closed",
    /p_radius_meters <> p_radius_meters then false/.test(migrationCode));
  rule("an absurd radius fails closed",
    /p_radius_meters > 20037508/.test(migrationCode));
  rule("no product radius is hard-coded into the shared layer",
    !/DEFAULT_RADIUS|RADIUS_KM/.test(code));

  // --- narrowing is narrowing, never ranking ----------------------------------------------------
  rule("narrowing orders nearest first with a deterministic tie-break",
    /order by geo_internal\.distance_meters\([\s\S]*?\) asc, branch\.id asc/.test(migrationCode));
  rule("narrowing caps its own result set", /limit least\(p_limit, 200\)/.test(migrationCode));
  rule("the Geo authority carries no ranking, taste, nutrition or social signal",
    !/taste|nutrition|calorie|protein|similarity|compatib|social_internal|meal_buddy/i
      .test(stripSqlLiterals(migrationCode)));

  // --- sealing and privacy ----------------------------------------------------------------------
  rule("the authority lives in a server-only schema",
    /create schema geo_internal/.test(migrationCode));
  rule("the schema is revoked from every client role",
    /revoke all on schema geo_internal from anon/.test(migrationCode)
    && /revoke all on schema geo_internal from authenticated/.test(migrationCode));
  rule("the authority role cannot log in and cannot bypass row level security",
    /create role geo_authority with[\s\S]*?nologin[\s\S]*?nobypassrls/.test(migrationCode));
  rule("every function is owned by the authority role rather than the migration runner",
    (migrationCode.match(/owner to geo_authority/g) ?? []).length === 3);
  rule("cross-user reach comes from an explicit role-scoped policy, not from bypassing RLS",
    /create policy restaurant_branches_geo_authority_read/.test(migrationCode));
  rule("only the frozen executor transport may call the authority",
    /grant execute on function geo_internal\.narrow_branch_candidates[\s\S]*?to social_runtime_executor/.test(migrationCode));
  rule("no user location is persisted anywhere",
    !/create table[^;]*user_location|create table[^;]*location_history/i.test(migrationCode));

  // --- scope -------------------------------------------------------------------------------------
  for (const [label, pattern] of GEO1A_FORBIDDEN_FEATURES) {
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

export function matchesCanonicalGeo1aSuccessor(state) {
  const parent = state.parent ?? state.headParent ?? null;
  const delta = state.deltaPaths ?? state.headDeltaPaths
    ?? (Array.isArray(state.headDeltaEntries) ? state.headDeltaEntries.map((entry) => entry.path) : null);
  const deleted = state.deleted === true || state.headDeleted === true
    || (Array.isArray(state.headDeltaEntries) && state.headDeltaEntries.some((entry) => entry.status === "D"));
  if (!Array.isArray(delta)) return false;
  return parent === GEO1A_BASELINE
    && state.originHead === GEO1A_BASELINE
    && state.ahead === 1 && state.behind === 0
    && !deleted
    && (state.worktreePaths?.length ?? 0) === 0
    && (state.stagedPaths?.length ?? 0) === 0
    && exact(delta, GEO1A_PATHS);
}

export function classifyGeo1aLifecycle(state) {
  // The GEO-1A baseline is itself PUSHED, so a clean candidate sits exactly on origin/main.
  const candidate = state.head === GEO1A_BASELINE && state.originHead === GEO1A_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && state.stagedPaths.length === 0
    && exact(state.worktreePaths, GEO1A_PATHS);
  const frozen = state.head !== GEO1A_BASELINE && state.parent === GEO1A_BASELINE && !state.deleted
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, GEO1A_PATHS);
  const frozenUnpushed = frozen && state.originHead === GEO1A_BASELINE
    && state.ahead === 1 && state.behind === 0;
  const frozenPushed = frozen && state.originHead === state.head && state.ahead === 0 && state.behind === 0;
  const phase = candidate ? "candidate"
    : frozenUnpushed ? "frozen_unpushed"
    : frozenPushed ? "frozen_pushed"
    : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: candidate ? state.worktreePaths : state.deltaPaths
  });
}

export function createGeo1aManifest(readBytes) {
  const entries = GEO1A_PATHS.map((path) => ({
    path,
    sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: crypto.createHash("sha256").update(text).digest("hex")
  });
}
