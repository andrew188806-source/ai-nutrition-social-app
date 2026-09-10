export const RESTAURANT_SOCIAL_PROVIDERS=["instagram","facebook","line","threads","tiktok","youtube"] as const;
export type RestaurantSocialProvider=typeof RESTAURANT_SOCIAL_PROVIDERS[number];
export const RESTAURANT_SOCIAL_PROVIDER_LABELS:Record<RestaurantSocialProvider,string>={
  instagram:"Instagram",facebook:"Facebook",line:"LINE",threads:"Threads",tiktok:"TikTok",youtube:"YouTube"
};
export type RestaurantSocialLink={restaurantId:string;provider:RestaurantSocialProvider;publicUrl:string};
export type RestaurantSocialLinksResult=
  |{status:"available";links:readonly RestaurantSocialLink[];source:"supabase"|"mock"}
  |{status:"empty";links:readonly [];source:"supabase"|"mock"}
  |{status:"unavailable";source:"disabled";message:string}
  |{status:"error";source:"supabase"|"mock";message:string;retryable:boolean};
export type RestaurantSocialLinksUiState=
  |{status:"idle";links:readonly []}
  |{status:"loading";links:readonly []}
  |{status:"success";links:readonly RestaurantSocialLink[]}
  |{status:"empty";links:readonly []}
  |{status:"unavailable"|"error";links:readonly [];message:string};
