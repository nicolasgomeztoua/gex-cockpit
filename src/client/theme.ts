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

/** Layer visibility settings, persisted in localStorage. */
export interface LayerSettings {
  chartType: "candles" | "line";
  unit: "spot" | "nq";
  stateBars: boolean; // state gamma profile (cyan/purple)
  volBars: boolean; // classic GEX by volume (light green/salmon)
  oiBars: boolean; // classic GEX by OI (dark green/dark red)
  majorLongGamma: boolean;
  majorShortGamma: boolean;
  zeroGamma: boolean;
  majorPosVol: boolean;
  majorNegVol: boolean;
  majorPosOI: boolean;
  majorNegOI: boolean;
  /** show a price-scale pill for every level line (off = pills only for spot/ZG) */
  axisLabels: boolean;
  sidebarCollapsed: boolean;
}

export const DEFAULT_SETTINGS: LayerSettings = {
  chartType: "candles",
  unit: "spot",
  stateBars: true,
  volBars: false,
  oiBars: true,
  majorLongGamma: true,
  majorShortGamma: true,
  zeroGamma: true,
  majorPosVol: true,
  majorNegVol: true,
  majorPosOI: true,
  majorNegOI: true,
  axisLabels: false,
  sidebarCollapsed: false,
};

const KEY = "gex-cockpit-settings-v2";

export function loadSettings(): LayerSettings {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof LayerSettings)[]) {
        // only accept stored values whose type matches the default's
        if (typeof parsed[k] === typeof DEFAULT_SETTINGS[k]) (out as any)[k] = parsed[k];
      }
    }
  } catch {
    /* corrupted storage — defaults win */
  }
  return out;
}

export function saveSettings(s: LayerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}
