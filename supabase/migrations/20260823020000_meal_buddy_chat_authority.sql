-- SR-2J-A: relationship-gated, text-only Meal Buddy chat authority.
-- One accepted relationship lazily owns at most one private conversation. Every open, read and
-- send operation rechecks the current relationship, participation and bidirectional block authority
-- under the frozen SR-2I-A pair locks. No realtime, unread, notification or media authority exists.

begin;

create table public.meal_buddy_conversations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  relationship_id uuid not null references public.meal_buddy_relationships(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint meal_buddy_conversations_relationship_unique unique (relationship_id)
);

create table public.meal_buddy_messages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  conversation_id uuid not null references public.meal_buddy_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id uuid not null,
  public_ref_id uuid not null default pg_catalog.gen_random_uuid(),
  body text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint meal_buddy_messages_body_valid check (
    pg_catalog.length(pg_catalog.btrim(body)) between 1 and 2000
  ),
  constraint meal_buddy_messages_sender_idempotency_unique
    unique (conversation_id, sender_user_id, client_message_id),
  constraint meal_buddy_messages_public_ref_unique unique (public_ref_id)
);

create index meal_buddy_messages_conversation_order_idx
  on public.meal_buddy_messages (conversation_id, created_at desc, id desc);

comment on table public.meal_buddy_conversations is
  'SR-2J-A lazy canonical private conversation. Exactly zero or one per accepted Meal Buddy relationship; existence never authorizes access.';
comment on table public.meal_buddy_messages is
  'SR-2J-A text-only messages with per-sender client idempotency. No media, edits, deletes, reactions, delivery, read or notification state.';

alter table public.meal_buddy_conversations enable row level security;
alter table public.meal_buddy_messages enable row level security;
revoke all on table public.meal_buddy_conversations from public, anon, authenticated, authenticator, service_role;
revoke all on table public.meal_buddy_messages from public, anon, authenticated, authenticator, service_role;

create role meal_buddy_chat_authority with
  nologin noinherit nobypassrls nocreatedb nocreaterole nosuperuser noreplication;
grant meal_buddy_chat_authority to postgres with inherit false, set true;
grant usage on schema social_internal to meal_buddy_chat_authority;
grant select on table public.meal_buddy_relationships to meal_buddy_chat_authority;
grant select, insert on table public.meal_buddy_conversations to meal_buddy_chat_authority;
grant select, insert on table public.meal_buddy_messages to meal_buddy_chat_authority;

create policy meal_buddy_chat_authority_relationship_select on public.meal_buddy_relationships
  for select to meal_buddy_chat_authority using (true);
create policy meal_buddy_chat_authority_conversation_select on public.meal_buddy_conversations
  for select to meal_buddy_chat_authority using (true);
create policy meal_buddy_chat_authority_conversation_insert on public.meal_buddy_conversations
  for insert to meal_buddy_chat_authority with check (true);
create policy meal_buddy_chat_authority_message_select on public.meal_buddy_messages
  for select to meal_buddy_chat_authority using (true);
create policy meal_buddy_chat_authority_message_insert on public.meal_buddy_messages
  for insert to meal_buddy_chat_authority with check (true);

grant social_authority to postgres with inherit false, set true;
set local role social_authority;
grant execute on function social_internal.may_evaluate_candidate(uuid, uuid)
  to meal_buddy_chat_authority;
set local role postgres;
revoke social_authority from postgres granted by postgres;

grant meal_buddy_relationship_authority to postgres with inherit false, set true;
set local role meal_buddy_relationship_authority;
grant execute on function social_internal.lock_meal_buddy_relationship_pair(uuid, uuid)
  to meal_buddy_chat_authority;
set local role postgres;
revoke meal_buddy_relationship_authority from postgres granted by postgres;

