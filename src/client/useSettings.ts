import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  migrateV3,
  settingsFromUnknown,
  type LayerSettings,
} from "./theme";

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

/**
 * Settings state backed by the server's SQLite (`/api/settings`), mirrored in
 * localStorage for instant boot. Server copy wins on load; writes are
 * debounced. Falls back to the local mirror if the server is unreachable.
 */
export function useSettings(): [LayerSettings, (s: LayerSettings) => void] {
  const [settings, setState] = useState<LayerSettings>(fromMirror);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings");
        const { settings: remote } = (await res.json()) as { settings: unknown };
        if (cancelled) return;
        if (remote) {
          const merged = settingsFromUnknown(remote);
          setState(merged);
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
          setState(seed);
          await fetch("/api/settings", { method: "PUT", body: JSON.stringify(seed) });
          localStorage.setItem(MIRROR_KEY, JSON.stringify(seed));
        }
      } catch {
        /* offline from server — mirror stays authoritative for this session */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSettings = (s: LayerSettings) => {
    setState(s);
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(s));
    } catch {
      /* non-fatal */
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetch("/api/settings", { method: "PUT", body: JSON.stringify(s) }).catch(() => {});
    }, 400);
  };

  return [settings, setSettings];
}
