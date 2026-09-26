# Repository 狀態（Repository State）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

## 正式 SHA

| 項目 | 值 | 性質 |
| --- | --- | --- |
| GQA-4 開始時的正式 SHA（= `origin/main`） | `44101e938c1dfa030a97e906971a04394757762b` | 前一次結案的出處（provenance） |
| 分支 | `main` | — |
| GQA-4 文件提交 | 會成為新的 repository HEAD；以 `git log` 為準 | 純文件，不改 runtime |

歷史 SHA（例如 `31b55d3`、`9d68eab`、`8af3fb7`、`500c122`）只是各自階段的出處，不是目前狀態，見 [SUPERSEDED_DECISIONS](../11_DECISION_REGISTERS/SUPERSEDED_DECISIONS.md)。

## QA 階段狀態

| 階段 | 內容 | 狀態 | 提交 |
| --- | --- | --- | --- |
| GQA-0 | 全域 QA 盤點 | 完成／Planner 已接受 | — |
| GQA-1 | Consumer 真實性修正 | `CLOSED / FROZEN / PUSHED` | `03cec4f`（實作）、`8a16644`（結案） |
| GQA-2 | 路由／拒絕狀態／建置整合 | `CLOSED / FROZEN / PUSHED` | `075a6f7`（實作）、`25157cb`（結案） |
| GQA-3 | DB 契約／Data API GRANT 強化 | `CLOSED / FROZEN / PUSHED` | `3069b10`、`cba7d90`、`44101e9` |
| GQA-4 | 正式文件／歸檔／交接 | 進行中 | 本文件集 |

GQA-3 的三個提交：`3069b10`（未來 public schema 遷移契約）、`cba7d90`（GQA-2 驗證改為與後續提交無關的耐久模型）、`44101e9`（GQA-1 驗證改為耐久模型）。

## 數量事實（以 repository 為準）

| 項目 | 數量 | 來源 |
| --- | --- | --- |
| Supabase 遷移檔 | 139（GQA-3 基準，凍結） | `supabase/migrations/`、`scripts/db-migration-baseline-manifest.json` |
| Edge Functions | 15 | `supabase/functions/` |
| Workspaces | `apps/mobile`、`apps/restaurant-web`、`apps/admin-web`、`packages/shared`、`packages/services` | root `package.json` |
| public 資料表（GQA-3 靜態掃描） | 90，全部啟用 RLS，12 個 FORCE | `scripts/db-object-contract-scan.mjs` |
| SECURITY DEFINER 函式（靜態） | 239，全部固定 `search_path` | 同上 |

## 不要假設

- 遠端（Development）`schema_migrations` 只有 66 筆，與 139 個檔案不一致；這是已知漂移，由 GQA-5 live 對帳，見 [MIGRATION_POLICY](MIGRATION_POLICY.md)。
- 固定 Demo 目前實際部署的 SHA 尚未重新驗證（最後記錄 `31b55d3`，ADMIN-E 結案時），由 GQA-6 驗證，見 [STABLE_DEMOS](../04_DEPLOYMENT_ENVIRONMENTS/STABLE_DEMOS.md)。
