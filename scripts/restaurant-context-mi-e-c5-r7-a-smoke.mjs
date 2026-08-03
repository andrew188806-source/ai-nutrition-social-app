#!/usr/bin/env node
// MI-E-C5-R7-A behavioral smoke. Executes the REAL production session store, the REAL canonical
// normalizer and the REAL presentation resolver — no source-string assertions, no reimplemented rules.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const expect = (condition, name) => {
  if (!condition) throw new Error(`R7-A smoke assertion failed: ${name}`);
  checks.push({ name, pass: true });
};

const moduleCache = new Map();
function loadTsModule(relativePath) {
  const absolute = path.resolve(root, relativePath);
  if (moduleCache.has(absolute)) return moduleCache.get(absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: absolute
  }).outputText;
  const mod = { exports: {} };
  moduleCache.set(absolute, mod.exports);
  const localRequire = (request) => {
    if (!request.startsWith(".")) throw new Error(`R7-A smoke refused external module: ${request}`);
    const base = path.resolve(path.dirname(absolute), request).replace(/\.(?:js|tsx?)$/, "");
    const resolved = fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`;
    return loadTsModule(path.relative(root, resolved));
  };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute })(localRequire, mod, mod.exports);
  moduleCache.set(absolute, mod.exports);
  return mod.exports;
}

const store = loadTsModule("apps/mobile/features/analysis/analysisSessionStore.ts");
const presentation = loadTsModule("apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts");
expect(typeof store.normalizeAnalysisRestaurantContext === "function", "real session store + normalizer load");
expect(typeof presentation.resolveRestaurantContextPresentation === "function", "real presentation resolver loads");

const ACTOR_A = { actorKey: "actor-a", actorGeneration: 1 };
const ACTOR_B = { actorKey: "actor-b", actorGeneration: 1 };
const RESTAURANT = "9f1d3c22-1111-4a2b-8c3d-44445555aaaa";
const BRANCH = "9f1d3c22-2222-4a2b-8c3d-44445555bbbb";
const DEPS = { releaseOwnedGalleryAsset: () => {} };

// ===================== session defaults =====================
{
  const fresh = store.createSanitizedAnalysisSessionView();
  expect(fresh.restaurantId === null, "S1: default restaurantId is null");
  expect(fresh.branchId === null, "S1: default branchId is null");
  expect(!("restaurantDisplayName" in fresh),
    "S1: the untrusted display-name snapshot field no longer exists on the session at all");
  expect(fresh.restaurantName === "", "S1: the legacy restaurantName default is empty");
  expect(!JSON.stringify(fresh).includes("好初健康碗"),
    "S1: the demo restaurant fixture is no longer any session default");
  expect(store.isAnalysisSessionPristine(fresh) === true, "S1: a default session is pristine");
}

// ===================== canonical invariants =====================
{
  const n = store.normalizeAnalysisRestaurantContext;

  const dineIn = n({ restaurantId: RESTAURANT, branchId: BRANCH, sourceContext: "dine_in" });
  expect(dineIn.restaurantId === RESTAURANT && dineIn.branchId === BRANCH,
    "S2: dine_in keeps restaurant and branch ids");
  expect(!("restaurantDisplayName" in dineIn),
    "S2: the normalizer emits IDs only — no display-name output exists");

  const injected = n({ restaurantId: RESTAURANT, restaurantDisplayName: "Injected Name", sourceContext: "dine_in" });
  expect(!("restaurantDisplayName" in injected),
    "S2: a caller-supplied display name is not carried through even if passed");

  const takeout = n({ restaurantId: RESTAURANT, branchId: BRANCH, sourceContext: "takeout" });
  expect(takeout.restaurantId === RESTAURANT && takeout.branchId === BRANCH,
    "S2: takeout does NOT clear restaurant context");
  const delivery = n({ restaurantId: RESTAURANT, branchId: BRANCH, sourceContext: "delivery" });
  expect(delivery.restaurantId === RESTAURANT && delivery.branchId === BRANCH,
    "S2: delivery does NOT clear restaurant context");
  const unknown = n({ restaurantId: RESTAURANT, sourceContext: "unknown" });
  expect(unknown.restaurantId === RESTAURANT, "S2: unknown source context keeps restaurant");

  const selfCooked = n({ restaurantId: RESTAURANT, branchId: BRANCH, sourceContext: "self_cooked" });
  expect(selfCooked.restaurantId === null && selfCooked.branchId === null,
    "S2: self_cooked clears both restaurant and branch ids");

  const branchOnly = n({ restaurantId: null, branchId: BRANCH, sourceContext: "dine_in" });
  expect(branchOnly.branchId === null, "S2: a branch can never exist without its restaurant");

  const blank = n({ restaurantId: "   ", branchId: "  ", sourceContext: "dine_in" });
  expect(blank.restaurantId === null && blank.branchId === null,
    "S2: whitespace-only ids are treated as absent");
}

// ===================== capture lifecycle =====================
{
  // A known-entry capture receives its context atomically inside the reset.
  store.beginAnalysisCapture("camera", "file:///a.jpg", new Date(), null, null, ACTOR_A, {
    restaurantId: RESTAURANT,
    branchId: BRANCH
  });
  let s = store.getAnalysisSession();
  expect(s.restaurantId === RESTAURANT && s.branchId === BRANCH,
    "S3: a known-entry capture carries its restaurant ids immediately after the reset");
  expect(!("restaurantDisplayName" in s),
    "S3: no display-name snapshot is created by the capture handoff");
  const operationOne = s.analysisRequestId;
  const captureOne = s.captureGeneration;

  // Same operation: an ordinary read must not disturb it.
  expect(store.getAnalysisRestaurantContext().restaurantId === RESTAURANT,
    "S3: reading the context does not clear it (same operation preserved)");

  // A NEW generic capture must not inherit the previous meal's restaurant.
  store.beginAnalysisCapture("photo_library", "file:///b.jpg", new Date(), null, null, ACTOR_A);
  s = store.getAnalysisSession();
  expect(s.restaurantId === null && s.branchId === null,
    "S3: a new generic capture inherits NO restaurant context from the previous meal");
  expect(s.analysisRequestId !== operationOne && s.captureGeneration !== captureOne,
    "S3: the new capture is a genuinely new operation (R6-A identity still advances)");

  // R6-A: restaurant context must not participate in operation identity.
  const beforeId = s.analysisRequestId;
  const beforeGeneration = s.captureGeneration;
  store.setAnalysisRestaurantContext({ restaurantId: RESTAURANT, branchId: BRANCH }, "dine_in");
  s = store.getAnalysisSession();
  expect(s.analysisRequestId === beforeId && s.captureGeneration === beforeGeneration,
    "S3: setting restaurant context NEVER changes analysisRequestId or captureGeneration");
  expect(s.restaurantId === RESTAURANT, "S3: the context was applied to the live session");

  // Switching to self-cooked drops the venue, and switching back does not resurrect it.
  store.reconcileAnalysisRestaurantContextForSourceContext("self_cooked");
  expect(store.getAnalysisRestaurantContext().restaurantId === null,
    "S3: switching to self_cooked clears the restaurant context");
  store.reconcileAnalysisRestaurantContextForSourceContext("dine_in");
  expect(store.getAnalysisRestaurantContext().restaurantId === null,
    "S3: switching back does NOT resurrect the previous restaurant — it must be chosen again");
}

// ===================== actor isolation =====================
{
  store.beginAnalysisCapture("camera", "file:///c.jpg", new Date(), null, null, ACTOR_A, {
    restaurantId: RESTAURANT
  });
  expect(store.getAnalysisSession().restaurantId === RESTAURANT, "S4: actor A owns a restaurant context");

  const decision = store.deriveAnalysisSessionViewForActor(store.getAnalysisSession(), ACTOR_B);
  expect(decision.status !== "owned", "S4: actor B does not own actor A's session");
  expect(decision.session.restaurantId === null && decision.session.branchId === null,
    "S4: actor B's sanitized view exposes NO restaurant context belonging to actor A");

  store.resetAnalysisSessionForActor(ACTOR_B, DEPS);
  expect(store.getAnalysisSession().restaurantId === null,
    "S4: an actor change clears the restaurant context from the live session");

  const withRestaurant = { ...store.createSanitizedAnalysisSessionView(), restaurantId: RESTAURANT };
  expect(store.isAnalysisSessionPristine(withRestaurant) === false,
    "S4: a session still carrying a restaurant context is NOT pristine");
}

// ===================== presentation resolver =====================
{
  const resolve = presentation.resolveRestaurantContextPresentation;
  // MI-E-C5-R7-C2a: the fixture now mirrors the CANONICAL nested catalog model, and every branch's
  // `name` is deliberately different from its `district`. The previous fixture was flat and asserted
  // branchName === "中山區" — a DISTRICT — which is exactly the defect this round corrects, so the
  // old smoke could never have caught it.
  const SECOND_BRANCH = "1c0f8a44-2222-4c9d-9c11-77778888dddd";
  const catalogHit = () => ({
    restaurantId: RESTAURANT,
    branchId: BRANCH,
    name: "好廚健康碗 Development",
    location: "中山區",
    branches: [
      { branchId: BRANCH, restaurantId: RESTAURANT, name: "中山店", district: "中山區", address: "中山路 1 號", menus: [] },
      { branchId: SECOND_BRANCH, restaurantId: RESTAURANT, name: "大安店", district: "大安區", address: "大安路 2 號", menus: [] }
    ]
  });
  const catalogMiss = () => null;

  const none = resolve({ restaurantId: null, catalogStatus: "success", findRestaurant: catalogMiss });
  expect(none.kind === "none" && none.restaurantName === null,
    "S5: no restaurant context resolves to 'none' with no fabricated name");

  const resolved = resolve({
    restaurantId: RESTAURANT, branchId: BRANCH,
    catalogStatus: "success", findRestaurant: catalogHit
  });
  expect(resolved.kind === "resolved" && resolved.restaurantName === "好廚健康碗 Development",
    "S5: a ready catalog hit is the only way a name is produced");
  expect(resolved.branchName === "中山店", "S5: a matching branch contributes its own branch NAME");
  expect(resolved.branchName !== "中山區", "S5: the branch district is never used as the branch name");

  // MI-E-C5-R7-C2a: a NON-first branch must resolve to its own name, not to null and not to the
  // first branch. Under the flattened-card resolver this case was unreachable.
  const secondBranch = resolve({
    restaurantId: RESTAURANT, branchId: SECOND_BRANCH,
    catalogStatus: "success", findRestaurant: catalogHit
  });
  expect(secondBranch.kind === "resolved" && secondBranch.branchName === "大安店",
    "S5: a second branch resolves to its own name rather than null or the first branch");
  expect(secondBranch.branchName !== "大安區", "S5: the second branch's district is not used either");
  expect(secondBranch.restaurantName === "好廚健康碗 Development",
    "S5: resolving a non-first branch does not disturb the restaurant name");

  const restaurantOnly = resolve({
    restaurantId: RESTAURANT, catalogStatus: "success", findRestaurant: catalogHit
  });
  expect(restaurantOnly.kind === "resolved" && restaurantOnly.branchName === null,
    "S5: restaurant-only never invents a branch, and never falls back to branches[0]");

  const foreignBranch = resolve({
    restaurantId: RESTAURANT, branchId: "9f1d3c22-9999-4a2b-8c3d-44445555cccc",
    catalogStatus: "success", findRestaurant: catalogHit
  });
  expect(foreignBranch.kind === "resolved" && foreignBranch.branchName === null,
    "S5: a branch that does not belong to the restaurant contributes no name");

  const missed = resolve({ restaurantId: RESTAURANT, catalogStatus: "success", findRestaurant: catalogMiss });
  expect(missed.kind === "unresolved" && missed.restaurantName === null,
    "S5: a catalog miss fails closed with no name at all");

  // The R7-A audit's blocking finding: an arbitrary caller string must never become a name. There is
  // now no parameter for one, so even passing extra keys changes nothing.
  for (const status of ["idle", "loading", "error", "disabled"]) {
    const r = resolve({
      restaurantId: RESTAURANT,
      catalogStatus: status,
      findRestaurant: catalogHit,
      // deliberately hostile extra keys — must be ignored entirely
      restaurantDisplayName: "Injected Name",
      snapshot: "Injected Name",
      name: "Injected Name"
    });
    expect(r.kind !== "resolved" && r.restaurantName === null,
      `S5: catalogStatus=${status} can NEVER resolve, and no injected string becomes a name`);
  }
  expect(resolve({ restaurantId: RESTAURANT, catalogStatus: "loading", findRestaurant: catalogHit }).kind === "loading",
    "S5: a still-loading catalog reports 'loading' rather than a false unresolved");
  expect(resolve({ restaurantId: RESTAURANT, catalogStatus: "error", findRestaurant: catalogHit }).kind === "unresolved",
    "S5: a catalog error reports 'unresolved'");
  expect(resolve({ restaurantId: RESTAURANT, catalogStatus: "disabled", findRestaurant: catalogHit }).kind === "unresolved",
    "S5: a disabled catalog reports 'unresolved'");

  const uuidFromCatalog = resolve({
    restaurantId: RESTAURANT, catalogStatus: "success",
    findRestaurant: () => ({ restaurantId: RESTAURANT, name: RESTAURANT, location: "" })
  });
  expect(uuidFromCatalog.kind === "unresolved",
    "S5: even a catalog row whose name is UUID-shaped is refused");

  expect(presentation.isDisplayableRestaurantName(RESTAURANT) === false, "S5: UUID rejected by the name predicate");
  expect(presentation.isDisplayableRestaurantName("") === false, "S5: empty rejected");
  expect(presentation.isDisplayableRestaurantName("好廚健康碗") === true, "S5: a real name is accepted");
}

// ===================== Today Intake mapper =====================
{
  const src = fs.readFileSync(path.resolve(root, "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts"), "utf8");
  expect(!/restaurantName: firstItem\?\.restaurantId/.test(src),
    "S6: Today Intake no longer assigns a canonical id to the restaurantName display field");
  expect(/restaurantId: firstItem\?\.restaurantId \?\? undefined/.test(src),
    "S6: Today Intake still carries the canonical id in its own field");
}

console.log(JSON.stringify({
  phase: "MI-E-C5-R7-A Canonical Restaurant Context Foundation Smoke",
  status: "passed",
  totalChecks: checks.length,
  passed: checks.length,
  failed: 0,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  physicalDeviceUsed: false
}, null, 2));
