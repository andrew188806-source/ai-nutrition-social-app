-- TastKind R0-B-CAP: server T0 and provenance capture only. No tier, grant, entitlement read, backfill or purge.
BEGIN;
-- Native authenticated database owner + CREATEROLE, or native superuser (F2; identical to the accepted foundation).
-- Native authenticated database owner + CREATEROLE, or native superuser.
-- Role names and caller settings do not confer deployment authority.
DO $$ BEGIN
 IF current_user <> session_user OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles r
  JOIN pg_catalog.pg_database d ON d.datname = pg_catalog.current_database()
  WHERE r.rolname = current_user AND r.rolcanlogin
    AND (r.rolsuper OR (r.oid = d.datdba AND r.rolcreaterole))
 ) THEN
  RAISE EXCEPTION 'RETENTION_DDL_ACTOR_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
END $$;
-- Approved management boundary (2026-10-04 Owner points 1/2): only the disclosed
-- non-superuser management profiles may hold predefined data-wide read; nobody may
-- hold data-wide write; App runtime roots reach no data-wide or management identity.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles r
  WHERE NOT r.rolsuper AND r.rolname NOT IN ('pg_read_all_data','pg_write_all_data')
    AND (pg_catalog.pg_has_role(r.oid,'pg_write_all_data','MEMBER')
      OR (pg_catalog.pg_has_role(r.oid,'pg_read_all_data','MEMBER')
        AND r.rolname NOT IN ('postgres','cli_login_postgres','supabase_etl_admin','supabase_read_only_user')))
 ) OR EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles a CROSS JOIN pg_catalog.pg_roles p
  WHERE a.rolname IN ('anon','authenticated','service_role','authenticator','social_runtime_executor','tastkind_admin_step_up_broker')
    AND (a.rolsuper OR ((p.rolsuper OR p.rolname IN ('pg_read_all_data','pg_write_all_data','postgres','cli_login_postgres','supabase_etl_admin','supabase_read_only_user'))
      AND pg_catalog.pg_has_role(a.oid,p.oid,'MEMBER')))
 ) THEN
  RAISE EXCEPTION 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE' USING ERRCODE='42501';
 END IF;
END $$;
-- Capture guard G1 (same transaction, before any DDL): plain local apply only. Any Supabase platform marker or R0-B binding
-- setting is refused; a Hosted-bound mode does not exist in this migration and needs separate authorization.
DO $cap_g1$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_markers text[];
BEGIN
 SELECT COALESCE(pg_catalog.array_agg(x.m ORDER BY x.m COLLATE "C"), ARRAY[]::text[]) INTO v_markers FROM (
  SELECT 'role:' || r.rolname AS m FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin')
  UNION ALL SELECT 'schema:supabase_migrations' WHERE pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
  UNION ALL SELECT 'setting:supautils' WHERE NULLIF(pg_catalog.current_setting('supautils.reserved_roles', true), '') IS NOT NULL
 ) x;
 IF pg_catalog.cardinality(v_markers) > 0 THEN
  RAISE EXCEPTION 'CAP_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
 END IF;
 IF NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '') IS NOT NULL THEN
  RAISE EXCEPTION 'CAP_BINDINGS_NOT_SUPPORTED' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('public.meal_records') IS NULL THEN
  RAISE EXCEPTION 'CAP_MEAL_RECORDS_MISSING' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder'))
   OR pg_catalog.to_regnamespace('retention_capture') IS NOT NULL
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid = pg_catalog.to_regclass('public.meal_records') AND t.tgname = 'retention_capture_t0') THEN
  RAISE EXCEPTION 'CAP_CAPTURE_PRESENT' USING ERRCODE='42710';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 PERFORM pg_catalog.set_config('tastkind.cap_scope_digest', (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_capture_owner','consumer_retention_capture_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_capture' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_capture','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_capture','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_capture' AND t.tgname <> 'retention_capture_t0' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.oid = t.tgconstraint AND k.connamespace = pg_catalog.to_regnamespace('retention_capture')))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_capture','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_capture'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
 ), true);
 PERFORM pg_catalog.set_config('search_path', v_path, true);
 RAISE NOTICE 'CAP_DDL_BOUNDARY';
