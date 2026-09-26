# 環境矩陣（Environment Matrix）

> **分類** `DEPLOYMENT_ENVIRONMENT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`；遠端狀態以最後 live 紀錄為準）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

| 環境 | 現況 | 正式文件 |
| --- | --- | --- |
| 本機（local） | 開發與 guard 驗證；可用一次性本機 PostgreSQL 17 做遷移證明 | [DEVELOPMENT_WORKFLOW](../02_ENGINEERING/DEVELOPMENT_WORKFLOW.md) |
| **Development**（Supabase 專案 `tastkind-development`） | 唯一啟用的後端；已接受的功能都在此 live 驗收；遷移歷史有已知漂移 | [DEVELOPMENT](DEVELOPMENT.md) |
| 穩定 Demo（Vercel） | 三個固定網址；Vercel 的「Production」部署目標**仍指向 Development 後端** | [STABLE_DEMOS](STABLE_DEMOS.md) |
| **Production 後端** | **尚未啟用**（目前營運狀態）；從未套用任何遷移 | 本頁下方 |

## Production 後端尚未啟用

- 沒有任何 Production Supabase 專案被使用；GQA 各回合均未存取 Production。
- 「Vercel Production deployment」只是 Vercel 的部署目標名稱，**不代表** TastKind Production 後端。
- 未來啟用前至少需要：Production 自己的 Step-Up broker 與 Break-glass 連線設定、Admin 設為 staff 權限模式、同意書／法律文字與照片保存核准（見 [OPEN_DECISIONS](../11_DECISION_REGISTERS/OPEN_DECISIONS.md)）。

## 平台設定

Vercel 與 Supabase 的設定位置與區域見 [HOSTING_VERCEL_SUPABASE](HOSTING_VERCEL_SUPABASE.md)；需要的變數名稱見 [REQUIRED_ENV_NAMES](REQUIRED_ENV_NAMES.md)。
