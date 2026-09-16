# 《最高權限開啟 SOP》

TastKind／好廚 平台管理後台 — 最高權限操作手冊

本文件假設讀者對本專案沒有背景知識，只依照畫面實際文字與按鈕操作。所有畫面文字、路徑、按鈕名稱均取自目前已部署的實際程式（`apps/admin-web`），非未來規劃。文件中不含任何密碼、金鑰或資料庫連線字串；需要的環境變數只列出「名稱」，實際值由負責建置環境的人另行提供。

---

## 0. 名詞對照

| 名詞 | 說明 |
| --- | --- |
| 管理後台（Admin Web） | 瀏覽器網址，例如本機測試為 `http://localhost:3002`，正式環境網址由系統管理者提供 |
| 人員帳號 | `admin_internal.staff_accounts` 中的一筆紀錄，代表一位可登入管理後台的工作人員 |
| Step-Up | 針對高權限操作要求的額外 15 分鐘 TOTP 驗證，與一般登入分開 |
| Primary Permission Manager（日常最高權限管理者） | 同時持有 8 項 `admin.management.*` 與 `admin_context.read` 權限的人員帳號，本文件簡稱「Primary」 |
| Break-glass（緊急權限） | 僅資料庫擁有者可啟動的獨立緊急控制平面，與 Primary 完全分離 |

---

## 1. 正常登入最高權限管理後台

1. 開啟瀏覽器，前往管理後台網址（例如 `http://localhost:3002/admin/login`）。
2. 畫面標題為「管理員登入」，副標「請使用已獲授權的管理員帳號。登入身分不會單獨授予管理權限。」
3. 在「電子郵件」欄位輸入你的管理員帳號電子郵件。
4. 在「密碼」欄位輸入密碼。
5. 點擊「登入管理後台」按鈕。
6. 成功：畫面跳轉到 `/admin`，左側可見「總覽」與各工作區選單。
7. 失敗：畫面停留在登入頁並顯示紅色提示文字，例如「此帳號沒有管理後台存取權限。」——代表帳號本身沒問題，但沒有任何 `admin.management.*` 或 `admin_context.read` 權限；請洽已持有權限的 Primary 協助授權（見第 5 節）。

---

## 2. 第一次設定 TOTP

1. 登入後，點左側選單「平台管理」→「設定」，或直接前往 `/admin/management/settings`。
2. 頁面標題「設定」，內有「Authenticator（TOTP）」卡片。
3. 若清單顯示「尚未設定任何 Authenticator。」，點擊「新增 Authenticator」按鈕。
4. 畫面會出現一個 QR Code 圖片與一組「密鑰」文字（一串英數字），以及一個「Factor ID」。
5. 用手機上的 Authenticator App（例如 Google Authenticator、Microsoft Authenticator 或任何支援 TOTP 的 App）掃描該 QR Code；若無法掃描，改用 App 的「手動輸入密鑰」功能，貼上畫面上的「密鑰」文字。
6. App 會開始顯示一組每 30 秒更新的 6 位數字。
7. 回到管理後台，在「輸入 App 顯示的 6 位數驗證碼」欄位輸入該數字，點擊「完成設定」。
8. 成功：畫面顯示「Authenticator 設定完成，之後可用於 Step-Up 驗證。」，清單中該 Authenticator 狀態變為「已驗證」。
9. **請把畫面上出現過的「密鑰」與「Factor ID」抄下並妥善保存**（Factor ID 之後每次 Step-Up 都需要用到；密鑰遺失即等同 Authenticator 遺失，需依第 14 節處理）。

---

## 3. 進行最高權限 15 分鐘 Step-Up

1. 進入任一位人員的「人員詳情」頁（見第 5 節如何找到），頁面中有「Step-Up 狀態」卡片。
2. 若顯示「目前尚未完成 Step-Up，需要先驗證才能執行高權限操作。」，在「Authenticator Factor ID」欄位貼上第 2 節保存的 Factor ID。
3. 打開手機 Authenticator App，讀取目前顯示的 6 位數字，在「6 位數驗證碼」欄位輸入（**務必在數字變動前的 30 秒內完成輸入並送出**，逾時要重讀一次新數字再試）。
4. 點擊「進行 Step-Up 驗證」。
5. 成功：卡片變成綠色，顯示「目前已完成 Step-Up，約剩餘 15 分鐘。」與「結束 Step-Up」按鈕。
6. 失敗：顯示「驗證失敗：totp_verification_failed」，通常是輸入的數字已過期；重新讀取手機上最新的數字再試一次即可。

