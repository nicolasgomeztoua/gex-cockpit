import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Mirrors the tables this app has always created by hand in db.ts. The shapes
 * are load-bearing: existing `data/gex-cockpit.db` files predate migrations, so
 * the baseline migration in drizzle/ is `CREATE TABLE IF NOT EXISTS` and must
 * stay byte-compatible with what those DBs already contain.
 */

/** One provider response per (feed, provider timestamp), payload = FeedSnapshot JSON. */
export const snapshots = sqliteTable(
  "snapshots",
  {
    feed: text("feed").notNull(),
    providerTs: integer("provider_ts").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
    spot: real("spot").notNull(),
    payload: text("payload").notNull(),
  },
  t => [primaryKey({ columns: [t.feed, t.providerTs] })],
);

/** Spot tape, one row per ticker per provider timestamp. */
export const spotTicks = sqliteTable(
  "spot_ticks",
  {
    ticker: text("ticker").notNull(),
    ts: integer("ts").notNull(),
    spot: real("spot").notNull(),
  },
  t => [primaryKey({ columns: [t.ticker, t.ts] })],
);

/** Key/value app state; the client settings blob lives under key = 'client'. */
export const appSettings = sqliteTable(
  "app_settings",
  {
    // The legacy table used `TEXT PRIMARY KEY` without an explicit NOT NULL.
    // A table-level PK preserves that exact SQLite column shape.
    key: text("key"),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  t => [primaryKey({ columns: [t.key] })],
);
