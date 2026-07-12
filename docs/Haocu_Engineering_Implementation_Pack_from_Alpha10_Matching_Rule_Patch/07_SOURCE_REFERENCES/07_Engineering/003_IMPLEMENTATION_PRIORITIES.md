# 003 Implementation Priorities

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines the engineering implementation sequence.

## Priority 0: Stabilize Demo Baseline

1. Fix all mobile TypeScript errors.
2. Ensure Expo web demo runs consistently.
3. Keep core navigation stable.
4. Remove duplicate or dead UI paths.
5. Centralize Traditional Chinese copy.

## Priority 1: Data Model Integrity

1. Replace `latestCorrectedMealRecord` with real meal record collection.
2. Unify Meal Buddy and Group Table data models.
3. Ensure chat list sorts by latest message timestamp.
4. Ensure accepted invitations correctly update Meal Buddy/friend relationship state.
5. Create cross-platform storage adapter: localStorage for web, AsyncStorage for native.

## Priority 2: AI Analysis to Meal Record

1. Create durable AI analysis result object.
2. Allow candidate selection and manual correction.
3. Save confirmed result to meal records.
4. Sync Today Intake and full nutrition report from the same source.
5. Add rating reminder state.

## Priority 3: Meal Buddy and Social Flow

1. Create Meal Buddy card from AI result or restaurant card.
2. Enforce free/premium card limits.
3. Show created restaurant-based card in visible Meal Buddy context.
4. Support invite-to-chat and invite-to-eat flows.
5. Separate matched, invited, chat, and group table states clearly.

## Priority 4: Restaurant Flow

1. Restaurant list search/filter.
2. Restaurant card detail.
3. Menu item relation to Meal Buddy card.
4. Restaurant Group Table entry.
5. Restaurant admin menu and nutrition disclosure later.

## Priority 5: Premium and Profile

1. Premium mode toggle in demo.
2. Anonymous mascot vs real profile visual distinction.
3. Premium gates and limit messaging.
4. Verification state placeholder.

## Priority 6: Backend Migration

1. Supabase schema migrations.
2. RLS policies.
3. Edge functions for AI, Meal Buddy, invitation, group table.
4. Storage buckets.
5. Analytics events.

## Priority Rule

Do not build advanced features on top of unstable domain identity. Social data model cleanup must happen before adding more social UI.
