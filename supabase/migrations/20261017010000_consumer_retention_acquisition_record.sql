-- TastKind R0-B-ENT1-A: inactive Paid/trial ACQUISITION RECEIPT. One immutable receipt per meal resource = the owner's entitlement at the meal's captured T0 (R0-B-CAP anchor), resolved ONCE by the accepted
-- ENT0 resolver entitlement_state_at(owner, T0). A receipt is acquisition EVIDENCE: it is not an effective retention grant, not a UI/expiry/purge input, and it never stores Free, unknown or a provisional answer.
-- Inactive: nothing in this migration grants EXECUTE on the resolver to any runtime role, registers a producer, writes a receipt, backfills, reads subscription_entitlements, or touches the meal-save path.
-- There is NO production call path (no worker, cron, webhook, client or trigger calls the resolver). With the ENT0 producer registry empty any call would only return pending/NO_REQUIRED_PRODUCER.
-- Contract (Owner-approved ENT1-A, 2026-10-16): (1) T0, owner and capture_context come from the retention_capture anchor, never from the caller; (2) Paid or trial evidence from the ENT0 resolver forms a receipt even
--   when coverage is incomplete (AP-2); free -> pending (provisional Free is never final); unknown (incl. lock timeouts, future instant, missing anchor/producer) -> pending; pending writes nothing;
--   (3) retained_until = T0 + 4320 elapsed hours; a replay returns the stored row without sampling again; (4) the caller's transaction must have NO assigned transaction id (it must not have written anything,
--   including an earlier resolve, a producer fact or a registry change): checked by the function itself (ACQ_DIRTY_TRANSACTION); (5) READ COMMITTED only.
-- Approved read seams (R-3), granted to the sealed acquisition owner only: SELECT policy + SELECT on the capture anchors with USAGE on retention_capture; USAGE on retention_entitlement with EXECUTE on entitlement_state_at.
-- A superuser (or an administrator who can disable triggers / session_replication_role=replica) can bypass every guard here; no claim is made against a deliberate administrator.
BEGIN;
-- Native authenticated superuser only: the approved seams are GRANTs/POLICY on objects owned by the capture and entitlement owners.
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
-- Acquisition guard G1 (same transaction, before any DDL): plain local apply only; predecessors present and exactly in their accepted ACL state; no platform marker or R0-B binding setting.
DO $acq_g1$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_markers text[];
 v_digest text;
