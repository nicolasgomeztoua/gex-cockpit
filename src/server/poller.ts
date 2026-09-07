import { processLiveAlerts } from "./alerts";
import {
  assertGexbotApiKey,
  fetchFeed,
  fetchFuturesConversion,
  GEX_OI_AGGREGATION,
  GEX_STATE_AGGREGATION,
  warmGexbotConnection,
} from "./gexbot";
import { latestStoredSnapshots, persistSnapshot } from "./db";
import { PollRetryState, formatRetryDelay } from "./poll-retry";
import type {
  ConversionTicker,
  FeedKey,
  FeedKind,
  FeedSnapshot,
  FuturesConversion,
  StrikeRow,
  Ticker,
} from "../shared/types";

const POLL_MS = Number(process.env.POLL_MS ?? 10_000);
/** MOCK=1: run a synthetic session off one real snapshot — nothing is persisted. */
export const REPLAY_DATE = process.env.REPLAY?.trim() || null;
const MOCK_REQUESTED = !!process.env.MOCK && process.env.MOCK !== "0";
export const MOCK = MOCK_REQUESTED && !REPLAY_DATE;

if (REPLAY_DATE && MOCK_REQUESTED) {
  console.warn("[poller] REPLAY takes precedence over MOCK; synthetic mode is disabled");
}

const FEEDS: { ticker: Ticker; kind: FeedKind }[] = [
  { ticker: "NDX", kind: "state" },
  { ticker: "NDX", kind: "gamma" },
  { ticker: "NDX", kind: "oi" },
  { ticker: "QQQ", kind: "state" },
  { ticker: "QQQ", kind: "gamma" },
  { ticker: "QQQ", kind: "oi" },
];

const TICKERS = [...new Set(FEEDS.map(f => f.ticker))];

type Listener = (s: FeedSnapshot) => void;
type ConversionListener = (c: FuturesConversion) => void;

// Live polling never stops during an in-app replay. Keep its latest state in a
// shadow store while the displayed store is owned by the replay clock.
const liveStore = new Map<FeedKey, FeedSnapshot>();
const store = new Map<FeedKey, FeedSnapshot>();
const conversionStore = new Map<ConversionTicker, FuturesConversion>();
const listeners = new Set<Listener>();
const conversionListeners = new Set<ConversionListener>();
let replayDisplayActive = false;

