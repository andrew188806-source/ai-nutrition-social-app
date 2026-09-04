-- RA-2A-P1-R1: the governed Restaurant Owner sold-out preview.
--
-- WHY THIS EXISTS. RA-2A-P1's mutation requires an `expectedVersion`, and the existing governed read
-- source `public.restaurant_internal_branch_menu_items_v1(text)` projects `sold_out` but not
-- `sold_out_version`. An application therefore had no authorized way to learn the concurrency token
-- it must supply. The alternatives were all worse: a direct table read, a service-role read, a
-- guessed version, or calling the mutation itself — which is state-changing authority, not a preview.
-- This adds exactly one bounded read and nothing else.
--
-- WHAT IT IS NOT. No new role, schema, table or policy. No new grant on any business table. No write
-- of any kind: the function is STABLE, so PostgreSQL itself refuses an UPDATE, INSERT or audit write
-- inside it — the read-only guarantee is enforced by the language, not by review. RA-2A-P1's
-- permission, version semantics, trigger, sealed writer, row level security, mutation RPC, audit
-- relation and control-plane creator row are all untouched.
--
-- WHY NO NEW PRIVILEGE WAS NEEDED. The sealed writer already holds column SELECT on exactly the
-- columns this projects, column SELECT on the authority chain, and the
-- `branch_menu_items_owner_sold_out_select` policy that narrows the table to rows the verified
-- caller owns. Reusing that read authority is strictly smaller than granting a new one.

begin;

-- PostgreSQL 17 gives the creating role administration authority over a role but no SET or INHERIT
-- path by default. This membership adds SET only for the ownership transfer below and is revoked at
-- the end of this migration. The platform's own creator row is left exactly as RA-1C-R1 adjudicated
-- it: member postgres, grantor supabase_admin, inherit false, set false.
grant restaurant_owner_branch_menu_item_write_authority to postgres
  with admin false, inherit false, set true;

-- PostgreSQL requires a prospective function owner to hold CREATE on the schema. The privilege
-- exists only while ownership is assigned and is revoked at the end of this migration.
grant create on schema public to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- The single client-callable preview.
--
-- The three parameters are SELECTORS, never authority. A caller naming another restaurant's id
-- learns nothing: row level security has already narrowed the table to rows the verified caller
-- owns, so the selector can only ever narrow that set further. A row under another restaurant and a
-- row that does not exist are the same query result, and both return `target_not_found`.
--
-- Bounded result vocabulary, and no raw PostgreSQL condition ever reaches a caller:
--   unauthenticated   no verified request subject
--   permission_denied verified, but not an active owner holding this exact permission anywhere
--   target_not_found  authorised, but no such row inside the caller's authorised scope
--   invalid_request   a malformed typed request that never reaches target resolution
--
-- The version crosses the boundary as a decimal string: bigint exceeds the range JSON consumers
-- represent exactly, and a silently rounded concurrency token is worse than no token at all.
-- ---------------------------------------------------------------------------------------------
create function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(
  p_restaurant_id text,
  p_branch_id text,
  p_branch_menu_item_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_actor uuid;
  v_target record;
begin
  begin
    v_actor := (
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
        (
          nullif(pg_catalog.current_setting('request.jwt.claims', true), '')
            ::pg_catalog.jsonb ->> 'sub'
        )
      )
    )::pg_catalog.uuid;
  exception
    when invalid_text_representation then v_actor := null;
    when others then v_actor := null;
  end;

  if v_actor is null then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unauthenticated');
  end if;

  if p_restaurant_id is null or pg_catalog.length(p_restaurant_id) = 0
    or p_branch_id is null or pg_catalog.length(p_branch_id) = 0
    or p_branch_menu_item_id is null or pg_catalog.length(p_branch_menu_item_id) = 0
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  -- Authorised scope first: being an active owner holding this exact permission somewhere is what
  -- separates "you may not do this at all" from "that row is not yours". Identical to the mutation.
  if not exists (
    select 1
    from public.restaurant_users as caller
    join public.restaurant_memberships as membership
      on membership.restaurant_user_id = caller.id
    join public.restaurant_roles as role
      on role.id = membership.role_id
    join public.role_permissions as permission
      on permission.role_id = role.id
    where caller.auth_user_id = v_actor
      and caller.login_status = 'enabled'
      and membership.status = 'active'
      and role.status = 'active'
      and role.role_key = 'owner'
      and permission.permission_key = 'branch_menu_item.sold_out.write'
      and permission.permission_scope = 'restaurant'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'permission_denied');
  end if;

  -- The tenant predicate is JOINED here, not delegated to row level security.
  --
  -- That is deliberate and load-bearing. `public.branch_menu_items` already carries a PERMISSIVE
  -- policy granted to PUBLIC (`branch_items_public_read_dev`), and PostgreSQL OR's permissive
  -- policies together — so on the READ path this round's owner-scoped policy cannot narrow anything:
  -- any row the public policy admits is visible to every role, including this function's owner.
  -- RA-2A-P1's mutation is unaffected because a locking read is additionally gated by the UPDATE
  -- policy, and no permissive PUBLIC policy exists for UPDATE. A preview has no such second gate,
  -- so it must prove the tenant itself.
  --
  -- Joining the caller's own membership chain also keeps the privacy contract exact: a row under
  -- another restaurant produces no join row, which is the same result as a row that does not exist.
  --
  -- No FOR UPDATE: this is a preview, and a read must not take a row lock.
  select item.id, item.branch_id, item.menu_item_id, item.sold_out, item.sold_out_version
  into v_target
  from public.branch_menu_items as item
  join public.restaurant_memberships as membership
    on membership.restaurant_id = item.restaurant_id
   and membership.status = 'active'
  join public.restaurant_users as caller
    on caller.id = membership.restaurant_user_id
   and caller.auth_user_id = v_actor
   and caller.login_status = 'enabled'
  join public.restaurant_roles as role
    on role.id = membership.role_id
   and role.status = 'active'
   and role.role_key = 'owner'
  join public.role_permissions as permission
    on permission.role_id = role.id
   and permission.permission_key = 'branch_menu_item.sold_out.write'
   and permission.permission_scope = 'restaurant'
  where item.id = p_branch_menu_item_id
    and item.restaurant_id = p_restaurant_id
    and item.branch_id = p_branch_id;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'target_not_found');
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'state', 'ready',
    'branchMenuItemId', v_target.id,
    'branchId', v_target.branch_id,
    'menuItemId', v_target.menu_item_id,
    'soldOut', v_target.sold_out,
    'soldOutVersion', v_target.sold_out_version::text
  );
