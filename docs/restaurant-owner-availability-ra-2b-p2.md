# RA-2B-P2 — Restaurant Owner availability application

Pushed baseline `bbe60548ea8e65abce22b4ed330980c4a856d3bb`; frozen P1
`f699932897dd8493e4d4f510e4cd0562f22e2955`. This successor activates only the Restaurant Web
availability operation. P1 SQL, roles, grants, policies and predecessor application contracts remain frozen.

The live `/restaurant/menu` renders an independent three-state control beside sold-out. The selected
Restaurant context supplies preview selectors; canonical cookie authentication verifies the subject,
and P1 decides current Owner permission and tenant authority. Claim roles and caller identities never
supply authority. Mock presentation does not render this control; only a successful, exact P1 preview
can enable it. Sold-out does not disable availability and neither control rewrites the other's state.

GET `/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/availability` invokes only
`restaurant_owner_preview_branch_menu_item_availability_v1`. Its exact seven-field success projection
is `ok`, `state`, `branchMenuItemId`, `branchId`, `menuItemId`, `availability`, `availabilityVersion`.
Both path selectors must echo. Wrong selected Restaurant, foreign and missing targets preserve P1's
bounded error; there is no privileged existence lookup or direct table fallback.

POST accepts exactly `expectedAvailability`, `nextAvailability`, `expectedVersion`, with canonical
`available | limited | unavailable` and a nonnegative decimal bigint string. JSON input is limited to
2048 streamed bytes. It invokes only `restaurant_owner_set_branch_menu_item_availability_v1`; P1
resolves restaurant and branch from the canonical offering ID. As in RA-2A, POST's branch path is a
bounded route selector and is deliberately not sent as authority to the four-argument mutation RPC.
The selected Restaurant cookie cannot grant or revoke mutation authority. An owned offering ID is
resolved by P1's actual membership chain, even if a caller supplies a different branch selector.
There is no application-side preview prelookup on POST. The browser always posts its canonical preview
identities. Mutation output strips audit ID, returning only state, offering ID, availability and version.

Every response uses `private, no-store`, `Vary: Cookie`, and `nosniff`. Bounded failures map to
401 unauthenticated, 403 permission_denied, 404 target_not_found, 409 stale_state, 422 no_change,
400 invalid_request, 503 dependency_unavailable and 500 internal_failure. Unknown DB fields or codes
fail closed; raw database errors are never returned.

Versions remain strings at every boundary, including values above JavaScript's safe integer limit.
The UI uses only preview value/version, displays menu item, branch, before/after state and consequence
before confirmation, and blocks same-state actions and duplicate in-flight submissions. `limited`
can remain catalogue eligible under other rules but excludes next-meal eligibility; `unavailable`
excludes both. `available` still depends on publication, sold-out and other eligibility rules.

Every confirmed action sends at most one POST. Stale responses refresh by GET and require fresh
confirmation. Lost, malformed or ambiguous responses also GET; if the desired value holds, the UI
shows that canonical value without asserting which writer caused it. Otherwise the Owner must make a
fresh explicit action. Failed previews disable the control; there is no local/mock success, version
arithmetic or requestId invention.

The server-only repository reuses the canonical SSR client and fixed RPCs. The browser imports only
bounded types/parsers and the fixed HTTP client; no credentials, DB transport or internal schema.
The smoke runner executes shipped TypeScript handlers and browser flow in isolated VMs with mocked
claims/RPC/fetch. It does not substitute a second behavioral implementation. Source guards additionally
pin imports, immutable predecessor bytes, scope and topology; mutations test these gates and behavior.

## Local validation and historical gates

Run the four `test:restaurant-owner-availability-ra-2b-p2*` package scripts (Development defaults to
skipped), P1 smoke/mutations and PG17 authority suite, and the relevant predecessor behavioral suites.
P1 guard was run at its exact original topology before edits. Historical guards retain their original
commit, migration-count and no-successor assertions; those lifecycle assertions are not applicable to
this successor. The P2 guard pins the complete P1 tree outside its exact allowed additions and the
one live-view composition edit, and preserves every pre-existing package command. No predecessor
checks or evidence are rewritten. Typechecks, production build and source/browser secret checks are
required before freeze. Detailed results are reported with the freeze.

## Prepared Development acceptance (not run in local implementation)

