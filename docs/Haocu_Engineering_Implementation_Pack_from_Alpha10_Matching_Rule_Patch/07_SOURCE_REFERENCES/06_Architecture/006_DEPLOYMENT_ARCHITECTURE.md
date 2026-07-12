# 006 Deployment Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines the target deployment model for Haocu MVP and post-MVP.

## Environments

### Local

Used by engineers and coding agents.

- Local Expo web/native development.
- Local Next.js restaurant/admin development.
- Supabase local stack optional but not mandatory for early demo.
- Mock data fallback allowed.

### Preview

Used for stakeholder demo and pull request review.

- Vercel preview deployments for web surfaces.
- Expo web preview for mobile demo when appropriate.
- Shared Supabase staging project or isolated preview data.

### Staging

Used for release validation.

- Stable staging URL.
- Staging Supabase project.
- Test accounts and seeded demo restaurants.
- AI integration can use lower-cost model settings.

### Production

Used for public launch.

- Production mobile build.
- Production Vercel web deployments.
- Production Supabase project.
- Strict RLS and backup policies.
- No demo-only mock writes.

## Deployment Topology

```text
GitHub Repository
  ├─ Pull Request
  │   └─ Preview Build
  ├─ Main Branch
  │   └─ Staging Deployment
  └─ Release Tag
      └─ Production Deployment
```

## Release Gate

A production release requires:

- TypeScript checks pass.
- Unit/integration smoke tests pass.
- Critical user flows verified.
- RLS policies reviewed for touched tables.
- Migration plan reviewed.
- Rollback note written.

## Secrets Management

Secrets must never be committed. Environment variables should be separated by environment:

- Supabase URL.
- Supabase anon key.
- Supabase service role key.
- AI provider keys.
- Payment keys.
- Notification keys.

Service role keys must only be used server-side.

## Backup and Recovery

Production must define:

- Database backup cadence.
- Storage retention policy.
- Migration rollback strategy.
- Incident owner.
- Recovery communication template.

## MVP Shortcut Allowed

For demo and early MVP, some services can be stubbed, but the deployment architecture must keep the replacement path clear.
