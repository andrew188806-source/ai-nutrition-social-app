import "server-only";
import {createRestaurantSupabaseServerClient} from "../../auth/supabase-server";
import {parsePublicSocialMutation,parsePublicSocialPreview,RESTAURANT_OWNER_PUBLIC_SOCIAL_MUTATION_RPC,RESTAURANT_OWNER_PUBLIC_SOCIAL_PREVIEW_RPC,type PublicSocialInput,type PublicSocialProvider} from "../../runtime/restaurant-owner-public-social-links";
export function createRestaurantOwnerPublicSocialLinksRepository(){
  const client=createRestaurantSupabaseServerClient();
  return{
    async preview(restaurantId:string,provider:PublicSocialProvider){
      const result=await client.rpc(RESTAURANT_OWNER_PUBLIC_SOCIAL_PREVIEW_RPC,{p_restaurant_id:restaurantId,p_provider:provider});
      if(result.error)throw new Error("public-social unavailable");
      return parsePublicSocialPreview(result.data)??{state:"internal_failure" as const};
    },
    async mutate(restaurantId:string,provider:PublicSocialProvider,input:PublicSocialInput){
      const result=await client.rpc(RESTAURANT_OWNER_PUBLIC_SOCIAL_MUTATION_RPC,{
        p_restaurant_id:restaurantId,p_provider:provider,p_operation:input.action,
        p_expected_public_url:input.expectedUrl,p_next_public_url:input.action==="set"?input.url:null,
        p_expected_version:input.expectedVersion
      });
      if(result.error)throw new Error("public-social unavailable");
      return parsePublicSocialMutation(result.data)??{state:"internal_failure" as const};
    }
  };
}
