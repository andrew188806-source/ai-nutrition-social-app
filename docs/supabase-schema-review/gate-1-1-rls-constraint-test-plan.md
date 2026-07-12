# Gate 1.1 RLS and Constraint Test Plan

Scope: Test plan for disposable DB execution and RLS verification. This is not executable production code.

## Constraint Execution Tests

| ID | Area | Setup | Action | Expected result |
| --- | --- | --- | --- | --- |
| C-001 | Restaurant/Branch | Insert restaurant | Insert branch with valid restaurant_id | PASS |
| C-002 | Restaurant/Branch | None | Insert branch with missing restaurant_id | FAIL by FK |
| C-003 | Menu | Insert restaurant/menu/category/item | Insert valid category and item chain | PASS |
| C-004 | Menu | Insert branch/item | Insert duplicate `(branch_id, menu_item_id)` | FAIL by unique constraint |
| C-005 | Alias | Insert restaurant/menu item | Insert duplicate approved alias in same restaurant scope | FAIL by partial unique index |
| C-006 | Pending | Insert restaurant/branch | Insert duplicate unresolved pending item duplicate_key | FAIL by duplicate suppression index |
| C-007 | Nutrition | Insert menu item | Insert one current nutrition row | PASS |
| C-008 | Nutrition | Insert current nutrition row | Insert second current nutrition row for same item | FAIL by partial unique index |
| C-009 | Analytics | Insert valid restaurant | Insert event with user_id actor context | PASS |
| C-010 | Analytics | Insert valid restaurant | Insert event with anonymous_id actor context | PASS |
| C-011 | Analytics | Insert valid restaurant | Insert event without user_id/anonymous_id and non-admin source | FAIL by actor context check |
| C-012 | Analytics | Insert first event with idempotency key | Insert second event with same key | FAIL by unique constraint |
| C-013 | Legacy mapping | Insert mapping | Insert same source_system/source_dataset_version/entity_type/legacy_id | FAIL by unique constraint |

## RLS Tenant and Branch Escape Tests

| ID | Actor | Operation | Target | Expected result |
| --- | --- | --- | --- | --- |
| R-001 | anonymous | SELECT | active public restaurants | PASS |
| R-002 | anonymous | SELECT | draft/paused/archived restaurants | DENY |
| R-003 | consumer | SELECT | current verified nutrition | PASS |
| R-004 | consumer | SELECT | pending/rejected nutrition estimate/review | DENY |
| R-005 | consumer | INSERT | analytics_events direct table insert | DENY or unavailable; ingestion service required |
| R-006 | consumer | INSERT | legacy_entity_mappings | DENY |
| R-007 | restaurant owner A | SELECT | restaurant A scoped data | PASS |
| R-008 | restaurant owner A | SELECT | restaurant B scoped data | DENY |
| R-009 | branch manager A1 | UPDATE | branch A1 availability | PASS if role permits |
| R-010 | branch manager A1 | UPDATE | branch A2 availability | DENY unless explicitly assigned |
| R-011 | restaurant employee A1 | UPDATE | memberships/roles | DENY |
| R-012 | restaurant user | SELECT | platform audit logs | DENY |
| R-013 | platform reviewer | SELECT | review queues | PASS |
| R-014 | platform reviewer | CONFIRM | platform-admin-only action | DENY |
| R-015 | platform admin | UPDATE | governance action draft | PASS through controlled flow |
| R-016 | service role | BACKFILL | import/mapping records | PASS in server-only context |

## SECURITY DEFINER Inventory Expectations

Current draft expectation:

- No SECURITY DEFINER function is present.
- Any future SECURITY DEFINER function requires external security review.

## Gate 1.1 Pass Criteria

Gate 1.1 can pass only if:

- disposable DB apply succeeds.
- recreate succeeds.
- constraints execute as expected.
- validation queries return expected clean results.
- RLS harness executes or is replaced by an explicit external security condition.
- no tenant/branch escape is observed.
- no runtime code is modified.
- no active migration is created.
- no production environment is contacted.
