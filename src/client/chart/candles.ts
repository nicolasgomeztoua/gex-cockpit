import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

/**
 * Bucket a [epoch sec, spot] tape into 1-minute OHLC candles.
 *
 * Spot here is GexBot context data rather than exchange OHLC, so the candle is
 * derived: first tick in the minute opens it, last closes it, extremes give the
 * wick. Buckets are emitted in ascending time order regardless of input order.
 */
export function toCandles(series: [number, number][]): CandlestickData<UTCTimestamp>[] {
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
