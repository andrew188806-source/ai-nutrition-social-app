import type { GeoPoint } from "../geo-api/index.ts";

export type NextMealGeoRequest = Readonly<{
  latitude: number;
  longitude: number;
  candidatePoolLimit?: number;
}>;

export type NextMealGeoParsedRequest = Readonly<{
  origin: GeoPoint;
  candidatePoolLimit: number;
}>;

export type NextMealGeoCandidateRow = Readonly<{
  candidate_id: string;
  restaurant_id: string;
  branch_id: string;
  menu_item_id: string;
  meal_name: string;
  restaurant_name: string;
  branch_name: string;
  district: string | null;
  public_image_url: string | null;
  calories: number;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: number | null;
  nutrition_source_public: string;
  nutrition_updated_at: string;
  availability: string;
}>;

export type NextMealGeoResponse = Readonly<{
  version: "next-meal-geo-v1";
  status: "available" | "empty";
  geoCandidateCount: number;
  candidates: readonly NextMealGeoCandidateRow[];
}>;

export interface NextMealGeoCandidateRowSource {
  readForBranches(branchIds: readonly string[], limit: number): Promise<readonly NextMealGeoCandidateRow[]>;
}
