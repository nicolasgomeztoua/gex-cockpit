import { useEffect, useState } from "react";
import { Switch } from "./components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Button } from "./components/ui/button";
import { GEXBOT, DEFAULT_SETTINGS, type LayerSettings } from "./theme";
import type { FeedSnapshot } from "../shared/types";

const fmtPrice = (v: number) =>
  Math.abs(v) >= 3000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2);

const fmtDelta = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 3000 ? Math.round(a).toLocaleString("en-US") : a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return (v < 0 ? "−" : "+") + s;
};

const fmtClockET = (sec: number) =>
  new Date(sec * 1000).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

const fmtDateET = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  });

// ---------------------------------------------------------------------------

export interface TickerRowData {
  label: string;
  unitTag?: string;
  state?: FeedSnapshot;
  oi?: FeedSnapshot;
  spotSeries: [number, number][];
}

interface Props {
  settings: LayerSettings;
  onChange: (s: LayerSettings) => void;
  rows: TickerRowData[];
  connected: boolean;
  mock: boolean;
}

const STATE_KEYS = ["stateBars", "majorLongGamma", "majorShortGamma"] as const;
const CLASSIC_KEYS = [
  "zeroGamma",
  "majorPosVol",
  "majorNegVol",
  "majorPosOI",
  "majorNegOI",
  "volBars",
  "oiBars",
] as const;

// ---------------------------------------------------------------------------

function LayerRow(props: { label: string; color?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-[5px] hover:bg-accent/60">
      <span
        className="size-[9px] shrink-0 rounded-full"
        style={{ background: props.color ?? GEXBOT.textFaint, opacity: props.on ? 1 : 0.3 }}
      />
      <span
        className="flex-1 text-[12.5px] transition-opacity"
        style={{ color: props.color ?? GEXBOT.text, opacity: props.on ? 1 : 0.45 }}
      >
        {props.label}
      </span>
      <Switch checked={props.on} onCheckedChange={props.onChange} />
    </label>
  );
}

function Section(props: {
  title: string;
  color: string;
  allOn: boolean;
  onToggleAll: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-lg border border-border/70 bg-black/40 pb-1">
      <div className="flex items-center justify-between px-2 pt-1.5 pb-1">
        <span className="text-[12px] font-semibold lowercase tracking-wide" style={{ color: props.color }}>
          {props.title}
        </span>
        <Switch checked={props.allOn} onCheckedChange={props.onToggleAll} />
      </div>
      {props.children}
    </div>
  );
}

