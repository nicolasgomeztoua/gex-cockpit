import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  ChevronDown,
  FastForward,
  History,
  Home,
  Pause,
  Play,
  Radio,
  Rewind,
  Settings,
  SkipBack,
  SkipForward,
  Type,
} from "lucide-react";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarSeparator,
  SidebarTrigger,
} from "./components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible";
import { Switch } from "./components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Input } from "./components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { rpc } from "./api";
import { AlertStatus } from "./alerts/AlertStatus";
import { SIDEBAR_MAX_W, SIDEBAR_MIN_W, useUiStore } from "./stores/uiStore";
import {
  GEXBOT,
  LEVEL_KEYS,
  LEVEL_META,
  type LayerSettings,
  type LevelConfig,
  type LevelKey,
  type TickerKey,
  type TickerSettings,
} from "./theme";
import type { FeedKey, FeedSnapshot, ReplaySession, ReplayStatus } from "../shared/types";
import { etDate } from "../shared/session";
import { cn } from "./lib/utils";

const fmtPrice = (v: number) =>
  Math.abs(v) >= 3000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);

const fmtDateET = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York" });

const fmtTimeET = (sec: number) =>
  new Date(sec * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

function Section(props: { title: string; color: string; children: ReactNode }) {
  return (
    <Collapsible defaultOpen className="group/section">
      <SidebarGroup>
        <CollapsibleTrigger className="w-full cursor-pointer">
          <SidebarGroupLabel className="justify-between hover:brightness-125" style={{ color: props.color }}>
            {props.title}
            <ChevronDown className="size-3.5 transition-transform group-data-[state=closed]/section:-rotate-90" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <SidebarSeparator className="mb-1" />
        <CollapsibleContent>{props.children}</CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function IconButton(props: {
  tip: string;
  probe?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          data-probe={props.probe}
          onClick={props.onClick}
          className="flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          {props.children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{props.tip}</TooltipContent>
    </Tooltip>
  );
}

function MiniToggle(props: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  tip: string;
  probe: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          data-probe={props.probe}
          disabled={props.disabled}
          onClick={props.onToggle}
          className={cn(
            "flex size-5 items-center justify-center rounded transition-colors",
            props.disabled
              ? "cursor-not-allowed text-muted-foreground/20"
              : props.on
                ? "cursor-pointer text-primary"
                : "cursor-pointer text-muted-foreground/40 hover:text-muted-foreground",
          )}
        >
          {props.children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{props.tip}</TooltipContent>
    </Tooltip>
  );
}

function LevelRow(props: {
  levelKey: LevelKey;
  cfg: LevelConfig;
  onChange: (patch: Partial<LevelConfig>) => void;
}) {
  const meta = LEVEL_META[props.levelKey];
  return (
    <div
      data-level={props.levelKey}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-[5px] hover:bg-sidebar-accent/60"
    >
      <span className="flex-1 text-[13px]" style={{ color: meta.color }}>
        {meta.name}
      </span>
      <span
        className="size-[13px] shrink-0 rounded-[4px] border border-white/20"
        style={{ background: meta.color }}
      />
      <MiniToggle
        on={props.cfg.label && props.cfg.line}
        disabled={!props.cfg.line}
        onToggle={() => props.onChange({ label: !props.cfg.label })}
        tip={props.cfg.line ? "Show name tag on the chart line" : "Enable the line to show its tag"}
        probe="label"
      >
        <Type className="size-3.5" />
      </MiniToggle>
      <MiniToggle
        on={props.cfg.alert}
        onToggle={() => props.onChange({ alert: !props.cfg.alert })}
        tip="Alert when spot reaches this level (even if the line is hidden)"
        probe="alert"
      >
        <Bell className="size-3.5" />
      </MiniToggle>
      <Switch
        className="ml-1"
        checked={props.cfg.line}
        onCheckedChange={line => props.onChange({ line })}
      />
    </div>
  );
}

function Row(props: { label: string; color?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-[5px] hover:bg-sidebar-accent/60">
      <span className="flex-1 text-[13px]" style={{ color: props.color ?? GEXBOT.text }}>
        {props.label}
      </span>
      {props.color && (
        <span
          className="size-[13px] shrink-0 rounded-[4px] border border-white/20"
          style={{ background: props.color }}
        />
      )}
      <Switch checked={props.on} onCheckedChange={props.onChange} />
    </label>
  );
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1.5 py-1">
      <span className="w-20 shrink-0 text-[12px] text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  );
}

type ReplayAction = "start" | "stop" | "play" | "pause" | "seek" | "speed";

const postReplay = (action: ReplayAction, options?: { value?: number; date?: string }) =>
  rpc.api.replay.$post({ json: { action, ...options } });

function HistoryPanel({
  replay,
  liveHistory,
}: {
  replay: ReplayStatus | null;
  liveHistory: [number, number][];
}) {
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sliderClock, setSliderClock] = useState(0);
  const dragging = useRef(false);
  const latestSeek = useRef(0);
  const lastPostAt = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activating = useRef(false);
  const seekInFlight = useRef(false);
  const queuedSeek = useRef<number | null>(null);
  const lastReplayPosition = useRef<{ date: string; clock: number } | null>(null);
  const today = etDate(Math.floor(Date.now() / 1_000));
  const loadedStart = liveHistory[0]?.[0] ?? null;
  const loadedEnd = liveHistory.at(-1)?.[0] ?? null;
  const loadedDate = loadedStart === null ? "" : etDate(loadedStart);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void rpc.api.replay.$get()
        .then(async response => {
          const payload = await response.json();
          if (cancelled) return;
          setSessions(payload.sessions);
          setSelected(current =>
            current && payload.sessions.some(session => session.date === current)
              ? current
              : payload.sessions.at(-1)?.date ?? "",
          );
          setError("");
        })
        .catch(reason => {
          if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (replay?.date) setSelected(replay.date);
  }, [replay?.date]);

  useEffect(() => {
    if (replay) lastReplayPosition.current = { date: replay.date, clock: replay.clock };
  }, [replay?.date, replay?.clock]);

  const selectedSession = sessions.find(session => session.date === selected);
  const selectedEnd = selectedSession?.endTs ?? 0;
  const loadedSessionSelected = !replay
    && loadedStart !== null
    && loadedEnd !== null
    && selected === loadedDate
    && selectedSession !== undefined;
  const seekRange = replay
    ? { startTs: replay.startTs, endTs: replay.endTs }
    : loadedSessionSelected
      ? { startTs: loadedStart, endTs: loadedEnd }
      : null;
  const displayClock = replay?.clock ?? loadedEnd ?? selectedEnd;

  useEffect(() => {
    if (!dragging.current && !activating.current) {
      setSliderClock(displayClock);
      latestSeek.current = displayClock;
    }
  }, [displayClock]);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const loadHistory = async (
    initialClock?: number,
    showBusy = true,
  ): Promise<ReplayStatus | null> => {
    if (!selected || busy) return null;
    if (showBusy) setBusy(true);
    setError("");
    try {
      const response = await postReplay("start", { date: selected, value: initialClock });
      const payload = await response.json();
      if (!response.ok) {
        setError("error" in payload ? payload.error : "Could not load history");
        return null;
      }
      return "replay" in payload ? payload.replay : null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      if (showBusy) setBusy(false);
    }
  };

  const flushSeek = async () => {
    if (seekInFlight.current || queuedSeek.current === null) return;
    seekInFlight.current = true;
    const value = queuedSeek.current;
    queuedSeek.current = null;
    lastPostAt.current = Date.now();
    try {
      const response = await postReplay("seek", { value });
      if (!response.ok) {
        const payload = await response.json();
        setError("error" in payload ? payload.error : "Could not seek history");
        queuedSeek.current = null;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      queuedSeek.current = null;
    } finally {
      seekInFlight.current = false;
      if (queuedSeek.current !== null && !pending.current) {
        const delay = Math.max(0, 50 - (Date.now() - lastPostAt.current));
        if (delay === 0) void flushSeek();
        else {
          pending.current = setTimeout(() => {
            pending.current = null;
            void flushSeek();
          }, delay);
        }
      }
    }
  };

  const queueSeek = (value: number, immediate: boolean) => {
    queuedSeek.current = value;
    if (seekInFlight.current) return;
    if (immediate) {
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
      void flushSeek();
      return;
    }
    const delay = Math.max(0, 50 - (Date.now() - lastPostAt.current));
    if (delay === 0) void flushSeek();
    else if (!pending.current) {
      pending.current = setTimeout(() => {
        pending.current = null;
        void flushSeek();
      }, delay);
    }
  };

  const activateAndSeek = async (value: number) => {
    latestSeek.current = value;
    if (replay) {
      const bounded = Math.min(replay.endTs, Math.max(replay.startTs, value));
      setSliderClock(bounded);
      latestSeek.current = bounded;
      queueSeek(bounded, false);
      return;
    }
    if (!loadedSessionSelected || activating.current) return;
    activating.current = true;
    const active = await loadHistory(value, false);
    if (!active) {
      activating.current = false;
      return;
    }
    const bounded = Math.min(active.endTs, Math.max(active.startTs, latestSeek.current));
    setSliderClock(bounded);
    latestSeek.current = bounded;
    activating.current = false;
    if (bounded !== active.clock) queueSeek(bounded, true);
  };

  const seek = (immediate = false) => {
    if (!replay) {
      if (immediate && loadedSessionSelected) void activateAndSeek(latestSeek.current);
      return;
    }
    queueSeek(latestSeek.current, immediate);
  };

  const seekTo = (value: number) => {
    if (!seekRange) return;
    const bounded = Math.min(seekRange.endTs, Math.max(seekRange.startTs, value));
    setSliderClock(bounded);
    latestSeek.current = bounded;
    if (replay) seek(true);
    else void activateAndSeek(bounded);
  };

  const returnToLive = async () => {
    if (!replay?.returnToLive || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await postReplay("stop");
      const payload = await response.json();
      if (!response.ok) setError("error" in payload ? payload.error : "Could not return to live mode");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = async () => {
    if (replay) {
      await returnToLive();
      return;
    }
    const last = lastReplayPosition.current;
    await loadHistory(last?.date === selected ? last.clock : undefined);
  };

  const clockLabel = sliderClock > 0 ? new Date(sliderClock * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) : "—";

  const controlClass =
    "flex size-8 items-center justify-center rounded text-foreground transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-muted-foreground/25 disabled:hover:bg-transparent";

  return (
    <Section title="history" color="#9ec5f8">
      <div className="px-1.5 py-1.5">
        {loading ? (
          <div className="text-[12px] text-muted-foreground/60">loading recorded RTH sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="text-[12px] text-muted-foreground/60">No recorded RTH sessions yet.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              data-probe="replay-start"
              disabled={!selected || busy}
              onClick={() => void loadHistory()}
              className="flex cursor-pointer items-center justify-center gap-2 rounded bg-[#9ec5f8] px-2 py-2 text-[13px] font-medium text-black transition-colors hover:bg-[#b4d3fa] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <History className="size-4" />
              {busy && !replay ? "loading…" : "load history"}
            </button>
            <label className="relative flex items-center rounded-full bg-white/10 text-foreground">
              <CalendarDays className="pointer-events-none ml-3 size-4" />
              <select
                data-probe="replay-date"
                value={selected}
                onChange={event => setSelected(event.target.value)}
                className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent px-2 py-2 text-center text-[13px] outline-none"
              >
                {[...sessions].reverse().map(session => (
                  <option key={session.date} value={session.date} className="bg-black">
                    {session.date === today ? "Today" : fmtDateET(session.startTs)}
                  </option>
                ))}
              </select>
            </label>
            <button
              data-probe="replay-stop"
              disabled={!replay?.returnToLive || busy}
              onClick={() => void returnToLive()}
              className="col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded bg-[#9ec5f8] px-2 py-2 text-[13px] font-medium text-black transition-colors hover:bg-[#b4d3fa] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeft className="size-4" />
              return to live
            </button>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 tabular-nums">
          <button
            type="button"
            data-probe="replay-mode-toggle"
            disabled={busy || (replay ? !replay.returnToLive : !selected)}
            onClick={() => void switchMode()}
            aria-pressed={!!replay}
            aria-label={replay ? "Return to live mode" : "Switch to replay mode"}
            title={
              replay
                ? replay.returnToLive
                  ? "Return to live"
                  : "Startup replay cannot return to live"
                : "Switch to replay"
            }
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-35",
              replay
                ? "bg-amber-400/15 text-amber-400 hover:bg-amber-400/25"
                : "bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/25",
            )}
          >
            <Radio className="size-4" />
          </button>
          <select
            data-probe="replay-speed"
            disabled={!replay}
            value={String(replay?.speed ?? 1)}
            onChange={event => void postReplay("speed", { value: Number(event.target.value) })}
            className="cursor-pointer bg-transparent text-[13px] text-foreground outline-none disabled:cursor-default"
          >
            {[1, 2, 5, 10, 30].map(value => (
              <option key={value} value={value} className="bg-black">{value}x</option>
            ))}
          </select>
          <span data-probe="replay-clock" className="text-[15px] font-semibold text-foreground">
            {clockLabel}
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground">ET</span>
        </div>

        <input
          data-probe="replay-seek"
          type="range"
          min={seekRange?.startTs ?? selectedSession?.startTs ?? 0}
          max={(seekRange?.endTs ?? selectedEnd) || 1}
          step={0.05}
          value={sliderClock}
          disabled={!seekRange || busy}
          onPointerDown={event => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={() => {
            dragging.current = false;
            seek(true);
          }}
          onKeyUp={event => {
            if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
              seek(true);
            }
          }}
          onChange={event => {
            const value = Number(event.target.value);
            setSliderClock(value);
            latestSeek.current = value;
            if (replay) seek();
            else if (loadedSessionSelected) void activateAndSeek(value);
          }}
          className="mt-3 h-1.5 w-full cursor-pointer accent-[#9ec5f8] disabled:cursor-default disabled:opacity-60"
        />

        <div className="mt-2 flex items-center justify-between">
          <button
            disabled={!seekRange || busy}
            onClick={() => seekRange && seekTo(seekRange.startTs)}
            className={controlClass}
            title="Start of loaded history"
          >
            <SkipBack className="size-4" />
          </button>
          <button
            disabled={!seekRange || busy}
            onClick={() => seekTo(sliderClock - 60)}
            className={controlClass}
            title="Back 1 minute"
          >
            <Rewind className="size-4" />
          </button>
          <button
            data-probe="replay-toggle"
            disabled={!replay}
            onClick={() => replay && void postReplay(replay.playing ? "pause" : "play")}
            className={controlClass}
            title={replay?.playing ? "Pause history" : "Play history"}
          >
            {replay?.playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
          <button
            disabled={!replay}
            onClick={() => seekTo(sliderClock + 60)}
            className={controlClass}
            title="Forward 1 minute"
          >
            <FastForward className="size-4" />
          </button>
          <button
            disabled={!replay}
            onClick={() => replay && seekTo(replay.endTs)}
            className={controlClass}
            title="Latest loaded history"
          >
            <SkipForward className="size-4" />
          </button>
        </div>

        <div className="mt-1 text-center text-[10px] text-muted-foreground">
          {replay ? "history loaded · live recording continues" : "live · current RTH ready to scrub"}
        </div>
        {error && <div className="mt-2 text-[11px] text-red-400">{error}</div>}
      </div>
    </Section>
  );
}

/** Left-edge drag strip: resizes the sidebar (persisted). */
function ResizeHandle() {
  const setSidebarWidth = useUiStore(u => u.setSidebarWidth);
  const setResizing = useUiStore(u => u.setResizing);
  return (
    <div
      data-slot="sidebar-resize"
      className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
      onPointerDown={e => {
        e.preventDefault();
        setResizing(true);
        const onMove = (ev: PointerEvent) => setSidebarWidth(window.innerWidth - ev.clientX);
        const onUp = () => {
          setResizing(false);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
      title={`drag to resize (${SIDEBAR_MIN_W}–${SIDEBAR_MAX_W}px)`}
    />
  );
}

interface Props {
  settings: LayerSettings;
  onChange: (s: LayerSettings) => void;
  feeds: Partial<Record<FeedKey, FeedSnapshot>>;
  connected: boolean;
  mock: boolean;
  replay: ReplayStatus | null;
  liveHistory: [number, number][];
}

export function Sidebar({ settings, onChange, feeds, connected, mock, replay, liveHistory }: Props) {
  const scope = useUiStore(u => u.scope);
  const setScope = useUiStore(u => u.setScope);
  const view = useUiStore(u => u.sidebarView);
  const setView = useUiStore(u => u.setSidebarView);
  const resizing = useUiStore(u => u.resizing);
  const ts = settings.tickers[scope];

  const set = (patch: Partial<LayerSettings>) => onChange({ ...settings, ...patch });
  const setAlerts = (patch: Partial<LayerSettings["alerts"]>) =>
    onChange({ ...settings, alerts: { ...settings.alerts, ...patch } });
  const setTicker = (patch: Partial<TickerSettings>) =>
    onChange({
      ...settings,
      tickers: { ...settings.tickers, [scope]: { ...ts, ...patch } },
    });
  const setLevel = (key: LevelKey, patch: Partial<LevelConfig>) =>
    setTicker({ levels: { ...ts.levels, [key]: { ...ts.levels[key], ...patch } } });

  const S = GEXBOT.state;
  const C = GEXBOT.classic;
  const stateKeys = LEVEL_KEYS.filter(k => LEVEL_META[k].section === "state");
  const classicKeys = LEVEL_KEYS.filter(k => LEVEL_META[k].section === "classic");

  const title = view === "main" ? "cockpit" : view === "settings" ? "settings" : "notifications";
  const scopeTabs = (
    <Tabs value={scope} onValueChange={v => setScope(v as TickerKey)}>
      <TabsList className="w-full" data-probe="scope">
        <TabsTrigger value="NDX">NDX</TabsTrigger>
        <TabsTrigger value="QQQ">QQQ</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <SidebarRoot side="right" collapsible="offcanvas" className={resizing ? "transition-none" : undefined}>
      <ResizeHandle />
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="text-[20px] font-semibold text-foreground">{title}</span>
          <span className="flex items-center gap-0.5">
            {mock && (
              <span
                className="mr-1 rounded border px-1.5 py-px text-[10px] font-bold tracking-wider"
                style={{ color: C.zeroGamma, borderColor: C.zeroGamma }}
              >
                MOCK
              </span>
            )}
            {replay && (
              <span
                data-probe="replay-badge"
                className="mr-1 rounded border px-1.5 py-px text-[10px] font-bold tracking-wider"
                style={{ color: "#f59e0b", borderColor: "#f59e0b" }}
              >
                REPLAY {replay.date} RTH
              </span>
            )}
            {view === "main" && (
              <IconButton tip="Settings" probe="open-settings" onClick={() => setView("settings")}>
                <Settings className="size-4" />
              </IconButton>
            )}
            {view === "settings" && (
              <>
                <IconButton tip="Notification settings" probe="open-alerts" onClick={() => setView("alerts")}>
                  <Bell className="size-4" />
                </IconButton>
                <IconButton tip="Back to cockpit" probe="go-home" onClick={() => setView("main")}>
                  <Home className="size-4" />
                </IconButton>
              </>
            )}
            {view === "alerts" && (
              <>
                <IconButton tip="Back to settings" probe="go-settings" onClick={() => setView("settings")}>
                  <ArrowLeft className="size-4" />
                </IconButton>
                <IconButton tip="Back to cockpit" probe="go-home" onClick={() => setView("main")}>
                  <Home className="size-4" />
                </IconButton>
              </>
            )}
            <SidebarTrigger />
          </span>
        </div>

        {view === "main" && (
          <>
            <Tabs value={settings.unit} onValueChange={v => set({ unit: v as LayerSettings["unit"] })}>
              <TabsList className="w-full">
                <TabsTrigger value="spot">spot price</TabsTrigger>
                <TabsTrigger value="nq">nq future</TabsTrigger>
              </TabsList>
            </Tabs>
            {scopeTabs}
            <Tabs
              value={ts.chartType}
              onValueChange={v => setTicker({ chartType: v as TickerSettings["chartType"] })}
            >
              <TabsList className="w-full">
                <TabsTrigger value="line">Line</TabsTrigger>
                <TabsTrigger value="candles">Candles</TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        )}
        {view === "settings" && scopeTabs}
      </SidebarHeader>

      <SidebarContent>
        {view === "main" && (
          <>
            <Section title="convexity" color={S.convexityPositive}>
              {(() => {
                const gamma = feeds[`${scope}:gamma`];
                const profile = feeds[`${scope}:state`];
                if (!gamma)
                  return (
                    <div className="px-1.5 text-[12px] text-muted-foreground/60">
                      {replay ? "waiting for first RTH convexity snapshot…" : "restoring last convexity snapshot…"}
                    </div>
                  );
                return (
                  <>
                    {gamma && (
                      <>
                        <div className="flex items-baseline px-1.5 py-[3px] text-[13px] tabular-nums">
                          <span style={{ color: S.convexityPositive }}>major long gamma</span>
                          <span className="ml-auto text-foreground">{fmtPrice(gamma.majors.posVol)}</span>
                        </div>
                        <div className="flex items-baseline px-1.5 py-[3px] text-[13px] tabular-nums">
                          <span style={{ color: S.convexityNegative }}>major short gamma</span>
                          <span className="ml-auto text-foreground">{fmtPrice(gamma.majors.negVol)}</span>
                        </div>
                        <div className="px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Options profile · gamma · {gamma.aggregation === "one" ? "next" : "latest"}
                        </div>
                      </>
                    )}
                    {profile && ts.stateBars && (
                      <div className="px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        GEX profile bars · {profile.aggregation === "zero" ? "latest" : profile.aggregation === "one" ? "next" : "90d"}
                      </div>
                    )}
                  </>
                );
              })()}
            </Section>

            <Section title="update" color={C.zeroGamma}>
              {(["NDX", "QQQ"] as const).map(t => {
                const snap = feeds[`${t}:state`] ?? feeds[`${t}:oi`];
                return (
                  <div key={t} className="flex items-baseline gap-2 px-1.5 py-[3px] text-[12px] tabular-nums">
                    <span className="w-10 font-semibold text-foreground">{t}</span>
                    {snap ? (
                      <>
                        <span className="text-muted-foreground">{fmtDateET(snap.providerTs)}</span>
                        <span className="text-muted-foreground">{fmtTimeET(snap.providerTs)}</span>
                        <span className="ml-auto text-foreground">{fmtPrice(snap.spot)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">waiting…</span>
                    )}
                  </div>
                );
              })}
            </Section>

            <HistoryPanel replay={replay} liveHistory={liveHistory} />
          </>
        )}

        {view === "settings" && (
          <>
            <Section title="state" color={S.convexityPositive}>
              <div className="px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Convexity · Options profile gamma
              </div>
              {stateKeys.filter(k => k === "mlg" || k === "msg").map(k => (
                <LevelRow key={k} levelKey={k} cfg={ts.levels[k]} onChange={p => setLevel(k, p)} />
              ))}
              <Row
                label="Convexity bars + IVOL dots"
                color={S.convexityPositive}
                on={ts.gammaBars}
                onChange={v => setTicker({ gammaBars: v })}
              />
              <div className="mt-1 px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                State GEX profile · optional
              </div>
              {stateKeys.filter(k => k === "mcg" || k === "mpg").map(k => (
                <LevelRow key={k} levelKey={k} cfg={ts.levels[k]} onChange={p => setLevel(k, p)} />
              ))}
              <Row
                label="State GEX profile (bars)"
                color={S.gexPositive}
                on={ts.stateBars}
                onChange={v => setTicker({ stateBars: v })}
              />
            </Section>

            <Section title="classic" color={C.majorPosVol}>
              {classicKeys.map(k => (
                <LevelRow key={k} levelKey={k} cfg={ts.levels[k]} onChange={p => setLevel(k, p)} />
              ))}
              <Row
                label="GEX by Volume (bars)"
                color={C.posGexVol}
                on={ts.volBars}
                onChange={v => setTicker({ volBars: v })}
              />
              <Row
                label="GEX by OI (bars)"
                color={C.posGexOI}
                on={ts.oiBars}
                onChange={v => setTicker({ oiBars: v })}
              />
            </Section>

            <Section title="chart" color={C.zeroGamma}>
              {(ts.stateBars || ts.gammaBars || ts.volBars || ts.oiBars) && (
                <Row
                  label="Priors on hover (1–30m)"
                  color={C.priors[2]}
                  on={ts.priors}
                  onChange={v => setTicker({ priors: v })}
                />
              )}
              <Row label="Price Axis Labels" on={ts.axisLabels} onChange={v => setTicker({ axisLabels: v })} />
            </Section>
          </>
        )}

        {view === "alerts" && (
          <Section title="level alerts" color={GEXBOT.accentBlue}>
            <Row
              label="Level Alerts"
              on={settings.alerts.enabled}
              onChange={v => {
                setAlerts({ enabled: v });
              }}
            />
            <AlertStatus />
            {settings.alerts.enabled && (
              <>
                <div className="px-1.5 py-1 text-[12px] text-muted-foreground">
                  Alert when price touches a selected level. Passing through it between price updates counts too.
                </div>
                <Field label="cooldown">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={Math.round(settings.alerts.cooldownSec / 60)}
                    onChange={e =>
                      setAlerts({ cooldownSec: Math.max(0, Number(e.target.value) || 0) * 60 })
                    }
                    className="w-16"
                  />
                  <span className="text-[12px] text-muted-foreground">min</span>
                </Field>
                <Field label="notify">
                  <Tabs
                    className="flex-1"
                    value={settings.alerts.notify}
                    onValueChange={v => setAlerts({ notify: v as LayerSettings["alerts"]["notify"] })}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="once">once</TabsTrigger>
                      <TabsTrigger value="untilFocus">until refocus</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/50">
                  Until refocus repeats every 25 seconds, with no time limit.
                </div>
                <Field label="sound">
                  <Tabs
                    className="flex-1"
                    value={settings.alerts.sound}
                    onValueChange={v => setAlerts({ sound: v as LayerSettings["alerts"]["sound"] })}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="off">off</TabsTrigger>
                      <TabsTrigger value="ping">ping</TabsTrigger>
                      <TabsTrigger value="chime">chime</TabsTrigger>
                      <TabsTrigger value="blip">blip</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
                  Alerts run on this Mac even with the browser closed. Keep the Mac awake and the backend running.
                  Allow Script Editor notifications in macOS settings.
                </div>
                <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/50">
                  pick levels per ticker with the <Bell className="inline size-3" /> icon in settings
                </div>
              </>
            )}
          </Section>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <span
            className="inline-block size-1.5 rounded-full"
            style={{ background: connected ? S.candleUp : S.candleDown }}
          />
          {connected ? "stream connected" : "stream disconnected"}
        </div>
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:underline"
        >
          TradingView Lightweight Charts™<br />
          Copyright (с) 2025 TradingView, Inc.
        </a>
      </SidebarFooter>
    </SidebarRoot>
  );
}
