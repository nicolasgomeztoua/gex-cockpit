import { openEventStream } from "../desktop/stream";
import { create } from "zustand";
import type {
  FeedKey,
  FeedSnapshot,
  FuturesConversion,
  InitPayload,
  ReplayStatus,
  ConversionTicker,
  Ticker,
} from "../../shared/types";
import { appendLiveSessionPoint } from "../../shared/session";

export interface StreamState {
  connected: boolean;
  mock: boolean;
  replay: ReplayStatus | null;
  historyRevision: number;
  feeds: Partial<Record<FeedKey, FeedSnapshot>>;
  conversions: Partial<Record<ConversionTicker, FuturesConversion>>;
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
  conversions: {},
  spotHistory: { NDX: [], QQQ: [], NQ_NDX: [] },
  zgHistory: { NDX: [], QQQ: [], NQ_NDX: [] },
}));

let started = false;

/** Open the SSE connection (idempotent — the EventSource outlives React). */
export function startStream(): void {
  if (started) return;
  started = true;
  const es = openEventStream();
  const set = useStreamStore.setState;

  const applyInit = (init: InitPayload, historyRevision?: number) => {
    const feeds: StreamState["feeds"] = {};
    for (const f of init.feeds) feeds[f.feed] = f;
    set({
      connected: true,
      mock: init.mock,
      replay: init.replay,
      feeds,
      conversions: init.conversions,
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
        const nextSeries = appendLiveSessionPoint(series, [snap.providerTs, snap.spot]);
        if (nextSeries !== series) {
          spotHistory = {
            ...s.spotHistory,
            [snap.ticker]: nextSeries,
          };
        }
        if (snap.kind === "oi" && snap.majors.zeroGamma !== null) {
          const zgSeries = s.zgHistory[snap.ticker];
          const nextZgSeries = appendLiveSessionPoint(zgSeries, [snap.providerTs, snap.majors.zeroGamma]);
          if (nextZgSeries !== zgSeries) {
            zgHistory = {
              ...s.zgHistory,
              [snap.ticker]: nextZgSeries,
            };
          }
        }
      }
      return { feeds, spotHistory, zgHistory };
    });
  });

  es.addEventListener("conversion", ev => {
    const conversion = JSON.parse((ev as MessageEvent).data) as FuturesConversion;
    set(s => ({ conversions: { ...s.conversions, [conversion.ticker]: conversion } }));
  });
}
