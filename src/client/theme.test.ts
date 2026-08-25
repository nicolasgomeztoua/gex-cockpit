import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./theme";

describe("default State profile semantics", () => {
  it("shows Options Profile Gamma majors and keeps State GEX Profile optional", () => {
    for (const ticker of ["NDX", "QQQ"] as const) {
      const settings = DEFAULT_SETTINGS.tickers[ticker];
      expect(settings.gammaBars).toBe(true);
      expect(settings.stateBars).toBe(false);
      expect(settings.levels.mlg.line).toBe(true);
      expect(settings.levels.msg.line).toBe(true);
      expect(settings.levels.mcg.line).toBe(false);
      expect(settings.levels.mpg.line).toBe(false);
    }
  });
});
