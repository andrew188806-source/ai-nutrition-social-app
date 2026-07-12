-- Consumer Schema Phase 1.3 formal migration 014.
-- Promoted from docs/supabase-consumer-schema-drafts/014_consumer_rls_policy_drafts.sql.
-- No seed, fixture, Auth user, remote execution, or production credential is included.

alter table consumer_profiles enable row level security;
alter table consumer_private_profiles enable row level security;
alter table consumer_preferences enable row level security;
alter table taste_profiles enable row level security;
alter table dietary_restrictions enable row level security;
alter table nutrition_goals enable row level security;
alter table subscription_entitlements enable row level security;
alter table meal_records enable row level security;
alter table meal_record_items enable row level security;
alter table meal_analyses enable row level security;
alter table meal_corrections enable row level security;
alter table meal_consumption_adjustments enable row level security;
alter table meal_sharing_allocations enable row level security;
alter table planned_meals enable row level security;
alter table daily_nutrition_summaries enable row level security;
alter table user_restaurant_ratings enable row level security;
alter table user_menu_item_ratings enable row level security;
alter table favorite_restaurants enable row level security;
alter table favorite_menu_items enable row level security;
alter table recommendation_sessions enable row level security;
alter table recommendation_feedback enable row level security;
alter table consumer_data_consents enable row level security;
alter table consumer_data_deletion_requests enable row level security;
alter table consumer_data_change_logs enable row level security;
alter table legacy_consumer_entity_mappings enable row level security;

create policy consumer_profiles_owner_read on consumer_profiles for select using (auth.uid() = user_id);
create policy consumer_profiles_owner_update on consumer_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy consumer_private_profiles_owner_all on consumer_private_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy consumer_preferences_owner_all on consumer_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy taste_profiles_owner_all on taste_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy dietary_restrictions_owner_all on dietary_restrictions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy nutrition_goals_owner_all on nutrition_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy subscription_entitlements_owner_read on subscription_entitlements for select using (auth.uid() = user_id);
create policy meal_records_owner_all on meal_records for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meal_record_items_owner_all on meal_record_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meal_analyses_owner_all on meal_analyses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meal_corrections_owner_all on meal_corrections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meal_consumption_owner_all on meal_consumption_adjustments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meal_sharing_owner_all on meal_sharing_allocations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy planned_meals_owner_all on planned_meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy daily_summaries_owner_read on daily_nutrition_summaries for select using (auth.uid() = user_id);
create policy ratings_owner_all on user_restaurant_ratings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy menu_item_ratings_owner_all on user_menu_item_ratings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy favorite_restaurants_owner_all on favorite_restaurants for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy favorite_menu_items_owner_all on favorite_menu_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy recommendation_sessions_owner_all on recommendation_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy recommendation_feedback_owner_all on recommendation_feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy consumer_data_consents_owner_read on consumer_data_consents for select using (auth.uid() = user_id);
create policy deletion_requests_owner_insert on consumer_data_deletion_requests for insert with check (auth.uid() = user_id);
