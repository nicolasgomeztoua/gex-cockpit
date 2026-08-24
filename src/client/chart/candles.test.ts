import { describe, expect, it } from "vitest";
import {
  toCandles,
  toLineData,
  TRANSPARENT_LINE,
  whitespaceBetween,
} from "./candles";

describe("toCandles", () => {
  it("buckets ticks into one-minute OHLC candles and sorts the buckets", () => {
    expect(
      toCandles([
        [125, 102],
        [61, 100],
        [119, 97],
        [62, 103],
        [180, 110],
      ]),
    ).toEqual([
      { time: 60, open: 100, close: 103, low: 97, high: 103 },
      { time: 120, open: 102, close: 102, low: 102, high: 102 },
      { time: 180, open: 110, close: 110, low: 110, high: 110 },
    ]);
  });

  it("returns no candles for an empty tape", () => {
    expect(toCandles([])).toEqual([]);
  });

  it("inserts missing candle minutes instead of bridging a disconnect", () => {
    expect(toCandles([[61, 100], [245, 110]])).toEqual([
      { time: 60, open: 100, close: 100, low: 100, high: 100 },
      { time: 120 },
      { time: 180 },
      { time: 240, open: 110, close: 110, low: 110, high: 110 },
    ]);
  });
});

describe("spot line gaps", () => {
  it("keeps normal polling jitter connected", () => {
    expect(whitespaceBetween(100, 129)).toEqual([]);
    expect(toLineData([[100, 10], [129, 11]])).toEqual([
      { time: 100, value: 10 },
      { time: 129, value: 11 },
    ]);
  });

  it("uses timestamp-only points to preserve a disconnect's duration", () => {
    expect(toLineData([[100, 10], [145, 11]])).toEqual([
      { time: 100, value: 10 },
      { time: 110, value: 10, color: TRANSPARENT_LINE },
      { time: 120 },
      { time: 130 },
      { time: 140 },
      { time: 145, value: 11 },
    ]);
  });
});
