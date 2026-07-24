BEGIN;

-- MI-C-B stores the MI-C-A command without inventing provider evidence.
ALTER TABLE public.meal_analyses
  ALTER COLUMN model_name DROP NOT NULL,
  ALTER COLUMN model_version DROP NOT NULL,
  ALTER COLUMN estimated_nutrition DROP NOT NULL,
  ALTER COLUMN estimated_nutrition DROP DEFAULT,
  ALTER COLUMN analyzed_at DROP NOT NULL,
  ALTER COLUMN analyzed_at DROP DEFAULT;

ALTER TABLE public.meal_analyses
  ADD CONSTRAINT meal_analyses_mi_c_model_pair_check
  CHECK ((model_name IS NULL) = (model_version IS NULL)),
  ADD CONSTRAINT meal_analyses_mi_c_provenance_check
  CHECK (
    analysis_status NOT IN ('available', 'unavailable')
    OR (
      analysis_status = 'available'
      AND pg_catalog.jsonb_typeof(detected_items) = 'array'
      AND pg_catalog.jsonb_array_length(detected_items) > 0
      AND analyzed_at IS NOT NULL
    )
    OR (
      analysis_status = 'unavailable'
      AND pg_catalog.cardinality(source_photo_ids) = 0
      AND detected_items = '[]'::jsonb
      AND model_name IS NULL
      AND model_version IS NULL
      AND estimated_nutrition IS NULL
      AND confidence_score IS NULL
      AND analyzed_at IS NULL
    )
  );

ALTER TABLE public.meal_corrections
  ADD COLUMN correction_ordinal integer,
  ADD CONSTRAINT meal_corrections_ordinal_nonnegative_check
  CHECK (correction_ordinal IS NULL OR correction_ordinal >= 0);

CREATE UNIQUE INDEX meal_corrections_analysis_ordinal_unique
  ON public.meal_corrections (meal_analysis_id, correction_ordinal)
  WHERE correction_ordinal IS NOT NULL;

-- These exact shapes are referenced by the durable same-actor/same-parent FKs.
ALTER TABLE public.meal_records
  ADD CONSTRAINT meal_records_id_user_id_key
  UNIQUE (id, user_id);

ALTER TABLE public.meal_record_items
  ADD CONSTRAINT meal_record_items_id_record_user_key
  UNIQUE (id, meal_record_id, user_id);

ALTER TABLE public.meal_analyses
  ADD CONSTRAINT meal_analyses_id_record_user_key
  UNIQUE (id, meal_record_id, user_id);

