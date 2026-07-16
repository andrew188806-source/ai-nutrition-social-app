export interface OwnerRestaurant {
  id: string;
  name: string;
  city: string | null;
  category: string | null;
  status: string;
}

export interface OwnerBranch {
  id: string;
  restaurantId: string;
  name: string;
  district: string | null;
  address: string | null;
  status: string;
}

export interface OwnerMenu { id: string; restaurantId: string; name: string; status: string; }
export interface OwnerMenuCategory { id: string; menuId: string; restaurantId: string; name: string; sortOrder: number; }
export interface OwnerMenuItem {
  id: string;
  restaurantId: string;
  menuCategoryId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  allergens: string[];
  status: string;
  nutritionBadgeStatus: string;
}
export interface OwnerBranchMenuItem {
  id: string;
  restaurantId: string;
  branchId: string;
  menuItemId: string;
  price: number;
  availability: string;
  soldOut: boolean;
  branchSpecificName: string | null;
  branchSpecificDescription: string | null;
  branchSpecificStatus: string | null;
}
export interface OwnerNutrition {
  id: string;
  restaurantId: string;
  menuItemId: string;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  saturatedFat: number | null;
  servingSize: string | null;
  verifiedStatus: string;
  isCurrent: true;
}

export interface RestaurantOwnerReadRepository {
  listRestaurants(): Promise<OwnerRestaurant[]>;
  listBranches(restaurantId: string): Promise<OwnerBranch[]>;
  listMenus(restaurantId: string): Promise<OwnerMenu[]>;
  listMenuCategories(restaurantId: string): Promise<OwnerMenuCategory[]>;
  listMenuItems(restaurantId: string): Promise<OwnerMenuItem[]>;
  listBranchMenuItems(restaurantId: string): Promise<OwnerBranchMenuItem[]>;
  listCurrentNutrition(restaurantId: string): Promise<OwnerNutrition[]>;
}
