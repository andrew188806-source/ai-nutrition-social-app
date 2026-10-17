-- C4 / Owner F2: phone-search provenance only. Code and other invitation channels unchanged.
-- Additive wrapper; no accepted migration/function definition or retention interface is replaced.
begin;
grant usage on schema friend_internal to meal_buddy_relationship_authority;
grant select(user_id,searchable) on friend_internal.lookup_settings to meal_buddy_relationship_authority;
create policy lookup_settings_invite_authority on friend_internal.lookup_settings
 for select to meal_buddy_relationship_authority using(true);
grant execute on function friend_internal.require_actor(uuid),friend_internal.explicit_adult(uuid)
 to meal_buddy_relationship_authority;

create function social_internal.send_phone_search_invite(p_actor_user_id uuid,p_target_user_id uuid)
returns table(relation_id uuid,counterpart_user_id uuid,relative_state text)
language plpgsql volatile security definer set search_path='' as $f$
declare v_low uuid; v_high uuid;
begin
 perform friend_internal.require_actor(p_actor_user_id);
 if p_target_user_id is null or p_actor_user_id=p_target_user_id then
  raise exception 'RELATIONSHIP_TARGET_INVALID' using errcode='22023';
 end if;
 v_low:=least(p_actor_user_id,p_target_user_id);
 v_high:=greatest(p_actor_user_id,p_target_user_id);
 -- Reuse pair + participation/block locks. Resolve/reverse-send cannot change classification.
 perform social_internal.lock_meal_buddy_relationship_pair(v_low,v_high);
 if not exists(select 1 from public.meal_buddy_relationships r
  where r.user_low_id=v_low and r.user_high_id=v_high and r.state in('pending','accepted')) then
  -- Same xact lock as lookup/toggle. Production READ COMMITTED takes a fresh snapshot for the
  -- next statement after this wait. Hold through canonical send and transaction commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_target_user_id::text||':friend_settings',0));
  if not exists(select 1 from friend_internal.lookup_settings s where s.user_id=p_target_user_id and s.searchable)
   or not friend_internal.explicit_adult(p_target_user_id) then
   raise exception 'RELATIONSHIP_TARGET_UNAVAILABLE' using errcode='42501';
  end if;
 end if;
 -- Unchanged canonical authority rechecks account/participation/block and owns side effects.
 -- It returns pending/accepted without writes; declined/cancelled are new invites.
 return query select sent.relation_id,sent.counterpart_user_id,sent.relative_state
  from social_internal.send_meal_buddy_invite(p_actor_user_id,p_target_user_id) sent;
end $f$;
revoke all on function social_internal.send_phone_search_invite(uuid,uuid)
 from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
-- Comment while postgres still owns the function; it cannot comment after the owner change.
comment on function social_internal.send_phone_search_invite(uuid,uuid) is
 'Owner F2 phone-search new-invite check serialized with toggle. Pending/accepted replay preserves state; code/ordinary channel uses unchanged canonical send. No permanent ref revocation.';
grant meal_buddy_relationship_authority to postgres with inherit false,set true;
grant create on schema social_internal to meal_buddy_relationship_authority;
alter function social_internal.send_phone_search_invite(uuid,uuid) owner to meal_buddy_relationship_authority;
revoke create on schema social_internal from meal_buddy_relationship_authority;
set local role meal_buddy_relationship_authority;
grant execute on function social_internal.send_phone_search_invite(uuid,uuid) to social_runtime_executor;
set local role postgres;
revoke meal_buddy_relationship_authority from postgres granted by postgres;
commit;
