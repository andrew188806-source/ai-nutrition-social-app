export type CommunityProfileMode = "free_anonymous" | "premium_anonymous" | "premium_real_photo" | "unknown";

export type AvatarSource =
  | { type: "mascot"; mascotId: string; assetKey?: string }
  | { type: "photo"; photoUrl: string | null; assetKey?: string | null }
  | { type: "initial"; value: string }
  | { type: "none" };

export type CommunityProfileDisplay = {
  displayName: string;
  avatarSource: AvatarSource;
  mascotId: string | null;
  selectedMascotName: string | null;
  photoUrl: string | null;
  profileMode: CommunityProfileMode;
  isPremium: boolean;
  shortProfileSummary: string;
  tags: string[];
};

export type RestaurantMenuDisplay = {
  id: string;
  menuItemId?: string;
  name: string;
  priceTwd?: number;
  tags: string[];
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  fiberGrams?: number;
  disclosureStatus?: string;
};

export type RestaurantDisplay = {
  restaurantName: string;
  location: string;
  category: string;
  tags: string[];
  dishes: RestaurantMenuDisplay[];
  nutritionData: RestaurantMenuDisplay[];
};
