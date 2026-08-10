-- Social Runtime SR-1B-B local-only migration.
--
-- Creates the canonical DIRECTIONAL Social block authority and nothing else.
--
-- SCOPE. This migration establishes only "who blocked whom" as current state, plus the owner-facing
-- read boundary and the two narrow write RPCs. It deliberately does NOT create Candidate
-- Authorization, discoverability, social participation, account-status predicates, candidate pools,
-- pair-read functions, invitation/match/chat state, or any Social projection. Those are later SR-1B
-- phases and must not be anticipated here.
--
-- DIRECTIONAL STORAGE, SYMMETRIC EVALUATION. The table records one row per ordered pair. A future
-- pair predicate (SR-1B-D) will deny evaluation when EITHER direction exists, but that predicate is
-- not implemented here. Directional storage is deliberate: symmetric storage would erase which side
-- blocked, and only the blocker may unblock.
--
-- CURRENT AUTHORITY, NOT AN AUDIT LOG. Block inserts a row; unblock DELETES it. Absence means "not
-- currently blocked in that direction". There is deliberately no soft delete, no status enum, no
-- unblock timestamp, no reason text, no moderation metadata and no history row. If moderation
-- history is ever required it must be a separate authority with its own retention and access rules.
--
-- PRIVACY BOUNDARY. The only direct read a client may ever perform is its OWN OUTBOUND list. There
-- is no policy, view, function, count or error path here through which an actor can learn that
-- someone has blocked THEM. Reverse-block existence is server-sensitive state that this phase
-- deliberately leaves unreadable by anyone.
--
-- Development-safe and additive: one new table, one index, one policy, two functions. No existing
-- consumer table, policy, grant, view or function is altered or dropped. No backfill. No seed, no
-- fixture, no Auth user, no service-role behaviour and no credential.

begin;

create table public.social_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint social_blocks_pkey primary key (blocker_user_id, blocked_user_id),
  constraint social_blocks_no_self_block check (blocker_user_id <> blocked_user_id)
);

comment on table public.social_blocks is
  'Canonical directional Social block authority. One row per ordered (blocker, blocked) pair; absence means not currently blocked in that direction. Current state only, never an audit log.';
comment on column public.social_blocks.blocker_user_id is
  'The user who created the block. Derived only from auth.uid() by the write RPCs; never client-supplied.';
comment on column public.social_blocks.blocked_user_id is
  'The user who was blocked. Never learns that this row exists.';

-- Reverse index. Justified by a referential action that exists TODAY, not by a speculative future
-- query: PostgreSQL does not automatically index the referencing side of a foreign key, and
-- ON DELETE CASCADE from auth.users must locate every referencing row. blocker_user_id is already
-- covered as the primary key's leading column, so its cascade is indexed; blocked_user_id has no
-- such coverage and would force a sequential scan of this table on every user deletion.
--
-- The same index additionally serves the inbound direction that SR-1B-D's Candidate Pool Authority
-- will need ("which users have blocked this actor" — a predicate with no leading blocker column,
-- which the primary key cannot serve). Declaring both columns rather than blocked_user_id alone
-- lets that future lookup be satisfied by an index-only scan at no extra maintenance class.
--
-- Note for the record: the SR-1B-D single-pair predicate does NOT require this index. Both
-- directions of a pair check bind blocker_user_id to a constant and are already served by the
-- primary key.
create index social_blocks_blocked_user_id_blocker_user_id_idx
  on public.social_blocks (blocked_user_id, blocker_user_id);

alter table public.social_blocks enable row level security;

-- The ONLY direct read authority. Outbound rows of the calling actor, and nothing else.
--
-- Deliberately absent: any policy matching blocked_user_id. An actor selecting
-- "where blocked_user_id = me" is filtered to zero rows by this policy, so inbound blocks are not
-- merely hidden from a UI, they are unreachable through the table.
create policy social_blocks_blocker_read on public.social_blocks
  for select
  using (auth.uid() = blocker_user_id);

-- Table privileges and policies are evaluated together: a policy is unreachable without the
-- privilege, and a privilege is unbounded without the policy. Writes stay closed at the privilege
-- layer so that no policy mistake can ever open a direct client write path.
revoke all on table public.social_blocks from public;
revoke all on table public.social_blocks from anon;
revoke all on table public.social_blocks from authenticated;
grant select on table public.social_blocks to authenticated;

