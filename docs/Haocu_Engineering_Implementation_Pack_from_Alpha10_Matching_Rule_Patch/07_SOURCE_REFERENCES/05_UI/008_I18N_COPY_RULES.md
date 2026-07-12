# i18n Copy Rules

## Purpose
Ensure Haocu UI copy is consistent, Traditional Chinese-first, and maintainable.

## Rule
Do not hard-code user-facing English strings inside JSX/TSX. Use centralized Traditional Chinese copy, preferably in:

`/lib/i18n/zh-TW.ts`

## Tone

Use friendly, practical Taiwanese Traditional Chinese.

Preferred:

- “拍照分析”
- “今日飲食”
- “飯友卡”
- “多人飯局”
- “先聊聊”
- “邀請吃飯”
- “用這餐找飯友？”
- “估算結果，可再修正”

Avoid:

- overly technical terms
- shame-based diet language
- mixed English labels unless brand/technical required
- inconsistent translations for the same feature

## Glossary

| English/Internal | User-Facing zh-TW |
|---|---|
| Meal Buddy | 飯友 |
| Meal Buddy Card | 飯友卡 |
| Group Table | 多人飯局 / 四人餐桌 depending context |
| AI Analysis | AI 分析 |
| Today Intake | 今日飲食 |
| Food Diary | 美食日記 |
| Premium | Premium / 進階版 |
| Recommendation | 推薦 |
| Correction | 修正 |

## Copy Safety

AI/nutrition copy should use:

- “估算”
- “參考”
- “可能”
- “建議可以”

Avoid:

- “保證”
- “一定”
- “治療”
- “你不健康”

## Acceptance Criteria

1. Repeated UI labels use the same i18n key.
2. No major user-facing English remains in mobile UI.
3. AI copy communicates estimate and correction.
4. Premium copy is value-oriented.
5. Social copy is clear and non-creepy.
