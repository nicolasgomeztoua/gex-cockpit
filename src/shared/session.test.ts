import { describe, expect, it } from "vitest";
import { appendLiveSessionPoint, etDayStartEpoch, isInRthSession, rthSessionBounds } from "./session";

const sec = (iso: string) => Date.parse(iso) / 1_000;

describe("live chart session rollover", () => {
  it("finds ET midnight on both standard- and daylight-time dates", () => {
    expect(etDayStartEpoch(sec("2024-01-04T16:00:00Z"))).toBe(sec("2024-01-04T05:00:00Z"));
    expect(etDayStartEpoch(sec("2024-07-04T16:00:00Z"))).toBe(sec("2024-07-04T04:00:00Z"));
  });

  it("recognizes only weekday points inside the inclusive New York RTH window", () => {
    expect(rthSessionBounds("2024-01-04")).toEqual({
      startTs: sec("2024-01-04T14:30:00Z"),
      endTs: sec("2024-01-04T21:00:00Z"),
    });
    expect(isInRthSession(sec("2024-01-04T14:29:59Z"))).toBe(false);
    expect(isInRthSession(sec("2024-01-04T14:30:00Z"))).toBe(true);
    expect(isInRthSession(sec("2024-01-04T21:00:00Z"))).toBe(true);
    expect(isInRthSession(sec("2024-01-04T21:00:01Z"))).toBe(false);
    expect(isInRthSession(sec("2024-01-06T15:00:00Z"))).toBe(false);
  });

  it("keeps the prior session when a new ET day updates before 09:30", () => {
    const prior: [number, number][] = [[sec("2024-01-03T21:00:00Z"), 100]];
    expect(appendLiveSessionPoint(prior, [sec("2024-01-04T14:29:00Z"), 101])).toBe(prior);
  });

  it("replaces the prior session at the first point at or after 09:30", () => {
    const prior: [number, number][] = [[sec("2024-01-03T21:00:00Z"), 100]];
    const current: [number, number] = [sec("2024-01-04T14:30:00Z"), 101];
    expect(appendLiveSessionPoint(prior, current)).toEqual([current]);
  });

  it("appends ascending points within one RTH session and ignores duplicates", () => {
    const first: [number, number] = [sec("2024-01-04T15:00:00Z"), 100];
    const second: [number, number] = [sec("2024-01-04T15:01:00Z"), 101];
    const series = [first];
    expect(appendLiveSessionPoint(series, second)).toEqual([first, second]);
    expect(appendLiveSessionPoint(series, first)).toBe(series);
  });

  it("ignores after-hours points instead of extending the RTH chart", () => {
    const close: [number, number] = [sec("2024-01-04T21:00:00Z"), 100];
    const series = [close];
    expect(appendLiveSessionPoint(series, [sec("2024-01-04T21:00:01Z"), 101])).toBe(series);
  });
});
