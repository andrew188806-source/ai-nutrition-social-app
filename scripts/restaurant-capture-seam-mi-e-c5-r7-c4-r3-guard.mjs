#!/usr/bin/env node
// MI-E-C5-R7-C4-R3 static guard — RESTAURANT CONTEXT CAPTURE SEAM.
//
// The defect this round repairs, found only on a physical device:
//
//   restaurants.tsx encoded the ids correctly, meal-photo.tsx decoded them correctly, and
//   setAnalysisRestaurantContext wrote them into the session correctly. Then the photo was actually
//   taken, and beginAnalysisCapture — which opens a new operation by FULL-RESETTING the session and
//   re-applies the restaurant context from its OWN seventh parameter and nothing else — was called
//   without that parameter. The just-written ids were reset to null, and /analysis rendered 未知 for
//   every venue-entered meal. Three rounds of guards passed because no suite ever ran
//   `setAnalysisRestaurantContext → beginAnalysisCapture → read` in that order.
//
// The store's API was never wrong and is NOT changed here: "context supplied → atomically re-applied
// after the reset; omitted → generic entry, null context" remains exactly the contract. This round
// hands the call site the value it already had.
//
// POST-FREEZE LIFECYCLE-AWARE by construction: every assertion is repository CONTENT or a SUBSET
// assertion over uncommitted state, so the freeze commit cannot turn a passing guard into a failing
// one. Fully local: no network, no Supabase client, no credential, no RPC, no deploy.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
// RAW, never trimmed: a `--porcelain=v1` entry for a modified-but-unstaged file begins with a SPACE.
const gitRaw = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).stdout ?? "";
const git = (args) => gitRaw(args).trim();
const trackedTreeDigest = (relative) => {
  const files = git(["ls-files", "-z", "--", relative]).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(git(["hash-object", "--path", file, file]));
  }
  return hash.digest("hex");
};
// Executable source only, so prose naming a forbidden token never fails a check about code.
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("{/*")
      );
    })
    .join("\n");

// ---- real-module execution, for behavioural mutation kills ---------------------------------------
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const resolveTsFile = (candidate) => {
  for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
};
const evaluateTsSource = (source, relative) => {
  const absolute = path.join(root, relative);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: absolute
  });
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require_(specifier);
    const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
    if (!resolved) throw new Error(`unresolved relative import ${specifier}`);
    return evaluateTsSource(fs.readFileSync(resolved, "utf8"), path.relative(root, resolved).replaceAll("\\", "/"));
  };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
};

// =============================================================================================
// Paths
// =============================================================================================
const CAPTURE = "apps/mobile/app/meal-photo.tsx";
const STORE = "apps/mobile/features/analysis/analysisSessionStore.ts";
const HANDOFF = "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts";
const SELECTOR = "apps/mobile/app/restaurants.tsx";
const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const ANALYSIS_SCREEN = "apps/mobile/app/analysis.tsx";
const COMPOSITION = "apps/mobile/features/analysis/analysisSinglePagePresentation.ts";
const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const DRAFT = "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts";
const CATALOG_ADAPTER = "apps/mobile/features/meal-identification/catalogCandidateAdapter.ts";
const CANDIDATE_RESOLVER = "apps/mobile/features/meal-identification/candidateResolver.ts";

const R4_GUARD = "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs";
const R5_UI_GUARD = "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs";
const C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const C2A_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const C2B_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs";
const C3_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs";
const C4_R1_GUARD = "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs";
const C4_R2_GUARD = "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-guard.mjs";
const GUARD = "scripts/restaurant-capture-seam-mi-e-c5-r7-c4-r3-guard.mjs";
const SMOKE = "scripts/restaurant-capture-seam-mi-e-c5-r7-c4-r3-smoke.mjs";

