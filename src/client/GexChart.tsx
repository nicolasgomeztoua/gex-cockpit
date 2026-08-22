import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createTextWatermark,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { Camera, Expand, Maximize } from "lucide-react";
import { GexProfilePrimitive, VerticalNowLinePrimitive, type BarSet } from "./chart/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { GEXBOT, LEVEL_META, type LevelKey, type TickerSettings } from "./theme";
import type { FeedSnapshot, StrikeRow } from "../shared/types";

/** value of the strike row nearest to `price` */
function gexAt(rows: StrikeRow[] | undefined, price: number, col: 1 | 2): number | null {
  if (!rows?.length) return null;
  let best: StrikeRow = rows[0];
  for (const r of rows) if (Math.abs(r[0] - price) < Math.abs(best[0] - price)) best = r;
  return best[col];
}

const fmtPrice = (v: number) =>
  Math.abs(v) >= 3000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);

/** compact GEX magnitude — raw API units (the vendor doesn't document them) */
const fmtVal = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (a >= 1_000) return (v / 1_000).toFixed(1) + "k";
  return a >= 100 ? v.toFixed(0) : v.toFixed(1);
};

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
  key: LevelKey;
  price: number;
  color: string;
  style: LineStyle;
  title: string;
}

const LEVEL_STYLE: Record<Exclude<LevelKey, "zg">, LineStyle> = {
  mlg: LineStyle.Solid,
  msg: LineStyle.Solid,
  mpv: LineStyle.Dashed,
  mnv: LineStyle.Dashed,
  mpo: LineStyle.Dotted,
  mno: LineStyle.Dotted,
};

