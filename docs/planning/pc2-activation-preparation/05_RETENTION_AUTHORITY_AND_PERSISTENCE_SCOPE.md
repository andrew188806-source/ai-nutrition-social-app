> **Current corrective snapshot — 2026-10-04**：本輪僅修正 F2 native DDL authority／temporary builder 與 F1 predefined-role checks。原 R0-B acceptance 保留於 `26f9a136da4dc484e60a97828803f8c942452c62`；本輪 pre-commit gates 的有效逐項證據已齊備，新的 local candidate 尚待 Claude 獨立 reacceptance。§1–13 與下一個 2026-10-03 banner 均是原時點歷史，包含當時 superuser-only 限制；目前契約與 bindings 以 §14 為準。Hosted capabilities／套用歷史仍 pending；沒有 product writer、producer、部署或法律啟用。法律 **DRAFT / NOT ACTIVE**；activation pending。

> **Current implementation snapshot — 2026-10-03**：Owner 已批准 §13.1 的 server 首次成功保存 T0；本輪獲授權實作精確四檔 inactive foundation。Pre-commit local gates 為14成功／16負向／12 mutations PASS；尚不是獨立 acceptance，沒有 runtime capture／entitlement producer、產品顯示、回填或刪除接線。新增 migration 明確要求可信 DDL administrator；非 superuser apply 會 atomic fail closed，不以放寬 runtime 權限處理。§1–12 原 scope review、待批准敘述及 source ledger **逐 bytes 保留為歷史 snapshot**，本輪現況以 §13 為準。Local freeze 與 post-commit 結果另綁外部最終報告，不回寫本文件的歷史執行時點。法律 DRAFT / NOT ACTIVE；activation pending。

# R0-B — Authoritative Retention Persistence Scope Review

> **Final scope review（2026-10-03）**：本文件目前結果為 **READY_FOR_R0_B_FINAL_SCOPE_APPROVAL**，僅為提案待批准。§12與更新後§7.1是本次final契約／首包scope；其餘原review、source ledger、live設計與先前READY狀態保留為歷史snapshot，原§7.1全文在§12.9。四项缺口對inactive首包採「沒有已核定live producer／unknown不轉授權」的封閉契約；後續live接線的T0與權益語意仍未批准。本輪只更新05，未建立migration、scripts或產品能力。

Review date：2026-10-03（Asia/Taipei）。**READY_FOR_R0_B_IMPLEMENTATION_SCOPE_REVIEW** 僅表示本提案可交 Planner 審閱，不是施工、migration apply、Development acceptance 或 activation 授權。

建議先做 **R0-B-D：詳細日記 T0／grant authority persistence**，再做 **R0-B-Z：固定報表時區版本**；月度 grant 的實體接線需等 R1 有真正的 report identity。所有新增表、欄位、helper、角色、trigger 與工程 paths 均為 PROPOSED，這次只有本文件新增。

R0-A 純政策模組與 PC-2 local acceptance 維持通過。法律 **DRAFT / NOT ACTIVE**；activation pending。R0-C、R1–R5、OD-15、TD-10/AU19、P-7 仍未完成／OPEN。保存方向已確認，不再重問 14／180 天、六個月份、降級不縮 grant 或永久保存方向。

## 1. Git、證據適用性與分類

| 項目 | 本輪實際起點／限制 |
|---|---|
| Branch／HEAD | main；`3b1957e8dc459db6fdaa06bec873c1acc632ae9a`，正是 accepted R0-A candidate。 |
| HEAD parent／message | `308f2171164e719aff43d729bb19637cd3334538`；Fix retention timezone version consistency。 |
| 本機 origin/main | `b70884a013ac67486242fe5d11b9bfad1360032a`；ahead/behind 4/0。沒有 fetch，不代表即時遠端 branch 狀態。 |
| 起點 inventory | 3,341 tracked paths；142 migrations；tracked／staged diff empty，untracked empty。05 原不存在。 |
| Applicable AGENTS.md | repository、相關祖先與目標目錄未找到；查找紀錄保存在外部 evidence。 |
| 其他工作 | 保留 Demo Pool commits `f5b9ae0a982b7a2401c7d48e0c7b9387f4955bd7`、`308f2171164e719aff43d729bb19637cd3334538` 的 bytes／modes；未執行或重新驗收 Demo Pool。 |
| 本輪 write inventory | 只有 `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md`；保持 untracked。 |
| Fresh／reused | Fresh＝本機 source／hash／Git／文件檢查；reused＝已接受 Owner A–F、PC-2 acceptance、R0-A 原驗收／修正／最終 reacceptance。沒有重跑 R0-A runtime gates 或產品驗證。 |

分類：**OWNER_CONFIRMED** 是 Owner 產品契約；**SOURCE_FACT** 是綁定本機 source 可讀出的行為，並不表示本輪 fresh runtime PASS；**PROPOSED** 是待審閱技術設計；**IMPLEMENTATION_NOT_PROVEN** 是本機 review 未證明的完整能力；**OWNER_DECISION_PENDING**／**TECHNICAL_SCOPE_PENDING**／**QUALIFIED_REVIEW_PENDING** 分別是未決語意、authority／施工方案與專業批准。沒有將 historical proposal 升格為已批准能力。

04 首段及§12.6 的 BLOCKED／reacceptance pending 是 corrective commit 當時的歷史狀態；其後的外部獨立 reacceptance 已通過。保留 04 原 bytes，不倒填歷史。原 f28867a 的三項同 timezoneVersion 矛盾及修正過程同樣保留。

外部報告均存在，原始 SHA-256 在§10。最終 reacceptance 對 exact 3b1957e 證明 59 probes（原56完整 outputs 不變、原3修復）、23 smoke cases／644 assertions、27 mutation controls、27補充 controls及純度；這些是**沿用既有驗收證據**，本輪沒有重新執行，也不是 persistence／DB／activation PASS。

## 2. 已確認契約與 source findings

### 2.1 已接受的契約（OWNER_CONFIRMED，C04 §2.1；A01–A03）

- 詳細日記保存從原始紀錄時間 T0 起算，UTC 連續24小時；Free 14天、Paid 180天，旅行／DST／編輯不重設。
- 建立時取得保存權益，現在 tier 決定顯示。Paid 建立後降級不縮期限，超14天且未到180天的 present detail 保留但隱藏；復訂只重顯仍保留資料。
- 未到期 Free detail 的可信升級延長到原始 T0＋180天；不是 upgrade time＋180天，不承諾恢復 collapsed／deleted detail。
- Free 月回顧是含當月的六個月份；Paid 取得及升級時仍在免費窗口內的現存回顧取得永久方向。降級不撤永久 grant，僅限顯示；復訂可看仍保留月份。
- 固定帳號報表時區，改版不重排歷史月份；UTC期限與月份歸屬分開。私人收藏永久方向、刪帳與適用刪除義務例外保持。
- 40/200 vs 50/150 quota、照片／training／logs／cache／backup 的具體期限仍 pending；不設定任何 draft TTL，不增加 training 用途。

### 2.2 時間、寫入與重試（SOURCE_FACT；具體引用見§10）

| 現有來源 | 實際用途與限制 | R0-B 缺口 |
|---|---|---|
| S02 lines5–17、21–43 | `meal_records`／items 已有精確 `occurred_at timestamptz`，不是只有日期；另有 `meal_date`、逐餐 timezone、`created_at`／`updated_at` default now()。 | 沒有 immutable `originalRecordedAt`、保存 acquisition 或 grant deadline。欄位存在不足以證明 T0。 |
| S14 lines24–25、60–89；S15／S16 | Client 拒絕 created／updated 等 server fields，但傳入 occurredAt、mealDate、timezone；mapper 把三種 timestamps 分別映射。 | Client validator 不是 DB authority；caller occurrence 不能直接取得保存 anchor／Paid／永久資格。 |
| S10 lines498–540、685–705 | 現行 legacy create 從 auth.uid() 取 actor、先 require_core；接收 caller `p_occurred_at`。INSERT 沒列 created_at，所以此 RPC 的 created_at 由 DB default 產生。 | DB default 是這條路徑的建立時間證據，不是所有 legacy row 的 immutable retention provenance，也未裁定它就是 Owner 的 T0。 |
| S04；S05 lines367–370；S06末段 | authenticated 可 owner SELECT；anon 撤銷；authenticated／anon 的 meals／items INSERT、UPDATE、DELETE 被明確撤銷。S03 owner-all RLS 不會自行授予 table privilege。 | 本機 migration chain 支持走 canonical RPC；不聲稱已遠端查核 ACL，privileged/operator 舊寫入仍需來源證明。 |
| S10 lines821–983 | v2 在 actor/request advisory lock 下比 fingerprint，已存在返回原 row；新建呼叫 legacy create，然後只更新 client_request_id／fingerprint。 | capture 必須只在第一次實際 INSERT，後續 UPDATE／同 key replay 不換 T0／acquisition／deadline。無 key 的 legacy create 不是跨請求 exactly-once，不能憑新 trigger 宣稱修好了它。 |
| S10 lines291–342 | planned conversion 有 owner row lock、expected_updated_at、conversion key；caller confirmation timestamp 成為 occurred_at，呼叫 v2，converted_at 為 server transaction timestamp。 | planned time、caller confirmation、轉換 receipt 與 T0 分開；不把更晚 conversion replay 当新 acquisition。 |
| S10 lines1582–1603、2602–2623；S07 | 新的 AI／manual finalization 共用 legacy create，之後更新 fingerprint／correction／ledger；current／post_hoc 描述用餐來源時間。 | 不讓 analysis time、correction updated_at、retake 或 ledger 更新重設原 T0；新 resource 與既有 resource replay 分開。 |

**IMPLEMENTATION_NOT_PROVEN**：可信歷史匯入／跨來源去重／不可改寫 T0 的 authority ledger。没有從本機 schema 推造真實帳戶資料、遠端缺表或已部署狀態。R0-B-D 不新增 import API；未來匯入必須有獨立驗證的原始事件，否則 quarantine，不把 caller 的過去日期當 T0。

### 2.3 會員來源與 server authority

S01 lines69–80 的 `subscription_entitlements` 有 user、plan_code、entitlement_source、source_reference、valid_from／until、status、created／updated。source_reference 可空，沒有本包所需 immutable event id、producer驗證、歷史完整性／修訂序列或逐餐 acquisition。

S08 只 grant authenticated SELECT；S03 line38 owner SELECT RLS；S10 lines22–23 加 PC-2 restrictive gate／core trigger。**不把 subscription table 寫入說成一般 Client 可自行操作。** 在本輪 bounded search（migrations／functions）中，沒有證明 canonical billing producer 或 Paid 升級 immutable-event writer；不等於遠端不存在。

S11 的 Social resolver 只讀四欄 `plan_code,status,valid_from,valid_until`，明確不讀 source/reference/id／timestamps；驗 actor predicate，錯誤不 fallback Free。S12 用 free／premium，premium 的 active／grace_period 且 now 在 inclusive validity 上界內，沒有 row 在這個 **Social-only** 契約可 resolved Free。這不能直接變成 retention 的歷史 Free／Paid acquisition 或永久權益。R0-B 不改 Social resolver、plan caps 或 billing；須先核定 retention adapter 的 plan/status/validity／complete-source 語意和可追溯 writer。

S09 lines100–128、S10 的 core RPC gate 是已接受 authority。core 是否 allow 由 active profile、正式 consent 或既有 preparation cohort／rollout 分支決定；不能把單一 training flag 重算成新 core rule。training withdrawal 是既有 canonical path，不等於刪 diary 或撤銷 grant。

S18 有 deletion request 狀態文字與 timestamps，沒有本輪可證明的完整 account／backup／processor rights disposition。rights read 失敗或未知 status 不能自動包成 `clear`。grant schema 不完成刪帳 executor，也不能讓永久 ledger 成為刪帳後無條件留存的新資料集。

### 2.4 月度 source 與 compatibility

S01 的 `consumer_preferences.timezone` 預設 Asia/Taipei；S03允許 owner-all，S10加 core gate。它是可變的偏好，沒有 fixed-report timezoneVersion、effective boundary 或 immutable歷史月份 registry。meal timezone 也不是帳號固定報表時區。

S17 建的是 daily_nutrition_summaries；S10 lines2797–2910 的 daily upsert 接收日期／timezone，按 user/local_date/timezone/calculation_version 更新。它不是 monthly report、永久 grant、完整全月證明或 detail收合。S19／S20 的 read window 也不是 retention persistence。

bounded search 在 migrations／functions／consumer-meals／consumer-auth 未找到 monthly review persistence、report_timezone/version、retention_grant／retained_until authority；標示 **IMPLEMENTATION_NOT_PROVEN**。R0-A 的 MonthBinding 與 MonthlyGrant 是純輸入型別，沒有因此產生表或合法 reportId。