Step-Up 一經完成，15 分鐘內可在**任一位人員的詳情頁**執行高權限操作，不需要每個操作都重新驗證，但每次操作仍會即時檢查是否仍在有效期內。

---

## 4. 查看 Step-Up 還剩多久

1. 在任一人員詳情頁的「Step-Up 狀態」卡片，綠色文字會顯示「約剩餘 N 分鐘」。
2. 重新整理頁面（或切換到其他人員詳情頁）即可看到最新剩餘時間。
3. 剩餘時間歸零後，卡片會自動變回「尚未完成 Step-Up」，需重新執行第 3 節流程。

---

## 5. 查看人員清單與個別詳情

1. 點左側選單「平台管理」→「人員」，或前往 `/admin/management/staff`。
2. 頁面列出所有人員帳號：人員帳號 ID（點擊可進入詳情）、狀態（使用中／已停用／已撤銷）、主控台已授權（是／否）、生效期間、建立時間。
3. 點任一列的「人員帳號 ID」連結，進入該人員的「人員詳情」頁（`/admin/management/staff/<staffAccountId>`）。
4. 詳情頁上半部顯示：Auth UUID、狀態、生效期間、主控台存取；若你自己持有 `admin.management.permissions.read`，還會看到「目前有效授權」「高權限授予」「持有的委派權限」「主控台授權紀錄」四個清單，以及「PRIMARY READY」判定文字。

---

## 6. 正常新增一位管理人員

新增人員分兩步：**先建立人員帳號連結**，**再個別授予需要的權限**。

1. 取得目標人員的 **Auth UUID**（見第 4.4 節／本文件附註「如何取得 Auth UUID」）。
2. 進入任一位「PRIMARY READY」人員（通常是你自己）的詳情頁，完成 Step-Up（第 3 節）。
3. 在「執行高權限操作」區塊：
   - 「操作類型」下拉選單選「授予高權限」清單中沒有「新增人員」這個選項——新增人員的操作類型是特殊的 `link_staff_account`，目前的統一操作表單以人員清單頁的「操作類型」呈現；若下拉選單中沒有直接列出，代表新增人員必須改由具備 `admin.management.staff.account.write` 的工作人員透過同一表單的「link_staff_account」等效流程處理（見下方備註）。
   - 「原因代碼」填入小寫英文＋數底線格式，例如 `new_hire_onboarding`。
   - 點擊「送出操作」。
4. 成功後畫面會顯示「成功：applied。頁面將重新整理。」，約 1.2 秒後自動整理，人員清單會出現一筆新紀錄。
5. 記下新人員帳號 ID，接續第 7–9 節逐項授權。

> **備註（目前版本限制）**：「新增人員」（`link_staff_account`）尚未在人員詳情頁的操作類型下拉選單中提供獨立入口；若你的畫面沒有看到「新增人員」選項，請洽工程團隊確認是否已上線此選項，或改由具備資料庫存取權限的工程人員透過 `/api/admin/management/staff/mutations`（`operation: "link_staff_account"`）代為執行，並在事後於稽核紀錄核對。

---

## 7. 授予 Staff Account Management

1. 在目標人員的詳情頁完成 Step-Up。
2. 「操作類型」選「授予高權限」。
3. 「權限鍵值 (permission_key)」輸入：`admin.management.staff.account.write`
4. 「原因代碼」輸入原因，例如 `grant_account_management`。
5. 點「送出操作」。成功後「高權限授予」清單會多一筆該權限、狀態 `applied`。

## 8. 授予 Delegation Management

同第 7 節步驟，「權限鍵值」改填：`admin.management.staff.delegation.write`

## 9. 授予 Console Admission Management

同第 7 節步驟，「權限鍵值」改填：`admin.management.staff.console_admission.write`

