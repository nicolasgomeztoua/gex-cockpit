# Technical reference

[Español](../README.es.md) · [English](../README.md)

## Developer commands

Use Bun 1.3.12 (see `.bun-version`) and `bun install --frozen-lockfile`.

```sh
bun run dev        # Vite on :5173, Bun API on :4321
bun run build      # rebuild dist/ after source updates
bun start          # local server and built app on :4321
bun run typecheck
bun run test       # Vitest plus Bun/SQLite regressions; no provider key needed
bun run probe      # developer browser probe; running app + Chrome required
bun run db:generate # contributors only: generate a migration after schema edits
```

On a POSIX shell, `MOCK=1 bun start` enables synthetic movement seeded from GexBot (a key is still required). On other shells use the shell's environment-variable syntax or a private `.env.local`; remove the setting to return to live mode. Do not use mock output as proof of live data.

The `scripts/*probe.ts` and `scripts/seed-replay-fixture.ts` files are developer diagnostics, not installation steps. The fixture script overwrites its hard-coded `/tmp/replay-fixture.db`; inspect it before running and never point it at user data.

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
| `REPLAY` | off | Legacy/diagnostic startup replay for one `YYYY-MM-DD`; normal use starts replay from the sidebar |

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
| `/api/alerts` | Backend delivery status, pending alerts, and last 50 events |
| `/api/alerts/ack` | POST acknowledge delivered persistent alerts through a seen event ID |
| `/api/alerts/test` | POST `{}` to test macOS notification and sound |
| `/api/replay` | GET recorded sessions/status; POST start/stop/play/pause/seek/speed controls |
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
  1-second timeout. Cold start and an automatic connection rebuild may use up to
  3 seconds because establishing provider TLS is measurably slower than one second;
  after rebuilding, the interrupted request is retried at the normal 1-second limit.
- Spot is GexBot context data, not exchange OHLC — candles are 1-minute buckets of polled ticks.
- Live spot and zero-gamma histories show one New York RTH session
  (09:30–16:00 ET): today when available after the open, otherwise the latest
  recorded RTH session. Premarket and overnight rows are excluded. Histories
  preserve provider timestamps. Gaps longer than
  30 seconds render as proportional whitespace instead of a false connecting line.
- History lands in `data/gex-cockpit.db` (SQLite, gitignored). Mock mode never writes.
- Strike-row index semantics (index 1 = volume/state value, index 2 = OI value) were
  verified against live responses; see `original-brief.md` for the details.

## Level alerts

Select levels with their bell icons, then enable **Level Alerts**. There is one
trigger: a fresh price sample touches the level, or two successive samples pass
through it. Being merely nearby does not alert. Each level uses the spot and level
from its own provider feed, in native NDX/QQQ units; display conversions cannot
cause alerts. A changed level or a data gap over two minutes starts a new baseline.
The cooldown limits repeat touches; price sitting on a level does not keep firing.

Choose **once** or **until refocus**. Persistent alerts repeat every 25 seconds
without a repeat cap, until a visible, focused cockpit acknowledges them. Alerts
that fire while the cockpit is already focused deliver once and are acknowledged
on the next focus heartbeat. Switching off alerts or a level cancels its pending
notifications. Existing alert events keep their original sound/repeat preference.

The backend evaluates live polls and sends macOS notifications via `osascript`
and sounds via `afplay`. Browser notifications, autoplay permission, open tabs,
and browser timers do not drive detection or delivery. Trigger observations,
cooldowns, pending events, retry times and acknowledgments are persisted in the
same SQLite database, with transactional enqueue and full synchronous WAL writes.
Delivery retries after failures and resumes after a backend restart; an interrupted
native delivery can repeat once because macOS has no transactional delivery receipt.
The alert store owns its idempotent table upgrades independently of the historical
snapshot migrations. Preserve the database and its WAL when backing it up.

Use **Test desktop alert** to check the local desktop path. macOS must allow
Script Editor notifications; Focus/Do Not Disturb and system volume still affect
what you see/hear. A successful command confirms submission to macOS, not that a
banner was visible. Failed commands remain queued and are shown in the alert panel.
Settings writes retry, and the UI shows when saving has not been confirmed.

The **Mac must be awake and the backend running** (`bun start`); this is a local
app, not a hosted alert service. It does not install an automatic restart/login
service. SQLite preserves pending work when a process stops but cannot monitor
new prices while it is stopped. GexBot polling defaults to 10 seconds and is not
an exchange tick stream: a touch and reversal entirely between samples is not
observable. In-app replay continues monitoring the independent live feed; mock
and startup replay modes do not evaluate or deliver live alerts.

Implementation references: [Bun SQLite transactions](https://bun.sh/docs/runtime/sqlite),
[macOS notification scripting](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/DisplayNotifications.html).
