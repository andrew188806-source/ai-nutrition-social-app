-- SR-2K-B: authorized realtime delivery for Meal Buddy chat.
--
-- MECHANISM. Private Supabase Realtime BROADCAST, not `postgres_changes`. postgres_changes would
-- require granting `authenticated` a SELECT on public.meal_buddy_messages, which the frozen SR-2J-A
-- authority explicitly revokes; the message tables must never be readable by a client role. Broadcast
-- keeps the base tables sealed and moves authorization to the channel.
--
-- CHANNEL IDENTITY. The topic is a server-minted opaque token stored beside the conversation, never
-- the conversation UUID, the relationship id, or a user id. Mobile learns it only from an authorized
-- chat open, and the internal mapping stays behind this trusted boundary.
--
-- THE EVENT IS A SIGNAL, NOT MESSAGE TRUTH. The broadcast payload deliberately carries no message
-- identity, no body and no counterpart data — only "this conversation changed". Mobile reconciles
-- through the frozen canonical message API, so an unvalidated realtime frame can never become chat
-- history, ordering stays the frozen server ordering, and reconnect gaps heal by the same path.
--
-- AUTHORIZATION IS CURRENT, NOT POSSESSED. Subscribing is gated by RLS on realtime.messages, which
-- re-evaluates the CURRENT accepted state plus the frozen block/participation authority on every
-- subscribe. An unfriend, a block or an opt-out therefore stops delivery; holding a stale topic
-- grants nothing. No unread, presence, typing, receipt or notification authority is created here.

begin;

create table public.meal_buddy_chat_channels (
  conversation_id uuid primary key
    references public.meal_buddy_conversations(id) on delete cascade,
  topic text not null unique,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint meal_buddy_chat_channels_topic_shape check (
    topic like 'mbrt1.%' and pg_catalog.length(topic) between 16 and 128
  )
);

comment on table public.meal_buddy_chat_channels is
  'SR-2K-B opaque realtime topic for one canonical conversation. The topic is random, not derived from any identifier, and is the only channel authority Mobile ever sees.';

alter table public.meal_buddy_chat_channels enable row level security;
revoke all on table public.meal_buddy_chat_channels from public, anon, authenticated, authenticator, service_role;

grant meal_buddy_chat_authority to postgres with inherit false, set true;
grant select, insert on table public.meal_buddy_chat_channels to meal_buddy_chat_authority;

