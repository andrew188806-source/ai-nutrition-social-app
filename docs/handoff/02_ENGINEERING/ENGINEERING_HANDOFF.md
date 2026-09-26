# 工程交接入口（Engineering Handoff）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e938c1dfa030a97e906971a04394757762b`）· **機密** `PRIVATE_INTERNAL`（本分類可在審閱後提供給外部工程團隊）· 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

本分類**只放工程事項**。產品決策在 `01_PRODUCT/`，權限與安全在 `03_SECURITY_AUTHORITY/`，環境與部署在 `04_DEPLOYMENT_ENVIRONMENTS/`；財務、公司法務、專利、商業模式**不在**工程分類中。

## 閱讀順序

1. [REPOSITORY_STATE](REPOSITORY_STATE.md)：目前正式 SHA、QA 階段狀態、數量事實。
2. [ARCHITECTURE](ARCHITECTURE.md)：技術堆疊與模組邊界。
3. [DEVELOPMENT_WORKFLOW](DEVELOPMENT_WORKFLOW.md)：誰規劃、誰實作、誰推送。
4. [MIGRATION_POLICY](MIGRATION_POLICY.md)：資料庫遷移與 Data API 規則（GQA-3）。
5. [TEST_GUARD_ACCEPTANCE](TEST_GUARD_ACCEPTANCE.md)：如何解讀歷史 guard 與驗收。
6. [TECHNICAL_DEBT](TECHNICAL_DEBT.md)：目前技術債與需 live 重查項目。

## 詳細技術來源（沿用，不重寫）

| 文件 | 角色 | 狀態 |
| --- | --- | --- |
| `docs/engineering-handoff.md` | 詳細的系統描述（Admin Authority、Restaurant、IP Codex 章節） | `CURRENT_SUPPORTING`（部分舊段落另有標記） |
| `docs/engineering-state-registers.md` | 技術債 TD-xx、延後 DF-xx、耦合與 Admin 盤點、Security Advisor 狀態 | `CURRENT_SUPPORTING` |
| `docs/DOCUMENT_STATUS_INDEX.md` | 既有文件逐一狀態分類 | `CURRENT_SUPPORTING` |
| `docs/admin-authority-sop-zh-tw.md` | 《最高權限開啟 SOP》操作程序 | `CURRENT_SUPPORTING` |
| 各階段凍結契約（`docs/recommendation/*`、`docs/restaurant-owner-*`、`docs/platform-admin-*` 等） | 該階段的精確契約 | `HISTORICAL_REFERENCE`（對該階段仍具權威） |

## 不要假設

- 不要從本地檔案推論遠端資料庫狀態（見 [MIGRATION_POLICY](MIGRATION_POLICY.md)）。
- 不要把歷史階段 guard 的失敗當成目前產品缺陷（見 [TEST_GUARD_ACCEPTANCE](TEST_GUARD_ACCEPTANCE.md)）。
