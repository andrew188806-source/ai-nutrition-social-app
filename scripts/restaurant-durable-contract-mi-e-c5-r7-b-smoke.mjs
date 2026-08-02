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

// =============================================================================================
// I. MI-E-C5-R7-B1-R2 — three-way durable projection of the venue.
//
// The corrective successor writes the SAME two validated local variables into the meal item, into
// the finalization ledger's own columns, and (as the verbatim command) into command_snapshot. This
// section proves that from the migration's own text: it locates each of the three sinks and asserts
// they all read v3_restaurant_id / v3_branch_id, never a re-read of p_finalization.
//
// Again: no SQL was executed and no database was contacted. This is a structural proof of the
// projection, paired with a behavioural proof of what the command that feeds it contains.
// =============================================================================================
{
  const ledger = fs.readFileSync(
    path.join(root, "supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql"),
    "utf8"
  );
  const between = (from, to) => {
    const a = ledger.indexOf(from);
    if (a < 0) return "";
    const b = to ? ledger.indexOf(to, a) : ledger.length;
    return b > a ? ledger.slice(a, b) : "";
  };
  const itemBlock = between("v3_items := pg_catalog.jsonb_build_array(", "v3_created := public.create_current_user_meal_record(");
  const ledgerBlock = between("INSERT INTO public.meal_identification_finalizations (", "RETURNING id INTO v3_finalization_id;");

  expect(itemBlock.length > 0 && ledgerBlock.length > 0, "S101 both durable write blocks are locatable in the corrective successor");
  expect(
    /'restaurantId', v3_restaurant_id,/.test(itemBlock) && /'branchId', v3_branch_id,/.test(itemBlock),
    "S102 the MEAL ITEM projects both ids from the validated locals"
  );
  expect(
    /identity_validation_status, restaurant_id, branch_id, command_snapshot,/.test(ledgerBlock),
    "S103 the LEDGER names its own restaurant_id/branch_id columns"
  );
  expect(
    /'not_applicable', v3_restaurant_id, v3_branch_id, p_finalization,/.test(ledgerBlock),
    "S104 the LEDGER projects both ids from the SAME validated locals"
  );
  expect(
    /p_finalization,/.test(ledgerBlock) && !/jsonb_build_object/.test(ledgerBlock),
    "S105 command_snapshot is still the verbatim canonical command, not a rebuilt object"
  );
  expect(
    !/p_finalization ->> 'restaurantId'/.test(ledgerBlock) &&
      !/p_finalization ->> 'branchId'/.test(ledgerBlock) &&
      !/btrim\(/.test(ledgerBlock) &&
      !/FROM public\.meal_record_items/.test(ledgerBlock),
    "S106 the ledger never re-reads the json, re-trims, or reads the item back"
  );
  expect(
    /v3_restaurant_id := NULL;\s*\r?\n\s*v3_branch_id := NULL;/.test(ledger),
    "S107 a no-context command leaves both locals NULL, so all three sinks agree on absent"
  );
  // The ledger INSERT sits after the record/item write and before the return — i.e. only on the
  // new-success path, never on replay (which returns earlier) and never on conflict (which raises).
  expect(
    ledger.indexOf("v3_created := public.create_current_user_meal_record(") <
      ledger.indexOf("INSERT INTO public.meal_identification_finalizations (") &&
      ledger.indexOf("'replayed', true,") < ledger.indexOf("v3_created := public.create_current_user_meal_record(") &&
      ledger.indexOf("RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT'") <
        ledger.indexOf("INSERT INTO public.meal_identification_finalizations ("),
    "S108 the ledger insert happens only on the NEW-success path — after replay returns, after conflict raises"
  );
  expect(
    /pg_catalog\.btrim\(v3_restaurant_id\) <> v3_restaurant_id/.test(ledger) &&
      ledger.indexOf("pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id") <
        ledger.indexOf("v3_fingerprint := pg_catalog.jsonb_build_object"),
    "S109 Model A canonical rejection is unchanged and still precedes the fingerprint"
  );

  // What the three sinks receive is exactly what the client command carries — proven behaviourally.
  const only = v3.buildMealIdentificationFinalizationV3(baseInput({ restaurantId: RESTAURANT, branchId: null }));
  expect(
    only.ok && only.value.restaurantId === RESTAURANT && only.value.branchId === null,
    "S110 restaurant-only: the command carries the venue and an explicit null branch"
  );
  const both = v3.buildMealIdentificationFinalizationV3(baseInput({ restaurantId: RESTAURANT, branchId: BRANCH }));
  expect(
    both.ok && both.value.restaurantId === RESTAURANT && both.value.branchId === BRANCH,
    "S111 restaurant+branch: the command carries both, identically to what the locals will hold"
  );
  const none = v3.buildMealIdentificationFinalizationV3(baseInput());
  expect(
    none.ok && !("restaurantId" in none.value) && !("branchId" in none.value),
    "S112 no-context: the command omits both keys, matching the NULL locals and NULL columns"
  );
}

// =============================================================================================
// J. MI-E-C5-R7-B2-R1 — the selection constraint's decision table.
//
// The predicate below is COMPILED FROM the corrective migration's own CHECK text, not written by
// hand here: each arm is extracted, translated to JavaScript by mechanical token substitution, and
// evaluated against candidate rows. If the migration's arm text changes, this evaluator changes
// with it, so the two cannot drift apart.
//
// Still a static proof: no SQL was executed and no database was contacted. It shows which rows the
// deployed constraint would admit, which is exactly what Development acceptance blocked on.
// =============================================================================================
{
  const constraintSql = fs.readFileSync(
    path.join(root, "supabase/migrations/20260804010000_relax_ai_candidate_restaurant_identity_constraint.sql"),
    "utf8"
  );

  // ---- extract the three arms from the real CHECK body ----
  const at = constraintSql.indexOf("ADD CONSTRAINT meal_identification_finalizations_selection_check");
  const open = constraintSql.indexOf("(", constraintSql.indexOf("CHECK (", at));
  let depth = 0;
  let end = -1;
  for (let i = open; i < constraintSql.length; i++) {
    if (constraintSql[i] === "(") depth++;
    else if (constraintSql[i] === ")" && --depth === 0) { end = i; break; }
  }
  const body = constraintSql.slice(open + 1, end);
  const arms = [];
  let d = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") { d++; if (d === 1) { cur = ""; continue; } }
    if (ch === ")") { d--; if (d === 0) { arms.push(cur); continue; } }
    if (d >= 1) cur += ch;
  }
  expect(arms.length === 3, "S113 exactly three selection arms were extracted from the migration");

  // ---- mechanically translate SQL arm text to a JS predicate ----
  const COLUMNS = [
    "selection_kind", "unresolved_reason", "identity_validation_status", "restaurant_id",
    "branch_id", "menu_id", "menu_category_id", "menu_item_id", "branch_menu_item_id", "confirmation_mode"
  ];
  // ------------------------------------------------------------------------------------------
  // MI-E-C5-R7-B2-R1-R1: SQL THREE-VALUED LOGIC.
  //
  // The previous version of this evaluator compiled the arms into ordinary JavaScript booleans
  // and decided acceptance with `.some(...)`. That silently collapsed SQL's UNKNOWN into false
  // and made this smoke assert two things the database does not do — see S125/S137 below.
  //
  // PostgreSQL: a CHECK constraint is VIOLATED only when the expression evaluates to FALSE.
  // TRUE and UNKNOWN both satisfy it. Comparisons and IN against NULL yield UNKNOWN; IS NULL /
  // IS NOT NULL never do.
  // ------------------------------------------------------------------------------------------
  const TRUE = "TRUE";
  const FALSE = "FALSE";
  const UNKNOWN = "UNKNOWN";
  const sqlAnd = (a, b) => (a === FALSE || b === FALSE ? FALSE : a === UNKNOWN || b === UNKNOWN ? UNKNOWN : TRUE);
  const sqlOr = (a, b) => (a === TRUE || b === TRUE ? TRUE : a === UNKNOWN || b === UNKNOWN ? UNKNOWN : FALSE);
  // The single CHECK-verdict authority. No hand-rolled special cases anywhere else.
  const sqlCheckPasses = (result) => result !== FALSE;

  const isNullish = (v) => v === null || v === undefined;

  // Compile ONE predicate token from the migration's own text into a 3VL evaluator.
  function compilePredicate(text) {
    const p = text.trim();
    let m;
    if ((m = p.match(/^\((.+)\)$/))) {
      // A parenthesised disjunction, e.g. the pair rule (branch_id IS NULL OR restaurant_id IS NOT NULL).
      const parts = m[1].split(/\s+OR\s+/).map(compilePredicate);
      return (r) => parts.map((f) => f(r)).reduce(sqlOr, FALSE);
    }
    if ((m = p.match(/^(\w+) IS NOT NULL$/))) {
      const col = m[1];
      return (r) => (isNullish(r[col]) ? FALSE : TRUE); // never UNKNOWN
    }
    if ((m = p.match(/^(\w+) IS NULL$/))) {
      const col = m[1];
      return (r) => (isNullish(r[col]) ? TRUE : FALSE); // never UNKNOWN
    }
    if ((m = p.match(/^(\w+) = '(.*)'$/))) {
      const [, col, value] = m;
      return (r) => (isNullish(r[col]) ? UNKNOWN : r[col] === value ? TRUE : FALSE);
    }
    if ((m = p.match(/^(\w+) IN \((.*)\)$/))) {
      const col = m[1];
      const raw = m[2].split(",").map((x) => x.trim());
      const listHasNull = raw.some((x) => x.toUpperCase() === "NULL");
      const values = raw.filter((x) => x.toUpperCase() !== "NULL").map((x) => x.replace(/^'|'$/g, ""));
      return (r) => {
        if (isNullish(r[col])) return UNKNOWN; // NULL IN (...) is UNKNOWN
        if (values.includes(r[col])) return TRUE;
        return listHasNull ? UNKNOWN : FALSE; // a miss against a list containing NULL is UNKNOWN
      };
    }
    throw new Error("unparsed predicate: " + p);
  }

  // Split an arm on TOP-LEVEL AND, respecting parentheses, then evaluate under 3VL.
  function compile(armText) {
    const s = armText
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const parts = [];
    let depth = 0;
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth === 0 && s.startsWith(" AND ", i)) { parts.push(cur.trim()); cur = ""; i += 4; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    const predicates = parts.map(compilePredicate);
    return (r) => predicates.map((f) => f(r)).reduce(sqlAnd, TRUE);
  }
  const compiled = arms.map(compile);
  // Whole-expression value, then the single CHECK-verdict helper — never a boolean flattening.
  const evaluate = (row) => compiled.map((fn) => fn(row)).reduce(sqlOr, FALSE);
  const accepts = (row) => sqlCheckPasses(evaluate(row));

  // ---- truth-table self-test, so a future regression to boolean logic fails here ----
  const AND_TABLE = [
    [TRUE, TRUE, TRUE], [TRUE, FALSE, FALSE], [TRUE, UNKNOWN, UNKNOWN],
    [FALSE, TRUE, FALSE], [FALSE, FALSE, FALSE], [FALSE, UNKNOWN, FALSE],
    [UNKNOWN, TRUE, UNKNOWN], [UNKNOWN, FALSE, FALSE], [UNKNOWN, UNKNOWN, UNKNOWN]
  ];
  const OR_TABLE = [
    [TRUE, TRUE, TRUE], [TRUE, FALSE, TRUE], [TRUE, UNKNOWN, TRUE],
    [FALSE, TRUE, TRUE], [FALSE, FALSE, FALSE], [FALSE, UNKNOWN, UNKNOWN],
    [UNKNOWN, TRUE, TRUE], [UNKNOWN, FALSE, UNKNOWN], [UNKNOWN, UNKNOWN, UNKNOWN]
  ];
  expect(AND_TABLE.every(([a, b, r]) => sqlAnd(a, b) === r), "S113a SQL AND truth table is correct for all nine combinations");
  expect(OR_TABLE.every(([a, b, r]) => sqlOr(a, b) === r), "S113b SQL OR truth table is correct for all nine combinations");
  expect(
    sqlCheckPasses(TRUE) === true && sqlCheckPasses(UNKNOWN) === true && sqlCheckPasses(FALSE) === false,
    "S113c a CHECK is violated ONLY by FALSE — TRUE and UNKNOWN both pass"
  );
  expect(
    compilePredicate("confirmation_mode IS NULL")({ confirmation_mode: null }) === TRUE &&
      compilePredicate("confirmation_mode IS NOT NULL")({ confirmation_mode: null }) === FALSE,
    "S113d IS NULL / IS NOT NULL never yield UNKNOWN"
  );
  expect(
    compilePredicate("confirmation_mode IN ('accepted','corrected')")({ confirmation_mode: null }) === UNKNOWN &&
      compilePredicate("confirmation_mode IN ('accepted','corrected')")({ confirmation_mode: "accepted" }) === TRUE &&
      compilePredicate("confirmation_mode IN ('accepted','corrected')")({ confirmation_mode: "bogus" }) === FALSE,
    "S113e IN yields UNKNOWN for NULL, TRUE for a hit, FALSE for a clean miss"
  );
  expect(
    compilePredicate("selection_kind = 'ai_candidate'")({ selection_kind: null }) === UNKNOWN,
    "S113f equality against NULL yields UNKNOWN"
  );

  const NULLS = {
    unresolved_reason: null, identity_validation_status: null, restaurant_id: null, branch_id: null,
    menu_id: null, menu_category_id: null, menu_item_id: null, branch_menu_item_id: null, confirmation_mode: null
  };
  const ai = (over = {}) => ({
    ...NULLS, selection_kind: "ai_candidate", identity_validation_status: "not_applicable",
    confirmation_mode: "accepted", ...over
  });
  const catalogItem = (over = {}) => ({
    ...NULLS, selection_kind: "catalog_item", identity_validation_status: "server_validated",
    restaurant_id: "R", branch_id: "B", menu_id: "M", menu_category_id: "MC",
    menu_item_id: "MI", branch_menu_item_id: "BMI", confirmation_mode: null, ...over
  });
  const unresolved = (over = {}) => ({
    ...NULLS, selection_kind: "personal_unresolved", unresolved_reason: "manual",
    identity_validation_status: "not_applicable", ...over
  });

  const CASES = [
    [ai(), true, "S114 ai_candidate NULL/NULL is accepted"],
    [ai({ restaurant_id: "R" }), true, "S115 ai_candidate R/NULL is accepted"],
    [ai({ restaurant_id: "R", branch_id: "B" }), true, "S116 ai_candidate R/B is accepted"],
    [ai({ branch_id: "B" }), false, "S117 ai_candidate NULL/B (orphan branch) is REJECTED"],
    [ai({ restaurant_id: "R", menu_id: "M" }), false, "S118 ai_candidate + menu_id is REJECTED"],
    [ai({ restaurant_id: "R", menu_category_id: "MC" }), false, "S119 ai_candidate + menu_category_id is REJECTED"],
    [ai({ restaurant_id: "R", menu_item_id: "MI" }), false, "S120 ai_candidate + menu_item_id is REJECTED"],
    [ai({ restaurant_id: "R", branch_menu_item_id: "BMI" }), false, "S121 ai_candidate + branch_menu_item_id is REJECTED"],
    [ai({ identity_validation_status: "server_validated" }), false, "S122 ai_candidate with wrong identity status is REJECTED"],
    [ai({ unresolved_reason: "manual" }), false, "S123 ai_candidate with a non-null unresolved_reason is REJECTED"],
    [ai({ confirmation_mode: "bogus" }), false, "S124 ai_candidate with an invalid confirmation_mode is REJECTED"],
    // MI-E-C5-R7-B2-R1-R1 correction. `NULL IN (...)` is UNKNOWN, so the ai arm evaluates to
    // UNKNOWN while the other two are FALSE; the whole expression is UNKNOWN and PostgreSQL
    // ACCEPTS it. The previous "REJECTED" expectation here was simply wrong about the database.
    // This shape is not producible by the product — see the RPC non-reachability proof below.
    [ai({ confirmation_mode: null }), true, "S125 ai_candidate with a null confirmation_mode is ACCEPTED by the CHECK (UNKNOWN), and is not producible by the current product RPC"],
    [ai({ confirmation_mode: "corrected", restaurant_id: "R", branch_id: "B" }), true, "S126 corrected + R/B is accepted"],
    [ai({ confirmation_mode: "manual", restaurant_id: "R" }), true, "S127 manual + R/NULL is accepted"],
    [catalogItem(), true, "S128 catalog_item full identity is still accepted"],
    [catalogItem({ menu_item_id: null }), false, "S129 catalog_item missing menu_item_id is still REJECTED"],
    [catalogItem({ branch_id: null }), false, "S130 catalog_item missing branch_id is still REJECTED"],
    [catalogItem({ identity_validation_status: "not_applicable" }), false, "S131 catalog_item without server_validated is still REJECTED"],
    [catalogItem({ confirmation_mode: "accepted" }), false, "S132 catalog_item with a confirmation_mode is still REJECTED"],
    [unresolved(), true, "S133 personal_unresolved manual is still accepted"],
    [unresolved({ unresolved_reason: "self_cooked" }), true, "S134 personal_unresolved self_cooked is still accepted"],
    [unresolved({ restaurant_id: "R" }), false, "S135 personal_unresolved carrying a restaurant is still REJECTED"],
    [unresolved({ unresolved_reason: "bogus" }), false, "S136 personal_unresolved with an invalid reason is still REJECTED"],
    // MI-E-C5-R7-B2-R1-R1 correction, same root cause as S125: `NULL IN (...)` is UNKNOWN, so the
    // whole expression is UNKNOWN and PostgreSQL ACCEPTS it. Not producible by the product either.
    [unresolved({ unresolved_reason: null }), true, "S137 personal_unresolved with a null reason is ACCEPTED by the CHECK (UNKNOWN), and is not producible by the current product RPC"],
    [{ ...NULLS, selection_kind: "unknown_kind" }, false, "S138 an unknown selection_kind is still REJECTED"]
  ];
  for (const [row, expected, name] of CASES) expect(accepts(row) === expected, name);

  // The pre-correction constraint must have rejected exactly the rows this change unblocks.
  const previous = fs.readFileSync(
    path.join(root, "supabase/migrations/20260727010000_extend_meal_identification_finalization_for_existing_analysis.sql"),
    "utf8"
  );
  expect(
    /selection_kind = 'ai_candidate'[\s\S]{0,600}?restaurant_id IS NULL\s*\r?\n\s*AND branch_id IS NULL/.test(previous),
    "S139 the previous constraint really did force ai_candidate restaurant/branch to be NULL"
  );
  expect(
    /\(branch_id IS NULL OR restaurant_id IS NOT NULL\)/.test(constraintSql) &&
      !/NOT VALID/i.test(constraintSql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")),
    "S140 the corrective arm uses the pair rule and validates existing rows immediately"
  );

  // ---- the two UNKNOWN shapes really do evaluate to UNKNOWN, not TRUE and not FALSE ----
  expect(
    evaluate(ai({ confirmation_mode: null })) === UNKNOWN,
    "S141 ai_candidate + null confirmation_mode evaluates to UNKNOWN (not TRUE, not FALSE)"
  );
  expect(
    evaluate(unresolved({ unresolved_reason: null })) === UNKNOWN,
    "S142 personal_unresolved + null reason evaluates to UNKNOWN (not TRUE, not FALSE)"
  );
  expect(
    evaluate(ai({ branch_id: "B" })) === FALSE && evaluate(ai({ restaurant_id: "R", branch_id: "B" })) === TRUE,
    "S143 the restaurant-identity cases this migration is FOR are decided by TRUE/FALSE, never UNKNOWN"
  );

  // ---- the inherited looseness is NOT introduced or worsened by this migration ----
  const previousArms = (() => {
    const a = previous.indexOf("ADD CONSTRAINT meal_identification_finalizations_selection_check");
    const o = previous.indexOf("(", previous.indexOf("CHECK (", a));
    let dd = 0;
    let e = -1;
    for (let i = o; i < previous.length; i++) {
      if (previous[i] === "(") dd++;
      else if (previous[i] === ")" && --dd === 0) { e = i; break; }
    }
    const b = previous.slice(o + 1, e);
    const out = [];
    let d2 = 0;
    let c2 = "";
    for (let i = 0; i < b.length; i++) {
      const ch = b[i];
      if (ch === "(") { d2++; if (d2 === 1) { c2 = ""; continue; } }
      if (ch === ")") { d2--; if (d2 === 0) { out.push(c2); continue; } }
      if (d2 >= 1) c2 += ch;
    }
    return out.map(compile);
  })();
  const evaluatePrevious = (row) => previousArms.map((fn) => fn(row)).reduce(sqlOr, FALSE);
  expect(
    evaluatePrevious(ai({ confirmation_mode: null })) === UNKNOWN &&
      evaluatePrevious(unresolved({ unresolved_reason: null })) === UNKNOWN,
    "S144 both UNKNOWN shapes were ALREADY accepted by the previous constraint — inherited, not introduced here"
  );

  // ---- product RPC non-reachability, proven from production source ----
  const rpc = fs.readFileSync(
    path.join(root, "supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql"),
    "utf8"
  );
  const v1v2 = fs.readFileSync(
    path.join(root, "supabase/migrations/20260724020000_consumer_meal_identification_atomic_finalization.sql"),
    "utf8"
  );
  expect(
    /v3_confirmation_mode := 'accepted'/.test(rpc) &&
      /v3_confirmation_mode := 'corrected'/.test(rpc) &&
      /v3_confirmation_mode := 'manual'/.test(rpc),
    "S145 the v3 RPC assigns confirmation_mode only from the three legal literals"
  );
  expect(
    !/v3_confirmation_mode := NULL/i.test(rpc) && !/v3_confirmation_mode := p_finalization/.test(rpc),
    "S146 the v3 RPC never assigns a NULL or caller-supplied confirmation_mode"
  );
  expect(
    /confirmation_mode\s*\)?\s*[\s\S]{0,200}?v3_confirmation_mode/.test(rpc),
    "S147 the v3 ledger INSERT writes that same local, so an ai_candidate row always has one of the three values"
  );
  expect(
    /unresolved_reason/.test(v1v2) && /'none_of_the_above'|'manual'|'self_cooked'|'catalog_unavailable'/.test(v1v2),
    "S148 the v1/v2 path supplies unresolved_reason from the established vocabulary, never NULL, for personal_unresolved"
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
