import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesPrimitive,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { GEXBOT, type LayerSettings } from "./theme";
import type { FeedSnapshot } from "../shared/types";

// ---------------------------------------------------------------------------
// GEX profile primitive: horizontal bars anchored to the right edge at their
// strike prices — the gexbot look. Bar sets (state γ / vol / OI) share each
// strike slot; small values render as dots, and bar height is capped so tight
// strike grids (NDX) and wide ones (QQQ) look alike.

interface BarSet {
  rows: [number, number][]; // [strike, value]
  pos: string;
  neg: string;
}

class GexProfilePrimitive implements ISeriesPrimitive<Time> {
  private _param: SeriesAttachedParameter<Time> | null = null;
  private _sets: BarSet[] = [];
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
}

// ---------------------------------------------------------------------------

const fmtPrice = (v: number) =>
  Math.abs(v) >= 3000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);

const fmtET = (sec: number, withSeconds = false) =>
  new Date(sec * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  });

function toCandles(series: [number, number][]): CandlestickData<UTCTimestamp>[] {
  const buckets = new Map<number, number[]>();
  for (const [sec, spot] of series) {
    const m = Math.floor(sec / 60) * 60;
    const b = buckets.get(m);
    if (b) b.push(spot);
    else buckets.set(m, [spot]);
  }
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map(k => {
      const v = buckets.get(k)!;
      return {
        time: k as UTCTimestamp,
        open: v[0],
        close: v[v.length - 1],
        low: Math.min(...v),
        high: Math.max(...v),
      };
    });
}

interface Level {
  key: string;
  price: number;
  color: string;
  style: LineStyle;
}

/** All level lines except zero gamma, which is a continuous series. */
function levelLines(
  state: FeedSnapshot | undefined,
  oi: FeedSnapshot | undefined,
  s: LayerSettings,
): Level[] {
  const out: Level[] = [];
  if (state) {
    if (s.majorLongGamma && state.majors.posVol)
      out.push({ key: "mlg", price: state.majors.posVol, color: GEXBOT.state.longGamma, style: LineStyle.Solid });
    if (s.majorShortGamma && state.majors.negVol)
      out.push({ key: "msg", price: state.majors.negVol, color: GEXBOT.state.shortGamma, style: LineStyle.Solid });
  }
  if (oi) {
    if (s.majorPosVol && oi.majors.posVol)
      out.push({ key: "mpv", price: oi.majors.posVol, color: GEXBOT.classic.majorPosVol, style: LineStyle.Dashed });
    if (s.majorNegVol && oi.majors.negVol)
      out.push({ key: "mnv", price: oi.majors.negVol, color: GEXBOT.classic.majorNegVol, style: LineStyle.Dashed });
    if (s.majorPosOI && oi.majors.posOI)
      out.push({ key: "mpo", price: oi.majors.posOI, color: GEXBOT.classic.majorPosOI, style: LineStyle.Dotted });
    if (s.majorNegOI && oi.majors.negOI)
      out.push({ key: "mno", price: oi.majors.negOI, color: GEXBOT.classic.majorNegOI, style: LineStyle.Dotted });
  }
  return out;
}

interface Props {
  label: string;
  unitTag?: string;
  /** changes when the price basis of the history changes (unit toggle) — forces full reload */
  historyKey: string;
  state?: FeedSnapshot;
  oi?: FeedSnapshot;
  spotSeries: [number, number][];
  zgSeries: [number, number][];
  settings: LayerSettings;
}

