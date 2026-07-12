# 007 Code Review Policy

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines how Haocu code should be reviewed.

## Review Priorities

1. Correctness of user flow.
2. Data model consistency.
3. Type safety.
4. UI clarity.
5. Privacy and permission safety.
6. Maintainability.
7. Performance and cost.

## Reviewer Checklist

### Product Behavior

- Does the change match the PRD?
- Does it preserve MVP scope?
- Does it avoid duplicate/contradictory actions?
- Are free/premium rules correct?

### Data

- Does the feature use the canonical domain types?
- Does it avoid hidden parallel mock state?
- Does it update derived state correctly?
- Are IDs consistent across social card, meal buddy card, match, chat, and table?

### UI

- Is the page visually uncluttered?
- Are empty/loading/error states handled?
- Is the action visible where the user expects it?
- Are mascot/real avatar distinctions clear?

### Backend/Security

- Are writes service-mediated where required?
- Are RLS implications considered?
- Are logs safe?
- Are admin actions audited?

### Testing

- Does typecheck pass?
- Are critical flows manually tested?
- Are edge cases covered?

## Approval Standard

A PR can be approved when it improves the product without increasing ambiguity in data flow or user flow.
