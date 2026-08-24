/**
 * Canvas primitives for the gexbot-style chart. Zero React coupling — the
 * chart component feeds them data via setData()/setTime() and they redraw
 * through lightweight-charts' requestUpdate cycle.
 */
import type {
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { GEXBOT } from "../theme";

/** which profile a bar set / level line belongs to */
export type ProfileId = "state" | "gamma" | "vol" | "oi";

export interface BarSet {
  id: ProfileId;
  rows: [number, number][]; // [strike, value]
  pos: string;
  neg: string;
  /** Plot each current value as a point at its scaled x-position. */
  dotsOnly?: boolean;
  /** prior-snapshot values per strike, rendered as dots (color per prior index) */
  priors?: { rows: [number, number[]][]; colors: readonly string[] };
  /** draw the top-edge value ticks for this set (first enabled set only) */
  topScale?: boolean;
}

/** the API's five prior snapshots, oldest last — matches the prior color ramps */
export const PRIOR_LOOKBACKS = ["1m", "5m", "10m", "15m", "30m"] as const;

const fmtCompact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (a >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return a >= 100 ? v.toFixed(0) : v.toFixed(1);
};

/** per-set scale shared by draw and hit-testing: max |value| + median strike gap */
function setGeom(set: BarSet): { maxAbs: number; gap: number } | null {
  if (!set.rows.length) return null;
  const maxAbs = Math.max(...set.rows.map(r => Math.abs(r[1])));
  if (maxAbs <= 0) return null;
  const gaps: number[] = [];
  for (let g = 1; g < set.rows.length; g++) gaps.push(set.rows[g][0] - set.rows[g - 1][0]);
  gaps.sort((a, b) => a - b);
  return { maxAbs, gap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1 };
}

/** A major level, drawn through the centre of the bar it belongs to. */
export interface LevelLine {
  key: string;
  price: number;
  color: string;
  label: string | null;
  anchor: ProfileId;
}

/** anchor set index, falling back between the two classic profiles */
function anchorIndex(sets: BarSet[], anchor: ProfileId): number {
  const i = sets.findIndex(s => s.id === anchor);
  if (i >= 0) return i;
  if (anchor === "vol") return sets.findIndex(s => s.id === "oi");
  if (anchor === "oi") return sets.findIndex(s => s.id === "vol");
  return -1;
}

/** cursor-to-dot tolerance for prior-dot hit testing (px) */
const DOT_HIT = 5;

/** index of the largest |prior| in a row, first occurrence on ties (-1 if all zero) */
function maxPriorIndex(values: number[]): number {
  let best = -1;
  let bestAbs = 0;
  for (let j = 0; j < values.length; j++) {
    const a = Math.abs(values[j]);
    if (a > bestAbs) {
      bestAbs = a;
      best = j;
    }
  }
  return best;
}

/** bar length in px for a value, clamped to the profile's max width */
const barLen = (value: number, maxAbs: number, maxWidth: number) =>
  Math.min((Math.abs(value) / maxAbs) * maxWidth, maxWidth);

/**
 * GEX profile: horizontal bars anchored to the right edge at their strike
 * prices — the gexbot look. Bar sets (state γ / vol / OI) share each strike
 * slot; small values render as dots, bar height is capped so tight strike
 * grids (NDX) and wide ones (QQQ) look alike.
 */
export class GexProfilePrimitive implements ISeriesPrimitive<Time> {
  private _param: SeriesAttachedParameter<Time> | null = null;
  private _sets: BarSet[] = [];
  private _levels: LevelLine[] = [];
  private _levelKey = "";
  private _hover: { price: number; x: number } | null = null;
  private _paneW = 0; // last drawn pane width, so hit-tests match the drawn geometry
  private _view: IPrimitivePaneView;

  constructor() {
    const self = this;
    this._view = {
      zOrder: () => "normal" as const,
      renderer: (): IPrimitivePaneRenderer => ({
        draw: target => {
          const param = self._param;
          if (!param || (!self._sets.length && !self._levels.length)) return;
          const series = param.series;
          target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            self._paneW = mediaSize.width; // hit-testing runs outside draw
            const maxWidth = mediaSize.width * 0.42;
            const nSets = self._sets.length;
            // sub-bar slot per drawn set, so level lines can centre on their bar
            const slots: ({ subH: number; stackH: number } | null)[] = Array(nSets).fill(null);
            for (let i = 0; i < nSets; i++) {
              const set = self._sets[i];
              const geom = setGeom(set);
              if (!geom) continue;
              const { maxAbs, gap } = geom;
              const k0 = set.rows[Math.floor(set.rows.length / 2)][0];
              const y0 = series.priceToCoordinate(k0);
              const y1 = series.priceToCoordinate(k0 + gap);
              if (y0 === null || y1 === null) continue;
              const slotH = Math.abs(y0 - y1);
              // capped: QQQ's $1 grid must not produce chunky bars
              const subH = Math.min(6, Math.max(2, (slotH * 0.72) / nSets));
              const stackH = subH * nSets;
              slots[i] = { subH, stackH };

              ctx.globalAlpha = 0.92;
              for (const [strike, value] of set.rows) {
                if (value === 0) continue;
                const y = series.priceToCoordinate(strike);
                if (y === null || y < -slotH || y > mediaSize.height + slotH) continue;
                const w = (Math.abs(value) / maxAbs) * maxWidth;
                const yTop = y - stackH / 2 + i * subH;
                ctx.fillStyle = value >= 0 ? set.pos : set.neg;
                if (set.dotsOnly || w < 8) {
                  // small values render as dots at their bar-length position (gexbot look)
                  ctx.fillRect(mediaSize.width - w - 2, yTop + subH / 2 - 1.25, 2.5, 2.5);
                } else {
                  ctx.fillRect(mediaSize.width - w, yTop, w, Math.max(2, subH - 1));
                }
              }

              // prior-snapshot dots, only for the profile row actually under the
              // cursor (always-on was visual noise — user feedback)
              const hover = self._hover;
              if (set.priors && hover !== null) {
                const { rows, colors } = set.priors;
                const barByStrike = new Map(set.rows);
                ctx.globalAlpha = 0.9;
                for (const [strike, values] of rows) {
                  if (Math.abs(strike - hover.price) > gap * 0.55) continue;
                  // hit zone = bar ∪ dots: priors can sit past the bar's tip, and
                  // the cursor must be able to travel out to them without the dots
                  // vanishing on the way. 16px floor keeps dot-sized bars hoverable.
                  const barW = barLen(barByStrike.get(strike) ?? 0, maxAbs, maxWidth);
                  const reach = Math.max(barW, self._priorReach(values, maxAbs, maxWidth), 16);
                  if (hover.x < mediaSize.width - reach) continue;
                  const y = series.priceToCoordinate(strike);
                  if (y === null || y < -slotH || y > mediaSize.height + slotH) continue;
                  const yMid = y - stackH / 2 + i * subH + subH / 2 - 1;
                  const jMax = maxPriorIndex(values);
                  for (let j = 0; j < values.length; j++) {
                    const pv = values[j];
                    if (!pv) continue;
                    const x = mediaSize.width - barLen(pv, maxAbs, maxWidth);
                    ctx.fillStyle = colors[Math.min(j, colors.length - 1)];
                    if (j !== jMax) {
                      ctx.fillRect(x - 1, yMid, 2, 2);
                      continue;
                    }
                    // the row's largest prior: a touch bigger, with a faint ring
                    ctx.beginPath();
                    ctx.arc(x, yMid + 1, 1.75, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.55)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, yMid + 1, 2.5, 0, Math.PI * 2);
                    ctx.stroke();
                  }
                }
              }
              ctx.globalAlpha = 1;

              // top-edge value scale in gexbot orange
              if (set.topScale) {
                ctx.fillStyle = GEXBOT.classic.zeroGamma;
                ctx.font = "10px 'SF Mono', Menlo, Consolas, monospace";
                ctx.textBaseline = "top";
                for (const frac of [1, 0.5]) {
                  const v = maxAbs * frac;
                  const x = mediaSize.width - frac * maxWidth;
                  ctx.textAlign = "center";
                  ctx.fillText(fmtCompact(v), x, 4);
                }
              }
            }

            // major levels: dotted 1px hairlines through the centre of their own
            // sub-bar, so a level reads against the profile it was computed from
            if (self._levels.length) {
              ctx.globalAlpha = 0.9;
              ctx.lineWidth = 1;
              ctx.setLineDash([1.5, 3]);
              ctx.font = "10px 'SF Mono', Menlo, Consolas, monospace";
              ctx.textAlign = "right";
              ctx.textBaseline = "alphabetic";
              for (const lv of self._levels) {
                const yRaw = series.priceToCoordinate(lv.price);
                if (yRaw === null) continue;
                const i = anchorIndex(self._sets, lv.anchor);
                const slot = i >= 0 ? slots[i] : null;
                // +0.5 keeps the hairline on a pixel row instead of straddling two
                const y =
                  Math.round(slot ? yRaw - slot.stackH / 2 + i * slot.subH + slot.subH / 2 : yRaw) + 0.5;
                ctx.strokeStyle = lv.color;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(mediaSize.width, y);
                ctx.stroke();
                if (lv.label) {
                  ctx.fillStyle = lv.color;
                  ctx.fillText(lv.label, mediaSize.width - maxWidth - 8, y - 4);
                }
              }
              ctx.setLineDash([]);
              ctx.globalAlpha = 1;
            }
          });
        },
      }),
    };
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._param = param;
  }
  detached(): void {
    this._param = null;
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view];
  }
  updateAllViews(): void {}

  setData(sets: BarSet[]): void {
    this._sets = sets;
    this._param?.requestUpdate();
  }

  /** major level lines — drawn here rather than as price lines so they can sit
   * on their own bar's centre and share the profile's slot geometry */
  setLevels(levels: LevelLine[]): void {
    const key = levels.map(l => `${l.key}:${l.price}:${l.color}:${l.label ?? ""}:${l.anchor}`).join("|");
    if (key === this._levelKey) return;
    this._levelKey = key;
    this._levels = levels;
    this._param?.requestUpdate();
  }

  /** crosshair position — controls which bar's prior dots render */
  setHover(hover: { price: number; x: number } | null): void {
    const prev = this._hover;
    if (hover === null ? prev === null : prev !== null && prev.price === hover.price && prev.x === hover.x)
      return;
    this._hover = hover;
    this._param?.requestUpdate();
  }

  /**
   * How far left the widest prior dot reaches, padded by DOT_HIT so the reveal
   * zone covers the dot's whole hit radius — anywhere dotAt() reports a dot,
   * that dot is also drawn.
   */
  private _priorReach(values: number[], maxAbs: number, maxWidth: number): number {
    let reach = 0;
    for (const pv of values) {
      if (!pv) continue;
      const w = barLen(pv, maxAbs, maxWidth) + 1 + DOT_HIT;
      if (w > reach) reach = w;
    }
    return reach;
  }

  /** pane width used by draw; falls back to the chart before the first paint */
  private _width(): number {
    return this._paneW || this._param?.chart.paneSize().width || 0;
  }

  /**
   * Prior dot under the cursor, if any — closest hit across sets. Mirrors the
   * geometry in draw(), so a dot the user can see is a dot they can hover.
   */
  dotAt(price: number, x: number): { lookback: string; value: number; color: string; isMax: boolean } | null {
    const paneW = this._width();
    if (!paneW) return null;
    const maxWidth = paneW * 0.42;
    let best: { lookback: string; value: number; color: string; isMax: boolean } | null = null;
    let bestDx = DOT_HIT;
    for (const set of this._sets) {
      if (!set.priors) continue;
      const geom = setGeom(set);
      if (!geom) continue;
      const { maxAbs, gap } = geom;
      const { rows, colors } = set.priors;
      for (const [strike, values] of rows) {
        if (Math.abs(strike - price) > gap * 0.55) continue;
        const jMax = maxPriorIndex(values);
        for (let j = 0; j < values.length; j++) {
          const pv = values[j];
          if (!pv) continue;
          const dx = Math.abs(paneW - barLen(pv, maxAbs, maxWidth) - x);
          if (dx >= bestDx) continue;
          bestDx = dx;
          best = {
            lookback: PRIOR_LOOKBACKS[j] ?? `#${j + 1}`,
            value: pv,
            color: colors[Math.min(j, colors.length - 1)],
            isMax: j === jMax,
          };
        }
      }
    }
    return best;
  }
}

/** Dashed cyan vertical line at the latest tick — gexbot's "now" marker. */
export class VerticalNowLinePrimitive implements ISeriesPrimitive<Time> {
  private _param: SeriesAttachedParameter<Time> | null = null;
  private _time: UTCTimestamp | null = null;
  private _view: IPrimitivePaneView;

  constructor() {
    const self = this;
    this._view = {
      zOrder: () => "normal" as const,
      renderer: (): IPrimitivePaneRenderer => ({
        draw: target => {
          const param = self._param;
          if (!param || self._time === null) return;
          const x = param.chart.timeScale().timeToCoordinate(self._time);
          if (x === null) return; // scrolled out of view
          target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            ctx.strokeStyle = GEXBOT.state.callGex;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, mediaSize.height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          });
        },
      }),
    };
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._param = param;
  }
  detached(): void {
    this._param = null;
  }
  paneViews(): readonly IPrimitivePaneView[] {
    return [this._view];
  }
  updateAllViews(): void {}

  setTime(t: UTCTimestamp | null): void {
    this._time = t;
    this._param?.requestUpdate();
  }
}
