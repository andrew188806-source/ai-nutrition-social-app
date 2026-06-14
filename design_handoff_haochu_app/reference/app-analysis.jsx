// app-analysis.jsx — 分析 (photo analysis flow) + 飯友 (meal buddies)
// Exported to window: AnalysisScreen, BuddiesScreen
const { useState: useStateAB } = React;

// shared small bits
function ScreenTitle({ T, title, sub }) {
  return (
    <div style={{ padding: '4px 4px 0' }}>
      <div style={{ fontFamily: T.text, fontSize: 25, fontWeight: 800, color: T.ink, letterSpacing: 0.3 }}>{title}</div>
      <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Chip({ T, active, children, onClick }) {
  return (
    <button onClick={onClick} style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      fontFamily: T.text, fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999,
      border: `1px solid ${active ? hexA(T.primary, 0.3) : hexA(T.line, 0.9)}`,
      background: active ? T.primarySoft : T.card, color: active ? T.primaryDeep : T.sub }}>{children}</button>
  );
}

// ═══ 分析 — meal photo analysis flow ═══════════════════════════════
const ANALYSIS = {
  dish: '烤雞腿便當', confidence: 92, kcal: 640,
  candidates: [
    { name: '唐揚雞便當', conf: 84 },
    { name: '雞腿飯', conf: 78 },
  ],
  macros: [
    { label: '蛋白質', value: 34, unit: 'g', tone: 'primary' },
    { label: '碳水', value: 72, unit: 'g', tone: 'accent' },
    { label: '脂肪', value: 22, unit: 'g', tone: 'amber' },
    { label: '纖維', value: 6, unit: 'g', tone: 'green' },
  ],
  items: [
    { name: '烤雞腿', portion: '1 支', kcal: 280, tag: '高蛋白', tone: 'primary' },
    { name: '白飯', portion: '半碗', kcal: 140, tag: '', tone: 'accent' },
    { name: '燙青菜', portion: '2 份', kcal: 60, tag: '高纖', tone: 'green' },
    { name: '玉子燒', portion: '1 塊', kcal: 90, tag: '', tone: 'amber' },
    { name: '滷汁醬料', portion: '少許', kcal: 70, tag: '', tone: 'amber' },
  ],
  note: '蛋白質很充足，白飯減半的選擇很聰明。青菜兩份纖維有顧到，整體很均衡。',
};

