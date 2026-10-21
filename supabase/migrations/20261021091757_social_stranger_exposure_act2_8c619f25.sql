-- S2-ACT2: permanent, explicit stranger exposure. No activity, history or backfill.
begin;
create schema stranger_internal;
revoke all on schema stranger_internal from public,anon,authenticated,authenticator,service_role;
create role meal_buddy_stranger_authority nologin noinherit nobypassrls nocreatedb nocreaterole nosuperuser noreplication;
grant meal_buddy_stranger_authority to postgres with inherit false,set true;
grant usage on schema public,stranger_internal,social_internal,friend_internal,consumer_internal to meal_buddy_stranger_authority;
grant usage on schema stranger_internal to social_runtime_executor;
create table stranger_internal.exposure_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null,
 revision uuid not null default pg_catalog.gen_random_uuid()
);
alter table stranger_internal.exposure_settings enable row level security;
alter table stranger_internal.exposure_settings force row level security;
revoke all on stranger_internal.exposure_settings from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
grant select,insert,update on stranger_internal.exposure_settings to meal_buddy_stranger_authority;
create policy stranger_settings_authority on stranger_internal.exposure_settings to meal_buddy_stranger_authority using(true) with check(true);
grant select(id,owner_user_id,cancelled_at,expires_at) on public.meal_buddy_cards to meal_buddy_stranger_authority;
create policy meal_buddy_cards_stranger_source on public.meal_buddy_cards for select to meal_buddy_stranger_authority using(true);
grant select(user_id,plan_code,status,valid_from,valid_until) on public.subscription_entitlements to meal_buddy_stranger_authority;
create policy subscription_entitlements_stranger_identity on public.subscription_entitlements for select to meal_buddy_stranger_authority using(true);
grant execute on function friend_internal.explicit_adult(uuid) to meal_buddy_stranger_authority;


-- Only currently pending invitations created by THIS stranger path. No user/card copy, timestamps,
-- enrollment history or retention days; terminal resolution deletes this marker in the same tx.
create table stranger_internal.pending_invites (
 relation_id uuid primary key references public.meal_buddy_relationships(id) on delete cascade
);
alter table stranger_internal.pending_invites enable row level security;
alter table stranger_internal.pending_invites force row level security;
revoke all on stranger_internal.pending_invites from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
grant select,insert,delete on stranger_internal.pending_invites to meal_buddy_stranger_authority;
create policy stranger_pending_authority on stranger_internal.pending_invites to meal_buddy_stranger_authority using(true) with check(true);
create function stranger_internal.clear_resolved_marker() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state<>'pending' then delete from stranger_internal.pending_invites where relation_id=new.id; end if;
 return new;
end $$;
create trigger stranger_pending_resolution after update of state on public.meal_buddy_relationships for each row execute function stranger_internal.clear_resolved_marker();

create function stranger_internal.require_actor(a uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if a is null or nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid is distinct from a then raise exception 'VERIFIED_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;
 perform consumer_internal.require_social(a);
 if not friend_internal.explicit_adult(a) then raise exception 'STRANGER_ADULT_REQUIRED' using errcode='42501'; end if;
end $$;

-- Identity-only stop/read: withdrawal remains possible after consent/social qualification is lost.
create function stranger_internal.settings(a uuid,desired boolean default null,expected uuid default null) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r stranger_internal.exposure_settings%rowtype;
begin
 if a is null or nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid is distinct from a then raise exception 'VERIFIED_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;
 if desired is null then perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(a::text||':stranger_exposure',0));
 else perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a::text||':stranger_exposure',0)); end if;
 select * into r from stranger_internal.exposure_settings where user_id=a;
 if desired is not null then
  if desired then perform stranger_internal.require_actor(a); end if;
  if r.revision is distinct from expected then raise exception 'STRANGER_STATE_CHANGED' using errcode='40001'; end if;
  if r.user_id is null then
   if desired then insert into stranger_internal.exposure_settings(user_id,enabled) values(a,true) returning * into r; end if;
  elsif r.enabled is distinct from desired then
   update stranger_internal.exposure_settings set enabled=desired,revision=pg_catalog.gen_random_uuid() where user_id=a returning * into r;
  end if;
 end if;
 return pg_catalog.jsonb_build_object('enabled',coalesce(r.enabled,false),'revision',r.revision);
end $$;

create function stranger_internal.require_enabled(a uuid,expected uuid default null) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare v uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(a::text||':stranger_exposure',0));
 select revision into v from stranger_internal.exposure_settings where user_id=a and enabled;
 if v is null or (expected is not null and v<>expected) then raise exception 'STRANGER_EXPOSURE_REQUIRED' using errcode='42501'; end if;
 return v;
end $$;

