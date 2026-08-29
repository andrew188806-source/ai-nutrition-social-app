# REC-C Allergy Eligibility Activation

REC-C activates an Allergy-only admission gate for the current-user next-meal recommendation pool.
It answers whether a branch-offer candidate has enough governed allergen-content evidence to enter
REC-A Nutrition ranking and REC-B Taste composition. It is not a score, medical advice, a safety
assessment, or an allergen-free certification.

## Frozen inputs

The user side is read only through
`read_authenticated_allergy_settings_v1()`. Empty canonical keys with zero unresolved selections
means `no_active_allergies`; one or more canonical keys means `active_allergies`; any unresolved
selection fails closed. Legacy text, restriction type, label, severity, Social data, and heuristics
are not Allergy authority.

The candidate side uses only the authenticated REC-C-P0 branch-offer fact and coverage projections.
Known-present facts may establish a conflict. Missing facts never establish absence. Unknown or
partial coverage means evidence is insufficient for an Allergy-aware recommendation, not that a
candidate is unsafe.

## Policy and pipeline

The shared policy is `tastkind.allergy.content_eligibility@1`, against
`tastkind-allergen-tw-v1@1`:

- known conflict: exclude;
- unknown coverage: exclude;
- partial coverage: exclude;
- complete coverage with no known intersection: eligible.

Both GEO and non-GEO acquisition converge on the same repository seam:

`candidate acquisition → optional GEO → REC-C → REC-A → REC-B → entitlement → presentation`.

No-active Allergy bypasses P0 evidence reads and preserves the exact REC-B candidate order. Active
Allergy never widens GEO and no REC-A, Lane A, Lane B, fallback, entitlement, or presentation path
may reintroduce an excluded candidate. A zero-survivor result remains empty.

## Truthful output and privacy

Recommendation output carries only coarse applied/not-applied policy identity. It never contains
the user's Allergy keys, source tuple, private labels, severity, normalization internals, or a
safety boolean. Surviving-card copy says only that known content conflicts were excluded and still
asks the user to confirm ingredients and cross-contact with the restaurant.

Unresolved settings direct the user to the existing
`個人設定 → 飲食限制 → 過敏原` editor. Authority failures report recommendation unavailable.
Neither case silently runs unfiltered REC-B.

Today Intake and Meal Buddy receive only the already-frozen selected candidate identity. No private
Allergy data is copied into meal records, Meal Context, Meal Buddy, or Social.

## Development acceptance

Use controlled non-Production data to verify: exact no-active REC-B order; peanut conflict exclusion;
complete/no-conflict admission without safety language; unknown and partial exclusion; branch A/B
isolation; unresolved and dependency failure closure; truthful zero-result copy; real eligible
Lane-A Today Intake; real eligible Lane-B Meal Buddy; no private leakage; and zero-residue cleanup.
Production remains forbidden.
