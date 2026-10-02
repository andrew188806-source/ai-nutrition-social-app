# PC-2 啟用準備：營運者事實與決策

狀態：**READY_FOR_OWNER_DECISIONS_SYNC_REVIEW — PREPARATION ONLY**。日期：2026-10-02（Asia/Taipei）。本文件不是法律批准、publication approval 或 activation authorization。

## 1. 基準與證據層級

上一輪 activation preparation 開始時 worktree clean；本輪 Owner decision sync 開始時僅既有三份 preparation 文件 untracked。`main`；HEAD = `origin/main` = `8e749f60e4e76ac09bb57195af1793575f5ed0cf`；ahead/behind `0/0`；tracked/staged diff 空。Repository 有 142 份 migration。現在狀態為 **PC_2_LOCAL_ACCEPTANCE_PASS / LOCAL_ACCEPTED_PUSHED**，不等於 live signup closure、Development apply 或 Production 啟用。

| 證據 | 身分與適用界線 |
| --- | --- |
| 可取得的獨立驗收 | `/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/pc2-independent-final-reacceptance-20261002/FINAL_REACCEPTANCE_REPORT.md`，SHA-256 `faa8cf15a64ef0647210db2105e1fd59455c2308a8493f4e825d23f6d169a53b`；JSON 同目錄，SHA-256 `a5cf3ed4c1d3b69657159a784481d4044dcdb1a464f21fb6cb34b108d21b7a18`。上一輪核對可用性及 raw hash；本輪重新核對 raw hash 並沿用結論，未重跑驗收。 |
| 驗收結論 | 上述 report §1、§6：原 83 paths、第一次 61、第二次 15，實際 union 114；478 組完整 failure vectors，NEW_REGRESSION=0、material unverified=0。繼承失敗仍是失敗，不稱 478 suites 全 PASS。 |
| push | 本輪 user 指令報告手動 push 已完成；本機 `origin/main` 與 HEAD 相同可查。本輪未連 Git remote 再查，未 push。外部驗收 report 的 `3/0` 是 push 前狀態，保留原文。 |
| repository 歷史紀錄 | [08](../pc2-onboarding-preparation/08_VALIDATION_INTEGRITY_REMEDIATION.md)、[09](../pc2-onboarding-preparation/09_SECOND_VALIDATION_REMEDIATION.md)、[validation record](../../../scripts/pc2-consumer-onboarding-validation.json)、[second inventory](../../../scripts/pc2-second-remediation-inventory.json)、[second differential](../pc2-onboarding-preparation/pc2-second-remediation-differential.json) 保留當時 executor／中斷／pending 狀態。其 BLOCKED/PENDING 不取代較晚獨立 PASS，也不回寫成當時已通過。 |

本文件使用下列證據類別，不以 Owner 回答取代工程證據或法律批准：Owner-stated fact（Owner 提供現況）；Owner-approved direction（規劃方向）；Historical product decision（歷史產品決策）；Historical document proposal（歷史文件提案）；Source-verified capability（此 commit 的本機 source 能力，非遠端驗收）；Pending engineering / operational verification（工程／營運待驗）；Pending qualified review / publication approval（專業審閱／正式發布批准待完成）。UNKNOWN 保留未知，PROPOSED 保留未批准計畫。已接受 local findings 不重新開啟。新增三份 untracked 文件不加入既有 seal，亦不重寫 records 使其接受新 delta。

## 2. Canonical 來源與實際實作位置

