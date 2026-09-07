# Setup runbook for an AI agent

Follow `AGENTS.md` first: ask **“¿Prefieres que te ayude en español o en inglés? / Would you prefer Spanish or English?”** and wait. All later explanations, troubleshooting and the final handoff must use the chosen language. Keep actual UI labels and commands unchanged and explain them alongside the translation.

## 1. Understand the user's computer

Ask which system they use if you cannot determine it locally. Find out whether they already have GexBot API access and whether this is a new installation or an existing copy. Do not ask for the key itself. Explain:

- Bun runs the app; the browser displays it; the local backend fetches data and saves it.
- The API key lets this computer access the user's GexBot account. It is not included with the project.
- SQLite is a file that holds history, settings and alert state. There is no database service to install.
- macOS supports native alerts. Windows/Linux desktop alerts are unsupported; do not enable them or present a WSL/container as a way to obtain Mac notifications. Those platforms still need end-to-end chart validation.

For example: “Voy a comprobar si Bun está instalado. Es el programa que ejecutará la app en tu ordenador.” Explain the purpose before a command group; do not narrate every internal detail.

Check the chosen folder, existing files, `bun --version`, and, for a Git copy, `git status --short`, branch and remotes. Do not run broad searches of personal directories or read secret values. Do not stop an existing server before identifying it and its data path.

## 2. Choose how to install

Explain both options and let the user choose:

- **Optional updates, managed by the agent (recommended):** HTTPS clone from `https://github.com/nicolasgomeztoua/gex-cockpit.git`. For a public repository, no GitHub login or SSH key is needed. Git only tracks source versions; it does not automatically update anything. The user can ignore it forever.
- **ZIP, no Git:** download an available release source archive, or Code → Download ZIP. Extract into a permanent, writable folder. Record the source/tag/date so a future agent knows what was installed. Do not insist on installing Git.

Prefer a published stable release when one exists; do not invent a release tag. A release checkout may be detached: that is normal and it should use the release update procedure, not `git pull`. If using main, record the commit and explain that it contains development changes. The maintainer source is the URL above; a fork should use it as `upstream` and keep its own `origin` intact.

