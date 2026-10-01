-- PC-2 local foundation. No published/approved/active legal payload is included.
begin;
do $$ begin
  if exists (select 1 from public.consumer_profiles group by user_id having count(*) > 1) then
    raise exception 'PC2_DUPLICATE_PROFILES_REQUIRE_OWNER_REMEDIATION' using errcode='23505';
  end if;
end $$;
alter table public.consumer_profiles add constraint consumer_profiles_owner_unique unique(user_id);
create schema consumer_internal;
revoke all on schema consumer_internal from public, anon, authenticated, authenticator, service_role;
alter default privileges in schema consumer_internal revoke execute on functions from public;

create table consumer_internal.document_versions (
 document_id text not null, version text not null check(version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
 locale text not null check(locale='zh-TW'), consent_type text not null,
 content_text text not null check(length(btrim(content_text))>0), content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 primary key(document_id,version,locale), unique(document_id,version,locale,content_sha256),
 check ((document_id='membership-terms' and consent_type='membership_terms_acceptance') or
 (document_id='privacy-policy' and consent_type='privacy_policy_acknowledgment') or
 (document_id='ai-training-terms' and consent_type='ai_model_training_and_service_improvement')),
 check(content_sha256=encode(public.digest(convert_to(content_text,'UTF8'),'sha256'),'hex'))
);
create table consumer_internal.document_approvals (
 document_id text not null, version text not null, locale text not null, content_sha256 text not null,
 approval_reference text not null check(length(btrim(approval_reference))>0), approved_at timestamptz not null,
 publication_sha256 text not null, effective_at timestamptz not null, retired_at timestamptz,
 primary key(document_id,version,locale),
 foreign key(document_id,version,locale,content_sha256) references consumer_internal.document_versions(document_id,version,locale,content_sha256),
 check(publication_sha256=content_sha256), check(effective_at>=approved_at),check(retired_at is null or retired_at>effective_at)
);
create table consumer_internal.required_bundles (
 bundle_version text primary key check(length(btrim(bundle_version))>0), locale text not null check(locale='zh-TW'),
 terms_version text not null, privacy_version text not null, training_version text not null,
 terms_id text not null default 'membership-terms' check(terms_id='membership-terms'),
 privacy_id text not null default 'privacy-policy' check(privacy_id='privacy-policy'),
 training_id text not null default 'ai-training-terms' check(training_id='ai-training-terms'),
 effective_at timestamptz not null, retired_at timestamptz,
 foreign key(terms_id,terms_version,locale) references consumer_internal.document_approvals(document_id,version,locale),
 foreign key(privacy_id,privacy_version,locale) references consumer_internal.document_approvals(document_id,version,locale),
 foreign key(training_id,training_version,locale) references consumer_internal.document_approvals(document_id,version,locale),
 check(retired_at is null or retired_at>effective_at)
);
create table consumer_internal.rollout_state (
 singleton boolean primary key default true check(singleton), enforcing boolean not null default false,
 bundle_version text references consumer_internal.required_bundles(bundle_version)
);
insert into consumer_internal.rollout_state(singleton,enforcing,bundle_version) values(true,false,null);
create table consumer_internal.preparation_cohort (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profile_id text not null references public.consumer_profiles(profile_id) on delete cascade,
 predecessor text not null check(predecessor='30268ee4de59a8d8855c1dcaa01795d2f1ce33b1'), captured_at timestamptz not null
);
-- Server-controlled migration-time snapshot, never acceptance, training eligibility, or age evidence.
insert into consumer_internal.preparation_cohort
 select user_id,profile_id,'30268ee4de59a8d8855c1dcaa01795d2f1ce33b1',clock_timestamp()
 from public.consumer_profiles where status='active' and deleted_at is null;
create table consumer_internal.social_age_qualifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 attested_18_plus boolean not null, policy_version text not null check(policy_version='social-adult-self-attestation-v1'),
 attested_at timestamptz not null
);

