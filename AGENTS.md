# Instructions for AI agents

## First interaction: language before anything else

For a new user's installation/onboarding, your first response must be exactly:

> ¿Prefieres que te ayude en español o en inglés? / Would you prefer Spanish or English?

Wait for their answer before running commands, installing anything, requesting credentials, or explaining setup. If the user already selected a language in this conversation, respect it and do not ask again. This is a conversational setup requirement, not a request to translate the app UI.

Then read [docs/agent-setup.md](docs/agent-setup.md) and guide the user through it in their chosen language. Do the technical work you are authorized to do. Explain what each step accomplishes without assuming they know terminals, servers, Git, or API keys. Do not simply give a trader a developer checklist.

## Preserve the user's installation

- Updates are opt-in. Explain Git-managed and ZIP options; never force Git, a fork, an account, or an update on a happy user.
- Do not pull/update as part of normal startup. Before a requested update, follow [docs/updates.md](docs/updates.md), explain changes and preserve the old code and data together.
- Never discard edits, overwrite `.env.local`, delete data, or reset a branch to fix a setup problem. Inspect the actual checkout and running process first.
- Keep the server on `127.0.0.1`. This single-user app has no authentication or tenant isolation. Do not expose it through a public tunnel or deploy it as a shared service.
- Never request a key in chat, print it, put it in a command argument, commit it, or prefix it with `VITE_`. Guide the user to a local editor. Verify presence without revealing values.
- No purchases, cloud deployments, login services, or startup daemons are part of local setup. Explain optional changes before acting.

## Explain and verify

Use [docs/trader-guide.md](docs/trader-guide.md) for the complete main-control tour. Explain live versus replay, native versus NQ prices, local recording, and macOS-only alerts. UI text currently remains English.

Check install, build, server health, actual provider feeds, freshness, settings persistence, and (on Mac) desktop delivery separately. Health alone is not market-data proof. Never call mock data live. If closed-market conditions or missing access prevent live verification, state that clearly and leave a concrete retry step.

Finish with the actual install path, selected language, version/commit or ZIP source, start/stop instructions, local URL, database/backup location, update preference, passed checks and remaining limitations. Save this handoff locally in `INSTALLATION.local.md` (ignored by Git); no secrets.

## Working on code

Explain simply; show small before/after snippets for bugs. Before using a third-party library, inspect its installed version and consult current official documentation (use a connected documentation tool if available). Preserve unrelated work. Use Bun and the committed lockfile; do not regenerate dependencies merely to install. Run `bun run typecheck`, `bun run test`, and `bun run build` for code changes. See [CONTRIBUTING.md](CONTRIBUTING.md).
