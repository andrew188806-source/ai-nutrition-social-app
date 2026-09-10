import {isPublicSocialProvider,parsePublicSocialApiMutation,parsePublicSocialPreview,type PublicSocialFailure,type PublicSocialInput,type PublicSocialPreview,type PublicSocialProvider} from "./restaurant-owner-public-social-links";
const status={unauthenticated:401,permission_denied:403,invalid_request:400,target_not_found:404,stale_state:409,no_change:422,dependency_unavailable:503,internal_failure:500} as const;
const endpoint=(provider:PublicSocialProvider)=>`/api/restaurant/settings/social-links/${provider}`;
export const publicSocialFailureCopy:Record<PublicSocialFailure,string>={
  unauthenticated:"工作階段無法驗證，請重新登入。",
  permission_denied:"目前帳號沒有此餐廳的公開社群連結管理權限。",
  invalid_request:"社群連結與平台不相符或格式無效。",
  target_not_found:"找不到可管理的餐廳。",
  stale_state:"此平台連結已變更，已重新讀取；請重新確認。",
  no_change:"此平台連結未變更。",
  dependency_unavailable:"正式公開社群連結服務目前無法使用。",
  internal_failure:"正式社群連結回應未通過安全檢查。"
};
function failure(value:unknown,responseStatus:number):Readonly<{state:PublicSocialFailure}>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===1
    &&typeof (value as {state?:unknown}).state==="string"
    &&Object.hasOwn(status,(value as {state:string}).state)
    &&status[(value as {state:PublicSocialFailure}).state]===responseStatus
    ?{state:(value as {state:PublicSocialFailure}).state}:{state:"internal_failure"};
}
export async function previewPublicSocialLink(provider:PublicSocialProvider):Promise<PublicSocialPreview>{
  try{const response=await fetch(endpoint(provider),{method:"GET",cache:"no-store",credentials:"same-origin",redirect:"error",headers:{Accept:"application/json"}});
    const value:unknown=await response.json();if(response.status!==200)return failure(value,response.status);
    const parsed=parsePublicSocialPreview(value);return parsed?.state==="ready"&&parsed.provider===provider?parsed:{state:"internal_failure"};
  }catch{return{state:"dependency_unavailable"}}
}
export async function changePublicSocialLink(current:Extract<PublicSocialPreview,{state:"ready"}>,input:PublicSocialInput){
  let outcome:"applied"|PublicSocialFailure="dependency_unavailable",received=false;
  try{const response=await fetch(endpoint(current.provider),{method:"POST",cache:"no-store",credentials:"same-origin",redirect:"error",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(input)});
    const value:unknown=await response.json();received=true;
    if(response.status===200){const parsed=parsePublicSocialApiMutation(value);outcome=parsed?.state==="applied"&&parsed.provider===current.provider&&parsed.restaurantId===current.restaurantId?"applied":"internal_failure"}
    else outcome=failure(value,response.status).state;
  }catch{/* Exactly one explicit mutation request. */}
  const preview=await previewPublicSocialLink(current.provider);
  if(received&&outcome!=="applied")return{preview,notice:publicSocialFailureCopy[outcome]};
  const intended=input.action==="clear"?null:input.url;
  if(preview.state==="ready"&&preview.restaurantId===current.restaurantId&&preview.publicUrl===intended)return{preview,notice:"已重新讀取正式社群連結。"};
  return{preview,notice:"已重新讀取正式資料；系統不會自動重送。請確認最新連結後再明確操作。"};
}
export function readPublicSocialProvider(value:unknown){return isPublicSocialProvider(value)?value:null}