create function consumer_internal.immutable_document_binding() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'PC2_DOCUMENT_BINDING_IMMUTABLE' using errcode='23514'; end $$;
create trigger document_versions_immutable before update or delete on consumer_internal.document_versions
 for each row execute function consumer_internal.immutable_document_binding();
create trigger document_approvals_immutable before update or delete on consumer_internal.document_approvals
 for each row execute function consumer_internal.immutable_document_binding();
create trigger required_bundles_immutable before update or delete on consumer_internal.required_bundles
 for each row execute function consumer_internal.immutable_document_binding();

-- No client grants. FORCE RLS with an explicit non-superuser migration/operator owner policy.
do $$ declare t text; begin
 foreach t in array array['document_versions','document_approvals','required_bundles','rollout_state','preparation_cohort','social_age_qualifications'] loop
 execute format('alter table consumer_internal.%I enable row level security',t);
 execute format('alter table consumer_internal.%I force row level security',t);
 execute format('revoke all on table consumer_internal.%I from public,anon,authenticated,authenticator,service_role',t);
 execute format('create policy pc2_authority_owner on consumer_internal.%I to postgres using(true) with check(true)',t);
 end loop;
end $$;

create function consumer_internal.current_bundle() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('bundleVersion',b.bundle_version,'locale',b.locale,'documents',jsonb_agg(jsonb_build_object(
 'documentId',d.document_id,'version',d.version,'consentType',d.consent_type,'contentSha256',d.content_sha256,'content',d.content_text) order by d.document_id))
 from consumer_internal.rollout_state r join consumer_internal.required_bundles b on b.bundle_version=r.bundle_version
 join consumer_internal.document_versions d on d.locale=b.locale and
 ((d.document_id=b.terms_id and d.version=b.terms_version) or (d.document_id=b.privacy_id and d.version=b.privacy_version) or (d.document_id=b.training_id and d.version=b.training_version))
 join consumer_internal.document_approvals a on (a.document_id,a.version,a.locale,a.content_sha256)=(d.document_id,d.version,d.locale,d.content_sha256)
 where r.enforcing and b.effective_at<=statement_timestamp() and (b.retired_at is null or b.retired_at>statement_timestamp())
 and a.approved_at<=statement_timestamp() and a.effective_at<=statement_timestamp() and (a.retired_at is null or a.retired_at>statement_timestamp())
 and a.publication_sha256=d.content_sha256 and d.content_sha256=encode(public.digest(convert_to(d.content_text,'UTF8'),'sha256'),'hex')
 group by b.bundle_version,b.locale having count(*)=3
