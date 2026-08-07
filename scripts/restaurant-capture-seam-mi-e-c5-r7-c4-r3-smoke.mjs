#!/usr/bin/env node
// MI-E-C5-R7-C4-R3 contract smoke — RESTAURANT CONTEXT SURVIVAL ACROSS THE CAPTURE RESET.
//
// This is the sequence no existing suite ever executed, which is exactly why a dead handoff shipped
// three rounds in a row and was only caught on a physical device:
//
//     setAnalysisRestaurantContext(...)     ← what meal-photo.tsx writes at 開始 AI 分析
//     beginAnalysisCapture(...)             ← what the actual photo capture calls, which FULL-RESETS
//     getAnalysisSession()                  ← what /analysis then reads
//
// The R7-A smoke proved `beginAnalysisCapture(..., context)` works when the context IS passed, and
// separately proved that omitting it yields null — correct for the store's own contract. The C1
// smoke proved `decode → setAnalysisRestaurantContext` works. Neither ever ran the two together, so
// the reset that sits between them was invisible: the ids were written, then destroyed, and every
// suite still passed.
//
// Executes the REAL production modules:
//   * apps/mobile/features/analysis/analysisSessionStore.ts            (frozen store, unchanged)
//   * apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts (frozen, unchanged)
//   * apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts (frozen resolver)
//   * apps/mobile/features/meal-identification-finalization/v3Contract.ts   (frozen payload)
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
const moduleCache = new Map();
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
function loadTsFile(absolute) {
  const cached = moduleCache.get(absolute);
  if (cached) return cached.exports;
  const source = fs.readFileSync(absolute, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolute
  });
  const module = { exports: {} };
  moduleCache.set(absolute, module);
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved relative import ${specifier} from ${absolute}`);
    return loadTsFile(resolved);
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}
const loadTsModule = (relative) => loadTsFile(path.join(root, relative));

const STORE = "apps/mobile/features/analysis/analysisSessionStore.ts";
const HANDOFF = "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const CAPTURE_SCREEN = "apps/mobile/app/meal-photo.tsx";

const store = loadTsModule(STORE);
const handoff = loadTsModule(HANDOFF);
const resolve = loadTsModule(RESOLVER).resolveRestaurantContextPresentation;
const buildCommand = loadTsModule(V3_CONTRACT).buildMealIdentificationFinalizationV3;

expect(typeof store.beginAnalysisCapture === "function", "S0 the REAL analysis session store loads");
expect(typeof store.setAnalysisRestaurantContext === "function", "S0 setAnalysisRestaurantContext is callable");
expect(typeof handoff.decodeAnalysisRestaurantHandoff === "function", "S0 the REAL handoff decoder loads");
expect(typeof resolve === "function", "S0 the REAL frozen R7-C2a resolver loads");
expect(typeof buildCommand === "function", "S0 the REAL v3 command builder loads");

// ---- the Development scenario under acceptance ---------------------------------------------------
const RESTAURANT = "dev-restaurant-haochu";
const RESTAURANT_NAME = "好廚健康碗 Development";
const B_NANJING = "dev-branch-nanjing";
const B_XINYI = "dev-branch-xinyi";
const ACTOR = Object.freeze({ actorKey: "actor-dev-1", actorGeneration: 1 });

const catalogBranch = (branchId, name, district) => ({
  branchId,
  restaurantId: RESTAURANT,
  name,
  district,
  address: `${district}測試路 1 號`,
  menus: []
});
const CATALOG = {
  id: RESTAURANT,
  restaurantId: RESTAURANT,
  branchId: B_NANJING,
  name: RESTAURANT_NAME,
  location: "松山區",
  branches: [catalogBranch(B_NANJING, "南京復興店", "松山區"), catalogBranch(B_XINYI, "信義安和店", "大安區")]
};
const UNKNOWN = (fs.readFileSync(path.join(root, "lib/i18n/zh-TW.ts"), "utf8").match(/restaurantNameUnknown: "([^"]+)"/) ?? [])[1];
expect(UNKNOWN === "未知", "S0 the 未知 fallback copy is still the i18n authority", UNKNOWN);
const displayTextFor = (presentation) =>
  presentation.restaurantName === null
    ? UNKNOWN
    : presentation.branchName === null
      ? presentation.restaurantName
      : `${presentation.restaurantName} · ${presentation.branchName}`;
const displayForSession = (session) =>
  displayTextFor(
    resolve({
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      catalogStatus: "success",
      findRestaurant: (id) => (id === RESTAURANT ? CATALOG : null)
    })
  );

// The EXACT screen sequence, replayed against the real store. `routeParams` stands in for the route
// this entry was opened with; every other step is production code.
const replayCaptureEntry = (routeParams, { passContextToCapture = true } = {}) => {
  const decoded = handoff.decodeAnalysisRestaurantHandoff(routeParams);
  // 1. reset for this actor (what both entries do first)
  store.resetAnalysisSessionForActor(ACTOR, { releaseOwnedGalleryAsset: () => {} });
  // 2. apply the route selection — meal-photo.tsx applyRouteRestaurantContextForNewCapture
  if (decoded) {
    store.setAnalysisRestaurantContext({ restaurantId: decoded.restaurantId, branchId: decoded.branchId });
  }
  const afterApply = { ...store.getAnalysisSession() };
  // 3. the photo is actually taken — meal-photo.tsx startRealAnalysis
  store.beginAnalysisCapture(
    "camera",
    "file:///dev-meal.jpg",
    new Date("2026-08-07T12:00:00.000Z"),
    null,
    null,
    ACTOR,
    passContextToCapture ? decoded ?? store.EMPTY_ANALYSIS_RESTAURANT_CONTEXT : undefined
  );
  // 4. /analysis reads the session
  return { decoded, afterApply, afterCapture: { ...store.getAnalysisSession() } };
};

// ================== A. THE DECISIVE SEQUENCE: set → capture reset → read ==========================
{
  const { afterApply, afterCapture } = replayCaptureEntry({ restaurantId: RESTAURANT, branchId: B_XINYI });
  expect(
    afterApply.restaurantId === RESTAURANT && afterApply.branchId === B_XINYI,
    "A1 setAnalysisRestaurantContext writes the selection into the session"
  );
  expect(
    afterCapture.restaurantId === RESTAURANT,
    "A2 restaurantId SURVIVES the beginAnalysisCapture reset",
    afterCapture.restaurantId
  );
  expect(
    afterCapture.branchId === B_XINYI,
    "A3 branchId SURVIVES the beginAnalysisCapture reset",
    afterCapture.branchId
  );
  expect(
    displayForSession(afterCapture) === `${RESTAURANT_NAME} · 信義安和店`,
    "A4 /analysis resolves the surviving session to 好廚健康碗 Development · 信義安和店",
    displayForSession(afterCapture)
  );
  expect(displayForSession(afterCapture) !== UNKNOWN, "A5 the physical 未知 regression is gone");
}

// ================== B. The defect itself, proven to be what it was ===============================
{
  const { afterApply, afterCapture } = replayCaptureEntry(
    { restaurantId: RESTAURANT, branchId: B_XINYI },
    { passContextToCapture: false }
  );
  expect(
    afterApply.restaurantId === RESTAURANT && afterApply.branchId === B_XINYI,
    "B1 with the parameter omitted the context is still written correctly first"
  );
  expect(
    afterCapture.restaurantId === null && afterCapture.branchId === null,
    "B2 omitting the 7th parameter destroys it at capture — the exact shipped defect"
  );
  expect(
    displayForSession(afterCapture) === UNKNOWN,
    "B3 which is precisely what rendered 未知 on the device"
  );
}

// ================== C. Gesture and autoOpen entries both preserve ================================
// Both entries run the same reset → apply → capture sequence over the same decoded value, so they
// are replayed identically here; the guard separately proves the screen has ONE capture call site.
{
  for (const entry of ["gesture", "autoOpen"]) {
    const { afterCapture } = replayCaptureEntry({ restaurantId: RESTAURANT, branchId: B_XINYI });
    expect(
      afterCapture.restaurantId === RESTAURANT && afterCapture.branchId === B_XINYI,
      `C ${entry} path preserves the exact restaurant and branch across capture`
    );
  }
}

// ================== D. Generic entry keeps the frozen contract ===================================
{
  const { decoded, afterCapture } = replayCaptureEntry(undefined);
  expect(decoded === null, "D1 a generic camera/gallery entry decodes to no context");
  expect(
    afterCapture.restaurantId === null && afterCapture.branchId === null,
    "D2 a generic entry still yields a null restaurant context"
  );
  expect(displayForSession(afterCapture) === UNKNOWN, "D3 a generic entry still shows the 未知 fallback");
  const branchOnly = replayCaptureEntry({ branchId: B_XINYI });
  expect(
    branchOnly.decoded === null && branchOnly.afterCapture.restaurantId === null && branchOnly.afterCapture.branchId === null,
    "D4 a branch without its restaurant is still refused end-to-end"
  );
}

// ================== E. Second branch stays second; no first-branch fallback ======================
{
  const second = replayCaptureEntry({ restaurantId: RESTAURANT, branchId: B_XINYI }).afterCapture;
  expect(second.branchId === B_XINYI, "E1 the second branch remains the second branch");
  expect(second.branchId !== B_NANJING, "E2 no first-branch substitution occurred in the session");
  expect(
    !displayForSession(second).includes("南京復興店"),
    "E3 no first-branch name reaches the display",
    displayForSession(second)
  );
  const first = replayCaptureEntry({ restaurantId: RESTAURANT, branchId: B_NANJING }).afterCapture;
  expect(first.branchId === B_NANJING, "E4 the first branch is still carried when it is the real pick");
  expect(
    displayForSession(first) !== displayForSession(second),
    "E5 the two branches resolve to two DISTINCT displays"
  );
  const restaurantOnly = replayCaptureEntry({ restaurantId: RESTAURANT }).afterCapture;
  expect(
    restaurantOnly.restaurantId === RESTAURANT && restaurantOnly.branchId === null,
    "E6 a restaurant-only selection never gains a branch"
  );
  expect(
    displayForSession(restaurantOnly) === RESTAURANT_NAME,
    "E7 restaurant-only displays the restaurant alone, with no invented branch",
    displayForSession(restaurantOnly)
  );
  const foreign = replayCaptureEntry({ restaurantId: RESTAURANT, branchId: "dev-branch-not-mine" }).afterCapture;
  expect(
    foreign.branchId === "dev-branch-not-mine",
    "E8 an unresolvable branch id still reaches the session verbatim, never rewritten"
  );
  expect(
    displayForSession(foreign) === RESTAURANT_NAME,
    "E9 and degrades to restaurant-only on screen rather than to a wrong venue",
    displayForSession(foreign)
  );
}

// ================== F. No display name is written anywhere =======================================
{
  const session = replayCaptureEntry({ restaurantId: RESTAURANT, branchId: B_XINYI }).afterCapture;
  const serializedSession = JSON.stringify(session);
  expect(
    !serializedSession.includes(RESTAURANT_NAME) && !serializedSession.includes("信義安和店") && !serializedSession.includes("大安區"),
    "F1 the session carries durable IDs only — no name, branch name or district"
  );
  // The session DOES carry a legacy `restaurantName` string, but it belongs to the mock-only demo
  // correction flow (written solely by useAnalysisCorrectionState) and defaults to empty. What must
  // hold is that the venue handoff never populates it: the seam moves durable IDs and nothing else,
  // so a venue-entered capture leaves the legacy name field exactly as a generic capture would.
  const genericSession = replayCaptureEntry(undefined).afterCapture;
  expect(
    session.restaurantName === "" && session.restaurantName === genericSession.restaurantName,
    "F2 the venue handoff writes no name into the legacy restaurantName field",
    { venueEntered: session.restaurantName, generic: genericSession.restaurantName }
  );
  expect(
    !Object.keys(session).some((key) => /branchName|displayName/i.test(key)),
    "F2a the session has no branch-name or display-name key at all"
  );
  const built = buildCommand({
    analysisRequestId: "3f1d3c22-1111-4a2b-8c3d-44445555aaaa",
    selectedCandidateId: "0f4c9b60-1111-4a2b-8c3d-44445555aaaa",
    captureMethod: "camera",
    sourceContext: "dine_in",
    recordTiming: "current",
    occurredAt: "2026-08-07T12:00:00.000Z",
    restaurantId: session.restaurantId,
    branchId: session.branchId,
    mealWrite: {
      mealName: "舒肥雞胸藜麥碗",
      components: ["雞胸"],
      portion: "1 份",
      nutrition: { calories: 520, proteinGrams: 42, carbsGrams: 48, fatGrams: 16 }
    }
  });
  expect(built.ok, "F3 the durable command builds from the surviving session ids");
  expect(
    built.ok && built.value.restaurantId === RESTAURANT && built.value.branchId === B_XINYI,
    "F4 the command carries the EXACT surviving restaurantId and branchId"
  );
  expect(
    built.ok && !Object.keys(built.value).some((key) => /restaurantName|branchName|displayName/i.test(key)),
    "F5 no display-name key enters the durable write payload"
  );
}

// ================== G. No duplicate finalization side effect =====================================
{
  // Capture mints exactly one new operation identity per photo, so the seam repair cannot make a
  // single capture look like two finalizable meals.
  store.resetAnalysisSessionForActor(ACTOR, { releaseOwnedGalleryAsset: () => {} });
  store.setAnalysisRestaurantContext({ restaurantId: RESTAURANT, branchId: B_XINYI });
  store.beginAnalysisCapture("camera", "file:///a.jpg", new Date(), null, null, ACTOR, {
    restaurantId: RESTAURANT,
    branchId: B_XINYI
  });
  const first = { ...store.getAnalysisSession() };
  store.beginAnalysisCapture("camera", "file:///b.jpg", new Date(), null, null, ACTOR, {
    restaurantId: RESTAURANT,
    branchId: B_XINYI
  });
  const second = { ...store.getAnalysisSession() };
  expect(
    first.analysisRequestId !== second.analysisRequestId,
    "G1 each capture mints its own analysisRequestId — no shared finalization identity"
  );
  expect(
    first.captureGeneration !== second.captureGeneration,
    "G2 each capture advances the capture generation"
  );
  expect(
    second.restaurantId === RESTAURANT && second.branchId === B_XINYI,
    "G3 a re-capture still preserves the restaurant context"
  );
  expect(
    second.mealPhotoCompletion === null && second.analysisCandidates.length === 0,
    "G4 a re-capture starts with no completion and no candidates — no duplicate durable result"
  );
}

// ================== H. Screen wiring: both entries feed the ONE capture call =====================
{
  const screen = fs.readFileSync(path.join(root, CAPTURE_SCREEN), "utf8");
  const screenCode = screen
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("{/*");
    })
    .join("\n");
  expect(
    (screenCode.match(/beginAnalysisCapture\(/g) ?? []).length === 1,
    "H1 the screen has exactly ONE beginAnalysisCapture call site, so both entries share it"
  );
  expect(
    /routeRestaurantHandoff \?\? EMPTY_ANALYSIS_RESTAURANT_CONTEXT/.test(screenCode),
    "H2 that call site passes the decoded handoff, falling back to the frozen empty context"
  );
  expect(
    /function startAiAnalysis\(\)[\s\S]{0,400}?applyRouteRestaurantContextForNewCapture\(\);/.test(screenCode),
    "H3 the gesture entry still resets and applies the route selection"
  );
  expect(
    /autoOpen === "true" && captureSessionReconciled[\s\S]{0,600}?applyRouteRestaurantContextForNewCapture\(\);/.test(screenCode),
    "H4 the autoOpen entry still resets and applies the route selection"
  );
  expect(
    (screenCode.match(/const routeRestaurantHandoff = useMemo\(/g) ?? []).length === 1 &&
      (screenCode.match(/decodeAnalysisRestaurantHandoff\(/g) ?? []).length === 1,
    "H5 both entries and the capture read ONE decoded handoff value — they cannot drift apart"
  );
}

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  smoke: "restaurant-capture-seam-mi-e-c5-r7-c4-r3",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
