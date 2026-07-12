-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 001: enums and helpers.
-- Requires human DB/security review before execution.

create type consumer_profile_status as enum ('active', 'disabled', 'deletion_requested', 'anonymizing', 'anonymized', 'deleted');
create type profile_visibility as enum ('private', 'friends', 'public');
create type meal_source_type as enum ('restaurant', 'self_made', 'manual', 'ai_estimated');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'late_night', 'snack', 'other');
create type nutrition_source_type as enum ('restaurant_verified', 'admin_verified', 'ai_estimated', 'user_corrected', 'manual');
create type meal_correction_status as enum ('none', 'pending', 'confirmed', 'rejected');
create type consumption_completion_status as enum ('finished', 'partial', 'not_eaten');
create type planned_meal_status as enum ('planned', 'converted', 'cancelled', 'expired');
create type favorite_entity_type as enum ('restaurant', 'menu_item');
create type recommendation_feedback_action as enum ('shown', 'clicked', 'accepted', 'dismissed', 'saved', 'consumed');
create type consumer_privacy_classification as enum ('public', 'consumer_private', 'sensitive_preference', 'health_nutrition', 'internal_operational', 'aggregated_deidentified');
create type consumer_import_status as enum ('pending', 'imported', 'skipped', 'failed', 'rolled_back');
create type entitlement_status as enum ('active', 'expired', 'cancelled', 'grace_period');

create or replace function consumer_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;