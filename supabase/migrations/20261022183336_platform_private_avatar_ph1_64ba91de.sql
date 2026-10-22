-- PH1 P1: one current private owner thumbnail. No originals, history, publication or plan access.
begin;
create schema platform_identity_internal;
revoke all on schema platform_identity_internal from public,anon,authenticated,authenticator,service_role;
alter default privileges in schema platform_identity_internal revoke execute on functions from public;
create role platform_avatar_authority nologin noinherit nobypassrls nosuperuser nocreatedb nocreaterole noreplication;
grant platform_avatar_authority to postgres with inherit false,set true;
grant usage on schema platform_identity_internal,consumer_internal,public to platform_avatar_authority;
grant execute on function consumer_internal.owner_lock(uuid),consumer_internal.require_core(uuid) to platform_avatar_authority;
grant usage on schema platform_identity_internal to social_runtime_executor;
grant select(user_id,request_status) on public.consumer_data_deletion_requests to platform_avatar_authority;
create policy ph1_pending_deletion_read on public.consumer_data_deletion_requests for select to platform_avatar_authority using(true);
create table platform_identity_internal.current_avatar (
 owner_user_id uuid primary key constraint ph1_owner_auth_fk references auth.users(id) on delete cascade,
 revision uuid not null default pg_catalog.gen_random_uuid(),
 jpeg_bytes bytea, sha256 bytea, width smallint,height smallint,
 last_request_id uuid, last_request_digest bytea,
 constraint ph1_current_media_bound check (
  (jpeg_bytes is null and sha256 is null and width is null and height is null) or
  (jpeg_bytes is not null and sha256 is not null and width is not null and height is not null and octet_length(jpeg_bytes) between 1 and 65536 and octet_length(sha256)=32
    and width between 1 and 256 and height between 1 and 256 and
    sha256=public.digest(jpeg_bytes,'sha256'))),
 constraint ph1_last_request_pair check ((last_request_id is null)=(last_request_digest is null) and (last_request_digest is null or octet_length(last_request_digest)=32))
);
alter table platform_identity_internal.current_avatar enable row level security;
alter table platform_identity_internal.current_avatar force row level security;
revoke all on platform_identity_internal.current_avatar from public,anon,authenticated,authenticator,service_role,social_runtime_executor;
grant select,insert,update on platform_identity_internal.current_avatar to platform_avatar_authority;
create policy ph1_narrow_authority on platform_identity_internal.current_avatar to platform_avatar_authority using(true) with check(true);

