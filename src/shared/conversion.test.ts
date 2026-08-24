import { describe, expect, it } from "vitest";
import { convertPrice, convertSnapshot } from "./conversion";
import type { FeedSnapshot, FuturesConversion } from "./types";

const conversion: FuturesConversion = {
  ticker: "QQQ",
  future: "NQ",
  futureContract: "NQU6",
  multiplier: 39.2764631851,
  additive: 1374.7358030428,
  fetchedAt: 0,
};

const snapshot: FeedSnapshot = {
  feed: "QQQ:state",
  ticker: "QQQ",
  kind: "state",
  aggregation: "zero",
  providerTs: 1,
  fetchedAt: 2,
  spot: 705.34,
  majors: { posVol: 706, negVol: 710, posOI: 0, negOI: 0, zeroGamma: null },
  netGexVol: 123,
  netGexOI: 0,
  minDte: 0,
  strikes: [[710, -25, 0, [10, 20]]],
  status: "live",
};

describe("official futures conversion", () => {
  it("applies both the multiplier and additive offset", () => {
    expect(convertPrice(705.34, conversion)).toBeCloseTo(29077.996346, 6);
    expect(convertPrice(710, conversion)).toBeCloseTo(29261.024664, 6);
  });

  it("converts prices without changing GEX magnitudes or not-applicable zeroes", () => {
    const result = convertSnapshot(snapshot, conversion);
    expect(result.spot).toBeCloseTo(29077.996346, 6);
    expect(result.majors.negVol).toBeCloseTo(29261.024664, 6);
    expect(result.majors.posOI).toBe(0);
    expect(result.strikes[0]).toEqual([
      expect.closeTo(29261.024664, 6),
      -25,
      0,
      [10, 20],
    ]);
    expect(result.netGexVol).toBe(123);
  });
});
