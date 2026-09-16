-- RA-3-IA-P3-P6-P3H: fresh high-privilege step-up authority.
--
-- TOTP/AAL2 is the initial authenticator. The receipt contract is method-neutral so a later
-- authorized WebAuthn factor can enter the same database boundary without changing the protected
-- staff operators. The original authenticated JWT remains the operation actor.
-- TOTP_AAL2_MVP_AUTHENTICATOR_SELECTED
-- PASSKEY_NATIVE_AVAILABLE_BUT_DEFERRED
-- FINAL_HIGH_PRIVILEGE_SOP_STILL_REQUIRED_AT_HANDOFF
-- FINAL_DOCUMENT_NAME=《最高權限開啟 SOP》

begin;

create role staff_step_up_receipt_data_authority
  nologin noinherit nobypassrls;
create role staff_step_up_receipt_issuer_authority
  nologin noinherit nobypassrls;
create role staff_step_up_gate_authority
  nologin noinherit nobypassrls;

comment on role staff_step_up_receipt_data_authority is
  'P3H sealed owner for receipt evidence. It is never granted to an environment login.';
comment on role staff_step_up_receipt_issuer_authority is
  'P3H sealed NOLOGIN broker group. Environment-specific LOGIN provisioning is out of source control.';
comment on role staff_step_up_gate_authority is
  'P3H sealed owner for authenticated receipt-gated v2 wrappers.';

