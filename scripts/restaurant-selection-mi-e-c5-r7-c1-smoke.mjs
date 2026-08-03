#!/usr/bin/env node
// MI-E-C5-R7-C1 contract smoke — EXECUTES the real production modules.
//
// Two layers:
//   * pure handoff  — the actual analysisRestaurantHandoff.ts encode/decode rules.
//   * session integration — the actual analysisSessionStore.ts reset/set lifecycle, driven through
//     the same ordering meal-photo.tsx uses, so the reset -> apply-explicit-selection sequence is
//     proven by running it rather than by matching the screen's source.
//
// Fully local: no network, no Supabase client, no Development credential, no RPC.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const expect = (pass, name, detail) => checks.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) });

// Same transpile-and-load approach the R7-A/R7-B smokes use: the real .ts source, no re-implementation.
const require_ = createRequire(import.meta.url);
const moduleCache = new Map();
function loadTsModule(relative) {
  if (moduleCache.has(relative)) return moduleCache.get(relative);
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: relative
  });
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      const resolved = path.posix.join(path.posix.dirname(relative.replaceAll("\\", "/")), request);
      for (const candidate of [`${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`]) {
        if (fs.existsSync(path.join(root, candidate))) return loadTsModule(candidate);
      }
    }
    return require_(request);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  moduleCache.set(relative, module.exports);
  return module.exports;
}

const handoff = loadTsModule("apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts");
const store = loadTsModule("apps/mobile/features/analysis/analysisSessionStore.ts");
const { decodeAnalysisRestaurantHandoff: decode, encodeAnalysisRestaurantHandoffParams: encode } = handoff;

expect(typeof decode === "function", "S0 real decoder loads");
expect(typeof encode === "function", "S0b real encoder loads");
expect(typeof store.setAnalysisRestaurantContext === "function", "S0c real session store loads");

const R = "dev-restaurant-haochu";
const R2 = "synthetic-fixture-restaurant";
const B = "synthetic-fixture-branch-a";
const B2 = "synthetic-fixture-branch-b";

// ============================ Pure handoff (A-K) ============================
{
  expect(decode(undefined) === null, "A no params at all -> null");
  expect(decode({}) === null, "A no restaurant/branch keys -> null");
  expect(decode({ restaurantId: undefined, branchId: undefined }) === null, "A undefined values -> null");

  const b = decode({ restaurantId: R });
  expect(b !== null && b.restaurantId === R && b.branchId === null, "B restaurant scalar -> restaurant-only", JSON.stringify(b));

  const c = decode({ restaurantId: R, branchId: B });
  expect(c !== null && c.restaurantId === R && c.branchId === B, "C restaurant + branch scalar -> pair preserved", JSON.stringify(c));

  expect(decode({ branchId: B }) === null, "D branch-only -> null (no branch-only context can exist)");
  expect(decode({ restaurantId: "", branchId: B }) === null, "D empty restaurant + branch -> null");
  expect(decode({ restaurantId: "   ", branchId: B }) === null, "D whitespace restaurant + branch -> null");

  expect(decode({ restaurantId: "" }) === null, "E empty string -> null");
  expect(decode({ restaurantId: "   " }) === null, "E whitespace-only -> null");

  const f = decode({ restaurantId: [R], branchId: [B] });
  expect(f !== null && f.restaurantId === R && f.branchId === B, "F single-element arrays normalize", JSON.stringify(f));

  expect(decode({ restaurantId: [R, R2] }) === null, "G multi-element restaurant array rejected as ambiguous");
  expect(decode({ restaurantId: [] }) === null, "G empty restaurant array rejected");
  const g = decode({ restaurantId: R, branchId: [B, B2] });
  expect(g !== null && g.restaurantId === R && g.branchId === null,
    "G multi-element branch array rejected, degrades to restaurant-only (never picks one)", JSON.stringify(g));
  const g2 = decode({ restaurantId: R, branchId: [] });
  expect(g2 !== null && g2.branchId === null, "G empty branch array -> restaurant-only");

  const h = decode({ restaurantId: `  ${R}  `, branchId: `  ${B}  ` });
  expect(h !== null && h.restaurantId === R && h.branchId === B, "H whitespace trimmed on both ids", JSON.stringify(h));

  const i = encode({ restaurantId: R, selectedBranchId: "branch-that-no-longer-exists", branchIds: [B, B2] });
  expect(i !== null && i.restaurantId === R && !("branchId" in i), "I stale selected branch -> restaurant-only", JSON.stringify(i));
  const i2 = encode({ restaurantId: R, selectedBranchId: B, branchIds: [] });
  expect(i2 !== null && !("branchId" in i2), "I selected branch with empty branch list -> restaurant-only");

  const j = encode({ restaurantId: R, selectedBranchId: B, branchIds: [B, B2] });
  expect(j !== null && j.restaurantId === R && j.branchId === B, "J valid selected branch -> restaurant + branch", JSON.stringify(j));

  expect(encode({ restaurantId: null, selectedBranchId: B, branchIds: [B] }) === null, "J no restaurant -> no handoff at all");
  expect(encode({ restaurantId: "  ", selectedBranchId: B, branchIds: [B] }) === null, "J blank restaurant -> no handoff");
  const jNoBranch = encode({ restaurantId: R, selectedBranchId: null, branchIds: [B] });
  expect(jNoBranch !== null && !("branchId" in jNoBranch), "J no branch selected -> restaurant-only");

  // K: the emitted route object may carry ONLY the two approved durable-id keys.
  const approved = new Set(handoff.ANALYSIS_RESTAURANT_HANDOFF_PARAM_KEYS);
  expect(approved.size === 2 && approved.has("restaurantId") && approved.has("branchId"),
    "K approved route key set is exactly {restaurantId, branchId}");
  const emitted = [
    encode({ restaurantId: R, selectedBranchId: B, branchIds: [B] }),
    encode({ restaurantId: R, selectedBranchId: null, branchIds: [B] })
  ];
  expect(emitted.every((params) => Object.keys(params).every((key) => approved.has(key))),
    "K encoder emits no key outside the approved set", JSON.stringify(emitted));
  const forbidden = /name|district|address|menu|category|nutrition|price|tags|score|location/i;
  expect(emitted.every((params) => !Object.keys(params).some((key) => forbidden.test(key))),
    "K encoder emits no display/menu field");
  expect(emitted.every((params) => Object.values(params).every((value) => typeof value === "string")),
    "K every emitted value is a plain string id (no serialized object)");
  expect(Object.isFrozen(emitted[0]) && Object.isFrozen(decode({ restaurantId: R })), "K emitted handoffs are immutable");
}

