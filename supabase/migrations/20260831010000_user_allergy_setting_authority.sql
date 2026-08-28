-- REC-C-P1: governed private user Allergy setting authority and writer boundary.
--
-- Existing dietary_restrictions rows remain legacy/unclassified. No row is backfilled and no
-- restriction_type, label or severity text becomes Allergy identity. A row is governed only when
-- the complete source tuple below references the frozen REC-C-P0 allergy source vocabulary.

begin;

alter table public.dietary_restrictions
  add column source_vocabulary_id text,
  add column source_vocabulary_version integer,
  add column source_value_key text,
  add constraint dietary_restrictions_governed_source_tuple_complete check (
    (source_vocabulary_id is null and source_vocabulary_version is null and source_value_key is null)
    or
    (source_vocabulary_id is not null and source_vocabulary_version is not null and source_value_key is not null)
  ),
  add constraint dietary_restrictions_governed_source_fk
    foreign key (source_vocabulary_id, source_vocabulary_version, source_value_key)
    references public.private_restriction_allergen_source_values
      (source_vocabulary_id, source_vocabulary_version, source_value_key)
    on update restrict
    on delete restrict;

comment on column public.dietary_restrictions.source_vocabulary_id is
  'REC-C-P1 governed private source identity. Null means legacy/unclassified; text fields are never canonical Allergy identity.';
comment on column public.dietary_restrictions.source_vocabulary_version is
  'REC-C-P1 governed private source version. All three source columns are null or present together.';
comment on column public.dietary_restrictions.source_value_key is
  'REC-C-P1 governed stable source key. Localized labels remain presentation only.';

-- Preserve legacy uniqueness while ensuring an arbitrary legacy text row can never block a
-- governed selection that happens to use the same compatibility text.
alter table public.dietary_restrictions
  drop constraint dietary_restrictions_unique_label;

create unique index dietary_restrictions_legacy_unique_label_idx
  on public.dietary_restrictions (user_id, restriction_type, label)
  where source_vocabulary_id is null;

create unique index dietary_restrictions_governed_source_unique_idx
  on public.dietary_restrictions
    (user_id, source_vocabulary_id, source_vocabulary_version, source_value_key)
  where source_vocabulary_id is not null;

-- Existing Social pair reads are intentionally blind to governed Allergy settings. This
-- restrictive policy composes with the frozen pair-read policy; owner reads remain private and
-- unaffected. Mobile Taste foundation also applies an explicit null-source query filter.
create policy dietary_restrictions_social_pair_excludes_governed_allergy
  on public.dietary_restrictions
  as restrictive
  for select
  to social_pair_read_authority
  using (source_vocabulary_id is null);

