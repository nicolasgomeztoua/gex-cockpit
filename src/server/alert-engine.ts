import { LEVEL_KEYS, type LayerSettings, type LevelKey } from "../client/theme";
import type { FeedSnapshot } from "../shared/types";
import { AlertStore } from "./alert-store";

const FRESH_MS = 120_000;
const SOURCE: Record<LevelKey, [FeedSnapshot["kind"], keyof FeedSnapshot["majors"]]> = {
  mlg: ["gamma", "posVol"], msg: ["gamma", "negVol"],
  mcg: ["state", "posVol"], mpg: ["state", "negVol"],
  zg: ["oi", "zeroGamma"], mpv: ["oi", "posVol"], mnv: ["oi", "negVol"],
  mpo: ["oi", "posOI"], mno: ["oi", "negOI"],
};

export function enabledFeeds(settings: LayerSettings): Set<string> {
  return new Set([...enabledRules(settings)].map(rule => {
    const [ticker, level] = rule.split(":");
    return `${ticker}:${SOURCE[level as LevelKey][0]}`;
  }));
}

export function enabledRules(settings: LayerSettings): Set<string> {
  return new Set(settings.alerts.enabled
    ? (["NDX", "QQQ"] as const).flatMap(t => LEVEL_KEYS.filter(k => settings.tickers[t].levels[k].alert).map(k => `${t}:${k}`))
    : []);
}

/** Compare native prices, so changing the display conversion cannot trigger an alert. */
export function evaluateAlerts(store: AlertStore, snap: FeedSnapshot, settings: LayerSettings, now = Date.now()): void {
  if (!settings.alerts.enabled || snap.ticker === "NQ_NDX" || snap.status !== "live"
    || !Number.isFinite(snap.spot) || snap.spot <= 0 || !Number.isFinite(snap.providerTs)
    || now - snap.providerTs * 1000 > FRESH_MS || snap.providerTs * 1000 > now + 10_000) return;
  const ticker = snap.ticker;
  // Observation advancement and outbox insertion commit together; a crash cannot lose a fired alert.
  store.db.transaction(() => {
    for (const level of LEVEL_KEYS) {
      const [kind, field] = SOURCE[level];
      if (kind !== snap.kind || !settings.tickers[ticker].levels[level].alert) continue;
      const rule = `${ticker}:${level}`;
      const price = snap.majors[field];
      if (price === null || !Number.isFinite(price) || price <= 0) {
        store.db.query("DELETE FROM alert_observations WHERE rule = ?").run(rule);
        continue;
      }
      const previous = store.observation(rule);
      if (previous && snap.providerTs <= previous.ts) continue;
      const continuous = previous && (snap.providerTs - previous.ts) * 1000 <= FRESH_MS && previous.price === price;
      // A moved level is a fresh baseline. Never infer a touch from level movement or an outage.
      const crossed = continuous && previous.spot !== price && (previous.spot - price) * (snap.spot - price) < 0;
      const touching = snap.spot === price;
      const armed = !continuous || previous.armed;
      const firedAt = previous?.firedAt ?? 0;
      const fire = armed && (touching || crossed) && (!firedAt || now - firedAt >= settings.alerts.cooldownSec * 1000);
      store.observe(rule, {
        spot: snap.spot, price, ts: snap.providerTs,
        armed: touching ? (fire ? false : armed) : true,
        firedAt: fire ? now : firedAt,
      });
      if (fire) store.enqueue({
        rule, ticker, level, price, spot: snap.spot, createdAt: now,
        notify: settings.alerts.notify, sound: settings.alerts.sound,
      });
    }
  }).immediate();
}
