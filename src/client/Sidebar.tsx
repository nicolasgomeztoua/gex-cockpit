import { useSyncExternalStore, type ReactNode } from "react";
import { Bell, ChevronDown, Play, Type } from "lucide-react";
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
import { ensureAudio, playSound } from "./alerts/sounds";
import {
  GEXBOT,
  LEVEL_KEYS,
  LEVEL_META,
  type LayerSettings,
  type LevelConfig,
  type LevelKey,
} from "./theme";
import type { FeedKey, FeedSnapshot } from "../shared/types";
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

function MiniToggle(props: {
  on: boolean;
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
          onClick={props.onToggle}
          className={cn(
            "flex size-5 cursor-pointer items-center justify-center rounded transition-colors",
            props.on ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground",
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
        on={props.cfg.label}
        onToggle={() => props.onChange({ label: !props.cfg.label })}
        tip="Show name tag on the chart line"
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

interface Props {
  settings: LayerSettings;
  onChange: (s: LayerSettings) => void;
  feeds: Partial<Record<FeedKey, FeedSnapshot>>;
  connected: boolean;
  mock: boolean;
}

export function Sidebar({ settings, onChange, feeds, connected, mock }: Props) {
  const set = (patch: Partial<LayerSettings>) => onChange({ ...settings, ...patch });
  const setAlerts = (patch: Partial<LayerSettings["alerts"]>) =>
    onChange({ ...settings, alerts: { ...settings.alerts, ...patch } });
  const setLevel = (key: LevelKey, patch: Partial<LevelConfig>) =>
    onChange({
      ...settings,
      levels: { ...settings.levels, [key]: { ...settings.levels[key], ...patch } },
    });

  const permission = useSyncExternalStore(subscribeNoop, notifPermission, notifPermission);
  const S = GEXBOT.state;
  const C = GEXBOT.classic;
  const stateKeys = LEVEL_KEYS.filter(k => LEVEL_META[k].section === "state");
  const classicKeys = LEVEL_KEYS.filter(k => LEVEL_META[k].section === "classic");

  return (
    <SidebarRoot side="right" collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center justify-between">
          <span className="text-[20px] font-semibold text-foreground">cockpit</span>
          <span className="flex items-center gap-1">
            {mock && (
              <span
                className="rounded border px-1.5 py-px text-[10px] font-bold tracking-wider"
                style={{ color: C.zeroGamma, borderColor: C.zeroGamma }}
              >
                MOCK
              </span>
            )}
            <SidebarTrigger />
          </span>
        </div>
        <Tabs value={settings.unit} onValueChange={v => set({ unit: v as LayerSettings["unit"] })}>
          <TabsList className="w-full">
            <TabsTrigger value="spot">spot price</TabsTrigger>
            <TabsTrigger value="nq">nq future</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs
          value={settings.chartType}
          onValueChange={v => set({ chartType: v as LayerSettings["chartType"] })}
        >
          <TabsList className="w-full">
            <TabsTrigger value="line">Line</TabsTrigger>
            <TabsTrigger value="candles">Candles</TabsTrigger>
          </TabsList>
        </Tabs>
      </SidebarHeader>

      <SidebarContent>
        <Section title="state" color={S.longGamma}>
          {stateKeys.map(k => (
            <LevelRow key={k} levelKey={k} cfg={settings.levels[k]} onChange={p => setLevel(k, p)} />
          ))}
          <Row
            label="State Gamma (bars)"
            color={S.shortGamma}
            on={settings.stateBars}
            onChange={v => set({ stateBars: v })}
          />
        </Section>

        <Section title="classic" color={C.majorPosVol}>
          {classicKeys.map(k => (
            <LevelRow key={k} levelKey={k} cfg={settings.levels[k]} onChange={p => setLevel(k, p)} />
          ))}
          <Row
            label="GEX by Volume (bars)"
            color={C.posGexVol}
            on={settings.volBars}
            onChange={v => set({ volBars: v })}
          />
          <Row
            label="GEX by OI (bars)"
            color={C.posGexOI}
            on={settings.oiBars}
            onChange={v => set({ oiBars: v })}
          />
        </Section>

        <Section title="chart" color={C.zeroGamma}>
          <Row label="Priors (1–30m dots)" color={C.priors[2]} on={settings.priors} onChange={v => set({ priors: v })} />
          <Row label="Price Axis Labels" on={settings.axisLabels} onChange={v => set({ axisLabels: v })} />
        </Section>

        <Section title="alerts" color={GEXBOT.accentBlue}>
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
              </Field>
              <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
                notifications: {permission}
                {permission === "denied" && " — enable in browser settings"}
              </div>
              <div className="px-1.5 py-0.5 text-[11px] text-muted-foreground/50">
                pick levels with the <Bell className="inline size-3" /> icon on each row
              </div>
            </>
          )}
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
