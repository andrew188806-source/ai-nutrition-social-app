#!/usr/bin/env node
// MI-E-C5-R7-B1 behavioural smoke. Executes the REAL production modules — the v3 command builder,
// the finalization draft/context transitions, the payload fingerprint and the R7-A session store —
// via on-the-fly TypeScript transpilation. Nothing here re-implements a rule that production owns.
//
// Explicitly NOT covered (deferred to R7-B2, which has a live Development database):
//   * real idempotent replay and the duplicate-write prevention it proves
//   * real CATALOG_IDENTITY_REJECTED for an unknown/inactive restaurant or a foreign branch
//   * real ledger/meal-item row inspection
// The SQL that implements those is asserted statically by the companion guard only.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = process.cwd();
const requireFromRoot = createRequire(path.join(root, "package.json"));
const ts = requireFromRoot("typescript");

const checks = [];
const expect = (pass, name) => checks.push({ name, pass: Boolean(pass) });

// -------- minimal TS module loader (production source, no bundler) ----------------------------
const moduleCache = new Map();
function loadModule(relative) {
  const resolved = path.resolve(root, relative);
  if (moduleCache.has(resolved)) return moduleCache.get(resolved);
  const source = fs.readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.None }
  }).outputText;
  const moduleObject = { exports: {} };
  moduleCache.set(resolved, moduleObject.exports);
  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      const base = path.resolve(path.dirname(resolved), specifier);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (fs.existsSync(candidate)) return loadModule(path.relative(root, candidate));
      }
      // Type-only barrel that resolves to nothing executable at runtime.
      return {};
    }
    // The only external imports on these paths are type-only (@haocu/shared, react-native).
    return {};
  };
  vm.runInThisContext(`(function (require, module, exports, __filename, __dirname) {${transpiled}\n})`, {
    filename: resolved
  })(localRequire, moduleObject, moduleObject.exports, resolved, path.dirname(resolved));
  moduleCache.set(resolved, moduleObject.exports);
  return moduleObject.exports;
}

const v3 = loadModule("apps/mobile/features/meal-identification-finalization/v3Contract.ts");
const draft = loadModule("apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts");
const store = loadModule("apps/mobile/features/analysis/analysisSessionStore.ts");

const RESTAURANT = "restaurant-a";
const BRANCH = "restaurant-a-branch-1";
const OTHER_RESTAURANT = "restaurant-b";
const ANALYSIS_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";

const baseInput = (overrides = {}) => ({
  analysisRequestId: ANALYSIS_REQUEST_ID,
  selectedCandidateId: CANDIDATE_ID,
  captureMethod: "camera",
  sourceContext: "takeout",
  recordTiming: "current",
  occurredAt: "2026-08-02T05:00:00.000Z",
  mealWrite: { mealName: "牛肉麵", components: ["牛肉", "麵"], portion: null, nutrition: { calories: 600 } },
  ...overrides
});

// =============================================================================================
// A. command shape — the two accepted key sets (1-10)
// =============================================================================================
{
  const built = v3.buildMealIdentificationFinalizationV3(baseInput());
  expect(built.ok, "S1 a command with no restaurant context builds successfully");
  const keys = Object.keys(built.value).sort();
  expect(
    JSON.stringify(keys) ===
      JSON.stringify([
        "analysisRequestId", "captureMethod", "mealWrite", "occurredAt",
        "recordTiming", "selectedCandidateId", "sourceContext", "version"
      ]),
    "S2 that command has EXACTLY the original 8 keys"
  );
  expect(!("restaurantId" in built.value), "S3 restaurantId is OMITTED, not present-as-null");
  expect(!("branchId" in built.value), "S4 branchId is OMITTED, not present-as-null");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({ restaurantId: RESTAURANT, branchId: BRANCH })
  );
  expect(built.ok, "S5 a command with a restaurant context builds successfully");
  const keys = Object.keys(built.value).sort();
  expect(
    JSON.stringify(keys) ===
      JSON.stringify([
        "analysisRequestId", "branchId", "captureMethod", "mealWrite", "occurredAt",
        "recordTiming", "restaurantId", "selectedCandidateId", "sourceContext", "version"
      ]),
    "S6 that command has EXACTLY 10 keys — the original 8 plus the pair"
  );
  expect(built.value.restaurantId === RESTAURANT, "S7 the canonical restaurantId is carried verbatim");
  expect(built.value.branchId === BRANCH, "S8 the canonical branchId is carried verbatim");
  expect(built.value.version === "meal-identification-finalization-v3", "S9 the contract version is unchanged");
  expect(Object.isFrozen(built.value), "S10 the command is frozen");
}

