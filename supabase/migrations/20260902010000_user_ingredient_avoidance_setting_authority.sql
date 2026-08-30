-- REC-D-P1: governed private current-user Ingredient Avoidance settings and writer boundary.
--
-- This is a separate persistent domain from REC-C Allergy settings. Legacy dietary_restrictions
-- rows are neither read nor rewritten. No user reason, religion, eligibility, score, or public
-- projection is introduced.

begin;

create table public.private_user_ingredient_avoidance_settings (
  setting_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_vocabulary_id text not null
    check (source_vocabulary_id = 'private-ingredient-avoidance-v1'),
  source_vocabulary_version integer not null
    check (source_vocabulary_version = 1),
  source_value_key text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (source_vocabulary_id, source_vocabulary_version, source_value_key)
    references public.private_ingredient_avoidance_source_values
      (source_vocabulary_id, source_vocabulary_version, source_value_key)
    on update restrict
    on delete restrict,
  constraint private_user_ingredient_avoidance_unique
    unique (user_id, source_vocabulary_id, source_vocabulary_version, source_value_key)
);

comment on table public.private_user_ingredient_avoidance_settings is
  'REC-D-P1 private governed user selections for 我不吃的食物. Separate from Allergy and legacy dietary_restrictions; stores no reason, religion, medical meaning, compatibility, or public identity.';

alter table public.private_user_ingredient_avoidance_settings enable row level security;
alter table public.private_user_ingredient_avoidance_settings force row level security;

create policy private_user_ingredient_avoidance_owner_isolation
  on public.private_user_ingredient_avoidance_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.private_user_ingredient_avoidance_settings
  from public, anon, authenticated, authenticator, service_role;

