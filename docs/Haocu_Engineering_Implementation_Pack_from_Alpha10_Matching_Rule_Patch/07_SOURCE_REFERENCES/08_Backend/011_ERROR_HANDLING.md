# 011 Error Handling

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines backend error handling.

## Error Shape

```json
{
  "error": {
    "code": "LIMIT_EXCEEDED",
    "message": "Daily limit reached.",
    "recoverable": true,
    "details": {}
  }
}
```

## Common Error Codes

### Auth

- `AUTH_REQUIRED`
- `SESSION_EXPIRED`
- `FORBIDDEN`
- `ROLE_REQUIRED`

### AI

- `PHOTO_UPLOAD_REQUIRED`
- `AI_JOB_NOT_FOUND`
- `AI_JOB_FAILED`
- `AI_LOW_CONFIDENCE`
- `AI_CONFIRMATION_INVALID`

### Meal

- `MEAL_RECORD_NOT_FOUND`
- `MEAL_SAVE_FAILED`
- `NUTRITION_ESTIMATE_INVALID`

### Meal Buddy

- `LIMIT_EXCEEDED`
- `CARD_NOT_FOUND`
- `CARD_INACTIVE`
- `INVITATION_DUPLICATE`
- `CANDIDATE_UNAVAILABLE`

### Chat

- `THREAD_NOT_FOUND`
- `NOT_THREAD_PARTICIPANT`
- `MESSAGE_SEND_FAILED`

### Group Table

- `TABLE_FULL`
- `TABLE_NOT_OPEN`
- `NOT_TABLE_PARTICIPANT`
- `CANCELLATION_REASON_REQUIRED`

### Restaurant

- `RESTAURANT_NOT_FOUND`
- `MENU_ITEM_NOT_FOUND`
- `RESTAURANT_PERMISSION_DENIED`

## Logging Rule

Log enough for debugging, but do not log:

- access tokens,
- service role keys,
- full private photo URLs,
- private chat content except controlled moderation workflows,
- raw AI prompts if they contain private user data.
