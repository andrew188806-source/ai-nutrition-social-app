#!/usr/bin/env node
// MI-E-C5-R7-C2a contract smoke — EXECUTES the real production resolver.
//
// Loads apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts itself (no
// parallel re-implementation) and drives it with a canonical THREE-branch catalog fixture in which
// every branch's `name` differs from its `district`. That combination is what the pre-C2a resolver
// could not satisfy: it compared the flattened card's single `branchId` and rendered `location`
// (a district), so only the mapper's first branch could match and even that showed the wrong field.
//
// Fully local: no network, no Supabase client, no Development credential, no RPC.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
function loadTsModule(relative) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: relative
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(require_, module, module.exports);
  return module.exports;
}

const RESOLVER_PATH = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const presentation = loadTsModule(RESOLVER_PATH);
const resolve = presentation.resolveRestaurantContextPresentation;
expect(typeof resolve === "function", "C0 the REAL production resolver loads and is callable");

// ---- canonical nested fixture: three branches, name !== district for every one ----
const RESTAURANT = "dev-restaurant-haochu";
const OTHER_RESTAURANT = "synthetic-fixture-restaurant";
const B1 = "branch-xinyi";
const B2 = "branch-daan";
const B3 = "branch-zhongshan";
const RESTAURANT_NAME = "好廚健康碗";
const branch = (branchId, name, district) => ({
  branchId, restaurantId: RESTAURANT, name, district, address: `${district}測試路 1 號`, menus: []
});
const CATALOG = {
  id: RESTAURANT,
  restaurantId: RESTAURANT,
  // The flattened card fields the OLD resolver used. They are deliberately present and deliberately
  // wrong-for-branch-identity, so any regression back to them is immediately visible.
  branchId: B1,
  name: RESTAURANT_NAME,
  location: "信義區",
  distanceDisplay: "信義區",
  category: "health",
  tags: [],
  priceRange: "NT$--",
  score: "—",
  menuItems: [],
  branches: [
    branch(B1, "信義店", "信義區"),
    branch(B2, "大安店", "大安區"),
    branch(B3, "中山店", "中山區")
  ]
};
const findHit = () => CATALOG;
const findMiss = () => null;
const R = (over = {}) => resolve({ restaurantId: RESTAURANT, catalogStatus: "success", findRestaurant: findHit, ...over });

// ---- A. no restaurant context ----
{
  const none = resolve({ restaurantId: null, catalogStatus: "success", findRestaurant: findMiss });
  expect(none.kind === "none" && none.restaurantName === null && none.branchName === null,
    "A no restaurant context resolves to 'none' with no fabricated names");
  expect(resolve({ restaurantId: "   ", catalogStatus: "success", findRestaurant: findHit }).kind === "none",
    "A a blank restaurant id is still 'none'");
}

// ---- B. restaurant-only ----
{
  const only = R();
  expect(only.kind === "resolved" && only.restaurantName === RESTAURANT_NAME, "B restaurant-only resolves the real restaurant name");
  expect(only.branchName === null, "B restaurant-only invents NO branch name");
  expect(only.branchName !== "信義店" && only.branchName !== "信義區",
    "B restaurant-only never falls back to branches[0] or its district");
}

// ---- C. first branch ----
{
  const first = R({ branchId: B1 });
  expect(first.kind === "resolved" && first.branchName === "信義店", "C first branch resolves to its own NAME", first.branchName);
  expect(first.branchName !== "信義區", "C the first branch's district is NOT used as its name");
  expect(first.restaurantName === RESTAURANT_NAME, "C the restaurant name is unaffected by branch resolution");
}

// ---- D. second branch ----
{
  const second = R({ branchId: B2 });
  expect(second.kind === "resolved" && second.branchName === "大安店",
    "D second branch resolves to its own name (not null, not the first branch)", second.branchName);
  expect(second.branchName !== "信義店", "D the second branch does not fall back to the first branch");
  expect(second.branchName !== "大安區", "D the second branch's district is NOT used as its name");
}

// ---- E. third branch — proves this is general, not a second-branch special case ----
{
  const third = R({ branchId: B3 });
  expect(third.kind === "resolved" && third.branchName === "中山店",
    "E third branch resolves to its own name — the lookup is positional-independent", third.branchName);
  expect(third.branchName !== "中山區", "E the third branch's district is NOT used as its name");
  const names = [R({ branchId: B1 }).branchName, R({ branchId: B2 }).branchName, R({ branchId: B3 }).branchName];
  expect(new Set(names).size === 3, "E all three branches resolve to three DISTINCT names", names);
}

