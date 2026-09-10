export const CONSUMER_PUBLIC_RESTAURANT_SOCIAL_LINKS_VIEW="consumer_public_restaurant_social_links_v1" as const;
export const RESTAURANT_SOCIAL_LINK_COLUMNS="restaurant_id,provider,public_url" as const;
export type RestaurantSocialLinkRow={restaurant_id:unknown;provider:unknown;public_url:unknown};
export type RestaurantSocialLinkResponse={data:RestaurantSocialLinkRow[]|null;error:{status?:number}|null};
export type RestaurantSocialLinkClientLike={
  from(view:typeof CONSUMER_PUBLIC_RESTAURANT_SOCIAL_LINKS_VIEW):{
    select(columns:typeof RESTAURANT_SOCIAL_LINK_COLUMNS):{
      eq(column:"restaurant_id",value:string):{
        order(column:"provider",options:{ascending:true}):Promise<RestaurantSocialLinkResponse>
      }
    }
  }
};
