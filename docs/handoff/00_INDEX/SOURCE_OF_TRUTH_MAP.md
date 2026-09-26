# 正式來源地圖（Source of Truth Map）

> **分類** `DECISION_REGISTER`（索引） · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](MASTER_HANDOFF_INDEX.md)

來源狀態字彙：`CANONICAL_CURRENT` · `CURRENT_SUPPORTING` · `HISTORICAL_REFERENCE` · `SUPERSEDED` · `DUPLICATE_COPY` · `STALE_NEEDS_RECONCILIATION` · `EXTERNAL_RECHECK_REQUIRED`。

## 1. 主題 → 唯一正式所在

每個主題只出現一次。

| 主題 | 正式所在 | 先前／目前來源 | 來源狀態 | 衝突來源 | 已取代的來源 | 需外部重查？ | 備註 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 產品路線圖 | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) | ODR Sequencing；`docs/engineering-handoff.md` | `CURRENT_SUPPORTING` | runtime roadmap「目前 2V」 | root `ROADMAP.md` | 否 | GQA 序列 |
| MVP 範圍 | [MVP_SCOPE](../01_PRODUCT/MVP_SCOPE.md) | ODR-011／013～024 | `CURRENT_SUPPORTING` | Alpha 10 | root `README.md` | 否 | — |
| Consumer | [CONSUMER_PRODUCT](../01_PRODUCT/CONSUMER_PRODUCT.md) | `docs/consumer-runtime-phase-2*`、`docs/recommendation/*` | `HISTORICAL_REFERENCE`（階段契約） | — | GQA-1 前的 demo 說法 | 否 | GQA-1 |
| Restaurant | [RESTAURANT_PRODUCT](../01_PRODUCT/RESTAURANT_PRODUCT.md) | `docs/restaurant-owner-catalog-authoring-r2b.md` | `CURRENT_SUPPORTING` | — | 「唯讀／部分完成」 | 否 | `/vip`、`/verification` 未開放 |
| Admin | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) | `docs/admin-operational-surface-inventory.md`、`docs/admin-manager-presets-mrb.md` | `CURRENT_SUPPORTING` | Admin IA 文件數量 | 「Admin 為骨架」 | MRB live（GQA-5） | — |
| Social | [SOCIAL_PRODUCT](../01_PRODUCT/SOCIAL_PRODUCT.md) | ODR-002／012 | `CURRENT_SUPPORTING` | — | Alpha 10 社交上限說法 | 否 | 實體推播未驗收 |
| 工程流程 | [DEVELOPMENT_WORKFLOW](../02_ENGINEERING/DEVELOPMENT_WORKFLOW.md) | GQA briefs | `CURRENT_SUPPORTING` | — | — | 否 | 暫時的執行者分工 |
| Repository 正式 SHA | [REPOSITORY_STATE](../02_ENGINEERING/REPOSITORY_STATE.md) | `git log` | `CANONICAL_CURRENT` | — | `9d68eab`、`8af3fb7`、`d88d100` | 否 | 出處 `44101e9` |
| 架構 | [ARCHITECTURE](../02_ENGINEERING/ARCHITECTURE.md) | `docs/engineering-handoff.md` | `CURRENT_SUPPORTING` | — | `docs/architecture.md` | 否 | — |
| 測試／guard／驗收 | [TEST_GUARD_ACCEPTANCE](../02_ENGINEERING/TEST_GUARD_ACCEPTANCE.md) | GQA-1～3 結案 | `CURRENT_SUPPORTING` | — | 身分列舉模型 | 否 | — |
| 技術債 | [TECHNICAL_DEBT](../02_ENGINEERING/TECHNICAL_DEBT.md) | registers §2 | `CURRENT_SUPPORTING` | — | 已解決的小型債 | 部分（標記 `LIVE_RECHECK_NEEDED`） | — |
| 遷移政策 | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) | `scripts/public-schema-data-api-grant-guard.mjs` | `CANONICAL_CURRENT`（guard） | — | — | live 對帳（GQA-5） | 139 檔凍結 |
| Admin 權限 | [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md) | `docs/engineering-handoff.md`；SOP | `CURRENT_SUPPORTING` | — | v3.0.1 ODR-001 狀態 | 否 | — |
| Primary／Step-Up／Break-glass | [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md) | `docs/deployment-local-access-matrix.md`；SOP | `CURRENT_SUPPORTING` | broker「每次新建」說法 | 同左 | Primary 數量（GQA-5） | — |
| Restaurant 租戶 | [RESTAURANT_TENANCY](../03_SECURITY_AUTHORITY/RESTAURANT_TENANCY.md) | R2B 契約 | `CURRENT_SUPPORTING` | — | — | 否 | 不含定價 |
| Social 權限 | [SOCIAL_AUTHORITY](../03_SECURITY_AUTHORITY/SOCIAL_AUTHORITY.md) | 社交遷移 `202608*` | `HISTORICAL_REFERENCE`（階段契約） | — | — | 否 | — |
| 機密處理 | [SECRET_HANDLING](../03_SECURITY_AUTHORITY/SECRET_HANDLING.md) | handoff Secrets 段 | `CURRENT_SUPPORTING` | — | — | 否 | — |
| 部署 | [ENVIRONMENT_MATRIX](../04_DEPLOYMENT_ENVIRONMENTS/ENVIRONMENT_MATRIX.md) | `docs/deployment-local-access-matrix.md` | `CURRENT_SUPPORTING`（最後 live 紀錄） | — | — | 遠端 SHA（GQA-6） | Production 未啟用 |
| 環境變數 | [REQUIRED_ENV_NAMES](../04_DEPLOYMENT_ENVIRONMENTS/REQUIRED_ENV_NAMES.md) | `.env.example`、部署矩陣 | `STALE_NEEDS_RECONCILIATION`（`.env.example` 註解，TD-21） | — | — | GQA-6 | 只列名稱 |
| 財務 × 產品路線圖 | [FINANCE_PRODUCT_ROADMAP](../05_FINANCE/FINANCE_PRODUCT_ROADMAP.md) | GQA-4 brief；`governance/FUNDING_ROADMAP.md` | `CURRENT_SUPPORTING` | — | — | 是 | 規劃假設 |
| 股權募資輪次 | [FUNDRAISING_ROUNDS](../05_FINANCE/FUNDRAISING_ROUNDS.md) | GQA-4 brief | `CANONICAL_CURRENT` | 舊 NT$3M／5M | 舊募資金額 | 是（法遵） | 規劃假設 |
| 群眾募資 | [CROWDFUNDING_PRESALE](../05_FINANCE/CROWDFUNDING_PRESALE.md) | FR-06；PH-3 | `CURRENT_SUPPORTING` | — | — | 是（平台條款） | 執行面在 GTM |
| 補助／貸款 | [SUBSIDIES_LOANS](../05_FINANCE/SUBSIDIES_LOANS.md) | FR-01～05 | `EXTERNAL_RECHECK_REQUIRED` | — | — | 是 | 無核准 |
| 公司架構 | [CORPORATE_STRUCTURE](../06_CORPORATE_LEGAL/CORPORATE_STRUCTURE.md) | GQA-4 brief | `CANONICAL_CURRENT`（策略方向） | — | — | 是 | 非法律實作 |
| 台灣法人 | [TAIWAN_ENTITY](../06_CORPORATE_LEGAL/TAIWAN_ENTITY.md) | GQA-4 brief | `CANONICAL_CURRENT` | — | — | 是 | 登記狀態未記錄 |
| Delaware 母公司 | [GLOBAL_TOPCO](../06_CORPORATE_LEGAL/GLOBAL_TOPCO.md) | GQA-4 brief | `CANONICAL_CURRENT`（方向） | — | — | 是 | 不含交易機制 |
| 子公司／在地股權 | [GOVERNANCE](../06_CORPORATE_LEGAL/GOVERNANCE.md) | 近期討論 | `OPEN` | — | — | 是 | 不得凍結 |
| 專利歸屬 | [IP_OWNERSHIP](../07_IP_PATENT/IP_OWNERSHIP.md) | GQA-4 brief | `CANONICAL_CURRENT` | — | 治理層排除規則（SD-20） | 是 | ≠ IP Codex |
| 專利狀態 | [PATENT_STATUS](../07_IP_PATENT/PATENT_STATUS.md) | GQA-4 brief | `EXTERNAL_RECHECK_REQUIRED` | — | — | 是 | — |
| 專利成本責任 | [IP_COST_RESPONSIBILITY](../07_IP_PATENT/IP_COST_RESPONSIBILITY.md) | GQA-4 brief | `CANONICAL_CURRENT` | — | — | 否 | 不自動償還 |
| 專利授權／轉讓方向 | [LICENSING_TRANSFER_OPTIONS](../07_IP_PATENT/LICENSING_TRANSFER_OPTIONS.md) | GQA-4 brief | `OPEN` | — | — | 是 | 開放框架 |
| 商業模式 | [BUSINESS_MODEL](../08_BUSINESS_MONETIZATION/BUSINESS_MODEL.md) | 策略文件 §1／§6／§8 | `CURRENT_SUPPORTING` | — | Alpha 10 財務包 | 否 | — |
| Consumer 收入 | [REVENUE_MODEL](../08_BUSINESS_MONETIZATION/REVENUE_MODEL.md) | PH-2 | `CURRENT_SUPPORTING` | — | — | 否 | 價格假設 |
| 餐廳變現／定價 | [RESTAURANT_PRICING](../08_BUSINESS_MONETIZATION/RESTAURANT_PRICING.md) | PH-1／4／5 | `STALE_NEEDS_RECONCILIATION`（衝突） | PC-1、PC-2、PC-4 | — | 否 | 不挑選 |
| 創始方案 | [EARLY_BIRD_FOUNDING_RESTAURANTS](../08_BUSINESS_MONETIZATION/EARLY_BIRD_FOUNDING_RESTAURANTS.md) | ODR-025 | `CURRENT_SUPPORTING` | — | 15 道、吃到飽、美食趣報導 | 否 | 100 道 |
| 廣告 | [ADVERTISING_MONETIZATION](../08_BUSINESS_MONETIZATION/ADVERTISING_MONETIZATION.md) | GQA-4 brief | `CANONICAL_CURRENT`（概念） | — | — | 是（法遵） | 未實作 |
| 市場驗證 | [MARKET_VALIDATION](../09_OPERATIONS_GTM/MARKET_VALIDATION.md) | ODR-027／028 | `CURRENT_SUPPORTING` | — | — | 否 | 進行中 |
| 餐廳開發 | [RESTAURANT_ACQUISITION](../09_OPERATIONS_GTM/RESTAURANT_ACQUISITION.md) | 策略文件 §4 | `CURRENT_SUPPORTING` | — | — | 否 | 未實作 |
| 用戶開發 | [USER_ACQUISITION](../09_OPERATIONS_GTM/USER_ACQUISITION.md) | FR-06 | `CURRENT_SUPPORTING` | — | — | 否 | 目標／假設 |
| 群眾募資上線 | [CROWDFUNDING_LAUNCH](../09_OPERATIONS_GTM/CROWDFUNDING_LAUNCH.md) | FR-06；策略 §6 | `CURRENT_SUPPORTING` | — | 舊外部募資簡報 | 是（律師審閱） | — |
| 營運假設 | [OPERATING_ASSUMPTIONS](../09_OPERATIONS_GTM/OPERATING_ASSUMPTIONS.md) | 策略文件 | `CURRENT_SUPPORTING` | — | — | 否 | — |
| 多人餐桌（Group Table） | [GROUP_TABLE_INVENTORY](../10_POST_MVP/GROUP_TABLE_INVENTORY.md) | ODR-013；GT-I | `CANONICAL_CURRENT` | Alpha 10 PRD | 「屬 MVP」 | 否 | Post-MVP |
| 桌菜模式 | [GROUP_TABLE_FUTURE_PLAN](../10_POST_MVP/GROUP_TABLE_FUTURE_PLAN.md) | GQA-4 brief | `CANONICAL_CURRENT`（凍結意圖） | — | — | 否 | 未實作 |
| 收藏品 | [COLLECTIBLES_MARKETPLACE](../10_POST_MVP/COLLECTIBLES_MARKETPLACE.md) | ODR-014～017 | `CURRENT_SUPPORTING` | — | QR 為 MVP 流程 | 否 | — |
| 市集 | [COLLECTIBLES_MARKETPLACE](../10_POST_MVP/COLLECTIBLES_MARKETPLACE.md)（同文件的市集段） | ODR-018 | `CURRENT_SUPPORTING` | — | — | 否 | 經濟模型 `OPEN` |
| 點數 | [POINTS_ECONOMY](../10_POST_MVP/POINTS_ECONOMY.md) | ODR-019～021 | `CURRENT_SUPPORTING` | — | 較早的餐廳點數草案 | 否 | — |
| POS／收據 | [POS_RECEIPT_INTEGRATION](../10_POST_MVP/POS_RECEIPT_INTEGRATION.md) | ODR-022～024 | `CURRENT_SUPPORTING` | — | — | 否 | 不是餐桌前提 |
| 未決事項 | [OPEN_DECISIONS](../11_DECISION_REGISTERS/OPEN_DECISIONS.md) | 2026-09-19 對帳 §6 | `CURRENT_SUPPORTING` | — | — | 部分 | — |
| 已取代事項 | [SUPERSEDED_DECISIONS](../11_DECISION_REGISTERS/SUPERSEDED_DECISIONS.md) | 對帳 §5；DOCUMENT_STATUS_INDEX §5 | `CURRENT_SUPPORTING` | — | — | 否 | — |

