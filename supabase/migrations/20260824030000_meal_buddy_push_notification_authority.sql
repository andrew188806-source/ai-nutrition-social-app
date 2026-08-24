-- SR-2K-B: Meal Buddy push-notification authority.
--
-- SHAPE. One authenticated user owns many device registrations, and one canonical Social event
-- produces exactly ONE outbox row per recipient. Fan-out to that recipient's devices happens at
-- dispatch time, so a second device can never duplicate the event itself.
--
-- PUSH IS BEST-EFFORT, CORE SOCIAL STATE IS AUTHORITATIVE. Enqueueing is a plain insert inside the
-- transaction that already committed the invite, the accept or the message, so the notification can
-- never be lost while the event happened, and the transaction never depends on an external provider.
-- Dispatch to the provider is a separate, retryable step: a provider outage, an invalid token or a
-- denied permission changes no relationship, message or chat state.
--
-- TOKENS ARE SENSITIVE OPERATIONAL IDENTIFIERS. The device table is sealed from every client role and
-- is never joined into a profile, candidate, relationship or chat projection. A user may register,
-- rotate and disable only their OWN device, and no API returns anybody's token.
--
-- No unread counter, notification centre, realtime, media, typing, presence or receipt authority is
-- created here, and no event kind beyond the three this phase authorizes is representable.

begin;

create table public.meal_buddy_push_devices (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id text not null,
  platform text not null,
  push_token text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint meal_buddy_push_devices_user_install_unique unique (user_id, install_id),
  -- One provider token addresses exactly one device. If the same token reappears for another user
  -- or install, the previous registration must be released rather than left as a second live route.
  constraint meal_buddy_push_devices_token_unique unique (push_token),
  constraint meal_buddy_push_devices_platform_valid check (platform in ('ios', 'android')),
  constraint meal_buddy_push_devices_install_valid check (
    pg_catalog.length(install_id) between 8 and 200
  ),
  constraint meal_buddy_push_devices_token_valid check (
    pg_catalog.length(push_token) between 8 and 400
  ),
  constraint meal_buddy_push_devices_timestamps_valid check (updated_at >= created_at)
);

comment on table public.meal_buddy_push_devices is
  'SR-2K-B per-installation push registration. One user owns many devices; a token addresses exactly one device. Sealed from every client role and never joined into a public projection.';

create index meal_buddy_push_devices_recipient_idx
  on public.meal_buddy_push_devices (user_id) where enabled;