The harness is inert unless `TASTKIND_RA2B_P2_DEVELOPMENT_PREFLIGHT=1` is explicitly supplied under
later acceptance authorization. The distinct `TASTKIND_RA2B_P2_DEVELOPMENT_WRITE=1` gate enables the
bounded HTTP cycle on `dev-bmi-b-main` in hidden Restaurant B. Only loopback base URLs are accepted.
It neither reads credential files nor rotates passwords or creates sessions. An operator must establish
an authorized session, supply its cookie without logging it, then sign out and delete temporary
credential material after the checks. Fresh rotation requires fresh direct authorization.

Expected preflight: availability available/"2", availability audits 2; sold-out false/"4", sold-out
audits 4; Restaurant draft and non-public. Actual HTTP cycle: GET, available/2 → limited/3, stale 409,
fresh GET, canonical recovery available/4, ABA version2 409, final GET. Recovery inspects canonical
state and audit count first and can only perform limited/3 → available/4 through the frozen route.
Unexpected or already advanced starting states stop rather than restart the cycle. All branch rows,
other offerings, Restaurant records, memberships, scopes and roles are fingerprinted; sold-out state
and audits stay unchanged. No direct SQL recovery. The harness is prepared only in this round.

Frozen normalized SHA-256:
- RA-2B-P1 `83522a06b01611c06a665eca66f2921b5d57cd9114973b257a3e374f203aac33`
- RA-2A-P1 `b28a496dda43383e96d977c8e54ef54e6619f77bb2a1c3d949fe422bf36ecc01`
- RA-2A-R1 `84cf0285a1087a2386fcc3e70d8f75d3d6b28023c843361e42fcd37ab0ef7376`

Reference consulted: Supabase [SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [RPC](https://supabase.com/docs/reference/javascript/rpc). No dependency/API upgrade is needed.

## Recorded regression classifications

P1 guard passed 25/25 at the exact P1 baseline. P1 smoke 78/78, mutations 70/70 killed;
local PostgreSQL 17.6 non-superuser apply/authority gate 58/58, all 96 migrations applied.
RA-2A P1 smoke 63/63 and 49/49 mutants; R1 38/38 and 36/36; P2 66/66 and 23/23.
Tenant isolation 48/48, internal reads 21/21, Restaurant Web contract pass, consumer catalogue 38/38,
recommendation REC-D 46/46 and 18/18 mutants, GEO recommendation 26/26, MI finalization 411/411.
RA-1A 64/64 and 62/62 mutants; RA-1B 83/83 and 28/28; RA-1C P0 20/20 and 37/37;
RA-1C P1 75/75 and 23/23. Social final 44/44 and 58/58 mutants. Meal Buddy closure mutants 48/48.

Two unmodified historical smoke runners are intentionally reported with their exact limits:
- RA-1C-R1: 121/123. Its original 19-definition inventory predates both Owner writer roles.
  Both failures are the old count/disposition assertions. Its 10/10 security mutants are killed.
  The P2 guard instead requires those exact nineteen definitions plus precisely the two source-pinned
  Owner roles (21 definitions total); no arbitrary extension is accepted. P1 PG17 proves the new
  role's effective client/runtime denials and independent grants.
- Meal Buddy SR2K-A: 68/69. Its candidate-surface equality compares against
  `4f6dc34d52b4aee22081cc00672c8e312c045d3a`; `useMealBuddyRealCandidates.ts` had already changed
  before the frozen P1 baseline. This P2 changes no candidate bytes; the P2 guard asserts that.
  All remaining 68 checks and all 48 mutations pass.

These are successor classifications, not suppressed checks or rewritten predecessor evidence.

## P2 local freeze validation

P2 guard 50/50; smoke 138/138 (shipped route/repository/parsers/browser reconciliation plus source
assertions); mutations 24/24 killed, zero survivors. Root and Restaurant Web TypeScript pass.
Restaurant Web Next.js 14.2.35 production build passes via its normal CLI entrypoint. Source secret
scan covers all 14 successor paths. All 44 generated browser JS chunks pass the availability
RPC/sealed-authority/internal-schema exposure scan. `git diff --check` passes.
The prepared Development harness exits skipped with `writeExecuted: false` by default.
No Development query, business write, fixture credential access, Auth operation, deployment or push
was performed during this application round. The database gate used only a disposable local PG17
cluster; live P1 acceptance evidence remains the frozen predecessor record.
