#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  GEO1C_PRODUCT_PATHS,
  auditGeo1cAuthoredSources
} from "./geo-recommendation-geo-1c-successor-manifest.mjs";

const root = process.cwd();
const RANKER = "apps/mobile/features/consumer-meals/nextMealNutritionRanker.ts";
const auditedPaths = [...GEO1C_PRODUCT_PATHS, RANKER, "supabase/config.toml"];
const pristine = Object.fromEntries(auditedPaths.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
};

const auditWithReca = (sources) => {
  const violations = auditGeo1cAuthoredSources(sources)
    .filter((violation) => violation !== "existing downstream calorie authority remains");
  if (!/rankNextMealCandidatesByNutrition/.test(sources["apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts"]))
    violations.push("REC-A downstream nutrition authority is missing");
  if (!/candidate\.candidateId\.localeCompare/.test(sources[RANKER]))
    violations.push("REC-A deterministic candidate tie break is missing");
  return violations;
};

check("pristine GEO-1C source satisfies every invariant",
  auditWithReca(pristine).length === 0, auditWithReca(pristine));

const COMPOSE = "supabase/functions/_shared/next-meal-geo-api/compose.ts";
const POLICY = "supabase/functions/_shared/next-meal-geo-api/policy.ts";
const REQUEST = "supabase/functions/_shared/next-meal-geo-api/request.ts";
const SOURCE = "supabase/functions/_shared/next-meal-geo-api/candidateSource.ts";
const HANDLER = "supabase/functions/next-meal-geo-candidates/handler.ts";
const MOBILE_REPO = "apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts";
const SERVICE = "apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts";
const SCREEN = "apps/mobile/app/recommendation.tsx";
const CONFIG = "supabase/config.toml";

const mutations = [
  ["GEO-1A narrowing is bypassed", COMPOSE, (s) => s.replace("geoRepository.narrowBranchCandidates", "geoRepository.listEverything")],
  ["the recommendation radius becomes a zero magic value", POLICY, (s) => s.replace("NEXT_MEAL_GEO_RADIUS_METERS = 5000", "NEXT_MEAL_GEO_RADIUS_METERS = 0")],
  ["Mobile is allowed to choose radius authority", REQUEST, (s) => s.replace('"candidatePoolLimit"]', '"candidatePoolLimit", "radiusMeters"]')],
  ["branch restaurant pair verification is removed", COMPOSE, (s) => s.replace("eligiblePairs.has", "new Set().has")],
  ["fan-out deduplication is removed", COMPOSE, (s) => s.replace("new Map<string, NextMealGeoCandidateRow>", "new Array<NextMealGeoCandidateRow>")],
  ["candidate-source ordering is removed", SOURCE, (s) => s.replace('.order("candidate_id", { ascending: true })', "")],
  ["downstream REC-A nutrition authority is removed", MOBILE_REPO, (s) => s.replaceAll("rankNextMealCandidatesByNutrition", "rankByGeo")],
  ["deterministic REC-A tie break is removed", RANKER, (s) => s.replace("left.candidate.candidateId.localeCompare(right.candidate.candidateId)", "0")],
  ["every read error broadens to non-Geo", SERVICE, (s) => s.replace('repoResult.errorCode.startsWith("next_meal_geo_")', "true")],
  ["server authentication is removed", HANDLER, (s) => s.replaceAll("authenticateCaller", "acceptCaller")],
  ["precise coordinates are logged", HANDLER, (s) => `${s}\nconsole.log(parsed.value.origin.latitude, parsed.value.origin.longitude);\n`],
  ["precise coordinates are persisted", SCREEN, (s) => `${s}\nAsyncStorage.setItem("location", JSON.stringify(location));\n`],
  ["background watching is introduced", SCREEN, (s) => `${s}\nwatchPositionAsync(() => undefined);\n`],
  ["recommendation-time geocoding is introduced", COMPOSE, (s) => `${s}\nexport const geocodeOnRequest = true;\n`],
  ["a second Haversine implementation is introduced", COMPOSE, (s) => `${s}\nexport const duplicateDistance = (x) => Math.sin(x / 6371);\n`],
  ["distance becomes final rank", COMPOSE, (s) => `${s}\nexport const rank = (rows) => rows.sort((a,b) => a.distanceMeters-b.distanceMeters);\n`],
  ["JWT verification is disabled", CONFIG, (s) => s.replace(/(\[functions\.next-meal-geo-candidates\][\s\S]*?)verify_jwt = true/, "$1verify_jwt = false")],
  ["location UI is unmounted", SCREEN, (s) => s.replaceAll("ConsumerLocationPermissionCard", "UnusedLocationCard")]
];

for (const [name, file, mutate] of mutations) {
  const mutated = { ...pristine, [file]: mutate(pristine[file]) };
  check(`${name} is killed`, mutated[file] !== pristine[file]
    && auditWithReca(mutated).length > 0);
}

check("mutation suite never writes the repository",
  Object.entries(pristine).every(([file, source]) => fs.readFileSync(path.join(root, file), "utf8") === source));

console.log("\n" + JSON.stringify({
  suite: "geo-recommendation-geo-1c-mutations",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  repositoryWritten: false,
  networkUsed: false,
  databaseUsed: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