create function stranger_internal.pool(a uuid,source uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c record; result jsonb:='[]'; rev uuid; instant timestamptz;
begin
 perform stranger_internal.require_actor(a); perform stranger_internal.require_enabled(a);
 instant:=pg_catalog.clock_timestamp();
 if not exists(select 1 from public.meal_buddy_cards where id=source and owner_user_id=a and cancelled_at is null and expires_at>instant) then
  raise exception 'STRANGER_SOURCE_UNAVAILABLE' using errcode='22023';
 end if;
 for c in select * from social_internal.canonical_meal_buddy_context_candidates(a,source,instant) order by candidate_owner_user_id loop
  -- Only currently opted-in canonical owners; shared lock survives to outer commit.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(c.candidate_owner_user_id::text||':stranger_exposure',0));
  select revision into rev from stranger_internal.exposure_settings where user_id=c.candidate_owner_user_id and enabled;
  if rev is not null and friend_internal.explicit_adult(c.candidate_owner_user_id)
    and social_internal.may_evaluate_candidate(a,c.candidate_owner_user_id)
    -- Already accepted friends use their existing ordinary identity/inbox, not stranger masking.
    and not exists(select 1 from social_internal.read_meal_buddy_relationship(a,c.candidate_owner_user_id) r where r.relative_state='accepted') then
   result:=result||pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(c)||pg_catalog.jsonb_build_object('revision',rev));
  end if;
 end loop;
 return result;
end $$;

-- No client array reaches this primitive. Runtime supplies only its already-selected canonical set.
create function stranger_internal.taste(a uuid,source uuid,ids uuid[]) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare pool_ids uuid[];
begin
 select coalesce(array_agg((x->>'candidate_owner_user_id')::uuid),'{}'::uuid[]) into pool_ids from pg_catalog.jsonb_array_elements(stranger_internal.pool(a,source)) x;
 if ids is null or exists(select 1 from unnest(ids) u where not(u=any(pool_ids))) or cardinality(ids)<>(select count(distinct u) from unnest(ids) u) then raise exception 'STRANGER_CANDIDATE_UNAVAILABLE' using errcode='42501'; end if;
 return social_internal.authorized_pair_sources(a,ids,20,10);
end $$;

-- Reuses the unchanged resolver in TypeScript. No plan inference or direct Auth directory access.
create function stranger_internal.plan_rows(a uuid,target uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform stranger_internal.require_actor(a);
 if target<>a then
  perform stranger_internal.require_enabled(a); perform stranger_internal.require_enabled(target);
  if not friend_internal.explicit_adult(target) or not social_internal.may_evaluate_candidate(a,target) then raise exception 'STRANGER_CANDIDATE_UNAVAILABLE' using errcode='42501'; end if;
 end if;
 return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('plan_code',plan_code,'status',status,'valid_from',valid_from,'valid_until',valid_until)),'[]'::jsonb) from public.subscription_entitlements where user_id=target);
end $$;

create function stranger_internal.check_pair(a uuid,target uuid,source uuid,target_card uuid,actor_rev uuid,target_rev uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 perform stranger_internal.require_actor(a);
 if a=target or actor_rev is null or target_rev is null then raise exception 'STRANGER_CANDIDATE_UNAVAILABLE' using errcode='42501'; end if;
 perform stranger_internal.require_enabled(a,actor_rev); perform stranger_internal.require_enabled(target,target_rev);
 if not exists(select 1 from pg_catalog.jsonb_array_elements(stranger_internal.pool(a,source)) x where (x->>'candidate_owner_user_id')::uuid=target and (x->>'candidate_card_id')::uuid=target_card and (x->>'revision')::uuid=target_rev) then
  raise exception 'STRANGER_CANDIDATE_UNAVAILABLE' using errcode='42501';
 end if;
end $$;

create function stranger_internal.send(a uuid,target uuid,source uuid,target_card uuid,actor_rev uuid,target_rev uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare rows_json jsonb;
begin
 perform stranger_internal.require_actor(a);
 perform social_internal.lock_meal_buddy_relationship_pair(least(a,target),greatest(a,target));
 if exists(select 1 from social_internal.read_meal_buddy_relationship(a,target) r where r.relative_state in('incoming_pending','outgoing_pending','accepted')) then
  return pg_catalog.jsonb_build_object('replay',true,'rows',(select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) from social_internal.read_meal_buddy_relationship(a,target) r));
 end if;
 perform stranger_internal.check_pair(a,target,source,target_card,actor_rev,target_rev);
 select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) into rows_json from social_internal.send_meal_buddy_invite(a,target) r;
 insert into stranger_internal.pending_invites(relation_id) select (r->>'relation_id')::uuid from pg_catalog.jsonb_array_elements(rows_json) r where r->>'relative_state' in('outgoing_pending','incoming_pending') on conflict do nothing;
 return pg_catalog.jsonb_build_object('replay',false,'rows',rows_json);
end $$;

-- Ambiguous legacy ordinary refs cannot establish new stranger provenance. Existing pair replay stays.
create function stranger_internal.legacy_replay(a uuid,target uuid)
returns table(relation_id uuid,counterpart_user_id uuid,relative_state text) language plpgsql volatile security definer set search_path='' as $$
begin
 perform stranger_internal.require_actor(a);
 perform social_internal.lock_meal_buddy_relationship_pair(least(a,target),greatest(a,target));
 return query select * from social_internal.read_meal_buddy_relationship(a,target) r where r.relative_state in('incoming_pending','outgoing_pending','accepted');
 if not found then raise exception 'STRANGER_REF_REFRESH_REQUIRED' using errcode='42501'; end if;
