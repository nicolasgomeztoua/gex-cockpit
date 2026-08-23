import index from "../client/index.html";
import {
  MOCK,
  REPLAY_DATE,
  mockSpotHistory,
  mockZgHistory,
  snapshots,
  startPoller,
  subscribe,
} from "./poller";
import { loadClientSettings, saveClientSettings, spotHistory, zgHistory } from "./db";
import {
  controlReplay,
  prepareReplay,
  replayInitPayload,
  subscribeReplay,
} from "./replay";
import type { InitPayload } from "../shared/types";

const PORT = Number(process.env.PORT ?? 4321);

if (REPLAY_DATE) {
  try {
    prepareReplay(REPLAY_DATE);
  } catch (err) {
    console.error(`[replay] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

function sseResponse(): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const init: InitPayload = REPLAY_DATE
        ? replayInitPayload()
        : {
            feeds: snapshots(),
            spotHistory: MOCK
              ? { NDX: mockSpotHistory("NDX"), QQQ: mockSpotHistory("QQQ"), NQ_NDX: mockSpotHistory("NQ_NDX") }
              : { NDX: spotHistory("NDX"), QQQ: spotHistory("QQQ"), NQ_NDX: spotHistory("NQ_NDX") },
            zgHistory: MOCK
              ? { NDX: mockZgHistory("NDX"), QQQ: mockZgHistory("QQQ"), NQ_NDX: mockZgHistory("NQ_NDX") }
              : { NDX: zgHistory("NDX"), QQQ: zgHistory("QQQ"), NQ_NDX: zgHistory("NQ_NDX") },
            mock: MOCK,
            replay: null,
          };
      send("init", init);

      const unsub = subscribe(snap => {
        try {
          send("update", snap);
        } catch {
          cleanup();
        }
      });
      const unsubReplay = subscribeReplay(message => {
        try {
          send(message.event, message.data);
        } catch {
          cleanup();
        }
      });
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);
      cleanup = () => {
        unsub();
        unsubReplay();
        clearInterval(heartbeat);
      };
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  routes: {
    "/": index,
    "/api/stream": () => sseResponse(),
    // Latest major levels for all feeds — consumption point for external
    // automations (e.g. pushing levels into TradingView).
    "/api/levels": () => {
      const out: Record<string, unknown> = {};
      for (const s of snapshots()) {
        out[s.feed] = {
          ticker: s.ticker,
          kind: s.kind,
          timestamp: s.providerTs,
          spot: s.spot,
          major_pos_vol: s.majors.posVol,
          major_neg_vol: s.majors.negVol,
          major_pos_oi: s.majors.posOI,
          major_neg_oi: s.majors.negOI,
          zero_gamma: s.majors.zeroGamma,
          net_gex_vol: s.netGexVol,
          net_gex_oi: s.netGexOI,
          status: s.status,
        };
      }
      return Response.json(out);
    },
    "/api/settings": {
      GET: () => Response.json({ settings: loadClientSettings() }),
      PUT: async req => {
        const body = await req.text();
        try {
          JSON.parse(body); // reject non-JSON before persisting
        } catch {
          return Response.json({ error: "invalid JSON" }, { status: 400 });
        }
        saveClientSettings(body);
        return Response.json({ ok: true });
      },
    },
    "/api/replay": {
      POST: async req => {
        if (!REPLAY_DATE) return Response.json({ error: "replay mode is not active" }, { status: 409 });
        try {
          const body = (await req.json()) as { action?: unknown; value?: unknown };
          if (typeof body.action !== "string") throw new Error("action is required");
          if (body.value !== undefined && typeof body.value !== "number") {
            throw new Error("value must be a number");
          }
          return Response.json({ ok: true, replay: controlReplay(body.action, body.value) });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 400 },
          );
        }
      },
    },
    "/api/health": () => Response.json({ status: "ok", feeds: snapshots().length }),
  },
  fetch() {
    return new Response("Not Found", { status: 404 });
  },
});

startPoller();
console.log(`GEX Cockpit → ${server.url}`);
