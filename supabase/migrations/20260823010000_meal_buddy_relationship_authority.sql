-- SR-2I-A: canonical Meal Buddy invite / accepted relationship authority.
--
-- One row owns one unordered user pair for its entire lifecycle. Resolved rows are reused by a
-- later invite, so reverse ordering and reinvites can never create a second canonical pair. Mobile
-- never calls these UUID-bearing functions: the authenticated Edge boundary opens actor-bound
-- opaque references, supplies the verified actor, and seals every returned internal identifier.
-- No chat, ranking, exposure, Meal Buddy context or interest authority is created here.

begin;

create table public.meal_buddy_relationships (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_low_id uuid not null references auth.users(id) on delete cascade,
  user_high_id uuid not null references auth.users(id) on delete cascade,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  accepted_at timestamptz,
  resolved_at timestamptz,
  constraint meal_buddy_relationships_pair_order check (user_low_id < user_high_id),
  constraint meal_buddy_relationships_pair_unique unique (user_low_id, user_high_id),
  constraint meal_buddy_relationships_inviter_is_member check (
    invited_by_user_id = user_low_id or invited_by_user_id = user_high_id
  ),
  constraint meal_buddy_relationships_state_valid check (
    state in ('pending', 'accepted', 'declined', 'cancelled')
  ),
  constraint meal_buddy_relationships_lifecycle_valid check (
    (state = 'pending' and accepted_at is null and resolved_at is null)
    or (state = 'accepted' and accepted_at is not null and resolved_at is not null)
    or (state in ('declined', 'cancelled') and accepted_at is null and resolved_at is not null)
  ),
  constraint meal_buddy_relationships_timestamps_valid check (
    updated_at >= created_at
    and (accepted_at is null or accepted_at >= created_at)
    and (resolved_at is null or resolved_at >= created_at)
  )
);

comment on table public.meal_buddy_relationships is
  'SR-2I-A canonical unordered Meal Buddy pair. pending records one directed invite; accepted is one symmetric 飯友 relation. Resolved rows are reused rather than duplicated. Carries no chat or ranking state.';

create index meal_buddy_relationships_high_low_idx
  on public.meal_buddy_relationships (user_high_id, user_low_id);

alter table public.meal_buddy_relationships enable row level security;
revoke all on table public.meal_buddy_relationships from public, anon, authenticated, authenticator, service_role;

create role meal_buddy_relationship_authority with
  nologin noinherit nobypassrls nocreatedb nocreaterole nosuperuser noreplication;

comment on role meal_buddy_relationship_authority is
  'SR-2I-A owner of canonical pair send/read/resolve functions. No login, client membership, chat, ranking, exposure, context, interest or service-role capability.';

grant meal_buddy_relationship_authority to postgres with inherit false, set true;
grant usage on schema social_internal to meal_buddy_relationship_authority;
grant select, insert, update on table public.meal_buddy_relationships to meal_buddy_relationship_authority;

create policy meal_buddy_relationship_authority_select on public.meal_buddy_relationships
  for select to meal_buddy_relationship_authority using (true);
create policy meal_buddy_relationship_authority_insert on public.meal_buddy_relationships
  for insert to meal_buddy_relationship_authority with check (true);
create policy meal_buddy_relationship_authority_update on public.meal_buddy_relationships
  for update to meal_buddy_relationship_authority using (true) with check (true);

-- Reuse the frozen candidate authorization instead of restating account, participation or block
-- policy. The grant is issued by its exact owner and gives this authority only the one boolean gate.
grant social_authority to postgres with inherit false, set true;
set local role social_authority;
grant execute on function social_internal.may_evaluate_candidate(uuid, uuid)
  to meal_buddy_relationship_authority;
set local role postgres;
revoke social_authority from postgres granted by postgres;

-- Serialize the unordered pair and every frozen safety authority that can change its eligibility.
-- The UUID order is global. Existing participation and block functions use the exact same keys, so
-- a pause/opt-out/block racing an invite or accept has a real transaction order and is re-checked
-- only after these locks have been acquired.
create function social_internal.lock_meal_buddy_relationship_pair(
  p_user_low_id uuid,
  p_user_high_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_user_low_id is null or p_user_high_id is null or p_user_low_id >= p_user_high_id then
    raise exception 'RELATIONSHIP_PAIR_INVALID' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_low_id::text || ':meal_buddy_relationship:' || p_user_high_id::text, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_low_id::text || ':social_participation', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_high_id::text || ':social_participation', 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_low_id::text || ':social_block:' || p_user_high_id::text, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_high_id::text || ':social_block:' || p_user_low_id::text, 0
  ));
end;
$$;

