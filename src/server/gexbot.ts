import type { FeedKind, FeedKey, FeedSnapshot, StrikeRow, Ticker } from "../shared/types";

const BASE_URL = "https://api.gex.bot/v2";
const USER_AGENT = "gex-cockpit/0.2.0 (local)";

const API_KEY = process.env.GEXBOT_API_KEY;
if (!API_KEY) {
  console.error("GEXBOT_API_KEY is not set — add it to .env.local");
  process.exit(1);
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

/** The API package that backs each of our feed kinds. */
const PACKAGE_FOR_KIND: Record<FeedKind, string> = {
  state: "state", // per-strike state greeks by volume; OI columns are zeroed
  oi: "classic", // per-strike GEX by volume AND by OI, plus zero gamma
};

export async function fetchFeed(ticker: Ticker, kind: FeedKind): Promise<FeedSnapshot> {
  const url = `${BASE_URL}/${ticker}/${PACKAGE_FOR_KIND[kind]}/gex_full`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${ticker}/${kind}: HTTP ${res.status}`);
  const raw = (await res.json()) as RawGexFull;
  return parseFeed(ticker, kind, raw);
}

function parseFeed(ticker: Ticker, kind: FeedKind, raw: RawGexFull): FeedSnapshot {
  return {
    feed: `${ticker}:${kind}` as FeedKey,
    ticker,
    kind,
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
