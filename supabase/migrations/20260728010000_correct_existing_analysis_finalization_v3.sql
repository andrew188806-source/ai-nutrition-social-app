BEGIN;

-- MI-E-C5-B1-R1: additive correction to the v3 branch introduced by
-- 20260727010000_extend_meal_identification_finalization_for_existing_analysis.sql (which is left
-- byte-for-byte untouched — this file supersedes its function body only, via CREATE OR REPLACE
-- FUNCTION on the same name/signature, and never re-declares that file's PART 1 table/constraint
-- changes, which are already correct and remain in place unmodified).
--
-- Root cause fixed (isolated via a single controlled diagnostic invocation, SQLSTATE 42804):
-- the 'corrected' branch's name_change meal_corrections INSERT wrote the text variables
-- v3_candidate_name / v3_meal_name directly into the jsonb columns before_value / after_value.
-- Postgres has no implicit text->jsonb cast, so this raised a raw datatype-mismatch error on
-- every Scenario B (corrected, name changed) finalization. The manual branch already wrapped its
-- own after_value with pg_catalog.to_jsonb(...) — this migration applies the same wrap to the
-- corrected branch's name_change insert. No other statement in the v3 branch is changed.
--
-- This migration also removes the temporary diagnostic-instrumented exception handler that
-- 20260727010000 shipped with, which interpolated the raw Postgres error message text into the
-- client-visible exception. The handler is restored to the original safe, generic, non-leaking
-- error-code mapping.

