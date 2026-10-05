-- R0-B inactive storage only. No runtime producer, capture, backfill or effective grant.
BEGIN;
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
-- R0-B-C1 same-transaction binding guard G1 (2026-10-05). Runs before any DDL.
-- Modes: hosted-development (committed manifest hash), local-fixture (superuser
-- attestation) or plain local compatibility (no Supabase platform marker present).
DO $r0b_g1$
DECLARE
 v_selector text := NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '');
 v_manifest_text text := NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '');
 v_nonce text := NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '');
 v_path text := pg_catalog.current_setting('search_path');
 v_markers text[];
 v_mode text;
 v_manifest jsonb;
 v_observed jsonb;
 v_mismatch text[] := ARRAY[]::text[];
 v_query text := pg_catalog.current_query();
 v_header text := '-- R0-B inactive ' || 'storage only.';
 v_pos integer;
 v_source text;
 v_attested integer;
BEGIN
 SELECT COALESCE(pg_catalog.array_agg(x.m ORDER BY x.m COLLATE "C"), ARRAY[]::text[]) INTO v_markers FROM (
  SELECT 'role:' || r.rolname AS m FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin')
  UNION ALL SELECT 'schema:supabase_migrations' WHERE pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
  UNION ALL SELECT 'setting:supautils' WHERE NULLIF(pg_catalog.current_setting('supautils.reserved_roles', true), '') IS NOT NULL
 ) x;
 IF v_selector IS NULL THEN
  IF v_manifest_text IS NOT NULL OR v_nonce IS NOT NULL THEN
   RAISE EXCEPTION 'R0B_SELECTOR_MISSING_WITH_BINDINGS' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.cardinality(v_markers) > 0 THEN
   RAISE EXCEPTION 'R0B_PLATFORM_SELECTOR_REQUIRED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
  END IF;
  v_mode := 'plain-local';
 ELSIF v_selector = 'hosted-development' THEN
  IF v_nonce IS NOT NULL OR v_manifest_text IS NULL
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_manifest_text, 'UTF8')), 'hex')
       <> '2630322532a4b2a2864dc3cdb8f01c8e6838ebe9ead85bc5719b3f4ef746e59c' THEN
   RAISE EXCEPTION 'R0B_HOSTED_MANIFEST_NOT_BOUND' USING ERRCODE='42501';
  END IF;
  v_mode := 'hosted-development';
 ELSIF v_selector = 'local-fixture' THEN
  IF v_markers && ARRAY['role:pgbouncer','role:supabase_auth_admin','role:dashboard_user','setting:supautils'] THEN
   RAISE EXCEPTION 'R0B_FIXTURE_ON_PLATFORM %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
  END IF;
  IF v_manifest_text IS NULL OR v_nonce IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_roles o ON o.oid = c.relowner
    WHERE c.oid = pg_catalog.to_regclass('tastkind_r0b_fixture.attestation') AND c.relowner = 10 AND o.rolsuper) THEN
   RAISE EXCEPTION 'R0B_FIXTURE_NOT_ATTESTED' USING ERRCODE='42501';
  END IF;
  EXECUTE 'SELECT pg_catalog.count(*)::integer FROM tastkind_r0b_fixture.attestation a WHERE a.nonce = $1 AND a.manifest_sha256 = $2 AND (SELECT pg_catalog.count(*) FROM tastkind_r0b_fixture.attestation) = 1'
   INTO v_attested USING v_nonce, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_manifest_text, 'UTF8')), 'hex');
  IF v_attested <> 1 THEN
   RAISE EXCEPTION 'R0B_FIXTURE_NOT_ATTESTED' USING ERRCODE='42501';
  END IF;
  v_mode := 'local-fixture';
 ELSE
  RAISE EXCEPTION 'R0B_SELECTOR_INVALID' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('tastkind.r0b_mode', v_mode, true);
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder'))
   OR pg_catalog.to_regnamespace('retention_internal') IS NOT NULL THEN
  RAISE EXCEPTION 'R0B_RETENTION_PRESENT' USING ERRCODE='42710';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 IF v_mode <> 'plain-local' THEN
  v_manifest := v_manifest_text::jsonb;
  IF v_manifest->>'format' IS DISTINCT FROM 'tastkind-r0b-binding-manifest-v1' OR v_manifest->>'kind' IS DISTINCT FROM v_mode THEN
   RAISE EXCEPTION 'R0B_MANIFEST_KIND' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
   RAISE EXCEPTION 'R0B_PRESTATE_BINDING_MISMATCH HISTORY' USING ERRCODE='42501';
  END IF;
  v_observed := (
-- r0b:observe:begin
SELECT pg_catalog.jsonb_build_object(
 'target', (SELECT pg_catalog.jsonb_build_object('database', d.datname::text, 'databaseOid', d.oid::text, 'owner', pg_catalog.pg_get_userbyid(d.datdba)::text, 'ownerOid', d.datdba::text)
   FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database()),
 'actor', (SELECT pg_catalog.jsonb_build_object('session', SESSION_USER::text, 'current', CURRENT_USER::text, 'oid', r.oid::text)
   FROM pg_catalog.pg_roles r WHERE r.rolname = CURRENT_USER),
 'roles', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', r.rolname::text, 'oid', r.oid::text, 'login', r.rolcanlogin, 'inherit', r.rolinherit,
     'createdb', r.rolcreatedb, 'bypassrls', r.rolbypassrls, 'superuser', r.rolsuper, 'createrole', r.rolcreaterole, 'replication', r.rolreplication,
     'valid_until', pg_catalog.to_char(r.rolvaliduntil AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), 'connection_limit', r.rolconnlimit) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r),
 'memberships', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('member', mr.rolname::text, 'role', rr.rolname::text, 'grantor', gr.rolname::text,
     'admin', m.admin_option, 'inherit', m.inherit_option, 'set', m.set_option) ORDER BY mr.rolname::text COLLATE "C", rr.rolname::text COLLATE "C", gr.rolname::text COLLATE "C")
   FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles mr ON mr.oid = m.member JOIN pg_catalog.pg_roles rr ON rr.oid = m.roleid JOIN pg_catalog.pg_roles gr ON gr.oid = m.grantor),
 'functions', (SELECT pg_catalog.jsonb_agg(o.v ORDER BY k.ord)
   FROM pg_catalog.jsonb_array_elements(pg_catalog.current_setting('tastkind.r0b_manifest')::jsonb->'functions') WITH ORDINALITY k(f, ord)
   CROSS JOIN LATERAL (SELECT COALESCE((SELECT pg_catalog.jsonb_build_object('schema', n.nspname::text, 'name', p.proname::text, 'arguments', pg_catalog.pg_get_function_arguments(p.oid),
       'oid', p.oid::text, 'owner', pg_catalog.pg_get_userbyid(p.proowner)::text, 'config', pg_catalog.to_jsonb(p.proconfig), 'acl', pg_catalog.to_jsonb(p.proacl),
       'security_definer', p.prosecdef, 'definition_sha256', pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex'))
     FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = k.f->>'schema' AND p.proname = k.f->>'name' AND pg_catalog.pg_get_function_arguments(p.oid) = k.f->>'arguments'),
     pg_catalog.jsonb_build_object('schema', k.f->>'schema', 'name', k.f->>'name', 'arguments', k.f->>'arguments', 'missing', true)) AS v) o),
 'tableHooks', (SELECT pg_catalog.jsonb_agg(o.v ORDER BY k.ord)
   FROM pg_catalog.jsonb_array_elements(pg_catalog.current_setting('tastkind.r0b_manifest')::jsonb->'tableHooks') WITH ORDINALITY k(t, ord)
   CROSS JOIN LATERAL (SELECT COALESCE((SELECT pg_catalog.jsonb_build_object('schema', n.nspname::text, 'table', c.relname::text, 'kind', c.relkind,
       'owner', pg_catalog.pg_get_userbyid(c.relowner)::text, 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
       'triggers', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', t.tgname::text, 'definition', pg_catalog.pg_get_triggerdef(t.oid), 'function', t.tgfoid::regprocedure::text) ORDER BY t.tgname::text COLLATE "C")
         FROM pg_catalog.pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal),
       'rules', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', w.rulename::text, 'definition', pg_catalog.pg_get_ruledef(w.oid)) ORDER BY w.rulename::text COLLATE "C")
         FROM pg_catalog.pg_rewrite w WHERE w.ev_class = c.oid AND w.rulename <> '_RETURN'))
     FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = k.t->>'schema' AND c.relname = k.t->>'table'),
     pg_catalog.jsonb_build_object('schema', k.t->>'schema', 'table', k.t->>'table', 'absent', true)) AS v) o),
 'hooksDisabled', (SELECT pg_catalog.count(*)::integer FROM pg_catalog.jsonb_array_elements(pg_catalog.current_setting('tastkind.r0b_manifest')::jsonb->'tableHooks') k(t)
   JOIN pg_catalog.pg_namespace n ON n.nspname = k.t->>'schema' JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = k.t->>'table'
   JOIN pg_catalog.pg_trigger g ON g.tgrelid = c.oid AND NOT g.tgisinternal WHERE g.tgenabled <> 'O'),
 'history', pg_catalog.jsonb_build_object(
   'columns', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('column', a.attname::text, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
     FROM pg_catalog.pg_attribute a WHERE a.attrelid = pg_catalog.to_regclass('supabase_migrations.schema_migrations') AND a.attnum > 0 AND NOT a.attisdropped),
   'versions', (SELECT pg_catalog.jsonb_agg(s.version ORDER BY s.version COLLATE "C") FROM supabase_migrations.schema_migrations s))
)
-- r0b:observe:end
  );
  IF v_observed->'target' IS DISTINCT FROM v_manifest->'target' THEN v_mismatch := v_mismatch || 'TARGET'::text; END IF;
  IF v_observed->'actor' IS DISTINCT FROM v_manifest->'actor' THEN v_mismatch := v_mismatch || 'ACTOR'::text; END IF;
  IF v_observed->'roles' IS DISTINCT FROM v_manifest->'roles' THEN v_mismatch := v_mismatch || 'ROLES'::text; END IF;
  IF v_observed->'memberships' IS DISTINCT FROM v_manifest->'memberships' THEN v_mismatch := v_mismatch || 'MEMBERSHIPS'::text; END IF;
  IF v_observed->'functions' IS DISTINCT FROM v_manifest->'functions' THEN v_mismatch := v_mismatch || 'FUNCTIONS'::text; END IF;
  IF v_observed->'tableHooks' IS DISTINCT FROM v_manifest->'tableHooks' THEN v_mismatch := v_mismatch || 'TABLE_HOOKS'::text; END IF;
  IF v_observed->'history' IS DISTINCT FROM v_manifest->'history' THEN v_mismatch := v_mismatch || 'HISTORY'::text; END IF;
  IF (v_observed->>'hooksDisabled')::integer IS DISTINCT FROM 0 THEN v_mismatch := v_mismatch || 'TABLE_HOOKS_DISABLED'::text; END IF;
  IF pg_catalog.cardinality(v_mismatch) > 0 THEN
   RAISE EXCEPTION 'R0B_PRESTATE_BINDING_MISMATCH %', pg_catalog.array_to_string(v_mismatch, ',') USING ERRCODE='42501';
  END IF;
  v_pos := pg_catalog.strpos(v_query, v_header);
  IF v_pos = 0 OR (pg_catalog.length(v_query) - pg_catalog.length(pg_catalog.replace(v_query, v_header, ''))) <> pg_catalog.length(v_header) THEN
   RAISE EXCEPTION 'R0B_SOURCE_CAPTURE' USING ERRCODE='42501';
  END IF;
  IF pg_catalog.left(v_query, v_pos - 1) !~ '^(\s*SET\s+tastkind\.r0b_(target|manifest|fixture_nonce)\s*=\s*\$r0b\$[^$]*\$r0b\$\s*;)*\s*$' THEN
   RAISE EXCEPTION 'R0B_SOURCE_PREFIX' USING ERRCODE='42501';
  END IF;
  v_source := pg_catalog.substr(v_query, v_pos);
  IF v_source !~ 'COMMIT[;]\s*$' THEN
   RAISE EXCEPTION 'R0B_SOURCE_CAPTURE' USING ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.set_config('tastkind.r0b_source_text', v_source, true);
 END IF;
 PERFORM pg_catalog.set_config('tastkind.r0b_scope_digest', (
-- r0b:scope:begin
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_internal' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_internal','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_internal','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_internal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_internal','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_internal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
-- r0b:scope:end
 ), true);
 PERFORM pg_catalog.set_config('search_path', v_path, true);
 RAISE NOTICE 'R0B_DDL_BOUNDARY';
