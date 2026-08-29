# REC-D-P0 candidate ingredient-avoidance data authority

REC-D-P0 establishes truthful candidate-side data for 「我不吃的食物」. It is additive data
authority only: no user setting is written, no candidate is excluded, no warning is selected, and no
Nutrition, Taste, GEO, Meal Context, Social, entitlement, Today Intake, or Meal Buddy behavior changes.
Production remains forbidden.

## Exact domain and vocabulary

The fact domain is `ingredient_avoidance_content`. Its one active taxonomy is
`tastkind-ingredient-avoidance-v1`, version 1, with exactly these stable identities:

| Stable key | zh-TW presentation label | Known-present meaning |
| --- | --- | --- |
| `pork` | 豬肉／豬來源成分 | Trusted evidence establishes intentional pork meat or pork-derived content in this candidate. |
| `beef` | 牛肉／牛來源成分 | Trusted evidence establishes intentional beef meat or beef-derived content in this candidate. |
| `coriander` | 香菜 | Trusted evidence establishes intentional coriander/cilantro in this candidate. |

Names, descriptions, cuisine, garnish conventions, restaurant identity, and image/keyword/LLM output
never establish these facts. Labels are presentation, not identity. No fourth key exists in v1.

These are not allergens. `tastkind-allergen-tw-v1` and every REC-C behavior remain frozen. An
ingredient-avoidance fact stores no reason, religion, ethics, or preference category. A missing pork
fact never means halal, halal-certified, religiously compliant, or suitable for Muslims. Likewise,
facts or their absence make no vegetarian, vegan, safety, or cross-contact claim.

## Repository source reconnaissance

The baseline inspection classified existing fields as follows:

- **A — governed candidate fact source:** none. No current source combines trusted provenance,
  audit time/reference, and exact branch-offer/menu composition authority.
- **B — legacy raw evidence:** `ingredients` and `menu_item_ingredients` are structured menu-level
  nutrition inputs. Their rows can include AI estimates and do not preserve branch-offer composition;
  they are not silently promoted. `menu_items.allergens` remains REC-C legacy allergen evidence only.
- **C — presentation only:** menu item names/descriptions, branch descriptions, menu tags,
  restaurant tags, and mock display strings. They may describe food to people but establish no fact.
- **D — unsuitable:** restaurant-wide/cuisine inference, AI/image/keyword output, public interests,
  Social/Taste evidence, Meal Context, user meal records, and self-cooked ingredient text.

The v1 legacy raw normalization result is therefore **zero aliases and zero canonical fact imports**.
No fuzzy, substring, case-folded, translated, or speculative mapping exists.

The future private source vocabulary is `private-ingredient-avoidance-v1`, version 1, with only
`pork`, `beef`, and `coriander`. Its policy maps exact NFC-trimmed stable keys only. Presentation
labels are not accepted as source aliases. P0 creates no user rows or settings UI.

## Facts, scope, and coverage

Every canonical fact means known present and requires approved provenance (`restaurant_verified`,
`admin_verified`, or `provider_verified`), a nonblank source reference, and an established timestamp.
Facts use the exact `(branch_menu_items.id, menu_item_id)` pair. Restaurant-wide inheritance and
cross-branch collapse are structurally impossible. The same menu item at another branch stays unknown
unless that branch offer receives its own governed evidence.

Coverage is separate and applies only to `ingredient_avoidance_content`:

- `unknown`: no trusted systematic v1 assessment; missing keys prove nothing.
- `partial`: some trusted knowledge exists; known-present facts are usable and other keys stay unknown.
- `complete`: restaurant/admin authority explicitly assessed all active v1 keys at the recorded source
  and time. Provider evidence cannot declare complete.

Complete with no fact for a queried key can later be distinguished from unverified coverage, but P0
does not act on that distinction. REC-C `allergen_content = complete` says nothing about these keys,
and REC-D complete says nothing about any allergen.

## Sealed writes and projections

The `candidate_ingredient_avoidance_write_authority` role is `NOLOGIN`, `NOINHERIT`, and
`NOBYPASSRLS`. RLS-protected base tables revoke direct access from public, anon, authenticated,
authenticator, and service roles; only the sealed authority role receives CRUD. Future verified
restaurant/admin/provider server workflows must enter through that explicit role boundary.

Authenticated clients receive only two read-only projections:

- `consumer_authenticated_candidate_avoidance_facts_v1`: candidate identity plus known-present key.
- `consumer_authenticated_candidate_avoidance_coverage_v1`: candidate identity plus domain coverage.

They expose no provenance internals, audit references, user data, reason, religion, compatibility,
known-absent flag, safety claim, score, or rank. Anonymous clients receive neither projection.

## Claude Development acceptance handoff

Development acceptance should exercise the exact three-key vocabulary; separate pork, beef, and
coriander known-present cases; unknown, partial, and complete coverage; provider-complete rejection;
invalid provenance; missing source reference; branch isolation; no restaurant inheritance; independent
allergen coverage; no halal/religious conclusion; anon/authenticated write denial; and byte-identical
REC-C eligibility plus REC-B ordering for identical inputs.

Use disposable fixtures only. After every scenario, retire/delete fixture facts and coverage, remove
temporary identities, stop the disposable cluster, and verify zero residue. Do not address Production.

REC-D-P1 remains responsible for the governed private user writer and settings surface. A later REC-D
activation may define eligibility, warnings, and UX. Ranking authority is not granted by this phase.
