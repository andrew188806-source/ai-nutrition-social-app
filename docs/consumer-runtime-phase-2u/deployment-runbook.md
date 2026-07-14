# Consumer Runtime Phase 2U — Deployment Runbook

## Current Continuation Status

N1 and N2 are already deployed to Development, and the repository migration inventory is 23. This Codex continuation does not run a remote query, deploy a migration, or use live credentials. Its scope is the Mobile runtime composition repair plus local guard and contract-smoke validation.

After this local handoff, Claude remains responsible for authenticated Development live smoke and final credential-backed verification. N3 must remain absent, raw nutrition grants must remain unchanged, and Production must not be touched.

## Phase 2U-A: N1 + N2 + Mobile Implementation

### Pre-deployment

1. Confirm `git status --short` clean, HEAD = `4abd8e5f41759f3a0a15ede05e9be6382677447a`
2. Confirm migration count = 21
3. Run Gates A–D (all must return zero rows or expected results)
4. Run Phase 2U guard: `node scripts/consumer-public-restaurant-menu-phase-2u-guard.mjs` — must pass

### N1 Deployment

5. Confirm ONLY `20260715010000_extend_published_nutrition_provenance.sql` is in `supabase/migrations/` as a new (unapplied) migration
6. Dry-run: `npx supabase db push --linked --dry-run`
7. Review dry-run output — confirm only N1 is listed
8. Deploy: `npx supabase db push --linked`
9. Confirm output shows N1 applied successfully

### Post-N1 Validation

10. Run N1-V1: confirm 18 columns (16 original + 2 new at positions 17, 18)
11. Run N1-V2: confirm mapping correctness
12. Run N1-V3: confirm zero null-provenance rows
13. Run N1-V4: confirm owner = postgres
14. Run N1-V5: confirm anon + authenticated SELECT grants preserved
15. Guard still passes

### N2 Deployment

16. Write `20260715020000_consumer_public_next_meal_candidates_v1.sql` to `supabase/migrations/`
17. Dry-run: `npx supabase db push --linked --dry-run`
18. Review dry-run — confirm only N2 is listed
19. Deploy: `npx supabase db push --linked`
20. Confirm N2 applied successfully

### Post-N2 Validation

21. Run N2-V1 through N2-V7 (all must pass)
22. Run Phase 2U guard: must pass with migration count = 23
23. Run Phase 2U mock contract smoke: `node scripts/consumer-public-restaurant-menu-phase-2u-smoke.mjs --mock-contract`
24. Run Phase 2U live smoke (with opt-in): `TASTKIND_PHASE2U_LIVE_SMOKE=true node scripts/consumer-public-restaurant-menu-phase-2u-smoke.mjs --live`
25. Authenticated projection read: confirmed
26. Anon denial: confirmed
27. Zero null-provenance in projection: confirmed
28. Internal columns absent: confirmed

### Regression

29. `node scripts/consumer-meal-records-phase-2q-guard.mjs`
30. `node scripts/consumer-meal-records-phase-2r-guard.mjs`
31. `node scripts/consumer-ux-u1-guard.mjs`
32. `node scripts/consumer-public-restaurant-menu-phase-2s-guard.mjs`
33. `node scripts/consumer-public-restaurant-menu-phase-2u-guard.mjs`
34. `node scripts/consumer-meal-records-phase-2q-smoke.mjs --mock-contract`
35. `node scripts/consumer-meal-records-phase-2r-smoke.mjs --mock-contract`
36. `node scripts/consumer-ux-u1-smoke.mjs`
37. `node scripts/consumer-schema-phase-1-3-guard.mjs`
38. `node scripts/validate-consumer-schema.mjs`
39. `node scripts/audit-canonical-data.mjs`
40. `npx tsc --noEmit` (root)

### Stop

41. Do NOT commit or push
42. Await Phase 2U-A final commit approval

---

## Phase 2U-B: Deployment Audit (N3 Prerequisite Verification)

Audit all 13 N3 gate conditions. This is a read-only audit phase. No DB changes.

