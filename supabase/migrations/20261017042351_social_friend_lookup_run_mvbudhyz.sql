-- Social local candidate. No predecessor or retention contract is modified.
begin;
create schema friend_internal;
revoke all on schema friend_internal from public, anon, authenticated, authenticator, service_role;
create role social_friend_lookup_authority nologin noinherit nobypassrls nocreatedb nocreaterole nosuperuser noreplication;
grant social_friend_lookup_authority to postgres with inherit false, set true;
grant usage on schema public to social_friend_lookup_authority;
grant usage on schema friend_internal, social_internal to social_friend_lookup_authority, social_runtime_executor;

create table friend_internal.lookup_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 searchable boolean not null default false,
 invite_code text not null unique default pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
 updated_at timestamptz not null default pg_catalog.clock_timestamp(),
 constraint invite_code_shape check (invite_code ~ '^[a-f0-9]{32}$')
);
create table friend_internal.lookup_budget (
 user_id uuid primary key references auth.users(id) on delete cascade,
 minute_start timestamptz not null, minute_count integer not null,
 day_start date not null, day_count integer not null,
 constraint counts_positive check (minute_count > 0 and day_count > 0)
);
alter table friend_internal.lookup_settings enable row level security;
alter table friend_internal.lookup_budget enable row level security;
revoke all on friend_internal.lookup_settings,friend_internal.lookup_budget from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
grant select,insert,update on friend_internal.lookup_settings,friend_internal.lookup_budget to social_friend_lookup_authority;
create policy lookup_settings_authority on friend_internal.lookup_settings to social_friend_lookup_authority using(true) with check(true);
create policy lookup_budget_authority on friend_internal.lookup_budget to social_friend_lookup_authority using(true) with check(true);

-- These two postgres-owned helpers can read trusted evidence without granting the lookup
-- authority access to the Auth directory or changing a shared age/consent interface.
create function friend_internal.explicit_adult(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $f$
 select exists(select 1 from consumer_internal.social_age_qualifications q
 where q.user_id=p_user and q.attested_18_plus and q.policy_version='social-adult-self-attestation-v1')
 and exists(select 1 from auth.users u where u.id=p_user and u.deleted_at is null
 and (u.banned_until is null or u.banned_until <= pg_catalog.statement_timestamp()))
$f$;
create function friend_internal.verified_phone_target(p_phone text) returns uuid
language sql stable security definer set search_path='' as $f$
 select case when count(*)=1 then (array_agg(u.id))[1] else null end
 from auth.users u where u.phone in(p_phone,pg_catalog.substr(p_phone,2))
 and u.phone_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=pg_catalog.statement_timestamp())
$f$;
revoke all on function friend_internal.explicit_adult(uuid),friend_internal.verified_phone_target(text) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
grant execute on function friend_internal.explicit_adult(uuid),friend_internal.verified_phone_target(text) to social_friend_lookup_authority;


grant social_authority to postgres with inherit false,set true;
set local role social_authority;
grant execute on function social_internal.may_evaluate_candidate(uuid,uuid) to social_friend_lookup_authority;
set local role postgres;
revoke social_authority from postgres granted by postgres;

create function friend_internal.normalize_phone(p_value text) returns text
language plpgsql immutable set search_path='' as $f$
declare v text;
begin
 if p_value is null or pg_catalog.length(p_value)>80 then return null; end if;
 v:=pg_catalog.regexp_replace(pg_catalog.btrim(p_value),'[ () .-]','','g');
 if v ~ '^09[0-9]{8}$' then return '+886'||pg_catalog.substr(v,2); end if;
 if v ~ '^\+[1-9][0-9]{7,14}$' then return v; end if;
 return null;
end $f$;

create function friend_internal.require_actor(p_actor uuid) returns void
language plpgsql volatile security definer set search_path='' as $f$
begin
 if p_actor is null or auth.uid() is distinct from p_actor then raise exception 'VERIFIED_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;
 perform consumer_internal.require_social(p_actor);
 if not friend_internal.explicit_adult(p_actor) then
  raise exception 'SOCIAL_EXPLICIT_ADULT_REQUIRED' using errcode='42501';
 end if;
end $f$;

create function friend_internal.settings(p_actor uuid,p_searchable boolean default null,p_rotate boolean default false)
returns jsonb language plpgsql volatile security definer set search_path='' as $f$
declare r friend_internal.lookup_settings%rowtype;
begin
 perform friend_internal.require_actor(p_actor);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text||':friend_settings',0));
 insert into friend_internal.lookup_settings(user_id) values(p_actor) on conflict(user_id) do nothing;
 if p_searchable is not null or p_rotate then
  update friend_internal.lookup_settings set searchable=coalesce(p_searchable,searchable),
   invite_code=case when p_rotate then pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','') else invite_code end,
   updated_at=pg_catalog.clock_timestamp() where user_id=p_actor;
 end if;
 select * into r from friend_internal.lookup_settings where user_id=p_actor;
 return pg_catalog.jsonb_build_object('searchable',r.searchable,'inviteCode',r.invite_code);
