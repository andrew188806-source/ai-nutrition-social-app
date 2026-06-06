# 好初 AI 營養社交 MVP

這是面向台灣市場的投資人 Demo 與工程交接版本。核心產品是 Mobile Consumer App：使用者用餐點照片建立 Food Memory，取得 AI/mock 營養估算、下一餐建議，並透過 Community Card 找附近飲食目標相近的飯友。

## Apps

- `apps/mobile`: Expo React Native + Expo Router，主要投資人 demo。
- `apps/restaurant-web`: Next.js 餐廳後台，支援菜單營養揭露、餐廳標籤、驗證與 analytics。
- `apps/admin-web`: Next.js 平台管理後台，展示審核、ESG、社交安全、標籤治理與 AI 辨識稽核。
- `packages/shared`: 共用 TypeScript types 與 mock data。
- `lib/i18n/zh-TW.ts`: 所有使用者可見文案集中管理。

## Run

Unified investor demo startup:

```powershell
cd "D:\haocu app\ai-nutrition-social-mvp"
npm.cmd run demo
```

The demo command starts or reuses:
- Mobile App: `http://localhost:8081`
- Restaurant Dashboard: `http://localhost:3001`
- Admin Dashboard: `http://localhost:3002`

If a port is already occupied, the script prints a warning and keeps the existing service.

```bash
npm install
npm run mobile
npm run restaurant
npm run admin
```

開啟：

- Mobile: `http://localhost:8081`
- Restaurant Dashboard: `http://localhost:3001`
- Admin Dashboard: `http://localhost:3002`

## Demo Story

主要流程：首頁 → 餐點照片 → AI/location 餐廳菜單辨識 → Food Memory → 下一餐推薦 → Community Card → 社交配對 → 四人開桌 → 餐廳推薦 → 權限/治理入口。

所有 AI、付款、訂閱、廣告、地圖、穿戴裝置、推播與後端資料均為 mock 或 placeholder。此產品定位為生活化健康飲食與社交探索，不是醫療診斷或治療建議。
