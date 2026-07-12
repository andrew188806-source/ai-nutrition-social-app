# Success Metrics

## Purpose

This document defines how Haocu should measure product health. Metrics must reflect the core loop, not vanity activity alone.

## North Star Metric

**Weekly completed food decision loops.**

A completed loop means a user:

1. records or analyzes a meal;
2. saves or confirms the record;
3. receives a useful next action;
4. acts on at least one recommendation, diary, restaurant, or meal-buddy path.

## Activation Metrics

| Metric | Definition | Why It Matters |
|---|---|---|
| First analysis completion | User completes photo/upload to result. | Proves first hook. |
| First save rate | User saves analysis result. | Proves trust and utility. |
| First correction rate | User corrects result when needed. | Shows correction UX is usable. |
| First today-summary view | User sees saved meal reflected. | Proves data consistency. |
| First recommendation click | User explores next meal or restaurant. | Proves recommendation value. |

## Retention Metrics

| Metric | Definition |
|---|---|
| D1 retention | User returns next day. |
| D7 retention | User returns within a week. |
| Weekly meal records | Meals saved per active user per week. |
| Food diary revisit | User reviews past meals. |
| Repeat recommendation usage | User uses recommendations multiple times. |

## AI Quality Metrics

| Metric | Definition | Interpretation |
|---|---|---|
| Candidate acceptance rate | User chooses one of AI candidates. | Higher means recognition is useful. |
| Manual fallback rate | User chooses none/manual. | High rate signals recognition or database gap. |
| Correction frequency | User edits dish/portion/nutrition. | Normal; should be monitored by category. |
| Save after correction | User still saves after edit. | Correction UX quality. |
| Confidence mismatch reports | User disagrees with high-confidence outputs. | Safety and calibration issue. |

## Recommendation Metrics

| Metric | Definition |
|---|---|
| Recommendation click-through | User taps recommended meal/restaurant. |
| “Why recommended” engagement | User opens explanation if available. |
| Save/visit intent | User saves or acts on recommendation. |
| Rating after recommendation | User rates recommended meal. |
| Similar-taste uplift | Recommendation success from taste graph vs generic ranking. |

## Social Metrics

| Metric | Definition |
|---|---|
| Meal-buddy card creation | User creates card from analysis/list/restaurant. |
| Candidate invite rate | User invites or chats with candidate. |
| Chat-first usage | User prefers chat before meal. |
| Invitation acceptance | Candidate accepts. |
| Chat list recency correctness | Latest active chat appears first. |
| Table join/create rate | User uses group table flow. |
| Cancellation reason rate | Leaving/canceling produces structured reason. |

## Premium Metrics

| Metric | Definition |
|---|---|
| Premium feature exposure | User sees locked or premium feature. |
| Upgrade intent click | User taps learn more/upgrade. |
| Premium conversion | User pays or selects premium in test. |
| Premium retained usage | Premium user returns and uses unlocked features. |
| Feature-level premium value | Which premium feature drives upgrade. |

## Restaurant Metrics

| Metric | Definition |
|---|---|
| Restaurant card views | User sees restaurant card. |
| Dish detail views | User opens dish/menu item. |
| Restaurant-to-buddy card conversion | User creates card from restaurant. |
| Recommendation action rate | User saves/navigates/acts on restaurant. |
| Restaurant partner leads | Restaurants request participation. |

## Guardrail Metrics

| Metric | Risk It Detects |
|---|---|
| Analysis abandonment | AI flow too long or confusing. |
| Correction abandonment | Correction UX too heavy. |
| Social report/block | Safety issue. |
| Premium annoyance feedback | Paywall too aggressive. |
| Nutrition claim complaints | Compliance risk. |
| Restaurant dispute | Incorrect restaurant/dish/nutrition data. |
| Data inconsistency bug count | Shared state/data architecture issue. |

## Demo Success Metrics

For investor or stakeholder demos, success is not only retention. A demo is successful if the viewer can explain:

1. what Haocu does;
2. why AI analysis is useful;
3. why recommendations are personal;
4. how meal-buddy social fits food intent;
5. how restaurants may participate later;
6. why the product can become a larger platform.
