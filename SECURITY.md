# Security / Seguridad

GEX Cockpit is a **single-user local application**. It binds to `127.0.0.1`, has no sign-in or per-user access controls, and stores one installation's settings, history and alert state. Do not expose its API through port forwarding, a public tunnel or a shared host. Local-only binding is not a security boundary against other software or users on your computer.

The server reads your provider key from `.env.local`. That file and the database are not encrypted by the app. Protect your computer account and private backups. Never put a key in `VITE_` variables, browser storage, source code, issues, screenshots or command arguments. If exposed, revoke/rotate it with the provider and replace it locally; removing a Git file alone does not remove history.

Report a vulnerability privately through the repository's GitHub **Security → Report a vulnerability** feature when enabled. If unavailable, open an issue that only asks the maintainer for a private reporting channel; do not include exploit details or secrets in public. No response-time guarantee is currently offered. The maintainer release checklist includes enabling private reporting before publication.

En español: es una app local para una sola persona, sin inicio de sesión. No publiques su puerto ni compartas la clave. `.env.local` y las copias contienen información privada sin cifrado propio de la app. Si se filtra una clave, revócala con GexBot. Para comunicar un fallo, usa el canal privado de GitHub; si no existe, pide un canal privado sin publicar los detalles.
