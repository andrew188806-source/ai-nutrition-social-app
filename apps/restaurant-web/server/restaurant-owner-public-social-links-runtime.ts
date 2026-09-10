import "server-only";
import {getVerifiedRestaurantClaims} from "../auth/supabase-server";
import {getRestaurantDataSourceConfig} from "../config/restaurant-data-source";
import {createRestaurantOwnerPublicSocialLinksRepository} from "../repositories/supabase/restaurant-owner-public-social-links-repository";
import {loadRestaurantAccessContext} from "../runtime/restaurant-access-context";
import {isPublicSocialProvider,parsePublicSocialInput,RESTAURANT_OWNER_PUBLIC_SOCIAL_BODY_LIMIT,type PublicSocialInput,type PublicSocialMutation,type PublicSocialPreview} from "../runtime/restaurant-owner-public-social-links";
type Result=PublicSocialPreview|PublicSocialMutation;
const statuses={ready:200,applied:200,unauthenticated:401,permission_denied:403,invalid_request:400,target_not_found:404,stale_state:409,no_change:422,dependency_unavailable:503,internal_failure:500} as const;
const json=(r:Result)=>Response.json(r,{status:statuses[r.state],headers:{"Cache-Control":"private, no-store",Vary:"Cookie","X-Content-Type-Options":"nosniff"}});
async function auth(){if(getRestaurantDataSourceConfig().dataSource!=="supabase")return"dependency_unavailable" as const;try{return await getVerifiedRestaurantClaims()?"verified" as const:"unauthenticated" as const}catch{return"dependency_unavailable" as const}}
export async function previewPublicSocial(request:Request,providerValue:unknown){
  if([...new URL(request.url).searchParams.keys()].length||!isPublicSocialProvider(providerValue))return json({state:"invalid_request"});
  const a=await auth();if(a!=="verified")return json({state:a});
  try{const access=await loadRestaurantAccessContext();if(access.state!=="selected")return json({state:access.state==="missing-identity"?"unauthenticated":"permission_denied"});
    const result=await createRestaurantOwnerPublicSocialLinksRepository().preview(access.restaurant.id,providerValue);
    return result.state==="ready"&&(result.restaurantId!==access.restaurant.id||result.provider!==providerValue)?json({state:"internal_failure"}):json(result);
  }catch{return json({state:"dependency_unavailable"})}
}
export async function mutatePublicSocial(request:Request,providerValue:unknown){
  if([...new URL(request.url).searchParams.keys()].length||!isPublicSocialProvider(providerValue))return json({state:"invalid_request"});
  const length=request.headers.get("content-length"),type=request.headers.get("content-type")?.split(";",1)[0]?.trim().toLowerCase();
  if(type!=="application/json"||(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>RESTAURANT_OWNER_PUBLIC_SOCIAL_BODY_LIMIT)))return json({state:"invalid_request"});
  const a=await auth();if(a!=="verified")return json({state:a});let input:PublicSocialInput|null;
  try{const body=await request.text();if(new TextEncoder().encode(body).byteLength>RESTAURANT_OWNER_PUBLIC_SOCIAL_BODY_LIMIT)return json({state:"invalid_request"});input=parsePublicSocialInput(providerValue,JSON.parse(body))}catch{return json({state:"invalid_request"})}
  if(!input)return json({state:"invalid_request"});
  try{const access=await loadRestaurantAccessContext();if(access.state!=="selected")return json({state:access.state==="missing-identity"?"unauthenticated":"permission_denied"});
    const result=await createRestaurantOwnerPublicSocialLinksRepository().mutate(access.restaurant.id,providerValue,input);
    return result.state==="applied"&&(result.restaurantId!==access.restaurant.id||result.provider!==providerValue)?json({state:"internal_failure"}):json(result);
  }catch{return json({state:"dependency_unavailable"})}
}
