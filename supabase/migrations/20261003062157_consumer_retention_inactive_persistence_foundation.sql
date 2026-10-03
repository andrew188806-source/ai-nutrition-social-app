-- R0-B inactive storage only. No runtime producer, capture, backfill or effective grant.
BEGIN;
-- PG17 non-superuser CREATEROLE creates an irrevocable-by-creator ADMIN membership.
-- Require a trusted DDL administrator; never leave that membership or widen runtime rights.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = current_user AND rolsuper) THEN
  RAISE EXCEPTION 'RETENTION_SEALED_OWNER_REQUIRES_DDL_ADMIN' USING ERRCODE='42501';
 END IF;
END $$;
CREATE ROLE consumer_retention_foundation_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT consumer_retention_foundation_owner TO postgres WITH INHERIT TRUE, SET TRUE;
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
REVOKE consumer_retention_foundation_owner FROM postgres;
COMMIT;