Gates to verify:
1. N1 deployed ✓ (from Phase 2U-A)
2. N2 deployed ✓ (from Phase 2U-A)
3. Mobile Supabase repository live in Development ✓
4. Authenticated Consumer recommendation smoke passed ✓
5. Anon Consumer projection denial smoke passed ✓
6. Consumer projection returns zero null-provenance rows ✓
7. Consumer projection exposes no internal columns ✓
8. Repository search: no direct client read of `menu_item_nutrition` — verify
9. Repository search: no direct client read of `current_published_menu_item_nutrition` — verify
10. Development deployment config audited — verify
11. Restaurant Web deployment version confirmed on mock — verify
12. No known old client or manual tool dependency — verify
13. `pg_rewrite` scan complete (all dependent views dispositioned) — verify

---

## Phase 2U-C: N3 Nutrition Boundary Cleanup

### FUTURE PHASE — DO NOT CREATE AS A PENDING MIGRATION

N3 SQL (do NOT add to `supabase/migrations/` before Phase 2U-B audit is complete):

```sql
-- FUTURE PHASE 2U-C
-- DO NOT CREATE AS A PENDING MIGRATION
-- DO NOT DEPLOY BEFORE AUDIT GATES
-- See docs/consumer-runtime-phase-2u/implementation-plan.md for gate conditions

REVOKE SELECT ON public.current_published_menu_item_nutrition FROM anon;
REVOKE SELECT ON public.current_published_menu_item_nutrition FROM authenticated;
REVOKE SELECT ON public.menu_item_nutrition FROM anon;
REVOKE SELECT ON public.menu_item_nutrition FROM authenticated;
```

Post-N3 assertions (all four must be false):
```sql
select
  has_table_privilege('anon', 'public.menu_item_nutrition', 'SELECT') as anon_raw_nutrition,
  has_table_privilege('authenticated', 'public.menu_item_nutrition', 'SELECT') as auth_raw_nutrition,
  has_table_privilege('anon', 'public.current_published_menu_item_nutrition', 'SELECT') as anon_internal_view,
  has_table_privilege('authenticated', 'public.current_published_menu_item_nutrition', 'SELECT') as auth_internal_view;
```

Post-N3 consumer projection must still work (view-owner execution unaffected by client grant revoke):
```sql
select has_table_privilege('authenticated', 'public.consumer_public_next_meal_candidates_v1', 'SELECT') as consumer_accessible;
-- Must be true
```

---

## Phase 2V: Restaurant/Menu Raw Grant Cleanup (N4)

Not in scope until Restaurant Web safe projections designed and tenant isolation confirmed.

N4 SQL (stub — details TBD in Phase 2V):

```sql
-- FUTURE PHASE 2V
-- DO NOT DEPLOY BEFORE RESTAURANT WEB SAFE PROJECTIONS ARE LIVE

REVOKE SELECT ON public.restaurants FROM anon, authenticated;
REVOKE SELECT ON public.restaurant_branches FROM anon, authenticated;
REVOKE SELECT ON public.menus FROM anon, authenticated;
REVOKE SELECT ON public.menu_categories FROM anon, authenticated;
REVOKE SELECT ON public.menu_items FROM anon, authenticated;
REVOKE SELECT ON public.branch_menu_items FROM anon, authenticated;
-- Also revoke activation-pack helper views if they exist in live DB:
-- REVOKE SELECT ON public.restaurant_public_view FROM anon, authenticated;
-- REVOKE SELECT ON public.published_menus_view FROM anon, authenticated;
-- REVOKE SELECT ON public.published_branch_menu_items_view FROM anon, authenticated;
```

Restaurant owner projection is BLOCKED until tenant isolation design is confirmed.

## Rollback (N1 or N2)

If N1 or N2 must be rolled back:

```sql
-- Rollback N2: drop consumer projection
DROP VIEW IF EXISTS public.consumer_public_next_meal_candidates_v1;

-- Rollback N1: restore original 16-column view
CREATE OR REPLACE VIEW public.current_published_menu_item_nutrition AS
SELECT
  n.id, i.restaurant_id, n.menu_item_id, n.calories, n.protein, n.carbohydrates,
  n.fat, n.fiber, n.sugar, n.sodium, n.saturated_fat, n.serving_size,
  n.source, n.confidence_score, n.verified_status, n.updated_at
FROM public.menu_item_nutrition n
JOIN public.menu_items i ON i.id = n.menu_item_id
JOIN public.restaurants r ON r.id = i.restaurant_id
WHERE n.is_current = true
  AND n.verified_status = ANY (ARRAY['verified'::text, 'ai_estimated'::text])
  AND i.status = 'active'
  AND r.status = 'active';
```

Note: `CREATE OR REPLACE VIEW` preserves grants — no grant re-grant needed for rollback.
