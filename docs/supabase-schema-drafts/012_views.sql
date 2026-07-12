-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create view published_branch_menu_items as
select distinct
  bmi.id as branch_menu_item_id,
  r.id as restaurant_id,
  b.id as branch_id,
  m.id as menu_item_id,
  coalesce(bmi.branch_specific_name, m.name) as display_name,
  coalesce(bmi.branch_specific_description, m.description) as display_description,
  bmi.price,
  bmi.availability,
  bmi.sold_out,
  bmi.branch_specific_status,
  m.tag_ids,
  m.allergens,
  m.badge_enabled,
  m.nutrition_badge_status
from branch_menu_items bmi
join restaurants r on r.id = bmi.restaurant_id
join restaurant_branches b on b.id = bmi.branch_id
join menu_items m on m.id = bmi.menu_item_id
join menu_category_items mci on mci.menu_item_id = m.id
join menu_categories mc on mc.id = mci.menu_category_id
join menus menu on menu.id = mc.menu_id
where r.status = 'active'
  and b.status = 'active'
  and menu.status = 'published'
  and m.status = 'active'
  and bmi.branch_specific_status = 'available'
  and r.deleted_at is null;

create view current_menu_item_nutrition as
select *
from menu_item_nutrition
where is_current;

create materialized view restaurant_exposure_summary as
select
  restaurant_id,
  source,
  date_trunc('day', occurred_at) as bucket_day,
  count(*) as event_count,
  sum(coalesce((metadata->>'count')::numeric, 1)) as exposure_count
from analytics_events
where restaurant_id is not null
group by restaurant_id, source, date_trunc('day', occurred_at);

create materialized view nutrition_badge_performance as
select
  menu_item_id,
  metadata->>'period' as period,
  count(*) filter (where event_type = 'menu_item_view') as view_events,
  count(*) filter (where event_type = 'menu_item_favorite') as favorite_events,
  count(*) filter (where event_type = 'menu_item_add_to_cart') as cart_events
from analytics_events
where menu_item_id is not null
group by menu_item_id, metadata->>'period';

create materialized view menu_item_performance as
select
  restaurant_id,
  branch_id,
  menu_item_id,
  date_trunc('day', occurred_at) as bucket_day,
  count(*) as event_count
from analytics_events
where menu_item_id is not null
group by restaurant_id, branch_id, menu_item_id, date_trunc('day', occurred_at);

create view unresolved_pending_menu_items as
select *
from pending_menu_items
where status in ('pending', 'needs_more_information');

create view restaurant_staff_access_scope as
select
  ru.id as restaurant_user_id,
  ru.auth_user_id,
  rm.restaurant_id,
  era.branch_id,
  rr.role_key,
  era.scope
from restaurant_users ru
join restaurant_memberships rm on rm.restaurant_user_id = ru.id and rm.status = 'active'
join restaurant_roles rr on rr.id = rm.role_id
left join restaurant_employees e on e.id = ru.employee_id
left join employee_role_assignments era on era.employee_id = e.id and era.ended_at is null;

create view analytics_event_quality_issues as
select
  ae.id as analytics_event_id,
  ae.event_type,
  case
    when ae.event_type like 'recommendation_%' and ae.recommendation_id is null then 'MISSING_RECOMMENDATION_ID'
    when ae.event_type like 'menu_item_%' and ae.menu_item_id is null then 'MISSING_MENU_ITEM_ID'
    when ae.restaurant_id is null then 'MISSING_RESTAURANT_ID'
    else null
  end as issue_code
from analytics_events ae
where
  (ae.event_type like 'recommendation_%' and ae.recommendation_id is null)
  or (ae.event_type like 'menu_item_%' and ae.menu_item_id is null)
  or ae.restaurant_id is null;
