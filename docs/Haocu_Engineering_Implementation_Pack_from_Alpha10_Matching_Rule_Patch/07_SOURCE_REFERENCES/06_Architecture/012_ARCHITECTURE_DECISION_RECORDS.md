# 012 Architecture Decision Records

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document records major architecture decisions so future CTOs, engineers, investors, and reviewers understand why the system is shaped this way.

## ADR-001: Use Expo React Native for Mobile MVP

### Decision

Use Expo React Native with TypeScript and Expo Router for the consumer mobile app.

### Rationale

- Fast iteration.
- Web demo possible.
- Single TypeScript codebase.
- Strong fit for early MVP.

### Tradeoff

Some native capabilities may require later native modules or config plugins.

## ADR-002: Use Next.js for Restaurant and Admin Web

### Decision

Use Next.js + TypeScript + Tailwind for restaurant/admin surfaces.

### Rationale

- Good for web dashboards.
- Easy deployment on Vercel.
- Clean separation from mobile UI.

## ADR-003: Use Supabase as Initial Backend Platform

### Decision

Use Supabase Auth, Postgres, RLS, Storage, and Edge Functions.

### Rationale

- Reduces backend setup time.
- Provides secure relational foundation.
- Good fit for MVP and demo.

### Risk

Must design RLS carefully. Service-role usage must stay server-side.

## ADR-004: Database-first AI

### Decision

Before open-ended AI inference, the system checks known menu data, verified restaurant data, and user corrections.

### Rationale

- Improves accuracy.
- Reduces cost.
- Builds defensible taste/nutrition data layer.
- Helps patent and investor narrative.

## ADR-005: Meal Buddy and Group Table Share User Identity but Separate Flow State

### Decision

Social identity is shared through profiles/social cards, but Meal Buddy matches, invitations, one-to-one chat, and Group Tables each have dedicated state.

### Rationale

Prevents bugs where group table participants, matched friends, and chat threads drift into inconsistent identities.

## ADR-006: MVP Multi-photo Data Model, Post-MVP Multi-photo UI

### Decision

The data model can support multiple pre/post meal photo IDs, but MVP UI does not implement full multi-photo capture flow.

### Rationale

Keeps MVP simple while avoiding future schema rewrite.

## ADR-007: Free/Premium Rules Enforced Server-side

### Decision

Client can show premium gates, but daily card limits, candidate limits, real profile unlock, and retention entitlements must be enforced server-side.

### Rationale

Prevents bypass and keeps monetization reliable.

## ADR-008: Keep MVP Chat Simple

### Decision

MVP chat focuses on reliable one-to-one and group table threads. Advanced moderation, media attachments, and complex real-time architecture are post-MVP unless required for safety.

### Rationale

Chat supports meal coordination but should not consume the whole product roadmap.
