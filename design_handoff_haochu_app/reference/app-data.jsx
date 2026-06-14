// app-data.jsx — sample content for 好廚 demo (Traditional Chinese)
// Exported to window: USER, NUTRITION, MEALS, JOURNAL, FAVORITES, MONTHLY, BUDDIES

const USER = {
  name: '宜蓁',
  greeting: '早安',
  date: '6 月 10 日 · 星期三',
  goal: '吃得均衡，不要有壓力',
  avatar: '宜',
};

// Today's totals vs goal
const NUTRITION = {
  kcal: { value: 1180, goal: 1850 },
  macros: [
    { key: 'protein', label: '蛋白質', value: 68, goal: 75, unit: 'g', tone: 'primary', note: '接近目標' },
    { key: 'carb', label: '碳水', value: 142, goal: 210, unit: 'g', tone: 'accent', note: '節奏剛好' },
    { key: 'fat', label: '脂肪', value: 38, goal: 60, unit: 'g', tone: 'amber', note: '可補好油脂' },
    { key: 'fiber', label: '纖維', value: 11, goal: 25, unit: 'g', tone: 'green', note: '今天偏少' },
  ],
  // warm, encouraging — never medical/scolding
  coach: '蛋白質快達標了，表現很穩 👏 晚餐和朋友吃定食時，幫自己多夾一份蔬菜、選一點好油脂，今天就很完整。',
  // one-line daily status for the home hero
  status: '蛋白質快達標，晚餐補點纖維和好油脂就完整了',
};

const MEALS = [
  {
    key: 'breakfast', label: '早餐', time: '08:10', icon: 'drop',
    state: 'logged', kcal: 420,
    items: ['燕麥拿鐵（中杯）', '鮪魚蛋吐司'],
    tags: ['蛋白質 +22g', '咖啡因'],
    detail: '一份不錯的開場！吐司的蛋幫你補了蛋白質，下午若嘴饞可以選無糖豆漿。',
  },
  {
    key: 'lunch', label: '午餐', time: '12:35', icon: 'plate',
    state: 'logged', kcal: 640,
    items: ['烤雞腿便當', '白飯半碗', '青菜兩份'],
    tags: ['蛋白質 +34g', '蔬菜 ×2'],
    detail: '便當挑得很好：白飯減半、青菜加倍，蛋白質充足。這餐是今天的亮點。',
  },
  {
    key: 'snack', label: '點心', time: '15:20', icon: 'leaf',
    state: 'logged', kcal: 120,
    items: ['無糖豆漿'],
    tags: ['蛋白質 +12g', '無糖'],
    detail: '聰明的下午選擇，既解饞又補蛋白質，不影響晚餐食慾。',
  },
  {
    key: 'dinner', label: '晚餐', time: '19:30', icon: 'star',
    state: 'planned', kcal: null,
    items: ['和朋友吃日式定食'],
    tags: ['已預定', '飯友 ×2'],
    detail: '建議點有生魚或烤魚的定食補好油脂，再加一份溫蔬菜或味噌湯，今天的纖維就補回來了。',
  },
];

// food journal — short timeline notes the user jotted down
const JOURNAL = [
  { time: '08:12', mood: '🙂', text: '趕著開會，邊走邊吃。咖啡換成燕麥奶，肚子比較舒服。' },
  { time: '12:40', mood: '😌', text: '今天特地請店員白飯減半，青菜加倍。覺得自己很可以。' },
  { time: '15:22', mood: '🙂', text: '下午想喝手搖，改成無糖豆漿撐過去了。' },
];

const FAVORITES = [
  { name: '烤雞腿便當', place: '巷口自助餐', kcal: 640, tag: '高蛋白' },
  { name: '鮪魚蛋吐司', place: '晨間咖啡', kcal: 310, tag: '快速早餐' },
  { name: '鮭魚定食', place: '和食处', kcal: 580, tag: '好油脂' },
  { name: '無糖豆漿', place: '永和豆漿', kcal: 90, tag: '解饞' },
];