export function GexChart({
  label,
  unitTag,
  historyKey,
  state,
  oi,
  spotSeries,
  zgSeries,
  settings,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const zgSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const primitiveRef = useRef<GexProfilePrimitive | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const lastTsRef = useRef<number | null>(null);
  const lastZgTsRef = useRef<number | null>(null);
  const candleRef = useRef<CandlestickData<UTCTimestamp> | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // chart + zero-gamma series live for the component's lifetime
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: GEXBOT.bg },
        textColor: GEXBOT.textDim,
        fontFamily: "'SF Mono', Menlo, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: GEXBOT.grid },
        horzLines: { color: GEXBOT.grid },
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.25)", labelBackgroundColor: "#2a2a2a" },
        horzLine: { color: "rgba(255,255,255,0.25)", labelBackgroundColor: "#2a2a2a" },
      },
      rightPriceScale: { borderColor: GEXBOT.border },
      timeScale: {
        borderColor: GEXBOT.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        tickMarkFormatter: (time: number) => fmtET(time),
      },
      localization: {
        timeFormatter: (time: number) => `${fmtET(time, true)} ET`,
        priceFormatter: fmtPrice,
      },
    });
    // zero gamma is a session-long line, like price — excluded from autoscale
    const zg = chart.addSeries(LineSeries, {
      color: GEXBOT.classic.zeroGamma,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => null,
    });
    chartRef.current = chart;
    zgSeriesRef.current = zg;
    return () => {
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      zgSeriesRef.current = null;
      primitiveRef.current = null;
      priceLinesRef.current = new Map();
    };
  }, []);

  // main series is recreated only on chart-type change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      if (primitiveRef.current) mainSeriesRef.current.detachPrimitive(primitiveRef.current);
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
      priceLinesRef.current = new Map();
      lastTsRef.current = null;
      candleRef.current = null;
    }
    const series =
      settings.chartType === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: GEXBOT.state.candleUp,
            downColor: GEXBOT.state.candleDown,
            borderUpColor: GEXBOT.state.candleUp,
            borderDownColor: GEXBOT.state.candleDown,
            wickUpColor: GEXBOT.state.candleUp,
            wickDownColor: GEXBOT.state.candleDown,
            priceLineColor: GEXBOT.textDim,
          })
        : chart.addSeries(LineSeries, {
            color: GEXBOT.state.spotHistory,
            lineWidth: 2,
            priceLineColor: GEXBOT.textDim,
          });
    const primitive = new GexProfilePrimitive();
    series.attachPrimitive(primitive);
    mainSeriesRef.current = series;
    primitiveRef.current = primitive;
  }, [settings.chartType]);

  // spot data: full load when the basis changes, incremental update() otherwise
  useEffect(() => {
    lastTsRef.current = null; // historyKey change → force full reload below
    candleRef.current = null;
  }, [historyKey]);

  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series || !spotSeries.length) return;
    const lastTs = lastTsRef.current;
    const isCandles = settings.chartType === "candles";
    if (lastTs === null) {
      if (isCandles) {
        const candles = toCandles(spotSeries);
        (series as ISeriesApi<"Candlestick">).setData(candles);
        candleRef.current = candles[candles.length - 1] ?? null;
      } else {
        (series as ISeriesApi<"Line">).setData(
          spotSeries.map(([sec, v]) => ({ time: sec as UTCTimestamp, value: v })),
        );
      }
      lastTsRef.current = spotSeries[spotSeries.length - 1][0];
      return;
    }
    for (const [sec, v] of spotSeries) {
      if (sec <= lastTs) continue;
      if (isCandles) {
        const bucket = (Math.floor(sec / 60) * 60) as UTCTimestamp;
        const cur = candleRef.current;
        if (cur && cur.time === bucket) {
          candleRef.current = {
            ...cur,
            close: v,
            high: Math.max(cur.high, v),
            low: Math.min(cur.low, v),
          };
        } else {
          candleRef.current = { time: bucket, open: v, close: v, high: v, low: v };
        }
        (series as ISeriesApi<"Candlestick">).update(candleRef.current);
      } else {
        (series as ISeriesApi<"Line">).update({ time: sec as UTCTimestamp, value: v });
      }
      lastTsRef.current = sec;
    }
  }, [spotSeries, settings.chartType, historyKey]);

  // zero-gamma line data (same incremental pattern)
  useEffect(() => {
    lastZgTsRef.current = null;
  }, [historyKey]);

  useEffect(() => {
    const series = zgSeriesRef.current;
    if (!series) return;
    const lastTs = lastZgTsRef.current;
    if (lastTs === null) {
      series.setData(zgSeries.map(([sec, v]) => ({ time: sec as UTCTimestamp, value: v })));
    } else {
      for (const [sec, v] of zgSeries) {
        if (sec <= lastTs) continue;
        series.update({ time: sec as UTCTimestamp, value: v });
      }
    }
    lastZgTsRef.current = zgSeries.length ? zgSeries[zgSeries.length - 1][0] : null;
  }, [zgSeries, historyKey]);

  // zero-gamma visibility / axis label
  useEffect(() => {
    zgSeriesRef.current?.applyOptions({
      visible: settings.zeroGamma,
      lastValueVisible: settings.axisLabels,
    });
  }, [settings.zeroGamma, settings.axisLabels]);

  // level lines: diffed by key, so toggling one never rebuilds the rest
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;
    const desired = levelLines(state, oi, settings);
    const map = priceLinesRef.current;
    for (const [key, pl] of [...map]) {
      if (!desired.some(d => d.key === key)) {
        series.removePriceLine(pl);
        map.delete(key);
      }
    }
    for (const d of desired) {
      const existing = map.get(d.key);
      if (existing) {
        existing.applyOptions({ price: d.price, axisLabelVisible: settings.axisLabels });
      } else {
        map.set(
          d.key,
          series.createPriceLine({
            price: d.price,
            color: d.color,
            lineWidth: 1,
            lineStyle: d.style,
            axisLabelVisible: settings.axisLabels,
            title: "",
          }),
        );
      }
    }
  }, [
    state,
    oi,
    settings.chartType, // series recreated → lines must be recreated on it
    settings.majorLongGamma,
    settings.majorShortGamma,
    settings.majorPosVol,
    settings.majorNegVol,
    settings.majorPosOI,
    settings.majorNegOI,
    settings.axisLabels,
  ]);

  // profile bars
  useEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;
    const sets: BarSet[] = [];
    if (settings.stateBars && state)
      sets.push({
        rows: state.strikes.map(r => [r[0], r[1]] as [number, number]),
        pos: GEXBOT.state.longGamma,
        neg: GEXBOT.state.shortGamma,
      });
    if (settings.volBars && oi)
      sets.push({
        rows: oi.strikes.map(r => [r[0], r[1]] as [number, number]),
        pos: GEXBOT.classic.posGexVol,
        neg: GEXBOT.classic.negGexVol,
      });
    if (settings.oiBars && oi)
      sets.push({
        rows: oi.strikes.map(r => [r[0], r[2]] as [number, number]),
        pos: GEXBOT.classic.posGexOI,
        neg: GEXBOT.classic.negGexOI,
      });
    primitive.setData(sets);
  }, [state, oi, settings.chartType, settings.stateBars, settings.volBars, settings.oiBars]);

  // ---- legend/status ----
  const latest = [state, oi].filter(Boolean).sort((a, b) => b!.providerTs - a!.providerTs)[0];
  const hasError = state?.status === "error" || oi?.status === "error";
  const ageSec = latest ? Math.max(0, Date.now() / 1000 - latest.providerTs) : Infinity;
  const dotColor = hasError
    ? GEXBOT.state.candleDown
    : ageSec < 150
      ? GEXBOT.state.candleUp
      : ageSec < 1800
        ? GEXBOT.classic.zeroGamma
        : GEXBOT.textFaint;
  const status = !latest
    ? "waiting"
    : hasError
      ? "error — last good shown"
      : ageSec < 150
        ? "live"
        : ageSec < 1800
          ? `${Math.round(ageSec / 60)}m old`
          : `as of ${fmtET(latest.providerTs, true)} ET`;

  const spot = latest?.spot;
  const open = spotSeries.length ? spotSeries[0][1] : undefined;
  const delta = spot !== undefined && open ? spot - open : undefined;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-2.5 font-mono text-[11px]"
        style={{ color: GEXBOT.textDim }}
      >
        <span className="rounded bg-black/70 px-2 py-0.5 backdrop-blur-sm">
          <span className="text-[13px] font-bold" style={{ color: GEXBOT.text }}>
            {label}
          </span>
          {unitTag && (
            <span className="ml-1.5 text-[9px] uppercase" style={{ color: GEXBOT.classic.zeroGamma }}>
              {unitTag}
            </span>
          )}
          {spot !== undefined && (
            <span className="ml-2 tabular-nums" style={{ color: GEXBOT.text }}>
              {fmtPrice(spot)}
            </span>
          )}
          {delta !== undefined && (
            <span
              className="ml-1.5 tabular-nums"
              style={{ color: delta >= 0 ? GEXBOT.state.candleUp : GEXBOT.state.candleDown }}
            >
              {delta >= 0 ? "+" : "−"}
              {fmtPrice(Math.abs(delta))}
            </span>
          )}
          <span className="ml-2 inline-flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full" style={{ background: dotColor }} />
            {status}
          </span>
        </span>
        <button
          onClick={() => chartRef.current?.timeScale().fitContent()}
          className="pointer-events-auto cursor-pointer rounded bg-black/70 px-2 py-0.5 backdrop-blur-sm hover:text-white"
        >
          fit
        </button>
      </div>
      {!state && !oi && (
        <div
          className="absolute inset-0 flex items-center justify-center font-mono text-xs"
          style={{ color: GEXBOT.textFaint }}
        >
          waiting for first {label} snapshot…
        </div>
      )}
    </div>
  );
}
