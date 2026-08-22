import { useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useStream } from "./useStream";
import { GexChart } from "./GexChart";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { useLevelAlerts } from "./alerts/useLevelAlerts";
import { useSettings } from "./useSettings";
import type { FeedSnapshot, StrikeRow } from "../shared/types";

/** Rescale a snapshot's price fields (spot/strikes/majors) by `r`. */
function scaleSnapshot(s: FeedSnapshot, r: number): FeedSnapshot {
  return {
    ...s,
    spot: s.spot * r,
    majors: {
      posVol: s.majors.posVol * r,
      negVol: s.majors.negVol * r,
      posOI: s.majors.posOI * r,
      negOI: s.majors.negOI * r,
      zeroGamma: s.majors.zeroGamma ? s.majors.zeroGamma * r : s.majors.zeroGamma,
    },
    // priors are GEX values, not prices — only the strike is rescaled
    strikes: s.strikes.map(([k, v, o, p]) => [k * r, v, o, p] as StrikeRow),
  };
}

const scaleSeries = (series: [number, number][], r: number) =>
  series.map(([t, v]) => [t, v * r] as [number, number]);

/** Expand button that floats over the charts when the sidebar is collapsed. */
function CollapsedTrigger() {
  const { open } = useSidebar();
  if (open) return null;
  return (
    <SidebarTrigger className="absolute top-2 right-2 z-20 rounded bg-black/70 backdrop-blur-sm" />
  );
}

function App() {
  const s = useStream();
  const [settings, setSettings] = useSettings();

  const nqAvailable = !!s.feeds["NQ_NDX:state"];
  const useNq = settings.unit === "nq" && nqAvailable;

  // The QQQ→NQ ratio is frozen when NQ mode is entered: re-deriving it every
  // tick would retroactively rebase the whole history each update.
  const ratioRef = useRef<number | undefined>(undefined);
  const qqqSpot = s.feeds["QQQ:state"]?.spot;
  const nqSpot = s.feeds["NQ_NDX:state"]?.spot;
  if (useNq && ratioRef.current === undefined && qqqSpot && nqSpot) {
    ratioRef.current = nqSpot / qqqSpot;
  }
  if (!useNq) ratioRef.current = undefined;
  const ratio = useNq ? ratioRef.current : undefined;

  // NDX: native NQ_NDX feed in NQ units
  const ndxState = useNq ? s.feeds["NQ_NDX:state"] : s.feeds["NDX:state"];
  const ndxOi = useNq ? s.feeds["NQ_NDX:oi"] : s.feeds["NDX:oi"];
  const ndxSeries = useNq ? s.spotHistory.NQ_NDX : s.spotHistory.NDX;
  const ndxZg = useNq ? s.zgHistory.NQ_NDX : s.zgHistory.NDX;

  // QQQ: ratio-approximated in NQ units (memoized so unrelated updates don't
  // produce fresh objects and needlessly rerun chart effects)
  const rawQqqState = s.feeds["QQQ:state"];
  const rawQqqOi = s.feeds["QQQ:oi"];
  const qqqState = useMemo(
    () => (ratio && rawQqqState ? scaleSnapshot(rawQqqState, ratio) : rawQqqState),
    [rawQqqState, ratio],
  );
  const qqqOi = useMemo(
    () => (ratio && rawQqqOi ? scaleSnapshot(rawQqqOi, ratio) : rawQqqOi),
    [rawQqqOi, ratio],
  );
  const qqqSeries = useMemo(
    () => (ratio ? scaleSeries(s.spotHistory.QQQ, ratio) : s.spotHistory.QQQ),
    [s.spotHistory.QQQ, ratio],
  );
  const qqqZg = useMemo(
    () => (ratio ? scaleSeries(s.zgHistory.QQQ, ratio) : s.zgHistory.QQQ),
    [s.zgHistory.QQQ, ratio],
  );

  const historyKey = useNq ? "nq" : "spot";

  // alerts run on the same displayed-unit data the charts show
  useLevelAlerts(
    [
      { label: "NDX", ticker: "NDX", state: ndxState, oi: ndxOi },
      { label: "QQQ", ticker: "QQQ", state: qqqState, oi: qqqOi },
    ],
    settings,
  );

  return (
    <TooltipProvider>
      <SidebarProvider>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <GexChart
            label="NDX"
            unitTag={useNq ? "NQ pts" : undefined}
            historyKey={`ndx:${historyKey}`}
            state={ndxState}
            oi={ndxOi}
            spotSeries={ndxSeries}
            zgSeries={ndxZg}
            settings={settings.tickers.NDX}
          />
          <div className="h-px shrink-0 bg-border" />
          <GexChart
            label="QQQ"
            unitTag={useNq ? "≈ NQ pts" : undefined}
            historyKey={`qqq:${historyKey}`}
            state={qqqState}
            oi={qqqOi}
            spotSeries={qqqSeries}
            zgSeries={qqqZg}
            settings={settings.tickers.QQQ}
          />
          <CollapsedTrigger />
        </main>
        <Sidebar
          settings={settings}
          onChange={setSettings}
          feeds={s.feeds}
          connected={s.connected}
          mock={s.mock}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
