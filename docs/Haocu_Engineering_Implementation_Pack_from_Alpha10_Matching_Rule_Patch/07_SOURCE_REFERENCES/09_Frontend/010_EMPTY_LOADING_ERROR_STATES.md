# 010 Empty Loading Error States

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines empty, loading, and error states.

## Global Rules

- Never show a blank page without explanation.
- Loading should indicate what is being loaded.
- Empty states should suggest a next action.
- Errors should provide recovery where possible.

## AI Analysis

### Empty

No analysis yet → prompt user to拍照 or upload.

### Loading

Analyzing photo → show progress and friendly copy.

### Error

Analysis failed → offer retry and manual input.

## Today Intake

### Empty

No meals today → prompt AI analysis or manual add.

### Error

Cannot load meals → retry.

## Meal Buddy

### Empty

No active card → create from AI analysis or restaurant.

### Limit Reached

Show current plan, limit, reset timing, and upgrade path.

## Chat

### Empty

No chats yet → suggest inviting a Meal Buddy.

### Error

Message failed → retry send.

## Restaurant

### Empty

No matching restaurants → adjust filter or search.

### Error

Location unavailable → allow manual area search.

## Admin/Restaurant Web

Empty states should explain operational next step, not use playful consumer copy.
