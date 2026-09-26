# Restaurant 租戶與擁有權（Restaurant Tenancy）

> **分類** `SECURITY_AUTHORITY` · **狀態** `CANONICAL_CURRENT`（`FROZEN`） · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

本文件是權限／安全主題。餐廳價格與商業方案是 `BUSINESS_MONETIZATION`（見 [RESTAURANT_PRICING](../08_BUSINESS_MONETIZATION/RESTAURANT_PRICING.md)），不在此處。

## 擁有權模型

餐廳 Restaurant → 菜單 Menu → 分類 Menu Category → 菜品 Menu Item；分店 Branch 與菜品之間以分店菜品（`branch_menu_items`）連結。

- `menu_items.name` 是**該餐廳租戶內**的正式菜名，不是全平台共用的菜名權威；`branch_specific_name` 是選用的分店覆寫（ODR-004）。
- 資料庫觸發器強制 `menu_items.restaurant_id`／`branch_menu_items.restaurant_id` 與其菜單／分店／菜品鏈一致（租戶一致性）。

## Owner 權限

- 寫入權限：`menu.write`、`menu_category.write`、`menu_item.write`、`branch_menu_item.create`，以及分店營運欄位（售完、供應、價格、可見性、顯示名稱、營業時間等）。
- 每個寫入都經 SECURITY DEFINER RPC，以 JWT 推導行為者並檢查其餐廳成員資格；讀取由 owner-only RLS 管控；所有寫入都有版本併發檢查。
- Owner 權限**不包含**：驗證過的營養資料、`nutrition_badge_status`、`badge_enabled`、平台營養審核、平台分類、其他餐廳的目錄、Admin 權限。
- `manager`／`staff` 角色存在，只有分店範圍讀取，**沒有任何寫入權限**（刻意設計）。
- 選定餐廳／分店的 cookie 只是 UX 偏好，**不是授權憑證**；每次請求都重新驗證。

## Consumer 公開發布邊界

- Consumer 只能經由公開安全的投影讀取目錄（例如 `consumer_public_restaurant_catalog_v*` 等 view）；僅顯示已發布、且符合餐廳／分店狀態與分店供應條件的內容。
- `draft` 內容不會公開；營養資料不是可見性前提。
- 唯一的 anon 可執行 SECURITY DEFINER 函式是經審閱的 Consumer 目錄包裝函式 `restaurant_internal.consumer_branch_current_temporal_state_v1`（GQA-3 靜態掃描）。

## 來源

`docs/restaurant-owner-catalog-authoring-r2b.md`、`docs/restaurant-canonical-data-boundary.md`、`docs/engineering-state-registers.md` §1.1、GQA-3 `scripts/db-object-contract-scan.mjs`。
