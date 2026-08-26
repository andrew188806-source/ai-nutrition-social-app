// GEO-1C-P0 canonical manifest, lifecycle and source invariants.
//
// One definition shared by the guard (which reads the real tree) and the mutation suite (which reads
// mutated text), so the two can never drift apart and quietly disagree about what GEO-1C-P0 is.
import crypto from "node:crypto";

export const GEO1CP0_BASELINE = "c9120a78afa4e75831feb2b6bc0da4e495104049";
export const GEO1CP0_BASELINE_SUBJECT = "Add Mobile current-location acquisition";

export const GEO1CP0_MIGRATION =
  "supabase/migrations/20260826010000_restaurant_geocode_source_authority.sql";

// The product surface GEO-1C-P0 contributes. Everything else in the manifest is registration or
// validation.
export const GEO1CP0_PRODUCT_PATHS = Object.freeze([
  "supabase/functions/_shared/restaurant-geocoding/index.ts",
  "supabase/functions/_shared/restaurant-geocoding/mockProvider.ts",
  "supabase/functions/_shared/restaurant-geocoding/repository.ts",
  "supabase/functions/_shared/restaurant-geocoding/service.ts",
  "supabase/functions/_shared/restaurant-geocoding/types.ts",
  "supabase/functions/restaurant-geocode-dispatch/config.ts",
  "supabase/functions/restaurant-geocode-dispatch/handler.ts",
  "supabase/functions/restaurant-geocode-dispatch/index.ts",
  GEO1CP0_MIGRATION
]);