create function platform_identity_internal.require_owner(a uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if a is null or nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid is distinct from a then raise exception 'PH1_VERIFIED_OWNER_REQUIRED' using errcode='42501';end if;
end $$;
create function platform_identity_internal.photo_lock(a uuid) returns void language sql volatile set search_path='' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(a::text||':platform_avatar_ph1',0))
$$;
create function platform_identity_internal.require_photo_core(a uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 perform consumer_internal.require_core(a);
 if exists(select 1 from public.consumer_data_deletion_requests where user_id=a and request_status='pending') then
 raise exception 'PH1_DELETION_PENDING' using errcode='42501';end if;
end $$;
create function platform_identity_internal.removal_state(a uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r platform_identity_internal.current_avatar%rowtype;
begin
 perform platform_identity_internal.require_owner(a);perform platform_identity_internal.photo_lock(a);
 select * into r from platform_identity_internal.current_avatar where owner_user_id=a;
 return pg_catalog.jsonb_build_object('revision',r.revision,'present',r.jpeg_bytes is not null,'lastRequestId',r.last_request_id);
end $$;
create function platform_identity_internal.state(a uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 perform platform_identity_internal.require_owner(a);perform consumer_internal.owner_lock(a);
 perform platform_identity_internal.photo_lock(a);perform platform_identity_internal.require_photo_core(a);
 return platform_identity_internal.removal_state(a);
end $$;
create function platform_identity_internal.preview(a uuid,expected uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r platform_identity_internal.current_avatar%rowtype;
begin
 perform platform_identity_internal.require_owner(a);perform consumer_internal.owner_lock(a);
 perform platform_identity_internal.photo_lock(a);perform platform_identity_internal.require_photo_core(a);
 select * into r from platform_identity_internal.current_avatar where owner_user_id=a;
 if r.revision is distinct from expected then raise exception 'PH1_STATE_CHANGED' using errcode='40001';end if;
 if r.jpeg_bytes is null then raise exception 'PH1_PHOTO_MISSING' using errcode='P0002';end if;
 return pg_catalog.jsonb_build_object('revision',r.revision,'jpegBase64',replace(encode(r.jpeg_bytes,'base64'),E'\n',''),'width',r.width,'height',r.height);
end $$;
create function platform_identity_internal.put(a uuid,expected uuid,request_id uuid,request_digest bytea,media bytea,w smallint,h smallint) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r platform_identity_internal.current_avatar%rowtype;
begin
 perform platform_identity_internal.require_owner(a);perform consumer_internal.owner_lock(a);
 perform platform_identity_internal.photo_lock(a);
 -- Separate volatile statement after serialization: fresh READ COMMITTED account/consent snapshot.
 perform platform_identity_internal.require_photo_core(a);
 if request_id is null or octet_length(request_digest)<>32 or request_digest is null or media is null or octet_length(media) not between 1 and 65536 or w is null or w not between 1 and 256 or h is null or h not between 1 and 256 then raise exception 'PH1_INVALID_MUTATION' using errcode='22023';end if;
 select * into r from platform_identity_internal.current_avatar where owner_user_id=a;
 if r.last_request_id=request_id then
  if r.last_request_digest is distinct from request_digest then raise exception 'PH1_REQUEST_REUSED' using errcode='22023';end if;
  return platform_identity_internal.removal_state(a);
 end if;
 if r.revision is distinct from expected then raise exception 'PH1_STATE_CHANGED' using errcode='40001';end if;
 insert into platform_identity_internal.current_avatar(owner_user_id,jpeg_bytes,sha256,width,height,last_request_id,last_request_digest)
 values(a,media,public.digest(media,'sha256'),w,h,request_id,request_digest)
 on conflict(owner_user_id) do update set revision=pg_catalog.gen_random_uuid(),jpeg_bytes=excluded.jpeg_bytes,sha256=excluded.sha256,
 width=excluded.width,height=excluded.height,last_request_id=excluded.last_request_id,last_request_digest=excluded.last_request_digest;
 return platform_identity_internal.removal_state(a);
end $$;
create function platform_identity_internal.remove(a uuid,expected uuid,request_id uuid,request_digest bytea) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r platform_identity_internal.current_avatar%rowtype;
begin
 perform platform_identity_internal.require_owner(a);perform platform_identity_internal.photo_lock(a);
 if request_id is null or request_digest is null or octet_length(request_digest)<>32 then raise exception 'PH1_INVALID_MUTATION' using errcode='22023';end if;
 select * into r from platform_identity_internal.current_avatar where owner_user_id=a;
 if r.last_request_id=request_id then
  if r.last_request_digest is distinct from request_digest then raise exception 'PH1_REQUEST_REUSED' using errcode='22023';end if;
  return platform_identity_internal.removal_state(a);
 end if;
 if r.revision is distinct from expected then raise exception 'PH1_STATE_CHANGED' using errcode='40001';end if;
 insert into platform_identity_internal.current_avatar(owner_user_id,last_request_id,last_request_digest) values(a,request_id,request_digest)
 on conflict(owner_user_id) do update set revision=pg_catalog.gen_random_uuid(),jpeg_bytes=null,sha256=null,width=null,height=null,
 last_request_id=excluded.last_request_id,last_request_digest=excluded.last_request_digest;
 return platform_identity_internal.removal_state(a);
end $$;
-- Lifecycle clear leaves ONLY owner/revision; request receipts derived from an old photo are erased.
-- An empty tombstone also invalidates a delayed first put using expectedRevision=null.
create function platform_identity_internal.clear_media(a uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 perform platform_identity_internal.photo_lock(a);
 insert into platform_identity_internal.current_avatar(owner_user_id) values(a)
 on conflict(owner_user_id) do update set revision=pg_catalog.gen_random_uuid(),jpeg_bytes=null,sha256=null,width=null,height=null,last_request_id=null,last_request_digest=null;
end $$;
create function platform_identity_internal.lifecycle_clear() returns trigger language plpgsql security definer set search_path='' as $$
declare fk_name text;
begin
 if TG_OP='DELETE' then
  -- Profile removal is an actual account event. Make an empty CAS tombstone while Auth lives.
  -- During Auth's own FK cascade the parent can already be gone: only THIS new FK may be
  -- ignored, because that same Auth transaction cascades the entire avatar row. All other
  -- errors roll back the caller; no retention/consent exception is swallowed.
  begin perform platform_identity_internal.clear_media(old.user_id);
  exception when foreign_key_violation then
   get stacked diagnostics fk_name=CONSTRAINT_NAME;
   if fk_name<>'ph1_owner_auth_fk' then raise;end if;
  end;
  return old;
 end if;
 if TG_TABLE_NAME='consumer_profiles' then
  if new.status<>'active' or new.deleted_at is not null then perform platform_identity_internal.clear_media(new.user_id);end if;
 elsif TG_TABLE_NAME='consumer_data_consents' then
  -- Exact existing necessary document types. AI-training-only withdrawal is explicitly excluded.
  if new.withdrawn_at is not null and old.withdrawn_at is null and new.consent_type in ('membership_terms_acceptance','privacy_policy_acknowledgment') then
   perform platform_identity_internal.clear_media(new.user_id);
  end if;
 elsif TG_TABLE_NAME='consumer_data_deletion_requests' then
  if new.request_status='pending' then perform platform_identity_internal.clear_media(new.user_id);end if;
 end if;
 return new;
end $$;
create trigger ph1_account_status_clear after update of status,deleted_at on public.consumer_profiles for each row execute function platform_identity_internal.lifecycle_clear();
create trigger ph1_profile_delete_clear after delete on public.consumer_profiles for each row execute function platform_identity_internal.lifecycle_clear();
create trigger ph1_core_withdrawal_clear after update of withdrawn_at on public.consumer_data_consents for each row execute function platform_identity_internal.lifecycle_clear();
create trigger ph1_delete_request_clear after insert or update of request_status on public.consumer_data_deletion_requests for each row execute function platform_identity_internal.lifecycle_clear();

grant create on schema platform_identity_internal to platform_avatar_authority;
-- Installer retains table ownership; authority cannot grant access or disable FORCE RLS.
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='platform_identity_internal' loop
  execute format('alter function %s owner to platform_avatar_authority',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated,authenticator,service_role,social_runtime_executor',f.signature);
 end loop;
end $$;
revoke create on schema platform_identity_internal from platform_avatar_authority;
set local role platform_avatar_authority;
grant execute on function platform_identity_internal.state(uuid),platform_identity_internal.preview(uuid,uuid),platform_identity_internal.put(uuid,uuid,uuid,bytea,bytea,smallint,smallint),platform_identity_internal.removal_state(uuid),platform_identity_internal.remove(uuid,uuid,uuid,bytea) to social_runtime_executor;
set local role postgres;
revoke platform_avatar_authority from postgres granted by postgres;
-- No Data API schema addition, public RPC, Storage object or third-party reader.
commit;