$$;
create function consumer_internal.has_current_consents(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_owner is not null and consumer_internal.current_bundle() is not null and not exists (
 select 1 from jsonb_array_elements(consumer_internal.current_bundle()->'documents') d where not exists (
 select 1 from public.consumer_data_consents c where c.user_id=p_owner and c.consent_type=d->>'consentType'
 and c.policy_version='doc:'||(d->>'documentId')||'@'||(d->>'version') and c.locale='zh-TW' and c.withdrawn_at is null))
$$;
create function consumer_internal.core_eligible(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.consumer_profiles p where p.user_id=p_owner and p.status='active' and p.deleted_at is null)
 and (consumer_internal.has_current_consents(p_owner) or exists(select 1 from consumer_internal.rollout_state r
 join consumer_internal.preparation_cohort c on c.user_id=p_owner join public.consumer_profiles p on p.user_id=c.user_id and p.profile_id=c.profile_id
 where not r.enforcing and p.status='active' and p.deleted_at is null))
$$;
create function consumer_internal.social_qualified(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select consumer_internal.core_eligible(p_owner) and (
 exists(select 1 from consumer_internal.social_age_qualifications a where a.user_id=p_owner and a.attested_18_plus and a.policy_version='social-adult-self-attestation-v1')
 or exists(select 1 from consumer_internal.rollout_state r join consumer_internal.preparation_cohort c on c.user_id=p_owner where not r.enforcing
 and not exists(select 1 from consumer_internal.social_age_qualifications a where a.user_id=p_owner)))
$$;
create function consumer_internal.owner_lock(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 perform 1 from consumer_internal.rollout_state where singleton for share;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':pc2_consent',0));
end $$;
create function consumer_internal.require_core(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_owner is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 if not consumer_internal.core_eligible(p_owner) then raise exception 'CONSUMER_CORE_ELIGIBILITY_REQUIRED' using errcode='42501'; end if;
end $$;
create function consumer_internal.require_social(p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform consumer_internal.require_core(p_owner);
 if not consumer_internal.social_qualified(p_owner) or not exists(select 1 from public.social_participation where user_id=p_owner and state='opted_in')
 then raise exception 'CONSUMER_SOCIAL_PARTICIPATION_REQUIRED' using errcode='42501'; end if;
end $$;

-- Lifecycle exception is exact to new canonical training document namespaces. Legacy semantics stay full-unique.
alter table public.consumer_data_consents drop constraint consumer_data_consents_unique_version;
create unique index consumer_data_consents_legacy_unique_version on public.consumer_data_consents(user_id,consent_type,policy_version)
 where not (consent_type='ai_model_training_and_service_improvement' and policy_version ~ '^doc:ai-training-terms@[A-Za-z0-9][A-Za-z0-9._-]{0,63}$');
create unique index consumer_data_consents_canonical_training_live_unique on public.consumer_data_consents(user_id,consent_type,policy_version)
 where consent_type='ai_model_training_and_service_improvement' and policy_version ~ '^doc:ai-training-terms@[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' and withdrawn_at is null;
revoke all on public.consumer_data_consents from public,anon,authenticated,authenticator,service_role;
grant select on public.consumer_data_consents to authenticated;
create function consumer_internal.consent_history_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform consumer_internal.owner_lock(new.user_id);
 if TG_OP='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.consent_type<>old.consent_type or new.policy_version<>old.policy_version
 or new.locale<>old.locale or new.accepted_at<>old.accepted_at or new.created_at<>old.created_at or new.source_surface is distinct from old.source_surface
 or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at)) then
 raise exception 'CONSENT_HISTORY_IMMUTABLE' using errcode='23514'; end if;
 return new;
end $$;
create trigger pc2_consent_history before insert or update on public.consumer_data_consents for each row execute function consumer_internal.consent_history_guard();

create function consumer_internal.current_state(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('documentsAvailable',consumer_internal.current_bundle() is not null,
 'onboardingComplete',consumer_internal.has_current_consents(p_owner) and exists(select 1 from public.consumer_profiles where user_id=p_owner and status='active' and deleted_at is null),
 'coreEligible',consumer_internal.core_eligible(p_owner),
 'trainingGranted',exists(select 1 from jsonb_array_elements(consumer_internal.current_bundle()->'documents') d join public.consumer_data_consents c on c.user_id=p_owner and c.consent_type='ai_model_training_and_service_improvement' and c.policy_version='doc:ai-training-terms@'||(d->>'version') and c.locale='zh-TW' and c.withdrawn_at is null where d->>'documentId'='ai-training-terms'),
 'preparationCompatibility',exists(select 1 from consumer_internal.rollout_state r join consumer_internal.preparation_cohort c on c.user_id=p_owner where not r.enforcing),
 'ageAttested',coalesce((select attested_18_plus from consumer_internal.social_age_qualifications where user_id=p_owner),false),
 'agePolicyVersion','social-adult-self-attestation-v1',
 'socialQualified',consumer_internal.social_qualified(p_owner),
 'participation',coalesce((select state from public.social_participation where user_id=p_owner),'not_participating'),
 'socialEligible',consumer_internal.social_qualified(p_owner) and exists(select 1 from public.social_participation where user_id=p_owner and state='opted_in'))
$$;
create function public.get_consumer_required_documents() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('available',consumer_internal.current_bundle() is not null,'bundle',consumer_internal.current_bundle())
$$;
create function public.get_authenticated_consumer_participation_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 return consumer_internal.current_state(auth.uid());
end $$;

create function consumer_internal.accept_required(p_owner uuid,p_bundle text,p_presented jsonb,p_training_only boolean) returns void language plpgsql security definer set search_path='' as $$
declare b jsonb; d jsonb; expected jsonb;
begin
 perform consumer_internal.owner_lock(p_owner); b:=consumer_internal.current_bundle();
 if b is null or p_bundle is distinct from b->>'bundleVersion' then raise exception 'CURRENT_DOCUMENTS_UNAVAILABLE_OR_STALE' using errcode='22023'; end if;
 select jsonb_agg(jsonb_build_object('documentId',x->>'documentId','version',x->>'version','contentSha256',x->>'contentSha256') order by x->>'documentId') into expected
 from jsonb_array_elements(b->'documents') x where not p_training_only or x->>'documentId'='ai-training-terms';
 if p_presented is distinct from expected then raise exception 'EXACT_PRESENTED_DOCUMENTS_REQUIRED' using errcode='22023'; end if;
 for d in select * from jsonb_array_elements(b->'documents') loop
 if not p_training_only or d->>'documentId'='ai-training-terms' then
 if not exists(select 1 from public.consumer_data_consents c where c.user_id=p_owner and c.consent_type=d->>'consentType'
 and c.policy_version='doc:'||(d->>'documentId')||'@'||(d->>'version') and c.locale='zh-TW' and c.withdrawn_at is null) then
 insert into public.consumer_data_consents(user_id,consent_type,policy_version,source_surface,locale)
 values(p_owner,d->>'consentType','doc:'||(d->>'documentId')||'@'||(d->>'version'),'pc2-explicit-required-consent','zh-TW');
 end if; end if; end loop;
end $$;
create function public.complete_authenticated_consumer_account_onboarding(p_bundle_version text,p_presented_documents jsonb,p_accept_terms boolean,p_acknowledge_privacy boolean,p_grant_training boolean,p_display_name text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); anonymous_label text; display_label text; random_bytes bytea; alphabet text:='23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; i integer;
begin
 perform consumer_internal.owner_lock(owner_id);
 if p_accept_terms is distinct from true or p_acknowledge_privacy is distinct from true or p_grant_training is distinct from true then
 raise exception 'ALL_REQUIRED_EXPLICIT_CONSENTS_REQUIRED' using errcode='22023'; end if;
 -- Accept first in the SAME transaction. Any later provisioning error rolls back all rows.
 perform consumer_internal.accept_required(owner_id,p_bundle_version,p_presented_documents,false);
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':pc2_profile',0));
 if exists(select 1 from public.consumer_profiles where user_id=owner_id and (status<>'active' or deleted_at is not null)) then
 raise exception 'ACCOUNT_NOT_ACTIVE' using errcode='42501'; end if;
 if p_display_name is not null and p_display_name ~ '[[:cntrl:]]' then raise exception 'DISPLAY_NAME_INVALID' using errcode='22023'; end if;
 display_label:=nullif(regexp_replace(btrim(p_display_name),'\s+',' ','g'),'');
 if display_label is not null and length(display_label)>20 then raise exception 'DISPLAY_NAME_INVALID' using errcode='22023'; end if;
 if not exists(select 1 from public.consumer_profiles where user_id=owner_id) then
 random_bytes:=uuid_send(gen_random_uuid()); anonymous_label:='飯友 ';
 for i in 0..5 loop anonymous_label:=anonymous_label||substr(alphabet,(get_byte(random_bytes,i)%32)+1,1); end loop;
 begin
 insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key,visibility,willing_to_chat,status,locale,timezone)
 values(owner_id,gen_random_uuid()::text,coalesce(display_label,anonymous_label),anonymous_label,'BG','private',false,'active','zh-TW','Asia/Taipei');
 exception when unique_violation then
 insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key,visibility,willing_to_chat,status,locale,timezone)
 values(owner_id,gen_random_uuid()::text,coalesce(display_label,anonymous_label),anonymous_label,'BG','private',false,'active','zh-TW','Asia/Taipei');
 end;
 end if;
 return consumer_internal.current_state(owner_id);