CREATE TABLE public.meal_identification_finalizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meal_record_id uuid NOT NULL,
  meal_record_item_id uuid NOT NULL,
  meal_analysis_id uuid NOT NULL,
  contract_version text NOT NULL,
  source_context text NOT NULL,
  selection_kind text NOT NULL,
  unresolved_reason text,
  identity_validation_status text NOT NULL,
  restaurant_id text,
  branch_id text,
  menu_id text,
  menu_category_id text,
  menu_item_id text,
  branch_menu_item_id text,
  command_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meal_identification_finalizations_record_unique UNIQUE (meal_record_id),
  CONSTRAINT meal_identification_finalizations_item_unique UNIQUE (meal_record_item_id),
  CONSTRAINT meal_identification_finalizations_analysis_unique UNIQUE (meal_analysis_id),
  CONSTRAINT meal_identification_finalizations_record_actor_fkey
    FOREIGN KEY (meal_record_id, user_id)
    REFERENCES public.meal_records (id, user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT meal_identification_finalizations_item_parent_actor_fkey
    FOREIGN KEY (meal_record_item_id, meal_record_id, user_id)
    REFERENCES public.meal_record_items (id, meal_record_id, user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT meal_identification_finalizations_analysis_parent_actor_fkey
    FOREIGN KEY (meal_analysis_id, meal_record_id, user_id)
    REFERENCES public.meal_analyses (id, meal_record_id, user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT meal_identification_finalizations_version_check
    CHECK (contract_version = 'meal-identification-finalization-v1'),
  CONSTRAINT meal_identification_finalizations_source_context_check
    CHECK (source_context IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'post_hoc', 'unknown')),
  CONSTRAINT meal_identification_finalizations_command_object_check
    CHECK (pg_catalog.jsonb_typeof(command_snapshot) = 'object'),
  CONSTRAINT meal_identification_finalizations_selection_check
    CHECK (
      (
        selection_kind = 'catalog_item'
        AND unresolved_reason IS NULL
        AND identity_validation_status = 'server_validated'
        AND restaurant_id IS NOT NULL
        AND branch_id IS NOT NULL
        AND menu_id IS NOT NULL
        AND menu_category_id IS NOT NULL
        AND menu_item_id IS NOT NULL
        AND branch_menu_item_id IS NOT NULL
      )
      OR (
        selection_kind = 'personal_unresolved'
        AND unresolved_reason IN ('manual', 'self_cooked', 'none_of_the_above', 'catalog_unavailable')
        AND identity_validation_status = 'not_applicable'
        AND restaurant_id IS NULL
        AND branch_id IS NULL
        AND menu_id IS NULL
        AND menu_category_id IS NULL
        AND menu_item_id IS NULL
        AND branch_menu_item_id IS NULL
      )
    )
);

ALTER TABLE public.meal_identification_finalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY meal_identification_finalizations_owner_select
  ON public.meal_identification_finalizations
  FOR SELECT
  USING (user_id = auth.uid());

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
  v_original jsonb;
  v_selection jsonb;
  v_identity jsonb;
  v_candidate jsonb;
  v_corrections jsonb;
  v_meal_write jsonb;
  v_model jsonb;
  v_nutrition jsonb;
  v_event jsonb;
  v_detail jsonb;
  v_event_index integer;
  v_correction_count integer;
  v_key text;
  v_snapshot_key text;
  v_nutrient_key text;
  v_value jsonb;
  v_analyzed_at timestamptz;
  v_corrected_at timestamptz;
  v_selection_kind text;
  v_source_context text;
  v_unresolved_reason text;
  v_restaurant_id text;
  v_branch_id text;
  v_menu_id text;
  v_menu_category_id text;
  v_menu_item_id text;
  v_branch_menu_item_id text;
  v_original_detected_name text;
  v_meal_name text;
  v_portion text;
  v_is_self_cooked boolean;
  v_was_user_corrected boolean;
  v_fingerprint jsonb;
  v_existing public.meal_records%ROWTYPE;
  v_existing_finalization_id uuid;
  v_existing_item_id uuid;
  v_existing_analysis_id uuid;
  v_existing_correction_ids jsonb;
  v_existing_correction_count integer;
  v_catalog_valid boolean := false;
  v_created jsonb;
  v_record_id uuid;
  v_item_id uuid;
  v_analysis_id uuid;
  v_finalization_id uuid;
  v_correction_ids jsonb := '[]'::jsonb;
  v_source public.meal_source_type;
  v_nutrition_source public.nutrition_source_type;
  v_items jsonb;
  v_error_state text;
  v_error_message text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF p_client_request_id IS NULL
     OR pg_catalog.substr(p_client_request_id::text, 15, 1) <> '4' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF p_meal_type IS NULL
     OR p_occurred_at IS NULL
     OR p_meal_date IS NULL
     OR p_timezone IS NULL
     OR pg_catalog.btrim(p_timezone) = ''
     OR pg_catalog.length(pg_catalog.btrim(p_timezone)) > 64
     OR pg_catalog.jsonb_typeof(p_finalization) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF p_finalization ->> 'version' <> 'meal-identification-finalization-v1' THEN
    RAISE EXCEPTION 'UNSUPPORTED_CONTRACT_VERSION' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT pg_catalog.array_agg(key ORDER BY key)
    FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
  ) IS DISTINCT FROM ARRAY['corrections', 'mealWrite', 'originalAnalysis', 'selection', 'version']::text[] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;

  v_original := p_finalization -> 'originalAnalysis';
  v_selection := p_finalization -> 'selection';
  v_corrections := p_finalization -> 'corrections';
  v_meal_write := p_finalization -> 'mealWrite';

  IF v_original ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
     ]
     OR v_selection ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
     ]
     OR v_meal_write ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
     ] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(v_original) <> 'object'
     OR (
       SELECT pg_catalog.array_agg(key ORDER BY key)
       FROM pg_catalog.jsonb_object_keys(v_original) AS keys(key)
     ) IS DISTINCT FROM ARRAY[
       'analyzedAt', 'confidence', 'detectedItemNames', 'estimatedNutrition',
       'model', 'photoReferences', 'status'
     ]::text[] THEN
    RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  IF v_original ->> 'status' NOT IN ('available', 'unavailable')
     OR pg_catalog.jsonb_typeof(v_original -> 'detectedItemNames') <> 'array'
     OR pg_catalog.jsonb_typeof(v_original -> 'photoReferences') <> 'array' THEN
    RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_original -> 'detectedItemNames')
  LOOP
    IF pg_catalog.jsonb_typeof(v_value) <> 'string'
       OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_original -> 'photoReferences')
  LOOP
    IF pg_catalog.jsonb_typeof(v_value) <> 'string'
       OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_model := v_original -> 'model';
  IF v_model <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_model) <> 'object'
       OR (
         SELECT pg_catalog.array_agg(key ORDER BY key)
         FROM pg_catalog.jsonb_object_keys(v_model) AS keys(key)
       ) IS DISTINCT FROM ARRAY['name', 'version']::text[]
       OR pg_catalog.btrim(v_model ->> 'name') = ''
       OR pg_catalog.btrim(v_model ->> 'version') = '' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_original -> 'estimatedNutrition' <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_original -> 'estimatedNutrition') <> 'object' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    FOR v_key, v_value IN
      SELECT key, value FROM pg_catalog.jsonb_each(v_original -> 'estimatedNutrition')
    LOOP
      IF v_key NOT IN ('calories', 'protein', 'carbohydrates', 'fat', 'fiber')
         OR pg_catalog.jsonb_typeof(v_value) <> 'number'
         OR (v_value #>> '{}')::numeric < 0 THEN
        RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  IF v_original -> 'confidence' <> 'null'::jsonb
     AND (
       pg_catalog.jsonb_typeof(v_original -> 'confidence') <> 'number'
       OR (v_original ->> 'confidence')::numeric < 0
       OR (v_original ->> 'confidence')::numeric > 1
     ) THEN
    RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  IF v_original ->> 'status' = 'available' THEN
    IF pg_catalog.jsonb_array_length(v_original -> 'detectedItemNames') = 0
       OR v_original -> 'analyzedAt' = 'null'::jsonb
       OR pg_catalog.jsonb_typeof(v_original -> 'analyzedAt') <> 'string'
       OR pg_catalog.btrim(v_original ->> 'analyzedAt') <> v_original ->> 'analyzedAt' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    BEGIN
      v_analyzed_at := (v_original ->> 'analyzedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END;
  ELSE
    IF pg_catalog.jsonb_array_length(v_original -> 'detectedItemNames') <> 0
       OR pg_catalog.jsonb_array_length(v_original -> 'photoReferences') <> 0
       OR v_model <> 'null'::jsonb
       OR v_original -> 'estimatedNutrition' <> 'null'::jsonb
       OR v_original -> 'confidence' <> 'null'::jsonb
       OR v_original -> 'analyzedAt' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    v_analyzed_at := NULL;
  END IF;

  IF pg_catalog.jsonb_typeof(v_selection) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_source_context := v_selection ->> 'sourceContext';
  IF v_source_context NOT IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'post_hoc', 'unknown') THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_identity := v_selection -> 'identity';
  IF pg_catalog.jsonb_typeof(v_identity) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;
  IF v_identity ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
  ] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT pg_catalog.array_agg(key ORDER BY key)
    FROM pg_catalog.jsonb_object_keys(v_identity) AS keys(key)
  ) IS DISTINCT FROM ARRAY[
    'branchId', 'branchMenuItemId', 'menuCategoryId', 'menuId', 'menuItemId', 'restaurantId'
  ]::text[] THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  IF v_selection ->> 'kind' = 'confirmed_catalog' THEN
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(v_selection) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
      'candidateSnapshot', 'catalogSource', 'identity', 'identityClaimStatus', 'kind', 'sourceContext'
    ]::text[]
       OR v_selection ->> 'identityClaimStatus' <> 'pending_server_validation'
       OR v_selection ->> 'catalogSource' NOT IN ('mock', 'supabase') THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    FOREACH v_key IN ARRAY ARRAY[
      'restaurantId', 'branchId', 'menuId', 'menuCategoryId', 'menuItemId', 'branchMenuItemId'
    ]
    LOOP
      IF pg_catalog.jsonb_typeof(v_identity -> v_key) <> 'string' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;

    v_restaurant_id := v_identity ->> 'restaurantId';
    v_branch_id := v_identity ->> 'branchId';
    v_menu_id := v_identity ->> 'menuId';
    v_menu_category_id := v_identity ->> 'menuCategoryId';
    v_menu_item_id := v_identity ->> 'menuItemId';
    v_branch_menu_item_id := v_identity ->> 'branchMenuItemId';

    IF v_restaurant_id IS NULL OR v_restaurant_id = '' OR pg_catalog.btrim(v_restaurant_id) <> v_restaurant_id
       OR v_branch_id IS NULL OR v_branch_id = '' OR pg_catalog.btrim(v_branch_id) <> v_branch_id
       OR v_menu_id IS NULL OR v_menu_id = '' OR pg_catalog.btrim(v_menu_id) <> v_menu_id
       OR v_menu_category_id IS NULL OR v_menu_category_id = '' OR pg_catalog.btrim(v_menu_category_id) <> v_menu_category_id
       OR v_menu_item_id IS NULL OR v_menu_item_id = '' OR pg_catalog.btrim(v_menu_item_id) <> v_menu_item_id
       OR v_branch_menu_item_id IS NULL OR v_branch_menu_item_id = '' OR pg_catalog.btrim(v_branch_menu_item_id) <> v_branch_menu_item_id THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    v_candidate := v_selection -> 'candidateSnapshot';
    IF pg_catalog.jsonb_typeof(v_candidate) <> 'object' THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(v_candidate) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
         'availability', 'branchContext', 'branchName', 'confidence', 'identity',
         'kind', 'matchReason', 'mealItemName', 'menuCategoryName', 'menuName',
         'nutritionProvenance', 'price', 'restaurantName', 'source', 'tags'
       ]::text[] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;
    IF v_candidate ->> 'kind' <> 'catalog_item'
       OR v_candidate ->> 'source' <> v_selection ->> 'catalogSource'
       OR v_candidate -> 'identity' IS DISTINCT FROM v_identity
       OR v_candidate ->> 'availability' NOT IN ('available', 'limited')
       OR v_candidate ->> 'nutritionProvenance' NOT IN ('ai_estimated', 'restaurant_confirmed', 'platform_reviewed', 'missing')
       OR pg_catalog.jsonb_typeof(v_candidate -> 'tags') <> 'array'
       OR pg_catalog.jsonb_typeof(v_candidate -> 'price') <> 'number'
       OR (v_candidate ->> 'price')::numeric < 0 THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_candidate -> 'tags')
    LOOP
      IF pg_catalog.jsonb_typeof(v_value) <> 'string'
         OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;

    FOREACH v_key IN ARRAY ARRAY[
      'restaurantName', 'branchName', 'menuName', 'menuCategoryName', 'mealItemName', 'matchReason'
    ]
    LOOP
      IF pg_catalog.jsonb_typeof(v_candidate -> v_key) <> 'string'
         OR pg_catalog.btrim(v_candidate ->> v_key) = '' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;

    IF pg_catalog.jsonb_typeof(v_candidate -> 'branchContext') <> 'string'
       OR (
         v_candidate -> 'confidence' <> 'null'::jsonb
         AND (
           pg_catalog.jsonb_typeof(v_candidate -> 'confidence') <> 'number'
           OR (v_candidate ->> 'confidence')::numeric < 0
           OR (v_candidate ->> 'confidence')::numeric > 1
         )
       ) THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    v_selection_kind := 'catalog_item';
    v_unresolved_reason := NULL;
  ELSIF v_selection ->> 'kind' = 'personal_unresolved' THEN
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(v_selection) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
      'identity', 'kind', 'mealItemName', 'reason', 'restaurantName', 'sourceContext'
    ]::text[]
       OR v_selection ->> 'reason' NOT IN ('manual', 'self_cooked', 'none_of_the_above', 'catalog_unavailable')
       OR pg_catalog.jsonb_typeof(v_selection -> 'restaurantName') <> 'string'
       OR pg_catalog.jsonb_typeof(v_selection -> 'mealItemName') <> 'string'
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_each(v_identity) AS identity_entry(key, value)
         WHERE value <> 'null'::jsonb
       ) THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    v_selection_kind := 'personal_unresolved';
    v_unresolved_reason := v_selection ->> 'reason';
    v_restaurant_id := NULL;
    v_branch_id := NULL;
    v_menu_id := NULL;
    v_menu_category_id := NULL;
    v_menu_item_id := NULL;
    v_branch_menu_item_id := NULL;
  ELSE
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(v_corrections) <> 'array' THEN
    RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;
  v_correction_count := pg_catalog.jsonb_array_length(v_corrections);

  FOR v_event, v_event_index IN
    SELECT value, ordinality::integer - 1
    FROM pg_catalog.jsonb_array_elements(v_corrections) WITH ORDINALITY
  LOOP
    IF pg_catalog.jsonb_typeof(v_event) <> 'object' THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    IF v_event ?| ARRAY[
         'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
         'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
       ] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;
    IF (
         SELECT pg_catalog.array_agg(key ORDER BY key)
         FROM pg_catalog.jsonb_object_keys(v_event) AS keys(key)
       ) IS DISTINCT FROM ARRAY['correctedAt', 'correctionReason', 'detail', 'ordinal']::text[]
       OR pg_catalog.jsonb_typeof(v_event -> 'ordinal') <> 'number'
       OR (v_event ->> 'ordinal')::numeric <> v_event_index
       OR pg_catalog.jsonb_typeof(v_event -> 'correctedAt') <> 'string'
       OR pg_catalog.btrim(v_event ->> 'correctedAt') <> v_event ->> 'correctedAt'
       OR (
         v_event -> 'correctionReason' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_event -> 'correctionReason') <> 'string'
       ) THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    BEGIN
      v_corrected_at := (v_event ->> 'correctedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END;

    v_detail := v_event -> 'detail';
    IF pg_catalog.jsonb_typeof(v_detail) <> 'object' THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    IF v_detail ?| ARRAY[
         'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
         'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
       ] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;
    IF v_detail ->> 'correctionType' NOT IN (
         'nutrition_override', 'ingredient_adjustment', 'portion_adjustment',
         'cooking_adjustment', 'name_change', 'unknown'
       ) THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    IF v_detail ->> 'correctionType' = 'nutrition_override' THEN
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(key)
      ) IS DISTINCT FROM ARRAY['after', 'before', 'correctionType']::text[]
         OR pg_catalog.jsonb_typeof(v_detail -> 'after') <> 'object'
         OR (
           v_detail -> 'before' <> 'null'::jsonb
           AND pg_catalog.jsonb_typeof(v_detail -> 'before') <> 'object'
      ) THEN
        RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
      FOREACH v_snapshot_key IN ARRAY ARRAY['before', 'after']
      LOOP
        IF v_detail -> v_snapshot_key = 'null'::jsonb THEN
          CONTINUE;
        END IF;
        FOR v_nutrient_key, v_value IN
          SELECT key, value FROM pg_catalog.jsonb_each(v_detail -> v_snapshot_key)
        LOOP
          IF v_nutrient_key NOT IN ('calories', 'protein', 'carbohydrates', 'fat', 'fiber')
             OR pg_catalog.jsonb_typeof(v_value) <> 'number'
             OR (v_value #>> '{}')::numeric < 0 THEN
            RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
          END IF;
        END LOOP;
      END LOOP;
    ELSIF v_detail ->> 'correctionType' = 'unknown' THEN
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(key)
      ) IS DISTINCT FROM ARRAY['after', 'correctionType', 'rawCorrectionType']::text[]
         OR pg_catalog.jsonb_typeof(v_detail -> 'rawCorrectionType') <> 'string'
         OR pg_catalog.btrim(v_detail ->> 'rawCorrectionType') = '' THEN
        RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(key)
      ) IS DISTINCT FROM ARRAY['after', 'before', 'correctionType']::text[]
         OR pg_catalog.jsonb_typeof(v_detail -> 'after') <> 'string'
         OR pg_catalog.btrim(v_detail ->> 'after') = ''
         OR (
           v_detail -> 'before' <> 'null'::jsonb
           AND pg_catalog.jsonb_typeof(v_detail -> 'before') <> 'string'
         ) THEN
        RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  IF pg_catalog.jsonb_typeof(v_meal_write) <> 'object'
     OR (
       SELECT pg_catalog.array_agg(key ORDER BY key)
       FROM pg_catalog.jsonb_object_keys(v_meal_write) AS keys(key)
     ) IS DISTINCT FROM ARRAY[
       'isSelfCooked', 'mealName', 'nutrition', 'portion', 'selectedMealPeriod', 'wasUserCorrected'
     ]::text[]
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'selectedMealPeriod') <> 'string'
     OR pg_catalog.btrim(v_meal_write ->> 'selectedMealPeriod') = ''
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'mealName') <> 'string'
     OR pg_catalog.btrim(v_meal_write ->> 'mealName') = ''
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'isSelfCooked') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'wasUserCorrected') <> 'boolean'
     OR (
       v_meal_write -> 'portion' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(v_meal_write -> 'portion') <> 'string'
     )
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'nutrition') <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  FOR v_key, v_value IN
    SELECT key, value FROM pg_catalog.jsonb_each(v_meal_write -> 'nutrition')
  LOOP
    IF v_key NOT IN ('calories', 'protein', 'carbohydrates', 'fat', 'fiber')
       OR pg_catalog.jsonb_typeof(v_value) <> 'number'
       OR (v_value #>> '{}')::numeric < 0 THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_meal_name := pg_catalog.btrim(v_meal_write ->> 'mealName');
  v_portion := NULLIF(pg_catalog.btrim(v_meal_write ->> 'portion'), '');
  v_is_self_cooked := (v_meal_write ->> 'isSelfCooked')::boolean;
  v_was_user_corrected := (v_meal_write ->> 'wasUserCorrected')::boolean;
  v_original_detected_name := v_original -> 'detectedItemNames' ->> 0;

  IF v_selection_kind = 'catalog_item'
     AND (v_source_context = 'self_cooked' OR v_is_self_cooked) THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;
  IF v_selection_kind = 'personal_unresolved'
     AND (
       (v_unresolved_reason = 'self_cooked' AND (v_source_context <> 'self_cooked' OR NOT v_is_self_cooked))
       OR (v_unresolved_reason <> 'self_cooked' AND (v_source_context = 'self_cooked' OR v_is_self_cooked))
     ) THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := pg_catalog.jsonb_build_object(
    'operation', 'finalize_current_user_meal_identification_v1',
    'rpcContractVersion', 1,
    'mealType', p_meal_type::text,
    'occurredAt', p_occurred_at,
    'mealDate', p_meal_date,
    'timezone', pg_catalog.btrim(p_timezone),
    'finalization', p_finalization
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.meal_records
  WHERE user_id = v_user_id
    AND client_request_id = p_client_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT finalization.id, finalization.meal_record_item_id, finalization.meal_analysis_id
    INTO v_existing_finalization_id, v_existing_item_id, v_existing_analysis_id
    FROM public.meal_identification_finalizations AS finalization
    JOIN public.meal_record_items AS item
      ON item.id = finalization.meal_record_item_id
      AND item.meal_record_id = finalization.meal_record_id
      AND item.user_id = finalization.user_id
    JOIN public.meal_analyses AS analysis
      ON analysis.id = finalization.meal_analysis_id
      AND analysis.meal_record_id = finalization.meal_record_id
      AND analysis.user_id = finalization.user_id
    WHERE finalization.meal_record_id = v_existing.id
      AND finalization.user_id = v_user_id
      AND finalization.contract_version = 'meal-identification-finalization-v1'
      AND finalization.command_snapshot = p_finalization;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    SELECT
      COALESCE(pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal), '[]'::jsonb),
      pg_catalog.count(*)::integer
    INTO v_existing_correction_ids, v_existing_correction_count
    FROM public.meal_corrections AS correction
    WHERE correction.meal_analysis_id = v_existing_analysis_id;

    IF v_existing_correction_count <> v_correction_count
       OR EXISTS (
         SELECT 1
         FROM public.meal_corrections AS correction
         WHERE correction.meal_analysis_id = v_existing_analysis_id
           AND (
             correction.meal_record_item_id IS DISTINCT FROM v_existing_item_id
             OR correction.user_id IS DISTINCT FROM v_user_id
             OR correction.correction_ordinal IS DISTINCT FROM (
             SELECT pg_catalog.count(*)::integer
             FROM public.meal_corrections AS earlier
             WHERE earlier.meal_analysis_id = correction.meal_analysis_id
               AND earlier.correction_ordinal < correction.correction_ordinal
             )
           )
       ) THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'replayed', true,
      'meal_record_id', v_existing.id,
      'meal_record_item_id', v_existing_item_id,
      'meal_analysis_id', v_existing_analysis_id,
      'meal_identification_finalization_id', v_existing_finalization_id,
      'meal_correction_ids', v_existing_correction_ids
    );
  END IF;

  IF v_selection_kind = 'catalog_item' THEN
    SELECT true
    INTO v_catalog_valid
    FROM public.restaurants AS restaurant
    JOIN public.restaurant_branches AS branch
      ON branch.id = v_branch_id
      AND branch.restaurant_id = restaurant.id
    JOIN public.menus AS menu
      ON menu.id = v_menu_id
      AND menu.restaurant_id = restaurant.id
    JOIN public.menu_categories AS category
      ON category.id = v_menu_category_id
      AND category.menu_id = menu.id
    JOIN public.menu_items AS item
      ON item.id = v_menu_item_id
      AND item.restaurant_id = restaurant.id
      AND item.menu_category_id = category.id
    JOIN public.branch_menu_items AS branch_item
      ON branch_item.id = v_branch_menu_item_id
      AND branch_item.restaurant_id = restaurant.id
      AND branch_item.branch_id = branch.id
      AND branch_item.menu_item_id = item.id
    WHERE restaurant.id = v_restaurant_id
      AND restaurant.status = 'active'
      AND branch.status = 'active'
      AND branch.is_active = true
      AND menu.status = 'published'
      AND item.status = 'active'
      AND branch_item.availability IN ('available', 'limited')
      AND branch_item.sold_out = false
      AND branch_item.branch_specific_status = 'available'
    FOR SHARE OF restaurant, branch, menu, category, item, branch_item;

    IF NOT FOUND OR NOT v_catalog_valid THEN
      RAISE EXCEPTION 'CATALOG_IDENTITY_REJECTED' USING ERRCODE = '23503';
    END IF;
  ELSIF v_restaurant_id IS NOT NULL
     OR v_branch_id IS NOT NULL
     OR v_menu_id IS NOT NULL
     OR v_menu_category_id IS NOT NULL
     OR v_menu_item_id IS NOT NULL
     OR v_branch_menu_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_source := CASE WHEN v_is_self_cooked THEN 'self_made' ELSE 'ai_estimated' END;
  v_nutrition_source := CASE WHEN v_was_user_corrected THEN 'user_corrected' ELSE 'ai_estimated' END;
  v_nutrition := v_meal_write -> 'nutrition';

  v_items := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'restaurantId', v_restaurant_id,
      'branchId', v_branch_id,
      'menuId', v_menu_id,
      'menuItemId', v_menu_item_id,
      'displayName', v_meal_name,
      'userEnteredName', CASE
        WHEN v_original_detected_name IS NOT NULL AND v_original_detected_name <> v_meal_name
          THEN v_meal_name
        ELSE NULL
      END,
      'aiDetectedName', v_original_detected_name,
      'normalizedName', NULL,
      'portion', v_portion,
      'nutrition', v_nutrition,
      'nutritionSource', v_nutrition_source::text,
      'sourceEntityVersion', NULL,
      'confidenceScore', NULL,
      'consumedRatio', 1
    )
  );

  v_created := public.create_current_user_meal_record(
    p_meal_type,
    p_occurred_at,
    p_meal_date,
    pg_catalog.btrim(p_timezone),
    v_meal_name,
    NULL,
    v_source,
    v_items
  );

  v_record_id := (v_created ->> 'id')::uuid;
  IF pg_catalog.jsonb_array_length(v_created -> 'meal_record_items') <> 1 THEN
    RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
  END IF;
  v_item_id := (v_created -> 'meal_record_items' -> 0 ->> 'id')::uuid;

  UPDATE public.meal_records
  SET client_request_id = p_client_request_id,
      request_fingerprint = v_fingerprint
  WHERE id = v_record_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.meal_analyses (
    user_id,
    meal_record_id,
    source_photo_ids,
    model_name,
    model_version,
    estimated_nutrition,
    detected_items,
    confidence_score,
    analysis_status,
    analyzed_at
  )
  VALUES (
    v_user_id,
    v_record_id,
    ARRAY(
      SELECT value
      FROM pg_catalog.jsonb_array_elements_text(v_original -> 'photoReferences') AS photos(value)
    ),
    CASE WHEN v_model = 'null'::jsonb THEN NULL ELSE v_model ->> 'name' END,
    CASE WHEN v_model = 'null'::jsonb THEN NULL ELSE v_model ->> 'version' END,
    CASE
      WHEN v_original -> 'estimatedNutrition' = 'null'::jsonb THEN NULL
      ELSE v_original -> 'estimatedNutrition'
    END,
    v_original -> 'detectedItemNames',
    CASE
      WHEN v_original -> 'confidence' = 'null'::jsonb THEN NULL
      ELSE (v_original ->> 'confidence')::numeric
    END,
    v_original ->> 'status',
    v_analyzed_at
  )
  RETURNING id INTO v_analysis_id;

  FOR v_event, v_event_index IN
    SELECT value, ordinality::integer - 1
    FROM pg_catalog.jsonb_array_elements(v_corrections) WITH ORDINALITY
  LOOP
    v_detail := v_event -> 'detail';
    INSERT INTO public.meal_corrections (
      user_id,
      meal_analysis_id,
      meal_record_item_id,
      correction_type,
      before_value,
      after_value,
      correction_reason,
      corrected_at,
      correction_ordinal
    )
    VALUES (
      v_user_id,
      v_analysis_id,
      v_item_id,
      CASE
        WHEN v_detail ->> 'correctionType' = 'unknown' THEN v_detail ->> 'rawCorrectionType'
        ELSE v_detail ->> 'correctionType'
      END,
      CASE
        WHEN v_detail ->> 'correctionType' = 'unknown' THEN NULL
        WHEN v_detail -> 'before' = 'null'::jsonb THEN NULL
        ELSE v_detail -> 'before'
      END,
      v_detail -> 'after',
      CASE
        WHEN v_event -> 'correctionReason' = 'null'::jsonb THEN NULL
        ELSE v_event ->> 'correctionReason'
      END,
      (v_event ->> 'correctedAt')::timestamptz,
      v_event_index
    );
  END LOOP;

  IF v_correction_count > 0 THEN
    UPDATE public.meal_record_items
    SET correction_status = 'confirmed'::public.meal_correction_status,
        updated_at = pg_catalog.now()
    WHERE id = v_item_id
      AND meal_record_id = v_record_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.meal_identification_finalizations (
    user_id,
    meal_record_id,
    meal_record_item_id,
    meal_analysis_id,
    contract_version,
    source_context,
    selection_kind,
    unresolved_reason,
    identity_validation_status,
    restaurant_id,
    branch_id,
    menu_id,
    menu_category_id,
    menu_item_id,
    branch_menu_item_id,
    command_snapshot
  )
  VALUES (
    v_user_id,
    v_record_id,
    v_item_id,
    v_analysis_id,
    'meal-identification-finalization-v1',
    v_source_context,
    v_selection_kind,
    v_unresolved_reason,
    CASE WHEN v_selection_kind = 'catalog_item' THEN 'server_validated' ELSE 'not_applicable' END,
    v_restaurant_id,
    v_branch_id,
    v_menu_id,
    v_menu_category_id,
    v_menu_item_id,
    v_branch_menu_item_id,
    p_finalization
  )
  RETURNING id INTO v_finalization_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal),
    '[]'::jsonb
  )
  INTO v_correction_ids
  FROM public.meal_corrections AS correction
  WHERE correction.meal_analysis_id = v_analysis_id
    AND correction.meal_record_item_id = v_item_id
    AND correction.user_id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    'replayed', false,
    'meal_record_id', v_record_id,
    'meal_record_item_id', v_item_id,
    'meal_analysis_id', v_analysis_id,
    'meal_identification_finalization_id', v_finalization_id,
    'meal_correction_ids', v_correction_ids
  );
