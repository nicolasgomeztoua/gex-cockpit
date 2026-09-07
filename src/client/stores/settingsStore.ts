import { create } from "zustand";
import { rpc } from "../api";
import {
  DEFAULT_SETTINGS,
  migrateV3,
  settingsFromUnknown,
  type LayerSettings,
} from "../theme";

const MIRROR_KEY = "gex-cockpit-settings-v4"; // instant-boot cache of the server copy
const V3_KEY = "gex-cockpit-settings-v3";

function fromMirror(): LayerSettings {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    if (raw) return settingsFromUnknown(JSON.parse(raw));
  } catch {
    /* defaults */
  }
  return structuredClone(DEFAULT_SETTINGS);
}

interface SettingsStore {
  settings: LayerSettings;
  /** true once the server copy has been loaded (or confirmed absent) */
  hydrated: boolean;
  saveStatus: "loading" | "saving" | "saved" | "error";
  setSettings: (s: LayerSettings) => void;
}

let pending: LayerSettings | null = null;
let writing = false;
let editRevision = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const PENDING_KEY = "gex-cockpit-settings-pending";

async function flushSettings(): Promise<void> {
  if (writing || !pending) return;
  writing = true;
  if (retryTimer) clearTimeout(retryTimer);
  try {
    while (pending) {
      const next: LayerSettings = pending;
      const response = await rpc.api.settings.$put({ json: settingsJson(next) }, { init: { signal: AbortSignal.timeout(10_000) } });
      if (!response.ok) throw new Error("Settings save failed");
      if (pending === next) {
        pending = null;
        try { localStorage.removeItem(PENDING_KEY); } catch { /* optional mirror */ }
        useSettingsStore.setState({ saveStatus: "saved" });
      }
    }
  } catch {
    useSettingsStore.setState({ saveStatus: "error" });
    retryTimer = setTimeout(() => void flushSettings(), 3000);
  } finally { writing = false; }
}

/** The server intentionally accepts any JSON object so future keys survive. */
const settingsJson = (settings: LayerSettings): Record<string, unknown> =>
  settings as unknown as Record<string, unknown>;

/**
 * Settings state backed by the server's SQLite (`/api/settings`), mirrored in
 * localStorage for instant boot. Writes are serialized and retried; unsaved user edits survive reloads in a
 * local mirror. A failed save remains visibly unconfirmed.
 */
export const useSettingsStore = create<SettingsStore>(set => ({
  settings: fromMirror(),
  hydrated: false,
  saveStatus: "loading",
  setSettings: (s: LayerSettings) => {
    editRevision++;
    set({ settings: s, saveStatus: "saving" });
    pending = s;
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(s));
      localStorage.setItem(PENDING_KEY, JSON.stringify(s));
    } catch {
      /* non-fatal */
    }
    void flushSettings();
  },
}));

let hydrateStarted = false;

/** Load the server copy once at boot (idempotent). */
export function hydrateSettings(): void {
  if (hydrateStarted) return;
  hydrateStarted = true;
  const startedAtRevision = editRevision;
  void (async () => {
    try {
      const res = await rpc.api.settings.$get(undefined, { init: { signal: AbortSignal.timeout(10_000) } });
      if (!res.ok) throw new Error("Settings load failed");
      const { settings: remote } = (await res.json()) as { settings: unknown };
      if (editRevision !== startedAtRevision) {
        useSettingsStore.setState({ hydrated: true });
        return;
      }
      // An unsaved local edit is explicit user intent, including across a reload.
      const unsaved = localStorage.getItem(PENDING_KEY);
      if (pending || unsaved) {
        const next = pending ?? settingsFromUnknown(JSON.parse(unsaved!));
        useSettingsStore.setState({ hydrated: true });
        useSettingsStore.getState().setSettings(next);
      } else if (remote) {
        const merged = settingsFromUnknown(remote);
        useSettingsStore.setState({ settings: merged, hydrated: true, saveStatus: "saved" });
        localStorage.setItem(MIRROR_KEY, JSON.stringify(merged));
      } else {
        // first run against this DB: seed from old local settings if present
        let seed = fromMirror();
        const v3raw = localStorage.getItem(V3_KEY);
        if (v3raw && !localStorage.getItem(MIRROR_KEY)) {
          try {
            seed = migrateV3(JSON.parse(v3raw) as Record<string, unknown>);
          } catch {
            /* defaults */
          }
        }
        localStorage.removeItem(V3_KEY);
        useSettingsStore.setState({ settings: seed, hydrated: true });
        useSettingsStore.getState().setSettings(seed);
        localStorage.setItem(MIRROR_KEY, JSON.stringify(seed));
      }
    } catch {
      useSettingsStore.setState({ hydrated: true, saveStatus: "error" });
      // Retry reading; do not overwrite server settings with an unverified cache.
      hydrateStarted = false;
      setTimeout(hydrateSettings, 3000);
    }
  })();
}
