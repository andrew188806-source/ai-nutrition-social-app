-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 012: indexes and uniqueness constraints.
-- Requires human DB/security review before execution.

create index consumer_profiles_user_id_idx on consumer_profiles(user_id);
create index consumer_profiles_status_idx on consumer_profiles(status);
create index subscription_entitlements_user_idx on subscription_entitlements(user_id, status, valid_until);
create index meal_records_user_occurred_idx on meal_records(user_id, occurred_at desc);
create index meal_records_user_date_idx on meal_records(user_id, meal_date desc);
create index meal_record_items_meal_record_idx on meal_record_items(meal_record_id);
create index meal_record_items_restaurant_idx on meal_record_items(restaurant_id);
create index meal_record_items_menu_item_idx on meal_record_items(menu_item_id);
create index meal_analyses_user_meal_idx on meal_analyses(user_id, meal_record_id);
create index meal_corrections_analysis_idx on meal_corrections(meal_analysis_id);
create index meal_consumption_adjustments_meal_idx on meal_consumption_adjustments(meal_record_id);
create index meal_sharing_allocations_user_group_idx on meal_sharing_allocations(user_id, group_table_id);
create index planned_meals_user_date_idx on planned_meals(user_id, planned_for, meal_type);
create unique index planned_meals_conversion_idempotency_idx on planned_meals(user_id, conversion_idempotency_key) where conversion_idempotency_key is not null;
create unique index daily_nutrition_summaries_one_current on daily_nutrition_summaries(user_id, local_date, timezone, calculation_version) where is_current = true;
create unique index nutrition_goals_one_active_per_user on nutrition_goals(user_id) where is_active = true;
create unique index user_restaurant_ratings_one_current on user_restaurant_ratings(user_id, restaurant_id) where is_current = true;
create unique index user_menu_item_ratings_one_current on user_menu_item_ratings(user_id, menu_item_id) where is_current = true;
create unique index favorite_restaurants_one_active on favorite_restaurants(user_id, restaurant_id) where removed_at is null;
create unique index favorite_menu_items_one_active on favorite_menu_items(user_id, menu_item_id) where removed_at is null;
create index recommendation_sessions_user_started_idx on recommendation_sessions(user_id, started_at desc);
create unique index recommendation_feedback_idempotency_idx on recommendation_feedback(user_id, event_idempotency_key);
create index recommendation_feedback_restaurant_idx on recommendation_feedback(restaurant_id, created_at desc);
create index recommendation_feedback_menu_item_idx on recommendation_feedback(menu_item_id, created_at desc);
create index consumer_data_consents_user_idx on consumer_data_consents(user_id);
create index consumer_data_deletion_requests_user_idx on consumer_data_deletion_requests(user_id, request_status);
create index consumer_data_change_logs_user_idx on consumer_data_change_logs(user_id, created_at desc);
create index legacy_consumer_entity_mappings_canonical_idx on legacy_consumer_entity_mappings(canonical_uuid);