-- TastKind R0-B-ENT0 (R3): append-only entitlement fact ledger, monotonic coverage and state_at(owner, instant) only. Producer registry EMPTY; no grant, no meal-save link,
-- no read of subscription_entitlements, no backfill, no purge, no retention grant; retention stays inactive. Owner decision OQ-1: trial is a Paid-level fact kept distinct from a paid subscription.
-- R1 contract: (1) every fact is a FINITE interval [valid_from, valid_until). NOT NULL is not a length limit (a plausible term is the future producer contract's job); a fact that ends only means "not renewed",
--   never an immediate cancellation, refund or void. (2) A positive paid/trial fact alone proves the Paid-level state; coverage only proves Free; everything else is unknown.
-- (3) The model holds POSITIVE facts only: cancellation, refund, void and correction are not representable and are not handled here. A same-key different-payload event is refused at admission.
-- (4) R2 consistency contract (replaces the R1 "5 second commit bound", which a registry writer could bypass with SET CONSTRAINTS ... IMMEDIATE, PREPARE TRANSACTION or commit-path latency):
--   (a) ONE registry lock = the table lock on retention_entitlement.producers. A registry write takes ROW EXCLUSIVE (or stronger) on it automatically and keeps it until its transaction ends (commit, rollback,
--       disconnect, COMMIT/ROLLBACK PREPARED); it is released only AFTER the writer's rows are visible. entitlement_state_at, admit_entitlement_event and advance_entitlement_coverage take SHARE on it (waiting for
--       any registry write that is still open) BEFORE judging anything and refuse every isolation level except READ COMMITTED, because each command after the lock must take a fresh snapshot.
--       Lock order is fixed: registry lock first, per-owner advisory lock second. A registry-lock wait longer than lock_timeout never yields an answer: state_at returns unknown/REGISTRY_LOCK_TIMEOUT, admission raises 55P03 and writes nothing.
--       The function-level lock_timeout (2s) bounds EACH lock wait inside one call (registry lock, per-owner lock, row locks) separately and is restored when the call ends; it is NOT a bound on the total duration of a call.
--       The SHARE lock is held until the CALLER's transaction ends (an open caller transaction keeps registry writers waiting).
--   (b) A registry row's effective time (registered_at, first retired_at) is stamped or checked against the server clock read INSIDE the BEFORE trigger (after the writer holds its lock): at least the next whole
--       millisecond after that reading. A reader samples the clock after ITS lock, so every registry write still open when a reader samples is effective strictly after every instant that reader may resolve.
--   (c) Not a historical record: a free or paid answer is not revoked by any later operation that follows this contract (registry consistency at the moment of resolution; fact/coverage completeness and registry integrity sealing
--       are separate, later dependencies); unknown promises nothing. Admitted facts survive the retirement of their producer.
--   (d) R3: the resolver additionally waits for in-flight (uncommitted) admissions and coverage advances of the same owner (shared per-owner advisory locks, after the registry lock, namespace order), because the
--       registry lock does not order a producer window that closes by the clock; see the resolver comment. Facts and coverage are still not "complete" in any ENT1 sense.
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
-- Entitlement guard G1 (same transaction, before any DDL): plain local apply only. Any Supabase platform marker or R0-B binding
-- setting is refused; a Hosted-bound mode does not exist in this migration and needs separate authorization.
DO $ent_g1$
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
  RAISE EXCEPTION 'ENT_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
 END IF;
 IF NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '') IS NOT NULL THEN
  RAISE EXCEPTION 'ENT_BINDINGS_NOT_SUPPORTED' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('auth.users') IS NULL OR pg_catalog.to_regnamespace('retention_capture') IS NULL OR pg_catalog.to_regnamespace('retention_internal') IS NULL THEN
  RAISE EXCEPTION 'ENT_PREDECESSORS_MISSING' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder'))
   OR pg_catalog.to_regnamespace('retention_entitlement') IS NOT NULL THEN
  RAISE EXCEPTION 'ENT_ALREADY_PRESENT' USING ERRCODE='42710';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 PERFORM pg_catalog.set_config('tastkind.ent_scope_digest', (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_entitlement' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_entitlement','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_entitlement','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_entitlement' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.oid = t.tgconstraint AND k.connamespace = pg_catalog.to_regnamespace('retention_entitlement')))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_entitlement','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_entitlement'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder'))),
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
 RAISE NOTICE 'ENT_DDL_BOUNDARY';
