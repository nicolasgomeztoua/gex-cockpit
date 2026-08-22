# GEX Cockpit

A private, local-only dashboard for [GexBot](https://www.gexbot.com) gamma-exposure data.
Two TradingView-style charts (NDX and QQQ) show the intraday spot tape with the GEX profile
anchored to the right edge, every major level as a color-coded line, and zero gamma as a
continuous session line — mirroring gexbot.com's own chart UI (see `docs/gexbot-reference.md`).

## Quick start

```sh
bun install
bun start          # http://127.0.0.1:4321
```

Requires a `.env.local` in the repo root (never committed):

```
GEXBOT_API_KEY=...
```

Other commands:

```sh
bun run dev        # hot reload
MOCK=1 bun start   # synthetic session (weekends) — badged, nothing persisted
bun run typecheck
```

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `GEXBOT_API_KEY` | — (required) | GexBot API key, server-side only |
| `POLL_MS` | `10000` | Poll interval; responses are deduped on the provider timestamp |
| `PORT` | `4321` | Listen port (always bound to `127.0.0.1`) |
| `MOCK` | off | `1` = synthetic session seeded from one real snapshot |

## Layout

```
src/
  server/    Bun process: API polling, SQLite persistence, SSE, static serving
    index.ts   Bun.serve routes (/, /api/stream, /api/levels, /api/health)
    poller.ts  poll loops, timestamp dedupe, backoff, mock mode
    gexbot.ts  GexBot API client + response parsing
    db.ts      bun:sqlite (snapshots, spot ticks, zero-gamma history)
  client/    React 19 + lightweight-charts frontend (bundled by Bun HTML imports)
    GexChart.tsx      chart wrapper + GEX-profile canvas primitive + level lines
    Sidebar.tsx       gexbot-style settings panel
    theme.ts          exact gexbot colors + persisted layer settings
    components/ui/    shadcn-style primitives (Radix)
  shared/    types shared by server and client
docs/        gexbot visual reference, original project brief
scripts/     ui-probe.ts — headless toggle/screenshot probe
```

## HTTP surface

| Route | Purpose |
| --- | --- |
| `/` | The app |
| `/api/stream` | SSE: full state on connect, deduped snapshots after |
| `/api/levels` | Latest majors/zero-gamma/net per feed (integration hook, e.g. TradingView levels) |
| `/api/health` | Liveness |

## Data notes

- Feeds: `{NDX,QQQ,NQ_NDX}/{state,classic}/gex_full`. The `NQ_NDX` ticker powers the
  "nq future" unit toggle natively; QQQ in NQ units is a ratio approximation, labeled `≈`.
- Spot is GexBot context data, not exchange OHLC — candles are 1-minute buckets of polled ticks.
- History lands in `data/gex-cockpit.db` (SQLite, gitignored). Mock mode never writes.
- Strike-row index semantics (index 1 = volume/state value, index 2 = OI value) were
  verified against live responses; see `docs/original-brief.md` for the details.