const MONTHLY = {
  score: 82,
  grade: 'A−',
  trend: '+6',
  caption: '六月你的飲食很穩定',
  streak: 12,
  weeks: [64, 71, 78, 82], // recent 4-week trend
  highlights: [
    { label: '連續紀錄', value: '12 天' },
    { label: '蔬菜達標', value: '18 / 30 天' },
    { label: '外食均衡率', value: '76%' },
  ],
};

const BUDDIES = [
  { name: '小綠', avatar: '綠', note: '也想吃定食' },
  { name: 'Ray', avatar: 'R', note: '晚上有空' },
  { name: '阿哲', avatar: '哲', note: '揪一波' },
];

// today's available meal buddies — mix of real & anonymous cards
const BUDDY_CARDS = [
  { id: 'b1', type: 'real', name: '小綠', avatar: '綠', area: '大安區', dist: '0.8km',
    taste: ['清淡', '高蛋白'], goal: '吃得均衡', when: '今晚 19:00', match: 92 },
  { id: 'b2', type: 'anon', name: '匿名飯友', mascot: 'lowcarb', area: '信義區', dist: '1.5km',
    taste: ['日式', '少油'], goal: '減脂中', when: '今晚 19:30', match: 88 },
  { id: 'b3', type: 'real', name: 'Ray', avatar: 'R', area: '大安區', dist: '1.1km',
    taste: ['麵食', '重訓'], goal: '增肌', when: '明天午餐', match: 81 },
  { id: 'b4', type: 'anon', name: '匿名飯友', mascot: 'veggie', area: '中正區', dist: '2.3km',
    taste: ['蔬食', '輕食'], goal: '多吃蔬菜', when: '週末早午餐', match: 76 },
];

// my own buddy card
const MY_CARD = {
  name: '宜蓁', avatar: '宜', area: '台北 · 大安區',
  taste: ['清淡', '高蛋白', '日式'], goal: '吃得均衡、不要有壓力', when: '平日晚餐',
};

const RESTAURANTS = [
  { id: 'r1', name: '和食処 ささ', cuisine: '日式定食', dist: '0.6km', rating: 4.7,
    price: '$$', tags: ['高蛋白', '好油脂', '少油炸'], note: '生魚與烤魚定食，補好油脂首選',
    verified: true, picks: [['鮭魚定食', 580, '好油脂'], ['烤雞腿定食', 620, '高蛋白']] },
  { id: 'r2', name: '青蔬廚房', cuisine: '健康輕食', dist: '0.9km', rating: 4.6,
    price: '$$', tags: ['多蔬菜', '高纖', '低卡'], note: '溫沙拉與穀物碗，纖維好補',
    verified: true, picks: [['藜麥蔬菜碗', 420, '高纖'], ['溫沙拉雞胸', 380, '低卡']] },
  { id: 'r3', name: '巷口自助餐', cuisine: '台式自助', dist: '0.3km', rating: 4.4,
    price: '$', tags: ['可客製', '青菜多', '白飯減半'], note: '青菜任夾，白飯可減半',
    verified: false, picks: [['三蔬一肉', 540, '可客製'], ['滷雞腿便當', 640, '高蛋白']] },
  { id: 'r4', name: 'Bonjour 咖啡', cuisine: '咖啡輕食', dist: '1.2km', rating: 4.5,
    price: '$$', tags: ['輕食', '無糖選擇'], note: '燕麥拿鐵與蛋吐司，清爽早午餐',
    verified: true, picks: [['燕麥拿鐵', 160, '無糖'], ['酪梨蛋吐司', 360, '好油脂']] },
];

const REST_FILTERS = {
  area: ['大安區', '信義區', '中正區'],
  meal: ['早餐', '午餐', '晚餐', '點心'],
  type: ['全部', '日式', '輕食', '台式', '咖啡'],
};

