# Gate 1 RLS Policy Matrix

Scope: Static DB/security review for the frozen schema candidate. This matrix is not a production-certified RLS implementation.

| Surface / table | Anonymous consumer | Authenticated consumer | Restaurant employee | Branch manager | Restaurant owner/admin | Platform reviewer | Platform admin | Service role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| restaurants | SELECT approved/active only | SELECT approved/active only | SELECT own restaurant | SELECT own restaurant | SELECT/UPDATE own restaurant through controlled flow | SELECT review scope | SELECT/UPDATE via governance flow | Full trusted jobs |
| restaurant_branches | SELECT active only | SELECT active only | SELECT assigned restaurant branches | SELECT assigned branch | SELECT/UPDATE scoped branches through controlled flow | SELECT review scope | SELECT/UPDATE via governance flow | Full trusted jobs |
| menus / menu_categories | SELECT published only | SELECT published only | SELECT scoped restaurant | SELECT scoped branch-relevant menus | Manage scoped drafts via server/RPC | Review | Govern | Full trusted jobs |
| menu_items | SELECT active public items | SELECT active public items | SELECT scoped restaurant | SELECT scoped branch-relevant items | Manage scoped drafts via server/RPC | Review | Govern | Full trusted jobs |
| branch_menu_items | SELECT available public items | SELECT available public items | SELECT scoped restaurant | UPDATE own branch availability through controlled flow | Manage scoped branch availability | Review | Govern | Full trusted jobs |
| menu_item_aliases | SELECT approved public aliases only if exposed | SELECT approved public aliases only if exposed | SELECT scoped aliases | SELECT branch aliases | Manage proposed aliases through controlled flow | Review alias queue | Govern aliases | Full trusted jobs |
| pending_menu_items | No read | INSERT only if anonymous pending submission is accepted by product/security | SELECT own restaurant pending queue | SELECT/UPDATE branch queue via server/RPC | SELECT/UPDATE restaurant queue via server/RPC | Review | Govern | Full trusted jobs |
| menu_item_nutrition | SELECT current verified/published only | SELECT current verified/published only | SELECT scoped current values | SELECT branch item current values | Submit updates through review flow | Review | Approve via governance flow | Full trusted jobs |
| nutrition_estimates | No public read | No public read | SELECT scoped estimate queue if permitted | SELECT branch scoped estimate queue if permitted | SELECT scoped estimate/history | Review | Govern | Full trusted jobs |
| nutrition_reviews | No public read | No public read | SELECT scoped review status if permitted | SELECT branch scoped review status if permitted | Submit/respond through controlled flow | Review/update status | Govern | Full trusted jobs |
| nutrition_change_logs | No public read | No public read | SELECT scoped history if permitted | SELECT branch scoped history if permitted | SELECT scoped history | Review | Govern | Full trusted jobs |
| analytics_events | No unrestricted direct access | INSERT only through RPC/Edge/ingestion service; own private event read only if product allows | SELECT scoped aggregate via views | SELECT branch aggregate via views | SELECT restaurant aggregate via views | Inspect quality | Govern/inspect | Full trusted jobs |
| analytics summary views | Public only if anonymized and approved | Public only if anonymized and approved | Scoped aggregate | Branch aggregate | Restaurant aggregate | Platform review | Platform aggregate | Full trusted jobs |
| restaurant_users | No access | Own account only if applicable | Own account and limited coworker directory if permitted | Scoped staff directory | Manage scoped users through controlled flow | Review | Govern | Full trusted jobs |
| restaurant_employees | No access | No access | Scoped staff directory | Branch staff directory | Manage restaurant staff through controlled flow | Review | Govern | Full trusted jobs |
| memberships / roles / assignments | No access | No access | Own membership summary only if needed | Branch assignments if permitted | Manage through controlled flow | Review | Govern | Full trusted jobs |
| admin_action_drafts | No access | No access | No direct access | No direct access | View own submitted drafts if scoped | Create/review drafts | Confirm/cancel drafts | Full trusted jobs |
| audit_logs | No access | No access | Scoped audit summary only if permitted | Branch audit summary only if permitted | Restaurant scoped audit read | Governance audit read | Platform audit read | Full trusted jobs |
| legacy_entity_mappings | No access | No access | No access | No access | No access | Read only if reviewing migration | Read/govern import | Full trusted imports |

## Security Conclusions

- Direct client writes to analytics_events should not be promoted for production.
- Restaurant and branch tenancy must be resolved from memberships/role assignments, not broad client claims.
- Platform admin/reviewer custom claims require external security review.
- SECURITY DEFINER functions are not present in the current drafts; any future use requires search_path and input validation review.
- Service role access must remain server-only and never be exposed to repository code or client runtime.
