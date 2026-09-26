# 餐廳定價（Restaurant Pricing）

> **分類** `BUSINESS_MONETIZATION` · **狀態** `OPEN`（`PRICING_HYPOTHESIS_CONFLICT`） · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

> **餐廳定價尚未決定、也未經市場驗證。** 以下三種結構互相衝突；本文件**不**從中挑選，也不合併成一張虛構價目表。決策追蹤：[OPEN_DECISIONS](../11_DECISION_REGISTERS/OPEN_DECISIONS.md)。

| ID | 結構 | 來源 | 狀態 |
| --- | --- | --- | --- |
| PH-1 | 訂閱制：Basic NT$1,980／月、Standard NT$3,980／月（含 TastKind 代建菜品與拍攝配額；季／半年／年方案；加購每道 NT$200／350） | 2026-07 價格文件 | `PRICING_HYPOTHESIS` |
| PH-4 | 約 NT$500／月入門方案＋較重的交易經濟 | 2026-09-19 brief | `PRICING_HYPOTHESIS` |
| PH-5 | NT$3xxx 較高月費，主要以 TastKind 帶來的交易變現 | 2026-09-19 brief | `PRICING_HYPOTHESIS` |

## 相關衝突

- **PC-1**：上述三種結構並存，無來源指出哪一個是現行版本；PH-4／PH-5 需要尚不存在的交易路徑。
- **PC-2**：PH-1 的「每月代建菜品／拍攝配額」與餐廳自助目錄模式（ODR-003）衝突。與創始方案的 100 道配額**無關**（後者已決定）。
- **PC-4**：BD 佣金概念以「訂閱價值」計算，而訂閱價值在 PC-1 未決前沒有定義。
- PC-3（創始方案 15 vs 100 道）**已解決**：見 [EARLY_BIRD_FOUNDING_RESTAURANTS](EARLY_BIRD_FOUNDING_RESTAURANTS.md)。

## 與權限無關

餐廳在 App 內能做什麼（租戶與擁有權）屬安全主題，見 [RESTAURANT_TENANCY](../03_SECURITY_AUTHORITY/RESTAURANT_TENANCY.md)。

## 來源

`governance/COMPANY_STRATEGY_AND_OPERATING_MODEL.md` §1、§5。
