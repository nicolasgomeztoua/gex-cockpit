export type Ticker = "NDX" | "QQQ" | "NQ_NDX";
export type FeedKind = "state" | "gamma" | "oi";
export type AggregationPeriod = "full" | "zero" | "one";
export type ConversionTicker = "NDX" | "QQQ";

/** `${ticker}:${kind}` */
export type FeedKey = `${Ticker}:${FeedKind}`;

export interface Majors {
  /** price level of the major positive / negative volume wall */
  posVol: number;
  negVol: number;
  /** price level of the major positive / negative OI wall (0 in state responses) */
  posOI: number;
  negOI: number;
  /** classic/OI only; null for state */
  zeroGamma: number | null;
}

/**
 * Classic/State: [strike, volValue, oiValue, priors].
 * Convexity: [strike, callIvol, putIvol, priors, specifiedGamma].
 */
export type StrikeRow = [number, number, number, number[], number?];

export interface FeedSnapshot {
  feed: FeedKey;
  ticker: Ticker;
  kind: FeedKind;
  /** full = 90d aggregate, zero = nearest expiry, one = next expiry */
  aggregation: AggregationPeriod;
  /** provider timestamp, epoch seconds */
  providerTs: number;
  /** local fetch time, epoch ms */
  fetchedAt: number;
  spot: number;
  majors: Majors;
  netGexVol: number;
  netGexOI: number;
  minDte: number;
  /** State rows use GEX columns; Convexity rows use call/put IVOL columns. */
  strikes: StrikeRow[];
  status: "live" | "error";
  error?: string;
}

export interface FuturesConversion {
  ticker: ConversionTicker;
  future: "NQ";
  futureContract: string;
  /** futuresPrice = multiplier * sourcePrice + additive */
  multiplier: number;
  additive: number;
  fetchedAt: number;
}

export interface SpotTick {
  ticker: Ticker;
  /** epoch seconds */
  ts: number;
  spot: number;
}

export interface ReplayStatus {
  /** New York date whose 09:30–16:00 RTH window is being replayed. */
  date: string;
  playing: boolean;
  speed: 1 | 2 | 5 | 10 | 30;
  /** true for an in-app replay that can return to the still-running live feed */
  returnToLive: boolean;
  /** virtual replay clock, epoch seconds */
  clock: number;
  startTs: number;
  endTs: number;
}

export interface ReplaySession {
  /** New York date of this 09:30–16:00 RTH session. */
  date: string;
  startTs: number;
  endTs: number;
  snapshotCount: number;
}

export interface InitPayload {
  feeds: FeedSnapshot[];
  conversions: Partial<Record<ConversionTicker, FuturesConversion>>;
  spotHistory: Record<Ticker, [number, number][]>; // [epoch sec, spot]
  /** zero-gamma level through the session, per ticker: [epoch sec, zg] */
  zgHistory: Record<Ticker, [number, number][]>;
  /** true when the server is running with MOCK=1 (synthetic data, nothing persisted) */
  mock: boolean;
  replay: ReplayStatus | null;
}