create table admin_internal.staff_step_up_receipts (
  receipt_id uuid not null default pg_catalog.gen_random_uuid(),
  issue_request_id uuid not null,
  actor_auth_user_id uuid not null,
  actor_staff_account_id uuid not null,
  session_id uuid not null,
  operation_class text not null,
  secret_hash text not null,
  authentication_assurance text not null,
  step_up_method text not null,
  factor_identifier_hash text,
  verified_at timestamptz not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'active',
  status_version bigint not null default 0,
  superseded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint staff_step_up_receipts_pkey primary key (receipt_id),
  constraint staff_step_up_receipts_issue_request_key unique (issue_request_id),
  constraint staff_step_up_receipts_actor_auth_fkey
    foreign key (actor_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipts_actor_staff_fkey
    foreign key (actor_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipts_issue_request_v4_check check (
    (pg_catalog.get_byte(pg_catalog.uuid_send(issue_request_id), 6) >> 4) = 4
  ),
  constraint staff_step_up_receipts_operation_class_check check (
    operation_class = 'staff_high_privilege_management_v1'
  ),
  constraint staff_step_up_receipts_secret_hash_check check (
    secret_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint staff_step_up_receipts_assurance_check check (
    authentication_assurance = 'aal2'
  ),
  constraint staff_step_up_receipts_method_check check (
    step_up_method = 'totp'
  ),
  constraint staff_step_up_receipts_factor_hash_check check (
    factor_identifier_hash is null
    or factor_identifier_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint staff_step_up_receipts_fixed_window_check check (
    issued_at >= verified_at
    and expires_at = issued_at + interval '15 minutes'
  ),
  constraint staff_step_up_receipts_status_check check (
    status in ('active', 'revoked')
  ),
  constraint staff_step_up_receipts_status_version_check check (status_version >= 0),
  constraint staff_step_up_receipts_status_shape_check check (
    (status = 'active' and superseded_at is null and revoked_at is null)
    or
    (status = 'revoked' and revoked_at is not null)
  ),
  constraint staff_step_up_receipts_timestamp_check check (
    created_at = issued_at and updated_at >= created_at
  )
);

create unique index staff_step_up_receipts_one_active_scope_key
  on admin_internal.staff_step_up_receipts
    (actor_auth_user_id, session_id, operation_class)
  where status = 'active';
create index staff_step_up_receipts_actor_history_idx
  on admin_internal.staff_step_up_receipts
    (actor_auth_user_id, issued_at desc, receipt_id);

create table admin_internal.staff_step_up_receipt_uses (
  use_id uuid not null default pg_catalog.gen_random_uuid(),
  receipt_id uuid not null,
  actor_auth_user_id uuid not null,
  actor_staff_account_id uuid not null,
  target_auth_user_id uuid,
  target_staff_account_id uuid,
  operation_kind text not null,
  permission_key text,
  reason_code text,
  request_id uuid not null,
  operation_class text not null,
  step_up_method text not null,
  receipt_issued_at timestamptz not null,
  receipt_expires_at timestamptz not null,
  used_at timestamptz not null,
  result_metadata jsonb not null,
  constraint staff_step_up_receipt_uses_pkey primary key (use_id),
  constraint staff_step_up_receipt_uses_receipt_fkey
    foreign key (receipt_id) references admin_internal.staff_step_up_receipts (receipt_id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipt_uses_actor_auth_fkey
    foreign key (actor_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipt_uses_actor_staff_fkey
    foreign key (actor_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipt_uses_target_auth_fkey
    foreign key (target_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipt_uses_target_staff_fkey
    foreign key (target_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_step_up_receipt_uses_request_v4_check check (
    (pg_catalog.get_byte(pg_catalog.uuid_send(request_id), 6) >> 4) = 4
  ),
  constraint staff_step_up_receipt_uses_operation_check check (
    operation_kind in (
      'staff_account_link', 'staff_account_suspend', 'staff_account_reactivate',
      'staff_account_revoke', 'staff_delegation_grant', 'staff_delegation_revoke',
      'console_admission_grant', 'console_admission_revoke',
      'privileged_permission_grant', 'privileged_permission_revoke'
    )
  ),
  constraint staff_step_up_receipt_uses_operation_class_check check (
    operation_class = 'staff_high_privilege_management_v1'
  ),
  constraint staff_step_up_receipt_uses_method_check check (step_up_method = 'totp'),
  constraint staff_step_up_receipt_uses_window_check check (
    receipt_expires_at = receipt_issued_at + interval '15 minutes'
    and used_at >= receipt_issued_at
    and used_at < receipt_expires_at
  ),
  constraint staff_step_up_receipt_uses_reason_check check (
    reason_code is null or (
      pg_catalog.length(reason_code) between 1 and 80
      and reason_code = pg_catalog.btrim(reason_code)
      and reason_code ~ '^[a-z][a-z0-9_]*$'
    )
  ),
  constraint staff_step_up_receipt_uses_result_check check (
    pg_catalog.jsonb_typeof(result_metadata) = 'object'
  ),
  constraint staff_step_up_receipt_uses_idempotency_key
    unique (actor_auth_user_id, request_id, operation_kind)
);

create index staff_step_up_receipt_uses_receipt_history_idx
  on admin_internal.staff_step_up_receipt_uses (receipt_id, used_at desc, use_id);

create table admin_internal.staff_security_notification_outbox (
  notification_id uuid not null default pg_catalog.gen_random_uuid(),
  receipt_use_id uuid not null,
  actor_auth_user_id uuid not null,
  target_auth_user_id uuid,
  target_staff_account_id uuid,
  event_type text not null,
  priority text not null,
  permission_key text,
  reason_code text,
  request_id uuid not null,
  event_payload jsonb not null,
  created_at timestamptz not null,
  dispatched_at timestamptz,
  constraint staff_security_notification_outbox_pkey primary key (notification_id),
  constraint staff_security_notification_outbox_use_fkey
    foreign key (receipt_use_id) references admin_internal.staff_step_up_receipt_uses (use_id)
    on update restrict on delete restrict,
  constraint staff_security_notification_outbox_actor_fkey
    foreign key (actor_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_security_notification_outbox_target_auth_fkey
    foreign key (target_auth_user_id) references auth.users (id)
    on update restrict on delete restrict,
  constraint staff_security_notification_outbox_target_staff_fkey
    foreign key (target_staff_account_id) references admin_internal.staff_accounts (id)
    on update restrict on delete restrict,
  constraint staff_security_notification_outbox_priority_check check (
    priority in ('high', 'critical')
  ),
  constraint staff_security_notification_outbox_event_check check (
    event_type in (
      'new_permission_manager', 'permission_manager_revoke',
      'account_management_authority_grant', 'account_management_authority_revoke',
      'delegation_management_authority_grant', 'delegation_management_authority_revoke',
      'console_admission_grant', 'console_admission_revoke',
      'staff_link', 'staff_suspend', 'staff_reactivate', 'staff_revoke',
      'permission_delegation_grant', 'permission_delegation_revoke',
      'privileged_permission_grant', 'privileged_permission_revoke'
    )
  ),
  constraint staff_security_notification_outbox_request_v4_check check (
    (pg_catalog.get_byte(pg_catalog.uuid_send(request_id), 6) >> 4) = 4
  ),
  constraint staff_security_notification_outbox_payload_check check (
    pg_catalog.jsonb_typeof(event_payload) = 'object'
  ),
  constraint staff_security_notification_outbox_idempotency_key
    unique (actor_auth_user_id, request_id, event_type)
);

comment on table admin_internal.staff_step_up_receipts is
  'P3H fixed, non-sliding, actor/session-bound 15-minute step-up receipts. Only hashes are stored.';
comment on table admin_internal.staff_step_up_receipt_uses is
  'P3H append-only evidence for successful high-privilege operations.';
comment on table admin_internal.staff_security_notification_outbox is
  'P3H append-only transactional security-notification evidence; delivery is a successor concern.';

alter table admin_internal.staff_step_up_receipts enable row level security;
alter table admin_internal.staff_step_up_receipts force row level security;
alter table admin_internal.staff_step_up_receipt_uses enable row level security;
alter table admin_internal.staff_step_up_receipt_uses force row level security;
alter table admin_internal.staff_security_notification_outbox enable row level security;
alter table admin_internal.staff_security_notification_outbox force row level security;

create policy staff_step_up_receipts_data_select
  on admin_internal.staff_step_up_receipts for select
  to staff_step_up_receipt_data_authority using (true);
create policy staff_step_up_receipts_data_insert
  on admin_internal.staff_step_up_receipts for insert
  to staff_step_up_receipt_data_authority with check (true);
create policy staff_step_up_receipts_data_update
  on admin_internal.staff_step_up_receipts for update
  to staff_step_up_receipt_data_authority using (true) with check (true);
create policy staff_step_up_receipt_uses_data_select
  on admin_internal.staff_step_up_receipt_uses for select
  to staff_step_up_receipt_data_authority using (true);
create policy staff_step_up_receipt_uses_data_insert
  on admin_internal.staff_step_up_receipt_uses for insert
  to staff_step_up_receipt_data_authority with check (true);
create policy staff_security_notification_outbox_data_select
  on admin_internal.staff_security_notification_outbox for select
  to staff_step_up_receipt_data_authority using (true);
create policy staff_security_notification_outbox_data_insert
  on admin_internal.staff_security_notification_outbox for insert
  to staff_step_up_receipt_data_authority with check (true);

create policy staff_accounts_step_up_data_select
  on admin_internal.staff_accounts for select
  to staff_step_up_receipt_data_authority using (true);

revoke all on table admin_internal.staff_step_up_receipts,
  admin_internal.staff_step_up_receipt_uses,
  admin_internal.staff_security_notification_outbox
  from public, anon, authenticated, authenticator, service_role;
grant select, insert on table admin_internal.staff_step_up_receipts
  to staff_step_up_receipt_data_authority;
grant update (status, status_version, superseded_at, revoked_at, updated_at)
  on table admin_internal.staff_step_up_receipts
  to staff_step_up_receipt_data_authority;
grant select, insert on table admin_internal.staff_step_up_receipt_uses,
  admin_internal.staff_security_notification_outbox
  to staff_step_up_receipt_data_authority;
grant select on table admin_internal.staff_accounts
  to staff_step_up_receipt_data_authority;

-- Keep auth.sessions behind one narrow PostgreSQL-owned SECURITY DEFINER predicate. The sealed
-- P3H data owner never receives generic Auth schema or table read authority.
create function admin_internal.staff_step_up_session_exists_v1(
  p_session_id uuid,
  p_actor_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions session_row
    where session_row.id = p_session_id
      and session_row.user_id = p_actor_auth_user_id
  );
$$;

revoke all on function
  admin_internal.staff_step_up_session_exists_v1(uuid,uuid)
from public, anon, authenticated, authenticator, service_role;
grant execute on function
  admin_internal.staff_step_up_session_exists_v1(uuid,uuid)
to staff_step_up_receipt_data_authority;

create function admin_internal.prevent_staff_step_up_evidence_mutation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'staff_step_up_evidence_append_only';
end;
$$;

create trigger staff_step_up_receipt_uses_append_only_v1
before update or delete on admin_internal.staff_step_up_receipt_uses
for each row execute function admin_internal.prevent_staff_step_up_evidence_mutation_v1();
create trigger staff_security_notification_outbox_append_only_v1
before update or delete on admin_internal.staff_security_notification_outbox
for each row execute function admin_internal.prevent_staff_step_up_evidence_mutation_v1();

create function admin_internal.enforce_staff_step_up_receipt_mutation_v1()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '23514', message = 'staff_step_up_receipt_delete_denied';
  end if;
  if old.status = 'revoked' and new is distinct from old then
    raise exception using errcode = '23514', message = 'staff_step_up_receipt_revoked_terminal';
  end if;
  if new.receipt_id is distinct from old.receipt_id
    or new.issue_request_id is distinct from old.issue_request_id
    or new.actor_auth_user_id is distinct from old.actor_auth_user_id
    or new.actor_staff_account_id is distinct from old.actor_staff_account_id
    or new.session_id is distinct from old.session_id
    or new.operation_class is distinct from old.operation_class
    or new.secret_hash is distinct from old.secret_hash
    or new.authentication_assurance is distinct from old.authentication_assurance
    or new.step_up_method is distinct from old.step_up_method
    or new.factor_identifier_hash is distinct from old.factor_identifier_hash
    or new.verified_at is distinct from old.verified_at
    or new.issued_at is distinct from old.issued_at
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = '23514', message = 'staff_step_up_receipt_identity_immutable';
  end if;
  return new;
end;
$$;

create trigger staff_step_up_receipts_bounded_mutation_v1
before update or delete on admin_internal.staff_step_up_receipts
for each row execute function admin_internal.enforce_staff_step_up_receipt_mutation_v1();

create function admin_internal.staff_step_up_issue_receipt_v1(
  p_actor_auth_user_id uuid,
  p_session_id uuid,
  p_secret_hash text,
  p_factor_identifier_hash text,
  p_verified_at timestamptz,
  p_request_id uuid
)
returns table (
  receipt_id uuid,
  issued_at timestamptz,
  expires_at timestamptz,
  operation_class text,
  step_up_method text
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_staff admin_internal.staff_accounts%rowtype;
  v_prior admin_internal.staff_step_up_receipts%rowtype;
  v_receipt admin_internal.staff_step_up_receipts%rowtype;
begin
  if session_user = 'postgres'
    or not pg_catalog.pg_has_role(
      session_user, 'staff_step_up_receipt_issuer_authority', 'MEMBER'
    )
  then
    raise exception using errcode = '42501', message = 'step_up_issuer_not_authorized';
  end if;
  if p_actor_auth_user_id is null or p_session_id is null
    or p_request_id is null
    or (pg_catalog.get_byte(pg_catalog.uuid_send(p_request_id), 6) >> 4) <> 4
    or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$'
    or (p_factor_identifier_hash is not null
      and p_factor_identifier_hash !~ '^[0-9a-f]{64}$')
    or p_verified_at is null
    or p_verified_at < v_now - interval '2 minutes'
    or p_verified_at > v_now + interval '5 seconds'
  then
    raise exception using errcode = '22023', message = 'step_up_issue_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'staff_step_up_issue:' || p_actor_auth_user_id::text || ':'
      || p_session_id::text || ':staff_high_privilege_management_v1', 0
  ));

  select receipt.* into v_prior
  from admin_internal.staff_step_up_receipts receipt
  where receipt.issue_request_id = p_request_id;
  if found then
    if v_prior.actor_auth_user_id <> p_actor_auth_user_id
      or v_prior.session_id <> p_session_id
      or v_prior.secret_hash <> p_secret_hash
      or v_prior.factor_identifier_hash is distinct from p_factor_identifier_hash
      or v_prior.verified_at <> p_verified_at
    then
      raise exception using errcode = '23505', message = 'request_conflict';
    end if;
    return query select v_prior.receipt_id, v_prior.issued_at, v_prior.expires_at,
      v_prior.operation_class, v_prior.step_up_method;
    return;
  end if;

  select account.* into v_staff
  from admin_internal.staff_accounts account
  where account.auth_user_id = p_actor_auth_user_id;
  if not found
    or v_staff.status <> 'active'
    or v_staff.effective_from > v_now
    or (v_staff.effective_until is not null and v_now >= v_staff.effective_until)
  then
    raise exception using errcode = '42501', message = 'step_up_actor_not_effective';
  end if;
  if not admin_internal.staff_step_up_session_exists_v1(
    p_session_id, p_actor_auth_user_id
  ) then
    raise exception using errcode = '42501', message = 'step_up_session_invalid';
  end if;

  update admin_internal.staff_step_up_receipts receipt
  set status = 'revoked', status_version = status_version + 1,
      superseded_at = v_now, revoked_at = v_now, updated_at = v_now
  where receipt.actor_auth_user_id = p_actor_auth_user_id
    and receipt.session_id = p_session_id
    and receipt.operation_class = 'staff_high_privilege_management_v1'
    and receipt.status = 'active';

  insert into admin_internal.staff_step_up_receipts (
    issue_request_id, actor_auth_user_id, actor_staff_account_id, session_id,
    operation_class, secret_hash, authentication_assurance, step_up_method,
    factor_identifier_hash, verified_at, issued_at, expires_at,
    status, status_version, created_at, updated_at
  ) values (
    p_request_id, p_actor_auth_user_id, v_staff.id, p_session_id,
    'staff_high_privilege_management_v1', p_secret_hash, 'aal2', 'totp',
    p_factor_identifier_hash, p_verified_at, v_now, v_now + interval '15 minutes',
    'active', 0, v_now, v_now
  ) returning * into v_receipt;

  return query select v_receipt.receipt_id, v_receipt.issued_at,
    v_receipt.expires_at, v_receipt.operation_class, v_receipt.step_up_method;
end;
$$;

create function admin_internal.staff_step_up_revoke_receipt_v1(
  p_receipt_id uuid,
  p_actor_auth_user_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_changed integer;
begin
  if session_user = 'postgres'
    or not pg_catalog.pg_has_role(
      session_user, 'staff_step_up_receipt_issuer_authority', 'MEMBER'
    )
  then
    raise exception using errcode = '42501', message = 'step_up_issuer_not_authorized';
  end if;
  if p_receipt_id is null or p_actor_auth_user_id is null or p_session_id is null then
    return false;
  end if;
  update admin_internal.staff_step_up_receipts receipt
  set status = 'revoked', status_version = status_version + 1,
      revoked_at = v_now, updated_at = v_now
  where receipt.receipt_id = p_receipt_id
    and receipt.actor_auth_user_id = p_actor_auth_user_id
    and receipt.session_id = p_session_id
    and receipt.status = 'active';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

create function admin_internal.staff_step_up_receipt_status_v1(
  p_receipt_id uuid,
  p_actor_auth_user_id uuid,
  p_session_id uuid,
  p_receipt_proof_hash text
)
returns table (
  active boolean,
  expires_at timestamptz,
  operation_class text,
  step_up_method text
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
as $$
declare
  v_receipt admin_internal.staff_step_up_receipts%rowtype;
begin
  if session_user = 'postgres'
    or not pg_catalog.pg_has_role(
      session_user, 'staff_step_up_receipt_issuer_authority', 'MEMBER'
    )
  then
    raise exception using errcode = '42501', message = 'step_up_issuer_not_authorized';
  end if;
  select receipt.* into v_receipt
  from admin_internal.staff_step_up_receipts receipt
  where receipt.receipt_id = p_receipt_id;
  if not found
    or v_receipt.actor_auth_user_id <> p_actor_auth_user_id
    or v_receipt.session_id <> p_session_id
    or v_receipt.secret_hash <> p_receipt_proof_hash
    or v_receipt.operation_class <> 'staff_high_privilege_management_v1'
    or not admin_internal.staff_step_up_session_exists_v1(
      p_session_id, p_actor_auth_user_id
    )
  then
    return query select false, null::timestamptz, null::text, null::text;
    return;
  end if;
  return query select
    v_receipt.status = 'active' and pg_catalog.clock_timestamp() < v_receipt.expires_at,
    v_receipt.expires_at, v_receipt.operation_class, v_receipt.step_up_method;
end;
$$;

create function admin_internal.staff_step_up_validate_receipt_v1(
  p_receipt_id uuid,
  p_receipt_proof_hash text,
  p_operation_class text
)
returns table (
  ok boolean,
  error_code text,
  actor_auth_user_id uuid,
  actor_staff_account_id uuid,
  receipt_issued_at timestamptz,
  receipt_expires_at timestamptz,
  step_up_method text
)
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_claims jsonb;
  v_subject_text text;
  v_session_text text;
  v_aal text;
  v_subject uuid;
  v_session uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_receipt admin_internal.staff_step_up_receipts%rowtype;
begin
  v_claims := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  v_subject_text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    v_claims ->> 'sub'
  );
  v_session_text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.session_id', true), ''),
    v_claims ->> 'session_id'
  );
  v_aal := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.aal', true), ''),
    v_claims ->> 'aal'
  );

  begin
    v_subject := v_subject_text::uuid;
    v_session := v_session_text::uuid;
  exception when others then
    return query select false, 'step_up_required'::text, null::uuid, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end;
  if v_aal is distinct from 'aal2' then
    return query select false, 'step_up_aal2_required'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if p_receipt_id is null or p_receipt_proof_hash is null
    or p_receipt_proof_hash !~ '^[0-9a-f]{64}$'
  then
    return query select false, 'step_up_required'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if p_operation_class is distinct from 'staff_high_privilege_management_v1' then
    return query select false, 'step_up_wrong_class'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  select receipt.* into v_receipt
  from admin_internal.staff_step_up_receipts receipt
  where receipt.receipt_id = p_receipt_id
  for update;
  if not found then
    return query select false, 'step_up_invalid'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if v_receipt.actor_auth_user_id <> v_subject then
    return query select false, 'step_up_actor_mismatch'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if v_receipt.session_id <> v_session then
    return query select false, 'step_up_session_mismatch'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if v_receipt.operation_class <> p_operation_class then
    return query select false, 'step_up_wrong_class'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if v_receipt.status <> 'active' then
    return query select false, 'step_up_invalid'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if v_now >= v_receipt.expires_at then
    return query select false, 'step_up_expired'::text, v_subject, null::uuid,
      v_receipt.issued_at, v_receipt.expires_at, v_receipt.step_up_method;
    return;
  end if;
  if v_receipt.secret_hash <> p_receipt_proof_hash then
    return query select false, 'step_up_invalid'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  if not admin_internal.staff_step_up_session_exists_v1(v_session, v_subject) then
    return query select false, 'step_up_session_invalid'::text, v_subject, null::uuid,
      null::timestamptz, null::timestamptz, null::text;
    return;
  end if;
  return query select true, null::text, v_receipt.actor_auth_user_id,
    v_receipt.actor_staff_account_id, v_receipt.issued_at,
    v_receipt.expires_at, v_receipt.step_up_method;
end;
$$;

create function admin_internal.staff_step_up_record_success_v1(
  p_receipt_id uuid,
  p_operation_kind text,
  p_target_auth_user_id uuid,
  p_target_staff_account_id uuid,
  p_permission_key text,
  p_reason_code text,
  p_request_id uuid,
  p_result jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set row_security = 'on'
set timezone = 'UTC'
as $$
declare
  v_receipt admin_internal.staff_step_up_receipts%rowtype;
  v_use_id uuid;
  v_event_type text;
  v_priority text := 'high';
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_permission_key text := coalesce(p_permission_key, p_result ->> 'permissionKey');
  v_target_staff_account_id uuid := coalesce(
    p_target_staff_account_id,
    nullif(p_result ->> 'targetStaffAccountId', '')::uuid
  );
begin
  if p_result ->> 'outcome' is distinct from 'applied' then return; end if;
  select receipt.* into v_receipt
  from admin_internal.staff_step_up_receipts receipt
  where receipt.receipt_id = p_receipt_id
  for update;
  if not found or v_receipt.status <> 'active' or v_now >= v_receipt.expires_at then
    raise exception using errcode = '42501', message = 'step_up_invalid';
  end if;

  insert into admin_internal.staff_step_up_receipt_uses (
    receipt_id, actor_auth_user_id, actor_staff_account_id,
    target_auth_user_id, target_staff_account_id, operation_kind,
    permission_key, reason_code, request_id, operation_class, step_up_method,
    receipt_issued_at, receipt_expires_at, used_at, result_metadata
  ) values (
    v_receipt.receipt_id, v_receipt.actor_auth_user_id,
    v_receipt.actor_staff_account_id, p_target_auth_user_id,
    v_target_staff_account_id, p_operation_kind, v_permission_key,
    p_reason_code, p_request_id, v_receipt.operation_class,
    v_receipt.step_up_method, v_receipt.issued_at, v_receipt.expires_at,
    v_now, p_result
  ) on conflict (actor_auth_user_id, request_id, operation_kind) do nothing
  returning use_id into v_use_id;
  if v_use_id is null then return; end if;

  v_event_type := case
    when p_operation_kind = 'staff_account_link' then 'staff_link'
    when p_operation_kind = 'staff_account_suspend' then 'staff_suspend'
    when p_operation_kind = 'staff_account_reactivate' then 'staff_reactivate'
    when p_operation_kind = 'staff_account_revoke' then 'staff_revoke'
    when p_operation_kind = 'staff_delegation_grant' then 'permission_delegation_grant'
    when p_operation_kind = 'staff_delegation_revoke' then 'permission_delegation_revoke'
    when p_operation_kind = 'console_admission_grant' then 'console_admission_grant'
    when p_operation_kind = 'console_admission_revoke' then 'console_admission_revoke'
    when p_operation_kind = 'privileged_permission_grant'
      and v_permission_key = 'admin.management.staff.permission.write'
      then 'new_permission_manager'
    when p_operation_kind = 'privileged_permission_revoke'
      and v_permission_key = 'admin.management.staff.permission.write'
      then 'permission_manager_revoke'
    when p_operation_kind = 'privileged_permission_grant'
      and v_permission_key = 'admin.management.staff.account.write'
      then 'account_management_authority_grant'
    when p_operation_kind = 'privileged_permission_revoke'
      and v_permission_key = 'admin.management.staff.account.write'
      then 'account_management_authority_revoke'
    when p_operation_kind = 'privileged_permission_grant'
      and v_permission_key = 'admin.management.staff.delegation.write'
      then 'delegation_management_authority_grant'
    when p_operation_kind = 'privileged_permission_revoke'
      and v_permission_key = 'admin.management.staff.delegation.write'
      then 'delegation_management_authority_revoke'
    when p_operation_kind = 'privileged_permission_grant'
      then 'privileged_permission_grant'
    else 'privileged_permission_revoke'
  end;
  if v_event_type = 'new_permission_manager' then v_priority := 'critical'; end if;

  insert into admin_internal.staff_security_notification_outbox (
    receipt_use_id, actor_auth_user_id, target_auth_user_id,
    target_staff_account_id, event_type, priority, permission_key,
    reason_code, request_id, event_payload, created_at
  ) values (
    v_use_id, v_receipt.actor_auth_user_id, p_target_auth_user_id,
    v_target_staff_account_id, v_event_type, v_priority, v_permission_key,
    p_reason_code, p_request_id,
    pg_catalog.jsonb_build_object(
      'operationKind', p_operation_kind,
      'operationClass', v_receipt.operation_class,
      'stepUpMethod', v_receipt.step_up_method,
      'receiptId', v_receipt.receipt_id,
      'result', p_result
    ), v_now
  ) on conflict (actor_auth_user_id, request_id, event_type) do nothing;
end;
$$;

-- Each public v2 wrapper validates and locks the receipt, calls the frozen v1 authority path,
-- then appends P3H use/outbox evidence in the same transaction.
create function public.staff_management_link_staff_account_v2(
  p_target_auth_user_id uuid, p_effective_from timestamptz,
  p_effective_until timestamptz, p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(
    p_step_up_receipt_id, p_step_up_receipt_proof_hash,
    'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_link_staff_account_v1(
    p_target_auth_user_id,p_effective_from,p_effective_until,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,
    'staff_account_link',p_target_auth_user_id,null,null,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_suspend_staff_account_v2(
  p_target_staff_account_id uuid, p_expected_status_version bigint,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_suspend_staff_account_v1(p_target_staff_account_id,p_expected_status_version,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'staff_account_suspend',null,p_target_staff_account_id,null,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_reactivate_staff_account_v2(
  p_target_staff_account_id uuid, p_expected_status_version bigint,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_reactivate_staff_account_v1(p_target_staff_account_id,p_expected_status_version,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'staff_account_reactivate',null,p_target_staff_account_id,null,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_revoke_staff_account_v2(
  p_target_staff_account_id uuid, p_expected_status_version bigint,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_revoke_staff_account_v1(p_target_staff_account_id,p_expected_status_version,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'staff_account_revoke',null,p_target_staff_account_id,null,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_grant_permission_delegation_v2(
  p_delegate_staff_account_id uuid, p_permission_key text,
  p_can_grant boolean, p_can_revoke boolean, p_can_set_temporary boolean,
  p_effective_from timestamptz, p_effective_until timestamptz,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_grant_permission_delegation_v1(p_delegate_staff_account_id,p_permission_key,p_can_grant,p_can_revoke,p_can_set_temporary,p_effective_from,p_effective_until,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'staff_delegation_grant',null,p_delegate_staff_account_id,p_permission_key,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_revoke_permission_delegation_v2(
  p_delegation_id uuid, p_expected_status_version bigint,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_revoke_permission_delegation_v1(p_delegation_id,p_expected_status_version,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'staff_delegation_revoke',null,null,null,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_grant_console_admission_v2(
  p_target_staff_account_id uuid, p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_grant_console_admission_v1(p_target_staff_account_id,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'console_admission_grant',null,p_target_staff_account_id,'admin_context.read',p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_revoke_console_admission_v2(
  p_console_admission_grant_id uuid, p_expected_status_version bigint,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_revoke_console_admission_v1(p_console_admission_grant_id,p_expected_status_version,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'console_admission_revoke',null,null,'admin_context.read',p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_grant_privileged_permission_v2(
  p_target_staff_account_id uuid, p_permission_key text,
  p_effective_from timestamptz, p_effective_until timestamptz,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_grant_privileged_permission_v1(p_target_staff_account_id,p_permission_key,p_effective_from,p_effective_until,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'privileged_permission_grant',null,p_target_staff_account_id,p_permission_key,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

create function public.staff_management_revoke_privileged_permission_v2(
  p_privileged_permission_grant_id uuid, p_expected_status_version bigint,
  p_reason_code text, p_request_id uuid,
  p_step_up_receipt_id uuid, p_step_up_receipt_proof_hash text
)
returns jsonb language plpgsql volatile security definer
set search_path = '' set row_security = 'on' as $$
declare v_gate record; v_result jsonb;
begin
  select * into v_gate from admin_internal.staff_step_up_validate_receipt_v1(p_step_up_receipt_id,p_step_up_receipt_proof_hash,'staff_high_privilege_management_v1');
  if not v_gate.ok then return pg_catalog.jsonb_build_object('ok',false,'outcome','rejected','errorCode',v_gate.error_code); end if;
  v_result := public.staff_management_revoke_privileged_permission_v1(p_privileged_permission_grant_id,p_expected_status_version,p_reason_code,p_request_id);
  perform admin_internal.staff_step_up_record_success_v1(p_step_up_receipt_id,'privileged_permission_revoke',null,null,null,p_reason_code,p_request_id,v_result);
  return v_result;
end; $$;

-- Seal ownership and exact helper privileges.
-- Temporary PostgreSQL memberships exist only for object ownership transfer and are removed
-- before commit. They do not authorize normal receipt issuance (the issuer contract rejects
-- session_user=postgres independently).
grant staff_step_up_receipt_data_authority to postgres
  with admin false, inherit false, set true;
grant staff_step_up_gate_authority to postgres
  with admin false, inherit false, set true;
grant staff_account_write_authority to postgres
  with admin false, inherit false, set true;
grant staff_delegation_write_authority to postgres
  with admin false, inherit false, set true;
grant staff_console_admission_authority to postgres
  with admin false, inherit false, set true;
grant staff_direct_grant_authority to postgres
  with admin false, inherit false, set true;
grant create on schema admin_internal to staff_step_up_receipt_data_authority;
grant create on schema public to staff_step_up_gate_authority;
grant usage on schema admin_internal to staff_step_up_receipt_data_authority,
  staff_step_up_receipt_issuer_authority, staff_step_up_gate_authority;
grant usage on schema public to staff_step_up_gate_authority;

alter table admin_internal.staff_step_up_receipts
  owner to staff_step_up_receipt_data_authority;
alter table admin_internal.staff_step_up_receipt_uses
  owner to staff_step_up_receipt_data_authority;
alter table admin_internal.staff_security_notification_outbox
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.prevent_staff_step_up_evidence_mutation_v1()
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.enforce_staff_step_up_receipt_mutation_v1()
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.staff_step_up_issue_receipt_v1(uuid,uuid,text,text,timestamptz,uuid)
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.staff_step_up_revoke_receipt_v1(uuid,uuid,uuid)
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.staff_step_up_receipt_status_v1(uuid,uuid,uuid,text)
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.staff_step_up_validate_receipt_v1(uuid,text,text)
  owner to staff_step_up_receipt_data_authority;
alter function admin_internal.staff_step_up_record_success_v1(uuid,text,uuid,uuid,text,text,uuid,jsonb)
  owner to staff_step_up_receipt_data_authority;

alter function public.staff_management_link_staff_account_v2(uuid,timestamptz,timestamptz,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_suspend_staff_account_v2(uuid,bigint,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;
alter function public.staff_management_revoke_privileged_permission_v2(uuid,bigint,text,uuid,uuid,text)
  owner to staff_step_up_gate_authority;

set role staff_step_up_receipt_data_authority;
revoke all on function
  admin_internal.prevent_staff_step_up_evidence_mutation_v1(),
  admin_internal.enforce_staff_step_up_receipt_mutation_v1(),
  admin_internal.staff_step_up_issue_receipt_v1(uuid,uuid,text,text,timestamptz,uuid),
  admin_internal.staff_step_up_revoke_receipt_v1(uuid,uuid,uuid),
  admin_internal.staff_step_up_receipt_status_v1(uuid,uuid,uuid,text),
  admin_internal.staff_step_up_validate_receipt_v1(uuid,text,text),
  admin_internal.staff_step_up_record_success_v1(uuid,text,uuid,uuid,text,text,uuid,jsonb)
from public, anon, authenticated, authenticator, service_role, postgres;

grant execute on function
  admin_internal.staff_step_up_issue_receipt_v1(uuid,uuid,text,text,timestamptz,uuid),
  admin_internal.staff_step_up_revoke_receipt_v1(uuid,uuid,uuid),
  admin_internal.staff_step_up_receipt_status_v1(uuid,uuid,uuid,text)
to staff_step_up_receipt_issuer_authority;
grant execute on function
  admin_internal.staff_step_up_validate_receipt_v1(uuid,text,text),
  admin_internal.staff_step_up_record_success_v1(uuid,text,uuid,uuid,text,text,uuid,jsonb)
to staff_step_up_gate_authority;
reset role;

-- Only the sealed v2 owner may call the frozen protected v1 wrappers after cutover.
set role staff_account_write_authority;
grant execute on function
  public.staff_management_link_staff_account_v1(uuid,timestamptz,timestamptz,text,uuid),
  public.staff_management_suspend_staff_account_v1(uuid,bigint,text,uuid),
  public.staff_management_reactivate_staff_account_v1(uuid,bigint,text,uuid),
  public.staff_management_revoke_staff_account_v1(uuid,bigint,text,uuid)
to staff_step_up_gate_authority;
revoke execute on function
  public.staff_management_link_staff_account_v1(uuid,timestamptz,timestamptz,text,uuid),
  public.staff_management_suspend_staff_account_v1(uuid,bigint,text,uuid),
  public.staff_management_reactivate_staff_account_v1(uuid,bigint,text,uuid),
  public.staff_management_revoke_staff_account_v1(uuid,bigint,text,uuid)
from public, anon, authenticated, authenticator, service_role;
reset role;

set role staff_delegation_write_authority;
grant execute on function
  public.staff_management_grant_permission_delegation_v1(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid),
  public.staff_management_revoke_permission_delegation_v1(uuid,bigint,text,uuid)
to staff_step_up_gate_authority;
revoke execute on function
  public.staff_management_grant_permission_delegation_v1(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid),
  public.staff_management_revoke_permission_delegation_v1(uuid,bigint,text,uuid)
from public, anon, authenticated, authenticator, service_role;
reset role;

set role staff_console_admission_authority;
grant execute on function
  public.staff_management_grant_console_admission_v1(uuid,text,uuid),
  public.staff_management_revoke_console_admission_v1(uuid,bigint,text,uuid)
to staff_step_up_gate_authority;
revoke execute on function
  public.staff_management_grant_console_admission_v1(uuid,text,uuid),
  public.staff_management_revoke_console_admission_v1(uuid,bigint,text,uuid)
from public, anon, authenticated, authenticator, service_role;
reset role;

set role staff_direct_grant_authority;
grant execute on function
  public.staff_management_grant_privileged_permission_v1(uuid,text,timestamptz,timestamptz,text,uuid),
  public.staff_management_revoke_privileged_permission_v1(uuid,bigint,text,uuid)
to staff_step_up_gate_authority;
revoke execute on function
  public.staff_management_grant_privileged_permission_v1(uuid,text,timestamptz,timestamptz,text,uuid),
  public.staff_management_revoke_privileged_permission_v1(uuid,bigint,text,uuid)
from public, anon, authenticated, authenticator, service_role;
reset role;

revoke all on function
  public.staff_management_link_staff_account_v2(uuid,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_suspend_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text),
  public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_privileged_permission_v2(uuid,bigint,text,uuid,uuid,text)
from public, anon, authenticated, authenticator, service_role;
grant execute on function
  public.staff_management_link_staff_account_v2(uuid,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_suspend_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text),
  public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text),
  public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text),
  public.staff_management_revoke_privileged_permission_v2(uuid,bigint,text,uuid,uuid,text)
to authenticated;

revoke create on schema public from staff_step_up_gate_authority;
revoke create on schema admin_internal from staff_step_up_receipt_data_authority;
revoke staff_step_up_receipt_issuer_authority from postgres granted by postgres;
revoke staff_step_up_gate_authority from postgres granted by postgres;
revoke staff_step_up_receipt_data_authority from postgres granted by postgres;
revoke staff_account_write_authority from postgres granted by postgres;
revoke staff_delegation_write_authority from postgres granted by postgres;
revoke staff_console_admission_authority from postgres granted by postgres;
revoke staff_direct_grant_authority from postgres granted by postgres;

commit;
