// app-restaurant.jsx — 餐廳 (recommendations + create buddy card) + 我的 (profile)
// Exported to window: RestaurantScreen, ProfileScreen
const { useState: useStateRP } = React;

// ═══ 餐廳 — recommendations + create meal-buddy card ═══════════════
function RestaurantCard({ T, r, created, onCreate, onOpenDetail }) {
  return (
    <Card T={T} style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={() => onOpenDetail(r)} style={{ display: 'flex', width: '100%', textAlign: 'left',
        cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>
        <div style={{ width: 92, flexShrink: 0, alignSelf: 'stretch', minHeight: 96,
          background: `linear-gradient(150deg, ${T.heroFrom}, ${T.primarySoft})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plate" size={30} color={hexA(T.primaryDeep, 0.55)} stroke={1.7} />
        </div>
        <div style={{ flex: 1, padding: '13px 15px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              {r.verified && <Icon name="check" size={13} color={T.green} stroke={3} />}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <Icon name="star" size={13} color={T.amber} fill={T.amber} stroke={0} />
              <span style={{ fontFamily: T.display, fontSize: 12.5, fontWeight: 700, color: T.sub }}>{r.rating}</span>
            </span>
          </div>
          <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 3 }}>{r.cuisine} · {r.dist} · {r.price}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
            {r.tags.map(t => (
              <span key={t} style={{ fontFamily: T.text, fontSize: 10, fontWeight: 600, color: T.sub,
                background: T.bg2, border: `1px solid ${hexA(T.line, 0.9)}`, padding: '3px 8px', borderRadius: 999 }}>{t}</span>
            ))}
          </div>
        </div>
      </button>
      <div style={{ padding: '0 15px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => onOpenDetail(r)} style={{ flex: 1, cursor: 'pointer', textAlign: 'left',
          background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
          fontFamily: T.text, fontSize: 11.5, fontWeight: 600, color: T.primary }}>
          <Icon name="leaf" size={14} color={T.primary} stroke={2.1} />營養詳情
        </button>
        <button onClick={() => onCreate(r)} disabled={created} style={{ flexShrink: 0, cursor: created ? 'default' : 'pointer',
          fontFamily: T.text, fontSize: 12.5, fontWeight: 700, padding: '9px 13px', borderRadius: 999,
          border: `1px solid ${created ? 'transparent' : hexA(T.primary, 0.28)}`,
          color: created ? T.green : T.primaryDeep, background: created ? hexA(T.green, 0.14) : T.primarySoft,
          display: 'flex', alignItems: 'center', gap: 5 }}>
          {created ? <><Icon name="check" size={13} color={T.green} stroke={2.8} />已建立</> : <><Icon name="invite" size={14} color={T.primaryDeep} stroke={2.1} />建立飯友卡</>}
        </button>
      </div>
    </Card>
  );
}

// ═══ 餐廳詳情 sheet — nutrition label + verified info + create card ═══
function RestaurantDetailSheet({ T, r, created, onCreate, onCreateTable }) {
  const [info, setInfo] = useStateRP(false);
  if (!r) return null;
  return (
    <div>
      {/* hero */}
      <div style={{ borderRadius: T.r, overflow: 'hidden', height: 130, marginBottom: 16, position: 'relative',
        background: `linear-gradient(150deg, ${T.heroFrom}, ${T.primarySoft})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plate" size={42} color={hexA(T.primaryDeep, 0.5)} stroke={1.6} />
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 5,
          background: hexA('#fff', 0.85), padding: '5px 11px', borderRadius: 999 }}>
          <Icon name="star" size={13} color={T.amber} fill={T.amber} stroke={0} />
          <span style={{ fontFamily: T.display, fontSize: 12.5, fontWeight: 700, color: T.ink }}>{r.rating}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontFamily: T.text, fontSize: 19, fontWeight: 800, color: T.ink }}>{r.name}</span>
        {r.verified && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, borderRadius: 999, background: T.green }}>
          <Icon name="check" size={12} color="#fff" stroke={3} /></span>}
      </div>
      <div style={{ fontFamily: T.text, fontSize: 12.5, color: T.sub, marginTop: 4 }}>{r.cuisine} · {r.dist} · {r.price}</div>

      {/* verified nutrition label + blue-check info */}
      <div style={{ padding: '13px 15px', marginTop: 14, borderRadius: T.rSm,
        background: r.verified ? hexA(T.green, 0.1) : T.bg2,
        border: `1px solid ${r.verified ? hexA(T.green, 0.3) : hexA(T.line, 0.9)}` }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <Icon name={r.verified ? 'shield' : 'leaf'} size={17} color={r.verified ? T.green : T.sub} stroke={2}
            style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: T.text, fontSize: 12.5, fontWeight: 800, color: T.ink }}>
                {r.verified ? '營養標示已驗證' : '營養標示估算中'}</span>
              <button onClick={() => setInfo(v => !v)} aria-label="說明" style={{ cursor: 'pointer', border: 'none',
                background: 'none', padding: 0, display: 'flex', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15,
                  borderRadius: 999, background: hexA(T.sub, 0.18), fontFamily: T.display, fontSize: 10, fontWeight: 700, color: T.sub }}>?</span>
              </button>
            </div>
            <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2, lineHeight: 1.5 }}>
              {r.verified ? '本店菜單熱量與營養由豪食友核實，外食也能安心均衡。' : '尚未核實，數值為 AI 估算，僅供參考。'}</div>
            {info && (
              <div className="kc-pop" style={{ marginTop: 9, padding: '10px 12px', background: hexA(T.green, 0.08),
                borderRadius: T.rSm, border: `1px dashed ${hexA(T.green, 0.4)}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16,
                    borderRadius: 999, background: T.green }}><Icon name="check" size={11} color="#fff" stroke={3} /></span>
                  <span style={{ fontFamily: T.text, fontSize: 11.5, fontWeight: 800, color: T.ink }}>藍勾驗證是什麼？</span>
                </div>
                <span style={{ fontFamily: T.text, fontSize: 11, color: T.sub, lineHeight: 1.5 }}>有藍勾的餐廳代表菜單營養數據已經豪食友與店家共同核實，比 AI 估算更精準。</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* nutrition tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
        {r.tags.map(t => (
          <span key={t} style={{ fontFamily: T.text, fontSize: 11, fontWeight: 600, color: T.sub,
            background: T.bg2, border: `1px solid ${hexA(T.line, 0.9)}`, padding: '4px 11px', borderRadius: 999 }}>{t}</span>
        ))}
      </div>

      {/* recommended balanced picks */}
      <div style={{ fontFamily: T.text, fontSize: 14, fontWeight: 800, color: T.ink, margin: '18px 0 10px' }}>均衡推薦</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {r.picks.map(([name, kcal, tag], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
            background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: T.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plate" size={17} color={T.primaryDeep} stroke={1.9} />
            </div>
            <span style={{ flex: 1, fontFamily: T.text, fontSize: 13.5, fontWeight: 600, color: T.ink }}>{name}</span>
            <span style={{ fontFamily: T.text, fontSize: 10, fontWeight: 600, color: T.green,
              background: hexA(T.green, 0.13), padding: '3px 8px', borderRadius: 999 }}>{tag}</span>
            <span style={{ fontFamily: T.display, fontSize: 13, fontWeight: 700, color: T.sub }}>{kcal}</span>
          </div>
        ))}
      </div>

      <button onClick={() => onCreate(r)} disabled={created} style={{ width: '100%', marginTop: 18, cursor: created ? 'default' : 'pointer',
        border: 'none', borderRadius: T.rSm, padding: '15px', fontFamily: T.text, fontSize: 15, fontWeight: 800,
        color: '#fff', background: created ? T.green : `linear-gradient(120deg, ${T.primary}, ${T.primaryDeep})`,
        boxShadow: T.shadowLift, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {created ? <><Icon name="check" size={17} color="#fff" stroke={2.8} />飯友卡已建立</> : <><Icon name="invite" size={17} color="#fff" stroke={2.1} />在這間餐廳建立飯友卡</>}
      </button>
      <button onClick={() => onCreateTable(r)} style={{ width: '100%', marginTop: 10, cursor: 'pointer', borderRadius: T.rSm,
        padding: '14px', fontFamily: T.text, fontSize: 14, fontWeight: 700, color: T.primaryDeep,
        background: T.card, border: `1.5px solid ${hexA(T.primary, 0.35)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <Icon name="table4" size={17} color={T.primaryDeep} stroke={2.1} />在這間建立四人桌
      </button>
    </div>
  );
}

function RestaurantScreen({ T, createdCardId, onCreate, onOpenDetail }) {
  const [f, setF] = useStateRP({ area: '大安區', meal: '晚餐', type: '全部' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  return (
    <div style={{ padding: '8px 16px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ScreenTitle T={T} title="餐廳" sub="找均衡的外食，順手揪個飯友" />

      {/* location row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: T.card,
        borderRadius: T.r, border: `1px solid ${hexA(T.line, 0.7)}`, boxShadow: T.shadowSoft }}>
        <Icon name="pin" size={18} color={T.primaryDeep} stroke={2} />
        <span style={{ flex: 1, fontFamily: T.text, fontSize: 13.5, fontWeight: 600, color: T.ink }}>台北 · {f.area}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.text, fontSize: 12, fontWeight: 600, color: T.primary }}>
          <Icon name="search" size={15} color={T.primary} stroke={2.2} />搜尋
        </span>
      </div>

      {/* filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {[['餐別', 'meal', REST_FILTERS.meal], ['類型', 'type', REST_FILTERS.type]].map(([lab, key, opts]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: T.text, fontSize: 11.5, fontWeight: 700, color: T.faint, width: 30, flexShrink: 0 }}>{lab}</span>
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
              {opts.map(o => <Chip key={o} T={T} active={f[key] === o} onClick={() => set(key, o)}>{o}</Chip>)}
            </div>
          </div>
        ))}
      </div>

      {/* recommendations */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 10px' }}>
          <span style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink }}>推薦餐廳</span>
          <span style={{ fontFamily: T.text, fontSize: 12, color: T.sub }}>依營養與距離排序</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {RESTAURANTS.map(r => (
            <RestaurantCard key={r.id} T={T} r={r} created={createdCardId === r.id} onCreate={onCreate} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ 我的 — profile, premium, saved, settings ═════════════════════
function ProfileScreen({ T, plan, onPremium, onJournal, onFavorites, onEditProfile, onDiary, onSetting }) {
  const isPremium = plan === 'premium';
  const [favMode, setFavMode] = useStateRP('saved');
  const editRows = ['飲食目標模式', '飯友卡顯示', '頭像造型'];
  return (
    <div style={{ padding: '8px 16px 8px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ScreenTitle T={T} title="我的" sub="你的飲食節奏與偏好" />

      {/* profile summary */}
      <Card T={T} style={{ padding: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, flexShrink: 0,
            background: `linear-gradient(135deg, ${T.accent}, ${T.primary})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft,
            fontFamily: T.text, fontSize: 22, fontWeight: 800, color: '#fff' }}>{USER.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: T.text, fontSize: 18, fontWeight: 800, color: T.ink }}>{USER.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17,
                borderRadius: 999, background: T.green }} title="已驗證">
                <Icon name="check" size={11} color="#fff" stroke={3} /></span>
              {isPremium && <span style={{ fontFamily: T.text, fontSize: 9.5, fontWeight: 700, color: '#fff',
                background: `linear-gradient(120deg, ${T.primary}, ${T.accent})`, padding: '2px 8px', borderRadius: 999 }}>PREMIUM</span>}
            </div>
            <div style={{ fontFamily: T.text, fontSize: 12, color: T.sub, marginTop: 3 }}>目標：{PROFILE.goal}</div>
          </div>
          <button onClick={onEditProfile} style={{ cursor: 'pointer', border: `1px solid ${hexA(T.line, 0.9)}`, background: T.bg2, borderRadius: 999,
            width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="edit" size={16} color={T.sub} stroke={2.1} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {PROFILE.stats.map(s => (
            <div key={s.label} style={{ flex: 1, background: T.bg2, borderRadius: T.rSm, padding: '11px 6px', textAlign: 'center' }}>
              <div style={{ fontFamily: T.display, fontSize: 18, fontWeight: 700, color: T.primaryDeep }}>{s.value}<span style={{ fontSize: 10, color: T.sub, marginLeft: 1 }}>{s.unit}</span></div>
              <div style={{ fontFamily: T.text, fontSize: 10.5, color: T.sub, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* premium status */}
      {isPremium ? (
        <Card T={T} style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 13,
          border: `1.5px solid ${hexA(T.primary, 0.35)}` }}>
          <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0,
            background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSoft }}>
            <Icon name="shield" size={20} color="#fff" stroke={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.text, fontSize: 14.5, fontWeight: 800, color: T.ink }}>Premium 會員</div>
            <div style={{ fontFamily: T.text, fontSize: 11.5, color: T.sub, marginTop: 2 }}>深度 AI 營養師與真人卡已解鎖 · 下次扣款 7/10</div>
          </div>
        </Card>
      ) : (
        <PremiumMini T={T} onOpen={onPremium} />
      )}

      {/* monthly score */}
      <div>
        <div style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink, padding: '0 2px 10px' }}>本月飲食分數</div>
        <MonthlyScore T={T} />
      </div>

      {/* favorites */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bg2, borderRadius: 999, padding: 3 }}>
            {[['saved', '收藏'], ['top', '常吃']].map(([k, l]) => (
              <button key={k} onClick={() => setFavMode(k)} style={{ cursor: 'pointer', border: 'none',
                fontFamily: T.text, fontSize: 13.5, fontWeight: 800, padding: '6px 14px', borderRadius: 999,
                color: favMode === k ? '#fff' : T.sub, background: favMode === k ? T.primary : 'transparent' }}>{l}</button>
            ))}
          </div>
          <button onClick={onFavorites} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', gap: 2, fontFamily: T.text, fontSize: 13, fontWeight: 600, color: T.primary }}>
            查看全部<Icon name="chevron" size={14} color={T.primary} stroke={2.4} />
          </button>
        </div>
        <Favorites T={T} items={favMode === 'saved' ? FAVORITES : TOP_MEALS} />
      </div>

      {/* journal entry */}
      <div>
        <div style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink, padding: '0 2px 10px' }}>美食日記</div>
        <JournalEntry T={T} onOpen={onDiary} />
      </div>

      {/* settings */}
      <div>
        <div style={{ fontFamily: T.text, fontSize: 15, fontWeight: 800, color: T.ink, padding: '0 2px 10px' }}>設定</div>
        <Card T={T} style={{ padding: '4px 16px' }}>
          {SETTINGS.map((s, i) => (
            <div key={i} onClick={() => (editRows.includes(s.label) ? onEditProfile() : onSetting(s.label))} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', cursor: 'pointer',
              borderBottom: i < SETTINGS.length - 1 ? `1px solid ${hexA(T.line, 0.8)}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: T.bg2,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={s.icon} size={17} color={T.primaryDeep} stroke={2} />
              </div>
              <span style={{ flex: 1, fontFamily: T.text, fontSize: 14, fontWeight: 600, color: T.ink }}>{s.label}</span>
              {s.detail && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.text, fontSize: 12,
                color: s.verified ? T.green : T.faint, fontWeight: s.verified ? 700 : 400 }}>
                {s.verified && <Icon name="check" size={13} color={T.green} stroke={3} />}{s.detail}</span>}
              <Icon name="chevron" size={15} color={T.faint} stroke={2.2} />
            </div>
          ))}
        </Card>
      </div>

      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 8px',
        fontFamily: T.text, fontSize: 13, fontWeight: 600, color: T.faint }}>登出</button>
    </div>
  );
}

// ═══ 設定詳情 sheet — verification / reminders / consent / privacy / about ═══
function SettingsDetailSheet({ T, kind, onReplay }) {
  const Toggle = ({ on }) => (
    <span style={{ width: 40, height: 24, borderRadius: 999, flexShrink: 0, position: 'relative',
      background: on ? T.primary : hexA(T.faint, 0.5), transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 18, height: 18, borderRadius: 999,
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .2s' }} /></span>
  );
  const Row = ({ label, sub, control }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', background: T.card,
      borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.text, fontSize: 13.5, fontWeight: 600, color: T.ink }}>{label}</div>
        {sub && <div style={{ fontFamily: T.text, fontSize: 11, color: T.sub, marginTop: 2 }}>{sub}</div>}
      </div>
      {control}
    </div>
  );
  const Section = ({ children }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
  );

  if (kind === '真人驗證') {
    return (
      <div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0 18px' }}>
          <div style={{ width: 60, height: 60, borderRadius: 999, background: hexA(T.green, 0.16),
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={28} color={T.green} stroke={2} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: T.text, fontSize: 16, fontWeight: 800, color: T.ink }}>已完成真人驗證</span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18,
              borderRadius: 999, background: T.green }}><Icon name="check" size={12} color="#fff" stroke={3} /></span>
          </div>
          <span style={{ fontFamily: T.text, fontSize: 12, color: T.sub, textAlign: 'center', lineHeight: 1.6 }}>
            你的飯友卡會顯示藍勾認證，讓其他人更安心與你約吃。</span>
        </div>
        <Section>
          <Row label="手機號碼" sub="已驗證" control={<Icon name="check" size={16} color={T.green} stroke={3} />} />
          <Row label="身分證件" sub="已驗證" control={<Icon name="check" size={16} color={T.green} stroke={3} />} />
          <Row label="臉部辨識" sub="選配·提升信任度" control={<span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>去設定</span>} />
        </Section>
      </div>
    );
  }
  if (kind === '提醒通知') {
    return (
      <Section>
        <Row label="用餐提醒" sub="提醒你拍照記錄三餐" control={<Toggle on={true} />} />
        <Row label="今晚預定提醒" sub="出發前提醒你的飯局" control={<Toggle on={true} />} />
        <Row label="飯友邀約與配對" sub="收到邀約或配對成功時" control={<Toggle on={true} />} />
        <Row label="桶人營養師建議" sub="每日針對你的飲食小提醒" control={<Toggle on={false} />} />
        <Row label="Premium 優惠通知" control={<Toggle on={false} />} />
      </Section>
    );
  }
  if (kind === '資料授權與紀錄可見度') {
    return (
      <Section>
        <Row label="飲食紀錄可見度" sub="僅自己可見" control={<span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>僅自己 ▾</span>} />
        <Row label="分享給飯友牌成員" sub="同桌飯友可看見你的均衡紀錄" control={<Toggle on={true} />} />
        <Row label="匯總營養數據用於 AI 分析" sub="協助提升辨識與建議品質" control={<Toggle on={true} />} />
        <Row label="個人化廣告" control={<Toggle on={false} />} />
        <div style={{ fontFamily: T.text, fontSize: 11, color: T.faint, lineHeight: 1.6, padding: '4px 4px 0' }}>
          你隨時可以調整授權設定，或請求匯出、刪除你的飲食紀錄。</div>
      </Section>
    );
  }
  if (kind === '隱私與帳號') {
    return (
      <Section>
        <Row label="帳號資料" sub="電子郵件、登入方式" control={<Icon name="chevron" size={16} color={T.faint} stroke={2.2} />} />
        <Row label="封鎖或隱藏飯友" sub="管理不想被配對的對象" control={<Icon name="chevron" size={16} color={T.faint} stroke={2.2} />} />
        <Row label="下載我的資料" control={<Icon name="chevron" size={16} color={T.faint} stroke={2.2} />} />
        <Row label="刪除帳號" control={<span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>請求</span>} />
      </Section>
    );
  }
  // 關於豪食友
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '4px 0 18px' }}>
        <div style={{ width: 60, height: 60, borderRadius: 19, background: `linear-gradient(135deg, ${T.primary}, ${T.accent})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.text, fontSize: 28, fontWeight: 800, color: '#fff',
          boxShadow: T.shadowSoft }}>豪</div>
        <div style={{ fontFamily: T.text, fontSize: 17, fontWeight: 800, color: T.ink }}>豪食友 haocu</div>
        <div style={{ fontFamily: T.text, fontSize: 12, color: T.sub }}>AI 營養 × 飯友社交 · v1.0</div>
      </div>
      <Section>
        <Row label="使用條款" control={<Icon name="chevron" size={16} color={T.faint} stroke={2.2} />} />
        <Row label="隱私權政策" control={<Icon name="chevron" size={16} color={T.faint} stroke={2.2} />} />
        <Row label="評分與回饋" control={<Icon name="chevron" size={16} color={T.faint} stroke={2.2} />} />
        <button onClick={onReplay} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', cursor: 'pointer',
          width: '100%', textAlign: 'left', background: T.card, borderRadius: T.rSm, border: `1px solid ${hexA(T.line, 0.8)}` }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, overflow: 'hidden', flexShrink: 0, background: T.bg2,
            border: `1px solid ${hexA(T.primary, 0.2)}` }}>
            <img src="mascots/balance.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></div>
          <span style={{ flex: 1, fontFamily: T.text, fontSize: 13.5, fontWeight: 600, color: T.ink }}>新手導覽</span>
          <span style={{ fontFamily: T.text, fontSize: 12, fontWeight: 700, color: T.primaryDeep }}>重新觀看</span>
        </button>
      </Section>
    </div>
  );
}

Object.assign(window, { RestaurantScreen, ProfileScreen, RestaurantDetailSheet, SettingsDetailSheet });