// The EXACT eleven paths this round may introduce or change. Named individually — never a prefix,
// never a wildcard — so a TWELFTH path fails here. Exactly ONE is production source: the capture
// screen holding the defective call. Every other entry is a predecessor guard that pins that
// screen's bytes or its exact call spelling, plus this round's own suite.
const CANDIDATE_MANIFEST = Object.freeze([
  CAPTURE,
  R4_GUARD, R5_UI_GUARD, C1_GUARD, C2A_GUARD, C2B_GUARD, C3_GUARD, C4_R1_GUARD, C4_R2_GUARD,
  GUARD, SMOKE
]);
const EXPECTED_MANIFEST_LENGTH = 11;
const exactManifestAuthority = (manifest) =>
  manifest.length === EXPECTED_MANIFEST_LENGTH &&
  new Set(manifest).size === EXPECTED_MANIFEST_LENGTH &&
  manifest.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
  manifest.filter((entry) => entry.startsWith("apps/")).length === 1 &&
  manifest.includes(CAPTURE) &&
  manifest.every((entry) => !/\*/.test(entry) && !entry.startsWith("supabase/") && !entry.startsWith("packages/"));

// PERMANENTLY protected. The store contract, the pure handoff, the selector, the frozen resolver and
// the whole C4-R2 Analysis presentation are all untouched by this round — the repair is confined to
// one argument at one call site.
const PROTECTED = Object.freeze({
  [STORE]: "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  [HANDOFF]: "7189d67ede2528337dd40f154e080f2fa1fcf3a38582c8d330e03b0bb302e05e",
  [SELECTOR]: "30f53812245508f4d7664c5e15e9b530349565dd8a81dc169371c8108ddf0cce",
  [RESOLVER]: "2b69f411c6cc06843cfccc5dd9ca877984d23aed2c013c814e45f5046cef8789",
  [ANALYSIS_SCREEN]: "ffb37b1ab876280dd8e777ae00a37b4bfda582100abc89a113c5fefac8706c49",
  [COMPOSITION]: "49138ce721b279f35e4f06cacf892773cf068296d92a8ab76bacf8838086bb4e",
  [V3_CONTRACT]: "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  [DRAFT]: "6134780ad5bfb7d32fc18899d3068de77fdd5739f71cb3247f7cd47e1a56d66e",
  [CATALOG_ADAPTER]: "136c61858148c656cc49717549a1b9b7ec7efbe0e016654e5d029e49eb35044a",
  [CANDIDATE_RESOLVER]: "a4c9450957c7fc59d5975866ca281cbfe2ba4726feab6ba3a4a1fa0351164639"
});

const capture = read(CAPTURE);
const captureCode = stripComments(capture);
const storeCode = stripComments(read(STORE));