END $ent_g1$;
-- Disposable builder owns no SQL objects. Its bootstrap ADMIN edge dies on DROP ROLE.
CREATE ROLE consumer_retention_entitlement_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_entitlement_builder TO %I WITH INHERIT FALSE, SET TRUE',session_user);
END $$;
SET LOCAL ROLE consumer_retention_entitlement_builder;
CREATE ROLE consumer_retention_entitlement_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_entitlement_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);
END $$;
RESET ROLE;
CREATE SCHEMA retention_entitlement AUTHORIZATION consumer_retention_entitlement_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_entitlement_owner IN SCHEMA retention_entitlement REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_entitlement_owner IN SCHEMA retention_entitlement REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_entitlement_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Append-only entitlement FACT ledger. A fact is "owner O belongs to class C during [valid_from, valid_until)", asserted by a registered producer.
-- The producer registry is EMPTY in this migration and no function writes to it: there is no producer, no seed, no caller-supplied tier.
-- Retention stays inactive: nothing here reads or writes meal records, anchors, grants or any public object.
CREATE TABLE retention_entitlement.producers (
 namespace text PRIMARY KEY CONSTRAINT producers_namespace_format CHECK (namespace ~ '^[a-z][a-z0-9_.-]{2,63}$'),
 role_name name NOT NULL CONSTRAINT producers_role_name_nonempty CHECK (role_name::text <> '') CONSTRAINT producers_role_name_unique UNIQUE,
 registered_at timestamptz NOT NULL,
 retired_at timestamptz,
 CONSTRAINT producers_retired_after_registered CHECK (retired_at IS NULL OR retired_at > registered_at)
);
CREATE TABLE retention_entitlement.entitlement_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 namespace text NOT NULL REFERENCES retention_entitlement.producers(namespace),
 upstream_event_id text NOT NULL CONSTRAINT event_upstream_id_valid CHECK (btrim(upstream_event_id) <> '' AND length(upstream_event_id) <= 200),
 class text NOT NULL CONSTRAINT event_class_valid CHECK (class IN ('paid','trial')),
 valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,
 source_sequence bigint CONSTRAINT event_sequence_valid CHECK (source_sequence IS NULL OR source_sequence >= 0),
 semantic_digest text NOT NULL CONSTRAINT event_digest_hex CHECK (semantic_digest ~ '^[0-9a-f]{64}$'),
 admitted_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()),
 CONSTRAINT event_interval_valid CHECK (valid_until > valid_from),
 CONSTRAINT event_upstream_unique UNIQUE (owner_user_id, namespace, upstream_event_id)
);
CREATE INDEX entitlement_events_lookup ON retention_entitlement.entitlement_events (owner_user_id, valid_from, valid_until);
CREATE TABLE retention_entitlement.entitlement_coverage (
 owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 namespace text NOT NULL REFERENCES retention_entitlement.producers(namespace),
 covered_through timestamptz NOT NULL,
 revision bigint NOT NULL CONSTRAINT coverage_revision_valid CHECK (revision >= 1),
 PRIMARY KEY (owner_user_id, namespace)
);

-- Reject precision loss before admission; timestamptz has no rounding typmod.
DO $$
DECLARE t text; c text;
BEGIN
 FOR t,c IN SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='retention_entitlement' AND data_type='timestamp with time zone'
 LOOP
  EXECUTE pg_catalog.format('ALTER TABLE retention_entitlement.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (pg_catalog.isfinite(%I) AND %I >= timestamptz ''0001-01-01 00:00:00+00'' AND %I < timestamptz ''10000-01-01 00:00:00+00'' AND pg_catalog.date_trunc(''milliseconds'', %I) = %I))',
    t, t || '_' || c || '_instant', c, c, c, c, c, c);
 END LOOP;