end $$;
create function public.grant_authenticated_ai_training_consent(p_bundle_version text,p_presented_documents jsonb,p_grant_training boolean)
 returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform consumer_internal.owner_lock(auth.uid());
 if p_grant_training is distinct from true then raise exception 'EXPLICIT_TRAINING_GRANT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.consumer_profiles where user_id=auth.uid() and status='active' and deleted_at is null) then raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode='42501'; end if;
 perform consumer_internal.accept_required(auth.uid(),p_bundle_version,p_presented_documents,true);
 return consumer_internal.current_state(auth.uid());
end $$;
create function public.withdraw_authenticated_ai_training_consent() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform consumer_internal.owner_lock(auth.uid());
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':social_participation',0));
 update public.consumer_data_consents set withdrawn_at=clock_timestamp() where user_id=auth.uid() and withdrawn_at is null
 and consent_type='ai_model_training_and_service_improvement' and policy_version ~ '^doc:ai-training-terms@[A-Za-z0-9][A-Za-z0-9._-]{0,63}$';
 update public.social_participation set state='paused',updated_at=clock_timestamp() where user_id=auth.uid() and state='opted_in';
 return consumer_internal.current_state(auth.uid());
end $$;
create function public.attest_authenticated_social_adult(p_attested_18_plus boolean) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform consumer_internal.owner_lock(auth.uid());
 if p_attested_18_plus is null then raise exception 'EXPLICIT_AGE_ATTESTATION_REQUIRED' using errcode='22023'; end if;
 insert into consumer_internal.social_age_qualifications(user_id,attested_18_plus,policy_version,attested_at)
 values(auth.uid(),p_attested_18_plus,'social-adult-self-attestation-v1',clock_timestamp())
 on conflict(user_id) do update set attested_18_plus=excluded.attested_18_plus,attested_at=excluded.attested_at
 where social_age_qualifications.attested_18_plus is distinct from excluded.attested_18_plus;
 if not p_attested_18_plus then
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':social_participation',0));
 update public.social_participation set state='paused',updated_at=clock_timestamp() where user_id=auth.uid() and state='opted_in';
 end if;
 return consumer_internal.current_state(auth.uid());
