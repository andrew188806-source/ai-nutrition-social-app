-- TastKind ENT-W1 (retention line): the acquisition sweep, the outermost exact successor on the accepted PH1 main (its pins live in the ENT-W1 successor record).
-- Drives the accepted ENT1-A resolver retention_acquisition.resolve_detail_acquisition(uuid) from outside: a member-less NOLOGIN worker role may EXECUTE the resolver and three sweep functions, nothing else.
-- Contract kept: T0, owner and capture context come from the immutable capture anchor; eligibility is decided ONLY by the resolver (and through it ENT0); no time cutoff; pending / unknown write nothing and are never Free;
-- an existing receipt is never re-resolved (it is immutable and the resolver only replays it). No grant, display, expiry or purge. No LOGIN role, no membership, no Hosted actor is created here.
-- Sweep state (one row): a cursor over anchor resource ids that advances ONLY to an id that was processed (resolved, pending, or skipped after bounded attempts) and ONLY contiguously: it can never pass an anchor
-- without a receipt that nobody processed. The cursor wraps (a new cycle) only when no anchor without a receipt remains after it. COMMITTED starts are counted per (cycle, resource) in resolution_attempts, so
-- the bound survives a switch of the in-flight id (a late-visible lower anchor, concurrent workers): a resource that fails or kills the worker on every attempt gets at most 3 committed starts in one cycle, is
-- then skipped for that cycle (no receipt, no decision) and is attempted again in the next cycle. A start row lives only while its resource lies after the cursor in the current cycle: it is deleted when the
-- cursor passes the resource and every row is deleted at a wrap, so the table never holds history.
-- ENT-W1-A01 (first independent acceptance): the rejected candidate kept ONE in-flight counter that restarted at 1 whenever another id was begun, so a late lower anchor reset a failing id's committed starts.
-- Native authenticated superuser only (the new objects are owned by the sealed acquisition owner, as in ENT1-A). A superuser can bypass every guard here; no claim is made against a deliberate administrator.
BEGIN;
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
-- Sweep guard G1 (same transaction, before any DDL): plain local apply only; ENT1-A present and exactly in its accepted post-state; nothing of this package present yet.
DO $acqw_g1$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_markers text[];
 v_acq_post text;
 v_scope text;
