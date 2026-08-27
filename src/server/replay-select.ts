/**
 * Pure session-selection helpers for replay mode: which stored rows belong to a
 * requested 09:30–16:00 New York RTH session. Kept free of any DB or runtime
 * import so the boundary arithmetic is unit-testable on its own.
 */

export {
  etDate,
  isAtOrAfterMarketOpen,
  isInRthSession,
  rthSessionBounds,
  selectLiveSessionDate,
} from "../shared/session";
import { etDate, isInRthSession, rthSessionBounds } from "../shared/session";

/** Every New York RTH session present in the stored snapshots, ascending. */
export function availableDates(rows: { providerTs: number }[]): string[] {
  return [
    ...new Set(
      rows
        .filter(row => isInRthSession(row.providerTs))
        .map(row => etDate(row.providerTs)),
    ),
  ].sort();
}

/** Snapshots recorded inside `date`'s inclusive New York RTH window. */
export function selectSessionEvents<T extends { providerTs: number }>(
  rows: T[],
  date: string,
): T[] {
  const { startTs, endTs } = rthSessionBounds(date);
  return rows.filter(row => row.providerTs >= startTs && row.providerTs <= endTs);
}

/** Spot ticks recorded inside `date`'s inclusive New York RTH window. */
export function selectSessionTicks<T extends { ts: number }>(rows: T[], date: string): T[] {
  const { startTs, endTs } = rthSessionBounds(date);
  return rows.filter(row => row.ts >= startTs && row.ts <= endTs);
}
