# 009 Localization

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines localization rules.

## Primary Language

Traditional Chinese zh-TW is the primary language for MVP.

## i18n Rules

- Do not hard-code visible English text in JSX.
- Centralize copy in `/lib/i18n/zh-TW.ts` or shared package.
- Use consistent terms across screens.
- Keep product nouns stable.

## Key Terms

- 好廚 / Haocu.
- AI 分析.
- 今日飲食.
- 美食日記.
- 飯友卡.
- 飯友列表.
- 多人飯局.
- 四人餐桌.
- 社群卡.
- 先聊聊.
- 邀請吃飯.
- 匿名頭像.
- 真人頭像.
- Premium.

## Copy Tone

- Friendly.
- Clear.
- Not too technical.
- No shame-heavy diet language.
- Avoid medical overclaim.

## Error Copy

Good:

- `今天的飯友卡額度已用完，可以明天再建立，或升級 Premium 增加次數。`

Avoid:

- `LIMIT_EXCEEDED`
- `Operation failed`
- `Unknown error`
