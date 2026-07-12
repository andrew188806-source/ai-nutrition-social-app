# AI / Nutrition / Health Claims Review

## Review Goal

Ensure that Haocu's AI food analysis, nutrition estimates, recommendations, social matching, health-goal mode, and marketing language remain informational and do not create medical, dietitian, clinical, or unsafe health claims.

## Product Claims To Review

- AI can analyze a food photo and estimate nutrition.
- AI can recommend the next meal based on what the user ate today.
- Personalization can learn taste preference and reduce restaurant disappointment.
- Similar-user taste data can improve recommendations.
- Health-goal mode can estimate targets based on user inputs.
- Calorie/guilt sharing can support group eating accountability.
- Restaurant nutrition pages can provide more transparent menu information.

## High-Risk Phrases To Avoid Unless Reviewed

- Guaranteed weight loss.
- Medical diet plan.
- Treatment or prevention of disease.
- Safe for diabetes, kidney disease, pregnancy, children, eating disorders, or clinical conditions.
- Exact calorie count from photo.
- Diagnosing nutrient deficiencies.
- Replacing dietitian or physician advice.
- Claims that restaurant meals are healthy without defined criteria.

## Safer Product Language Direction

Use language like:

- Estimate.
- Approximate.
- Informational reference.
- Helps compare options.
- Supports awareness.
- Based on available menu data and user correction.
- Not a medical or clinical recommendation.

## Review Questions

- What disclaimer must appear near AI nutrition results?
- Should every nutrition result show confidence level or uncertainty range?
- Should the app prevent or redirect users who disclose medical conditions?
- What copy is acceptable for health-goal mode?
- Can the product use words like balanced, protein-focused, lighter, high-fiber, or low-calorie?
- What claims can be made about personalization and taste matching?
- What restaurant nutrition badge wording is acceptable?
- What requirements apply if a dietitian reviews content later?

## Engineering Controls To Consider

- Confidence labels.
- Manual correction flow.
- Food/portion uncertainty display.
- Non-medical disclaimer component.
- Safety copy in health-goal onboarding.
- Avoid exact precision formatting when analysis is estimated.
- Block or warn for medical-condition keywords if users ask for disease-specific advice.
- Audit log for restaurant verified nutrition entries.

## Supporting Documents

- `03_AI/003_NUTRITION_ESTIMATION.md`
- `03_AI/006_AI_SAFETY_BOUNDARIES.md`
- `03_AI/007_AI_EVALUATION.md`
- `02_PRD/018_HEALTH_GOAL_MODE_PRD.md`
- `14_Compliance/003_NUTRITION_HEALTH_CLAIMS.md`
- `23_Engineering_Backlog_Pack/010_AI_RECOMMENDATION_TASK_BREAKDOWN.md`