A02 僅接受最多三位 fractional second 的 explicit-offset ISO instant；既有 PostgreSQL timestamptz 可有更高精度。新 metadata 需明定一次性的毫秒表示，保留原始時間／來源 precision，不可把舊 row silent rounding 當作已驗證 T0。A03以 Intl canonical zone 核對 aliases；資料庫 zone 名稱接受集合／tzdata 不可只用「目前 offset 相同」等同，須在實作包鎖 tooling／tzdata 與 parity evidence。[PostgreSQL datetime documentation](https://www.postgresql.org/docs/current/datatype-datetime.html)

## 3. 建議的最小持久化模型（PROPOSED；不是現有 schema）

選擇在既有私有 `consumer_internal` 增加 metadata，不把保存權益放進 UI、JWT user_metadata、餐點 note 或 client可寫欄位。**不修改 R0-A source／tests、不改既有142 migration bytes**。schema只透過另授權的新 forward migrations 建立；不建立 public任意 grant API。

### 3.1 R0-B-D：三個必要實體

| Proposed entity | 最小內容／constraint／必要性 |
|---|---|
| `consumer_internal.retention_owner_state` | 一個 owner row：authority revision、source coverage／unresolved狀態、已驗 producer版本及處理cursor。FK auth.users；提供不存在 entitlement row 時仍可序列化的 per-owner 鎖。不是另一份會員收費系統。 |
| `consumer_internal.retention_authority_events` | owner、source namespace＋upstream event id、immutable payload digest／source revision、effectiveAt、recordedAt、事件類型、verified tier at event、policyVersion、來源precision／驗證版本、處理receipt。Unique(owner,source namespace,event id)；相同id不同語意是 conflict，不能覆寫。append事件內容與可變處理狀態分欄，replayed結果須可追溯到實際grant revision。禁止保存 token、照片、完整餐點或 provider敏感raw payload。 |
| `consumer_internal.retention_detail_grants` | owner＋mealRecordId、immutable T0、capture來源／create event、acquisition tier／event／at、retainedUntil、extension事件引用、policyVersion、provenance、grant revision。允許明確 pending metadata，但 pending 沒有可使用的 acquisition／deadline；resolved grant 不以 NULL 或 Free預設模糊表示。 |

grant owner/resource以 composite FK 綁 `meal_records(id,user_id)`；因此 foundation migration 需補這對欄位的 UNIQUE supporting constraint／index（不是只加無 owner 的外鍵）。resolved deadline只允許 T0＋14×86,400秒或 T0＋180×86,400秒；Free延長必須有經驗证的 U<E14 evidence。資料庫 elapsed arithmetic 用 UTC epoch／秒／毫秒，不用依 session timezone 的 calendar-day interval。downgrade沒有減少deadline的write path。

T0、acquisition、source event content不能一般 UPDATE。extension只在已驗歷史事件、revision CAS與交易下單向提升，原acquisition不改；policyVersion固定到已接受 R0-A版本。寫入receipt帶old/newrevision、event identity與exact normalized grant digest；未commit沒有 persisted receipt。原event資料與audit留存本身仍受刪帳／適用義務，沒有「immutable所以永遠不可刪」的法律例外。

### 3.2 T0 capture 建議與未決 gate

**PROPOSED recommended mapping**：未來新的 canonical record 第一次 server接受時，記錄一次 server UTC毫秒 T0（在共同 INSERT 邊界捕捉明確 server instant），acquisition.at=T0。`occurred_at`继续代表用餐／補記時間，`created_at`继续保留既有 generic DB timestamp；不改這些欄位的舊用途。將「原始紀錄時間」映到first server record acceptance尚需 T0-1裁定，不能冒稱 Owner 已選定此實作。

方案以私有 AFTER INSERT capture helper 在同一 meal transaction 建 metadata／grant；不是Client提供 T0、Paid、deadline或proposal。初始化時保存原始capture instant及一次毫秒量化版本，所有後續adapter使用同一已持久化值；R0-A acquisition與T0必須同瞬，不能每次讀取重新 round 或截斷。DB clock不是 Client clock；鎖等待後的capture順序／event boundary要列入local驗收，不用updated_at代替。

如權益來源 unresolved、core／rights／protection不能證明，保留 pending capture並記錄原因，**不得自動授予Free14／Paid180或purge**。新metadata硬寫入失敗必須回滾同交易；不能meal成功卻丟capture。pending是保留既有RPC可用性的提案，並非已完成grant。啟用 resolved capture 前，AUTH-1／AUTH-2與local gates必須通過；若Planner要求未知source整筆create拒絕，須另核定相容性，不悄悄改既有RPC成功語意。

legacy key replay只讀既有record／receipt，不把缺metadata的既有row當新INSERT回填。現有legacy無key請求依既有語意可能新建另一餐；R0-B不從相似title／時間猜duplicate。import、離線merge、刪除後重建是否同resource，均不在本包暗中新增。

### 3.3 R0-B-Z／R0-B-M：月份 metadata，按依賴分開

| Proposed entity／範圍 | 設計與限制 |
|---|---|
| B-Z：`retention_report_zone_versions` | PK(owner,timezoneVersion)，保存raw timezone name、canonical zone identity、canonicalizer/tooling/tzdata version、effectiveAt及變更event來源；同版本只能一個canonical zone，row immutable。不同帳戶可各自有v1，不建立跨帳戶錯誤的global version registry。 |
| B-Z：account active-zone pointer | 在owner state增加指向已驗zone version的reference。初始zone與manual change先經TZ-1／TZ-2；普通偏好、旅遊／devicezone不能自動更新此pointer或重寫舊version。 |
| B-M：immutable report month binding | R1真實report owner/id FK、monthKey、raw timezone/version、monthBindingVersion、生成來源與collision狀態。不可現在造report placeholder，R1未定表名時不能凍結不存在的FK。binding先建立再grant；當月payload更新只改report版本，不換month identity。 |
| B-M：monthly grant | owner/reportId、acquisition事件／period、permanent boolean、可追溯promotion事件／period、policyVersion/revision；原始report binding完全匹配，permanent只能false→true，downgrade不能true→false。absence不是Paid permanent或「當時Free」。 |

B-Z可先驗version consistency，不代表B-M完成。B-M需R1存在report与歷史period來源；只promote可信upgrade當時六月份窗口內、實際存在且有合法grant的report。資料不存在／已刪／window外／來源不全不能產生永久grant。Paid current不能當作過去Paid period。

同version跨historical／active／acquisition／stored promotion／incoming promotion的canonicalzone都必須一致；合法不同versions保留。已保存的rawzone和period不能因alias canonicalization而覆寫：R0-A top grant與MonthBinding仍做raw equality，event signature也含raw period。aliases可接受，但event第一次admission的normalizedrepresentation要凍結，重播不得換rawalias製造或掩蓋EVENT_CONFLICT；不能靠同offset／wildcard豁免。

歷史monthKey／zone version不重排。manualchange發生在月界、跨回上一月份、同label不同版本collision及晚生成report的acquisition時點，尚需TZ-2／MONTH-1；未核定時structured unknown，不能當invalid history可刪或自行merge。免費六月份窗口是calendar labels含當月，不把六個月換成180天。

## 4. R0-A inputs／outputs 的 persistence 映射

| R0-A field／output（A01、A03） | 未來trusted來源與映射（PROPOSED） | 未知時行為／包界 |
|---|---|---|
| actorId／resourceId | authenticated entry取verified actor，DB join resource.owner；內部producer須有受限身份且event owner一致。 | body owner／JWT可改claims不是authority；cross-owner拒絕。 |
| policyVersion／evaluationInstant | 已接受policy版本；server transaction的一個明確evaluationInstant；不要混用多次clock讀值。 | invalid/future/不支持precision→unknown；沒有clientclockfallback。 |
| originalRecordedAt Fact | private capture T0，sourceIdentity=具體capture/event namespace，sourceRevision=不可變receipt/grantrevision，factAsOf不早於T0。 | legacy缺證→FACT_MISSING／PROVENANCE_UNKNOWN；不選updated_at／occurred_atfallback。 |
| acquiredGrant Fact | 已commit的detail／monthly grant＋事件references；已驗owner、anchor／deadline／tier／version／precision。 | 沒有grant→HISTORICAL_GRANT_MISSING，不由current Paid推造。 |
| action.create/acquisition | 真正newINSERT capture event；detail acquisition.at=T0；tier来自此時可信authority snapshot。 | 不能由caller宣稱newResource／resolved；未知用pendingmetadata，不執行有效grantwrite。 |
| action.upgrade/events | verified immutable Paid transition，排序effectiveAt＋canonical sequence，來源eventId／period保留；每resource processing receipt。 | read錯誤、conflict、sequencegap→pending，不丟掉historical event，不用現在Paid替代。 |
| currentEntitlement Fact | retention專用approved adapter讀完整來源，snapshot在evaluationInstant有效；free亦需complete coverage證明。 | Social empty-row規則不能直接偷渡；readfailure不是Free；Paid沒有歷史grant也不補。 |
| monthBinding／activeReportPeriod | R1 immutable report binding＋B-Z在evaluationInstant有效的accountzone version，明確period與月份。 | 同version矛盾→TIMEZONE_VERSION_CONFLICT；缺version／collision→unknown。 |
| coreEligibility Fact | 沿用S09 core_eligible/require_core，從一致transaction來源採樣；preparation cohort不是正式法律批准。 | deny不提供新的grant transition／顯示；unknown不升格allow；保留原PC-2規則。 |
| materialState／protection／rightsState Facts | owner-matched現存row／tombstone、已批准protection與rights adapter，current facts的factAsOf均等evaluationInstant。 | presence不是完整rights-clear；unknown protection不當none。R2/R5未完成時保留pending，不能抹除它們的依賴。 |
| retentionStatus／visibilityStatus | 從已commit grant与当前facts重新評估；兩軸分開，不將display當作DB刪除条件。 | R0-C才接產品讀取／顯示；B僅metadata，不改查詢結果。 |
| grantTransitionProposal | 只可作內部計算的待驗提案；DB再驗源revision／事件／權限／scope／不縮term才commit。 | A輸出persisted=false；只有額外交易receipt才說已持久化，不能修改A輸出型別假稱true。 |
| purgeAllowed | 永遠false；B不暴露purge能力。 | due、永久、unknown均不能授權刪除、收合或照片處置。 |

來源hash是binding，不是authentication。未來private helper不得接收未驗caller grant JSON直接落表；若採SQL實現少量detail grant持久化計算，必須以已接受R0-A作**獨立runtime parity oracle**，並驗exact grant／unknown/reason，而非只比table數量。SQL不能直接執行TS；本提案為保持record/grant同DB交易而選DB內authority，並不宣稱SQL parity現在已完成。04原候選Edge repository/service尚未凍結，這次選擇先不增加兩個Edge paths；如原子性或authority無法成立，停在scope revision，不暗中擴包。

## 5. Grant transitions、事件、冪等與併發（PROPOSED）

| Transition | 寫入條件與結果 |
|---|---|
| new captured＋resolved Free | acquisition.at=T0且source完整，首次create保存E14；deadline精確T0＋1,209,600,000ms。 |
| new captured＋resolved Paid | 首次create保存E180=T0＋15,552,000,000ms；event／source版本與tier snapshot一同commit。 |
| captured unresolved | metadata pending＋具體reason；沒有resolveddeadline，不稱E14到期或180已取得。後續只能用與原T0有關的已驗證event解決，不能拿更晚currenttier回填。 |
| Free未到期升級 | 可信U<E14、materialpresent、coreallow、rightsclear、protectionnone與revision一致；保留acquisition與T0，E單向延至T0＋180天，保存原U。 |
| downgrade／取消／會員到期 | 只更新current authority fact／revision；已得E180及monthly permanent不縮，不對hidden detail執行expiry。 |
| resubscribe／重複upgrade | 仍可依來源對符合條件的Free grant處理；已得E180不再延長，不能U＋180。event重播noop並回原receipt；present／expiry／provenance各自驗證。 |
| late delivery | 使用可信effectiveAt，不是receivedAt；U<E14可能在後處理，但不恢復已collapsed／deleted資料。event gap／未完成處理維持pending並阻止未來R3誤判；不能把「已收event」當「所有resources已extend」。 |
| exact／after expiry upgrade | U=E14或U>E14不延長Free grant；receipt記no-op原因，不誤當已恢復。 |
| monthly promotion | 有真report／grant，可信U的固定zone period內包含reportmonth；permanent false→true。同版本矛盾／缺period不能promotion。B-M另包執行。 |
| conflict／未知 | 同event不同payload、future event／T0、unknownsource、staleCAS、alias/version矛盾都拒絕或pending；不silentoverwrite、推永久、默認Free或purge。 |

1. per-owner authority row用unique key安全bootstrap，再鎖row；新creation與canonical entitlement producer必须遵守同一owner序列。沒有收費writer接入，不能只靠consumer側鎖宣稱沒有upgrade race。
2. unique事件identity＋payload语义digest分離：UTC同瞬、固定schema／版本、凍結period表達，真差異conflict。不要hash任意JSONpropertyorder使等價重播失敗，也不能忽略tier／owner／eventAt／period等權益欄位。
3. grant revision CAS＋rowlocks；處理receipt與grant在同transaction落地。事件未完整處理的owner/resource狀態不能回fully resolved；排序相同時點用canonical序列，來源缺序列／gap則pending，不以arrival順序猜有效Paid。
4. 保持transaction短，不在鎖內打billing/network/AI。owner→events／zone→grant按stable resource id鎖順序；若採共同INSERT hook，existing planned／finalization已持row/request/analysis locks的相容性必須實測鎖圖。upgrade不能在持owner/grant後逆向鎖meal造成deadlock；即使只普通讀material也須驗FK cascade／commit-order race，不把read snapshot當全域鎖。
5. 接入方案若無法保留此順序，停止並提exact forward RPC successor scope，不能直接重寫既有S10／PC-2harness。capture／producer／zone／retry每條writer都須納入相同規則；未覆蓋的writer是gate failure，不是acceptable bypass。
6. PC-2 consent／rollout／withdraw使用其既有locks，新的owner lock不能假稱已自動與它們互斥。需要跨state串行時，先證明可用的共同鎖順序及拒絕commit時eligibility race；否則相關事件pending，另提必要scope，不修改已接受authority。
7. 重試因connection／CAS／deadlock失敗只重播原event／request，atomic rollback不得留下false success receipt。部分batch outcome逐resource持久記錄；owner completion watermark只能在整個已證対象集合成功後前移。

locks必須由所有相關writer協作、使用一致顺序；rowlock与advisory lock不是來源认证。[PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)

## 6. Privileges、RLS與PC-2相容性（PROPOSED）

新私有metadata tables採ENABLE＋FORCE RLS，顯式owner／operation policies與最小GRANT；不對authenticated／anon／PUBLIC暴露INSERT／UPDATE／DELETE或internal helper EXECUTE。Client不得提交T0／Paid／永久grant，也不能把owner id傳進security definer繞隔離。選用受限no-login、non-BYPASSRLS authority role只持必要tables/functions權限，role ownership／migration-time memberships與撤銷需列逐項ACL gates，不藉postgres／service_role broad runtime權限概括通過。

canonical create的trigger context驗證實際NEW.owner、core及source，而不是只信auth.uid為某個存在帳戶。內部entitlement事件entry仅允許已核定producer role，核實source/owner/event，沒有自助Paid API。不同服務場景的owner授權要明確，不把authenticated的auth.uid規則生搬到無user session的producer。

RLS与GRANT分開核對；private schema不暴露API仍須ACL／RLS防線。[Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

security definer functions採fully qualified references／trusted search_path，建function與revoke PUBLIC/default EXECUTE在同一transaction，防止暫時開放；definer身份可能繞RLS，仍需顯式owner與操作驗證。[PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html)

S09準備cohort、current bundle／registry approval與canonicaltraining path不修改；不讓grant capture切換rollout enforcing或legal state。withdraw不縮已得grant、也不靠存grant讓core denied取得產品顯示。pending deletion／unknown rights會阻止新的有效transition，既有metadata不因deny被改成短期或抹除。

grant表的immutablecontent guard必須留出既有Auth deletion FK cascade的受控相容路徑；不能阻擋刪帳或把事件表永久保留。schema清理不等於完成R5及所有copies purge。本包沒有新的purge API／scheduler。

## 7. 最小候選施工 inventory 與完成標準

以下是**另需授權的候選清單**，不是這次write inventory。新的migration timestamp需施工前用既有CLI生成（`supabase migration new`），記錄實際兩個full filenames再凍結；下列尖括號不是檔案，也不是允許任意增加migration的glob。沒有建立SQL。

### 7.1 Final candidate：R0-B-IF inactive persistence foundation（4個精確候選paths；PROPOSED）

本節依 **AUTHORITY CONTRACT RESOLUTION AND FINAL SCOPE** 指令更新。原本5-path／2-migration capture方案完整保存於§12.9，沒有冒稱已批准或已實作。§3–9先前live提案與V01–V12驗收保留為後續integration參考；本首包以§12的inactive契約及IF／N／M gates為準。

| 順序／完整候選path | 必要性及精確邊界 |
|---|---|
| 1. `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql`（新增） | 一個transaction建立獨立私有 `retention_internal`、sealed storage owner role、四張metadata表及僅約束新表的immutable／non-shrink guards、default-deny RLS與REVOKE。沒有meal capture、entitlement producer、public RPC、原表index／trigger／function變更或seed/backfill。 |
| 2. `scripts/consumer-retention-persistence-smoke.mjs`（新增） | disposable本機PostgreSQL的fresh／upgrade兩種apply、原authority catalog/data compatibility、private結構／constraints／原子rollback／ACL/RLS／inactive不生效驗收。完整IF01–IF14與N01–N16在§12.7；不是重新執行原PC-2／R0-A suite。 |
| 3. `scripts/consumer-retention-persistence-mutations.mjs`（新增） | disposablecopy／DB執行M01–M12：先正常setup PASS，再確認exact mutation生效及指定behavior CHECK偵測破壞，保存rawoutputs。不能用setupfailure代替detection，不能弱化原assertions或改既有harness。 |
| 4. `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md`（本文件） | 保存final scope、設計／批准／實作分類及該施工輪實際證據；目前只有文件更新，未stage／commit。施工與commit需另授權。 |

**精確migration順序**：原142檔按目前既有lexical sequence全部先apply，最後是 `20260930174030_consumer_pc2_core_social_eligibility.sql`，再apply本候選migration一次。實作後預計共143檔；現在仍142，沒有建立SQL。

候選timestamp取本輪 `clock.curr_time` 的 `2026-10-03 06:21:57 UTC`，**僅保留完整檔名**；未執行 `supabase migration new`，不冒充CLI已生成檔案。因本輪禁止建立migration，施工前須再確認此name不碰撞／排序仍成立；若CLI生成名或successor migration使名稱／次序變更，先重綁exact inventory供批准，不靜默rename或新增第二份migration。

從2份收斂為1份的原因：共同INSERT capture、T0 acquisition與livegrant writer需要尚未就緒的authority；放入foundation會造成產品接線或真grant建立。本包只建一組私有structural objects，不需要第二份integration migration。原候選 `consumer_retention_detail_grant_capture`、對既有meal加supporting UNIQUE／FK及Edge repository/service都**不在最終首包inventory**，保留後續另包提案，不建立其檔名作授權。

**獨立完成標準**：IF／N／M的actual local DB gates、fresh／upgrade相容性、scope外frozen proof及獨立acceptance通過；新表空、無可用writer／producer、無真grant／legal seed、既有RPC行為及source/catalog identities不變。PASS名稱只能表示inactive foundation本機驗收，不表示automatic capture、upgrade、R0-C顯示、monthly persistence、purge或activation完成。

### 7.2 B-Z：後續固定zone registry（3個候選paths，獨立授權）

- `supabase/migrations/<CLI timestamp>_consumer_retention_report_zone_versions.sql`：私有version registry／active pointer／event/source bindings／受控zone変更；TZ-1／TZ-2先決。不生成報表。
- `scripts/consumer-retention-report-zone-smoke.mjs`：同version一致性、aliases、不同versions、月界／histbinding不可改的actualDB＋R0-A映射。
- `scripts/consumer-retention-report-zone-mutations.mjs`：version映射overwrite、offset/wildcard假alias、Client改pointer、cross-owner及rawevent replay差異。

上述需已接受B-D的事件／actor／revision基础；若只需要zone registry先施工，須另凍結可獨立用的最小authority依賴，不复制一套billing／locks。

### 7.3 B-M：R1真report存在後的monthly grant package（尚不可凍結完整inventory）

候選new forward migration slug `consumer_retention_monthly_grants`；候選scripts `scripts/consumer-retention-monthly-grant-smoke.mjs`、`scripts/consumer-retention-monthly-grant-mutations.mjs`。真正FK表／R1 materializer接線full path，须R1scope決定後列明，不提供可任意加檔的授權。只有metadata／grantwriter，不代R1生成／評分、不代R0-C顯示、不收合detail。

## 8. 必要驗收契約（PLANNED / NOT EXECUTED）

以下案例本輪只規劃，沒有localDB／Development／mutation執行。使用disposable本機DB與合成actors，紀錄tooling、appliedDDL/currentfunc hashes、exactcommands/exits、完整stdout/stderr、各case input/expected/actual／failed CHECK/runtime、before-afterDB／event inventories；Development另須明確授權，不能使用real members。

| Gate | Local acceptance／expected | Development acceptance（另授權） |
|---|---|---|
| V01 T0／create paths | 新legacy、v2、plannedconversion、AI／manualfinalization首次INSERT建立一次T0；無論callerbackdate／futuretimestamp／edit／fingerprintUPDATE都不換anchor。無可信T0來源只能pending。 | exactdeployedcandidate每條path用syntheticowner重放；實際ACL／clock/precision／trigger/currentRPC身份。 |
| V02 原子性與replay | capture／grant／item／analysislink任一失敗整交易rollback，無orphan grant/receipt；同v2 key／finalization replay原grant bytes相同；同key異payload拒絕。 | RPCretry／networktimeout後同key查receipt，只commit一次；legacy無key語意如實。 |
| V03 UTC／expiry | 14／180期限E−1ms／E／E＋1ms；同瞬offset、DST、跨年閏日；DB不同sessiontimezone結果一致；DB microsecond→A millisecond mapping無重新量化。 | 不同runtime/tooling source identities與DBprecision parity，不用手機time authority。 |
| V04 grant monotonicity | Paid建→Free期限仍E180；Free U<E14延至原T0＋180；U=E14／after不延；重复升級／復訂不重新起算；deleted／collapsed不恢復。 | canonicalproducer先證歷史event来源，再驗upgrade/downgrade/expiry/receivedlate；currentPaid不能补legacygrant。 |
| V05 source gaps | empty/unavailable/unknownplan、未核producer、stale/source revision、future／矛盾事件、缺rights／protection全部不造resolvedgrant。pending不是Free14或permanent。 | fakeclient／錯producer／未驗來源拒絕；realmember與billing更改不在fixtures。 |
| V06 identity／privileges | anon、authenticated direct DML／internal EXECUTE、wrongowner／mismatchedcompositeFK、requestcallergrant偽造均拒絕；role+GRANT+RLS+definer/search_path一起驗。 | syntheticA不能看／改B；REST/rawquery/internalRPC各入口ACL查證；不靠service_role迴避隔離。 |
| V07 events／CAS | identicalevent重播noop；異payload conflict；recordedAt不能冒充effectiveAt；out-of-order／gap pending。receipt、grantrevision及completioncursor不先報成功。 | source事件與canonicalproducerrevision連續性、並發更新下CAS重試及partialbatch恢复。 |
| V08 concurrency | createvsupgrade／兩upgrade／downgrade／existingplanned-finalizationlocks／consentwithdraw／deletionFK races；多resource稳定鎖顺序，无缩term／漏event／wrongowner；deadlocktimeoutrollback保留原bytes。 | 合成actors並發；只在另授權隔離Development操作；不把本機mutex當remotePASS。 |
| V09 recovery／legacy | crash每個receipt/grant写入點、重啟重播、source重新可用；legacy無T0/grant仍unknown，無automaticbackfill，不能以nowPaid補歷史。 | dry inventory＋明確backfill例外授權後才可能驗legacy；此包不执行backfill。 |
| V10 months／B-Z／B-M | 含當月六月份、跨年；Paid acquisition／Free-windowpromotion；降級永久不撤；同version矛盾unknown；合法aliases／不同versions；rawmonth/version不可重寫。R1report缺失拒絕。 | B-M需真R1report與binding；currentpartialupdate不換身份；zonechange/monthcollision與late report按已核定方案。 |
| V11 PC-2／rights | coredeny／unknown不得新有效transition或顯示；preparationcohort、legalbundle不變。withdraw不縮grant，AuthdeletionFK不被immutabletrigger阻斷；不宣稱清除全部copies。 | 既有core authority exactidentity，合法deny／withdraw／account cascade；不啟法律作fixture前置。 |
| V12 boundary／scope | 無purge／collapse／scheduler／photo／billing／法律activation／R0-Cquerywiring；scope外bytes/modes凍結；A輸出purgeAllowed始終false。 | 即使metadata部署也不宣稱retentiondisplay／purge／activationready；各後續包另acceptance。 |

DB runtime tests不能以source字串代替；mutation正常setup先通過，再驗變更實際生效及預定behaviorfailure，setup／apply／ACLconnection錯不能算negativecontrolPASS。受新migration影响的原有necessarychecks另列精確集合，不能因此重開已接受PC-2remediation、全面重跑478或修改其frozenharness。

## 9. 未決事項、歷史資料與rollout

### 9.1 真正design／實作gates（不重問已定保存方向）

| ID／分類 | 最小需回答事項／具體選項 | 阻擋範圍 |
|---|---|---|
| T0-1 OWNER_DECISION_PENDING | 「原始紀錄時間」在新server資料的映射：A（建議）首次可信server接受record的瞬間，calleroccurred_at只作餐時；B 經核定authority驗證的原始發生／import事件時間，需說明可信producer與不可改寫證明。不是任意callerdate。 | B-D resolved capture／acquisition實作；14/180／UTC／編輯不重設已定，不再選。 |
| AUTH-1 TECHNICAL_SCOPE_PENDING | 指認canonicalentitlementproducer及exactlocalpath／verifiedeventnamespace：A 使用可證來源的既有writer接入；B 只有internal syntheticcontract可先local驗收，realproducer另package。沒有源path不能假設billing完成。 | Real automaticcreate／upgrade grants與rollout；不阻擋本文件scope review。 |
| AUTH-2 TECHNICAL_SCOPE_PENDING | retention的free/premium→free/paid、active/grace/validity／event boundary、缺row何時可證completeFree，以及source revision/sequencegap的authority contract。既有Social-only語意可作候選但不自動通用。 | B-D resolved tier／歷史transition；需要Planner/authority-owner核定，不改費率或付費產品。 |
| TZ-1 TECHNICAL_SCOPE_PENDING | 首次固定reportzone：A server驗證一次owner選定帳號偏好並建立v1；B onboarding明確選zone再建立v1。現profiledefault不能充作所有歷史reportzone。 | B-Z／B-M；非B-D必要前置。 |
| TZ-2 OWNER_DECISION_PENDING＋TECHNICAL_SCOPE_PENDING | manualzone變更effectiveboundary：A 當期已綁月份保留，後續新report使用新version；B 另選明確生效instant，但須定同labelcollision／向後跨月處理。兩者均不重排histmonth，collision先unknown。 | B-Z livechange／B-M；不延伸旅行自动切換。 |
| MONTH-1 TECHNICAL_SCOPE_PENDING | R1 report真實身份、creation／late-generation與acquisitionperiod來源，以及同label/version冲突的current publication規則；保留已定Paid獲取永久方向，不能凭currentPaid批旧report。 | B-M integration；不塞入首包或猜報表算法。 |
| RIGHTS-1 TECHNICAL_SCOPE_PENDING／QUALIFIED_REVIEW_PENDING | core以既有authority；rights／protection來源完整性不足的條件先pending。確認可證newresource clear/protectionnone與legacyunknown邊界；全刪帳／copies disposition另R5專業批准。 | 受影響resolved transitions；本包不能填假clear以略过R2/R5。 |

first package最少需要T0-1＋AUTH-1／2及newresource rights/protection安全邊界；TZ-1／2、MONTH-1、quota、照片TTL不是B-D全數共通前置。Planner可先審exact internalfoundation方案，若只批准synthetic契約，其完成名稱／report必須明示未接真producer，不能替代整個R0-B實際authority完成。

### 9.2 新資料與legacy分開

新資料在真正INSERT capture後才可能有新的可信T0／acquisition；同key重播不是新資料。舊rows缺來源一律unresolved，不以created_at看起來像servertime、source_reference文字或目前Paid判定原acquisition。不縮legacy保留、不中斷其既有產品顯示來假裝R0-C已做，沒有purge。

歷史inventory需獨立授權：量化每owner/resource的capture／clock／sourcechain、grant與永久证据、duplicates／zonecollision、缺失原因；分read-onlydryrun、可驗backfillplan、Ownerexception／qualifiedreview、actualrollout。缺證時不得批量補Free14、Paid180／permanent。這次沒有遠端確認帳戶、tablecounts、帳號tier或資料內容，也沒有backfill。

### 9.3 Rollout與rollback（PROPOSED）

1. 先Plannerscope／OwnerT0／sourceauthority批准，CLI產生兩個exactmigration filenames再凍結inventory；localdisposableapply與independentacceptance後，Development另授權；法律publication／rollout與Production再各別批准。
2. Foundation additive private tables可先驗空schema＋syntheticevents，不讀真member建立歷史快照、不初始化假Paid／永久權益。capture未active或來源不合格的資料不能宣稱已授權retention。
3. 啟用時明定start／coverage boundary与producer version；記錄事件gap/pending receipts，監測grant/capture一致性但不存敏感完整餐點。rollout前後不能因目前Paid補首次coverage之前的歷史。
4. rollback優先disable新增writer/integration gate、撤銷新增entry privileges，保留已得到的合法grant／event identity與pendingreceipt，**不縮grant、不drop表丟證據、不reset原資料**。不把接受過grant的consumer倒回默認14天。
5. writer停用期間要保存合法來源事件或標記coveragegap；resume先以原identity/revision核對及重播，缺gap證據仍pending。不能silent現在tier回填或把沒有處理的upgrade視作不存在。
6. account deletion／retention of event audit必须按另核定rights處置；rollback不是使資料永久逃避刪除的理由。備份restore重現舊grant／已刪資料的處置在R5，不由本包宣稱完成。

### 9.4 後續包與publication的依賴

| Package／blocker | 接續方式與未完成能力 |
|---|---|
| R0-C | 用已驗servergrant/currentfacts接serverread/display與mobile，另解rawquerybypass／pagination；B metadata不使顯示14／180生效。 |
| R1 | 新monthlymaterializer／完整inputwatermark／reportidentity，依B-Z與固定月份；B-M隨真reportatomic绑定，不先造report。 |
| R2 | 私人savedmeal snapshot／quota裁決與protectionfacts；cataloguebookmark不免detail到期。 |
| R3 | 依B可信grant＋R1完整summary＋R2保護／rights批准才可收合；due與hidden不可混淆，unknown／pending sourceevent不授權purge。 |
| R4／R5 | 照片資產lineage／TTL、trainingwithdrawcopy、刪帳、logs/cache/backup/restore各自scope／Owner與qualified gates。 |
| OD-15、TD-10/AU19、P-7 | OPEN；photo prerequisite approval/governance与既有Developmentevidence差異保持，不由metadata／localPASS解決。 |
| Historical ordering conflict | 舊roadmap executionorder与laterimplementationcommits差異保留；按可證依賴提包，不倒改歷史或宣稱Owner已裁決。 |
| Publication／rollout | C01 readiness／C02發布與C03新增acceptance cases維持原status；legal drafts、registry、399現行月費／299未採用不改；不宣告activationreadinessPASS或live signupclosure。 |

## 10. Source identity ledger 與沿用證據

本輪sourcecommit統一為 `3b1957e8dc459db6fdaa06bec873c1acc632ae9a`。下列rawSHA-256不是GitobjectID；每項已對照起點manifest與committedblob。A01–A06及C04的bytes與acceptedcandidate一致；S系列sourcefacts在§2／3／6限定解讀，source存在不表示遠端已部署。本機readcopies與額外Gitblob/mode在持久externalsource-bindings.json，本文件也列出所有主要bindings。

| ID | 本機source（repository-relative identity） | Exact raw SHA-256 |
|---|---|---|
| C01 | [docs/planning/pc2-activation-preparation/01_OWNER_FACTS_AND_DECISIONS.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/01_OWNER_FACTS_AND_DECISIONS.md>) | `77228b7a3d530a1c9175cdb860baa8258e23a5ff9dc7e4d84353b70b441866d5` |
| C02 | [docs/planning/pc2-activation-preparation/02_PUBLICATION_AND_ROLLOUT_PLAN.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/02_PUBLICATION_AND_ROLLOUT_PLAN.md>) | `10c95e29a83fe41430da8ff249801ea427b9e641b3236a80791fa403499aea45` |
| C03 | [docs/planning/pc2-activation-preparation/03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md>) | `337456c477255ba37f29a26aa064bd0c7a19e5b11cb15307e977c5f75ec2ac04` |
| C04 | [docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md>) | `681cf4d23facc548d65ffca413a7bbfcd040e30b8bfe0a02f47639b51efc44f9` |
| A01 | [packages/shared/src/domain/consumer-retention/types.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/types.ts>) | `410b69792efe8a9464162968059bb7e57c21e7130e7a5b31673715d440dea93d` |
| A02 | [packages/shared/src/domain/consumer-retention/policy.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/policy.ts>) | `cd12e822dfa255952a08fa306ff72395966f07cc9830d51bfa1fef3f0b1675b3` |
| A03 | [packages/shared/src/domain/consumer-retention/evaluate.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/evaluate.ts>) | `ba77da78b21f5ebb1c9d1bd1f1292f72401eb9feffd3424dfc52c22262f97112` |
| A04 | [packages/shared/src/domain/consumer-retention/index.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/index.ts>) | `d7bca68c68d56b77b0c3aa154b2fe524c5cc5ecffea75ef8a75912886a6de121` |
| A05 | [scripts/consumer-retention-policy-smoke.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/consumer-retention-policy-smoke.mjs>) | `13ff0d696d61b79eb1dd73a50ef62c2812d4680cf475f47922141e66d4b371be` |
| A06 | [scripts/consumer-retention-policy-mutations.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/consumer-retention-policy-mutations.mjs>) | `e4f9c226160249785bf157c489a7204f58246c5ac5369891fc06f27fba9715ea` |
| S01 | [supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql>) | `127a64fbd11a34f1629e2510345ba0c2feb1058011c75ffc687ae633336bcef2` |
| S02 | [supabase/migrations/20260712130400_consumer_schema_phase_1_3_meal_records.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130400_consumer_schema_phase_1_3_meal_records.sql>) | `456f732f88b670c67d853323665c8d3b6c4b8c0825ce0b616d82fe5f8ee1e88e` |
| S03 | [supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql>) | `9f0c923d9a47369dd3722bd3513c7b2c0c38ac5e63ad2501bcb7b77373830394` |
| S04 | [supabase/migrations/20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql>) | `90433d9bffbee67302bdf37b5afa94bd2cf5b2720fe0f645487b746d5a81c60e` |
| S05 | [supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql>) | `63bf696df277191723ef856004ae0a7ec8e8bf069b52e7e068f076e1c1b1884d` |
| S06 | [supabase/migrations/20260720010000_consumer_meal_record_create_idempotency.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260720010000_consumer_meal_record_create_idempotency.sql>) | `703e724909a96ce7f63a9654ea155cad11d3dbfe5aec29aa99a7296ab16ffb14` |
| S07 | [supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql>) | `84c689af239c530d9e98c1065041b1a4b332e63c09fcd0be0bc505eea5505b50` |
| S08 | [supabase/migrations/20260811030000_social_exposure_entitlement_authenticated_read.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260811030000_social_exposure_entitlement_authenticated_read.sql>) | `4b9667de8cc2f6933737c8677e131f2b5139ef8f005ed20da2ee06e1e17c9bad` |
| S09 | [supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql>) | `79fb7610b5e1d5428e2bd986eb6e8388c9d521e1dae9780436e21a283f61a313` |
| S10 | [supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql>) | `242ed04e5d948727c8f26ef187e1cb0ea1803ab4eb7db5a4c709f80f19f7ce8d` |
| S11 | [supabase/functions/_shared/social-exposure/resolveEntitlement.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/functions/_shared/social-exposure/resolveEntitlement.ts>) | `09d5d8bc69b72782d59f935fe0aeb285b80aa101a1a7038d333c5fee885e6bc9` |
| S12 | [supabase/functions/_shared/social-exposure/policy.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/functions/_shared/social-exposure/policy.ts>) | `cef032e942ed0f66ccd6a2ba9a817133d19a107b316fba6047bd74bec12cd0f3` |
| S13 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts>) | `61a73dc23f596ddd7d464fab3b0955e447dddfda458c41bfe382b6cafa0842f6` |
| S14 | [apps/mobile/features/consumer-meals/writeValidation.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/writeValidation.ts>) | `165745ff59aa728e37b45335cbc0f0ac4eca2c281bf62337d28edeac8211a51e` |
| S15 | [apps/mobile/features/consumer-meals/supabaseMealContracts.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/supabaseMealContracts.ts>) | `360ff9c4c9487d7ccb1c68a331ecc1059ec0140afb53e3d64cd741ee3d730bdd` |
| S16 | [apps/mobile/features/consumer-meals/supabaseMealMappers.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/supabaseMealMappers.ts>) | `29bdcef0c68e86acd4a3869e20369499aa8fb5ac5d91fa0b62ac3f6f820b684a` |
| S17 | [supabase/migrations/20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql>) | `f641a23fd2659e396acebf4ac73cb1441ec6b4acd5d058b8d0f7bf872c933860` |
| S18 | [supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql>) | `b628503a5deafb547135b7fe7194065b61f21442f86a4eed6b5a3112e2a2a1aa` |
| S19 | [apps/mobile/features/consumer-meals/readRange.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/readRange.ts>) | `288e4faed15a8022f23d7d903ef9937d968c678eb23a4cbca47742bf38148f9a` |
| S20 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts>) | `58626c7d8689303be8a28ac6dd033e223afc8ac0cb2c6b189fe501ebafc3f8ef` |

### 10.1 歷史／最終報告（reused，source/hash核對fresh）

- original_blocked：[報告](</mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-a-independent-acceptance-20261003/ACCEPTANCE_REPORT.md>)；raw SHA-256 `aa22cfb1371f0ae9f1fe1bb8eb04330004b58d3ec7ff45c0a422051ffb467b3b`。
- corrective：[報告](</mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-a-timezone-corrective-20261003/CORRECTIVE_REPORT.md>)；raw SHA-256 `ce0e7791f472cbbe3e809e963b704b0d94316dbafe17d71b4002261f11dd4c4d`。
- accepted_reacceptance：[報告](</mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-a-independent-reacceptance-20261003/REACCEPTANCE_REPORT.md>)；raw SHA-256 `5a46c50a1511c3137746c76f6333ede208a429f577b47c55c454f42c3f02457d`。

舊BLOCKED報告不是PASS；corrective READY不是獨立PASS；最終REACCEPTANCE_REPORT才是accepted exactcandidate依據。沒有把本輪planning當作重新執行59／644／27證據。R0-A的六個current source/test bindings對應C04 §12.5；其§11舊bindings是原f28867a，不要求覆寫歷史。

### 10.2 公開設計reference