END $$;

-- Content of an admitted fact never changes; coverage only moves forward by exactly one revision; a producer can only be retired once.
CREATE FUNCTION retention_entitlement.reject_event_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'ENT_EVENT_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER event_immutable BEFORE UPDATE ON retention_entitlement.entitlement_events
 FOR EACH ROW EXECUTE FUNCTION retention_entitlement.reject_event_update();
CREATE FUNCTION retention_entitlement.guard_coverage_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.namespace IS DISTINCT FROM OLD.namespace
    OR NEW.covered_through <= OLD.covered_through OR NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'ENT_COVERAGE_REGRESSION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER coverage_guard BEFORE UPDATE ON retention_entitlement.entitlement_coverage
 FOR EACH ROW EXECUTE FUNCTION retention_entitlement.guard_coverage_update();
-- Registry guard (BEFORE row trigger). It runs after the writer already holds the registry lock (ROW EXCLUSIVE, taken by the INSERT/UPDATE/DELETE statement itself, held to the end of the transaction),
-- so the clock it reads is not earlier than the lock grant. The effective time of a registry row (registered_at; the first retired_at) must be at least the NEXT whole millisecond after that reading
-- (bound = floor_ms(clock)+1ms, strictly greater than the reading); registered_at NULL on INSERT is stamped with the bound. No deferred check exists: nothing here depends on transaction age or commit timing.
-- A row is never deleted; identity and registration time never change. session_replication_role=replica, disabling the trigger, TRUNCATE and direct catalog edits remain privileged operations outside the contract.
CREATE FUNCTION retention_entitlement.guard_producer_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_bound timestamptz := pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()) + interval '1 millisecond';
BEGIN
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'ENT_PRODUCER_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.registered_at IS NULL THEN
   NEW.registered_at := v_bound;
  END IF;
  IF NEW.registered_at < v_bound OR (NEW.retired_at IS NOT NULL AND NEW.retired_at < v_bound) THEN
   RAISE EXCEPTION 'ENT_PRODUCER_RETROACTIVE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP = 'UPDATE' THEN
  IF NEW.namespace IS DISTINCT FROM OLD.namespace OR NEW.role_name IS DISTINCT FROM OLD.role_name
     OR NEW.registered_at IS DISTINCT FROM OLD.registered_at OR (OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at) THEN
   RAISE EXCEPTION 'ENT_PRODUCER_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF OLD.retired_at IS NULL AND NEW.retired_at IS NOT NULL AND NEW.retired_at < v_bound THEN
   RAISE EXCEPTION 'ENT_PRODUCER_RETROACTIVE' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER producer_guard BEFORE INSERT OR UPDATE OR DELETE ON retention_entitlement.producers
 FOR EACH ROW EXECUTE FUNCTION retention_entitlement.guard_producer_update();
