-- DRAFT ONLY - NOT AN ACTIVE MIGRATION - DO NOT APPLY TO PRODUCTION
-- Consumer schema draft 008: ratings and favorites.
-- Requires human DB/security review before execution.

create table user_restaurant_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id text not null,
  meal_record_id uuid references meal_records(id) on delete set null,
  private_rating numeric not null,
  taste_feeling text,
  portion_feeling text,
  price_feeling text,
  repurchase_intent text,
  visibility text not null default 'private',
  is_current boolean not null default true,
  rated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_restaurant_ratings_rating_range check (private_rating >= 0 and private_rating <= 5)
);

create table user_menu_item_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id text not null,
  branch_id text,
  menu_item_id text not null,
  meal_record_item_id uuid references meal_record_items(id) on delete set null,
  private_rating numeric not null,
  finished boolean,
  dislike_reasons text[] not null default '{}',
  taste_feeling text,
  portion_feeling text,
  price_feeling text,
  repurchase_intent text,
  visibility text not null default 'private',
  is_current boolean not null default true,
  rated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_menu_item_ratings_rating_range check (private_rating >= 0 and private_rating <= 5)
);

create table favorite_restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id text not null,
  collection_label text,
  sort_order integer,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create table favorite_menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id text not null,
  menu_item_id text not null,
  collection_label text,
  sort_order integer,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);