# 產品路線圖（Product Roadmap）

> **分類** `PRODUCT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e938c1dfa030a97e906971a04394757762b`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

本文件是「產品階段順序」的唯一正式來源。財務里程碑不在這裡，請見 [FINANCE_PRODUCT_ROADMAP](../05_FINANCE/FINANCE_PRODUCT_ROADMAP.md)；工程提交與驗證狀態請見 [REPOSITORY_STATE](../02_ENGINEERING/REPOSITORY_STATE.md)。

## 產品定位

TastKind／好廚：以台灣外食族為對象，結合 **AI 營養計算**、**外食推薦（下一餐／具體菜品）** 與 **飯友社交配對（Meal Buddy）** 的產品。三個介面：Consumer App、Restaurant Owner 後台、平台 Admin 後台。詳見 [MVP_SCOPE](MVP_SCOPE.md)。

## 階段順序（現況）

| # | 階段 | 狀態 | 說明 |
| --- | --- | --- | --- |
| 1 | IP Codex／吉祥物圖鑑／比例尺 | `FROZEN`（已推送） | 靜態圖鑑架構與 demo 資料；見 [OTHER_DEFERRED_FEATURES](../10_POST_MVP/OTHER_DEFERRED_FEATURES.md) 的實體商品部分。 |
| 2 | Restaurant 營運面（RA-2、R1、R2A–R2E） | `FROZEN`（Development live-accepted） | [RESTAURANT_PRODUCT](RESTAURANT_PRODUCT.md) |
| 3 | 正式對帳／現代化稽核（2026-09-19） | 完成（`HISTORICAL_REFERENCE`） | `governance/RECONCILIATION_2026-09-19.md` |
| 4 | Admin 非權限營運功能 ADMIN-A～E | ADMIN-E 最終 live closure：`LIVE_ACCEPTED`（Development） | [ADMIN_PRODUCT](ADMIN_PRODUCT.md) |
| 4a | ADMIN-MRB 經理級權限模板 | `LOCAL_ACCEPTED`（已推送）；Development live 狀態見 GQA-5 | [ADMIN_PRODUCT](ADMIN_PRODUCT.md) |
| 5 | GQA-0 全域 QA 盤點 | 完成／Planner 已接受 | — |
| 6 | GQA-1 Consumer 真實性修正 | `CLOSED / FROZEN / PUSHED` | [CONSUMER_PRODUCT](CONSUMER_PRODUCT.md) |
| 7 | GQA-2 路由／拒絕狀態／建置整合 | `CLOSED / FROZEN / PUSHED` | [ADMIN_PRODUCT](ADMIN_PRODUCT.md)、[RESTAURANT_PRODUCT](RESTAURANT_PRODUCT.md) |
| 8 | GQA-3 資料庫契約／Data API GRANT 強化 | `CLOSED / FROZEN / PUSHED` | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| 9 | **GQA-4 正式文件／歸檔／交接整理** | **進行中（本文件集）** | 本目錄 |
| 10 | GQA-5 Development live 整合驗收 | `PLANNED` | [DEVELOPMENT](../04_DEPLOYMENT_ENVIRONMENTS/DEVELOPMENT.md) |
| 11 | GQA-6 穩定 Demo 部署驗收 | `PLANNED` | [STABLE_DEMOS](../04_DEPLOYMENT_ENVIRONMENTS/STABLE_DEMOS.md) |
| 12 | GQA-7 最終凍結／專業交接結案 | `PLANNED` | — |
| 13 | Post-MVP：多人餐桌（Group Table）正式實作 | `POST_MVP` | [GROUP_TABLE_FUTURE_PLAN](../10_POST_MVP/GROUP_TABLE_FUTURE_PLAN.md) |
| 14 | Post-MVP：收藏品／所有權轉移／市集；TastKind 點數經濟 | `POST_MVP` | [COLLECTIBLES_MARKETPLACE](../10_POST_MVP/COLLECTIBLES_MARKETPLACE.md)、[POINTS_ECONOMY](../10_POST_MVP/POINTS_ECONOMY.md) |

規則：已結案階段不因無證據的理由重開（ODR sequencing，`CURRENT_STRATEGY`）。

## 不要假設

- Production 後端**尚未啟用**；「完成」一律指 Development 或本地驗收，見 [ENVIRONMENT_MATRIX](../04_DEPLOYMENT_ENVIRONMENTS/ENVIRONMENT_MATRIX.md)。
- 多人餐桌不是現行 MVP 功能（見 [POST_MVP_PRODUCT](POST_MVP_PRODUCT.md)）。
- 產品里程碑不等於募資已完成；財務目標均為規劃假設。

## 來源

- `governance/OWNER_PRODUCT_DECISION_REGISTER.md`（Sequencing decision）
- `docs/engineering-handoff.md`（階段狀態）
- GQA-4 Planner brief（2026-09-26）：GQA-4 → GQA-5 → GQA-6 → GQA-7 → Post-MVP Group Table 的順序
