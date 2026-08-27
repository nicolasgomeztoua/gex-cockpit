import { describe, expect, it } from "vitest";
import {
  availableDates,
  etDate,
  isAtOrAfterMarketOpen,
  rthSessionBounds,
  selectLiveSessionDate,
  selectSessionEvents,
  selectSessionTicks,
} from "./replay-select";

const sec = (iso: string) => Date.parse(iso) / 1_000;

describe("replay ET session selection", () => {
  it("assigns UTC instants to the correct Eastern date across midnight and DST", () => {
    expect(etDate(sec("2024-01-04T04:59:59Z"))).toBe("2024-01-03");
    expect(etDate(sec("2024-01-04T05:00:00Z"))).toBe("2024-01-04");
    expect(etDate(sec("2024-07-04T03:59:59Z"))).toBe("2024-07-03");
    expect(etDate(sec("2024-07-04T04:00:00Z"))).toBe("2024-07-04");
  });

  it("builds DST-correct 09:30–16:00 ET boundaries", () => {
    expect(rthSessionBounds("2024-01-04")).toEqual({
      startTs: sec("2024-01-04T14:30:00Z"),
      endTs: sec("2024-01-04T21:00:00Z"),
    });
    expect(rthSessionBounds("2024-07-03")).toEqual({
      startTs: sec("2024-07-03T13:30:00Z"),
      endTs: sec("2024-07-03T20:00:00Z"),
    });
  });

  it("filters snapshots and ticks to the requested New York RTH window", () => {
    const rows = [
      { time: sec("2024-01-04T14:29:59Z"), id: "premarket" },
      { time: sec("2024-01-04T14:30:00Z"), id: "open" },
      { time: sec("2024-01-04T21:00:00Z"), id: "close" },
      { time: sec("2024-01-04T21:00:01Z"), id: "after-hours" },
    ];
    const events = rows.map(row => ({ providerTs: row.time, id: row.id }));
    const ticks = rows.map(row => ({ ts: row.time, id: row.id }));

    expect(selectSessionEvents(events, "2024-01-04").map(row => row.id)).toEqual(["open", "close"]);
    expect(selectSessionTicks(ticks, "2024-01-04").map(row => row.id)).toEqual(["open", "close"]);
  });

  it("lists partial RTH sessions but ignores calendar dates with only non-RTH data", () => {
    expect(
      availableDates([
        { providerTs: sec("2024-01-05T14:30:00Z") },
        { providerTs: sec("2024-01-03T15:00:00Z") },
        { providerTs: sec("2024-01-05T14:29:59Z") },
        { providerTs: sec("2024-01-06T15:00:00Z") },
      ]),
    ).toEqual(["2024-01-03", "2024-01-05"]);
  });

  it("uses the prior session before the ET open and today after it opens", () => {
    const dates = ["2024-01-03", "2024-01-04"];
    const beforeOpen = sec("2024-01-04T14:29:59Z");
    const atOpen = sec("2024-01-04T14:30:00Z");

    expect(isAtOrAfterMarketOpen(beforeOpen)).toBe(false);
    expect(isAtOrAfterMarketOpen(atOpen)).toBe(true);
    expect(selectLiveSessionDate(dates, beforeOpen)).toBe("2024-01-03");
    expect(selectLiveSessionDate(dates, atOpen)).toBe("2024-01-04");
  });

  it("falls back to the latest recorded session when today has no data", () => {
    expect(
      selectLiveSessionDate(
        ["2024-01-03", "2024-01-05"],
        sec("2024-01-08T16:00:00Z"),
      ),
    ).toBe("2024-01-05");
  });
});