create function public.read_authenticated_ingredient_avoidance_settings_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_keys jsonb;
  v_unresolved_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  with governed as (
    select
      setting.source_value_key,
      mapping.target_ingredient_avoidance_key
    from public.private_user_ingredient_avoidance_settings as setting
    left join public.private_ingredient_avoidance_source_vocabularies as vocabulary
      on vocabulary.source_vocabulary_id = setting.source_vocabulary_id
     and vocabulary.source_vocabulary_version = setting.source_vocabulary_version
     and vocabulary.source_domain = 'ingredient_avoidance'
     and vocabulary.active
     and vocabulary.retired_at is null
    left join public.private_ingredient_avoidance_source_values as source
      on source.source_vocabulary_id = setting.source_vocabulary_id
     and source.source_vocabulary_version = setting.source_vocabulary_version
     and source.source_value_key = setting.source_value_key
     and source.active
     and source.retired_at is null
    left join public.private_ingredient_avoidance_normalization_mappings as mapping
      on mapping.normalization_policy_id = 'private-ingredient-avoidance-normalization-v1'
     and mapping.normalization_policy_version = 1
     and mapping.source_vocabulary_id = setting.source_vocabulary_id
     and mapping.source_vocabulary_version = setting.source_vocabulary_version
     and mapping.source_value_key = setting.source_value_key
     and mapping.normalized_source_value = setting.source_value_key
     and mapping.target_taxonomy_id = 'tastkind-ingredient-avoidance-v1'
     and mapping.target_taxonomy_version = 1
     and mapping.active
     and mapping.retired_at is null
    left join public.private_ingredient_avoidance_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
     and policy.active
     and policy.retired_at is null
    left join public.candidate_ingredient_avoidance_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
     and taxonomy.fact_domain = 'ingredient_avoidance_content'
     and taxonomy.active
     and taxonomy.retired_at is null
    left join public.candidate_ingredient_avoidance_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.ingredient_avoidance_key = mapping.target_ingredient_avoidance_key
     and target.active
     and target.retired_at is null
    where setting.user_id = v_user_id
      and setting.source_vocabulary_id = 'private-ingredient-avoidance-v1'
      and setting.source_vocabulary_version = 1
      and vocabulary.source_vocabulary_id is not null
      and source.source_value_key is not null
      and policy.normalization_policy_id is not null
      and taxonomy.taxonomy_id is not null
      and target.ingredient_avoidance_key is not null
  )
  select coalesce(
    pg_catalog.jsonb_agg(distinct target_ingredient_avoidance_key
      order by target_ingredient_avoidance_key),
    '[]'::jsonb
  )
  into v_keys
  from governed;

  select pg_catalog.count(*)::integer
  into v_unresolved_count
  from public.private_user_ingredient_avoidance_settings as setting
  where setting.user_id = v_user_id
    and setting.source_vocabulary_id = 'private-ingredient-avoidance-v1'
    and setting.source_vocabulary_version = 1
    and not exists (
      select 1
      from public.private_ingredient_avoidance_source_vocabularies as vocabulary
      join public.private_ingredient_avoidance_source_values as source
        on source.source_vocabulary_id = vocabulary.source_vocabulary_id
       and source.source_vocabulary_version = vocabulary.source_vocabulary_version
      join public.private_ingredient_avoidance_normalization_mappings as mapping
        on mapping.source_vocabulary_id = source.source_vocabulary_id
       and mapping.source_vocabulary_version = source.source_vocabulary_version
       and mapping.source_value_key = source.source_value_key
      join public.private_ingredient_avoidance_normalization_policies as policy
        on policy.normalization_policy_id = mapping.normalization_policy_id
       and policy.normalization_policy_version = mapping.normalization_policy_version
      join public.candidate_ingredient_avoidance_taxonomies as taxonomy
        on taxonomy.taxonomy_id = mapping.target_taxonomy_id
       and taxonomy.taxonomy_version = mapping.target_taxonomy_version
      join public.candidate_ingredient_avoidance_values as target
        on target.taxonomy_id = mapping.target_taxonomy_id
       and target.taxonomy_version = mapping.target_taxonomy_version
       and target.ingredient_avoidance_key = mapping.target_ingredient_avoidance_key
      where vocabulary.source_vocabulary_id = setting.source_vocabulary_id
        and vocabulary.source_vocabulary_version = setting.source_vocabulary_version
        and vocabulary.source_domain = 'ingredient_avoidance'
        and vocabulary.active and vocabulary.retired_at is null
        and source.source_value_key = setting.source_value_key
        and source.active and source.retired_at is null
        and mapping.normalization_policy_id = 'private-ingredient-avoidance-normalization-v1'
        and mapping.normalization_policy_version = 1
        and mapping.normalized_source_value = setting.source_value_key
        and mapping.target_taxonomy_id = 'tastkind-ingredient-avoidance-v1'
        and mapping.target_taxonomy_version = 1
        and mapping.active and mapping.retired_at is null
        and policy.active and policy.retired_at is null
        and taxonomy.fact_domain = 'ingredient_avoidance_content'
        and taxonomy.active and taxonomy.retired_at is null
        and target.active and target.retired_at is null
    );

  return pg_catalog.jsonb_build_object(
    'source_vocabulary_id', 'private-ingredient-avoidance-v1',
    'source_vocabulary_version', 1,
    'taxonomy_id', 'tastkind-ingredient-avoidance-v1',
    'taxonomy_version', 1,
    'ingredient_avoidance_keys', v_keys,
    'unresolved_selection_count', v_unresolved_count
  );
end;
$$;

comment on function public.read_authenticated_ingredient_avoidance_settings_v1() is
  'REC-D-P1 canonical current-user reader. Returns active stable keys and a coarse unresolved count; no legacy text, Allergy setting, reason, religion, severity, or user identity is returned.';

