# 06 Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08  
Owner: CTO / Product Engineering

This folder defines the system architecture for Haocu OS. It translates Product, PRD, AI, Data, and UI decisions into deployable architecture.

## Architecture Goals

Haocu must remain simple enough for MVP execution while structurally prepared for AI personalization, restaurant data onboarding, social matching, premium gating, and future supply-chain expansion.

The architecture should optimize for:

1. **Fast MVP delivery** using Expo, Next.js, Supabase, and TypeScript.
2. **Data integrity** across meal records, AI analysis, restaurant menus, social cards, meal buddy cards, group tables, and chat.
3. **Database-first AI** so the system learns from verified menu data and user corrections before relying on open-ended model inference.
4. **Privacy by design** with Supabase RLS, consent records, audit logs, and strict profile visibility rules.
5. **Demo readiness** with stable mock fallback, predictable flows, and clean UI states.
6. **Future scalability** toward restaurant admin, investor due diligence, patent review, and multi-market localization.

## Folder Map

- `001_SYSTEM_OVERVIEW.md` — end-to-end system topology.
- `002_DOMAIN_ARCHITECTURE.md` — business domains and bounded contexts.
- `003_CLIENT_ARCHITECTURE.md` — mobile, restaurant web, and admin web clients.
- `004_BACKEND_ARCHITECTURE.md` — Supabase, Edge Functions, services, and RLS.
- `005_INTEGRATION_ARCHITECTURE.md` — AI, storage, notifications, analytics, and external APIs.
- `006_DEPLOYMENT_ARCHITECTURE.md` — environments and deployment topology.
- `007_AUTH_AND_PERMISSION_ARCHITECTURE.md` — roles, sessions, policies, and verification.
- `008_AI_DATA_FLOW_ARCHITECTURE.md` — image analysis, corrections, meal records, recommendations.
- `009_EVENT_NOTIFICATION_ARCHITECTURE.md` — events, reminders, chat, table lifecycle.
- `010_OBSERVABILITY_ARCHITECTURE.md` — logging, metrics, incident visibility.
- `011_SCALABILITY_AND_COST_ARCHITECTURE.md` — cost controls and future scaling points.
- `012_ARCHITECTURE_DECISION_RECORDS.md` — major decisions and tradeoffs.
- `013_ARCHITECTURE_BACKLOG.md` — implementation backlog for architecture work.

## Current Technical Baseline

- Mobile app: Expo React Native + TypeScript + Expo Router.
- Restaurant/admin web: Next.js + TypeScript + Tailwind.
- Backend: Supabase Postgres, Auth, Storage, RLS, Edge Functions.
- AI layer: model orchestration behind backend API; database-first retrieval before model inference.
- Localization: Traditional Chinese first, centralized i18n keys.
- Storage adapter: web localStorage and native AsyncStorage abstraction for demo/local state.

## Architecture Principle

Do not let the AI layer become the product source of truth. The source of truth is structured data: user profile, corrected meal records, restaurant menu data, social graph, limits, and consent.
