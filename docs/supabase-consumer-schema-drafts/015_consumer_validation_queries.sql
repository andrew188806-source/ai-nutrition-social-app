-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 015: review-only validation queries.
-- Requires human DB/security review before execution.

-- orphan private profiles
select cpp.id from consumer_private_profiles cpp left join consumer_profiles cp on cp.profile_id = cpp.profile_id where cp.id is null;

-- orphan meal record items
select mri.id from meal_record_items mri left join meal_records mr on mr.id = mri.meal_record_id where mr.id is null;

-- user ownership mismatch between meal record and items
select mri.id from meal_record_items mri join meal_records mr on mr.id = mri.meal_record_id where mri.user_id <> mr.user_id;

-- invalid consumed ratio
select id from meal_record_items where consumed_ratio < 0 or consumed_ratio > 1;

-- invalid consumption adjustment ratio
select id from meal_consumption_adjustments where completion_ratio < 0 or completion_ratio > 1;

-- invalid sharing allocations
select id from meal_sharing_allocations where participant_count <= 0 or allocation_ratio < 0 or allocation_ratio > 1;

-- duplicate planned meal conversions by idempotency key
select user_id, conversion_idempotency_key, count(*) from planned_meals where conversion_idempotency_key is not null group by user_id, conversion_idempotency_key having count(*) > 1;

-- converted planned meals missing target meal record
select id from planned_meals where status = 'converted' and converted_meal_record_id is null;

-- duplicate current daily summaries
select user_id, local_date, timezone, calculation_version, count(*) from daily_nutrition_summaries where is_current = true group by user_id, local_date, timezone, calculation_version having count(*) > 1;

-- duplicate current restaurant ratings
select user_id, restaurant_id, count(*) from user_restaurant_ratings where is_current = true group by user_id, restaurant_id having count(*) > 1;

-- duplicate current menu item ratings
select user_id, menu_item_id, count(*) from user_menu_item_ratings where is_current = true group by user_id, menu_item_id having count(*) > 1;

-- duplicate active restaurant favorites
select user_id, restaurant_id, count(*) from favorite_restaurants where removed_at is null group by user_id, restaurant_id having count(*) > 1;

-- duplicate active menu item favorites
select user_id, menu_item_id, count(*) from favorite_menu_items where removed_at is null group by user_id, menu_item_id having count(*) > 1;

-- recommendation feedback without session
select rf.id from recommendation_feedback rf left join recommendation_sessions rs on rs.id = rf.recommendation_session_id where rs.id is null;

-- recommendation session ownership mismatch
select rf.id from recommendation_feedback rf join recommendation_sessions rs on rs.id = rf.recommendation_session_id where rf.user_id <> rs.user_id;

-- public profile view should not expose private profile table columns
select column_name from information_schema.columns where table_name = 'consumer_public_profiles' and column_name in ('birthdate', 'health_notes', 'private_diet_notes', 'medical_sensitivity_notes');

-- aggregate view privacy threshold
select * from restaurant_consumer_aggregate_metrics where consumer_count < 10;

-- duplicate legacy mappings
select entity_type, legacy_id, source_dataset_version, count(*) from legacy_consumer_entity_mappings group by entity_type, legacy_id, source_dataset_version having count(*) > 1;

-- deleted profiles with remaining private rows require anonymization/deletion review
select cp.profile_id from consumer_profiles cp join consumer_private_profiles cpp on cpp.profile_id = cp.profile_id where cp.status in ('deleted', 'anonymized') and cpp.anonymized_at is null;