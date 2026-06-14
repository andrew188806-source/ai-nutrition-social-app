// app-cards.jsx — hero, nutrition summary, meal grid + detail, planned dinner, journal
// Exported to window: Ring, SectionHeader, Card, HomeHero, TodaySummary,
//                      MealGrid, MealDetail, PlannedDinner, JournalCard
const { useState } = React;

// ── Generic donut ring ──────────────────────────────────────────────
function Ring({ size = 56, stroke = 7, pct = 0, color = '#000', track = '#eee', children, dim = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)', opacity: dim ? 0.85 : 1 }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

// ── Section header ──────────────────────────────────────────────────
function SectionHeader({ T, title, sub, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 4px 12px' }}>
      <div>
        <div style={{ fontFamily: T.text, fontSize: 19, fontWeight: 800, color: T.ink, letterSpacing: 0.2 }}>{title}</div>
        {sub && <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 3 }}>{sub}</div>}
      </div>
      {action && (
        <button onClick={onAction} style={{ background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 2, fontFamily: T.text, fontSize: 13,
          fontWeight: 600, color: T.primary, padding: 0 }}>
          {action}<Icon name="chevron" size={14} color={T.primary} stroke={2.4} />
        </button>
      )}
    </div>
  );
}

function Card({ T, children, style, onClick, lift }) {
  return (
    <div onClick={onClick} style={{ background: T.card, borderRadius: T.r,
      boxShadow: lift ? T.shadowLift : T.shadow, border: `1px solid ${hexA(T.line, 0.7)}`,
      cursor: onClick ? 'pointer' : 'default', ...style }}>{children}</div>
  );
}

// ── Hero greeting + one-line status ─────────────────────────────────
function HomeHero({ T }) {
  return (
    <div style={{ padding: '4px 4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: T.text, fontSize: 15, fontWeight: 600, color: T.primaryDeep }}>{USER.greeting}，{USER.name}</span>
          <span style={{ fontSize: 15 }}>☀️</span>
        </div>
        <span style={{ fontFamily: T.text, fontSize: 12, color: T.faint }}>{USER.date}</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <div style={{ fontFamily: T.text, fontSize: 25, fontWeight: 800, color: T.ink, letterSpacing: 0.3, lineHeight: 1.25 }}>今天也<span style={{ color: T.primary }}>好好吃飯</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
          <Icon name="spark" size={14} color={T.ai} fill={T.ai} stroke={0} style={{ flexShrink: 0 }} />
          <span style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, lineHeight: 1.5 }}>{NUTRITION.status}</span>
        </div>
      </div>
    </div>
  );
}

