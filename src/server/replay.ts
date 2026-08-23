import { storedSnapshots, storedSpotTicks, type StoredSnapshot } from "./db";
import { publishSnapshot, replaceSnapshots, snapshots } from "./poller";
import type { InitPayload, ReplayStatus, Ticker } from "../shared/types";

const SPEEDS = [1, 2, 5, 10, 30] as const;
type ReplaySpeed = (typeof SPEEDS)[number];
type ReplayEvent =
  | { event: "replay-reset"; data: InitPayload }
  | { event: "replay-status"; data: ReplayStatus };
type ReplayListener = (event: ReplayEvent) => void;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const emptyHistories = (): Record<Ticker, [number, number][]> => ({
  NDX: [],
  QQQ: [],
  NQ_NDX: [],
});

function etDate(epochSec: number): string {
  const parts = dateFormatter.formatToParts(new Date(epochSec * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

let date = "";
let events: StoredSnapshot[] = [];
let ticks: { ticker: Ticker; ts: number; spot: number }[] = [];
let clock = 0;
let cursor = 0;
let playing = true;
let speed: ReplaySpeed = 1;
let lastRealMs = 0;
let lastClockStatusMs = 0;
let prepared = false;
let started = false;
const listeners = new Set<ReplayListener>();

export function prepareReplay(requestedDate: string): void {
  const allEvents = storedSnapshots();
  const availableDates = [...new Set(allEvents.map(row => etDate(row.providerTs)))].sort();
  events = allEvents.filter(row => etDate(row.providerTs) === requestedDate);
  if (!events.length) {
    const available = availableDates.length ? availableDates.join(", ") : "none";
    throw new Error(`no snapshots for ${requestedDate}; available dates: ${available}`);
  }

  date = requestedDate;
  ticks = storedSpotTicks().filter(row => etDate(row.ts) === requestedDate);
  clock = events[0].providerTs;
  cursor = firstEventAfter(clock);
  playing = true;
  speed = 1;
  prepared = true;
  replaceSnapshots(latestFeedsAt(clock));
}

export function startReplay(): void {
  if (!prepared) throw new Error("replay was not prepared before start");
  if (started) return;
  started = true;
  lastRealMs = Date.now();
  lastClockStatusMs = lastRealMs;
  setInterval(tick, 250);
}

export function subscribeReplay(fn: ReplayListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replayStatus(): ReplayStatus | null {
  if (!prepared) return null;
  return {
    date,
    playing,
    speed,
    clock: Math.floor(clock),
    startTs: events[0].providerTs,
    endTs: events[events.length - 1].providerTs,
  };
}

export function replayInitPayload(): InitPayload {
  const status = replayStatus();
  const through = status?.clock ?? 0;
  const spotHistory = emptyHistories();
  const zgHistory = emptyHistories();

  for (const row of ticks) {
    if (row.ts > through) break;
    spotHistory[row.ticker].push([row.ts, row.spot]);
  }
  for (const row of events) {
    if (row.providerTs > through) break;
    const snap = row.snapshot;
    if (snap.kind === "oi" && snap.majors.zeroGamma !== null) {
      zgHistory[snap.ticker].push([row.providerTs, snap.majors.zeroGamma]);
    }
  }

  return { feeds: snapshots(), spotHistory, zgHistory, mock: false, replay: status };
}

export function controlReplay(action: string, value?: number): ReplayStatus {
  if (!prepared) throw new Error("replay mode is not active");
  if (action === "play") {
    playing = true;
    lastRealMs = Date.now();
    emitStatus();
  } else if (action === "pause") {
    playing = false;
    emitStatus();
  } else if (action === "speed") {
    if (!SPEEDS.includes(value as ReplaySpeed)) throw new Error("speed must be one of 1, 2, 5, 10, 30");
    speed = value as ReplaySpeed;
    emitStatus();
  } else if (action === "seek") {
    if (!Number.isFinite(value)) throw new Error("seek requires an epoch-second value");
    const startTs = events[0].providerTs;
    const endTs = events[events.length - 1].providerTs;
    clock = Math.min(endTs, Math.max(startTs, value!));
    cursor = firstEventAfter(clock);
    replaceSnapshots(latestFeedsAt(clock));
    emit({ event: "replay-reset", data: replayInitPayload() });
    emitStatus();
    lastRealMs = Date.now();
  } else {
    throw new Error("action must be play, pause, seek, or speed");
  }
  return replayStatus()!;
}

function firstEventAfter(target: number): number {
  const index = events.findIndex(row => row.providerTs > target);
  return index === -1 ? events.length : index;
}

function latestFeedsAt(target: number) {
  const feeds = new Map<string, StoredSnapshot["snapshot"]>();
  for (const row of events) {
    if (row.providerTs > target) break;
    feeds.set(row.snapshot.feed, row.snapshot);
  }
  return [...feeds.values()];
}

function tick(): void {
  const now = Date.now();
  const realDeltaSec = Math.max(0, (now - lastRealMs) / 1000);
  lastRealMs = now;
  if (!playing) return;

  const endTs = events[events.length - 1].providerTs;
  clock = Math.min(endTs, clock + realDeltaSec * speed);
  while (cursor < events.length && events[cursor].providerTs <= clock) {
    publishSnapshot(events[cursor].snapshot);
    cursor++;
  }

  if (clock >= endTs) {
    playing = false;
    emitStatus();
  } else if (now - lastClockStatusMs >= 1000) {
    emitStatus();
  }
}

function emitStatus(): void {
  lastClockStatusMs = Date.now();
  emit({ event: "replay-status", data: replayStatus()! });
}

function emit(event: ReplayEvent): void {
  for (const fn of listeners) fn(event);
}
