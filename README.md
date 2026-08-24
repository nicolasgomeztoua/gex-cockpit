# GEX Cockpit

A private, local-only dashboard for [GexBot](https://www.gexbot.com) gamma-exposure data.
Two TradingView-style charts (NDX and QQQ) show the intraday spot tape with the GEX profile
anchored to the right edge, every major level as a color-coded line, and zero gamma as a
continuous session line — mirroring gexbot.com's own chart UI (see `docs/gexbot-reference.md`).

## Quick start

```sh
bun install
bun run build      # Vite frontend -> dist/
bun start          # Hono/Bun API + built app at http://127.0.0.1:4321
```

Requires a `.env.local` in the repo root (never committed):

```
GEXBOT_API_KEY=...
```

Other commands:

```sh
bun run dev        # Vite HMR app on :5173 + Hono/Bun API on :4321
MOCK=1 bun start   # synthetic session (weekends) — badged, nothing persisted
bun run typecheck
bun run test       # focused Vitest unit tests
bun run build      # production frontend bundle
bun run probe      # UI acceptance probe (server must already be running)
bun run db:generate
```

`bun start` serves `dist/` and builds it automatically when `dist/index.html`
is missing. In development, Vite proxies every `/api` request — including the
SSE stream — to the Hono backend. The repo-root `.env.local` is server-only;
never put the GexBot key in a `VITE_` variable.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `GEXBOT_API_KEY` | — (required) | GexBot API key, server-side only |
| `POLL_MS` | `10000` | Poll interval; responses are deduped on the provider timestamp |
| `GEX_STATE_AGGREGATION` | `zero` | State profile: `zero` = latest expiry, `one` = next expiry, `full` = 90d |
| `GEX_OI_AGGREGATION` | `full` | Classic/Open Interest profile: `full` = 90d, `zero` = latest expiry, `one` = next expiry |
| `GEX_AGGREGATION` | — | Legacy fallback that sets both profiles when a per-profile variable is absent |
| `PORT` | `4321` | Listen port (always bound to `127.0.0.1`) |
| `VITE_PORT` | `5173` | Vite dev-server port (`bun run dev` only) |
| `DB_PATH` | `data/gex-cockpit.db` | SQLite database file |
| `MOCK` | off | `1` = synthetic session seeded from one real snapshot |

## Layout

```
src/
  server/    Hono app on Bun: API polling, Drizzle/SQLite, SSE, static serving
    index.ts   Bun.serve entry (127.0.0.1 + PORT)
    app.ts     Hono composition + production dist/ SPA serving
    routes.ts  typed API routes, zod validation, and SSE
    poller.ts  poll loops, timestamp dedupe, backoff, mock mode
    gexbot.ts  GexBot API client + response parsing
    schema.ts  Drizzle schema matching the existing SQLite tables
    db.ts      Drizzle over bun:sqlite (WAL, migrations, history queries)
  client/    React 19 + lightweight-charts frontend (built by Vite)
    GexChart.tsx      chart wrapper + GEX-profile canvas primitive + level lines
    Sidebar.tsx       gexbot-style settings panel
    theme.ts          exact gexbot colors + persisted layer settings
    components/ui/    shadcn-style primitives (Radix)
  shared/    types and official futures-price conversion shared by server and client
docs/        gexbot visual reference, original project brief
scripts/     ui-probe.ts — headless toggle/screenshot probe
drizzle/     generated baseline migration (`IF NOT EXISTS` for old DB compatibility)
vite.config.ts  React + Tailwind v4, build output, and dev API proxy
```

## HTTP surface

| Route | Purpose |
| --- | --- |
| `/` | The app |
| `/api/stream` | SSE: full state on connect, deduped snapshots after |
| `/api/levels` | Latest majors/zero-gamma/net per feed (integration hook, e.g. TradingView levels) |
| `/api/settings` | GET/PUT the tolerant client-settings JSON object |
| `/api/replay` | Validated replay controls when `REPLAY=YYYY-MM-DD` is active |
| `/api/health` | Liveness |

## Data notes

- Feeds: `{NDX,QQQ}` State GEX Profile, Options Gamma, and Classic/Open Interest
  GEX. By default, State and Options Gamma use GexBot's **latest** expiry while
  Open Interest uses its **90d** aggregate.
- The "nq future" toggle uses GexBot's documented conversion endpoint for both
  `NDX → NQ` (additive) and `QQQ → NQ` (affine):
  `future = multiplier × source + additive`. Parameters refresh every 15 minutes.
- State GEX Profile call/put imbalance and Options Profile long/short gamma are
  separate feeds and separate chart layers; they are not relabeled as each other.
- Normal GexBot requests are serialized on one warmed connection and retain the
  1-second timeout. A single cold-start request may use up to 3 seconds because
  establishing the provider connection is measurably slower than one second.
- Spot is GexBot context data, not exchange OHLC — candles are 1-minute buckets of polled ticks.
- History lands in `data/gex-cockpit.db` (SQLite, gitignored). Mock mode never writes.
- Strike-row index semantics (index 1 = volume/state value, index 2 = OI value) were
  verified against live responses; see `docs/original-brief.md` for the details.
