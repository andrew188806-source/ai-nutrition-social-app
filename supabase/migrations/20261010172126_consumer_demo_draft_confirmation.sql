-- Development-only Demo acknowledgement. This is not legal consent or training authorization.
-- Owner authorized 2026-10-11; applied only to msbgnnoorsoefuiwluye.
create schema consumer_demo_internal;
revoke all on schema consumer_demo_internal from public, anon, authenticated;
create table consumer_demo_internal.environment (
 singleton boolean primary key default true check(singleton),
 project_ref text not null check(project_ref='msbgnnoorsoefuiwluye'),
 enabled boolean not null default false
);
alter table consumer_demo_internal.environment enable row level security;
alter table consumer_demo_internal.environment force row level security;
revoke all on consumer_demo_internal.environment from public, anon, authenticated;
insert into consumer_demo_internal.environment values(true,'msbgnnoorsoefuiwluye',true);
create table consumer_demo_internal.draft_confirmations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 confirmed_at timestamptz not null default statement_timestamp()
);
alter table consumer_demo_internal.draft_confirmations enable row level security;
alter table consumer_demo_internal.draft_confirmations force row level security;
revoke all on consumer_demo_internal.draft_confirmations from public, anon, authenticated;

create function consumer_demo_internal.environment_active() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from consumer_demo_internal.environment where singleton and enabled and project_ref='msbgnnoorsoefuiwluye')
 and exists(select 1 from consumer_internal.rollout_state where not enforcing)
 and consumer_internal.current_bundle() is null
$$;
create function consumer_demo_internal.actor_allowed(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_owner is not null and p_owner=auth.uid()
 and auth.jwt()->>'iss'='https://msbgnnoorsoefuiwluye.supabase.co/auth/v1'
 and consumer_demo_internal.environment_active()
 and exists(select 1 from auth.users u where u.id=p_owner and u.email_confirmed_at is not null
   and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<=statement_timestamp()))
$$;
create function consumer_demo_internal.core_allowed(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select consumer_demo_internal.actor_allowed(p_owner)
 and exists(select 1 from consumer_demo_internal.draft_confirmations d where d.user_id=p_owner)
$$;
revoke all on function consumer_demo_internal.environment_active() from public,anon,authenticated;
revoke all on function consumer_demo_internal.actor_allowed(uuid) from public,anon,authenticated;
revoke all on function consumer_demo_internal.core_allowed(uuid) from public,anon,authenticated;

-- Preserve the original active-profile, real-consent and existing-cohort predicates exactly.
-- Demo access has a separate server-owned, project-bound predicate. It grants no training consent.
create or replace function consumer_internal.core_eligible(p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.consumer_profiles p where p.user_id=p_owner and p.status='active' and p.deleted_at is null)
 and (consumer_internal.has_current_consents(p_owner) or exists(select 1 from consumer_internal.rollout_state r
 join consumer_internal.preparation_cohort c on c.user_id=p_owner join public.consumer_profiles p on p.user_id=c.user_id and p.profile_id=c.profile_id
 where not r.enforcing and p.status='active' and p.deleted_at is null)
 or consumer_demo_internal.core_allowed(p_owner))
$$;

create function public.get_consumer_demo_environment() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('demoEnabled',consumer_demo_internal.environment_active(),
 'projectRef','msbgnnoorsoefuiwluye')
$$;
create function public.get_authenticated_demo_draft_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); confirmed_time timestamptz;
begin
 if owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 select confirmed_at into confirmed_time from consumer_demo_internal.draft_confirmations where user_id=owner_id;
 return jsonb_build_object('demoEnabled',consumer_demo_internal.actor_allowed(owner_id),
 'confirmed',confirmed_time is not null,'confirmedAt',confirmed_time,
 'participationState',consumer_internal.current_state(owner_id));
end
$$;
create function public.confirm_authenticated_demo_draft(p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); anonymous_label text; random_bytes bytea; alphabet text:='23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; i integer;
begin
 if owner_id is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 if p_confirm is distinct from true then raise exception 'EXPLICIT_DEMO_CONFIRMATION_REQUIRED' using errcode='22023'; end if;
 perform consumer_internal.owner_lock(owner_id);
 if not consumer_demo_internal.actor_allowed(owner_id) then raise exception 'DEMO_MODE_UNAVAILABLE' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':pc2_profile',0));
 if exists(select 1 from public.consumer_profiles where user_id=owner_id and (status<>'active' or deleted_at is not null)) then
 raise exception 'ACCOUNT_NOT_ACTIVE' using errcode='42501'; end if;
 if not exists(select 1 from public.consumer_profiles where user_id=owner_id) then
  random_bytes:=uuid_send(gen_random_uuid()); anonymous_label:='TastKind Demo ';
  for i in 0..5 loop anonymous_label:=anonymous_label||substr(alphabet,(get_byte(random_bytes,i)%length(alphabet))+1,1); end loop;
  insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key,visibility,willing_to_chat,status,locale,timezone)
  values(owner_id,gen_random_uuid()::text,anonymous_label,anonymous_label,'BG','private',false,'active','zh-TW','Asia/Taipei');
 end if;
 -- No UPDATE/DELETE or version column: deployments/draft edits cannot reset acknowledgement.
 insert into consumer_demo_internal.draft_confirmations(user_id) values(owner_id) on conflict(user_id) do nothing;
 return public.get_authenticated_demo_draft_state();
end
$$;
revoke all on function public.get_consumer_demo_environment() from public,anon,authenticated;
grant execute on function public.get_consumer_demo_environment() to anon,authenticated;
revoke all on function public.get_authenticated_demo_draft_state() from public,anon,authenticated;
grant execute on function public.get_authenticated_demo_draft_state() to authenticated;
revoke all on function public.confirm_authenticated_demo_draft(boolean) from public,anon,authenticated;
grant execute on function public.confirm_authenticated_demo_draft(boolean) to authenticated;
-- No document approvals, document status, rollout/enforcing, cohort or legal-consent DML.
