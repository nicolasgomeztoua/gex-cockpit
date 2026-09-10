# Desktop app / App de escritorio

## English

Download the **desktop preview** from [GitHub Releases](https://github.com/nicolasgomeztoua/gex-cockpit/releases). Choose **Mac Apple Silicon** (`aarch64.dmg`), **Mac Intel** (`x64.dmg`), or **Windows** (`x64-setup.exe`). The source ZIP is for developers.

1. **Mac (macOS 13 or newer):** open the DMG and drag GEX Cockpit into Applications. Launch it from Applications.
2. **Windows (Windows 10/11, x64):** run the setup EXE. The installer installs for your Windows account and downloads Microsoft's WebView2 runtime if needed.
3. Choose English or Español, enter your GexBot API key, and click **Connect**. It checks State and Classic access for NDX and QQQ. Your subscription is separate.

These preview downloads have **no Apple Developer ID/notarization or Windows publisher certificate**. macOS may block the first launch; after attempting to open the official download, use **System Settings → Privacy & Security → Open Anyway**. Windows may show **More info → Run anyway** for an unknown publisher. Do not disable your computer's security settings. Managed computers may not allow unsigned apps.

Your key is saved in **macOS Keychain** or **Windows Credential Manager**. It is sent to GexBot, never to this project's author. It is not stored in browser storage or the database. Use **Connection / Conexión** in the sidebar to replace it. The chart controls currently use English labels; setup is bilingual.

**Keep the app open and your computer awake.** Closing the window quits the app and stops recording and alerts. Minimizing it keeps them running. Use **Test desktop alert**, allow GEX Cockpit notifications in system settings, and check that you receive a banner. System notification settings, Focus and sound settings can suppress alerts. Windows uses its own corresponding notification sounds. Alerts sample prices and can miss brief touches.

A fresh installation has no recorded sessions. Recording starts when the app receives data. The source/browser installation keeps its own history; installing the desktop app does not move or delete that history.

### Updates and backups

In **Connection / Conexión**, click **Check for updates**, then choose whether to install and restart. Nothing checks, downloads or installs automatically. The updater verifies a cryptographic signature before installation. Preview versions receive in-app updates once a newer stable release is published; preview-to-preview updates use a fresh download.

You can also quit the app and install a newer DMG/EXE over it. Your key, recordings and settings remain separate from the application:

- Mac: `~/Library/Application Support/com.nicolasgomeztoua.gex-cockpit/`
- Windows: `%APPDATA%\com.nicolasgomeztoua.gex-cockpit\`

The connection screen shows the exact folder. For a backup, **quit the app first**, then copy that entire folder somewhere private. Keep your API key separately in your password manager. Do not upload recordings or credentials to GitHub. Avoid downgrading after a release changes the database format.

## Español

Descarga la **versión de prueba para escritorio** en [GitHub Releases](https://github.com/nicolasgomeztoua/gex-cockpit/releases). Elige **Mac Apple Silicon** (`aarch64.dmg`), **Mac Intel** (`x64.dmg`) o **Windows** (`x64-setup.exe`). El ZIP de código es para desarrolladores.

1. **Mac (macOS 13 o posterior):** abre el DMG, arrastra GEX Cockpit a Aplicaciones y ábrelo desde ahí.
2. **Windows (Windows 10/11, x64):** ejecuta el instalador EXE. Se instala para tu usuario y descarga WebView2 de Microsoft si hace falta.
3. Elige Español, introduce tu clave API de GexBot y pulsa **Conectar**. Se comprueba el acceso a State y Classic para NDX y QQQ. Necesitas tu propia suscripción.

Esta versión de prueba **no tiene certificado de desarrollador de Apple ni de editor de Windows**. Si el Mac bloquea la primera apertura de la descarga oficial, ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**. En Windows puede aparecer **Más información → Ejecutar de todas formas**. No desactives la seguridad del ordenador. Un equipo de empresa puede bloquear estas aplicaciones.

La clave se guarda en el **Llavero de macOS** o el **Administrador de credenciales de Windows** y solo se envía a GexBot. Puedes cambiarla desde **Connection / Conexión** en el panel lateral. Los controles de los gráficos siguen en inglés.

**Mantén la app abierta y el ordenador despierto.** Al cerrar la ventana se detienen las grabaciones y las alertas; puedes minimizarla. Prueba **Test desktop alert**, permite las notificaciones de GEX Cockpit y comprueba que aparece un aviso. El modo Concentración y los ajustes de sonido pueden silenciarlo. Las alertas usan muestras del precio y pueden perder un toque muy breve.

Una instalación nueva todavía no tiene sesiones grabadas. La app de escritorio guarda su historial por separado; no mueve ni borra el de tu instalación anterior.

### Actualizaciones y copias

En **Connection / Conexión**, pulsa **Buscar actualizaciones** y decide si quieres instalar y reiniciar. No se buscan ni se instalan por su cuenta. La app verifica la firma de la actualización antes de instalarla. Las versiones de prueba reciben actualizaciones dentro de la app cuando se publica una versión estable más reciente; para pasar entre versiones de prueba, descarga el nuevo instalador.

También puedes cerrar la app e instalar el nuevo DMG/EXE encima. Tu clave, tus ajustes y tus grabaciones se conservan. La pantalla de conexión muestra la carpeta donde se guardan. Para hacer una copia, **cierra la app primero** y copia toda esa carpeta a un lugar privado. Guarda tu clave también en tu gestor de contraseñas. No compartas tu historial ni tu clave en GitHub.
