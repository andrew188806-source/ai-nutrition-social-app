import {RESTAURANT_SOCIAL_PROVIDERS,type RestaurantSocialLink,type RestaurantSocialProvider} from "./types";
import type {RestaurantSocialLinkRow} from "./rowContract";
const HOSTS:Record<RestaurantSocialProvider,readonly string[]>={
  instagram:["instagram.com","www.instagram.com"],facebook:["facebook.com","www.facebook.com"],
  line:["line.me","www.line.me","page.line.me","lin.ee"],threads:["threads.net","www.threads.net"],
  tiktok:["tiktok.com","www.tiktok.com"],youtube:["youtube.com","www.youtube.com"]
};
const provider=(value:unknown):RestaurantSocialProvider=>{
  if(typeof value!=="string"||!(RESTAURANT_SOCIAL_PROVIDERS as readonly string[]).includes(value))throw new Error("Unknown restaurant social provider.");
  return value as RestaurantSocialProvider;
};
const string=(value:unknown,field:string)=>{if(typeof value!=="string"||!value)throw new Error(`Malformed restaurant social ${field}.`);return value};
function url(p:RestaurantSocialProvider,value:unknown){
  const result=string(value,"public_url");if(/[\x00-\x1F\x7F-\x9F]/.test(result)||[...result].length>2048)throw new Error("Malformed restaurant social public_url.");
  try{const parsed=new URL(result);if(parsed.protocol!=="https:"||!parsed.hostname||parsed.username||parsed.password||parsed.href!==result||!HOSTS[p].includes(parsed.hostname.toLowerCase()))throw new Error("invalid")}
  catch{throw new Error("Malformed restaurant social public_url.")}
  return result;
}
export function mapRestaurantSocialLinkRows(rows:readonly RestaurantSocialLinkRow[],expectedRestaurantId:string):RestaurantSocialLink[]{
  const seen=new Set<RestaurantSocialProvider>();
  const links=rows.map(row=>{const restaurantId=string(row.restaurant_id,"restaurant_id");if(restaurantId!==expectedRestaurantId)throw new Error("Cross-restaurant social link rejected.");
    const p=provider(row.provider);if(seen.has(p))throw new Error("Duplicate restaurant social provider rejected.");seen.add(p);
    return{restaurantId,provider:p,publicUrl:url(p,row.public_url)};});
  return links.sort((a,b)=>RESTAURANT_SOCIAL_PROVIDERS.indexOf(a.provider)-RESTAURANT_SOCIAL_PROVIDERS.indexOf(b.provider));
}
