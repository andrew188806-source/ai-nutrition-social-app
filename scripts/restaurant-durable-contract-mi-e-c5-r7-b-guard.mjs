#!/usr/bin/env node
// MI-E-C5-R7-B1 static guard: the canonical restaurant context becomes DURABLE payload.
//
// Static/structural assertions only — every behavioural claim (what the builder actually returns,
// what the fingerprint actually contains, whether the clientRequestId actually rotates) lives in
// the companion smoke, which executes the real production modules.
//
// Live database behaviour (real replay, real duplicate-write prevention, real catalog rejection
// against Development) is explicitly NOT provable here and is deferred to R7-B2.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const sha = (relative) => crypto.createHash("sha256").update(read(relative), "utf8").digest("hex");
const gitRaw = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout ?? "";
};
const git = (args) => gitRaw(args).trim();

const V3_CONTRACT = "apps/mobile/features/meal-identification-finalization/v3Contract.ts";
const DRAFT = "apps/mobile/features/analysis/mealPhotoFinalizationDraft.ts";
const HOOK = "apps/mobile/features/analysis/useMealPhotoFinalization.ts";
const CORRECTION_HOOK = "apps/mobile/features/analysis/useAnalysisCorrectionState.ts";
const SCREEN = "apps/mobile/app/analysis.tsx";
const SESSION = "apps/mobile/features/analysis/analysisSessionStore.ts";
const RUNTIME = "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts";
const MIGRATION = "supabase/migrations/20260802010000_finalize_meal_identification_v3_restaurant_context.sql";
// MI-E-C5-R7-B1-R2 corrective successor: projects the same validated ids onto the ledger columns.
const LEDGER_MIGRATION =
  "supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql";
const PREDECESSOR = "supabase/migrations/20260729010000_persist_user_confirmed_for_accepted_analysis_finalization.sql";
// MI-E-C5-R7-B2-R1: relaxes the ai_candidate arm of the finalization selection constraint.
const CONSTRAINT_MIGRATION =
  "supabase/migrations/20260804010000_relax_ai_candidate_restaurant_identity_constraint.sql";
// The constraint's previous authority — the arms this correction must preserve verbatim.
const CONSTRAINT_PREDECESSOR =
  "supabase/migrations/20260727010000_extend_meal_identification_finalization_for_existing_analysis.sql";

const v3 = read(V3_CONTRACT);
const draft = read(DRAFT);
const hook = read(HOOK);
const correctionHook = read(CORRECTION_HOOK);
const screen = read(SCREEN);
const session = read(SESSION);
const runtime = read(RUNTIME);
const migration = read(MIGRATION);
const ledgerMigration = read(LEDGER_MIGRATION);
const constraintMigration = read(CONSTRAINT_MIGRATION);
const constraintPredecessor = read(CONSTRAINT_PREDECESSOR);

// ============================================================================================
// MI-E-C5-R7-B2-R1: parse the selection constraint into its three arms so the checks below test
// the ACTUAL predicate text per arm, not a substring of the whole file.
// ============================================================================================
function selectionArms(sql) {
  const at = sql.indexOf("ADD CONSTRAINT meal_identification_finalizations_selection_check");
  if (at < 0) return null;
  const open = sql.indexOf("CHECK (", at);
  let depth = 0;
  let end = -1;
  for (let i = sql.indexOf("(", open); i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")" && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const body = sql.slice(sql.indexOf("(", open) + 1, end);
  // Split on top-level OR between the parenthesised arms.
  const arms = [];
  let d = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") { d++; if (d === 1) { cur = ""; continue; } }
    if (ch === ")") { d--; if (d === 0) { arms.push(cur); continue; } }
    if (d >= 1) cur += ch;
  }
  const named = {};
  for (const arm of arms) {
    const m = arm.match(/selection_kind = '([a-z_]+)'/);
    if (m) named[m[1]] = arm.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").replace(/\s+/g, " ").trim();
  }
  return named;
}
const armsNew = selectionArms(constraintMigration);
const armsOld = selectionArms(constraintPredecessor);
// Executable SQL only. Prose that legitimately mentions "NOT VALID" or "grant" while explaining
// why they are ABSENT must never satisfy or break a check about the code.
const constraintSql = constraintMigration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const trackedChanged = new Set(git(["diff", "--name-only"]).split("\n").filter(Boolean));
const untracked = new Set(git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean));

