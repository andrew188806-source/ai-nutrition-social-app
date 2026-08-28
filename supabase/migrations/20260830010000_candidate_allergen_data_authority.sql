-- REC-C-P0: canonical candidate allergen-content vocabulary, facts, provenance, and coverage.
--
-- This migration establishes known-present data authority only. It performs no user-specific
-- eligibility, exclusion, warning, scoring, ranking, cross-contact assessment, or medical-safety
-- claim. Legacy menu_items.allergens remains raw source evidence and is never treated as absence.

begin;

create type public.candidate_allergen_provenance as enum (
  'restaurant_verified',
  'admin_verified',
  'provider_verified'
);

create type public.candidate_allergen_coverage_state as enum (
  'unknown',
  'partial',
  'complete'
);

create table public.candidate_allergen_taxonomies (
  taxonomy_id text not null
    check (taxonomy_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  taxonomy_version integer not null check (taxonomy_version > 0),
  fact_domain text not null check (fact_domain = 'allergen_content'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_id, taxonomy_version),
  constraint candidate_allergen_taxonomies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index candidate_allergen_taxonomies_one_active_idx
  on public.candidate_allergen_taxonomies (fact_domain)
  where active;

create table public.candidate_allergen_values (
  taxonomy_id text not null,
  taxonomy_version integer not null,
  allergen_key text not null
    check (allergen_key ~ '^[a-z0-9][a-z0-9_]{0,62}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_id, taxonomy_version, allergen_key),
  foreign key (taxonomy_id, taxonomy_version)
    references public.candidate_allergen_taxonomies (taxonomy_id, taxonomy_version)
    on delete restrict,
  constraint candidate_allergen_values_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.candidate_allergen_value_labels (
  taxonomy_id text not null,
  taxonomy_version integer not null,
  allergen_key text not null,
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  label text not null check (pg_catalog.btrim(label) <> ''),
  primary key (taxonomy_id, taxonomy_version, allergen_key, locale),
  foreign key (taxonomy_id, taxonomy_version, allergen_key)
    references public.candidate_allergen_values (taxonomy_id, taxonomy_version, allergen_key)
    on delete cascade
);

create table public.private_restriction_allergen_normalization_policies (
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
    references public.candidate_allergen_taxonomies (taxonomy_id, taxonomy_version)
    on delete restrict,
  constraint private_restriction_allergen_policies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_restriction_allergen_source_vocabularies (
  source_vocabulary_id text not null
    check (source_vocabulary_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  source_vocabulary_version integer not null check (source_vocabulary_version > 0),
  source_domain text not null check (source_domain = 'allergy'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_vocabulary_id, source_vocabulary_version),
  constraint private_restriction_allergen_vocabularies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_restriction_allergen_source_values (
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_value_key text not null
    check (source_value_key ~ '^[a-z0-9][a-z0-9_]{0,62}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_vocabulary_id, source_vocabulary_version, source_value_key),
  foreign key (source_vocabulary_id, source_vocabulary_version)
    references public.private_restriction_allergen_source_vocabularies
      (source_vocabulary_id, source_vocabulary_version)
    on delete restrict,
  constraint private_restriction_allergen_source_values_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_restriction_allergen_source_value_labels (
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_value_key text not null,
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  label text not null check (pg_catalog.btrim(label) <> ''),
  primary key (source_vocabulary_id, source_vocabulary_version, source_value_key, locale),
  foreign key (source_vocabulary_id, source_vocabulary_version, source_value_key)
    references public.private_restriction_allergen_source_values
      (source_vocabulary_id, source_vocabulary_version, source_value_key)
    on delete cascade
);

create table public.private_restriction_allergen_normalization_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  normalization_policy_id text not null,
  normalization_policy_version integer not null,
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_value_key text not null,
  normalized_source_value text not null
    check (normalized_source_value = normalize(pg_catalog.btrim(normalized_source_value), NFC)),
  alias_kind text not null check (alias_kind in ('stable_key', 'localized_label', 'governed_alias')),
  source_locale text,
  target_taxonomy_id text not null,
  target_taxonomy_version integer not null,
  target_allergen_key text not null,
  mapping_authority text not null check (mapping_authority = 'product_authorized'),
  audit_reference text not null
    check (pg_catalog.btrim(audit_reference) <> '' and pg_catalog.length(audit_reference) <= 500),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (normalization_policy_id, normalization_policy_version)
    references public.private_restriction_allergen_normalization_policies
      (normalization_policy_id, normalization_policy_version)
    on delete restrict,
  foreign key (source_vocabulary_id, source_vocabulary_version, source_value_key)
    references public.private_restriction_allergen_source_values
      (source_vocabulary_id, source_vocabulary_version, source_value_key)
    on delete restrict,
  foreign key (target_taxonomy_id, target_taxonomy_version, target_allergen_key)
    references public.candidate_allergen_values
      (taxonomy_id, taxonomy_version, allergen_key)
    on delete restrict,
  constraint private_restriction_allergen_mappings_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index private_restriction_allergen_active_alias_idx
  on public.private_restriction_allergen_normalization_mappings
    (normalization_policy_id, normalization_policy_version,
     source_vocabulary_id, source_vocabulary_version, normalized_source_value)
  where active;

create table public.legacy_candidate_allergen_normalization_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  source_vocabulary_id text not null
    check (source_vocabulary_id = 'legacy-menu-items-allergens-v1'),
  source_vocabulary_version integer not null check (source_vocabulary_version = 1),
  normalized_source_value text not null
    check (normalized_source_value = normalize(pg_catalog.btrim(normalized_source_value), NFC)),
  target_taxonomy_id text not null,
  target_taxonomy_version integer not null,
  target_allergen_key text not null,
  mapping_authority text not null check (mapping_authority = 'product_authorized'),
  audit_reference text not null
    check (pg_catalog.btrim(audit_reference) <> '' and pg_catalog.length(audit_reference) <= 500),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (target_taxonomy_id, target_taxonomy_version, target_allergen_key)
    references public.candidate_allergen_values
      (taxonomy_id, taxonomy_version, allergen_key)
    on delete restrict,
  constraint legacy_candidate_allergen_mappings_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index legacy_candidate_allergen_active_alias_idx
  on public.legacy_candidate_allergen_normalization_mappings
    (source_vocabulary_id, source_vocabulary_version, normalized_source_value)
  where active;

-- The redundant pair is the exact branch-offer/menu identity used by recommendation candidates.
-- It prevents an asserted fact from pairing one offer with another menu item.
alter table public.branch_menu_items
  add constraint branch_menu_items_id_menu_item_id_key unique (id, menu_item_id);

create table public.candidate_allergen_facts (
  fact_id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  menu_item_id text not null,
  taxonomy_id text not null,
  taxonomy_version integer not null,
  allergen_key text not null,
  fact_domain text not null default 'allergen_content'
    check (fact_domain = 'allergen_content'),
  provenance public.candidate_allergen_provenance not null,
  source_reference text not null
    check (pg_catalog.btrim(source_reference) <> '' and pg_catalog.length(source_reference) <= 500),
  established_at timestamptz not null,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (candidate_id, menu_item_id)
    references public.branch_menu_items (id, menu_item_id) on delete restrict,
  foreign key (taxonomy_id, taxonomy_version, allergen_key)
    references public.candidate_allergen_values (taxonomy_id, taxonomy_version, allergen_key)
    on delete restrict,
  constraint candidate_allergen_facts_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index candidate_allergen_facts_active_fact_idx
  on public.candidate_allergen_facts
    (candidate_id, taxonomy_id, taxonomy_version, fact_domain, allergen_key)
  where active;

create index candidate_allergen_facts_active_candidate_idx
  on public.candidate_allergen_facts (candidate_id, taxonomy_id, taxonomy_version)
  where active;

create table public.candidate_allergen_coverage (
  coverage_id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  menu_item_id text not null,
  taxonomy_id text not null,
  taxonomy_version integer not null,
  fact_domain text not null default 'allergen_content'
    check (fact_domain = 'allergen_content'),
  coverage_state public.candidate_allergen_coverage_state not null default 'unknown',
  provenance public.candidate_allergen_provenance,
  source_reference text,
  established_at timestamptz,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (candidate_id, menu_item_id)
    references public.branch_menu_items (id, menu_item_id) on delete restrict,
  foreign key (taxonomy_id, taxonomy_version)
    references public.candidate_allergen_taxonomies (taxonomy_id, taxonomy_version)
    on delete restrict,
  constraint candidate_allergen_coverage_evidence
    check (
      (coverage_state = 'unknown'
        and provenance is null and source_reference is null and established_at is null)
      or
      (coverage_state = 'partial'
        and provenance is not null
        and source_reference is not null and pg_catalog.btrim(source_reference) <> ''
        and pg_catalog.length(source_reference) <= 500
        and established_at is not null)
      or
      (coverage_state = 'complete'
        and provenance in ('restaurant_verified', 'admin_verified')
        and source_reference is not null and pg_catalog.btrim(source_reference) <> ''
        and pg_catalog.length(source_reference) <= 500
        and established_at is not null)
    ),
  constraint candidate_allergen_coverage_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index candidate_allergen_coverage_active_candidate_idx
  on public.candidate_allergen_coverage
    (candidate_id, taxonomy_id, taxonomy_version, fact_domain)
  where active;

comment on table public.candidate_allergen_facts is
  'REC-C-P0 branch-offer-scoped known-present intentional ingredient/additive allergen facts. Missing rows are never known-absent. No restaurant inheritance.';
comment on table public.candidate_allergen_coverage is
  'REC-C-P0 domain-specific assessment coverage. complete means all eleven tastkind-allergen-tw-v1 content keys were assessed at the recorded source/time; it says nothing about cross-contact, recipe permanence, medical suitability, or allergy safety.';
comment on table public.legacy_candidate_allergen_normalization_mappings is
  'Exact product-authorized normalization for legacy menu_items.allergens raw values. A mapping is vocabulary translation only and never creates a trusted fact or coverage assertion.';

insert into public.candidate_allergen_taxonomies
  (taxonomy_id, taxonomy_version, fact_domain)
values ('tastkind-allergen-tw-v1', 1, 'allergen_content');

insert into public.candidate_allergen_values
  (taxonomy_id, taxonomy_version, allergen_key)
values
  ('tastkind-allergen-tw-v1', 1, 'crustacean'),
  ('tastkind-allergen-tw-v1', 1, 'mango'),
  ('tastkind-allergen-tw-v1', 1, 'peanut'),
  ('tastkind-allergen-tw-v1', 1, 'milk'),
  ('tastkind-allergen-tw-v1', 1, 'egg'),
  ('tastkind-allergen-tw-v1', 1, 'tree_nut'),
  ('tastkind-allergen-tw-v1', 1, 'sesame'),
  ('tastkind-allergen-tw-v1', 1, 'gluten_containing_cereal'),
  ('tastkind-allergen-tw-v1', 1, 'soy'),
  ('tastkind-allergen-tw-v1', 1, 'fish'),
  ('tastkind-allergen-tw-v1', 1, 'sulfites_ge_10mg_per_kg');

insert into public.candidate_allergen_value_labels
  (taxonomy_id, taxonomy_version, allergen_key, locale, label)
values
  ('tastkind-allergen-tw-v1', 1, 'crustacean', 'zh-TW', '甲殼類'),
  ('tastkind-allergen-tw-v1', 1, 'mango', 'zh-TW', '芒果'),
  ('tastkind-allergen-tw-v1', 1, 'peanut', 'zh-TW', '花生'),
  ('tastkind-allergen-tw-v1', 1, 'milk', 'zh-TW', '牛奶／羊奶'),
  ('tastkind-allergen-tw-v1', 1, 'egg', 'zh-TW', '蛋'),
  ('tastkind-allergen-tw-v1', 1, 'tree_nut', 'zh-TW', '堅果類'),
  ('tastkind-allergen-tw-v1', 1, 'sesame', 'zh-TW', '芝麻'),
  ('tastkind-allergen-tw-v1', 1, 'gluten_containing_cereal', 'zh-TW', '含麩質之穀物'),
  ('tastkind-allergen-tw-v1', 1, 'soy', 'zh-TW', '大豆'),
  ('tastkind-allergen-tw-v1', 1, 'fish', 'zh-TW', '魚類'),
  ('tastkind-allergen-tw-v1', 1, 'sulfites_ge_10mg_per_kg', 'zh-TW', '亞硫酸鹽（SO₂ ≥ 10 mg/kg）');

insert into public.private_restriction_allergen_normalization_policies
  (normalization_policy_id, normalization_policy_version, target_taxonomy_id, target_taxonomy_version)
values ('private-restriction-allergen-normalization-v1', 1, 'tastkind-allergen-tw-v1', 1);

insert into public.private_restriction_allergen_source_vocabularies
  (source_vocabulary_id, source_vocabulary_version, source_domain)
values ('private-restriction-allergen-v1', 1, 'allergy');

insert into public.private_restriction_allergen_source_values
  (source_vocabulary_id, source_vocabulary_version, source_value_key)
select 'private-restriction-allergen-v1', 1, allergen_key
from public.candidate_allergen_values
where taxonomy_id = 'tastkind-allergen-tw-v1' and taxonomy_version = 1;

insert into public.private_restriction_allergen_source_value_labels
  (source_vocabulary_id, source_vocabulary_version, source_value_key, locale, label)
select 'private-restriction-allergen-v1', 1, allergen_key, locale, label
from public.candidate_allergen_value_labels
where taxonomy_id = 'tastkind-allergen-tw-v1' and taxonomy_version = 1;

insert into public.private_restriction_allergen_normalization_mappings
  (normalization_policy_id, normalization_policy_version,
   source_vocabulary_id, source_vocabulary_version, source_value_key,
   normalized_source_value, alias_kind, source_locale,
   target_taxonomy_id, target_taxonomy_version, target_allergen_key,
   mapping_authority, audit_reference)
select
  'private-restriction-allergen-normalization-v1', 1,
  source.source_vocabulary_id, source.source_vocabulary_version, source.source_value_key,
  source.source_value_key, 'stable_key', null,
  'tastkind-allergen-tw-v1', 1, source.source_value_key,
  'product_authorized', 'REC-C-P0 product authority addendum: stable key'
from public.private_restriction_allergen_source_values as source
where source.source_vocabulary_id = 'private-restriction-allergen-v1'
  and source.source_vocabulary_version = 1;

insert into public.private_restriction_allergen_normalization_mappings
  (normalization_policy_id, normalization_policy_version,
   source_vocabulary_id, source_vocabulary_version, source_value_key,
   normalized_source_value, alias_kind, source_locale,
   target_taxonomy_id, target_taxonomy_version, target_allergen_key,
   mapping_authority, audit_reference)
select
  'private-restriction-allergen-normalization-v1', 1,
  label.source_vocabulary_id, label.source_vocabulary_version, label.source_value_key,
  label.label, 'localized_label', label.locale,
  'tastkind-allergen-tw-v1', 1, label.source_value_key,
  'product_authorized', 'REC-C-P0 product authority addendum: exact zh-TW label'
from public.private_restriction_allergen_source_value_labels as label
where label.source_vocabulary_id = 'private-restriction-allergen-v1'
  and label.source_vocabulary_version = 1
  and label.locale = 'zh-TW';

insert into public.legacy_candidate_allergen_normalization_mappings
  (source_vocabulary_id, source_vocabulary_version, normalized_source_value,
   target_taxonomy_id, target_taxonomy_version, target_allergen_key,
   mapping_authority, audit_reference)
values
  ('legacy-menu-items-allergens-v1', 1, 'fish', 'tastkind-allergen-tw-v1', 1, 'fish',
   'product_authorized', 'REC-C-P0 product authority addendum: raw fish'),
  ('legacy-menu-items-allergens-v1', 1, 'soy', 'tastkind-allergen-tw-v1', 1, 'soy',
   'product_authorized', 'REC-C-P0 product authority addendum: raw soy'),
  ('legacy-menu-items-allergens-v1', 1, 'egg', 'tastkind-allergen-tw-v1', 1, 'egg',
   'product_authorized', 'REC-C-P0 product authority addendum: raw egg'),
  ('legacy-menu-items-allergens-v1', 1, 'wheat', 'tastkind-allergen-tw-v1', 1, 'gluten_containing_cereal',
   'product_authorized', 'REC-C-P0 product authority addendum: raw wheat'),
  ('legacy-menu-items-allergens-v1', 1, 'peanut', 'tastkind-allergen-tw-v1', 1, 'peanut',
   'product_authorized', 'REC-C-P0 product authority addendum: raw peanut');

create role candidate_allergen_write_authority with nologin noinherit nobypassrls;
grant usage on schema public to candidate_allergen_write_authority;

alter table public.candidate_allergen_taxonomies enable row level security;
alter table public.candidate_allergen_values enable row level security;
alter table public.candidate_allergen_value_labels enable row level security;
alter table public.private_restriction_allergen_normalization_policies enable row level security;
alter table public.private_restriction_allergen_source_vocabularies enable row level security;
alter table public.private_restriction_allergen_source_values enable row level security;
alter table public.private_restriction_allergen_source_value_labels enable row level security;
alter table public.private_restriction_allergen_normalization_mappings enable row level security;
alter table public.legacy_candidate_allergen_normalization_mappings enable row level security;
alter table public.candidate_allergen_facts enable row level security;
alter table public.candidate_allergen_coverage enable row level security;

create policy candidate_allergen_taxonomies_write_authority on public.candidate_allergen_taxonomies
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy candidate_allergen_values_write_authority on public.candidate_allergen_values
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy candidate_allergen_value_labels_write_authority on public.candidate_allergen_value_labels
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy private_restriction_allergen_policies_write_authority
  on public.private_restriction_allergen_normalization_policies
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy private_restriction_allergen_vocabularies_write_authority
  on public.private_restriction_allergen_source_vocabularies
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy private_restriction_allergen_values_write_authority
  on public.private_restriction_allergen_source_values
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy private_restriction_allergen_labels_write_authority
  on public.private_restriction_allergen_source_value_labels
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy private_restriction_allergen_mappings_write_authority
  on public.private_restriction_allergen_normalization_mappings
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy legacy_candidate_allergen_mappings_write_authority
  on public.legacy_candidate_allergen_normalization_mappings
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy candidate_allergen_facts_write_authority on public.candidate_allergen_facts
  for all to candidate_allergen_write_authority using (true) with check (true);
create policy candidate_allergen_coverage_write_authority on public.candidate_allergen_coverage
  for all to candidate_allergen_write_authority using (true) with check (true);

revoke all on table public.candidate_allergen_taxonomies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_allergen_values from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_allergen_value_labels from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_restriction_allergen_normalization_policies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_restriction_allergen_source_vocabularies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_restriction_allergen_source_values from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_restriction_allergen_source_value_labels from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_restriction_allergen_normalization_mappings from public, anon, authenticated, authenticator, service_role;
revoke all on table public.legacy_candidate_allergen_normalization_mappings from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_allergen_facts from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_allergen_coverage from public, anon, authenticated, authenticator, service_role;

grant select, insert, update, delete on table public.candidate_allergen_taxonomies to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.candidate_allergen_values to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.candidate_allergen_value_labels to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.private_restriction_allergen_normalization_policies to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.private_restriction_allergen_source_vocabularies to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.private_restriction_allergen_source_values to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.private_restriction_allergen_source_value_labels to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.private_restriction_allergen_normalization_mappings to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.legacy_candidate_allergen_normalization_mappings to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.candidate_allergen_facts to candidate_allergen_write_authority;
grant select, insert, update, delete on table public.candidate_allergen_coverage to candidate_allergen_write_authority;

create view public.consumer_authenticated_private_restriction_allergen_source_values_v1
with (security_barrier = true) as
select
  source.source_vocabulary_id,
  source.source_vocabulary_version,
  source.source_value_key,
  label.locale,
  label.label
from public.private_restriction_allergen_source_values as source
join public.private_restriction_allergen_source_vocabularies as vocabulary
  on vocabulary.source_vocabulary_id = source.source_vocabulary_id
 and vocabulary.source_vocabulary_version = source.source_vocabulary_version
join public.private_restriction_allergen_source_value_labels as label
  on label.source_vocabulary_id = source.source_vocabulary_id
 and label.source_vocabulary_version = source.source_vocabulary_version
 and label.source_value_key = source.source_value_key
where vocabulary.active and vocabulary.retired_at is null
  and source.active and source.retired_at is null
order by source.source_value_key, label.locale;

create view public.consumer_authenticated_private_restriction_allergen_dictionary_v1
with (security_barrier = true) as
select
  mapping.normalization_policy_id,
  mapping.normalization_policy_version,
  mapping.source_vocabulary_id,
  mapping.source_vocabulary_version,
  mapping.normalized_source_value,
  mapping.alias_kind,
  mapping.source_locale,
  mapping.target_taxonomy_id,
  mapping.target_taxonomy_version,
  mapping.target_allergen_key
from public.private_restriction_allergen_normalization_mappings as mapping
join public.private_restriction_allergen_normalization_policies as policy
  on policy.normalization_policy_id = mapping.normalization_policy_id
 and policy.normalization_policy_version = mapping.normalization_policy_version
join public.private_restriction_allergen_source_vocabularies as vocabulary
  on vocabulary.source_vocabulary_id = mapping.source_vocabulary_id
 and vocabulary.source_vocabulary_version = mapping.source_vocabulary_version
join public.private_restriction_allergen_source_values as source
  on source.source_vocabulary_id = mapping.source_vocabulary_id
 and source.source_vocabulary_version = mapping.source_vocabulary_version
 and source.source_value_key = mapping.source_value_key
join public.candidate_allergen_taxonomies as taxonomy
  on taxonomy.taxonomy_id = mapping.target_taxonomy_id
 and taxonomy.taxonomy_version = mapping.target_taxonomy_version
join public.candidate_allergen_values as target
  on target.taxonomy_id = mapping.target_taxonomy_id
 and target.taxonomy_version = mapping.target_taxonomy_version
 and target.allergen_key = mapping.target_allergen_key
where policy.active and policy.retired_at is null
  and vocabulary.active and vocabulary.retired_at is null
  and source.active and source.retired_at is null
  and mapping.active and mapping.retired_at is null
  and taxonomy.active and taxonomy.retired_at is null
  and target.active and target.retired_at is null
order by mapping.normalized_source_value, mapping.mapping_id;

create view public.consumer_authenticated_next_meal_candidate_allergen_facts_v1
with (security_barrier = true) as
select
  candidate.candidate_id,
  candidate.restaurant_id,
  candidate.branch_id,
  candidate.menu_item_id,
  fact.taxonomy_id,
  fact.taxonomy_version,
  fact.fact_domain,
  fact.allergen_key
from public.consumer_public_next_meal_candidates_v1 as candidate
join public.candidate_allergen_facts as fact
  on fact.candidate_id = candidate.candidate_id
 and fact.menu_item_id = candidate.menu_item_id
join public.candidate_allergen_taxonomies as taxonomy
  on taxonomy.taxonomy_id = fact.taxonomy_id
 and taxonomy.taxonomy_version = fact.taxonomy_version
join public.candidate_allergen_values as value
  on value.taxonomy_id = fact.taxonomy_id
 and value.taxonomy_version = fact.taxonomy_version
 and value.allergen_key = fact.allergen_key
where fact.active and fact.retired_at is null
  and taxonomy.active and taxonomy.retired_at is null
  and value.active and value.retired_at is null
order by candidate.candidate_id, fact.allergen_key, fact.fact_id;

create view public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1
with (security_barrier = true) as
with active_taxonomy as (
  select taxonomy_id, taxonomy_version, fact_domain
  from public.candidate_allergen_taxonomies
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
  coalesce(coverage.coverage_state, 'unknown'::public.candidate_allergen_coverage_state)::text
    as coverage_state
from public.consumer_public_next_meal_candidates_v1 as candidate
cross join active_taxonomy as taxonomy
left join public.candidate_allergen_coverage as coverage
  on coverage.candidate_id = candidate.candidate_id
 and coverage.menu_item_id = candidate.menu_item_id
 and coverage.taxonomy_id = taxonomy.taxonomy_id
 and coverage.taxonomy_version = taxonomy.taxonomy_version
 and coverage.fact_domain = taxonomy.fact_domain
 and coverage.active
 and coverage.retired_at is null
order by candidate.candidate_id;

comment on view public.consumer_authenticated_next_meal_candidate_allergen_facts_v1 is
  'REC-C-P0 known-present allergen-content facts keyed by branch-offer candidate identity. No provenance internals, user restriction, severity, score, rank, compatibility, known-absent, or safe boolean.';
comment on view public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1 is
  'REC-C-P0 one-row-per-candidate allergen_content coverage. unknown and partial never establish missing-key absence. complete covers intentional ingredients/additives against v1 only, never cross-contact or allergy safety.';

revoke all on public.consumer_authenticated_private_restriction_allergen_source_values_v1 from public, anon, service_role;
revoke all on public.consumer_authenticated_private_restriction_allergen_dictionary_v1 from public, anon, service_role;
revoke all on public.consumer_authenticated_next_meal_candidate_allergen_facts_v1 from public, anon, service_role;
revoke all on public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1 from public, anon, service_role;
grant select on public.consumer_authenticated_private_restriction_allergen_source_values_v1 to authenticated;
grant select on public.consumer_authenticated_private_restriction_allergen_dictionary_v1 to authenticated;
grant select on public.consumer_authenticated_next_meal_candidate_allergen_facts_v1 to authenticated;
grant select on public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1 to authenticated;

commit;
