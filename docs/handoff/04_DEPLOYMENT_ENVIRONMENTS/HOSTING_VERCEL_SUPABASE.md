# Vercel／Supabase 平台設定

> **分類** `DEPLOYMENT_ENVIRONMENT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

## Vercel

- 三個專案（Consumer Expo Web、Restaurant、Admin）從 `main` 自動部署；網址見 [STABLE_DEMOS](STABLE_DEMOS.md)。
- 環境變數**值**只設在 Vercel 私有環境；名稱見 [REQUIRED_ENV_NAMES](REQUIRED_ENV_NAMES.md)。
- Admin 函式區域設為 `sin1`：Step-Up broker 連線逾時 3 秒，需要靠近資料庫。
- Restaurant 函式區域最後紀錄為 `iad1`（技術債，GQA-6 重查）。

## Supabase（Development）

- Auth、PostgreSQL 17、Storage（私有餐點照片）、Realtime（飯友聊天）、15 個 Edge Functions。
- `meal-photo-analysis`：`verify_jwt = true`；瀏覽器來源白名單由設定 `MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS` 決定（不是原始碼），不允許萬用字元；**先設定、再部署**。
- Step-Up broker 使用 Supabase 共用 Transaction Pooler 連線。
- 遷移套用方式與禁止事項見 [DEVELOPMENT](DEVELOPMENT.md) 與 [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md)。

## 平台耦合

供應商／平台耦合的完整稽核：`docs/engineering-state-registers.md` §6。
