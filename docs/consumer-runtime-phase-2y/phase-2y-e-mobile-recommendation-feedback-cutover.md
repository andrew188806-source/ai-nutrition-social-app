# Phase 2Y-E Mobile Recommendation Feedback Cutover

Status: local candidate preparation only. Development and Production were not contacted.

## Mobile inventory and scope decision

The actual Next Meal route is `apps/mobile/app/recommendation.tsx`. Its interactive recommendation
surface is `NextMealPrototypeContent`. The surface currently supports candidate selection, meal
confirmation, and a separate handoff that pre-fills (but does not create) a Meal Buddy card.

The canonical read path is the Phase 2Q next-meal service. A live candidate carries canonical
`restaurantId` and optional `branchId`. The current presentation projection does not safely expose
`menuItemId` (the database `candidate_id` and `menu_item_id` are distinct) and does not expose a
canonical `recommendationId`. Consequently Phase 2Y-E does not infer either value. Live feedback is
limited to a canonical restaurant target. `u1_mock`, `canonical_mock`, and `local_menu_demo` cards
remain presentation/sample identities and are explicitly target-unavailable.

The existing selected/confirmed state in `NextMealPrototypeContent` is product UI state, not fake
persistence. It remains responsible for the primary action. No direct Supabase/RPC call, feedback
table DML, name-based identity, array-index identity, component-mount event, or route-local
persistent feedback store existed. Ratings and Favorites compositions are unchanged.

## Frozen action mapping

| Frozen action | Actual Mobile gesture | Target | Required canonical IDs | Session/source surface | Disposition |
| --- | --- | --- | --- | --- | --- |
| `clicked` | User taps a live Next Meal candidate card | `restaurant` | `restaurantId`; optional parent-consistent `branchId` | One flow session / `next_meal_recommendation` | Implemented |
| `accepted` | User presses “這是我的下一餐” for the selected live candidate | `restaurant` | `restaurantId`; optional parent-consistent `branchId` | Same flow session / `next_meal_recommendation` | Implemented; terminal boundary |
| `shown` | No independently defined exposure event exists | — | — | — | Deferred: render/rerender is not an event |
| `dismissed` | No dismiss gesture exists | — | — | — | Deferred: no product gesture |
| `saved` | Meal Buddy handoff only pre-fills a form and does not save | — | — | — | Deferred: would misrepresent the primary operation |
| `consumed` | No consumption gesture exists on this surface | — | — | — | Deferred: no product gesture |

`sourceSurface` is supplied only at session creation. Events do not supply it. Mobile supplies no
server timestamp, `userId`/`user_id`, rating, feedback note, dismiss reason, or other v1-excluded
payload.

## Composition boundary

`createMobileConsumerRecommendationFeedbackComposition()` is the only Mobile construction entry.
It calls `createConsumerAuthPort()` and `createConsumerRecommendationFeedbackRuntime()`, returns the
auth port, runtime/service, resolved flags/source, and secure UUID factory, and accepts explicit
environment/dependency injection for smoke use. The default feedback source remains `disabled`.
Supabase requires explicit source selection plus valid Auth/client dependencies; invalid or missing
configuration throws and the UI catches it as disabled/target-unavailable. Construction invokes no
repository operation and therefore no network/database call.

The UI feature imports the Mobile composition, target mapper, and UI model only. It never imports
the runtime factory, repository, Supabase client, `.rpc()`, or table APIs.

## Canonical target identity

The target mapper accepts exactly the Frozen `recommendation`, `restaurant`, and `menu_item` shapes
with explicit `identityEvidence="canonical"`. It rejects non-canonical evidence, empty/display
identities, `fav-*`, `meal-record-*`, local meal IDs, rating IDs, presentation card IDs, unsupported
kinds, and cross-kind fields. Numeric text is accepted when it is explicitly canonical; an array
index is rejected by evidence rather than by a blanket numeric rule. Menu-item targets require both
restaurant and menu-item parent identity. No ID is converted, guessed, or synthesized.

## Session, stale, duplicate, and idempotency behavior

The production UI model uses a secure injected UUID v4 factory for session IDs and event keys. If
`crypto.randomUUID()` is unavailable or malformed, it fails closed; there is no `Math.random()`
fallback. A stable flow identity retains the same session UUID across create retries. A stable
gesture identity retains the same event UUID across write retries.

- no event is sent before `created`/`already_created`;
- concurrent duplicate taps share one pending event promise;
- a completed duplicate resolves locally as `already_recorded` without a second UI write;
- reusing a gesture identity for another payload becomes `idempotency_conflict`;
- generation counters ignore stale async responses after reset/auth change/unmount cleanup;
- Auth identity changes reset all local session/event state;
- accepted confirmation ends the session only after the event is recorded;
- an ended session rejects later events and repeated end is safe;
- a new result flow receives a new secure session identity;
- rerenders do not create sessions or events, and general navigation state does not end a session.

The primary candidate selection/confirmation happens before asynchronous feedback work. Feedback
failure never replays or falsifies that primary action, never reports persistence success, and has
no unbounded automatic retry.

## Development narrow validation handoff

The Development Mobile smoke is explicit opt-in. Claude must reuse one existing Development test
actor, provide the exact project/37-of-37/ACL evidence, a canonical restaurant target, controlled
UUID identities, and a Development Management/Postgres cleanup operator. The runner must prove a
zero controlled pre-count, capture immediate aggregates, create one session, record one implemented
action plus its identical retry, end, clean exact rows, restore aggregates, sign out, clear the
session, close the operator, and remove compilation artifacts. It does not provision/delete users,
deploy migrations, or rerun the D-B two-actor matrix.

## Historical service-role disclosure

Retained Phase 2Y-D-B evidence records that Development admin actor provisioning used a
`service_role` credential. The Mobile/browser runtime path did not use it, Production gained no
such path, and controlled actors/rows were cleaned to zero. In this Phase 2Y-E local preparation:

- `serviceRoleCredentialAccessed=false`
- `serviceRoleCredentialUsed=false`
- `serviceRoleBrowserRuntimePathUsed=false`
- no Management endpoint returning project API keys was called

Development remains retained at 37/37. Production, N4, and Phase 2Z remain untouched/unstarted.

## Historical regression disposition

The Frozen Phase 2Y-D-A contract smoke remains positive (`81/81`), its forward regression smoke
remains positive (`33/33`), and the complete D-A guard remains positive (`202/202`). The historical
Phase 2Y-D-B0 preparation guard reports exactly these four forward-transition differences, each
classified `EXPECTED_PHASE_TRANSITION_RESULT`:

- `baseline HEAD is exact`: the repository has advanced from the D-B0 preparation baseline;
- `candidate inventory is exactly four files`: Phase 2Y-E has its own exact 12-file candidate;
- `Production TypeScript runtime diff is empty`: Phase 2Y-E intentionally adds the Mobile cutover;
- `package changes no other script`: Phase 2Y-E intentionally adds its three validation scripts.

No other D-B0 check fails. In particular, the safe default remains skipped, staged diff remains
empty, and the historical result reports no network, database, credential, migration, Development,
Production, service-role, N4, or Phase 2Z activity.
