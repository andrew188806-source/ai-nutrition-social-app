# 005 Edge Functions

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines candidate Supabase Edge Functions for Haocu MVP.

## Function List

### `create-ai-analysis-job`

Creates AI job after photo upload or restaurant/menu context selection.

Responsibilities:

- Validate auth.
- Validate storage object or selected menu item.
- Create job record.
- Trigger analysis or return mock/demo result.

### `confirm-ai-analysis`

Confirms AI result into a meal record.

Responsibilities:

- Validate job ownership.
- Save corrections.
- Create meal record and meal items.
- Create nutrition estimate.
- Log analytics event.

### `create-meal-buddy-card`

Creates card from AI result, meal record, or restaurant/menu item.

Responsibilities:

- Validate plan limits.
- Default date/time.
- Create card.
- Update usage counter.
- Return visible card payload.

### `send-invitation`

Sends invite to chat or eat.

Responsibilities:

- Validate sender/recipient/card.
- Prevent duplicate active invitations.
- Create invitation.
- Create or reference chat thread if needed.

### `respond-invitation`

Accepts/declines invitation.

Responsibilities:

- Validate recipient.
- Update invitation.
- Create match/friend relation.
- Create chat thread or system message.

### `create-group-table`

Creates group table.

Responsibilities:

- Validate premium permission.
- Validate restaurant/context.
- Create table and owner participant.

### `join-group-table`

Adds participant to table.

Responsibilities:

- Validate capacity.
- Validate visibility.
- Add participant.
- Add system message.

### `admin-review-action`

Handles approve/reject review actions.

Responsibilities:

- Validate admin role.
- Update review target.
- Create audit log.

## Function Standards

- Validate auth first.
- Validate actor permission second.
- Validate payload third.
- Use structured error codes.
- Create audit/analytics where required.
- Avoid returning private internal fields.
