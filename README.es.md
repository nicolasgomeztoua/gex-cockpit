# GEX Cockpit

**Español · [English](README.md)**

Un panel local para traders que usan datos de [GexBot](https://www.gexbot.com). Muestra precios de NDX y QQQ, perfiles de exposición gamma y niveles importantes. Permite reproducir las sesiones que hayas grabado y recibir alertas de escritorio en macOS. No se conecta a un bróker ni envía órdenes.

Funciona en tu ordenador. La clave API, los ajustes y el historial se guardan ahí. La app consulta GexBot para obtener datos. El código abierto no incluye una suscripción de datos ni derechos para redistribuirlos. Es un proyecto independiente, no una aplicación oficial de GexBot o TradingView.

## Que tu agente de IA lo instale

Abre la carpeta del proyecto con un agente que pueda trabajar en tu ordenador y pega esto:

> Ayúdame a instalar GEX Cockpit. Antes de hacer nada, pregunta si prefiero español o inglés y espera mi respuesta. Lee AGENTS.md y sigue docs/agent-setup.md. Explica cada paso y todos los controles principales con palabras sencillas. Ayúdame a elegir entre una instalación con actualizaciones opcionales y una copia ZIP sin Git. Nunca actualices automáticamente. Mantén mi clave API privada y comprueba que la app recibe datos antes de dar la instalación por terminada.

No necesitas saber programar. El agente se encarga de los pasos técnicos y debe dejarte instrucciones claras para abrir y cerrar la app. **La interfaz sigue usando etiquetas en inglés**; el agente te las explicará en español.

## Qué necesitas

- [Bun](https://bun.com/docs/installation): el programa que ejecuta la app. Esta versión se prueba con **Bun 1.3.12**.
- Tu propia clave API de GexBot con acceso a los datos necesarios. Confirma con GexBot el acceso y su precio antes de comprar.
- Internet para instalar dependencias y recibir datos.
- Un Mac para las alertas de escritorio. La instalación completa en Windows/Linux aún no está verificada; las alertas nativas no funcionan ahí. Deja **Level Alerts** desactivado en esos sistemas.

## Instalación manual

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

- [Instalación y resolución de problemas para agentes](docs/agent-setup.md): el agente debe traducir sus explicaciones al idioma elegido.
- [Guía de controles en español](docs/trader-guide.md#español)
- [Configuración técnica](docs/technical-reference.md)
- [Contribuciones](CONTRIBUTING.md) · [Seguridad](SECURITY.md)

Licencia MIT: [LICENSE](LICENSE). Las bibliotecas mantienen sus propias licencias: [avisos de terceros](THIRD_PARTY_NOTICES.md).