// ==================== Session integration (L-V) ====================
// Mirrors meal-photo.tsx's seam EXACTLY: reset first, then apply the explicit route selection.
const ACTOR = { actorKey: "r7c1-actor", actorGeneration: 1 };
const DEPS = Object.freeze({ releaseOwnedGalleryAsset: () => {} });
function beginNewAnalysisSession(routeParams) {
  store.resetAnalysisSessionForActor(ACTOR, DEPS);
  const decoded = decode(routeParams);
  if (!decoded) return null;
  return store.setAnalysisRestaurantContext({ restaurantId: decoded.restaurantId, branchId: decoded.branchId });
}
const venue = () => store.getAnalysisRestaurantContext();

{
  beginNewAnalysisSession(undefined);
  expect(venue().restaurantId === null && venue().branchId === null, "L generic capture keeps a null context after reset");

  beginNewAnalysisSession({ restaurantId: R });
  expect(venue().restaurantId === R && venue().branchId === null, "M restaurant-only route -> restaurant + null branch", JSON.stringify(venue()));

  beginNewAnalysisSession({ restaurantId: R2, branchId: B2 });
  expect(venue().restaurantId === R2 && venue().branchId === B2, "N restaurant + branch route -> both preserved", JSON.stringify(venue()));

  // O: Venue A present, then a GENERIC new capture must not inherit it.
  beginNewAnalysisSession({ restaurantId: R, branchId: B });
  expect(venue().restaurantId === R, "O precondition: Venue A is held");
  beginNewAnalysisSession(undefined);
  expect(venue().restaurantId === null && venue().branchId === null, "O generic reset drops Venue A (no inheritance)", JSON.stringify(venue()));

  // P: Venue A present, then an EXPLICIT Venue B route.
  beginNewAnalysisSession({ restaurantId: R, branchId: B });
  beginNewAnalysisSession({ restaurantId: R2, branchId: B2 });
  expect(venue().restaurantId === R2 && venue().branchId === B2, "P explicit Venue B replaces Venue A entirely", JSON.stringify(venue()));

  // D at session level: a branch-only route must not create any context.
  beginNewAnalysisSession(undefined);
  beginNewAnalysisSession({ branchId: B });
  expect(venue().restaurantId === null && venue().branchId === null, "D(session) branch-only route writes no context");

  // Q/R: self_cooked clears, switching back does not resurrect. Frozen R7-A reconciler, unmodified.
  beginNewAnalysisSession({ restaurantId: R, branchId: B });
  store.reconcileAnalysisRestaurantContextForSourceContext("self_cooked");
  expect(venue().restaurantId === null && venue().branchId === null, "Q self_cooked clears the venue");
  store.reconcileAnalysisRestaurantContextForSourceContext("dine_in");
  expect(venue().restaurantId === null && venue().branchId === null, "R switching back does not resurrect the venue");

  // S: repeated identical initialization is deterministic (no drift, no partial state).
  const params = { restaurantId: R2, branchId: B2 };
  beginNewAnalysisSession(params);
  const first = JSON.stringify(venue());
  for (let i = 0; i < 5; i++) beginNewAnalysisSession(params);
  expect(JSON.stringify(venue()) === first, "S repeated initialization is idempotent", `${first} vs ${JSON.stringify(venue())}`);

  // T: the autoOpen path and the gesture path are the SAME function, so they cannot diverge.
  beginNewAnalysisSession(undefined);
  const gesture = (() => { beginNewAnalysisSession({ restaurantId: R, branchId: B }); return JSON.stringify(venue()); })();
  beginNewAnalysisSession(undefined);
  const auto = (() => { beginNewAnalysisSession({ restaurantId: R, branchId: B }); return JSON.stringify(venue()); })();
  expect(gesture === auto, "T autoOpen and gesture entries produce identical context", `${gesture} vs ${auto}`);
}