BEGIN
 SELECT COALESCE(pg_catalog.array_agg(x.m ORDER BY x.m COLLATE "C"), ARRAY[]::text[]) INTO v_markers FROM (
  SELECT 'role:' || r.rolname AS m FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin')
  UNION ALL SELECT 'schema:supabase_migrations' WHERE pg_catalog.to_regnamespace('supabase_migrations') IS NOT NULL
  UNION ALL SELECT 'setting:supautils' WHERE NULLIF(pg_catalog.current_setting('supautils.reserved_roles', true), '') IS NOT NULL
 ) x;
 IF pg_catalog.cardinality(v_markers) > 0 THEN
  RAISE EXCEPTION 'ACQW_PLATFORM_APPLY_NOT_AUTHORIZED %', pg_catalog.array_to_string(v_markers, ',') USING ERRCODE='42501';
 END IF;
 IF NULLIF(pg_catalog.current_setting('tastkind.r0b_target', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_manifest', true), '') IS NOT NULL
   OR NULLIF(pg_catalog.current_setting('tastkind.r0b_fixture_nonce', true), '') IS NOT NULL THEN
  RAISE EXCEPTION 'ACQW_BINDINGS_NOT_SUPPORTED' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('retention_capture.detail_capture_anchors') IS NULL
   OR pg_catalog.to_regclass('retention_acquisition.detail_acquisition_records') IS NULL
   OR pg_catalog.to_regprocedure('retention_acquisition.resolve_detail_acquisition(uuid)') IS NULL
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = 'consumer_retention_acquisition_owner') THEN
  RAISE EXCEPTION 'ACQW_PREDECESSORS_MISSING' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = 'consumer_retention_acquisition_worker')
   OR pg_catalog.to_regclass('retention_acquisition.resolution_sweep_state') IS NOT NULL
   OR pg_catalog.to_regclass('retention_acquisition.resolution_attempts') IS NOT NULL
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_acquisition')
     AND p.proname IN ('claim_resolution_page','begin_resolution_item','advance_resolution_cursor','first_unresolved_in')) THEN
  RAISE EXCEPTION 'ACQW_ALREADY_PRESENT' USING ERRCODE='42710';
 END IF;
 PERFORM pg_catalog.set_config('search_path', '', true);
 -- ENT1-A exact post-state (the same digest its own migration asserts at the end of its install, a99805e1…): nothing in retention_acquisition, no membership and no ownership leak may have changed since.
 v_acq_post := (
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
 IF v_acq_post IS DISTINCT FROM 'a99805e1907d59f08b10d3aba7d2da0a9d78114631c0c6fd1556398f720e1d8c' THEN
  RAISE EXCEPTION 'ACQW_PREDECESSOR_DRIFT observed=%', v_acq_post USING ERRCODE='42501';
 END IF;
 -- Scope digest of everything this package must NOT touch (recomputed after the DDL and compared): every role but the new worker, every membership, every namespace but retention_acquisition, every relation,
 -- function, trigger, policy, rule and default ACL outside retention_acquisition, event triggers, extensions, publications and the database ACL.
 PERFORM pg_catalog.set_config('tastkind.acqw_scope_sql', $acqw_scope$
SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(r.oid::text, r.rolname::text, r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil::text) ORDER BY r.oid)
   FROM pg_catalog.pg_roles r WHERE r.rolname <> 'consumer_retention_acquisition_worker'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(m.roleid::text, m.member::text, m.grantor::text, m.admin_option, m.inherit_option, m.set_option) ORDER BY m.roleid, m.member, m.grantor) FROM pg_catalog.pg_auth_members m),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(n.oid::text, n.nspname::text, n.nspowner::text, n.nspacl::text) ORDER BY n.oid)
   FROM pg_catalog.pg_namespace n WHERE n.nspname <> 'retention_acquisition' AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.oid::text, c.relnamespace::text, c.relname::text, c.relkind, c.relowner::text, c.relacl::text, c.relrowsecurity, c.relforcerowsecurity) ORDER BY c.oid)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_acquisition','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.oid::text, p.pronamespace::text, p.proname::text, p.proowner::text, p.proacl::text, p.proconfig::text, p.prosecdef, p.prokind,
     pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(p.prosrc, '') || '|' || COALESCE(p.probin, '') || '|' || p.proargtypes::text || '|' || p.prorettype::text, 'UTF8')), 'hex')) ORDER BY p.oid)
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('retention_acquisition','pg_catalog','information_schema') AND n.nspname !~ '^pg_(toast|temp_|toast_temp_)'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(t.oid::text, t.tgrelid::text, t.tgname::text, t.tgfoid::text, t.tgenabled, t.tgtype) ORDER BY t.oid)
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_acquisition'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(w.oid::text, w.ev_class::text, w.rulename::text, w.ev_enabled, pg_catalog.md5(w.ev_action::text)) ORDER BY w.oid)
   FROM pg_catalog.pg_rewrite w JOIN pg_catalog.pg_class c ON c.oid = w.ev_class JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('retention_acquisition','pg_catalog','information_schema')),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.oid::text, o.polrelid::text, o.polname::text, o.polcmd, o.polpermissive, o.polroles::text, pg_catalog.md5(COALESCE(o.polqual::text, '') || '|' || COALESCE(o.polwithcheck::text, ''))) ORDER BY o.oid)
   FROM pg_catalog.pg_policy o JOIN pg_catalog.pg_class c ON c.oid = o.polrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'retention_acquisition'),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(d.oid::text, d.defaclrole::text, d.defaclnamespace::text, d.defaclobjtype, d.defaclacl::text) ORDER BY d.oid) FROM pg_catalog.pg_default_acl d),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(e.oid::text, e.evtname::text, e.evtevent::text, e.evtowner::text, e.evtfoid::text, e.evtenabled, e.evttags::text) ORDER BY e.oid) FROM pg_catalog.pg_event_trigger e),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(x.oid::text, x.extname::text, x.extversion, x.extnamespace::text, x.extowner::text) ORDER BY x.oid) FROM pg_catalog.pg_extension x),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(b.oid::text, b.pubname::text, b.pubowner::text, b.puballtables, b.pubinsert, b.pubupdate, b.pubdelete, b.pubtruncate) ORDER BY b.oid) FROM pg_catalog.pg_publication b),
 (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pr.prpubid::text, pr.prrelid::text) ORDER BY pr.prpubid, pr.prrelid) FROM pg_catalog.pg_publication_rel pr),
 (SELECT pg_catalog.jsonb_build_array(d.oid::text, d.datdba::text, d.datacl::text) FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
)::text, 'UTF8')), 'hex')
 $acqw_scope$, true);
 EXECUTE pg_catalog.current_setting('tastkind.acqw_scope_sql') INTO v_scope;
 PERFORM pg_catalog.set_config('tastkind.acqw_scope_digest', v_scope, true);
 PERFORM pg_catalog.set_config('search_path', v_path, true);
 RAISE NOTICE 'ACQW_DDL_BOUNDARY';
