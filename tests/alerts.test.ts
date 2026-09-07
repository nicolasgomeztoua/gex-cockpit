import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlertStore } from "../src/server/alert-store";
import { evaluateAlerts, enabledRules } from "../src/server/alert-engine";
import { deliverDueAlerts } from "../src/server/alert-delivery";
import { DEFAULT_SETTINGS, settingsFromUnknown } from "../src/client/theme";
import type { FeedSnapshot } from "../src/shared/types";

const directories: string[] = [];
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); });
const now = 1_800_000_000_000;
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "gex-alert-test-")); directories.push(dir);
  const path = join(dir, "alerts.db");
  const db = new Database(path); databases.push(db);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
  const store = new AlertStore(db);
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.alerts.enabled = true;
  settings.alerts.cooldownSec = 0;
  settings.tickers.NDX.levels.mlg.alert = true;
  const sample = (spot: number, at = now, price = 100): FeedSnapshot => ({
    feed: "NDX:gamma", ticker: "NDX", kind: "gamma", aggregation: "full", providerTs: at / 1000,
    fetchedAt: at, spot, majors: { posVol: price, negVol: 90, posOI: 0, negOI: 0, zeroGamma: null },
    netGexVol: 0, netGexOI: 0, minDte: 0, strikes: [], status: "live",
  });
  const tick = (spot: number, at = now, price = 100) => evaluateAlerts(store, sample(spot, at, price), settings, at);
  return { store, settings, sample, tick, path };
}
describe("durable touch alerts", () => {
  test("old trigger and distance modes disappear; persistent preference survives", () => {
    const s = settingsFromUnknown({ alerts: { mode: "approach", distance: 10, notify: "untilFocus" } });
    expect(s.alerts).not.toHaveProperty("mode");
    expect(s.alerts).not.toHaveProperty("distance");
    expect(s.alerts.notify).toBe("untilFocus");
  });
  test("exact first observation alerts; nearby price does not", () => {
    const { tick, store } = setup(); tick(99); expect(store.recent()).toHaveLength(0);
    tick(100, now + 1000); expect(store.recent()).toHaveLength(1);
  });
  test("fresh first sample exactly touching fires without a warm-up", () => {
    const { tick, store } = setup(); tick(100); expect(store.recent()).toHaveLength(1);
  });
  test("passing through either direction counts", () => {
    for (const [a, b] of [[99, 101], [101, 99]]) {
      const { tick, store } = setup(); tick(a); tick(b, now + 1000); expect(store.recent()).toHaveLength(1);
    }
  });
  test("repeated timestamps and sitting on the level do not spam", async () => {
    const { tick, store } = setup(); tick(100);
    await deliverDueAlerts(store, async () => {}, () => now);
    tick(101); tick(100, now + 1000); tick(100, now + 2000);
    expect(store.recent()).toHaveLength(1);
  });
  test("move away then touch again rearms after cooldown", async () => {
    const { tick, store, settings } = setup(); settings.alerts.cooldownSec = 3;
    tick(100); await deliverDueAlerts(store, async () => {}, () => now);
    tick(99, now + 1000); tick(100, now + 2000); expect(store.recent()).toHaveLength(1);
    tick(99, now + 3000); tick(100, now + 4000); expect(store.recent()).toHaveLength(2);
  });
  test("moving levels, stale samples, invalid prices and gaps do not invent touches", () => {
    const { tick, store, sample, settings } = setup();
    tick(99); tick(99, now + 1000, 98); expect(store.recent()).toHaveLength(0);
    evaluateAlerts(store, sample(98, now + 2000, 98), settings, now + 200_000);
    tick(97, now + 300_000, 98);
    evaluateAlerts(store, { ...sample(98, now + 301_000, 98), status: "error" }, settings, now + 301_000);
    tick(NaN, now + 302_000, 98);
    expect(store.recent()).toHaveLength(0);
  });
  test("state and pending delivery survive reopening the database without a client", async () => {
    const { tick, path, settings, sample, store } = setup(); tick(99);
    const db2 = new Database(path); databases.push(db2);
    const restored = new AlertStore(db2);
    evaluateAlerts(restored, sample(101, now + 1000), settings, now + 1000);
    expect(restored.recent()).toHaveLength(1);
    const db3 = new Database(path); databases.push(db3);
    const rebooted = new AlertStore(db3);
    let delivered = 0; await deliverDueAlerts(rebooted, async () => { delivered++; }, () => now + 1000);
    expect(delivered).toBe(1); expect(store.recent()[0].deliveries).toBe(1);
    evaluateAlerts(rebooted, sample(101, now + 1000), settings, now + 1000);
    expect(store.recent()).toHaveLength(1);
  });
  test("separate backend processes detect and deliver using only SQLite state", () => {
    const { tick, path, settings, sample, store } = setup();
    tick(99);
    const detection = Bun.spawnSync([process.execPath, "-e", `
      import { Database } from "bun:sqlite";
      import { AlertStore } from "./src/server/alert-store";
      import { evaluateAlerts } from "./src/server/alert-engine";
      const db = new Database(process.argv[1]);
      evaluateAlerts(new AlertStore(db), JSON.parse(process.argv[2]), JSON.parse(process.argv[3]), ${now + 1000});
      db.close();
    `, path, JSON.stringify(sample(101, now + 1000)), JSON.stringify(settings)], { cwd: new URL("..", import.meta.url).pathname });
    expect(detection.exitCode).toBe(0);
    const delivery = Bun.spawnSync([process.execPath, "-e", `
      import { Database } from "bun:sqlite";
      import { AlertStore } from "./src/server/alert-store";
      import { deliverDueAlerts } from "./src/server/alert-delivery";
      const db = new Database(process.argv[1]);
      await deliverDueAlerts(new AlertStore(db), async () => {}, () => ${now + 1000});
      db.close();
    `, path], { cwd: new URL("..", import.meta.url).pathname });
    expect(delivery.exitCode).toBe(0);
    expect(store.recent()[0]).toMatchObject({ deliveries: 1, acknowledged: 1 });
  });
  test("failed delivery stays queued and retries after restart", async () => {
    const { tick, store, path } = setup(); tick(100);
    await deliverDueAlerts(store, async () => { throw new Error("offline"); }, () => now);
    expect(store.recent()[0]).toMatchObject({ deliveries: 0, acknowledged: 0, error: "offline" });
    const db2 = new Database(path); databases.push(db2); const restored = new AlertStore(db2);
    let delivered = 0;
    await deliverDueAlerts(restored, async () => { delivered++; }, () => now + 9999); expect(delivered).toBe(0);
    await deliverDueAlerts(restored, async () => { delivered++; }, () => now + 10000); expect(delivered).toBe(1);
    expect(restored.recent()[0]).toMatchObject({ deliveries: 1, acknowledged: 1, error: null });
  });
  test("until refocus exceeds old 20-repeat cap and stops after acknowledgment", async () => {
    const { tick, store, settings } = setup(); settings.alerts.notify = "untilFocus"; tick(100);
    for (let i = 0; i < 25; i++) await deliverDueAlerts(store, async () => {}, () => now + 25000 * i);
    expect(store.recent()[0].deliveries).toBe(25);
    store.acknowledge(store.recent()[0].id);
    await deliverDueAlerts(store, async () => { throw new Error("must not deliver"); }, () => now + 25000 * 26);
    expect(store.recent()[0]).toMatchObject({ deliveries: 25, acknowledged: 1, error: null });
  });
  test("focus cannot drop an undelivered alert or acknowledge later events", async () => {
    const { tick, store, settings } = setup(); settings.alerts.notify = "untilFocus"; tick(100);
    store.acknowledge(100); expect(store.recent()[0].acknowledged).toBe(0);
    await deliverDueAlerts(store, async () => {}, () => now);
    store.acknowledge(0); expect(store.recent()[0].acknowledged).toBe(0);
  });
  test("disabling a level cancels pending repeats and resets observation", () => {
    const { tick, store, settings } = setup(); tick(100);
    settings.tickers.NDX.levels.mlg.alert = false; store.syncEnabled(enabledRules(settings));
    expect(store.recent()[0].acknowledged).toBe(1); expect(store.observation("NDX:mlg")).toBeUndefined();
  });
  test("claim lease prevents duplicate workers and recovers after a crash", () => {
    const { tick, store, path } = setup(); tick(100);
    const otherDb = new Database(path); databases.push(otherDb); const other = new AlertStore(otherDb);
    expect(store.claim(now)).not.toBeNull(); expect(other.claim(now)).toBeNull();
    expect(other.claim(now + 30000)).not.toBeNull();
  });
  test("delivery acknowledgment racing a worker is not undone", async () => {
    const { tick, store, settings } = setup(); settings.alerts.notify = "untilFocus"; tick(100);
    await deliverDueAlerts(store, async () => {}, () => now);
    await deliverDueAlerts(store, async e => { store.acknowledge(e.id); }, () => now + 25000);
    expect(store.recent()[0].acknowledged).toBe(1);
  });
  test("every fresh pass-through can alert when cooldown is zero", async () => {
    const { tick, store } = setup();
    for (const [i, spot] of [99, 101, 99, 101].entries()) {
      tick(spot, now + i * 1000);
      await deliverDueAlerts(store, async () => {}, () => now + i * 1000);
    }
    expect(store.recent()).toHaveLength(3);
  });
  test("old persistent alerts remain acknowledgeable beyond the 50-row history", async () => {
    const { store, settings, tick } = setup(); settings.alerts.notify = "untilFocus"; tick(100);
    await deliverDueAlerts(store, async () => {}, () => now);
    for (let i = 0; i < 55; i++) {
      store.enqueue({ rule: "QQQ:mlg", ticker: "QQQ", level: "mlg", price: 100, spot: 100,
        createdAt: now, notify: "once", sound: "off" });
      await deliverDueAlerts(store, async () => {}, () => now);
    }
    expect(store.recent().some(e => !e.acknowledged)).toBe(false);
    expect(store.pending()).toHaveLength(1);
    store.acknowledge(store.pending()[0].id);
    expect(store.pending()).toHaveLength(0);
  });
  test("slow batches use the current clock for every lease and completion", async () => {
    const { store } = setup();
    for (let i = 0; i < 4; i++) store.enqueue({ rule: `rule${i}`, ticker: "NDX", level: "mlg",
      price: 100, spot: 100, createdAt: now, notify: "once", sound: "off" });
    let clock = now;
    await deliverDueAlerts(store, async e => {
      const lease = store.db.query<{ leaseUntil: number }, [number]>("SELECT leaseUntil FROM alert_events WHERE id = ?").get(e.id)!;
      expect(lease.leaseUntil).toBe(clock + 30000);
      clock += 16000;
    }, () => clock);
    expect(store.recent()[0].nextAt).toBe(clock + 25000);
  });
  test("an expired worker cannot overwrite its replacement worker", () => {
    const { store, tick } = setup(); tick(100);
    const expired = store.claim(now)!;
    const replacement = store.claim(now + 30000)!;
    store.failed(expired, now + 31000, "old failure");
    expect(store.recent()[0].error).toBeNull();
    store.delivered(expired, now + 31000);
    expect(store.recent()[0].deliveries).toBe(0);
    store.delivered(replacement, now + 31000);
    expect(store.recent()[0].deliveries).toBe(1);
  });

});