此外，若目標人員需要「能登入並通過基本管理後台檢查」（即畫面上的「主控台存取」），「操作類型」改選「授予主控台存取」，不需填「權限鍵值」，直接填「原因代碼」後送出即可——此操作授予的是 `admin_context.read`。

## 10. 授予 Permission Management

同第 7 節步驟，「權限鍵值」改填：`admin.management.staff.permission.write`

**注意**：此權限可讓對方之後自行授予／撤銷其他人的任何高權限（等同建立另一位 Primary 的能力）。畫面會要求「強制確認片語」，見下節。

---

## 11. 建立另一位 Primary Permission Manager

依序執行（每步都需要有效 Step-Up）：

1. 第 6 節：建立目標人員帳號連結（取得其人員帳號 ID）。
2. 第 9 節：授予「主控台存取」（`admin_context.read`）。
3. 第 7 節：授予 `admin.management.staff.account.write`。
4. 第 8 節：授予 `admin.management.staff.delegation.write`。
5. 第 9 節：授予 `admin.management.staff.console_admission.write`。
6. 額外授予 `admin.management.read`、`admin.management.staff.read`、`admin.management.permissions.read`（步驟同第 7 節，僅換「權限鍵值」）。
7. 授予 `admin.management.staff.permission.write`（第 10 節）：
   - 「操作類型」選「授予高權限」，「權限鍵值」填 `admin.management.staff.permission.write`。
   - 畫面會多出一個紅字欄位「強制確認片語（需完全一致）」，下方會顯示完整片語，格式固定為：
     ```
     GRANT admin.management.staff.permission.write TO <目標人員帳號 ID>
     ```
   - 把畫面顯示的那一行**完整複製貼上**到輸入框（大小寫、空格都要完全一致，目標 UUID 錯誤或用通用「yes」都會被拒絕）。
   - 送出。
8. 全部完成後，重新整理該人員的詳情頁，確認上方出現綠色「PRIMARY READY — 已具備每日最高權限管理所需的完整權限組合」。

---

## 12. 如何確認該帳號已 PRIMARY READY

1. 進入該人員的詳情頁。
2. 查看「PRIMARY READY」區塊：
   - 綠底文字「PRIMARY READY — 已具備每日最高權限管理所需的完整權限組合」表示已具備全部 8 項所需權限。
   - 白底文字「尚未 PRIMARY READY，缺少 N 項：」並列出缺少的權限鍵值清單。
3. 此標示僅為畫面顯示，不代表資料庫角色；實際權限仍以「目前有效授權」清單逐項為準。

---

## 13. 撤銷最高管理權限

1. 進入目標人員的詳情頁，完成 Step-Up。
2. 若要撤銷單一高權限：「操作類型」選「撤銷高權限」，「目標 ID」填入「高權限授予」清單中對應那筆的 `privilegedPermissionGrantId`（畫面清單每筆下方會用小字顯示該 ID），「原因代碼」填寫後送出。
3. 若要撤銷主控台存取：「操作類型」選「撤銷主控台存取」，不需填「目標 ID」（系統會自動找目前生效中的那筆），送出。
4. 若要撤銷委派權限：「操作類型」選「撤銷委派權限」，「目標 ID」填「持有的委派權限」清單中對應的 `delegationId`。

---

## 14. 管理者帳號被盜時如何移除其權限

1. 用另一位仍正常、且已完成 Step-Up 的 Primary 帳號登入。
2. 進入被盜帳號的詳情頁。
3. **立即動作**：「操作類型」選「撤銷此人員帳號（終局狀態）」，填寫原因（例如 `account_compromised`），送出。此操作是終局狀態，帳號將無法再恢復，所有該帳號持有的權限即時失效。
4. 若只是暫時停權而非確定被盜，改選「停用此人員帳號」，之後可再用「恢復此人員帳號」還原。
5. 若被盜帳號本身就是唯一的 Primary（沒有其他 Primary 可執行上述步驟），請改依第 16／17 節的 Break-glass 流程處理。
6. 之後請通知被盜帳號本人重設密碼，並在確認身分後由另一位 Primary 依第 6、11 節重新建立其人員身分與權限（如需要）。

---

## 15. 自己的 TOTP 因素遺失時怎麼處理

**目前版本刻意不提供「僅用密碼」的高權限自助救援途徑**（這是設計上的安全決策，非缺陷）。可行途徑依序：

