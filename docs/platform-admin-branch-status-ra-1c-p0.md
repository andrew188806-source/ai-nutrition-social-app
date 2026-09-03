# RA-1C-P0 Platform Admin branch-status authority

RA-1C-P0 adds exactly one governed mutation: an active Platform Admin holding
`admin_restaurant_branch.status.write` can move one canonical RestaurantBranch between `active` and
`inactive`. It does not add an Admin UI or route; those belong to P1. It does not grant restaurant,
user, Nutritionist, membership-management, delete, generic patch, or service-role authority.

The database obtains the actor from verified request claims, locks the active Platform Admin
membership, checks the exact permission, serializes the actor/request UUID, locks the target branch,
compares status and `status_version`, writes only `status`, and inserts an append-only receipt in the
same transaction. An exact replay returns the receipt. A reused key with changed typed input fails.

RA-1A/RA-1B compatibility is deliberate: `platform_admin_current_context_v1()` continues returning
only `admin_context.read` and `admin_audit.read`. The operation permission is evaluated through the
existing exact permission predicate and again inside the mutation authority.

The Development target is `synthetic-fixture-branch-b` under `synthetic-fixture-restaurant`.
`dev-branch-xinyi` is a protected no-touch assertion. The acceptance harness defaults to a read-only
preflight and prints a SHA-256 fingerprint before its separately gated write mode can apply the
migration. Acceptance restores the original business status through the same RPC and preserves the
monotonic version and receipts. It always ends with zero active Platform Admin memberships.

Production is outside this phase. No script contains a Production project reference.
