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
import { RecoveringSerialTaskQueue } from "./serial-request";

// The rendered docs show api.gexbot.com/{ticker}/{package}/{period}. GexBot's
// versioned host exposes the same data with category names (gex_zero, etc.) and
// shares a keep-alive pool with the conversion endpoint, which matters with the
// intentionally strict one-second request deadline.
const CHART_BASE_URL = "https://api.gex.bot/v2";
const CONVERSION_URL = "https://api.gex.bot/v2/futures/conversion";
const USER_AGENT = "gex-cockpit/0.2.0 (local)";
const STARTUP_TIMEOUT_MS = 3_000;
// Warm a required chart feed; optional futures-conversion access must not block startup.
const WARMUP_URL = `${CHART_BASE_URL}/NDX/state/gex_zero`;
const requestQueue = new RecoveringSerialTaskQueue(
  async () => {
    await rawRequestJson<RawGexFull>(WARMUP_URL, STARTUP_TIMEOUT_MS);
  },
  {
    lost: () => console.warn(
      "[poller] provider connection timed out at 1.0s; rebuilding with a 3.0s recovery allowance",
    ),
    recovered: () => console.info(
      "[poller] provider connection rebuilt; normal 1.0s polling resumed",
    ),
  },
);

const API_KEY = process.env.GEXBOT_API_KEY;

function aggregationEnv(name: string, fallback: AggregationPeriod): AggregationPeriod {
  const requested = process.env[name] ?? process.env.GEX_AGGREGATION ?? fallback;
  if (!["full", "zero", "one"].includes(requested)) {
    throw new Error(`${name} must be full, zero, or one`);
  }
  return requested as AggregationPeriod;
}

/** State defaults to GexBot's latest button; Classic OI defaults to its 90d view. */
export const GEX_STATE_AGGREGATION = aggregationEnv("GEX_STATE_AGGREGATION", "zero");
export const GEX_OI_AGGREGATION = aggregationEnv("GEX_OI_AGGREGATION", "full");
export const GEX_GAMMA_AGGREGATION = GEX_STATE_AGGREGATION === "one" ? "one" : "zero";

export function aggregationFor(kind: FeedKind): AggregationPeriod {
  if (kind === "state") return GEX_STATE_AGGREGATION;
  if (kind === "oi") return GEX_OI_AGGREGATION;
  return GEX_GAMMA_AGGREGATION;
}

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
  // [strike, call_ivol, put_ivol, requested greek, priors[]]
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
  const aggregation = aggregationFor(kind);
  if (kind === "gamma") {
    // GexBot publishes options-profile Greeks for nearest/next expiry only.
    return `${CHART_BASE_URL}/${ticker}/state/gamma_${aggregation}`;
  }
  const pkg = kind === "state" ? "state" : "classic";
  return `${CHART_BASE_URL}/${ticker}/${pkg}/gex_${aggregation}`;
}

async function rawRequestJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    headers: headers(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function requestJson<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> {
  return requestQueue.run(
    () => rawRequestJson<T>(url, timeoutMs),
    timeoutMs === FETCH_TIMEOUT_MS,
  );
}

/**
 * One cold TLS request is measurably slower than one second on this machine.
 * Give only this bootstrap call a three-second allowance; every normal feed
 * and conversion request still uses the required one-second timeout.
 */
export async function warmGexbotConnection(): Promise<void> {
  await requestJson<RawGexFull>(WARMUP_URL, STARTUP_TIMEOUT_MS);
}

export async function fetchFeed(ticker: Ticker, kind: FeedKind): Promise<FeedSnapshot> {
  const url = feedUrl(ticker, kind);
  try {
    if (kind === "gamma") return parseGammaFeed(ticker, await requestJson<RawGamma>(url));
    return parseGexFeed(ticker, kind, await requestJson<RawGexFull>(url));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("HTTP ")) {
      throw new Error(`${ticker}/${kind}: ${error.message}`);
    }
    throw error;
  }
}

export async function fetchFuturesConversion(ticker: ConversionTicker): Promise<FuturesConversion> {
  const model = ticker === "QQQ" ? "affine" : "additive";
  const url = `${CONVERSION_URL}?ticker=${ticker}&future=NQ&model=${model}`;
  let raw: RawConversion;
  try {
    raw = await requestJson<RawConversion>(url);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("HTTP ")) {
      throw new Error(`${ticker}/NQ conversion: ${error.message}`);
    }
    throw error;
  }
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
  const aggregation = aggregationFor(kind);
  return {
    feed: `${ticker}:${kind}` as FeedKey,
    ticker,
    kind,
    aggregation,
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
  return {
    feed: `${ticker}:gamma` as FeedKey,
    ticker,
    kind: "gamma",
    aggregation: GEX_GAMMA_AGGREGATION,
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
      row => [
        row[0],
        row[1],
        row[2],
        Array.isArray(row[4]) ? row[4] : [],
        row[3],
      ] as StrikeRow,
    ),
    status: "live",
  };
}
