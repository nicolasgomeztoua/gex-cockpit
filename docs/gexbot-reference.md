# Gexbot UI reference

The visual target for this app is **gexbot.com's chart UI, copied as closely as possible**.
Compare every UI change against the reference screenshots before calling it done.

> **Screenshots:** drop the reference PNGs into `docs/reference/`:
> - `gexbot-state-chart.png` — the NDX state chart (candles + purple/cyan profile + sidebar)
> - `gexbot-state-settings.png` — state settings panel (color swatches)
> - `gexbot-classic-settings.png` — classic settings panel (color swatches)
> (They were shared in chat; images can't be exported from the conversation, so save them here manually.)

## Layout (from the state chart screenshot)

- Pure black background, full-bleed chart on the left, ~300px sidebar on the right.
- Chart: candlesticks (bright green/red), GEX profile drawn as horizontal bars anchored to the
  **right edge** at their strike prices (state: purple bars = short gamma, cyan dots/bars = long gamma).
- Price scale on the right with the current price highlighted in a pill.
- Value scale for the profile along the **top** (e.g. −6000 … −2000).
- Level lines run the full chart width with axis labels (e.g. `+1σ (29443.74)` pills).
- Dashed vertical line at the current time; playback slider at the sidebar bottom.
- Sidebar sections: title (`state`/`classic`), ticker dropdown, `spot price | nq future` segmented
  toggle (active = soft blue), **gex profile** section (90d agg / latest / next), **options profile**
  section (delta/gamma/vanna/charm iOS-style toggles), **update** (date/time/spot), **volume**
  (major long/short gamma values), load history / today / clear history, playback controls.
- Section headers are lowercase and colored (green/orange); rows are label + swatch + toggle.

## Colors (sampled from the settings screenshots)

Single source of truth in code: `src/client/theme.ts` (`GEXBOT`). Sampled values:

### state package

| Layer | Color |
|---|---|
| Major Long Gamma / Long Gamma | cyan `#4de3f2` |
| Major Short Gamma / Short Gamma | purple `#a94de8` |
| Call Skew | `#86e523` (unused here) |
| Put Skew | `#f23645` (unused here) |
| Spot History | white `#ffffff` |
| Candle Up / Down | `#26d467` / `#f63538` |
| Expected Move ±1σ | gray dashed (no σ data in the REST API — not drawn) |

### classic package

| Layer | Color |
|---|---|
| Zero Gamma | orange `#f2a33c` |
| Major Positive / Negative Volume | `#84d62a` / `#c0281e` |
| Major Positive / Negative OI | `#3e9142` / `#9e241b` |
| Pos / Neg GEX by Volume (bars) | `#6bd96e` / `#f26d5f` |
| Pos / Neg GEX by OI (bars) | `#2f7d33` / `#8c1f17` |
| 1/5/10/15/30 min priors | light→dark blues (`theme.ts` `priors`) |
| Spot History | cyan `#4de3f2` |
| Candle Up / Down | grays (state candle colors used instead) |

Colors are estimated from screenshots — if any looks off next to the real site, correct it in
`theme.ts` and this file together.

## Covered as of v0.3 (sidebar v4 pass)

Cyan current-price line + pill · dashed cyan now-line · orange top profile-value ticks ·
priors dots (blue ramp classic, dimmed cyan→purple state) · continuous zero-gamma session
line · per-level on-chart name tags · canvas watermark · chart toolbar (fit / fullscreen /
PNG) · collapsible shadcn sidebar with per-level line/label/alert controls · level alerts
(system notifications + synthesized sounds). Still absent: ±1σ expected-move lines (not in
the REST API — deliberately omitted), playback controls (waiting on the replay feature).

## Cockpit-specific deviations (intentional)

- Two charts stacked (NDX top, QQQ bottom) instead of one ticker at a time — that's the point
  of the cockpit. Each chart overlays **both** packages, distinguishable by gexbot's own color
  families (state = cyan/purple, classic = green/red).
- One shared sidebar controls both charts; per-ticker update info lives in the chart legends.
- `≈NQ` for QQQ is a client-side ratio conversion (the API only has native `NQ_NDX`).
