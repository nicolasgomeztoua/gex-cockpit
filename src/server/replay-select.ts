/**
 * Pure session-selection helpers for replay mode: which stored rows belong to a
 * requested trading date, judged in America/New_York. Kept free of any DB or
 * runtime import so the date arithmetic is unit-testable on its own.
 */

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `YYYY-MM-DD` of an epoch-second instant, in Eastern time. */
export function etDate(epochSec: number): string {
  const parts = dateFormatter.formatToParts(new Date(epochSec * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Every ET date present in the stored snapshots, ascending and deduped. */
export function availableDates(rows: { providerTs: number }[]): string[] {
  return [...new Set(rows.map(row => etDate(row.providerTs)))].sort();
}

/** Snapshots recorded on `date` (ET). */
export function selectSessionEvents<T extends { providerTs: number }>(
  rows: T[],
  date: string,
): T[] {
  return rows.filter(row => etDate(row.providerTs) === date);
}

/** Spot ticks recorded on `date` (ET). */
export function selectSessionTicks<T extends { ts: number }>(rows: T[], date: string): T[] {
  return rows.filter(row => etDate(row.ts) === date);
}
