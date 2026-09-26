# 廣告變現（Advertising Monetization）

> **分類** `BUSINESS_MONETIZATION` · **狀態** 未來概念（`PLANNED` 概念，**未實作**） · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

> **目前沒有任何廣告實作**，也沒有情境式廣告投放。

## 概念中的兩層

| 層 | 內容 | 狀態 |
| --- | --- | --- |
| 1. 一般廣告聯播網 | 例如 Google AdMob | 概念 |
| 2. 高價值情境廣告 | 依營養／飲食情境投放，例如相關的保健／營養補充品廣告 | 概念 |

## 治理要求（未來）

- 隱私與同意：以營養／飲食資料做情境投放前，必須有明確同意與治理規則（`LEGAL_TAX_ADVICE_REQUIRED`）。
- 不替廣告主做健康宣稱；平台不背書廣告產品功效。
- 廣告治理規則尚未決定（見 [OPEN_DECISIONS](../11_DECISION_REGISTERS/OPEN_DECISIONS.md)）。

## Repository 事實

Admin 舊版 `/ad-review`、`/sponsored` 路由在 ADMIN-E1 已改為 `RETIRED_NOT_AVAILABLE`；登錄表中的 `/admin/operations/ads`、`/admin/operations/sponsored` 只是 DEMO 骨架（權限鍵為 PLANNED、無資料模型）；`packages/services` 的 ad-review 為 placeholder stub。這些都**不是**廣告功能（`docs/admin-operational-surface-inventory.md`）。

## 來源

GQA-4 Planner brief（2026-09-26）；`docs/engineering-state-registers.md` TD-06／TD-13。
