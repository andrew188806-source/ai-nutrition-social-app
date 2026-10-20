-- TastKind R0-B-ENT-F1: inactive, provider-neutral PAID/TRIAL FACT INGESTION CORE. A verified, normalized provider observation is durably received (inbox), mapped to an owner only through server-controlled identity
-- links, reduced to non-overlapping fact SEGMENTS, and each segment is admitted into the accepted ENT0 ledger by the accepted admit_entitlement_event IN THE SAME TRANSACTION that records the segment. Delivery identity (inbox),
-- observation (the provider assertion stored in the inbox row) and business fact identity (ledger segment) are separate; later observations can only ADD time that is not asserted yet. Nothing here shortens, cancels or
-- corrects an admitted fact (ENT0 has no such model; Doc 05 sections 17.2 AP-3(c), 17.8): revocations are only recorded.
-- Inactive: this migration registers no producer, grants EXECUTE on nothing to any role, writes no row, configures no namespace, has no endpoint and no production call path, and does not touch the meal-save path, the legacy
-- subscription_entitlements table, coverage (advance_entitlement_coverage is not granted), Free finalization, grants, display or purge. What counts as Paid (grace, refund, trial ownership) is NOT decided here: the adapter supplies
-- already-classified observations; unsupported kinds are quarantined with evidence.
-- Approved ENT0 seams (Owner G2): exactly two statements, granted to the sealed billing owner only: USAGE on schema retention_entitlement and EXECUTE on admit_entitlement_event. No advance, no resolver, no membership/SET path.
-- A superuser (or an administrator who can disable triggers / session_replication_role=replica) can bypass every guard here; no claim is made against a deliberate administrator.
BEGIN;
-- Native authenticated superuser only (Owner G3: local, inactive installation; same actor rule as the accepted ENT1-A and ENT-R migrations; no Hosted compatibility is claimed).
DO $$ BEGIN
 IF current_user <> session_user OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles r
  WHERE r.rolname = current_user AND r.rolcanlogin AND r.rolsuper
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
-- Billing guard G1 (same transaction, before any DDL): plain local apply only; the predecessors (ENT0, ENT1-A, ENT-R) present and exactly in their accepted ACL state; no platform marker or R0-B binding setting.
DO $billing_g1$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_markers text[];
 v_digest text;
 v_acq text := 'consumer_retention_acquisition_owner';
 v_seal text := 'consumer_retention_seal_owner';
BEGIN
 SELECT COALESCE(pg_catalog.array_agg(x.m ORDER BY x.m COLLATE "C"), ARRAY[]::text[]) INTO v_markers FROM (
  SELECT 'role:' || r.rolname AS m FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin')
  UNION ALL SELECT 'schema:supabase_migrations' WHERE pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
  UNION ALL SELECT 'setting:supautils' WHERE NULLIF(pg_catalog.current_setting('supautils.reserved_roles', true), '') IS NOT NULL
 ) x;
 IF pg_catalog.cardinality(v_markers) > 0 THEN
  RAISE EXCEPTION 'BILLING_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
 END IF;
 IF NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '') IS NOT NULL THEN
  RAISE EXCEPTION 'BILLING_BINDINGS_NOT_SUPPORTED' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('auth.users') IS NULL
   OR pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL
   OR pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') IS NULL
   OR pg_catalog.to_regprocedure('retention_entitlement.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)') IS NULL
   OR pg_catalog.to_regprocedure('retention_entitlement.advance_entitlement_coverage(uuid,text,timestamp with time zone)') IS NULL
   OR pg_catalog.to_regclass('retention_entitlement.producers') IS NULL
   OR pg_catalog.to_regclass('retention_acquisition.detail_acquisition_records') IS NULL
   OR pg_catalog.to_regclass('retention_seal.registry_seals') IS NULL
   OR pg_catalog.to_regnamespace('retention_internal') IS NULL THEN
  RAISE EXCEPTION 'BILLING_PREDECESSORS_MISSING' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_billing_owner','consumer_retention_billing_builder'))
   OR pg_catalog.to_regnamespace('retention_billing') IS NOT NULL THEN
  RAISE EXCEPTION 'BILLING_ALREADY_PRESENT' USING ERRCODE='42710';
 END IF;
 -- The objects this migration reads or grants on must still be exactly in their accepted post-ENT-R state: owned by the sealed predecessor owners; the only non-owner grantees of the capture/entitlement schemas are the
 -- acquisition and seal owners; the admit and advance functions have NO non-owner grantee; the resolver has exactly the acquisition and seal owners; the registry has exactly the seal owner's SELECT and its two accepted policies.
 IF (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) IS DISTINCT FROM 'consumer_retention_capture_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.advance_entitlement_coverage(uuid,text,timestamp with time zone)')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = pg_catalog.to_regclass('retention_entitlement.producers')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_capture') IS DISTINCT FROM 'consumer_retention_capture_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_entitlement') IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_acquisition') IS DISTINCT FROM v_acq
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_seal') IS DISTINCT FROM v_seal
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.nspname::text, pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY n.nspname::text COLLATE "C", pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C")
       FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
       WHERE n.nspname IN ('retention_capture','retention_entitlement') AND a.grantee <> n.nspowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_array('retention_capture', v_acq, 'USAGE', false),
        pg_catalog.jsonb_build_array('retention_entitlement', v_acq, 'USAGE', false),
        pg_catalog.jsonb_build_array('retention_entitlement', v_seal, 'USAGE', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable))
       FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
       WHERE c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND a.grantee <> c.relowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'SELECT', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C")
       FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
       WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') AND a.grantee <> p.proowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'EXECUTE', false), pg_catalog.jsonb_build_array(v_seal, 'EXECUTE', false))
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
       WHERE p.oid IN (pg_catalog.to_regprocedure('retention_entitlement.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)'),
                       pg_catalog.to_regprocedure('retention_entitlement.advance_entitlement_coverage(uuid,text,timestamp with time zone)')) AND a.grantee <> p.proowner)
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable))
       FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
       WHERE c.oid = pg_catalog.to_regclass('retention_entitlement.producers') AND a.grantee <> c.relowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_seal, 'SELECT', false))
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) <> 2
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers')) <> 2
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers') AND o.polname = 'ent_owner_select' AND o.polcmd = 'r')
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers') AND o.polname = 'seal_owner_select' AND o.polcmd = 'r') THEN
  RAISE EXCEPTION 'BILLING_PREDECESSOR_DRIFT' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 PERFORM pg_catalog.set_config('tastkind.billing_digest_sql', $billing_digest$
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_billing_owner','consumer_retention_billing_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_billing_owner','consumer_retention_billing_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, CASE WHEN n.nspname = 'retention_entitlement' THEN NULL ELSE n.nspacl::text END) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_billing' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_billing','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, CASE WHEN p.oid = pg_catalog.to_regprocedure('retention_entitlement.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)') THEN NULL ELSE p.proacl::text END, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_billing','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname <> 'retention_billing' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.oid = t.tgconstraint AND k.connamespace = pg_catalog.to_regnamespace('retention_billing')))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_billing','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_billing'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_billing_owner','consumer_retention_billing_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
 $billing_digest$, true);
 EXECUTE pg_catalog.current_setting('tastkind.billing_digest_sql') INTO v_digest;
 PERFORM pg_catalog.set_config('tastkind.billing_scope_digest', v_digest, true);
 PERFORM pg_catalog.set_config('search_path', v_path, true);
 RAISE NOTICE 'BILLING_DDL_BOUNDARY';
