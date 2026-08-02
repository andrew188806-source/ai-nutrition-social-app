BEGIN;

-- MI-E-C5-R7-B2-R1: let an AI-candidate finalization carry validated restaurant/branch identity.
--
-- meal_identification_finalizations_selection_check was written in 20260724020000 and last
-- rewritten in 20260727010000, both before the photo-analysis flow could assert a venue. Its
-- ai_candidate arm therefore requires restaurant_id IS NULL AND branch_id IS NULL, which encodes
-- an assumption that no longer holds: that restaurant identity only ever arrives as part of a full
-- catalog menu-item selection.
--
-- 20260803010000 made the v3 branch write those two ledger columns from the same validated locals
-- as the meal item. Development acceptance then proved the consequence: the legacy 8-key command
-- still succeeded, but every valid 10-key command failed at the ledger INSERT with SQLSTATE 23514
-- and rolled the whole transaction back — no partial durable write, but no restaurant context
-- either. This migration is the minimum change that unblocks it.
--
-- ONLY the ai_candidate arm changes. Its restaurant/branch rule becomes:
--
--     (branch_id IS NULL OR restaurant_id IS NOT NULL)
--
-- so NULL/NULL, R/NULL and R/B are all accepted while NULL/B — a branch with no restaurant, the
-- same orphan the Mobile builder and the RPC already reject — stays forbidden. Every menu identity
-- column remains NOT-NULL-forbidden for this arm: an AI candidate may assert a VENUE, never a menu
-- item, so it can never masquerade as a catalog_item selection.
--
-- The catalog_item and personal_unresolved arms are reproduced verbatim from 20260727010000. They
-- are deliberately NOT rewritten into some looser shared condition: each arm keeps its own exact
-- requirements, including identity_validation_status, unresolved_reason and confirmation_mode.
--
-- Scope: one constraint, replaced under its own name. No data is read, written or backfilled; no
-- function, column, index, RLS policy, grant or Edge Function is touched. The constraint is added
-- WITHOUT the NOT VALID escape, so PostgreSQL validates every existing row as this migration
-- applies: pre-existing ai_candidate rows are all NULL/NULL and satisfy the relaxed arm, and the
-- other two arms are unchanged, so no backfill is required and none is performed.

ALTER TABLE public.meal_identification_finalizations
  DROP CONSTRAINT meal_identification_finalizations_selection_check,
  ADD CONSTRAINT meal_identification_finalizations_selection_check
  CHECK (
    (
      selection_kind = 'catalog_item'
      AND unresolved_reason IS NULL
      AND identity_validation_status = 'server_validated'
      AND restaurant_id IS NOT NULL
      AND branch_id IS NOT NULL
      AND menu_id IS NOT NULL
      AND menu_category_id IS NOT NULL
      AND menu_item_id IS NOT NULL
      AND branch_menu_item_id IS NOT NULL
      AND confirmation_mode IS NULL
    )
    OR (
      selection_kind = 'personal_unresolved'
      AND unresolved_reason IN ('manual', 'self_cooked', 'none_of_the_above', 'catalog_unavailable')
      AND identity_validation_status = 'not_applicable'
      AND restaurant_id IS NULL
      AND branch_id IS NULL
      AND menu_id IS NULL
      AND menu_category_id IS NULL
      AND menu_item_id IS NULL
      AND branch_menu_item_id IS NULL
      AND confirmation_mode IS NULL
    )
    OR (
      -- MI-E-C5-B1: real-AI candidate confirmation/correction/manual-fallback.
      -- unresolved_reason is the OLDER "personal_unresolved" reason vocabulary
      -- (manual/self_cooked/none_of_the_above/catalog_unavailable) and is
      -- deliberately left NULL here — confirmation_mode is this branch's own,
      -- separate discriminant, so the two vocabularies are never conflated.
      --
      -- MI-E-C5-R7-B2-R1: restaurant_id/branch_id are now OPTIONAL here. The pair rule below is
      -- the only relaxation; menu identity stays forbidden, so an AI candidate can assert where
      -- the meal was eaten but never which catalog menu item it was.
      selection_kind = 'ai_candidate'
      AND unresolved_reason IS NULL
      AND identity_validation_status = 'not_applicable'
      AND (branch_id IS NULL OR restaurant_id IS NOT NULL)
      AND menu_id IS NULL
      AND menu_category_id IS NULL
      AND menu_item_id IS NULL
      AND branch_menu_item_id IS NULL
      AND confirmation_mode IN ('accepted', 'corrected', 'manual')
    )
  );

COMMENT ON CONSTRAINT meal_identification_finalizations_selection_check
  ON public.meal_identification_finalizations IS
  'Selection-shape authority. catalog_item requires the full server-validated catalog identity; personal_unresolved forbids all identity; ai_candidate forbids menu identity but may carry an optional server-validated restaurant, and a branch only alongside its restaurant.';

COMMIT;
