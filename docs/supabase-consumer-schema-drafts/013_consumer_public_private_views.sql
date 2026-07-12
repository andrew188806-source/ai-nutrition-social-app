-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 013: public-safe and aggregate/de-identified views.
-- Requires human DB/security review before execution.

create view consumer_public_profiles as
select
  profile_id,
  display_name,
  anonymous_display_name,
  mascot_avatar_key,
  case when visibility = 'public' then real_avatar_url else null end as real_avatar_url,
  public_bio,
  diet_summary,
  recent_meal_style,
  nutrition_goal_summary,
  willing_to_chat,
  verification_status,
  locale,
  timezone,
  updated_at
from consumer_profiles
where status = 'active' and deleted_at is null;

create view consumer_meal_record_owner_view as
select
  mr.id,
  mr.user_id,
  mr.meal_type,
  mr.occurred_at,
  mr.meal_date,
  mr.timezone,
  mr.title,
  mr.source,
  count(mri.id) as item_count,
  mr.created_at,
  mr.updated_at
from meal_records mr
left join meal_record_items mri on mri.meal_record_id = mr.id
where mr.deleted_at is null
group by mr.id;

create view restaurant_consumer_aggregate_metrics as
select
  restaurant_id,
  menu_item_id,
  count(distinct user_id) as consumer_count,
  count(*) as feedback_count,
  avg(rating) as average_rating,
  max(created_at) as latest_feedback_at
from recommendation_feedback
where restaurant_id is not null
group by restaurant_id, menu_item_id
having count(distinct user_id) >= 10;