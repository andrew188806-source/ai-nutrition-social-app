# 收藏品與市集（Collectibles / Marketplace）

> **分類** `POST_MVP` · **狀態** `POST_MVP`（未實作） · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

> 目前**沒有**實體收藏品、所有權、轉移或市集功能。App 內的 IP 圖鑑只涵蓋第一層（款式／目錄身分），且是靜態 demo 資料。

## 三層分離（ODR-014）

1. 款式／目錄身分（style／catalog identity）
2. 實體商品個體（physical Product Instance）
3. 目前擁有者（current ownership）

三者不得混為一談。

## 已記錄的設計方向（全部 `POST_MVP`）

| ODR | 內容 |
| --- | --- |
| ODR-015 | 第一代款式辨識：對已登錄的圖鑑做封閉集合的影像辨識／檢索（可保留多視角、多角度、多光源參考）；**不需要** NFC 或隱藏 AI 碼 |
| ODR-016 | 每個實體商品有唯一且永久的 Product Instance ID 與永久 QR；QR 識別的是「個體」，**永不代表目前擁有者** |
| ODR-017 | 初次掃描可把無主個體綁定給收藏者；已有主的個體不能以掃描永久 QR 重新綁定；二手轉移使用擁有者授權的一次性轉移碼／QR；轉移後永久 QR 不變 |
| ODR-018 | 所有權轉移／二手市集為 Post-MVP；架構不應強迫日後採用衝突的 Product Instance 模型 |

## 未決

市集的經濟模式、手續費、交易與結算方式：`OPEN`（見 [OPEN_DECISIONS](../11_DECISION_REGISTERS/OPEN_DECISIONS.md)）。實體商品尺寸等真實資料尚不存在（DF-13）。

## 來源

`governance/OWNER_PRODUCT_DECISION_REGISTER.md` ODR-014～018；`docs/engineering-handoff.md`（Product decisions）。
