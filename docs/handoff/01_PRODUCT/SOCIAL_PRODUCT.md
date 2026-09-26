# Social／Meal Buddy 產品（Social Product）

> **分類** `PRODUCT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

授權與隱私邊界見 [SOCIAL_AUTHORITY](../03_SECURITY_AUTHORITY/SOCIAL_AUTHORITY.md)；Premium 價格假設見 [REVENUE_MODEL](../08_BUSINESS_MONETIZATION/REVENUE_MODEL.md)。

## 產品意圖（凍結）

- **所有正式配對入口都經由飯友卡（Meal Buddy Card）**；沒有平行的「直接找人」入口（ODR-002）。
- **使用者不手動選擇隱藏的餐點情境分類。** 情境來自使用者所選的具體推薦／菜品；情境與評分資料是後端配對資料（ODR-012）。
  - 實作註記：由推薦帶入的飯友卡攜帶食物情境鍵；另有一條無情境的自由文字卡片路徑（視為中性）。未發現任何分類挑選器。
- 目前的「雙人」社交與未來的多人餐桌是**不同領域**；多人餐桌不是現行社交功能（見 [GROUP_TABLE_INVENTORY](../10_POST_MVP/GROUP_TABLE_INVENTORY.md)）。

## 現行功能（`LIVE_ACCEPTED`，Development E2E）

飯友卡 → 候選 → 邀請 → 關係 → 聊天（含即時）→ 推播後端；參與設定（加入／暫停／恢復／退出）、封鎖、解除好友、社交興趣設定。

## 方案差異（產品政策數值，不代表已有帳單）

| 項目 | Free | Premium | 來源 |
| --- | --- | --- | --- |
| 候選曝光上限 | 3 | 10 | `supabase/functions/_shared/social-exposure/policy.ts` |
| 同時有效飯友卡 | 一般 1、餐廳 1 | 一般 3、餐廳 2 | `supabase/functions/_shared/meal-buddy-card-api/policy.ts` |
| Premium 文案價值 | — | 更多配對次數、查看完整飯友資料、健康目標模式、更清楚的配對原因 | `lib/i18n/zh-TW.ts` |

付款／訂閱結帳尚未實作（`DEFERRED`）。

## 技術債

實體裝置推播的送達與點擊行為**尚未驗收**；Social MVP 因此不是「FINAL CLOSED」。見 [TECHNICAL_DEBT](../02_ENGINEERING/TECHNICAL_DEBT.md)。

## 來源

`governance/OWNER_PRODUCT_DECISION_REGISTER.md`（ODR-002、ODR-012）、`governance/RECONCILIATION_2026-09-19.md`（R-11、R-12）、`docs/engineering-state-registers.md`（TD-05、§4 CONFIGURE）。
