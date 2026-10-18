-- TastKind R0-B-ENT-R: inactive REGISTRY INTEGRITY SEAL. An append-only, single-epoch chain of operator attestations: "the set of required producers of the ENT0 registry is FINAL and was attested COMPLETE for every instant in
-- [epoch_from, sealed_through]". It is the registry-completeness evidence that a future Free finalization (ENT1-B) will need (Doc 05 section 17.7 AP-5, 17.8). It is NOT that finalization: nothing here changes an
-- ENT0 answer (entitlement_state_at does not read the seal), proves coverage, registers a producer, finalizes Free, extends or grants anything, or authorizes display or purge.
-- Inactive: no role is granted EXECUTE on any function of this schema, the table starts empty, nothing in the repository, a trigger, a worker or the meal-save path calls it, and the migration refuses any platform marker.
-- Soundness argument (local, disposable PostgreSQL 17): sealed_through is the clock sampled by the accepted ENT0 resolver WHILE IT HOLDS the registry SHARE lock (after waiting for every open registry write). ENT0 stamps every later
-- registry write at least one whole millisecond after the clock it reads under its own lock, so after the call no producer can become required (or stop being required) at any instant <= sealed_through. The function also recomputes
-- the registry digest over the part of the registry already covered by the previous seal and refuses to extend the chain if that history changed. A seal is an ATTESTATION by the operator, not a proof that every real-world
-- entitlement source has a producer: that evidence is the ENT-F required-source contract (Owner), which does not exist yet.
-- A superuser (or an administrator who can disable triggers / session_replication_role=replica / TRUNCATE) can bypass every guard here; no claim is made against a deliberate administrator.
BEGIN;
-- Native authenticated superuser only: the read seams are GRANTs/POLICY on objects owned by the entitlement owner (same actor rule as the accepted ENT1-A migration; Owner D-ACT scope: local, inactive installation only).
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
-- Seal guard G1 (same transaction, before any DDL): plain local apply only; the predecessors (including the accepted ENT1-A seams) present and exactly in their accepted ACL state; no platform marker or R0-B binding setting.
DO $seal_g1$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_markers text[];
 v_digest text;
 v_acq text := 'consumer_retention_acquisition_owner';