END $r0b_g1$;
-- Disposable builder owns no SQL objects. Its bootstrap ADMIN edge dies on DROP ROLE.
CREATE ROLE consumer_retention_ddl_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_ddl_builder TO %I WITH INHERIT FALSE, SET TRUE',session_user);
END $$;
SET LOCAL ROLE consumer_retention_ddl_builder;
CREATE ROLE consumer_retention_foundation_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_foundation_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);
END $$;
RESET ROLE;
CREATE SCHEMA retention_internal AUTHORIZATION consumer_retention_foundation_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_foundation_owner IN SCHEMA retention_internal REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_foundation_owner IN SCHEMA retention_internal REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_foundation_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE retention_internal.owner_authority_state (
 owner_user_id uuid PRIMARY KEY,
 revision bigint NOT NULL CHECK (revision >= 0),
 mode text NOT NULL CONSTRAINT owner_mode_inactive CHECK (mode = 'inactive'),
 coverage text NOT NULL CHECK (coverage = 'unknown'),
 producer_binding text CHECK (producer_binding IS NULL)
);
CREATE TABLE retention_internal.authority_events (
 event_id uuid PRIMARY KEY,
 owner_user_id uuid NOT NULL REFERENCES retention_internal.owner_authority_state(owner_user_id),
 source_namespace text NOT NULL CHECK (btrim(source_namespace) <> ''),
 upstream_event_id text NOT NULL CHECK (btrim(upstream_event_id) <> ''),
 event_schema_version text NOT NULL CHECK (event_schema_version = 'retention-event-v1'),
 policy_version text NOT NULL CHECK (policy_version = 'consumer-retention-owner-2026-10-03-v1'),
 claimed_producer text CHECK (claimed_producer IS NULL OR btrim(claimed_producer) <> ''),
 source_revision bigint CHECK (source_revision >= 0),
 source_sequence bigint CHECK (source_sequence >= 0),
 kind text NOT NULL CHECK (kind IN ('detail_create','paid_upgrade','entitlement_observation')),
 resource_id uuid,
 effective_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL CHECK (received_at >= effective_at),
 tier text NOT NULL CHECK (tier IN ('free','paid')),
 validity text NOT NULL CHECK (validity = 'unknown'),
 valid_from timestamptz,
 valid_until timestamptz,
 semantic_digest text NOT NULL CHECK (semantic_digest ~ '^[0-9a-f]{64}$'),
 provenance text NOT NULL CONSTRAINT event_provenance_unknown CHECK (provenance = 'unknown'),
 CHECK (kind <> 'detail_create' OR resource_id IS NOT NULL),
 CHECK (kind <> 'paid_upgrade' OR tier = 'paid'),
 CHECK (valid_until IS NULL OR (valid_from IS NOT NULL AND valid_until >= valid_from)),
 CHECK (valid_from IS NULL OR effective_at >= valid_from),
 CHECK (valid_until IS NULL OR effective_at <= valid_until),
 CONSTRAINT event_upstream_unique UNIQUE (owner_user_id, source_namespace, upstream_event_id),
 UNIQUE (owner_user_id,resource_id,event_id,kind),
 UNIQUE (owner_user_id,event_id,kind,policy_version),
 UNIQUE (owner_user_id,resource_id,event_id,kind,effective_at,tier,policy_version),
 UNIQUE (owner_user_id,event_id,kind,effective_at,tier,policy_version)
);
CREATE TABLE retention_internal.operation_receipts (
 receipt_id uuid PRIMARY KEY,
 owner_user_id uuid NOT NULL,
 event_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 event_kind text NOT NULL,
 policy_version text NOT NULL CHECK (policy_version = 'consumer-retention-owner-2026-10-03-v1'),
 creation_resource_id uuid GENERATED ALWAYS AS (CASE WHEN event_kind = 'detail_create' THEN resource_id END) STORED,
 operation_kind text NOT NULL CHECK (operation_kind IN ('detail_create','detail_extend','entitlement_observation')),
 idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
 before_revision bigint NOT NULL CHECK (before_revision >= 0),
 after_revision bigint NOT NULL CHECK (after_revision = before_revision),
 proposal_digest text NOT NULL CHECK (proposal_digest ~ '^[0-9a-f]{64}$'),
 outcome text NOT NULL CHECK (outcome IN ('held_inactive','rejected')),
 applied boolean NOT NULL CHECK (applied = false),
 CHECK (event_kind = CASE operation_kind WHEN 'detail_extend' THEN 'paid_upgrade' ELSE operation_kind END),
 CONSTRAINT receipt_owner_event_fk FOREIGN KEY (owner_user_id,event_id,event_kind,policy_version)
 REFERENCES retention_internal.authority_events(owner_user_id,event_id,kind,policy_version),
 CONSTRAINT receipt_creation_resource_fk FOREIGN KEY (owner_user_id,creation_resource_id,event_id,event_kind)
 REFERENCES retention_internal.authority_events(owner_user_id,resource_id,event_id,kind),
 UNIQUE (owner_user_id,event_id,resource_id,operation_kind),
 UNIQUE (owner_user_id,idempotency_key)
);
CREATE TABLE retention_internal.detail_grants (
 owner_user_id uuid NOT NULL,
 resource_id uuid NOT NULL,
 original_recorded_at timestamptz NOT NULL,
 acquisition_event_id uuid NOT NULL,
 acquisition_at timestamptz NOT NULL CHECK (acquisition_at = original_recorded_at),
 acquisition_tier text NOT NULL CHECK (acquisition_tier IN ('free','paid')),
 acquisition_kind text NOT NULL CHECK (acquisition_kind = 'detail_create'),
 retained_until timestamptz NOT NULL,
 extension_event_id uuid,
 extension_at timestamptz,
 extension_kind text NOT NULL CHECK (extension_kind = 'paid_upgrade'),
 extension_tier text NOT NULL CHECK (extension_tier = 'paid'),
 policy_version text NOT NULL CHECK (policy_version = 'consumer-retention-owner-2026-10-03-v1'),
 revision bigint NOT NULL CHECK (revision >= 0),
 provenance text NOT NULL CHECK (provenance = 'unknown'),
 authority_effective boolean NOT NULL CHECK (authority_effective = false),
 PRIMARY KEY (owner_user_id,resource_id),
 CONSTRAINT grant_acquisition_fk FOREIGN KEY (owner_user_id,resource_id,acquisition_event_id,acquisition_kind,acquisition_at,acquisition_tier,policy_version)
 REFERENCES retention_internal.authority_events(owner_user_id,resource_id,event_id,kind,effective_at,tier,policy_version),
 CONSTRAINT grant_extension_fk FOREIGN KEY (owner_user_id,extension_event_id,extension_kind,extension_at,extension_tier,policy_version)
 REFERENCES retention_internal.authority_events(owner_user_id,event_id,kind,effective_at,tier,policy_version),
 CHECK ((extension_event_id IS NULL) = (extension_at IS NULL)),
 CHECK (extension_event_id IS NULL OR (acquisition_tier = 'free' AND extension_event_id <> acquisition_event_id
   AND extension_at >= original_recorded_at AND extension_at < original_recorded_at + interval '336 hours')),
 CONSTRAINT grant_deadline_exact CHECK (retained_until = original_recorded_at +
   CASE WHEN acquisition_tier = 'paid' OR extension_event_id IS NOT NULL THEN interval '4320 hours' ELSE interval '336 hours' END)
);

