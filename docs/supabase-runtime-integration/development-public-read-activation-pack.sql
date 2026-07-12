-- TastKind / Haocu Supabase Runtime Integration Phase 1C
-- DEVELOPMENT ONLY public-read activation pack.
-- Do NOT run against production or shared databases.
-- This file is not an active migration and is not schema authority.
-- Source context: docs/supabase-schema-drafts/001-015 frozen candidate.

begin;

create extension if not exists pgcrypto;

create table if not exists public.restaurants (
  id text primary key,
  name text not null,
  legal_name text,
  city text,
  category text,
  tags text[] not null default '{}',
  plan text not null default 'demo',
  status text not null check (status in ('active', 'paused', 'draft', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_branches (
  id text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  name text not null,
  district text,
  address text,
  status text not null check (status in ('active', 'inactive', 'temporary_closed', 'archived')),
  is_active boolean generated always as (status = 'active') stored
);

create table if not exists public.menus (
  id text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  name text not null,
  status text not null check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.menu_categories (
  id text primary key,
  menu_id text not null references public.menus(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists public.menu_items (
  id text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  menu_category_id text not null references public.menu_categories(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  tag_ids text[] not null default '{}',
  allergens text[] not null default '{}',
  status text not null check (status in ('draft', 'active', 'archived')),
  nutrition_id text,
  nutrition_badge_status text not null default 'missing' check (nutrition_badge_status in ('approved', 'ai_estimated', 'pending_review', 'missing')),
  badge_enabled boolean not null default false
);

create table if not exists public.branch_menu_items (
  id text primary key,
  restaurant_id text not null references public.restaurants(id) on delete cascade,
  branch_id text not null references public.restaurant_branches(id) on delete cascade,
  menu_item_id text not null references public.menu_items(id) on delete cascade,
  price numeric(10,2) not null,
  availability text not null check (availability in ('available', 'limited', 'unavailable')),
  sold_out boolean not null default false,
  branch_specific_name text,
  branch_specific_description text,
  branch_specific_status text not null default 'available' check (branch_specific_status in ('available', 'hidden', 'discontinued')),
  unique (branch_id, menu_item_id)
);

create table if not exists public.menu_item_nutrition (
  id text primary key,
  menu_item_id text not null references public.menu_items(id) on delete cascade,
  calories numeric,
  protein numeric,
  carbohydrates numeric,
  fat numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,
  saturated_fat numeric,
  serving_size text,
  source text not null check (source in ('restaurant_verified', 'admin_verified', 'ai_estimated', 'pending')),
  confidence_score numeric not null default 0,
  verified_status text not null check (verified_status in ('verified', 'ai_estimated', 'pending_review', 'rejected')),
  is_current boolean not null default false,
  updated_at timestamptz not null default now()
);

create unique index if not exists menu_item_nutrition_one_current
  on public.menu_item_nutrition(menu_item_id)
  where is_current = true and verified_status in ('verified', 'ai_estimated');

create or replace view public.current_published_menu_item_nutrition as
select
  n.id,
  i.restaurant_id,
  n.menu_item_id,
  n.calories,
  n.protein,
  n.carbohydrates,
  n.fat,
  n.fiber,
  n.sugar,
  n.sodium,
  n.saturated_fat,
  n.serving_size,
  n.source,
  n.confidence_score,
  n.verified_status,
  n.updated_at
from public.menu_item_nutrition n
join public.menu_items i on i.id = n.menu_item_id
join public.restaurants r on r.id = i.restaurant_id
where n.is_current = true
  and n.verified_status in ('verified', 'ai_estimated')
  and i.status = 'active'
  and r.status = 'active';

create or replace view public.restaurant_public_view as
select * from public.restaurants where status = 'active';

create or replace view public.published_menus_view as
select * from public.menus where status = 'published';

create or replace view public.published_branch_menu_items_view as
select bmi.*
from public.branch_menu_items bmi
join public.restaurant_branches b on b.id = bmi.branch_id
join public.menu_items i on i.id = bmi.menu_item_id
where b.status = 'active'
  and i.status = 'active'
  and bmi.availability in ('available', 'limited')
  and bmi.branch_specific_status = 'available'
  and bmi.sold_out = false;

insert into public.restaurants (id, name, legal_name, city, category, tags, plan, status) values
  ('dev-restaurant-haochu', '好廚健康碗 Development', '好廚健康碗開發店', '台北市', '健康餐盒', array['高蛋白', '營養標示'], 'demo', 'active'),
  ('dev-restaurant-hidden', '開發隱藏店', '開發隱藏店', '台北市', '內部測試', array['internal'], 'demo', 'draft')
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.restaurant_branches (id, restaurant_id, name, district, address, status) values
  ('dev-branch-nanjing', 'dev-restaurant-haochu', '南京復興店', '松山區', '南京東路三段 100 號', 'active'),
  ('dev-branch-xinyi', 'dev-restaurant-haochu', '信義安和店', '大安區', '信義路四段 200 號', 'active')
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.menus (id, restaurant_id, name, status) values
  ('dev-menu-main', 'dev-restaurant-haochu', '開發主菜單', 'published'),
  ('dev-menu-draft', 'dev-restaurant-haochu', '草稿菜單', 'draft')
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.menu_categories (id, menu_id, name, sort_order) values
  ('dev-category-protein', 'dev-menu-main', '高蛋白主餐', 1),
  ('dev-category-plant', 'dev-menu-main', '蔬食纖維', 2)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.menu_items (id, restaurant_id, menu_category_id, name, description, tag_ids, allergens, status, nutrition_id, nutrition_badge_status, badge_enabled) values
  ('dev-item-chicken', 'dev-restaurant-haochu', 'dev-category-protein', '舒肥雞胸藜麥碗', '舒肥雞胸搭配藜麥與時蔬。', array['高蛋白'], array[]::text[], 'active', 'dev-nutrition-chicken', 'approved', true),
  ('dev-item-salmon', 'dev-restaurant-haochu', 'dev-category-protein', '鮭魚酪梨糙米碗', '烤鮭魚、酪梨與糙米。', array['Omega3'], array['fish'], 'active', 'dev-nutrition-salmon', 'approved', true),
  ('dev-item-tofu', 'dev-restaurant-haochu', 'dev-category-plant', '豆腐彩蔬能量碗', '板豆腐與多色蔬菜。', array['蔬食'], array['soy'], 'active', 'dev-nutrition-tofu', 'ai_estimated', true),
  ('dev-item-draft', 'dev-restaurant-haochu', 'dev-category-plant', '內部草稿餐點', '不應出現在公開讀取。', array['internal'], array[]::text[], 'draft', null, 'missing', false)
on conflict (id) do update set name = excluded.name, status = excluded.status;

insert into public.branch_menu_items (id, restaurant_id, branch_id, menu_item_id, price, availability, sold_out, branch_specific_status) values
  ('dev-bmi-chicken-nanjing', 'dev-restaurant-haochu', 'dev-branch-nanjing', 'dev-item-chicken', 168, 'available', false, 'available'),
  ('dev-bmi-salmon-nanjing', 'dev-restaurant-haochu', 'dev-branch-nanjing', 'dev-item-salmon', 228, 'limited', false, 'available'),
  ('dev-bmi-tofu-xinyi', 'dev-restaurant-haochu', 'dev-branch-xinyi', 'dev-item-tofu', 148, 'available', false, 'available'),
  ('dev-bmi-draft-xinyi', 'dev-restaurant-haochu', 'dev-branch-xinyi', 'dev-item-draft', 199, 'available', false, 'hidden')
on conflict (id) do update set price = excluded.price, availability = excluded.availability, branch_specific_status = excluded.branch_specific_status;

insert into public.menu_item_nutrition (id, menu_item_id, calories, protein, carbohydrates, fat, fiber, serving_size, source, confidence_score, verified_status, is_current) values
  ('dev-nutrition-chicken', 'dev-item-chicken', 520, 42, 48, 14, 8, '1 bowl', 'restaurant_verified', 0.96, 'verified', true),
  ('dev-nutrition-salmon', 'dev-item-salmon', 610, 36, 52, 24, 7, '1 bowl', 'restaurant_verified', 0.94, 'verified', true),
  ('dev-nutrition-tofu', 'dev-item-tofu', 430, 24, 46, 15, 11, '1 bowl', 'ai_estimated', 0.82, 'ai_estimated', true),
  ('dev-nutrition-rejected', 'dev-item-chicken', 999, 1, 1, 1, 1, 'bad row', 'pending', 0.1, 'rejected', false)
on conflict (id) do update set calories = excluded.calories, verified_status = excluded.verified_status, is_current = excluded.is_current;

alter table public.restaurants enable row level security;
alter table public.restaurant_branches enable row level security;
alter table public.menus enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.branch_menu_items enable row level security;
alter table public.menu_item_nutrition enable row level security;

drop policy if exists restaurants_public_read_dev on public.restaurants;
create policy restaurants_public_read_dev on public.restaurants for select using (status = 'active');

drop policy if exists branches_public_read_dev on public.restaurant_branches;
create policy branches_public_read_dev on public.restaurant_branches for select using (status = 'active');

drop policy if exists menus_public_read_dev on public.menus;
create policy menus_public_read_dev on public.menus for select using (status = 'published');

drop policy if exists categories_public_read_dev on public.menu_categories;
create policy categories_public_read_dev on public.menu_categories for select using (
  exists (select 1 from public.menus m where m.id = menu_id and m.status = 'published')
);

drop policy if exists items_public_read_dev on public.menu_items;
create policy items_public_read_dev on public.menu_items for select using (status = 'active');

drop policy if exists branch_items_public_read_dev on public.branch_menu_items;
create policy branch_items_public_read_dev on public.branch_menu_items for select using (
  availability in ('available', 'limited') and sold_out = false and branch_specific_status = 'available'
);

drop policy if exists nutrition_public_read_dev on public.menu_item_nutrition;
create policy nutrition_public_read_dev on public.menu_item_nutrition for select using (
  is_current = true and verified_status in ('verified', 'ai_estimated')
);

grant usage on schema public to anon, authenticated;
grant select on public.restaurants to anon, authenticated;
grant select on public.restaurant_branches to anon, authenticated;
grant select on public.menus to anon, authenticated;
grant select on public.menu_categories to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant select on public.branch_menu_items to anon, authenticated;
grant select on public.menu_item_nutrition to anon, authenticated;
grant select on public.current_published_menu_item_nutrition to anon, authenticated;
grant select on public.restaurant_public_view to anon, authenticated;
grant select on public.published_menus_view to anon, authenticated;
grant select on public.published_branch_menu_items_view to anon, authenticated;

commit;