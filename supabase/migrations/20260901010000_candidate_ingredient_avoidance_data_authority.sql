-- REC-D-P0: candidate ingredient-avoidance vocabulary, known-present facts, and coverage.
-- Candidate-data authority only: no user writes, eligibility, exclusion, warning, score, rank,
-- religious inference, or compatibility. Missing facts remain unknown. Allergen coverage is separate.

begin;

create type public.candidate_ingredient_avoidance_provenance as enum (
  'restaurant_verified',
  'admin_verified',
  'provider_verified'
);

create type public.candidate_ingredient_avoidance_coverage_state as enum (
  'unknown',
  'partial',
  'complete'
);

create table public.candidate_ingredient_avoidance_taxonomies (
  taxonomy_id text not null check (taxonomy_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  taxonomy_version integer not null check (taxonomy_version > 0),
  fact_domain text not null check (fact_domain = 'ingredient_avoidance_content'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_id, taxonomy_version),
  constraint cia_taxonomies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index cia_taxonomies_one_active_idx
  on public.candidate_ingredient_avoidance_taxonomies (fact_domain) where active;

create table public.candidate_ingredient_avoidance_values (
  taxonomy_id text not null,
  taxonomy_version integer not null,
  ingredient_avoidance_key text not null
    check (ingredient_avoidance_key ~ '^[a-z0-9][a-z0-9_]{0,62}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_id, taxonomy_version, ingredient_avoidance_key),
  foreign key (taxonomy_id, taxonomy_version)
    references public.candidate_ingredient_avoidance_taxonomies
      (taxonomy_id, taxonomy_version) on delete restrict,
  constraint cia_values_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.candidate_ingredient_avoidance_value_labels (
  taxonomy_id text not null,
  taxonomy_version integer not null,
  ingredient_avoidance_key text not null,
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  label text not null check (pg_catalog.btrim(label) <> ''),
  primary key (taxonomy_id, taxonomy_version, ingredient_avoidance_key, locale),
  foreign key (taxonomy_id, taxonomy_version, ingredient_avoidance_key)
    references public.candidate_ingredient_avoidance_values
      (taxonomy_id, taxonomy_version, ingredient_avoidance_key) on delete cascade
);

create table public.private_ingredient_avoidance_source_vocabularies (
  source_vocabulary_id text not null
    check (source_vocabulary_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  source_vocabulary_version integer not null check (source_vocabulary_version > 0),
  source_domain text not null check (source_domain = 'ingredient_avoidance'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_vocabulary_id, source_vocabulary_version),
  constraint pia_vocabularies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_ingredient_avoidance_source_values (
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_value_key text not null
    check (source_value_key ~ '^[a-z0-9][a-z0-9_]{0,62}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_vocabulary_id, source_vocabulary_version, source_value_key),
  foreign key (source_vocabulary_id, source_vocabulary_version)
    references public.private_ingredient_avoidance_source_vocabularies
      (source_vocabulary_id, source_vocabulary_version) on delete restrict,
  constraint pia_source_values_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_ingredient_avoidance_source_value_labels (
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_value_key text not null,
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  label text not null check (pg_catalog.btrim(label) <> ''),
  primary key (source_vocabulary_id, source_vocabulary_version, source_value_key, locale),
  foreign key (source_vocabulary_id, source_vocabulary_version, source_value_key)
    references public.private_ingredient_avoidance_source_values
      (source_vocabulary_id, source_vocabulary_version, source_value_key) on delete cascade
);

create table public.private_ingredient_avoidance_normalization_policies (
  normalization_policy_id text not null
    check (normalization_policy_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  normalization_policy_version integer not null check (normalization_policy_version > 0),
  target_taxonomy_id text not null,
  target_taxonomy_version integer not null,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (normalization_policy_id, normalization_policy_version),
  foreign key (target_taxonomy_id, target_taxonomy_version)
    references public.candidate_ingredient_avoidance_taxonomies
      (taxonomy_id, taxonomy_version) on delete restrict,
  constraint pia_policies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_ingredient_avoidance_normalization_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  normalization_policy_id text not null,
  normalization_policy_version integer not null,
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_value_key text not null,
  normalized_source_value text not null
    check (normalized_source_value = normalize(pg_catalog.btrim(normalized_source_value), NFC)),
  alias_kind text not null check (alias_kind = 'stable_key'),
  target_taxonomy_id text not null,
  target_taxonomy_version integer not null,
  target_ingredient_avoidance_key text not null,
  mapping_authority text not null check (mapping_authority = 'product_authorized'),
  audit_reference text not null
    check (pg_catalog.btrim(audit_reference) <> '' and pg_catalog.length(audit_reference) <= 500),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (normalization_policy_id, normalization_policy_version)
    references public.private_ingredient_avoidance_normalization_policies
      (normalization_policy_id, normalization_policy_version) on delete restrict,
  foreign key (source_vocabulary_id, source_vocabulary_version, source_value_key)
    references public.private_ingredient_avoidance_source_values
      (source_vocabulary_id, source_vocabulary_version, source_value_key) on delete restrict,
  foreign key (target_taxonomy_id, target_taxonomy_version, target_ingredient_avoidance_key)
    references public.candidate_ingredient_avoidance_values
      (taxonomy_id, taxonomy_version, ingredient_avoidance_key) on delete restrict,
  constraint pia_mappings_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index pia_active_mapping_idx
  on public.private_ingredient_avoidance_normalization_mappings
    (normalization_policy_id, normalization_policy_version,
     source_vocabulary_id, source_vocabulary_version, normalized_source_value)
  where active;

create table public.candidate_ingredient_avoidance_facts (
  fact_id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  menu_item_id text not null,
  taxonomy_id text not null,
  taxonomy_version integer not null,
  ingredient_avoidance_key text not null,
  fact_domain text not null default 'ingredient_avoidance_content'
    check (fact_domain = 'ingredient_avoidance_content'),
  provenance public.candidate_ingredient_avoidance_provenance not null,
  source_reference text not null
    check (pg_catalog.btrim(source_reference) <> '' and pg_catalog.length(source_reference) <= 500),
  established_at timestamptz not null,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (candidate_id, menu_item_id)
    references public.branch_menu_items (id, menu_item_id) on delete restrict,
  foreign key (taxonomy_id, taxonomy_version, ingredient_avoidance_key)
    references public.candidate_ingredient_avoidance_values
      (taxonomy_id, taxonomy_version, ingredient_avoidance_key) on delete restrict,
  constraint cia_facts_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index cia_facts_active_fact_idx
  on public.candidate_ingredient_avoidance_facts
    (candidate_id, taxonomy_id, taxonomy_version, fact_domain, ingredient_avoidance_key)
  where active;

create index cia_facts_active_candidate_idx
  on public.candidate_ingredient_avoidance_facts
    (candidate_id, taxonomy_id, taxonomy_version) where active;

create table public.candidate_ingredient_avoidance_coverage (
  coverage_id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  menu_item_id text not null,
  taxonomy_id text not null,
  taxonomy_version integer not null,
  fact_domain text not null default 'ingredient_avoidance_content'
    check (fact_domain = 'ingredient_avoidance_content'),
  coverage_state public.candidate_ingredient_avoidance_coverage_state not null default 'unknown',
  provenance public.candidate_ingredient_avoidance_provenance,
  source_reference text,
  established_at timestamptz,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (candidate_id, menu_item_id)
    references public.branch_menu_items (id, menu_item_id) on delete restrict,
  foreign key (taxonomy_id, taxonomy_version)
    references public.candidate_ingredient_avoidance_taxonomies
      (taxonomy_id, taxonomy_version) on delete restrict,
  constraint cia_coverage_evidence check (
    (coverage_state = 'unknown'
      and provenance is null and source_reference is null and established_at is null)
    or
    (coverage_state = 'partial'
      and provenance is not null
      and source_reference is not null and pg_catalog.btrim(source_reference) <> ''
      and pg_catalog.length(source_reference) <= 500 and established_at is not null)
    or
    (coverage_state = 'complete'
      and provenance in ('restaurant_verified', 'admin_verified')
      and source_reference is not null and pg_catalog.btrim(source_reference) <> ''
      and pg_catalog.length(source_reference) <= 500 and established_at is not null)
  ),
  constraint cia_coverage_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index cia_coverage_active_candidate_idx
  on public.candidate_ingredient_avoidance_coverage
    (candidate_id, taxonomy_id, taxonomy_version, fact_domain) where active;

comment on table public.candidate_ingredient_avoidance_facts is
  'REC-D-P0 branch-offer-scoped known-present intentional pork, beef, or coriander facts. Missing rows are unknown; no restaurant inheritance, allergen meaning, or religious conclusion exists.';
comment on table public.candidate_ingredient_avoidance_coverage is
  'REC-D-P0 coverage only for ingredient_avoidance_content. Complete means all three active v1 keys were assessed; it says nothing about allergens, halal, vegetarian, vegan, religion, ethics, cross-contact, or compatibility.';

insert into public.candidate_ingredient_avoidance_taxonomies
  (taxonomy_id, taxonomy_version, fact_domain)
values ('tastkind-ingredient-avoidance-v1', 1, 'ingredient_avoidance_content');

insert into public.candidate_ingredient_avoidance_values
  (taxonomy_id, taxonomy_version, ingredient_avoidance_key)
values
  ('tastkind-ingredient-avoidance-v1', 1, 'pork'),
  ('tastkind-ingredient-avoidance-v1', 1, 'beef'),
  ('tastkind-ingredient-avoidance-v1', 1, 'coriander');

insert into public.candidate_ingredient_avoidance_value_labels
  (taxonomy_id, taxonomy_version, ingredient_avoidance_key, locale, label)
values
  ('tastkind-ingredient-avoidance-v1', 1, 'pork', 'zh-TW', '豬肉／豬來源成分'),
  ('tastkind-ingredient-avoidance-v1', 1, 'beef', 'zh-TW', '牛肉／牛來源成分'),
  ('tastkind-ingredient-avoidance-v1', 1, 'coriander', 'zh-TW', '香菜');

insert into public.private_ingredient_avoidance_source_vocabularies
  (source_vocabulary_id, source_vocabulary_version, source_domain)
values ('private-ingredient-avoidance-v1', 1, 'ingredient_avoidance');

insert into public.private_ingredient_avoidance_source_values
  (source_vocabulary_id, source_vocabulary_version, source_value_key)
values
  ('private-ingredient-avoidance-v1', 1, 'pork'),
  ('private-ingredient-avoidance-v1', 1, 'beef'),
  ('private-ingredient-avoidance-v1', 1, 'coriander');

insert into public.private_ingredient_avoidance_source_value_labels
  (source_vocabulary_id, source_vocabulary_version, source_value_key, locale, label)
values
  ('private-ingredient-avoidance-v1', 1, 'pork', 'zh-TW', '豬肉／豬來源成分'),
  ('private-ingredient-avoidance-v1', 1, 'beef', 'zh-TW', '牛肉／牛來源成分'),
  ('private-ingredient-avoidance-v1', 1, 'coriander', 'zh-TW', '香菜');

insert into public.private_ingredient_avoidance_normalization_policies
  (normalization_policy_id, normalization_policy_version,
   target_taxonomy_id, target_taxonomy_version)
values ('private-ingredient-avoidance-normalization-v1', 1,
  'tastkind-ingredient-avoidance-v1', 1);

insert into public.private_ingredient_avoidance_normalization_mappings
  (normalization_policy_id, normalization_policy_version,
   source_vocabulary_id, source_vocabulary_version, source_value_key,
   normalized_source_value, alias_kind,
   target_taxonomy_id, target_taxonomy_version, target_ingredient_avoidance_key,
   mapping_authority, audit_reference)
select
  'private-ingredient-avoidance-normalization-v1', 1,
  source.source_vocabulary_id, source.source_vocabulary_version, source.source_value_key,
  source.source_value_key, 'stable_key',
  'tastkind-ingredient-avoidance-v1', 1, source.source_value_key,
  'product_authorized', 'REC-D-P0 product authority: exact stable key'
from public.private_ingredient_avoidance_source_values as source
where source.source_vocabulary_id = 'private-ingredient-avoidance-v1'
  and source.source_vocabulary_version = 1;

create role candidate_ingredient_avoidance_write_authority
  with nologin noinherit nobypassrls;
grant usage on schema public to candidate_ingredient_avoidance_write_authority;

alter table public.candidate_ingredient_avoidance_taxonomies enable row level security;
alter table public.candidate_ingredient_avoidance_values enable row level security;
alter table public.candidate_ingredient_avoidance_value_labels enable row level security;
alter table public.private_ingredient_avoidance_source_vocabularies enable row level security;
alter table public.private_ingredient_avoidance_source_values enable row level security;
alter table public.private_ingredient_avoidance_source_value_labels enable row level security;
alter table public.private_ingredient_avoidance_normalization_policies enable row level security;
alter table public.private_ingredient_avoidance_normalization_mappings enable row level security;
alter table public.candidate_ingredient_avoidance_facts enable row level security;
alter table public.candidate_ingredient_avoidance_coverage enable row level security;

create policy cia_taxonomies_write on public.candidate_ingredient_avoidance_taxonomies
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy cia_values_write on public.candidate_ingredient_avoidance_values
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy cia_labels_write on public.candidate_ingredient_avoidance_value_labels
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy pia_vocabularies_write on public.private_ingredient_avoidance_source_vocabularies
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy pia_source_values_write on public.private_ingredient_avoidance_source_values
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy pia_source_labels_write on public.private_ingredient_avoidance_source_value_labels
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy pia_policies_write on public.private_ingredient_avoidance_normalization_policies
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy pia_mappings_write on public.private_ingredient_avoidance_normalization_mappings
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy cia_facts_write on public.candidate_ingredient_avoidance_facts
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);
create policy cia_coverage_write on public.candidate_ingredient_avoidance_coverage
  for all to candidate_ingredient_avoidance_write_authority using (true) with check (true);

revoke all on table public.candidate_ingredient_avoidance_taxonomies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_ingredient_avoidance_values from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_ingredient_avoidance_value_labels from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_ingredient_avoidance_source_vocabularies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_ingredient_avoidance_source_values from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_ingredient_avoidance_source_value_labels from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_ingredient_avoidance_normalization_policies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_ingredient_avoidance_normalization_mappings from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_ingredient_avoidance_facts from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_ingredient_avoidance_coverage from public, anon, authenticated, authenticator, service_role;

grant select, insert, update, delete on table public.candidate_ingredient_avoidance_taxonomies to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.candidate_ingredient_avoidance_values to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.candidate_ingredient_avoidance_value_labels to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.private_ingredient_avoidance_source_vocabularies to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.private_ingredient_avoidance_source_values to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.private_ingredient_avoidance_source_value_labels to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.private_ingredient_avoidance_normalization_policies to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.private_ingredient_avoidance_normalization_mappings to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.candidate_ingredient_avoidance_facts to candidate_ingredient_avoidance_write_authority;
grant select, insert, update, delete on table public.candidate_ingredient_avoidance_coverage to candidate_ingredient_avoidance_write_authority;

create view public.consumer_authenticated_candidate_avoidance_facts_v1
with (security_barrier = true) as
select
  candidate.candidate_id,
  candidate.restaurant_id,
  candidate.branch_id,
  candidate.menu_item_id,
  fact.taxonomy_id,
  fact.taxonomy_version,
  fact.fact_domain,
  fact.ingredient_avoidance_key
from public.consumer_public_next_meal_candidates_v1 as candidate
join public.candidate_ingredient_avoidance_facts as fact
  on fact.candidate_id = candidate.candidate_id
 and fact.menu_item_id = candidate.menu_item_id
join public.candidate_ingredient_avoidance_taxonomies as taxonomy
  on taxonomy.taxonomy_id = fact.taxonomy_id
 and taxonomy.taxonomy_version = fact.taxonomy_version
join public.candidate_ingredient_avoidance_values as value
  on value.taxonomy_id = fact.taxonomy_id
 and value.taxonomy_version = fact.taxonomy_version
 and value.ingredient_avoidance_key = fact.ingredient_avoidance_key
where fact.active and fact.retired_at is null
  and taxonomy.active and taxonomy.retired_at is null
  and value.active and value.retired_at is null
order by candidate.candidate_id, fact.ingredient_avoidance_key, fact.fact_id;

create view public.consumer_authenticated_candidate_avoidance_coverage_v1
with (security_barrier = true) as
with active_taxonomy as (
  select taxonomy_id, taxonomy_version, fact_domain
  from public.candidate_ingredient_avoidance_taxonomies
  where active and retired_at is null
)
select
  candidate.candidate_id,
  candidate.restaurant_id,
  candidate.branch_id,
  candidate.menu_item_id,
  taxonomy.taxonomy_id,
  taxonomy.taxonomy_version,
  taxonomy.fact_domain,
  coalesce(coverage.coverage_state,
    'unknown'::public.candidate_ingredient_avoidance_coverage_state)::text as coverage_state
from public.consumer_public_next_meal_candidates_v1 as candidate
cross join active_taxonomy as taxonomy
left join public.candidate_ingredient_avoidance_coverage as coverage
  on coverage.candidate_id = candidate.candidate_id
 and coverage.menu_item_id = candidate.menu_item_id
 and coverage.taxonomy_id = taxonomy.taxonomy_id
 and coverage.taxonomy_version = taxonomy.taxonomy_version
 and coverage.fact_domain = taxonomy.fact_domain
 and coverage.active and coverage.retired_at is null
order by candidate.candidate_id;

comment on view public.consumer_authenticated_candidate_avoidance_facts_v1 is
  'REC-D-P0 known-present ingredient-avoidance facts by branch-offer candidate. No provenance, user, reason, religion, compatibility, known-absent, safety, score, or rank output.';
comment on view public.consumer_authenticated_candidate_avoidance_coverage_v1 is
  'REC-D-P0 one-row-per-candidate ingredient_avoidance_content coverage. Unknown and partial never establish absence; complete is independent of allergen_content.';

revoke all on public.consumer_authenticated_candidate_avoidance_facts_v1 from public, anon, service_role;
revoke all on public.consumer_authenticated_candidate_avoidance_coverage_v1 from public, anon, service_role;
grant select on public.consumer_authenticated_candidate_avoidance_facts_v1 to authenticated;
grant select on public.consumer_authenticated_candidate_avoidance_coverage_v1 to authenticated;

commit;