-- Producer admission. The caller must be the DATABASE ROLE registered for the namespace (session_user); strings in the arguments authenticate nothing.
-- The digest is computed here from the canonical fields, never accepted from the caller. Nothing below executes unless EXECUTE was granted,
-- and this migration grants EXECUTE to nobody.
CREATE FUNCTION retention_entitlement.admit_entitlement_event(
 p_owner uuid, p_namespace text, p_upstream_event_id text, p_class text,
 p_valid_from timestamptz, p_valid_until timestamptz, p_source_sequence bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_digest text;
 v_existing record;
 v_cov timestamptz;
 v_id uuid;
 v_registered timestamptz;
BEGIN
 IF p_owner IS NULL OR p_namespace IS NULL OR p_upstream_event_id IS NULL OR pg_catalog.btrim(p_upstream_event_id) = ''
    OR pg_catalog.length(p_upstream_event_id) > 200 OR p_class IS NULL OR p_class NOT IN ('paid','trial')
    OR p_valid_from IS NULL OR p_valid_until IS NULL OR NOT pg_catalog.isfinite(p_valid_from) OR NOT pg_catalog.isfinite(p_valid_until)
    OR p_valid_until <= p_valid_from
    OR pg_catalog.date_trunc('milliseconds', p_valid_from) <> p_valid_from OR pg_catalog.date_trunc('milliseconds', p_valid_until) <> p_valid_until
    OR (p_source_sequence IS NOT NULL AND p_source_sequence < 0) THEN
  RAISE EXCEPTION 'ENT_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM retention_entitlement.producers p
   WHERE p.namespace = p_namespace AND pg_catalog.pg_has_role(session_user, p.role_name, 'USAGE')) THEN
  RAISE EXCEPTION 'ENT_PRODUCER_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 -- registry lock FIRST (fixed order: registry lock, then per-owner lock): waits for any registry write still open; every command below takes a fresh READ COMMITTED snapshot.
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'ENT_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 LOCK TABLE retention_entitlement.producers IN SHARE MODE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':retention_entitlement:' || p_namespace, 0));
 -- authority window judged with the server wall clock WHILE THE LOCK IS HELD, immediately before the write (a call that waited on the lock cannot land after the producer's retirement)
 SELECT p.registered_at INTO v_registered FROM retention_entitlement.producers p
   WHERE p.namespace = p_namespace AND p.registered_at <= pg_catalog.clock_timestamp()
     AND (p.retired_at IS NULL OR pg_catalog.clock_timestamp() < p.retired_at)
     AND pg_catalog.pg_has_role(session_user, p.role_name, 'USAGE');
 IF NOT FOUND THEN
  RAISE EXCEPTION 'ENT_PRODUCER_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 v_digest :=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
  p_owner::text, p_namespace, p_upstream_event_id, p_class,
  pg_catalog.to_char(p_valid_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  pg_catalog.to_char(p_valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  p_source_sequence)::text, 'UTF8')), 'hex');
 SELECT e.event_id, e.semantic_digest INTO v_existing FROM retention_entitlement.entitlement_events e
  WHERE e.owner_user_id = p_owner AND e.namespace = p_namespace AND e.upstream_event_id = p_upstream_event_id;
 IF FOUND THEN
  IF v_existing.semantic_digest = v_digest THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'replayed', 'event_id', v_existing.event_id, 'semantic_digest', v_digest);
  END IF;
  RAISE EXCEPTION 'ENT_EVENT_CONFLICT' USING ERRCODE='23505';
 END IF;
 IF p_valid_from < v_registered THEN
  RAISE EXCEPTION 'ENT_EVENT_BEFORE_PRODUCER_REGISTRATION' USING ERRCODE='23514';
 END IF;
 SELECT c.covered_through INTO v_cov FROM retention_entitlement.entitlement_coverage c
  WHERE c.owner_user_id = p_owner AND c.namespace = p_namespace;
 IF v_cov IS NOT NULL AND p_valid_from <= v_cov THEN
  RAISE EXCEPTION 'ENT_EVENT_BELOW_COVERAGE' USING ERRCODE='23514';
 END IF;
 INSERT INTO retention_entitlement.entitlement_events
  (owner_user_id, namespace, upstream_event_id, class, valid_from, valid_until, source_sequence, semantic_digest)
 VALUES (p_owner, p_namespace, p_upstream_event_id, p_class, p_valid_from, p_valid_until, p_source_sequence, v_digest)
 RETURNING event_id INTO v_id;
 RETURN pg_catalog.jsonb_build_object('outcome', 'admitted', 'event_id', v_id, 'semantic_digest', v_digest);
END $$;

