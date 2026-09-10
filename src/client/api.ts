import { apiFetch } from "./desktop/connection";
import { hc } from "hono/client";
// Type-only: erased at build time, so nothing from the server module graph or
// its environment-variable names can reach the client bundle.
import type { AppType } from "../server/app";

/**
 * Typed RPC client for the backend. Same-origin in production, and through the
 * Vite dev proxy in development — a relative base works for both.
 *
 * `/api/stream` deliberately stays outside this: it is an EventSource, not a
 * request/response call.
 */
export const rpc = hc<AppType>("/", { fetch: apiFetch });
