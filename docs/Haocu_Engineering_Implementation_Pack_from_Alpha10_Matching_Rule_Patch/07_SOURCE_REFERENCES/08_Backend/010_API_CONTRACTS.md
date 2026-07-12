# 010 API Contracts

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document provides MVP-level API contracts for key backend operations.

## Create Meal Buddy Card

### Request

```json
{
  "sourceType": "meal_record | restaurant_menu_item | manual",
  "sourceId": "uuid",
  "restaurantId": "uuid | null",
  "menuItemId": "uuid | null",
  "mealTime": "2026-07-08T19:00:00+08:00",
  "intent": "chat_first | dine_direct",
  "paymentPreferences": ["aa", "split", "treat", "depends"],
  "note": "想找人一起吃這餐"
}
```

### Response

```json
{
  "data": {
    "mealBuddyCardId": "uuid",
    "remainingDailyCards": 1,
    "visibleIn": "meal_buddies"
  }
}
```

## Send Invitation

### Request

```json
{
  "targetUserId": "uuid",
  "mealBuddyCardId": "uuid",
  "invitationType": "chat | dine",
  "message": "要不要先聊聊？"
}
```

### Response

```json
{
  "data": {
    "invitationId": "uuid",
    "status": "pending",
    "chatThreadId": "uuid | null"
  }
}
```

## Respond Invitation

### Request

```json
{
  "invitationId": "uuid",
  "response": "accepted | declined",
  "reason": "optional"
}
```

### Response

```json
{
  "data": {
    "invitationId": "uuid",
    "status": "accepted",
    "matchId": "uuid",
    "chatThreadId": "uuid"
  }
}
```

## Confirm AI Analysis

### Request

```json
{
  "jobId": "uuid",
  "selectedCandidateId": "uuid | null",
  "manualCorrection": {
    "restaurantName": "string | null",
    "dishName": "string",
    "ingredients": [],
    "portion": "string",
    "nutrition": {
      "calories": 620,
      "protein": 35,
      "carbs": 65,
      "fat": 18
    }
  }
}
```

### Response

```json
{
  "data": {
    "mealRecordId": "uuid",
    "nutritionEstimateId": "uuid"
  }
}
```
