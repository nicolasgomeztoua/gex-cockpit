/**
 * Gexbot color scheme, sampled from the official settings panels
 * (see docs/gexbot-reference.md). Tweak here — nothing else hardcodes color.
 */
export const GEXBOT = {
  bg: "#000000",
  panel: "#0a0a0a",
  border: "#2a2a2a",
  text: "#ffffff",
  textDim: "#9a9a9a",
  textFaint: "#5c5c5c",
  grid: "rgba(255,255,255,0.06)",
  accentBlue: "#8ab4f8", // gexbot's active-toggle / segmented-control blue

  state: {
    longGamma: "#4de3f2", // cyan — positive/long gamma (bars + major line)
    shortGamma: "#a94de8", // purple — negative/short gamma (bars + major line)
    spotHistory: "#ffffff",
    candleUp: "#26d467",
    candleDown: "#f63538",
    // prior-snapshot dots for the state profile: dimmed cyan → purple
    priors: [
      "rgba(77,227,242,0.55)",
      "rgba(120,190,240,0.55)",
      "rgba(150,140,235,0.55)",
      "rgba(169,77,232,0.55)",
      "rgba(169,77,232,0.4)",
    ],
  },

  classic: {
    zeroGamma: "#f2a33c",
    majorPosVol: "#84d62a",
    majorNegVol: "#c0281e",
    majorPosOI: "#3e9142",
    majorNegOI: "#9e241b",
    posGexVol: "#6bd96e",
    negGexVol: "#f26d5f",
    posGexOI: "#2f7d33",
    negGexOI: "#8c1f17",
    spotHistory: "#4de3f2",
    priors: ["#a9d3ee", "#6fb4e8", "#3d8fe0", "#2563c9", "#1735a8"], // 1/5/10/15/30 min
  },
} as const;

// ---------------------------------------------------------------------------
// Level metadata: single source for sidebar rows, chart lines, and alerts.

export type LevelKey = "mlg" | "msg" | "zg" | "mpv" | "mnv" | "mpo" | "mno";

export const LEVEL_META: Record<
  LevelKey,
  { name: string; color: string; section: "state" | "classic" }
> = {
  mlg: { name: "Major Long Gamma", color: GEXBOT.state.longGamma, section: "state" },
  msg: { name: "Major Short Gamma", color: GEXBOT.state.shortGamma, section: "state" },
  zg: { name: "Zero Gamma", color: GEXBOT.classic.zeroGamma, section: "classic" },
  mpv: { name: "Major Positive Volume", color: GEXBOT.classic.majorPosVol, section: "classic" },
  mnv: { name: "Major Negative Volume", color: GEXBOT.classic.majorNegVol, section: "classic" },
  mpo: { name: "Major Positive OI", color: GEXBOT.classic.majorPosOI, section: "classic" },
  mno: { name: "Major Negative OI", color: GEXBOT.classic.majorNegOI, section: "classic" },
};

export const LEVEL_KEYS = Object.keys(LEVEL_META) as LevelKey[];

// ---------------------------------------------------------------------------
// Settings (schema v4): per-ticker layer config + global unit/alerts.
// Source of truth is the server's SQLite (see useSettings.ts); localStorage
// only mirrors it for instant boot.

export interface LevelConfig {
  /** draw the level on the chart (zg: series visibility) */
  line: boolean;
  /** text tag on the chart line */
  label: boolean;
  /** participates in level alerts */
  alert: boolean;
}

export type AlertMode = "approach" | "cross" | "both";
export type AlertSound = "off" | "ping" | "chime" | "blip";
/** once = single notification; repeat3 = TV-style ×3; untilFocus = renotify until the window is refocused */
export type AlertNotify = "once" | "repeat3" | "untilFocus";

export interface AlertSettings {
  enabled: boolean;
  mode: AlertMode;
  /** in `distanceUnit` */
  distance: number;
  distanceUnit: "points" | "percent";
  cooldownSec: number;
  sound: AlertSound;
  notify: AlertNotify;
}

export type TickerKey = "NDX" | "QQQ";

export interface TickerSettings {
  chartType: "candles" | "line";
  stateBars: boolean; // state gamma profile (cyan/purple)
  volBars: boolean; // classic GEX by volume (light green/salmon)
  oiBars: boolean; // classic GEX by OI (dark green/dark red)
  priors: boolean; // prior-snapshot dots on the profiles
  /** show a price-scale pill for every level line (off = pills only for spot/ZG) */
  axisLabels: boolean;
  levels: Record<LevelKey, LevelConfig>;
}

export interface LayerSettings {
  unit: "spot" | "nq";
  alerts: AlertSettings;
  tickers: Record<TickerKey, TickerSettings>;
}

const defaultLevel = (): LevelConfig => ({ line: true, label: false, alert: false });

const defaultTicker = (): TickerSettings => ({
  chartType: "candles",
  stateBars: true,
  volBars: false,
  oiBars: true,
  priors: true,
  axisLabels: false,
  levels: {
    mlg: defaultLevel(),
    msg: defaultLevel(),
    zg: defaultLevel(),
    mpv: defaultLevel(),
    mnv: defaultLevel(),
    mpo: defaultLevel(),
    mno: defaultLevel(),
  },
});

export const DEFAULT_SETTINGS: LayerSettings = {
  unit: "spot",
  alerts: {
    enabled: false,
    mode: "both",
    distance: 10,
    distanceUnit: "points",
    cooldownSec: 300,
    sound: "ping",
    notify: "once",
  },
  tickers: { NDX: defaultTicker(), QQQ: defaultTicker() },
};

/** Copy `src` over `dst` leaf-by-leaf, keeping only values whose type matches. */
export function deepMerge<T extends Record<string, any>>(dst: T, src: unknown): void {
  if (typeof src !== "object" || src === null) return;
  for (const k of Object.keys(dst)) {
    const d = dst[k];
    const s = (src as Record<string, unknown>)[k];
    if (typeof d === "object" && d !== null) {
      deepMerge(d, s);
    } else if (typeof s === typeof d) {
      (dst as Record<string, unknown>)[k] = s;
    }
  }
}

/** Merge an unknown payload over defaults, tolerating old/partial shapes. */
export function settingsFromUnknown(raw: unknown): LayerSettings {
  const out = structuredClone(DEFAULT_SETTINGS);
  deepMerge(out, raw);
  return out;
}

/** One-shot migration of the single-scope v3 schema into per-ticker v4. */
export function migrateV3(v3: Record<string, unknown>): LayerSettings {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (typeof v3.unit === "string") deepMerge(out, { unit: v3.unit });
  deepMerge(out.alerts, v3.alerts);
  for (const t of ["NDX", "QQQ"] as TickerKey[]) {
    deepMerge(out.tickers[t], v3); // chartType/bars/priors/axisLabels
    deepMerge(out.tickers[t].levels, v3.levels);
  }
  return out;
}