BEGIN
 SELECT COALESCE(pg_catalog.array_agg(x.m ORDER BY x.m COLLATE "C"), ARRAY[]::text[]) INTO v_markers FROM (
  SELECT 'role:' || r.rolname AS m FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin')
  UNION ALL SELECT 'schema:supabase_migrations' WHERE pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
  UNION ALL SELECT 'setting:supautils' WHERE NULLIF(pg_catalog.current_setting('supautils.reserved_roles', true), '') IS NOT NULL
 ) x;
 IF pg_catalog.cardinality(v_markers) > 0 THEN
  RAISE EXCEPTION 'ACQ_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
 END IF;
 IF NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '') IS NOT NULL THEN
  RAISE EXCEPTION 'ACQ_BINDINGS_NOT_SUPPORTED' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('auth.users') IS NULL
   OR pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL
   OR pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') IS NULL
   OR pg_catalog.to_regclass('retention_entitlement.producers') IS NULL
   OR pg_catalog.to_regnamespace('retention_internal') IS NULL THEN
  RAISE EXCEPTION 'ACQ_PREDECESSORS_MISSING' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_acquisition_owner','consumer_retention_acquisition_builder'))
   OR pg_catalog.to_regnamespace('retention_acquisition') IS NOT NULL THEN
  RAISE EXCEPTION 'ACQ_ALREADY_PRESENT' USING ERRCODE='42710';
 END IF;
 -- The seam objects must still be exactly in their accepted state: owned by the sealed predecessor owners, no grant to anybody else, and the anchors carry exactly the accepted INSERT-only policy.
 IF (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) IS DISTINCT FROM 'consumer_retention_capture_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)')) IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_capture') IS DISTINCT FROM 'consumer_retention_capture_owner'
   OR (SELECT pg_catalog.pg_get_userbyid(n.nspowner) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_entitlement') IS DISTINCT FROM 'consumer_retention_entitlement_owner'
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
     WHERE n.nspname IN ('retention_capture','retention_entitlement') AND a.grantee <> n.nspowner)
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
     WHERE c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND a.grantee <> c.relowner)
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
     WHERE p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') AND a.grantee <> p.proowner)
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) <> 1
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND o.polname = 'capture_owner_insert' AND o.polcmd = 'a') THEN
  RAISE EXCEPTION 'ACQ_PREDECESSOR_DRIFT' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 PERFORM pg_catalog.set_config('tastkind.acq_digest_sql', $acq_digest$
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname NOT IN ('consumer_retention_acquisition_owner','consumer_retention_acquisition_builder')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor)
   FROM pg_catalog.pg_auth_members m WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles x WHERE x.oid IN (m.roleid, m.member, m.grantor) AND x.rolname IN ('consumer_retention_acquisition_owner','consumer_retention_acquisition_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, CASE WHEN n.nspname IN ('retention_capture','retention_entitlement') THEN NULL ELSE n.nspacl::text END) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_acquisition' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, CASE WHEN c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') THEN NULL ELSE c.relacl::text END, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_acquisition','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, CASE WHEN p.oid = pg_catalog.to_regprocedure('retention_entitlement.entitlement_state_at(uuid,timestamp with time zone)') THEN NULL ELSE p.proacl::text END, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_acquisition','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_acquisition' AND NOT (t.tgisinternal AND EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.oid = t.tgconstraint AND k.connamespace = pg_catalog.to_regnamespace('retention_acquisition')))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_acquisition','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_acquisition' AND NOT (c.oid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND o.polname = 'acquisition_owner_select')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid)
   FROM pg_catalog.pg_default_acl d WHERE d.defaclrole NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_acquisition_owner','consumer_retention_acquisition_builder'))),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid)
   FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid)
   FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid)
   FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
 $acq_digest$, true);
 EXECUTE pg_catalog.current_setting('tastkind.acq_digest_sql') INTO v_digest;
 PERFORM pg_catalog.set_config('tastkind.acq_scope_digest', v_digest, true);
 PERFORM pg_catalog.set_config('search_path', v_path, true);
 RAISE NOTICE 'ACQ_DDL_BOUNDARY';
END $acq_g1$;
-- Disposable builder owns no SQL objects. Its bootstrap ADMIN edge dies on DROP ROLE.
CREATE ROLE consumer_retention_acquisition_builder NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_acquisition_builder TO %I WITH INHERIT FALSE, SET TRUE',session_user);
END $$;
SET LOCAL ROLE consumer_retention_acquisition_builder;
CREATE ROLE consumer_retention_acquisition_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
DO $$ BEGIN
 EXECUTE pg_catalog.format('GRANT consumer_retention_acquisition_owner TO %I WITH INHERIT TRUE, SET TRUE',session_user);
