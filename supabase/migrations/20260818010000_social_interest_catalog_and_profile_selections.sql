-- SR-2C-R1: public Social interest catalog + profile/settings selection authority.
--
-- WHAT THIS IS. Two PUBLIC, USER-DECLARED interest namespaces — `general` (hobbies / lifestyle) and
-- `food` (cuisine / dining) — declared once in Profile Settings and reflected everywhere afterwards.
--
-- WHAT THIS IS NOT. Not Taste similarity, not ranking input, not Meal Buddy eligibility, not AI
-- inference, not meal-history inference, not health, nutrition, dietary-restriction or allergy data.
-- `food.ingredient_style.vegetarian_food` and `food.ingredient_style.spicy_food` are PUBLIC FOOD
-- INTERESTS a user typed into Settings. They must never be reinterpreted as a restriction, an
-- allergy or a medical fact. taste_profiles.preferred_cuisine_tags is deliberately NOT reused here:
-- it feeds the Taste engine and carries different provenance and privacy semantics.
--
-- SETTINGS OWN THE SELECTIONS, CARDS DO NOT. Selections live on the user's profile, keyed by
-- user_id. Nothing here touches public.meal_buddy_cards, and no card may ever copy, snapshot or
-- override an interest. Candidate presentation resolves interests at read time from the owner's
-- CURRENT selections, so changing Settings changes every subsequent projection with no card
-- recreation and no card mutation.
--
-- NO ENUM LOCK-IN. The catalog is data, not a PostgreSQL enum type. Adding an option is an INSERT.
-- Hierarchy is a self-referencing parent_key with an integer depth, so a future
-- namespace -> category -> subcategory -> tag level is additional rows, not a schema redesign.
--
-- IDENTITY IS THE STABLE KEY, NOT THE LABEL. tag_key is the primary key, so there is no internal
-- surrogate id to leak. Traditional Chinese display text lives in a separate per-locale label table
-- and is never identity.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Catalog authority.
-- ---------------------------------------------------------------------------------------------
create table public.social_interest_catalog (
  tag_key text primary key,
  namespace text not null check (namespace in ('general', 'food')),
  parent_key text references public.social_interest_catalog(tag_key) on delete restrict,
  -- 0 = top-level category, 1 = selectable fine tag. A future subcategory level is depth 2; no
  -- schema change is required to introduce it.
  depth integer not null check (depth >= 0),
  selectable boolean not null default true,
  display_order integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly the top level is parentless; everything deeper is anchored.
  constraint social_interest_catalog_parent_shape check ((depth = 0) = (parent_key is null)),
  -- Lets the selection table pin namespace through referential integrity rather than trust.
  constraint social_interest_catalog_key_namespace unique (tag_key, namespace)
);

comment on table public.social_interest_catalog is
  'SR-2C-R1 hierarchical public interest catalog. Data-driven, not an enum: a new option is an INSERT. tag_key is the stable machine identity and the only identifier ever exposed publicly. Display text is per-locale in social_interest_catalog_label and is never identity.';

create index social_interest_catalog_namespace_order_idx
  on public.social_interest_catalog (namespace, display_order, tag_key);
create index social_interest_catalog_parent_idx
  on public.social_interest_catalog (parent_key);

-- Localized display labels, separated from identity so the machine key never becomes zh-TW text.
create table public.social_interest_catalog_label (
  tag_key text not null references public.social_interest_catalog(tag_key) on delete cascade,
  locale text not null,
  label text not null,
  primary key (tag_key, locale)
);

comment on table public.social_interest_catalog_label is
  'SR-2C-R1 localized labels. Identity stays in social_interest_catalog.tag_key; adding en or ja is additional rows, never a change of identity.';

-- ---------------------------------------------------------------------------------------------
-- 2. Profile/settings selection authority.
--
-- Keyed by (user_id, tag_key): a duplicate selection is impossible by construction. The composite
-- foreign key pins each row's namespace to the catalog's namespace, so a general tag can never be
-- recorded as a food selection even if a caller lies about it.
-- ---------------------------------------------------------------------------------------------
create table public.social_profile_interest_selection (
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_key text not null,
  namespace text not null check (namespace in ('general', 'food')),
  created_at timestamptz not null default now(),
  primary key (user_id, tag_key),
  foreign key (tag_key, namespace)
    references public.social_interest_catalog(tag_key, namespace) on delete restrict
);

comment on table public.social_profile_interest_selection is
  'SR-2C-R1 canonical per-user public interest selections. Owned by Profile Settings, never by a Meal Buddy card. No snapshot, no per-card override: candidate presentation reads the CURRENT rows here.';

create index social_profile_interest_selection_user_namespace_idx
  on public.social_profile_interest_selection (user_id, namespace);

