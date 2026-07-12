# 007 Auth and Permission Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines authentication, authorization, account roles, profile visibility, and permission boundaries.

## Identity Model

Primary account identity is managed by Supabase Auth. Application profile data is stored separately in `profiles`.

Do not store product profile fields only inside auth metadata. Auth metadata is not the product source of truth.

## Roles

### Consumer

Can:

- Create meal records.
- Run AI analysis.
- Create Meal Buddy cards within plan limits.
- Create or join eligible chats/group tables.
- Edit own profile and social card.

### Premium Consumer

Can additionally:

- Unlock real profile social card mode.
- Use higher Meal Buddy limits.
- See more candidates.
- Retain Top10 diary features.
- Use health goal mode.

### Restaurant Staff

Can:

- Manage own restaurant profile.
- Manage menu data.
- Submit nutrition disclosure.
- View restaurant-side group table context.

### Admin

Can:

- Review restaurants.
- Review nutrition disclosure.
- Review abuse reports.
- View audit logs.
- Manage operational settings.

## Permission Boundaries

- Consumers cannot write restaurant verification state.
- Restaurants cannot read private consumer meal records.
- Admin action must create audit logs.
- Public social data must be privacy-filtered.
- Chat and group messages are participant-only.

## Social Profile Visibility

Free users:

- Anonymous mascot identity.
- Limited discovery exposure.
- No real photo unlock.

Premium users:

- Can enable real profile display.
- Real profile requires verification path before broader exposure.
- User must be able to revert to anonymous mode.

## RLS Direction

Every table with user data must have RLS enabled. RLS must be tested with at least:

- Own-user read.
- Other-user denied read.
- Participant read.
- Non-participant denied read.
- Admin role read.
- Restaurant owner read/write.

## Audit Requirement

Audit log must capture:

- Admin review decisions.
- Verification changes.
- Abuse handling actions.
- Privacy request handling.
- Sensitive entitlement/manual override changes.
