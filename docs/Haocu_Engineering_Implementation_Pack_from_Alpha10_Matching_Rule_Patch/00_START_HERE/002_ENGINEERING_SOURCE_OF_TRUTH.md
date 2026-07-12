# 002 Engineering Source of Truth

## Source Hierarchy for Engineering

工程實作遇到衝突時，依序採用：

1. `07_SOURCE_REFERENCES/SOURCE_OF_TRUTH.md`
2. `07_SOURCE_REFERENCES/01_Product/005_MVP_SCOPE.md`
3. `07_SOURCE_REFERENCES/02_PRD/*`
4. `07_SOURCE_REFERENCES/04_Data/*`
5. `07_SOURCE_REFERENCES/06_Architecture/*`
6. `07_SOURCE_REFERENCES/07_Engineering/*`
7. `07_SOURCE_REFERENCES/08_Backend/*`
8. `07_SOURCE_REFERENCES/09_Frontend/*`
9. `07_SOURCE_REFERENCES/23_Engineering_Backlog_Pack/*`
10. UI polish 依 `07_SOURCE_REFERENCES/05_UI/*`

## Engineering Interpretation Rule

PRD、Data、Architecture、Backlog 控制工程行為。Investor、Pitch、Fundraising 文件只解釋產品與商業價值，不自動增加工程 scope。

## Matching Rule Patch Priority

Meal Buddy candidate ranking 必須先做 hard exclusion，再做 score / penalty。任何已接受配對、已開始一對一聊天、已出現在聊天室的人，都不得重新出現在新候選名單。
