# REC-B-P0 Candidate Taste Data Authority

Status: local freeze candidate. Production is forbidden. REC-B-P0 establishes data authority only;
it does not score, rank, filter, or reorder a recommendation.

## Reconstructed authority

The private current-user Taste snapshot is `taste-profile-snapshot-v1`. Its explicit profile facts
come from `taste_profiles` and map as follows:

| Source field | Snapshot facet | Vocabulary today | Empty/unknown | Suitable future comparison |
| --- | --- | --- | --- | --- |
| `preferred_cuisine_tags` | `cuisine` | normalized but otherwise free strings | empty array | yes, after a separately governed user-value normalization policy |
| `preferred_meal_types` | `meal_type` | PostgreSQL `meal_type`: breakfast, lunch, dinner, late_night, snack, other | empty array | yes |
| `disliked_tastes` | `flavor` with negative polarity | normalized but otherwise free strings | empty array | yes, after separately governed normalization |
| `spice_preference` | `spice` | nullable normalized string | null | yes, after separately governed normalization |
| `dining_style` | dining context | nullable string | null | no: not a candidate food-Taste facet |
| `payment_preference` | social logistics | nullable string | null | no |

The snapshot is owner-private and also carries behavioral evidence from canonical current favorites,
ratings, and meal occurrences. Favorites are actions against canonical restaurant/menu identities;
ratings are scalar observations with structured subratings/reasons; meal history records observed meal
type and canonical target identity when one exists. None of those behavioral records is copied into a
public candidate projection. The old denormalized favorite arrays on `taste_profiles` are deliberately
excluded from the live foundation contract.

The catalog previously had only display-oriented free text: `restaurants.category`,
`restaurants.tags`, `menu_categories.name`, and `menu_items.tag_ids`. It had no closed cuisine,
flavor, spice, or candidate meal-type authority, no fact provenance, and no way to represent partial
coverage. Those fields therefore remain catalog/search presentation data and are not promoted into
canonical Taste facts.

## Taxonomy boundaries

REC-B-P0 adds only the four facets already required by the private Taste profile:

- `cuisine`
- `meal_type`
- `flavor`
- `spice`

The existing PostgreSQL `meal_type` vocabulary is reused as the six initial `meal_type` values.
Cuisine, flavor, and spice values remain data-managed and empty until an authoritative operator or
acceptance fixture supplies them; the migration invents no production classification.

The following authorities stay separate:

- Social `social_interest_catalog` and `social_profile_interest_selection` are opt-in public profile
  interests, not private recommendation Taste.
- Meal Context uses the food namespace and
  `meal_buddy_menu_item_food_context_mapping` for explicit discovery context and post-selection card
  derivation. It is not silently copied into a candidate Taste fact.
- Restaurant/category/tag text remains discovery and presentation metadata.
- Social Taste Similarity remains user-to-user comparison over protected Taste snapshots.

A later reviewed relationship may point a candidate Taste value at a canonical food-context key, but
that must be explicit. Matching labels or names is never enough to establish the relationship.

## Truth, lifecycle, and ownership

`candidate-taste-v1` has stable facet/value keys and localized labels in a separate table. Exactly one
taxonomy version is active. Taxonomies, facets, values, and facts use active/retired lifecycle state;
retired data disappears from the active projection without rewriting history.

Every fact targets exactly one restaurant or one canonical menu item and requires one closed
provenance plus a non-empty audit reference:

- `restaurant_verified`
- `admin_verified`
- `provider_imported`
- `canonical_mapping`

There is deliberately no AI-estimated provenance. Restaurant/menu names, districts, free tags, and
keyword guesses cannot create a known fact.

All normalized tables have RLS enabled and no privileges for `anon`, `authenticated`,
`authenticator`, or `service_role`. The NOLOGIN, NOINHERIT, NOBYPASSRLS
`candidate_taste_write_authority` is the future server-side attachment point for restaurant
onboarding, internal curation, corrections, import/backfill, and taxonomy upgrades. No client or
Mobile write API is added.

