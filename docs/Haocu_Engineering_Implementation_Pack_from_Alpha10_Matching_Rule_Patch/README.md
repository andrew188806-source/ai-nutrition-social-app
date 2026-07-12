# Haocu Engineering Implementation Pack

Source baseline: `Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation_matching_rule_patch.zip`  
Source version: `v2.0-alpha10-freeze-patch-1`  
Release: `Alpha 10 Final Editorial Consolidation / Repository Freeze — Matching Rule Patch`  
Generated pack type: derivative engineering handoff package  
Generated date: 2026-07-08

## What This Pack Is

這是從 Alpha 10 Final Freeze / Matching Rule Patch 母版抽出的「工程實作包」。它不是新的母版 Repository，也不是 Alpha 11。它的用途是讓 CTO、工程師、外包團隊、coding agent 可以從同一份 frozen Source of Truth 開始實作 MVP。

## Non-Modification Rule

- 原始 Alpha 10 ZIP 沒有被修改。
- 原始 `00–27` Repository 母版仍是正式 Source of Truth。
- 本包只整理工程交付視角，不新增產品範圍。
- 若本包與母版 PRD / Data / Architecture / Backlog 衝突，以母版 `SOURCE_OF_TRUTH.md` 與相對應 source documents 為準。

## How To Use

1. 先讀 `00_START_HERE/001_ENGINEERING_PACK_README.md`。
2. 再讀 `01_SCOPE_AND_RULES/001_MVP_SCOPE_LOCK.md`，確認不要擴 scope。
3. 依 `02_IMPLEMENTATION_PLAN/001_FIRST_14_DAYS_COMMAND_CENTER.md` 開始前兩週工程。
4. 用 `02_IMPLEMENTATION_PLAN/ENGINEERING_TICKET_IMPORT_backlog_items.csv` 匯入 Linear / GitHub Issues / Notion。
5. 飯友配對請優先看 `04_MATCHING_RULE_PATCH/001_CANDIDATE_DEDUP_ENGINEERING_SPEC.md`。
6. 需要查原始依據時，到 `07_SOURCE_REFERENCES/` 找母版原文。

## Folder Map

| Folder | Purpose |
|---|---|
| `00_START_HERE` | 工程包導讀、閱讀順序、母版依據 |
| `01_SCOPE_AND_RULES` | MVP scope lock、不可擴張規則、demo/mock data 規則 |
| `02_IMPLEMENTATION_PLAN` | 前 14 天、Sprint 1–6、P0/P1/P2、ticket workflow |
| `03_FEATURE_WORKSTREAMS` | Mobile / AI / Meal Buddy / Restaurant / Admin workstreams |
| `04_MATCHING_RULE_PATCH` | 飯友候選去重與排序懲罰實作規格 |
| `05_CODING_AGENT_HANDOFF` | 給 Codex / Claude Code 的安全任務指令 |
| `06_QA_RELEASE_GATES` | MVP release gate、demo regression、acceptance checklist |
| `07_SOURCE_REFERENCES` | 從 Alpha 10 母版複製出的工程相關原始文件 |
| `08_MANIFEST` | 來源、檔案清單、checksum、來源對照 |

## Critical Engineering Rule

Build the frozen MVP baseline first. Do not build investor imagination, future ESG supply-chain ideas, household app ideas, mascot expansion, or full payment/POS/marketplace features unless founder creates a new explicit build decision.
