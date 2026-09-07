# App tour / Guía de uso

This explains the controls, not a trading strategy. Names below match the English interface. The agent should show each control in the running app and adapt its explanation to the user's chosen language.

## English

| What you see | What it does |
| --- | --- |
| NDX / QQQ | Two charts for different underlying instruments. Each can show multiple data layers; they are not broker order-entry panels. |
| Spot / candles | Provider price context through time. Candles group polled prices into one-minute buckets, not exchange OHLC. |
| State GEX Profile | Call/put exposure bars at strike prices using the selected State expiry aggregation. |
| Options Profile / Gamma | Separate long/short gamma information. It is not the same feed as the State call/put profile. |
| Open Interest / Classic | Volume and open-interest exposure layers; OI refers to outstanding option contracts. The default Classic aggregation covers 90 days. |
| Positive / negative bars | Provider exposure values on opposite sides of zero. They are not automatic buy/sell signals. |
| Prior profiles | Earlier snapshots for comparison with the current profile; they do not predict a future profile. |
| IVOL dots | Provider call/put implied-volatility markers. They are separate from gamma bars. |
| Major Long / Short Gamma | Highlighted levels from the Options Gamma feed. |
| State GEX Call / Put | Highlighted levels from the State feed. |
| Major Positive / Negative Volume and OI | Highlighted levels from the Classic feed, separated by volume or open interest. |
| Zero Gamma | Provider zero-gamma level; its line records changes across the session. |
| Settings / notification settings / home | Gear opens display settings; the notification bell opens global alerts; home returns to the main panel. NDX/QQQ scope tabs choose which instrument you are adjusting. |
| Price Axis Labels | Show or hide level markers on the price scale. This is separate from individual line labels. |
| Layer toggles | Show or hide each profile/price layer. These change your view, not the data subscription. |
| Line / label controls | Show a level's horizontal line and its name independently. |
| Bell beside a level | Select that level for touch alerts. The global Level Alerts switch must also be on. |
| NQ future | Convert NDX/QQQ display prices using GexBot's conversion parameters. This is not a direct NQ trade feed; parameters refresh about every 15 minutes. Alert detection still uses native NDX/QQQ prices. |
| Chart navigation / fit controls | Pan or zoom to inspect prices; fit returns the visible data to view. Display navigation does not change recorded prices. |
| History: Today / date / load | Load a recorded New York regular session (09:30–16:00 ET). Only data this installation collected is available. The timezone follows New York daylight saving, not the computer's timezone. |
| Seek / backward / forward / speed / play | Move through and replay the recording. Speed changes playback, not live polling. |
| Replay/live switch / Clear history | Return to the newest live display. Normal in-app replay continues live recording and live alert monitoring in the background. |
| Level Alerts | Enable monitoring of your selected levels. A sampled touch or crossing triggers an alert; merely being close does not. |
| Cooldown | Minimum repeat spacing for a level. A price sitting on a level does not continuously retrigger it. |
| Once / until refocus | Notify once, or repeat about every 25 seconds until the visible, focused app acknowledges the event. Turning off the alert or its level cancels pending notifications. |
| Sound / Test desktop alert | Choose sound and test the Mac delivery path. macOS permissions, Focus and volume still matter. |
| Alert status / recent events | Show pending delivery and failures. Events and pending delivery survive server restarts, but the server cannot observe prices while stopped. |
| Stream connected | Browser is connected to this local server. It does not guarantee that upstream market data is current. |
| Sidebar controls | Open, collapse or resize the settings panel; preferences persist locally. |

Settings are stored in your SQLite file; the browser also caches settings. History grows while the backend runs. There is no remote account or cloud backup. Do not delete `data/` to reset a display setting.

Native alerts require an awake Mac running the backend, even with the browser closed. Default polling is every ten seconds: a touch and reversal between samples can be missed. Gaps over two minutes or a changed level reset the touch baseline. Diagnostic startup replay and mock mode do not deliver live alerts; ordinary sidebar replay does.

## Español

La tabla explica los controles, no una estrategia de trading. La interfaz usa nombres en inglés; tu agente debe mostrarte dónde están.

