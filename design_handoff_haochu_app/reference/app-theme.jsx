// app-theme.jsx — palette presets, fonts, shared visual helpers for 好廚
// Exported to window: PALETTES, makeTheme, Icon, hexA

// ── Palette presets — warm, calm, premium food-lifestyle ────────────
// peach = default. All three stay in a low-saturation warm family:
// cream/ivory bg · warm-white cards · soft-coral CTA · muted-rose accent
// · light-tan secondary surfaces · sage nutrition tags · warm-brown ink.
const PALETTES = {
  peach: {
    label: '奶霜米白',
    bg: '#FDFAF4', bg2: '#F9F4EC', card: '#FFFFFF',
    primary: '#D9876B', primaryDeep: '#C26A50', primarySoft: '#F9EEE6',
    accent: '#C68B91', green: '#A4B68F', amber: '#C9A06C',
    ai: '#69A39C', aiSoft: '#EAF3F0',
    ink: '#382A22', sub: '#8C7B6E', faint: '#A6937D',
    line: '#F1EBE0', track: '#F3ECE1', blush: '#EFE6E3',
    heroFrom: '#F9F2E9', heroTo: '#F6ECE6',
  },
  rose: {
    label: '燕麥拿鐵',
    bg: '#FBF6EE', bg2: '#F7F1E8', card: '#FFFFFF',
    primary: '#CF8466', primaryDeep: '#B96A4D', primarySoft: '#F8EEE2',
    accent: '#BC8A8A', green: '#A6B38E', amber: '#C49B66',
    ai: '#66A099', aiSoft: '#EBF3EF',
    ink: '#382C23', sub: '#8A7A6C', faint: '#A4917C',
    line: '#F0E9DD', track: '#F2EBE0', blush: '#EFE5E2',
    heroFrom: '#F8F0E6', heroTo: '#F4E9E0',
  },
  berry: {
    label: '楓糖玫瑰',
    bg: '#FDF7F0', bg2: '#F9F1E9', card: '#FFFFFF',
    primary: '#D67E6E', primaryDeep: '#BE6353', primarySoft: '#FBECE5',
    accent: '#C07F8C', green: '#A5B591', amber: '#C89E6C',
    ai: '#64A29C', aiSoft: '#EBF4F0',
    ink: '#392A26', sub: '#8C7970', faint: '#A89484',
    line: '#F2E9E0', track: '#F4ECE3', blush: '#F1E7E4',
    heroFrom: '#FAF0E8', heroTo: '#F7E9E6',
  },

  // ── Direction B · Warm Tech / Smart AI ──────────────────────────────
  // Warm coral CTA kept; cooler misty-sage surfaces + a stronger, more
  // present soft teal carry the "smart" feeling. Cooler charcoal ink.
  tech: {
    label: '智慧霧綠',
    bg: '#F7F7F2', bg2: '#EDF1ED', card: '#FFFFFF',
    primary: '#D17B62', primaryDeep: '#B9624A', primarySoft: '#F6EBE4',
    accent: '#7FA1A2', green: '#9FB58E', amber: '#C49B66',
    ai: '#3E938B', aiSoft: '#E0EDEA',
    ink: '#2D3A37', sub: '#74817D', faint: '#9AA6A1',
    line: '#E8ECE7', track: '#ECF0EB', blush: '#E6EAE9',
    heroFrom: '#EAF1EE', heroTo: '#F5ECE6',
    shadowScale: 0.95,
  },

  // ── Direction C · Bright Minimal / Airy Lifestyle ───────────────────
  // Near-white warm canvas, the lightest hairlines, barely-there shadow.
  // Fresh and minimal but still warm via a slightly lifted coral.
  airy: {
    label: '清亮奶白',
    bg: '#FFFDF9', bg2: '#FBF8F2', card: '#FFFFFF',
    primary: '#E0846A', primaryDeep: '#CC6A50', primarySoft: '#FCEFE9',
    accent: '#CE9098', green: '#AABB95', amber: '#CCA06A',
    ai: '#72ABA4', aiSoft: '#EFF6F3',
    ink: '#3F3128', sub: '#988A7D', faint: '#B3A496',
    line: '#F5F0E8', track: '#F8F3EC', blush: '#F4ECE8',
    heroFrom: '#FFFAF3', heroTo: '#FCF0EB',
    shadowScale: 0.6,
  },

  // ═══ MERGED BASE · 3 versions ═══════════════════════════════════════
  // Base = B's card/contrast structure (cooler, separated surfaces so cards
  // pop) + A's friendly round typography + C's soft, light, gentle mood.
  // Green is demoted everywhere to a muted, light, SECONDARY sage used only
  // for nutrition/verified meaning — never a dominant accent.

  // ── Version 1 · Soft Peach / Cream — safest, softest, lifestyle ─────
  soft: {
    label: '柔桃奶霜',
    bg: '#FEF8F1', bg2: '#F6EDE4', card: '#FFFFFF',
    primary: '#E08A6E', primaryDeep: '#CB6E51', primarySoft: '#FBEEE7',
    accent: '#D89486', green: '#AEBEA4', amber: '#D3A36A',
    ai: '#6FA8A1', aiSoft: '#EFF5F2',
    ink: '#3E2F26', sub: '#937F6E', faint: '#B7A691',
    line: '#F1E8DC', track: '#F4ECE1', blush: '#F3E8E3',
    heroFrom: '#FEF3EA', heroTo: '#FCEBE3',
    shadowScale: 0.7,
  },

  // ── Version 2 · Dusty Rose / Mauve Tech — refined, smart, modern ────
  mauve: {
    label: '霧玫瑰調',
    bg: '#FAF6F4', bg2: '#F0E9EB', card: '#FFFFFF',
    primary: '#C87E84', primaryDeep: '#B0656C', primarySoft: '#F4E8E9',
    accent: '#9A8598', green: '#A6B3A6', amber: '#C39A78',
    ai: '#7E91A8', aiSoft: '#EBEFF5',
    ink: '#352B30', sub: '#887B82', faint: '#AC9FA6',
    line: '#EBE3E5', track: '#EFE8EA', blush: '#ECE1E6',
    heroFrom: '#F4ECEF', heroTo: '#F7EAEA',
    shadowScale: 0.8,
  },

  // ── Version 3 · Apricot / Sand / Warm Minimal — brighter, airier ────
  sand: {
    label: '杏沙暖白',
    bg: '#FFFCF6', bg2: '#F9F2E7', card: '#FFFFFF',
    primary: '#E69266', primaryDeep: '#D5764E', primarySoft: '#FCEFE4',
    accent: '#D2A57E', green: '#B2C0A1', amber: '#DAA866',
    ai: '#79ADA4', aiSoft: '#F0F6F3',
    ink: '#43352A', sub: '#9C8A78', faint: '#BCAB94',
    line: '#F4ECDF', track: '#F8F1E5', blush: '#F4ECE1',
    heroFrom: '#FFF7EC', heroTo: '#FCEFE1',
    shadowScale: 0.55,
  },

  // ═══ HIGH-CONTRAST SET · dramatically different moods ════════════════

  // ── Direction · Dark / Ink — elegant espresso-plum, warm dark ───────
  ink: {
    label: '墨韻深夜',
    dark: true,
    bg: '#1C181F', bg2: '#252029', card: '#2A242F',
    primary: '#EC9079', primaryDeep: '#F2AD97', primarySoft: '#3B2D31',
    accent: '#CD9FB4', green: '#9DB39A', amber: '#DBB07A',
    ai: '#83C4BA', aiSoft: '#22312F',
    ink: '#F4EEE9', sub: '#B6A9B0', faint: '#897E87',
    line: '#37303C', track: '#322B37', blush: '#332A34',
    heroFrom: '#2B2331', heroTo: '#231D29',
    solid: '#EFE8E1', solidText: '#241E28',
    shadowColor: '#000000', shadowScale: 1.2,
  },

  // ── Direction · Bright / White Minimal — bright warm ivory, soft coral
  //    CTA, calm blue-gray AI. Clean, airy, premium, breathable. ────────
  snow: {
    label: '雪白極簡',
    bg: '#FBFAF5', bg2: '#F3F0E9', card: '#FFFFFF',
    primary: '#E0806E', primaryDeep: '#CC6552', primarySoft: '#FBEAE3',
    accent: '#D08C84', green: '#8AAE97', amber: '#D5A267',
    ai: '#6E8CA9', aiSoft: '#EAEFF6',
    ink: '#2C2722', sub: '#867C71', faint: '#AEA498',
    line: '#EEEAE2', track: '#F1ECE4', blush: '#F0E9EA',
    heroFrom: '#FFFFFF', heroTo: '#FBEFEA',
    shadowColor: '#2C2722', shadowScale: 0.5,
  },

  // ── Direction · Bold Warm / Color-Forward — terracotta + berry ──────
  bold: {
    label: '熱情陶紅',
    bg: '#FBE4D6', bg2: '#F6D3C0', card: '#FFFBF8',
    primary: '#E14328', primaryDeep: '#C5331A', primarySoft: '#FCD8C8',
    accent: '#AE315F', green: '#7FA88C', amber: '#EE9A3C',
    ai: '#17887D', aiSoft: '#CDE9E3',
    ink: '#40180F', sub: '#92604F', faint: '#BE927F',
    line: '#F2C9B4', track: '#F4CFBC', blush: '#F6CFC6',
    heroFrom: '#FFC3A6', heroTo: '#F59CB4',
    shadowColor: '#6B2412', shadowScale: 1.0,
  },
};

