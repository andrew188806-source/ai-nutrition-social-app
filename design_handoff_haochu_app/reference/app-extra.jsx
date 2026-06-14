// app-extra.jsx — monthly score, favorites, premium, share modal, header, bottom nav
// Exported to window: MonthlyScore, Favorites, PremiumUpgrade, ShareCard, ShareModal,
//                      AppHeader, BottomNav, PlaceholderTab
const { useState: useStateX } = React;

// ── Monthly score card ──────────────────────────────────────────────
function MonthlyScore({ T }) {
  const max = Math.max(...MONTHLY.weeks);
  return (
    <Card T={T} style={{ padding: '18px 20px 18px', overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Ring size={96} stroke={11} pct={MONTHLY.score / 100} color={T.primary} track={T.track}>
          <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 700, color: T.ink, lineHeight: 1 }}>{MONTHLY.score}</div>
          <div style={{ fontFamily: T.text, fontSize: 10, color: T.sub }}>分</div>
        </Ring>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, color: T.primaryDeep }}>{MONTHLY.grade}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontFamily: T.text, fontSize: 12,
              fontWeight: 700, color: T.green, background: hexA(T.green, 0.14), padding: '2px 8px', borderRadius: 999 }}>
              <Icon name="arrowUp" size={12} color={T.green} stroke={2.6} />{MONTHLY.trend}
            </span>
          </div>
          <div style={{ fontFamily: T.text, fontSize: 13, color: T.ink, fontWeight: 600, marginTop: 6 }}>{MONTHLY.caption}</div>
          <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 3 }}>已連續紀錄 {MONTHLY.streak} 天 🔥</div>
        </div>
      </div>
      {/* trend bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 46, marginTop: 16, padding: '0 2px' }}>
        {MONTHLY.weeks.map((w, i) => {
          const last = i === MONTHLY.weeks.length - 1;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ width: '100%', height: `${(w / max) * 100}%`, minHeight: 6,
                borderRadius: 7, background: last ? T.primary : hexA(T.primary, 0.28) }} />
              <span style={{ fontFamily: T.text, fontSize: 10, color: T.faint }}>W{i + 1}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {MONTHLY.highlights.map(h => (
          <div key={h.label} style={{ flex: 1, background: T.bg2, borderRadius: T.rSm, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: T.display, fontSize: 14, fontWeight: 700, color: T.primaryDeep }}>{h.value}</div>
            <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub, marginTop: 2 }}>{h.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Favorite meals (horizontal scroll) ──────────────────────────────
function Favorites({ T, items }) {
  const list = items || FAVORITES;
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 4px 6px',
      marginLeft: -4, marginRight: -4, scrollbarWidth: 'none' }}>
      {list.map((f, i) => (
        <div key={i} style={{ flexShrink: 0, width: 148, background: T.card, borderRadius: T.r,
          boxShadow: T.shadow, border: `1px solid ${hexA(T.line, 0.7)}`, overflow: 'hidden' }}>
          <div style={{ height: 78, background: `linear-gradient(135deg, ${T.heroFrom}, ${T.primarySoft})`,
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plate" size={30} color={hexA(T.primaryDeep, 0.55)} stroke={1.8} />
            <div style={{ position: 'absolute', top: 9, right: 9, width: 26, height: 26, borderRadius: 999,
              background: hexA('#fff', 0.85), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="heart" size={14} color={T.primary} fill={T.primary} stroke={0} />
            </div>
          </div>
          <div style={{ padding: '10px 12px 12px' }}>
            <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
            <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{f.place}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 600, color: T.primaryDeep,
                background: T.primarySoft, padding: '2px 7px', borderRadius: 999 }}>{f.tag}</span>
              <span style={{ fontFamily: T.display, fontSize: 12, fontWeight: 700, color: T.sub }}>{f.kcal} kcal</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Premium upgrade (standalone) + Free/Premium preview toggle ──────
const PLAN_ROWS = [
  { label: '每日營養紀錄與分數', free: true, premium: true },
  { label: '基礎 AI 餐點辨識', free: true, premium: true },
  { label: '飯友配對・分享到限動', free: true, premium: true },
  { label: '深度 AI 營養師建議', free: false, premium: true },
  { label: '無限收藏・週月報表', free: false, premium: true },
  { label: '外食餐廳客製菜單', free: false, premium: true },
];

function PremiumUpgrade({ T, plan, setPlan }) {
  const isPremium = plan === 'premium';
  return (
    <Card T={T} lift style={{ padding: 0, overflow: 'hidden',
      border: `1.5px solid ${hexA(T.primary, 0.35)}` }}>
      <div style={{ padding: '18px 20px 16px', background: `linear-gradient(150deg, ${T.heroFrom}, ${T.heroTo})`,
        position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: '50%',
          background: hexA(T.primary, 0.16), filter: 'blur(6px)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft }}>
              <Icon name="spark" size={17} color="#fff" fill="#fff" stroke={0} />
            </div>
            <span style={{ fontFamily: T.text, fontSize: 17, fontWeight: 800, color: T.ink }}>豪食友 Premium</span>
          </div>
          {/* segmented preview toggle */}
          <div style={{ display: 'flex', background: hexA('#fff', 0.6), borderRadius: 999, padding: 3 }}>
            {['free', 'premium'].map(k => (
              <button key={k} onClick={() => setPlan(k)} style={{ cursor: 'pointer', border: 'none',
                fontFamily: T.text, fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999,
                color: plan === k ? '#fff' : T.sub, background: plan === k ? T.primary : 'transparent',
                transition: 'all .2s' }}>{k === 'free' ? '免費' : 'Premium'}</button>
            ))}
          </div>
        </div>
        <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 10, position: 'relative' }}>
          {isPremium ? '解鎖深度 AI 營養師，外食也能精準均衡。' : '免費版已能記錄與配對，升級解鎖更聰明的建議。'}
        </div>
      </div>

      <div style={{ padding: '6px 20px 4px' }}>
        {PLAN_ROWS.map((row, i) => {
          const on = isPremium ? row.premium : row.free;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0',
              borderBottom: i < PLAN_ROWS.length - 1 ? `1px solid ${hexA(T.line, 0.8)}` : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                background: on ? hexA(T.green, 0.16) : T.bg2,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Icon name="check" size={13} color={T.green} stroke={2.8} />
                    : <Icon name="lock" size={12} color={T.faint} stroke={2} />}
              </div>
              <span style={{ flex: 1, fontFamily: T.text, fontSize: 13, fontWeight: 500,
                color: on ? T.ink : T.faint }}>{row.label}</span>
              {!row.free && <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: T.primaryDeep,
                background: T.primarySoft, padding: '2px 7px', borderRadius: 999 }}>PRO</span>}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '8px 20px 20px' }}>
        <button style={{ width: '100%', cursor: 'pointer', border: 'none', borderRadius: T.rSm,
          padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800, color: isPremium ? T.solidText : '#fff',
          background: isPremium ? T.solid : `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`,
          boxShadow: T.shadowLift, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {isPremium
            ? <>你正在預覽 Premium 體驗</>
            : <><Icon name="spark" size={16} color="#fff" fill="#fff" stroke={0} />升級 Premium · NT$120 / 月</>}
        </button>
        {!isPremium && <div style={{ textAlign: 'center', fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 9 }}>
          首月免費試用，隨時可取消</div>}
      </div>
    </Card>
  );
}

