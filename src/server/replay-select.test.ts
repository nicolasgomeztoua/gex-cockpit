import { describe, expect, it } from "vitest";
import {
  availableDates,
  etDate,
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

  it("filters snapshots and ticks to the requested ET date", () => {
    const prior = sec("2024-01-04T04:59:59Z");
    const current = sec("2024-01-04T05:00:00Z");
    const events = [{ providerTs: prior, id: "prior" }, { providerTs: current, id: "current" }];
    const ticks = [{ ts: prior, id: "prior" }, { ts: current, id: "current" }];

    expect(selectSessionEvents(events, "2024-01-04").map(row => row.id)).toEqual(["current"]);
    expect(selectSessionTicks(ticks, "2024-01-04").map(row => row.id)).toEqual(["current"]);
  });

  it("lists available ET dates in sorted, deduplicated order", () => {
    expect(
      availableDates([
        { providerTs: sec("2024-01-05T17:00:00Z") },
        { providerTs: sec("2024-01-03T17:00:00Z") },
        { providerTs: sec("2024-01-05T18:00:00Z") },
      ]),
    ).toEqual(["2024-01-03", "2024-01-05"]);
  });
});
