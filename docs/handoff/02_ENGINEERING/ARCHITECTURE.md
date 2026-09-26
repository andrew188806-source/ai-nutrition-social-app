# 架構（Architecture）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

## 技術堆疊

| 介面 | 技術 | 版本（`docs/engineering-state-registers.md` TD-12） |
| --- | --- | --- |
| Consumer App `apps/mobile` | Expo／React Native／TypeScript／Expo Router；另輸出 Expo Web | Expo 54、React Native 0.81.5、React 19.1 |
| Restaurant `apps/restaurant-web` | Next.js（App Router）／TypeScript／Tailwind | Next 14.2.35、React 18.3.1、Tailwind 3.4 |
| Admin `apps/admin-web` | Next.js（App Router）／TypeScript／Tailwind | 同上 |
| 後端 | Supabase：PostgreSQL 17、Auth、Storage、Realtime、Edge Functions（Deno） | — |
| 共用 | `packages/shared`（domain、mock、型別）、`packages/services` | — |
| 語系 | 繁體中文，單一模組 `lib/i18n/zh-TW.ts`（無 i18n 函式庫） | — |

## 主要邊界

- **授權在資料庫。** 寫入走 SECURITY DEFINER RPC，並以 JWT 推導行為者、在函式內檢查權限；RLS 管讀取。瀏覽器不直接寫資料表。
- **封存授權模式（sealed authority）。** 私有 schema `admin_internal`、`restaurant_internal`、`social_internal`、`geo_internal`，函式由 NOLOGIN 封存角色擁有。詳見 [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md)。
- **推薦管線**：GEO → 過敏 → 食材忌口 → 時段 → 營養 → 口味；限制條件是資格閘門，與排序分開。
- **距離由資料庫計算**（GEO-1A），行動端僅前景、單次工作階段取得位置（GEO-1B）。
- **AI 餐點分析**：Edge Function 以伺服器端呼叫外部多模態供應商；使用者確認後才定稿。無自有模型。
- **設定只靠名稱。** 專案 URL／金鑰由設定提供，不編譯進程式；Consumer 在設定缺漏時拒絕建立 live client（H1）。

## Restaurant 與 Admin 的層次

Restaurant：伺服器路由 → repository → RPC；瀏覽器從不直接呼叫 Supabase，也不直接寫表。Admin：路由登錄表控管頁面，所有 RPC 與寫入各自重新檢查權限。

## 延伸閱讀

- 系統詳細描述：`docs/engineering-handoff.md`
- 架構彈性／僵化稽核、相依與供應商耦合：`docs/engineering-state-registers.md` §4–§6
