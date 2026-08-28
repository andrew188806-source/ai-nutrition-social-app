# REC-B dual-lane Taste recommendation authority

REC-B activates explicit private user-to-meal Taste as optional soft-ranking infrastructure. It does
not add eligibility, restriction, safety, Social Taste, Public Interest, Meal Context, behavioral
learning, GEO, availability, or write authority. No migration is part of this phase.

## Architecture reconciliation

The eligible candidate pool remains the frozen REC-A/P0 pool after availability and optional GEO
narrowing. REC-A produces the unchanged Nutrition evaluation and baseline order. The P0
branch-offer-keyed fact/state views supply candidate facets only for that pool. The current-user
foundation read supplies only explicit cuisine, meal type, disliked flavor, and spice values. The P1
vocabulary views normalize cuisine, flavor, and spice; meal type stays directly canonical.

The final product policy names its normalization reference `private-taste-normalization-v1`/1. The
frozen P1 backing authority remains `private-taste-normalization`/1. The runtime normalization adapter
is the single reconciliation point between that versioned REC-B reference and the unchanged P1
identity. No alias row, duplicate authority, or migration is created.

`TasteRankingPolicyProvider` and `RecommendationCompositionPolicyProvider` each resolve once per
recommendation request. Invalid/throwing providers, profile read failure, normalization authority
failure, candidate projection failure, or Taste evaluation failure all preserve the REC-A order.
Invalid composition policy also returns the REC-A order. GEO is never widened.

## Policies and ranking

`tastkind.taste.explicit_preferences`/1 owns the four facet weights, abstention, minimum two
comparable facets, categorical match semantics, disliked-flavor semantics, and spice-distance table.
Unknown facets do not enter the numerator or denominator. A one-facet candidate is
`insufficient_evidence`, not a synthetic zero. Raw Taste evaluations never persist or enter UI.

`tastkind.recommendation.dual_lane_interleave`/1 owns the two lanes. Lane A starts from REC-A,
creates anchor-based 0.02 Nutrition bands, and reorders valid-Taste candidates only in slots that
already held valid-Taste candidates. Lane B excludes insufficient Taste, converts Taste and REC-A
restricted order to bounded rank utilities, and combines them 0.60/0.40. It never mixes raw score
spaces. Odd slots request Lane A and even slots request Lane B. Used `candidateId` values are skipped;
the other lane then REC-A baseline provides truthful fallback. `menuItemId` is never the dedupe key.
Entitlement clipping happens only after the full interleave, so Free and Premium receive prefixes of
the same order.

## Reasons, detail, and actions

Reason calculation is separate from ranking. Lane A prefers a truthful Nutrition-gap statement;
Lane B prefers an actual positive canonical Taste match. Known disliked-flavor non-overlap never
becomes an avoidance claim. The compact card renders at most one short line. Tap selection opens the
existing inline canonical detail architecture with a larger image where available, identity,
nutrition, and fuller coarse explanation. No raw score, weight, tolerance, alias, provenance, audit
reference, full preference array, Social similarity, or policy mechanics are presented.

The selected view model is passed unchanged to two independent explicit action callbacks. “加入今日
飲食” calls the existing `ConsumerMealWriteRuntime`, preserving restaurant, branch, menu item,
nutrition, and source provenance supported by the frozen meal-record contract. “用這餐找飯友” keeps
the existing Recommendation -> staged prefill -> server validation -> server-derived Meal Context ->
card flow. Neither callback invokes the other. Recommendation lane is never consulted by either
action, and selection/viewing performs no write.

## Claude Development acceptance handoff

Development acceptance must use real authenticated fixtures and then remove every fixture. It must
exercise mapped, partial, and unknown candidate Taste; normalized explicit user Taste; every facet
and spice distance; one-facet insufficiency; Lane A tolerance, anchor anti-chain, and fixed unknown
slots; Lane B exact 60/40 rank utility and singleton behavior; interleave/dedupe/exhaustion; same-order
Free/Premium prefixes; GEO and non-GEO downstream parity; and REC-A failure fallback.

At least one Lane-A and one Lane-B selection must traverse the identical detail boundary. For each,
prove the explicit Today Intake write through the existing real meal-record flow and independently
prove the existing Meal Buddy prefill/server-context/card flow. An intake action must create no Meal
Buddy state; a Meal Buddy action must create no intake record. Cleanup must leave zero candidate
facts, normalization/profile fixtures, menu/offer fixtures, intake records, Meal Buddy cards,
relationships/invites, grants, or other acceptance residue. Production must never be addressed.
