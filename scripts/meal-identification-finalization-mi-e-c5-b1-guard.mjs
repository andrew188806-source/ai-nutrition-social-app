#!/usr/bin/env node
// MI-E-C5-B1 static guard: mechanical, regex/structural assertions over the backward-compatible
// v3 extension of finalize_current_user_meal_identification_v1. Companion to
// meal-identification-finalization-mi-e-c5-b1-smoke.mjs (behavioral).
//
// MI-E-C5-B1-R1: the original migration (20260727010000) is now frozen/immutable evidence — its
// SHA-256 is asserted unchanged below. The function it defines is superseded, via a same-name/
// same-signature CREATE OR REPLACE FUNCTION, by a second, additive corrective migration
// (20260728010000) that fixes the confirmed Scenario B root cause (SQLSTATE 42804: a text value
// written into a jsonb column) and strips the temporary debug-suffixed exception handler. All
// MI-E-C5-B1-R3 adds one further local corrective candidate. "Final effective behavior" checks
// below run against that third migration; the two deployed predecessors remain immutable evidence.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: detail ?? null });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function gitSucceeds(args) {
  try {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const C5_B1_FREEZE_COMMIT = "e8141a3c0ec8df428813e25b290dd3365991b590";
const migrationPath = "supabase/migrations/20260727010000_extend_meal_identification_finalization_for_existing_analysis.sql";
const migrationSrc = read(migrationPath);
const correctiveMigrationPath = "supabase/migrations/20260728010000_correct_existing_analysis_finalization_v3.sql";
const acceptedConfirmationMigrationPath =
  "supabase/migrations/20260729010000_persist_user_confirmed_for_accepted_analysis_finalization.sql";
const IMMUTABLE_SHA256 = "e01a2ae044503fdb69008e9b2fe228d6299400bf56b03441083d0f0402e91cf2";
const R1_CORRECTIVE_IMMUTABLE_SHA256 =
  "5efddeb83653ec6508dc69d4a6496ec42f6083ea895b6c53b953f9f1a90b439a";
const R3_ACCEPTED_CONFIRMATION_IMMUTABLE_SHA256 =
  "0a7655a8dbd63d656720a7eea4734786dc13ac82ab5faa5a9a1861322d9b17b8";

// Isolate exactly the v3 IF block's own body (from its own IF header to its own END IF;), never
// the whole function — v1/v2 legitimately still insert a fresh meal_analyses row, and a guard
// that searched the whole function for "insert into meal_analyses" would wrongly flag that
// unrelated, still-correct legacy behavior.
function extractV3Body(src) {
  const startMarker = "IF v_version = 'meal-identification-finalization-v3' THEN";
  const startIndex = src.indexOf(startMarker);
  const endMarker = "\n  IF v_version <> 'meal-identification-finalization-v2' THEN";
  const endIndex = src.indexOf(endMarker, startIndex);
  return startIndex !== -1 && endIndex !== -1 ? src.slice(startIndex, endIndex) : "";
}
function extractFunctionBody(src) {
  const startMarker = "AS $$";
  const start = src.indexOf(startMarker) + startMarker.length;
  const end = src.indexOf("\n$$;", start);
  return start !== -1 && end !== -1 ? src.slice(start, end) : "";
}

const v3Body = extractV3Body(migrationSrc);

record("v3 branch located in the frozen migration (non-empty extracted body)", v3Body.length > 500);

// ---- R1: frozen-migration immutability ----
record(
  "the frozen migration's SHA-256 is exactly unchanged from the value recorded at the start of MI-E-C5-B1-R1",
  crypto.createHash("sha256").update(migrationSrc, "utf8").digest("hex") === IMMUTABLE_SHA256
);

// ---- R1: corrective migration exists and is additive-only (same RPC, no table/constraint edits) ----
const correctiveExists = exists(correctiveMigrationPath);
record("the corrective migration file exists on disk", correctiveExists);

const correctiveSrc = correctiveExists ? read(correctiveMigrationPath) : "";
const r1CorrectiveV3Body = extractV3Body(correctiveSrc);
const acceptedConfirmationExists = exists(acceptedConfirmationMigrationPath);
const acceptedConfirmationSrc = acceptedConfirmationExists ? read(acceptedConfirmationMigrationPath) : "";
const correctiveV3Body = extractV3Body(acceptedConfirmationSrc);

record("the R3 accepted-confirmation corrective migration exists on disk", acceptedConfirmationExists);
record(
  "the deployed R1 corrective migration is byte-for-byte unchanged",
  correctiveExists &&
    crypto.createHash("sha256").update(correctiveSrc, "utf8").digest("hex") ===
      R1_CORRECTIVE_IMMUTABLE_SHA256
);

record(
  "the corrective migration touches only the function (CREATE OR REPLACE FUNCTION + its trailing REVOKE/GRANT/COMMENT) — no ALTER TABLE, CREATE TABLE, DROP TABLE, or CREATE/DROP CONSTRAINT",
  correctiveExists &&
    /CREATE OR REPLACE FUNCTION public\.finalize_current_user_meal_identification_v1/.test(correctiveSrc) &&
    !/ALTER TABLE|CREATE TABLE|DROP TABLE|ADD CONSTRAINT|DROP CONSTRAINT|ADD COLUMN|DROP COLUMN/i.test(correctiveSrc)
);

record(
  "the corrective migration's CREATE OR REPLACE FUNCTION signature is unchanged: (uuid, meal_type, timestamptz, date, text, jsonb)",
  correctiveExists &&
    /CREATE OR REPLACE FUNCTION public\.finalize_current_user_meal_identification_v1\(\s*p_client_request_id uuid,\s*p_meal_type public\.meal_type,\s*p_occurred_at timestamptz,\s*p_meal_date date,\s*p_timezone text,\s*p_finalization jsonb\s*\)/.test(
      correctiveSrc
    )
);

record(
  "the corrective migration creates/replaces exactly one function, the same name as the frozen migration (no second finalize_* function)",
  correctiveExists &&
    (() => {
      const creates = [...correctiveSrc.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(finalize_[a-zA-Z0-9_]*)/g)].map((m) => m[1]);
      return creates.length === 1 && creates[0] === "finalize_current_user_meal_identification_v1";
    })()
);

