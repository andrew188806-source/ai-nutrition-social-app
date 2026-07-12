# 008 Form and Validation

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines frontend form and validation behavior.

## Form Principles

- Validate early but do not interrupt aggressively.
- Keep forms short in consumer flows.
- Use progressive disclosure for advanced correction fields.
- Preserve drafts when users navigate briefly away.

## Important Forms

### Manual Meal Correction

Fields:

- Restaurant name optional.
- Dish name required.
- Ingredients optional but encouraged.
- Portion required or defaultable.
- Cooking method optional.
- Calories/macros editable.

### Meal Buddy Card

Fields:

- Food/restaurant context.
- Meal time/date.
- Intent: chat first or dine direct.
- Payment preferences.
- Note optional.

### Social Card

Fields:

- Display mode.
- Avatar/profile image.
- Bio.
- Dietary preference summary.
- Health goal summary visibility.

### Restaurant Menu Item

Fields:

- Name.
- Price.
- Portion.
- Ingredients.
- Cooking method.
- Nutrition disclosure.
- Photos.

## Validation Rules

- Required fields must be visually marked.
- Date/time must not silently default to wrong day except where PRD requires today.
- Premium-only fields must show gate before submission.
- Error messages must be user-friendly.

## Save State

Every form should define:

- dirty state,
- saving state,
- saved state,
- error state.
