import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LEVEL_META } from "../client/theme";
import type { AlertEvent, AlertStore } from "./alert-store";

const exec = promisify(execFile);
const sounds = { off: "", ping: "Ping", chime: "Glass", blip: "Pop" } as const;

/** argv carries the content; never interpolate provider data into AppleScript or a shell. */
export async function deliverNativeAlert(event: AlertEvent): Promise<void> {
  if (process.platform !== "darwin") throw new Error("Desktop alert delivery requires macOS on the backend host");
  const name = LEVEL_META[event.level].name;
  await exec("/usr/bin/osascript", ["-e", `on run argv
    display notification (item 2 of argv) with title (item 1 of argv)
  end run`, event.rule === "test" ? "GEX Cockpit — test alert" : `${event.ticker} touched ${name}`, event.rule === "test" ? "Desktop alerts are sent by the backend." : `${name}: ${event.price.toFixed(2)} · spot: ${event.spot.toFixed(2)} (native units)`], { timeout: 10_000 });
  // Independent of browser autoplay and notification banner sound preferences.
  const sound = sounds[event.sound];
  if (sound) await exec("/usr/bin/afplay", [`/System/Library/Sounds/${sound}.aiff`], { timeout: 10_000 });
}

export async function deliverDueAlerts(store: AlertStore, deliver: (e: AlertEvent) => Promise<void>, clock: () => number = Date.now): Promise<void> {
  // Bounded work per pass; leases also exclude a second backend sharing this DB.
  for (let i = 0; i < 18; i++) {
    const event = store.claim(clock());
    if (!event) break;
    try {
      await deliver(event);
      store.delivered(event, clock());
    } catch (error) {
      store.failed(event, clock(), error instanceof Error ? error.message : String(error));
    }
  }
}
