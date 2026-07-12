-- DRAFT ONLY - Supabase schema mapping preparation.
-- RLS policies are pseudocode-quality SQL drafts and require security review before use.

alter table restaurants enable row level security;
alter table restaurant_branches enable row level security;
alter table menus enable row level security;
alter table menu_items enable row level security;
alter table branch_menu_items enable row level security;
alter table menu_item_nutrition enable row level security;
alter table analytics_events enable row level security;
alter table pending_menu_items enable row level security;
alter table restaurant_users enable row level security;
alter table restaurant_employees enable row level security;
alter table admin_action_drafts enable row level security;
alter table audit_logs enable row level security;

-- Helper draft. Production should harden this with SECURITY DEFINER and search_path review.
create or replace function public.has_restaurant_scope(target_restaurant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from restaurant_users ru
    join restaurant_memberships rm on rm.restaurant_user_id = ru.id
    where ru.auth_user_id = auth.uid()
      and rm.restaurant_id = target_restaurant_id
      and rm.status = 'active'
      and ru.login_status = 'enabled'
  );
$$;

create or replace function public.has_branch_scope(target_branch_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from restaurant_users ru
    join restaurant_employees e on e.id = ru.employee_id
    join employee_branch_assignments eba on eba.employee_id = e.id
    where ru.auth_user_id = auth.uid()
      and eba.branch_id = target_branch_id
      and eba.ended_at is null
      and ru.login_status = 'enabled'
  );
$$;

-- Mobile consumers may read approved public restaurant data.
create policy consumer_read_active_restaurants on restaurants
  for select using (status = 'active' and deleted_at is null);

create policy consumer_read_active_branches on restaurant_branches
  for select using (status = 'active' and deleted_at is null);

create policy consumer_read_active_menu_items on menu_items
  for select using (status = 'active' and deleted_at is null);

create policy consumer_read_available_branch_menu_items on branch_menu_items
  for select using (availability in ('available', 'limited') and sold_out = false and branch_specific_status = 'available');

create policy consumer_read_approved_nutrition on menu_item_nutrition
  for select using (is_current = true and verified_status = 'verified');

-- Mobile consumers can create unresolved menu-item input directly only if product/security review allows it.
-- Production analytics ingestion should use an RPC, Edge Function, or ingestion service that validates
-- schema_version, idempotency, actor context, and entity references before inserting analytics_events.
-- Do not promote a direct consumer_insert_analytics policy without security review.

create policy consumer_insert_pending_menu_items on pending_menu_items
  for insert with check (auth.uid() is not null);

-- Restaurant users can manage scoped restaurant/branch data through allowed roles.
create policy restaurant_user_read_own_restaurant on restaurants
  for select using (has_restaurant_scope(id));

create policy restaurant_user_update_own_restaurant on restaurants
  for update using (has_restaurant_scope(id)) with check (has_restaurant_scope(id));

create policy restaurant_user_manage_branch_menu_items on branch_menu_items
  for all using (has_restaurant_scope(restaurant_id) or has_branch_scope(branch_id))
  with check (has_restaurant_scope(restaurant_id) or has_branch_scope(branch_id));

create policy restaurant_user_read_staff_scope on restaurant_employees
  for select using (has_restaurant_scope(restaurant_id));

-- Admin/platform policies should be tied to platform roles, not ordinary restaurant roles.
-- Replace the metadata check with a production reviewed admin claim strategy.
create policy platform_admin_all_admin_drafts on admin_action_drafts
  for all using ((auth.jwt() ->> 'app_role') in ('platform_admin', 'platform_reviewer'))
  with check ((auth.jwt() ->> 'app_role') in ('platform_admin', 'platform_reviewer'));

create policy platform_admin_read_audit_logs on audit_logs
  for select using ((auth.jwt() ->> 'app_role') in ('platform_admin', 'platform_reviewer', 'governance_auditor'));

-- Service role bypasses RLS in Supabase; use it only for trusted imports, scheduled jobs,
-- analytics aggregation, and migration backfills.
