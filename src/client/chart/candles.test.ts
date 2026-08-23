import { describe, expect, it } from "vitest";
import { toCandles } from "./candles";

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
});