// ── Reusable bottom sheet ───────────────────────────────────────────
function Sheet({ T, title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200,
      background: hexA('#2a1f22', 0.42), backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-end', animation: 'kc-fade .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.bg,
        borderRadius: `${T.rLg}px ${T.rLg}px 0 0`, maxHeight: '84%', display: 'flex', flexDirection: 'column',
        animation: 'kc-up .32s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ width: 40, height: 5, borderRadius: 999, background: T.line, margin: '10px auto 6px' }} />
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
            <span style={{ fontFamily: T.text, fontSize: 18, fontWeight: 800, color: T.ink }}>{title}</span>
            <button onClick={onClose} aria-label="關閉" style={{ cursor: 'pointer', border: 'none', background: T.card,
              width: 30, height: 30, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: T.shadowSoft, fontFamily: T.text, fontSize: 16, color: T.sub }}>✕</button>
          </div>
        )}
        <div style={{ overflowY: 'auto', padding: '0 18px 30px' }}>{children}</div>
      </div>
    </div>
  );
}

// ── Main action row (拍照分析一餐 / 找飯友一起吃) ───────────────────
function ActionRow({ T, onAnalyze, onBuddies }) {
  return (
    <div style={{ display: 'flex', gap: 11 }}>
      <button onClick={onAnalyze} style={{ flex: 1.25, cursor: 'pointer', border: 'none', borderRadius: T.rSm,
        padding: '15px 14px', background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`,
        boxShadow: T.shadowLift, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: T.text, fontSize: 14.5, fontWeight: 800, color: '#fff' }}>
        <Icon name="camera" size={19} color="#fff" stroke={2.1} />拍照分析一餐
      </button>
      <button onClick={onBuddies} style={{ flex: 1, cursor: 'pointer', borderRadius: T.rSm,
        padding: '15px 12px', background: T.card, border: `1.5px solid ${hexA(T.primary, 0.35)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.primaryDeep }}>
        <Icon name="buddies" size={18} color={T.primaryDeep} stroke={2.1} />找飯友一起吃
      </button>
    </div>
  );
}

// ── Compact reminder row — tonight's plan ───────────────────────────
function ReminderRow({ T, onOpen }) {
  return (
    <button onClick={onOpen} style={{ width: '100%', cursor: 'pointer', textAlign: 'left',
      background: T.card, borderRadius: T.r, border: `1px solid ${hexA(T.line, 0.7)}`, boxShadow: T.shadowSoft,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, background: T.primarySoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="star" size={20} color={T.primaryDeep} fill={hexA(T.primary, 0.25)} stroke={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.text, fontSize: 11.5, fontWeight: 700, color: T.primaryDeep }}>今晚已安排 ✓</div>
        <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 600, color: T.ink, marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>19:30 · 和朋友吃日式定食</div>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontFamily: T.text, fontSize: 12.5,
        fontWeight: 600, color: T.primary, flexShrink: 0 }}>查看<Icon name="chevron" size={14} color={T.primary} stroke={2.4} /></span>
    </button>
  );
}

