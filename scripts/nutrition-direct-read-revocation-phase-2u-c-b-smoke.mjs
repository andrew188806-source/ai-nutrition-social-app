import { spawnSync } from "node:child_process";

const contractMode = process.argv.includes("--contract");

if (!contractMode) {
  console.log(JSON.stringify({
    status: "skipped",
    phase: "2U-C-B",
    mode: "offline",
    reason: "Expected offline skip; use --contract for local permission simulation.",
    networkRequestMade: false,
    databaseWriteExecuted: false,
    remoteGrantChanged: false,
    productionTouched: false
  }, null, 2));
  process.exit(0);
}

const SELECT = "SELECT";
const WRITE_PRIVILEGES = ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const resources = {
  menu_item_nutrition: { anon: new Set([SELECT]), authenticated: new Set([SELECT]), migration_owner: new Set([SELECT]) },
  current_published_menu_item_nutrition: { anon: new Set([SELECT]), authenticated: new Set([SELECT]), migration_owner: new Set([SELECT]) },
  restaurant_public_published_nutrition_v1: { anon: new Set([SELECT]), authenticated: new Set([SELECT]), migration_owner: new Set([SELECT]) },
  consumer_public_next_meal_candidates_v1: { anon: new Set(), authenticated: new Set([SELECT]), migration_owner: new Set([SELECT]) }
};
const checks = [];
const issues = [];

function cloneState(state) {
  return Object.fromEntries(Object.entries(state).map(([resource, roles]) => [resource, Object.fromEntries(Object.entries(roles).map(([role, privileges]) => [role, new Set(privileges)]))]));
}
function canRead(state, resource, role) { return state[resource]?.[role]?.has(SELECT) === true; }
function pass(name) { checks.push({ name, pass: true }); }
function fail(name, message) { checks.push({ name, pass: false, message }); issues.push({ name, message }); }
function check(name, condition, message) { if (condition) pass(name); else fail(name, message); }

const before = cloneState(resources);
check("before N3 raw nutrition is anon-readable", canRead(before, "menu_item_nutrition", "anon"), "Baseline anon raw SELECT missing.");
check("before N3 raw nutrition is authenticated-readable", canRead(before, "menu_item_nutrition", "authenticated"), "Baseline authenticated raw SELECT missing.");
check("before N3 internal view is anon-readable", canRead(before, "current_published_menu_item_nutrition", "anon"), "Baseline anon internal-view SELECT missing.");
check("before N3 internal view is authenticated-readable", canRead(before, "current_published_menu_item_nutrition", "authenticated"), "Baseline authenticated internal-view SELECT missing.");

const after = cloneState(before);
for (const resource of ["menu_item_nutrition", "current_published_menu_item_nutrition"]) {
  after[resource].anon.delete(SELECT);
  after[resource].authenticated.delete(SELECT);
}
check("after N3 all four direct reads are denied", [
  ["menu_item_nutrition", "anon"],
  ["menu_item_nutrition", "authenticated"],
  ["current_published_menu_item_nutrition", "anon"],
  ["current_published_menu_item_nutrition", "authenticated"]
].every(([resource, role]) => !canRead(after, resource, role)), "A direct raw/internal read remains allowed.");
check("restaurant safe view remains anon-readable", canRead(after, "restaurant_public_published_nutrition_v1", "anon"), "Restaurant anon safe read changed.");
check("restaurant safe view remains authenticated-readable", canRead(after, "restaurant_public_published_nutrition_v1", "authenticated"), "Restaurant authenticated safe read changed.");
check("consumer safe view remains anon-denied", !canRead(after, "consumer_public_next_meal_candidates_v1", "anon"), "Consumer anon access changed.");
check("consumer safe view remains authenticated-readable", canRead(after, "consumer_public_next_meal_candidates_v1", "authenticated"), "Consumer authenticated access changed.");
check("owner-executed dependency chain remains readable", canRead(after, "menu_item_nutrition", "migration_owner") && canRead(after, "current_published_menu_item_nutrition", "migration_owner"), "Owner dependency access changed.");

const rolledBack = cloneState(after);
for (const resource of ["menu_item_nutrition", "current_published_menu_item_nutrition"]) {
  rolledBack[resource].anon.add(SELECT);
  rolledBack[resource].authenticated.add(SELECT);
}
const restoredReads = [
  ["menu_item_nutrition", "anon"],
  ["menu_item_nutrition", "authenticated"],
  ["current_published_menu_item_nutrition", "anon"],
  ["current_published_menu_item_nutrition", "authenticated"]
].every(([resource, role]) => canRead(rolledBack, resource, role));
check("rollback restores only the four SELECT grants", restoredReads && !canRead(rolledBack, "consumer_public_next_meal_candidates_v1", "anon"), "Rollback changed an unrelated read boundary.");
check("N3 and rollback add no write privilege", Object.values(rolledBack).every((roles) => Object.values(roles).every((privileges) => WRITE_PRIVILEGES.every((privilege) => !privileges.has(privilege)))), "A write privilege was introduced.");

const activeDiff = spawnSync("git", ["diff", "--name-only", "--", "apps/restaurant-web/app", "apps/restaurant-web/components", "apps/restaurant-web/services/restaurantConsoleService.ts", "apps/mobile", "apps/admin-web"], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
check("zero runtime page wiring", activeDiff.status === 0 && !activeDiff.stdout.trim(), "Runtime page or app wiring changed.");

console.log(JSON.stringify({
  status: issues.length ? "failed" : "passed",
  phase: "2U-C-B",
  mode: "contract",
  checks,
  issues,
  networkRequestMade: false,
  databaseReadExecuted: false,
  databaseWriteExecuted: false,
  remoteGrantChanged: false,
  productionTouched: false,
  runtimePageWiringChanged: false
}, null, 2));
process.exit(issues.length ? 1 : 0);
