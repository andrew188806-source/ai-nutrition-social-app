import "server-only";

import { loadRestaurantAccessContext } from "./restaurant-access-context";
import { createRestaurantOwnerRpcRepository } from "../repositories/supabase/restaurant-owner-rpc-repository";

async function selectedRestaurant() {
  const access = await loadRestaurantAccessContext();
  if (access.state !== "selected") throw new Error("Selected restaurant context is unavailable.");
  return access.restaurant;
}

function requireReference(condition: boolean, relationship: string) {
  if (!condition) throw new Error(`Malformed tenant relationship: ${relationship}`);
}

export async function loadLiveDashboard() {
  const restaurant = await selectedRestaurant();
  const repository = createRestaurantOwnerRpcRepository();
  const [branches, menus, items, branchItems, nutrition] = await Promise.all([
    repository.listBranches(restaurant.id), repository.listMenus(restaurant.id), repository.listMenuItems(restaurant.id),
    repository.listBranchMenuItems(restaurant.id), repository.listCurrentNutrition(restaurant.id)
  ]);
  const branchIds=new Set(branches.map(row=>row.id)); const itemIds=new Set(items.map(row=>row.id));
  branchItems.forEach(row=>{requireReference(branchIds.has(row.branchId),"branch item → branch");requireReference(itemIds.has(row.menuItemId),"branch item → menu item");});
  nutrition.forEach(row=>requireReference(itemIds.has(row.menuItemId),"nutrition → menu item"));
  return { restaurant, branches, menus, items, branchItems, nutrition };
}

export async function loadLiveLocations() {
  const restaurant = await selectedRestaurant();
  return { restaurant, branches: await createRestaurantOwnerRpcRepository().listBranches(restaurant.id) };
}

export async function loadLiveMenu() {
  const restaurant = await selectedRestaurant();
  const repository = createRestaurantOwnerRpcRepository();
  const [menus, categories, items, branchItems, nutrition] = await Promise.all([
    repository.listMenus(restaurant.id), repository.listMenuCategories(restaurant.id), repository.listMenuItems(restaurant.id),
    repository.listBranchMenuItems(restaurant.id), repository.listCurrentNutrition(restaurant.id)
  ]);
  const menuIds=new Set(menus.map(row=>row.id)); const categoryIds=new Set(categories.map(row=>row.id)); const itemIds=new Set(items.map(row=>row.id));
  categories.forEach(row=>requireReference(menuIds.has(row.menuId),"category → menu"));
  items.forEach(row=>requireReference(categoryIds.has(row.menuCategoryId),"menu item → category"));
  branchItems.forEach(row=>requireReference(itemIds.has(row.menuItemId),"branch item → menu item"));
  nutrition.forEach(row=>requireReference(itemIds.has(row.menuItemId),"nutrition → menu item"));
  return { restaurant, menus, categories, items, branchItems, nutrition };
}

export async function loadLiveNutrition() {
  const restaurant = await selectedRestaurant();
  const repository = createRestaurantOwnerRpcRepository();
  const [items, nutrition] = await Promise.all([repository.listMenuItems(restaurant.id), repository.listCurrentNutrition(restaurant.id)]);
  const itemIds=new Set(items.map(row=>row.id)); nutrition.forEach(row=>requireReference(itemIds.has(row.menuItemId),"nutrition → menu item"));
  return { restaurant, items, nutrition };
}
