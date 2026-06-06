# Product Flow

## Product Story

The MVP has two equal first-priority strengths:

- AI nutrition calculation.
- Contextual social eating discovery.

The intended loop is:

1. User selects or uploads a meal.
2. AI nutrition analysis estimates calories, macros, ingredients, tags, and health-goal alignment.
3. A meal record is created in Food Memory.
4. The meal result screen ends the immediate flow naturally.
5. A delayed feedback prompt appears later in demo form.
6. After quick rating, note, and revisit intent, the app unlocks next-meal recommendation, restaurant recommendation, nearby matching, Community Card, meal buddies, and optional four-person tables.

Social discovery is contextual. The app should not auto-refresh random daily people lists. Meal buddy recommendations are generated only when the user intentionally taps actions such as:

- Â∞ãÊâæÈ£ØÂ?
- ?πÊ??ôÈ??æÈ£Ø??- ?æ‰?Ëµ∑Â??Ñ‰∫∫
- ?πÊ??ôÈ?È§êÂª≥?æÈ£Ø??
Matching priority is same restaurant overlap, health goal compatibility, tag compatibility, then nearby status.

## Community Card

Community Card is a food-social matching profile, not a social feed or Instagram-style wall.

It should be created from:

- Meal records.
- Health goals.
- Food preference tags.
- Social intent.
- Nearby status.
- Meal payment preference.

Free users see semi-anonymous identity, limited profile visibility, limited interactions, and fewer compatibility details.

Premium users see richer profile preview, stronger compatibility explanations, more recommendations, and expanded unlocks.

## Final Mobile IA

Bottom navigation is:

- È¶ñÈ?
- AI?ÜÊ?
- È£ØÂ?
- È§êÂª≥
- ?ëÁ?

AI?ÜÊ? remains a primary navigation item because nutrition calculation is a first-priority core system.

Nearby matching is not a separate main tab. It is reached through È£ØÂ?, È§êÂª≥, completed AI analysis, Community Card, and restaurant-triggered matching.

Meal records are not a separate tab. Food Memory, nutrition history, delayed feedback, restaurant notes, and health goal tracking appear in È¶ñÈ? and ?ëÁ?.

Direct meal buddy search is preserved as a secondary shortcut. If recent meal analysis exists, matching uses recent restaurants, meal tags, health goals, distance, and cuisine preferences. If no recent analysis exists, the app still allows direct search but explains that completing meal analysis improves precision.

## Correction UX

Ingredient correction uses inline row expansion.

Rules:

- Only the selected row expands.
- Users can confirm inline and refresh the nutrition summary.
- Missing ingredients can be added inline.
- No full-page editor.
- No giant spreadsheet-style form.

External dining has two correction levels:

- Level 1: meal-level record saved to the user's Food Memory and meal history.
- Level 2: AI ingredient breakdown rows for ingredient, portion, and cooking-method correction.

Self-cooked mode shows ingredient-level correction immediately because users expect to edit ingredients, portions, and cooking methods.

## External Dining Cost Control

External dining uses database-first nutrition matching by default. The app should identify restaurant, meal name, meal category, user history, tags, similar menu records, restaurant menu data, known nutrition records, Food Memory, and mock nutrition datasets before using AI-assisted ingredient breakdown.

Ingredient breakdown is on-demand only. It appears only after the user intentionally taps Ë£úÂ?È§êÈ?Ë≥áÊ?, ?∞Â?È£üÊ?, or ‰øÆÊ≠£. This reduces image-analysis cost, token usage, and repeated inference cost while keeping nutrition calculation central.

Repeated restaurant meals should reuse cached or stored nutrition estimates whenever possible. AI breakdown is reserved for edge cases, missing menu data, or user-requested corrections.

## Data Separation

External dining correction contributes to both:

- Shared AI ingredient analysis training.
- Restaurant/menu nutrition intelligence.

External dining corrections from the consumer app should save to Food Memory, user meal history, and the shared AI ingredient analysis training module. They should not directly overwrite restaurant nutrition profile, restaurant nutrition cache, menu nutrition cache, or restaurant/location context. Restaurant-owned data should be updated from the restaurant dashboard or future verified restaurant workflows.

Self-cooked correction contributes to:

- Shared AI ingredient analysis training.
- Personal nutrition estimation.

Self-cooked corrections should save only to Food Memory, user meal history, the shared AI ingredient analysis training module, and reusable ingredient estimation patterns.

Self-cooked meals must never write into restaurant nutrition profile, restaurant nutrition cache, restaurant/location context, or menu nutrition cache. Keeping these flows separate saves storage, prevents polluted restaurant nutrition intelligence, and improves data quality.

## Architecture Intent

The mobile app should keep route files thin. Feature-specific state, data helpers, and UI panels should live under feature modules.

Current AI analysis module boundaries:

- `apps/mobile/app/analysis.tsx`: route composition and demo flow.
- `apps/mobile/features/analysis/useAnalysisCorrectionState.ts`: local mock state and correction transitions.
- `apps/mobile/features/analysis/analysisCorrectionData.ts`: correction section builders and mock recalculation helpers.
- `apps/mobile/features/analysis/AnalysisCorrectionPanels.tsx`: reusable external dining and self-cooked correction panels.
- `apps/mobile/features/analysis/types.ts`: analysis/correction types.

Future backend replacement should preserve these boundaries: swap the hook/helper internals first, then replace mock data with Supabase or API calls.