CREATE OR REPLACE FUNCTION public.finalize_current_user_meal_identification_v1(
  p_client_request_id uuid,
  p_meal_type public.meal_type,
  p_occurred_at timestamptz,
  p_meal_date date,
  p_timezone text,
  p_finalization jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_version text;
  v_source_context text;
  v_record_timing text;
  v_command_occurred_at timestamptz;
  v_legacy_finalization jsonb;
  v_result jsonb;
  v_record public.meal_records%ROWTYPE;
  v_finalization_id uuid;
  v_item_id uuid;
  v_analysis_id uuid;
  v_stored_contract_version text;
  v_stored_command jsonb;
  v_stored_source text;
  v_stored_timing text;
  v_stored_occurred_at timestamptz;
  v_correction_ids jsonb;
  v_correction_count integer;
  v_error_state text;
  v_error_message text;
  -- MI-E-C5-B1 v3-only declarations (prefixed v3_ to keep every existing v1/v2
  -- variable name and usage completely untouched).
  v3_analysis_request_id uuid;
  v3_selected_candidate_id uuid;
  v3_meal_write jsonb;
  v3_analysis public.meal_analyses%ROWTYPE;
  v3_candidate jsonb;
  v3_confirmation_mode text;
  v3_meal_name text;
  v3_components jsonb;
  v3_portion text;
  v3_nutrition jsonb;
  v3_legacy_nutrition jsonb;
  v3_manual_reason text;
  v3_key text;
  v3_value jsonb;
  v3_component jsonb;
  v3_component_count integer;
  v3_candidate_name text;
  v3_candidate_components jsonb;
  v3_candidate_nutrition jsonb;
  v3_names_match boolean;
  v3_components_match boolean;
  v3_nutrition_match boolean;
  v3_nutrition_source text;
  v3_source public.meal_source_type;
  v3_is_self_cooked boolean;
  v3_items jsonb;
  v3_created jsonb;
  v3_record_id uuid;
  v3_item_id uuid;
  v3_finalization_id uuid;
  v3_correction_ordinal integer;
  v3_existing_finalization_id uuid;
  v3_existing_item_id uuid;
  v3_existing_correction_ids jsonb;
  v3_fingerprint jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF pg_catalog.jsonb_typeof(p_finalization) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF p_client_request_id IS NULL
     OR pg_catalog.substr(p_client_request_id::text, 15, 1) <> '4'
     OR p_meal_type IS NULL
     OR p_occurred_at IS NULL
     OR p_meal_date IS NULL
     OR p_timezone IS NULL
     OR pg_catalog.btrim(p_timezone) = ''
     OR pg_catalog.length(pg_catalog.btrim(p_timezone)) > 64 THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  v_version := p_finalization ->> 'version';
  IF v_version = 'meal-identification-finalization-v1' THEN
    v_source_context := p_finalization -> 'selection' ->> 'sourceContext';
    v_result := public.finalize_current_user_meal_identification_v1_legacy_internal(
      p_client_request_id,
      p_meal_type,
      p_occurred_at,
      p_meal_date,
      p_timezone,
      p_finalization
    );

    UPDATE public.meal_identification_finalizations
    SET
      meal_source_context = CASE
        WHEN v_source_context = 'post_hoc' THEN 'unknown'
        ELSE v_source_context
      END,
      record_timing = CASE
        WHEN v_source_context = 'post_hoc' THEN 'post_hoc'
        ELSE 'current'
      END,
      occurred_at = p_occurred_at
    WHERE id = (v_result ->> 'meal_identification_finalization_id')::uuid
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;
    RETURN v_result;
  END IF;

  -- ==========================================================================
  -- MI-E-C5-B1: v3 branch. Links a new meal record to an EXISTING meal_analyses
  -- row instead of ever inserting a new one. The client's confirmed values are
  -- diffed here, server-side, against the selected candidate's own stored
  -- canonical values from detected_items — the client can never assert
  -- confirmation_mode/verification_status/nutritionSource directly, and any
  -- attempt to send those or an originalAnalysis/mealRecordId/mealAnalysisId
  -- field is rejected as FORBIDDEN_FIELD before anything else is evaluated.
  -- ==========================================================================
  IF v_version = 'meal-identification-finalization-v3' THEN
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
      'analysisRequestId', 'captureMethod', 'mealWrite', 'occurredAt',
      'recordTiming', 'selectedCandidateId', 'sourceContext', 'version'
    ]::text[] THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF p_finalization ?| ARRAY[
      'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
      'originalAnalysis', 'verificationStatus', 'confirmationMode', 'nutritionSource'
    ] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_finalization -> 'analysisRequestId') <> 'string' THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v3_analysis_request_id := (p_finalization ->> 'analysisRequestId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_FOUND' USING ERRCODE = '22023';
    END;

    IF p_finalization -> 'selectedCandidateId' = 'null'::jsonb THEN
      v3_selected_candidate_id := NULL;
    ELSIF pg_catalog.jsonb_typeof(p_finalization -> 'selectedCandidateId') = 'string' THEN
      BEGIN
        v3_selected_candidate_id := (p_finalization ->> 'selectedCandidateId')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_CANDIDATE' USING ERRCODE = '22023';
      END;
    ELSE
      RAISE EXCEPTION 'INVALID_CANDIDATE' USING ERRCODE = '22023';
    END IF;

    v_source_context := p_finalization ->> 'sourceContext';
    IF v_source_context NOT IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown') THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    v_record_timing := p_finalization ->> 'recordTiming';
    IF v_record_timing NOT IN ('current', 'post_hoc') THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_finalization -> 'occurredAt') <> 'string'
       OR pg_catalog.btrim(p_finalization ->> 'occurredAt') <> p_finalization ->> 'occurredAt' THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_command_occurred_at := (p_finalization ->> 'occurredAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END;
    IF v_command_occurred_at IS DISTINCT FROM p_occurred_at THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF p_finalization -> 'captureMethod' <> 'null'::jsonb
       AND (p_finalization ->> 'captureMethod') NOT IN ('camera', 'photo_library') THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    v3_meal_write := p_finalization -> 'mealWrite';
    IF pg_catalog.jsonb_typeof(v3_meal_write) <> 'object'
       OR (
         SELECT pg_catalog.array_agg(key ORDER BY key)
         FROM pg_catalog.jsonb_object_keys(v3_meal_write) AS keys(key)
       ) IS DISTINCT FROM ARRAY['components', 'mealName', 'nutrition', 'portion']::text[] THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v3_meal_write -> 'mealName') <> 'string' THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    v3_meal_name := pg_catalog.btrim(v3_meal_write ->> 'mealName');
    IF pg_catalog.length(v3_meal_name) = 0 OR pg_catalog.length(v3_meal_name) > 160 THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;

    IF v3_meal_write -> 'portion' <> 'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v3_meal_write -> 'portion') <> 'string' THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      v3_portion := NULLIF(pg_catalog.btrim(v3_meal_write ->> 'portion'), '');
      IF v3_portion IS NOT NULL AND pg_catalog.length(v3_portion) > 200 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
    ELSE
      v3_portion := NULL;
    END IF;

    IF pg_catalog.jsonb_typeof(v3_meal_write -> 'components') <> 'array' THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    v3_component_count := pg_catalog.jsonb_array_length(v3_meal_write -> 'components');
    IF v3_component_count > 12 THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    v3_components := '[]'::jsonb;
    FOR v3_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v3_meal_write -> 'components')
    LOOP
      IF pg_catalog.jsonb_typeof(v3_component) <> 'string' THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF pg_catalog.length(pg_catalog.btrim(v3_component #>> '{}')) = 0 THEN
        CONTINUE; -- empty component entries are silently dropped, never rejected
      END IF;
      IF pg_catalog.length(pg_catalog.btrim(v3_component #>> '{}')) > 200 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      v3_components := v3_components || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(pg_catalog.btrim(v3_component #>> '{}')));
    END LOOP;

    v3_nutrition := v3_meal_write -> 'nutrition';
    IF pg_catalog.jsonb_typeof(v3_nutrition) <> 'object' THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    FOR v3_key, v3_value IN SELECT key, value FROM pg_catalog.jsonb_each(v3_nutrition)
    LOOP
      IF v3_key NOT IN ('calories', 'proteinGrams', 'carbsGrams', 'fatGrams') THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF pg_catalog.jsonb_typeof(v3_value) <> 'number' THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF (v3_value #>> '{}')::numeric < 0 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF v3_key = 'calories' AND (v3_value #>> '{}')::numeric > 20000 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF v3_key <> 'calories' AND (v3_value #>> '{}')::numeric > 2000 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- ---- idempotency (same advisory-lock + fingerprint pattern as v1/v2) ----
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
    );

    v3_fingerprint := pg_catalog.jsonb_build_object(
      'operation', 'finalize_current_user_meal_identification_v1',
      'rpcContractVersion', 3,
      'mealType', p_meal_type::text,
      'occurredAt', p_occurred_at,
      'mealDate', p_meal_date,
      'timezone', pg_catalog.btrim(p_timezone),
      'finalization', p_finalization
    );

    SELECT * INTO v_record
    FROM public.meal_records
    WHERE user_id = v_user_id
      AND client_request_id = p_client_request_id;

    IF FOUND THEN
      IF v_record.request_fingerprint IS DISTINCT FROM v3_fingerprint THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
      END IF;

      SELECT finalization.id, finalization.meal_record_item_id, finalization.meal_analysis_id
      INTO v3_existing_finalization_id, v3_existing_item_id, v_analysis_id
      FROM public.meal_identification_finalizations AS finalization
      WHERE finalization.meal_record_id = v_record.id
        AND finalization.user_id = v_user_id
        AND finalization.contract_version = 'meal-identification-finalization-v3';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
      END IF;

      SELECT COALESCE(pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal), '[]'::jsonb)
      INTO v3_existing_correction_ids
      FROM public.meal_corrections AS correction
      WHERE correction.meal_analysis_id = v_analysis_id;

      RETURN pg_catalog.jsonb_build_object(
        'replayed', true,
        'meal_record_id', v_record.id,
        'meal_record_item_id', v3_existing_item_id,
        'meal_analysis_id', v_analysis_id,
        'meal_identification_finalization_id', v3_existing_finalization_id,
        'meal_correction_ids', v3_existing_correction_ids
      );
    END IF;

    -- ---- lock and validate the EXISTING analysis row; never insert a new one ----
    SELECT * INTO v3_analysis
    FROM public.meal_analyses
    WHERE analysis_request_id = v3_analysis_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    IF v3_analysis.user_id <> v_user_id THEN
      RAISE EXCEPTION 'ANALYSIS_ACCESS_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v3_analysis.analysis_status NOT IN ('completed', 'low_confidence') THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_READY' USING ERRCODE = '22023';
    END IF;
    IF v3_analysis.meal_record_id IS NOT NULL THEN
      RAISE EXCEPTION 'ANALYSIS_ALREADY_FINALIZED' USING ERRCODE = '23505';
    END IF;

    -- ---- resolve selected candidate (or manual) and server-derive confirmation_mode ----
    IF v3_selected_candidate_id IS NOT NULL THEN
      SELECT elem INTO v3_candidate
      FROM pg_catalog.jsonb_array_elements(v3_analysis.detected_items) AS elem
      WHERE elem ->> 'candidateId' = v3_selected_candidate_id::text;

      IF v3_candidate IS NULL THEN
        RAISE EXCEPTION 'INVALID_CANDIDATE' USING ERRCODE = '22023';
      END IF;

      v3_candidate_name := v3_candidate ->> 'observedName';
      v3_candidate_components := COALESCE(
        (SELECT pg_catalog.jsonb_agg(item -> 'name') FROM pg_catalog.jsonb_array_elements(v3_candidate -> 'components') AS item),
        '[]'::jsonb
      );
      v3_candidate_nutrition := v3_candidate -> 'estimatedNutrition';

      v3_names_match := (v3_meal_name = v3_candidate_name);
      v3_components_match := (v3_components = v3_candidate_components);
      v3_nutrition_match := (
        COALESCE((v3_nutrition -> 'calories')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'calories')::text, 'null')
        AND COALESCE((v3_nutrition -> 'proteinGrams')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'proteinGrams')::text, 'null')
        AND COALESCE((v3_nutrition -> 'carbsGrams')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'carbsGrams')::text, 'null')
        AND COALESCE((v3_nutrition -> 'fatGrams')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'fatGrams')::text, 'null')
      );

      IF v3_names_match AND v3_components_match AND v3_nutrition_match THEN
        v3_confirmation_mode := 'accepted';
      ELSE
        v3_confirmation_mode := 'corrected';
      END IF;
      v3_manual_reason := NULL;
    ELSE
      v3_confirmation_mode := 'manual';
      v3_manual_reason := 'none_of_the_above';
      v3_candidate := NULL;
      v3_candidate_name := NULL;
      v3_candidate_components := NULL;
      v3_candidate_nutrition := NULL;
      v3_names_match := false;
      v3_components_match := false;
      v3_nutrition_match := false;
    END IF;

    v3_is_self_cooked := (v_source_context = 'self_cooked');
    v3_source := CASE WHEN v3_is_self_cooked THEN 'self_made' ELSE 'ai_estimated' END;
    v3_nutrition_source := CASE WHEN v3_confirmation_mode = 'accepted' THEN 'ai_estimated' ELSE 'user_corrected' END;

    -- create_current_user_meal_record's own item validation only accepts the established legacy
    -- nutrition key vocabulary (calories/protein/carbohydrates/fat/fiber) — see
    -- 20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql. v3_nutrition
    -- is in the MI-E-C4/C5-A candidate vocabulary (calories/proteinGrams/carbsGrams/fatGrams).
    -- Translated here, once, at the single write boundary that needs the legacy shape —
    -- meal_corrections keeps the untranslated MI-E-C4 vocabulary (see below), since that table has
    -- no established convention of its own to conform to. Only present keys are translated, so a
    -- partial nutrition object stays partial (never fabricates a 0 for an omitted field).
    v3_legacy_nutrition := '{}'::jsonb;
    IF v3_nutrition ? 'calories' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('calories', v3_nutrition -> 'calories');
    END IF;
    IF v3_nutrition ? 'proteinGrams' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('protein', v3_nutrition -> 'proteinGrams');
    END IF;
    IF v3_nutrition ? 'carbsGrams' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('carbohydrates', v3_nutrition -> 'carbsGrams');
    END IF;
    IF v3_nutrition ? 'fatGrams' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('fat', v3_nutrition -> 'fatGrams');
    END IF;

    v3_items := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'restaurantId', NULL,
        'branchId', NULL,
        'menuId', NULL,
        'menuItemId', NULL,
        'displayName', v3_meal_name,
        'userEnteredName', CASE WHEN v3_candidate_name IS NOT NULL AND v3_candidate_name <> v3_meal_name THEN v3_meal_name ELSE NULL END,
        'aiDetectedName', v3_candidate_name,
        'normalizedName', NULL,
        'portion', v3_portion,
        'nutrition', v3_legacy_nutrition,
        'nutritionSource', v3_nutrition_source,
        'sourceEntityVersion', NULL,
        'confidenceScore', v3_analysis.confidence_score,
        'consumedRatio', 1
      )
    );

    v3_created := public.create_current_user_meal_record(
      p_meal_type,
      p_occurred_at,
      p_meal_date,
      pg_catalog.btrim(p_timezone),
      v3_meal_name,
      NULL,
      v3_source,
      v3_items
    );

    v3_record_id := (v3_created ->> 'id')::uuid;
    IF pg_catalog.jsonb_array_length(v3_created -> 'meal_record_items') <> 1 THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;
    v3_item_id := (v3_created -> 'meal_record_items' -> 0 ->> 'id')::uuid;

    UPDATE public.meal_records
    SET client_request_id = p_client_request_id,
        request_fingerprint = v3_fingerprint
    WHERE id = v3_record_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
    END IF;

    -- ---- link the EXISTING analysis row; the WHERE clause re-checks
    -- meal_record_id IS NULL under the lock already held, so a race can only
    -- ever be lost here, never silently overwrite another finalization ----
    UPDATE public.meal_analyses
    SET meal_record_id = v3_record_id
    WHERE id = v3_analysis.id
      AND user_id = v_user_id
      AND meal_record_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ANALYSIS_ALREADY_FINALIZED' USING ERRCODE = '23505';
    END IF;
    v_analysis_id := v3_analysis.id;

    -- ---- confirmation/correction ledger; original detected_items is never
    -- overwritten here — only meal_record_id changed above ----
    --
    -- Accepted-unchanged is deliberately NOT given a meal_corrections row: that
    -- table's own columns (correction_type/before_value/after_value) describe a
    -- CHANGE, and inserting a before=after row would be exactly the "fake
    -- difference" this round's own instructions prohibit. The single, existing,
    -- formal field that already represents "user confirmed the AI estimate
    -- unchanged" is meal_identification_finalizations.confirmation_mode =
    -- 'accepted' (set below) — no separate ledger row is fabricated for it.
    v3_correction_ordinal := 0;
    IF v3_confirmation_mode = 'corrected' THEN
      IF NOT v3_names_match THEN
        -- MI-E-C5-B1-R1 fix: before_value/after_value are jsonb columns; the
        -- source variables here are text, and Postgres has no implicit
        -- text->jsonb cast (SQLSTATE 42804 without this wrap — the confirmed
        -- Scenario B root cause). to_jsonb(...) matches the wrap the manual
        -- branch below already applied correctly.
        INSERT INTO public.meal_corrections (
          user_id, meal_analysis_id, meal_record_item_id, correction_type,
          before_value, after_value, correction_reason, corrected_at,
          correction_ordinal, verification_status
        ) VALUES (
          v_user_id, v_analysis_id, v3_item_id, 'name_change',
          pg_catalog.to_jsonb(v3_candidate_name), pg_catalog.to_jsonb(v3_meal_name), NULL, pg_catalog.now(),
          v3_correction_ordinal, 'user_corrected'
        );
        v3_correction_ordinal := v3_correction_ordinal + 1;
      END IF;
      IF NOT v3_nutrition_match THEN
        INSERT INTO public.meal_corrections (
          user_id, meal_analysis_id, meal_record_item_id, correction_type,
          before_value, after_value, correction_reason, corrected_at,
          correction_ordinal, verification_status
        ) VALUES (
          v_user_id, v_analysis_id, v3_item_id, 'nutrition_override',
          v3_candidate_nutrition, v3_nutrition, NULL, pg_catalog.now(),
          v3_correction_ordinal, 'user_corrected'
        );
        v3_correction_ordinal := v3_correction_ordinal + 1;
      END IF;
      IF NOT v3_components_match THEN
        INSERT INTO public.meal_corrections (
          user_id, meal_analysis_id, meal_record_item_id, correction_type,
          before_value, after_value, correction_reason, corrected_at,
          correction_ordinal, verification_status
        ) VALUES (
          v_user_id, v_analysis_id, v3_item_id, 'ingredient_adjustment',
          v3_candidate_components,
          v3_components,
          NULL, pg_catalog.now(),
          v3_correction_ordinal, 'user_corrected'
        );
        v3_correction_ordinal := v3_correction_ordinal + 1;
      END IF;
    ELSIF v3_confirmation_mode = 'manual' THEN
      INSERT INTO public.meal_corrections (
        user_id, meal_analysis_id, meal_record_item_id, correction_type,
        before_value, after_value, correction_reason, corrected_at,
        correction_ordinal, verification_status
      ) VALUES (
        v_user_id, v_analysis_id, v3_item_id, 'name_change',
        NULL, pg_catalog.to_jsonb(v3_meal_name), v3_manual_reason, pg_catalog.now(),
        v3_correction_ordinal, 'user_corrected'
      );
    END IF;
    -- v3_confirmation_mode = 'accepted' falls through both branches above deliberately —
    -- see the comment before this IF chain for why no row is inserted for it.

    UPDATE public.meal_record_items
    SET correction_status = 'confirmed'::public.meal_correction_status,
        updated_at = pg_catalog.now()
    WHERE id = v3_item_id
      AND meal_record_id = v3_record_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.meal_identification_finalizations (
      user_id, meal_record_id, meal_record_item_id, meal_analysis_id,
      contract_version, source_context, selection_kind, unresolved_reason,
      identity_validation_status, command_snapshot,
      meal_source_context, record_timing, occurred_at, confirmation_mode
    ) VALUES (
      v_user_id, v3_record_id, v3_item_id, v_analysis_id,
      'meal-identification-finalization-v3', v_source_context, 'ai_candidate', NULL,
      'not_applicable', p_finalization,
      v_source_context, v_record_timing, p_occurred_at, v3_confirmation_mode
    )
    RETURNING id INTO v3_finalization_id;

    SELECT COALESCE(pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal), '[]'::jsonb)
    INTO v_correction_ids
    FROM public.meal_corrections AS correction
    WHERE correction.meal_analysis_id = v_analysis_id
      AND correction.meal_record_item_id = v3_item_id
      AND correction.user_id = v_user_id;

    RETURN pg_catalog.jsonb_build_object(
      'replayed', false,
      'meal_record_id', v3_record_id,
      'meal_record_item_id', v3_item_id,
      'meal_analysis_id', v_analysis_id,
      'meal_identification_finalization_id', v3_finalization_id,
      'meal_correction_ids', v_correction_ids
    );
  END IF;

  IF v_version <> 'meal-identification-finalization-v2' THEN
    RAISE EXCEPTION 'UNSUPPORTED_CONTRACT_VERSION' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT pg_catalog.array_agg(key ORDER BY key)
    FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
  ) IS DISTINCT FROM ARRAY[
    'corrections',
    'mealWrite',
    'occurredAt',
    'originalAnalysis',
    'recordTiming',
    'selection',
    'version'
  ]::text[] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;

  v_source_context := p_finalization -> 'selection' ->> 'sourceContext';
  IF v_source_context NOT IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown') THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_record_timing := p_finalization ->> 'recordTiming';
  IF v_record_timing NOT IN ('current', 'post_hoc') THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_finalization -> 'occurredAt') <> 'string'
     OR pg_catalog.btrim(p_finalization ->> 'occurredAt') <> p_finalization ->> 'occurredAt' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_command_occurred_at := (p_finalization ->> 'occurredAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END;
  IF v_command_occurred_at IS DISTINCT FROM p_occurred_at THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
  );

  SELECT *
  INTO v_record
  FROM public.meal_records
  WHERE user_id = v_user_id
    AND client_request_id = p_client_request_id;

  IF FOUND THEN
    SELECT
      finalization.id,
      finalization.meal_record_item_id,
      finalization.meal_analysis_id,
      finalization.contract_version,
      finalization.command_snapshot,
      finalization.meal_source_context,
      finalization.record_timing,
      finalization.occurred_at
    INTO
      v_finalization_id,
      v_item_id,
      v_analysis_id,
      v_stored_contract_version,
      v_stored_command,
      v_stored_source,
      v_stored_timing,
      v_stored_occurred_at
    FROM public.meal_identification_finalizations AS finalization
    WHERE finalization.meal_record_id = v_record.id
      AND finalization.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    IF v_record.meal_type IS DISTINCT FROM p_meal_type
       OR v_record.occurred_at IS DISTINCT FROM p_occurred_at
       OR v_record.meal_date IS DISTINCT FROM p_meal_date
       OR v_record.timezone IS DISTINCT FROM pg_catalog.btrim(p_timezone)
       OR v_stored_contract_version <> 'meal-identification-finalization-v2'
       OR v_stored_command IS DISTINCT FROM p_finalization
       OR v_stored_source IS DISTINCT FROM v_source_context
       OR v_stored_timing IS DISTINCT FROM v_record_timing
       OR v_stored_occurred_at IS DISTINCT FROM p_occurred_at THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT
      COALESCE(
        pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal),
        '[]'::jsonb
      ),
      pg_catalog.count(*)::integer
    INTO v_correction_ids, v_correction_count
    FROM public.meal_corrections AS correction
    WHERE correction.meal_analysis_id = v_analysis_id
      AND correction.meal_record_item_id = v_item_id
      AND correction.user_id = v_user_id;

    IF v_correction_count <> pg_catalog.jsonb_array_length(p_finalization -> 'corrections') THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'replayed', true,
      'meal_record_id', v_record.id,
      'meal_record_item_id', v_item_id,
      'meal_analysis_id', v_analysis_id,
      'meal_identification_finalization_id', v_finalization_id,
      'meal_correction_ids', v_correction_ids
    );
  END IF;

  v_legacy_finalization :=
    (p_finalization - 'recordTiming' - 'occurredAt')
    || pg_catalog.jsonb_build_object('version', 'meal-identification-finalization-v1');

  v_result := public.finalize_current_user_meal_identification_v1_legacy_internal(
    p_client_request_id,
    p_meal_type,
    p_occurred_at,
    p_meal_date,
    p_timezone,
    v_legacy_finalization
  );

  UPDATE public.meal_identification_finalizations
  SET
    contract_version = 'meal-identification-finalization-v2',
    meal_source_context = v_source_context,
    record_timing = v_record_timing,
    occurred_at = p_occurred_at,
    command_snapshot = p_finalization
  WHERE id = (v_result ->> 'meal_identification_finalization_id')::uuid
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
  END IF;

  UPDATE public.meal_records
  SET request_fingerprint = pg_catalog.jsonb_build_object(
    'operation', 'finalize_current_user_meal_identification_v1',
    'rpcContractVersion', 2,
    'mealType', p_meal_type::text,
    'occurredAt', p_occurred_at,
    'mealDate', p_meal_date,
    'timezone', pg_catalog.btrim(p_timezone),
    'finalization', p_finalization
  )
  WHERE id = (v_result ->> 'meal_record_id')::uuid
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_error_state = RETURNED_SQLSTATE,
    v_error_message = MESSAGE_TEXT;
  IF v_error_state IN ('28000', '22023', '23503', '23514', '23505', '42501')
     AND v_error_message ~ '^[A-Z0-9_]+$' THEN
    RAISE EXCEPTION '%', v_error_message USING ERRCODE = v_error_state;
  ELSIF v_error_state = '23505' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  ELSIF v_error_state IN ('23503', '23514') THEN
    RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';
  ELSIF v_error_state = '42501' THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  ELSE
    RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Grants are preserved automatically by CREATE OR REPLACE FUNCTION on an
-- unchanged signature; restated only for explicitness/idempotency of this
-- migration file, not because Postgres requires it.
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) TO authenticated;

COMMENT ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) IS
  'Single authenticated atomic meal-identification finalization RPC. Accepts legacy v1, v2 (Catalog/personal-unresolved) and v3 (MI-E-C4/C5-A real-AI candidate accept/correct/manual, linking an EXISTING meal_analyses row) without PostgREST overloads.';

COMMIT;
