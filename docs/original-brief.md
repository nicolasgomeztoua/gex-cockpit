# Original Brief (2026-08-22)

## Goal

Build a private, local-only market context app with four clearly labeled views visible together:

1. NDX State
2. QQQ State
3. NDX Open Interest (OI)
4. QQQ Open Interest (OI)

The UI should be polished, easy to scan, and explicit about which ticker and data type each chart represents. On a normal desktop display, all four views should be visible at once. Fable can choose the framework and whether this is a browser-based local app, a lightweight desktop wrapper, Electron, or another approach.





## Access Already Available

The project folder contains a protected `.env.local` file with:

```text
GEXBOT_API_KEY=<secret>
```



## GEXBot API

Official OpenAPI version checked: `2.3.0`

Base URL:

```text
https://api.gex.bot/v2
```

Required request headers:

```http
Authorization: Bearer <GEXBOT_API_KEY>
User-Agent: <identify the local app and version>
Accept: application/json
```

Keep API calls in a local backend/main process so the browser UI never receives the key. Bind any local server to `127.0.0.1`, not the public network.

## Required Feeds

Use these four profile endpoints:

```text
GET /NDX/state/gex_full
GET /QQQ/state/gex_full
GET /NDX/classic/gex_full
GET /QQQ/classic/gex_full
```

Use the matching major-level endpoints:

```text
GET /NDX/state/gex_full/majors
GET /QQQ/state/gex_full/majors
GET /NDX/classic/gex_full/majors
GET /QQQ/classic/gex_full/majors
```

Interpretation:

- `state/gex_full` supplies the State-classified profile.
- `classic/gex_full` supplies the profile used for the OI view.
- State major fields of interest are `mpos_vol`, `mneg_vol`, and `net_gex_vol`.
- OI major fields of interest are `mpos_oi`, `mneg_oi`, and `net_gex_oi`.
- Classic responses also provide `zero_gamma`.
- Every profile response includes `spot` and a provider `timestamp`, so a separate price feed is not required for this first version.
- `spot` is context from GEXBot, not a tradable bid/ask quote and must not be presented as execution-grade pricing.

## Live Access Check

All eight endpoints above were tested with the actual Custom key on August 22, 2026 and returned HTTP `200`.

- NDX profile responses returned 141 strike rows.
- QQQ profile responses returned 150 strike rows.
- Responses included `timestamp`, `ticker`, `spot`, `strikes`, major levels, and net exposure fields.
- Both Classic and State entitlements are confirmed working with this key.

This is live-tested account evidence, not just a conclusion from documentation.

## Hard-to-Find Response Detail

The OpenAPI schema describes each `strikes` row as an array but does not clearly name every array position. The official README example looks like this:

```json
[
  6890,
  -228.01,
  -86.9,
  [-240.55, -243.15, -245.22, -221.27, -220.12]
]
```

Observed behavior from the live responses:

- Index `0` is the strike.
- In Classic responses, the third value (index `2`) behaves as the OI profile value.
- In State `gex_full` responses, index `2` and the OI summary fields were zero while index `1` carried the State profile values.
- The nested final array contains prior values, but its exact lookback labels are not named clearly in the current schema.

Before attaching final user-facing labels, Fable should verify these array semantics against the current GEXBot Classic/State chart legend or an official vendor example. This is the main point that should not be guessed.