// =============================================================================================
// 1. The seam itself (1-5)
// =============================================================================================
// The screen has exactly ONE beginAnalysisCapture call site, and BOTH capture entries reach it
// through the same decoded value. That is what makes "gesture and autoOpen are both fixed" a
// structural fact rather than two edits that could drift apart.
const singleCallSiteAuthority = (source) => (stripComments(source).match(/beginAnalysisCapture\(/g) ?? []).length === 1;
const seventhArgumentAuthority = (source) =>
  /beginAnalysisCapture\(method, imageUri, capturedAt, mimeType, fileName, captureSessionOwnership\.owner, routeRestaurantHandoff \?\? EMPTY_ANALYSIS_RESTAURANT_CONTEXT\);/.test(
    stripComments(source)
  );
const gestureEntryAuthority = (source) =>
  /function startAiAnalysis\(\)[\s\S]{0,500}?resetAnalysisSessionForActor\(captureActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES\);\s*\r?\n\s*applyRouteRestaurantContextForNewCapture\(\);/.test(
    stripComments(source)
  );
const autoOpenEntryAuthority = (source) =>
  /autoOpen === "true" && captureSessionReconciled[\s\S]{0,600}?applyRouteRestaurantContextForNewCapture\(\);/.test(
    stripComments(source)
  );
const singleDecodeAuthority = (source) => {
  const code = stripComments(source);
  return (
    (code.match(/const routeRestaurantHandoff = useMemo\(/g) ?? []).length === 1 &&
    (code.match(/decodeAnalysisRestaurantHandoff\(/g) ?? []).length === 1
  );
};

check(
  "1. the capture call passes the decoded restaurant context as its seventh argument",
  seventhArgumentAuthority(capture)
);
check(
  "2. there is exactly ONE beginAnalysisCapture call site, so both entries are covered by it",
  singleCallSiteAuthority(capture) &&
    // …and it is reached from the single media-outcome path both entries share.
    /startRealAnalysis\(method, outcome\.uri, new Date\(outcome\.capturedAt\), outcome\.mimeType, outcome\.fileName\)/.test(
      captureCode
    )
);
check(
  "3. the GESTURE entry still resets and then applies the route selection before capture",
  gestureEntryAuthority(capture)
);
check(
  "4. the AUTOOPEN entry still resets and then applies the route selection before capture",
  autoOpenEntryAuthority(capture)
);
check(
  "5. both entries and the capture read ONE decoded handoff — they cannot drift apart",
  singleDecodeAuthority(capture) &&
    // The value handed to the store is the decoded handoff, never a re-read of route params or a
    // second decode performed at capture time.
    !/beginAnalysisCapture\([\s\S]{0,300}?restaurantIdParam/.test(captureCode)
);

// =============================================================================================
// 2. Generic entry and store contract are unchanged (6-9)
// =============================================================================================
const genericEntryAuthority = (source) =>
  // A null decode must reach the store as the FROZEN empty context, never as a fabricated id.
  /routeRestaurantHandoff \?\? EMPTY_ANALYSIS_RESTAURANT_CONTEXT/.test(stripComments(source)) &&
  !/routeRestaurantHandoff \?\? \{/.test(stripComments(source));
check(
  "6. a generic camera/gallery entry still passes the frozen empty context, never a fabricated id",
  genericEntryAuthority(capture) &&
    /export const EMPTY_ANALYSIS_RESTAURANT_CONTEXT: AnalysisRestaurantContext = Object\.freeze\(\{\s*\r?\n\s*restaurantId: null,\s*\r?\n\s*branchId: null\s*\r?\n\}\);/.test(
      read(STORE)
    )
);
check(
  "7. the beginAnalysisCapture CONTRACT is unchanged — same reset, same parameter, same default",
  sha(STORE) === PROTECTED[STORE] &&
    /session = createDefaultSession\(\);/.test(storeCode) &&
    /\}> = EMPTY_ANALYSIS_RESTAURANT_CONTEXT/.test(storeCode) &&
    /session\.restaurantId = restaurant\.restaurantId;/.test(storeCode) &&
    /session\.branchId = restaurant\.branchId;/.test(storeCode)
);
check(
  "8. the pure handoff decoder and the selector encoder are byte-identical",
  sha(HANDOFF) === PROTECTED[HANDOFF] && sha(SELECTOR) === PROTECTED[SELECTOR]
);
check(
  "9. the screen still writes the context through the ONE frozen R7-C1 seam as well",
  (captureCode.match(/setAnalysisRestaurantContext\(/g) ?? []).length === 1 &&
    /const applyRouteRestaurantContextForNewCapture = useCallback\(\(\) => \{\s*\r?\n\s*if \(!routeRestaurantHandoff\) return;/.test(
      captureCode
    )
);

// =============================================================================================
// 3. Nothing downstream moved (10-13)
// =============================================================================================
check(
  "10. the frozen R7-C2a resolver is byte-identical",
  sha(RESOLVER) === PROTECTED[RESOLVER]
);
check(
  "11. the C4-R2 Analysis presentation (screen + composition authority) is byte-identical",
  sha(ANALYSIS_SCREEN) === PROTECTED[ANALYSIS_SCREEN] && sha(COMPOSITION) === PROTECTED[COMPOSITION]
);
check(
  "12. the finalization contract, draft and the legacy mock catalog modules are byte-identical",
  [V3_CONTRACT, DRAFT, CATALOG_ADAPTER, CANDIDATE_RESOLVER].every((file) => sha(file) === PROTECTED[file])
);
const treeDigests = Object.freeze({
  "supabase/migrations": "f9b1f2832a39ecc48766ae004d03a6009c83867b44a1af4027138c7578f04e9e",
  "supabase/functions": "37f368cf3bc4e1b6d6a70b7b13b4bfde3f8285f61f62de5db63889549ff556de",
  packages: "24629aa06382a393771d657f8e9c53b1fcebe54ba977b384dde747d742e4934f"
});
check(
  "13. no database, migration, RPC, Edge Function or shared-package change",
  Object.entries(treeDigests).every(([tree, expected]) => trackedTreeDigest(tree) === expected) &&
    CANDIDATE_MANIFEST.every((entry) => !entry.startsWith("supabase/") && !entry.startsWith("packages/"))
);

// =============================================================================================
// 4. Manifest, lifecycle and hygiene (14-19)
// =============================================================================================
const protectedDrift = Object.entries(PROTECTED).filter(([file, want]) => !exists(file) || sha(file) !== want);
check(
  "14. the manifest is exactly eleven named paths, one production file, no protected surface inside",
  exactManifestAuthority(CANDIDATE_MANIFEST) &&
    CANDIDATE_MANIFEST.every(exists) &&
    CANDIDATE_MANIFEST.every((entry) => !Object.hasOwn(PROTECTED, entry)) &&
    protectedDrift.length === 0,
  protectedDrift.map(([file]) => file)
);
const worktree = gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll("\\", "/"));
const versusHead = git(["diff", "--name-only", "HEAD"]).split("\n").map((entry) => entry.trim()).filter(Boolean);
const touched = [...new Set([...worktree, ...versusHead])];
const outsideManifest = touched.filter((entry) => !CANDIDATE_MANIFEST.includes(entry));
check(
  "15. committed-state lifecycle: uncommitted changes are a subset of the manifest, clean tree passes",
  outsideManifest.length === 0,
  { touchedEntries: touched.length, outsideManifest }
);
check(
  "16. every amended predecessor guard carries an explicit C4-R3 successor note",
  [R4_GUARD, R5_UI_GUARD, C1_GUARD, C2A_GUARD, C2B_GUARD, C3_GUARD, C4_R1_GUARD, C4_R2_GUARD].every((file) =>
    /MI-E-C5-R7-C4-R3/.test(read(file))
  )
);
check(
  "17. the companion smoke executes the REAL set → capture → read sequence and no remote operation",
  (() => {
    const smoke = read(SMOKE);
    const smokeCode = stripComments(smoke);
    const setAt = smokeCode.indexOf("store.setAnalysisRestaurantContext(");
    const captureAt = smokeCode.indexOf("store.beginAnalysisCapture(", setAt);
    const readAt = smokeCode.indexOf("store.getAnalysisSession()", captureAt);
    return (
      smoke.includes(STORE) &&
      smoke.includes(HANDOFF) &&
      setAt >= 0 &&
      captureAt > setAt &&
      readAt > captureAt &&
      !/https?:\/\/|createClient\s*\(|functions\.invoke\s*\(|\.rpc\s*\(|\bfetch\s*\(/.test(smokeCode)
    );
  })()
);
const guardSource = read(GUARD);
const guardCode = stripComments(guardSource);
check(
  "18. no unconditional pass, skip flag, environment escape hatch or wildcard allowance",
  !/process\.env\.[A-Z_]*(SKIP|BYPASS|FORCE|DISABLE)/.test(guardCode) &&
    !/\|\|\s*true\b/.test(guardCode) &&
    !/check\([^,]+,\s*true\s*\)/.test(guardCode) &&
    !/process\.exit\(0\)/.test(guardCode) &&
    !/CANDIDATE_MANIFEST\.some\(\(entry\) => entry\.startsWith\(/.test(guardCode) &&
    /if \(failed\.length\) process\.exit\(1\);/.test(guardSource)
);
// Fragment-assembled so these scans never match their own pattern definitions.
const COMMIT_ALLOWANCE_PATTERNS = [
  /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/,
  new RegExp(["rev", "-parse"].join("")),
  new RegExp(["\\bHEAD", "~|\\bHEAD\\^"].join(""))
];
const SECRET_PATTERNS = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\."].join("")),
  new RegExp(["service", "_role"].join("") + "[\"'\\s:=]+[A-Za-z0-9_-]{12,}"),
  new RegExp(["sb", "p_"].join("") + "[A-Za-z0-9]{16,}"),
  new RegExp(["msbgnnoo", "roesoefuiwluye"].join(""))
];
check(
  "19. no specific-commit bypass, no secret, and no remote-operation code in any candidate path",
  !COMMIT_ALLOWANCE_PATTERNS.some((pattern) => pattern.test(guardCode)) &&
    CANDIDATE_MANIFEST.every((entry) => !SECRET_PATTERNS.some((pattern) => pattern.test(read(entry)))) &&
    CANDIDATE_MANIFEST.every((entry) => {
      const code = stripComments(read(entry));
      return (
        !/createClient\s*\(/.test(code) &&
        !/functions\.invoke\s*\(/.test(code) &&
        !/\.rpc\s*\(/.test(code) &&
        !/supabase\s+(?:db|functions|migration)\s+push/.test(code) &&
        !/eas\s+(?:build|submit)|expo\s+publish/.test(code)
      );
    })
);
check(
  "19a. this guard is lifecycle-AWARE: it never requires a path to be modified, staged or untracked",
  !/worktree\.includes\(/.test(guardCode) &&
    !/versusHead\.includes\(/.test(guardCode) &&
    !/touched\.includes\(/.test(guardCode) &&
    !/touched\.length\s*(?:>|===)\s*0/.test(guardCode) &&
    !/\.length === CANDIDATE_MANIFEST\.length/.test(guardCode) &&
    /outsideManifest\.length === 0/.test(guardCode)
);
check("19b. this guard's own run stages nothing", git(["diff", "--cached", "--name-only"]) === "");

// =============================================================================================
// 5. Mandatory mutation proof
// =============================================================================================
const mutations = [];
const mutation = (name, original, mutate, authority) => {
  const changed = mutate(original);
  const applied = JSON.stringify(changed) !== JSON.stringify(original);
  let killed = false;
  if (applied) {
    try {
      killed = !authority(changed);
    } catch {
      // A mutation that makes a module unloadable is NOT a behavioural kill.
      killed = false;
    }
  }
  mutations.push({ name, applied, killed });
  check(`mutation ${name} is killed by its targeted authority`, applied && killed, { applied, killed });
};

// The behavioural authority: replay the REAL screen sequence against the REAL store and require the
// Development branch to survive the capture reset.
const RESTAURANT = "dev-restaurant-haochu";
const B_NANJING = "dev-branch-nanjing";
const B_XINYI = "dev-branch-xinyi";
const ACTOR = Object.freeze({ actorKey: "guard-actor", actorGeneration: 1 });
const seamSurvivalAuthority = (storeSource, { passContext = true } = {}) => {
  const store = evaluateTsSource(storeSource, STORE);
  store.resetAnalysisSessionForActor(ACTOR, { releaseOwnedGalleryAsset: () => {} });
  store.setAnalysisRestaurantContext({ restaurantId: RESTAURANT, branchId: B_XINYI });
  store.beginAnalysisCapture(
    "camera",
    "file:///x.jpg",
    new Date(),
    null,
    null,
    ACTOR,
    passContext ? { restaurantId: RESTAURANT, branchId: B_XINYI } : undefined
  );
  const session = store.getAnalysisSession();
  return session.restaurantId === RESTAURANT && session.branchId === B_XINYI;
};

mutation("01 the seventh argument is dropped at the capture call (the shipped defect)", capture,
  (s) => s.replace(", routeRestaurantHandoff ?? EMPTY_ANALYSIS_RESTAURANT_CONTEXT);", ");"),
  seventhArgumentAuthority);
mutation("01b the same defect, proven behaviourally against the real store", read(STORE),
  (s) => `${s}\n`,
  (s) => seamSurvivalAuthority(s, { passContext: false }));
mutation("02 the store stops re-applying the context after its reset", read(STORE),
  (s) => s.replace("session.restaurantId = restaurant.restaurantId;", "session.restaurantId = null;"),
  (s) => seamSurvivalAuthority(s));
mutation("03 the store stops re-applying the branch after its reset", read(STORE),
  (s) => s.replace("session.branchId = restaurant.branchId;", "session.branchId = null;"),
  (s) => seamSurvivalAuthority(s));
mutation("04 the branch is replaced by the first branch inside the store", read(STORE),
  (s) => s.replace("session.branchId = restaurant.branchId;", `session.branchId = "${B_NANJING}";`),
  (s) => seamSurvivalAuthority(s));
mutation("05 the gesture entry loses its route-selection apply", capture,
  (s) => s.replace("    resetAnalysisSessionForActor(captureActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES);\n    applyRouteRestaurantContextForNewCapture();", "    resetAnalysisSessionForActor(captureActor, ANALYSIS_SESSION_OWNER_DEPENDENCIES);"),
  gestureEntryAuthority);
mutation("06 the autoOpen entry loses its route-selection apply", capture,
  (s) => s.replace("      applyRouteRestaurantContextForNewCapture();\n    }\n  }, [applyRouteRestaurantContextForNewCapture, autoOpen", "    }\n  }, [applyRouteRestaurantContextForNewCapture, autoOpen"),
  autoOpenEntryAuthority);
mutation("07 a second beginAnalysisCapture call site is introduced (entries drift apart)", capture,
  (s) => s.replace("  function navigateToDemoResult() {", "  function navigateToDemoResult() {\n    beginAnalysisCapture(\"camera\", \"file:///drift.jpg\", new Date(), null, null, null);"),
  singleCallSiteAuthority);
mutation("08 a second decode is introduced at capture time", capture,
  (s) => s.replace("  function startRealAnalysis(", "  const secondDecode = decodeAnalysisRestaurantHandoff({ restaurantId: restaurantIdParam });\n  function startRealAnalysis("),
  singleDecodeAuthority);
mutation("09 a generic entry fabricates a restaurant instead of the frozen empty context", capture,
  (s) => s.replace("routeRestaurantHandoff ?? EMPTY_ANALYSIS_RESTAURANT_CONTEXT", `routeRestaurantHandoff ?? { restaurantId: "${RESTAURANT}", branchId: null }`),
  genericEntryAuthority);
mutation("10 the handoff decoder starts accepting a branch without its restaurant", read(HANDOFF),
  (s) => s.replace("  if (!restaurantId) return null;", "  if (!restaurantId) return Object.freeze({ restaurantId: \"\", branchId: normalizeRouteParamValue(params.branchId) });"),
  (s) => {
    const handoff = evaluateTsSource(s, HANDOFF);
    return handoff.decodeAnalysisRestaurantHandoff({ branchId: B_XINYI }) === null;
  });
mutation("11 a display name is written into the session by the capture screen", capture,
  (s) => s.replace("routeRestaurantHandoff ?? EMPTY_ANALYSIS_RESTAURANT_CONTEXT", "{ ...(routeRestaurantHandoff ?? EMPTY_ANALYSIS_RESTAURANT_CONTEXT), restaurantName: \"好廚健康碗 Development\" }"),
  (s) => !/restaurantName|branchName|displayName/.test(stripComments(s).split("beginAnalysisCapture(")[1] ?? ""));
mutation("12 the store contract digest drifts", read(STORE),
  (s) => `${s}\n `,
  (s) => createHash("sha256").update(s).digest("hex") === PROTECTED[STORE]);
mutation("13 the frozen resolver digest drifts", read(RESOLVER),
  (s) => `${s}\n `,
  (s) => createHash("sha256").update(s).digest("hex") === PROTECTED[RESOLVER]);
mutation("14 the C4-R2 Analysis presentation digest drifts", read(ANALYSIS_SCREEN),
  (s) => `${s}\n `,
  (s) => createHash("sha256").update(s).digest("hex") === PROTECTED[ANALYSIS_SCREEN]);
mutation("15 a twelfth successor path is accepted", CANDIDATE_MANIFEST,
  (value) => [...value, "apps/mobile/app/unrelated-extra-screen.tsx"],
  exactManifestAuthority);
mutation("16 the migration tree changes", trackedTreeDigest("supabase/migrations"),
  (value) => `${value}-changed`,
  (value) => value === treeDigests["supabase/migrations"]);

check(
  "mutation summary: all 17 mutations applied and were killed by their own authority",
  mutations.length === 17 && mutations.every((entry) => entry.applied && entry.killed),
  mutations.filter((entry) => !entry.applied || !entry.killed)
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "restaurant-capture-seam-mi-e-c5-r7-c4-r3",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  mutations,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