-- WHY A PUBLISHER OF OUR OWN RATHER THAN A DIRECT realtime.send CALL.
-- `realtime.messages` is owned by the platform's realtime admin, and the migration runner is NOT a
-- member of that role: a `grant insert on realtime.messages to meal_buddy_chat_authority` is
-- silently dropped, leaving the authority with EXECUTE on realtime.send but no right to the spool it
-- writes. Since realtime.send is not SECURITY DEFINER, its INSERT runs as the caller and publishing
-- would fail at runtime with `permission denied for table messages`.
--
-- The runner itself does hold INSERT on the spool, so the publish is wrapped in one narrow definer
-- owned by the runner. It accepts a topic and a payload and does nothing else: it cannot read the
-- spool, cannot enumerate topics and is executable by the chat authority alone.
create function social_internal.publish_meal_buddy_chat_signal(
  p_topic text,
  p_event text,
  p_payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, realtime, pg_temp
as $$
begin
  if p_topic is null or p_event is null or p_payload is null then
    return;
  end if;
  perform realtime.send(p_payload, p_event, p_topic, true);
end;
$$;

comment on function social_internal.publish_meal_buddy_chat_signal(text, text, jsonb) is
  'SR-2K-B private broadcast publisher. Owned by the migration runner because the platform never lets a project role hold INSERT on realtime.messages. Write-only, executable by the chat authority alone, and it carries no identity, body or counterpart data.';

revoke all on function social_internal.publish_meal_buddy_chat_signal(text, text, jsonb)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
grant execute on function social_internal.publish_meal_buddy_chat_signal(text, text, jsonb)
  to meal_buddy_chat_authority;

-- No `auth` grant is attempted here. The platform holds auth USAGE without grant option, so such a
-- grant is silently dropped rather than refused; the subscribe gate below therefore reads the
-- verified subject straight from the request settings, which needs no privilege at all.

create policy meal_buddy_chat_authority_channel_select on public.meal_buddy_chat_channels
  for select to meal_buddy_chat_authority using (true);
create policy meal_buddy_chat_authority_channel_insert on public.meal_buddy_chat_channels
  for insert to meal_buddy_chat_authority with check (true);

-- Lazily mints one stable opaque topic per conversation. The token is 32 random bytes rendered
-- base64url, so it is neither derived from nor reversible to any internal identifier.
create function social_internal.ensure_meal_buddy_chat_channel(p_conversation_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_topic text;
begin
  if p_conversation_id is null then return null; end if;

  select channel.topic into v_topic
  from public.meal_buddy_chat_channels as channel
  where channel.conversation_id = p_conversation_id;
  if found then return v_topic; end if;

  -- Randomness comes from two v4 UUIDs rather than pgcrypto's gen_random_bytes: gen_random_uuid is
  -- a pg_catalog builtin, so the topic does not depend on which schema pgcrypto happens to be
  -- installed into. Two UUIDs supply 32 bytes, rendered base64url.
  v_topic := 'mbrt1.' || pg_catalog.translate(
    pg_catalog.encode(
      pg_catalog.decode(
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
        || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        'hex'),
      'base64'),
    '+/=', '-_');

  insert into public.meal_buddy_chat_channels (conversation_id, topic)
  values (p_conversation_id, v_topic)
  on conflict (conversation_id) do nothing;

  select channel.topic into v_topic
  from public.meal_buddy_chat_channels as channel
  where channel.conversation_id = p_conversation_id;
  return v_topic;
end;
$$;

-- The authorized topic for an actor's conversation. Authorization is delegated to the frozen chat
-- gate, so accepted state, participation and both block directions are all re-checked here.
create function social_internal.authorize_meal_buddy_chat_channel(
  p_actor_user_id uuid,
  p_conversation_id uuid
)
returns table (topic text)
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
  return query select social_internal.ensure_meal_buddy_chat_channel(v_authorized.conversation_id);
end;
$$;

-- The subscribe gate.
--
-- It lives in `public`, not `social_internal`, precisely so that `social_internal` stays sealed: RLS
-- on realtime.messages is evaluated with the SUBSCRIBER's privileges, so whatever the policy calls
-- must be executable by `authenticated`. Exposing one narrow definer function is a far smaller
-- surface than granting an end-user role USAGE on the internal authority schema.
--
-- It deliberately takes NO actor argument: the subject is always the verified JWT subject, so an
-- authenticated caller cannot use it as an oracle about anybody else. A caller who does not already
-- hold the topic learns nothing either, because the topic is unguessable.
create function public.meal_buddy_chat_realtime_authorized(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with subject as (
    -- The verified JWT subject, resolved WITHOUT touching the `auth` schema. The platform holds
    -- `auth` USAGE without grant option, so a `grant usage on schema auth` issued by the migration
    -- runner is silently dropped and an authority-owned definer calling auth.uid() would fail at
    -- subscribe time with `permission denied for schema auth`. This reads exactly what auth.uid()
    -- itself reads, and covers both spellings: PostgREST sets the flattened claim, Realtime sets the
    -- claims document. It remains the CURRENT connection's subject and can still name nobody else.
    select nullif(coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ), '')::uuid as user_id
  )
  select exists (
    select 1
    from subject
    join public.meal_buddy_chat_channels as channel
      on channel.topic = p_topic
    join public.meal_buddy_conversations as conversation
      on conversation.id = channel.conversation_id
    join public.meal_buddy_relationships as relation
      on relation.id = conversation.relationship_id
    where subject.user_id is not null
      and relation.state = 'accepted'
      and subject.user_id in (relation.user_low_id, relation.user_high_id)
      and social_internal.may_evaluate_candidate(
        subject.user_id,
        case when relation.user_low_id = subject.user_id
          then relation.user_high_id else relation.user_low_id end
      )
  );
$$;

comment on function public.meal_buddy_chat_realtime_authorized(text) is
  'SR-2K-B realtime subscribe gate. Answers only about the CURRENT JWT subject, so it cannot be used as an oracle, and re-evaluates accepted state plus the frozen block/participation authority on every subscribe.';

-- Publishing the signal happens inside the frozen send transaction: the message row and the
-- "something changed" broadcast commit together, so a delivered signal always has a committed
-- message behind it. The payload carries no identity, no body and no counterpart data.
-- The frozen SR-2J-A signature, idempotency contract and returned projection are preserved exactly.
-- The ONLY addition is the publish, and it is reached solely when the INSERT actually created a new
-- canonical row.
-- OWNERSHIP, NOT MEMBERSHIP. The frozen routine is owned by `meal_buddy_chat_authority`, which
-- postgres holds WITH INHERIT FALSE, so `create or replace` is refused with 42501 unless it is issued
-- while ACTING as the owner. Only a cluster superuser would get away with issuing it directly.
grant create on schema social_internal to meal_buddy_chat_authority;
set local role meal_buddy_chat_authority;

create or replace function social_internal.send_meal_buddy_chat_message(
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
  v_inserted boolean := false;
  v_topic text;
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
  else
    v_inserted := true;
  end if;

  -- Only a genuinely NEW canonical message publishes. An idempotent replay of the same
  -- clientMessageId takes the branch above and publishes nothing, so an uncertain-transport retry
  -- can never produce a second signal for one logical message.
  if v_inserted then
    v_topic := social_internal.ensure_meal_buddy_chat_channel(v_authorized.conversation_id);
    if v_topic is not null then
      perform social_internal.publish_meal_buddy_chat_signal(
        v_topic,
        'meal_buddy_chat_activity',
        pg_catalog.jsonb_build_object('kind', 'meal_buddy_chat_activity')
      );
    end if;
  end if;

  return query select v_message.public_ref_id, v_authorized.counterpart_user_id,
    true, v_message.body, v_message.created_at;
end;
$$;

set local role postgres;
revoke create on schema social_internal from meal_buddy_chat_authority;

revoke all on function social_internal.ensure_meal_buddy_chat_channel(uuid)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.authorize_meal_buddy_chat_channel(uuid, uuid)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
-- ORDER IS LOAD-BEARING, exactly as in the frozen SR-2B authority: a new function inherits
-- PostgreSQL's default of PUBLIC EXECUTE, and a REVOKE only removes grants made by the role issuing
-- it. Both revokes must therefore run while postgres still owns the function.
revoke all on function public.meal_buddy_chat_realtime_authorized(text)
  from public, anon, authenticator, service_role, social_runtime_executor;

grant create on schema social_internal to meal_buddy_chat_authority;
alter function social_internal.ensure_meal_buddy_chat_channel(uuid) owner to meal_buddy_chat_authority;
alter function social_internal.authorize_meal_buddy_chat_channel(uuid, uuid) owner to meal_buddy_chat_authority;
revoke create on schema social_internal from meal_buddy_chat_authority;
-- Handing a routine to a role requires that role to hold CREATE on the routine's schema, so the
-- privilege is lent for exactly this one statement and taken straight back. The subscribe gate lives
-- in `public` because RLS on realtime.messages is evaluated as the subscriber, who can never be
-- given access to `social_internal`.
grant create on schema public to meal_buddy_chat_authority;
alter function public.meal_buddy_chat_realtime_authorized(text) owner to meal_buddy_chat_authority;
revoke create on schema public from meal_buddy_chat_authority;

set local role meal_buddy_chat_authority;
grant execute on function social_internal.authorize_meal_buddy_chat_channel(uuid, uuid) to social_runtime_executor;
-- The single boolean an end-user role may call, because RLS on realtime.messages is evaluated as
-- that role. `social_internal` itself remains closed to every client role.
grant execute on function public.meal_buddy_chat_realtime_authorized(text) to authenticated;
set local role postgres;

revoke meal_buddy_chat_authority from postgres granted by postgres;

-- Channel authorization for the Realtime server. Subscribing to a private topic is a SELECT on
-- realtime.messages, so this policy is the whole subscribe gate.
create policy meal_buddy_chat_realtime_subscribe on realtime.messages
  for select to authenticated
  using (public.meal_buddy_chat_realtime_authorized(realtime.topic()));

commit;
