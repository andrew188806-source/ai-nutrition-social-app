# 009 Release Process

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines release process for Haocu demo, MVP alpha, MVP beta, and public MVP.

## Release Types

### Demo Release

Goal: show product vision and flow to advisors, investors, engineers, or partners.

Requirement:

- Stable route navigation.
- No obvious broken screens.
- Demo data is coherent.
- Core flow can be completed in 3 minutes.

### MVP Alpha

Goal: real data path exists for core features, but limited test users.

Requirement:

- Supabase schema foundation.
- Meal records persisted.
- AI analysis job lifecycle.
- Meal Buddy card flow.
- Basic chat/invitation.
- Basic admin/review placeholders.

### MVP Beta

Goal: controlled external users.

Requirement:

- RLS reviewed.
- Error tracking active.
- Privacy/consent baseline.
- Premium limits enforced.
- Restaurant data workflow usable.

### Public MVP

Goal: public launch.

Requirement:

- Stable onboarding.
- Production data policies.
- Support workflow.
- Incident playbook.
- Analytics dashboard.

## Release Checklist

- Typecheck passes.
- Critical smoke tests pass.
- Release notes written.
- Changed PRDs/docs updated.
- New migrations reviewed.
- RLS policy review completed for touched tables.
- Rollback path known.

## Rollback

Rollback plan must include:

- Code rollback.
- Migration rollback or forward fix.
- Feature flag disable path.
- Communication note if user-facing.