BEGIN
 SELECT COALESCE(pg_catalog.array_agg(x.m ORDER BY x.m COLLATE "C"), ARRAY[]::text[]) INTO v_markers FROM (
  SELECT 'role:' || r.rolname AS m FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin')
  UNION ALL SELECT 'schema:supabase_migrations' WHERE pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
  UNION ALL SELECT 'setting:supautils' WHERE NULLIF(pg_catalog.current_setting('supautils.reserved_roles', true), '') IS NOT NULL
 ) x;
 IF pg_catalog.cardinality(v_markers) > 0 THEN
  RAISE EXCEPTION 'SEAL_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
 END IF;
 IF NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '') IS NOT NULL THEN
  RAISE EXCEPTION 'SEAL_BINDINGS_NOT_SUPPORTED' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('auth.users') IS NULL
   OR pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL
   OR pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') IS NULL
   OR pg_catalog.to_regclass('retention_entitlement.producers') IS NULL
   OR pg_catalog.to_regclass('retention_acquisition.detail_acquisition_records') IS NULL
   OR pg_catalog.to_regprocedure('retention_acquisition.resolve_detail_acquisition(uuid)') IS NULL
   OR pg_catalog.to_regnamespace('retention_internal') IS NULL THEN
  RAISE EXCEPTION 'SEAL_PREDECESSORS_MISSING' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_seal_owner','consumer_retention_seal_builder'))
   OR pg_catalog.to_regnamespace('retention_seal') IS NOT NULL THEN
  RAISE EXCEPTION 'SEAL_ALREADY_PRESENT' USING ERRCODE='42710';
 END IF;
 -- The objects this migration reads must still be exactly in their accepted post-ENT1-A state: owned by the sealed predecessor owners; the only non-owner grantee of the capture/entitlement schemas, the anchors and the
 -- resolver is the acquisition owner (its accepted ENT1-A seams); the producer registry has no grant to anybody but its owner and exactly its accepted owner-only policy.
 IF (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) IS DISTINCT FROM 'consumer_retention_capture_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = pg_catalog.to_regclass('retention_entitlement.producers')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_capture') IS DISTINCT FROM 'consumer_retention_capture_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_entitlement') IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_acquisition') IS DISTINCT FROM v_acq
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.nspname::text, pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY n.nspname::text COLLATE "C")
       FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
       WHERE n.nspname IN ('retention_capture','retention_entitlement') AND a.grantee <> n.nspowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_array('retention_capture', v_acq, 'USAGE', false), pg_catalog.jsonb_build_array('retention_entitlement', v_acq, 'USAGE', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable))
       FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
       WHERE c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND a.grantee <> c.relowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'SELECT', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable))
       FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
       WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') AND a.grantee <> p.proowner)
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'EXECUTE', false))
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
       WHERE c.oid = pg_catalog.to_regclass('retention_entitlement.producers') AND a.grantee <> c.relowner)
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) <> 2
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers')) <> 1
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers') AND o.polname = 'ent_owner_select' AND o.polcmd = 'r') THEN
  RAISE EXCEPTION 'SEAL_PREDECESSOR_DRIFT' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 PERFORM pg_catalog.set_config('tastkind.seal_digest_sql', $seal_digest$
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_seal_owner','consumer_retention_seal_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_seal_owner','consumer_retention_seal_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, CASE WHEN n.nspname = 'retention_entitlement' THEN NULL ELSE n.nspacl::text END) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_seal' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, CASE WHEN c.oid = pg_catalog.to_regclass('retention_entitlement.producers') THEN NULL ELSE c.relacl::text END, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_seal','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, CASE WHEN p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') THEN NULL ELSE p.proacl::text END, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_seal','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_seal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_seal','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_seal' AND NOT (c.oid = pg_catalog.to_regclass('retention_entitlement.producers') AND o.polname = 'seal_owner_select')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_seal_owner','consumer_retention_seal_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
 $seal_digest$, true);
 EXECUTE pg_catalog.current_setting('tastkind.seal_digest_sql') INTO v_digest;
 PERFORM pg_catalog.set_config('tastkind.seal_scope_digest', v_digest, true);
 PERFORM pg_catalog.set_config('search_path', v_path, true);
 RAISE NOTICE 'SEAL_DDL_BOUNDARY';
END $seal_g1$;
-- Disposable builder owns no SQL objects. Its bootstrap ADMIN edge dies on DROP ROLE.
CREATE ROLE consumer_retention_seal_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_seal_builder TO %I WITH INHERIT FALSE, SET TRUE',session_user);
END $$;
SET LOCAL ROLE consumer_retention_seal_builder;
CREATE ROLE consumer_retention_seal_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_seal_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);
END $$;
RESET ROLE;
CREATE SCHEMA retention_seal AUTHORIZATION consumer_retention_seal_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_seal_owner IN SCHEMA retention_seal REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_seal_owner IN SCHEMA retention_seal REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_seal_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- The seal chain. One row = one attestation. The table cannot represent Free, unknown, coverage, a grant, a producer or anything per owner or per meal.
CREATE TABLE retention_seal.registry_seals (
 seal_seq bigint PRIMARY KEY CONSTRAINT seal_seq_positive CHECK (seal_seq >= 1),
 epoch_from timestamptz NOT NULL,
 sealed_through timestamptz NOT NULL,
 registry_digest text NOT NULL CONSTRAINT seal_digest_hex CHECK (registry_digest ~ '^[0-9a-f]{64}$'),
 producer_count integer NOT NULL CONSTRAINT seal_count_positive CHECK (producer_count >= 1),
 attestation_ref text NOT NULL CONSTRAINT seal_ref_unique UNIQUE CONSTRAINT seal_ref_valid CHECK (pg_catalog.btrim(attestation_ref) <> '' AND pg_catalog.length(attestation_ref) <= 500),
 sealed_by name NOT NULL CONSTRAINT seal_by_nonempty CHECK (sealed_by::text <> ''),
 sealed_at timestamptz NOT NULL,
 seal_policy text NOT NULL CONSTRAINT seal_policy_version CHECK (seal_policy = 'retention-registry-seal-v1'),
 CONSTRAINT seal_epoch_not_after_through CHECK (epoch_from <= sealed_through),
 CONSTRAINT seal_through_not_after_sealed CHECK (sealed_through <= sealed_at)
);

