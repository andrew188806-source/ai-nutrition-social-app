# REC-D — Governed Ingredient Avoidance Eligibility Activation

Status: local development candidate. Production remains forbidden.

REC-D activates binary recommendation eligibility for the separate `我不吃的食物` authority. It does not add settings, candidate facts, schema, a migration, a score, a ranking lane, or a safety/religious claim.

## Frozen inputs

- User authority: `read_authenticated_ingredient_avoidance_settings_v1()` from REC-D-P1.
- Exact keys: `pork`, `beef`, and `coriander` only.
- Candidate authority: REC-D-P0 authenticated facts and coverage for `ingredient_avoidance_content` under `tastkind-ingredient-avoidance-v1@1`.
- Identity: exact branch-offer candidate, restaurant, branch, and menu-item tuple.

No legacy restriction text, labels, menu names, cuisine, Taste, Social, Allergy, GEO, Meal Context, Nutrition, keywords, or model inference may create Ingredient Avoidance evidence.

## Policy

Policy `tastkind.ingredient_avoidance.content_eligibility@1` is binary and pre-ranking:

- any known-present active-key conflict is excluded;
- unknown coverage is excluded;
- partial coverage is excluded;
- complete coverage with no known conflict is eligible;
- no active governed keys with zero unresolved selections is neutral and does not read candidate evidence;
- unresolved governed settings or unavailable settings/evidence fail closed.

Pipeline order is acquisition, optional GEO, REC-C Allergy, REC-D Ingredient Avoidance, REC-A Nutrition, REC-B Taste, entitlement, then presentation. Excluded candidates never re-enter. A valid GEO empty result remains empty. A REC-D empty result remains an honest applied empty result without widening or fallback.

REC-D does not change survivor scoring or ordering. Coverage proves only the completeness of the frozen domain assessment; it does not imply halal, religious compliance, vegetarian status, safety, absence of cross-contact, or medical suitability.

## Privacy and downstream boundaries

Recommendation output carries only coarse application status and policy identity. Raw selected keys, candidate facts, coverage, provenance, and audit references do not enter public DTOs, Profile, Social, Public Interests, Today Intake, Meal Buddy, restaurant surfaces, or analytics. Canonical selected-candidate meal write and Meal Buddy handoff remain unchanged.

No migration is added. Every frozen REC-C-P0, REC-C-P1, REC-D-P0, and REC-D-P1 migration byte remains unchanged. No deployment or Production operation is authorized.
