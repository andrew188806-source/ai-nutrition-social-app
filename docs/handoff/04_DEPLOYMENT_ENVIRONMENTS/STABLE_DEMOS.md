# 穩定 Demo（Stable Demos）

> **分類** `DEPLOYMENT_ENVIRONMENT` · **狀態** `CANONICAL_CURRENT`（部署 SHA 待 GQA-6 驗證） · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

三個固定網址（不要替換成新主機），都從 `main` 自動部署、後端都是 **Development**：

| 介面 | 固定網址 | 最後 live 驗證的 SHA | 函式區域 |
| --- | --- | --- | --- |
| Consumer | `https://haocu-demo.vercel.app` | `31b55d3`（ADMIN-E 結案） | — |
| Restaurant | `https://ai-nutrition-social-app-restaurant.vercel.app` | `31b55d3`（最後紀錄） | `iad1`（最後紀錄，技術債） |
| Admin | `https://tastkind-admin-demo.vercel.app` | `31b55d3`（最後紀錄） | `sin1` |

## 重要

- **目前遠端實際部署的 SHA 尚未重新驗證。** 最後紀錄的 `31b55d3` 之後已有多次推送；在 GQA-6 驗證之前，不要宣稱任何 Demo 目前跑的是哪個 SHA。
- Admin 穩定 Demo：Development Supabase、`sin1`、永久的最小權限 P3H broker、**沒有 `service_role`**、staff 權限模式、稽核資料來源為 Supabase。
- Restaurant 函式區域 `iad1` 與 Development 資料庫（新加坡）距離遠，是已記錄的技術債。
- Consumer 字型載入過大，慢速網路的完整視覺驗收未通過。

## GQA-6 將驗證

三個網址的實際部署 SHA、區域、環境變數名稱齊全、無伺服器機密外洩、Consumer 字型效能。

## 來源

`docs/deployment-local-access-matrix.md`、`docs/engineering-state-registers.md`（ADMIN-E1 closure）。
