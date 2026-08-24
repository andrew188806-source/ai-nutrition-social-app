-- SR-2K-B: canonical Meal Buddy unfriend (解除飯友) authority.
--
-- Unfriend is the explicit end of an ACCEPTED relationship, and nothing else. It is deliberately NOT
-- modelled as `declined` or `cancelled`: those two are terminal outcomes of a PENDING invite and are
-- what `send_meal_buddy_invite` already reuses, so overloading either would make "this invite was
-- refused" and "we were buddies and are not any more" indistinguishable. It is also NOT a block:
-- block is separate safety authority, is evaluated by the frozen `may_evaluate_candidate`, and is
-- untouched here. Ending a relationship only ever REDUCES access, so it is not gated on candidate
-- authorization — a member who has blocked their counterpart must still be able to end the pair.
--
-- Chat needs no change to fail closed. The frozen SR-2J-A `authorize_meal_buddy_chat` already
-- requires `state = 'accepted'` under the same pair lock, so open/read/list/send all stop
-- authorizing the moment the row becomes `ended`, while the conversation and message rows are
-- retained untouched. A later re-invite and re-accept restores `accepted` on the SAME canonical pair
-- row, which restores the SAME canonical conversation and its history — that follows from the frozen
-- one-conversation-per-relationship design rather than from anything invented here.
--
-- No chat, ranking, exposure, context, interest, realtime or notification authority is created here.

begin;

alter table public.meal_buddy_relationships
  add column ended_at timestamptz;

comment on column public.meal_buddy_relationships.ended_at is
  'SR-2K-B instant an accepted Meal Buddy relationship was explicitly ended by one of its members. Set only while state = ''ended'' and cleared by a later re-invite.';

-- One canonical unordered row per pair still owns the whole lifecycle: `ended` joins the existing
-- terminal states rather than adding a second row or a parallel table.
alter table public.meal_buddy_relationships
  drop constraint meal_buddy_relationships_state_valid;
alter table public.meal_buddy_relationships
  add constraint meal_buddy_relationships_state_valid check (
    state in ('pending', 'accepted', 'declined', 'cancelled', 'ended')
  );

-- `ended` is reachable only from `accepted`, so it keeps the accepted/resolved instants that prove
-- the pair once existed and adds its own end instant. Every other state must carry no end instant.
alter table public.meal_buddy_relationships
  drop constraint meal_buddy_relationships_lifecycle_valid;
alter table public.meal_buddy_relationships
  add constraint meal_buddy_relationships_lifecycle_valid check (
    (state = 'pending' and accepted_at is null and resolved_at is null and ended_at is null)
    or (state = 'accepted' and accepted_at is not null and resolved_at is not null and ended_at is null)
    or (state in ('declined', 'cancelled') and accepted_at is null and resolved_at is not null and ended_at is null)
    or (state = 'ended' and accepted_at is not null and resolved_at is not null and ended_at is not null)
  );

alter table public.meal_buddy_relationships
  drop constraint meal_buddy_relationships_timestamps_valid;
alter table public.meal_buddy_relationships
  add constraint meal_buddy_relationships_timestamps_valid check (
    updated_at >= created_at
    and (accepted_at is null or accepted_at >= created_at)
    and (resolved_at is null or resolved_at >= created_at)
    and (ended_at is null or ended_at >= created_at)
  );

grant meal_buddy_relationship_authority to postgres with inherit false, set true;

-- Re-invite after an unfriend reuses the one canonical pair row exactly as a re-invite after a
-- decline or a cancel already does. The only change is that `ended` joins that reuse set and the end
-- instant is cleared with the rest of the resolved lifecycle. No duplicate or reverse row is ever
-- created, and the new invite's direction is the new sender's.
-- OWNERSHIP, NOT MEMBERSHIP. This routine is owned by `meal_buddy_relationship_authority`, and
-- postgres holds that role WITH INHERIT FALSE, so it carries none of the owner's object rights:
-- PostgreSQL refuses `create or replace` outright with 42501 `must be owner of function`. A cluster
-- superuser bypasses that check, which is why the replacement must be performed while ACTING as the
-- owner — the same idiom the frozen predecessor migrations use for their own authority routines.
grant create on schema social_internal to meal_buddy_relationship_authority;
set local role meal_buddy_relationship_authority;

create or replace function social_internal.send_meal_buddy_invite(
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
  elsif v_relation.state in ('declined', 'cancelled', 'ended') then
    update public.meal_buddy_relationships as relation
    set invited_by_user_id = p_actor_user_id,
        state = 'pending',
        created_at = v_now,
        updated_at = v_now,
        accepted_at = null,
        resolved_at = null,
        ended_at = null
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

set local role postgres;
revoke create on schema social_internal from meal_buddy_relationship_authority;

-- Ending an accepted relationship. Either member may do it; nobody else can, because the row is
-- located by the actor's own membership before anything else happens. The frozen pair lock is taken
-- before the decisive read, so a concurrent unfriend from the other side, a concurrent chat send and
-- a concurrent block activation all serialize against the same canonical row.
create function social_internal.end_meal_buddy_relationship(
  p_actor_user_id uuid,
  p_relation_id uuid
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
begin
  if p_actor_user_id is null or p_relation_id is null then
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

  -- Losing a race to the other member is not an error: the pair is already ended, which is exactly
  -- what this caller asked for. Both callers therefore observe one canonical terminal state.
  if v_relation.state = 'ended' then
    return query select v_relation.id, v_counterpart, 'none'::text;
    return;
  end if;

  -- A pending invite is refused or cancelled, never unfriended, and there is nothing to end when no
  -- relationship is active. Both are answered as "not a thing you can do", not as a state change.
  if v_relation.state <> 'accepted' then return; end if;

  update public.meal_buddy_relationships as relation
  set state = 'ended',
      updated_at = v_now,
      ended_at = v_now
  where relation.id = v_relation.id;

  return query select v_relation.id, v_counterpart, 'none'::text;
end;
$$;

-- Commenting a routine is an ownership operation too, so it is issued as the owner.
set local role meal_buddy_relationship_authority;
comment on function social_internal.send_meal_buddy_invite(uuid, uuid) is
  'SR-2I-A idempotent pair send, extended by SR-2K-B so an ended pair is re-invitable through the same canonical row. Current Candidate Authorization is checked under the exact participation/block locks. Reverse send preserves the existing pending direction and never auto-accepts.';
-- `end_meal_buddy_relationship` is still owned by postgres here; its owner is transferred below.
set local role postgres;
comment on function social_internal.end_meal_buddy_relationship(uuid, uuid) is
  'SR-2K-B atomic unfriend. Either member of an ACCEPTED pair ends it under the frozen pair lock; pending and absent relationships are refused, a repeat is idempotent, and no block is created. Conversation and message rows are retained but stop being authorized because chat requires the accepted state.';

revoke all on function social_internal.end_meal_buddy_relationship(uuid, uuid)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;

grant create on schema social_internal to meal_buddy_relationship_authority;
alter function social_internal.end_meal_buddy_relationship(uuid, uuid)
  owner to meal_buddy_relationship_authority;
revoke create on schema social_internal from meal_buddy_relationship_authority;

set local role meal_buddy_relationship_authority;
grant execute on function social_internal.end_meal_buddy_relationship(uuid, uuid) to social_runtime_executor;
set local role postgres;

revoke meal_buddy_relationship_authority from postgres granted by postgres;

commit;
