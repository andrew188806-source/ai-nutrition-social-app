# Onboarding and Profile PRD

## Objective

Collect enough user context to personalize recommendations while keeping onboarding short and non-intimidating.

## Scope

### MVP

- Nickname.
- Basic food preferences.
- Avoided foods/allergens where voluntarily provided.
- General goal selection.
- Location permission or manual area.
- Social preference basics.
- Premium/free profile state.

### MVP+

- Detailed health goal mode.
- Body metrics.
- Verification flow.
- Advanced taste questionnaire.

## Primary Flow

```text
First app open
  -> Short intro
  -> Basic profile
  -> Food preferences
  -> Goal selection
  -> Optional location
  -> Enter home
```

## Functional Requirements

1. User can skip non-critical onboarding fields.
2. App can operate with sparse profile.
3. Preferences feed recommendation.
4. Sensitive health/body fields are optional.
5. Profile can be edited later.
6. Traditional Chinese copy is clear and friendly.

## Profile Fields

- nickname;
- mascot/avatar choice;
- food preferences;
- disliked foods;
- dietary restrictions;
- taste tags;
- goal mode;
- social preference;
- approximate area/location preference;
- premium entitlement;
- verification status.

## Data Dependencies

- `users`
- `user_profiles`
- `user_preferences`
- `social_cards`
- `premium_entitlements`

## Analytics Events

- `onboarding_started`
- `onboarding_completed`
- `onboarding_skipped`
- `profile_updated`
- `preference_added`

## Acceptance Criteria

1. User can reach home without completing a long questionnaire.
2. Recommendation has fallback when profile is sparse.
3. Profile changes affect social card and recommendation where applicable.
4. Sensitive fields are never mandatory for basic app use.
