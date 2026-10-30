// Feature-local copy (same precedent as consumer-onboarding/copy.ts). No score, grade or health judgement wording.
export const monthlyReviewCopy = {
  title: "月回顧（營養摘要）",
  subtitle: "依你本人的飲食紀錄整理；不含評分或健康評價。",
  loading: "正在整理你的月回顧…",
  signInRequired: "登入後才能查看你的月回顧。",
  coreDenied: "目前的帳號狀態無法使用月回顧。",
  unavailable: "月回顧暫時無法取得，請稍後再試。",
  retry: "重試",
  inProgress: "進行中，會隨紀錄更新",
  noRecords: "這個月沒有紀錄",
  recorded: (days: number, meals: number) => `有紀錄 ${days} 天 · ${meals} 餐`,
  nutrientLabel: { calories: "熱量", protein: "蛋白質", carbohydrates: "碳水", fat: "脂肪", fiber: "纖維" },
  nutrientUnit: { calories: "kcal", protein: "g", carbohydrates: "g", fat: "g", fiber: "g" },
  nutrientLine: (label: string, total: string, average: string | null, unit: string, days: number) =>
    average === null ? `${label}：總計 ${total} ${unit}` : `${label}：總計 ${total} ${unit} · 有紀錄日平均 ${average} ${unit}（以 ${days} 天計）`,
  nutrientUnknown: (label: string) => `${label}：這個月沒有可用的${label}資料（不以 0 計）`,
  disclosure: (label: string, missing: number, invalid: number) =>
    [missing > 0 ? `${missing} 項沒有${label}資料` : null, invalid > 0 ? `${invalid} 項${label}資料無法使用` : null].filter(Boolean).join("、") + "，未計入總計與平均",
  averageNote: "平均只以有紀錄的日子計算；沒有紀錄的日子不當作沒有進食。",
  timezoneNote: (zone: string) => `月份依帳號報表時區 ${zone} 歸屬，不隨手機時區改變。`,
  scopeNote: "目前只顯示最近六個月（本功能的介面範圍，不是會員保存規則）；較早月份與付費會員永久保存尚未開通。"
} as const;