function TickerCard({ row }: { row: TickerRowData }) {
  const { state, oi } = row;
  const latest = [state, oi].filter(Boolean).sort((a, b) => b!.providerTs - a!.providerTs)[0];
  const spot = latest?.spot;
  const open = row.spotSeries.length ? row.spotSeries[0][1] : undefined;
  const delta = spot !== undefined && open ? spot - open : undefined;
  const pct = delta !== undefined && open ? (delta / open) * 100 : undefined;

  const hasError = state?.status === "error" || oi?.status === "error";
  const age = latest ? Date.now() / 1000 - latest.providerTs : Infinity;
  const dot = hasError
    ? GEXBOT.state.candleDown
    : age < 150
      ? GEXBOT.state.candleUp
      : age < 1800
        ? GEXBOT.classic.zeroGamma
        : GEXBOT.textFaint;

  const levels: { name: string; color: string; value: number }[] = [];
  if (oi?.majors.zeroGamma) levels.push({ name: "zero γ", color: GEXBOT.classic.zeroGamma, value: oi.majors.zeroGamma });
  if (state?.majors.posVol) levels.push({ name: "+γ wall", color: GEXBOT.state.longGamma, value: state.majors.posVol });
  if (state?.majors.negVol) levels.push({ name: "−γ wall", color: GEXBOT.state.shortGamma, value: state.majors.negVol });

  return (
    <div className="mt-2 rounded-lg border border-border/70 bg-black/40 px-2.5 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[14px] font-bold text-foreground">{row.label}</span>
        {row.unitTag && (
          <span className="text-[9px] font-semibold uppercase" style={{ color: GEXBOT.classic.zeroGamma }}>
            {row.unitTag}
          </span>
        )}
        <span className="ml-auto inline-block size-1.5 rounded-full" style={{ background: dot }} />
      </div>
      {spot !== undefined ? (
        <>
          <div className="mt-0.5 flex items-baseline gap-2 tabular-nums">
            <span className="text-[19px] font-semibold text-foreground">{fmtPrice(spot)}</span>
            {delta !== undefined && (
              <span
                className="text-[11.5px]"
                style={{ color: delta >= 0 ? GEXBOT.state.candleUp : GEXBOT.state.candleDown }}
              >
                {fmtDelta(delta)}
                {pct !== undefined && ` (${fmtDelta(pct)}%)`}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
            {latest && `${fmtDateET(latest.providerTs)} · ${fmtClockET(latest.providerTs)} ET`}
          </div>
          {levels.length > 0 && (
            <div className="mt-1.5 space-y-px border-t border-border/60 pt-1.5">
              {levels.map(l => (
                <div key={l.name} className="flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span className="size-[7px] rounded-full" style={{ background: l.color }} />
                  <span style={{ color: l.color }}>{l.name}</span>
                  <span className="ml-auto text-foreground">{fmtPrice(l.value)}</span>
                  <span className="w-12 text-right text-muted-foreground/70">
                    {spot !== undefined && fmtDelta(l.value - spot)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="py-1 text-[11px] text-muted-foreground/60">waiting for data…</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function Sidebar({ settings, onChange, rows, connected, mock }: Props) {
  const set = (patch: Partial<LayerSettings>) => onChange({ ...settings, ...patch });
  const S = GEXBOT.state;
  const C = GEXBOT.classic;
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);

  // keep ages fresh
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const setAll = (keys: readonly (keyof LayerSettings)[], v: boolean) => {
    const patch: Partial<LayerSettings> = {};
    for (const k of keys) (patch as any)[k] = v;
    set(patch);
  };

  const copyLevels = async () => {
    const lines = rows
      .filter(r => r.state || r.oi)
      .map(r => {
        const parts: string[] = [`${r.label}${r.unitTag ? ` (${r.unitTag})` : ""}`];
        const latest = [r.state, r.oi].filter(Boolean).sort((a, b) => b!.providerTs - a!.providerTs)[0]!;
        parts.push(`spot ${fmtPrice(latest.spot)}`);
        if (r.oi?.majors.zeroGamma) parts.push(`ZG ${fmtPrice(r.oi.majors.zeroGamma)}`);
        if (r.state?.majors.posVol) parts.push(`+γ ${fmtPrice(r.state.majors.posVol)}`);
        if (r.state?.majors.negVol) parts.push(`−γ ${fmtPrice(r.state.majors.negVol)}`);
        if (r.oi?.majors.posVol) parts.push(`+V ${fmtPrice(r.oi.majors.posVol)}`);
        if (r.oi?.majors.negVol) parts.push(`−V ${fmtPrice(r.oi.majors.negVol)}`);
        if (r.oi?.majors.posOI) parts.push(`+OI ${fmtPrice(r.oi.majors.posOI)}`);
        if (r.oi?.majors.negOI) parts.push(`−OI ${fmtPrice(r.oi.majors.negOI)}`);
        return parts.join("  ");
      });
    const latestTs = rows.flatMap(r => [r.state, r.oi]).filter(Boolean)[0]?.providerTs;
    const header = `GEX levels ${latestTs ? `${fmtDateET(latestTs)} ${fmtClockET(latestTs)} ET` : ""}${mock ? " (MOCK)" : ""}`;
    try {
      await navigator.clipboard.writeText([header, ...lines].join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (settings.sidebarCollapsed) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center border-l border-border bg-card py-2">
        <Button variant="ghost" size="icon" title="Expand sidebar" onClick={() => set({ sidebarCollapsed: false })}>
          ◀
        </Button>
        <span
          className="mt-3 text-[10px] font-bold tracking-[0.2em] text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}
        >
          COCKPIT
        </span>
        {mock && (
          <span className="mt-3 size-1.5 rounded-full" style={{ background: C.zeroGamma }} title="Mock data" />
        )}
        <span
          className="mt-auto size-1.5 rounded-full"
          style={{ background: connected ? S.candleUp : S.candleDown }}
          title={connected ? "stream connected" : "stream disconnected"}
        />
      </aside>
    );
  }

  const stateAllOn = STATE_KEYS.every(k => settings[k]);
  const classicAllOn = CLASSIC_KEYS.every(k => settings[k]);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card px-2.5 py-2.5">
      <div className="flex items-center px-1">
        <span className="text-[17px] font-semibold tracking-tight text-foreground">cockpit</span>
        {mock && (
          <span
            className="ml-2 rounded border px-1.5 py-px text-[9px] font-bold tracking-wider"
            style={{ color: C.zeroGamma, borderColor: C.zeroGamma }}
          >
            MOCK
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6"
          title="Collapse sidebar"
          onClick={() => set({ sidebarCollapsed: true })}
        >
          ▶
        </Button>
      </div>

      {rows.map(r => (
        <TickerCard key={r.label} row={r} />
      ))}

      <div className="mt-3 space-y-1.5">
        <Tabs value={settings.unit} onValueChange={v => set({ unit: v as LayerSettings["unit"] })}>
          <TabsList className="w-full">
            <TabsTrigger value="spot">spot price</TabsTrigger>
            <TabsTrigger value="nq">nq future</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={settings.chartType} onValueChange={v => set({ chartType: v as LayerSettings["chartType"] })}>
          <TabsList className="w-full">
            <TabsTrigger value="line">Line</TabsTrigger>
            <TabsTrigger value="candles">Candles</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Section title="state" color={S.longGamma} allOn={stateAllOn} onToggleAll={v => setAll(STATE_KEYS, v)}>
        <LayerRow label="State Gamma (bars)" color={S.shortGamma} on={settings.stateBars} onChange={v => set({ stateBars: v })} />
        <LayerRow label="Major Long Gamma" color={S.longGamma} on={settings.majorLongGamma} onChange={v => set({ majorLongGamma: v })} />
        <LayerRow label="Major Short Gamma" color={S.shortGamma} on={settings.majorShortGamma} onChange={v => set({ majorShortGamma: v })} />
      </Section>

      <Section title="classic" color={C.majorPosVol} allOn={classicAllOn} onToggleAll={v => setAll(CLASSIC_KEYS, v)}>
        <LayerRow label="Zero Gamma" color={C.zeroGamma} on={settings.zeroGamma} onChange={v => set({ zeroGamma: v })} />
        <LayerRow label="Major Positive Volume" color={C.majorPosVol} on={settings.majorPosVol} onChange={v => set({ majorPosVol: v })} />
        <LayerRow label="Major Negative Volume" color={C.majorNegVol} on={settings.majorNegVol} onChange={v => set({ majorNegVol: v })} />
        <LayerRow label="Major Positive OI" color={C.majorPosOI} on={settings.majorPosOI} onChange={v => set({ majorPosOI: v })} />
        <LayerRow label="Major Negative OI" color={C.majorNegOI} on={settings.majorNegOI} onChange={v => set({ majorNegOI: v })} />
        <LayerRow label="GEX by Volume (bars)" color={C.posGexVol} on={settings.volBars} onChange={v => set({ volBars: v })} />
        <LayerRow label="GEX by OI (bars)" color={C.posGexOI} on={settings.oiBars} onChange={v => set({ oiBars: v })} />
      </Section>

      <div className="mt-3 rounded-lg border border-border/70 bg-black/40 pb-1">
        <div className="px-2 pt-1.5 pb-1 text-[12px] font-semibold lowercase tracking-wide text-muted-foreground">
          chart
        </div>
        <LayerRow label="Price Axis Labels" on={settings.axisLabels} onChange={v => set({ axisLabels: v })} />
      </div>

      <div className="mt-3 flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={copyLevels}>
          {copied ? "copied ✓" : "copy levels"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Reset layers & display to defaults"
          onClick={() => onChange({ ...DEFAULT_SETTINGS, sidebarCollapsed: settings.sidebarCollapsed })}
        >
          reset
        </Button>
      </div>

      <div className="mt-auto flex items-center gap-1.5 px-1 pt-3 text-[10.5px] text-muted-foreground/70">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ background: connected ? S.candleUp : S.candleDown }}
        />
        {connected ? "stream connected" : "stream disconnected"}
      </div>
    </aside>
  );
}