// ---- F. missing / unknown branch id ----
{
  const missing = R({ branchId: "branch-that-does-not-exist" });
  expect(missing.kind === "resolved" && missing.restaurantName === RESTAURANT_NAME,
    "F an unknown branch still resolves the restaurant (fail-soft, never blocks finalization)");
  expect(missing.branchName === null, "F an unknown branch yields no branch name at all");
  expect(missing.branchName !== "信義店", "F an unknown branch does NOT fall back to the first branch");
}

// ---- G. branch belonging to another restaurant ----
{
  const foreign = R({ branchId: "synthetic-fixture-branch-a" });
  expect(foreign.kind === "resolved" && foreign.branchName === null,
    "G a branch owned by another restaurant contributes no name");
  const otherRestaurantLookup = resolve({
    restaurantId: OTHER_RESTAURANT, branchId: B1, catalogStatus: "success",
    findRestaurant: (id) => (id === RESTAURANT ? CATALOG : null)
  });
  expect(otherRestaurantLookup.kind === "unresolved",
    "G looking up a different restaurant id does not leak this restaurant's branches");
}

// ---- H. missing restaurant ----
{
  const missed = resolve({ restaurantId: RESTAURANT, branchId: B2, catalogStatus: "success", findRestaurant: findMiss });
  expect(missed.kind === "unresolved" && missed.restaurantName === null && missed.branchName === null,
    "H a catalog miss fails closed with neither name");
}

// ---- I/J/K. state contract preserved ----
{
  expect(R({ catalogStatus: "loading" }).kind === "loading", "I a loading catalog still reports 'loading'");
  expect(R({ catalogStatus: "idle" }).kind === "loading", "I an idle catalog still reports 'loading'");
  expect(R({ catalogStatus: "disabled" }).kind === "unresolved", "J a disabled catalog still reports 'unresolved'");
  expect(R({ catalogStatus: "error" }).kind === "unresolved", "K a catalog error still reports 'unresolved'");
  for (const status of ["loading", "idle", "error", "disabled"]) {
    const r = R({ branchId: B2, catalogStatus: status });
    expect(r.kind !== "resolved" && r.restaurantName === null && r.branchName === null,
      `K catalogStatus=${status} can never produce a name, even with a valid branchId`);
  }
  const emptyBranches = resolve({
    restaurantId: RESTAURANT, branchId: B1, catalogStatus: "success",
    findRestaurant: () => ({ ...CATALOG, branches: [] })
  });
  expect(emptyBranches.kind === "resolved" && emptyBranches.branchName === null,
    "K a restaurant with no branches resolves the restaurant and no branch, without throwing");
  const uuidName = resolve({
    restaurantId: RESTAURANT, catalogStatus: "success",
    findRestaurant: () => ({ ...CATALOG, name: "3f1d3c22-1111-4a2b-8c3d-44445555aaaa" })
  });
  expect(uuidName.kind === "unresolved", "K a UUID-shaped catalog name is still refused");
  const uuidBranch = resolve({
    restaurantId: RESTAURANT, branchId: B1, catalogStatus: "success",
    findRestaurant: () => ({ ...CATALOG, branches: [branch(B1, "3f1d3c22-1111-4a2b-8c3d-44445555aaaa", "信義區")] })
  });
  expect(uuidBranch.kind === "resolved" && uuidBranch.branchName === null,
    "K a UUID-shaped BRANCH name is refused too, without losing the restaurant");
}

// ---- L. immutability ----
{
  const r = R({ branchId: B2 });
  expect(Object.isFrozen(r), "L the resolved presentation is still frozen");
  expect(Object.isFrozen(resolve({ restaurantId: null, catalogStatus: "success", findRestaurant: findMiss })),
    "L the 'none' presentation is still frozen");
  expect(Object.keys(r).sort().join(",") === "branchName,kind,restaurantName",
    "L the output shape is unchanged — exactly kind/restaurantName/branchName", Object.keys(r).sort());
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "restaurant-display-mi-e-c5-r7-c2a",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks
}, null, 2));
if (failed.length) process.exit(1);
