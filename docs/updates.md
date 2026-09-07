# Updates and backups / Actualizaciones y copias

## English

**Nothing updates automatically.** Starting the app with `bun start` does not fetch GitHub changes. Keeping your current version needs no Git commands. Updates can contain fixes or compatibility changes; review them when you choose.

### Before any update

Your agent should identify the actual running folder, source version, Bun version, database path (including a custom `DB_PATH`), and local changes. Read the target release notes and explain what changes. Do not change source or dependencies until the user has chosen to update.

Stop the app with Ctrl+C in its terminal and verify that no process is still writing to its database. Copy the **whole installation folder** into a dated backup outside the working folder, including hidden `.env.local`, Git history if present, and `data/`. `node_modules/` can be omitted if you will reinstall dependencies; preserving it can help an offline rollback. If DB_PATH is external, copy that database separately, including any `-wal` and `-shm` companions. Copy only after stopping all writers; a database file copied alone while running may be incomplete.

Confirm the backup contains the old source, configuration and data before continuing. Store it privately: it contains credentials and trading history. Do not upload it to GitHub. Record the backup path and previous version in `INSTALLATION.local.md`.

### Git copy tracking main (agent commands)

Only use this path for a clean checkout on `main` tracking the official `origin/main`. First inspect:

```sh
git status --short
git branch --show-current
git remote -v
git fetch origin
git log --oneline HEAD..origin/main
```

`fetch` downloads information; it does not change the installed app. Review the actual diff/release notes as well as the log. After the user opts in and the backup is verified:

```sh
git pull --ff-only origin main
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun start
```

`--ff-only` refuses to combine conflicting histories. If there are edits, local commits, a fork, another branch or a detached release tag, stop this command path and preserve the work. Never use `reset --hard`, `clean -fd`, a forced checkout, or an automatic stash/merge to force an update through. Use a separate new checkout and deliberately carry over reviewed customizations.

For a fork, keep `origin` pointing to the user's fork and add the official repository as `upstream` only if absent. Fetch/review from `upstream`; do not replace remotes or merge into customized code without reviewing the diff.

### Release checkout or ZIP (no Git required)

Download the chosen published release into a **new sibling folder**. Do not assume a release named after package.json exists. If no releases are published, identify the specific source commit/date from GitHub. Keep the old folder intact. With the old app stopped, privately copy `.env.local` and the data into the new folder; use a separate copy of an external database and update DB_PATH in the new copy. Never run both versions against the same database.

Install with `bun install --frozen-lockfile`, run typecheck/tests/build, then start the new copy and repeat the agent setup verification. A ZIP user never needs to install Git to do this. A Git user pinned to a tag should choose the next release explicitly; do not run `git pull` on a detached tag.

### Verify and roll back

Check real feeds, settings, recorded history and Mac alerts again. Update shortcuts and the local installation note to the new path/version. Keep the old backup until the user is satisfied.

If the new version fails, stop it. Restore or start the **paired old code and old database/configuration** from the backup, using its recorded Bun version. Reinstall locked dependencies if needed, rebuild, and start. Do not start old code against a database that newer code migrated unless compatibility has been verified. Data collected after the backup will not exist in the restored copy; preserve the failed installation separately if that data needs recovery.

## Español

**La app no se actualiza sola.** `bun start` abre tu versión; no descarga cambios de GitHub. Si estás contento, no tienes que hacer nada ni aprender Git. Si quieres actualizar, tu agente debe explicar primero las mejoras y posibles cambios de compatibilidad.

1. Identificar la carpeta que estás usando, su versión y dónde guarda los datos.
2. Detener la app y confirmar que nadie sigue escribiendo en la base de datos.
3. Copiar la instalación completa a una carpeta de respaldo con fecha: código, `.env.local` oculto y `data/`. Si usas otra ruta de datos, copiarla también con sus archivos auxiliares. La copia contiene tu clave: guárdala en privado.
4. Si es una copia Git limpia en `main`, revisar los cambios y actualizar solo cuando lo pidas. Si hay cambios propios, conservarlos y preparar otra carpeta; no borrarlos para forzar una actualización.
5. Si usas ZIP o una versión fija, descargar la versión elegida en otra carpeta. Copiar allí la configuración y una copia de los datos con la app detenida. No ejecutar dos versiones sobre la misma base de datos.
6. Instalar dependencias, comprobar, reconstruir y abrir la nueva versión. Revisar datos reales, ajustes, historial y alertas de Mac.
7. Guardar las nuevas instrucciones de inicio y conservar el respaldo hasta que estés satisfecho.

Si falla, detener la nueva versión y volver al código **y los datos anteriores juntos**. Los datos recogidos después del respaldo no estarán en esa copia; conservar la instalación fallida si hacen falta. Tu agente se encarga de los comandos de la sección inglesa y te explica todo en español.