end $$;

-- Existing ordinary relationship read authorization, plus source-specific pending anonymity.
-- This wrapper adds NO stranger opt-in/adult/plan requirement to friends or old invitations.
create function stranger_internal.project_counterparts(a uuid,ids uuid[])
returns table(exposure_ordinal integer,display_name text,mascot_avatar_key text,anonymous boolean)
language plpgsql volatile security definer set search_path='' as $$
declare p record; masked boolean;
begin
 if a is null or nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid is distinct from a then raise exception 'VERIFIED_ACTOR_CONTEXT_REQUIRED' using errcode='42501'; end if;
 for p in select * from social_internal.project_exposed_social_profiles(a,ids) loop
  select exists(select 1 from social_internal.read_meal_buddy_relationship(a,ids[p.exposure_ordinal+1]) r join stranger_internal.pending_invites m on m.relation_id=r.relation_id where r.relative_state in('outgoing_pending','incoming_pending')) into masked;
  return query select p.exposure_ordinal,case when masked then '匿名飯友' else p.display_name end,p.mascot_avatar_key,masked;
 end loop;
end $$;

grant execute on function consumer_internal.require_social(uuid) to meal_buddy_stranger_authority;
grant meal_buddy_candidate_pool_authority to postgres with inherit false,set true;
set local role meal_buddy_candidate_pool_authority;
grant execute on function social_internal.canonical_meal_buddy_context_candidates(uuid,uuid,timestamptz) to meal_buddy_stranger_authority;
set local role postgres;
revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;
grant social_authority to postgres with inherit false,set true;
set local role social_authority;
grant execute on function social_internal.may_evaluate_candidate(uuid,uuid) to meal_buddy_stranger_authority;
set local role postgres;
revoke social_authority from postgres granted by postgres;
grant social_pair_read_authority to postgres with inherit false,set true;
set local role social_pair_read_authority;
grant execute on function social_internal.authorized_pair_sources(uuid,uuid[],integer,integer) to meal_buddy_stranger_authority;
set local role postgres;
revoke social_pair_read_authority from postgres granted by postgres;
grant meal_buddy_relationship_authority to postgres with inherit false,set true;
set local role meal_buddy_relationship_authority;
grant execute on function social_internal.lock_meal_buddy_relationship_pair(uuid,uuid),social_internal.read_meal_buddy_relationship(uuid,uuid),social_internal.send_meal_buddy_invite(uuid,uuid) to meal_buddy_stranger_authority;
set local role postgres;
revoke meal_buddy_relationship_authority from postgres granted by postgres;
grant social_profile_projection_authority to postgres with inherit false,set true;
set local role social_profile_projection_authority;
grant execute on function social_internal.project_exposed_social_profiles(uuid,uuid[]) to meal_buddy_stranger_authority;
set local role postgres;
revoke social_profile_projection_authority from postgres granted by postgres;
grant create on schema stranger_internal to meal_buddy_stranger_authority;
revoke all on function stranger_internal.clear_resolved_marker(),stranger_internal.project_counterparts(uuid,uuid[]) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.clear_resolved_marker() owner to meal_buddy_stranger_authority;
alter function stranger_internal.project_counterparts(uuid,uuid[]) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.require_actor(uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.require_actor(uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.settings(uuid,boolean,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.settings(uuid,boolean,uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.require_enabled(uuid,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.require_enabled(uuid,uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.pool(uuid,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.pool(uuid,uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.taste(uuid,uuid,uuid[]) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.taste(uuid,uuid,uuid[]) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.plan_rows(uuid,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.plan_rows(uuid,uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.check_pair(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.check_pair(uuid,uuid,uuid,uuid,uuid,uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.send(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.send(uuid,uuid,uuid,uuid,uuid,uuid) owner to meal_buddy_stranger_authority;
revoke all on function stranger_internal.legacy_replay(uuid,uuid) from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
alter function stranger_internal.legacy_replay(uuid,uuid) owner to meal_buddy_stranger_authority;
revoke create on schema stranger_internal from meal_buddy_stranger_authority;
set local role meal_buddy_stranger_authority;
grant execute on function stranger_internal.project_counterparts(uuid,uuid[]) to social_runtime_executor;
grant execute on function stranger_internal.settings(uuid,boolean,uuid) to social_runtime_executor;
grant execute on function stranger_internal.pool(uuid,uuid) to social_runtime_executor;
grant execute on function stranger_internal.taste(uuid,uuid,uuid[]) to social_runtime_executor;
grant execute on function stranger_internal.plan_rows(uuid,uuid) to social_runtime_executor;
grant execute on function stranger_internal.check_pair(uuid,uuid,uuid,uuid,uuid,uuid) to social_runtime_executor;
grant execute on function stranger_internal.send(uuid,uuid,uuid,uuid,uuid,uuid) to social_runtime_executor;
grant execute on function stranger_internal.legacy_replay(uuid,uuid) to social_runtime_executor;
set local role postgres;
revoke meal_buddy_stranger_authority from postgres granted by postgres;
commit;
