import crypto from "node:crypto";

export const GEO1D_BASELINE = "6bfc147ddaac775f68b3f9529daeed0dca32398b";
export const GEO1D_BASELINE_SUBJECT = "Persist exact Meal Buddy branch context";
export const GEO1D_COMMIT_SUBJECT = "Activate Meal Buddy Geo narrowing";
export const GEO1D_P0_MIGRATION =
  "supabase/migrations/20260903010000_meal_buddy_card_branch_context_authority.sql";
export const GEO1D_P0_MIGRATION_SHA256 =
  "d7a68e3bd0ad3d95e5c46db8a30e60f45d4cb228d74ecf3a430bd32899c5bff1";

export const GEO1D_PRODUCT_PATHS = Object.freeze([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/meal-buddies.tsx",
  "apps/mobile/app/recommendation.tsx",
  "apps/mobile/features/consumer-location/ConsumerLocationProvider.tsx",
  "apps/mobile/features/consumer-location/useConsumerLocation.ts",
  "apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateRepository.ts",
  "apps/mobile/features/meal-buddy-candidates/mealBuddyCandidateService.ts",
  "apps/mobile/features/meal-buddy-candidates/ports.ts",
  "apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/compose.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/policy.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/request.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/types.ts",
  "supabase/functions/meal-buddy-candidate-list/handler.ts"
].sort());

export const GEO1D_PATHS = Object.freeze([
  ...GEO1D_PRODUCT_PATHS,
  "package.json",
  "scripts/geo-meal-buddy-geo-1d-guard.mjs",
  "scripts/geo-meal-buddy-geo-1d-p0-guard.mjs",
  "scripts/geo-mobile-location-geo-1b-guard.mjs",
  "scripts/geo-recommendation-geo-1c-guard.mjs",
  "scripts/social-candidate-sr2g-d-guard.mjs",
  "scripts/geo-meal-buddy-geo-1d-mutations.mjs",
  "scripts/geo-meal-buddy-geo-1d-smoke.mjs",
  "scripts/geo-meal-buddy-geo-1d-successor-manifest.mjs"
].sort());

const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
export function classifyGeo1dLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === GEO1D_BASELINE && input.originHead === GEO1D_BASELINE
    && input.behind === 0 && input.ahead === 0 && input.stagedPaths.length === 0
    && !input.deleted && same(worktree, GEO1D_PATHS);
  const frozenShape = input.parent === GEO1D_BASELINE && input.stagedPaths.length === 0
    && input.worktreePaths.length === 0 && !input.deleted && same(delta, GEO1D_PATHS);
  const frozenLocal = frozenShape && input.originHead === GEO1D_BASELINE
    && input.behind === 0 && input.ahead === 1;
  const frozenPushed = frozenShape && input.originHead === input.head
    && input.behind === 0 && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local"
    : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({ valid: phase !== "invalid", phase, manifest: candidate ? worktree : delta });
}

const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|\s)\/\/[^\n]*/g, "$1");