END $billing_g1$;
-- Disposable builder owns no SQL objects. Its bootstrap ADMIN edge dies on DROP ROLE.
CREATE ROLE consumer_retention_billing_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_billing_builder TO %I WITH INHERIT FALSE, SET TRUE',session_user);
END $$;
SET LOCAL ROLE consumer_retention_billing_builder;
CREATE ROLE consumer_retention_billing_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_billing_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);
END $$;
RESET ROLE;
CREATE SCHEMA retention_billing AUTHORIZATION consumer_retention_billing_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_billing_owner IN SCHEMA retention_billing REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_billing_owner IN SCHEMA retention_billing REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_billing_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Operator-written namespace configuration (no function of this schema writes it). A namespace starts DISABLED; the period limit has no default and must be supplied by the operator/adapter package.
-- registered_at is a COPY of the ENT0 registry value that the operator records when registering the producer; a wrong copy is detected by ENT0 itself (admit refuses facts before registration).
CREATE TABLE retention_billing.namespace_config (
 namespace text PRIMARY KEY CONSTRAINT cfg_namespace_format CHECK (namespace ~ '^[a-z][a-z0-9_.-]{2,63}$'),
 environment text NOT NULL CONSTRAINT cfg_environment_valid CHECK (environment IN ('sandbox','production')),
 registered_at timestamptz NOT NULL,
 max_period_ms bigint NOT NULL CONSTRAINT cfg_max_period_positive CHECK (max_period_ms > 0),
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
);
-- Server-controlled owner mapping. pending = a purchase intent (owner + hash of a server-issued binding value + expiry); active = subject confirmed. Never created from a client claim.
CREATE TABLE retention_billing.identity_links (
 link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 namespace text NOT NULL REFERENCES retention_billing.namespace_config(namespace),
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 state text NOT NULL CONSTRAINT link_state_valid CHECK (state IN ('pending','active')),
 binding_hash text CONSTRAINT link_binding_hex CHECK (binding_hash IS NULL OR binding_hash ~ '^[0-9a-f]{64}$'),
 subject_ref text CONSTRAINT link_subject_valid CHECK (subject_ref IS NULL OR (pg_catalog.btrim(subject_ref) <> '' AND pg_catalog.length(subject_ref) <= 200)),
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
 activated_at timestamptz,
 CONSTRAINT link_shape CHECK ((state = 'pending' AND binding_hash IS NOT NULL AND expires_at IS NOT NULL AND subject_ref IS NULL AND activated_at IS NULL)
   OR (state = 'active' AND subject_ref IS NOT NULL AND activated_at IS NOT NULL)),
 CONSTRAINT link_subject_unique UNIQUE (namespace, subject_ref),
 CONSTRAINT link_binding_unique UNIQUE (namespace, binding_hash)
);
-- Delivery identity = (namespace, delivery_id, subject_ref). The stored observation is exactly what the adapter asserted; nothing here interprets a provider status as Paid.
CREATE TABLE retention_billing.inbox (
 item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 namespace text NOT NULL REFERENCES retention_billing.namespace_config(namespace),
 delivery_id text NOT NULL CONSTRAINT inbox_delivery_valid CHECK (pg_catalog.btrim(delivery_id) <> '' AND pg_catalog.length(delivery_id) <= 200),
 subject_ref text NOT NULL CONSTRAINT inbox_subject_valid CHECK (pg_catalog.btrim(subject_ref) <> '' AND pg_catalog.length(subject_ref) <= 200),
 payload_digest text NOT NULL CONSTRAINT inbox_digest_hex CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL CONSTRAINT inbox_kind_valid CHECK (pg_catalog.btrim(kind) <> '' AND pg_catalog.length(kind) <= 64),
 period_start timestamptz,
 period_end timestamptz,
 signed_at timestamptz NOT NULL,
 environment text NOT NULL CONSTRAINT inbox_environment_valid CHECK (environment IN ('sandbox','production')),
 binding_hash text CONSTRAINT inbox_binding_hex CHECK (binding_hash IS NULL OR binding_hash ~ '^[0-9a-f]{64}$'),
 reason_code text CONSTRAINT inbox_reason_code_len CHECK (reason_code IS NULL OR pg_catalog.length(reason_code) <= 64),
 received_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
 state text NOT NULL DEFAULT 'received' CONSTRAINT inbox_state_valid CHECK (state IN ('received','retry_pending','mapping_pending','admitted','already_asserted','before_registration','recorded_only','dismissed','quarantined')),
 reason text CONSTRAINT inbox_reason_len CHECK (reason IS NULL OR pg_catalog.length(reason) <= 64),
 attempts integer NOT NULL DEFAULT 0 CONSTRAINT inbox_attempts_nonneg CHECK (attempts >= 0),
 last_error text CONSTRAINT inbox_last_error_len CHECK (last_error IS NULL OR pg_catalog.length(last_error) <= 120),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 processed_at timestamptz,
 outcome jsonb,
 CONSTRAINT inbox_delivery_unique UNIQUE (namespace, delivery_id, subject_ref),
 CONSTRAINT inbox_period_pair CHECK ((period_start IS NULL) = (period_end IS NULL)),
 CONSTRAINT inbox_period_order CHECK (period_start IS NULL OR period_end > period_start),
 CONSTRAINT inbox_terminal_processed CHECK (state IN ('received','retry_pending','mapping_pending') OR processed_at IS NOT NULL)
);
CREATE INDEX inbox_pending ON retention_billing.inbox (namespace, received_at, item_id) WHERE state IN ('received','retry_pending','mapping_pending');
-- Business fact identity: the asserted-interval set A per (namespace, subject_ref, class). One row = one ledger fact (segment). Rows are written in the same transaction as the ledger admission and never overlap.
CREATE TABLE retention_billing.fact_segments (
 namespace text NOT NULL REFERENCES retention_billing.namespace_config(namespace),
 subject_ref text NOT NULL,
 class text NOT NULL CONSTRAINT seg_class_valid CHECK (class IN ('paid','trial')),
 seg_start timestamptz NOT NULL,
 seg_end timestamptz NOT NULL,
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 ledger_event_id uuid NOT NULL,
 upstream_event_id text NOT NULL,
 item_id uuid NOT NULL REFERENCES retention_billing.inbox(item_id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
 PRIMARY KEY (namespace, subject_ref, class, seg_start),
 CONSTRAINT seg_interval_valid CHECK (seg_end > seg_start)
);
-- Append-only evidence of quarantines and conflicts (reason codes, digests and identifiers only; never a payload, token or personal data).
CREATE TABLE retention_billing.evidence_log (
 evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 item_id uuid REFERENCES retention_billing.inbox(item_id),
 namespace text NOT NULL,
 kind text NOT NULL CONSTRAINT evidence_kind_valid CHECK (pg_catalog.btrim(kind) <> '' AND pg_catalog.length(kind) <= 64),
 detail jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
);

-- Reject precision loss before admission; timestamptz has no rounding typmod.
DO $$
DECLARE t text; c text;
BEGIN
 FOR t,c IN SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='retention_billing' AND data_type='timestamp with time zone'
 LOOP
  EXECUTE pg_catalog.format('ALTER TABLE retention_billing.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (pg_catalog.isfinite(%I) AND %I >= timestamptz ''0001-01-01 00:00:00+00'' AND %I < timestamptz ''10000-01-01 00:00:00+00'' AND pg_catalog.date_trunc(''milliseconds'', %I) = %I))',
    t, t || '_' || c || '_instant', c, c, c, c, c, c);
 END LOOP;
END $$;

-- Row-level integrity, independent of the functions below.
-- Only the operator-visible switch of a namespace may change.
CREATE FUNCTION retention_billing.guard_config() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.namespace IS DISTINCT FROM OLD.namespace OR NEW.environment IS DISTINCT FROM OLD.environment OR NEW.registered_at IS DISTINCT FROM OLD.registered_at
    OR NEW.max_period_ms IS DISTINCT FROM OLD.max_period_ms OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION 'BILLING_CONFIG_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER config_guard BEFORE UPDATE ON retention_billing.namespace_config
 FOR EACH ROW EXECUTE FUNCTION retention_billing.guard_config();
-- A link only moves pending -> active; owner, namespace and binding never change.
CREATE FUNCTION retention_billing.guard_link_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.link_id IS DISTINCT FROM OLD.link_id OR NEW.namespace IS DISTINCT FROM OLD.namespace OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.binding_hash IS DISTINCT FROM OLD.binding_hash OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR OLD.state <> 'pending' OR NEW.state <> 'active' THEN
  RAISE EXCEPTION 'BILLING_LINK_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER link_guard BEFORE UPDATE ON retention_billing.identity_links
 FOR EACH ROW EXECUTE FUNCTION retention_billing.guard_link_update();
-- An inbox item keeps what the adapter asserted; a terminal state never changes; attempts only grow; an item never returns to received.
CREATE FUNCTION retention_billing.guard_inbox_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.namespace IS DISTINCT FROM OLD.namespace OR NEW.delivery_id IS DISTINCT FROM OLD.delivery_id OR NEW.subject_ref IS DISTINCT FROM OLD.subject_ref
    OR NEW.payload_digest IS DISTINCT FROM OLD.payload_digest OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.environment IS DISTINCT FROM OLD.environment OR NEW.binding_hash IS DISTINCT FROM OLD.binding_hash
    OR NEW.reason_code IS DISTINCT FROM OLD.reason_code OR NEW.received_at IS DISTINCT FROM OLD.received_at THEN
  RAISE EXCEPTION 'BILLING_ITEM_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF OLD.state NOT IN ('received','retry_pending','mapping_pending') THEN
  RAISE EXCEPTION 'BILLING_ITEM_TERMINAL' USING ERRCODE='23514';
 END IF;
 IF (NEW.state = 'received' AND OLD.state <> 'received') OR NEW.attempts < OLD.attempts THEN
  RAISE EXCEPTION 'BILLING_ITEM_TRANSITION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inbox_guard BEFORE UPDATE ON retention_billing.inbox
 FOR EACH ROW EXECUTE FUNCTION retention_billing.guard_inbox_update();
-- Segments of one (namespace, subject, class) never overlap and never change (the process function holds the subject lock; this is the independent row-level check).
CREATE FUNCTION retention_billing.guard_segment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  RAISE EXCEPTION 'BILLING_SEGMENT_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF EXISTS (SELECT 1 FROM retention_billing.fact_segments s WHERE s.namespace = NEW.namespace AND s.subject_ref = NEW.subject_ref AND s.class = NEW.class
    AND s.seg_start < NEW.seg_end AND s.seg_end > NEW.seg_start) THEN
  RAISE EXCEPTION 'BILLING_SEGMENT_OVERLAP' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER segment_guard BEFORE INSERT OR UPDATE ON retention_billing.fact_segments
 FOR EACH ROW EXECUTE FUNCTION retention_billing.guard_segment();