-- Reject precision loss before admission; timestamptz has no rounding typmod.
DO $$
DECLARE t text; c text;
BEGIN
 FOR t,c IN SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='retention_seal' AND data_type='timestamp with time zone'
 LOOP
  EXECUTE pg_catalog.format('ALTER TABLE retention_seal.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (pg_catalog.isfinite(%I) AND %I >= timestamptz ''0001-01-01 00:00:00+00'' AND %I < timestamptz ''10000-01-01 00:00:00+00'' AND pg_catalog.date_trunc(''milliseconds'', %I) = %I))',
    t, t || '_' || c || '_instant', c, c, c, c, c, c);
 END LOOP;
END $$;

-- Chain integrity (row-level, independent of the recording function): seq is gap-free; the epoch never changes; the sealed range and the registry size only grow; time never goes backwards.
CREATE FUNCTION retention_seal.validate_seal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_prev retention_seal.registry_seals%ROWTYPE;
BEGIN
 SELECT s.* INTO v_prev FROM retention_seal.registry_seals s ORDER BY s.seal_seq DESC LIMIT 1;
 IF NOT FOUND THEN
  IF NEW.seal_seq <> 1 THEN
   RAISE EXCEPTION 'SEAL_CHAIN_BROKEN' USING ERRCODE='23514';
  END IF;
 ELSIF NEW.seal_seq <> v_prev.seal_seq + 1 OR NEW.epoch_from <> v_prev.epoch_from OR NEW.sealed_through <= v_prev.sealed_through
    OR NEW.sealed_at < v_prev.sealed_at OR NEW.producer_count < v_prev.producer_count THEN
  RAISE EXCEPTION 'SEAL_CHAIN_BROKEN' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seal_validate BEFORE INSERT ON retention_seal.registry_seals
 FOR EACH ROW EXECUTE FUNCTION retention_seal.validate_seal();
-- A seal never changes and is never removed by a statement of this schema.
CREATE FUNCTION retention_seal.reject_seal_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'SEAL_IMMUTABLE' USING ERRCODE='23514';
END $$;
CREATE TRIGGER seal_immutable BEFORE UPDATE OR DELETE ON retention_seal.registry_seals
 FOR EACH ROW EXECUTE FUNCTION retention_seal.reject_seal_change();

-- Canonical digest of the part of the registry that decides "required at instant t" for every t <= p_through: each producer registered by p_through with its (namespace, role, registered_at) and its retirement ONLY if it is
-- already effective by p_through (a retirement later than p_through is shown as open, so scheduling or changing a FUTURE retirement never alters the history digest). Computed by the database; never supplied by a caller.
CREATE FUNCTION retention_seal.registry_digest_through(p_through timestamptz) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE((
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.namespace, p.role_name::text,
    pg_catalog.to_char(p.registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    CASE WHEN p.retired_at IS NOT NULL AND p.retired_at <= p_through THEN pg_catalog.to_char(p.retired_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE NULL END)
   ORDER BY p.namespace COLLATE "C")
  FROM retention_entitlement.producers p WHERE p.registered_at <= p_through), '[]'::pg_catalog.jsonb)::text, 'UTF8')), 'hex')