// =============================================================================================
// B. pairing, blankness, source-context rules (11-22)
// =============================================================================================
{
  const built = v3.buildMealIdentificationFinalizationV3(baseInput({ restaurantId: RESTAURANT, branchId: null }));
  expect(built.ok, "S11 a restaurant with no branch is accepted");
  expect("branchId" in built.value && built.value.branchId === null, "S12 branchId is present as explicit null (the pair is kept)");
  expect(Object.keys(built.value).length === 10, "S13 the branch-less context still emits the 10-key set");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(baseInput({ branchId: BRANCH }));
  expect(!built.ok, "S14 an orphan branchId (no restaurant) is REJECTED");
  expect(!built.ok && built.error.code === "invalid_finalization", "S15 that rejection is a typed invalid_finalization");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(baseInput({ restaurantId: "   ", branchId: BRANCH }));
  expect(!built.ok, "S16 a whitespace-only restaurantId cannot rescue an orphan branch");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(baseInput({ restaurantId: "  ", branchId: null }));
  expect(built.ok && Object.keys(built.value).length === 8, "S17 a whitespace-only restaurantId with no branch degrades to the 8-key command");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({ restaurantId: `  ${RESTAURANT}  `, branchId: `  ${BRANCH}  ` })
  );
  expect(built.ok && built.value.restaurantId === RESTAURANT && built.value.branchId === BRANCH, "S18 ids are trimmed");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({ sourceContext: "self_cooked", restaurantId: RESTAURANT, branchId: BRANCH })
  );
  expect(!built.ok, "S19 self_cooked + a restaurant context is REJECTED");
}
{
  const built = v3.buildMealIdentificationFinalizationV3(baseInput({ sourceContext: "self_cooked" }));
  expect(built.ok && Object.keys(built.value).length === 8, "S20 self_cooked with no context is still valid (8 keys)");
}
for (const sourceContext of ["dine_in", "takeout", "delivery", "unknown"]) {
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({ sourceContext, restaurantId: RESTAURANT, branchId: BRANCH })
  );
  expect(built.ok && built.value.sourceContext === sourceContext, `S21.${sourceContext} carries a restaurant context`);
}
{
  // Non-uuid, non-hex, punctuated text ids must be accepted — canonical ids are TEXT.
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({ restaurantId: "好初早餐-大安店_2024", branchId: "branch/xyz-99" })
  );
  expect(built.ok && built.value.restaurantId === "好初早餐-大安店_2024", "S22 opaque text ids are accepted (no uuid-v4 restriction)");
}

// =============================================================================================
// C. hostile input — no name/snapshot/unknown key can reach the command (23-26)
// =============================================================================================
{
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({
      restaurantId: RESTAURANT,
      branchId: BRANCH,
      restaurantName: "假餐廳",
      restaurantDisplayName: "假餐廳",
      branchName: "假分店",
      snapshot: { name: "假餐廳" },
      evil: true
    })
  );
  expect(built.ok, "S23 extra caller keys do not break the build");
  expect(Object.keys(built.value).length === 10, "S24 the command still has exactly 10 keys");
  const serialized = JSON.stringify(built.value);
  expect(!serialized.includes("假餐廳") && !serialized.includes("假分店"), "S25 no caller-supplied NAME reaches the command");
  expect(!("evil" in built.value) && !("snapshot" in built.value), "S26 no unknown caller key is propagated");
}

// =============================================================================================
// D. draft context, fingerprint and clientRequestId rotation (27-42)
// =============================================================================================
const candidate = Object.freeze({
  candidateId: CANDIDATE_ID,
  observedName: "牛肉麵",
  components: [{ name: "牛肉", estimatedPortion: "1份" }],
  estimatedNutrition: { calories: 600, proteinGrams: 30, carbsGrams: 70, fatGrams: 20 },
  confidence: 0.9,
  uncertaintyReasonCodes: []
});
const context = (overrides = {}) => ({
  captureMethod: "camera",
  sourceContext: "takeout",
  recordTiming: "current",
  occurredAt: "2026-08-02T05:00:00.000Z",
  selectedMealPeriod: "午餐",
  restaurantId: null,
  branchId: null,
  ...overrides
});
let uuidCounter = 0;
const uuidFactory = () => `uuid-${++uuidCounter}`;

