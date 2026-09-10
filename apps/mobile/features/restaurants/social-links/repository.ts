import {CONSUMER_PUBLIC_RESTAURANT_SOCIAL_LINKS_VIEW,RESTAURANT_SOCIAL_LINK_COLUMNS,type RestaurantSocialLinkClientLike} from "./rowContract";
import {mapRestaurantSocialLinkRows} from "./mapper";
import type {RestaurantSocialLinksResult} from "./types";
export interface RestaurantSocialLinksRepository{load(restaurantId:string):Promise<RestaurantSocialLinksResult>}
export class SupabaseRestaurantSocialLinksRepository implements RestaurantSocialLinksRepository{
  constructor(private readonly client:RestaurantSocialLinkClientLike){}
  async load(restaurantId:string):Promise<RestaurantSocialLinksResult>{
    try{const response=await this.client.from(CONSUMER_PUBLIC_RESTAURANT_SOCIAL_LINKS_VIEW).select(RESTAURANT_SOCIAL_LINK_COLUMNS).eq("restaurant_id",restaurantId).order("provider",{ascending:true});
      if(response.error)return{status:"error",source:"supabase",message:"Restaurant social links read failed.",retryable:response.error.status!==401&&response.error.status!==403};
      const links=mapRestaurantSocialLinkRows(response.data??[],restaurantId);
      return links.length?{status:"available",source:"supabase",links}:{status:"empty",source:"supabase",links:[]};
    }catch{return{status:"error",source:"supabase",message:"Restaurant social links response was invalid.",retryable:true}}
  }
}
export class MockRestaurantSocialLinksRepository implements RestaurantSocialLinksRepository{
  async load():Promise<RestaurantSocialLinksResult>{return{status:"empty",source:"mock",links:[]}}
}
export class DisabledRestaurantSocialLinksRepository implements RestaurantSocialLinksRepository{
  async load():Promise<RestaurantSocialLinksResult>{return{status:"unavailable",source:"disabled",message:"Restaurant social links are unavailable."}}
}
