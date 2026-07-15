# Phase 2V Tenant Authorization Contract

Status: **Frozen architecture recommendation for Phase 2V-A; not deployed**
Parent plan: [`implementation-plan.md`](./implementation-plan.md)

## 1. Decision

Phase 2V adopts one authorization architecture:

`auth.users.id → restaurant_users.auth_user_id → active restaurant_memberships → optional active branch assignments → DB-enforced owner/internal read scope`

Authentication establishes the actor. Active membership establishes restaurant authority. Active branch assignment and role determine any narrower branch authority. The database is the final authorization authority.

No UI state, route parameter, client-provided `restaurant_id`, repository argument, REST filter, cached restaurant selection, email domain, custom display role, or mere `authenticated` role can establish restaurant authorization.

## 2. Canonical Identity Mapping

### Supabase Auth identity

- `auth.users.id` is the login identity.
- Database policies and hardened functions derive the actor exclusively from `auth.uid()`.
- Public APIs and browser repositories never accept a caller-provided Auth user ID, restaurant-user ID, membership ID, or ownership claim.

### `restaurant_users`

`restaurant_users` is the restaurant-console login profile and stable bridge to Supabase Auth.

Required semantics:

- one row maps to at most one `auth.users.id` through a unique, non-null `auth_user_id` once activated;
- one Auth user maps to at most one enabled `restaurant_users` identity;
- login lifecycle is explicit, with at least enabled and disabled/fail-closed states;
- profile/display fields are not authorization inputs;
- disabling the restaurant user invalidates all restaurant and branch authority even if memberships remain stored;
- browser actors cannot enumerate or mutate arbitrary restaurant-user rows in Phase 2V.

### `restaurant_memberships`

`restaurant_memberships` is the authoritative many-to-many link between `restaurant_users` and restaurants.

It supports:

- one user managing multiple restaurants through separate membership rows;
- one restaurant being managed by multiple users through separate membership rows;
- independently revocable status and role per restaurant;
- no authority inheritance from one restaurant to another.

A membership is effective only when all of these are true:

1. `auth.uid()` resolves to exactly one enabled restaurant user;
2. the membership belongs to that restaurant user;
3. the membership restaurant matches the row/projection restaurant scope;
4. membership status is `active`;
5. the referenced role is active and permits the requested read category; and
6. any required branch assignment is active and consistent with the same restaurant.

Missing, duplicate, inactive, suspended, invalid, cross-restaurant, or structurally inconsistent membership resolution fails closed.

## 3. Membership Status Semantics

Phase 2V requires these effective states, whether represented by the final enum or an approved mapping to deployed values:

| Effective state | Read authority |
| --- | --- |
| `active` | Eligible for role-scoped owner/internal reads. |
| `inactive` | No owner/internal rows. |
| `suspended` | No owner/internal rows. |
| `revoked` or ended | No owner/internal rows. |
| pending/invited, if later introduced | No owner/internal rows until explicitly activated. |
| unknown or malformed | Fail closed; no owner/internal rows. |

The exact deployed enum/value mapping must be re-inspected before Phase 2V-B. If the active database cannot represent active versus denied membership unambiguously, Phase 2V-B is **BLOCKED** until an approved lifecycle model exists.

Invitation, acceptance, expiry, resend, and pending-member UI are not required for the Phase 2V read path. They are deferred to the Restaurant Runtime Track and must not expand Phase 2V.

## 4. Roles and Read Permission

Phase 2V uses the existing role system rather than embedding authorization in client code. Role identity is resolved from the membership's approved role reference/code.

Minimum effective read roles:

| Role | Restaurant-level read | Branch-level read | Staff/security metadata |
| --- | --- | --- | --- |
| owner | All allowlisted owner/internal rows for the membership restaurant | All branches in the membership restaurant | Only the Phase 2V allowlist; no governance-only data |
| manager | Allowlisted operational rows for the membership restaurant | All assigned branches, or restaurant-wide only if the approved role definition explicitly grants it | No owner-only security/governance fields |
| staff | No implicit restaurant-wide access | Only actively assigned branches and role-allowed operational rows | Self/minimal coworker presentation only if separately allowlisted |

Role precedence is deny-first. An absent or unknown role grants nothing. A high-level role never permits cross-restaurant access. Platform admin/reviewer roles are not Restaurant Web owner roles and belong to the Admin Governance Runtime Track.

Before Phase 2V-B, the deployed `restaurant_roles` vocabulary and relationship to memberships must be inspected. Phase 2V-B may map existing equivalent role codes but must not invent parallel role tables or client-only role checks.

## 5. Branch Scope

Restaurant membership grants eligibility within one restaurant; it does not automatically grant every branch to every role.

The canonical branch model is:

- owner: all branches belonging to the membership restaurant;
- manager: active branch assignments, unless an approved restaurant-wide manager scope is explicitly stored in the DB role/assignment model;
- staff: active branch assignments only;
- an assignment is valid only if its branch belongs to the same restaurant as the membership;
- ended, inactive, suspended, mismatched, or missing assignments grant no branch-scoped rows.

The database must enforce or validate cross-restaurant consistency among membership restaurant, assigned branch, employee/user identity, and data-row restaurant. A Branch B identifier cannot be used to escape a Restaurant A membership.

## 6. Database Authorization Boundary

### RLS responsibilities

RLS is the default authority for tenant-bearing base tables that are directly eligible for owner/internal selection. Policies must derive actor and scope from `auth.uid()` and active membership/assignment data.

RLS must:

- deny ordinary authenticated non-members;
- deny inactive/suspended members;
- deny cross-restaurant rows;
- deny out-of-scope branch rows;
- avoid trusting JWT user metadata for restaurant IDs or roles;
- avoid trusting client filters;
- avoid broad authenticated policies such as `auth.uid() is not null` for tenant data.

