# Phase 2W-E Target Identity Security

- Rating targets require explicit trimmed opaque canonical IDs. Restaurant target requires `restaurantId`; menu-item target requires both `restaurantId` and `menuItemId`.
- `branchId` remains nullable and is never guessed.
- Restaurant/menu names, photos, addresses, array positions, and fuzzy matches are not accepted target inputs.
- The local analysis `mealId` is a local stable key only. It is explicitly ignored by the target mapper and never becomes `mealRecordId`.
- Optional `mealRecordId` or `mealRecordItemId` is forwarded only from a separately named canonical linkage field that passes database UUID validation.
- The current Meal Log safely exposes restaurant-only rating where `restaurantId` exists. It does not pretend to perform a menu-item write.
- Missing identity fails closed without creating a restaurant/menu item and without calling a canonical write.

The composition creates no global Supabase singleton. Supabase selection still requires explicit flags and an injected client; missing client or invalid configuration fails closed through the Frozen factory.