const FONT_TC = '"Noto Sans TC", system-ui, sans-serif';
const FONTS = {
  round: '"Baloo 2", ' + FONT_TC,   // friendly rounded numerals
  sharp: '"Space Grotesk", ' + FONT_TC, // crisp modern numerals
};

// hex + alpha → rgba
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function makeTheme({ palette = 'peach', radius = 24, numFont = 'round' } = {}) {
  const p = PALETTES[palette] || PALETTES.peach;
  const s = p.shadowScale == null ? 1 : p.shadowScale;
  const sc = p.shadowColor || p.ink;
  return {
    ...p,
    ai: p.ai || '#5DA7A0', aiSoft: p.aiSoft || '#DCEBE8',
    key: palette,
    dark: !!p.dark,
    solid: p.solid || p.ink,        // neutral strong button surface
    solidText: p.solidText || '#fff',
    r: radius,             // base card radius
    rSm: Math.max(12, radius - 8),
    rLg: radius + 8,
    text: FONT_TC,
    display: FONTS[numFont] || FONTS.round,
    shadow: `0 1px 2px ${hexA(sc, 0.02 * s)}, 0 4px 14px ${hexA(sc, 0.04 * s)}`,
    shadowSoft: `0 1px 3px ${hexA(sc, 0.025 * s)}, 0 3px 9px ${hexA(sc, 0.025 * s)}`,
    shadowLift: `0 8px 20px ${hexA(p.primaryDeep, 0.08 * s)}`,
  };
}