// ── Today nutrition summary (calorie ring + friendly bars) ──────────
function TodaySummary({ T, onShare }) {
  const kcal = NUTRITION.kcal;
  const pct = kcal.value / kcal.goal;
  const toneColor = { primary: T.primary, accent: T.accent, amber: T.amber, green: T.green };
  return (
    <Card T={T} style={{ padding: '20px 20px 20px', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150,
        borderRadius: '50%', background: hexA(T.primary, 0.09), filter: 'blur(8px)', pointerEvents: 'none' }} />
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="target" size={16} color={T.primary} stroke={2.2} />
          <span style={{ fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.ink }}>今日營養摘要</span>
        </div>
        <button onClick={onShare} aria-label="分享" style={{ cursor: 'pointer', border: `1px solid ${hexA(T.line, 0.9)}`,
          background: T.bg2, width: 30, height: 30, borderRadius: 999, display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="share" size={15} color={T.primaryDeep} stroke={2.2} />
        </button>
      </div>
      {/* ring + remaining */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', marginTop: 14 }}>
        <Ring size={108} stroke={12} pct={pct} color={T.primary} track={T.track}>
          <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 700, color: T.ink, lineHeight: 1 }}>{kcal.value}</div>
          <div style={{ fontFamily: T.text, fontSize: 10, color: T.sub, marginTop: 3, whiteSpace: 'nowrap' }}>/ {kcal.goal} 大卡</div>
        </Ring>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {NUTRITION.macros.map(m => {
            const mp = Math.min(1, m.value / m.goal);
            return (
              <div key={m.key}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 600, color: T.ink }}>{m.label}</span>
                  <span style={{ fontFamily: T.text, fontSize: 10.5, color: T.faint }}>
                    <b style={{ fontFamily: T.display, fontSize: 12, color: T.sub }}>{m.value}</b> / {m.goal}{m.unit}
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 999, background: T.track, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${mp * 100}%`, borderRadius: 999,
                    background: toneColor[m.tone], transition: 'width 1s cubic-bezier(.22,1,.36,1)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ fontFamily: T.text, fontSize: 12, color: T.sub, marginTop: 16, textAlign: 'center' }}>
        今天還可以吃 <b style={{ color: T.primaryDeep, fontFamily: T.display, fontSize: 14 }}>{kcal.goal - kcal.value}</b> 大卡
      </div>
    </Card>
  );
}

// ── Meal mini-grid (2×2) ────────────────────────────────────────────
function MealMini({ T, meal, onOpen }) {
  const planned = meal.state === 'planned';
  return (
    <button onClick={() => onOpen(meal)} style={{ textAlign: 'left', cursor: 'pointer', background: T.card,
      borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}`, boxShadow: T.shadowSoft,
      padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 32, height: 32, borderRadius: 11, flexShrink: 0,
          background: planned ? T.bg2 : T.primarySoft,
          border: planned ? `1.5px dashed ${T.primary}` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={meal.icon} size={17} color={T.primaryDeep} stroke={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 700, color: T.ink }}>{meal.label}</div>
          <div style={{ fontFamily: T.text, fontSize: 10, color: T.faint }}>{meal.time}</div>
        </div>
        {planned
          ? <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: T.primaryDeep,
              background: T.primarySoft, padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>預定</span>
          : <span style={{ fontFamily: T.display, fontSize: 14, fontWeight: 700, color: T.sub, flexShrink: 0 }}>{meal.kcal}</span>}
      </div>
      <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, lineHeight: 1.45,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meal.items.join('、')}</div>
    </button>
  );
}

function MealGrid({ T, onOpen }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {MEALS.map(m => <MealMini key={m.key} T={T} meal={m} onOpen={onOpen} />)}
    </div>
  );
}

