# 08 Backend

Version: v2.0 Alpha 4  
Updated: 2026-07-08  
Owner: Backend Lead / CTO

This folder defines backend implementation for Haocu MVP.

## Backend Scope

The backend is responsible for:

- Auth/session context.
- Data persistence.
- RLS enforcement.
- AI analysis orchestration.
- Meal record creation.
- Recommendation inputs.
- Meal Buddy card limits and matching.
- Invitation and chat state.
- Group Table lifecycle.
- Restaurant/menu/admin review.
- Premium entitlement enforcement.
- Analytics and audit logging.

## Folder Map

- `001_BACKEND_ARCHITECTURE.md`
- `002_API_ARCHITECTURE.md`
- `003_DATABASE_TABLES.md`
- `004_RLS_SECURITY.md`
- `005_EDGE_FUNCTIONS.md`
- `006_SERVICE_LAYER.md`
- `007_DOMAIN_LAYER.md`
- `008_REPOSITORY_LAYER.md`
- `009_AUTHORIZATION.md`
- `010_API_CONTRACTS.md`
- `011_ERROR_HANDLING.md`
- `012_JOBS_AND_NOTIFICATIONS.md`
- `013_STORAGE_AND_PHOTO_BACKEND.md`
- `014_ANALYTICS_AND_AUDIT_BACKEND.md`
- `015_BACKEND_BACKLOG.md`

## Backend Rule

If a write changes limits, visibility, matching, invitation, chat, premium, admin review, or audit state, it should be mediated by backend logic rather than a raw client write.
