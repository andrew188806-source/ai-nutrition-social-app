BEGIN;

ALTER FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) RENAME TO finalize_current_user_meal_identification_v1_legacy_internal;

REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1_legacy_internal(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1_legacy_internal(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1_legacy_internal(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) FROM authenticated;

ALTER TABLE public.meal_identification_finalizations
  ADD COLUMN meal_source_context text,
  ADD COLUMN record_timing text,
  ADD COLUMN occurred_at timestamptz;

UPDATE public.meal_identification_finalizations AS finalization
SET
  meal_source_context = CASE
    WHEN finalization.source_context = 'post_hoc' THEN 'unknown'
    ELSE finalization.source_context
  END,
  record_timing = CASE
    WHEN finalization.source_context = 'post_hoc' THEN 'post_hoc'
    ELSE 'current'
  END,
  occurred_at = record.occurred_at
FROM public.meal_records AS record
WHERE record.id = finalization.meal_record_id
  AND record.user_id = finalization.user_id;

ALTER TABLE public.meal_identification_finalizations
  DROP CONSTRAINT meal_identification_finalizations_version_check,
  ADD CONSTRAINT meal_identification_finalizations_version_check
    CHECK (
      contract_version IN (
        'meal-identification-finalization-v1',
        'meal-identification-finalization-v2'
      )
    ),
  ADD CONSTRAINT meal_identification_finalizations_meal_source_context_check
    CHECK (
      meal_source_context IS NULL
      OR meal_source_context IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown')
    ),
  ADD CONSTRAINT meal_identification_finalizations_record_timing_check
    CHECK (
      record_timing IS NULL
      OR record_timing IN ('current', 'post_hoc')
    ),
  ADD CONSTRAINT meal_identification_finalizations_temporal_context_check
    CHECK (
      (
        meal_source_context IS NULL
        AND record_timing IS NULL
        AND occurred_at IS NULL
      )
      OR (
        meal_source_context IS NOT NULL
        AND record_timing IS NOT NULL
        AND occurred_at IS NOT NULL
      )
    );

CREATE FUNCTION public.finalize_current_user_meal_identification_v1(
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

COMMENT ON COLUMN public.meal_identification_finalizations.source_context IS
  'Legacy raw source-context value retained for v1 compatibility; post_hoc here does not identify a meal source.';
COMMENT ON COLUMN public.meal_identification_finalizations.meal_source_context IS
  'Canonical meal source. Legacy source_context=post_hoc rows deterministically map to unknown rather than a guessed source.';
COMMENT ON COLUMN public.meal_identification_finalizations.record_timing IS
  'Independent record timing: current or post_hoc.';
COMMENT ON COLUMN public.meal_identification_finalizations.occurred_at IS
  'Actual meal occurrence timestamp, copied from the canonical meal record; never migration or upload time.';
COMMENT ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid,
  public.meal_type,
  timestamptz,
  date,
  text,
  jsonb
) IS
  'Single authenticated atomic meal-identification finalization RPC. Accepts legacy v1 and corrected v2 without PostgREST overloads.';

COMMIT;