| 來源簡稱 | Exact source / section / location |
| --- | --- |
| R（review IDs） | [07_OWNER_REVIEW_SHEET.md](../pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md)：§1 OF-01–05（line 14 起）、§2 已核定（line 28）、§3 PC 政策（line 43）、§4 法律（line 73）、§5 D-01（line 91）、§6 後續實作（line 127）。 |
| T／P／A（三份草案） | [01 會員條款](../pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md)、[02 隱私政策](../pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md)、[03 訓練授權](../pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md)：擬發布本文及審閱附錄分開；仍 DRAFT / NOT ACTIVE。 |
| C（consent） | [04_CONSENT_RECORD_CONTRACT.md](../pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md)：§4 publication、§5 lifecycle、§7 資格／recovery、§8 cascade、§11 後續實作。 |
| S（Social/Auth） | [05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md](../pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md)：§3 Auth、§4 Social 告知、§7 後續實作；早期 NOT IMPLEMENTED 段落是歷史。 |
| L（publication ledger） | [06_MI_E_C1_SUCCESSOR_PLAN.md](../pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md)：§2 exact bytes／批准／successor、§3.2 擬 publication paths、§5 readiness、§7 DB objects／server coverage／最終 83-path inventory。歷次較小 inventory 已被最後 inventory 取代。 |
| F（foundation） | [20260930174028_consumer_pc2_onboarding_consent_foundation.sql](../../../supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql)：lines 3–8 duplicate/UNIQUE；13–81 六 private tables、immutability/ACL；82–111 bundle/core/Social；149–168 state/document DTO；170–245 consent/attestation；246–258 grants。 |
| G（gates） | [20260930174030_consumer_pc2_core_social_eligibility.sql](../../../supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql)：lines 3–54 triggers/RLS/Storage；各 `Exact core RPC`；4550–4750 participation；4754 card create；4845 candidate authority。 |
| U（實際 UI） | [controller.ts](../../../apps/mobile/features/consumer-onboarding/controller.ts)、[types.ts](../../../apps/mobile/features/consumer-onboarding/types.ts)、[copy.ts](../../../apps/mobile/features/consumer-onboarding/copy.ts)、[consent-document.tsx](../../../apps/mobile/app/consent-document.tsx)、[account-support.tsx](../../../apps/mobile/app/account-support.tsx)。 |

三草案 raw hashes 仍為 R §5：Terms `0a8111c0f5c952c7f7e837f9f727d5d1b32abdca0188af822b31291df71ceefd`；Privacy `bbe9b4ce16549486f99820fa0246238c99a3f3bc7628cfd8745e610a26e3fe58`；Training `c6a5868d47c56f872fcef02a2a447218b3d0b8df4cbc63979aaa5654880918c4`。它們包含 metadata／appendix，只是 DRAFT HASH，不可搬作 approved publication hash。

## 3. 已核定決策：不再詢問選項

| 核定事項 | 實際契約與尚待啟用邊界 |
| --- | --- |
| Option B：必要 AI-training authorization | 三項明確選擇才能完成：Terms acceptance、Privacy acknowledgment、training grant。Refusal 不寫 grant、不完成、不准 core；Privacy acknowledgment 不是萬用處理法律基礎。合法性與詳細 scope 仍待 qualified review。 |
| 拒絕／撤回後保留入口 | Core denial 與文件、登出、客服、rights、刪帳申請及 re-grant recovery 分開。F withdrawal 在同一交易內撤回 canonical training、pause 既有 opted_in；不刪 cards/relationships/messages。U support 尚為 pending-contact 說明，沒有送件或 deletion executor。 |
| 只有 Social / Meal Buddy 限 18+ | 一般 signup/onboarding、營養／推薦／圖鑑不依此年齡阻擋。F 使用 `social-adult-self-attestation-v1` 的 owner-bound 自我聲明，不稱驗證實際年齡；非社交未成年人契約要求交法律。 |
| 年齡與 Social opt-in 分離 | True attestation 不建立 participation；paused 要 explicit resume，absent 要 explicit opt-in。訓練、Social、餐廳商品圖授權分離。 |
| Re-grant 不自動恢復 Social | 新 training lifecycle 保留 withdrawal history；reread 全部 current consents 才恢復 core，participation 維持 paused。成年、re-grant 均不是 Social resume。 |
| 營養估算／醫療飲食限制 | T 第 5 條及 U copy：估算、不是血糖／血壓測量或個別醫療飲食；醫師／營養師實際指示優先；不擴 scope 或概括免責。 |

## 4. 2026-10-02 Owner 決策與 OF-01–05 事實同步

本節唯一新增決策來源為 Owner 本輪直接指令 **PC-2 — OWNER DECISION SYNC AND LOCAL READINESS REVIEW** §4 A–J（附件 `c5c6075f-8a06-4912-a24b-2c4f924dfc3c/貼上的文字.txt`）。此來源不是已 committed approval receipt。§3 已核定 B、Social-only 18+、recovery 與不自動 resume 均保留。

