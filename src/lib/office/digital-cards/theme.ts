export const DEFAULT_CARD_THEME = {
  accent: "#34d399",
  gradientFrom: "#042f2e",
  gradientTo: "#0f172a",
} as const;

export type CardTheme = {
  accent: string;
  gradientFrom: string;
  gradientTo: string;
};

export const CARD_STYLE_PRESETS: { id: string; label: string; theme: CardTheme }[] = [
  { id: "midnight", label: "Midnight", theme: { ...DEFAULT_CARD_THEME } },
  {
    id: "frost",
    label: "Frost",
    theme: { accent: "#0f766e", gradientFrom: "#f8fafc", gradientTo: "#ccfbf1" },
  },
  {
    id: "emerald",
    label: "Emerald",
    theme: { accent: "#d1fae5", gradientFrom: "#064e3b", gradientTo: "#134e4a" },
  },
  {
    id: "ink",
    label: "Ink",
    theme: { accent: "#fbbf24", gradientFrom: "#0f172a", gradientTo: "#334155" },
  },
];

export function safeHex(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function normalizeTheme(value: unknown): CardTheme {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    accent: safeHex(String(raw.accent ?? ""), DEFAULT_CARD_THEME.accent),
    gradientFrom: safeHex(String(raw.gradientFrom ?? ""), DEFAULT_CARD_THEME.gradientFrom),
    gradientTo: safeHex(String(raw.gradientTo ?? ""), DEFAULT_CARD_THEME.gradientTo),
  };
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function cardPalette(theme: CardTheme) {
  const safe = normalizeTheme(theme);
  const dark = (luminance(safe.gradientFrom) + luminance(safe.gradientTo)) / 2 <= 0.45;
  const accentIsDark = luminance(safe.accent) <= 0.55;
  return {
    ink: dark ? "#f8fafc" : "#0f172a",
    muted: dark ? "rgba(248,250,252,0.78)" : "rgba(15,23,42,0.72)",
    panel: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.78)",
    border: dark ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.9)",
    accent: safe.accent,
    accentInk: accentIsDark ? "#f8fafc" : "#0f172a",
    gradientFrom: safe.gradientFrom,
    gradientTo: safe.gradientTo,
    gradient: `linear-gradient(165deg, ${safe.gradientFrom} 0%, ${safe.gradientTo} 62%, ${safe.accent} 130%)`,
  };
}
