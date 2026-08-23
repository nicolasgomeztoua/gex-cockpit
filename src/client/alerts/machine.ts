import type { AlertMode } from "../theme";

/**
 * The chop-proofing behind level alerts, as a pure step function.
 *
 * One machine per (chart, level). It fires at most once per approach/cross and
 * then goes quiet until BOTH the cooldown has elapsed and price has left the
 * re-arm band — otherwise price oscillating across a level would fire on every
 * tick.
 */

export interface AlertMachine {
  phase: "armed" | "cooling";
  /** epoch ms of the last fire */
  firedAt: number;
}

export interface AlertStep {
  /** current state; undefined for a level seen for the first time */
  machine: AlertMachine | undefined;
  /** spot at the previous observation and now, in displayed units */
  prevSpot: number;
  spot: number;
  /** the level's price */
  price: number;
  /** trigger distance, already resolved to points */
  dist: number;
  mode: AlertMode;
  cooldownSec: number;
  /** epoch ms */
  now: number;
}

export interface AlertOutcome {
  machine: AlertMachine;
  /** null when nothing should be delivered on this step */
  fired: "cross" | "approach" | null;
}

/**
 * The band price must leave before a fired level re-arms. Two trigger distances
 * wide, with a floor of 5bp so a tiny `dist` can't re-arm on noise alone.
 */
export const rearmBand = (spot: number, dist: number): number =>
  Math.max(2 * dist, spot * 0.0005);

export function stepAlertMachine(input: AlertStep): AlertOutcome {
  const { prevSpot, spot, price, dist, mode, cooldownSec, now } = input;
  const machine = input.machine ?? { phase: "armed" as const, firedAt: 0 };
  const away = Math.abs(spot - price);

  if (machine.phase === "cooling") {
    const rearmed = now - machine.firedAt >= cooldownSec * 1000 && away > rearmBand(spot, dist);
    return { machine: rearmed ? { ...machine, phase: "armed" } : machine, fired: null };
  }

  // a stationary spot cannot have crossed anything
  const crossed = prevSpot !== spot && (prevSpot - price) * (spot - price) <= 0;
  const approached = away <= dist;
  const fire = mode === "cross" ? crossed : mode === "approach" ? approached : crossed || approached;
  if (!fire) return { machine, fired: null };

  return { machine: { phase: "cooling", firedAt: now }, fired: crossed ? "cross" : "approach" };
}
