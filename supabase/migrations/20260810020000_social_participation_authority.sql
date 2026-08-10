-- Social Runtime SR-1B-C local-only migration.
--
-- Creates the canonical Social DISCOVERABILITY / PARTICIPATION authority and nothing else.
--
-- THE ONE QUESTION THIS AUTHORITY ANSWERS. "Has this user explicitly opted into Social candidate
-- discovery, and are they currently active or paused?" It does not answer whether the account is
-- usable, whether anyone has blocked anyone, or whether a pair may be compared. Those are separate
-- authorities and SR-1B-D will combine all three.
--
-- EXPLICIT OPT-IN, BY ABSENCE. There is no default row and no backfill. ABSENT is the canonical
-- "not participating / not discoverable" state, so every existing account remains out of Social
-- until it explicitly joins. Participation is never derived from consumer_profiles.visibility, from
-- willing_to_chat, from verification status, from Premium state, or from any prior mock state —
-- those are different concepts with different vocabularies and must not be conflated with this one.
--
-- STATE REPRESENTATION FOLLOWS REPOSITORY CONVENTION. Enum TYPES in this database exist only in the
-- original 20260712130100 schema migration; every state column introduced by a later migration —
-- restaurant status, membership login_status/role_key/status, meal_corrections.verification_status —
-- is `text NOT NULL CHECK (... IN (...))`. This migration follows that established pattern rather
-- than adding the first post-baseline enum type.
--
-- ONLY TWO STATES. opted_in and paused. Deliberately absent: suspended, banned, disabled, hidden and
-- deleted. Account suspension and deletion are consumer_profiles authority and will be a separate
-- conjunct in SR-1B-D; moderation suspension is not a canonical authority anywhere yet. Duplicating
-- account state here would create two sources of truth for the same fact.
--
-- PRIVACY BOUNDARY. A user may read its own row and nothing else. There is deliberately no policy,
-- view, function or parameter through which one user can discover another user's participation
-- state — not "opted in", not "paused", not "opted out", not "never joined". SR-1B-D will build the
-- dedicated server authority that evaluates a candidate's participation internally; the owner-facing
-- policy here does NOT and must not enable that.
--
-- Development-safe and additive: one new table, one policy, four zero-argument functions. No
-- existing table, policy, grant, view or function is altered or dropped. No backfill. No seed, no
-- fixture, no Auth user, no service-role behaviour and no credential.

begin;

create table public.social_participation (
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,
  opted_in_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_participation_pkey primary key (user_id),
  constraint social_participation_state_valid check (state in ('opted_in', 'paused'))
);

comment on table public.social_participation is
  'Canonical Social participation authority. One row per user; ABSENCE means the user has not opted into Social and is not discoverable. Current state only, never a history log.';
comment on column public.social_participation.state is
  'opted_in = participating and eligible for later authorization; paused = still a participant but temporarily excluded from discovery. No account-status or moderation value belongs here.';
comment on column public.social_participation.opted_in_at is
  'Start of the CURRENT participation lifecycle. Set once when the row is created and never moved by pause or resume; opting out deletes the row, so a later opt-in begins a new lifecycle with a new value.';
comment on column public.social_participation.updated_at is
  'Last state mutation. Carries no recency or ranking meaning.';

-- No secondary index is declared, and that is a deliberate decision rather than an omission. The
-- only access path is by owner, and user_id is both the primary key and the sole foreign key column,
-- so the ON DELETE CASCADE from auth.users is already index-served. This differs from SR-1B-B's
-- social_blocks, where the referencing column blocked_user_id was NOT covered by the composite key
-- and therefore required an explicit reverse index.

alter table public.social_participation enable row level security;

-- The ONLY direct read authority: the caller's own row. There is deliberately no policy that could
-- match another user's row, so a cross-user probe is filtered to zero rows rather than merely hidden.
create policy social_participation_owner_read on public.social_participation
  for select
  using (auth.uid() = user_id);

-- Privileges and policies are evaluated together: a policy is unreachable without the privilege, and
-- a privilege is unbounded without the policy. Writes stay closed at the privilege layer so that no
-- policy mistake can open a direct client write path, and so lifecycle timestamps cannot be authored
-- by a client at all.
revoke all on table public.social_participation from public;
revoke all on table public.social_participation from anon;
revoke all on table public.social_participation from authenticated;
grant select on table public.social_participation to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Lifecycle authority.
--
-- All four functions take ZERO arguments. The subject is auth.uid() and there is no parameter of any
-- kind through which a caller could name another user, choose a state string, or supply a timestamp.
-- That makes actor spoofing and timestamp forgery structurally impossible rather than merely
-- validated against, and it means no function here can answer "is user X opted in?" for any X.
-- ---------------------------------------------------------------------------------------------