| Owner 節 / 證據類別 | 本輪承接內容、適用邊界與尚缺證據 |
| --- | --- |
| A：Owner-approved direction；Owner-stated fact | 台灣公司直接營運；正式名稱、統編、地址、設立與承接仍未知。正式客服、個資、申訴、刪帳管道尚未建立，之後統一設立；公司成立後指定收件／處理人。不將創辦人個人自填為現行營運者。 |
| B：Owner-stated fact；Owner-approved direction | 目前只有照片辨識 AI 已儲值，其他服務未付費。第三方 AI 僅受託處理，不授權訓練供應商自己的模型；合約、DPA、地區、subprocessors、實際保存／訓練設定仍 Pending engineering / operational verification 與 qualified review。儲值不證明上述條件。 |
| C：Historical product decision（2026-05-28）；Owner 承接 | 免費詳細日記 14 天、付費 180 天；免費月評分／月度回顧最近 6 個月、付費永久；收藏餐點私人永久；未收藏詳細到期收合月評分／彙整。當時免費 40 張、付費 200 張。§8 查到同值文案與另組矛盾 demo 文案，未找到後續有效 canonical 變更；不覆寫 source。這不是 retention executor 已完成。 |
| C：Historical product decision（2026-08-04）；Historical document proposal | Photo Lifecycle／AI Data Governance 依是否入日記、free/Premium、訓練資格、刪除／冷儲存統一治理。24 小時 staging、30 日刪除、90 日 backup 在本輪仍為提案／待核准，不升格承諾。原圖、縮圖、分析 staging、訓練副本、刪帳、backup/restore 分開；「永久」不代表所有原圖永久，亦不取消撤回、刪帳、合法刪除。歷史方向日期承接 Owner 提供，非新 executor 驗收。 |
| D：Owner-approved direction；Pending qualified review / publication approval | 餐點照片、辨識／營養結果、餐點與份量修正可納入；精準位置、健康設定、疾病資料可納入的前提是不能直接或間接識別個人。身分／聯絡資料排除；聊天目前排除。移除姓名不足以證明不可識別，位置／時間／疾病組合須實際風險與工程驗證；source 沒有因此產生 pipeline。 |
| D：Owner-approved direction；版本化擴充 | 未來小遊戲／其他功能可評估新增類別或用途，每次先列具體範圍、必要性、工程與法律 review、publication/approval binding、告知及必要同意。不是 future-all-functions blanket authorization，也不是現有會員 grant。現有 A 草案 §3 lines 44–46 排除位置／健康，與本輪方向有衝突；本輪新方向只取代規劃中的排除方向，草案原 bytes 保留，須另授權編修及獨立批准。 |
| E：Owner-approved direction | 公司成立後安排專業法律審閱，涵蓋未成年人、健康／疾病、必要訓練授權及其他正式條款。初期 Owner 最終核准，穩定聘用專任法務後正式交接；公司授權、交接程序及批准證據待完成，不稱已審閱。 |
| F：Owner-approved direction | 首次正式開放註冊，計畫同時啟用付費會員與餐廳收費。取消、退款、預售兌換、訂閱及其合法告知都是 launch readiness 依賴；不由此推導現有 billing ready。 |
| G：Owner-approved direction；Owner-stated fact | 重要條款、重新同意、服務資格切換用 Email＋App 內同步告知。Owner 表示目前只有自己／測試人員、無真實外部會員；不是遠端 account inventory。測試人員仍須明確正式同意及 Social 成年聲明；遠端分類／duplicates 留待另授權，不能用測試身分補造接受。 |
| H：Owner-approved direction；Pending qualified review / publication approval | 正式啟動後不因餐廳自行反悔退款；我方可另於合約約定，未達指標時退還後續未使用月份月費。指標／評估期間等正式營運第一個月實際流量出來再訂；適用方案、計算／申請／退款公式、部分月份、已履行／第三方成本待定。不填數字、不宣稱保證生效、不回填歷史合約。保留 Activation Code、BM-02 退款與 BM-03–07 業績／歸因歷史契約；新的服務成效退款不等於既有 BD 業績定義。 |
| I：Owner-approved direction | Premium 免費試用 14 天 → 基礎 Premium NT$399／月，按月自動續訂直到取消；到期前 3 天提醒、前 1 天 App 內通知及取消入口。訂閱前清楚呈現轉付費日期、金額、週期、取消方式並明確訂閱確認；一般 signup／法律同意不能代替付款授權。一般取消停止下一期扣款、當期權益至到期、當期不按比例退款；重複扣款、服務異常及依法退款另處理。渠道／平台實際 cutoff、提醒排程、扣款退款未驗；提醒日不是通用取消 deadline；未宣稱 Email/App/實體 Push 已驗收。 |
| J：Owner-approved direction；Historical document proposal | 先保留現行規劃價：月付 399、季繳 990、半年 1,740、年繳 3,000（NT$），過幾天再考慮是否調整。299 僅未採用討論，**NOT ADOPTED / HISTORY ONLY**；不得寫為現價／設定。早鳥原價不改：governance PH-3 記載消費者 890／1,680／2,980、餐廳 39,800／69,800，仍非 publication/billing approval。 |
| J：Historical document proposal（Owner 引述已核對歷史文件） | 創始支援包本人 3 個月；半年吉祥物包本人 6 個月／朋友 1 個月；年度創始收藏包本人 12 個月／朋友 3 個月。朋友碼正式上市後 3 個月內兌換，逾期失效，不折現／轉售／延期／合併其他會員優惠。本輪承接 Owner 對歷史方案文件的引述，未重新取得原始 DOCX 或獨立批准；不冒充 fresh 檔案驗收。本人權益起算、延期／未交付處理待定。 |

