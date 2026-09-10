export const PUBLIC_SOCIAL_PROVIDERS =
  ["instagram","facebook","line","threads","tiktok","youtube"] as const;
export type PublicSocialProvider = typeof PUBLIC_SOCIAL_PROVIDERS[number];
export const PUBLIC_SOCIAL_PROVIDER_LABELS: Record<PublicSocialProvider,string> = {
  instagram:"Instagram",facebook:"Facebook",line:"LINE",threads:"Threads",tiktok:"TikTok",youtube:"YouTube"
};
const HOSTS: Record<PublicSocialProvider,readonly string[]> = {
  instagram:["instagram.com","www.instagram.com"],
  facebook:["facebook.com","www.facebook.com"],
  line:["line.me","www.line.me","page.line.me","lin.ee"],
  threads:["threads.net","www.threads.net"],
  tiktok:["tiktok.com","www.tiktok.com"],
  youtube:["youtube.com","www.youtube.com"]
};
export const RESTAURANT_OWNER_PUBLIC_SOCIAL_PREVIEW_RPC="restaurant_owner_preview_public_social_link_v1" as const;
export const RESTAURANT_OWNER_PUBLIC_SOCIAL_MUTATION_RPC="restaurant_owner_set_public_social_link_v2" as const;
export const RESTAURANT_OWNER_PUBLIC_SOCIAL_BODY_LIMIT=16384 as const;
const VERSION=/^(0|[1-9][0-9]{0,18})$/,CONTROL=/[\x00-\x1F\x7F-\x9F]/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isPublicSocialProvider=(v:unknown):v is PublicSocialProvider=>
  typeof v==="string"&&(PUBLIC_SOCIAL_PROVIDERS as readonly string[]).includes(v);
export function canonicalizePublicSocialUrl(provider:PublicSocialProvider,value:string):string|null{
  if(CONTROL.test(value))return null;const trimmed=value.trim();if(!trimmed)return null;
  try{const parsed=new URL(trimmed);if(parsed.protocol!=="https:"||!parsed.hostname||parsed.username||parsed.password
    ||!HOSTS[provider].includes(parsed.hostname.toLowerCase()))return null;
    const canonical=parsed.href;return !CONTROL.test(canonical)&&[...canonical].length<=2048?canonical:null;
  }catch{return null}
}
export const isCanonicalPublicSocialUrl=(p:PublicSocialProvider,v:unknown):v is string=>
  typeof v==="string"&&canonicalizePublicSocialUrl(p,v)===v;
export type PublicSocialFailure="unauthenticated"|"permission_denied"|"invalid_request"|"target_not_found"|"stale_state"|"no_change"|"dependency_unavailable"|"internal_failure";
export type PublicSocialPreview=
  |Readonly<{ok:true;state:"ready";restaurantId:string;provider:PublicSocialProvider;publicUrl:string|null;publicUrlVersion:string}>
  |Readonly<{state:PublicSocialFailure}>;
export type PublicSocialInput=
  |Readonly<{action:"set";url:string;expectedUrl:string|null;expectedVersion:string}>
  |Readonly<{action:"clear";expectedUrl:string|null;expectedVersion:string}>;
export type PublicSocialMutation=
  |Readonly<{state:"applied";restaurantId:string;provider:PublicSocialProvider;publicUrl:string|null;publicUrlVersion:string}>
  |Readonly<{state:PublicSocialFailure}>;
const record=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>{const a=Object.keys(v).sort(),e=[...keys].sort();return a.length===e.length&&a.every((k,i)=>k===e[i])};
const version=(v:unknown):v is string=>typeof v==="string"&&VERSION.test(v);
const id=(v:unknown):v is string=>typeof v==="string"&&ID.test(v);
export function parsePublicSocialInput(provider:PublicSocialProvider,value:unknown):PublicSocialInput|null{
  if(!record(value)||!version(value.expectedVersion))return null;
  if(value.expectedUrl!==null&&!isCanonicalPublicSocialUrl(provider,value.expectedUrl))return null;
  if(value.action==="set"&&exact(value,["action","url","expectedUrl","expectedVersion"])&&typeof value.url==="string"){
    const url=canonicalizePublicSocialUrl(provider,value.url);
    return url?{action:"set",url,expectedUrl:value.expectedUrl as string|null,expectedVersion:value.expectedVersion}:null;
  }
  return value.action==="clear"&&exact(value,["action","expectedUrl","expectedVersion"])
    ?{action:"clear",expectedUrl:value.expectedUrl as string|null,expectedVersion:value.expectedVersion}:null;
}
function failure(v:Record<string,unknown>,allowed:readonly PublicSocialFailure[]){
  return exact(v,["ok","errorCode"])&&v.ok===false&&typeof v.errorCode==="string"
    &&allowed.includes(v.errorCode as PublicSocialFailure)?v.errorCode as PublicSocialFailure:null;
}
export function parsePublicSocialPreview(value:unknown):PublicSocialPreview|null{
  if(!record(value))return null;const f=failure(value,["unauthenticated","permission_denied","invalid_request","target_not_found"]);if(f)return{state:f};
  if(!exact(value,["ok","state","restaurantId","provider","publicUrl","publicUrlVersion"])||value.ok!==true||value.state!=="ready"
    ||!id(value.restaurantId)||!isPublicSocialProvider(value.provider)
    ||(value.publicUrl!==null&&!isCanonicalPublicSocialUrl(value.provider,value.publicUrl))||!version(value.publicUrlVersion))return null;
  return{ok:true,state:"ready",restaurantId:value.restaurantId,provider:value.provider,publicUrl:value.publicUrl as string|null,publicUrlVersion:value.publicUrlVersion};
}
export function parsePublicSocialMutation(value:unknown):PublicSocialMutation|null{
  if(!record(value))return null;const f=failure(value,["unauthenticated","permission_denied","invalid_request","target_not_found","stale_state","no_change"]);if(f)return{state:f};
  if(!exact(value,["ok","state","restaurantId","provider","publicUrl","publicUrlVersion","auditId"])||value.ok!==true||value.state!=="applied"
    ||!id(value.restaurantId)||!isPublicSocialProvider(value.provider)
    ||(value.publicUrl!==null&&!isCanonicalPublicSocialUrl(value.provider,value.publicUrl))||!version(value.publicUrlVersion)
    ||typeof value.auditId!=="string"||!UUID.test(value.auditId))return null;
  return{state:"applied",restaurantId:value.restaurantId,provider:value.provider,publicUrl:value.publicUrl as string|null,publicUrlVersion:value.publicUrlVersion};
}
export function parsePublicSocialApiMutation(value:unknown):PublicSocialMutation|null{
  if(!record(value)||!exact(value,["state","restaurantId","provider","publicUrl","publicUrlVersion"])||value.state!=="applied"
    ||!id(value.restaurantId)||!isPublicSocialProvider(value.provider)
    ||(value.publicUrl!==null&&!isCanonicalPublicSocialUrl(value.provider,value.publicUrl))||!version(value.publicUrlVersion))return null;
  return{state:"applied",restaurantId:value.restaurantId,provider:value.provider,publicUrl:value.publicUrl as string|null,publicUrlVersion:value.publicUrlVersion};
}
