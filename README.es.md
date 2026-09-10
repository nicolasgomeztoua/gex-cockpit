# GEX Cockpit

**Español · [English](README.md)**

Un panel local para ver **State y Classic de [GexBot](https://www.gexbot.com) al mismo tiempo** en los gráficos de NDX y QQQ. Compara perfiles de exposición gamma y niveles importantes, reproduce las sesiones que hayas grabado y recibe alertas de escritorio en Windows y Mac. No se conecta a un bróker ni envía órdenes.

Funciona en tu ordenador. La clave API, los ajustes y el historial se guardan ahí. La app consulta GexBot para obtener datos. El código abierto no incluye una suscripción de datos ni derechos para redistribuirlos. Es un proyecto independiente, no una aplicación oficial de GexBot o TradingView.

## Así se ve

**State + Classic en una sola pantalla**, con controles independientes para cada capa.

![Gráficos de NDX y QQQ con perfiles y niveles de State y Classic juntos, junto a los controles de cada capa](docs/screenshots/state-classic.png)

<details>
<summary>Ver los controles para reproducir sesiones</summary>

Revisa una sesión grabada, recorre su línea de tiempo y ajusta la velocidad de reproducción.

![Gráficos de NDX y QQQ con la fecha de la sesión grabada, la línea de tiempo y los controles de reproducción en el panel lateral](docs/screenshots/session-replay.png)

</details>

Ambas capturas muestran una sesión grabada del 1 de septiembre de 2026.

## Descarga la app de escritorio

Elige tu ordenador para descargar la versión de prueba **v0.3.0-beta.1**:

| Ordenador | Descarga |
| --- | --- |
| Windows 10/11 (64 bits) | **[Instalador de Windows (.exe)](https://github.com/nicolasgomeztoua/gex-cockpit/releases/download/v0.3.0-beta.1/GEX.Cockpit_0.3.0-beta.1_x64-setup.exe)** |
| Mac con Apple Silicon (macOS 13+) | **[Mac Apple Silicon (.dmg)](https://github.com/nicolasgomeztoua/gex-cockpit/releases/download/v0.3.0-beta.1/GEX.Cockpit_0.3.0-beta.1_aarch64.dmg)** |
| Mac con Intel (macOS 13+) | **[Mac Intel (.dmg)](https://github.com/nicolasgomeztoua/gex-cockpit/releases/download/v0.3.0-beta.1/GEX.Cockpit_0.3.0-beta.1_x64.dmg)** |

En Mac, **menú Apple → Acerca de este Mac** muestra tu chip o procesador. Instala la app, elige Español e introduce tu propia clave API de GexBot. No necesitas Bun, una terminal ni saber programar. Aquí tienes los [detalles de esta versión](https://github.com/nicolasgomeztoua/gex-cockpit/releases/tag/v0.3.0-beta.1).

Es una versión de prueba sin certificado de Apple/Microsoft; puede aparecer un aviso de seguridad al abrirla por primera vez. Aquí tienes la [guía breve de instalación y actualizaciones](docs/desktop.md#español). Mantén la app abierta para grabar sesiones y recibir alertas. Las actualizaciones son opcionales y conservan tus datos.

## Instalar el código con ayuda de una IA

Abre la carpeta del proyecto con un agente que pueda trabajar en tu ordenador y pega esto:

> Ayúdame a instalar GEX Cockpit. Antes de hacer nada, pregunta si prefiero español o inglés y espera mi respuesta. Sigue AGENTS.md. Explica cada paso y todos los controles principales con palabras sencillas. Ayúdame a elegir entre una instalación con actualizaciones opcionales y una copia ZIP sin Git. Nunca actualices automáticamente. Mantén mi clave API privada y comprueba que la app recibe datos antes de dar la instalación por terminada.

No necesitas saber programar. El agente se encarga de los pasos técnicos y debe dejarte instrucciones claras para abrir y cerrar la app. **La interfaz sigue usando etiquetas en inglés**; el agente te las explicará en español.

## Qué necesitas para instalar desde el código

- [Bun](https://bun.com/docs/installation): el programa que ejecuta la app. Esta versión se prueba con **Bun 1.3.14**.
- Tu propia clave API de GexBot con acceso a los datos necesarios. Confirma con GexBot el acceso y su precio antes de comprar.
- Internet para instalar dependencias y recibir datos.
- Un Mac para las alertas de escritorio. La instalación completa en Windows/Linux aún no está verificada; las alertas nativas no funcionan ahí. Deja **Level Alerts** desactivado en esos sistemas.

## Instalar el código manualmente

Elige una opción:

| Opción | Para qué sirve |
| --- | --- |
| Copia con Git gestionada por tu agente | Facilita recibir mejoras cuando tú lo pidas. No necesitas aprender Git, crear un fork ni una cuenta de GitHub para descargar un repositorio público. |
| Descargar ZIP | No requiere Git. Descarga el ZIP de una versión publicada o usa **Code → Download ZIP** en GitHub. Extrae la carpeta y guárdala en un lugar fijo. |

Con Git:

```sh
git clone https://github.com/nicolasgomeztoua/gex-cockpit.git
cd gex-cockpit
```

Con ZIP, abre una terminal dentro de la carpeta extraída que contiene `package.json`. Después, en ambos casos:

1. Instala Bun siguiendo sus [instrucciones oficiales](https://bun.com/docs/installation) y comprueba `bun --version`.
2. Copia `.env.example` a `.env.local`. Abre la copia con un editor local y escribe tu clave después de `GEXBOT_API_KEY=`. No compartas la clave en chats, capturas, incidencias ni comandos de terminal.
3. Ejecuta uno por uno:

```sh
bun install --frozen-lockfile
bun run build
bun start
```

`install` descarga las dependencias exactas. `build` prepara la interfaz. `start` inicia la app y la recogida de datos. La base de datos se crea sola: no necesitas instalar otro servidor.

Abre **http://127.0.0.1:4321**. Mantén la terminal abierta y el ordenador despierto. Comprueba que ambos gráficos reciben datos. “Stream connected” solo indica conexión con la app local; no garantiza datos de mercado recientes. Al instalar por primera vez no tendrás sesiones grabadas. Fuera del horario de mercado, el historial puede estar vacío.

## Uso diario y actualizaciones

Para abrirla otro día, ejecuta `bun start` en la misma carpeta. Para detenerla, pulsa **Ctrl+C** en esa terminal. Cerrar el navegador no detiene el servidor. La app no arranca automáticamente al encender el ordenador y no recoge precios mientras el ordenador duerme o está apagado.

Lee la [guía de uso en español](docs/trader-guide.md#español). En Mac, prueba **Test desktop alert** y confirma que ves o escuchas la alerta. La app consulta precios normalmente cada 10 segundos; puede perder un toque muy breve entre consultas. Sirve de contexto, no de recomendación de inversión ni de fuente de ejecución.

**No hay actualizaciones automáticas.** Si te gusta la versión actual, puedes quedarte con ella sin usar Git. Si algún día quieres mejoras, tu agente seguirá la [guía de actualizaciones y copias](docs/updates.md#español). Un cambio futuro de GexBot o del sistema operativo podría exigir actualizar.

## Más información

- [Instalación y resolución de problemas para agentes](AGENTS.md): el agente debe traducir sus explicaciones al idioma elegido.
- [Guía de controles en español](docs/trader-guide.md#español)
- [Configuración técnica](docs/configuration.md)
- [Contribuciones](CONTRIBUTING.md) · [Seguridad](SECURITY.md)

Licencia MIT: [LICENSE](LICENSE). Las bibliotecas mantienen sus propias licencias: [avisos de terceros](THIRD_PARTY_NOTICES.md).