create table public.meal_buddy_notification_outbox (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_kind text not null,
  -- The idempotency of the whole feature. It is derived from the canonical event that occurred, so
  -- a replayed invite, a repeated accept and a retried message send all collapse onto one row.
  dedupe_key text not null unique,
  relationship_id uuid references public.meal_buddy_relationships(id) on delete cascade,
  conversation_id uuid references public.meal_buddy_conversations(id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  claimed_at timestamptz,
  dispatched_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  constraint meal_buddy_notification_outbox_kind_valid check (
    event_kind in ('meal_buddy_invite_received', 'meal_buddy_invite_accepted', 'meal_buddy_message_received')
  ),
  constraint meal_buddy_notification_outbox_recipient_not_actor check (recipient_user_id <> actor_user_id),
  constraint meal_buddy_notification_outbox_attempts_valid check (attempts >= 0)
);

comment on table public.meal_buddy_notification_outbox is
  'SR-2K-B durable notification event. Exactly one row per canonical Social event per recipient; device fan-out happens at dispatch. A sender never receives their own event, which the recipient/actor constraint makes unrepresentable.';

create index meal_buddy_notification_outbox_pending_idx
  on public.meal_buddy_notification_outbox (created_at) where dispatched_at is null;

alter table public.meal_buddy_push_devices enable row level security;
alter table public.meal_buddy_notification_outbox enable row level security;
revoke all on table public.meal_buddy_push_devices from public, anon, authenticated, authenticator, service_role;
revoke all on table public.meal_buddy_notification_outbox from public, anon, authenticated, authenticator, service_role;

create role meal_buddy_notification_authority with
  nologin noinherit nobypassrls nocreatedb nocreaterole nosuperuser noreplication;

comment on role meal_buddy_notification_authority is
  'SR-2K-B owner of push device registration and notification outbox functions. No login, no client membership, and no relationship, chat, ranking, exposure or interest capability beyond reading the counterpart identity a notification needs.';

grant meal_buddy_notification_authority to postgres with inherit false, set true;
grant usage on schema social_internal to meal_buddy_notification_authority;
grant select, insert, update, delete on table public.meal_buddy_push_devices to meal_buddy_notification_authority;
grant select, insert, update on table public.meal_buddy_notification_outbox to meal_buddy_notification_authority;

create policy meal_buddy_notification_authority_device_all on public.meal_buddy_push_devices
  for all to meal_buddy_notification_authority using (true) with check (true);
create policy meal_buddy_notification_authority_outbox_select on public.meal_buddy_notification_outbox
  for select to meal_buddy_notification_authority using (true);
create policy meal_buddy_notification_authority_outbox_insert on public.meal_buddy_notification_outbox
  for insert to meal_buddy_notification_authority with check (true);
create policy meal_buddy_notification_authority_outbox_update on public.meal_buddy_notification_outbox
  for update to meal_buddy_notification_authority using (true) with check (true);

-- The relationship and chat authorities enqueue, so they need insert on the outbox and nothing else.
grant meal_buddy_relationship_authority to postgres with inherit false, set true;
grant meal_buddy_chat_authority to postgres with inherit false, set true;
grant insert on table public.meal_buddy_notification_outbox to meal_buddy_relationship_authority;
grant insert on table public.meal_buddy_notification_outbox to meal_buddy_chat_authority;
create policy meal_buddy_relationship_authority_outbox_insert on public.meal_buddy_notification_outbox
  for insert to meal_buddy_relationship_authority with check (true);
create policy meal_buddy_chat_authority_outbox_insert on public.meal_buddy_notification_outbox
  for insert to meal_buddy_chat_authority with check (true);

-- ---------------------------------------------------------------------------------------------
-- Enqueue. Deliberately tolerant of a duplicate key: a replayed canonical event must be a no-op,
-- never an error that would roll back the Social transaction that called it.
-- ---------------------------------------------------------------------------------------------
create function social_internal.enqueue_meal_buddy_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_event_kind text,
  p_dedupe_key text,
  p_relationship_id uuid default null,
  p_conversation_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_recipient_user_id is null or p_actor_user_id is null
    or p_recipient_user_id = p_actor_user_id or p_dedupe_key is null then
    return;
  end if;

  insert into public.meal_buddy_notification_outbox
    (recipient_user_id, actor_user_id, event_kind, dedupe_key, relationship_id, conversation_id)
  values
    (p_recipient_user_id, p_actor_user_id, p_event_kind, p_dedupe_key, p_relationship_id, p_conversation_id)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Device registration. Actor-bound by construction: the user id is supplied by the verified Edge
-- boundary and every statement is scoped to it, so no caller can read or move another user's token.
-- ---------------------------------------------------------------------------------------------
create function social_internal.register_meal_buddy_push_device(
  p_user_id uuid,
  p_install_id text,
  p_platform text,
  p_push_token text
)
returns table (device_id uuid, rotated boolean)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_device public.meal_buddy_push_devices%rowtype;
  v_rotated boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null or p_install_id is null or p_platform is null or p_push_token is null then
    return;
  end if;
  if p_platform not in ('ios', 'android') then return; end if;
  if pg_catalog.length(p_install_id) not between 8 and 200
    or pg_catalog.length(p_push_token) not between 8 and 400 then
    return;
  end if;

  -- A provider token can migrate between installs and between users. Releasing every other holder
  -- first is what keeps "one token, one live route" true and stops a stale row addressing a device
  -- that now belongs to somebody else.
  delete from public.meal_buddy_push_devices as device
  where device.push_token = p_push_token
    and not (device.user_id = p_user_id and device.install_id = p_install_id);
  if found then v_rotated := true; end if;

  insert into public.meal_buddy_push_devices (user_id, install_id, platform, push_token, enabled)
  values (p_user_id, p_install_id, p_platform, p_push_token, true)
  on conflict on constraint meal_buddy_push_devices_user_install_unique do update
    set push_token = excluded.push_token,
        platform = excluded.platform,
        enabled = true,
        updated_at = v_now
  returning * into v_device;

  return query select v_device.id, v_rotated;
end;
$$;

create function social_internal.disable_meal_buddy_push_device(
  p_user_id uuid,
  p_install_id text
)
returns table (device_id uuid)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_device public.meal_buddy_push_devices%rowtype;
begin
  if p_user_id is null or p_install_id is null then return; end if;
  update public.meal_buddy_push_devices as device
  set enabled = false, updated_at = pg_catalog.clock_timestamp()
  where device.user_id = p_user_id and device.install_id = p_install_id
  returning * into v_device;
  if not found then return; end if;
  return query select v_device.id;
end;
$$;

-- The provider told us this token is gone. Removing it must never touch a healthy sibling device.
create function social_internal.retire_meal_buddy_push_token(p_push_token text)
returns table (retired integer)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_push_token is null then return; end if;
  delete from public.meal_buddy_push_devices as device where device.push_token = p_push_token;
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Dispatch. One claim marks the batch so concurrent dispatchers cannot double-send, and the
-- per-recipient fan-out is resolved here rather than being baked into the event.
-- ---------------------------------------------------------------------------------------------
-- This authority deliberately resolves NO display identity. Composing the counterpart's public name
-- is the frozen SR-2C projection's job and happens in the trusted Edge dispatcher, exactly as the
-- SR-2I-B relationship repository already composes it — so this role never gains a read on
-- consumer_profiles, and notification copy can never drift from the one canonical identity source.
create function social_internal.claim_meal_buddy_notifications(p_limit integer)
returns table (
  notification_id uuid,
  event_kind text,
  recipient_user_id uuid,
  actor_user_id uuid,
  push_token text,
  platform text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  return query
  with claimed as (
    update public.meal_buddy_notification_outbox as outbox
    set claimed_at = pg_catalog.clock_timestamp(),
        attempts = outbox.attempts + 1
    where outbox.id in (
      select candidate.id
      from public.meal_buddy_notification_outbox as candidate
      where candidate.dispatched_at is null
        and candidate.attempts < 5
      order by candidate.created_at
      for update skip locked
      limit least(greatest(coalesce(p_limit, 20), 1), 100)
    )
    returning outbox.*
  )
  select claimed.id, claimed.event_kind, claimed.recipient_user_id, claimed.actor_user_id,
    device.push_token, device.platform
  from claimed
  join public.meal_buddy_push_devices as device on device.user_id = claimed.recipient_user_id
  where device.enabled;
end;
$$;

create function social_internal.complete_meal_buddy_notification(
  p_notification_id uuid,
  p_delivered boolean,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_notification_id is null then return; end if;
  update public.meal_buddy_notification_outbox as outbox
  set dispatched_at = case when p_delivered then pg_catalog.clock_timestamp() else null end,
      last_error = case when p_delivered then null else pg_catalog.left(p_error, 500) end,
      claimed_at = null
  where outbox.id = p_notification_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Canonical event hooks. Each one enqueues only where a genuinely NEW canonical event occurred.
-- ---------------------------------------------------------------------------------------------
-- OWNERSHIP, NOT MEMBERSHIP. Each hook below is owned by its authority role, and postgres holds
-- those roles WITH INHERIT FALSE, so every `create or replace` here must be issued while ACTING as
-- the owning role or PostgreSQL refuses it with 42501. The two relationship hooks come first, then
-- the chat hook under its own owner.
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
  v_invited boolean := false;
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
    v_invited := true;
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
    v_invited := true;
  end if;

  -- Only a genuinely new invite notifies. A reverse send against an existing pending row, and a
  -- repeat by the same sender, both take neither branch above and therefore enqueue nothing.
  if v_invited then
    perform social_internal.enqueue_meal_buddy_notification(
      p_target_user_id, p_actor_user_id, 'meal_buddy_invite_received',
      'invite:' || v_relation.id::text || ':' || extract(epoch from v_relation.created_at)::text,
      v_relation.id, null);
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

create or replace function social_internal.resolve_meal_buddy_relationship(
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
    -- An idempotent repeat of accept returns the same state WITHOUT re-notifying, because the
    -- transition below is the only place that enqueues.
    if v_relation.state = 'accepted' then
      return query select v_relation.id, v_counterpart, 'accepted'::text;
      return;
    end if;
    if v_relation.state <> 'pending' then return; end if;
    update public.meal_buddy_relationships as relation
    set state = 'accepted', updated_at = v_now, accepted_at = v_now, resolved_at = v_now
    where relation.id = v_relation.id;
    perform social_internal.enqueue_meal_buddy_notification(
      v_relation.invited_by_user_id, p_actor_user_id, 'meal_buddy_invite_accepted',
      'accept:' || v_relation.id::text || ':' || extract(epoch from v_now)::text,
      v_relation.id, null);
    return query select v_relation.id, v_counterpart, 'accepted'::text;
    return;
  end if;

  if v_relation.state <> 'pending' then return; end if;
  -- Decline and cancel deliberately notify nobody in this phase.
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

set local role postgres;
revoke create on schema social_internal from meal_buddy_relationship_authority;

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

  -- Only a genuinely NEW canonical message publishes and notifies. An idempotent replay of the same
  -- clientMessageId takes the branch above, so an uncertain-transport retry produces neither a
  -- second realtime signal nor a second push event for one logical message.
  if v_inserted then
    v_topic := social_internal.ensure_meal_buddy_chat_channel(v_authorized.conversation_id);
    if v_topic is not null then
      perform social_internal.publish_meal_buddy_chat_signal(
        v_topic,
        'meal_buddy_chat_activity',
        pg_catalog.jsonb_build_object('kind', 'meal_buddy_chat_activity')
      );
    end if;
    perform social_internal.enqueue_meal_buddy_notification(
      v_authorized.counterpart_user_id, p_actor_user_id, 'meal_buddy_message_received',
      'message:' || v_message.id::text,
      v_authorized.relationship_id, v_authorized.conversation_id);
  end if;

  return query select v_message.public_ref_id, v_authorized.counterpart_user_id,
    true, v_message.body, v_message.created_at;
end;
$$;

set local role postgres;
revoke create on schema social_internal from meal_buddy_chat_authority;

comment on function social_internal.register_meal_buddy_push_device(uuid, text, text, text) is
  'SR-2K-B actor-bound device registration. Upserts one row per (user, install), rotates a token away from any previous holder, and returns no token to the caller.';
comment on function social_internal.claim_meal_buddy_notifications(integer) is
  'SR-2K-B dispatcher claim. Fans one canonical event out to the recipient''s enabled devices. It carries no message body and no display identity: the trusted Edge dispatcher composes the public name through the frozen SR-2C projection.';

revoke all on function social_internal.enqueue_meal_buddy_notification(uuid, uuid, text, text, uuid, uuid)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.register_meal_buddy_push_device(uuid, text, text, text)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.disable_meal_buddy_push_device(uuid, text)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.retire_meal_buddy_push_token(text)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.claim_meal_buddy_notifications(integer)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;
revoke all on function social_internal.complete_meal_buddy_notification(uuid, boolean, text)
  from public, anon, authenticated, authenticator, service_role, social_runtime_executor;

grant create on schema social_internal to meal_buddy_notification_authority;
alter function social_internal.enqueue_meal_buddy_notification(uuid, uuid, text, text, uuid, uuid)
  owner to meal_buddy_notification_authority;
alter function social_internal.register_meal_buddy_push_device(uuid, text, text, text)
  owner to meal_buddy_notification_authority;
alter function social_internal.disable_meal_buddy_push_device(uuid, text)
  owner to meal_buddy_notification_authority;
alter function social_internal.retire_meal_buddy_push_token(text)
  owner to meal_buddy_notification_authority;
alter function social_internal.claim_meal_buddy_notifications(integer)
  owner to meal_buddy_notification_authority;
alter function social_internal.complete_meal_buddy_notification(uuid, boolean, text)
  owner to meal_buddy_notification_authority;
revoke create on schema social_internal from meal_buddy_notification_authority;

set local role meal_buddy_notification_authority;
grant execute on function social_internal.register_meal_buddy_push_device(uuid, text, text, text) to social_runtime_executor;
grant execute on function social_internal.disable_meal_buddy_push_device(uuid, text) to social_runtime_executor;
grant execute on function social_internal.retire_meal_buddy_push_token(text) to social_runtime_executor;
grant execute on function social_internal.claim_meal_buddy_notifications(integer) to social_runtime_executor;
grant execute on function social_internal.complete_meal_buddy_notification(uuid, boolean, text) to social_runtime_executor;
-- The two canonical event authorities enqueue; nothing else may.
grant execute on function social_internal.enqueue_meal_buddy_notification(uuid, uuid, text, text, uuid, uuid)
  to meal_buddy_relationship_authority;
grant execute on function social_internal.enqueue_meal_buddy_notification(uuid, uuid, text, text, uuid, uuid)
  to meal_buddy_chat_authority;
set local role postgres;

revoke meal_buddy_notification_authority from postgres granted by postgres;
revoke meal_buddy_relationship_authority from postgres granted by postgres;
revoke meal_buddy_chat_authority from postgres granted by postgres;

commit;
