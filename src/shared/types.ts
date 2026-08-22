export type Ticker = "NDX" | "QQQ" | "NQ_NDX";
export type FeedKind = "state" | "oi";

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

/** [strike, volValue, oiValue, priorValues (1/5/10/15/30-min prior snapshots)] */
export type StrikeRow = [number, number, number, number[]];

export interface FeedSnapshot {
  feed: FeedKey;
  ticker: Ticker;
  kind: FeedKind;
  /** provider timestamp, epoch seconds */
  providerTs: number;
  /** local fetch time, epoch ms */
  fetchedAt: number;
  spot: number;
  majors: Majors;
  netGexVol: number;
  netGexOI: number;
  minDte: number;
  /** state responses have oiValue = 0 */
  strikes: StrikeRow[];
  status: "live" | "error";
  error?: string;
}

export interface SpotTick {
  ticker: Ticker;
  /** epoch seconds */
  ts: number;
  spot: number;
}

export interface InitPayload {
  feeds: FeedSnapshot[];
  spotHistory: Record<Ticker, [number, number][]>; // [epoch sec, spot]
  /** zero-gamma level through the session, per ticker: [epoch sec, zg] */
  zgHistory: Record<Ticker, [number, number][]>;
  /** true when the server is running with MOCK=1 (synthetic data, nothing persisted) */
  mock: boolean;
}
