import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpc = fs.readFileSync(path.join(root, "supabase/migrations/20260716050000_create_restaurant_internal_read_rpcs_as_owner.sql"), "utf8");
const integrity = fs.readFileSync(path.join(root, "supabase/migrations/20260716030000_add_restaurant_projection_integrity_constraints.sql"), "utf8");
const checks = [];
const failures = [];
function record(name, pass, detail) {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) failures.push({ name, detail });
}

const permissions = Object.freeze({
  owner: Object.freeze({ branch: "restaurant", menu: "restaurant", nutrition: "restaurant" }),
  manager: Object.freeze({ branch: "branch", menu: "branch", nutrition: "branch" }),
  staff: Object.freeze({ branch: "branch", menu: "branch", nutrition: "branch" })
});
const actors = Object.freeze([
  { actor: "owner-a", tenant: "a", role: "owner", identity: "enabled", membership: "active", branches: [] },
  { actor: "manager-a", tenant: "a", role: "manager", identity: "enabled", membership: "active", branches: ["a1"] },
  { actor: "staff-a", tenant: "a", role: "staff", identity: "enabled", membership: "active", branches: ["a2"] },
  { actor: "owner-b", tenant: "b", role: "owner", identity: "enabled", membership: "active", branches: [] },
  { actor: "disabled", tenant: "a", role: "owner", identity: "disabled", membership: "active", branches: [] },
  { actor: "inactive", tenant: "a", role: "owner", identity: "enabled", membership: "inactive", branches: [] },
  { actor: "suspended", tenant: "a", role: "owner", identity: "enabled", membership: "suspended", branches: [] },
  { actor: "revoked", tenant: "a", role: "owner", identity: "enabled", membership: "revoked", branches: [] }
]);
const branches = Object.freeze([
  { id: "a1", tenant: "a" }, { id: "a2", tenant: "a" }, { id: "b1", tenant: "b" }
]);
const items = Object.freeze([
  { id: "ia1", tenant: "a", branch: "a1", chainValid: true },
  { id: "ia2", tenant: "a", branch: "a2", chainValid: true },
  { id: "ib1", tenant: "b", branch: "b1", chainValid: true },
  { id: "bad-chain", tenant: "a", branch: "b1", chainValid: false }
]);
const nutrition = Object.freeze([
  { id: "na1-current", item: "ia1", current: true },
  { id: "na1-old", item: "ia1", current: false },
  { id: "na2-current", item: "ia2", current: true },
  { id: "nb1-current", item: "ib1", current: true }
]);

function context(actorKey) {
  const actor = actors.find((entry) => entry.actor === actorKey);
  if (!actor || actor.identity !== "enabled" || actor.membership !== "active" || !permissions[actor.role]) return null;
  return actor;
}
function allowedBranchIds(actorKey, selectedTenant, permission) {
  const actor = context(actorKey);
  if (!actor || actor.tenant !== selectedTenant) return [];
  const scope = permissions[actor.role][permission];
  if (scope === "restaurant") return branches.filter((branch) => branch.tenant === actor.tenant).map((branch) => branch.id);
  return actor.branches.filter((branchId) => branches.some((branch) => branch.id === branchId && branch.tenant === actor.tenant));
}
function visibleItems(actorKey, selectedTenant) {
  const allowed = new Set(allowedBranchIds(actorKey, selectedTenant, "menu"));
  return items.filter((item) => item.tenant === selectedTenant && item.chainValid && allowed.has(item.branch));
}
function visibleNutrition(actorKey, selectedTenant) {
  const visible = new Set(visibleItems(actorKey, selectedTenant).map((item) => item.id));
  return nutrition.filter((row) => row.current && visible.has(row.item));
}

record("owner sees both Restaurant A branches", allowedBranchIds("owner-a", "a", "branch").length === 2);
record("owner sees no Restaurant B branch", allowedBranchIds("owner-a", "b", "branch").length === 0);
record("manager sees assigned A1 only", JSON.stringify(allowedBranchIds("manager-a", "a", "branch")) === JSON.stringify(["a1"]));
record("staff sees assigned A2 only", JSON.stringify(allowedBranchIds("staff-a", "a", "branch")) === JSON.stringify(["a2"]));
record("manager menu reachability is A1 only", JSON.stringify(visibleItems("manager-a", "a").map((item) => item.id)) === JSON.stringify(["ia1"]));
record("staff menu reachability is A2 only", JSON.stringify(visibleItems("staff-a", "a").map((item) => item.id)) === JSON.stringify(["ia2"]));
record("mismatched branch/item chain fails closed", !visibleItems("owner-a", "a").some((item) => item.id === "bad-chain"));
record("nutrition includes only current reachable rows", JSON.stringify(visibleNutrition("manager-a", "a").map((row) => row.id)) === JSON.stringify(["na1-current"]));
for (const denied of [null, "disabled", "inactive", "suspended", "revoked"]) {
  record(`${denied ?? "missing"} actor returns zero`, visibleItems(denied, "a").length === 0 && visibleNutrition(denied, "a").length === 0);
}
record("selector cannot grant cross-tenant access", visibleItems("owner-b", "a").length === 0 && visibleItems("manager-a", "b").length === 0);

record("all seven functions use access context", (rpc.match(/public\.restaurant_current_access_context_v1\(\)/g) ?? []).length === 7);
record("six selectors are intersected with authorized restaurant", (rpc.match(/access\.restaurant_id = p_restaurant_id/g) ?? []).length === 6);
record("branch reachability appears in six scoped functions", (rpc.match(/scope\.branch_id/g) ?? []).length >= 6);
record("nutrition current predicate is explicit", rpc.includes("nutrition.is_current = true"));
record("same-restaurant composite foreign keys are present", integrity.includes("FOREIGN KEY (branch_id, restaurant_id)") && integrity.includes("FOREIGN KEY (menu_item_id, restaurant_id)"));
record("migration contains no application write", !/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CALL)\b/i.test(rpc));
const functionBodies = [...rpc.matchAll(/AS \$\$([\s\S]*?)\$\$;/g)].map((match) => match[1]).join("\n");
record("function bodies contain no dynamic SQL", !/\bEXECUTE\b/i.test(functionBodies));

console.log(JSON.stringify({ phase: "2V-C contract smoke", checks, failures }, null, 2));
if (failures.length) process.exit(1);
