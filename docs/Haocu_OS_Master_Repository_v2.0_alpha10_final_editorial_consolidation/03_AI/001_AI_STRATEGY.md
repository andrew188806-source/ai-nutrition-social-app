# AI Strategy

## Executive Summary
Haocu's AI strategy is to become a **personal food intelligence layer for Taiwanese outside-food users**. The AI system should not merely identify food; it should help users understand what they ate, remember what they liked, recommend what to eat next, and connect them to compatible meal companions.

The defensible long-term value is not a generic food-recognition model. The moat is the combination of:

1. Corrected food-photo records.
2. Restaurant/menu structured data.
3. Personal taste memory.
4. Nutrition preference history.
5. Social dining interaction data.
6. Restaurant-side supply and menu metadata.

## Product Thesis
Most nutrition apps fail outside-food users because manual logging is too heavy and generic calorie estimates do not understand local restaurants, portion habits, or personal taste. Haocu should use AI to make the first estimate fast, then use correction loops and restaurant data to make future estimates better.

## AI Roles in Haocu

### 1. Meal Understanding
AI identifies likely dish candidates from a photo, menu context, restaurant context, and user history. It outputs a ranked candidate list rather than a single absolute answer.

### 2. Nutrition Estimation
AI estimates calories and macro/micro nutrition from a mix of structured menu data, ingredient assumptions, portion size, and cooking method.

### 3. Recommendation
AI recommends the next meal or restaurant by balancing daily intake, user goals, past ratings, location, meal time, and available restaurants.

### 4. Social Matching
AI generates compatibility signals for Meal Buddy recommendations based on meal intent, food preference, schedule, budget, social comfort, and dining style.

### 5. Restaurant Intelligence
Post-MVP, AI helps restaurants produce nutrition disclosure, upload menu items, and understand demand patterns.

## MVP AI Capabilities

| Capability | MVP Status | Notes |
|---|---:|---|
| Single-photo meal analysis | Required | Supports camera and upload. |
| Candidate dish list | Required | Top 3 candidates plus manual entry path. |
| Database-first lookup | Required | Restaurant/menu data wins over image-only inference. |
| User correction | Required | Dish, ingredient, portion, cooking method, nutrition. |
| Daily nutrition summary | Required | Used by home and food diary. |
| Next-meal recommendation | Required | Based on current day intake and context. |
| Restaurant recommendation | Required | Demo-friendly and location-aware. |
| Meal Buddy card generation | Required | Analysis result can create a Meal Buddy card. |
| Multi-photo per meal | Deferred | Data model ready; UI post-MVP. |
| Clinical nutrition plan | Excluded | Requires medical/professional review. |

## Post-MVP AI Capabilities

- Multi-photo before/after meal capture.
- Long-term taste embeddings.
- Similar-user recommendation network.
- Personal ranking model for restaurants.
- Household nutrition gap planning.
- Restaurant demand forecasting and surplus prediction.
- AI-assisted restaurant admin nutrition disclosure.

## Differentiation

Haocu should not compete as a generic calorie counter. It should compete as:

1. **Personal taste-aware restaurant recommendation** — more relevant than public star ratings.
2. **Correctable local food intelligence** — more practical than one-shot photo recognition.
3. **Nutrition + social loop** — meal records turn into social dining opportunities.
4. **Restaurant data flywheel** — more structured menu data improves consumer AI and restaurant value.

## Non-Goals

- Medical diagnosis.
- Treatment recommendations.
- Eating disorder intervention without professional workflow.
- Weight-loss guarantees.
- Exact claims such as “this photo has exactly 623 kcal.”
- Unreviewed supplement or medical product advertising.

## Strategic Decisions

| Decision | Rationale |
|---|---|
| Use database-first analysis | Verified structured menu data should be more reliable than image-only estimation. |
| Keep human correction central | Corrections improve trust and create proprietary data. |
| Show practical outputs, not model internals | Users need meal guidance, not technical complexity. |
| Separate MVP from health-goal premium mode | Avoid overloading first release and reduce claim risk. |
| Treat restaurant AI as second-stage product | Consumer experience must prove demand first. |

## Success Metrics

- AI analysis completion rate.
- Candidate acceptance rate.
- Correction rate by field.
- Meal record save rate.
- Next-meal recommendation click-through rate.
- Restaurant recommendation click-through rate.
- Meal Buddy card generation rate after analysis.
- Repeat analysis frequency per active user.
- Estimated cost per successful analysis.
- User-reported trust score after correction.
