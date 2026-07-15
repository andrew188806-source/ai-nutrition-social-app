# Consumer Runtime Phase 2U-C-A implementation plan

## Scope

Phase 2U-C-A prepares a public-safe restaurant nutrition read boundary. It adds the local N2R migration draft, an independent public contract, a prepared Supabase repository capability, and local guards/smokes.

This phase does not deploy the migration, contact a remote project, change raw nutrition grants or RLS, or wire Restaurant Web pages to Supabase. The active Restaurant Web UI remains on its existing mock path.

## Contract split

The existing `MenuItemNutrition` model carries internal workflow semantics (`id`, internal source, confidence and verification state). It remains unchanged. `RestaurantPublicPublishedNutrition` is a separate 13-field contract and does not inherit or backfill that internal model.

The prepared Supabase repository exposes dedicated public methods. Its legacy internal nutrition methods fail closed and remain unwired. Owner/internal nutrition remains **BLOCKED PENDING TENANT OWNERSHIP**.

## Sequence

1. Deploy the N2R safe projection to Development in a separately approved environment.
2. Validate the view definition, exact columns and grants with read-only catalog queries.
3. Run the credential-backed read smoke only in Development.
4. Review evidence before any runtime activation.
5. Consider raw/internal grant cleanup only under a separately approved Phase 2U-C-B.

Review queues, confidence scores and internal verification workflow are intentionally outside the public view. Authenticated access does not prove restaurant ownership.