if (!MOCK && !REPLAY_DATE) {
  const activeFeeds = new Set(FEEDS.map(feed => `${feed.ticker}:${feed.kind}`));
  for (const stored of latestStoredSnapshots()) {
    if (!activeFeeds.has(stored.feed)) continue;
    const lastGood: FeedSnapshot = {
      ...stored,
      status: "error",
      error: "last recorded snapshot; waiting for live provider update",
    };
    liveStore.set(lastGood.feed, lastGood);
    store.set(lastGood.feed, lastGood);
  }
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function liveSnapshots(): FeedSnapshot[] {
  return [...liveStore.values()];
}

export function snapshots(): FeedSnapshot[] {
  return [...store.values()];
}

export function conversions(): Partial<Record<ConversionTicker, FuturesConversion>> {
  return Object.fromEntries(conversionStore) as Partial<Record<ConversionTicker, FuturesConversion>>;
}

export function subscribeConversions(fn: ConversionListener): () => void {
  conversionListeners.add(fn);
  return () => conversionListeners.delete(fn);
}

export function replaceSnapshots(next: FeedSnapshot[]): void {
  store.clear();
  for (const snap of next) store.set(snap.feed, snap);
}

export function beginReplayDisplay(next: FeedSnapshot[]): void {
  replayDisplayActive = true;
  replaceSnapshots(next);
}

export function restoreLiveDisplay(): FeedSnapshot[] {
  replayDisplayActive = false;
  replaceSnapshots([...liveStore.values()]);
  return snapshots();
}

export function publishSnapshot(snap: FeedSnapshot): void {
  store.set(snap.feed, snap);
  emit(snap);
}

function publishLiveSnapshot(snap: FeedSnapshot): void {
  liveStore.set(snap.feed, snap);
  if (replayDisplayActive) return;
  store.set(snap.feed, snap);
  emit(snap);
}

function emit(s: FeedSnapshot): void {
  for (const fn of listeners) fn(s);
}

async function pollLoop(ticker: Ticker, kind: FeedKind): Promise<void> {
  const key = `${ticker}:${kind}` as FeedKey;
  const retry = new PollRetryState();
  let delay = POLL_MS;
  while (true) {
    try {
      const snap = await fetchFeed(ticker, kind);
      const prev = liveStore.get(key);
      // Dedupe on the provider timestamp: only a real data update reaches
      // the store, the DB, and the UI. Poll ticks with unchanged data are
      // still used to clear a previous error state.
      if (!prev || prev.providerTs !== snap.providerTs || prev.status === "error") {
        liveStore.set(key, snap);
        if (!MOCK) persistSnapshot(snap);
        if (!replayDisplayActive) {
          store.set(key, snap);
          emit(snap);
        }
      }
      if (!MOCK) processLiveAlerts(snap);
      const recoveredFailures = retry.recovered();
      if (recoveredFailures > 0) {
        console.info(
          `[poller] ${key}: recovered after ${recoveredFailures} consecutive ${recoveredFailures === 1 ? "failure" : "failures"}`,
        );
      }
      delay = POLL_MS;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const decision = retry.failed();
      delay = decision.delayMs;
      console.error(
        `[poller] ${key}: ${msg} (failure ${decision.failureCount}; retrying in ${formatRetryDelay(delay)})`,
      );
      const prev = liveStore.get(key);
      if (prev && prev.status !== "error") {
        // keep last-good data, just flag it
        const flagged = { ...prev, status: "error" as const, error: msg };
        publishLiveSnapshot(flagged);
      }
    }
    await Bun.sleep(delay);
  }
}

async function conversionLoop(ticker: ConversionTicker): Promise<void> {
  const retry = new PollRetryState();
  let delay = 0;
  while (true) {
    if (delay) await Bun.sleep(delay);
    try {
      const conversion = await fetchFuturesConversion(ticker);
      const prev = conversionStore.get(ticker);
      conversionStore.set(ticker, conversion);
      if (
        !prev
        || prev.multiplier !== conversion.multiplier
        || prev.additive !== conversion.additive
        || prev.futureContract !== conversion.futureContract
      ) {
        if (!replayDisplayActive) {
          for (const fn of conversionListeners) fn(conversion);
        }
        console.info(
          `[poller] ${ticker}→${conversion.futureContract}: conversion ${conversion.multiplier.toFixed(6)}x ${conversion.additive >= 0 ? "+" : "−"} ${Math.abs(conversion.additive).toFixed(4)}`,
        );
      }
      const recoveredFailures = retry.recovered();
      if (recoveredFailures > 0) {
        console.info(
          `[poller] ${ticker}/NQ conversion: recovered after ${recoveredFailures} consecutive ${recoveredFailures === 1 ? "failure" : "failures"}`,
        );
      }
      // GexBot documents conversion updates every 15 minutes during RTH.
      delay = 15 * 60_000;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const decision = retry.failed();
      delay = decision.delayMs;
      console.error(
        `[poller] ${ticker}/NQ conversion: ${msg} (failure ${decision.failureCount}; retrying in ${formatRetryDelay(delay)})`,
      );
    }
  }
}

async function bootstrap(start: () => void): Promise<void> {
  const retry = new PollRetryState();
  console.info("[poller] warming GexBot connection (one cold-start request may use 3s)");
  while (true) {
    try {
      await warmGexbotConnection();
      const recoveredFailures = retry.recovered();
      console.info(
        `[poller] connection ready; normal requests use 1.0s timeout${recoveredFailures ? ` (recovered after ${recoveredFailures} ${recoveredFailures === 1 ? "failure" : "failures"})` : ""}`,
      );
      start();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const decision = retry.failed();
      console.error(
        `[poller] startup connection: ${msg} (failure ${decision.failureCount}; retrying in ${formatRetryDelay(decision.delayMs)})`,
      );
      await Bun.sleep(decision.delayMs);
    }
  }
}

export function startPoller(): void {
  if (REPLAY_DATE) {
    console.log(`[poller] REPLAY ${REPLAY_DATE} — recorded session, nothing persisted`);
    void import("./replay").then(({ startReplay }) => startReplay());
    return;
  }
  assertGexbotApiKey();
  if (MOCK) {
    console.log("[poller] MOCK mode — synthetic session, nothing persisted");
    void bootstrap(() => {
      for (const ticker of ["NDX", "QQQ"] as ConversionTicker[]) void conversionLoop(ticker);
      void startMock();
    });
    return;
  }
  console.log(
    `[poller] polling State ${GEX_STATE_AGGREGATION} + OI ${GEX_OI_AGGREGATION} every ${POLL_MS}ms (set POLL_MS/GEX_STATE_AGGREGATION/GEX_OI_AGGREGATION to change)`,
  );
  void bootstrap(() => {
    for (const ticker of ["NDX", "QQQ"] as ConversionTicker[]) void conversionLoop(ticker);
    for (const f of FEEDS) void pollLoop(f.ticker, f.kind);
  });
}

// ---------------------------------------------------------------------------
// Mock mode: seed from one real snapshot per feed, then random-walk the spot
// and jitter the profiles so the UI can be exercised while the market is shut.

const mockHistories = new Map<Ticker, [number, number][]>();
const mockZgHistories = new Map<Ticker, [number, number][]>();

export function mockSpotHistory(ticker: Ticker): [number, number][] {
  return mockHistories.get(ticker) ?? [];
}

export function mockZgHistory(ticker: Ticker): [number, number][] {
  return mockZgHistories.get(ticker) ?? [];
}

const randn = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Walk the mock zero gamma forward and record it (classic feeds only). */
function nextMockZg(ticker: Ticker, kind: FeedKind, nowSec: number): number | null {
  if (kind !== "oi") return null;
  const hist = mockZgHistories.get(ticker);
  if (!hist?.length) return null;
  const prev = hist[hist.length - 1][1];
  const zg = prev + prev * 0.00006 * randn();
  hist.push([nowSec, zg]);
  return zg;
}

async function startMock(): Promise<void> {
  const bases = new Map<FeedKey, FeedSnapshot>();
  for (const f of FEEDS) {
    const key = `${f.ticker}:${f.kind}` as FeedKey;
    try {
      bases.set(key, await fetchFeed(f.ticker, f.kind));
    } catch (err) {
      console.error(`[mock] seed fetch failed for ${key}:`, err);
      return;
    }
  }

  // synthetic 6.5h of 1-minute history ending at the real spot
  for (const ticker of TICKERS) {
    const base = bases.get(`${ticker}:state` as FeedKey)!;
    const nowSec = Math.floor(Date.now() / 1000);
    const points: [number, number][] = [];
    let px = base.spot;
    const steps = 390;
    const walk: number[] = [px];
    for (let i = 0; i < steps; i++) {
      px += px * 0.00045 * randn();
      walk.push(px);
    }
    // shift the walk so it *ends* at the real spot
    const drift = walk[walk.length - 1] - base.spot;
    for (let i = 0; i <= steps; i++) {
      points.push([nowSec - (steps - i) * 60, walk[i] - (drift * i) / steps]);
    }
    mockHistories.set(ticker, points);

    // zero gamma drifts slowly around its seed value through the session
    const zgBase = bases.get(`${ticker}:oi` as FeedKey)!.majors.zeroGamma;
    if (zgBase) {
      const zgPoints: [number, number][] = [];
      let zg = zgBase;
      for (let i = 0; i <= steps; i++) {
        zg += zgBase * 0.00006 * randn();
        zgPoints.push([nowSec - (steps - i) * 60, zg]);
      }
      const zgDrift = zg - zgBase;
      mockZgHistories.set(
        ticker,
        zgPoints.map(([t, v], i) => [t, v - (zgDrift * i) / steps] as [number, number]),
      );
    }
  }

  const spots = new Map<Ticker, number>(
    TICKERS.map(t => [t, bases.get(`${t}:state` as FeedKey)!.spot]),
  );

  setInterval(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    for (const ticker of TICKERS) {
      const spot = spots.get(ticker)! * (1 + 0.00035 * randn());
      spots.set(ticker, spot);
      mockHistories.get(ticker)!.push([nowSec, spot]);
      for (const kind of ["state", "gamma", "oi"] as FeedKind[]) {
        const key = `${ticker}:${kind}` as FeedKey;
        const base = bases.get(key)!;
        const strikes: StrikeRow[] = base.strikes.map(([k, v, o, p, greek]) => {
          const next: StrikeRow = [
            k,
            v * (1 + 0.06 * randn()),
            o * (1 + 0.06 * randn()),
            p.map(x => x * (1 + 0.04 * randn())),
          ];
          if (greek !== undefined && greek !== null) next[4] = greek * (1 + 0.06 * randn());
          return next;
        });
        const near = strikes.filter(([k]) => Math.abs(k - spot) / spot < 0.012 && k !== 0);
        const wall = (col: 1 | 2, sign: 1 | -1) => {
          const c = near
            .filter(s => sign * s[col] > 0)
            .sort((a, b) => sign * (b[col] - a[col]))[0];
          return c ? c[0] : 0;
        };
        const snap: FeedSnapshot = {
          ...base,
          providerTs: nowSec,
          fetchedAt: Date.now(),
          spot,
          strikes,
          majors: {
            posVol: wall(1, 1) || base.majors.posVol,
            negVol: wall(1, -1) || base.majors.negVol,
            posOI: kind === "oi" ? wall(2, 1) || base.majors.posOI : base.majors.posOI,
            negOI: kind === "oi" ? wall(2, -1) || base.majors.negOI : base.majors.negOI,
            zeroGamma: nextMockZg(ticker, kind, nowSec),
          },
          netGexVol: strikes.reduce((a, [, v]) => a + v, 0),
          netGexOI: strikes.reduce((a, [, , o]) => a + o, 0),
          status: "live",
        };
        publishLiveSnapshot(snap);
      }
    }
  }, 3000);
}
