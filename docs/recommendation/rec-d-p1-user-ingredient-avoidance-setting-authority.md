# REC-D-P1 governed user ingredient-avoidance settings

REC-D-P1 activates only 個人設定 → 飲食限制 → 我不吃的食物. It stores explicit private
selections and provides one current-user reader/writer boundary. It does not activate 飲食方式,
change recommendations, or reinterpret Allergy. Production remains forbidden.

## Separate persistent architecture

The frozen REC-C-P1 `dietary_restrictions_governed_source_fk` continues to reference only
`private_restriction_allergen_source_values`. Its migration is byte-identical and is not generalized.

REC-D-P1 instead creates `private_user_ingredient_avoidance_settings`, whose exact composite FK is:

`(source_vocabulary_id, source_vocabulary_version, source_value_key)`
→ `private_ingredient_avoidance_source_values`

The server fixes the tuple to `private-ingredient-avoidance-v1@1`. The frozen target taxonomy remains
`tastkind-ingredient-avoidance-v1@1`, with only `pork`, `beef`, and `coriander`. A unique constraint
allows each user one row per governed value while different users remain independent. There is no
free-text identity, reason, religion, ethics, medical reason, severity, or public visibility column.

Legacy `dietary_restrictions` rows—including `pork`, `beef`, `coriander`, `不吃豬`, `不吃牛`,
`不吃香菜`, `avoidance`, and `dietary`—remain legacy/unclassified. No backfill, label matching,
`restriction_type`, or severity conversion exists.

## Canonical current-user boundary

`replace_authenticated_ingredient_avoidance_settings_v1(text[])` accepts stable source keys only.
It derives the actor from `auth.uid()`, fixes every authority identity server-side, rejects null,
blank, duplicate, over-limit, unknown, inactive, retired, or unresolvable keys, serializes by actor,
and atomically replaces only that actor's REC-D v1 rows. Empty input clears only REC-D selections;
Allergy and legacy rows are untouched.

`read_authenticated_ingredient_avoidance_settings_v1()` returns the fixed source/taxonomy identity,
active canonical keys, and `unresolved_selection_count`. Retired or otherwise unresolvable governed
rows remain counted rather than silently becoming absence. No user id, legacy text, reason, religion,
Allergy setting, or severity is returned.

The table has forced RLS owner isolation and direct privileges are revoked from public, anon,
authenticated, authenticator, and service roles. Authenticated clients can execute only the two
security-definer RPCs. Actor identity is never a client parameter. No Social, Taste, Public Interest,
Meal Buddy, candidate, or public projection receives access.

## Mobile settings surface

The separate `/ingredient-avoidance-settings` route reuses the established settings presentation
pattern without sharing Allergy repository/controller authority. It renders exactly three checklist
options with presentation labels 豬肉／豬來源成分, 牛肉／牛來源成分, and 香菜. Selection changes are
local until explicit Save. Save uses the canonical writer; refresh/reopen uses the canonical reader.
Load/save failures cannot display success, and unresolved rows are shown truthfully and block an
unsafe replacement until the user can reconfirm.

The copy makes no safety, guarantee, religious-compliance, or identity claim. Choosing pork means
only “this user explicitly avoids pork”; it does not infer why.

## Frozen behavior

REC-D-P1 is settings authority only. It is not injected into the recommendation repository and cannot
exclude candidates, alter REC-C Allergy eligibility, change REC-A Nutrition ordering, change REC-B
Taste/composition ordering, alter GEO/Lane/entitlement, or affect Today Intake or Meal Buddy. Taste
and Social cannot consume the separate table because neither receives table privileges or a reader.

## Claude Development acceptance handoff

Using the actual Mobile route and writer, Development acceptance must prove: pork save/readback;
pork+coriander multi-select; pork deselection leaving coriander; empty clear leaving Allergy intact;
legacy `pork`/`不吃豬` unclassified; invalid/localized values rejected; Actor A/B isolation;
retired source produces unresolved count; no Social/Taste/public exposure; unchanged REC-C behavior;
unchanged REC-B order; real Save failure never fakes success; and zero-residue fixture cleanup.

REC-D activation remains future work: it may consume these settings with REC-D-P0 candidate facts and
coverage to define fail-closed eligibility/warning behavior. No ranking authority is granted here.
