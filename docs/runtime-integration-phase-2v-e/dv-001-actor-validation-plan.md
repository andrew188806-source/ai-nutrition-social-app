# P2V-B-DV-001 Development Actor Validation Plan

Status: **HTTP actor authorization PASSED/CLOSED; UI/session lifecycle and route walkthrough NOT EXECUTED/DEFERRED**

Credential-backed HTTP evidence was collected against all eight approved Development actors using each actor's own access token over the real PostgREST path, for all seven internal RPCs against both restaurants:

- 8/8 sign-in: PASS. 8/8 global logout: PASS.
- Full actor matrix (test groups 1–4 and 11 below): PASS — owner/manager/staff positive scopes, inactive/suspended/revoked/non-member fully fail-closed, matching the required-denial column of the actor matrix exactly.
- `restaurant-b-owner` positive path: all six restaurant-B-scoped RPCs HTTP 200 with row_count=1 each; `restaurant_internal_restaurants_v1` scoped to Restaurant B only. PASS.
- `restaurant-b-owner` cross-tenant denial: all seven RPCs against Restaurant A returned row_count=0. PASS.
- Anonymous internal-RPC denial (all seven RPCs, true anon token): HTTP 401. PASS.
- Public-safe regression (`restaurant_public_published_nutrition_v1`, anon): HTTP 200. PASS.

DV001_CREDENTIAL_BACKED_HTTP=PASS, DV001_FULLY_CLOSED=true for this HTTP authorization scope.

Test groups 5–10 (multiple-membership chooser, stale-cookie fail-closed, stale-branch-filter rejection, session restore/refresh, sign-out state removal, membership-revocation-mid-session) and group 12 (live Restaurant Web route walkthrough) were **NOT EXECUTED** and are **DEFERRED** — no browser session was driven in this validation round; only direct HTTP/Auth calls were made. These are not claimed as PASS. They do not block this Development Freeze, but they are a required public-hosting/Production acceptance gate and must be executed and recorded before any public URL or Production use.

Only stable labels may appear in reports. Emails, passwords, Auth UUIDs, JWTs, cookies, credentials, project identifiers, restaurant IDs, branch IDs, and raw rows must never be committed or printed.

## Required topology

- Restaurant A with Branch A1 and Branch A2.
- Restaurant B with Branch B1.

Frozen evidence proves that the schema, membership lifecycle, branch scopes, three membership RPCs, and seven internal read RPCs exist. It does not prove that the named test restaurants, branches, memberships, roles, or Auth accounts currently exist in Development. Every topology object and lifecycle state must therefore be confirmed remotely before testing; none is treated as an approved fixture from local evidence.

## Actor matrix

| Stable actor label | Required state | Positive scope | Required denial |
| --- | --- | --- | --- |
| `restaurant-a-owner` | active owner | all Restaurant A branches and seven RPCs | Restaurant B |
| `restaurant-a-manager-a1` | active manager, Branch A1 only | Branch A1-reachable data | Branch A2 and Restaurant B |
| `restaurant-a-staff-a1` | active staff, Branch A1 only | Branch A1-reachable data | Branch A2 and Restaurant B |
| `restaurant-a-inactive` | inactive membership | none | all owner/internal rows |
| `restaurant-a-suspended` | suspended membership | none | all owner/internal rows |
| `restaurant-a-revoked` | revoked membership | none | all owner/internal rows |
| `restaurant-b-owner` | active owner | all Restaurant B branches and seven RPCs | Restaurant A |
| `consumer-non-member` | authenticated Consumer, no Restaurant membership | public/Consumer-safe only | all owner/internal rows |

## Required test groups

1. Owner restaurant-wide positive reads across all seven RPCs.
2. Manager/staff Branch A1 positive reads and Branch A2 denial.
3. Restaurant A actors requesting Restaurant B and Restaurant B owner requesting Restaurant A.
4. Inactive, suspended, revoked, and non-member actors returning zero owner/internal rows.
5. Multiple active memberships requiring the chooser before a tenant is selected.
6. Stale restaurant cookie fails closed and requires reselection.
7. Stale branch filter is rejected without widening scope.
8. Session restore and refresh preserve only current database authority.
9. Sign-out removes authenticated access and selection state.
10. Membership revocation against an existing session takes effect on the next server request.
11. Every approved actor/result combination is exercised for all seven RPCs.
12. All live Restaurant Web routes are exercised: sign-in/root routing, protected restaurant layout, Dashboard, Locations, Menu, Nutrition, selection/reset, legacy redirects, and every deferred screen's unavailable state.

Each result records only actor label, route/RPC label, expected outcome, observed status class, and row count. Cross-tenant tests must never log returned payloads or identifiers.

## Responsibility and approvals

### User/manual

- Create or approve Development Auth accounts.
- Provide credentials only through ignored local environment files.
- Approve any Development application fixture write separately.
- Never place credentials in the repository.

### Codex

- Maintain fixture-free validation contracts, local guards, and a credential-neutral harness.
- Never create remote actors or fixtures.

### Claude

- Confirm Development catalog/topology state.
- Run credential-backed smoke only with approved actors.
- Never touch Production or expand scope.

### ChatGPT

- Review evidence and authorize any Development fixture plan.
- Decide DV-001 pass/fail before N4 drafting.

No fixture SQL or Auth Admin command belongs in this work package.

