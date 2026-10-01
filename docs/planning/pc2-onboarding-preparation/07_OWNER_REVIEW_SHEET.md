# PC-2-P0R 營運者審閱表（Owner Review Sheet）

> CURRENT VALIDATION STATUS: independent PC-2 acceptance was BLOCKED; executor validation-only remediation is complete; independent reacceptance remains pending. Earlier preparation-stage statements below retain their historical phase scope. See section 6 and 08_VALIDATION_INTEGRITY_REMEDIATION.md for engineering and validation updates. Legal drafts remain DRAFT / NOT ACTIVE.

狀態：**OWNER APPROVED PRODUCT DECISIONS 已同步；剩餘事項待審閱；三份法律草稿 DRAFT — NOT ACTIVE**。
基準：`main` @ `30268ee4de59a8d8855c1dcaa01795d2f1ce33b1`

這份表記錄本輪已核定產品決策，只請你補齊剩餘真實資訊／政策與法律審閱，不再詢問 A/B 或年齡適用範圍。工程契約已依 Planner 決定修訂在 `04`–`06`，不要求你設計資料庫。OD-15、TD-10/AU19、P-7 仍開放；既有 Development 驗收不是政策核准。

阻擋欄的意思：**L**＝後續 local 實作／fixtures；**D**＝真實會員文件與 Development 啟用；**P**＝Production／所列未來能力。本輪僅修文件，不宣稱 L 已完成。已選 B 與 Social-only age 契約用隔離 fixtures 驗收；其他未決政策可測明確候選情境，不能把 fixtures 當真實政策。所有承諾一旦要寫進啟用文件，都必須先有可交付的營運方式。

---

## 1. 營運者與聯絡事實（OF-01–05）

| ID | 請提供的真實資訊 | 建議處理與會員影響 | 現況／缺少工作 | 阻擋 |
|---|---|---|---|---|
| OF-01 | 營運者法定名稱 | 使用實際法律主體，讓會員知道契約對象 | Repository 無可核准名稱；須提供並核對 | D/P；不擋 L fixtures |
| OF-02 | 統一編號或登記編號／適用性 | 不臆造公司或編號 | 須由營運者及法律確認是否適用 | 同上 |
| OF-03 | 登記／有效聯絡地址 | 說明可聯絡的營運者所在地 | 未提供；確認揭露需求及真實地址 | 同上 |
| OF-04 | 會員、個資請求、申訴聯絡管道 | 建議先設可驗證的人工 email 管道；會員有可用入口 | 無正式核准管道；需負責人、收件驗證、身份核對與流程，不能只寫「客服」 | 同上；無管道不能啟用含請求承諾的文件 |
| OF-05 | 實際資料存放／處理地區與供應商 | 查實 Supabase project region、OpenAI、Expo、Vercel 的實際使用／跨境／subprocessor；只揭露確認的事實 | 本輪未讀遠端設定；工程日後另經授權查證，法律決定告知內容 | D/P；不擋 L |

請提供內容／證據：＿＿＿＿。依 `docs/engineering-state-registers.md` 與現有來源維持待決狀態；沒有引用不存在的 reconciliation 文件。

---

## 2. OWNER APPROVED PRODUCT DECISIONS（2026-10-01）

來源：本輪「PC-2-P0R — CONSOLIDATED OWNER DECISION SYNC」明確 owner 指令。只核定以下產品政策，**不是** qualified legal approval、training scope／retention approval、clean publication approval 或 live activation。

| 已核定決策 | 會員後果與工程契約 | 現況／尚缺工作 |
|---|---|---|
| PC-01：**Social-only 18+** | 僅飯友／Social 限年滿 18 歲；一般 signup/onboarding、營養分析、用餐推薦、圖鑑不依本項年齡門檻阻擋。成年與 opt-in 分離，符合年齡不自動加入 | 尚無本輪新增 age gate。後續選 canonical actor-bound qualification／server enforcement；不靠 client 或 user_metadata，自我聲明不稱已驗證年齡；既有 Social users 不默認成年，須 rollout |
| **Option B：必要 AI-training authorization** | 三項 required consent 包含明確 training grant；控制項未預勾。UI：「若不同意，將無法使用本服務。」拒絕不寫 grant、不完成 onboarding、不使用核心服務 | Canonical completion/core state 與 protected server entry points 待授權實作；詳細 scope、合法性及文件 bytes 仍待核准 |
| **拒絕／撤回的核心資格與保留入口** | 拒絕／撤回不得使用營養分析、推薦、圖鑑、飯友；仍能查看條款／隱私文件、登出、聯絡客服、提出個資權利請求及刪帳申請。Re-grant 入口不被 core gate 鎖死 | 重新明確接受當期版本後，保留 withdrawal history、新 lifecycle、server reread；全條件符合才恢復 core，不能自動加入／resume Social。既有 users 另訂 reconsent rollout，本輪不直接鎖帳號 |
| **營養估算與個別醫療飲食限制** | 照片分析估算食物／份量／營養，不能測血糖／血壓或完整評估疾病／用藥／生理狀況。慢性病或特殊條件以醫師／營養師實際指示優先 | 01 第 5 條已同步；非全平台只使用照片、非精確測量、非 blanket waiver，也非擴大 training scope |

