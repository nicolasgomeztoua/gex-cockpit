import { describe, expect, it } from "vitest";
import {
  FETCH_TIMEOUT_MS,
  MAX_RETRY_MS,
  PollRetryState,
  formatRetryDelay,
} from "./poll-retry";

describe("poll retry recovery", () => {
  it("simulates repeated timeouts, caps retries at 30 seconds, and resets on recovery", () => {
    const retry = new PollRetryState();
    const delays = Array.from({ length: 7 }, () => retry.failed(() => 1).delayMs);

    expect(FETCH_TIMEOUT_MS).toBe(1_000);
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect(retry.recovered()).toBe(7);
    expect(retry.recovered()).toBe(0);
    expect(retry.failed(() => 1)).toEqual({ failureCount: 1, delayMs: 2_000 });
  });

  it("adds bounded jitter so feeds that fail together choose different retry times", () => {
    const early = new PollRetryState().failed(() => 0).delayMs;
    const late = new PollRetryState().failed(() => 1).delayMs;

    expect(early).toBe(1_500);
    expect(late).toBe(2_000);
    expect(early).toBeLessThan(late);

    const capped = new PollRetryState();
    let maxSeen = 0;
    for (let i = 0; i < 20; i++) maxSeen = Math.max(maxSeen, capped.failed(() => 1).delayMs);
    expect(maxSeen).toBe(MAX_RETRY_MS);
    expect(formatRetryDelay(1_500)).toBe("1.5s");
    expect(formatRetryDelay(30_000)).toBe("30s");
  });
});