END $acqw_g1$;

CREATE ROLE consumer_retention_acquisition_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- One row. cycle counts completed passes; cursor_after is the last anchor id processed in this cycle (NULL = start of a cycle). inflight_* mirrors the most recent start (its resource and that resource's
-- committed starts in this cycle); the bound itself is kept per resource in resolution_attempts.
CREATE TABLE retention_acquisition.resolution_sweep_state (
 singleton boolean PRIMARY KEY CONSTRAINT sweep_singleton CHECK (singleton),
 cycle bigint NOT NULL CONSTRAINT sweep_cycle_nonnegative CHECK (cycle >= 0),
 cursor_after uuid NULL,
 inflight_resource uuid NULL,
 inflight_cycle bigint NULL,
 inflight_attempts integer NOT NULL CONSTRAINT sweep_attempts_range CHECK (inflight_attempts >= 0),
 skipped_total bigint NOT NULL CONSTRAINT sweep_skipped_nonnegative CHECK (skipped_total >= 0),
 cycle_started_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 CONSTRAINT sweep_inflight_shape CHECK ((inflight_resource IS NULL) = (inflight_cycle IS NULL) AND (inflight_resource IS NULL) = (inflight_attempts = 0))
);
INSERT INTO retention_acquisition.resolution_sweep_state
 (singleton, cycle, cursor_after, inflight_resource, inflight_cycle, inflight_attempts, skipped_total, cycle_started_at, updated_at)
VALUES (true, 0, NULL, NULL, NULL, 0, 0, pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()), pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()));

-- Committed starts of the CURRENT cycle, one row per begun resource that still lies after the cursor (written only by begin_resolution_item, deleted by every cursor move past it and by the wrap). No FK to the
-- anchors (an FK would add internal triggers on retention_capture); a row of a deleted anchor is removed by the next cursor move past it or by the wrap.
CREATE TABLE retention_acquisition.resolution_attempts (
 cycle bigint NOT NULL CONSTRAINT attempts_cycle_nonnegative CHECK (cycle >= 0),
 resource_id uuid NOT NULL,
 starts integer NOT NULL CONSTRAINT attempts_starts_range CHECK (starts BETWEEN 1 AND 3),
 CONSTRAINT resolution_attempts_pkey PRIMARY KEY (cycle, resource_id)
);