// profile summary stats (我的)
const PROFILE = {
  goal: '吃得均衡、不要有壓力',
  stats: [
    { label: '連續紀錄', value: '12', unit: '天' },
    { label: '本月分數', value: '82', unit: '分' },
    { label: '收藏', value: '8', unit: '道' },
  ],
};

const SETTINGS = [
  { icon: 'target', label: '飲食目標模式', detail: '均衡 · 1850 大卡' },
  { icon: 'user', label: '飯友卡顯示', detail: '真人' },          // anonymous / real profile
  { icon: 'shield', label: '真人驗證', detail: '已驗證', verified: true }, // verification status
  { icon: 'star', label: '頭像造型', detail: '匿名・低醣忍者' },     // mascot avatar (anon)
  { icon: 'bell2', label: '提醒通知', detail: '已開啟' },
  { icon: 'eyeOff', label: '資料授權與紀錄可見度', detail: '僅自己' }, // data consent / visibility
  { icon: 'lock', label: '隱私與帳號', detail: '' },
  { icon: 'spark', label: '關於豪食友', detail: 'v1.0' },
];

// buddy invitations hub — received / sent(pending) / matched
const INVITES = {
  received: [
    { id: 'iv1', type: 'real', name: '阿哲', avatar: '哲', area: '大安區', when: '今晚 19:00', match: 84, msg: '一起吃定食？' },
  ],
  sent: [
    { id: 'is1', type: 'real', name: '小綠', avatar: '綠', area: '大安區', when: '今晚 19:00', match: 92, status: '等待回覆' },
    { id: 'is2', type: 'anon', name: '匿名飯友', mascot: 'latenight', area: '信義區', when: '今晚 19:30', match: 88, status: '等待回覆' },
  ],
  matched: [
    { id: 'im1', type: 'real', name: 'Ray', avatar: 'R', area: '大安區', when: '明天午餐', match: 81 },
  ],
};

// past four-seat tables (參加過的四人桌)
const PAST_TABLES = [
  { id: 'pt1', title: '韓式拌飯・四人桌', date: '6/3', people: 4, result: '已完成' },
  { id: 'pt2', title: '輕食沙拉・三人聚', date: '5/27', people: 3, result: '已完成' },
];

// most-eaten meals this month (常吃)
const TOP_MEALS = [
  { name: '燕麥拿鐵', place: '晨間咖啡', kcal: 160, tag: '本月 12 次' },
  { name: '無糖豆漿', place: '永和豆漿', kcal: 90, tag: '本月 9 次' },
  { name: '烤雞腿便當', place: '巷口自助餐', kcal: 640, tag: '本月 8 次' },
  { name: '鮭魚定食', place: '和食処', kcal: 580, tag: '本月 5 次' },
];

// four-seat group table (四人桌)
const TABLE = {
  title: '日式定食・四人桌', when: '今晚 19:30', place: '和食処 ささ · 大安區',
  seats: [
    { name: '宜蓁', avatar: '宜', role: 'host' },
    { name: '小綠', avatar: '綠', role: 'joined' },
    { name: '', avatar: '', role: 'open' },
    { name: '', avatar: '', role: 'open' },
  ],
};

// chat threads (聊天)
const CHATS = [
  { id: 'c1', name: '小綠', avatar: '綠', type: 'real', last: '今晚 7 點老地方見！', time: '剛剛', unread: 2 },
  { id: 'c2', name: '日式定食・四人桌', avatar: '桌', type: 'group', last: 'Ray：我可能晚 10 分鐘到', time: '12:30', unread: 0 },
  { id: 'c3', name: '匿名飯友', mascot: 'explorer', type: 'anon', last: '你：那就約週末早午餐～', time: '昨天', unread: 0 },
];

