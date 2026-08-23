import { create } from "zustand";
import type {
  FeedKey,
  FeedSnapshot,
  InitPayload,
  ReplayStatus,
  Ticker,
} from "../../shared/types";

export interface StreamState {
  connected: boolean;
  mock: boolean;
  replay: ReplayStatus | null;
  historyRevision: number;
  feeds: Partial<Record<FeedKey, FeedSnapshot>>;
  /** [epoch sec, spot] per ticker, ascending */
  spotHistory: Record<Ticker, [number, number][]>;
  /** [epoch sec, zero gamma] per ticker, ascending */
  zgHistory: Record<Ticker, [number, number][]>;
}

export const useStreamStore = create<StreamState>(() => ({
  connected: false,
  mock: false,
  replay: null,
  historyRevision: 0,
  feeds: {},
  spotHistory: { NDX: [], QQQ: [], NQ_NDX: [] },
  zgHistory: { NDX: [], QQQ: [], NQ_NDX: [] },
}));

let started = false;

/** Open the SSE connection (idempotent — the EventSource outlives React). */
export function startStream(): void {
  if (started) return;
  started = true;
  const es = new EventSource("/api/stream");
  const set = useStreamStore.setState;

  const applyInit = (init: InitPayload, historyRevision?: number) => {
    const feeds: StreamState["feeds"] = {};
    for (const f of init.feeds) feeds[f.feed] = f;
    set({
      connected: true,
      mock: init.mock,
      replay: init.replay,
      feeds,
      spotHistory: init.spotHistory,
      zgHistory: init.zgHistory,
      ...(historyRevision === undefined ? {} : { historyRevision }),
    });
  };

  es.addEventListener("open", () => set({ connected: true }));
  es.addEventListener("error", () => set({ connected: false }));

  es.addEventListener("init", ev => {
    const init = JSON.parse((ev as MessageEvent).data) as InitPayload;
    applyInit(init);
  });

  es.addEventListener("replay-reset", ev => {
    const init = JSON.parse((ev as MessageEvent).data) as InitPayload;
    applyInit(init, useStreamStore.getState().historyRevision + 1);
  });

  es.addEventListener("replay-status", ev => {
    const replay = JSON.parse((ev as MessageEvent).data) as ReplayStatus;
    set({ replay });
  });

  es.addEventListener("update", ev => {
    const snap = JSON.parse((ev as MessageEvent).data) as FeedSnapshot;
    set(s => {
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
          const lastZg = zgSeries[zgSeries.length - 1];
          if (!lastZg || lastZg[0] < snap.providerTs) {
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
      return { feeds, spotHistory, zgHistory };
    });
  });
}