| Lo que ves | Para qué sirve |
| --- | --- |
| NDX / QQQ | Dos gráficos de instrumentos distintos. Puedes activar varias capas en cada uno. No sirven para enviar órdenes a un bróker. |
| Spot / candles | Precio del proveedor a lo largo del tiempo. Las velas agrupan consultas de precio en intervalos de un minuto; no son velas oficiales de una bolsa. |
| State GEX Profile | Barras de exposición call/put por precio de ejercicio, según el vencimiento seleccionado. |
| Options Profile / Gamma | Información de gamma long/short. Es una fuente distinta al perfil call/put de State. |
| Open Interest / Classic | Capas de exposición por volumen e interés abierto. El interés abierto son contratos de opciones pendientes. La configuración Classic usa una agregación de 90 días. |
| Barras positivas / negativas | Valores del proveedor a ambos lados de cero. No son señales automáticas de compra o venta. |
| Prior profiles | Perfiles anteriores para comparar; no son una predicción. |
| IVOL dots | Puntos de volatilidad implícita de calls y puts. Son distintos de las barras gamma. |
| Major Long / Short Gamma | Niveles destacados de la fuente Options Gamma. |
| State GEX Call / Put | Niveles destacados de la fuente State. |
| Major Positive / Negative Volume y OI | Niveles destacados de Classic, por volumen o interés abierto. |
| Zero Gamma | Nivel de gamma cero del proveedor. La línea conserva sus cambios durante la sesión. |
| Settings / ajustes de alertas / home | La rueda abre ajustes visuales; la campana abre alertas globales; la casa vuelve al panel principal. Las pestañas NDX/QQQ eligen qué instrumento estás ajustando. |
| Price Axis Labels | Muestra u oculta marcadores en la escala de precios, por separado de las etiquetas de cada línea. |
| Interruptores de capas | Muestran u ocultan información. No cambian tu suscripción. |
| Line / label | Puedes mostrar u ocultar la línea de un nivel y su nombre por separado. |
| Campana de un nivel | Selecciona ese nivel para alertas de toque. También debes activar Level Alerts. |
| NQ future | Convierte los precios mostrados de NDX/QQQ con parámetros de GexBot. No es una cotización directa de operaciones NQ. Los parámetros se renuevan aproximadamente cada 15 minutos; las alertas siguen usando precios nativos de NDX/QQQ. |
| Mover / ampliar / ajustar gráfico | Explora el gráfico o vuelve a encajar los datos visibles. No cambia los precios guardados. |
| History: Today / fecha / cargar | Abre una sesión grabada de 09:30 a 16:00 de Nueva York. Solo hay datos recogidos por tu instalación. El horario sigue los cambios de hora de Nueva York. |
| Seek / atrás / adelante / velocidad / play | Recorre la grabación. Cambiar la velocidad no cambia las consultas en vivo. |
| Replay/live / Clear history | Vuelve a mostrar los últimos datos en vivo. Durante la reproducción normal, la app sigue grabando y vigilando alertas del mercado en vivo. |
| Level Alerts | Activa las alertas seleccionadas. Se dispara al observar un toque o cruce entre muestras; estar cerca no basta. |
| Cooldown | Tiempo mínimo entre avisos repetidos de un nivel. Quedarse sobre el nivel no genera avisos nuevos continuamente. |
| Once / until refocus | Avisar una vez o repetir aproximadamente cada 25 segundos hasta que vuelvas a la app visible y enfocada. Desactivar el nivel o las alertas cancela sus avisos pendientes. |
| Sound / Test desktop alert | Elige sonido y prueba los avisos de Mac. Comprueba permisos, volumen y modo Concentración. |
| Estado / eventos de alertas | Muestra avisos pendientes y fallos. Se conservan al reiniciar, pero no se detectan precios mientras la app está apagada. |
| Stream connected | Tu navegador está conectado al servidor local. No garantiza que GexBot esté enviando datos recientes. |
| Controles de la barra lateral | Abren, cierran o cambian el ancho del panel. Los ajustes se guardan localmente. |

Los ajustes y el historial se guardan en el archivo SQLite de tu ordenador. El navegador también guarda una copia de los ajustes. No existe cuenta remota ni copia automática en la nube. No borres `data/` para corregir un ajuste visual.

Las alertas necesitan un Mac despierto con el servidor activo, aunque cierres el navegador. La app suele consultar cada diez segundos: puede perder un toque breve entre consultas. Un hueco de más de dos minutos o un cambio de nivel reinicia la referencia para detectar toques. Los modos de diagnóstico MOCK y REPLAY al arrancar no envían alertas en vivo; la reproducción normal desde la barra lateral sí mantiene la vigilancia en vivo.
