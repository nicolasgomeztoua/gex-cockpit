import type { Database } from "bun:sqlite";
import type { AlertNotify, AlertSound, LevelKey, TickerKey } from "../client/theme";

export interface Observation {
  spot: number;
  price: number;
  ts: number;
  armed: boolean;
  firedAt: number;
}
export interface AlertEvent {
  id: number;
  rule: string;
  ticker: TickerKey;
  level: LevelKey;
  price: number;
  spot: number;
  createdAt: number;
  notify: AlertNotify;
  sound: AlertSound;
  deliveries: number;
  nextAt: number;
  acknowledged: number;
  error: string | null;
  leaseToken?: string;
}

/** All trigger state and delivery work lives on disk, including retry deadlines. */
export class AlertStore {
  constructor(readonly db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS alert_observations (rule TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS alert_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, rule TEXT NOT NULL,
        ticker TEXT NOT NULL, level TEXT NOT NULL, price REAL NOT NULL, spot REAL NOT NULL,
        createdAt INTEGER NOT NULL, notify TEXT NOT NULL, sound TEXT NOT NULL,
        deliveries INTEGER NOT NULL DEFAULT 0, nextAt INTEGER NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0, error TEXT,
        leaseUntil INTEGER NOT NULL DEFAULT 0, leaseToken TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS alert_due ON alert_events(acknowledged, nextAt);
      CREATE UNIQUE INDEX IF NOT EXISTS alert_pending_rule ON alert_events(rule) WHERE acknowledged = 0;
    `);
    // Upgrade an existing alert store without dropping its pending work.
    const columns = db.query<{ name: string }, []>("PRAGMA table_info(alert_events)").all();
    if (!columns.some(c => c.name === "leaseToken")) db.exec("ALTER TABLE alert_events ADD COLUMN leaseToken TEXT NOT NULL DEFAULT ''");
  }
  observation(rule: string): Observation | undefined {
    const row = this.db.query<{ payload: string }, [string]>("SELECT payload FROM alert_observations WHERE rule = ?").get(rule);
    return row ? JSON.parse(row.payload) : undefined;
  }
  observe(rule: string, value: Observation): void {
    this.db.query("INSERT INTO alert_observations VALUES (?, ?) ON CONFLICT(rule) DO UPDATE SET payload = excluded.payload")
      .run(rule, JSON.stringify(value));
  }
  enqueue(event: Omit<AlertEvent, "id" | "deliveries" | "nextAt" | "acknowledged" | "error">): void {
    this.db.query(`INSERT OR IGNORE INTO alert_events
      (rule,ticker,level,price,spot,createdAt,notify,sound,nextAt) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(event.rule, event.ticker, event.level, event.price, event.spot, event.createdAt, event.notify, event.sound, event.createdAt);
  }
  /** Snapshot ID prevents a focus request from acknowledging later alerts. */
  acknowledge(through: number): void {
    this.db.query("UPDATE alert_events SET acknowledged = 1 WHERE id <= ? AND notify = 'untilFocus' AND deliveries > 0")
      .run(through);
  }
  syncEnabled(enabledRules: Set<string>): void {
    this.db.transaction(() => {
      const rules = this.db.query<{ rule: string }, []>("SELECT rule FROM alert_observations UNION SELECT rule FROM alert_events WHERE acknowledged = 0").all();
      for (const { rule } of rules) if (!enabledRules.has(rule)) {
        this.db.query("DELETE FROM alert_observations WHERE rule = ?").run(rule);
        this.db.query("UPDATE alert_events SET acknowledged = 1 WHERE rule = ?").run(rule);
      }
    }).immediate();
  }
  claim(now: number): AlertEvent | null {
    return this.db.transaction(() => {
      const event = this.db.query<AlertEvent, [number, number]>(
        "SELECT * FROM alert_events WHERE acknowledged = 0 AND nextAt <= ? AND leaseUntil <= ? ORDER BY nextAt, id LIMIT 1",
      ).get(now, now);
      if (event) {
        event.leaseToken = crypto.randomUUID();
        this.db.query("UPDATE alert_events SET leaseUntil = ?, leaseToken = ? WHERE id = ?")
          .run(now + 30_000, event.leaseToken, event.id);
      }
      return event;
    }).immediate();
  }
  delivered(event: AlertEvent, now: number): void {
    this.db.query(`UPDATE alert_events SET deliveries = deliveries + 1, nextAt = ?, leaseUntil = 0,
      error = NULL, acknowledged = CASE WHEN notify = 'once' THEN 1 ELSE acknowledged END WHERE id = ? AND leaseToken = ?`)
      .run(now + 25_000, event.id, event.leaseToken ?? "");
  }
  failed(event: AlertEvent, now: number, error: string): void {
    this.db.query("UPDATE alert_events SET nextAt = ?, leaseUntil = 0, error = ? WHERE id = ? AND leaseToken = ?")
      .run(now + 10_000, error, event.id, event.leaseToken ?? "");
  }
  pending(): AlertEvent[] {
    return this.db.query<AlertEvent, []>("SELECT * FROM alert_events WHERE acknowledged = 0 ORDER BY id").all();
  }
  recent(): AlertEvent[] {
    return this.db.query<AlertEvent, []>("SELECT * FROM alert_events ORDER BY id DESC LIMIT 50").all();
  }
}