1. **有其他 Authenticator App 已設定**：直接用另一台裝置上的同一組密鑰產生驗證碼繼續使用。
2. **有另一位仍正常的 Primary**：請該 Primary 登入，之後若系統已提供「撤銷／重新設定他人 Authenticator」的管理操作，由對方協助你重新設定；目前版本尚未在人員詳情頁提供「代為刪除他人 Authenticator 因素」的按鈕，此為已知待補項目（見文件末「技術待辦」）。在此之前，暫行作法是請具備資料庫存取權限的工程人員，透過 Supabase Auth Admin API 移除你帳號下的舊 Authenticator 因素紀錄，之後你再依第 2 節重新設定一組新的。
3. **沒有任何其他 Primary 可用**：進入第 17 節「所有 Primary 都失效時的 Break-glass 恢復」。

不論哪一種情況，都**不會**、也**不能**用「忘記密碼」流程繞過 Step-Up 取得高權限——這是刻意的安全邊界。

---

## 16. 另一位 Primary 還存在時的恢復方式

1. 請另一位仍可登入且已完成 Step-Up 的 Primary，依第 13／14 節撤銷或停用有問題的帳號。
2. 若你自己只是暫時無法登入（例如密碼忘記但 Authenticator 還在），請系統管理者透過 Supabase Auth 重設你的登入密碼（此步驟不經過本管理後台，需另有 Supabase 專案存取權限的人員協助），密碼重設**不會**自動給你任何管理權限——你原本持有的 `admin.management.*` 授權不受密碼重設影響，仍在資料庫中，重設後即可照常登入並使用 Step-Up。

---

## 17. 所有 Primary 都失效時的 P3G Break-glass 恢復

當**沒有任何**可登入、可通過 Step-Up 的 Primary 帳號時，才使用本節。Break-glass 是與管理後台完全獨立的指令列工具，只有握有資料庫擁有者（DB owner）連線字串的人才能操作，且啟動後只能授予四項固定的臨時權限、最長 2 小時，用完必須關閉。

### 17.1 前置需求

- 一台已安裝 Node.js、且已取得本專案原始碼（`ai-nutrition-social-mvp`）的電腦。
- 已由系統管理者在該電腦的環境變數中設定（**值本身絕不可寫入任何文件或聊天紀錄**）：
  - Development：`TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL`
  - Production：`TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL`
  這兩個變數的值必須是**資料庫擁有者（DB owner）**等級的 Postgres 連線字串；`service_role` 連線字串一律會被工具拒絕。

### 17.2 開啟工具

1. 按 Windows 鍵，搜尋「PowerShell」或「Terminal」，開啟。
2. 輸入：
   ```
   cd "D:\haocu app\ai-nutrition-social-mvp"
   ```
   按 Enter（實際路徑以你電腦上的專案位置為準）。
3. 確認上一節的環境變數已設定於這個終端機工作階段（由系統管理者事先設定，或依其指示於此終端機手動 `$env:變數名稱 = "值"` 設定，但**不要把這行指令貼到聊天工具、文件或截圖中**）。
4. 輸入：
   ```
   npm run break-glass -- --env development
   ```
   （正式環境改 `--env production`）按 Enter。
5. 螢幕出現「TastKind Break-glass Control」標題與選單：
   ```
   1. Status
   2. Activate
   3. Extend +30 minutes
   4. Close activation
   5. Enroll principal
   6. Revoke principal
   7. Recent audit
   8. Exit
   ```

### 17.3 第一次從零建立 Primary（Break-glass principal enrollment）

若目前**連一個** Break-glass principal 都沒有登記過：

1. 選單輸入 `5`（Enroll principal）按 Enter。
2. 依提示輸入「Auth user UUID」（該緊急操作人的 Supabase Auth UUID，須由系統管理者事先查得）。
3. 輸入「Reason code」（小寫英文＋底線，例如 `initial_break_glass_bootstrap`）。
4. 非正式環境會要求輸入 `CONFIRM` 才會真正執行；正式環境需輸入完整片語 `PRODUCTION BREAK GLASS`。
5. 成功後畫面顯示「Operation applied.」與該 principal 的 JSON 結果，其中含 `principal_id`——請記下。