## 2. 既有來源文件分類（不搬移、不刪除）

| 來源 | 主分類 | 來源狀態 | 正式指向 | 負責領域 | 需外部查證？ |
| --- | --- | --- | --- | --- | --- |
| root `README.md` | ENGINEERING | `HISTORICAL_REFERENCE`（頂部已有歷史標記＋交接入口連結） | [MASTER_HANDOFF_INDEX](MASTER_HANDOFF_INDEX.md) | Engineering | 否 |
| root `ENGINEER_HANDOFF.md` | ENGINEERING | `HISTORICAL_REFERENCE`（`9d68eab` 基準） | [ENGINEERING_HANDOFF](../02_ENGINEERING/ENGINEERING_HANDOFF.md) | Engineering | 否 |
| root `ROADMAP.md` | PRODUCT | `SUPERSEDED` | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) | Product | 否 |
| root `API_PLAN.md`、`PRODUCT_FLOW.md`、`DATABASE_SCHEMA.md`、`MOCK_DATA_GUIDE.md`、`INVESTOR_DEMO_SCRIPT.md`、`TAG_SYSTEM_DESIGN.md` | ENGINEERING | `HISTORICAL_REFERENCE`（mock 時代） | [ARCHITECTURE](../02_ENGINEERING/ARCHITECTURE.md) | Engineering | 否 |
| root `APP_STORE_CHECKLIST.md`、`COMPLIANCE_NOTES.md` | CORPORATE_LEGAL | `HISTORICAL_REFERENCE`（2026-06 早期清單） | [PROFESSIONAL_ADVICE_REQUIRED](../06_CORPORATE_LEGAL/PROFESSIONAL_ADVICE_REQUIRED.md) | Legal | 是 |
| `docs/engineering-handoff.md` | ENGINEERING | `CURRENT_SUPPORTING`；個別敘述過時（SD-12、SD-13、SD-14） | [ENGINEERING_HANDOFF](../02_ENGINEERING/ENGINEERING_HANDOFF.md) | Engineering | 否 |
| `docs/engineering-state-registers.md` | ENGINEERING | `CURRENT_SUPPORTING`；TD-06、ADMIN-E 小型債段過時 | [TECHNICAL_DEBT](../02_ENGINEERING/TECHNICAL_DEBT.md) | Engineering | 部分 |
| `docs/DOCUMENT_STATUS_INDEX.md` | ENGINEERING | `CURRENT_SUPPORTING`（已加交接入口） | [MASTER_HANDOFF_INDEX](MASTER_HANDOFF_INDEX.md) | Engineering | 否 |
| `docs/deployment-local-access-matrix.md` | DEPLOYMENT_ENVIRONMENT | `CURRENT_SUPPORTING`（ADMIN-E live 紀錄；遠端 SHA 待 GQA-6） | [STABLE_DEMOS](../04_DEPLOYMENT_ENVIRONMENTS/STABLE_DEMOS.md) | Deployment | 是 |
| `docs/admin-authority-sop-zh-tw.md` | SECURITY_AUTHORITY | `CURRENT_SUPPORTING`（操作程序） | [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md) | Security | 否 |
| `docs/admin-manager-presets-mrb.md` | PRODUCT | `CURRENT_SUPPORTING`（其「live 驗收另行進行」待 GQA-5） | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) | Product | 是 |
| `docs/admin-operational-surface-inventory.md` | PRODUCT | `CURRENT_SUPPORTING` | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) | Product | 否 |
| `docs/admin-information-architecture-ra-3-ia-p1.md` | PRODUCT | `STALE_NEEDS_RECONCILIATION`（IA 意圖有效；數量過時；受凍結 guard 讀取，不編輯） | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) | Product | 否 |
| `docs/platform-admin-*-ra-1*.md` | SECURITY_AUTHORITY | `HISTORICAL_REFERENCE`（凍結階段契約） | [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md) | Security | 否 |
| `docs/restaurant-owner-*.md`（RA-2A～I、R2B） | PRODUCT | `HISTORICAL_REFERENCE`（凍結契約；R2B 為 `CURRENT_SUPPORTING`） | [RESTAURANT_PRODUCT](../01_PRODUCT/RESTAURANT_PRODUCT.md) | Product | 否 |
| `docs/restaurant-canonical-data-boundary.md` | SECURITY_AUTHORITY | `CURRENT_SUPPORTING`（「mock adapter」一句過時） | [RESTAURANT_TENANCY](../03_SECURITY_AUTHORITY/RESTAURANT_TENANCY.md) | Security | 否 |
| `docs/tastkind-runtime-integration-roadmap.md` | PRODUCT | `SUPERSEDED`（僅「目前階段」段；階段名稱仍有效；凍結不編輯） | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) | Product | 否 |
| `docs/tastkind-canonical-data-integration-status.md`、`docs/consumer-schema-runtime-handoff.md` | ENGINEERING | `HISTORICAL_REFERENCE`（runtime 前快照） | [REPOSITORY_STATE](../02_ENGINEERING/REPOSITORY_STATE.md) | Engineering | 否 |
| `docs/consumer-schema-*.md`、`docs/consumer-canonical-data-mapping.md`、`docs/consumer-runtime-*/**`、`docs/runtime-integration-phase-2v*/**` | ENGINEERING | `HISTORICAL_REFERENCE`（凍結契約） | [CONSUMER_PRODUCT](../01_PRODUCT/CONSUMER_PRODUCT.md) | Engineering | 否 |
| `docs/recommendation/*`、`docs/meal-identification-*.md` | ENGINEERING | `HISTORICAL_REFERENCE`（凍結契約） | [CONSUMER_PRODUCT](../01_PRODUCT/CONSUMER_PRODUCT.md) | Engineering | 否 |
| `docs/ip-codex-scale-system.md` | ENGINEERING | `CURRENT_SUPPORTING`（技術契約，非專利） | [OTHER_DEFERRED_FEATURES](../10_POST_MVP/OTHER_DEFERRED_FEATURES.md) | Engineering | 否 |
| `docs/navigation-map.md` | ENGINEERING | `STALE_NEEDS_RECONCILIATION`（新路由不完整） | [CONSUMER_PRODUCT](../01_PRODUCT/CONSUMER_PRODUCT.md) | Engineering | 否 |
| `docs/architecture.md`、`docs/data-governance.md`、`docs/investor-demo-script.md` | ENGINEERING | `HISTORICAL_REFERENCE`（Phase 1 骨架） | [ARCHITECTURE](../02_ENGINEERING/ARCHITECTURE.md) | Engineering | 否 |
| `docs/supabase-*.md`、`docs/supabase-*/**` | ENGINEERING | `HISTORICAL_REFERENCE`（草稿；真實來源為 `supabase/migrations/`） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) | Engineering | 否 |
| `docs/Haocu_OS_Master_Repository_v2.0_alpha10_*/**` 與 `.zip` | PRODUCT | `HISTORICAL_REFERENCE`（Alpha 10，實作前構想） | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) | Product | 否 |
| `docs/Haocu_Engineering_Implementation_Pack_from_Alpha10_Matching_Rule_Patch/**` 與 `.zip` | PRODUCT | `DUPLICATE_COPY`（多處內容為 Alpha 10 副本）／`HISTORICAL_REFERENCE` | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) | Product | 否 |
| `docs/haocu-os-spec/**`、`design_handoff_haochu_app/` | PRODUCT | `HISTORICAL_REFERENCE` | [MVP_SCOPE](../01_PRODUCT/MVP_SCOPE.md) | Product | 否 |
| `governance/README.md` | DECISION_REGISTER | `CURRENT_SUPPORTING`（已加交接入口） | [MASTER_HANDOFF_INDEX](MASTER_HANDOFF_INDEX.md) | Company | 否 |
| `governance/OWNER_PRODUCT_DECISION_REGISTER.md` | DECISION_REGISTER | `CURRENT_SUPPORTING`（ODR 產品決定來源；「目前階段」段過時） | [FROZEN_DECISIONS](../11_DECISION_REGISTERS/FROZEN_DECISIONS.md) | Product | 否 |
| `governance/COMPANY_STRATEGY_AND_OPERATING_MODEL.md` | BUSINESS_MONETIZATION | `CURRENT_SUPPORTING` | [BUSINESS_MODEL](../08_BUSINESS_MONETIZATION/BUSINESS_MODEL.md) | Company | 部分 |
| `governance/FUNDING_ROADMAP.md` | FINANCE | `CURRENT_SUPPORTING`（缺 GQA-4 的股權輪規劃，由 `05_FINANCE` 補足） | [FINANCE_PRODUCT_ROADMAP](../05_FINANCE/FINANCE_PRODUCT_ROADMAP.md) | Company | 是 |
| `governance/RECONCILIATION_2026-09-19.md` | DECISION_REGISTER | `HISTORICAL_REFERENCE`（稽核紀錄） | [SUPERSEDED_DECISIONS](../11_DECISION_REGISTERS/SUPERSEDED_DECISIONS.md) | Company | 否 |
| `supabase/README.md`、`.env.example` | DEPLOYMENT_ENVIRONMENT | `CURRENT_SUPPORTING`；`.env.example` 註解過時（TD-21，受凍結 guard 保護不編輯） | [REQUIRED_ENV_NAMES](../04_DEPLOYMENT_ENVIRONMENTS/REQUIRED_ENV_NAMES.md) | Engineering | 否 |
| repository 外：v3.0.1 Master Handbook 包（`500c122`） | DECISION_REGISTER | `SUPERSEDED`（技術事實過時；不在本 repo） | [SUPERSEDED_DECISIONS](../11_DECISION_REGISTERS/SUPERSEDED_DECISIONS.md) | Company | 否 |
| repository 外：`tastkind募資資料/`（2026-07 價格文件、募資計畫 v1、產品介紹 v1.2、2026-06 募資簡報） | BUSINESS_MONETIZATION | `HISTORICAL_REFERENCE`（價格為假設；部分已取代） | [RESTAURANT_PRICING](../08_BUSINESS_MONETIZATION/RESTAURANT_PRICING.md) | Company | 是 |

最後對帳：2026-09-26。
