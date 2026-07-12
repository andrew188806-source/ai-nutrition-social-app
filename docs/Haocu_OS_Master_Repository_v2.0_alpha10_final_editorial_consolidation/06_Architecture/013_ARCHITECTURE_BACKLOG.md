# 013 Architecture Backlog

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document turns architecture decisions into implementation backlog items.

## Epic A1: Supabase Foundation

### A1-001 Define core schemas

- Profiles.
- Meal records.
- Restaurants/menu.
- Social cards.
- Meal Buddy cards.
- Group tables.
- Chat.
- Premium limits.
- Audit logs.

Acceptance: migrations exist and match `04_Data` schema docs.

### A1-002 Enable RLS by table category

Acceptance: every user-data table has explicit RLS policy and test cases.

### A1-003 Create storage buckets and policies

Acceptance: meal photos are private, restaurant/menu photos use controlled public/signed access.

## Epic A2: AI Service Foundation

### A2-001 Create AI analysis job lifecycle

Acceptance: job can be created, processed, completed, failed, and retried.

### A2-002 Implement database-first lookup

Acceptance: known restaurant/menu item path avoids unnecessary model inference.

### A2-003 Store correction loop

Acceptance: user corrections update structured correction records.

## Epic A3: Social Architecture

### A3-001 Unify social identity references

Acceptance: mock and real flows reference the same `userId`, `socialCardId`, `mealBuddyCardId`, `matchId`, `chatId`, and `tableId` concepts.

### A3-002 Separate one-to-one chat and group table chat

Acceptance: group table chat cannot overwrite one-to-one match chat state.

### A3-003 Implement chat list latest-message sorting

Acceptance: sending a message moves that thread to top.

## Epic A4: Deployment and Release

### A4-001 Add preview/staging/production environment split

Acceptance: env variables and data sources are environment-specific.

### A4-002 Add release gate checklist

Acceptance: release cannot be marked ready without typecheck, smoke test, and RLS review for touched tables.

## Epic A5: Observability

### A5-001 Track core funnel events

Acceptance: analytics events exist for AI started, AI confirmed, meal record created, Meal Buddy card created, invitation sent, and premium gate viewed.

### A5-002 Track AI cost and correction rate

Acceptance: analysis job logs cost proxy, latency, confidence, and correction status.