-- The smallest anchor id in (p_after, p_upto] that has no receipt (p_after NULL = from the start; p_upto NULL = no upper bound). The upper bound keeps every per-item check proportional to the claimed range, not to
-- the receipted anchors after it. Written as an ordered walk of the anchor key with one receipt-key probe per anchor: the single-statement anti-join form was planned as a merge join that read the receipt key from
-- its START (measured at 100k anchors: ~40 ms whatever the range), so the cost followed the cursor position instead of the range. Internal: EXECUTE for nobody but the owner.
CREATE FUNCTION retention_acquisition.first_unresolved_in(p_after uuid, p_upto uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 v_id uuid;
BEGIN
 FOR v_id IN SELECT a.resource_id FROM retention_capture.detail_capture_anchors a
   WHERE (p_after IS NULL OR a.resource_id > p_after) AND (p_upto IS NULL OR a.resource_id <= p_upto)
   ORDER BY a.resource_id
 LOOP
  IF NOT EXISTS (SELECT 1 FROM retention_acquisition.detail_acquisition_records r WHERE r.resource_id = v_id) THEN
   RETURN v_id;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;

-- READ-ONLY page of candidates after the cursor (no write, so a lost answer loses nothing). Every anchor without a receipt is a candidate; the resolver decides eligibility.
CREATE FUNCTION retention_acquisition.claim_resolution_page(p_limit integer, p_examine integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_cycle bigint;
 v_cursor uuid;
 v_ids uuid[];
 v_examined integer;
 v_last uuid;
 v_full boolean;
BEGIN
 IF p_limit IS NULL OR p_examine IS NULL OR p_limit < 1 OR p_limit > 100 OR p_examine < p_limit OR p_examine > 5000 THEN
  RAISE EXCEPTION 'ACQW_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
  RAISE EXCEPTION 'ACQW_ISOLATION_UNSUPPORTED' USING ERRCODE='0A000';
 END IF;
 SELECT s.cycle, s.cursor_after INTO v_cycle, v_cursor FROM retention_acquisition.resolution_sweep_state s WHERE s.singleton;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'ACQW_STATE_MISSING' USING ERRCODE='XX000';
 END IF;
 IF v_cursor IS NULL THEN
  WITH examined AS MATERIALIZED (
   SELECT a.resource_id FROM retention_capture.detail_capture_anchors a ORDER BY a.resource_id LIMIT p_examine
  ), cand AS (
   SELECT e.resource_id FROM examined e
    WHERE NOT EXISTS (SELECT 1 FROM retention_acquisition.detail_acquisition_records r WHERE r.resource_id = e.resource_id)
    ORDER BY e.resource_id LIMIT p_limit
  )
  SELECT (SELECT pg_catalog.count(*)::integer FROM examined), (SELECT e.resource_id FROM examined e ORDER BY e.resource_id DESC LIMIT 1), ARRAY(SELECT c.resource_id FROM cand c ORDER BY c.resource_id)
   INTO v_examined, v_last, v_ids;
 ELSE
  WITH examined AS MATERIALIZED (
   SELECT a.resource_id FROM retention_capture.detail_capture_anchors a WHERE a.resource_id > v_cursor ORDER BY a.resource_id LIMIT p_examine
  ), cand AS (
   SELECT e.resource_id FROM examined e
    WHERE NOT EXISTS (SELECT 1 FROM retention_acquisition.detail_acquisition_records r WHERE r.resource_id = e.resource_id)
    ORDER BY e.resource_id LIMIT p_limit
  )
  SELECT (SELECT pg_catalog.count(*)::integer FROM examined), (SELECT e.resource_id FROM examined e ORDER BY e.resource_id DESC LIMIT 1), ARRAY(SELECT c.resource_id FROM cand c ORDER BY c.resource_id)
   INTO v_examined, v_last, v_ids;
 END IF;
 v_full := pg_catalog.cardinality(v_ids) = p_limit;
 RETURN pg_catalog.jsonb_build_object('outcome', 'page', 'cycle', v_cycle, 'cursor_after', v_cursor, 'ids', pg_catalog.to_jsonb(v_ids), 'examined', v_examined,
  'at_end', v_examined < p_examine AND NOT v_full,
  'examined_through', CASE WHEN NOT v_full AND v_examined > 0 THEN v_last ELSE NULL END);
END $$;

-- Marks the start of processing p_resource. Only the NEXT anchor without a receipt after the cursor may be started (anything else is 'stale' or 'out_of_order'). Every committed start adds one to that
-- resource's row in resolution_attempts for this cycle, whichever ids were begun in between; when a 4th start would follow 3 committed ones, the id is skipped for this cycle instead (the cursor moves onto it,
-- its row is deleted; the next cycle attempts it again). All begins and moves serialize on the state row lock, so concurrent workers cannot both take the 3rd start.
CREATE FUNCTION retention_acquisition.begin_resolution_item(p_cycle bigint, p_resource uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_s retention_acquisition.resolution_sweep_state%ROWTYPE;
 v_next uuid;
 v_starts integer;
 v_attempt integer;
BEGIN
 IF p_cycle IS NULL OR p_resource IS NULL THEN
  RAISE EXCEPTION 'ACQW_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 BEGIN
  SELECT s.* INTO v_s FROM retention_acquisition.resolution_sweep_state s WHERE s.singleton FOR UPDATE;
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'busy');
 END;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'ACQW_STATE_MISSING' USING ERRCODE='XX000';
 END IF;
 IF v_s.cycle <> p_cycle OR (v_s.cursor_after IS NOT NULL AND p_resource <= v_s.cursor_after) THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'stale');
 END IF;
 v_next := retention_acquisition.first_unresolved_in(v_s.cursor_after, p_resource);
 IF v_next IS NULL THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'stale');
 ELSIF v_next < p_resource THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'out_of_order');
 END IF;
 SELECT a.starts INTO v_starts FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle AND a.resource_id = p_resource;
 v_attempt := COALESCE(v_starts, 0) + 1;
 IF v_attempt > 3 THEN
  UPDATE retention_acquisition.resolution_sweep_state
     SET cursor_after = p_resource, inflight_resource = NULL, inflight_cycle = NULL, inflight_attempts = 0, skipped_total = skipped_total + 1,
         updated_at = pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
   WHERE singleton;
  DELETE FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle AND a.resource_id <= p_resource;
  RETURN pg_catalog.jsonb_build_object('outcome', 'skipped_after_attempts', 'attempts', v_attempt - 1);
 END IF;
 IF v_starts IS NULL THEN
  INSERT INTO retention_acquisition.resolution_attempts (cycle, resource_id, starts) VALUES (p_cycle, p_resource, 1);
 ELSE
  UPDATE retention_acquisition.resolution_attempts a SET starts = v_attempt WHERE a.cycle = p_cycle AND a.resource_id = p_resource;
 END IF;
 UPDATE retention_acquisition.resolution_sweep_state
    SET inflight_resource = p_resource, inflight_cycle = p_cycle, inflight_attempts = v_attempt, updated_at = pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
  WHERE singleton;
 RETURN pg_catalog.jsonb_build_object('outcome', 'proceed', 'attempt', v_attempt);