{
  const withVenue = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    candidate,
    context({ restaurantId: RESTAURANT, branchId: BRANCH })
  );
  expect(withVenue.context.restaurantId === RESTAURANT, "S27 the draft context carries restaurantId");
  expect(withVenue.context.branchId === BRANCH, "S28 the draft context carries branchId");

  const fingerprint = draft.getMealPhotoFinalizationPayloadFingerprint(withVenue);
  expect(fingerprint.includes(RESTAURANT), "S29 restaurantId is inside the client payload fingerprint");
  expect(fingerprint.includes(BRANCH), "S30 branchId is inside the client payload fingerprint");

  const withoutVenue = draft.createCandidateMealPhotoFinalizationDraft(ANALYSIS_REQUEST_ID, candidate, context());
  expect(
    draft.getMealPhotoFinalizationPayloadFingerprint(withoutVenue) !== fingerprint,
    "S31 the same meal at a different venue produces a DIFFERENT fingerprint"
  );

  const otherVenue = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    candidate,
    context({ restaurantId: OTHER_RESTAURANT, branchId: BRANCH })
  );
  expect(
    draft.getMealPhotoFinalizationPayloadFingerprint(otherVenue) !== fingerprint,
    "S32 restaurant A and restaurant B never share a fingerprint"
  );
}
{
  // sameContext must SEE the ids: a venue-only change has to produce a new state.
  const base = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    candidate,
    context({ restaurantId: RESTAURANT, branchId: BRANCH })
  );
  const unchanged = draft.updateMealPhotoFinalizationContext(
    base,
    context({ restaurantId: RESTAURANT, branchId: BRANCH }),
    uuidFactory
  );
  expect(unchanged === base, "S33 an identical context is a no-op (referentially unchanged)");

  const changed = draft.updateMealPhotoFinalizationContext(
    base,
    context({ restaurantId: OTHER_RESTAURANT, branchId: BRANCH }),
    uuidFactory
  );
  expect(changed !== base, "S34 a venue-only change IS detected as a payload change");
  expect(changed.context.restaurantId === OTHER_RESTAURANT, "S35 the new venue is applied");

  const branchChanged = draft.updateMealPhotoFinalizationContext(
    base,
    context({ restaurantId: RESTAURANT, branchId: null }),
    uuidFactory
  );
  expect(branchChanged !== base && branchChanged.context.branchId === null, "S36 a branch-only change is detected too");
}
{
  // Rotation: only an ALREADY ATTEMPTED draft rotates, which is the pre-existing rule.
  const prepared = draft.prepareMealPhotoFinalization(
    draft.createCandidateMealPhotoFinalizationDraft(
      ANALYSIS_REQUEST_ID,
      candidate,
      context({ restaurantId: RESTAURANT, branchId: BRANCH })
    ),
    uuidFactory
  );
  expect(prepared.ok, "S37 a draft with a restaurant context prepares successfully");
  expect(prepared.command.restaurantId === RESTAURANT, "S38 the prepared COMMAND carries the restaurant id");
  expect(prepared.command.branchId === BRANCH, "S39 the prepared COMMAND carries the branch id");
  expect(Object.keys(prepared.command).length === 10, "S40 the prepared command is the 10-key shape");
  expect(prepared.draft.finalization === prepared.command, "S41 the frozen submission draft holds that exact command");

  const firstRequestId = prepared.state.clientRequestId;
  expect(typeof firstRequestId === "string" && firstRequestId.length > 0, "S42 a clientRequestId was minted");

  const rotated = draft.updateMealPhotoFinalizationContext(
    prepared.state,
    context({ restaurantId: OTHER_RESTAURANT, branchId: BRANCH }),
    uuidFactory
  );
  expect(rotated.clientRequestId !== firstRequestId, "S43 changing the venue after an attempt ROTATES the clientRequestId");
  expect(rotated.submissionStatus === "idle" && rotated.resultIds === null, "S44 the rotated draft is back to an unsubmitted state");

  const reprepared = draft.prepareMealPhotoFinalization(rotated, uuidFactory);
  expect(reprepared.ok && reprepared.command.restaurantId === OTHER_RESTAURANT, "S45 the new payload carries the new venue");
  expect(
    reprepared.state.clientRequestId !== firstRequestId,
    "S46 restaurant A and restaurant B payloads never share one idempotency token"
  );
  expect(
    draft.getMealPhotoFinalizationPayloadFingerprint(reprepared.state) !==
      draft.getMealPhotoFinalizationPayloadFingerprint(prepared.state),
    "S47 and never share one fingerprint"
  );
}
{
  // The id must never be derivable from the payload: the factory takes no arguments.
  let sawArgument = false;
  const spyFactory = (...args) => {
    if (args.length > 0) sawArgument = true;
    return `uuid-spy-${++uuidCounter}`;
  };
  const prepared = draft.prepareMealPhotoFinalization(
    draft.createCandidateMealPhotoFinalizationDraft(
      ANALYSIS_REQUEST_ID,
      candidate,
      context({ restaurantId: RESTAURANT, branchId: BRANCH })
    ),
    spyFactory
  );
  expect(prepared.ok, "S48 preparation with the spy factory succeeds");
  expect(!sawArgument, "S49 the uuid factory is called with NO arguments — an id can never seed it");
  expect(
    !String(prepared.state.clientRequestId).includes(RESTAURANT) &&
      !String(prepared.state.clientRequestId).includes(BRANCH),
    "S50 no restaurant id is spliced into the clientRequestId"
  );
}
{
  // Payload lock: the same rule that already froze time/source now freezes the venue.
  const prepared = draft.prepareMealPhotoFinalization(
    draft.createCandidateMealPhotoFinalizationDraft(
      ANALYSIS_REQUEST_ID,
      candidate,
      context({ restaurantId: RESTAURANT, branchId: BRANCH })
    ),
    uuidFactory
  );
  for (const status of ["submitting", "uncertain", "succeeded"]) {
    const result = draft.applyMealPhotoFinalizationPayloadMutation(prepared.state, status, () =>
      draft.updateMealPhotoFinalizationContext(prepared.state, context({ restaurantId: OTHER_RESTAURANT }), uuidFactory)
    );
    expect(result === prepared.state, `S51.${status} the venue cannot be changed while ${status}`);
  }
  const editable = draft.applyMealPhotoFinalizationPayloadMutation(prepared.state, "error", () =>
    draft.updateMealPhotoFinalizationContext(prepared.state, context({ restaurantId: OTHER_RESTAURANT }), uuidFactory)
  );
  expect(editable !== prepared.state, "S52 after a definitive failure the venue is editable again");
  expect(editable.clientRequestId !== prepared.state.clientRequestId, "S53 and that edit mints a NEW clientRequestId");
}
{
  // Uncertain retry: the frozen submission is what replays, byte for byte.
  const prepared = draft.prepareMealPhotoFinalization(
    draft.createCandidateMealPhotoFinalizationDraft(
      ANALYSIS_REQUEST_ID,
      candidate,
      context({ restaurantId: RESTAURANT, branchId: BRANCH })
    ),
    uuidFactory
  );
  const frozenFingerprint = draft.getMealPhotoFinalizationPayloadFingerprint(prepared.state);
  const blocked = draft.applyMealPhotoFinalizationPayloadMutation(prepared.state, "uncertain", () =>
    draft.updateMealPhotoFinalizationContext(prepared.state, context({ restaurantId: OTHER_RESTAURANT }), uuidFactory)
  );
  expect(
    draft.getMealPhotoFinalizationPayloadFingerprint(blocked) === frozenFingerprint,
    "S54 an uncertain retry still matches the frozen fingerprint (no drift to re-read)"
  );
  expect(blocked.context.restaurantId === RESTAURANT, "S55 the retry replays the SAME restaurant id");
  expect(blocked.context.branchId === BRANCH, "S56 the retry replays the SAME branch id");
  expect(blocked.clientRequestId === prepared.state.clientRequestId, "S57 the retry replays the SAME clientRequestId");
  const rebuilt = draft.prepareMealPhotoFinalization(blocked, uuidFactory);
  expect(
    rebuilt.ok && JSON.stringify(rebuilt.command) === JSON.stringify(prepared.command),
    "S58 the retried command is byte-identical to the frozen one"
  );
}
{
  // A candidate switch must not disturb the venue.
  const withVenue = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    candidate,
    context({ restaurantId: RESTAURANT, branchId: BRANCH })
  );
  const otherCandidate = { ...candidate, candidateId: "33333333-3333-4333-8333-333333333333", observedName: "排骨飯" };
  const switched = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    otherCandidate,
    withVenue.context
  );
  expect(switched.context.restaurantId === RESTAURANT, "S59 switching candidate keeps the restaurant context");
  expect(switched.selectedCandidateId !== withVenue.selectedCandidateId, "S60 but the candidate really did change");
  const manual = draft.createManualMealPhotoFinalizationDraft(ANALYSIS_REQUEST_ID, withVenue.context);
  expect(manual.context.restaurantId === RESTAURANT, "S61 the manual fallback shares the same restaurant context");
  expect(manual.selectedCandidateId === null, "S62 the manual fallback is still a null-candidate draft");
}

