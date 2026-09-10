import { DESKTOP, desktopMessage, startDesktopBridge } from "./desktop";
import { startAlertDelivery } from "./alerts";
import { app } from "./app";
import { REPLAY_DATE, startPoller } from "./poller";
import { prepareReplay } from "./replay";

const PORT = Number(process.env.PORT ?? 4321);

if (REPLAY_DATE) {
  try {
    prepareReplay(REPLAY_DATE);
  } catch (err) {
    console.error(`[replay] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  fetch(request, bunServer) {
    // Bun closes streaming responses after 10 idle seconds by default. Feed
    // updates can be quieter than that, so exempt the SSE route and let its
    // application heartbeat own connection liveness.
    if (new URL(request.url).pathname === "/api/stream") {
      bunServer.timeout(request, 0);
    }
    return app.fetch(request);
  },
});

// The poller bootstraps its provider connection after the local server binds,
// so health/SSE remain available while an offline provider is retrying.
if (DESKTOP) {
  startDesktopBridge();
  desktopMessage({ type: "ready", port: server.port });
}

if (!REPLAY_DATE && !(process.env.MOCK && process.env.MOCK !== "0")) startAlertDelivery();
if (!DESKTOP || process.env.GEXBOT_API_KEY || REPLAY_DATE) startPoller();
console.log(`GEX Cockpit → ${server.url}`);
