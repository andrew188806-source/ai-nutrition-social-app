-- RA-3-IA-P3-P6-P1C: sealed Bundle materialization, source revocation, audit, and receipts.
--
-- The two private SECURITY DEFINER functions are the canonical provisioning boundary. Direct
-- access through staff_authority_write_authority remains internal implementation authority.
-- No client role receives table privileges or function EXECUTE, and no runtime resolver exists.

begin;

create table admin_internal.staff_authority_audit_log (
  event_id uuid not null default pg_catalog.gen_random_uuid(),
  request_id uuid not null,
  event_type text not null,
  actor_kind text not null,
  actor_database_identity text not null,
  actor_staff_account_id uuid,
  subject_staff_account_id uuid not null,
  bundle_key text,
  bundle_revision integer,
  bundle_assignment_id uuid,
  permission_key text,
  entitlement_id uuid,
  effective_from timestamptz,
  effective_until timestamptz,
  reason text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_authority_audit_log_pkey primary key (event_id),
  constraint staff_authority_audit_log_event_type_check check (event_type in (
    'bundle_assignment_materialized', 'bundle_entitlement_materialized',
    'bundle_assignment_revoked', 'bundle_entitlement_revoked'
  )),
  constraint staff_authority_audit_log_actor_kind_check
    check (actor_kind in ('operator', 'staff', 'system')),
  constraint staff_authority_audit_log_actor_database_identity_check
    check (pg_catalog.length(actor_database_identity) between 1 and 63),
  constraint staff_authority_audit_log_actor_staff_fkey
    foreign key (actor_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_authority_audit_log_subject_staff_fkey
    foreign key (subject_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_authority_audit_log_bundle_revision_fkey
    foreign key (bundle_key, bundle_revision)
    references admin_internal.staff_bundle_templates (bundle_key, revision)
    on update restrict on delete restrict,
  constraint staff_authority_audit_log_assignment_fkey
    foreign key (bundle_assignment_id)
    references admin_internal.staff_bundle_assignments (assignment_id)
    on update restrict on delete restrict,
  constraint staff_authority_audit_log_permission_fkey
    foreign key (permission_key)
    references admin_internal.staff_permission_catalog (permission_key)
    on update restrict on delete restrict,
  constraint staff_authority_audit_log_entitlement_fkey
    foreign key (entitlement_id)
    references admin_internal.staff_permission_entitlements (entitlement_id)
    on update restrict on delete restrict,
  constraint staff_authority_audit_log_reason_check
    check (pg_catalog.length(reason) between 1 and 1000 and reason = pg_catalog.btrim(reason)),
  constraint staff_authority_audit_log_window_check
    check (effective_until is null or effective_from is null or effective_until > effective_from),
  constraint staff_authority_audit_log_bundle_event_shape_check check (
    bundle_key is not null and bundle_revision is not null and bundle_assignment_id is not null
    and effective_from is not null
  ),
  constraint staff_authority_audit_log_entitlement_event_shape_check check (
    (event_type in ('bundle_assignment_materialized', 'bundle_assignment_revoked')
      and permission_key is null and entitlement_id is null)
    or
    (event_type in ('bundle_entitlement_materialized', 'bundle_entitlement_revoked')
      and permission_key is not null and entitlement_id is not null)
  )
);

create unique index staff_authority_audit_log_request_event_source_key
  on admin_internal.staff_authority_audit_log
  (request_id, event_type, bundle_assignment_id, coalesce(permission_key, ''));
create index staff_authority_audit_log_subject_occurred_idx
  on admin_internal.staff_authority_audit_log
  (subject_staff_account_id, occurred_at desc, event_id desc);

comment on table admin_internal.staff_authority_audit_log is
  'Append-only staff authority evidence. P1C emits one assignment event and one event per affected entitlement; no client role or context reader has access.';

create table admin_internal.staff_authority_operation_receipts (
  request_id uuid not null,
  operation_kind text not null,
  request_payload jsonb not null,
  result_assignment_id uuid not null,
  result_entitlement_count integer not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint staff_authority_operation_receipts_pkey primary key (request_id),
  constraint staff_authority_operation_receipts_operation_kind_check
    check (operation_kind in ('materialize_bundle_assignment', 'revoke_bundle_assignment')),
  constraint staff_authority_operation_receipts_payload_check
    check (pg_catalog.jsonb_typeof(request_payload) = 'object'),
  constraint staff_authority_operation_receipts_assignment_fkey
    foreign key (result_assignment_id)
    references admin_internal.staff_bundle_assignments (assignment_id)
    on update restrict on delete restrict,
  constraint staff_authority_operation_receipts_entitlement_count_check
    check (result_entitlement_count >= 0)
);

create index staff_authority_operation_receipts_created_idx
  on admin_internal.staff_authority_operation_receipts (created_at desc, request_id);

comment on table admin_internal.staff_authority_operation_receipts is
  'Immutable request-id receipts. Canonical JSONB payload equality distinguishes exact replay from request_conflict without an extension dependency.';

alter table admin_internal.staff_authority_audit_log enable row level security;
alter table admin_internal.staff_authority_audit_log force row level security;
alter table admin_internal.staff_authority_operation_receipts enable row level security;
alter table admin_internal.staff_authority_operation_receipts force row level security;

create policy staff_authority_audit_log_writer_insert
  on admin_internal.staff_authority_audit_log for insert
  to staff_authority_write_authority with check (true);
create policy staff_authority_operation_receipts_writer_select
  on admin_internal.staff_authority_operation_receipts for select
  to staff_authority_write_authority using (true);
create policy staff_authority_operation_receipts_writer_insert
  on admin_internal.staff_authority_operation_receipts for insert
  to staff_authority_write_authority with check (true);

revoke all on table admin_internal.staff_authority_audit_log
  from public, anon, authenticated, authenticator, service_role;
revoke all on table admin_internal.staff_authority_operation_receipts
  from public, anon, authenticated, authenticator, service_role;

grant insert on table admin_internal.staff_authority_audit_log
  to staff_authority_write_authority;
grant select, insert on table admin_internal.staff_authority_operation_receipts
  to staff_authority_write_authority;

create function admin_internal.materialize_staff_bundle_assignment_v1(
  p_request_id uuid,
  p_staff_account_id uuid,
  p_bundle_key text,
  p_bundle_revision integer,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_request_payload jsonb;
  v_prior admin_internal.staff_authority_operation_receipts%rowtype;
  v_staff_status text;
  v_staff_effective_from timestamptz;
  v_staff_effective_until timestamptz;
  v_bundle_status text;
  v_assignment_id uuid;
  v_entitlement_count integer := 0;
  v_now timestamptz;
begin
  if p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or p_staff_account_id is null
    or p_bundle_key is null
    or pg_catalog.length(p_bundle_key) not between 3 and 80
    or p_bundle_key !~ '^[a-z][a-z0-9_]{2,79}$'
    or pg_catalog.strpos(p_bundle_key, '*') <> 0
    or pg_catalog.strpos(p_bundle_key, '%') <> 0
    or p_bundle_revision is null or p_bundle_revision <= 0
    or p_effective_from is null
    or (p_effective_until is not null and p_effective_until <= p_effective_from)
    or p_reason is null or pg_catalog.length(p_reason) not between 1 and 1000
    or p_reason <> pg_catalog.btrim(p_reason)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'materialize_bundle_assignment',
    'staffAccountId', p_staff_account_id,
    'bundleKey', p_bundle_key,
    'bundleRevision', p_bundle_revision,
    'effectiveFrom', p_effective_from,
    'effectiveUntil', p_effective_until,
    'reason', p_reason
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select receipt.* into v_prior
  from admin_internal.staff_authority_operation_receipts receipt
  where receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> 'materialize_bundle_assignment'
      or v_prior.request_payload is distinct from v_request_payload
    then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'request_conflict');
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'outcome', 'replayed',
      'assignmentId', v_prior.result_assignment_id,
      'entitlementCount', v_prior.result_entitlement_count,
      'occurredAt', v_prior.created_at
    );
  end if;

  select account.status, account.effective_from, account.effective_until
    into v_staff_status, v_staff_effective_from, v_staff_effective_until
  from admin_internal.staff_accounts account
  where account.id = p_staff_account_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'staff_not_found');
  end if;
  if v_staff_status <> 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'staff_not_active');
  end if;
  if p_effective_from < v_staff_effective_from
    or (v_staff_effective_until is not null
      and (p_effective_until is null or p_effective_until > v_staff_effective_until))
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'staff_validity_conflict');
  end if;

  select template.lifecycle_status into v_bundle_status
  from admin_internal.staff_bundle_templates template
  where template.bundle_key = p_bundle_key and template.revision = p_bundle_revision
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'bundle_revision_not_found');
  end if;
  if v_bundle_status <> 'active' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'bundle_revision_retired');
  end if;

  if exists (
    select 1
    from admin_internal.staff_bundle_template_permissions membership
    join admin_internal.staff_permission_catalog permission
      on permission.permission_key = membership.permission_key
    where membership.bundle_key = p_bundle_key
      and membership.bundle_revision = p_bundle_revision
      and permission.console_admission_required
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'errorCode', 'bundle_console_admission_forbidden'
    );
  end if;

  if exists (
    select 1
    from admin_internal.staff_bundle_template_permissions membership
    join admin_internal.staff_permission_catalog permission
      on permission.permission_key = membership.permission_key
    where membership.bundle_key = p_bundle_key
      and membership.bundle_revision = p_bundle_revision
      and membership.membership_kind = 'DEFAULT'
      and permission.lifecycle_status <> 'active'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'errorCode', 'bundle_permission_inactive'
    );
  end if;

  v_now := pg_catalog.clock_timestamp();
  insert into admin_internal.staff_bundle_assignments (
    staff_account_id, bundle_key, bundle_revision, status,
    effective_from, effective_until, created_at, revoked_at
  ) values (
    p_staff_account_id, p_bundle_key, p_bundle_revision, 'active',
    p_effective_from, p_effective_until, v_now, null
  ) returning assignment_id into v_assignment_id;

  with inserted_entitlements as (
    insert into admin_internal.staff_permission_entitlements (
      staff_account_id, permission_key, source_type, source_bundle_assignment_id,
      status, effective_from, effective_until, created_at, revoked_at
    )
    select
      p_staff_account_id, membership.permission_key, 'bundle_assignment', v_assignment_id,
      'active', p_effective_from, p_effective_until, v_now, null
    from admin_internal.staff_bundle_template_permissions membership
    where membership.bundle_key = p_bundle_key
      and membership.bundle_revision = p_bundle_revision
      and membership.membership_kind = 'DEFAULT'
    order by membership.permission_key
    returning entitlement_id, permission_key
  )
  insert into admin_internal.staff_authority_audit_log (
    request_id, event_type, actor_kind, actor_database_identity,
    subject_staff_account_id, bundle_key, bundle_revision, bundle_assignment_id,
    permission_key, entitlement_id, effective_from, effective_until, reason, occurred_at
  )
  select
    p_request_id, 'bundle_entitlement_materialized', 'operator', session_user,
    p_staff_account_id, p_bundle_key, p_bundle_revision, v_assignment_id,
    inserted.permission_key, inserted.entitlement_id,
    p_effective_from, p_effective_until, p_reason, v_now
  from inserted_entitlements inserted;
  get diagnostics v_entitlement_count = row_count;

  insert into admin_internal.staff_authority_audit_log (
    request_id, event_type, actor_kind, actor_database_identity,
    subject_staff_account_id, bundle_key, bundle_revision, bundle_assignment_id,
    effective_from, effective_until, reason, occurred_at
  ) values (
    p_request_id, 'bundle_assignment_materialized', 'operator', session_user,
    p_staff_account_id, p_bundle_key, p_bundle_revision, v_assignment_id,
    p_effective_from, p_effective_until, p_reason, v_now
  );

  insert into admin_internal.staff_authority_operation_receipts (
    request_id, operation_kind, request_payload,
    result_assignment_id, result_entitlement_count, created_at
  ) values (
    p_request_id, 'materialize_bundle_assignment', v_request_payload,
    v_assignment_id, v_entitlement_count, v_now
  );

  return pg_catalog.jsonb_build_object(
    'ok', true, 'outcome', 'applied', 'assignmentId', v_assignment_id,
    'entitlementCount', v_entitlement_count, 'occurredAt', v_now
  );
