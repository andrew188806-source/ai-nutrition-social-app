BEGIN;

-- P2V-SCHEMA-BASELINE-002 formalizes the restaurant platform baseline that
-- historically reached Development through an out-of-band activation pack.
-- It deliberately has two safe paths: bootstrap a wholly empty baseline, or
-- register a wholly existing baseline using read-only catalog assertions.
DO $restaurant_platform_baseline$
DECLARE
  baseline_tables constant text[] := ARRAY[
    'restaurants',
    'restaurant_branches',
    'menus',
    'menu_categories',
    'menu_items',
    'branch_menu_items',
    'menu_item_nutrition'
  ];
  present_count integer;
  missing_columns text[];
  invalid_columns text[];
  missing_objects text[];
BEGIN
  SELECT count(*)::integer
  INTO present_count
  FROM unnest(baseline_tables) AS baseline_table(table_name)
  WHERE pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(table_name)) IS NOT NULL;

  IF present_count = 0 THEN
    -- Empty database bootstrap mode. No fixture or business row is created.
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE public.restaurants (
      id text PRIMARY KEY,
      name text NOT NULL,
      legal_name text,
      city text,
      category text,
      tags text[] NOT NULL DEFAULT '{}',
      plan text NOT NULL DEFAULT 'demo',
      status text NOT NULL CHECK (status IN ('active', 'paused', 'draft', 'archived')),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.restaurant_branches (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      name text NOT NULL,
      district text,
      address text,
      status text NOT NULL CHECK (status IN ('active', 'inactive', 'temporary_closed', 'archived')),
      is_active boolean GENERATED ALWAYS AS (status = 'active') STORED
    );

    CREATE TABLE public.menus (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      name text NOT NULL,
      status text NOT NULL CHECK (status IN ('draft', 'published', 'archived'))
    );

    CREATE TABLE public.menu_categories (
      id text PRIMARY KEY,
      menu_id text NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
      name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0
    );

    CREATE TABLE public.menu_items (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      menu_category_id text NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
      name text NOT NULL,
      description text,
      image_url text,
      tag_ids text[] NOT NULL DEFAULT '{}',
      allergens text[] NOT NULL DEFAULT '{}',
      status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
      nutrition_id text,
      nutrition_badge_status text NOT NULL DEFAULT 'missing'
        CHECK (nutrition_badge_status IN ('approved', 'ai_estimated', 'pending_review', 'missing')),
      badge_enabled boolean NOT NULL DEFAULT false
    );

    CREATE TABLE public.branch_menu_items (
      id text PRIMARY KEY,
      restaurant_id text NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
      branch_id text NOT NULL REFERENCES public.restaurant_branches(id) ON DELETE CASCADE,
      menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
      price numeric(10,2) NOT NULL,
      availability text NOT NULL CHECK (availability IN ('available', 'limited', 'unavailable')),
      sold_out boolean NOT NULL DEFAULT false,
      branch_specific_name text,
      branch_specific_description text,
      branch_specific_status text NOT NULL DEFAULT 'available'
        CHECK (branch_specific_status IN ('available', 'hidden', 'discontinued')),
      UNIQUE (branch_id, menu_item_id)
    );

    CREATE TABLE public.menu_item_nutrition (
      id text PRIMARY KEY,
      menu_item_id text NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
      calories numeric,
      protein numeric,
      carbohydrates numeric,
      fat numeric,
      fiber numeric,
      sugar numeric,
      sodium numeric,
      saturated_fat numeric,
      serving_size text,
      source text NOT NULL CHECK (source IN ('restaurant_verified', 'admin_verified', 'ai_estimated', 'pending')),
      confidence_score numeric NOT NULL DEFAULT 0,
      verified_status text NOT NULL CHECK (verified_status IN ('verified', 'ai_estimated', 'pending_review', 'rejected')),
      is_current boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX menu_item_nutrition_one_current
      ON public.menu_item_nutrition(menu_item_id)
      WHERE is_current = true AND verified_status IN ('verified', 'ai_estimated');

    CREATE VIEW public.current_published_menu_item_nutrition AS
    SELECT
      nutrition.id,
      item.restaurant_id,
      nutrition.menu_item_id,
      nutrition.calories,
      nutrition.protein,
      nutrition.carbohydrates,
      nutrition.fat,
      nutrition.fiber,
      nutrition.sugar,
      nutrition.sodium,
      nutrition.saturated_fat,
      nutrition.serving_size,
      nutrition.source,
      nutrition.confidence_score,
      nutrition.verified_status,
      nutrition.updated_at
    FROM public.menu_item_nutrition AS nutrition
    JOIN public.menu_items AS item ON item.id = nutrition.menu_item_id
    JOIN public.restaurants AS restaurant ON restaurant.id = item.restaurant_id
    WHERE nutrition.is_current = true
      AND nutrition.verified_status IN ('verified', 'ai_estimated')
      AND item.status = 'active'
      AND restaurant.status = 'active';

    CREATE VIEW public.restaurant_public_view AS
    SELECT * FROM public.restaurants WHERE status = 'active';

    CREATE VIEW public.published_menus_view AS
    SELECT * FROM public.menus WHERE status = 'published';

    CREATE VIEW public.published_branch_menu_items_view AS
    SELECT branch_item.*
    FROM public.branch_menu_items AS branch_item
    JOIN public.restaurant_branches AS branch ON branch.id = branch_item.branch_id
    JOIN public.menu_items AS item ON item.id = branch_item.menu_item_id
    WHERE branch.status = 'active'
      AND item.status = 'active'
      AND branch_item.availability IN ('available', 'limited')
      AND branch_item.branch_specific_status = 'available'
      AND branch_item.sold_out = false;

    ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.restaurant_branches ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.branch_menu_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.menu_item_nutrition ENABLE ROW LEVEL SECURITY;

    CREATE POLICY restaurants_public_read_dev
      ON public.restaurants FOR SELECT USING (status = 'active');
    CREATE POLICY branches_public_read_dev
      ON public.restaurant_branches FOR SELECT USING (status = 'active');
    CREATE POLICY menus_public_read_dev
      ON public.menus FOR SELECT USING (status = 'published');
    CREATE POLICY categories_public_read_dev
      ON public.menu_categories FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.menus AS menu WHERE menu.id = menu_id AND menu.status = 'published')
      );
    CREATE POLICY items_public_read_dev
      ON public.menu_items FOR SELECT USING (status = 'active');
    CREATE POLICY branch_items_public_read_dev
      ON public.branch_menu_items FOR SELECT USING (
        availability IN ('available', 'limited')
        AND sold_out = false
        AND branch_specific_status = 'available'
      );
    CREATE POLICY nutrition_public_read_dev
      ON public.menu_item_nutrition FOR SELECT USING (
        is_current = true AND verified_status IN ('verified', 'ai_estimated')
      );

    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT ON public.restaurants TO anon, authenticated;
    GRANT SELECT ON public.restaurant_branches TO anon, authenticated;
    GRANT SELECT ON public.menus TO anon, authenticated;
    GRANT SELECT ON public.menu_categories TO anon, authenticated;
    GRANT SELECT ON public.menu_items TO anon, authenticated;
    GRANT SELECT ON public.branch_menu_items TO anon, authenticated;
    GRANT SELECT ON public.menu_item_nutrition TO anon, authenticated;
    GRANT SELECT ON public.current_published_menu_item_nutrition TO anon, authenticated;
    GRANT SELECT ON public.restaurant_public_view TO anon, authenticated;
    GRANT SELECT ON public.published_menus_view TO anon, authenticated;
    GRANT SELECT ON public.published_branch_menu_items_view TO anon, authenticated;

  ELSIF present_count = pg_catalog.array_length(baseline_tables, 1) THEN
    -- Existing schema registration mode. Every statement below is a read-only
    -- compatibility assertion. Later columns, constraints, policies, view
    -- columns, functions, and revoked privileges are intentionally allowed.
    WITH required_columns(table_name, column_name) AS (
      VALUES
        ('restaurants', 'id'), ('restaurants', 'name'), ('restaurants', 'legal_name'),
        ('restaurants', 'city'), ('restaurants', 'category'), ('restaurants', 'tags'),
        ('restaurants', 'plan'), ('restaurants', 'status'), ('restaurants', 'created_at'),
        ('restaurant_branches', 'id'), ('restaurant_branches', 'restaurant_id'),
        ('restaurant_branches', 'name'), ('restaurant_branches', 'district'),
        ('restaurant_branches', 'address'), ('restaurant_branches', 'status'),
        ('restaurant_branches', 'is_active'),
        ('menus', 'id'), ('menus', 'restaurant_id'), ('menus', 'name'), ('menus', 'status'),
        ('menu_categories', 'id'), ('menu_categories', 'menu_id'),
        ('menu_categories', 'name'), ('menu_categories', 'sort_order'),
        ('menu_items', 'id'), ('menu_items', 'restaurant_id'),
        ('menu_items', 'menu_category_id'), ('menu_items', 'name'),
        ('menu_items', 'description'), ('menu_items', 'image_url'),
        ('menu_items', 'tag_ids'), ('menu_items', 'allergens'), ('menu_items', 'status'),
        ('menu_items', 'nutrition_id'), ('menu_items', 'nutrition_badge_status'),
        ('menu_items', 'badge_enabled'),
        ('branch_menu_items', 'id'), ('branch_menu_items', 'restaurant_id'),
        ('branch_menu_items', 'branch_id'), ('branch_menu_items', 'menu_item_id'),
        ('branch_menu_items', 'price'), ('branch_menu_items', 'availability'),
        ('branch_menu_items', 'sold_out'), ('branch_menu_items', 'branch_specific_name'),
        ('branch_menu_items', 'branch_specific_description'),
        ('branch_menu_items', 'branch_specific_status'),
        ('menu_item_nutrition', 'id'), ('menu_item_nutrition', 'menu_item_id'),
        ('menu_item_nutrition', 'calories'), ('menu_item_nutrition', 'protein'),
        ('menu_item_nutrition', 'carbohydrates'), ('menu_item_nutrition', 'fat'),
        ('menu_item_nutrition', 'fiber'), ('menu_item_nutrition', 'sugar'),
        ('menu_item_nutrition', 'sodium'), ('menu_item_nutrition', 'saturated_fat'),
        ('menu_item_nutrition', 'serving_size'), ('menu_item_nutrition', 'source'),
        ('menu_item_nutrition', 'confidence_score'),
        ('menu_item_nutrition', 'verified_status'),
        ('menu_item_nutrition', 'is_current'), ('menu_item_nutrition', 'updated_at')
    )
    SELECT pg_catalog.array_agg(required.table_name || '.' || required.column_name ORDER BY 1)
    INTO missing_columns
    FROM required_columns AS required
    LEFT JOIN information_schema.columns AS actual
      ON actual.table_schema = 'public'
     AND actual.table_name = required.table_name
     AND actual.column_name = required.column_name
    WHERE actual.column_name IS NULL;

    IF missing_columns IS NOT NULL THEN
      RAISE EXCEPTION 'restaurant baseline existing schema is missing required columns: %', missing_columns;
    END IF;

    WITH expected(table_name, column_name, formatted_type, required_not_null) AS (
      VALUES
        ('restaurants', 'id', 'text', true),
        ('restaurant_branches', 'restaurant_id', 'text', true),
        ('restaurant_branches', 'is_active', 'boolean', false),
        ('menus', 'restaurant_id', 'text', true),
        ('menu_categories', 'sort_order', 'integer', true),
        ('menu_items', 'restaurant_id', 'text', true),
        ('menu_items', 'allergens', 'text[]', true),
        ('branch_menu_items', 'price', 'numeric(10,2)', true),
        ('branch_menu_items', 'sold_out', 'boolean', true),
        ('menu_item_nutrition', 'menu_item_id', 'text', true),
        ('menu_item_nutrition', 'confidence_score', 'numeric', true),
        ('menu_item_nutrition', 'is_current', 'boolean', true),
        ('menu_item_nutrition', 'updated_at', 'timestamp with time zone', true)
    )
    SELECT pg_catalog.array_agg(expected.table_name || '.' || expected.column_name ORDER BY 1)
    INTO invalid_columns
    FROM expected
    JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.table_name
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    WHERE pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) <> expected.formatted_type
       OR (expected.required_not_null AND NOT attribute.attnotnull);

    IF invalid_columns IS NOT NULL THEN
      RAISE EXCEPTION 'restaurant baseline existing schema has incompatible required columns: %', invalid_columns;
    END IF;

    SELECT pg_catalog.array_agg(required_object ORDER BY required_object)
    INTO missing_objects
    FROM unnest(ARRAY[
      'public.current_published_menu_item_nutrition',
      'public.restaurant_public_view',
      'public.published_menus_view',
      'public.published_branch_menu_items_view'
    ]) AS required(required_object)
    WHERE pg_catalog.to_regclass(required_object) IS NULL;

    IF missing_objects IS NOT NULL THEN
      RAISE EXCEPTION 'restaurant baseline existing schema is missing required views: %', missing_objects;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(baseline_tables) AS baseline_table(table_name)
      JOIN pg_catalog.pg_class AS relation ON relation.relname = baseline_table.table_name
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
      WHERE NOT relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'restaurant baseline existing schema requires RLS on every baseline table';
    END IF;

    IF (
      SELECT count(*)
      FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
      WHERE policy.polname IN (
        'restaurants_public_read_dev', 'branches_public_read_dev',
        'menus_public_read_dev', 'categories_public_read_dev',
        'items_public_read_dev', 'branch_items_public_read_dev',
        'nutrition_public_read_dev'
      )
    ) <> 7 THEN
      RAISE EXCEPTION 'restaurant baseline existing schema is missing a required baseline RLS policy';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_index AS index_entry
      JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_entry.indexrelid
      JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_entry.indrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND table_relation.relname = 'menu_item_nutrition'
        AND index_relation.relname = 'menu_item_nutrition_one_current'
        AND index_entry.indisunique
        AND index_entry.indisvalid
        AND index_entry.indpred IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'restaurant baseline existing schema is missing the current-nutrition partial unique index';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_entry
      JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_entry.conrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = 'branch_menu_items'
        AND constraint_entry.contype = 'u'
        AND pg_catalog.pg_get_constraintdef(constraint_entry.oid) = 'UNIQUE (branch_id, menu_item_id)'
    ) THEN
      RAISE EXCEPTION 'restaurant baseline existing schema is missing branch/menu-item uniqueness';
    END IF;

  ELSE
    RAISE EXCEPTION
      'restaurant baseline partial schema rejected: found % of 7 baseline tables; expected exactly 0 or 7',
      present_count;
  END IF;
END
$restaurant_platform_baseline$;

COMMIT;
