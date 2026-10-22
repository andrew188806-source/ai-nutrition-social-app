import {Directory,File,Paths} from 'expo-file-system';
import {launchImageLibraryAsync} from 'expo-image-picker';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
// Journal contains ONLY feature-created cache URIs, no bytes/actor/originals. Actual in-flight
// tasks protect their own resources. No render-time IO or unrelated module/global photo state.
const pendingCacheUris=new Set<string>();
const liveTasks=new Map<symbol,Set<string>>();const webPending=new Set<string>();
const isCacheFile=(uri:string)=>uri.startsWith(Paths.cache.uri.replace(/\/?$/,'/'));
function journal(){const d=new Directory(Paths.cache,'profile-photo-ph1');d.create({intermediates:true,idempotent:true});return new File(d,'owned-temp.json');}
function readJournal():string[]{const f=journal();if(!f.exists)return [];const data=JSON.parse(f.textSync());if(!Array.isArray(data)||!data.every(v=>typeof v==='string'&&isCacheFile(v)))throw Error('cleanup_manifest_invalid');return data;}
function writeJournal(values:string[]){journal().write(JSON.stringify([...new Set(values)]));}
function register(uri:string){if(typeof document!=='undefined'){if(uri.startsWith('blob:'))webPending.add(uri);return;}if(isCacheFile(uri)){pendingCacheUris.add(uri);writeJournal([...readJournal(),uri]);}}
export function retryPhotoTempCleanup():boolean{
 const live=new Set([...liveTasks.values()].flatMap(s=>[...s]));
 if(typeof document!=='undefined'){for(const uri of webPending){if(!live.has(uri)){URL.revokeObjectURL(uri);webPending.delete(uri);}}return false;}
 try{const remaining:string[]=[];for(const uri of new Set([...readJournal(),...pendingCacheUris])){if(live.has(uri)){remaining.push(uri);continue;}try{const f=new File(uri);if(f.exists)f.delete();pendingCacheUris.delete(uri);}catch{remaining.push(uri);}}writeJournal(remaining);return remaining.some(u=>!live.has(u));}catch{return true;}
}
export class ProfilePhotoMediaSession {
 private alive=false;private epoch=0;cleanupPending=false;
 activate(){this.alive=true;this.epoch++;this.cleanupPending=retryPhotoTempCleanup();}
 async pick():Promise<string|null>{if(!this.alive)return null;const epoch=this.epoch,task=Symbol(),owned=new Set<string>();liveTasks.set(task,owned);
 const current=()=>this.alive&&epoch===this.epoch;
 const track=(uri:string)=>{register(uri);owned.add(uri);};
 try{
  const selected=await launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:1,exif:false});
  if(selected.canceled)return null;const asset=selected.assets[0];track(asset.uri);if(!current())return null;
  const resize=asset.width>=asset.height?{width:Math.min(1024,asset.width)}:{height:Math.min(1024,asset.height)};
  const output=await manipulateAsync(asset.uri,[{resize}],{format:SaveFormat.JPEG,compress:.8,base64:true});track(output.uri);
  if(!current())return null;if(!output.base64||output.base64.length>349528)throw Error('photo_too_large');return output.base64;
 }finally{liveTasks.delete(task);owned.clear();this.cleanupPending=retryPhotoTempCleanup();}}
 dispose(){this.alive=false;this.epoch++;this.cleanupPending=retryPhotoTempCleanup();}
}