$$;
CREATE FUNCTION retention_seal.seal_json(p_outcome text, p_row retention_seal.registry_seals) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT pg_catalog.jsonb_build_object('outcome', p_outcome, 'reason', NULL, 'seal', pg_catalog.jsonb_build_object(
  'seal_seq', p_row.seal_seq,
  'epoch_from', pg_catalog.to_char(p_row.epoch_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'sealed_through', pg_catalog.to_char(p_row.sealed_through AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'registry_digest', p_row.registry_digest, 'producer_count', p_row.producer_count, 'attestation_ref', p_row.attestation_ref,
  'sealed_by', p_row.sealed_by::text,
  'sealed_at', pg_catalog.to_char(p_row.sealed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'policy', p_row.seal_policy))
$$;

-- The recording function. Nothing below executes for any role unless EXECUTE is granted, and this migration grants EXECUTE to nobody.
-- Order: arguments -> READ COMMITTED -> clean transaction -> chain lock -> replay by attestation -> accepted ENT0 resolver ONCE (dummy owner, epoch instant) purely as the registry-lock + clock-sampling primitive
-- (it waits for every open registry write, then samples the clock under the registry SHARE lock; that sample is sealed_through) -> epoch / advance / history checks -> registry size -> insert.
-- Any pending outcome returns before the INSERT and writes nothing; an integrity violation raises.
CREATE FUNCTION retention_seal.record_registry_seal(p_epoch_from timestamptz, p_attestation_ref text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_prev retention_seal.registry_seals%ROWTYPE;
 v_row retention_seal.registry_seals%ROWTYPE;
 v_lock jsonb;
 v_through timestamptz;
 v_count integer;
BEGIN
 IF p_epoch_from IS NULL OR NOT pg_catalog.isfinite(p_epoch_from) OR pg_catalog.date_trunc('milliseconds', p_epoch_from) <> p_epoch_from
    OR p_attestation_ref IS NULL OR pg_catalog.btrim(p_attestation_ref) = '' OR pg_catalog.length(p_attestation_ref) > 500 THEN
  RAISE EXCEPTION 'SEAL_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'SEAL_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 IF pg_catalog.pg_current_xact_id_if_assigned() IS NOT NULL THEN
  RAISE EXCEPTION 'SEAL_DIRTY_TRANSACTION' USING ERRCODE='25000';
 END IF;
 BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('retention_registry_seal:chain', 0));
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'SEAL_LOCK_TIMEOUT', 'seal', NULL);
 END;
 SELECT s.* INTO v_row FROM retention_seal.registry_seals s WHERE s.attestation_ref = p_attestation_ref;
 IF FOUND THEN
  IF v_row.epoch_from <> p_epoch_from THEN
   RAISE EXCEPTION 'SEAL_ATTESTATION_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN retention_seal.seal_json('replayed', v_row);
 END IF;
 v_lock := retention_entitlement.entitlement_state_at('00000000-0000-0000-0000-000000000000'::pg_catalog.uuid, 'epoch'::pg_catalog.timestamptz);
 IF v_lock->>'reason' IN ('REGISTRY_LOCK_TIMEOUT', 'OWNER_LOCK_TIMEOUT') THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', v_lock->>'reason', 'seal', NULL);
 END IF;
 IF v_lock->>'sampled_at' IS NULL THEN
  RAISE EXCEPTION 'SEAL_UNEXPECTED_RESOLVER_ANSWER' USING ERRCODE='XX000';
 END IF;
 v_through := (v_lock->>'sampled_at')::pg_catalog.timestamptz;
 IF p_epoch_from > v_through THEN
  RAISE EXCEPTION 'SEAL_EPOCH_IN_FUTURE' USING ERRCODE='22023';
 END IF;
 SELECT s.* INTO v_prev FROM retention_seal.registry_seals s ORDER BY s.seal_seq DESC LIMIT 1;
 IF FOUND THEN
  IF v_prev.epoch_from <> p_epoch_from THEN
   RAISE EXCEPTION 'SEAL_EPOCH_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF v_through <= v_prev.sealed_through THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'SEAL_NOT_ADVANCED', 'seal', NULL);
  END IF;
  IF retention_seal.registry_digest_through(v_prev.sealed_through) <> v_prev.registry_digest THEN
   RAISE EXCEPTION 'SEAL_REGISTRY_HISTORY_CHANGED' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT pg_catalog.count(*)::pg_catalog.int4 INTO v_count FROM retention_entitlement.producers p WHERE p.registered_at <= v_through;
 IF v_count = 0 THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'SEAL_REGISTRY_EMPTY', 'seal', NULL);
 END IF;
 INSERT INTO retention_seal.registry_seals
  (seal_seq, epoch_from, sealed_through, registry_digest, producer_count, attestation_ref, sealed_by, sealed_at, seal_policy)
 VALUES
  (COALESCE(v_prev.seal_seq, 0) + 1, p_epoch_from, v_through, retention_seal.registry_digest_through(v_through), v_count, p_attestation_ref, session_user,
   pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()), 'retention-registry-seal-v1')
 RETURNING * INTO v_row;
 RETURN retention_seal.seal_json('sealed', v_row);
END $$;

