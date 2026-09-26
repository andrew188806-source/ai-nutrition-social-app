# Restaurant 產品（Restaurant Owner Product）

> **分類** `PRODUCT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

Restaurant Owner 後台：`apps/restaurant-web`（Next.js 14）。本文件只談產品功能。
權限／租戶模型見 [RESTAURANT_TENANCY](../03_SECURITY_AUTHORITY/RESTAURANT_TENANCY.md)；價格與商業方案見 [RESTAURANT_PRICING](../08_BUSINESS_MONETIZATION/RESTAURANT_PRICING.md)。

## 營運模式（ODR-003，`CURRENT_PRODUCT_DECISION`）

餐廳自行建立並維護菜單目錄；平台人員不是例行的資料輸入者（避免人力隨餐廳數線性成長）。

## 現行自助功能（`LIVE_ACCEPTED`，Development，R2D/R2E）

| 功能 | 說明 |
| --- | --- |
| 菜單 Menu | 建立、改名、狀態（draft／published／archived） |
| 分類 Category | 建立、改名、排序（**刪除為 `DEFERRED`**） |
| 菜品 Menu Item | 建立、編輯內容、狀態（draft／active／archived） |
| 分店菜品連結 | 建立分店與菜品的供應連結（branch menu linkage） |
| 價格 | 分店菜品價格（整數新台幣 1–999,999） |
| 分店專屬顯示名稱 | `branch_specific_name`；空值時回到 `menu_items.name` |
| 售完／供應狀態／可見性 | 分店菜品層級 |
| 分店資料 | 顯示名稱、公開電話、每週營業時間、特殊日期、臨時停業 |
| 餐廳介紹、網站、社群連結 | `/restaurant/settings` |
| 營養摘要 | 唯讀 |

可見性規則：新菜單與菜品一律從 `draft` 開始；Consumer 公開可見取決於生命週期、餐廳／分店狀態與分店供應條件。**營養資料不是可見性的前提**，但缺少營養資料的菜品不會進入需要營養資料的推薦（ODR-005）。

## 明確未開放（不是缺陷）

| 項目 | 狀態 |
| --- | --- |
| `/vip`（VIP 方案頁） | **未開放**。GQA-2 以 `DeferredCapabilityNotice` 明確顯示；不存在 live VIP 後端 |
| `/verification`（認證頁） | **未開放**。同上；不存在 live 認證後端 |
| 分類刪除、媒體／圖片上傳、餐廳改名 | `DEFERRED` |
| 建立餐廳、Owner 帳號開通、建立分店 | `DEFERRED`（獨立的上線開通議題） |
| 員工／團隊寫入權限、分析報表、店務助理、待審菜品、訂單／桌位 | `DEFERRED`（已從主導覽隱藏） |
| Mock 模式寫入 | Mock 模式（`TASTKIND_RESTAURANT_DATA_SOURCE=mock`）沒有寫入路徑 |

## 不要假設

- 不要宣稱已有 VIP、認證、帳單或付款後端。
- 不要把「營養認證徽章」描述為政府／醫療／第三方認證。
- 不要承諾餐廳固定排名、曝光量、來客或營收。

## 來源

`docs/engineering-handoff.md`（Restaurant Owner Console）、`docs/restaurant-owner-catalog-authoring-r2b.md`、`docs/engineering-state-registers.md` §1.1／§3、`governance/OWNER_PRODUCT_DECISION_REGISTER.md`（ODR-003～006）；GQA-2 提交 `075a6f7`。