-- Evidence is append-only.
CREATE FUNCTION retention_billing.reject_evidence_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'BILLING_EVIDENCE_IMMUTABLE' USING ERRCODE='23514';
END $$;
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON retention_billing.evidence_log
 FOR EACH ROW EXECUTE FUNCTION retention_billing.reject_evidence_change();

-- Ledger key of one segment: a hash prefix of (namespace, subject) so no provider identifier enters the ledger in clear, the class, and the exact millisecond bounds. source_sequence is never passed to ENT0 (it is part of the ENT0 digest).
CREATE FUNCTION retention_billing.fact_key(p_namespace text, p_subject text, p_class text, p_start timestamptz, p_end timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT pg_catalog.substr(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_namespace || '|' || p_subject, 'UTF8')), 'hex'), 1, 32) || ':' || p_class || ':'
  || (pg_catalog.floor(EXTRACT(epoch FROM p_start) * 1000))::pg_catalog.int8::pg_catalog.text || ':'
  || (pg_catalog.floor(EXTRACT(epoch FROM p_end) * 1000))::pg_catalog.int8::pg_catalog.text
$$;

-- Receive one delivery. Argument/shape errors raise (adapter contract violation, nothing stored). A well-formed item is stored as received; a repeated delivery id with the same digest is a duplicate (nothing stored);
-- the same delivery id with a different digest keeps the first item and appends evidence. Nothing here interprets the kind.
CREATE FUNCTION retention_billing.ingest_delivery(p_namespace text, p_delivery_id text, p_subject_ref text, p_payload_digest text, p_kind text,
  p_period_start timestamptz, p_period_end timestamptz, p_signed_at timestamptz, p_environment text, p_binding_hash text, p_reason_code text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_cfg retention_billing.namespace_config%ROWTYPE;
 v_id uuid;
 v_existing retention_billing.inbox%ROWTYPE;
BEGIN
 IF p_namespace IS NULL OR p_delivery_id IS NULL OR pg_catalog.btrim(p_delivery_id) = '' OR pg_catalog.length(p_delivery_id) > 200
    OR p_subject_ref IS NULL OR pg_catalog.btrim(p_subject_ref) = '' OR pg_catalog.length(p_subject_ref) > 200
    OR p_payload_digest IS NULL OR p_payload_digest !~ '^[0-9a-f]{64}$'
    OR p_kind IS NULL OR pg_catalog.btrim(p_kind) = '' OR pg_catalog.length(p_kind) > 64
    OR p_signed_at IS NULL OR NOT pg_catalog.isfinite(p_signed_at) OR pg_catalog.date_trunc('milliseconds', p_signed_at) <> p_signed_at
    OR (p_period_start IS NULL) <> (p_period_end IS NULL)
    OR (p_period_start IS NOT NULL AND (NOT pg_catalog.isfinite(p_period_start) OR NOT pg_catalog.isfinite(p_period_end)
        OR pg_catalog.date_trunc('milliseconds', p_period_start) <> p_period_start OR pg_catalog.date_trunc('milliseconds', p_period_end) <> p_period_end OR p_period_end <= p_period_start))
    OR p_environment IS NULL OR p_environment NOT IN ('sandbox','production')
    OR (p_binding_hash IS NOT NULL AND p_binding_hash !~ '^[0-9a-f]{64}$')
    OR (p_reason_code IS NOT NULL AND pg_catalog.length(p_reason_code) > 64) THEN
  RAISE EXCEPTION 'BILLING_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'BILLING_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 SELECT c.* INTO v_cfg FROM retention_billing.namespace_config c WHERE c.namespace = p_namespace;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'unknown_namespace', 'item_id', NULL);
 END IF;
 IF NOT v_cfg.enabled THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'disabled', 'item_id', NULL);
 END IF;
 INSERT INTO retention_billing.inbox (namespace, delivery_id, subject_ref, payload_digest, kind, period_start, period_end, signed_at, environment, binding_hash, reason_code)
 VALUES (p_namespace, p_delivery_id, p_subject_ref, p_payload_digest, p_kind, p_period_start, p_period_end, p_signed_at, p_environment, p_binding_hash, p_reason_code)
 ON CONFLICT ON CONSTRAINT inbox_delivery_unique DO NOTHING
 RETURNING item_id INTO v_id;
 IF v_id IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'received', 'item_id', v_id);
 END IF;
 SELECT i.* INTO v_existing FROM retention_billing.inbox i WHERE i.namespace = p_namespace AND i.delivery_id = p_delivery_id AND i.subject_ref = p_subject_ref;
 IF v_existing.payload_digest = p_payload_digest THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'duplicate', 'item_id', v_existing.item_id);
 END IF;
 INSERT INTO retention_billing.evidence_log (item_id, namespace, kind, detail)
 VALUES (v_existing.item_id, p_namespace, 'delivery_conflict', pg_catalog.jsonb_build_object('existing_digest', v_existing.payload_digest, 'new_digest', p_payload_digest));
 RETURN pg_catalog.jsonb_build_object('outcome', 'delivery_conflict', 'item_id', v_existing.item_id);
