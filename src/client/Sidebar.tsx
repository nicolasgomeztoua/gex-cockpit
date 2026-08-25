import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowLeft, Bell, ChevronDown, Home, Pause, Play, Settings, Type } from "lucide-react";
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
import { ensureAudio, playSound } from "./alerts/sounds";
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
import type { FeedKey, FeedSnapshot, ReplayStatus } from "../shared/types";
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

// Notification.permission changes outside React; re-read it per render pass
const notifPermission = () =>
  typeof Notification === "undefined" ? "unsupported" : Notification.permission;
const subscribeNoop = () => () => {};

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

type ReplayAction = "play" | "pause" | "seek" | "speed";

const postReplay = (action: ReplayAction, value?: number) =>
  rpc.api.replay.$post({ json: value === undefined ? { action } : { action, value } });

function Playback({ replay }: { replay: ReplayStatus }) {
  const [sliderClock, setSliderClock] = useState(replay.clock);
  const dragging = useRef(false);
  const latestSeek = useRef(replay.clock);
  const lastPostAt = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dragging.current) {
      setSliderClock(replay.clock);
      latestSeek.current = replay.clock;
    }
  }, [replay.clock]);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const seek = (immediate = false) => {
    const run = () => {
      pending.current = null;
      lastPostAt.current = Date.now();
      void postReplay("seek", latestSeek.current);
    };
    if (immediate) {
      if (pending.current) clearTimeout(pending.current);
      run();
      return;
    }
    const delay = Math.max(0, 250 - (Date.now() - lastPostAt.current));
    if (delay === 0) run();
    else if (!pending.current) pending.current = setTimeout(run, delay);
  };

  const clockLabel = new Date(sliderClock * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <Section title="playback" color="#f59e0b">
      <div className="px-1.5 py-1.5">
        <div className="flex items-center gap-2">
          <button
            data-probe="replay-toggle"
            onClick={() => void postReplay(replay.playing ? "pause" : "play")}
            className="flex size-8 cursor-pointer items-center justify-center rounded border border-amber-500/60 text-amber-400 transition-colors hover:bg-amber-500/10"
            title={replay.playing ? "Pause replay" : "Play replay"}
          >
            {replay.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <span data-probe="replay-clock" className="text-[16px] font-semibold tabular-nums text-foreground">
            {clockLabel}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">ET</span>
        </div>
        <input
          data-probe="replay-seek"
          type="range"
          min={replay.startTs}
          max={replay.endTs}
          step={1}
          value={sliderClock}
          onPointerDown={event => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={() => {
            dragging.current = false;
            seek(true);
          }}
          onChange={event => {
            const value = Number(event.target.value);
            setSliderClock(value);
            latestSeek.current = value;
            seek();
          }}
          className="mt-3 h-1.5 w-full cursor-pointer accent-amber-500"
        />
        <Tabs
          value={String(replay.speed)}
          onValueChange={value => void postReplay("speed", Number(value))}
          className="mt-2"
        >
          <TabsList data-probe="replay-speed" className="w-full">
            {[1, 2, 5, 10, 30].map(value => (
              <TabsTrigger key={value} value={String(value)}>
                {value}x
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
}

export function Sidebar({ settings, onChange, feeds, connected, mock, replay }: Props) {
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

  const permission = useSyncExternalStore(subscribeNoop, notifPermission, notifPermission);
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
                REPLAY {replay.date}
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
            <Section title="state" color={S.callGex}>
              {(() => {
                const gamma = feeds[`${scope}:gamma`];
                const profile = feeds[`${scope}:state`];
                if (!gamma && !profile)
                  return <div className="px-1.5 text-[12px] text-muted-foreground/60">waiting…</div>;
                return (
                  <>
                    {gamma && (
                      <>
                        <div className="flex items-baseline px-1.5 py-[3px] text-[13px] tabular-nums">
                          <span style={{ color: S.longGamma }}>major long gamma</span>
                          <span className="ml-auto text-foreground">{fmtPrice(gamma.majors.posVol)}</span>
                        </div>
                        <div className="flex items-baseline px-1.5 py-[3px] text-[13px] tabular-nums">
                          <span style={{ color: S.shortGamma }}>major short gamma</span>
                          <span className="ml-auto text-foreground">{fmtPrice(gamma.majors.negVol)}</span>
                        </div>
                        <div className="px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Options profile · gamma · {gamma.aggregation === "one" ? "next" : "latest"}
                        </div>
                      </>
                    )}
                    {profile && (
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

            {replay && <Playback replay={replay} />}
          </>
        )}

        {view === "settings" && (
          <>
            <Section title="state" color={S.longGamma}>
              <div className="px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Options profile · gamma
              </div>
              {stateKeys.filter(k => k === "mlg" || k === "msg").map(k => (
                <LevelRow key={k} levelKey={k} cfg={ts.levels[k]} onChange={p => setLevel(k, p)} />
              ))}
              <Row
                label="Call / put IVOL (dots)"
                color={S.longGamma}
                on={ts.gammaBars}
                onChange={v => setTicker({ gammaBars: v })}
              />
              <div className="mt-1 px-1.5 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                GEX profile
              </div>
              {stateKeys.filter(k => k === "mcg" || k === "mpg").map(k => (
                <LevelRow key={k} levelKey={k} cfg={ts.levels[k]} onChange={p => setLevel(k, p)} />
              ))}
              <Row
                label="GEX Profile (bars)"
                color={S.callGex}
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
                if (v) {
                  ensureAudio();
                  if (typeof Notification !== "undefined" && Notification.permission === "default") {
                    void Notification.requestPermission();
                  }
                }
                setAlerts({ enabled: v });
              }}
            />
            {settings.alerts.enabled && (
              <>
                <Field label="trigger">
                  <Tabs
                    className="flex-1"
                    value={settings.alerts.mode}
                    onValueChange={v => setAlerts({ mode: v as LayerSettings["alerts"]["mode"] })}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="approach">near</TabsTrigger>
                      <TabsTrigger value="cross">cross</TabsTrigger>
                      <TabsTrigger value="both">both</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                {settings.alerts.mode !== "cross" && (
                  <Field label="distance">
                    <Input
                      type="number"
                      min={0}
                      step={settings.alerts.distanceUnit === "percent" ? 0.01 : 1}
                      value={settings.alerts.distance}
                      onChange={e => setAlerts({ distance: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-16"
                    />
                    <Tabs
                      className="flex-1"
                      value={settings.alerts.distanceUnit}
                      onValueChange={v =>
                        setAlerts({ distanceUnit: v as LayerSettings["alerts"]["distanceUnit"] })
                      }
                    >
                      <TabsList className="w-full">
                        <TabsTrigger value="points">pts</TabsTrigger>
                        <TabsTrigger value="percent">%</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Field>
                )}
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
                      <TabsTrigger value="repeat3">3×</TabsTrigger>
                      <TabsTrigger value="untilFocus">focus</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </Field>
                <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/50">
                  3× repeats like TradingView; focus renotifies until this window is refocused
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
                  {settings.alerts.sound !== "off" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            ensureAudio();
                            playSound(settings.alerts.sound);
                          }}
                          className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        >
                          <Play className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Preview sound</TooltipContent>
                    </Tooltip>
                  )}
                </Field>
                <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
                  notifications: {permission}
                  {permission === "denied" && " — enable in browser settings"}
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
      </SidebarFooter>
    </SidebarRoot>
  );
}
