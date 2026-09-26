# 需外部／live 重新查證（External Recheck Required）

> **分類** `DECISION_REGISTER` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

以下事實**不可**以過時資料視為正式。每項在查證前都保持未確認。本輪（GQA-4）**沒有執行任何 live 查證**。

## FINANCE

| ID | 項目 | 查證方式 | 正式文件 |
| --- | --- | --- | --- |
| ER-F1 | 補助／貸款的目前資格 | 主管機關現行公告 | [SUBSIDIES_LOANS](../05_FINANCE/SUBSIDIES_LOANS.md) |
| ER-F2 | 申請期間與截止日 | 同上 | [SUBSIDIES_LOANS](../05_FINANCE/SUBSIDIES_LOANS.md) |
| ER-F3 | 金額上限、配合款、利率 | 同上 | [SUBSIDIES_LOANS](../05_FINANCE/SUBSIDIES_LOANS.md) |
| ER-F4 | 群眾募資平台條款、手續費、法人／金流要求 | 平台現行條款 | [CROWDFUNDING_PRESALE](../05_FINANCE/CROWDFUNDING_PRESALE.md) |

## CORPORATE

| ID | 項目 | 查證方式 | 正式文件 |
| --- | --- | --- | --- |
| ER-C1 | 台灣法人與 Delaware 母公司的法律順序 | 律師 | [CORPORATE_STRUCTURE](../06_CORPORATE_LEGAL/CORPORATE_STRUCTURE.md) |
| ER-C2 | 稅務處理（移轉訂價、CFC／PFIC、美台稅務） | 會計師 | [GLOBAL_TOPCO](../06_CORPORATE_LEGAL/GLOBAL_TOPCO.md) |
| ER-C3 | 證券法遵（股權募資、群眾募資界線） | 律師 | [FUNDRAISING_ROUNDS](../05_FINANCE/FUNDRAISING_ROUNDS.md) |
| ER-C4 | 台灣法人登記狀態與登記地 | 公司登記資料 | [TAIWAN_ENTITY](../06_CORPORATE_LEGAL/TAIWAN_ENTITY.md) |

## IP

| ID | 項目 | 查證方式 | 正式文件 |
| --- | --- | --- | --- |
| ER-I1 | 專利申請狀態與官方期限 | 專利代理人／官方紀錄 | [PATENT_STATUS](../07_IP_PATENT/PATENT_STATUS.md) |
| ER-I2 | 國際申請窗口 | 專利代理人 | [PATENT_STATUS](../07_IP_PATENT/PATENT_STATUS.md) |
| ER-I3 | 估值、稅務、授權可執行性 | 律師、會計師 | [LICENSING_TRANSFER_OPTIONS](../07_IP_PATENT/LICENSING_TRANSFER_OPTIONS.md) |

## DEPLOYMENT（GQA-6）

| ID | 項目 | 正式文件 |
| --- | --- | --- |
| ER-D1 | 三個固定 Demo 目前實際部署的 SHA | [STABLE_DEMOS](../04_DEPLOYMENT_ENVIRONMENTS/STABLE_DEMOS.md) |
| ER-D2 | Restaurant 函式區域（最後紀錄 `iad1`） | [STABLE_DEMOS](../04_DEPLOYMENT_ENVIRONMENTS/STABLE_DEMOS.md) |
| ER-D3 | 各專案環境變數名稱齊全、無伺服器機密外洩 | [REQUIRED_ENV_NAMES](../04_DEPLOYMENT_ENVIRONMENTS/REQUIRED_ENV_NAMES.md) |
| ER-D4 | Expo Web export／Metro 驗證限制是否仍適用 | [TECHNICAL_DEBT](../02_ENGINEERING/TECHNICAL_DEBT.md) |

## DATABASE（GQA-5，Development，只讀查證）

| ID | 項目 | 正式文件 |
| --- | --- | --- |
| ER-B1 | `schema_migrations` 對 139 檔 manifest，分類 A（已記錄且物件一致）／B（物件存在但未記錄）／C（repo 有但未套用）／D（live 物件無 repo 遷移）／E（已記錄但 repo 無檔案） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B2 | public 資料表授權（`relacl`） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B3 | `pg_default_acl`（`postgres`／`supabase_admin` 在 `public` 的預設權限） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B4 | RLS 啟用／FORCE | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B5 | 政策（含套用於 PUBLIC 的政策與 `restaurants_public_read_dev`） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B6 | 函式 `EXECUTE` 授權（特別是 anon、PUBLIC） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B7 | anon／authenticated 經 REST／RPC 的實際可達性 | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B8 | 封存 schema／資料表不可達 | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) |
| ER-B9 | Supabase Security Advisor（含外洩密碼防護設定） | [TECHNICAL_DEBT](../02_ENGINEERING/TECHNICAL_DEBT.md) |
| ER-B10 | 以 `res***` 開頭的舊 staff 帳號 | [DEVELOPMENT](../04_DEPLOYMENT_ENVIRONMENTS/DEVELOPMENT.md) |
| ER-B11 | Primary 數量、無進行中的 Break-glass 啟用 | [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md) |
| ER-B12 | ADMIN-MRB 在 Development 的 live 驗收狀態 | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) |

任何修補（`migration repair` 或前向遷移）都是另外的 Planner 決定；**永不 `db push`**。

## LEGAL / PRODUCT

| ID | 項目 | 正式文件 |
| --- | --- | --- |
| ER-L1 | 同意書與隱私文字；實際餐點照片保存 | [PROFESSIONAL_ADVICE_REQUIRED](../06_CORPORATE_LEGAL/PROFESSIONAL_ADVICE_REQUIRED.md) |
| ER-L2 | 情境廣告的隱私同意與廣告主宣稱 | [ADVERTISING_MONETIZATION](../08_BUSINESS_MONETIZATION/ADVERTISING_MONETIZATION.md) |
| ER-L3 | 「營養認證徽章」名稱 | [BUSINESS_MODEL](../08_BUSINESS_MONETIZATION/BUSINESS_MODEL.md) |
