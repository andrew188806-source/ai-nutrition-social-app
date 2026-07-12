# Empty, Loading, and Error States

## Purpose
Define predictable UI states so MVP feels reliable even when data is missing, AI fails, or network is unstable.

## Empty States

### No Meal Records
Message:
- “今天還沒有紀錄餐點，先拍一張來分析吧。”
Action:
- 拍照分析

### No Meal Buddy Card
Message:
- “建立飯友卡，看看今天誰也想一起吃。”
Action:
- 建立飯友卡

### No Restaurant Results
Message:
- “目前找不到符合條件的餐廳，可以放寬篩選看看。”
Action:
- 清除篩選

### No Chats
Message:
- “還沒有聊天，先從飯友卡開始吧。”
Action:
- 找飯友

## Loading States

- AI analysis: friendly mascot/progress.
- Restaurant search: skeleton restaurant cards.
- Chat: message skeleton.
- Diary: daily card skeleton.

## Error States

| Error | UI |
|---|---|
| AI failed | Retry or manual entry. |
| Network failed | Retry and preserve input. |
| Quota exceeded | Show quota and Premium value. |
| Upload failed | Retry upload. |
| Permission denied | Explain camera/photo permission. |
| Restaurant unavailable | Return to list and show notice. |

## Copy Rules

- Explain what happened.
- Offer one clear next action.
- Avoid blaming user.
- Preserve user input where possible.

## Acceptance Criteria

1. Every key screen has empty/loading/error states.
2. AI failure does not block manual meal record creation.
3. Quota errors show plan-aware explanation.
4. Navigation errors have safe fallback.
5. Demo flows do not end in raw technical errors.
