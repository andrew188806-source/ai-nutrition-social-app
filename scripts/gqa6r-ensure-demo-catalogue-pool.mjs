#!/usr/bin/env node
// GQA-6R ensure-gqa6r-demo-catalogue-pool — Development-only, idempotent, manifest-backed.
//
//   node scripts/gqa6r-ensure-demo-catalogue-pool.mjs                    # read-only plan (default)
//   node scripts/gqa6r-ensure-demo-catalogue-pool.mjs --apply --confirm-development
//
// Writes ONLY the deterministic [DEMO] restaurants/branches/menus/categories/items/nutrition/branch items/
// food-context mappings in scripts/gqa6r-demo-fixtures.mjs, through the canonical tables (their checks and
// triggers apply). Never updates or deletes an ordinary Development record; never touches Production.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOGUE_TARGET, DEVELOPMENT_PROJECT_REF, buildCatalogueFixtures, buildManifest, catalogueRestaurantSql } from "./gqa6r-demo-fixtures.mjs";
import { fixtureWriteSql, readOnlySql, verifyDevelopmentTarget } from "./gqa6r-development-api.mjs";

export const MANIFEST_PATH = "scripts/gqa6r-demo-fixture-manifest.json";

/** Pure: which Demo restaurants still need ensuring, given eligible candidate counts per restaurant id. */
export function planCataloguePool(eligibleByRestaurant, fixtures = buildCatalogueFixtures()) {
  const incomplete = fixtures.filter((r) => (eligibleByRestaurant.get(r.id) ?? 0) < CATALOGUE_TARGET.itemsPerRestaurant);
  const eligibleRestaurants = [...eligibleByRestaurant.values()].filter((n) => n >= CATALOGUE_TARGET.itemsPerRestaurant).length;
  const eligibleItems = [...eligibleByRestaurant.values()].reduce((sum, n) => sum + n, 0);
  return { incomplete, eligibleRestaurants, eligibleItems };
}

export const ELIGIBILITY_SQL = `select restaurant_id, count(distinct menu_item_id)::int n
  from public.consumer_public_next_meal_candidates_v2 group by restaurant_id`;

async function eligibleCounts(ref) {
  const rows = await readOnlySql(ref, ELIGIBILITY_SQL);
  return new Map(rows.map((row) => [row.restaurant_id, row.n]));
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--confirm-development")) throw new Error("refusing: --apply requires --confirm-development");
  const ref = DEVELOPMENT_PROJECT_REF;
  const verifiedRef = await verifyDevelopmentTarget(ref);
  const before = planCataloguePool(await eligibleCounts(ref));
  console.log(JSON.stringify({ mode: apply ? "apply" : "plan", eligibleRestaurantsWith3Plus: before.eligibleRestaurants, eligibleItems: before.eligibleItems,
    demoRestaurantsToEnsure: before.incomplete.map((r) => r.label) }, null, 1));
  if (!apply) return;
  for (const restaurant of before.incomplete) {
    await fixtureWriteSql(ref, verifiedRef, catalogueRestaurantSql(restaurant));
    console.log("ensured", restaurant.label);
  }
  const after = planCataloguePool(await eligibleCounts(ref));
  const demoEligible = buildCatalogueFixtures().filter((r) => !after.incomplete.includes(r)).length;
  fs.writeFileSync(path.join(process.cwd(), MANIFEST_PATH), `${JSON.stringify(buildManifest(), null, 2)}\n`);
  console.log(JSON.stringify({ demoRestaurantsEligible: demoEligible, eligibleRestaurantsWith3Plus: after.eligibleRestaurants, eligibleItems: after.eligibleItems,
    target: `${CATALOGUE_TARGET.restaurants} restaurants / ${CATALOGUE_TARGET.restaurants * CATALOGUE_TARGET.itemsPerRestaurant} items`, stillIncomplete: after.incomplete.map((r) => r.label) }, null, 1));
  if (after.incomplete.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