// =============================================================================================
// E. session handoff invariants, executed against the real R7-A store (63-70)
// =============================================================================================
{
  const actor = { actorKey: "actor-a", actorGeneration: 1 };
  store.beginAnalysisCapture("camera", "file:///seed.jpg", new Date(), null, null, actor);
  store.setAnalysisRestaurantContext({ restaurantId: RESTAURANT, branchId: BRANCH }, "takeout");
  expect(store.getAnalysisRestaurantContext().restaurantId === RESTAURANT, "S63 the session holds the chosen venue");

  // A new capture must not inherit it unless the caller re-supplies it.
  store.beginAnalysisCapture("camera", "file:///photo.jpg", new Date(), null, null, actor);
  expect(store.getAnalysisRestaurantContext().restaurantId === null, "S64 a new capture does NOT inherit the previous venue");

  store.setAnalysisRestaurantContext({ restaurantId: RESTAURANT, branchId: BRANCH }, "dine_in");
  store.reconcileAnalysisRestaurantContextForSourceContext("self_cooked");
  expect(store.getAnalysisRestaurantContext().restaurantId === null, "S65 a self_cooked switch clears the venue");
  expect(store.getAnalysisRestaurantContext().branchId === null, "S66 including the branch");
  store.reconcileAnalysisRestaurantContextForSourceContext("dine_in");
  expect(store.getAnalysisRestaurantContext().restaurantId === null, "S67 switching back does NOT resurrect it");

  // A different actor may never see the previous actor's venue.
  store.setAnalysisRestaurantContext({ restaurantId: RESTAURANT, branchId: BRANCH }, "takeout");
  const view = store.deriveAnalysisSessionViewForActor(store.getAnalysisSession(), {
    actorKey: "actor-b",
    actorGeneration: 1
  });
  expect(view.session.restaurantId === null, "S68 a different actor sees a sanitized (null) restaurant context");
  const signedOut = store.deriveAnalysisSessionViewForActor(store.getAnalysisSession(), {
    actorKey: null,
    actorGeneration: 0
  });
  expect(signedOut.session.restaurantId === null, "S69 a signed-out runtime sees no restaurant context");
  expect(
    !store.isAnalysisSessionPristine(store.getAnalysisSession()),
    "S70 a session holding a venue is not pristine, so it cannot be handed to another actor"
  );
}