以下 **沿用 R §1 原 OF 定義**；回答的方向已保留，只追蹤未提供的具體事實。

| 原 ID | 已回答 / evidence class | 尚缺事實與責任；阻擋步驟 |
| --- | --- | --- |
| OF-01 法定名稱 | 台灣公司營運方向已定（A） | 公司正式名稱、設立與實際承接證據，Owner＋法律核對；A/B/C，不能假定已成立。 |
| OF-02 統編／登記編號適用性 | 沿用公司方向，不自造編號 | 實際編號與揭露適用性，Owner＋法律；A/B/C。 |
| OF-03 登記／有效聯絡地址 | 方向不提供真實地址 | 公開有效地址／受限佐證，Owner＋法律；A/B/C。 |
| OF-04 會員／個資／申訴管道 | 尚未設立、公司成立後統一指定（A） | 正式渠道、收件／代理／處理人、身分核對、申訴／rights／刪帳程序及可達性證據；Owner 營運＋工程＋法律；A/B/C/F/G。Support route 無 submit/delete executor。 |
| OF-05 實際處理者／地區 | 只有照片 AI 已儲值、第三方不得自用訓練（B） | 實際契約主體／用途／資料項／地區／subprocessors／DPA／保存與訓練設定，Owner 合約＋另授權工程 metadata 核對＋法律；A/B/C/E/G。OpenAI source adapter 名稱不證明現行遠端配置或契約清單。 |

## 5. 已回答方向之外的政策、法律與工程缺口

保留 R 原 topic；不新建 authority、不重問 B／Social 年齡範圍、訓練資料方向、付費 launch 或通知渠道。A–G 對應 [02 §3](02_PUBLICATION_AND_ROLLOUT_PLAN.md)。

| 原 ID / topic | 本輪已承接 | 尚需 evidence / review 與下一 gate |
| --- | --- | --- |
| PC-02/03/04；OD-15/TD-10/AU19/P-7 | C 的日記保存方向及照片分類 | 精確起算、收合後保存內容、free/Premium 轉換／收藏解除、照片原圖／縮圖／staging／training／cold storage／backup 清單；清理失敗重試、撤回／刪帳／restore 防復活、合法留證與 consent FK cascade 衝突。工程 scope proposal＋法律，不批准 24h/30d/90d。 |
| PC-05/06/07/17 | D 的具體資料方向與第三方只受託（B） | 去識別風險驗證（位置/時間/疾病聯合識別）、dataset lineage/版本、既有 dataset 再用、ongoing jobs、completed model 撤回邊界、合約限制及通知／必要同意。先審草案衝突，future pipeline 另案。 |
| PC-01/13、必要 training | Social-only 18+、B 及拒絕／撤回 core denial 保持 | 公司成立後 qualified review：non-Social minors／監護或 age assurance、健康/疾病特定處理、必要訓練與權利後果；若需新功能先新 exact scope，不自行新增 DOB/證件或改回 Option A。 |
| PC-08/09/12/15 | F/H/I/J 商業啟用、價格、取消／退款方向 | 金流渠道／平台 cutoff、試用起算、取消／退款、預售交付／兌換、餐廳合約新例外、責任／管轄／法定例外與 rights 法定程序專業審閱。初始餐廳正式方案價格未選定，不能把多個 PH 假設合併。 |
| PC-10/11/16 | G 的 Email＋App 內同步與僅測試帳號說法 | 通知產生／排程／送達及失敗補救、受限帳號分類、retained Social/申訴政策、正式測試 consent/成年及單一 cutover 影響證據；不是已通知，也無現成 grace。 |
| D-01 | E 的 Owner 初期最終核准／法務交接方向 | 公司批准權、qualified review、final clean bytes/version/locale/hash、獨立 approval reference／時間、publication／effective bundle 仍缺；本輪回答不關閉 D-01。 |

