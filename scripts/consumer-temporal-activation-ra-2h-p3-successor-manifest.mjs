import child from "node:child_process";

// The temporal activation authority is a fixed two-commit stack.  GEO-1D's
// successor-aware smoke consumes this descriptor only to choose its one
// no-location expectation; it does not grant permission for any other stage.
export const RA2HP3_BASELINE = "b55e89a2c0b8c8587564a4596d2b7b3244927d7d";
export const RA2HP3_AUTHORITY_COMMIT = "fa86b13ced4f1252da742b68e203ff3584f3cb69";
export const RA2HP3_AUTHORITY_TIP = "9fe7985a48c40534e6c8fdfc09927974c182233b";

export const RA2HP3_AUTHORITY_PATHS = Object.freeze([
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseNextMealGeoRows.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseRestaurantMenuRows.ts",
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/restaurants/catalog/mapper.ts",
  "apps/mobile/features/restaurants/catalog/mockRepository.ts",
  "apps/mobile/features/restaurants/catalog/rowContract.ts",
  "apps/mobile/features/restaurants/catalog/types.ts",
  "package.json",
  "scripts/consumer-temporal-activation-ra-2h-p3-guard.mjs",
  "supabase/functions/_shared/meal-buddy-candidate-api/compose.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts",
  "supabase/functions/_shared/meal-buddy-candidate-api/types.ts",
  "supabase/functions/_shared/next-meal-geo-api/candidateSource.ts",
  "supabase/functions/_shared/next-meal-geo-api/compose.ts",
  "supabase/functions/_shared/next-meal-geo-api/types.ts",
  "supabase/migrations/20260907010000_consumer_temporal_activation_ra_2h_p3.sql"
]);

const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean).sort() : [];
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);

function git(args) {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], {
    cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  });
  return Object.freeze({ status: result.status, stdout: (result.stdout ?? "").trim() });
}

// Recognition is deliberately pinned to the known P3 tip *and* its complete
// authority-path delta.  Being ahead, modifying a temporal path, or adding a
// future branch reader cannot select the successor expectation.
export function hasExactRa2hP3TemporalSuccessor() {
  if (git(["merge-base", "--is-ancestor", RA2HP3_AUTHORITY_TIP, "HEAD"]).status !== 0) return false;
  if (git(["rev-parse", `${RA2HP3_AUTHORITY_TIP}^`]).stdout !== RA2HP3_AUTHORITY_COMMIT) return false;
  if (git(["rev-parse", `${RA2HP3_AUTHORITY_COMMIT}^`]).stdout !== RA2HP3_BASELINE) return false;
  return same(
    lines(git(["diff", "--name-only", `${RA2HP3_BASELINE}..${RA2HP3_AUTHORITY_TIP}`]).stdout),
    [...RA2HP3_AUTHORITY_PATHS].sort()
  );
}