EXCEPTION WHEN OTHERS THEN
  v_error_state := SQLSTATE;
  v_error_message := SQLERRM;

  -- Preserve only deliberately typed, token-only errors and strip all detail/hint
  -- fields. Native constraint or parser messages are mapped to stable categories.
  IF v_error_state IN ('28000', '22023', '23503', '23514', '23505', '42501')
     AND v_error_message ~ '^[A-Z0-9_]+$' THEN
    RAISE EXCEPTION '%', v_error_message USING ERRCODE = v_error_state;
  ELSIF v_error_state = '23505' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  ELSIF v_error_state IN ('23503', '23514') THEN
    RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
  ELSIF v_error_state = '42501' THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  ELSIF v_error_state LIKE '22%' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  ELSE
    RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid, public.meal_type, timestamptz, date, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid, public.meal_type, timestamptz, date, text, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid, public.meal_type, timestamptz, date, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid, public.meal_type, timestamptz, date, text, jsonb
) TO authenticated;

REVOKE ALL ON TABLE public.meal_identification_finalizations FROM PUBLIC;
REVOKE ALL ON TABLE public.meal_identification_finalizations FROM anon;
REVOKE ALL ON TABLE public.meal_identification_finalizations FROM authenticated;
GRANT SELECT ON TABLE public.meal_identification_finalizations TO authenticated;