## 6. 既有 governance blockers 保持 OPEN

| ID（沿用原義） | Canonical exact location | 目前界線／owner 所需行動 |
| --- | --- | --- |
| OD-15 | [OPEN_DECISIONS.md](../../handoff/11_DECISION_REGISTERS/OPEN_DECISIONS.md) table OD-15 | 同意書／法律文字與真實餐點照片保存核准；`PRODUCT_DECISION_REQUIRED`。本輪 §4–5 與 Q4–Q6/Q9 evidence 供 owner 審閱，不由文件自動關閉。 |
| TD-10 / AU19 | [engineering-state-registers.md](../../engineering-state-registers.md) table TD-10；[RECONCILIATION_2026-09-19.md](../../../governance/RECONCILIATION_2026-09-19.md) §5 AU19 | Placeholder／retention approval record 缺口；既有 Development acceptance 不能替代 prerequisite approval/governance。保留兩種 evidence 的差異，等待有權 owner reconciliation。 |
| P-7 | [RECONCILIATION_2026-09-19.md](../../../governance/RECONCILIATION_2026-09-19.md) §6 P-7 | Consent/legal bundle 與 real photo-retention approval，Production blocker；不因 local PASS／push／未來 Development apply 而關閉。 |

## 7. 剩餘具體補件（不重問已回答方向）

Q1–Q10 是排序標籤，非新 review IDs；目前缺件不妨礙文件 review 完成，仍阻擋後續啟用。

1. **Q1（OF-01/02/03）**：公司正式名稱、統編、公開地址、設立／承接時點與可核對證據。
2. **Q2（OF-04）**：管道建立後的正式地址／入口、收件／處理／代理人、身分核對／申訴／刪帳流程及可達性證據；法定程序交法律核對。
3. **Q3（OF-05、PC-14）**：實際 vendors/contracts/regions/subprocessors/DPA/retention/供應商不得自行訓練的契約與設定證據，以及另授權 metadata 核對範圍。不要提供 secrets。
4. **Q4（PC-02–04）**：日記收合／收藏／方案轉換的精確起算與照片、訓練副本、刪帳、backup/restore 各用途操作邊界及留證要求；歷史 UI 矛盾由後續 scope review 處理，不要求重選已定 14/180/6 個月／永久方向。
5. **Q5（PC-05–07/17）**：訓練具體目的、必要性、不可直接／間接識別的可驗證標準、撤回／dataset／ongoing jobs／model 邊界與風險 review；不重問已回答類別與第三方限制。
6. **Q6（PC-01/13、B）**：公司成立後 qualified review 的委任／審閱收據及需修事項，包括 minors、健康／疾病、必要授權；不是 Owner 重新選 A/B。
7. **Q7（PC-08/09/12/15）**：付款渠道、各平台取消 cutoff、試用起算、退款例外／流程、本人早鳥權益起算及延期未交付處理、初始餐廳適用方案／價格。成效指標第一個月後依真實流量另訂；目前不索取或編造數字。責任／法定權利交法律。
8. **Q8（PC-10/11/16）**：已定 Email＋App 內渠道的實際收件／排程／送達／補救責任及 retained Social/申訴運作證據；通知期限及投訴流程仍待定，測試帳號不是已同意。
9. **Q9（D-01）**：公司核准權與將來交接證據、qualified review 完成後的 final clean bytes、version/locale/hash、approval reference/批准時間及可交付 effective instant。
10. **Q10（existing rollout）**：另授權取得受限帳號分類／duplicates／project identity 後，確定正式測試人員／cleanup、通知與單一切換窗口的 impact/recovery 證據；不重問目前 Owner 提供僅測試帳號說法，不假稱已遠端核對。

## 8. 本機唯讀 readiness matrix（commit 8e749f6；不是能力驗收）

以下是 **Source-verified capability** 及 **Pending engineering / operational verification** 的分界。所有連結是本機 source；每個否定結論限此次相關 paths、函式與 targeted search，不保證 repository 外服務不存在。未登入／讀取遠端、未跑 runtime 或 provider 網路請求。