-- Read-only: is this instant inside the attested range of the latest seal? It never reads the registry, ENT0 answers or any per-owner data and never changes anything.
CREATE FUNCTION retention_seal.registry_seal_covers(p_instant timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_seal retention_seal.registry_seals%ROWTYPE;
BEGIN
 IF p_instant IS NULL OR NOT pg_catalog.isfinite(p_instant) THEN
  RAISE EXCEPTION 'SEAL_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 SELECT s.* INTO v_seal FROM retention_seal.registry_seals s ORDER BY s.seal_seq DESC LIMIT 1;
 IF NOT FOUND THEN
  RETURN pg_catalog.jsonb_build_object('sealed', false, 'reason', 'NO_SEAL', 'seal', NULL);
 END IF;
 IF p_instant < v_seal.epoch_from THEN
  RETURN pg_catalog.jsonb_build_object('sealed', false, 'reason', 'BEFORE_EPOCH', 'seal', retention_seal.seal_json('latest', v_seal)->'seal');
 END IF;
 IF p_instant > v_seal.sealed_through THEN
  RETURN pg_catalog.jsonb_build_object('sealed', false, 'reason', 'AFTER_SEALED_THROUGH', 'seal', retention_seal.seal_json('latest', v_seal)->'seal');
 END IF;
 RETURN pg_catalog.jsonb_build_object('sealed', true, 'reason', NULL, 'seal', retention_seal.seal_json('latest', v_seal)->'seal');
END $$;

ALTER FUNCTION retention_seal.validate_seal() OWNER TO consumer_retention_seal_owner;
ALTER FUNCTION retention_seal.reject_seal_change() OWNER TO consumer_retention_seal_owner;
ALTER FUNCTION retention_seal.registry_digest_through(timestamptz) OWNER TO consumer_retention_seal_owner;
ALTER FUNCTION retention_seal.seal_json(text, retention_seal.registry_seals) OWNER TO consumer_retention_seal_owner;
ALTER FUNCTION retention_seal.record_registry_seal(timestamptz, text) OWNER TO consumer_retention_seal_owner;
ALTER FUNCTION retention_seal.registry_seal_covers(timestamptz) OWNER TO consumer_retention_seal_owner;
ALTER TABLE retention_seal.registry_seals OWNER TO consumer_retention_seal_owner;
ALTER TABLE retention_seal.registry_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_seal.registry_seals FORCE ROW LEVEL SECURITY;
CREATE POLICY seal_owner_select ON retention_seal.registry_seals AS PERMISSIVE FOR SELECT TO consumer_retention_seal_owner USING (true);
CREATE POLICY seal_owner_insert ON retention_seal.registry_seals AS PERMISSIVE FOR INSERT TO consumer_retention_seal_owner WITH CHECK (true);

-- Read seams on the ENT0 registry (exactly these four statements), granted to the sealed seal owner only. No EXECUTE for any runtime role, no membership, no SET/ADMIN path, no BYPASSRLS, no write privilege.
CREATE POLICY seal_owner_select ON retention_entitlement.producers AS PERMISSIVE FOR SELECT TO consumer_retention_seal_owner USING (true);
GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_seal_owner;
GRANT SELECT ON retention_entitlement.producers TO consumer_retention_seal_owner;
GRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_seal_owner;

-- Revoke even grants inherited from the migration operator's existing defaults.
REVOKE ALL ON SCHEMA retention_seal FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_seal FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_seal FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_seal FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname <> 'consumer_retention_seal_owner'
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA retention_seal FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA retention_seal FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_seal FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_seal FROM %I',r.rolname);
 END LOOP;
END $$;
SET LOCAL ROLE consumer_retention_seal_builder;
DO $$ BEGIN
 EXECUTE pg_catalog.format('REVOKE consumer_retention_seal_owner FROM %I',session_user);
END $$;
RESET ROLE;
DROP ROLE consumer_retention_seal_builder;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
   ON r.oid IN (m.roleid,m.member,m.grantor) WHERE r.rolname = 'consumer_retention_seal_owner') THEN
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
-- Seal guard G2: the scope outside the new objects is unchanged except the four approved seam attributes (whose exact values are asserted here), then the exact post-state.
DO $seal_g2$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_post text;
 v_acq text := 'consumer_retention_acquisition_owner';
 v_seal text := 'consumer_retention_seal_owner';
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 EXECUTE pg_catalog.current_setting('tastkind.seal_digest_sql') INTO v_scope;
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.seal_scope_digest') THEN
  RAISE EXCEPTION 'SEAL_POST_GUARD_DRIFT' USING ERRCODE='42501';
 END IF;
 -- seam values: the entitlement schema has, besides its owner, exactly the two accepted grantees (acquisition owner from ENT1-A, seal owner now) with exactly USAGE, non-grantable; the registry has exactly one grantee with exactly SELECT;
 -- the resolver has exactly the acquisition owner and the seal owner with exactly EXECUTE; the registry carries exactly its accepted owner policy and the new seal-owner SELECT policy.
 IF (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C")
     FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
     WHERE n.nspname = 'retention_entitlement' AND a.grantee <> n.nspowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'USAGE', false), pg_catalog.jsonb_build_array(v_seal, 'USAGE', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable))
     FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
     WHERE c.oid = pg_catalog.to_regclass('retention_entitlement.producers') AND a.grantee <> c.relowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_seal, 'SELECT', false))
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C")
     FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') AND a.grantee <> p.proowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array(v_acq, 'EXECUTE', false), pg_catalog.jsonb_build_array(v_seal, 'EXECUTE', false))
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers')) <> 2
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers') AND o.polname = 'ent_owner_select' AND o.polcmd = 'r')
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_entitlement.producers') AND o.polname = 'seal_owner_select'
       AND o.polcmd = 'r' AND o.polpermissive AND o.polroles = ARRAY[(SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = v_seal)]::pg_catalog.oid[]
       AND pg_catalog.pg_get_expr(o.polqual, o.polrelid) = 'true' AND o.polwithcheck IS NULL) THEN
  RAISE EXCEPTION 'SEAL_SEAM_STATE_MISMATCH' USING ERRCODE='42501';
 END IF;
 v_post := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(n.nspowner)::text, n.nspacl::text) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_seal'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, c.relkind, pg_catalog.pg_get_userbyid(c.relowner)::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.reloptions::text) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_seal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attgenerated, a.attidentity, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname::text COLLATE "C", a.attnum)
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_seal') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.conname::text, o.contype, pg_catalog.pg_get_constraintdef(o.oid)) ORDER BY c.relname::text COLLATE "C", o.conname::text COLLATE "C")
   FROM pg_catalog.pg_constraint o JOIN pg_catalog.pg_class c ON c.oid = o.conrelid WHERE o.connamespace = pg_catalog.to_regnamespace('retention_seal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_seal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, t.tgname::text, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relnamespace = pg_catalog.to_regnamespace('retention_seal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(p.proowner)::text, p.proacl::text, p.proconfig::text, p.prosecdef,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex')) ORDER BY p.proname::text COLLATE "C")
   FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_seal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.polname::text, o.polcmd, o.polpermissive,
     ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text,
     COALESCE(pg_catalog.pg_get_expr(o.polqual, o.polrelid), ''), COALESCE(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid), '')) ORDER BY c.relname::text COLLATE "C", o.polname::text COLLATE "C")
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_seal')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(COALESCE(n.nspname::text, ''), d.defaclobjtype, d.defaclacl::text) ORDER BY COALESCE(n.nspname::text, '') COLLATE "C", d.defaclobjtype)
   FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'consumer_retention_seal_owner'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil IS NULL) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_seal_owner','consumer_retention_seal_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member, m.grantor) WHERE r.rolname IN ('consumer_retention_seal_owner','consumer_retention_seal_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'consumer_retention_seal_owner' AND n.nspname <> 'retention_seal' AND n.nspname !~ '^pg_toast'),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'consumer_retention_seal_owner' AND p.pronamespace <> pg_catalog.to_regnamespace('retention_seal'))
)::text, 'UTF8')), 'hex')
 );
 IF v_post IS DISTINCT FROM 'a80974703ed4b0cd26d5ac4a57328fe1991372c3ab5484c7a6b492f84d242950' THEN
  RAISE EXCEPTION 'SEAL_POST_STATE_MISMATCH expected=a80974703ed4b0cd26d5ac4a57328fe1991372c3ab5484c7a6b492f84d242950 observed=%', v_post USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $seal_g2$;
COMMIT;