// ── Compact journal entry ───────────────────────────────────────────
function JournalEntry({ T, onOpen }) {
  return (
    <button onClick={onOpen} style={{ width: '100%', cursor: 'pointer', textAlign: 'left',
      background: T.card, borderRadius: T.r, border: `1px solid ${hexA(T.line, 0.7)}`, boxShadow: T.shadowSoft,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, background: T.bg2,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="wall" size={19} color={T.primaryDeep} stroke={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>飲食手札</div>
        <div style={{ fontFamily: T.text, fontSize: 12, color: T.sub, marginTop: 2 }}>今天有 {JOURNAL.length} 則小紀錄</div>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontFamily: T.text, fontSize: 12.5,
        fontWeight: 600, color: T.primary, flexShrink: 0 }}>查看<Icon name="chevron" size={14} color={T.primary} stroke={2.4} /></span>
    </button>
  );
}

// ── Premium — small soft card (opens full sheet) ────────────────────
function PremiumMini({ T, onOpen }) {
  return (
    <button onClick={onOpen} style={{ width: '100%', cursor: 'pointer', textAlign: 'left',
      background: `linear-gradient(120deg, ${T.heroFrom}, ${T.heroTo})`, borderRadius: T.r,
      border: `1px solid ${hexA(T.primary, 0.28)}`, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0,
        background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft }}>
        <Icon name="spark" size={19} color="#fff" fill="#fff" stroke={0} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: T.ink }}>豪食友 Premium</div>
        <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2 }}>解鎖深度 AI 營養師，外食也精準均衡</div>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontFamily: T.text, fontSize: 12.5,
        fontWeight: 700, color: T.primaryDeep, flexShrink: 0 }}>了解<Icon name="chevron" size={14} color={T.primaryDeep} stroke={2.4} /></span>
    </button>
  );
}