-- Reject precision loss before admission; timestamptz has no rounding typmod.
DO $$
DECLARE t text; c text;
BEGIN
 FOR t,c IN SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='retention_internal' AND data_type='timestamp with time zone'
 LOOP
  EXECUTE pg_catalog.format('ALTER TABLE retention_internal.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (pg_catalog.isfinite(%I) AND %I >= timestamptz ''0001-01-01 00:00:00+00'' AND %I < timestamptz ''10000-01-01 00:00:00+00'' AND pg_catalog.date_trunc(''milliseconds'',%I) = %I))',
    t,t || '_' || c || '_instant',c,c,c,c,c,c);
 END LOOP;
END $$;

CREATE FUNCTION retention_internal.reject_content_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'RETENTION_CONTENT_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION retention_internal.guard_detail_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF ROW(NEW.owner_user_id,NEW.resource_id,NEW.original_recorded_at,NEW.acquisition_event_id,NEW.acquisition_at,NEW.acquisition_tier,NEW.acquisition_kind,NEW.policy_version)
   IS DISTINCT FROM ROW(OLD.owner_user_id,OLD.resource_id,OLD.original_recorded_at,OLD.acquisition_event_id,OLD.acquisition_at,OLD.acquisition_tier,OLD.acquisition_kind,OLD.policy_version) THEN
  RAISE EXCEPTION 'RETENTION_ANCHOR_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF NEW.retained_until < OLD.retained_until THEN
  RAISE EXCEPTION 'RETENTION_TERM_NEVER_SHRINKS' USING ERRCODE='23514';
 END IF;
 IF NEW.revision < OLD.revision OR (NEW IS DISTINCT FROM OLD AND NEW.revision <= OLD.revision) THEN
  RAISE EXCEPTION 'RETENTION_REVISION_CONFLICT' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_event BEFORE UPDATE ON retention_internal.authority_events
 FOR EACH ROW EXECUTE FUNCTION retention_internal.reject_content_update();
