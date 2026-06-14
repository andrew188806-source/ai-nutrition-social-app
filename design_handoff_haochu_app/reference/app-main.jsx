// app-main.jsx — assembles 好廚 as a 5-tab clickable prototype inside the iOS frame
// Tabs: 首頁 · 分析 · 飯友 · 餐廳 · 我的  (no center FAB; sharing lives inside cards)
const { useState, useRef, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "snow",
  "radius": 22,
  "numFont": "sharp",
  "plan": "free"
}/*EDITMODE-END*/;

// ── 首頁 — simple daily overview only (cards open detail sheets) ─────
function HomeScreen({ T, openSheet, goAnalysis, goBuddies }) {
  return (
    <div style={{ padding: '8px 16px 8px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      <HomeHero T={T} />
      <TodaySummary T={T} onShare={() => openSheet('share')} />

      <div>
        <SectionHeader T={T} title="今天吃了什麼" sub="點任一餐看 AI 分析" />
        <MealGrid T={T} onOpen={(m) => openSheet('meal', m)} />
      </div>

      <ActionRow T={T} onAnalyze={goAnalysis} onBuddies={goBuddies} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <ReminderRow T={T} onOpen={() => openSheet('dinner')} />
        <JournalEntry T={T} onOpen={() => openSheet('journal')} />
      </div>
    </div>
  );
}

function App({ forcePalette, forceRadius, forceNumFont, embedded = false } = {}) {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useState('home');
  const [plan, setPlan] = useState(t.plan);
  const [sheet, setSheet] = useState(null);   // null | 'share'|'dinner'|'journal'|'premium'|'meal'
  const [activeMeal, setActiveMeal] = useState(null);
  const [activeRest, setActiveRest] = useState(null);   // restaurant open in detail sheet
  const [restCard, setRestCard] = useState(null);       // buddy card created from a restaurant
  const [createdTableRest, setCreatedTableRest] = useState(null); // table created from a restaurant
  const [invitesSeg, setInvitesSeg] = useState('received');
  const [settingKind, setSettingKind] = useState('');
  const [notifRead, setNotifRead] = useState(false);
  const [createdCardId, setCreatedCardId] = useState(null);
  const [onboard, setOnboard] = useState(() => {
    if (embedded) return false;   // comparison instances never show the coach
    try { return localStorage.getItem('haocu_onboard_done') !== '1'; } catch (e) { return true; }
  });
  const scrollRef = useRef(null);

  useEffect(() => { setPlan(t.plan); }, [t.plan]);
  // reset scroll to top whenever the tab changes
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [tab]);

  const T = makeTheme({
    palette: forcePalette || t.palette,
    radius: forceRadius != null ? forceRadius : t.radius,
    numFont: forceNumFont || t.numFont,
  });

  const openSheet = (key, meal) => { if (meal) setActiveMeal(meal); setSheet(key); };
  const closeSheet = () => setSheet(null);
  const goTab = (k) => { setSheet(null); setTab(k); };

  const handleCreateCard = (r) => {
    setRestCard(r);
    setCreatedCardId(r.id);
    setSheet(null);
    setTab('buddies');
  };

  const openDetail = (r) => { setActiveRest(r); setSheet('restdetail'); };
  const openInvites = (seg) => { setInvitesSeg(seg || 'received'); setSheet('invites'); };
  const openSetting = (label) => { setSettingKind(label); setSheet('setting'); };
  const openNotif = () => { setSheet('notif'); setNotifRead(true); };
  const handleCreateTable = (r) => { setCreatedTableRest(r); setSheet('table'); setTab('buddies'); };
  const unread = notifRead ? 0 : NOTIFICATIONS.filter(n => n.unread).length;
  const closeOnboard = () => { try { localStorage.setItem('haocu_onboard_done', '1'); } catch (e) {} setOnboard(false); };
  const replayOnboard = () => { setSheet(null); setTab('home'); setOnboard(true); };

  const tabContent = {
    home: <HomeScreen T={T} openSheet={openSheet} goAnalysis={() => goTab('analysis')} goBuddies={() => goTab('buddies')} />,
    analysis: <AnalysisScreen T={T} onAddMeal={() => goTab('home')} onBuddies={() => goTab('buddies')} onRestaurant={() => goTab('restaurant')}
      onHome={() => goTab('home')} onDinner={() => openSheet('dinner')} onNextMeal={() => openSheet('nextmeal')} />,
    buddies: <BuddiesScreen T={T} plan={plan} myRestaurantCard={restCard} onUpgrade={() => openSheet('premium')}
      onTable={() => openSheet('table')} onChat={() => openSheet('chat')} onCreateCard={() => openSheet('editcard')} onInvites={openInvites} onSearch={() => openSheet('search')} />,
    restaurant: <RestaurantScreen T={T} createdCardId={createdCardId} onCreate={handleCreateCard} onOpenDetail={openDetail} />,
    me: <ProfileScreen T={T} plan={plan} onPremium={() => openSheet('premium')} onJournal={() => openSheet('journal')}
      onFavorites={() => {}} onEditProfile={() => openSheet('editprofile')} onDiary={() => openSheet('diary')} onSetting={openSetting} />,
  };

  const sheetTitle = { dinner: '今晚的約', journal: '飲食手札', premium: '豪食友 Premium', meal: '餐點分析',
    table: '飯友桌', chat: '聊天', editcard: '建立飯友卡', invites: '邀約與配對', restdetail: '餐廳詳情',
    notif: '通知', diary: '飲食日記', editprofile: '編輯個人檔案', nextmeal: '下一餐建議', search: '搜尋飯友', setting: settingKind };

  const phone = (
    <IOSDevice width={402} height={874} dark={T.dark}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, position: 'relative' }}>
          <AppHeader T={T} onBell={openNotif} unread={unread} />
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {tabContent[tab]}
            <div style={{ flex: 1 }} />
          </div>
          <BottomNav T={T} tab={tab} setTab={goTab} />

          {sheet === 'share' && <ShareModal T={T} onClose={closeSheet} />}
          {sheet && sheet !== 'share' && (
            <Sheet T={T} title={sheetTitle[sheet]} onClose={closeSheet}>
              {sheet === 'dinner' && <PlannedDinner T={T} onShare={() => setSheet('share')} />}
              {sheet === 'journal' && <JournalCard T={T} />}
              {sheet === 'premium' && <PremiumUpgrade T={T} plan={plan} setPlan={setPlan} />}
              {sheet === 'meal' && activeMeal && <MealDetail T={T} meal={activeMeal} />}
              {sheet === 'table' && <FourSeatSheet T={T} onShare={() => setSheet('share')} plan={plan} onUpgrade={() => setSheet('premium')} createdTableRest={createdTableRest} />}
              {sheet === 'chat' && <ChatSheet T={T} />}
              {sheet === 'editcard' && <EditCardSheet T={T} />}
              {sheet === 'invites' && <InvitesSheet T={T} initialSeg={invitesSeg} />}
              {sheet === 'restdetail' && <RestaurantDetailSheet T={T} r={activeRest} created={activeRest && createdCardId === activeRest.id} onCreate={handleCreateCard} onCreateTable={handleCreateTable} />}
              {sheet === 'notif' && <NotificationSheet T={T} items={NOTIFICATIONS} />}
              {sheet === 'diary' && <FoodDiarySheet T={T} />}
              {sheet === 'editprofile' && <EditProfileSheet T={T} />}
              {sheet === 'nextmeal' && <NextMealSheet T={T} onRestaurant={() => goTab('restaurant')} />}
              {sheet === 'search' && <BuddySearchSheet T={T} />}
              {sheet === 'setting' && <SettingsDetailSheet T={T} kind={settingKind} onReplay={replayOnboard} />}
            </Sheet>
          )}

          {onboard && <OnboardingCoach T={T} onClose={closeOnboard} />}
        </div>
      </IOSDevice>
  );

  if (embedded) return phone;

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', justifyContent: 'center',
      alignItems: 'center', padding: 28, boxSizing: 'border-box',
      background: `radial-gradient(120% 90% at 50% 0%, ${hexA(T.primary, 0.06)}, transparent 55%), ${T.bg2}` }}>
      {phone}

      <TweaksPanel>
        <TweakSection label="視覺風格" />
        <TweakRadio label="配色主題" value={t.palette}
          options={[{ value: 'snow', label: '雪白極簡' }, { value: 'soft', label: '柔桃奶霜' }, { value: 'ink', label: '墨韻深夜' }]}
          onChange={(v) => setTweak('palette', v)} />
        <TweakSlider label="卡片圓角" value={t.radius} min={14} max={32} step={2} unit="px"
          onChange={(v) => setTweak('radius', v)} />
        <TweakRadio label="數字字體" value={t.numFont}
          options={[{ value: 'round', label: '圓潤' }, { value: 'sharp', label: '俐落' }]}
          onChange={(v) => setTweak('numFont', v)} />
        <TweakSection label="方案預覽" />
        <TweakRadio label="顯示方案" value={t.plan}
          options={[{ value: 'free', label: '免費版' }, { value: 'premium', label: 'Premium' }]}
          onChange={(v) => setTweak('plan', v)} />
      </TweaksPanel>
    </div>
  );
}

const _rootEl = document.getElementById('root');
if (_rootEl) ReactDOM.createRoot(_rootEl).render(<App />);

Object.assign(window, { App });
