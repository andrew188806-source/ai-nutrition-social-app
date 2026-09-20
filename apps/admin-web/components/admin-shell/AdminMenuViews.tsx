import type { ReactNode } from "react";
import type { CurrentNutrition } from "../../server/adminRestaurantRead";
import { FactList, dash } from "./AdminRestaurantViews";

/** Presentation helpers for the ADMIN-B3 read-only Menu / Menu Item pages. Real B1 contract data only; no controls. */

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600" data-b2-state="empty" role="status">{children}</p>;
}

export const yesNo = (value: boolean): string => (value ? "是" : "否");

/** Numeric nutrition facts exactly as stored; a missing (null) value is shown as "—", never as 0. */
const num = (value: number | null): ReactNode => (value === null ? null : String(value));

/** The current nutrition record (or a truthful "none recorded" state). Read-only: no edit, approval or certification control. */
export function NutritionFacts({ nutrition }: { nutrition: CurrentNutrition | null }) {
  if (nutrition === null) {
    return <p className="text-sm text-slate-600" data-b3-nutrition="none">目前沒有現行的營養資料紀錄。</p>;
  }
  return (
    <div data-b3-nutrition="present">
      <FactList items={[
        { label: "份量", value: dash(nutrition.servingSize) },
        { label: "熱量", value: num(nutrition.calories) },
        { label: "蛋白質", value: num(nutrition.protein) },
        { label: "碳水化合物", value: num(nutrition.carbohydrates) },
        { label: "脂肪", value: num(nutrition.fat) },
        { label: "飽和脂肪", value: num(nutrition.saturatedFat) },
        { label: "纖維", value: num(nutrition.fiber) },
        { label: "糖", value: num(nutrition.sugar) },
        { label: "鈉", value: num(nutrition.sodium) },
        { label: "資料來源", value: dash(nutrition.source) },
        { label: "驗證狀態", value: dash(nutrition.verifiedStatus) },
        { label: "信心分數", value: num(nutrition.confidenceScore) },
        { label: "更新時間", value: dash(nutrition.updatedAt) }
      ]} />
    </div>
  );
}