create function public.replace_authenticated_ingredient_avoidance_settings_v1(
  p_source_value_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_keys text[] := coalesce(p_source_value_keys, '{}'::text[]);
  v_key_count integer;
  v_distinct_count integer;
  v_invalid_key text;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if pg_catalog.array_position(v_keys, null::text) is not null then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_keys) as key
    where key <> pg_catalog.btrim(key) or key = ''
  ) then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;

  v_key_count := coalesce(pg_catalog.array_length(v_keys, 1), 0);
  select pg_catalog.count(distinct key)::integer
  into v_distinct_count
  from pg_catalog.unnest(v_keys) as key;
  if v_key_count <> v_distinct_count then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_DUPLICATE' using errcode = '23505';
  end if;
  if v_key_count > 3 then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select candidate.key
  into v_invalid_key
  from pg_catalog.unnest(v_keys) as candidate(key)
  where not exists (
    select 1
    from public.private_ingredient_avoidance_source_vocabularies as vocabulary
    join public.private_ingredient_avoidance_source_values as source
      on source.source_vocabulary_id = vocabulary.source_vocabulary_id
     and source.source_vocabulary_version = vocabulary.source_vocabulary_version
    join public.private_ingredient_avoidance_normalization_mappings as mapping
      on mapping.source_vocabulary_id = source.source_vocabulary_id
     and mapping.source_vocabulary_version = source.source_vocabulary_version
     and mapping.source_value_key = source.source_value_key
    join public.private_ingredient_avoidance_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
    join public.candidate_ingredient_avoidance_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
    join public.candidate_ingredient_avoidance_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.ingredient_avoidance_key = mapping.target_ingredient_avoidance_key
    where vocabulary.source_vocabulary_id = 'private-ingredient-avoidance-v1'
      and vocabulary.source_vocabulary_version = 1
      and vocabulary.source_domain = 'ingredient_avoidance'
      and vocabulary.active and vocabulary.retired_at is null
      and source.source_value_key = candidate.key
      and source.active and source.retired_at is null
      and mapping.normalization_policy_id = 'private-ingredient-avoidance-normalization-v1'
      and mapping.normalization_policy_version = 1
      and mapping.normalized_source_value = candidate.key
      and mapping.target_taxonomy_id = 'tastkind-ingredient-avoidance-v1'
      and mapping.target_taxonomy_version = 1
      and mapping.active and mapping.retired_at is null
      and policy.active and policy.retired_at is null
      and taxonomy.fact_domain = 'ingredient_avoidance_content'
      and taxonomy.active and taxonomy.retired_at is null
      and target.active and target.retired_at is null
  )
  limit 1;
  if v_invalid_key is not null then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':ingredient_avoidance_settings:v1', 0)
  );

  delete from public.private_user_ingredient_avoidance_settings as setting
  where setting.user_id = v_user_id
    and setting.source_vocabulary_id = 'private-ingredient-avoidance-v1'
    and setting.source_vocabulary_version = 1;

  insert into public.private_user_ingredient_avoidance_settings (
    user_id, source_vocabulary_id, source_vocabulary_version, source_value_key
  )
  select
    v_user_id, 'private-ingredient-avoidance-v1', 1, candidate.key
  from pg_catalog.unnest(v_keys) as candidate(key);

  return public.read_authenticated_ingredient_avoidance_settings_v1();
end;
$$;

comment on function public.replace_authenticated_ingredient_avoidance_settings_v1(text[]) is
  'REC-D-P1 atomic current-user writer. Accepts exact active stable keys only; auth.uid, vocabulary, version, policy, taxonomy, domain, and ownership are server-owned. Empty input clears only REC-D-P1 selections.';

revoke all on function public.read_authenticated_ingredient_avoidance_settings_v1() from public;
revoke all on function public.read_authenticated_ingredient_avoidance_settings_v1() from anon;
revoke all on function public.replace_authenticated_ingredient_avoidance_settings_v1(text[]) from public;
revoke all on function public.replace_authenticated_ingredient_avoidance_settings_v1(text[]) from anon;
grant execute on function public.read_authenticated_ingredient_avoidance_settings_v1() to authenticated;
grant execute on function public.replace_authenticated_ingredient_avoidance_settings_v1(text[]) to authenticated;

commit;