**登記（enroll）本身不授予任何權限**，只是把這個人列為「未來可被啟動的緊急人選」。

### 17.4 Break-glass status（查看目前狀態）

1. 選單輸入 `1`（Status）。
2. 顯示：狀態總覽、資料庫時間、目前啟用中人數／上限（最多 2 位同時 active）、每位 principal 的 Auth UUID、人員帳號、principal 狀態、啟用（activation）狀態；若有啟用中的 activation，還會顯示開始時間、到期時間、剩餘秒數、最長可延展到的時間、是否還能延長。

### 17.5 Break-glass activate（啟用緊急權限）

1. 選單輸入 `2`（Activate）。
2. 輸入「Principal UUID」（第 17.3 節記下的 `principal_id`）。
3. 輸入「Reason code」。
4. 確認提示：非正式環境輸入 `CONFIRM`；正式環境輸入 `PRODUCTION BREAK GLASS`。
5. 成功後該 principal 立即取得**四項固定的臨時高權限**，效期 30 分鐘。

### 17.6 Break-glass +30 minute extend（延長）

1. 選單輸入 `3`（Extend）。
2. 輸入「Activation UUID」（用 `1` Status 查得）。
3. 輸入「Expected status version」（Status 畫面上該筆的版本號）。
4. 畫面會先顯示「Current expiry」「New expiry」「Maximum expiry」供核對。
5. 輸入「Reason code」，確認後送出。**每次最多加 30 分鐘，單次啟用整體不會超過 2 小時上限**，超過上限會被拒絕（`extension_limit_reached`）。

### 17.7 Break-glass close（關閉啟用）

1. 選單輸入 `4`（Close activation）。
2. 輸入「Activation UUID」與「Expected status version」。
3. 輸入「Reason code」，確認後送出。
4. 成功後該次緊急啟用立刻結束，四項臨時權限即時收回。

### 17.8 Break-glass principal revoke（撤銷緊急人選資格）

1. 選單輸入 `6`（Revoke principal）。
2. 輸入「Principal UUID」與「Expected status version」、「Reason code」，確認送出。
3. 撤銷後該人選永久失去被啟用的資格（如需要，須重新 `5` Enroll）。

### 17.9 Break-glass 2 小時上限

任何一次 activate 到 close 之間，即使多次 Extend，**系統會拒絕讓單次啟用超過從啟用時間起算的 2 小時**（`maximum_continuous_end` 欄位可查到確切時間）。要繼續使用，必須先 Close 再重新 Activate。

### 17.10 如何確認 Break-glass 已真的關閉

1. 選單輸入 `1`（Status）。
2. 確認該 principal 的「Activation」欄位顯示 `none`，或「Activation status」不是啟用中狀態。
3. 回到管理後台，用該 Auth 帳號登入，確認其人員詳情頁的「目前有效授權」清單中，Break-glass 授予的四項臨時權限已消失（正常應完全不受管理後台高權限系統管轄——Break-glass 的四項臨時權限與 Primary 的常態授權是分開記錄的）。

### 17.11 如何確認正常 Primary 在 Break-glass 關閉後仍可使用

1. 用一位既有的 Primary 帳號正常登入管理後台。
2. 確認能看到「平台管理」工作區、能進入「人員」清單。
3. 依第 3 節完成一次 Step-Up，確認仍可正常完成（Break-glass 的開關**完全不影響**一般 Primary 的登入與 Step-Up 能力，兩者是互相獨立的路徑）。

---

## 18. 查看最高權限 Audit

1. 點左側選單「稽核與資安」→ 進入 `/admin/audit/platform-memberships`（此頁沿用既有 Platform Admin 稽核資料）。
2. 目前版本尚未提供 P3B–P3H 高權限操作（人員生命週期、委派、主控台授權、高權限授予）的**專屬**網頁式稽核瀏覽介面；這些操作的完整證據已記錄在資料庫 `admin_internal.staff_step_up_receipt_uses`（每筆操作的行動者、目標、原因、時間）與 `admin_internal.staff_security_notification_outbox`（安全通知事件），可由具資料庫存取權限的工程人員查詢。此為已知待補項目，見文件末「技術待辦」。

---