END $cap_g1$;
-- Disposable builder owns no SQL objects. Its bootstrap ADMIN edge dies on DROP ROLE.
CREATE ROLE consumer_retention_capture_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_capture_builder TO %I WITH INHERIT FALSE, SET TRUE',session_user);
END $$;
SET LOCAL ROLE consumer_retention_capture_builder;
CREATE ROLE consumer_retention_capture_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_capture_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);
END $$;
RESET ROLE;
CREATE SCHEMA retention_capture AUTHORIZATION consumer_retention_capture_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_capture_owner IN SCHEMA retention_capture REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_capture_owner IN SCHEMA retention_capture REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_capture_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- One immutable anchor per newly saved meal record. T0 = server transaction timestamp truncated to UTC milliseconds.
-- No tier, grant, entitlement or retention-deadline column exists here by design.
CREATE TABLE retention_capture.detail_capture_anchors (
 resource_id uuid PRIMARY KEY REFERENCES public.meal_records(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL,
 original_recorded_at timestamptz NOT NULL CONSTRAINT anchor_t0_instant CHECK (
  pg_catalog.isfinite(original_recorded_at) AND original_recorded_at >= timestamptz '0001-01-01 00:00:00+00'
  AND original_recorded_at < timestamptz '10000-01-01 00:00:00+00' AND pg_catalog.date_trunc('milliseconds', original_recorded_at) = original_recorded_at),
 capture_kind text NOT NULL CONSTRAINT anchor_capture_kind CHECK (capture_kind = 'canonical_meal_insert'),
 capture_contract_version text NOT NULL CONSTRAINT anchor_contract_version CHECK (capture_contract_version = 'retention-capture-v1'),
 capture_context text NOT NULL CONSTRAINT anchor_capture_context CHECK (capture_context IN ('authenticated_actor','no_actor_claim'))
);

CREATE FUNCTION retention_capture.reject_anchor_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'RETENTION_CAPTURE_ANCHOR_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER anchor_immutable BEFORE UPDATE ON retention_capture.detail_capture_anchors
 FOR EACH ROW EXECUTE FUNCTION retention_capture.reject_anchor_update();

-- Fail-closed capture. Runs in the INSERT transaction of public.meal_records; any failure aborts the whole insert.
-- T0 never reads occurred_at, meal_date, created_at, a payload, a caller setting or subscription data.
-- The actor claim mirrors auth.uid(); it only labels provenance and never changes T0.
CREATE FUNCTION retention_capture.capture_meal_record_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_t0 timestamptz;
 v_claim text;
 v_context text := 'no_actor_claim';
BEGIN
 IF TG_OP <> 'INSERT' OR TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW' OR TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'meal_records' THEN
  RAISE EXCEPTION 'RETENTION_CAPTURE_TRIGGER_MISUSE' USING ERRCODE='42501';
 END IF;
 v_t0 := pg_catalog.date_trunc('milliseconds', pg_catalog.transaction_timestamp());
 v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '');
 IF v_claim IS NULL THEN
  BEGIN
   v_claim := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::pg_catalog.jsonb ->> 'sub';
  EXCEPTION WHEN invalid_text_representation THEN
   v_claim := NULL;
  END;
 END IF;
 IF v_claim ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  IF v_claim::pg_catalog.uuid = NEW.user_id THEN
   v_context := 'authenticated_actor';
  END IF;
 END IF;
 INSERT INTO retention_capture.detail_capture_anchors
  (resource_id, owner_user_id, original_recorded_at, capture_kind, capture_contract_version, capture_context)
 VALUES (NEW.id, NEW.user_id, v_t0, 'canonical_meal_insert', 'retention-capture-v1', v_context);
 RETURN NULL;
END $$;

ALTER FUNCTION retention_capture.reject_anchor_update() OWNER TO consumer_retention_capture_owner;
ALTER FUNCTION retention_capture.capture_meal_record_insert() OWNER TO consumer_retention_capture_owner;
ALTER TABLE retention_capture.detail_capture_anchors OWNER TO consumer_retention_capture_owner;
ALTER TABLE retention_capture.detail_capture_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_capture.detail_capture_anchors FORCE ROW LEVEL SECURITY;
CREATE POLICY capture_owner_insert ON retention_capture.detail_capture_anchors AS PERMISSIVE FOR INSERT
 TO consumer_retention_capture_owner WITH CHECK (true);
CREATE TRIGGER retention_capture_t0 AFTER INSERT ON public.meal_records
 FOR EACH ROW EXECUTE FUNCTION retention_capture.capture_meal_record_insert();

-- Revoke even grants inherited from the migration operator's existing defaults.
-- Revoke even grants inherited from the migration operator's existing defaults.
REVOKE ALL ON SCHEMA retention_capture FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_capture FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_capture FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_capture FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname <> 'consumer_retention_capture_owner'
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA retention_capture FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA retention_capture FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_capture FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_capture FROM %I',r.rolname);
 END LOOP;
END $$;
SET LOCAL ROLE consumer_retention_capture_builder;
DO $$ BEGIN
 EXECUTE pg_catalog.format('REVOKE consumer_retention_capture_owner FROM %I',session_user);
