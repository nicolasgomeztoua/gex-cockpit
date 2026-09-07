import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../theme";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe("settings hydration", () => {
  it("does not overwrite an already-saved edit with a delayed GET response", async () => {
    const mirror = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mirror.get(k) ?? null,
      setItem: (k: string, v: string) => mirror.set(k, v),
      removeItem: (k: string) => mirror.delete(k),
    });
    let resolveGet!: (r: Response) => void;
    let backend = structuredClone(DEFAULT_SETTINGS);
    const old = structuredClone(backend);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "PUT") {
        backend = JSON.parse(options.body as string);
        return Response.json({ ok: true });
      }
      return new Promise<Response>(resolve => { resolveGet = resolve; });
    }));
    const { hydrateSettings, useSettingsStore } = await import("./settingsStore");
    hydrateSettings();
    await vi.waitFor(() => expect(resolveGet).toBeDefined());
    const next = structuredClone(DEFAULT_SETTINGS); next.alerts.enabled = true;
    useSettingsStore.getState().setSettings(next);
    await vi.waitFor(() => expect(useSettingsStore.getState().saveStatus).toBe("saved"));
    resolveGet(Response.json({ settings: old }));
    await vi.waitFor(() => expect(useSettingsStore.getState().hydrated).toBe(true));
    expect(backend.alerts.enabled).toBe(true);
    expect(useSettingsStore.getState().settings.alerts.enabled).toBe(true);
  });
});
