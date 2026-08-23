import { Database } from "bun:sqlite";
import { join } from "node:path";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { appSettings, snapshots, spotTicks } from "./schema";
import type { FeedSnapshot, Ticker } from "../shared/types";

export const DB_PATH = process.env.DB_PATH ?? "data/gex-cockpit.db";

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");

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
  db.insert(spotTicks)
    .values({ ticker: s.ticker, ts: s.providerTs, spot: s.spot })
    .onConflictDoNothing()
    .run();
}

/** Spot ticks for the last 24h — covers the current session plus context. */
export function spotHistory(ticker: Ticker): [number, number][] {
  const sinceSec = Math.floor(Date.now() / 1000) - 24 * 3600;
  const rows = db
    .select({ ts: spotTicks.ts, spot: spotTicks.spot })
    .from(spotTicks)
    .where(and(eq(spotTicks.ticker, ticker), gte(spotTicks.ts, sinceSec)))
    .orderBy(asc(spotTicks.ts))
    .all();
  return rows.map(r => [r.ts, r.spot]);
}

/** Zero-gamma level over the last 24h, from the persisted classic snapshots. */
export function zgHistory(ticker: Ticker): [number, number][] {
  const sinceSec = Math.floor(Date.now() / 1000) - 24 * 3600;
  const rows = db
    .select({ ts: snapshots.providerTs, zg: zeroGammaJson })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.feed, `${ticker}:oi`),
        gte(snapshots.providerTs, sinceSec),
        sql`${zeroGammaJson} IS NOT NULL`,
      ),
    )
    .orderBy(asc(snapshots.providerTs))
    .all();
  return rows.map(r => [r.ts, r.zg]);
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

export function storedSnapshots(): StoredSnapshot[] {
  const rows = db
    .select({ providerTs: snapshots.providerTs, payload: snapshots.payload })
    .from(snapshots)
    .orderBy(asc(snapshots.providerTs), asc(snapshots.feed))
    .all();
  return rows.map(row => ({
    providerTs: row.providerTs,
    snapshot: JSON.parse(row.payload) as FeedSnapshot,
  }));
}

export function storedSpotTicks(): { ticker: Ticker; ts: number; spot: number }[] {
  return db
    .select({ ticker: spotTicks.ticker, ts: spotTicks.ts, spot: spotTicks.spot })
    .from(spotTicks)
    .orderBy(asc(spotTicks.ts), asc(spotTicks.ticker))
    .all() as { ticker: Ticker; ts: number; spot: number }[];
}