create or replace function public.opt_in_authenticated_social_participation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_state text;
  v_opted_in_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  select sp.state, sp.opted_in_at
  into v_state, v_opted_in_at
  from public.social_participation as sp
  where sp.user_id = v_user_id;

  -- Idempotent: an existing participant keeps its original lifecycle start, whether it is currently
  -- opted_in or paused. Opting in does not resume a paused participant — resume is its own action.
  if v_state is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_participating',
      'state', v_state,
      'opted_in_at', v_opted_in_at
    );
  end if;

  insert into public.social_participation (user_id, state, opted_in_at, updated_at)
  values (v_user_id, 'opted_in', pg_catalog.now(), pg_catalog.now())
  on conflict on constraint social_participation_pkey do nothing
  returning state, opted_in_at into v_state, v_opted_in_at;

  if v_state is null then
    select sp.state, sp.opted_in_at
    into v_state, v_opted_in_at
    from public.social_participation as sp
    where sp.user_id = v_user_id;
    if v_state is null then
      raise exception 'SOCIAL_PARTICIPATION_WRITE_CONFLICT' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_participating',
      'state', v_state,
      'opted_in_at', v_opted_in_at
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'opted_in',
    'state', v_state,
    'opted_in_at', v_opted_in_at
  );
end;
$$;

create or replace function public.pause_authenticated_social_participation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_state text;
  v_opted_in_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  select sp.state, sp.opted_in_at
  into v_state, v_opted_in_at
  from public.social_participation as sp
  where sp.user_id = v_user_id;

  if v_state is null then
    raise exception 'SOCIAL_PARTICIPATION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_state = 'paused' then
    return pg_catalog.jsonb_build_object(
      'status', 'already_paused', 'state', v_state, 'opted_in_at', v_opted_in_at
    );
  end if;

  -- opted_in_at is deliberately untouched: pausing suspends discovery, it does not end or restart
  -- the participation lifecycle.
  update public.social_participation
  set state = 'paused', updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning state, opted_in_at into v_state, v_opted_in_at;

  return pg_catalog.jsonb_build_object(
    'status', 'paused', 'state', v_state, 'opted_in_at', v_opted_in_at
  );
end;
$$;

create or replace function public.resume_authenticated_social_participation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_state text;
  v_opted_in_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  select sp.state, sp.opted_in_at
  into v_state, v_opted_in_at
  from public.social_participation as sp
  where sp.user_id = v_user_id;

  if v_state is null then
    raise exception 'SOCIAL_PARTICIPATION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_state = 'opted_in' then
    return pg_catalog.jsonb_build_object(
      'status', 'already_opted_in', 'state', v_state, 'opted_in_at', v_opted_in_at
    );
  end if;

  -- opted_in_at is deliberately untouched: resuming continues the same lifecycle.
  update public.social_participation
  set state = 'opted_in', updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning state, opted_in_at into v_state, v_opted_in_at;

  return pg_catalog.jsonb_build_object(
    'status', 'resumed', 'state', v_state, 'opted_in_at', v_opted_in_at
  );
end;
$$;

create or replace function public.opt_out_authenticated_social_participation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  -- Hard delete back to canonical ABSENT. No tombstone, no deactivated flag, nothing that could be
  -- mistaken for a still-discoverable row, and nothing to go stale.
  delete from public.social_participation
  where user_id = v_user_id;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return pg_catalog.jsonb_build_object('status', 'already_absent');
  end if;
  return pg_catalog.jsonb_build_object('status', 'opted_out');
end;
$$;

comment on function public.opt_in_authenticated_social_participation()
  is 'Opts the authenticated caller into Social discovery. Subject derives only from auth.uid(); idempotent and never moves an existing opted_in_at.';
comment on function public.pause_authenticated_social_participation()
  is 'Pauses the authenticated caller''s Social discoverability while keeping participation. Does not move opted_in_at.';
comment on function public.resume_authenticated_social_participation()
  is 'Resumes the authenticated caller''s paused Social participation. Does not move opted_in_at.';
comment on function public.opt_out_authenticated_social_participation()
  is 'Opts the authenticated caller out of Social by hard-deleting the row, returning to canonical absence. Idempotent.';

revoke all on function public.opt_in_authenticated_social_participation() from public;
revoke all on function public.opt_in_authenticated_social_participation() from anon;
revoke all on function public.opt_in_authenticated_social_participation() from authenticated;
revoke all on function public.pause_authenticated_social_participation() from public;
revoke all on function public.pause_authenticated_social_participation() from anon;
revoke all on function public.pause_authenticated_social_participation() from authenticated;
revoke all on function public.resume_authenticated_social_participation() from public;
revoke all on function public.resume_authenticated_social_participation() from anon;
revoke all on function public.resume_authenticated_social_participation() from authenticated;
revoke all on function public.opt_out_authenticated_social_participation() from public;
revoke all on function public.opt_out_authenticated_social_participation() from anon;
revoke all on function public.opt_out_authenticated_social_participation() from authenticated;

grant execute on function public.opt_in_authenticated_social_participation() to authenticated;
grant execute on function public.pause_authenticated_social_participation() to authenticated;
grant execute on function public.resume_authenticated_social_participation() to authenticated;
grant execute on function public.opt_out_authenticated_social_participation() to authenticated;

commit;
