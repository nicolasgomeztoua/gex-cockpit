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

export interface BarSet {
  rows: [number, number][]; // [strike, value]
  pos: string;
  neg: string;
  /** prior-snapshot values per strike, rendered as dots (color per prior index) */
  priors?: { rows: [number, number[]][]; colors: readonly string[] };
  /** draw the top-edge value ticks for this set (first enabled set only) */
  topScale?: boolean;
}

const fmtCompact = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (a >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return a >= 100 ? v.toFixed(0) : v.toFixed(1);
};

/**
 * GEX profile: horizontal bars anchored to the right edge at their strike
 * prices — the gexbot look. Bar sets (state γ / vol / OI) share each strike
 * slot; small values render as dots, bar height is capped so tight strike
 * grids (NDX) and wide ones (QQQ) look alike.
 */
export class GexProfilePrimitive implements ISeriesPrimitive<Time> {
  private _param: SeriesAttachedParameter<Time> | null = null;
  private _sets: BarSet[] = [];
  private _hover: { price: number; x: number } | null = null;
  private _view: IPrimitivePaneView;

  constructor() {
    const self = this;
    this._view = {
      zOrder: () => "normal" as const,
      renderer: (): IPrimitivePaneRenderer => ({
        draw: target => {
          const param = self._param;
          if (!param || !self._sets.length) return;
          const series = param.series;
          target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
            const maxWidth = mediaSize.width * 0.42;
            const nSets = self._sets.length;
            for (let i = 0; i < nSets; i++) {
              const set = self._sets[i];
              if (!set.rows.length) continue;
              const maxAbs = Math.max(...set.rows.map(r => Math.abs(r[1])));
              if (maxAbs <= 0) continue;
              const gaps: number[] = [];
              for (let g = 1; g < set.rows.length; g++)
                gaps.push(set.rows[g][0] - set.rows[g - 1][0]);
              gaps.sort((a, b) => a - b);
              const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1;
              const k0 = set.rows[Math.floor(set.rows.length / 2)][0];
              const y0 = series.priceToCoordinate(k0);
              const y1 = series.priceToCoordinate(k0 + gap);
              if (y0 === null || y1 === null) continue;
              const slotH = Math.abs(y0 - y1);
              // capped: QQQ's $1 grid must not produce chunky bars
              const subH = Math.min(6, Math.max(2, (slotH * 0.72) / nSets));
              const stackH = subH * nSets;

              ctx.globalAlpha = 0.92;
              for (const [strike, value] of set.rows) {
                if (value === 0) continue;
                const y = series.priceToCoordinate(strike);
                if (y === null || y < -slotH || y > mediaSize.height + slotH) continue;
                const w = (Math.abs(value) / maxAbs) * maxWidth;
                const yTop = y - stackH / 2 + i * subH;
                ctx.fillStyle = value >= 0 ? set.pos : set.neg;
                if (w < 8) {
                  // small values render as dots at their bar-length position (gexbot look)
                  ctx.fillRect(mediaSize.width - w - 2, yTop + subH / 2 - 1.25, 2.5, 2.5);
                } else {
                  ctx.fillRect(mediaSize.width - w, yTop, w, Math.max(2, subH - 1));
                }
              }

              // prior-snapshot dots, only for the bar actually under the cursor
              // (always-on was visual noise — user feedback). The cursor must be
              // inside the bar's horizontal extent too, not just anywhere on its row.
              const hover = self._hover;
              if (set.priors && hover !== null) {
                const { rows, colors } = set.priors;
                const barByStrike = new Map(set.rows);
                ctx.globalAlpha = 0.9;
                for (const [strike, values] of rows) {
                  if (Math.abs(strike - hover.price) > gap * 0.55) continue;
                  // 16px floor keeps dot-sized bars hoverable
                  const barW = (Math.abs(barByStrike.get(strike) ?? 0) / maxAbs) * maxWidth;
                  if (hover.x < mediaSize.width - Math.max(barW, 16)) continue;
                  const y = series.priceToCoordinate(strike);
                  if (y === null || y < -slotH || y > mediaSize.height + slotH) continue;
                  const yMid = y - stackH / 2 + i * subH + subH / 2 - 1;
                  for (let j = 0; j < values.length; j++) {
                    const pv = values[j];
                    if (!pv) continue;
                    const w = Math.min((Math.abs(pv) / maxAbs) * maxWidth, maxWidth);
                    ctx.fillStyle = colors[Math.min(j, colors.length - 1)];
                    ctx.fillRect(mediaSize.width - w - 1, yMid, 2, 2);
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

  /** crosshair position — controls which bar's prior dots render */
  setHover(hover: { price: number; x: number } | null): void {
    const prev = this._hover;
    if (hover === null ? prev === null : prev !== null && prev.price === hover.price && prev.x === hover.x)
      return;
    this._hover = hover;
    this._param?.requestUpdate();
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
            ctx.strokeStyle = GEXBOT.state.longGamma;
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