// Predecessor validation amended for successor awareness ONLY. Populated from measured sweep
// evidence; every amendment is additive and names GEO-1C-P0 exactly.
export const GEO1CP0_PREDECESSOR_GUARDS = Object.freeze([
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-successor-manifest.mjs",
  "scripts/geo-shared-authority-geo-1a-guard.mjs",
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

export const GEO1CP0_NPM_KEYS = Object.freeze([
  "test:geo-coordinate-source-geo-1c-p0",
  "test:geo-coordinate-source-geo-1c-p0-smoke",
  "test:geo-coordinate-source-geo-1c-p0-mutations",
  "test:geo-coordinate-source-geo-1c-p0-postgres"
]);

export const GEO1CP0_LIFECYCLE_STATES = Object.freeze(["unknown", "pending", "resolved", "failed"]);

export const GEO1CP0_PATHS = Object.freeze([
  ...GEO1CP0_PRODUCT_PATHS,
  ...GEO1CP0_PREDECESSOR_GUARDS,
  "package.json",
  "scripts/geo-coordinate-source-geo-1c-p0-guard.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-mutations.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-postgres-apply.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-smoke.mjs",
  "scripts/geo-coordinate-source-geo-1c-p0-successor-manifest.mjs",
  "supabase/config.toml"
].sort());

// GEO-1C-P0 resolves coordinates out of band and integrates NO real provider. Matched against
// PRODUCT source with comments stripped, because the validation harnesses and this file's own prose
// must name every forbidden thing in order to test for it.
export const GEO1CP0_FORBIDDEN_FEATURES = Object.freeze([
  ["a named commercial geocoding vendor", /googleapis|google\.maps|maps\.google|mapbox|nominatim|openstreetmap|here\.com|tgos/i],
  ["provider-specific place vocabulary as a canonical field", /geocode_place_id|placeId|place_id/i],
  ["recommendation-time geocoding", /recommendationGeocode|geocodeOnRequest|resolveDuringRanking/i],
  ["a district or city centroid substitute", /centroid|districtCenter|cityCenter|approximateFromDistrict/i],
  ["a stale coordinate state", /["']stale["']/i],
  ["map, route or travel-time work", /MapView|turnByTurn|routePlanning|travelTime|directionsService/i],
  ["user location persistence", /userLocation|deviceLocation|locationHistory/i],
  ["distance or ranking arithmetic", /haversine|Math\.asin|Math\.atan2|distanceMeters|withinRadius|rankCandidates/i]
]);

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)\/\/[^\n]*/g, "$1")
  .replace(/(^|\s)--[^\n]*/g, "$1");

// `comment on ... is '...'` documentation is prose, not executable SQL, and this migration's prose
// necessarily names the very things the authority is forbidden to do.
const stripSqlLiterals = (source) => source.replace(/'(?:[^']|'')*'/g, "''");

const between = (source, start, end) => {
  const from = source.indexOf(start);
  if (from === -1) return "";
  const to = source.indexOf(end, from + start.length);
  return to === -1 ? source.slice(from) : source.slice(from, to);
};

export function auditGeo1cp0AuthoredSources(sources) {
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };
  const get = (suffix) => {
    const key = Object.keys(sources).find((path) => path.endsWith(suffix));
    return key ? sources[key] : "";
  };
  const migration = get("20260826010000_restaurant_geocode_source_authority.sql");
  const types = get("restaurant-geocoding/types.ts");
  const mock = get("restaurant-geocoding/mockProvider.ts");
  const repository = get("restaurant-geocoding/repository.ts");
  const service = get("restaurant-geocoding/service.ts");
  const barrel = get("restaurant-geocoding/index.ts");
  const config = get("restaurant-geocode-dispatch/config.ts");
  const handler = get("restaurant-geocode-dispatch/handler.ts");
  const configToml = get("supabase/config.toml");
  const migrationCode = stripComments(migration);
  const typescript = `${types}\n${mock}\n${repository}\n${service}\n${barrel}\n${config}\n${handler}`;
  const typescriptCode = stripComments(typescript);
  const code = `${stripSqlLiterals(migrationCode)}\n${typescriptCode}`;

  // --- the four-state lifecycle, and the absence of a fifth -------------------------------------
  rule("the lifecycle is exactly the four canonical states",
    /check \(geocode_status in \('unknown', 'pending', 'resolved', 'failed'\)\)/.test(migrationCode));
  rule("no stale state exists in the lifecycle",
    !/'stale'/.test(migrationCode));
  rule("resolved holds if and only if a coordinate pair is present",
    /check \(\(geocode_status = 'resolved'\) = \(latitude is not null\)\)/.test(migrationCode));
  rule("an unresolved row can carry no provider provenance",
    /geocode_status = 'resolved'\s*\n?\s*or \(geocode_provider is null and geocode_provider_ref is null/.test(migrationCode));
  rule("a resolution must be attributable to a provider and to an address",
    /geocode_status <> 'resolved'[\s\S]{0,200}?geocode_provider is not null[\s\S]{0,120}?geocode_address_fingerprint is not null/.test(migrationCode));

  // --- invalidation on BOTH sides of the canonical address ---------------------------------------
  rule("the branch trigger fires on insert and on a canonical address component change",
    /create trigger restaurant_branches_geocode_invalidate[\s\S]{0,200}?before insert or update of address, district, restaurant_id/.test(migrationCode));
  rule("the parent city trigger invalidates child branches synchronously",
    /create trigger restaurants_city_geocode_invalidate[\s\S]{0,200}?after update of city on public\.restaurants/.test(migrationCode));
  rule("the city trigger only fires when the city actually changed",
    /when \(old\.city is distinct from new\.city\)/.test(migrationCode));
  const branchInvalidate = between(migrationCode,
    "create function geo_internal.branch_geocode_invalidate()", "$$;");
  rule("branch invalidation clears the coordinate pair",
    /new\.latitude := null;/.test(branchInvalidate) && /new\.longitude := null;/.test(branchInvalidate));
  rule("branch invalidation clears provider provenance",
    /new\.geocode_provider := null;/.test(branchInvalidate)
    && /new\.geocode_provider_ref := null;/.test(branchInvalidate)
    && /new\.geocode_resolved_at := null;/.test(branchInvalidate));
  rule("branch invalidation resets the attempt budget",
    /new\.geocode_attempts := 0;/.test(branchInvalidate));
  rule("branch invalidation chooses pending or unknown by address sufficiency",
    /new\.geocode_status := case when v_fingerprint is null then 'unknown' else 'pending' end;/.test(branchInvalidate));
  const cityInvalidate = between(migrationCode,
    "create function geo_internal.restaurant_city_geocode_invalidate()", "$$;");
  rule("city invalidation clears the coordinate pair on every affected child",
    /latitude = null,/.test(cityInvalidate) && /longitude = null,/.test(cityInvalidate));
  rule("city invalidation only touches branches whose address actually moved",
    /is distinct from branch\.geocode_address_fingerprint/.test(cityInvalidate));

  // --- the fingerprint ----------------------------------------------------------------------------
  rule("the canonical address is composed from city, district and street address",
    /compose_branch_address\(\s*p_city text,\s*p_district text,\s*p_address text\s*\)/.test(migrationCode));
  rule("a branch with no street address composes to nothing, and is therefore unknown",
    /when p_address is null or pg_catalog\.btrim\(p_address\) = '' then null/.test(migrationCode));
  rule("the fingerprint is a deterministic digest of the composed address",
    /pg_catalog\.sha256\(pg_catalog\.convert_to\(/.test(migrationCode));
  rule("both address functions are immutable so the fingerprint is reproducible",
    (migrationCode.match(/\bimmutable\b/g) ?? []).length >= 2);

  // --- the staleness race -------------------------------------------------------------------------
  const complete = between(migrationCode,
    "create function geo_internal.complete_branch_geocode(", "$$;");
  rule("completion rejects a result computed for an address that has since changed",
    /if v_current is distinct from p_address_fingerprint then return 'rejected_stale'; end if;/.test(complete));
  rule("completion locks the branch row before deciding",
    /for update;/.test(complete));
  rule("completion refuses an out-of-range coordinate rather than writing it",
    /p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180/.test(complete));
  rule("the stored normalized address is the composition this system made",
    // Three independent facts, because a proximity window between the declaration and the
    // assignment is defeated by the guard clauses that legitimately sit between them: the stored
    // value is the composed local, that local comes from the canonical composer, and it is never a
    // parameter the provider supplied.
    /geocode_normalized_address = v_composed/.test(complete)
    && /geo_internal\.compose_branch_address/.test(complete)
    && !/geocode_normalized_address = p_/.test(complete));
  const fail = between(migrationCode, "create function geo_internal.fail_branch_geocode(", "$$;");
  rule("a failure is fingerprint-checked too",
    /if v_current is distinct from p_address_fingerprint then return 'rejected_stale'; end if;/.test(fail));
  rule("a failure cannot create a coordinate",
    !/latitude\s*=/.test(fail) && !/longitude\s*=/.test(fail));

  // --- bounded retry --------------------------------------------------------------------------------
  const claim = between(migrationCode, "create function geo_internal.claim_branch_geocodes(", "$$;");
  rule("claiming is bounded by a configurable attempt maximum",
    /branch\.geocode_attempts < p_max_attempts/.test(claim));
  rule("the attempt is counted at claim time so a crashed resolver consumes its budget",
    /geocode_attempts = branch\.geocode_attempts \+ 1/.test(claim));
  rule("concurrent dispatchers cannot claim the same branch",
    /for update skip locked/.test(claim));
  rule("a claim never returns a coordinate",
    !/latitude/.test(claim) && !/longitude/.test(claim));
  rule("the dispatcher bounds its own batch and attempts",
    /RESTAURANT_GEOCODE_DISPATCH_LIMIT/.test(config) && /maxAttempts/.test(config));

  // --- write authority is sealed --------------------------------------------------------------------
  rule("a dedicated write role exists, separate from the GEO-1A read authority",
    /create role geo_geocode_authority with[\s\S]{0,200}?nologin[\s\S]{0,200}?nobypassrls/.test(migrationCode));
  rule("the write role is granted only named columns, never the table",
    /grant update \(latitude, longitude, geocode_status/.test(migrationCode)
    && !/grant update on table public\.restaurant_branches/.test(migrationCode));
  rule("the fingerprint is NOT writable by the geocoding authority",
    !/grant update \([^)]*geocode_address_fingerprint/.test(migrationCode));
  rule("row level security is satisfied by explicit role-scoped policies",
    /create policy restaurant_branches_geocode_authority_write on public\.restaurant_branches/.test(migrationCode));
  rule("no client role may write a coordinate",
    !/to (anon|authenticated|service_role)[^;]*\n?[^;]*(latitude|geocode_status)/i.test(migrationCode));
  rule("only the frozen executor transport may drive resolution",
    /grant execute on function geo_internal\.claim_branch_geocodes\(integer, integer\) to social_runtime_executor/.test(migrationCode));

  // --- provider neutrality ---------------------------------------------------------------------------
  rule("the canonical provider reference is provider-neutral",
    /geocode_provider_ref/.test(migrationCode) && !/geocode_place_id/.test(migrationCode));
  rule("the provider port sees one composed address and nothing else",
    /resolve\(sourceAddress: string\): Promise<GeocodeProviderOutcome>/.test(types));
  rule("the provider error vocabulary is closed",
    /provider_rate_limited[\s\S]{0,200}?provider_invalid_response/.test(types));
  // A mock that answered every address with a plausible-looking coordinate would eventually have one
  // of those coordinates mistaken for a real restaurant location. Its unknown-address path must be a
  // genuine no-match.
  rule("the mock refuses an address it does not know rather than inventing one",
    /if \(!fixture\) \{[\s\S]{0,320}?errorCode: "provider_no_match"/.test(stripComments(mock)));
  rule("only the mock provider is shipped",
    /createMockRestaurantGeocodeProvider/.test(barrel)
    && !/googleProvider|tgosProvider|nominatimProvider/.test(typescriptCode));
  rule("an unrecognised provider selection refuses to run rather than falling back",
    /if \(providerRaw !== "mock"\) return \{ ok: false, errorCode: "server_unavailable" \};/.test(config));

  // --- the dispatcher is operational, not a consumer surface ------------------------------------------
  rule("the dispatcher authenticates with a shared secret, not a user JWT",
    /secretMatches\(config\.value\.dispatchSecret, request\.headers\.get\("x-restaurant-geocode-dispatch"\)\)/.test(handler));
  rule("the secret comparison is constant time",
    /difference \|= expected\.charCodeAt\(index\) \^ presented\.charCodeAt\(index\)/.test(config));
  rule("the dispatcher is registered without JWT verification and is named as operational",
    /\[functions\.restaurant-geocode-dispatch\][\s\S]{0,400}?verify_jwt = false/.test(configToml));
  rule("no provider secret is read anywhere but the server config",
    (typescriptCode.match(/Deno\.env\.get/g) ?? []).length === 1);

  // --- scope ------------------------------------------------------------------------------------------
  for (const [label, pattern] of GEO1CP0_FORBIDDEN_FEATURES) {
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

export function classifyGeo1cp0Lifecycle(state) {
  const candidate = state.head === GEO1CP0_BASELINE && state.originHead === GEO1CP0_BASELINE
    && state.ahead === 0 && state.behind === 0 && !state.deleted
    && state.stagedPaths.length === 0
    && exact(state.worktreePaths, GEO1CP0_PATHS);
  const frozen = state.head !== GEO1CP0_BASELINE && state.parent === GEO1CP0_BASELINE && !state.deleted
    && state.worktreePaths.length === 0 && state.stagedPaths.length === 0
    && exact(state.deltaPaths, GEO1CP0_PATHS);
  const frozenUnpushed = frozen && state.originHead === GEO1CP0_BASELINE
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

export function createGeo1cp0Manifest(readBytes) {
  const entries = GEO1CP0_PATHS.map((path) => ({
    path,
    sha256: crypto.createHash("sha256").update(readBytes(path)).digest("hex")
  }));
  const text = entries.map(({ path, sha256 }) => `${sha256}  ${path}\n`).join("");
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: crypto.createHash("sha256").update(text).digest("hex")
  });
}
