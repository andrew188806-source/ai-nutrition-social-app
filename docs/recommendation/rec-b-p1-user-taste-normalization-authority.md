# REC-B-P1 User Taste Normalization Authority

Status: local freeze candidate. Production is forbidden. REC-B-P1 normalizes explicit private
Taste vocabulary only; it does not score, rank, filter, or reorder a recommendation.

## Source reconnaissance and product authority

The live owner-private `taste_profiles` source still stores `preferred_cuisine_tags text[]`,
`disliked_tastes text[]`, and nullable `spice_preference text`. Its snapshot mapper applies Unicode
NFC, trim, deduplication, and deterministic sorting, but historically had no closed value identity.
There is no live private Taste profile write UI: Community Card spice choices are in-memory Social
settings, restaurant cuisine choices are explicit Discovery filters, public food Interests are a
separate opt-in Social authority, and mock/design-handoff strings are not Production vocabulary.
Consequently P1 freezes a validator/write contract without creating a new settings screen.

The product-authorized source vocabularies are:

- `private-taste-cuisine-v1`, version `1`, facet `cuisine`: `taiwanese`, `japanese`, `korean`,
  `chinese`, `hong_kong_cantonese`, `thai`, `vietnamese`, `southeast_asian`, `indian`, `italian`,
  `french`, `american`, `mexican`, `mediterranean`, `middle_eastern`, `fusion`.
- `private-taste-flavor-v1`, version `1`, facet `flavor`: `sweet`, `salty`, `sour`, `bitter`,
  `umami`, `smoky`, `creamy`, `fermented`.
- `private-taste-spice-v1`, version `1`, facet `spice`: `none`, `mild`, `medium`, `hot`.

Existing PostgreSQL `meal_type` remains direct canonical compatibility and has no redundant source
vocabulary or mapping.

Cuisine is cultural food style only. Hotpot, BBQ/yakiniku, brunch, cafe, ramen, and sushi stay in
Discovery, Meal Context, or menu taxonomy as appropriate. Flavor is sensory identity only: it is not
an ingredient, allergen, texture, cooking method, restriction, or safety claim.

## Canonical target completion and aliases

The 28 authorized cuisine/flavor/spice keys are added to `candidate-taste-v1`; their localized
labels remain separate. No row is added to `candidate_taste_mappings`, so taxonomy availability does
not make any restaurant or menu item known.

Every source value has exactly two active v1 mappings:

1. the exact stable source key;
2. the exact authorized `zh-TW` source label.

Lookup normalizes only Unicode NFC and surrounding whitespace and then performs a case-sensitive
exact comparison. There is no lowercasing, fuzzy match, edit distance, implicit translation,
keyword inference, or LLM path. `日式`, `日本菜`, `小辣`, `辣一點`, and `奶味重` remain unmapped.
Legacy free strings remain stored unchanged; normalization never rewrites a profile row.

New profile writes must pass the shared validator and persist a stable source key. A localized label
may resolve for a legacy read but cannot pass the stable-key write contract.

## Governed data model

`private_taste_normalization_policies` versions the active normalization rule and pins its target
taxonomy. `private_taste_source_vocabularies`, `private_taste_source_values`, and
`private_taste_source_value_labels` separate stable source identity from display text.
`private_taste_normalization_mappings` records each exact alias-to-target relationship with source
and target facets, existing closed provenance, audit reference, and active/retired lifecycle.

Composite foreign keys and `source_facet = target_facet` make cross-facet normalization impossible.
The active-alias unique index makes one lookup deterministic. Retired vocabularies, values, policies,
mappings, or target values disappear from authenticated read projections.

The explicit spice semantic order is stored in `candidate_taste_spice_order`:

| Stable key | Ordinal | Private profile label | Candidate label |
| --- | ---: | --- | --- |
| `none` | 0 | 不辣 | 不辣 |
| `mild` | 1 | 微辣 | 微辣 |
| `medium` | 2 | 中辣 | 中辣 |
| `hot` | 3 | 愛吃辣 | 重辣 |

The ordinal is semantic identity only. P1 defines no distance, coefficient, penalty, or ranking.

## Privacy, read contract, and write authority

`consumer_private_taste_source_values_v1` and
`consumer_private_taste_normalization_dictionary_v1` are authenticated, read-only vocabulary
views. They contain no user ID, profile row, candidate ID, favorite, rating, history, goal, Social
compatibility, location, score, or rank. There is no normalized-user projection.

All normalization base tables have RLS and no client/runtime privileges. The sealed `NOLOGIN`,
`NOINHERIT`, `NOBYPASSRLS` `private_taste_normalization_write_authority` is the future curation and
alias-correction attachment point. Existing `candidate_taste_write_authority` governs the target
spice-order metadata. Neither role is granted to `anon`, `authenticated`, `authenticator`,
`service_role`, Mobile, or Social runtime roles.

The pure shared resolver returns `mapped`, `unmapped`, `source_unknown`, or `facet_disabled`.
Mapped results carry vocabulary/policy/taxonomy/facet/key identity and optional semantic ordinal;
they carry no user, candidate, score, or order.

## Authority separation

- Favorites, ratings, and meal history remain behavioral evidence and are not normalized.
- Social Taste remains user-to-user only.
- Public Interests remain public/Social only.
- Meal Context remains explicit Discovery context and post-selection Meal Buddy derivation.
- REC-A Nutrition, GEO narrowing, and REC-C restrictions are unchanged.

## Claude Development acceptance handoff

Claude Desktop must first hard-verify the Development project. Production must never be addressed.
Use a transaction or `finally` cleanup and clearly prefixed `rec-b-p1-acceptance` fixtures only.

Acceptance must prove:

1. the active source views expose exactly 16 cuisine, 8 flavor, and 4 spice stable keys with the
   authorized labels, while candidate target values expose the corresponding 28 keys;
2. stable keys and exact `zh-TW` labels resolve to the same target key after NFC/trim;
3. `日式`, `日本菜`, `小辣`, `辣一點`, `奶味重`, case variants, and arbitrary text stay unmapped;
4. retiring a fixture-only mapping removes it from the active dictionary without changing the
   source value or profile row;
5. cross-facet insertion, duplicate active aliases, missing provenance/audit reference, and invalid
   alias shapes are rejected;
6. spice ordinals are exactly `none=0`, `mild=1`, `medium=2`, `hot=3`, independent of labels and
   lexical/insertion order;
7. `anon`, `authenticated`, `authenticator`, and `service_role` cannot mutate any base authority;
8. neither authenticated view contains user/private/candidate/recommendation columns;
9. candidate mapping count is identical before and after acceptance, all existing candidate coverage
   states and recommendation order are unchanged, and no Taste scoring contract exists;
10. REC-A, GEO, Social Taste, public Interests, restrictions, and SR-2G-F/G Meal Context behavior
    remain unchanged.

Cleanup must retire/delete only fixture-created aliases and re-query the exact fixture prefix to
report zero remaining rows. The authorized P1 seeds are authority, not acceptance fixtures, and must
not be deleted.

## Deferred to REC-B

REC-B still owns per-facet match treatment, disliked-flavor soft policy, spice ordinal distance
semantics, weights, missing-data coverage policy, Nutrition composition, explanations, and final
deterministic recommendation ordering. Behavioral aggregation remains a separate later authority.
