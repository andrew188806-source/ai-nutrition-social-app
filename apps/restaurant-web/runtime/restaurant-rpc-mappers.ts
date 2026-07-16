import { SupabaseMappingError } from "../adapters/supabase/errors";
import type {
  OwnerBranch, OwnerBranchMenuItem, OwnerMenu, OwnerMenuCategory, OwnerMenuItem, OwnerNutrition, OwnerRestaurant
} from "./restaurant-rpc-contracts";

type Row = Record<string, unknown>;

function row(value: unknown, entity: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupabaseMappingError(`Malformed ${entity} row.`, entity, "row");
  return value as Row;
}
function string(value: unknown, entity: string, field: string): string {
  if (typeof value !== "string" || !value) throw new SupabaseMappingError(`Malformed ${entity}.${field}`, entity, field);
  return value;
}
function nullableString(value: unknown, entity: string, field: string): string | null {
  return value === null ? null : string(value, entity, field);
}
function number(value: unknown, entity: string, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) throw new SupabaseMappingError(`Malformed ${entity}.${field}`, entity, field);
  return parsed;
}
function nullableNumber(value: unknown, entity: string, field: string): number | null {
  return value === null ? null : number(value, entity, field);
}
function strings(value: unknown, entity: string, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new SupabaseMappingError(`Malformed ${entity}.${field}`, entity, field);
  return [...value];
}
function boolean(value: unknown, entity: string, field: string): boolean {
  if (typeof value !== "boolean") throw new SupabaseMappingError(`Malformed ${entity}.${field}`, entity, field);
  return value;
}
function assertTenant(actual: string, expected: string, entity: string) {
  if (actual !== expected) throw new SupabaseMappingError(`Cross-restaurant ${entity} relationship rejected.`, entity, "restaurant_id");
}

export function mapOwnerRestaurant(value: unknown): OwnerRestaurant {
  const r = row(value, "OwnerRestaurant");
  return { id: string(r.restaurant_id,"OwnerRestaurant","restaurant_id"), name:string(r.name,"OwnerRestaurant","name"), city:nullableString(r.city,"OwnerRestaurant","city"), category:nullableString(r.category,"OwnerRestaurant","category"), status:string(r.status,"OwnerRestaurant","status") };
}
export function mapOwnerBranch(value: unknown, expected: string): OwnerBranch {
  const r=row(value,"OwnerBranch"); const restaurantId=string(r.restaurant_id,"OwnerBranch","restaurant_id"); assertTenant(restaurantId,expected,"OwnerBranch");
  return { id:string(r.branch_id,"OwnerBranch","branch_id"), restaurantId, name:string(r.name,"OwnerBranch","name"), district:nullableString(r.district,"OwnerBranch","district"), address:nullableString(r.address,"OwnerBranch","address"), status:string(r.status,"OwnerBranch","status") };
}
export function mapOwnerMenu(value: unknown, expected: string): OwnerMenu {
  const r=row(value,"OwnerMenu"); const restaurantId=string(r.restaurant_id,"OwnerMenu","restaurant_id"); assertTenant(restaurantId,expected,"OwnerMenu");
  return { id:string(r.menu_id,"OwnerMenu","menu_id"),restaurantId,name:string(r.name,"OwnerMenu","name"),status:string(r.status,"OwnerMenu","status") };
}
export function mapOwnerMenuCategory(value: unknown, expected: string): OwnerMenuCategory {
  const r=row(value,"OwnerMenuCategory"); const restaurantId=string(r.restaurant_id,"OwnerMenuCategory","restaurant_id"); assertTenant(restaurantId,expected,"OwnerMenuCategory");
  return { id:string(r.category_id,"OwnerMenuCategory","category_id"),menuId:string(r.menu_id,"OwnerMenuCategory","menu_id"),restaurantId,name:string(r.name,"OwnerMenuCategory","name"),sortOrder:number(r.sort_order,"OwnerMenuCategory","sort_order") };
}
export function mapOwnerMenuItem(value: unknown, expected: string): OwnerMenuItem {
  const r=row(value,"OwnerMenuItem"); const restaurantId=string(r.restaurant_id,"OwnerMenuItem","restaurant_id"); assertTenant(restaurantId,expected,"OwnerMenuItem");
  return { id:string(r.menu_item_id,"OwnerMenuItem","menu_item_id"),restaurantId,menuCategoryId:string(r.menu_category_id,"OwnerMenuItem","menu_category_id"),name:string(r.name,"OwnerMenuItem","name"),description:nullableString(r.description,"OwnerMenuItem","description"),imageUrl:nullableString(r.image_url,"OwnerMenuItem","image_url"),allergens:strings(r.allergens,"OwnerMenuItem","allergens"),status:string(r.status,"OwnerMenuItem","status"),nutritionBadgeStatus:string(r.nutrition_badge_status,"OwnerMenuItem","nutrition_badge_status") };
}
export function mapOwnerBranchMenuItem(value: unknown, expected: string): OwnerBranchMenuItem {
  const r=row(value,"OwnerBranchMenuItem"); const restaurantId=string(r.restaurant_id,"OwnerBranchMenuItem","restaurant_id"); assertTenant(restaurantId,expected,"OwnerBranchMenuItem");
  return { id:string(r.branch_menu_item_id,"OwnerBranchMenuItem","branch_menu_item_id"),restaurantId,branchId:string(r.branch_id,"OwnerBranchMenuItem","branch_id"),menuItemId:string(r.menu_item_id,"OwnerBranchMenuItem","menu_item_id"),price:number(r.price,"OwnerBranchMenuItem","price"),availability:string(r.availability,"OwnerBranchMenuItem","availability"),soldOut:boolean(r.sold_out,"OwnerBranchMenuItem","sold_out"),branchSpecificName:nullableString(r.branch_specific_name,"OwnerBranchMenuItem","branch_specific_name"),branchSpecificDescription:nullableString(r.branch_specific_description,"OwnerBranchMenuItem","branch_specific_description"),branchSpecificStatus:nullableString(r.branch_specific_status,"OwnerBranchMenuItem","branch_specific_status") };
}
export function mapOwnerNutrition(value: unknown, expected: string): OwnerNutrition {
  const r=row(value,"OwnerNutrition"); const restaurantId=string(r.restaurant_id,"OwnerNutrition","restaurant_id"); assertTenant(restaurantId,expected,"OwnerNutrition");
  if (r.is_current !== true) throw new SupabaseMappingError("Non-current nutrition row rejected.","OwnerNutrition","is_current");
  return { id:string(r.nutrition_id,"OwnerNutrition","nutrition_id"),restaurantId,menuItemId:string(r.menu_item_id,"OwnerNutrition","menu_item_id"),calories:nullableNumber(r.calories,"OwnerNutrition","calories"),protein:nullableNumber(r.protein,"OwnerNutrition","protein"),carbohydrates:nullableNumber(r.carbohydrates,"OwnerNutrition","carbohydrates"),fat:nullableNumber(r.fat,"OwnerNutrition","fat"),fiber:nullableNumber(r.fiber,"OwnerNutrition","fiber"),sugar:nullableNumber(r.sugar,"OwnerNutrition","sugar"),sodium:nullableNumber(r.sodium,"OwnerNutrition","sodium"),saturatedFat:nullableNumber(r.saturated_fat,"OwnerNutrition","saturated_fat"),servingSize:nullableString(r.serving_size,"OwnerNutrition","serving_size"),verifiedStatus:string(r.verified_status,"OwnerNutrition","verified_status"),isCurrent:true };
}
