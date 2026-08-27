import {
  spotHistory,
  storedSnapshots,
  storedSnapshotTimes,
  storedSpotTicks,
  zgHistory,
  type StoredSnapshot,
} from "./db";
import {
  beginReplayDisplay,
  conversions,
  mockSpotHistory,
  mockZgHistory,
  MOCK,
  publishSnapshot,
  restoreLiveDisplay,
  snapshots,
} from "./poller";
import { availableDates, etDate, isInRthSession, rthSessionBounds } from "./replay-select";
import type { InitPayload, ReplaySession, ReplayStatus, Ticker } from "../shared/types";

const SPEEDS = [1, 2, 5, 10, 30] as const;
const REPLAY_FRAME_MS = 50;
type ReplaySpeed = (typeof SPEEDS)[number];
type ReplayEvent =
  | { event: "replay-reset"; data: InitPayload }
  | { event: "replay-status"; data: ReplayStatus };
type ReplayListener = (event: ReplayEvent) => void;

const emptyHistories = (): Record<Ticker, [number, number][]> => ({
  NDX: [],
  QQQ: [],
  NQ_NDX: [],
});

let date = "";
let events: StoredSnapshot[] = [];
let ticks: { ticker: Ticker; ts: number; spot: number }[] = [];
let clock = 0;
let sessionStart = 0;
let cursor = 0;
let playing = true;
let speed: ReplaySpeed = 1;
let lastRealMs = 0;
let lastClockStatusMs = 0;
let prepared = false;
let started = false;
let activation: "startup" | "runtime" | null = null;
const listeners = new Set<ReplayListener>();

export function prepareReplay(
  requestedDate: string,
  nextActivation: "startup" | "runtime" = "startup",
  initialClock?: number,
): void {
  const { startTs, endTs } = rthSessionBounds(requestedDate);
  const selectedEvents = storedSnapshots(startTs, endTs);
  if (!selectedEvents.length) {
    const dates = availableDates(storedSnapshotTimes().map(providerTs => ({ providerTs })));
    const available = dates.length ? dates.join(", ") : "none";
    throw new Error(`no RTH snapshots for ${requestedDate}; available RTH sessions: ${available}`);
  }

  events = selectedEvents;
  date = requestedDate;
  ticks = storedSpotTicks(startTs, endTs);
  sessionStart = firstCompleteFrame(events);
  const defaultClock = nextActivation === "runtime" ? events[events.length - 1].providerTs : sessionStart;
  if (initialClock !== undefined && !Number.isFinite(initialClock)) {
    throw new Error("initial replay clock must be an epoch-second value");
  }
  clock = initialClock === undefined
    ? defaultClock
    : Math.min(events[events.length - 1].providerTs, Math.max(sessionStart, initialClock));
  cursor = firstEventAfter(clock);
  playing = nextActivation === "startup";
  speed = 1;
  prepared = true;
  activation = nextActivation;
  beginReplayDisplay(latestFeedsAt(clock));
}

export function startReplay(): void {
  if (!prepared) throw new Error("replay was not prepared before start");
  lastRealMs = Date.now();
  lastClockStatusMs = lastRealMs;
  if (!started) {
    started = true;
    setInterval(tick, REPLAY_FRAME_MS);
  }
}

export function activateReplay(requestedDate: string, initialClock?: number): ReplayStatus {
  if (activation === "startup") {
    throw new Error("startup replay cannot switch sessions at runtime");
  }
  prepareReplay(requestedDate, "runtime", initialClock);
  startReplay();
  emit({ event: "replay-reset", data: replayInitPayload() });
  emitStatus();
  return replayStatus()!;
}

export function stopReplay(): null {
  if (!prepared) throw new Error("replay mode is not active");
  if (activation !== "runtime") {
    throw new Error("this replay was started from REPLAY and cannot return to live mode");
  }

  prepared = false;
  playing = false;
  activation = null;
  events = [];
  ticks = [];
  date = "";
  clock = 0;
  sessionStart = 0;
  cursor = 0;
  restoreLiveDisplay();
  emit({ event: "replay-reset", data: liveInitPayload() });
  return null;
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
    returnToLive: activation === "runtime",
    clock: Math.round(clock * (1_000 / REPLAY_FRAME_MS)) / (1_000 / REPLAY_FRAME_MS),
    startTs: sessionStart,
    endTs: events[events.length - 1].providerTs,
  };
}

export function replaySessions(): ReplaySession[] {
  const nowSec = Math.floor(Date.now() / 1_000);
  const currentRthDate = isInRthSession(nowSec) ? etDate(nowSec) : null;
  const groups = new Map<string, ReplaySession>();
  for (const providerTs of storedSnapshotTimes()) {
    if (!isInRthSession(providerTs)) continue;
    const rowDate = etDate(providerTs);
    const current = groups.get(rowDate);
    if (!current) {
      groups.set(rowDate, {
        date: rowDate,
        startTs: providerTs,
        endTs: providerTs,
        snapshotCount: 1,
      });
      continue;
    }
    current.startTs = Math.min(current.startTs, providerTs);
    current.endTs = Math.max(current.endTs, providerTs);
    current.snapshotCount++;
  }
  return [...groups.values()]
    // A one-timestamp historical recording is not useful playback. Keep that
    // threshold for old sessions, but expose today's RTH session immediately
    // after its very first stored snapshot.
    .filter(session => session.endTs > session.startTs || session.date === currentRthDate)
    .sort((a, b) => a.date.localeCompare(b.date));
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

  return { feeds: snapshots(), conversions: {}, spotHistory, zgHistory, mock: false, replay: status };
}

function liveInitPayload(): InitPayload {
  return {
    feeds: snapshots(),
    conversions: conversions(),
    spotHistory: MOCK
      ? { NDX: mockSpotHistory("NDX"), QQQ: mockSpotHistory("QQQ"), NQ_NDX: mockSpotHistory("NQ_NDX") }
      : { NDX: spotHistory("NDX"), QQQ: spotHistory("QQQ"), NQ_NDX: spotHistory("NQ_NDX") },
    zgHistory: MOCK
      ? { NDX: mockZgHistory("NDX"), QQQ: mockZgHistory("QQQ"), NQ_NDX: mockZgHistory("NQ_NDX") }
      : { NDX: zgHistory("NDX"), QQQ: zgHistory("QQQ"), NQ_NDX: zgHistory("NQ_NDX") },
    mock: MOCK,
    replay: null,
  };
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
    const startTs = sessionStart;
    const endTs = events[events.length - 1].providerTs;
    clock = Math.min(endTs, Math.max(startTs, value!));
    cursor = firstEventAfter(clock);
    beginReplayDisplay(latestFeedsAt(clock));
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

function firstCompleteFrame(rows: StoredSnapshot[]): number {
  const requiredFeeds = [
    "NDX:state",
    "NDX:gamma",
    "NDX:oi",
    "QQQ:state",
    "QQQ:gamma",
    "QQQ:oi",
  ];
  const firstByFeed = new Map<string, number>();
  for (const row of rows) {
    if (!firstByFeed.has(row.snapshot.feed)) {
      firstByFeed.set(row.snapshot.feed, row.providerTs);
    }
  }
  const requiredStarts = requiredFeeds.map(feed => firstByFeed.get(feed));
  if (requiredStarts.every((value): value is number => value !== undefined)) {
    return Math.max(...requiredStarts);
  }
  return rows[0].providerTs;
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
  if (!prepared || !events.length) return;
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
  } else if (now - lastClockStatusMs >= REPLAY_FRAME_MS) {
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