END $$;

-- Record a purchase intent for a VERIFIED actor (the server code that calls this has already authenticated the user; the database cannot, so this function is granted to nobody by the migration).
CREATE FUNCTION retention_billing.create_link_intent(p_namespace text, p_owner uuid, p_binding_hash text, p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_now timestamptz := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());
 v_id uuid;
 v_existing retention_billing.identity_links%ROWTYPE;
BEGIN
 IF p_namespace IS NULL OR p_owner IS NULL OR p_binding_hash IS NULL OR p_binding_hash !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL OR NOT pg_catalog.isfinite(p_expires_at)
    OR pg_catalog.date_trunc('milliseconds', p_expires_at) <> p_expires_at OR p_expires_at <= v_now OR p_expires_at > v_now + interval '30 days' THEN
  RAISE EXCEPTION 'BILLING_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'BILLING_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM retention_billing.namespace_config c WHERE c.namespace = p_namespace AND c.enabled) THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'disabled', 'link_id', NULL);
 END IF;
 BEGIN
  INSERT INTO retention_billing.identity_links (namespace, owner_user_id, state, binding_hash, expires_at)
  VALUES (p_namespace, p_owner, 'pending', p_binding_hash, p_expires_at)
  ON CONFLICT ON CONSTRAINT link_binding_unique DO NOTHING
  RETURNING link_id INTO v_id;
 EXCEPTION WHEN foreign_key_violation THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'owner_absent', 'link_id', NULL);
 END;
 IF v_id IS NOT NULL THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'created', 'link_id', v_id);
 END IF;
 SELECT l.* INTO v_existing FROM retention_billing.identity_links l WHERE l.namespace = p_namespace AND l.binding_hash = p_binding_hash;
 IF v_existing.owner_user_id = p_owner THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'exists', 'link_id', v_existing.link_id);
 END IF;
 INSERT INTO retention_billing.evidence_log (item_id, namespace, kind, detail)
 VALUES (NULL, p_namespace, 'link_conflict', pg_catalog.jsonb_build_object('binding_hash', p_binding_hash, 'link_id', v_existing.link_id));
 RETURN pg_catalog.jsonb_build_object('outcome', 'conflict', 'link_id', v_existing.link_id);
