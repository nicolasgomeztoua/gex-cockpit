import { createInterface } from "node:readline";
import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const DESKTOP = process.env.GEX_DESKTOP === "1";

/** Every route, including SSE, is private to this launch of the desktop app. */
export function desktopAuth(token: string, development = false): MiddlewareHandler {
  if (token.length < 32) throw new Error("Desktop session token is missing");
  const origins = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);
  if (development) origins.add("http://127.0.0.1:5173");
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin)) return c.text("Forbidden", 403);
    if (origin) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Vary", "Origin");
      c.header("Access-Control-Allow-Headers", "Content-Type, X-Gex-Session");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    const supplied = Buffer.from(c.req.header("x-gex-session") ?? "");
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return c.text("Unauthorized", 401);
    }
    c.header("Cache-Control", "no-store");
    await next();
  };
}

const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();

/** stdout is a private, line-delimited protocol; ordinary logs are ignored by the host. */
export function desktopMessage(message: object): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

export function startDesktopBridge(): void {
  const input = createInterface({ input: process.stdin });
  input.on("line", line => {
    try {
      const ack = JSON.parse(line);
      if (ack.type !== "notification-result") return;
      const request = pending.get(ack.id);
      if (ack.ok) request?.resolve();
      else request?.reject(new Error("Native notification was not accepted"));
    } catch { /* Ignore malformed protocol messages. */ }
  });
  // The app owns our lifetime, including a parent crash. Never leave an orphan poller.
  input.on("close", () => process.exit(0));
}

export async function desktopNotification(title: string, body: string, sound: string): Promise<void> {
  const id = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      timer = setTimeout(() => reject(new Error("Native notification timed out")), 10_000);
      desktopMessage({ type: "notification", id, title, body, sound });
    });
  } finally {
    clearTimeout(timer);
    pending.delete(id);
  }
}
