# 餐廳開發（Restaurant Acquisition）

> **分類** `OPERATIONS_GTM` · **狀態** `CANONICAL_CURRENT`（`OPERATING_MODEL`，未實作） · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

創始方案內容見 [EARLY_BIRD_FOUNDING_RESTAURANTS](../08_BUSINESS_MONETIZATION/EARLY_BIRD_FOUNDING_RESTAURANTS.md)；價格見 [RESTAURANT_PRICING](../08_BUSINESS_MONETIZATION/RESTAURANT_PRICING.md)。

## 創始／早鳥餐廳開發（`TARGET` / `HYPOTHESIS`）

- 以創始方案吸引第一批餐廳；群眾募資可能成為餐廳開發的佐證（見 [CROWDFUNDING_LAUNCH](CROWDFUNDING_LAUNCH.md)）。
- 過去規劃目標（例如 25＋25 家）是 `TARGET`，不是結果。

## BD 營運模式（`OPERATING_MODEL`，**沒有任何系統實作**）

| ID | 規則 | 狀態 |
| --- | --- | --- |
| BM-01 | 啟用碼（Activation Code）輸入並確認後，餐廳才算商業啟用；未來系統應可歸因到對應 BD 紀錄 | `OPERATING_MODEL` |
| BM-02 | 啟用前可依條款退款；有效啟用後預設不退款（除非有定義的例外） | 商業政策輸入 |
| BM-03 | 業績歸因不重複計算；多位 BD 共享一家餐廳時合計 100% | `OPERATING_MODEL` |
| BM-04 | 門檻獎勵以「有效店數」5／8／10 家計算；**「有效」的定義未記錄** | 定義 `PRODUCT_DECISION_REQUIRED` |
| BM-05 | 策略客戶為獨立類別 | `OPERATING_MODEL` |
| BM-06 | 加盟店轉總部安排時，預付餘額可能需轉移或退款；已有效支付的佣金不自動追回 | `OPERATING_MODEL` |
| BM-07 | 長約獎勵概念：6 個月約 ≈ 1 個月訂閱價值；2 年約 ≈ 2.5 個月 | `HYPOTHESIS`（非約束條款） |

法律、勞雇、代理條款**未**由本文件建立。Admin 的 `business-development` 工作區目前是 9 條 `NOT_ENABLED` 路由，無 schema；是否納入後續階段未決。

## 來源

`governance/COMPANY_STRATEGY_AND_OPERATING_MODEL.md` §4；`governance/OWNER_PRODUCT_DECISION_REGISTER.md` ODR-029。
