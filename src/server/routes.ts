import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { loadClientSettings, saveClientSettings, spotHistory, zgHistory } from "./db";
import {
  MOCK,
  REPLAY_DATE,
  mockSpotHistory,
  mockZgHistory,
  conversions,
  snapshots,
  subscribe,
  subscribeConversions,
} from "./poller";
import { controlReplay, replayInitPayload, subscribeReplay } from "./replay";
import type { InitPayload } from "../shared/types";

/** Client settings are an opaque blob; only the envelope is policed. */
const MAX_SETTINGS_BYTES = 256 * 1024;

/**
 * Tolerant on purpose: new settings keys must round-trip without a server
 * release, so unknown properties pass through untouched. What is enforced is
 * that the body is a JSON *object* (not an array, string or number) and that it
 * cannot be used to write an unbounded blob into SQLite.
 */
const settingsBody = z.looseObject({});

const replayBody = z.object({
  action: z.enum(["play", "pause", "seek", "speed"]),
  value: z.number().optional(),
});

function initPayload(): InitPayload {
  if (REPLAY_DATE) return replayInitPayload();
  return {
    feeds: snapshots(),
    conversions: conversions(),
    spotHistory: MOCK
      ? { NDX: mockSpotHistory("NDX"), QQQ: mockSpotHistory("QQQ"), NQ_NDX: mockSpotHistory("NQ_NDX") }
      : { NDX: spotHistory("NDX"), QQQ: spotHistory("QQQ"), NQ_NDX: spotHistory("NQ_NDX") },
    zgHistory: MOCK
      ? { NDX: mockZgHistory("NDX"), QQQ: mockZgHistory("QQQ"), NQ_NDX: mockZgHistory("NQ_NDX") }
      : { NDX: zgHistory("NDX"), QQQ: zgHistory("QQQ"), NQ_NDX: zgHistory("NQ_NDX") },
    mock: MOCK,
    replay: null,
  };
}

/**
 * The API surface. Declared as one chained expression so `AppType` carries every
 * route — that inference is what makes the client's `hono/client` calls typed.
 */
export const api = new Hono()
  .get("/api/health", c => c.json({ status: "ok", feeds: snapshots().length }))

  // Latest major levels for all feeds — consumption point for external
  // automations (e.g. pushing levels into TradingView).
  .get("/api/levels", c => {
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
    return c.json(out);
  })

  .get("/api/stream", c =>
    streamSSE(c, async stream => {
      let closed = false;
      const unsubscribes: Array<() => void> = [];
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let release!: () => void;
      // streamSSE closes the response as soon as this callback resolves, so the
      // handler parks here until the client goes away.
      const untilDisconnected = new Promise<void>(resolve => {
        release = resolve;
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        for (const off of unsubscribes) off();
        unsubscribes.length = 0;
        if (heartbeat) clearInterval(heartbeat);
        release();
      };

      // Store callbacks are synchronous but writeSSE is not: funnel every write
      // through one promise chain so two updates can never interleave a frame.
      let writes: Promise<void> = Promise.resolve();
      const enqueue = (write: () => Promise<unknown>) => {
        writes = writes
          .then(async () => {
            if (closed) return;
            await write();
          })
          .catch(cleanup);
      };
      const send = (event: string, data: unknown) =>
        enqueue(() => stream.writeSSE({ event, data: JSON.stringify(data) }));

      stream.onAbort(cleanup);

      send("init", initPayload());
      unsubscribes.push(subscribe(snap => send("update", snap)));
      unsubscribes.push(subscribeConversions(conversion => send("conversion", conversion)));
      unsubscribes.push(subscribeReplay(message => send(message.event, message.data)));
      // Stay visibly alive through local proxies as well as the browser. Bun's
      // own idle timeout is disabled for this route in index.ts.
      heartbeat = setInterval(() => enqueue(() => stream.write(": hb\n\n")), 5_000);

      await untilDisconnected;
    }),
  )

  .get("/api/settings", c => c.json({ settings: loadClientSettings() }))

  .put(
    "/api/settings",
    async (c, next) => {
      const declared = Number(c.req.header("content-length") ?? 0);
      if (declared > MAX_SETTINGS_BYTES) {
        return c.json({ error: "settings payload too large" }, 413);
      }
      const actual = (await c.req.raw.clone().arrayBuffer()).byteLength;
      if (actual > MAX_SETTINGS_BYTES) {
        return c.json({ error: "settings payload too large" }, 413);
      }
      // The original Bun route treated the body as JSON regardless of its
      // Content-Type, and the unchanged acceptance probes send fetch bodies as
      // text/plain. Normalize this endpoint's declared JSON contract before
      // Hono's JSON target parses and zod validates the actual body.
      c.req.raw.headers.set("content-type", "application/json");
      await next();
    },
    zValidator("json", settingsBody, (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message ?? "invalid request body" }, 400);
      }
    }),
    c => {
      const json = JSON.stringify(c.req.valid("json"));
      // content-length is advisory (and absent on chunked bodies) — this is the
      // check that actually bounds what reaches SQLite.
      if (new TextEncoder().encode(json).byteLength > MAX_SETTINGS_BYTES) {
        return c.json({ error: "settings payload too large" }, 413);
      }
      saveClientSettings(json);
      return c.json({ ok: true });
    },
  )

  .post(
    "/api/replay",
    // Checked ahead of validation so a request to a live server always reads as
    // "wrong mode" rather than "bad body".
    async (c, next) => {
      if (!REPLAY_DATE) return c.json({ error: "replay mode is not active" }, 409);
      await next();
    },
    zValidator("json", replayBody, (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message ?? "invalid request body" }, 400);
      }
    }),
    c => {
      const { action, value } = c.req.valid("json");
      try {
        return c.json({ ok: true, replay: controlReplay(action, value) });
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
      }
    },
  );

api.onError((error, c) => {
  const isJsonEndpoint = c.req.path === "/api/settings" || c.req.path === "/api/replay";
  if (
    isJsonEndpoint
    && error instanceof HTTPException
    && error.status === 400
    && error.message === "Malformed JSON in request body"
  ) {
    return c.json({ error: "invalid JSON" }, 400);
  }
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return c.json({ error: "internal server error" }, 500);
});

export type AppType = typeof api;