CREATE FUNCTION retention_entitlement.advance_entitlement_coverage(p_owner uuid, p_namespace text, p_through timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_cur record;
BEGIN
 IF p_owner IS NULL OR p_namespace IS NULL OR p_through IS NULL OR NOT pg_catalog.isfinite(p_through)
    OR pg_catalog.date_trunc('milliseconds', p_through) <> p_through THEN
  RAISE EXCEPTION 'ENT_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM retention_entitlement.producers p
   WHERE p.namespace = p_namespace AND pg_catalog.pg_has_role(session_user, p.role_name, 'USAGE')) THEN
  RAISE EXCEPTION 'ENT_PRODUCER_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF p_through > pg_catalog.clock_timestamp() THEN
  RAISE EXCEPTION 'ENT_COVERAGE_IN_FUTURE' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'ENT_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 LOCK TABLE retention_entitlement.producers IN SHARE MODE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':retention_entitlement:' || p_namespace, 0));
 IF NOT EXISTS (SELECT 1 FROM retention_entitlement.producers p
   WHERE p.namespace = p_namespace AND p.registered_at <= pg_catalog.clock_timestamp()
     AND (p.retired_at IS NULL OR pg_catalog.clock_timestamp() < p.retired_at)
     AND pg_catalog.pg_has_role(session_user, p.role_name, 'USAGE')) THEN
  RAISE EXCEPTION 'ENT_PRODUCER_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT c.covered_through, c.revision INTO v_cur FROM retention_entitlement.entitlement_coverage c
  WHERE c.owner_user_id = p_owner AND c.namespace = p_namespace FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO retention_entitlement.entitlement_coverage (owner_user_id, namespace, covered_through, revision) VALUES (p_owner, p_namespace, p_through, 1);
  RETURN pg_catalog.jsonb_build_object('outcome', 'advanced', 'revision', 1);
 END IF;
 IF p_through < v_cur.covered_through THEN
  RAISE EXCEPTION 'ENT_COVERAGE_REGRESSION' USING ERRCODE='23514';
 END IF;
 IF p_through = v_cur.covered_through THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'unchanged', 'revision', v_cur.revision);
 END IF;
 UPDATE retention_entitlement.entitlement_coverage SET covered_through = p_through, revision = v_cur.revision + 1
  WHERE owner_user_id = p_owner AND namespace = p_namespace;
 RETURN pg_catalog.jsonb_build_object('outcome', 'advanced', 'revision', v_cur.revision + 1);
END $$;