// upcoming group tables (即將開桌)
const UPCOMING_TABLES = [
  { id: 'ut1', title: '青蔬廚房・四人桌', when: '明天 12:30', place: '大安區', size: 4, joined: 3 },
  { id: 'ut2', title: 'Bonjour 早午餐・四人桌', when: '週六 10:30', place: '信義區', size: 4, joined: 2 },
];

// invitations to tables (桌邀請)
const TABLE_INVITES = [
  { id: 'ti1', title: '巷口自助餐・六人桌', from: '小綠', when: '週五 18:30', size: 6 },
];

// daily diary records (歷史每日紀錄)
const DAILY_RECORDS = [
  { date: '6/10 三', kcal: 1180, goal: 1850, score: 84 },
  { date: '6/9 二', kcal: 1760, goal: 1850, score: 88 },
  { date: '6/8 一', kcal: 1620, goal: 1850, score: 79 },
  { date: '6/7 日', kcal: 1980, goal: 1850, score: 72 },
  { date: '6/6 六', kcal: 1540, goal: 1850, score: 90 },
];

// planned meal history (已安排紀錄)
const PLANNED_HISTORY = [
  { date: '今晚', title: '和朋友吃日式定食', status: '即將到來' },
  { date: '6/8', title: '家庭聚餐・火鍋', status: '已完成' },
  { date: '6/3', title: '同事午餐・韓式拌飯', status: '已完成' },
];

// 8 food-persona mascots — used ONLY for anonymous identity + onboarding guide
const MASCOTS = [
  { id: 'protein', label: '蛋白質主義', sub: '強健有活力' },
  { id: 'veggie', label: '素食主義', sub: '清新療癒系' },
  { id: 'fastfood', label: '快餐俠', sub: '迅速又熱血' },
  { id: 'dessert', label: '甜點療癒師', sub: '甜蜜好療癒' },
  { id: 'balance', label: '均衡守護者', sub: '營養超均衡' },
  { id: 'latenight', label: '深夜食堂人', sub: '宵夜暖心陪伴' },
  { id: 'lowcarb', label: '低醣忍者', sub: '自律低醣行' },
  { id: 'explorer', label: '嚐鮮探險家', sub: '探索新美味' },
];

// notification center
const NOTIFICATIONS = [
  { id: 'n1', type: 'match', icon: 'spark', title: '配對成功', text: '你和小綠互相喜歡，開始聊聊吧！', time: '剛剛', unread: true },
  { id: 'n2', type: 'buddy', icon: 'invite', title: '飯友邀請', text: '阿哲想找你一起吃定食', time: '10 分鐘前', unread: true },
  { id: 'n3', type: 'table', icon: 'table4', title: '桌邀請', text: '「巷口自助餐・六人桌」邀請你入座', time: '30 分鐘前', unread: true },
  { id: 'n4', type: 'accepted', icon: 'check', title: '邀請已接受', text: 'Ray 接受了你的午餐邀請', time: '1 小時前', unread: false },
  { id: 'n5', type: 'reminder', icon: 'clock', title: '用餐提醒', text: '午餐時間到了，記得拍照分析一餐', time: '今天 12:00', unread: false },
  { id: 'n6', type: 'dinner', icon: 'star', title: '今晚預定提醒', text: '19:30 和朋友吃日式定食，別忘了補纖維', time: '今天 17:00', unread: false },
  { id: 'n7', type: 'premium', icon: 'shield', title: 'Premium 通知', text: '你的首月免費試用還有 5 天', time: '昨天', unread: false },
];

Object.assign(window, { USER, NUTRITION, MEALS, JOURNAL, FAVORITES, MONTHLY, BUDDIES, BUDDY_CARDS, MY_CARD, RESTAURANTS, REST_FILTERS, PROFILE, SETTINGS, TABLE, CHATS, INVITES, PAST_TABLES, TOP_MEALS, UPCOMING_TABLES, TABLE_INVITES, DAILY_RECORDS, PLANNED_HISTORY, MASCOTS, NOTIFICATIONS });
