-- MI-E-C1: additive label-quality/verification state on the existing meal_corrections table.
-- Forward-only. Does not create a new table, does not touch any existing column, and does not
-- add a permanent training_eligible boolean (see MI-E-C1 report §3.3). A user correction is never
-- auto-equated with a nutritionist-verified label, and an AI observation is never written here as
-- a verified result — this column only ever describes the correction row itself.
--
-- MI-E-C1-R1: the first draft of this migration defaulted this column to 'user_corrected', on the
-- reasoning that every row in this table only exists because a user corrected something. That
-- reasoning was not actually checked against real write semantics — meal_corrections currently
-- has zero real writers anywhere in this repository (confirmed: no application code writes to
-- this table yet), so there is no real data or call site to verify that assumption against. Given
-- that genuine uncertainty, defaulting to 'unreviewed' is the honest choice: it asserts nothing
-- about quality that hasn't actually been evaluated, and does not presume every future writer will
-- only ever insert deliberate, confirmed user corrections. A future writer must set a more
-- specific status explicitly once real write semantics exist to justify it.
--
-- A DB check constraint (not just an application-layer convention) restricts this column to a
-- fixed, legal set of values, since it may become a real input to future dataset-eligibility
-- decisions and should not silently accept an arbitrary string.

alter table meal_corrections
  add column verification_status text not null default 'unreviewed';

alter table meal_corrections
  add constraint meal_corrections_verification_status_valid check (
    verification_status in ('unreviewed', 'user_confirmed', 'user_corrected', 'nutritionist_reviewed', 'rejected')
  );

comment on column meal_corrections.verification_status is
  'Label-quality state of this correction: unreviewed | user_confirmed | user_corrected | nutritionist_reviewed | rejected. Restricted by meal_corrections_verification_status_valid. A user correction is never auto-promoted to nutritionist_reviewed, and this column never implies training eligibility on its own — see MI-E-C1 report §3.2/§3.3.';
