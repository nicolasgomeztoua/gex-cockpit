import type {
  AggregationPeriod,
  ConversionTicker,
  FeedKind,
  FeedKey,
  FeedSnapshot,
  FuturesConversion,
  StrikeRow,
  Ticker,
} from "../shared/types";
import { FETCH_TIMEOUT_MS } from "./poll-retry";

// The rendered docs show api.gexbot.com/{ticker}/{package}/{period}. GexBot's
// versioned host exposes the same data with category names (gex_zero, etc.) and
// shares a keep-alive pool with the conversion endpoint, which matters with the
// intentionally strict one-second request deadline.
const CHART_BASE_URL = "https://api.gex.bot/v2";
const CONVERSION_URL = "https://api.gex.bot/v2/futures/conversion";
const USER_AGENT = "gex-cockpit/0.2.0 (local)";

const API_KEY = process.env.GEXBOT_API_KEY;

const requestedAggregation = process.env.GEX_AGGREGATION ?? "zero";
if (!["full", "zero", "one"].includes(requestedAggregation)) {
  throw new Error("GEX_AGGREGATION must be full, zero, or one");
}
/** Matches GexBot's latest button by default. */
export const GEX_AGGREGATION = requestedAggregation as AggregationPeriod;

interface RawGexFull {
  timestamp: number;
  ticker: string;
  min_dte: number;
  spot: number;
  zero_gamma: number;
  major_pos_vol: number;
  major_pos_oi: number;
  major_neg_vol: number;
  major_neg_oi: number;
  // [strike, volValue, oiValue, priors[]]
  strikes: [number, number, number, number[]][];
  sum_gex_vol: number;
  sum_gex_oi: number;
}

interface RawGamma {
  timestamp: number;
  ticker: string;
  spot: number;
  min_dte: number;
  major_positive: number;
  major_negative: number;
  major_long_gamma: number;
  major_short_gamma: number;
  // [strike, call imbalance, put imbalance, requested greek, priors[]]
  mini_contracts: [number, number, number, number, number[]][];
}

interface RawConversion {
  future_contract: string;
  multiplier: number;
  additive: number;
}

function headers(): Record<string, string> {
  const apiKey = requireApiKey();
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
}

function requireApiKey(): string {
  if (!API_KEY) throw new Error("GEXBOT_API_KEY is not set — add it to .env.local");
  return API_KEY;
}

export function assertGexbotApiKey(): void {
  requireApiKey();
}

function feedUrl(ticker: Ticker, kind: FeedKind): string {
  if (kind === "gamma") {
    // GexBot publishes options-profile Greeks for nearest/next expiry only.
    const expiry = GEX_AGGREGATION === "one" ? "one" : "zero";
    return `${CHART_BASE_URL}/${ticker}/state/gamma_${expiry}`;
  }
  const pkg = kind === "state" ? "state" : "classic";
  return `${CHART_BASE_URL}/${ticker}/${pkg}/gex_${GEX_AGGREGATION}`;
}

export async function fetchFeed(ticker: Ticker, kind: FeedKind): Promise<FeedSnapshot> {
  const url = feedUrl(ticker, kind);
  const res = await fetch(url, {
    headers: headers(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${ticker}/${kind}: HTTP ${res.status}`);
  if (kind === "gamma") return parseGammaFeed(ticker, (await res.json()) as RawGamma);
  const raw = (await res.json()) as RawGexFull;
  return parseGexFeed(ticker, kind, raw);
}

export async function fetchFuturesConversion(ticker: ConversionTicker): Promise<FuturesConversion> {
  const model = ticker === "QQQ" ? "affine" : "additive";
  const url = `${CONVERSION_URL}?ticker=${ticker}&future=NQ&model=${model}`;
  const res = await fetch(url, {
    headers: headers(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${ticker}/NQ conversion: HTTP ${res.status}`);
  const raw = (await res.json()) as RawConversion;
  if (
    !raw.future_contract
    || !Number.isFinite(raw.multiplier)
    || !Number.isFinite(raw.additive)
  ) {
    throw new Error(`${ticker}/NQ conversion: invalid response`);
  }
  return {
    ticker,
    future: "NQ",
    futureContract: raw.future_contract,
    multiplier: raw.multiplier,
    additive: raw.additive,
    fetchedAt: Date.now(),
  };
}

export function parseGexFeed(
  ticker: Ticker,
  kind: Exclude<FeedKind, "gamma">,
  raw: RawGexFull,
): FeedSnapshot {
  return {
    feed: `${ticker}:${kind}` as FeedKey,
    ticker,
    kind,
    aggregation: GEX_AGGREGATION,
    providerTs: raw.timestamp,
    fetchedAt: Date.now(),
    spot: raw.spot,
    majors: {
      posVol: raw.major_pos_vol,
      negVol: raw.major_neg_vol,
      posOI: raw.major_pos_oi,
      negOI: raw.major_neg_oi,
      zeroGamma: kind === "oi" && raw.zero_gamma ? raw.zero_gamma : null,
    },
    netGexVol: raw.sum_gex_vol,
    netGexOI: raw.sum_gex_oi,
    minDte: raw.min_dte,
    strikes: raw.strikes.map(
      row => [row[0], row[1], row[2], Array.isArray(row[3]) ? row[3] : []] as StrikeRow,
    ),
    status: "live",
  };
}

export function parseGammaFeed(ticker: Ticker, raw: RawGamma): FeedSnapshot {
  const aggregation = GEX_AGGREGATION === "one" ? "one" : "zero";
  return {
    feed: `${ticker}:gamma` as FeedKey,
    ticker,
    kind: "gamma",
    aggregation,
    providerTs: raw.timestamp,
    fetchedAt: Date.now(),
    spot: raw.spot,
    majors: {
      posVol: raw.major_long_gamma,
      negVol: raw.major_short_gamma,
      posOI: raw.major_positive,
      negOI: raw.major_negative,
      zeroGamma: null,
    },
    netGexVol: 0,
    netGexOI: 0,
    minDte: raw.min_dte,
    strikes: raw.mini_contracts.map(
      row => [row[0], row[3], 0, Array.isArray(row[4]) ? row[4] : []] as StrikeRow,
    ),
    status: "live",
  };
}