end;
$$;

create function admin_internal.revoke_staff_bundle_assignment_v1(
  p_request_id uuid,
  p_assignment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_request_payload jsonb;
  v_prior admin_internal.staff_authority_operation_receipts%rowtype;
  v_staff_account_id uuid;
  v_bundle_key text;
  v_bundle_revision integer;
  v_assignment_status text;
  v_effective_from timestamptz;
  v_effective_until timestamptz;
  v_entitlement_count integer := 0;
  v_now timestamptz;
begin
  if p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or p_assignment_id is null
    or p_reason is null or pg_catalog.length(p_reason) not between 1 and 1000
    or p_reason <> pg_catalog.btrim(p_reason)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid_request');
  end if;

  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', 'revoke_bundle_assignment',
    'assignmentId', p_assignment_id,
    'reason', p_reason
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );

  select receipt.* into v_prior
  from admin_internal.staff_authority_operation_receipts receipt
  where receipt.request_id = p_request_id;
  if found then
    if v_prior.operation_kind <> 'revoke_bundle_assignment'
      or v_prior.request_payload is distinct from v_request_payload
    then
      return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'request_conflict');
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true, 'outcome', 'replayed',
      'assignmentId', v_prior.result_assignment_id,
      'entitlementCount', v_prior.result_entitlement_count,
      'occurredAt', v_prior.created_at
    );
  end if;

  select assignment.staff_account_id, assignment.bundle_key, assignment.bundle_revision,
         assignment.status, assignment.effective_from, assignment.effective_until
    into v_staff_account_id, v_bundle_key, v_bundle_revision,
         v_assignment_status, v_effective_from, v_effective_until
  from admin_internal.staff_bundle_assignments assignment
  where assignment.assignment_id = p_assignment_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'assignment_not_found');
  end if;
  if v_assignment_status = 'revoked' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'already_revoked');
  end if;

  v_now := pg_catalog.clock_timestamp();
  update admin_internal.staff_bundle_assignments
  set status = 'revoked', revoked_at = v_now
  where assignment_id = p_assignment_id;

  with revoked_entitlements as (
    update admin_internal.staff_permission_entitlements entitlement
    set status = 'revoked', revoked_at = v_now
    where entitlement.source_type = 'bundle_assignment'
      and entitlement.source_bundle_assignment_id = p_assignment_id
      and entitlement.status = 'active'
    returning entitlement.entitlement_id, entitlement.permission_key
  )
  insert into admin_internal.staff_authority_audit_log (
    request_id, event_type, actor_kind, actor_database_identity,
    subject_staff_account_id, bundle_key, bundle_revision, bundle_assignment_id,
    permission_key, entitlement_id, effective_from, effective_until, reason, occurred_at
  )
  select
    p_request_id, 'bundle_entitlement_revoked', 'operator', session_user,
    v_staff_account_id, v_bundle_key, v_bundle_revision, p_assignment_id,
    revoked.permission_key, revoked.entitlement_id,
    v_effective_from, v_effective_until, p_reason, v_now
  from revoked_entitlements revoked;
  get diagnostics v_entitlement_count = row_count;

  insert into admin_internal.staff_authority_audit_log (
    request_id, event_type, actor_kind, actor_database_identity,
    subject_staff_account_id, bundle_key, bundle_revision, bundle_assignment_id,
    effective_from, effective_until, reason, occurred_at
  ) values (
    p_request_id, 'bundle_assignment_revoked', 'operator', session_user,
    v_staff_account_id, v_bundle_key, v_bundle_revision, p_assignment_id,
    v_effective_from, v_effective_until, p_reason, v_now
  );

  insert into admin_internal.staff_authority_operation_receipts (
    request_id, operation_kind, request_payload,
    result_assignment_id, result_entitlement_count, created_at
  ) values (
    p_request_id, 'revoke_bundle_assignment', v_request_payload,
    p_assignment_id, v_entitlement_count, v_now
  );

  return pg_catalog.jsonb_build_object(
    'ok', true, 'outcome', 'applied', 'assignmentId', p_assignment_id,
    'entitlementCount', v_entitlement_count, 'occurredAt', v_now
  );
end;
$$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default. Settle ACLs before transferring
-- ownership; the sealed owner is deliberately not retained as an inheritable runner membership.
revoke all on function admin_internal.materialize_staff_bundle_assignment_v1(
  uuid, uuid, text, integer, timestamptz, timestamptz, text
) from public, anon, authenticated, authenticator, service_role;
revoke all on function admin_internal.revoke_staff_bundle_assignment_v1(
  uuid, uuid, text
) from public, anon, authenticated, authenticator, service_role;

grant staff_authority_write_authority to postgres with admin false, inherit false, set true;
grant create on schema admin_internal to staff_authority_write_authority;
alter function admin_internal.materialize_staff_bundle_assignment_v1(
  uuid, uuid, text, integer, timestamptz, timestamptz, text
) owner to staff_authority_write_authority;
alter function admin_internal.revoke_staff_bundle_assignment_v1(
  uuid, uuid, text
) owner to staff_authority_write_authority;
revoke create on schema admin_internal from staff_authority_write_authority;
revoke staff_authority_write_authority from postgres granted by postgres;

commit;
