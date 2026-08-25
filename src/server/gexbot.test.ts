import { describe, expect, it } from "vitest";
import { parseGammaFeed } from "./gexbot";

describe("GexBot Convexity rows", () => {
  it("preserves separate call/put IVOL and the specified gamma value", () => {
    const snapshot = parseGammaFeed("QQQ", {
      timestamp: 123,
      ticker: "QQQ",
      spot: 709.25,
      min_dte: 0,
      major_positive: 707,
      major_negative: 709,
      major_long_gamma: 707,
      major_short_gamma: 709,
      mini_contracts: [[709, 0.177, 0.171, -440.93, [-420, -400]]],
    });

    expect(snapshot.strikes).toEqual([
      [709, 0.177, 0.171, [-420, -400], -440.93],
    ]);
  });
});
