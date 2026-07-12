# Premium PRD

## Objective

Create a clear free/premium distinction that supports monetization without damaging the usefulness of the free product.

## Premium Philosophy

Free proves the core loop. Premium unlocks more depth, more capacity, richer identity, and advanced personalization.

## Capability Matrix

| Capability | Free | Premium |
|---|---|---|
| AI analysis | Basic | Higher quota or advanced features later |
| Meal records | Basic | Longer history / Top lists |
| Social identity | Anonymous mascot | Real-person card option |
| Meal-buddy card opportunities | Lower daily limit | Higher daily limit |
| Candidate count | Smaller | Larger |
| Multi-select invite | No/limited | Yes where defined |
| Food diary | Basic | Top saved items and richer history |
| Health-goal mode | No/basic | Yes |
| Group table creation/upgrades | Limited | Expanded |

## Functional Requirements

1. App can determine user entitlement.
2. UI can render free/premium variants consistently.
3. Premium gates appear contextually.
4. Free users can complete core flow.
5. Limit reached state explains what happened.
6. Premium mode supports demo toggle before production payment.

## Premium Trigger Points

- Reaching meal-buddy card limit.
- Wanting more candidates.
- Unlocking real-person social card.
- Viewing Top saved items beyond free window.
- Entering health-goal mode.
- Upgrading group table capacity.

## UI Requirements

- Avoid large repetitive upsell blocks.
- Use clear locked states where needed.
- Explain benefit in one sentence.
- Maintain clean visual hierarchy.

## Data Dependencies

- `premium_entitlements`
- `user_subscriptions`
- `feature_limits`
- `usage_counters`
- `social_cards`

## API Dependencies

- `GET /entitlements`
- `GET /usage-limits`
- `POST /premium/intent`
- production future: payment provider integration.

## Analytics Events

- `premium_feature_viewed`
- `premium_gate_shown`
- `premium_learn_more_tapped`
- `premium_toggle_changed_demo`
- `premium_conversion_intent`
- `premium_limit_reached`

## Acceptance Criteria

1. Free and premium rules are consistent across product surfaces.
2. Free user can still analyze, save, and receive recommendations.
3. Premium unlocks are understandable.
4. Usage limits reset correctly by day where applicable.
5. Real-person card does not appear for users without entitlement/verification state.

## MVP+ Enhancements

- Real payment.
- Trial period.
- Annual founder plan.
- Referral-based premium rewards.