END $$;

-- Read-only: the oldest item of a namespace that can make progress now (never locks, never writes). NULL when there is none.
CREATE FUNCTION retention_billing.next_candidate(p_namespace text)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
 SELECT i.item_id FROM retention_billing.inbox i
  WHERE i.namespace = p_namespace
    AND (i.state IN ('received','retry_pending')
         OR (i.state = 'mapping_pending' AND (EXISTS (SELECT 1 FROM retention_billing.identity_links l WHERE l.namespace = i.namespace AND l.subject_ref = i.subject_ref)
              OR (i.binding_hash IS NOT NULL AND EXISTS (SELECT 1 FROM retention_billing.identity_links l WHERE l.namespace = i.namespace AND l.binding_hash = i.binding_hash
               AND (l.state = 'active' OR l.expires_at > pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())))))))
  ORDER BY i.received_at, i.item_id LIMIT 1
$$;

-- Process ONE named inbox item in the caller's transaction (one owner per transaction: a transaction that has already written anything is refused). The subject lock, the ENT0 admit and the segment rows share this
-- transaction, so any failure, timeout or abort leaves no segment, no ledger fact and no state change; nothing is ever half done. Lock order: inbox item row, subject advisory lock, then ENT0 (registry SHARE, owner lock).
-- Outcomes: not_found, busy (row locked by another worker), already_final (terminal), disabled, unknown_namespace, retry (lock timeout, nothing changed), blocked (the producer is not authorized for the namespace, nothing
-- changed), mapping_pending, admitted, already_asserted, before_registration, recorded_only, dismissed, quarantined. Quarantine and dismissal keep their reason and (for quarantine) append evidence. Transient errors
-- (deadlock, cancellation...) are NOT caught: they roll back and propagate.
CREATE FUNCTION retention_billing.process_item(p_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_cfg retention_billing.namespace_config%ROWTYPE;
 v_item retention_billing.inbox%ROWTYPE;
 v_link retention_billing.identity_links%ROWTYPE;
 v_now timestamptz;
 v_owner uuid;
 v_class text;
 v_start timestamptz;
 v_end timestamptz;
 v_cursor timestamptz;
 v_seg record;
 v_ps timestamptz[] := ARRAY[]::timestamptz[];
 v_pe timestamptz[] := ARRAY[]::timestamptz[];
 v_i integer;
 v_key text;
 v_res jsonb;
 v_segments jsonb := '[]'::jsonb;
 v_final text;
 v_why text;
 v_blocked boolean := false;
 v_msg text;
 v_sqlstate text;
 v_chain_max timestamptz;
 v_relation jsonb := '{}'::jsonb;
 v_outcome jsonb;
BEGIN
 IF p_item_id IS NULL THEN
  RAISE EXCEPTION 'BILLING_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'BILLING_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 IF pg_catalog.pg_current_xact_id_if_assigned() IS NOT NULL THEN
  RAISE EXCEPTION 'BILLING_DIRTY_TRANSACTION' USING ERRCODE='25000';
 END IF;
 SELECT i.* INTO v_item FROM retention_billing.inbox i WHERE i.item_id = p_item_id;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'not_found', 'item_id', p_item_id);
 END IF;
 SELECT c.* INTO v_cfg FROM retention_billing.namespace_config c WHERE c.namespace = v_item.namespace;
 IF NOT v_cfg.enabled THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'disabled', 'item_id', p_item_id);
 END IF;
 BEGIN
  SELECT i.* INTO v_item FROM retention_billing.inbox i WHERE i.item_id = p_item_id AND i.state IN ('received','retry_pending','mapping_pending') FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
   IF EXISTS (SELECT 1 FROM retention_billing.inbox i WHERE i.item_id = p_item_id AND i.state IN ('received','retry_pending','mapping_pending')) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'busy', 'item_id', p_item_id);
   END IF;
   RETURN pg_catalog.jsonb_build_object('outcome', 'already_final', 'item_id', p_item_id);
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('retention_billing:' || v_item.namespace || ':' || v_item.subject_ref, 0));
  v_now := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp());

  IF v_item.kind = 'non_entitling' THEN
   v_final := 'dismissed'; v_why := COALESCE(NULLIF(v_item.reason_code, ''), 'non_entitling');
  ELSIF v_item.kind = 'revocation' THEN
   -- Recorded only: ENT0 has no cancellation, refund or correction model and an admitted fact never shortens (Doc 05 sections 17.2, 17.8). No policy is invented here.
   v_final := 'recorded_only'; v_why := 'revocation_observed';
   v_relation := pg_catalog.jsonb_build_object('revocation_observed', true);
  ELSIF v_item.kind NOT IN ('paid_period','trial_period') THEN
   v_final := 'quarantined'; v_why := 'unsupported_kind';
  ELSIF v_item.period_start IS NULL THEN
   v_final := 'quarantined'; v_why := 'period_missing';
  ELSIF v_item.environment <> v_cfg.environment THEN
   v_final := 'quarantined'; v_why := 'environment_mismatch';
  ELSIF pg_catalog.floor(EXTRACT(epoch FROM (v_item.period_end - v_item.period_start)) * 1000) > v_cfg.max_period_ms THEN
   v_final := 'quarantined'; v_why := 'period_too_long';
  ELSE
   v_class := CASE v_item.kind WHEN 'paid_period' THEN 'paid' ELSE 'trial' END;
   -- owner resolution: only a server-controlled link maps a subject to an owner
   SELECT l.* INTO v_link FROM retention_billing.identity_links l WHERE l.namespace = v_item.namespace AND l.subject_ref = v_item.subject_ref;
   IF FOUND THEN
    v_owner := v_link.owner_user_id;
    IF v_item.binding_hash IS NOT NULL AND EXISTS (SELECT 1 FROM retention_billing.identity_links l WHERE l.namespace = v_item.namespace AND l.binding_hash = v_item.binding_hash AND l.owner_user_id <> v_owner) THEN
     v_final := 'quarantined'; v_why := 'link_conflict'; v_owner := NULL;
    END IF;
   ELSIF v_item.binding_hash IS NOT NULL THEN
    SELECT l.* INTO v_link FROM retention_billing.identity_links l WHERE l.namespace = v_item.namespace AND l.binding_hash = v_item.binding_hash FOR UPDATE;
    IF NOT FOUND THEN
     v_final := 'mapping_pending'; v_why := 'no_link';
    ELSIF v_link.state = 'active' THEN
     v_final := 'quarantined'; v_why := 'link_conflict';
    ELSIF v_link.expires_at <= v_now THEN
     v_final := 'mapping_pending'; v_why := 'intent_expired';
    ELSE
     UPDATE retention_billing.identity_links SET state = 'active', subject_ref = v_item.subject_ref, activated_at = v_now WHERE link_id = v_link.link_id;
     v_owner := v_link.owner_user_id;
    END IF;
   ELSE
    v_final := 'mapping_pending'; v_why := 'no_link';
   END IF;

   IF v_final IS NULL THEN
    v_start := GREATEST(v_item.period_start, v_cfg.registered_at);
    v_end := v_item.period_end;
    IF v_end <= v_start THEN
     v_final := 'before_registration'; v_why := 'before_registration';
    ELSE
     -- segments = [v_start, v_end) minus the asserted set A of (namespace, subject, class); the rows are sorted and never overlap
     v_cursor := v_start;
     FOR v_seg IN SELECT s.seg_start, s.seg_end FROM retention_billing.fact_segments s
       WHERE s.namespace = v_item.namespace AND s.subject_ref = v_item.subject_ref AND s.class = v_class AND s.seg_end > v_start AND s.seg_start < v_end ORDER BY s.seg_start
     LOOP
      IF v_seg.seg_start > v_cursor THEN
       v_ps := v_ps || v_cursor; v_pe := v_pe || LEAST(v_seg.seg_start, v_end);
      END IF;
      v_cursor := GREATEST(v_cursor, v_seg.seg_end);
     END LOOP;
     IF v_cursor < v_end THEN
      v_ps := v_ps || v_cursor; v_pe := v_pe || v_end;
     END IF;
     SELECT pg_catalog.max(s.seg_end) INTO v_chain_max FROM retention_billing.fact_segments s WHERE s.namespace = v_item.namespace AND s.subject_ref = v_item.subject_ref AND s.class = v_class;
     IF pg_catalog.cardinality(v_ps) = 0 THEN
      v_final := 'already_asserted'; v_why := 'covered';
      IF EXISTS (SELECT 1 FROM retention_billing.inbox j WHERE j.namespace = v_item.namespace AND j.subject_ref = v_item.subject_ref AND j.kind = v_item.kind AND j.period_start = v_item.period_start
                 AND j.period_end > v_item.period_end AND j.item_id <> v_item.item_id AND j.state IN ('admitted','already_asserted')) THEN
       v_relation := v_relation || pg_catalog.jsonb_build_object('shortening_observed', true);
      END IF;
     ELSE
      IF v_chain_max IS NOT NULL AND v_ps[1] > v_chain_max THEN
       v_relation := v_relation || pg_catalog.jsonb_build_object('gap_observed_ms', pg_catalog.floor(EXTRACT(epoch FROM (v_ps[1] - v_chain_max)) * 1000)::pg_catalog.int8);
      END IF;
      IF EXISTS (SELECT 1 FROM retention_billing.fact_segments s WHERE s.namespace = v_item.namespace AND s.subject_ref = v_item.subject_ref AND s.class <> v_class AND s.seg_start < v_end AND s.seg_end > v_start) THEN
       v_relation := v_relation || pg_catalog.jsonb_build_object('class_overlap_observed', true);
      END IF;
      BEGIN
       FOR v_i IN 1 .. pg_catalog.cardinality(v_ps) LOOP
        v_key := retention_billing.fact_key(v_item.namespace, v_item.subject_ref, v_class, v_ps[v_i], v_pe[v_i]);
        v_res := retention_entitlement.admit_entitlement_event(v_owner, v_item.namespace, v_key, v_class, v_ps[v_i], v_pe[v_i], NULL::pg_catalog.int8);
        IF v_res->>'outcome' IS NULL OR v_res->>'outcome' NOT IN ('admitted','replayed') THEN
         RAISE EXCEPTION 'BILLING_UNEXPECTED_ADMIT_ANSWER' USING ERRCODE='XX000';
        END IF;
        INSERT INTO retention_billing.fact_segments (namespace, subject_ref, class, seg_start, seg_end, owner_user_id, ledger_event_id, upstream_event_id, item_id)
        VALUES (v_item.namespace, v_item.subject_ref, v_class, v_ps[v_i], v_pe[v_i], v_owner, (v_res->>'event_id')::pg_catalog.uuid, v_key, v_item.item_id);
        v_segments := v_segments || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('start', v_ps[v_i], 'end', v_pe[v_i], 'key', v_key, 'event_id', v_res->>'event_id', 'ledger', v_res->>'outcome'));
       END LOOP;
       v_final := 'admitted'; v_why := NULL;
      EXCEPTION WHEN OTHERS THEN
       GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_sqlstate = RETURNED_SQLSTATE;
       v_segments := '[]'::jsonb;
       IF v_msg IN ('ENT_EVENT_BELOW_COVERAGE','ENT_EVENT_CONFLICT','ENT_EVENT_BEFORE_PRODUCER_REGISTRATION','ENT_INVALID_ARGUMENT') THEN
        v_final := 'quarantined'; v_why := pg_catalog.lower(pg_catalog.substr(v_msg, 5));
       ELSIF v_msg = 'ENT_PRODUCER_NOT_AUTHORIZED' THEN
        v_blocked := true;
       ELSIF v_sqlstate = '23503' THEN
        v_final := 'dismissed'; v_why := 'owner_absent'; v_owner := NULL;
       ELSE
        RAISE;
       END IF;
      END;
     END IF;
    END IF;
   END IF;
  END IF;

  IF v_blocked THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'blocked', 'reason', 'ENT_PRODUCER_NOT_AUTHORIZED', 'item_id', v_item.item_id);
  END IF;
  IF v_final = 'quarantined' THEN
   INSERT INTO retention_billing.evidence_log (item_id, namespace, kind, detail)
   VALUES (v_item.item_id, v_item.namespace, v_why, pg_catalog.jsonb_build_object('kind', v_item.kind, 'delivery_id', v_item.delivery_id, 'environment', v_item.environment));
  END IF;
  v_outcome := pg_catalog.jsonb_build_object('segments', v_segments, 'relation', v_relation);
  IF v_final IN ('mapping_pending') THEN
   UPDATE retention_billing.inbox SET state = 'mapping_pending', reason = v_why, outcome = v_outcome WHERE item_id = v_item.item_id;
  ELSE
   UPDATE retention_billing.inbox SET state = v_final, reason = v_why, owner_user_id = v_owner, processed_at = v_now, outcome = v_outcome WHERE item_id = v_item.item_id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('outcome', v_final, 'reason', v_why, 'item_id', v_item.item_id, 'segments', v_segments, 'relation', v_relation);
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'retry', 'reason', 'LOCK_TIMEOUT', 'item_id', v_item.item_id);
 END;
