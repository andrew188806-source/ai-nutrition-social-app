# 03_AI README

## Purpose
This section defines how Haocu uses AI across food recognition, nutrition estimation, taste personalization, restaurant recommendation, Meal Buddy matching, and future data products.

The primary product position is **database-first, human-correctable, explainable AI**. Haocu should never imply that a single food photo can produce clinically precise nutrition results. Instead, AI should reduce user effort, ask for corrections when confidence is low, and improve the structured food database over time.

## AI Scope
The MVP AI system supports:

1. Food photo recognition and candidate dish generation.
2. Restaurant/menu database lookup before visual estimation.
3. Nutrition estimation with confidence ranges.
4. User correction and feedback storage.
5. Next-meal recommendation based on daily intake and preference.
6. Restaurant recommendation based on taste memory, location, meal context, and nutrition fit.
7. Meal Buddy compatibility signals based on meal intent, schedule, diet style, and social settings.

Post-MVP AI may support:

- Multi-photo analysis per meal.
- Similar-user taste embeddings.
- Restaurant-side AI menu nutrition support.
- Household meal planning.
- Supply/demand prediction for restaurant surplus and ESG workflows.

## Key Principles

| Principle | Meaning |
|---|---|
| Database first | Prefer verified restaurant/menu data over image-only estimation. |
| Correctable | Users can edit dish, ingredients, portion, cooking method, and nutrition assumptions. |
| Confidence-aware | AI should expose uncertainty internally and avoid false precision in UI. |
| Health-safe | AI gives general nutrition guidance, not diagnosis or clinical treatment. |
| Privacy-aware | AI features use minimum required personal data and respect consent boundaries. |
| Product-connected | AI outputs must connect to meal records, recommendations, diary, and Meal Buddy flows. |

## File Map

- `001_AI_STRATEGY.md` — AI product strategy, phases, and non-goals.
- `002_FOOD_RECOGNITION_PIPELINE.md` — photo-to-dish recognition flow.
- `003_NUTRITION_ESTIMATION.md` — nutrition calculation logic and confidence handling.
- `004_PERSONALIZATION_ENGINE.md` — profile, preference, and taste memory design.
- `005_RECOMMENDATION_AI.md` — next meal, restaurant, and social recommendation logic.
- `006_AI_SAFETY_BOUNDARIES.md` — health, claim, and legal safety limits.
- `007_AI_EVALUATION.md` — quality metrics and test plan.
- `008_DATABASE_FIRST_AI_POLICY.md` — structured data lookup policy.
- `009_TASTE_MEMORY_AND_EMBEDDING.md` — long-term taste model design.
- `010_AI_PROMPTING_AND_MODEL_ORCHESTRATION.md` — model orchestration and prompt boundaries.
- `011_FEEDBACK_LOOP_AND_CORRECTIONS.md` — correction-to-learning loop.
- `012_AI_MONITORING_AND_COST_CONTROL.md` — cost, latency, observability, and abuse prevention.
- `013_AI_BACKLOG.md` — implementation backlog.

## Cross References

- PRD: `02_PRD/002_AI_ANALYSIS_PRD.md`, `02_PRD/004_RECOMMENDATION_PRD.md`, `02_PRD/005_MEAL_BUDDY_PRD.md`
- Data: `04_Data/008_NUTRITION_SCHEMA.md`, `04_Data/009_AI_ANALYSIS_SCHEMA.md`
- UI: `05_UI/004_AI_ANALYSIS_UI.md`, `05_UI/009_FOOD_DIARY_UI.md`
- Backend: `08_Backend/`
- Compliance: `14_Compliance/`
