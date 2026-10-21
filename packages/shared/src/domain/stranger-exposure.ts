export type StrangerSettings={enabled:boolean;revision:string|null;identity:'mascot_ready'|'photo_unavailable'|'ineligible'|'not_evaluated'|'unavailable'};
export type StrangerCandidate={ref:string;label:string;mascotAvatarKey:string;card:{diningDate:string;mealPeriod:string;intentionType:string;restaurant:{restaurantId:string;name:string|null}|null};interests:{generalCategoryKeys:readonly string[];generalOverflowCount:number;foodCategoryKeys:readonly string[];foodOverflowCount:number}};
export type StrangerRequest={operation:'read'}|{operation:'set';enabled:boolean;revision:string|null}|{operation:'discover';sourceCardRef:string;geoOrigin?:{latitude:number;longitude:number}}|{operation:'profile';ref:string}|{operation:'send';ref:string};
export type StrangerResponse={policyVersion:'stranger-exposure-v1';settings:StrangerSettings}|{policyVersion:'stranger-exposure-v1';candidates:readonly StrangerCandidate[];identityBlocked:boolean}|{policyVersion:'stranger-exposure-v1';profile:StrangerCandidate}|{policyVersion:'stranger-exposure-v1';relationshipRef:string;state:'incoming_pending'|'outgoing_pending'|'accepted'};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,s:string)=>Object.keys(v).sort().join(',')===s;
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function parseStrangerRequest(v:unknown):StrangerRequest|null{
 if(!object(v))return null;
 if(keys(v,'operation')&&v.operation==='read')return {operation:'read'};
 if(keys(v,'enabled,operation,revision')&&v.operation==='set'&&typeof v.enabled==='boolean'&&(v.revision===null||uuid(v.revision)))return v as StrangerRequest;
 if((keys(v,'operation,sourceCardRef')||keys(v,'geoOrigin,operation,sourceCardRef'))&&v.operation==='discover'&&typeof v.sourceCardRef==='string'&&/^mbc1\.[A-Za-z0-9_-]+$/.test(v.sourceCardRef)&&v.sourceCardRef.length<=2048){if(v.geoOrigin!==undefined&&(!object(v.geoOrigin)||!keys(v.geoOrigin,'latitude,longitude')||typeof v.geoOrigin.latitude!=='number'||!Number.isFinite(v.geoOrigin.latitude)||Math.abs(v.geoOrigin.latitude)>90||typeof v.geoOrigin.longitude!=='number'||!Number.isFinite(v.geoOrigin.longitude)||Math.abs(v.geoOrigin.longitude)>180))return null;return v as StrangerRequest;}
 if(keys(v,'operation,ref')&&(v.operation==='profile'||v.operation==='send')&&typeof v.ref==='string'&&/^str1\.[A-Za-z0-9_-]+$/.test(v.ref)&&v.ref.length<=2048)return v as StrangerRequest;return null;
}
function candidate(v:unknown):v is StrangerCandidate{
 if(!object(v)||!keys(v,'card,interests,label,mascotAvatarKey,ref')||typeof v.ref!=='string'||!/^str1\.[A-Za-z0-9_-]+$/.test(v.ref)||v.ref.length>2048||v.label!=='匿名飯友'||typeof v.mascotAvatarKey!=='string'||!v.mascotAvatarKey||!object(v.card)||!keys(v.card,'diningDate,intentionType,mealPeriod,restaurant')||!object(v.interests)||!keys(v.interests,'foodCategoryKeys,foodOverflowCount,generalCategoryKeys,generalOverflowCount'))return false;
 const c=v.card,i=v.interests;return typeof c.diningDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.diningDate)&&['breakfast','lunch','dinner','late_night'].includes(c.mealPeriod as string)&&['chat_first','eat_together'].includes(c.intentionType as string)&&(c.restaurant===null||(object(c.restaurant)&&keys(c.restaurant,'name,restaurantId')&&typeof c.restaurant.restaurantId==='string'&&(c.restaurant.name===null||typeof c.restaurant.name==='string')))&&[i.foodCategoryKeys,i.generalCategoryKeys].every(x=>Array.isArray(x)&&x.length<=3&&x.every(y=>typeof y==='string'))&&[i.foodOverflowCount,i.generalOverflowCount].every(x=>Number.isInteger(x)&&(x as number)>=0);
}
export function parseStrangerResponse(v:unknown):StrangerResponse|null{
 if(!object(v)||v.policyVersion!=='stranger-exposure-v1')return null;
 if(keys(v,'policyVersion,settings')&&object(v.settings)&&keys(v.settings,'enabled,identity,revision')&&typeof v.settings.enabled==='boolean'&&(v.settings.revision===null||uuid(v.settings.revision))&&['mascot_ready','photo_unavailable','ineligible','not_evaluated','unavailable'].includes(v.settings.identity as string))return v as StrangerResponse;
 if(keys(v,'candidates,identityBlocked,policyVersion')&&Array.isArray(v.candidates)&&v.candidates.length<=10&&v.candidates.every(candidate)&&typeof v.identityBlocked==='boolean')return v as StrangerResponse;
 if(keys(v,'policyVersion,profile')&&candidate(v.profile))return v as StrangerResponse;
 if(keys(v,'policyVersion,relationshipRef,state')&&typeof v.relationshipRef==='string'&&/^mbr1\.[A-Za-z0-9_-]+$/.test(v.relationshipRef)&&['incoming_pending','outgoing_pending','accepted'].includes(v.state as string))return v as StrangerResponse;return null;
}
