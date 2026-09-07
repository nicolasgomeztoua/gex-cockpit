# Contributing / Cómo contribuir

Issues and pull requests are welcome in **Spanish or English**. Explain what happened, what you expected and how to reproduce it. For setup help, include OS, Bun version and app version/commit. Never include `.env.local`, credentials, database files or raw private provider responses.

Puedes abrir incidencias y propuestas en **español o inglés**. Explica qué pasó, qué esperabas y cómo repetirlo. Incluye sistema operativo y versiones; nunca compartas tu clave ni tu base de datos.

## Local development

Read [AGENTS.md](AGENTS.md) and [configuration](docs/configuration.md). Use Bun from `.bun-version` and `bun install --frozen-lockfile`. `bun run dev` starts the Vite browser app on 5173 and the Bun API on 4321. Live development needs your own GexBot access; unit tests do not. Mock mode still fetches seed data.

Before submitting code:

```sh
bun run typecheck
bun run test
bun run build
git diff --check
```

Add focused tests for behavior changes. Explain UI/runtime checks separately from unit tests; desktop alerts require a real Mac. Browser probes are developer tools with browser prerequisites, not a beginner installation step. Preserve the local-only server binding, server-only credentials, API contracts, saved settings, timestamps and replay/live boundaries. Review database migration and backup compatibility for storage changes.

Use a topic branch for contributions. Do not update unrelated dependencies or remove `private: true` to make the repository public; it prevents accidental npm publication. Describe the user-visible change and validation in the PR. Contribution of original code is under the repository's MIT license; retain third-party notices.
