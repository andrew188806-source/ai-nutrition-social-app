import type {PhotoRequest,PhotoState} from '../../../../packages/shared/src/domain/profile-photo';
import type {PhotoPort} from './repository';
export type PhotoScreenState={phase:'idle'|'loading'|'ready'|'error'|'unknown'|'unavailable';busy:boolean;remote:PhotoState|null;preview:string|null;draft:string|null;message:string|null;cleanupPending:boolean;authRequired:boolean};
const copy:Record<string,string>={invalid_photo:'照片格式、大小或影像內容不符限制，尚未儲存。',state_changed:'照片已更新，請重新讀取後再確認操作。',request_reused:'本次請求內容不一致，請重新讀取。',owner_or_core_required:'目前帳號或必要授權不允許讀寫；仍可於帳號授權頁移除私人照片。',authentication_required:'登入已變更，請重新登入。',upload_unavailable:'目前未提供上傳。',retryable_failure:'交易未完成，請重新讀取後重試。'};
const explain=(code:string)=>copy[code]??'服務或連線暫時不可用；未能確認照片狀態。';
type Mutation=Extract<PhotoRequest,{operation:'put'|'remove'}>;
export class ProfilePhotoController {
 private active=true;private epoch=0;private pending:Mutation|null=null;private uncertain=false;private listeners=new Set<(s:PhotoScreenState)=>void>();
 private state:PhotoScreenState={phase:'idle',busy:false,remote:null,preview:null,draft:null,message:null,cleanupPending:false,authRequired:false};
 constructor(private port:PhotoPort|null,private actor:string,public removalOnly=false,private requestId:()=>string=()=>crypto.randomUUID()){}
 activate(){this.active=true;}
 snapshot=()=>this.state;
 subscribe=(fn:(s:PhotoScreenState)=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
 private set(s:Partial<PhotoScreenState>){if(!this.active)return;this.state={...this.state,...s};for(const l of this.listeners)l(this.state);}
 dispose(){this.active=false;this.epoch++;this.pending=null;this.uncertain=false;this.state={phase:'idle',busy:false,remote:null,preview:null,draft:null,message:null,cleanupPending:false,authRequired:false};for(const l of this.listeners)l(this.state);this.listeners.clear();}
 notice(message:string){this.set({message});}
 canPut(){return !!this.port?.canPut&&!this.removalOnly;}
 setDraft(value:string|null){if(this.state.busy||this.pending||this.removalOnly)return;this.set({draft:value,message:value?'尚未儲存；請確認後儲存。':null});}
 cleanup(pending:boolean){this.set({cleanupPending:pending});}
 private async read(){if(!this.port)throw Error('service_unavailable');const result=await this.port.execute(this.actor,{operation:this.removalOnly?'removal-state':'state'});if(!('state' in result))throw Error('invalid_server_response');return result.state;}
 private async preview(remote:PhotoState){if(this.removalOnly||!remote.present||!remote.revision)return null;if(!this.port)throw Error();const r=await this.port.execute(this.actor,{operation:'preview',revision:remote.revision});if(!('preview' in r)||r.preview.revision!==remote.revision)throw Error('state_changed');return 'data:image/jpeg;base64,'+r.preview.jpegBase64;}
 async load(){if(this.state.busy||this.pending||!this.active)return;if(!this.port||!this.actor){this.set({phase:'unavailable',remote:null,preview:null,message:explain('service_unavailable')});return;}const epoch=++this.epoch;this.set({phase:'loading',busy:true,remote:null,preview:null,message:null,authRequired:false});try{const remote=await this.read();if(!this.active||epoch!==this.epoch)return;const preview=await this.preview(remote);if(this.active&&epoch===this.epoch)this.set({phase:'ready',busy:false,remote,preview});}catch(e){if(this.active&&epoch===this.epoch)this.set({phase:'error',busy:false,remote:null,preview:null,authRequired:e instanceof Error&&e.message==='authentication_required',message:explain(e instanceof Error?e.message:'service_unavailable')});}}
 async save(){if(!this.canPut()||!this.state.draft||!this.state.remote||this.state.busy||this.pending)return;this.pending={operation:'put',requestId:this.requestId(),expectedRevision:this.state.remote.revision,jpegBase64:this.state.draft};await this.send();}
 async remove(){if(!this.state.remote||this.state.busy||this.pending)return;this.pending={operation:'remove',requestId:this.requestId(),expectedRevision:this.state.remote.revision};await this.send();}
 private async finish(remote:PhotoState,epoch:number){if(!this.active||epoch!==this.epoch)return;const preview=await this.preview(remote);if(!this.active||epoch!==this.epoch)return;this.pending=null;this.uncertain=false;this.set({phase:'ready',busy:false,remote,preview,draft:null,authRequired:false,message:remote.present?'伺服器已儲存並回讀私人縮圖。':'伺服器確認目前沒有私人照片。'});}
 private async send(){
  if(!this.port||!this.pending||!this.active)return;
  const epoch=++this.epoch,request=this.pending,wasUncertain=this.uncertain;let responseReceived=false;
  this.set({busy:true,message:null,authRequired:false});
  try{const r=await this.port.execute(this.actor,request);if(!('state' in r))throw Error('invalid_server_response');responseReceived=true;await this.finish(r.state,epoch);}
  catch(e){if(!this.active||epoch!==this.epoch)return;const code=e instanceof Error?e.message:'outcome_unknown';
   const refused=['invalid_photo','state_changed','request_reused','owner_or_core_required','authentication_required','upload_unavailable','retryable_failure','invalid_request'].includes(code);
   if(refused&&!wasUncertain&&!responseReceived){this.pending=null;this.uncertain=false;this.set({phase:'error',busy:false,remote:null,preview:null,draft:null,authRequired:code==='authentication_required',message:explain(code)});}
   else {this.uncertain=true;this.set({phase:'unknown',busy:false,remote:null,preview:null,draft:null,authRequired:code==='authentication_required',message:wasUncertain&&refused?'本次重送被拒絕，但先前結果仍未確認。請查證目前狀態。':'結果尚未確認；請查證，不代表儲存或移除成功。'});}
  }
 }
 async reconcile(){
  if(this.state.busy||!this.pending||!this.active)return;const epoch=++this.epoch;this.set({busy:true,authRequired:false});
  try{const remote=await this.read();if(!this.active||epoch!==this.epoch)return;
   if(remote.lastRequestId===this.pending.requestId&&remote.present===(this.pending.operation==='put'))await this.finish(remote,epoch);
   else this.set({phase:'unknown',busy:false,remote,preview:null,message:'尚無法確認本次結果，可用相同請求重查；不會自動新增操作。'});
  }catch(e){if(this.active&&epoch===this.epoch)this.set({phase:'unknown',busy:false,authRequired:e instanceof Error&&e.message==='authentication_required',message:'查證失敗，結果仍未確認。'});}
 }
 async retrySame(){if(this.state.busy||!this.pending||!this.active)return;await this.send();}
}
