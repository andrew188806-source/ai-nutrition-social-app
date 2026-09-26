# Development 環境

> **分類** `DEPLOYMENT_ENVIRONMENT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（事實來自最後一次 live 紀錄，本輪未連線）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

## 現況（最後 live 紀錄）

- Supabase 專案 `tastkind-development`，PostgreSQL 17，資料庫位於新加坡區域。
- Consumer、Social、Restaurant、Admin（至 ADMIN-E）功能均在此 live 驗收。
- 已接受的遷移是**逐檔經 Management API SQL 通道直接套用**，不是 `supabase db push`。
- **遷移歷史漂移**：遠端 `supabase_migrations.schema_migrations` 最後讀到 **66** 筆，repository 有 **139** 個遷移檔；歷史表不能描述實際 schema。狀態 `DEVELOPMENT_MIGRATION_HISTORY_DRIFT_OPEN`，未修補。
- Admin Step-Up broker 登入角色是**永久**的執行期基礎設施（不可刪除）。
- 兩位可用 Primary、無進行中的 Break-glass 啟用（ADMIN-E 結案時）。
- 一個以 `res***` 開頭的舊 staff 帳號狀態待確認。

## 禁止事項

- 不得 `supabase db push`、`supabase migration repair`、手動寫入 `schema_migrations`、遠端手動 SQL「對齊」。
- 未經明確授權，不連線；不使用 `service_role` 或擁有者憑證。

## GQA-5 將 live 驗證（僅規劃，本輪未執行）

見 [EXTERNAL_RECHECK_REQUIRED](../11_DECISION_REGISTERS/EXTERNAL_RECHECK_REQUIRED.md) 的 DATABASE 項目：`schema_migrations` 對 139 檔 manifest（分類 A–E）、public 授權、`pg_default_acl`、RLS／FORCE、政策、函式 `EXECUTE`、anon／authenticated 可達性、封存物件不可達、Security Advisor、舊 staff 帳號、MRB live 狀態。

## 來源

`docs/engineering-state-registers.md`（TD-01、§8、§9）、`docs/deployment-local-access-matrix.md`、GQA-3 結案報告。
