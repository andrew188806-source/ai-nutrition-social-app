import {useCallback,useMemo,useState} from 'react';
import {useFocusEffect,useRouter} from 'expo-router';
import {Image,Pressable,ScrollView,Text,View} from 'react-native';
import {randomUUID} from 'expo-crypto';
import {useConsumerRuntime} from '../consumer-runtime/ConsumerRuntimeProvider';
import {ProfilePhotoController} from './controller';
import {createProfilePhotoRepository} from './repository';
import {ProfilePhotoMediaSession,retryPhotoTempCleanup} from './media';
const Button=({label,disabled=false,onPress}:{label:string;disabled?:boolean;onPress:()=>void})=><Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{padding:14,opacity:disabled?.4:1,borderWidth:1,borderRadius:10}}><Text>{label}</Text></Pressable>;
export function PhotoSession({actor,removalOnly=false}:{actor:string;removalOnly?:boolean}){
 const runtime=useConsumerRuntime();
 const controller=useMemo(()=>new ProfilePhotoController(runtime.mode==='supabase'?createProfilePhotoRepository():null,actor,removalOnly,randomUUID),[actor,removalOnly,runtime.mode]);
 const [state,setState]=useState(()=>controller.snapshot());const [confirm,setConfirm]=useState(false);const [picking,setPicking]=useState(false);
 const media=useMemo(()=>new ProfilePhotoMediaSession(),[]);
 useFocusEffect(useCallback(()=>{controller.activate();media.activate();const un=controller.subscribe(setState);setState(controller.snapshot());controller.cleanup(media.cleanupPending);void controller.load();return()=>{controller.dispose();media.dispose();un();setConfirm(false);};},[controller,media]));
 const busy=state.busy||picking;
 const pick=async()=>{if(busy)return;setPicking(true);try{const data=await media.pick();if(data)controller.setDraft(data);}catch{controller.setDraft(null);controller.notice('選圖或格式處理失敗，未儲存；請重新選擇。');}finally{controller.cleanup(media.cleanupPending);setPicking(false);}};
 return <View style={{gap:12,padding:12}}><Text>{removalOnly?'私人頭貼移除':'平台私人頭貼'}</Text><Text>{removalOnly?'只查詢本人是否有照片及移除，不讀取照片內容。':'此照片僅供本人預覽，不會發布給好友或陌生飯友。'}</Text>
 {state.phase==='loading'?<Text>正在讀取伺服器狀態…</Text>:null}
 {state.remote?<Text>{state.remote.present?'本人有一張私人縮圖。':'伺服器目前沒有私人照片。'}</Text>:null}
 {!removalOnly&&state.preview?<Image accessibilityLabel="伺服器回讀的本人私人頭貼" source={{uri:state.preview}} style={{width:160,height:160}}/>:null}
 {!removalOnly&&state.draft?<><Image accessibilityLabel="尚未儲存的本機預覽" source={{uri:'data:image/jpeg;base64,'+state.draft}} style={{width:160,height:160}}/><Text>尚未儲存</Text><Button label="確認儲存私人頭貼" disabled={busy} onPress={()=>void controller.save()}/><Button label="取消選圖" disabled={busy} onPress={()=>controller.setDraft(null)}/></>:null}
 {!removalOnly&&controller.canPut()?<Button label="選擇或替換照片" disabled={busy||state.phase!=='ready'} onPress={()=>void pick()}/>:null}
 {!removalOnly&&!controller.canPut()?<Text>目前模式未提供上傳；不會使用 Demo 寫入冒充儲存。</Text>:null}
 {state.phase==='unknown'?<><Text accessibilityRole="alert">{state.message}</Text><Button label="查證相同操作結果" disabled={busy} onPress={()=>void controller.reconcile()}/><Button label="重送相同請求" disabled={busy} onPress={()=>void controller.retrySame()}/></>:<><Text accessibilityRole="alert">{state.message}</Text><Button label="重新讀取" disabled={busy} onPress={()=>{setConfirm(false);void controller.load();}}/></>}
 {state.remote?.present&&state.phase==='ready'?<Button label="移除／撤回私人照片用途" disabled={busy} onPress={()=>setConfirm(true)}/>:null}
 {confirm&&state.phase==='ready'?<><Text>確認移除目前私人照片？不提供還原。</Text><Button label="確認移除目前照片" disabled={busy} onPress={()=>{setConfirm(false);void controller.remove();}}/><Button label="保留照片" disabled={busy} onPress={()=>setConfirm(false)}/></>:null}
 {state.cleanupPending?<><Text>本機暫存清理待重試；此狀態不代表伺服器移除失敗。</Text><Button label="重試本機暫存清理" onPress={()=>controller.cleanup(retryPhotoTempCleanup())}/></>:null}
 </View>;
}
export function ProfilePhotoRemovalPanel(){const runtime=useConsumerRuntime();if(runtime.state.authState.status!=='signedIn'||!runtime.state.actorKey)return null;return <PhotoSession key={runtime.mode+':'+runtime.state.actorKey+':'+runtime.state.actorGeneration+':remove'} actor={runtime.state.actorKey} removalOnly/>;}
export default function ProfilePhotoScreen(){const runtime=useConsumerRuntime(),router=useRouter();const actor=runtime.state.actorKey;return <ScrollView contentContainerStyle={{padding:20,gap:12}}>{actor?<PhotoSession key={runtime.mode+':'+actor+':'+runtime.state.actorGeneration} actor={actor}/>:<Text>請先登入。</Text>}<Button label="返回本人頁面" onPress={()=>router.replace('/me')}/></ScrollView>;}
