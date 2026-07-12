# 012 Jobs and Notifications

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines background-like job and notification behavior for MVP.

## Job Types

### AI Analysis Job

Lifecycle:

```text
created → processing → completed → confirmed
created/processing → failed
```

Fields:

- job ID.
- user ID.
- photo ID or source menu item.
- status.
- confidence.
- cost proxy.
- error code.

### Meal Rating Reminder

Trigger:

- After meal record created or scheduled meal time passes.

MVP behavior:

- In-app reminder state.
- Push notification later.

### Group Table Status Job

Trigger:

- Table reaches capacity.
- Table expires.
- Meal completed.

### Invitation Expiry Job

Trigger:

- Pending invitation exceeds valid window.

## Notification Types

- Invitation received.
- Invitation accepted/declined.
- Chat message received.
- Group Table status change.
- Meal rating reminder.
- Premium limit reached.
- Restaurant review completed.

## MVP Implementation

MVP can use database timestamps and client/server checks instead of full job queue. Add a real queue only when scale or reliability demands it.