function AnalysisScreen({ T, onAddMeal, onBuddies, onRestaurant, onHome, onDinner, onNextMeal }) {
  const [stage, setStage] = useStateAB('idle'); // idle | analyzing | result | added
  const [meal, setMeal] = useStateAB('lunch');
  const [dish, setDish] = useStateAB(ANALYSIS.dish);   // AI guess, switchable via candidates
  const [correcting, setCorrecting] = useStateAB(false);
  const [manual, setManual] = useStateAB(false);       // no-photo manual entry
  const mealOpts = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '點心']];
  const toneColor = { primary: T.primary, accent: T.accent, amber: T.amber, green: T.green };
  const mealLabel = (mealOpts.find(m => m[0] === meal) || [])[1];

  const start = () => { setDish(ANALYSIS.dish); setCorrecting(false); setStage('analyzing'); setTimeout(() => setStage('result'), 1300); };

  return (
    <div style={{ padding: '8px 16px 8px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ScreenTitle T={T} title="拍照分析" sub="拍一張，AI 幫你估算營養與食材" />

      {/* 今日快捷 — lightweight shortcuts into the daily overview */}
      {(stage === 'idle' || stage === 'analyzing') && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -16px', padding: '0 16px' }}>
          {[['target', '今日摘要', onHome], ['plate', '今天吃了什麼', onHome], ['star', '今晚預定', onDinner], ['spark', '下一餐建議', onNextMeal]].map(([ic, l, fn]) => (
            <button key={l} onClick={fn} style={{ flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: T.text, fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 999,
              border: `1px solid ${hexA(T.line, 0.9)}`, background: T.card, color: T.sub, boxShadow: T.shadowSoft }}>
              <Icon name={ic} size={14} color={T.primaryDeep} fill={ic === 'spark' ? T.primaryDeep : 'none'} stroke={ic === 'spark' ? 0 : 2.1} />{l}
            </button>
          ))}
        </div>
      )}

      {/* photo capture */}
      <div style={{ borderRadius: T.r, overflow: 'hidden', position: 'relative', height: 178,
        background: stage === 'result' || stage === 'added'
          ? `linear-gradient(150deg, ${T.amber}, ${T.accent})`
          : `linear-gradient(150deg, ${T.heroFrom}, ${T.aiSoft})`,
        border: stage === 'idle' ? `1.5px dashed ${hexA(T.ai, 0.4)}` : 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        {stage === 'idle' && <>
          <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap', background: hexA(T.ai, 0.14), padding: '5px 10px', borderRadius: 999 }}>
            <Icon name="spark" size={12} color={T.ai} fill={T.ai} stroke={0} />
            <span style={{ fontFamily: T.text, fontSize: 10.5, fontWeight: 700, color: T.ai }}>AI 食物辨識</span>
          </div>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: hexA('#fff', 0.85),
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft }}>
            <Icon name="camera" size={26} color={T.ai} stroke={1.9} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>拍一張，AI 幫你看這餐</div>
            <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2 }}>拍照或上傳餐點照片都可以</div>
          </div>
        </>}
        {stage === 'analyzing' && <>
          <div className="kc-spin" style={{ width: 46, height: 46, borderRadius: 999,
            border: `3px solid ${hexA(T.ai, 0.25)}`, borderTopColor: T.ai }} />
          <span style={{ fontFamily: T.text, fontSize: 13, color: T.ai, fontWeight: 700 }}>AI 正在分析你的餐點…</span>
        </>}
        {(stage === 'result' || stage === 'added') && <>
          <Icon name="plate" size={46} color={hexA('#fff', 0.85)} stroke={1.6} />
          <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 5,
            whiteSpace: 'nowrap', background: hexA('#fff', 0.9), padding: '5px 10px', borderRadius: 999 }}>
            <Icon name="spark" size={13} color={T.ai} fill={T.ai} stroke={0} />
            <span style={{ fontFamily: T.text, fontSize: 11, fontWeight: 700, color: T.ai }}>AI 信心 {ANALYSIS.confidence}%</span>
          </div>
          <div style={{ position: 'absolute', bottom: 12, left: 14, fontFamily: T.text, fontSize: 11,
            fontWeight: 600, color: hexA('#fff', 0.95), background: hexA(T.ink, 0.25), padding: '4px 10px', borderRadius: 999 }}>示範照片</div>
        </>}
      </div>

      {(stage === 'idle' || stage === 'analyzing') && <>
        {/* meal selector */}
        <div>
          <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink, marginBottom: 10, padding: '0 2px' }}>這是第幾餐？</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {mealOpts.map(([k, l]) => (
              <button key={k} onClick={() => setMeal(k)} style={{ flex: 1, cursor: 'pointer',
                fontFamily: T.text, fontSize: 13, fontWeight: 700, padding: '11px 0', borderRadius: T.rSm,
                border: `1px solid ${meal === k ? 'transparent' : hexA(T.line, 0.9)}`,
                background: meal === k ? T.primarySoft : T.card, color: meal === k ? T.primaryDeep : T.sub }}>{l}</button>
            ))}
          </div>
        </div>
        <button onClick={start} disabled={stage === 'analyzing'} style={{ width: '100%', cursor: 'pointer', border: 'none',
          borderRadius: T.rSm, padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800, color: '#fff',
          background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
          opacity: stage === 'analyzing' ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="spark" size={17} color="#fff" fill="#fff" stroke={0} />{stage === 'analyzing' ? '分析中…' : '開始分析'}
        </button>
        {stage === 'idle' && <>
          <button onClick={() => setManual(v => !v)} style={{ width: '100%', background: 'none', border: 'none',
            cursor: 'pointer', fontFamily: T.text, fontSize: 13, fontWeight: 600, color: T.sub, padding: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="edit" size={14} color={T.sub} stroke={2.1} />沒有照片？手動輸入餐點
          </button>
          {manual && (
            <Card T={T} className="kc-pop" style={{ padding: '14px 16px 16px' }}>
              <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: T.ink, marginBottom: 12 }}>手動輸入一餐</div>
              {[['餐點名稱', '例：筍仔約麥頭'], ['熱量（可略）', '例：520 大卡']].map(([lab, ph]) => (
                <div key={lab} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: T.text, fontSize: 11, fontWeight: 700, color: T.faint, marginBottom: 6 }}>{lab}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', background: T.bg2,
                    borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.9)}` }}>
                    <Icon name="plate" size={15} color={T.faint} stroke={2} />
                    <span style={{ fontFamily: T.text, fontSize: 13, color: T.faint }}>{ph}</span>
                  </div>
                </div>
              ))}
              <button onClick={() => { setManual(false); setStage('added'); }} style={{ width: '100%', marginTop: 4, cursor: 'pointer',
                border: 'none', borderRadius: T.rSm, padding: '13px', fontFamily: T.text, fontSize: 14, fontWeight: 800, color: T.solidText,
                background: T.solid, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Icon name="plus" size={16} color={T.solidText} stroke={2.6} />加入今日飲食
              </button>
            </Card>
          )}
        </>}
      </>}

      {(stage === 'result' || stage === 'added') && <div className="kc-pop" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* result card */}
        <Card T={T} style={{ padding: '18px 18px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontFamily: T.text, fontSize: 19, fontWeight: 800, color: T.ink }}>{dish}</div>
              <span style={{ fontFamily: T.text, fontSize: 11, fontWeight: 700, color: T.primaryDeep,
                background: T.primarySoft, padding: '3px 9px', borderRadius: 999, display: 'inline-block', marginTop: 6 }}>{mealLabel}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 700, color: T.primaryDeep, lineHeight: 1 }}>{ANALYSIS.kcal}</div>
              <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub }}>大卡</div>
            </div>
          </div>
          {/* macro chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {ANALYSIS.macros.map(m => (
              <div key={m.label} style={{ flex: 1, background: T.bg2, borderRadius: T.rSm, padding: '10px 6px', textAlign: 'center' }}>
                <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 700, color: toneColor[m.tone] }}>{m.value}<span style={{ fontSize: 10, color: T.sub }}>{m.unit}</span></div>
                <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub, marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 候補餐點 + 以上皆非 / 手動修正 */}
        <Card T={T} style={{ padding: '13px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11 }}>
            <Icon name="search" size={14} color={T.sub} stroke={2.2} />
            <span style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: T.ink }}>不是「{dish}」嗎？</span>
            <span style={{ fontFamily: T.text, fontSize: 11, color: T.faint }}>選候補或手動修正</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ANALYSIS.candidates.map(c => {
              const on = dish === c.name;
              return (
                <button key={c.name} onClick={() => { setDish(c.name); setCorrecting(false); }}
                  style={{ cursor: 'pointer', fontFamily: T.text, fontSize: 12.5, fontWeight: 600,
                    padding: '7px 12px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 5,
                    border: `1px solid ${on ? 'transparent' : hexA(T.line, 0.9)}`,
                    background: on ? T.primarySoft : T.bg2, color: on ? T.primaryDeep : T.sub }}>
                  {on && <Icon name="check" size={12} color={T.primaryDeep} stroke={2.8} />}
                  {c.name}<span style={{ fontFamily: T.display, fontSize: 10.5, color: T.faint }}>{c.conf}%</span>
                </button>
              );
            })}
            <button onClick={() => setCorrecting(v => !v)} style={{ cursor: 'pointer', fontFamily: T.text,
              fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 999,
              border: `1px dashed ${hexA(T.primary, 0.5)}`, background: 'transparent', color: T.primaryDeep,
              display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="edit" size={13} color={T.primaryDeep} stroke={2.1} />以上皆非・手動修正
            </button>
          </div>
          {correcting && (
            <div className="kc-pop" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 13px',
                background: T.bg2, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.9)}` }}>
                <Icon name="plate" size={15} color={T.faint} stroke={2} />
                <span style={{ fontFamily: T.text, fontSize: 13, color: T.faint, padding: '11px 0' }}>輸入正確餐點名稱…</span>
              </div>
              <button onClick={() => setCorrecting(false)} style={{ flexShrink: 0, cursor: 'pointer', border: 'none',
                borderRadius: T.rSm, padding: '0 18px', fontFamily: T.text, fontSize: 13, fontWeight: 700,
                color: '#fff', background: T.primary }}>儲存</button>
            </div>
          )}
        </Card>

        {/* ingredient breakdown */}
        <div>
          <div style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink, padding: '0 2px 10px' }}>食材拆解</div>
          <Card T={T} style={{ padding: '4px 16px' }}>
            {ANALYSIS.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0',
                borderBottom: i < ANALYSIS.items.length - 1 ? `1px solid ${hexA(T.line, 0.8)}` : 'none' }}>
                <div style={{ width: 9, height: 9, borderRadius: 999, background: toneColor[it.tone], flexShrink: 0 }} />
                <span style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 600, color: T.ink }}>{it.name}</span>
                <span style={{ fontFamily: T.text, fontSize: 11.5, color: T.faint }}>{it.portion}</span>
                {it.tag && <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 600, color: T.primaryDeep,
                  background: T.primarySoft, padding: '2px 7px', borderRadius: 999 }}>{it.tag}</span>}
                <span style={{ marginLeft: 'auto', fontFamily: T.display, fontSize: 13, fontWeight: 700, color: T.sub }}>{it.kcal}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* AI note */}
        <div style={{ display: 'flex', gap: 10, padding: '13px 15px', background: T.aiSoft, borderRadius: T.rSm }}>
          <Icon name="spark" size={15} color={T.ai} fill={T.ai} stroke={0} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: T.text, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
            <b style={{ color: T.ai }}>AI 營養師</b>：{ANALYSIS.note}</span>
        </div>

        {/* CTAs */}
        {stage === 'result' ? <>
          <button onClick={() => setStage('added')} style={{ width: '100%', cursor: 'pointer', border: 'none',
            borderRadius: T.rSm, padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800, color: '#fff',
            background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="plus" size={17} color="#fff" stroke={2.6} />加入今日飲食
          </button>
          <button onClick={onBuddies} style={{ width: '100%', cursor: 'pointer', borderRadius: T.rSm,
            padding: '14px', fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.primaryDeep,
            background: T.card, border: `1.5px solid ${hexA(T.primary, 0.35)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="buddies" size={18} color={T.primaryDeep} stroke={2.1} />這餐想找人一起吃
          </button>
          <button onClick={onRestaurant} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: T.text, fontSize: 13, fontWeight: 600, color: T.sub, padding: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="pin" size={14} color={T.sub} stroke={2.1} />看附近均衡餐廳推薦<Icon name="chevron" size={14} color={T.sub} stroke={2.4} />
          </button>
        </> : <>
          <div className="kc-cheer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '2px 0 6px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: hexA(T.green, 0.16),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 38, height: 38, borderRadius: 999, background: T.green,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={22} color="#fff" stroke={2.8} />
              </div>
            </div>
            <span style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.primaryDeep }}>記錄完成，做得很好！</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
            background: hexA(T.green, 0.12), borderRadius: T.rSm, border: `1px solid ${hexA(T.green, 0.3)}` }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, background: T.green, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={15} color="#fff" stroke={2.8} />
            </div>
            <span style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>已加入今日{mealLabel} · 飲食已更新</span>
          </div>
          <button onClick={() => { onAddMeal && onAddMeal(); }} style={{ width: '100%', cursor: 'pointer', border: 'none',
            borderRadius: T.rSm, padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.solidText,
            background: T.solid, boxShadow: T.shadowSoft }}>回首頁看今日摘要</button>
          <button onClick={() => setStage('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: T.text, fontSize: 13, fontWeight: 600, color: T.sub, padding: 4 }}>再分析一餐</button>
        </>}
      </div>}
    </div>
  );
}

// ═══ 飯友 — meal buddy matching ════════════════════════════════════
function TasteTags({ T, tags }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(t => (
        <span key={t} style={{ fontFamily: T.text, fontSize: 10.5, fontWeight: 600, color: T.sub,
          background: T.bg2, border: `1px solid ${hexA(T.line, 0.9)}`, padding: '3px 9px', borderRadius: 999 }}>{t}</span>
      ))}
    </div>
  );
}

function BuddyCard({ T, card, locked, invited, onInvite, onUnlock }) {
  const anon = card.type === 'anon';
  return (
    <Card T={T} style={{ padding: '16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ filter: locked ? 'blur(5px)' : 'none', pointerEvents: locked ? 'none' : 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PersonAvatar T={T} person={card} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: T.text, fontSize: 15, fontWeight: 700, color: T.ink }}>{card.name}</span>
              <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700,
                color: anon ? T.sub : T.green, background: anon ? T.bg2 : hexA(T.green, 0.14),
                padding: '2px 7px', borderRadius: 999 }}>{anon ? '匿名卡' : '真人卡'}</span>
            </div>
            <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 3 }}>{card.area} · {card.dist} · {card.when}</div>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color: T.primaryDeep, lineHeight: 1 }}>{card.match}%</div>
            <div style={{ fontFamily: T.text, fontSize: 9.5, color: T.faint }}>合拍</div>
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <TasteTags T={T} tags={card.taste} />
          <button onClick={onInvite} disabled={invited} style={{ flexShrink: 0, cursor: invited ? 'default' : 'pointer',
            fontFamily: T.text, fontSize: 12.5, fontWeight: 700, padding: '8px 13px', borderRadius: 999, border: 'none',
            color: invited ? T.green : '#fff', background: invited ? hexA(T.green, 0.14) : T.primary,
            display: 'flex', alignItems: 'center', gap: 5 }}>
            {invited ? <><Icon name="check" size={13} color={T.green} stroke={2.8} />已邀請</> : <><Icon name="invite" size={14} color="#fff" stroke={2.1} />邀請</>}
          </button>
        </div>
      </div>
      {locked && (
        <button onClick={onUnlock} style={{ position: 'absolute', inset: 0, cursor: 'pointer', border: 'none',
          background: hexA(T.blush, 0.55), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 38, height: 38, borderRadius: 999, background: T.blush, border: `1px solid ${hexA(T.ink, 0.08)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft }}>
            <Icon name="lock" size={18} color={T.sub} stroke={2.2} />
          </div>
          <span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.sub }}>Premium 解鎖真人卡</span>
        </button>
      )}
    </Card>
  );
}