/** All level lines except zero gamma, which is a continuous series. */
function levelLines(
  state: FeedSnapshot | undefined,
  oi: FeedSnapshot | undefined,
  s: TickerSettings,
): Level[] {
  const src: Record<Exclude<LevelKey, "zg">, number | undefined> = {
    mlg: state?.majors.posVol,
    msg: state?.majors.negVol,
    mpv: oi?.majors.posVol,
    mnv: oi?.majors.negVol,
    mpo: oi?.majors.posOI,
    mno: oi?.majors.negOI,
  };
  const out: Level[] = [];
  for (const key of Object.keys(src) as Exclude<LevelKey, "zg">[]) {
    const price = src[key];
    if (!price || !s.levels[key].line) continue;
    out.push({
      key,
      price,
      color: LEVEL_META[key].color,
      style: LEVEL_STYLE[key],
      title: s.levels[key].label ? LEVEL_META[key].name : "",
    });
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
  settings: TickerSettings;
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const zgSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const primitiveRef = useRef<GexProfilePrimitive | null>(null);
  const nowLineRef = useRef<VerticalNowLinePrimitive | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const lastTsRef = useRef<number | null>(null);
  const lastZgTsRef = useRef<number | null>(null);
  const candleRef = useRef<CandlestickData<UTCTimestamp> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // latest data for the crosshair handler (subscribed once, reads per event)
  const hoverDataRef = useRef<{
    state?: FeedSnapshot;
    oi?: FeedSnapshot;
    settings: TickerSettings;
    zgLast: number | null;
  }>({ settings, zgLast: null });
  hoverDataRef.current = {
    state,
    oi,
    settings,
    zgLast: zgSeries.length ? zgSeries[zgSeries.length - 1][1] : null,
  };
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
    createTextWatermark(chart.panes()[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [
        {
          text: "gex cockpit",
          color: "rgba(255,255,255,0.05)",
          fontSize: 40,
          fontFamily: "'SF Mono', Menlo, Consolas, monospace",
        },
      ],
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
    // crosshair: hover-gated prior dots + level tooltip (GEX magnitude at the level)
    chart.subscribeCrosshairMove(param => {
      const series = mainSeriesRef.current;
      const tip = tooltipRef.current;
      if (!param.point || !series) {
        primitiveRef.current?.setHover(null);
        if (tip) tip.style.display = "none";
        return;
      }
      const price = series.coordinateToPrice(param.point.y);
      // priors are gated on the bar itself, so the x coordinate matters too
      primitiveRef.current?.setHover(price === null ? null : { price, x: param.point.x });
      if (price === null || !tip) return;

      const d = hoverDataRef.current;
      const entries: { key: LevelKey; price: number; value: number | null }[] = [];
      const lv = d.settings.levels;
      if (d.state) {
        if (lv.mlg.line && d.state.majors.posVol)
          entries.push({ key: "mlg", price: d.state.majors.posVol, value: gexAt(d.state.strikes, d.state.majors.posVol, 1) });
        if (lv.msg.line && d.state.majors.negVol)
          entries.push({ key: "msg", price: d.state.majors.negVol, value: gexAt(d.state.strikes, d.state.majors.negVol, 1) });
      }
      if (d.oi) {
        if (lv.mpv.line && d.oi.majors.posVol)
          entries.push({ key: "mpv", price: d.oi.majors.posVol, value: gexAt(d.oi.strikes, d.oi.majors.posVol, 1) });
        if (lv.mnv.line && d.oi.majors.negVol)
          entries.push({ key: "mnv", price: d.oi.majors.negVol, value: gexAt(d.oi.strikes, d.oi.majors.negVol, 1) });
        if (lv.mpo.line && d.oi.majors.posOI)
          entries.push({ key: "mpo", price: d.oi.majors.posOI, value: gexAt(d.oi.strikes, d.oi.majors.posOI, 2) });
        if (lv.mno.line && d.oi.majors.negOI)
          entries.push({ key: "mno", price: d.oi.majors.negOI, value: gexAt(d.oi.strikes, d.oi.majors.negOI, 2) });
      }
      if (lv.zg.line && d.zgLast) entries.push({ key: "zg", price: d.zgLast, value: null });

      let best: (typeof entries)[number] | null = null;
      let bestDy = 9; // px hit zone
      for (const e of entries) {
        const py = series.priceToCoordinate(e.price);
        if (py === null) continue;
        const dy = Math.abs(py - param.point.y);
        if (dy < bestDy) {
          best = e;
          bestDy = dy;
        }
      }
      if (!best) {
        tip.style.display = "none";
        return;
      }
      const meta = LEVEL_META[best.key];
      tip.textContent = `${meta.name} ${fmtPrice(best.price)}${best.value !== null ? ` · GEX ${fmtVal(best.value)}` : ""}`;
      tip.style.borderColor = meta.color;
      tip.style.color = meta.color;
      tip.style.display = "block";
      const py = series.priceToCoordinate(best.price) ?? param.point.y;
      tip.style.left = `${Math.min(param.point.x + 14, (containerRef.current?.clientWidth ?? 600) - 230)}px`;
      tip.style.top = `${py - 26}px`;
    });
    chartRef.current = chart;
    zgSeriesRef.current = zg;
    return () => {
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      zgSeriesRef.current = null;
      primitiveRef.current = null;
      nowLineRef.current = null;
      priceLinesRef.current = new Map();
    };
  }, []);

  // main series is recreated only on chart-type change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      if (primitiveRef.current) mainSeriesRef.current.detachPrimitive(primitiveRef.current);
      if (nowLineRef.current) mainSeriesRef.current.detachPrimitive(nowLineRef.current);
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
      priceLinesRef.current = new Map();
      lastTsRef.current = null;
      candleRef.current = null;
    }
    // cyan current-price line, gexbot-style. Known limitation: on candles the
    // axis pill follows the last candle's up/down color (no independent
    // pill-color option in lightweight-charts).
    const series =
      settings.chartType === "candles"
        ? chart.addSeries(CandlestickSeries, {
            upColor: GEXBOT.state.candleUp,
            downColor: GEXBOT.state.candleDown,
            borderUpColor: GEXBOT.state.candleUp,
            borderDownColor: GEXBOT.state.candleDown,
            wickUpColor: GEXBOT.state.candleUp,
            wickDownColor: GEXBOT.state.candleDown,
            priceLineVisible: true,
            priceLineColor: GEXBOT.state.longGamma,
            priceLineStyle: LineStyle.Solid,
            priceLineWidth: 1,
          })
        : chart.addSeries(LineSeries, {
            color: GEXBOT.state.spotHistory,
            lineWidth: 2,
            priceLineVisible: true,
            priceLineColor: GEXBOT.state.longGamma,
            priceLineStyle: LineStyle.Solid,
            priceLineWidth: 1,
          });
    const primitive = new GexProfilePrimitive();
    const nowLine = new VerticalNowLinePrimitive();
    series.attachPrimitive(primitive);
    series.attachPrimitive(nowLine);
    mainSeriesRef.current = series;
    primitiveRef.current = primitive;
    nowLineRef.current = nowLine;
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
    } else {
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
    }
    nowLineRef.current?.setTime(lastTsRef.current as UTCTimestamp | null);
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

  // zero-gamma visibility / labels
  useEffect(() => {
    zgSeriesRef.current?.applyOptions({
      visible: settings.levels.zg.line,
      lastValueVisible: settings.axisLabels,
      // series title renders at the axis, not mid-line — closest available
      title: settings.levels.zg.label ? "Zero Gamma" : "",
    });
  }, [settings.levels.zg, settings.axisLabels]);

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
        existing.applyOptions({ price: d.price, axisLabelVisible: settings.axisLabels, title: d.title });
      } else {
        map.set(
          d.key,
          series.createPriceLine({
            price: d.price,
            color: d.color,
            lineWidth: 1,
            lineStyle: d.style,
            axisLabelVisible: settings.axisLabels,
            title: d.title,
          }),
        );
      }
    }
  }, [state, oi, settings.chartType, settings.levels, settings.axisLabels]);

  // profile bars + priors dots
  useEffect(() => {
    const primitive = primitiveRef.current;
    if (!primitive) return;
    const sets: BarSet[] = [];
    if (settings.stateBars && state)
      sets.push({
        rows: state.strikes.map(r => [r[0], r[1]] as [number, number]),
        pos: GEXBOT.state.longGamma,
        neg: GEXBOT.state.shortGamma,
        priors: settings.priors
          ? {
              rows: state.strikes.map(r => [r[0], r[3]] as [number, number[]]),
              colors: GEXBOT.state.priors,
            }
          : undefined,
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
    // classic priors (blue ramp) ride on the first enabled classic set —
    // the API's priors are volume-based
    if (settings.priors && oi) {
      const classicSet = sets.find(s => s.pos !== GEXBOT.state.longGamma);
      if (classicSet) {
        classicSet.priors = {
          rows: oi.strikes.map(r => [r[0], r[3]] as [number, number[]]),
          colors: GEXBOT.classic.priors,
        };
      }
    }
    if (sets.length) sets[0].topScale = true;
    primitive.setData(sets);
  }, [
    state,
    oi,
    settings.chartType,
    settings.stateBars,
    settings.volBars,
    settings.oiBars,
    settings.priors,
  ]);

  // ---- toolbar actions ----
  const fit = () => chartRef.current?.timeScale().fitContent();
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapperRef.current?.requestFullscreen();
  };
  const screenshot = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const a = document.createElement("a");
    a.href = chart.takeScreenshot().toDataURL("image/png");
    a.download = `gex-${label}-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.png`;
    a.click();
  };

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

  const toolButton =
    "pointer-events-auto flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground";

  return (
    <div ref={wrapperRef} className="relative min-h-0 flex-1 bg-background">
      <div ref={containerRef} className="absolute inset-0" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-20 rounded border bg-black/85 px-2 py-0.5 font-mono text-[11px] whitespace-nowrap backdrop-blur-sm"
        style={{ display: "none" }}
      />
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
      </div>
      <div className="pointer-events-none absolute top-2 right-14 z-10 flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 backdrop-blur-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={fit} className={toolButton}>
              <Maximize className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Fit all data</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={fullscreen} className={toolButton}>
              <Expand className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Fullscreen</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={screenshot} className={toolButton}>
              <Camera className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Save chart as PNG</TooltipContent>
        </Tooltip>
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