// ── Meal detail (rendered inside a sheet) ───────────────────────────
function MealDetail({ T, meal }) {
  const planned = meal.state === 'planned';
  const [rating, setRating] = useState(0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, flexShrink: 0,
          background: planned ? T.bg2 : T.primarySoft,
          border: planned ? `1.5px dashed ${T.primary}` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={meal.icon} size={24} color={T.primaryDeep} stroke={2} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: T.text, fontSize: 17, fontWeight: 800, color: T.ink }}>{meal.label}</span>
            <span style={{ fontFamily: T.text, fontSize: 12, color: T.faint }}>{meal.time}</span>
          </div>
          <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 2 }}>
            {planned ? '尚未享用 · 已預定' : `共 ${meal.kcal} 大卡`}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {meal.items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <Icon name="check" size={15} color={T.green} stroke={2.6} />
            <span style={{ fontFamily: T.text, fontSize: 13.5, color: T.ink }}>{it}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {meal.tags.map(t => (
          <span key={t} style={{ fontFamily: T.text, fontSize: 11, fontWeight: 600, color: T.primaryDeep,
            background: T.primarySoft, padding: '4px 10px', borderRadius: 999 }}>{t}</span>
        ))}
      </div>
      {!planned && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '12px 15px', background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}`, marginBottom: 14 }}>
          <span style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 700, color: T.ink }}>餐後評分</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)} aria-label={`評 ${n} 分`} style={{ cursor: 'pointer',
                background: 'none', border: 'none', padding: 2, lineHeight: 0 }}>
                <Icon name="star" size={20} color={n <= rating ? T.amber : T.faint}
                  fill={n <= rating ? T.amber : 'none'} stroke={n <= rating ? 0 : 2} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, padding: '13px 15px', background: T.aiSoft, borderRadius: T.rSm }}>
        <Icon name="spark" size={15} color={T.ai} fill={T.ai} stroke={0} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontFamily: T.text, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
          <b style={{ color: T.ai }}>AI 營養師</b>：{meal.detail}</span>
      </div>
    </div>
  );
}

// ── Planned dinner detail (rendered inside a sheet) ─────────────────
function PlannedDinner({ T, onShare }) {
  return (
    <div>
      <div style={{ borderRadius: T.r, overflow: 'hidden', boxShadow: T.shadowSoft,
        border: `1px solid ${hexA(T.line, 0.7)}` }}>
        <div style={{ background: `linear-gradient(135deg, ${T.heroFrom}, ${T.heroTo})`, padding: '18px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: T.text, fontSize: 11.5, fontWeight: 700, color: T.primaryDeep,
              background: hexA('#FFFFFF', 0.7), padding: '4px 10px', borderRadius: 999 }}>今晚 · 19:30</span>
            <Icon name="star" size={18} color={T.primaryDeep} fill={hexA(T.primary, 0.3)} stroke={2} />
          </div>
          <div style={{ fontFamily: T.text, fontSize: 20, fontWeight: 800, color: T.ink, marginTop: 12 }}>和朋友吃日式定食</div>
          <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 4 }}>建議補纖維 + 好油脂，今天就完整了</div>
        </div>
        <div style={{ padding: '14px 18px 16px', background: T.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex' }}>
              {BUDDIES.map((b, i) => (
                <div key={b.name} style={{ width: 32, height: 32, borderRadius: 999, marginLeft: i ? -9 : 0,
                  background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`, border: `2px solid ${T.card}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.text, fontSize: 12, fontWeight: 700, color: '#fff' }}>{b.avatar}</div>
              ))}
            </div>
            <span style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginLeft: 10 }}>2 位飯友已加入</span>
          </div>
          <button onClick={onShare} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontFamily: T.text, fontSize: 13, fontWeight: 700, color: '#fff', border: 'none',
            background: T.primary, padding: '8px 14px', borderRadius: 999, boxShadow: T.shadowSoft }}>
            <Icon name="share" size={14} color="#fff" stroke={2.2} />揪團
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14, padding: '13px 15px', background: T.aiSoft, borderRadius: T.rSm }}>
        <Icon name="spark" size={15} color={T.ai} fill={T.ai} stroke={0} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontFamily: T.text, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>
          <b style={{ color: T.ai }}>AI 營養師</b>：點有生魚或烤魚的定食補好油脂，再加一份溫蔬菜或味噌湯，今天的纖維就補回來了。</span>
      </div>
    </div>
  );
}

// ── Food journal timeline (rendered inside a sheet) ─────────────────
function JournalCard({ T }) {
  return (
    <div style={{ padding: '4px 2px 0' }}>
      {JOURNAL.map((j, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 20, lineHeight: 1 }}>{j.mood}</div>
            {i < JOURNAL.length - 1 && <div style={{ width: 2, flex: 1, background: T.line, marginTop: 6, borderRadius: 2 }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: 2 }}>
            <div style={{ fontFamily: T.display, fontSize: 12, fontWeight: 600, color: T.faint }}>{j.time}</div>
            <div style={{ fontFamily: T.text, fontSize: 13.5, color: T.ink, lineHeight: 1.6, marginTop: 3 }}>{j.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Person avatar — mascot for anonymous buddies, gradient initial otherwise ──
// Mascots appear ONLY here (anonymous identity) and in onboarding — nowhere else.
function PersonAvatar({ T, person = {}, size = 44 }) {
  const anon = person.type === 'anon';
  if (anon && person.mascot) {
    return (
      <div style={{ width: size, height: size, borderRadius: 999, flexShrink: 0, overflow: 'hidden',
        background: T.bg2, border: `1.5px solid ${hexA(T.primary, 0.18)}` }}>
        <img src={`mascots/${person.mascot}.png`} alt="" loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: anon ? T.bg2 : `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
      border: anon ? `1.5px dashed ${T.faint}` : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.text, fontWeight: 700, fontSize: Math.round(size * 0.36), color: anon ? T.faint : '#fff' }}>
      {anon ? <Icon name="eyeOff" size={Math.round(size * 0.42)} color={T.faint} stroke={2} /> : person.avatar}
    </div>
  );
}

Object.assign(window, { Ring, SectionHeader, Card, HomeHero, TodaySummary, MealGrid, MealDetail, PlannedDinner, JournalCard, PersonAvatar });
