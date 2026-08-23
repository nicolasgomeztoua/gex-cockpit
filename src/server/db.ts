import { Database } from "bun:sqlite";
import type { FeedSnapshot, Ticker } from "../shared/types";

export const DB_PATH = process.env.DB_PATH ?? "data/gex-cockpit.db";

const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    feed        TEXT    NOT NULL,
    provider_ts INTEGER NOT NULL,
    fetched_at  INTEGER NOT NULL,
    spot        REAL    NOT NULL,
    payload     TEXT    NOT NULL,
    PRIMARY KEY (feed, provider_ts)
  );
  CREATE TABLE IF NOT EXISTS spot_ticks (
    ticker TEXT    NOT NULL,
    ts     INTEGER NOT NULL,
    spot   REAL    NOT NULL,
    PRIMARY KEY (ticker, ts)
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const insertSnapshotStmt = db.prepare(
  `INSERT OR IGNORE INTO snapshots (feed, provider_ts, fetched_at, spot, payload)
   VALUES (?, ?, ?, ?, ?)`,
);
const insertTickStmt = db.prepare(
  `INSERT OR IGNORE INTO spot_ticks (ticker, ts, spot) VALUES (?, ?, ?)`,
);
const spotHistoryStmt = db.prepare(
  `SELECT ts, spot FROM spot_ticks WHERE ticker = ? AND ts >= ? ORDER BY ts`,
);
const zgHistoryStmt = db.prepare(
  `SELECT provider_ts AS ts, json_extract(payload, '$.majors.zeroGamma') AS zg
   FROM snapshots WHERE feed = ? AND provider_ts >= ? AND zg IS NOT NULL
   ORDER BY provider_ts`,
);

export function persistSnapshot(s: FeedSnapshot): void {
  insertSnapshotStmt.run(s.feed, s.providerTs, s.fetchedAt, s.spot, JSON.stringify(s));
  insertTickStmt.run(s.ticker, s.providerTs, s.spot);
}

/** Spot ticks for the last 24h — covers the current session plus context. */
export function spotHistory(ticker: Ticker): [number, number][] {
  const sinceSec = Math.floor(Date.now() / 1000) - 24 * 3600;
  const rows = spotHistoryStmt.all(ticker, sinceSec) as { ts: number; spot: number }[];
  return rows.map(r => [r.ts, r.spot]);
}

/** Zero-gamma level over the last 24h, from the persisted classic snapshots. */
export function zgHistory(ticker: Ticker): [number, number][] {
  const sinceSec = Math.floor(Date.now() / 1000) - 24 * 3600;
  const rows = zgHistoryStmt.all(`${ticker}:oi`, sinceSec) as { ts: number; zg: number }[];
  return rows.map(r => [r.ts, r.zg]);
}

const getSettingsStmt = db.prepare(`SELECT value FROM app_settings WHERE key = 'client'`);
const putSettingsStmt = db.prepare(
  `INSERT INTO app_settings (key, value, updated_at) VALUES ('client', ?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
);

/** Stored client settings JSON, or null if none saved yet. */
export function loadClientSettings(): unknown {
  const row = getSettingsStmt.get() as { value: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function saveClientSettings(json: string): void {
  putSettingsStmt.run(json, Date.now());
}

export interface StoredSnapshot {
  providerTs: number;
  snapshot: FeedSnapshot;
}

export function storedSnapshots(): StoredSnapshot[] {
  const rows = db
    .query(`SELECT provider_ts, payload FROM snapshots ORDER BY provider_ts, feed`)
    .all() as { provider_ts: number; payload: string }[];
  return rows.map(row => ({
    providerTs: row.provider_ts,
    snapshot: JSON.parse(row.payload) as FeedSnapshot,
  }));
}

export function storedSpotTicks(): { ticker: Ticker; ts: number; spot: number }[] {
  return db
    .query(`SELECT ticker, ts, spot FROM spot_ticks ORDER BY ts, ticker`)
    .all() as { ticker: Ticker; ts: number; spot: number }[];
}
