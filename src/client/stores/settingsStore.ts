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
  setSettings: (s: LayerSettings) => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** The server intentionally accepts any JSON object so future keys survive. */
const settingsJson = (settings: LayerSettings): Record<string, unknown> =>
  settings as unknown as Record<string, unknown>;

/**
 * Settings state backed by the server's SQLite (`/api/settings`), mirrored in
 * localStorage for instant boot. Server copy wins on load; writes are
 * debounced. Falls back to the local mirror if the server is unreachable.
 */
export const useSettingsStore = create<SettingsStore>(set => ({
  settings: fromMirror(),
  hydrated: false,
  setSettings: (s: LayerSettings) => {
    set({ settings: s });
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(s));
    } catch {
      /* non-fatal */
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void rpc.api.settings.$put({ json: settingsJson(s) }).catch(() => {});
    }, 400);
  },
}));

let hydrateStarted = false;

/** Load the server copy once at boot (idempotent). */
export function hydrateSettings(): void {
  if (hydrateStarted) return;
  hydrateStarted = true;
  void (async () => {
    try {
      const res = await rpc.api.settings.$get();
      const { settings: remote } = (await res.json()) as { settings: unknown };
      if (remote) {
        const merged = settingsFromUnknown(remote);
        useSettingsStore.setState({ settings: merged, hydrated: true });
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
        await rpc.api.settings.$put({ json: settingsJson(seed) });
        localStorage.setItem(MIRROR_KEY, JSON.stringify(seed));
      }
    } catch {
      // offline from server — the mirror stays authoritative for this session
      useSettingsStore.setState({ hydrated: true });
    }
  })();
}