AI-training、Social opt-in、Social 年齡資格與餐廳商品圖照片授權彼此分離；前者不推導後三者。Option A 先前建議已 **SUPERSEDED / HISTORY ONLY**，不再是待決或可選方案。

L：可測這些已選定契約，不啟用真實文件。D/P：仍需法律審閱、剩餘政策／事實、clean bytes 與 actual server/operational support。決策已核定，不再次要求 owner 選 B 的拒絕／撤回後果或 Social 年齡範圍。

## 3. 產品政策（除 PC-01 已核定外，其餘列示建議仍待核准）

| ID／政策 | 建議預設（未核准）／會員後果 | 現有支持 | 缺少實作／營運 | 阻擋範圍 |
|---|---|---|---|---|
| PC-01 年齡 | **已核定 Social-only 18+**；不阻擋一般 signup/onboarding／非社交服務 | 本輪不新增或改 runtime age gate | Canonical actor-bound qualification、server enforcement、existing-user rollout 待工程凍結；非社交未成年人條款／同意另交法律 | 不擋一般 L onboarding；D/P Social enforcement/rollout 必須支持已核定規則；不是再選年齡範圍 |
| PC-02 一般資料／同意證據保存 | 分資料／目的設期限；帳號期間所需資料與刪除後合法保留分開；不先承諾數字 | 有資料表，無完整 retention executor；consent owner FK 硬刪會 cascade | 各用途時程與法律基礎、清理／稽核；若要刪後留證須另解 FK 與最小化衝突 | 不擋 L；D 文件須誠實且可交付；P 實際保存／刪除能力 |
| PC-03 刪帳方式／時程 | 建議 V1 可驗證人工申請，不聲稱 in-app 自助刪除；會員知道身份核對與處理程序 | 有刪除申請結構，無自助 UI 或完整 executor | 管道、責任人、合法回覆／處置流程及可達成時程；數字承諾待計畫 | 不擋 L；D 含此承諾的文件、P live deletion |
| PC-04 照片／backup | **暫存**採有驗證計畫的有限清理；**保留日誌照片**依明確選擇／用途保存，不套 staging 的期限；**training copies**在啟動訓練前另治理；**backup**依已查證供應商週期及隔離／還原規則揭露。不承諾 24h 或其他未證實數字 | Storage owner INSERT/SELECT/**DELETE**；retake 有 best-effort delete；backend/provider 仍處理照片；無完整清理／backup plan | 四類 inventory、清理失敗重試／證據、retention 和 restore 防復活流程；TD-10/AU19 治理核准仍缺 | 不擋 L；D 照片告知與實際可交付承諾；P 正式 retention；future training copies 另有 gate |
| PC-05 訓練範圍／通知 | 建議限明確授權的照片、AI 結果與 corrections，排除 identity/chat/location/health；開始實際訓練前再次告知 | 沒有 pipeline；上述範圍只是候選 | 核准用途／排除、選取證據與通知；不能把推論資料直接變訓練資料 | 不擋 L；D 若收取 training grant 需明確授權用途；P/future training 尚須治理與 pipeline |
| PC-06 去識別化 | 建議做可驗證的最小化／去識別化；不承諾匿名或零再識別風險 | 無去識別化 pipeline | 方法、風險評估與驗證 | 不擋 L／如實的 D 文案；擋 future training 的該項承諾 |
| PC-07 第三方訓練 | 建議 V1 不提供 datasets 或授權第三方模型訓練；必要推論委外獨立揭露 | 有 provider inference，沒有已核准第三方 training lane | 合約／用途限制與監測；確認承諾適用哪些處理者 | 不擋 L；D training 文案需定案；P/future third-party training |
| PC-08 付費 | 建議目前不開放購買，核准後直說；不得以 Premium 額度概念稱已可付費 | 有額度概念，無金流 | 核准商業狀態／文字；付費能力另案 | 不擋 L；D 文案；future billing/P 不得聲稱已交付 |
| PC-10 更新通知 | 建議 App 內明確通知＋可用 email；required consent 依精確新版本重取，不因「非重大」自動視同接受 | 現在無此 canonical reacceptance UI；工程契約已定 exact version | 通知管道／可達成承諾、stale rejection、重授權 UI；不要臆造 SLA | L 可測 fixtures；D 當期功能與文字；P 持續營運 |
| PC-11 檢舉／申訴 | 建議人工可追蹤管道並保留封鎖；不宣稱 reporting system 已存在，不先承諾數字客服 SLA | 有封鎖，無 reporting UI/system | 實際管道、負責人、身份／濫用處理及回覆計畫 | 不擋 L；D 若本文承諾；P live operation |
| PC-16 退出 Social | 建議先保留現行 **retained-but-gated** 政策並如實告知；暫停／退出限制 fresh reads/chat，不刪既有關係／訊息；resume/re-opt-in 仍有效 cards 可再次曝光 | Canonical participation gates 已有；client cache/ref 收束未完整 | Owner 確認政策、客戶端清除／晚到結果拒絕；card WRITE gate gap 另評估，不偷偷新增 | 不擋 L；D 參與前告知及 gate/cache 驗收；P 保留政策 |
| PC-17 撤回後訓練 | 未來訓練使用既有 datasets 也停止／排除；completed models 分開評估，不保證逆轉、不宣稱技術普遍不可能、不放棄法律權利 | 無 pipeline；新 canonical lifecycle/shared lock 契約已定 | 實際使用時 eligibility check、待用副本排除、進行中 jobs 停止／隔離與競態測試、legal review | 不擋 L consent fixtures；D 如實 grant/withdraw 文案；P/future training 執行能力 |

### 同步的 Social 告知（01、02、05、07）

Social-only 18+＋explicit opt-in 為分離條件；訓練 grant 與成年不自動加入，unknown／未符合 age qualification 不得在後續授權 rollout 啟用 Social。一般 account completion 不依 Social age；保留權利／客服／刪帳入口不受 core/Social gate 阻擋。

- 基礎候選資料：`display_name`（顯示名稱）、`mascot_avatar_key`（吉祥物）、`public_bio`（自我介紹）、`willing_to_chat`（聊天意願）。
- Meal Buddy list：上述四欄、興趣／類別及 overflow、用餐日期與時段、用餐意圖、餐廳名稱／識別與會員發表的卡片情境。Detail：上述四欄與完整一般／食物興趣 tags；授權卡片情境另由對應讀取呈現。
- Transport 的 opaque candidate/card references 不是 direct Auth user IDs；public projection 也不回傳 `profile_id`、`anonymous_display_name`。Opaque refs 不表示內容匿名或不能識別本人。
- 註冊不等於加入；沒有 participation row 不是 opted_in。Private visibility 不控制這個 discovery flow；willing_to_chat 不是完整曝光開關。
- 暫停／退出保留資料但限制讀取／聊天；恢復／再加入後仍有效的 retained cards 可再曝光。必須清 client caches/refs、拒絕晚到結果；不承諾已傳到別人裝置的資料立即消失。
- 現行 server **曝光**有 participation authorization，但 **card creation WRITE** 缺該 gate。05 明列 gap，後續評估 scope；本輪未加 RPC／新 authority／write gate。

---

## 4. 法律審閱（法律／最終文件未核准；不是合規認證）

| ID／事項 | 建議與會員後果 | 現況／缺少工作 | 阻擋 |
|---|---|---|---|
| PC-09 責任 | 保留法定責任與會員權利，法律審閱具體限制；不寫 blanket waiver | 01 只保留共同原則；需 qualified final wording | 不擋 L；D/P 正式文件 |
| PC-12 準據法／法院 | 依真實營運主體與會員法定權利選定，不臆造 exclusive jurisdiction | 須法律定案並插入 01 | 同上 |
| PC-13 健康／敏感資料 | 確认飲食目標、過敏／健康資訊法律分類與必要特定同意；隱私 acknowledgment 不是萬用處理法律基礎 | Social projection 不返私人健康欄，不表示 backend/provider 不處理；需分類與用途審閱 | 不擋 L；D/P 該資料收取與正式告知 |
| PC-14 處理者約定 | 查實地區、契約、subprocessors、provider retention；避免 owner-only／zero-retention 絕對保證 | `store:false` 僅是 application state 設定，不證明 ZDR；照片經 backend/provider | 不擋 L；D 如實 processor 告知、P 合約與實際設定 |
| PC-15 個資請求 | 建議 V1 不收費仍待核准；**法定回覆期限不可任選**。第 10 條請求：15 日准駁，必要延長最多 15 日並書面告知理由；第 11 條：30 日，必要延長最多 30 日並告知；第 14 條查詢／閱覽／複製的必要成本 | 現行法律可查，服務回覆流程尚缺；回覆准駁期限不是資料刪除／backup 消失承諾 | 不擋 L；D 如實請求程序、P 合法營運流程 |

來源查核（2026-10-01）：[現行個人資料保護法](https://law.pdpc.gov.tw/LawContent.aspx?id=FL010627)、[沿革／修法與生效資訊](https://law.pdpc.gov.tw/LawContentSource.aspx?id=FL010627)。公布日期與施行日期分開；2025-11-11 修正中尚待施行部分不能僅因公布就當現行。敏感資料及必要 AI 方案交 qualified review。供應商核對見 [Supabase password security](https://supabase.com/docs/guides/auth/password-security)、[OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)。本表不認證法律合規。

非社交未成年人的契約／同意要求、必要 AI-training 授權及 withdrawal/core denial 合法性仍須 qualified review；不得把未完成法律審閱轉成全服務 18+。產品政策選定不是法律合規認證。

法律意見／修訂：＿＿＿＿。

---

## 5. 最終文件核准（D-01；尚未核准）

| 草稿檔案 | 文件 ID | 擬版本／locale | 草稿修訂／狀態 | DRAFT HASH（SHA-256，整份檔案 exact raw bytes） |
|---|---|---|---|---|
| `01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md` | `membership-terms` | `v1` / `zh-TW` | `v1-draft-r3`；未生效 | `0a8111c0f5c952c7f7e837f9f727d5d1b32abdca0188af822b31291df71ceefd` |
| `02_PRIVACY_POLICY_DRAFT_ZH_TW.md` | `privacy-policy` | `v1` / `zh-TW` | `v1-draft-r3`；未生效 | `bbe9b4ce16549486f99820fa0246238c99a3f3bc7628cfd8745e610a26e3fe58` |
| `03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md` | `ai-training-terms` | `v1` / `zh-TW` | `v1-draft-r3`；未生效 | `c6a5868d47c56f872fcef02a2a447218b3d0b8df4cbc63979aaa5654880918c4` |

**D-01 生效日期／時間：待核准後選定，不預填。** 核准者／權限、版本／locale、clean bytes/hash、required set、已選 B 與核定產品後果、effective time、批准證據必須一起記錄。目前 draft 與 appendix 不可直接要求真實會員接受。現有 shared placeholder 是 `v1-draft`；候選發布 `v1` 不是目前 active 版本。

DRAFT HASH 包含草稿 metadata、本文與附錄，只供審閱一致性，不能複製到 registry。完成全部必要事實／政策後，確認已整合 B 與核定產品後果，移除附錄／未選方案／draft 標記，產生 clean readable artifact；對其 exact raw bytes **重新計算** hash，再取得獨立批准證據。Hash 放外部記錄而非本文，無 self-hash。Owner「附修改核准」後若 bytes 再改，必須重新確認最終 bytes，不能沿用舊 hash 的批准。

□ 01 文字可接受，尚需最終 clean bytes 核准　□ 01 需重擬
□ 02 文字可接受，尚需最終 clean bytes 核准　□ 02 需重擬
□ 03 B 文案尚需法律及最終 clean bytes 核准　□ 03 需重擬
□ 已取得 qualified legal review（附證據）

### STILL UNRESOLVED（不含已選定 A/B 或 Social 年齡範圍）

- OF-01–05：營運者法律身分、地址、可用聯絡、實際處理者／地區。
- PC-02–04：保存／刪除／backup；同意 evidence cascade 衝突若政策需要保留仍須另案。
- PC-05–07、PC-17：詳細 training scope、第三方、去識別化與 future-use/ongoing-job/completed-model 執行方案；本輪核定 B 不擴大這些授權。
- PC-08–16 中仍待核准者：商業／通知／申訴／retained Social 政策與法律事項；各列的現況與缺少工作繼續適用。
- Qualified legal review（含非社交未成年人及必要訓練條件）、三份 final clean publication bytes／獨立批准證據、D-01/effective time、live activation。
- Canonical age record/server enforcement、core entry-point inventory、legacy B/age rollout、exact migration/helper/successor/seal 範圍由後續 executor 凍結；不是讓 owner 選 SQL，也不是產品政策尚未選定。

### 已決定的工程與尚未到達的狀態（僅供理解）

- 每 owner 唯一 profile（UNIQUE、duplicate fail、owner lock、idempotent reread），無 first-row fallback。
- Completion 由唯一 active profile＋精確當期 Terms/Privacy/**必要 training** 推導；core eligibility 用同一 canonical server predicate 加帳號／session 授權。Social age/opt-in 不在 completion；不使用不存在的 column/local flag。
- Inactive documents => truthful unavailable；已知不可用時 signup UI 不建立 Auth；舊會員不補造 acceptance。
- 既有四 Social RPC 足以處理 participation transitions，不代表已 enforce 新 age/core 資格；後續 server integration 待凍結。新 canonical training lifecycle 才允許新 row re-grant，其他／legacy unique 保留；所有 onboarding/grant/withdraw 共用 owner consent lock。
- E-01：啟用前工程再核對位置資料流及實際 provider 區域，不要求 owner 猜程式行為。
- 工程 ledger 尚缺 migration 真實路徑、bundle storage 與實測 successor/helper/review-seal 範圍；由後續 executor 凍結，不是營運者填 SQL。
- `IMPLEMENTATION_READY_FOR_LOCAL_ACCEPTANCE`、`DOCUMENTS_APPROVED_NOT_ACTIVATED`、`DEVELOPMENT_ACTIVATED_LIVE_ACCEPTED`、`PRODUCT_CLOSURE` 分開；本輪沒有達成這些工程／啟用狀態。Approval 到達時機決定是否分 implementation/activation，不能為躲 successor 而強制多一次 commit。詳見 06 §5。

## 6. Later PC-2 implementation update — 2026-10-01 [LOCAL ONLY]

The preceding statements that canonical age/server enforcement/migrations remain executor freeze items describe the earlier P0R phase. The exact engineering inventory and authority matrix are now frozen in 06 §7; migrations, private bundle binding, locks, client flows and narrow predecessor recognition have been implemented locally. Local synthetic validation is recorded in `scripts/pc2-consumer-onboarding-validation.json`. This is an executor implementation record, not independent Planner acceptance.

The three legal drafts remain the exact D-01 hashes above and DRAFT / NOT ACTIVE. All owner/operator/legal blanks and unresolved policy rows remain unresolved. No legal approval, clean publication, effective time, notification/member reconsent, Production inference or real-member activation is created by this engineering update. OF-01–05, non-Social minors/required-training qualified legal review, clean approved publication binding, existing-member rollout acceptance, Development acceptance and OD-15/TD-10/AU19/P-7 remain activation blockers. Remote duplicate-profile inventory/remediation needs separate authorization before any migration apply; local duplicate tests never inventory a remote database.

## Validation integrity remediation — acceptance BLOCKED

Independent PC-2 acceptance was BLOCKED: 30 predecessor guards replayed baseline and exited before candidate assertions; GQA-6R missing-delta/deleted-file controls gained two failures; 33 differential failure groups had only UNREPORTED_FAILURE, so parity was unproven. Validation-only corrective gates are complete in the supplemental evidence; independent reacceptance remains pending. Original implementation evidence is historical and is not remediation acceptance. See 08_VALIDATION_INTEGRITY_REMEDIATION.md for the supplemental evidence. Legal drafts remain DRAFT / NOT ACTIVE. OD-15, TD-10/AU19 and P-7 remain open.

## Supplemental executor validation closure

Independent acceptance was BLOCKED for the three stated integrity defects. The exact 61-path correction restores actual candidate validation, GQA record/file-existence controls, and concrete failure-vector evidence. The verified complete inventory is 478 local / 24 excluded live or Development suites; the original 39 predecessor commands are a subset. NEW_REGRESSION = 0 with all failure vectors verified; inherited failures remain failures. Earlier 482 is unsupported and superseded. See 08 and its supplemental JSON/raw-output ZIP for full provenance, source bindings and reproducible evidence. This is READY_FOR_PC_2_REACCEPTANCE, not independent acceptance or legal activation. Legal drafts remain DRAFT / NOT ACTIVE; OD-15, TD-10/AU19 and P-7 remain open.