end $$;
revoke all on function public.get_consumer_required_documents() from public,anon,authenticated,authenticator,service_role;
grant execute on function public.get_consumer_required_documents() to anon,authenticated;
revoke all on function public.get_authenticated_consumer_participation_state() from public,anon,authenticated,authenticator,service_role;
revoke all on function public.complete_authenticated_consumer_account_onboarding(text,jsonb,boolean,boolean,boolean,text) from public,anon,authenticated,authenticator,service_role;
revoke all on function public.grant_authenticated_ai_training_consent(text,jsonb,boolean) from public,anon,authenticated,authenticator,service_role;
revoke all on function public.withdraw_authenticated_ai_training_consent() from public,anon,authenticated,authenticator,service_role;
revoke all on function public.attest_authenticated_social_adult(boolean) from public,anon,authenticated,authenticator,service_role;
grant execute on function public.get_authenticated_consumer_participation_state(),public.complete_authenticated_consumer_account_onboarding(text,jsonb,boolean,boolean,boolean,text),public.grant_authenticated_ai_training_consent(text,jsonb,boolean),public.withdraw_authenticated_ai_training_consent(),public.attest_authenticated_social_adult(boolean) to authenticated;
revoke all on all functions in schema consumer_internal from public,anon,authenticated,authenticator,service_role;
-- Actor-only RLS calls need schema usage and this one predicate, never arbitrary private subjects.
create function public.consumer_core_eligible() returns boolean language sql stable security definer set search_path='' as $$ select consumer_internal.core_eligible(auth.uid()) $$;
revoke all on function public.consumer_core_eligible() from public,anon,authenticated,authenticator,service_role;
grant execute on function public.consumer_core_eligible() to authenticated;
commit;
