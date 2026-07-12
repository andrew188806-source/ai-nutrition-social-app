-- DRAFT ONLY - Supabase schema mapping preparation.
-- Read-only validation queries aligned with scripts/audit-canonical-data.mjs checks.

-- Orphan branch references.
select b.id, b.restaurant_id
from restaurant_branches b
left join restaurants r on r.id = b.restaurant_id
where r.id is null;

-- Orphan menu-item references.
select mi.id, mi.restaurant_id
from menu_items mi
left join restaurants r on r.id = mi.restaurant_id
where r.id is null;

-- Duplicate canonical menu items within a restaurant by normalized name.
select restaurant_id, lower(trim(name)) as normalized_name, count(*)
from menu_items
where deleted_at is null
group by restaurant_id, lower(trim(name))
having count(*) > 1;

-- Duplicate aliases within active resolution scope.
select restaurant_id, branch_id, normalized_alias_name, count(*)
from menu_item_aliases
where status in ('pending', 'approved')
group by restaurant_id, branch_id, normalized_alias_name
having count(*) > 1;

-- Aliases pointing to missing menu items.
select a.id, a.menu_item_id
from menu_item_aliases a
left join menu_items mi on mi.id = a.menu_item_id
where mi.id is null;

-- Branch menu items pointing to missing branches or menu items.
select bmi.id, bmi.branch_id, bmi.menu_item_id
from branch_menu_items bmi
left join restaurant_branches b on b.id = bmi.branch_id
left join menu_items mi on mi.id = bmi.menu_item_id
where b.id is null or mi.id is null;

-- Multiple current official nutrition rows.
select menu_item_id, count(*)
from menu_item_nutrition
where is_current
group by menu_item_id
having count(*) > 1;

-- Invalid analytics event references.
select ae.id, ae.event_type, ae.restaurant_id, ae.branch_id, ae.menu_id, ae.menu_item_id, ae.recommendation_id
from analytics_events ae
left join restaurants r on r.id = ae.restaurant_id
left join restaurant_branches b on b.id = ae.branch_id
left join menus m on m.id = ae.menu_id
left join menu_items mi on mi.id = ae.menu_item_id
left join recommendation_results rr on rr.id = ae.recommendation_id
where (ae.restaurant_id is not null and r.id is null)
   or (ae.branch_id is not null and b.id is null)
   or (ae.menu_id is not null and m.id is null)
   or (ae.menu_item_id is not null and mi.id is null)
   or (ae.recommendation_id is not null and rr.id is null);

-- Missing analytics actor context.
select id, event_type, user_id, anonymous_id, source
from analytics_events
where user_id is null and anonymous_id is null and source <> 'admin';

-- Duplicate event idempotency keys.
select event_idempotency_key, count(*)
from analytics_events
where event_idempotency_key is not null
group by event_idempotency_key
having count(*) > 1;

-- Invalid recommendation references.
select rr.id, rr.restaurant_id, rr.branch_id, rr.menu_item_id
from recommendation_results rr
left join restaurants r on r.id = rr.restaurant_id
left join restaurant_branches b on b.id = rr.branch_id
left join menu_items mi on mi.id = rr.menu_item_id
where r.id is null or b.id is null or mi.id is null;

-- Pending items with invalid restaurant or branch IDs.
select p.id, p.restaurant_id, p.branch_id
from pending_menu_items p
left join restaurants r on r.id = p.restaurant_id
left join restaurant_branches b on b.id = p.branch_id
where r.id is null or (p.branch_id is not null and b.id is null);

-- Employees with invalid assignments.
select eba.id, eba.employee_id, eba.branch_id
from employee_branch_assignments eba
left join restaurant_employees e on e.id = eba.employee_id
left join restaurant_branches b on b.id = eba.branch_id
where e.id is null or b.id is null;

-- Memberships exceeding expected scope: branch role without branch assignment.
select era.id, era.employee_id, era.scope, era.branch_id
from employee_role_assignments era
where era.scope = 'branch' and era.branch_id is null;
