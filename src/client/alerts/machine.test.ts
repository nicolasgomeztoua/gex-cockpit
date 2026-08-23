import { describe, expect, it } from "vitest";
import { rearmBand, stepAlertMachine, type AlertMachine } from "./machine";

const step = (
  patch: Partial<Parameters<typeof stepAlertMachine>[0]> = {},
) =>
  stepAlertMachine({
    machine: undefined,
    prevSpot: 90,
    spot: 96,
    price: 100,
    dist: 5,
    mode: "approach",
    cooldownSec: 30,
    now: 1_000,
    ...patch,
  });

describe("level alert state machine", () => {
  it("fires for approach, cross, and both modes exactly as before", () => {
    expect(step().fired).toBe("approach");
    expect(step({ prevSpot: 99, spot: 101, dist: 0.1, mode: "cross" }).fired).toBe("cross");
    expect(step({ prevSpot: 90, spot: 98, dist: 2, mode: "both" }).fired).toBe("approach");
    expect(step({ prevSpot: 90, spot: 94, mode: "approach" }).fired).toBeNull();
  });

  it("waits for both cooldown and exit from the re-arm band", () => {
    const cooling: AlertMachine = { phase: "cooling", firedAt: 1_000 };

    expect(step({ machine: cooling, spot: 120, now: 30_999 }).machine.phase).toBe("cooling");
    expect(step({ machine: cooling, spot: 108, now: 31_000 }).machine.phase).toBe("cooling");

    const rearmed = step({ machine: cooling, prevSpot: 100, spot: 111, now: 31_000 });
    expect(rearmed).toEqual({ machine: { phase: "armed", firedAt: 1_000 }, fired: null });

    expect(
      step({ machine: rearmed.machine, prevSpot: 101, spot: 99, mode: "cross", now: 31_001 }).fired,
    ).toBe("cross");
  });

  it("uses max(2 * distance, 5bp of spot) for the re-arm band", () => {
    expect(rearmBand(20_000, 2)).toBe(10);
    expect(rearmBand(20_000, 8)).toBe(16);
  });
});