export function auditGeo1dSources(sources) {
  const compose = sources["supabase/functions/_shared/meal-buddy-candidate-api/compose.ts"] ?? "";
  const read = sources["supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts"] ?? "";
  const request = sources["supabase/functions/_shared/meal-buddy-candidate-api/request.ts"] ?? "";
  const policy = sources["supabase/functions/_shared/meal-buddy-candidate-api/policy.ts"] ?? "";
  const handler = sources["supabase/functions/meal-buddy-candidate-list/handler.ts"] ?? "";
  const mobile = [
    "apps/mobile/app/_layout.tsx", "apps/mobile/app/meal-buddies.tsx",
    "apps/mobile/app/recommendation.tsx",
    "apps/mobile/features/consumer-location/ConsumerLocationProvider.tsx",
    "apps/mobile/features/consumer-location/useConsumerLocation.ts",
    "apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateRepository.ts",
    "apps/mobile/features/meal-buddy-candidates/mealBuddyCandidateService.ts",
    "apps/mobile/features/meal-buddy-candidates/ports.ts",
    "apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts"
  ].map((path) => sources[path] ?? "").join("\n");
  const locationRuntime = [
    "apps/mobile/features/consumer-location/ConsumerLocationProvider.tsx",
    "apps/mobile/features/consumer-location/useConsumerLocation.ts",
    "apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddyCandidateRepository.ts",
    "apps/mobile/features/meal-buddy-candidates/useMealBuddyRealCandidates.ts"
  ].map((path) => sources[path] ?? "").join("\n");
  const types = sources["supabase/functions/_shared/meal-buddy-candidate-api/types.ts"] ?? "";
  const code = stripComments(compose + "\n" + read + "\n" + request + "\n" + policy + "\n" + handler);
  const pipeline = compose.slice(compose.indexOf("const baseSelectedCards"));
  const violations = [];
  const rule = (name, pass) => { if (!pass) violations.push(name); };

  rule("optional exact Geo request", /exactNonGeo[\s\S]*exactGeo/.test(request)
    && /geoKeys\.length !== 2/.test(request));
  rule("canonical Geo point validation", /parseGeoPoint\(geoRecord\.latitude, geoRecord\.longitude\)/.test(request));
  rule("verified actor only", /const actorUserId = authentication\.value\.userId/.test(handler)
    && !/actorUserId:\s*parsed\.value/.test(handler));
  rule("P0 private read seam", /social_internal\.read_meal_buddy_card_branch_context/.test(read)
    && !/from social_internal\.meal_buddy_card_branch_context/.test(read));
  rule("complete selected pool is chunked", /CARD_BRANCH_CONTEXT_READ_LIMIT = 200/.test(read)
    && /index \+= CARD_BRANCH_CONTEXT_READ_LIMIT/.test(read));
  rule("canonical GEO-1A narrowing", /new ExecutorGeoRepository\(transport\)\.narrowBranchCandidates/.test(compose)
    && /geo_internal\.narrow_branch_candidates/.test(sources["supabase/functions/_shared/geo-api/repository.ts"] ?? ""));
  rule("frozen 5km authority reused", /NEXT_MEAL_GEO_RADIUS_METERS/.test(compose)
    && !/radiusMeters:\s*5000/.test(compose));
  rule("selected card identity only", /const context = contexts\.get\(card\.cardId\)/.test(compose)
    && /context !== undefined[\s\S]{0,100}nearbyExactBindings\.has/.test(compose)
    && !/find.*near|alternate|first branch/i.test(code));
  rule("Geo precedes Taste and ranking", pipeline.indexOf("applyMealBuddyGeoEligibility") >= 0
    && pipeline.indexOf("applyMealBuddyGeoEligibility") < pipeline.indexOf("readSocialCandidateTasteSources")
    && pipeline.indexOf("applyMealBuddyGeoEligibility") < pipeline.indexOf("composeMealBuddyContextRanking"));
  rule("membership preserves frozen order", /selectedCards\.filter/.test(compose)
    && !/nearbyBranches\.(sort|reverse)/.test(compose));
  rule("four internal statuses", ["not_applied", "applied", "empty", "fallback"]
    .every((status) => compose.includes(`\"${status}\"`)));
  rule("applied empty cannot fall back", /contexts\.size === 0[\s\S]{0,100}status: "empty"/.test(compose)
    && /survivors\.length === 0 \? "empty" : "applied"/.test(compose));
  rule("one nonrecursive infrastructure fallback", (compose.match(/status: "fallback"/g) ?? []).length === 1
    && !/applyMealBuddyGeoEligibility\([^)]*\)[\s\S]{0,80}applyMealBuddyGeoEligibility/.test(compose));
  rule("no-location neutral", /geoOrigin === null[\s\S]{0,100}status: "not_applied", cards: selectedCards/.test(compose));
  rule("Mobile only applies available location", /state\.phase === "available" \? location\.state\.position : null/.test(mobile));
  rule("one session controller", /ConsumerLocationProvider/.test(mobile)
    && /useConsumerLocationRuntime/.test(mobile));
  rule("no persistence or background acquisition", !/watchPosition|startLocationUpdates|AsyncStorage|storage\.set/i.test(locationRuntime));
  rule("Mobile sends only coordinate axes", /geo: \{ latitude: geoContext\.latitude, longitude: geoContext\.longitude \}/.test(mobile)
    && !/geo: \{[^}]*branch|geo: \{[^}]*actor/i.test(mobile));
  rule("public DTO remains Geo-free", !/latitude|longitude|distance|branchId|branch_id/.test(
    (types.match(/export type MealBuddyCandidateDto = Readonly<\{[\s\S]*?\}>;/) ?? [""])[0]
  ));
  rule("no duplicate distance math", !/haversine|6371|6371000|Math\.sin|Math\.cos/i.test(code + mobile));
  rule("no manual context or radius UI", !/radiusSelector|manualContext|contextPicker|locationRadius/i.test(mobile));
  rule("no Social score from Geo", !/distanceScore|geoScore|proximityScore|distanceWeight|geoWeight/i.test(code));
  rule("response contract unchanged", /policyVersion: "meal-buddy-candidate-api-v1"/.test(compose)
    && !/geoStatus|distanceMeters|branchId/.test(
      (types.match(/export type MealBuddyCandidateApiResponse[\s\S]*?\}>;/) ?? [""])[0]
    ));
  return Object.freeze(violations);
}

export function createGeo1dManifest(readFile) {
  const entries = GEO1D_PATHS.map((path) => ({
    path, sha256: crypto.createHash("sha256").update(readFile(path)).digest("hex")
  }));
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: crypto.createHash("sha256")
      .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n")).digest("hex")
  });
}
