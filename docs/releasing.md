# Maintainer release checklist

This repository contains local release preparation. Before publication, review repository visibility, the release tag and release notes.

## Before making the repository public

- Confirm MIT applies to the original code and retain third-party notices. This repository contains historical design/reference notes; review their provenance and any future screenshots/assets before distributing them. The source license does not license provider data or branding.
- Review **all history and refs that will be published**, not only the current tree, for secrets, private data, personal paths and restricted artifacts. A targeted check of the present local API key and common token patterns is not a complete historical secret audit. Run a maintained secret scanner against the release history; rotate any exposed secret before rewriting/removing it.
- Confirm `.env.local`, databases, backups, local installation notes and generated builds are excluded. Never package a filesystem ZIP of the working directory: it can include ignored secrets. Use GitHub source archives or `git archive` from the reviewed release commit.
- Enable private vulnerability reporting and available GitHub secret scanning/push protection. Confirm issue/PR templates and source URLs work after publication.
- Run the added CI on Linux and macOS. Local passing tests are not evidence GitHub CI has run. Windows is not yet validated; native desktop alerts are macOS-only.
- Perform a fresh Mac installation from the actual release ZIP and HTTPS clone, following the language-first agent guide. Verify private key entry, fresh provider feeds, saved settings, history recording/replay, update/rollback, and visible/audible desktop test delivery. Never claim real-feed verification from health or mock mode.

## Publish a reproducible version

1. Choose a version; keep `package.json`, release notes and the new tag consistent. Do not move an existing tag to different code. Check existing remote tags before naming it.
2. Commit reviewed changes and publish a release from that commit with English and Spanish notes, supported platforms, known limits and the pinned Bun version.
3. Link [README.es.md](../README.es.md), [README.md](../README.md), and the source ZIP in the release notes. Explain that existing installations never update automatically.
4. For built distributions, include third-party license/notice files and verify the packaged contents contain no credentials, databases or local notes. Source-only releases can use GitHub's generated source archives.
5. Document any data migration and whether rollback requires a pre-upgrade database copy. Never suggest downgrading source alone across incompatible migrations.

## Suggested first release notes

English: Local NDX/QQQ GexBot dashboard with optional updates, recorded-session replay and Mac desktop level alerts. Includes English/Spanish agent-guided installation. Bring your own authorized GexBot API access. Interface labels remain English. Updates are optional. Windows/Linux end-to-end setup remains unverified; desktop notifications require macOS.

Español: Panel local de GexBot para NDX/QQQ, con actualizaciones opcionales, reproducción de sesiones grabadas y alertas de escritorio en Mac. Instalación guiada por un agente en español o inglés. Necesitas tu propio acceso API autorizado de GexBot. La interfaz sigue en inglés. Las actualizaciones son opcionales. La instalación completa en Windows/Linux aún no está verificada; las alertas necesitan macOS.
