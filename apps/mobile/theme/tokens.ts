// Bright White / Warm Minimal ("snow") design tokens.
// Default and source-of-truth visual direction for the haocu mobile app.

export const snowPalette = {
  bg: "#FEFEFD",
  bg2: "#FAF7F3",
  card: "#FFFFFF",
  primary: "#E0806E",
  primaryDeep: "#CC6552",
  primarySoft: "#FBEAE3",
  accent: "#D08C84",
  ai: "#6E8CA9",
  aiSoft: "#EAEFF6",
  green: "#8AAE97",
  amber: "#D5A267",
  ink: "#2C2722",
  sub: "#756A60",
  faint: "#AEA498",
  line: "#E8E4E0",
  track: "#EFEBE7",
  blush: "#F0E9EA",
  heroFrom: "#FFFFFF",
  heroTo: "#FBEFEA",
  solid: "#2C2722",
  solidText: "#FFFFFF"
} as const;

export type SnowColors = typeof snowPalette;

export function hexA(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const radius = {
  base: 22,
  sm: 14,
  lg: 30,
  pill: 999
} as const;

// Default text font is Noto Sans TC; numerals (kcal / scores / %) use Space Grotesk.
export const fonts = {
  body: "NotoSansTC_400Regular",
  medium: "NotoSansTC_500Medium",
  bold: "NotoSansTC_700Bold",
  black: "NotoSansTC_900Black",
  numeral: "SpaceGrotesk_700Bold",
  numeralMedium: "SpaceGrotesk_500Medium"
} as const;

// Shadows are intentionally soft & minimal (shadowScale ~0.5 in the handoff).
export const shadows = {
  soft: {
    shadowColor: snowPalette.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2
  },
  card: {
    shadowColor: snowPalette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3
  },
  lift: {
    shadowColor: snowPalette.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 6
  }
} as const;

export const theme = {
  colors: snowPalette,
  radius,
  fonts,
  shadows,
  hexA
} as const;