-- The authoritative resolver. It is a function of the ledger and registry rows visible when it runs, NOT a historical record: the same (owner, instant) may later answer differently when information is completed
-- (only unknown can change to free/paid, and a trial basis to paid_subscription). CONSISTENCY ENTRY CONTRACT: it first takes SHARE on the registry table (waiting for any registry write that is still open; the lock stays
-- until the caller's transaction ends), only then samples the clock, and only then reads: the single resolving statement therefore takes a fresh READ COMMITTED snapshot that is later than the lock grant. Any other isolation level
-- is refused (a REPEATABLE READ / SERIALIZABLE snapshot would predate the lock), and the function is VOLATILE on purpose (a STABLE function would reuse the caller's older statement snapshot). Waiting longer than lock_timeout
-- returns unknown/REGISTRY_LOCK_TIMEOUT: never free, never an error that a caller could mistake for an answer. An instant later than the clock sampled under the lock is unknown/INSTANT_IN_FUTURE.
-- R3: after the registry lock it also waits (SHARED per-owner advisory locks, namespace order) for every in-flight admission or coverage advance of the SAME owner; a wait longer than lock_timeout returns
-- unknown/OWNER_LOCK_TIMEOUT. The clock is sampled and the resolving statement runs only after all those locks are held, so a fact that was admitted before a producer's retirement time but commits later is either
-- visible to the resolution or the resolution does not answer. These locks, like the registry SHARE, last until the caller's transaction (or the savepoint that took them) ends.
-- A positive paid/trial fact covering the instant proves the Paid-level state by itself (coverage is not consulted for it). ONE SQL statement reads coverage and facts from one snapshot: a producer commits events and coverage in one
-- transaction, so the statement sees both or neither. Free is provable only when EVERY namespace required at the instant has coverage >= instant and no fact covers it (an admitted fact counts at its instant whether or not its
-- producer is still registered); absence of facts without coverage is UNKNOWN, never Free. A trial fact is Paid-level for retention (Owner decision OQ-1) but is reported with its own basis and is never presented as a paid
-- subscription. The evaluation instant is an argument: now() and any mutable table are never read.
CREATE FUNCTION retention_entitlement.entitlement_state_at(p_owner uuid, p_instant timestamptz)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_sampled timestamptz;
 v_ns text;
BEGIN
 IF p_owner IS NULL OR p_instant IS NULL OR NOT pg_catalog.isfinite(p_instant) THEN
  RAISE EXCEPTION 'ENT_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'ENT_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 BEGIN
  LOCK TABLE retention_entitlement.producers IN SHARE MODE;
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('state', 'unknown', 'basis', NULL, 'reason', 'REGISTRY_LOCK_TIMEOUT', 'sampled_at', NULL,
   'evidence', pg_catalog.jsonb_build_object('events', '[]'::pg_catalog.jsonb, 'coverage', '[]'::pg_catalog.jsonb), 'policy', 'retention-entitlement-v1');
 END;
 -- R3: wait for every IN-FLIGHT admission / coverage advance of THIS owner. admit and advance hold the per-owner advisory lock (key owner:namespace, exclusive) from their window check until their transaction ends,
 -- so an admission that passed its check before a retirement time but has not committed yet blocks here; a SHARED request is compatible with other readers and conflicts only with those writers. The registry lock above is
 -- already held, so the namespace list cannot change while we walk it (lock order: registry lock first, then the owner locks in namespace order). Other owners are never touched (the key contains the owner).
 BEGIN
  FOR v_ns IN SELECT p.namespace FROM retention_entitlement.producers p ORDER BY p.namespace COLLATE "C" LOOP
   PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_owner::text || ':retention_entitlement:' || v_ns, 0));
  END LOOP;
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('state', 'unknown', 'basis', NULL, 'reason', 'OWNER_LOCK_TIMEOUT', 'sampled_at', NULL,
   'evidence', pg_catalog.jsonb_build_object('events', '[]'::pg_catalog.jsonb, 'coverage', '[]'::pg_catalog.jsonb), 'policy', 'retention-entitlement-v1');
 END;
 v_sampled := pg_catalog.clock_timestamp();
 IF p_instant > v_sampled THEN
  RETURN pg_catalog.jsonb_build_object('state', 'unknown', 'basis', NULL, 'reason', 'INSTANT_IN_FUTURE',
   'sampled_at', pg_catalog.to_char(v_sampled AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'evidence', pg_catalog.jsonb_build_object('events', '[]'::pg_catalog.jsonb, 'coverage', '[]'::pg_catalog.jsonb), 'policy', 'retention-entitlement-v1');
 END IF;
 RETURN (
  WITH required AS (
   SELECT p.namespace FROM retention_entitlement.producers p
   WHERE p.registered_at <= p_instant AND (p.retired_at IS NULL OR p_instant < p.retired_at)
  ), cov AS (
   SELECT r.namespace, c.covered_through, c.revision, COALESCE(c.covered_through >= p_instant, false) AS ok
   FROM required r LEFT JOIN retention_entitlement.entitlement_coverage c ON c.namespace = r.namespace AND c.owner_user_id = p_owner
  ), hit AS (
   SELECT e.event_id, e.class FROM retention_entitlement.entitlement_events e
   WHERE e.owner_user_id = p_owner AND e.valid_from <= p_instant AND p_instant < e.valid_until
  ), summary AS (
   SELECT (SELECT pg_catalog.count(*) FROM required) AS n_required,
          (SELECT pg_catalog.count(*) FROM cov WHERE cov.ok) AS n_covered,
          (SELECT pg_catalog.count(*) FROM hit WHERE hit.class = 'paid') AS n_paid,
          (SELECT pg_catalog.count(*) FROM hit WHERE hit.class = 'trial') AS n_trial
  )
  SELECT pg_catalog.jsonb_build_object(
   'state', CASE WHEN s.n_paid > 0 OR s.n_trial > 0 THEN 'paid' WHEN s.n_required = 0 THEN 'unknown' WHEN s.n_covered < s.n_required THEN 'unknown' ELSE 'free' END,
   'basis', CASE WHEN s.n_paid > 0 THEN 'paid_subscription' WHEN s.n_trial > 0 THEN 'trial' ELSE NULL END,
   'reason', CASE WHEN s.n_paid > 0 OR s.n_trial > 0 THEN NULL WHEN s.n_required = 0 THEN 'NO_REQUIRED_PRODUCER' WHEN s.n_covered < s.n_required THEN 'COVERAGE_SHORT' ELSE NULL END,
   'evidence', pg_catalog.jsonb_build_object(
     'events', COALESCE((SELECT pg_catalog.jsonb_agg(h.event_id ORDER BY h.event_id) FROM hit h), '[]'::pg_catalog.jsonb),
     'coverage', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('namespace', v.namespace,
        'covered_through', pg_catalog.to_char(v.covered_through AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'revision', v.revision) ORDER BY v.namespace) FROM cov v), '[]'::pg_catalog.jsonb)),
   'sampled_at', pg_catalog.to_char(v_sampled AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'policy', 'retention-entitlement-v1')
  FROM summary s
 );
