# Component System

## Purpose
Define reusable UI components for consistent mobile and web surfaces.

## Core Components

### Cards

- MealCard
- RestaurantCard
- MealBuddyCard
- SocialCard
- GroupTableCard
- NutritionSummaryCard
- RecommendationCard
- PremiumTeaserCard

### Inputs

- SearchInput
- FilterChips
- DateTimeSelector
- PortionSelector
- IngredientEditor
- PaymentPreferenceSelector
- MealTypeSelector

### Feedback

- LoadingState
- EmptyState
- ErrorState
- Toast
- ConfirmationSheet
- PaywallSheet

### Identity

- MascotAvatar
- RealAvatar
- VerificationBadge
- PremiumBadge

## Component Principles

- Props should accept IDs and display data separately.
- Avoid components fetching unrelated global data directly.
- Keep UI state local where possible; domain state belongs to hooks/services.
- Reuse card patterns across meal, restaurant, and social flows.

## Visual Consistency

Cards should use:

- consistent radius
- consistent padding
- clear title/subtitle hierarchy
- action area at bottom
- limited badges

## Acceptance Criteria

1. Meal Buddy/social identity components are reused across list/chat/group table.
2. Empty/loading/error states use shared components.
3. Filter chips are consistent across restaurant and Meal Buddy pages.
4. Premium badge usage is consistent.
5. Components are demo-readable and not visually dense.
