# REC-C-P1 Governed User Allergy Settings

## Boundary

REC-C-P1 establishes a trustworthy private current-user Allergy setting and writer boundary. It does
not filter, score, reorder, or label recommendation candidates. REC-B, GEO, Nutrition, Taste, Meal
Context, Today Intake, and Meal Buddy remain behaviorally unchanged.

The user-facing path is **個人設定 → 飲食限制・過敏原**. It is a checklist containing exactly the
eleven `tastkind-allergen-tw-v1` values. Stable keys are identity; the frozen zh-TW labels are
presentation only. There is no free-text Allergy input, severity picker, diagnosis, safety badge, or
non-allergen dietary rule.

## Governed identity and legacy rows

`dietary_restrictions` carries the nullable tuple `source_vocabulary_id`,
`source_vocabulary_version`, and `source_value_key`. All three columns are null or all three are
present. The complete tuple references REC-C-P0's `private_restriction_allergen_source_values`.

Rows with a null tuple remain legacy/unclassified. They are not backfilled or reinterpreted even if
their text says `allergy`, `peanut`, `fish`, `shellfish`, `花生`, or `不吃海鮮`. Existing
`restriction_type`, `label`, and `severity` remain compatibility text and never establish Allergy
identity. Separate partial uniqueness preserves legacy behavior while ensuring matching legacy text
cannot block a governed selection.

## Private read and write boundary

Mobile sends only the selected stable source keys to
`replace_authenticated_allergy_settings_v1(text[])`. The security-definer function derives the
actor only from `auth.uid()`, fixes the P0 vocabulary/version/domain and normalization policy on the
server, rejects duplicate or inactive values before mutation, locks per actor, and atomically
replaces that actor's governed v1 selections. An empty array deselects all governed v1 selections.

`read_authenticated_allergy_settings_v1()` is the canonical current-user reader. It returns only
normalized canonical allergen keys and a coarse unresolved-selection count. Legacy text and private
compatibility fields are absent. If a governed vocabulary, source value, mapping, policy, taxonomy,
or target value becomes retired or unresolvable, the row contributes to the unresolved count rather
than disappearing as if no allergy had been selected.

Authenticated and anonymous clients have no direct mutation grant. Owner privacy remains enforced
by existing RLS. A restrictive successor policy excludes governed Allergy rows from the frozen
Social authorized-pair reader, and Mobile Taste foundation explicitly reads only null-source legacy
rows. No public, Social, Meal Buddy, Public Interests, Taste, restaurant, or recommendation DTO gains
Allergy data.

## Product wording

The settings surface explains that recommendation filtering will use confirmable meal data and that
restaurant ingredients and cross-contact can change. It makes no guarantee of safety, allergen-free
status, medical suitability, or zero risk.

## Development acceptance

Use controlled Development-only users and remove every fixture. Prove governed peanut persistence;
milk and egg multi-select; stable-key readback after refresh; exact one-key deselection; legacy
`peanut` and `restriction_type = allergy` remaining unclassified; rejection of unauthorized source
identity; cross-user isolation; no public/Social exposure; P0 normalization; detectable retired
settings; byte-equivalent REC-B output/order; and zero residue. Production must never be addressed.
