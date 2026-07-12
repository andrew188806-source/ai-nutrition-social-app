# 001 Mobile / AI / Meal Record Workstream

## Goal

Make the core meal loop reliable: analyze → choose/correct → save → show in all nutrition surfaces → update recommendation.

## Source Docs

- `07_SOURCE_REFERENCES/02_PRD/001_MOBILE_APP_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/002_AI_ANALYSIS_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/003_MEAL_RECORD_PRD.md`
- `07_SOURCE_REFERENCES/03_AI/002_FOOD_RECOGNITION_PIPELINE.md`
- `07_SOURCE_REFERENCES/03_AI/003_NUTRITION_ESTIMATION.md`
- `07_SOURCE_REFERENCES/04_Data/003_MEAL_RECORD_SCHEMA.md`
- `07_SOURCE_REFERENCES/04_Data/009_AI_ANALYSIS_SCHEMA.md`
- `07_SOURCE_REFERENCES/05_UI/004_AI_ANALYSIS_UI.md`
- `07_SOURCE_REFERENCES/09_Frontend/001_MOBILE_FRONTEND.md`

## Build Order

1. Stabilize AI analysis route.
2. Define `AnalyzeMealRequest` / `AnalyzeMealResponse` and save-ready DTO.
3. Implement candidate selection and manual correction.
4. Save confirmed result to meal record collection.
5. Replace all nutrition surfaces to read from same data source.
6. Add next-meal recommendation context update.

## Acceptance

- One user can save multiple same-day meals.
- Today summary, Today Intake detail, full nutrition report, and Food Diary agree.
- Correction persists and does not reset after navigation.
- AI output is labeled as estimate/verified/user-corrected where applicable.
