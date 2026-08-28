-- REC-B-P1: governed private-Taste vocabulary normalization into candidate-taste-v1.
--
-- This migration defines vocabulary identity only. It creates no user projection, candidate fact,
-- score, rank, eligibility rule, Nutrition composition, Geo behavior, Social signal, Meal Context
-- inference, or dietary enforcement.

begin;

create table public.private_taste_normalization_policies (
  normalization_policy_id text not null
    check (normalization_policy_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  normalization_policy_version integer not null check (normalization_policy_version > 0),
  target_taxonomy_version text not null
    references public.candidate_taste_taxonomies (taxonomy_version) on delete restrict,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (normalization_policy_id, normalization_policy_version),
  constraint private_taste_normalization_policies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index private_taste_normalization_policies_one_active_idx
  on public.private_taste_normalization_policies (active)
  where active;

create table public.private_taste_source_vocabularies (
  source_vocabulary_id text not null
    check (source_vocabulary_id ~ '^[a-z0-9][a-z0-9._-]{0,62}$'),
  source_vocabulary_version integer not null check (source_vocabulary_version > 0),
  source_facet text not null check (source_facet in ('cuisine', 'flavor', 'spice')),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_vocabulary_id, source_vocabulary_version),
  unique (source_vocabulary_id, source_vocabulary_version, source_facet),
  constraint private_taste_source_vocabularies_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_taste_source_values (
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_facet text not null check (source_facet in ('cuisine', 'flavor', 'spice')),
  source_value_key text not null
    check (source_value_key ~ '^[a-z0-9][a-z0-9._-]{0,126}$'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key),
  foreign key (source_vocabulary_id, source_vocabulary_version, source_facet)
    references public.private_taste_source_vocabularies
      (source_vocabulary_id, source_vocabulary_version, source_facet)
    on delete restrict,
  constraint private_taste_source_values_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create table public.private_taste_source_value_labels (
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_facet text not null,
  source_value_key text not null,
  locale text not null check (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  label text not null check (
    pg_catalog.btrim(label) <> ''
    and label = normalize(pg_catalog.btrim(label), NFC)
  ),
  primary key (
    source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key, locale
  ),
  unique (
    source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key, locale, label
  ),
  foreign key (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key)
    references public.private_taste_source_values
      (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key)
    on delete cascade
);

-- Semantic order is explicit data. It is never derived from labels, key text, insertion order, or a
-- recommendation scoring input. Only the spice facet may use this P1 authority.
create table public.candidate_taste_spice_order (
  taxonomy_version text not null,
  facet_key text not null default 'spice' check (facet_key = 'spice'),
  value_key text not null,
  semantic_ordinal integer not null check (semantic_ordinal between 0 and 3),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (taxonomy_version, facet_key, value_key),
  unique (taxonomy_version, facet_key, semantic_ordinal),
  foreign key (taxonomy_version, facet_key, value_key)
    references public.candidate_taste_values (taxonomy_version, facet_key, value_key)
    on delete restrict
);

create table public.private_taste_normalization_mappings (
  normalization_mapping_id uuid primary key default gen_random_uuid(),
  normalization_policy_id text not null,
  normalization_policy_version integer not null,
  source_vocabulary_id text not null,
  source_vocabulary_version integer not null,
  source_facet text not null check (source_facet in ('cuisine', 'flavor', 'spice')),
  source_value_key text not null,
  normalized_source_value text not null check (
    pg_catalog.btrim(normalized_source_value) <> ''
    and normalized_source_value = normalize(pg_catalog.btrim(normalized_source_value), NFC)
  ),
  alias_kind text not null check (alias_kind in ('stable_key', 'localized_label', 'governed_alias')),
  source_locale text,
  target_taxonomy_version text not null,
  target_facet text not null check (target_facet in ('cuisine', 'flavor', 'spice')),
  target_value_key text not null,
  provenance public.candidate_taste_provenance not null,
  audit_reference text not null
    check (pg_catalog.btrim(audit_reference) <> '' and pg_catalog.length(audit_reference) <= 500),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (normalization_policy_id, normalization_policy_version)
    references public.private_taste_normalization_policies
      (normalization_policy_id, normalization_policy_version)
    on delete restrict,
  foreign key (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key)
    references public.private_taste_source_values
      (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key)
    on delete restrict,
  foreign key (
    source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key,
    source_locale, normalized_source_value
  ) references public.private_taste_source_value_labels (
    source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key,
    locale, label
  ) on delete restrict,
  foreign key (target_taxonomy_version, target_facet, target_value_key)
    references public.candidate_taste_values (taxonomy_version, facet_key, value_key)
    on delete restrict,
  constraint private_taste_normalization_same_facet check (source_facet = target_facet),
  constraint private_taste_normalization_alias_shape check (
    (alias_kind = 'stable_key' and source_locale is null
      and normalized_source_value = source_value_key)
    or (alias_kind = 'localized_label' and source_locale is not null)
    or (alias_kind = 'governed_alias' and source_locale is null)
  ),
  constraint private_taste_normalization_mappings_lifecycle
    check ((active and retired_at is null) or (not active and retired_at is not null))
);

create unique index private_taste_normalization_active_alias_idx
  on public.private_taste_normalization_mappings (
    normalization_policy_id, normalization_policy_version,
    source_vocabulary_id, source_vocabulary_version, source_facet, normalized_source_value
  ) where active;

comment on table public.private_taste_normalization_policies is
  'REC-B-P1 version authority for deterministic private source-vocabulary normalization. It contains no user or recommendation state.';
comment on table public.private_taste_source_vocabularies is
  'Approved private Taste write vocabularies. New profile writes persist source_value_key, never a localized label.';
comment on table public.private_taste_source_values is
  'Stable private Taste source identities. Arbitrary custom cuisine, flavor, and spice text is not a new-write authority.';
comment on table public.private_taste_normalization_mappings is
  'Vocabulary-to-vocabulary mappings only. No user ID, profile snapshot, candidate ID, score, rank, or behavioral evidence belongs here.';
comment on table public.candidate_taste_spice_order is
  'REC-B-P1 semantic spice order: none < mild < medium < hot. Ordinals are identity semantics and never recommendation scoring distance.';

insert into public.private_taste_normalization_policies
  (normalization_policy_id, normalization_policy_version, target_taxonomy_version)
values ('private-taste-normalization', 1, 'candidate-taste-v1');

insert into public.private_taste_source_vocabularies
  (source_vocabulary_id, source_vocabulary_version, source_facet)
values
  ('private-taste-cuisine-v1', 1, 'cuisine'),
  ('private-taste-flavor-v1', 1, 'flavor'),
  ('private-taste-spice-v1', 1, 'spice');

-- Product-authorized candidate values only. This is vocabulary, not candidate truth: no restaurant
-- or menu-item mapping is inserted by P1.
insert into public.candidate_taste_values (taxonomy_version, facet_key, value_key)
values
  ('candidate-taste-v1', 'cuisine', 'taiwanese'),
  ('candidate-taste-v1', 'cuisine', 'japanese'),
  ('candidate-taste-v1', 'cuisine', 'korean'),
  ('candidate-taste-v1', 'cuisine', 'chinese'),
  ('candidate-taste-v1', 'cuisine', 'hong_kong_cantonese'),
  ('candidate-taste-v1', 'cuisine', 'thai'),
  ('candidate-taste-v1', 'cuisine', 'vietnamese'),
  ('candidate-taste-v1', 'cuisine', 'southeast_asian'),
  ('candidate-taste-v1', 'cuisine', 'indian'),
  ('candidate-taste-v1', 'cuisine', 'italian'),
  ('candidate-taste-v1', 'cuisine', 'french'),
  ('candidate-taste-v1', 'cuisine', 'american'),
  ('candidate-taste-v1', 'cuisine', 'mexican'),
  ('candidate-taste-v1', 'cuisine', 'mediterranean'),
  ('candidate-taste-v1', 'cuisine', 'middle_eastern'),
  ('candidate-taste-v1', 'cuisine', 'fusion'),
  ('candidate-taste-v1', 'flavor', 'sweet'),
  ('candidate-taste-v1', 'flavor', 'salty'),
  ('candidate-taste-v1', 'flavor', 'sour'),
  ('candidate-taste-v1', 'flavor', 'bitter'),
  ('candidate-taste-v1', 'flavor', 'umami'),
  ('candidate-taste-v1', 'flavor', 'smoky'),
  ('candidate-taste-v1', 'flavor', 'creamy'),
  ('candidate-taste-v1', 'flavor', 'fermented'),
  ('candidate-taste-v1', 'spice', 'none'),
  ('candidate-taste-v1', 'spice', 'mild'),
  ('candidate-taste-v1', 'spice', 'medium'),
  ('candidate-taste-v1', 'spice', 'hot');

insert into public.candidate_taste_value_labels
  (taxonomy_version, facet_key, value_key, locale, label)
values
  ('candidate-taste-v1', 'cuisine', 'taiwanese', 'zh-TW', '台灣料理'),
  ('candidate-taste-v1', 'cuisine', 'japanese', 'zh-TW', '日本料理'),
  ('candidate-taste-v1', 'cuisine', 'korean', 'zh-TW', '韓國料理'),
  ('candidate-taste-v1', 'cuisine', 'chinese', 'zh-TW', '中式料理'),
  ('candidate-taste-v1', 'cuisine', 'hong_kong_cantonese', 'zh-TW', '港式／粵菜'),
  ('candidate-taste-v1', 'cuisine', 'thai', 'zh-TW', '泰式料理'),
  ('candidate-taste-v1', 'cuisine', 'vietnamese', 'zh-TW', '越南料理'),
  ('candidate-taste-v1', 'cuisine', 'southeast_asian', 'zh-TW', '東南亞料理'),
  ('candidate-taste-v1', 'cuisine', 'indian', 'zh-TW', '印度料理'),
  ('candidate-taste-v1', 'cuisine', 'italian', 'zh-TW', '義式料理'),
  ('candidate-taste-v1', 'cuisine', 'french', 'zh-TW', '法式料理'),
  ('candidate-taste-v1', 'cuisine', 'american', 'zh-TW', '美式料理'),
  ('candidate-taste-v1', 'cuisine', 'mexican', 'zh-TW', '墨西哥料理'),
  ('candidate-taste-v1', 'cuisine', 'mediterranean', 'zh-TW', '地中海料理'),
  ('candidate-taste-v1', 'cuisine', 'middle_eastern', 'zh-TW', '中東料理'),
  ('candidate-taste-v1', 'cuisine', 'fusion', 'zh-TW', '創意融合料理'),
  ('candidate-taste-v1', 'flavor', 'sweet', 'zh-TW', '甜味'),
  ('candidate-taste-v1', 'flavor', 'salty', 'zh-TW', '鹹味'),
  ('candidate-taste-v1', 'flavor', 'sour', 'zh-TW', '酸味'),
  ('candidate-taste-v1', 'flavor', 'bitter', 'zh-TW', '苦味'),
  ('candidate-taste-v1', 'flavor', 'umami', 'zh-TW', '鮮味'),
  ('candidate-taste-v1', 'flavor', 'smoky', 'zh-TW', '煙燻味'),
  ('candidate-taste-v1', 'flavor', 'creamy', 'zh-TW', '奶香'),
  ('candidate-taste-v1', 'flavor', 'fermented', 'zh-TW', '發酵風味'),
  ('candidate-taste-v1', 'spice', 'none', 'zh-TW', '不辣'),
  ('candidate-taste-v1', 'spice', 'mild', 'zh-TW', '微辣'),
  ('candidate-taste-v1', 'spice', 'medium', 'zh-TW', '中辣'),
  ('candidate-taste-v1', 'spice', 'hot', 'zh-TW', '重辣');

insert into public.private_taste_source_values
  (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key)
select
  case facet_key
    when 'cuisine' then 'private-taste-cuisine-v1'
    when 'flavor' then 'private-taste-flavor-v1'
    when 'spice' then 'private-taste-spice-v1'
  end,
  1,
  facet_key,
  value_key
from public.candidate_taste_values
where taxonomy_version = 'candidate-taste-v1'
  and facet_key in ('cuisine', 'flavor', 'spice');

insert into public.private_taste_source_value_labels
  (source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key, locale, label)
select
  case label.facet_key
    when 'cuisine' then 'private-taste-cuisine-v1'
    when 'flavor' then 'private-taste-flavor-v1'
    when 'spice' then 'private-taste-spice-v1'
  end,
  1,
  label.facet_key,
  label.value_key,
  label.locale,
  case when label.facet_key = 'spice' and label.value_key = 'hot' then '愛吃辣' else label.label end
from public.candidate_taste_value_labels as label
where label.taxonomy_version = 'candidate-taste-v1'
  and label.facet_key in ('cuisine', 'flavor', 'spice')
  and label.locale = 'zh-TW';

insert into public.candidate_taste_spice_order
  (taxonomy_version, facet_key, value_key, semantic_ordinal)
values
  ('candidate-taste-v1', 'spice', 'none', 0),
  ('candidate-taste-v1', 'spice', 'mild', 1),
  ('candidate-taste-v1', 'spice', 'medium', 2),
  ('candidate-taste-v1', 'spice', 'hot', 3);

-- Exact stable-key aliases.
insert into public.private_taste_normalization_mappings (
  normalization_policy_id, normalization_policy_version,
  source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key,
  normalized_source_value, alias_kind, source_locale,
  target_taxonomy_version, target_facet, target_value_key,
  provenance, audit_reference
)
select
  'private-taste-normalization', 1,
  source.source_vocabulary_id, source.source_vocabulary_version,
  source.source_facet, source.source_value_key,
  source.source_value_key, 'stable_key', null,
  'candidate-taste-v1', source.source_facet, source.source_value_key,
  'canonical_mapping', 'rec-b-p1-product-authority-addendum'
from public.private_taste_source_values as source;

-- Exact authorized zh-TW display-label aliases. No other synonym, translation, fuzzy input, or
-- keyword is seeded.
insert into public.private_taste_normalization_mappings (
  normalization_policy_id, normalization_policy_version,
  source_vocabulary_id, source_vocabulary_version, source_facet, source_value_key,
  normalized_source_value, alias_kind, source_locale,
  target_taxonomy_version, target_facet, target_value_key,
  provenance, audit_reference
)
select
  'private-taste-normalization', 1,
  label.source_vocabulary_id, label.source_vocabulary_version,
  label.source_facet, label.source_value_key,
  label.label, 'localized_label', label.locale,
  'candidate-taste-v1', label.source_facet, label.source_value_key,
  'canonical_mapping', 'rec-b-p1-product-authority-addendum'
from public.private_taste_source_value_labels as label
where label.locale = 'zh-TW';

create role private_taste_normalization_write_authority with nologin noinherit nobypassrls;
grant usage on schema public to private_taste_normalization_write_authority;

alter table public.private_taste_normalization_policies enable row level security;
alter table public.private_taste_source_vocabularies enable row level security;
alter table public.private_taste_source_values enable row level security;
alter table public.private_taste_source_value_labels enable row level security;
alter table public.private_taste_normalization_mappings enable row level security;
alter table public.candidate_taste_spice_order enable row level security;

create policy private_taste_normalization_policies_write_authority
  on public.private_taste_normalization_policies for all
  to private_taste_normalization_write_authority using (true) with check (true);
create policy private_taste_source_vocabularies_write_authority
  on public.private_taste_source_vocabularies for all
  to private_taste_normalization_write_authority using (true) with check (true);
create policy private_taste_source_values_write_authority
  on public.private_taste_source_values for all
  to private_taste_normalization_write_authority using (true) with check (true);
create policy private_taste_source_value_labels_write_authority
  on public.private_taste_source_value_labels for all
  to private_taste_normalization_write_authority using (true) with check (true);
create policy private_taste_normalization_mappings_write_authority
  on public.private_taste_normalization_mappings for all
  to private_taste_normalization_write_authority using (true) with check (true);
create policy candidate_taste_spice_order_write_authority
  on public.candidate_taste_spice_order for all
  to candidate_taste_write_authority using (true) with check (true);

revoke all on table public.private_taste_normalization_policies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_taste_source_vocabularies from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_taste_source_values from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_taste_source_value_labels from public, anon, authenticated, authenticator, service_role;
revoke all on table public.private_taste_normalization_mappings from public, anon, authenticated, authenticator, service_role;
revoke all on table public.candidate_taste_spice_order from public, anon, authenticated, authenticator, service_role;

grant select, insert, update, delete on table public.private_taste_normalization_policies to private_taste_normalization_write_authority;
grant select, insert, update, delete on table public.private_taste_source_vocabularies to private_taste_normalization_write_authority;
grant select, insert, update, delete on table public.private_taste_source_values to private_taste_normalization_write_authority;
grant select, insert, update, delete on table public.private_taste_source_value_labels to private_taste_normalization_write_authority;
grant select, insert, update, delete on table public.private_taste_normalization_mappings to private_taste_normalization_write_authority;
grant select, insert, update, delete on table public.candidate_taste_spice_order to candidate_taste_write_authority;

-- Vocabulary-only read contracts for the authenticated recommendation boundary. Neither view
-- resolves or projects any user's profile.
create view public.consumer_private_taste_source_values_v1
with (security_barrier = true) as
select
  source.source_vocabulary_id,
  source.source_vocabulary_version,
  source.source_facet,
  source.source_value_key,
  label.locale,
  label.label
from public.private_taste_source_vocabularies as vocabulary
join public.private_taste_source_values as source
  on source.source_vocabulary_id = vocabulary.source_vocabulary_id
 and source.source_vocabulary_version = vocabulary.source_vocabulary_version
 and source.source_facet = vocabulary.source_facet
join public.private_taste_source_value_labels as label
  on label.source_vocabulary_id = source.source_vocabulary_id
 and label.source_vocabulary_version = source.source_vocabulary_version
 and label.source_facet = source.source_facet
 and label.source_value_key = source.source_value_key
where vocabulary.active and vocabulary.retired_at is null
  and source.active and source.retired_at is null;

create view public.consumer_private_taste_normalization_dictionary_v1
with (security_barrier = true) as
select
  mapping.normalization_policy_id,
  mapping.normalization_policy_version,
  mapping.source_vocabulary_id,
  mapping.source_vocabulary_version,
  mapping.source_facet,
  mapping.source_value_key,
  mapping.normalized_source_value,
  mapping.alias_kind,
  mapping.source_locale,
  mapping.target_taxonomy_version,
  mapping.target_facet,
  mapping.target_value_key,
  spice.semantic_ordinal,
  mapping.provenance::text as provenance,
  mapping.audit_reference
from public.private_taste_normalization_mappings as mapping
join public.private_taste_normalization_policies as policy
  on policy.normalization_policy_id = mapping.normalization_policy_id
 and policy.normalization_policy_version = mapping.normalization_policy_version
 and policy.active and policy.retired_at is null
join public.private_taste_source_vocabularies as vocabulary
  on vocabulary.source_vocabulary_id = mapping.source_vocabulary_id
 and vocabulary.source_vocabulary_version = mapping.source_vocabulary_version
 and vocabulary.source_facet = mapping.source_facet
 and vocabulary.active and vocabulary.retired_at is null
join public.private_taste_source_values as source
  on source.source_vocabulary_id = mapping.source_vocabulary_id
 and source.source_vocabulary_version = mapping.source_vocabulary_version
 and source.source_facet = mapping.source_facet
 and source.source_value_key = mapping.source_value_key
 and source.active and source.retired_at is null
join public.candidate_taste_taxonomies as taxonomy
  on taxonomy.taxonomy_version = mapping.target_taxonomy_version
 and taxonomy.taxonomy_version = policy.target_taxonomy_version
 and taxonomy.active and taxonomy.retired_at is null
join public.candidate_taste_facets as facet
  on facet.taxonomy_version = mapping.target_taxonomy_version
 and facet.facet_key = mapping.target_facet
 and facet.active and facet.retired_at is null
join public.candidate_taste_values as target
  on target.taxonomy_version = mapping.target_taxonomy_version
 and target.facet_key = mapping.target_facet
 and target.value_key = mapping.target_value_key
 and target.active and target.retired_at is null
left join public.candidate_taste_spice_order as spice
  on spice.taxonomy_version = mapping.target_taxonomy_version
 and spice.facet_key = mapping.target_facet
 and spice.value_key = mapping.target_value_key
where mapping.active and mapping.retired_at is null;

comment on view public.consumer_private_taste_source_values_v1 is
  'Authenticated vocabulary facts for validating new private Taste writes as stable source keys. Contains no user/profile data.';
comment on view public.consumer_private_taste_normalization_dictionary_v1 is
  'Authenticated active vocabulary-to-vocabulary dictionary. It contains no normalized user projection, user ID, candidate ID, score, or rank.';

revoke all on public.consumer_private_taste_source_values_v1 from public, anon, service_role;
revoke all on public.consumer_private_taste_normalization_dictionary_v1 from public, anon, service_role;
grant select on public.consumer_private_taste_source_values_v1 to authenticated;
grant select on public.consumer_private_taste_normalization_dictionary_v1 to authenticated;

commit;
