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

Add focused tests for behavior changes. Explain UI/runtime checks separately from unit tests; native desktop alerts require a real installed app on the target OS. Browser probes are developer tools with browser prerequisites, not a beginner installation step. Preserve the local-only server binding, server-only credentials, API contracts, saved settings, timestamps and replay/live boundaries. Review database migration and backup compatibility for storage changes.

Use a topic branch for contributions. Do not update unrelated dependencies or remove `private: true` to make the repository public; it prevents accidental npm publication. Describe the user-visible change and validation in the PR. Contribution of original code is under the repository's MIT license; retain third-party notices.

## Desktop development

Install Bun from `.bun-version` and the Rust toolchain in `rust-toolchain.toml`, plus [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Run `bun run desktop:dev` for the native window with Vite, or `bun run desktop:build --config '{"bundle":{"createUpdaterArtifacts":false}}'` for a local installer without updater signatures. Windows builds require a Windows host; macOS builds require a Mac. Linux desktop builds are not supported by this project.

The Tauri host stores the provider key in the OS credential store and launches a compiled Bun backend on a random loopback port. Only the bundled frontend receives its per-launch session token. Source installations retain their original same-origin API. SQLite migrations are bundled resources. Backend stdin closes when the host exits; notification delivery uses an acknowledged pipe protocol.

For native changes also run `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings`, `cargo test --locked --manifest-path src-tauri/Cargo.toml`, and `bun scripts/desktop-smoke.ts <compiled-backend-path>`. The Desktop builds workflow builds all three targets; Windows also installs the EXE and checks that its window opens and closes. This is not proof of live chart rendering or visible notification delivery.

The manually started **Package desktop release** workflow runs only on `main` and produces a draft preview, signed update artifacts and `latest.json`. It requires a `TAURI_SIGNING_PRIVATE_KEY` repository secret matching the public key in `tauri.conf.json`. Keep a private backup of the signing key outside Git; losing it breaks future in-app updates for existing installations. Never pass this secret to pull request builds. Review all platform results before publishing the draft. The updater follows the latest stable GitHub release; previews update manually until a newer stable release is available.

Bun 1.3.14 is pinned because 1.3.12 creates invalid macOS standalone signatures ([upstream report](https://github.com/oven-sh/bun/issues/29361)). The desktop build applies a free ad-hoc signature on Mac; Developer ID/notarization and Windows publisher signing are separate from updater verification.
