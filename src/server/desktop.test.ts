import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { desktopAuth } from "./desktop";

describe("desktop API boundary", () => {
  const token = "0123456789abcdef0123456789abcdef";
  const app = new Hono().use("*", desktopAuth(token)).all("/api/*", c => c.json({ ok: true }));
  it("rejects unauthenticated reads, writes and streams", async () => {
    for (const [path, method] of [["health", "GET"], ["settings", "PUT"], ["alerts/test", "POST"], ["stream", "GET"]]) {
      const res = await app.request(`/api/${path}`, { method });
      expect(res.status).toBe(401);
    }
  });
  it("accepts a private app request and sends an exact CORS origin", async () => {
    const res = await app.request("/api/settings", { headers: { "x-gex-session": token, origin: "tauri://localhost" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("tauri://localhost");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it("rejects unrelated websites even when they supply a valid session", async () => {
    for (const origin of ["https://evil.example", "null", "http://127.0.0.1:5173"]) {
      const res = await app.request("/api/settings", { headers: { "x-gex-session": token, origin } });
      expect(res.status).toBe(403);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
  it("allows preflight without revealing data, then authenticates the actual call", async () => {
    const res = await app.request("/api/settings", { method: "OPTIONS", headers: { origin: "http://tauri.localhost" } });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await app.request("/api/settings", { headers: { origin: "http://tauri.localhost" } })).status).toBe(401);
  });
  it("fails closed when the parent forgets the session token", () => {
    expect(() => desktopAuth("")).toThrow();
  });
});
