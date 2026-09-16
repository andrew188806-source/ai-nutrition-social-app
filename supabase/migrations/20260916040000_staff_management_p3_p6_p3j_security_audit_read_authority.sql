-- RA-3-IA-P3-P6-P3J: Security/Audit read authority for the P3H Step-Up evidence trail.
--
-- Exposes bounded, permission-gated reads over the P3H receipt-use log and security
-- notification outbox so Platform Management can show real evidence without raw SQL.
-- Adds no write authority and touches no P3B-P3H protected function, role, or grant.
-- Reuses the P3I sealed read role (admin_internal.staff_management_read_authority) --
-- same read-only concern, gated here by the existing admin_audit.read permission rather
-- than the P3I management-read keys, matching the precedent set by the legacy
-- staff_admin_audit_log_v1 (admin_context.read + admin_audit.read).

begin;

grant usage, create on schema public to staff_management_read_authority;

-- Both evidence tables are owned by the sealed P3H data authority, not by postgres.
-- Borrow membership just long enough to lend SELECT to the new reader, then release it.
grant staff_step_up_receipt_data_authority to postgres with admin false, inherit false, set true;
set role staff_step_up_receipt_data_authority;
grant select on table admin_internal.staff_step_up_receipt_uses to staff_management_read_authority;
grant select on table admin_internal.staff_security_notification_outbox to staff_management_read_authority;
create policy staff_management_read_authority_receipt_uses_select
  on admin_internal.staff_step_up_receipt_uses
  for select to staff_management_read_authority using (true);
create policy staff_management_read_authority_outbox_select
  on admin_internal.staff_security_notification_outbox
  for select to staff_management_read_authority using (true);
reset role;
revoke staff_step_up_receipt_data_authority from postgres granted by postgres;

create function public.staff_management_receipt_use_log_v1(
  requested_limit integer default 100
)
returns table (
  use_id uuid,
  actor_auth_user_id uuid,
  actor_staff_account_id uuid,
  target_auth_user_id uuid,
  target_staff_account_id uuid,
  operation_kind text,
  permission_key text,
  reason_code text,
  request_id uuid,
  step_up_method text,
  used_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    entry.use_id, entry.actor_auth_user_id, entry.actor_staff_account_id,
    entry.target_auth_user_id, entry.target_staff_account_id, entry.operation_kind,
    entry.permission_key, entry.reason_code, entry.request_id, entry.step_up_method,
    entry.used_at
  from admin_internal.staff_step_up_receipt_uses entry
  where public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin_audit.read')
  order by entry.used_at desc, entry.use_id desc
  limit least(greatest(coalesce(requested_limit, 100), 1), 500);
$$;

comment on function public.staff_management_receipt_use_log_v1(integer) is
  'P3J read-only P3H Step-Up receipt-use evidence log (who, target, operation, permission, reason, when). Requires exact effective admin_context.read and admin_audit.read; returns zero rows for any other caller. Never exposes the receipt secret or proof hash.';

create function public.staff_management_security_outbox_v1(
  requested_limit integer default 100
)
returns table (
  notification_id uuid,
  actor_auth_user_id uuid,
  target_auth_user_id uuid,
  target_staff_account_id uuid,
  event_type text,
  priority text,
  permission_key text,
  reason_code text,
  request_id uuid,
  created_at timestamptz,
  dispatched_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'on'
as $$
  select
    entry.notification_id, entry.actor_auth_user_id, entry.target_auth_user_id,
    entry.target_staff_account_id, entry.event_type, entry.priority,
    entry.permission_key, entry.reason_code, entry.request_id,
    entry.created_at, entry.dispatched_at
  from admin_internal.staff_security_notification_outbox entry
  where public.staff_has_permission_v1('admin_context.read')
    and public.staff_has_permission_v1('admin_audit.read')
  order by entry.created_at desc, entry.notification_id desc
  limit least(greatest(coalesce(requested_limit, 100), 1), 500);
$$;

comment on function public.staff_management_security_outbox_v1(integer) is
  'P3J read-only P3H security notification outbox (new_permission_manager and similar events, with priority). Requires exact effective admin_context.read and admin_audit.read; returns zero rows for any other caller.';

-- Settle every function ACL before ownership transfers. PUBLIC EXECUTE is never retained.
revoke all on function public.staff_management_receipt_use_log_v1(integer)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function public.staff_management_security_outbox_v1(integer)
  from public, anon, authenticated, authenticator, service_role;

grant execute on function public.staff_management_receipt_use_log_v1(integer) to authenticated;
grant execute on function public.staff_management_security_outbox_v1(integer) to authenticated;

grant staff_management_read_authority to postgres with admin false, inherit false, set true;
alter function public.staff_management_receipt_use_log_v1(integer)
  owner to staff_management_read_authority;
alter function public.staff_management_security_outbox_v1(integer)
  owner to staff_management_read_authority;
revoke staff_management_read_authority from postgres granted by postgres;

revoke create on schema public from staff_management_read_authority;

commit;