// ── Lightweight stroked icon set (no emoji) ─────────────────────────
function Icon({ name, size = 22, color = 'currentColor', stroke = 2, fill = 'none', style }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill, stroke: color,
    strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round', style,
  };
  const paths = {
    home: <path d="M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5" />,
    chart: <g><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" rx="1" /><rect x="12" y="8" width="3" height="9" rx="1" /><rect x="17" y="5" width="3" height="12" rx="1" /></g>,
    buddies: <g><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.6-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.2A3 3 0 0 1 16 12M16.5 14.2c2.4.4 4 2.2 4 4.8" /></g>,
    plate: <g><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /></g>,
    user: <g><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" /></g>,
    plus: <path d="M12 5v14M5 12h14" />,
    share: <g><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="M8.3 10.7l7.4-4.3M8.3 13.3l7.4 4.3" /></g>,
    heart: <path d="M12 20s-7-4.6-7-9.6A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7-2.6c0 5-7 9.6-7 9.6z" />,
    lock: <g><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></g>,
    spark: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    chevDown: <path d="M6 9l6 6 6-6" />,
    clock: <g><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></g>,
    leaf: <path d="M4 20c0-9 7-15 16-15 0 9-7 15-16 15zM4 20c3-5 6-7 11-9" />,
    flame: <path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.6-2.4 1.4-3 .2 1 .8 1.6 1.6 1.6.4-2.4-1-4-0-6.6z" />,
    camera: <g><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="12.5" r="3.2" /></g>,
    check: <path d="M5 12.5l4.5 4.5L19 7" />,
    instagram: <g><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17.2" cy="6.8" r="0.9" fill={color} stroke="none" /></g>,
    wall: <g><rect x="4" y="5" width="16" height="14" rx="2.5" /><path d="M4 10h16M9 5v5M15 10v9" /></g>,
    bell: <path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15zM10 18.5a2 2 0 0 0 4 0" />,
    drop: <path d="M12 3c3 4 5.5 6.6 5.5 10A5.5 5.5 0 0 1 6.5 13C6.5 9.6 9 7 12 3z" />,
    star: <path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4 6.9 19.2 8 13.5 3.7 9.5l5.8-.7z" />,
    target: <g><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill={color} stroke="none" /></g>,
    arrowUp: <path d="M12 19V6M6 11l6-6 6 6" />,
    pin: <g><path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></g>,
    filter: <g><path d="M4 6h16M7 12h10M10 18h4" /></g>,
    edit: <g><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3z" /><path d="M14 7l3 3" /></g>,
    gear: <g><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" /></g>,
    upload: <g><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></g>,
    search: <g><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></g>,
    invite: <g><circle cx="9" cy="8" r="3.3" /><path d="M3.5 19c0-3 2.6-5 5.5-5 1.5 0 2.9.5 3.9 1.4" /><path d="M17 13v6M14 16h6" /></g>,
    bookmark: <path d="M6 4h12v17l-6-4-6 4V4z" />,
    bell2: <path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15zM10 18.5a2 2 0 0 0 4 0" />,
    shield: <g><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></g>,
    eyeOff: <g><path d="M4 4l16 16" /><path d="M9.5 5.3A9 9 0 0 1 12 5c5 0 9 5 9 7a12 12 0 0 1-2.3 2.9M6.2 7.5C3.9 9 2 11.5 2 12c0 1.2 4 7 10 7a9 9 0 0 0 3.3-.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></g>,
    chat: <g><path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16.5H4.5A1.5 1.5 0 0 1 3 15V7a1.5 1.5 0 0 1 1.5-1.5z" /><path d="M8 10h8M8 13h5" /></g>,
    table4: <g><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></g>,
    cardPlus: <g><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><path d="M12 13v3M10.5 14.5h3" /></g>,
  };
  return <svg {...common}>{paths[name] || null}</svg>;
}

