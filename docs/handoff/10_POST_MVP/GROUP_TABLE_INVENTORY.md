# 多人餐桌盤點（Group Table Inventory）

> **分類** `POST_MVP` · **狀態** `CANONICAL_CURRENT`（GT-I 結論已接受） · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

多人餐桌（Group Table）是 `POST_MVP`（ODR-013）。本文件滿足 ODR-013「實作前必須先有盤點」的前提；未來計畫見 [GROUP_TABLE_FUTURE_PLAN](GROUP_TABLE_FUTURE_PLAN.md)。

## GT-I 結論

Repository **有**：歷史／demo UI、mock、片段、可重用的 Social／Nutrition／Restaurant 基礎元件。
Repository **沒有**：正式的餐桌 session 權威、正式的成員權威、正式的群體推薦、正式的群組聊天權威。

## 現存物件（不刪除，保留為相容／參考材料）

| 類型 | 位置 | 性質 |
| --- | --- | --- |
| 路由 | `apps/mobile/app/group-tables.tsx` | 目前只渲染 `GroupTableDeferred`（GQA-1 起）；**不是現行功能** |
| 延後頁 | `apps/mobile/features/group-tables/GroupTableDeferred.tsx` | 相容頁面 |
| 歷史 demo | `apps/mobile/features/group-tables/GroupTablesDemo.tsx` | 歷史 UI，不在正常路徑 |
| mock store | `apps/mobile/features/group-tables/groupTableStore.ts`、`apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts` | mock |
| 熱量分攤 mock | `apps/mobile/features/calorie-sharing/*`（含 `calorieSharingMock.ts`、`GroupTableCalorieUpload.tsx`） | mock |
| 資料庫片段 | `public.meal_sharing_allocations.group_table_id`（`text`、可為空、**無外鍵**；`20260712130600`） | `POST_MVP` 片段；GQA-3 保留不動 |
| 舊規格 | `docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/{02_PRD/007_GROUP_TABLE_PRD.md,04_Data/006_GROUP_TABLE_SCHEMA.md,05_UI/010_GROUP_TABLE_UI.md}` 及 Engineering Implementation Pack 的副本 | `HISTORICAL_REFERENCE`（Alpha 10，實作前的構想） |

Meal Buddies 頁面不提供 mock 的多人餐桌建立／加入／邀請／聊天流程（GQA-1 真實性規則）。

## 可重用的基礎

Social 的授權模式（參與、封鎖、候選授權、關係、聊天授權）、營養計算與推薦管線、Restaurant 目錄與 GEO。重用方式由 GT-1 起逐步設計。

## 不要假設

不要把 demo UI、mock 或 schema 片段描述成現行 MVP 功能或「只差接上」的功能。
