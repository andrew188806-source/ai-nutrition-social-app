# 開發工作流程（Development Workflow）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

> 本文件描述的是**作業流程（誰做什麼）**，不是產品架構。更換執行者不影響系統設計。

## 角色分工

| 角色 | 負責 |
| --- | --- |
| Planner（ChatGPT） | 定義階段與範圍、做決策、訂驗收標準、宣告結案 |
| Claude Desktop（**暫時**的實作者；Codex 算力受限期間） | 本地 repository 實作、guard／測試／建置、建立本地提交；在明確授權時執行 live 驗收 |
| 創辦人／使用者 | 最後手動推送（push）；互動式登入與 TOTP；Vercel 環境變數值的設定 |

當 Planner 或使用者明確宣布 Codex 算力恢復後，實作角色可回到 Codex；此調整不需改動任何技術文件。

## 固定規則

- 實作者**不推送**、不部署；推送由創辦人手動完成。
- 一個回合一個（或 brief 指定數量的）本地提交；提交訊息結尾附 `Co-Authored-By` 行。
- 未經明確授權，不連線 Development 或 Production，不使用 `service_role` 或資料庫擁有者憑證。
- 憑證、密碼、TOTP、連線字串永不貼到對話、文件或紀錄中，見 [SECRET_HANDLING](../03_SECURITY_AUTHORITY/SECRET_HANDLING.md)。
- 每回合先驗證基準（HEAD、`origin/main`、乾淨工作樹、ahead/behind），不符就停止。
- 變更後跑「候選 vs 基準」的 guard 差異比對，見 [TEST_GUARD_ACCEPTANCE](TEST_GUARD_ACCEPTANCE.md)。

## 常用指令

```bash
npm run mobile
npm run typecheck
npm --workspace @haocu/mobile run typecheck
```

詳細啟動與檢查指令：`docs/engineering-handoff.md`「Start And Check Commands」。

## Windows 本機注意事項

不使用 `npm ci`；不建立 junction／symlink；刪除工作樹前先移除連結（曾因 `rm -rf` 穿過 junction 誤刪 `node_modules` 與 `.env.local`）。