END $$;
RESET ROLE;
CREATE SCHEMA retention_acquisition AUTHORIZATION consumer_retention_acquisition_owner;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_acquisition_owner IN SCHEMA retention_acquisition REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_acquisition_owner IN SCHEMA retention_acquisition REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE consumer_retention_acquisition_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- One immutable receipt per meal resource. No Free, no unknown, no permanent flag, no effective flag: the table cannot represent them.
-- The row is deleted only by the FK cascade from the T0 anchor (meal or account deletion); retention disposition is not decided here.
CREATE TABLE retention_acquisition.detail_acquisition_records (
 resource_id uuid PRIMARY KEY REFERENCES retention_capture.detail_capture_anchors(resource_id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL,
 original_recorded_at timestamptz NOT NULL,
 acquisition_ref text NOT NULL,
 acquisition_tier text NOT NULL CONSTRAINT receipt_tier_paid CHECK (acquisition_tier = 'paid'),
 acquisition_basis text NOT NULL CONSTRAINT receipt_basis_valid CHECK (acquisition_basis IN ('paid_subscription','trial')),
 evidence_event_ids uuid[] NOT NULL CONSTRAINT receipt_evidence_nonempty CHECK (pg_catalog.cardinality(evidence_event_ids) >= 1),
 entitlement_evidence jsonb NOT NULL,
 entitlement_sampled_at timestamptz NOT NULL,
 entitlement_policy text NOT NULL CONSTRAINT receipt_entitlement_policy CHECK (entitlement_policy = 'retention-entitlement-v1'),
 retention_policy_version text NOT NULL CONSTRAINT receipt_retention_policy CHECK (retention_policy_version = 'consumer-retention-owner-2026-10-03-v1'),
 capture_context text NOT NULL CONSTRAINT receipt_capture_context CHECK (capture_context = 'authenticated_actor'),
 retained_until timestamptz NOT NULL,
 resolved_at timestamptz NOT NULL,
 CONSTRAINT receipt_ref_exact CHECK (acquisition_ref = 'acq:' || resource_id::text),
 CONSTRAINT receipt_deadline_exact CHECK (retained_until = original_recorded_at + interval '4320 hours'),
 CONSTRAINT receipt_sampled_not_before_t0 CHECK (entitlement_sampled_at >= original_recorded_at),
 CONSTRAINT receipt_evidence_state CHECK (entitlement_evidence->>'state' = 'paid' AND entitlement_evidence->>'basis' = acquisition_basis AND entitlement_evidence->>'policy' = entitlement_policy),
 CONSTRAINT receipt_evidence_sampled CHECK (entitlement_evidence->>'sampled_at' = pg_catalog.to_char(entitlement_sampled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
 CONSTRAINT receipt_evidence_events CHECK (pg_catalog.jsonb_typeof(entitlement_evidence->'evidence'->'events') = 'array'
   AND pg_catalog.jsonb_array_length(entitlement_evidence->'evidence'->'events') = pg_catalog.cardinality(evidence_event_ids))
);

-- Reject precision loss before admission; timestamptz has no rounding typmod.
DO $$
DECLARE t text; c text;
BEGIN
 FOR t,c IN SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='retention_acquisition' AND data_type='timestamp with time zone'
 LOOP
  EXECUTE pg_catalog.format('ALTER TABLE retention_acquisition.%I ADD CONSTRAINT %I CHECK (%I IS NULL OR (pg_catalog.isfinite(%I) AND %I >= timestamptz ''0001-01-01 00:00:00+00'' AND %I < timestamptz ''10000-01-01 00:00:00+00'' AND pg_catalog.date_trunc(''milliseconds'', %I) = %I))',
    t, t || '_' || c || '_instant', c, c, c, c, c, c);
 END LOOP;
END $$;

-- Receipt integrity: the identity fields must equal the T0 anchor, and the stored fact ids must be exactly the fact ids of the stored resolver answer (same resolution).
CREATE FUNCTION retention_acquisition.validate_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_a record;
 v_ev uuid[];
BEGIN
 SELECT a.owner_user_id, a.original_recorded_at, a.capture_context INTO v_a
  FROM retention_capture.detail_capture_anchors a WHERE a.resource_id = NEW.resource_id;
 IF NOT FOUND OR v_a.owner_user_id IS DISTINCT FROM NEW.owner_user_id OR v_a.original_recorded_at IS DISTINCT FROM NEW.original_recorded_at
    OR v_a.capture_context IS DISTINCT FROM NEW.capture_context THEN
  RAISE EXCEPTION 'ACQ_RECEIPT_ANCHOR_MISMATCH' USING ERRCODE='23514';
 END IF;
 IF pg_catalog.jsonb_typeof(NEW.entitlement_evidence->'evidence'->'events') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_typeof(NEW.entitlement_evidence->'evidence'->'coverage') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'ACQ_RECEIPT_EVIDENCE_MISMATCH' USING ERRCODE='23514';
 END IF;
 v_ev := ARRAY(SELECT e::pg_catalog.uuid FROM pg_catalog.jsonb_array_elements_text(NEW.entitlement_evidence->'evidence'->'events') AS t(e) ORDER BY 1);
 IF NEW.evidence_event_ids IS DISTINCT FROM v_ev THEN
  RAISE EXCEPTION 'ACQ_RECEIPT_EVIDENCE_MISMATCH' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER receipt_validate BEFORE INSERT ON retention_acquisition.detail_acquisition_records
 FOR EACH ROW EXECUTE FUNCTION retention_acquisition.validate_receipt();
-- A receipt never changes: no shortening, no reset, no tier or basis change.
CREATE FUNCTION retention_acquisition.reject_receipt_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 RAISE EXCEPTION 'ACQ_RECEIPT_IMMUTABLE' USING ERRCODE='23514';
END $$;
CREATE TRIGGER receipt_immutable BEFORE UPDATE ON retention_acquisition.detail_acquisition_records
 FOR EACH ROW EXECUTE FUNCTION retention_acquisition.reject_receipt_update();

-- Resolver. Nothing below executes for any role unless EXECUTE is granted, and this migration grants EXECUTE to nobody.
-- Order: arguments -> READ COMMITTED -> clean transaction -> per-resource lock -> stored receipt (replay: no new sampling) -> anchor (T0/owner/context from the server) -> entitlement_state_at(owner, T0) ONCE.
-- Everything stored comes from that single answer. Any pending outcome returns before the INSERT and writes nothing.
CREATE FUNCTION retention_acquisition.resolve_detail_acquisition(p_resource_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_row retention_acquisition.detail_acquisition_records%ROWTYPE;
 v_anchor record;
 v_state jsonb;
 v_events uuid[];
 v_outcome text := 'replayed';
BEGIN
 IF p_resource_id IS NULL THEN
  RAISE EXCEPTION 'ACQ_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'ACQ_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 IF pg_catalog.pg_current_xact_id_if_assigned() IS NOT NULL THEN
  RAISE EXCEPTION 'ACQ_DIRTY_TRANSACTION' USING ERRCODE='25000';
 END IF;
 BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_resource_id::text || ':retention_acquisition', 0));
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'ACQ_LOCK_TIMEOUT', 'resource_id', p_resource_id, 'receipt', NULL);
 END;
 SELECT r.* INTO v_row FROM retention_acquisition.detail_acquisition_records r WHERE r.resource_id = p_resource_id;
 IF NOT FOUND THEN
  SELECT a.owner_user_id, a.original_recorded_at, a.capture_context INTO v_anchor
   FROM retention_capture.detail_capture_anchors a WHERE a.resource_id = p_resource_id;
  IF NOT FOUND THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'NO_ANCHOR', 'resource_id', p_resource_id, 'receipt', NULL);
  END IF;
  IF v_anchor.capture_context <> 'authenticated_actor' THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'CAPTURE_CONTEXT_UNTRUSTED', 'resource_id', p_resource_id, 'receipt', NULL);
  END IF;
  v_state := retention_entitlement.entitlement_state_at(v_anchor.owner_user_id, v_anchor.original_recorded_at);
  IF v_state->>'state' = 'free' THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', 'FREE_PROVISIONAL_NOT_FINAL', 'resource_id', p_resource_id, 'receipt', NULL);
  ELSIF v_state->>'state' = 'unknown' THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'pending', 'reason', COALESCE(v_state->>'reason', 'ACQ_UNKNOWN'), 'resource_id', p_resource_id, 'receipt', NULL);
  ELSIF v_state->>'state' IS DISTINCT FROM 'paid' OR v_state->>'basis' NOT IN ('paid_subscription','trial')
        OR pg_catalog.jsonb_typeof(v_state->'evidence'->'events') IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(v_state->'evidence'->'events') < 1 THEN
   RAISE EXCEPTION 'ACQ_UNEXPECTED_RESOLVER_ANSWER' USING ERRCODE='XX000';
  END IF;
  v_events := ARRAY(SELECT e::pg_catalog.uuid FROM pg_catalog.jsonb_array_elements_text(v_state->'evidence'->'events') AS t(e) ORDER BY 1);
  INSERT INTO retention_acquisition.detail_acquisition_records
   (resource_id, owner_user_id, original_recorded_at, acquisition_ref, acquisition_tier, acquisition_basis, evidence_event_ids, entitlement_evidence,
    entitlement_sampled_at, entitlement_policy, retention_policy_version, capture_context, retained_until, resolved_at)
  VALUES
   (p_resource_id, v_anchor.owner_user_id, v_anchor.original_recorded_at, 'acq:' || p_resource_id::text, 'paid', v_state->>'basis', v_events, v_state,
    (v_state->>'sampled_at')::pg_catalog.timestamptz, v_state->>'policy', 'consumer-retention-owner-2026-10-03-v1', v_anchor.capture_context,
    v_anchor.original_recorded_at + interval '4320 hours', pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()))
  RETURNING * INTO v_row;
  v_outcome := 'recorded';
 END IF;
 RETURN pg_catalog.jsonb_build_object('outcome', v_outcome, 'reason', NULL, 'resource_id', v_row.resource_id, 'receipt', pg_catalog.jsonb_build_object(
  'owner_user_id', v_row.owner_user_id,
  'original_recorded_at', pg_catalog.to_char(v_row.original_recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'acquisition_ref', v_row.acquisition_ref, 'tier', v_row.acquisition_tier, 'basis', v_row.acquisition_basis,
  'evidence_event_ids', pg_catalog.to_jsonb(v_row.evidence_event_ids),
  'entitlement_sampled_at', pg_catalog.to_char(v_row.entitlement_sampled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'retained_until', pg_catalog.to_char(v_row.retained_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'resolved_at', pg_catalog.to_char(v_row.resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
END $$;

ALTER FUNCTION retention_acquisition.validate_receipt() OWNER TO consumer_retention_acquisition_owner;
ALTER FUNCTION retention_acquisition.reject_receipt_update() OWNER TO consumer_retention_acquisition_owner;
ALTER FUNCTION retention_acquisition.resolve_detail_acquisition(uuid) OWNER TO consumer_retention_acquisition_owner;
ALTER TABLE retention_acquisition.detail_acquisition_records OWNER TO consumer_retention_acquisition_owner;
ALTER TABLE retention_acquisition.detail_acquisition_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_acquisition.detail_acquisition_records FORCE ROW LEVEL SECURITY;
CREATE POLICY acq_owner_select ON retention_acquisition.detail_acquisition_records AS PERMISSIVE FOR SELECT TO consumer_retention_acquisition_owner USING (true);
CREATE POLICY acq_owner_insert ON retention_acquisition.detail_acquisition_records AS PERMISSIVE FOR INSERT TO consumer_retention_acquisition_owner WITH CHECK (true);

-- Approved read seams (R-3): exactly these five statements, granted to the sealed acquisition owner only. No EXECUTE for any runtime role, no membership, no SET/ADMIN path, no BYPASSRLS.
CREATE POLICY acquisition_owner_select ON retention_capture.detail_capture_anchors AS PERMISSIVE FOR SELECT TO consumer_retention_acquisition_owner USING (true);
GRANT USAGE ON SCHEMA retention_capture TO consumer_retention_acquisition_owner;
GRANT SELECT ON retention_capture.detail_capture_anchors TO consumer_retention_acquisition_owner;
GRANT USAGE ON SCHEMA retention_entitlement TO consumer_retention_acquisition_owner;
GRANT EXECUTE ON FUNCTION retention_entitlement.entitlement_state_at(uuid, timestamptz) TO consumer_retention_acquisition_owner;

-- Revoke even grants inherited from the migration operator's existing defaults.
REVOKE ALL ON SCHEMA retention_acquisition FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retention_acquisition FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_acquisition FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_acquisition FROM PUBLIC;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname <> 'consumer_retention_acquisition_owner'
 LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON SCHEMA retention_acquisition FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL TABLES IN SCHEMA retention_acquisition FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA retention_acquisition FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA retention_acquisition FROM %I',r.rolname);
 END LOOP;
END $$;
SET LOCAL ROLE consumer_retention_acquisition_builder;
DO $$ BEGIN
 EXECUTE pg_catalog.format('REVOKE consumer_retention_acquisition_owner FROM %I',session_user);
END $$;
RESET ROLE;
DROP ROLE consumer_retention_acquisition_builder;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r
   ON r.oid IN (m.roleid,m.member,m.grantor) WHERE r.rolname = 'consumer_retention_acquisition_owner') THEN
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
-- Acquisition guard G2: the scope outside the new objects is unchanged except the five approved seam attributes (whose exact values are asserted here), then the exact post-state.
DO $acq_g2$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_post text;
 v_acq text := 'consumer_retention_acquisition_owner';
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 EXECUTE pg_catalog.current_setting('tastkind.acq_digest_sql') INTO v_scope;
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.acq_scope_digest') THEN
  RAISE EXCEPTION 'ACQ_POST_GUARD_DRIFT' USING ERRCODE='42501';
 END IF;
 -- seam values: each seam object has, besides its own owner, exactly one grantee (the acquisition owner) with exactly one non-grantable privilege.
 IF (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.nspname::text, pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY n.nspname::text COLLATE "C")
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
   OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors')) <> 2
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND o.polname = 'capture_owner_insert' AND o.polcmd = 'a')
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_capture.detail_capture_anchors') AND o.polname = 'acquisition_owner_select'
       AND o.polcmd = 'r' AND o.polpermissive AND o.polroles = ARRAY[(SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = v_acq)]::pg_catalog.oid[]
       AND pg_catalog.pg_get_expr(o.polqual, o.polrelid) = 'true' AND o.polwithcheck IS NULL) THEN
  RAISE EXCEPTION 'ACQ_SEAM_STATE_MISMATCH' USING ERRCODE='42501';
 END IF;
 v_post := (
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(n.nspowner)::text, n.nspacl::text) FROM pg_catalog.pg_namespace n WHERE n.nspname = 'retention_acquisition'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, c.relkind, pg_catalog.pg_get_userbyid(c.relowner)::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity, c.reloptions::text) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_acquisition')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, a.attname::text, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attgenerated, a.attidentity, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) ORDER BY c.relname::text COLLATE "C", a.attnum)
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_acquisition') AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.conname::text, o.contype, pg_catalog.pg_get_constraintdef(o.oid)) ORDER BY c.relname::text COLLATE "C", o.conname::text COLLATE "C")
   FROM pg_catalog.pg_constraint o JOIN pg_catalog.pg_class c ON c.oid = o.conrelid WHERE o.connamespace = pg_catalog.to_regnamespace('retention_acquisition')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, pg_catalog.pg_get_indexdef(i.indexrelid)) ORDER BY c.relname::text COLLATE "C")
   FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_acquisition')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, t.tgname::text, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid)) ORDER BY c.relname::text COLLATE "C", t.tgname::text COLLATE "C")
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal AND c.relnamespace = pg_catalog.to_regnamespace('retention_acquisition')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, pg_catalog.pg_get_function_identity_arguments(p.oid), pg_catalog.pg_get_userbyid(p.proowner)::text, p.proacl::text, p.proconfig::text, p.prosecdef,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8')), 'hex')) ORDER BY p.proname::text COLLATE "C")
   FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_acquisition')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname::text, o.polname::text, o.polcmd, o.polpermissive,
     ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text,
     COALESCE(pg_catalog.pg_get_expr(o.polqual, o.polrelid), ''), COALESCE(pg_catalog.pg_get_expr(o.polwithcheck, o.polrelid), '')) ORDER BY c.relname::text COLLATE "C", o.polname::text COLLATE "C")
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_acquisition')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(COALESCE(n.nspname::text, ''), d.defaclobjtype, d.defaclacl::text) ORDER BY COALESCE(n.nspname::text, '') COLLATE "C", d.defaclobjtype)
   FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace JOIN pg_catalog.pg_roles r ON r.oid = d.defaclrole WHERE r.rolname = 'consumer_retention_acquisition_owner'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil IS NULL) ORDER BY r.rolname::text COLLATE "C")
   FROM pg_catalog.pg_roles r WHERE r.rolname IN ('consumer_retention_acquisition_owner','consumer_retention_acquisition_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid IN (m.roleid, m.member, m.grantor) WHERE r.rolname IN ('consumer_retention_acquisition_owner','consumer_retention_acquisition_builder')),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid = c.relowner
   WHERE r.rolname = 'consumer_retention_acquisition_owner' AND n.nspname <> 'retention_acquisition' AND n.nspname !~ '^pg_toast'),
 (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner WHERE r.rolname = 'consumer_retention_acquisition_owner' AND p.pronamespace <> pg_catalog.to_regnamespace('retention_acquisition'))
)::text, 'UTF8')), 'hex')
 );
 IF v_post IS DISTINCT FROM 'a99805e1907d59f08b10d3aba7d2da0a9d78114631c0c6fd1556398f720e1d8c' THEN
  RAISE EXCEPTION 'ACQ_POST_STATE_MISMATCH expected=a99805e1907d59f08b10d3aba7d2da0a9d78114631c0c6fd1556398f720e1d8c observed=%', v_post USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $acq_g2$;
COMMIT;