// =============================================================================================
// F. the durable command still refuses a self_cooked venue after reconciliation (71-72)
// =============================================================================================
{
  const reconciled = store.normalizeAnalysisRestaurantContext({
    restaurantId: RESTAURANT,
    branchId: BRANCH,
    sourceContext: "self_cooked"
  });
  expect(reconciled.restaurantId === null, "S71 the R7-A normalizer clears a self_cooked venue before the payload");
  const built = v3.buildMealIdentificationFinalizationV3(
    baseInput({ sourceContext: "self_cooked", restaurantId: reconciled.restaurantId, branchId: reconciled.branchId })
  );
  expect(built.ok && Object.keys(built.value).length === 8, "S72 so the resulting command is the clean 8-key shape");
}

// =============================================================================================
// G. MI-E-C5-R7-B1-R1 — the SQL Model A canonical-text rule, executed as a JS transliteration of
// the exact predicate the migration applies, driven by the migration's own source text.
//
// This is NOT a claim that the SQL ran: no database was contacted. It proves the DECISION TABLE
// the migration encodes, and check 73 pins that the migration really contains that predicate, so
// the two cannot drift apart silently. Real execution belongs to R7-B2.
// =============================================================================================
{
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260802010000_finalize_meal_identification_v3_restaurant_context.sql"),
    "utf8"
  );
  const hasCanonicalPredicate = (variable) =>
    new RegExp(
      `IF ${variable} IS NULL\\s*\\r?\\n\\s*OR pg_catalog\\.length\\(${variable}\\) = 0` +
        `\\s*\\r?\\n\\s*OR pg_catalog\\.btrim\\(${variable}\\) <> ${variable}`
    ).test(migration);
  expect(
    hasCanonicalPredicate("v3_restaurant_id") && hasCanonicalPredicate("v3_branch_id"),
    "S73 the migration encodes the Model A canonical predicate for BOTH ids"
  );
  expect(
    !/NULLIF\(pg_catalog\.btrim\(p_finalization ->> 'restaurantId'\)/.test(migration) &&
      !/NULLIF\(pg_catalog\.btrim\(p_finalization ->> 'branchId'\)/.test(migration),
    "S74 the silent-trim spelling is gone from the migration"
  );

  // The predicate itself: accepted only when the raw text is already canonical.
  const serverAcceptsId = (raw) => typeof raw === "string" && raw.length > 0 && raw.trim() === raw;
  const CASES = [
    ["restaurant-a", true, "S75 a canonical restaurant id is accepted"],
    ["  restaurant-a", false, "S76 a leading-space restaurant id is REJECTED"],
    ["restaurant-a  ", false, "S77 a trailing-space restaurant id is REJECTED"],
    ["   ", false, "S78 a whitespace-only restaurant id is REJECTED"],
    ["", false, "S79 an empty restaurant id is REJECTED"],
    ["好初早餐-大安店_2024", true, "S80 a non-ascii canonical text id is accepted"]
  ];
  for (const [raw, expected, name] of CASES) expect(serverAcceptsId(raw) === expected, name);
  expect(serverAcceptsId(" branch-1") === false, "S81 a leading-space branch id is REJECTED");
  expect(serverAcceptsId("branch-1 ") === false, "S82 a trailing-space branch id is REJECTED");
  expect(serverAcceptsId("  ") === false, "S83 a whitespace-only branch id is REJECTED");
  expect(serverAcceptsId("branch-1") === true, "S84 a canonical branch id is accepted");

  // Non-string JSON types can never reach the predicate: the typeof gate rejects first.
  expect(
    /IF pg_catalog\.jsonb_typeof\(p_finalization -> 'restaurantId'\) <> 'string' THEN/.test(migration),
    "S85 a non-string restaurantId is rejected by the JSON type gate"
  );
  expect(
    /ELSIF pg_catalog\.jsonb_typeof\(p_finalization -> 'branchId'\) = 'string' THEN/.test(migration) &&
      /IF p_finalization -> 'branchId' = 'null'::jsonb THEN/.test(migration),
    "S86 branchId accepts JSON null or string only, and the two are distinguished"
  );

  // The whole point of Model A: because the raw value is what is stored everywhere, the ledger
  // snapshot and the durable item can no longer disagree, and one venue is exactly one fingerprint.
  const accepted = ["restaurant-a", "  restaurant-a  "].filter(serverAcceptsId);
  expect(accepted.length === 1 && accepted[0] === "restaurant-a", "S87 only ONE text form of a venue can ever be stored");
  expect(
    migration.indexOf("pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id") <
      migration.indexOf("v3_fingerprint := pg_catalog.jsonb_build_object"),
    "S88 that rejection happens before the server fingerprint is built"
  );
}

// =============================================================================================
// H. MI-E-C5-R7-B1-R1 — invocation-time context reconciliation, executed against the production
// pure transition the hook's helper delegates to.
//
// No React renderer is involved, so nothing here proves paint lifecycle. What it does prove is
// the durable behaviour that matters: given a draft built at context A and a live context B, the
// value the handler prepares from is B, with the correct token semantics.
// =============================================================================================
{
  // Mirrors reconcileDraftWithCurrentContext exactly: same production functions, same order.
  const reconcile = (current, liveContext, status, uuid) =>
    draft.applyMealPhotoFinalizationPayloadMutation(current, status, () =>
      draft.updateMealPhotoFinalizationContext(current, liveContext, uuid)
    );

  const atA = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    candidate,
    context({ restaurantId: RESTAURANT, branchId: BRANCH })
  );

  // Scenario B: draft is A, live context is B, the eager effect has not run.
  const liveB = context({ restaurantId: OTHER_RESTAURANT, branchId: BRANCH });
  const reconciledB = reconcile(atA, liveB, "idle", uuidFactory);
  const preparedB = draft.prepareMealPhotoFinalization(reconciledB, uuidFactory);
  expect(preparedB.ok, "S89 the reconciled draft prepares successfully");
  expect(preparedB.command.restaurantId === OTHER_RESTAURANT, "S90 A→B: the payload carries restaurant B, not A");
  expect(
    draft.prepareMealPhotoFinalization(atA, uuidFactory).command.restaurantId === RESTAURANT,
    "S91 and the un-reconciled draft would have submitted A — the defect this repair removes"
  );

  // Scenario C: live context switched to self_cooked with the ids already cleared.
  const liveSelfCooked = context({ sourceContext: "self_cooked", restaurantId: null, branchId: null });
  const reconciledC = reconcile(atA, liveSelfCooked, "idle", uuidFactory);
  const preparedC = draft.prepareMealPhotoFinalization(reconciledC, uuidFactory);
  expect(preparedC.ok, "S92 the self_cooked reconciliation prepares successfully");
  expect(preparedC.command.sourceContext === "self_cooked", "S93 self_cooked: the payload source is self_cooked");
  expect(Object.keys(preparedC.command).length === 8, "S94 self_cooked: the payload is the clean 8-key command");
  expect(!("restaurantId" in preparedC.command), "S95 self_cooked: restaurant A is gone from the payload");

  // Scenario A: no draft yet, so a fresh one is created from the live context.
  const hydrated = draft.createCandidateMealPhotoFinalizationDraft(
    ANALYSIS_REQUEST_ID,
    candidate,
    context({ restaurantId: RESTAURANT, branchId: BRANCH })
  );
  const preparedHydrated = draft.prepareMealPhotoFinalization(hydrated, uuidFactory);
  expect(
    preparedHydrated.ok && preparedHydrated.command.restaurantId === RESTAURANT,
    "S96 initial hydration: a first submission carries the session's restaurant, not an 8-key command"
  );

  // Token semantics through the reconciler.
  const attempted = draft.prepareMealPhotoFinalization(atA, uuidFactory).state;
  const attemptedThenMoved = reconcile(attempted, liveB, "idle", uuidFactory);
  expect(
    attemptedThenMoved.clientRequestId !== attempted.clientRequestId,
    "S97 an ALREADY ATTEMPTED draft rotates its token when the reconciler moves the venue"
  );
  const unattemptedThenMoved = reconcile(atA, liveB, "idle", uuidFactory);
  expect(
    unattemptedThenMoved.clientRequestId === atA.clientRequestId,
    "S98 an unattempted draft does NOT mint an unnecessary token (existing semantics preserved)"
  );

  // Scenario E: the reconciler is lock-gated, so it cannot drift a frozen payload.
  for (const status of ["submitting", "uncertain", "succeeded"]) {
    expect(reconcile(attempted, liveB, status, uuidFactory) === attempted, `S99.${status} the reconciler is a no-op while ${status}`);
  }
  expect(
    reconcile(attempted, liveB, "error", uuidFactory) !== attempted,
    "S100 after a definitive failure the reconciler may move the venue again"
  );
}

const failed = checks.filter((entry) => !entry.pass);
console.log(
  JSON.stringify(
    {
      smoke: "restaurant-durable-contract-mi-e-c5-r7-b",
      status: failed.length ? "failed" : "passed",
      totalChecks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks
    },
    null,
    2
  )
);
if (failed.length) process.exit(1);