end;
$$;

comment on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text) is
  'RA-2A-P1-R1. Returns the current sold-out state and concurrency token of one branch-menu offering to an active Restaurant Owner holding branch_menu_item.sold_out.write. Read-only and STABLE. Takes no actor argument: the actor can only be the verified request subject.';

-- ---------------------------------------------------------------------------------------------
-- Function privileges, settled BEFORE ownership moves.
--
-- The ordering is load-bearing. Once ownership has moved to a sealed role this migration cannot SET
-- ROLE to, a REVOKE by the previous owner silently changes nothing and leaves the PUBLIC EXECUTE
-- default in place. ALTER FUNCTION ... OWNER TO rewrites the grantor of each surviving ACL entry
-- rather than resetting the ACL, so the privileges set here survive the transfer intact.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)
  to authenticated;

alter function public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text, text, text)
  owner to restaurant_owner_branch_menu_item_write_authority;

-- ---------------------------------------------------------------------------------------------
-- Release every transient privilege this migration took.
-- ---------------------------------------------------------------------------------------------
revoke create on schema public from restaurant_owner_branch_menu_item_write_authority;
revoke restaurant_owner_branch_menu_item_write_authority from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------
-- Fail closed on anything this migration did not positively achieve. Every assertion reads
-- pg_catalog only: the Restaurant authority tables run under FORCE row level security with
-- subject-scoped policies, so a migration principal counts zero rows in them for reasons that have
-- nothing to do with whether this round succeeded.
-- ---------------------------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_owner text;
  v_volatile text;
  v_config text;
begin
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as space on space.oid = routine.pronamespace
  where space.nspname = 'public'
    and routine.proname = 'restaurant_owner_preview_branch_menu_item_sold_out_v1';
  if v_count <> 1 then
    raise exception 'RA-2A-P1-R1: expected exactly one preview function, found %', v_count;
  end if;

  select pg_catalog.pg_get_userbyid(routine.proowner), routine.provolatile::text,
         pg_catalog.array_to_string(routine.proconfig, ',')
    into v_owner, v_volatile, v_config
  from pg_catalog.pg_proc as routine
  join pg_catalog.pg_namespace as space on space.oid = routine.pronamespace
  where space.nspname = 'public'
    and routine.proname = 'restaurant_owner_preview_branch_menu_item_sold_out_v1';
  if v_owner <> 'restaurant_owner_branch_menu_item_write_authority' then
    raise exception 'RA-2A-P1-R1: the preview is owned by % rather than the sealed writer', v_owner;
  end if;
  if v_volatile <> 's' then
    raise exception 'RA-2A-P1-R1: the preview is not STABLE, so it is not provably read-only';
  end if;
  -- POSITION(x IN y) is SQL syntax rather than a schema-qualifiable function, so it cannot be
  -- written schema-qualified under the empty search_path this block runs beneath. strpos is a
  -- genuine function and therefore stays qualified — the same distinction RA-1A documents for
  -- least, greatest and coalesce.
  if v_config is null or pg_catalog.strpos(v_config, 'search_path=') = 0
    or pg_catalog.strpos(v_config, 'row_security=on') = 0 then
    raise exception 'RA-2A-P1-R1: the preview does not pin search_path and row_security';
  end if;

  if not pg_catalog.has_function_privilege('authenticated',
    'public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)', 'EXECUTE') then
    raise exception 'RA-2A-P1-R1: authenticated cannot execute the preview';
  end if;
  if pg_catalog.has_function_privilege('anon',
       'public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)', 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role',
       'public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticator',
       'public.restaurant_owner_preview_branch_menu_item_sold_out_v1(text,text,text)', 'EXECUTE') then
    raise exception 'RA-2A-P1-R1: a runtime role other than authenticated may execute the preview';
  end if;

  -- This round creates no role and grants no client role anything.
  select pg_catalog.count(*) into v_count
  from pg_catalog.pg_auth_members as member
  join pg_catalog.pg_roles as sealed on sealed.oid = member.roleid
  join pg_catalog.pg_roles as grantee on grantee.oid = member.member
  where sealed.rolname = 'restaurant_owner_branch_menu_item_write_authority'
    and grantee.rolname in ('anon', 'authenticated', 'authenticator', 'service_role');
  if v_count <> 0 then
    raise exception 'RA-2A-P1-R1: a client role holds membership of the sealed writer';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.branch_menu_items', 'UPDATE') then
    raise exception 'RA-2A-P1-R1: a client role gained direct table access to branch_menu_items';
  end if;
end
$$;

commit;
