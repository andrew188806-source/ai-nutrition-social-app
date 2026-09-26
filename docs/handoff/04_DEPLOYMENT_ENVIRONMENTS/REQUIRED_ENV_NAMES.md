# 必要環境變數名稱（Required Env Names）

> **分類** `DEPLOYMENT_ENVIRONMENT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

**只列名稱，永不列值。** 值的保存規則見 [SECRET_HANDLING](../03_SECURITY_AUTHORITY/SECRET_HANDLING.md)。完整名稱清單以 `.env.example` 為準（其註解描述 H1 前的閘門，屬已知文件落差 TD-21）。

## Admin 穩定 Demo（Vercel）

| 名稱 | 用途 |
| --- | --- |
| `TASTKIND_SUPABASE_URL` | Supabase 專案 URL |
| `TASTKIND_SUPABASE_PUBLISHABLE_KEY` | 可公開的 publishable key |
| `TASTKIND_ADMIN_AUTHORITY_MODE` | 必須為 staff 模式（預設是舊的 Platform-Admin 表模式） |
| `TASTKIND_P3H_BROKER_DATABASE_URL` | Step-Up broker 連線（機密） |
| `TASTKIND_ADMIN_AUDIT_DATA_SOURCE` | 稽核資料來源（Supabase）；缺少時平台成員稽核頁無資料 |

Admin runtime 不得存在 `service_role` 或資料庫擁有者憑證。

## Break-glass（僅憑證擁有者保存，不在任何部署中）

`TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL`、`TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL`。

## Restaurant

`TASTKIND_RESTAURANT_DATA_SOURCE`（`mock`／`supabase`／`disabled`；live 為營運路徑）、`TASTKIND_SUPABASE_URL`、`TASTKIND_SUPABASE_PUBLISHABLE_KEY`，以及僅限伺服器端的 `TASTKIND_SUPABASE_SERVICE_ROLE_KEY`（機密；只用於網站／社群連結的 `service_role`-only `v2` RPC，經 Next.js API 路由呼叫，屬既有設計，見 `docs/engineering-handoff.md`）。此規則與 Admin 不同：**Admin runtime 不得有 `service_role`**。

## Consumer（Expo，瀏覽器可見的公開設定）

`EXPO_PUBLIC_TASTKIND_ENVIRONMENT`（release 閘門，live 需為 `development`）、`EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL`、`EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY`（或舊別名 `EXPO_PUBLIC_SUPABASE_URL`／`EXPO_PUBLIC_SUPABASE_ANON_KEY`），以及各功能的 `EXPO_PUBLIC_TASTKIND_CONSUMER_*_SOURCE` 旗標。設定缺漏或格式錯誤時，live client 不會建立。

## Edge Functions（Supabase secrets／設定）

`MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS`（設定，非機密）、`MEAL_PHOTO_ANALYSIS_ENABLED`、`MEAL_PHOTO_ANALYSIS_PROVIDER`、`OPENAI_API_KEY`（機密）、`SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL`（機密）、社交參照金鑰 `*_REF_KEY_V1`（機密）、`MEAL_BUDDY_PUSH_DISPATCH_SECRET`、`EXPO_ACCESS_TOKEN`、`RESTAURANT_GEOCODE_DISPATCH_SECRET`、`RESTAURANT_GEOCODING_PROVIDER`（預設 `disabled`）。
