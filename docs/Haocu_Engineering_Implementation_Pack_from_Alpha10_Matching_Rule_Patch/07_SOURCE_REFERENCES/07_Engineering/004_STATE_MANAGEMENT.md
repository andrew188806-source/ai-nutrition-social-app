# 004 State Management

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines state management principles for Haocu.

## State Categories

### Remote State

Stored in Supabase or fetched through APIs:

- Meal records.
- Restaurants and menu items.
- Social cards.
- Meal Buddy cards.
- Matches and invitations.
- Group tables.
- Chat messages.
- Premium entitlements.

### Local UI State

Stored in component state or local hooks:

- Selected tab.
- Expanded/collapsed cards.
- Search text.
- Filter chips.
- Draft form values.
- Loading spinners.

### Persistent Local State

Stored through storage adapter:

- Demo user mode.
- Free/Premium demo switch.
- Last selected filters.
- Draft analysis state where appropriate.

### Derived State

Computed from source state:

- Today nutrition summary.
- Recommended next meal.
- Remaining Meal Buddy card quota.
- Chat list sorted by latest message.
- Visible social identity mode.

Derived state should not become a competing source of truth.

## Storage Adapter Requirement

Implement a cross-platform storage adapter:

```ts
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

- Web: localStorage.
- Native Expo: AsyncStorage.
- Tests: memory adapter.

## Critical Sync Rule

Today Intake summary and full nutrition report must read from the same meal record collection. Do not let one screen read mock data while another reads a hard-coded summary.

## Chat Sorting Rule

Chat thread list must sort by `lastMessageAt` descending. When a message is sent, the thread's `lastMessageAt` updates and the list reorders immediately.

## Meal Buddy Rule

Creating a restaurant-based Meal Buddy card must update the same Meal Buddy card collection used by the Meal Buddy page. Do not create a hidden restaurant-only card.