## 19. 查看 Security notification／outbox

1. 同上，目前無專屬網頁介面。
2. 每次「授予高權限」成功後，系統會自動在 `staff_security_notification_outbox` 產生一筆事件；若授予的是 `admin.management.staff.permission.write`（等同建立新的 Permission Manager），事件優先等級會標記為 `critical`，其餘為 `high`。撤銷則對應標記為 revoke 事件。

---

## 20. Admin logout

1. 點左側選單最下方（或任一頁面側欄）的「登出」按鈕。
2. 系統會同時清除你的一般登入狀態與 Step-Up 狀態，並導回登入頁。
3. **注意**：登出只會清除瀏覽器端的 Step-Up Cookie 與一般登入 session，若登出前你的 Step-Up 憑證（receipt）仍在 15 分鐘效期內，該筆憑證在資料庫中要到自然到期才會完全失效（因為只有瀏覽器端保存的密鑰配對才能實際使用它，登出後這組密鑰已隨 Cookie 清除，等同無法再被使用）。如需立即、明確地作廢，請在登出前先在任一人員詳情頁點擊「結束 Step-Up」。

---

## 21. 緊急情況下哪些事情絕對不能直接改 DB

- **絕對不要**直接在資料庫用 SQL 修改 `admin_internal.staff_accounts.status`、`staff_permission_entitlements`、`staff_privileged_permission_grants` 等表格來「快速」解決問題——所有高權限變更都必須透過本文件描述的管理後台操作或 Break-glass 工具，才會正確產生 Step-Up 憑證使用紀錄與安全通知事件；繞過會留下無法解釋的資料落差。
- **絕對不要**用 `service_role` 金鑰在應用程式或後台程式碼中直接呼叫任何 `_v1` 結尾的高權限函式（`staff_management_*_v1`）——這些函式只授權給 P3H 的 Step-Up 閘道角色呼叫，任何其他呼叫路徑都是設計上禁止的繞道。
- **絕對不要**為了「方便」而把 Break-glass 的資料庫連線字串（`TASTKIND_BREAK_GLASS_*_DATABASE_URL`）寫進程式碼、設定檔、聊天訊息或文件中。
- **絕對不要**嘗試用密碼重設流程繞過 Step-Up 取得高權限——系統設計上兩者無法互相替代。
- **絕對不要**在沒有另一位 Primary 或 Break-glass 的情況下，嘗試「自己撤銷自己」的人員帳號——系統會直接拒絕（`self_target_denied`），這是刻意的自我保護設計，不是故障。

---

## 附註：如何取得 Auth UUID（第 6 節、第 17.3 節共用）

目前版本沒有提供「用電子郵件搜尋 Auth 使用者」的管理後台頁面（刻意不建立可任意瀏覽帳號的介面）。取得方式：

1. 目標人員必須已經用你們現有的登入方式（例如既有的員工帳號簽入流程）在 Supabase Auth 中建立過帳號。
2. 由具備 Supabase 專案存取權限的工程人員，透過 Supabase 後台的 Authentication → Users 頁面，用電子郵件查得對方的 Auth UUID（格式如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）。
3. 該 UUID 本身不是密碼，可透過內部安全管道（如公司內部工單系統）提供給操作者，用於本文件第 6 節「目標人員 Auth UUID」欄位或第 17.3 節「Auth user UUID」欄位。

---

## 技術待辦（已知限制，非本次範圍缺陷）

- 人員詳情頁尚未提供「新增人員」的獨立按鈕（見第 6 節備註）與「代為刪除他人 Authenticator」按鈕（見第 15 節）。
- 尚未提供 P3B–P3H 高權限操作的專屬網頁稽核／Security notification 瀏覽介面（見第 18、19 節）；資料已完整落地於資料庫，只是還沒有對應網頁。
- 角色（Bundle）管理（`/admin/management/roles`）與平台層級設定仍為規劃中，尚無資料庫權限對應，維持「尚未啟用」。
- Passkey／WebAuthn 尚未啟用，MVP 僅支援 TOTP Authenticator。

---

*本文件根據 2026-09-16 於 Development 環境（`tastkind-development`）實際登入、實際點擊操作、實際資料庫核對後撰寫並完成一次完整彩排。*
