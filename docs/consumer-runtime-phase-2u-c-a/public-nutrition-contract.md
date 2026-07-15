# Public restaurant nutrition contract

`public.restaurant_public_published_nutrition_v1` is the prepared public-safe boundary over `public.current_published_menu_item_nutrition`.

Its exact fields are:

1. `restaurant_id`
2. `menu_item_id`
3. `calories`
4. `protein`
5. `carbohydrates`
6. `fat`
7. `fiber`
8. `sugar`
9. `sodium`
10. `saturated_fat`
11. `serving_size`
12. `nutrition_source_public`
13. `nutrition_updated_at`

Numeric nutrition values and serving size preserve database nulls. `nutrition_source_public` is already-sanitized provenance and is not converted back into an internal source. `nutrition_updated_at` is preserved as the canonical timestamp string returned by the data boundary.

The contract excludes the internal nutrition row ID, raw source, confidence score, verification status, reviewers, review timestamps, current-row flags, notes, rejection reasons and all workflow fields. It therefore cannot support a review queue, confidence display, or internal verification workflow.

The view grants read access to `anon` and `authenticated`, but authenticated access is not restaurant ownership. Browser clients must never use `service_role`. Owner/internal nutrition access remains **BLOCKED PENDING TENANT OWNERSHIP**.
