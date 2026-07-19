-- Consumer Runtime Phase 2Y-D-A: Authenticated Atomic Recommendation Feedback Write RPCs.
-- Ownership derives exclusively from auth.uid(). No caller-supplied user identity is accepted.
-- All three functions are SECURITY DEFINER with a fixed search_path.
-- Direct table INSERT/UPDATE/DELETE by authenticated role remains closed.

begin;

-- Ensure table writes remain closed to direct access.
revoke insert, update, delete on table public.recommendation_sessions from public, anon, authenticated;
revoke insert, update, delete on table public.recommendation_feedback from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────────
-- RPC 1: create_authenticated_recommendation_session(uuid, text, text)
-- Creates or idempotently resolves a recommendation session owned by auth.uid().
-- ────────────────────────────────────────────────────────────────────────────────
create or replace function public.create_authenticated_recommendation_session(
  p_session_id    uuid,
  p_source_surface text,
  p_model_version  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id        uuid    := auth.uid();
  v_source_surface text;
  v_model_version  text;
  v_existing       public.recommendation_sessions%rowtype;
  v_new            public.recommendation_sessions%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  -- Sanitize source_surface: trim, nonempty, bounded length, no control characters.
  v_source_surface := pg_catalog.btrim(p_source_surface);
  if v_source_surface is null or v_source_surface = '' then
    raise exception 'SESSION_SOURCE_SURFACE_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.length(v_source_surface) > 200 then
    raise exception 'SESSION_SOURCE_SURFACE_TOO_LONG' using errcode = '22023';
  end if;
  if v_source_surface ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
    raise exception 'SESSION_SOURCE_SURFACE_INVALID_CHARACTERS' using errcode = '22023';
  end if;

  -- Sanitize model_version: optional; trim, bounded length, no control characters.
  if p_model_version is not null then
    v_model_version := pg_catalog.btrim(p_model_version);
    if v_model_version = '' then
      v_model_version := null;
    elsif pg_catalog.length(v_model_version) > 200 then
      raise exception 'SESSION_MODEL_VERSION_TOO_LONG' using errcode = '22023';
    elsif v_model_version ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
      raise exception 'SESSION_MODEL_VERSION_INVALID_CHARACTERS' using errcode = '22023';
    end if;
  end if;

  -- Attempt insert; PK convergence handles concurrent creates with the same session_id.
  insert into public.recommendation_sessions (
    id, user_id, source_surface, context_snapshot, model_version, schema_version, started_at
  ) values (
    p_session_id, v_user_id, v_source_surface, '{}'::jsonb, v_model_version,
    'consumer-recommendation-v1', pg_catalog.clock_timestamp()
  )
  on conflict (id) do nothing
  returning * into v_new;

  if v_new.id is not null then
    return pg_catalog.jsonb_build_object(
      'status',     'created',
      'session_id', v_new.id,
      'started_at', v_new.started_at
    );
  end if;

  -- Conflict: session_id already exists. Check ownership before classifying.
  select * into v_existing
  from public.recommendation_sessions
  where id = p_session_id;

  -- Fail closed: foreign-actor UUID collision and same-actor payload conflict both raise
  -- SESSION_CREATE_CONFLICT. The public result for both cases is create_failed; no response
  -- field distinguishes "exists but belongs to another actor" from a general create failure.
  if v_existing.user_id is null or v_existing.user_id <> v_user_id then
    raise exception 'SESSION_CREATE_CONFLICT' using errcode = '22023';
  end if;

  -- Same actor: check immutable payload (source_surface + model_version).
  if v_existing.source_surface = v_source_surface
     and v_existing.model_version is not distinct from v_model_version then
    return pg_catalog.jsonb_build_object(
      'status',     'already_created',
      'session_id', v_existing.id
    );
  end if;

  -- Same actor, same session_id, different payload: generic create conflict.
  raise exception 'SESSION_CREATE_CONFLICT' using errcode = '22023';
end;
$$;

comment on function public.create_authenticated_recommendation_session(uuid, text, text)
  is 'Atomically creates or idempotently resolves a recommendation session; ownership derives only from auth.uid().';

-- ────────────────────────────────────────────────────────────────────────────────
-- RPC 2: end_authenticated_recommendation_session(uuid)
-- Marks a session as ended; idempotent for the session owner.
-- ────────────────────────────────────────────────────────────────────────────────
create or replace function public.end_authenticated_recommendation_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.recommendation_sessions%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  -- CAS: set ended_at only when currently NULL (first-end wins, concurrent retry → already_ended).
  update public.recommendation_sessions
  set    ended_at = pg_catalog.clock_timestamp()
  where  id       = p_session_id
    and  user_id  = v_user_id
    and  ended_at is null
  returning * into v_session;

  if v_session.id is not null then
    return pg_catalog.jsonb_build_object(
      'status',     'ended',
      'session_id', v_session.id,
      'ended_at',   v_session.ended_at
    );
  end if;

  -- No rows updated: check ownership without leaking foreign session existence.
  select * into v_session
  from   public.recommendation_sessions
  where  id      = p_session_id
    and  user_id = v_user_id;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'session_not_found');
  end if;

  -- Owned and already ended.
  return pg_catalog.jsonb_build_object(
    'status',     'already_ended',
    'session_id', v_session.id,
    'ended_at',   v_session.ended_at
  );
