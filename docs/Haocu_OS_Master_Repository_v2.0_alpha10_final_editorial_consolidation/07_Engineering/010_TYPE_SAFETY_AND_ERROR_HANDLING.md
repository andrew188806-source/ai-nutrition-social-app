# 010 Type Safety and Error Handling

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines type-safety and error-handling standards.

## Type Safety Rules

- Domain types should be centralized.
- API responses should be typed.
- Nullable fields must be explicit.
- Avoid broad `any`.
- Use discriminated unions for state machines.

## Suggested State Machine Pattern

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'error'; error: AppError };
```

## App Error Shape

```ts
type AppError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
};
```

## User-facing Error Rules

- Use friendly Traditional Chinese text.
- Avoid raw stack traces.
- Provide next action when possible.
- Do not expose internal model/provider errors.
- Do not reveal permission logic that could help bypass security.

## Critical Error Cases

### AI Analysis

- Upload failed.
- Analysis timed out.
- No confident candidate.
- Manual correction save failed.

### Meal Records

- Save failed.
- Today summary cannot sync.
- Duplicate record risk.

### Meal Buddy

- Daily limit exceeded.
- Card creation failed.
- Invite already sent.
- Candidate no longer available.

### Chat

- Send failed.
- Thread unavailable.
- User not participant.

### Restaurant

- Menu item unavailable.
- Restaurant data not verified.
- Location permission unavailable.
