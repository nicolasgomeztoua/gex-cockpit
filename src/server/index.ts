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
  fetch: app.fetch,
});

startPoller();
console.log(`GEX Cockpit → ${server.url}`);
