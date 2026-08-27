import { Database } from "bun:sqlite";
import type { FeedKind, FeedSnapshot, StrikeRow, Ticker } from "../src/shared/types";
import { rthSessionBounds } from "../src/shared/session";

const path = "/tmp/replay-fixture.db";
const db = new Database(path, { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  DROP TABLE IF EXISTS snapshots;
  DROP TABLE IF EXISTS spot_ticks;
  DROP TABLE IF EXISTS app_settings;
  CREATE TABLE snapshots (
    feed        TEXT    NOT NULL,
    provider_ts INTEGER NOT NULL,
    fetched_at  INTEGER NOT NULL,
    spot        REAL    NOT NULL,
    payload     TEXT    NOT NULL,
    PRIMARY KEY (feed, provider_ts)
  );
  CREATE TABLE spot_ticks (
    ticker TEXT    NOT NULL,
    ts     INTEGER NOT NULL,
    spot   REAL    NOT NULL,
    PRIMARY KEY (ticker, ts)
  );
  CREATE TABLE app_settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const insertSnapshot = db.prepare(
  `INSERT INTO snapshots (feed, provider_ts, fetched_at, spot, payload) VALUES (?, ?, ?, ?, ?)`,
);
const insertTick = db.prepare(`INSERT INTO spot_ticks (ticker, ts, spot) VALUES (?, ?, ?)`);

let seed = 0x1234abcd;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0x1_0000_0000;
};

const normal = () => {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function nearest(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function snapshot(ticker: Ticker, kind: FeedKind, ts: number, spot: number, step: number): FeedSnapshot {
  const increment = ticker === "NDX" ? 25 : 1;
  const center = nearest(spot, increment);
  const strikes: StrikeRow[] = [];
  for (let i = -20; i < 20; i++) {
    const strike = center + i * increment;
    const distance = Math.abs(i) / 20;
    const wave = Math.sin(i * 0.7 + step * 0.08);
    const vol = (1 - distance * 0.65) * 1_000_000 * wave;
    const oi = kind === "oi" ? (1 - distance * 0.55) * 1_300_000 * Math.cos(i * 0.55 - step * 0.05) : 0;
    const priors = [1, 5, 10, 15, 30].map(minutes => vol * (1 - minutes * 0.002 + 0.015 * normal()));
    if (kind === "gamma") {
      const callIvol = 0.18 + distance * 0.08 + 0.01 * Math.max(0, wave);
      const putIvol = 0.18 + distance * 0.09 + 0.01 * Math.max(0, -wave);
      strikes.push([strike, callIvol, putIvol, priors.slice(0, 3), vol / 1_000_000]);
    } else {
      strikes.push([strike, vol, oi, priors]);
    }
  }

  const zeroGamma = kind === "oi" ? spot - 20 * increment + Math.sin(step / 22) * 3 * increment : null;
  return {
    feed: `${ticker}:${kind}`,
    ticker,
    kind,
    aggregation: "zero",
    providerTs: ts,
    fetchedAt: ts * 1000 + 75,
    spot,
    majors: {
      posVol: nearest(spot + 4 * increment, increment),
      negVol: nearest(spot - 4 * increment, increment),
      posOI: kind === "oi" ? nearest(spot + 7 * increment, increment) : 0,
      negOI: kind === "oi" ? nearest(spot - 7 * increment, increment) : 0,
      zeroGamma,
    },
    netGexVol: strikes.reduce((sum, row) => sum + row[1], 0),
    netGexOI: strikes.reduce((sum, row) => sum + row[2], 0),
    minDte: 0,
    strikes,
    status: "live",
  };
}

const fixtureDate = process.env.REPLAY_FIXTURE_DATE ?? "2024-01-03";
const startTs = rthSessionBounds(fixtureDate).startTs;
let ndx = 16_650;
let qqq = 402;

const seedFixture = db.transaction(() => {
  for (let step = 0; step <= 180; step++) {
    const ts = startTs + step * 10;
    ndx += 1.8 * normal() + Math.sin(step / 18) * 0.8;
    qqq += 0.07 * normal() + Math.sin(step / 20) * 0.025;
    for (const [ticker, spot] of [
      ["NDX", ndx],
      ["QQQ", qqq],
    ] as const) {
      insertTick.run(ticker, ts, spot);
      for (const kind of ["state", "gamma", "oi"] as const) {
        const snap = snapshot(ticker, kind, ts, spot, step);
        insertSnapshot.run(snap.feed, snap.providerTs, snap.fetchedAt, snap.spot, JSON.stringify(snap));
      }
    }
  }
});

seedFixture();
db.close();
console.log(`seeded ${path}: 1,086 snapshots, 362 spot ticks, ${fixtureDate} 09:30–10:00 ET`);