CREATE TRIGGER immutable_receipt BEFORE UPDATE ON retention_internal.operation_receipts
 FOR EACH ROW EXECUTE FUNCTION retention_internal.reject_content_update();
CREATE TRIGGER immutable_detail BEFORE UPDATE ON retention_internal.detail_grants
 FOR EACH ROW EXECUTE FUNCTION retention_internal.guard_detail_update();

ALTER FUNCTION retention_internal.reject_content_update() OWNER TO consumer_retention_foundation_owner;
ALTER FUNCTION retention_internal.guard_detail_update() OWNER TO consumer_retention_foundation_owner;
ALTER TABLE retention_internal.owner_authority_state OWNER TO consumer_retention_foundation_owner;
ALTER TABLE retention_internal.owner_authority_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.owner_authority_state FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.authority_events OWNER TO consumer_retention_foundation_owner;
ALTER TABLE retention_internal.authority_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.authority_events FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.operation_receipts OWNER TO consumer_retention_foundation_owner;
ALTER TABLE retention_internal.operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.operation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.detail_grants OWNER TO consumer_retention_foundation_owner;
ALTER TABLE retention_internal.detail_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_internal.detail_grants FORCE ROW LEVEL SECURITY;
-- Revoke even grants inherited from the migration operator's existing defaults.
REVOKE ALL ON SCHEMA retention_internal FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_internal FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_internal FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_internal FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname <> 'consumer_retention_foundation_owner'
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA retention_internal FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA retention_internal FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_internal FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_internal FROM %I',r.rolname);
 END LOOP;