END $$;

ALTER FUNCTION retention_entitlement.reject_event_update() OWNER TO consumer_retention_entitlement_owner;
ALTER FUNCTION retention_entitlement.guard_coverage_update() OWNER TO consumer_retention_entitlement_owner;
ALTER FUNCTION retention_entitlement.guard_producer_update() OWNER TO consumer_retention_entitlement_owner;
ALTER FUNCTION retention_entitlement.admit_entitlement_event(uuid, text, text, text, timestamptz, timestamptz, bigint) OWNER TO consumer_retention_entitlement_owner;
ALTER FUNCTION retention_entitlement.advance_entitlement_coverage(uuid, text, timestamptz) OWNER TO consumer_retention_entitlement_owner;
ALTER FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) OWNER TO consumer_retention_entitlement_owner;
ALTER TABLE retention_entitlement.producers OWNER TO consumer_retention_entitlement_owner;
ALTER TABLE retention_entitlement.entitlement_events OWNER TO consumer_retention_entitlement_owner;
ALTER TABLE retention_entitlement.entitlement_coverage OWNER TO consumer_retention_entitlement_owner;
ALTER TABLE retention_entitlement.producers ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_entitlement.producers FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_entitlement.entitlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_entitlement.entitlement_events FORCE ROW LEVEL SECURITY;
ALTER TABLE retention_entitlement.entitlement_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_entitlement.entitlement_coverage FORCE ROW LEVEL SECURITY;
-- Only the sealed owner (through the definer functions above) can touch the data; no policy exists for any runtime role.
CREATE POLICY ent_owner_select ON retention_entitlement.producers AS PERMISSIVE FOR SELECT TO consumer_retention_entitlement_owner USING (true);
CREATE POLICY ent_owner_select ON retention_entitlement.entitlement_events AS PERMISSIVE FOR SELECT TO consumer_retention_entitlement_owner USING (true);
CREATE POLICY ent_owner_insert ON retention_entitlement.entitlement_events AS PERMISSIVE FOR INSERT TO consumer_retention_entitlement_owner WITH CHECK (true);
CREATE POLICY ent_owner_select ON retention_entitlement.entitlement_coverage AS PERMISSIVE FOR SELECT TO consumer_retention_entitlement_owner USING (true);
CREATE POLICY ent_owner_insert ON retention_entitlement.entitlement_coverage AS PERMISSIVE FOR INSERT TO consumer_retention_entitlement_owner WITH CHECK (true);
CREATE POLICY ent_owner_update ON retention_entitlement.entitlement_coverage AS PERMISSIVE FOR UPDATE TO consumer_retention_entitlement_owner USING (true) WITH CHECK (true);

