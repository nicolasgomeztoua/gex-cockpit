import { Switch } from "./components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Separator } from "./components/ui/separator";
import { GEXBOT, type LayerSettings } from "./theme";
import type { FeedKey, FeedSnapshot } from "../shared/types";

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

function Row(props: {
  label: string;
  color?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-[5px] hover:bg-accent/60">
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

function SectionTitle(props: { children: string; color: string }) {
  return (
    <div className="mt-4 mb-1 px-1.5 text-[13px] font-semibold lowercase" style={{ color: props.color }}>
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
  const S = GEXBOT.state;
  const C = GEXBOT.classic;

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card px-3 py-3">
      <div className="flex items-baseline justify-between px-1.5">
        <span className="text-[20px] font-semibold text-foreground">cockpit</span>
        {mock && (
          <span
            className="rounded border px-1.5 py-px text-[10px] font-bold tracking-wider"
            style={{ color: C.zeroGamma, borderColor: C.zeroGamma }}
          >
            MOCK
          </span>
        )}
      </div>

      <Tabs value={settings.unit} onValueChange={v => set({ unit: v as LayerSettings["unit"] })} className="mt-3">
        <TabsList className="w-full">
          <TabsTrigger value="spot">spot price</TabsTrigger>
          <TabsTrigger value="nq">nq future</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs
        value={settings.chartType}
        onValueChange={v => set({ chartType: v as LayerSettings["chartType"] })}
        className="mt-2"
      >
        <TabsList className="w-full">
          <TabsTrigger value="line">Line</TabsTrigger>
          <TabsTrigger value="candles">Candles</TabsTrigger>
        </TabsList>
      </Tabs>

      <SectionTitle color={S.longGamma}>state</SectionTitle>
      <Separator className="mb-1" />
      <Row label="State Gamma (bars)" color={S.shortGamma} on={settings.stateBars} onChange={v => set({ stateBars: v })} />
      <Row label="Major Long Gamma" color={S.longGamma} on={settings.majorLongGamma} onChange={v => set({ majorLongGamma: v })} />
      <Row label="Major Short Gamma" color={S.shortGamma} on={settings.majorShortGamma} onChange={v => set({ majorShortGamma: v })} />

      <SectionTitle color={C.majorPosVol}>classic</SectionTitle>
      <Separator className="mb-1" />
      <Row label="Zero Gamma" color={C.zeroGamma} on={settings.zeroGamma} onChange={v => set({ zeroGamma: v })} />
      <Row label="Major Positive Volume" color={C.majorPosVol} on={settings.majorPosVol} onChange={v => set({ majorPosVol: v })} />
      <Row label="Major Negative Volume" color={C.majorNegVol} on={settings.majorNegVol} onChange={v => set({ majorNegVol: v })} />
      <Row label="Major Positive OI" color={C.majorPosOI} on={settings.majorPosOI} onChange={v => set({ majorPosOI: v })} />
      <Row label="Major Negative OI" color={C.majorNegOI} on={settings.majorNegOI} onChange={v => set({ majorNegOI: v })} />
      <Row label="GEX by Volume (bars)" color={C.posGexVol} on={settings.volBars} onChange={v => set({ volBars: v })} />
      <Row label="GEX by OI (bars)" color={C.posGexOI} on={settings.oiBars} onChange={v => set({ oiBars: v })} />

      <SectionTitle color={C.zeroGamma}>chart</SectionTitle>
      <Separator className="mb-1" />
      <Row label="Price Axis Labels" on={settings.axisLabels} onChange={v => set({ axisLabels: v })} />

      <SectionTitle color={C.zeroGamma}>update</SectionTitle>
      <Separator className="mb-1" />
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

      <div className="mt-auto flex items-center gap-1.5 px-1.5 pt-4 text-[11px] text-muted-foreground/70">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ background: connected ? S.candleUp : S.candleDown }}
        />
        {connected ? "stream connected" : "stream disconnected"}
      </div>
    </aside>
  );
}