-- The canonical current-user reader returns normalized stable allergen keys and only a coarse
-- unresolved count. It never returns legacy text, restriction_type, label or severity.
create function public.read_authenticated_allergy_settings_v1()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_allergen_keys jsonb;
  v_unresolved_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  with governed as (
    select
      restriction.source_vocabulary_id,
      restriction.source_vocabulary_version,
      restriction.source_value_key,
      mapping.target_allergen_key
    from public.dietary_restrictions as restriction
    left join public.private_restriction_allergen_source_vocabularies as vocabulary
      on vocabulary.source_vocabulary_id = restriction.source_vocabulary_id
     and vocabulary.source_vocabulary_version = restriction.source_vocabulary_version
     and vocabulary.source_domain = 'allergy'
     and vocabulary.active
     and vocabulary.retired_at is null
    left join public.private_restriction_allergen_source_values as source
      on source.source_vocabulary_id = restriction.source_vocabulary_id
     and source.source_vocabulary_version = restriction.source_vocabulary_version
     and source.source_value_key = restriction.source_value_key
     and source.active
     and source.retired_at is null
    left join public.private_restriction_allergen_normalization_mappings as mapping
      on mapping.normalization_policy_id = 'private-restriction-allergen-normalization-v1'
     and mapping.normalization_policy_version = 1
     and mapping.source_vocabulary_id = restriction.source_vocabulary_id
     and mapping.source_vocabulary_version = restriction.source_vocabulary_version
     and mapping.source_value_key = restriction.source_value_key
     and mapping.normalized_source_value = restriction.source_value_key
     and mapping.target_taxonomy_id = 'tastkind-allergen-tw-v1'
     and mapping.target_taxonomy_version = 1
     and mapping.active
     and mapping.retired_at is null
    left join public.private_restriction_allergen_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
     and policy.active
     and policy.retired_at is null
    left join public.candidate_allergen_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
     and taxonomy.active
     and taxonomy.retired_at is null
    left join public.candidate_allergen_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.allergen_key = mapping.target_allergen_key
     and target.active
     and target.retired_at is null
    where restriction.user_id = v_user_id
      and restriction.source_vocabulary_id is not null
      and vocabulary.source_vocabulary_id is not null
      and source.source_value_key is not null
      and policy.normalization_policy_id is not null
      and taxonomy.taxonomy_id is not null
      and target.allergen_key is not null
  )
  select coalesce(pg_catalog.jsonb_agg(distinct target_allergen_key order by target_allergen_key), '[]'::jsonb)
  into v_allergen_keys
  from governed;

  select pg_catalog.count(*)::integer
  into v_unresolved_count
  from public.dietary_restrictions as restriction
  where restriction.user_id = v_user_id
    and restriction.source_vocabulary_id is not null
    and not exists (
      select 1
      from public.private_restriction_allergen_source_vocabularies as vocabulary
      join public.private_restriction_allergen_source_values as source
        on source.source_vocabulary_id = vocabulary.source_vocabulary_id
       and source.source_vocabulary_version = vocabulary.source_vocabulary_version
      join public.private_restriction_allergen_normalization_mappings as mapping
        on mapping.source_vocabulary_id = source.source_vocabulary_id
       and mapping.source_vocabulary_version = source.source_vocabulary_version
       and mapping.source_value_key = source.source_value_key
      join public.private_restriction_allergen_normalization_policies as policy
        on policy.normalization_policy_id = mapping.normalization_policy_id
       and policy.normalization_policy_version = mapping.normalization_policy_version
      join public.candidate_allergen_taxonomies as taxonomy
        on taxonomy.taxonomy_id = mapping.target_taxonomy_id
       and taxonomy.taxonomy_version = mapping.target_taxonomy_version
      join public.candidate_allergen_values as target
        on target.taxonomy_id = mapping.target_taxonomy_id
       and target.taxonomy_version = mapping.target_taxonomy_version
       and target.allergen_key = mapping.target_allergen_key
      where vocabulary.source_vocabulary_id = restriction.source_vocabulary_id
        and vocabulary.source_vocabulary_version = restriction.source_vocabulary_version
        and vocabulary.source_domain = 'allergy'
        and vocabulary.active and vocabulary.retired_at is null
        and source.source_value_key = restriction.source_value_key
        and source.active and source.retired_at is null
        and mapping.normalization_policy_id = 'private-restriction-allergen-normalization-v1'
        and mapping.normalization_policy_version = 1
        and mapping.normalized_source_value = restriction.source_value_key
        and mapping.target_taxonomy_id = 'tastkind-allergen-tw-v1'
        and mapping.target_taxonomy_version = 1
        and mapping.active and mapping.retired_at is null
        and policy.active and policy.retired_at is null
        and taxonomy.active and taxonomy.retired_at is null
        and target.active and target.retired_at is null
    );

  return pg_catalog.jsonb_build_object(
    'source_vocabulary_id', 'private-restriction-allergen-v1',
    'source_vocabulary_version', 1,
    'taxonomy_id', 'tastkind-allergen-tw-v1',
    'taxonomy_version', 1,
    'allergen_keys', v_allergen_keys,
    'unresolved_selection_count', v_unresolved_count
  );
end;
$$;

comment on function public.read_authenticated_allergy_settings_v1() is
  'REC-C-P1 canonical current-user Allergy reader. Returns normalized stable keys and a coarse unresolved count; legacy free text and raw private fields are never returned.';

