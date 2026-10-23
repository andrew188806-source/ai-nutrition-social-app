import {PHOTO_LIMITS,PHOTO_INPUT_BASE64,PHOTO_OUTPUT_BASE64} from './profile-photo-limits.ts';
export type PhotoRevision=string|null;
export type PhotoRequest={operation:'state'}|{operation:'removal-state'}|{operation:'preview';revision:string}|{operation:'put';requestId:string;expectedRevision:PhotoRevision;jpegBase64:string}|{operation:'remove';requestId:string;expectedRevision:PhotoRevision};
export type PhotoState={revision:PhotoRevision;present:boolean;lastRequestId:string|null};
export type PhotoResponse={version:'private-avatar-v1';state:PhotoState}|{version:'private-avatar-v1';preview:{revision:string;jpegBase64:string;width:number;height:number}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function parsePhotoRequest(v:unknown):PhotoRequest|null{
 if(!object(v))return null;
 if((v.operation==='state'||v.operation==='removal-state')&&exact(v,['operation']))return v as PhotoRequest;
 if(v.operation==='preview'&&exact(v,['operation','revision'])&&uuid(v.revision))return v as PhotoRequest;
 if((v.operation==='put'||v.operation==='remove')&&exact(v,v.operation==='put'?['operation','requestId','expectedRevision','jpegBase64']:['operation','requestId','expectedRevision'])&&uuid(v.requestId)&&(v.expectedRevision===null||uuid(v.expectedRevision))&&(v.operation==='remove'||typeof v.jpegBase64==='string'&&v.jpegBase64.length<=PHOTO_INPUT_BASE64))return v as PhotoRequest;
 return null;
}
export function parsePhotoResponse(v:unknown):PhotoResponse|null{
 if(!object(v)||v.version!=='private-avatar-v1')return null;
 if(exact(v,['version','state'])&&object(v.state)){const s=v.state;if(exact(s,['revision','present','lastRequestId'])&&(s.revision===null||uuid(s.revision))&&typeof s.present==='boolean'&&(s.lastRequestId===null||uuid(s.lastRequestId))&&(!s.present||s.revision!==null))return v as PhotoResponse;}
 if(exact(v,['version','preview'])&&object(v.preview)){const p=v.preview;if(exact(p,['revision','jpegBase64','width','height'])&&uuid(p.revision)&&typeof p.jpegBase64==='string'&&p.jpegBase64.length>0&&p.jpegBase64.length<=PHOTO_OUTPUT_BASE64&&/^[A-Za-z0-9+/]+={0,2}$/.test(p.jpegBase64)&&Number.isInteger(p.width)&&Number.isInteger(p.height)&&Number(p.width)>0&&Number(p.width)<=PHOTO_LIMITS.outputEdge&&Number(p.height)>0&&Number(p.height)<=PHOTO_LIMITS.outputEdge)return v as PhotoResponse;}
 return null;
}