function BuddiesScreen({ T, plan, myRestaurantCard, onUpgrade, onTable, onChat, onCreateCard, onInvites, onSearch }) {
  const [invited, setInvited] = useStateAB({});
  const isPremium = plan === 'premium';
  const stats = [
    { label: '我的卡', value: 1, icon: 'cardPlus', onClick: onCreateCard },
    { label: '已配對', value: INVITES.matched.length, icon: 'check', onClick: () => onInvites('matched') },
    { label: '邀請中', value: INVITES.sent.length, icon: 'invite', onClick: () => onInvites('sent'), dot: INVITES.received.length },
    { label: '聊天', value: 2, icon: 'chat', onClick: onChat, dot: 2 },
  ];
  return (
    <div style={{ padding: '8px 16px 8px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ScreenTitle T={T} title="飯友" sub="找口味相近的人，一起吃得更均衡" />

      {/* search meal buddies */}
      <button onClick={onSearch} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: T.card,
        borderRadius: T.r, border: `1px solid ${hexA(T.line, 0.7)}`, boxShadow: T.shadowSoft, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
        <Icon name="search" size={17} color={T.faint} stroke={2.1} />
        <span style={{ flex: 1, fontFamily: T.text, fontSize: 13, color: T.faint }}>搜尋飯友（區域、口味、暱稱）</span>
      </button>

      {/* compact status strip: 我的卡 / 已配對 / 邀請中 / 聊天 */}
      <div style={{ display: 'flex', gap: 8 }}>
        {stats.map(s => (
          <button key={s.label} onClick={s.onClick} style={{ flex: 1, cursor: 'pointer', position: 'relative',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.7)}`, boxShadow: T.shadowSoft,
            padding: '12px 6px 11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Icon name={s.icon} size={16} color={T.primaryDeep} stroke={2} />
            <span style={{ fontFamily: T.display, fontSize: 19, fontWeight: 700, color: T.ink, lineHeight: 1.1 }}>{s.value}</span>
            <span style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub }}>{s.label}</span>
            {s.dot > 0 && <span style={{ position: 'absolute', top: 8, right: 10, minWidth: 15, height: 15, padding: '0 3px',
              borderRadius: 999, background: T.primary, color: '#fff', fontFamily: T.display, fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${T.card}` }}>{s.dot}</span>}
          </button>
        ))}
      </div>

      {/* primary actions: 飯友桌 / 建立飯友卡 */}
      <div style={{ display: 'flex', gap: 11 }}>
        <button onClick={onTable} style={{ flex: 1, cursor: 'pointer', border: 'none', borderRadius: T.rSm,
          padding: '14px 12px', background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          fontFamily: T.text, fontSize: 14, fontWeight: 800, color: '#fff' }}>
          <Icon name="table4" size={18} color="#fff" stroke={2.1} />飯友桌
        </button>
        <button onClick={onCreateCard} style={{ flex: 1, cursor: 'pointer', borderRadius: T.rSm,
          padding: '14px 12px', background: T.card, border: `1.5px solid ${hexA(T.primary, 0.35)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.primaryDeep }}>
          <Icon name="cardPlus" size={18} color={T.primaryDeep} stroke={2.1} />建立飯友卡
        </button>
      </div>

      {/* card created from a restaurant */}
      {myRestaurantCard && (
        <Card T={T} lift className="kc-pop" style={{ padding: 0, overflow: 'hidden', border: `1.5px solid ${hexA(T.primary, 0.4)}` }}>
          <div style={{ background: `linear-gradient(135deg, ${T.heroFrom}, ${T.heroTo})`, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>你建立的飯友卡</span>
            <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 700, color: '#fff', background: T.primary, padding: '3px 9px', borderRadius: 999 }}>新 · 等待加入</span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: T.primarySoft, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plate" size={22} color={T.primaryDeep} stroke={1.9} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.text, fontSize: 14.5, fontWeight: 700, color: T.ink }}>{myRestaurantCard.name}</div>
              <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2 }}>{myRestaurantCard.cuisine} · 今晚想揪一起吃</div>
            </div>
          </div>
        </Card>
      )}

      {/* my buddy card */}
      <div>
        <div style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink, padding: '0 2px 10px' }}>我的飯友卡</div>
        <Card T={T} style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`, padding: '18px 18px 16px',
            display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 52, height: 52, borderRadius: 999, background: hexA('#fff', 0.9), flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.text, fontSize: 20, fontWeight: 800, color: T.primaryDeep }}>{MY_CARD.avatar}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.text, fontSize: 17, fontWeight: 800, color: '#fff' }}>{MY_CARD.name}</div>
              <div style={{ fontFamily: T.text, fontSize: 11.5, color: hexA('#fff', 0.9), marginTop: 2 }}>{MY_CARD.area} · {MY_CARD.when}</div>
            </div>
            <button onClick={onCreateCard} style={{ cursor: 'pointer', border: 'none', background: hexA('#fff', 0.85), borderRadius: 999,
              padding: '7px 12px', fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep,
              display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="edit" size={13} color={T.primaryDeep} stroke={2.1} />編輯
            </button>
          </div>
          <div style={{ padding: '14px 18px 16px' }}>
            <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginBottom: 10 }}>目標：{MY_CARD.goal}</div>
            <TasteTags T={T} tags={MY_CARD.taste} />
          </div>
        </Card>
      </div>

      {/* available buddies */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 10px' }}>
          <span style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink }}>今日可約飯友</span>
          <span style={{ fontFamily: T.text, fontSize: 12, color: T.sub }}>{BUDDY_CARDS.length} 位</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {BUDDY_CARDS.map(c => {
            const locked = c.type === 'real' && !isPremium;
            return <BuddyCard key={c.id} T={T} card={c} locked={locked} invited={!!invited[c.id]}
              onInvite={() => setInvited(s => ({ ...s, [c.id]: true }))} onUnlock={onUpgrade} />;
          })}
        </div>
      </div>

      {/* anon vs real + premium difference */}
      <Card T={T} style={{ padding: '16px 18px' }}>
        <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: T.ink, marginBottom: 12 }}>匿名卡 vs 真人卡</div>
        {[['eyeOff', '匿名卡', '免費版即可瀏覽與邀約，保護隱私先聊聊', true],
          ['user', '真人卡', '看見真實頭像與暱稱，配對更安心', isPremium]].map(([ic, t, d, on], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
            borderTop: i ? `1px solid ${hexA(T.line, 0.8)}` : 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0,
              background: on ? T.primarySoft : T.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={ic} size={17} color={on ? T.primaryDeep : T.faint} stroke={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: on ? T.ink : T.faint }}>{t}</div>
              <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 1 }}>{d}</div>
            </div>
            {on ? <Icon name="check" size={16} color={T.green} stroke={2.6} />
                : <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: T.primaryDeep,
                    background: T.primarySoft, padding: '2px 8px', borderRadius: 999 }}>PRO</span>}
          </div>
        ))}
        {!isPremium && (
          <button onClick={onUpgrade} style={{ width: '100%', marginTop: 12, cursor: 'pointer', border: 'none',
            borderRadius: T.rSm, padding: '13px', fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: '#fff',
            background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="spark" size={15} color="#fff" fill="#fff" stroke={0} />升級解鎖真人卡配對
          </button>
        )}
      </Card>
    </div>
  );
}