| 能力／source evidence（實際位置） | 目前狀態／限度 | 缺口／下一 gate |
| --- | --- | --- |
| 詳細日記：[meal-log.tsx](../../../apps/mobile/app/meal-log.tsx) `dateWindow`/previousWeek；[readRange.ts](../../../apps/mobile/features/consumer-meals/readRange.ts) `resolveMealReadRange`；[meal reader](../../../apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts) `listCurrentUserMealRecords` | 週窗 7 天、可 previousWeek；query 範圍最多 31 天／100 筆，owner＋deleted_at=null filter。這是單次查詢 bounds，不是免費歷史 14 天、Premium 180 天或實際刪除；reader 不依 paid tier 決定起始日。 | 確定保存 vs 查看契約、權益及過期收合 authority，再另授權 exact implementation/驗收。 |
| 每日／月度摘要：[daily persistence service](../../../apps/mobile/features/consumer-meals/consumerDailyNutritionSummaryPersistenceService.ts) `persistCurrentUserDailyNutritionSummary`；[daily summary SQL](../../../supabase/migrations/20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql) `persist_authenticated_daily_nutrition_summary`；G current wrapper | 已有每日計算／原子 persistence 與 current 日期摘要讀取；不是月評分 executor。查核上述 service/SQL/read path 未建立 6 個月／永久月度保存或到期 rollup。 | 月度評分／rollup／重算／到期保留模型需 scope review；daily summary 不能當月度 PASS。 |
| 收藏與相互矛盾文案：[zh-TW.ts](../../../lib/i18n/zh-TW.ts) lines 1111、1293–1306 vs 2094、2120–2126；[NutritionMemoryCards.tsx](../../../apps/mobile/features/nutrition-memory/NutritionMemoryCards.tsx) `NutritionRecordHome/FoodMemorySection`；[favorites SQL](../../../supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql) add/remove functions；meal-log `MealLogFavorites` | 主日記文案保留 14/180、6 個月／永久、40/200；另一 demo/refinedLogic 寫 1 個月、50/150 收藏／50 筆封存。**不是後來已批准覆寫**：本輪 canonical register/revenue/privacy records 未找到有效改額度紀錄。實際 favorites 是餐廳／菜單 item add/remove／owner locking，並非私人完整餐點快照永久保存，亦未證明 40/200 tier quota。 | 保留兩組 source，不選 demo 值覆寫決策；後續辨識 display contract、保存快照與 canonical quota，收合不刪餐廳來源，私密／刪除權另驗。 |
| 照片 staging／日記／縮圖：[photo types](../../../packages/shared/src/domain/meal-photo-analysis/types.ts) `MealPhotoAssetPurpose/buildMealPhotoAnalysisObjectPath`；[private bucket SQL](../../../supabase/migrations/20260725030000_meal_photo_analysis_private_storage_bucket.sql)；[upload repository](../../../apps/mobile/features/meal-photo-upload/adapters/supabaseMealPhotoUploadRepository.ts) upload/delete；[analysis.tsx](../../../apps/mobile/app/analysis.tsx) `retakeMealPhoto` lines 725–738 | 有獨立目的 enum、actor/request/original 路徑、private owner INSERT/SELECT/DELETE。purpose enum 明示不是 lifecycle state；retake best-effort、不因一般 unmount 清理。不足以證明已將分析 staging 原圖可靠轉成日記／縮圖／冷儲存生命週期或 scheduled purge。 | 四類照片＋原圖／縮圖 manifest、入日記交接、orphan/retry／錯刪保護、時間起算／executor／restore 防復活；24h/30d/90d 仍 proposal。Owner/legal retention approval 與既有 Dev evidence 矛盾保持 OPEN。 |
| 訓練／撤回／刪帳：[F](../../../supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql) grant/withdraw；[photo types](../../../packages/shared/src/domain/meal-photo-analysis/types.ts) forbidden training flags；[rights UI](../../../apps/mobile/app/account-support.tsx)；[privacy classification](../../consumer-schema-privacy-classification.md) retention section | Canonical grant/withdraw 與 Social pause 是 local accepted；request 不接受 client trainingEligible 等 authority。不是 dataset admission、de-identification、撤回停止 jobs／刪訓練副本／刪帳 executor。Support 尚未送件；Auth owner FK cascade 不等於 Storage/backup 全刪。 | Q4–6：目的／可識別性、訓練 lineage、撤回競態／jobs/model、rights 留證與 backup 分別工程／法律 review。現有 grant 不能批准擴充用途。 |
| AI provider 與資料流：[config.ts](../../../supabase/functions/meal-photo-analysis/config.ts) `loadServerConfig` 的 env 選擇；[handler.ts](../../../supabase/functions/meal-photo-analysis/handler.ts) auth→path/image download→claim→provider；[openaiProvider.ts](../../../supabase/functions/meal-photo-analysis/openaiProvider.ts) `analyze` lines 70–105 | Source 支援 openai/mock/disabled，OpenAI model 由 `OPENAI_MEAL_ANALYSIS_MODEL` 注入，無可據以宣告目前遠端 model 的預設。已驗 actor 後下載 private 照片 bytes，轉 data URL＋prompt 送 OpenAI Responses API、`store:false`；不送公開 Storage URL。程式碼不是 provider contract、ZDR 或不得自行訓練的證明。 | Q3 external contract/DPA/subprocessor/region/settings 核對；Owner 儲值不證明現行 provider 配置。不得從 SDK/model 名／region 字串判正式處理者或地區。 |
| 付費／試用／取消／退款：[placeholders.ts](../../../packages/services/src/placeholders.ts) `requestPaymentPlaceholder`；[entitlement schema](../../../supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql) `subscription_entitlements`；[resolver](../../../supabase/functions/_shared/social-exposure/resolveEntitlement.ts) `rowGrantsPremium/resolveSocialEntitlement`；[REVENUE_MODEL](../../handoff/08_BUSINESS_MONETIZATION/REVENUE_MODEL.md) | Payment 回 mock/not_started；schema 儲存 plan/source/status/validity、resolver verified actor 時間窗讀取，非 checkout/付款授權。Source 不證明 14 天 trial→399 自動續訂、取消 next charge、當期保權益／退款、presale redeem 已實作。價格方向與 market validation 分開。 | 決定 payment channels／cutoff、權益起算與 webhook/idempotency、取消退款例外／預售法律 review；另授權最小 billing/entitlement package，獨立驗收後才能與正式註冊同步 launch。 |
| 提醒／變更通知：[push authority](../../../supabase/migrations/20260824030000_meal_buddy_push_notification_authority.sql) `event_kind` constraint；[push service](../../../supabase/functions/_shared/meal-buddy-push-api/service.ts) dispatch；[preferences schema](../../../supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql) notification booleans | 現有 Push 事件限 invite_received/invite_accepted/message_received；不是 legal/reconsent/trial expiry 通知。Preferences booleans 不證明 email/app 排程或送達。targeted source search 未找到 trial-reminder/checkout/refund/照片 purge 的既有 executor；未查遠端 scheduler。 | Email＋App 內同步、-3 提醒／-1 App 取消入口、送達／未達／重試、取消後排程 suppression 與平台 cutoff；實體 Push 另核對，不宣稱已驗收。 |
| 餐廳 activation／合約／成效退款：[company strategy](../../../governance/COMPANY_STRATEGY_AND_OPERATING_MODEL.md) §4 BM-01–07、§5 PH-1/4/5；[RESTAURANT_ACQUISITION](../../handoff/09_OPERATIONS_GTM/RESTAURANT_ACQUISITION.md)；[RESTAURANT_PRICING](../../handoff/08_BUSINESS_MONETIZATION/RESTAURANT_PRICING.md)；[engineering register](../../engineering-state-registers.md) DF-11、missing models / BD workspace | Activation Code 確認才商業啟動、post-activation default no-refund/defined exception 與 BD performance/attribution 為 operating policy，無相應 billing/contract/activation schema/executor 證據；Admin route 是 NOT_ENABLED，不是 authority。餐廳價存在未選定互斥假設。H 明確排除自行反悔退款，但新增 unused-future-month 成效例外尚未成合約，並非既有 BM 指標。 | 初始方案／合同及支付交付先核定；第一個月真實流量後再訂成效 metrics/period/公式/claims，需新版本 review/notice/approval，不回填舊契約。不能以現在未定 metrics 對外保證。 |
| 早鳥／預售：[FUNDING_ROADMAP](../../../governance/FUNDING_ROADMAP.md) FR-06；company strategy PH-3；Owner J 的歷史文件引述 | 歷史價與 pack durations 可供規劃；沒有重新讀取原 DOCX／獨立 publication receipt 或 redeem authority 證據。自用 vs friend、formal-launch redemption window 分開。 | 本人起算／延期未交付／兌換衝突／碼安全／不可轉售合併等規則與工程另 scope；歷史 marketing 非合法收款與權益證據。 |

