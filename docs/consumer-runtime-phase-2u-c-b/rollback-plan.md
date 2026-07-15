# Phase 2U-C-B emergency rollback

Rollback restores only the two object-level `SELECT` privileges that existed before N3:

```sql
GRANT SELECT
ON public.menu_item_nutrition
TO anon, authenticated;

GRANT SELECT
ON public.current_published_menu_item_nutrition
TO anon, authenticated;
```

Do not use `GRANT ALL`. The rollback does not modify either public-safe view. It re-exposes internal nutrition metadata to clients and is reserved for emergency Development recovery only.
