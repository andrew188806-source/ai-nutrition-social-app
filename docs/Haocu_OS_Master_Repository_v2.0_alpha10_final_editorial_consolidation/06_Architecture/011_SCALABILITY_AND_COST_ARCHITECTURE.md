# 011 Scalability and Cost Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines how Haocu should scale without overbuilding before product-market proof.

## Cost Drivers

Primary early cost drivers:

- AI model calls for image recognition and nutrition estimation.
- Meal photo storage.
- Database reads/writes for social/chat activity.
- Real-time chat or polling.
- Analytics/event volume.
- External maps/location APIs.

## MVP Cost Controls

### AI

- Database-first lookup before inference.
- Cache repeated image/job results.
- Avoid model calls for known menu item selection.
- Store structured corrections for reuse.
- Add per-user daily analysis limits if needed.

### Storage

- Compress images client-side when acceptable.
- Store original only when necessary.
- Define retention policy for free accounts.
- Separate public restaurant images from private meal photos.

### Database

- Add indexes for feed/list queries.
- Avoid unbounded chat queries.
- Paginate restaurant, match, and diary lists.
- Archive or summarize old analytics when needed.

### Real-time

- MVP can use refresh/polling for some flows.
- Real-time subscriptions should be limited to active chat/table screens.

## Scaling Milestones

### 0–5,000 users

Supabase + Vercel + Edge Functions should be sufficient with careful indexes and usage limits.

### 5,000–50,000 users

Evaluate:

- Dedicated analytics store.
- Job queue for AI.
- Caching layer.
- Vector search for taste/menu embedding.
- More structured notification service.

### 50,000+ users

Evaluate:

- Service separation for AI/recommendation.
- Message infrastructure for chat/table events.
- Storage lifecycle automation.
- More advanced recommendation serving layer.

## Do Not Prematurely Optimize

Do not introduce microservices, complex queues, or custom infrastructure before usage justifies them. Architecture should remain comprehensible to a small startup engineering team.
