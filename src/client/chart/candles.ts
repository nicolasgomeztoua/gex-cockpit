import type {
  CandlestickData,
  LineData,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";

/** Polls normally land every ~10s; three missed intervals make a real gap. */
export const SPOT_INTERVAL_SEC = 10;
export const SPOT_GAP_AFTER_SEC = 30;
export const TRANSPARENT_LINE = "rgba(0,0,0,0)";

export type LinePoint = LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;
export type CandlePoint = CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>;

/** Timestamp-only points keep the time scale honest and break connected lines. */
export function whitespaceBetween(
  previousSec: number,
  nextSec: number,
  stepSec = SPOT_INTERVAL_SEC,
  gapAfterSec = SPOT_GAP_AFTER_SEC,
): WhitespaceData<UTCTimestamp>[] {
  if (nextSec - previousSec <= gapAfterSec) return [];
  const points: WhitespaceData<UTCTimestamp>[] = [];
  for (let sec = previousSec + stepSec; sec < nextSec; sec += stepSec) {
    points.push({ time: sec as UTCTimestamp });
  }
  return points;
}

export function toLineData(series: [number, number][]): LinePoint[] {
  const points: LinePoint[] = [];
  let previousSec: number | null = null;
  let previousValue: number | null = null;
  for (const [sec, value] of series) {
    if (previousSec !== null && previousValue !== null) {
      points.push(...lineGapBetween(previousSec, previousValue, sec));
    }
    points.push({ time: sec as UTCTimestamp, value });
    previousSec = sec;
    previousValue = value;
  }
  return points;
}

/**
 * LineSeries deliberately connects across WhitespaceData. A transparent-valued
 * point starts an invisible segment, while following whitespace points reserve
 * the missing wall-clock intervals on the shared time scale.
 */
export function lineGapBetween(
  previousSec: number,
  previousValue: number,
  nextSec: number,
): LinePoint[] {
  if (nextSec - previousSec <= SPOT_GAP_AFTER_SEC) return [];
  const gapStart = previousSec + SPOT_INTERVAL_SEC;
  return [
    {
      time: gapStart as UTCTimestamp,
      value: previousValue,
      color: TRANSPARENT_LINE,
    },
    ...whitespaceBetween(gapStart, nextSec, SPOT_INTERVAL_SEC, 0),
  ];
}

/**
 * Bucket a [epoch sec, spot] tape into 1-minute OHLC candles.
 *
 * Spot here is GexBot context data rather than exchange OHLC, so the candle is
 * derived: first tick in the minute opens it, last closes it, extremes give the
 * wick. Buckets are emitted in ascending time order regardless of input order.
 */
export function toCandles(series: [number, number][]): CandlePoint[] {
  const buckets = new Map<number, number[]>();
  for (const [sec, spot] of series) {
    const m = Math.floor(sec / 60) * 60;
    const b = buckets.get(m);
    if (b) b.push(spot);
    else buckets.set(m, [spot]);
  }
  const points: CandlePoint[] = [];
  let previousMinute: number | null = null;
  for (const minute of [...buckets.keys()].sort((a, b) => a - b)) {
    if (previousMinute !== null) {
      points.push(...whitespaceBetween(previousMinute, minute, 60, 60));
    }
    const values = buckets.get(minute)!;
    points.push({
      time: minute as UTCTimestamp,
      open: values[0],
      close: values[values.length - 1],
      low: Math.min(...values),
      high: Math.max(...values),
    });
    previousMinute = minute;
  }
  return points;
}
