# REC-C-P0 Candidate Allergen Data Authority

## Boundary

REC-C-P0 answers which allergen-content facts are canonically known-present for a branch-offer
candidate and how completely that candidate was assessed. It does not decide eligibility, remove or
reorder candidates, produce warnings, or claim that a meal is safe for a person with an allergy.

The sole v1 domain is `allergen_content`: allergenic content arising from intentional ingredients or
additives in the finished menu item. Ingredient avoidance, dietary patterns, lifestyle preferences,
nutrition/medical goals, Taste dislikes, and cross-contact are outside v1. In particular, `不吃海鮮`
is not mapped to fish or crustacean, and `蔬食` is not allergen evidence.

## Canonical vocabulary

Taxonomy `tastkind-allergen-tw-v1`, version `1`, has exactly eleven stable keys. Labels are
presentation only.

| Stable key | zh-TW label |
| --- | --- |
| `crustacean` | 甲殼類 |
| `mango` | 芒果 |
| `peanut` | 花生 |
| `milk` | 牛奶／羊奶 |
| `egg` | 蛋 |
| `tree_nut` | 堅果類 |
| `sesame` | 芝麻 |
| `gluten_containing_cereal` | 含麩質之穀物 |
| `soy` | 大豆 |
| `fish` | 魚類 |
| `sulfites_ge_10mg_per_kg` | 亞硫酸鹽（SO₂ ≥ 10 mg/kg） |

This product taxonomy uses Taiwan's eleven mandatory packaged-food disclosure categories as its
stable baseline. It does not assert that restaurant menu pages have the same legal obligations.

## Source normalization

The governed private source vocabulary is `private-restriction-allergen-v1`, version `1`. The only
private aliases are the exact stable key and exact canonical zh-TW label after NFC normalization and
outer whitespace trimming. Lookup remains case-sensitive. There is no fuzzy match, translation,
keyword inference, semantic similarity, or user ID in the dictionary. Results are `mapped`,
`unmapped`, `source_unknown`, or `facet_disabled`. Existing free-text `dietary_restrictions` rows are
not rewritten and arbitrary `restriction_type`, `label`, or `severity` values stay unclassified.

`menu_items.allergens` remains legacy raw evidence under `legacy-menu-items-allergens-v1`. Exact
authorized mappings are `fish → fish`, `soy → soy`, `egg → egg`,
`wheat → gluten_containing_cereal`, and `peanut → peanut`. `nuts`, `shellfish`, `不吃海鮮`, and every
other unlisted value remain unmapped. Mapping raw text only translates vocabulary; it does not create
a verified fact or coverage assertion. An empty raw array means no trustworthy canonical information.

## Candidate facts and scope

`candidate_allergen_facts` stores known-present facts only. Every fact contains the branch-offer
candidate ID and matching menu item ID, taxonomy identity/version, the fixed `allergen_content`
domain, stable allergen key, approved provenance, nonblank source/audit reference, established time,
and active/retired lifecycle. The composite foreign key prevents cross-menu candidate mismatch.

Facts never inherit from a restaurant. The same canonical menu item offered at two branches has two
candidate identities and remains unknown on a branch that lacks its own assertion. There are no
known-absent rows.

## Coverage and absence

Coverage is domain-specific and branch-offer scoped:

- `unknown`: no trusted assertion says the candidate was systematically assessed against all eleven
  keys. Missing facts are unknown.
- `partial`: some trusted assessment/facts exist, but all eleven keys were not verified. Known-present
  facts remain usable; missing facts are unknown.
- `complete`: an authorized restaurant/admin source attests that intentional ingredients/additives
  were assessed against all eleven v1 keys at the recorded reference and time.

Only `restaurant_verified` and `admin_verified` may declare `complete`. `provider_verified` may
establish a known-present fact or partial evidence, but cannot declare complete in v1. Unknown may be
projected from the absence of an active coverage row and carries no fabricated provenance.

Complete allows a future phase to distinguish an assessed missing key from a key never assessed. It
still does not establish cross-contact safety, shared-equipment safety, contamination absence, recipe
permanence, medical suitability, `allergen-free`, or `safe for allergy`. Cross-contact would require a
separate future domain such as `allergen_cross_contact`.

## Provenance and writes

Known-present provenance is closed to `restaurant_verified`, `admin_verified`, and
`provider_verified`. AI, menu names, images, keywords, Taste, cuisine, and Meal Context are not
approved provenance. Every known fact and every non-unknown coverage assertion requires a nonblank
source/audit reference and timestamp.

`candidate_allergen_write_authority` is `NOLOGIN`, `NOINHERIT`, and `NOBYPASSRLS`. Base authority
tables have RLS and no client/service mutation grants. A future restaurant/admin/provider flow must
attach through a reviewed server authorization layer; Mobile, anon, and authenticated clients cannot
set facts, provenance, audit references, or complete coverage directly. No admin UI is part of P0.

## Projections and privacy

The authenticated facts projection exposes only candidate/restaurant/branch/menu identity,
taxonomy identity/version, domain, and allergen key. The authenticated coverage projection emits
exactly one row per current recommendation candidate with `unknown`, `partial`, or `complete`.
Neither projection exposes user restrictions, severity, health information, audit references,
writer internals, a compatibility value, a safety boolean, or a recommendation score.

Both projections are additive. REC-A, REC-B Lane A/Lane B/interleave, Taste, Nutrition, GEO, Meal
Context, Social Taste, and Public Interests remain byte-identical and do not read these projections.

## Claude Development acceptance handoff

Use synthetic Development-only branch offers and clean them up completely. Cover known crustacean,
known peanut, multiple allergens, the five authorized legacy raw mappings, unmapped `nuts` and
`shellfish`, unknown/partial/complete coverage, provider-complete rejection, invalid provenance,
missing source reference, retired taxonomy/mapping, anon/authenticated write denial, branch-offer
isolation, no restaurant inheritance, deterministic projection, unchanged REC-B order, and zero
residue. Synthetic fixtures must never be represented as restaurant truth. Production must never be
addressed.

## Deferred REC-C decisions

REC-C still owns user-specific intersection, conflict/verification semantics, hard exclusion or
warning policy, allowed exposure, UX wording, and all medical-safety boundaries. General ingredients,
dietary patterns, preferences, health goals, and cross-contact require separate future authority.