end $f$;

create function friend_internal.lookup(p_actor uuid,p_kind text,p_value text)
returns table(status text,candidate_user_id uuid,display_name text,mascot_avatar_key text)
language plpgsql volatile security definer set search_path='' as $f$
declare
 t uuid; v_phone text; v_now timestamptz:=pg_catalog.clock_timestamp();
 b friend_internal.lookup_budget%rowtype;
begin
 perform friend_internal.require_actor(p_actor);
 -- Serialize rate accounting before looking at format, existence or target eligibility.
 -- Return misses/rate limits normally so PostgreSQL commits attempted lookups.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text||':friend_lookup_budget',0));
 select * into b from friend_internal.lookup_budget where user_id=p_actor;
 if found and ((b.minute_start > v_now-interval '1 minute' and b.minute_count>=10)
  or (b.day_start=(v_now at time zone 'UTC')::date and b.day_count>=50)) then
  return query select 'rate_limited'::text,null::uuid,null::text,null::text; return;
 end if;
 insert into friend_internal.lookup_budget(user_id,minute_start,minute_count,day_start,day_count)
 values(p_actor,v_now,1,(v_now at time zone 'UTC')::date,1)
 on conflict(user_id) do update set
 minute_start=case when lookup_budget.minute_start<=v_now-interval '1 minute' then v_now else lookup_budget.minute_start end,
 minute_count=case when lookup_budget.minute_start<=v_now-interval '1 minute' then 1 else lookup_budget.minute_count+1 end,
 day_start=(v_now at time zone 'UTC')::date,
 day_count=case when lookup_budget.day_start=(v_now at time zone 'UTC')::date then lookup_budget.day_count+1 else 1 end;
 if p_kind='phone' then
  v_phone:=friend_internal.normalize_phone(p_value);
  if v_phone is not null then t:=friend_internal.verified_phone_target(v_phone); end if;
 elsif p_kind='code' and pg_catalog.length(p_value)=32 and pg_catalog.lower(p_value) ~ '^[a-f0-9]{32}$' then
  select s.user_id into t from friend_internal.lookup_settings s where s.invite_code=pg_catalog.lower(p_value);
 end if;
 if t is not null and t<>p_actor then
  -- Same setting lock as toggle/rotation, so a concurrent search has one serial outcome.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t::text||':friend_settings',0));
  if exists(select 1 from friend_internal.lookup_settings s where s.user_id=t and s.searchable
    and (p_kind<>'code' or s.invite_code=pg_catalog.lower(p_value)))
    and friend_internal.explicit_adult(t)
    and social_internal.may_evaluate_candidate(p_actor,t) then
   return query select 'found'::text,t,p.display_name,p.mascot_avatar_key
    from public.consumer_profiles p where p.user_id=t and p.status='active' and p.deleted_at is null;
   if found then return; end if;
  end if;
 end if;
 return query select 'not_found'::text,null::uuid,null::text,null::text;
end $f$;
grant select(user_id,display_name,mascot_avatar_key,status,deleted_at) on public.consumer_profiles to social_friend_lookup_authority;
create policy consumer_profiles_friend_lookup on public.consumer_profiles for select to social_friend_lookup_authority using(true);
-- The authority cannot read phone numbers or client-editable metadata directly.
revoke all on function friend_internal.normalize_phone(text),friend_internal.require_actor(uuid),
 friend_internal.settings(uuid,boolean,boolean),friend_internal.lookup(uuid,text,text)
 from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
grant create on schema friend_internal to social_friend_lookup_authority;
alter function friend_internal.normalize_phone(text) owner to social_friend_lookup_authority;
grant execute on function friend_internal.require_actor(uuid) to social_friend_lookup_authority;
alter function friend_internal.settings(uuid,boolean,boolean) owner to social_friend_lookup_authority;
alter function friend_internal.lookup(uuid,text,text) owner to social_friend_lookup_authority;
revoke create on schema friend_internal from social_friend_lookup_authority;
set local role social_friend_lookup_authority;
grant execute on function friend_internal.settings(uuid,boolean,boolean),friend_internal.lookup(uuid,text,text) to social_runtime_executor;
set local role postgres;
revoke social_friend_lookup_authority from postgres granted by postgres;
comment on schema friend_internal is 'Local social candidate; exact opt-in friend discovery. No REST exposure. Retention integration review required before activation.';
commit;