// ============================================================================================
// Mobile contract (1-10)
// ============================================================================================
check(
  "1. the v3 version string is unchanged — this is an additive extension, not a new contract",
  /MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION = "meal-identification-finalization-v3"/.test(v3)
);
check(
  "2. restaurantId/branchId sit at the COMMAND TOP LEVEL, as siblings of sourceContext",
  /export type MealIdentificationFinalizationV3Command = Readonly<\{[\s\S]{0,600}?sourceContext: MealSourceContext;[\s\S]{0,300}?restaurantId\?: string;\s*\r?\n\s*branchId\?: string \| null;/.test(v3)
);
check(
  "3. the ids are NOT added to mealWrite — its shape is untouched",
  /export type MealIdentificationFinalizationV3MealWriteInput = Readonly<\{\s*\r?\n\s*mealName: string;\s*\r?\n\s*components: readonly string\[\];\s*\r?\n\s*portion: string \| null;\s*\r?\n\s*nutrition: MealIdentificationFinalizationV3Nutrition;\s*\r?\n\}>;/.test(v3)
);
check(
  "4. both keys are OPTIONAL on the command type, so the no-context command omits them entirely",
  /restaurantId\?: string;/.test(v3) && /branchId\?: string \| null;/.test(v3)
);
check(
  "5. the builder emits the 8-key base object and only spreads the pair in when a context exists",
  /if \(!restaurant\.value\) \{\s*\r?\n\s*return success\(Object\.freeze\(base\)\);\s*\r?\n\s*\}/.test(v3) &&
    /\.\.\.base,\s*\r?\n\s*restaurantId: restaurant\.value\.restaurantId,\s*\r?\n\s*branchId: restaurant\.value\.branchId/.test(v3)
);
check(
  "6. an orphan branchId (no restaurantId) is REJECTED, never silently dropped",
  /if \(!restaurant\) \{\s*\r?\n\s*if \(branch\) \{\s*\r?\n\s*return failure\("invalid_finalization", "branchId requires a restaurantId\."\);/.test(v3)
);
check(
  "7. self_cooked + a restaurant context is REJECTED by the client builder",
  /if \(sourceContext === "self_cooked"\) \{\s*\r?\n\s*return failure\(\s*\r?\n?\s*"invalid_finalization",\s*"self_cooked meals must not carry a restaurant context\."/.test(v3)
);
check(
  "8. the restaurant validator is reached for every build, before the command is assembled",
  /const restaurant = validateRestaurantContext\(input\.restaurantId, input\.branchId, input\.sourceContext\);\s*\r?\n\s*if \(!restaurant\.ok\) return restaurant;/.test(v3)
);
check(
  "9. NO restaurant name/display field exists anywhere in the durable command layer",
  !/restaurantName|restaurantDisplayName|branchName|displayName/.test(v3)
);
check(
  "10. the command is rebuilt field-by-field — no caller object is ever spread into it",
  /const base = \{\s*\r?\n\s*version: MEAL_IDENTIFICATION_FINALIZATION_V3_VERSION,/.test(v3) &&
    !/\.\.\.input/.test(v3)
);
check(
  "11. canonical ids are treated as opaque TEXT — no uuid-v4 validator is applied to them",
  /function blankToNull\(value: string \| null \| undefined\): string \| null \{/.test(v3) &&
    !/\[0-9a-f\]\{8\}-/i.test(v3)
);

// ============================================================================================
// Draft / context / idempotency (12-21)
// ============================================================================================
check(
  "12. the ids join the EXISTING context authority rather than getting a parallel layer",
  /context: Readonly<\{[\s\S]{0,400}?selectedMealPeriod: string;\s*\r?\n\s*restaurantId: string \| null;\s*\r?\n\s*branchId: string \| null;\s*\r?\n\s*\}>;/.test(draft)
);
check(
  "13. sameContext() compares BOTH ids — a venue change is a payload change",
  /function sameContext\([\s\S]{0,700}?left\.restaurantId === right\.restaurantId &&\s*\r?\n\s*left\.branchId === right\.branchId/.test(draft)
);
check(
  "14. prepare() forwards the ids from the frozen context into the command builder",
  /buildMealIdentificationFinalizationV3\(\{[\s\S]{0,600}?restaurantId: state\.context\.restaurantId,\s*\r?\n\s*branchId: state\.context\.branchId,/.test(draft)
);
check(
  "15. the payload fingerprint still hashes the whole context object, so the ids are covered",
  /export function getMealPhotoFinalizationPayloadFingerprint\([\s\S]{0,400}?context: state\.context\s*\r?\n\s*\}\);/.test(draft)
);
check(
  "16. the ids do NOT appear in the operation/actor identity authority",
  !/restaurantId|branchId/.test(read("apps/mobile/features/analysis/mealPhotoAnalysisFlowState.ts"))
);
check(
  "17. the secure clientRequestId factory takes NO arguments, so an id can never seed it",
  /export function generateConsumerMealIdentificationFinalizationClientRequestId\(\): string \{\s*\r?\n\s*return generateSecureUuidV4\(\);\s*\r?\n\}/.test(runtime)
);
check(
  "18. a context change still routes through the rotate-on-attempted transition",
  /export function updateMealPhotoFinalizationContext\([\s\S]{0,500}?if \(sameContext\(state\.context, context\)\) return state;[\s\S]{0,400}?clientRequestId: state\.attempted \? uuidFactory\(\) : state\.clientRequestId,/.test(draft)
);
check(
  "19. the context effect's dependency array includes BOTH ids, so a venue-only change re-runs it",
  /input\.context\.branchId,[\s\S]{0,400}?input\.context\.restaurantId,[\s\S]{0,200}?runtime\.mealIdentificationFinalizationState\.status,\s*\r?\n\s*setDraft\s*\r?\n\s*\]\);/.test(hook)
);
check(
  "20. the context mutation is still wrapped by the payload lock (no edit while submitting/uncertain/succeeded)",
  /applyMealPhotoFinalizationPayloadMutation\(\s*\r?\n?\s*current,\s*\r?\n?\s*runtime\.mealIdentificationFinalizationState\.status,\s*\r?\n?\s*\(\) =>\s*\r?\n?\s*updateMealPhotoFinalizationContext\(/.test(hook)
);
check(
  "21. uncertain retry replays the FROZEN submission and refuses if the live draft drifted",
  /const frozen = frozenSubmissionRef\.current;[\s\S]{0,400}?getMealPhotoFinalizationPayloadFingerprint\(current\) !== frozen\.fingerprint[\s\S]{0,300}?runtime\.retryPendingMealIdentificationFinalization\(\)/.test(hook)
);

// ============================================================================================
// Session handoff (22-26)
// ============================================================================================
// ---- MI-E-C5-R7-B1-R1: invocation-time context authority (the stale-submit repair) ----
check(
  "21a. a single named invocation-time reconciliation authority exists and is payload-lock gated",
  /const reconcileDraftWithCurrentContext = useCallback\(\s*\r?\n?\s*\(current: MealPhotoFinalizationDraftState\): MealPhotoFinalizationDraftState => \{[\s\S]{0,600}?applyMealPhotoFinalizationPayloadMutation\([\s\S]{0,400}?updateMealPhotoFinalizationContext\(\s*\r?\n?\s*current,\s*\r?\n?\s*input\.context,/.test(hook)
);
check(
  "21b. it clears a now-incompatible frozen submission and returns the state to prepare from",
  /if \(next === current\) return current;[\s\S]{0,300}?frozenSubmissionRef\.current = null;\s*\r?\n\s*setDraft\(next\);\s*\r?\n\s*return next;/.test(hook)
);
(() => {
  // Every NEW durable submission must reconcile BEFORE it prepares. Proven per handler body, by
  // character position, so a future handler that prepares from a stale draftRef fails here.
  const bodyBetween = (from, to) => {
    const start = hook.indexOf(from);
    if (start < 0) return null;
    const end = to ? hook.indexOf(to, start) : hook.length;
    return end > start ? hook.slice(start, end) : null;
  };
  const submitBody = bodyBetween("const submit = useCallback", "const acceptCandidate = useCallback");
  const acceptBody = bodyBetween("const acceptCandidate = useCallback", "return useMemo(");
  const retryBody = bodyBetween("const retryPending = useCallback", "const submit = useCallback");
  const reconcilesBeforePrepare = (body) =>
    body !== null &&
    body.indexOf("reconcileDraftWithCurrentContext(") > 0 &&
    body.indexOf("reconcileDraftWithCurrentContext(") < body.indexOf("prepareMealPhotoFinalization(");
  check(
    "21c. the editor submit reconciles with the current context BEFORE preparing its payload",
    reconcilesBeforePrepare(submitBody)
  );
  check(
    "21d. acceptCandidate uses the SAME authority, also before preparing",
    reconcilesBeforePrepare(acceptBody)
  );
  check(
    "21e. submit never prepares from the raw draftRef it read first",
    submitBody !== null &&
      /const existing = draftRef\.current;[\s\S]{0,600}?const current = reconcileDraftWithCurrentContext\(existing\);/.test(submitBody) &&
      /prepareMealPhotoFinalization\(\s*\r?\n?\s*current,/.test(submitBody)
  );
  check(
    "21f. uncertain retry is EXCLUDED — it never re-reads live context, only the frozen submission",
    retryBody !== null &&
      !/reconcileDraftWithCurrentContext/.test(retryBody) &&
      !/input\.context/.test(retryBody) &&
      /frozenSubmissionRef\.current/.test(retryBody)
  );
})();
check(
  "21f2. every handler that calls the reconciler also DEPENDS on it (no stale closure)",
  /\}, \[applyResultIfCurrent, reconcileDraftWithCurrentContext, retryPending, runtime, setDraft\]\);/.test(hook) &&
    /\[applyResultIfCurrent, input\.context, reconcileDraftWithCurrentContext, retryPending, runtime, setDraft\]/.test(hook)
);
check(
  "21g. the eager sync is a pre-paint LAYOUT effect, and is not the only authority",
  /useLayoutEffect\(\(\) => \{\s*\r?\n\s*const current = draftRef\.current;[\s\S]{0,600}?updateMealPhotoFinalizationContext\(/.test(hook) &&
    /reconcileDraftWithCurrentContext/.test(hook)
);
check(
  "21h. no render-phase setState or store mutation was introduced by the repair",
  !/^\s*(?:setDraft|setDraftState|setMealPhotoFinalizationDraft)\(/m.test(
    hook.slice(hook.indexOf("const isRuntimeBoundToCurrentOperation"), hook.indexOf("useLayoutEffect"))
  )
);
check(
  "22. the ids reach the payload through the actor-gated correction hook, not a raw store read",
  /restaurantId: publicRestaurantContext\.restaurantId,\s*\r?\n\s*branchId: publicRestaurantContext\.branchId,/.test(correctionHook)
);
check(
  "23. that public value is derived through the R7-A normalizer with the PUBLIC source context",
  /const publicRestaurantContext = normalizeAnalysisRestaurantContext\(\{\s*\r?\n\s*restaurantId: session\.restaurantId,\s*\r?\n\s*branchId: session\.branchId,\s*\r?\n\s*sourceContext: publicSourceContext\s*\r?\n\s*\}\);/.test(correctionHook)
);
check(
  "24. a self_cooked switch is ALSO reconciled durably in the commit-phase sync effect",
  /reconcileAnalysisRestaurantContextForSourceContext\(sourceContext\);/.test(correctionHook)
);
check(
  "25. the screen's finalization context memo carries the ids and depends on both",
  /restaurantId: analysis\.restaurantId,\s*\r?\n\s*branchId: analysis\.branchId\s*\r?\n\s*\}\),\s*\r?\n\s*\[\s*\r?\n\s*analysis\.branchId,[\s\S]{0,300}?analysis\.restaurantId,/.test(screen)
);
check(
  "26. the durable path never reads the legacy restaurantName or a catalog display name",
  !/restaurantName/.test(draft) &&
    !/restaurantName/.test(v3) &&
    !/restaurantName/.test(hook) &&
    !/resolveRestaurantContextPresentation/.test(draft) &&
    !/resolveRestaurantContextPresentation/.test(hook) &&
    !/resolveRestaurantContextPresentation/.test(v3)
);

// ============================================================================================
// SQL static authority (27-38)
// ============================================================================================
check(
  "27. the successor migration exists and only CREATE OR REPLACEs the single canonical RPC",
  // Counted at line starts only, so the explanatory prose that mentions CREATE OR REPLACE cannot
  // inflate the count and hide a second function definition.
  /^CREATE OR REPLACE FUNCTION public\.finalize_current_user_meal_identification_v1\($/m.test(migration) &&
    (migration.match(/^CREATE OR REPLACE FUNCTION/gm) || []).length === 1
);
check(
  "28. the signature, return type, security context and search_path are all preserved",
  /p_client_request_id uuid,\s*\r?\n\s*p_meal_type public\.meal_type,\s*\r?\n\s*p_occurred_at timestamptz,\s*\r?\n\s*p_meal_date date,\s*\r?\n\s*p_timezone text,\s*\r?\n\s*p_finalization jsonb\s*\r?\n\)/.test(migration) &&
    /RETURNS jsonb/.test(migration) &&
    /LANGUAGE plpgsql/.test(migration) &&
    /SECURITY DEFINER/.test(migration) &&
    /SET search_path = pg_catalog, public, pg_temp/.test(migration)
);
check(
  "29. grants/revokes authority is restated for the unchanged signature",
  /REVOKE ALL ON FUNCTION public\.finalize_current_user_meal_identification_v1\(/.test(migration) &&
    /GRANT EXECUTE ON FUNCTION public\.finalize_current_user_meal_identification_v1\(/.test(migration)
);
check(
  "30. EXACTLY two accepted v3 top-level key sets: the original 8, and those 8 plus the pair",
  /v3_has_restaurant_context := \(\s*\r?\n\s*SELECT pg_catalog\.array_agg\(key ORDER BY key\)[\s\S]{0,300}?\) = ARRAY\[\s*\r?\n\s*'analysisRequestId', 'branchId', 'captureMethod', 'mealWrite', 'occurredAt',\s*\r?\n\s*'recordTiming', 'restaurantId', 'selectedCandidateId', 'sourceContext', 'version'\s*\r?\n\s*\]::text\[\];/.test(migration) &&
    /IF NOT v3_has_restaurant_context AND \(\s*\r?\n\s*SELECT pg_catalog\.array_agg\(key ORDER BY key\)[\s\S]{0,300}?\) IS DISTINCT FROM ARRAY\[\s*\r?\n\s*'analysisRequestId', 'captureMethod', 'mealWrite', 'occurredAt',\s*\r?\n\s*'recordTiming', 'selectedCandidateId', 'sourceContext', 'version'\s*\r?\n\s*\]::text\[\] THEN\s*\r?\n\s*RAISE EXCEPTION 'INVALID_FINALIZATION'/.test(migration)
);
check(
  "31. only one of the two keys is structurally impossible — the key-set equality enforces pairing",
  /'analysisRequestId', 'branchId', 'captureMethod'/.test(migration) &&
    !/p_finalization \? 'restaurantId'/.test(migration)
);
check(
  "32. a blank/whitespace/padded restaurantId or branchId is rejected, never coerced to absent",
  /IF v3_restaurant_id IS NULL\s*\r?\n\s*OR pg_catalog\.length\(v3_restaurant_id\) = 0\s*\r?\n\s*OR pg_catalog\.btrim\(v3_restaurant_id\) <> v3_restaurant_id\s*\r?\n\s*OR pg_catalog\.length\(pg_catalog\.btrim\(v3_restaurant_id\)\) = 0 THEN\s*\r?\n\s*RAISE EXCEPTION 'INVALID_FINALIZATION'/.test(migration) &&
    /IF v3_branch_id IS NULL\s*\r?\n\s*OR pg_catalog\.length\(v3_branch_id\) = 0\s*\r?\n\s*OR pg_catalog\.btrim\(v3_branch_id\) <> v3_branch_id\s*\r?\n\s*OR pg_catalog\.length\(pg_catalog\.btrim\(v3_branch_id\)\) = 0 THEN\s*\r?\n\s*RAISE EXCEPTION 'INVALID_FINALIZATION'/.test(migration)
);
check(
  "33. self_cooked + a restaurant context is rejected server-side too",
  /IF v_source_context = 'self_cooked' THEN\s*\r?\n\s*RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';/.test(migration)
);
// ---- MI-E-C5-R7-B1-R1: Model A canonical text, and validation ORDER ----
check(
  "33a. MODEL A — a non-canonical raw id is REJECTED, never silently trimmed and carried on",
  /v3_restaurant_id := p_finalization ->> 'restaurantId';[\s\S]{0,400}?pg_catalog\.btrim\(v3_restaurant_id\) <> v3_restaurant_id[\s\S]{0,200}?RAISE EXCEPTION 'INVALID_FINALIZATION'/.test(migration) &&
    /v3_branch_id := p_finalization ->> 'branchId';[\s\S]{0,400}?pg_catalog\.btrim\(v3_branch_id\) <> v3_branch_id[\s\S]{0,200}?RAISE EXCEPTION 'INVALID_FINALIZATION'/.test(migration)
);
check(
  "33b. the silent-trim spelling is GONE — no NULLIF(btrim(...)) assignment survives for either id",
  !/v3_restaurant_id := NULLIF\(pg_catalog\.btrim\(/.test(migration) &&
    !/v3_branch_id := NULLIF\(pg_catalog\.btrim\(/.test(migration)
);
check(
  "33c. an empty-string id is rejected as well as a padded one",
  /pg_catalog\.length\(v3_restaurant_id\) = 0/.test(migration) &&
    /pg_catalog\.length\(v3_branch_id\) = 0/.test(migration)
);
check(
  "33d. the local variable IS the validated raw value, so no second text form can exist",
  /v3_restaurant_id := p_finalization ->> 'restaurantId';/.test(migration) &&
    /v3_branch_id := p_finalization ->> 'branchId';/.test(migration)
);
check(
  "33e. canonical rejection happens BEFORE the fingerprint, the replay lookup and every write",
  migration.indexOf("pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id") > 0 &&
    migration.indexOf("pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id") <
      migration.indexOf("v3_fingerprint := pg_catalog.jsonb_build_object") &&
    migration.indexOf("pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id") <
      migration.indexOf("SELECT * INTO v_record")
);
check(
  "33f. catalog EXISTENCE validation runs only for NEW requests — after the replay branch returns",
  migration.indexOf("SELECT * INTO v_record") <
    migration.indexOf("MI-E-C5-R7-B1-R1: canonical restaurant EXISTENCE validation") &&
    migration.indexOf("'replayed', true,") <
      migration.indexOf("MI-E-C5-R7-B1-R1: canonical restaurant EXISTENCE validation") &&
    migration.indexOf("MI-E-C5-R7-B1-R1: canonical restaurant EXISTENCE validation") <
      migration.indexOf("v3_created := public.create_current_user_meal_record(")
);
check(
  "33g. the catalog-valid flag is reset per invocation, so a stale value cannot pass the gate",
  /v3_catalog_valid := NULL;/.test(migration) &&
    /IF v3_catalog_valid IS NOT TRUE THEN\s*\r?\n\s*RAISE EXCEPTION 'CATALOG_IDENTITY_REJECTED' USING ERRCODE = '23503';/.test(migration)
);
check(
  "34. restaurant validity is proven against the BASE TABLES with the formal active authority",
  /FROM public\.restaurants AS restaurant\s*\r?\n\s*WHERE restaurant\.id = v3_restaurant_id\s*\r?\n\s*AND restaurant\.status = 'active'\s*\r?\n\s*FOR SHARE OF restaurant;/.test(migration)
);
check(
  "35. a non-null branch must exist, be active, and BELONG to that restaurant",
  /JOIN public\.restaurant_branches AS branch\s*\r?\n\s*ON branch\.id = v3_branch_id\s*\r?\n\s*AND branch\.restaurant_id = restaurant\.id\s*\r?\n\s*WHERE restaurant\.id = v3_restaurant_id\s*\r?\n\s*AND restaurant\.status = 'active'\s*\r?\n\s*AND branch\.status = 'active'\s*\r?\n\s*AND branch\.is_active = true\s*\r?\n\s*FOR SHARE OF restaurant, branch;/.test(migration)
);
check(
  "36. an unknown/inactive identity fails closed with the established CATALOG_IDENTITY_REJECTED/23503",
  /IF v3_catalog_valid IS NOT TRUE THEN\s*\r?\n\s*RAISE EXCEPTION 'CATALOG_IDENTITY_REJECTED' USING ERRCODE = '23503';/.test(migration)
);
check(
  "37. the durable item takes the ids from the SAME validated locals — the json is not re-read",
  /'restaurantId', v3_restaurant_id,\s*\r?\n\s*'branchId', v3_branch_id,\s*\r?\n\s*'menuId', NULL,\s*\r?\n\s*'menuItemId', NULL,/.test(migration) &&
    !/'restaurantId', p_finalization/.test(migration)
);
check(
  // MI-E-C5-R7-B1-R2. The ledger's restaurant_id/branch_id columns were NOT created by this work —
  // they have existed since 20260724020000 and v1/v2 has always populated them. The invariant this
  // check owns is unchanged: this candidate adds NO ledger column. What changed is that v3 now
  // POPULATES the existing pair, so the base migration's "leave them out of the INSERT" spelling is
  // no longer the correct shape and is asserted on the corrective successor instead (checks 38a-38f).
  "38. the ledger gains NO restaurant columns; command_snapshot stays the whole command",
  !/ALTER TABLE public\.meal_identification_finalizations/.test(migration) &&
    !/ALTER TABLE public\.meal_identification_finalizations/.test(ledgerMigration) &&
    /identity_validation_status, command_snapshot,[\s\S]{0,300}?'not_applicable', p_finalization,/.test(migration) &&
    /'not_applicable', v3_restaurant_id, v3_branch_id, p_finalization,/.test(ledgerMigration)
);

// ============================================================================================
// MI-E-C5-R7-B2-R1: the selection-constraint relaxation (checks 38-1 .. 38-20)
// ============================================================================================
check("38-1. the corrective constraint migration exists at the exact authorized path", constraintMigration.length > 0);
check(
  "38-2. its timestamp is unique among migrations",
  fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.startsWith("20260804010000")).length === 1
);
check(
  "38-3. it replaces the constraint under its EXACT existing name",
  /DROP CONSTRAINT meal_identification_finalizations_selection_check,\s*\r?\n\s*ADD CONSTRAINT meal_identification_finalizations_selection_check/.test(
    constraintMigration
  )
);
check(
  "38-4. the DROP is unconditional — no IF EXISTS escape",
  !/DROP CONSTRAINT IF EXISTS/i.test(constraintMigration)
);
check("38-5. an ADD ... CHECK is present", /ADD CONSTRAINT meal_identification_finalizations_selection_check\s*\r?\n?\s*CHECK \(/.test(constraintMigration));
check("38-6. all three selection arms are parsed from the new constraint", Boolean(armsNew) && Object.keys(armsNew).sort().join(",") === "ai_candidate,catalog_item,personal_unresolved");
check(
  "38-7. the ai_candidate arm carries the pair rule that permits an optional restaurant",
  Boolean(armsNew) && /\(branch_id IS NULL OR restaurant_id IS NOT NULL\)/.test(armsNew.ai_candidate)
);
check(
  "38-8. the ai_candidate arm no longer forces restaurant_id/branch_id to be NULL",
  Boolean(armsNew) &&
    !/restaurant_id IS NULL/.test(armsNew.ai_candidate) &&
    !/branch_id IS NULL AND/.test(armsNew.ai_candidate)
);
check(
  "38-9. the ai_candidate arm still forbids EVERY menu identity column",
  Boolean(armsNew) &&
    /menu_id IS NULL/.test(armsNew.ai_candidate) &&
    /menu_category_id IS NULL/.test(armsNew.ai_candidate) &&
    /menu_item_id IS NULL/.test(armsNew.ai_candidate) &&
    /branch_menu_item_id IS NULL/.test(armsNew.ai_candidate)
);
check(
  "38-10. the ai_candidate arm keeps identity_validation_status = not_applicable",
  Boolean(armsNew) && /identity_validation_status = 'not_applicable'/.test(armsNew.ai_candidate)
);
check(
  "38-11. the ai_candidate arm keeps unresolved_reason IS NULL",
  Boolean(armsNew) && /unresolved_reason IS NULL/.test(armsNew.ai_candidate)
);
check(
  "38-12. the ai_candidate confirmation_mode vocabulary is unchanged",
  Boolean(armsNew) && /confirmation_mode IN \('accepted', 'corrected', 'manual'\)/.test(armsNew.ai_candidate)
);
check(
  "38-13. the catalog_item arm is EQUIVALENT to the previous constraint's arm",
  Boolean(armsNew) && Boolean(armsOld) && armsNew.catalog_item === armsOld.catalog_item
);
check(
  "38-14. the personal_unresolved arm is EQUIVALENT to the previous constraint's arm",
  Boolean(armsNew) && Boolean(armsOld) && armsNew.personal_unresolved === armsOld.personal_unresolved
);
check(
  "38-15. the ONLY arm that changed is ai_candidate",
  Boolean(armsNew) && Boolean(armsOld) && armsNew.ai_candidate !== armsOld.ai_candidate
);
check(
  "38-16. the corrective migration changes no function",
  !/CREATE OR REPLACE FUNCTION/i.test(constraintSql) && !/DROP FUNCTION/i.test(constraintSql)
);
check(
  "38-17. the corrective migration mutates no data",
  !/\b(INSERT INTO|UPDATE |DELETE FROM|TRUNCATE)\b/i.test(constraintSql)
);
check(
  "38-18. it adds no column, index, RLS policy or grant, and drops nothing but the constraint",
  !/ADD COLUMN/i.test(constraintSql) &&
    !/CREATE INDEX|CREATE UNIQUE INDEX/i.test(constraintSql) &&
    !/CREATE POLICY|ALTER POLICY|ENABLE ROW LEVEL SECURITY/i.test(constraintSql) &&
    !/GRANT |REVOKE /i.test(constraintSql) &&
    (constraintSql.match(/DROP /gi) || []).length === 1
);
check(
  "38-19. the constraint is validated against existing rows — no NOT VALID escape",
  !/NOT VALID/i.test(constraintSql) &&
    (constraintMigration.match(/^BEGIN;/gm) || []).length === 1 &&
    (constraintMigration.match(/^COMMIT;/gm) || []).length === 1
);
check(
  "38-20. the successor chain is exactly 20260802 -> 20260803 -> 20260804",
  sha(MIGRATION) === "3a615486820cfe3eed76b697de97bc3d8304f7ca76c76b68f285a73ba71f495b" &&
    sha(LEDGER_MIGRATION) === "d33c3981463b323e049119bcfe6e268006c4c3c5cb7c90912c4d270c4bab5238" &&
    fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f >= "20260802010000" && f.endsWith(".sql"))
      .sort()
      .join(",") ===
      [
        "20260802010000_finalize_meal_identification_v3_restaurant_context.sql",
        "20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql",
        "20260804010000_relax_ai_candidate_restaurant_identity_constraint.sql"
      ].join(",")
);

// ---- MI-E-C5-R7-B1-R2: v3 ledger restaurant identity projection ----
check(
  "38a. the corrective successor exists and only CREATE OR REPLACEs the same single RPC",
  /^CREATE OR REPLACE FUNCTION public\.finalize_current_user_meal_identification_v1\($/m.test(ledgerMigration) &&
    (ledgerMigration.match(/^CREATE OR REPLACE FUNCTION/gm) || []).length === 1
);
check(
  "38b. the v3 ledger INSERT names restaurant_id and branch_id as real columns",
  /INSERT INTO public\.meal_identification_finalizations \([\s\S]{0,400}?identity_validation_status, restaurant_id, branch_id, command_snapshot,/.test(
    ledgerMigration
  )
);
check(
  "38c. their values are the SAME validated locals the meal item uses — not a re-read",
  /'not_applicable', v3_restaurant_id, v3_branch_id, p_finalization,/.test(ledgerMigration) &&
    /'restaurantId', v3_restaurant_id,\s*\r?\n\s*'branchId', v3_branch_id,/.test(ledgerMigration)
);
check(
  "38d. the ledger never re-reads the command json, the item, or the snapshot for those ids",
  !/restaurant_id, .{0,40}p_finalization ->>/.test(ledgerMigration) &&
    !/INSERT INTO public\.meal_identification_finalizations \([\s\S]{0,600}?p_finalization ->> 'restaurantId'/.test(ledgerMigration) &&
    !/INSERT INTO public\.meal_identification_finalizations \([\s\S]{0,600}?btrim\(/.test(ledgerMigration) &&
    !/INSERT INTO public\.meal_identification_finalizations \([\s\S]{0,600}?FROM public\.meal_record_items/.test(ledgerMigration)
);
check(
  "38e. command_snapshot is still the whole canonical command, unchanged",
  /'not_applicable', v3_restaurant_id, v3_branch_id, p_finalization,/.test(ledgerMigration)
);
check(
  "38f. no-context finalizations leave both locals NULL, so all three sinks agree on absent",
  /v3_restaurant_id := NULL;\s*\r?\n\s*v3_branch_id := NULL;/.test(ledgerMigration)
);
check(
  "38g. the corrective successor changes ONLY the v3 ledger INSERT and the function comment",
  (() => {
    const strip = (text) => {
      const at = text.indexOf("CREATE OR REPLACE FUNCTION public.finalize_current_user_meal_identification_v1(");
      return at < 0 ? null : text.slice(at);
    };
    const before = strip(migration);
    const after = strip(ledgerMigration);
    if (!before || !after) return false;
    // Re-applying the exact ledger edit to the base must reproduce the successor byte for byte.
    const projected = before
      .replace(
        "      identity_validation_status, command_snapshot,",
        "      identity_validation_status, restaurant_id, branch_id, command_snapshot,"
      )
      .replace("      'not_applicable', p_finalization,", "      'not_applicable', v3_restaurant_id, v3_branch_id, p_finalization,");
    // Everything except the two INSERT lines, the new comment block and the function comment must
    // be identical; compare with comment lines and the function COMMENT literal removed.
    const normalize = (text) =>
      text
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .filter((line) => !line.includes("'Single authenticated atomic meal-identification finalization RPC."))
        .join("\n");
    return normalize(projected) === normalize(after);
  })()
);
check(
  "38h. v1 and v2 are carried over from 20260802010000 byte-identically",
  (() => {
    const slice = (text, from, to) => {
      const start = text.indexOf(from);
      const end = text.indexOf(to);
      return start >= 0 && end > start ? text.slice(start, end) : null;
    };
    const v1New = slice(ledgerMigration, "IF v_version = 'meal-identification-finalization-v1' THEN", "  -- ====");
    const v1Old = slice(migration, "IF v_version = 'meal-identification-finalization-v1' THEN", "  -- ====");
    const v2New = slice(ledgerMigration, "IF v_version <> 'meal-identification-finalization-v2' THEN", "\n$$;");
    const v2Old = slice(migration, "IF v_version <> 'meal-identification-finalization-v2' THEN", "\n$$;");
    return Boolean(v1New) && Boolean(v2New) && v1New === v1Old && v2New === v2Old;
  })()
);
check(
  "38i. the corrective successor adds no DDL and no policy change",
  !/ALTER TABLE/.test(ledgerMigration) &&
    !/CREATE INDEX/.test(ledgerMigration) &&
    !/CREATE UNIQUE INDEX/.test(ledgerMigration) &&
    !/CREATE POLICY/.test(ledgerMigration) &&
    !/ADD COLUMN/.test(ledgerMigration) &&
    !/DROP /.test(ledgerMigration)
);
check(
  "38j. the corrective successor preserves signature, security context and grants",
  /p_client_request_id uuid,\s*\r?\n\s*p_meal_type public\.meal_type,/.test(ledgerMigration) &&
    /RETURNS jsonb/.test(ledgerMigration) &&
    /LANGUAGE plpgsql/.test(ledgerMigration) &&
    /SECURITY DEFINER/.test(ledgerMigration) &&
    /SET search_path = pg_catalog, public, pg_temp/.test(ledgerMigration) &&
    /GRANT EXECUTE ON FUNCTION public\.finalize_current_user_meal_identification_v1\(/.test(ledgerMigration)
);
check(
  "38k. the Model A canonical rejection and replay ordering are untouched by the correction",
  /pg_catalog\.btrim\(v3_restaurant_id\) <> v3_restaurant_id/.test(ledgerMigration) &&
    ledgerMigration.indexOf("pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id") <
      ledgerMigration.indexOf("v3_fingerprint := pg_catalog.jsonb_build_object") &&
    ledgerMigration.indexOf("SELECT * INTO v_record") <
      ledgerMigration.indexOf("canonical restaurant EXISTENCE validation")
);
check(
  "39. the server request fingerprint still embeds the ENTIRE finalization command",
  /v3_fingerprint := pg_catalog\.jsonb_build_object\([\s\S]{0,400}?'finalization', p_finalization\s*\r?\n\s*\);/.test(migration) &&
    /IF v_record\.request_fingerprint IS DISTINCT FROM v3_fingerprint THEN\s*\r?\n\s*RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';/.test(migration)
);
check(
  "40. that conflict is raised BEFORE any write — the analysis row is only locked afterwards",
  migration.indexOf("RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT'") <
    migration.indexOf("SELECT * INTO v3_analysis") &&
    migration.indexOf("RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT'") <
      migration.indexOf("v3_created := public.create_current_user_meal_record(")
);
check(
  "41. no constraint, index, RLS policy or column is added by this migration",
  !/ALTER TABLE/.test(migration) &&
    !/CREATE INDEX/.test(migration) &&
    !/CREATE UNIQUE INDEX/.test(migration) &&
    !/CREATE POLICY/.test(migration) &&
    !/ADD COLUMN/.test(migration)
);
check(
  "42. the v1 and v2 branches are carried over from the predecessor unmodified",
  (() => {
    const predecessor = read(PREDECESSOR);
    const slice = (text, from, to) => {
      const start = text.indexOf(from);
      const end = text.indexOf(to);
      return start >= 0 && end > start ? text.slice(start, end) : null;
    };
    // v1 branch: from its version test up to the start of the v3 branch.
    const v1New = slice(migration, "IF v_version = 'meal-identification-finalization-v1' THEN", "  -- ====");
    const v1Old = slice(predecessor, "IF v_version = 'meal-identification-finalization-v1' THEN", "  -- ====");
    // v2 branch: everything after the v3 branch ends, up to the end of the function body.
    const v2New = slice(migration, "IF v_version <> 'meal-identification-finalization-v2' THEN", "\n$$;");
    const v2Old = slice(predecessor, "IF v_version <> 'meal-identification-finalization-v2' THEN", "\n$$;");
    return Boolean(v1New) && Boolean(v2New) && v1New === v1Old && v2New === v2Old;
  })()
);

// ============================================================================================
// Scope / candidate hygiene (43-48)
// ============================================================================================
check(
  "43. every already-shipped migration is byte-identical (immutable history)",
  ![...trackedChanged].some((entry) => entry.startsWith("supabase/migrations/"))
);
check(
  // MI-E-C5-R7-B1-R2: 20260802010000 is now COMMITTED (freeze 28f487fa), so it must be tracked and
  // unmodified; the corrective successor is the only new file. Both halves of "history is immutable"
  // are asserted — the shipped one cannot be edited, the new one cannot already be in HEAD.
  // MI-E-C5-R7-B2-R1: 20260802010000 and 20260803010000 are both COMMITTED now, so both must be
  // tracked and unmodified; 20260804010000 is the only new file.
  "44. both shipped successors are tracked+unmodified and the corrective one is genuinely new",
  !trackedChanged.has(MIGRATION) && !untracked.has(MIGRATION) && git(["ls-files", MIGRATION]) === MIGRATION &&
    !trackedChanged.has(LEDGER_MIGRATION) && !untracked.has(LEDGER_MIGRATION) &&
    git(["ls-files", LEDGER_MIGRATION]) === LEDGER_MIGRATION &&
    untracked.has(CONSTRAINT_MIGRATION) && !trackedChanged.has(CONSTRAINT_MIGRATION)
);
check(
  "45. exactly ONE migration is added by this candidate, and it is EXACTLY the constraint path",
  (() => {
    const added = [...untracked].filter((entry) => entry.startsWith("supabase/migrations/"));
    return added.length === 1 && added[0] === CONSTRAINT_MIGRATION;
  })()
);
check(
  "45a. the R2 successor fence uses an EXACT migration allowlist, never a timestamp pattern",
  (() => {
    const r2 = read("scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs");
    return (
      // MI-E-C5-R7-B1-R2: the allowlist is now an EXACT TWO-entry set. Still never a pattern, and
      // the entry count is pinned so a third path cannot be slipped in.
      /const AUTHORIZED_SUCCESSOR_MIGRATIONS = new Set\(\[[\s\S]{0,900}?"supabase\/migrations\/20260802010000_finalize_meal_identification_v3_restaurant_context\.sql",[\s\S]{0,900}?"supabase\/migrations\/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity\.sql",[\s\S]{0,900}?"supabase\/migrations\/20260804010000_relax_ai_candidate_restaurant_identity_constraint\.sql"\s*\r?\n\s*\]\);/.test(r2) &&
      // Counted INSIDE the Set literal only, so a negative fixture that mentions an unauthorized
      // migration path elsewhere in the guard cannot inflate the count.
      (() => {
        const open = r2.indexOf("const AUTHORIZED_SUCCESSOR_MIGRATIONS = new Set([");
        const close = r2.indexOf("]);", open);
        if (open < 0 || close < 0) return false;
        const body = r2.slice(open, close);
        return (body.match(/"supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql"/g) || []).length === 3;
      })() &&
      !/\\d\{14\}_\[a-z0-9_\]\+\\\.sql/.test(r2) &&
      /AUTHORIZED_SUCCESSOR_MIGRATIONS\.has\(entry\)/.test(r2)
    );
  })()
);
check(
  "45b. every historical guard that allows v3Contract.ts also proves only the authorized extension",
  [
    "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs",
    "scripts/meal-identification-finalization-mi-e-c5-b2-ui-guard.mjs",
    "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs",
    "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs",
    "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs",
    "scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs"
  ].every((relative) => {
    const source = read(relative);
    return (
      /function v3ContractOnlyGainedAuthorizedRestaurantExtension\(\) \{/.test(source) &&
      /v3ContractOnlyGainedAuthorizedRestaurantExtension\(\)\s*\r?\n\s*\);/.test(source)
    );
  })
);
check(
  "46. no Edge Function and no packages/shared file is touched",
  ![...trackedChanged, ...untracked].some(
    (entry) => entry.startsWith("supabase/functions/") || entry.startsWith("packages/")
  )
);
check(
  "47. no user-facing restaurant selector or real restaurant-name display is introduced",
  !/選擇餐廳/.test(screen) &&
    !/resolveRestaurantContextPresentation/.test(screen) &&
    /restaurantNameUnknown/.test(screen)
);
check(
  "48. this candidate makes NO claim that the migration was deployed or physically accepted",
  !/deployed to Development|migration applied|physical(ly)? (accepted|PASS)|已部署|實機通過/i.test(migration) &&
    !/deployed to Development|physical(ly)? (accepted|PASS)/i.test(v3)
);
check(
  "49. the R7-A ID-only session model is untouched by this round",
  !trackedChanged.has(SESSION) &&
    /export type AnalysisRestaurantContext = Readonly<\{ restaurantId: string \| null; branchId: string \| null; \}>;/.test(
      session.replace(/\s+/g, " ")
    )
);
check(
  "50. the R6-A runtime operation authority is untouched by this round",
  !trackedChanged.has(RUNTIME) &&
    // Byte-identical to the R6-A freeze commit, not merely "looks right today". Read raw (the
    // shared git() helper trims, which would drop the trailing newline and never match).
    sha(RUNTIME) === crypto.createHash("sha256").update(gitRaw(["show", `HEAD:${RUNTIME}`]), "utf8").digest("hex") &&
    /isBoundToOperation\(/.test(runtime)
);

const failed = checks.filter((entry) => !entry.pass);
console.log(
  JSON.stringify(
    {
      guard: "restaurant-durable-contract-mi-e-c5-r7-b",
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
