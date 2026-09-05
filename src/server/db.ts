import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { appSettings, snapshots, spotTicks } from "./schema";
import type { FeedSnapshot, Ticker } from "../shared/types";
import {
  etDate,
  isAtOrAfterMarketOpen,
  isInRthSession,
  rthSessionBounds,
} from "../shared/session";

export const DB_PATH = process.env.DB_PATH ?? "data/gex-cockpit.db";

if (DB_PATH !== ":memory:") mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");

export const db = drizzle(sqlite, { schema: { appSettings, snapshots, spotTicks } });

// Resolved off this module, not the cwd, so probes and one-off scripts can boot
// the server from anywhere. The baseline migration is IF NOT EXISTS, so a
// pre-migrations database picks up only the bookkeeping table and keeps its rows.
migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

/**
 * Zero gamma lives inside `majors` in current snapshots. Early local database
 * rows stored it at the top level, so read both shapes without rewriting data.
 */
const zeroGammaJson = sql<number>`coalesce(
  json_extract(${snapshots.payload}, '$.majors.zeroGamma'),
  json_extract(${snapshots.payload}, '$.zeroGamma')
)`;

export function persistSnapshot(s: FeedSnapshot): void {
  db.insert(snapshots)
    .values({
      feed: s.feed,
      providerTs: s.providerTs,
      fetchedAt: s.fetchedAt,
      spot: s.spot,
      payload: JSON.stringify(s),
    })
    .onConflictDoNothing()
    .run();
  // State is the canonical spot sample. Gamma and Classic responses carry the
  // same underlying price, but arrive with nearby timestamps and would create
  // duplicate-looking ticks in the chart history.
  if (s.kind === "state") {
    db.insert(spotTicks)
      .values({ ticker: s.ticker, ts: s.providerTs, spot: s.spot })
      .onConflictDoNothing()
      .run();
  }
}

const firstRthRow = <T extends { ts: number }>(rows: T[]): T | undefined =>
  rows.find(row => isInRthSession(row.ts));

/**
 * Spot ticks for one New York RTH session. After 09:30 ET this is today when
 * available; before the open (or without today's RTH data) it is the latest
 * prior recorded RTH session.
 */
export function spotHistory(ticker: Ticker, nowSec = Math.floor(Date.now() / 1000)): [number, number][] {
  const today = etDate(nowSec);
  const todayBounds = rthSessionBounds(today);
  const currentAnchor = isAtOrAfterMarketOpen(nowSec)
    ? db
      .select({ ts: spotTicks.ts })
      .from(spotTicks)
      .where(
        and(
          eq(spotTicks.ticker, ticker),
          gte(spotTicks.ts, todayBounds.startTs),
          lte(spotTicks.ts, todayBounds.endTs),
        ),
      )
      .orderBy(desc(spotTicks.ts))
      .limit(1)
      .get()
    : undefined;
  const priorAnchor = firstRthRow(db
    .select({ ts: spotTicks.ts })
    .from(spotTicks)
    .where(and(eq(spotTicks.ticker, ticker), lt(spotTicks.ts, todayBounds.startTs)))
    .orderBy(desc(spotTicks.ts))
    .all());
  const fallbackAnchor = firstRthRow(db
    .select({ ts: spotTicks.ts })
    .from(spotTicks)
    .where(eq(spotTicks.ticker, ticker))
    .orderBy(desc(spotTicks.ts))
    .all());
  const anchor = currentAnchor ?? priorAnchor ?? fallbackAnchor;
  if (!anchor) return [];
  const sessionBounds = rthSessionBounds(etDate(anchor.ts));
  const rows = db
    .select({ ts: spotTicks.ts, spot: spotTicks.spot })
    .from(spotTicks)
    .where(
      and(
        eq(spotTicks.ticker, ticker),
        gte(spotTicks.ts, sessionBounds.startTs),
        lte(spotTicks.ts, sessionBounds.endTs),
      ),
    )
    .orderBy(asc(spotTicks.ts))
    .all();
  return rows.map(row => [row.ts, row.spot]);
}

