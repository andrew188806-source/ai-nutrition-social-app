# 014 Engineering Backlog

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This backlog converts architecture and PRD into engineering tasks.

## Epic E1: Demo Stabilization

- E1-001 Fix all TypeScript errors.
- E1-002 Ensure Expo web demo runs.
- E1-003 Centralize i18n strings.
- E1-004 Remove duplicate top demo flow bars if still present.
- E1-005 Ensure clean white home layout and high-contrast cards.

## Epic E2: Meal Record Foundation

- E2-001 Replace single latest corrected meal object with meal record collection.
- E2-002 Sync Today Intake and nutrition report from meal records.
- E2-003 Add meal rating state.
- E2-004 Add scheduled/draft dinner state.

## Epic E3: AI Analysis

- E3-001 Create AI analysis result type.
- E3-002 Add candidate selection.
- E3-003 Add manual correction form state.
- E3-004 Confirm analysis into meal record.
- E3-005 Record correction feedback.

## Epic E4: Meal Buddy and Chat

- E4-001 Unify mock user/social card/meal buddy/match/chat IDs.
- E4-002 Create Meal Buddy card from AI result.
- E4-003 Create Meal Buddy card from restaurant card.
- E4-004 Enforce free/premium limits.
- E4-005 Fix chat return tab.
- E4-006 Sort chat list by latest message.
- E4-007 Accept invitation updates match/friend state.

## Epic E5: Group Table

- E5-001 Separate group table data from one-to-one chat.
- E5-002 Add group table participant list.
- E5-003 Add cancellation reason system message.
- E5-004 Add completion feedback placeholder.

## Epic E6: Supabase Migration

- E6-001 Create core migrations.
- E6-002 Create RLS policies.
- E6-003 Create storage buckets.
- E6-004 Implement Edge Function contracts.
- E6-005 Add analytics events.
