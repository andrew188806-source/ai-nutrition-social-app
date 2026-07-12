-- Consumer Schema Phase 1.3 formal migration 009.
-- Promoted from docs/supabase-consumer-schema-drafts/009_recommendation_feedback.sql.
-- No seed, fixture, Auth user, remote execution, or production credential is included.

create table recommendation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_surface text not null,
  context_snapshot jsonb not null default '{}'::jsonb,
  model_version text,
  schema_version text not null default 'consumer-recommendation-v1',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_session_id uuid not null references recommendation_sessions(id) on delete cascade,
  recommendation_id text,
  restaurant_id text,
  branch_id text,
  menu_item_id text,
  action recommendation_feedback_action not null,
  shown_at timestamptz,
  clicked_at timestamptz,
  accepted_at timestamptz,
  dismissed_at timestamptz,
  saved_at timestamptz,
  consumed_at timestamptz,
  rating numeric,
  feedback text,
  reason text,
  source_surface text not null,
  event_idempotency_key text not null,
  schema_version text not null default 'consumer-recommendation-feedback-v1',
  created_at timestamptz not null default now(),
  constraint recommendation_feedback_rating_range check (rating is null or (rating >= 0 and rating <= 5)),
  constraint recommendation_feedback_entity_present check (restaurant_id is not null or menu_item_id is not null or recommendation_id is not null)
);
