import crypto from "node:crypto";

export const GEO1C_BASELINE = "c52899506e7cf5b12eef5ae1a14aa3020ef6f926";
export const GEO1C_BASELINE_SUBJECT = "Add restaurant coordinate source authority";
export const GEO1C_COMMIT_SUBJECT = "Integrate Geo into next-meal recommendations";

export const GEO1C_PRODUCT_PATHS = Object.freeze([
  "apps/mobile/app/recommendation.tsx",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseNextMealGeoRows.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts",
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx",
  "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts",
  "apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts",
  "apps/mobile/features/next-meal-prototype/types.ts",
  "supabase/functions/_shared/next-meal-geo-api/candidateSource.ts",
  "supabase/functions/_shared/next-meal-geo-api/compose.ts",
  "supabase/functions/_shared/next-meal-geo-api/index.ts",
  "supabase/functions/_shared/next-meal-geo-api/policy.ts",
  "supabase/functions/_shared/next-meal-geo-api/request.ts",
  "supabase/functions/_shared/next-meal-geo-api/types.ts",
  "supabase/functions/next-meal-geo-candidates/config.ts",
  "supabase/functions/next-meal-geo-candidates/errors.ts",
  "supabase/functions/next-meal-geo-candidates/handler.ts",
  "supabase/functions/next-meal-geo-candidates/index.ts"
]);

export const GEO1C_PREDECESSOR_GUARDS = Object.freeze([
  "scripts/geo-coordinate-source-geo-1c-p0-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-shared-authority-geo-1a-guard.mjs"
]);

export const GEO1C_NPM_KEYS = Object.freeze([
  "test:geo-recommendation-geo-1c",
  "test:geo-recommendation-geo-1c-smoke",
  "test:geo-recommendation-geo-1c-mutations"
]);

export const GEO1C_PATHS = Object.freeze([
  ...GEO1C_PRODUCT_PATHS,
  ...GEO1C_PREDECESSOR_GUARDS,
  "package.json",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/geo-recommendation-geo-1c-mutations.mjs",
  "scripts/geo-recommendation-geo-1c-smoke.mjs",
  "scripts/geo-recommendation-geo-1c-successor-manifest.mjs",
  "supabase/config.toml"
].sort());

const same = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
export function classifyGeo1cLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const exactWorktree = same(worktree, GEO1C_PATHS);
  const exactDelta = same(delta, GEO1C_PATHS);
  if (input.head === GEO1C_BASELINE && input.originHead === GEO1C_BASELINE
    && input.behind === 0 && input.ahead === 0 && input.stagedPaths.length === 0
    && !input.deleted && exactWorktree) {
    return { valid: true, phase: "candidate", manifest: worktree };
  }
  if (input.parent === GEO1C_BASELINE && input.originHead === GEO1C_BASELINE
    && input.behind === 0 && input.ahead === 1 && input.worktreePaths.length === 0
    && input.stagedPaths.length === 0 && exactDelta) {
    return { valid: true, phase: "frozen_local", manifest: delta };
  }
  if (input.parent === GEO1C_BASELINE && input.head === input.originHead
    && input.behind === 0 && input.ahead === 0 && input.worktreePaths.length === 0
    && input.stagedPaths.length === 0 && exactDelta) {
    return { valid: true, phase: "frozen_pushed", manifest: delta };
  }
  return { valid: false, phase: "invalid", manifest: input.head === GEO1C_BASELINE ? worktree : delta };
}

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)\/\/[^\n]*/g, "$1");

