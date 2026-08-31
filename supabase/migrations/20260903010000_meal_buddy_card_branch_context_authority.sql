-- GEO-1D-P0: private exact branch context for recommendation-derived Meal Buddy cards.
-- The frozen handoff validates an exact branch/menu/restaurant tuple but stores only restaurant_id.
-- This additive successor persists that same branch privately. It adds no GEO filter or public field.

begin;

alter table public.meal_buddy_cards
  add constraint meal_buddy_cards_id_restaurant_id_key unique (id, restaurant_id);

create table social_internal.meal_buddy_card_branch_context (
  card_id uuid not null,
  restaurant_id text not null,
  branch_id text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint meal_buddy_card_branch_context_pkey primary key (card_id),
  constraint meal_buddy_card_branch_context_card_restaurant_fkey
    foreign key (card_id, restaurant_id)
    references public.meal_buddy_cards (id, restaurant_id)
    on update restrict on delete cascade,
  constraint meal_buddy_card_branch_context_branch_restaurant_fkey
    foreign key (branch_id, restaurant_id)
    references public.restaurant_branches (id, restaurant_id)
    on update restrict on delete restrict
);

comment on table social_internal.meal_buddy_card_branch_context is
  'GEO-1D-P0 private exact branch binding for recommendation-derived Meal Buddy cards. One row per card; server-only; no historical backfill and no public projection.';
comment on column social_internal.meal_buddy_card_branch_context.card_id is
  'Existing internal Meal Buddy card identity. Primary-key cardinality permits one binding per card.';
comment on column social_internal.meal_buddy_card_branch_context.restaurant_id is
  'Relational witness that must equal both the card restaurant and branch restaurant.';
comment on column social_internal.meal_buddy_card_branch_context.branch_id is
  'Exact branch already validated by the recommendation handoff; never restaurant-inferred.';

alter table social_internal.meal_buddy_card_branch_context enable row level security;
alter table social_internal.meal_buddy_card_branch_context force row level security;

create policy meal_buddy_card_branch_context_writer_select
  on social_internal.meal_buddy_card_branch_context
  for select to meal_buddy_card_write_authority using (true);
create policy meal_buddy_card_branch_context_writer_insert
  on social_internal.meal_buddy_card_branch_context
  for insert to meal_buddy_card_write_authority with check (true);

revoke all on table social_internal.meal_buddy_card_branch_context
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;

grant meal_buddy_card_write_authority to postgres with inherit false, set true;
grant create on schema social_internal to meal_buddy_card_write_authority;

-- The frozen function validates and creates once. The same supplied branch is then inserted in this
-- statement. Any binding failure aborts the statement and rolls the nested card insert back.
create function social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(
  p_actor_user_id uuid,
  p_card_type text,
  p_intention_type text,
  p_restaurant_id text,
  p_area text,
  p_dining_date date,
  p_meal_period text,
  p_preferred_time time,
  p_general_cap integer,
  p_restaurant_cap integer,
  p_food_context_tag_key text,
  p_branch_menu_item_id text,
  p_menu_item_id text,
  p_recommendation_restaurant_id text,
  p_branch_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_payload jsonb;
  v_card_id uuid;
begin
  v_payload := social_internal.create_meal_buddy_card_from_recommendation(
    p_actor_user_id, p_card_type, p_intention_type, p_restaurant_id, p_area,
    p_dining_date, p_meal_period, p_preferred_time, p_general_cap, p_restaurant_cap,
    p_food_context_tag_key, p_branch_menu_item_id, p_menu_item_id,
    p_recommendation_restaurant_id, p_branch_id
  );

  if v_payload ->> 'ok' = 'true' and p_branch_id is not null then
    v_card_id := (v_payload #>> '{card,id}')::uuid;
    insert into social_internal.meal_buddy_card_branch_context
      (card_id, restaurant_id, branch_id)
    values (v_card_id, p_recommendation_restaurant_id, p_branch_id);
  end if;

  return v_payload;
end;
$$;

comment on function social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) is
  'GEO-1D-P0 atomic successor. Calls the frozen recommendation writer once and binds its returned card id to the same validated branch input. Binding failure rolls back card creation; direct creates remain unbound.';

-- Future GEO-1D supplies only already-authorized internal card ids. Missing rows mean unknown.
create function social_internal.read_meal_buddy_card_branch_context(p_card_ids uuid[])
returns table (card_id uuid, restaurant_id text, branch_id text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_card_ids is null
    or pg_catalog.array_position(p_card_ids, null::uuid) is not null
    or pg_catalog.cardinality(p_card_ids) > 200 then
    raise exception 'INVALID_CARD_CONTEXT_READ' using errcode = '22023';
  end if;
  return query
    select context.card_id, context.restaurant_id, context.branch_id
    from social_internal.meal_buddy_card_branch_context as context
    where context.card_id = any (p_card_ids)
    order by context.card_id asc;
end;
$$;

comment on function social_internal.read_meal_buddy_card_branch_context(uuid[]) is
  'GEO-1D-P0 server-only exact branch read seam for bounded already-authorized internal Meal Buddy card ids.';

revoke all on function social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.read_meal_buddy_card_branch_context(uuid[])
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;

alter table social_internal.meal_buddy_card_branch_context owner to meal_buddy_card_write_authority;
alter function social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text)
  owner to meal_buddy_card_write_authority;
alter function social_internal.read_meal_buddy_card_branch_context(uuid[])
  owner to meal_buddy_card_write_authority;

set local role meal_buddy_card_write_authority;
grant execute on function social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text)
  to social_runtime_executor;
grant execute on function social_internal.read_meal_buddy_card_branch_context(uuid[])
  to social_runtime_executor;
set local role postgres;

revoke create on schema social_internal from meal_buddy_card_write_authority;
revoke meal_buddy_card_write_authority from postgres granted by postgres;

commit;
