export type RestaurantAbout = { restaurantId: string; about: string };
export type RestaurantAboutResult =
  | { status: "available"; about: RestaurantAbout; source: "supabase" | "mock" }
  | { status: "empty"; source: "supabase" | "mock" }
  | { status: "unavailable"; source: "disabled"; message: string }
  | { status: "error"; source: "supabase" | "mock"; message: string; retryable: boolean };
export type RestaurantAboutUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; about: string }
  | { status: "empty" }
  | { status: "unavailable" | "error"; message: string };