END $$;

-- Moves the cursor. 'resolved': onto p_to, called in the SAME transaction right after the resolver call for p_to (so the receipt, if any, and the cursor commit together); p_to must be the id begun in this cycle and
-- no anchor without a receipt may lie strictly between the cursor and p_to. 'examined': onto p_to after a page whose remaining examined anchors all had receipts; refused when any anchor in (cursor, p_to] has none.
-- 'wrap': a new cycle; refused while any anchor after the cursor has no receipt. A cycle mismatch or a target at/behind the cursor is 'stale'. The state row lock is taken with a 2 s timeout ('busy').
CREATE FUNCTION retention_acquisition.advance_resolution_cursor(p_cycle bigint, p_to uuid, p_kind text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
 v_s retention_acquisition.resolution_sweep_state%ROWTYPE;
 v_next uuid;
BEGIN
 IF p_cycle IS NULL OR p_kind IS NULL OR p_kind NOT IN ('resolved','examined','wrap') OR ((p_kind = 'wrap') <> (p_to IS NULL)) THEN
  RAISE EXCEPTION 'ACQW_INVALID_ARGUMENT' USING ERRCODE='22023';
 END IF;
 BEGIN
  SELECT s.* INTO v_s FROM retention_acquisition.resolution_sweep_state s WHERE s.singleton FOR UPDATE;
 EXCEPTION WHEN lock_not_available THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'busy');
 END;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'ACQW_STATE_MISSING' USING ERRCODE='XX000';
 END IF;
 IF v_s.cycle <> p_cycle THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'stale');
 END IF;
 v_next := retention_acquisition.first_unresolved_in(v_s.cursor_after, p_to);
 IF p_kind = 'wrap' THEN
  IF v_next IS NOT NULL THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_REMAIN');
  END IF;
  UPDATE retention_acquisition.resolution_sweep_state
     SET cycle = cycle + 1, cursor_after = NULL, inflight_resource = NULL, inflight_cycle = NULL, inflight_attempts = 0,
         cycle_started_at = pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp()), updated_at = pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
   WHERE singleton;
  DELETE FROM retention_acquisition.resolution_attempts a WHERE a.cycle <= p_cycle;
  RETURN pg_catalog.jsonb_build_object('outcome', 'wrapped', 'cycle', p_cycle + 1);
 END IF;
 IF v_s.cursor_after IS NOT NULL AND p_to <= v_s.cursor_after THEN
  RETURN pg_catalog.jsonb_build_object('outcome', 'stale');
 END IF;
 IF p_kind = 'resolved' THEN
  -- only an id with a committed start (begin) in this cycle; nothing without a receipt may lie before it
  IF NOT EXISTS (SELECT 1 FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle AND a.resource_id = p_to) THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'NOT_BEGUN');
  END IF;
  IF v_next IS NOT NULL AND v_next < p_to THEN
   RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_BEFORE_TARGET');
  END IF;
 ELSIF v_next IS NOT NULL THEN
  -- 'examined': every anchor in (cursor, p_to], p_to included, must already have a receipt
  RETURN pg_catalog.jsonb_build_object('outcome', 'refused', 'reason', 'UNRESOLVED_IN_RANGE');
 END IF;
 UPDATE retention_acquisition.resolution_sweep_state
    SET cursor_after = p_to,
        inflight_resource = CASE WHEN inflight_resource IS NOT NULL AND inflight_resource <= p_to THEN NULL ELSE inflight_resource END,
        inflight_cycle = CASE WHEN inflight_resource IS NOT NULL AND inflight_resource <= p_to THEN NULL ELSE inflight_cycle END,
        inflight_attempts = CASE WHEN inflight_resource IS NOT NULL AND inflight_resource <= p_to THEN 0 ELSE inflight_attempts END,
        updated_at = pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
  WHERE singleton;
 -- the cursor passed these resources: they cannot be begun again in this cycle, their start rows end here
 DELETE FROM retention_acquisition.resolution_attempts a WHERE a.cycle = p_cycle AND a.resource_id <= p_to;
 RETURN pg_catalog.jsonb_build_object('outcome', 'advanced');
