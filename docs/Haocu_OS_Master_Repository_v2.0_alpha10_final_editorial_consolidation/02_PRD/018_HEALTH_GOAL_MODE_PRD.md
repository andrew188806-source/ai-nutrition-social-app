# Health Goal Mode PRD

## Objective

Define premium health-goal mode that provides more structured meal guidance while staying outside medical diagnosis or treatment.

## Stage

Premium MVP+ unless simplified goal tags are needed for MVP personalization.

## Scope

### Allowed

- User-selected general goals.
- Estimated calorie/macro guidance.
- Meal balance suggestions.
- Time-bound goal planning with disclaimers.
- “Consult professional” disclaimers for clinical needs.

### Not Allowed Without Review

- Medical diagnosis.
- Treatment plans.
- Claims to cure/manage disease.
- High-risk weight-loss promises.
- Advice for minors, pregnancy, eating disorders, or medical conditions without professional guardrails.

## Goal Types

- balanced eating;
- higher protein;
- lighter dinner;
- weight management;
- muscle support;
- reduce sugary drinks/snacks;
- improve meal regularity.

## Functional Requirements

1. User can choose goal.
2. Premium user can optionally enter target weight/timeframe where allowed.
3. System estimates broad meal guidance.
4. Recommendation uses goal as one signal.
5. App shows disclaimer language.
6. User can edit or disable goal mode.

## Data Dependencies

- `user_goals`
- `user_profiles`
- `meal_records`
- `recommendation_preferences`
- `premium_entitlements`

## Acceptance Criteria

1. Goal mode affects recommendations in understandable ways.
2. Guidance remains non-medical.
3. Sensitive inputs are optional.
4. Premium boundary is clear.
5. Safety copy appears for higher-risk goal contexts.
