# 005 Frontend QA Checklist

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This checklist is used before demo and release.

## Global

- No TypeScript errors.
- No obvious layout overflow on common mobile widths.
- No hard-coded English strings in visible UI.
- No broken navigation routes.
- Loading/error/empty states present.
- Free/Premium state visibly changes expected limits.

## AI Analysis

- Camera/upload entry works or demo fallback works.
- Candidate results display.
- Manual correction expands.
- Save creates meal record.
- Today Intake updates from saved record.
- Create Meal Buddy card path works after analysis.

## Today Intake / Food Diary

- Home summary and full report use same data source.
- Scheduled dinner appears as scheduled, not eaten.
- Ratings display in diary.
- Premium Top10 gate/retention is clear.

## Meal Buddy

- My Meal Buddy cards visible.
- Search appears only in matched/friend context.
- Chat tab does not show irrelevant search.
- Group Table entry is clear but not too large.
- Daily limit message is clear.

## Restaurant

- Restaurant card opens detail.
- Create Meal Buddy card from restaurant context is visible.
- Date selector appears near restaurant card context.
- Created card appears in Meal Buddy page.

## Chat

- Sending message updates thread order.
- Back/return goes to chat list.
- One-to-one and group chats are separate.

## Profile

- Mascot avatar and real profile avatar are visually distinguishable.
- Premium identity unlock is visible.
- Verification state has clear label.
