# MVP 範圍（MVP Scope）

> **分類** `PRODUCT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

本文件界定「現行 MVP 包含什麼、不包含什麼」。各介面的細節只在各自文件中維護。

## 現行 MVP（已實作）

| 介面 | 正式文件 | 驗收層級 |
| --- | --- | --- |
| Consumer App（`apps/mobile`，Expo／Expo Web） | [CONSUMER_PRODUCT](CONSUMER_PRODUCT.md) | `LIVE_ACCEPTED`（Development）；GQA-1 真實性修正 `LOCAL_ACCEPTED`＋已推送 |
| Social／Meal Buddy | [SOCIAL_PRODUCT](SOCIAL_PRODUCT.md) | `LIVE_ACCEPTED`（Development E2E）；實機推播未驗收 |
| Restaurant Owner 後台（`apps/restaurant-web`） | [RESTAURANT_PRODUCT](RESTAURANT_PRODUCT.md) | `LIVE_ACCEPTED`（Development，R2D/R2E） |
| 平台 Admin 後台（`apps/admin-web`） | [ADMIN_PRODUCT](ADMIN_PRODUCT.md) | ADMIN-A～E `LIVE_ACCEPTED`（Development）；MRB `LOCAL_ACCEPTED` |

「`LIVE_ACCEPTED`」在本文件集一律指 **Development** 環境的驗收；Production 後端從未啟用（見 [ENVIRONMENT_MATRIX](../04_DEPLOYMENT_ENVIRONMENTS/ENVIRONMENT_MATRIX.md)）。

## Consumer 功能範圍凍結

Consumer 主要功能範圍已凍結（ODR-011，`CURRENT_PRODUCT_DECISION`）。仍允許在既有功能內調整：營養計算方法、餐廳推薦原則、Meal Buddy 配對分數組成（屬演算法／規則調整，不是新產品線）。

## 明確不在 MVP 內

| 項目 | 狀態 | 正式文件 |
| --- | --- | --- |
| 多人餐桌 Group Table、桌菜模式 | `POST_MVP` | [GROUP_TABLE_INVENTORY](../10_POST_MVP/GROUP_TABLE_INVENTORY.md) |
| 收藏品實體、所有權轉移、市集 | `POST_MVP` | [COLLECTIBLES_MARKETPLACE](../10_POST_MVP/COLLECTIBLES_MARKETPLACE.md) |
| TastKind 點數、餐廳點數 | `POST_MVP` / `DEFERRED` | [POINTS_ECONOMY](../10_POST_MVP/POINTS_ECONOMY.md) |
| POS／收據辨識擴充 | `POST_MVP` / `DEFERRED` | [POS_RECEIPT_INTEGRATION](../10_POST_MVP/POS_RECEIPT_INTEGRATION.md) |
| 訂閱付款、帳單、營養師角色、Restaurant 媒體上傳等 | `DEFERRED` | [OTHER_DEFERRED_FEATURES](../10_POST_MVP/OTHER_DEFERRED_FEATURES.md) |
| 廣告變現 | 未來概念 | [ADVERTISING_MONETIZATION](../08_BUSINESS_MONETIZATION/ADVERTISING_MONETIZATION.md) |

## 真實性原則（適用所有介面）

- 不顯示假資料當作真實營運資料（GQA-1／GQA-2 已移除 Consumer 假分數、假日記來源，並讓 Restaurant `/vip`、`/verification` 明確顯示「尚未開放」）。
- AI 營養估算是估算，不是醫療診斷、精準量測或減重保證。
- 平台內「營養認證徽章」不得被描述為政府、醫療或第三方實驗室認證（見 [BUSINESS_MODEL](../08_BUSINESS_MONETIZATION/BUSINESS_MODEL.md)）。

## 來源

`governance/OWNER_PRODUCT_DECISION_REGISTER.md`（ODR-011、ODR-013～024）、`docs/engineering-handoff.md`、`docs/engineering-state-registers.md` §1／§3。