本輪使用Supabase／Postgres設計skills，僅查公開官方文件，沒有projectAPI／遠端DB連線。已讀Supabase changelog（`.md`回應不支援，改讀HTML）；新publictable的API預設不能替代private-schema/GRANT/RLS設計。R0-B需local驗證實際版本／ACL，不從currentPostgreSQL官方文件標題推定本project就是該版本。[Supabase changelog](https://supabase.com/changelog)

引用RLS、SECURITY DEFINER／search_path、鎖與時間型別的官方資料只支持一般設計規則，不證明本project已實現這些新表。公開文檔版本資訊與laterlocalDBtargetidentity在施工時重核；不變更dependencies／遠端settings來配合提案。

## 11. 本輪focused checks與停止

Fresh focused checks只針對05與source bindings：本機reference存在及結論支持、classification／proposal邊界、30項本轮sourcebindings、R0-A current六項與historical54項來源binding、三份reportraw identities、UTF-8／whitespace／secret-pattern，以及唯一untrackedpath。

對照起點3,341trackedfiles的exactrawbytes、index(mode/blob/stage)與Git tracked modes，142migrations／原04／法律／registry／dependencies／所有產品及DemoPool均不得改變。Gitindex proof核對entries，不錯誤要求Gitindexrawhash永久相同。最終fresh核對結果／05rawSHA-256存放外部final proof與最終報告，避免在本文寫自己的hash造成循環binding。

持久本機evidence目錄：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-persistence-scope-review-20261003/`

其中start-state、start-index／trackedmanifest、source-readcopies、source-bindings、boundedsearch原stdout/stderr／commands、reused-reportbindings與focused／preservation proof支持本文件。主要結論、model／mapping／scope／cases／gates全部在本文件，不依賴/tmp存活。

**沒有 stage／commit／amend／fetch／push／deploy；沒有 product／schema／migration／RPC／backfill施工或遠端DB/Auth/Storage；沒有重跑已接受R0-A／PC-2驗證、478suites、webbuild或DBapply；沒有legalactivation。**

Return：**READY_FOR_R0_B_IMPLEMENTATION_SCOPE_REVIEW**。停止於Planner scope review，尚需§9的實際gates及新的exact施工授權。R0-A／PC-2 local acceptance維持通過；法律DRAFT / NOT ACTIVE，activation pending。

## 12. Final authority contract and inactive scope（2026-10-03；PROPOSED，待批准）

本節由本輪實際source review產生。不是Owner已批准具體implementation，也不是fresh runtime／DB PASS。起點HEAD、origin、4/0與原05 SHA均符合；R0-A exactcandidate bytes未變。新增source findings明確區分actual resolver／fixture writer／未就緒的可信producer。

### 12.1 四項缺口的final處理與可施工性結論

| 缺口 | source結論 | final首包契約 | 後續liveintegration gate |
|---|---|---|---|
| T0可信事件 | S02／S10有occurrence、serverdefaultcreated、updated；沒有immutable retention anchor。 | 只預備anchor／acquisition的儲存形狀及一致性約束；不選任何現有field做authority、不安裝capture、不寫真T0。 | T0-F：核定原始紀錄事件mapping及毫秒precision；真newINSERT＋grant同交易，replay/edit不換anchor。 |
| canonicalentitlementproducer | S11／F01只讀目前Socialclass；F04／F05等是fixtureDML，不是付款／trial／升級producer。 | **enabled producer set = empty**；沒有writer role會員、HTTP endpoint、public RPC或任意caller事件admission。 | ENT-F：verifiedproducer身份／scope、eventnamespace/version/time、receipt、coverage／排序／CAS接線。 |
| status／validity／完整性 | F02列active／expired／cancelled／grace_period；S11目前Social讀取邏輯；沒有歷史complete ledger。 | foundation provenance固定unknown、coverage固定unknown、authority_effective固定false；儲存fixture形狀不構成resolved fact。 | STATUS-F：source completeness与tier有效範圍、grace／trial／refund等語意核定後才能resolvedcurrent/history。 |
| rights／protection來源 | S18只有request結構；F03是restaurant／menu bookmarks；A01有rights／protection型別，但未證明完整producer。 | 不從emptyrequest／無bookmark推clear或none；不生成rights／protectionfacts、不准grant生效或purge。 | RIGHTS-F：scope完整／owner/resource/revision的rights/protection來源，與PC-2core一致；unknown停留pending。 |

**建議首包R0-B-IF可獨立實作／驗收，但仍須Planner批准§7.1精確scope**：structural storage、封閉ACL、inactive不生效與原authority相容可在本機disposableDB直接驗證，不需要用未批准T0、假的付款producer或legalactivation替它創造前置。這不等於四項live缺口已實現；live部分保持「來源未就緒→unknown／拒絕」契約。

### 12.2 T0的精確可信事件提案與來源映射（T0-F，未批准）

| 情境／actual source | 精確建議mapping與限制 |
|---|---|
| 正常新建：S10 lines498–540、685–705 | `occurred_at`＝用餐時間（caller input）；`created_at`＝本RPC的DB default建立timestamp；`updated_at`＝內容更新timestamp。建議將T0定為**首個canonical server transaction成功接受此new meal resource的原始capture事件**，在首次INSERT邊界記一次server UTC instant並寫私有`original_recorded_at`及acquisition.at。只有whole transactioncommit才有效；不是「收到HTTP」即取得grant。 |
| acquisition與權益snapshot | proposedcapture sourceIdentity=`canonical_meal_insert`＋resource/eventid，sourceRevision綁定當次transaction receipt／authority revision；原始servercaptureprecision另存證，一次量化到UTC毫秒，T0與acquisition.at同瞬。不得先用早一個clock讀值取tier再用另一時間造acquisition，必須證明producer事件與capture的commit排序。 |
| 有key重試：S10 lines821–983 | v2(actor,client_request_id) fingerprint完全相同→返回已存record/T0/acquisition；同key異payload→既有IDEMPOTENCY_KEY_CONFLICT，不建立第二grant。conversion/finalization各自既有receipt同理。第一次rollback沒有取得T0/grant；retry成功才有一次capture。 |
| 無key重複提交 | legacycreate沒有跨request去重契約。兩次成功可能是兩個resource，各有建立事件；不靠相似meal/time猜同一餐，也不能宣稱foundation修好了此路徑的exactly-once。新增dedupe須另scope。 |
| planned conversion | S10 lines291–342：planned_for、p_confirmation_timestamp及converted_at用途不同；conversion只有實際newrecord首次INSERT可能capture，replayedconversion不再起算。不以callerconfirmation作trustedanchor。 |
| AI／manual finalization | S10 lines1582–1603、2602–2623共用canonicallegacyinsert；analysis、confirmation、correction、fingerprint後續更新不是新的resourceacquisition，不重設T0。 |
| 修改用餐時間／一般編輯 | 保留occurred_at／mealDate的既有業務語意，原capture不可更改，期限仍從T0計算；不以updated_at reset，也不把newmeal_date重算anchor。 |
| 補登 | caller可記過去用餐時間，但「補登第一次server接受」與「歷史用餐瞬間」不同。如果Owner選server原始紀錄事件，仍取該resource首次接受；如果Owner意指用餐／原始外部紀錄事件，不能擅自改成server建立，需要可信producer證明而非caller timestamp。 |
| 匯入 | 本輪boundedsource未證明retention import authority。verified original-record event＋immutableidentity／signature/sourcechain才可能成T0；duplicate import重播同receipt，缺證quarantine。不直接把sourcefile中的date/created_at或目前Paid作歷史grant。 |
| 歷史record | missingcapture／actor/resource/source/eventprecision或矛盾→unknown；不默認occurred_at/created_at/updated_at，不以nowPaid补當時權益，無自动backfill／縮期限／purge。 |

**T0-F真正待Owner批准的單一語意**：原始紀錄時間是「首次canonicalserver接受此紀錄」還是「已驗證的原始外部／用餐記錄事件」？建議前者適用未來一般新建、後者只適用另批准verifiedimport；若Owner意指用餐瞬間，前者會改變expiry起點，必須明確批准。已定UTC／14／180天／降級不縮／編輯不reset不再重問。inactive首包只驗欄位等式，不因此選定這個語意。

### 12.3 Producer身份、授權、事件與receipt契約

| 實際存在的actor／來源 | 可證功能 | 不具備的authority |
|---|---|---|
| authenticatedconsumer＋S10canonicalRPC | 用auth.uid()及PC-2require_core建立meal；不是從body取得owner。 | 不能自指定Paid、永久、歷史acquisition、coveragecomplete、rights-clear或延長期限。 |
| S11／F01 Social resolver | owner-read四欄，目前輸出 `{class: free|premium}`，billing來源欄位被刻意排除。 | read結果不產生immutable權益事件／grant；不存在producerreceipt／historicalPaid證明。 |
| F04 `meal-buddy-demo-seed.mjs` lines348–355 | Developmentfixture，以管理SQL替syntheticviewer刪／寫fixture來源premiumrow。 | 非付款／trial／升級integration；fixture可重建，valid_from預設推前一天不是historyreceipt。未執行此脚本。 |
| F05 `social-candidate-sr2g-d-development-acceptance.mjs` lines204–210 | isolatedacceptancefixture插入premiumrow；其他sr2g-b及demo cleanup/report亦見本輪source search。 | 測試membership只服務該驗收；不能成R0-B realgrantproducer、sourceapproval或activation資料。 |
| futureapprovedcanonicalproducer | **尚未由本機source證明就緒**；不指定猜測的billing檔名、不創造integration存在。 | 本首包不配置credentials／service-rolebypass／新writer、trialpaymentAPI或productionbootstrap。 |

**Final inactive身份契約**：沒有可產生有效Consumerretention事件的runtimeactor。DBmigration/operator只能建立schema；synthetic資料只由disposableDB驗證operator產生，metadata強制unverified／held_inactive，不能被輸出為formalgrant。superuser可繞RLS是DB管理信任邊界，不把它寫成普通Client能力，也不聲稱阻止了惡意DB管理員。

**Future ENT-F admission契約（PROPOSED，不啟用）**：

1. approvedproducer以受限server身份認證，namespace／身份／版本與授權scope逐一registrybinding；只對其被授權的owner/domain產生事件，notClient tier／testfixture。沒有producerbinding就拒絕，不靠字串`verified`或hash認證。
2. event envelope至少含owner、source namespace、upstreameventid、schema/policyversion、canonicalsequence/sourceRevision、effectiveAt與receivedAt、tier/status/validity證據、eventpayload semanticdigest、produceridentity/version。detailcreate才含newresourcebinding；membershipupgrade可為owner事件，receipt逐resource分開。
3. event identity Unique(owner,source namespace,eventid)。相同id＋相同canonical語意digest是重播候選；相同id不同payload/tier/time/owner/version是conflict，不UPSERT改原內容。現在foundation只提供unique／immutable儲存約束，不承諾已有writer返回replayreceipt。
4. UTCeffectiveAt是权益有效瞬間，receivedAt只是接收時間；不可拿較晚receivedAt或現在Paid補歷史。未知／未來／offset或precision不合法／沒有來源timeproof→pending／拒絕。
5. event immutable content與逐resource receipt分表；receipt綁owner/event/resource/old-newrevision/proposedgrantdigest／outcome。未commit、sourcegap、core/rights/protectionunknown或materialunavailable不能`applied=true`。duplicate不advancecursor兩次。
6. owner行與source sequence串行、穩定resource鎖順序／revision CAS；producer、capture、upgrade所有writer遵守同一protocol。sequencegap或out-of-orderarrival須驗sourcecompleteness，不能只按receivedAt排序；同時點以canonicalsequence裁定。未知transition不要丟event或報fullyprocessed。
7. grant＋receipt＋completionwatermark同transaction；失敗atomicrollback，retry原event，不改T0／縮期限。historical U<E14可待驗後重播，但已collapsed/deleted不恢復，R3亦不能因pendingupgrade當作無權益直接purge。
8. 後續producerintegration须另列exactsourcepath／entrysignature／GRANT／RLS與必要T0／rights來源，再獨立acceptance。foundation不能用任意caller-suppliedentitlement或service_role直寫作替代。

### 12.4 Status／validity／completeness對照（SOURCE_FACT與PROPOSED分欄）

| 現有status或R0-Ainput | 可證語意／safeadapter契約 | Unknown／pending条件 |
|---|---|---|
| plan `free`／`premium` | F02／S12識別此兩code；retention `paid`映射premium僅為待核定PROPOSED，不新增`trial`code。 | unknowncode、未核producer、fixture／client來源→unresolved，不把讀到premium當歷史Paid。 |
| `active` | S11在premium且validitywindow內視為目前premium。future需有approvedsource完整snapshot，不能只看status。 | source/binding/validity不合法、overlap矛盾／未定sourcepriority→pending。 |
| `grace_period` | S11/S12目前仍承載premium；保留此source事實。retention是否採同有效權益需technical／必要Owner語意批准。 | 未核grace時間、missingend或只有目前row無historicalevent→pending，不做付費規則決策。 |
| `expired`／`cancelled` | S11不授目前premium；不撤既有E180或permanent。 | 不能據此把舊acquisition降成Free或縮deadline；歷史effectiveboundary未知仍unknown。 |
| validFrom／validUntil | S11現在上下界包含；A03 currentEntitlement亦允許now==validUntil；grant expiry則 `[T0,E)`，now==E到期，兩者不同。explicitnull上界需canonicalsource支持；A型別不允許undefined充null。 | 不默改成半開membershipinterval／永遠Paid；source當前row不能證明create時tier。validUntil<validFrom、futurefrom、invalidprecision皆拒絕。 |
| current `Tier=free|paid` | A01沒有unknowntier enum。合法currentFact须完整authority snapshot、來源有效範圍及current factAsOf==evaluationInstant。 | unresolved在adapter外層pending／nullfacts，不造tier=`unknown`或假Free占位，也不以now作validFrom編造歷史。 |
| 空entitlement rows | S11的Social-onlyempty结果為Free。futurecompleteFree需canonicalcoverage起点／截至evaluationInstant无gap、source健康、已知actorbaseline或明確Free事件。 | 空row本身不完整；readfailure／partialRLSview／未知producer不可轉Free14 acquisition。 |
| 多rows／事件順序 | future只由approvedcanonicalnamespace的revision／來源規則導出唯一當前snapshot；保留supportingeventidentities與scopecoverage。 | 未核sourcepriority、mutuallycontradictorygrant/status、gap／stale／重播異digest→pending，不擇有利Paid或短期限。 |
| Fact.provenance | A01只`resolved|unknown`；resolved要求認證producer＋owner/resource、sourceIdentity/revision、time與完整性。 | hash、nonnullmetadata、claimedproducer、來源row存在均不是proof；foundation强制unknown。 |
| material `present` | futureowner-matched且未deleted/collapsed的實體及版本；存在row可支持presence，不支持rights-clear。 | missingrow不一定是可信deleted；没有tombstone/來源snapshot→unknown；不得復活舊內容。 |
| material `collapsed|deleted|unknown` | collapsed/deleted須可信executor/tombstone/source版本；unknown保持unresolved。 | R3／R5 executor未完成，不從查不到或querylimit推collapsed/deleted。 |
| core `allow|deny|unknown` | S09 core_eligible／require_core是既有authority，保留cohort、registry／consent與rollout語意。coredeny限制新transition／顯示，不縮已得grant。 | sourcefailure／無同瞬snapshot→unknown；training flag或profileactive alone不是完整coreallow。 |
| rights `clear` | future需approvedrightsproducer／dispositionrevision，完整涵盖此actor/resource/用途的request／restriction狀態，在evaluationInstant有效；不是只查activeprofile。 | **目前未證明producer**；無requestrow、completed_at、空查詢／讀錯均不自動clear。 |
| rights `deletion_required` | 已驗request／accountstatus／restriction可支持限制性結果；F02/F08有deletion_requested/anonymizing/anonymized/deleted，S18有pendingrequest，先保守阻止transition／visibility並驗owner/版本。 | request_status是未受enum約束TEXT，不能把不認識status視已解決；`disabled`只支持coredeny，不足以肯定所有刪除义务；未驗來源返回unknown。 |
| protection `saved_meal` | futureR2明確private餐點snapshot／引用／revision；不把F03restaurant或menu bookmark當餐點保存豁免。 | 現在未證明R2producer；未核snapshot／quota／photo引用→unknown，不批permanentdiary/照片。 |
| protection `none`／`unknown` | none需approvedproducer證明該resource在完整scope中確無保護、含並發版本；unknown如實保留。 | **沒有protectionrecord不能推none，更不能推允許刪除**；新resource也需明確並發／引用契約，不能靠剛建row跳過來源。 |

monthlybinding／永久grant／reportzone仍按A01/A03、原§3.3，R1實體未存在時不能造ReportPeriod／reportId。所有purgeAllowed=false；due、hidden、permanent、unknown、rightsrestriction都不啟scheduler／delete。

STATUS-F的live實作仍需核定premium mapping、grace／cancel/refund/trial有效時點與完整Freebaseline，不能把技術閱讀說成Owner批准。inactive首包不判currenttier、不解consent／rights、不宣稱能產生resolved R0-Ainputs，因此上述未決事項不阻礙其structural驗收。

### 12.5 Final首包資料模型與完全inactive邊界（PROPOSED）

與原§3.1不同：使用**新的獨立私有 `retention_internal` schema**，不修改`consumer_internal`、public／Auth／Storage原objects。四表替代原三表＋混合receipt欄位，目的是讓oneevent有多resource receipts並防止event接收誤當全部grant已套用；同一foundation migration即可，不增第二份migration。

| Exact proposed table | 最小欄位與structural constraints |
|---|---|
| `retention_internal.owner_authority_state` | owner_user_id UUID PK、revision非負、mode固定`inactive`、coverage固定`unknown`、producer_binding固定NULL。初始無rows／無ownerbootstrap。UUID僅待驗identityclaim，不是Auth認證或有效member。 |
| `retention_internal.authority_events` | event_id UUID PK、owner/source_namespace/upstream_event_id、event_schema_version/policy_version、claimedproducer/revision／sequence（未知可空）、kind=`detail_create|paid_upgrade|entitlement_observation`、resource_id（create必填）、effective_at/received_at、tier／validity、semanticdigest、provenance固定`unknown`。unique owner/namespace/upstreamid；ownerFK至ownerstate；event identity/content immutable UPDATEguard；沒有producer已驗證欄位可被Client設true。 |
| `retention_internal.operation_receipts` | receipt_id、owner/event_id/resource_id、operationkind／idempotencykey、before/afterrevision、proposal digest、outcome=`held_inactive|rejected`、applied固定false。owner＋event的compositeFK防crossowner；unique owner/event/resource/operation，revision非負且held不宣稱advance有效grant；receiptcontent immutable。不是successful authority receipt。 |
| `retention_internal.detail_grants` | owner/resource PK、original_recorded_at、acquisition eventId/at/tier、retained_until、extension eventId/at（成對可空）、policyversion、revision、provenance固定`unknown`、authority_effective固定false。compositeFK到同owner/resource的createevent，必要的eventtype／at/tier supportingUNIQUE与FK；extension FK同owner的paid_upgrade事件。只允許已接受R0-A的validshape：acquisition.at=T0、Free14／Paid180、Freeextension U>=T0且U<E14至原T0+180、Paid無Freeextension。 |

所有precision／deadline使用explicitUTC毫秒、嚴格有效時間与acceptedpolicyversion；不要用sessioncalendar14days代替elapsed336hours。DB CHECK不能跨row偽查來源：事件kind／owner／at／tier／resource綁定使用上述compositeFK／UNIQUE，必要immutableguard只比較新表OLD/NEW，不讀public或newcallerbody。

new-table UPDATEguards精確保持owner/resource、T0/acquisition、policy／eventcontent／receiptimmutable，retainedUntil不減、grantrevision不倒退；合法Free延長shape仍需相應event，但其provenance unknown且無writer，**只作disposableteststructural候選，不變成真grant**。event／receipt immutability不承諾lawfuldeletion永遠禁止；runtime无DELETE/UPDATE權限，未增加任何deleteexecutor或跨表清理副作用。

**不新增Auth／meal_records FK、product supportingUNIQUE/index、producttrigger或RPC**：首包只驗privateowner/resource/event的內部一致性，不聲稱驗證實際Authactor或mealowner。liveintegration需要owner認證與實際resource compositeFK／transactionbinding時，必須另migration／scope批准；在此之前mode／provenance/effectiveness constants及無API／無writer共同阻止私有row成產品授權。此處不能只靠口頭`inactive`flag後開genericwriter。

scope內可建立兩個`SECURITY INVOKER`、emptysearch_path且fullyqualified的**新表constraint trigger functions**（event/receiptimmutable guard可共用一個，detailgrantimmutable/non-shrink一個）；不建立SECURITY DEFINER grantwriter／public RPC／HTTPentry。trigger只掛新私有表，不讀clock、network、billing、consent／rights或觸碰任何existingproducttable。

### 12.6 RLS／GRANT／REVOKE與operator邊界（PROPOSED）

- sealed owner role `consumer_retention_foundation_owner`：NOLOGIN、NOINHERIT、NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOBYPASSRLS。它只是newobjects storage owner，不是producer；沒有永久membership或`SET ROLE` path給runtime／existingroles。migration若為DDL臨時membership，必須同transaction revoke並查pg_auth_members證明無殘留。
- schema四表／constraints／兩個constrainttriggerfunctions由該role擁有；ENABLE＋FORCE RLS，**zero permissive runtime policies**。owner因FORCE RLS也不能常態讀／寫資料。不要因schema名稱私有就假定不暴露／安全。
- 明確REVOKE schemaUSAGE/CREATE、所有tableprivileges、functionEXECUTE及defaultPUBLICfunctionEXECUTE／defaulttableprivileges，對PUBLIC、anon、authenticated、authenticator、service_role與其他非owner角色不授新privileges。包含本機現有social/admin/restaurantauthorities；通過pg_namespace/pg_class/pg_proc ACL與rolesmembership完整matrix查證，不能只看這五個角色名稱。
- 不GRANT任何Client SELECT/DML，不建立「owner-read」policy或genericstatus/metadata更新API。沒有被啟用的producerprincipal、granttransitionfunction、seeduser、Paidrow、activebundle／registrypayload或capturehook。
- trustedDBsuperuser/migrationoperator本來可bypassRLS；不伪称RLS擋住它。operator只能在**可拋棄本機testDB**為驗收存syntheticUUID/events/candidategrants；productionfoundationmigration body必須零INSERT/UPDATE/DELETE、零fixtures。沒有正式seed或runtimebootstrap。
- runtimeCAS、producerenqueue／replay／grantapply、ownerlocks實作不在首包：storageunique及單DBtransaction能驗，不能將testoperatortransaction稱作已完成serverproducerprotocol。後續activation不可只是updateinactiveflag，需另forwardmigration建立verifiedsources/roles/policies／受控writer與既有PC-2/rights/ownershipgate後再批准。

這是本次inactive contract：無runtimewriter、無resolvedprovenance、無effectivegrant、無successfulgrantreceipt、無consumerfacts輸出。既有service_role的BYPASSRLS亦不能代替USAGE／tableGRANT；不得借它開broadwriteshortcut。schemas、GRANT與RLS需實際DB驗證；本輪只是規劃，沒有執行SQL。

### 12.7 精確成功、負向與mutation gates（全部PLANNED / NOT EXECUTED）

兩個scripts僅在另授權施工後新增／執行，保存逐項raw stdout/stderr、SQL／command、exit、SQLSTATE、CHECK identity、actualsource/DDL/bootstrap/tooling hashes及before-afterDBobservations。沿用F06/F07的existingPostgreSQL17／pg localcluster/bootstrap原理，**不執行或匯入會自動跑整個原suite的top-level腳本**，不改原bootstrap／harness；缺existingbinary/extensions/pg套件時BLOCKED，不安裝dependencies、不skip-as-pass。

建議script介面：`node scripts/consumer-retention-persistence-smoke.mjs --pg-bin <existing-local-bin> --out <persistent-external-dir>`；mutations同flags。此為未建立scripts的PROPOSED CLI，不是本輪命令或PASS。DB只連腳本自己建立的disposableUnixsocket／localhostport，拒絕外部DSN／remotehost；fixturedata只存該DB與不敏感rawreport，不留formalgrant／activation資料於repository。

| Success gate | Actual acceptance與必要觀測 |
|---|---|
| IF01 Fresh apply | 空disposablecluster＋hash-boundF07bootstrap，原142依序apply再candidate一次共143；不偷偷略migration、修改原seed法律或補已存在table來讓apply成功。bootstrap不等於remoteSupabase完整環境PASS。 |
| IF02 Upgrade apply | 獨立cluster先142，快照所有existingcatalog/data，加入candidate一次；與IF01新objects modes／constraints／roles／ACL一致。existing legal/registry、rolloutstate、cohort、subscription rows內容完全不變。 |
| IF03 No runtime rows | fresh／upgrade正常candidateapply後四張newtable rows=0；mode inactive、coverageunknown、无public functions／producttriggers／scheduledjobs／registryactivation。 |
| IF04 Ownership／ACL／RLS | 檢查exact四table與两privateconstraintfunctions／ownerrole flags，ENABLE/FORCE、zeroallowpolicies、no memberships及全部runtime角色schema/table/function權限；real authenticated/anon/service_role操作拒絕，不能只匹配DDL字串。 |
| IF05 Valid synthetic graphs | 在disposableoperator建立ownera/b claim、Free14／Paid180／Freeupgradevalidshape、heldreceipt，讀回exactUTC毫秒／eventreferences；所有provenanceunknown／effectivenessfalse／appliedfalse。這是test候選，未認證member或建立realgrant。 |
| IF06 Source bindings | acquisition／extension／receipt精確匹配owner/event/kind/resource/at/tier/version；hashrow不是verifiedproof，資料保存不提供任何consumerauthorityoutput。 |
| IF07 Anchor／term invariants | E14/E180與A02常數一致；edit/candidateUPDATE不得換acquisition/T0或縮E180；test合法structuralFreeupgrade不重算原T0。E是儲存shape，不執行到期／顯示／刪除。 |
| IF08 Identity uniqueness | duplicateowner/namespace/eventid與receiptkey由actualuniqueness拒絕；讀回原row不變。同semantic內容也只檢查storageunique，不宣稱已存在writer的replayAPI。 |
| IF09 Atomic rollback | transaction插event／candidategrant／heldreceipt中任一constraintfailure，全transactionrollback，無orphan／falseappliedreceipt。各crashpoint保存完整觀測。 |
| IF10 Local concurrency | 兩operatortransaction爭同event/receipt/grantkey，只有合法唯一graph／無lostupdate；revisionCAS測試是disposableSQL，不冒稱realproducer鎖規則已實作。 |
| IF11 Baseline authority compatibility | 前後snapshot所有scope外pg_get_functiondef/owner/ACL/RLS/policies/triggers/indexes/constraints/tablemodes及rows；consumer_internal/public/Auth/Storage originals完全一致。沿原inactivepreparationcohort合成fixture做create/v2/replay與deniedcore樣本，metadata仍0，不啟正式legal。 |
| IF12 Unknown boundary | 即使syntheticcandidate有Paid/e180形狀，unknownprovenance與inactive使它不能當resolvedFact。可用獨立小probe載A01/A03確認unknown拒絕／purgefalse，**不重跑已接受smoke／mutation套件**。沒有productread/export/writer可取代此邊界。 |
| IF13 Reversibility／residue | proposedfailed-DDLtransaction不留partialrole/schema/membership；tests結束關閉disposableclusters，fixture只在測試證據／DB內，repository无ignoredresidue。保存新DDLapply失败的raw而不是自行更改既有142。 |
| IF14 Frozen proof | 原3341trackedpaths rawbytes／Gitmode/blob/indexentries保持；新增inventory恰1migration＋2scripts及05。原142migration、R0-A6source/test＋04、PC-2guard、legal／registry、dependency／DemoPool固定hash不變；independentacceptance另輪。 |

| Negative gate | Exact violation及預期拒絕／不變觀測 |
|---|---|
| N01 | anon/authenticated/authenticator/service_role與其他runtimeprincipal對schema/newtable SELECT/INSERT/UPDATE/DELETE/TRUNCATE或privatefuncEXECUTE→permissiondenied或RLSdeny，fixture原rows不變。 |
| N02 | SETROLEstorageowner或新增membership／CREATEschema/table/function→原runtime無permission；RLSprobe若臨時localtestmembership，force仍deny；不得在candidateDDL開此membership。 |
| N03 | caller／testoperator把mode改active、coverage改resolved、producerbinding非NULL、provenance改resolved、effectiveness/applied=true→CHECKreject，不留下可用grant。 |
| N04 | grant／receipt引另一owner的event、wrongresource createevent、wrongkind、acquisitiontime/tier與event矛盾→FK/CHECKreject；不由目前Paid修正成合法。 |
| N05 | blanknamespace/eventid/schema/policy、unknownpolicy、badhexsemanticdigest、invalidtier/statusshape→CHECK/NOTNULL拒絕。recordsource字串合法亦不認證producer。 |
| N06 | DB型別／constraint拒絕非法instant、契約year外、未對齊毫秒的typed value或T0/acquisition不同瞬；使用不會先自動round的timestamptz欄位再CHECKprecision。PostgreSQL接受no-offset或自動normalize的字串時，不聲稱DB證明其原始offset；rawstring驗證屬後續produceradmission，本包接受的test候選仍provenanceunknown／inactive，不能變authoritativeT0。 |
| N07 | Free deadline錯一毫秒、Paid14、expiry從upgrade/updated_at重算、calendarDST偏移→CHECKreject。 |
| N08 | Free U=E14或after、U<T0、extension缺pairedtime/id、非Paid／otherowner upgrade或Paidacquisition附Freeextension→CHECK/FKreject。 |
| N09 | 將合法E180改回E14且同時清extension（其他shape仍coherent）→non-shrinkguard拒絕；retentionterm不能因downgrade縮。 |
| N10 | 另建同resource的coherent createevent後將grant整組T0/acquisition/event/deadline切到新event→immutableanchorguard拒絕，防重設而非只靠單欄FK巧合。 |
| N11 | UPDATEeventnamespace/id/time/tier/payloaddigest或receiptowner/outcome/idempotencybinding→immutableguard拒絕；重复id新digest不能overwrite。 |
| N12 | stale／倒退revision、receipt嘗試宣稱有效advance／applied成功→CHECK/guard拒絕；storage不存在eventgapresolution能力。 |
| N13 | 任何failedrow/transaction留下partialgrant/receipt、或者duplicatekeyaftererror以新event回寫→驗atomicstate為原样；不只看exceptionexit。 |
| N14 | fixture插入existingpublicsubscription／legalbundle、metadata轉formalgrant，或script接受remoteDSN→scope gateFAIL；candidate整體apply不允許任何real會員／activationseed。 |
| N15 | apply/setup/extension/roleconnection失敗→exit2或明確BLOCKED，保存runtimeerror；不計mutationdetectedPASS。 |
| N16 | existingfunction/ACL/trigger/policy/tableconstraint被改、migration順序跳過／hashchange、額外path／testresidue→frozen/compatibility gateFAIL；不改既有harness繞過。 |

| Mutation identity | Disposable mutation與必須由正常PASS變FAIL的行為CHECK |
|---|---|
| M01_RUNTIME_ACL | 單一newtable向authenticatedgrant讀寫／schemaUSAGE→IF04/N01發現runtime可存取。只在mutantcopy，正常foundation無授權。 |
| M02_RLS_DISABLE | 移除一table的RLS。localtestprobe臨時最小SELECT privilege後，normal0rows、mutant讀到syntheticrow→RLS_ROWS_HIDDENFAIL。probeprivilege只在disposableDB，不加回candidateSQL。 |
| M03_FORCE_RLS_REMOVE | 移除FORCE；disposabletest SETROLE newstorageowner，normal仍deny、mutantownerbypass讀row→OWNER_FORCE_DENYFAIL。 |
| M04_MEMBERSHIP_LEAK | 保留newownerrole的runtime／migrationmembership→NO_ROLE_MEMBERSHIPFAIL，actualSETROLE/ACLmatrix核實；notregexonly。 |
| M05_INACTIVE_CHECK_REMOVE | 去掉mode或effectiveness固定constraint，再由disposableoperatorsetactive/effective→INACTIVE_CANNOT_ACTIVATEFAIL。 |
| M06_PROVENANCE_CHECK_REMOVE | 去掉provenance固定unknownconstraint，再setresolved→NO_UNVERIFIED_TO_RESOLVEDFAIL。 |
| M07_OWNER_FK_REMOVE | 去掉receipt或grant owner/event compositebinding→wrongowner合法shape被收下→CROSS_OWNER_REJECTFAIL。 |
| M08_DEADLINE_CHECK_REMOVE | 去掉確切deadlineconstraint→Free/paid錯一毫秒被寫入→DEADLINE_EXACTFAIL；源graph保持正常，避免FKsetup先失敗。 |
| M09_NONSHRINK_GUARD_REMOVE | 去掉N09的guard而保留其他constraints，縮deadline且清extension仍coherent→TERM_NEVER_SHRINKSFAIL。 |
| M10_ANCHOR_GUARD_REMOVE | 去掉N10的anchorimmutableguard，用第二合法createevent整組重設→T0_NEVER_REBINDSFAIL。 |
| M11_EVENT_IMMUTABLE_REMOVE | 去掉event/receipt immutableguard，改未被FK引用的同owner事件語意digest或receiptsemantic欄位→EVENT_CONTENT_IMMUTABLEFAIL。 |
| M12_UNIQUE_REMOVE | 只移除event的UNIQUE(owner,source_namespace,upstream_event_id)，保留event_idPK與compositeFK所需UNIQUE；插入兩個不同event_id但相同upstreamidentity的coherent events→DUPLICATE_STORAGE_KEY_REJECTFAIL。normal是23505／原row不變，mutant實際容許duplicate；不能因FK/applysetup先失敗計PASS。 |

每mutation须copyexact143migrationsequence、hash-boundbootstrap、新scripts／normalgraph，mutation前正常controls先通過，保存target/path/before-afterrawhash／patch／sourceidentity。被mutant拿掉constraint也可能被另一constraint拒絕，這種測試沒有測到預定破壞，必須找出原因，不把仍exitnonzero算detected。new individualoutputs在evaluator前保存，避免summary失敗丟raw。

**Fresh apply與scope邊界**：這一輪完全不跑DB、typecheck、R0-A／PC-2套件、478suite或產品build。未來實作首包必跑上述fresh/upgrade DBgates；原authority功能以before-afteractualcatalog與少量canonicalRPCcompatcases證明，不能宣稱不重跑整套等於跳過必要checks。若需改既有guard／record才能接受新143inventory，停提exactscope，不自行擴path。

### 12.8 四項live契約批准與後續package依賴

首包最終scope由Planner批准；T0-F／ENT-F／STATUS-F／RIGHTS-F仍是**liveintegration前**的gates，不需為inactivefoundation先假造答案。首次capture、paidupgrade、Freebaselinecompleteness、rights-clear與protectionnone在未批准時全部不提供resolvedfacts。

真正Owner語意：T0-F的server原始紀錄與verified原始事件選擇；若grace/cancel/refund/trial的有效權益會改變既定產品規則，其時間／資格要另Owner批准。Technicalgates為canonicalproducer可證sourcepath、身份／sequence/timeproof、完整Free與rights/protectionregistry。14／180／六個月份／永久方向／降級不縮及UTC已定，沒有重新詢問。

後續live方案最少需newforwardmigration驗verifiedsource、actualAuth/mealownerbinding、core/rights/protection同瞬facts、atomiccapture/grantreceipt與allwriters鎖序；不能只放寬inactiveconstraint就啟用。B-Z／B-M、R0-C、R1–R5依原scope另批；月度永久grant不先造placeholderreport，photos／training／logs／cache／backupTTL及quota不在首包。OD-15、TD-10/AU19、P-7與歷史ordering/governanceconflicts保持OPEN／pending。

### 12.9 原§7.1完整歷史提案（verbatim，已被本輪首包替代）

以下原文是在先前producer未核定時的livecandidate，不是currentinventory或批准；保留其內容供追溯。除將此block移至本節，原review／sourceledger／原報告不倒填。

```markdown
### 7.1 建議首包 R0-B-D（5個候選paths，其中2個migration實際檔名待CLI）

| Candidate path | 用途／必要性 | 必要gates |
|---|---|---|
| `supabase/migrations/<CLI timestamp>_consumer_retention_authority_foundation.sql`（新增） | private三表、owner/resource composite FK與supporting UNIQUE、event/receipt/revision constraints、最小authority role/ACL/RLS、內部事件validation／grant transition helpers。不重建billing／不backfill。 | T0-1、AUTH-1、AUTH-2；owner isolation、provenance／precision、R0-A parity、Auth cascade與完整原migration相容。 |
| `supabase/migrations/<CLI timestamp>_consumer_retention_detail_grant_capture.sql`（新增） | 共同record INSERT capture hook，同transactionmetadata／grant；active/pending rollout gate，已知create/v2/conversion/finalization paths全覆蓋，無UPDATE reset。 | exact actual-writer／lock graph先證；RPC signatures／fingerprints／errors保持；capture failure atomic；沒有代替core gate或新Client API。若trigger不能滿足，停止重提scope。 |
| `scripts/consumer-retention-persistence-smoke.mjs`（新增） | local disposable DB讀取actual新DDL／functions，執行正向／並發／replay／rollback／typed grant映射與R0-A parity，保存rawoutputs与版本。 | 正常setup先通過；exact candidate bytes與DB role/tooling identities；不更新原R0-A smoke／PC-2scripts。 |
| `scripts/consumer-retention-persistence-mutations.mjs`（新增） | disposable DB／copies的negative controls：Client forge、wrong owner／tier／T0、event冲突／gap、deadline縮短、overwrite／aliasprecision錯、setup失敗區分。 | 實際mutation生效、normal→指定behavior failure、raw CHECK/runtime／exit／before-after hashes；不得修改既有mutation harness。 |
| `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md`（後續更新本文件） | implementation前凍結exact names/decisions，之後區分runtime證據與歷史scope；本輪只新增提案，不記未執行PASS。 | 對新metadata承諾與不生效邊界保持一致，記postcommit和独立acceptance在該輪授權範圍。 |

這次**未凍結SQL欄位／function簽名、migration timestamp或producer實作path**；它們需Planner technical scope及Owner T0語意後才能形成可施工exact inventory。若AUTH-1需要新的billing producer／HTTP endpoint或既有writer path改動，列出真實full path另授權，不能塞進上述migration／test以繞範圍。若既有frozen guards／record bindings不接受新增migration，提出相容性差異，不改guard來使candidate通過。

**B-D local完成標準**：全部正常、負向、concurrency／failure gates與独立acceptance通过；server captured T0及grant/event receipt確實在同DB交易持久化；current tier與historicalgrant分開；unknown不造權益／purge；既有RPC功能／core／所有scope外bytes保留。內部synthetic producer契約通過只能叫local persistence foundation；沒有真canonicalproducer接入證據，不能宣稱automatic upgrade已生效。

這個package不修改mobile、R0-A四模組／兩測試、dependencies、142既有migrations、legal drafts／registry，也不承諾current UI開始顯示14／180天。新forwardmigration可對既有meals增加supporting key／trigger，必須在另授權schema施工／本機DBgate中驗證；目前沒有任何schema改動。
```

### 12.10 新source bindings、focused checks與停止

新增直接相關source（F01–F09）与本輪39項reviewbindings，均綁定同一HEAD `3b1957e8dc459db6fdaa06bec873c1acc632ae9a`；原§10的30項ledger完整保留。這些是freshread/hashcheck，不是執行fixture或fresh產品PASS。

| ID | Exact source | Raw SHA-256 |
|---|---|---|
| F01 | [supabase/functions/_shared/social-exposure/types.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/functions/_shared/social-exposure/types.ts>) | `f7103b7325c965729e62ef42bf205479e66de031c7fbc71b479e9de6270dc69c` |
| F02 | [supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql>) | `0235e2e12a331e4fbd77bd68e056874a809e93345f9b42f33bc509ff7c516a1c` |
| F03 | [supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql>) | `baa8f3225eec4e1392e0707f8591bcc86c8e4e411c906a58f9a5821784b483d3` |
| F04 | [scripts/development/meal-buddy-demo-seed.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/development/meal-buddy-demo-seed.mjs>) | `e6d38446cc5b17b79c2d82fb32674ca96e122c294c17f88dca7e80610c4ab404` |
| F05 | [scripts/social-candidate-sr2g-d-development-acceptance.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/social-candidate-sr2g-d-development-acceptance.mjs>) | `a317846427c9307b8d55aeccd172ddea31494b5f83cc25c9c68c600aa4e6846e` |
| F06 | [scripts/pc2-consumer-onboarding-postgres.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/pc2-consumer-onboarding-postgres.mjs>) | `358180266cbd471d716bdbc6dff83e9cd7a2f09c229ff7bbcfa4ae6ebc8462cc` |
| F07 | [scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs>) | `9fd0639abd9d66d84ade2aab76315e0d4dc3771f72cda2652450a4871b991e23` |
| F08 | [supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql>) | `1738766e1cd2f5a81a51d44aee1899d17b761dfccb5f4be019d3ec1e08df2ac8` |
| F09 | [supabase/migrations/20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql>) | `333e00b5c0d357957516da8fdb29b6e62a9734354c0af17d99ad8bf7e75545b0` |

F04/F05只讀source分類，未存取其credentials／tmpmemberfixtures或執行遠端。F06/F07只讀localtooling/bootstrap，未執行任何DB／legalfixtureactivation。原independent／corrective／reacceptance報告继续沿用，未改其bytes或當時結論。

本輪唯一delta為05，原raw SHA-256 `d47a6629bc5da9331c5e80a4255c4240503e23c4d3b430eef405d9c9b143ceac`；最終hash由外部proof／finalreport提供，避免selfhash。source/readcopies、05before／exactdiff、原§7.1verbatimproof、Gitindex／trackedmanifest與focusedchecks持久保存於：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-final-authority-scope-20261003/`

Focusedchecks僅source支持與hashbindings、history保留、UTF-8／whitespace／secret-pattern、exactonepathdelta與其餘3341trackedrawbytes/Gitmodes/indexentries／142migrations不變；結果詳externalfinalproof。沒有stage／commit／fetch／push／deploy／remoteDB/Auth/Storage、SQL／script建立／apply、product/R0-C/R1–R5implementation或legalactivation。

Return：**READY_FOR_R0_B_FINAL_SCOPE_APPROVAL**。這是finalscope提案，不是已批准或已實作。R0-A／PC-2localacceptance維持通過；法律DRAFT / NOT ACTIVE，activationpending。停止於報告，等待Planner finalscope批准。

## 13. R0-B inactive foundation — approved implementation record（2026-10-03）

### 13.1 Owner T0 approval（OWNER_CONFIRMED；本輪新增，非歷史實作）

本輪 **R0-B — INACTIVE PERSISTENCE FOUNDATION IMPLEMENTATION** 明確批准：T0 是可信 server transaction **首次成功保存該筆紀錄**的時間；whole transaction commit 才形成有效 capture。今天補登昨天餐點，保存期限从今天首次成功保存起算，occurred_at 仍是用餐時間／報表歸屬。編輯、重試、重複提交、後續同步不重設 T0；Client 不得指定／改寫權威 anchor。UTC 連續24小時，Free14／Paid180天；未到期升級延至 **原 T0＋180天**，降級不縮已得期限。缺歷史 provenance 維持 unknown，不能從 created_at／updated_at／occurred_at 猜測或回填。

這取代 §9.1 T0-1、§12.2 T0-F 當時的語意 pending；原文保留是歷史，不能再把已回答問題列為待 Owner 決策。本輪仍 **沒有 server capture producer 或權益 producer 接線**，零正式 capture／grant。將來 verified import 也不能擅自換回 caller 的過去時間或推造歷史 grant，需另包 identity／dedupe／provenance 契約。

### 13.2 Exact implemented inventory and bindings

| Repository-relative path | Raw SHA-256 | 本輪用途 |
|---|---|---|
| `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql` | `2eb6cc69865de7b01b98556de710a72ef0d8e0347755dec9725fb2c5d1d512ea` | 一個 forward DDL transaction；新的 private schema／owner／四表／兩個新表約束 guards。 |
| `scripts/consumer-retention-persistence-smoke.mjs` | `dc38d6326d6af83f894e38f1026975d6dc3f54ca18b78e1c73c898889d88e497` | 本機實際 fresh／upgrade apply、14成功與16負向、權限／rollback／並發／compatibility。 |
| `scripts/consumer-retention-persistence-mutations.mjs` | `caa1028af48fdb2d8bf47dffc1ac0310bbe278725a31580d8ed2969808b377bc` | 12個實際 candidate SQL mutations；正常 setup、DB observation、CHECK evaluator process、完整 raw 證據。 |
| `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md` | 本文件自身 hash 僅記外部 final report；無 self-hash／循環 binding | 保留原 review／ledger／historical proposals，追加批准與實作證據。 |

本輪精確 inventory 為上述四個 **A** paths（05 是承接先前 untracked 的完整文件）。原142 migration bytes 不變；新增檔按核准名稱排在 `20260930174030_consumer_pc2_core_social_eligibility.sql` 之後，local inventory 共143。沒有新增第五個 path，沒有改 R0-A、dependencies、既有產品／harness、法律或 registry。

### 13.3 Actual storage and authority boundary（IMPLEMENTED_AND_EVIDENCED；local only）

| Actual object | 儲存形狀與實際限制 |
|---|---|
| `retention_internal.owner_authority_state` | UUID identity claim／非負 revision；mode=`inactive`、coverage=`unknown`、producer_binding=NULL。無 member bootstrap。 |
| `retention_internal.authority_events` | owner／namespace／upstream identity、schema=`retention-event-v1`、已接受 policy version、claimed producer/revision/sequence、kind/resource/timestamps/tier/validity、digest；provenance=`unknown`。自然鍵 UNIQUE 與 private owner FK；content UPDATE immutable。字串／digest 不認證 producer。 |
| `retention_internal.operation_receipts` | owner/event/resource/operation/idempotency/digest/revisions；outcome僅held_inactive或rejected，applied=false，after_revision=before_revision。Composite event-owner-kind-policy FK、create-resource FK（generated identity claim）、兩組 UNIQUE；content UPDATE immutable。不是成功 authority receipt。 |
| `retention_internal.detail_grants` | acquisition 綁相同 owner/resource/create-event/time/tier/policy；T0=acquisition_at。Free期限336 elapsed hours；Paid／合法 Free extension 為4320 elapsed hours。extension 綁同owner paid_upgrade，T0≤U<E14，不能用 upgrade time 重新起算。provenance=unknown，authority_effective=false。anchor/policy immutable，term不縮，changed revision必須前進。 |
| `retention_internal.reject_content_update()` | SECURITY INVOKER、empty search_path；只比較 event／receipt OLD/NEW，不讀產品、clock、network或其他 authority。 |
| `retention_internal.guard_detail_update()` | SECURITY INVOKER、empty search_path；只比較 private grant anchor／deadline／revision。 |

所有 timestamps 使用無 rounding typmod 的 timestamptz，加 finite、UTC year1–9999、毫秒對齊 CHECK。PostgreSQL 已把字串轉成 typed instant 後，不能證明原始 offset 或 producer 時間來源；raw input admission 仍是後續包。沒有用 session calendar days 或 updated_at 改期限。

四表與兩函式／schema 均由 `consumer_retention_foundation_owner` 擁有。NOLOGIN、NOINHERIT、NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOBYPASSRLS；**membership zero**。四表 ENABLE＋FORCE RLS、zero policies，owner read 亦0 rows。PUBLIC／anon／authenticated／authenticator／service_role／全部現有非 superuser application authority roles 無 schema USAGE/CREATE、table privileges 或 function EXECUTE；零 sequences。對新 objects 顯式 REVOKE，包括可能來自 DDL actor defaults 的 ACL；new owner default PUBLIC function EXECUTE 已撤銷。System superusers／內建管理權能不被誤稱一般 Client；未賦任何新權限。

**Actual DDL actor requirement**：PostgreSQL17 非 superuser CREATEROLE 自動生成由 bootstrap administrator 授出的 ADMIN membership；初次 ordinary REVOKE 後仍有一筆，IF04如實 FAIL。新 migration 在第一個 DDL 前核對 current_user 的 rolsuper；不是可信 DDL administrator 時以 `42501 / RETENTION_SEALED_OWNER_REQUIRES_DDL_ADMIN` 拒絕並 rollback，不能帶殘留 membership 成功。Local原142檔仍用原 bootstrap 的 non-superuser postgres apply；candidate由既有 disposable supabase_admin apply，同 transaction暫時 membership最終清空。沒有 SECURITY DEFINER／role escalation helper，沒有修改原 bootstrap、原角色 attributes 或既有 ACL。這是部署前須核對的 DDL execution 前提，**未證明或取得任何遠端 administrator 身份／部署能力**。[PostgreSQL17 role GRANT/REVOKE rules](https://www.postgresql.org/docs/17/sql-revoke.html)

沒有 Auth／meal_records FK、既有表 supporting index／trigger、public RPC、producer entry、payment/trial integration、monthly grant／report-zone registry、material/protection/rights producer、R0-C 查詢／顯示接線。UUID／shape validation不是實際 user/resource ownership 認證。Normal fresh／upgrade apply 后四表皆空；所有合成 graphs 僅在 disposable DB，測試後停止／刪除。

### 13.4 Actual pre-commit gates and raw evidence

Fresh local binary 是既有 Windows PostgreSQL17.6（含 pgcrypto／btree_gist）；Node **v24.15.0**、pg8.23.0。這與沿用 R0-A Node22.23.1環境不同，未捏造相同 tooling，也未重新執行其 accepted suites。工具 binary／bootstrap／candidate／loader raw hashes及 exact commands 存 tooling.json／SQL query ledger。現有 WSL17.6 缺 btree_gist 的 apply 記 SETUP_FAILED，沒有略過 predecessor、安裝 extension 或算 PASS。

兩個 scripts 實際 CLI：

```text
node scripts/consumer-retention-persistence-smoke.mjs --pg-bin <existing PostgreSQL17 binary directory> --out <external persistent evidence directory>
node scripts/consumer-retention-persistence-mutations.mjs --pg-bin <existing PostgreSQL17 binary directory> --out <external persistent evidence directory>
```

實際 Windows argv／完整 stdout/stderr與 exits在外部 `command.json`、`command.stdout`、`command.stderr`；每個 SQL query 的原文、arguments、完整 rows／SQLSTATE／runtime error先即時保存為sql-NNNNN.json。Script只建立自身的disposable localhost cluster，拒絕 DSN／host／未核 arguments，不連遠端。

| IF gate | Pre-commit local result／觀測 |
|---|---|
| IF01 | PASS：原142順序＋candidate，共143，實際 apply。 |
| IF02 | PASS：獨立 upgrade cluster＋representative legacy fixture；existing catalog/data/roles/membership/default ACL 完整相等，新表／columns／constraints／triggers／ownership／ACL 與fresh一致。 |
| IF03 | PASS：fresh／upgrade新四表0 rows，無 runtime seed／activation。 |
| IF04 | PASS：實際 sealed role flags／zero memberships、完整 app-role ACL matrix、ENABLE/FORCE RLS／zero policies；兩個 private INVOKER guards。 |
| IF05 | PASS：Free14、Paid180及Free extension三個合成候選；unknown／false／held沒有變正式grant。 |
| IF06 | PASS：normal unused resource graph可寫，owner/resource/event/kind/time/tier/policy bindings；N04逐項矛盾被拒。 |
| IF07 | PASS：DST session下仍originalT0＋15,552,000秒，合法 structural extension；N09／N10單独防縮期／重綁。 |
| IF08 | PASS：事件自然鍵、receipt key storage uniqueness，23505；不宣稱 writer replay API。 |
| IF09 | PASS：event/grant/receipt三個crashpoints，加invalid grant／invalid receipt的完整交易 rollback；前後graph exact equality。 |
| IF10 | PASS：兩operator transactions競 event／grant／receipt keys，各只有一筆，競爭者23505；revision CAS第一個1 row／第二個0。不是已實作 runtime producer。 |
| IF11 | PASS：scope外functions/ACL/policies/triggers/indices/constraints/table metadata/data與roles/default ACL frozen；legacy create、v2／same-key replay與incomplete core42501前後一致；metadata仍0，無法律fixture activation。 |
| IF12 | PASS：actual accepted module的小型獨立 unknown probe；合成Paid shape／unknown acquisition不能resolved，purgeAllowed=false，input不變／deterministic。非重跑R0-A套件。 |
| IF13 | PASS：intentional DDL division-by-zero22012 rollback無partial schema/role/membership；disposable cleanup有記錄。 |
| IF14 | PASS：原3341 tracked bytes／modes／index entries及原142／R0-A／法律／產品／Demo Pool不變；精確四paths。External raw manifest另確認全部bytes。 |

| Negative gate | Pre-commit result／拒絕與安全觀測 |
|---|---|
| N01 | PASS：全部現有 runtime principals實際DML/read/TRUNCATE／private EXECUTE denial；ACL matrix涵蓋四表／兩函式。 |
| N02 | PASS：非管理者 session identity實際SET ROLE／GRANT／CREATE schema/table/function denial；不能用管理者session換角權限冒充runtime。 |
| N03 | PASS：active/resolved/bound-producer/effective/applied嘗試23514；無正式grant。 |
| N04 | PASS：wrongowner/resource/kind/time/tier及receipt create-resource矛盾23503/23514。 |
| N05 | PASS：blank namespace/event/schema、unknown policy、bad digest/tier/validity23514。 |
| N06 | PASS：invalid typed time/date、infinity、year外、microsecond、T0/acquisition不一致被拒；不聲稱typed DB驗raw offset。 |
| N07 | PASS：錯1ms、Paid14、upgrade重算、calendar DST差异23514。 |
| N08 | PASS：U=E14／after／beforeT0、缺pair、wrong kind/owner、Paid original extension23503/23514。 |
| N09 | PASS：coherent E180→E14＋清extension仍由RETENTION_TERM_NEVER_SHRINKS拒絕。 |
| N10 | PASS：第二合法createevent整組重綁仍由RETENTION_ANCHOR_IMMUTABLE拒絕。 |
| N11 | PASS：未被grant FK引用的event digest、receipt digest UPDATE由RETENTION_CONTENT_IMMUTABLE拒絕。 |
| N12 | PASS：倒退/stale changed revision、receipt有效advance/applied宣稱被拒。 |
| N13 | PASS：五個failed transaction／constraint checkpoints，完整rows前後不變。 |
| N14 | PASS：candidate無seed／public authority DML，remoteDSN arguments被拒。 |
| N15 | PASS：實際子程序missing PG bin exit2/BLOCKED，raw保存，不算mutation detection。 |
| N16 | PASS：existing bytes/index／catalog與143排序來源未變，無額外paths。 |

| Mutation identity | Specific failed behavior CHECK | Actual evaluator exits normal / mutant |
|---|---|---|
| M01_RUNTIME_ACL | RUNTIME_DENY | 0 / 1；PASS detection |
| M02_RLS_DISABLE | RLS_ROWS_HIDDEN | 0 / 1；PASS detection |
| M03_FORCE_RLS_REMOVE | OWNER_FORCE_DENY | 0 / 1；PASS detection |
| M04_MEMBERSHIP_LEAK | NO_ROLE_MEMBERSHIP | 0 / 1；PASS detection |
| M05_INACTIVE_CHECK_REMOVE | INACTIVE_CANNOT_ACTIVATE | 0 / 1；PASS detection |
| M06_PROVENANCE_CHECK_REMOVE | NO_UNVERIFIED_TO_RESOLVED | 0 / 1；PASS detection |
| M07_OWNER_FK_REMOVE | CROSS_OWNER_REJECT | 0 / 1；PASS detection |
| M08_DEADLINE_CHECK_REMOVE | DEADLINE_EXACT | 0 / 1；PASS detection |
| M09_NONSHRINK_GUARD_REMOVE | TERM_NEVER_SHRINKS | 0 / 1；PASS detection |
| M10_ANCHOR_GUARD_REMOVE | T0_NEVER_REBINDS | 0 / 1；PASS detection |
| M11_EVENT_IMMUTABLE_REMOVE | EVENT_CONTENT_IMMUTABLE | 0 / 1；PASS detection |
| M12_UNIQUE_REMOVE | DUPLICATE_STORAGE_KEY_REJECT | 0 / 1；PASS detection |

每項 normal graph先實際成功，再apply不同SHA的mutant SQL到獨立DB，指定CHECK從PASS變FAIL；不是setup failure／baseline result replay／字串匹配替代runtime。Normal/mutantSQL完整保存；schema mutation1–12來源與目標before/after hashes、behavior.json、evaluator.stdout/stderr、evaluator.json與result.json逐項保存。Evaluator獨立process重新從**fresh DB observation**核對contract（不讀saved PASS flag），其OS exit0/1；主mutation suite exit0表示12個預期破壞均被偵測。DB基線template由本輪真正apply的142檔建立；clone只避免重建已證明相同predecessors，每一正常／mutant都實際apply candidate，不複用candidate結果。

### 13.5 Evidence provenance, freeze and pending acceptance

Persistent evidence root：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-inactive-foundation-implementation-20261003/`

Fresh：本輪Git/index/全tracked raw manifest、DDL/bootstrap/工具identities、fresh/upgrade apply、IF/N cases、12個actual mutations／independent evaluator processes、scope/encoding/whitespace/secret-pattern/prohibited-surface與外部proof。Pre-commit主要smoke證據是 `precommit-smoke-final/`，mutations是 `precommit-bound-mutations/`；最終freeze前binding／command-focused確認與後續postcommit實際results由外部 final report列明。首次setup／harness failures保留，不倒改為PASS；其中permission probe原管理者session、summary variable shadowing及DDL membership缺口均在本輪新paths內修正，原harness未動。

Reused：§10.1 R0-A accepted reacceptance與PC-2 local acceptance、既有Owner契約及39項source ledger。原六source/test＋04 bytes／modes不變是適用證明；沒有重跑R0-A accepted suites、PC-2 478 suites、web build、遠端或Development tests。

**Local implementation complete／independent acceptance pending**。本段在local freeze前保存；單一commit及postcommit focused IF/N/M重跑的實際SHA/exits由外部 FINAL_IMPLEMENTATION_REPORT.md綁定，不再修改本文件。任何postcommit failure須BLOCKED，不amend或新增corrective commit。Authority compatibility此小型集合NEW_REGRESSION=0，以catalog/data equality及各RPC outputs可比行為證明，不宣稱完整478-suite differential。

尚未存在／未證明：canonical capture及entitlement event producers、authenticated真实owner/resource binding、歷史coverage／Free baseline完整性、verified rights/protection sources、monthly grant與timezone registry、grant persistence至正式產品、R0-C顯示／查詢、R1–R5。T0語意已批准；producer／status／rights／後續TZ/月份/quota/照片及copies期限仍各自pending。不能只改mode／provenance constants啟用，需另forward integration migration／受限writers與獨立批准。

NO push/fetch/deploy／remoteDB/Auth/Storage／legal activation；無正式會員fixtures。原roadmap ordering與photo governance/Development evidence兩項歷史conflicts保留；OD-15、TD-10/AU19、P-7仍OPEN。R0-A／PC-2 local acceptance維持通過；法律DRAFT / NOT ACTIVE；activation pending。R0-B僅交**獨立本機驗收**，不是activation readiness。


## 14. F2 / F1 — authorized local deployment-authority corrective record（2026-10-04）

### 14.1 Authorization, exact scope and retained history

Owner 的 **R0-B — LOCAL DEPLOYMENT-AUTHORITY CORRECTIVE REMEDIATION** 批准精確四個既有 paths 的修正及一個新的 local corrective commit，不 amend 原 accepted commit。起點 main / HEAD `26f9a136da4dc484e60a97828803f8c942452c62`，parent `3b1957e8dc459db6fdaa06bec873c1acc632ae9a`；本機 origin/main `b70884a013ac67486242fe5d11b9bfad1360032a`，5/0，worktree clean / staged empty。這不是 Hosted rewrite／repair-history／deployment 授權。

| Exact existing path | Current raw SHA-256 / purpose |
|---|---|
| `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql` | `8d315af1ee9854dc27e3f374280866636971d68c04633f29a01a44f3b56af956`；F2 native gate／transaction-local builder及F1 pre/postconditions。 |
| `scripts/consumer-retention-persistence-smoke.mjs` | `b3a238c416920b357a5cdb37d51eb85e9dcd5ce8161a4e83ab1ad05febc18924`；保留原契約，新增實際F1/F2 controls與raw bindings。 |
| `scripts/consumer-retention-persistence-mutations.mjs` | `9068c2caafe9e250b67fa40aea3fb1a44e49a33b387d285593719d5dca4da742`；保留原契約，新增實際F1/F2 controls與raw bindings。 |
| `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md` | 本文件 hash 僅記外部報告；保留原 bytes，prepend current status 與 append §14，無 self-hash。 |

四個變更都是 **M**；無第五個 path、無新 migration。143 個 migrations 中只有本輪第143檔改變，原142檔 immutable；scope 外 **3,341** tracked paths 的 raw bytes／blobs／modes 不變，包含兩個 Demo Pool commits、R0-A、PC-2、產品、dependencies、法律及 registry。Index 原 entries 在 stage 前保持不變；正常 stage / commit 只改這四份 entries，不能要求 index raw hash 提交後仍等於施工前。

原 acceptance `C:\Users\Mufan\acceptance-evidence\r0-b-independent-20261004\ACCEPTANCE_REPORT.md` 為 **R0_B_LOCAL_ACCEPTANCE_PASS at 26f9a13**。12個 key artifact raw hashes已核對；final 18 probes有效，probes-run1 / probes-run2作廢，不計入結果。§13.2–13.5 當時 hashes／SUPER gate／pending acceptance 逐 bytes保留，不把新結果寫回原時點。

Diagnosis `r0-b-deployment-authority-diagnosis-20261004/` 的完整 report、inventory、unapplied patch、632項artifact index與37項有效 observations已核對。37項是 **reused diagnosis evidence**（27 F2 /10 F1），不是本輪新candidate驗證數。SQL patch先在目前source `git apply --check` exit0，再apply；僅將 PROPOSED 註解更新為實際契約。Original storage body從CREATE SCHEMA至object ACL revoke block **exact bytes相同**，實際storage structure／fixtures亦相同。

### 14.2 F2 native authority and transaction-local builder（IMPLEMENTED_AND_EVIDENCED；local only）

Migration 在任何DDL前核對 **current_user=session_user**，catalog中的 native actor 必須 LOGIN，且為 SUPER，或 **當前database owner OID＋CREATEROLE**。這是已批准的 local administrator profile；不依postgres名稱／caller GUC／任意Paid／Client值放行。一般 CREATEROLE、service_role（即使測試賦CREATEROLE）、switched SET ROLE及偽造setting全部 `42501 / RETENTION_DDL_ACTOR_NOT_AUTHORIZED`。

同一 BEGIN / COMMIT：actor建立 NOLOGIN / NOINHERIT / NOSUPERUSER / NOCREATEDB / CREATEROLE / NOBYPASSRLS `consumer_retention_ddl_builder`，僅暫時授SET給native actor。Builder建立原sealed owner，暫時授owner INHERIT / SET給actor；原 storage body由actor完成。Builder撤銷自己授出的owner membership，actor DROP builder，消除PG17 bootstrap ADMIN edge；最後檢查owner作role、member或grantor均零membership。Builder不擁有SQL objects，沒有廣泛 DROP OWNED / REASSIGN OWNED。Quoted role identity取自session catalog，不由caller指定。

成功後builder不存在；owner所有flags false、零memberships、四表 ENABLE / FORCE RLS、零policies、schema/table/function ACL封閉，原 INVOKER guards／empty search_path unchanged。Native actor在seal後不能自grant owner、改owner LOGIN、讀private表或DROP schema（四項42501）。既有同名builder或owner以42710拒絕；OID／attributes保留，不接管或清除。重入不採用既有objects，rollback無builder residue。四個真實22012 fault points（builder建立、owner grant、storage建好、builder drop後）全部scope外catalog/data/roles/default ACL／membership parity，無partial schema/owner/builder。

另一個名稱的 native database owner＋CREATEROLE 與 native SUPER 亦成功；因此不是 role-name allowlist。授權的administrator仍屬database信任邊界，不能把此封閉runtime ACL誤稱可阻止malicious SUPER／未來另案DDL actor改安全設定。

### 14.3 F1 predefined capabilities / membership / INHERIT / SET / BYPASSRLS

不再以 `rolname NOT LIKE 'pg_%'` 略過整批內建角色。一般non-SUPER principals及其 ACL仍必須零runtime private權限；兩個有天然data權限的 `pg_read_all_data` / `pg_write_all_data` 單獨分類，不要求其自然 schema USAGE與data privileges為零。全角色matrix記錄flags及 MEMBER / USAGE(INHERIT) / SET，catalog edges記錄grantor / ADMIN / INHERIT / SET；另列所有可SET到BYPASSRLS identity的path。

Migration前／後兩次保守preflight：除兩個predefined data principals外，任何 non-SUPER principal直接或間接 MEMBER於任一data role，均 `42501 / RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE`。這包括latent non-inherited path；不宣稱每個MEMBER已洩漏，不自動REVOKE目標grants。未滿足此deployment prerequisite時拒絕，不設provider wildcard exemption。

Operator先證明四表均有coherent synthetic fixtures（2 owner、5 events、3 grants、1 receipt）；再各對read/write builtin及sealed owner，實際 SELECT / INSERT / UPDATE / DELETE，兩data角色另實際TRUNCATE。SELECT / UPDATE / DELETE為0或42501，INSERT為42501，builtin TRUNCATE為42501；owner自然TRUNCATE不受RLS，所以不拿它作FORCE-RLS row判據。Natural read/write privileges存在，private EXECUTE / CREATE / TRUNCATE不由data rights取得。試驗rollback後fixtures exact equality。

| New actual mutation | Expected failure identity / concrete effect |
|---|---|
| M13_DIRECT_BYPASS_READ | F1_DATA_MEMBERSHIP_SAFE；service_role直接INHERIT data read，實際讀2 rows。 |
| M14_DIRECT_BYPASS_WRITE | 同CHECK；直接INHERIT data write，實際INSERT 1 row。 |
| M15_INDIRECT_BYPASS_READ | 同CHECK；data→bridge→service_role，實際讀2 rows，edges明確存在。 |
| M16_SET_ONLY_LATENT | 同CHECK；MEMBER=true / INHERIT=false / SET=true，native讀42501，仍拒latent prerequisite，不冒稱已洩漏。 |
| M17_RUNTIME_SET_BYPASS | 同CHECK；authenticated實際SET到BYPASS data-bearing role，讀2 rows；BYPASS旗標不被誤當可INHERIT。 |

每個normal與mutant實際apply當前SQL到独立clone，填入非空graph，再保存DB observations；獨立child evaluator直接核對catalog／SQLSTATE／behavior，而不是saved pass flag。Normal exit0、mutant exit1、stderr empty；setup/runtime/evaluator異常為BLOCKED，從不算detection。Normal/mutant hashes不同，完整SQL／behavior／evaluator命令保存。所有global role mutations只在disposable cluster；每clone drop自身DB、移除自身測試roles與兩個明確fixture memberships，再比較完整membership catalog（含OIDs／grantor/options）與正常起點相等。

### 14.4 Precise CHECK mapping and valid local gate evidence

| Original CHECK / expectation | Current contract and reason |
|---|---|
| NONADMIN_DDL_DENIED：拒絕non-SUPER postgres | Identity保留，但probe改為真正未授權service_role；錯誤42501 RETENTION_DDL_ACTOR_NOT_AUTHORIZED。授權native database-owner＋CREATEROLE則成功；沒有blanket non-SUPER exemption。 |
| IF01 / IF02 / IF13：candidate原用SUPER apply | 正常fresh143與upgrade142＋candidate改native non-SUPER postgres；DDL rollback亦native。Trusted SUPER相容另外實測。 |
| IF04 / RUNTIME_DENY / N01 / N02 | 原app ACL／實際denials不弱化，角色掃描擴至非data builtin；predefined naturalrights另分類，全membership／SET paths另測。原runtime roles是新版受測集合的subset。 |
| M04_MEMBERSHIP_LEAK | 原REVOKE-from-postgres字串anchor消失；改為成功COMMIT後在自身clone由privileged fixture授owner給authenticated，NO_ROLE_MEMBERSHIP仍actual CHECK FAIL。不是postflight setup拒絕冒充detection。 |
| M01–M03 / M05–M12 | 原 corruption／behavior CHECK／normal0-mutant1 契約保留。 |
| New F1 / F2 controls | 18個F2＋6個F1 focused checks；另外IF14/N16 frozen proof。 |

**有效逐項 gates 已齊備：14 success /16 negative；原12 mutations＋5 new role-path mutations（17 unique controls）**。不是把中途失敗whole run改標PASS。`precommit-smoke-1` exit1：在IF01–IF13、N01–N15及有效behavior完成後，fault injector的JS replace把 `$$`解成`$`，owner-granted故障SQL以42601 setup失敗。`precommit-mutations-1` exit2：原12及M13有效後，global membership fixture未恢復導致下一normal setup被preflight正確拒絕。兩份raw/result保持原exit；不算那兩個setup失敗為安全detection。

授權scripts內的修正：literal replacement callback保持SQL `$$`，每clone精確membership restoration／parity。`precommit-authority-final` **exit0，26 checks**（18F2 /6F1 /IF14 /N16）；`precommit-mutations-affected` **exit0，6 affected controls**（M04、M13–M17），每clone restoration通過。已有效且邏輯未受後續修改的fresh／upgrade／原12mutation evidence沿用，不重跑整輪。Intermediate執行source從確切保存editor operations重建，raw SHA與tooling/execution hash完全相等，明確標RECONSTRUCTED，而非冒充當時capture的副本；最新focused sources完整bind當前三份bytes。

Full CLI仍可由兩個committed scripts重現14/16與完整17 mutations；programmatic `authorityControls(bin,rec)`與 `runMutations({bin,out,only:[known IDs]})`可重現本輪focused subset。`only`只能選既有control IDs，不開放DSN／remote host；預設ALL_17。Exact CLI沿用§13.4，外部focused runner僅import這些exports，無另外repository harness。

### 14.5 Meaningful differential and frozen evidence

與26f9a13：**22項完整observations exact相等**（IF02、IF03、IF05–IF12；N03–N14），包含constraints／times／unknown outputs／RPC compatibility及data rollback，不是只比PASS數。N01原runtime role集合仍完整涵蓋，原denials及新增denials均42501；N02 escalation亦42501。New native apply與original SUPER apply各在完整142 predecessor clone中實際執行，scope外catalog/data/roles/memberships/default ACL相等，new storage structure與coherent graph exact相等。Original storage body exact bytes相同。Fresh / upgrade authority compatibility保持不變。

**NEW_UNAUTHORIZED_REGRESSION = 0**，範圍限本次F1/F2與targeted authority集合；不宣称478-suite sweep或完整平台acceptance。F3 receipt future-writer binding／F4合法刪除边界不變，未擴成runtime writer或額外immutability承諾。

Tooling：既有 Windows PostgreSQL17.6、Node v24.15.0、pg8.23.0；未安裝／變更dependencies。每次bootstrap／binaries／actual SQL／scripts hash、完整commands/exits/raw SQL observations與mutation artifacts皆在persistent外部目錄。Original37 observations／Claude final18 probes／官方PG17與Supabase docs標REUSED；本轮actual candidate apply／controls／differential／hash/scope checks標FRESH。歷史2026-10-02 Hosted rolsuper=false報告仍僅historical reported observation，不是本輪remote read。

Persistent evidence root：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-deployment-authority-corrective-20261004/`

重要records：`before.json`、`sql-patch-apply-check.json`、`reused-acceptance-bindings.json`、`INTERMEDIATE_SOURCE_PROVENANCE.json`、`PRECOMMIT_GATE_AGGREGATE.json`、`BASELINE_CANDIDATE_DIFFERENTIAL.json`、`precommit-smoke-1/`、`precommit-mutations-1/`、`precommit-authority-final/`、`precommit-mutations-affected/`。提交及post-commit results僅追加外部 `FINAL_CORRECTIVE_REPORT.md` / `EVIDENCE_INDEX.json`，不再改寫本文件bytes或宣稱此pre-commit時點已完成post-commit。

### 14.6 Pending Hosted prerequisites and independent reacceptance

本機模型證明stock PG17.6下的已批准administrator／builder契約，不等同Hosted專案。未核對目標native connection actor、database-owner OID／CREATEROLE／LOGIN、CREATE/DROP ROLE／GRANT/REVOKE／SET能力、管理服務DDL hooks／reserved-role限制、全角色membership prerequisite、目標migration history／partial apply狀態。不能假設能取得Supabase SUPER。後續需另行授權目標facts／部署方案；不能以後置migration解決先行migration失敗，亦不能對已套用目標默默rewritesource或repair-history。現有可得證據未證明原migration已目標apply；本輪授權僅local candidate。

新candidate等待 **Claude independent reacceptance**，至少獨立重跑native fresh/upgrade、未授權actors／builder lifecycle／collision／rollback、全role paths與非空fixture F1 controls、actual17 mutations／failure identities、原14/16 contracts、targeted compatibility／source bindings／scope外 frozen bytes。不把implementer results当独立PASS。

原R0-B acceptance維持26f9a13；R0-A／PC-2 local acceptance維持通過。無runtime capture／entitlement producer、產品顯示接線、回填、monthly grants、R0-C／R1–R5、purge／刪除／training copies／legal activation。OD-15、TD-10/AU19、P-7 OPEN；原roadmap ordering與photo governance conflicts保留。法律 **DRAFT / NOT ACTIVE**；activation pending。NO fetch / push / deploy / remote DB / Auth / Storage。

## 15. R0-B-C1 same-transaction identity binding、atomic history 與 canonical entry — authorized local corrective record（2026-10-05）

### 15.1 Authorization、exact scope 與保留邊界

TastKind Owner 已批准 `FINAL_FOUR_PATH_PROPOSAL.md` 的交易內 identity binding、原子 migration history 設計與四檔本機 corrective scope，並附加驗收澄清。本輪只授權本機施工、可拋棄 PG17 驗證，以及全部 pre-commit gates 通過後的一個 corrective commit。不授權 Hosted 寫入、rehearsal、部署、history repair、ETL／匯出、CI／token 修改或法律啟用。

Parent / accepted candidate 為 `fc39891b88c16a1c0224234bd79839b71c0f73d5`。修改限於下列既有四檔（全部 M）：

- `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql`
- `scripts/consumer-retention-persistence-smoke.mjs`
- `scripts/consumer-retention-persistence-mutations.mjs`
- 本文件（只追加本節；§1–§14 bytes 保留）

沒有第五檔、新 migration 或 dependency 變更。原 142 migrations、產品、法律、registry、Demo Pool 與其他 scope 外 bytes／modes 保持不變。

以下內容逐字保留：

- F2 原文（首 14 行）；
- migration 原 DDL 本體（原 27–216 行；`CREATE SCHEMA` 至 sealed-owner residue check）；
- FORCE RLS、ACL、sealed owner、builder lifecycle、T0／provenance、inactive／unknown 邊界。

Foundation 維持 inactive：無 producer、真實 grant、回填或刪除。

### 15.2 G1：DDL 前、同一交易內的模式與綁定（IMPLEMENTED；local only）

**執行順序：** `BEGIN;` 之後依序執行：

1. F2（原文）；
2. F1（批准管理邊界，§15.5）；
3. G1；
4. 送出 `R0B_DDL_BOUNDARY` notice；
5. 才開始第一個 DDL。

**模式判定：** G1 以明確 Supabase 平台 marker 判定模式，不以 OID 10 名稱判定（本機 harness 的 OID 10 也是 `supabase_admin`）。Marker 為：

- roles `pgbouncer`、`supabase_auth_admin`、`dashboard_user`、`supabase_read_only_user`、`supabase_etl_admin`；
- schema `supabase_migrations`；
- `supautils.reserved_roles` setting。

| 模式 | 適用條件（全部須成立） | 綁定內容 |
|---|---|---|
| `plain-local`（相容路徑） | 無 selector、無 manifest／nonce、上述 marker 一個都不存在 | logical F1 + 原 F2 + scope digest + G2 精確後狀態；不寫 history |
| `local-fixture` | selector=`local-fixture`；無 `pgbouncer`／`supabase_auth_admin`／`dashboard_user`／`supautils` marker；`tastkind_r0b_fixture.attestation` 由 OID 10 superuser 擁有且恰一列，nonce 與 manifest sha256 相符 | 完整 binding（含本機 OID）+ 原子 history |
| `hosted-development` | selector=`hosted-development`；manifest UTF-8 sha256 = migration 內嵌常數 `2630322532a4b2a2864dc3cdb8f01c8e6838ebe9ead85bc5719b3f4ef746e59c` | 完整 Hosted binding + 原子 history |

**Fail-closed 規則：** 下列情況全部在 DDL 前以 42501 拒絕，不會落入較寬鬆的 local fallback：

- 任一 marker 存在但無 selector（`R0B_PLATFORM_SELECTOR_REQUIRED`）；
- 有 manifest／nonce 但無 selector；
- selector 無效；
- Hosted manifest 不符；
- fixture 未 attest；
- fixture 出現在平台 marker 上。

因此 `db push`、Dashboard SQL editor、Management API 或任何不帶 selector 的路徑在 Hosted 一律 DDL 前拒絕。Supabase 本機 docker（`db reset`）亦屬平台型，同樣需要 selector。

**前狀態檢查：** retention roles 或 schema 已存在時，以 42710 `R0B_RETENTION_PRESENT` 在 DDL 前拒絕（不再嘗試 `CREATE ROLE`）。

**Bound 模式比較：** 在 bound 模式下，G1 以 `-- r0b:observe:begin/end` 之間的單一 SELECT 取得觀察值，並與 manifest 逐段比較：

- `target`（database／OID／owner）
- `actor`（session、current、OID）
- `roles`（全部 roles，含 OID、7 旗標、`valid_until` 以 UTC 微秒字串比較、`connection_limit`）
- `memberships`（全部 edges：member／role／grantor／ADMIN／INHERIT／SET）
- `functions`（42 個：schema／name／`pg_get_function_arguments`／OID／owner／config／ACL／SECURITY DEFINER／`sha256(pg_get_functiondef)`）
- `tableHooks`（28 tables：present 的 kind／owner／RLS／FORCE RLS／triggers 與 rules，以及 absent tables）
- `history`（`schema_migrations` 欄位與型別、全部 version 集合）

另有一條固定規則：bound tables 的 triggers 必須全部 enabled（`TABLE_HOOKS_DISABLED`）。這是因為核准證據沒有 enabled 狀態欄位，所以以固定規則 fail-closed 補足。

**比較的表示法：** 所有 rendering 都在 transaction-local `search_path=''` 與 `COLLATE "C"` 下進行，與核准 Hosted 證據的 qualified rendering 一致。任何不符都以 `R0B_PRESTATE_BINDING_MISMATCH <classes>` 拒絕。

**Hosted manifest：**

- 由下列已批准外部證據推導（每檔 sha256 皆固定）：identity snapshot `e839ee8f…`、32 RPC reconciliation `9028a618…`、helpers `8e9bac98…`、hook capture `2027d3d4…`／SQL `9198eeb5…`、history `f8bce7a7…`、history 欄位 `57a08fdd…`。
- 內容：88 roles／82 edges／42 functions／28 hook tables／66 versions。
- 以 canonical JSON（61,077 bytes）commit 於 `HOSTED_MANIFEST`。
- `deriveHostedManifest()` 可由同一組證據逐 byte 重建；不會自動 refresh。
- 本輪 Owner run 只比對到 75/88 roles、81/82 edges 的子集；完整矩陣於部署時在交易內重新比較。

**Source capture：** bound 模式以 `current_query()` 取得實際執行字串，並檢查：

- header 行恰出現一次；
- header 之前只能是 `SET tastkind.r0b_(target|manifest|fixture_nonce) = $r0b$…$r0b$;`（`R0B_SOURCE_PREFIX`／`R0B_SOURCE_CAPTURE`）；
- 自 header 至結尾即為實際執行的 migration source，並以 transaction-local setting 傳給 G2。

**Scope digest：** G1 計算 retention 範圍外的 catalog digest，並以 transaction-local setting 保存。涵蓋：

- 全部 roles 與 memberships；
- 非系統 schemas、relations、functions（prosrc／probin／args／rettype 的 sha256）；
- triggers、rules、policies、default ACLs、event triggers、extensions、publications；
- database ACL／owner。

### 15.3 G2：精確後狀態、漂移與原子 history

**漂移檢查：** G2 重算 scope digest。凡 G1 之後已提交的並行變更（roles、edges、functions、triggers…），都以 `R0B_POST_GUARD_DRIFT` 整筆 rollback。

**精確後狀態：** retention 後狀態 digest（`-- r0b:poststate:begin/end`）必須等於 `407d86c5d8dae1cfb0419d28b04519221707982298389c5b8859bc0be630dafc`，否則 `R0B_POST_STATE_MISMATCH expected=… observed=…`。Digest 涵蓋：

- schema owner／ACL；
- 4 tables 的 kind／owner／ACL／RLS／FORCE RLS／options；
- 全部欄位與 default／generated；
- constraints、indexes、triggers 與 enabled 狀態；
- 2 functions（含 `sha256(pg_get_functiondef)`）；
- policies 數；
- owner 的 default ACLs；
- owner 與 builder 的 role 旗標（builder 必須不存在）；
- 涉及兩者的 memberships 數（必須為 0）；
- owner 在 retention 以外擁有的物件數。

Digest 不含 OID 與 wildcard；新增內容不會被接受。

**History row（bound 模式）：** G2 之後、`COMMIT` 之前，寫入 `supabase_migrations.schema_migrations(version, name, statements)`。值為 `20261003062157`、`consumer_retention_inactive_persistence_foundation`、`ARRAY[實際執行 source]`。寫入後立即核對：

- 該 version 恰一列、name 精確；
- `statements` 為一維、下界 1、cardinality 1，`statements[1]` 等於實際 source；
- 可重現表示法 `encode(sha256(convert_to(statements[1],'UTF8')),'hex')` 等於 source 的 sha256，也就是 migration 檔案 raw bytes 的 SHA-256；
- 其他欄位等於宣告的 column default（無 default 則為 NULL）；
- 全部 version 集合等於 manifest 的 66 版加本版。

Entry 另外記錄 `array_to_json(statements)` 的 sha256 作為輔助表示。

**狀態分類（entry 唯讀判定）：**

| 狀態 | 條件 |
|---|---|
| ABSENT | 無 roles、無 schema、無 row，history 等於原集合 |
| APPLIED | 僅 owner、schema 存在、後狀態 digest 精確、row 精確（element sha256 等於檔案 sha256）、history 等於原集合加本版 |
| INCONSISTENT | 其他一切狀態（例如只有 row 或只有物件） |

**Entry 行為：**

- 在 ABSENT 時才執行一次。
- APPLIED 時 no-op（執行次數 0、DDL 0）。
- INCONSISTENT 時停止（DDL 0），不自動 repair。
- 交易失敗或 commit 結果不明時，以唯讀後檢判定；僅在 ABSENT 且原因已釐清時才重試。

### 15.4 Executor 事實與 canonical entry

**固定版 Supabase CLI 2.109.1 無法作為執行器：**

- `supabase.exe` `22c0f28f…`：`db query` 以 prepared statement 送出 SQL，server 對多語句回傳「cannot insert multiple commands into a prepared statement」，完全不執行（DDL 0）。已以真 binary 驗證（B11、E09）。
- `db push`（Go）因遠端獨有的 `20260903182941` 觸發 `ErrMissingLocal` 而中止；它會重組 URL 而丟棄 `sslmode`／`sslrootcert`；無法攜帶 selector；並且自己寫 history。

**Canonical entry：** `applyR0BHostedDevelopment()`，由 `runBoundEntry` 以 node-pg simple query 執行（同一 general client 已於 2026-10-05 Owner run 證明 actor 與 TLS）。Entry 拒絕下列任一情況，此時 connects 0、CLI 0、DDL 0：

- 缺 Owner 確認字串；
- password 不來自環境；
- 禁用參數（`push`、`--linked`、`--password`、`repair`…）；
- executor 不是 `node-pg`（CLI 先核對 binary hash，再以 incompatible 拒絕）；
- host／port／database 或 tenant 不符；
- 非 `verify-full`；
- 缺 CA 或 CA sha256 不等於 `700723…f3b7`；
- migration sha256 不等於 `R0B_MIGRATION_SHA256`；
- manifest sha256 不符。

連線後會核對憑證鏈的根指紋等於官方根 `80:70:25:AD…CA:FA`，不符則在任何 SQL 之前拒絕。

此 entry 不經本 script CLI 暴露。任何 Hosted 使用，以及「以 node-pg 取代 Owner 原選 CLI 作為執行器」，都須 Owner 另行批准。

### 15.5 F1：批准的管理讀取邊界

原 F1 拒絕所有非 superuser 的 predefined data membership，在 Hosted 必然失敗。新 F1（DDL 前後各一次，訊息仍為 `RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE`）規則如下：

- 非 superuser 的 `pg_read_all_data` member 只能是已披露的 `postgres`、`cli_login_postgres`、`supabase_etl_admin`、`supabase_read_only_user`。
- 任何非 superuser 不得是 `pg_write_all_data` member。
- 六個 App runtime roots 不得為 superuser，也不得以 MEMBER 路徑到達任一 superuser、兩個 predefined data roles 或上述四個管理身分。

本機 smoke／mutation evaluator 同步採用相同規則。這是已批准的前瞻契約變更；本機舊 fixtures 沒有管理 member，觀察結果不變。

### 15.6 Gates、執行入口與差異規則

**CLI：** `node scripts/consumer-retention-persistence-smoke.mjs --pg-bin <PG17 bin> --out <外部目錄> --supabase-cli <supabase.exe 2.109.1> --hosted-evidence <核准證據根目錄>`；mutations 使用相同參數。仍只接受本機參數，DSN／host 一律拒絕（N14）。

**Smoke：** 原 14 success／16 negative 保留。N14 只允許 bound 模式那一條精確的 history INSERT。新增 B01–B12：

| Gate | 內容 |
|---|---|
| B01 | 靜態不變量 |
| B02 | Manifest 由證據逐 byte 重建 |
| B03 | Plain 相容路徑（明確條件） |
| B04 | 批准管理讀取被接受 |
| B05 | Fixture entry 原子套用 |
| B06 | 重試 APPLIED no-op |
| B07／B08 | 只有 row 或只有物件時為 INCONSISTENT，執行次數 0 |
| B09 | Fixture 四個錯誤注入點全部 rollback |
| B10 | Hosted 分支邏輯（常數替換，僅證明邏輯） |
| B11 | 真 CLI 不相容 |
| B12 | Hosted request 正向驗證（不連線） |

**Mutations：**

- 原 17 controls 保留。
- 其中 M02、M03、M05–M12（`COMMIT` 前改動 storage）先由 G2 以原始 mutant 拒絕並完整 rollback（`G2_RAW_STORAGE_MUTANTS_REJECTED`）。之後 mutant 改以其自身觀察到的後狀態 digest rebase，仍由原行為 evaluator 偵測，保留原意圖。
- M01、M04、M13–M17 在 G2 之後或 `COMMIT` 之後，不屬 G2 範圍。

**新增 binding controls：** 每項先保存原始 observation，再由獨立 evaluator process 判定。

| 類別 | Controls | 通過條件 |
|---|---|---|
| Entry | E01–E15（E08 四子項，共 18 項） | connects 0（E02 為 TLS-only 1 次）、queries 0、spawns 0 |
| SQL pre-DDL | S01–S38 | 錯誤 prefix 精確、DDL attempts 0、無 boundary notice、持久化狀態不變 |
| Post-guard drift | D01–D02（以 event trigger advisory pause 在 DDL 中注入並行變更） | 錯誤為 `R0B_POST_GUARD_DRIFT`、DDL attempts > 0、全部 rollback、無本次物件及 history row |

DDL attempts 以 `ddl_command_start` event trigger 呼叫 `nextval` 計數（sequence 不隨 rollback 回復）。Role 類 DDL 不觸發 event trigger，因此另以 boundary notice 確認 DDL 前已拒絕。Setup、parser、evaluator 錯誤一律 BLOCKED，不算偵測成功。

**Differential 範圍：** 只納入實際會套用本 migration 的既有 harness：

- 36 個 `*-postgres(-apply)` harness（全部讀取並套用 `supabase/migrations` 全序列）；
- 本 R0-B smoke 與 mutations。

在 `fc39891` baseline 與 candidate 兩個 bytes／hash 綁定的隔離 clone 中，以同一解析規則比較 failure identities、runtime causes 與 exit codes；`NEW_UNAUTHORIZED_REGRESSION` 必須為 0。實際結果記錄於外部 corrective report，不改寫本文件。

### 15.7 仍待 Hosted 另案批准的前置條件與限制

| # | 前置條件 |
|---|---|
| 1 | 執行器：Owner 原選 CLI 2.109.1 已證明不可行；改用 canonical entry（node-pg）須 Owner 批准 |
| 2 | Privileged automation：`SUPABASE_ACCESS_TOKEN`（CI `development` environment 與本機）可經 Management API 執行管理 SQL。Scope、持有人、Environment protection 與 App runtime 可達性仍 unknown |
| 3 | 傳輸：client→pooler TLS 已驗證；pooler→database 的 PostgreSQL TLS 為 false，其他傳輸保護 unknown。由 Owner 決定，不代為接受 |
| 4 | 部署前唯讀預檢：`schema_migrations` owner／INSERT 權限與欄位 default；完整 88/82 矩陣與全部 bindings 仍相等（只比較、不 refresh） |
| 5 | 另行授權的 Hosted rehearsal：在 actor 16388 下驗證 CREATE ROLE、ownership、GRANT、supautils／managed hooks；驗證後狀態 digest 與 trigger rendering 在 Hosted 的可攜性；驗證 history 寫入 |
| 6 | PC-2 ordering：PC-2 若先改動已綁定的 RPC，須重新綁定並重新批准 |
| 7 | 部署時段：避開 Demo Pool 排程，不得有並行管理 DDL；密碼由 Owner 輸入，用後輪替 |

**威脅模型：** 涵蓋誤用路徑、漂移與並行變更；不保證抵禦惡意 DBA 或 privileged token 持有者。

**殘餘空窗：** G2 至 `COMMIT` 之間，以及 shared catalog，由部署時段限制處理。

本節之後的 commit、post-commit 結果與 independent reacceptance 只追加於外部報告，不再改寫本文件 bytes。R0-B Hosted deployment 仍 BLOCKED；法律 **DRAFT / NOT ACTIVE**；activation pending。

## 16. R0-B-CAP：新飲食紀錄 T0 與 provenance capture — authorized local implementation record（2026-10-06）

### 16.1 授權、exact scope 與保留邊界

TastKind Owner 批准 `RETENTION_CAPTURE_SCOPE_PROPOSAL.md` 的「T0＋provenance capture」最小工程包，並批准兩項工程取捨：capture 採 fail-closed（失敗時整筆新增 transaction rollback），以及對 `consumer-retention-persistence-smoke.mjs` 做本輪精確 successor 相容性調整（保留既有檢查能力）。本輪只授權本機施工、可拋棄 PG17 驗證，以及全部 pre-commit gates 通過後的一個 local commit。不授權 Hosted 連線、rehearsal、部署、history repair、回填、purge、entitlement producer、registry 或法律啟用。

Baseline 與 parent：`3eb8d7fa0002555d504d900db44313fca860474a`（R0-B-C1 本機驗收 candidate）。

| 路徑 | 狀態 | 用途 |
|---|---|---|
| `supabase/migrations/20261006030000_consumer_retention_capture_anchor.sql` | 新增 | 單一 forward transaction：capture schema／sealed owner／anchor 表／兩個 trigger function／`meal_records` 的 AFTER INSERT trigger |
| `scripts/consumer-retention-capture-smoke.mjs` | 新增 | 14 positive、11 negative、3 supplementary gates（PG17 disposable） |
| `scripts/consumer-retention-capture-mutations.mjs` | 新增 | 24 個實際 migration SQL 變異 |
| `scripts/consumer-retention-persistence-smoke.mjs` | 修改 | 僅 successor 相容性：`baseline()` 與 `frozen()`（見 §16.6） |
| 本文件 | 修改 | 只追加本節；§1–§15 bytes 保留 |

Timestamp `20261006030000` 晚於原最新 migration `20261003062157`，在 143 個既有檔與全部 tracked paths 中無碰撞。原 143 個 migration、既有 RPC 本體／ACL／signature、App、Edge、dependencies、法律、Demo Pool 與其他 scope 外 bytes／modes 不變。

### 16.2 產品契約（IMPLEMENTED_AND_EVIDENCED；local only）

- **只處理 migration 啟用後新增的 `public.meal_records`**：任何 `INSERT` 都在同一 statement／transaction 內由 `AFTER INSERT FOR EACH ROW` trigger `retention_capture_t0` 寫入恰一列 anchor。
- **T0 語意**：`date_trunc('milliseconds', transaction_timestamp())`，即首次成功保存該 transaction 的 server UTC 時間，截斷到毫秒（timestamptz 無 rounding typmod，且以 CHECK 強制毫秒對齊、有限、UTC 年 1–9999）。同 transaction 的多筆新增共享同一 T0。T0 **不**讀 `occurred_at`、`meal_date`、`created_at`、payload、caller GUC 或任何訂閱資料。
- **fail-closed**：anchor 寫入失敗時整筆新增 rollback；所有其他寫入（items、analyses、finalizations、corrections、planned conversion）一併不留下。
- **重播、request id 回寫、後續寫入不重設 T0**：v2／finalize／conversion 的 replay 在呼叫 v1 INSERT 之前返回，不產生第二列；anchor 另有 BEFORE UPDATE guard（任何實質變更以 `23514` 拒絕）。
- **同一紀錄只有一列**：`resource_id` 為 PK 並 FK 到 `public.meal_records(id)`，`ON DELETE CASCADE`（刪紀錄、刪帳 cascade 同步移除 anchor；R5 權利處置仍待另包）。
- **provenance 欄位**：`capture_kind='canonical_meal_insert'`、`capture_contract_version='retention-capture-v1'`、`capture_context ∈ {authenticated_actor,no_actor_claim}`。context 只標記請求 claim 的 `sub` 是否等於紀錄 owner（鏡像 `auth.uid()`：先讀 `request.jwt.claim.sub`，缺時讀 `request.jwt.claims` 的 `sub`；格式不合者視為 `no_actor_claim`）；它不影響 T0，之後的 grant 只可使用 `authenticated_actor`。
- **既有紀錄不回填**，缺 anchor＝unknown；**沒有 tier、grant、永久權益、保存期限欄位**，不讀 `subscription_entitlements`。

### 16.3 實際 authority、ACL 與物件

- Schema `retention_capture`、表 `detail_capture_anchors`、兩個函式由 sealed 角色 `consumer_retention_capture_owner` 擁有（NOLOGIN、NOINHERIT、NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOBYPASSRLS、無密碼、**membership 0**；沿用 F2 temporary builder，同 transaction 內 DROP）。
- 表 ENABLE＋FORCE RLS，唯一 policy 為「只有 capture owner 可 INSERT」；沒有 SELECT／UPDATE／DELETE policy，沒有任何 runtime GRANT；schema 無 `PUBLIC`／anon／authenticated／service_role／authenticator 的 USAGE／CREATE，函式無 PUBLIC EXECUTE。
- `capture_meal_record_insert()`：`SECURITY DEFINER`、`SET search_path=''`、全 schema-qualify、owner＝capture owner；僅在 `TG_OP=INSERT`、`TG_WHEN=AFTER`、`TG_LEVEL=ROW`、表為 `public.meal_records` 時執行，否則 `RETENTION_CAPTURE_TRIGGER_MISUSE`。`reject_anchor_update()`：`SECURITY INVOKER`、空 search_path。
- 原 RPC（v1／v2／finalize／legacy_internal／planned create／convert）的 `prosrc`、signature、owner、ACL、config 與 `meal_records`／`meal_record_items` 的 ACL、RLS、policies、欄位、既有 triggers 全部不變（gate P11）；PC-2 的 `require_core` 與 `pc2_core_write` 先於 capture 執行，被拒絕時沒有 INSERT，也沒有 anchor（gate N04）。
- **管理者邊界（不宣稱保密）**：資料庫管理者（superuser／可 SET ROLE 的身分）仍可讀取、DELETE 或 TRUNCATE anchors，或停用 trigger；本包只防止 client／runtime 偽造、修改或刪除。
- Migration 自身為 plain 本機模式：任何 Supabase 平台 marker（`pgbouncer`、`supabase_auth_admin`、`dashboard_user`、`supabase_read_only_user`、`supabase_etl_admin` 角色、`supabase_migrations` schema、`supautils.reserved_roles`）或任何 R0-B binding GUC 一律在第一個 DDL 前以 42501 拒絕；沒有 Hosted-bound 模式。Hosted 套用需另案授權的後續 binding 套件。沿用已驗收的 F2 actor 檢查與 F1 管理讀取邊界（DDL 前後各一次），並加入 G2：scope digest（不含本包自身物件）不變，且 post-state 與常數 `3d314fc9c334f02d04932662c80617011bfef13fe418024b98fdc72538e22f76` 完全相同，否則整筆 rollback。

### 16.4 Gates 與結果（fresh；evidence 在 repository 外 `D:\retention-capture-impl-20261006\`）

| 套件 | 結果 |
|---|---|
| capture smoke | exit 0；14 positive（P01–P14）／11 negative（N01–N11）／3 supplementary（S01 finalize v2 record-timing、N12 App 保存呼叫、F01 frozen scope），共 28 CHECK 全部 PASS |
| capture mutations | exit 0；24 個變異（X01–X20，含 A／B／C 子項），20 個 detector 在原 migration 全數通過；23 個由行為 gate 偵測，X15（改 predecessor RPC 的 SECURITY 屬性）由 migration 自身的 `CAP_POST_GUARD_DRIFT` 在安裝前拒絕 |
| R0-B smoke（successor 調整後） | exit 0；原 14 成功／16 負向／12 binding gates 全過 |
| R0-B mutations（successor 調整後） | exit 0；原 17 controls＋58 binding controls 全過 |

Gate 重點：五個 canonical 入口（v1、v2、finalize legacy、finalize v3 existing-analysis、planned conversion，加 finalize v2 record-timing）各產生恰一列 anchor 且 T0 與 transaction 時間吻合；補登（過去／未來／跨時區）T0 不隨用餐時間移動；同 key replay 與並行（8 同 key→1 筆、8 不同 key→8 筆）；長交易（`pg_sleep` 後兩次新增）T0＝transaction timestamp；故障注入（items insert、request id 回寫、analysis insert／link、anchor 約束／權限／policy／表缺失）皆整筆 rollback 且同一請求在移除故障後可成功；真實 App TypeScript（repository＋`ConsumerMealWriteRuntime`）對 capture 失敗的處置見 §16.7。

### 16.5 Differential 與 coverage

**R0-B 自身 suites（baseline `3eb8d7fa` 對 candidate，71 組 check 觀察）**：61 組逐位元一致；8 組只有 predecessor seed 的 `created_at`／`updated_at`／`gen_random_uuid()` 執行期值不同（F1_PREAPPLY_UNSAFE_DENIED 與 7 個 F2 控制；遮蔽 timestamp／UUID 後殘差為 0，error／SQLSTATE／持久化狀態相同）；1 組 `IF14` 是預期的 frozen-scope 白名單列示（本包新路徑）；1 組 `N15` 僅輸出目錄路徑不同。17 個原 mutation 的 normal observation 與 mutant failure identity 全部一致；原 14 成功／16 負向／12 binding gates 與 17＋58 controls 全數通過。

**既有 harness（37 個，同一 parse rule 套用兩側；隔離 clone，candidate＝baseline＋本包四個 repository 檔案）**：32 個輸出逐行一致（exit code、failure identity、SQLSTATE 全同）；5 個因確實套用了新 migration，只有 migration 計數與尾端清單不同（143→144、尾端列出新檔），exit code、失敗斷言身分與 SQLSTATE 不變；**NEW_UNAUTHORIZED_REGRESSION＝0**。分開記錄：

- 實際執行到新 migration（plain 模式，完整序列套用成功）：5 個——admin-dashboard-social-policies-d、admin-operational-review-queues-c、restaurant-catalog-authoring-r2b、restaurant-owner-display-name-draft-visibility-r2e、staff-authority-p3-p6-p3k；
- skip（需要 psql／Linux PG 路徑或環境變數；兩側相同）：5 個——geo-meal-buddy-geo-1d-p0、staff-authority-p3-p6-p2d-b0-a、p2d-b0-b、p3g、p3h；
- 在更早的 predecessor migration 停止、被自身 inventory precheck 或環境阻擋（兩側相同，不算 R0-B 或本包證據）：27 個。

**Coverage 限制**：只有上述 5 個 harness 真正套用新 migration；其餘 32 個的「一致」不構成本包證據。我的獨立推導比先前 R0-B 清單多出 1 個 harness（`staff-authority-p3-p6-p2d-b0-b-postgres`，讀取並套用全部 migrations，但在本機 skip），因此 differential 範圍為 37 而非 36。

### 16.6 successor 相容性（`consumer-retention-persistence-smoke.mjs`）

只做兩處精確調整，不刪任何 assertion：

1. `baseline()`：原檢查「恰 143 檔且最後一檔是 R0-B」改為「原 143 檔，或原 143 檔加上唯一一個固定名稱、固定 sha256（`22fd1bbb516a38ccb148d108e6045d6abada393354495efc22b464fd35cf5205`）的 capture migration 且它是最後一檔」；任何其他新增、缺失、換名或內容不同的 migration 仍以 `MIGRATION_INVENTORY` 失敗；predecessor 集合排除 R0-B 與該 successor。
2. `frozen()`：candidate 白名單加入本包三個新路徑；其餘 baseline 比對（3,341 路徑 index／mode／blob、tracked diff、untracked）不變。

兩處調整前後，R0-B 自身 71 組觀察的差異見 §16.5；`consumer-retention-persistence-mutations.mjs` 位元組不變。

### 16.7 App 保存呼叫對 capture 失敗的處置（SOURCE_FACT；未修改 App）

以真實 TypeScript 原始碼（`SupabaseConsumerMealRecordWriteRepository`＋`ConsumerMealWriteRuntime`，in-process transpile）對真 DB 回傳的 capture 故障進行驗證：成功對照保存為 `succeeded`；三種 capture 故障皆**不會被報為成功**（`mealRecordId` 為空、`mealDataRevision` 不增、DB 無紀錄）：約束失敗（SQLSTATE `23514`）→ `error/provider_rejected`；INSERT 權限被拒（`42501`，PostgREST 對應 HTTP 403，模型值）→ `error/authentication_required`；anchor 表缺失（`42P01`，HTTP 500，模型值）→ `uncertain`（保留同 key pending 供重試）。**精確缺口（不修）**：`42501` 被分類為 `authentication_required`，真實根因（capture 權限）對使用者會顯示為需重新驗證；HTTP 狀態對應為模型而非遠端量測。

### 16.8 殘餘空窗、限制與後續依賴

- **Hosted**：本 migration 在 Hosted 環境（任一平台 marker）刻意拒絕套用；Hosted 預期的邏輯差異為「新增 sealed role＋schema＋表＋兩函式＋一個 trigger；不改任何既有 RPC」，實際 OID、ACL 與 Hosted 的 `auth.uid()` 對 `request.jwt.claims` 的等值性、`meal_records` 上建立 trigger 的可行性、PostgREST exposed schemas、Hosted 現有舊 function body（尚無 PC-2）下的行為，都須在後續另行授權的階段取得實際證據，不能以本機推導取代。
- **Grant producer 未就緒**：可信付款／trial／升級 producer（ENT-F）、status 語意（STATUS-F）、rights／protection 來源、R0-C 顯示接線均為後續依賴；本包不產生 grant，也不推定 Free 或 Paid。
- **JSON claims fallback**：本機 bootstrap 的 `auth.uid()` 只讀 `request.jwt.claim.sub`，`request.jwt.claims` 的 fallback 僅在本機驗證 capture 讀取行為，與平台函式的等值性屬 Hosted 階段證據。
- **無 key 重複提交**：直接呼叫 v1 的重複請求仍是兩筆新紀錄、兩個 T0（App 實際走 v2 key 路徑）；本包不改變也不宣稱修好。
- **scope digest 覆蓋範圍**：沿用 §15.2 的類別；G1 之後並行改動 predecessor RPC 的 COST／STRICT／PARALLEL 等不在 digest 內（X15B 證明由 P11 在安裝後偵測，而非由 G2 攔截）。
- 管理者／superuser 可 DELETE、TRUNCATE 或停用 trigger；`session_replication_role=replica` 可繞過 trigger（需特權）。
- 本 migration 的本機套用會啟用 capture trigger；遠端未套用，不宣稱保存功能已上線。R0-B foundation 仍 inactive、Hosted 未部署；法律 **DRAFT／NOT ACTIVE**。

### 16.9 Source bindings 與 fresh／reused

- Fresh：capture smoke、capture mutations、R0-B smoke／mutations（successor 調整後）、37 個既有 harness 的 baseline／candidate differential、frozen／inventory 證明。
- Reused：R0-B C1 本機獨立驗收證據（`3eb8d7fa`）作為 R0-B 自身 differential 的 baseline 觀察；Hosted manifest 與 PG17 工具鏈沿用既有 hash 驗證。沒有重跑 478 suites、TLS 工具或無關產品驗證。
- 本節之後的 commit、post-commit 結果只追加於外部報告，不再改寫本文件 bytes。

## 17. R0-B-ENT0：Entitlement fact ledger、monotonic coverage 與 `state_at` — authorized local implementation record（2026-10-09）

### 17.1 授權、Owner 決策 OQ-1 與 exact scope

- **Owner 決策（OQ-1，2026-10-09）**：14 天 Premium 免費試用享有 Paid 等級的餐點保存權益，但 Trial 不等同於已付款訂閱。(1) 試用期間建立的紀錄適用 Paid 180 天，自紀錄建立時間起算；(2) 試用到期且未正式訂閱後，新建立紀錄依當下實際 Free 權益判定；(3) 已建立紀錄不得因試用到期而追溯縮短；(4) 試用期間轉正式付費不得重複延長，必須維持既有升級邊界規則；(5) Trial 必須保留可辨識的獨立權益事實，不得偽裝為真實付款事件。
- **與本文件既有規則的核對（結論：無衝突）**：§2.1 的 Free 14／Paid 180（自 T0 起算）、「建立時取得保存權益」、「Free 未到期升級延至原 T0＋180 天、不是 upgrade time＋180 天」、「已得 E180 不再延長」與「降級不縮期限」均維持不變。OQ-1 只核定了本文件原先標為待核定的 trial 映射（STATUS-F 段：「不新增 `trial` code」、trial 有效時點待核定）：trial 是獨立的 Paid 等級事實。本包**不計算** E14／E180、不寫 grant、不處理升級延長；這些仍是後續包的責任，必須在讀取 `state_at` 的結果後依本文件規則實作。
- **授權範圍（Owner 逐字）**：Append-only entitlement fact ledger；Monotonic coverage；`state_at(owner, instant)`；Production producer registry = empty；Unknown 不得被推定為 Free；Retention 繼續 inactive；不變更 meal-save runtime 行為。僅限提案已盤點的 7 個 path、一個新 forward migration 與必要相容性修正。禁止 push，禁止自行啟用 retention。
- **Exact 7 paths**：`supabase/migrations/20261010010000_consumer_retention_entitlement_authority.sql`（新增）、`scripts/consumer-retention-entitlement-smoke.mjs`（新增）、`scripts/consumer-retention-entitlement-mutations.mjs`（新增）、本文件（追加 §17）、`scripts/consumer-retention-persistence-smoke.mjs`、`scripts/consumer-retention-capture-smoke.mjs`、`scripts/consumer-meal-save-recovery-guard.mjs`（三個 validator 的 successor 相容性調整，不刪任何 assertion）。

### 17.2 產品契約（IMPLEMENTED_AND_EVIDENCED；local only；ENT0-R2，取代 R1 的 AP-4 一致性機制；其餘 AP-1／2／3／5 不變；**R3 修訂：reader 順序與「free／paid 的穩定範圍」以 §17.15 為準——R2 的對應敘述對進行中 admission 不成立，保留為歷史**）

**三種保證彼此獨立，不可互相替代：**

1. **不可變的 T0 capture**：保存交易的 T0（server transaction start，毫秒）由 R0-B-CAP 的 `retention_capture.detail_capture_anchors` 在同交易寫入且不可更新。本包不修改它。
2. **`entitlement_state_at(owner, instant)`**：依「查詢當下」可見的 ledger、coverage 最新值與 registry 計算的函式。它**不是歷史記錄**：同一 `(owner, instant)` 在不同時間呼叫，可能因資訊補足而得到不同答案。本包只規定「哪些變化允許、哪些被拒」（見「答案變化規則」）；**不**承諾 ENT0 的歷史答案永不改變。
3. **未來 ENT1 持久化的 grant 及其 provenance**：本包**不存在、不產生**。ENT0 不建立保存 grant、不縮短既有 grant、不作到期收合或刪除；`free` 本身不授權任何清除（purge）。ENT1 尚未實作，本文件不宣稱它已解決任何問題。

- **Fact**：「owner O 在 `[valid_from, valid_until)`（閉開區間，毫秒精度）屬於 class C」，C ∈ `paid`、`trial`，由已註冊 producer 在其有效視窗內斷言。**`valid_until` 必填且為有限區間（AP-1）**：事實自足，`state_at` 只憑列內容判定成員資格。`NOT NULL` **不是**長度上限，本包**不制定** billing 期限上限，也**不能**防止永久或不合理超長的 Paid（例如 `[producer 的 registered_at, 9999-12-31)` 會被接受；`valid_from` 早於 producer 的 `registered_at` 的事實一律被拒，所以區間下界不可能早於註冊時間）；合理期限由未來的可信 producer 契約（ENT-F）保證。**事實到期而不再續發，只表示「到期不續約」，不代表即時取消、退款或作廢**（這些事件模型無法表示，見下）。append-only：內容不可更新；唯一鍵 `(owner, namespace, upstream_event_id)`；`semantic_digest` 由資料庫計算，呼叫端不能提供；同 id 同內容為 replay（回原 `event_id`），同 id 不同內容為 `ENT_EVENT_CONFLICT`（23505）。
- **Coverage**：每個 `(owner, namespace)` 一列單調 `covered_through`（嚴格遞增、`revision` 每次 +1、不得超過資料庫時鐘）；`valid_from ≤ covered_through` 的新事實一律拒絕（`ENT_EVENT_BELOW_COVERAGE`）。Coverage 只證明「該 producer 在此之前沒有未送達的事實」，**只用來證明 Free**（AP-2）。
- **`entitlement_state_at(owner, instant)`**（AP-2、AP-3）：單一 SQL 敘述（單一 snapshot）；不以 `now()` 作為評估點、不讀 `subscription_entitlements`、不讀任何 meal／retention 物件。`instant` 在未來 → `unknown/INSTANT_IN_FUTURE`。存在涵蓋該瞬間的 `paid` 或 `trial` 事實 → `state=paid`（本包定義的保存權益層級），**不論 coverage**；這是對原核准判定順序（任一必要 coverage 不足先於 Paid → `COVERAGE_SHORT`）的**明確契約修訂，不歸入 OQ-1**。僅有 `trial` 時 `basis=trial`（OQ-1：Paid 等級，不是付款），有 `paid` 時 `basis=paid_subscription`，證據列出全部 event id。沒有事實時，只有「**必要 producer 集合非空**，且其中**每一個**在該瞬間的 coverage ≥ instant」才回 `free`；「必要」＝該瞬間 `registered_at ≤ instant < retired_at`（`retired_at` 為空則無上界）。其餘為 `unknown`（`NO_REQUIRED_PRODUCER`、`COVERAGE_SHORT`）。**Unknown 從不被推定為 Free。**`free` 的語意是「依**已註冊**的 producer 集合」；ENT0 無法得知未註冊的來源（見 §17.8）。**本包不提供完整的訂閱狀態判定**。
- **重疊、衝突與模型限制（AP-3）**：不強制保留 `CONTRADICTORY` 狀態名稱。必須區分三類，**不得**以「同 key 異內容被拒」推論「所有矛盾都不存在」：(a) **同 key 衝突**——同 `(owner, namespace, upstream_event_id)` 異內容：在 admission 被拒（23505），不進 ledger；(b) **不同 key／producer 的事實**——模型只表示正向權益期間，彼此（包含正常 trial→paid 重疊、同類別不同 producer 的一致事實）一律相容並存，聯集為 Paid 層級並列證據；ENT0 **無法判斷**兩筆相容事實在現實中是否其實互相衝突；(c) **模型不能表示的事件**——取消、退款、作廢與更正：沒有對應的資料型別或 API，ENT0 **不處理**；後發的較短事實**不會**取消較長事實；同 id 更正被拒。本包已對所有「可表示且已儲存」的資料組合逐一核對（事實×事實、事實×coverage、事實×producer 視窗、coverage×producer 視窗）：入庫後不存在互斥而仍被輸出為已知結果的組合——不是因為 (a) 被拒，而是因為上述組合要不是被 admission 條件排除、就是在模型下相容；並以獨立 oracle 對隨機可表示資料比對 `state_at` 輸出（P17）。若日後資料模型新增可表示的否定類別，必須同時定義其衝突處理。
- **Producer 的有效時間與一致性（AP-4，R2 修訂；取代 R1 的「5 秒 commit 上限」）**：`producers(namespace, role_name, registered_at, retired_at)`，有效視窗為閉開 `[registered_at, retired_at)`。R1 的 5 秒上限已被獨立驗收證明可被允許操作繞過（`SET CONSTRAINTS … IMMEDIATE`、`PREPARE TRANSACTION`、guard 之後的 commit 路徑延遲），**已移除，不再有任何依賴交易年齡、提交時間或固定秒數的保證**。一致性改由「同一把鎖＋寫入後蓋章」建立：(1) **registry 鎖**＝資料表 `retention_entitlement.producers` 的資料表鎖。registry 寫入（INSERT／UPDATE／DELETE／TRUNCATE）由 PostgreSQL 自動取得 ROW EXCLUSIVE 或更強的鎖，持有到該交易結束（COMMIT、ROLLBACK、連線中斷、`COMMIT PREPARED`／`ROLLBACK PREPARED`），且只在列已可見**之後**才釋放；因此 `SET CONSTRAINTS`、`PREPARE TRANSACTION`、較晚排隊的 deferred 工作、同步複寫等待，都不能讓寫入的列在鎖仍被持有時被任何 reader 看見，也不能讓 reader 在寫入尚未完成時取得答案。權威 reader（`entitlement_state_at`）與兩個 producer 函式（`admit_entitlement_event`、`advance_entitlement_coverage`）在**判斷任何事情之前**取得同一表的 SHARE 鎖，等待尚未結束的 registry 寫入；(2) **蓋章**：registry 列的有效時間（`registered_at`、首次 `retired_at`）必須不早於 BEFORE trigger（此時寫入者已持有鎖）所讀伺服器時鐘的**下一個整毫秒**（`floor_ms(clock)+1ms`，嚴格晚於該讀數）；INSERT 的 `registered_at` 為 NULL 時由 trigger 以該下界蓋章；明確值早於下界即 `ENT_PRODUCER_RETROACTIVE`（含 R1 的「恰等於交易開始」寫法）；(3) **reader 順序**：取 SHARE 鎖（每一次等待最長＝函式層級 `lock_timeout`，目前 2 秒；**這是每一次等鎖各自的上限，不是整個呼叫的總上限**，見 §17.10）→（**R3 新增，見 §17.15**：對該 owner 在每個已註冊 namespace 的 per-owner advisory 鎖取共享鎖，等待進行中的 admission／coverage advance）→ 取樣伺服器時鐘 → `instant` 晚於該取樣則 `unknown/INSTANT_IN_FUTURE` → 單一敘述解析（新的 READ COMMITTED 快照，必晚於鎖取得）。等不到鎖回 `unknown/REGISTRY_LOCK_TIMEOUT`（永不為 `free`、不是錯誤、不附證據、不改變任何 producer 的必要性）；答案帶 `sampled_at`（取樣時鐘，毫秒）；(4) **入口契約（由函式強制，不是註解）**：只接受 READ COMMITTED，其他隔離級別一律 `ENT_ISOLATION_UNSUPPORTED`（`0A000`）；`entitlement_state_at` 為 VOLATILE（PostgreSQL 不允許 STABLE 函式執行 `LOCK TABLE`，且 VOLATILE 才會在鎖之後取新快照）；(5) **鎖順序固定**：registry 鎖 → per-owner advisory 鎖 →（ENT1）其他；`admit`／`advance` 取不到鎖時以 `55P03` 失敗且不寫入任何列；(6) 事實不得早於 producer 註冊時間（`ENT_EVENT_BEFORE_PRODUCER_REGISTRATION`）；已合法接收的事實不因 producer 退休而消失；registry 列不可刪除，身分與註冊時間不可改。**不在保證內**：superuser／資料表擁有者的刻意操作（`session_replication_role=replica`、停用 trigger、TRUNCATE、直接改 catalog）、伺服器時鐘向後調整、備援（standby）上的讀取、連線池（pooler）語意（皆未驗證，見 §17.14）。成本與可用性見 §17.10。**本 migration 的 registry 為空，且不對任何角色授予 EXECUTE。**
- **答案變化規則與權威答案的穩定範圍（R2）**：允許（資訊補足）：unknown→free／paid（coverage 前進、新事實、退休生效時間到達）；`basis` 由 `trial` 變 `paid_subscription`（仍為 Paid）。不會發生：paid→非 paid（帳號刪除 CASCADE 除外）；來自必要 producer 的新事實改變已證明的 Free（`valid_from ≤ coverage` 被拒，且 admit／advance 以 registry 鎖與 per-owner advisory 鎖串行）。被拒（會使已證明的 Free 失去依據）：晚註冊 producer 回補早於其註冊的事實（free→paid）、回溯的 registry 寫入（free→unknown、unknown→free）、registry 列刪除。**【R3 更正：R2 的下一句對「在退休時間之前通過視窗檢查、reader 回答之後才提交」的 admission 不成立（F1，已重現）；R3 的成立條件與前提見 §17.15】對符合 §17.10 入口契約的呼叫，`free` 與 `paid` 不會被任何之後符合契約的操作推翻**（之後才取得 registry 鎖的寫入，其有效時間必晚於該答案的取樣時鐘；已證明 Free 的 producer 不能再補寫涵蓋該瞬間的事實；Paid 事實不可變）；`unknown` 不承諾，可能變為 `free`／`paid`；這**不是**歷史記錄，帳號刪除（CASCADE）、特權操作與時鐘回撥不在保證內。
- **OQ-1 的語意映射**：(1)(3) 試用期間建立的紀錄，其 `state_at` 為 Paid 層級；trial 到期、coverage 前進不會使該 Paid 答案變回 Free（Paid 事實不可變）。**最終保存期限的決定與持久化屬 ENT1，不在本包。**(2) trial 到期後的新瞬間，在必要 producer 的 coverage 證明下為 `free`，否則 `unknown`；(4) 轉付費是另一筆 `paid` 事實，trial 事實不被修改，重疊期只回一個狀態並列出兩筆證據，本包不計算 E14／E180、不產生任何延長；(5) trial 在帳本中是獨立 `class='trial'`，`basis` 與 `paid_subscription` 可區分，表中沒有任何付款欄位。
- **Producer 身分 = 已註冊的資料庫角色**：函式以 `pg_has_role(session_user, role_name, 'USAGE')` 驗證，字串引數不構成身分。

### 17.3 實際 authority、ACL 與物件

新 schema `retention_entitlement`、sealed owner `consumer_retention_entitlement_owner`（NOLOGIN、NOINHERIT、無 superuser／createrole／bypassrls、無成員）、三張表（`producers`、`entitlement_events`、`entitlement_coverage`；ENABLE＋FORCE RLS；僅 owner policy，無 DELETE policy，無任何 runtime role policy）、三個 SECURITY DEFINER 函式（`admit_entitlement_event`、`advance_entitlement_coverage`、`entitlement_state_at`；`search_path=''`；各自帶函式層級 `lock_timeout='2s'`；`state_at` 為 VOLATILE，因為它必須先取 registry 鎖再取新快照）、三個 SECURITY INVOKER trigger 函式（事實不可更新、coverage 只能前進一個 revision、producer 守衛：身分不可改且只能退役一次、registry 有效時間以持有 registry 鎖之後讀取的伺服器時鐘蓋章為不早於下一個整毫秒、不得回溯、不得刪列；沒有 deferred 或 COMMIT 時檢查；全部共 3 個 trigger）。骨架沿用 R0-B-CAP／foundation：F2 DDL actor、管理邊界、G1 平台 marker 拒絕、builder→owner 角色交接與成員殘留檢查、ACL 清理、G2 scope 不變＋精確 post-state digest（`aa4c8eee8bfb9aa29030ce602a43f58afea81b0c4fcbc9f49e2c957a3f0bd003`（R3；R2 為 `a19b5c2f…3ec5`、R1 為 `14913c95…8536`），外部固定）。Migration 不改任何既有物件（fingerprint 以 proc／class／columns／policy／trigger／constraint／namespace／default ACL／roles／members／event trigger 逐類比對）；不建立 meal_records 上的 trigger；不 backfill；不 purge。

### 17.4 Gates 與結果（**R1 歷史記錄；已被 §17.11（R2）取代**；R1 施工者自測；evidence 在 repository 外 `D:\ent0-r1-20261009\`；**不是 acceptance，等待獨立 reacceptance**）

> **R2 取代聲明**：本節描述 R1 candidate（5944036b）的自測，**保留為歷史**。其中 N17「>5 秒的長交易於 COMMIT 被拒」與「特權 `SET CONSTRAINTS IMMEDIATE` 繞過僅記錄」所依據的 5 秒 commit 上限已被獨立 reacceptance 證明可由被委派寫入者繞過，**已於 R2 移除**；36／36、4 個 trigger、「`state_at` 為 STABLE」等數字與敘述僅對 R1 成立，R2 的數字見 §17.11。

全部於 disposable PostgreSQL 17.6（loopback、fsync=off、template＝142 檔 baseline＋foundation＋capture）執行；每個 gate 一個獨立資料庫並以 `ctx.pre`／`ctx.post` 比對 migration 前後的 catalog fingerprint。

**ENT0 smoke（`consumer-retention-entitlement-smoke.mjs`）36／36**：
- *Positive 17*：P01 空 registry→unknown 從不 Free；P02 paid 閉開區間；P03 Free 只在 coverage 下可證；**P04 OQ-1 trial＝Paid 等級但 `basis=trial`、非付款**；**P05 OQ-1 試用到期且無訂閱→新紀錄 Free（billing coverage 缺→unknown）**；**P06 OQ-1 既有紀錄的瞬間之後不被縮短**；**P07 OQ-1 試用中轉付費不重複延長**；P08 replay 冪等且 digest 獨立計算一致；P09 多 namespace、註冊／退役時窗（晚註冊 producer 的早期事實被拒）；P10 6 輪並行；P11 producer 交易未提交時 reader 看不到半套；P12 exact post-state、sealed role、ACL、policy、4 個 trigger；P13 catalog fingerprint 前後逐類相同＋真實 meal-save RPC 仍成功；P14 帳號刪除移除事實；**P15 恰好註冊／退休瞬間的必要集合邊界（acceptance mutant X01／X02 的有效 detector）**；**P16 三個歷史案例（free→paid、free→unknown、unknown→free）在 registry 變動下答案不變**；**P17 `state_at` 對隨機可表示資料與獨立 oracle 逐一比對（6060 筆，0 差異）**。
- *Negative 18*：N01–N12 如前（N10 的時鐘讀取清單改為 state_at 1／admit 2／advance 3／guard 1，`transaction_timestamp` 僅限 registry 守衛；N12 的 fault anchor 改為 deferred constraint trigger）；**N13 producer 不得對註冊前發言（恰等於可、少 1 ms 拒、跨越拒、replay 不受影響）**；**N14 registry INSERT／UPDATE／DELETE 各自獨立的負向／正向控制**；**N15 授權隨有效視窗（未生效即 42501、生效後可；未來退休到期前可作業、到期後 42501，含 replay；退休前的事實保留）**；**N16 不可表示的事件不被默默處理（無取消／退款 API、同 key 更正被拒、較短後發事實不取消較長事實、到期＝不續約）**；**N17 registry 交易長度與守衛恰好邊界（恰等於交易開始可、少 1 ms 拒、>5 秒的長交易於 COMMIT 被拒；特權 `SET CONSTRAINTS IMMEDIATE` 繞過僅記錄、不入裁決）**；**N18 並行與 lock 順序（等鎖後越過退休時間的呼叫被拒；跨退休時間的並行 admit 全部符合視窗；未提交的 coverage advance 讓並行低於 coverage 的 admit 等待後被拒）**。
- *F01* frozen scope／inventory：state `ent0`、145 檔 migration、`changedBaselineMigrations=0`、migration sha256 與外部 pin 相符。

**Regression（同一 R1 candidate）**：recovery smoke＋PG 40／40；recovery guard 85／85；capture smoke 28／28；capture mutations 24／24；persistence smoke 83／83（含 IF14、N16 於 `ent0`）；persistence mutations 127／127；c5-b2／c5-r5 smoke exit 0；b2-b smoke 42／42；b2-b guard main 38／50 與 detached HEAD 37／50 分開記錄（兩種狀態下 base 與 R1 的失敗 identity 逐項相同，只有內嵌的 migration 計數與最新檔名不同）；`tsc` `apps/mobile` exit 0；差分僅重跑受影響子集（skipped 與兩側提前中止＝未驗證，不計 parity）。

### 17.5 Mutation 控制與誠實分類（**R1 歷史記錄；已被 §17.12（R2）取代**）

> **R2 取代聲明**：本節的 80 個 mutants、75／4／1 分類與 Y100／Y101（5 秒 commit 上限）屬 R1；R2 的 mutant 處置見 §17.12（80 個逐一處置：保留、重新錨定、轉換、退役，並新增 R2 行為 mutants）。

`consumer-retention-entitlement-mutations.mjs` 對**真實 migration SQL** 施加單點缺陷（共 **80** 個），先在乾淨資料庫上 raw apply：被 `ENT_POST_STATE_MISMATCH` 擋下者以觀測到的 digest 重新固定後安裝（66 個），再於安裝後的資料庫上執行指定 gate；setup 錯誤一律 BLOCKED，不算偵測。分類（每個 spec 預先宣告 `expect`）：

- **行為偵測 75**（指名的 primary gate 失敗）：原有 60 個（OQ-1 專屬 7、unknown 被推定 Free 4 個變形、跨 owner 洩漏、區間邊界、producer 身分、權限／ACL、digest、replay、coverage／event 邊界、trigger、unique key、advisory lock、毫秒 CHECK、auth.users FK、predecessor 保護、migration 前置條件與 G2）＋R1 新增 15 個（Y90–Y104：註冊前發言、授權忽略註冊起點、未來退休提前關閉授權、回溯註冊、回溯退休、刪列、**退休邊界 `<=`（acceptance X01）、註冊邊界 `<`（acceptance X02）**、guard 只管 UPDATE、**授權視窗在呼叫開始而非持鎖時判斷**、移除 COMMIT 交易長度檢查、長度檢查放寬為 1 小時、守衛拒絕恰等於交易開始、事實起點恰等於註冊被拒、**還原原核准順序（AP-2 反轉）**）。
- **migration 自身 guard 擋下 4**（**不**計為行為偵測）：`Y43`（builder role 殘留）、`Y70`／`Y71`／`Y72`（meal_records trigger、meal-save RPC、predecessor ACL 被改→`ENT_POST_GUARD_DRIFT`）。
- **等價 green control 1（不計為 killed）**：`Y60` 移除 `advance_entitlement_coverage` 內「回退」檢查——`coverage_guard` trigger 以相同 SQLSTATE 與訊息擋下，行為不可觀測地等價（縱深防禦）；`Y61` 同時移除兩層後由 N06 殺死。

X01／X02 在驗收時存活的原因是**沒有任何 gate 在恰好的註冊／退休瞬間探測**（mutation 確實改到有效 source，結果在邊界瞬間不同）；R1 以 P15 補上有效 detector，二者現在由 P15 殺死，不再以未觸及的 gate 當通過。

### 17.6 successor 相容性（三個 validator）

三個 validator 各只做 exact-once 錨點的 successor 調整，**不刪任何 assertion**，三者的 bytes 由外部審查、patch、hashes、controls 與 committed diff 綁定：

1. `consumer-retention-persistence-smoke.mjs`：新增 `ENT0_MIGRATION`／`ENT0_MIGRATION_SHA256` 與 `ENT0_FILES`（migration、ENT0 smoke、ENT0 mutations 的 mode＋blob）、`ENT0_RECOVERY_OVERRIDES`（修正後 recovery guard 的 blob）與 `ent0FilesState`；`baseline()` 接受「143 檔」「144 檔（含 capture）」或「145 檔（再加上唯一固定 sha256 的 ENT0 migration，且為最後一檔）」；`recoverySuccessorState` 新增 `ent0` 狀態，並以 wrapper 強制 **all-or-nothing**（ENT0 檔無 ENT0 record、ENT0 record 無檔案、任一檔 bytes／mode／index 不符皆 `invalid`）；`frozen()` 候選白名單加入三個 ENT0 新路徑。
2. `consumer-retention-capture-smoke.mjs`：F01 在 `ent0` 狀態接受 145 檔與 `[capture, ENT0]` 兩個新路徑；frozen proof 只在 `ent0` 狀態准許三個 ENT0 路徑（其他狀態維持 violation）。
3. `consumer-meal-save-recovery-guard.mjs`：新增 `ENT0_PATHS`（4 路徑）；inventory／server-path／migration-count 三項檢查的**名稱不變**、條件改為 successor-aware；新增 1 項 all-or-nothing 檢查。

**綁定方向為單向**：persistence smoke 釘住 ENT0 三檔與 guard 的 blob；guard 只以路徑綁定；ENT0 smoke／mutations 只 import helper（程式碼 import，不記錄任何 hash）；沒有任何檔案記錄 persistence smoke 或自身的 hash（`binding-controls` 的 structural 檢查為證）。

### 17.7 相對原核准提案的契約修訂（逐項揭露；批准：Owner AP-1…AP-5，2026-10-10 授權施工；批准原文由實作者保存於外部紀錄）

下列是**契約修訂**，不是實作細節；它們**不**被 OQ-1 自動涵蓋：

1. **AP-1 `valid_until` 必填，有限區間。**用途是事實自足（見 §17.2）。`NOT NULL` **不能**防止永久或不合理超長的 Paid；本包**不制定** billing 期限上限；期限合理性由未來 ENT-F 保證。事實到期不續發＝「到期不續約」，**不代表**即時取消、退款或作廢。
2. **AP-2 正向 Paid／trial 事實獨立證明本包定義的保存權益層級；coverage 用於證明 Free。**這是對原判定順序（coverage 不足先於 Paid）的明確修訂。理由：資料模型沒有否定類別；Paid 誤判的代價是過度保存而非資料遺失。
3. **AP-3 不強制保留 `CONTRADICTORY` 狀態名稱。**正常 trial→paid 重疊與相容的正向事實共存。必須區分：同 key 衝突（admission 即拒）／不同 key 或 producer 的相容事實（共存，ENT0 無法判斷其現實衝突）／模型不能表示的取消、退款、作廢與更正（**不處理**）。本包**不提供完整訂閱狀態判定**，不把未表示的事件視為已處理；「同 key 異內容被拒」**不**構成「所有矛盾都不存在」的理由（§17.2 逐一列舉了可表示資料的組合）。
4. **AP-4 producer 有效區間與 DB 硬化（R2 修訂；Owner 已批准其產品行為：有限等待、無法取得一致資料時 unknown、admission／coverage 失敗且不寫入、不得 Free、不縮短 grant、不 purge）**：`[registered_at, retired_at)`；事實不得早於 producer 註冊時間；registry 不得回溯、不得刪列；future retirement 到期前的合法作業保留；已合法接收的事實不因退休而消失。**R1 的「5 秒 commit 上限」被取代**：它可被 `SET CONSTRAINTS … IMMEDIATE`（不需 superuser，被委派的寫入者即可）、`PREPARE TRANSACTION` 與 guard 之後的 commit 路徑延遲繞過，且「5 秒＋提交延遲」沒有可證明的上限。R2 的契約是 registry 鎖＋寫入後蓋章＋reader／admission 入口契約（§17.2、§17.10）。**這逆轉了本包先前 smoke（P09）的行為——晚註冊 producer 的早期事實不再被接受。**
5. **AP-5 下游契約**：registry 完整性封存及必要來源契約完成前，ENT1 不得把 provisional `free` 當成最終完整事實。**Free 本身不授權 purge**；ENT0 不建立保存 grant、不縮短既有 grant、不作到期收合或刪除。

與原核准提案**一致**、不需另行批准：已記錄的事實不論其 producer 當下是否仍「必要」都計入（退役 producer 的事實仍成立；「必要」集合只決定 Free 的 coverage 要求）；`owner_user_id` 以外鍵綁 `auth.users(id)` 並 `ON DELETE CASCADE`（提案 `03` §4.1、`02` §5、P14）。

另：Recovery guard 的靜態檢查名稱全數保留，條件改為 successor-aware，另新增 1 項 all-or-nothing 的 ENT0 檢查（R1 未再修改）。

### 17.8 殘餘空窗、限制與後續依賴

- **沒有 producer**：registry 為空、無人可 EXECUTE。真實付款／trial／升級 producer（ENT-F）、status 語意（STATUS-F）、trial 開始／結束的可信來源、grant／E14／E180 計算與 R0-C 顯示接線均為後續依賴；本包不產生 grant，也不推定 Free 或 Paid。
- **Hosted 前提未驗證**：PostgREST 的 `session_user` 是 `authenticator`，因此 billing producer 必須是**直連的專用資料庫角色**；Hosted 的角色拓撲與 `session_user` 行為屬後續 Hosted 階段證據。本 migration 與其他 R0-B 系列一樣拒絕在任何平台 marker 的環境套用。
- superuser／管理者可繞過 trigger 與 RLS、DELETE 或 TRUNCATE（需特權）；sealed owner 可 TRUNCATE 但不可登入且無成員。`session_replication_role=replica` 可繞過 trigger（需特權）。
- 解析仍為**單一 SQL 敘述**（單一 snapshot，無第二次讀取）；其快照取得點在 registry 鎖與時鐘取樣**之後**，此順序由 registry 寫入者在讀取途中開著、reader 先建立快照再等待、`PREPARE TRANSACTION`、同步複寫停滯等時序注入證明（N17、N19–N23），不是只靠靜態檢查（P13 仍檢查敘述結構）。
- Retention 仍 inactive；R0-B foundation、capture 與本包均未部署到 Hosted；法律 **DRAFT／NOT ACTIVE**。
- **來源完整性不在本包（AP-5）**：`free` 只代表「依已註冊的 producer 集合，無事實且 coverage 完整」。ENT0 沒有「registry 已完整」的證明；在 registry 完整性封存（ENT-R）及必要來源契約（ENT-F）完成前，ENT1 不得把 provisional `free` 當成最終完整事實。`free` 本身**不授權** purge，ENT0 也不建立／縮短保存 grant、不作到期收合或刪除。
- **ENT1 的最低要求與邊界（R2）**：(1) 以 §17.10 的入口契約呼叫 `entitlement_state_at`（READ COMMITTED、直接呼叫，不包在 STABLE／IMMUTABLE 函式或視圖中），並在解析當下持久化 tier、basis、`sampled_at`、T0（複製自 anchor）、證據 event id 與 namespace、各必要 namespace 的 coverage revision、必要 producer 清單與 policy 版本；(2) `unknown`（含 `REGISTRY_LOCK_TIMEOUT`）一律不核發 grant、不縮短或重設既有 grant、不得視為 Free，稍後重試；(3) 不得以任何經過時間、固定等待或 settle margin 判斷「資料已完整」——**不存在可證明的 margin**；(4) 之後的 `state_at` 只用來偵測升級（Paid 事實涵蓋 T0）並延長至原 T0＋180 天，結果變為 `unknown` 或不同只作為 provenance 漂移警示，**不得縮短或重設**；(5) 鎖順序 registry 鎖 → per-owner → 其他，且 registry 寫入交易不得先呼叫權威函式（兩個各持 SHARE 的交易再寫 registry 會死結，PostgreSQL 回 `40P01`）。**本包不宣稱「解析與 grant 持久化分屬不同交易（split transaction）時 grant 的建立」已被證明**：N23 的 ENT1 持久化模型只證明所列排程與前提下，模型內被持久化的 free／paid 答案與最終狀態一致；ENT1 本身（持久化內容、封存、provenance）與 registry 完整性封存（ENT-R）尚不存在，仍是後續依賴。**以下四件事彼此獨立，不得互相替代**：① registry 在解析當下的一致性（本包處理）；② fact／coverage 的完整性（事實來源是否已齊備；ENT0 沒有此證明）；③ 歷史答案是否可變（`unknown` 可變；`free`／`paid` 不被符合契約的後續操作推翻；不是歷史記錄）；④ 未來 grant 的證據與封存（ENT1）。provisional `free` 永遠不是 grant 核發或 purge 的最終依據。
- **無撤銷／更正路徑**：錯誤或事後不可信的事實不可由自動路徑更正；由特權帳號帶外處理，已核發 grant 不縮短。
- **退休前須補齊 coverage**：producer 在 `retired_at` 之後不能再 `advance`；其 `[最後 coverage, retired_at)` 內的 instant 若未補齊會永遠 `unknown`（保守）。退休應以未來日期安排，並在到期前把 coverage 推到退休時刻。
- **時鐘依賴（R2）**：蓋章下界、`INSTANT_IN_FUTURE` 判斷與 producer 授權視窗都使用伺服器牆鐘 `clock_timestamp()`；保證假設牆鐘不向後跳（時鐘步進回撥不在保護內，未驗證）。沒有任何檢查使用 `transaction_timestamp()` 或交易年齡；R1 的「COMMIT 時交易不超過 5 秒」及其「`SET CONSTRAINTS … IMMEDIATE` 為特權繞過（superuser-only）」的說法**已撤回**（非 superuser 的被委派寫入者即可執行，已於 R1 reacceptance 驗證）。
- `entitlement_state_at` 為 `VOLATILE`（必須如此：PostgreSQL 不允許 STABLE 函式執行 `LOCK TABLE`，且 VOLATILE 才會在鎖之後取新的快照；`admit`／`advance` 亦為 VOLATILE 並先取 registry 鎖）。
- 本 migration 尚未匯入或部署到任何非拋棄式資料庫，因此**沒有就地升級路徑**：若任何拋棄式資料庫曾套用過先前的 ENT0 candidate，須整庫丟棄重建；對已存在 `retention_entitlement` schema 或 sealed role 的資料庫，本 migration 以 `ENT_ALREADY_PRESENT` 拒絕（N11f／N11g）。
- **R3 補充**：呼叫者自己的未提交 registry／fact／coverage 寫入對其後的權威呼叫可見，這樣的答案不是已提交證據，不得在該交易之外被持久化或當成 grant 依據；「Free」的完整前提與 reader 對進行中 admission 的等待見 §17.15。ENT0 不提供不可變歷史，不提供 ENT1 的 split-transaction 安全，也不提供 registry 封存；provisional `free` 永遠不是 grant 核發或 purge 的依據。
- 本節之後的 commit、post-commit 結果只追加於外部報告，不再改寫本文件 bytes。

### 17.9 Source bindings 與 fresh／reused（**R1 歷史記錄；已被 §17.13（R2）取代**；R1 施工者自測；不是 acceptance）

- Fresh（對 R1 最終 tree）：ENT0 smoke 全部（含 F01 於 clean committed）、ENT0 mutations 全部、recovery smoke＋PG、recovery guard、capture／persistence smoke 與 mutations、binding controls（歷史狀態、正向／負向、meta-mutant）、frozen proof、受影響子集差分、b2-b guard 兩種 branch 狀態、`tsc`。
- Reused（附理由）：未變 source 的有效證據：R0-A policy smoke／mutations、c5／b2-b smoke 的先前通過結果僅作對照，本輪仍已重跑；298 支差分的歷史分類（驗收報告 §4.5）沿用其「分類方法與結論」而不重跑全集，理由是 R1 只改 ENT0 自身五個檔案、不改它們的輸入面。
- Candidate 位於 repository 外的隔離 clone；原 ENT0 candidate（626f0808）未被修改或覆蓋，R1 為其子 commit；**未 push、未對原 repository commit 或 git am**；最終 commit SHA、tree、bundle 與雜湊記載於外部施工報告（本文件不記錄自身所在 commit）。

### 17.10 R2 一致性契約：誰取什麼鎖、答案保證到哪裡、成本（R2 修訂；產品行為已獲 Owner 批准，施工與自測見 §17.11–§17.14，等待獨立 reacceptance）

- **同一把鎖**：只有一個 registry 鎖＝資料表 `retention_entitlement.producers` 的資料表鎖。**寫入者**（registry INSERT／UPDATE／DELETE／TRUNCATE）自動持有 ROW EXCLUSIVE 以上直到交易結束；**權威 reader**（`entitlement_state_at`）與 **admission**（`admit_entitlement_event`、`advance_entitlement_coverage`）持有 SHARE 直到**呼叫者的交易**結束。**【R3 取代：此結論對「已退休但仍有進行中 admission」的 producer 不成立，reader 必須等待 per-owner 鎖；見 §17.15】**facts／coverage 資料表**不需要**額外同步：同一 owner×namespace 的 admit／advance 由既有 per-owner advisory 鎖串行，且 `valid_from ≤ coverage` 的事實被拒，所以已證明的 Free 不會被之後的事實推翻。
- **生命週期與順序**：registry 鎖在 COMMIT、ROLLBACK、連線中斷（含被終止）、`COMMIT PREPARED`／`ROLLBACK PREPARED` 時釋放，且寫入列先可見、後釋放鎖；已 PREPARE 的寫入交易持續持有鎖（reader 等待直到其結局或 `lock_timeout`）。固定順序 registry → per-owner → 其他；逆序造成的循環由 PostgreSQL 偵測（自動重排或 `40P01`），不會無聲逾時。
- **快照**：reader／admission 在鎖之後的每個命令取新的 READ COMMITTED 快照；其他隔離級別一律拒絕（`ENT_ISOLATION_UNSUPPORTED`）。**唯讀交易可呼叫**（SHARE 鎖在唯讀交易中可取得）；備援上的行為未驗證。
- **時間**：蓋章下界 `floor_ms(clock)+1ms`（寫入者，鎖之後）；reader 取樣微秒時鐘（鎖之後）；`registered_at`／`retired_at` 與 T0 同為毫秒精度；`instant ≤ 取樣` 才解析。任何已完成取樣的 reader 之後才取得 registry 鎖的寫入，其有效時間嚴格晚於該 reader 能解析的任何 `instant`，沒有取整空窗。
- **`lock_timeout` 的語意（每一次等待，不是整個呼叫）**：三個函式各帶 `SET lock_timeout='2s'`，它對函式內**每一次**等鎖（registry 鎖、per-owner advisory 鎖、`FOR UPDATE` 列鎖）**各自**計時；**不是整個呼叫的時間上限**。N22 證明：兩段各約 1.4 秒的等待使一次 admission 的總耗時超過 2 秒而仍成功；第二段等待本身超過 2 秒則 `55P03` 且不寫入任何列。函式層級的 SET 在呼叫結束（成功、`55P03`、其他例外、savepoint 回滾）時由 PostgreSQL 還原為呼叫者原值，**不污染呼叫者的 `lock_timeout`**（N22(d) 逐一驗證成功／逾時／例外／savepoint／`SET LOCAL` 後的值）。reader 的逾時被轉成 `unknown/REGISTRY_LOCK_TIMEOUT`；per-owner 與列鎖逾時仍是 `55P03`。
- **SHARE 的持有時間與呼叫者成本**：SHARE 持有到**呼叫者交易結束**（**R3 更正：限於該呼叫所在、未被回滾的（子）交易；位於被 `ROLLBACK TO SAVEPOINT` 回滾的 savepoint 或被捕捉例外的 EXCEPTION 子交易內時，registry SHARE 與 per-owner 鎖隨之釋放，見 §17.15**），不是到函式返回。呼叫者在權威呼叫之後讓交易保持開啟，會讓 registry 寫入者一直等（寫入者沒有函式層級逾時，需自行設 `lock_timeout`，或由伺服器設 `idle_in_transaction_session_timeout`）；已排隊的寫入者又會讓之後到達的 reader 也排隊（公平佇列）。N23(c) 驗證 SHARE 持有至呼叫者交易結束、COMMIT 後釋放。因此 ENT1 的解析交易應保持短；ENT0 不替呼叫者決定其交易長度。
- **保證到哪裡**：見 §17.2「答案變化規則與權威答案的穩定範圍」。**不是歷史記錄；不是對特權操作的保證。**
- **ENT1 前置條件與邊界**：見 §17.8「ENT1 的最低要求與邊界（R2）」。ENT0 不實作 ENT1、不建立 grant、不核發任何權益；**不宣稱 split-transaction 的 grant 建立已被證明**。
- **timeout 的安全結果**：reader 等不到鎖 → `unknown/REGISTRY_LOCK_TIMEOUT`（不是 `free`、不核發 grant、不縮短既有 grant、不取消任何來源的必要性）；admission／advance 等不到鎖 → `55P03`，不寫入任何列（N22：事件、coverage、producer 列數前後相同）。
- **成本（不隱瞞）**：(a) reader 與 admission 會等待任何尚未結束的 registry 寫入（含不同 owner 的），每一次等待最長＝函式層級 `lock_timeout`（2 秒），逾時 reader 得 unknown、admission 得 `55P03`；(b) 已排隊的 registry 寫入會讓之後到達的 reader 排在其後（公平佇列），上限同為持有者交易長度與 `lock_timeout`；(c) VACUUM／ANALYZE／CREATE INDEX 類（SHARE UPDATE EXCLUSIVE）對 registry 表的鎖會讓 reader 等待至逾時；(d) 持有 registry 表 SHARE 的長交易會阻塞 registry 寫入；(e) 擁有 registry 表授權的主體可持有鎖造成不可用（結果是 unknown，不是錯誤答案）；(f) 無競爭時延遲與 R1 同量級（design 輪於本機拋棄式 PG 17.6 量測 state_at p50：R1 0.41 ms、R2 0.42 ms；8 條並行 reader 吞吐相同；R2 施工輪未重新量測）。registry 預期是低頻、受管制的寫入。
- **§17.15(c) 歷史文字（已被 Owner D-1 取代，2026-10-11；保留供稽核）**：(c) **兩個呼叫者交易若都先呼叫 `entitlement_state_at`（取得 shared）、再對同一 owner／namespace 呼叫 `admit_entitlement_event`（要求 exclusive 升級）會互相等待，PostgreSQL 回 `40P01`（一方被中止）**；因此 admit／advance 的呼叫者交易不得先在同一交易內對同一 owner 呼叫權威 reader（N25(f) 以真實死結驗證：恰一方成功、另一方 `40P01`、無資料遺失、不 hang）。ENT1 的解析交易應與 producer 的寫入交易分開、且保持短。

### 17.11 R2 Gates 與結果（**R3 補充：R2 的 N19–N23 未涵蓋「進行中 admission 對已退休 producer」的案例，由 R3 的 N24／N25 補上，見 §17.16**；R2 施工者自測；evidence 在 repository 外 `D:\ent0-r2-impl-20261010\`；**不是 acceptance，等待獨立 reacceptance**）

全部於 disposable PostgreSQL 17.6（loopback、fsync=off、`max_prepared_transactions=8`、template＝142 檔 baseline＋foundation＋capture）執行；每個 gate 一個獨立資料庫。

**ENT0 smoke（`consumer-retention-entitlement-smoke.mjs`）41／41**＝17 positive＋23 negative＋1 supplementary（F01）。**與 R1 的計數差**：R1 的「36」＝17 P＋18 N＋1 F01；R2 提案中的「35」只算 P＋N（17＋18），不含 F01；R2 為 17 P＋23 N（新增 N19–N23）＋F01＝41。
- 重寫的 8 個 gate（舊斷言→新斷言→理由）見外部報告 `report/gate-rewrite-table.md`：P12（trigger 數 4→3、無 deferrable、三個定義者函式 `lock_timeout=2s` 且皆 VOLATILE）、P16（三個歷史案例改以 registry 守衛的 R2 行為驗證）、N10（時鐘讀取清單：guard 以 `clock_timestamp` 讀、不再有任何函式讀 `transaction_timestamp`／`statement_timestamp`；一個 resolver 敘述＋前置的鎖／取樣）、N12（fault anchor：不再有 deferred constraint trigger，改以 `producer_guard`）、N14（以長期註冊的列驗證回溯退休，NULL 蓋章、明確 now 被拒）、N15（授權視窗隨有效時間；NULL 蓋章）、N17（5 秒 commit 上限→「蓋章在持鎖之後」：蓋章試驗、邊界、長交易、`SET CONSTRAINTS` 各模式與切換、持鎖等待之後蓋章）、N18(a)（lock-order 的等待改為約 1.3 秒，使整個等待落在每次 2 秒的 `lock_timeout` 之內）。
- 新增 N19–N23（S01–S17 的時序行為）：**N19** reader 等待開著的 registry 寫入且不得答錯（`SET CONSTRAINTS ALL IMMEDIATE`／模式切換、guard 之後的慢 deferred 工作、writer 對 reader 取樣的順序與 `INSTANT_IN_FUTURE`／持鎖後取樣、timeout→`unknown/REGISTRY_LOCK_TIMEOUT`、rollback、被終止的寫入者、被取消的 reader、60 次提交／可見／取樣順序試驗）；**N20** `PREPARE TRANSACTION`／`COMMIT PREPARED`／`ROLLBACK PREPARED`（2 秒與 20 秒兩種逾時）與同步複寫停滯（COMMIT 卡在 guard 之後，reader 仍等待、不在列可見之前回答）；**N21** 三個函式拒絕 REPEATABLE READ／SERIALIZABLE 且無部分寫入、先前 SELECT、唯讀、STABLE 包裝、同一敘述先建立快照；**N22** admission／coverage 與 registry 寫入（等待後成功；逾時 `55P03` 無部分寫入；未提交的退休；每次等待各自計時；`lock_timeout` 不污染；identity 先於鎖）；**N23** 三個歷史案例仍被拒、鎖順序（合規順序無死結、反序不 hang、兩個持 SHARE 再寫 registry 的交易死結被偵測）、SHARE 持有至呼叫者交易結束、含 backend 終止／rollback／2PC／`SET CONSTRAINTS` 的隨機壓力與 ENT1 持久化模型（同交易與分交易寫入的 free／paid 答案皆與最終狀態一致）。
- S01–S17 對應：S01→N19(a)；S02→N19(b)；S03→N17(4)、N19(d)；S04→N19(c)；S05→N20；S06→N20；S07→N21；S08→N19(d,d2)；S09→N22(a)；S10→N19(e)；S11→N17；S12→N23(a)；S13→N22(b)；S14→N21(b)；S15→N23(b)；S16→N23(d)；S17→N19(f)。

**Regression（R2 最終 bytes）**：recovery smoke＋PG 40／40；recovery guard 85／85；capture smoke 28／28；capture mutations 24／24；persistence smoke 83／83（含 IF14、N16 於 `ent0`）；persistence mutations 127／127；c5-b2／c5-r5 smoke exit 0；b2-b smoke 42／42；policy smoke／mutations exit 0（27 個 mutation controls）；`tsc` `apps/mobile` exit 0。計數與 R1 相同；差別僅在被釘住的 ENT0 bytes（migration sha256 `fa05867b…29a6`）。b2-b guard 的 main／detached 兩種分支狀態與 R1 比對的 failure identity、17 支受影響差分與 clean committed 的重跑，為 commit 之後才能取得的結果，只記載於外部施工報告（本文件不改寫自身 bytes）；skipped 與兩側提前中止＝未驗證，不計 parity。

### 17.12 R2 Mutation 控制與處置

`consumer-retention-entitlement-mutations.mjs` 現有 **95** 個 spec（R1 的 80 個逐一處置＋新增 17 個行為 mutants）；raw apply 先看 migration 自身 guard，被 `ENT_POST_STATE_MISMATCH` 擋下者以觀測 digest 重新固定後安裝（81 個），再於安裝後的資料庫執行指定 gate。**分類（每個 spec 預先宣告 `expect`；digest／guard 拒絕與行為偵測分開）**：行為偵測 90（指名的 primary gate 失敗）；migration 自身 guard 擋下 4（Y43、Y70、Y71、Y72；預先宣告為 `any`，**不**計為行為偵測）；等價 green control 1（Y60，不計為 killed）。
- **R1 的 80 個處置**：保留 71（spec 與 anchor 不變；其中 Y98 的 detector 清單移除 P16：沒有 INSERT guard 時 NULL 蓋章的登錄違反 NOT NULL，P16 連 fixture 都建不起來，那是 setup 失敗＝BLOCKED、不是偵測；Y98 仍由 N14 以行為殺死）、重新錨定 5（Y18、Y38、Y39、Y93、Y94；原因：蓋章改以 `v_bound`／`v_sampled` 與函式標頭新增 `lock_timeout`）、轉換 2（Y40：STABLE→VOLATILE 的方向反轉，改為把 VOLATILE 降為 STABLE，PostgreSQL 因 `LOCK TABLE` 而拒絕，行為上無法回答；Y102：改為「恰等於下界被拒」，因而也會拒絕所有 NULL 蓋章）、退役 2（Y100、Y101：不再有 COMMIT 時 5 秒 trigger；缺陷類別由新的 Y120「重新引入 COMMIT 時下界」涵蓋）。Y96／Y97（acceptance mutants X01／X02）原樣保留，仍由 P15 殺死。逐項表見外部報告 `report/mutation-disposition.md`。
- **新增 17 個 R2 行為 mutants**（Y110–Y126：reader／admission／advance 的鎖移除或過弱、三個隔離檢查移除、蓋章來源錯誤（交易開始／語句開始／非下一毫秒）、重新引入 COMMIT 時下界、timeout 回報 Free／未被捕捉、逾時過長、取樣在鎖之前、鎖在身分檢查之前），**每個都由指名的行為 gate（N17、N19、N21、N22）偵測，不是 digest 或 guard 拒絕**。
- 存活 mutant：0。

### 17.13 R2 Source bindings 與 fresh／reused（R2 施工者自測；不是 acceptance）

- **Source bindings（單向，無 self-hash；機制與 R1 相同）**：persistence smoke 釘住 {ENT0 migration sha256 `fa05867b…29a6`、migration blob `804e760f…`、ENT0 smoke blob `21276816…`、ENT0 mutations blob `30dbdc10…`、recovery guard blob（未變）}；recovery guard 與 capture smoke 不含任何 ENT0／persistence blob；ENT0 smoke／mutations 只做程式碼 import；Doc 05 只由 guard 以路徑綁定。本包**沒有**新增任何綁定方向，也沒有修改三個 successor validator 中除 persistence smoke 之外的兩個（capture smoke、recovery guard 的 bytes 與 R1 相同）。
- **Fresh（對 R2 最終 bytes）**：ENT0 smoke 41／41（最終 bytes 各一次於 staged tree，另於 clean committed tree 重跑；先前 bytes 的 3 次連續全跑 3／3 通過，首次全跑的 N20 失敗見外部報告「事件與偏差」）；ENT0 mutations 95／95 符合預期；recovery smoke＋PG、recovery guard、capture／persistence smoke 與 mutations、c5／b2-b smoke、policy smoke／mutations、`tsc`（皆為 staged tree 上最終 bytes）；binding negatives、frozen proof、diff／encoding／secret 檢查、b2-b guard 兩種分支狀態與受影響差分於 commit 之後（外部報告）。
- **Reused（附理由）**：R1 reacceptance 對**未被 R2 改動**的輸入面所做的驗證（baseline 側 recovery guard 84／84、capture 28、persistence 83、recovery smoke 40；298 支歷史差分的分類方法與結論）——R2 只改 R1 的同五個檔案，不改它們的輸入面；PG 17.6 二進位複本（sha256 與驗收輪相同）；AP-1／AP-2／AP-3／AP-5 的行為由 P01–P17、N01–N16 在 R2 bytes 上**重新執行**（不是沿用）；design 輪的 prototype 探針（7f0be372）**不當作 acceptance 證據**，其 S01–S17 全部由本輪新的正式 gates 取代。
- Candidate 位於 repository 外的隔離 clone（原 ENT0 candidate 626f0808 與 R1 candidate 5944036b 皆未被修改，R2 為 5944036b 的子 commit）；**未 push、未對原 repository commit／stage／git am**；最終 commit SHA、tree、bundle 與雜湊記載於外部施工報告。

### 17.14 R2 證明邊界、假設與未驗證清單（**R3 補充：其中「free／paid 不被推翻」的範圍以 §17.15 為準**）

- **已證明（本機拋棄式 PG 17.6，所列排程與前提）**：§17.11 的時序行為；`lock_timeout` 每次等待各自計時且不污染；SHARE 持有至呼叫者交易結束；三個歷史案例仍被拒；在 N23 的模型與排程內，被持久化的 free／paid 答案與最終狀態一致。
- **不宣稱**：split-transaction 的 grant 建立已被證明；ENT1 的證據與封存；registry 完整性（ENT-R）與必要來源契約（ENT-F）；fact／coverage 的完整性；任何超出所列排程的組合。provisional `free` 不是 grant 核發或 purge 的最終依據。
- **假設／未驗證**：伺服器牆鐘不向後跳（未驗證；回撥不在保護內）；備援（standby）上的讀取（`LOCK TABLE` 在恢復中不可用，預期失敗而非回答，未驗證）；連線池（pooler／PgBouncer transaction mode）對隔離級別、`SET LOCAL`、advisory 鎖與交易邊界的語意（未驗證）；Hosted PostgreSQL 的角色拓撲與 `session_user`（未驗證）；superuser／資料表擁有者的刻意操作、`session_replication_role=replica`、停用 trigger、TRUNCATE、直接改 catalog（不在保證內）；帳號刪除 CASCADE 會移除事實（不在穩定保證內）；效能量測沿用 design 輪結果，R2 施工輪未重新量測。

### 17.15 R3 修訂（F1）：進行中的 admission 必須先被 reader 等待——契約、鎖順序與 Free 的前提（R3 修訂；施工與自測見 §17.16–§17.19，等待獨立 reacceptance）

**缺陷（R2 獨立驗收 F1，已重現）**：R2 的 reader 只在 registry 表上取 SHARE。producer 的**排定退休**（`retired_at` 設在未來）到期不需要任何 registry 寫入，所以 registry 鎖無法排序它。一個在退休時間**之前**通過視窗檢查、寫入了事實但**尚未結束交易**的 admission，其事實對 reader 的快照不可見；reader 以「該 producer 已退休、不再必要」回答 `free`，之後該 admission COMMIT（或 `COMMIT PREPARED`），同一 `(owner, instant)` 變成 `paid`。R2 §17.10 的「facts／coverage 不需要額外同步」與 §17.2 的「`free` 不會被之後符合契約的操作推翻」**對這個案例不成立，已撤回**（歷史文字保留並標註取代）。仍必要的 producer 沒有此問題（其 coverage advance 與 admission 在同一把 per-owner advisory 鎖上串行）。

**R3 的最小同步（沿用既有的 per-owner 機制，不新增物件、不新增 ACL）**：`entitlement_state_at` 在取得 registry SHARE 之後、取樣時鐘之前，依 namespace 的固定順序（`COLLATE "C"`）對該 owner 在**每一個已註冊 namespace**（含已退休者）取 **共享（shared）** 的 per-owner advisory 鎖（鍵＝`owner:retention_entitlement:namespace`，與 admit／advance 取的 exclusive 鎖同一把）。進行中的 admission／coverage advance 持有該 exclusive 鎖直到其交易結束（COMMIT、ROLLBACK、連線中斷、`COMMIT PREPARED`／`ROLLBACK PREPARED`；`PREPARE TRANSACTION` 之後仍持有），所以 reader 會等到它們結束，才取樣時鐘並以新的 READ COMMITTED 快照解析。shared 與 shared 相容：同一 owner 的多個 reader 不互相阻塞；不同 owner 的鍵不同，完全不受影響；registry 鎖已被持有，所以 namespace 清單在走訪期間不會改變。

- **鎖順序**：registry SHARE → per-owner advisory（namespace 順序）→ 取樣時鐘 → 單一敘述解析。admit／advance 的順序同為 registry SHARE → per-owner exclusive。**取樣時鐘與快照都在等待之後**：reader 回答的 `sampled_at` 不早於所有被等待的 admission 的結局；等待期間提交的事實可被解析敘述看見。
- **結局**：admission COMMIT／COMMIT PREPARED→reader 看見事實，回 `paid`；ROLLBACK／ROLLBACK PREPARED／被終止→事實不存在，reader 回 `free`（若 coverage 足夠）；等待超過函式層級 `lock_timeout`（2 秒，**每一次等待各自計時**）→ `unknown/OWNER_LOCK_TIMEOUT`（永不為 `free`、不是錯誤、`sampled_at` 為 NULL、不附證據、不寫入任何資料）。在 savepoint／PL/pgSQL EXCEPTION 子交易中逾時時，該段已取得的 per-owner 鎖隨子交易一併釋放。
- **不需要的阻塞**：reader 不鎖 facts／coverage 資料表，不使用表層鎖；只對「同一 owner、各 namespace」的鍵等待。N25 驗證：進行中的 owner A admission 不阻塞 owner B 的 reader 與 admission、也不阻塞同一 owner 的另一個 reader。
- **成本（不隱瞞）**：(a) reader 對同一 owner 進行中的 admission／coverage advance 最多等 2 秒（每個 namespace 各自計時；N 個 namespace 的最壞總等待為 N×2 秒，ENT0 預期 N 很小）；(b) **reader 在等待 per-owner 鎖期間持有 registry SHARE**，所以此時到達的 registry 寫入者會排在這個等待的 reader 之後（最長約一個 `lock_timeout`），並使其後到達的 reader 排在該寫入者之後（公平佇列；N25(g) 量測）；(c) **已核准的並行取捨（Owner D-1，2026-10-11）**：`entitlement_state_at` 對該 owner 在**每一個已註冊 namespace** 取共享（shared）per-owner 鎖，而 `admit_entitlement_event`／`advance_entitlement_coverage` 取同一把鍵的排他（exclusive）鎖。因此，**兩個並行的呼叫者交易，若各自先呼叫 `entitlement_state_at`、再對同一 owner 的**任一** namespace 呼叫 `admit_entitlement_event` 或 `advance_entitlement_coverage`（共享→排他升級），可能互相等待，PostgreSQL 以 `40P01` 中止其中一筆**（被中止者的交易進入 aborted 狀態，須 ROLLBACK；另一筆可完成）。範圍是**同一 owner 的任意 namespace 組合**，不限同一 namespace。**單一交易且沒有競爭者時，不宣稱必然死結**（實測成功）。 接受前提（缺一不可）：(1) 被拒絕或被中止的操作**沒有部分持久化**；(2) 失敗（含 `40P01`、`55P03`、`OWNER_LOCK_TIMEOUT`）**不得被當作成功，也不得被當作 Free 或任何 grant／purge 的證據**；(3) 未來 producer 必須自行處理交易 rollback、重試、idempotency 與 producer window——**本契約不批准、也不實作這些 producer**；(4) **不接受**任何其他死結形態、資料遺失或 authority bypass。ENT1 的解析交易仍應與 producer 的寫入交易分開、且保持短。N25(f)（恰一方成功、另一方 `40P01`、無資料遺失、不 hang）是本取捨的行為證據。
- **Free 的前提（R3 明確化）**：`free` 只在下列全部成立時回答：①該 owner 在**所有已註冊 namespace**上沒有尚未結束的 admission／coverage advance（reader 已等待至其結局）；②必要 producer 集合非空，且每個必要 producer 於該瞬間的 coverage ≥ instant；③registry 在解析當下一致（registry SHARE，§17.2）；④該 instant 不晚於取樣時鐘。**`free` 仍只是 provisional**：registry 完整性（ENT-R）、來源完整性（ENT-F）與 ENT1 的封存不存在，`free` 不是 grant 核發或 purge 的依據。`unknown`（含 `OWNER_LOCK_TIMEOUT`）一律不核發 grant、不縮短既有 grant。
- **呼叫者自己的未提交資料不是已提交證據**：同一交易內先做的 registry 寫入、admission 或 coverage advance，對同一交易之後的 `entitlement_state_at` 是可見的，答案會把它們算進去；這樣的答案**不得**在該交易之外（持久化、回傳給其他交易、當成 grant 依據）被當成「已提交」的證據：交易可能 ROLLBACK，答案隨之失效。ENT0 不替呼叫者判斷這一點；ENT1 的解析必須在不含自身未提交 producer 寫入的交易中進行。
- **SHARE／per-owner 鎖與 savepoint**：呼叫所取得的 registry SHARE 與 per-owner 鎖持有到**該呼叫所在的（子）交易提交到最外層**為止；若呼叫位於之後被 `ROLLBACK TO SAVEPOINT` 回滾的 savepoint，或位於被捕捉例外的 PL/pgSQL `EXCEPTION` 子交易之內，這些鎖隨該子交易的回滾**立即釋放**（N25(d) 逐一驗證 plain／rollback／release 三種）；`RELEASE SAVEPOINT` 不釋放。因此「SHARE 持有到呼叫者交易結束」（§17.10）的陳述，限定於該呼叫未被回滾的子交易所包含。
- **仍不宣稱**：ENT0 給出不可變的歷史（`unknown` 可變，`free`／`paid` 僅在上列前提與假設下不被符合契約的後續操作推翻）；ENT1 的 split-transaction 安全；registry 封存或完整性；任何超出所列排程的組合。逾時 → `unknown`，從不 Free；admission／coverage 失敗不留下部分資料（N22、N25(c)）。

### 17.16 R3 Gates 與結果（R3 施工者自測；evidence 在 repository 外 `D:\ent0-r3-impl-20261011\`；**不是 acceptance，等待獨立 reacceptance**）

**ENT0 smoke 45／45**＝17 positive＋25 negative＋3 supplementary（F01、F02、F03）。相對 R2 的 41：新增 N24、N25、F02、F03；N10 的時鐘／鎖白名單改為 R3 版本（恰一次 `pg_advisory_xact_lock_shared`、恰一個 `SELECT` 迴圈走訪 registry namespace、位置在 `LOCK TABLE` 之後與取樣之前、無動態 SQL）；既有 gate 的 detector 名稱匹配 `(REGISTRY|OWNER)_LOCK_TIMEOUT`。
- **N24（進行中 admission 在任何答案之前被等待）**：真實進行中的 admission 在排定退休時間之前通過視窗檢查，退休時間經過，reader 從另一個 session 解析，admission 以各種方式結束，再以獨立的最終解析（`verdict`）比對每個答案：COMMIT、ROLLBACK、`PREPARE TRANSACTION`→`COMMIT PREPARED`／`ROLLBACK PREPARED`、被終止、reader 超過等待上限（unknown、不是 free，事實事後提交）、PREPARE 之後才在 reader 逾時後 `COMMIT PREPARED`／`ROLLBACK PREPARED`、多 producer／多筆進行中 admission（paid 與 trial 混合、全數消失、部分回滾）、reader 的呼叫者交易先前已有 SELECT（快照在等待之後）、退休邊界 r−1ms／r／r+1ms、仍必要 producer 的對照（reader 等待、不在事實可見前回 free）、「尚未寫入」階段（admission 等 owner 鎖時退休時間經過→被拒、reader 與最終答案一致 free）；每個情境使用獨立 owner；結束時沒有遺留的 prepared transaction。
- **N25（owner 同步的成本、逾時與鎖順序）**：進行中的 coverage advance 被等待（free）或逾時 unknown；admission 與 coverage advance 對同一 producer 與 reader 的競爭；逾時 unknown 且無任何持久化、被終止的 admission 不留下任何東西；savepoint 回滾釋放／plain 與 release 不釋放且逾時 fail-closed（`55P03`、無部分寫入）；不同 owner、其他 reader 不被阻塞；兩呼叫者交易先 resolve 後 admit 的死結（恰一成功、一 `40P01`、不 hang）；等待中的 reader 持有 registry SHARE，registry 寫入者排隊後被放行、不 hang。
- **F02（`TK_GATES` 選擇契約）／F03（runner mutants）**：見 §17.18。
- 在 **R2 migration 文字**上以同一套 detector 重跑（`tools/run-gates-on-source.mjs`）：N24 在 10 個子檢查失敗並出現 V-READ（答案 `free`、最終 `paid`）；N25 在 8 個子檢查失敗——**R2 缺陷被偵測**。
- 隨機壓力（N23）與其餘 N／P gates 在 R3 bytes 上重新執行。

### 17.17 R3 Mutation 控制與處置

`consumer-retention-entitlement-mutations.mjs` 現有 **105** 個 spec（R2 的 95 個＋R3 新增 10 個 Y130–Y139）；Y122 重新錨定（reader 現有兩個 `lock_not_available` handler，錨點改為 registry 鎖區塊）。新增 mutants（每個都由指名的行為 gate 偵測，且 raw apply 為 `ENT_POST_STATE_MISMATCH`，以觀測 digest 重新固定後安裝；digest 拒絕與行為偵測分開記錄）：Y130 移除 owner 等待（F1 缺陷本身）、Y131 只 try 不等待、Y132 只等必要 producer（R2 的保護範圍）、Y133 在等待之前先算出答案（舊快照）、Y134 不等時鐘已關閉視窗的 producer（退休邊界）、Y135 reader 取 exclusive（互相阻塞）、Y136 session 層級鎖（不釋放）、Y137 以整張 events 表鎖等待（跨 owner 過度阻塞）、Y138 逾時回報 Free、Y139 逾時例外未被捕捉。Harness 另新增每個 gate 的 watchdog（逾 15 分鐘＝BLOCKED，不是偵測）。逐項偵測 gate 與失敗子檢查見外部報告。

### 17.18 R3 修訂（F2）：`TK_GATES` 選擇契約

**缺陷（R2 獨立驗收 F2）**：R2 的 smoke runner 對 `TK_GATES` 以「id 前綴」過濾；未知 id 使選擇結果為空，runner 印出 `result.json` 並以 **exit 0、0 個檢查**結束——一個「通過」的假象。
**R3 契約**（`selectGates`＋`outcomeOf`，與 `TK_MUTANTS` 一致：只接受**完整 id**）：
- `TK_GATES` 未設定 → 全部 gate；
- 設定且每個 token 都是已知的完整 id → **恰好**這些 gate（以固定的正規順序執行，與書寫順序無關；重複只算一次，空白可容忍）；
- 未知 id、**混合**（已知＋未知）、空 token（含結尾逗號）、空值、只有分隔符、前綴（例如 `N10`）→ **在啟動任何 cluster、讀取任何 PG binary 之前**以 `UNKNOWN_GATE_ID`／`EMPTY_GATE_SELECTION` 失敗，exit 2，不執行任何 gate，不建立 `--out` 目錄；
- 選擇被執行完畢之後仍比對「選了什麼」與「跑了什麼」：選到零個、或有任何被選取的 gate 沒有執行 → `BLOCKED`（exit 2，`reason=SELECTION_NOT_EXECUTED`），**永不為通過**；`result.json` 記錄 `selected`、`checks`、`notExecuted`；
- 不跳過任何初始化（選擇完全合法時，cluster、template、fixture 與全量執行相同）；沒有「僅提示」的 exit 0 路徑，也沒有 dry-run 模式。
**測試**：F02（正向與負向、真實子行程）：18 列表驅動契約（12 列選擇、6 列結果判定）；6 個真實 runner 子行程的拒絕案例（未知／混合／空值／分隔符／前綴／結尾逗號：exit≠0、0 行 `CHECK`、未建立 out 目錄）；1 個真實正向子行程（`P02,P01` 無序輸入 → 恰好依正規順序執行 P01、P02，`result.json` 的 `selected` 一致，exit 0）。F03：6 個 runner mutants（m1 未知 id 被忽略、m2 前綴比對、m3 允許空選擇、m4 未設定＝選到零個、m5 零執行＝通過、m6 被選取但未執行的 gate 被忽略）逐一以 `Function#toString` 取出實際函式原始碼、施加單點缺陷後重新編譯，**每個 mutant 都使契約表至少一列失敗**；pristine 版本零列失敗。註：R2 原行為（m1＋m2＋m5 的組合）因此會被偵測。

### 17.19 R3 Source bindings、fresh／reused 與未驗證邊界（R3 施工者自測；不是 acceptance）

- **範圍**：R3 相對 R2 candidate（`970e71f7`）恰好改動 **5 個路徑**（ENT0 migration、ENT0 smoke、ENT0 mutations、persistence smoke 的 pin、本文件）；相對 ENT0 baseline 的路徑集合維持原先的 7 個。未改 meal-save runtime、T0 capture、billing、ENT1。Migration 只改 `entitlement_state_at`（新增 owner 等待區塊與兩個宣告變數）、標頭註解與 post-state digest（`aa4c8eee…d003`）；migration sha256 `73476e71…d809`、blob `63d2697e…`。
- **Source bindings（單向，無 self-hash；機制與 R2 相同）**：persistence smoke 釘住 {ENT0 migration sha256／blob、ENT0 smoke blob `3203a271…`、ENT0 mutations blob `7312e0c3…`}；ENT0 smoke／mutations 只做程式碼 import；本文件只由 guard 以路徑綁定。沒有新增任何綁定方向。
- **Fresh（對 R3 最終 bytes）**：ENT0 smoke **45／45**（17 P＋25 N＋3 supplementary；N24、N25、F02、F03 為新增；P11 的 `during` 斷言由 `COVERAGE_SHORT` 改為 `OWNER_LOCK_TIMEOUT`——reader 現在會等待進行中的 producer 交易，逾時為 unknown，從不看到只有 fact 或只有 coverage 的一半）；ENT0 mutations **105／105 符合預期**（100 個行為偵測、4 個 migration 自身 guard〔Y43、Y70、Y71、Y72，預先宣告為 `any`，不計為行為偵測〕、1 個等價 green control〔Y60，不計為 killed〕；38 個 detector 對未改 migration 的 control 全綠）；recovery smoke＋PG 40／40；recovery guard 85／85；capture smoke 28／28；capture mutations 24／24；persistence smoke 83／83；persistence mutations 127／127；c5-b2／c5-r5／b2-b smoke（b2-b 42／42）；policy smoke／mutations（27 controls）；`tsc`；Doc 05 以外的 F1 探針（獨立於 gates 的 15 個情境）在 R2 上重現 F1（S11、S11b 各 1 個違規），在 R3 上全為 0。
- **R2 對照**：同一組新 gates 在 R2 migration 文字上執行：N24 10 個子檢查失敗並出現 V-READ，N25 8 個子檢查失敗（§17.16）；F2 以 6 個 runner mutants 與 3 個整份 runner 副本（舊前綴過濾、舊前綴過濾加零執行通過、未知 id 靜默丟棄）驗證：F02 在每一個副本上失敗，pristine 通過。
- **Reused（附理由）**：R2 reacceptance 對未被 R3 改動的輸入面的驗證（baseline 側各 guard 的結果與 298 支歷史差分的分類方法）；PG 17.6 二進位（sha256 與驗收輪相同）；AP-1／2／3／5 的行為由 P01–P17、N01–N16 在 R3 bytes 上**重新執行**，不是沿用。
- **未驗證／邊界**：split-transaction 的 grant 建立（不宣稱）；ENT1、registry 封存（ENT-R）、來源完整性（ENT-F）；備援、連線池、Hosted 角色拓撲與 `session_user`；牆鐘回撥；特權操作；reader 端「鎖順序反轉」缺陷（R3 的 reader 先取 registry SHARE、再取 owner 鎖；施工者的 mutants 沒有反序類，N23／N25(f) 涵蓋實際會發生的死結形態；**整合更正 2026-10-11**：此類缺陷**有**確定性動態證據——獨立驗收的排程 S14〔寫入者先持 registry 寫鎖、reader 呼叫、寫入者於同交易 admit〕在 R3 為 0 把 owner 鎖、無 40P01，而反序 meta-mutant 使 reader 阻塞於 registry 鎖時持有 owner 鎖並被選為 40P01 victim；candidate 自己的 N25 對該 mutant 亦附帶失敗；證據在 `D:\ent0-r3-acc-20261011\`；原先「沒有確定性偵測」的敘述已更正，歷史敘述見 §17.19 Git 歷史）；單次本機拋棄式 PG 17.6 的時序（等待與逾時門檻以 2 秒函式層級 `lock_timeout` 為準，gates 以 20 秒與 2 秒兩種設定、並以 `PREPARE TRANSACTION` 的時序注入驗證，不是形式化證明）；效能沒有重新量測（reader 在無競爭時多取 N 個 shared advisory 鎖，N＝已註冊 namespace 數）。
- Candidate 位於 repository 外的隔離 clone（R1 5944036b、R2 970e71f7 皆未被修改，R3 為其子 commit）；**未 push、未對原 repository commit／stage／git am**；最終 commit SHA、tree、bundle 與雜湊記載於外部施工報告（本文件不記錄自身所在 commit）。

### 17.20 R3 整合紀錄（整合 corrective；2026-10-11 起草，2026-10-15 修訂為 origin lineage 基底）

- **Owner D-1（選項 1）**：見 §17.15(c)（已以 Owner 核准文字取代）。
- **整合基底**：origin/main `ad53f5ed977943d9b0b07f63c38cb0c62ab0dee6`（`7ed55fc` 的後代，其間 4 個 commit：`862f4b9`、`602c042`、`cd120e9`、`ad53f5e`）。同一整合補丁亦相容 `7ed55fc` 基底。
- **整合更正**：migration 檔頭標記 `(R2)`→`(R3)`（僅註解，不在 post-state digest 內；raw sha256 與 blob 因而改變，相關 pins 同步更新）；§17.19 鎖序敘述更正。
- **successor 記錄（兩筆，皆為逐位元釘住、全有或全無）**：(1) PC-2 consent-document successor（`7ed55fc`，10 條路徑）；(2) origin successor（`7ed55fc`→`ad53f5e`，26 條路徑，其中 1 個 forward migration）。兩者僅記錄**被觀察到的已提交 bytes 的身分**，**不**表示該 successor 已被審查或接受；其批准與驗收證據缺口列於外部整合方案。**不放寬任何產品 bytes、不使用 blanket allowlist。**
- **migration 排序**：新增的 forward migrations 依檔名排序為 capture（`20261006030000`）、ENT0（`20261010010000`）、origin demo（`20261010172126`）。**ENT0 不是最後一個**；validators 以「精確有序尾端＋逐檔 sha256」判斷（`[]`、`[capture]`、`[capture, ENT0]`、`[capture, ENT0, demo]`），不假設任何一個為最後。上文歷史記載的「145 檔、`[capture, ENT0]`」為 `7ed55fc` 基底狀態；在 origin 基底為 146 檔、`[capture, ENT0, demo]`。
- 本整合不改變 accepted R3 的任何 SQL 行為；ENT1、producer、registry sealing、Hosted、pooler、standby、牆鐘回撥與大規模鎖數仍未驗證。