-- Revoke even grants inherited from the migration operator's existing defaults.
-- Revoke even grants inherited from the migration operator's existing defaults.
REVOKE ALL ON SCHEMA retention_entitlement FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_entitlement FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_entitlement FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_entitlement FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname <> 'consumer_retention_entitlement_owner'
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA retention_entitlement FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA retention_entitlement FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_entitlement FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_entitlement FROM %I',r.rolname);
 END LOOP;
END $$;
SET LOCAL ROLE consumer_retention_entitlement_builder;
DO $$ BEGIN
 EXECUTE pg_catalog.format('REVOKE consumer_retention_entitlement_owner FROM %I',session_user);
END $$;
RESET ROLE;
DROP ROLE consumer_retention_entitlement_builder;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
   ON r.oid IN (m.roleid,m.member,m.grantor) WHERE r.rolname = 'consumer_retention_entitlement_owner') THEN
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
-- Entitlement guard G2: unchanged scope outside the new objects, then the exact post-state.
DO $ent_g2$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_post text;
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 v_scope := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_entitlement' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_entitlement','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_entitlement','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_entitlement' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.oid = t.tgconstraint AND k.connamespace = pg_catalog.to_regnamespace('retention_entitlement')))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_entitlement','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_entitlement'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder'))),
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
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.ent_scope_digest') THEN
  RAISE EXCEPTION 'ENT_POST_GUARD_DRIFT' USING ERRCODE='42501';
 END IF;
 v_post := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(n.nspowner)::text, n.nspacl::text) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_entitlement'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, c.relkind, pg_catalog.pg_get_userbyid(c.relowner)::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.reloptions::text) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_entitlement')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attgenerated, a.attidentity, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname::text COLLATE "C", a.attnum)
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_entitlement') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.conname::text, o.contype, pg_catalog.pg_get_constraintdef(o.oid)) ORDER BY c.relname::text COLLATE "C", o.conname::text COLLATE "C")
   FROM pg_catalog.pg_constraint o JOIN pg_catalog.pg_class c ON c.oid = o.conrelid WHERE o.connamespace = pg_catalog.to_regnamespace('retention_entitlement')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_entitlement')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, t.tgname::text, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relnamespace = pg_catalog.to_regnamespace('retention_entitlement')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(p.proowner)::text, p.proacl::text, p.proconfig::text, p.prosecdef,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex')) ORDER BY p.proname::text COLLATE "C")
   FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_entitlement')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.polname::text, o.polcmd, o.polpermissive,
     ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text,
     COALESCE(pg_catalog.pg_get_expr(o.polqual, o.polrelid), ''), COALESCE(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid), '')) ORDER BY c.relname::text COLLATE "C", o.polname::text COLLATE "C")
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_entitlement')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(COALESCE(n.nspname::text, ''), d.defaclobjtype, d.defaclacl::text) ORDER BY COALESCE(n.nspname::text, '') COLLATE "C", d.defaclobjtype)
   FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'consumer_retention_entitlement_owner'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil IS NULL) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member, m.grantor) WHERE r.rolname IN ('consumer_retention_entitlement_owner','consumer_retention_entitlement_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'consumer_retention_entitlement_owner' AND n.nspname <> 'retention_entitlement' AND n.nspname !~ '^pg_toast'),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'consumer_retention_entitlement_owner' AND p.pronamespace <> pg_catalog.to_regnamespace('retention_entitlement'))
)::text, 'UTF8')), 'hex')
 );
 IF v_post IS DISTINCT FROM 'aa4c8eee8bfb9aa29030ce602a43f58afea81b0c4fcbc9f49e2c957a3f0bd003' THEN
  RAISE EXCEPTION 'ENT_POST_STATE_MISMATCH expected=aa4c8eee8bfb9aa29030ce602a43f58afea81b0c4fcbc9f49e2c957a3f0bd003 observed=%', v_post USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $ent_g2$;
COMMIT;
