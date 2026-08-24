import { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { GexChart } from "./GexChart";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { useLevelAlerts } from "./alerts/useLevelAlerts";
import { hydrateSettings, useSettingsStore } from "./stores/settingsStore";
import { startStream, useStreamStore } from "./stores/streamStore";
import { useUiStore } from "./stores/uiStore";
import { convertSeries, convertSnapshot } from "../shared/conversion";
import type { FeedKey, FeedSnapshot } from "../shared/types";

/** Expand button that floats over the charts when the sidebar is collapsed. */
function CollapsedTrigger() {
  const { open } = useSidebar();
  if (open) return null;
  return (
    <SidebarTrigger className="absolute top-2 right-2 z-20 rounded bg-black/70 backdrop-blur-sm" />
  );
}

function App() {
  const s = useStreamStore();
  const settings = useSettingsStore(st => st.settings);
  const setSettings = useSettingsStore(st => st.setSettings);
  const sidebarOpen = useUiStore(u => u.sidebarOpen);
  const setSidebarOpen = useUiStore(u => u.setSidebarOpen);
  const sidebarWidth = useUiStore(u => u.sidebarWidth);
  useEffect(() => {
    startStream();
    hydrateSettings();
  }, []);

  const ndxConversion = s.conversions.NDX;
  const qqqConversion = s.conversions.QQQ;
  const nqAvailable = !!ndxConversion && !!qqqConversion;
  const useNq = settings.unit === "nq" && nqAvailable;

  const rawNdxState = s.feeds["NDX:state"];
  const rawNdxGamma = s.feeds["NDX:gamma"];
  const rawNdxOi = s.feeds["NDX:oi"];
  const ndxState = useMemo(
    () => (useNq && ndxConversion && rawNdxState ? convertSnapshot(rawNdxState, ndxConversion) : rawNdxState),
    [rawNdxState, useNq, ndxConversion],
  );
  const ndxGamma = useMemo(
    () => (useNq && ndxConversion && rawNdxGamma ? convertSnapshot(rawNdxGamma, ndxConversion) : rawNdxGamma),
    [rawNdxGamma, useNq, ndxConversion],
  );
  const ndxOi = useMemo(
    () => (useNq && ndxConversion && rawNdxOi ? convertSnapshot(rawNdxOi, ndxConversion) : rawNdxOi),
    [rawNdxOi, useNq, ndxConversion],
  );
  const ndxSeries = useMemo(
    () => (useNq && ndxConversion ? convertSeries(s.spotHistory.NDX, ndxConversion) : s.spotHistory.NDX),
    [s.spotHistory.NDX, useNq, ndxConversion],
  );
  const ndxZg = useMemo(
    () => (useNq && ndxConversion ? convertSeries(s.zgHistory.NDX, ndxConversion) : s.zgHistory.NDX),
    [s.zgHistory.NDX, useNq, ndxConversion],
  );

  const rawQqqState = s.feeds["QQQ:state"];
  const rawQqqGamma = s.feeds["QQQ:gamma"];
  const rawQqqOi = s.feeds["QQQ:oi"];
  const qqqState = useMemo(
    () => (useNq && qqqConversion && rawQqqState ? convertSnapshot(rawQqqState, qqqConversion) : rawQqqState),
    [rawQqqState, useNq, qqqConversion],
  );
  const qqqGamma = useMemo(
    () => (useNq && qqqConversion && rawQqqGamma ? convertSnapshot(rawQqqGamma, qqqConversion) : rawQqqGamma),
    [rawQqqGamma, useNq, qqqConversion],
  );
  const qqqOi = useMemo(
    () => (useNq && qqqConversion && rawQqqOi ? convertSnapshot(rawQqqOi, qqqConversion) : rawQqqOi),
    [rawQqqOi, useNq, qqqConversion],
  );
  const qqqSeries = useMemo(
    () => (useNq && qqqConversion ? convertSeries(s.spotHistory.QQQ, qqqConversion) : s.spotHistory.QQQ),
    [s.spotHistory.QQQ, useNq, qqqConversion],
  );
  const qqqZg = useMemo(
    () => (useNq && qqqConversion ? convertSeries(s.zgHistory.QQQ, qqqConversion) : s.zgHistory.QQQ),
    [s.zgHistory.QQQ, useNq, qqqConversion],
  );

  const historyKey = `${useNq ? "nq" : "spot"}:${s.historyRevision}`;

  const displayedFeeds = useMemo(() => {
    const feeds: Partial<Record<FeedKey, FeedSnapshot>> = { ...s.feeds };
    for (const [key, value] of [
      ["NDX:state", ndxState],
      ["NDX:gamma", ndxGamma],
      ["NDX:oi", ndxOi],
      ["QQQ:state", qqqState],
      ["QQQ:gamma", qqqGamma],
      ["QQQ:oi", qqqOi],
    ] as const) {
      if (value) feeds[key] = value;
    }
    return feeds;
  }, [s.feeds, ndxState, ndxGamma, ndxOi, qqqState, qqqGamma, qqqOi]);

  // alerts run on the same displayed-unit data the charts show
  useLevelAlerts(
    [
      { label: "NDX", ticker: "NDX", state: ndxState, gamma: ndxGamma, oi: ndxOi },
      { label: "QQQ", ticker: "QQQ", state: qqqState, gamma: qqqGamma, oi: qqqOi },
    ],
    settings,
  );

  return (
    <TooltipProvider>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} width={sidebarWidth}>
        <main className="relative flex min-w-0 flex-1 flex-col">
          <GexChart
            label="NDX"
            unitTag={useNq ? ndxConversion?.futureContract : undefined}
            historyKey={`ndx:${historyKey}`}
            state={ndxState}
            gamma={ndxGamma}
            oi={ndxOi}
            spotSeries={ndxSeries}
            zgSeries={ndxZg}
            settings={settings.tickers.NDX}
          />
          <div className="h-px shrink-0 bg-border" />
          <GexChart
            label="QQQ"
            unitTag={useNq ? qqqConversion?.futureContract : undefined}
            historyKey={`qqq:${historyKey}`}
            state={qqqState}
            gamma={qqqGamma}
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
          feeds={displayedFeeds}
          connected={s.connected}
          mock={s.mock}
          replay={s.replay}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