// ==================== Finalization shape reachability (U, V) ====================
// Uses the FROZEN v3 command builder, unmodified, to prove which key set each flow reaches.
{
  const v3 = loadTsModule("apps/mobile/features/meal-identification-finalization/v3Contract.ts");
  const build = v3.buildMealIdentificationFinalizationV3;
  expect(typeof build === "function", "U/V frozen v3 command builder is callable");
  const baseInput = {
    analysisRequestId: "11111111-1111-4111-8111-111111111111",
    selectedCandidateId: "22222222-2222-4222-8222-222222222222",
    captureMethod: "camera",
    sourceContext: "takeout",
    recordTiming: "current",
    occurredAt: "2026-08-03T12:00:00.000Z",
    mealWrite: { mealName: "測試", components: ["a"], portion: null, nutrition: { calories: 600 } }
  };

  // U: a generic capture must still produce the legacy 8-key command, unchanged by R7-C1.
  beginNewAnalysisSession(undefined);
  const generic = build({ ...baseInput, restaurantId: venue().restaurantId, branchId: venue().branchId });
  expect(generic.ok, "U generic capture builds a valid command", JSON.stringify(generic));
  const genericKeys = generic.ok ? Object.keys(generic.value).sort() : [];
  expect(genericKeys.length === 8 && !genericKeys.includes("restaurantId") && !genericKeys.includes("branchId"),
    "U generic capture still reaches the legacy 8-key finalization shape", JSON.stringify(genericKeys));

  // V: a catalog-selected capture now reaches the 10-key restaurant command from the REAL session.
  beginNewAnalysisSession({ restaurantId: R2, branchId: B2 });
  const selected = build({ ...baseInput, restaurantId: venue().restaurantId, branchId: venue().branchId });
  expect(selected.ok, "V catalog-selected capture builds a valid command", JSON.stringify(selected));
  const selectedKeys = selected.ok ? Object.keys(selected.value).sort() : [];
  expect(selectedKeys.length === 10 && selectedKeys.includes("restaurantId") && selectedKeys.includes("branchId"),
    "V catalog-selected capture reaches the 10-key restaurant shape", JSON.stringify(selectedKeys));
  expect(selected.ok && selected.value.restaurantId === R2 && selected.value.branchId === B2,
    "V the 10-key command carries the ids the route actually selected");

  // Restaurant-only selection must also be a valid 10-key command with a null branch.
  beginNewAnalysisSession({ restaurantId: R2 });
  const restaurantOnly = build({ ...baseInput, restaurantId: venue().restaurantId, branchId: venue().branchId });
  expect(restaurantOnly.ok && Object.keys(restaurantOnly.value).length === 10 && restaurantOnly.value.branchId === null,
    "V restaurant-only selection reaches a 10-key command with an explicit null branch");
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "restaurant-selection-mi-e-c5-r7-c1",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks
}, null, 2));
if (failed.length) process.exit(1);