create function social_internal.send_meal_buddy_invite(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns table (relation_id uuid, counterpart_user_id uuid, relative_state text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_low uuid;
  v_high uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_relation public.meal_buddy_relationships%rowtype;
begin
  if p_actor_user_id is null or p_target_user_id is null or p_actor_user_id = p_target_user_id then
    raise exception 'RELATIONSHIP_TARGET_INVALID' using errcode = '22023';
  end if;
  if p_actor_user_id < p_target_user_id then
    v_low := p_actor_user_id; v_high := p_target_user_id;
  else
    v_low := p_target_user_id; v_high := p_actor_user_id;
  end if;

  perform social_internal.lock_meal_buddy_relationship_pair(v_low, v_high);
  if not social_internal.may_evaluate_candidate(p_actor_user_id, p_target_user_id) then
    raise exception 'RELATIONSHIP_TARGET_UNAVAILABLE' using errcode = '42501';
  end if;

  select relation.* into v_relation
  from public.meal_buddy_relationships as relation
  where relation.user_low_id = v_low and relation.user_high_id = v_high
  for update;

  if not found then
    insert into public.meal_buddy_relationships
      (user_low_id, user_high_id, invited_by_user_id, state, created_at, updated_at)
    values (v_low, v_high, p_actor_user_id, 'pending', v_now, v_now)
    returning * into v_relation;
  elsif v_relation.state in ('declined', 'cancelled') then
    update public.meal_buddy_relationships as relation
    set invited_by_user_id = p_actor_user_id,
        state = 'pending',
        created_at = v_now,
        updated_at = v_now,
        accepted_at = null,
        resolved_at = null
    where relation.id = v_relation.id
    returning * into v_relation;
  end if;

  return query select
    v_relation.id,
    p_target_user_id,
    case
      when v_relation.state = 'accepted' then 'accepted'
      when v_relation.invited_by_user_id = p_actor_user_id then 'outgoing_pending'
      else 'incoming_pending'
    end;
end;
$$;

create function social_internal.read_meal_buddy_relationship(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns table (relation_id uuid, counterpart_user_id uuid, relative_state text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_low uuid;
  v_high uuid;
begin
  if p_actor_user_id is null or p_target_user_id is null or p_actor_user_id = p_target_user_id then
    return;
  end if;
  if not social_internal.may_evaluate_candidate(p_actor_user_id, p_target_user_id) then
    return;
  end if;
  if p_actor_user_id < p_target_user_id then
    v_low := p_actor_user_id; v_high := p_target_user_id;
  else
    v_low := p_target_user_id; v_high := p_actor_user_id;
  end if;

  return query
  select relation.id, p_target_user_id,
    case
      when relation.state = 'accepted' then 'accepted'
      when relation.invited_by_user_id = p_actor_user_id then 'outgoing_pending'
      else 'incoming_pending'
    end
  from public.meal_buddy_relationships as relation
  where relation.user_low_id = v_low
    and relation.user_high_id = v_high
    and relation.state in ('pending', 'accepted');
end;
$$;

create function social_internal.list_meal_buddy_relationships(
  p_actor_user_id uuid
)
returns table (relation_id uuid, counterpart_user_id uuid, relative_state text)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select relation.id,
    case when relation.user_low_id = p_actor_user_id then relation.user_high_id else relation.user_low_id end,
    case
      when relation.state = 'accepted' then 'accepted'
      when relation.invited_by_user_id = p_actor_user_id then 'outgoing_pending'
      else 'incoming_pending'
    end
  from public.meal_buddy_relationships as relation
  where p_actor_user_id is not null
    and p_actor_user_id in (relation.user_low_id, relation.user_high_id)
    and relation.state in ('pending', 'accepted')
    and social_internal.may_evaluate_candidate(
      p_actor_user_id,
      case when relation.user_low_id = p_actor_user_id then relation.user_high_id else relation.user_low_id end
    )
  order by relation.updated_at desc, relation.id asc
$$;

create function social_internal.resolve_meal_buddy_relationship(
  p_actor_user_id uuid,
  p_relation_id uuid,
  p_action text
)
returns table (relation_id uuid, counterpart_user_id uuid, relative_state text)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_relation public.meal_buddy_relationships%rowtype;
  v_counterpart uuid;
  v_recipient uuid;
begin
  if p_actor_user_id is null or p_relation_id is null or p_action not in ('accept', 'decline', 'cancel') then
    return;
  end if;

  select relation.* into v_relation
  from public.meal_buddy_relationships as relation
  where relation.id = p_relation_id
    and p_actor_user_id in (relation.user_low_id, relation.user_high_id);
  if not found then return; end if;

  perform social_internal.lock_meal_buddy_relationship_pair(v_relation.user_low_id, v_relation.user_high_id);
  select relation.* into v_relation
  from public.meal_buddy_relationships as relation
  where relation.id = p_relation_id
    and p_actor_user_id in (relation.user_low_id, relation.user_high_id)
  for update;
  if not found then return; end if;

  v_counterpart := case when v_relation.user_low_id = p_actor_user_id
    then v_relation.user_high_id else v_relation.user_low_id end;
  v_recipient := case when v_relation.user_low_id = v_relation.invited_by_user_id
    then v_relation.user_high_id else v_relation.user_low_id end;

  if p_action = 'accept' then
    if p_actor_user_id <> v_recipient then return; end if;
    if not social_internal.may_evaluate_candidate(p_actor_user_id, v_counterpart) then
      raise exception 'RELATIONSHIP_TARGET_UNAVAILABLE' using errcode = '42501';
    end if;
    if v_relation.state = 'accepted' then
      return query select v_relation.id, v_counterpart, 'accepted'::text;
      return;
    end if;
    if v_relation.state <> 'pending' then return; end if;
    update public.meal_buddy_relationships as relation
    set state = 'accepted', updated_at = v_now, accepted_at = v_now, resolved_at = v_now
    where relation.id = v_relation.id;
    return query select v_relation.id, v_counterpart, 'accepted'::text;
    return;
  end if;

  if v_relation.state <> 'pending' then return; end if;
  if p_action = 'decline' and p_actor_user_id = v_recipient then
    update public.meal_buddy_relationships as relation
    set state = 'declined', updated_at = v_now, accepted_at = null, resolved_at = v_now
    where relation.id = v_relation.id;
    return query select v_relation.id, v_counterpart, 'none'::text;
    return;
  end if;
  if p_action = 'cancel' and p_actor_user_id = v_relation.invited_by_user_id then
    update public.meal_buddy_relationships as relation
    set state = 'cancelled', updated_at = v_now, accepted_at = null, resolved_at = v_now
    where relation.id = v_relation.id;
    return query select v_relation.id, v_counterpart, 'none'::text;
    return;
  end if;
end;
$$;

comment on function social_internal.send_meal_buddy_invite(uuid, uuid) is
  'SR-2I-A idempotent pair send. Current Candidate Authorization is checked under the exact participation/block locks. Reverse send preserves the existing pending direction and never auto-accepts.';
comment on function social_internal.read_meal_buddy_relationship(uuid, uuid) is
  'SR-2I-A current candidate-relative read. Returns only the verified actor pair and only while current Candidate Authorization remains valid.';
comment on function social_internal.list_meal_buddy_relationships(uuid) is
  'SR-2I-A actor-scoped active relation list. Current Candidate Authorization remains a hard gate. Returns internal identifiers only to the trusted Edge executor for sealing; never a public graph read.';
comment on function social_internal.resolve_meal_buddy_relationship(uuid, uuid, text) is
  'SR-2I-A atomic accept/decline/cancel. Recipient alone accepts or declines; sender alone cancels. Accept re-checks current safety authority and converts pending to one symmetric accepted pair in the same transaction.';

revoke all on function social_internal.lock_meal_buddy_relationship_pair(uuid, uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.send_meal_buddy_invite(uuid, uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.read_meal_buddy_relationship(uuid, uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.list_meal_buddy_relationships(uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.resolve_meal_buddy_relationship(uuid, uuid, text) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;

grant create on schema social_internal to meal_buddy_relationship_authority;
alter function social_internal.lock_meal_buddy_relationship_pair(uuid, uuid) owner to meal_buddy_relationship_authority;
alter function social_internal.send_meal_buddy_invite(uuid, uuid) owner to meal_buddy_relationship_authority;
alter function social_internal.read_meal_buddy_relationship(uuid, uuid) owner to meal_buddy_relationship_authority;
alter function social_internal.list_meal_buddy_relationships(uuid) owner to meal_buddy_relationship_authority;
alter function social_internal.resolve_meal_buddy_relationship(uuid, uuid, text) owner to meal_buddy_relationship_authority;
revoke create on schema social_internal from meal_buddy_relationship_authority;

set local role meal_buddy_relationship_authority;
grant execute on function social_internal.send_meal_buddy_invite(uuid, uuid) to social_runtime_executor;
grant execute on function social_internal.read_meal_buddy_relationship(uuid, uuid) to social_runtime_executor;
grant execute on function social_internal.list_meal_buddy_relationships(uuid) to social_runtime_executor;
grant execute on function social_internal.resolve_meal_buddy_relationship(uuid, uuid, text) to social_runtime_executor;
set local role postgres;

revoke meal_buddy_relationship_authority from postgres granted by postgres;

commit;