// ── Analyze (拍照分析) sheet content ────────────────────────────────
function AnalyzeSheet({ T }) {
  return (
    <div>
      <div style={{ borderRadius: T.r, overflow: 'hidden', position: 'relative', height: 180,
        background: `linear-gradient(150deg, ${T.heroFrom}, ${T.primarySoft})`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
        border: `1.5px dashed ${hexA(T.primary, 0.4)}` }}>
        <div style={{ width: 64, height: 64, borderRadius: 22, background: hexA('#fff', 0.7),
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft }}>
          <Icon name="camera" size={32} color={T.primaryDeep} stroke={1.9} />
        </div>
        <span style={{ fontFamily: T.text, fontSize: 13, color: T.sub }}>把餐點拍下來，AI 幫你估算營養</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
        {[['拍照或上傳', '辨識食物與份量'], ['估算營養', '熱量、蛋白質、纖維一次看'], ['給你建議', '溫和提醒下一餐怎麼補']].map(([a, b], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, background: T.primarySoft, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.display, fontSize: 13, fontWeight: 700, color: T.primaryDeep }}>{i + 1}</div>
            <div>
              <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{a}</div>
              <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 1 }}>{b}</div>
            </div>
          </div>
        ))}
      </div>
      <button style={{ width: '100%', marginTop: 18, cursor: 'pointer', border: 'none', borderRadius: T.rSm,
        padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800, color: '#fff',
        background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="camera" size={18} color="#fff" stroke={2.1} />開啟相機
      </button>
    </div>
  );
}

