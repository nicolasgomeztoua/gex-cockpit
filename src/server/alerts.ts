import { sqlite, loadClientSettings } from "./db";
import { settingsFromUnknown } from "../client/theme";
import { AlertStore } from "./alert-store";
import { enabledRules, evaluateAlerts } from "./alert-engine";
import { deliverNativeAlert, deliverDueAlerts } from "./alert-delivery";
import type { FeedSnapshot } from "../shared/types";

export const alertStore = new AlertStore(sqlite);
export function syncAlertSettings(): void {
  alertStore.syncEnabled(enabledRules(settingsFromUnknown(loadClientSettings())));
}
export function processLiveAlerts(snapshot: FeedSnapshot): void {
  const settings = settingsFromUnknown(loadClientSettings());
  evaluateAlerts(alertStore, snapshot, settings);
}

export function startAlertDelivery(): void {
  syncAlertSettings();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      syncAlertSettings();
      await deliverDueAlerts(alertStore, deliverNativeAlert);
    } catch (error) {
      console.error("[alerts]", error);
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => void tick(), 1000);
}
