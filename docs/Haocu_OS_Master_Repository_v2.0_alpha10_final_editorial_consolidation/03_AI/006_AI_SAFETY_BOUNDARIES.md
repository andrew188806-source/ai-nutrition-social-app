# AI Safety Boundaries

## Purpose
Define what Haocu AI may and may not say or do, especially around nutrition, health goals, identity, and social recommendations.

Haocu is a consumer food and social dining product. It is not a medical device, clinical dietitian, or psychological assessment service.

## Health and Nutrition Boundaries

### Allowed

- General nutrition estimates.
- Meal balance suggestions.
- Daily intake summaries.
- Food variety reminders.
- General educational copy.
- User-controlled health goal tracking.

### Requires Professional Review

- Weight-loss programs.
- Disease-specific nutrition guidance.
- Diabetes, kidney disease, pregnancy, eating disorder, or medication-related guidance.
- Claims about preventing or treating disease.
- Supplement-related recommendations.

### Not Allowed in MVP

- Diagnosis.
- Treatment plans.
- Guaranteed outcome claims.
- Extreme calorie restriction suggestions.
- Shame-inducing messages.

## Social Matching Boundaries

Meal Buddy AI may recommend based on:

- Meal time.
- Restaurant/dish intent.
- Distance/area.
- Social preference.
- Payment preference.
- Food preference.
- Prior friend/match state.

Meal Buddy AI should not recommend based on sensitive personal traits unless explicitly consented, product-reviewed, and legally reviewed.

## Identity Boundaries

- Free users default to anonymous/mascot identity.
- Premium real-person cards require verification rules defined in PRD.
- AI should not infer identity, age, gender, health condition, or sensitive attributes from photos.

## UI Copy Rules

Use:

- “估算”
- “參考”
- “可能”
- “建議你可以”

Avoid:

- “確定”
- “必須”
- “治療”
- “保證”
- “你胖/你不健康”

## Escalation Rules

If a user indicates a medical condition, pregnancy, eating disorder, or severe restriction need, the product should display professional consultation copy rather than providing custom medical guidance.

## Data Safety

- Store original and corrected AI outputs separately.
- Keep audit logs for AI review workflows.
- Do not train on personally sensitive fields without explicit governance.
- Avoid using private chat content for AI ranking in MVP.

## Acceptance Criteria

1. AI outputs avoid clinical claims.
2. Low-confidence estimates are clearly correctable.
3. Social recommendation excludes sensitive inference.
4. Premium health goal mode has professional review flag.
5. Sponsored or monetized recommendation logic is separable and reviewable.
