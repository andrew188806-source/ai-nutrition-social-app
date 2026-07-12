# 013 Dependency Management

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines dependency management rules.

## Principles

- Prefer stable, well-maintained libraries.
- Avoid adding large dependencies for small utilities.
- Keep Expo SDK compatibility in mind.
- Avoid library choices that block native build later.
- Document why major dependencies are added.

## Dependency Categories

### Core

- Expo.
- React Native.
- Expo Router.
- TypeScript.
- Supabase client.
- Next.js.
- Tailwind.

### Optional

- Form library.
- Validation library.
- Date utility.
- Error tracking.
- Analytics.
- Push notification.

### Avoid Early

- Heavy state libraries before state complexity justifies them.
- Complex animation dependencies for MVP.
- Custom native modules unless required.
- Multiple UI libraries that fight the design system.

## Upgrade Policy

- SDK upgrades should be planned.
- Major dependency upgrades require smoke test.
- Security patches should be prioritized.
- Lockfile changes should be reviewed.

## Dependency Risk Log

For each major dependency, record:

- Reason for use.
- Replacement cost.
- Known constraints.
- Upgrade risk.
