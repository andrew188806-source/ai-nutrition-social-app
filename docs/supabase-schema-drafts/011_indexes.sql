-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create index restaurants_status_idx on restaurants(status) where deleted_at is null;
create index branches_restaurant_status_idx on restaurant_branches(restaurant_id, status) where deleted_at is null;
create index menus_restaurant_status_idx on menus(restaurant_id, status) where deleted_at is null;
create index menu_categories_menu_sort_idx on menu_categories(menu_id, sort_order) where deleted_at is null;
create index menu_items_restaurant_status_idx on menu_items(restaurant_id, status) where deleted_at is null;
create index menu_category_items_category_sort_idx on menu_category_items(menu_category_id, sort_order);
create index branch_menu_items_branch_availability_idx on branch_menu_items(branch_id, availability, sold_out);
create index branch_menu_items_menu_item_idx on branch_menu_items(menu_item_id);
create index menu_item_aliases_normalized_idx on menu_item_aliases(restaurant_id, normalized_alias_name, status);
create index pending_menu_items_restaurant_status_idx on pending_menu_items(restaurant_id, status, last_seen_at desc);
create index menu_item_nutrition_menu_status_idx on menu_item_nutrition(menu_item_id, verified_status) where is_current;
create index nutrition_estimates_menu_item_created_idx on nutrition_estimates(menu_item_id, created_at desc);
create index nutrition_reviews_status_idx on nutrition_reviews(status, created_at);
create index recommendation_results_user_created_idx on recommendation_results(user_id, generated_at desc);
create index recommendation_results_item_idx on recommendation_results(menu_item_id, branch_id);
create index analytics_events_occurred_idx on analytics_events(occurred_at desc);
create index analytics_events_restaurant_time_idx on analytics_events(restaurant_id, occurred_at desc);
create index analytics_events_item_time_idx on analytics_events(menu_item_id, occurred_at desc) where menu_item_id is not null;
create index analytics_events_menu_time_idx on analytics_events(menu_id, occurred_at desc) where menu_id is not null;
create index analytics_events_recommendation_idx on analytics_events(recommendation_id) where recommendation_id is not null;
create index analytics_events_session_time_idx on analytics_events(session_id, occurred_at desc) where session_id is not null;
create index restaurant_users_auth_user_idx on restaurant_users(auth_user_id) where auth_user_id is not null;
create index memberships_user_restaurant_idx on restaurant_memberships(restaurant_user_id, restaurant_id);
create index employee_assignments_branch_idx on employee_branch_assignments(branch_id, effective_date);
create index audit_logs_target_idx on audit_logs(target_type, target_id, created_at desc);
create index admin_action_drafts_status_idx on admin_action_drafts(status, created_at);
