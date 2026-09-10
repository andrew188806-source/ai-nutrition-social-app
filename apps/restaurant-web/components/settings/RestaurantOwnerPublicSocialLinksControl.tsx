"use client";
import {useEffect,useRef,useState} from "react";
import {changePublicSocialLink,previewPublicSocialLink,publicSocialFailureCopy} from "../../runtime/restaurant-owner-public-social-links-client";
import {canonicalizePublicSocialUrl,PUBLIC_SOCIAL_PROVIDERS,PUBLIC_SOCIAL_PROVIDER_LABELS,type PublicSocialInput,type PublicSocialPreview,type PublicSocialProvider} from "../../runtime/restaurant-owner-public-social-links";
export function RestaurantOwnerPublicSocialLinksControl(){
  return <div className="space-y-5"><div><p className="text-sm font-black text-stone-800">公開社群連結</p><p className="mt-1 text-xs text-stone-500">每個平台只接受其官方 HTTPS 網址。</p></div>
    {PUBLIC_SOCIAL_PROVIDERS.map(provider=><ProviderControl key={provider} provider={provider}/>)}</div>;
}
function ProviderControl({provider}:{provider:PublicSocialProvider}){
  const [preview,setPreview]=useState<PublicSocialPreview>({state:"dependency_unavailable"});
  const [loading,setLoading]=useState(true),[next,setNext]=useState(""),[busy,setBusy]=useState(false);
  const [confirmation,setConfirmation]=useState<"set"|"clear"|null>(null),[notice,setNotice]=useState<string|null>(null);
  const pending=useRef(false);
  useEffect(()=>{let cancelled=false;void previewPublicSocialLink(provider).then(value=>{if(cancelled)return;setPreview(value);setNext(value.state==="ready"?value.publicUrl??"":"");setLoading(false)});return()=>{cancelled=true}},[provider]);
  if(loading)return <div className="border-t border-stone-100 pt-4 text-xs text-stone-500">正在讀取 {PUBLIC_SOCIAL_PROVIDER_LABELS[provider]}…</div>;
  if(preview.state!=="ready")return <div className="border-t border-stone-100 pt-4"><p className="text-sm font-bold">{PUBLIC_SOCIAL_PROVIDER_LABELS[provider]}</p><p className="text-xs text-stone-500">{publicSocialFailureCopy[preview.state]}</p></div>;
  const canonical=canonicalizePublicSocialUrl(provider,next),valid=canonical!==null&&canonical!==preview.publicUrl;
  const execute=async(action:"set"|"clear")=>{if(pending.current||(action==="set"&&!canonical))return;
    const input:PublicSocialInput=action==="set"?{action,url:canonical!,expectedUrl:preview.publicUrl,expectedVersion:preview.publicUrlVersion}:{action,expectedUrl:preview.publicUrl,expectedVersion:preview.publicUrlVersion};
    pending.current=true;setBusy(true);setConfirmation(null);try{const result=await changePublicSocialLink(preview,input);setPreview(result.preview);if(result.preview.state==="ready")setNext(result.preview.publicUrl??"");setNotice(result.notice)}finally{pending.current=false;setBusy(false)}};
  return <div className="space-y-2 border-t border-stone-100 pt-4"><p className="text-sm font-bold">{PUBLIC_SOCIAL_PROVIDER_LABELS[provider]}</p>
    <p className="break-all text-xs text-stone-500">{preview.publicUrl?`目前公開：${preview.publicUrl}`:"目前未發布"}</p>
    <input aria-label={`${PUBLIC_SOCIAL_PROVIDER_LABELS[provider]} HTTPS 網址`} type="url" className="w-full rounded border border-stone-300 p-2 text-sm" value={next} disabled={busy||confirmation!==null} onChange={e=>{setNext(e.target.value);setNotice(null)}} placeholder="https://"/>
    {next.length>0&&!canonical?<p role="alert" className="text-xs text-rose-700">網址必須是此平台官方主機的完整 HTTPS 網址，且不可包含憑證或控制字元。</p>:null}
    <div className="flex gap-2"><button type="button" className="rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={busy||confirmation!==null||!valid} onClick={()=>setConfirmation("set")}>{preview.publicUrl?"修改":"發布"}</button>
      {preview.publicUrl?<button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold disabled:opacity-50" disabled={busy||confirmation!==null} onClick={()=>setConfirmation("clear")}>清除</button>:null}</div>
    {confirmation?<div role="alertdialog" aria-label={`確認 ${PUBLIC_SOCIAL_PROVIDER_LABELS[provider]} 變更`} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>{confirmation==="set"?`確認發布「${canonical}」？`:`確認清除 ${PUBLIC_SOCIAL_PROVIDER_LABELS[provider]}？`}</p><p className="mt-1 text-xs text-stone-600">儲存後會立即反映在公開餐廳資料。</p><div className="mt-3 flex gap-2"><button type="button" className="rounded-md bg-rose-700 px-3 py-2 text-xs font-bold text-white" disabled={busy} onClick={()=>void execute(confirmation)}>確認</button><button type="button" className="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold" onClick={()=>setConfirmation(null)}>取消</button></div></div>:null}
    {notice?<p aria-live="polite" className="text-xs text-stone-600">{notice}</p>:null}</div>;
}
