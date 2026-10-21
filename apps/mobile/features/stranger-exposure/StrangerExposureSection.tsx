import {useCallback,useEffect,useMemo,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {ActivityIndicator,Image,Pressable,Text,View} from 'react-native';
import {getMascotSource} from '../../theme/components';
import {resolveSocialCandidateMascot} from '../social-candidates/mascotAdapter';
import {createStrangerRepository} from './repository';
import {StrangerController} from './controller';
import type {StrangerCandidate} from '../../../../packages/shared/src/domain/stranger-exposure';
const Button=({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean})=><Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{padding:12,opacity:disabled?0.5:1}}><Text>{label}</Text></Pressable>;
export function StrangerExposureSection({actorKey,actorGeneration,onFriends,onRecommend,geoOrigin}:{actorKey:string|null;actorGeneration:number;onFriends:()=>void;onRecommend:()=>void;geoOrigin?:{latitude:number;longitude:number}|null}){
 // Keyed child makes the first frame belong to this actor, before any effect runs.
 return <StrangerSession key={(actorKey??'signed-out')+':'+actorGeneration} actor={actorKey} onFriends={onFriends} onRecommend={onRecommend} geoOrigin={geoOrigin}/>;
}
function StrangerSession({actor,onFriends,onRecommend,geoOrigin}:{actor:string|null;onFriends:()=>void;onRecommend:()=>void;geoOrigin?:{latitude:number;longitude:number}|null}){
 const controller=useMemo(()=>new StrangerController(createStrangerRepository(),actor??''),[actor]);
 const [state,setState]=useState(()=>controller.getState());
 useEffect(()=>{controller.activate();const unsubscribe=controller.subscribe(setState);return ()=>{unsubscribe();controller.dispose();};},[controller,actor]);
 useFocusEffect(useCallback(()=>{if(actor)void controller.load();},[controller,actor]));
 const card=(candidate:StrangerCandidate)=><View key={candidate.ref} style={{padding:12,gap:8}}>
  <Image source={getMascotSource(resolveSocialCandidateMascot(candidate.mascotAvatarKey).mascotId)} style={{width:48,height:48}} accessible={false}/>
  <Text>{candidate.label}</Text><Text>{candidate.card.diningDate} · {candidate.card.mealPeriod}</Text>
  {candidate.card.restaurant?<Text>{candidate.card.restaurant.name??'指定餐廳'}</Text>:null}
  <Button label="查看飯友卡" disabled={state.busy} onPress={()=>{void controller.profile(candidate.ref);}}/>
  <Button label="送出好友邀請" disabled={state.busy} onPress={()=>{void controller.send(candidate.ref);}}/>
 </View>;
 if(!actor)return <Text>請先登入以使用陌生飯友探索。</Text>;
 return <View style={{padding:16,gap:12}}><Text>認識新飯友</Text>
  <Text>這是常駐探索入口。明確開啟後，你的有效飯友卡才會參與陌生配對；可隨時停止。配對與好友邀請不代表已訂桌、出席或建立實體飯局。</Text>
  <Button label="重新整理曝光與飯友卡" disabled={state.busy} onPress={()=>{void controller.load();}}/>
  <Button label="返回好友" onPress={()=>{if(controller.isActive())onFriends();}}/>
  {state.settings?<><Text>{state.settings.enabled?'陌生曝光已開啟':'陌生曝光已停止'}</Text>
   <Button label={state.settings.enabled?'停止陌生曝光':'開啟陌生曝光'} disabled={state.busy} onPress={()=>{void controller.set(!state.settings!.enabled);}}/>
  </>:null}
  {state.phase==='loading'?<><ActivityIndicator/><Text>正在向服務確認狀態…</Text></>:null}
  {state.phase==='error'?<><Text>{state.error==='state_changed'?'設定已變更，請重新讀取後再操作。':state.error==='photo_unavailable'?'真人照片安全展示尚未提供，此身份路徑目前不可用。':state.error==='exposure_or_social_access_required'?'請確認18歲以上聲明、社交同意及雙方曝光資格。':'服務或連線暫不可用；操作結果尚未確認，請重新讀取。'}</Text><Button label="重新讀取" onPress={()=>{void controller.load();}}/></>:null}
  {state.settings?.identity==='photo_unavailable'?<Text>Premium真人照片的安全展示尚未提供。未改用吉祥物冒充完成；可停止曝光。</Text>:null}
  {state.settings?.identity==='unavailable'?<Text>身份資格確認服務暫不可用；未推測會員等級，仍可停止陌生曝光。</Text>:null}
  {state.settings?.identity==='ineligible'?<Text>目前不符合社交資格；仍可停止陌生曝光。</Text>:null}
  {state.phase==='ready'&&state.settings?.enabled&&state.settings.identity==='mascot_ready'?<>
   <Text>Free陌生配對使用匿名名稱與既有平台吉祥物。</Text>
   {!state.cards.length?<><Text>尚無有效飯友卡，請從餐點推薦建立後返回。</Text><Button label="前往餐點推薦" onPress={()=>{if(controller.isActive())onRecommend();}}/></>:state.cards.map(source=><Button key={source.sourceCardRef} label={'使用飯友卡 '+source.diningDate+' '+source.mealPeriod} onPress={()=>{void controller.discover(source.sourceCardRef,geoOrigin??undefined);}}/>)}
   {state.candidates?.length===0?<Text>這次成功查詢沒有可顯示的合資格飯友。</Text>:null}
   {state.identityBlocked?<Text>部分身份展示尚未提供；未使用替代照片或假資料。</Text>:null}
   {state.candidates?.map(card)}{state.profile?card(state.profile):null}
  </>:null}
  {state.sent?<><Text>好友邀請狀態已由伺服器確認；請到好友清單查看。</Text><Button label="查看邀請與聊天" onPress={()=>{if(controller.isActive())onFriends();}}/></>:null}
 </View>;
}