REVOKE ALL ON TABLE public.meal_analyses FROM PUBLIC;
REVOKE ALL ON TABLE public.meal_analyses FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.meal_analyses FROM authenticated;
GRANT SELECT ON TABLE public.meal_analyses TO authenticated;

REVOKE ALL ON TABLE public.meal_corrections FROM PUBLIC;
REVOKE ALL ON TABLE public.meal_corrections FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.meal_corrections FROM authenticated;
GRANT SELECT ON TABLE public.meal_corrections TO authenticated;

COMMENT ON TABLE public.meal_identification_finalizations IS
  'Immutable consumer-owned durable ledger for meal-identification-finalization-v1 commands.';
COMMENT ON COLUMN public.meal_identification_finalizations.command_snapshot IS
  'Complete accepted MI-C-A command; Catalog identity was validated at write time and remains historical.';
COMMENT ON COLUMN public.meal_corrections.correction_ordinal IS
  'Zero-based append order for MI-C-B corrections; legacy rows may remain null.';
COMMENT ON FUNCTION public.finalize_current_user_meal_identification_v1(
  uuid, public.meal_type, timestamptz, date, text, jsonb
) IS
  'Atomically validates Catalog identity, writes one meal/item, original analysis, ordered corrections, durable ledger, and actor-scoped idempotency.';

COMMIT;
