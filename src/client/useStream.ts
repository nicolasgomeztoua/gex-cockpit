import { useEffect, useState } from "react";
import type { FeedKey, FeedSnapshot, InitPayload, Ticker } from "../shared/types";

export interface StreamState {
  connected: boolean;
  mock: boolean;
  feeds: Partial<Record<FeedKey, FeedSnapshot>>;
  /** [epoch sec, spot] per ticker, ascending */
  spotHistory: Record<Ticker, [number, number][]>;
  /** [epoch sec, zero gamma] per ticker, ascending */
  zgHistory: Record<Ticker, [number, number][]>;
}

const EMPTY: StreamState = {
  connected: false,
  mock: false,
  feeds: {},
  spotHistory: { NDX: [], QQQ: [], NQ_NDX: [] },
  zgHistory: { NDX: [], QQQ: [], NQ_NDX: [] },
};

export function useStream(): StreamState {
  const [state, setState] = useState<StreamState>(EMPTY);

  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("open", () => setState(s => ({ ...s, connected: true })));
    es.addEventListener("error", () => setState(s => ({ ...s, connected: false })));

    es.addEventListener("init", ev => {
      const init = JSON.parse((ev as MessageEvent).data) as InitPayload;
      const feeds: StreamState["feeds"] = {};
      for (const f of init.feeds) feeds[f.feed] = f;
      setState({
        connected: true,
        mock: init.mock,
        feeds,
        spotHistory: init.spotHistory,
        zgHistory: init.zgHistory,
      });
    });

    es.addEventListener("update", ev => {
      const snap = JSON.parse((ev as MessageEvent).data) as FeedSnapshot;
      setState(s => {
        const feeds = { ...s.feeds, [snap.feed]: snap };
        let spotHistory = s.spotHistory;
        let zgHistory = s.zgHistory;
        if (snap.status === "live") {
          const series = s.spotHistory[snap.ticker];
          const last = series[series.length - 1];
          if (!last || last[0] < snap.providerTs) {
            spotHistory = {
              ...s.spotHistory,
              [snap.ticker]: [...series, [snap.providerTs, snap.spot] as [number, number]],
            };
          }
          if (snap.kind === "oi" && snap.majors.zeroGamma) {
            const zgSeries = s.zgHistory[snap.ticker];
            const zgLast = zgSeries[zgSeries.length - 1];
            if (!zgLast || zgLast[0] < snap.providerTs) {
              zgHistory = {
                ...s.zgHistory,
                [snap.ticker]: [
                  ...zgSeries,
                  [snap.providerTs, snap.majors.zeroGamma] as [number, number],
                ],
              };
            }
          }
        }
        return { ...s, feeds, spotHistory, zgHistory };
      });
    });

    return () => es.close();
  }, []);

  return state;
}
