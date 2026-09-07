# Configuration and developer commands

Normal installation only needs `GEXBOT_API_KEY` in `.env.local`. Leave the other values at their defaults unless you need to change them. Keep the key server-side; never use a `VITE_` variable for it.

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

## Developer commands

Use Bun from `.bun-version` and install with `bun install --frozen-lockfile`.

```sh
bun run dev         # frontend on :5173, API on :4321
bun run build       # rebuild the interface after changing source
bun start           # run the built app on :4321
bun run typecheck
bun run test        # unit tests; no provider key required
bun run db:generate # generate a migration after a schema change
```

`bun start` creates the database and applies migrations automatically. It only builds the interface if `dist/index.html` is missing, so rebuild after updating source.

`MOCK=1` still needs a GexBot key to fetch seed data. Diagnostic `REPLAY=YYYY-MM-DD` needs a recorded session in the database. For everyday replay, use the History panel instead.

For troubleshooting, `/api/health` checks the local server, `/api/levels` shows the latest feeds, and `/api/stream` supplies browser updates. A healthy server does not guarantee fresh provider data.