END $$;
RESET ROLE;
DROP ROLE consumer_retention_capture_builder;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
   ON r.oid IN (m.roleid,m.member,m.grantor) WHERE r.rolname = 'consumer_retention_capture_owner') THEN
  RAISE EXCEPTION 'RETENTION_SEALED_OWNER_MEMBERSHIP_RESIDUE' USING ERRCODE='42501';
 END IF;
END $$;
-- Approved management boundary (2026-10-04 Owner points 1/2): only the disclosed
-- non-superuser management profiles may hold predefined data-wide read; nobody may
-- hold data-wide write; App runtime roots reach no data-wide or management identity.
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles r
  WHERE NOT r.rolsuper AND r.rolname NOT IN ('pg_read_all_data','pg_write_all_data')
    AND (pg_catalog.pg_has_role(r.oid,'pg_write_all_data','MEMBER')
      OR (pg_catalog.pg_has_role(r.oid,'pg_read_all_data','MEMBER')
        AND r.rolname NOT IN ('postgres','cli_login_postgres','supabase_etl_admin','supabase_read_only_user')))
 ) OR EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles a CROSS JOIN pg_catalog.pg_roles p
  WHERE a.rolname IN ('anon','authenticated','service_role','authenticator','social_runtime_executor','tastkind_admin_step_up_broker')
    AND (a.rolsuper OR ((p.rolsuper OR p.rolname IN ('pg_read_all_data','pg_write_all_data','postgres','cli_login_postgres','supabase_etl_admin','supabase_read_only_user'))
      AND pg_catalog.pg_has_role(a.oid,p.oid,'MEMBER')))
 ) THEN
  RAISE EXCEPTION 'RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE' USING ERRCODE='42501';
 END IF;
END $$;
-- Capture guard G2: unchanged scope outside the new objects, then the exact post-state.
DO $cap_g2$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_post text;
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 v_scope := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_capture_owner','consumer_retention_capture_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_capture' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_capture','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_capture','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_capture' AND t.tgname <> 'retention_capture_t0' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.oid = t.tgconstraint AND k.connamespace = pg_catalog.to_regnamespace('retention_capture')))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_capture','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_capture'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
 );
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.cap_scope_digest') THEN
  RAISE EXCEPTION 'CAP_POST_GUARD_DRIFT' USING ERRCODE='42501';
 END IF;
 v_post := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(n.nspowner)::text, n.nspacl::text) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_capture'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, c.relkind, pg_catalog.pg_get_userbyid(c.relowner)::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.reloptions::text) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_capture')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attgenerated, a.attidentity, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname::text COLLATE "C", a.attnum)
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_capture') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.conname::text, o.contype, pg_catalog.pg_get_constraintdef(o.oid)) ORDER BY c.relname::text COLLATE "C", o.conname::text COLLATE "C")
   FROM pg_catalog.pg_constraint o JOIN pg_catalog.pg_class c ON c.oid = o.conrelid WHERE o.connamespace = pg_catalog.to_regnamespace('retention_capture')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_capture')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, t.tgname::text, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND (c.relnamespace = pg_catalog.to_regnamespace('retention_capture') OR (c.oid = pg_catalog.to_regclass('public.meal_records') AND t.tgname = 'retention_capture_t0'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(p.proowner)::text, p.proacl::text, p.proconfig::text, p.prosecdef,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex')) ORDER BY p.proname::text COLLATE "C")
   FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_capture')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.polname::text, o.polcmd, o.polpermissive,
     ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text,
     COALESCE(pg_catalog.pg_get_expr(o.polqual, o.polrelid), ''), COALESCE(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid), '')) ORDER BY c.relname::text COLLATE "C", o.polname::text COLLATE "C")
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_capture')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(COALESCE(n.nspname::text, ''), d.defaclobjtype, d.defaclacl::text) ORDER BY COALESCE(n.nspname::text, '') COLLATE "C", d.defaclobjtype)
   FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'consumer_retention_capture_owner'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil IS NULL) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member, m.grantor) WHERE r.rolname IN ('consumer_retention_capture_owner','consumer_retention_capture_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'consumer_retention_capture_owner' AND n.nspname <> 'retention_capture' AND n.nspname !~ '^pg_toast'),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'consumer_retention_capture_owner' AND p.pronamespace <> pg_catalog.to_regnamespace('retention_capture'))
)::text, 'UTF8')), 'hex')
 );
 IF v_post IS DISTINCT FROM '3d314fc9c334f02d04932662c80617011bfef13fe418024b98fdc72538e22f76' THEN
  RAISE EXCEPTION 'CAP_POST_STATE_MISMATCH expected=3d314fc9c334f02d04932662c80617011bfef13fe418024b98fdc72538e22f76 observed=%', v_post USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $cap_g2$;
COMMIT;
