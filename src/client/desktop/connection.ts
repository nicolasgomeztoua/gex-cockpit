import { invoke, isTauri } from "@tauri-apps/api/core";

export const isDesktop = isTauri();
export interface DesktopContext {
  apiBase: string;
  token: string;
  hasKey: boolean;
  dataDir: string;
  version: string;
}
let context: DesktopContext | undefined;
export async function connectDesktop(): Promise<DesktopContext> {
  context = await invoke<DesktopContext>("desktop_context");
  return context;
}
export async function saveDesktopKey(key: string): Promise<void> {
  await invoke("save_key", { key });
}

/** The provider key never reaches this module or browser persistence. */
export const apiFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (!isDesktop) return fetch(input, init);
  if (!context?.apiBase) return Promise.reject(new Error("Desktop backend is not connected"));
  const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
  if (!url.pathname.startsWith("/api/")) return Promise.reject(new Error("Invalid API path"));
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set("X-Gex-Session", context.token);
  const target = `${context.apiBase}${url.pathname}${url.search}`;
  return fetch(input instanceof Request ? new Request(target, input) : target, { ...init, headers });
};