END $$;
SET LOCAL ROLE consumer_retention_ddl_builder;
DO $$ BEGIN
 EXECUTE pg_catalog.format('REVOKE consumer_retention_foundation_owner FROM %I',session_user);
END $$;
RESET ROLE;
DROP ROLE consumer_retention_ddl_builder;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
   ON r.oid IN (m.roleid,m.member,m.grantor) WHERE r.rolname = 'consumer_retention_foundation_owner') THEN
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
-- R0-B-C1 binding guard G2: exact post-state, unchanged scope outside the new
-- foundation, then the atomic history row for bound modes. Runs before COMMIT.
DO $r0b_g2$
DECLARE
 v_mode text := pg_catalog.current_setting('tastkind.r0b_mode');
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_post text;
 v_source text;
 v_manifest jsonb;
 v_versions jsonb;
 v_expected jsonb;
 v_count integer;
 v_name text;
 v_statements text[];
 v_column record;
 v_actual text;
 v_default text;
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 v_scope := (
-- r0b:scope:begin
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_internal' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_internal','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_internal','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_internal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_internal','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_internal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
-- r0b:scope:end
 );
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.r0b_scope_digest') THEN
  RAISE EXCEPTION 'R0B_POST_GUARD_DRIFT' USING ERRCODE='42501';
 END IF;
 v_post := (
-- r0b:poststate:begin
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(n.nspowner)::text, n.nspacl::text) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_internal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, c.relkind, pg_catalog.pg_get_userbyid(c.relowner)::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.reloptions::text) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_internal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attgenerated, a.attidentity, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname::text COLLATE "C", a.attnum)
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_internal') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.conname::text, o.contype, pg_catalog.pg_get_constraintdef(o.oid)) ORDER BY c.relname::text COLLATE "C", o.conname::text COLLATE "C")
   FROM pg_catalog.pg_constraint o JOIN pg_catalog.pg_class c ON c.oid = o.conrelid WHERE o.connamespace = pg_catalog.to_regnamespace('retention_internal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_internal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, t.tgname::text, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_internal') AND NOT t.tgisinternal),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(p.proowner)::text, p.proacl::text, p.proconfig::text, p.prosecdef,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex')) ORDER BY p.proname::text COLLATE "C")
   FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_internal')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_internal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(COALESCE(n.nspname::text, ''), d.defaclobjtype, d.defaclacl::text) ORDER BY COALESCE(n.nspname::text, '') COLLATE "C", d.defaclobjtype)
   FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'consumer_retention_foundation_owner'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil IS NULL) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member, m.grantor) WHERE r.rolname IN ('consumer_retention_foundation_owner','consumer_retention_ddl_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'consumer_retention_foundation_owner' AND n.nspname <> 'retention_internal'),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'consumer_retention_foundation_owner' AND p.pronamespace <> pg_catalog.to_regnamespace('retention_internal'))
)::text, 'UTF8')), 'hex')
-- r0b:poststate:end
 );
 IF v_post IS DISTINCT FROM '407d86c5d8dae1cfb0419d28b04519221707982298389c5b8859bc0be630dafc' THEN
  RAISE EXCEPTION 'R0B_POST_STATE_MISMATCH expected=407d86c5d8dae1cfb0419d28b04519221707982298389c5b8859bc0be630dafc observed=%', v_post USING ERRCODE='42501';
 END IF;
 IF v_mode IN ('hosted-development','local-fixture') THEN
  v_source := pg_catalog.current_setting('tastkind.r0b_source_text');
  v_manifest := pg_catalog.current_setting('tastkind.r0b_manifest')::jsonb;
  INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
   VALUES ('20261003062157', 'consumer_retention_inactive_persistence_foundation', ARRAY[v_source]);
  SELECT pg_catalog.count(*)::integer INTO v_count FROM supabase_migrations.schema_migrations s WHERE s.version = '20261003062157';
  SELECT s.name, s.statements INTO v_name, v_statements FROM supabase_migrations.schema_migrations s WHERE s.version = '20261003062157';
  IF v_count <> 1 OR v_name IS DISTINCT FROM 'consumer_retention_inactive_persistence_foundation'
    OR pg_catalog.array_ndims(v_statements) IS DISTINCT FROM 1 OR pg_catalog.array_lower(v_statements, 1) IS DISTINCT FROM 1
    OR pg_catalog.cardinality(v_statements) <> 1 OR v_statements[1] IS DISTINCT FROM v_source
    OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_statements[1], 'UTF8')), 'hex')
       IS DISTINCT FROM pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_source, 'UTF8')), 'hex') THEN
   RAISE EXCEPTION 'R0B_HISTORY_ROW_MISMATCH' USING ERRCODE='42501';
  END IF;
  FOR v_column IN SELECT a.attname::text AS name, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS expr
    FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = pg_catalog.to_regclass('supabase_migrations.schema_migrations') AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname NOT IN ('version','name','statements')
  LOOP
   EXECUTE pg_catalog.format('SELECT (s.%I)::text FROM supabase_migrations.schema_migrations s WHERE s.version = $1', v_column.name) INTO v_actual USING '20261003062157';
   v_default := NULL;
   IF v_column.expr IS NOT NULL THEN EXECUTE 'SELECT (' || v_column.expr || ')::text' INTO v_default; END IF;
   IF v_actual IS DISTINCT FROM v_default THEN
    RAISE EXCEPTION 'R0B_HISTORY_ROW_MISMATCH %', v_column.name USING ERRCODE='42501';
   END IF;
  END LOOP;
  SELECT pg_catalog.jsonb_agg(s.version ORDER BY s.version COLLATE "C") INTO v_versions FROM supabase_migrations.schema_migrations s;
  SELECT pg_catalog.jsonb_agg(e.v ORDER BY e.v COLLATE "C") INTO v_expected
   FROM (SELECT pg_catalog.jsonb_array_elements_text(v_manifest->'history'->'versions') AS v UNION ALL SELECT '20261003062157') e;
  IF v_versions IS DISTINCT FROM v_expected THEN
   RAISE EXCEPTION 'R0B_HISTORY_SET_MISMATCH' USING ERRCODE='42501';
  END IF;
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $r0b_g2$;
COMMIT;
