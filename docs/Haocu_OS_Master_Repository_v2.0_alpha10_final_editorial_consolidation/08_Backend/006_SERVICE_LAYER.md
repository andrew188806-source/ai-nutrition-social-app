# 006 Service Layer

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

The service layer coordinates business operations across repositories, domain rules, and external integrations.

## Service Responsibilities

### ProfileService

- Read/update profile.
- Update social card display mode.
- Submit verification.
- Manage health goals.

### MealService

- Create meal records.
- List meals by date.
- Compute today intake.
- Store rating feedback.

### AIAnalysisService

- Create jobs.
- Run database-first lookup.
- Call model orchestration.
- Store candidates and corrections.
- Confirm result into meal record.

### MealBuddyService

- Create card.
- Enforce limits.
- List own cards.
- Rank candidates.
- Create match context after accepted invitation.

### GroupTableService

- Create table.
- Join/leave table.
- Enforce capacity and premium rules.
- Write system messages.
- Complete table meal feedback.

### ChatService

- Create/find thread.
- Send message.
- Update last message timestamp.
- List participant threads.

### PremiumService

- Resolve plan.
- Resolve entitlements.
- Check daily counters.
- Record usage.

### AdminReviewService

- List pending reviews.
- Approve/reject.
- Write audit log.

## Service Rule

Service methods should return typed results, not raw database responses, when the result is consumed by clients.

## Transaction Rule

When possible, operations that mutate multiple tables should be executed transactionally through database functions or controlled server logic.
