import { useEffect, useRef } from "react";
import { LEVEL_META, type LayerSettings, type LevelKey } from "../theme";
import { playSound } from "./sounds";
import type { FeedSnapshot } from "../../shared/types";

export interface AlertChartInput {
  /** display label ("NDX" / "QQQ") — snapshots are in displayed units */
  label: string;
  state?: FeedSnapshot;
  oi?: FeedSnapshot;
}

interface ArmState {
  phase: "armed" | "cooling";
  firedAt: number; // epoch ms
}

const fmtPrice = (v: number) =>
  Math.abs(v) >= 3000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);

function levelPrice(key: LevelKey, state?: FeedSnapshot, oi?: FeedSnapshot): number | null {
  switch (key) {
    case "mlg":
      return state?.majors.posVol || null;
    case "msg":
      return state?.majors.negVol || null;
    case "zg":
      return oi?.majors.zeroGamma ?? null;
    case "mpv":
      return oi?.majors.posVol || null;
    case "mnv":
      return oi?.majors.negVol || null;
    case "mpo":
      return oi?.majors.posOI || null;
    case "mno":
      return oi?.majors.negOI || null;
  }
}

declare global {
  interface Window {
    /** debug/probe hook: last alert fired */
    __lastAlert?: { label: string; level: LevelKey; kind: "approach" | "cross"; price: number; spot: number; at: number };
  }
}

/**
 * Watches displayed-unit spot vs enabled levels and fires system
 * notifications + sounds. Chop-proof: per-(chart,level) cooldown plus a
 * re-arm band (price must leave 2× the trigger distance before re-firing).
 */
export function useLevelAlerts(charts: AlertChartInput[], settings: LayerSettings): void {
  const machines = useRef(new Map<string, ArmState>());
  const prevSpots = useRef(new Map<string, number>());
  const prevUnit = useRef(settings.unit);

  useEffect(() => {
    // unit flip rescales every price — treat as a fresh session, not a cross
    if (prevUnit.current !== settings.unit) {
      prevUnit.current = settings.unit;
      prevSpots.current.clear();
      machines.current.clear();
      return;
    }
    if (!settings.alerts.enabled) return;

    const now = Date.now();
    const { mode, distance, distanceUnit, cooldownSec, sound } = settings.alerts;

    for (const chart of charts) {
      const spot = chart.state?.spot ?? chart.oi?.spot;
      if (spot === undefined) continue;
      const prevSpot = prevSpots.current.get(chart.label);
      prevSpots.current.set(chart.label, spot);
      // first observation after mount/reset: no cross reference, and firing
      // "approach" instantly on page load would be a notification storm
      if (prevSpot === undefined) continue;

      const dist = distanceUnit === "percent" ? (spot * distance) / 100 : distance;

      for (const key of Object.keys(LEVEL_META) as LevelKey[]) {
        if (!settings.levels[key].alert) continue;
        const machineKey = `${chart.label}:${key}`;
        const price = levelPrice(key, chart.state, chart.oi);
        if (price === null) {
          machines.current.delete(machineKey);
          continue;
        }

        const machine = machines.current.get(machineKey) ?? { phase: "armed" as const, firedAt: 0 };
        const away = Math.abs(spot - price);
        const rearmBand = Math.max(2 * dist, spot * 0.0005);

        if (machine.phase === "cooling") {
          if (now - machine.firedAt >= cooldownSec * 1000 && away > rearmBand) {
            machine.phase = "armed";
          }
          machines.current.set(machineKey, machine);
          continue;
        }

        const crossed = prevSpot !== spot && (prevSpot - price) * (spot - price) <= 0;
        const approached = away <= dist;
        const fire =
          mode === "cross" ? crossed : mode === "approach" ? approached : crossed || approached;
        if (!fire) continue;

        const kind = crossed ? "cross" : "approach";
        machines.current.set(machineKey, { phase: "cooling", firedAt: now });

        const meta = LEVEL_META[key];
        const verb = kind === "cross" ? "crossed" : "approaching";
        window.__lastAlert = { label: chart.label, level: key, kind, price, spot, at: now };
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`${chart.label} — ${verb} ${meta.name}`, {
            body: `${meta.name} ${fmtPrice(price)} · spot ${fmtPrice(spot)}`,
            tag: `gex-${chart.label}-${key}`,
          });
        }
        playSound(sound);
      }
    }
  });
}
