# Mascot Identity PRD

## Objective

Define how Haocu mascots support anonymous social identity, brand differentiation, onboarding, crowdfunding, and shareable personality-test content.

## Product Role

Mascots make the app feel cute, less clinical, and safer for anonymous social discovery.

## MVP Uses

- Free user anonymous avatar.
- Social card visual identity.
- App onboarding decoration.
- Demo-friendly brand character.
- Crowdfunding reward concept.

## Current Mascot Direction

- Main visual/icon: red monkey as tasting/exploration character.
- Balanced guardian: polar bear direction.
- Style: cute, warm, Sanrio-like friendliness without copying protected characters.

## Functional Requirements

1. Free anonymous card uses mascot avatar.
2. Mascot assignment remains consistent across screens.
3. Premium real-person card can coexist with mascot identity.
4. Mascot does not reveal private health data.
5. Mascot assets can be referenced in crowdfunding/external artifacts.

## Mascot Data Fields

- `mascotId`
- `role`
- `displayName`
- `avatarAsset`
- `personalityType`
- `foodPreferenceTags`
- `anonymousProfileTheme`

## UI Requirements

- Mascots should not make pages cluttered.
- Avatar size and style should be consistent.
- Mascot and real photo states must be clearly distinct.

## Acceptance Criteria

1. Anonymous avatar is consistent in meal-buddy, chat, and group table.
2. Premium real card does not accidentally replace mascot where anonymity is selected.
3. Mascot roles can support future personality-test sharing.
4. Mascot language stays playful and brand-safe.

## Review Risks

- IP similarity to existing characters.
- Overcrowding UI.
- Confusing free/premium identity distinction.