以上未修改任一產品設定。相同 commit 下新閱讀是 fresh **source review**，不是 fresh 產品／DB／通知／付款 PASS。餐廳 pending、舊文案矛盾及 legal scope conflict 都保持 explicit gap，不冒稱已解決。

## 9. 後續最小工作包與依賴（PROPOSED；未授權展開）

| 類別／最小包 | 依賴、scope 與交付 gate |
| --- | --- |
| 營運補件 O | Q1–3 公司／管道／責任／實際處理者證據，Q7 付款渠道／餐廳方案／早鳥未明規則、Q8 通知責任。只補具體事實，不重選已定方向；Owner 完成後交專業 review。 |
| 法律 review L | 公司成立、O 合約與事實、source gaps → minors/health/disease/必要 training、不可識別條件、永久／withdraw/delete/backup、消費／餐廳取消退款／預售／自動續訂告知及法定例外。解草案排除清單衝突並確認公司核准權，產生需修／批准範圍；正式文案編修另外授權。 |
| 外部設定核對 X | 另授權精確 metadata-only project/vendor/payment scope → provider合同/retention/第三方訓練、Auth email/callback、通知渠道、平台 cutoff、account分類/duplicates、DB/Edge/storage/backup 配置。無 secrets輸出；先 inventory，不直接改設定。可與 O/L 平行，但不得替代 L。 |
| 後續產品施工 P-retention | C＋L/Q4 明確邊界 → 日記 tier read／expiry rollup／private saved meal quota、照片 lifecycle/orphan retry、rights/delete/backup restore suppression。按 surface 分 exact inventories，舊 demo 文案衝突另凍結；不要求把所有項目綁一次大 phase。 |
| 後續產品施工 P-commercial | O/L/X → 明確 subscription confirmation／14day trial／399monthly renewal／其他 duration plans、entitlement authority、cancel/refund、presale redeem；餐廳 activation/contract/fees 是另一最小 authority 包。復用現有 entitlement reader、不把 mock變PASS。成效退款 metrics 僅首月資料後新決策包。 |
| 後續產品施工 P-notice / P-training | P-commercial 的時間／取消狀態＋G → Email/App 通知排程/送達/retry/取消入口；訓練另需 D＋L/X 及不可識別性實證才設計 dataset/lineage/withdraw/jobs，不因 core grant 自動啟動。訓練 future expansions 每版獨立必要性與批准。 |
| 後續驗收 V / publication | 每個新包先 exact local independent acceptance；O/L/X＋approved clean publications/bindings＋inactive I cases＋legal activation delta acceptance 才可另授權 A cases。首次正式註冊與收費同步另須 commercial/notice/restaurant gates，未實作 case NOT EXECUTED。原 PC-2 local PASS 不重新開啟、不推 Production。 |