/** Zero-gamma history for the same single-RTH-session policy as spot history. */
export function zgHistory(ticker: Ticker, nowSec = Math.floor(Date.now() / 1000)): [number, number][] {
  const today = etDate(nowSec);
  const todayBounds = rthSessionBounds(today);
  const currentAnchor = isAtOrAfterMarketOpen(nowSec)
    ? db
      .select({ ts: snapshots.providerTs })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.feed, `${ticker}:oi`),
          gte(snapshots.providerTs, todayBounds.startTs),
          lte(snapshots.providerTs, todayBounds.endTs),
        ),
      )
      .orderBy(desc(snapshots.providerTs))
      .limit(1)
      .get()
    : undefined;
  const priorAnchor = firstRthRow(db
    .select({ ts: snapshots.providerTs })
    .from(snapshots)
    .where(and(eq(snapshots.feed, `${ticker}:oi`), lt(snapshots.providerTs, todayBounds.startTs)))
    .orderBy(desc(snapshots.providerTs))
    .all());
  const fallbackAnchor = firstRthRow(db
    .select({ ts: snapshots.providerTs })
    .from(snapshots)
    .where(eq(snapshots.feed, `${ticker}:oi`))
    .orderBy(desc(snapshots.providerTs))
    .all());
  const anchor = currentAnchor ?? priorAnchor ?? fallbackAnchor;
  if (!anchor) return [];
  const sessionBounds = rthSessionBounds(etDate(anchor.ts));
  const rows = db
    .select({ ts: snapshots.providerTs, zg: zeroGammaJson })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.feed, `${ticker}:oi`),
        gte(snapshots.providerTs, sessionBounds.startTs),
        lte(snapshots.providerTs, sessionBounds.endTs),
        sql`${zeroGammaJson} IS NOT NULL`,
      ),
    )
    .orderBy(asc(snapshots.providerTs))
    .all();
  return rows.map(row => [row.ts, row.zg]);
}

/** Stored client settings JSON, or null if none saved yet. */
export function loadClientSettings(): unknown {
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "client"))
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function saveClientSettings(json: string): void {
  db.insert(appSettings)
    .values({ key: "client", value: json, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` },
    })
    .run();
}

export interface StoredSnapshot {
  providerTs: number;
  snapshot: FeedSnapshot;
}

export function storedSnapshots(startTs?: number, endTs?: number): StoredSnapshot[] {
  const range = startTs === undefined
    ? ""
    : endTs === undefined
      ? " WHERE provider_ts >= ?"
      : " WHERE provider_ts >= ? AND provider_ts <= ?";
  const rows = sqlite
    .query(`SELECT provider_ts, payload FROM snapshots${range} ORDER BY provider_ts, feed`)
    .all(...(startTs === undefined ? [] : endTs === undefined ? [startTs] : [startTs, endTs])) as {
      provider_ts: number;
      payload: string;
    }[];
  return rows.map(row => ({
    providerTs: row.provider_ts,
    snapshot: JSON.parse(row.payload) as FeedSnapshot,
  }));
}

/** Provider timestamps only, used to inventory replay sessions without parsing payload JSON. */
export function storedSnapshotTimes(): number[] {
  return (sqlite.query("SELECT provider_ts FROM snapshots ORDER BY provider_ts").all() as {
    provider_ts: number;
  }[]).map(row => row.provider_ts);
}

/** Most recently persisted snapshot per feed, for an immediate last-good boot state. */
export function latestStoredSnapshots(): FeedSnapshot[] {
  const rows = sqlite.query(`
    SELECT current.payload
    FROM snapshots AS current
    INNER JOIN (
      SELECT feed, MAX(provider_ts) AS provider_ts
      FROM snapshots
      GROUP BY feed
    ) AS latest
      ON current.feed = latest.feed AND current.provider_ts = latest.provider_ts
    ORDER BY current.feed
  `).all() as { payload: string }[];
  return rows.map(row => JSON.parse(row.payload) as FeedSnapshot);
}

export function storedSpotTicks(startTs?: number, endTs?: number): { ticker: Ticker; ts: number; spot: number }[] {
  const range = startTs === undefined
    ? ""
    : endTs === undefined
      ? " WHERE ts >= ?"
      : " WHERE ts >= ? AND ts <= ?";
  return sqlite
    .query(`SELECT ticker, ts, spot FROM spot_ticks${range} ORDER BY ts, ticker`)
    .all(...(startTs === undefined ? [] : endTs === undefined ? [startTs] : [startTs, endTs])) as {
      ticker: Ticker;
      ts: number;
      spot: number;
    }[];
}
