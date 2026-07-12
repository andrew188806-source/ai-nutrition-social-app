# 001 Engineering Standards

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines baseline engineering standards for Haocu.

## General Standards

- Use TypeScript for all application code.
- Prefer explicit types for domain models and API responses.
- Keep business logic outside visual components when practical.
- Avoid hidden global mutable state.
- Keep user-facing Traditional Chinese copy in i18n files, not scattered through JSX.
- All premium limits must be enforced by backend/service logic, not only UI hiding.

## Code Organization

### UI Components

- Stateless when possible.
- Accept typed props.
- No direct business-rule duplication.
- No hard-coded mock data in reusable components.

### Hooks

Hooks may own:

- Data fetching.
- Derived UI state.
- Form state.
- Local storage integration.

Hooks should not silently mutate global data without an explicit function name.

### Services

Services own:

- API calls.
- Supabase queries.
- Edge Function calls.
- Business-rule enforcement when running client-side for demo.

### Domain Types

Domain types should be centralized so Meal Buddy, Group Table, Chat, and Restaurant flows do not invent incompatible versions of the same user/card/table model.

## Naming Rules

- Use `mealRecord`, not `latestCorrectedMealRecord`, as the durable record concept.
- Use `mealBuddyCard` for a user's active meal intent card.
- Use `socialCard` for public/anonymous/real profile presentation.
- Use `groupTable` for four-person dining table state.
- Use `chatThread` for one-to-one or group chat container.

## Error Handling

Every async operation must define:

- Loading state.
- Success state.
- Empty state where applicable.
- Error state.
- Retry or recovery action.

## UI Quality Bar

Haocu UI should be clean, tidy, and demo-friendly. Avoid clutter, duplicate buttons, oversized filter panels, and hidden key actions.

## Documentation Rule

If implementation changes a business rule, update the relevant PRD and data/API docs in the same pull request.
