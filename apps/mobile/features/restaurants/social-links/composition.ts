import {createAsyncStorageConsumerAuthStorage} from "../../consumer-auth/asyncStorageConsumerAuthStorage";
import {getConsumerRuntimeFlags} from "../../consumer-auth/featureFlags";
import {deriveLiveSupabaseClientFlags} from "../../consumer-auth/liveClientCompositionFlags";
import {getSupabaseConsumerEnvironment} from "../../consumer-auth/supabaseConsumerEnvironment";
import {SupabaseConsumerClientFactory} from "../../consumer-auth/supabaseConsumerClientFactory";
import {createOfficialSupabaseConsumerSdkLoader} from "../../consumer-auth/supabaseSdkLoader";
import {getRestaurantCatalogRuntimeFlags} from "../catalog/featureFlags";
import {DisabledRestaurantSocialLinksRepository,MockRestaurantSocialLinksRepository,SupabaseRestaurantSocialLinksRepository,type RestaurantSocialLinksRepository} from "./repository";
import type {RestaurantSocialLinkClientLike} from "./rowContract";
type Env=Record<string,string|undefined>;
export function createRestaurantSocialLinksComposition(env:Env=readEnv(),dependency:{client?:RestaurantSocialLinkClientLike}={}):RestaurantSocialLinksRepository{
  const flags=getRestaurantCatalogRuntimeFlags(env);
  if(flags.issues.length||flags.source==="disabled")return new DisabledRestaurantSocialLinksRepository();
  if(flags.source==="mock")return new MockRestaurantSocialLinksRepository();
  if(dependency.client)return new SupabaseRestaurantSocialLinksRepository(dependency.client);
  try{const authFlags=getConsumerRuntimeFlags(env);const factory=new SupabaseConsumerClientFactory({env:getSupabaseConsumerEnvironment(env),flags:deriveLiveSupabaseClientFlags(authFlags),storage:createAsyncStorageConsumerAuthStorage(),sdkLoader:createOfficialSupabaseConsumerSdkLoader()});
    return new SupabaseRestaurantSocialLinksRepository(factory.getOrCreateClient().client as unknown as RestaurantSocialLinkClientLike);
  }catch{return new DisabledRestaurantSocialLinksRepository()}
}
function readEnv():Env{const g=globalThis as typeof globalThis&{process?:{env?:Env}};return g.process?.env??{}}
