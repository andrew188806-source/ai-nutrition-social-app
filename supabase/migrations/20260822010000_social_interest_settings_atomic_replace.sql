-- SR-2H-B: one authenticated, atomic Save authority for both Profile interest namespaces.
--
-- The frozen SR-2C-R1 single-namespace function remains unchanged for existing callers. This
-- successor acquires those exact same namespace-specific advisory locks, in one global order, so a
-- combined Save serializes with both predecessor calls without introducing a parallel lock domain.
-- The function invocation is one PostgreSQL transaction: validation or write failure rolls back
-- both namespace replacements.

begin;

create function public.replace_authenticated_social_interest_settings(
  p_general_tag_keys text[],
  p_food_tag_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_general_keys text[] := coalesce(p_general_tag_keys, '{}'::text[]);
  v_food_keys text[] := coalesce(p_food_tag_keys, '{}'::text[]);
  v_invalid_key text;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if pg_catalog.array_position(v_general_keys, null::text) is not null
    or pg_catalog.array_position(v_food_keys, null::text) is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NULL' using errcode = '22023';
  end if;

  -- Preserve the frozen SR-2C-R1 normalization exactly: trim, discard empty values and deduplicate
  -- before enforcing the per-namespace limits.
  select pg_catalog.array_agg(distinct pg_catalog.btrim(k))
  into v_general_keys
  from pg_catalog.unnest(v_general_keys) as k
  where pg_catalog.btrim(k) <> '';
  v_general_keys := coalesce(v_general_keys, '{}'::text[]);

  select pg_catalog.array_agg(distinct pg_catalog.btrim(k))
  into v_food_keys
  from pg_catalog.unnest(v_food_keys) as k
  where pg_catalog.btrim(k) <> '';
  v_food_keys := coalesce(v_food_keys, '{}'::text[]);

  if coalesce(pg_catalog.array_length(v_general_keys, 1), 0) > 8
    or coalesce(pg_catalog.array_length(v_food_keys, 1), 0) > 5 then
    raise exception 'SOCIAL_INTEREST_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  -- Validate BOTH complete desired sets before either namespace can be changed. The namespace
  -- literal is server-owned, so a general key cannot be smuggled into food (or vice versa).
  select candidate.tag_key
  into v_invalid_key
  from (
    select k as tag_key, 'general'::text as namespace
    from pg_catalog.unnest(v_general_keys) as k
    union all
    select k as tag_key, 'food'::text as namespace
    from pg_catalog.unnest(v_food_keys) as k
  ) as candidate
  where not exists (
    select 1
    from public.social_interest_catalog as c
    where c.tag_key = candidate.tag_key
      and c.namespace = candidate.namespace
      and c.active
      and c.selectable
  )
  limit 1;
  if v_invalid_key is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NOT_SELECTABLE' using errcode = '22023';
  end if;

  -- These are the exact predecessor lock keys. Fixed general -> food ordering prevents a deadlock
  -- between concurrent combined Saves while retaining serialization with each old namespace call.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':social_interest:general', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':social_interest:food', 0)
  );

  delete from public.social_profile_interest_selection as s
  where s.user_id = v_user_id
    and s.namespace in ('general', 'food');

  insert into public.social_profile_interest_selection (user_id, tag_key, namespace)
  select v_user_id, k, 'general'
  from pg_catalog.unnest(v_general_keys) as k
  union all
  select v_user_id, k, 'food'
  from pg_catalog.unnest(v_food_keys) as k;

  return pg_catalog.jsonb_build_object(
    'general_tag_keys', coalesce(
      (
        select pg_catalog.jsonb_agg(ordered.tag_key order by ordered.display_order, ordered.tag_key)
        from (
          select s.tag_key, c.display_order
          from public.social_profile_interest_selection as s
          join public.social_interest_catalog as c on c.tag_key = s.tag_key
          where s.user_id = v_user_id and s.namespace = 'general'
        ) as ordered
      ),
      '[]'::jsonb
    ),
    'food_tag_keys', coalesce(
      (
        select pg_catalog.jsonb_agg(ordered.tag_key order by ordered.display_order, ordered.tag_key)
        from (
          select s.tag_key, c.display_order
          from public.social_profile_interest_selection as s
          join public.social_interest_catalog as c on c.tag_key = s.tag_key
          where s.user_id = v_user_id and s.namespace = 'food'
        ) as ordered
      ),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.replace_authenticated_social_interest_settings(text[], text[]) is
  'SR-2H-B atomic combined Profile interest Settings Save. Actor is auth.uid() only. Validates and replaces the complete general (max 8) and food (max 5) sets in one transaction, using the frozen namespace advisory locks in general-then-food order. Existing single-namespace callers remain compatible.';

revoke all on function public.replace_authenticated_social_interest_settings(text[], text[]) from public;
revoke all on function public.replace_authenticated_social_interest_settings(text[], text[]) from anon;
grant execute on function public.replace_authenticated_social_interest_settings(text[], text[]) to authenticated;

commit;
