# 012 Feature Flags and Demo Mode

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines feature flags and demo mode rules.

## Feature Flag Use Cases

- Toggle premium demo mode.
- Enable/disable real AI provider.
- Enable/disable restaurant admin surface.
- Enable/disable Group Table creation.
- Enable/disable push notification path.
- Enable/disable real payment integration.

## Feature Flag Principles

- Feature flags should not permanently replace product decisions.
- Flags should have owner and removal plan.
- Security-sensitive checks cannot be only client flags.
- Premium entitlement must still be enforced by service/backend logic.

## Demo Mode Rules

Demo mode may:

- Use mock users.
- Use mock restaurants and menu items.
- Use local storage persistence.
- Simulate premium/free switching.
- Simulate AI analysis result.

Demo mode must not:

- Create fake flows that contradict real architecture.
- Hide data model bugs.
- Invent separate social identity sources.
- Make UI look complete while core state cannot be implemented.

## Recommended Flags

```ts
type FeatureFlags = {
  demoMode: boolean;
  useMockAI: boolean;
  enablePremiumDemo: boolean;
  enableRestaurantAdmin: boolean;
  enableGroupTables: boolean;
  enablePushNotifications: boolean;
};
```

## Demo Readiness Rule

A demo is ready when the intended 3-minute story works from start to finish without manual page refresh or hidden setup.
