import { useEffect, useRef } from "react";
import { LEVEL_META, type LayerSettings, type LevelKey, type TickerKey } from "../theme";
import { stepAlertMachine, type AlertMachine } from "./machine";
import { playSound } from "./sounds";
import type { FeedSnapshot } from "../../shared/types";

export interface AlertChartInput {
  /** display label ("NDX" / "QQQ") — snapshots are in displayed units */
  label: string;
  ticker: TickerKey;
  state?: FeedSnapshot;
  oi?: FeedSnapshot;
}

const REPEAT_EVERY_MS = 25_000;
const REPEAT_SAFETY_CAP = 20;

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
 * Notify modes: once, repeat3 (TV-style ×3), untilFocus (renotify every 25s
 * until the cockpit window is refocused).
 */
export function useLevelAlerts(charts: AlertChartInput[], settings: LayerSettings): void {
  const machines = useRef(new Map<string, AlertMachine>());
  const prevSpots = useRef(new Map<string, number>());
  const prevUnit = useRef(settings.unit);
  const repeatTimers = useRef(new Map<string, ReturnType<typeof setInterval>>());

  // refocusing the window acknowledges every repeating alert
  useEffect(() => {
    const clearRepeats = () => {
      for (const id of repeatTimers.current.values()) clearInterval(id);
      repeatTimers.current.clear();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") clearRepeats();
    };
    window.addEventListener("focus", clearRepeats);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", clearRepeats);
      document.removeEventListener("visibilitychange", onVisible);
      clearRepeats();
    };
  }, []);

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
    const { mode, distance, distanceUnit, cooldownSec, sound, notify } = settings.alerts;

    const deliver = (title: string, body: string, tag: string) => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body, tag, requireInteraction: notify !== "once" });
      }
      playSound(sound);
    };

    for (const chart of charts) {
      const spot = chart.state?.spot ?? chart.oi?.spot;
      if (spot === undefined) continue;
      const prevSpot = prevSpots.current.get(chart.label);
      prevSpots.current.set(chart.label, spot);
      // first observation after mount/reset: no cross reference, and firing
      // "approach" instantly on page load would be a notification storm
      if (prevSpot === undefined) continue;

      const dist = distanceUnit === "percent" ? (spot * distance) / 100 : distance;
      const levels = settings.tickers[chart.ticker].levels;

      for (const key of Object.keys(LEVEL_META) as LevelKey[]) {
        if (!levels[key].alert) continue;
        const machineKey = `${chart.label}:${key}`;
        const price = levelPrice(key, chart.state, chart.oi);
        if (price === null) {
          machines.current.delete(machineKey);
          continue;
        }

        const { machine, fired } = stepAlertMachine({
          machine: machines.current.get(machineKey),
          prevSpot,
          spot,
          price,
          dist,
          mode,
          cooldownSec,
          now,
        });
        machines.current.set(machineKey, machine);
        if (!fired) continue;

        const kind = fired;
        const meta = LEVEL_META[key];
        const verb = kind === "cross" ? "crossed" : "approaching";
        const title = `${chart.label} — ${verb} ${meta.name}`;
        const body = `${meta.name} ${fmtPrice(price)} · spot ${fmtPrice(spot)}`;
        const tag = `gex-${chart.label}-${key}`;
        window.__lastAlert = { label: chart.label, level: key, kind, price, spot, at: now };
        deliver(title, body, tag);

        // repeat delivery: TV-style ×3, or until the window is refocused
        if (notify !== "once" && !(document.visibilityState === "visible" && document.hasFocus())) {
          const existing = repeatTimers.current.get(tag);
          if (existing) clearInterval(existing);
          let count = 1;
          const id = setInterval(() => {
            count++;
            deliver(title, body, tag);
            const done =
              (notify === "repeat3" && count >= 3) ||
              count >= REPEAT_SAFETY_CAP ||
              (document.visibilityState === "visible" && document.hasFocus());
            if (done) {
              clearInterval(id);
              repeatTimers.current.delete(tag);
            }
          }, REPEAT_EVERY_MS);
          repeatTimers.current.set(tag, id);
        }
      }
    }
  });
}
