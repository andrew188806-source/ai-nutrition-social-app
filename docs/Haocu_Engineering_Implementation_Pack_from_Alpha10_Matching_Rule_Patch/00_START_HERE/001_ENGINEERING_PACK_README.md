# 001 Engineering Pack README

## 這包的定位

本工程包是從 Alpha 10 Final Freeze / Matching Rule Patch 母版抽取出來的工程交付版本。工程團隊可以直接拿來拆 task、對 codebase 做 gap analysis、建立 Supabase schema、修 demo、做 QA。

## 先讀順序

1. `README.md`
2. `00_START_HERE/002_ENGINEERING_SOURCE_OF_TRUTH.md`
3. `01_SCOPE_AND_RULES/001_MVP_SCOPE_LOCK.md`
4. `02_IMPLEMENTATION_PLAN/001_FIRST_14_DAYS_COMMAND_CENTER.md`
5. `02_IMPLEMENTATION_PLAN/002_SPRINT_1_TO_6_EXECUTION_MAP.md`
6. `04_MATCHING_RULE_PATCH/001_CANDIDATE_DEDUP_ENGINEERING_SPEC.md`
7. `05_CODING_AGENT_HANDOFF/001_CODEX_CLAUDE_MASTER_PROMPT.md`
8. `06_QA_RELEASE_GATES/001_MVP_RELEASE_GATE_CHECKLIST.md`

## 工程第一件事

工程師不要先重構全部，也不要先做新功能。第一階段只做：

- typecheck / build / route smoke test
- demo seed reset
- meal record collection 取代單一暫存物件
- unified social identity model
- AI 分析結果可保存、可修正、可同步 Today Intake / Food Diary / Recommendation
- Meal Buddy card / candidate / invite / chat 狀態一致

## 不要做

- 不要新增 `28_*` 模組。
- 不要把投資人敘事當成工程 scope。
- 不要把 mock data 當真實 traction。
- 不要把 AI 營養估算寫成醫療診斷。
- 不要在 JSX 硬寫大量使用者可見文字，繁中文案應集中管理。
