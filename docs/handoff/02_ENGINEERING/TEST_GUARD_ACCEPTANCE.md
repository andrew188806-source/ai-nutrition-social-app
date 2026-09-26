# 測試／Guard／驗收模型（Test, Guard and Acceptance）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

## 1. 歷史階段 guard 刻意保留舊契約

`scripts/` 內有數百個 guard／mutation／smoke 腳本。許多是**單一回合的凍結 guard**：它們固定某個階段的基準提交與檔案內容，用來證明「那一回合」的範圍。因此在目前 HEAD 上**並非全部為綠燈，這是設計使然**。

**不要把繼承下來的歷史 guard 失敗當成目前產品缺陷。**

## 2. 如何判讀：比對候選與正式基準

每次變更都以「候選版本 vs 正式基準」跑同一組 guard，逐一比對失敗檢查項，並分類：

| 分類 | 意義 | 可接受？ |
| --- | --- | --- |
| `NEW` | 基準通過、候選失敗，或同一 suite 出現新的失敗檢查 | 否，必須修正或回報 |
| `INHERITED` | 基準與候選失敗內容完全相同 | 可，記錄即可 |
| `HISTORICAL_PHASE` | 同一檢查在兩邊都失敗，只是訊息內帶有變動值（例如目前 HEAD SHA） | 可，需說明 |
| `ENVIRONMENTAL` | 環境造成（網路、憑證缺漏、平台差異） | 需說明並重跑 |

GQA-3 最終差異：基準 109/243 → 112/246（新增 3 個 GQA-3 suite 全通過），`NEW` 回歸為 0。

## 3. 精確後繼（exact-successor）模式

歷史 guard 透過「精確後繼 manifest」辨識已接受的後續變更：提交身分（父提交、主旨、精確路徑集合）＋位元組雜湊（SHA-256 與 Git blob），從**目前的祖先鏈**辨識，而不是依賴 `origin/main` 指向哪裡。只允許精確列舉的檔案，不允許萬用字元或目錄前綴。

## 4. 凍結的產品 runtime vs 可演進的驗證工具

- **凍結的是產品／runtime 位元組與安全邊界**（例如 GQA-2 的 9 個 runtime 檔、GQA-1 的日記檔與 Consumer 真實性規則）。
- **驗證腳本本身是工具，不是凍結的產品狀態**，可在後續 QA 中改善。不要讓驗證器用雜湊釘住自己未來的原始碼。

## 5. GQA-1／GQA-2 的耐久歷史設計

- GQA-2 有效條件：出處 `8a16644 → 075a6f7 → 25157cb` 在祖先鏈中且身分精確；9 個 runtime 檔等於 `075a6f7` 位元組；`075a6f7` 之後 `apps`、`lib`、`packages`、`supabase`、`package.json`、`package-lock.json`、`scripts/break-glass-control.mjs` 無任何變動。
- GQA-1 有效條件：出處 `cb287bd → 03cec4f → 8a16644`；`03cec4f` 之後 `apps/mobile`、`lib`、`packages`、`supabase` 無變動；日記檔位元組精確；Consumer 真實性規則直接在產品原始碼上成立。
- 兩者都**不看**後續提交的數量、主旨、是否修改驗證腳本、`origin/main` 位置。純文件或純腳本提交不影響有效性；任何碰到凍結產品根目錄的提交會使辨識失效（刻意設計）。
- 證明方式：mutation 腳本會在作業系統暫存目錄建立拋棄式 `--shared` clone，製造真實的後續提交歷史，完成後刪除；不寫入工作樹。

## 6. Mutation 安全規則

- 部分 mutation suite 會**暫時修改受版控的檔案**，結束時必須還原。
- 每跑完一個 suite 都要檢查 `git status`；若工作樹改變，停止並檢查殘留。
- **不要盲目中止正在就地修改檔案的 mutation**；若必須中止，先檢查並還原殘留，再繼續。
- 給足時間：部分 suite 需要數分鐘。

## 7. 其他工具事實

- 沒有 CI、lint 設定、pre-commit hook，也沒有 `engines`／`.nvmrc`（見 [TECHNICAL_DEBT](TECHNICAL_DEBT.md)）。
- root `npm run typecheck` 不涵蓋 `apps/mobile`；請另跑 mobile workspace 的 typecheck。