// ═══ 飯友桌 hub — create 4/6/8 · active / upcoming / invites / past ═══
function FourSeatSheet({ T, onShare, plan, onUpgrade, createdTableRest }) {
  const [size, setSize] = useStateAB(4);
  const isPremium = plan === 'premium';
  const sizeLocked = (size === 6 || size === 8) && !isPremium;
  const SectionTitle = ({ children, extra }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 11px' }}>
      <span style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: T.ink }}>{children}</span>
      {extra}
    </div>
  );

  // active tables: the standing one + any created from a restaurant
  const active = [];
  if (createdTableRest) active.push({ id: 'new', title: `${createdTableRest.name}・四人桌`, when: '今晚', place: createdTableRest.cuisine, isNew: true });

  return (
    <div>
      {/* create a table */}
      <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: T.ink, marginBottom: 11 }}>建立飯友桌</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[[4, '4 人', '免費'], [6, '6 人', 'PRO'], [8, '8 人', 'PRO']].map(([n, l, tag]) => {
          const on = size === n;
          return (
            <button key={n} onClick={() => setSize(n)} style={{ flex: 1, cursor: 'pointer', position: 'relative',
              padding: '14px 8px', borderRadius: T.rSm, background: on ? T.primarySoft : T.card,
              border: `1.5px solid ${on ? hexA(T.primary, 0.45) : hexA(T.line, 0.9)}` }}>
              <Icon name="table4" size={18} color={on ? T.primaryDeep : T.sub} stroke={2} />
              <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: on ? T.ink : T.sub, marginTop: 6 }}>{l}</div>
              <span style={{ fontFamily: T.text, fontSize: 9, fontWeight: 700, marginTop: 3, display: 'inline-block',
                color: tag === '免費' ? T.green : T.primaryDeep,
                background: tag === '免費' ? hexA(T.green, 0.14) : T.primarySoft, padding: '2px 7px', borderRadius: 999 }}>{tag}</span>
            </button>
          );
        })}
      </div>
      {sizeLocked ? (
        <button onClick={onUpgrade} style={{ width: '100%', cursor: 'pointer', border: 'none', borderRadius: T.rSm,
          padding: '14px', fontFamily: T.text, fontSize: 14, fontWeight: 800, color: '#fff',
          background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Icon name="lock" size={15} color="#fff" stroke={2.2} />升級 Premium 解鎖 {size} 人桌
        </button>
      ) : (
        <button onClick={onShare} style={{ width: '100%', cursor: 'pointer', border: 'none', borderRadius: T.rSm,
          padding: '14px', fontFamily: T.text, fontSize: 14, fontWeight: 800, color: '#fff',
          background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          <Icon name="plus" size={16} color="#fff" stroke={2.6} />建立 {size} 人桌並邀請飯友
        </button>
      )}

      {/* my active table(s) */}
      <SectionTitle extra={<span style={{ fontFamily: T.text, fontSize: 10.5, fontWeight: 700, color: T.primaryDeep,
        background: T.primarySoft, padding: '3px 9px', borderRadius: 999 }}>還缺 2 位</span>}>我的桌</SectionTitle>
      {active.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', marginBottom: 11,
          background: T.card, borderRadius: T.rSm, border: `1.5px solid ${hexA(T.primary, 0.4)}`, boxShadow: T.shadowSoft }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: T.primarySoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="table4" size={18} color={T.primaryDeep} stroke={2} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{a.title}</div>
            <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{a.when} · {a.place}</div>
          </div>
          <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 700, color: '#fff', background: T.primary,
            padding: '3px 9px', borderRadius: 999, flexShrink: 0 }}>新</span>
        </div>
      ))}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink }}>{TABLE.title}</div>
            <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 3 }}>{TABLE.when} · {TABLE.place}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {TABLE.seats.map((s, i) => {
            const open = s.role === 'open';
            return (
              <div key={i} style={{ borderRadius: T.rSm, padding: '14px 12px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 7, background: open ? T.bg2 : T.card,
                border: open ? `1.5px dashed ${hexA(T.primary, 0.45)}` : `1px solid ${hexA(T.line, 0.8)}`,
                boxShadow: open ? 'none' : T.shadowSoft }}>
                <div style={{ width: 42, height: 42, borderRadius: 999,
                  background: open ? 'transparent' : `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
                  border: open ? `1.5px dashed ${T.faint}` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.text, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                  {open ? <Icon name="plus" size={19} color={T.faint} stroke={2.4} /> : s.avatar}</div>
                <div style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: open ? T.faint : T.ink }}>
                  {open ? '空位' : s.name}</div>
                {s.role === 'host'
                  ? <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: T.primaryDeep, background: T.primarySoft, padding: '2px 8px', borderRadius: 999 }}>主揪</span>
                  : s.role === 'joined'
                  ? <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: T.green, background: hexA(T.green, 0.14), padding: '2px 8px', borderRadius: 999 }}>已加入</span>
                  : <span style={{ fontFamily: T.text, fontSize: 10.5, fontWeight: 600, color: T.primary }}>邀請好友</span>}
              </div>
            );
          })}
        </div>
        <button onClick={onShare} style={{ width: '100%', marginTop: 12, cursor: 'pointer', border: 'none', borderRadius: T.rSm,
          padding: '13px', fontFamily: T.text, fontSize: 14, fontWeight: 800, color: '#fff',
          background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="share" size={16} color="#fff" stroke={2.2} />分享邀請連結，湊滿這桌
        </button>
      </div>

      {/* upcoming tables */}
      <SectionTitle>即將開桌</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {UPCOMING_TABLES.map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="table4" size={17} color={T.primaryDeep} stroke={2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.ink }}>{u.title}</div>
              <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{u.when} · {u.place}</div>
            </div>
            <span style={{ fontFamily: T.text, fontSize: 10.5, fontWeight: 700, color: T.sub, flexShrink: 0 }}>{u.joined}/{u.size}</span>
          </div>
        ))}
      </div>

      {/* invitations to tables */}
      <SectionTitle>桌邀請</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {TABLE_INVITES.map(t => (
          <div key={t.id} style={{ padding: '13px 14px', background: T.card, borderRadius: T.rSm,
            border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.primarySoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="table4" size={17} color={T.primaryDeep} stroke={2} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.ink }}>{t.title}</div>
                <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{t.from} 邀請你 · {t.when}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
              <button style={{ flex: 1, cursor: 'pointer', border: 'none', borderRadius: T.rSm, padding: '9px',
                fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: '#fff', background: T.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Icon name="check" size={13} color="#fff" stroke={2.6} />接受入座</button>
              <button style={{ flex: 1, cursor: 'pointer', borderRadius: T.rSm, padding: '9px',
                fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: T.sub, background: T.card,
                border: `1px solid ${hexA(T.line, 0.9)}` }}>婉拒</button>
            </div>
          </div>
        ))}
      </div>

      {/* past tables */}
      <SectionTitle>參加過的桌</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {PAST_TABLES.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.bg2,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="table4" size={17} color={T.sub} stroke={2} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.ink }}>{p.title}</div>
              <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{p.date} · {p.people} 人</div>
            </div>
            <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 700, color: T.green,
              background: hexA(T.green, 0.14), padding: '3px 9px', borderRadius: 999, flexShrink: 0 }}>{p.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ 邀約與配對 sheet (收到 / 送出 / 已配對) ═════════════════
function InvitesSheet({ T, initialSeg }) {
  const [seg, setSeg] = useStateAB(initialSeg || 'received');
  const segs = [['received', '收到', INVITES.received.length], ['sent', '送出', INVITES.sent.length], ['matched', '已配對', INVITES.matched.length]];
  const list = INVITES[seg];
  const Avatar = ({ p }) => <PersonAvatar T={T} person={p} size={46} />;
  return (
    <div>
      {/* segmented control */}
      <div style={{ display: 'flex', gap: 4, background: T.bg2, borderRadius: 999, padding: 4, marginBottom: 16 }}>
        {segs.map(([k, l, n]) => (
          <button key={k} onClick={() => setSeg(k)} style={{ flex: 1, cursor: 'pointer', border: 'none',
            fontFamily: T.text, fontSize: 12.5, fontWeight: 700, padding: '9px 0', borderRadius: 999,
            color: seg === k ? '#fff' : T.sub, background: seg === k ? T.primary : 'transparent' }}>
            {l} {n}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map(p => (
          <Card T={T} key={p.id} style={{ padding: '14px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar p={p} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily: T.text, fontSize: 14.5, fontWeight: 700, color: T.ink }}>{p.name}</span>
                  <span style={{ fontFamily: T.display, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>{p.match}%</span>
                </div>
                <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2 }}>{p.area} · {p.when}</div>
                {p.msg && <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.faint, marginTop: 3 }}>「{p.msg}」</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {seg === 'received' && <>
                <button style={{ flex: 1, cursor: 'pointer', border: 'none', borderRadius: T.rSm, padding: '10px',
                  fontFamily: T.text, fontSize: 13, fontWeight: 700, color: '#fff', background: T.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Icon name="check" size={14} color="#fff" stroke={2.6} />接受
                </button>
                <button style={{ flex: 1, cursor: 'pointer', borderRadius: T.rSm, padding: '10px',
                  fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.sub, background: T.card,
                  border: `1px solid ${hexA(T.line, 0.9)}` }}>婉拒</button>
              </>}
              {seg === 'sent' && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.amber,
                    background: hexA(T.amber, 0.14), padding: '6px 12px', borderRadius: 999 }}>{p.status}</span>
                  <button style={{ cursor: 'pointer', border: 'none', background: 'none', fontFamily: T.text,
                    fontSize: 12.5, fontWeight: 600, color: T.sub }}>收回邀請</button>
                </div>
              )}
              {seg === 'matched' && <>
                <button style={{ flex: 1, cursor: 'pointer', border: 'none', borderRadius: T.rSm, padding: '10px',
                  fontFamily: T.text, fontSize: 13, fontWeight: 700, color: '#fff', background: T.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Icon name="chat" size={14} color="#fff" stroke={2.2} />開始聊天
                </button>
                <button style={{ flex: 1, cursor: 'pointer', borderRadius: T.rSm, padding: '10px',
                  fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.primaryDeep, background: T.card,
                  border: `1px solid ${hexA(T.primary, 0.3)}` }}>查看飯友卡</button>
              </>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══ 聊天 sheet ════════════════════════════════════════════════════
function ChatSheet({ T }) {
  const badge = { real: ['真人', T.green], group: ['四人桌', T.primaryDeep], anon: ['匿名', T.sub] };
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {CHATS.map(c => {
          const [bl, bc] = badge[c.type];
          return (
            <button key={c.id} style={{ cursor: 'pointer', textAlign: 'left', background: T.card, borderRadius: T.rSm,
              border: `1px solid ${hexA(T.line, 0.8)}`, boxShadow: T.shadowSoft, padding: '13px 14px',
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <PersonAvatar T={T} person={c} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.ink,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  <span style={{ flexShrink: 0, fontFamily: T.text, fontSize: 9, fontWeight: 700, color: bc,
                    background: hexA(bc, 0.13), padding: '2px 6px', borderRadius: 999 }}>{bl}</span>
                </div>
                <div style={{ fontFamily: T.text, fontSize: 12, color: T.sub, marginTop: 3,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.last}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <span style={{ fontFamily: T.text, fontSize: 10.5, color: T.faint }}>{c.time}</span>
                {c.unread > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                  background: T.primary, color: '#fff', fontFamily: T.display, fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '0 14px',
        background: T.bg2, borderRadius: 999, border: `1px solid ${hexA(T.line, 0.9)}` }}>
        <Icon name="chat" size={16} color={T.faint} stroke={2} />
        <span style={{ flex: 1, fontFamily: T.text, fontSize: 12.5, color: T.faint, padding: '12px 0' }}>傳訊息給飯友…</span>
        <Icon name="share" size={16} color={T.primary} stroke={2.2} />
      </div>
    </div>
  );
}

// ═══ 建立 / 編輯飯友卡 sheet ═══════════════════════════════════════
function EditCardSheet({ T }) {
  const tasteOpts = ['清淡', '高蛋白', '日式', '蔬食', '麵食', '少油', '重訓', '輕食'];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '4px 2px 16px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 999, flexShrink: 0,
          background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: T.text, fontSize: 20, fontWeight: 800, color: '#fff' }}>{MY_CARD.avatar}</div>
        <div>
          <div style={{ fontFamily: T.text, fontSize: 16, fontWeight: 800, color: T.ink }}>{MY_CARD.name}</div>
          <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2 }}>讓口味相近的人找到你</div>
        </div>
      </div>
      {[['口味標籤', tasteOpts, MY_CARD.taste],
        ].map(([lab, opts, sel]) => (
        <div key={lab} style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.faint, marginBottom: 9 }}>{lab}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {opts.map(o => {
              const on = sel.includes(o);
              return (
                <span key={o} style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 999,
                  border: `1px solid ${on ? hexA(T.primary, 0.3) : hexA(T.line, 0.9)}`,
                  background: on ? T.primarySoft : T.card, color: on ? T.primaryDeep : T.sub }}>{o}</span>
              );
            })}
          </div>
        </div>
      ))}
      {[['飲食目標', MY_CARD.goal], ['可約時段', MY_CARD.when]].map(([lab, val]) => (
        <div key={lab} style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.faint, marginBottom: 8 }}>{lab}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px', background: T.card,
            borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.9)}` }}>
            <span style={{ flex: 1, fontFamily: T.text, fontSize: 13.5, color: T.ink }}>{val}</span>
            <Icon name="edit" size={15} color={T.faint} stroke={2} />
          </div>
        </div>
      ))}
      <button style={{ width: '100%', marginTop: 6, cursor: 'pointer', border: 'none', borderRadius: T.rSm,
        padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800, color: '#fff',
        background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="check" size={17} color="#fff" stroke={2.6} />發布飯友卡
      </button>
    </div>
  );
}

// ═══ 搜尋飯友 sheet — input + quick filters + live-feeling results ═══
function BuddySearchSheet({ T }) {
  const [q, setQ] = useStateAB('');
  const [filter, setFilter] = useStateAB('全部');
  const chips = ['全部', '大安區', '清淡', '高蛋白', '日式', '今晚'];
  const matchFilter = (b) =>
    filter === '全部' ||
    b.area.includes(filter) ||
    b.taste.includes(filter) ||
    (filter === '今晚' && b.when.includes('今晚'));
  const results = BUDDY_CARDS.filter(b =>
    matchFilter(b) && (q === '' || b.name.includes(q) || b.area.includes(q) || b.taste.some(t => t.includes(q))));
  return (
    <div>
      {/* search input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', background: T.bg2,
        borderRadius: 999, border: `1px solid ${hexA(T.line, 0.9)}`, marginBottom: 13 }}>
        <Icon name="search" size={17} color={T.faint} stroke={2.1} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋區域、口味或暱稱…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', padding: '12px 0',
            fontFamily: T.text, fontSize: 13.5, color: T.ink }} />
        {q && <button onClick={() => setQ('')} aria-label="清除" style={{ cursor: 'pointer', border: 'none',
          background: 'none', padding: 0, color: T.faint, fontFamily: T.text, fontSize: 16 }}>×</button>}
      </div>

      {/* quick filters */}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', margin: '0 -2px 16px', padding: '0 2px' }}>
        {chips.map(c => {
          const on = filter === c;
          return (
            <button key={c} onClick={() => setFilter(c)} style={{ flexShrink: 0, cursor: 'pointer',
              fontFamily: T.text, fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999,
              border: `1px solid ${on ? hexA(T.primary, 0.3) : hexA(T.line, 0.9)}`,
              background: on ? T.primarySoft : T.card, color: on ? T.primaryDeep : T.sub }}>{c}</button>
          );
        })}
      </div>

      {/* results */}
      <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.faint, marginBottom: 10 }}>{results.length} 位符合的飯友</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map(b => {
          const anon = b.type === 'anon';
          return (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
              background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}`, boxShadow: T.shadowSoft }}>
              <PersonAvatar T={T} person={b} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.ink }}>{b.name}</span>
                  <span style={{ fontFamily: T.display, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>{b.match}%</span>
                </div>
                <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{b.area} · {b.dist} · {b.when}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {b.taste.map(t => (
                    <span key={t} style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 600, color: T.primaryDeep,
                      background: T.primarySoft, padding: '2px 8px', borderRadius: 999 }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', fontFamily: T.text, fontSize: 13, color: T.faint }}>
            找不到符合的飯友，換個關鍵字或篩選試試
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { AnalysisScreen, BuddiesScreen, ScreenTitle, Chip, TasteTags, FourSeatSheet, ChatSheet, EditCardSheet, InvitesSheet, BuddySearchSheet });