export function auditGeo1cAuthoredSources(sources) {
  const violations = [];
  const rule = (name, ok) => { if (!ok) violations.push(name); };
  const get = (suffix) => {
    const key = Object.keys(sources).find((file) => file.endsWith(suffix));
    return key ? sources[key] : "";
  };
  const all = Object.entries(sources)
    .filter(([file]) => file !== "supabase/config.toml")
    .map(([, source]) => source)
    .join("\n");
  const code = stripComments(all);
  const compose = get("next-meal-geo-api/compose.ts");
  const policy = get("next-meal-geo-api/policy.ts");
  const request = get("next-meal-geo-api/request.ts");
  const candidateSource = get("next-meal-geo-api/candidateSource.ts");
  const handler = get("next-meal-geo-candidates/handler.ts");
  const mobileRepository = get("supabaseConsumerNextMealRecommendationRepository.ts");
  const service = get("consumerNextMealRecommendationService.ts");
  const screen = get("app/recommendation.tsx");
  const config = get("supabase/config.toml");

  rule("GEO-1A repository is invoked", /geoRepository\.narrowBranchCandidates/.test(compose)
    && /ExecutorGeoRepository/.test(handler));
  rule("recommendation owns one named radius policy", /NEXT_MEAL_GEO_RADIUS_METERS\s*=\s*5000/.test(policy)
    && /radiusMeters:\s*NEXT_MEAL_GEO_RADIUS_METERS/.test(compose));
  rule("request cannot choose radius actor or server identity", !/radiusMeters|actorUserId|userId|role/i.test(request));
  rule("branch restaurant pair is verified before mapping", /eligiblePairs\.has\(`\$\{row\.branch_id\}/.test(compose)
    && /\$\{row\.restaurant_id\}/.test(compose));
  rule("branch offers are deterministic and deduplicated", /new Map<string, NextMealGeoCandidateRow>/.test(compose)
    && /candidate_id\.localeCompare/.test(compose) && /order\("candidate_id"/.test(candidateSource));
  rule("existing downstream calorie authority remains", (mobileRepository.match(/rankByCalorieProximity/g) ?? []).length >= 2
    && /readGeoRows/.test(mobileRepository) && /candidate_id\.localeCompare/.test(mobileRepository));
  rule("Geo infrastructure failure alone falls back", /startsWith\("next_meal_geo_"\)/.test(service)
    && /geoStatus = "unavailable"/.test(service));
  rule("zero nearby stays an applied empty result",
    /if \(rows\.length === 0\) return \{ status: "empty" \};/.test(mobileRepository)
    && /if \(repoResult\.status === "empty"\) \{[\s\S]{0,260}?status: "empty",[\s\S]{0,260}?geoStatus,/.test(service)
    && /result\.geoStatus === "applied"/.test(get("mapCanonicalToU1NextMeal.ts")));
  rule("GEO-1B is mounted only in recommendation", /useConsumerLocation/.test(screen)
    && /<ConsumerLocationPermissionCard\b/.test(screen) && /nextMealRecommendationSource === "supabase"/.test(screen));
  rule("server boundary authenticates and closes", /dependencies\.authenticateCaller\(/.test(handler)
    && /finally \{\s*await transport\.close\(\);/.test(handler));
  rule("authenticated Edge registration is exact", /\[functions\.next-meal-geo-candidates\][\s\S]*?verify_jwt = true/.test(config));
  rule("no recommendation-time geocoding", !/restaurant-geocoding|restaurant-geocode-dispatch|geocodeOnRequest|resolveDuringRanking/.test(code));
  rule("no duplicate distance authority", !/haversine|Math\.(?:sin|cos|asin|atan2|sqrt)|6371\b|toRadians|deg2rad/i.test(code));
  rule("no coordinate persistence", !/AsyncStorage|SecureStore|localStorage|storage\.setItem|locationHistory|persistLocation/i.test(code));
  rule("no coordinate logging", !/console\.|logger\.|log\([^)]*(?:latitude|longitude)/i.test(code));
  rule("no background location capability", !/watchPosition|BackgroundPermissions|BackgroundLocation|TaskManager|geofenc/i.test(code));
  rule("no distance becomes recommendation rank", !/distanceMeters[^\n]*(?:score|sort|rank)|sort\([\s\S]{0,160}distanceMeters/i.test(code));
  rule("no secret reaches Mobile", !/SUPABASE_SERVICE_ROLE|SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR|GEOCOD.*KEY/i
    .test(Object.entries(sources).filter(([file]) => file.startsWith("apps/")).map(([, value]) => value).join("\n")));
  return violations;
}

export function createGeo1cManifest(readFile) {
  const entries = GEO1C_PATHS.map((path) => ({
    path,
    sha256: crypto.createHash("sha256").update(readFile(path)).digest("hex")
  }));
  const aggregateSha256 = crypto.createHash("sha256")
    .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
    .digest("hex");
  return { entries, aggregateSha256 };
}
