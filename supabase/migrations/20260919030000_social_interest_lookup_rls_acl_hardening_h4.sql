-- H4 (pre-Admin hardening) -- RLS and client-privilege hardening of the two Social interest lookup
-- tables: public.social_interest_catalog and public.social_interest_catalog_label.
--
-- These are data-driven, read-only-for-clients lookup catalogs (SR-2C-R1). Their effective client
-- posture is preserved exactly: `authenticated` may read every row; `anon` reads nothing; no client
-- role writes, truncates or creates triggers/references on them. What changes is that the posture is now
-- ENFORCED by row-level security and a minimal ACL instead of resting on the absence of a grant:
--   * RLS is enabled. Because readers other than `authenticated` exist, each of them gets an explicit
--     SELECT policy -- a column grant without a matching policy would silently return ZERO rows under RLS.
--       - social_profile_projection_authority   (project_public_social_interests)
--       - meal_buddy_candidate_pool_authority   (canonical_meal_buddy_context_candidates)
--       - meal_buddy_card_write_authority       (create_meal_buddy_card_with_context / _from_recommendation)
--     The table owner (postgres) is exempt from non-forced RLS, so the owner-run interest-settings
--     functions and the foreign-key integrity checks that reference the catalog are unaffected.
--   * The default-privilege residue is removed from client roles: anon loses everything;
--     authenticated keeps SELECT only (drops MAINTAIN, REFERENCES, TRIGGER, TRUNCATE).
-- service_role and the sealed roles' column-scoped SELECT grants are left untouched.
-- No data, no column, no function and no other table is changed.
begin;

alter table public.social_interest_catalog enable row level security;
alter table public.social_interest_catalog_label enable row level security;

create policy social_interest_catalog_authenticated_read
  on public.social_interest_catalog as permissive for select to authenticated using (true);
create policy social_interest_catalog_projection_authority_read
  on public.social_interest_catalog as permissive for select to social_profile_projection_authority using (true);
create policy social_interest_catalog_candidate_pool_authority_read
  on public.social_interest_catalog as permissive for select to meal_buddy_candidate_pool_authority using (true);
create policy social_interest_catalog_card_write_authority_read
  on public.social_interest_catalog as permissive for select to meal_buddy_card_write_authority using (true);
create policy social_interest_catalog_label_authenticated_read
  on public.social_interest_catalog_label as permissive for select to authenticated using (true);

revoke all on table public.social_interest_catalog from anon, authenticated;
revoke all on table public.social_interest_catalog_label from anon, authenticated;
grant select on table public.social_interest_catalog to authenticated;
grant select on table public.social_interest_catalog_label to authenticated;

-- Fail-closed epilogue (catalog-verified, not inferred from the absence of an error).
do $$
declare
  v_table text;
  v_client text;
  v_priv text;
  v_policies text;
begin
  foreach v_table in array array['public.social_interest_catalog', 'public.social_interest_catalog_label'] loop
    if not (select relrowsecurity and not relforcerowsecurity from pg_catalog.pg_class where oid = v_table::regclass) then
      raise exception 'H4: % must have RLS enabled and not forced (owner-exempt)', v_table;
    end if;
    foreach v_client in array array['anon', 'authenticated'] loop
      foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
        if pg_catalog.has_table_privilege(v_client, v_table, v_priv) then
          raise exception 'H4: % still holds % on %', v_client, v_priv, v_table;
        end if;
      end loop;
    end loop;
    if pg_catalog.has_table_privilege('anon', v_table, 'SELECT') then
      raise exception 'H4: anon must not read %', v_table;
    end if;
    if not pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT') then
      raise exception 'H4: authenticated must keep SELECT on %', v_table;
    end if;
    if exists (select 1 from pg_catalog.pg_policy p where p.polrelid = v_table::regclass and (p.polcmd <> 'r' or not p.polpermissive)) then
      raise exception 'H4: % may carry only permissive SELECT policies', v_table;
    end if;
  end loop;

  select string_agg(pg_get_userbyid(r) || ':' || pol.polname, ',' order by pol.polname) into v_policies
  from pg_catalog.pg_policy pol, lateral unnest(pol.polroles) as r
  where pol.polrelid = 'public.social_interest_catalog'::regclass;
  if v_policies is distinct from 'authenticated:social_interest_catalog_authenticated_read,meal_buddy_candidate_pool_authority:social_interest_catalog_candidate_pool_authority_read,meal_buddy_card_write_authority:social_interest_catalog_card_write_authority_read,social_profile_projection_authority:social_interest_catalog_projection_authority_read' then
    raise exception 'H4: unexpected catalog policy set: %', v_policies;
  end if;
  select string_agg(pg_get_userbyid(r) || ':' || pol.polname, ',' order by pol.polname) into v_policies
  from pg_catalog.pg_policy pol, lateral unnest(pol.polroles) as r
  where pol.polrelid = 'public.social_interest_catalog_label'::regclass;
  if v_policies is distinct from 'authenticated:social_interest_catalog_label_authenticated_read' then
    raise exception 'H4: unexpected label policy set: %', v_policies;
  end if;

  -- The three sealed readers keep their column-scoped SELECT (unchanged) and now have the matching policy.
  if not (pg_catalog.has_column_privilege('social_profile_projection_authority', 'public.social_interest_catalog', 'tag_key', 'SELECT')
      and pg_catalog.has_column_privilege('meal_buddy_candidate_pool_authority', 'public.social_interest_catalog', 'tag_key', 'SELECT')
      and pg_catalog.has_column_privilege('meal_buddy_card_write_authority', 'public.social_interest_catalog', 'tag_key', 'SELECT')) then
    raise exception 'H4: a sealed reader lost its column SELECT grant';
  end if;
end;
$$;

commit;
