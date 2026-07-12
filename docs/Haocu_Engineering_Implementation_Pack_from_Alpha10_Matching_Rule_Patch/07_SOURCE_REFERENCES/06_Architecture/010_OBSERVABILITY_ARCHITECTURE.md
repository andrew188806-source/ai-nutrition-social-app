# 010 Observability Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines how Haocu should observe reliability, AI quality, product flows, and operational issues.

## Observability Layers

### Client Observability

Track:

- App load failures.
- Route errors.
- AI analysis UI stuck states.
- Upload failures.
- Chat send failures.
- Empty-state frequency.

### Backend Observability

Track:

- Edge Function latency.
- API error rate.
- RLS permission failures.
- Database query performance.
- Storage upload/download failures.
- Usage limit enforcement errors.

### AI Observability

Track:

- Job success/failure.
- Inference latency.
- Cost per job.
- Confidence distribution.
- Correction rate.
- Manual fallback rate.
- Restaurant/menu match rate.

### Product Observability

Track:

- AI analysis completion rate.
- Meal record creation rate.
- Meal Buddy card creation rate.
- Invitation acceptance rate.
- Chat activation rate.
- Group Table join/fill rate.
- Premium gate conversion.

## Log Hygiene

Logs must not contain:

- Full private meal photo URLs.
- Sensitive profile data.
- Raw access tokens.
- AI provider keys.
- Private chat content unless explicitly required for abuse review with access control.

## Incident Levels

### P0

Production app unusable, auth broken, data exposure, payment/entitlement severe issue.

### P1

AI analysis flow broken, meal records not saving, chat unavailable, major RLS error.

### P2

Non-critical page failure, analytics broken, limited restaurant/admin workflow issue.

### P3

Minor UI inconsistency, typo, non-blocking empty state issue.

## MVP Observability Requirement

Before public MVP launch, the team must have at least:

- Error tracking.
- Server logs for edge functions.
- Database error visibility.
- Analytics events for core funnel.
- Manual incident log.
