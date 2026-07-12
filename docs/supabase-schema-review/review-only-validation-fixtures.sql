-- REVIEW ONLY - Optional disposable DB fixtures for Gate 1 reviewers.
-- Do not run against production or shared development databases.
-- These snippets are illustrative test cases for a disposable Supabase/PostgreSQL environment
-- after docs/supabase-schema-drafts/001-015 have been reviewed and applied manually.

-- Expected PASS after parent rows exist: one current published nutrition row per menu item.
-- insert into menu_item_nutrition(menu_item_id, source, confidence_score, verified_status, is_current)
-- values ('00000000-0000-0000-0000-000000000001', 'admin_verified', 1, 'verified', true);

-- Expected FAIL: duplicate current nutrition row for the same menu item.
-- insert into menu_item_nutrition(menu_item_id, source, confidence_score, verified_status, is_current)
-- values ('00000000-0000-0000-0000-000000000001', 'admin_verified', 1, 'verified', true);

-- Expected FAIL: analytics event without user_id, anonymous_id, or admin source.
-- insert into analytics_events(event_type, restaurant_id, source, occurred_at)
-- values ('restaurant_page_view', '00000000-0000-0000-0000-000000000001', 'direct', now());

-- Expected FAIL: duplicate event idempotency key.
-- insert into analytics_events(event_type, restaurant_id, anonymous_id, source, occurred_at, event_idempotency_key)
-- values ('restaurant_page_view', '00000000-0000-0000-0000-000000000001', 'anon-test', 'direct', now(), 'same-key');
-- insert into analytics_events(event_type, restaurant_id, anonymous_id, source, occurred_at, event_idempotency_key)
-- values ('restaurant_page_view', '00000000-0000-0000-0000-000000000001', 'anon-test', 'direct', now(), 'same-key');

-- Expected FAIL: duplicate unresolved pending menu item duplicate_key.
-- Requires valid restaurant/branch UUIDs to be substituted first.
