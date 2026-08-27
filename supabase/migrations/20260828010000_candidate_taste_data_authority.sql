-- REC-B-P0: canonical candidate-side Taste facts, taxonomy, provenance, and projection.
--
-- This migration answers only which Taste facts are truthfully known about a catalog candidate.
-- It performs no user matching, scoring, ranking, eligibility, dietary filtering, Geo work, or
-- Meal Context inference. The frozen next-meal candidate view remains byte-identical; these are
-- separate additive projections joined through its canonical candidate/menu/restaurant identities.

begin;

create type public.candidate_taste_provenance as enum (
  'restaurant_verified',
  'admin_verified',
  'provider_imported',
  'canonical_mapping'
);

create table public.candidate_taste_taxonomies (
  taxonomy_version text primary key
    check (taxonomy_version ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint candidate_taste_taxonomies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index candidate_taste_taxonomies_one_active_idx
  on public.candidate_taste_taxonomies (active)
  where active;

create table public.candidate_taste_facets (
  taxonomy_version text not null
    references public.candidate_taste_taxonomies (taxonomy_version) on delete restrict,
  facet_key text not null
    check (facet_key in ('cuisine', 'meal_type', 'flavor', 'spice')),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_version, facet_key),
  constraint candidate_taste_facets_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.candidate_taste_values (
  taxonomy_version text not null,
  facet_key text not null,
  value_key text not null
    check (value_key ~ '^[a-z0-9][a-z0-9._-]{0,126}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_version, facet_key, value_key),
  foreign key (taxonomy_version, facet_key)
    references public.candidate_taste_facets (taxonomy_version, facet_key) on delete restrict,
  constraint candidate_taste_values_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.candidate_taste_value_labels (
  taxonomy_version text not null,
  facet_key text not null,
  value_key text not null,
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  label text not null check (pg_catalog.btrim(label) <> ''),
  primary key (taxonomy_version, facet_key, value_key, locale),
  foreign key (taxonomy_version, facet_key, value_key)
    references public.candidate_taste_values (taxonomy_version, facet_key, value_key)
    on delete cascade
);

create table public.candidate_taste_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  restaurant_id text references public.restaurants (id) on delete restrict,
  menu_item_id text references public.menu_items (id) on delete restrict,
  taxonomy_version text not null,
  facet_key text not null,
  value_key text not null,
  provenance public.candidate_taste_provenance not null,
  source_reference text not null
    check (pg_catalog.btrim(source_reference) <> '' and pg_catalog.length(source_reference) <= 500),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (taxonomy_version, facet_key, value_key)
    references public.candidate_taste_values (taxonomy_version, facet_key, value_key)
    on delete restrict,
  constraint candidate_taste_mappings_one_scope
    check ((restaurant_id is not null)::integer + (menu_item_id is not null)::integer = 1),
  constraint candidate_taste_mappings_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index candidate_taste_mappings_restaurant_fact_idx
  on public.candidate_taste_mappings
    (restaurant_id, taxonomy_version, facet_key, value_key)
  where restaurant_id is not null;

create unique index candidate_taste_mappings_menu_item_fact_idx
  on public.candidate_taste_mappings
    (menu_item_id, taxonomy_version, facet_key, value_key)
  where menu_item_id is not null;

create index candidate_taste_mappings_active_restaurant_idx
  on public.candidate_taste_mappings (restaurant_id, taxonomy_version, facet_key)
  where active and restaurant_id is not null;

create index candidate_taste_mappings_active_menu_item_idx
  on public.candidate_taste_mappings (menu_item_id, taxonomy_version, facet_key)
  where active and menu_item_id is not null;

comment on table public.candidate_taste_taxonomies is
  'REC-B-P0 version authority. Exactly one active version drives candidate projection; activating a successor requires an explicit data migration, never Mobile deployment.';
comment on table public.candidate_taste_facets is
  'REC-B-P0 minimum candidate facets aligned to the private current-user Taste profile: cuisine, meal_type, flavor, and spice. Food/Meal Context remains separate.';
comment on table public.candidate_taste_values is
  'Stable machine values. Display labels are separate, so renaming localized text never changes candidate identity.';
comment on table public.candidate_taste_mappings is
  'Server-managed restaurant- or menu-item-scoped facts. Absence is unknown; names, districts, and uncontrolled catalog tags are never inferred into this table.';
comment on column public.candidate_taste_mappings.provenance is
  'Closed evidence source. AI guesses and unverified free text are intentionally absent.';
comment on column public.candidate_taste_mappings.source_reference is
  'Required opaque audit pointer to the onboarding, curation, import, or canonical-mapping evidence. It is provenance detail, never a ranking value.';

-- Reuse the existing canonical meal_type vocabulary as stable values. No restaurant or menu facts
-- are seeded: the migration invents no production truth for any candidate.
insert into public.candidate_taste_taxonomies (taxonomy_version)
values ('candidate-taste-v1');

insert into public.candidate_taste_facets (taxonomy_version, facet_key)
values
  ('candidate-taste-v1', 'cuisine'),
  ('candidate-taste-v1', 'meal_type'),
  ('candidate-taste-v1', 'flavor'),
  ('candidate-taste-v1', 'spice');

insert into public.candidate_taste_values (taxonomy_version, facet_key, value_key)
values
  ('candidate-taste-v1', 'meal_type', 'breakfast'),
  ('candidate-taste-v1', 'meal_type', 'lunch'),
  ('candidate-taste-v1', 'meal_type', 'dinner'),
  ('candidate-taste-v1', 'meal_type', 'late_night'),
  ('candidate-taste-v1', 'meal_type', 'snack'),
  ('candidate-taste-v1', 'meal_type', 'other');

insert into public.candidate_taste_value_labels
  (taxonomy_version, facet_key, value_key, locale, label)
values
  ('candidate-taste-v1', 'meal_type', 'breakfast', 'zh-TW', '早餐'),
  ('candidate-taste-v1', 'meal_type', 'lunch', 'zh-TW', '午餐'),
  ('candidate-taste-v1', 'meal_type', 'dinner', 'zh-TW', '晚餐'),
  ('candidate-taste-v1', 'meal_type', 'late_night', 'zh-TW', '宵夜'),
  ('candidate-taste-v1', 'meal_type', 'snack', 'zh-TW', '點心'),
  ('candidate-taste-v1', 'meal_type', 'other', 'zh-TW', '其他');

-- The write role is a future server-side restaurant/admin/curation attachment point. It cannot log
-- in or bypass RLS and is not granted to any client or runtime role in this phase.
create role candidate_taste_write_authority with nologin noinherit nobypassrls;
grant usage on schema public to candidate_taste_write_authority;

alter table public.candidate_taste_taxonomies enable row level security;
alter table public.candidate_taste_facets enable row level security;
alter table public.candidate_taste_values enable row level security;
alter table public.candidate_taste_value_labels enable row level security;
alter table public.candidate_taste_mappings enable row level security;

create policy candidate_taste_taxonomies_write_authority
  on public.candidate_taste_taxonomies for all to candidate_taste_write_authority
  using (true) with check (true);
create policy candidate_taste_facets_write_authority
  on public.candidate_taste_facets for all to candidate_taste_write_authority
  using (true) with check (true);
create policy candidate_taste_values_write_authority
  on public.candidate_taste_values for all to candidate_taste_write_authority
  using (true) with check (true);
create policy candidate_taste_value_labels_write_authority
  on public.candidate_taste_value_labels for all to candidate_taste_write_authority
  using (true) with check (true);
create policy candidate_taste_mappings_write_authority
  on public.candidate_taste_mappings for all to candidate_taste_write_authority
  using (true) with check (true);

revoke all on table public.candidate_taste_taxonomies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_taste_facets from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_taste_values from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_taste_value_labels from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_taste_mappings from public, anon, authenticated, authenticator, service_role;

grant select, insert, update, delete on table public.candidate_taste_taxonomies to candidate_taste_write_authority;
grant select, insert, update, delete on table public.candidate_taste_facets to candidate_taste_write_authority;
grant select, insert, update, delete on table public.candidate_taste_values to candidate_taste_write_authority;
grant select, insert, update, delete on table public.candidate_taste_value_labels to candidate_taste_write_authority;
grant select, insert, update, delete on table public.candidate_taste_mappings to candidate_taste_write_authority;

-- FACET-LEVEL SPECIFICITY PRECEDENCE, with multi-value support inside the winning scope.
--
-- For each candidate x facet: if the canonical menu item carries ANY active mapping for that facet,
-- ONLY its menu-scope facts survive and every restaurant-scope fact for that same facet is
-- suppressed. If the menu item carries none, the restaurant-scope facts inherit. Within the winning
-- scope a facet may hold several distinct values; duplicates are de-duplicated and ordering is
-- deterministic.
--
-- Mixing the two scopes for one facet is what this prevents: a restaurant-level `lunch` sitting
-- beside a menu-level `dinner` is not richer data, it is a contradiction that later user-to-meal
-- scoring would have to guess its way out of. Specificity decides, not recency or provenance rank.
--
-- Restaurant facts still inherit to every candidate of that restaurant for facets the menu is silent
-- about; menu facts stay on that canonical menu item while the branch-offer candidate_id stays intact.
create view public.consumer_public_next_meal_candidate_taste_facts_v1
with (security_barrier = true) as
with eligible as (
  select
    candidate.candidate_id,
    candidate.restaurant_id,
    candidate.branch_id,
    candidate.menu_item_id,
    mapping.mapping_id,
    mapping.taxonomy_version,
    mapping.facet_key,
    mapping.value_key,
    mapping.menu_item_id is not null as menu_scoped,
    mapping.provenance,
    mapping.source_reference,
    mapping.updated_at
  from public.consumer_public_next_meal_candidates_v1 as candidate
  join public.candidate_taste_mappings as mapping
    on (mapping.menu_item_id = candidate.menu_item_id and mapping.restaurant_id is null)
    or (mapping.restaurant_id = candidate.restaurant_id and mapping.menu_item_id is null)
  join public.candidate_taste_taxonomies as taxonomy
    on taxonomy.taxonomy_version = mapping.taxonomy_version
   and taxonomy.active
   and taxonomy.retired_at is null
  join public.candidate_taste_facets as facet
    on facet.taxonomy_version = mapping.taxonomy_version
   and facet.facet_key = mapping.facet_key
   and facet.active
   and facet.retired_at is null
  join public.candidate_taste_values as value
    on value.taxonomy_version = mapping.taxonomy_version
   and value.facet_key = mapping.facet_key
   and value.value_key = mapping.value_key
   and value.active
   and value.retired_at is null
  where mapping.active
    and mapping.retired_at is null
)
select distinct on (eligible.candidate_id, eligible.facet_key, eligible.value_key)
  eligible.candidate_id,
  eligible.restaurant_id,
  eligible.branch_id,
  eligible.menu_item_id,
  eligible.taxonomy_version,
  eligible.facet_key,
  eligible.value_key,
  case when eligible.menu_scoped then 'menu_item' else 'restaurant' end as mapping_scope,
  eligible.provenance::text as provenance,
  eligible.source_reference,
  eligible.updated_at as established_at
from eligible
where eligible.menu_scoped
   or not exists (
     select 1
     from eligible as specific
     where specific.candidate_id = eligible.candidate_id
       and specific.facet_key = eligible.facet_key
       and specific.menu_scoped
   )
order by
  eligible.candidate_id,
  eligible.facet_key,
  eligible.value_key,
  eligible.mapping_id;

-- Exactly one coverage row per live candidate. Unknown is an explicit empty-knowledge state, not a
-- fabricated value. Partial means at least one but not all active facets are known.
create view public.consumer_public_next_meal_candidate_taste_state_v1
with (security_barrier = true) as
with active_taxonomy as (
  select taxonomy_version
  from public.candidate_taste_taxonomies
  where active and retired_at is null
), known as (
  select
    fact.candidate_id,
    pg_catalog.array_agg(distinct fact.facet_key order by fact.facet_key) as known_facet_keys
  from public.consumer_public_next_meal_candidate_taste_facts_v1 as fact
  group by fact.candidate_id
)
select
  candidate.candidate_id,
  candidate.restaurant_id,
  candidate.branch_id,
  candidate.menu_item_id,
  taxonomy.taxonomy_version,
  case
    when pg_catalog.cardinality(coalesce(known.known_facet_keys, '{}'::text[])) = 0 then 'unknown'
    when pg_catalog.cardinality(coalesce(known.known_facet_keys, '{}'::text[])) = facet_total.count then 'mapped'
    else 'partial'
  end as mapping_state,
  coalesce(known.known_facet_keys, '{}'::text[]) as known_facet_keys,
  array(
    select facet.facet_key
    from public.candidate_taste_facets as facet
    where facet.taxonomy_version = taxonomy.taxonomy_version
      and facet.active
      and facet.retired_at is null
      and not (facet.facet_key = any(coalesce(known.known_facet_keys, '{}'::text[])))
    order by facet.facet_key
  ) as unknown_facet_keys
from public.consumer_public_next_meal_candidates_v1 as candidate
cross join active_taxonomy as taxonomy
cross join lateral (
  select pg_catalog.count(*)::integer as count
  from public.candidate_taste_facets as facet
  where facet.taxonomy_version = taxonomy.taxonomy_version
    and facet.active
    and facet.retired_at is null
) as facet_total
left join known on known.candidate_id = candidate.candidate_id;

comment on view public.consumer_public_next_meal_candidate_taste_facts_v1 is
  'REC-B-P0 authenticated public-catalog facts keyed by canonical branch-offer candidate identity. Facet-level specificity precedence: any menu-item mapping for a facet suppresses every restaurant mapping for that same facet, and the winning scope may hold several distinct values. Contains candidate facts and provenance only; never current-user Taste, Social profile data, score, rank, or recommendation order.';
comment on view public.consumer_public_next_meal_candidate_taste_state_v1 is
  'REC-B-P0 one-row-per-candidate coverage contract. unknown = zero active facets; partial = some; mapped = every active facet. No recommendation semantics.';

revoke all on public.consumer_public_next_meal_candidate_taste_facts_v1 from public, anon, service_role;
revoke all on public.consumer_public_next_meal_candidate_taste_state_v1 from public, anon, service_role;
grant select on public.consumer_public_next_meal_candidate_taste_facts_v1 to authenticated;
grant select on public.consumer_public_next_meal_candidate_taste_state_v1 to authenticated;

commit;
