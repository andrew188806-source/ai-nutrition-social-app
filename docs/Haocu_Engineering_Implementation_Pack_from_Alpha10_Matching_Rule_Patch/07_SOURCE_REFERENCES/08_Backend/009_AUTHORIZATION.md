# 009 Authorization

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines authorization checks beyond raw authentication.

## Actor Context

Every service-mediated request should resolve:

- `actorUserId`
- `role`
- `subscriptionPlan`
- `restaurantIds` if restaurant staff.
- `adminPermissions` if admin.

## Authorization Checks

### Profile

- User can edit own profile.
- User cannot edit another user's profile.
- Admin can moderate but action must be audited.

### Meal

- User can read/write own meal records.
- Restaurant cannot read consumer meal records.
- Admin access must be exceptional and audited.

### Meal Buddy

- User can create own card within limits.
- User can see candidates according to visibility and plan.
- User cannot mutate another user's card.

### Invitation

- Sender can cancel own pending invitation.
- Recipient can accept/decline invitation addressed to them.
- Third party cannot read private invitation details.

### Chat

- Only thread participants can read messages.
- Only participants can send messages.
- System messages can be created by service logic.

### Group Table

- Host can cancel table.
- Participant can leave with reason.
- Non-participant visibility depends on table public listing rules.

### Restaurant

- Restaurant staff can edit owned restaurant.
- Admin can approve/reject verification.

## Server-side Requirement

Do not rely only on client-side disabled buttons. Authorization must be enforced in RLS and/or Edge Function logic.
