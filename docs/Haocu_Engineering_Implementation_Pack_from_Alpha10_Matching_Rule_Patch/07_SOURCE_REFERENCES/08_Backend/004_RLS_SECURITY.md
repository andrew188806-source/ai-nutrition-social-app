# 004 RLS Security

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines Row Level Security direction for Haocu tables.

## RLS Principles

- RLS must be enabled on all user-data tables.
- Default posture is deny unless explicitly allowed.
- Admin access should be role-gated.
- Restaurant staff access should be scoped to owned restaurant.
- Participant access should be scoped to chat/group table membership.

## Policy Categories

### Owner-only

Examples:

- Own meal records.
- Own AI analysis jobs.
- Own private meal photos.
- Own health goals.

Policy rule:

- `auth.uid() = user_id`

### Participant-only

Examples:

- Chat messages.
- Group table private details.
- Invitation details.

Policy rule:

- user exists in participant table for target thread/table/invitation.

### Public read, controlled write

Examples:

- Published restaurants.
- Approved menu items.
- Public restaurant photos.

Policy rule:

- public can read approved records.
- restaurant owner/admin can write.

### Admin-only

Examples:

- Review queues.
- Abuse reports.
- Audit logs.

Policy rule:

- user has admin role claim or admin profile role.

## Sensitive Fields

Sensitive fields should be protected by either:

- separate private tables,
- field-level filtering in service responses,
- views with limited columns,
- or RLS policies that block direct client reads.

## RLS Test Matrix

For each table, test:

- owner allowed.
- other user denied.
- participant allowed where applicable.
- non-participant denied.
- restaurant owner allowed only for own restaurant.
- admin allowed where appropriate.

## Common RLS Mistakes to Avoid

- Enabling broad `authenticated` read on private tables.
- Allowing client writes to usage counters.
- Allowing restaurant staff to see private user meal data.
- Allowing users to edit invitation state without recipient/actor validation.
- Forgetting storage bucket policies.
