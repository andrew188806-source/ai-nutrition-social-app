# 003 Admin Frontend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines internal admin frontend.

## Technology

- Next.js.
- TypeScript.
- Tailwind.
- Admin-only routes and data access.

## Main Routes

- `/admin/login`
- `/admin/dashboard`
- `/admin/restaurants/reviews`
- `/admin/nutrition/reviews`
- `/admin/users/reports`
- `/admin/audit-logs`
- `/admin/privacy-requests`
- `/admin/config`

## Review Workflows

### Restaurant Verification

Admin can:

- Review submitted restaurant information.
- Approve.
- Reject with reason.
- Request more information.

### Nutrition Disclosure

Admin can:

- Review menu nutrition disclosure.
- Approve verified display.
- Reject with explanation.

### Abuse/Report Review

Admin can:

- View report.
- Review relevant context with permission.
- Resolve report.
- Create audit log.

## Admin UI Rules

- Prioritize clarity over decoration.
- Show audit history.
- Require reason for rejection and sensitive actions.
- Avoid exposing unnecessary private user details.
