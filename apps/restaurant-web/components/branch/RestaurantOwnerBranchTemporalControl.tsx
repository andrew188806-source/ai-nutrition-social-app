"use client";import{useEffect,useState}from"react";import{previewTemporal,saveClosure,saveSpecial,saveWeekly}from"../../runtime/restaurant-owner-branch-temporal-client";import type{Interval,Preview,WeeklyInterval}from"../../runtime/restaurant-owner-branch-temporal";const days=["週一","週二","週三","週四","週五","週六","週日"];const fresh=(weekday:number):WeeklyInterval=>({weekday:weekday as WeeklyInterval["weekday"],startLocalTime:"09:00:00",endLocalTime:"18:00:00",endDayOffset:0});const freshInterval=():Interval=>({startLocalTime:"09:00:00",endLocalTime:"18:00:00",endDayOffset:0});const copy={OPEN:"營業中",CLOSED:"目前未營業",UNKNOWN:"尚未設定營業時間"}as const;
// Bounded copy for every state a mutation's own response can report; never the raw enum string.
const resultCopy:Record<string,string>={applied:"已成功儲存。",stale_state:"資料已被他人或其他分頁更新，畫面已重新整理為目前正式資料，請確認後再試一次。",no_change:"內容與目前正式資料相同，未產生變更。",invalid_request:"送出的內容不符合規則，請檢查後再試。",permission_denied:"您目前的身分沒有權限執行此操作。",target_not_found:"找不到此分店或項目。",unauthenticated:"登入狀態已失效，請重新登入。",lifecycle_blocked:"分店或餐廳目前的狀態不允許此操作（與 Admin 生命週期有關，非本畫面可調整）。",invalid_local_time:"所選時間在分店時區中無效或不明確（可能為夏令時間切換），請重新選擇或指定時段。",closure_conflict:"所選暫停營業時間與既有安排重疊。",dependency_unavailable:"服務暫時無法使用，請稍後再試。",internal_failure:"系統發生非預期錯誤，畫面已重新整理為目前正式資料。"};
type Fold="earlier"|"later"|null;
function FoldPicker({value,onChange}:{value:Fold;onChange:(v:Fold)=>void}){return <select value={value??""} onChange={e=>onChange(e.target.value===""?null:e.target.value as "earlier"|"later")}><option value="">一般時間</option><option value="earlier">較早的時刻（夏令時間結束前）</option><option value="later">較晚的時刻（夏令時間結束後）</option></select>;}
export function RestaurantOwnerBranchTemporalControl({branchId}:{branchId:string}){
  const[p,setP]=useState<Preview>({state:"dependency_unavailable"});
  const[weekly,setWeekly]=useState<WeeklyInterval[]>([]);
  const[date,setDate]=useState("");
  const[customIntervals,setCustomIntervals]=useState<Interval[]>([freshInterval()]);
  const[untilLocal,setUntilLocal]=useState("");const[untilFold,setUntilFold]=useState<Fold>(null);
  const[schedStartLocal,setSchedStartLocal]=useState("");const[schedStartFold,setSchedStartFold]=useState<Fold>(null);
  const[schedEndLocal,setSchedEndLocal]=useState("");const[schedEndFold,setSchedEndFold]=useState<Fold>(null);
  const[notice,setNotice]=useState<string|null>(null);const[busy,setBusy]=useState(false);
  const reload=async()=>{const x=await previewTemporal(branchId);setP(x);if(x.state==="ready")setWeekly([...x.weeklyHours])};
  useEffect(()=>{void reload()},[branchId]);
  if(p.state!=="ready")return <p className="mt-3 text-xs text-stone-500">營業時間控制不可用</p>;
  const mutate=async(fn:()=>Promise<{state:string}>)=>{setBusy(true);setNotice(null);const result=await fn();await reload();setNotice(resultCopy[result.state]??"已重新讀取正式資料。");setBusy(false)};
  const toLocalDateTime=(v:string)=>v.length===16?v:v; // <input type="datetime-local"> already yields YYYY-MM-DDTHH:MM
  const now=Date.now();
  return <div className="mt-4 space-y-5 border-t pt-4">
    <section>
      <h4 className="font-bold">營業時間</h4>
      <p className="text-xs text-stone-500">分店時區：{p.timezone} · 目前：{copy[p.currentState]}。時區僅供顯示，不能在此修改。</p>
      {days.map((name,i)=><div key={name} className="mt-2 rounded border p-2 text-xs"><b>{name}</b>{weekly.filter(x=>x.weekday===i+1).map((x,n)=><div className="mt-1 flex gap-1" key={n}><input type="time" value={x.startLocalTime.slice(0,5)} onChange={e=>setWeekly(v=>v.map(y=>y===x?{...y,startLocalTime:`${e.target.value}:00`}:y))}/><span>至</span><input type="time" value={x.endLocalTime.slice(0,5)} onChange={e=>setWeekly(v=>v.map(y=>y===x?{...y,endLocalTime:`${e.target.value}:00`}:y))}/><select value={x.endDayOffset} onChange={e=>setWeekly(v=>v.map(y=>y===x?{...y,endDayOffset:Number(e.target.value) as 0|1}:y))}><option value={0}>當日</option><option value={1}>翌日</option></select><button disabled={busy} onClick={()=>setWeekly(v=>v.filter(y=>y!==x))}>移除</button></div>)}<button disabled={busy} className="mt-1" onClick={()=>setWeekly(v=>[...v,fresh(i+1)])}>新增時段</button></div>)}
      <div className="mt-2 flex gap-2">
        <button disabled={busy} onClick={()=>{if(weekly.length===0&&!confirm("目前沒有任何時段。儲存後將變成「已設定為全週公休」，這與「尚未設定營業時間」不同且會被公開視為明確的公休設定。確定要儲存嗎？"))return;void mutate(()=>saveWeekly(branchId,{operation:"REPLACE_WEEKLY_SCHEDULE",intervals:weekly,expectedVersion:p.weeklyHoursVersion}))}}>儲存整週營業時間</button>
        <button disabled={busy} onClick={()=>{if(confirm("清除後將回到尚未設定營業時間。"))void mutate(()=>saveWeekly(branchId,{operation:"CLEAR_WEEKLY_SCHEDULE",expectedVersion:p.weeklyHoursVersion}))}}>清除營業時間設定</button>
      </div>
    </section>
    <section>
      <h4 className="font-bold">特殊日期</h4>
      <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      <p className="text-xs text-stone-500">使用分店本地日期；特殊設定會完全取代該日期起算的每週時段，不會合併。</p>
      <div className="mt-1 flex gap-2">
        <button disabled={!date||busy} onClick={()=>void mutate(()=>saveSpecial(branchId,{operation:"SET_CLOSED",localDate:date,expectedVersion:p.specialHoursVersion}))}>設為休息日</button>
        <button disabled={!date||busy} onClick={()=>void mutate(()=>saveSpecial(branchId,{operation:"CLEAR_OVERRIDE",localDate:date,expectedVersion:p.specialHoursVersion}))}>清除特殊設定</button>
      </div>
      <div className="mt-2 rounded border p-2 text-xs">
        <b>自訂當日營業時段</b>
        {customIntervals.map((x,n)=><div className="mt-1 flex gap-1" key={n}><input type="time" value={x.startLocalTime.slice(0,5)} onChange={e=>setCustomIntervals(v=>v.map((y,i)=>i===n?{...y,startLocalTime:`${e.target.value}:00`}:y))}/><span>至</span><input type="time" value={x.endLocalTime.slice(0,5)} onChange={e=>setCustomIntervals(v=>v.map((y,i)=>i===n?{...y,endLocalTime:`${e.target.value}:00`}:y))}/><select value={x.endDayOffset} onChange={e=>setCustomIntervals(v=>v.map((y,i)=>i===n?{...y,endDayOffset:Number(e.target.value) as 0|1}:y))}><option value={0}>當日</option><option value={1}>翌日</option></select><button disabled={busy} onClick={()=>setCustomIntervals(v=>v.filter((_,i)=>i!==n))}>移除</button></div>)}
        <div className="mt-1 flex gap-2">
          <button disabled={busy||customIntervals.length>=8} onClick={()=>setCustomIntervals(v=>[...v,freshInterval()])}>新增時段</button>
          <button disabled={!date||busy||customIntervals.length===0} onClick={()=>void mutate(()=>saveSpecial(branchId,{operation:"SET_CUSTOM_HOURS",localDate:date,intervals:customIntervals,expectedVersion:p.specialHoursVersion}))}>儲存當日自訂時段</button>
        </div>
      </div>
      {p.specialOverrides.length>0?<ul className="mt-2 text-xs text-stone-500">{p.specialOverrides.map(o=><li key={o.localDate}>{o.localDate}：{o.mode==="closed"?"休息":"自訂時段"}</li>)}</ul>:null}
    </section>
    <section>
      <h4 className="font-bold">暫停營業</h4>
      <p className="text-xs text-stone-500">僅能控制營運暫停，不能修改分店或餐廳的 Admin 生命週期狀態。</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button disabled={busy} onClick={()=>{if(confirm("確認立即暫停營業（不指定恢復時間）？"))void mutate(()=>saveClosure(branchId,{operation:"CLOSE_NOW_INDEFINITE",expectedVersion:p.operationalClosureVersion}))}}>立即暫停營業（不指定時間）</button>
      </div>
      <div className="mt-2 rounded border p-2 text-xs">
        <b>立即暫停至指定時間</b>
        <div className="mt-1 flex flex-wrap items-center gap-2"><input type="datetime-local" value={untilLocal} onChange={e=>setUntilLocal(e.target.value)}/><FoldPicker value={untilFold} onChange={setUntilFold}/><button disabled={!untilLocal||busy} onClick={()=>{if(!confirm("確認立即暫停營業至所選時間？"))return;void mutate(()=>saveClosure(branchId,{operation:"CLOSE_NOW_UNTIL",untilLocalDateTime:toLocalDateTime(untilLocal),fold:untilFold,expectedVersion:p.operationalClosureVersion}))}}>暫停至此時間</button></div>
        <p className="mt-1 text-stone-500">時間以分店本地時區解讀；若遇夏令時間切換造成的無效或不明確時刻，系統會提示重新選擇。</p>
      </div>
      <div className="mt-2 rounded border p-2 text-xs">
        <b>預約未來暫停營業</b>
        <div className="mt-1 flex flex-wrap items-center gap-2"><span>開始</span><input type="datetime-local" value={schedStartLocal} onChange={e=>setSchedStartLocal(e.target.value)}/><FoldPicker value={schedStartFold} onChange={setSchedStartFold}/></div>
        <div className="mt-1 flex flex-wrap items-center gap-2"><span>結束（選填）</span><input type="datetime-local" value={schedEndLocal} onChange={e=>setSchedEndLocal(e.target.value)}/><FoldPicker value={schedEndFold} onChange={setSchedEndFold}/></div>
        <button className="mt-1" disabled={!schedStartLocal||busy} onClick={()=>void mutate(()=>saveClosure(branchId,{operation:"SCHEDULE_CLOSURE",startLocalDateTime:toLocalDateTime(schedStartLocal),startFold:schedStartFold,endLocalDateTime:schedEndLocal?toLocalDateTime(schedEndLocal):null,endFold:schedEndLocal?schedEndFold:null,expectedVersion:p.operationalClosureVersion}))}>建立預約暫停</button>
      </div>
      {p.operationalClosures.length>0?<ul className="mt-2 space-y-1 text-xs">{p.operationalClosures.map(c=>{const started=Date.parse(c.startsAt)<=now;return <li key={c.closureId} className="flex items-center gap-2"><span className="text-stone-500">{c.startsAt}{c.endsAt?` → ${c.endsAt}`:"（未指定恢復時間）"}</span>{started?<button disabled={busy} onClick={()=>void mutate(()=>saveClosure(branchId,{operation:"REOPEN_NOW",closureId:c.closureId,expectedVersion:p.operationalClosureVersion}))}>立即恢復營業</button>:<button disabled={busy} onClick={()=>{if(confirm("取消此預約暫停？"))void mutate(()=>saveClosure(branchId,{operation:"CANCEL_FUTURE_CLOSURE",closureId:c.closureId,expectedVersion:p.operationalClosureVersion}))}}>取消預約</button>}</li>})}</ul>:null}
    </section>
    {notice?<p className="text-xs text-stone-600">{notice}</p>:null}
  </div>;
}