## Additive projections

The frozen `consumer_public_next_meal_candidates_v1` is unchanged.

`consumer_public_next_meal_candidate_taste_facts_v1` is an authenticated, public-catalog-safe
normalized projection. Each row preserves `candidate_id`, `restaurant_id`, `branch_id`, and
`menu_item_id`, then exposes one active facet/value with scope, provenance, audit reference, and
established time.

Precedence is **facet-level specificity with multi-value support inside the winning scope**. For each
candidate x facet, if the canonical menu item carries ANY active mapping for that facet then only its
menu-scope facts survive and every restaurant-scope fact for that same facet is suppressed; if the
menu item carries none, the restaurant-scope facts inherit. Within the winning scope a facet may hold
several distinct values, duplicates are de-duplicated, and ordering is deterministic.

    restaurant meal_type = lunch,  menu meal_type = dinner              -> dinner
    restaurant cuisine = japanese, menu cuisine = fusion + modern_jp    -> fusion + modern_jp
    restaurant cuisine = japanese, menu cuisine = none                  -> japanese

Mixing scopes for one facet is exactly what this prevents: a restaurant-level `lunch` beside a
menu-level `dinner` is not richer data, it is a contradiction later user-to-meal scoring would have
to guess its way out of. Specificity decides — never recency or provenance rank. A menu item offered
by multiple branches yields distinct branch-offer candidate identities with the same
menu-authoritative facts.

`consumer_public_next_meal_candidate_taste_state_v1` emits exactly one row per live candidate:

- `unknown`: zero of the four active facets is known.
- `partial`: at least one, but not all four, is known.
- `mapped`: all four are known.

It includes deterministic sorted `known_facet_keys` and `unknown_facet_keys`. Unknown is represented
by absence of facts plus explicit coverage state, never by a fabricated taxonomy value. Neither view
contains a user identifier, private Taste field, Social profile field, scoring input, score, rank,
weight, dietary rule, Geo field, or Meal Context inference.

## Development acceptance handoff

Claude Desktop must apply the migration only to the hard-verified Development project and use
synthetic rows clearly prefixed `rec-b-p0-acceptance`. Production must not be addressed.

The fixture must create and then remove:

1. one active test restaurant, published menu, at least two branches, three menu items, available
   branch offers, and current publishable nutrition needed to enter the frozen candidate view;
2. fixture-only cuisine, flavor, and spice values and labels;
3. a fully mapped item (all four facets), a partially mapped item, and an unmapped item;
4. both a restaurant-level inherited fact and menu-item facts with all four approved provenance
   cases represented where practical;
5. the same canonical menu item offered at two branches.

Live acceptance must prove:

- facts and state project deterministically on repeated reads;
- mapped/partial/unknown states and sorted known/unknown arrays are exact;
- the two offers retain distinct candidate/branch identities and no fact leaks to another menu or
  restaurant;
- a mapping without provenance or audit reference is rejected;
- arbitrary values, dual-scope mappings, inactive/retired facts, and client writes are rejected or
  absent as designed;
- `anon` cannot read the projections, `authenticated` can read them, and no private Taste or Social
  profile column is present;
- the pre- and post-fixture output order of `consumer_public_next_meal_candidates_v1` is identical;
- REC-A nutrition results, GEO narrowing, Social Taste Similarity, public Interests, and SR-2G-F/G
  Meal Context behavior are unchanged;
- no user-to-meal comparison or combined recommendation policy exists yet.

Cleanup is mandatory in a `finally` path: delete fixture mappings/labels/values, nutrition and branch
offers, items/categories/menus/branches, and the fixture restaurant. Re-query by the exact prefix and
report zero remaining rows before declaring acceptance.

## Deferred to REC-B

REC-B must separately govern normalization of the private free-string cuisine/flavor/spice values,
policy versioning for user-to-meal comparison, behavior aggregation, explanation/privacy rules, and
composition with the frozen Nutrition authority. No choice of weights or recommendation ordering is
made here.