// ---- R1: the confirmed root-cause fix is actually present ----
record(
  "the corrective migration wraps both v3_candidate_name and v3_meal_name in pg_catalog.to_jsonb(...) at the corrected-branch name_change insert (the confirmed SQLSTATE 42804 fix)",
  correctiveExists &&
    /pg_catalog\.to_jsonb\(v3_candidate_name\), pg_catalog\.to_jsonb\(v3_meal_name\), NULL, pg_catalog\.now\(\)/.test(r1CorrectiveV3Body)
);

// ---- R1: debug instrumentation fully removed; no raw Postgres message ever reaches the client ----
record(
  "the corrective migration's exception handler contains no _DEBUG-suffixed error token",
  correctiveExists && !/_DEBUG/.test(correctiveSrc)
);
// The one legitimate exception is the pre-existing (non-debug, present since before this round)
// typed-code passthrough `RAISE EXCEPTION '%', v_error_message USING ERRCODE = v_error_state;` —
// it only ever re-raises a message this function itself already raised, gated by
// `v_error_message ~ '^[A-Z0-9_]+$'` a few lines above, so it can never carry raw Postgres text.
// The debug leak this checks for always prefixes the placeholder with literal prose (e.g.
// "DURABLE_FINALIZATION_FAILED_DEBUG: %"), so excluding the bare '%' format string is precise.
record(
  "the corrective migration's exception handler never interpolates v_error_message into a prose-prefixed RAISE EXCEPTION message (no raw Postgres text reaches the client) — only the pre-existing bare '%' typed-code passthrough remains",
  correctiveExists && !/RAISE EXCEPTION '(?!%')[^']*%[^']*'\s*,\s*v_error_message/.test(correctiveSrc)
);
record(
  "the corrective migration's final ELSE branch raises the same safe, generic DURABLE_FINALIZATION_FAILED (23514) as the 23503/23514 branch, exactly matching the pre-debug design",
  correctiveExists &&
    (correctiveSrc.match(/RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';/g) ?? []).length === 2
);

// ---- R1: no other drift — the corrective body equals the frozen body with ONLY the two documented
// fixes applied. This is a strong regression guard: normalizes both bodies (line comments and
// blank lines stripped, so the extra explanatory comments this migration adds don't count as
// drift), reverses the two known fixes in the corrective copy, and asserts byte-for-byte equality
// against the frozen original — any unintended additional change fails this check.
function normalize(body) {
  return body
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trimEnd())
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
const oldFnNorm = normalize(extractFunctionBody(migrationSrc));
const correctiveFnNormRaw = correctiveExists ? normalize(extractFunctionBody(correctiveSrc)) : "";
const correctiveFnNormReversed = correctiveFnNormRaw
  .replace(
    "pg_catalog.to_jsonb(v3_candidate_name), pg_catalog.to_jsonb(v3_meal_name), NULL, pg_catalog.now(),",
    "v3_candidate_name, v3_meal_name, NULL, pg_catalog.now(),"
  )
  .replace(
    "RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';\nELSIF v_error_state = '42501' THEN",
    "RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED_DEBUG: %', v_error_message USING ERRCODE = '23514';\nELSIF v_error_state = '42501' THEN"
  )
  .replace(
    "ELSE\nRAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';\nEND IF;\nEND;",
    "ELSE\nRAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED_ELSE_DEBUG: % (sqlstate %)', v_error_message, v_error_state USING ERRCODE = '23514';\nEND IF;\nEND;"
  );
record(
  "the corrective migration's function body is identical to the frozen migration's, once normalized, except exactly the two documented fixes (to_jsonb wrap + debug-suffix removal)",
  correctiveExists && oldFnNorm === correctiveFnNormReversed,
  correctiveExists && oldFnNorm === correctiveFnNormReversed ? null : "normalized bodies diverge beyond the two documented fixes"
);

record(
  "the R3 migration creates/replaces exactly the same RPC with the unchanged six-parameter signature",
  acceptedConfirmationExists &&
    (() => {
      const creates = [
        ...acceptedConfirmationSrc.matchAll(
          /CREATE (?:OR REPLACE )?FUNCTION public\.(finalize_[a-zA-Z0-9_]*)/g
        )
      ].map((match) => match[1]);
      return creates.length === 1 && creates[0] === "finalize_current_user_meal_identification_v1";
    })() &&
    /CREATE OR REPLACE FUNCTION public\.finalize_current_user_meal_identification_v1\(\s*p_client_request_id uuid,\s*p_meal_type public\.meal_type,\s*p_occurred_at timestamptz,\s*p_meal_date date,\s*p_timezone text,\s*p_finalization jsonb\s*\)/.test(
      acceptedConfirmationSrc
    )
);

record(
  "the R3 migration adds only the explicit confirmation-event shape constraint, its partial unique index, comments, and the same RPC replacement (no table/column/drop/grant expansion)",
  acceptedConfirmationExists &&
    /ADD CONSTRAINT meal_corrections_user_confirmed_event_shape_check/.test(acceptedConfirmationSrc) &&
    /CREATE UNIQUE INDEX meal_corrections_accepted_confirmation_unique/.test(acceptedConfirmationSrc) &&
    !/ADD COLUMN|DROP (?:TABLE|COLUMN|CONSTRAINT)|CREATE TABLE|GRANT\s+(?:INSERT|UPDATE|DELETE)/i.test(
      acceptedConfirmationSrc
    )
);

const r3FnNormRaw = acceptedConfirmationExists
  ? normalize(extractFunctionBody(acceptedConfirmationSrc))
  : "";
const r3FnNormReversed = r3FnNormRaw.replace(
  /IF v3_confirmation_mode = 'accepted' THEN\nINSERT INTO public\.meal_corrections \(\nuser_id, meal_analysis_id, meal_record_item_id, correction_type,\nbefore_value, after_value, correction_reason, corrected_at,\ncorrection_ordinal, verification_status\n\) VALUES \(\nv_user_id, v_analysis_id, v3_item_id, 'confirmation',\nNULL, pg_catalog\.jsonb_build_object\('confirmationMode', 'accepted'\), NULL, pg_catalog\.now\(\),\nv3_correction_ordinal, 'user_confirmed'\n\);\nELSIF v3_confirmation_mode = 'corrected' THEN/,
  "IF v3_confirmation_mode = 'corrected' THEN"
);
record(
  "the R3 function body is byte-equivalent after normalization to the deployed R1 corrective body except for the one accepted-confirmation INSERT",
  r3FnNormReversed === correctiveFnNormRaw,
  r3FnNormReversed === correctiveFnNormRaw
    ? null
    : "R3 function drift exceeds the accepted-confirmation INSERT"
);

// ---- Mobile source scope (v3 contract/mapper/error files only — no UI) ----
const v3ContractSrc = read("apps/mobile/features/meal-identification-finalization/v3Contract.ts");
const typesSrc = read("apps/mobile/features/meal-identification-finalization/types.ts");
const errorsSrc = read("apps/mobile/features/meal-identification-finalization/errors.ts");
const mappersSrc = read("apps/mobile/features/meal-identification-finalization/mealIdentificationFinalizationMappers.ts");
const supabaseAdapterSrc = read("apps/mobile/features/meal-identification-finalization/adapters/supabaseConsumerMealIdentificationFinalizationRepository.ts");
const supabaseContractsSrc = read("apps/mobile/features/meal-identification-finalization/supabaseMealIdentificationFinalizationContracts.ts");

// 1. still exactly one authoritative RPC name referenced anywhere in Mobile
record(
  "Mobile references exactly one finalization RPC name (finalize_current_user_meal_identification_v1) and no second RPC",
  (() => {
    try {
      const grep = git(["grep", "--untracked", "-ohE", '"finalize[a-zA-Z0-9_]*"', "--", "apps/mobile"]);
      const names = new Set(grep.split("\n").filter(Boolean).map((l) => l.replace(/"/g, "")));
      const finalizeRpcNames = [...names].filter((n) => n.startsWith("finalize_"));
      return finalizeRpcNames.length === 1 && finalizeRpcNames[0] === "finalize_current_user_meal_identification_v1";
    } catch {
      return false;
    }
  })()
);

// 2. no second finalization function created in either migration
record(
  "the frozen migration creates/replaces exactly one function named finalize_current_user_meal_identification_v1 (no finalize_*_v2/_v3 function)",
  (() => {
    const creates = [...migrationSrc.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(finalize_[a-zA-Z0-9_]*)/g)].map((m) => m[1]);
    return creates.length === 1 && creates[0] === "finalize_current_user_meal_identification_v1";
  })()
);

// 3. same RPC signature (6 params, same types/order) preserved in the frozen migration
record(
  "the frozen migration's CREATE OR REPLACE FUNCTION signature is unchanged: (uuid, meal_type, timestamptz, date, text, jsonb)",
  /CREATE OR REPLACE FUNCTION public\.finalize_current_user_meal_identification_v1\(\s*p_client_request_id uuid,\s*p_meal_type public\.meal_type,\s*p_occurred_at timestamptz,\s*p_meal_date date,\s*p_timezone text,\s*p_finalization jsonb\s*\)/.test(
    migrationSrc
  )
);

// 4. v3 contract version literal exists
record(
  "the v3 contract version literal 'meal-identification-finalization-v3' exists in the R3 effective migration",
  acceptedConfirmationSrc.includes("meal-identification-finalization-v3")
);

// ---- The following checks assert properties of the R3 effective local candidate, so they run
// against its v3 body (correctiveV3Body), not either deployed predecessor.

// 5. v3 uses the EXISTING analysis row (looked up by analysis_request_id, not a client-supplied id)
record(
  "the v3 branch looks up the existing analysis row by analysis_request_id",
  /SELECT \* INTO v3_analysis\s*FROM public\.meal_analyses\s*WHERE analysis_request_id = v3_analysis_request_id/.test(correctiveV3Body)
);

// 6. v3 locks the analysis row
record(
  "the v3 branch locks the analysis row with FOR UPDATE",
  /FROM public\.meal_analyses\s*WHERE analysis_request_id = v3_analysis_request_id\s*FOR UPDATE/.test(correctiveV3Body)
);

// 7. v3 never inserts a new analysis row (checked ONLY within the extracted v3 body)
record(
  "the v3 branch contains no INSERT INTO meal_analyses (never a second analysis row)",
  !/INSERT INTO public\.meal_analyses/i.test(correctiveV3Body)
);

// 8. v3 links the analysis to the new meal record via UPDATE
record(
  "the v3 branch links the existing analysis row via UPDATE ... SET meal_record_id",
  /UPDATE public\.meal_analyses\s*SET meal_record_id = v3_record_id/.test(correctiveV3Body)
);

// 9. v3 validates ownership (user_id match)
record(
  "the v3 branch rejects a foreign-actor analysis (v3_analysis.user_id <> v_user_id)",
  /IF v3_analysis\.user_id <> v_user_id THEN\s*RAISE EXCEPTION 'ANALYSIS_ACCESS_DENIED'/.test(correctiveV3Body)
);

// 10. v3 validates the selected candidate against stored detected_items
record(
  "the v3 branch resolves the selected candidate from the analysis row's own detected_items (not a client-supplied snapshot)",
  /FROM pg_catalog\.jsonb_array_elements\(v3_analysis\.detected_items\) AS elem\s*WHERE elem ->> 'candidateId' = v3_selected_candidate_id::text/.test(
    correctiveV3Body
  )
);

// 11/12. accepted/corrected are derived server-side by diffing, never trusted from the client
record(
  "confirmation_mode is computed server-side (v3_confirmation_mode assigned from a diff, never read from the client payload)",
  /v3_confirmation_mode := 'accepted'/.test(correctiveV3Body) &&
    /v3_confirmation_mode := 'corrected'/.test(correctiveV3Body) &&
    !/p_finalization ->> 'confirmationMode'/.test(correctiveV3Body)
);

// 13. manual supported without a fake candidate
record(
  "manual mode (selectedCandidateId null) never fabricates a candidate — v3_candidate stays NULL",
  /v3_confirmation_mode := 'manual';\s*v3_manual_reason := 'none_of_the_above';\s*v3_candidate := NULL;/.test(correctiveV3Body)
);

// 14. accepted must persist explicit user_confirmed evidence — confirmation_mode alone is not
// sufficient and row absence is not evidence.
record(
  "accepted persists an explicit confirmation event with verification_status=user_confirmed",
  /IF v3_confirmation_mode = 'accepted' THEN\s*INSERT INTO public\.meal_corrections[\s\S]{0,500}'confirmation',\s*NULL, pg_catalog\.jsonb_build_object\('confirmationMode', 'accepted'\), NULL, pg_catalog\.now\(\),\s*v3_correction_ordinal, 'user_confirmed'/.test(
    correctiveV3Body
  )
);
record(
  "accepted evidence is not a fake edited field: its type is confirmation, before_value is NULL, and after_value is an event payload",
  /verification_status <> 'user_confirmed'\s*OR correction_type <> 'confirmation'\s*OR \(\s*correction_type = 'confirmation'\s*AND before_value IS NULL\s*AND after_value = '\{\"confirmationMode\":\"accepted\"\}'::jsonb\s*AND correction_reason IS NULL/.test(
    acceptedConfirmationSrc
  ) &&
    !/v3_confirmation_mode = 'accepted'[\s\S]{0,700}'(?:name_change|nutrition_override|ingredient_adjustment|portion_adjustment)'/.test(
      correctiveV3Body
    )
);
record(
  "accepted confirmation evidence has DB-level at-most-once protection per analysis",
  /CREATE UNIQUE INDEX meal_corrections_accepted_confirmation_unique\s*ON public\.meal_corrections \(meal_analysis_id\)\s*WHERE correction_type = 'confirmation'\s*AND verification_status = 'user_confirmed'/.test(
    acceptedConfirmationSrc
  )
);
record(
  "corrected/manual branches never create user_confirmed events",
  (() => {
    const correctedStart = correctiveV3Body.indexOf("ELSIF v3_confirmation_mode = 'corrected' THEN");
    const ledgerStart = correctiveV3Body.indexOf("UPDATE public.meal_record_items", correctedStart);
    const correctedAndManual = correctiveV3Body.slice(correctedStart, ledgerStart);
    return correctedStart !== -1 && ledgerStart !== -1 && !/'user_confirmed'/.test(correctedAndManual);
  })()
);

// 15. user_corrected mapping present
record(
  "corrected/manual correction rows use verification_status = user_corrected",
  (correctiveV3Body.match(/'user_corrected'/g) ?? []).length >= 2
);

// 16. no nutritionist_reviewed anywhere in either migration
record(
  "none of the three migrations ever writes nutritionist_reviewed",
  !/nutritionist_reviewed/i.test(migrationSrc.replace(/-- .*$/gm, "")) &&
    !/nutritionist_reviewed/i.test(correctiveSrc.replace(/-- .*$/gm, "")) &&
    !/nutritionist_reviewed/i.test(acceptedConfirmationSrc.replace(/-- .*$/gm, ""))
);

// 17. no verified-nutrition claim anywhere in the v3 branch or Mobile v3 contract
record(
  "no verified/restaurant_verified/catalog_authoritative nutrition claim in the v3 branch or Mobile v3 contract",
  !/verified_nutrition|restaurant_verified|nutritionist_reviewed|catalog_authoritative/i.test(correctiveV3Body) &&
    !/verified_nutrition|restaurant_verified|nutritionist_reviewed|catalog_authoritative/i.test(v3ContractSrc)
);

// 18. original AI observation preserved (detected_items never overwritten by v3)
record(
  "the v3 branch never UPDATEs meal_analyses.detected_items (the original AI observation is preserved)",
  !/SET[\s\S]{0,200}detected_items/i.test(correctiveV3Body)
);

// 19. same analysis cannot create a second meal (meal_record_id IS NOT NULL / IS NULL guards present)
record(
  "the v3 branch rejects an already-linked analysis both before and during the linking UPDATE (meal_record_id IS NOT NULL / IS NULL guards)",
  /IF v3_analysis\.meal_record_id IS NOT NULL THEN\s*RAISE EXCEPTION 'ANALYSIS_ALREADY_FINALIZED'/.test(correctiveV3Body) &&
    /AND meal_record_id IS NULL;/.test(correctiveV3Body) &&
    /RAISE EXCEPTION 'ANALYSIS_ALREADY_FINALIZED' USING ERRCODE = '23505';\s*END IF;\s*v_analysis_id := v3_analysis\.id;/.test(correctiveV3Body)
);

// 20. same client request replay is safe (idempotency fingerprint replay path present)
record(
  "the v3 branch has its own client_request_id replay path returning replayed:true without re-writing",
  /IF v_record\.request_fingerprint IS DISTINCT FROM v3_fingerprint THEN\s*RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT'/.test(correctiveV3Body) &&
    /'replayed', true,/.test(correctiveV3Body)
);

// 21. different payload under the same client_request_id conflicts safely
record(
  "a different payload under the same client_request_id raises IDEMPOTENCY_KEY_CONFLICT before any write",
  /IF v_record\.request_fingerprint IS DISTINCT FROM v3_fingerprint THEN/.test(correctiveV3Body)
);

// 22. actual meal time preserved (occurredAt cross-checked against p_occurred_at)
record(
  "the v3 branch cross-validates the JSON occurredAt against the RPC's own p_occurred_at parameter",
  /IF v_command_occurred_at IS DISTINCT FROM p_occurred_at THEN\s*RAISE EXCEPTION 'INVALID_FINALIZATION'/.test(correctiveV3Body)
);

// 23. source context preserved (stored into both legacy and canonical columns)
record(
  "the v3 branch stores the real sourceContext into both source_context and meal_source_context (never overwritten with a finalization-time guess)",
  /v_source_context, 'ai_candidate', NULL,[\s\S]{0,120}v_source_context, v_record_timing, p_occurred_at, v3_confirmation_mode/.test(correctiveV3Body)
);

// 24. no direct Mobile table writes anywhere in the finalization feature folder
record(
  "no Mobile file under meal-identification-finalization/ performs a direct table write (only .rpc( calls)",
  !/\.from\(\s*["'](meal_records|meal_record_items|meal_analyses|meal_corrections|meal_identification_finalizations)["']\s*\)\s*\.(insert|update|delete|upsert)\(/.test(
    supabaseAdapterSrc + v3ContractSrc + typesSrc
  )
);

// 25. Successor-compatible Mobile handoff authority. C5-B2 and later stages may legitimately
// change analysis.tsx, so protect the frozen B1 semantics instead of the old workspace topology.
const analysisScreenSrc = read("apps/mobile/app/analysis.tsx");
const analysisAdapterSrc = read("apps/mobile/features/analysis/mealIdentificationFinalizationAdapter.ts");
const finalizationRuntimeSrc = read(
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts"
);
const authorityRelevantMobileSrc = [
  analysisScreenSrc,
  analysisAdapterSrc,
  finalizationRuntimeSrc,
  v3ContractSrc
]
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

record(
  "the C5-B1 freeze commit remains an ancestor authority of the current candidate",
  gitSucceeds(["merge-base", "--is-ancestor", C5_B1_FREEZE_COMMIT, "HEAD"])
);
record(
  "analysis preserves the C5-B1 adapter-to-runtime finalization handoff while allowing successor UI edits",
  analysisScreenSrc.includes("buildAnalysisMealIdentificationFinalizationDraft({") &&
    analysisScreenSrc.includes("await consumerRuntime.finalizeMealIdentification(adapted.value)") &&
    analysisAdapterSrc.includes("buildMealIdentificationFinalization({") &&
    finalizationRuntimeSrc.includes(
      "this.options.service.finalizeCurrentUserMealIdentification(operation.input)"
    )
);
record(
  "the runtime preserves stable request identity and persists the atomic operation before service execution/replay",
  /const clientRequestId =\s*draft\.clientRequestId \?\?/.test(finalizationRuntimeSrc) &&
    finalizationRuntimeSrc.indexOf("await this.options.operationStore.save(actorKey, operation)") !== -1 &&
    finalizationRuntimeSrc.indexOf("this.options.service.finalizeCurrentUserMealIdentification(operation.input)") !==
      -1 &&
    finalizationRuntimeSrc.indexOf("await this.options.operationStore.save(actorKey, operation)") <
      finalizationRuntimeSrc.indexOf(
        "this.options.service.finalizeCurrentUserMealIdentification(operation.input)"
      ) &&
    /const operation = this\.pending;[\s\S]{0,300}this\.execute\(context\.actorKey, context\.actorGeneration, operation\)/.test(
      finalizationRuntimeSrc
    )
);
record(
  "Mobile request construction does not send server-owned confirmation, verification, nutrition, training, licensing, or provider authority",
  !/\b(?:confirmationMode|verificationStatus|nutritionSource|userConfirmed|userCorrected|trainingEligible|trainingConsent|restaurantCommercialPermission|restaurantCommercialGrant|providerAuthority)\s*:/.test(
    authorityRelevantMobileSrc
  ) &&
    !/OPENAI_API_KEY|MEAL_PHOTO_ANALYSIS_ADMIN_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(
      authorityRelevantMobileSrc
    )
);

// 26. no Edge Function changes
record(
  "no file under supabase/functions/ has a diff in this round's git status",
  (() => {
    try {
      const status = git(["status", "--porcelain", "--", "supabase/functions"]);
      return status.trim().length === 0;
    } catch {
      return true;
    }
  })()
);

// 27. no training pipeline / dataset language introduced
record(
  "no training-dataset or model-artifact reference introduced by this round's files",
  !/training-dataset|model-artifact|dataset-export|trainingEligible|trainingConsent/i.test(
    migrationSrc + correctiveSrc + acceptedConfirmationSrc + v3ContractSrc
  )
);

// 28. no restaurant commercial-licensing language introduced
record(
  "no restaurant commercial-licensing reference introduced by this round's files",
  !/commercial[_-]?licens|restaurantCommercialPermission|restaurantCommercialGrant/i.test(
    migrationSrc + correctiveSrc + acceptedConfirmationSrc + v3ContractSrc
  )
);

// 29. no provider/model key referenced anywhere in Mobile v3 files
record(
  "no OPENAI_API_KEY / MEAL_PHOTO_ANALYSIS_ADMIN_KEY / SUPABASE_SERVICE_ROLE_KEY referenced in the v3 Mobile files",
  !/OPENAI_API_KEY|MEAL_PHOTO_ANALYSIS_ADMIN_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(v3ContractSrc + typesSrc + errorsSrc + mappersSrc + supabaseContractsSrc)
);

// 30. previous C1/C3/C4/C5-A guards still pass in full
record(
  "the MI-E-C1, MI-E-C3, MI-E-C4, and MI-E-C5-A guards all still pass in full",
  (() => {
    const runGuard = (scriptPath) => {
      try {
        return execFileSync("node", [scriptPath], { cwd: root, encoding: "utf8" });
      } catch (err) {
        if (typeof err.stdout === "string") return err.stdout;
        throw err;
      }
    };
    const fullPass = (output) => {
      const match = output.match(/RESULT (\d+)\/(\d+) PASS/);
      return Boolean(match) && match[1] === match[2];
    };
    try {
      return (
        fullPass(runGuard("scripts/meal-photo-analysis-mi-e-c1-guard.mjs")) &&
        fullPass(runGuard("scripts/meal-photo-upload-mi-e-c3-guard.mjs")) &&
        fullPass(runGuard("scripts/meal-photo-analysis-edge-function-mi-e-c4-guard.mjs")) &&
        fullPass(runGuard("scripts/meal-photo-analysis-mobile-mi-e-c5-a-guard.mjs"))
      );
    } catch {
      return false;
    }
  })()
);

// 31. deferred migration absent from active queue
record(
  "the deferred P2V-PERF migration is not present in the active supabase/migrations/ queue",
  !fs.readdirSync(path.join(root, "supabase", "migrations")).some((name) => name.includes("20260722010000"))
);

// 32. Post-freeze migration authority: the three files are tracked immutable evidence, not
// pre-freeze workspace additions. Preserve paths, exact bytes, and the absence of migration drift.
const frozenMigrationPaths = [
  migrationPath,
  correctiveMigrationPath,
  acceptedConfirmationMigrationPath
];

record(
  "the three frozen C5-B1 migration authorities exist at their expected paths and are Git tracked",
  frozenMigrationPaths.every((migration) => exists(migration)) &&
    frozenMigrationPaths.every((migration) =>
      gitSucceeds(["ls-files", "--error-unmatch", "--", migration])
    )
);
record(
  "all three frozen C5-B1 migration SHA-256 values are exactly unchanged",
  crypto.createHash("sha256").update(migrationSrc, "utf8").digest("hex") === IMMUTABLE_SHA256 &&
    crypto.createHash("sha256").update(correctiveSrc, "utf8").digest("hex") ===
      R1_CORRECTIVE_IMMUTABLE_SHA256 &&
    crypto.createHash("sha256").update(acceptedConfirmationSrc, "utf8").digest("hex") ===
      R3_ACCEPTED_CONFIRMATION_IMMUTABLE_SHA256
);
record(
  "current HEAD preserves all three migration blobs from the C5-B1 freeze commit",
  gitSucceeds(["diff", "--quiet", C5_B1_FREEZE_COMMIT, "HEAD", "--", ...frozenMigrationPaths])
);
record(
  "the working tree content of all three migrations matches the C5-B1 freeze commit",
  gitSucceeds(["diff", "--quiet", C5_B1_FREEZE_COMMIT, "--", ...frozenMigrationPaths])
);
record(
  "the index contains no staged modification of the three frozen migrations",
  gitSucceeds(["diff", "--cached", "--quiet", "--", ...frozenMigrationPaths])
);
record(
  "the working tree contains no unstaged modification of the three frozen migrations",
  gitSucceeds(["diff", "--quiet", "--", ...frozenMigrationPaths])
);

// 33. no anon/authenticated direct table grant widened
record(
  "none of the three migrations GRANTs INSERT/UPDATE/DELETE on meal_records/meal_record_items/meal_analyses/meal_corrections to anon or authenticated",
  !/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]{0,80}(meal_records|meal_record_items|meal_analyses|meal_corrections)[\s\S]{0,40}TO\s+(anon|authenticated)/i.test(
    migrationSrc
  ) &&
    !/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]{0,80}(meal_records|meal_record_items|meal_analyses|meal_corrections)[\s\S]{0,40}TO\s+(anon|authenticated)/i.test(
      correctiveSrc
    ) &&
    !/GRANT\s+(INSERT|UPDATE|DELETE)[\s\S]{0,80}(meal_records|meal_record_items|meal_analyses|meal_corrections)[\s\S]{0,40}TO\s+(anon|authenticated)/i.test(
      acceptedConfirmationSrc
    )
);

// 34. all migrations are additive only — no DROP TABLE / DROP COLUMN
record(
  "none of the three migrations contains a DROP TABLE or DROP COLUMN",
  !/DROP TABLE|DROP COLUMN/i.test(migrationSrc) &&
    !/DROP TABLE|DROP COLUMN/i.test(correctiveSrc) &&
    !/DROP TABLE|DROP COLUMN/i.test(acceptedConfirmationSrc)
);

const passCount = results.filter((r) => r.pass).length;
for (const result of results) {
  console.log(`${result.pass ? "PASS" : "FAIL"} — ${result.name}`);
  if (!result.pass && result.detail) console.log(`  detail: ${result.detail}`);
}
console.log(`RESULT ${passCount}/${results.length} PASS`);
if (passCount !== results.length) process.exit(1);
