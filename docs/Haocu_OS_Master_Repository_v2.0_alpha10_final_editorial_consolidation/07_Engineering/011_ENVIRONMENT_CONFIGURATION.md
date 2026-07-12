# 011 Environment Configuration

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines environment configuration for local, preview, staging, and production.

## Environment Variables

### Public Client Variables

Allowed client-side:

- Supabase URL.
- Supabase anon key.
- Environment name.
- Feature flag defaults.

### Server-only Variables

Never expose client-side:

- Supabase service role key.
- AI provider keys.
- Payment secret keys.
- Email provider keys.
- Admin automation secrets.

## Environment Names

- `local`
- `preview`
- `staging`
- `production`

## Configuration Rule

The app should not rely on `if (localhost)` style branching. Use explicit environment variables.

## Demo Mode

Demo mode may use mock data and local storage, but must be clearly separated from production data behavior.

## Supabase Projects

Recommended:

- Separate staging and production Supabase projects.
- Optional local Supabase for advanced development.
- Seeded staging data for investor demo.

## Migration Safety

Before applying migrations to production:

- Backup exists.
- Migration reviewed.
- RLS changes reviewed.
- Rollback or forward-fix strategy documented.