alter table public.social_profile_interest_selection enable row level security;

-- A user may read their own selections; nobody reads another user's rows through this grant. Public
-- projection of other people's interests is a separate server-owned authority.
create policy social_profile_interest_selection_owner_read
  on public.social_profile_interest_selection
  for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------------------------
-- 3. Client privileges. Reads only; every write goes through the atomic RPC below, matching the
-- frozen consumer Favorites write pattern.
-- ---------------------------------------------------------------------------------------------
grant select on table public.social_interest_catalog to authenticated;
grant select on table public.social_interest_catalog_label to authenticated;
grant select on table public.social_profile_interest_selection to authenticated;

revoke insert, update, delete on table public.social_interest_catalog from public, anon, authenticated;
revoke insert, update, delete on table public.social_interest_catalog_label from public, anon, authenticated;
revoke insert, update, delete on table public.social_profile_interest_selection from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Settings write authority.
--
-- Ownership is derived exclusively from auth.uid(); no caller identity is accepted as business
-- authority, so cross-user modification is not expressible. One namespace is replaced atomically per
-- call: the complete new selection set is validated before anything is written, so a rejected
-- request leaves the previous selections exactly as they were.
-- ---------------------------------------------------------------------------------------------
create function public.replace_authenticated_social_interests(
  p_namespace text,
  p_tag_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_namespace text := nullif(pg_catalog.btrim(p_namespace), '');
  v_keys text[];
  v_max integer;
  v_unknown text;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_namespace is null or v_namespace not in ('general', 'food') then
    raise exception 'SOCIAL_INTEREST_NAMESPACE_INVALID' using errcode = '22023';
  end if;

  -- A null array clears the namespace, exactly like an empty array. Never a fabricated default.
  v_keys := coalesce(p_tag_keys, '{}'::text[]);

  if pg_catalog.array_position(v_keys, null::text) is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NULL' using errcode = '22023';
  end if;

  -- Deduplicate before counting, so a caller repeating one key cannot consume the allowance twice
  -- and cannot create duplicate canonical rows.
  select pg_catalog.array_agg(distinct pg_catalog.btrim(k))
  into v_keys
  from pg_catalog.unnest(v_keys) as k
  where pg_catalog.btrim(k) <> '';
  v_keys := coalesce(v_keys, '{}'::text[]);

  -- Frozen SR-2C-R1 profile-settings limits. These are per-profile, never per-card.
  v_max := case v_namespace when 'general' then 8 else 5 end;
  if coalesce(pg_catalog.array_length(v_keys, 1), 0) > v_max then
    raise exception 'SOCIAL_INTEREST_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  -- Arbitrary text, retired options, non-selectable category rows and cross-namespace keys are all
  -- rejected by the same lookup: only an active, selectable tag of this exact namespace survives.
  select k
  into v_unknown
  from pg_catalog.unnest(v_keys) as k
  where not exists (
    select 1
    from public.social_interest_catalog as c
    where c.tag_key = k
      and c.namespace = v_namespace
      and c.active
      and c.selectable
  )
  limit 1;
  if v_unknown is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NOT_SELECTABLE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':social_interest:' || v_namespace, 0)
  );

  -- Deterministic whole-namespace replacement. The other namespace is never touched.
  delete from public.social_profile_interest_selection as s
  where s.user_id = v_user_id
    and s.namespace = v_namespace;

  insert into public.social_profile_interest_selection (user_id, tag_key, namespace)
  select v_user_id, k, v_namespace
  from pg_catalog.unnest(v_keys) as k;

  return pg_catalog.jsonb_build_object(
    'namespace', v_namespace,
    'tag_keys', coalesce(
      (
        select pg_catalog.jsonb_agg(ordered.tag_key order by ordered.display_order, ordered.tag_key)
        from (
          select s.tag_key, c.display_order
          from public.social_profile_interest_selection as s
          join public.social_interest_catalog as c on c.tag_key = s.tag_key
          where s.user_id = v_user_id
            and s.namespace = v_namespace
        ) as ordered
      ),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.replace_authenticated_social_interests(text, text[]) is
  'SR-2C-R1 atomic profile-settings interest replacement. Actor is auth.uid() only; no caller identity is accepted, so cross-user writes are not expressible. Replaces one namespace wholly, enforces the frozen limits (general 8, food 5), and rejects unknown, inactive, non-selectable and cross-namespace keys before writing anything. Clearing a namespace yields an empty array, never null.';

revoke all on function public.replace_authenticated_social_interests(text, text[]) from public;
revoke all on function public.replace_authenticated_social_interests(text, text[]) from anon;
grant execute on function public.replace_authenticated_social_interests(text, text[]) to authenticated;

commit;