end;
$$;

comment on function public.end_authenticated_recommendation_session(uuid)
  is 'Atomically ends a recommendation session owned by auth.uid(); idempotent for the owner.';

-- ────────────────────────────────────────────────────────────────────────────────
-- RPC 3: record_authenticated_recommendation_feedback_event(uuid, text, text, text, text, text, text, text)
-- Appends an idempotent feedback event to an owned active session.
-- ────────────────────────────────────────────────────────────────────────────────
create or replace function public.record_authenticated_recommendation_feedback_event(
  p_session_id             uuid,
  p_action                 text,
  p_target_kind            text,
  p_event_idempotency_key  text,
  p_recommendation_id      text default null,
  p_restaurant_id          text default null,
  p_branch_id              text default null,
  p_menu_item_id           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id            uuid                          := auth.uid();
  v_session            public.recommendation_sessions%rowtype;
  v_action             recommendation_feedback_action;
  v_target_kind        text;
  v_recommendation_id  text;
  v_restaurant_id      text;
  v_branch_id          text;
  v_menu_item_id       text;
  v_event_key          text;
  v_existing           public.recommendation_feedback%rowtype;
  v_new_id             uuid;
  v_row_count          int;
  v_ts                 timestamptz;
  v_shown_at           timestamptz := null;
  v_clicked_at         timestamptz := null;
  v_accepted_at        timestamptz := null;
  v_dismissed_at       timestamptz := null;
  v_saved_at           timestamptz := null;
  v_consumed_at        timestamptz := null;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  -- Validate idempotency key: trim, nonempty, bounded length, no control characters.
  v_event_key := pg_catalog.btrim(p_event_idempotency_key);
  if v_event_key is null or v_event_key = '' then
    raise exception 'EVENT_IDEMPOTENCY_KEY_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.length(v_event_key) > 500 then
    raise exception 'EVENT_IDEMPOTENCY_KEY_TOO_LONG' using errcode = '22023';
  end if;
  if v_event_key ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
    raise exception 'EVENT_IDEMPOTENCY_KEY_INVALID_CHARACTERS' using errcode = '22023';
  end if;

  -- Validate and cast action to enum; invalid values are rejected.
  begin
    v_action := p_action::recommendation_feedback_action;
  exception when invalid_text_representation then
    raise exception 'FEEDBACK_ACTION_INVALID' using errcode = '22023';
  end;

  -- Validate target kind.
  v_target_kind := pg_catalog.btrim(p_target_kind);
  if v_target_kind not in ('recommendation', 'restaurant', 'menu_item') then
    raise exception 'FEEDBACK_TARGET_KIND_INVALID' using errcode = '22023';
  end if;

  -- Exact target shape: reject identity fields that don't belong to the declared target kind.
  -- recommendation: only recommendation_id is allowed; restaurant_id, menu_item_id, branch_id must be null.
  -- restaurant: only restaurant_id (and optional branch_id) are allowed; recommendation_id and menu_item_id must be null.
  -- menu_item: only restaurant_id, menu_item_id (and optional branch_id) are allowed; recommendation_id must be null.
  if v_target_kind = 'recommendation' then
    if p_restaurant_id is not null or p_menu_item_id is not null or p_branch_id is not null then
      raise exception 'FEEDBACK_TARGET_SHAPE_INVALID' using errcode = '22023';
    end if;
  elsif v_target_kind = 'restaurant' then
    if p_recommendation_id is not null or p_menu_item_id is not null then
      raise exception 'FEEDBACK_TARGET_SHAPE_INVALID' using errcode = '22023';
    end if;
  elsif v_target_kind = 'menu_item' then
    if p_recommendation_id is not null then
      raise exception 'FEEDBACK_TARGET_SHAPE_INVALID' using errcode = '22023';
    end if;
  end if;

  -- Per-kind target field validation and catalog existence verification.
  if v_target_kind = 'recommendation' then
    v_recommendation_id := nullif(pg_catalog.btrim(p_recommendation_id), '');
    if v_recommendation_id is null then
      raise exception 'FEEDBACK_RECOMMENDATION_ID_REQUIRED' using errcode = '22023';
    end if;
    if pg_catalog.length(v_recommendation_id) > 500 then
      raise exception 'FEEDBACK_RECOMMENDATION_ID_TOO_LONG' using errcode = '22023';
    end if;
    if v_recommendation_id ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
      raise exception 'FEEDBACK_RECOMMENDATION_ID_INVALID_CHARACTERS' using errcode = '22023';
    end if;
    if pg_catalog.left(v_recommendation_id, 4) = 'fav-' then
      raise exception 'FEEDBACK_RECOMMENDATION_ID_RESERVED_PREFIX' using errcode = '22023';
    end if;
    -- NOTE: recommendation_id has no catalog table. Existence check is a Development hard gate.
    -- See Phase 2Y-D-B runbook: deploy with a controlled test recommendation_id.

  elsif v_target_kind = 'restaurant' then
    v_restaurant_id := nullif(pg_catalog.btrim(p_restaurant_id), '');
    if v_restaurant_id is null then
      raise exception 'FEEDBACK_RESTAURANT_ID_REQUIRED' using errcode = '22023';
    end if;
    if pg_catalog.length(v_restaurant_id) > 500 then
      raise exception 'FEEDBACK_RESTAURANT_ID_TOO_LONG' using errcode = '22023';
    end if;
    if pg_catalog.left(v_restaurant_id, 4) = 'fav-' then
      raise exception 'FEEDBACK_RESTAURANT_ID_RESERVED_PREFIX' using errcode = '22023';
    end if;
    perform 1 from public.restaurants as r where r.id = v_restaurant_id for key share;
    if not found then
      raise exception 'FEEDBACK_RESTAURANT_NOT_FOUND' using errcode = '22023';
    end if;
    -- branch_id: verify existence and parent relationship via restaurant_branches catalog.
    if p_branch_id is not null then
      v_branch_id := nullif(pg_catalog.btrim(p_branch_id), '');
      if v_branch_id is not null then
        if pg_catalog.length(v_branch_id) > 500 then
          raise exception 'FEEDBACK_BRANCH_ID_TOO_LONG' using errcode = '22023';
        end if;
        if pg_catalog.left(v_branch_id, 4) = 'fav-' then
          raise exception 'FEEDBACK_BRANCH_ID_RESERVED_PREFIX' using errcode = '22023';
        end if;
        perform 1 from public.restaurant_branches as rb
        where rb.id = v_branch_id and rb.restaurant_id = v_restaurant_id
        for key share;
        if not found then
          raise exception 'FEEDBACK_BRANCH_NOT_FOUND_OR_MISMATCH' using errcode = '22023';
        end if;
      end if;
    end if;

  elsif v_target_kind = 'menu_item' then
    v_restaurant_id := nullif(pg_catalog.btrim(p_restaurant_id), '');
    v_menu_item_id  := nullif(pg_catalog.btrim(p_menu_item_id), '');
    if v_restaurant_id is null then
      raise exception 'FEEDBACK_RESTAURANT_ID_REQUIRED' using errcode = '22023';
    end if;
    if v_menu_item_id is null then
      raise exception 'FEEDBACK_MENU_ITEM_ID_REQUIRED' using errcode = '22023';
    end if;
    if pg_catalog.length(v_restaurant_id) > 500 then
      raise exception 'FEEDBACK_RESTAURANT_ID_TOO_LONG' using errcode = '22023';
    end if;
    if pg_catalog.length(v_menu_item_id) > 500 then
      raise exception 'FEEDBACK_MENU_ITEM_ID_TOO_LONG' using errcode = '22023';
    end if;
    if pg_catalog.left(v_restaurant_id, 4) = 'fav-' then
      raise exception 'FEEDBACK_RESTAURANT_ID_RESERVED_PREFIX' using errcode = '22023';
    end if;
    if pg_catalog.left(v_menu_item_id, 4) = 'fav-' then
      raise exception 'FEEDBACK_MENU_ITEM_ID_RESERVED_PREFIX' using errcode = '22023';
    end if;
    perform 1 from public.restaurants as r where r.id = v_restaurant_id for key share;
    if not found then
      raise exception 'FEEDBACK_RESTAURANT_NOT_FOUND' using errcode = '22023';
    end if;
    perform 1
    from public.menu_items as mi
    where mi.id = v_menu_item_id and mi.restaurant_id = v_restaurant_id
    for key share;
    if not found then
      raise exception 'FEEDBACK_MENU_ITEM_PARENT_MISMATCH' using errcode = '22023';
    end if;
    -- branch_id: verify existence and parent relationship via restaurant_branches catalog.
    if p_branch_id is not null then
      v_branch_id := nullif(pg_catalog.btrim(p_branch_id), '');
      if v_branch_id is not null then
        if pg_catalog.length(v_branch_id) > 500 then
          raise exception 'FEEDBACK_BRANCH_ID_TOO_LONG' using errcode = '22023';
        end if;
        if pg_catalog.left(v_branch_id, 4) = 'fav-' then
          raise exception 'FEEDBACK_BRANCH_ID_RESERVED_PREFIX' using errcode = '22023';
        end if;
        perform 1 from public.restaurant_branches as rb
        where rb.id = v_branch_id and rb.restaurant_id = v_restaurant_id
        for key share;
        if not found then
          raise exception 'FEEDBACK_BRANCH_NOT_FOUND_OR_MISMATCH' using errcode = '22023';
        end if;
      end if;
    end if;
  end if;

  -- Verify owned active session (fail closed: no cross-actor session existence leak).
  select * into v_session
  from   public.recommendation_sessions
  where  id      = p_session_id
    and  user_id = v_user_id;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'session_not_found');
  end if;

  -- No writes to ended sessions.
  if v_session.ended_at is not null then
    return pg_catalog.jsonb_build_object('status', 'invalid_session');
  end if;

  -- Map exactly one action timestamp column; all others remain NULL.
  v_ts := pg_catalog.clock_timestamp();
  case v_action
    when 'shown'     then v_shown_at     := v_ts;
    when 'clicked'   then v_clicked_at   := v_ts;
    when 'accepted'  then v_accepted_at  := v_ts;
    when 'dismissed' then v_dismissed_at := v_ts;
    when 'saved'     then v_saved_at     := v_ts;
    when 'consumed'  then v_consumed_at  := v_ts;
  end case;

  -- Idempotent insert: unique on (user_id, event_idempotency_key).
  insert into public.recommendation_feedback (
    user_id, recommendation_session_id,
    recommendation_id, restaurant_id, branch_id, menu_item_id,
    action,
    shown_at, clicked_at, accepted_at, dismissed_at, saved_at, consumed_at,
    source_surface, event_idempotency_key, schema_version
  ) values (
    v_user_id, p_session_id,
    v_recommendation_id, v_restaurant_id, v_branch_id, v_menu_item_id,
    v_action,
    v_shown_at, v_clicked_at, v_accepted_at, v_dismissed_at, v_saved_at, v_consumed_at,
    v_session.source_surface, v_event_key, 'consumer-recommendation-feedback-v1'
  )
  on conflict (user_id, event_idempotency_key) do nothing
  returning id into v_new_id;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    return pg_catalog.jsonb_build_object(
      'status',      'recorded',
      'feedback_id', v_new_id
    );
  end if;

  -- Conflict: idempotency key already used. Read existing row to classify.
  select * into v_existing
  from   public.recommendation_feedback
  where  user_id               = v_user_id
    and  event_idempotency_key = v_event_key;

  -- Immutable payload comparison: session, action, target identity (including branch_id), derived source_surface.
  -- branch_id is included because it is a persisted immutable event field, even though it is not catalog identity.
  -- Null-safe equality (IS NOT DISTINCT FROM) handles absent optional fields correctly.
  if v_existing.recommendation_session_id = p_session_id
     and v_existing.action = v_action
     and v_existing.recommendation_id   is not distinct from v_recommendation_id
     and v_existing.restaurant_id       is not distinct from v_restaurant_id
     and v_existing.branch_id           is not distinct from v_branch_id
     and v_existing.menu_item_id        is not distinct from v_menu_item_id
     and v_existing.source_surface      = v_session.source_surface
  then
    return pg_catalog.jsonb_build_object('status', 'already_recorded');
  end if;

  return pg_catalog.jsonb_build_object('status', 'idempotency_conflict');
end;
$$;

comment on function public.record_authenticated_recommendation_feedback_event(uuid, text, text, text, text, text, text, text)
  is 'Appends an idempotent recommendation feedback event to an owned active session; source_surface is derived from the session; branch_id is catalog-validated against restaurant_branches.';

-- Revoke all, then grant execute only to authenticated.
revoke all on function public.create_authenticated_recommendation_session(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.end_authenticated_recommendation_session(uuid)
  from public, anon, authenticated;
revoke all on function public.record_authenticated_recommendation_feedback_event(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.create_authenticated_recommendation_session(uuid, text, text)
  to authenticated;
grant execute on function public.end_authenticated_recommendation_session(uuid)
  to authenticated;
grant execute on function public.record_authenticated_recommendation_feedback_event(uuid, text, text, text, text, text, text, text)
  to authenticated;

commit;