-- Blocks the given user on behalf of the authenticated caller.
--
-- The blocker is auth.uid() and is never a parameter, so a caller cannot create a block attributed
-- to anyone else. Idempotent: blocking an already-blocked user reports already_blocked and leaves
-- the original created_at intact rather than refreshing it.
--
-- The response describes ONLY the caller's own outbound row. It never reveals whether the target
-- has blocked the caller, and its shape is identical whether or not a reverse block exists.
create or replace function public.create_authenticated_social_block(
  p_blocked_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_blocker_user_id uuid := auth.uid();
  v_blocked_user_id uuid := p_blocked_user_id;
  v_created_at timestamptz;
begin
  if v_blocker_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_blocked_user_id is null then
    raise exception 'SOCIAL_BLOCK_TARGET_REQUIRED' using errcode = '22023';
  end if;
  -- Self-block fails closed here for a clean domain error; the database CHECK constraint remains
  -- the actual authority and rejects it even if this branch were ever removed.
  if v_blocked_user_id = v_blocker_user_id then
    raise exception 'SOCIAL_BLOCK_SELF_FORBIDDEN' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_blocker_user_id::pg_catalog.text || ':social_block:' || v_blocked_user_id::pg_catalog.text,
      0
    )
  );

  select sb.created_at
  into v_created_at
  from public.social_blocks as sb
  where sb.blocker_user_id = v_blocker_user_id
    and sb.blocked_user_id = v_blocked_user_id;

  if v_created_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_blocked',
      'blocked_user_id', v_blocked_user_id,
      'created_at', v_created_at
    );
  end if;

  begin
    insert into public.social_blocks (blocker_user_id, blocked_user_id)
    values (v_blocker_user_id, v_blocked_user_id)
    on conflict on constraint social_blocks_pkey do nothing
    returning created_at into v_created_at;
  exception
    -- A target that is not a real account is reported with the same generic invalid-target error as
    -- any other unusable target, so the failure mode does not become a richer oracle than the
    -- foreign key itself already implies.
    when foreign_key_violation then
      raise exception 'SOCIAL_BLOCK_TARGET_INVALID' using errcode = '22023';
  end;

  if v_created_at is null then
    select sb.created_at
    into v_created_at
    from public.social_blocks as sb
    where sb.blocker_user_id = v_blocker_user_id
      and sb.blocked_user_id = v_blocked_user_id;
    if v_created_at is null then
      raise exception 'SOCIAL_BLOCK_WRITE_CONFLICT' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_blocked',
      'blocked_user_id', v_blocked_user_id,
      'created_at', v_created_at
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'blocked',
    'blocked_user_id', v_blocked_user_id,
    'created_at', v_created_at
  );
end;
$$;

-- Removes the authenticated caller's own outbound block. Hard delete: absence is the canonical
-- "not blocked" state, so there is no tombstone to go stale.
--
-- The delete is scoped by blocker_user_id = auth.uid(), so a caller can only ever remove its own
-- directional record. Unblocking cannot touch, and cannot detect, a reverse block.
--
-- Idempotent no-op when no such row exists. Note this path performs no foreign key check at all, so
-- unlike the block path it reveals nothing whatsoever about whether the target identity is real.
create or replace function public.remove_authenticated_social_block(
  p_blocked_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_blocker_user_id uuid := auth.uid();
  v_blocked_user_id uuid := p_blocked_user_id;
  v_row_count integer := 0;
begin
  if v_blocker_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_blocked_user_id is null then
    raise exception 'SOCIAL_BLOCK_TARGET_REQUIRED' using errcode = '22023';
  end if;
  if v_blocked_user_id = v_blocker_user_id then
    raise exception 'SOCIAL_BLOCK_SELF_FORBIDDEN' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_blocker_user_id::pg_catalog.text || ':social_block:' || v_blocked_user_id::pg_catalog.text,
      0
    )
  );

  delete from public.social_blocks
  where blocker_user_id = v_blocker_user_id
    and blocked_user_id = v_blocked_user_id;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return pg_catalog.jsonb_build_object(
      'status', 'already_absent',
      'blocked_user_id', v_blocked_user_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'unblocked',
    'blocked_user_id', v_blocked_user_id
  );
end;
$$;

comment on function public.create_authenticated_social_block(uuid)
  is 'Creates the authenticated caller''s directional Social block; blocker derives only from auth.uid(). Idempotent, and never discloses reverse-block state.';
comment on function public.remove_authenticated_social_block(uuid)
  is 'Removes the authenticated caller''s own directional Social block; hard delete, idempotent, and scoped so it can never affect the reverse direction.';

revoke all on function public.create_authenticated_social_block(uuid) from public;
revoke all on function public.create_authenticated_social_block(uuid) from anon;
revoke all on function public.create_authenticated_social_block(uuid) from authenticated;
revoke all on function public.remove_authenticated_social_block(uuid) from public;
revoke all on function public.remove_authenticated_social_block(uuid) from anon;
revoke all on function public.remove_authenticated_social_block(uuid) from authenticated;

grant execute on function public.create_authenticated_social_block(uuid) to authenticated;
grant execute on function public.remove_authenticated_social_block(uuid) to authenticated;

commit;