END $$;

-- Record a failed attempt in its OWN transaction (the failed one has rolled back): the item stays retryable, never terminal, never admitted.
CREATE FUNCTION retention_billing.record_attempt(p_item_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_n integer;
BEGIN
 IF p_item_id IS NULL OR p_reason IS NULL THEN
  RAISE EXCEPTION 'BILLING_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 UPDATE retention_billing.inbox SET state = 'retry_pending', attempts = attempts + 1, last_error = pg_catalog.left(p_reason, 120)
  WHERE item_id = p_item_id AND state IN ('received','retry_pending','mapping_pending');
 GET DIAGNOSTICS v_n = ROW_COUNT;
 RETURN pg_catalog.jsonb_build_object('outcome', CASE WHEN v_n = 1 THEN 'recorded' ELSE 'noop' END, 'item_id', p_item_id);
END $$;

ALTER FUNCTION retention_billing.guard_config() OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.guard_link_update() OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.guard_inbox_update() OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.guard_segment() OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.reject_evidence_change() OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.fact_key(text, text, text, timestamptz, timestamptz) OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.ingest_delivery(text, text, text, text, text, timestamptz, timestamptz, timestamptz, text, text, text) OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.create_link_intent(text, uuid, text, timestamptz) OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.next_candidate(text) OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.process_item(uuid) OWNER TO consumer_retention_billing_owner;
ALTER FUNCTION retention_billing.record_attempt(uuid, text) OWNER TO consumer_retention_billing_owner;
ALTER TABLE retention_billing.namespace_config OWNER TO consumer_retention_billing_owner;
ALTER TABLE retention_billing.identity_links OWNER TO consumer_retention_billing_owner;
ALTER TABLE retention_billing.inbox OWNER TO consumer_retention_billing_owner;
ALTER TABLE retention_billing.fact_segments OWNER TO consumer_retention_billing_owner;
ALTER TABLE retention_billing.evidence_log OWNER TO consumer_retention_billing_owner;
ALTER TABLE retention_billing.namespace_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.namespace_config FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.identity_links FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.inbox FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.fact_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.fact_segments FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.evidence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_billing.evidence_log FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_owner_select ON retention_billing.namespace_config AS PERMISSIVE FOR SELECT TO consumer_retention_billing_owner USING (true);
CREATE POLICY billing_owner_select ON retention_billing.identity_links AS PERMISSIVE FOR SELECT TO consumer_retention_billing_owner USING (true);
CREATE POLICY billing_owner_insert ON retention_billing.identity_links AS PERMISSIVE FOR INSERT TO consumer_retention_billing_owner WITH CHECK (true);
CREATE POLICY billing_owner_update ON retention_billing.identity_links AS PERMISSIVE FOR UPDATE TO consumer_retention_billing_owner USING (true) WITH CHECK (true);
CREATE POLICY billing_owner_select ON retention_billing.inbox AS PERMISSIVE FOR SELECT TO consumer_retention_billing_owner USING (true);
CREATE POLICY billing_owner_insert ON retention_billing.inbox AS PERMISSIVE FOR INSERT TO consumer_retention_billing_owner WITH CHECK (true);
CREATE POLICY billing_owner_update ON retention_billing.inbox AS PERMISSIVE FOR UPDATE TO consumer_retention_billing_owner USING (true) WITH CHECK (true);
CREATE POLICY billing_owner_select ON retention_billing.fact_segments AS PERMISSIVE FOR SELECT TO consumer_retention_billing_owner USING (true);
CREATE POLICY billing_owner_insert ON retention_billing.fact_segments AS PERMISSIVE FOR INSERT TO consumer_retention_billing_owner WITH CHECK (true);
CREATE POLICY billing_owner_select ON retention_billing.evidence_log AS PERMISSIVE FOR SELECT TO consumer_retention_billing_owner USING (true);
CREATE POLICY billing_owner_insert ON retention_billing.evidence_log AS PERMISSIVE FOR INSERT TO consumer_retention_billing_owner WITH CHECK (true);

-- Approved ENT0 seams (Owner G2): exactly these two statements, granted to the sealed billing owner only. No advance, no resolver, no registry access, no membership, no SET/ADMIN path, no BYPASSRLS.
GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_billing_owner;
GRANT EXECUTE ON FUNCTION retention_entitlement.admit_entitlement_event(uuid, text, text, text, timestamptz, timestamptz, bigint) TO consumer_retention_billing_owner;

-- Revoke even grants inherited from the migration operator's existing defaults.
REVOKE ALL ON SCHEMA retention_billing FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_billing FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_billing FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_billing FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname <> 'consumer_retention_billing_owner'
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA retention_billing FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA retention_billing FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_billing FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_billing FROM %I',r.rolname);
 END LOOP;
END $$;
SET LOCAL ROLE consumer_retention_billing_builder;
DO $$ BEGIN
 EXECUTE pg_catalog.format('REVOKE consumer_retention_billing_owner FROM %I',session_user);
END $$;
RESET ROLE;
DROP ROLE consumer_retention_billing_builder;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
   ON r.oid IN (m.roleid,m.member,m.grantor) WHERE r.rolname = 'consumer_retention_billing_owner') THEN
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
-- Billing guard G2: the scope outside the new objects is unchanged except the two approved seam attributes (whose exact values are asserted here), then the exact post-state.
DO $billing_g2$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_post text;
 v_acq text := 'consumer_retention_acquisition_owner';
 v_seal text := 'consumer_retention_seal_owner';
 v_bill text := 'consumer_retention_billing_owner';
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 EXECUTE pg_catalog.current_setting('tastkind.billing_digest_sql') INTO v_scope;
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.billing_scope_digest') THEN
  RAISE EXCEPTION 'BILLING_POST_GUARD_DRIFT' USING ERRCODE='42501';
 END IF;
 -- seam values: the entitlement schema has, besides its owner, exactly the three accepted grantees (acquisition, seal, billing) with exactly USAGE, non-grantable; admit has exactly the billing owner with exactly EXECUTE;
 -- advance still has no grantee; the resolver still has exactly the acquisition and seal owners.
 IF (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C")
     FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
     WHERE n.nspname = 'retention_entitlement' AND a.grantee <> n.nspowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'USAGE', false), pg_catalog.jsonb_build_array(v_bill, 'USAGE', false), pg_catalog.jsonb_build_array(v_seal, 'USAGE', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable))
     FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.admit_entitlement_event(uuid,text,text,text,timestamp with time zone,timestamp with time zone,bigint)') AND a.grantee <> p.proowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_bill, 'EXECUTE', false))
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.advance_entitlement_coverage(uuid,text,timestamp with time zone)') AND a.grantee <> p.proowner)
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C")
     FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') AND a.grantee <> p.proowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'EXECUTE', false), pg_catalog.jsonb_build_array(v_seal, 'EXECUTE', false)) THEN
  RAISE EXCEPTION 'BILLING_SEAM_STATE_MISMATCH' USING ERRCODE='42501';
 END IF;
 v_post := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(n.nspowner)::text, n.nspacl::text) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_billing'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, c.relkind, pg_catalog.pg_get_userbyid(c.relowner)::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.reloptions::text) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_billing')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attgenerated, a.attidentity, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname::text COLLATE "C", a.attnum)
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_billing') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.conname::text, o.contype, pg_catalog.pg_get_constraintdef(o.oid)) ORDER BY c.relname::text COLLATE "C", o.conname::text COLLATE "C")
   FROM pg_catalog.pg_constraint o JOIN pg_catalog.pg_class c ON c.oid = o.conrelid WHERE o.connamespace = pg_catalog.to_regnamespace('retention_billing')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_billing')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, t.tgname::text, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relnamespace = pg_catalog.to_regnamespace('retention_billing')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(p.proowner)::text, p.proacl::text, p.proconfig::text, p.prosecdef,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex')) ORDER BY p.proname::text COLLATE "C")
   FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_billing')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.polname::text, o.polcmd, o.polpermissive,
     ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text,
     COALESCE(pg_catalog.pg_get_expr(o.polqual, o.polrelid), ''), COALESCE(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid), '')) ORDER BY c.relname::text COLLATE "C", o.polname::text COLLATE "C", o.polcmd)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_billing')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(COALESCE(n.nspname::text, ''), d.defaclobjtype, d.defaclacl::text) ORDER BY COALESCE(n.nspname::text, '') COLLATE "C", d.defaclobjtype)
   FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'consumer_retention_billing_owner'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil IS NULL) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_billing_owner','consumer_retention_billing_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member, m.grantor) WHERE r.rolname IN ('consumer_retention_billing_owner','consumer_retention_billing_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'consumer_retention_billing_owner' AND n.nspname <> 'retention_billing' AND n.nspname !~ '^pg_toast'),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'consumer_retention_billing_owner' AND p.pronamespace <> pg_catalog.to_regnamespace('retention_billing'))
)::text, 'UTF8')), 'hex')
 );
 IF v_post IS DISTINCT FROM 'fde427d0118ca68125b58572de8e9f4263e27ba57d81fae2c7b3f614b0229ad8' THEN
  RAISE EXCEPTION 'BILLING_POST_STATE_MISMATCH expected=fde427d0118ca68125b58572de8e9f4263e27ba57d81fae2c7b3f614b0229ad8 observed=%', v_post USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $billing_g2$;
COMMIT;