// ── Mascot "豆芽" — a soft sprout-topped companion (food + health + AI) ──
// Subtle, premium, mood-driven. Use sparingly: hero, AI guidance, tips,
// empty states, achievements. mood: happy | hi | calm | think | cheer
function Mascot({ T, size = 72, mood = 'happy', float = false, style }) {
  const uid = React.useMemo(() => 'mc' + Math.random().toString(36).slice(2, 7), []);
  const ink = T.ink;
  const teal = T.ai || '#5DA7A0';
  const cheek = hexA(T.primary, 0.30);
  const closed = mood === 'calm';
  const cheer = mood === 'cheer';
  const look = mood === 'think' ? -2.5 : 0;   // glance up slightly
  const bodyFill = `url(#${uid})`;
  return (
    <div className={float ? 'kc-bob' : ''} style={{ width: size, height: size, flexShrink: 0, ...style }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={T.card} />
            <stop offset="1" stopColor={T.primarySoft} />
          </linearGradient>
        </defs>
        {/* soft ground shadow */}
        <ellipse cx="50" cy="90" rx="24" ry="4.5" fill={hexA(ink, 0.07)} />
        {/* sprout (teal = the AI/nature spark) */}
        <path d="M50 27 C50 19 50 15 50 12" stroke={teal} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M50 17 C45 12 39.5 12 37.5 15.5 C40 19.5 46 19.5 50 17 Z" fill={teal} />
        <circle cx="50" cy="11" r="2.2" fill={teal} />
        {/* arms */}
        {cheer ? (
          <g>
            <ellipse cx="15" cy="43" rx="6.5" ry="5" fill={bodyFill} transform="rotate(-32 15 43)" />
            <ellipse cx="85" cy="43" rx="6.5" ry="5" fill={bodyFill} transform="rotate(32 85 43)" />
          </g>
        ) : mood === 'hi' ? (
          <g>
            <ellipse cx="18" cy="62" rx="6.2" ry="5" fill={bodyFill} />
            <ellipse cx="85" cy="45" rx="6.5" ry="5" fill={bodyFill} transform="rotate(30 85 45)" />
          </g>
        ) : (
          <g>
            <ellipse cx="18" cy="61" rx="6.2" ry="5" fill={bodyFill} />
            <ellipse cx="82" cy="61" rx="6.2" ry="5" fill={bodyFill} />
          </g>
        )}
        {/* body */}
        <ellipse cx="50" cy="56" rx="34" ry="31" fill={bodyFill} stroke={hexA(T.primaryDeep, 0.13)} strokeWidth="1.3" />
        {/* belly highlight */}
        <ellipse cx="50" cy="63" rx="20" ry="14" fill={hexA('#FFFFFF', 0.34)} />
        {/* cheeks */}
        <ellipse cx="33" cy="60" rx="5.4" ry="3.5" fill={cheek} />
        <ellipse cx="67" cy="60" rx="5.4" ry="3.5" fill={cheek} />
        {/* eyes */}
        {closed ? (
          <g stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round">
            <path d="M35 53 q5 4 10 0" />
            <path d="M55 53 q5 4 10 0" />
          </g>
        ) : (
          <g fill={ink}>
            <ellipse cx={40} cy={52 + look} rx="3.4" ry="4.4" />
            <ellipse cx={60} cy={52 + look} rx="3.4" ry="4.4" />
            <circle cx="41.2" cy={50.2 + look} r="1.15" fill="#fff" />
            <circle cx="61.2" cy={50.2 + look} r="1.15" fill="#fff" />
          </g>
        )}
        {/* mouth */}
        {cheer ? (
          <path d="M43 60 q7 8 14 0 q-7 3 -14 0 Z" fill={ink} />
        ) : mood === 'think' ? (
          <circle cx="50" cy="62" r="2.4" fill="none" stroke={ink} strokeWidth="2.2" />
        ) : (
          <path d="M44 61 q6 5 12 0" stroke={ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}
        {/* sparkles (celebration / thinking spark) */}
        {(cheer || mood === 'think') && (
          <g>
            <path d="M22 30 l1.4 3.2 3.2 1.4 -3.2 1.4 -1.4 3.2 -1.4 -3.2 -3.2 -1.4 3.2 -1.4 Z" fill={teal} />
            <path d="M81 26 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 Z" fill={cheer ? T.amber : teal} />
          </g>
        )}
      </svg>
    </div>
  );
}

Object.assign(window, { PALETTES, FONTS, makeTheme, Icon, hexA, Mascot });