-- Atomic whole-set writer. The caller supplies only stable source keys; vocabulary, version,
-- domain, normalization policy, compatibility text and ownership are all server-owned.
create function public.replace_authenticated_allergy_settings_v1(
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
    raise exception 'ALLERGY_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.unnest(v_keys) as key where key <> pg_catalog.btrim(key) or key = '') then
    raise exception 'ALLERGY_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;

  v_key_count := coalesce(pg_catalog.array_length(v_keys, 1), 0);
  select pg_catalog.count(distinct key)::integer into v_distinct_count
  from pg_catalog.unnest(v_keys) as key;
  if v_key_count <> v_distinct_count then
    raise exception 'ALLERGY_SOURCE_KEY_DUPLICATE' using errcode = '23505';
  end if;
  if v_key_count > 11 then
    raise exception 'ALLERGY_SOURCE_KEY_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select candidate.key
  into v_invalid_key
  from pg_catalog.unnest(v_keys) as candidate(key)
  where not exists (
    select 1
    from public.private_restriction_allergen_source_vocabularies as vocabulary
    join public.private_restriction_allergen_source_values as source
      on source.source_vocabulary_id = vocabulary.source_vocabulary_id
     and source.source_vocabulary_version = vocabulary.source_vocabulary_version
    join public.private_restriction_allergen_normalization_mappings as mapping
      on mapping.source_vocabulary_id = source.source_vocabulary_id
     and mapping.source_vocabulary_version = source.source_vocabulary_version
     and mapping.source_value_key = source.source_value_key
    join public.private_restriction_allergen_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
    join public.candidate_allergen_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
    join public.candidate_allergen_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.allergen_key = mapping.target_allergen_key
    where vocabulary.source_vocabulary_id = 'private-restriction-allergen-v1'
      and vocabulary.source_vocabulary_version = 1
      and vocabulary.source_domain = 'allergy'
      and vocabulary.active and vocabulary.retired_at is null
      and source.source_value_key = candidate.key
      and source.active and source.retired_at is null
      and mapping.normalization_policy_id = 'private-restriction-allergen-normalization-v1'
      and mapping.normalization_policy_version = 1
      and mapping.normalized_source_value = candidate.key
      and mapping.target_taxonomy_id = 'tastkind-allergen-tw-v1'
      and mapping.target_taxonomy_version = 1
      and mapping.active and mapping.retired_at is null
      and policy.active and policy.retired_at is null
      and taxonomy.active and taxonomy.retired_at is null
      and target.active and target.retired_at is null
  )
  limit 1;
  if v_invalid_key is not null then
    raise exception 'ALLERGY_SOURCE_KEY_NOT_ACTIVE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':allergy_settings:v1', 0)
  );

  delete from public.dietary_restrictions as restriction
  where restriction.user_id = v_user_id
    and restriction.source_vocabulary_id = 'private-restriction-allergen-v1'
    and restriction.source_vocabulary_version = 1;

  insert into public.dietary_restrictions (
    user_id, restriction_type, label, severity, visibility,
    source_vocabulary_id, source_vocabulary_version, source_value_key
  )
  select
    v_user_id, 'governed_allergy', candidate.key, 'unclassified', 'private',
    'private-restriction-allergen-v1', 1, candidate.key
  from pg_catalog.unnest(v_keys) as candidate(key);

  return public.read_authenticated_allergy_settings_v1();
end;
$$;

comment on function public.replace_authenticated_allergy_settings_v1(text[]) is
  'REC-C-P1 atomic current-user Allergy writer. Accepts stable keys only; auth.uid, source vocabulary, version, domain and normalization identity are server-owned. Empty input deselects all governed v1 Allergy settings.';

revoke insert, update, delete on table public.dietary_restrictions from public, anon, authenticated;
revoke all on function public.read_authenticated_allergy_settings_v1() from public;
revoke all on function public.read_authenticated_allergy_settings_v1() from anon;
revoke all on function public.replace_authenticated_allergy_settings_v1(text[]) from public;
revoke all on function public.replace_authenticated_allergy_settings_v1(text[]) from anon;
grant execute on function public.read_authenticated_allergy_settings_v1() to authenticated;
grant execute on function public.replace_authenticated_allergy_settings_v1(text[]) to authenticated;

commit;