END $$;

ALTER TABLE retention_acquisition.resolution_sweep_state OWNER TO consumer_retention_acquisition_owner;
ALTER TABLE retention_acquisition.resolution_sweep_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_acquisition.resolution_sweep_state FORCE ROW LEVEL SECURITY;
CREATE POLICY sweep_owner_select ON retention_acquisition.resolution_sweep_state AS PERMISSIVE FOR SELECT TO consumer_retention_acquisition_owner USING (true);
CREATE POLICY sweep_owner_update ON retention_acquisition.resolution_sweep_state AS PERMISSIVE FOR UPDATE TO consumer_retention_acquisition_owner USING (true) WITH CHECK (true);
ALTER TABLE retention_acquisition.resolution_attempts OWNER TO consumer_retention_acquisition_owner;
ALTER TABLE retention_acquisition.resolution_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_acquisition.resolution_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY attempts_owner_select ON retention_acquisition.resolution_attempts AS PERMISSIVE FOR SELECT TO consumer_retention_acquisition_owner USING (true);
CREATE POLICY attempts_owner_insert ON retention_acquisition.resolution_attempts AS PERMISSIVE FOR INSERT TO consumer_retention_acquisition_owner WITH CHECK (true);
CREATE POLICY attempts_owner_update ON retention_acquisition.resolution_attempts AS PERMISSIVE FOR UPDATE TO consumer_retention_acquisition_owner USING (true) WITH CHECK (true);
CREATE POLICY attempts_owner_delete ON retention_acquisition.resolution_attempts AS PERMISSIVE FOR DELETE TO consumer_retention_acquisition_owner USING (true);
ALTER FUNCTION retention_acquisition.first_unresolved_in(uuid, uuid) OWNER TO consumer_retention_acquisition_owner;
ALTER FUNCTION retention_acquisition.claim_resolution_page(integer, integer) OWNER TO consumer_retention_acquisition_owner;
ALTER FUNCTION retention_acquisition.begin_resolution_item(bigint, uuid) OWNER TO consumer_retention_acquisition_owner;
ALTER FUNCTION retention_acquisition.advance_resolution_cursor(bigint, uuid, text) OWNER TO consumer_retention_acquisition_owner;
REVOKE ALL ON TABLE retention_acquisition.resolution_sweep_state FROM PUBLIC;
REVOKE ALL ON TABLE retention_acquisition.resolution_attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION retention_acquisition.first_unresolved_in(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION retention_acquisition.claim_resolution_page(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION retention_acquisition.begin_resolution_item(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION retention_acquisition.advance_resolution_cursor(bigint, uuid, text) FROM PUBLIC;

-- The worker seam: exactly USAGE on the schema and EXECUTE on four functions. No table, no other schema, no ENT0 function, no membership, no LOGIN.
GRANT USAGE ON SCHEMA retention_acquisition TO consumer_retention_acquisition_worker;
GRANT EXECUTE ON FUNCTION retention_acquisition.resolve_detail_acquisition(uuid) TO consumer_retention_acquisition_worker;
GRANT EXECUTE ON FUNCTION retention_acquisition.claim_resolution_page(integer, integer) TO consumer_retention_acquisition_worker;
GRANT EXECUTE ON FUNCTION retention_acquisition.begin_resolution_item(bigint, uuid) TO consumer_retention_acquisition_worker;
GRANT EXECUTE ON FUNCTION retention_acquisition.advance_resolution_cursor(bigint, uuid, text) TO consumer_retention_acquisition_worker;

-- Sweep guard G2: the scope outside retention_acquisition and the new role is unchanged; ENT1-A objects are unchanged except the two worker grants; the exact new state.
DO $acqw_g2$
DECLARE
 v_path text := pg_catalog.current_setting('search_path');
 v_scope text;
 v_worker oid;
 v_owner oid;
BEGIN
 PERFORM pg_catalog.set_config('search_path', '', true);
 EXECUTE pg_catalog.current_setting('tastkind.acqw_scope_sql') INTO v_scope;
 IF v_scope IS DISTINCT FROM pg_catalog.current_setting('tastkind.acqw_scope_digest') THEN
  RAISE EXCEPTION 'ACQW_SCOPE_DRIFT' USING ERRCODE='42501';
 END IF;
 SELECT r.oid INTO v_worker FROM pg_catalog.pg_roles r WHERE r.rolname = 'consumer_retention_acquisition_worker';
 SELECT r.oid INTO v_owner FROM pg_catalog.pg_roles r WHERE r.rolname = 'consumer_retention_acquisition_owner';
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.oid = v_worker AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole
     AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit = -1 AND r.rolvaliduntil IS NULL)
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE v_worker IN (m.roleid, m.member, m.grantor))
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE v_owner IN (m.roleid, m.member, m.grantor)) THEN
  RAISE EXCEPTION 'ACQW_WORKER_ROLE_MISMATCH' USING ERRCODE='42501';
 END IF;
 -- schema ACL: owner + worker USAGE, nothing else
 IF (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C", a.privilege_type COLLATE "C")
     FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a WHERE n.nspname = 'retention_acquisition' AND a.grantee <> n.nspowner)
    IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('consumer_retention_acquisition_worker', 'USAGE', false)) THEN
  RAISE EXCEPTION 'ACQW_SCHEMA_ACL_MISMATCH' USING ERRCODE='42501';
 END IF;
 -- function ACLs: the four worker functions = owner + worker EXECUTE; every other function in the schema = owner only
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_acquisition') AND p.proowner <> v_owner)
   OR EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_acquisition')
    AND (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(pg_catalog.pg_get_userbyid(a.grantee)::text, a.privilege_type, a.is_grantable) ORDER BY pg_catalog.pg_get_userbyid(a.grantee)::text COLLATE "C"), '[]'::pg_catalog.jsonb)
           FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a WHERE a.grantee <> p.proowner)
        IS DISTINCT FROM CASE WHEN p.oid IN (pg_catalog.to_regprocedure('retention_acquisition.resolve_detail_acquisition(uuid)'), pg_catalog.to_regprocedure('retention_acquisition.claim_resolution_page(integer,integer)'),
                                             pg_catalog.to_regprocedure('retention_acquisition.begin_resolution_item(bigint,uuid)'), pg_catalog.to_regprocedure('retention_acquisition.advance_resolution_cursor(bigint,uuid,text)'))
                              THEN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('consumer_retention_acquisition_worker', 'EXECUTE', false)) ELSE '[]'::pg_catalog.jsonb END) THEN
  RAISE EXCEPTION 'ACQW_FUNCTION_ACL_MISMATCH' USING ERRCODE='42501';
 END IF;
 -- every relation in the schema: owner only, RLS enabled and forced
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relnamespace = pg_catalog.to_regnamespace('retention_acquisition') AND c.relkind = 'r'
     AND (c.relowner <> v_owner OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
       OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) a WHERE a.grantee <> c.relowner))) THEN
  RAISE EXCEPTION 'ACQW_TABLE_ACL_MISMATCH' USING ERRCODE='42501';
 END IF;
 -- the four new SECURITY DEFINER / INVOKER shapes and their settings
 IF (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(p.proname::text, p.prosecdef, p.provolatile::text, pg_catalog.to_jsonb(p.proconfig)) ORDER BY p.proname::text COLLATE "C")
     FROM pg_catalog.pg_proc p WHERE p.pronamespace = pg_catalog.to_regnamespace('retention_acquisition')
      AND p.proname IN ('first_unresolved_in','claim_resolution_page','begin_resolution_item','advance_resolution_cursor'))
    IS DISTINCT FROM pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_array('advance_resolution_cursor', true, 'v', '["search_path=\"\"","lock_timeout=2s"]'::pg_catalog.jsonb),
      pg_catalog.jsonb_build_array('begin_resolution_item', true, 'v', '["search_path=\"\"","lock_timeout=2s"]'::pg_catalog.jsonb),
      pg_catalog.jsonb_build_array('claim_resolution_page', true, 'v', '["search_path=\"\"","lock_timeout=2s"]'::pg_catalog.jsonb),
      pg_catalog.jsonb_build_array('first_unresolved_in', false, 's', '["search_path=\"\""]'::pg_catalog.jsonb)) THEN
  RAISE EXCEPTION 'ACQW_FUNCTION_SHAPE_MISMATCH' USING ERRCODE='42501';
 END IF;
 -- state: exactly one row at its initial values; exactly two owner policies; no start row; exactly the four owner policies of the start table
 IF (SELECT pg_catalog.count(*) FROM retention_acquisition.resolution_sweep_state) <> 1
   OR (SELECT pg_catalog.count(*) FROM retention_acquisition.resolution_attempts) <> 0
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.polname::text, o.polcmd, ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text) ORDER BY o.polname::text COLLATE "C")
       FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_acquisition.resolution_attempts'))
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('attempts_owner_delete', 'd', '{consumer_retention_acquisition_owner}'), pg_catalog.jsonb_build_array('attempts_owner_insert', 'a', '{consumer_retention_acquisition_owner}'),
                                                   pg_catalog.jsonb_build_array('attempts_owner_select', 'r', '{consumer_retention_acquisition_owner}'), pg_catalog.jsonb_build_array('attempts_owner_update', 'w', '{consumer_retention_acquisition_owner}'))
   OR NOT EXISTS (SELECT 1 FROM retention_acquisition.resolution_sweep_state s WHERE s.singleton AND s.cycle = 0 AND s.cursor_after IS NULL AND s.inflight_resource IS NULL AND s.inflight_attempts = 0 AND s.skipped_total = 0)
   OR (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.polname::text, o.polcmd, ARRAY(SELECT r.rolname::text FROM pg_catalog.pg_roles r WHERE r.oid = ANY (o.polroles) ORDER BY 1)::text) ORDER BY o.polname::text COLLATE "C")
       FROM pg_catalog.pg_policy o WHERE o.polrelid = pg_catalog.to_regclass('retention_acquisition.resolution_sweep_state'))
      IS DISTINCT FROM pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_array('sweep_owner_select', 'r', '{consumer_retention_acquisition_owner}'), pg_catalog.jsonb_build_array('sweep_owner_update', 'w', '{consumer_retention_acquisition_owner}')) THEN
  RAISE EXCEPTION 'ACQW_STATE_MISMATCH' USING ERRCODE='42501';
 END IF;
 PERFORM pg_catalog.set_config('search_path', v_path, true);
END $acqw_g2$;
COMMIT;