### Security-invoker view responsibilities

Owner/internal views should use security-invoker semantics when the deployed PostgreSQL/Supabase version and base-table privilege design allow RLS to execute as the calling actor without exposing raw base-table access.

A security-invoker view is acceptable only if:

- its base-table grants and RLS do not let the caller bypass the view's column allowlist;
- direct raw selection remains denied or otherwise cannot reveal a broader field set;
- the view preserves membership-based row isolation;
- its exact columns, owner, security mode, and grants are catalog-validated.

If security-invoker semantics would require unsafe raw table grants, Phase 2V must use a hardened strict RPC or another reviewed projection design. It must not weaken raw access merely to make a view callable.

### Strict RPC responsibilities

A read-only RPC is used only when a safe projection cannot be implemented with RLS plus security-invoker views without exposing raw columns or breaking tenant enforcement.

Any such RPC must:

- derive actor identity only from `auth.uid()`;
- accept no caller ownership identity;
- treat restaurant/branch IDs only as requested filters intersected with DB-authorized scope;
- return a fixed allowlisted row shape;
- be read-only and contain no dynamic SQL;
- fail closed for missing, inactive, suspended, ambiguous, or cross-tenant membership;
- set a fixed safe `search_path` with schema-qualified objects;
- have reviewed ownership by a controlled migration/database role;
- revoke execution from `PUBLIC` and `anon`;
- grant only minimum `EXECUTE` to `authenticated` when required;
- not be callable as an authorization oracle that exposes membership existence across tenants;
- receive dependency, function-definition, privilege, and negative-actor validation.

### `SECURITY DEFINER` restriction

`SECURITY DEFINER` is not the default. It may be used only for a strict read RPC when security-invoker/RLS projection cannot safely satisfy the contract and a security review approves it.

It must never:

- bypass membership status or branch scope;
- expose raw rows or admin/governance fields;
- perform writes in Phase 2V;
- accept caller user/owner identity;
- use an uncontrolled `search_path`;
- retain `PUBLIC` execute;
- be owned by a browser-facing role; or
- substitute for RLS on membership-management tables.

## 7. Membership Table Boundary

Membership and authorization tables are sensitive security data, not general Restaurant Web directory tables.

Phase 2V browser/runtime rules:

- no `anon` access;
- no broad authenticated raw-table access;
- a Restaurant Web actor may receive only the minimum self-scope presentation required to identify current restaurant/branch access;
- self-scope membership results must be exposed through an allowlisted view or strict read RPC, not unrestricted membership-table selection;
- actors cannot enumerate other restaurants' membership, disabled users, internal role metadata, invitation state, audit fields, or authorization history;
- owner and manager do not automatically receive membership administration capability;
- membership insert/update/delete and invitation lifecycle remain outside Phase 2V.

RLS and grants on membership tables must protect the authorization graph itself. A helper or projection that depends on membership data must not create a recursive policy or expose membership existence as a cross-tenant side channel.

## 8. Cross-Restaurant Consistency Constraints

Phase 2V-B must enforce or validate all applicable invariants:

- membership restaurant exists;
- membership user exists and maps to one Auth identity;
- role assignment is valid for the intended restaurant scope;
- branch assignment branch belongs to the membership restaurant;
- menu, category, item, branch-menu-item, analytics summary, and nutrition rows resolve to the same authorized restaurant;
- composite relationships cannot pair Restaurant A parents with Restaurant B children;
- duplicate active membership rows do not create ambiguous authority;
- revocation or user disable takes effect without requiring a new browser deployment or trusting cached client state.

If the deployed schema lacks the keys necessary to enforce a cross-restaurant relationship safely, that object is **BLOCKED** from owner/internal projection until an approved constraint or safe derivation exists. The implementation must not guess tenant ownership from names or route context.

## 9. Browser and Service-Role Boundary

- Restaurant Web browser/runtime uses only the approved publishable/anon client identity plus the signed-in user's session.
- `service_role` is restricted to controlled server/operations environments and separately approved catalog/operations tasks.
- No `service_role` secret, client, proxy, fallback, or environment variable may be required by the Phase 2V browser/runtime.
- A browser failure must not fall back to privileged access or raw tables.
- Claude Development operations may reference service-role behavior only as catalog/operations validation under separate approval; it is not a runtime actor.

## 10. Fail-Closed Outcomes

The owner/internal boundary returns no authorized rows or a typed authorization-unavailable/denied result when:

- there is no authenticated session;
- no restaurant user maps to the session;
- the restaurant user is disabled;
- there is no active matching membership;
- membership is inactive, suspended, revoked, malformed, or ambiguous;
- the requested restaurant differs from authorized scope;
- the requested branch is unassigned or belongs to another restaurant;
- role permission is absent or unknown;
- tenant data is structurally inconsistent;
- projection/RPC configuration is missing;
- mapping or transport validation fails.

No case may fall back to a different restaurant, a global raw query, public data widened with internal fields, mock data represented as live, or privileged credentials.

## 11. Phase 2V-B Entry Blockers

Phase 2V-B must stop before migration creation if Development inspection cannot establish:

- the active existence or safe creation path for `restaurant_users`, `restaurant_memberships`, roles, and branch assignments;
- a stable Auth identity mapping;
- unambiguous membership lifecycle semantics;
- role/branch relationships that can enforce cross-restaurant consistency;
- a safe membership-table RLS/grant design; or
- compatibility with deployed restaurant/menu foreign-key relationships.

These are schema/security blockers. They do not authorize widening Phase 2V into staff invitation, write runtime, Admin Runtime, or a second authorization system.
