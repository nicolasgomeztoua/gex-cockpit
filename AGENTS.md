# AI agent instructions

## Ask the language first

For a new user's installation, your first response must be:

> ¿Prefieres que te ayude en español o en inglés? / Would you prefer Spanish or English?

Wait for their answer before commands or setup explanations. If they already chose a language in this conversation, keep using it. Explain everything in that language, with simple words. UI labels remain English; translate their meaning as you show the controls.

## Desktop download (recommended for nontechnical users)

After the language choice, prefer the official [desktop preview](https://github.com/nicolasgomeztoua/gex-cockpit/releases/tag/v0.3.0-beta.1) for Windows 10/11 x64 or macOS 13+ (choose Apple Silicon or Intel). Follow [docs/desktop.md](docs/desktop.md). Users enter their key directly into the app; never request it in chat. No Bun or source setup is needed. Explain the unsigned preview warning without disabling security controls. The first-run key check covers State and Classic; verify actual charts and feed timestamps separately. Test native alerts on the installed app. Closing its window stops collection and alerts. Updates are opt-in from Connection / Conexión and preserve the separate data folder.

If they want source code, customization, or an existing source installation, follow the source steps below. Preserve that installation and its data; desktop uses a separate data folder.

## Set up from source

1. Identify the operating system and whether an installation already exists. Explain that Bun runs the app, the browser displays it, and a local SQLite file stores settings and history. Native alerts require macOS; leave Level Alerts off on Windows/Linux, where full setup is not yet verified.
2. Ask whether they prefer an **agent-managed Git copy with optional updates** or a **ZIP without Git**. Explain that neither updates automatically, and a happy user never needs to use Git. Clone the official public source using HTTPS, or extract its source ZIP into a permanent folder. Record the release/commit or ZIP source. Do not invent a release tag or require a fork/account to clone a public repository.
3. Check `bun --version` against `.bun-version`. If missing or different, use the [official Bun installation instructions](https://bun.com/docs/installation) for their system and explain what you are installing.
4. Copy `.env.example` to `.env.local` only if no configuration exists. Have the user enter their GexBot API key in a **local editor**, never chat or a terminal command. Check presence without printing the value. On Unix, use `chmod 600 .env.local`. Confirm they have the required provider access; no subscription is included.
5. From the folder containing `package.json`, run the commands below. Explain that they download dependencies, check the code, prepare the interface, then start collecting data.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun start
```

Open **http://127.0.0.1:4321** (or the configured port). The database is created automatically. Explain that the terminal must stay open and the computer awake; Ctrl+C stops the app, while closing the browser does not. Make sure the user can start it themselves after your agent session ends.

## Verify and explain

- Check the page loads and `/api/health` responds. Then check real NDX/QQQ State, Gamma and OI feeds through `/api/levels` and the charts. A connected stream or healthy server alone does not prove fresh market data.
- During trading hours, confirm provider timestamps advance. If closed-market conditions or missing access prevent verification, say what is pending and how to retry. `MOCK=1` still contacts GexBot and must never be presented as live data or an offline demo.
- Change a harmless display setting, reload, confirm it persists, then restore it.
- Walk through [the app guide](docs/trader-guide.md) in their chosen language: chart layers, levels, NQ conversion, history/replay, returning to live, settings and alerts. A new installation has no recorded history; test replay once it has recorded a session.
- On Mac, use **Test desktop alert** during alert setup and ask the user to confirm the banner/sound. Check Script Editor notification permissions, Focus and volume if needed. Explain that alerts use sampled native prices, can miss brief touches, and require the backend to stay running. Normal in-app replay continues monitoring live prices.

## Fix common setup problems

| Problem | Check |
| --- | --- |
| Bun not found | Reopen the terminal; follow Bun's official PATH instructions. |
| Install or subprocess test failure | Verify Bun and stale dependencies in a fresh source folder. Preserve the lockfile and user data. |
| Missing key / 401 / 403 | Check the local file location, nonempty value, environment overrides and provider access without displaying the key. |
| Blank charts | Check provider errors and timestamps. A new database has no past recordings. |
| Port in use / old interface | Identify the running process and its folder before stopping anything. Rebuild after updates. |
| Missing history | Check the working directory and `DB_PATH`; never delete data to fix it. |

See [configuration](docs/configuration.md) for optional settings. Keep `MOCK` and `REPLAY` unset for normal live use.

## Preserve the user's installation

Updates are opt-in. Follow [updates and backups](docs/updates.md) only when requested. Preserve customizations, `.env.local` and data; never force-reset a checkout. Keep the server bound to `127.0.0.1`: it is a single-user app without authentication. Never expose keys through logs, source, `VITE_` variables or browser storage. Do not install startup services without the user requesting them.

Finish with their actual folder path, version, local URL, start/stop steps, database location, update preference and checks passed/pending. Save this short handoff in ignored `INSTALLATION.local.md`, in their chosen language and without secrets.

## Code changes

Explain simply and show small before/after snippets for bugs. Inspect installed third-party versions and consult current official documentation before using their APIs. Preserve unrelated changes. Run `bun run typecheck`, `bun run test` and `bun run build` for code changes. See [CONTRIBUTING.md](CONTRIBUTING.md).
