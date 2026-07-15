# 好廚 AI 營養社交 MVP

這是一個以 Expo React Native 為主的投資展示 MVP，涵蓋 AI 餐點分析、今日攝取、美食日記、餐廳推薦、飯友配對、聊天與四人餐桌。

## Workspace

- `apps/mobile`: Expo Router 消費者端 Demo
- `apps/restaurant-web`: 餐廳端 Next.js Demo
- `apps/admin-web`: 管理端 Next.js Demo
- `apps/mobile/features`: Mobile 共用狀態、mock 規則與可重用元件
- `packages/shared`: 跨 App 共用型別、domain policy 與 mock 資料
- `lib/i18n/zh-TW.ts`: 主要繁體中文 UI 文案

## Commands

```powershell
cd "D:\haocu app\ai-nutrition-social-mvp"
npm.cmd run typecheck
npm.cmd run demo
```

## Engineering Handoff

目前架構、mock 資料來源、後端替換入口與已知 TODO 請見 [`ENGINEER_HANDOFF.md`](./ENGINEER_HANDOFF.md)。

目前 Runtime Integration 的唯一 canonical phase roadmap 請見 [`docs/tastkind-runtime-integration-roadmap.md`](./docs/tastkind-runtime-integration-roadmap.md)；舊產品、投資與 demo phase schemes 不覆蓋該 roadmap。

本專案目前是前端 Demo。AI、資料保存、聊天、通知、付款與審核流程尚未連接正式後端。
