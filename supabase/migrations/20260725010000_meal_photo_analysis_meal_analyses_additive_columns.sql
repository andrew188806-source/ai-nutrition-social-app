-- MI-E-C1: additive columns on the existing meal_analyses table to support a real (non-mock)
-- meal-photo AI analysis pipeline. Forward-only. Does not create a new table, does not touch or
-- remove any existing column, does not add a permanent training_eligible boolean (see MI-E-C1
-- report §3.3), and does not store restaurant commercial-use permission (see MI-E-C1 report
-- §3.5 — that is a separate, future workstream). All new columns are nullable so every existing
-- row remains valid with no backfill required.
--
-- MI-E-C1-R1: an earlier draft of this migration also added an asset_lifecycle_stage column
-- (staging / diary_promoted / training_asset). That was wrong: diary storage and AI training use
-- are two independent purposes that can both be true of the same photo at the same time, not
-- mutually exclusive lifecycle stages, so collapsing them into one exclusive-state column would
-- have made an illegal state representable. That column has been removed entirely rather than
-- redesigned, since nothing in this round reads or writes it yet (no real consumer exists) —
-- redesigning a state machine nobody uses yet would only risk designing the wrong one early.
-- staging_expires_at (below) is kept: it describes only the Storage object's own staging expiry,
-- not a cross-purpose lifecycle/ownership state. Diary promotion will be expressed by a future
-- permanent diary-asset reference/table; training inclusion by a future dataset snapshot and
-- eligibility evaluation; a restaurant commercial grant by the future Restaurant Photo Licensing
-- Workstream — none of which this column would have correctly modeled anyway.

alter table meal_analyses
  add column provider text,
  add column prompt_version text,
  add column analysis_contract_version text,
  add column analysis_request_id uuid,
  add column image_object_ref text,
  add column image_sha256 text,
  add column staging_expires_at timestamptz,
  add column error_code text;

-- analysis_request_id is the client-supplied idempotency key for a real analysis call. A partial
-- unique index (rather than a plain unique constraint) is required so legacy rows, which predate
-- this column and are therefore NULL, remain valid — a plain unique constraint would otherwise
-- treat every NULL as violating uniqueness in some Postgres configurations' intent, and more
-- importantly a plain unique index without the WHERE clause would still work here (Postgres
-- treats NULLs as distinct in a unique index), but the WHERE clause makes the intent explicit and
-- keeps the index smaller by excluding the (currently 100% of) rows that have no request id.
create unique index meal_analyses_analysis_request_id_key
  on meal_analyses (analysis_request_id)
  where analysis_request_id is not null;

comment on column meal_analyses.provider is
  'Provider category (e.g. openai, tastkind-model, hybrid) — distinct from model_name/model_version, which already record the exact model.';
comment on column meal_analyses.prompt_version is
  'Version tag of the prompt/instructions used to produce this analysis.';
comment on column meal_analyses.analysis_contract_version is
  'Version tag of the request/response contract (see apps/mobile/features/meal-photo-analysis) this row was produced under.';
comment on column meal_analyses.analysis_request_id is
  'Client-generated idempotency key for the analysis request that produced this row.';
comment on column meal_analyses.image_object_ref is
  'Private Storage object path the analyzed image was read from. Never a public URL.';
comment on column meal_analyses.image_sha256 is
  'SHA-256 of the analyzed image, hex-encoded, for duplicate detection and future dataset deduplication/leakage prevention.';
comment on column meal_analyses.staging_expires_at is
  'When the source staging image object is eligible for expiry, per the staging asset retention policy. Does not imply this analysis row itself expires.';
comment on column meal_analyses.error_code is
  'Stable machine-readable failure code when analysis_status indicates a non-completed outcome. Distinct from analysis_status, which is the existing outcome field.';