## 10. 本輪證據 provenance 與停止點

Fresh：本機 Git identities／精確三文件起始 hashes；全 3,328 tracked raw hashes 與 Git index 起止 parity；§8 相關 source 閱讀；三文件 exact-byte UTF-8/LF/whitespace/secret-pattern／連結／決策 consistency 檢查。外部 receipt 放 `pc2-owner-decision-sync-20261002/`，不新增第四個 repository path。

Reused：上一輪三份準備文件的 RPC/publication/singleton/I0–I6/A0–A13 契約規劃；外部獨立 reacceptance report（§1）的 478 vectors 與 accepted DB/build 結論只在 frozen source 範圍沿用，無 fresh suite/DB apply/typecheck/web export。本輪公開官方查核未重跑，03 §7 保留上一輪來源日期。Owner A–J 是提供事實／方向，不是 fresh remote evidence；歷史 pack 文案來源未重新取得，不補造原檔或批准。

Return：**READY_FOR_OWNER_DECISIONS_SYNC_REVIEW**，只表示三文件整合可供 review。三文件保持 untracked；PC-2 local acceptance 維持通過；法律 **DRAFT / NOT ACTIVE**；OD-15、TD-10/AU19、P-7 **OPEN**。不宣告 activation readiness PASS 或 live signup closure。不 stage/commit/push/deploy、不 fetch/remote DB/Auth/Storage/Management API／外部登入／法律 registry 啟用，不展開 PC-3/GQA-7/Group Table。停止於本輪報告與後續 exact scope 提案。
