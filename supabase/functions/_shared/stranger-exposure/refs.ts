// Dedicated purpose/key, actor-bound AES-GCM; never an ordinary/phone scr1 or card mbc1.
export type StrangerClaims={target:string;source:string;card:string;actorRevision:string;targetRevision:string;issued:number;expires:number};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const bytes=(b:Uint8Array)=>new Uint8Array(b).buffer;
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function createStrangerCipher(key:Uint8Array){
 if(key.length!==32)throw Error('invalid_ref_key');
 const imported=crypto.subtle.importKey('raw',bytes(key),'AES-GCM',false,['encrypt','decrypt']);
 return {
 async seal(actor:string,claims:Omit<StrangerClaims,'issued'|'expires'>,now:Date){
  const iv=crypto.getRandomValues(new Uint8Array(12));const plain={...claims,issued:now.getTime(),expires:now.getTime()+86400000};
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:bytes(iv),additionalData:bytes(enc.encode('str1|'+actor))},await imported,bytes(enc.encode(JSON.stringify(plain)))));
  const all=new Uint8Array(12+cipher.length);all.set(iv);all.set(cipher,12);return 'str1.'+b64(all);
 },
 async open(actor:string,token:string,now:Date):Promise<StrangerClaims>{
  if(typeof token!=='string'||token.length>2048||!/^str1\.[A-Za-z0-9_-]+$/.test(token))throw Error('invalid_ref');
  try{let data=token.slice(5).replaceAll('-','+').replaceAll('_','/');data=data.padEnd(Math.ceil(data.length/4)*4,'=');const all=Uint8Array.from(atob(data),x=>x.charCodeAt(0));
   const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(all.slice(0,12)),additionalData:bytes(enc.encode('str1|'+actor))},await imported,bytes(all.slice(12)));
   const c=JSON.parse(dec.decode(plain));
   if(Object.keys(c).sort().join(',')!=='actorRevision,card,expires,issued,source,target,targetRevision'||![c.target,c.source,c.card,c.actorRevision,c.targetRevision].every(uuid)||!Number.isSafeInteger(c.issued)||!Number.isSafeInteger(c.expires)||c.expires!==c.issued+86400000||now.getTime()<c.issued||now.getTime()>=c.expires)throw Error('invalid_ref');return c;
  }catch{throw Error('invalid_ref');}
 }};
}