Use `.bun-version` (currently 1.3.12) for repeatable setup. Consult [official Bun installation instructions](https://bun.com/docs/installation) for the OS and version before installing. Bun's default installer may install a newer version; select the recorded version deliberately. Explain the download and installation before executing it. Bun is sufficient for local use; no separate database server is needed.

## 3. Configure privately

If `.env.local` does not exist, copy `.env.example` to it. Never replace an existing configuration. Ask the user to enter their key in a local editor, then indicate when they are done. On Unix, restrict the file to the current user with `chmod 600 .env.local`; on Windows, use appropriate account-only permissions. The file is plaintext, not an encrypted vault.

Check only that `GEXBOT_API_KEY` is nonempty; never print its value or include it in output. Bun loads `.env.local` from the working directory ([documentation](https://bun.com/docs/runtime/environment-variables)). Shell environment variables can override file values: check conflicting variable **names/presence**, not their contents. Never expose the key via `VITE_`, browser storage, logs, screenshots or an issue.

Leave the defaults unless there is a concrete need. `PORT` is the local web address's port number. `POLL_MS` is time between polls in milliseconds; 10000 means ten seconds. `DB_PATH` changes the private data file location. Explain any non-default and record it in the local handoff without secrets.

`MOCK=1` generates synthetic movement but still seeds it through GexBot. It is not a key-free or offline demo. Normal first-time setup should leave `MOCK` and `REPLAY` unset.

## 4. Install and start

Run from the directory containing `package.json`:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run build
bun start
```

Explain: dependencies → code check → browser build → running app. If an install fails, fix the actual runtime/network issue; do not silently delete `bun.lock` or upgrade all packages. SQLite creation and migrations run automatically at startup. `bun start` only auto-builds when `dist/index.html` is absent, so always rebuild after code updates.

Open `http://127.0.0.1:4321` (or the configured port). `127.0.0.1` means this computer. Keep that binding: a public proxy/tunnel is not a safe installation option. Leave the terminal running; Ctrl+C stops it. If the agent runs in a temporary session, explain how the user will start the app in their own terminal after the session ends.

## 5. Verify real use, not just a running process

Work through these checks and record each outcome:

1. Installation and build succeeded with the chosen Bun version.
2. `GET /api/health` returns `status: ok`. This proves only server liveness; a feed count of zero means no feeds have arrived.
3. The page loads and `/api/stream` connects. Inspect `/api/levels` and the displayed data for both NDX and QQQ State, Gamma and OI. A successful local response is not proof of provider access.
4. Check provider timestamps advance during active trading, and no authorization/access errors appear. Outside market hours, state freshness is unverified and explain how to retry during the New York session. Do not use fabricated timestamps, synthetic data or screenshots as live proof.
5. Change one harmless display setting, reload and confirm it persists, then restore it. Explain that settings are stored in the local database with a browser cache.
6. Show the History panel. A fresh install has no prior sessions: recording happens while the backend runs, and this is not a downloader for old GexBot sessions. When recorded RTH data exists, test load/seek/play and return to live. Otherwise mark replay validation pending until a session has been recorded.
7. On Mac only, explain **Test desktop alert**, then trigger it as part of requested alert setup. Have the user confirm the banner/sound. Successful submission to macOS alone is not proof they saw it. Check Script Editor notification permissions, volume and Focus settings if needed. A test alert does not prove a live touch has occurred. Leave live alerts at the user's preference.
8. Follow [the app tour](trader-guide.md), explaining every main control in the selected language. Ask the user to try switching a layer or navigating history so confusion is caught now.

Do not claim setup fully verified if the key is missing, feeds are unauthorized, data is stale, or the operating system is untested. Complete independent work and name the exact remaining action.

## Troubleshooting

| Symptom | What to check / explain |
| --- | --- |
| `bun: command not found` | Reopen the terminal after installation and check the official PATH instructions. |
| Tests invoke a different Bun / missing `node_modules/bun/bin/bun.exe` | Check whether stale, untracked dependencies shadow the selected Bun. Verify in a fresh source folder with a frozen install before blaming app code. Preserve user data; do not change tests to hide the failure. |
| Lockfile/install error | Check Bun version and access to the configured npm registry. Preserve the lockfile. |
| Key missing / 401 / 403 | Check local file location, nonempty value, overrides and provider entitlements privately. Do not request a pasted key. |
| Blank charts | Health is not enough. Check API feeds, provider errors and timestamps. A new database cannot contain yesterday's recording. |
| Port already in use | Identify the existing process and checkout. Reuse the intended app or choose another PORT; do not kill an unknown process. |
| Old interface after update | Stop the intended app, run `bun run build` in its actual folder, restart and refresh the browser. |
| No alert | Confirm Mac backend, awake computer, enabled bell/global setting, permission, volume, Focus and test result. Browser notification permission is not the delivery mechanism. |
| History missing | Check DB_PATH and working directory. Do not delete/create over the previous data to “fix” it. |
| Update fails | Use the paired code/data backup in [updates.md](updates.md). Do not reset away customizations or downgrade against a migrated DB blindly. |

## 6. Leave a useful handoff

Create ignored `INSTALLATION.local.md` in the chosen language with: full folder path; OS; Bun version; release/commit or ZIP source; local address; start/stop instructions; data path; backup location if created; chosen update preference; checks passed; checks pending and retry instructions. No key values. Explain how to find the folder and reopen a terminal there. Offer a local shortcut only if useful; do not silently install background services.

Tell the user: **“If you are happy with this version, you do not need to update or use Git.”** / **“Si te gusta esta versión, no necesitas actualizar ni usar Git.”** Future provider changes can affect old versions, but no update is forced by this app.
