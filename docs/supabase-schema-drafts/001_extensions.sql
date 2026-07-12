-- DRAFT ONLY - Supabase schema mapping preparation.
-- Do not execute as an active production migration without human review.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.uid()::text, '')::uuid;
$$;