function ShareModal({ T, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200,
      background: hexA('#2a1f22', 0.42), backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'flex-end', animation: 'kc-fade .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: T.bg,
        borderRadius: `${T.rLg}px ${T.rLg}px 0 0`, padding: '10px 20px 30px',
        animation: 'kc-up .32s cubic-bezier(.22,1,.36,1)' }}>
        <div style={{ width: 40, height: 5, borderRadius: 999, background: T.line, margin: '0 auto 16px' }} />
        <div style={{ fontFamily: T.text, fontSize: 18, fontWeight: 800, color: T.ink, textAlign: 'center' }}>分享今天的飲食</div>

        {/* IG-story style preview */}
        <div style={{ margin: '18px auto 18px', width: 200, borderRadius: 22, overflow: 'hidden',
          background: `linear-gradient(160deg, ${T.heroFrom}, ${T.heroTo})`, boxShadow: T.shadowLift,
          padding: '20px 18px' }}>
          <div style={{ fontFamily: T.text, fontSize: 11, fontWeight: 700, color: T.primaryDeep }}>豪食友 · 6/10</div>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
            <Ring size={92} stroke={10} pct={0.64} color={T.primary} track={hexA('#fff', 0.6)}>
              <div style={{ fontFamily: T.display, fontSize: 24, fontWeight: 700, color: T.ink, lineHeight: 1 }}>1180</div>
              <div style={{ fontFamily: T.text, fontSize: 9, color: T.sub }}>大卡</div>
            </Ring>
          </div>
          <div style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: T.ink, textAlign: 'center' }}>今天蛋白質達標 💪</div>
          <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub, textAlign: 'center', marginTop: 3 }}>外食也能吃得均衡</div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ flex: 1, cursor: 'pointer', border: 'none', borderRadius: T.rSm, padding: '14px',
            fontFamily: T.text, fontSize: 14, fontWeight: 800, color: '#fff',
            background: 'linear-gradient(120deg, #F58529, #DD2A7B, #8134AF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="instagram" size={18} color="#fff" stroke={2} />分享到限動
          </button>
          <button style={{ flex: 1, cursor: 'pointer', borderRadius: T.rSm, padding: '14px',
            fontFamily: T.text, fontSize: 14, fontWeight: 800, color: T.primaryDeep,
            background: T.card, border: `1.5px solid ${hexA(T.primary, 0.4)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="wall" size={18} color={T.primaryDeep} stroke={2} />貼到飯友牆
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App header (sticky) ─────────────────────────────────────────────
function AppHeader({ T, onBell, unread = 0 }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 30,
      background: hexA(T.bg, 0.82), backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      padding: '52px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${hexA(T.line, 0.6)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft,
          fontFamily: T.text, fontWeight: 800, fontSize: 16, color: '#fff' }}>豪</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: T.text, fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: 0.5, lineHeight: 1.1 }}>豪食友 <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 700, color: T.sub, letterSpacing: 0.5 }}>haocu</span></span>
          <span style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub, marginTop: 1 }}>AI 營養 × 飯友社交</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBell} aria-label="通知" style={{ width: 38, height: 38, borderRadius: 999, background: T.card,
          border: `1px solid ${hexA(T.line, 0.9)}`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: T.shadowSoft }}>
          <Icon name="bell" size={19} color={T.ink} stroke={2} />
          {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17,
            padding: '0 4px', borderRadius: 999, background: T.primary, color: '#fff', fontFamily: T.display,
            fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${T.card}` }}>{unread}</span>}
        </button>
        <div style={{ width: 38, height: 38, borderRadius: 999, background: `linear-gradient(135deg, ${T.accent}, ${T.primary})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft,
          fontFamily: T.text, fontWeight: 700, fontSize: 15, color: '#fff' }}>{USER.avatar}</div>
      </div>
    </div>
  );
}

// ── Bottom nav (5 tabs) ─────────────────────────────────────────────
const TABS = [
  { key: 'home', label: '首頁', icon: 'home' },
  { key: 'analysis', label: '分析', icon: 'chart' },
  { key: 'buddies', label: '飯友', icon: 'buddies' },
  { key: 'restaurant', label: '餐廳', icon: 'plate' },
  { key: 'me', label: '我的', icon: 'user' },
];

function BottomNav({ T, tab, setTab }) {
  return (
    <div style={{ position: 'sticky', bottom: 0, zIndex: 40, marginTop: 'auto',
      background: hexA(T.bg, 0.9), backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderTop: `1px solid ${hexA(T.line, 0.7)}`, padding: '10px 8px 30px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
      {TABS.map(t => {
        const active = tab === t.key;
        return (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ cursor: 'pointer', border: 'none', background: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 4px', flex: 1 }}>
            <Icon name={t.icon} size={24} color={active ? T.primary : T.faint} stroke={active ? 2.4 : 2}
              fill={active ? hexA(T.primary, 0.12) : 'none'} />
            <span style={{ fontFamily: T.text, fontSize: 11, fontWeight: active ? 700 : 500,
              color: active ? T.primaryDeep : T.faint }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Placeholder tabs (so nav feels real) ────────────────────────────
function PlaceholderTab({ T, icon, title, sub }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 40px 120px', textAlign: 'center' }}>
      <div style={{ width: 76, height: 76, borderRadius: 26, background: T.primarySoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Icon name={icon} size={36} color={T.primaryDeep} stroke={1.8} />
      </div>
      <div style={{ fontFamily: T.text, fontSize: 19, fontWeight: 800, color: T.ink }}>{title}</div>
      <div style={{ fontFamily: T.text, fontSize: 13.5, color: T.sub, marginTop: 8, lineHeight: 1.6 }}>{sub}</div>
      <div style={{ marginTop: 18, fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep,
        background: T.primarySoft, padding: '7px 16px', borderRadius: 999 }}>即將推出</div>
    </div>
  );
}

// ── Notification center ─────────────────────────────────────────────
function NotificationSheet({ T, items }) {
  const toneFor = { match: T.primary, buddy: T.primaryDeep, table: T.accent, accepted: T.green,
    reminder: T.amber, dinner: T.primary, premium: T.primaryDeep };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map(n => {
        const c = toneFor[n.type] || T.primary;
        return (
          <div key={n.id} style={{ display: 'flex', gap: 12, padding: '13px 14px', borderRadius: T.rSm,
            background: n.unread ? hexA(T.primary, 0.06) : T.card,
            border: `1px solid ${n.unread ? hexA(T.primary, 0.22) : hexA(T.line, 0.8)}` }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: hexA(c, 0.14),
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={n.icon} size={18} color={c} fill={n.icon === 'spark' ? c : 'none'} stroke={n.icon === 'spark' ? 0 : 2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{n.title}</span>
                {n.unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: T.primary, flexShrink: 0 }} />}
                <span style={{ marginLeft: 'auto', fontFamily: T.text, fontSize: 10.5, color: T.faint, flexShrink: 0 }}>{n.time}</span>
              </div>
              <div style={{ fontFamily: T.text, fontSize: 12, color: T.sub, marginTop: 3, lineHeight: 1.5 }}>{n.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Food diary (history) — distinct from today's live dashboard ─────
function FoodDiarySheet({ T }) {
  const [seg, setSeg] = useStateX('daily');
  const segs = [['daily', '每日紀錄'], ['journal', '手札'], ['planned', '已安排']];
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, background: T.bg2, borderRadius: 999, padding: 4, marginBottom: 16 }}>
        {segs.map(([k, l]) => (
          <button key={k} onClick={() => setSeg(k)} style={{ flex: 1, cursor: 'pointer', border: 'none',
            fontFamily: T.text, fontSize: 12.5, fontWeight: 700, padding: '9px 0', borderRadius: 999,
            color: seg === k ? '#fff' : T.sub, background: seg === k ? T.primary : 'transparent' }}>{l}</button>
        ))}
      </div>

      {seg === 'daily' && <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {DAILY_RECORDS.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: T.ink, width: 52, flexShrink: 0 }}>{d.date}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 7, borderRadius: 999, background: T.track, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, d.kcal / d.goal * 100)}%`, background: T.primary, borderRadius: 999 }} />
              </div>
              <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.faint, marginTop: 4 }}>{d.kcal} / {d.goal} 大卡</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: T.display, fontSize: 17, fontWeight: 700, color: T.primaryDeep, lineHeight: 1 }}>{d.score}</div>
              <div style={{ fontFamily: T.text, fontSize: 9.5, color: T.faint }}>分</div>
            </div>
          </div>
        ))}
        <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.faint, textAlign: 'center', padding: '6px 0 2px' }}>顯示最近 5 天 · 完整月報在「本月飲食分數」</div>
      </div>}

      {seg === 'journal' && <JournalCard T={T} />}

      {seg === 'planned' && <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {PLANNED_HISTORY.map((p, i) => {
          const upcoming = p.status === '即將到來';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px',
              background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                background: upcoming ? T.primarySoft : T.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="star" size={17} color={upcoming ? T.primaryDeep : T.faint} fill={upcoming ? hexA(T.primary, 0.25) : 'none'} stroke={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{p.title}</div>
                <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{p.date}</div>
              </div>
              <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 700, flexShrink: 0,
                color: upcoming ? T.primaryDeep : T.green, background: upcoming ? T.primarySoft : hexA(T.green, 0.14),
                padding: '3px 9px', borderRadius: 999 }}>{p.status}</span>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

// ── Edit profile — anon/real mode, mascot avatar, goal mode ─────────
function EditProfileSheet({ T }) {
  const [mode, setMode] = useStateX('anon');
  const [mascot, setMascot] = useStateX('lowcarb');
  const [goal, setGoal] = useStateX('均衡');
  const sel = MASCOTS.find(m => m.id === mascot) || MASCOTS[0];
  return (
    <div>
      {/* avatar preview */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '4px 0 18px' }}>
        {mode === 'anon' ? (
          <div style={{ width: 76, height: 76, borderRadius: 999, overflow: 'hidden',
            background: T.bg2, border: `2px solid ${hexA(T.primary, 0.25)}`, boxShadow: T.shadowSoft }}>
            <img src={`mascots/${mascot}.png`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        ) : (
          <div style={{ width: 76, height: 76, borderRadius: 999, background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft,
            fontFamily: T.text, fontSize: 30, fontWeight: 800, color: '#fff' }}>{USER.avatar}</div>
        )}
        <span style={{ fontFamily: T.text, fontSize: 16, fontWeight: 800, color: T.ink }}>{mode === 'anon' ? sel.label : USER.name}</span>
        <span style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub }}>{mode === 'anon' ? `匿名飯友 · ${sel.sub}` : '真人卡 · 顯示真實身分'}</span>
      </div>

      {/* anon / real mode */}
      <div style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.faint, marginBottom: 9 }}>顯示模式</div>
      <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
        {[['anon', 'eyeOff', '匿名模式', '以食物人格現身'], ['real', 'user', '真人模式', '顯示頭像與暱稱']].map(([k, ic, t, d]) => {
          const on = mode === k;
          return (
            <button key={k} onClick={() => setMode(k)} style={{ flex: 1, cursor: 'pointer', textAlign: 'left',
              padding: '13px 14px', borderRadius: T.rSm, background: on ? T.primarySoft : T.card,
              border: `1.5px solid ${on ? hexA(T.primary, 0.4) : hexA(T.line, 0.9)}` }}>
              <Icon name={ic} size={18} color={on ? T.primaryDeep : T.sub} stroke={2} />
              <div style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: on ? T.ink : T.sub, marginTop: 8 }}>{t}</div>
              <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.faint, marginTop: 2 }}>{d}</div>
            </button>
          );
        })}
      </div>

      {/* mascot identity picker — shown ONLY in anon mode (the allowed selection area) */}
      {mode === 'anon' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
            <span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.faint }}>選擇你的食物人格</span>
            <span style={{ fontFamily: T.text, fontSize: 10.5, color: T.faint }}>匿名時顯示這個頭像</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {MASCOTS.map(m => {
              const on = mascot === m.id;
              return (
                <button key={m.id} onClick={() => setMascot(m.id)} style={{ cursor: 'pointer', border: 'none',
                  background: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 0 }}>
                  <div style={{ width: 58, height: 58, borderRadius: 999, overflow: 'hidden', background: T.bg2,
                    border: on ? `2px solid ${T.primary}` : `1.5px solid ${hexA(T.line, 0.9)}`,
                    boxShadow: on ? `0 0 0 3px ${hexA(T.primary, 0.16)}` : 'none', transition: 'all .15s' }}>
                    <img src={`mascots/${m.id}.png`} alt="" loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: on ? 700 : 500, color: on ? T.ink : T.sub,
                    textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.faint, marginBottom: 9 }}>真人頭像</div>
          <button style={{ width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11,
            padding: '13px 15px', borderRadius: T.rSm, background: T.card, border: `1.5px dashed ${hexA(T.primary, 0.35)}` }}>
            <div style={{ width: 40, height: 40, borderRadius: 999, background: T.bg2,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={18} color={T.primaryDeep} stroke={2} /></div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: T.text, fontSize: 13, fontWeight: 700, color: T.ink }}>上傳真人照片</div>
              <div style={{ fontFamily: T.text, fontSize: 11, color: T.faint, marginTop: 1 }}>配對更安心，通過真人驗證後顯示藍勾</div>
            </div>
          </button>
        </div>
      )}

      {/* health goal mode */}
      <div style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.faint, marginBottom: 9 }}>飲食目標模式</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {['均衡', '減脂', '增肌', '低醣', '多蔬'].map(g => {
          const on = goal === g;
          return (
            <button key={g} onClick={() => setGoal(g)} style={{ cursor: 'pointer', fontFamily: T.text, fontSize: 13,
              fontWeight: 700, padding: '9px 16px', borderRadius: 999, border: `1px solid ${on ? hexA(T.primary, 0.3) : hexA(T.line, 0.9)}`,
              background: on ? T.primarySoft : T.card, color: on ? T.primaryDeep : T.sub }}>{g}</button>
          );
        })}
      </div>

      <button style={{ width: '100%', cursor: 'pointer', border: 'none', borderRadius: T.rSm, padding: '15px',
        fontFamily: T.text, fontSize: 15, fontWeight: 800, color: '#fff',
        background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="check" size={17} color="#fff" stroke={2.6} />儲存個人檔案
      </button>
    </div>
  );
}