create function social_internal.authorize_meal_buddy_chat(
  p_actor_user_id uuid,
  p_relationship_id uuid default null,
  p_conversation_id uuid default null
)
returns table (relationship_id uuid, conversation_id uuid, counterpart_user_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_relation public.meal_buddy_relationships%rowtype;
  v_conversation_id uuid;
  v_counterpart uuid;
begin
  if p_actor_user_id is null or (p_relationship_id is null) = (p_conversation_id is null) then
    return;
  end if;

  if p_relationship_id is not null then
    select relation.* into v_relation
    from public.meal_buddy_relationships as relation
    where relation.id = p_relationship_id
      and p_actor_user_id in (relation.user_low_id, relation.user_high_id);
  else
    select relation.* into v_relation
    from public.meal_buddy_conversations as conversation
    join public.meal_buddy_relationships as relation on relation.id = conversation.relationship_id
    where conversation.id = p_conversation_id
      and p_actor_user_id in (relation.user_low_id, relation.user_high_id);
  end if;
  if not found then return; end if;

  perform social_internal.lock_meal_buddy_relationship_pair(v_relation.user_low_id, v_relation.user_high_id);
  select relation.* into v_relation
  from public.meal_buddy_relationships as relation
  where relation.id = v_relation.id
    and p_actor_user_id in (relation.user_low_id, relation.user_high_id);
  if not found or v_relation.state <> 'accepted' then return; end if;

  v_counterpart := case when v_relation.user_low_id = p_actor_user_id
    then v_relation.user_high_id else v_relation.user_low_id end;
  if not social_internal.may_evaluate_candidate(p_actor_user_id, v_counterpart) then return; end if;

  if p_conversation_id is not null then
    select conversation.id into v_conversation_id
    from public.meal_buddy_conversations as conversation
    where conversation.id = p_conversation_id and conversation.relationship_id = v_relation.id;
    if not found then return; end if;
  end if;
  return query select v_relation.id, v_conversation_id, v_counterpart;
end;
$$;

create function social_internal.read_meal_buddy_chat(p_actor_user_id uuid, p_conversation_id uuid)
returns table (conversation_id uuid, counterpart_user_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_authorized record;
begin
  select * into v_authorized
  from social_internal.authorize_meal_buddy_chat(p_actor_user_id, null, p_conversation_id);
  if not found then return; end if;
  return query select v_authorized.conversation_id, v_authorized.counterpart_user_id;
end;
$$;

create function social_internal.open_meal_buddy_chat(p_actor_user_id uuid, p_relationship_id uuid)
returns table (conversation_id uuid, counterpart_user_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_authorized record;
  v_conversation_id uuid;
begin
  select * into v_authorized
  from social_internal.authorize_meal_buddy_chat(p_actor_user_id, p_relationship_id, null);
  if not found then return; end if;

  insert into public.meal_buddy_conversations (relationship_id)
  values (v_authorized.relationship_id)
  on conflict on constraint meal_buddy_conversations_relationship_unique do nothing
  returning id into v_conversation_id;
  if v_conversation_id is null then
    select conversation.id into v_conversation_id
    from public.meal_buddy_conversations as conversation
    where conversation.relationship_id = v_authorized.relationship_id;
  end if;
  return query select v_conversation_id, v_authorized.counterpart_user_id;
end;
$$;

create function social_internal.list_meal_buddy_chat_messages(
  p_actor_user_id uuid,
  p_conversation_id uuid,
  p_before_message_ref_id uuid,
  p_limit integer
)
returns table (
  message_ref_id uuid,
  counterpart_user_id uuid,
  sender_is_actor boolean,
  body text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_authorized record;
  v_before_created_at timestamptz;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then return; end if;
  select * into v_authorized
  from social_internal.authorize_meal_buddy_chat(p_actor_user_id, null, p_conversation_id);
  if not found then return; end if;

  if p_before_message_ref_id is not null then
    select message.created_at into v_before_created_at
    from public.meal_buddy_messages as message
    where message.public_ref_id = p_before_message_ref_id and message.conversation_id = p_conversation_id;
    if not found then raise exception 'CHAT_CURSOR_INVALID' using errcode = '22023'; end if;
  end if;

  return query
  select message.public_ref_id, v_authorized.counterpart_user_id,
    message.sender_user_id = p_actor_user_id, message.body, message.created_at
  from public.meal_buddy_messages as message
  where message.conversation_id = p_conversation_id
    and (
      p_before_message_ref_id is null
      or (message.created_at, message.id) < (
        v_before_created_at,
        (select cursor_message.id from public.meal_buddy_messages as cursor_message
          where cursor_message.public_ref_id = p_before_message_ref_id)
      )
    )
  order by message.created_at desc, message.id desc
  limit p_limit + 1;
end;
$$;

create function social_internal.send_meal_buddy_chat_message(
  p_actor_user_id uuid,
  p_conversation_id uuid,
  p_client_message_id uuid,
  p_body text
)
returns table (
  message_ref_id uuid,
  counterpart_user_id uuid,
  sender_is_actor boolean,
  body text,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_authorized record;
  v_message public.meal_buddy_messages%rowtype;
begin
  if p_client_message_id is null or p_body is null
    or pg_catalog.length(pg_catalog.btrim(p_body)) not between 1 and 2000 then return; end if;
  select * into v_authorized
  from social_internal.authorize_meal_buddy_chat(p_actor_user_id, null, p_conversation_id);
  if not found then return; end if;

  insert into public.meal_buddy_messages (conversation_id, sender_user_id, client_message_id, body)
  values (p_conversation_id, p_actor_user_id, p_client_message_id, p_body)
  on conflict on constraint meal_buddy_messages_sender_idempotency_unique do nothing
  returning * into v_message;
  if v_message.id is null then
    select message.* into v_message
    from public.meal_buddy_messages as message
    where message.conversation_id = p_conversation_id
      and message.sender_user_id = p_actor_user_id
      and message.client_message_id = p_client_message_id;
    if not found or v_message.body <> p_body then
      raise exception 'CHAT_IDEMPOTENCY_KEY_CONFLICT' using errcode = '22023';
    end if;
  end if;
  return query select v_message.public_ref_id, v_authorized.counterpart_user_id,
    true, v_message.body, v_message.created_at;
end;
$$;

comment on function social_internal.authorize_meal_buddy_chat(uuid, uuid, uuid) is
  'SR-2J-A common current accepted-relationship, participation and bidirectional-block gate under frozen pair locks.';
comment on function social_internal.open_meal_buddy_chat(uuid, uuid) is
  'Lazily returns the one canonical conversation for an accepted relationship. Concurrent reverse opens converge by relationship uniqueness.';
comment on function social_internal.read_meal_buddy_chat(uuid, uuid) is
  'Actor-scoped current conversation read used before bounded message projection; current safety is rechecked.';
comment on function social_internal.list_meal_buddy_chat_messages(uuid, uuid, uuid, integer) is
  'Actor-scoped bounded text history ordered by created_at and message UUID; current safety is rechecked.';
comment on function social_internal.send_meal_buddy_chat_message(uuid, uuid, uuid, text) is
  'Actor-derived idempotent text send. Current relationship and safety authority are rechecked in the same transaction.';

revoke all on function social_internal.authorize_meal_buddy_chat(uuid, uuid, uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.open_meal_buddy_chat(uuid, uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.read_meal_buddy_chat(uuid, uuid) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.list_meal_buddy_chat_messages(uuid, uuid, uuid, integer) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.send_meal_buddy_chat_message(uuid, uuid, uuid, text) from public, anon, authenticated, authenticator, service_role, social_runtime_executor;

grant create on schema social_internal to meal_buddy_chat_authority;
alter function social_internal.authorize_meal_buddy_chat(uuid, uuid, uuid) owner to meal_buddy_chat_authority;
alter function social_internal.open_meal_buddy_chat(uuid, uuid) owner to meal_buddy_chat_authority;
alter function social_internal.read_meal_buddy_chat(uuid, uuid) owner to meal_buddy_chat_authority;
alter function social_internal.list_meal_buddy_chat_messages(uuid, uuid, uuid, integer) owner to meal_buddy_chat_authority;
alter function social_internal.send_meal_buddy_chat_message(uuid, uuid, uuid, text) owner to meal_buddy_chat_authority;
revoke create on schema social_internal from meal_buddy_chat_authority;

set local role meal_buddy_chat_authority;
grant execute on function social_internal.open_meal_buddy_chat(uuid, uuid) to social_runtime_executor;
grant execute on function social_internal.read_meal_buddy_chat(uuid, uuid) to social_runtime_executor;
grant execute on function social_internal.list_meal_buddy_chat_messages(uuid, uuid, uuid, integer) to social_runtime_executor;
grant execute on function social_internal.send_meal_buddy_chat_message(uuid, uuid, uuid, text) to social_runtime_executor;
set local role postgres;
revoke meal_buddy_chat_authority from postgres granted by postgres;

commit;