// ── Onboarding coach — ONE small mascot guide at a time (first run / replay) ──
function OnboardingCoach({ T, onClose }) {
  const steps = [
    { mascot: 'protein', title: '拍照分析一餐', text: '拍一張，AI 幫你估算熱量與營養，順手記錄三餐。' },
    { mascot: 'explorer', title: '找飯友一起吃', text: '依口味與目標配對飯友，一個人也能吃得均衡。' },
    { mascot: 'veggie', title: '建立飯友卡', text: '留下口味與時段，讓對的人主動找你開飯。' },
  ];
  const [i, setI] = useStateX(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-end', background: hexA('#2a1f22', 0.32), backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
      <div className="kc-pop" key={i} style={{ margin: '0 16px 104px', background: T.card, borderRadius: T.rLg,
        boxShadow: T.shadowLift, padding: '18px 18px 16px', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 16, cursor: 'pointer', border: 'none',
          background: 'none', padding: 0, fontFamily: T.text, fontSize: 12, fontWeight: 600, color: T.faint }}>略過</button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, overflow: 'hidden', flexShrink: 0,
            background: T.bg2, border: `2px solid ${hexA(T.primary, 0.25)}`, boxShadow: T.shadowSoft }}>
            <img src={`mascots/${step.mascot}.png`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <span style={{ fontFamily: T.text, fontSize: 10.5, fontWeight: 700, color: T.primaryDeep,
              background: T.primarySoft, padding: '3px 9px', borderRadius: 999 }}>新手導覽</span>
            <div style={{ fontFamily: T.text, fontSize: 16, fontWeight: 800, color: T.ink, marginTop: 9 }}>{step.title}</div>
            <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 5, lineHeight: 1.6 }}>{step.text}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {steps.map((_, n) => (
              <span key={n} style={{ width: n === i ? 18 : 7, height: 7, borderRadius: 999,
                background: n === i ? T.primary : hexA(T.faint, 0.5), transition: 'all .2s' }} />
            ))}
          </div>
          <button onClick={() => (last ? onClose() : setI(i + 1))} style={{ cursor: 'pointer', border: 'none',
            borderRadius: T.rSm, padding: '10px 20px', fontFamily: T.text, fontSize: 13.5, fontWeight: 800, color: '#fff',
            background: `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`, boxShadow: T.shadowLift }}>
            {last ? '開始使用' : '下一步'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Next meal recommendation ────────────────────────────────────────
function NextMealSheet({ T, onRestaurant }) {
  const picks = [
    { name: '鮭魚定食', why: '補好油脂與纖維，今天剛好缺', kcal: 580, tag: '好油脂' },
    { name: '溫沙拉穀物碗', why: '蔬菜兩份，把今天的纖維補回來', kcal: 420, tag: '高纖' },
    { name: '味噌豆腐湯', why: '清爽好消化，蛋白質再加一點', kcal: 180, tag: '低卡' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', background: T.aiSoft, borderRadius: T.rSm, marginBottom: 16 }}>
        <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: hexA(T.ai, 0.16),
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="spark" size={17} color={T.ai} fill={T.ai} stroke={0} />
        </div>
        <span style={{ fontFamily: T.text, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
          <b style={{ color: T.ai }}>AI 營養師</b>：你今天纖維和好油脂偏少，下一餐選下面任一道就很完整。</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {picks.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: T.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plate" size={18} color={T.primaryDeep} stroke={1.9} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{p.name}</span>
                <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: T.green,
                  background: hexA(T.green, 0.14), padding: '2px 7px', borderRadius: 999 }}>{p.tag}</span>
              </div>
              <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{p.why}</div>
            </div>
            <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 700, color: T.sub, flexShrink: 0 }}>{p.kcal}</span>
          </div>
        ))}
      </div>
      <button onClick={onRestaurant} style={{ width: '100%', marginTop: 16, cursor: 'pointer', borderRadius: T.rSm,
        padding: '14px', fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.primaryDeep,
        background: T.card, border: `1.5px solid ${hexA(T.primary, 0.35)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Icon name="pin" size={17} color={T.primaryDeep} stroke={2.1} />看附近哪裡吃得到
      </button>
    </div>
  );
}

Object.assign(window, { MonthlyScore, Favorites, PremiumUpgrade, PremiumMini, Sheet, ActionRow, ReminderRow, JournalEntry, AnalyzeSheet, ShareModal, AppHeader, BottomNav, PlaceholderTab, NotificationSheet, FoodDiarySheet, EditProfileSheet, NextMealSheet, OnboardingCoach });
